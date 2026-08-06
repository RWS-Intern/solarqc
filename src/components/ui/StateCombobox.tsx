import { useState, useRef, useEffect } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { useAppConfig } from '@/hooks/useAppConfig';

interface StateComboboxProps {
  id?:          string;
  value:        string;
  onChange:     (value: string) => void;
  states?:      string[];
  placeholder?: string;
  disabled?:    boolean;
  className?:   string;
}

export function StateCombobox({
  id,
  value,
  onChange,
  states: statesProp,
  placeholder = 'Select or type state...',
  disabled = false,
  className = '',
}: StateComboboxProps) {
  const { config } = useAppConfig();
  const states     = statesProp ?? (config.districtsByState ? Object.keys(config.districtsByState) : []);

  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState(value);
  const ref               = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(value);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [value]);

  const filtered = states.filter((s) =>
    s.toLowerCase().includes(query.toLowerCase()),
  );

  const showNewOption =
    query.trim().length > 0 &&
    !states.some((s) => s.toLowerCase() === query.trim().toLowerCase());

  function handleSelect(s: string) {
    onChange(s);
    setQuery(s);
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div className="relative">
        <input
          id={id}
          type="text"
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
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

      {open && (filtered.length > 0 || showNewOption) && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(s); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors"
            >
              {s}
            </button>
          ))}
          {showNewOption && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(query.trim()); }}
              className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 border-t border-gray-100 transition-colors"
            >
              + Use &ldquo;{query.trim()}&rdquo; as new state
            </button>
          )}
        </div>
      )}
    </div>
  );
}
