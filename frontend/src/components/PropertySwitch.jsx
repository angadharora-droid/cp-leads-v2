import { Building } from 'lucide-react';

import { cn } from '@/lib/utils';
import { PROPERTY_CODES, useProperties } from '@/lib/properties';

/**
 * HCP · CPA · CPNM as a segmented switch, the same shape as the calendar's
 * view switcher. `codes` limits the choice (the room calendar offers only
 * properties with rooms); a single choice shows as a plain label.
 *
 * @param {object} props
 * @param {string} props.value
 * @param {(code: string) => void} props.onChange
 * @param {string[]} [props.codes]
 * @param {string} [props.className]
 */
export default function PropertySwitch({ value, onChange, codes = PROPERTY_CODES, className }) {
  const properties = useProperties();
  const nameOf = (code) => properties?.find((p) => p.code === code)?.name || code;
  if (codes.length === 1) {
    return (
      <span
        className={cn('inline-flex h-9 items-center gap-1.5 rounded-md border bg-muted/40 px-3 text-sm font-semibold', className)}
        title={nameOf(codes[0])}
      >
        <Building className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {codes[0]}
      </span>
    );
  }
  return (
    <div
      role="tablist"
      aria-label="Property"
      className={cn('inline-flex h-9 items-center rounded-md border bg-muted/40 p-0.5', className)}
    >
      {codes.map((code) => (
        <button
          key={code}
          type="button"
          role="tab"
          aria-selected={value === code}
          title={nameOf(code)}
          onClick={() => onChange(code)}
          className={cn(
            'h-8 rounded px-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3',
            value === code ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
