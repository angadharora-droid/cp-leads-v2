import { Link } from 'react-router-dom';
import { Compass, LayoutDashboard, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * 404 fallback for unmatched routes.
 */
function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <div className="relative w-full max-w-md text-center">
        {/* Soft brand glow behind the illustration. */}
        <div
          className="pointer-events-none absolute inset-x-0 -top-10 mx-auto h-48 w-48 rounded-full bg-primary/10 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative flex flex-col items-center gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-4 ring-primary/5">
            <Compass className="h-8 w-8" aria-hidden="true" />
          </div>

          <div className="space-y-2">
            <p className="eyebrow">Error 404</p>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
              We couldn&apos;t find that page
            </h1>
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
              The link may be out of date, or the page may have moved. Head back to
              somewhere familiar and carry on from there.
            </p>
          </div>

          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-center">
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link to="/leads">
                <Users className="h-4 w-4" aria-hidden="true" />
                Go to leads
              </Link>
            </Button>
            <Button asChild className="w-full sm:w-auto">
              <Link to="/">
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                Back to dashboard
              </Link>
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Still stuck? Use the sidebar to find what you were looking for.
          </p>
        </div>
      </div>
    </div>
  );
}

export { NotFoundPage };
export default NotFoundPage;
