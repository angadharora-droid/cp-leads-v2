import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Building2,
  CalendarRange,
  Eye,
  EyeOff,
  FileSignature,
  Mail,
  Plus,
  Search,
} from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { ARC_STAGES, arcStageInfo } from '@/lib/arcStages';
import { BoardFilters, FilterToggle, activeFilterCount } from '@/components/BoardFilters';
import { departmentLabel } from '@/lib/departments';

import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import LeadPickerDialog from '@/components/leads/LeadPickerDialog';
import ArcDialog from '@/components/arcs/ArcDialog';
import { validityLabel } from '@/components/arcs/ArcsSection';
import { KanbanBoard, KanbanCard } from '@/components/KanbanBoard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** One contract on the board: company, department, title, validity, agreement state. */
function ArcCard({ arc, onOpen }) {
  const lead = arc.lead && typeof arc.lead === 'object' ? arc.lead : null;
  const dept = departmentLabel(lead, arc.department);
  const validity = validityLabel(arc);
  const kit = arc.kit && typeof arc.kit === 'object' ? arc.kit : null;
  const emailed = (kit?.emailLog || []).filter((e) => e.status === 'sent').length;
  const signed = (kit?.confirmationFiles || []).length;
  const info = arcStageInfo(arc.stage);
  return (
    <KanbanCard onClick={onOpen} aria-label={`${lead?.businessName || 'Lead'} — ${info.label}`}>
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: `${info.color}1f`, color: info.color }}
        >
          <Building2 className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {lead?.businessName || 'Lead'}
          </p>
          {dept ? <p className="truncate text-xs font-medium text-primary">{dept}</p> : null}
        </div>
      </div>
      <div className="mt-2 space-y-1 border-t pt-2">
        <p className="truncate text-sm text-foreground">{arc.title || 'Rate contract'}</p>
        {validity ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarRange className="h-3 w-3 shrink-0" />
            <span className="truncate tabular-nums">{validity}</span>
          </p>
        ) : null}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileSignature className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {!kit
              ? 'Agreement not started'
              : signed
                ? `Signed copy on file (${signed})`
                : emailed
                  ? `Emailed ${emailed}× — awaiting signature`
                  : `Agreement ${kit.status}`}
          </span>
        </p>
        {arc.contactEmail ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{arc.contactEmail}</span>
          </p>
        ) : null}
      </div>
    </KanbanCard>
  );
}

/**
 * The rate-contract board — one column per ARC stage. Cards move on their
 * own as the agreement is generated, emailed and its signed copy uploaded;
 * only Lost is manual, done from the contract page.
 */
const EMPTY_FILTERS = { assignedTo: '', agreement: '', validity: '' };

