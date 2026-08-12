import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, Mail, MailCheck, Unlink } from 'lucide-react';

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
import { Spinner } from '@/components/ui/spinner';
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
      toast.error('Enter your official email address and its password');
      return;
    }
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

  return (
    <div className="mx-auto w-full max-w-xl">
      <PageHeader
        title="Email settings"
        description="Link your official email ID — proposals and agreements are sent to clients from this mailbox."
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-4">
          {current.configured ? (
            <Card>
              <CardContent className="flex items-center gap-3 pt-6">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <MailCheck className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {current.email}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Linked{current.linkedAt ? ` ${formatDateTime(current.linkedAt)}` : ''} ·{' '}
                    {current.host}:{current.port}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmUnlink(true)}
                  disabled={unlinking}
                >
                  <Unlink className="h-4 w-4" />
                  Unlink
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <form onSubmit={handleSave} noValidate>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Mail className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <CardTitle>
                      {current.configured ? 'Replace linked mailbox' : 'Link your mailbox'}
                    </CardTitle>
                    <CardDescription>
                      The password is verified with the mail server, then stored
                      encrypted. It is never shown again.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
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
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sender-email">Official email address</Label>
                  <Input
                    id="sender-email"
                    type="email"
                    autoComplete="email"
                    placeholder="yourname@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={saving}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sender-password">Mailbox password</Label>
                  <div className="relative">
                    <Input
                      id="sender-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="off"
                      placeholder="••••••••"
                      className="pr-10"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={saving}
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
                  <p className="text-xs text-muted-foreground">
                    The same password you use to sign in to this mailbox
                    (webmail/Outlook).
                  </p>
                </div>

                {provider === 'custom' ? (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="smtp-host">SMTP host</Label>
                      <Input
                        id="smtp-host"
                        placeholder="smtp.example.com"
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
                ) : null}
              </CardContent>

              <CardFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
