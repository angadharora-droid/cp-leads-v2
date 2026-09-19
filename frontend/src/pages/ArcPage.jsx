import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Building2,
  CalendarRange,
  Check,
  FileSignature,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';

import api, { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ARC_STAGES, arcStageInfo } from '@/lib/arcStages';
import { departmentLabel } from '@/lib/departments';
import { formatDateTime } from '@/lib/format';

import KitPage, { defaultCorporateDetails } from '@/pages/KitPage';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import ArcStageBadge from '@/components/arcs/ArcStageBadge';
import ArcDialog from '@/components/arcs/ArcDialog';
import { ArcLostDialog, validityLabel } from '@/components/arcs/ArcsSection';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const FUNNEL = ARC_STAGES.filter((s) => s.key !== 'lost');

/** Horizontal funnel stepper: raised → proposal → awaiting → contracted. */
function ArcFunnel({ arc }) {
  const lost = arc.stage === 'lost';
  const currentIdx = FUNNEL.findIndex((s) => s.key === arc.stage);
  const reached = (key) => {
    const entry = (arc.stageHistory || []).find((h) => h.stage === key);
    return entry?.at ? formatDateTime(entry.at) : '';
  };
  return (
    <ol
      className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-4"
      aria-label="Contract progress"
    >
      {FUNNEL.map((stage, i) => {
        const done = !lost && i < currentIdx;
        const current = !lost && i === currentIdx;
        const info = arcStageInfo(stage.key);
        return (
          <li
            key={stage.key}
            className={cn(
              'flex items-start gap-3 rounded-lg px-3 py-2 transition-colors',
              current && 'bg-muted/60'
            )}
            aria-current={current ? 'step' : undefined}
          >
            <span
              className={cn(
                'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                done && 'border-transparent text-white',
                current && 'border-transparent text-white',
                !done && !current && 'border-border text-muted-foreground'
              )}
              style={done || current ? { backgroundColor: info.color } : undefined}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  'block text-sm font-medium',
                  done || current ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {stage.label}
              </span>
              <span className="block text-xs text-muted-foreground">
                {reached(stage.key) || stage.hint}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Rate contract page — one record that carries the contract's stage, the
 * department it belongs to, and the corporate rate agreement itself (company
 * details, property rate tables, agreement letter, email, signed copy).
 */
export default function ArcPage() {
  const { arcId } = useParams();
  const navigate = useNavigate();
  const [arc, setArc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        const res = await api.get(`/arcs/${arcId}`);
        let next = res?.data?.data?.arc;
        if (!next) throw new Error('Rate contract not found');
        // The agreement is part of the contract: create it on first open,
        // pre-filled from the lead and the standard property rate tables.
        if (!next.kit && next.stage !== 'lost') {
          await api.post(`/leads/${next.lead._id}/kits`, {
            kitType: 'corporate',
            arc: next._id,
            corporate: defaultCorporateDetails({
              ...next.lead,
              contactPerson: next.contactName || next.lead.contactPerson,
              mobile: next.contactPhone || next.lead.mobile,
              email: next.contactEmail || next.lead.email,
            }),
          });
          const again = await api.get(`/arcs/${arcId}`);
          next = again?.data?.data?.arc || next;
        }
        setArc(next);
        setLoadError(null);
      } catch (err) {
        if (!silent) setLoadError(getErrorMessage(err, 'Failed to load the rate contract'));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [arcId]
  );

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete() {
    try {
      await api.delete(`/arcs/${arc._id}`);
      toast.success('Rate contract deleted');
      navigate(`/leads/${arc.lead._id}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete rate contract'));
      throw err;
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (loadError || !arc) {
    return (
      <div className="space-y-6">
        <PageHeader
          showTitle
          title="Rate contract"
          actions={
            <Button variant="outline" asChild>
              <Link to="/rate-contracts">
                <ArrowLeft className="h-4 w-4" />
                Back to rate contracts
              </Link>
            </Button>
          }
        />
        <EmptyState
          icon={FileSignature}
          title="Rate contract not found"
          description={loadError || 'This contract does not exist or you do not have access to it.'}
        />
      </div>
    );
  }

  const lead = arc.lead;
  const dept = departmentLabel(lead, arc.department);
  const validity = validityLabel(arc);
  const kitId = arc.kit && typeof arc.kit === 'object' ? arc.kit._id : arc.kit;
  const active = arc.stage !== 'lost';

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/leads/${lead._id}`)}
          aria-label="Back to lead"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Link to="/leads" className="text-muted-foreground hover:text-foreground">
          Leads
        </Link>
        <span className="text-muted-foreground">/</span>
        <Link to={`/leads/${lead._id}`} className="text-muted-foreground hover:text-foreground">
          {lead.reference || 'Lead'}
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium text-foreground">Corporate Rate Kit</span>
      </nav>

      <PageHeader
        showTitle
        eyebrow="Corporate Rate Kit · Rate contract"
        title={
          <span className="flex flex-wrap items-center gap-3">
            {arc.title || 'Rate contract'}
            <ArcStageBadge stage={arc.stage} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              <Link to={`/leads/${lead._id}`} className="font-medium text-foreground hover:underline">
                {lead.businessName}
              </Link>
              {dept ? <span className="text-primary">· {dept}</span> : null}
            </span>
            {validity ? (
              <span className="inline-flex items-center gap-1.5">
                <CalendarRange className="h-3.5 w-3.5" />
                {validity}
              </span>
            ) : null}
            {arc.contactEmail ? (
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {arc.contactEmail}
              </span>
            ) : null}
            {arc.contactPhone ? (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                {arc.contactPhone}
              </span>
            ) : null}
          </span>
        }
        actions={
          <>
            {active ? (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                Edit contract
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setRenewOpen(true)}>
                  <RefreshCw className="h-4 w-4" /> Renew (new contract)
                </DropdownMenuItem>
                {active ? (
                  <DropdownMenuItem onClick={() => setLostOpen(true)} className="text-destructive">
                    <XCircle className="h-4 w-4" /> Mark lost
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setConfirmDelete(true)} className="text-destructive">
                  <Trash2 className="h-4 w-4" /> Delete contract
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <ArcFunnel arc={arc} />

      {/* Once signed, the term the rates hold for is the last thing to record. */}
      {arc.stage === 'contracted' && !(arc.validFrom && arc.validTo) ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success/40 bg-success/10 p-3">
          <p className="flex items-start gap-2.5 text-sm text-foreground">
            <CalendarRange className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            <span>
              <span className="font-medium">Signed and contracted.</span> Record the validity so
              everyone knows how long these rates hold.
            </span>
          </p>
          <Button size="sm" onClick={() => setEditOpen(true)}>
            <CalendarRange className="h-4 w-4" />
            Set validity
          </Button>
        </div>
      ) : null}

      {arc.stage === 'lost' && arc.lostReason ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Marked lost: {arc.lostReason}
        </p>
      ) : null}

      {kitId ? (
        <KitPage
          key={String(kitId)}
          leadIdProp={String(lead._id)}
          kitIdProp={String(kitId)}
          embedded
          onActivity={() => load({ silent: true })}
        />
      ) : (
        <EmptyState
          icon={FileSignature}
          title="No agreement on this contract"
          description="This contract was marked lost before its agreement was started."
        />
      )}

      <ArcDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        lead={lead}
        arc={arc}
        onSaved={() => load({ silent: true })}
        onLeadUpdated={(next) => next && setArc((a) => ({ ...a, lead: { ...a.lead, ...next } }))}
      />
      <ArcDialog
        open={renewOpen}
        onOpenChange={setRenewOpen}
        lead={lead}
        arc={null}
        renewFrom={arc}
        onSaved={(saved) => {
          if (saved?._id) navigate(`/rate-contracts/${saved._id}`);
        }}
        onLeadUpdated={(next) => next && setArc((a) => ({ ...a, lead: { ...a.lead, ...next } }))}
      />
      <ArcLostDialog
        open={lostOpen}
        onOpenChange={setLostOpen}
        arc={arc}
        onDone={() => load({ silent: true })}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={handleDelete}
        title="Delete this rate contract?"
        description="The contract, its agreement, email log and uploaded files are permanently removed."
        confirmText="Delete contract"
        variant="destructive"
      />
    </div>
  );
}
