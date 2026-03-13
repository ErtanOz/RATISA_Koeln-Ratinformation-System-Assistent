import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import SearchPage from './SearchPage';

describe('SearchPage accessibility', () => {
  it('exposes the search form and controls with accessible names', () => {
    render(
      <MemoryRouter>
        <SearchPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /suche im ratsinformationssystem/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /suche starten/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /intelligente suche mit ki starten/i }),
    ).toBeInTheDocument();
  });
});
