import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Check,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  TrendingUp,
  Undo2,
  User as UserIcon,
  X,
} from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { LEAD_STATUSES } from '@/components/StatusBadge';
import { formatCompactNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// The list API caps page size at 100, so the board pages through every lead
// to reflect the full pipeline. MAX_PAGES is a safety bound (up to 10,000).
const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const ALL = '__all__';

const CONTACTED_FOR_OPTIONS = ['CPA', 'CPH', 'CPNM'];

/**
 * Per-status presentation token (mirrors StatusBadge's CSS variables so the
 * board adapts automatically to light/dark themes).
 */
const STATUS_TOKEN = {
  'Non Contracted': '--status-non-contracted',
  Contracted: '--status-contracted',
};

function tokenFor(status) {
  return STATUS_TOKEN[status] || '--muted-foreground';
}

/** Normalize a lead's contactedFor (legacy single string or array) to an array. */
function contactedUnits(lead) {
  const value = lead.contactedFor;
  return Array.isArray(value) ? value : value ? [value] : [];
}

/** Safely read a populated assignee's display name. */
function assigneeName(assignedTo) {
  if (!assignedTo) return 'Unassigned';
  if (typeof assignedTo === 'string') return 'Assigned';
  return assignedTo.name || 'Unassigned';
}

/** Open follow-up stats for a lead: count and whether any is overdue. */
function followUpStats(lead) {
  const open = (lead.followUps || []).filter((f) => f.status === 'open');
  const today = new Date().setHours(0, 0, 0, 0);
  const overdue = open.some(
    (f) => f.dueDate && new Date(f.dueDate).getTime() < today
  );
  return { openCount: open.length, overdue };
}

/**
 * A single lead card. Click opens the lead; drag it into the other column
 * (or use the quick action button) to flip its status.
 */
function LeadCard({ lead, onOpen, onMove, busy }) {
  const token = tokenFor(lead.status);
  const { openCount, overdue } = followUpStats(lead);
  const isContracted = lead.status === 'Contracted';
  const targetStatus = isContracted ? 'Non Contracted' : 'Contracted';

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', lead._id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => onOpen(lead._id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(lead._id);
        }
      }}
      className={cn(
        'group w-full cursor-pointer rounded-md border bg-card p-3 text-left shadow-sm transition-colors',
        'hover:border-ring hover:bg-accent/30 focus:outline-none focus:ring-2 focus:ring-ring',
        busy && 'opacity-60'
      )}
      style={{ borderLeft: `3px solid hsl(var(${token}))` }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-medium text-foreground">
          {lead.businessName || 'Untitled lead'}
        </p>
        {contactedUnits(lead).length > 0 ? (
          <span className="flex flex-shrink-0 flex-wrap justify-end gap-1">
            {contactedUnits(lead).map((unit) => (
              <span
                key={unit}
                className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
              >
                {unit}
              </span>
            ))}
          </span>
        ) : null}
      </div>

      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
        {lead.reference || '—'}
      </p>

      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        {lead.contactPerson || lead.mobile ? (
          <div className="flex items-center gap-1.5">
            <Phone className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">
              {[lead.contactPerson, lead.mobile].filter(Boolean).join(' · ')}
            </span>
          </div>
        ) : null}
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
          <span className="truncate">{lead.city || 'No city'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <UserIcon className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
          <span className="truncate">{assigneeName(lead.assignedTo)}</span>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
        {openCount > 0 ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium',
              overdue
                ? 'bg-[hsl(var(--status-lost)/0.12)] text-[hsl(var(--status-lost))]'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {overdue ? (
              <AlertTriangle className="h-3 w-3" />
            ) : (
              <CalendarClock className="h-3 w-3" />
            )}
            {openCount} follow-up{openCount === 1 ? '' : 's'}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground/60">
            No open follow-ups
          </span>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-[11px] opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onMove(lead._id, targetStatus);
          }}
        >
          {busy ? (
            <Spinner size="sm" className="text-current" />
          ) : isContracted ? (
            <Undo2 className="h-3 w-3" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          {isContracted ? 'Non Contracted' : 'Mark Contracted'}
        </Button>
      </div>
    </div>
  );
}

/**
 * A status column: header (status name, count) plus its cards. Acts as a
 * drop target for drag-and-drop status changes.
 */
function StageColumn({ status, leads, onOpen, onMove, busyId }) {
  const token = tokenFor(status);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const leadId = e.dataTransfer.getData('text/plain');
        if (leadId) onMove(leadId, status);
      }}
      className={cn(
        'flex min-w-0 flex-1 flex-col rounded-lg border bg-muted/30 transition-colors',
        dragOver && 'border-ring bg-accent/20'
      )}
    >
      <div
        className="flex items-center justify-between gap-2 rounded-t-lg border-b px-3 py-2.5"
        style={{ backgroundColor: `hsl(var(${token}) / 0.10)` }}
      >
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: `hsl(var(${token}))` }}
            aria-hidden="true"
          />
          <span className="text-sm font-semibold text-foreground">{status}</span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold"
            style={{
              backgroundColor: `hsl(var(${token}) / 0.18)`,
              color: `hsl(var(${token}))`,
            }}
          >
            {leads.length}
          </span>
        </div>
        <span className="hidden text-[11px] text-muted-foreground sm:block">
          Drag cards here
        </span>
      </div>

      <div className="grid max-h-[calc(100vh-24rem)] grid-cols-1 content-start gap-2 overflow-y-auto p-2 xl:grid-cols-2">
        {leads.length === 0 ? (
          <p className="col-span-full px-1 py-6 text-center text-xs text-muted-foreground">
            No leads
          </p>
        ) : (
          leads.map((lead) => (
            <LeadCard
              key={lead._id}
              lead={lead}
              onOpen={onOpen}
              onMove={onMove}
              busy={busyId === lead._id}
            />
          ))
        )}
      </div>
    </div>
  );
}

