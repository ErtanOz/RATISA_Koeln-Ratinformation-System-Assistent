import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useOparlItem } from '../hooks/useOparl';
import { askGemini } from '../services/aiService';
import { getItem } from '../services/oparlApiService';
import { runtimeConfig } from '../services/runtimeConfig';
import { Consultation, Meeting } from '../types';
import {
  DetailSection,
  DownloadLink,
  ErrorMessage,
  FavoriteButton,
  GeminiCard,
  LinkIcon,
  LoadingSpinner,
  PageTitle,
} from '../components/ui';
import { decodeUrl, formatDateTime } from '../utils/routeFormatting';
import {
  AgendaPaperLink,
  buildAgendaPaperLink,
  buildMeetingDocuments,
} from './shared/meetingDetailUtils';

export const MeetingDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const decodedId = id ? decodeUrl(id) : null;
  const { data: meeting, isLoading, error } = useOparlItem<Meeting>(decodedId);
  const [summary, setSummary] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [agendaPaperLinks, setAgendaPaperLinks] = useState<Record<string, AgendaPaperLink>>({});

  useEffect(() => {
    if (!meeting) {
      setAgendaPaperLinks({});
      return;
    }

    const directLinks: Record<string, AgendaPaperLink> = {};
    const consultationTargets = new Map<string, string[]>();

    meeting.agendaItem?.forEach((item) => {
      if (item.public === false) return;

      const directLink = buildAgendaPaperLink(item.consultation);
      if (directLink) {
        directLinks[item.id] = directLink;
        return;
      }

      if (typeof item.consultation === 'string' && item.consultation) {
        const agendaItemIds = consultationTargets.get(item.consultation) || [];
        agendaItemIds.push(item.id);
        consultationTargets.set(item.consultation, agendaItemIds);
      }
    });

    setAgendaPaperLinks(directLinks);
    if (consultationTargets.size === 0) return;

    let isActive = true;
    const controller = new AbortController();

    void (async () => {
      const resolvedEntries = await Promise.all(
        Array.from(consultationTargets.entries()).map(async ([consultationUrl, agendaItemIds]) => {
          try {
            const consultation = await getItem<Consultation>(consultationUrl, controller.signal);
            const link = buildAgendaPaperLink(consultation);
            if (!link) return null;
            return { agendaItemIds, link };
          } catch (fetchError) {
            if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return null;
            return null;
          }
        }),
      );

      if (!isActive || controller.signal.aborted) return;

      const nextLinks = { ...directLinks };
      resolvedEntries.forEach((entry) => {
        if (!entry) return;
        entry.agendaItemIds.forEach((agendaItemId) => {
          nextLinks[agendaItemId] = entry.link;
        });
      });
      setAgendaPaperLinks(nextLinks);
    })();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [meeting]);

  const meetingDocuments = useMemo(() => (meeting ? buildMeetingDocuments(meeting) : []), [meeting]);
  const featuredMeetingDocuments = useMemo(
    () => meetingDocuments.filter((document) => document.category !== 'other'),
    [meetingDocuments],
  );
  const otherMeetingDocuments = useMemo(
    () => meetingDocuments.filter((document) => document.category === 'other'),
    [meetingDocuments],
  );

  const handleSummarize = async () => {
    if (!meeting) return;
    setIsSummarizing(true);
    try {
      const prompt = `Fasse die wichtigsten Punkte dieser Sitzung zusammen. Titel: ${meeting.name}. Agenda: ${
        meeting.agendaItem?.map((item) => item.name).join('; ') || 'Keine Agenda'
      }`;
      const result = await askGemini(prompt);
      setSummary(result);
    } catch {
      setSummary('Fehler bei der Zusammenfassung.');
    } finally {
      setIsSummarizing(false);
    }
  };

  if (isLoading) return <div className="p-12"><LoadingSpinner /></div>;
  if (error || !meeting) return <ErrorMessage message={error?.message || 'Sitzung nicht gefunden'} />;

  return (
    <div className="animate-in fade-in duration-300">
      <PageTitle
        title={meeting.name}
        subtitle={`Sitzung vom ${formatDateTime(meeting.start)}`}
        actions={
          <FavoriteButton
            item={{
              id: meeting.id,
              type: 'meeting',
              name: meeting.name,
              path: `/meetings/${id}`,
              info: formatDateTime(meeting.start),
            }}
            className="!rounded-xl !bg-app-surface-alt !p-3 hover:!bg-app-surface"
          />
        }
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          {runtimeConfig.enableAi && (
            <GeminiCard
              title="KI-Zusammenfassung der Agenda"
              content={summary}
              isLoading={isSummarizing}
              onAction={handleSummarize}
              actionLabel="Agenda analysieren"
            />
          )}

          <DetailSection title="Tagesordnung">
            {meeting.agendaItem?.length ? (
              <div className="space-y-4">
                {meeting.agendaItem.map((item, index) => (
                  <div key={item.id} className="app-surface-alt p-4">
                    <div className="flex gap-4">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-app-surface text-sm font-bold text-app-muted">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-app-text">{item.name}</h4>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {item.public === false && (
                            <span className="app-badge-danger">
                              Nicht öffentlich
                            </span>
                          )}
                          {item.result && (
                            <span className="app-badge-success">
                              Ergebnis: {item.result}
                            </span>
                          )}
                          {item.public !== false && agendaPaperLinks[item.id] && (
                            <Link
                              to={agendaPaperLinks[item.id].href}
                              title={
                                agendaPaperLinks[item.id].title ||
                                agendaPaperLinks[item.id].reference ||
                                'Verknüpfte Vorlage'
                              }
                              className="app-badge-info inline-flex gap-1"
                            >
                              <LinkIcon />
                              <span>Vorlage öffnen</span>
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-app-muted">Keine Tagesordnungspunkte verfügbar.</p>
            )}
          </DetailSection>
        </div>

        <div className="space-y-6">
          <div className="app-surface p-6">
            <h3 className="mb-4 text-lg font-semibold text-app-text">Details</h3>
            <div className="space-y-4 text-sm">
              <div>
                <span className="block text-xs font-bold uppercase tracking-[0.16em] text-app-muted">Datum & Uhrzeit</span>
                <span className="text-app-text">
                  {formatDateTime(meeting.start)}{' '}
                  {meeting.end
                    ? `- ${new Date(meeting.end).toLocaleTimeString('de-DE', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}`
                    : ''}
                </span>
              </div>
              <div>
                <span className="block text-xs font-bold uppercase tracking-[0.16em] text-app-muted">Ort</span>
                <span className="text-app-text">
                  {typeof meeting.location === 'object'
                    ? meeting.location.description
                    : meeting.location || 'Keine Angabe'}
                </span>
              </div>
            </div>
          </div>

          {meetingDocuments.length > 0 && (
            <div className="app-surface p-6">
              <h3 className="mb-4 text-lg font-semibold text-app-text">Sitzungsdokumente</h3>
              <div className="space-y-4">
                {featuredMeetingDocuments.length > 0 && (
                  <div className="grid grid-cols-1 gap-3">
                    {featuredMeetingDocuments.map((document) => (
                      <DownloadLink key={document.key} file={document.file} />
                    ))}
                  </div>
                )}

                {otherMeetingDocuments.length > 0 && (
                  <div className="space-y-3">
                    {featuredMeetingDocuments.length > 0 && (
                      <div className="border-t border-app-border" />
                    )}
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-app-muted">
                      Weitere Dokumente
                    </p>
                    <div className="grid grid-cols-1 gap-3">
                      {otherMeetingDocuments.map((document) => (
                        <DownloadLink key={document.key} file={document.file} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MeetingDetailPage;
