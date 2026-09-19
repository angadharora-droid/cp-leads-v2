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

/** "Emailed 3 Sep" / "Printed 3 Sep" / "Made" — where a sheet has got to. */
export function sheetStatus(sheet) {
  if (!sheet) return { label: 'Not made', tone: 'muted' };
  if (sheet.status !== 'approved') return { label: 'Awaiting approval', tone: 'warning' };
  const last = sheet.emails?.length ? sheet.emails[sheet.emails.length - 1] : null;
  if (last?.at || sheet.emailedAt) return { label: `Emailed ${formatDate(last?.at || sheet.emailedAt)}`, tone: 'success' };
  if (sheet.printedAt) return { label: `Printed ${formatDate(sheet.printedAt)}`, tone: 'info' };
  return { label: 'Approved', tone: 'success' };
}

/**
 * Email a prospectus to the departments. "To" starts with the addresses kept
 * under Prospectus settings; subject and note fall back to the standard ones
 * when left blank.
 */
export function EmailSheetDialog({ open, onOpenChange, sheet, onDone }) {
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
      .get('/prospectus/settings')
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
    if (!to.trim()) return toast.error('Type at least one address, or add the department addresses under settings');
    setIsSending(true);
    try {
      const res = await api.post(`/prospectus/${sheet._id}/email`, {
        to: to.trim(),
        cc: cc.trim() || undefined,
        subject: subject.trim() || undefined,
        message: message.trim() || undefined,
      });
      toast.success(`Prospectus ${sheet.number} emailed`);
      onDone?.(res?.data?.data);
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to email the prospectus'));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isSending && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Email prospectus {sheet?.number}</DialogTitle>
          <DialogDescription>
            The sheet is attached as a PDF. Leave the subject and note blank to use the standard ones.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="fp-mail-to">To (departments)</Label>
            <Input
              id="fp-mail-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={loadingRecipients ? 'Loading department addresses…' : 'kitchen@…, banquets@…'}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fp-mail-cc">CC (optional)</Label>
            <Input id="fp-mail-cc" value={cc} onChange={(e) => setCc(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fp-mail-subject">Subject</Label>
            <Input
              id="fp-mail-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={`Function Prospectus ${sheet?.number || ''} — standard subject`}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fp-mail-msg">Note</Label>
            <Textarea
              id="fp-mail-msg"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Standard covering note to the departments"
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

export default EmailSheetDialog;
