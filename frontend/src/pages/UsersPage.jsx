import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Plus,
  Search,
  Pencil,
  KeyRound,
  UserX,
  Users as UsersIcon,
  ShieldCheck,
  MoreHorizontal,
  Eye,
  EyeOff,
} from 'lucide-react';

import api, { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { formatDateTime, getInitials } from '@/lib/format';
import { MODULES, MODULE_KEYS, userModules } from '@/lib/modules';
import { cn } from '@/lib/utils';

import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import ConfirmDialog from '@/components/ConfirmDialog';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

const ROLE_LABELS = {
  admin: 'Admin',
  sales_exec: 'Executive',
  manager: 'Manager',
};

/* ----------------------------- Validation ------------------------------ */

// Mirrors the server rule: admins may use a 4/6-digit PIN or an 8+ char
// password; every other role needs an 8+ char text password.
function passwordIssueForRole(password, role) {
  if (password.length > 128) return 'Password is too long';
  if (role === 'admin') {
    return /^(\d{4}|\d{6})$/.test(password) || password.length >= 8
      ? null
      : 'Admin passwords must be a 4-digit PIN, a 6-digit PIN, or at least 8 characters';
  }
  return password.length >= 8 ? null : 'Password must be at least 8 characters';
}

const phoneSchema = z
  .string()
  .trim()
  .refine(
    (v) =>
      v === '' ||
      (/^\+?[\d\s\-().]+$/.test(v) && v.replace(/\D/g, '').length >= 10),
    'Enter a valid phone number with at least 10 digits'
  );

// Admins open every section, so the assignment only has to hold for the rest.
function requireOneModule(data, ctx) {
  if (data.role !== 'admin' && !data.modules?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['modules'],
      message: 'Give the user at least one section',
    });
  }
}

const createUserSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120, 'Name is too long'),
    email: z.string().trim().toLowerCase().email('A valid email is required'),
    password: z.string().min(1, 'Password is required'),
    role: z.enum(['admin', 'manager', 'sales_exec']),
    modules: z.array(z.enum(MODULE_KEYS)),
    phone: phoneSchema,
  })
  .superRefine((data, ctx) => {
    const message = passwordIssueForRole(data.password, data.role);
    if (message) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message });
    }
    requireOneModule(data, ctx);
  });

const editUserSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120, 'Name is too long'),
    role: z.enum(['admin', 'manager', 'sales_exec']),
    modules: z.array(z.enum(MODULE_KEYS)),
    isActive: z.enum(['true', 'false']),
    phone: phoneSchema,
  })
  .superRefine(requireOneModule);

// The target's role rides along as a hidden field so one static schema can
// apply the right rule for whichever user the dialog is open for.
const resetPasswordSchema = z
  .object({
    role: z.enum(['admin', 'manager', 'sales_exec']),
    newPassword: z.string().min(1, 'Password is required'),
  })
  .superRefine((data, ctx) => {
    const message = passwordIssueForRole(data.newPassword, data.role);
    if (message) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['newPassword'], message });
    }
  });

const PASSWORD_HINTS = {
  admin: 'PIN (4 or 6 digits) or password (8+ characters)',
  sales_exec: 'At least 8 characters',
};

/* ---------------------------- Small pieces ----------------------------- */

/** Inline field error, announced to assistive tech. */
function FieldError({ id, error }) {
  if (!error) return null;
  return (
    <p id={id} role="alert" className="text-xs text-destructive">
      {error.message}
    </p>
  );
}

/**
 * Which sections of the app the account opens. Hidden for admins, who get
 * all of them, and it is the Leads CRM alone unless another is ticked.
 */
function ModuleAccessField({ idPrefix, value = [], onChange, error, disabled }) {
  const selected = Array.isArray(value) ? value : [];
  function toggle(key, on) {
    onChange(on ? [...new Set([...selected, key])] : selected.filter((k) => k !== key));
  }
  return (
    <div className="space-y-1.5">
      <Label>Sections</Label>
      <div className="space-y-2 rounded-md border p-3">
        {MODULES.map((m) => (
          <label key={m.key} htmlFor={`${idPrefix}-module-${m.key}`} className="flex items-start gap-2.5">
            <input
              id={`${idPrefix}-module-${m.key}`}
              type="checkbox"
              checked={selected.includes(m.key)}
              onChange={(e) => toggle(m.key, e.target.checked)}
              disabled={disabled}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{m.label}</span>
              <span className="block text-xs text-muted-foreground">{m.hint}</span>
            </span>
          </label>
        ))}
      </div>
      <FieldError id={`${idPrefix}-modules-error`} error={error} />
    </div>
  );
}

