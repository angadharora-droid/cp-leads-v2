import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Pencil, Trash2, UserCog, ChevronDown, Check, History as HistoryIcon, Mail, Phone, MapPin, Building2, User } from 'lucide-react';


import api, { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format';
import { isIndividual } from '@/lib/departments';

import ActivityPanel from '@/components/enquiries/ActivityPanel';
import { PageHeader } from '@/components/PageHeader';
import { EnquiriesSection } from '@/components/enquiries/EnquiriesSection';
import { ArcsSection } from '@/components/arcs/ArcsSection';
import { DepartmentsSection } from '@/components/leads/DepartmentsSection';
import { StatusBadge, LEAD_STATUSES } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';

import { Button } from '@/components/ui/button';

import { Label } from '@/components/ui/label';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';

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
          showTitle
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

  const legacyActivity = Object.fromEntries(
    ['notes', 'followUps', 'visitReports', 'actionPoints', 'instructions'].map((field) =>
      [field, (lead[field] || []).filter((item) => !item.enquiry)])
  );

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

      <div className="space-y-5">
        {!isIndividual(lead) ? <DepartmentsSection lead={lead} mutate={mutate} /> : null}
        <OverviewTab lead={lead} />
        <EnquiriesSection lead={lead} onLeadUpdated={(next) => next && setLead(next)} />
        {!isIndividual(lead) ? <ArcsSection lead={lead} onLeadUpdated={(next) => next && setLead(next)} /> : null}
        {Object.values(legacyActivity).some((items) => items.length) ? (
          <details className="rounded-lg border p-4">
            <summary className="cursor-pointer text-sm font-medium">Unlinked lead activity</summary>
            <p className="my-3 text-sm text-muted-foreground">These earlier records have no enquiry assigned. Open an enquiry to manage its activity.</p>
            <ActivityPanel
              record={{ ...lead, ...legacyActivity }}
              apiBase={`/leads/${lead._id}`}
              title="Unlinked lead activity"
              mutate={mutate}
              isAdmin={isAdmin}
              isAssignedExec={isAssignedExec}
              myId={myId}
            />
          </details>
        ) : null}
      </div>
    </div>
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
          showTitle
          title={
            <span className="flex flex-wrap items-center gap-3">
              {lead.businessName}
              <StatusBadge status={lead.status} />
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {isIndividual(lead) ? (
                  <User className="h-3 w-3" />
                ) : (
                  <Building2 className="h-3 w-3" />
                )}
                {isIndividual(lead) ? 'Individual' : 'Company'}
              </span>
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
    <div className="min-w-0 space-y-1">
      <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {label}
      </dt>
      <dd
        className={
          'break-words text-sm ' +
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
            <Field
              label={isIndividual(lead) ? 'Full name' : 'Company name'}
              value={lead.businessName}
              icon={isIndividual(lead) ? User : Building2}
            />
            {!isIndividual(lead) ? (
              <Field label="Business type" value={lead.businessType} />
            ) : null}
            <Field
              label="Contacted for"
              value={
                Array.isArray(lead.contactedFor)
                  ? lead.contactedFor.join(', ')
                  : lead.contactedFor
              }
            />
            {!isIndividual(lead) ? (
              <>
                <Field label="Contact person" value={lead.contactPerson} />
                <Field label="Designation" value={lead.designation} />
              </>
            ) : null}
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
