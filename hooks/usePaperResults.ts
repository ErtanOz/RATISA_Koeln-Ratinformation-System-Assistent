import { useEffect, useMemo, useRef, useState } from 'react';
import { AgendaItem, Consultation, Paper } from '../types';
import { getItem } from '../services/oparlApiService';

type ResultMap = Record<string, string>;
type PaperResultSource = Pick<Paper, 'id' | 'consultation'>;

const isConsultationObject = (c: string | Consultation): c is Consultation =>
  typeof c === 'object' && c !== null && typeof (c as Consultation).id === 'string';

const isAgendaItemObject = (a: string | AgendaItem): a is AgendaItem =>
  typeof a === 'object' && a !== null && typeof (a as AgendaItem).id === 'string';

export function usePaperResults(papers: PaperResultSource[]): ResultMap {
  const [results, setResults] = useState<ResultMap>({});
  const resultsRef = useRef<ResultMap>({});
  const abortRef = useRef<AbortController | null>(null);

  const paperIds = useMemo(() => papers.map((p) => p.id).join('|'), [papers]);

  useEffect(() => {
    if (!papers.length) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const updateResult = (paperId: string, value: string) => {
      setResults((prev) => {
        if (prev[paperId] === value) return prev;
        const next = { ...prev, [paperId]: value };
        resultsRef.current = next;
        return next;
      });
    };

    const fetchAgendaItem = async (agenda: string | AgendaItem) => {
      if (isAgendaItemObject(agenda)) return agenda;
      return getItem<AgendaItem>(agenda, controller.signal);
    };

    const fetchConsultation = async (consultation: string | Consultation) => {
      if (isConsultationObject(consultation)) return consultation;
      return getItem<Consultation>(consultation, controller.signal);
    };

    const run = async () => {
      for (const paper of papers) {
        if (controller.signal.aborted) return;
        if (!paper?.id) continue;
        if (resultsRef.current[paper.id]) continue;

        const consultations = paper.consultation ?? [];
        if (!consultations.length) continue;

        let resolved: Consultation[] = [];
        for (const c of consultations) {
          if (controller.signal.aborted) return;
          try {
            const full = await fetchConsultation(c);
            resolved.push(full);
          } catch {
            // Skip failed consultation fetches
          }
        }

        if (!resolved.length) continue;

        const authoritative = resolved.filter((c) => c.authoritative);
        const nonAuthoritative = resolved.filter((c) => !c.authoritative);
        const ordered = authoritative.length ? [...authoritative, ...nonAuthoritative] : resolved;

        let found: string | null = null;
        for (const c of ordered) {
          if (controller.signal.aborted) return;
          if (!c.agendaItem) continue;
          try {
            const agenda = await fetchAgendaItem(c.agendaItem);
            if (agenda?.result) {
              found = agenda.result;
              break;
            }
          } catch {
            // Skip failed agenda item fetches
          }
        }

        if (found) updateResult(paper.id, found);
      }
    };

    run();

    return () => {
      controller.abort();
    };
  }, [paperIds, papers]);

  return results;
}
