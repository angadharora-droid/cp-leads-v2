import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, Inbox, Link2, MapPin, Phone, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';

import api, { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { Pagination } from '@/components/Pagination';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

const DEFAULT_LIMIT = 20;

/**
 * Leads section: people not yet linked to a company or individual. Linking a
 * lead moves it to Companies & Individuals, so this list only ever holds
 * the ones still waiting.
 */
function ProspectsListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isManager = ['admin', 'manager'].includes(user?.role);
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.max(1, Number(searchParams.get('limit')) || DEFAULT_LIMIT);
  const q = searchParams.get('q') || '';
  const requested = searchParams.get('requested') === '1';

  const [searchInput, setSearchInput] = useState(q);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  function setParams(patch) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        Object.entries(patch).forEach(([k, v]) => (v === '' || v == null ? next.delete(k) : next.set(k, String(v))));
        return next;
      },
      { replace: true }
    );
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput.trim() !== q) setParams({ q: searchInput.trim(), page: '' });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .get('/prospects', { params: { page, limit, ...(q ? { q } : {}), ...(requested ? { requested: '1' } : {}) } })
      .then((res) => {
        if (!active) return;
        setItems(res?.data?.data?.items || []);
        setTotal(Number(res?.data?.data?.total) || 0);
      })
      .catch((err) => {
        if (!active) return;
        setItems([]);
        setTotal(0);
        toast.error(getErrorMessage(err, 'Failed to load leads'));
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [page, limit, q, requested]);

  const empty = (
    <EmptyState
      icon={Inbox}
      title={q ? 'No matching leads' : 'No leads waiting'}
      description={
        q
          ? 'Try a different name, phone or email.'
          : 'Every lead has been linked to a company or individual. New leads appear here until they are linked.'
      }
      action={
        q ? (
          <Button variant="outline" size="sm" onClick={() => setSearchInput('')}>
            Clear search
          </Button>
        ) : (
          <Button size="sm" onClick={() => navigate('/prospects/new')}>
            <Plus className="h-4 w-4" />
            New lead
          </Button>
        )
      }
    />
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Leads" />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4 sm:p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search leads"
              className="pl-9 pr-9"
              placeholder="Name, mobile, email, city…"
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
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-primary"
              checked={requested}
              onChange={(e) => setParams({ requested: e.target.checked ? '1' : '', page: '' })}
            />
            {isManager ? 'Company requests only' : 'Waiting on a company request'}
          </label>
          <p className="text-xs text-muted-foreground">
            Waiting to be linked · <span className="font-medium tabular-nums text-foreground">{total}</span>
          </p>
        </CardContent>
      </Card>

      {/* Phone: card list */}
      <div className="space-y-2 md:hidden">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
          : items.length === 0
            ? empty
            : items.map((p) => (
                <Link
                  key={p._id}
                  to={`/prospects/${p._id}`}
                  className="surface-interactive flex items-center gap-3 rounded-xl border bg-card p-3 shadow-card"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {p.name}
                        {p.companyRequest?.requestedAt ? (
                          <span className="block text-xs font-normal text-amber-600 dark:text-amber-400">
                            Company requested: {p.companyRequest.businessName}
                          </span>
                        ) : null}
                      </span>
                      <StatusBadge status={p.status} />
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {p.mobile ? (
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Phone className="h-3 w-3" />
                          {p.mobile}
                        </span>
                      ) : null}
                      {p.city ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {p.city}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
      </div>

      {/* Tablet & desktop: table */}
      <Card className="hidden md:block">
        <CardContent className="p-0 sm:p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="hidden lg:table-cell">City</TableHead>
                <TableHead>Contacted for</TableHead>
                <TableHead>Status</TableHead>
                {isManager ? <TableHead className="hidden lg:table-cell">Assigned</TableHead> : null}
                <TableHead className="text-right">Created</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    {Array.from({ length: isManager ? 8 : 7 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full max-w-[140px]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={isManager ? 8 : 7} className="p-0">
                    {empty}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((p) => (
                  <TableRow key={p._id} className="cursor-pointer" onClick={() => navigate(`/prospects/${p._id}`)}>
                    <TableCell className="font-medium text-foreground">
                      {p.name}
                      {p.companyRequest?.requestedAt ? (
                        <span className="mt-0.5 block text-xs font-normal text-amber-600 dark:text-amber-400">
                          Company requested: {p.companyRequest.businessName}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="tabular-nums text-foreground">{p.mobile || '—'}</div>
                      {p.email ? <div className="text-xs text-muted-foreground">{p.email}</div> : null}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{p.city || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {(p.contactedFor || []).join(', ') || '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={p.status} />
                    </TableCell>
                    {isManager ? (
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                        {p.assignedTo?.name || 'Unassigned'}
                      </TableCell>
                    ) : null}
                    <TableCell className="whitespace-nowrap text-right text-sm tabular-nums text-muted-foreground">
                      {formatDate(p.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/prospects/${p._id}`);
                        }}
                      >
                        <Link2 className="h-4 w-4" />
                        {p.companyRequest?.requestedAt && isManager ? 'Register' : 'Link'}
                      </Button>
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
          page={page}
          limit={limit}
          total={total}
          noun="leads"
          onPageChange={(p) => setParams({ page: p })}
          onLimitChange={(l) => setParams({ limit: l, page: '' })}
        />
      ) : null}
    </div>
  );
}

export { ProspectsListPage };
export default ProspectsListPage;
