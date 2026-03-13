import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearAtlasDataCache, loadKoelnDistricts } from './atlasService';

describe('atlasService StrictMode resilience', () => {
  afterEach(() => {
    clearAtlasDataCache();
    vi.unstubAllGlobals();
  });

  it('keeps district loading usable when the first caller aborts during a double-mount flow', async () => {
    const payload = { type: 'FeatureCollection', features: [] };
    let resolveFetch: (() => void) | null = null;

    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise((resolve, reject) => {
          const signal = init?.signal as AbortSignal | undefined;
          if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }

          signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );

          resolveFetch = () =>
            resolve({
              ok: true,
              json: async () => payload,
            } satisfies Partial<Response>);
        });
      }),
    );

    const firstController = new AbortController();
    const firstRequest = loadKoelnDistricts(firstController.signal);
    firstController.abort();

    const secondRequest = loadKoelnDistricts(new AbortController().signal);
    resolveFetch?.();

    await expect(secondRequest).resolves.toEqual(payload);
    await expect(firstRequest).resolves.toEqual(payload);
  });
});
