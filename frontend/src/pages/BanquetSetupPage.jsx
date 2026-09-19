import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Landmark,
  Plus,
  Clock3,
  Trash2,
  Pencil,
  Check,
  X,
  Sparkles,
  PartyPopper,
  UtensilsCrossed,
  Wine,
  ClipboardList,
} from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import ConfirmDialog from '@/components/ConfirmDialog';
import CatalogSection from '@/components/banquet/CatalogSection';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const SLOT_RULES = {
  'multi-hold': {
    label: 'Multiple holds',
    summary: 'Soft holds share a slot; only a Won booking sends newcomers to the waitlist.',
  },
  exclusive: {
    label: 'Exclusive',
    summary: 'One enquiry per date + venue + session; others wait in the Waitlist until it frees.',
  },
};

/** Active / inactive pill that toggles on click. State is spelled out in text. */
function ActiveToggle({ active, pending, onToggle, itemName }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      aria-pressed={active}
      aria-label={`${itemName}: ${active ? 'active. Click to deactivate' : 'inactive. Click to activate'}`}
      title={active ? 'Click to deactivate' : 'Click to activate'}
      className={cn(
        'inline-flex h-10 min-w-[6.5rem] cursor-pointer items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-[background-color,border-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60',
        active
          ? 'border-success/30 bg-success/10 text-success hover:bg-success/15'
          : 'border-transparent bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground'
      )}
    >
      {pending ? (
        <Spinner size="sm" className="h-3.5 w-3.5 text-current" />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'h-2 w-2 rounded-full',
            active ? 'bg-success' : 'bg-muted-foreground/50'
          )}
        />
      )}
      {active ? 'Active' : 'Inactive'}
    </button>
  );
}

