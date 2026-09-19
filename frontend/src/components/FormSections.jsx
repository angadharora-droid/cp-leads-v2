import { Children, isValidElement, useId, useState } from 'react';
import { LayoutList, Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Presentation-only section navigation. All fields stay mounted and retain values. */
export default function FormSections({ children, labels = [], dirty = false, readOnly = false }) {
  const [active, setActive] = useState('all');
  const id = useId();
  const sections = Children.toArray(children).filter(isValidElement);
  return <div className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-1.5">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Form sections">
        <button type="button" onClick={() => setActive('all')} aria-pressed={active === 'all'} className={cn('inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', active === 'all' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
          <LayoutList className="h-3.5 w-3.5" /> All fields
        </button>
        {sections.map((section, i) => <button key={section.key || i} type="button" aria-controls={`${id}-${i}`} aria-pressed={active === i}
          onClick={() => setActive(i)} className={cn('rounded-md px-2.5 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', active === i ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
          {section.props['data-section'] || labels[i] || `Section ${i + 1}`}
        </button>)}
      </div>
      <span className={cn('mr-2 flex items-center gap-1.5 text-xs', dirty ? 'text-warning' : 'text-muted-foreground')} role="status">
        {readOnly ? null : dirty ? <Circle className="h-2 w-2 fill-current" /> : <Check className="h-3.5 w-3.5" />}
        {readOnly ? 'Read only' : dirty ? 'Unsaved changes' : 'No unsaved changes'}
      </span>
    </div>
    {sections.map((section, i) => <fieldset key={section.key || i} id={`${id}-${i}`} disabled={readOnly} className="m-0 min-w-0 border-0 p-0" hidden={active !== 'all' && active !== i}>{section}</fieldset>)}
  </div>;
}
