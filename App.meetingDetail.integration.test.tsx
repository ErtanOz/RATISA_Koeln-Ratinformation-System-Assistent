import type { ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MeetingDetailPage } from './routes/MeetingDetailPage';
import * as apiService from './services/oparlApiService';

vi.mock('./services/oparlApiService', async () => {
  const actual = await vi.importActual<typeof import('./services/oparlApiService')>(
    './services/oparlApiService',
  );

  return {
    ...actual,
    getItem: vi.fn(),
  };
});

function renderRoute(initialEntry: string, path: string, element: ReactElement) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path={path} element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

const encodeUrl = (url: string) =>
  btoa(encodeURIComponent(url)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const buildFile = (overrides: Partial<Record<string, string>> = {}) => ({
  id: overrides.id || `https://example.org/files/${Math.random().toString(36).slice(2)}`,
  type: 'https://schema.oparl.org/1.1/File',
  name: overrides.name || 'Dokument',
  mimeType: overrides.mimeType || 'application/pdf',
  accessUrl: overrides.accessUrl || 'https://example.org/files/document.pdf',
  created: '2026-03-11T00:00:00+01:00',
  modified: '2026-03-11T00:00:00+01:00',
});

describe('Meeting detail document links', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders meeting documents and linked papers for public agenda items', async () => {
    const meetingId = 'https://example.org/oparl/meetings/42';
    const consultationId = 'https://example.org/oparl/consultations/7';
    const paperId = 'https://example.org/oparl/papers/99';

    const meeting = {
      id: meetingId,
      type: 'https://schema.oparl.org/1.1/Meeting',
      name: 'Mobilitaetsausschuss',
      created: '2026-03-11T00:00:00+01:00',
      modified: '2026-03-11T00:00:00+01:00',
      start: '2026-03-20T16:00:00+01:00',
      organization: [],
      participant: [],
      auxiliaryFile: [
        buildFile({
          id: 'https://example.org/files/invitation',
          name: 'Einladung',
          accessUrl: 'https://example.org/files/einladung.pdf',
        }),
        buildFile({
          id: 'https://example.org/files/minutes',
          name: 'Niederschrift (Oeffentlicher Teil)',
          accessUrl: 'https://example.org/files/niederschrift.pdf',
        }),
        buildFile({
          id: 'https://example.org/files/agenda',
          name: 'Tagesordnung',
          accessUrl: 'https://example.org/files/tagesordnung.pdf',
        }),
        buildFile({
          id: 'https://example.org/files/appendix',
          name: 'Praesentation Verkehrswende',
          accessUrl: 'https://example.org/files/praesentation.pdf',
        }),
      ],
      agendaItem: [
        {
          id: 'agenda-1',
          type: 'https://schema.oparl.org/1.1/AgendaItem',
          name: 'Radpendlerrouten',
          number: '1',
          public: true,
          consultation: consultationId,
          created: '2026-03-11T00:00:00+01:00',
          modified: '2026-03-11T00:00:00+01:00',
        },
        {
          id: 'agenda-2',
          type: 'https://schema.oparl.org/1.1/AgendaItem',
          name: 'Mitteilung ohne Vorlage',
          number: '2',
          public: true,
          created: '2026-03-11T00:00:00+01:00',
          modified: '2026-03-11T00:00:00+01:00',
        },
      ],
    };

    vi.mocked(apiService.getItem).mockImplementation(async (url) => {
      if (url === meetingId) return meeting as any;
      if (url === consultationId) {
        return {
          id: consultationId,
          type: 'https://schema.oparl.org/1.1/Consultation',
          paper: paperId,
          organization: [],
          created: '2026-03-11T00:00:00+01:00',
          modified: '2026-03-11T00:00:00+01:00',
        } as any;
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    renderRoute(
      `/meetings/${encodeUrl(meetingId)}`,
      '/meetings/:id',
      <MeetingDetailPage />,
    );

    await waitFor(() => expect(screen.getByText('Mobilitaetsausschuss')).toBeInTheDocument());

    expect(screen.getByRole('heading', { name: 'Sitzungsdokumente' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Einladung/i })).toHaveAttribute(
      'href',
      'https://example.org/files/einladung.pdf',
    );
    expect(screen.getByRole('link', { name: /Niederschrift/i })).toHaveAttribute(
      'href',
      'https://example.org/files/niederschrift.pdf',
    );
    expect(screen.getByRole('link', { name: /Tagesordnung/i })).toHaveAttribute(
      'href',
      'https://example.org/files/tagesordnung.pdf',
    );
    expect(screen.getByText('Weitere Dokumente')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Praesentation Verkehrswende/i })).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Vorlage öffnen/i })).toHaveAttribute(
        'href',
        `/papers/${encodeUrl(paperId)}`,
      ),
    );

    expect(screen.getAllByRole('link', { name: /Vorlage öffnen/i })).toHaveLength(1);
    expect(apiService.getItem).toHaveBeenCalledWith(meetingId, expect.any(AbortSignal));
    expect(apiService.getItem).toHaveBeenCalledWith(consultationId, expect.any(AbortSignal));
  });

  it('does not render paper links for non-public agenda items', async () => {
    const meetingId = 'https://example.org/oparl/meetings/43';
    const consultationId = 'https://example.org/oparl/consultations/8';

    vi.mocked(apiService.getItem).mockImplementation(async (url) => {
      if (url === meetingId) {
        return {
          id: meetingId,
          type: 'https://schema.oparl.org/1.1/Meeting',
          name: 'Geheime Sitzung',
          created: '2026-03-11T00:00:00+01:00',
          modified: '2026-03-11T00:00:00+01:00',
          start: '2026-03-20T18:00:00+01:00',
          organization: [],
          participant: [],
          auxiliaryFile: [],
          agendaItem: [
            {
              id: 'agenda-secret',
              type: 'https://schema.oparl.org/1.1/AgendaItem',
              name: 'Vertraulicher TOP',
              number: '1',
              public: false,
              consultation: consultationId,
              created: '2026-03-11T00:00:00+01:00',
              modified: '2026-03-11T00:00:00+01:00',
            },
          ],
        } as any;
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    renderRoute(
      `/meetings/${encodeUrl(meetingId)}`,
      '/meetings/:id',
      <MeetingDetailPage />,
    );

    await waitFor(() => expect(screen.getByText('Geheime Sitzung')).toBeInTheDocument());

    expect(screen.queryByRole('link', { name: /Vorlage öffnen/i })).not.toBeInTheDocument();
    expect(apiService.getItem).toHaveBeenCalledTimes(1);
  });

  it('keeps the meeting detail page stable when consultation resolution fails', async () => {
    const meetingId = 'https://example.org/oparl/meetings/44';
    const consultationId = 'https://example.org/oparl/consultations/9';

    vi.mocked(apiService.getItem).mockImplementation(async (url) => {
      if (url === meetingId) {
        return {
          id: meetingId,
          type: 'https://schema.oparl.org/1.1/Meeting',
          name: 'Fehlerrobuste Sitzung',
          created: '2026-03-11T00:00:00+01:00',
          modified: '2026-03-11T00:00:00+01:00',
          start: '2026-03-21T09:00:00+01:00',
          organization: [],
          participant: [],
          auxiliaryFile: [
            buildFile({
              id: 'https://example.org/files/minutes-fallback',
              name: 'Niederschrift',
              accessUrl: 'https://example.org/files/minutes-fallback.pdf',
            }),
          ],
          agendaItem: [
            {
              id: 'agenda-failing',
              type: 'https://schema.oparl.org/1.1/AgendaItem',
              name: 'TOP mit defekter Consultation',
              number: '1',
              public: true,
              consultation: consultationId,
              created: '2026-03-11T00:00:00+01:00',
              modified: '2026-03-11T00:00:00+01:00',
            },
          ],
        } as any;
      }
      if (url === consultationId) {
        throw new Error('consultation fetch failed');
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    renderRoute(
      `/meetings/${encodeUrl(meetingId)}`,
      '/meetings/:id',
      <MeetingDetailPage />,
    );

    await waitFor(() => expect(screen.getByText('Fehlerrobuste Sitzung')).toBeInTheDocument());

    expect(screen.getByRole('heading', { name: 'Sitzungsdokumente' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Niederschrift/i })).toHaveAttribute(
      'href',
      'https://example.org/files/minutes-fallback.pdf',
    );
    await waitFor(() =>
      expect(apiService.getItem).toHaveBeenCalledWith(consultationId, expect.any(AbortSignal)),
    );
    expect(screen.queryByRole('link', { name: /Vorlage öffnen/i })).not.toBeInTheDocument();
  });
});
