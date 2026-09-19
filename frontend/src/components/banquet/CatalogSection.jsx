import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import ConfirmDialog from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';

const PRICING_LABEL = { per_pax: 'per guest', flat: 'flat' };

/** One course per line, as typed in the courses box. */
const courseLines = (text) =>
  String(text || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

/** Rupees, or a dash when the option carries no rate. */
export function formatRate(item) {
  if (!item || !item.rate) return '—';
  return `Rs. ${Number(item.rate).toLocaleString('en-IN')} ${PRICING_LABEL[item.pricing] || ''}`.trim();
}

/** Active / inactive pill — colour plus text, never colour alone. */
function ActivePill({ active, pending, onToggle, itemName }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      aria-pressed={active}
      aria-label={`${active ? 'Deactivate' : 'Activate'} ${itemName}`}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
        active
          ? 'border-success/40 bg-success/10 text-success'
          : 'border-border bg-muted text-muted-foreground'
      )}
    >
      {pending ? (
        <Spinner size="sm" className="h-3 w-3 text-current" />
      ) : (
        <span
          className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-success' : 'bg-muted-foreground')}
          aria-hidden="true"
        />
      )}
      {active ? 'Active' : 'Inactive'}
    </button>
  );
}

/**
 * One configurable dropdown for the banquet function form: function types,
 * menu types, add-on menus or liquor packages. Options carrying a rate feed
 * the automatic rack-rate calculation on an enquiry, so the sales team can
 * only pick what is configured here.
 *
 * @param {object} props
 * @param {'functionType'|'menuType'|'addOn'|'liquor'} props.kind
 * @param {React.ComponentType<{className?: string}>} props.icon
 * @param {string} props.title
 * @param {string} props.description
 * @param {Array} props.items
 * @param {() => Promise<void> | void} props.onChanged reload the config
 * @param {boolean} [props.withRate] the option carries money
 * @param {string} [props.placeholder]
 */
