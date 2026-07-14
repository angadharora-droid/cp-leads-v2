import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  UserCog,
  ChevronDown,
  Plus,
  Check,
  X,
  StickyNote,
  ListChecks,
  CalendarClock,
  Megaphone,
  History as HistoryIcon,
  CircleCheck,
  CircleDashed,
  Mail,
  Phone,
  MapPin,
  Building2,
  Save,
  Package,
  FileText,
} from 'lucide-react';

import api, { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format';

import { PageHeader } from '@/components/PageHeader';
import { StatusBadge, LEAD_STATUSES } from '@/components/StatusBadge';
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
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
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
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Read the populated lead out of an API response envelope. */
function pickLead(res) {
  return res?.data?.data?.lead ?? null;
}

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
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function LeadDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [lead, setLead] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const myId = user?.id || user?._id || null;
  const assignedId = lead ? refId(lead.assignedTo) : null;
  const isAssignedExec = !!myId && !!assignedId && String(myId) === String(assignedId);
  const canDelete = isAdmin || (lead && String(refId(lead.createdBy)) === String(myId));

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setIsLoading(true);
      try {
        const res = await api.get(`/leads/${id}`);
        const next = pickLead(res);
        if (!next) throw new Error('Lead not found');
        setLead(next);
        setLoadError(null);
        return next;
      } catch (err) {
        if (!silent) setLoadError(getErrorMessage(err, 'Failed to load lead'));
        throw err;
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  /**
   * Run a mutation, then update the lead from the returned envelope (the API
   * returns the fully-populated lead on every mutation). Shows a toast.
   */
  const mutate = useCallback(async (promise, successMessage) => {
    const res = await promise;
    const next = pickLead(res);
    if (next) setLead(next);
    if (successMessage) toast.success(successMessage);
    return next;
  }, []);

  /* ----------------------------- Loading state ---------------------------- */

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-8 w-64" />
        </div>
        <Skeleton className="h-10 w-full max-w-md" />
        <Card>
          <CardContent className="space-y-3 p-6">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/3" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadError || !lead) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Lead"
          actions={
            <Button variant="outline" asChild>
              <Link to="/leads">
                <ArrowLeft className="h-4 w-4" />
                Back to leads
              </Link>
            </Button>
          }
        />
        <EmptyState
          icon={Building2}
          title="Lead not found"
          description={loadError || 'This lead does not exist or you do not have access to it.'}
          action={
            <Button onClick={() => load().catch(() => {})}>Try again</Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DetailHeader
        lead={lead}
        isAdmin={isAdmin}
        canDelete={canDelete}
        navigate={navigate}
        mutate={mutate}
        reload={() => load({ silent: true })}
      />

      {/* Everything on one page — overview first, then the activity sections. */}
      <OverviewTab lead={lead} />

      <KitsSection lead={lead} />

      <SectionCard
        icon={ListChecks}
        title="Action Points"
        count={(lead.actionPoints || []).filter((a) => !a.cleared).length}
      >
        <ActionPointsTab lead={lead} mutate={mutate} />
      </SectionCard>

      <SectionCard
        icon={CalendarClock}
        title="Follow-ups"
        count={(lead.followUps || []).filter((f) => f.status === 'open').length}
      >
        <FollowUpsTab lead={lead} mutate={mutate} />
      </SectionCard>

      {isAdmin || (lead.instructions || []).length > 0 ? (
        <SectionCard
          icon={Megaphone}
          title="Instructions"
          count={(lead.instructions || []).filter((i) => i.status === 'open').length}
        >
          <InstructionsTab
            lead={lead}
            isAdmin={isAdmin}
            isAssignedExec={isAssignedExec}
            mutate={mutate}
          />
        </SectionCard>
      ) : null}

      <SectionCard
        icon={StickyNote}
        title="Internal Notes"
        count={lead.notes?.length}
      >
        <NotesTab lead={lead} myId={myId} isAdmin={isAdmin} mutate={mutate} />
      </SectionCard>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Small shared bits                                                           */
/* -------------------------------------------------------------------------- */

function Count({ value }) {
  if (!value) return null;
  return (
    <span className="ml-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary/15 px-1.5 text-[11px] font-semibold text-primary">
      {value}
    </span>
  );
}

/** A titled card wrapping one detail section (notes, follow-ups, …). */
function SectionCard({ icon: Icon, title, count, children }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {Icon ? <Icon className="h-4 w-4 text-muted-foreground" /> : null}
          <span>{title}</span>
          <Count value={count} />
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function SectionAdd({ onSubmit, children, submitLabel = 'Add', disabled }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(e);
      }}
      className="space-y-3 rounded-lg border bg-muted/30 p-4"
    >
      {children}
      <div className="flex justify-end">
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

/* -------------------------------------------------------------------------- */
/* Header (title, status, edit/assign/delete/quick-status)                     */
/* -------------------------------------------------------------------------- */

function DetailHeader({ lead, isAdmin, canDelete, navigate, mutate, reload }) {
  const [statusBusy, setStatusBusy] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyCount = (lead.history || []).length;

  async function handleQuickStatus(status) {
    if (status === lead.status) return;
    setStatusBusy(true);
    try {
      await mutate(
        api.patch(`/leads/${lead._id}`, { status }),
        `Status changed to ${status}`
      );
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to change status'));
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleDelete() {
    try {
      await api.delete(`/leads/${lead._id}`);
      toast.success('Lead deleted');
      navigate('/leads');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete lead'));
      throw err; // keep dialog open on failure
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/leads')}
            aria-label="Back to leads"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Link
            to="/leads"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Leads
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium text-foreground">
            {lead.reference}
          </span>
        </div>

        <PageHeader
          title={
            <span className="flex flex-wrap items-center gap-3">
              {lead.businessName}
              <StatusBadge status={lead.status} />
            </span>
          }
          description={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono text-xs">{lead.reference}</span>
              <span aria-hidden>·</span>
              <span>
                Assigned to{' '}
                <span className="font-medium text-foreground">
                  {refName(lead.assignedTo, 'Unassigned')}
                </span>
              </span>
              <span aria-hidden>·</span>
              <span>Created {formatRelative(lead.createdAt)}</span>
            </span>
          }
          actions={
            <>
              {/* Quick status change (everyone with access can update status) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={statusBusy}>
                    {statusBusy ? (
                      <Spinner size="sm" className="text-current" />
                    ) : null}
                    Status
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Change status</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {LEAD_STATUSES.map((s) => (
                    <DropdownMenuItem
                      key={s}
                      onSelect={() => handleQuickStatus(s)}
                      disabled={s === lead.status}
                    >
                      {s === lead.status ? (
                        <Check className="h-4 w-4 text-primary" />
                      ) : (
                        <span className="h-4 w-4" />
                      )}
                      {s}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setHistoryOpen(true)}
              >
                <HistoryIcon className="h-4 w-4" />
                History
                {historyCount > 0 ? (
                  <span className="ml-1 rounded-full bg-muted px-1.5 text-xs font-semibold">
                    {historyCount}
                  </span>
                ) : null}
              </Button>

              <Button variant="outline" size="sm" asChild>
                <Link to={`/leads/${lead._id}/edit`}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Link>
              </Button>

              {isAdmin ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAssignOpen(true)}
                >
                  <UserCog className="h-4 w-4" />
                  Assign
                </Button>
              ) : null}

              {canDelete ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              ) : null}
            </>
          }
        />
      </div>

      {isAdmin ? (
        <AssignDialog
          open={assignOpen}
          onOpenChange={setAssignOpen}
          lead={lead}
          mutate={mutate}
        />
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={handleDelete}
        title="Delete this lead?"
        description={`Lead ${lead.reference} (${lead.businessName}) and all its notes, follow-ups and history will be permanently removed.`}
        confirmText="Delete lead"
        variant="destructive"
      />

      <HistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        lead={lead}
      />
    </>
  );
}

function AssignDialog({ open, onOpenChange, lead, mutate }) {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selected, setSelected] = useState(refId(lead.assignedTo) || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(refId(lead.assignedTo) || '');
    let active = true;
    setLoadingUsers(true);
    api
      .get('/users', { params: { isActive: true } })
      .then((res) => {
        if (active) setUsers(res?.data?.data?.users ?? []);
      })
      .catch((err) => {
        toast.error(getErrorMessage(err, 'Failed to load users'));
      })
      .finally(() => {
        if (active) setLoadingUsers(false);
      });
    return () => {
      active = false;
    };
  }, [open, lead.assignedTo]);

  async function handleAssign() {
    if (!selected) {
      toast.error('Select a user to assign');
      return;
    }
    if (selected === refId(lead.assignedTo)) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      await mutate(
        api.patch(`/leads/${lead._id}/assign`, { assignedTo: selected }),
        'Lead reassigned'
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to assign lead'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign lead</DialogTitle>
          <DialogDescription>
            Reassign {lead.reference} to another team member.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Assign to</Label>
          <Select
            value={selected}
            onValueChange={setSelected}
            disabled={loadingUsers || saving}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={loadingUsers ? 'Loading…' : 'Select a user'}
              />
            </SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u._id} value={u._id}>
                  {u.name} · {u.role === 'admin' ? 'Admin' : 'Sales Exec'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleAssign} disabled={saving || loadingUsers}>
            {saving ? <Spinner size="sm" className="text-current" /> : null}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Overview                                                                    */
/* -------------------------------------------------------------------------- */

function Field({ label, value, mono, icon: Icon }) {
  const empty = value == null || value === '';
  return (
    <div className="space-y-1">
      <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {label}
      </dt>
      <dd
        className={
          'text-sm ' +
          (empty
            ? 'text-muted-foreground/60'
            : 'text-foreground ' + (mono ? 'font-mono' : ''))
        }
      >
        {empty ? '—' : value}
      </dd>
    </div>
  );
}

function OverviewTab({ lead }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Business &amp; Contact</CardTitle>
          <CardDescription>Client-provided details</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <Field label="Business name" value={lead.businessName} icon={Building2} />
            <Field label="Business type" value={lead.businessType} />
            <Field label="Contacted for" value={lead.contactedFor} />
            <Field label="Contact person" value={lead.contactPerson} />
            <Field label="Designation" value={lead.designation} />
            <Field label="Mobile" value={lead.mobile} icon={Phone} />
            <Field label="Email" value={lead.email} icon={Mail} />
            <Field label="City" value={lead.city} icon={MapPin} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CRM &amp; Pipeline</CardTitle>
          <CardDescription>Tracking &amp; ownership</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <Field label="Reference" value={lead.reference} mono />
            <div className="space-y-1">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Status
              </dt>
              <dd>
                <StatusBadge status={lead.status} />
              </dd>
            </div>
            <Field label="Lead date" value={formatDate(lead.leadDate)} />
            <Field
              label="Assigned to"
              value={refName(lead.assignedTo, 'Unassigned')}
            />
            <Field
              label="Created by"
              value={refName(lead.createdBy, '—')}
            />
            <Field label="Created" value={formatDateTime(lead.createdAt)} />
            <Field label="Last updated" value={formatDateTime(lead.updatedAt)} />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Kits (proposals, confirmation contracts, corporate rate agreements)         */
/* -------------------------------------------------------------------------- */

const KIT_STATUS_BADGE = {
  draft: 'secondary',
  sent: 'accent',
  confirmed: 'default',
};

const KIT_TYPE_LABEL = {
  event: 'Event Kit',
  corporate: 'Corporate Rate Kit',
};

function KitsSection({ lead }) {
  const [kits, setKits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .get(`/leads/${lead._id}/kits`)
      .then((res) => {
        if (active) setKits(res?.data?.data?.kits ?? []);
      })
      .catch((err) => {
        toast.error(getErrorMessage(err, 'Failed to load kits'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [lead._id]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span>Kits &amp; Proposals</span>
            <Count value={kits.length} />
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/leads/${lead._id}/kits/new?type=event`}>
                <Plus className="h-4 w-4" />
                Event Kit
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/leads/${lead._id}/kits/new?type=corporate`}>
                <Plus className="h-4 w-4" />
                Corporate Rate Kit
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
          </div>
        ) : kits.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No kits yet"
            description="Create an event kit (proposal + confirmation contract) or a corporate rate kit, generate the PDF, email it, and upload the signed confirmation."
          />
        ) : (
          <div className="space-y-2">
            {kits.map((kit) => {
              const label =
                kit.kitType === 'corporate'
                  ? kit.corporate?.companyName || 'Corporate rate agreement'
                  : kit.event?.guestName || 'Event proposal';
              const fileCount = (kit.confirmationFiles || []).length;
              return (
                <Link
                  key={kit._id}
                  to={`/leads/${lead._id}/kits/${kit._id}`}
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40"
                >
                  <FileText className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {KIT_TYPE_LABEL[kit.kitType] || kit.kitType}
                      {kit.contractNumber ? ` · Contract #${kit.contractNumber}` : ''}
                      {' · '}updated {formatRelative(kit.updatedAt)}
                      {fileCount > 0
                        ? ` · ${fileCount} signed file${fileCount > 1 ? 's' : ''}`
                        : ''}
                    </p>
                  </div>
                  <Badge variant={KIT_STATUS_BADGE[kit.status] || 'secondary'}>
                    {kit.status}
                  </Badge>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Notes                                                                       */
/* -------------------------------------------------------------------------- */

function NotesTab({ lead, myId, isAdmin, mutate }) {
  const [body, setBody] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const notes = useMemo(
    () =>
      [...(lead.notes || [])].sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
      ),
    [lead.notes]
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
        api.post(`/leads/${lead._id}/notes`, { body: trimmed }),
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
        api.patch(`/leads/${lead._id}/notes/${noteId}`, { body: trimmed }),
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
        api.delete(`/leads/${lead._id}/notes/${noteId}`),
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
            placeholder="Write a note about this lead…"
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

function ActionPointsTab({ lead, mutate }) {
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const [clearingId, setClearingId] = useState(null);

  const points = useMemo(
    () =>
      [...(lead.actionPoints || [])].sort(
        (a, b) =>
          Number(a.cleared) - Number(b.cleared) ||
          new Date(b.createdAt || 0).getTime() -
            new Date(a.createdAt || 0).getTime()
      ),
    [lead.actionPoints]
  );
  const openCount = (lead.actionPoints || []).filter((a) => !a.cleared).length;

  async function handleAdd() {
    const trimmed = text.trim();
    if (!trimmed) {
      toast.error('Action point cannot be empty');
      return;
    }
    setAdding(true);
    try {
      await mutate(
        api.post(`/leads/${lead._id}/action-points`, { text: trimmed }),
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
        api.post(`/leads/${lead._id}/action-points/${apId}/clear`),
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
          description="Track concrete to-dos for this lead and clear them as you go."
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

function FollowUpsTab({ lead, mutate }) {
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);

  // Close dialog state.
  const [closeTarget, setCloseTarget] = useState(null);
  const [closingNote, setClosingNote] = useState('');
  const [closing, setClosing] = useState(false);

  const followUps = useMemo(
    () =>
      [...(lead.followUps || [])].sort((a, b) => {
        // Open first, then by due date ascending.
        const openDiff =
          (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1);
        if (openDiff !== 0) return openDiff;
        return (
          new Date(a.dueDate || 0).getTime() -
          new Date(b.dueDate || 0).getTime()
        );
      }),
    [lead.followUps]
  );

  async function handleAdd() {
    if (!dueDate) {
      toast.error('Pick a due date');
      return;
    }
    setAdding(true);
    try {
      await mutate(
        api.post(`/leads/${lead._id}/follow-ups`, {
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
          `/leads/${lead._id}/follow-ups/${closeTarget._id}/close`,
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
          description="Schedule a due date so this lead never slips through the cracks."
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
/* Instructions                                                                 */
/* -------------------------------------------------------------------------- */

function InstructionsTab({ lead, isAdmin, isAssignedExec, mutate }) {
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const [doneId, setDoneId] = useState(null);

  const instructions = useMemo(
    () =>
      [...(lead.instructions || [])].sort(
        (a, b) =>
          (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) ||
          new Date(b.createdAt || 0).getTime() -
            new Date(a.createdAt || 0).getTime()
      ),
    [lead.instructions]
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
        api.post(`/leads/${lead._id}/instructions`, { text: trimmed }),
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
        api.post(`/leads/${lead._id}/instructions/${insId}/done`),
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
          description="Admin directives for this lead will appear here."
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

/* -------------------------------------------------------------------------- */
/* History                                                                      */
/* -------------------------------------------------------------------------- */

const HISTORY_DOT = {
  created: '--status-new',
  status_change: '--status-proposal',
  assignment: '--status-qualified',
  action_point_cleared: '--status-won',
  follow_up_closed: '--status-negotiation',
};

function HistoryDialog({ open, onOpenChange, lead }) {
  const events = useMemo(
    () =>
      [...(lead.history || [])].sort(
        (a, b) =>
          new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime()
      ),
    [lead.history]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Activity history</DialogTitle>
          <DialogDescription>
            Status changes, assignments, cleared action points and closed
            follow-ups.
          </DialogDescription>
        </DialogHeader>

        {events.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No history yet.
          </p>
        ) : (
          <ol className="relative space-y-6 border-l border-border pl-6 pt-2">
            {events.map((ev, idx) => {
              const token = HISTORY_DOT[ev.type] || '--muted-foreground';
              return (
                <li key={ev._id ? String(ev._id) : idx} className="relative">
                  <span
                    className="absolute -left-[1.6rem] top-1 flex h-3 w-3 items-center justify-center rounded-full border-2 border-background"
                    style={{ backgroundColor: `hsl(var(${token}))` }}
                    aria-hidden="true"
                  />
                  <div className="space-y-0.5">
                    <p className="text-sm text-foreground">{ev.summary}</p>
                    <p className="text-xs text-muted-foreground">
                      {ev.byName ? `${ev.byName} · ` : ''}
                      {formatDateTime(ev.at)}{' '}
                      <span className="text-muted-foreground/70">
                        ({formatRelative(ev.at)})
                      </span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
