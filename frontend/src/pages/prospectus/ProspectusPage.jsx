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
  Mail,
  MoreHorizontal,
  RefreshCw,
  Save,
  Trash2,
  Utensils,
} from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { hasModule } from '@/lib/modules';
import { useAuth } from '@/context/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { openBlob, saveBlob } from '@/components/enquiries/EnquiryActions';
import { EmailSheetDialog, sheetStatus } from '@/components/prospectus/EmailSheetDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { tidyList } from '@/lib/menuText';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ADVANCE_MODES = [
  { key: '', label: 'Not received' },
  { key: 'cash', label: 'Cash' },
  { key: 'card', label: 'Card' },
  { key: 'cheque', label: 'Cheque' },
  { key: 'upi', label: 'UPI' },
  { key: 'neft', label: 'NEFT / RTGS' },
  { key: 'other', label: 'Other' },
];

const TEXT_FIELDS = [
  'reservationNo',
  'timeFrom',
  'timeTo',
  'functionType',
  'venue',
  'addOnRooms',
  'partyName',
  'companyName',
  'address',
  'contactPerson',
  'phone',
  'email',
  'seating',
  'rateBasis',
  'hallRentBasis',
  'advanceMode',
  'billingInstruction',
  'boardToRead',
  'deptInstruction',
  'specialInstructions',
  'liquorMenu',
  'otherRequirements',
];
const NUMBER_FIELDS = ['pax', 'rate', 'hallRent', 'advanceAmount', 'paidOut', 'netAmount'];

function toInputDate(value) {
  if (!value) return '';
  try {
    return format(new Date(value), 'yyyy-MM-dd');
  } catch {
    return '';
  }
}

function formFrom(fp) {
  const form = { dateFrom: toInputDate(fp.dateFrom), dateTo: toInputDate(fp.dateTo) };
  for (const key of TEXT_FIELDS) form[key] = fp[key] ?? '';
  for (const key of NUMBER_FIELDS) form[key] = fp[key] === undefined || fp[key] === null ? '' : String(fp[key]);
  // The food menu by course: the courses are the package's, the dishes are typed one per line.
  form.menuCourses = (fp.menuCourses || []).map((c) => ({ name: c.name, dishes: (c.dishes || []).join('\n') }));
  return form;
}

