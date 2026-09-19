import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Download, Eye, Mail, Receipt, Search } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import ConfirmedFunctions from './ConfirmedFunctions';
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
import { EmailEstimateDialog, estimateStatus } from '@/components/estimates/EmailEstimateDialog';
import { SheetsTable, useRaiseEstimate } from '@/pages/estimates/EstimatesOverview';

const todayStr = () => format(new Date(), 'yyyy-MM-dd');

/** Estimates already raised, with preview / download / email. */
function EstimatesTable({ rows, onEmail, onPreview, onDownload, busyId }) {
  if (!rows.length) {
    return (
      <EmptyState
        icon={Receipt}
        title="No estimates yet"
        description="Raise one from a prospectus sheet on the Sheets tab."
        size="compact"
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Estimate</TableHead>
            <TableHead>Function date</TableHead>
            <TableHead>Function</TableHead>
            <TableHead>Billing name</TableHead>
            <TableHead className="text-right">Plates</TableHead>
            <TableHead className="text-right">Per plate</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Raised by</TableHead>
            <TableHead className="text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((est) => {
            const status = estimateStatus(est);
            return (
              <TableRow key={est._id}>
                <TableCell>
                  <Link to={`/estimates/${est._id}`} className="font-medium text-primary hover:underline">
                    No. {est.number}
                  </Link>
                  {est.prospectus?.number ? <p className="text-xs text-muted-foreground">FP {est.prospectus.number}</p> : null}
                </TableCell>
                <TableCell className="whitespace-nowrap">{est.date ? formatDate(est.date, 'EEE, d MMM yyyy') : '—'}</TableCell>
                <TableCell>
                  <p className="text-foreground">{est.functionName || '—'}</p>
                  {est.functionType ? <p className="text-xs text-muted-foreground">{est.functionType}</p> : null}
                </TableCell>
                <TableCell className="text-sm">{est.billingName || '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{est.guaranteedPax || '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{est.pricePerPlate ? est.pricePerPlate.toLocaleString('en-IN') : '—'}</TableCell>
                <TableCell className={cn('text-xs font-medium', status.tone === 'success' ? 'text-success' : status.tone === 'info' ? 'text-info' : 'text-warning')}>
                  {status.label}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{est.madeByName || '—'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => onPreview(est)} disabled={busyId === est._id} aria-label={`Preview ${est.number}`}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDownload(est)} disabled={est.status !== 'approved' || busyId === est._id} aria-label={`Download ${est.number}`}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onEmail(est)} disabled={est.status !== 'approved'}>
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
 * Two lists in one place: every prospectus sheet (with or without an estimate)
 * and every estimate raised, each with its own filters.
 */
export default function EstimateListPage() {
  const { user } = useAuth();
  const canReview = ['admin', 'manager'].includes(user?.role);
  const [tab, setTab] = useState('sheets');
  const [sheetFilters, setSheetFilters] = useState({ q: '', from: todayStr(), to: '', status: 'all' });
  const [estFilters, setEstFilters] = useState({ q: '', from: '', to: '' });
  const [sheets, setSheets] = useState(null);
  const [estimates, setEstimates] = useState(null);
  const [emailing, setEmailing] = useState(null);
  const [busyId, setBusyId] = useState('');
  const { raise, pendingKey } = useRaiseEstimate();

  const loadSheets = useCallback(async () => {
    try {
      const params = Object.fromEntries(Object.entries(sheetFilters).filter(([, v]) => v && v !== 'all'));
      const res = await api.get('/estimates/sheets', { params });
      setSheets(res?.data?.data?.sheets || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load prospectus sheets'));
      setSheets([]);
    }
  }, [sheetFilters]);

  const loadEstimates = useCallback(async () => {
    try {
      const params = Object.fromEntries(Object.entries(estFilters).filter(([, v]) => v));
      const res = await api.get('/estimates', { params });
      setEstimates(res?.data?.data?.estimates || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load estimates'));
      setEstimates([]);
    }
  }, [estFilters]);

  useEffect(() => {
    const t = setTimeout(loadSheets, 250);
    return () => clearTimeout(t);
  }, [loadSheets]);

  useEffect(() => {
    const t = setTimeout(loadEstimates, 250);
    return () => clearTimeout(t);
  }, [loadEstimates]);

  async function preview(est) {
    setBusyId(est._id);
    try {
      const res = await api.get(`/estimates/${est._id}/pdf`, { params: { stamp: 0 }, responseType: 'blob' });
      openBlob(res, `Banquet Estimate ${est.number}.pdf`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to open the PDF'));
    } finally {
      setBusyId('');
    }
  }

  async function download(est) {
    setBusyId(est._id);
    try {
      const res = await api.get(`/estimates/${est._id}/pdf`, { responseType: 'blob' });
      saveBlob(res, `Banquet Estimate ${est.number}.pdf`);
      loadEstimates();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to download the PDF'));
    } finally {
      setBusyId('');
    }
  }

  const setSheet = (key) => (value) => setSheetFilters((f) => ({ ...f, [key]: value }));
  const setEst = (key) => (value) => setEstFilters((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Prospectus sheets"
        breadcrumbs={[{ label: 'Banquet Estimate', to: '/estimates' }, { label: 'Sheets & estimates' }]}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="sheets">Prospectus sheets{sheets ? ` (${sheets.length})` : ''}</TabsTrigger>
          <TabsTrigger value="estimates">Estimates{estimates ? ` (${estimates.length})` : ''}</TabsTrigger>
          {canReview ? <TabsTrigger value="confirmed">Confirmed functions</TabsTrigger> : null}
        </TabsList>
      </Tabs>

      {tab === 'confirmed' && canReview ? <ConfirmedFunctions /> : tab === 'sheets' ? (
        <Card>
          <CardContent className="space-y-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                <Label htmlFor="sh-q">Search</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="sh-q" className="pl-9" value={sheetFilters.q} onChange={(e) => setSheet('q')(e.target.value)} placeholder="FP number, party, venue…" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sh-from">From</Label>
                <Input id="sh-from" type="date" value={sheetFilters.from} onChange={(e) => setSheet('from')(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sh-to">To</Label>
                <Input id="sh-to" type="date" value={sheetFilters.to} onChange={(e) => setSheet('to')(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sh-status">Show</Label>
                <Select value={sheetFilters.status} onValueChange={setSheet('status')}>
                  <SelectTrigger id="sh-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sheets</SelectItem>
                    <SelectItem value="pending">Awaiting estimate</SelectItem>
                    <SelectItem value="made">Estimate raised</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {sheets === null ? (
              <Skeleton className="h-40 rounded-lg" />
            ) : (
              <SheetsTable
                rows={sheets}
                onRaise={raise}
                pendingKey={pendingKey}
                emptyTitle="No prospectus sheets"
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
                <Label htmlFor="es-q">Search</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="es-q" className="pl-9" value={estFilters.q} onChange={(e) => setEst('q')(e.target.value)} placeholder="Estimate no., billing name, GST…" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="es-from">Function date from</Label>
                <Input id="es-from" type="date" value={estFilters.from} onChange={(e) => setEst('from')(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="es-to">To</Label>
                <Input id="es-to" type="date" value={estFilters.to} onChange={(e) => setEst('to')(e.target.value)} />
              </div>
            </div>
            {estimates === null ? (
              <Skeleton className="h-40 rounded-lg" />
            ) : (
              <EstimatesTable rows={estimates} onEmail={setEmailing} onPreview={preview} onDownload={download} busyId={busyId} />
            )}
          </CardContent>
        </Card>
      )}

      <EmailEstimateDialog
        open={Boolean(emailing)}
        onOpenChange={(open) => !open && setEmailing(null)}
        estimate={emailing || {}}
        onDone={() => loadEstimates()}
      />
    </div>
  );
}
