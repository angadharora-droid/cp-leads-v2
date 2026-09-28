import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { BookOpenText, Loader2, Plus, Save, Trash2 } from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const rs = (amount) => `Rs. ${Math.round(Number(amount) || 0).toLocaleString('en-IN')}`;

const KIND_LABELS = {
  booking: 'Booking confirmed',
  payment: 'Payment received',
  invoice: 'Invoice',
  credit_note: 'Credit note',
  cancellation: 'Booking cancelled',
  adjustment: 'Adjustment',
};

function CreditDialog({ credit, onClose, onSubmit }) {
  const [form, setForm] = useState({
    enabled: credit?.enabled ?? true,
    limit: String(credit?.limit || ''),
    days: String(credit?.days || ''),
    notes: credit?.notes || '',
  });
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Credit line</DialogTitle>
          <DialogDescription>How much this registered company may owe, and for how many days.</DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={form.enabled}
            onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
          />
          Credit allowed
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cr-limit">Credit limit (Rs.)</Label>
            <Input id="cr-limit" type="number" min={0} disabled={!form.enabled} value={form.limit} onChange={(e) => setForm((f) => ({ ...f, limit: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cr-days">Credit days</Label>
            <Input id="cr-days" type="number" min={0} disabled={!form.enabled} value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cr-notes">Notes</Label>
            <Input id="cr-notes" placeholder="e.g. Approved by GM on 12 Sep" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit({ ...form, limit: Number(form.limit) || 0, days: Number(form.days) || 0 });
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EntryDialog({ onClose, onSubmit }) {
  const [form, setForm] = useState({
    kind: 'invoice',
    direction: 'debit',
    amount: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    description: '',
    reference: '',
  });
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add ledger entry</DialogTitle>
          <DialogDescription>Bookings and payments post themselves; add invoices, credit notes and adjustments here.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={form.kind} onValueChange={(kind) => setForm((f) => ({ ...f, kind }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="invoice">Invoice (owed)</SelectItem>
                <SelectItem value="credit_note">Credit note (given back)</SelectItem>
                <SelectItem value="adjustment">Adjustment</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.kind === 'adjustment' ? (
            <div className="space-y-1.5">
              <Label>Direction</Label>
              <Select value={form.direction} onValueChange={(direction) => setForm((f) => ({ ...f, direction }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debit">Increase what is owed</SelectItem>
                  <SelectItem value="credit">Reduce what is owed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div />
          )}
          <div className="space-y-1.5">
            <Label htmlFor="le-amount">Amount (Rs.)</Label>
            <Input id="le-amount" type="number" min={0} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="le-date">Date</Label>
            <Input id="le-date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="le-desc">Description</Label>
            <Input id="le-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="le-ref">Reference</Label>
            <Input id="le-ref" placeholder="Invoice / credit note number" value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !(Number(form.amount) > 0)}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit({ ...form, amount: Number(form.amount) });
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Credit line and ledger of a registered company: what it may owe, every
 * booking, payment, invoice and credit note, and the running balance.
 */
export default function LedgerCard({ lead }) {
  const { user } = useAuth();
  const canManage = ['admin', 'manager'].includes(user?.role);
  const [data, setData] = useState(null);
  const [dialog, setDialog] = useState('');
  const [removing, setRemoving] = useState('');
  const base = `/leads/${lead._id}`;

  const load = useCallback(async () => {
    try {
      const res = await api.get(`${base}/ledger`);
      setData(res?.data?.data || null);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load the ledger'));
    }
  }, [base]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(request, message) {
    try {
      const res = await request();
      setData(res?.data?.data || null);
      toast.success(message);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save'));
      throw err;
    }
  }

  const credit = data?.credit || {};
  const totals = data?.totals || {};
  const rows = [...(data?.rows || [])].reverse();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpenText className="h-4 w-4 text-primary" />
              Credit &amp; ledger
            </CardTitle>
            <CardDescription>Registered companies only — individuals pay in advance.</CardDescription>
          </div>
          {canManage && data ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setDialog('credit')}>
                Credit line
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDialog('entry')}>
                <Plus className="h-4 w-4" />
                Entry
              </Button>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!data ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-3 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Credit line</p>
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {credit.enabled ? `${rs(credit.limit)} · ${credit.days} days` : 'None'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Balance owed</p>
                <p className={cn('text-sm font-semibold tabular-nums', totals.overLimit ? 'text-destructive' : 'text-foreground')}>
                  {rs(totals.balance)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Available</p>
                <p className={cn('text-sm font-semibold tabular-nums', totals.available < 0 ? 'text-destructive' : 'text-success')}>
                  {credit.enabled ? rs(totals.available) : '—'}
                </p>
              </div>
            </div>
            {totals.overLimit ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                Over the credit limit by {rs(totals.balance - totals.limit)}.
              </p>
            ) : null}
            {credit.enabled && credit.approvedByName ? (
              <p className="text-xs text-muted-foreground">
                Set by {credit.approvedByName} on {formatDate(credit.approvedAt)}
                {credit.notes ? ` — ${credit.notes}` : ''}
              </p>
            ) : null}
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No entries yet. Won bookings and payments received post here on their own.</p>
            ) : (
              <div className="max-h-80 overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/60 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">Date</th>
                      <th className="px-2 py-1.5 text-left font-medium">Entry</th>
                      <th className="px-2 py-1.5 text-right font-medium">Owed</th>
                      <th className="px-2 py-1.5 text-right font-medium">Paid</th>
                      <th className="px-2 py-1.5 text-right font-medium">Balance</th>
                      {canManage ? <th className="w-8" /> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((row) => (
                      <tr key={row._id}>
                        <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-muted-foreground">{formatDate(row.date)}</td>
                        <td className="px-2 py-1.5">
                          <span className="block text-foreground">{row.description || KIND_LABELS[row.kind]}</span>
                          {row.reference ? <span className="block text-xs text-muted-foreground">{row.reference}</span> : null}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{row.debit ? rs(row.debit) : ''}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-success">{row.credit ? rs(row.credit) : ''}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium tabular-nums">{rs(row.balance)}</td>
                        {canManage ? (
                          <td className="px-1">
                            {!row.auto ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                aria-label="Remove entry"
                                disabled={removing === row._id}
                                onClick={async () => {
                                  setRemoving(row._id);
                                  try {
                                    await submit(() => api.delete(`${base}/ledger/${row._id}`), 'Entry removed');
                                  } catch {
                                    // shown by submit
                                  } finally {
                                    setRemoving('');
                                  }
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
      {dialog === 'credit' ? (
        <CreditDialog
          credit={credit}
          onClose={() => setDialog('')}
          onSubmit={(body) => submit(() => api.put(`${base}/credit`, body), 'Credit line saved')}
        />
      ) : null}
      {dialog === 'entry' ? (
        <EntryDialog onClose={() => setDialog('')} onSubmit={(body) => submit(() => api.post(`${base}/ledger`, body), 'Entry added')} />
      ) : null}
    </Card>
  );
}
