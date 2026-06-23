import { Input } from '@/components/ui/input';

interface DateInputProps {
  value:    string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

export function DateInput({ value, onChange, disabled }: DateInputProps) {
  return (
    <Input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full h-11"
    />
  );
}
