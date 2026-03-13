import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAtlasData } from './hooks/useAtlasData';
import {
  AtlasConfidenceFilter,
  AtlasDistrictFeatureCollection,
  AtlasMeetingRecord,
  DistrictId,
} from './types';
import {
  AtlasDistrictStat,
  buildAtlasDistrictStats,
  DISTRICT_ORDER,
  filterAtlasRecords,
  getDistrictLabel,
  getRelevantSpatialMatches,
  pickRecordHighlightMatch,
} from './services/atlasService';
import {
  ErrorMessage,
  LoadingSpinner,
  MagnifyingGlassIcon,
  MapIcon,
  PageTitle,
} from './components/ui';

const MODE_OPTIONS = [
  { value: 'all', label: 'Alle' },
  { value: 'live', label: 'Aktuell' },
  { value: 'archive', label: 'Archiv' },
] as const;

const CONFIDENCE_OPTIONS: Array<{ value: AtlasConfidenceFilter; label: string }> = [
  { value: 'all', label: 'Alle' },
  { value: 'medium', label: 'Eher sicher' },
  { value: 'high', label: 'Nur sicher' },
];

const CONFIDENCE_LABELS = {
  high: 'Hoch',
  medium: 'Mittel',
  low: 'Niedrig',
} as const;

const FILTER_EXPLANATIONS = {
  sources:
    'Wählen Sie, ob aktuelle Sitzungen, Archivdaten oder beides gezeigt werden sollen.',
  confidence:
    'Steuert, wie streng Bezirkszuordnungen gefiltert werden. Strenger bedeutet weniger, aber klarere Treffer.',
} as const;

const MAX_PANEL_RECORDS = 24;

function formatDateOnly(dateStr?: string) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function formatDateTime(dateStr?: string) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date).replace(',', '');
}

function collectCoordinates(districts: AtlasDistrictFeatureCollection): [number, number][] {
  return districts.features.flatMap((feature) => {
    if (feature.geometry.type === 'Polygon') {
      return feature.geometry.coordinates.flatMap((ring) => ring.map((coordinate) => coordinate as [number, number]));
    }
    return feature.geometry.coordinates.flatMap((polygon) =>
      polygon.flatMap((ring) => ring.map((coordinate) => coordinate as [number, number])),
    );
  });
}

function createProjector(districts: AtlasDistrictFeatureCollection, width = 820, height = 700, padding = 28) {
  const coordinates = collectCoordinates(districts);
  const xs = coordinates.map(([x]) => x);
  const ys = coordinates.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scaleX = (width - padding * 2) / Math.max(maxX - minX, 0.000001);
  const scaleY = (height - padding * 2) / Math.max(maxY - minY, 0.000001);
  const scale = Math.min(scaleX, scaleY);
  const xOffset = (width - (maxX - minX) * scale) / 2;
  const yOffset = (height - (maxY - minY) * scale) / 2;

  return ([x, y]: [number, number]) => {
    const projectedX = xOffset + (x - minX) * scale;
    const projectedY = height - (yOffset + (y - minY) * scale);
    return [projectedX, projectedY] as const;
  };
}

