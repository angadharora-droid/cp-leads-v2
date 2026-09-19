import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Mail, Plus, Save, Trash2 } from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

/** Finance mailboxes every estimate is emailed to (admin). */
export default function EstimateSettingsPage() {
  const [rows, setRows] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/estimates/settings')
      .then((res) => setRows(res?.data?.data?.recipients || []))
      .catch((err) => {
        toast.error(getErrorMessage(err, 'Failed to load settings'));
        setRows([]);
      });
  }, []);

  function update(i, key, value) {
    setRows((list) => list.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  }

  async function save() {
    const recipients = (rows || [])
      .map((r) => ({ name: (r.name || '').trim(), email: (r.email || '').trim() }))
      .filter((r) => r.email);
    const bad = recipients.find((r) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email));
    if (bad) return toast.error(`"${bad.email}" is not a valid email address`);
    setSaving(true);
    try {
      const res = await api.put('/estimates/settings', { recipients });
      setRows(res?.data?.data?.recipients || recipients);
      toast.success('Finance addresses saved');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Estimate settings"
        breadcrumbs={[{ label: 'Banquet Estimate', to: '/estimates' }, { label: 'Settings' }]}
        actions={
          <Button size="sm" onClick={save} disabled={saving || rows === null}>
            {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-primary" />
            Finance addresses
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Every estimate is emailed to these mailboxes by default. The sender can still change the list on each email.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows === null ? (
            <Skeleton className="h-24 rounded-lg" />
          ) : (
            <>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No addresses yet — add the finance and accounts mailboxes.</p>
              ) : null}
              {rows.map((r, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                  <div className="space-y-1">
                    <Label htmlFor={`est-rcpt-name-${i}`} className="sr-only">
                      Department
                    </Label>
                    <Input
                      id={`est-rcpt-name-${i}`}
                      value={r.name || ''}
                      onChange={(e) => update(i, 'name', e.target.value)}
                      placeholder="Department (Finance, Accounts…)"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`est-rcpt-email-${i}`} className="sr-only">
                      Email
                    </Label>
                    <Input
                      id={`est-rcpt-email-${i}`}
                      type="email"
                      value={r.email || ''}
                      onChange={(e) => update(i, 'email', e.target.value)}
                      placeholder="finance@centrepointnagpur.com"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setRows((list) => list.filter((_, j) => j !== i))}
                    aria-label="Remove address"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setRows((list) => [...list, { name: '', email: '' }])}>
                <Plus className="h-4 w-4" />
                Add address
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
