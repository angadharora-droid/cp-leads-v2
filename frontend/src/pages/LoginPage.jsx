import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Building2, Eye, EyeOff, Loader2 } from 'lucide-react';

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

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Enter a valid email address'),
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
    defaultValues: { email: '', password: '' },
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
      await login(values.email.trim(), values.password);
      toast.success('Welcome back');
      navigate(from, { replace: true });
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to sign in');
      setError('password', { type: 'server', message });
      toast.error(message);
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* Soft brand glows behind the card. */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(600px circle at 15% 20%, hsl(var(--primary) / 0.10), transparent 60%),' +
            'radial-gradient(500px circle at 85% 80%, hsl(var(--accent) / 0.08), transparent 60%)',
        }}
      />

      <div className="relative w-full max-w-md animate-slide-in">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/75 text-primary-foreground shadow-elevated">
            <Building2 className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Centre Point Hospitality
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Leads CRM &middot; Sign in to continue
          </p>
        </div>

        <Card className="shadow-elevated">
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
              <CardDescription>
                Enter your credentials to access your dashboard.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  aria-invalid={!!errors.email}
                  disabled={isSubmitting}
                  {...register('email')}
                />
                {errors.email ? (
                  <p className="text-sm text-destructive">
                    {errors.email.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="pr-10"
                    aria-invalid={!!errors.password}
                    disabled={isSubmitting}
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:text-foreground"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
                {errors.password ? (
                  <p className="text-sm text-destructive">
                    {errors.password.message}
                  </p>
                ) : null}
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Signing in…
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>

              <div className="w-full rounded-md border border-dashed border-border bg-muted/40 p-3 text-center text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Demo admin:</span>{' '}
                admin@cph.local / Admin@123
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
