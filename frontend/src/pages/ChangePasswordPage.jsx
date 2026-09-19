import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, KeyRound, Check, Circle } from 'lucide-react';

import { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
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
  hint,
}) {
  const [show, setShow] = useState(false);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
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
          className={cn('pr-11', pinLength && 'tracking-[0.3em]')}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          disabled={disabled}
          {...registration}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-md text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          aria-label={show ? `Hide ${pinLength ? 'PIN' : 'password'}` : `Show ${pinLength ? 'PIN' : 'password'}`}
          aria-pressed={show}
          disabled={disabled}
        >
          {show ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Live checklist mirroring the schema rules; ticks as the user types. */
function RequirementsChecklist({ items }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="eyebrow mb-2">Requirements</p>
      <ul className="space-y-1.5" aria-label="Password requirements">
        {items.map((item) => (
          <li
            key={item.label}
            className={cn(
              'flex items-center gap-2 text-sm transition-colors duration-150',
              item.met ? 'text-success' : 'text-muted-foreground'
            )}
          >
            {item.met ? (
              <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-success/15">
                <Check className="h-3 w-3" aria-hidden="true" strokeWidth={3} />
              </span>
            ) : (
              <Circle className="h-4 w-4 flex-shrink-0 opacity-50" aria-hidden="true" />
            )}
            <span>
              {item.label}
              <span className="sr-only">{item.met ? ' — met' : ' — not yet met'}</span>
            </span>
          </li>
        ))}
      </ul>
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
  const currentPassword = watch('currentPassword');
  const newPassword = watch('newPassword');
  const confirm = watch('confirm');
  const pinLength = MODES[mode]?.length;
  const noun = pinLength ? 'PIN' : 'password';

  const requirements = pinLength
    ? [
        { label: `Exactly ${pinLength} digits`, met: newPassword.length === pinLength },
        { label: 'Numbers only', met: newPassword.length > 0 && /^\d+$/.test(newPassword) },
        {
          label: 'Different from your current password',
          met: newPassword.length > 0 && newPassword !== currentPassword,
        },
        { label: 'Confirmation matches', met: newPassword.length > 0 && newPassword === confirm },
      ]
    : [
        { label: 'At least 8 characters', met: newPassword.length >= 8 },
        {
          label: 'Different from your current password',
          met: newPassword.length > 0 && newPassword !== currentPassword,
        },
        { label: 'Confirmation matches', met: newPassword.length > 0 && newPassword === confirm },
      ];

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
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Change password"
        description="Update the password used to sign in to your account. You will stay signed in on this device."
      />

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <KeyRound className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <CardTitle>Account security</CardTitle>
                <CardDescription>
                  {isAdmin
                    ? 'Use a strong password, or a PIN for quick sign-in.'
                    : "Choose a strong password you don't use elsewhere."}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <section className="space-y-4">
              <p className="eyebrow">Verify it's you</p>
              <PasswordField
                id="currentPassword"
                label="Current password"
                autoComplete="current-password"
                registration={register('currentPassword')}
                error={errors.currentPassword}
                disabled={isSubmitting}
                hint="Enter the password you sign in with today."
              />
            </section>

            <section className="space-y-4">
              <p className="eyebrow">New {noun}</p>

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
                    PINs are available to administrators only. Switching type clears the fields
                    below.
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

              <RequirementsChecklist items={requirements} />
            </section>
          </CardContent>

          <CardFooter className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end sm:pt-6">
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