/** Password input with an accessible show/hide toggle. */
function PasswordInput({ id, registration, error, describedBy, ...props }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        className="pr-11"
        aria-invalid={!!error}
        aria-describedby={describedBy}
        {...props}
        {...registration}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-md text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
      >
        {show ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

function Avatar({ name, inactive, className }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex h-9 w-9 flex-shrink-0 select-none items-center justify-center rounded-full text-xs font-semibold',
        inactive ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary',
        className
      )}
    >
      {getInitials(name)}
    </span>
  );
}

/** The sections an account opens, spelled out under its role. */
function ModulesText({ user }) {
  if (user?.role === 'admin') return null;
  const labels = MODULES.filter((m) => userModules(user).includes(m.key)).map((m) => m.label);
  if (!labels.length) return null;
  return <p className="text-xs text-muted-foreground">{labels.join(' · ')}</p>;
}

function RoleBadge({ role }) {
  if (role === 'admin') {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-primary/25 bg-primary/10 text-primary"
      >
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        {ROLE_LABELS.admin}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-transparent bg-muted text-muted-foreground">
      {ROLE_LABELS[role] || role}
    </Badge>
  );
}

function StatusText({ active }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-sm',
        active ? 'text-foreground' : 'text-muted-foreground'
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'h-2 w-2 flex-shrink-0 rounded-full',
          active ? 'bg-success' : 'bg-muted-foreground/50'
        )}
      />
      {active ? 'Active' : 'Deactivated'}
    </span>
  );
}

