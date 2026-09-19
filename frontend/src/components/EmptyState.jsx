import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Friendly empty-state placeholder for lists/tables with no data.
 *
 * @param {object} props
 * @param {React.ComponentType<{ className?: string }>} [props.icon] lucide icon
 * @param {React.ReactNode} [props.title]
 * @param {React.ReactNode} [props.description]
 * @param {React.ReactNode} [props.action] e.g. a "Create" button
 * @param {'default'|'compact'} [props.size]
 * @param {string} [props.className]
 */
function EmptyState({
  icon: Icon = Inbox,
  title = 'Nothing here yet',
  description,
  action,
  size = 'default',
  className,
}) {
  const compact = size === 'compact';
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/20 px-6 text-center',
        compact ? 'py-8' : 'py-12',
        className
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-full bg-primary/10 text-primary',
          compact ? 'h-10 w-10' : 'h-12 w-12'
        )}
      >
        <Icon className={compact ? 'h-5 w-5' : 'h-6 w-6'} aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export { EmptyState };
export default EmptyState;
