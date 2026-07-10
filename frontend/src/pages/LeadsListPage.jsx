import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, X, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { toast } from 'sonner';

import api, { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/format';

import { PageHeader } from '@/components/PageHeader';
import { StatusBadge, LEAD_STATUSES } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
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

/**
 * Leads list: filter bar + paginated, responsive table.
 * Filters and pagination are mirrored to the URL query string so the view is
 * shareable and survives refreshes/back-navigation.
 */
function LeadsListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [searchParams, setSearchParams] = useSearchParams();

  // Derive the active filters from the URL (single source of truth).
  const filters = useMemo(
    () => ({
      status: searchParams.get('status') || '',
      city: searchParams.get('city') || '',
      businessType: searchParams.get('businessType') || '',
      assignedTo: searchParams.get('assignedTo') || '',
      q: searchParams.get('q') || '',
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

  // Keep local inputs in sync if the URL changes externally (e.g. back button).
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
            if (key !== 'page') touchedFilter = true;
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
        const res = await api.get('/users', { params: { role: 'sales_exec' } });
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
    const params = {
      page: filters.page,
      limit: filters.limit,
    };
    if (filters.status) params.status = filters.status;
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
    filters.status,
    filters.city,
    filters.businessType,
    filters.q,
    filters.assignedTo,
    isAdmin,
  ]);

  const totalPages = Math.max(1, Math.ceil(total / filters.limit));
  const from = total === 0 ? 0 : (filters.page - 1) * filters.limit + 1;
  const to = Math.min(filters.page * filters.limit, total);

  const hasActiveFilters =
    !!filters.status ||
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

  const goToPage = (page) => {
    const clamped = Math.min(Math.max(1, page), totalPages);
    updateParams({ page: clamped });
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

  return (
    <div className="space-y-5">
      <PageHeader
        title="Leads"
        description="Browse, filter, and manage your sales pipeline."
        actions={
          <Button onClick={() => navigate('/leads/new')}>
            <Plus className="h-4 w-4" />
            New Lead
          </Button>
        }
      />

      {/* Filter bar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
            <div className="space-y-1.5 lg:col-span-4">
              <Label htmlFor="lead-search">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="lead-search"
                  className="pl-9"
                  placeholder="Name, contact, mobile, email, reference…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="lead-status">Status</Label>
              <Select
                value={filters.status || ALL}
                onValueChange={(value) =>
                  updateParams({ status: value === ALL ? '' : value })
                }
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
                placeholder="City"
                value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
              />
            </div>

            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="lead-type">Business type</Label>
              <Input
                id="lead-type"
                placeholder="Type"
                value={typeInput}
                onChange={(e) => setTypeInput(e.target.value)}
              />
            </div>

            {isAdmin ? (
              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor="lead-assignee">Assigned to</Label>
                <Select
                  value={filters.assignedTo || ALL}
                  onValueChange={(value) =>
                    updateParams({ assignedTo: value === ALL ? '' : value })
                  }
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
            ) : null}
          </div>

          {hasActiveFilters ? (
            <div className="mt-3 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
                Filters applied
              </p>
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4" />
                Clear
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Business</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Status</TableHead>
                {isAdmin ? <TableHead>Assigned</TableHead> : null}
                <TableHead>Lead date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
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
                      className="border-0"
                      title={
                        hasActiveFilters ? 'No matching leads' : 'No leads yet'
                      }
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
                            New Lead
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
                    <TableCell className="font-mono text-xs font-medium text-foreground">
                      {lead.reference || '—'}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-foreground">
                        {lead.businessName || '—'}
                      </div>
                      {lead.businessType ? (
                        <div className="text-xs text-muted-foreground">
                          {lead.businessType}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="text-foreground">
                        {lead.contactPerson || '—'}
                      </div>
                      {lead.mobile ? (
                        <div className="text-xs text-muted-foreground">
                          {lead.mobile}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>{lead.city || '—'}</TableCell>
                    <TableCell>
                      <StatusBadge status={lead.status} />
                    </TableCell>
                    {isAdmin ? (
                      <TableCell className="text-sm text-muted-foreground">
                        {execName(lead.assignedTo)}
                      </TableCell>
                    ) : null}
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDate(lead.leadDate)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {!loading && total > 0 ? (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{from}</span>–
            <span className="font-medium text-foreground">{to}</span> of{' '}
            <span className="font-medium text-foreground">{total}</span> leads
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page <= 1}
              onClick={() => goToPage(filters.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="px-2 text-sm text-muted-foreground">
              Page {filters.page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page >= totalPages}
              onClick={() => goToPage(filters.page + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { LeadsListPage };
export default LeadsListPage;
