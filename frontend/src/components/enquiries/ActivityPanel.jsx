import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowUpRight, CalendarClock, Check, ChevronRight, ChevronUp, CircleCheck, CircleDashed, ListChecks, Mail, MapPin, Megaphone, NotebookPen, Pencil, Phone, Plus, Save, StickyNote, Trash2, X } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const VISIT_ACTION_OPTIONS = [
  'No action',
  'Send proposal',
  'Send rates',
  'Send agreement',
  'Schedule meeting',
  'Follow up call',
  'Collect signed confirmation',
];

/** Coerce a populated ref (object) or raw id to a comparable id string. */
function refId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value._id ? String(value._id) : null;
}

/** Display name from a populated user ref, with a fallback. */
function refName(value, fallback = 'Unknown') {
  if (value && typeof value === 'object' && value.name) return value.name;
  return fallback;
}

/* -------------------------------------------------------------------------- */
/** Each record panel that opens from the At-a-glance list. */
const RECORD_PANELS = {
  'follow-ups': {
    title: 'Follow-ups',
    icon: CalendarClock,
    description:
      'Everything scheduled for this record. Close a follow-up with a note once it is done.',
  },
  visits: {
    title: 'Visit Reports',
    icon: NotebookPen,
    description: 'What happened on each visit, and the action agreed afterwards.',
  },
  'action-points': {
    title: 'Action Points',
    icon: ListChecks,
    description: 'Concrete to-dos for this record. Clear them as they are done.',
  },
  instructions: {
    title: 'Instructions',
    icon: Megaphone,
    description: 'Directives from an admin to the executive who owns this record.',
  },
  notes: {
    title: 'Internal Notes',
    icon: StickyNote,
    description: 'Internal only, never shared with the client.',
  },
};

/**
 * Right-rail summary: who to call, what is due, and the whole activity record
 * (visits, follow-ups, action points, instructions, notes) as one-line rows.
 * Each row opens its full section in a dialog, so the page itself stays short.
 */
