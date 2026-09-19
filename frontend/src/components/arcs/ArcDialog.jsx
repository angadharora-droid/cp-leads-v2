import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { CalendarRange } from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { isIndividual } from '@/lib/departments';
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
import DepartmentSelect from '@/components/leads/DepartmentSelect';

function toInputDate(value) {
  if (!value) return '';
  try {
    return format(new Date(value), 'yyyy-MM-dd');
  } catch {
    return '';
  }
}

/** Title for a new contract, e.g. "Rate contract 2026-27" (financial year). */
export function suggestedTitle() {
  const now = new Date();
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `Rate contract ${start}-${String(start + 1).slice(-2)}`;
}

function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden="true">
      {' '}
      *
    </span>
  );
}

/**
 * Raise or edit an annual rate contract (ARC).
 *
 * Raising one asks a single question — which branch / department it is for —
 * then drops the user straight into the agreement, where the real work
 * happens. Title and contact are prefilled from the lead and can be changed
 * later from this dialog in edit mode. Validity dates only appear once the
 * contract is signed, because that is when the term is agreed.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {object} props.lead
 * @param {object|null} [props.arc] existing contract to edit
 * @param {object|null} [props.renewFrom] contract being renewed (prefills)
 * @param {(arc: object) => void} [props.onSaved]
 * @param {(lead: object) => void} [props.onLeadUpdated]
 */
function ArcDialog({ open, onOpenChange, lead, arc, renewFrom, onSaved, onLeadUpdated }) {
  const isEdit = Boolean(arc?._id);
  const needsDepartment = !isIndividual(lead);
  // The term is only known once the client has signed.
  const showValidity = isEdit && arc?.stage === 'contracted';
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    department: '',
    title: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    validFrom: '',
    validTo: '',
    notes: '',
  });

  useEffect(() => {
    if (!open) return;
    const source = arc || renewFrom;
    if (source) {
      setForm({
        department: source.department ? String(source.department) : '',
        title: arc ? source.title || '' : suggestedTitle(),
        contactName: source.contactName || '',
        contactEmail: source.contactEmail || '',
        contactPhone: source.contactPhone || '',
        validFrom: arc ? toInputDate(source.validFrom) : '',
        validTo: arc ? toInputDate(source.validTo) : '',
        notes: arc ? source.notes || '' : '',
      });
    } else {
      const only = (lead?.departments || []).length === 1 ? lead.departments[0] : null;
      setForm({
        department: only ? String(only._id) : '',
        title: suggestedTitle(),
        contactName: lead?.contactPerson || '',
        contactEmail: lead?.email || '',
        contactPhone: lead?.mobile || '',
        validFrom: '',
        validTo: '',
        notes: '',
      });
    }
    // Keyed on the lead id: a refreshed lead object (a department created
    // inline) must not wipe what has been typed so far.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, arc, renewFrom, lead?._id]);

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    if (needsDepartment && !form.department) {
      return toast.error('Pick the branch / department this contract is for');
    }
    if (showValidity && form.validFrom && form.validTo && form.validTo < form.validFrom) {
      return toast.error('Valid-to cannot be before valid-from');
    }
    const payload = {
      title: form.title.trim() || suggestedTitle(),
      contactName: form.contactName.trim(),
      contactEmail: form.contactEmail.trim(),
      contactPhone: form.contactPhone.trim(),
      notes: form.notes.trim(),
    };
    if (needsDepartment) payload.department = form.department;
    if (showValidity) {
      payload.validFrom = form.validFrom;
      payload.validTo = form.validTo;
    }

    setIsSaving(true);
    try {
      const res = isEdit
        ? await api.patch(`/arcs/${arc._id}`, payload)
        : await api.post(`/leads/${lead._id}/arcs`, payload);
      toast.success(isEdit ? 'Rate contract updated' : 'Rate contract raised');
      onSaved?.(res?.data?.data?.arc);
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save rate contract'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isSaving && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit rate contract' : renewFrom ? 'Renew rate contract' : 'New rate contract'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Where the contract sits, who signs it, and its term once signed.'
              : renewFrom
                ? 'A renewal is a fresh contract under the same department — the earlier one stays as history. Pick the department and the agreement opens next.'
                : 'Pick the branch / department this contract is for. The rate agreement opens next.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {needsDepartment ? (
            <div className="space-y-1.5">
              <Label htmlFor="arc-dept">
                Branch / department
                <RequiredMark />
              </Label>
              <DepartmentSelect
                id="arc-dept"
                lead={lead}
                value={form.department}
                onChange={(v) => setField('department', v)}
                onLeadUpdated={onLeadUpdated}
              />
              <p className="text-xs text-muted-foreground">
                Not listed? Pick “Create a new department” at the bottom of the list.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This lead is an individual, so the contract sits directly under it.
            </p>
          )}

          {/* Everything else is prefilled from the lead and edited later. */}
          {isEdit ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="arc-title">Title</Label>
                <Input
                  id="arc-title"
                  value={form.title}
                  onChange={(e) => setField('title', e.target.value)}
                  placeholder={suggestedTitle()}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="arc-contact">Contact person</Label>
                  <Input
                    id="arc-contact"
                    value={form.contactName}
                    onChange={(e) => setField('contactName', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="arc-phone">Contact phone</Label>
                  <Input
                    id="arc-phone"
                    type="tel"
                    inputMode="tel"
                    value={form.contactPhone}
                    onChange={(e) => setField('contactPhone', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="arc-email">Contact email</Label>
                  <Input
                    id="arc-email"
                    type="email"
                    inputMode="email"
                    value={form.contactEmail}
                    onChange={(e) => setField('contactEmail', e.target.value)}
                    placeholder="The agreement is emailed here"
                  />
                </div>
              </div>

              {showValidity ? (
                <div className="space-y-3 rounded-lg border border-success/40 bg-success/10 p-3">
                  <div className="flex items-start gap-2.5">
                    <CalendarRange
                      className="mt-0.5 h-4 w-4 shrink-0 text-success"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">Contract validity</p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        The signed copy is on file — record the term these rates hold for.
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="arc-from">Valid from</Label>
                      <Input
                        id="arc-from"
                        type="date"
                        value={form.validFrom}
                        onChange={(e) => setField('validFrom', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="arc-to">Valid to</Label>
                      <Input
                        id="arc-to"
                        type="date"
                        min={form.validFrom || undefined}
                        value={form.validTo}
                        onChange={(e) => setField('validTo', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="arc-notes">Notes</Label>
                <Textarea
                  id="arc-notes"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setField('notes', e.target.value)}
                  placeholder="Internal notes about this contract"
                />
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:space-x-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Spinner size="sm" className="text-current" /> : null}
            {isEdit ? 'Save changes' : renewFrom ? 'Raise renewal' : 'Raise contract'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { ArcDialog };
export default ArcDialog;
