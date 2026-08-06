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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { PageHeader } from '@/components/PageHeader';

// Admins may pick a PIN instead of a text password; other roles are locked to
// 'text'. The mode lives in the form values so a single static schema can
// validate every variant (no resolver swapping on mode change).
const MODES = {
  text: { label: 'Text password' },
  pin4: { label: '4-digit PIN', length: 4 },
  pin6: { label: '6-digit PIN', length: 6 },
};

const changePasswordSchema = z
  .object({
    mode: z.enum(['text', 'pin4', 'pin6']),
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(1, 'New password is required'),
    confirm: z.string().min(1, 'Please confirm your new password'),
  })
  .superRefine((data, ctx) => {
    const issue = (message) =>
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['newPassword'],
        message,
      });
    if (data.mode === 'pin4' && !/^\d{4}$/.test(data.newPassword)) {
      issue('PIN must be exactly 4 digits');
    } else if (data.mode === 'pin6' && !/^\d{6}$/.test(data.newPassword)) {
      issue('PIN must be exactly 6 digits');
    } else if (data.mode === 'text' && data.newPassword.length < 8) {
      issue('New password must be at least 8 characters');
    }
  })
  .refine((data) => data.newPassword === data.confirm, {
    path: ['confirm'],
    message: 'Entries do not match',
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
  pinLength,
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
          placeholder={pinLength ? '•'.repeat(pinLength) : '••••••••'}
          inputMode={pinLength ? 'numeric' : undefined}
          pattern={pinLength ? '[0-9]*' : undefined}
          maxLength={pinLength || 128}
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
  const { user, changePassword } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    clearErrors,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      mode: 'text',
      currentPassword: '',
      newPassword: '',
      confirm: '',
    },
  });

  const mode = watch('mode');
  const pinLength = MODES[mode]?.length;
  const noun = pinLength ? 'PIN' : 'password';

  function handleModeChange(nextMode) {
    setValue('mode', nextMode);
    // A half-typed value from the previous mode would fail the new rules.
    setValue('newPassword', '');
    setValue('confirm', '');
    clearErrors(['newPassword', 'confirm']);
  }

  const onSubmit = async (values) => {
    try {
      await changePassword(values.currentPassword, values.newPassword);
      toast.success(`${pinLength ? 'PIN' : 'Password'} changed successfully`);
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
                  {isAdmin
                    ? 'Use a strong password, or a PIN for quick sign-in.'
                    : "Choose a strong password you don't use elsewhere."}
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

            {isAdmin ? (
              <div className="space-y-2">
                <Label htmlFor="password-mode">New password type</Label>
                <Select
                  value={mode}
                  onValueChange={handleModeChange}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="password-mode">
                    <SelectValue placeholder="Select a type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text password</SelectItem>
                    <SelectItem value="pin4">4-digit PIN</SelectItem>
                    <SelectItem value="pin6">6-digit PIN</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  PINs are available to administrators only.
                </p>
              </div>
            ) : null}

            <PasswordField
              id="newPassword"
              label={pinLength ? `New ${pinLength}-digit PIN` : 'New password'}
              autoComplete="new-password"
              registration={register('newPassword')}
              error={errors.newPassword}
              disabled={isSubmitting}
              pinLength={pinLength}
            />
            <PasswordField
              id="confirm"
              label={`Confirm new ${noun}`}
              autoComplete="new-password"
              registration={register('confirm')}
              error={errors.confirm}
              disabled={isSubmitting}
              pinLength={pinLength}
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
                `Update ${noun}`
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
