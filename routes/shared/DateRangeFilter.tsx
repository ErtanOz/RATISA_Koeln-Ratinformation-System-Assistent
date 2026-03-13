import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { validateDateRange } from '../../utils/dateFilters';
import { DateInputField } from './DateInputField';

export const DateRangeFilter: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const [specificDate, setSpecificDate] = useState('');
  const [minDate, setMinDate] = useState(searchParams.get('minDate') || '');
  const [maxDate, setMaxDate] = useState(searchParams.get('maxDate') || '');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    const urlMinDate = searchParams.get('minDate') || '';
    const urlMaxDate = searchParams.get('maxDate') || '';
    if (urlMinDate && urlMinDate === urlMaxDate) {
      setSpecificDate(urlMinDate);
      setMinDate('');
      setMaxDate('');
    } else {
      setSpecificDate('');
      setMinDate(urlMinDate);
      setMaxDate(urlMaxDate);
    }
    setValidationError(null);
  }, [searchParams]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const error = validateDateRange(minDate || undefined, maxDate || undefined);
    setValidationError(error);
    if (error) return;

    const nextParams = new URLSearchParams(location.search);
    if (specificDate) {
      nextParams.set('minDate', specificDate);
      nextParams.set('maxDate', specificDate);
    } else {
      if (minDate) nextParams.set('minDate', minDate);
      else nextParams.delete('minDate');
      if (maxDate) nextParams.set('maxDate', maxDate);
      else nextParams.delete('maxDate');
    }
    nextParams.set('page', '1');
    navigate({ search: nextParams.toString() });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="app-filter-shell mb-6"
    >
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)] xl:items-start">
        <div className="app-filter-group">
          <DateInputField
            label="Exaktes Datum"
            value={specificDate}
            onChange={(nextValue) => {
              setSpecificDate(nextValue);
              if (nextValue) {
                setMinDate('');
                setMaxDate('');
              }
              setValidationError(null);
            }}
          />
        </div>
        <div className="app-filter-group">
          <div className="app-date-range-fields">
            <div className="app-date-range-field">
              <DateInputField
                label="Von"
                value={minDate}
                onChange={(nextValue) => {
                  setMinDate(nextValue);
                  setSpecificDate('');
                  setValidationError(null);
                }}
              />
            </div>
            <div className="app-date-range-field">
              <DateInputField
                label="Bis"
                value={maxDate}
                onChange={(nextValue) => {
                  setMaxDate(nextValue);
                  setSpecificDate('');
                  setValidationError(null);
                }}
              />
            </div>
          </div>
        </div>
      </div>
      {validationError && (
        <p className="mt-3 rounded-md border border-app-danger/25 bg-app-danger/10 px-3 py-2 text-xs text-app-danger">
          {validationError}
        </p>
      )}
      <div className="mt-5 flex justify-stretch sm:justify-end">
        <button type="submit" className="app-button-primary w-full rounded-2xl px-8 py-3.5 text-base sm:w-auto">Filter anwenden</button>
      </div>
    </form>
  );
};
