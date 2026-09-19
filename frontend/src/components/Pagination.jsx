import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const PAGE_SIZES = [10, 20, 50, 100];

/**
 * List pagination: range summary, page-size picker and first/prev/next/last.
 *
 * @param {object} props
 * @param {number} props.page 1-based current page
 * @param {number} props.limit rows per page
 * @param {number} props.total total rows
 * @param {(page: number) => void} props.onPageChange
 * @param {(limit: number) => void} [props.onLimitChange]
 * @param {string} [props.noun] e.g. "leads"
 */
function Pagination({ page, limit, total, onPageChange, onLimitChange, noun = 'items' }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const go = (p) => onPageChange(Math.min(Math.max(1, p), totalPages));

  return (
    <nav
      className="flex flex-col items-center justify-between gap-3 sm:flex-row"
      aria-label="Pagination"
    >
      <p className="text-sm text-muted-foreground">
        Showing <span className="font-medium tabular-nums text-foreground">{from}</span>–
        <span className="font-medium tabular-nums text-foreground">{to}</span> of{' '}
        <span className="font-medium tabular-nums text-foreground">{total}</span> {noun}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {onLimitChange ? (
          <Select value={String(limit)} onValueChange={(v) => onLimitChange(Number(v))}>
            <SelectTrigger className="h-9 w-[8.75rem]" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} per page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-9 w-9" disabled={page <= 1} onClick={() => go(1)} aria-label="First page">
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9" disabled={page <= 1} onClick={() => go(page - 1)} aria-label="Previous page">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2 text-sm tabular-nums text-muted-foreground">
            Page <span className="font-medium text-foreground">{page}</span> of{' '}
            <span className="font-medium text-foreground">{totalPages}</span>
          </span>
          <Button variant="outline" size="icon" className="h-9 w-9" disabled={page >= totalPages} onClick={() => go(page + 1)} aria-label="Next page">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9" disabled={page >= totalPages} onClick={() => go(totalPages)} aria-label="Last page">
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </nav>
  );
}

export { Pagination, PAGE_SIZES };
export default Pagination;
