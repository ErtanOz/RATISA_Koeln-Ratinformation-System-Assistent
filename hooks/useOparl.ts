
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getList, getItem } from '../services/oparlApiService';
import { PagedResponse } from '../types';

export function useOparlList<T>(resource: string, params?: URLSearchParams) {
  const [data, setData] = useState<PagedResponse<T> | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Create a stable, sorted string representation of params to use as a dependency
  // sorting ensures that param order doesn't affect caching or trigger refetches
  const paramsString = useMemo(() => {
    if (!params) return '';
    const p = new URLSearchParams(params);
    p.sort();
    return p.toString();
  }, [params]);

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    // 1. Abort any previous running request immediately
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    
    // 2. Create new controller
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const currentParams = new URLSearchParams(paramsString);
      const result = await getList<T>(resource, currentParams, controller.signal);
      
      // 3. Only update state if this request wasn't aborted
      if (!controller.signal.aborted) {
          setData(result);
          setIsLoading(false);
      }
    } catch (e) {
      // 4. Handle errors, ignoring AbortErrors
      if (e instanceof DOMException && e.name === 'AbortError') {
          return;
      }
      if (!controller.signal.aborted) {
          console.error(`Failed to fetch ${resource}:`, e);
          setError(e as Error);
          setIsLoading(false);
      }
    }
  }, [resource, paramsString]);

  useEffect(() => {
    fetchData();
    
    // Cleanup function: abort on unmount or dependency change
    return () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    };
  }, [fetchData]);

  return { 
    data, 
    isLoading, 
    error, 
    refetch: fetchData 
  };
}

export function useOparlItem<T>(url: string | undefined | null) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const fetchData = useCallback(async () => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }

    if (!url) {
      setIsLoading(false);
      setData(null);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);
    
    try {
      const result = await getItem<T>(url, controller.signal);
      if (!controller.signal.aborted) {
          setData(result);
          setIsLoading(false);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      
      if (!controller.signal.aborted) {
          console.error(`Failed to fetch item ${url}:`, e);
          setError(e as Error);
          setIsLoading(false);
      }
    }
  }, [url]);

  useEffect(() => {
    fetchData();
    return () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    };
  }, [fetchData]);

  return { data, isLoading, error };
}
