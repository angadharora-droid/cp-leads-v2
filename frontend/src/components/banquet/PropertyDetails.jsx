import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { BedDouble, Building, Plus, Save, Trash2, TriangleAlert } from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { refreshProperties, useProperties } from '@/lib/properties';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';

function CardHead({ icon: Icon, title, description }) {
  return (
    <CardHeader>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </div>
    </CardHeader>
  );
}

// What the client documents print, in the order they are filled in.
const FIELDS = [
  { key: 'name', label: 'Hotel name', hint: 'Printed in capitals on the pro-forma', placeholder: 'Hotel Centre Point Nagpur' },
  { key: 'shortName', label: 'Short name', hint: 'Used in client emails and the addendum', placeholder: 'Hotel Centre Point' },
  { key: 'unitOf', label: 'A unit of', hint: 'The company, as on the pro-forma', placeholder: 'hotel Amarjit PVT LTD' },
  { key: 'address', label: 'Address', wide: true, placeholder: '24, central Bazar road, Ramdaspeth, Nagpur - 440 010 INDIA' },
  { key: 'registeredOffice', label: 'Registered office', hint: 'Named in the addendum', wide: true },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'gstin', label: 'GSTIN' },
  { key: 'pan', label: 'PAN' },
  { key: 'cin', label: 'CIN' },
  { key: 'vatTin', label: 'VAT TIN' },
  { key: 'fssai', label: 'FSSAI No.' },
  { key: 'udyam', label: 'UDYAM No.' },
];

const BANK_FIELDS = [
  { key: 'bankName', label: 'Bank name' },
  { key: 'accountName', label: 'Account name' },
  { key: 'accountNumber', label: 'Account number' },
  { key: 'accountType', label: 'Account type' },
  { key: 'ifsc', label: 'IFSC' },
  { key: 'branchAddress', label: 'Branch address', wide: true, multiline: true },
];

function detailsDraft(p) {
  return {
    ...Object.fromEntries(FIELDS.map((f) => [f.key, p?.[f.key] || ''])),
    bank: Object.fromEntries(BANK_FIELDS.map((f) => [f.key, p?.bank?.[f.key] || ''])),
  };
}

