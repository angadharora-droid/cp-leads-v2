import { useEffect, useRef, useState } from 'react';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Check,
  GitBranch,
  Network,
  Save,
  Loader2,
  Plus,
  Trash2,
  StickyNote,
  CalendarClock,
  User,
} from 'lucide-react';
import { toast } from 'sonner';

import api, { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { groupByBranch } from '@/lib/departments';
import { useAuth } from '@/context/AuthContext';

import { PageHeader } from '@/components/PageHeader';
import { LEAD_STATUSES } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { Separator } from '@/components/ui/separator';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

const UNASSIGNED = '__unassigned__';

/** Centre Point business units a lead can be contacted for. */
export const CONTACTED_FOR_OPTIONS = ['CPA', 'CPH', 'CPNM'];

const LEAD_TYPES = ['company', 'individual'];

/** Normalize a lead's contactedFor (legacy single string or array) to an array. */
export function toContactedForArray(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.filter((v) => CONTACTED_FOR_OPTIONS.includes(v));
}

// Optional email that also tolerates an empty string.
const optionalEmail = z
  .string()
  .trim()
  .email('Enter a valid email')
  .or(z.literal(''))
  .optional();

const leadSchema = z.object({
  leadType: z.enum(LEAD_TYPES),
  businessName: z.string().trim().min(1, 'Name is required'),
  contactPerson: z.string().trim().optional(),
  designation: z.string().trim().optional(),
  businessType: z.string().trim().optional(),
  contactedFor: z.array(z.enum(CONTACTED_FOR_OPTIONS)).optional(),
  mobile: z.string().trim().optional(),
  email: optionalEmail,
  city: z.string().trim().optional(),
  status: z.enum(LEAD_STATUSES),
  assignedTo: z.string().optional(),
  // Company structure captured at creation. Rows without a department name
  // are dropped on submit; at least one must remain for a company.
  hasBranches: z.boolean().optional(),
  departments: z
    .array(
      z.object({
        branch: z.string().optional(),
        name: z.string().optional(),
      })
    )
    .optional(),
  // Optional sub-resources captured inline at creation. Kept lenient here;
  // empty rows are filtered out on submit.
  notes: z.array(z.object({ body: z.string().optional() })).optional(),
  followUps: z
    .array(
      z.object({
        dueDate: z.string().optional(),
        note: z.string().optional(),
      })
    )
    .optional(),
});

const EMPTY_DEFAULTS = {
  leadType: 'company',
  businessName: '',
  contactPerson: '',
  designation: '',
  businessType: '',
  contactedFor: [],
  mobile: '',
  email: '',
  city: '',
  status: 'Non Contracted',
  assignedTo: '',
  hasBranches: false,
  departments: [{ branch: '', name: '' }],
  notes: [],
  followUps: [],
};

const STAGE_LABELS = {
  enquiry: 'Enquiry',
  proposal: 'Proposal',
  waitlist: 'Waitlist',
  provisional: 'Provisional',
  won: 'Won',
};

/* -------------------------------------------------------------------------- */
/* Step 1 — company or individual                                              */
/* -------------------------------------------------------------------------- */

const TYPE_OPTIONS = [
  {
    value: 'company',
    label: 'Company',
    icon: Building2,
    blurb:
      'A business with branches and/or departments. Enquiries and rate contracts are raised per department.',
  },
  {
    value: 'individual',
    label: 'Individual',
    icon: User,
    blurb:
      'A single person — a wedding host, a family, a guest. No branches or departments.',
  },
];

/** Big two-way choice shown before the form on a new lead. */
function LeadTypeChooser({ value, onChange, compact }) {
  return (
    <div className={cn('grid gap-3', compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2')}>
      {TYPE_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={selected}
            className={cn(
              'flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors',
              selected
                ? 'border-primary bg-primary/5'
                : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40',
              compact && 'p-3'
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
              {!compact ? (
                <span className="mt-0.5 block text-xs text-muted-foreground">{opt.blurb}</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Duplicate banner                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Prominent banner shown while typing a name that matches an existing lead.
 * Companies: an exact match blocks creation, similar names warn — each match
 * lists the company's departments and active enquiries so the exec can add
 * to the existing company instead. Individuals: a same-name match only
 * warns (two people can share a name); it blocks when the phone matches too.
 */
function DuplicateBanner({ result, leadType }) {
  if (!result || result.matches.length === 0) return null;
  const exact = result.exactMatch;
  const individual = leadType === 'individual';
  const sameNameOnly = !exact && result.matches.some((m) => m.matchType === 'same-name');

  let headline;
  if (exact && individual) {
    headline = 'This person already exists with the same phone number — a duplicate cannot be created.';
  } else if (exact) {
    headline =
      'A lead for this company already exists — a duplicate cannot be created. Open it and add a branch or department instead.';
  } else if (individual && sameNameOnly) {
    headline =
      'Someone with this exact name already exists, but with a different phone number — check it is not the same person.';
  } else if (individual) {
    headline = 'A person with a similar name already exists — check before creating a duplicate.';
  } else {
    headline = 'A company with a similar name already exists — check before creating a duplicate.';
  }

  return (
    <div
      role="alert"
      className={
        exact
          ? 'rounded-lg border-2 border-destructive/60 bg-destructive/10 p-4'
          : 'rounded-lg border-2 border-amber-500/60 bg-amber-500/10 p-4'
      }
    >
      <p
        className={`flex items-center gap-2 text-sm font-semibold ${
          exact ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'
        }`}
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {headline}
      </p>
      <div className="mt-3 space-y-3">
        {result.matches.slice(0, 3).map((m) => {
          const groups = groupByBranch(m.departments || []);
          return (
            <div key={m._id} className="rounded-md border bg-background/60 p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground">
                    {m.businessName}{' '}
                    <span className="font-normal text-muted-foreground">
                      ({m.reference}
                      {m.city ? ` · ${m.city}` : ''})
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {m.contactPerson ? `${m.contactPerson} · ` : ''}
                    {m.mobile ? `${m.mobile} · ` : ''}
                    {m.status}
                    {m.assignedTo?.name ? ` · Assigned to ${m.assignedTo.name}` : ''}
                    {individual && m.phoneMatch ? ' · same phone number' : ''}
                  </p>
                </div>
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/leads/${m._id}`}>Open lead</Link>
                </Button>
              </div>
              {!individual && groups.length ? (
                <div className="mt-2 border-t pt-2">
                  <p className="text-xs font-medium text-foreground">Existing structure:</p>
                  <p className="text-xs text-muted-foreground">
                    {groups
                      .map((g) => `${g.label}: ${g.nodes.map((n) => n.name).join(', ')}`)
                      .join(' · ')}
                  </p>
                </div>
              ) : null}
              {m.enquiries?.length ? (
                <div className="mt-2 space-y-1 border-t pt-2">
                  <p className="text-xs font-medium text-foreground">
                    Active enquiries in the pipeline:
                  </p>
                  {m.enquiries.map((enq) => (
                    <p key={enq._id} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {STAGE_LABELS[enq.stage] || enq.stage}
                      </span>
                      {enq.department ? ` · ${enq.department}` : ''}
                      {enq.label ? ` — ${enq.label}` : ''}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Small labelled field wrapper. */
function Field({ label, htmlFor, error, required, className, children }) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} className="mb-1.5 inline-block">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-destructive">{error.message}</p>
      ) : null}
    </div>
  );
}

/** Yes / No toggle used for the branch question. */
function YesNo({ value, onChange, idPrefix }) {
  return (
    <div role="radiogroup" className="inline-flex rounded-md border bg-background p-0.5">
      {[
        { v: true, label: 'Yes' },
        { v: false, label: 'No' },
      ].map((opt) => (
        <button
          key={String(opt.v)}
          id={`${idPrefix}-${opt.v ? 'yes' : 'no'}`}
          type="button"
          role="radio"
          aria-checked={value === opt.v}
          onClick={() => onChange(opt.v)}
          className={cn(
            'rounded px-4 py-1.5 text-sm font-medium transition-colors',
            value === opt.v
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Create / edit a lead. Edit mode is triggered by the presence of an :id param.
 * A new lead starts by asking whether it is a company or an individual —
 * companies then capture their branch / department structure.
 */
function LeadFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState(false);
  const [execs, setExecs] = useState([]);
  const [dupResult, setDupResult] = useState(null);
  // A new lead shows the company / individual choice before anything else.
  const presetType = searchParams.get('leadType');
  const [typeChosen, setTypeChosen] = useState(
    isEdit || LEAD_TYPES.includes(presetType)
  );
  const loadedNameRef = useRef('');
  const loadedMobileRef = useRef('');

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(leadSchema),
    defaultValues: EMPTY_DEFAULTS,
  });

  // Inline sub-resources captured only when creating a brand-new lead.
  const notesFA = useFieldArray({ control, name: 'notes' });
  const followUpsFA = useFieldArray({ control, name: 'followUps' });
  const departmentsFA = useFieldArray({ control, name: 'departments' });

  const leadType = watch('leadType');
  const isIndividual = leadType === 'individual';
  const hasBranches = watch('hasBranches');

  // "Create new lead" from a board passes the searched name (and type).
  useEffect(() => {
    if (isEdit) return;
    const prefill = searchParams.get('businessName');
    const next = { ...EMPTY_DEFAULTS };
    if (prefill) next.businessName = prefill;
    if (LEAD_TYPES.includes(presetType)) next.leadType = presetType;
    if (prefill || LEAD_TYPES.includes(presetType)) reset(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load executive options for the admin assignee picker.
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
        // Non-fatal: picker simply has no options.
      }
    })();
    return () => {
      active = false;
    };
  }, [isAdmin]);

  // On edit, fetch the lead and prefill the form.
  useEffect(() => {
    if (!isEdit) return;
    let active = true;
    setLoading(true);
    setLoadError(false);
    (async () => {
      try {
        const res = await api.get(`/leads/${id}`);
        const lead = res?.data?.data?.lead ?? res?.data?.data ?? null;
        if (!lead) throw new Error('Lead not found');
        if (!active) return;
        loadedNameRef.current = lead.businessName || '';
        loadedMobileRef.current = lead.mobile || '';
        const assignedTo =
          lead.assignedTo && typeof lead.assignedTo === 'object'
            ? lead.assignedTo._id
            : lead.assignedTo || '';
        reset({
          leadType: lead.leadType === 'individual' ? 'individual' : 'company',
          businessName: lead.businessName || '',
          contactPerson: lead.contactPerson || '',
          designation: lead.designation || '',
          businessType: lead.businessType || '',
          contactedFor: toContactedForArray(lead.contactedFor),
          mobile: lead.mobile || '',
          email: lead.email || '',
          city: lead.city || '',
          status: LEAD_STATUSES.includes(lead.status)
            ? lead.status
            : 'Non Contracted',
          assignedTo: assignedTo || '',
          hasBranches: (lead.departments || []).some((d) => d.branch),
          departments: [],
        });
      } catch (error) {
        if (active) {
          setLoadError(true);
          toast.error(getErrorMessage(error, 'Failed to load lead'));
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, isEdit, reset]);

  // As-you-type duplicate lookup. Companies are matched on name; individuals
  // on name + phone (same name alone only warns). Skipped on edit while the
  // matched fields are unchanged; the backend enforces the same rule on save.
  const businessNameValue = watch('businessName');
  const mobileValue = watch('mobile');
  useEffect(() => {
    const name = (businessNameValue || '').trim();
    const mobile = (mobileValue || '').trim();
    const unchanged =
      isEdit &&
      name === loadedNameRef.current &&
      (!isIndividual || mobile === loadedMobileRef.current);
    if (name.length < 3 || unchanged) {
      setDupResult(null);
      return undefined;
    }
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/leads/check-duplicate', {
          params: {
            businessName: name,
            leadType,
            ...(isIndividual && mobile ? { mobile } : {}),
            ...(isEdit ? { excludeId: id } : {}),
          },
        });
        if (active) setDupResult(res?.data?.data || null);
      } catch {
        if (active) setDupResult(null);
      }
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [businessNameValue, mobileValue, leadType, isIndividual, isEdit, id]);

  const onSubmit = async (values) => {
    // Build a clean payload; drop empty optional strings.
    const SKIP_KEYS = ['assignedTo', 'notes', 'followUps', 'departments', 'hasBranches', 'leadType'];
    const payload = {};
    Object.entries(values).forEach(([key, value]) => {
      if (SKIP_KEYS.includes(key)) return; // handled separately below
      if (value === '' || value == null) return;
      payload[key] = value;
    });
    payload.businessName = values.businessName.trim();
    payload.status = values.status;

    // Only admins may set the assignee; backend defaults it to the creator otherwise.
    if (isAdmin && values.assignedTo) payload.assignedTo = values.assignedTo;

    // Lead type and company structure are fixed at creation; branches and
    // departments are managed from the lead page afterwards.
    if (!isEdit) {
      payload.leadType = values.leadType;
      if (values.leadType === 'company') {
        const departments = (values.departments || [])
          .map((d) => ({
            branch: values.hasBranches ? (d.branch || '').trim() : '',
            name: (d.name || '').trim(),
          }))
          .filter((d) => d.name);
        if (departments.length === 0) {
          toast.error('A company lead needs at least one department — create one to continue');
          return;
        }
        const seen = new Set();
        for (const d of departments) {
          const key = `${d.branch.toLowerCase()}|${d.name.toLowerCase()}`;
          if (seen.has(key)) {
            toast.error(`Department "${d.name}" is listed twice`);
            return;
          }
          seen.add(key);
        }
        payload.departments = departments;
      }

      // Inline sub-resources are only sent when creating a new lead. Empty
      // rows are dropped; follow-ups without a date are skipped.
      const notes = (values.notes || [])
        .map((n) => (n.body || '').trim())
        .filter(Boolean)
        .map((body) => ({ body }));
      const followUps = (values.followUps || [])
        .filter((f) => f.dueDate)
        .map((f) => ({ dueDate: f.dueDate, note: (f.note || '').trim() }));
      if (notes.length) payload.notes = notes;
      if (followUps.length) payload.followUps = followUps;
    }

    try {
      let leadId = id;
      if (isEdit) {
        const res = await api.patch(`/leads/${id}`, payload);
        leadId = res?.data?.data?.lead?._id ?? res?.data?.data?._id ?? id;
        toast.success('Lead updated');
      } else {
        const res = await api.post('/leads', payload);
        const created = res?.data?.data?.lead ?? res?.data?.data ?? {};
        leadId = created._id;
        toast.success('Lead created');
      }
      if (leadId) navigate(`/leads/${leadId}`);
      else navigate('/leads');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to save lead'));
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Lead not found"
          description="We couldn't load this lead. It may have been removed or you may not have access."
        />
        <Button variant="outline" onClick={() => navigate('/leads')}>
          <ArrowLeft className="h-4 w-4" />
          Back to leads
        </Button>
      </div>
    );
  }

  /* ------------------------ Step 1: company / individual ------------------ */

  if (!typeChosen) {
    return (
      <div className="space-y-5">
        <PageHeader title="New Lead" />
        <Card>
          <CardHeader>
            <CardTitle>Who is this lead?</CardTitle>
            <CardDescription>
              Companies are structured into branches and departments; every enquiry and rate
              contract is raised under one department. Individuals have no structure.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LeadTypeChooser
              value={null}
              onChange={(v) => {
                setValue('leadType', v);
                setTypeChosen(true);
              }}
            />
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" onClick={() => navigate('/leads')}>
                <ArrowLeft className="h-4 w-4" />
                Back to leads
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const nameLabel = isIndividual ? 'Full name' : 'Company name';
  // A new company lead opens with the company's name, then its structure,
  // then everything else; otherwise the name sits with the other details.
  const nameFirst = !isEdit && !isIndividual;
  const nameField = (
    <Field
      label={nameLabel}
      htmlFor="businessName"
      required
      error={errors.businessName}
      className="sm:col-span-2"
    >
      <Input
        id="businessName"
        placeholder={isIndividual ? 'Ravi Sharma' : 'Acme Hotels Pvt Ltd'}
        {...register('businessName')}
      />
    </Field>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={isEdit ? 'Edit Lead' : isIndividual ? 'New Individual Lead' : 'New Company Lead'}
        description={
          isEdit
            ? 'Update the details for this lead.'
            : isIndividual
              ? 'Capture the person’s details and add them to your pipeline.'
              : 'Capture the company, its branches and departments, and add it to your pipeline.'
        }
      />

      {!isEdit ? (
        <Controller
          control={control}
          name="leadType"
          render={({ field }) => (
            <LeadTypeChooser compact value={field.value} onChange={field.onChange} />
          )}
        />
      ) : null}

      <DuplicateBanner result={dupResult} leadType={leadType} />

      <form onSubmit={handleSubmit(onSubmit)} className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_350px]" noValidate>
        {/* Company name — first on a new company lead. */}
        {nameFirst ? (
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Company
              </CardTitle>
              <CardDescription>
                Start with the company&apos;s name — it is checked against the leads already in the
                system as you type.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">{nameField}</CardContent>
          </Card>
        ) : null}

        {/* Company structure — branches and departments (new company leads). */}
        {!isEdit && !isIndividual ? (
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-4 w-4 text-muted-foreground" />
                Company structure
              </CardTitle>
              <CardDescription>
                Every enquiry and rate contract is raised under a department, so the company
                needs at least one. Branches are optional.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <GitBranch className="h-4 w-4 text-muted-foreground" />
                    Does this company have branches?
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {hasBranches
                      ? 'Name the branch each department belongs to. Leave it blank for head-office departments.'
                      : 'No branches — departments sit directly under the company.'}
                  </p>
                </div>
                <Controller
                  control={control}
                  name="hasBranches"
                  render={({ field }) => (
                    <YesNo
                      idPrefix="has-branches"
                      value={Boolean(field.value)}
                      onChange={field.onChange}
                    />
                  )}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>
                    Departments <span className="text-destructive">*</span>
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => departmentsFA.append({ branch: '', name: '' })}
                  >
                    <Plus className="h-4 w-4" />
                    Add department
                  </Button>
                </div>
                {departmentsFA.fields.length === 0 ? (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
                    No department yet — create one to continue.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {departmentsFA.fields.map((field, index) => (
                      <div
                        key={field.id}
                        className="flex flex-col gap-2 sm:flex-row sm:items-center"
                      >
                        {hasBranches ? (
                          <Input
                            placeholder="Branch (e.g. Nagpur)"
                            className="sm:w-56"
                            {...register(`departments.${index}.branch`)}
                          />
                        ) : null}
                        <Input
                          placeholder="Department (e.g. HR, Admin, Purchase)"
                          {...register(`departments.${index}.name`)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove department"
                          onClick={() => departmentsFA.remove(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">
                      {hasBranches
                        ? 'Rows without a department name are ignored. The same department can exist under different branches.'
                        : 'Rows without a department name are ignored.'}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {isEdit && !isIndividual ? (
          <p className="text-sm text-muted-foreground">
            Branches and departments are managed from the lead&apos;s page under
            &ldquo;Company structure&rdquo;.
          </p>
        ) : null}

        {/* Lead details */}
        <Card className={isEdit ? 'xl:col-span-2' : 'min-w-0'}>
          <CardHeader>
            <CardTitle>{isIndividual ? 'Person details' : 'Company details'}</CardTitle>
            <CardDescription>
              {isIndividual
                ? 'Who this person is and how to reach them. Name and phone together identify a person.'
                : 'Who this company is and how to reach them.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {nameFirst ? null : nameField}

            {!isIndividual ? (
              <>
                <Field label="Contact person" htmlFor="contactPerson">
                  <Input
                    id="contactPerson"
                    placeholder="Full name"
                    {...register('contactPerson')}
                  />
                </Field>

                <Field label="Designation" htmlFor="designation">
                  <Input
                    id="designation"
                    placeholder="e.g. Purchase Manager"
                    {...register('designation')}
                  />
                </Field>

                <Field
                  label="Business type"
                  htmlFor="businessType"
                  error={errors.businessType}
                >
                  <Input
                    id="businessType"
                    placeholder="e.g. Hotel, Restaurant, Caterer"
                    {...register('businessType')}
                  />
                </Field>
              </>
            ) : null}

            <Field label="Contacted for" error={errors.contactedFor}>
              <Controller
                control={control}
                name="contactedFor"
                render={({ field }) => (
                  <div
                    role="group"
                    aria-label="Contacted for"
                    className="flex min-h-9 flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-input bg-transparent px-3 py-2 shadow-sm"
                  >
                    {CONTACTED_FOR_OPTIONS.map((option) => {
                      const selected = field.value || [];
                      const checked = selected.includes(option);
                      return (
                        <label
                          key={option}
                          className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                            checked={checked}
                            onChange={(e) =>
                              field.onChange(
                                e.target.checked
                                  ? [...selected, option]
                                  : selected.filter((v) => v !== option)
                              )
                            }
                          />
                          {option}
                        </label>
                      );
                    })}
                  </div>
                )}
              />
            </Field>

            <Field label="Mobile" htmlFor="mobile" required={isIndividual} error={errors.mobile}>
              <Input
                id="mobile"
                placeholder="+91 98765 43210"
                {...register('mobile')}
              />
            </Field>

            <Field label="Email" htmlFor="email" error={errors.email}>
              <Input
                id="email"
                type="email"
                placeholder={isIndividual ? 'person@example.com' : 'contact@business.com'}
                {...register('email')}
              />
            </Field>

            <Field label="City" htmlFor="city">
              <Input id="city" placeholder="Mumbai" {...register('city')} />
            </Field>

            <Field label="Status" htmlFor="status" error={errors.status}>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            {isAdmin ? (
              <Field label="Assigned to" htmlFor="assignedTo">
                <Controller
                  control={control}
                  name="assignedTo"
                  render={({ field }) => (
                    <Select
                      value={field.value || UNASSIGNED}
                      onValueChange={(value) =>
                        field.onChange(value === UNASSIGNED ? '' : value)
                      }
                    >
                      <SelectTrigger id="assignedTo">
                        <SelectValue placeholder="Select executive" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>
                          Unassigned (default to me)
                        </SelectItem>
                        {execs.map((e) => (
                          <SelectItem key={e._id} value={e._id}>
                            {e.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            ) : null}
          </CardContent>
        </Card>

        {/* Internal notes & follow-ups — only when creating a new lead. */}
        {!isEdit ? (
          <Card className="min-w-0 xl:sticky xl:top-[72px]">
            <CardHeader>
              <CardTitle>Notes (optional)</CardTitle>
              <CardDescription>
                Capture internal notes or a follow-up now. You can always add
                more from the lead&apos;s page later.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Internal notes */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <StickyNote className="h-4 w-4 text-muted-foreground" />
                    Internal notes
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => notesFA.append({ body: '' })}
                  >
                    <Plus className="h-4 w-4" />
                    Add note
                  </Button>
                </div>
                {notesFA.fields.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No notes added.</p>
                ) : (
                  <div className="space-y-2">
                    {notesFA.fields.map((field, index) => (
                      <div key={field.id} className="flex items-start gap-2">
                        <Textarea
                          rows={2}
                          placeholder="Write an internal note..."
                          {...register(`notes.${index}.body`)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove note"
                          onClick={() => notesFA.remove(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Follow-ups */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-muted-foreground" />
                    Follow-ups
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => followUpsFA.append({ dueDate: '', note: '' })}
                  >
                    <Plus className="h-4 w-4" />
                    Add follow-up
                  </Button>
                </div>
                {followUpsFA.fields.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No follow-ups scheduled.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {followUpsFA.fields.map((field, index) => (
                      <div
                        key={field.id}
                        className="flex flex-col gap-2 sm:flex-row sm:items-center"
                      >
                        <Input
                          type="date"
                          className="sm:w-44"
                          {...register(`followUps.${index}.dueDate`)}
                        />
                        <Input
                          placeholder="Note (optional)"
                          {...register(`followUps.${index}.note`)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove follow-up"
                          onClick={() => followUpsFA.remove(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">
                      A follow-up needs a date to be saved.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Sticky action bar so Save is always within reach on a long form. */}
        <div className="form-action-bar xl:col-span-2">
          <p className="hidden text-xs text-muted-foreground sm:block">
            {dupResult?.exactMatch
              ? 'Resolve the duplicate above to continue.'
              : isEdit
                ? 'Changes apply immediately after saving.'
                : 'You can add enquiries and rate contracts once the lead is created.'}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(isEdit ? `/leads/${id}` : '/leads')}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || Boolean(dupResult?.exactMatch)}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isEdit ? 'Save changes' : 'Create lead'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

export { LeadFormPage };
export default LeadFormPage;
