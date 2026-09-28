import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  CalendarClock,
  Check,
  Link2,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  StickyNote,
  Trash2,
  User,
} from 'lucide-react';
import { toast } from 'sonner';

import api, { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { formatDate, formatDateTime } from '@/lib/format';
import { groupByBranch, nodeLabel } from '@/lib/departments';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { Separator } from '@/components/ui/separator';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

const NEW = '__new__';

const TYPE_OPTIONS = [
  {
    value: 'individual',
    label: 'Individual',
    icon: User,
    blurb: 'A person booking for themselves — a wedding host, a family, a guest.',
  },
  {
    value: 'company',
    label: 'Company',
    icon: Building2,
    blurb: 'The person works at a company — they are placed under its branch and department.',
  },
];

/** One selectable row in a match list. */
function Choice({ selected, disabled, onSelect, title, subtitle, badge }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
        selected ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40',
        disabled && 'cursor-not-allowed opacity-50 hover:border-border'
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
          selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
        )}
      >
        {selected ? <Check className="h-3 w-3" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
          {title}
          {badge ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{badge}</span>
          ) : null}
        </span>
        {subtitle ? <span className="mt-0.5 block text-xs text-muted-foreground">{subtitle}</span> : null}
      </span>
    </button>
  );
}

/** Debounced duplicate lookup against the Companies & Individuals records. */
function useMatches({ name, mobile, leadType, enabled }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const q = (name || '').trim();
    if (!enabled || q.length < 2) {
      setResult(null);
      return undefined;
    }
    let active = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/leads/check-duplicate', {
          params: { businessName: q, leadType, ...(mobile ? { mobile } : {}) },
        });
        if (active) setResult(res?.data?.data || null);
      } catch {
        if (active) setResult(null);
      } finally {
        if (active) setLoading(false);
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [name, mobile, leadType, enabled]);
  return { result, loading };
}

/**
 * The link step: is this person an individual, or someone at a company?
 * Existing records are matched first (individual: name + phone; company:
 * name, then branch / department) — pick one to link, or create new.
 * Linking opens the new enquiry form on the record it landed on.
 */
