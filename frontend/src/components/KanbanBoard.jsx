import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Stage-column board shared by the enquiry and rate-contract pipelines.
 * Columns scroll horizontally with snap points on narrow screens and stretch
 * to fill the width on wide ones; each column header carries its stage color
 * and count.
 *
 * @param {object} props
 * @param {Array<{key: string, label: string, color: string, hint?: string, subtitle?: string, items: Array}>} props.columns
 * @param {(item: object, column: object) => React.ReactNode} props.renderCard
 * @param {(item: object) => string} [props.getKey]
 * @param {boolean} [props.loading]
 */
function KanbanBoard({ columns, renderCard, getKey = (item) => item._id, loading = false, className }) {
  if (loading) {
    return (
      <div className={cn('grid gap-2', className)} style={{ gridTemplateColumns: `repeat(${Math.max(columns.length, 4)}, minmax(0, 1fr))` }}>
        {Array.from({ length: Math.max(columns.length, 4) }).map((_, i) => (
          <Skeleton key={i} className="h-72 min-w-0 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className={cn('kanban-board grid w-full min-w-0 items-start gap-2.5', className)}
      style={{ gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(0, 1fr))` }}
      data-compact={columns.length > 5} role="list" aria-label="Pipeline stages">
      {columns.map((col) => (
        <section
          key={col.key}
          role="listitem"
          aria-label={`${col.label}: ${col.items.length}`}
          className="flex max-h-[calc(100dvh-180px)] min-h-64 min-w-0 flex-col overflow-hidden rounded-xl border bg-muted/60"
        >
          <header
            className="flex shrink-0 items-center justify-between gap-1.5 rounded-t-xl border-b bg-card px-2.5 py-3"
            style={{ boxShadow: `inset 0 3px 0 ${col.color}` }}
          >
            <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: col.color }} aria-hidden="true" />
              <span className="min-w-0" title={col.subtitle ? `${col.label}: ${col.subtitle}` : col.label}>
                <span className="block break-words">{col.label}</span>
                {col.subtitle ? (
                  <span className="block truncate text-[11px] font-medium tabular-nums text-muted-foreground">{col.subtitle}</span>
                ) : null}
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
              {col.items.length}
            </span>
          </header>
          <div className="min-h-0 min-w-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto overscroll-y-contain p-2">
            {col.items.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-8 text-center text-xs leading-relaxed text-muted-foreground">
                {col.hint || 'Nothing here'}
              </p>
            ) : (
              col.items.map((item) => <div key={getKey(item)}>{renderCard(item, col)}</div>)
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Card chrome shared by board cards: whole card is the click target. */
function KanbanCard({ onClick, className, children, ...props }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'kanban-card surface-interactive w-full min-w-0 rounded-lg border bg-card p-3 text-left shadow-card',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export { KanbanBoard, KanbanCard };
export default KanbanBoard;
