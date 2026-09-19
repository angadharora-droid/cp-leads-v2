import FormSections from '@/components/FormSections';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Download,
  Eye,
  FileText,
  IndianRupee,
  Lock,
  Mail,
  MoreHorizontal,
  RefreshCw,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { hasModule } from '@/lib/modules';
import { useAuth } from '@/context/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { openBlob, saveBlob } from '@/components/enquiries/EnquiryActions';
import { EmailEstimateDialog, estimateStatus } from '@/components/estimates/EmailEstimateDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const TEXT_FIELDS = [
  'functionName',
  'functionType',
  'venue',
  'session',
  'reservationNo',
  'additionalPlatePrice',
  'billingName',
  'billingCode',
  'panNo',
  'gstNo',
  'paymentMode',
  'remarks',
];
const NUMBER_FIELDS = ['guaranteedPax', 'pricePerPlate', 'advanceReceived'];

function toInputDate(value) {
  if (!value) return '';
  try {
    return format(new Date(value), 'yyyy-MM-dd');
  } catch {
    return '';
  }
}

function formFrom(est) {
  const form = { date: toInputDate(est.date) };
  for (const key of TEXT_FIELDS) form[key] = est[key] ?? '';
  for (const key of NUMBER_FIELDS) form[key] = est[key] === undefined || est[key] === null ? '' : String(est[key]);
  form.hallCharges = (est.hallCharges || []).map((r) => ({
    venue: r.venue || '',
    amount: r.amount === undefined || r.amount === null ? '' : String(r.amount),
  }));
  return form;
}

/** One charge line per venue: the primary room and any add-on rooms. */
function HallCharges({ rows, onChange }) {
  const set = (i, key, value) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  return (
    <div className="space-y-2">
      <Label>Hall charges by venue (optional)</Label>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No venue charged. Nothing will print.</p>
      ) : null}
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1.6fr_1fr_auto]">
          <Input
            value={r.venue}
            onChange={(e) => set(i, 'venue', e.target.value)}
            placeholder="Venue"
            aria-label={`Venue ${i + 1}`}
          />
          <Input
            inputMode="decimal"
            value={r.amount}
            onChange={(e) => set(i, 'amount', e.target.value)}
            placeholder="0"
            aria-label={`Charge for ${r.venue || `venue ${i + 1}`}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            aria-label={`Remove ${r.venue || `venue ${i + 1}`}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, { venue: '', amount: '' }])}>
        <Plus className="h-4 w-4" />
        Add venue
      </Button>
      <p className="text-xs text-muted-foreground">
        Only venues with an amount print. Leave them all at zero and the row is left off, as on the printed form.
      </p>
    </div>
  );
}

