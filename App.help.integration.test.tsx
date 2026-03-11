import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { HelpPage, Layout } from './App';

function renderRoute(initialEntry: string, path: string, element: ReactElement) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path={path} element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Help page and navigation', () => {
  it('renders the help page content with key disclaimer text', () => {
    renderRoute('/help', '/help', <HelpPage />);

    expect(screen.getByRole('heading', { name: 'Hilfe / Informationen' })).toBeInTheDocument();
    expect(screen.getAllByText(/Stadt Köln/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Testphase/i)).toBeInTheDocument();
    expect(screen.getByText(/keine Haftung/i)).toBeInTheDocument();
    expect(screen.getByText(/Gemini 2\.5 Flash/i)).toBeInTheDocument();
  });

  it('shows the sidebar link and breadcrumb label for /help', () => {
    render(
      <MemoryRouter initialEntries={['/help']}>
        <Layout>
          <div>Testinhalt</div>
        </Layout>
      </MemoryRouter>,
    );

    const helpLink = screen.getAllByRole('link', { name: /Hilfe \/ Informationen/i })[0];
    expect(helpLink).toHaveAttribute('href', '/help');
    expect(screen.getAllByText('Hilfe / Informationen').length).toBeGreaterThan(1);
  });
});
