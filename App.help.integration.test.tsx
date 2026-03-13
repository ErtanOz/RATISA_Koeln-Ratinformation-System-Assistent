import type { ReactElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Layout } from './App';
import { HelpPage } from './routes/HelpPage';
import { THEME_STORAGE_KEY } from './hooks/useTheme';

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
    expect(screen.getByText(/Themenatlas lesen/i)).toBeInTheDocument();
    expect(screen.getByText(/"Aktuell" zeigt nur laufende Daten/i)).toBeInTheDocument();
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

  it('renders the theme selector and persists user changes', () => {
    localStorage.clear();

    render(
      <MemoryRouter initialEntries={['/help']}>
        <Layout>
          <div>Testinhalt</div>
        </Layout>
      </MemoryRouter>,
    );

    const themeSwitch = screen.getByRole('switch', { name: /Dunkelmodus umschalten/i });
    expect(themeSwitch).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(themeSwitch);

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(themeSwitch).toHaveAttribute('aria-checked', 'true');
  });
});
