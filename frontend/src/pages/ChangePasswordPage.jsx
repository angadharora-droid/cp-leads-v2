import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, KeyRound } from 'lucide-react';

import { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters'),
    confirm: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ['newPassword'],
    message: 'New password must be different from the current one',
  });

function PasswordField({
  id,
  label,
  autoComplete,
  registration,
  error,
  disabled,
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          placeholder="••••••••"
          className="pr-10"
          aria-invalid={!!error}
          disabled={disabled}
          {...registration}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:text-foreground"
          tabIndex={-1}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
      {error ? <p className="text-sm text-destructive">{error.message}</p> : null}
    </div>
  );
}

export default function ChangePasswordPage() {
  const { changePassword } = useAuth();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });

  const onSubmit = async (values) => {
    try {
      await changePassword(values.currentPassword, values.newPassword);
      toast.success('Password changed successfully');
      reset();
      navigate('/');
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to change password');
      // Surface the most likely cause inline on the current-password field.
      setError('currentPassword', { type: 'server', message });
      toast.error(message);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl">
      <PageHeader
        title="Change password"
        description="Update the password used to sign in to your account."
      />

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <KeyRound className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <CardTitle>Account security</CardTitle>
                <CardDescription>
                  Choose a strong password you don&apos;t use elsewhere.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <PasswordField
              id="currentPassword"
              label="Current password"
              autoComplete="current-password"
              registration={register('currentPassword')}
              error={errors.currentPassword}
              disabled={isSubmitting}
            />
            <PasswordField
              id="newPassword"
              label="New password"
              autoComplete="new-password"
              registration={register('newPassword')}
              error={errors.newPassword}
              disabled={isSubmitting}
            />
            <PasswordField
              id="confirm"
              label="Confirm new password"
              autoComplete="new-password"
              registration={register('confirm')}
              error={errors.confirm}
              disabled={isSubmitting}
            />
          </CardContent>

          <CardFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(-1)}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Updating…
                </>
              ) : (
                'Update password'
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
