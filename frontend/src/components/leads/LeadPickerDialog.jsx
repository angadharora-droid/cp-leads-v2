import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Building2, Plus, Search, User } from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { isIndividual } from '@/lib/departments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

/**
 * Lead picker used by the pipeline boards ("New enquiry" / "New rate
 * contract"): search across every lead the user can see; picking one hands
 * it back, and when the lead doesn't exist yet the exec is sent to create it
 * first (name pre-filled) — the lead form then asks company vs individual.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {(lead: object) => void} props.onPick
 * @param {string} [props.title]
 * @param {string} [props.description]
 * @param {'company'|'individual'} [props.leadType] restrict the search
 */
function LeadPickerDialog({ open, onOpenChange, onPick, title, description, leadType }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [leads, setLeads] = useState(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setLeads(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/leads', {
          params: {
            q: q.trim() || undefined,
            leadType: leadType || undefined,
            limit: 20,
            sort: 'businessName',
          },
        });
        if (active) setLeads(res?.data?.data?.items || []);
      } catch (err) {
        if (active) {
          setLeads([]);
          toast.error(getErrorMessage(err, 'Failed to load leads'));
        }
      }
    }, q ? 300 : 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, q, leadType]);

  function goCreateLead() {
    onOpenChange(false);
    const name = q.trim();
    const params = new URLSearchParams();
    if (name) params.set('businessName', name);
    if (leadType) params.set('leadType', leadType);
    const qs = params.toString();
    navigate(qs ? `/leads/new?${qs}` : '/leads/new');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title || 'Pick the lead'}</DialogTitle>
          <DialogDescription>
            {description ||
              'Search the lead below; if it is not listed yet, create it first and then continue from its page.'}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={leadType === 'company' ? 'Search company name…' : 'Search by name…'}
            className="pl-9"
          />
        </div>

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {leads === null ? (
            <div className="flex justify-center py-6">
              <Spinner className="h-5 w-5" />
            </div>
          ) : leads.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No lead matches “{q.trim() || '…'}”.
            </p>
          ) : (
            leads.map((lead) => {
              const Icon = isIndividual(lead) ? User : Building2;
              const deptCount = (lead.departments || []).length;
              return (
                <button
                  key={lead._id}
                  type="button"
                  onClick={() => onPick(lead)}
                  className="flex w-full items-start gap-2.5 rounded-md border bg-card px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-muted/50"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {lead.businessName}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {lead.reference}
                      {lead.city ? ` · ${lead.city}` : ''}
                      {lead.contactPerson ? ` · ${lead.contactPerson}` : ''}
                      {!isIndividual(lead) && deptCount
                        ? ` · ${deptCount} department${deptCount > 1 ? 's' : ''}`
                        : ''}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        <Button
          type="button"
          variant={leads && leads.length === 0 ? 'default' : 'outline'}
          className="w-full"
          onClick={goCreateLead}
        >
          <Plus className="h-4 w-4" />
          {q.trim() ? `Create new lead “${q.trim()}”` : 'Create new lead'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export { LeadPickerDialog };
export default LeadPickerDialog;