function UserActionsMenu({ user, isSelf, onEdit, onResetPassword, onDeactivate }) {
  const canDeactivate = user.isActive && !isSelf;
  const deactivateHint = isSelf
    ? 'You cannot deactivate yourself'
    : !user.isActive
    ? 'Already deactivated'
    : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Actions for ${user.name}`}
          className="text-muted-foreground hover:text-foreground"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        <DropdownMenuLabel className="truncate text-xs font-medium text-muted-foreground">
          {user.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onEdit} className="min-h-[2.5rem]">
          <Pencil aria-hidden="true" />
          Edit user
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onResetPassword} className="min-h-[2.5rem]">
          <KeyRound aria-hidden="true" />
          Reset password
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onDeactivate}
          disabled={!canDeactivate}
          className="min-h-[2.5rem] text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <UserX aria-hidden="true" />
          <span className="flex flex-col">
            <span>Deactivate</span>
            {deactivateHint ? (
              <span className="text-[11px] font-normal text-muted-foreground">
                {deactivateHint}
              </span>
            ) : null}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------ Sub-forms ------------------------------ */

function CreateUserDialog({ open, onOpenChange, onCreated }) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: '', email: '', password: '', role: 'sales_exec', modules: ['leads'], phone: '' },
  });

  const roleValue = watch('role');
  const moduleValue = watch('modules');

  useEffect(() => {
    if (open) {
      reset({ name: '', email: '', password: '', role: 'sales_exec', modules: ['leads'], phone: '' });
    }
  }, [open, reset]);

  async function onSubmit(values) {
    try {
      const payload = { ...values, modules: values.role === 'admin' ? MODULE_KEYS : values.modules };
      const res = await api.post('/users', payload);
      const created = res?.data?.data?.user;
      toast.success(`User ${created?.email || ''} created`);
      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create user'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>
            Create a new account. They can sign in with the password you set here.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="create-name">Full name</Label>
            <Input
              id="create-name"
              placeholder="e.g. Ravi Sharma"
              autoComplete="off"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'create-name-error' : undefined}
              disabled={isSubmitting}
              {...register('name')}
            />
            <FieldError id="create-name-error" error={errors.name} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-email">Email</Label>
            <Input
              id="create-email"
              type="email"
              autoComplete="off"
              placeholder="name@cph.local"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'create-email-error' : undefined}
              disabled={isSubmitting}
              {...register('email')}
            />
            <FieldError id="create-email-error" error={errors.email} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-phone">
              Phone number{' '}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="create-phone"
              type="tel"
              autoComplete="off"
              placeholder="+91 98765 43210"
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? 'create-phone-error' : 'create-phone-hint'}
              disabled={isSubmitting}
              {...register('phone')}
            />
            <FieldError id="create-phone-error" error={errors.phone} />
            {roleValue === 'admin' ? (
              <p id="create-phone-hint" className="text-xs text-muted-foreground">
                Admins can sign in with their phone number.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-role">Role</Label>
            <Select
              value={roleValue}
              onValueChange={(v) =>
                setValue('role', v, { shouldValidate: true, shouldDirty: true })
              }
              disabled={isSubmitting}
            >
              <SelectTrigger id="create-role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sales_exec">Executive</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {roleValue === 'admin'
                ? 'Admins manage users, settings and the banquet setup.'
                : roleValue === 'manager'
                  ? 'Managers see all executives? records in their sections and approve FP sheets and estimates.'
                  : 'Executives work on their own records and prepare FP sheets or estimates in their assigned sections.'}
            </p>
            <FieldError id="create-role-error" error={errors.role} />
          </div>

          {roleValue === 'admin' ? null : (
            <ModuleAccessField
              idPrefix="create"
              value={moduleValue}
              onChange={(next) => setValue('modules', next, { shouldValidate: true, shouldDirty: true })}
              error={errors.modules}
              disabled={isSubmitting}
            />
          )}

          <div className="space-y-1.5">
            <Label htmlFor="create-password">Temporary password</Label>
            <PasswordInput
              id="create-password"
              autoComplete="new-password"
              placeholder={PASSWORD_HINTS[roleValue] || PASSWORD_HINTS.sales_exec}
              registration={register('password')}
              error={errors.password}
              describedBy={errors.password ? 'create-password-error' : 'create-password-hint'}
              disabled={isSubmitting}
            />
            <FieldError id="create-password-error" error={errors.password} />
            <p id="create-password-hint" className="text-xs text-muted-foreground">
              {PASSWORD_HINTS[roleValue] || PASSWORD_HINTS.sales_exec}. Share it with
              them privately; they can change it after signing in.
            </p>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Spinner size="sm" className="text-current" /> : null}
              Create user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ open, onOpenChange, user, onSaved }) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(editUserSchema),
    defaultValues: { name: '', role: 'sales_exec', modules: ['leads'], isActive: 'true', phone: '' },
  });

  const roleValue = watch('role');
  const activeValue = watch('isActive');
  const moduleValue = watch('modules');

  useEffect(() => {
    if (open && user) {
      reset({
        name: user.name || '',
        role: user.role || 'sales_exec',
        modules: user.modules?.length ? user.modules : ['leads'],
        isActive: user.isActive ? 'true' : 'false',
        phone: user.phone || '',
      });
    }
  }, [open, user, reset]);

  async function onSubmit(values) {
    if (!user) return;
    const payload = {
      name: values.name,
      role: values.role,
      modules: values.role === 'admin' ? MODULE_KEYS : values.modules,
      isActive: values.isActive === 'true',
      phone: values.phone, // '' clears the number on the server
    };
    try {
      const res = await api.patch(`/users/${user._id}`, payload);
      const updated = res?.data?.data?.user;
      toast.success(`Updated ${updated?.email || user.email}`);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update user'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3 text-left">
            {user ? <Avatar name={user.name} inactive={!user.isActive} className="h-10 w-10 text-sm" /> : null}
            <div className="min-w-0">
              <DialogTitle>Edit user</DialogTitle>
              <DialogDescription className="truncate">{user?.email}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Full name</Label>
            <Input
              id="edit-name"
              autoComplete="off"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'edit-name-error' : undefined}
              disabled={isSubmitting}
              {...register('name')}
            />
            <FieldError id="edit-name-error" error={errors.name} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-phone">
              Phone number{' '}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="edit-phone"
              type="tel"
              autoComplete="off"
              placeholder="+91 98765 43210"
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? 'edit-phone-error' : 'edit-phone-hint'}
              disabled={isSubmitting}
              {...register('phone')}
            />
            <FieldError id="edit-phone-error" error={errors.phone} />
            {roleValue === 'admin' ? (
              <p id="edit-phone-hint" className="text-xs text-muted-foreground">
                Admins can sign in with their phone number.
              </p>
            ) : null}
          </div>

          {roleValue === 'admin' ? null : (
            <ModuleAccessField
              idPrefix="edit"
              value={moduleValue}
              onChange={(next) => setValue('modules', next, { shouldValidate: true, shouldDirty: true })}
              error={errors.modules}
              disabled={isSubmitting}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-role">Role</Label>
              <Select
                value={roleValue}
                onValueChange={(v) =>
                  setValue('role', v, { shouldValidate: true, shouldDirty: true })
                }
                disabled={isSubmitting}
              >
                <SelectTrigger id="edit-role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales_exec">Executive</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-active">Status</Label>
              <Select
                value={activeValue}
                onValueChange={(v) =>
                  setValue('isActive', v, { shouldValidate: true, shouldDirty: true })
                }
                disabled={isSubmitting}
              >
                <SelectTrigger id="edit-active">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Deactivated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Deactivated users keep their history but can no longer sign in.
          </p>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Spinner size="sm" className="text-current" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ open, onOpenChange, user, onDone }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { role: 'sales_exec', newPassword: '' },
  });

  useEffect(() => {
    if (open) reset({ role: user?.role || 'sales_exec', newPassword: '' });
  }, [open, user, reset]);

  async function onSubmit(values) {
    if (!user) return;
    try {
      await api.patch(`/users/${user._id}/password`, {
        newPassword: values.newPassword,
      });
      toast.success(`Password reset for ${user.email}`);
      onDone?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to reset password'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for {user?.email}. They will use it on their next sign-in.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="reset-password">New password</Label>
            <PasswordInput
              id="reset-password"
              autoComplete="new-password"
              placeholder={PASSWORD_HINTS[user?.role] || PASSWORD_HINTS.sales_exec}
              registration={register('newPassword')}
              error={errors.newPassword}
              describedBy={errors.newPassword ? 'reset-password-error' : 'reset-password-hint'}
              disabled={isSubmitting}
            />
            <FieldError id="reset-password-error" error={errors.newPassword} />
            <p id="reset-password-hint" className="text-xs text-muted-foreground">
              {user?.role === 'admin'
                ? 'Admins may use a 4 or 6-digit PIN instead of a password.'
                : 'At least 8 characters.'}
            </p>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Spinner size="sm" className="text-current" /> : null}
              Reset password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ Skeletons ------------------------------ */

function UsersSkeleton() {
  const rows = Array.from({ length: 5 });
  return (
    <>
      {/* Mobile: stacked cards */}
      <div className="space-y-3 p-4 md:hidden" aria-busy="true" aria-label="Loading users">
        {rows.map((_, i) => (
          <div key={i} className="rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-3/5" />
                <div className="flex gap-2 pt-1">
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              </div>
              <Skeleton className="h-9 w-9 rounded-md" />
            </div>
          </div>
        ))}
      </div>
      {/* Desktop: table rows */}
      <div className="hidden md:block" aria-busy="true">
        <div className="border-b bg-muted/60 px-4 py-3">
          <Skeleton className="h-3 w-1/3" />
        </div>
        <div className="divide-y">
          {rows.map((_, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_1fr_1fr_1fr_3rem] items-center gap-4 px-4 py-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="ml-auto h-9 w-9 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ------------------------------ Main page ------------------------------ */

export default function UsersPage() {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [deactivateTarget, setDeactivateTarget] = useState(null);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = {};
      if (search.trim()) params.q = search.trim();
      if (roleFilter !== 'all') params.role = roleFilter;
      if (statusFilter !== 'all') params.isActive = statusFilter;

      const res = await api.get('/users', { params });
      setUsers(res?.data?.data?.users ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load users'));
    } finally {
      setIsLoading(false);
    }
  }, [search, roleFilter, statusFilter]);

  // Debounce text search; refetch immediately on dropdown changes.
  useEffect(() => {
    const t = setTimeout(() => {
      fetchUsers();
    }, 300);
    return () => clearTimeout(t);
  }, [fetchUsers]);

  async function handleDeactivate() {
    if (!deactivateTarget) return;
    try {
      await api.delete(`/users/${deactivateTarget._id}`);
      toast.success(`Deactivated ${deactivateTarget.email}`);
      fetchUsers();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to deactivate user'));
      throw err; // keep ConfirmDialog spinner honest on failure
    }
  }

  const activeCount = useMemo(
    () => users.filter((u) => u.isActive).length,
    [users]
  );

  const hasFilters = Boolean(search.trim()) || roleFilter !== 'all' || statusFilter !== 'all';

  function clearFilters() {
    setSearch('');
    setRoleFilter('all');
    setStatusFilter('all');
  }

  function isSelfUser(u) {
    return Boolean(
      currentUser && String(currentUser.id || currentUser._id) === String(u._id)
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="Manage team accounts, roles, and access." />

      {/* Filters + the one primary action, on a single row. */}
      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_11rem_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="users-search" className="eyebrow text-[11px] font-semibold">
              Search
            </Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="users-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, email or phone"
                className="pl-9"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="users-role" className="eyebrow text-[11px] font-semibold">
              Role
            </Label>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger id="users-role">
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="sales_exec">Executive</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="users-status" className="eyebrow text-[11px] font-semibold">
              Status
            </Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger id="users-status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="true">Active</SelectItem>
                <SelectItem value="false">Deactivated</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add user
          </Button>
        </div>
      </Card>

      {/* List */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <UsersSkeleton />
        ) : users.length === 0 ? (
          <div className="p-4 sm:p-6">
            <EmptyState
              icon={UsersIcon}
              title={hasFilters ? 'No users match these filters' : 'No users yet'}
              description={
                hasFilters
                  ? 'Try a different search or clear the filters to see everyone.'
                  : 'Add your first team member so they can sign in and start working leads.'
              }
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {hasFilters ? (
                    <Button variant="outline" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : null}
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add user
                  </Button>
                </div>
              }
            />
          </div>
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <ul className="divide-y md:hidden" aria-label="Users">
              {users.map((u) => {
                const isSelf = isSelfUser(u);
                return (
                  <li key={u._id} className="flex items-start gap-3 p-4">
                    <Avatar name={u.name} inactive={!u.isActive} className="h-10 w-10 text-sm" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="truncate text-sm font-medium text-foreground">{u.name}</p>
                        {isSelf ? (
                          <Badge variant="outline" className="text-[10px]">
                            You
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                      {u.phone ? (
                        <p className="text-xs text-muted-foreground tabular">{u.phone}</p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                        <RoleBadge role={u.role} />
                        <StatusText active={u.isActive} />
                      </div>
                      <ModulesText user={u} />
                      <p className="text-xs text-muted-foreground">
                        Last login: {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}
                      </p>
                    </div>
                    <UserActionsMenu
                      user={u}
                      isSelf={isSelf}
                      onEdit={() => setEditTarget(u)}
                      onResetPassword={() => setResetTarget(u)}
                      onDeactivate={() => setDeactivateTarget(u)}
                    />
                  </li>
                );
              })}
            </ul>

            {/* Desktop: table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last login</TableHead>
                    <TableHead className="w-16 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const isSelf = isSelfUser(u);
                    return (
                      <TableRow key={u._id}>
                        <TableCell className="font-medium text-foreground">
                          <span className="inline-flex items-center gap-3">
                            <Avatar name={u.name} inactive={!u.isActive} />
                            <span className="inline-flex items-center gap-2">
                              {u.name}
                              {isSelf ? (
                                <Badge variant="outline" className="text-[10px]">
                                  You
                                </Badge>
                              ) : null}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <div className="truncate">{u.email}</div>
                          {u.phone ? (
                            <div className="text-xs tabular">{u.phone}</div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <RoleBadge role={u.role} />
                          <ModulesText user={u} />
                        </TableCell>
                        <TableCell>
                          <StatusText active={u.isActive} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}
                        </TableCell>
                        <TableCell className="text-right">
                          <UserActionsMenu
                            user={u}
                            isSelf={isSelf}
                            onEdit={() => setEditTarget(u)}
                            onResetPassword={() => setResetTarget(u)}
                            onDeactivate={() => setDeactivateTarget(u)}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>

      {!isLoading && users.length > 0 ? (
        <p className="text-xs text-muted-foreground tabular">
          {users.length} user{users.length === 1 ? '' : 's'} · {activeCount} active
        </p>
      ) : null}

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={fetchUsers}
      />

      <EditUserDialog
        open={!!editTarget}
        onOpenChange={(next) => !next && setEditTarget(null)}
        user={editTarget}
        onSaved={fetchUsers}
      />

      <ResetPasswordDialog
        open={!!resetTarget}
        onOpenChange={(next) => !next && setResetTarget(null)}
        user={resetTarget}
        onDone={fetchUsers}
      />

      <ConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(next) => !next && setDeactivateTarget(null)}
        onConfirm={handleDeactivate}
        title="Deactivate user?"
        description={
          deactivateTarget
            ? `${deactivateTarget.name} (${deactivateTarget.email}) will lose access. You can re-activate them later by editing the user.`
            : ''
        }
        confirmText="Deactivate"
        variant="destructive"
      />
    </div>
  );
}
