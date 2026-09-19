import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  FolderKanban,
  KanbanSquare,
  FileSignature,
  FileSpreadsheet,
  Receipt,
  BarChart3,
  Settings2,
  UserCog,
  ScrollText,
  Building2,
  ChevronsUpDown,
  Check,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { hasModule, MODULES, MODULE_HOME, userModules } from '@/lib/modules';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';

const LEADS_GROUPS = [
  {
    label: 'Workspace',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/leads', label: 'Leads', icon: FolderKanban },
      { to: '/enquiries', label: 'Enquiries', icon: KanbanSquare },
      { to: '/rate-contracts', label: 'Rate Contracts', icon: FileSignature },
      { to: '/banquet-calendar', label: 'Banquet Calendar', icon: CalendarDays },
      { to: '/follow-ups', label: 'Follow-ups', icon: CalendarClock, badge: 'followUps' },
      { to: '/reports', label: 'Reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Administration',
    adminOnly: true,
    items: [
      { to: '/lead-tracker', label: 'Lead Tracker', icon: Building2 },
      { to: '/banquet-setup', label: 'Banquet Setup', icon: Settings2 },
      { to: '/users', label: 'Users', icon: UserCog },
      { to: '/audit', label: 'Audit Logs', icon: ScrollText },
    ],
  },
  {
    label: 'Sections',
    items: [
      { to: '/prospectus', label: 'Function Prospectus', icon: FileSpreadsheet, module: 'prospectus' },
      { to: '/estimates', label: 'Banquet Estimate', icon: Receipt, module: 'estimates' },
    ],
  },
];

const PROSPECTUS_GROUPS = [
  {
    label: 'Prospectus desk',
    items: [
      { to: '/prospectus', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/prospectus/list', label: 'Functions & sheets', icon: ClipboardList },
    ],
  },
  {
    label: 'Administration',
    adminOnly: true,
    items: [{ to: '/prospectus/settings', label: 'Prospectus Settings', icon: Settings2 }],
  },
  {
    label: 'Sections',
    items: [
      { to: '/', label: 'Leads CRM', icon: FolderKanban, module: 'leads', end: true },
      { to: '/estimates', label: 'Banquet Estimate', icon: Receipt, module: 'estimates' },
    ],
  },
];

const ESTIMATE_GROUPS = [
  {
    label: 'Estimate desk',
    items: [
      { to: '/estimates', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/estimates/list', label: 'Sheets & estimates', icon: ClipboardList },
    ],
  },
  {
    label: 'Administration',
    adminOnly: true,
    items: [{ to: '/estimates/settings', label: 'Estimate Settings', icon: Settings2 }],
  },
  {
    label: 'Sections',
    items: [
      { to: '/', label: 'Leads CRM', icon: FolderKanban, module: 'leads', end: true },
      { to: '/prospectus', label: 'Function Prospectus', icon: FileSpreadsheet, module: 'prospectus' },
    ],
  },
];

const SECTIONS = {
  leads: { groups: LEADS_GROUPS, subtitle: 'Leads CRM' },
  prospectus: { groups: PROSPECTUS_GROUPS, subtitle: 'Function Prospectus' },
  estimates: { groups: ESTIMATE_GROUPS, subtitle: 'Banquet Estimate' },
};

/**
 * Follow-ups due today or overdue, for the nav badge. Best effort and
 * refreshed every few minutes; failures simply hide the badge. Skipped
 * outside the Leads CRM, where the account may have no access to them.
 */
function useDueFollowUps(enabled = true) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return undefined;
    }
    let alive = true;
    async function load() {
      try {
        const res = await api.get('/follow-ups/mine');
        const list = res?.data?.data?.followUps || [];
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        const due = list.filter((f) => f.dueDate && new Date(f.dueDate) <= end).length;
        if (alive) setCount(due);
      } catch {
        if (alive) setCount(0);
      }
    }
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [enabled]);
  return count;
}

