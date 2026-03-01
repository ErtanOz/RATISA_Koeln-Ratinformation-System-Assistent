
import { PagedResponse, OparlObject } from '../types';

// Use relative URL so the Vite dev server proxy intercepts it and bypasses CORS.
// In production, configure your web server (nginx/etc.) to proxy /oparl/* similarly.
const BASE_URL = '/oparl/bodies/stadtverwaltung_koeln';

// Hard Limit: Nach dieser Zeit werden Daten definitiv gelöscht/neu geladen
const CACHE_TTL = 10 * 60 * 1000; // 10 Minuten

// Soft Limit: Nach dieser Zeit versuchen wir eine Revalidierung (304 check),
// wenn ETag/Last-Modified vorhanden sind.
const REVALIDATE_TTL = 2 * 60 * 1000; // 2 Minuten

const MAX_CACHE_SIZE = 200; // Limit number of cached items
const REQUEST_TIMEOUT_MS = 15_000;

interface CacheEntry<T> {
  data: T;
  fetchedAt: number; // Wann wurde der Request zuletzt erfolgreich (200 oder 304) abgeschlossen
  expiry: number;    // Wann läuft der Eintrag hart ab
  etag?: string;
  lastModified?: string;
}

const cache = new Map<string, CacheEntry<any>>();
const inflightRequests = new Map<string, Promise<any>>();

// Concurrency control
const MAX_CONCURRENT_REQUESTS = 5;
let activeRequests = 0;
const requestQueue: Array<{ resolve: () => void; reject: (reason?: any) => void; signal?: AbortSignal }> = [];

const processQueue = () => {
    if (activeRequests < MAX_CONCURRENT_REQUESTS && requestQueue.length > 0) {
        // Find the next request that hasn't been aborted yet
        const nextIndex = requestQueue.findIndex(item => !item.signal?.aborted);
        
        if (nextIndex !== -1) {
            const [next] = requestQueue.splice(nextIndex, 1);
            activeRequests++;
            next.resolve();
        } else {
            // Clean up aborted requests from the queue to prevent memory leaks
            requestQueue.length = 0;
        }
    }
};

const waitForTurn = (signal?: AbortSignal): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
        }
        // Add an event listener to reject the promise if the signal aborts while waiting in the queue
        const abortListener = () => {
            reject(new DOMException('Aborted', 'AbortError'));
            // Remove from queue if aborted while waiting
            const index = requestQueue.findIndex(item => item.signal === signal);
            if (index !== -1) {
                requestQueue.splice(index, 1);
            }
        };
        signal?.addEventListener('abort', abortListener, { once: true });

        requestQueue.push({ resolve: () => {
            signal?.removeEventListener('abort', abortListener);
            resolve();
        }, reject: (reason) => {
            signal?.removeEventListener('abort', abortListener);
            reject(reason);
        }, signal });
        processQueue();
    });
};

const releaseTurn = () => {
    activeRequests--;
    processQueue();
};

// Basic Least Recently Used (LRU) pruning
function pruneCache() {
  if (cache.size > MAX_CACHE_SIZE) {
    // Delete oldest entries based on fetch time
    const entries = Array.from(cache.entries());
    entries.sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
    
    // Remove oldest 20
    for (let i = 0; i < 20 && i < entries.length; i++) {
        cache.delete(entries[i][0]);
    }
  }
}

function isPagedResponse(data: any): data is PagedResponse<any> {
    return data && Array.isArray(data.data) && typeof data.pagination === 'object';
}

function isOparlObject(item: any): item is OparlObject {
    return item && typeof item.id === 'string';
}

// Custom Error Class to better handle specific API issues
export class ApiError extends Error {
    status: number;
    statusText: string;

    constructor(status: number, statusText: string) {
        super(status === 0 ? statusText : `API Error: ${status} ${statusText}`);
        this.status = status;
        this.statusText = statusText;
        this.name = 'ApiError';
    }
}

function createRequestSignal(signal?: AbortSignal) {
    const requestController = new AbortController();
    let timedOut = false;

    const timeoutId = setTimeout(() => {
        timedOut = true;
        requestController.abort();
    }, REQUEST_TIMEOUT_MS);

    const abortParent = () => requestController.abort();
    signal?.addEventListener('abort', abortParent, { once: true });

    return {
        signal: requestController.signal,
        didTimeout: () => timedOut,
        cleanup: () => {
            clearTimeout(timeoutId);
            signal?.removeEventListener('abort', abortParent);
        },
    };
}

async function parseApiJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type')?.toLowerCase() || '';
  const bodyText = await response.text();
  try {
      return JSON.parse(bodyText) as T;
  } catch {
      const preview = bodyText.trimStart().slice(0, 120).toLowerCase();
      if (preview.startsWith('<!doctype') || preview.startsWith('<html')) {
          throw new ApiError(
              0,
              'Ungültige API-Antwort: HTML statt JSON. Prüfen Sie die Proxy-/Redirect-Regel für /oparl/*.',
          );
      }
      if (contentType.includes('application/json')) {
          throw new ApiError(0, 'Ungültige API-Antwort: JSON konnte nicht geparst werden.');
      }
      throw new ApiError(
          0,
          `Ungültige API-Antwort: JSON erwartet, erhalten: ${contentType || 'unknown'}.`,
      );
  }
}

