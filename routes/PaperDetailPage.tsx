import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useOparlItem } from '../hooks/useOparl';
import { askGemini, Attachment } from '../services/aiService';
import { runtimeConfig } from '../services/runtimeConfig';
import { Paper } from '../types';
import {
  DetailItem,
  DetailSection,
  DownloadLink,
  ErrorMessage,
  FavoriteButton,
  GeminiCard,
  LoadingSpinner,
  PageTitle,
} from '../components/ui';
import { decodeUrl, formatDateOnly } from '../utils/routeFormatting';

export const PaperDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const decodedId = id ? decodeUrl(id) : null;
  const { data: paper, isLoading, error } = useOparlItem<Paper>(decodedId);
  const [summary, setSummary] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const detailErrorMessage =
    error && 'status' in error && error.status === 401
      ? 'Diese Vorlage ist derzeit nicht öffentlich verfügbar.'
      : error?.message || 'Vorlage nicht gefunden';

  const handleSummarize = async () => {
    if (!paper) return;
    setIsSummarizing(true);
    try {
      const filesToAnalyze: Attachment[] = [];
      if (paper.mainFile?.accessUrl) {
        filesToAnalyze.push({ url: paper.mainFile.accessUrl, mimeType: paper.mainFile.mimeType });
      }
      const result = await askGemini(
        `Fasse den Inhalt dieser Vorlage zusammen. Titel: ${paper.name}.`,
        filesToAnalyze,
      );
      setSummary(result);
    } catch {
      setSummary('Fehler bei der Zusammenfassung.');
    } finally {
      setIsSummarizing(false);
    }
  };

  if (isLoading) return <div className="p-12"><LoadingSpinner /></div>;
  if (error || !paper) return <ErrorMessage message={detailErrorMessage} />;

  return (
    <div className="animate-in fade-in duration-300">
      <PageTitle
        title={paper.name}
        subtitle={paper.reference || 'Keine Referenz'}
        actions={
          <FavoriteButton
            item={{
              id: paper.id,
              type: 'paper',
              name: paper.name,
              path: `/papers/${id}`,
              info: paper.reference,
            }}
            className="!rounded-xl !bg-app-surface-alt !p-3 hover:!bg-app-surface"
          />
        }
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          {runtimeConfig.enableAi && (
            <GeminiCard
              title="KI-Analyse der Dokumente"
              content={summary}
              isLoading={isSummarizing}
              onAction={handleSummarize}
              actionLabel="Dokumente analysieren"
            />
          )}

          <DetailSection title="Basisdaten">
            <DetailItem label="Typ">{paper.paperType}</DetailItem>
            <DetailItem label="Datum">{formatDateOnly(paper.date)}</DetailItem>
            <DetailItem label="Referenz">{paper.reference}</DetailItem>
          </DetailSection>

          {(paper.mainFile || (paper.auxiliaryFile && paper.auxiliaryFile.length > 0)) && (
            <DetailSection title="Dokumente">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {paper.mainFile && <DownloadLink file={paper.mainFile} />}
                {paper.auxiliaryFile?.map((file) => (
                  <DownloadLink key={file.id} file={file} />
                ))}
              </div>
            </DetailSection>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaperDetailPage;
