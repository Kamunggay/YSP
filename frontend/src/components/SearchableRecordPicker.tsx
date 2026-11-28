import { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface SearchablePickerOption<T = unknown> {
  id: string;
  primaryLabel: string;
  secondaryLabel?: string;
  badge?: string;
  badgeTone?: 'ready' | 'warning' | 'danger' | 'neutral';
  searchText?: string;
  disabled?: boolean;
  disabledReason?: string;
  meta: T;
}

interface SearchableRecordPickerProps<T = unknown> {
  id: string;
  label: string;
  placeholder?: string;
  valueId: string;
  options: Array<SearchablePickerOption<T>>;
  onSelect: (option: SearchablePickerOption<T> | null) => void;
  onQueryChange?: (query: string) => void;
  loading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  emptyMessage?: string;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
}

export function SearchableRecordPicker<T = unknown>({
  id,
  label,
  placeholder = 'Search by name, code, or reference...',
  valueId,
  options,
  onSelect,
  onQueryChange,
  loading = false,
  errorMessage = null,
  onRetry,
  emptyMessage = 'No matching records found.',
  helperText,
  disabled = false,
  required = false,
}: SearchableRecordPickerProps<T>) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.id === valueId) ?? null,
    [options, valueId],
  );

  // Debounced callback for optional server-side prefix search
  useEffect(() => {
    if (!onQueryChange) {
      return;
    }
    const timer = window.setTimeout(() => {
      onQueryChange(query.trim());
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, onQueryChange]);

  const filteredOptions = useMemo(() => {
    if (onQueryChange) {
      return options;
    }
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return options;
    }
    return options.filter((opt) => {
      const hay = `${opt.primaryLabel} ${opt.secondaryLabel ?? ''} ${opt.badge ?? ''} ${opt.searchText ?? ''} ${opt.id}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [options, query, onQueryChange]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  function commitSelection(opt: SearchablePickerOption<T>) {
    if (opt.disabled) {
      return;
    }
    onSelect(opt);
    setQuery('');
    setHighlightedIndex(0);
    setOpen(false);
  }

  const safeHighlightedIndex = Math.min(highlightedIndex, Math.max(0, filteredOptions.length - 1));

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) {
      return;
    }
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setHighlightedIndex(0);
      setOpen(true);
      e.preventDefault();
      return;
    }
    if (!open) {
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        filteredOptions.length === 0 ? 0 : Math.min(Math.min(prev, filteredOptions.length - 1) + 1, filteredOptions.length - 1),
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(Math.min(prev, filteredOptions.length - 1) - 1, 0));
    } else if (e.key === 'Enter') {
      const target = filteredOptions[safeHighlightedIndex];
      if (target && !target.disabled) {
        e.preventDefault();
        commitSelection(target);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="form-group picker-root" ref={containerRef}>
      <label className="form-label" htmlFor={id}>
        {label}
        {required && <span className="picker-required-mark" aria-hidden="true"> *</span>}
      </label>

      {selectedOption && !open ? (
        <div className="picker-selected-card" data-testid={`${id}-selected`}>
          <div className="picker-selected-main">
            <div className="picker-selected-title-row">
              <span className="picker-primary-label">{selectedOption.primaryLabel}</span>
              {selectedOption.badge && (
                <span className={`s02-status-tag is-${selectedOption.badgeTone === 'danger' ? 'uncertain' : selectedOption.badgeTone === 'warning' ? 'overdue' : 'ready'}`}>
                  {selectedOption.badge}
                </span>
              )}
            </div>
            {selectedOption.secondaryLabel && (
              <span className="picker-secondary-label">{selectedOption.secondaryLabel}</span>
            )}
          </div>
          <div className="picker-selected-actions">
            {!disabled && (
              <>
                <button
                  type="button"
                  className="p02-compact-btn"
                  onClick={() => {
                    setOpen(true);
                    setQuery('');
                  }}
                >
                  Change
                </button>
                <button
                  type="button"
                  className="p02-compact-btn is-subtle-danger"
                  aria-label={`Clear ${label}`}
                  onClick={() => {
                    onSelect(null);
                    setQuery('');
                  }}
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="picker-input-wrap">
          <input
            id={id}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={open && filteredOptions[safeHighlightedIndex] ? `${listboxId}-opt-${safeHighlightedIndex}` : undefined}
            className="form-control picker-search-input"
            placeholder={selectedOption ? selectedOption.primaryLabel : placeholder}
            value={query}
            disabled={disabled}
            onFocus={() => {
              if (!disabled) {
                setHighlightedIndex(0);
                setOpen(true);
              }
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlightedIndex(0);
              if (!open) {
                setOpen(true);
              }
            }}
            onKeyDown={handleKeyDown}
          />
          {selectedOption && (
            <button
              type="button"
              className="p02-compact-btn picker-inline-cancel"
              onClick={() => {
                setOpen(false);
                setQuery('');
              }}
            >
              Keep Current
            </button>
          )}
        </div>
      )}

      {helperText && <span className="picker-helper-text">{helperText}</span>}

      {open && !disabled && (
        <div className="picker-dropdown surface-card" id={listboxId} role="listbox" aria-label={label}>
          {loading && <div className="picker-state-row">Loading authorized records...</div>}

          {!loading && errorMessage && (
            <div className="picker-state-row is-error">
              <span>{errorMessage}</span>
              {onRetry && (
                <button type="button" className="p02-compact-btn" onClick={onRetry}>
                  Retry
                </button>
              )}
            </div>
          )}

          {!loading && !errorMessage && filteredOptions.length === 0 && (
            <div className="picker-state-row">{emptyMessage}</div>
          )}

          {!loading &&
            !errorMessage &&
            filteredOptions.map((opt, idx) => {
              const isSelected = opt.id === valueId;
              const isHighlighted = idx === safeHighlightedIndex;
              return (
                <button
                  key={opt.id}
                  id={`${listboxId}-opt-${idx}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={opt.disabled}
                  className={`picker-option-row ${isSelected ? 'is-selected' : ''} ${isHighlighted ? 'is-highlighted' : ''} ${opt.disabled ? 'is-disabled' : ''}`}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  onClick={() => commitSelection(opt)}
                >
                  <div className="picker-option-top">
                    <span className="picker-primary-label">{opt.primaryLabel}</span>
                    {opt.badge && (
                      <span className={`s02-status-tag is-${opt.badgeTone === 'danger' ? 'uncertain' : opt.badgeTone === 'warning' ? 'overdue' : 'ready'}`}>
                        {opt.badge}
                      </span>
                    )}
                  </div>
                  {(opt.secondaryLabel || (opt.disabled && opt.disabledReason)) && (
                    <span className="picker-secondary-label">
                      {opt.disabled && opt.disabledReason ? opt.disabledReason : opt.secondaryLabel}
                    </span>
                  )}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
