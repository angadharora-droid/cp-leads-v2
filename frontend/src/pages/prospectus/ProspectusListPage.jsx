import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Download, Eye, FileText, Mail, Search } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { api, getErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { openBlob, saveBlob } from '@/components/enquiries/EnquiryActions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmailSheetDialog, sheetStatus } from '@/components/prospectus/EmailSheetDialog';
import { FunctionsTable, useMakeSheet } from '@/pages/prospectus/ProspectusOverview';

const todayStr = () => format(new Date(), 'yyyy-MM-dd');

/** Sheets already made, with preview / download / email. */
function SheetsTable({ rows, onEmail, onPreview, onDownload, busyId }) {
  const { user } = useAuth();
  const canPrint = ['admin', 'manager'].includes(user?.role);
  if (!rows.length) {
    return (
      <EmptyState
        icon={FileText}
        title="No prospectus sheets yet"
        description="Make one from a confirmed function on the Functions tab."
        size="compact"
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>FP No</TableHead>
            <TableHead>Function date</TableHead>
            <TableHead>Function</TableHead>
            <TableHead>Party</TableHead>
            <TableHead>Venue</TableHead>
            <TableHead className="text-right">Pax</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Made by</TableHead>
            <TableHead className="text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((fp) => {
            const status = sheetStatus(fp);
            return (
              <TableRow key={fp._id}>
                <TableCell>
                  <Link to={`/prospectus/${fp._id}`} className="font-medium text-primary hover:underline">
                    {fp.number}
                  </Link>
                  {fp.revision > 1 ? <p className="text-xs text-muted-foreground">Rev {fp.revision}</p> : null}
                </TableCell>
                <TableCell className="whitespace-nowrap">{fp.dateFrom ? formatDate(fp.dateFrom, 'EEE, d MMM yyyy') : '—'}</TableCell>
                <TableCell>{fp.functionType || '—'}</TableCell>
                <TableCell>
                  <p className="text-foreground">{fp.companyName || fp.partyName || fp.lead?.businessName || '—'}</p>
                  {fp.companyName && fp.partyName ? <p className="text-xs text-muted-foreground">{fp.partyName}</p> : null}
                </TableCell>
                <TableCell className="text-sm">{fp.venue || '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{fp.pax || '—'}</TableCell>
                <TableCell className={cn('text-xs font-medium', status.tone === 'success' ? 'text-success' : status.tone === 'info' ? 'text-info' : 'text-warning')}>
                  {status.label}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{fp.madeByName || '—'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => onPreview(fp)} disabled={!canPrint || fp.status !== 'approved' || busyId === fp._id} aria-label={`Preview ${fp.number}`}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDownload(fp)} disabled={!canPrint || fp.status !== 'approved' || busyId === fp._id} aria-label={`Download ${fp.number}`}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onEmail(fp)} disabled={!canPrint || fp.status !== 'approved'}>
                      <Mail className="h-4 w-4" />
                      Email
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Two lists in one place: every confirmed function (with or without a sheet)
 * and every sheet made, each with its own filters.
 */
export default function ProspectusListPage() {
  const [tab, setTab] = useState('functions');
  const [fnFilters, setFnFilters] = useState({ q: '', from: todayStr(), to: '', status: 'all' });
  const [sheetFilters, setSheetFilters] = useState({ q: '', from: '', to: '' });
  const [functions, setFunctions] = useState(null);
  const [sheets, setSheets] = useState(null);
  const [emailing, setEmailing] = useState(null);
  const [busyId, setBusyId] = useState('');
  const { make, pendingKey } = useMakeSheet();

  const loadFunctions = useCallback(async () => {
    try {
      const params = Object.fromEntries(Object.entries(fnFilters).filter(([, v]) => v && v !== 'all'));
      const res = await api.get('/prospectus/functions', { params });
      setFunctions(res?.data?.data?.functions || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load functions'));
      setFunctions([]);
    }
  }, [fnFilters]);

  const loadSheets = useCallback(async () => {
    try {
      const params = Object.fromEntries(Object.entries(sheetFilters).filter(([, v]) => v));
      const res = await api.get('/prospectus', { params });
      setSheets(res?.data?.data?.prospectuses || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load prospectus sheets'));
      setSheets([]);
    }
  }, [sheetFilters]);

  useEffect(() => {
    const t = setTimeout(loadFunctions, 250);
    return () => clearTimeout(t);
  }, [loadFunctions]);

  useEffect(() => {
    const t = setTimeout(loadSheets, 250);
    return () => clearTimeout(t);
  }, [loadSheets]);

  async function preview(fp) {
    setBusyId(fp._id);
    try {
      const res = await api.get(`/prospectus/${fp._id}/pdf`, { params: { stamp: 0 }, responseType: 'blob' });
      openBlob(res, `Function Prospectus ${fp.number}.pdf`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to open the PDF'));
    } finally {
      setBusyId('');
    }
  }

  async function download(fp) {
    setBusyId(fp._id);
    try {
      const res = await api.get(`/prospectus/${fp._id}/pdf`, { responseType: 'blob' });
      saveBlob(res, `Function Prospectus ${fp.number}.pdf`);
      loadSheets();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to download the PDF'));
    } finally {
      setBusyId('');
    }
  }

  const setFn = (key) => (value) => setFnFilters((f) => ({ ...f, [key]: value }));
  const setSheet = (key) => (value) => setSheetFilters((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Confirmed functions"
        breadcrumbs={[{ label: 'Function Prospectus', to: '/prospectus' }, { label: 'Functions & sheets' }]}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="functions">
            Confirmed functions{functions ? ` (${functions.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="sheets">Prospectus sheets{sheets ? ` (${sheets.length})` : ''}</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'functions' ? (
        <Card>
          <CardContent className="space-y-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                <Label htmlFor="fn-q">Search</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="fn-q" className="pl-9" value={fnFilters.q} onChange={(e) => setFn('q')(e.target.value)} placeholder="Party, function, venue…" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fn-from">From</Label>
                <Input id="fn-from" type="date" value={fnFilters.from} onChange={(e) => setFn('from')(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fn-to">To</Label>
                <Input id="fn-to" type="date" value={fnFilters.to} onChange={(e) => setFn('to')(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fn-status">Show</Label>
                <Select value={fnFilters.status} onValueChange={setFn('status')}>
                  <SelectTrigger id="fn-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All functions</SelectItem>
                    <SelectItem value="pending">Awaiting prospectus</SelectItem>
                    <SelectItem value="made">Prospectus made</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {functions === null ? (
              <Skeleton className="h-40 rounded-lg" />
            ) : (
              <FunctionsTable
                rows={functions}
                onMake={make}
                pendingKey={pendingKey}
                emptyTitle="No confirmed functions"
                emptyDescription="Nothing matches these filters. Clear the dates to see past functions."
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="sh-q">Search</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="sh-q" className="pl-9" value={sheetFilters.q} onChange={(e) => setSheet('q')(e.target.value)} placeholder="FP number, party, venue…" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sh-from">Function date from</Label>
                <Input id="sh-from" type="date" value={sheetFilters.from} onChange={(e) => setSheet('from')(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sh-to">To</Label>
                <Input id="sh-to" type="date" value={sheetFilters.to} onChange={(e) => setSheet('to')(e.target.value)} />
              </div>
            </div>
            {sheets === null ? (
              <Skeleton className="h-40 rounded-lg" />
            ) : (
              <SheetsTable rows={sheets} onEmail={setEmailing} onPreview={preview} onDownload={download} busyId={busyId} />
            )}
          </CardContent>
        </Card>
      )}

      <EmailSheetDialog
        open={Boolean(emailing)}
        onOpenChange={(open) => !open && setEmailing(null)}
        sheet={emailing || {}}
        onDone={() => loadSheets()}
      />
    </div>
  );
}
