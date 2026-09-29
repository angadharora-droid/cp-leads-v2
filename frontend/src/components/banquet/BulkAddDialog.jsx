import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ListPlus } from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PROPERTY_CODES } from '@/lib/properties';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// The columns each section reads from a line, in the setup Excel's order.
const FORMATS = {
  venues: { columns: 'Name, Hall charge', example: 'Palacio A, 25000\nMillenium, 15000\nBoard Room 1' },
  sessions: { columns: 'Name, Start, End', example: 'Breakfast, 08:00 AM, 10:30 AM\nLunch, 11:00 AM, 04:00 PM\nDinner, 07:00 PM, 11:30 PM' },
  functionType: { columns: 'Name', example: 'Wedding\nConference\nBirthday' },
  menuType: {
    columns: 'Name, Rate, Per guest or Flat, Courses (separated by |)',
    example: '06 Course Veg Meal, 1200, Per guest, Welcome Drinks | Starters | Soups | Main Course | Dessert\nVegetarian Hi-Tea, 450',
  },
  rated: { columns: 'Name, Rate, Per guest or Flat', example: 'Chat Counter, 175, Per guest\nDJ System with Dance Floor, 15000, Flat' },
};

/**
 * Rows from pasted text: tab-separated when copied from Excel, otherwise
 * comma-separated. Quoted cells (Excel quotes a cell with line breaks) may
 * hold the separator or line breaks.
 */
function parseTable(text) {
  const delim = text.includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

/** "Rs. 1,200" → 1200; blank → 0; anything else → NaN. */
function amount(value) {
  const text = String(value ?? '').replace(/rs\.?|₹|,|\s/gi, '');
  if (!text) return 0;
  return /^\d+(\.\d+)?$/.test(text) ? Number(text) : NaN;
}

const HEADER_WORDS = ['name', 'venue', 'session', 'category', 'property'];

/** One pasted line as the entry it adds, or an error to show. */
function toItem(cells, part) {
  // Rows copied from the setup Excel start with the property code; header rows are skipped.
  const c = PROPERTY_CODES.includes(cells[0]?.toUpperCase()) ? cells.slice(1) : cells;
  if (!c.length || HEADER_WORDS.includes(c[0].toLowerCase())) return null;
  const name = c[0];
  if (!name) return { error: 'No name' };
  if (name.length > 200) return { name, error: 'Name is too long' };
  if (part === 'venues') {
    const hallCharge = amount(c[1]);
    if (Number.isNaN(hallCharge)) return { name, error: 'Hall charge must be a number' };
    return { name, hallCharge, detail: hallCharge ? `Hall charge Rs. ${hallCharge.toLocaleString('en-IN')}` : 'No hall charge' };
  }
  if (part === 'sessions') {
    const startTime = c[1] || '';
    const endTime = c[2] || '';
    return { name, startTime, endTime, detail: startTime || endTime ? `${startTime} – ${endTime}` : 'No times' };
  }
  if (part === 'functionType') return { name, detail: '' };
  const rate = amount(c[1]);
  if (Number.isNaN(rate)) return { name, error: 'Rate must be a number' };
  const pricing = /flat/i.test(c[2] || '') ? 'flat' : 'per_pax';
  const item = { name, rate, pricing };
  let detail = `Rs. ${rate.toLocaleString('en-IN')} ${pricing === 'flat' ? 'flat' : 'per guest'}`;
  if (part === 'menuType' && c[3]) {
    item.courses = c[3]
      .split(/\n|\|/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 30);
    detail += ` · ${item.courses.length} course${item.courses.length === 1 ? '' : 's'}`;
  }
  return { ...item, detail };
}

/**
 * Adds many entries to one Banquet Setup section at once: type or paste a
 * list, one entry per line (rows copied from Excel work as they are), check
 * the preview, add. Names the section already has are skipped.
 *
 * @param {object} props
 * @param {'venues'|'sessions'|'functionType'|'menuType'|'addOn'|'requirement'|'liquor'} props.part
 * @param {string} props.property
 * @param {string} props.title section title, e.g. "Venues"
 * @param {Array<{name: string}>} props.existing what the section already has
 */
export default function BulkAddDialog({ open, onOpenChange, part, property, title, existing = [], onAdded }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setText('');
  }, [open]);

  const format = FORMATS[part] || FORMATS.rated;
  const rows = useMemo(() => {
    const have = new Set(existing.map((e) => String(e.name).trim().toLowerCase()));
    const seen = new Set();
    return parseTable(text)
      .map((cells) => toItem(cells, part))
      .filter(Boolean)
      .map((row) => {
        if (row.error) return { ...row, status: 'error' };
        const key = row.name.toLowerCase();
        if (have.has(key)) return { ...row, status: 'exists' };
        if (seen.has(key)) return { ...row, status: 'repeat' };
        seen.add(key);
        return { ...row, status: 'new' };
      });
  }, [text, part, existing]);
  const fresh = rows.filter((r) => r.status === 'new');
  const errors = rows.filter((r) => r.status === 'error').length;

  async function add() {
    setBusy(true);
    try {
      const items = fresh.map(({ detail, status, ...item }) => item);
      const res = await api.post('/banquet/bulk', { property, part, items });
      const { added = 0, skipped = [] } = res?.data?.data || {};
      toast.success(`${added} added to ${property} ${title.toLowerCase()}`, {
        description: skipped.length ? `${skipped.length} already there, skipped` : undefined,
      });
      onAdded?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Bulk add failed'));
    } finally {
      setBusy(false);
    }
  }

  const STATUS = {
    new: { label: 'New', className: 'border-success/40 bg-success/10 text-success' },
    exists: { label: 'Already there', className: 'border-border bg-muted text-muted-foreground' },
    repeat: { label: 'Repeated', className: 'border-border bg-muted text-muted-foreground' },
    error: { label: 'Check this', className: 'border-destructive/40 bg-destructive/10 text-destructive' },
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListPlus className="h-4 w-4 text-primary" aria-hidden="true" />
            Bulk add {title.toLowerCase()} — {property}
          </DialogTitle>
          <DialogDescription>
            One per line: <span className="font-medium text-foreground">{format.columns}</span>. Separate the columns with
            commas, or copy the rows from Excel (including the setup sheet) and paste them. Names {property} already has are
            skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor={`bulk-${part}`}>List</Label>
          <Textarea
            id={`bulk-${part}`}
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={format.example}
            className="font-mono text-xs"
            disabled={busy}
          />
        </div>

        {rows.length ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {fresh.length} new
              {rows.length - fresh.length - errors ? ` · ${rows.length - fresh.length - errors} skipped` : ''}
              {errors ? ` · ${errors} to check (not added)` : ''}
            </p>
            <ul className="max-h-64 divide-y overflow-y-auto rounded-md border" aria-label="Preview">
              {rows.map((row, i) => (
                <li key={`${row.name}-${i}`} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate font-medium', row.status === 'new' ? 'text-foreground' : 'text-muted-foreground')}>
                      {row.name || '—'}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{row.error || row.detail}</span>
                  </span>
                  <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium', STATUS[row.status].className)}>
                    {STATUS[row.status].label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:space-x-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={add} disabled={busy || !fresh.length}>
            {busy ? <Spinner size="sm" className="text-current" /> : <ListPlus className="h-4 w-4" aria-hidden="true" />}
            Add {fresh.length || ''} {fresh.length === 1 ? 'entry' : 'entries'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
