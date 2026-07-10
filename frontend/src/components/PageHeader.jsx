import { cn } from '@/lib/utils';

/**
 * Page-level header with a title, optional description, and right-aligned actions.
 *
 * @param {object} props
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} [props.description]
 * @param {React.ReactNode} [props.actions] right-aligned action buttons
 * @param {string} [props.className]
 */
function PageHeader({ title, description, actions, className, children }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions || children ? (
        <div className="flex flex-shrink-0 items-center gap-2">
          {actions}
          {children}
        </div>
      ) : null}
    </div>
  );
}

export { PageHeader };
export default PageHeader;