function Field({ id, label, hint, children, className }) {
  return (
    <div className={`space-y-1.5 ${className || ''}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{children || '—'}</span>
    </div>
  );
}

/**
 * One banquet estimate: the header and contract block carried from the
 * prospectus, the billing block finance types, and the actions — save,
 * preview, download, email to finance, refresh from the sheet.
 */
export default function EstimatePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canApprove = ['admin', 'manager'].includes(user?.role);
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/estimates/${id}`);
      const next = res?.data?.data;
      setData(next);
      const f = formFrom(next.estimate);
      setForm(f);
      setSaved(f);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load the estimate'));
      navigate('/estimates/list', { replace: true });
    }
  }, [id, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(() => form && saved && JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
  const est = data?.estimate;
  const sheet = data?.sheet;
  const booking = data?.booking;
  // Approving is final: an approved estimate can never be changed again.
  const locked = est?.status === 'approved';
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const onInput = (key) => (e) => set(key)(e.target.value);

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const payload = { ...form };
      for (const key of NUMBER_FIELDS) payload[key] = payload[key] === '' ? 0 : Number(payload[key]);
      payload.hallCharges = (form.hallCharges || [])
        .filter((r) => r.venue.trim())
        .map((r) => ({ venue: r.venue.trim(), amount: r.amount === '' ? 0 : Number(r.amount) }));
      const res = await api.patch(`/estimates/${id}`, payload);
      const next = res?.data?.data;
      setData(next);
      const f = formFrom(next.estimate);
      setForm(f);
      setSaved(f);
      toast.success('Estimate saved');
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save'));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function ensureSaved() {
    if (dirty && !(await save())) throw new Error('Save the estimate successfully before continuing');
  }

  async function preview() {
    setBusy('preview');
    try {
      await ensureSaved();
      const res = await api.get(`/estimates/${id}/pdf`, { params: { stamp: 0 }, responseType: 'blob' });
      openBlob(res, `Banquet Estimate ${est?.number}.pdf`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to open the PDF'));
    } finally {
      setBusy('');
    }
  }

  async function download() {
    setBusy('download');
    try {
      await ensureSaved();
      const res = await api.get(`/estimates/${id}/pdf`, { responseType: 'blob' });
      saveBlob(res, `Banquet Estimate ${est?.number}.pdf`);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to download the PDF'));
    } finally {
      setBusy('');
    }
  }

  async function refresh() {
    setBusy('refresh');
    try {
      const res = await api.post(`/estimates/${id}/refresh`);
      const next = res?.data?.data;
      setData(next);
      const f = formFrom(next.estimate);
      setForm(f);
      setSaved(f);
      toast.success('Refreshed from the prospectus — the billing block stays as typed');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to refresh'));
    } finally {
      setBusy('');
    }
  }

  async function approve() {
    setBusy('approve');
    try {
      await ensureSaved();
      const res = await api.post(`/estimates/${id}/approve`);
      const next = res?.data?.data;
      setData(next);
      const f = formFrom(next.estimate);
      setForm(f);
      setSaved(f);
      toast.success(`Estimate ${est?.number} approved. It is now final.`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to approve'));
    } finally {
      setBusy('');
    }
  }

  async function remove() {
    await api.delete(`/estimates/${id}`);
    toast.success(`Estimate ${est?.number} deleted`);
    navigate('/estimates/list', { replace: true });
  }

  if (!est || !form) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72 rounded-lg" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const status = estimateStatus(est);

  return (
    <div className="space-y-4">
      <PageHeader
        className="record-toolbar"
        showTitle
        title={`Estimate ${est.number}`}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{form.functionType || 'Function'}</span>
            <span>· {form.billingName || form.functionName || 'Guest'}</span>
            {form.date ? <span>· {formatDate(form.date, 'EEE, d MMM yyyy')}</span> : null}
            {form.venue ? <span>· {form.venue}</span> : null}
          </span>
        }
        breadcrumbs={[
          { label: 'Banquet Estimate', to: '/estimates' },
          { label: 'Sheets & estimates', to: '/estimates/list' },
          { label: est.number },
        ]}
        actions={
          <>
            {locked ? null : (
              <>
                <Button size="sm" variant="outline" onClick={save} disabled={!dirty || saving}>
                  {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                  Save
                </Button>
                {canApprove ? <Button size="sm" onClick={approve} disabled={Boolean(busy) || saving}>
                  {busy === 'approve' ? <Spinner className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                  Approve
                </Button> : null}
              </>
            )}
            <Button size="sm" variant="outline" onClick={preview} disabled={Boolean(busy)}>
              {busy === 'preview' ? <Spinner className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              Preview
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setEmailOpen(true)}
              disabled={Boolean(busy) || !locked}
              title={locked ? undefined : 'Approve the estimate before emailing it'}
            >
              <Mail className="h-4 w-4" />
              Email finance
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={download} disabled={!locked}>
                  <Download className="h-4 w-4" /> Download PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={refresh} disabled={locked}>
                  <RefreshCw className="h-4 w-4" /> Refresh from prospectus
                </DropdownMenuItem>
                {isAdmin ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setConfirmDelete(true)} className="text-destructive">
                      <Trash2 className="h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {locked ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-foreground">
          <p className="flex items-start gap-2">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            <span>
              <span className="font-medium">
                Approved{est.approval?.byName ? ` by ${est.approval.byName}` : ''}
                {est.approval?.at ? ` on ${formatDateTime(est.approval.at)}` : ''}.
              </span>{' '}
              It is final. Nobody can change it now. It can be downloaded and emailed as it stands.
            </span>
          </p>
        </div>
      ) : (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
          <span className="font-medium">Draft.</span> A manager must check every figure and approve. Approving is final, and
          nothing can be downloaded or emailed until it has been.
        </p>
      )}

      {booking?.stage && booking.stage !== 'won' ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          The booking behind this estimate is no longer confirmed. It is now marked <strong>{booking.stage}</strong>.
        </p>
      ) : null}

      {sheet?.outdated ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <span>
              <span className="font-medium">The prospectus changed after this estimate was raised.</span>{' '}
              {locked
                ? 'This estimate is final, so it cannot be brought up to date. An admin would have to delete it and raise a new one.'
                : 'Refresh to pull the current date, venue, plates and rate. The billing block stays as typed.'}
            </span>
          </p>
          {locked ? null : (
            <Button size="sm" variant="outline" onClick={refresh} disabled={busy === 'refresh'}>
              {busy === 'refresh' ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
              Refresh from prospectus
            </Button>
          )}
        </div>
      ) : null}
      {sheet && !sheet.exists ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          The prospectus this estimate was raised from no longer exists.
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
        {/* One disabled fieldset locks every field at once when approved. */}
        <FormSections labels={['Function', 'Contract', 'Billing', 'Remarks', 'Consumption']} dirty={dirty} readOnly={locked}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="h-4 w-4 text-primary" />
                Function
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field id="est-name" label="Function name" className="sm:col-span-2">
                <Input id="est-name" value={form.functionName} onChange={onInput('functionName')} />
              </Field>
              <Field id="est-type" label="Type of function">
                <Input id="est-type" value={form.functionType} onChange={onInput('functionType')} />
              </Field>
              <Field id="est-rsvn" label="Reservation number" hint="As printed, e.g. 29931 / 1">
                <Input id="est-rsvn" value={form.reservationNo} onChange={onInput('reservationNo')} />
              </Field>
              <Field id="est-date" label="Date">
                <Input id="est-date" type="date" value={form.date} onChange={onInput('date')} />
              </Field>
              <Field id="est-venue" label="Venue">
                <Input id="est-venue" value={form.venue} onChange={onInput('venue')} />
              </Field>
              <Field id="est-session" label="Session" className="sm:col-span-2">
                <Input id="est-session" value={form.session} onChange={onInput('session')} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <IndianRupee className="h-4 w-4 text-primary" />
                Contract details
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field id="est-pax" label="Guaranteed pax / plates">
                <Input id="est-pax" inputMode="numeric" value={form.guaranteedPax} onChange={onInput('guaranteedPax')} />
              </Field>
              <Field id="est-plate" label="Confirmed price per plate">
                <Input id="est-plate" inputMode="decimal" value={form.pricePerPlate} onChange={onInput('pricePerPlate')} />
              </Field>

              <Field
                id="est-extra"
                label="Chargeable price for additional plates"
                hint="Typed as it prints, e.g. 805, after 72 plates"
              >
                <Input id="est-extra" value={form.additionalPlatePrice} onChange={onInput('additionalPlatePrice')} />
              </Field>
              <div className="sm:col-span-2 lg:col-span-3">
                <HallCharges rows={form.hallCharges || []} onChange={set('hallCharges')} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-primary" />
                Billing details
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field id="est-bill" label="Billing name" className="sm:col-span-2">
                <Input id="est-bill" value={form.billingName} onChange={onInput('billingName')} />
              </Field>
              <Field id="est-code" label="Ledger code" hint="Printed in brackets after the name">
                <Input id="est-code" value={form.billingCode} onChange={onInput('billingCode')} />
              </Field>
              <Field id="est-mode" label="Payment mode" hint="BTC, cash, card, cheque…">
                <Input id="est-mode" value={form.paymentMode} onChange={onInput('paymentMode')} />
              </Field>
              <Field id="est-pan" label="PAN card no.">
                <Input id="est-pan" value={form.panNo} onChange={onInput('panNo')} />
              </Field>
              <Field id="est-gst" label="GST no.">
                <Input id="est-gst" value={form.gstNo} onChange={onInput('gstNo')} />
              </Field>
              <Field id="est-adv" label="Advance received">
                <Input id="est-adv" inputMode="decimal" value={form.advanceReceived} onChange={onInput('advanceReceived')} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-primary" />
                Remarks
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Printed under the billing block. The extra-plate and surcharge clause the hotel uses.
              </p>
            </CardHeader>
            <CardContent>
              <Textarea id="est-remarks" rows={4} value={form.remarks} onChange={onInput('remarks')} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">
                The additional consumption table and the whole bill break-up print as an empty grid. Operations and
                finance fill them in by hand on the day and sign the paper.
              </p>
            </CardContent>
          </Card>
        </FormSections>

        <div className="space-y-3 self-start xl:sticky xl:top-[72px]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Estimate</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Row label="Status">
                <span
                  className={
                    status.tone === 'success' ? 'text-success' : status.tone === 'info' ? 'text-info' : 'text-warning'
                  }
                >
                  {status.label}
                </span>
              </Row>
              <Row label="Raised by">{est.madeByName}</Row>
              <Row label="Raised on">{est.createdAt ? formatDateTime(est.createdAt) : null}</Row>
              {est.approval?.at ? (
                <>
                  <Row label="Approved by">{est.approval.byName}</Row>
                  <Row label="Approved on">{formatDateTime(est.approval.at)}</Row>
                </>
              ) : null}
              <Row label="Last printed">{est.printedAt ? formatDateTime(est.printedAt) : null}</Row>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Prospectus</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Row label="Sheet">{sheet?.number ? `FP ${sheet.number}` : null}</Row>
              <Row label="Sheet printed">{sheet?.printedAt ? formatDate(sheet.printedAt) : null}</Row>
              <Row label="Guest / company">{est.lead?.businessName}</Row>
              {(hasModule(user, 'prospectus') || canApprove) && sheet?.exists ? (
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link to={canApprove ? `/estimates/sheets/${sheet.prospectusId}` : `/prospectus/${sheet.prospectusId}`}>Open the prospectus</Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <EmailEstimateDialog open={emailOpen} onOpenChange={setEmailOpen} estimate={est} onDone={() => load()} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete estimate ${est.number}?`}
        description="The estimate is removed for everyone and a fresh one can then be raised against the sheet. The prospectus and the booking are untouched."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={remove}
      />
    </div>
  );
}
