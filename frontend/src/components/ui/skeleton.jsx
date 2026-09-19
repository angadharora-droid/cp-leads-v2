import { cn } from '@/lib/utils';

/** Loading placeholder with a soft shimmer sweep (static under reduced motion). */
function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-muted before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-foreground/[0.06] before:to-transparent',
        className
      )}
      aria-hidden="true"
      {...props}
    />
  );
}

export { Skeleton };
export default Skeleton;
