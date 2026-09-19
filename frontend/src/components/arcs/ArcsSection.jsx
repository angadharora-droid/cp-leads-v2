import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  ArrowRight,
  CalendarRange,
  FileSignature,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { departmentLabel } from '@/lib/departments';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ConfirmDialog from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';

import ArcStageBadge from './ArcStageBadge';
import ArcDialog from './ArcDialog';

function fmt(value) {
  if (!value) return '';
  try {
    return format(new Date(value), 'd MMM yyyy');
  } catch {
    return '';
  }
}

/** "1 Apr 2026 → 31 Mar 2027" or whichever half is known. */
export function validityLabel(arc) {
  const from = fmt(arc.validFrom);
  const to = fmt(arc.validTo);
  if (from && to) return `${from} → ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  return '';
}

export function ArcLostDialog({ open, onOpenChange, arc, onDone }) {
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  async function handleSave() {
    setIsSaving(true);
    try {
      const res = await api.post(`/arcs/${arc._id}/lost`, { reason: reason.trim() || undefined });
      toast.success('Rate contract marked lost');
      onDone?.(res?.data?.data?.arc);
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to mark lost'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark rate contract as lost</DialogTitle>
          <DialogDescription>
            The one manual move in the funnel — the contract drops off the active board.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="arc-lost-reason">Reason (optional)</Label>
          <Textarea
            id="arc-lost-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Spinner className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            Mark lost
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- Card ----------------------------------- */

function ArcCard({ lead, arc, onEdit, onRenew, onLost, onDelete }) {
  const kit = arc.kit && typeof arc.kit === 'object' ? arc.kit : null;
  const dept = departmentLabel(lead, arc.department);
  const validity = validityLabel(arc);
  const active = arc.stage !== 'lost';
  const sentCount = (kit?.emailLog || []).filter((e) => e.status === 'sent').length;
  const signedCount = (kit?.confirmationFiles || []).length;

  return (
    <div className="rounded-lg border bg-card p-4 shadow-card transition-shadow hover:shadow-card-hover">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <ArcStageBadge stage={arc.stage} />
            {dept ? (
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {dept}
              </span>
            ) : null}
          </div>
          <p className="text-sm font-medium text-foreground">
            {arc.title || 'Rate contract'}
            {validity ? (
              <span className="text-muted-foreground">
                {' '}
                — <CalendarRange className="mb-0.5 inline h-3.5 w-3.5" /> {validity}
              </span>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground">
            {arc.contactName ? `${arc.contactName}` : ''}
            {arc.contactEmail ? ` · ${arc.contactEmail}` : ''}
            {kit
              ? ` · Agreement ${kit.status}${sentCount ? ` · emailed ${sentCount}×` : ''}${
                  signedCount ? ` · ${signedCount} signed file${signedCount > 1 ? 's' : ''}` : ''
                }`
              : ' · No agreement yet'}
          </p>
          {arc.stage === 'lost' && arc.lostReason ? (
            <p className="text-xs text-destructive">Lost: {arc.lostReason}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          <Button size="sm" variant={active ? 'default' : 'outline'} asChild>
            <Link to={`/rate-contracts/${arc._id}`}>
              Open contract
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {active ? (
                <DropdownMenuItem onClick={() => onEdit(arc)}>
                  <Pencil className="h-4 w-4" /> Edit details
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => onRenew(arc)}>
                <RefreshCw className="h-4 w-4" /> Renew (new contract)
              </DropdownMenuItem>
              {active ? (
                <DropdownMenuItem onClick={() => onLost(arc)} className="text-destructive">
                  <XCircle className="h-4 w-4" /> Mark lost
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => onDelete(arc)} className="text-destructive">
                <Trash2 className="h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- Section --------------------------------- */

/**
 * "Rate contracts" card on a company lead's page — one ARC per
 * branch/department per year; renewals are new contracts.
 *
 * @param {object} props
 * @param {object} props.lead
 * @param {(lead: object) => void} [props.onLeadUpdated]
 */
function ArcsSection({ lead, onLeadUpdated }) {
  const navigate = useNavigate();
  const [arcs, setArcs] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [renewing, setRenewing] = useState(null);
  const [lostFor, setLostFor] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/leads/${lead._id}/arcs`);
      setArcs(res?.data?.data?.arcs || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load rate contracts'));
      setArcs([]);
    }
  }, [lead._id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete() {
    await api.delete(`/arcs/${deleting._id}`);
    toast.success('Rate contract deleted');
    setDeleting(null);
    load();
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSignature className="h-4 w-4 text-primary" />
            Rate contracts
            {arcs ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {arcs.length}
              </span>
            ) : null}
          </CardTitle>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setRenewing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New rate contract
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {arcs === null ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
          </div>
        ) : arcs.length === 0 ? (
          <EmptyState
            icon={FileSignature}
            title="No rate contracts yet"
            description="Raise an annual rate contract for a department — fill the rate agreement, email it and upload the signed copy; the stage moves on its own."
          />
        ) : (
          arcs.map((arc) => (
            <ArcCard
              key={arc._id}
              lead={lead}
              arc={arc}
              onEdit={(a) => {
                setEditing(a);
                setRenewing(null);
                setDialogOpen(true);
              }}
              onRenew={(a) => {
                setEditing(null);
                setRenewing(a);
                setDialogOpen(true);
              }}
              onLost={setLostFor}
              onDelete={setDeleting}
            />
          ))
        )}
      </CardContent>

      <ArcDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        lead={lead}
        arc={editing}
        renewFrom={renewing}
        onSaved={(saved) => {
          // A freshly raised contract opens straight away — the agreement
          // form is where the work continues.
          if (!editing && saved?._id) navigate(`/rate-contracts/${saved._id}`);
          else load();
        }}
        onLeadUpdated={onLeadUpdated}
      />
      <ArcLostDialog
        open={Boolean(lostFor)}
        onOpenChange={(open) => !open && setLostFor(null)}
        arc={lostFor}
        onDone={() => load()}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={handleDelete}
        title="Delete this rate contract?"
        description="The contract and its agreement kit (including uploaded files) are removed. This cannot be undone."
        confirmText="Delete"
        variant="destructive"
      />
    </Card>
  );
}

export { ArcsSection };
export default ArcsSection;
