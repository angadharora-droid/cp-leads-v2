import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  AlertTriangle,
  BedDouble,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  IndianRupee,
  Plus,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { stageInfo } from '@/lib/enquiryStages';
import { isIndividual } from '@/lib/departments';
import DayTimeline from '@/components/banquet/DayTimeline';
import DepartmentSelect from '@/components/leads/DepartmentSelect';
import MultiSelect from '@/components/ui/multi-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  SidePanel,
  SidePanelContent,
  SidePanelHeader,
  SidePanelBody,
  SidePanelFooter,
  SidePanelTitle,
  SidePanelDescription,
} from '@/components/ui/side-panel';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const KIND_OPTIONS = [
  { value: 'banquet', label: 'Banquet' },
  { value: 'room', label: 'Rooms' },
  { value: 'both', label: 'Banquet + Rooms' },
];

function emptyFunction() {
  return {
    functionType: '',
    date: '',
    // The primary venue plus any add-on rooms held with it.
    venue: '',
    addOnRooms: [],
    // Held venues whose Banquet Setup hall charge is applied.
    hallChargeVenues: [],
    sessions: [],
    pax: '',
    menuType: '',
    addOns: [],
    liquor: [],
    requirements: [],
    // Offered rate per picked option (item id → rupees as typed); the
    // proposed rate is formed from these.
    lineRates: {},
    additionalRequirement: '',
  };
}

function emptyRoom() {
  return { checkIn: '', checkOut: '', rooms: '', notes: '' };
}

function toInputDate(value) {
  if (!value) return '';
  try {
    return format(new Date(value), 'yyyy-MM-dd');
  } catch {
    return '';
  }
}

function idOf(value) {
  if (!value) return '';
  return String(value._id || value);
}

/** Every venue a form function holds: the primary, then its add-on rooms (no blanks, no repeats). */
function heldVenues(fn) {
  const seen = new Set();
  return [fn.venue, ...(fn.addOnRooms || [])].filter((id) => id && !seen.has(id) && seen.add(id));
}

/**
 * Primary venue and add-on rooms of a saved function as the form holds them.
 * Enquiries saved before add-on rooms existed hold a `venues` list (primary
 * first); the oldest hold a single `venue`.
 */
function loadVenues(fn) {
  const held = (fn.venues?.length ? fn.venues : [fn.venue, ...(fn.addOnRooms || [])])
    .filter(Boolean)
    .map(idOf);
  // `venues` is written primary-first, so its head is the primary whenever it exists.
  const venue = held[0] || '';
  const addOnRooms = fn.addOnRooms?.length
    ? fn.addOnRooms.map(idOf)
    : held.filter((id) => id !== venue);
  return { venue, addOnRooms };
}

/**
 * Offered rates of a saved function as the form holds them (item id → rate).
 * Enquiries saved before line rates existed carried one edited total; that
 * difference is put on the menu line so the proposed rate is kept.
 */
function loadLineRates(fn) {
  const map = {};
  for (const line of fn.lineRates || []) {
    if (line?.item) map[idOf(line.item)] = String(line.rate ?? '');
  }
  if (Object.keys(map).length) return map;
  const pax = Number(fn.pax) || 0;
  const menuId = idOf(fn.menuType);
  if (menuId && pax && fn.proposedRate && fn.rackRate && fn.proposedRate !== fn.rackRate) {
    const menuRack = Number(fn.menuType?.rate) || 0;
    const perPaxDelta = (Number(fn.proposedRate) - Number(fn.rackRate)) / pax;
    map[menuId] = String(Math.max(0, Math.round(menuRack + perPaxDelta)));
  }
  return map;
}

export function inr(amount) {
  return `Rs. ${Number(amount || 0).toLocaleString('en-IN')}`;
}

/** Only options an admin left active in Banquet Setup can be picked. */
function activeOnly(list) {
  return (list || []).filter((item) => item.active !== false);
}

/** Section header inside the dialog: icon, title, one-liner, optional action. */
function SectionHeading({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {description ? (
            <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {action}
    </div>
  );
}

function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden="true">
      {' '}
      *
    </span>
  );
}

const LINE_KIND_LABELS = {
  menuType: 'Menu',
  addOn: 'Add-on',
  liquor: 'Liquor',
  requirement: 'Requirement',
};

/**
 * Prices a function the same way the API does. Every picked option is a
 * line with its Banquet Setup (rack) rate and the rate offered for this
 * enquiry (`fn.lineRates[item id]`, rack when untouched):
 *
 *   per-guest rate = menu + per-guest add-ons, liquor and requirements
 *   rate           = per-guest rate x pax + flat-priced options
 *
 * `rack` uses the catalog rates, `proposed` the offered ones.
 */