function SectionSkeleton({ rows = 3, wide = false }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={cn('grid gap-3', wide ? 'sm:grid-cols-[1fr_8rem_8rem_auto]' : 'sm:grid-cols-[1fr_auto]')}>
          <Skeleton className="h-10 w-full" />
          {wide ? (
            <>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </>
          ) : null}
          <Skeleton className="h-10 w-full sm:w-24" />
        </div>
        <div className="divide-y rounded-lg border">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <Skeleton className="h-4 w-1/3" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-24 rounded-full" />
                <Skeleton className="h-9 w-9 rounded-md" />
                <Skeleton className="h-9 w-9 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Admin configuration for the banquet calendar: venues, sessions and the
 * slot rule. Everything here is user-configurable by design.
 */
/** A typed rupee amount as a whole number; blank or junk counts as no charge. */
function toCharge(value) {
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

export default function BanquetSetupPage() {
  const [config, setConfig] = useState(null);
  const [newVenue, setNewVenue] = useState('');
  const [newVenueCharge, setNewVenueCharge] = useState('');
  const [newSession, setNewSession] = useState({ name: '', startTime: '', endTime: '' });
  const [deleting, setDeleting] = useState(null); // { type: 'venue'|'session', item }
  const [isSavingRule, setIsSavingRule] = useState(false);

  // UX-only state: pending flags and inline-edit drafts.
  const [isAddingVenue, setIsAddingVenue] = useState(false);
  const [isAddingSession, setIsAddingSession] = useState(false);
  const [pendingId, setPendingId] = useState(null);
  const [editing, setEditing] = useState(null); // { type, id, draft }
  const [venueError, setVenueError] = useState('');
  const [sessionError, setSessionError] = useState('');

  const venueInputRef = useRef(null);
  const sessionInputRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/banquet/config');
      setConfig(res?.data?.data || null);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load banquet setup'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addVenue() {
    if (!newVenue.trim()) {
      setVenueError('Enter the venue name');
      venueInputRef.current?.focus();
      return toast.error('Enter the venue name');
    }
    setVenueError('');
    setIsAddingVenue(true);
    try {
      await api.post('/banquet/venues', { name: newVenue.trim(), hallCharge: toCharge(newVenueCharge) });
      toast.success('Venue added');
      setNewVenue('');
      setNewVenueCharge('');
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to add venue'));
    } finally {
      setIsAddingVenue(false);
    }
  }

  async function toggleVenue(venue) {
    setPendingId(venue._id);
    try {
      await api.patch(`/banquet/venues/${venue._id}`, { active: !venue.active });
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update venue'));
    } finally {
      setPendingId(null);
    }
  }

  async function addSession() {
    if (!newSession.name.trim()) {
      setSessionError('Enter the session name');
      sessionInputRef.current?.focus();
      return toast.error('Enter the session name');
    }
    setSessionError('');
    setIsAddingSession(true);
    try {
      await api.post('/banquet/sessions', {
        name: newSession.name.trim(),
        startTime: newSession.startTime.trim(),
        endTime: newSession.endTime.trim(),
      });
      toast.success('Session added');
      setNewSession({ name: '', startTime: '', endTime: '' });
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to add session'));
    } finally {
      setIsAddingSession(false);
    }
  }

  async function toggleSession(session) {
    setPendingId(session._id);
    try {
      await api.patch(`/banquet/sessions/${session._id}`, { active: !session.active });
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update session'));
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete() {
    const { type, item } = deleting;
    await api.delete(`/banquet/${type === 'venue' ? 'venues' : 'sessions'}/${item._id}`);
    toast.success(`${type === 'venue' ? 'Venue' : 'Session'} deleted`);
    setDeleting(null);
    load();
  }

  async function changeSlotRule(slotRule) {
    setIsSavingRule(true);
    try {
      await api.put('/banquet/settings', { slotRule });
      toast.success('Slot rule updated');
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update slot rule'));
    } finally {
      setIsSavingRule(false);
    }
  }

  /* ---------- Inline edit (same PATCH endpoints as the toggles) ---------- */

  function startEdit(type, item) {
    setEditing({
      type,
      id: item._id,
      draft:
        type === 'venue'
          ? { name: item.name || '', hallCharge: item.hallCharge ? String(item.hallCharge) : '' }
          : {
              name: item.name || '',
              startTime: item.startTime || '',
              endTime: item.endTime || '',
            },
    });
  }

  function cancelEdit() {
    setEditing(null);
  }

  async function saveEdit() {
    if (!editing) return;
    const { type, id, draft } = editing;
    if (!draft.name.trim()) {
      return toast.error(`Enter the ${type} name`);
    }
    setPendingId(id);
    try {
      if (type === 'venue') {
        await api.patch(`/banquet/venues/${id}`, { name: draft.name.trim(), hallCharge: toCharge(draft.hallCharge) });
      } else {
        await api.patch(`/banquet/sessions/${id}`, {
          name: draft.name.trim(),
          startTime: draft.startTime.trim(),
          endTime: draft.endTime.trim(),
        });
      }
      toast.success(`${type === 'venue' ? 'Venue' : 'Session'} updated`);
      setEditing(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, `Failed to update ${type}`));
    } finally {
      setPendingId(null);
    }
  }

  function onEditKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  }

  if (!config) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <PageHeader
          title="Banquet setup"
          description="Venues, sessions and the slot rule used by enquiries and the banquet calendar."
        />
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-10 w-full max-w-md" />
          </CardContent>
        </Card>
        <SectionSkeleton rows={3} />
        <SectionSkeleton rows={2} wide />
      </div>
    );
  }

  const slotRule = config.settings?.slotRule || 'multi-hold';
  const venues = config.venues || [];
  const sessions = config.sessions || [];

  const venueEditing = (v) => editing?.type === 'venue' && editing.id === v._id;
  const sessionEditing = (s) => editing?.type === 'session' && editing.id === s._id;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Banquet setup"
        description="Venues, sessions and the slot rule used by enquiries and the banquet calendar."
      />

      {/* Slot rule */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <CardTitle>Slot rule</CardTitle>
              <CardDescription>
                How the calendar treats two enquiries wanting the same date, venue and session.
                The later one goes on the waitlist and drops back automatically when the slot frees.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="slot-rule">Rule</Label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={slotRule} onValueChange={changeSlotRule} disabled={isSavingRule}>
              <SelectTrigger id="slot-rule" className="w-full sm:max-w-md" aria-busy={isSavingRule}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="multi-hold">
                  Multiple holds — soft holds share a slot, only Won waitlists others
                </SelectItem>
                <SelectItem value="exclusive">
                  Exclusive — one enquiry per slot, others wait in the Waitlist
                </SelectItem>
              </SelectContent>
            </Select>
            {isSavingRule ? (
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner size="sm" />
                Saving…
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Currently <span className="font-medium text-foreground">{SLOT_RULES[slotRule]?.label}</span>
            {' — '}
            {SLOT_RULES[slotRule]?.summary}
          </p>
        </CardContent>
      </Card>

      {/* Venues */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Landmark className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <CardTitle>Venues</CardTitle>
              <CardDescription>
                Banquet halls, lawns and rooms that can be booked. Inactive venues stay on past
                enquiries but are hidden from new ones.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addVenue();
            }}
            className="space-y-2"
            noValidate
          >
            <p className="eyebrow">Add a venue</p>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="new-venue">Venue name</Label>
                <Input
                  id="new-venue"
                  ref={venueInputRef}
                  value={newVenue}
                  onChange={(e) => {
                    setNewVenue(e.target.value);
                    if (venueError) setVenueError('');
                  }}
                  placeholder="Grand Ballroom, Terrace Lawn…"
                  autoComplete="off"
                  aria-invalid={!!venueError}
                  aria-describedby={venueError ? 'new-venue-error' : undefined}
                  disabled={isAddingVenue}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-venue-charge">Hall charge (Rs.)</Label>
                <Input
                  id="new-venue-charge"
                  inputMode="decimal"
                  value={newVenueCharge}
                  onChange={(e) => setNewVenueCharge(e.target.value)}
                  placeholder="0"
                  autoComplete="off"
                  disabled={isAddingVenue}
                />
              </div>
              <Button type="submit" disabled={isAddingVenue} className="w-full sm:w-auto">
                {isAddingVenue ? (
                  <Spinner size="sm" className="text-current" />
                ) : (
                  <Plus className="h-4 w-4" aria-hidden="true" />
                )}
                Add venue
              </Button>
            </div>
            {venueError ? (
              <p id="new-venue-error" role="alert" className="text-xs text-destructive">
                {venueError}
              </p>
            ) : null}
          </form>

          {venues.length === 0 ? (
            <EmptyState
              size="compact"
              icon={Landmark}
              title="No venues yet"
              description="Add your banquet halls and lawns so they can be picked on enquiries and the calendar."
              action={
                <Button variant="outline" onClick={() => venueInputRef.current?.focus()}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add your first venue
                </Button>
              }
            />
          ) : (
            <ul className="divide-y rounded-lg border" aria-label="Venues">
              {venues.map((venue) => {
                const active = venue.active !== false;
                const isEditing = venueEditing(venue);
                const pending = pendingId === venue._id;
                return (
                  <li
                    key={venue._id}
                    className={cn(
                      'flex flex-col gap-3 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between',
                      !active && !isEditing && 'bg-muted/30'
                    )}
                  >
                    {isEditing ? (
                      <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
                        <div className="space-y-1">
                          <Label htmlFor={`venue-edit-${venue._id}`} className="text-xs text-muted-foreground">
                            Venue name
                          </Label>
                          <Input
                            id={`venue-edit-${venue._id}`}
                            autoFocus
                            value={editing.draft.name}
                            onChange={(e) =>
                              setEditing((s) => ({ ...s, draft: { ...s.draft, name: e.target.value } }))
                            }
                            onKeyDown={onEditKeyDown}
                            disabled={pending}
                            autoComplete="off"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`venue-charge-${venue._id}`} className="text-xs text-muted-foreground">
                            Hall charge (Rs.)
                          </Label>
                          <Input
                            id={`venue-charge-${venue._id}`}
                            inputMode="decimal"
                            value={editing.draft.hallCharge}
                            onChange={(e) =>
                              setEditing((s) => ({ ...s, draft: { ...s.draft, hallCharge: e.target.value } }))
                            }
                            onKeyDown={onEditKeyDown}
                            disabled={pending}
                            placeholder="0"
                            autoComplete="off"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            'truncate text-sm font-medium',
                            active ? 'text-foreground' : 'text-muted-foreground'
                          )}
                        >
                          {venue.name}
                        </span>
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {Number(venue.hallCharge) > 0
                            ? `Hall charge Rs. ${Number(venue.hallCharge).toLocaleString('en-IN')}`
                            : 'No hall charge'}
                        </span>
                        {!active ? (
                          <span className="text-xs text-muted-foreground">(hidden from new enquiries)</span>
                        ) : null}
                      </div>
                    )}

                    <div className="flex flex-shrink-0 items-center gap-1.5 self-end sm:self-auto">
                      {isEditing ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={cancelEdit}
                            disabled={pending}
                            aria-label="Cancel editing"
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-10"
                            onClick={saveEdit}
                            disabled={pending}
                          >
                            {pending ? (
                              <Spinner size="sm" className="text-current" />
                            ) : (
                              <Check className="h-4 w-4" aria-hidden="true" />
                            )}
                            Save
                          </Button>
                        </>
                      ) : (
                        <>
                          <ActiveToggle
                            active={active}
                            pending={pending}
                            onToggle={() => toggleVenue(venue)}
                            itemName={venue.name}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => startEdit('venue', venue)}
                            disabled={pending || Boolean(editing)}
                            aria-label={`Edit ${venue.name}`}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleting({ type: 'venue', item: venue })}
                            disabled={pending}
                            aria-label={`Delete ${venue.name}`}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Sessions */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Clock3 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <CardTitle>Sessions</CardTitle>
              <CardDescription>
                Time blocks a venue can be booked for on a day — for example Morning, Evening or
                Full day. Times are optional and shown for reference only.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addSession();
            }}
            className="space-y-2"
            noValidate
          >
            <p className="eyebrow">Add a session</p>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="new-session-name">Session name</Label>
                <Input
                  id="new-session-name"
                  ref={sessionInputRef}
                  value={newSession.name}
                  onChange={(e) => {
                    setNewSession((s) => ({ ...s, name: e.target.value }));
                    if (sessionError) setSessionError('');
                  }}
                  placeholder="Morning, Evening…"
                  autoComplete="off"
                  aria-invalid={!!sessionError}
                  aria-describedby={sessionError ? 'new-session-error' : undefined}
                  disabled={isAddingSession}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-session-start">
                  Start <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="new-session-start"
                  value={newSession.startTime}
                  onChange={(e) => setNewSession((s) => ({ ...s, startTime: e.target.value }))}
                  placeholder="10:00 AM"
                  autoComplete="off"
                  disabled={isAddingSession}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-session-end">
                  End <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="new-session-end"
                  value={newSession.endTime}
                  onChange={(e) => setNewSession((s) => ({ ...s, endTime: e.target.value }))}
                  placeholder="4:00 PM"
                  autoComplete="off"
                  disabled={isAddingSession}
                />
              </div>
              <Button type="submit" disabled={isAddingSession} className="w-full sm:w-auto">
                {isAddingSession ? (
                  <Spinner size="sm" className="text-current" />
                ) : (
                  <Plus className="h-4 w-4" aria-hidden="true" />
                )}
                Add session
              </Button>
            </div>
            {sessionError ? (
              <p id="new-session-error" role="alert" className="text-xs text-destructive">
                {sessionError}
              </p>
            ) : null}
          </form>

          {sessions.length === 0 ? (
            <EmptyState
              size="compact"
              icon={Clock3}
              title="No sessions yet"
              description="Add sessions such as Morning and Evening so each venue can be booked more than once a day."
              action={
                <Button variant="outline" onClick={() => sessionInputRef.current?.focus()}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add your first session
                </Button>
              }
            />
          ) : (
            <ul className="divide-y rounded-lg border" aria-label="Sessions">
              {sessions.map((session) => {
                const active = session.active !== false;
                const isEditing = sessionEditing(session);
                const pending = pendingId === session._id;
                return (
                  <li
                    key={session._id}
                    className={cn(
                      'flex flex-col gap-3 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between',
                      !active && !isEditing && 'bg-muted/30'
                    )}
                  >
                    {isEditing ? (
                      <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_7rem]">
                        <div className="space-y-1">
                          <Label htmlFor={`session-edit-name-${session._id}`} className="sr-only">
                            Session name
                          </Label>
                          <Input
                            id={`session-edit-name-${session._id}`}
                            autoFocus
                            value={editing.draft.name}
                            onChange={(e) =>
                              setEditing((s) => ({ ...s, draft: { ...s.draft, name: e.target.value } }))
                            }
                            onKeyDown={onEditKeyDown}
                            placeholder="Session name"
                            disabled={pending}
                            autoComplete="off"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`session-edit-start-${session._id}`} className="sr-only">
                            Start time
                          </Label>
                          <Input
                            id={`session-edit-start-${session._id}`}
                            value={editing.draft.startTime}
                            onChange={(e) =>
                              setEditing((s) => ({
                                ...s,
                                draft: { ...s.draft, startTime: e.target.value },
                              }))
                            }
                            onKeyDown={onEditKeyDown}
                            placeholder="Start"
                            disabled={pending}
                            autoComplete="off"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`session-edit-end-${session._id}`} className="sr-only">
                            End time
                          </Label>
                          <Input
                            id={`session-edit-end-${session._id}`}
                            value={editing.draft.endTime}
                            onChange={(e) =>
                              setEditing((s) => ({
                                ...s,
                                draft: { ...s.draft, endTime: e.target.value },
                              }))
                            }
                            onKeyDown={onEditKeyDown}
                            placeholder="End"
                            disabled={pending}
                            autoComplete="off"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span
                          className={cn(
                            'truncate text-sm font-medium',
                            active ? 'text-foreground' : 'text-muted-foreground'
                          )}
                        >
                          {session.name}
                        </span>
                        {session.startTime || session.endTime ? (
                          <span className="text-xs text-muted-foreground tabular">
                            {session.startTime} – {session.endTime}
                          </span>
                        ) : null}
                        {!active ? (
                          <span className="text-xs text-muted-foreground">(hidden from new enquiries)</span>
                        ) : null}
                      </div>
                    )}

                    <div className="flex flex-shrink-0 items-center gap-1.5 self-end sm:self-auto">
                      {isEditing ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={cancelEdit}
                            disabled={pending}
                            aria-label="Cancel editing"
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-10"
                            onClick={saveEdit}
                            disabled={pending}
                          >
                            {pending ? (
                              <Spinner size="sm" className="text-current" />
                            ) : (
                              <Check className="h-4 w-4" aria-hidden="true" />
                            )}
                            Save
                          </Button>
                        </>
                      ) : (
                        <>
                          <ActiveToggle
                            active={active}
                            pending={pending}
                            onToggle={() => toggleSession(session)}
                            itemName={session.name}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => startEdit('session', session)}
                            disabled={pending || Boolean(editing)}
                            aria-label={`Edit ${session.name}`}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleting({ type: 'session', item: session })}
                            disabled={pending}
                            aria-label={`Delete ${session.name}`}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* The four dropdowns on the banquet function form. Rates set here
          drive the automatic rack-rate calculation on an enquiry. */}
      <CatalogSection
        kind="functionType"
        icon={PartyPopper}
        title="Function types"
        description="What the event is: wedding, conference, birthday. No rate attached."
        items={config.functionTypes || []}
        onChanged={load}
        placeholder="e.g. Wedding reception"
      />

      <CatalogSection
        kind="menuType"
        icon={UtensilsCrossed}
        title="Menu types"
        description="The base menu and its rate. Picked once per function."
        items={config.menuTypes || []}
        onChanged={load}
        withRate
        placeholder="e.g. Silver veg buffet"
      />

      <CatalogSection
        kind="addOn"
        icon={Plus}
        title="Add-on menus"
        description="Extras that add to the rate: live counters, welcome drinks, desserts."
        items={config.addOns || []}
        onChanged={load}
        withRate
        placeholder="e.g. Live chaat counter"
      />

      <CatalogSection
        kind="requirement"
        icon={ClipboardList}
        title="Additional requirements"
        description="Stage, décor, AV, DJ — ticked on a function and added to the rate."
        items={config.requirements || []}
        onChanged={load}
        withRate
        placeholder="e.g. LED wall"
      />

      <CatalogSection
        kind="liquor"
        icon={Wine}
        title="Liquor options"
        description="Bar packages and corkage. Ticked on a function when the client wants them."
        items={config.liquorOptions || []}
        onChanged={load}
        withRate
        placeholder="e.g. IMFL package"
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={handleDelete}
        title={`Delete this ${deleting?.type}?`}
        description={
          deleting
            ? `"${deleting.item?.name}" will be removed permanently. This is only possible when no enquiry uses it — otherwise deactivate it instead.`
            : 'Only possible when no enquiry uses it — otherwise deactivate it instead.'
        }
        confirmText="Delete"
        variant="destructive"
      />
    </div>
  );
}