function CatalogSection({
  kind,
  icon: Icon,
  title,
  description,
  items = [],
  onChanged,
  withRate = false,
  placeholder,
}) {
  const [draft, setDraft] = useState({ name: '', rate: '', pricing: 'per_pax', courses: '' });
  const [adding, setAdding] = useState(false);
  const [pendingId, setPendingId] = useState(null);
  const [editing, setEditing] = useState(null); // { id, name, rate, pricing, courses }
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');

  const inactive = items.filter((i) => !i.active).length;
  // A menu package carries the courses a Function Prospectus lists its dishes under.
  const withCourses = kind === 'menuType';

  async function add() {
    const name = draft.name.trim();
    if (!name) {
      setError('Enter a name');
      return;
    }
    setError('');
    setAdding(true);
    try {
      await api.post('/banquet/catalog', {
        kind,
        name,
        rate: withRate ? Number(draft.rate) || 0 : 0,
        pricing: withRate ? draft.pricing : 'per_pax',
        ...(withCourses ? { courses: courseLines(draft.courses) } : {}),
      });
      setDraft({ name: '', rate: '', pricing: 'per_pax', courses: '' });
      toast.success(`${title.replace(/s$/, '')} added`);
      await onChanged?.();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to add the option'));
    } finally {
      setAdding(false);
    }
  }

  async function toggle(item) {
    setPendingId(item._id);
    try {
      await api.patch(`/banquet/catalog/${item._id}`, { active: !item.active });
      await onChanged?.();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update the option'));
    } finally {
      setPendingId(null);
    }
  }

  async function saveEdit() {
    const name = (editing.name || '').trim();
    if (!name) return toast.error('Enter a name');
    setPendingId(editing.id);
    try {
      await api.patch(`/banquet/catalog/${editing.id}`, {
        name,
        ...(withRate ? { rate: Number(editing.rate) || 0, pricing: editing.pricing } : {}),
        ...(withCourses ? { courses: courseLines(editing.courses) } : {}),
      });
      setEditing(null);
      toast.success('Option updated');
      await onChanged?.();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update the option'));
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete() {
    try {
      await api.delete(`/banquet/catalog/${deleting._id}`);
      toast.success('Option deleted');
      setDeleting(null);
      await onChanged?.();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete the option'));
      throw err;
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-2.5">
            {Icon ? (
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
            ) : null}
            <div>
              <CardTitle className="text-base">
                {title}
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                  {items.length}
                </span>
              </CardTitle>
              <CardDescription className="mt-0.5">{description}</CardDescription>
            </div>
          </div>
          {inactive ? (
            <p className="text-xs text-muted-foreground">
              {inactive} inactive, hidden from new enquiries
            </p>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Add row */}
        <div
          className={cn(
            'grid gap-2',
            withRate ? 'sm:grid-cols-[minmax(0,1fr)_8rem_9rem_auto]' : 'sm:grid-cols-[minmax(0,1fr)_auto]'
          )}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`${kind}-name`}>Name</Label>
            <Input
              id={`${kind}-name`}
              value={draft.name}
              onChange={(e) => {
                setDraft((d) => ({ ...d, name: e.target.value }));
                if (error) setError('');
              }}
              placeholder={placeholder}
              disabled={adding}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add();
                }
              }}
              aria-invalid={Boolean(error)}
            />
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          {withRate ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor={`${kind}-rate`}>Rate (Rs.)</Label>
                <Input
                  id={`${kind}-rate`}
                  inputMode="decimal"
                  value={draft.rate}
                  onChange={(e) => setDraft((d) => ({ ...d, rate: e.target.value }))}
                  placeholder="1200"
                  disabled={adding}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${kind}-pricing`}>Charged</Label>
                <Select
                  value={draft.pricing}
                  onValueChange={(v) => setDraft((d) => ({ ...d, pricing: v }))}
                >
                  <SelectTrigger id={`${kind}-pricing`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_pax">Per guest</SelectItem>
                    <SelectItem value="flat">Flat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}

          <div className="flex items-end">
            <Button type="button" onClick={add} disabled={adding} className="w-full sm:w-auto">
              {adding ? <Spinner size="sm" className="text-current" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </div>
        </div>
        {withCourses ? (
          <div className="space-y-1.5">
            <Label htmlFor={`${kind}-courses`}>Courses, one per line</Label>
            <Textarea
              id={`${kind}-courses`}
              rows={3}
              value={draft.courses}
              onChange={(e) => setDraft((d) => ({ ...d, courses: e.target.value }))}
              placeholder="Welcome Drinks, Starters, Soups, Salads, Main Course, Desserts — each on its own line"
              disabled={adding}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              A Function Prospectus lists its dishes under exactly these courses; the banquet desk cannot add a course on the sheet.
            </p>
          </div>
        ) : null}

        {/* List */}
        {items.length === 0 ? (
          <EmptyState
            size="compact"
            icon={Icon}
            title={`No ${title.toLowerCase()} yet`}
            description="Add one above — it then appears in the enquiry function form."
          />
        ) : (
          <ul className="divide-y rounded-lg border">
            {items.map((item) => {
              const isEditing = editing?.id === item._id;
              const pending = pendingId === item._id;
              return (
                <li
                  key={item._id}
                  className={cn(
                    'flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between',
                    !item.active && 'bg-muted/40'
                  )}
                >
                  {isEditing ? (
                    <div
                      className={cn(
                        'grid flex-1 gap-2',
                        withRate ? 'sm:grid-cols-[minmax(0,1fr)_8rem_9rem]' : ''
                      )}
                    >
                      <Input
                        value={editing.name}
                        onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))}
                        aria-label="Name"
                        autoFocus
                      />
                      {withRate ? (
                        <>
                          <Input
                            value={editing.rate}
                            inputMode="decimal"
                            onChange={(e) => setEditing((s) => ({ ...s, rate: e.target.value }))}
                            aria-label="Rate in rupees"
                          />
                          <Select
                            value={editing.pricing}
                            onValueChange={(v) => setEditing((s) => ({ ...s, pricing: v }))}
                          >
                            <SelectTrigger aria-label="Charged">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="per_pax">Per guest</SelectItem>
                              <SelectItem value="flat">Flat</SelectItem>
                            </SelectContent>
                          </Select>
                        </>
                      ) : null}
                      {withCourses ? (
                        <Textarea
                          value={editing.courses}
                          onChange={(e) => setEditing((s) => ({ ...s, courses: e.target.value }))}
                          rows={3}
                          aria-label="Courses, one per line"
                          placeholder="Courses, one per line"
                          className={cn('font-mono text-sm', withRate && 'sm:col-span-3')}
                        />
                      ) : null}
                    </div>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.name}
                        {!item.active ? (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            (hidden from new enquiries)
                          </span>
                        ) : null}
                      </p>
                      {withRate ? (
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {formatRate(item)}
                        </p>
                      ) : null}
                      {withCourses ? (
                        <p className="text-xs text-muted-foreground">
                          {item.courses?.length ? item.courses.join(' · ') : 'No courses yet — the prospectus falls back to a free-text menu'}
                        </p>
                      ) : null}
                    </div>
                  )}

                  <div className="flex flex-shrink-0 items-center gap-1.5 self-end sm:self-auto">
                    {isEditing ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditing(null)}
                          disabled={pending}
                          aria-label="Cancel editing"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <Button type="button" size="sm" className="h-10" onClick={saveEdit} disabled={pending}>
                          {pending ? (
                            <Spinner size="sm" className="text-current" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          Save
                        </Button>
                      </>
                    ) : (
                      <>
                        <ActivePill
                          active={item.active}
                          pending={pending}
                          onToggle={() => toggle(item)}
                          itemName={item.name}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setEditing({
                              id: item._id,
                              name: item.name,
                              rate: item.rate ? String(item.rate) : '',
                              pricing: item.pricing || 'per_pax',
                              courses: (item.courses || []).join('\n'),
                            })
                          }
                          disabled={pending || Boolean(editing)}
                          aria-label={`Edit ${item.name}`}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleting(item)}
                          disabled={pending}
                          aria-label={`Delete ${item.name}`}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={handleDelete}
        title="Delete this option?"
        description={
          deleting
            ? `"${deleting.name}" is removed permanently. This only works when no enquiry uses it — otherwise deactivate it instead.`
            : ''
        }
        confirmText="Delete"
        variant="destructive"
      />
    </Card>
  );
}

export { CatalogSection };
export default CatalogSection;
