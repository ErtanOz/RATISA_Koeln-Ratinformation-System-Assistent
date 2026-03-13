import { Consultation, File as OparlFile, Meeting } from '../../types';
import { encodeUrl } from '../../utils/routeFormatting';

type MeetingDocumentCategory = 'minutes' | 'invitation' | 'agenda' | 'other';
type MeetingDocumentSource = 'auxiliaryFile' | 'invitation' | 'resultsProtocol' | 'verbatimProtocol';

export interface MeetingDocumentEntry {
  key: string;
  file: OparlFile;
  category: MeetingDocumentCategory;
}

export interface AgendaPaperLink {
  paperId: string;
  href: string;
  title?: string;
  reference?: string;
}

const MEETING_DOCUMENT_PRIORITY: Record<MeetingDocumentCategory, number> = {
  minutes: 0,
  invitation: 1,
  agenda: 2,
  other: 3,
};

const isOparlFile = (value: unknown): value is OparlFile =>
  Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as OparlFile).accessUrl === 'string' &&
      typeof (value as OparlFile).mimeType === 'string',
  );

const inferMimeTypeFromUrl = (url: string) => {
  const lower = url.toLowerCase();
  if (lower.includes('.pdf')) return 'application/pdf';
  if (lower.includes('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lower.includes('.doc')) return 'application/msword';
  if (lower.includes('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (lower.includes('.xls')) return 'application/vnd.ms-excel';
  return 'application/octet-stream';
};

const toResolvableMeetingFile = (
  value: Meeting['invitation'] | undefined,
  fallbackName: string,
): OparlFile | null => {
  if (!value) return null;
  if (isOparlFile(value)) return value;
  if (
    typeof value === 'string' &&
    (/\/downloadfiles\//i.test(value) || /\.(pdf|docx?|xlsx?|zip)(\?|#|$)/i.test(value))
  ) {
    return {
      id: value,
      type: 'https://schema.oparl.org/1.1/File',
      name: fallbackName,
      mimeType: inferMimeTypeFromUrl(value),
      accessUrl: value,
      created: '',
      modified: '',
    };
  }
  return null;
};

const classifyMeetingDocument = (
  file: OparlFile,
  source: MeetingDocumentSource,
): MeetingDocumentCategory => {
  if (source === 'invitation') return 'invitation';
  if (source === 'resultsProtocol' || source === 'verbatimProtocol') return 'minutes';

  const searchableName = `${file.name || ''} ${file.fileName || ''}`.trim().toLowerCase();
  if (searchableName.includes('niederschrift') || searchableName.includes('protokoll')) {
    return 'minutes';
  }
  if (searchableName.includes('einladung')) return 'invitation';
  if (searchableName.includes('tagesordnung')) return 'agenda';
  return 'other';
};

export const buildMeetingDocuments = (meeting: Meeting): MeetingDocumentEntry[] => {
  const seen = new Set<string>();
  const documents: MeetingDocumentEntry[] = [];

  const pushDocument = (
    value: Meeting['invitation'] | undefined,
    source: MeetingDocumentSource,
    fallbackName: string,
  ) => {
    const file = toResolvableMeetingFile(value, fallbackName);
    if (!file) return;

    const key = file.id || file.accessUrl || `${source}:${file.name}`;
    if (!key || seen.has(key)) return;
    seen.add(key);

    documents.push({
      key,
      file,
      category: classifyMeetingDocument(file, source),
    });
  };

  meeting.auxiliaryFile?.forEach((file, index) => {
    pushDocument(file, 'auxiliaryFile', `Sitzungsdokument ${index + 1}`);
  });
  pushDocument(meeting.invitation, 'invitation', 'Einladung');
  pushDocument(meeting.resultsProtocol, 'resultsProtocol', 'Niederschrift');
  pushDocument(meeting.verbatimProtocol, 'verbatimProtocol', 'Wortprotokoll');

  return documents.sort((left, right) => {
    const priorityDiff =
      MEETING_DOCUMENT_PRIORITY[left.category] - MEETING_DOCUMENT_PRIORITY[right.category];
    if (priorityDiff !== 0) return priorityDiff;
    return (left.file.name || '').localeCompare(right.file.name || '');
  });
};

const getPaperIdFromConsultation = (consultation?: string | Consultation): string | null => {
  if (!consultation || typeof consultation === 'string') return null;
  if (typeof consultation.paper === 'string') return consultation.paper;
  return consultation.paper?.id || null;
};

export const buildAgendaPaperLink = (
  consultation?: string | Consultation,
): AgendaPaperLink | null => {
  const paperId = getPaperIdFromConsultation(consultation);
  if (!paperId) return null;

  const paper =
    consultation && typeof consultation !== 'string' && typeof consultation.paper !== 'string'
      ? consultation.paper
      : undefined;

  return {
    paperId,
    href: `/papers/${encodeUrl(paperId)}`,
    title: paper?.name,
    reference: paper?.reference,
  };
};
