import { useState, useRef, useEffect } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { useAppConfig } from '@/hooks/useAppConfig';

interface DistrictComboboxProps {
  id?:          string;
  value:        string;
  onChange:     (value: string) => void;
  districts?:   string[];
  placeholder?: string;
  disabled?:    boolean;
  className?:   string;
}

export function DistrictCombobox({
  id,
  value,
  onChange,
  districts: districtsProp,
  placeholder = 'Select or type district...',
  disabled = false,
  className = '',
}: DistrictComboboxProps) {
  const { config }  = useAppConfig();
  const districts   = districtsProp ?? config.districts ?? [];

  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState(value);
  const ref               = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = districts.filter((d) =>
    d.toLowerCase().includes(query.toLowerCase()),
  );

  const showNewOption =
    query.trim().length > 0 &&
    !districts.some(
      (d) => d.toLowerCase() === query.trim().toLowerCase(),
    );

  function handleSelect(d: string) {
    onChange(d);
    setQuery(d);
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
            onChange(e.target.value);
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
          {filtered.map((d) => (
            <button
              key={d}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(d); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors"
            >
              {d}
            </button>
          ))}
          {showNewOption && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(query.trim()); }}
              className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 border-t border-gray-100 transition-colors"
            >
              + Use "{query.trim()}" as new district
            </button>
          )}
        </div>
      )}
    </div>
  );
}
