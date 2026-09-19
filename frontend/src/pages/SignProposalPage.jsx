import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  AlertCircle,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Eraser,
  ExternalLink,
  MailCheck,
  PenLine,
  RefreshCw,
  ShieldCheck,
  Type,
} from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

const STEPS = [
  { key: 'review', label: 'Review' },
  { key: 'verify', label: 'Verify code' },
  { key: 'sign', label: 'Sign' },
];

/** Freehand signature pad (pointer events, PNG export on white background). */
function SignatureCanvas({ onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.offsetWidth;
    const height = 160;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1a2e';
  }, []);

  function pos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e) {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasInk.current = true;
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    if (hasInk.current) onChange(canvasRef.current.toDataURL('image/png'));
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    hasInk.current = false;
    onChange('');
  }

  return (
    <div className="space-y-2">
      {/* The pad is always white paper: the exported PNG must have a white background. */}
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Signature pad. Draw your signature here with a mouse or your finger."
        className="h-40 w-full cursor-crosshair touch-none rounded-lg border-2 border-dashed border-input bg-white transition-[border-color] duration-150 hover:border-primary/50"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Sign inside the box with your mouse or finger.</p>
        <Button type="button" variant="ghost" onClick={clear} aria-label="Clear signature">
          <Eraser className="h-4 w-4" aria-hidden="true" />
          Clear
        </Button>
      </div>
    </div>
  );
}

/** Numbered progress stepper: Review → Verify code → Sign. */
function Stepper({ current }) {
  const pct = Math.min(100, Math.round((current / STEPS.length) * 100));
  return (
    <nav aria-label="Signing progress" className="space-y-3">
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((step, i) => {
          const state = i < current ? 'complete' : i === current ? 'current' : 'upcoming';
          return (
            <li
              key={step.key}
              aria-current={state === 'current' ? 'step' : undefined}
              className="flex flex-col items-center gap-2 text-center sm:flex-row sm:text-left"
            >
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors duration-200',
                  state === 'complete' && 'border-success bg-success text-success-foreground',
                  state === 'current' && 'border-primary bg-primary/10 text-primary',
                  state === 'upcoming' && 'border-border bg-card text-muted-foreground'
                )}
                aria-hidden="true"
              >
                {state === 'complete' ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={cn(
                  'text-sm font-medium leading-tight',
                  state === 'upcoming' ? 'text-muted-foreground' : 'text-foreground'
                )}
              >
                <span className="sr-only">
                  Step {i + 1}
                  {state === 'complete' ? ' (done)' : state === 'current' ? ' (current)' : ''}:{' '}
                </span>
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </nav>
  );
}

/** Section heading with its step number badge. */
function SectionTitle({ step, icon: Icon, done, id, children }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
          done ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary'
        )}
        aria-hidden="true"
      >
        {done ? <Check className="h-5 w-5" strokeWidth={2.5} /> : <Icon className="h-5 w-5" />}
      </span>
      <div className="min-w-0">
        <p className="eyebrow">Step {step}</p>
        <h2 id={id} className="text-lg font-semibold leading-tight text-foreground">
          {children}
        </h2>
      </div>
    </div>
  );
}

