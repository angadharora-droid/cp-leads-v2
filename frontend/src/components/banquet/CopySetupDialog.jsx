import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy } from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { PROPERTY_CODES, useProperties } from '@/lib/properties';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// What can be copied, in the order Banquet Setup lists it.
const PARTS = [
  { key: 'venues', label: 'Venues', count: (c) => c.venues?.length },
  { key: 'sessions', label: 'Sessions', count: (c) => c.sessions?.length },
  { key: 'functionType', label: 'Function types', count: (c) => c.functionTypes?.length },
  { key: 'menuType', label: 'Menu types', count: (c) => c.menuTypes?.length },
  { key: 'addOn', label: 'Add-on menus', count: (c) => c.addOns?.length },
  { key: 'requirement', label: 'Additional requirements', count: (c) => c.requirements?.length },
  { key: 'liquor', label: 'Liquor options', count: (c) => c.liquorOptions?.length },
  { key: 'rules', label: 'Slot rule and demand dates', count: () => null },
];

function Tick({ id, checked, onChange, children, hint }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/60">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
      />
      <span className="min-w-0 text-sm">
        <span className="font-medium text-foreground">{children}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}

/**
 * Copies the property on screen into other properties, for the entries
 * every hotel shares. Entries are matched by name: missing ones are added,
 * existing ones are left as they are unless "update" is ticked. Nothing is
 * deleted, and copies do not stay linked to the source.
 */
export default function CopySetupDialog({ open, onOpenChange, from, config, onCopied }) {
  const properties = useProperties();
  const others = PROPERTY_CODES.filter((code) => code !== from);
  const [to, setTo] = useState(new Set(others));
  const [parts, setParts] = useState(new Set(PARTS.map((p) => p.key)));
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTo(new Set(PROPERTY_CODES.filter((code) => code !== from)));
    setParts(new Set(PARTS.map((p) => p.key)));
    setOverwrite(false);
  }, [open, from]);

  const toggle = (setter) => (key, on) =>
    setter((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  const nameOf = (code) => properties?.find((p) => p.code === code)?.name;

  async function copy() {
    setBusy(true);
    try {
      const res = await api.post('/banquet/copy', { from, to: [...to], parts: [...parts], overwrite });
      const result = res?.data?.data?.result || {};
      const lines = Object.entries(result).map(
        ([code, c]) =>
          `${code}: ${c.added} added${overwrite ? `, ${c.updated} updated` : c.unchanged ? `, ${c.unchanged} already there` : ''}`
      );
      toast.success(`Copied from ${from}`, { description: lines.join(' · ') });
      onCopied?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Copy failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-4 w-4 text-primary" aria-hidden="true" />
            Copy {from}&apos;s setup to other properties
          </DialogTitle>
          <DialogDescription>
            For entries every property shares. Anything a property is missing is added; nothing is deleted. The copies
            are separate — a later change in {from} does not follow them, so copy again when needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <fieldset className="space-y-1">
            <legend className="eyebrow mb-1">Copy to</legend>
            {others.map((code) => (
              <Tick key={code} id={`copy-to-${code}`} checked={to.has(code)} onChange={(on) => toggle(setTo)(code, on)}>
                {code}
                {nameOf(code) ? <span className="font-normal text-muted-foreground"> — {nameOf(code)}</span> : null}
              </Tick>
            ))}
          </fieldset>

          <fieldset className="space-y-1">
            <legend className="eyebrow mb-1">What to copy</legend>
            <div className="grid gap-x-2 sm:grid-cols-2">
              {PARTS.map((part) => {
                const n = config ? part.count(config) : null;
                return (
                  <Tick
                    key={part.key}
                    id={`copy-part-${part.key}`}
                    checked={parts.has(part.key)}
                    onChange={(on) => toggle(setParts)(part.key, on)}
                  >
                    {part.label}
                    {n !== null && n !== undefined ? <span className="font-normal tabular-nums text-muted-foreground"> ({n})</span> : null}
                  </Tick>
                );
              })}
            </div>
          </fieldset>

          <div className="border-t pt-3">
            <Tick
              id="copy-overwrite"
              checked={overwrite}
              onChange={setOverwrite}
              hint={`Entries with the same name there take ${from}'s rates, times, hall charges and active / inactive status.`}
            >
              Also update entries they already have
            </Tick>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:space-x-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={copy} disabled={busy || !to.size || !parts.size}>
            {busy ? <Spinner size="sm" className="text-current" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            Copy to {[...to].join(', ') || '…'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
