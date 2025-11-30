
import { PagedResponse, OparlObject } from '../types';

const BASE_URL = 'https://buergerinfo.stadt-koeln.de/oparl/bodies/stadtverwaltung_koeln';

// Hard Limit: Nach dieser Zeit werden Daten definitiv gelöscht/neu geladen
const CACHE_TTL = 10 * 60 * 1000; // 10 Minuten

// Soft Limit: Nach dieser Zeit versuchen wir eine Revalidierung (304 check),
// wenn ETag/Last-Modified vorhanden sind.
const REVALIDATE_TTL = 2 * 60 * 1000; // 2 Minuten

const MAX_CACHE_SIZE = 200; // Limit number of cached items

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
        requestQueue.push({ resolve, reject, signal });
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
          try {
              await waitForTurn(); 

              const headers: HeadersInit = {};
              
              if (cached) {
                if (cached.etag) headers['If-None-Match'] = cached.etag;
                if (cached.lastModified) headers['If-Modified-Since'] = cached.lastModified;
              }

              const response = await fetch(url, { headers }).catch(err => {
                  // Catch network errors (offline, DNS issues)
                  throw new ApiError(0, 'Netzwerkfehler: Bitte überprüfen Sie Ihre Internetverbindung.');
              });
              
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

              const data = await response.json();
              
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
              releaseTurn();
              inflightRequests.delete(url);
          }
      })();
      
      inflightRequests.set(url, requestPromise);
  }

  if (signal) {
      return Promise.race([
          requestPromise,
          new Promise<T>((_, reject) => {
              signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
          })
      ]) as Promise<T>;
  }

  return requestPromise as Promise<T>;
}

export async function getList<T>(resource: string, params: URLSearchParams = new URLSearchParams(), signal?: AbortSignal): Promise<PagedResponse<T>> {
  const url = `${BASE_URL}/${resource}?${params.toString()}`;
  return fetchFromApi<PagedResponse<T>>(url, signal);
}

export async function getItem<T>(url: string, signal?: AbortSignal): Promise<T> {
  if(typeof url !== 'string') {
       throw new Error(`Invalid URL for getItem: expected string, got ${typeof url}`);
  }
  if(!url.startsWith('http')) {
      throw new Error(`Invalid URL for getItem: ${url}`);
  }
  return fetchFromApi<T>(url, signal);
}

export async function search<T>(resource: string, query: string, page: number = 1, signal?: AbortSignal): Promise<PagedResponse<T>> {
  const params = new URLSearchParams();
  if(query) params.set('q', query);
  params.set('page', page.toString());
  return getList<T>(resource, params, signal);
}