function ringToPath(
  ring: number[][],
  project: (coordinate: [number, number]) => readonly [number, number],
): string {
  if (ring.length === 0) return '';
  return ring
    .map((coordinate, index) => {
      const [x, y] = project(coordinate as [number, number]);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ') + ' Z';
}

function geometryToPath(
  feature: AtlasDistrictFeatureCollection['features'][number],
  project: (coordinate: [number, number]) => readonly [number, number],
): string {
  if (feature.geometry.type === 'Polygon') {
    return feature.geometry.coordinates.map((ring) => ringToPath(ring, project)).join(' ');
  }
  return feature.geometry.coordinates
    .flatMap((polygon) => polygon.map((ring) => ringToPath(ring, project)))
    .join(' ');
}

function getGeometryCenter(
  feature: AtlasDistrictFeatureCollection['features'][number],
  project: (coordinate: [number, number]) => readonly [number, number],
) {
  const coordinates =
    feature.geometry.type === 'Polygon'
      ? feature.geometry.coordinates.flat()
      : feature.geometry.coordinates.flat(2);
  const projected = coordinates.map((coordinate) => project(coordinate as [number, number]));
  const xs = projected.map(([x]) => x);
  const ys = projected.map(([, y]) => y);
  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ] as const;
}

function getFillColor(count: number, maxCount: number, isSelected: boolean) {
  if (count <= 0) return isSelected ? 'rgba(151, 118, 60, 0.45)' : 'rgba(130, 144, 155, 0.36)';
  const intensity = Math.max(0.18, count / Math.max(maxCount, 1));
  const alpha = 0.22 + intensity * 0.68;
  return isSelected ? `rgba(151, 118, 60, ${Math.min(alpha + 0.12, 1)})` : `rgba(164, 60, 52, ${alpha})`;
}

function buildTopTerms(
  records: AtlasMeetingRecord[],
  district?: DistrictId,
  confidence: AtlasConfidenceFilter = 'all',
) {
  const counts = new Map<string, number>();
  records.forEach((record) => {
    getRelevantSpatialMatches(record, district, confidence).forEach((match) => {
      match.matchedTerms.forEach((term) => {
        counts.set(term, (counts.get(term) || 0) + 1);
      });
    });
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([term]) => term);
}

const FilterChip: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
      active
        ? 'border-app-accent/20 bg-app-accent text-white shadow-sm shadow-black/10'
        : 'border-app-border bg-app-surface text-app-text hover:bg-app-surface-alt'
    }`}
  >
    {label}
  </button>
);

const FilterGroup: React.FC<{
  title: string;
  description: string;
  children: React.ReactNode;
}> = ({ title, description, children }) => (
  <section className="app-surface-alt rounded-2xl px-4 py-3">
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-app-text">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-app-muted">{description}</p>
    </div>
    <div className="flex flex-wrap gap-2">{children}</div>
  </section>
);

const AtlasMap: React.FC<{
  districts: AtlasDistrictFeatureCollection;
  selectedDistrict?: DistrictId;
  statsByDistrict: Map<DistrictId, AtlasDistrictStat>;
  onSelectDistrict: (district?: DistrictId) => void;
}> = ({ districts, selectedDistrict, statsByDistrict, onSelectDistrict }) => {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    label: string;
    count: number;
    lastMeetingDate?: string;
  } | null>(null);

  const project = useMemo(() => createProjector(districts), [districts]);
  const maxCount = Math.max(0, ...(Array.from(statsByDistrict.values()) as AtlasDistrictStat[]).map((stat) => stat.count));

  return (
    <div className="app-surface relative p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-app-text">Köln Bezirke</h3>
          <p className="text-xs text-app-muted">Klick filtert den rechten Ergebnisbereich nach Bezirk.</p>
        </div>
        <button
          type="button"
          onClick={() => onSelectDistrict(undefined)}
          className="app-button-secondary px-3 py-1.5 text-xs"
        >
          Auswahl aufheben
        </button>
      </div>

      <div className="relative">
        <svg viewBox="0 0 820 700" className="w-full h-auto">
          {districts.features.map((feature) => {
            const districtId = feature.properties.districtId;
            const stat = statsByDistrict.get(districtId);
            const isSelected = districtId === selectedDistrict;
            const path = geometryToPath(feature, project);
            const [labelX, labelY] = getGeometryCenter(feature, project);

            return (
              <g key={districtId}>
                <path
                  d={path}
                  fill={getFillColor(stat?.count || 0, maxCount, isSelected)}
                  stroke={isSelected ? '#97763C' : '#FFFFFF'}
                  strokeWidth={isSelected ? 3.4 : 1.2}
                  fillRule="evenodd"
                  className="cursor-pointer transition-opacity hover:opacity-90"
                  role="button"
                  tabIndex={0}
                  aria-label={`Bezirk ${feature.properties.label}`}
                  onClick={() => onSelectDistrict(isSelected ? undefined : districtId)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectDistrict(isSelected ? undefined : districtId);
                    }
                  }}
                  onMouseMove={(event) =>
                    setTooltip({
                      x: event.nativeEvent.offsetX + 18,
                      y: event.nativeEvent.offsetY + 18,
                      label: feature.properties.label,
                      count: stat?.count || 0,
                      lastMeetingDate: stat?.lastMeetingDate,
                    })
                  }
                  onMouseLeave={() => setTooltip(null)}
                />
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor="middle"
                  className="pointer-events-none fill-app-text text-[16px] font-bold"
                >
                  {feature.properties.label}
                </text>
              </g>
            );
          })}
        </svg>

        {tooltip && (
          <div
            className="pointer-events-none absolute z-10 rounded-xl border border-app-border bg-app-surface px-3 py-2 text-xs text-app-text shadow-lg shadow-black/15"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            <div className="font-bold text-app-text">{tooltip.label}</div>
            <div>{tooltip.count} zugeordnete Sitzungen</div>
            <div className="text-app-muted">
              {tooltip.lastMeetingDate ? `Zuletzt: ${formatDateOnly(tooltip.lastMeetingDate)}` : 'Kein Datum'}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-app-muted">
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-app-surface-alt" />
          Kein Treffer
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-app-accent/60" />
          Weniger
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-app-warning" />
          Mehr
        </span>
      </div>
    </div>
  );
};

export const AtlasPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { districts, records, metadata, loading, error, liveDataWarning, refetch } = useAtlasData();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const urlQuery = searchParams.get('q') || '';
  const [currentQuery, setCurrentQuery] = useState(urlQuery);
  const deferredQuery = useDeferredValue(currentQuery);
  const selectedDistrict = (searchParams.get('district') || '') as DistrictId | '';
  const minDate = searchParams.get('minDate') || '';
  const maxDate = searchParams.get('maxDate') || '';
  const mode = (searchParams.get('mode') || 'all') as 'all' | 'live' | 'archive';
  const confidence = (searchParams.get('confidence') || 'all') as AtlasConfidenceFilter;

  useEffect(() => {
    setCurrentQuery((prev) => (prev === urlQuery ? prev : urlQuery));
  }, [urlQuery]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (deferredQuery.trim() === urlQuery.trim()) return;
      const nextParams = new URLSearchParams(location.search);
      if (deferredQuery.trim()) nextParams.set('q', deferredQuery.trim());
      else nextParams.delete('q');
      navigate({ search: nextParams.toString() }, { replace: true });
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [deferredQuery, location.search, navigate, urlQuery]);

  const setFilterParam = (key: string, value?: string) => {
    const nextParams = new URLSearchParams(location.search);
    if (value) nextParams.set(key, value);
    else nextParams.delete(key);
    navigate({ search: nextParams.toString() });
  };

  const setDistrict = (district?: DistrictId) => setFilterParam('district', district);

  const baseFilteredRecords = useMemo(
    () =>
      filterAtlasRecords(records, {
        query: deferredQuery,
        minDate: minDate || undefined,
        maxDate: maxDate || undefined,
        mode,
        confidence,
      }),
    [confidence, deferredQuery, maxDate, minDate, mode, records],
  );

  const panelRecords = useMemo(
    () =>
      selectedDistrict
        ? filterAtlasRecords(records, {
            query: deferredQuery,
            minDate: minDate || undefined,
            maxDate: maxDate || undefined,
            mode,
            confidence,
            district: selectedDistrict,
          })
        : baseFilteredRecords,
    [baseFilteredRecords, confidence, deferredQuery, maxDate, minDate, mode, records, selectedDistrict],
  );

  const stats = useMemo(() => buildAtlasDistrictStats(baseFilteredRecords), [baseFilteredRecords]);
  const statsByDistrict = useMemo(
    () => new Map(stats.map((stat) => [stat.districtId, stat])),
    [stats],
  );
  const summaryTopTerms = useMemo(
    () => buildTopTerms(panelRecords, selectedDistrict || undefined, confidence),
    [confidence, panelRecords, selectedDistrict],
  );
  const selectedStat = selectedDistrict ? statsByDistrict.get(selectedDistrict) : undefined;
  const lastMeetingDate = useMemo(
    () =>
      panelRecords.reduce<string | undefined>((latest, record) => {
        if (!record.dateKey) return latest;
        if (!latest || record.dateKey > latest) return record.dateKey;
        return latest;
      }, undefined),
    [panelRecords],
  );
  const displayRecords = panelRecords.slice(0, MAX_PANEL_RECORDS);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <PageTitle
        title="Themenatlas"
        subtitle="Köln-Themen nach Stadtbezirk erkunden"
        actions={
          <div className="rounded-xl border border-app-border bg-app-surface-alt px-3 py-2 text-xs text-app-muted">
            {metadata ? `${metadata.matchedItemCount} archivierte Raumtreffer` : 'Atlas lädt'}
          </div>
        }
      />

      {metadata?.isPartial && (
        <div className="rounded-2xl border border-app-warning/30 bg-app-warning/10 px-4 py-3 text-sm text-app-warning">
          Der Archivindex ist unvollständig. Einzelne ältere räumliche Treffer können fehlen.
          {metadata.stopReason ? ` ${metadata.stopReason}` : ''}
        </div>
      )}

      {liveDataWarning && (
        <div className="rounded-2xl border border-app-warning/30 bg-app-warning/10 px-4 py-3 text-sm text-app-warning">
          {liveDataWarning}
        </div>
      )}

      <div className="app-surface grid grid-cols-1 gap-3 p-4 md:grid-cols-[minmax(0,1fr)_180px_180px]">
        <div className="relative self-start">
          <div className="pointer-events-none absolute left-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center text-app-muted">
            <MagnifyingGlassIcon />
          </div>
          <input
            type="search"
            value={currentQuery}
            onChange={(event) => setCurrentQuery(event.target.value)}
            placeholder="Thema, Veedel oder Ort suchen..."
            className="app-input py-3 pl-10"
          />
        </div>
        <div>
          <label className="app-label">Von</label>
          <input
            type="date"
            value={minDate}
            onChange={(event) => setFilterParam('minDate', event.target.value || undefined)}
            className="app-input"
          />
        </div>
        <div>
          <label className="app-label">Bis</label>
          <input
            type="date"
            value={maxDate}
            onChange={(event) => setFilterParam('maxDate', event.target.value || undefined)}
            className="app-input"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <FilterGroup title="Datenquelle" description={FILTER_EXPLANATIONS.sources}>
          {MODE_OPTIONS.map((option) => (
            <FilterChip
              key={option.value}
              label={option.label}
              active={mode === option.value}
              onClick={() => setFilterParam('mode', option.value === 'all' ? undefined : option.value)}
            />
          ))}
        </FilterGroup>
        <FilterGroup title="Treffergenauigkeit" description={FILTER_EXPLANATIONS.confidence}>
          {CONFIDENCE_OPTIONS.map((option) => (
            <FilterChip
              key={option.value}
              label={option.label}
              active={confidence === option.value}
              onClick={() => setFilterParam('confidence', option.value === 'all' ? undefined : option.value)}
            />
          ))}
        </FilterGroup>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterChip label="Alle Bezirke" active={!selectedDistrict} onClick={() => setDistrict(undefined)} />
        {DISTRICT_ORDER.map((districtId) => (
          <FilterChip
            key={districtId}
            label={getDistrictLabel(districtId)}
            active={selectedDistrict === districtId}
            onClick={() => setDistrict(selectedDistrict === districtId ? undefined : districtId)}
          />
        ))}
      </div>

      {loading ? (
        <div className="app-surface p-10">
          <LoadingSpinner />
        </div>
      ) : error || !districts ? (
        <ErrorMessage message={error?.message || 'Atlasdaten konnten nicht geladen werden.'} onRetry={refetch} />
      ) : (
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <AtlasMap
            districts={districts}
            selectedDistrict={selectedDistrict || undefined}
            statsByDistrict={statsByDistrict}
            onSelectDistrict={setDistrict}
          />

          <div className="app-surface p-5">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-app-text">
                  {selectedDistrict ? `Bezirk ${getDistrictLabel(selectedDistrict)}` : 'Gesamtblick'}
                </h3>
                <p className="mt-1 text-sm text-app-muted">
                  {panelRecords.length} räumlich zugeordnete Sitzungen
                  {selectedDistrict && selectedStat ? ` in ${selectedStat.label}` : ''}
                </p>
              </div>
              <div className="rounded-xl border border-app-border bg-app-surface-alt px-3 py-2 text-right text-xs text-app-muted">
                <div>Letzte Sitzung</div>
                <div className="font-semibold text-app-text">{formatDateOnly(lastMeetingDate) || 'Keine Angabe'}</div>
              </div>
            </div>

            {summaryTopTerms.length > 0 && (
              <div className="mb-5">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-app-muted">Häufige Orte / Begriffe</p>
                <div className="flex flex-wrap gap-2">
                  {summaryTopTerms.map((term) => (
                    <span
                      key={term}
                      className="app-badge-accent px-3 py-1 text-xs"
                    >
                      {term}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {panelRecords.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-app-border bg-app-surface-alt/80 p-8 text-center text-app-muted">
                Für die aktuellen Filter wurden keine räumlich zugeordneten Sitzungen gefunden.
              </div>
            ) : (
              <div className="space-y-3">
                {displayRecords.map((record) => {
                  const highlight = pickRecordHighlightMatch(record, selectedDistrict || undefined, confidence);
                  return (
                    <Link
                      key={`${record.source}-${record.id}`}
                      to={`/meetings/${btoa(encodeURIComponent(record.id)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`}
                      className="block rounded-2xl border border-app-border bg-app-surface-alt/80 p-4 transition-colors hover:bg-app-surface-alt"
                    >
                      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-app-text">{record.name}</p>
                          <p className="mt-1 text-xs text-app-muted">
                            {record.location || 'Ort unbekannt'}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-mono text-app-warning">{formatDateTime(record.start)}</div>
                          <div className="mt-1 flex justify-end gap-2">
                            <span className={`app-badge px-2 py-0.5 text-[10px] uppercase ${
                              record.source === 'live'
                                ? 'border-app-success/20 bg-app-success/10 text-app-success'
                                : 'border-app-warning/20 bg-app-warning/10 text-app-warning'
                            }`}>
                              {record.source}
                            </span>
                            {highlight && (
                              <span className="app-badge-accent px-2 py-0.5 text-[10px] uppercase">
                                {CONFIDENCE_LABELS[highlight.confidence]}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {highlight && (
                        <div className="space-y-2 text-xs text-app-muted">
                          <p>
                            <span className="font-semibold text-app-text">Treffer:</span>{' '}
                            {highlight.matchedTerms.join(', ')}
                          </p>
                          <p>
                            <span className="font-semibold text-app-text">Quelle:</span>{' '}
                            {highlight.sourceFields.join(', ')}
                          </p>
                        </div>
                      )}
                    </Link>
                  );
                })}

                {panelRecords.length > displayRecords.length && (
                  <p className="pt-2 text-xs text-app-muted">
                    Es werden die {displayRecords.length} neuesten Treffer angezeigt.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
