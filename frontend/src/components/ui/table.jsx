import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

const Table = forwardRef(({ className, ...props }, ref) => (
  <div className="table-scroll relative max-h-[calc(100dvh-240px)] w-full overflow-auto rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" tabIndex={0} role="region" aria-label="Scrollable records">
    <table
      ref={ref}
      className={cn('w-full caption-bottom text-sm', className)}
      {...props}
    />
  </div>
));
Table.displayName = 'Table';

const TableHeader = forwardRef(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn('sticky top-0 z-[1] bg-muted [&_tr]:border-b', className)}
    {...props}
  />
));
TableHeader.displayName = 'TableHeader';

const TableBody = forwardRef(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn('[&_tr:last-child]:border-0 [&_tr:nth-child(even)]:bg-muted/20', className)}
    {...props}
  />
));
TableBody.displayName = 'TableBody';

const TableFooter = forwardRef(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      'border-t bg-muted/50 font-medium [&>tr]:last:border-b-0',
      className
    )}
    {...props}
  />
));
TableFooter.displayName = 'TableFooter';

const TableRow = forwardRef(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      'border-b transition-colors duration-100 hover:!bg-primary/5 focus-within:!bg-primary/5 data-[state=selected]:!bg-primary/10',
      className
    )}
    {...props}
  />
));
TableRow.displayName = 'TableRow';

const TableHead = forwardRef(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-semibold text-muted-foreground [&:has([role=checkbox])]:pr-0',
      className
    )}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

const TableCell = forwardRef(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      'px-4 py-3 align-middle leading-relaxed [&:has([role=checkbox])]:pr-0',
      className
    )}
    {...props}
  />
));
TableCell.displayName = 'TableCell';

const TableCaption = forwardRef(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn('mt-4 text-sm text-muted-foreground', className)}
    {...props}
  />
));
TableCaption.displayName = 'TableCaption';

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
};