export async function fetchFromApi<T>(url: string, signal?: AbortSignal): Promise<T> {
  const now = Date.now();
  const cached = cache.get(url);

  // 1. Check Abort Signal immediately
  if (signal?.aborted) {
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }

  // 2. Smart Caching Strategy
  if (cached) {
      const age = now - cached.fetchedAt;
      const isFresh = age < REVALIDATE_TTL;
      const hasValidation = cached.etag || cached.lastModified;

      if (isFresh) {
          return Promise.resolve(cached.data as T);
      }

      if (now < cached.expiry && !hasValidation) {
           return Promise.resolve(cached.data as T);
      }
  }

  // 3. Request Deduplication
  let requestPromise = inflightRequests.get(url);
  
  if (!requestPromise) {
      requestPromise = (async () => {
          let acquiredTurn = false;
          try {
              await waitForTurn(signal); 
              acquiredTurn = true;

              const headers: HeadersInit = {};
              
              if (cached) {
                if (cached.etag) headers['If-None-Match'] = cached.etag;
                if (cached.lastModified) headers['If-Modified-Since'] = cached.lastModified;
              }

              const requestContext = createRequestSignal(signal);
              const response = await (async () => {
                  try {
                      return await fetch(url, { headers, signal: requestContext.signal }).catch(err => {
                          if (err.name === 'AbortError') {
                              if (signal?.aborted) {
                                  throw err;
                              }
                              if (requestContext.didTimeout()) {
                                  throw new ApiError(0, `Zeitüberschreitung nach ${REQUEST_TIMEOUT_MS / 1000} Sekunden.`);
                              }
                              throw err;
                          }
                          throw new ApiError(0, 'Netzwerkfehler: Bitte überprüfen Sie Ihre Internetverbindung.');
                      });
                  } finally {
                      requestContext.cleanup();
                  }
              })();
              
              if (response.status === 304 && cached) {
                  cached.fetchedAt = Date.now();
                  cached.expiry = Date.now() + CACHE_TTL;
                  cache.delete(url);
                  cache.set(url, cached);
                  return cached.data;
              }

              if (!response.ok) {
                  // Map HTTP status codes to user friendly messages where possible
                  let msg = response.statusText;
                  if (response.status === 404) msg = 'Ressource nicht gefunden.';
                  if (response.status === 500) msg = 'Interner Serverfehler.';
                  if (response.status === 503) msg = 'Dienst nicht verfügbar.';
                  
                  throw new ApiError(response.status, msg);
              }

              const data = await parseApiJson<T>(response);
              
              const entry: CacheEntry<T> = {
                  data,
                  fetchedAt: Date.now(),
                  expiry: Date.now() + CACHE_TTL,
                  etag: response.headers.get('ETag') || undefined,
                  lastModified: response.headers.get('Last-Modified') || undefined
              };

              pruneCache();
              cache.set(url, entry);

              if (isPagedResponse(data)) {
                  data.data.forEach((item) => {
                      if (isOparlObject(item)) {
                          cache.set(item.id, {
                              data: item,
                              fetchedAt: Date.now(),
                              expiry: Date.now() + CACHE_TTL
                          });
                      }
                  });
              }

              return data;
          } catch (error) {
             throw error; 
          } finally {
              if (acquiredTurn) {
                  releaseTurn();
              }
              inflightRequests.delete(url);
          }
      })();
      
      inflightRequests.set(url, requestPromise);
  }

  if (signal) {
      return Promise.race([
          requestPromise,
          new Promise<T>((_, reject) => {
              signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
          })
      ]) as Promise<T>;
  }

  return requestPromise as Promise<T>;
}


// The OParl Köln API only supports `page` and `limit`.
// All other params (q, sort, minDate, maxDate, etc.) are silently ignored.
// We strip them here so that filtering happens client-side.
const API_SUPPORTED_PARAMS = new Set(['page', 'limit']);

function toApiUrl(resource: string, params: URLSearchParams): string {
    const cleanParams = new URLSearchParams();
    params.forEach((value, key) => {
        if (API_SUPPORTED_PARAMS.has(key)) cleanParams.set(key, value);
    });
    return `${BASE_URL}/${resource}?${cleanParams.toString()}`;
}

export async function getList<T>(resource: string, params: URLSearchParams = new URLSearchParams(), signal?: AbortSignal): Promise<PagedResponse<T>> {
  const url = toApiUrl(resource, params);
  return fetchFromApi<PagedResponse<T>>(url, signal);
}

/**
 * Fetches up to `limit` (default 200) items in one call for client-side filtering.
 * The API ignores filter params (q, minDate, etc.), so we always fetch all and filter locally.
 */
export async function getListAll<T>(resource: string, signal?: AbortSignal, limit = 200): Promise<T[]> {
    const url = `${BASE_URL}/${resource}?limit=${limit}`;
    const result = await fetchFromApi<PagedResponse<T>>(url, signal);
    return result.data;
}

export async function getItem<T>(url: string, signal?: AbortSignal): Promise<T> {
  if(typeof url !== 'string') {
       throw new Error(`Invalid URL for getItem: expected string, got ${typeof url}`);
  }
  if(!url.startsWith('http') && !url.startsWith('/')) {
      throw new Error(`Invalid URL for getItem: ${url}`);
  }
  // Rewrite absolute OParl URLs to relative for Vite proxy (bypasses CORS in dev)
  const proxyUrl = url.replace('https://buergerinfo.stadt-koeln.de', '');
  return fetchFromApi<T>(proxyUrl, signal);
}

export async function search<T>(resource: string, _query: string, page: number = 1, signal?: AbortSignal): Promise<PagedResponse<T>> {
  const params = new URLSearchParams();
  params.set('page', page.toString());
  return getList<T>(resource, params, signal);
}