function Field({ id, label, children, className }) {
  return (
    <div className={`space-y-1.5 ${className || ''}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
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
 * One prospectus sheet: the booking-derived fields, the operational fields
 * typed by the banquet team, and the actions — save, preview, download,
 * email to the departments, refresh from the booking.
 */
export default function ProspectusPage({ accountsView = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canApprove = !accountsView && ['admin', 'manager'].includes(user?.role);
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(accountsView ? `/estimates/sheets/${id}` : `/prospectus/${id}`);
      const next = res?.data?.data;
      setData(next);
      const f = formFrom(next.prospectus);
      setForm(f);
      setSaved(f);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load the prospectus'));
      navigate(accountsView ? '/estimates/list' : '/prospectus/list', { replace: true });
    }
  }, [id, navigate, accountsView]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(() => form && saved && JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
  const fp = data?.prospectus;
  const booking = data?.booking;
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const onInput = (key) => (e) => set(key)(e.target.value);
  // The menu lists settle into one item per line when a box is left.
  const tidy = (key) => () => setForm((f) => ({ ...f, [key]: tidyList(f[key]) }));
  const setCourse = (i, value) => setForm((f) => ({ ...f, menuCourses: f.menuCourses.map((c, j) => (j === i ? { ...c, dishes: value } : c)) }));
  const tidyCourse = (i) => () =>
    setForm((f) => ({ ...f, menuCourses: f.menuCourses.map((c, j) => (j === i ? { ...c, dishes: tidyList(c.dishes) } : c)) }));

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const payload = { ...form };
      for (const key of NUMBER_FIELDS) payload[key] = payload[key] === '' ? 0 : Number(payload[key]);
      payload.menuCourses = (form.menuCourses || []).map((c) => ({
        name: c.name,
        dishes: String(c.dishes || '').split('\n').map((d) => d.trim()).filter(Boolean),
      }));
      const res = await api.patch(`/prospectus/${id}`, payload);
      const next = res?.data?.data;
      setData(next);
      const f = formFrom(next.prospectus);
      setForm(f);
      setSaved(f);
      toast.success('Prospectus saved');
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save'));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function ensureSaved() {
    if (dirty && !(await save())) throw new Error('Save the prospectus successfully before continuing');
  }

  async function preview() {
    setBusy('preview');
    try {
      await ensureSaved();
      const res = await api.get(`/prospectus/${id}/pdf`, { params: { stamp: 0 }, responseType: 'blob' });
      openBlob(res, `Function Prospectus ${fp?.number}.pdf`);
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
      const res = await api.get(`/prospectus/${id}/pdf`, { responseType: 'blob' });
      saveBlob(res, `Function Prospectus ${fp?.number}.pdf`);
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
      const res = await api.post(`/prospectus/${id}/refresh`);
      const next = res?.data?.data;
      setData(next);
      const f = formFrom(next.prospectus);
      setForm(f);
      setSaved(f);
      toast.success('Booking details refreshed — menu and instructions kept as typed');
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
      await api.post(`/prospectus/${id}/approve`);
      await load();
      toast.success('Prospectus approved');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to approve'));
    } finally { setBusy(''); }
  }

  async function remove() {
    await api.delete(`/prospectus/${id}`);
    toast.success(`Prospectus ${fp?.number} deleted`);
    navigate(accountsView ? '/estimates/list' : '/prospectus/list', { replace: true });
  }

  if (!fp || !form) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72 rounded-lg" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const status = sheetStatus(fp);
  const partyLabel = form.companyName || form.partyName || fp.lead?.businessName || 'Guest';

  return (
    <div className="space-y-4">
      <PageHeader
        className="record-toolbar"
        showTitle
        title={`FP ${fp.number}`}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{form.functionType || 'Function'}</span>
            <span>· {partyLabel}</span>
            {form.dateFrom ? <span>· {formatDate(form.dateFrom, 'EEE, d MMM yyyy')}</span> : null}
            {form.venue ? <span>· {form.venue}</span> : null}
          </span>
        }
        breadcrumbs={accountsView ? [{ label: 'Estimate Accounts', to: '/estimates' }, { label: 'Sheets & estimates', to: '/estimates/list' }, { label: fp.number }] : [{ label: 'Function Prospectus', to: '/prospectus' }, { label: 'Functions & sheets', to: '/prospectus/list' }, { label: fp.number }]}
        actions={accountsView ? null : (
          <>
            <Button size="sm" onClick={save} disabled={!dirty || saving}>
              {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={preview} disabled={!canApprove || fp.status !== 'approved' || dirty || Boolean(busy)}>
              {busy === 'preview' ? <Spinner className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              Preview
            </Button>
            <Button size="sm" variant="secondary" onClick={async () => { await ensureSaved(); setEmailOpen(true); }} disabled={!canApprove || fp.status !== 'approved' || dirty || Boolean(busy)}>
              <Mail className="h-4 w-4" />
              Email departments
            </Button>
            {canApprove && (fp.status !== 'approved' || dirty) ? (
              <Button size="sm" onClick={approve} disabled={Boolean(busy) || saving}>Approve FP</Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={download} disabled={!canApprove || fp.status !== 'approved' || dirty}>
                  <Download className="h-4 w-4" /> Download PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={refresh}>
                  <RefreshCw className="h-4 w-4" /> Refresh from booking
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
        )}
      />

      <p className="rounded-md border px-3 py-2 text-sm">
        {fp.status === 'approved'
          ? `Approved by ${fp.approval?.byName || 'manager'}. Any changes require fresh approval.`
          : 'Awaiting manager approval. Only a manager can print or email an approved FP.'}
      </p>
      {booking?.outdated ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <span>
              <span className="font-medium">The booking changed after this sheet was filled.</span> Refresh to pull the
              current dates, venue, pax, rate and advance — the menu and instructions stay as typed.
            </span>
          </p>
          <Button size="sm" variant="outline" onClick={refresh} disabled={accountsView || busy === 'refresh'}>
            {busy === 'refresh' ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
            Refresh from booking
          </Button>
        </div>
      ) : null}
      {booking && !booking.functionExists ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          The function this sheet was made for is no longer on the booking.
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <FormSections labels={['Function', 'Party', 'Commercials', 'Menu', 'Instructions']} dirty={dirty} readOnly={accountsView}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="h-4 w-4 text-primary" />
                Function
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field id="fp-rsvn" label="Rsvn No (hotel system)">
                <Input id="fp-rsvn" value={form.reservationNo} onChange={onInput('reservationNo')} placeholder="29931" />
              </Field>
              <Field id="fp-type" label="Type of function">
                <Input id="fp-type" value={form.functionType} onChange={onInput('functionType')} />
              </Field>
              <Field id="fp-from" label="Date from">
                <Input id="fp-from" type="date" value={form.dateFrom} onChange={onInput('dateFrom')} />
              </Field>
              <Field id="fp-to" label="Date to">
                <Input id="fp-to" type="date" value={form.dateTo} onChange={onInput('dateTo')} />
              </Field>
              <Field id="fp-tfrom" label="Time from">
                <Input id="fp-tfrom" value={form.timeFrom} onChange={onInput('timeFrom')} placeholder="07:00" />
              </Field>
              <Field id="fp-tto" label="Time to">
                <Input id="fp-tto" value={form.timeTo} onChange={onInput('timeTo')} placeholder="11:00" />
              </Field>
              <Field id="fp-venue" label="Venue">
                <Input id="fp-venue" value={form.venue} onChange={onInput('venue')} />
              </Field>
              <Field id="fp-pax" label="No of pax (guarantee)">
                <Input id="fp-pax" inputMode="numeric" value={form.pax} onChange={(e) => set('pax')(e.target.value.replace(/[^\d]/g, ''))} />
              </Field>
              <Field id="fp-rooms" label="Add on rooms" className="sm:col-span-2">
                <Input id="fp-rooms" value={form.addOnRooms} onChange={onInput('addOnRooms')} placeholder="Rooms held with the venue" />
              </Field>
              <Field id="fp-seating" label="Seating arrangement" className="sm:col-span-2">
                <Input id="fp-seating" value={form.seating} onChange={onInput('seating')} placeholder="Theatre / Cluster / U-shape…" />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-primary" />
                Party
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Field id="fp-party" label="Name of the party">
                <Input id="fp-party" value={form.partyName} onChange={onInput('partyName')} />
              </Field>
              <Field id="fp-company" label="Company name">
                <Input id="fp-company" value={form.companyName} onChange={onInput('companyName')} />
              </Field>
              <Field id="fp-address" label="Address" className="sm:col-span-2">
                <Input id="fp-address" value={form.address} onChange={onInput('address')} />
              </Field>
              <Field id="fp-contact" label="Contact person">
                <Input id="fp-contact" value={form.contactPerson} onChange={onInput('contactPerson')} />
              </Field>
              <Field id="fp-phone" label="Telephone / mobile">
                <Input id="fp-phone" value={form.phone} onChange={onInput('phone')} />
              </Field>
              <Field id="fp-email" label="Email" className="sm:col-span-2">
                <Input id="fp-email" type="email" value={form.email} onChange={onInput('email')} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <IndianRupee className="h-4 w-4 text-primary" />
                Commercials
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field id="fp-rate" label="Rate (per pax)">
                <Input id="fp-rate" inputMode="decimal" value={form.rate} onChange={onInput('rate')} />
              </Field>
              <Field id="fp-rate-basis" label="Rate basis">
                <Select value={form.rateBasis || 'exclusive'} onValueChange={set('rateBasis')}>
                  <SelectTrigger id="fp-rate-basis">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exclusive">Exclusive of taxes</SelectItem>
                    <SelectItem value="inclusive">Inclusive of taxes</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field id="fp-hall" label="Hall rent">
                <Input id="fp-hall" inputMode="decimal" value={form.hallRent} onChange={onInput('hallRent')} />
              </Field>
              <Field id="fp-hall-basis" label="Hall rent basis">
                <Select value={form.hallRentBasis || 'exclusive'} onValueChange={set('hallRentBasis')}>
                  <SelectTrigger id="fp-hall-basis">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exclusive">Exclusive of taxes</SelectItem>
                    <SelectItem value="inclusive">Inclusive of taxes</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field id="fp-adv-mode" label="Advance by">
                {/* Radix forbids an empty option value, so "not received" rides as __none. */}
                <Select
                  value={form.advanceMode || '__none'}
                  onValueChange={(v) => set('advanceMode')(v === '__none' ? '' : v)}
                >
                  <SelectTrigger id="fp-adv-mode">
                    <SelectValue placeholder="Not received" />
                  </SelectTrigger>
                  <SelectContent>
                    {ADVANCE_MODES.map((m) => (
                      <SelectItem key={m.key || 'none'} value={m.key || '__none'}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="fp-adv" label="Advance amount">
                <Input id="fp-adv" inputMode="decimal" value={form.advanceAmount} onChange={onInput('advanceAmount')} />
              </Field>
              <Field id="fp-paid" label="Paid out">
                <Input id="fp-paid" inputMode="decimal" value={form.paidOut} onChange={onInput('paidOut')} />
              </Field>
              <Field id="fp-net" label="Net amount">
                <Input id="fp-net" inputMode="decimal" value={form.netAmount} onChange={onInput('netAmount')} />
              </Field>
              <Field id="fp-billing" label="Billing instruction" className="sm:col-span-2 lg:col-span-4">
                <Input id="fp-billing" value={form.billingInstruction} onChange={onInput('billingInstruction')} placeholder="Bill to company" />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Utensils className="h-4 w-4 text-primary" />
                Menu &amp; requirements
              </CardTitle>
              <p className="text-sm text-muted-foreground">One item per line in each list, printed exactly as typed.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {form.menuCourses?.length ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Label>Food menu</Label>
                    <span className="text-xs text-muted-foreground">
                      {fp.menuPackage ? `${fp.menuPackage} — ` : ''}the courses come from the package; type the dishes under each
                    </span>
                  </div>
                  {/* One row per course: the name on the left, a box that grows with the dishes on the right. */}
                  <div className="divide-y rounded-lg border">
                    {form.menuCourses.map((course, i) => (
                      <div key={course.name} className="grid gap-1.5 px-3 py-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-3">
                        <Label htmlFor={`fp-course-${i}`} className="text-sm font-medium sm:pt-2">
                          {course.name}
                        </Label>
                        <Textarea
                          id={`fp-course-${i}`}
                          rows={Math.min(8, Math.max(2, String(course.dishes || '').split('\n').length))}
                          value={course.dishes}
                          onChange={(e) => setCourse(i, e.target.value)}
                          onBlur={tidyCourse(i)}
                          className="min-h-0 font-mono text-sm"
                          placeholder="One dish per line"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Food menu</Label>
                  <p className="text-sm text-muted-foreground">
                    {fp.menuPackage
                      ? `"${fp.menuPackage}" has no courses in Banquet Setup yet. Add its courses there, then use Refresh from booking — the dishes are typed under those courses.`
                      : 'This booking has no menu package, so there are no courses to list dishes under.'}
                  </p>
                  {fp.menu ? (
                    <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-mono text-sm text-muted-foreground">{fp.menu}</pre>
                  ) : null}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
              <Field id="fp-liquor" label="Liquor menu">
                <Textarea id="fp-liquor" rows={12} value={form.liquorMenu} onChange={onInput('liquorMenu')} onBlur={tidy('liquorMenu')} className="font-mono text-sm" placeholder={'IMFL Premium Bar (4 hours)\nBeer & Wine\n…'} />
              </Field>
              <Field id="fp-other" label="Other requirements">
                <Textarea id="fp-other" rows={12} value={form.otherRequirements} onChange={onInput('otherRequirements')} onBlur={tidy('otherRequirements')} className="font-mono text-sm" placeholder={'AV System with podium\nLCD Projector with Screen\n…'} />
              </Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-primary" />
                Instructions
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Field id="fp-board" label="Board to read" className="sm:col-span-2">
                <Input id="fp-board" value={form.boardToRead} onChange={onInput('boardToRead')} placeholder="Text for the signboard" />
              </Field>
              <Field id="fp-dept" label="Dept instruction">
                <Textarea id="fp-dept" rows={6} value={form.deptInstruction} onChange={onInput('deptInstruction')} />
              </Field>
              <Field id="fp-special" label="Special instructions">
                <Textarea id="fp-special" rows={6} value={form.specialInstructions} onChange={onInput('specialInstructions')} />
              </Field>
            </CardContent>
          </Card>
        </FormSections>

        <div className="space-y-3 self-start xl:sticky xl:top-[72px]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Sheet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Row label="Status">
                <span className={status.tone === 'success' ? 'text-success' : status.tone === 'info' ? 'text-info' : 'text-warning'}>{status.label}</span>
              </Row>
              <Row label="Made by">{fp.madeByName}</Row>
              <Row label="Made on">{fp.createdAt ? formatDateTime(fp.createdAt) : ''}</Row>
              <Row label="Revision">{fp.revision || 1}</Row>
              <Row label="Last printed">{fp.printedAt ? formatDateTime(fp.printedAt) : 'Not yet'}</Row>
              {(fp.emails || []).length ? (
                <div className="pt-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Emailed</p>
                  <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                    {[...fp.emails].reverse().slice(0, 5).map((m, i) => (
                      <li key={i}>
                        {formatDateTime(m.at)} · {m.to}
                        {m.byName ? ` · ${m.byName}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Booking</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Row label="Guest / company">{fp.lead?.businessName}</Row>
              <Row label="Contract">{booking?.contractNumber}</Row>
              <Row label="Confirmed on">{booking?.wonAt ? formatDate(booking.wonAt) : ''}</Row>
              <Row label="Stage">{booking?.stage}</Row>
              {hasModule(user, 'leads') && booking?.enquiryId ? (
                <Button variant="outline" size="sm" className="mt-2 w-full" asChild>
                  <Link to={`/enquiries/${booking.enquiryId}`}>Open the enquiry</Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <EmailSheetDialog open={emailOpen} onOpenChange={setEmailOpen} sheet={fp} onDone={() => load()} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={remove}
        title="Delete this prospectus?"
        description={`FP ${fp.number} will be removed. The booking itself is not affected.`}
        confirmText="Delete"
        variant="destructive"
      />
    </div>
  );
}
