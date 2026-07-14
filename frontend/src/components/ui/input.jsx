import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

const Input = forwardRef(({ className, type = 'text', ...props }, ref) => {
  return (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-[border-color,box-shadow] duration-150 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground hover:border-ring/40 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export { Input };
export default Input;
