import { cn } from '@/lib/utils';

interface MeasurementInputProps {
  value:        string;
  onChange:     (v: string) => void;
  unit?:        string;
  disabled?:    boolean;
  placeholder?: string;
}

export function MeasurementInput({
  value, onChange, unit, disabled, placeholder = '0.00',
}: MeasurementInputProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          'flex-1 h-11 rounded-lg border border-input bg-background',
          'px-3 text-sm focus:outline-none focus:ring-2',
          'focus:ring-brand-blue/30 focus:border-brand-blue',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        )}
      />
      {unit && (
        <span className="shrink-0 rounded-md bg-gray-100 border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 min-w-[52px] text-center">
          {unit}
        </span>
      )}
    </div>
  );
}
