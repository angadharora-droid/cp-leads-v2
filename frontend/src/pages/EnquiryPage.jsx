import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  ArrowLeft,
  BadgeIndianRupee,
  BedDouble,
  Building2,
  CalendarDays,
  Check,
  FileCheck2,
  FileDiff,
  FileSignature,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ReceiptText,
  User,
  Users,
} from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ENQUIRY_STAGES, CLOSED_STAGE_KEYS, stageInfo, advanceModeLabel, advanceOutcomeLabel } from '@/lib/enquiryStages';
import { departmentLabel, isIndividual } from '@/lib/departments';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  fnLabel,
  fnVenueNames,
  fnSessionNames,
  fnMenuSummary,
  fnAmountLabel,
} from '@/lib/banquetFunctions';

import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import StageBadge from '@/components/enquiries/StageBadge';
import EnquiryDialog from '@/components/enquiries/EnquiryDialog';
import EnquiryLifecycle from '@/components/enquiries/EnquiryLifecycle';
import { EnquiryActionBar, EnquiryNotices, openBlob, saveBlob } from '@/components/enquiries/EnquiryActions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Waitlist is a holding column, not a step, so the stepper skips it.
const FUNNEL = ENQUIRY_STAGES.filter((s) => !['lost', 'cancelled', 'waitlist'].includes(s.key));
const KIND_LABELS = { banquet: 'Banquet', room: 'Rooms', both: 'Banquet + Rooms' };
const EMAIL_KIND_LABELS = {
  proposal: 'Proposal',
  contract: 'Contract + pro-forma',
  proforma: 'Pro-forma invoice',
  addendum: 'Addendum + revised pro-forma',
  signed: 'Signed copy',
};