export default function ActivityPanel({ record, apiBase, mutate, isAdmin, isAssignedExec, myId, title = 'At a glance' }) {
  const [panel, setPanel] = useState(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const openFollowUps = (record.followUps || [])
    .filter((f) => f.status === 'open')
    .sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
  const next = openFollowUps.find((f) => f.dueDate);
  const nextDue = next ? new Date(next.dueDate) : null;
  const overdue = nextDue && nextDue < today;
  const dueToday = nextDue && !overdue && nextDue - today < 24 * 60 * 60 * 1000;

  const visits = [...(record.visitReports || [])].sort(
    (a, b) => new Date(b.visitDate || 0) - new Date(a.visitDate || 0)
  );
  const lastVisit = visits[0];
  const actionPoints = record.actionPoints || [];
  const openActions = actionPoints.filter((a) => !a.cleared).length;
  const instructions = record.instructions || [];
  const openInstructions = instructions.filter((i) => i.status === 'open').length;
  const notes = [...(record.notes || [])].sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  );

  const rows = [
    {
      key: 'follow-ups',
      label: 'Follow-ups',
      icon: CalendarClock,
      count: openFollowUps.length,
      tone: overdue ? 'destructive' : dueToday ? 'warning' : 'default',
      meta: next
        ? `Next ${formatDate(next.dueDate)}${overdue ? ' - overdue' : dueToday ? ' - today' : ''}`
        : openFollowUps.length
          ? `${openFollowUps.length} open, no date set`
          : 'Nothing scheduled',
    },
    {
      key: 'visits',
      label: 'Visit reports',
      icon: NotebookPen,
      count: visits.length,
      meta: lastVisit ? `Last visit ${formatDate(lastVisit.visitDate)}` : 'No visits recorded',
    },
    {
      key: 'action-points',
      label: 'Action points',
      icon: ListChecks,
      count: openActions,
      tone: openActions ? 'warning' : 'default',
      meta: actionPoints.length
        ? `${actionPoints.length - openActions} of ${actionPoints.length} cleared`
        : 'None added',
    },
    isAdmin || instructions.length
      ? {
          key: 'instructions',
          label: 'Instructions',
          icon: Megaphone,
          count: openInstructions,
          tone: openInstructions ? 'info' : 'default',
          meta: instructions.length ? `${instructions.length} issued in total` : 'None issued',
        }
      : null,
    {
      key: 'notes',
      label: 'Internal notes',
      icon: StickyNote,
      count: notes.length,
      meta: notes[0] ? `Last note ${formatRelative(notes[0].createdAt)}` : 'No notes yet',
    },
  ].filter(Boolean);

  const toneClass = {
    destructive: 'text-destructive bg-destructive/10',
    warning: 'text-warning bg-warning/10',
    info: 'text-info bg-info/10',
    default: 'text-muted-foreground bg-muted',
  };

  const cfg = panel ? RECORD_PANELS[panel] : null;
  const PanelIcon = cfg?.icon;

  function panelBody() {
    switch (panel) {
      case 'visits':
        return <VisitReportsTab record={record} apiBase={apiBase} mutate={mutate} />;
      case 'action-points':
        return <ActionPointsTab record={record} apiBase={apiBase} mutate={mutate} />;
      case 'follow-ups':
        return <FollowUpsTab record={record} apiBase={apiBase} mutate={mutate} />;
      case 'instructions':
        return (
          <InstructionsTab
            record={record} apiBase={apiBase}
            isAdmin={isAdmin}
            isAssignedExec={isAssignedExec}
            mutate={mutate}
          />
        );
      case 'notes':
        return <NotesTab record={record} apiBase={apiBase} myId={myId} isAdmin={isAdmin} mutate={mutate} />;
      default:
        return null;
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{title}</CardTitle>
          <CardDescription>Open any record to read it or add to it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {/* Next follow-up gets the loudest treatment - it is the next move. */}
          <div
            className={cn(
              'rounded-lg border p-3',
              overdue
                ? 'border-destructive/40 bg-destructive/10'
                : dueToday
                  ? 'border-warning/40 bg-warning/10'
                  : 'bg-muted/40'
            )}
          >
            <p className="eyebrow">Next follow-up</p>
            {next ? (
              <>
                <p
                  className={cn(
                    'mt-1 font-semibold tabular-nums',
                    overdue ? 'text-destructive' : dueToday ? 'text-warning' : 'text-foreground'
                  )}
                >
                  {formatDate(next.dueDate)}
                  {overdue ? ' - Overdue' : dueToday ? ' - Today' : ''}
                </p>
                {next.note ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{next.note}</p>
                ) : null}
              </>
            ) : (
              <p className="mt-1 text-muted-foreground">Nothing scheduled</p>
            )}
            <button
              type="button"
              onClick={() => setPanel('follow-ups')}
              className="mt-2 inline-flex min-h-6 items-center gap-1 rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {next ? 'Open follow-ups' : 'Schedule one'}
              <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>

          {/* The full activity record - one row each, opens in a dialog. */}
          <ul className="-mx-1 space-y-0.5">
            {rows.map((row) => {
              const Icon = row.icon;
              return (
                <li key={row.key}>
                  <button
                    type="button"
                    onClick={() => setPanel(row.key)}
                    className="flex min-h-[3rem] w-full items-center gap-3 rounded-lg px-1.5 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                        toneClass[row.tone || 'default']
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium text-foreground">{row.label}</span>
                        {row.count ? (
                          <span className="rounded-full bg-primary/15 px-1.5 text-[11px] font-semibold tabular-nums text-primary">
                            {row.count}
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{row.meta}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="space-y-2 border-t pt-3">
            {record.mobile ? (
              <a
                href={`tel:${record.mobile}`}
                className="flex items-center gap-2 text-foreground hover:text-primary"
              >
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="tabular-nums">{record.mobile}</span>
              </a>
            ) : null}
            {record.email ? (
              <a
                href={`mailto:${record.email}`}
                className="flex items-center gap-2 truncate text-foreground hover:text-primary"
              >
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{record.email}</span>
              </a>
            ) : null}
            {record.city ? (
              <p className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {record.city}
              </p>
            ) : null}
            {!record.mobile && !record.email ? (
              <p className="text-xs text-muted-foreground">No contact details yet.</p>
            ) : null}
          </div>

          <div className="border-t pt-3 text-xs text-muted-foreground">
            <p>
              Assigned to{' '}
              <span className="font-medium text-foreground">
                {refName(record.assignedTo, 'Unassigned')}
              </span>
            </p>
            <p className="mt-0.5">Updated {formatRelative(record.updatedAt)}</p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(panel)} onOpenChange={(open) => !open && setPanel(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {PanelIcon ? <PanelIcon className="h-4 w-4 text-primary" aria-hidden="true" /> : null}
              {cfg?.title}
            </DialogTitle>
            <DialogDescription>{cfg?.description}</DialogDescription>
          </DialogHeader>
          {panelBody()}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Inline "add" form for a section. Collapsed to a single button by default
 * so the page reads as a record, not a wall of empty forms; opens on demand
 * and folds away again once a submit finishes.
 */
function SectionAdd({ onSubmit, children, submitLabel = 'Add', disabled, openLabel }) {
  const [open, setOpen] = useState(false);
  const wasBusy = useRef(false);

  useEffect(() => {
    if (wasBusy.current && !disabled) setOpen(false);
    wasBusy.current = Boolean(disabled);
  }, [disabled]);

  if (!open) {
    return (
      <div className="mb-4">
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          {openLabel || submitLabel}
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(e);
      }}
      className="mb-4 space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4 animate-slide-in"
    >
      {children}
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={disabled}>
          <ChevronUp className="h-4 w-4" />
          Close
        </Button>
        <Button type="submit" size="sm" disabled={disabled}>
          {disabled ? (
            <Spinner size="sm" className="text-current" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function NotesTab({ record, apiBase, myId, isAdmin, mutate }) {
  const [body, setBody] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const notes = useMemo(
    () =>
      [...(record.notes || [])].sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
      ),
    [record.notes]
  );

  async function handleAdd() {
    const trimmed = body.trim();
    if (!trimmed) {
      toast.error('Note cannot be empty');
      return;
    }
    setAdding(true);
    try {
      await mutate(
        api.post(`${apiBase}/notes`, { body: trimmed }),
        'Note added'
      );
      setBody('');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to add note'));
    } finally {
      setAdding(false);
    }
  }

  function startEdit(note) {
    setEditingId(String(note._id));
    setEditBody(note.body);
  }

  async function handleSaveEdit(noteId) {
    const trimmed = editBody.trim();
    if (!trimmed) {
      toast.error('Note cannot be empty');
      return;
    }
    setSavingEdit(true);
    try {
      await mutate(
        api.patch(`${apiBase}/notes/${noteId}`, { body: trimmed }),
        'Note updated'
      );
      setEditingId(null);
      setEditBody('');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update note'));
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(noteId) {
    setDeletingId(noteId);
    try {
      await mutate(
        api.delete(`${apiBase}/notes/${noteId}`),
        'Note deleted'
      );
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete note'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <SectionAdd onSubmit={handleAdd} submitLabel="Add note" disabled={adding}>
        <div className="space-y-2">
          <Label htmlFor="new-note">Add a note</Label>
          <Textarea
            id="new-note"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a note about this record…"
            rows={3}
          />
        </div>
      </SectionAdd>

      {notes.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title="No notes yet"
          description="Capture call summaries, requirements and context here."
        />
      ) : (
        <div className="space-y-3">
          {notes.map((note) => {
            const noteId = String(note._id);
            const canEdit = isAdmin || String(refId(note.author)) === String(myId);
            const isEditing = editingId === noteId;
            return (
              <Card key={noteId}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {note.authorName || refName(note.author)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(note.createdAt)}
                        {note.updatedAt &&
                        note.updatedAt !== note.createdAt ? (
                          <span> · edited</span>
                        ) : null}
                      </p>
                    </div>
                    {canEdit && !isEditing ? (
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => startEdit(note)}
                          aria-label="Edit note"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(noteId)}
                          disabled={deletingId === noteId}
                          aria-label="Delete note"
                        >
                          {deletingId === noteId ? (
                            <Spinner size="sm" className="text-current" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {isEditing ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        rows={3}
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingId(null);
                            setEditBody('');
                          }}
                          disabled={savingEdit}
                        >
                          <X className="h-4 w-4" />
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSaveEdit(noteId)}
                          disabled={savingEdit}
                        >
                          {savingEdit ? (
                            <Spinner size="sm" className="text-current" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm text-foreground">
                      {note.body}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Action points                                                               */
/* -------------------------------------------------------------------------- */

function ActionPointsTab({ record, apiBase, mutate }) {
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const [clearingId, setClearingId] = useState(null);

  const points = useMemo(
    () =>
      [...(record.actionPoints || [])].sort(
        (a, b) =>
          Number(a.cleared) - Number(b.cleared) ||
          new Date(b.createdAt || 0).getTime() -
            new Date(a.createdAt || 0).getTime()
      ),
    [record.actionPoints]
  );
  const openCount = (record.actionPoints || []).filter((a) => !a.cleared).length;

  async function handleAdd() {
    const trimmed = text.trim();
    if (!trimmed) {
      toast.error('Action point cannot be empty');
      return;
    }
    setAdding(true);
    try {
      await mutate(
        api.post(`${apiBase}/action-points`, { text: trimmed }),
        'Action point added'
      );
      setText('');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to add action point'));
    } finally {
      setAdding(false);
    }
  }

  async function handleClear(apId) {
    setClearingId(apId);
    try {
      await mutate(
        api.post(`${apiBase}/action-points/${apId}/clear`),
        'Action point cleared'
      );
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to clear action point'));
    } finally {
      setClearingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <SectionAdd onSubmit={handleAdd} submitLabel="Add action point" disabled={adding}>
        <div className="space-y-2">
          <Label htmlFor="new-ap">New action point</Label>
          <Input
            id="new-ap"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Send product brochure by Friday"
          />
        </div>
      </SectionAdd>

      {points.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No action points"
          description="Track concrete to-dos for this record and clear them as you go."
        />
      ) : (
        <div className="space-y-2">
          {openCount > 0 ? null : (
            <p className="text-xs text-muted-foreground">All action points cleared.</p>
          )}
          {points.map((ap) => {
            const apId = String(ap._id);
            return (
              <div
                key={apId}
                className={
                  'flex items-start gap-3 rounded-lg border p-3 ' +
                  (ap.cleared ? 'bg-muted/40' : 'bg-card')
                }
              >
                <div className="mt-0.5">
                  {ap.cleared ? (
                    <CircleCheck className="h-5 w-5 text-[hsl(var(--status-won))]" />
                  ) : (
                    <CircleDashed className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      'text-sm ' +
                      (ap.cleared
                        ? 'text-muted-foreground line-through'
                        : 'text-foreground')
                    }
                  >
                    {ap.text}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Added by {ap.createdByName || '—'} ·{' '}
                    {formatDate(ap.createdAt)}
                    {ap.cleared
                      ? ` · cleared ${formatRelative(ap.clearedAt)}`
                      : ''}
                  </p>
                </div>
                {!ap.cleared ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleClear(apId)}
                    disabled={clearingId === apId}
                  >
                    {clearingId === apId ? (
                      <Spinner size="sm" className="text-current" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Clear
                  </Button>
                ) : (
                  <Badge variant="secondary">Cleared</Badge>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Follow-ups                                                                   */
/* -------------------------------------------------------------------------- */

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function FollowUpsTab({ record, apiBase, mutate }) {
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);

  // Close dialog state.
  const [closeTarget, setCloseTarget] = useState(null);
  const [closingNote, setClosingNote] = useState('');
  const [closing, setClosing] = useState(false);

  const followUps = useMemo(
    () =>
      [...(record.followUps || [])].sort((a, b) => {
        // Open first, then by due date ascending.
        const openDiff =
          (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1);
        if (openDiff !== 0) return openDiff;
        return (
          new Date(a.dueDate || 0).getTime() -
          new Date(b.dueDate || 0).getTime()
        );
      }),
    [record.followUps]
  );

  async function handleAdd() {
    if (!dueDate) {
      toast.error('Pick a due date');
      return;
    }
    setAdding(true);
    try {
      await mutate(
        api.post(`${apiBase}/follow-ups`, {
          dueDate,
          note: note.trim() || undefined,
        }),
        'Follow-up scheduled'
      );
      setDueDate('');
      setNote('');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to schedule follow-up'));
    } finally {
      setAdding(false);
    }
  }

  function startClose(fu) {
    setCloseTarget(fu);
    setClosingNote('');
  }

  async function handleClose() {
    const trimmed = closingNote.trim();
    if (!trimmed) {
      toast.error('A closing note is required');
      return;
    }
    setClosing(true);
    try {
      await mutate(
        api.post(
          `${apiBase}/follow-ups/${closeTarget._id}/close`,
          { closingNote: trimmed }
        ),
        'Follow-up closed'
      );
      setCloseTarget(null);
      setClosingNote('');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to close follow-up'));
    } finally {
      setClosing(false);
    }
  }

  function isOverdue(fu) {
    return (
      fu.status === 'open' &&
      fu.dueDate &&
      new Date(fu.dueDate).getTime() < new Date().setHours(0, 0, 0, 0)
    );
  }

  return (
    <div className="space-y-4">
      <SectionAdd onSubmit={handleAdd} submitLabel="Schedule follow-up" disabled={adding}>
        <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
          <div className="space-y-2">
            <Label htmlFor="fu-date">Due date</Label>
            <Input
              id="fu-date"
              type="date"
              value={dueDate}
              min={todayISO()}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fu-note">Note (optional)</Label>
            <Input
              id="fu-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Call to confirm proposal"
            />
          </div>
        </div>
      </SectionAdd>

      {followUps.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No follow-ups"
          description="Schedule a due date so this record never slips through the cracks."
        />
      ) : (
        <div className="space-y-2">
          {followUps.map((fu) => {
            const fuId = String(fu._id);
            const overdue = isOverdue(fu);
            return (
              <div
                key={fuId}
                className={
                  'rounded-lg border p-3 ' +
                  (fu.status === 'closed' ? 'bg-muted/40' : 'bg-card')
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {formatDate(fu.dueDate)}
                      </span>
                      {fu.status === 'open' ? (
                        overdue ? (
                          <Badge variant="destructive">Overdue</Badge>
                        ) : (
                          <Badge variant="accent">Open</Badge>
                        )
                      ) : (
                        <Badge variant="secondary">Closed</Badge>
                      )}
                    </div>
                    {fu.note ? (
                      <p className="text-sm text-foreground">{fu.note}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      Scheduled by {fu.createdByName || '—'} ·{' '}
                      {formatDate(fu.createdAt)}
                    </p>
                    {fu.status === 'closed' ? (
                      <div className="mt-2 rounded-md border-l-2 border-[hsl(var(--status-won))] bg-muted/50 px-3 py-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          Closing note · {formatDate(fu.closedAt)}
                        </p>
                        <p className="text-sm text-foreground">
                          {fu.closingNote}
                        </p>
                      </div>
                    ) : null}
                  </div>
                  {fu.status === 'open' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startClose(fu)}
                    >
                      <Check className="h-4 w-4" />
                      Close
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={!!closeTarget}
        onOpenChange={(next) => {
          if (!closing && !next) {
            setCloseTarget(null);
            setClosingNote('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close follow-up</DialogTitle>
            <DialogDescription>
              {closeTarget
                ? `Due ${formatDate(closeTarget.dueDate)}. A closing note is required.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="closing-note">Closing note</Label>
            <Textarea
              id="closing-note"
              value={closingNote}
              onChange={(e) => setClosingNote(e.target.value)}
              placeholder="What was the outcome of this follow-up?"
              rows={3}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCloseTarget(null);
                setClosingNote('');
              }}
              disabled={closing}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleClose} disabled={closing}>
              {closing ? <Spinner size="sm" className="text-current" /> : null}
              Close follow-up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Visit reports                                                                */
/* -------------------------------------------------------------------------- */

function VisitReportsTab({ record, apiBase, mutate }) {
  const [visitDate, setVisitDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNote, setFollowUpNote] = useState('');
  const [actionPoint, setActionPoint] = useState('No action');
  const [adding, setAdding] = useState(false);

  const reports = useMemo(
    () =>
      [...(record.visitReports || [])].sort(
        (a, b) =>
          new Date(b.visitDate || 0).getTime() -
          new Date(a.visitDate || 0).getTime()
      ),
    [record.visitReports]
  );

  async function handleAdd() {
    if (!visitDate) {
      toast.error('Pick a visit date');
      return;
    }
    if (!note.trim()) {
      toast.error('Describe what happened in the visit');
      return;
    }
    setAdding(true);
    try {
      await mutate(
        api.post(`${apiBase}/visit-reports`, {
          visitDate,
          note: note.trim(),
          followUpDate: followUpDate || undefined,
          followUpNote: followUpNote.trim() || undefined,
          actionPoint,
        }),
        'Visit report added'
      );
      setVisitDate(todayISO());
      setNote('');
      setFollowUpDate('');
      setFollowUpNote('');
      setActionPoint('No action');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to add visit report'));
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionAdd onSubmit={handleAdd} submitLabel="Add visit report" disabled={adding}>
        <div className="space-y-2">
          <Label htmlFor="vr-date">Visit date</Label>
          <Input
            id="vr-date"
            type="date"
            value={visitDate}
            max={todayISO()}
            onChange={(e) => setVisitDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vr-note">Visit note</Label>
          <Textarea
            id="vr-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What happened in the meeting?..."
            rows={3}
          />
        </div>
        <div className="space-y-3 rounded-md border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">
            Based on this visit — schedule the next follow-up and set the action
            point (both optional).
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="vr-fu-date">Next follow-up date</Label>
              <Input
                id="vr-fu-date"
                type="date"
                value={followUpDate}
                min={todayISO()}
                onChange={(e) => setFollowUpDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vr-fu-note">Follow-up note</Label>
              <Input
                id="vr-fu-note"
                value={followUpNote}
                onChange={(e) => setFollowUpNote(e.target.value)}
                placeholder="Why follow up?..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vr-action">Action point</Label>
              <Select value={actionPoint} onValueChange={setActionPoint}>
                <SelectTrigger id="vr-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISIT_ACTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </SectionAdd>

      {reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">No visits recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {reports.map((vr) => (
            <div key={String(vr._id)} className="rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  {formatDate(vr.visitDate)}
                </span>
                {vr.actionPoint && vr.actionPoint !== 'No action' ? (
                  <Badge variant="accent">{vr.actionPoint}</Badge>
                ) : null}
                {vr.followUpDate ? (
                  <Badge variant="secondary">
                    Next follow-up {formatDate(vr.followUpDate)}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                {vr.note}
              </p>
              {vr.followUpNote ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Follow-up: {vr.followUpNote}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">
                Recorded by {vr.createdByName || '—'} · {formatDate(vr.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Instructions                                                                 */
/* -------------------------------------------------------------------------- */

function InstructionsTab({ record, apiBase, isAdmin, isAssignedExec, mutate }) {
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const [doneId, setDoneId] = useState(null);

  const instructions = useMemo(
    () =>
      [...(record.instructions || [])].sort(
        (a, b) =>
          (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) ||
          new Date(b.createdAt || 0).getTime() -
            new Date(a.createdAt || 0).getTime()
      ),
    [record.instructions]
  );

  async function handleAdd() {
    const trimmed = text.trim();
    if (!trimmed) {
      toast.error('Instruction cannot be empty');
      return;
    }
    setAdding(true);
    try {
      await mutate(
        api.post(`${apiBase}/instructions`, { text: trimmed }),
        'Instruction issued'
      );
      setText('');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to issue instruction'));
    } finally {
      setAdding(false);
    }
  }

  async function handleDone(insId) {
    setDoneId(insId);
    try {
      await mutate(
        api.post(`${apiBase}/instructions/${insId}/done`),
        'Instruction marked done'
      );
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to complete instruction'));
    } finally {
      setDoneId(null);
    }
  }

  return (
    <div className="space-y-4">
      {isAdmin ? (
        <SectionAdd onSubmit={handleAdd} submitLabel="Issue instruction" disabled={adding}>
          <div className="space-y-2">
            <Label htmlFor="new-ins">New instruction</Label>
            <Textarea
              id="new-ins"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Directive for the assigned executive…"
              rows={2}
            />
          </div>
        </SectionAdd>
      ) : (
        <p className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Instructions are issued by admins. Mark them done once completed.
        </p>
      )}

      {instructions.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No instructions"
          description="Admin directives for this record will appear here."
        />
      ) : (
        <div className="space-y-2">
          {instructions.map((ins) => {
            const insId = String(ins._id);
            const isDone = ins.status === 'done';
            const canComplete = !isDone && (isAdmin || isAssignedExec);
            return (
              <div
                key={insId}
                className={
                  'flex items-start gap-3 rounded-lg border p-3 ' +
                  (isDone ? 'bg-muted/40' : 'bg-card')
                }
              >
                <div className="mt-0.5">
                  {isDone ? (
                    <CircleCheck className="h-5 w-5 text-[hsl(var(--status-won))]" />
                  ) : (
                    <Megaphone className="h-5 w-5 text-[hsl(var(--status-proposal))]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      'text-sm ' +
                      (isDone
                        ? 'text-muted-foreground line-through'
                        : 'text-foreground')
                    }
                  >
                    {ins.text}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Issued by {ins.issuedByName || '—'} ·{' '}
                    {formatDate(ins.createdAt)}
                    {isDone ? ` · done ${formatRelative(ins.doneAt)}` : ''}
                  </p>
                </div>
                {canComplete ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDone(insId)}
                    disabled={doneId === insId}
                  >
                    {doneId === insId ? (
                      <Spinner size="sm" className="text-current" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Mark done
                  </Button>
                ) : isDone ? (
                  <Badge variant="secondary">Done</Badge>
                ) : (
                  <Badge variant="accent">Open</Badge>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

