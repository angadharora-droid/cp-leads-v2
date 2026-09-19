import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  BedDouble,
  Building2,
  CalendarDays,
  Eye,
  EyeOff,
  KanbanSquare,
  MapPin,
  Plus,
  Search,
  User,
  Users,
} from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { ENQUIRY_STAGES, stageInfo, isDatePassed } from '@/lib/enquiryStages';
import { BoardFilters, FilterToggle, activeFilterCount } from '@/components/BoardFilters';
import { fnVenues, fnSessions } from '@/lib/banquetFunctions';
import { departmentLabel, isIndividual } from '@/lib/departments';
import {
  fnLabel,
  fnVenueNames,
  fnSessionNames,
  fnAmountLabel,
} from '@/lib/banquetFunctions';

import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import EnquiryDialog from '@/components/enquiries/EnquiryDialog';
import LeadPickerDialog from '@/components/leads/LeadPickerDialog';
import { KanbanBoard, KanbanCard } from '@/components/KanbanBoard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Older enquiries stored the amount as free text; format it when it is a plain number. */
function prettyAmount(value) {
  const digits = String(value || '').replace(/[,\s]/g, '');
  if (/^\d+(\.\d+)?$/.test(digits)) return `Rs. ${Number(digits).toLocaleString('en-IN')}`;
  return value;
}

function roomDate(value) {
  if (!value) return '—';
  try {
    return format(new Date(value), 'd MMM yyyy');
  } catch {
    return value;
  }
}

/** One enquiry on the board: who, which department, what, when, where. */
function EnquiryCard({ enquiry, onOpen }) {
  const lead = enquiry.lead && typeof enquiry.lead === 'object' ? enquiry.lead : null;
  const firstFn = enquiry.functions?.[0];
  const room = enquiry.kind !== 'banquet' ? enquiry.room : null;
  const dept = departmentLabel(lead, enquiry.department);
  const Icon = isIndividual(lead) ? User : Building2;
  const info = stageInfo(enquiry.stage);
  return (
    <KanbanCard onClick={onOpen} aria-label={`${lead?.businessName || 'Lead'} — ${info.label}`}>
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: `${info.color}1f`, color: info.color }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {lead?.businessName || 'Lead'}
          </p>
          {dept ? <p className="truncate text-xs font-medium text-primary">{dept}</p> : null}
        </div>
      </div>
      {enquiry.stage === 'waitlist' || enquiry.waitlist?.freedAt || isDatePassed(enquiry) ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {enquiry.stage === 'waitlist' ? (
            <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
              Held by {enquiry.waitlist?.heldByName || 'another enquiry'}
            </span>
          ) : null}
          {enquiry.stage !== 'waitlist' && enquiry.waitlist?.freedAt && !['won', 'lost', 'cancelled'].includes(enquiry.stage) ? (
            <span className="rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
              Slot now free
            </span>
          ) : null}
          {isDatePassed(enquiry) ? (
            <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
              Date passed
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2 space-y-1 border-t pt-2">
        {firstFn ? (
          <>
            <p className="truncate text-sm text-foreground">{fnLabel(firstFn)}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3 w-3 shrink-0" />
              <span className="truncate tabular-nums">
                {firstFn.date ? format(new Date(firstFn.date), 'd MMM yyyy') : '—'}
                {fnSessionNames(firstFn) ? ` · ${fnSessionNames(firstFn)}` : ''}
              </span>
            </p>
            {fnVenueNames(firstFn) ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{fnVenueNames(firstFn)}</span>
              </p>
            ) : null}
            {enquiry.functions.length > 1 ? (
              <p className="text-xs text-muted-foreground">
                +{enquiry.functions.length - 1} more function
                {enquiry.functions.length > 2 ? 's' : ''}
              </p>
            ) : null}
          </>
        ) : !room ? (
          <p className="text-sm text-muted-foreground">No functions</p>
        ) : null}
        {room ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <BedDouble className="h-3 w-3 shrink-0" />
            <span className="truncate tabular-nums">
              {roomDate(room.checkIn)} → {roomDate(room.checkOut)}
              {room.rooms ? ` · ${room.rooms} rooms` : ''}
            </span>
          </p>
        ) : null}
      </div>

      {firstFn?.pax || enquiry.estimatedRevenue ? (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          {firstFn?.pax ? (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Users className="h-3 w-3" />
              {firstFn.pax} pax
            </span>
          ) : (
            <span />
          )}
          {fnAmountLabel(firstFn) || enquiry.estimatedRevenue ? (
            <span className="font-medium tabular-nums text-foreground">
              {fnAmountLabel(firstFn) || prettyAmount(enquiry.estimatedRevenue)}
            </span>
          ) : null}
        </div>
      ) : null}
    </KanbanCard>
  );
}

