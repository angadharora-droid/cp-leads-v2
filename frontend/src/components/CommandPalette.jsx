import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  CalendarClock,
  CalendarDays,
  CornerDownLeft,
  FileSignature,
  FolderKanban,
  KanbanSquare,
  LayoutDashboard,
  Plus,
  Search,
  User,
} from 'lucide-react';

import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { StatusBadge } from '@/components/StatusBadge';
import { Kbd } from '@/components/ui/kbd';
import { Spinner } from '@/components/ui/spinner';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const PAGES = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard, keywords: 'home overview' },
  { label: 'Leads', to: '/leads', icon: FolderKanban, keywords: 'companies individuals list' },
  { label: 'Enquiries', to: '/enquiries', icon: KanbanSquare, keywords: 'banquet pipeline board' },
  { label: 'Rate Contracts', to: '/rate-contracts', icon: FileSignature, keywords: 'arc corporate agreement' },
  { label: 'Banquet Calendar', to: '/banquet-calendar', icon: CalendarDays, keywords: 'availability venues' },
  { label: 'Follow-ups', to: '/follow-ups', icon: CalendarClock, keywords: 'due today reminders' },
  { label: 'Reports', to: '/reports', icon: BarChart3, keywords: 'excel export' },
];

const ACTIONS = [
  { label: 'New lead', to: '/leads/new', icon: Plus, keywords: 'create company individual' },
];

/**
 * Global command palette (Ctrl/⌘ K): jump to a page or find a lead by name,
 * contact, phone, email or reference and open it.
 */
function CommandPalette({ open, onOpenChange }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [leads, setLeads] = useState([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setLeads([]);
      setActive(0);
    }
  }, [open]);

  // Debounced lead search.
  useEffect(() => {
    if (!open) return undefined;
    const q = query.trim();
    if (q.length < 2) {
      setLeads([]);
      setSearching(false);
      return undefined;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await api.get('/leads', { params: { q, limit: 8, sort: '-updatedAt' } });
        if (alive) setLeads(res?.data?.data?.items || []);
      } catch {
        if (alive) setLeads([]);
      } finally {
        if (alive) setSearching(false);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [open, query]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchesQ = (p) =>
      !q || p.label.toLowerCase().includes(q) || (p.keywords || '').includes(q);
    const pages = PAGES.filter(matchesQ).map((p) => ({ type: 'page', ...p }));
    const actions = ACTIONS.filter(matchesQ).map((a) => ({ type: 'action', ...a }));
    const leadItems = leads.map((l) => ({ type: 'lead', lead: l, to: `/leads/${l._id}` }));
    // Leads first when searching; navigation first when the box is empty.
    return q ? [...leadItems, ...actions, ...pages] : [...actions, ...pages];
  }, [query, leads]);

  useEffect(() => {
    setActive(0);
  }, [items.length, query]);

  const go = useCallback(
    (item) => {
      if (!item) return;
      onOpenChange(false);
      navigate(item.to);
    },
    [navigate, onOpenChange]
  );

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(items[active]);
    }
  }

  // Keep the active row in view.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${active}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const isAdmin = user?.role === 'admin';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 sm:rounded-xl">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Jump to a page or search leads by name, contact, phone, email or reference.
        </DialogDescription>
        <div className="flex items-center gap-2 border-b px-4">
          {searching ? (
            <Spinner size="sm" />
          ) : (
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search leads, or jump to a page…"
            aria-label="Search"
            aria-activedescendant={items[active] ? `cmd-item-${active}` : undefined}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-list"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div id="cmd-list" ref={listRef} role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {searching ? 'Searching…' : `No results for “${query.trim()}”.`}
            </p>
          ) : null}
          {items.map((item, i) => {
            const selected = i === active;
            if (item.type === 'lead') {
              const l = item.lead;
              const Icon = l.leadType === 'individual' ? User : Building2;
              return (
                <button
                  key={`lead-${l._id}`}
                  id={`cmd-item-${i}`}
                  data-index={i}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(item)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm',
                    selected ? 'bg-muted text-foreground' : 'text-foreground/90'
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{l.businessName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      <span className="font-mono">{l.reference}</span>
                      {l.contactPerson ? ` · ${l.contactPerson}` : ''}
                      {l.mobile ? ` · ${l.mobile}` : ''}
                      {l.city ? ` · ${l.city}` : ''}
                      {isAdmin && l.assignedTo?.name ? ` · ${l.assignedTo.name}` : ''}
                    </span>
                  </span>
                  <StatusBadge status={l.status} className="hidden sm:inline-flex" />
                </button>
              );
            }
            const Icon = item.icon;
            return (
              <button
                key={`${item.type}-${item.to}`}
                id={`cmd-item-${i}`}
                data-index={i}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm',
                  selected ? 'bg-muted text-foreground' : 'text-foreground/90'
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex-1">
                  {item.label}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {item.type === 'action' ? 'Action' : 'Page'}
                  </span>
                </span>
                {selected ? <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" /> : null}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 border-t bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> open
          </span>
          <span className="ml-auto hidden sm:inline">Type at least 2 characters to search leads</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Global Ctrl/⌘+K binding — returns [open, setOpen]. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return [open, setOpen];
}

export { CommandPalette };
export default CommandPalette;
