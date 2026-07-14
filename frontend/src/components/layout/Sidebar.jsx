import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarClock,
  FolderKanban,
  UserCog,
  ScrollText,
  Building2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';

const NAV_GROUPS = [
  {
    label: 'Workspace',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/leads', label: 'Leads', icon: FolderKanban },
      { to: '/follow-ups', label: 'Follow-ups', icon: CalendarClock },
    ],
  },
  {
    label: 'Administration',
    adminOnly: true,
    items: [
      { to: '/lead-tracker', label: 'Lead Tracker', icon: Building2 },
      { to: '/users', label: 'Users', icon: UserCog },
      { to: '/audit', label: 'Audit Logs', icon: ScrollText },
    ],
  },
];

function NavItem({ to, label, icon: Icon, end, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150',
          isActive
            ? 'bg-primary/10 font-semibold text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
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
          {label}
        </>
      )}
    </NavLink>
  );
}

function SidebarContent({ onNavigate }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const groups = NAV_GROUPS.filter((g) => !g.adminOnly || isAdmin);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 border-b px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/75 text-primary-foreground shadow-sm">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Centre Point
          </span>
          <span className="text-xs text-muted-foreground">Leads CRM</span>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </p>
            {group.items.map((item) => (
              <NavItem key={item.to} {...item} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t p-4">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Centre Point Hospitality
          <br />
          Lead Management Platform
        </p>
      </div>
    </div>
  );
}

/**
 * Sidebar shell. Desktop: fixed left rail. Mobile: slide-over drawer
 * controlled by `open`/`onClose`.
 */
function Sidebar({ open = false, onClose }) {
  return (
    <>
      {/* Desktop static sidebar. */}
      <aside className="hidden w-64 shrink-0 border-r bg-card lg:block">
        <div className="fixed inset-y-0 left-0 w-64 border-r bg-card">
          <SidebarContent />
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
            'absolute inset-0 bg-black/50 transition-opacity',
            open ? 'opacity-100' : 'opacity-0'
          )}
          onClick={onClose}
        />
        <div
          className={cn(
            'absolute inset-y-0 left-0 w-64 bg-card shadow-xl transition-transform duration-200',
            open ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="absolute right-2 top-3 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </Button>
          <SidebarContent onNavigate={onClose} />
        </div>
      </div>
    </>
  );
}

export { Sidebar };
export default Sidebar;
