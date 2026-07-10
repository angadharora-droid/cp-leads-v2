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
} from 'lucide-react';

import api, { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { formatDateTime } from '@/lib/format';

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

const ROLE_LABELS = {
  admin: 'Admin',
  sales_exec: 'Sales Executive',
};

/* ----------------------------- Validation ------------------------------ */

const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120, 'Name is too long'),
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(128, 'Password is too long'),
  role: z.enum(['admin', 'sales_exec']),
});

const editUserSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120, 'Name is too long'),
  role: z.enum(['admin', 'sales_exec']),
  isActive: z.enum(['true', 'false']),
});

const resetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(128, 'Password is too long'),
});

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
    defaultValues: { name: '', email: '', password: '', role: 'sales_exec' },
  });

  const roleValue = watch('role');

  useEffect(() => {
    if (open) {
      reset({ name: '', email: '', password: '', role: 'sales_exec' });
    }
  }, [open, reset]);

  async function onSubmit(values) {
    try {
      const res = await api.post('/users', values);
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

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="create-name">Full name</Label>
            <Input id="create-name" placeholder="e.g. Ravi Sharma" {...register('name')} />
            {errors.name ? (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-email">Email</Label>
            <Input
              id="create-email"
              type="email"
              autoComplete="off"
              placeholder="name@cph.local"
              {...register('email')}
            />
            {errors.email ? (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-password">Temporary password</Label>
            <Input
              id="create-password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 6 characters"
              {...register('password')}
            />
            {errors.password ? (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-role">Role</Label>
            <Select
              value={roleValue}
              onValueChange={(v) =>
                setValue('role', v, { shouldValidate: true, shouldDirty: true })
              }
            >
              <SelectTrigger id="create-role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sales_exec">Sales Executive</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            {errors.role ? (
              <p className="text-xs text-destructive">{errors.role.message}</p>
            ) : null}
          </div>

          <DialogFooter className="gap-2">
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
    defaultValues: { name: '', role: 'sales_exec', isActive: 'true' },
  });

  const roleValue = watch('role');
  const activeValue = watch('isActive');

  useEffect(() => {
    if (open && user) {
      reset({
        name: user.name || '',
        role: user.role || 'sales_exec',
        isActive: user.isActive ? 'true' : 'false',
      });
    }
  }, [open, user, reset]);

  async function onSubmit(values) {
    if (!user) return;
    const payload = {
      name: values.name,
      role: values.role,
      isActive: values.isActive === 'true',
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
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>{user?.email}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Full name</Label>
            <Input id="edit-name" {...register('name')} />
            {errors.name ? (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-role">Role</Label>
            <Select
              value={roleValue}
              onValueChange={(v) =>
                setValue('role', v, { shouldValidate: true, shouldDirty: true })
              }
            >
              <SelectTrigger id="edit-role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sales_exec">Sales Executive</SelectItem>
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

          <DialogFooter className="gap-2">
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
    defaultValues: { newPassword: '' },
  });

  useEffect(() => {
    if (open) reset({ newPassword: '' });
  }, [open, reset]);

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

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reset-password">New password</Label>
            <Input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 6 characters"
              {...register('newPassword')}
            />
            {errors.newPassword ? (
              <p className="text-xs text-destructive">{errors.newPassword.message}</p>
            ) : null}
          </div>

          <DialogFooter className="gap-2">
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Manage team accounts, roles, and access."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Add user
          </Button>
        }
      />

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email"
              className="pl-9"
            />
          </div>

          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="sm:w-48">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="sales_exec">Sales Executive</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="sm:w-44">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="true">Active</SelectItem>
              <SelectItem value="false">Deactivated</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={UsersIcon}
              title="No users found"
              description="Try adjusting your filters, or add a new team member."
              action={
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Add user
                </Button>
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const isSelf = currentUser && String(currentUser.id || currentUser._id) === String(u._id);
                return (
                  <TableRow key={u._id}>
                    <TableCell className="font-medium text-foreground">
                      <span className="inline-flex items-center gap-2">
                        {u.name}
                        {isSelf ? (
                          <Badge variant="outline" className="text-[10px]">
                            You
                          </Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      {u.role === 'admin' ? (
                        <Badge variant="accent" className="gap-1">
                          <ShieldCheck className="h-3 w-3" />
                          {ROLE_LABELS.admin}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">{ROLE_LABELS.sales_exec}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.isActive ? (
                        <Badge variant="default">Active</Badge>
                      ) : (
                        <Badge variant="destructive">Deactivated</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditTarget(u)}
                          title="Edit user"
                        >
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">Edit</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setResetTarget(u)}
                          title="Reset password"
                        >
                          <KeyRound className="h-4 w-4" />
                          <span className="sr-only">Reset password</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeactivateTarget(u)}
                          disabled={!u.isActive || isSelf}
                          title={
                            isSelf
                              ? 'You cannot deactivate yourself'
                              : !u.isActive
                              ? 'Already deactivated'
                              : 'Deactivate user'
                          }
                          className="text-destructive hover:text-destructive"
                        >
                          <UserX className="h-4 w-4" />
                          <span className="sr-only">Deactivate</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {!isLoading && users.length > 0 ? (
        <p className="text-xs text-muted-foreground">
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
