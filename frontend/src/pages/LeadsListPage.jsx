import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  ChevronRight,
  Filter,
  MapPin,
  Phone,
  Plus,
  Search,
  User,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import api, { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/format';
import { isIndividual } from '@/lib/departments';

import { PageHeader } from '@/components/PageHeader';
import { StatusBadge, LEAD_STATUSES } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { Pagination } from '@/components/Pagination';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

const ALL = '__all__';
const DEFAULT_LIMIT = 20;
const DEFAULT_SORT = '-createdAt';

const TYPE_OPTIONS = [
  { value: ALL, label: 'All types' },
  { value: 'company', label: 'Companies' },
  { value: 'individual', label: 'Individuals' },
];

/** Clickable column header that cycles asc → desc for `field`. */
function SortHead({ field, sort, onSort, children, className }) {
  const active = sort === field || sort === `-${field}`;
  const desc = sort === `-${field}`;
  const Icon = !active ? ArrowUpDown : desc ? ArrowDown : ArrowUp;
  return (
    <TableHead className={className} aria-sort={active ? (desc ? 'descending' : 'ascending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(active && !desc ? `-${field}` : field)}
        className={cn(
          'inline-flex h-8 items-center gap-1 rounded-sm px-1 -mx-1 text-[11px] font-semibold uppercase tracking-wider transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          active ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {children}
        <Icon className={cn('h-3.5 w-3.5', active ? 'text-primary' : 'text-muted-foreground/60')} />
      </button>
    </TableHead>
  );
}

/** Company / individual glyph. */
function TypeIcon({ lead, className }) {
  const Icon = isIndividual(lead) ? User : Building2;
  return (
    <span
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary',
        className
      )}
      title={isIndividual(lead) ? 'Individual' : 'Company'}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

/** Secondary line under the lead name. */
function leadSubline(lead) {
  if (isIndividual(lead)) return 'Individual';
  const parts = [];
  if (lead.businessType) parts.push(lead.businessType);
  const n = (lead.departments || []).length;
  if (n) parts.push(`${n} department${n > 1 ? 's' : ''}`);
  return parts.join(' · ') || 'Company';
}

/**
 * Leads list: filter bar + sortable, paginated table (card list on phones).
 * Filters, sort and pagination live in the URL query string so the view is
 * shareable and survives refreshes/back-navigation.
 */
function LeadsListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = ['admin', 'manager'].includes(user?.role);

  const [searchParams, setSearchParams] = useSearchParams();

  // Derive the active filters from the URL (single source of truth).
  const filters = useMemo(
    () => ({
      status: searchParams.get('status') || '',
      leadType: searchParams.get('leadType') || '',
      city: searchParams.get('city') || '',
      businessType: searchParams.get('businessType') || '',
      assignedTo: searchParams.get('assignedTo') || '',
      q: searchParams.get('q') || '',
      sort: searchParams.get('sort') || DEFAULT_SORT,
      page: Math.max(1, Number(searchParams.get('page')) || 1),
      limit: Math.max(1, Number(searchParams.get('limit')) || DEFAULT_LIMIT),
    }),
    [searchParams]
  );

  // Local, debounced copies for the free-text inputs.
  const [cityInput, setCityInput] = useState(filters.city);
  const [typeInput, setTypeInput] = useState(filters.businessType);
  const [searchInput, setSearchInput] = useState(filters.q);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [execs, setExecs] = useState([]);

  useEffect(() => {
    setCityInput(filters.city);
    setTypeInput(filters.businessType);
    setSearchInput(filters.q);
  }, [filters.city, filters.businessType, filters.q]);

  /**
   * Merge a patch into the URL query. Any change to a filter resets the page
   * back to 1 unless the patch itself sets a page.
   */
  const updateParams = useCallback(
    (patch) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          let touchedFilter = false;
          Object.entries(patch).forEach(([key, value]) => {
            if (key !== 'page' && key !== 'limit' && key !== 'sort') touchedFilter = true;
            if (value === '' || value == null) next.delete(key);
            else next.set(key, String(value));
          });
          if (touchedFilter && !('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // Debounce the free-text inputs into the URL.
  const debounceRef = useRef();
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (
        cityInput !== filters.city ||
        typeInput !== filters.businessType ||
        searchInput !== filters.q
      ) {
        updateParams({
          city: cityInput.trim(),
          businessType: typeInput.trim(),
          q: searchInput.trim(),
        });
      }
    }, 350);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityInput, typeInput, searchInput]);

  // Load executive options for the admin assignee filter.
  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    (async () => {
      try {
        const res = await api.get('/leads/assignees');
        const payload = res?.data?.data;
        const list = Array.isArray(payload) ? payload : payload?.items ?? [];
        if (active) setExecs(list);
      } catch {
        // Non-fatal: the assignee filter simply won't have options.
      }
    })();
    return () => {
      active = false;
    };
  }, [isAdmin]);

  // Fetch the leads page whenever the effective filters change.
  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = { page: filters.page, limit: filters.limit, sort: filters.sort };
    if (filters.status) params.status = filters.status;
    if (filters.leadType) params.leadType = filters.leadType;
    if (filters.city) params.city = filters.city;
    if (filters.businessType) params.businessType = filters.businessType;
    if (filters.q) params.q = filters.q;
    if (isAdmin && filters.assignedTo) params.assignedTo = filters.assignedTo;

    (async () => {
      try {
        const res = await api.get('/leads', { params });
        const data = res?.data?.data ?? {};
        if (!active) return;
        setItems(Array.isArray(data.items) ? data.items : []);
        setTotal(Number(data.total) || 0);
      } catch (error) {
        if (active) {
          setItems([]);
          setTotal(0);
          toast.error(getErrorMessage(error, 'Failed to load leads'));
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [
    filters.page,
    filters.limit,
    filters.sort,
    filters.status,
    filters.leadType,
    filters.city,
    filters.businessType,
    filters.q,
    filters.assignedTo,
    isAdmin,
  ]);

  const hasActiveFilters =
    !!filters.status ||
    !!filters.leadType ||
    !!filters.city ||
    !!filters.businessType ||
    !!filters.q ||
    !!filters.assignedTo;

  const clearFilters = () => {
    setCityInput('');
    setTypeInput('');
    setSearchInput('');
    setSearchParams({}, { replace: true });
  };

  const execName = (assignedTo) => {
    if (!assignedTo) return 'Unassigned';
    if (typeof assignedTo === 'object') {
      return assignedTo.name || assignedTo.email || 'Unassigned';
    }
    const match = execs.find((e) => e._id === assignedTo);
    return match?.name || 'Assigned';
  };

  const colSpan = isAdmin ? 7 : 6;
  const setSort = (sort) => updateParams({ sort });

  return (
    <div className="space-y-5">
      {/* "New lead" lives in the top bar on every page, so the header here
          carries the heading for screen readers only. */}
      <PageHeader title="Leads" />

      {/* Filter bar */}
      <Card>
        <CardContent className="p-4 sm:p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
              <Label htmlFor="lead-search">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="lead-search"
                  className="pl-9 pr-9"
                  placeholder="Name, contact, mobile, email, reference…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
                {searchInput ? (
                  <button
                    type="button"
                    onClick={() => setSearchInput('')}
                    className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="lead-type-filter">Type</Label>
              <Select
                value={filters.leadType || ALL}
                onValueChange={(value) => updateParams({ leadType: value === ALL ? '' : value })}
              >
                <SelectTrigger id="lead-type-filter">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="lead-status">Status</Label>
              <Select
                value={filters.status || ALL}
                onValueChange={(value) => updateParams({ status: value === ALL ? '' : value })}
              >
                <SelectTrigger id="lead-status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {LEAD_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="lead-city">City</Label>
              <Input
                id="lead-city"
                placeholder="Any city"
                value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
              />
            </div>

            {isAdmin ? (
              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor="lead-assignee">Assigned to</Label>
                <Select
                  value={filters.assignedTo || ALL}
                  onValueChange={(value) => updateParams({ assignedTo: value === ALL ? '' : value })}
                >
                  <SelectTrigger id="lead-assignee">
                    <SelectValue placeholder="Anyone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Anyone</SelectItem>
                    {execs.map((e) => (
                      <SelectItem key={e._id} value={e._id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor="lead-type">Business type</Label>
                <Input
                  id="lead-type"
                  placeholder="Any type"
                  value={typeInput}
                  onChange={(e) => setTypeInput(e.target.value)}
                />
              </div>
            )}
          </div>

          {hasActiveFilters ? (
            <div className="mt-3 flex items-center justify-between border-t pt-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
                Filters applied ·{' '}
                <span className="font-medium tabular-nums text-foreground">{total}</span> match
                {total === 1 ? '' : 'es'}
              </p>
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4" />
                Clear
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Phone: card list */}
      <div className="space-y-2 md:hidden">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
        ) : items.length === 0 ? (
          <EmptyState
            title={hasActiveFilters ? 'No matching leads' : 'No leads yet'}
            description={
              hasActiveFilters
                ? 'Try adjusting or clearing your filters.'
                : 'Create your first lead to start tracking the pipeline.'
            }
            action={
              hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Button size="sm" onClick={() => navigate('/leads/new')}>
                  <Plus className="h-4 w-4" />
                  New lead
                </Button>
              )
            }
          />
        ) : (
          items.map((lead) => (
            <Link
              key={lead._id}
              to={`/leads/${lead._id}`}
              className="surface-interactive flex items-center gap-3 rounded-xl border bg-card p-3 shadow-card"
            >
              <TypeIcon lead={lead} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {lead.businessName || '—'}
                  </span>
                  <StatusBadge status={lead.status} />
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  <span className="font-mono">{lead.reference}</span> · {leadSubline(lead)}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {lead.contactPerson && !isIndividual(lead) ? <span>{lead.contactPerson}</span> : null}
                  {lead.mobile ? (
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Phone className="h-3 w-3" />
                      {lead.mobile}
                    </span>
                  ) : null}
                  {lead.city ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {lead.city}
                    </span>
                  ) : null}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))
        )}
      </div>

      {/* Tablet & desktop: table */}
      <Card className="hidden md:block">
        <CardContent className="p-0 sm:p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortHead field="reference" sort={filters.sort} onSort={setSort}>
                  Reference
                </SortHead>
                <SortHead field="businessName" sort={filters.sort} onSort={setSort}>
                  Lead
                </SortHead>
                <TableHead>Contact</TableHead>
                <TableHead className="hidden lg:table-cell">City</TableHead>
                <SortHead field="status" sort={filters.sort} onSort={setSort}>
                  Status
                </SortHead>
                {isAdmin ? <TableHead className="hidden lg:table-cell">Assigned</TableHead> : null}
                <SortHead field="leadDate" sort={filters.sort} onSort={setSort} className="text-right">
                  Lead date
                </SortHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`sk-${i}`} className="hover:bg-transparent">
                    {Array.from({ length: colSpan }).map((__, j) => (
                      <TableCell key={`sk-${i}-${j}`}>
                        <Skeleton className="h-4 w-full max-w-[140px]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={colSpan} className="p-0">
                    <EmptyState
                      className="rounded-none border-0"
                      title={hasActiveFilters ? 'No matching leads' : 'No leads yet'}
                      description={
                        hasActiveFilters
                          ? 'Try adjusting or clearing your filters.'
                          : 'Create your first lead to start tracking the pipeline.'
                      }
                      action={
                        hasActiveFilters ? (
                          <Button variant="outline" size="sm" onClick={clearFilters}>
                            Clear filters
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => navigate('/leads/new')}>
                            <Plus className="h-4 w-4" />
                            New lead
                          </Button>
                        )
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                items.map((lead) => (
                  <TableRow
                    key={lead._id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/leads/${lead._id}`)}
                  >
                    <TableCell className="whitespace-nowrap font-mono text-xs font-medium">
                      <Link
                        to={`/leads/${lead._id}`}
                        className="rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {lead.reference || '—'}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <TypeIcon lead={lead} />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">
                            {lead.businessName || '—'}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{leadSubline(lead)}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-foreground">
                        {isIndividual(lead) ? lead.mobile || '—' : lead.contactPerson || '—'}
                      </div>
                      {!isIndividual(lead) && lead.mobile ? (
                        <div className="text-xs tabular-nums text-muted-foreground">{lead.mobile}</div>
                      ) : isIndividual(lead) && lead.email ? (
                        <div className="text-xs text-muted-foreground">{lead.email}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{lead.city || '—'}</TableCell>
                    <TableCell>
                      <StatusBadge status={lead.status} />
                    </TableCell>
                    {isAdmin ? (
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                        {execName(lead.assignedTo)}
                      </TableCell>
                    ) : null}
                    <TableCell className="whitespace-nowrap text-right text-sm tabular-nums text-muted-foreground">
                      {formatDate(lead.leadDate)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {!loading && total > 0 ? (
        <Pagination
          page={filters.page}
          limit={filters.limit}
          total={total}
          noun="leads"
          onPageChange={(page) => updateParams({ page })}
          onLimitChange={(limit) => updateParams({ limit, page: 1 })}
        />
      ) : null}
    </div>
  );
}

export { LeadsListPage };
export default LeadsListPage;