/**
 * The enquiry pipeline board — one column per stage. Cards move on their own
 * as actions happen (generate → email proposal → email contract); Won and
 * Lost are the manual moves, done from the enquiry itself.
 */
const EMPTY_FILTERS = { venue: '', session: '', functionType: '', kind: '', assignedTo: '', from: '', to: '' };

function dateKey(value) {
  if (!value) return '';
  try {
    return format(new Date(value), 'yyyy-MM-dd');
  } catch {
    return '';
  }
}

export default function EnquiriesBoardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [enquiries, setEnquiries] = useState(null);
  const [q, setQ] = useState('');
  const [showLost, setShowLost] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [enquiryLead, setEnquiryLead] = useState(null);
  const [config, setConfig] = useState({ venues: [], sessions: [] });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [execs, setExecs] = useState([]);

  // Executives for the admin "Assigned to" filter.
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

  // Venue/session config for the enquiry dialog opened from this page.
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/banquet/config');
        setConfig(res?.data?.data || { venues: [], sessions: [] });
      } catch {
        // Dialog shows its own "no venues/sessions" notice.
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/enquiries', { params: q ? { q } : {} });
      setEnquiries(res?.data?.data?.enquiries || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load enquiries'));
      setEnquiries([]);
    } finally {
      setIsLoading(false);
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  // Client-side filters over the loaded board (functions are populated).
  const filtered = useMemo(() => {
    const f = filters;
    const needsFn = f.venue || f.session || f.functionType || f.from || f.to;
    const fnMatch = (fn) => {
      if (f.venue && !fnVenues(fn).some((v) => String(v?._id || v) === f.venue)) return false;
      if (f.session && !fnSessions(fn).some((s) => String(s?._id || s) === f.session)) return false;
      if (f.functionType && String(fn.functionType?._id || fn.functionType || '') !== f.functionType) return false;
      const key = dateKey(fn.date);
      if (f.from && (!key || key < f.from)) return false;
      if (f.to && (!key || key > f.to)) return false;
      return true;
    };
    return (enquiries || []).filter((e) => {
      if (f.kind && e.kind !== f.kind) return false;
      if (f.assignedTo) {
        const owner = e.lead?.assignedTo;
        if (String(owner?._id || owner || '') !== f.assignedTo) return false;
      }
      if (needsFn && !(e.functions || []).some(fnMatch)) return false;
      return true;
    });
  }, [enquiries, filters]);

  // Each column header carries the total value proposed in that stage.
  const columns = useMemo(() => {
    const stages = ENQUIRY_STAGES.filter((s) => showLost || !['lost', 'cancelled'].includes(s.key));
    const enquiryValue = (e) =>
      (e.functions || []).reduce((sum, fn) => sum + (Number(fn.proposedRate ?? fn.rackRate) || 0), 0);
    return stages.map((stage) => {
      const items = filtered.filter((e) => e.stage === stage.key);
      const value = items.reduce((sum, e) => sum + enquiryValue(e), 0);
      return {
        ...stage,
        items,
        subtitle: value ? `Rs. ${value.toLocaleString('en-IN')}` : '',
      };
    });
  }, [filtered, showLost]);

  const active = filtered.filter((e) => !['lost', 'cancelled'].includes(e.stage)).length;
  const won = filtered.filter((e) => e.stage === 'won').length;
  const awaiting = filtered.filter((e) => ['waitlist', 'provisional'].includes(e.stage)).length;
  const filterCount = activeFilterCount(filters);

  const filterFields = [
    {
      key: 'venue',
      label: 'Venue',
      options: (config.venues || []).map((v) => ({ value: v._id, label: v.name })),
      placeholder: 'Any venue',
    },
    {
      key: 'session',
      label: 'Session',
      options: (config.sessions || []).map((s) => ({ value: s._id, label: s.name })),
      placeholder: 'Any session',
    },
    {
      key: 'functionType',
      label: 'Function type',
      options: (config.functionTypes || []).map((t) => ({ value: t._id, label: t.name })),
      placeholder: 'Any type',
    },
    {
      key: 'kind',
      label: 'Enquiry for',
      options: [
        { value: 'banquet', label: 'Banquet' },
        { value: 'room', label: 'Rooms' },
        { value: 'both', label: 'Banquet + Rooms' },
      ],
      placeholder: 'Anything',
    },
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
    { key: 'from', label: 'Function from', type: 'date' },
    { key: 'to', label: 'Function to', type: 'date', min: filters.from || undefined },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Enquiries" />

      {/* One toolbar row: search, live counts, then the actions. */}
      <div className="workspace-toolbar">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by business name…"
            className="pl-9"
            aria-label="Search enquiries by business name"
          />
        </div>
        {enquiries ? (
          <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground md:flex">
            <span>
              <span className="font-semibold tabular-nums text-foreground">{active}</span> active
            </span>
            <span>
              <span className="font-semibold tabular-nums text-foreground">{awaiting}</span> awaiting client
            </span>
            <span>
              <span className="font-semibold tabular-nums text-success">{won}</span> won
            </span>
          </div>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <FilterToggle open={filtersOpen} count={filterCount} onClick={() => setFiltersOpen((v) => !v)} />
          <Button variant="outline" size="sm" onClick={() => setShowLost((v) => !v)}>
            {showLost ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showLost ? 'Hide lost & cancelled' : 'Show lost & cancelled'}
          </Button>
          <Button size="sm" onClick={() => setPickerOpen(true)}>
            <Plus className="h-4 w-4" />
            New enquiry
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

      {enquiries === null ? (
        <KanbanBoard loading columns={columns} renderCard={() => null} />
      ) : filtered.length === 0 && filterCount ? (
        <EmptyState
          icon={KanbanSquare}
          title="No enquiries match these filters"
          description="Loosen a filter or clear them all to see the full board."
          action={
            <Button variant="outline" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear filters
            </Button>
          }
        />
      ) : enquiries.length === 0 ? (
        <EmptyState
          icon={KanbanSquare}
          title={q ? `No enquiries match “${q}”` : 'No enquiries yet'}
          description={
            q
              ? 'Try another company name or clear the search.'
              : 'Create an enquiry from a lead’s page or with the button above — it will appear here and on the banquet calendar.'
          }
          action={
            q ? (
              <Button variant="outline" size="sm" onClick={() => setQ('')}>
                Clear search
              </Button>
            ) : (
              <Button size="sm" onClick={() => setPickerOpen(true)}>
                <Plus className="h-4 w-4" />
                New enquiry
              </Button>
            )
          }
        />
      ) : (
        <KanbanBoard
          columns={columns}
          renderCard={(enquiry) => (
            <EnquiryCard
              enquiry={enquiry}
              onOpen={() => navigate(`/enquiries/${enquiry._id}`)}
            />
          )}
        />
      )}

      <LeadPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="New enquiry — pick the lead"
        description="Every enquiry belongs to a lead (a company department or an individual). Search below; if it is not listed yet, create the lead first and then work on its enquiries."
        onPick={(lead) => {
          setPickerOpen(false);
          setEnquiryLead(lead);
        }}
      />
      {enquiryLead ? (
        <EnquiryDialog
          open
          onOpenChange={(open) => {
            if (!open) setEnquiryLead(null);
          }}
          lead={enquiryLead}
          enquiry={null}
          config={config}
          onLeadUpdated={(next) => next && setEnquiryLead(next)}
          onSaved={() => {
            setEnquiryLead(null);
            load();
          }}
        />
      ) : null}
    </div>
  );
}
