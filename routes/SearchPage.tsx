import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BuildingLibraryIcon,
  CalendarDaysIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  UsersIcon,
} from '../components/ui';
import { parseSearchQuery } from '../services/aiService';
import { runtimeConfig } from '../services/runtimeConfig';

export const SearchPage: React.FC = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const isAiEnabled = runtimeConfig.enableAi;
  const searchLabelId = 'global-search-label';
  const searchFieldId = 'global-search-query';
  const searchHelpId = 'global-search-help';

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    navigate(`/papers?q=${encodeURIComponent(query)}`);
  };

  const handleAiSearch = async () => {
    if (!isAiEnabled || !query.trim()) return;
    setIsAiLoading(true);
    try {
      const structured = await parseSearchQuery(query);
      if (structured) {
        const params = new URLSearchParams();
        if (structured.q) params.set('q', structured.q);
        if (structured.minDate) params.set('minDate', structured.minDate);
        if (structured.maxDate) params.set('maxDate', structured.maxDate);

        let targetPath = '/papers';
        if (structured.resource === 'meetings') targetPath = '/meetings';
        else if (structured.resource === 'people') targetPath = '/people';
        else if (structured.resource === 'organizations') targetPath = '/organizations';

        navigate(`${targetPath}?${params.toString()}`);
        return;
      }
      handleSearch({ preventDefault: () => undefined } as React.FormEvent);
    } catch (error) {
      console.error('AI Search failed', error);
      handleSearch({ preventDefault: () => undefined } as React.FormEvent);
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="animate-in mx-auto max-w-3xl py-12 fade-in duration-300">
      <div className="app-surface-elevated mb-10 p-8 text-center md:p-10">
        <span className="app-badge-accent mb-4">Zentrale Suche</span>
        <h1 className="mb-4 text-4xl font-semibold text-app-text">Was suchen Sie?</h1>
        <p className="text-app-muted">
          Durchsuchen Sie Sitzungen, Vorlagen, Personen und Gremien der Stadt Köln.
        </p>
      </div>

      <form onSubmit={handleSearch} className="relative" role="search" aria-labelledby={searchLabelId}>
        <label id={searchLabelId} htmlFor={searchFieldId} className="sr-only">
          Suche im Ratsinformationssystem
        </label>
        <div className="app-surface flex items-center gap-2 p-2 shadow-sm focus-within:ring-2 focus-within:ring-app-info/20">
          <div className="pl-4 text-app-muted">
            <MagnifyingGlassIcon />
          </div>
          <input
            id={searchFieldId}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Suchbegriff eingeben (z.B. 'Klimaschutz' oder 'Verkehrsausschuss Mai 2024')"
            className="w-full bg-transparent px-4 py-3 text-lg text-app-text placeholder:text-app-muted focus:outline-none"
            aria-describedby={searchHelpId}
            autoComplete="off"
            enterKeyHint="search"
          />
          {isAiEnabled && (
            <button
              type="button"
              onClick={handleAiSearch}
              disabled={isAiLoading || !query.trim()}
              className="app-button-info mr-2 hidden sm:flex"
              title="Intelligente Suche"
              aria-label="Intelligente Suche mit KI starten"
            >
              {isAiLoading ? (
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <SparklesIcon />
              )}
              <span>KI-Suche</span>
            </button>
          )}
          <button
            type="submit"
            disabled={isAiLoading || !query.trim()}
            className="app-button-primary"
            aria-label="Suche starten"
          >
            Suchen
          </button>
        </div>
        <p id={searchHelpId} className="mt-3 text-center text-xs text-app-muted">
          {isAiEnabled ? (
            <>
              Tipp: Nutzen Sie die <strong>KI-Suche</strong>, um natürliche Anfragen wie{' '}
              <em>
                "Zeige mir alle Anträge der Grünen zum Thema Radverkehr aus 2024"
              </em>{' '}
              automatisch zu filtern.
            </>
          ) : (
            <>Hinweis: KI-Suche ist in dieser Umgebung deaktiviert. Die normale Suche funktioniert weiterhin.</>
          )}
        </p>
      </form>

      <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Link
          to="/meetings"
          className="app-surface flex flex-col items-center gap-3 p-4 transition-transform hover:scale-[1.02] hover:bg-app-surface-alt"
        >
          <div className="rounded-full bg-app-info/10 p-3 text-app-info">
            <CalendarDaysIcon />
          </div>
          <span className="font-semibold text-app-text">Sitzungen</span>
        </Link>
        <Link
          to="/papers"
          className="app-surface flex flex-col items-center gap-3 p-4 transition-transform hover:scale-[1.02] hover:bg-app-surface-alt"
        >
          <div className="rounded-full bg-app-success/10 p-3 text-app-success">
            <DocumentTextIcon />
          </div>
          <span className="font-semibold text-app-text">Vorlagen</span>
        </Link>
        <Link
          to="/people"
          className="app-surface flex flex-col items-center gap-3 p-4 transition-transform hover:scale-[1.02] hover:bg-app-surface-alt"
        >
          <div className="rounded-full bg-app-accent/10 p-3 text-app-accent">
            <UsersIcon />
          </div>
          <span className="font-semibold text-app-text">Personen</span>
        </Link>
        <Link
          to="/organizations"
          className="app-surface flex flex-col items-center gap-3 p-4 transition-transform hover:scale-[1.02] hover:bg-app-surface-alt"
        >
          <div className="rounded-full bg-app-warning/10 p-3 text-app-warning">
            <BuildingLibraryIcon />
          </div>
          <span className="font-semibold text-app-text">Gremien</span>
        </Link>
      </div>
    </div>
  );
};

export default SearchPage;
