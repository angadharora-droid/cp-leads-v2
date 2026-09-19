import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Building2,
  CalendarDays,
  FileSignature,
  GitBranch,
  MoreHorizontal,
  Network,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { groupByBranch, hasBranches, nodeLabel, NO_BRANCH_LABEL } from '@/lib/departments';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ConfirmDialog from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';

/** Add / rename one branch-department node. */
function DepartmentDialog({ open, onOpenChange, lead, node, mutate, showBranch }) {
  const isEdit = Boolean(node?._id);
  const [branch, setBranch] = useState('');
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBranch(node?.branch || '');
    setName(node?.name || '');
  }, [open, node]);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return toast.error('Enter the department name');
    setIsSaving(true);
    try {
      const payload = { branch: branch.trim(), name: trimmed };
      await mutate(
        isEdit
          ? api.patch(`/leads/${lead._id}/departments/${node._id}`, payload)
          : api.post(`/leads/${lead._id}/departments`, payload),
        isEdit ? 'Department updated' : 'Department added'
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save department'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isSaving && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit department' : 'Add department'}</DialogTitle>
          <DialogDescription>
            Enquiries and rate contracts for {lead.businessName} are raised per department.
            Leave the branch blank when the company has no branches.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="dept-branch">
              Branch{' '}
              {showBranch ? null : (
                <span className="font-normal text-muted-foreground">(optional)</span>
              )}
            </Label>
            <Input
              id="dept-branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="e.g. Nagpur, Mumbai HQ"
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">City or office the department sits in.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dept-name">
              Department{' '}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </Label>
            <Input
              id="dept-name"
              autoFocus
              required
              aria-required="true"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. HR, Admin, Purchase"
              disabled={isSaving}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSave();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Press <kbd className="kbd">Enter</kbd> to save.
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:space-x-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Spinner size="sm" className="text-current" /> : <Plus className="h-4 w-4" />}
            {isEdit ? 'Save' : 'Add department'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Small count pill with an icon and a text tooltip. */
function CountPill({ icon: Icon, count, label }) {
  return (
    <span
      className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2 text-xs font-medium tabular-nums text-muted-foreground"
      title={`${count} ${label}`}
      aria-label={`${count} ${label}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {count}
    </span>
  );
}

/**
 * "Company structure" card on a company lead's page — the Branch → Department
 * tree that enquiries and rate contracts hang off, with per-node counts.
 *
 * @param {object} props
 * @param {object} props.lead
 * @param {(promise: Promise, msg?: string) => Promise<object>} props.mutate
 */
function DepartmentsSection({ lead, mutate }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [counts, setCounts] = useState({});

  const departments = lead.departments || [];
  const groups = useMemo(() => groupByBranch(departments), [departments]);
  const branched = hasBranches(departments);

  // Per-node activity counts (enquiries / rate contracts), best effort.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [enqRes, arcRes] = await Promise.all([
          api.get(`/leads/${lead._id}/enquiries`),
          api.get(`/leads/${lead._id}/arcs`),
        ]);
        if (!active) return;
        const next = {};
        for (const e of enqRes?.data?.data?.enquiries || []) {
          if (!e.department || ['lost', 'cancelled'].includes(e.stage)) continue;
          const key = String(e.department);
          next[key] = next[key] || { enquiries: 0, arcs: 0 };
          next[key].enquiries += 1;
        }
        for (const a of arcRes?.data?.data?.arcs || []) {
          if (!a.department || a.stage === 'lost') continue;
          const key = String(a.department);
          next[key] = next[key] || { enquiries: 0, arcs: 0 };
          next[key].arcs += 1;
        }
        setCounts(next);
      } catch {
        // Counts are a convenience only.
      }
    })();
    return () => {
      active = false;
    };
  }, [lead._id, lead.updatedAt]);

  async function handleDelete() {
    try {
      await mutate(
        api.delete(`/leads/${lead._id}/departments/${deleting._id}`),
        'Department removed'
      );
      setDeleting(null);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to remove department'));
      throw err;
    }
  }

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary"
                aria-hidden="true"
              >
                <Network className="h-4 w-4" />
              </span>
              Company structure
              <span
                className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground"
                title={`${departments.length} department${departments.length === 1 ? '' : 's'}`}
              >
                {departments.length}
              </span>
            </CardTitle>
            <CardDescription>
              {branched
                ? 'Branches and their departments. Every enquiry and rate contract sits under one department.'
                : 'Departments of this company. Every enquiry and rate contract sits under one department.'}
            </CardDescription>
          </div>
          <Button size="sm" className="h-10" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add department
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {departments.length === 0 ? (
          <EmptyState
            size="compact"
            icon={Network}
            title="No departments yet"
            description="Add one before raising enquiries or rate contracts — each of them sits under a department."
            action={
              <Button variant="outline" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Add department
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {groups.map((group) => (
              <div
                key={group.branch || '__none__'}
                className="rounded-lg border bg-card shadow-card transition-[border-color,box-shadow] duration-200 hover:border-primary/40 hover:shadow-card-hover"
              >
                <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2.5">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary"
                    aria-hidden="true"
                    title={group.branch ? 'Branch' : 'Company'}
                  >
                    {group.branch ? (
                      <GitBranch className="h-4 w-4" />
                    ) : (
                      <Building2 className="h-4 w-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                    {group.label}
                  </span>
                  {!group.branch && branched ? (
                    <span className="text-xs text-muted-foreground">(no branch)</span>
                  ) : null}
                  <span
                    className="text-xs tabular-nums text-muted-foreground"
                    title={`${group.nodes.length} department${group.nodes.length === 1 ? '' : 's'}`}
                  >
                    {group.nodes.length}
                  </span>
                </div>
                <ul className="divide-y">
                  {group.nodes.map((node) => {
                    const c = counts[String(node._id)] || { enquiries: 0, arcs: 0 };
                    return (
                      <li
                        key={node._id}
                        className="flex min-h-[3rem] items-center gap-2 px-3 py-1.5 transition-colors duration-150 hover:bg-muted/40"
                      >
                        <span
                          className="min-w-0 flex-1 truncate text-sm text-foreground"
                          title={nodeLabel(node) || node.name}
                        >
                          {node.name}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <CountPill
                            icon={CalendarDays}
                            count={c.enquiries}
                            label={`active enquir${c.enquiries === 1 ? 'y' : 'ies'}`}
                          />
                          <CountPill
                            icon={FileSignature}
                            count={c.arcs}
                            label={`active rate contract${c.arcs === 1 ? '' : 's'}`}
                          />
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-10 w-10 text-muted-foreground hover:text-foreground"
                              aria-label={`Actions for ${node.name}`}
                              title="Department actions"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setEditing(node);
                                setDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" /> Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeleting(node)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" /> Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <DepartmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        lead={lead}
        node={editing}
        mutate={mutate}
        showBranch={branched}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={handleDelete}
        title="Remove this department?"
        description={
          deleting
            ? `"${nodeLabel(deleting) || NO_BRANCH_LABEL}" is removed from ${lead.businessName}. Departments with enquiries or rate contracts attached cannot be removed.`
            : ''
        }
        confirmText="Remove"
        variant="destructive"
      />
    </Card>
  );
}

export { DepartmentsSection };
export default DepartmentsSection;
