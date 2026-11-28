import { useState } from 'react';

interface RecordOption {
  id: string;
  label: string;
}

interface SearchableRecordPickerProps {
  label: string;
  options: readonly RecordOption[];
  value: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}

export function SearchableRecordPicker({ label, options, value, onSelect, disabled }: SearchableRecordPickerProps) {
  const [query, setQuery] = useState('');
  const terms = query.trim().toLowerCase().split(/\s+/);
  const matches = options.filter((option) => terms.every((term) => option.label.toLowerCase().includes(term)));
  const visible = matches.some((option) => option.id === value)
    ? matches
    : [...options.filter((option) => option.id === value), ...matches];

  return (
    <div className="form-stack">
      <label className="form-group">
        <span className="form-label">Search {label.toLowerCase()}</span>
        <input
          type="search"
          className="form-control"
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <label className="form-group">
        <span className="form-label">{label}</span>
        <select
          className="form-control"
          value={value}
          disabled={disabled}
          onChange={(event) => {
            onSelect(event.target.value);
            setQuery('');
          }}
        >
          <option value="">Select {label.toLowerCase()}</option>
          {visible.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
      {matches.length === 0 && !disabled ? <p role="status">No matching {label.toLowerCase()}.</p> : null}
    </div>
  );
}
