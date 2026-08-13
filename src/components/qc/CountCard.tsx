import { cn } from '@/lib/utils';

export function CountCard({
  label, count, loading, color, onClick,
}: {
  label:    string;
  count:    number | undefined;
  loading:  boolean;
  color?:   { bg: string; text: string };
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'rounded-xl border border-gray-200 bg-white p-3 flex flex-col gap-1 text-left',
        onClick && 'hover:border-brand-blue/40 hover:bg-blue-50/30 transition-colors cursor-pointer',
      )}
    >
      <span className={cn('text-2xl font-bold', color?.text ?? 'text-gray-900')}>
        {loading ? '—' : count ?? 0}
      </span>
      <span className="text-xs text-gray-500">{label}</span>
    </Tag>
  );
}
