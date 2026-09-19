import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, Mail, MailCheck, Unlink, Info } from 'lucide-react';

import api, { getErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
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
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageHeader } from '@/components/PageHeader';

/** SMTP presets for the providers the team actually uses. */
const PROVIDERS = {
  rediffmailpro: {
    label: 'Rediffmail Pro',
    host: 'smtp.rediffmailpro.com',
    port: 465,
    secure: true,
  },
  hostinger: {
    label: 'Hostinger',
    host: 'smtp.hostinger.com',
    port: 465,
    secure: true,
  },
  gmail: {
    label: 'Gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
  },
  custom: { label: 'Custom SMTP', host: '', port: 465, secure: true },
};

function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

function EmailSettingsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading email settings">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-full max-w-md" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-10 w-40" />
        </CardFooter>
      </Card>
    </div>
  );
}

export default function EmailSettingsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState({ configured: false });

  const [provider, setProvider] = useState('rediffmailpro');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [host, setHost] = useState(PROVIDERS.rediffmailpro.host);
  const [port, setPort] = useState(String(PROVIDERS.rediffmailpro.port));
  const [secure, setSecure] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  // UX-only: inline field errors mirroring the existing toast validation.
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    let cancelled = false;
    api
      .get('/auth/email-sender')
      .then((res) => {
        if (!cancelled) setCurrent(res.data?.data || { configured: false });
      })
      .catch(() => {
        /* leave as not configured */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleProviderChange(next) {
    setProvider(next);
    const preset = PROVIDERS[next];
    if (preset.host) setHost(preset.host);
    else setHost('');
    setPort(String(preset.port));
    setSecure(preset.secure);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setFieldErrors({
        email: !email.trim() ? 'Enter your official email address' : undefined,
        password: !password ? 'Enter the mailbox password' : undefined,
      });
      toast.error('Enter your official email address and its password');
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      const res = await api.put('/auth/email-sender', {
        email: email.trim(),
        password,
        host: host.trim(),
        port: Number(port) || 465,
        secure,
      });
      setCurrent(res.data?.data || { configured: true, email: email.trim() });
      setPassword('');
      toast.success(
        'Mailbox linked — client emails will now be sent from your address'
      );
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to link mailbox'));
    } finally {
      setSaving(false);
    }
  }

  async function handleUnlink() {
    setUnlinking(true);
    try {
      await api.delete('/auth/email-sender');
      setCurrent({ configured: false });
      toast.success('Mailbox unlinked — emails fall back to the company account');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to unlink mailbox'));
      throw err;
    } finally {
      setUnlinking(false);
    }
  }

  const preset = PROVIDERS[provider];

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Email settings"
        description="Link your official email ID — proposals and agreements are sent to clients from this mailbox."
      />

      {loading ? (
        <EmailSettingsSkeleton />
      ) : (
        <div className="space-y-4">
          {/* Current status */}
          <Card>
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
              <div
                className={
                  current.configured
                    ? 'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-success/10 text-success'
                    : 'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground'
                }
              >
                {current.configured ? (
                  <MailCheck className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Mail className="h-5 w-5" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="eyebrow">Sending from</p>
                {current.configured ? (
                  <>
                    <p className="truncate text-sm font-medium text-foreground">{current.email}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5 text-success">
                        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-success" />
                        Linked
                      </span>
                      {current.linkedAt ? <span>{formatDateTime(current.linkedAt)}</span> : null}
                      {current.host ? (
                        <span className="tabular">
                          · {current.host}:{current.port}
                        </span>
                      ) : null}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-foreground">Shared company account</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      No personal mailbox linked yet. Link one below so replies reach you directly.
                    </p>
                  </>
                )}
              </div>
              {current.configured ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setConfirmUnlink(true)}
                  disabled={unlinking}
                  className="w-full sm:w-auto"
                >
                  {unlinking ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Unlink className="h-4 w-4" aria-hidden="true" />
                  )}
                  Unlink
                </Button>
              ) : null}
            </CardContent>
          </Card>

          {/* Link / replace form */}
          <Card>
            <form onSubmit={handleSave} noValidate>
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Mail className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="space-y-1">
                    <CardTitle>
                      {current.configured ? 'Replace linked mailbox' : 'Link your mailbox'}
                    </CardTitle>
                    <CardDescription>
                      We sign in to the mail server once to verify the details, then store the
                      password encrypted. It is never shown again.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="provider">Email provider</Label>
                  <Select
                    value={provider}
                    onValueChange={handleProviderChange}
                    disabled={saving}
                  >
                    <SelectTrigger id="provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PROVIDERS).map(([key, p]) => (
                        <SelectItem key={key} value={key}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {provider === 'custom'
                      ? 'Enter the SMTP server details from your email provider.'
                      : `Server details are filled in for you: ${preset.host} on port ${preset.port}.`}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sender-email">Official email address</Label>
                  <Input
                    id="sender-email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="yourname@company.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
                    }}
                    disabled={saving}
                    aria-invalid={!!fieldErrors.email}
                    aria-describedby={fieldErrors.email ? 'sender-email-error' : 'sender-email-hint'}
                  />
                  <FieldError id="sender-email-error" message={fieldErrors.email} />
                  <p id="sender-email-hint" className="text-xs text-muted-foreground">
                    Clients will see this address as the sender and reply to it.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sender-password">Mailbox password</Label>
                  <div className="relative">
                    <Input
                      id="sender-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="off"
                      placeholder="••••••••"
                      className="pr-11"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
                      }}
                      disabled={saving}
                      aria-invalid={!!fieldErrors.password}
                      aria-describedby={
                        fieldErrors.password ? 'sender-password-error' : 'sender-password-hint'
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-md text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      disabled={saving}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  <FieldError id="sender-password-error" message={fieldErrors.password} />
                  <p id="sender-password-hint" className="text-xs text-muted-foreground">
                    The same password you use to sign in to this mailbox (webmail/Outlook).
                    {provider === 'gmail'
                      ? ' For Gmail, use an App Password rather than your account password.'
                      : ''}
                  </p>
                </div>

                {provider === 'custom' ? (
                  <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                    <p className="eyebrow">Server details</p>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="smtp-host">SMTP host</Label>
                        <Input
                          id="smtp-host"
                          placeholder="smtp.example.com"
                          autoComplete="off"
                          value={host}
                          onChange={(e) => setHost(e.target.value)}
                          disabled={saving}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="smtp-port">Port</Label>
                        <Select
                          value={port}
                          onValueChange={(v) => {
                            setPort(v);
                            setSecure(v === '465');
                          }}
                          disabled={saving}
                        >
                          <SelectTrigger id="smtp-port">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="465">465 (SSL)</SelectItem>
                            <SelectItem value="587">587 (STARTTLS)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Connection: {secure ? 'SSL/TLS on connect' : 'STARTTLS upgrade'}. Most
                      providers list these under "outgoing mail" or "SMTP" settings.
                    </p>
                  </div>
                ) : null}

                <div className="flex gap-3 rounded-lg border border-info/20 bg-info/10 p-3 text-sm">
                  <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-info" aria-hidden="true" />
                  <p className="text-foreground/90">
                    If verification fails, check that IMAP/SMTP access is enabled for the mailbox
                    and that the password is current. Emails keep going out from the company
                    account until a mailbox is linked.
                  </p>
                </div>
              </CardContent>

              <CardFooter className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end sm:pt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(-1)}
                  disabled={saving}
                  className="w-full sm:w-auto"
                >
                  Back
                </Button>
                <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Verifying…
                    </>
                  ) : (
                    'Verify & link mailbox'
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirmUnlink}
        onOpenChange={setConfirmUnlink}
        onConfirm={handleUnlink}
        title="Unlink this mailbox?"
        description="Client emails will fall back to the shared company account until you link a mailbox again."
        confirmText="Unlink"
        variant="destructive"
      />
    </div>
  );
}
