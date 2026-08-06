import { useState, useRef, useEffect } from 'react';
import { X, ChevronDown } from 'lucide-react';

interface Engineer {
  uid:           string;
  displayName:   string;
  engineerCode?: string;
}

interface EngineerComboboxProps {
  engineers:        Engineer[];
  value:            string;
  onChange:         (uid: string) => void;
  allowUnassigned?: boolean;
  placeholder?:     string;
  disabled?:        boolean;
  className?:       string;
}

function displayOf(eng: Engineer | undefined): string {
  if (!eng) return '';
  return `${eng.displayName}${eng.engineerCode ? ` — ${eng.engineerCode}` : ''}`;
}

export function EngineerCombobox({
  engineers,
  value,
  onChange,
  allowUnassigned = false,
  placeholder     = 'Search by name or code…',
  disabled        = false,
  className       = '',
}: EngineerComboboxProps) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState(() => displayOf(engineers.find((e) => e.uid === value)));
  const ref = useRef<HTMLDivElement>(null);

  // Sync display label when value or engineer list changes (e.g. form reset, async load)
  useEffect(() => {
    setQuery(displayOf(engineers.find((e) => e.uid === value)));
  }, [value, engineers]);

  // Close and restore display label on click-outside
  useEffect(() => {
    const label = displayOf(engineers.find((e) => e.uid === value));
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(label);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [value, engineers]);

  const filtered = engineers.filter((eng) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      eng.displayName.toLowerCase().includes(q) ||
      (eng.engineerCode ?? '').toLowerCase().includes(q)
    );
  });

  function handleSelect(uid: string) {
    onChange(uid);
    setQuery(displayOf(engineers.find((e) => e.uid === uid)));
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
    setQuery('');
    setOpen(false);
  }

  const showDropdown = open && (filtered.length > 0 || allowUnassigned);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div className="relative">
        <input
          type="text"
          value={query}
          disabled={disabled}
          placeholder={allowUnassigned && !value ? '— Unassigned —' : placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            // Clear selection display so all engineers show immediately
            if (value && query === displayOf(engineers.find((e) => e.uid === value))) {
              setQuery('');
            }
            setOpen(true);
          }}
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

      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto">
          {allowUnassigned && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(''); }}
              className="w-full text-left px-3 py-2 text-sm text-gray-400 italic hover:bg-blue-50 hover:text-blue-700 transition-colors"
            >
              — Unassigned —
            </button>
          )}
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400 italic">No engineers found.</p>
          ) : (
            filtered.map((eng) => (
              <button
                key={eng.uid}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(eng.uid); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors ${
                  eng.uid === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-900'
                }`}
              >
                {eng.displayName}
                {eng.engineerCode && (
                  <span className="ml-1.5 font-mono text-xs text-gray-400">
                    {eng.engineerCode}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
