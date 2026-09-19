import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  BadgeIndianRupee,
  Ban,
  CalendarX2,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FileDown,
  Hourglass,
  FileCheck2,
  FileDiff,
  FileSignature,
  FileText,
  Mail,
  MoreHorizontal,
  Pencil,
  ReceiptText,
  Trash2,
  Trophy,
  XCircle,
} from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { showPdfPreview } from '@/components/PdfPreview';
import { useAuth } from '@/context/AuthContext';
import {
  ADVANCE_MODES,
  ADVANCE_OUTCOMES,
  CANCEL_REASONS,
  CLOSED_STAGE_KEYS,
  LOST_REASONS,
  isDatePassed,
  lastEventDate,
} from '@/lib/enquiryStages';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Triggers a browser download for a blob response. */
export function saveBlob(res, fallbackName) {
  const disposition = res.headers?.['content-disposition'] || '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  const filename = match ? decodeURIComponent(match[1]) : fallbackName;
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Copied');
  } catch {
    toast.error('Could not copy — select the text and copy it manually');
  }
}

/** Shows a PDF response in the in-app viewer — no new tab, no download. */
export function openBlob(res, fallbackName) {
  const disposition = res.headers?.['content-disposition'] || '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  const filename = match ? decodeURIComponent(match[1]) : fallbackName;
  showPdfPreview({ blob: res.data, filename, title: filename.replace(/\.pdf$/i, '') });
}

/** Per-document wording for the send dialog. */
const DOCUMENTS = {
  proposal: {
    title: 'Email proposal',
    endpoint: 'proposal/email',
    previewPath: 'proposal/pdf',
    attachmentLabel: 'Proposal PDF',
    description: 'The proposal PDF is attached with the standard covering note. Sending moves the enquiry to Waitlist.',
    success: 'Proposal emailed — enquiry moved to Waitlist',
  },
  contract: {
    title: 'Email contract',
    endpoint: 'contract/email',
    previewPath: 'contract/pdf',
    attachmentLabel: 'Contract PDF',
    extraNote: 'plus the digital-signing link in the email body',
    alsoAttached: 'The pro-forma invoice goes in the same email.',
    description:
      'The contract and the pro-forma invoice are attached together with the standard covering note and a secure digital-signing link (valid 14 days). Sending makes the booking Provisional.',
    success: 'Contract and pro-forma emailed with the signing link — booking is now Provisional',
  },
  addendum: {
    title: 'Email addendum',
    endpoint: 'addendum/email',
    previewPath: 'addendum/pdf',
    attachmentLabel: 'Addendum PDF',
    extraNote: 'plus a fresh digital-signing link in the email body',
    alsoAttached: 'The revised pro-forma invoice goes in the same email.',
    description:
      'The addendum recording the changes since the contract is attached with the revised pro-forma invoice, the standard covering note and a fresh digital-signing link (valid 14 days). The booking stays Provisional.',
    success: 'Addendum and revised pro-forma emailed with the signing link',
  },
};

/**
 * One send dialog for the proposal, contract and pro-forma: To / CC /
 * Subject / Message pre-filled from the house templates, plus a copy button
 * for the WhatsApp version of the same note.
 */
