import { useEffect, useState } from 'react';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarClock, Loader2, Plus, Save, StickyNote, Trash2 } from 'lucide-react';
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
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { CONTACTED_FOR_OPTIONS, toContactedForArray } from '@/pages/LeadFormPage';

const UNASSIGNED = '__unassigned__';

const schema = z.object({
  name: z.string().trim().min(1, 'Full name is required'),
  mobile: z.string().trim().min(1, 'Mobile is required'),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')).optional(),
  city: z.string().trim().optional(),
  contactedFor: z.array(z.enum(CONTACTED_FOR_OPTIONS)).optional(),
  status: z.enum(LEAD_STATUSES),
  assignedTo: z.string().optional(),
  notes: z.array(z.object({ body: z.string().optional() })).optional(),
  followUps: z.array(z.object({ dueDate: z.string().optional(), note: z.string().optional() })).optional(),
});

const EMPTY = {
  name: '',
  mobile: '',
  email: '',
  city: '',
  contactedFor: [],
  status: 'Non Contracted',
  assignedTo: '',
  notes: [],
  followUps: [],
};

function Field({ label, htmlFor, error, required, className, children }) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} className="mb-1.5 inline-block">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? <p className="mt-1 text-xs text-destructive">{error.message}</p> : null}
    </div>
  );
}

/**
 * New lead: only the person — who they are and how to reach them. "Create
 * lead" carries straight on to linking them to a company or individual;
 * "Save as lead" parks them in the Leads list to be linked later.
 * With an :id it edits a lead that has not been linked yet.
 */
function ProspectFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const canAssign = ['admin', 'manager'].includes(user?.role);
  const [loading, setLoading] = useState(isEdit);
  const [execs, setExecs] = useState([]);
  const [submitMode, setSubmitMode] = useState(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const notesFA = useFieldArray({ control, name: 'notes' });
  const followUpsFA = useFieldArray({ control, name: 'followUps' });

  // "Create new" from a picker passes the searched name.
  useEffect(() => {
    if (isEdit) return;
    const name = searchParams.get('name') || searchParams.get('businessName');
    if (name) reset({ ...EMPTY, name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!canAssign) return;
    api
      .get('/leads/assignees')
      .then((res) => setExecs(res?.data?.data?.users || []))
      .catch(() => {});
  }, [canAssign]);

  useEffect(() => {
    if (!isEdit) return;
    let active = true;
    api
      .get(`/prospects/${id}`)
      .then((res) => {
        const p = res?.data?.data?.prospect;
        if (!active || !p) return;
        if (p.classifiedAt) {
          navigate(`/prospects/${id}`, { replace: true });
          return;
        }
        reset({
          name: p.name || '',
          mobile: p.mobile || '',
          email: p.email || '',
          city: p.city || '',
          contactedFor: toContactedForArray(p.contactedFor),
          status: LEAD_STATUSES.includes(p.status) ? p.status : 'Non Contracted',
          assignedTo: p.assignedTo?._id || p.assignedTo || '',
          notes: [],
          followUps: [],
        });
      })
      .catch((err) => {
        toast.error(getErrorMessage(err, 'Failed to load lead'));
        navigate('/prospects');
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id, isEdit, reset, navigate]);

  const submit = (mode) =>
    handleSubmit(async (values) => {
      setSubmitMode(mode);
      const payload = {
        name: values.name.trim(),
        mobile: values.mobile.trim(),
        email: (values.email || '').trim(),
        city: (values.city || '').trim(),
        contactedFor: values.contactedFor || [],
        status: values.status,
      };
      if (canAssign) payload.assignedTo = values.assignedTo || '';
      try {
        if (isEdit) {
          await api.patch(`/prospects/${id}`, payload);
          toast.success('Lead updated');
          navigate(`/prospects/${id}`);
          return;
        }
        payload.notes = (values.notes || [])
          .map((n) => ({ body: (n.body || '').trim() }))
          .filter((n) => n.body);
        payload.followUps = (values.followUps || [])
          .filter((f) => f.dueDate)
          .map((f) => ({ dueDate: f.dueDate, note: (f.note || '').trim() }));
        const res = await api.post('/prospects', payload);
        const created = res?.data?.data?.prospect;
        if (mode === 'save') {
          toast.success('Lead saved — link it to a company or individual when ready');
          navigate('/prospects');
        } else {
          toast.success('Lead created');
          navigate(`/prospects/${created._id}`);
        }
      } catch (err) {
        toast.error(getErrorMessage(err, 'Failed to save lead'));
      } finally {
        setSubmitMode(null);
      }
    });

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title={isEdit ? 'Edit lead' : 'New lead'} />

      <form
        onSubmit={submit('create')}
        className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_350px]"
        noValidate
      >
        <Card className={isEdit ? 'xl:col-span-2' : 'min-w-0'}>
          <CardHeader>
            <CardTitle>Person details</CardTitle>
            <CardDescription>
              Who this person is and how to reach them. Name and phone together identify a person.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="name" required error={errors.name} className="sm:col-span-2">
              <Input id="name" placeholder="Ravi Sharma" autoFocus {...register('name')} />
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
                      return (
                        <label key={option} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                            checked={selected.includes(option)}
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

            <Field label="Mobile" htmlFor="mobile" required error={errors.mobile}>
              <Input id="mobile" placeholder="+91 98765 43210" {...register('mobile')} />
            </Field>

            <Field label="Email" htmlFor="email" error={errors.email}>
              <Input id="email" type="email" placeholder="person@example.com" {...register('email')} />
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

            {canAssign ? (
              <Field label="Assigned to" htmlFor="assignedTo">
                <Controller
                  control={control}
                  name="assignedTo"
                  render={({ field }) => (
                    <Select
                      value={field.value || UNASSIGNED}
                      onValueChange={(v) => field.onChange(v === UNASSIGNED ? '' : v)}
                    >
                      <SelectTrigger id="assignedTo">
                        <SelectValue placeholder="Select executive" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>Unassigned (default to me)</SelectItem>
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

        {!isEdit ? (
          <Card className="min-w-0 xl:sticky xl:top-[72px]">
            <CardHeader>
              <CardTitle>Notes (optional)</CardTitle>
              <CardDescription>
                Capture internal notes or a follow-up now. You can always add more from the lead&apos;s page later.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <StickyNote className="h-4 w-4 text-muted-foreground" />
                    Internal notes
                  </Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => notesFA.append({ body: '' })}>
                    <Plus className="h-4 w-4" />
                    Add note
                  </Button>
                </div>
                {notesFA.fields.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No notes added.</p>
                ) : (
                  notesFA.fields.map((field, index) => (
                    <div key={field.id} className="flex items-start gap-2">
                      <Textarea rows={2} placeholder="Write an internal note..." {...register(`notes.${index}.body`)} />
                      <Button type="button" variant="ghost" size="icon" aria-label="Remove note" onClick={() => notesFA.remove(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>

              <Separator />

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
                  <p className="text-sm text-muted-foreground">No follow-ups scheduled.</p>
                ) : (
                  <>
                    {followUpsFA.fields.map((field, index) => (
                      <div key={field.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input type="date" className="sm:w-44" {...register(`followUps.${index}.dueDate`)} />
                        <Input placeholder="Note (optional)" {...register(`followUps.${index}.note`)} />
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
                    <p className="text-xs text-muted-foreground">A follow-up needs a date to be saved.</p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="form-action-bar xl:col-span-2">
          <p className="hidden text-xs text-muted-foreground sm:block">
            {isEdit
              ? 'Changes apply immediately after saving.'
              : 'Next you link this person to a company or individual, then raise the enquiry.'}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(isEdit ? `/prospects/${id}` : '/prospects')}
            >
              {isEdit ? <ArrowLeft className="h-4 w-4" /> : null}
              Cancel
            </Button>
            {isEdit ? (
              <Button type="button" disabled={isSubmitting} onClick={submit('edit')}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save changes
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" disabled={isSubmitting} onClick={submit('save')}>
                  {submitMode === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save as lead
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {submitMode === 'create' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  Create lead
                </Button>
              </>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

export { ProspectFormPage };
export default ProspectFormPage;
