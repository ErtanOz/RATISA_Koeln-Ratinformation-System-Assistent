import { useCallback, useEffect, useRef, useState } from 'react';
import { Meeting, AtlasArchiveIndexMetadata, AtlasDistrictFeatureCollection, AtlasMeetingRecord } from '../types';
import { getListSnapshot } from '../services/oparlApiService';
import {
  createAtlasMatcher,
  loadAtlasArchiveIndex,
  loadKoelnDistricts,
  loadKoelnSpatialLexicon,
  mapMeetingToAtlasRecord,
  mergeAtlasRecords,
} from '../services/atlasService';

interface AtlasDataState {
  districts: AtlasDistrictFeatureCollection | null;
  records: AtlasMeetingRecord[];
  metadata: AtlasArchiveIndexMetadata | null;
  loading: boolean;
  error: Error | null;
  liveDataWarning: string | null;
}

const LIVE_DATA_WARNING_PREFIX =
  'Live-Sitzungen konnten nicht geladen werden. Der Atlas zeigt aktuell nur Archivdaten.';

function formatLiveDataWarning(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : '';
  return message ? `${LIVE_DATA_WARNING_PREFIX} Grund: ${message}` : LIVE_DATA_WARNING_PREFIX;
}

export function useAtlasData() {
  const [state, setState] = useState<AtlasDataState>({
    districts: null,
    records: [],
    metadata: null,
    loading: true,
    error: null,
    liveDataWarning: null,
  });
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState((current) => ({
      ...current,
      loading: true,
      error: null,
      liveDataWarning: null,
    }));

    try {
      const liveMeetingsPromise = getListSnapshot<Meeting>('meetings', controller.signal)
        .then((meetings) => ({ meetings, error: null as unknown }))
        .catch((error: unknown) => ({ meetings: null as Meeting[] | null, error }));

      const lexiconPromise = loadKoelnSpatialLexicon(controller.signal)
        .then((loadedLexicon) => ({ lexicon: loadedLexicon, error: null as unknown }))
        .catch((error: unknown) => ({ lexicon: null as ReturnType<typeof createAtlasMatcher> | null, error }));

      const [districts, archiveIndex] = await Promise.all([
        loadKoelnDistricts(controller.signal),
        loadAtlasArchiveIndex(controller.signal),
      ]);

      if (controller.signal.aborted) return;

      setState({
        districts,
        records: archiveIndex.items,
        metadata: archiveIndex.metadata,
        loading: false,
        error: null,
        liveDataWarning: null,
      });

      const lexiconResult = await lexiconPromise;
      if (controller.signal.aborted) return;

      const liveResult = await liveMeetingsPromise;
      if (controller.signal.aborted) return;

      if (lexiconResult.error || liveResult.error) {
        const fallbackError = lexiconResult.error || liveResult.error;
        if (fallbackError instanceof DOMException && fallbackError.name === 'AbortError') {
          return;
        }

        setState((current) => ({
          ...current,
          liveDataWarning: formatLiveDataWarning(fallbackError),
        }));
        return;
      }

      const matcher = createAtlasMatcher(lexiconResult.lexicon as any);
      const liveRecords = (liveResult.meetings || []).map((meeting) =>
        mapMeetingToAtlasRecord(meeting, matcher),
      );

      setState({
        districts,
        records: mergeAtlasRecords([...archiveIndex.items, ...liveRecords]),
        metadata: archiveIndex.metadata,
        loading: false,
        error: null,
        liveDataWarning: null,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (controller.signal.aborted) return;
      setState({
        districts: null,
        records: [],
        metadata: null,
        loading: false,
        error: error as Error,
        liveDataWarning: null,
      });
    }
  }, []);

  useEffect(() => {
    void fetchData();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [fetchData]);

  return {
    districts: state.districts,
    records: state.records,
    metadata: state.metadata,
    loading: state.loading,
    error: state.error,
    liveDataWarning: state.liveDataWarning,
    refetch: fetchData,
  };
}
