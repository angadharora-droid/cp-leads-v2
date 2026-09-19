import { SlidersHorizontal, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ANY = '__any__';

/** Number of filters that carry a value. */
export function activeFilterCount(values) {
  return Object.values(values || {}).filter((v) => v !== '' && v != null).length;
}

/** Toolbar button that opens/closes the filter row and shows how many are set. */
function FilterToggle({ open, count, onClick }) {
  return (
    <Button
      variant={count ? 'secondary' : 'outline'}
      size="sm"
      onClick={onClick}
      aria-expanded={open}
      aria-controls="board-filters"
    >
      <SlidersHorizontal className="h-4 w-4" />
      Filters
      {count ? (
        <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground">
          {count}
        </span>
      ) : null}
    </Button>
  );
}

/**
 * A compact row of filters for a board. Each field is a select or a date;
 * values live in the parent so the board can filter its cards client-side.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {Array<{key: string, label: string, type?: 'select'|'date', options?: Array<{value: string, label: string}>, placeholder?: string, min?: string}>} props.fields
 * @param {Record<string, string>} props.values
 * @param {(key: string, value: string) => void} props.onChange
 * @param {() => void} props.onClear
 * @param {string} [props.className]
 */
function BoardFilters({ open, fields, values, onChange, onClear, className }) {
  if (!open) return null;
  const count = activeFilterCount(values);
  return (
    <div
      id="board-filters"
      className={cn('rounded-xl border bg-card p-3 shadow-card animate-slide-in sm:p-4', className)}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {fields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={`bf-${field.key}`} className="text-xs">
              {field.label}
            </Label>
            {field.type === 'date' ? (
              <Input
                id={`bf-${field.key}`}
                type="date"
                min={field.min || undefined}
                value={values[field.key] || ''}
                onChange={(e) => onChange(field.key, e.target.value)}
                className="h-9"
              />
            ) : (
              <Select
                value={values[field.key] || ANY}
                onValueChange={(v) => onChange(field.key, v === ANY ? '' : v)}
              >
                <SelectTrigger id={`bf-${field.key}`} className="h-9">
                  <SelectValue placeholder={field.placeholder || 'Any'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>{field.placeholder || 'Any'}</SelectItem>
                  {(field.options || []).map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        ))}
      </div>
      {count ? (
        <div className="mt-3 flex items-center justify-between border-t pt-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">{count}</span> filter
            {count === 1 ? '' : 's'} applied
          </p>
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="h-4 w-4" />
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export { BoardFilters, FilterToggle };
export default BoardFilters;
