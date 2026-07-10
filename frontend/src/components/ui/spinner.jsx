import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

function Spinner({ className, size = 'default', ...props }) {
  const sizes = {
    sm: 'h-4 w-4',
    default: 'h-6 w-6',
    lg: 'h-8 w-8',
  };
  return (
    <Loader2
      className={cn('animate-spin text-muted-foreground', sizes[size] || sizes.default, className)}
      aria-hidden="true"
      {...props}
    />
  );
}

export { Spinner };
export default Spinner;
