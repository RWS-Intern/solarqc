import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface MeasurementInputProps {
  value:        number | undefined;
  unit?:        string;
  expectedMin?: number;
  expectedMax?: number;
  onChange:     (value: number | undefined) => void;
  onBlur?:      () => void;
  disabled?:    boolean;
}

// Advisory reading only — it never sets `status`. The inspector still picks
// Pass/Fail/N/A manually via the same three buttons every other point uses;
// the range hint is context, not a verdict. Every measurement field in the
// live template currently has expectedMin/expectedMax undefined (Sarvesh's
// call, still pending — plan §9), so this renders plainly with no message
// until both bounds exist; the hint activates automatically the moment they
// do, with no code change needed then.
export function MeasurementInput({
  value, unit, expectedMin, expectedMax, onChange, onBlur, disabled,
}: MeasurementInputProps) {
  const hasRange = expectedMin !== undefined && expectedMax !== undefined;

  let hint: { text: string; className: string } | null = null;
  if (hasRange && value !== undefined) {
    if (value < expectedMin!)      hint = { text: '⚠ Below target',  className: 'text-amber-600' };
    else if (value > expectedMax!) hint = { text: '⚠ Above target',  className: 'text-amber-600' };
    else                            hint = { text: '✓ Within range', className: 'text-green-600' };
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          onBlur={onBlur}
          disabled={disabled}
          placeholder="Measured value"
          className="h-10 w-32 text-sm"
        />
        {unit && <span className="text-sm text-gray-500">{unit}</span>}
        {hint && <span className={cn('text-xs font-medium', hint.className)}>{hint.text}</span>}
      </div>
    </div>
  );
}