function NavItem({ to, label, icon: Icon, end, badgeCount, onNavigate, collapsed }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          collapsed && 'justify-center px-2',
          isActive
            ? 'bg-primary/10 font-semibold text-primary ring-1 ring-inset ring-primary/10'
            : 'text-sidebar-foreground/85 hover:bg-muted hover:text-foreground'
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* Active-route indicator bar. */}
          <span
            className={cn(
              'absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary transition-opacity duration-150',
              isActive ? 'opacity-100' : 'opacity-0'
            )}
            aria-hidden="true"
          />
          <Icon
            className={cn(
              'h-4 w-4 shrink-0 transition-colors',
              isActive
                ? 'text-primary'
                : 'text-muted-foreground/70 group-hover:text-foreground'
            )}
          />
          <span className={collapsed ? 'sr-only' : 'flex-1 truncate'}>{label}</span>
          {badgeCount && !collapsed ? (
            <span
              className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-warning"
              aria-label={`${badgeCount} due`}
            >
              {badgeCount}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}

function SidebarContent({ section = 'leads', onNavigate, collapsed = false }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { groups: sectionGroups, subtitle } = SECTIONS[section] || SECTIONS.leads;
  const groups = sectionGroups
    .filter((g) => g.label !== 'Sections' && (!g.adminOnly || isAdmin))
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.module || hasModule(user, i.module)) }))
    .filter((g) => g.items.length);
  const dueFollowUps = useDueFollowUps(section === 'leads');
  const badges = { followUps: dueFollowUps };

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn('flex h-14 items-center gap-3 px-4', collapsed && 'justify-center px-2')}>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/75 text-primary-foreground shadow-sm">
          <Building2 className="h-5 w-5" />
        </div>
        <div className={cn('flex flex-col leading-tight', collapsed && 'hidden')}>
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Centre Point
          </span>
          <span className="text-xs text-muted-foreground">Hospitality</span>
        </div>
      </div>

      <div className={cn('mx-3 mb-1 mt-2', collapsed && 'mx-2')}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className={cn('h-10 w-full justify-between gap-2 bg-card px-3 text-left', collapsed && 'justify-center px-2')} title={`Switch workspace: ${subtitle}`} aria-label={`Switch workspace, current: ${subtitle}`}>
              <span className={collapsed ? 'sr-only' : 'min-w-0 truncate text-xs font-semibold'}>{subtitle}</span>
              <ChevronsUpDown className="shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Your workspaces</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {MODULES.filter((module) => userModules(user).includes(module.key)).map((module) => (
              <DropdownMenuItem key={module.key} asChild>
                <NavLink to={MODULE_HOME[module.key]} onClick={onNavigate} className="flex items-center justify-between gap-3">
                  {module.label}
                  {section === module.key ? <Check className="text-primary" /> : null}
                </NavLink>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <nav className={cn('flex-1 space-y-5 overflow-y-auto px-3 py-4', collapsed && 'px-2')} aria-label="Main">
        {groups.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className={collapsed ? 'sr-only' : 'eyebrow px-3 pb-1'}>{group.label === 'Workspace' ? 'Manage leads' : group.label}</p>
            {group.items.map((item) => (
              <NavItem
                key={item.to}
                {...item}
                badgeCount={item.badge ? badges[item.badge] : 0}
                onNavigate={onNavigate}
                collapsed={collapsed}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className={cn('mx-4 border-t border-sidebar-border py-4', collapsed && 'hidden')}>
        <p className="truncate text-xs font-medium text-foreground">{user?.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">{isAdmin ? 'Administrator' : user?.role === 'manager' ? 'Manager' : 'Executive'} · {subtitle}</p>
      </div>
    </div>
  );
}

/**
 * Sidebar shell. Desktop: fixed left rail. Mobile: slide-over drawer
 * controlled by `open`/`onClose` (Escape closes it too).
 */
function Sidebar({ section = 'leads', open = false, onClose, collapsed = false }) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Desktop static sidebar. */}
      <aside className={cn('hidden shrink-0 lg:block', collapsed ? 'w-16' : 'w-56')}>
        <div className={cn('fixed inset-y-0 left-0 border-r border-sidebar-border', collapsed ? 'w-16' : 'w-56')}>
          <SidebarContent section={section} collapsed={collapsed} />
        </div>
      </aside>

      {/* Mobile drawer. */}
      <div
        className={cn(
          'fixed inset-0 z-40 lg:hidden',
          open ? 'pointer-events-auto' : 'pointer-events-none'
        )}
        aria-hidden={!open}
      >
        <div
          className={cn(
            'absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity duration-200',
            open ? 'opacity-100' : 'opacity-0'
          )}
          onClick={onClose}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className={cn(
            'absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-elevated transition-transform duration-200 ease-out',
            open ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="absolute right-2 top-3 z-10 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </Button>
          <SidebarContent section={section} onNavigate={onClose} />
        </div>
      </div>
    </>
  );
}

export { Sidebar };
export default Sidebar;
