import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { CalendarRange, Loader2, Plus, Save, Target, Trash2 } from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const LEVELS = [
  { key: 'normal', label: 'Normal' },
  { key: 'high', label: 'High demand' },
  { key: 'peak', label: 'Peak demand' },
];

function CardHead({ icon: Icon, title, description }) {
  return (
    <CardHeader>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </div>
    </CardHeader>
  );
}

const asText = (n) => (Number(n) ? String(n) : '');
const toDay = (value) => (value ? format(new Date(value), 'yyyy-MM-dd') : '');

/** Revenue each session should bring in, by the date's demand level. */
function SessionTargetsCard({ sessions, onSaved }) {
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(
      Object.fromEntries(
        (sessions || []).map((s) => [
          s._id,
          { normal: asText(s.targets?.normal), high: asText(s.targets?.high), peak: asText(s.targets?.peak) },
        ])
      )
    );
  }, [sessions]);

  async function save() {
    const changed = (sessions || []).filter((s) =>
      LEVELS.some((l) => (Number(draft[s._id]?.[l.key]) || 0) !== (Number(s.targets?.[l.key]) || 0))
    );
    if (!changed.length) return toast.info('No target changed');
    setSaving(true);
    try {
      for (const s of changed) {
        const targets = Object.fromEntries(LEVELS.map((l) => [l.key, Math.max(0, Math.round(Number(draft[s._id]?.[l.key]) || 0))]));
        await api.patch(`/banquet/sessions/${s._id}`, { targets });
      }
      toast.success('Session targets saved');
      onSaved?.();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save the targets'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHead
        icon={Target}
        title="Session revenue targets"
        description="What one function in each session should bring in (Rs., before GST). The enquiry form shows the sales person how a function measures up, using the target for the date's demand level. Leave high / peak blank to use the normal target."
      />
      <CardContent className="space-y-3">
        {(sessions || []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Add sessions first.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Session</th>
                  {LEVELS.map((l) => (
                    <th key={l.key} className="pb-2 font-medium">
                      {l.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s._id} className={s.active === false ? 'opacity-60' : ''}>
                    <td className="py-1 pr-2 font-medium text-foreground">{s.name}</td>
                    {LEVELS.map((l) => (
                      <td key={l.key} className="py-1 pr-2">
                        <Input
                          type="number"
                          min={0}
                          aria-label={`${s.name} ${l.label} target`}
                          placeholder={l.key === 'normal' ? '0' : 'Same as normal'}
                          value={draft[s._id]?.[l.key] ?? ''}
                          onChange={(e) => setDraft((d) => ({ ...d, [s._id]: { ...d[s._id], [l.key]: e.target.value } }))}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save targets
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** The dates with more demand than usual. */
function DemandDatesCard({ settings, onSaved }) {
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRows(
      (settings?.demandDates || []).map((d) => ({ from: toDay(d.from), to: toDay(d.to), level: d.level, note: d.note || '' }))
    );
  }, [settings]);

  function setRow(i, patch) {
    setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function save() {
    if (rows.some((r) => !r.from || !r.to)) return toast.error('Give every period a start and an end date');
    if (rows.some((r) => r.to < r.from)) return toast.error('A period cannot end before it starts');
    setSaving(true);
    try {
      const demandDates = [...rows]
        .sort((a, b) => a.from.localeCompare(b.from))
        .map((r) => ({ from: r.from, to: r.to, level: r.level, note: r.note.trim() }));
      await api.put('/banquet/settings', { demandDates });
      toast.success('Demand dates saved');
      onSaved?.();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save the demand dates'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHead
        icon={CalendarRange}
        title="Demand dates"
        description="Wedding muhurats, festivals, year-end — dates when every session should earn more. Any date not listed is normal demand."
      />
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No demand dates yet — every date uses the normal target.</p>
        ) : (
          rows.map((row, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-[9.5rem_9.5rem_9rem_1fr_auto] sm:items-end">
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="date" value={row.from} onChange={(e) => setRow(i, { from: e.target.value, to: row.to || e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="date" min={row.from || undefined} value={row.to} onChange={(e) => setRow(i, { to: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Demand</Label>
                <Select value={row.level} onValueChange={(level) => setRow(i, { level })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="peak">Peak</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Note</Label>
                <Input placeholder="e.g. Diwali week" value={row.note} onChange={(e) => setRow(i, { note: e.target.value })} />
              </div>
              <Button variant="ghost" size="icon" aria-label="Remove period" onClick={() => setRows((list) => list.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => setRows((list) => [...list, { from: '', to: '', level: 'high', note: '' }])}>
            <Plus className="h-4 w-4" />
            Add period
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save demand dates
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DemandTargets({ settings, sessions, onSaved }) {
  return (
    <>
      <SessionTargetsCard sessions={sessions} onSaved={onSaved} />
      <DemandDatesCard settings={settings} onSaved={onSaved} />
    </>
  );
}
