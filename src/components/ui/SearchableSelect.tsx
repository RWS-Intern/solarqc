import { useState, useRef, useEffect } from 'react';
import { X, ChevronDown } from 'lucide-react';

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value:        string;
  onChange:     (value: string) => void;
  options:      SearchableSelectOption[];
  placeholder?: string;
  className?:   string;
  disabled?:    boolean;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  className = '',
  disabled = false,
}: SearchableSelectProps) {
  const selectedLabel = options.find((o) => o.value === value)?.label ?? '';

  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState(selectedLabel);
  const ref               = useRef<HTMLDivElement>(null);

  // Keep input text in sync when external value changes
  useEffect(() => {
    setQuery(options.find((o) => o.value === value)?.label ?? '');
  }, [value, options]);

  // Close on outside click, reverting any partially-typed query
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        // Revert input to the current committed selection
        setQuery(options.find((o) => o.value === value)?.label ?? '');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [value, options]);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(query.toLowerCase()),
  );

  function handleSelect(opt: SearchableSelectOption) {
    onChange(opt.value);
    setQuery(opt.label);
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={ref} className={`relative ${className}${disabled ? ' opacity-50' : ''}`}>
      <div className="relative">
        <input
          type="text"
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => {
            if (disabled) return;
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => { if (!disabled) setOpen(true); }}
          className={`h-9 w-full rounded-lg border border-input bg-background pl-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue text-gray-700${disabled ? ' cursor-not-allowed bg-gray-50' : ''}`}
        />
        {value ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        )}
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full min-w-[160px] rounded-lg border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
