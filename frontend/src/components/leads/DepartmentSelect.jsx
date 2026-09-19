import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { groupByBranch, nodeLabel } from '@/lib/departments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const CREATE_VALUE = '__create__';

/**
 * Picks the branch/department node an enquiry or rate contract belongs to.
 * Nodes are grouped by branch. Choosing "Create a new department" reveals an
 * inline form that adds the node to the lead, then selects it.
 *
 * @param {object} props
 * @param {object} props.lead company lead (with `departments`)
 * @param {string} props.value selected department id
 * @param {(id: string) => void} props.onChange
 * @param {(lead: object) => void} [props.onLeadUpdated] receives the lead
 *   returned by the API after a department is created
 * @param {string} [props.id]
 * @param {boolean} [props.disabled]
 */
function DepartmentSelect({ lead, value, onChange, onLeadUpdated, id, disabled }) {
  const [departments, setDepartments] = useState(lead?.departments || []);
  const [creating, setCreating] = useState(false);
  const [branch, setBranch] = useState('');
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const uid = useId();
  const branchId = `${uid}-branch`;
  const nameId = `${uid}-name`;

  useEffect(() => {
    setDepartments(lead?.departments || []);
  }, [lead?._id, lead?.departments]);

  const groups = groupByBranch(departments);
  const showBranchInput = groups.some((g) => g.branch) || creating;

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return toast.error('Enter the department name');
    setIsSaving(true);
    try {
      const res = await api.post(`/leads/${lead._id}/departments`, {
        branch: branch.trim(),
        name: trimmed,
      });
      const next = res?.data?.data?.lead;
      const list = next?.departments || [];
      setDepartments(list);
      const created = list.find(
        (d) =>
          (d.name || '').toLowerCase() === trimmed.toLowerCase() &&
          (d.branch || '').toLowerCase() === branch.trim().toLowerCase()
      );
      if (created) onChange(String(created._id));
      onLeadUpdated?.(next);
      toast.success(`Department "${nodeLabel(created || { name: trimmed, branch })}" added`);
      setCreating(false);
      setBranch('');
      setName('');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to add department'));
    } finally {
      setIsSaving(false);
    }
  }

  if (creating) {
    return (
      <div
        role="group"
        aria-labelledby={`${uid}-title`}
        className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <p className="eyebrow text-primary">New department</p>
            <p id={`${uid}-title`} className="text-sm font-medium text-foreground">
              Add a department to {lead?.businessName || 'this company'}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              It is created on the lead and selected here straight away.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-mr-1 -mt-1 h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setCreating(false)}
            aria-label="Cancel creating a department"
            disabled={isSaving}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={branchId}>
              Branch <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id={branchId}
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="e.g. Nagpur, Mumbai HQ"
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">Leave blank if the company has no branches.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={nameId}>
              Department{' '}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </Label>
            <Input
              id={nameId}
              autoFocus
              required
              aria-required="true"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. HR, Admin, Purchase"
              disabled={isSaving}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreate();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Press <kbd className="kbd">Enter</kbd> to add.
            </p>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setCreating(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleCreate} disabled={isSaving}>
            {isSaving ? <Spinner size="sm" className="text-current" /> : <Plus className="h-4 w-4" />}
            Add department
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Select
      value={value || ''}
      onValueChange={(v) => {
        if (v === CREATE_VALUE) {
          setCreating(true);
          if (!showBranchInput) setBranch('');
          return;
        }
        onChange(v);
      }}
      disabled={disabled}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder="Pick branch / department" />
      </SelectTrigger>
      <SelectContent>
        {groups.map((group) => (
          <div key={group.branch || '__none__'}>
            <div className="eyebrow px-2 py-1.5">{group.label}</div>
            {group.nodes.map((node) => (
              <SelectItem key={node._id} value={String(node._id)}>
                {node.name}
              </SelectItem>
            ))}
          </div>
        ))}
        <SelectItem value={CREATE_VALUE} className="font-medium text-primary focus:text-primary">
          + Create a new department…
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

export { DepartmentSelect };
export default DepartmentSelect;
