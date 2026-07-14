import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Plus,
  X,
  Save,
  FileDown,
  Mail,
  Upload,
  Trash2,
  FileText,
  Building2,
  Eye,
  Package,
  UserRound,
  Receipt,
  BedDouble,
  UtensilsCrossed,
  ClipboardList,
} from 'lucide-react';

import api, { getErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/* -------------------------------------------------------------------------- */
/* Defaults (mirroring the standard Centre Point documents)                    */
/* -------------------------------------------------------------------------- */

const DEFAULT_INCLUSIONS = [
  'Complimentary internet facilities (Wi-Fi)',
  'Check-in Time 14:00, Check-out Time 12:00',
  'Extra Buffet Breakfast @ Rs. 799/- + GST',
  'Early Check-In after 07:00 hrs will be charged half day tariff (as per availability)',
  'Late Check-Out till 18:00 hrs will be charged half day tariff, after that full day tariff will be applicable (as per availability)',
  'Rooms are subject to availability',
];

const DEFAULT_SESSION_TIMINGS = [
  'Morning session – 8.00 am till 12 noon sharp',
  'Lunch session – 12 noon till 3.00 pm',
  'Hi-tea session – 3.00 pm till 6.00 pm sharp',
  'Evening session – 7.00 pm till 12.00 am',
];

const EMPTY_ROOM_ROW = {
  checkIn: '',
  checkOut: '',
  occupancyType: '',
  category: '',
  mealPlan: '',
  numRooms: '',
  rate: '',
  estRevenue: '',
};

const EMPTY_EVENT_ROW = {
  date: '',
  eventType: '',
  venue: '',
  guaranteedGuests: '',
  menu: '',
  rackRate: '',
  discountedRate: '',
  estRevenue: '',
};

const EMPTY_REQUIREMENT_ROW = {
  particulars: '',
  details: '',
  rate: '',
  estRevenue: '',
};

const EMPTY_OTHER_RATE_ROW = { category: '', rate: '' };

const EMPTY_CORPORATE_RATE_ROW = {
  category: '',
  size: '',
  singleRate: '',
  doubleRate: '',
};

function defaultEventDetails(lead) {
  return {
    guestName: lead
      ? [lead.contactPerson, lead.businessName].filter(Boolean).join(' / ')
      : '',
    eventType: '',
    eventDates: '',
    mobile: lead?.mobile || '',
    email: lead?.email || '',
    billingName: 'Kindly Advise',
    gstNumber: 'Kindly Advise',
    panNumber: 'Kindly Advise',
    paymentTerms: '100% Advance Payment Before Function',
    rooms: [{ ...EMPTY_ROOM_ROW }],
    roomsEstimatedRevenue: '',
    otherRoomRates: [
      { category: 'Super Club', rate: '' },
      { category: 'Deluxe Suite', rate: '' },
      { category: 'CP Suite', rate: '' },
    ],
    inclusions: [...DEFAULT_INCLUSIONS],
    events: [{ ...EMPTY_EVENT_ROW }],
    eventsEstimatedRevenue: '',
    otherRequirements: [
      { ...EMPTY_REQUIREMENT_ROW, particulars: 'Alcoholic Beverages' },
      { ...EMPTY_REQUIREMENT_ROW, particulars: 'Soft Beverages' },
      { ...EMPTY_REQUIREMENT_ROW, particulars: 'AV Equipment' },
    ],
    sessionTimings: [...DEFAULT_SESSION_TIMINGS],
    notes: '',
  };
}

function defaultCorporateDetails(lead) {
  return {
    companyName: lead?.businessName || '',
    contactPerson: lead?.contactPerson || '',
    mobile: lead?.mobile || '',
    address: lead?.city || '',
    email: lead?.email || '',
    gstNumber: '',
    panNumber: '',
    properties: [
      {
        propertyName: 'Hotel Centre Point, Nagpur',
        rows: [
          { category: 'Executive', size: '278 sq.ft', singleRate: '', doubleRate: '' },
          { category: 'Premium', size: '312 sq.ft', singleRate: '', doubleRate: '' },
          { category: 'Club', size: '402 sq.ft', singleRate: '', doubleRate: '' },
        ],
      },
      {
        propertyName: 'Hotel Centre Point, Navi Mumbai',
        rows: [
          { category: 'Premium Room', size: '275 sq.ft', singleRate: '', doubleRate: '' },
          { category: 'Club Room', size: '325 sq.ft', singleRate: '', doubleRate: '' },
        ],
      },
    ],
    validUntil: '',
    extraBedRate: 'INR 1500 plus taxes',
    notes: '',
  };
}

const KIT_STATUS_BADGE = {
  draft: 'secondary',
  sent: 'accent',
  confirmed: 'default',
};

export const KIT_TYPE_LABEL = {
  event: 'Event Kit',
  corporate: 'Corporate Rate Kit',
};

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

function pickKit(res) {
  return res?.data?.data?.kit ?? null;
}

function TextField({ label, value, onChange, placeholder, className }) {
  return (
    <div className={'space-y-1.5 ' + (className || '')}>
      <Label className="text-xs">{label}</Label>
      <Input
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

/** Textarea bound to an array of lines (one bullet per line). */
function LinesField({ label, hint, values, onChange, rows = 5 }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <Textarea
        value={(values || []).join('\n')}
        onChange={(e) => onChange(e.target.value.split('\n'))}
        rows={rows}
      />
    </div>
  );
}

/**
 * Spreadsheet-style editor for a dynamic list of row objects: column labels
 * once at the top, then rows of quiet inputs that highlight on hover/focus.
 * Scrolls horizontally on narrow screens.
 */
function RowsEditor({ title, description, columns, rows, onRowsChange, emptyRow, addLabel }) {
  function updateCell(idx, key, value) {
    const next = rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r));
    onRowsChange(next);
  }
  function addRow() {
    onRowsChange([...rows, { ...emptyRow }]);
  }
  function removeRow(idx) {
    onRowsChange(rows.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="w-9 px-2 py-2 text-center text-[11px] font-semibold text-muted-foreground">
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="whitespace-nowrap px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                  style={{ minWidth: col.width || 110 }}
                >
                  {col.label}
                </th>
              ))}
              <th className="w-10" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 2}
                  className="px-4 py-6 text-center text-sm text-muted-foreground"
                >
                  No rows yet — add one below.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr
                  key={idx}
                  className="border-b transition-colors last:border-0 hover:bg-muted/30 focus-within:bg-primary/5"
                >
                  <td className="px-2 text-center text-xs tabular-nums text-muted-foreground/60">
                    {idx + 1}
                  </td>
                  {columns.map((col) => (
                    <td key={col.key} className="p-1">
                      <Input
                        className="h-9 rounded-md border-transparent bg-transparent px-2 shadow-none hover:border-input focus-visible:border-ring focus-visible:bg-background"
                        value={row[col.key] ?? ''}
                        onChange={(e) => updateCell(idx, col.key, e.target.value)}
                        placeholder={col.placeholder}
                        aria-label={`${title} — row ${idx + 1} — ${col.label}`}
                      />
                    </td>
                  ))}
                  <td className="px-1 text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground/50 hover:text-destructive"
                      onClick={() => removeRow(idx)}
                      aria-label={`Remove row ${idx + 1}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="h-4 w-4" />
        {addLabel || 'Add row'}
      </Button>
    </div>
  );
}

async function downloadKitPdf(kitId, doc, fallbackName) {
  const res = await api.get(`/kits/${kitId}/pdf`, {
    params: doc ? { doc } : undefined,
    responseType: 'blob',
  });
  const disposition = res.headers?.['content-disposition'] || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
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

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function KitPage() {
  const { id: leadId, kitId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNew = !kitId;
  const initialType = searchParams.get('type') === 'corporate' ? 'corporate' : 'event';

  const [lead, setLead] = useState(null);
  const [kit, setKit] = useState(null);
  const [kitType, setKitType] = useState(initialType);
  const [form, setForm] = useState(null);
  const [contractNumber, setContractNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const leadRes = await api.get(`/leads/${leadId}`);
      const leadData = leadRes?.data?.data?.lead;
      setLead(leadData);

      if (kitId) {
        const kitRes = await api.get(`/kits/${kitId}`);
        const kitData = pickKit(kitRes);
        if (!kitData) throw new Error('Kit not found');
        setKit(kitData);
        setKitType(kitData.kitType);
        setContractNumber(kitData.contractNumber || '');
        setForm(
          kitData.kitType === 'event'
            ? { ...defaultEventDetails(null), ...(kitData.event || {}) }
            : { ...defaultCorporateDetails(null), ...(kitData.corporate || {}) }
        );
      } else {
        setForm(
          initialType === 'event'
            ? defaultEventDetails(leadData)
            : defaultCorporateDetails(leadData)
        );
      }
      setLoadError(null);
    } catch (err) {
      setLoadError(getErrorMessage(err, 'Failed to load'));
    } finally {
      setLoading(false);
    }
  }, [leadId, kitId, initialType]);

  useEffect(() => {
    load();
  }, [load]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function cleanLines(arr) {
    return (arr || []).map((s) => s.trim()).filter(Boolean);
  }

  function buildPayload() {
    if (kitType === 'event') {
      return {
        event: {
          ...form,
          inclusions: cleanLines(form.inclusions),
          sessionTimings: cleanLines(form.sessionTimings),
        },
        ...(contractNumber ? { contractNumber } : {}),
      };
    }
    return { corporate: { ...form } };
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (isNew) {
        const res = await api.post(`/leads/${leadId}/kits`, {
          kitType,
          ...buildPayload(),
        });
        const created = pickKit(res);
        toast.success('Kit created');
        navigate(`/leads/${leadId}/kits/${created._id}`, { replace: true });
      } else {
        const res = await api.put(`/kits/${kitId}`, buildPayload());
        const next = pickKit(res);
        setKit(next);
        setContractNumber(next.contractNumber || '');
        toast.success('Kit saved');
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save kit'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (loadError || !form) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Kit"
          actions={
            <Button variant="outline" asChild>
              <Link to={`/leads/${leadId}`}>
                <ArrowLeft className="h-4 w-4" />
                Back to lead
              </Link>
            </Button>
          }
        />
        <EmptyState
          icon={Package}
          title="Kit not found"
          description={loadError || 'This kit does not exist or you do not have access to it.'}
        />
      </div>
    );
  }

  const title = isNew
    ? `New ${KIT_TYPE_LABEL[kitType]}`
    : `${KIT_TYPE_LABEL[kitType]} — ${
        kitType === 'event' ? form.guestName || 'Untitled' : form.companyName || 'Untitled'
      }`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/leads/${leadId}`)}
          aria-label="Back to lead"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Link to="/leads" className="text-sm text-muted-foreground hover:text-foreground">
          Leads
        </Link>
        <span className="text-muted-foreground">/</span>
        <Link
          to={`/leads/${leadId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {lead?.reference || 'Lead'}
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium text-foreground">
          {isNew ? 'New kit' : KIT_TYPE_LABEL[kitType]}
        </span>
      </div>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {title}
            {kit ? (
              <Badge variant={KIT_STATUS_BADGE[kit.status] || 'secondary'}>
                {kit.status}
              </Badge>
            ) : null}
          </span>
        }
        description={
          kitType === 'event'
            ? 'Fill the details below — the Proposal and Confirmation Contract are generated from them.'
            : 'Fill the details below — the corporate room-rate agreement letter is generated from them.'
        }
        actions={
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Spinner size="sm" className="text-current" /> : <Save className="h-4 w-4" />}
            {isNew ? 'Create kit' : 'Save changes'}
          </Button>
        }
      />

      {kit ? <KitActions kit={kit} setKit={setKit} leadId={leadId} navigate={navigate} /> : null}

      {kitType === 'event' ? (
        <EventKitForm
          form={form}
          update={update}
          contractNumber={contractNumber}
          setContractNumber={setContractNumber}
          isNew={isNew}
        />
      ) : (
        <CorporateKitForm form={form} update={update} />
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Spinner size="sm" className="text-current" /> : <Save className="h-4 w-4" />}
          {isNew ? 'Create kit' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Event kit form                                                              */
/* -------------------------------------------------------------------------- */

function EventKitForm({ form, update, contractNumber, setContractNumber, isNew }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-primary" />
            Guest and Function Information
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField
            label="Guest Name / Organization"
            value={form.guestName}
            onChange={(v) => update('guestName', v)}
            placeholder="Dr. Arneja / Nagpur Live"
          />
          <TextField
            label="Event Type"
            value={form.eventType}
            onChange={(v) => update('eventType', v)}
            placeholder="Residential Conference"
          />
          <TextField
            label="Event Dates"
            value={form.eventDates}
            onChange={(v) => update('eventDates', v)}
            placeholder="25th & 26th July 2026"
          />
          <TextField
            label="Mobile Number"
            value={form.mobile}
            onChange={(v) => update('mobile', v)}
            placeholder="+91 …"
          />
          <TextField
            label="Email Address"
            value={form.email}
            onChange={(v) => update('email', v)}
            placeholder="guest@example.com"
          />
          {!isNew ? (
            <TextField
              label="Contract Number"
              value={contractNumber}
              onChange={setContractNumber}
              placeholder="29420"
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            Billing Instruction
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="Billing Name"
            value={form.billingName}
            onChange={(v) => update('billingName', v)}
          />
          <TextField
            label="GST Number"
            value={form.gstNumber}
            onChange={(v) => update('gstNumber', v)}
          />
          <TextField
            label="PAN Number"
            value={form.panNumber}
            onChange={(v) => update('panNumber', v)}
          />
          <TextField
            label="Payment Terms"
            value={form.paymentTerms}
            onChange={(v) => update('paymentTerms', v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BedDouble className="h-4 w-4 text-primary" />
            Room Requirement Information
          </CardTitle>
          <CardDescription>Rates and revenue are exclusive of taxes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RowsEditor
            title="Room bookings"
            columns={[
              { key: 'checkIn', label: 'Check-in date', placeholder: '25th July 2026' },
              { key: 'checkOut', label: 'Check-out date', placeholder: '26th July 2026' },
              { key: 'occupancyType', label: 'Occupancy', placeholder: 'Single / Double' },
              { key: 'category', label: 'Category', placeholder: 'Run of the House' },
              { key: 'mealPlan', label: 'Meal plan', placeholder: 'CP' },
              { key: 'numRooms', label: 'No. of rooms', placeholder: '90' },
              { key: 'rate', label: 'Rate (excl. taxes)', placeholder: 'Rs. 6,499' },
              { key: 'estRevenue', label: 'Est. revenue', placeholder: 'Rs. 5,84,910' },
            ]}
            rows={form.rooms}
            onRowsChange={(rows) => update('rooms', rows)}
            emptyRow={EMPTY_ROOM_ROW}
            addLabel="Add room row"
          />
          <TextField
            label="Estimated Revenue (Rooms)"
            value={form.roomsEstimatedRevenue}
            onChange={(v) => update('roomsEstimatedRevenue', v)}
            placeholder="Rs. 5,84,910"
          />
          <Separator />
          <RowsEditor
            title="Other room category rates"
            description="Shown as: “In case of any other room category, the room would be charged at the following rates.”"
            columns={[
              { key: 'category', label: 'Rooms category', placeholder: 'Deluxe Suite', width: 180 },
              { key: 'rate', label: 'Rate (excl. taxes)', placeholder: 'Rs. 15,000', width: 180 },
            ]}
            rows={form.otherRoomRates}
            onRowsChange={(rows) => update('otherRoomRates', rows)}
            emptyRow={EMPTY_OTHER_RATE_ROW}
            addLabel="Add category"
          />
          <Separator />
          <LinesField
            label="Rates Inclusions"
            hint="One inclusion per line."
            values={form.inclusions}
            onChange={(v) => update('inclusions', v)}
            rows={6}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UtensilsCrossed className="h-4 w-4 text-primary" />
            Event and Meal Details
          </CardTitle>
          <CardDescription>Rack and discounted rates are exclusive of taxes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RowsEditor
            title="Events & meals"
            columns={[
              { key: 'date', label: 'Date', placeholder: '25th July 2026' },
              { key: 'eventType', label: 'Event type', placeholder: 'Gala Dinner' },
              { key: 'venue', label: 'Venue', placeholder: 'Palacio' },
              { key: 'guaranteedGuests', label: 'Min. guaranteed guests', placeholder: '300' },
              { key: 'menu', label: 'Type of menu', placeholder: 'Mix Menu with Snacks', width: 170 },
              { key: 'rackRate', label: 'Rack rate', placeholder: 'Rs. 2,200' },
              { key: 'discountedRate', label: 'Discounted rate', placeholder: 'Rs. 2,000' },
              { key: 'estRevenue', label: 'Est. revenue', placeholder: 'Rs. 6,00,000' },
            ]}
            rows={form.events}
            onRowsChange={(rows) => update('events', rows)}
            emptyRow={EMPTY_EVENT_ROW}
            addLabel="Add event row"
          />
          <TextField
            label="Estimated Revenue (Events)"
            value={form.eventsEstimatedRevenue}
            onChange={(v) => update('eventsEstimatedRevenue', v)}
            placeholder="Rs. 14,85,000 / Rs. 13,55,000"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Other Requirements & Sessions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <RowsEditor
            title="Other requirements"
            columns={[
              { key: 'particulars', label: 'Particulars', placeholder: 'AV Equipment', width: 150 },
              { key: 'details', label: 'Requirement details', width: 200 },
              { key: 'rate', label: 'Rate' },
              { key: 'estRevenue', label: 'Estimated revenue' },
            ]}
            rows={form.otherRequirements}
            onRowsChange={(rows) => update('otherRequirements', rows)}
            emptyRow={EMPTY_REQUIREMENT_ROW}
            addLabel="Add requirement"
          />
          <Separator />
          <LinesField
            label="Session Timings"
            hint="One session per line."
            values={form.sessionTimings}
            onChange={(v) => update('sessionTimings', v)}
            rows={4}
          />
          <div className="space-y-1.5">
            <Label className="text-xs">Note (printed on the document)</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              placeholder="e.g. Upon consumption of 1,200 plates, a rate of Rs. 4,000/- per plate plus applicable taxes will be charged…"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Corporate kit form                                                          */
/* -------------------------------------------------------------------------- */

function CorporateKitForm({ form, update }) {
  function updateProperty(idx, patch) {
    const next = form.properties.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    update('properties', next);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Company Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField
            label="Company Name"
            value={form.companyName}
            onChange={(v) => update('companyName', v)}
            placeholder="BERGER PAINTS INDIA LIMITED"
          />
          <TextField
            label="Contact Person"
            value={form.contactPerson}
            onChange={(v) => update('contactPerson', v)}
            placeholder="Mr. Deoraj Tari"
          />
          <TextField
            label="Mobile Number"
            value={form.mobile}
            onChange={(v) => update('mobile', v)}
            placeholder="+91 …"
          />
          <TextField
            label="Email Address"
            value={form.email}
            onChange={(v) => update('email', v)}
          />
          <TextField
            label="GST Number"
            value={form.gstNumber}
            onChange={(v) => update('gstNumber', v)}
          />
          <TextField
            label="PAN Number"
            value={form.panNumber}
            onChange={(v) => update('panNumber', v)}
          />
          <div className="sm:col-span-2 lg:col-span-3">
            <TextField
              label="Address"
              value={form.address}
              onChange={(v) => update('address', v)}
              placeholder="Full company address"
            />
          </div>
        </CardContent>
      </Card>

      {(form.properties || []).map((property, idx) => (
        <Card key={idx}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Corporate Rates — Property {idx + 1}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <TextField
              label="Property Name"
              value={property.propertyName}
              onChange={(v) => updateProperty(idx, { propertyName: v })}
              placeholder="Hotel Centre Point, Nagpur"
            />
            <RowsEditor
              title="Room rates (INR, Continental Plan)"
              columns={[
                { key: 'category', label: 'Room category', placeholder: 'Executive' },
                { key: 'size', label: 'Room size', placeholder: '278 sq.ft' },
                { key: 'singleRate', label: 'Single rate', placeholder: '4000' },
                { key: 'doubleRate', label: 'Double rate', placeholder: '5000' },
              ]}
              rows={property.rows}
              onRowsChange={(rows) => updateProperty(idx, { rows })}
              emptyRow={EMPTY_CORPORATE_RATE_ROW}
              addLabel="Add rate row"
            />
          </CardContent>
        </Card>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          update('properties', [
            ...(form.properties || []),
            { propertyName: '', rows: [{ ...EMPTY_CORPORATE_RATE_ROW }] },
          ])
        }
      >
        <Plus className="h-4 w-4" />
        Add property
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Agreement Terms
          </CardTitle>
          <CardDescription>
            The standard terms (check-in/out, cancellation, credit, confidentiality, …) are
            printed automatically on the letter.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Rates Valid Until"
            value={form.validUntil}
            onChange={(v) => update('validUntil', v)}
            placeholder="31st March 2027"
          />
          <TextField
            label="Extra Bed Rate"
            value={form.extraBedRate}
            onChange={(v) => update('extraBedRate', v)}
          />
          <div className="sm:col-span-2 space-y-1.5">
            <Label className="text-xs">Additional Notes (printed on the letter)</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Actions: PDF download, email, confirmation upload, delete                   */
/* -------------------------------------------------------------------------- */

function KitActions({ kit, setKit, leadId, navigate }) {
  const isEvent = kit.kitType === 'event';
  const [downloading, setDownloading] = useState(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewingId, setViewingId] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const fileInputRef = useRef(null);

  async function handleDownload(doc, label) {
    setDownloading(doc || 'main');
    try {
      await downloadKitPdf(kit._id, doc, `${label}.pdf`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to generate PDF'));
    } finally {
      setDownloading(null);
    }
  }

  async function handleUpload(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    setUploading(true);
    try {
      const res = await api.post(`/kits/${kit._id}/confirmation-files`, formData);
      setKit(pickKit(res));
      toast.success(
        'Signed confirmation uploaded — lead marked as Contracted'
      );
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to upload files'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleViewFile(file) {
    setViewingId(String(file.fileId));
    try {
      const res = await api.get(
        `/kits/${kit._id}/confirmation-files/${file.fileId}`,
        { responseType: 'blob' }
      );
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to open file'));
    } finally {
      setViewingId(null);
    }
  }

  async function handleRemoveFile(file) {
    setRemovingId(String(file.fileId));
    try {
      const res = await api.delete(
        `/kits/${kit._id}/confirmation-files/${file.fileId}`
      );
      setKit(pickKit(res));
      toast.success('File removed');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to remove file'));
    } finally {
      setRemovingId(null);
    }
  }

  async function handleDeleteKit() {
    try {
      await api.delete(`/kits/${kit._id}`);
      toast.success('Kit deleted');
      navigate(`/leads/${leadId}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete kit'));
      throw err;
    }
  }

  const sentEmails = (kit.emailLog || []).filter((e) => e.status === 'sent');

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-muted-foreground" />
          Documents & Confirmation
        </CardTitle>
        <CardDescription>
          {isEvent
            ? 'Generate the proposal or confirmation contract, email it, then upload the signed copy.'
            : 'Generate the corporate rate agreement letter, email it, then upload the signed copy.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {isEvent ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownload('proposal', 'Proposal')}
                disabled={downloading !== null}
              >
                {downloading === 'proposal' ? (
                  <Spinner size="sm" className="text-current" />
                ) : (
                  <FileDown className="h-4 w-4" />
                )}
                Proposal PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownload('confirmation', 'Confirmation Contract')}
                disabled={downloading !== null}
              >
                {downloading === 'confirmation' ? (
                  <Spinner size="sm" className="text-current" />
                ) : (
                  <FileDown className="h-4 w-4" />
                )}
                Confirmation Contract PDF
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDownload(undefined, 'Corporate Rate Agreement')}
              disabled={downloading !== null}
            >
              {downloading ? (
                <Spinner size="sm" className="text-current" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
              Agreement PDF
            </Button>
          )}

          <Button size="sm" onClick={() => setEmailOpen(true)}>
            <Mail className="h-4 w-4" />
            Email to client
          </Button>

          <div className="ml-auto">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" />
              Delete kit
            </Button>
          </div>
        </div>

        {sentEmails.length > 0 ? (
          <div className="rounded-lg border bg-muted/20 px-4 py-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sent emails
            </p>
            <ul className="space-y-1">
              {sentEmails.map((e, i) => (
                <li key={e._id || i} className="text-sm text-foreground">
                  <span className="font-medium">
                    {e.docType === 'confirmation' ? 'Confirmation Contract' : isEvent ? 'Proposal' : 'Rate Agreement'}
                  </span>{' '}
                  to {e.to} · {formatDateTime(e.sentAt)}
                  {e.sentByName ? ` · by ${e.sentByName}` : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Separator />

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-foreground">
                Signed confirmation
              </p>
              <p className="text-xs text-muted-foreground">
                Upload the signed copy — photos (JPG/PNG) or PDF. This marks the
                kit confirmed and the lead as Contracted.
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Spinner size="sm" className="text-current" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Upload signed copy
            </Button>
          </div>

          {(kit.confirmationFiles || []).length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
              No signed confirmation uploaded yet.
            </p>
          ) : (
            <div className="space-y-2">
              {kit.confirmationFiles.map((file) => {
                const fid = String(file.fileId);
                return (
                  <div
                    key={fid}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <FileText className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {file.filename}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {file.contentType}
                        {file.size ? ` · ${(file.size / 1024).toFixed(0)} KB` : ''}
                        {' · '}
                        {formatDateTime(file.uploadedAt)}
                        {file.uploadedByName ? ` · by ${file.uploadedByName}` : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleViewFile(file)}
                      disabled={viewingId === fid}
                      aria-label="View file"
                    >
                      {viewingId === fid ? (
                        <Spinner size="sm" className="text-current" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleRemoveFile(file)}
                      disabled={removingId === fid}
                      aria-label="Remove file"
                    >
                      {removingId === fid ? (
                        <Spinner size="sm" className="text-current" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>

      <EmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        kit={kit}
        setKit={setKit}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={handleDeleteKit}
        title="Delete this kit?"
        description="The kit, its email log and any uploaded confirmation files will be permanently removed."
        confirmText="Delete kit"
        variant="destructive"
      />
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Email dialog                                                                */
/* -------------------------------------------------------------------------- */

function EmailDialog({ open, onOpenChange, kit, setKit }) {
  const isEvent = kit.kitType === 'event';
  const defaultTo = isEvent ? kit.event?.email || '' : kit.corporate?.email || '';
  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState('');
  const [docType, setDocType] = useState('proposal');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setTo(isEvent ? kit.event?.email || '' : kit.corporate?.email || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSend() {
    const trimmedTo = to.trim();
    if (!trimmedTo) {
      toast.error('Enter the recipient email address');
      return;
    }
    setSending(true);
    try {
      const res = await api.post(`/kits/${kit._id}/send`, {
        to: trimmedTo,
        cc: cc.trim() || undefined,
        subject: subject.trim() || undefined,
        message: message.trim() || undefined,
        docType: isEvent ? docType : undefined,
      });
      setKit(pickKit(res));
      toast.success(`Email sent to ${trimmedTo}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to send email'));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !sending && onOpenChange(next)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Email to client</DialogTitle>
          <DialogDescription>
            The {isEvent
              ? docType === 'confirmation'
                ? 'confirmation contract'
                : 'proposal'
              : 'rate agreement letter'}{' '}
            PDF is generated and attached automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {isEvent ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Document</Label>
              <Select value={docType} onValueChange={setDocType} disabled={sending}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="proposal">Proposal</SelectItem>
                  <SelectItem value="confirmation">Confirmation Contract</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label className="text-xs">To (comma-separated for multiple)</Label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="client@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">CC (optional)</Label>
            <Input value={cc} onChange={(e) => setCc(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Subject (optional — a default is used if blank)</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Message (optional — a default is used if blank)</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSend} disabled={sending}>
            {sending ? <Spinner size="sm" className="text-current" /> : <Mail className="h-4 w-4" />}
            Send email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