/** Letterhead, tax and bank details the property's client documents print. */
function DetailsCard({ property }) {
  const [draft, setDraft] = useState(() => detailsDraft(property));
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(detailsDraft(property)), [property]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(detailsDraft(property)), [draft, property]);
  const incomplete = !String(draft.name).trim() || !String(draft.address).trim();

  async function save() {
    setSaving(true);
    try {
      const trim = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, String(v).trim()]));
      await api.patch(`/properties/${property.code}`, { ...trim({ ...draft, bank: undefined }), bank: trim(draft.bank) });
      await refreshProperties();
      toast.success(`${property.code} details saved`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save the details'));
    } finally {
      setSaving(false);
    }
  }

  const field = (f, value, onChange) => (
    <div key={f.key} className={f.wide ? 'space-y-1.5 sm:col-span-2' : 'space-y-1.5'}>
      <Label htmlFor={`prop-${property.code}-${f.key}`}>{f.label}</Label>
      {f.multiline ? (
        <Textarea
          id={`prop-${property.code}-${f.key}`}
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={saving}
        />
      ) : (
        <Input
          id={`prop-${property.code}-${f.key}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={f.placeholder || ''}
          autoComplete="off"
          disabled={saving}
        />
      )}
      {f.hint ? <p className="text-xs text-muted-foreground">{f.hint}</p> : null}
    </div>
  );

  return (
    <Card>
      <CardHead
        icon={Building}
        title={`${property.code} property details`}
        description="What this hotel's proposals, contracts, pro-formas, addendums and client emails print. Document numbers use the code."
      />
      <CardContent className="space-y-5">
        {incomplete ? (
          <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            {property.code}&apos;s documents cannot be generated until the hotel name and address are filled in.
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => field(f, draft[f.key], (v) => setDraft((d) => ({ ...d, [f.key]: v }))))}
        </div>
        <div className="space-y-3">
          <p className="eyebrow">Bank details</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {BANK_FIELDS.map((f) =>
              field(f, draft.bank[f.key], (v) => setDraft((d) => ({ ...d, bank: { ...d.bank, [f.key]: v } })))
            )}
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={save} disabled={saving || !dirty}>
            {saving ? <Spinner size="sm" className="text-current" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            Save details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function roomsDraft(p) {
  return (p?.roomTypes || []).map((t) => ({ _id: t._id, name: t.name, count: String(t.count ?? '') }));
}

/** Room categories and how many of each; rooms are counted, never numbered. */
function RoomsCard({ property }) {
  const [rows, setRows] = useState(() => roomsDraft(property));
  const [saving, setSaving] = useState(false);
  useEffect(() => setRows(roomsDraft(property)), [property]);
  const dirty = JSON.stringify(rows) !== JSON.stringify(roomsDraft(property));
  const total = rows.reduce((sum, r) => sum + (parseInt(r.count, 10) || 0), 0);
  const set = (i, patch) => setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function save() {
    const clean = rows
      .map((r) => ({ ...r, name: r.name.trim(), count: parseInt(r.count, 10) }))
      .filter((r) => r.name || r.count);
    if (clean.some((r) => !r.name)) return toast.error('Name every room category');
    if (clean.some((r) => !Number.isInteger(r.count) || r.count < 0)) return toast.error('Enter how many rooms each category has');
    setSaving(true);
    try {
      await api.patch(`/properties/${property.code}`, {
        roomTypes: clean.map((r) => ({ ...(r._id ? { _id: r._id } : {}), name: r.name, count: r.count })),
      });
      await refreshProperties();
      toast.success(`${property.code} rooms saved`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save the rooms'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHead
        icon={BedDouble}
        title={`${property.code} rooms`}
        description="Room categories and how many rooms of each. A property with rooms takes room enquiries and has a room calendar; leave it empty for banquet only."
      />
      <CardContent className="space-y-3">
        {rows.length ? (
          <ul className="space-y-2" aria-label="Room categories">
            {rows.map((row, i) => (
              <li key={row._id || `new-${i}`} className="grid grid-cols-[minmax(0,1fr)_6.5rem_auto] items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor={`room-${property.code}-${i}`} className={i ? 'sr-only' : ''}>
                    Category
                  </Label>
                  <Input
                    id={`room-${property.code}-${i}`}
                    value={row.name}
                    onChange={(e) => set(i, { name: e.target.value })}
                    placeholder="Premium"
                    autoComplete="off"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`room-count-${property.code}-${i}`} className={i ? 'sr-only' : ''}>
                    Rooms
                  </Label>
                  <Input
                    id={`room-count-${property.code}-${i}`}
                    inputMode="numeric"
                    value={row.count}
                    onChange={(e) => set(i, { count: e.target.value.replace(/[^0-9]/g, '') })}
                    placeholder="0"
                    className="text-right tabular-nums"
                    disabled={saving}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setRows((list) => list.filter((_, j) => j !== i))}
                  disabled={saving}
                  aria-label={`Remove ${row.name || 'this category'}`}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No rooms — {property.code} takes banquet enquiries only.</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <Button type="button" variant="outline" size="sm" onClick={() => setRows((list) => [...list, { name: '', count: '' }])} disabled={saving}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add category
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-sm tabular-nums text-muted-foreground">
              {total} room{total === 1 ? '' : 's'} in all
            </span>
            <Button type="button" onClick={save} disabled={saving || !dirty}>
              {saving ? <Spinner size="sm" className="text-current" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              Save rooms
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Banquet Setup's cards for the chosen property's own details and rooms. */
export default function PropertyDetails({ code }) {
  const properties = useProperties();
  const property = properties?.find((p) => p.code === code);
  if (!property) return null;
  return (
    <>
      <DetailsCard property={property} />
      <RoomsCard property={property} />
    </>
  );
}
