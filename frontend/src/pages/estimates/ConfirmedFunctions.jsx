import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, getErrorMessage } from '@/lib/api';
import { FunctionsTable } from '@/pages/prospectus/ProspectusOverview';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

export default function ConfirmedFunctions() {
  const [filters, setFilters] = useState({ q: '', from: '', to: '' });
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setRows(null);
      try {
        // An empty date range includes historical confirmed functions.
        const params = { ...filters, from: filters.from || '1900-01-01' };
        if (!params.to) delete params.to;
        const res = await api.get('/estimates/confirmed', { params });
        if (active) setRows(res.data.data.functions);
      } catch (err) {
        if (active) { setRows([]); toast.error(getErrorMessage(err, 'Failed to load confirmed functions')); }
      }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [filters]);
  return <div className="space-y-4 rounded-xl border bg-card p-4">
    <div className="grid gap-3 sm:grid-cols-3">
      {['q', 'from', 'to'].map((key) => <div key={key} className="space-y-1.5">
        <Label htmlFor={`confirmed-${key}`}>{key === 'q' ? 'Search confirmed functions' : key === 'from' ? 'From' : 'To'}</Label>
        <Input id={`confirmed-${key}`} type={key === 'q' ? 'search' : 'date'} value={filters[key]}
          onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))} />
      </div>)}
    </div>
    {rows === null ? <Skeleton className="h-40" /> : <FunctionsTable rows={rows} accountsView
      emptyTitle="No confirmed functions" emptyDescription="No confirmed functions match these filters." />}
  </div>;
}
