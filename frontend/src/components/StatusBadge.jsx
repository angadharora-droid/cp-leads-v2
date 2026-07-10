import { cn } from '@/lib/utils';

/**
 * Lead status -> CSS variable token (defined in index.css).
 * Non Contracted=slate, Contracted=green.
 */
const STATUS_TOKEN = {
  'Non Contracted': '--status-non-contracted',
  Contracted: '--status-contracted',
};

export const LEAD_STATUSES = ['Non Contracted', 'Contracted'];

/**
 * Colored pill for a lead's pipeline status. The color is driven by a CSS
 * variable so it adapts automatically to light/dark themes.
 *
 * @param {object} props
 * @param {string} props.status
 * @param {string} [props.className]
 */
function StatusBadge({ status, className }) {
  const token = STATUS_TOKEN[status] || '--muted-foreground';
  const style = {
    backgroundColor: `hsl(var(${token}) / 0.12)`,
    color: `hsl(var(${token}))`,
    borderColor: `hsl(var(${token}) / 0.25)`,
  };
  return (
    <span
      style={style}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        className
      )}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: `hsl(var(${token}))` }}
        aria-hidden="true"
      />
      {status || 'Unknown'}
    </span>
  );
}

export { StatusBadge };
export default StatusBadge;