export function SendDocumentDialog({ open, onOpenChange, enquiry, kind, onDone }) {
  const doc = DOCUMENTS[kind] || DOCUMENTS.proposal;
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);

  useEffect(() => {
    if (!open || !enquiry) return;
    setTo(enquiry.contactEmail || '');
    setCc('');
    setSubject('');
    setMessage('');
    setWhatsapp('');
    setAttachment(null);
    setIsLoading(true);
    api
      .get(`/enquiries/${enquiry._id}/messages/${kind}`)
      .then((res) => {
        const data = res?.data?.data || {};
        setSubject(data.subject || '');
        setMessage(data.email || '');
        setWhatsapp(data.whatsapp || '');
        setAttachment(data.attachment || null);
      })
      .catch((err) => toast.error(getErrorMessage(err, 'Could not load the standard message')))
      .finally(() => setIsLoading(false));
  }, [open, enquiry, kind]);

  async function handleSend() {
    if (!to.trim()) return toast.error('Enter the recipient email');
    setIsSending(true);
    try {
      const res = await api.post(`/enquiries/${enquiry._id}/${doc.endpoint}`, {
        to: to.trim(),
        cc: cc.trim() || undefined,
        subject: subject.trim() || undefined,
        message: message.trim() || undefined,
      });
      toast.success(doc.success);
      onDone?.(res?.data?.data?.enquiry);
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, `Failed to send the ${kind}`));
    } finally {
      setIsSending(false);
    }
  }

  async function handlePreview() {
    setIsPreviewing(true);
    try {
      const res = await api.get(`/enquiries/${enquiry._id}/${doc.previewPath}`, { responseType: 'blob' });
      openBlob(res, attachment?.filename || `${doc.attachmentLabel}.pdf`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not open the PDF'));
    } finally {
      setIsPreviewing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{doc.title}</DialogTitle>
          <DialogDescription>{doc.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {/* What goes with the email: the PDF, built fresh on Send. */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <FileDown className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Attachment</p>
                <p className="truncate text-sm font-medium text-foreground">
                  {attachment?.filename || `${doc.attachmentLabel} — loading…`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {attachment && !attachment.numbered
                    ? 'Number assigned when sent'
                    : 'Generated with the latest details when you press Send'}
                  {doc.alsoAttached ? ` · ${doc.alsoAttached}` : ''}
                  {doc.extraNote ? `, ${doc.extraNote}` : ''}
                </p>
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handlePreview} disabled={isPreviewing || isSending}>
              {isPreviewing ? <Spinner className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              Preview PDF
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${kind}-to`}>To</Label>
              <Input id={`${kind}-to`} type="email" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${kind}-cc`}>CC (optional)</Label>
              <Input id={`${kind}-cc`} value={cc} onChange={(e) => setCc(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${kind}-subject`}>Subject</Label>
            <Input id={`${kind}-subject`} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor={`${kind}-msg`}>Message</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => copyText(whatsapp)}
                disabled={!whatsapp}
                title="Copy the WhatsApp version of this note"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy WhatsApp text
              </Button>
            </div>
            <Textarea
              id={`${kind}-msg`}
              rows={9}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={isLoading ? 'Loading the standard note…' : ''}
              className="font-mono text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={isSending || isLoading}>
            {isSending ? <Spinner className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ChoiceButtons({ value, onChange, disabled }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[
        { key: true, label: 'Yes' },
        { key: false, label: 'No' },
      ].map((opt) => (
        <Button
          key={String(opt.key)}
          type="button"
          variant={value === opt.key ? 'default' : 'outline'}
          onClick={() => onChange(opt.key)}
          disabled={disabled}
          aria-pressed={value === opt.key}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

/**
 * Mark as won. Asks "Advance received?" — yes takes the advance details; no
 * asks "Is it a PPS?" — yes confirms on one-time credit and prints the credit
 * application form, no points back to the pro-forma.
 */
export function WonDialog({ open, onOpenChange, enquiry, onDone }) {
  const [advanceReceived, setAdvanceReceived] = useState(null);
  const [pps, setPps] = useState(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [mode, setMode] = useState('');
  const [reference, setReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAdvanceReceived(null);
      setPps(null);
      setAmount('');
      setDate(today());
      setMode('');
      setReference('');
      setRemarks('');
    }
  }, [open]);

  async function downloadCreditForm() {
    const res = await api.get(`/enquiries/${enquiry._id}/credit-form/pdf`, { responseType: 'blob' });
    openBlob(res, 'Credit Application Form.pdf');
  }

  async function handleSave() {
    if (advanceReceived && !amount.trim()) return toast.error('Enter the advance amount');
    setIsSaving(true);
    try {
      const res = await api.post(`/enquiries/${enquiry._id}/won`, {
        advanceReceived: Boolean(advanceReceived),
        advance: advanceReceived
          ? { amount: amount.trim(), date: date || undefined, mode: mode || '', reference: reference.trim(), remarks: remarks.trim() }
          : undefined,
        pps: !advanceReceived && Boolean(pps),
      });
      if (advanceReceived) {
        toast.success('Advance recorded — enquiry Won');
      } else {
        toast.success('PPS on one-time credit — enquiry Won. Opening the credit application form.');
        try {
          await downloadCreditForm();
        } catch (err) {
          toast.error(getErrorMessage(err, 'Could not download the credit form — use Download credit form from the menu'));
        }
      }
      onDone?.(res?.data?.data?.enquiry);
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to mark as won'));
    } finally {
      setIsSaving(false);
    }
  }

  const canSave = advanceReceived === true || (advanceReceived === false && pps === true);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as won</DialogTitle>
          <DialogDescription>
            Confirming the booking locks its calendar slots. A Won enquiry keeps its dates, venues and
            rates; only the contact and notes stay editable.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Advance received?</p>
            <ChoiceButtons value={advanceReceived} onChange={setAdvanceReceived} disabled={isSaving} />
          </div>

          {advanceReceived === true ? (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="adv-amount">Amount</Label>
                  <Input id="adv-amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Rs. 1,00,000" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="adv-date">Date received</Label>
                  <Input id="adv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="adv-mode">Mode</Label>
                  <Select value={mode} onValueChange={setMode}>
                    <SelectTrigger id="adv-mode">
                      <SelectValue placeholder="How was it paid?" />
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
                  <Label htmlFor="adv-ref">Reference (UTR / receipt no.)</Label>
                  <Input id="adv-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adv-remarks">Remarks (optional)</Label>
                <Textarea id="adv-remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </div>
            </div>
          ) : null}

          {advanceReceived === false ? (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <p className="text-sm font-medium">Is it a PPS?</p>
              <ChoiceButtons value={pps} onChange={setPps} disabled={isSaving} />
              {pps === true ? (
                <p className="text-sm text-muted-foreground">
                  The booking is confirmed on one-time credit. The Credit Application Form is printed,
                  pre-filled for this event, for the applicant and the approval panel to sign.
                </p>
              ) : null}
              {pps === false ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    An advance is required to confirm this booking. The pro-forma invoice went out with
                    the contract; the enquiry stays Provisional until the advance is received.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !canSave}>
            {isSaving ? <Spinner className="h-4 w-4" /> : <Trophy className="h-4 w-4" />}
            {advanceReceived === false && pps ? 'Mark won on credit & print form' : 'Mark as won'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LostDialog({ open, onOpenChange, enquiry, onDone }) {
  const [reasonCode, setReasonCode] = useState('');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const datePassed = isDatePassed(enquiry);

  useEffect(() => {
    if (open) {
      setReasonCode(isDatePassed(enquiry) ? 'date_passed' : '');
      setReason('');
    }
  }, [open, enquiry]);

  async function handleSave() {
    if (!reasonCode) return toast.error('Pick the reason');
    if (reasonCode === 'other' && !reason.trim()) return toast.error('Say why in the note');
    setIsSaving(true);
    try {
      const res = await api.post(`/enquiries/${enquiry._id}/lost`, {
        reasonCode,
        reason: reason.trim() || undefined,
      });
      toast.success('Enquiry marked lost');
      onDone?.(res?.data?.data?.enquiry);
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to mark lost'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark enquiry as lost</DialogTitle>
          <DialogDescription>
            {datePassed
              ? `The event date${lastEventDate(enquiry) ? ` (${formatDate(lastEventDate(enquiry))})` : ''} has passed without a confirmation. `
              : ''}
            The enquiry drops off the active board and frees its slots for anyone waiting on them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="lost-reason-code">Reason</Label>
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger id="lost-reason-code">
                <SelectValue placeholder="Pick the reason" />
              </SelectTrigger>
              <SelectContent>
                {LOST_REASONS.map((r) => (
                  <SelectItem key={r.code} value={r.code}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lost-reason">{reasonCode === 'other' ? 'Note' : 'Note (optional)'}</Label>
            <Textarea id="lost-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Spinner className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            Mark lost
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Cancel a provisional or confirmed booking: the reason is required, and when
 * an advance was received the dialog records what became of it.
 */
export function CancelDialog({ open, onOpenChange, enquiry, onDone }) {
  const [reasonCode, setReasonCode] = useState('');
  const [reason, setReason] = useState('');
  const [advanceOutcome, setAdvanceOutcome] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceNote, setAdvanceNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const hasAdvance = Boolean(enquiry.advance?.received);
  const confirmed = enquiry.stage === 'won';

  useEffect(() => {
    if (open) {
      setReasonCode('');
      setReason('');
      setAdvanceOutcome('');
      setAdvanceAmount(enquiry.advance?.amount || '');
      setAdvanceNote('');
    }
  }, [open, enquiry]);

  async function handleSave() {
    if (!reasonCode) return toast.error('Pick the reason');
    if (reasonCode === 'other' && !reason.trim()) return toast.error('Say why in the note');
    if (hasAdvance && !advanceOutcome) return toast.error('Say what happens to the advance');
    setIsSaving(true);
    try {
      const res = await api.post(`/enquiries/${enquiry._id}/cancel`, {
        reasonCode,
        reason: reason.trim() || undefined,
        ...(hasAdvance
          ? { advanceOutcome, advanceAmount: advanceAmount.trim(), advanceNote: advanceNote.trim() }
          : {}),
      });
      toast.success('Booking cancelled');
      onDone?.(res?.data?.data?.enquiry);
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to cancel the booking'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this booking?</DialogTitle>
          <DialogDescription>
            {confirmed
              ? 'The booking is confirmed. Cancelling takes it out of won revenue and frees its dates for anyone waiting on them.'
              : 'The contract has gone out. Cancelling frees its dates for anyone waiting on them.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason-code">Reason</Label>
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger id="cancel-reason-code">
                <SelectValue placeholder="Pick the reason" />
              </SelectTrigger>
              <SelectContent>
                {CANCEL_REASONS.map((r) => (
                  <SelectItem key={r.code} value={r.code}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">{reasonCode === 'other' ? 'Note' : 'Note (optional)'}</Label>
            <Textarea id="cancel-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {hasAdvance ? (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <p className="text-sm font-medium">
                Advance received{enquiry.advance?.amount ? ` — ${enquiry.advance.amount}` : ''}
                {enquiry.advance?.date ? ` on ${formatDate(enquiry.advance.date)}` : ''}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cancel-advance-outcome">What happens to it</Label>
                  <Select value={advanceOutcome} onValueChange={setAdvanceOutcome}>
                    <SelectTrigger id="cancel-advance-outcome">
                      <SelectValue placeholder="Pick one" />
                    </SelectTrigger>
                    <SelectContent>
                      {ADVANCE_OUTCOMES.map((o) => (
                        <SelectItem key={o.key} value={o.key}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cancel-advance-amount">Amount</Label>
                  <Input
                    id="cancel-advance-amount"
                    value={advanceAmount}
                    onChange={(e) => setAdvanceAmount(e.target.value)}
                    placeholder="Rs. 50,000"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cancel-advance-note">Note (optional)</Label>
                <Input
                  id="cancel-advance-note"
                  value={advanceNote}
                  onChange={(e) => setAdvanceNote(e.target.value)}
                  placeholder="Refund reference, booking adjusted against, deductions…"
                />
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Keep booking
          </Button>
          <Button variant="destructive" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Spinner className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
            Cancel booking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Slot notices for one enquiry: waiting behind another enquiry, the slot just
 * freed up, or the event date has gone by without a confirmation.
 */
export function EnquiryNotices({ enquiry, onChanged, onMarkLost, compact = false }) {
  const [dismissing, setDismissing] = useState(false);
  const waitlisted = enquiry.stage === 'waitlist';
  const freed = !waitlisted && Boolean(enquiry.waitlist?.freedAt) && !CLOSED_STAGE_KEYS.includes(enquiry.stage);
  const passed = isDatePassed(enquiry);
  const changed = Boolean(enquiry.addendumDue) && enquiry.stage === 'provisional';
  if (!waitlisted && !freed && !passed && !changed) return null;

  async function dismiss() {
    setDismissing(true);
    try {
      await api.post(`/enquiries/${enquiry._id}/waitlist/dismiss`);
      onChanged?.();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not dismiss'));
    } finally {
      setDismissing(false);
    }
  }

  const base = compact ? 'text-xs' : 'text-sm';
  return (
    <div className="space-y-2">
      {waitlisted ? (
        <p className={`flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 ${base} text-foreground`}>
          <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <span>
            <span className="font-medium">On the waitlist.</span> The slot is held by{' '}
            <span className="font-medium">{enquiry.waitlist?.heldByName || 'another enquiry'}</span>
            {enquiry.waitlist?.since ? ` since ${formatDate(enquiry.waitlist.since)}` : ''}. Quoting is fine; the
            contract can go out when the slot frees.
          </span>
        </p>
      ) : null}
      {freed ? (
        <div className={`flex flex-wrap items-center justify-between gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 ${base} text-foreground`}>
          <p className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            <span>
              <span className="font-medium">Slot now free.</span> The hold ahead of this enquiry was released
              {enquiry.waitlist?.freedAt ? ` on ${formatDate(enquiry.waitlist.freedAt)}` : ''} — carry on from where it was.
            </span>
          </p>
          <Button type="button" size="sm" variant="ghost" onClick={dismiss} disabled={dismissing}>
            {dismissing ? <Spinner className="h-4 w-4" /> : null}
            Dismiss
          </Button>
        </div>
      ) : null}
      {changed ? (
        <p className={`flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 ${base} text-foreground`}>
          <FileDiff className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <span>
            <span className="font-medium">Details changed since the contract was emailed.</span> Make the addendum
            so the client signs the change — the revised pro-forma invoice goes out with it.
          </span>
        </p>
      ) : null}
      {passed ? (
        <div className={`flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 ${base} text-foreground`}>
          <p className="flex items-start gap-2">
            <CalendarX2 className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <span>
              <span className="font-medium">Date passed.</span> The event date
              {lastEventDate(enquiry) ? ` (${formatDate(lastEventDate(enquiry))})` : ''} has gone by without a
              confirmation.
            </span>
          </p>
          {onMarkLost ? (
            <Button type="button" size="sm" variant="destructive" onClick={onMarkLost}>
              <XCircle className="h-4 w-4" />
              Mark as lost
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Contact + notes — the fields that stay editable after Won / Lost. */
export function ContactDialog({ open, onOpenChange, enquiry, onDone }) {
  const [form, setForm] = useState({ contactName: '', contactEmail: '', contactPhone: '', notes: '' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open && enquiry) {
      setForm({
        contactName: enquiry.contactName || '',
        contactEmail: enquiry.contactEmail || '',
        contactPhone: enquiry.contactPhone || '',
        notes: enquiry.notes || '',
      });
    }
  }, [open, enquiry]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSave() {
    setIsSaving(true);
    try {
      const res = await api.patch(`/enquiries/${enquiry._id}`, {
        contactName: form.contactName.trim(),
        contactEmail: form.contactEmail.trim(),
        contactPhone: form.contactPhone.trim(),
        notes: form.notes.trim(),
      });
      toast.success('Contact updated');
      onDone?.(res?.data?.data?.enquiry);
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update the contact'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enquiry contact</DialogTitle>
          <DialogDescription>
            Every enquiry has its own contact — proposals, contracts and invoices for this enquiry go
            to this person.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ec-name">Contact name</Label>
            <Input id="ec-name" value={form.contactName} onChange={set('contactName')} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ec-email">Email</Label>
              <Input id="ec-email" type="email" value={form.contactEmail} onChange={set('contactEmail')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec-phone">Phone</Label>
              <Input id="ec-phone" value={form.contactPhone} onChange={set('contactPhone')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ec-notes">Notes</Label>
            <Textarea id="ec-notes" rows={3} value={form.notes} onChange={set('notes')} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Spinner className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The stage-driven action buttons and menu for one enquiry, with the send /
 * won / lost / contact dialogs behind them. Used on the lead page card and
 * on the enquiry page.
 *
 * @param {object} props
 * @param {object} props.enquiry
 * @param {() => void} props.onChanged reload after any action
 * @param {(enquiry) => void} [props.onEdit] open the full edit dialog
 * @param {(enquiry) => void} [props.onDelete]
 * @param {boolean} [props.showOpen] add "Open enquiry" to the menu
 */
export function EnquiryActionBar({ enquiry, onChanged, onEdit, onDelete, showOpen = false, lostOpen: lostOpenProp, onLostOpenChange }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [pending, setPending] = useState('');
  const [sendKind, setSendKind] = useState(null);
  const [wonOpen, setWonOpen] = useState(false);
  const [lostOpenState, setLostOpenState] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  // The lost dialog can be driven from outside (the "Date passed" notice).
  const lostOpen = lostOpenProp ?? lostOpenState;
  const setLostOpen = onLostOpenChange || setLostOpenState;

  const waitlisted = enquiry.stage === 'waitlist';
  // While waiting, the buttons follow the stage the enquiry will resume at.
  const stage = waitlisted ? enquiry.waitlist?.resumeStage || 'enquiry' : enquiry.stage;
  const datePassed = isDatePassed(enquiry);
  const hasBanquet = enquiry.kind !== 'room';
  const hasProposal = Boolean(enquiry.proposal?.number);
  const hasContract = Boolean(enquiry.contract?.number);
  const signed = Boolean(enquiry.signing?.signedAt);
  const closed = CLOSED_STAGE_KEYS.includes(stage);
  // A provisional or confirmed booking the client backs out of is cancelled, not lost.
  const cancellable = ['provisional', 'won'].includes(enquiry.stage);
  const busy = pending !== '';
  const addendums = enquiry.addendums || [];
  const latestAddendum = addendums.length ? addendums[addendums.length - 1] : null;
  // Made but not yet emailed — the next step is to email it.
  const pendingAddendum = latestAddendum && !latestAddendum.sentAt ? latestAddendum : null;
  const addendumDue = Boolean(enquiry.addendumDue) || Boolean(pendingAddendum);

  async function run(key, fn) {
    setPending(key);
    try {
      await fn();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Action failed'));
    } finally {
      setPending('');
    }
  }

  // Documents open in a new tab for a look first; the menu keeps plain downloads.
  const generateProposal = () =>
    run('proposal', async () => {
      const res = await api.post(`/enquiries/${enquiry._id}/proposal`, null, { responseType: 'blob' });
      openBlob(res, 'Proposal.pdf');
      toast.success(hasProposal ? 'Proposal regenerated' : 'Proposal generated');
      onChanged?.();
    });

  const makeContract = () =>
    run('contract', async () => {
      const res = await api.post(`/enquiries/${enquiry._id}/contract`, null, { responseType: 'blob' });
      openBlob(res, 'Contract.pdf');
      toast.success(
        hasContract
          ? 'Contract regenerated'
          : 'Contract and pro-forma made — email them together to make the booking provisional'
      );
      onChanged?.();
    });

  const makeAddendum = () =>
    run('addendum', async () => {
      const res = await api.post(`/enquiries/${enquiry._id}/addendum`, null, { responseType: 'blob' });
      openBlob(res, 'Addendum.pdf');
      toast.success(
        pendingAddendum ? 'Addendum regenerated' : 'Addendum made — email it with the revised pro-forma'
      );
      onChanged?.();
    });

  const preview = (key, path, name) => () =>
    run(key, async () => {
      const res = await api.get(`/enquiries/${enquiry._id}/${path}`, { responseType: 'blob' });
      openBlob(res, name);
    });

  const download = (key, path, name) => () =>
    run(key, async () => {
      const res = await api.get(`/enquiries/${enquiry._id}/${path}`, { responseType: 'blob' });
      saveBlob(res, name);
    });

  const primary = [];
  if (datePassed) {
    primary.push({ key: 'lost', label: 'Date passed — mark lost', icon: CalendarX2, onClick: () => setLostOpen(true), variant: 'destructive' });
  }
  if (hasBanquet && stage === 'enquiry') {
    primary.push({ key: 'proposal', label: 'Generate proposal', icon: FileText, onClick: generateProposal, variant: datePassed ? 'outline' : 'default' });
  }
  if (hasBanquet && stage === 'proposal') {
    const sent = Boolean(enquiry.proposal?.sentAt);
    primary.push({ key: 'send-proposal', label: sent ? 'Resend proposal' : 'Email proposal', icon: Mail, onClick: () => setSendKind('proposal'), variant: !sent && !datePassed ? 'default' : 'secondary' });
    if (!waitlisted) {
      primary.push({
        key: 'contract',
        label: hasContract ? 'Email contract' : 'Make contract',
        icon: FileCheck2,
        onClick: hasContract ? () => setSendKind('contract') : makeContract,
        variant: sent && !datePassed ? 'default' : 'secondary',
      });
    }
  }
  if (hasBanquet && stage === 'provisional' && !waitlisted) {
    if (addendumDue) {
      primary.push({
        key: 'addendum',
        label: pendingAddendum ? 'Email addendum' : 'Make addendum',
        icon: FileDiff,
        onClick: pendingAddendum ? () => setSendKind('addendum') : makeAddendum,
        variant: 'default',
      });
    }
    primary.push({ key: 'won', label: 'Mark as won', icon: Trophy, onClick: () => setWonOpen(true), variant: addendumDue ? 'secondary' : 'default' });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {primary.map((action) => (
          <Button key={action.key} size="sm" variant={action.variant} onClick={action.onClick} disabled={busy}>
            {pending === action.key ? <Spinner className="h-4 w-4" /> : <action.icon className="h-4 w-4" />}
            {action.label}
          </Button>
        ))}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" aria-label="More actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {showOpen ? (
              <DropdownMenuItem asChild>
                <Link to={`/enquiries/${enquiry._id}`}>
                  <ExternalLink className="h-4 w-4" /> Open enquiry
                </Link>
              </DropdownMenuItem>
            ) : null}
            {hasBanquet && !closed && stage === 'proposal' ? (
              <DropdownMenuItem onClick={generateProposal}>
                <FileText className="h-4 w-4" /> Regenerate proposal
              </DropdownMenuItem>
            ) : null}
            {hasBanquet && !closed && !waitlisted && stage === 'proposal' && hasContract ? (
              <DropdownMenuItem onClick={makeContract}>
                <FileCheck2 className="h-4 w-4" /> Regenerate contract
              </DropdownMenuItem>
            ) : null}
            {hasBanquet && stage === 'provisional' && !waitlisted ? (
              <DropdownMenuItem onClick={() => setSendKind('contract')}>
                <Mail className="h-4 w-4" /> Email contract again
              </DropdownMenuItem>
            ) : null}
            {hasBanquet && stage === 'provisional' && !waitlisted && pendingAddendum ? (
              <DropdownMenuItem onClick={makeAddendum}>
                <FileDiff className="h-4 w-4" /> Regenerate addendum
              </DropdownMenuItem>
            ) : null}
            {latestAddendum ? (
              <DropdownMenuItem onClick={preview('pv-addendum', 'addendum/pdf', 'Addendum.pdf')}>
                <Eye className="h-4 w-4" /> Preview addendum
              </DropdownMenuItem>
            ) : null}
            {hasProposal ? (
              <DropdownMenuItem onClick={preview('pv-proposal', 'proposal/pdf', 'Proposal.pdf')}>
                <Eye className="h-4 w-4" /> Preview proposal
              </DropdownMenuItem>
            ) : null}
            {hasContract ? (
              <DropdownMenuItem onClick={preview('pv-contract', 'contract/pdf', 'Contract.pdf')}>
                <Eye className="h-4 w-4" /> Preview contract
              </DropdownMenuItem>
            ) : null}
            {signed ? (
              <DropdownMenuItem onClick={preview('pv-signed', 'signed-pdf', 'Signed copy.pdf')}>
                <FileSignature className="h-4 w-4" /> Preview signed copy
              </DropdownMenuItem>
            ) : null}
            {enquiry.proforma?.fileId ? (
              <DropdownMenuItem onClick={preview('pv-proforma', 'proforma-pdf', 'Pro-Forma Invoice.pdf')}>
                <ReceiptText className="h-4 w-4" /> Preview pro-forma
              </DropdownMenuItem>
            ) : null}
            {hasContract && (enquiry.credit?.pps || stage === 'provisional') ? (
              <DropdownMenuItem onClick={preview('pv-credit', 'credit-form/pdf', 'Credit Application Form.pdf')}>
                <BadgeIndianRupee className="h-4 w-4" /> Preview credit form
              </DropdownMenuItem>
            ) : null}
            {hasProposal ? (
              <DropdownMenuItem onClick={download('dl-proposal', 'proposal/pdf', 'Proposal.pdf')}>
                <Download className="h-4 w-4" /> Download proposal
              </DropdownMenuItem>
            ) : null}
            {hasContract ? (
              <DropdownMenuItem onClick={download('dl-contract', 'contract/pdf', 'Contract.pdf')}>
                <Download className="h-4 w-4" /> Download contract
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            {!closed && onEdit ? (
              <DropdownMenuItem onClick={() => onEdit(enquiry)}>
                <Pencil className="h-4 w-4" /> Edit details
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={() => setContactOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit contact
            </DropdownMenuItem>
            {cancellable ? (
              <DropdownMenuItem onClick={() => setCancelOpen(true)} className="text-destructive">
                <Ban className="h-4 w-4" /> Cancel booking
              </DropdownMenuItem>
            ) : null}
            {!['lost', 'cancelled'].includes(enquiry.stage) && (enquiry.stage !== 'won' || isAdmin) ? (
              <DropdownMenuItem onClick={() => setLostOpen(true)} className="text-destructive">
                <XCircle className="h-4 w-4" /> Mark lost
              </DropdownMenuItem>
            ) : null}
            {onDelete ? (
              <DropdownMenuItem onClick={() => onDelete(enquiry)} className="text-destructive">
                <Trash2 className="h-4 w-4" /> Delete
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SendDocumentDialog
        open={Boolean(sendKind)}
        onOpenChange={(open) => !open && setSendKind(null)}
        enquiry={enquiry}
        kind={sendKind || 'proposal'}
        onDone={() => onChanged?.()}
      />
      <WonDialog open={wonOpen} onOpenChange={setWonOpen} enquiry={enquiry} onDone={() => onChanged?.()} />
      <LostDialog open={lostOpen} onOpenChange={setLostOpen} enquiry={enquiry} onDone={() => onChanged?.()} />
      <CancelDialog open={cancelOpen} onOpenChange={setCancelOpen} enquiry={enquiry} onDone={() => onChanged?.()} />
      <ContactDialog open={contactOpen} onOpenChange={setContactOpen} enquiry={enquiry} onDone={() => onChanged?.()} />
    </>
  );
}

export default EnquiryActionBar;