export function priceFunction(fn, catalog, venues = []) {
  const byId = catalog.byId;
  const picked = [
    byId.get(String(fn.menuType)),
    ...(fn.addOns || []).map((id) => byId.get(String(id))),
    ...(fn.liquor || []).map((id) => byId.get(String(id))),
    ...(fn.requirements || []).map((id) => byId.get(String(id))),
  ].filter(Boolean);
  const pax = Math.max(0, Number(fn.pax) || 0);
  const overrides = fn.lineRates || {};

  const lines = picked.map((item) => {
    const id = String(item._id);
    const rackRate = Number(item.rate) || 0;
    const edited = overrides[id] !== undefined && overrides[id] !== '';
    const rate = edited ? Number(overrides[id]) || 0 : rackRate;
    const flat = item.pricing === 'flat';
    return {
      id,
      name: item.name,
      kind: LINE_KIND_LABELS[item.kind] || item.kind,
      flat,
      rackRate,
      rate,
      edited,
      amount: flat ? rate : rate * pax,
      rackAmount: flat ? rackRate : rackRate * pax,
    };
  });

  // Hall charges for the held venues that are ticked. The amount is always the
  // Banquet Setup figure, so these lines are shown but never edited.
  const hallLines = tickedHallVenues(fn)
    .map((id) => venues.find((v) => String(v._id) === id))
    .filter((v) => v && Number(v.hallCharge) > 0)
    .map((v) => {
      const charge = Number(v.hallCharge) || 0;
      return {
        id: `hall-${v._id}`,
        name: v.name,
        kind: 'Hall charge',
        flat: true,
        locked: true,
        rackRate: charge,
        rate: charge,
        edited: false,
        amount: charge,
        rackAmount: charge,
      };
    });
  const hall = hallLines.reduce((sum, line) => sum + line.amount, 0);
  lines.push(...hallLines);

  let perPax = 0;
  let flat = 0;
  let rackPerPax = 0;
  let rackFlat = 0;
  for (const line of lines) {
    if (line.flat) {
      flat += line.rate;
      rackFlat += line.rackRate;
    } else {
      perPax += line.rate;
      rackPerPax += line.rackRate;
    }
  }
  return {
    lines,
    pax,
    perPax,
    flat,
    rackPerPax,
    rackFlat,
    rack: Math.round(rackPerPax * pax + rackFlat),
    proposed: Math.round(perPax * pax + flat),
    // The part the server adds on its own, from Banquet Setup.
    hall,
    picked,
  };
}

/** The ticked hall-charge venues that the function still holds. */
function tickedHallVenues(fn) {
  const held = heldVenues(fn);
  return (fn.hallChargeVenues || []).map(String).filter((id) => held.includes(id));
}

/** The offered rates as the API stores them: one entry per edited line. */
function lineRatesPayload(fn, catalog) {
  return priceFunction(fn, catalog)
    .lines.filter((line) => line.edited)
    .map((line) => ({ item: line.id, rate: line.rate }));
}

/**
 * Summary of what is selected for a function, one line per option with the
 * rate offered for this enquiry editable in place. The total formed from
 * these lines is the rate proposed.
 */
