import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

/** "Draft" / "Approved" / "Printed 3 Sep" / "Emailed 3 Sep" — where an estimate has got to. */
export function estimateStatus(est) {
  if (!est) return { label: 'Not raised', tone: 'muted' };
  if (est.status !== 'approved') return { label: 'Draft', tone: 'warning' };
  const last = est.emails?.length ? est.emails[est.emails.length - 1] : null;
  if (last?.at) return { label: `Emailed ${formatDate(last.at)}`, tone: 'success' };
  if (est.printedAt) return { label: `Printed ${formatDate(est.printedAt)}`, tone: 'info' };
  return { label: est.approval?.at ? `Approved ${formatDate(est.approval.at)}` : 'Approved', tone: 'success' };
}

/**
 * Email an estimate to finance. "To" starts with the addresses kept under
 * Estimate settings; subject and note fall back to the standard ones when
 * left blank.
 */
export function EmailEstimateDialog({ open, onOpenChange, estimate, onDone }) {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setCc('');
    setSubject('');
    setMessage('');
    setLoadingRecipients(true);
    api
      .get('/estimates/settings')
      .then((res) => {
        if (!alive) return;
        const list = res?.data?.data?.recipients || [];
        setTo(list.map((r) => r.email).filter(Boolean).join(', '));
      })
      .catch(() => alive && setTo(''))
      .finally(() => alive && setLoadingRecipients(false));
    return () => {
      alive = false;
    };
  }, [open]);

  async function send() {
    if (!to.trim()) return toast.error('Type at least one address, or add the finance addresses under settings');
    setIsSending(true);
    try {
      const res = await api.post(`/estimates/${estimate._id}/email`, {
        to: to.trim(),
        cc: cc.trim() || undefined,
        subject: subject.trim() || undefined,
        message: message.trim() || undefined,
      });
      toast.success(`Estimate ${estimate.number} emailed`);
      onDone?.(res?.data?.data);
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to email the estimate'));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isSending && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Email estimate {estimate?.number}</DialogTitle>
          <DialogDescription>
            Both pages go as one PDF, as approved. Leave the subject and note blank to use the standard ones.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="est-mail-to">To (finance)</Label>
            <Input
              id="est-mail-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={loadingRecipients ? 'Loading finance addresses…' : 'finance@…, accounts@…'}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="est-mail-cc">CC (optional)</Label>
            <Input id="est-mail-cc" value={cc} onChange={(e) => setCc(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="est-mail-subject">Subject</Label>
            <Input
              id="est-mail-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={`Banquet Estimate ${estimate?.number || ''} — standard subject`}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="est-mail-msg">Note</Label>
            <Textarea
              id="est-mail-msg"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Standard covering note to finance"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Cancel
          </Button>
          <Button onClick={send} disabled={isSending}>
            {isSending ? <Spinner className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EmailEstimateDialog;