/** Horizontal funnel stepper: enquiry → proposal → provisional → won. */
function EnquiryFunnel({ enquiry }) {
  // Lost and cancelled both leave the funnel; neither step lights up.
  const lost = ['lost', 'cancelled'].includes(enquiry.stage);
  // A waitlisted enquiry shows the stage it will resume at.
  const shown = enquiry.stage === 'waitlist' ? enquiry.waitlist?.resumeStage || 'enquiry' : enquiry.stage;
  const currentIdx = FUNNEL.findIndex((s) => s.key === shown);
  const reached = (key) => {
    const entry = (enquiry.stageHistory || []).find((h) => h.stage === key);
    return entry?.at ? formatDateTime(entry.at) : '';
  };
  return (
    <ol className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-4" aria-label="Enquiry progress">
      {FUNNEL.map((stage, i) => {
        const done = !lost && i < currentIdx;
        const current = !lost && i === currentIdx;
        const info = stageInfo(stage.key);
        return (
          <li
            key={stage.key}
            className={cn('flex items-start gap-3 rounded-lg px-3 py-2 transition-colors', current && 'bg-muted/60')}
            aria-current={current ? 'step' : undefined}
          >
            <span
              className={cn(
                'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                (done || current) && 'border-transparent text-white',
                !done && !current && 'border-border text-muted-foreground'
              )}
              style={done || current ? { backgroundColor: info.color } : undefined}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className={cn('block text-sm font-medium', done || current ? 'text-foreground' : 'text-muted-foreground')}>
                {stage.label}
              </span>
              <span className="block text-xs text-muted-foreground">{reached(stage.key) || stage.hint}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-foreground">{children || '—'}</span>
    </div>
  );
}

/** One document line: number, generated / sent dates, preview + download. */
function DocumentRow({ icon: Icon, title, number, generatedAt, sentAt, sentTo, extra, onPreview, onDownload, downloading }) {
  const available = Boolean(number || onDownload);
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border px-3 py-2">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md', available ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {title}
            {number ? <span className="ml-2 font-normal text-muted-foreground">{number}</span> : null}
          </p>
          <p className="text-xs text-muted-foreground">
            {!available
              ? 'Not made yet'
              : [
                  generatedAt ? `Generated ${formatDate(generatedAt)}` : '',
                  sentAt ? `Emailed ${formatDateTime(sentAt)}${sentTo ? ` to ${sentTo}` : ''}` : 'Not emailed yet',
                  extra || '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </p>
        </div>
      </div>
      {onDownload ? (
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={onPreview} disabled={downloading}>
            Preview
          </Button>
          <Button size="sm" variant="ghost" onClick={onDownload} disabled={downloading} aria-label={`Download ${title}`}>
            Download
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Enquiry page — one enquiry with its own contact, functions and rooms,
 * every document made for it (proposal, contract, signed copy, pro-forma,
 * credit form), the emails sent, the advance or credit that won it and the
 * stage history. Opens for every enquiry, Won and Lost included.
 */
export default function EnquiryPage() {
  const { enquiryId } = useParams();
  const navigate = useNavigate();
  const [enquiry, setEnquiry] = useState(null);
  const [config, setConfig] = useState({ venues: [], sessions: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  // Which function the edit panel was opened on (a function card was clicked), if any.
  const [focusFn, setFocusFn] = useState(null);
  const openEdit = (index = null) => {
    setFocusFn(index);
    setEditOpen(true);
  };
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [downloading, setDownloading] = useState('');

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        const [enqRes, cfgRes] = await Promise.all([
          api.get(`/enquiries/${enquiryId}`),
          api.get('/banquet/config').catch(() => null),
        ]);
        const next = enqRes?.data?.data?.enquiry;
        if (!next) throw new Error('Enquiry not found');
        setEnquiry(next);
        if (cfgRes?.data?.data) setConfig(cfgRes.data.data);
        setLoadError(null);
      } catch (err) {
        if (!silent) setLoadError(getErrorMessage(err, 'Failed to load the enquiry'));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [enquiryId]
  );

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete() {
    try {
      await api.delete(`/enquiries/${enquiry._id}`);
      toast.success('Enquiry deleted');
      navigate(`/leads/${enquiry.lead?._id || enquiry.lead}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete the enquiry'));
      throw err;
    }
  }

  const fetchPdf = (key, path, name, open) => async () => {
    setDownloading(key);
    try {
      const res = await api.get(`/enquiries/${enquiry._id}/${path}`, { responseType: 'blob' });
      if (open) openBlob(res, name);
      else saveBlob(res, name);
    } catch (err) {
      toast.error(getErrorMessage(err, open ? 'Could not open the PDF' : 'Download failed'));
    } finally {
      setDownloading('');
    }
  };
  const download = (key, path, name) => fetchPdf(key, path, name, false);
  const preview = (key, path, name) => fetchPdf(key, path, name, true);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (loadError || !enquiry) {
    return (
      <div className="space-y-6">
        <PageHeader
          showTitle
          title="Enquiry"
          actions={
            <Button variant="outline" asChild>
              <Link to="/enquiries">
                <ArrowLeft className="h-4 w-4" />
                Back to enquiries
              </Link>
            </Button>
          }
        />
        <EmptyState
          icon={CalendarDays}
          title="Enquiry not found"
          description={loadError || 'This enquiry does not exist or you do not have access to it.'}
        />
      </div>
    );
  }

  const lead = enquiry.lead && typeof enquiry.lead === 'object' ? enquiry.lead : { _id: enquiry.lead };
  const dept = departmentLabel(lead, enquiry.department);
  const LeadIcon = isIndividual(lead) ? User : Building2;
  const closed = CLOSED_STAGE_KEYS.includes(enquiry.stage);
  const emails = [...(enquiry.emails || [])].reverse();
  const wonOnCredit = enquiry.stage === 'won' && enquiry.won?.basis === 'credit';

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Link to="/leads" className="text-muted-foreground hover:text-foreground">
          Leads
        </Link>
        <span className="text-muted-foreground">/</span>
        <Link to={`/leads/${lead._id}`} className="text-muted-foreground hover:text-foreground">
          {lead.reference || 'Lead'}
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium text-foreground">Enquiry</span>
      </nav>

      <PageHeader
        showTitle
        eyebrow={`Enquiry · ${KIND_LABELS[enquiry.kind] || 'Banquet'}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {lead.businessName || 'Enquiry'}
            <StageBadge stage={enquiry.stage} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <LeadIcon className="h-3.5 w-3.5" />
              <Link to={`/leads/${lead._id}`} className="font-medium text-foreground hover:underline">
                {lead.businessName}
              </Link>
              {dept ? <span className="text-primary">· {dept}</span> : null}
            </span>
            {enquiry.contactName ? (
              <span className="inline-flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                {enquiry.contactName}
              </span>
            ) : null}
            {enquiry.contactEmail ? (
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {enquiry.contactEmail}
              </span>
            ) : null}
            {enquiry.contactPhone ? (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                {enquiry.contactPhone}
              </span>
            ) : null}
          </span>
        }
        actions={
          <>
            {!closed ? (
              <Button variant="outline" size="sm" onClick={() => openEdit()}>
                <Pencil className="h-4 w-4" />
                Edit details
              </Button>
            ) : null}
            <EnquiryActionBar
              enquiry={enquiry}
              onChanged={() => load({ silent: true })}
              onEdit={() => openEdit()}
              onDelete={() => setConfirmDelete(true)}
              lostOpen={lostOpen}
              onLostOpenChange={setLostOpen}
            />
          </>
        }
      />

      <EnquiryFunnel enquiry={enquiry} />

      <EnquiryNotices enquiry={enquiry} onChanged={() => load({ silent: true })} onMarkLost={() => setLostOpen(true)} />

      {enquiry.stage === 'lost' ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Marked lost{enquiry.lostAt ? ` on ${formatDate(enquiry.lostAt)}` : ''}
          {enquiry.lostReason ? `: ${enquiry.lostReason}` : ''}
        </p>
      ) : null}

      {enquiry.stage === 'cancelled' ? (
        <div className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <p>
            <span className="font-medium">Booking cancelled</span>
            {enquiry.cancellation?.at ? ` on ${formatDate(enquiry.cancellation.at)}` : ''}
            {enquiry.cancellation?.byName ? ` by ${enquiry.cancellation.byName}` : ''}
            {enquiry.cancellation?.fromStage ? ` (was ${stageInfo(enquiry.cancellation.fromStage).label})` : ''}
            {enquiry.cancellation?.reason ? `: ${enquiry.cancellation.reason}` : ''}
          </p>
          {enquiry.cancellation?.advanceOutcome ? (
            <p>
              Advance {advanceOutcomeLabel(enquiry.cancellation.advanceOutcome).toLowerCase()}
              {enquiry.cancellation.advanceAmount ? ` — ${enquiry.cancellation.advanceAmount}` : ''}
              {enquiry.cancellation.advanceNote ? ` (${enquiry.cancellation.advanceNote})` : ''}
            </p>
          ) : null}
        </div>
      ) : null}

      {enquiry.stage === 'won' ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success/40 bg-success/10 p-3">
          <p className="flex items-start gap-2.5 text-sm text-foreground">
            <BadgeIndianRupee className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            <span>
              <span className="font-medium">Booking confirmed</span>
              {enquiry.won?.at ? ` on ${formatDate(enquiry.won.at)}` : ''}
              {enquiry.won?.byName ? ` by ${enquiry.won.byName}` : ''} —{' '}
              {wonOnCredit ? 'PPS on one-time credit' : 'advance received'}.
            </span>
          </p>
          {wonOnCredit ? (
            <Button size="sm" variant="outline" onClick={preview('credit', 'credit-form/pdf', 'Credit Application Form.pdf')} disabled={downloading === 'credit'}>
              <BadgeIndianRupee className="h-4 w-4" />
              Credit application form
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="h-4 w-4 text-primary" />
                Functions
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {(enquiry.functions || []).length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(enquiry.functions || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No banquet functions on this enquiry.</p>
              ) : (
                enquiry.functions.map((fn, index) => (
                  // The whole card opens the enquiry panel on this function (read-only once the enquiry is closed).
                  <div
                    key={fn._id || fnLabel(fn)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${fnLabel(fn)} in the enquiry panel`}
                    onClick={() => openEdit(index)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openEdit(index);
                      }
                    }}
                    className="cursor-pointer rounded-lg border p-3 transition-colors hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-foreground">{fnLabel(fn)}</p>
                      {fnAmountLabel(fn) ? (
                        <span className="text-sm font-medium tabular-nums text-foreground">{fnAmountLabel(fn)}</span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {fn.date ? format(new Date(fn.date), 'EEE, d MMM yyyy') : '—'}
                        {fnSessionNames(fn) ? ` · ${fnSessionNames(fn)}` : ''}
                      </span>
                      {fnVenueNames(fn) ? (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          {fnVenueNames(fn)}
                        </span>
                      ) : null}
                      {fn.pax ? (
                        <span className="inline-flex items-center gap-1.5 tabular-nums">
                          <Users className="h-3.5 w-3.5" />
                          {fn.pax} pax
                        </span>
                      ) : null}
                    </div>
                    {fnMenuSummary(fn) ? <p className="mt-1 text-xs text-muted-foreground">{fnMenuSummary(fn)}</p> : null}
                    {(fn.requirements || []).length || (fn.liquor || []).length ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[...(fn.liquor || []), ...(fn.requirements || [])]
                          .map((item) => item?.name)
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    ) : null}
                    {fn.additionalRequirement ? (
                      <p className="mt-1 text-xs text-muted-foreground">Also: {fn.additionalRequirement}</p>
                    ) : null}
                  </div>
                ))
              )}
              {enquiry.room && enquiry.kind !== 'banquet' ? (
                <div className="rounded-lg border p-3">
                  <p className="flex items-center gap-2 font-medium text-foreground">
                    <BedDouble className="h-4 w-4 text-primary" />
                    Rooms
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatDate(enquiry.room.checkIn)} → {formatDate(enquiry.room.checkOut)}
                    {enquiry.room.rooms ? ` · ${enquiry.room.rooms} rooms` : ''}
                    {enquiry.room.notes ? ` · ${enquiry.room.notes}` : ''}
                  </p>
                </div>
              ) : null}
              {enquiry.estimatedRevenue ? (
                <p className="text-sm text-muted-foreground">
                  Estimated revenue: <span className="font-medium text-foreground">{enquiry.estimatedRevenue}</span>
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-primary" />
                Documents
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <DocumentRow
                icon={FileText}
                title="Proposal"
                number={enquiry.proposal?.number}
                generatedAt={enquiry.proposal?.generatedAt}
                sentAt={enquiry.proposal?.sentAt}
                sentTo={enquiry.proposal?.sentTo}
                onPreview={preview('proposal', 'proposal/pdf', 'Proposal.pdf')}
                onDownload={enquiry.proposal?.number ? download('proposal', 'proposal/pdf', 'Proposal.pdf') : null}
                downloading={downloading === 'proposal'}
              />
              <DocumentRow
                icon={FileCheck2}
                title="Contract"
                number={enquiry.contract?.number}
                generatedAt={enquiry.contract?.generatedAt}
                sentAt={enquiry.contract?.sentAt}
                sentTo={enquiry.contract?.sentTo}
                onPreview={preview('contract', 'contract/pdf', 'Contract.pdf')}
                onDownload={enquiry.contract?.number ? download('contract', 'contract/pdf', 'Contract.pdf') : null}
                downloading={downloading === 'contract'}
              />
              <DocumentRow
                icon={FileSignature}
                title="Signed copy"
                number={enquiry.signing?.signedAt ? (enquiry.signing.document === 'contract' ? enquiry.contract?.number : enquiry.proposal?.number) : ''}
                generatedAt={enquiry.signing?.signedAt}
                extra={enquiry.signing?.signedAt ? `Signed digitally by ${enquiry.signing.signerName} on ${formatDateTime(enquiry.signing.signedAt)}` : ''}
                onPreview={preview('signed', 'signed-pdf', 'Signed copy.pdf')}
                onDownload={enquiry.signing?.signedPdfFileId ? download('signed', 'signed-pdf', 'Signed copy.pdf') : null}
                downloading={downloading === 'signed'}
              />
              <DocumentRow
                icon={ReceiptText}
                title="Pro-forma invoice"
                number={enquiry.proforma?.number}
                generatedAt={enquiry.proforma?.generatedAt}
                sentAt={enquiry.proforma?.sentAt}
                sentTo={enquiry.proforma?.sentTo}
                onPreview={preview('proforma', 'proforma-pdf', 'Pro-Forma Invoice.pdf')}
                onDownload={enquiry.proforma?.fileId ? download('proforma', 'proforma-pdf', 'Pro-Forma Invoice.pdf') : null}
                downloading={downloading === 'proforma'}
              />
              {(enquiry.addendums || []).map((addendum, i) => {
                const key = `addendum-${i}`;
                const path = `addendums/${encodeURIComponent(addendum.number)}/pdf`;
                const signedPath = `addendums/${encodeURIComponent(addendum.number)}/signed-pdf`;
                return (
                  <div key={key} className="space-y-2">
                    <DocumentRow
                      icon={FileDiff}
                      title={`Addendum ${i + 1}`}
                      number={addendum.number}
                      generatedAt={addendum.generatedAt}
                      sentAt={addendum.sentAt}
                      sentTo={addendum.sentTo}
                      extra={addendum.sentAt ? 'Sent with the revised pro-forma' : 'Not emailed yet — the revised pro-forma goes with it'}
                      onPreview={preview(key, path, `Addendum ${addendum.number}.pdf`)}
                      onDownload={addendum.number ? download(key, path, `Addendum ${addendum.number}.pdf`) : null}
                      downloading={downloading === key}
                    />
                    {addendum.signing?.signedAt ? (
                      <DocumentRow
                        icon={FileSignature}
                        title={`Signed addendum ${i + 1}`}
                        number={addendum.number}
                        generatedAt={addendum.signing.signedAt}
                        extra={`Signed digitally by ${addendum.signing.signerName} on ${formatDateTime(addendum.signing.signedAt)}`}
                        onPreview={preview(`${key}-signed`, signedPath, `Signed Addendum ${addendum.number}.pdf`)}
                        onDownload={addendum.signing.signedPdfFileId ? download(`${key}-signed`, signedPath, `Signed Addendum ${addendum.number}.pdf`) : null}
                        downloading={downloading === `${key}-signed`}
                      />
                    ) : null}
                  </div>
                );
              })}
              {enquiry.credit?.pps || enquiry.credit?.formGeneratedAt ? (
                <DocumentRow
                  icon={BadgeIndianRupee}
                  title="Credit application form"
                  number={enquiry.contract?.number}
                  generatedAt={enquiry.credit?.formGeneratedAt}
                  extra="One-time credit (PPS)"
                  onPreview={preview('credit', 'credit-form/pdf', 'Credit Application Form.pdf')}
                  onDownload={download('credit', 'credit-form/pdf', 'Credit Application Form.pdf')}
                  downloading={downloading === 'credit'}
                />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="h-4 w-4 text-primary" />
                Emails sent
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{emails.length}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {emails.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing emailed for this enquiry yet.</p>
              ) : (
                <ul className="divide-y">
                  {emails.map((mail, i) => (
                    <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium text-foreground">{EMAIL_KIND_LABELS[mail.kind] || mail.kind}</span>
                        <span className="text-muted-foreground"> to {mail.to}{mail.cc ? ` (cc ${mail.cc})` : ''}</span>
                        {mail.subject ? <span className="block truncate text-xs text-muted-foreground">{mail.subject}</span> : null}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(mail.at)}
                        {mail.byName ? ` · ${mail.byName}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Every stage it reached, with that stage's details; reloads when the enquiry changes. */}
          <EnquiryLifecycle enquiryId={enquiry._id} version={enquiry.updatedAt} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4 text-primary" />
                Contact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Row label="Name">{enquiry.contactName}</Row>
              <Row label="Email">{enquiry.contactEmail}</Row>
              <Row label="Phone">{enquiry.contactPhone}</Row>
              <p className="pt-1 text-xs text-muted-foreground">
                Documents and emails for this enquiry go to this contact. Change it from the menu → Edit contact.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ReceiptText className="h-4 w-4 text-primary" />
                Billing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Row label="Billing name">{enquiry.billingName || lead.businessName}</Row>
              <Row label="GST">{enquiry.gstNumber}</Row>
              <Row label="PAN">{enquiry.panNumber}</Row>
              <Row label="Payment terms">{enquiry.paymentTerms}</Row>
            </CardContent>
          </Card>

          {enquiry.stage === 'won' ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BadgeIndianRupee className="h-4 w-4 text-primary" />
                  {wonOnCredit ? 'One-time credit' : 'Advance'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {wonOnCredit ? (
                  <>
                    <Row label="Basis">PPS — one-time credit</Row>
                    <Row label="Credit form">{enquiry.credit?.formGeneratedAt ? `Printed ${formatDate(enquiry.credit.formGeneratedAt)}` : 'Not printed yet'}</Row>
                  </>
                ) : (
                  <>
                    <Row label="Amount">{enquiry.advance?.amount}</Row>
                    <Row label="Received on">{enquiry.advance?.date ? formatDate(enquiry.advance.date) : ''}</Row>
                    <Row label="Mode">{advanceModeLabel(enquiry.advance?.mode)}</Row>
                    <Row label="Reference">{enquiry.advance?.reference}</Row>
                    {enquiry.advance?.remarks ? <Row label="Remarks">{enquiry.advance.remarks}</Row> : null}
                    <Row label="Recorded by">{enquiry.advance?.recordedByName}</Row>
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}

          {enquiry.notes ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-foreground">{enquiry.notes}</p>
              </CardContent>
            </Card>
          ) : null}

        </div>
      </div>

      <EnquiryDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        lead={lead}
        enquiry={enquiry}
        config={config}
        focusFunction={focusFn}
        readOnly={closed}
        onSaved={() => load({ silent: true })}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={handleDelete}
        title="Delete this enquiry?"
        description="The enquiry and its calendar holds are removed. This cannot be undone."
        confirmText="Delete"
      />
    </div>
  );
}