function FunctionSummary({ index, fn, catalog, venues, onChange }) {
  const { lines, pax, perPax, flat, rack, proposed } = priceFunction(fn, catalog, venues);
  const discount = rack - proposed;
  const anyEdited = lines.some((line) => line.edited);

  const setRate = (id, value) => {
    const digits = value.replace(/[^\d]/g, '');
    onChange(index, 'lineRates', { ...(fn.lineRates || {}), [id]: digits });
  };
  const resetAll = () => onChange(index, 'lineRates', {});

  if (!lines.length) {
    return (
      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="eyebrow">Summary</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a menu, add-ons or requirements and the selection is summarised here with its rates.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-muted/30">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div>
          <p className="eyebrow">Summary</p>
          <p className="text-xs text-muted-foreground">
            What is selected, with the rate offered for this enquiry. Edit any rate — the total formed
            is the rate proposed.
          </p>
        </div>
        {anyEdited ? (
          <button type="button" onClick={resetAll} className="text-[11px] font-medium text-primary hover:underline">
            Reset all to rack
          </button>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-1.5 font-medium">Item</th>
              <th className="px-3 py-1.5 font-medium">Basis</th>
              <th className="px-3 py-1.5 text-right font-medium">Rack</th>
              <th className="px-3 py-1.5 text-right font-medium">Rate offered</th>
              <th className="px-3 py-1.5 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-t border-border/60">
                <td className="px-3 py-1.5">
                  <span className="font-medium text-foreground">{line.name}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">{line.kind}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                  {line.flat ? 'Flat' : `Per guest × ${pax || 0}`}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                  {inr(line.rackRate)}
                </td>
                <td className="px-3 py-1.5 text-right">
                  {line.locked ? (
                    <span className="text-xs text-muted-foreground" title="Set in Banquet Setup">
                      Fixed
                    </span>
                  ) : (
                  <div className="flex items-center justify-end gap-1.5">
                    <Input
                      aria-label={`Rate offered for ${line.name}`}
                      inputMode="numeric"
                      value={line.edited ? fn.lineRates[line.id] : String(line.rackRate)}
                      onChange={(e) => setRate(line.id, e.target.value)}
                      className={`h-8 w-28 bg-background text-right tabular-nums ${line.edited ? 'border-primary' : ''}`}
                    />
                    {line.edited ? (
                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...(fn.lineRates || {}) };
                          delete next[line.id];
                          onChange(index, 'lineRates', next);
                        }}
                        className="text-[11px] font-medium text-primary hover:underline"
                        title="Back to the rack rate"
                      >
                        Reset
                      </button>
                    ) : null}
                  </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right font-medium tabular-nums text-foreground">
                  {inr(line.amount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-card/60">
              <td colSpan={4} className="px-3 py-1.5 text-right text-xs text-muted-foreground">
                {perPax ? `${inr(perPax)} per guest × ${pax || 0}` : ''}
                {perPax && flat ? ' + ' : ''}
                {flat ? `${inr(flat)} flat` : ''}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{inr(rack)} rack</td>
            </tr>
            <tr className="border-t bg-card">
              <td colSpan={4} className="px-3 py-2 text-right font-semibold text-foreground">
                Rate proposed
              </td>
              <td className="px-3 py-2 text-right text-lg font-semibold tabular-nums text-foreground">
                {inr(proposed)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
        {discount > 0
          ? `${inr(discount)} below rack`
          : discount < 0
            ? `${inr(-discount)} above rack`
            : 'Same as rack — edit a rate above to offer a different price'}
        {' · '}Banquet Setup rates are untouched; these apply to this enquiry only.
      </p>
    </div>
  );
}

/**
 * A tick per venue the function holds. Ticking applies that room's hall charge
 * from Banquet Setup; the amount itself cannot be changed here.
 */
function HallChargeTicks({ index, fn, venues, onChange }) {
  const held = heldVenues(fn)
    .map((id) => venues.find((v) => String(v._id) === id))
    .filter(Boolean);
  if (!held.length) return null;
  const ticked = new Set(tickedHallVenues(fn));
  const toggle = (id, on) => {
    const next = on ? [...ticked, id] : [...ticked].filter((v) => v !== id);
    onChange(index, 'hallChargeVenues', next);
  };
  return (
    <div className="space-y-2 sm:col-span-3">
      <Label>Hall charges</Label>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {held.map((v) => {
          const id = String(v._id);
          const charge = Number(v.hallCharge) || 0;
          const inputId = `fn-${index}-hall-${id}`;
          return (
            <label
              key={id}
              htmlFor={inputId}
              className={`flex items-center gap-2 text-sm ${charge ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
            >
              <input
                id={inputId}
                type="checkbox"
                checked={ticked.has(id)}
                disabled={!charge}
                onChange={(e) => toggle(id, e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span className="font-medium text-foreground">{v.name}</span>
              <span className="text-xs text-muted-foreground">
                {charge ? inr(charge) : 'no hall charge set'}
              </span>
            </label>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Tick a room to add its hall charge. Amounts are set per venue in Banquet Setup.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* One banquet function                                                        */
/* -------------------------------------------------------------------------- */

/** "Rs. 1,200/guest" or "Rs. 25,000 flat" for a priced option; '' if free. */
function rateHint(item) {
  if (!item?.rate) return '';
  return `${inr(item.rate)}${item.pricing === 'flat' ? ' flat' : '/guest'}`;
}

function withHints(list) {
  return (list || []).map((o) => ({ ...o, hint: rateHint(o) }));
}

/**
 * One function: a compact three-column grid. The venue is a single primary
 * pick with add-on rooms listed under it; anything else that can be several
 * things at once (sessions, add-ons, liquor, requirements) is a dropdown
 * checklist, so the card stays the same size however many options Banquet
 * Setup holds.
 */
function FunctionCard({
  index,
  fn,
  count,
  catalog,
  venues,
  sessions,
  todayStr,
  conflict,
  focused = false,
  onChange,
  onRemove,
}) {
  const slotsHeld = heldVenues(fn).length * (fn.sessions?.length || 0);
  const set = (field, value) => onChange(index, field, value);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Rooms not yet held by this function, offered to the next add-on row.
  const addOnRooms = fn.addOnRooms || [];
  const freeRooms = venues.filter((v) => !heldVenues(fn).includes(String(v._id)));

  function pickVenue(id) {
    // The primary cannot also be an add-on room.
    onChange(index, 'venue', id, { addOnRooms: addOnRooms.filter((room) => room !== id) });
  }
  function addRoom() {
    set('addOnRooms', [...addOnRooms, '']);
  }
  function setRoom(i, id) {
    set(
      'addOnRooms',
      addOnRooms.map((room, j) => (j === i ? id : room))
    );
  }
  function removeRoom(i) {
    set(
      'addOnRooms',
      addOnRooms.filter((_, j) => j !== i)
    );
  }

  return (
    // The id lets the panel scroll to the function it was opened on; that one is outlined.
    <div
      id={`enquiry-fn-${index}`}
      className={`scroll-mt-4 overflow-hidden rounded-xl border bg-card${focused ? ' ring-2 ring-primary/50' : ''}`}
    >
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2">
        <p className="text-sm font-semibold text-foreground">Function {index + 1}</p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCalendarOpen(true)}
            className="h-8"
          >
            <CalendarRange className="h-4 w-4" />
            Calendar
          </Button>
          {count > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRemove(index)}
              className="h-8 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-5 p-5">
        <AvailabilityNotice fn={fn} conflict={conflict} slotsHeld={slotsHeld} todayStr={todayStr} />

        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-3">
          {/* What and when */}
          <div className="space-y-1.5">
            <Label htmlFor={`fn-${index}-type`}>
              Function type
              <RequiredMark />
            </Label>
            <Select value={fn.functionType} onValueChange={(v) => set('functionType', v)}>
              <SelectTrigger id={`fn-${index}-type`}>
                <SelectValue placeholder="Pick a type" />
              </SelectTrigger>
              <SelectContent>
                {catalog.functionTypes.map((t) => (
                  <SelectItem key={t._id} value={String(t._id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`fn-${index}-date`}>
              Date
              <RequiredMark />
            </Label>
            <Input
              id={`fn-${index}-date`}
              type="date"
              min={todayStr}
              value={fn.date}
              onChange={(e) => set('date', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`fn-${index}-pax`}>Guests (pax)</Label>
            <Input
              id={`fn-${index}-pax`}
              inputMode="numeric"
              value={fn.pax}
              onChange={(e) => set('pax', e.target.value.replace(/[^\d]/g, ''))}
              placeholder="350"
            />
          </div>

          {/* Where */}
          <div className="space-y-1.5">
            <Label htmlFor={`fn-${index}-venue`}>
              Venue
              <RequiredMark />
            </Label>
            <Select value={fn.venue} onValueChange={pickVenue} disabled={venues.length === 0}>
              <SelectTrigger id={`fn-${index}-venue`}>
                <SelectValue placeholder={venues.length ? 'Pick the venue' : 'No venues configured'} />
              </SelectTrigger>
              <SelectContent>
                {venues.map((v) => (
                  <SelectItem key={v._id} value={String(v._id)}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`fn-${index}-sessions`}>
              Session
              <RequiredMark />
            </Label>
            <MultiSelect
              id={`fn-${index}-sessions`}
              options={sessions.map((sn) => ({
                ...sn,
                hint: sn.startTime ? `${sn.startTime}–${sn.endTime}` : '',
              }))}
              value={fn.sessions}
              onChange={(v) => set('sessions', v)}
              placeholder="Pick session(s)"
              emptyHint="No sessions configured"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`fn-${index}-menu`}>Menu type</Label>
            <Select value={fn.menuType} onValueChange={(v) => set('menuType', v)}>
              <SelectTrigger id={`fn-${index}-menu`}>
                <SelectValue placeholder="Pick a menu" />
              </SelectTrigger>
              <SelectContent>
                {catalog.menuTypes.map((m) => (
                  <SelectItem key={m._id} value={String(m._id)}>
                    {m.name}
                    {rateHint(m) ? ` — ${rateHint(m)}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Add-on rooms: extra venues held with the primary for the same sessions. */}
          <div className="space-y-2 sm:col-span-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Add-on rooms</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={addRoom}
                disabled={!fn.venue || freeRooms.length === 0 || addOnRooms.includes('')}
              >
                <Plus className="h-4 w-4" />
                Add-on room
              </Button>
            </div>
            {addOnRooms.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {fn.venue
                  ? 'None — held in the primary venue only.'
                  : 'Pick the venue first, then add any extra rooms held with it.'}
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-3">
                {addOnRooms.map((room, i) => (
                  <div key={`${i}-${room}`} className="flex items-center gap-1">
                    <Select value={room} onValueChange={(v) => setRoom(i, v)}>
                      <SelectTrigger aria-label={`Add-on room ${i + 1}`}>
                        <SelectValue placeholder="Pick a room" />
                      </SelectTrigger>
                      <SelectContent>
                        {venues
                          .filter((v) => {
                            const id = String(v._id);
                            return id === room || (id !== fn.venue && !addOnRooms.includes(id));
                          })
                          .map((v) => (
                            <SelectItem key={v._id} value={String(v._id)}>
                              {v.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRoom(i)}
                      aria-label={`Remove add-on room ${i + 1}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hall charges: one tick per held venue, at its Banquet Setup rate. */}
          <HallChargeTicks index={index} fn={fn} venues={venues} onChange={onChange} />

          {/* Extras */}
          <div className="space-y-1.5">
            <Label htmlFor={`fn-${index}-addons`}>Add-on menu</Label>
            <MultiSelect
              id={`fn-${index}-addons`}
              options={withHints(catalog.addOns)}
              value={fn.addOns}
              onChange={(v) => set('addOns', v)}
              placeholder="None"
              emptyHint="No add-ons configured"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`fn-${index}-liquor`}>Liquor</Label>
            <MultiSelect
              id={`fn-${index}-liquor`}
              options={withHints(catalog.liquorOptions)}
              value={fn.liquor}
              onChange={(v) => set('liquor', v)}
              placeholder="None"
              emptyHint="No liquor options configured"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`fn-${index}-reqs`}>Additional requirements</Label>
            <MultiSelect
              id={`fn-${index}-reqs`}
              options={withHints(catalog.requirements)}
              value={fn.requirements}
              onChange={(v) => set('requirements', v)}
              placeholder="None"
              emptyHint="No requirements configured"
            />
          </div>
        </div>

        {/* Summary of the selection; the rates offered form the rate proposed. */}
        <FunctionSummary index={index} fn={fn} catalog={catalog} venues={venues} onChange={onChange} />

        <div className="space-y-1.5">
          <Label htmlFor={`fn-${index}-extra`}>Anything else (not priced, printed as written)</Label>
          <Input
            id={`fn-${index}-extra`}
            value={fn.additionalRequirement}
            onChange={(e) => set('additionalRequirement', e.target.value)}
            placeholder="Special seating, timings, client notes…"
          />
        </div>
      </div>

      <AvailabilityDialog
        open={calendarOpen}
        onOpenChange={setCalendarOpen}
        fn={fn}
        venues={venues}
        sessions={sessions}
        todayStr={todayStr}
        onPickDate={(d) => set('date', d)}
      />
    </div>
  );
}

/** The availability verdict for one function, shown at the top of its card. */
function AvailabilityNotice({ fn, conflict, slotsHeld, todayStr }) {
  if (fn.date && fn.date < todayStr) {
    return (
      <p className="flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Pick a future date — enquiries cannot be created for past dates.
      </p>
    );
  }
  if (conflict?.duplicate) {
    return (
      <p className="flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Another function above already holds {conflict.duplicate}. Each slot can only be held once.
      </p>
    );
  }
  if (conflict?.taken?.length) {
    return (
      <div className="space-y-1 rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
        {conflict.taken.map((hold) => (
          <p
            key={`${hold.venueName}-${hold.sessionName}`}
            className="flex items-start gap-1.5 text-xs font-medium text-foreground"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            {hold.venueName} · {hold.sessionName} is held by {hold.leadName} ({hold.stage}). Saving puts
            this enquiry on the waitlist for the slot; pick another venue, session or date to avoid waiting.
          </p>
        ))}
      </div>
    );
  }
  if (slotsHeld > 0 && fn.date) {
    return (
      <p className="flex items-center gap-1.5 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs font-medium text-success">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        {slotsHeld === 1 ? 'Slot is available.' : `All ${slotsHeld} slots are available.`}
      </p>
    );
  }
  return null;
}

/**
 * The banquet calendar for the function's date, inside the form: every
 * venue's holds as bars, with this function's venue + session drawn as a
 * dashed "proposed" bar so a clash is obvious. Arrows move the date; picking
 * one writes it back to the function.
 */
function AvailabilityDialog({ open, onOpenChange, fn, venues, sessions, todayStr, onPickDate }) {
  const [date, setDate] = useState(fn.date || todayStr);
  const [holds, setHolds] = useState(null);

  useEffect(() => {
    if (open) setDate(fn.date || todayStr);
  }, [open, fn.date, todayStr]);

  useEffect(() => {
    if (!open || !date) return undefined;
    let alive = true;
    setHolds(null);
    api
      .get('/banquet/calendar', { params: { from: date, to: date } })
      .then((res) => {
        if (alive) setHolds(res?.data?.data?.functions || []);
      })
      .catch(() => {
        if (alive) setHolds([]);
      });
    return () => {
      alive = false;
    };
  }, [open, date]);

  const proposed = [];
  for (const venueId of heldVenues(fn)) {
    for (const sessionId of fn.sessions || []) proposed.push({ venueId, sessionId, label: 'This enquiry' });
  }

  function shiftDay(delta) {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + delta);
    setDate(format(d, 'yyyy-MM-dd'));
  }

  const pretty = date ? format(new Date(`${date}T12:00:00`), 'EEEE, d MMMM yyyy') : '';
  const differs = fn.date && date !== fn.date;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(96vw,80rem)] max-w-none overflow-y-auto sm:rounded-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-primary" />
            Banquet calendar
          </DialogTitle>
          <DialogDescription>
            Solid bars are existing holds; the dashed bar is this function. Move the date with the
            arrows, then use it for this function.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => shiftDay(-1)} aria-label="Previous day">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => shiftDay(1)} aria-label="Next day">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Input
            type="date"
            min={todayStr}
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="w-44"
            aria-label="Date"
          />
          <p className="text-sm font-semibold text-foreground">{pretty}</p>
          {differs ? (
            <Button
              size="sm"
              className="ml-auto"
              onClick={() => {
                onPickDate(date);
                onOpenChange(false);
              }}
            >
              Use this date
            </Button>
          ) : null}
        </div>

        {holds === null ? (
          <Skeleton className="h-72 w-full rounded-xl" />
        ) : (
          <DayTimeline
            date={new Date(`${date}T12:00:00`)}
            venues={venues}
            sessions={sessions}
            holds={holds}
            proposed={proposed}
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Dialog                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Create / edit an enquiry (banquet functions, rooms, or both).
 *
 * Every dropdown on a function — type, venue, add-on rooms, session, menu,
 * add-ons, liquor — is configured in Banquet Setup, so nothing here is free text. The
 * rack rate is calculated from the picked options and the guest count; the
 * proposed rate starts there and can be discounted. Dates must be today or
 * later, and a live availability check flags any date + venue + session
 * already held by another active enquiry — the same block the API enforces.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {object} props.lead
 * @param {object|null} [props.enquiry] existing enquiry to edit
 * @param {object} props.config banquet config (venues, sessions, catalog)
 * @param {(enquiry: object) => void} [props.onSaved]
 * @param {(lead: object) => void} [props.onLeadUpdated] a department was
 *   created inline — receives the refreshed lead
 * @param {number|null} [props.focusFunction] index of the function the panel
 *   was opened on (a function card was clicked); it is scrolled into view
 * @param {boolean} [props.readOnly] the enquiry is won, lost or cancelled:
 *   everything shows, nothing can be changed or saved
 */
function EnquiryDialog({ open, onOpenChange, lead, enquiry, config, onSaved, onLeadUpdated, focusFunction = null, readOnly = false }) {
  const isEdit = Boolean(enquiry?._id);
  const needsDepartment = !isIndividual(lead);
  const [isSaving, setIsSaving] = useState(false);
  const [conflicts, setConflicts] = useState({});
  const [form, setForm] = useState({
    department: '',
    kind: 'banquet',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    notes: '',
    billingName: '',
    gstNumber: '',
    panNumber: '',
    paymentTerms: '',
    functions: [emptyFunction()],
    room: emptyRoom(),
  });

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const hasBanquet = form.kind !== 'room';
  const hasRooms = form.kind !== 'banquet';

  const venues = useMemo(() => activeOnly(config?.venues), [config]);
  const sessions = useMemo(() => activeOnly(config?.sessions), [config]);

  // Everything the function form can pick, plus a lookup for pricing.
  const catalog = useMemo(() => {
    const functionTypes = activeOnly(config?.functionTypes);
    const menuTypes = activeOnly(config?.menuTypes);
    const addOns = activeOnly(config?.addOns);
    const liquorOptions = activeOnly(config?.liquorOptions);
    const requirements = activeOnly(config?.requirements);
    const byId = new Map();
    for (const item of [...menuTypes, ...addOns, ...liquorOptions, ...requirements]) {
      byId.set(String(item._id), item);
    }
    return { functionTypes, menuTypes, addOns, liquorOptions, requirements, byId };
  }, [config]);

  useEffect(() => {
    if (!open) return;
    setConflicts({});
    if (enquiry) {
      setForm({
        department: enquiry.department ? String(enquiry.department) : '',
        kind: enquiry.kind || 'banquet',
        contactName: enquiry.contactName || '',
        contactEmail: enquiry.contactEmail || '',
        contactPhone: enquiry.contactPhone || '',
        notes: enquiry.notes || '',
        billingName: enquiry.billingName || '',
        gstNumber: enquiry.gstNumber || '',
        panNumber: enquiry.panNumber || '',
        paymentTerms: enquiry.paymentTerms || '',
        functions: (enquiry.functions || []).length
          ? enquiry.functions.map((fn) => ({
              // Kept on save so the function stays the same one it was.
              _id: fn._id ? String(fn._id) : undefined,
              functionType: idOf(fn.functionType),
              date: toInputDate(fn.date),
              ...loadVenues(fn),
              hallChargeVenues: (fn.hallChargeVenues || []).map(idOf),
              // Enquiries saved before multi-select hold a single session.
              sessions: (fn.sessions?.length ? fn.sessions : [fn.session].filter(Boolean)).map(idOf),
              pax: fn.pax ? String(fn.pax) : '',
              menuType: idOf(fn.menuType),
              addOns: (fn.addOns || []).map(idOf),
              liquor: (fn.liquor || []).map(idOf),
              requirements: (fn.requirements || []).map(idOf),
              lineRates: loadLineRates(fn),
              additionalRequirement: fn.additionalRequirement || '',
            }))
          : [emptyFunction()],
        room: {
          checkIn: enquiry.room?.checkIn || '',
          checkOut: enquiry.room?.checkOut || '',
          rooms: enquiry.room?.rooms || '',
          notes: enquiry.room?.notes || '',
        },
      });
    } else {
      const only = (lead?.departments || []).length === 1 ? lead.departments[0] : null;
      setForm({
        department: only ? String(only._id) : '',
        kind: 'banquet',
        contactName: lead?.contactPerson || '',
        contactEmail: lead?.email || '',
        contactPhone: lead?.mobile || '',
        notes: '',
        billingName: lead?.businessName || '',
        gstNumber: '',
        panNumber: '',
        paymentTerms: '30% Now, Balance 60 Days',
        functions: [emptyFunction()],
        room: emptyRoom(),
      });
    }
    // Keyed on the lead id: a refreshed lead object (a department created
    // inline) must not wipe what has been typed so far.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, enquiry, lead?._id]);

  // Opened from a function card: bring that function into view once the panel has laid out.
  useEffect(() => {
    if (!open || focusFunction === null || focusFunction === undefined) return undefined;
    const timer = setTimeout(() => {
      document.getElementById(`enquiry-fn-${focusFunction}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 200);
    return () => clearTimeout(timer);
  }, [open, focusFunction]);

  // Live availability across every venue (primary + add-on rooms) x session a
  // function holds. A read-only panel changes nothing, so it checks nothing.
  useEffect(() => {
    if (!open || !hasBanquet || readOnly) {
      setConflicts({});
      return undefined;
    }
    const complete = form.functions
      .map((fn, index) => ({ ...fn, index, venues: heldVenues(fn) }))
      .filter((fn) => fn.date && fn.venues.length && fn.sessions?.length);
    if (complete.length === 0) {
      setConflicts({});
      return undefined;
    }
    let active = true;
    const timer = setTimeout(async () => {
      // Two rows of this form claiming the same slot conflict with each other.
      const localDups = {};
      const seen = new Map();
      for (const fn of complete) {
        for (const venue of fn.venues) {
          for (const session of fn.sessions) {
            const key = `${fn.date}|${venue}|${session}`;
            if (seen.has(key)) {
              const venueName = venues.find((v) => String(v._id) === String(venue))?.name || 'venue';
              const sessionName =
                sessions.find((s) => String(s._id) === String(session))?.name || 'session';
              localDups[fn.index] = { duplicate: `${venueName} · ${sessionName}` };
            } else {
              seen.set(key, fn.index);
            }
          }
        }
      }
      try {
        const dates = [...new Set(complete.map((fn) => fn.date))];
        const results = await Promise.all(
          dates.map((date) => api.get('/banquet/calendar', { params: { from: date, to: date } }))
        );
        if (!active) return;
        const holds = results.flatMap((res) => res?.data?.data?.functions || []);
        const next = { ...localDups };
        for (const fn of complete) {
          if (next[fn.index]) continue;
          const taken = [];
          for (const venue of fn.venues) {
            for (const session of fn.sessions) {
              // Waitlisted enquiries do not hold the slot.
              const hold = holds.find(
                (h) =>
                  h.stage !== 'waitlist' &&
                  toInputDate(h.date) === fn.date &&
                  String(h.venueId) === String(venue) &&
                  String(h.sessionId) === String(session) &&
                  (!isEdit || String(h.enquiryId) !== String(enquiry._id))
              );
              if (hold) {
                taken.push({
                  venueName: hold.venueName,
                  sessionName: hold.sessionName,
                  leadName: hold.leadName,
                  stage: stageInfo(hold.stage).label,
                });
              }
            }
          }
          if (taken.length) next[fn.index] = { taken };
        }
        setConflicts(next);
      } catch {
        if (active) setConflicts(localDups);
      }
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasBanquet, readOnly, form.functions, isEdit, enquiry?._id]);

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function setRoom(field, value) {
    setForm((f) => ({ ...f, room: { ...f.room, [field]: value } }));
  }

  function setFn(index, field, value, extra) {
    setForm((f) => ({
      ...f,
      functions: f.functions.map((fn, i) =>
        i === index ? { ...fn, [field]: value, ...(extra || {}) } : fn
      ),
    }));
  }

  function addFn() {
    setForm((f) => ({ ...f, functions: [...f.functions, emptyFunction()] }));
  }

  function removeFn(index) {
    setForm((f) => ({ ...f, functions: f.functions.filter((_, i) => i !== index) }));
  }

  // Only two rows of this form wanting the same slot block saving; a slot held
  // by another enquiry just puts this one on the waitlist.
  const hasConflicts = hasBanquet && Object.values(conflicts).some((c) => c.duplicate);
  const willWaitlist = hasBanquet && Object.values(conflicts).some((c) => c.taken?.length);

  // Running total of what is being offered, shown in the footer.
  const total = useMemo(() => {
    if (!hasBanquet) return 0;
    return form.functions.reduce((sum, fn) => sum + priceFunction(fn, catalog, venues).proposed, 0);
  }, [form.functions, catalog, venues, hasBanquet]);

  async function handleSave() {
    if (needsDepartment && !form.department) {
      return toast.error('Pick the branch / department this enquiry belongs to');
    }
    if (hasBanquet) {
      for (const [i, fn] of form.functions.entries()) {
        if (!fn.functionType) return toast.error(`Function ${i + 1}: pick the function type`);
        if (!fn.date) return toast.error(`Function ${i + 1}: pick a date`);
        if (fn.date < todayStr)
          return toast.error(`Function ${i + 1}: the date must be today or in the future`);
        if (!fn.venue) return toast.error(`Function ${i + 1}: pick the venue`);
        if (!fn.sessions.length) return toast.error(`Function ${i + 1}: pick at least one session`);
      }
      if (hasConflicts) {
        return toast.error('Two functions want the same slot — each slot can only be held once');
      }
    }
    if (hasRooms) {
      if (!form.room.checkIn) return toast.error('Rooms: pick the check-in date');
      if (!form.room.checkOut) return toast.error('Rooms: pick the check-out date');
      if (form.room.checkOut < form.room.checkIn)
        return toast.error('Rooms: check-out cannot be before check-in');
    }

    const payload = {
      contactName: form.contactName.trim(),
      contactEmail: form.contactEmail.trim(),
      contactPhone: form.contactPhone.trim(),
      notes: form.notes.trim(),
      billingName: form.billingName.trim(),
      gstNumber: form.gstNumber.trim(),
      panNumber: form.panNumber.trim(),
      paymentTerms: form.paymentTerms.trim(),
      functions: hasBanquet
        ? form.functions.map((fn) => {
            const { proposed, hall } = priceFunction(fn, catalog, venues);
            return {
              ...(fn._id ? { _id: fn._id } : {}),
              functionType: fn.functionType,
              date: fn.date,
              venue: fn.venue,
              // Blank rows (added but never picked) are dropped.
              addOnRooms: heldVenues(fn).slice(1),
              sessions: fn.sessions,
              pax: Number(fn.pax) || 0,
              menuType: fn.menuType || undefined,
              addOns: fn.addOns,
              liquor: fn.liquor,
              requirements: fn.requirements,
              lineRates: lineRatesPayload(fn, catalog),
              // The server adds the hall charges itself from Banquet Setup, so
              // they are left out here rather than counted twice.
              proposedRate: proposed - hall,
              hallChargeVenues: tickedHallVenues(fn),
              additionalRequirement: fn.additionalRequirement.trim(),
            };
          })
        : [],
    };
    if (hasRooms) {
      payload.room = {
        checkIn: form.room.checkIn,
        checkOut: form.room.checkOut,
        rooms: form.room.rooms.trim(),
        notes: form.room.notes.trim(),
      };
    }
    if (!isEdit) payload.kind = form.kind;
    if (needsDepartment) payload.department = form.department;

    setIsSaving(true);
    try {
      const res = isEdit
        ? await api.patch(`/enquiries/${enquiry._id}`, payload)
        : await api.post(`/leads/${lead._id}/enquiries`, payload);
      toast.success(isEdit ? 'Enquiry updated' : 'Enquiry created');
      onSaved?.(res?.data?.data?.enquiry);
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save enquiry'));
    } finally {
      setIsSaving(false);
    }
  }

  const missingSetup =
    hasBanquet &&
    (venues.length === 0 || sessions.length === 0 || catalog.functionTypes.length === 0);
  const roomsOrderError =
    hasRooms && form.room.checkIn && form.room.checkOut && form.room.checkOut < form.room.checkIn
      ? 'Check-out cannot be before check-in.'
      : '';

  return (
    <SidePanel open={open} onOpenChange={(next) => !isSaving && onOpenChange(next)}>
      {/* A long form: a stray press on the dimmed strip must not throw it away.
          Esc, the X and Cancel still close it. */}
      <SidePanelContent onPointerDownOutside={(e) => e.preventDefault()}>
        <SidePanelHeader>
          <SidePanelTitle>{readOnly ? 'Enquiry details' : isEdit ? 'Edit enquiry' : 'New enquiry'}</SidePanelTitle>
          <SidePanelDescription>
            Each function holds its venue, any add-on rooms and its sessions on the banquet calendar.
            The rack rate is worked out from the menu, add-ons and guest count; the rates you offer
            form the proposed rate.
          </SidePanelDescription>
        </SidePanelHeader>

        <SidePanelBody>
        {missingSetup ? (
          <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            {venues.length === 0 ? 'No venues configured. ' : ''}
            {sessions.length === 0 ? 'No sessions configured. ' : ''}
            {catalog.functionTypes.length === 0 ? 'No function types configured. ' : ''}
            An admin can add them under Banquet Setup.
          </p>
        ) : null}

        {readOnly ? (
          <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            This enquiry is {stageInfo(enquiry?.stage).label.toLowerCase()}, so its details are locked. Everything is
            shown here for reference.
          </p>
        ) : null}

        {/* A disabled fieldset locks every input, select and button inside it in one go. */}
        <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-5 border-0 p-0">
          {/* Who */}
          <section className="space-y-3">
            <SectionHeading
              icon={UserRound}
              title="Enquiry"
              description="Where it sits and who the hotel deals with."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {needsDepartment ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="enq-dept">
                    Branch / department
                    <RequiredMark />
                  </Label>
                  <DepartmentSelect
                    id="enq-dept"
                    lead={lead}
                    value={form.department}
                    onChange={(v) => setField('department', v)}
                    onLeadUpdated={onLeadUpdated}
                  />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="enq-kind">Enquiry for</Label>
                <Select
                  value={form.kind}
                  onValueChange={(v) => setField('kind', v)}
                  disabled={isEdit}
                >
                  <SelectTrigger id="enq-kind">
                    <SelectValue placeholder="Enquiry type" />
                  </SelectTrigger>
                  <SelectContent>
                    {KIND_OPTIONS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enq-contact">Contact person</Label>
                <Input
                  id="enq-contact"
                  value={form.contactName}
                  onChange={(e) => setField('contactName', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enq-email">Contact email</Label>
                <Input
                  id="enq-email"
                  type="email"
                  inputMode="email"
                  value={form.contactEmail}
                  onChange={(e) => setField('contactEmail', e.target.value)}
                  placeholder="Proposal and signing code go here"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enq-phone">Contact phone</Label>
                <Input
                  id="enq-phone"
                  type="tel"
                  inputMode="tel"
                  value={form.contactPhone}
                  onChange={(e) => setField('contactPhone', e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* Billing instruction — printed on the proposal */}
          <section className="space-y-3">
            <SectionHeading
              icon={IndianRupee}
              title="Billing instruction"
              description="Printed on the proposal under Billing Instruction."
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="enq-billing">Billing name</Label>
                <Input
                  id="enq-billing"
                  value={form.billingName}
                  onChange={(e) => setField('billingName', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enq-gst">GST</Label>
                <Input id="enq-gst" value={form.gstNumber} onChange={(e) => setField('gstNumber', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enq-pan">PAN</Label>
                <Input id="enq-pan" value={form.panNumber} onChange={(e) => setField('panNumber', e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
                <Label htmlFor="enq-terms">Payment terms</Label>
                <Input
                  id="enq-terms"
                  value={form.paymentTerms}
                  onChange={(e) => setField('paymentTerms', e.target.value)}
                  placeholder="30% Now, Balance 60 Days"
                />
              </div>
            </div>
          </section>

          {/* Functions */}
          {hasBanquet ? (
            <section className="space-y-3">
              <SectionHeading
                icon={CalendarDays}
                title="Functions"
                description="One card per function. Options come from Banquet Setup."
                action={
                  <Button type="button" variant="outline" size="sm" onClick={addFn}>
                    <Plus className="h-4 w-4" />
                    Add function
                  </Button>
                }
              />
              {form.functions.map((fn, index) => (
                <FunctionCard
                  key={index}
                  index={index}
                  fn={fn}
                  count={form.functions.length}
                  catalog={catalog}
                  venues={venues}
                  sessions={sessions}
                  todayStr={todayStr}
                  conflict={conflicts[index]}
                  focused={focusFunction === index}
                  onChange={setFn}
                  onRemove={removeFn}
                />
              ))}
            </section>
          ) : null}

          {/* Rooms */}
          {hasRooms ? (
            <section className="space-y-3">
              <SectionHeading
                icon={BedDouble}
                title="Room details"
                description="The stay this enquiry covers."
              />
              <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="enq-checkin">
                    Check-in
                    <RequiredMark />
                  </Label>
                  <Input
                    id="enq-checkin"
                    type="date"
                    min={todayStr}
                    value={form.room.checkIn}
                    onChange={(e) => setRoom('checkIn', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="enq-checkout">
                    Check-out
                    <RequiredMark />
                  </Label>
                  <Input
                    id="enq-checkout"
                    type="date"
                    min={form.room.checkIn || todayStr}
                    value={form.room.checkOut}
                    onChange={(e) => setRoom('checkOut', e.target.value)}
                    aria-invalid={Boolean(roomsOrderError)}
                  />
                  {roomsOrderError ? (
                    <p role="alert" className="text-xs text-destructive">
                      {roomsOrderError}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="enq-rooms">No. of rooms</Label>
                  <Input
                    id="enq-rooms"
                    inputMode="numeric"
                    value={form.room.rooms}
                    onChange={(e) => setRoom('rooms', e.target.value)}
                    placeholder="10"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-3">
                  <Label htmlFor="enq-room-notes">Room notes</Label>
                  <Input
                    id="enq-room-notes"
                    value={form.room.notes}
                    onChange={(e) => setRoom('notes', e.target.value)}
                    placeholder="Room category, meal plan, special requests…"
                  />
                </div>
              </div>
            </section>
          ) : null}

          {/* Notes */}
          <section className="space-y-3">
            <SectionHeading
              icon={IndianRupee}
              title="Summary"
              description="The total is the sum of the proposed rates and goes on the proposal."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border bg-card p-3">
                <p className="eyebrow">Estimated amount</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {inr(total)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {form.functions.length} function{form.functions.length > 1 ? 's' : ''}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enq-notes">Notes</Label>
                <Textarea
                  id="enq-notes"
                  rows={4}
                  value={form.notes}
                  onChange={(e) => setField('notes', e.target.value)}
                  placeholder="Anything the team should know about this enquiry"
                />
              </div>
            </div>
          </section>
        </fieldset>
        </SidePanelBody>

        <SidePanelFooter className="sm:items-center sm:justify-between">
          {readOnly ? (
            <span className="hidden sm:block" />
          ) : hasConflicts ? (
            <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              Two functions want the same slot — fix that to save.
            </p>
          ) : willWaitlist ? (
            <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
              A slot is held by another enquiry — this one will go on the waitlist.
            </p>
          ) : (
            <span className="hidden sm:block" />
          )}
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              {readOnly ? 'Close' : 'Cancel'}
            </Button>
            {readOnly ? null : (
              <Button onClick={handleSave} disabled={isSaving || missingSetup || hasConflicts}>
                {isSaving ? <Spinner size="sm" className="text-current" /> : null}
                {isEdit ? 'Save changes' : 'Create enquiry'}
              </Button>
            )}
          </div>
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

export { EnquiryDialog };
export default EnquiryDialog;
