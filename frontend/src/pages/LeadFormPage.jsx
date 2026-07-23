import { useEffect, useState } from 'react';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Loader2,
  Plus,
  Trash2,
  StickyNote,
  CalendarClock,
} from 'lucide-react';
import { toast } from 'sonner';

import api, { getErrorMessage } from '@/lib/api';
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
  businessName: z.string().trim().min(1, 'Business name is required'),
  contactPerson: z.string().trim().optional(),
  designation: z.string().trim().optional(),
  businessType: z.string().trim().optional(),
  contactedFor: z.array(z.enum(CONTACTED_FOR_OPTIONS)).optional(),
  mobile: z.string().trim().optional(),
  email: optionalEmail,
  city: z.string().trim().optional(),
  status: z.enum(LEAD_STATUSES),
  assignedTo: z.string().optional(),
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
  notes: [],
  followUps: [],
};

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

/**
 * Create / edit a lead. Edit mode is triggered by the presence of an :id param.
 */
function LeadFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState(false);
  const [execs, setExecs] = useState([]);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(leadSchema),
    defaultValues: EMPTY_DEFAULTS,
  });

  // Inline sub-resources captured only when creating a brand-new lead.
  const notesFA = useFieldArray({ control, name: 'notes' });
  const followUpsFA = useFieldArray({ control, name: 'followUps' });

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
        const assignedTo =
          lead.assignedTo && typeof lead.assignedTo === 'object'
            ? lead.assignedTo._id
            : lead.assignedTo || '';
        reset({
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

  const onSubmit = async (values) => {
    // Build a clean payload; drop empty optional strings.
    const SKIP_KEYS = ['assignedTo', 'notes', 'followUps'];
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

    // Inline sub-resources are only sent when creating a new lead. Empty rows
    // are dropped; follow-ups without a date are skipped.
    if (!isEdit) {
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

  return (
    <div className="space-y-5">
      <PageHeader
        title={isEdit ? 'Edit Lead' : 'New Lead'}
        description={
          isEdit
            ? 'Update the details for this lead.'
            : 'Capture a new lead and add it to your pipeline.'
        }
        actions={
          <Button
            variant="outline"
            onClick={() => navigate(isEdit ? `/leads/${id}` : '/leads')}
          >
            <ArrowLeft className="h-4 w-4" />
            Cancel
          </Button>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {/* Lead details */}
        <Card>
          <CardHeader>
            <CardTitle>Lead details</CardTitle>
            <CardDescription>
              Who is this lead and how to reach them.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Business name"
              htmlFor="businessName"
              required
              error={errors.businessName}
              className="sm:col-span-2"
            >
              <Input
                id="businessName"
                placeholder="Acme Hotels Pvt Ltd"
                {...register('businessName')}
              />
            </Field>

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

            <Field label="Mobile" htmlFor="mobile">
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
                placeholder="contact@business.com"
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
          <Card>
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

        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(isEdit ? `/leads/${id}` : '/leads')}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isEdit ? 'Save changes' : 'Create lead'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export { LeadFormPage };
export default LeadFormPage;
