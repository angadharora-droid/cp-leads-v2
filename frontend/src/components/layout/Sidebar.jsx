import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users2,
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

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/leads', label: 'Leads', icon: FolderKanban },
  { to: '/follow-ups', label: 'Follow-ups', icon: CalendarClock },
  { to: '/lead-tracker', label: 'Lead Tracker', icon: Building2, adminOnly: true },
  { to: '/users', label: 'Users', icon: UserCog, adminOnly: true },
  { to: '/audit', label: 'Audit Logs', icon: ScrollText, adminOnly: true },
];

function SidebarContent({ onNavigate }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Users2 className="h-5 w-5" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-foreground">
            Centre Point
          </span>
          <span className="text-xs text-muted-foreground">Leads CRM</span>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
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
