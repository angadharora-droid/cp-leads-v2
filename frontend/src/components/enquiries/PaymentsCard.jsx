import { useState } from 'react';
import { differenceInCalendarDays, format } from 'date-fns';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, Pencil, Plus, RotateCcw, Send, Trash2, Wallet } from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { ADVANCE_MODES, advanceModeLabel } from '@/lib/enquiryStages';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
const toInputDate = (value) => (value ? format(new Date(value), 'yyyy-MM-dd') : '');

/** "Due in 5 days", "Due today", "Overdue by 3 days". */
function dueLabel(milestone) {
  if (!milestone.dueDate) return { text: 'No due date', tone: 'muted' };
  const days = differenceInCalendarDays(new Date(milestone.dueDate), new Date());
  if (days > 0) return { text: `Due in ${days} day${days === 1 ? '' : 's'} · ${formatDate(milestone.dueDate)}`, tone: 'muted' };
  if (days === 0) return { text: 'Due today', tone: 'warning' };
  return { text: `Overdue by ${-days} day${days === -1 ? '' : 's'} · was due ${formatDate(milestone.dueDate)}`, tone: 'destructive' };
}

function ReceiptDialog({ milestone, onClose, onSubmit }) {
  const [form, setForm] = useState(() => ({
    amount: String(milestone?.amount || ''),
    date: toInputDate(new Date()),
    mode: 'neft',
    reference: '',
  }));
  const [busy, setBusy] = useState(false);
  if (!milestone) return null;
  async function submit() {
    setBusy(true);
    try {
      await onSubmit({ ...form, amount: Number(form.amount) || undefined });
      onClose();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record {milestone.label.toLowerCase()} received</DialogTitle>
          <DialogDescription>Due amount {rs(milestone.amount)}. A registered company&apos;s ledger gets the receipt.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="rc-amount">Amount received</Label>
            <Input id="rc-amount" type="number" min={0} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rc-date">Received on</Label>
            <Input id="rc-date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Select value={form.mode} onValueChange={(mode) => setForm((f) => ({ ...f, mode }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADVANCE_MODES.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rc-ref">Reference</Label>
            <Input id="rc-ref" placeholder="UTR / cheque no." value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDialog({ open, enquiry, onClose, onSubmit }) {
  const pending = (enquiry.payments?.milestones || []).filter((m) => m.status !== 'received');
  const [rows, setRows] = useState(() =>
    pending.map((m) => ({ _id: m._id, label: m.label, amount: String(m.amount), dueDate: toInputDate(m.dueDate) }))
  );
  const [busy, setBusy] = useState(false);
  const summary = enquiry.paymentSummary || {};
  const received = summary.received || 0;
  const planned = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const gap = Math.round((summary.value || 0) - received - planned);

  function setRow(i, patch) {
    setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  async function submit() {
    if (rows.some((r) => !r.label.trim())) return toast.error('Name every payment');
    setBusy(true);
    try {
      await onSubmit({
        milestones: rows.map((r) => ({
          ...(r._id ? { _id: r._id } : {}),
          label: r.label.trim(),
          amount: Number(r.amount) || 0,
          ...(r.dueDate ? { dueDate: r.dueDate } : {}),
        })),
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit payment schedule</DialogTitle>
          <DialogDescription>
            Booking value {rs(summary.value)} (menu revenue + GST){received ? `, ${rs(received)} already received` : ''}. Received
            payments stay as they are.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={row._id || `new-${i}`} className="grid grid-cols-[1fr_8rem] gap-2 sm:grid-cols-[1fr_8rem_10rem_auto] sm:items-center">
              <Input placeholder="e.g. Second instalment" value={row.label} onChange={(e) => setRow(i, { label: e.target.value })} />
              <Input type="number" min={0} placeholder="Amount" value={row.amount} onChange={(e) => setRow(i, { amount: e.target.value })} />
              <Input type="date" value={row.dueDate} onChange={(e) => setRow(i, { dueDate: e.target.value })} />
              <Button variant="ghost" size="icon" aria-label="Remove payment" onClick={() => setRows((list) => list.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setRows((list) => [...list, { label: '', amount: '', dueDate: '' }])}>
              <Plus className="h-4 w-4" />
              Add payment
            </Button>
            <span className={cn('text-xs', gap === 0 ? 'text-muted-foreground' : 'font-medium text-amber-600 dark:text-amber-400')}>
              Planned {rs(planned)}
              {gap === 0 ? ' — matches the balance' : gap > 0 ? ` — ${rs(gap)} not scheduled yet` : ` — ${rs(-gap)} more than the balance`}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Payments card on the enquiry page: the booking's milestones, what came in
 * and what is due, recording receipts and emailing payment requests — by
 * hand, or automatically once a payment falls due.
 */
export default function PaymentsCard({ enquiry, onChanged, isManager }) {
  const [receiving, setReceiving] = useState(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState('');
  const milestones = enquiry.payments?.milestones || [];
  const summary = enquiry.paymentSummary || {};
  const closed = ['lost', 'cancelled'].includes(enquiry.stage);
  const base = `/enquiries/${enquiry._id}/payments`;

  async function run(key, request, success) {
    setBusy(key);
    try {
      const res = await request();
      if (success) toast.success(success);
      onChanged?.(res?.data?.data?.enquiry);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not update the payments'));
      throw err;
    } finally {
      setBusy('');
    }
  }

  const drift = milestones.length && summary.value && Math.abs(summary.scheduled - summary.value) >= 1;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4 text-primary" />
            Payments
          </CardTitle>
          {!closed ? (
            <div className="flex flex-wrap items-center gap-2">
              {milestones.length ? (
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" />
                  Edit schedule
                </Button>
              ) : null}
              <Button
                size="sm"
                variant={milestones.length ? 'ghost' : 'default'}
                disabled={busy === 'standard' || !summary.value}
                onClick={() => run('standard', () => api.post(`${base}/standard`), 'Standard schedule applied').catch(() => {})}
              >
                {busy === 'standard' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                {milestones.length ? 'Reset to standard' : 'Apply standard schedule'}
              </Button>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-3 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Booking value</p>
            <p className="text-sm font-semibold tabular-nums text-foreground">{rs(summary.value)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Received</p>
            <p className="text-sm font-semibold tabular-nums text-success">{rs(summary.received)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className={cn('text-sm font-semibold tabular-nums', summary.dueNow ? 'text-destructive' : 'text-foreground')}>
              {rs(summary.outstanding)}
            </p>
          </div>
        </div>

        {drift ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
            The schedule adds up to {rs(summary.scheduled)} but the booking is now {rs(summary.value)} — edit the schedule or reset it to
            the standard one.
          </p>
        ) : null}

        {milestones.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No payment schedule yet. The standard schedule is added when the contract is emailed{summary.value ? ', or apply it now' : ''}.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {milestones.map((m) => {
              const received = m.status === 'received';
              const due = dueLabel(m);
              const requests = m.requests || [];
              const lastRequest = requests[requests.length - 1];
              return (
                <li key={m._id} className="flex flex-wrap items-start justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {m.label} <span className="font-normal tabular-nums text-muted-foreground">· {rs(received ? m.received?.amount : m.amount)}</span>
                    </p>
                    {received ? (
                      <p className="text-xs text-success">
                        Received {formatDate(m.received?.date)}
                        {m.received?.mode ? ` · ${advanceModeLabel(m.received.mode)}` : ''}
                        {m.received?.reference ? ` · ${m.received.reference}` : ''}
                        {m.received?.byName ? ` · recorded by ${m.received.byName}` : ''}
                      </p>
                    ) : (
                      <p
                        className={cn(
                          'text-xs',
                          due.tone === 'destructive' && 'text-destructive',
                          due.tone === 'warning' && 'text-amber-600 dark:text-amber-400',
                          due.tone === 'muted' && 'text-muted-foreground'
                        )}
                      >
                        {due.text}
                      </p>
                    )}
                    {!received && lastRequest ? (
                      <p className="text-xs text-muted-foreground">
                        Requested {requests.length}× · last {formatDate(lastRequest.at)}
                        {lastRequest.auto ? ' (automatic)' : lastRequest.byName ? ` by ${lastRequest.byName}` : ''}
                      </p>
                    ) : null}
                  </div>
                  {!closed ? (
                    <div className="flex flex-wrap gap-1.5">
                      {received ? (
                        isManager ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy === `reopen-${m._id}`}
                            onClick={() => run(`reopen-${m._id}`, () => api.post(`${base}/${m._id}/reopen`), 'Receipt undone').catch(() => {})}
                          >
                            <RotateCcw className="h-4 w-4" />
                            Undo
                          </Button>
                        ) : null
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === `request-${m._id}` || !enquiry.contactEmail}
                            title={enquiry.contactEmail ? `Email a payment request to ${enquiry.contactEmail}` : 'Set the contact email first'}
                            onClick={() =>
                              run(`request-${m._id}`, () => api.post(`${base}/${m._id}/request`, {}), `Payment request emailed to ${enquiry.contactEmail}`).catch(() => {})
                            }
                          >
                            {busy === `request-${m._id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            Request
                          </Button>
                          <Button size="sm" onClick={() => setReceiving(m)}>
                            <CheckCircle2 className="h-4 w-4" />
                            Received
                          </Button>
                        </>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {milestones.length && !closed ? (
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
              checked={Boolean(enquiry.payments?.autoRequest)}
              disabled={busy === 'auto'}
              onChange={(e) =>
                run('auto', () => api.put(base, { autoRequest: e.target.checked }), e.target.checked ? 'Automatic requests on' : 'Automatic requests off').catch(() => {})
              }
            />
            <span>
              <span className="font-medium text-foreground">Request payments automatically</span>
              <span className="block text-xs text-muted-foreground">
                When a payment falls due, the client is emailed a request{enquiry.contactEmail ? ` at ${enquiry.contactEmail}` : ''}, and reminded every 3
                days until it is recorded.
              </span>
            </span>
          </label>
        ) : null}
      </CardContent>

      {receiving ? (
        <ReceiptDialog
          milestone={receiving}
          onClose={() => setReceiving(null)}
          onSubmit={(body) => run(`receive-${receiving._id}`, () => api.post(`${base}/${receiving._id}/receive`, body), `${receiving.label} recorded`)}
        />
      ) : null}
      {editing ? (
        <ScheduleDialog
          open
          enquiry={enquiry}
          onClose={() => setEditing(false)}
          onSubmit={(body) => run('schedule', () => api.put(base, body), 'Payment schedule saved')}
        />
      ) : null}
    </Card>
  );
}
