import React, { useCallback, useId, useRef } from 'react';
import { CalendarDaysIcon } from '../../components/ui';

interface DateInputFieldProps {
  label: string;
  value: string;
  onChange: (nextValue: string) => void;
  onFocus?: () => void;
  ariaLabel?: string;
  placeholder?: string;
  variant?: 'default' | 'compact';
}

const dateDisplayFormatter = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatDateDisplay(value: string, placeholder: string) {
  if (!value) return placeholder;

  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;

  const displayDate = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(displayDate.getTime())) return value;

  return dateDisplayFormatter.format(displayDate);
}

export const DateInputField: React.FC<DateInputFieldProps> = ({
  label,
  value,
  onChange,
  onFocus,
  ariaLabel,
  placeholder = 'TT.MM.JJJJ',
  variant = 'default',
}) => {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const displayValue = formatDateDisplay(value, placeholder);
  const inputLabel = ariaLabel || label;
  const isCompact = variant === 'compact';

  const openPicker = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;

    onFocus?.();

    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }

    input.focus({ preventScroll: true });
    input.click();
  }, [onFocus]);

  return (
    <div className="min-w-0">
      <label htmlFor={inputId} className={`app-label${isCompact ? ' app-label-compact' : ''}`}>{label}</label>
      <button
        type="button"
        onClick={openPicker}
        className={`app-filter-input-shell w-full text-left${isCompact ? ' app-filter-input-shell-compact' : ''}`}
        aria-label={`${inputLabel} auswaehlen`}
      >
        <span
          className={`app-filter-date-value${isCompact ? ' app-filter-date-value-compact' : ''} ${
            value ? 'text-app-text' : 'text-app-muted'
          }`}
        >
          {displayValue}
        </span>
        <span className="app-filter-date-icon">
          <CalendarDaysIcon />
        </span>
        <input
          id={inputId}
          ref={inputRef}
          type="date"
          aria-label={inputLabel}
          value={value}
          onFocus={onFocus}
          onChange={(event) => onChange(event.target.value)}
          className="app-filter-date-input"
        />
      </button>
    </div>
  );
};
