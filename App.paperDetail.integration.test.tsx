import type { ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaperDetailPage } from './routes/PaperDetailPage';
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

describe('Paper detail errors', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('shows a user-friendly message for unauthorized paper details', async () => {
    const paperId = 'https://buergerinfo.stadt-koeln.de/oparl/bodies/stadtverwaltung_koeln/papers/vo/131709';
    const unauthorizedError = Object.assign(new Error('API Error: 401 Unauthorized'), {
      name: 'ApiError',
      status: 401,
      statusText: 'Unauthorized',
    });

    vi.mocked(apiService.getItem).mockRejectedValue(unauthorizedError);

    renderRoute(`/papers/${encodeUrl(paperId)}`, '/papers/:id', <PaperDetailPage />);

    await waitFor(() =>
      expect(
        screen.getByText('Diese Vorlage ist derzeit nicht öffentlich verfügbar.'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('API Error: 401 Unauthorized')).not.toBeInTheDocument();
  });
});
