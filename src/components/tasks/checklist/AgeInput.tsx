import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface AgeInputProps {
  value:     string;
  onChange:  (v: string) => void;
  disabled?: boolean;
}

function parseValue(v: string): { years: string; months: string } {
  if (!v) return { years: '', months: '' };
  const yMatch = v.match(/(\d+)Y/);
  const mMatch = v.match(/(\d+)M/);
  return {
    years:  yMatch ? yMatch[1] : '',
    months: mMatch ? mMatch[1] : '',
  };
}

export function AgeInput({ value, onChange, disabled }: AgeInputProps) {
  const parsed = parseValue(value);
  const [years,  setYears]  = useState(parsed.years);
  const [months, setMonths] = useState(parsed.months);

  useEffect(() => {
    const p = parseValue(value);
    setYears(p.years);
    setMonths(p.months);
  }, [value]);

  function handleChange(newYears: string, newMonths: string) {
    if (!newYears && !newMonths) { onChange(''); return; }
    const parts = [];
    if (newYears)  parts.push(`${newYears}Y`);
    if (newMonths) parts.push(`${newMonths}M`);
    onChange(parts.join(' '));
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 flex items-center gap-1.5">
        <input
          type="number"
          inputMode="numeric"
          min="0"
          max="999"
          value={years}
          onChange={(e) => {
            setYears(e.target.value);
            handleChange(e.target.value, months);
          }}
          disabled={disabled}
          placeholder="0"
          className={cn(
            'w-full h-11 rounded-lg border border-input bg-background',
            'px-3 text-sm focus:outline-none focus:ring-2',
            'focus:ring-brand-blue/30 focus:border-brand-blue',
            'disabled:opacity-50',
          )}
        />
        <span className="shrink-0 text-sm font-medium text-gray-500">Yrs</span>
      </div>
      <div className="flex-1 flex items-center gap-1.5">
        <input
          type="number"
          inputMode="numeric"
          min="0"
          max="11"
          value={months}
          onChange={(e) => {
            setMonths(e.target.value);
            handleChange(years, e.target.value);
          }}
          disabled={disabled}
          placeholder="0"
          className={cn(
            'w-full h-11 rounded-lg border border-input bg-background',
            'px-3 text-sm focus:outline-none focus:ring-2',
            'focus:ring-brand-blue/30 focus:border-brand-blue',
            'disabled:opacity-50',
          )}
        />
        <span className="shrink-0 text-sm font-medium text-gray-500">Mths</span>
      </div>
    </div>
  );
}
