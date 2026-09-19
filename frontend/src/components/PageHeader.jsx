import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Page-level header: optional breadcrumb trail and right-aligned actions.
 *
 * Keep the page name, supporting context and actions in one consistent place.
 * A caller may explicitly hide the title when it is already presented nearby.
 *
 * @param {object} props
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} [props.description] shown only with `showTitle`
 * @param {React.ReactNode} [props.actions] right-aligned action buttons
 * @param {Array<{label: string, to?: string}>} [props.breadcrumbs]
 * @param {React.ReactNode} [props.eyebrow] small label above the title
 * @param {boolean} [props.showTitle] draw the title/description visibly
 * @param {string} [props.className]
 */
function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  eyebrow,
  showTitle = false,
  className,
  children,
}) {
  const hasActions = Boolean(actions || children);
  return (
    <div className={cn('flex flex-col gap-2', !showTitle && !hasActions && !breadcrumbs?.length && 'sr-only page-header-hidden', className)}>
      {breadcrumbs?.length ? (
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
          {breadcrumbs.map((crumb, i) => {
            const last = i === breadcrumbs.length - 1;
            return (
              <span key={`${crumb.label}-${i}`} className="flex items-center gap-1">
                {crumb.to && !last ? (
                  <Link
                    to={crumb.to}
                    className="rounded-sm text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current={last ? 'page' : undefined} className={last ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                    {crumb.label}
                  </span>
                )}
                {!last ? (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden="true" />
                ) : null}
              </span>
            );
          })}
        </nav>
      ) : null}

      {showTitle ? (
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0 flex-1 basis-64">
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h1 className="break-words text-xl font-semibold leading-tight tracking-tight text-foreground">{title}</h1>
            {description ? (
              <div className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
                {description}
              </div>
            ) : null}
          </div>
          {hasActions ? (
            <div className="page-actions flex max-w-full flex-wrap items-center gap-2 pt-0.5 sm:justify-end">
              {actions}
              {children}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <h1 className="sr-only">{title}</h1>
          {hasActions ? (
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {actions}
              {children}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export { PageHeader };
export default PageHeader;
