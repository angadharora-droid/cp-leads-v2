import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Building2, Eye, EyeOff, Loader2, FolderKanban, FileSpreadsheet, Receipt, ArrowRight } from 'lucide-react';

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
import { Spinner } from '@/components/ui/spinner';

const PHONE_SHAPE = /^\+?[\d\s\-().]+$/;

const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, 'Email or phone number is required')
    .superRefine((value, ctx) => {
      if (value.includes('@')) {
        if (!z.string().email().safeParse(value).success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Enter a valid email address',
          });
        }
      } else if (
        !PHONE_SHAPE.test(value) ||
        value.replace(/\D/g, '').length < 10
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Enter a valid email address or phone number',
        });
      }
    }),
  password: z.string().min(1, 'Password is required'),
});

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);

  const from = location.state?.from?.pathname || '/';

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  // While the AuthProvider is performing its silent refresh on mount, show a spinner.
  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Spinner size="lg" />
      </div>
    );
  }

  // If already signed in, bounce to the app.
  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const onSubmit = async (values) => {
    try {
      await login(values.identifier.trim(), values.password);
      toast.success('Welcome back');
      navigate(from, { replace: true });
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to sign in');
      setError('password', { type: 'server', message });
      toast.error(message);
    }
  };

  const year = new Date().getFullYear();

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-background px-4 py-10 lg:p-0">
      <aside className="relative hidden min-h-dvh w-[42%] shrink-0 flex-col justify-between overflow-hidden bg-[#123e3b] p-10 text-white lg:flex xl:p-14">
        <div className="pointer-events-none absolute -bottom-36 -right-44 h-[600px] w-[600px] rounded-full border border-white/10" aria-hidden="true">
          <div className="absolute inset-12 rounded-full border border-white/10" />
          <div className="absolute inset-24 rounded-full border border-white/10" />
        </div>
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10"><Building2 className="h-5 w-5" /></span>
          <div><p className="font-semibold">Centre Point</p><p className="text-xs text-white/60">Hospitality</p></div>
        </div>
        <div className="relative my-16 max-w-md">
          <p className="mb-5 text-xs font-medium uppercase tracking-[0.2em] text-teal-200">Your daily workspace</p>
          <h2 className="text-4xl font-semibold leading-[1.2] tracking-tight xl:text-5xl">From first enquiry<br />to the final details.</h2>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-white/65">Keep your leads, function sheets and estimates together, so the team can focus on the guest.</p>
          <div className="mt-10 space-y-4">
            {[[FolderKanban, 'Leads CRM', 'Stay on top of enquiries and follow-ups'], [FileSpreadsheet, 'Function Prospectus', 'Prepare and review function details'], [Receipt, 'Estimate Accounts', 'Keep estimates and approvals organised']].map(([Icon, title, text]) => (
              <div key={title} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10"><Icon className="h-4 w-4 text-teal-100" /></span>
                <div><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs text-white/60">{text}</p></div>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-white/50">Centre Point Hospitality · Team workspace</p>
      </aside>
      {/* Soft brand glows behind the card. */}
      <div
        className="pointer-events-none absolute inset-0 lg:hidden"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(640px circle at 12% 18%, hsl(var(--primary) / 0.12), transparent 62%),' +
            'radial-gradient(520px circle at 88% 82%, hsl(var(--accent) / 0.09), transparent 62%),' +
            'radial-gradient(360px circle at 50% 50%, hsl(var(--primary) / 0.05), transparent 70%)',
        }}
      />

      <main className="relative mx-auto w-full max-w-md animate-slide-in lg:my-10 lg:px-4">
        <div className="mb-6 flex flex-col items-center text-center lg:hidden">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/75 text-primary-foreground shadow-elevated ring-4 ring-primary/10">
            <Building2 className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Centre Point Hospitality
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Leads CRM &middot; Sign in to continue
          </p>
        </div>

        <div className="mb-7 hidden lg:block">
          <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to your Centre Point workspace.</p>
        </div>
        <Card className="shadow-elevated lg:border-0 lg:bg-transparent lg:shadow-none">
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <CardHeader className="lg:sr-only">
              <CardTitle>Sign in</CardTitle>
              <CardDescription>
                Enter your credentials to access your dashboard.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5 lg:px-0">
              <div className="space-y-2">
                <Label htmlFor="identifier">Email or phone number</Label>
                <Input
                  id="identifier"
                  type="text"
                  autoComplete="username"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="you@example.com or 98765 43210"
                  className="h-11"
                  aria-invalid={!!errors.identifier}
                  aria-describedby={errors.identifier ? 'identifier-error' : 'identifier-hint'}
                  disabled={isSubmitting}
                  {...register('identifier')}
                />
                {errors.identifier ? (
                  <p id="identifier-error" role="alert" className="text-sm text-destructive">
                    {errors.identifier.message}
                  </p>
                ) : null}
                <p id="identifier-hint" className="text-xs text-muted-foreground">
                  Phone number sign-in is available for administrators only.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="h-11 pr-11"
                    aria-invalid={!!errors.password}
                    aria-describedby={errors.password ? 'password-error' : undefined}
                    disabled={isSubmitting}
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-md text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    disabled={isSubmitting}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
                {errors.password ? (
                  <p id="password-error" role="alert" className="text-sm text-destructive">
                    {errors.password.message}
                  </p>
                ) : null}
              </div>
            </CardContent>

            <CardFooter className="flex-col gap-4 lg:px-0">
              <Button type="submit" size="lg" className="h-11 w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Signing in…
                  </>
                ) : (
                  <>Sign in <ArrowRight className="ml-auto h-4 w-4" /></>
                )}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Forgot your password? Ask an administrator to reset it.
              </p>
            </CardFooter>
          </form>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          &copy; {year} Centre Point Hospitality &middot; Internal use only
        </p>
      </main>
    </div>
  );
}