/** A compact stat tile for the totals strip. */
function StatTile({ label, value, accent }) {
  return (
    <Card className="flex flex-col justify-center px-4 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn('mt-0.5 text-xl font-semibold tracking-tight')}
        style={accent ? { color: `hsl(var(${accent}))` } : undefined}
      >
        {value}
      </span>
    </Card>
  );
}

function BoardSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {LEAD_STATUSES.map((status) => (
        <div key={status} className="flex flex-col rounded-lg border bg-muted/30">
          <div className="border-b px-3 py-2.5">
            <Skeleton className="h-5 w-28" />
          </div>
          <div className="space-y-2 p-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-md" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Admin pipeline board — Non Contracted / Contracted columns with search and
 * filters. Drag a card into the other column (or use its quick action) to
 * change the lead's status in place.
 */
function LeadTrackerPage() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // Client-side filters over the loaded board.
  const [search, setSearch] = useState('');
  const [contactedForFilter, setContactedForFilter] = useState(ALL);
  const [execFilter, setExecFilter] = useState(ALL);

  const fetchLeads = useCallback(async ({ silent } = {}) => {
    if (silent) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const all = [];
      let total = 0;
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const res = await api.get('/leads', {
          params: { limit: PAGE_SIZE, page, sort: '-leadDate' },
        });
        const data = res?.data?.data || {};
        const items = Array.isArray(data.items) ? data.items : [];
        total = Number(data.total) || all.length + items.length;
        all.push(...items);
        if (items.length < PAGE_SIZE || all.length >= total) break;
      }
      if (all.length < total) {
        toast.message(`Showing the first ${all.length} of ${total} leads.`);
      }
      setLeads(all);
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to load the lead pipeline');
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const openLead = useCallback(
    (id) => {
      if (id) navigate(`/leads/${id}`);
    },
    [navigate]
  );

  /**
   * Flip a lead's status (drag-and-drop or quick action). Optimistic: the
   * card moves immediately and reverts if the API call fails.
   */
  const moveLead = useCallback(
    async (leadId, status) => {
      const lead = leads.find((l) => l._id === leadId);
      if (!lead || lead.status === status || busyId) return;
      const previous = lead.status;
      setBusyId(leadId);
      setLeads((prev) =>
        prev.map((l) => (l._id === leadId ? { ...l, status } : l))
      );
      try {
        await api.patch(`/leads/${leadId}`, { status });
        toast.success(`${lead.businessName || 'Lead'} marked ${status}`);
      } catch (err) {
        setLeads((prev) =>
          prev.map((l) => (l._id === leadId ? { ...l, status: previous } : l))
        );
        toast.error(getErrorMessage(err, 'Failed to change status'));
      } finally {
        setBusyId(null);
      }
    },
    [leads, busyId]
  );

  // Executive options derived from the loaded leads (populated assignedTo).
  const execOptions = useMemo(() => {
    const map = new Map();
    for (const lead of leads) {
      const a = lead.assignedTo;
      if (a && typeof a === 'object' && a._id) {
        map.set(String(a._id), a.name || 'Unnamed');
      }
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [leads]);

  const hasActiveFilters =
    search.trim() !== '' || contactedForFilter !== ALL || execFilter !== ALL;

  const clearFilters = () => {
    setSearch('');
    setContactedForFilter(ALL);
    setExecFilter(ALL);
  };

  // Apply search + filters before grouping into columns.
  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (
        contactedForFilter !== ALL &&
        !contactedUnits(lead).includes(contactedForFilter)
      ) {
        return false;
      }
      if (execFilter !== ALL) {
        const assignedId =
          lead.assignedTo && typeof lead.assignedTo === 'object'
            ? String(lead.assignedTo._id)
            : lead.assignedTo
              ? String(lead.assignedTo)
              : '';
        if (assignedId !== execFilter) return false;
      }
      if (!q) return true;
      return [
        lead.businessName,
        lead.reference,
        lead.contactPerson,
        lead.mobile,
        lead.city,
      ].some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [leads, search, contactedForFilter, execFilter]);

  // Group into columns keyed by status, preserving fetch order.
  const columns = useMemo(() => {
    const grouped = Object.fromEntries(LEAD_STATUSES.map((s) => [s, []]));
    for (const lead of filteredLeads) {
      const status = LEAD_STATUSES.includes(lead.status)
        ? lead.status
        : 'Non Contracted';
      grouped[status].push(lead);
    }
    return grouped;
  }, [filteredLeads]);

  const totals = useMemo(() => {
    const contractedCount = columns.Contracted?.length || 0;
    const nonContractedCount = columns['Non Contracted']?.length || 0;
    const shown = filteredLeads.length;
    const conversionRate =
      shown > 0 ? Math.round((contractedCount / shown) * 100) : 0;
    return { shown, contractedCount, nonContractedCount, conversionRate };
  }, [columns, filteredLeads]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Lead Tracker"
        description="Drag a card between columns — or use its quick action — to update the lead's status."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchLeads({ silent: true })}
            disabled={isLoading || isRefreshing}
          >
            <RefreshCw
              className={cn('mr-2 h-4 w-4', isRefreshing && 'animate-spin')}
              aria-hidden="true"
            />
            Refresh
          </Button>
        }
      />

      {/* Totals strip */}
      {!isLoading && !error && leads.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label={hasActiveFilters ? 'Matching leads' : 'Total leads'}
            value={totals.shown}
          />
          <StatTile
            label="Non Contracted"
            value={totals.nonContractedCount}
            accent="--status-non-contracted"
          />
          <StatTile
            label="Contracted"
            value={totals.contractedCount}
            accent="--status-contracted"
          />
          <StatTile label="Conversion" value={`${totals.conversionRate}%`} />
        </div>
      ) : null}

      {/* Filter bar */}
      {!isLoading && !error && leads.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search business, contact, mobile, city, reference…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <Select value={contactedForFilter} onValueChange={setContactedForFilter}>
              <SelectTrigger className="sm:w-[160px]">
                <SelectValue placeholder="Contacted for" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All units</SelectItem>
                {CONTACTED_FOR_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={execFilter} onValueChange={setExecFilter}>
              <SelectTrigger className="sm:w-[180px]">
                <SelectValue placeholder="Assigned to" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Anyone</SelectItem>
                {execOptions.map((exec) => (
                  <SelectItem key={exec.id} value={exec.id}>
                    {exec.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4" />
                Clear
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <BoardSkeleton />
      ) : error ? (
        <EmptyState
          icon={TrendingUp}
          title="Couldn't load the pipeline"
          description={error}
          action={
            <Button variant="outline" size="sm" onClick={() => fetchLeads()}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              Try again
            </Button>
          }
        />
      ) : leads.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No leads yet"
          description="Once leads are created they'll appear here, organised by status."
        />
      ) : filteredLeads.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching leads"
          description="Try adjusting or clearing your filters."
          action={
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {LEAD_STATUSES.map((status) => (
            <StageColumn
              key={status}
              status={status}
              leads={columns[status]}
              onOpen={openLead}
              onMove={moveLead}
              busyId={busyId}
            />
          ))}
        </div>
      )}

      {!isLoading && !error && filteredLeads.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Showing {formatCompactNumber(totals.shown)} lead
          {totals.shown === 1 ? '' : 's'}
          {hasActiveFilters ? ` of ${leads.length}` : ''}. Conversion rate{' '}
          {totals.conversionRate}%.
        </p>
      ) : null}
    </div>
  );
}

export default LeadTrackerPage;
