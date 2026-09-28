import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, BadgeCheck, FileText, Loader2, Pencil, Save, ScanText, Trash2, Upload, X } from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

const DOC_LABELS = { gst: 'GST certificate', pan: 'PAN card' };
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/heic';

function Value({ label, value, problem }) {
  return (
    <div className="grid grid-cols-[minmax(0,8rem)_1fr] gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">
        {value ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            {value}
            {problem ? (
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-label={problem} />
            ) : (
              <BadgeCheck className="h-3.5 w-3.5 text-success" aria-label="Valid" />
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        {value && problem ? <span className="block text-xs text-destructive">{problem}</span> : null}
      </span>
    </div>
  );
}

/**
 * Company registration: GSTIN, PAN, legal name and address, and the GST
 * certificate / PAN card they came from. Managers attach the documents —
 * the numbers are read off them automatically (when the server has AI set
 * up) and fill any empty field; a differing reading is offered, never forced.
 */
export default function RegistrationCard({ lead }) {
  const { user } = useAuth();
  const canManage = ['admin', 'manager'].includes(user?.role);
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState('');
  const [suggestion, setSuggestion] = useState(null);
  const fileInput = useRef(null);
  const pendingKind = useRef('gst');
  const base = `/leads/${lead._id}/registration`;

  const load = useCallback(async () => {
    try {
      const res = await api.get(base);
      setData(res?.data?.data || null);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load the registration'));
    }
  }, [base]);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit() {
    setDraft({
      legalName: data.legalName,
      gstNumber: data.gstNumber,
      panNumber: data.panNumber,
      registeredAddress: data.registeredAddress,
    });
    setEditing(true);
  }

  async function save(body = draft, message = 'Registration saved') {
    setBusy('save');
    try {
      const res = await api.patch(base, body);
      setData(res?.data?.data || null);
      setEditing(false);
      toast.success(message);
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the registration'));
      return false;
    } finally {
      setBusy('');
    }
  }

  function pickFile(kind) {
    pendingKind.current = kind;
    fileInput.current?.click();
  }

  async function upload(file) {
    if (!file) return;
    const kind = pendingKind.current;
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', file);
    setBusy(`upload-${kind}`);
    try {
      const res = await api.post(`${base}/documents`, form);
      const next = res?.data?.data;
      setData(next);
      const read = next?.read || {};
      if (read.filled?.length) toast.success(`${DOC_LABELS[kind]} attached — filled ${read.filled.join(', ')}`);
      else toast.success(`${DOC_LABELS[kind]} attached`);
      if (read.error) toast.warning(read.error);
      setSuggestion(Object.keys(read.differs || {}).length ? read.differs : null);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not attach the document'));
    } finally {
      setBusy('');
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function openDoc(doc) {
    try {
      const res = await api.get(`${base}/documents/${doc._id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not open the document'));
    }
  }

  async function removeDoc(doc) {
    setBusy(`remove-${doc._id}`);
    try {
      const res = await api.delete(`${base}/documents/${doc._id}`);
      setData(res?.data?.data || null);
      toast.success('Document removed');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not remove the document'));
    } finally {
      setBusy('');
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScanText className="h-4 w-4 text-primary" />
              Registration
            </CardTitle>
            <CardDescription>GSTIN, PAN and the documents they were read from.</CardDescription>
          </div>
          {canManage && data && !editing ? (
            <Button size="sm" variant="outline" onClick={startEdit}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!data ? (
          <Skeleton className="h-24 w-full" />
        ) : editing ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="reg-legal">Legal name</Label>
              <Input id="reg-legal" value={draft.legalName || ''} onChange={(e) => setDraft((d) => ({ ...d, legalName: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-gst">GSTIN</Label>
              <Input
                id="reg-gst"
                placeholder="27AAPFU0939F1ZV"
                className="uppercase"
                value={draft.gstNumber || ''}
                onChange={(e) => setDraft((d) => ({ ...d, gstNumber: e.target.value.toUpperCase() }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-pan">PAN</Label>
              <Input
                id="reg-pan"
                placeholder="AAPFU0939F"
                className="uppercase"
                value={draft.panNumber || ''}
                onChange={(e) => setDraft((d) => ({ ...d, panNumber: e.target.value.toUpperCase() }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="reg-address">Registered address</Label>
              <Textarea
                id="reg-address"
                rows={2}
                value={draft.registeredAddress || ''}
                onChange={(e) => setDraft((d) => ({ ...d, registeredAddress: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button variant="outline" onClick={() => setEditing(false)}>
                <X className="h-4 w-4" />
                Cancel
              </Button>
              <Button onClick={() => save()} disabled={busy === 'save'}>
                {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Value label="Legal name" value={data.legalName} />
            <Value label="GSTIN" value={data.gstNumber} problem={data.problems?.gstNumber} />
            <Value label="PAN" value={data.panNumber} problem={data.problems?.panNumber || data.problems?.mismatch} />
            {data.registeredAddress ? <Value label="Address" value={data.registeredAddress} /> : null}
          </div>
        )}

        {suggestion ? (
          <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium text-foreground">The document reads differently from what is on record:</p>
            <ul className="text-xs text-muted-foreground">
              {suggestion.gstNumber ? <li>GSTIN {suggestion.gstNumber}</li> : null}
              {suggestion.panNumber ? <li>PAN {suggestion.panNumber}</li> : null}
              {suggestion.legalName ? <li>Legal name {suggestion.legalName}</li> : null}
            </ul>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  if (await save(suggestion, 'Registration updated from the document')) setSuggestion(null);
                }}
              >
                Use the document&apos;s values
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSuggestion(null)}>
                Keep what is on record
              </Button>
            </div>
          </div>
        ) : null}

        {data ? (
          <div className="space-y-2 border-t pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">Documents</p>
              {canManage ? (
                <div className="flex gap-2">
                  {['gst', 'pan'].map((kind) => (
                    <Button key={kind} size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => pickFile(kind)}>
                      {busy === `upload-${kind}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {DOC_LABELS[kind]}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
            {busy.startsWith('upload') ? (
              <p className="text-xs text-muted-foreground">{data.aiEnabled ? 'Attaching and reading the document…' : 'Attaching…'}</p>
            ) : null}
            {data.documents?.length ? (
              <ul className="space-y-1.5">
                {data.documents.map((doc) => (
                  <li key={doc._id} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm">
                    <button type="button" className="flex min-w-0 items-center gap-2 text-left hover:text-primary" onClick={() => openDoc(doc)}>
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{DOC_LABELS[doc.kind]}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {doc.filename} · {formatDate(doc.uploadedAt)}
                          {doc.extracted?.readBy === 'ai'
                            ? ` · read: ${[doc.extracted.gstNumber, doc.extracted.panNumber].filter(Boolean).join(', ') || 'no numbers found'}`
                            : ''}
                        </span>
                      </span>
                    </button>
                    {canManage ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove ${DOC_LABELS[doc.kind]}`}
                        disabled={busy === `remove-${doc._id}`}
                        onClick={() => removeDoc(doc)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                No documents attached.{' '}
                {canManage
                  ? data.aiEnabled
                    ? 'Attach the GST certificate or PAN card — the numbers are read and filled in for you.'
                    : 'Attach the GST certificate or PAN card to keep them on file (automatic reading is not set up, so type the numbers in).'
                  : ''}
              </p>
            )}
          </div>
        ) : null}
        <input ref={fileInput} type="file" accept={ACCEPT} className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
      </CardContent>
    </Card>
  );
}
