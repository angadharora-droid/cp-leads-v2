import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';

/**
 * Compact multi-select: a Select-styled trigger that opens a checklist and
 * stays open while ticking. Selected names show in the trigger; nothing
 * else takes space on the form.
 *
 * @param {object} props
 * @param {string} [props.id]
 * @param {Array<{_id: string, name: string, hint?: string}>} props.options
 * @param {string[]} props.value selected ids
 * @param {(ids: string[]) => void} props.onChange
 * @param {string} [props.placeholder]
 * @param {string} [props.emptyHint] shown when there are no options
 * @param {boolean} [props.disabled]
 * @param {string} [props.className]
 */
function MultiSelect({
  id,
  options = [],
  value = [],
  onChange,
  placeholder = 'Pick…',
  emptyHint = 'Nothing configured yet',
  disabled,
  className,
}) {
  const selected = new Set(value.map(String));
  const picked = options.filter((o) => selected.has(String(o._id)));
  const label = picked.map((o) => o.name).join(', ');

  function toggle(idValue) {
    const next = new Set(selected);
    const key = String(idValue);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange([...next]);
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={disabled || options.length === 0}>
        <button
          id={id}
          type="button"
          className={cn(
            'form-control flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm shadow-sm transition-[border-color,box-shadow] duration-150 hover:border-ring/40 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
          aria-haspopup="menu"
        >
          <span className={cn('min-w-0 flex-1 truncate', !label && 'text-muted-foreground')}>
            {options.length === 0 ? emptyHint : label || placeholder}
          </span>
          {picked.length > 1 ? (
            <span className="shrink-0 rounded-full bg-primary/15 px-1.5 text-[11px] font-semibold tabular-nums text-primary">
              {picked.length}
            </span>
          ) : null}
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] min-w-[14rem] overflow-y-auto"
      >
        <DropdownMenuLabel className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>{picked.length ? `${picked.length} selected` : placeholder}</span>
          {picked.length ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onChange([]);
              }}
              className="inline-flex items-center gap-1 rounded px-1 text-[11px] font-medium text-primary hover:bg-muted"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((option) => {
          const on = selected.has(String(option._id));
          return (
            <DropdownMenuPrimitive.CheckboxItem
              key={option._id}
              checked={on}
              onCheckedChange={() => toggle(option._id)}
              onSelect={(e) => e.preventDefault()}
              className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-2 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-muted focus:text-foreground"
            >
              <span
                className={cn(
                  'absolute left-2 flex h-4 w-4 items-center justify-center rounded-sm border',
                  on ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background'
                )}
                aria-hidden="true"
              >
                {on ? <Check className="h-3 w-3" /> : null}
              </span>
              <span className="min-w-0 flex-1 truncate">{option.name}</span>
              {option.hint ? (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{option.hint}</span>
              ) : null}
            </DropdownMenuPrimitive.CheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { MultiSelect };
export default MultiSelect;
