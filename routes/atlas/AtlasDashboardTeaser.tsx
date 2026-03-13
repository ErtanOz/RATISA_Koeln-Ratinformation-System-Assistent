import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapIcon } from '../../components/ui';
import { buildAtlasTopDistrict, loadAtlasSummary } from '../../services/atlasService';
import { AtlasSummaryDocument } from '../../types';

export const AtlasDashboardTeaser: React.FC = () => {
  const [summary, setSummary] = useState<AtlasSummaryDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void loadAtlasSummary(controller.signal)
      .then((nextSummary) => {
        if (!controller.signal.aborted) {
          setSummary(nextSummary);
          setLoading(false);
        }
      })
      .catch((nextError) => {
        if (nextError instanceof DOMException && nextError.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setError(nextError as Error);
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  const topRows = useMemo(
    () =>
      (summary?.districts || [])
        .filter((stat) => stat.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
    [summary],
  );
  const topDistrict = summary?.topDistrictId
    ? summary.districts.find((district) => district.districtId === summary.topDistrictId) ||
      buildAtlasTopDistrict(topRows)
    : buildAtlasTopDistrict(topRows);
  const maxCount = topRows[0]?.count || 1;

  return (
    <div className="app-surface p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-xl bg-app-warning/10 p-3 text-app-warning">
          <MapIcon />
        </div>
        <div>
          <h3 className="text-base font-semibold text-app-text">Themenatlas</h3>
          <p className="text-xs text-app-muted">Wo betreffen Themen die Stadt besonders häufig?</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-5 w-2/3 animate-pulse rounded-full bg-app-surface-alt" />
          <div className="h-3 w-full animate-pulse rounded-full bg-app-surface-alt" />
          <div className="h-3 w-5/6 animate-pulse rounded-full bg-app-surface-alt" />
        </div>
      ) : error ? (
        <p className="text-sm text-app-warning">Atlasdaten konnten nicht geladen werden.</p>
      ) : (
        <>
          <p className="text-sm text-app-text">
            {topDistrict ? (
              <>
                Spitzenreiter: <span className="font-semibold text-app-text">{topDistrict.label}</span>{' '}
                mit <span className="font-semibold text-app-warning">{topDistrict.count}</span> Treffern.
              </>
            ) : (
              'Noch keine räumlich zugeordneten Sitzungen im Datensatz.'
            )}
          </p>
          <p className="mt-2 text-xs text-app-muted">
            {summary?.totalMatchedCount || 0} räumlich zugeordnete Sitzungen im Atlasindex.
          </p>
          <p className="mt-2 text-xs text-app-muted">
            Dies ist nur die Kurzfassung. Die klickbare Bezirkskarte liegt auf der separaten Atlas-Seite.
          </p>

          {topRows.length > 0 && (
            <div className="mt-4 space-y-3">
              {topRows.map((row) => (
                <div key={row.districtId}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-semibold text-app-text">{row.label}</span>
                    <span className="font-mono text-app-muted">{row.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-app-surface-alt">
                    <div
                      className="h-full rounded-full bg-app-warning"
                      style={{ width: `${(row.count / maxCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Link
        to="/atlas"
        className="app-button-warning mt-5"
      >
        Zur Atlasansicht
      </Link>
    </div>
  );
};
