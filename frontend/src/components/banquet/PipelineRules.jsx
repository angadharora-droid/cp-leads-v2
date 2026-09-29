import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Hourglass, Loader2, Plus, Save, Trash2, Wallet } from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { DEFAULT_STAGE_TAT_DAYS } from '@/lib/enquiryStages';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const TAT_STAGES = [
  { key: 'enquiry', label: 'Enquiry', hint: 'to send the proposal' },
  { key: 'proposal', label: 'Proposal', hint: 'to send the contract' },
  { key: 'waitlist', label: 'Waitlist', hint: 'waiting for the slot' },
  { key: 'provisional', label: 'Provisional', hint: 'to confirm (won)' },
];

export const DUE_RULES = [
  { key: 'on_confirmation', label: 'On confirmation (contract sent)' },
  { key: 'days_before_event', label: 'Days before the event' },
  { key: 'days_after_event', label: 'Days after the event' },
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

/** Days an enquiry may sit in each open stage before it is flagged over TAT. */
function StageTatCard({ settings, onSaved }) {
  const [draft, setDraft] = useState(DEFAULT_STAGE_TAT_DAYS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({ ...DEFAULT_STAGE_TAT_DAYS, ...(settings?.stageTatDays || {}) });
  }, [settings]);

  async function save() {
    setSaving(true);
    try {
      const stageTatDays = Object.fromEntries(
        TAT_STAGES.map((s) => [s.key, Math.max(0, Math.round(Number(draft[s.key]) || 0))])
      );
      await api.put('/banquet/settings', { stageTatDays });
      toast.success('Stage TAT saved');
      onSaved?.();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save the stage TAT'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHead
        icon={Hourglass}
        title="Turnaround time per stage — all properties"
        description="How many days an enquiry may stay in each stage. Past that it is flagged Over TAT on the board, the enquiry page and the management reports."
      />
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TAT_STAGES.map((stage) => (
            <div key={stage.key} className="space-y-1.5">
              <Label htmlFor={`tat-${stage.key}`}>{stage.label}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`tat-${stage.key}`}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={draft[stage.key] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [stage.key]: e.target.value }))}
                />
                <span className="text-xs text-muted-foreground">days</span>
              </div>
              <p className="text-[11px] text-muted-foreground">{stage.hint}</p>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save TAT
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const EMPTY_ROW = { label: '', percent: '', due: 'on_confirmation', days: '' };

/** The standard schedule every booking starts from when its contract goes out. */
function PaymentScheduleCard({ settings, onSaved }) {
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const schedule = settings?.paymentSchedule || [];
    setRows(schedule.map((r) => ({ label: r.label, percent: String(r.percent), due: r.due, days: String(r.days || '') })));
  }, [settings]);

  const total = rows.reduce((sum, r) => sum + (Number(r.percent) || 0), 0);
  const balanced = rows.length === 0 || Math.abs(total - 100) < 0.01;

  function setRow(index, patch) {
    setRows((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function save() {
    if (!balanced) return toast.error('The milestones must add up to 100%');
    if (rows.some((r) => !r.label.trim())) return toast.error('Name every milestone');
    setSaving(true);
    try {
      await api.put('/banquet/settings', {
        paymentSchedule: rows.map((r) => ({
          label: r.label.trim(),
          percent: Number(r.percent) || 0,
          due: r.due,
          days: r.due === 'on_confirmation' ? 0 : Math.max(0, Math.round(Number(r.days) || 0)),
        })),
      });
      toast.success('Payment schedule saved');
      onSaved?.();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save the payment schedule'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHead
        icon={Wallet}
        title="Standard payment schedule — all properties"
        description="Laid onto every booking when its contract is emailed, as shares of the booking value (menu revenue + GST). Each booking's schedule can then be edited on its own page."
      />
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No milestones — bookings start without a schedule.</p>
        ) : (
          rows.map((row, index) => (
            <div
              key={index}
              className="grid grid-cols-[1fr_5.5rem] gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_5.5rem_14rem_5rem_auto] sm:items-end"
            >
              <div className="space-y-1">
                <Label className="text-xs">Milestone</Label>
                <Input value={row.label} placeholder="e.g. Advance" onChange={(e) => setRow(index, { label: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Share %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={row.percent}
                  onChange={(e) => setRow(index, { percent: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Due</Label>
                <Select value={row.due} onValueChange={(v) => setRow(index, { due: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DUE_RULES.map((rule) => (
                      <SelectItem key={rule.key} value={rule.key}>
                        {rule.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Days</Label>
                <Input
                  type="number"
                  min={0}
                  disabled={row.due === 'on_confirmation'}
                  value={row.due === 'on_confirmation' ? '' : row.days}
                  onChange={(e) => setRow(index, { days: e.target.value })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${row.label || 'milestone'}`}
                onClick={() => setRows((list) => list.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setRows((list) => [...list, { ...EMPTY_ROW }])}>
              <Plus className="h-4 w-4" />
              Add milestone
            </Button>
            <span className={balanced ? 'text-xs text-muted-foreground' : 'text-xs font-medium text-destructive'}>
              Total {Math.round(total * 100) / 100}%{balanced ? '' : ' — must be 100%'}
            </span>
          </div>
          <Button onClick={save} disabled={saving || !balanced}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save schedule
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Pipeline rules in Banquet Setup: stage TAT and the standard payment schedule. */
export default function PipelineRules({ settings, onSaved }) {
  return (
    <>
      <StageTatCard settings={settings} onSaved={onSaved} />
      <PaymentScheduleCard settings={settings} onSaved={onSaved} />
    </>
  );
}