function ClassifyCard({ prospect, onChange }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canRegister = ['admin', 'manager'].includes(user?.role);
  const request = prospect.companyRequest?.requestedAt ? prospect.companyRequest : null;
  const [type, setType] = useState(request && canRegister ? 'company' : null);
  const [saving, setSaving] = useState(false);

  // Individual
  const [personPick, setPersonPick] = useState(null);
  const individual = useMatches({
    name: prospect.name,
    mobile: prospect.mobile,
    leadType: 'individual',
    enabled: type === 'individual',
  });

  // Company
  // A manager answering a company request starts from what was asked for.
  const [companyQuery, setCompanyQuery] = useState(request?.businessName || '');
  const [companyPick, setCompanyPick] = useState(null);
  const [businessType, setBusinessType] = useState(request?.businessType || '');
  const [deptPick, setDeptPick] = useState(NEW);
  const [branch, setBranch] = useState(request?.branch || '');
  const [deptName, setDeptName] = useState(request?.department || '');
  const [designation, setDesignation] = useState(request?.designation || '');
  const company = useMatches({ name: companyQuery, leadType: 'company', enabled: type === 'company' });

  // Default the individual choice: the same person (name + phone) if found.
  useEffect(() => {
    if (type !== 'individual' || !individual.result) return;
    const exact = individual.result.matches.find((m) => m.matchType === 'exact');
    setPersonPick(exact ? exact._id : NEW);
  }, [type, individual.result]);

  // Default the company choice: the exact name match if found.
  useEffect(() => {
    if (!company.result) {
      setCompanyPick(null);
      return;
    }
    const exact = company.result.matches.find((m) => m.matchType === 'exact');
    setCompanyPick(exact ? exact._id : company.result.matches.length ? null : NEW);
  }, [company.result]);

  const pickedCompany =
    companyPick && companyPick !== NEW ? company.result?.matches.find((m) => m._id === companyPick) : null;

  const firstPick = useRef(true);
  useEffect(() => {
    setDeptPick(NEW);
    // Keep the requested branch / department the first time a company is picked.
    if (firstPick.current && request) {
      if (companyPick) firstPick.current = false;
      return;
    }
    setBranch('');
    setDeptName('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyPick]);

  const newDeptExists =
    pickedCompany &&
    deptPick === NEW &&
    deptName.trim() &&
    (pickedCompany.departments || []).find(
      (d) =>
        (d.branch || '').trim().toLowerCase() === branch.trim().toLowerCase() &&
        d.name.trim().toLowerCase() === deptName.trim().toLowerCase()
    );

  let ready = false;
  if (type === 'individual') ready = Boolean(personPick);
  if (type === 'company') {
    ready =
      Boolean(companyPick) &&
      (companyPick !== NEW || companyQuery.trim().length >= 2) &&
      (deptPick !== NEW || deptName.trim().length > 0);
  }

  // An executive cannot register a company: the request goes to a manager.
  const requesting = type === 'company' && companyPick === NEW && !canRegister;

  async function sendRequest() {
    setSaving(true);
    try {
      const res = await api.post(`/prospects/${prospect._id}/company-request`, {
        businessName: companyQuery.trim(),
        businessType: businessType.trim(),
        branch: branch.trim(),
        department: deptName.trim(),
        designation: designation.trim(),
      });
      toast.success('Request sent — a manager will register the company and link this lead');
      onChange?.(res?.data?.data?.prospect);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not send the request'));
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (requesting) return sendRequest();
    const payload = { leadType: type };
    if (type === 'individual') {
      if (personPick !== NEW) payload.leadId = personPick;
    } else {
      if (companyPick === NEW) {
        payload.company = { businessName: companyQuery.trim(), businessType: businessType.trim() };
      } else {
        payload.leadId = companyPick;
      }
      if (deptPick === NEW) payload.department = { branch: branch.trim(), name: deptName.trim() };
      else payload.departmentId = deptPick;
      if (designation.trim()) payload.designation = designation.trim();
    }
    setSaving(true);
    try {
      const res = await api.post(`/prospects/${prospect._id}/classify`, payload);
      const data = res?.data?.data || {};
      toast.success(
        data.created
          ? `${data.lead.businessName} created — now add the enquiry`
          : `Linked to ${data.lead.businessName} — now add the enquiry`
      );
      const params = new URLSearchParams({ newEnquiry: '1' });
      if (data.departmentId) params.set('department', data.departmentId);
      if (data.contact?.name) params.set('contactName', data.contact.name);
      if (data.contact?.mobile) params.set('contactPhone', data.contact.mobile);
      if (data.contact?.email) params.set('contactEmail', data.contact.email);
      navigate(`/leads/${data.lead._id}?${params.toString()}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not link this lead'));
    } finally {
      setSaving(false);
    }
  }

  const individualExact = individual.result?.exactMatch;
  const companyExact = company.result?.exactMatch;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          Company or individual?
        </CardTitle>
        <CardDescription>
          Link {prospect.name} to an existing record, or create one. The lead then leaves the Leads list and
          the enquiry form opens.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {request ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium text-foreground">
              New company requested: {request.businessName}
              {request.department
                ? ` · ${[request.branch, request.department].filter(Boolean).join(' · ')}`
                : ''}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {request.requestedByName || 'An executive'} asked on {formatDate(request.requestedAt)}.{' '}
              {canRegister
                ? 'Check the company is not already listed, then create it below.'
                : 'Waiting for a manager to register it. You can still link the person yourself if the company turns up.'}
            </p>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {TYPE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = type === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                aria-pressed={selected}
                className={cn(
                  'flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors',
                  selected
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40'
                )}
              >
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                    selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    {opt.label}
                    {selected ? <Check className="h-4 w-4 text-primary" /> : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{opt.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>

        {type === 'individual' ? (
          <div className="space-y-2">
            <Label>Matching individuals</Label>
            {individual.loading && !individual.result ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking name and phone…
              </p>
            ) : (
              <div className="space-y-2">
                {(individual.result?.matches || []).map((m) => (
                  <Choice
                    key={m._id}
                    selected={personPick === m._id}
                    onSelect={() => setPersonPick(m._id)}
                    title={`${m.businessName} (${m.reference})`}
                    subtitle={[m.mobile, m.city, m.assignedTo?.name ? `Assigned to ${m.assignedTo.name}` : '']
                      .filter(Boolean)
                      .join(' · ')}
                    badge={m.matchType === 'exact' ? 'Same name & phone' : m.matchType === 'same-name' ? 'Same name' : 'Similar'}
                  />
                ))}
                <Choice
                  selected={personPick === NEW}
                  disabled={individualExact}
                  onSelect={() => setPersonPick(NEW)}
                  title={`Create new individual: ${prospect.name}`}
                  subtitle={
                    individualExact
                      ? 'This person already exists with the same phone number — link to them instead.'
                      : 'No existing record is used; a new individual is created from these details.'
                  }
                />
              </div>
            )}
          </div>
        ) : null}

        {type === 'company' ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company-search">Company name</Label>
              <Input
                id="company-search"
                placeholder="Start typing the company name…"
                value={companyQuery}
                onChange={(e) => setCompanyQuery(e.target.value)}
                autoFocus
              />
              {company.loading && !company.result ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Looking for the company…
                </p>
              ) : null}
              {company.result ? (
                <div className="space-y-2">
                  {company.result.matches.map((m) => (
                    <Choice
                      key={m._id}
                      selected={companyPick === m._id}
                      onSelect={() => setCompanyPick(m._id)}
                      title={`${m.businessName} (${m.reference})`}
                      subtitle={[
                        m.city,
                        `${(m.departments || []).length} department${(m.departments || []).length === 1 ? '' : 's'}`,
                        m.assignedTo?.name ? `Assigned to ${m.assignedTo.name}` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      badge={m.matchType === 'exact' ? 'Same company' : 'Similar'}
                    />
                  ))}
                  <Choice
                    selected={companyPick === NEW}
                    disabled={companyExact}
                    onSelect={() => setCompanyPick(NEW)}
                    title={`${canRegister ? 'Create' : 'Request'} new company: ${companyQuery.trim()}`}
                    subtitle={
                      companyExact
                        ? 'This company already exists — pick it above.'
                        : canRegister
                          ? 'A new company is registered with the branch and department below.'
                          : 'Only a manager can register a company. Your request goes to them; the lead waits here until they link it.'
                    }
                  />
                </div>
              ) : null}
            </div>

            {companyPick === NEW ? (
              <div className="space-y-1.5">
                <Label htmlFor="business-type">Business type (optional)</Label>
                <Input
                  id="business-type"
                  placeholder="e.g. IT services, Pharma, Bank"
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                />
              </div>
            ) : null}

            {companyPick ? (
              <div className="space-y-2">
                <Label>Branch &amp; department</Label>
                {pickedCompany && (pickedCompany.departments || []).length ? (
                  <div className="space-y-3">
                    {groupByBranch(pickedCompany.departments).map((group) => (
                      <div key={group.branch} className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
                        {group.nodes.map((node) => (
                          <Choice
                            key={node._id}
                            selected={deptPick === node._id}
                            onSelect={() => setDeptPick(node._id)}
                            title={nodeLabel(node)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                ) : null}
                {pickedCompany ? (
                  <Choice
                    selected={deptPick === NEW}
                    onSelect={() => setDeptPick(NEW)}
                    title="New branch / department"
                    subtitle="Not listed — it is created inside this company."
                  />
                ) : null}
                {deptPick === NEW ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      placeholder="Branch (optional, e.g. Nagpur)"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                    />
                    <Input
                      placeholder="Department (e.g. HR, Admin) *"
                      value={deptName}
                      onChange={(e) => setDeptName(e.target.value)}
                    />
                    {newDeptExists ? (
                      <p className="text-xs text-muted-foreground sm:col-span-2">
                        {nodeLabel(newDeptExists)} already exists — the person is added there.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {companyPick ? (
              <div className="space-y-1.5">
                <Label htmlFor="designation">Designation (optional)</Label>
                <Input
                  id="designation"
                  placeholder="e.g. HR Manager"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {type ? (
          <div className="flex justify-end">
            <Button onClick={submit} disabled={!ready || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {type === 'individual'
                ? personPick && personPick !== NEW
                  ? 'Link & add enquiry'
                  : 'Create individual & add enquiry'
                : requesting
                  ? 'Send request to manager'
                  : companyPick === NEW
                    ? 'Create company & add enquiry'
                    : 'Link & add enquiry'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Notes and follow-ups kept on the lead until it is linked. */
function ActivityCard({ prospect, onChange, readOnly }) {
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [fuNote, setFuNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(fn, done) {
    setBusy(true);
    try {
      const res = await fn();
      onChange(res?.data?.data?.prospect);
      done?.();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save'));
    } finally {
      setBusy(false);
    }
  }

  const openFollowUps = (prospect.followUps || []).filter((f) => f.status === 'open');

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Notes &amp; follow-ups</CardTitle>
        <CardDescription>
          {readOnly
            ? 'These moved to the company / individual record when the lead was linked.'
            : 'They move to the company / individual record when the lead is linked.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-muted-foreground" />
            Internal notes
          </Label>
          {(prospect.notes || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes added.</p>
          ) : (
            prospect.notes.map((n) => (
              <div key={n._id} className="rounded-md border bg-muted/30 p-2 text-sm">
                <p className="whitespace-pre-wrap text-foreground">{n.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {n.authorName || 'Someone'} · {formatDateTime(n.createdAt)}
                </p>
              </div>
            ))
          )}
          {!readOnly ? (
            <div className="flex items-start gap-2">
              <Textarea rows={2} placeholder="Write an internal note..." value={note} onChange={(e) => setNote(e.target.value)} />
              <Button
                variant="outline"
                size="icon"
                aria-label="Add note"
                disabled={busy || !note.trim()}
                onClick={() => run(() => api.post(`/prospects/${prospect._id}/notes`, { body: note.trim() }), () => setNote(''))}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>

        <Separator />

        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            Follow-ups
          </Label>
          {openFollowUps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No follow-ups scheduled.</p>
          ) : (
            openFollowUps.map((f) => (
              <div key={f._id} className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 p-2 text-sm">
                <span>
                  <span className="font-medium text-foreground">{formatDate(f.dueDate)}</span>
                  {f.note ? <span className="text-muted-foreground"> — {f.note}</span> : null}
                </span>
                {!readOnly ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      run(() => api.post(`/prospects/${prospect._id}/follow-ups/${f._id}/close`, { closingNote: 'Done' }))
                    }
                  >
                    Done
                  </Button>
                ) : null}
              </div>
            ))
          )}
          {!readOnly ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input type="date" className="sm:w-44" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              <Input placeholder="Note (optional)" value={fuNote} onChange={(e) => setFuNote(e.target.value)} />
              <Button
                variant="outline"
                size="icon"
                aria-label="Add follow-up"
                disabled={busy || !dueDate}
                onClick={() =>
                  run(
                    () => api.post(`/prospects/${prospect._id}/follow-ups`, { dueDate, note: fuNote.trim() }),
                    () => {
                      setDueDate('');
                      setFuNote('');
                    }
                  )
                }
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** A lead in the Leads section: the person, and the step that links them. */
function ProspectPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [prospect, setProspect] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/prospects/${id}`);
      setProspect(res?.data?.data?.prospect || null);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load lead'));
      navigate('/prospects');
    }
  }, [id, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  if (!prospect) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const linked = Boolean(prospect.classifiedAt);

  return (
    <div className="space-y-5">
      <PageHeader title={prospect.name} />

      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">{prospect.name}</h2>
              <StatusBadge status={prospect.status} />
              {(prospect.contactedFor || []).map((c) => (
                <span key={c} className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {c}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {prospect.mobile ? (
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Phone className="h-3.5 w-3.5" />
                  {prospect.mobile}
                </span>
              ) : null}
              {prospect.email ? (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  {prospect.email}
                </span>
              ) : null}
              {prospect.city ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {prospect.city}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Created {formatDate(prospect.createdAt)}
              {prospect.assignedTo?.name ? ` · Assigned to ${prospect.assignedTo.name}` : ''}
            </p>
          </div>
          {!linked ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to={`/prospects/${prospect._id}/edit`}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDeleting(true)}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_350px]">
        {linked ? (
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
              <p className="text-sm text-foreground">
                Linked to{' '}
                <span className="font-semibold">{prospect.linkedLead?.businessName || 'a record'}</span>
                {prospect.linkedLead?.reference ? ` (${prospect.linkedLead.reference})` : ''} on{' '}
                {formatDate(prospect.classifiedAt)}.
              </p>
              {prospect.linkedLead?._id ? (
                <Button size="sm" asChild>
                  <Link to={`/leads/${prospect.linkedLead._id}`}>
                    Open {prospect.classifiedAs === 'company' ? 'company' : 'individual'}
                  </Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <ClassifyCard prospect={prospect} onChange={(p) => p && setProspect(p)} />
        )}
        <ActivityCard prospect={prospect} readOnly={linked} onChange={(p) => p && setProspect(p)} />
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        onConfirm={async () => {
          await api.delete(`/prospects/${prospect._id}`);
          toast.success('Lead deleted');
          navigate('/prospects');
        }}
        title="Delete this lead?"
        description="The person, their notes and follow-ups are removed. This cannot be undone."
        confirmText="Delete"
      />
    </div>
  );
}

export { ProspectPage };
export default ProspectPage;
