import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { CalendarDays, ExternalLink, Plus } from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { departmentLabel } from '@/lib/departments';
import {
  fnLabel,
  fnVenueNames,
  fnSessionNames,
  fnMenuSummary,
  fnAmountLabel,
} from '@/lib/banquetFunctions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import ConfirmDialog from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';

import StageBadge from './StageBadge';
import EnquiryDialog from './EnquiryDialog';
import { EnquiryActionBar, EnquiryNotices } from './EnquiryActions';

function fnSummary(fn) {
  const date = fn.date ? format(new Date(fn.date), 'd MMM yyyy') : '—';
  return [date, fnVenueNames(fn) || '—', fnSessionNames(fn) || '—'].join(' · ');
}

function roomDate(value) {
  if (!value) return '—';
  try {
    return format(new Date(value), 'd MMM yyyy');
  } catch {
    return value;
  }
}

const KIND_LABELS = { banquet: 'Banquet', room: 'Rooms', both: 'Banquet + Rooms' };

/** One line summarizing an enquiry's room block (check-in → check-out · rooms). */
function RoomSummary({ enquiry }) {
  if (!enquiry.room || enquiry.kind === 'banquet') return null;
  const { checkIn, checkOut, rooms, notes } = enquiry.room;
  return (
    <p className="text-sm text-foreground">
      <span className="font-medium">Rooms</span>
      <span className="text-muted-foreground">
        {' '}
        — {roomDate(checkIn)} → {roomDate(checkOut)}
        {rooms ? ` · ${rooms} rooms` : ''}
        {notes ? ` · ${notes}` : ''}
      </span>
    </p>
  );
}

/** Small "Proposal HCP.EP… · Contract HCP.EC…" trail on the card. */
function DocumentTrail({ enquiry }) {
  const parts = [];
  if (enquiry.proposal?.number) parts.push(`Proposal ${enquiry.proposal.number}`);
  if (enquiry.contract?.number) parts.push(`Contract ${enquiry.contract.number}`);
  if (enquiry.proforma?.number) parts.push(`Pro-forma ${enquiry.proforma.number}`);
  if (!parts.length) return null;
  return <span className="text-xs text-muted-foreground">{parts.join(' · ')}</span>;
}

/* ------------------------------ Enquiry card ------------------------------- */

function EnquiryCard({ lead, enquiry, onChanged, onEdit, onDelete }) {
  const dept = departmentLabel(lead, enquiry.department);
  const [lostOpen, setLostOpen] = useState(false);

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4 shadow-card transition-shadow hover:shadow-card-hover">
      <EnquiryNotices enquiry={enquiry} onChanged={onChanged} onMarkLost={() => setLostOpen(true)} compact />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StageBadge stage={enquiry.stage} />
            {dept ? (
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {dept}
              </span>
            ) : null}
            {enquiry.kind && enquiry.kind !== 'banquet' ? (
              <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-600 dark:text-sky-400">
                {KIND_LABELS[enquiry.kind] || enquiry.kind}
              </span>
            ) : null}
            <DocumentTrail enquiry={enquiry} />
          </div>
          <Link
            to={`/enquiries/${enquiry._id}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline"
          >
            {enquiry.contactName || lead.contactPerson || 'Open enquiry'}
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          </Link>
          {enquiry.contactEmail || enquiry.contactPhone ? (
            <p className="text-xs text-muted-foreground">
              {[enquiry.contactEmail, enquiry.contactPhone].filter(Boolean).join(' · ')}
            </p>
          ) : null}
          <div className="space-y-0.5">
            {(enquiry.functions || []).map((fn) => (
              <p key={fn._id || fnLabel(fn)} className="text-sm text-foreground">
                <span className="font-medium">{fnLabel(fn)}</span>
                <span className="text-muted-foreground"> — {fnSummary(fn)}</span>
                {fn.pax ? <span className="text-muted-foreground"> · {fn.pax} pax</span> : null}
                {fnAmountLabel(fn) ? (
                  <span className="text-muted-foreground"> · {fnAmountLabel(fn)}</span>
                ) : null}
                {fnMenuSummary(fn) ? (
                  <span className="block text-xs text-muted-foreground">{fnMenuSummary(fn)}</span>
                ) : null}
              </p>
            ))}
            <RoomSummary enquiry={enquiry} />
          </div>
          {enquiry.signing?.signedAt ? (
            <p className="text-xs text-muted-foreground">
              Signed by {enquiry.signing.signerName} on{' '}
              {format(new Date(enquiry.signing.signedAt), 'd MMM yyyy, h:mm a')}
            </p>
          ) : null}
        </div>

        <EnquiryActionBar
          enquiry={enquiry}
          onChanged={onChanged}
          onEdit={onEdit}
          onDelete={onDelete}
          showOpen
          lostOpen={lostOpen}
          onLostOpenChange={setLostOpen}
        />
      </div>
    </div>
  );
}

/* --------------------------------- Section --------------------------------- */

/**
 * "Enquiries" card on the lead detail page: the banquet pipeline for this
 * lead — create enquiries, generate/email proposals, make and send contracts,
 * mark won. Every enquiry opens on its own page.
 */
function EnquiriesSection({ lead, onLeadUpdated }) {
  const [enquiries, setEnquiries] = useState(null);
  const [config, setConfig] = useState({ venues: [], sessions: [] });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    try {
      const [enqRes, cfgRes] = await Promise.all([
        api.get(`/leads/${lead._id}/enquiries`),
        api.get('/banquet/config'),
      ]);
      setEnquiries(enqRes?.data?.data?.enquiries || []);
      setConfig(cfgRes?.data?.data || { venues: [], sessions: [] });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load enquiries'));
      setEnquiries([]);
    }
  }, [lead._id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete() {
    await api.delete(`/enquiries/${deleting._id}`);
    toast.success('Enquiry deleted');
    setDeleting(null);
    load();
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-primary" />
            Enquiries
            {enquiries ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {enquiries.length}
              </span>
            ) : null}
          </CardTitle>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New enquiry
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {enquiries === null ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : enquiries.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No enquiries yet"
            description="Create a banquet enquiry to hold dates on the calendar and start the proposal → contract → won flow."
          />
        ) : (
          enquiries.map((enquiry) => (
            <EnquiryCard
              key={enquiry._id}
              lead={lead}
              enquiry={enquiry}
              onChanged={load}
              onEdit={(e) => {
                setEditing(e);
                setDialogOpen(true);
              }}
              onDelete={setDeleting}
            />
          ))
        )}
      </CardContent>

      <EnquiryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        lead={lead}
        enquiry={editing}
        config={config}
        onLeadUpdated={onLeadUpdated}
        onSaved={() => load()}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={handleDelete}
        title="Delete this enquiry?"
        description="The enquiry and its calendar holds are removed. This cannot be undone."
        confirmText="Delete"
      />
    </Card>
  );
}

export { EnquiriesSection };
export default EnquiriesSection;