function BrandBlock() {
  return (
    <div className="flex items-center justify-center gap-3 pb-2">
      <div
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/75 text-primary-foreground shadow-card"
        aria-hidden="true"
      >
        <Building2 className="h-5 w-5" />
      </div>
      <div className="leading-tight">
        <p className="font-semibold text-foreground">Centre Point Hotels &amp; Resorts</p>
        <p className="text-sm text-muted-foreground">Digital acceptance</p>
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your document</span>
      <Card>
        <CardContent className="space-y-4 p-5 sm:p-6">
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
          <div className="grid grid-cols-3 gap-2 pt-2">
            <Skeleton className="h-9 w-full rounded-full" />
            <Skeleton className="h-9 w-full rounded-full" />
            <Skeleton className="h-9 w-full rounded-full" />
          </div>
        </CardContent>
      </Card>
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="space-y-4 p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-5 w-40" />
              </div>
            </div>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-11 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Public signing page (no login): review → OTP verify → sign. Reached from
 * the link emailed with the contract (/sign/:token); older links carry the
 * proposal, and the page names whichever document it is.
 */
export default function SignProposalPage() {
  const { token } = useParams();
  const [view, setView] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [otpRequested, setOtpRequested] = useState(null); // { sentTo }
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otp, setOtp] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signatureType, setSignatureType] = useState('drawn');
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(null); // { signedAt, document, acknowledged }

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/sign/${token}`);
      const data = res?.data?.data;
      setView(data);
      setSignerName(data?.contactName || '');
    } catch (err) {
      setLoadError(getErrorMessage(err, 'This signing link is not valid'));
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function requestOtp() {
    setIsSendingOtp(true);
    try {
      const res = await api.post(`/sign/${token}/otp`);
      setOtpRequested(res?.data?.data || {});
      toast.success('Verification code emailed');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not send the code'));
    } finally {
      setIsSendingOtp(false);
    }
  }

  async function submit() {
    if (!/^\d{6}$/.test(otp.trim())) return toast.error('Enter the 6-digit code from your email');
    if (signerName.trim().length < 2) return toast.error('Enter your full name');
    if (signatureType === 'drawn' && !signatureDataUrl)
      return toast.error('Draw your signature, or switch to typing it');
    setIsSubmitting(true);
    try {
      const res = await api.post(`/sign/${token}/complete`, {
        otp: otp.trim(),
        signerName: signerName.trim(),
        signatureType,
        signatureDataUrl: signatureType === 'drawn' ? signatureDataUrl : undefined,
      });
      setDone(res?.data?.data || {});
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not complete signing'));
    } finally {
      setIsSubmitting(false);
    }
  }

  function retryLoad() {
    setLoadError(null);
    load();
  }

  const pdfUrl = `${api.defaults.baseURL}/sign/${token}/pdf`;
  const otpValid = /^\d{6}$/.test(otp.trim());
  const finished = Boolean(done || view?.alreadySigned);
  const currentStep = finished ? 3 : otpValid ? 2 : otpRequested ? 1 : 0;
  const functions = view?.functions || [];
  const docName =
    view?.document === 'proposal' ? 'proposal' : view?.document === 'addendum' ? 'addendum' : 'contract';
  const docTitle = { proposal: 'Proposal', addendum: 'Addendum', contract: 'Contract' }[docName];
  const changes = view?.changes || [];

  return (
    <div className="min-h-screen bg-background px-4 py-8 text-base text-foreground sm:py-12">
      <div className="mx-auto max-w-2xl space-y-4">
        <BrandBlock />

        {loadError ? (
          <Card role="alert">
            <CardContent className="px-6 py-10 text-center sm:px-10">
              <div
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive"
                aria-hidden="true"
              >
                <AlertCircle className="h-8 w-8" />
              </div>
              <h1 className="mt-5 text-2xl font-semibold">This link can't be opened</h1>
              <p className="mt-2 text-base leading-relaxed text-muted-foreground">{loadError}</p>
              <div className="mt-6 rounded-lg border bg-muted/40 p-4 text-left text-sm leading-relaxed text-muted-foreground">
                <p className="font-medium text-foreground">What you can do</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Open the link directly from the most recent email from Centre Point.</li>
                  <li>Signing links expire after a while — ask your Centre Point representative for a fresh one.</li>
                </ul>
              </div>
              <Button variant="outline" size="lg" className="mt-6 text-base" onClick={retryLoad}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : !view ? (
          <PageSkeleton />
        ) : finished ? (
          <Card>
            <CardContent className="px-6 py-10 text-center sm:px-10" role="status">
              <div
                className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success/15 text-success"
                aria-hidden="true"
              >
                <Check className="h-10 w-10" strokeWidth={2.5} />
              </div>
              <h1 className="mt-5 text-2xl font-semibold sm:text-3xl">{docTitle} signed</h1>
              {done ? (
                <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                  Thank you!{' '}
                  {done.acknowledged
                    ? 'Your signed copy has been emailed to you for your records.'
                    : 'Our team will email your signed copy shortly.'}
                </p>
              ) : (
                <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                  This {docName} was already signed
                  {view.signedAt ? ` on ${format(new Date(view.signedAt), 'd MMMM yyyy')}` : ''}. No
                  further action is needed.
                </p>
              )}

              <div className="mt-8 rounded-lg border bg-muted/40 p-5 text-left">
                <p className="eyebrow">What happens next</p>
                <ol className="mt-3 space-y-3">
                  {[
                    done && done.acknowledged
                      ? 'Check your inbox for your signed copy.'
                      : 'Keep the signed copy we email you for your records.',
                    `Your booking is held provisionally on the dates in the ${docName}.`,
                    'Once the advance is received, your booking is confirmed.',
                  ].map((text, i) => (
                    <li key={i} className="flex gap-3 text-sm leading-relaxed text-foreground">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                        aria-hidden="true"
                      >
                        {i + 1}
                      </span>
                      {text}
                    </li>
                  ))}
                </ol>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Intro + stepper */}
            <Card>
              <CardContent className="space-y-5 p-5 sm:p-6">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    Sign your banquet {docName}
                  </h1>
                  <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                    Prepared for{' '}
                    <span className="font-medium text-foreground">
                      {view.businessName || view.contactName}
                    </span>
                    . Three short steps — it takes about a minute.
                  </p>
                </div>
                <Stepper current={currentStep} />
              </CardContent>
            </Card>

            {/* Step 1 — review */}
            <Card role="region" aria-labelledby="step-review">
              <CardHeader className="pb-4">
                <SectionTitle step={1} icon={CalendarDays} done={currentStep > 0} id="step-review">
                  Review the {docName}
                </SectionTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {docName === 'addendum' ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      This addendum records the changes to
                      {view.contractNumber ? ` Agreement ${view.contractNumber}` : ' your agreement'}. Everything
                      else in the agreement stays as it was.
                    </p>
                    {changes.length > 0 ? (
                      <ul className="divide-y overflow-hidden rounded-lg border">
                        {changes.map((change, i) => (
                          <li key={i} className="grid gap-2 px-4 py-3 sm:grid-cols-2">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Before</p>
                              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{change.old}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Now</p>
                              <p className="mt-0.5 text-sm font-medium leading-relaxed text-foreground">{change.new}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                {functions.length > 0 ? (
                  <ul className="divide-y overflow-hidden rounded-lg border">
                    {functions.map((fn, i) => {
                      const date = fn.date ? new Date(fn.date) : null;
                      return (
                        <li key={i} className="flex items-center gap-4 px-4 py-3">
                          <span
                            className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 leading-none text-primary"
                            aria-hidden="true"
                          >
                            {date ? (
                              <>
                                <span className="text-[10px] font-semibold uppercase">{format(date, 'MMM')}</span>
                                <span className="mt-0.5 text-lg font-bold tabular-nums">{format(date, 'd')}</span>
                              </>
                            ) : (
                              <CalendarDays className="h-5 w-5" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium leading-snug text-foreground">{fn.name}</p>
                            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                              {date ? format(date, 'EEEE, d MMMM yyyy') : ''}
                              {date && fn.venue ? ' · ' : ''}
                              {fn.venue}
                              {fn.session ? ` · ${fn.session}` : ''}
                              {fn.pax ? ` · ${fn.pax} pax` : ''}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-base leading-relaxed text-muted-foreground">
                    Full event details are in the PDF below.
                  </p>
                )}

                {view.estimatedRevenue ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-4 py-3">
                    <span className="text-sm text-muted-foreground">Estimated amount</span>
                    <span className="text-lg font-semibold tabular-nums text-foreground">
                      {view.estimatedRevenue}
                    </span>
                  </div>
                ) : null}

                <Button variant="outline" size="lg" asChild className="w-full text-base">
                  <a href={pdfUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    View the full {docName} (PDF)
                  </a>
                </Button>
              </CardContent>
            </Card>

            {/* Step 2 — verify */}
            <Card role="region" aria-labelledby="step-verify">
              <CardHeader className="pb-4">
                <SectionTitle step={2} icon={ShieldCheck} done={otpValid} id="step-verify">
                  Verify it's you
                </SectionTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {otpRequested ? (
                  <div
                    role="status"
                    className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3"
                  >
                    <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
                    <p className="text-sm leading-relaxed text-foreground">
                      Code sent to <span className="font-medium">{otpRequested.sentTo}</span>. It stays valid
                      for {otpRequested.validMinutes || 10} minutes. If it doesn't arrive, check your spam
                      folder or resend it.
                    </p>
                  </div>
                ) : (
                  <p className="text-base leading-relaxed text-muted-foreground">
                    We'll email a 6-digit code to{' '}
                    <span className="font-medium text-foreground">{view.maskedEmail}</span> so we know
                    it's you.
                  </p>
                )}

                <Button
                  size="lg"
                  variant={otpRequested ? 'outline' : 'default'}
                  className="w-full text-base sm:w-auto"
                  onClick={requestOtp}
                  disabled={isSendingOtp}
                >
                  {isSendingOtp ? (
                    <Spinner size="sm" className="text-current" />
                  ) : (
                    <MailCheck className="h-4 w-4" aria-hidden="true" />
                  )}
                  {otpRequested ? 'Resend code' : 'Email me the code'}
                </Button>

                <div className="space-y-2">
                  <Label htmlFor="otp" className="text-base">
                    6-digit code
                  </Label>
                  <Input
                    id="otp"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••••"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    aria-describedby="otp-help"
                    className="h-14 max-w-xs text-center font-mono text-2xl tracking-[0.5em] placeholder:tracking-[0.5em]"
                  />
                  <p id="otp-help" className="text-sm leading-relaxed text-muted-foreground">
                    {otpValid ? (
                      <span className="inline-flex items-center gap-1.5 text-success">
                        <Check className="h-4 w-4" aria-hidden="true" />
                        Code entered — continue to sign below.
                      </span>
                    ) : (
                      'Enter the code from your email, then sign below.'
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Step 3 — sign */}
            <Card role="region" aria-labelledby="step-sign">
              <CardHeader className="pb-4">
                <SectionTitle step={3} icon={PenLine} id="step-sign">
                  Sign the {docName}
                </SectionTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="signer-name" className="text-base">
                    Your full name
                  </Label>
                  <Input
                    id="signer-name"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="As it should appear on the signed copy"
                    autoComplete="name"
                    className="h-11 text-base"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-base font-medium leading-none" id="signature-method-label">
                    Signature
                  </p>
                  <div
                    role="group"
                    aria-labelledby="signature-method-label"
                    className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
                  >
                    {[
                      { key: 'drawn', label: 'Draw', icon: PenLine },
                      { key: 'typed', label: 'Type', icon: Type },
                    ].map((t) => {
                      const active = signatureType === t.key;
                      return (
                        <button
                          key={t.key}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setSignatureType(t.key)}
                          className={cn(
                            'inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium transition-[background-color,color,box-shadow] duration-150',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted',
                            active
                              ? 'bg-card text-foreground shadow-card'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          <t.icon className="h-4 w-4" aria-hidden="true" />
                          {t.label} signature
                        </button>
                      );
                    })}
                  </div>
                </div>

                {signatureType === 'drawn' ? (
                  <SignatureCanvas onChange={setSignatureDataUrl} />
                ) : (
                  <div className="space-y-2">
                    <div
                      className="flex min-h-40 items-center justify-center rounded-lg border-2 border-dashed border-input bg-card px-6 py-8 text-center"
                      aria-live="polite"
                    >
                      <p
                        className={cn('text-3xl', signerName ? 'text-foreground' : 'text-muted-foreground/60')}
                        style={{ fontFamily: "'Segoe Script', 'Brush Script MT', cursive" }}
                      >
                        {signerName || 'Your name'}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Your typed name will be used as your signature.
                    </p>
                  </div>
                )}

                <Button
                  className="h-12 w-full text-base"
                  size="lg"
                  onClick={submit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Spinner size="sm" className="text-current" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  )}
                  Accept &amp; sign {docName}
                </Button>
                <p className="text-center text-sm leading-relaxed text-muted-foreground">
                  By signing you accept the {docName}. Your signed copy is emailed to you and your dates
                  are held provisionally until the advance is received.
                </p>
              </CardContent>
            </Card>
          </>
        )}

        <p className="flex items-center justify-center gap-1.5 pt-2 text-center text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          Secured with email verification. Questions? Reply to the email that brought you here.
        </p>
      </div>
    </div>
  );
}
