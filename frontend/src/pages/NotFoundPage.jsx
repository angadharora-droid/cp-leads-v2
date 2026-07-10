import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * 404 fallback for unmatched routes.
 */
function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Compass className="h-8 w-8" />
      </div>
      <div className="space-y-1">
        <p className="text-4xl font-bold tracking-tight text-foreground">404</p>
        <h1 className="text-lg font-semibold text-foreground">
          Page not found
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The page you are looking for doesn&apos;t exist or may have been moved.
        </p>
      </div>
      <Button asChild>
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}

export { NotFoundPage };
export default NotFoundPage;