export default function ArcsBoardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [arcs, setArcs] = useState(null);
  const [q, setQ] = useState('');
  const [showLost, setShowLost] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [arcLead, setArcLead] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [execs, setExecs] = useState([]);

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    api
      .get('/users', { params: { role: 'sales_exec' } })
      .then((res) => {
        const payload = res?.data?.data;
        const list = Array.isArray(payload) ? payload : payload?.items ?? payload?.users ?? [];
        if (alive) setExecs(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/arcs', { params: q ? { q } : {} });
      setArcs(res?.data?.data?.arcs || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load rate contracts'));
      setArcs([]);
    } finally {
      setIsLoading(false);
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const filtered = useMemo(() => {
    const f = filters;
    const today = new Date();
    return (arcs || []).filter((a) => {
      if (f.assignedTo) {
        const owner = a.lead?.assignedTo;
        if (String(owner?._id || owner || '') !== f.assignedTo) return false;
      }
      if (f.agreement) {
        const kit = a.kit && typeof a.kit === 'object' ? a.kit : null;
        const status = kit ? kit.status : 'none';
        if (status !== f.agreement) return false;
      }
      if (f.validity) {
        const from = a.validFrom ? new Date(a.validFrom) : null;
        const to = a.validTo ? new Date(a.validTo) : null;
        if (f.validity === 'current' && !(from && to && from <= today && today <= to)) return false;
        if (f.validity === 'expired' && !(to && to < today)) return false;
        if (f.validity === 'unset' && (from || to)) return false;
      }
      return true;
    });
  }, [arcs, filters]);

  const columns = useMemo(() => {
    const stages = ARC_STAGES.filter((s) => showLost || s.key !== 'lost');
    return stages.map((stage) => ({
      ...stage,
      items: filtered.filter((a) => a.stage === stage.key),
    }));
  }, [filtered, showLost]);

  const active = filtered.filter((a) => a.stage !== 'lost').length;
  const awaiting = filtered.filter((a) => a.stage === 'awaiting').length;
  const contracted = filtered.filter((a) => a.stage === 'contracted').length;
  const filterCount = activeFilterCount(filters);

  const filterFields = [
    ...(isAdmin
      ? [
          {
            key: 'assignedTo',
            label: 'Assigned to',
            options: execs.map((e) => ({ value: e._id, label: e.name })),
            placeholder: 'Anyone',
          },
        ]
      : []),
    {
      key: 'agreement',
      label: 'Agreement',
      options: [
        { value: 'none', label: 'Not started' },
        { value: 'draft', label: 'Draft' },
        { value: 'sent', label: 'Emailed' },
        { value: 'confirmed', label: 'Signed copy on file' },
      ],
      placeholder: 'Any state',
    },
    {
      key: 'validity',
      label: 'Validity',
      options: [
        { value: 'current', label: 'In force now' },
        { value: 'expired', label: 'Expired' },
        { value: 'unset', label: 'Not set yet' },
      ],
      placeholder: 'Any',
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Rate Contracts" />

      {/* One toolbar row: search, live counts, then the actions. */}
      <div className="workspace-toolbar">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by company name…"
            className="pl-9"
            aria-label="Search rate contracts by company name"
          />
        </div>
        {arcs ? (
          <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground md:flex">
            <span>
              <span className="font-semibold tabular-nums text-foreground">{active}</span> active
            </span>
            <span>
              <span className="font-semibold tabular-nums text-warning">{awaiting}</span> awaiting signature
            </span>
            <span>
              <span className="font-semibold tabular-nums text-success">{contracted}</span> contracted
            </span>
          </div>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <FilterToggle open={filtersOpen} count={filterCount} onClick={() => setFiltersOpen((v) => !v)} />
          <Button variant="outline" size="sm" onClick={() => setShowLost((v) => !v)}>
            {showLost ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showLost ? 'Hide lost' : 'Show lost'}
          </Button>
          <Button size="sm" onClick={() => setPickerOpen(true)}>
            <Plus className="h-4 w-4" />
            New rate contract
          </Button>
        </div>
      </div>

      <BoardFilters
        open={filtersOpen}
        fields={filterFields}
        values={filters}
        onChange={(key, value) => setFilters((f) => ({ ...f, [key]: value }))}
        onClear={() => setFilters(EMPTY_FILTERS)}
      />

      {arcs === null ? (
        <KanbanBoard loading columns={columns} renderCard={() => null} />
      ) : filtered.length === 0 && filterCount ? (
        <EmptyState
          icon={FileSignature}
          title="No rate contracts match these filters"
          description="Loosen a filter or clear them all to see the full board."
          action={
            <Button variant="outline" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear filters
            </Button>
          }
        />
      ) : arcs.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title={q ? `No rate contracts match “${q}”` : 'No rate contracts yet'}
          description={
            q
              ? 'Try another company name or clear the search.'
              : 'Raise a rate contract for a company department — it appears here and moves along as the agreement is prepared, emailed and signed.'
          }
          action={
            q ? (
              <Button variant="outline" size="sm" onClick={() => setQ('')}>
                Clear search
              </Button>
            ) : (
              <Button size="sm" onClick={() => setPickerOpen(true)}>
                <Plus className="h-4 w-4" />
                New rate contract
              </Button>
            )
          }
        />
      ) : (
        <KanbanBoard
          columns={columns}
          renderCard={(arc) => (
            <ArcCard arc={arc} onOpen={() => navigate(`/rate-contracts/${arc._id}`)} />
          )}
        />
      )}

      <LeadPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        leadType="company"
        title="New rate contract — pick the company"
        description="Rate contracts are raised per company department. Search the company below; if it is not listed yet, create the lead first."
        onPick={(lead) => {
          setPickerOpen(false);
          setArcLead(lead);
        }}
      />
      {arcLead ? (
        <ArcDialog
          open
          onOpenChange={(open) => {
            if (!open) setArcLead(null);
          }}
          lead={arcLead}
          arc={null}
          onLeadUpdated={(next) => next && setArcLead(next)}
          onSaved={(saved) => {
            setArcLead(null);
            if (saved?._id) navigate(`/rate-contracts/${saved._id}`);
            else load();
          }}
        />
      ) : null}
    </div>
  );
}
