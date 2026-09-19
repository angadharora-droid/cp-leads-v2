import { useNavigate, useLocation } from 'react-router-dom';
import { Menu, KeyRound, LogOut, ChevronDown, Mail, Search, Plus, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { getInitials } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NotificationBell } from '@/components/layout/NotificationBell';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

const ROLE_LABELS = {
  admin: 'Administrator',
  sales_exec: 'Executive',
  manager: 'Manager',
};

const SECTION_LABELS = {
  leads: 'Leads CRM',
  prospectus: 'Function Prospectus',
  estimates: 'Banquet Estimate',
};

/**
 * Top application bar: mobile menu trigger, global search, quick-create,
 * theme toggle and the user menu. Search and quick-create belong to the
 * Leads CRM, so they are dropped in the other sections.
 *
 * @param {object} props
 * @param {string} [props.section] 'leads' | 'prospectus'
 * @param {() => void} props.onMenuClick opens the mobile sidebar
 * @param {() => void} props.onSearchClick opens the command palette
 */
function Topbar({ section = 'leads', onMenuClick, onSearchClick, collapsed, onToggleSidebar }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const pageNames = {
    '/': 'Dashboard', '/leads': 'Leads', '/leads/new': 'New lead', '/enquiries': 'Enquiries',
    '/rate-contracts': 'Rate contracts', '/banquet-calendar': 'Banquet calendar', '/follow-ups': 'Follow-ups',
    '/reports': 'Reports', '/users': 'Team & access', '/audit': 'Audit logs', '/lead-tracker': 'Lead tracker',
    '/banquet-setup': 'Banquet setup', '/change-password': 'Change password', '/email-settings': 'Email settings', '/notifications': 'Notifications',
    '/prospectus': 'FP overview', '/prospectus/list': 'Functions & sheets', '/prospectus/settings': 'FP settings',
    '/estimates': 'Estimate overview', '/estimates/list': 'Sheets & estimates', '/estimates/settings': 'Estimate settings',
  };
  const pageName = pageNames[pathname] || (pathname.startsWith('/leads/') ? 'Lead details' : pathname.startsWith('/enquiries/') ? 'Enquiry details' : pathname.startsWith('/rate-contracts/') ? 'Rate contract' : pathname.startsWith('/prospectus/') || pathname.startsWith('/estimates/sheets/') ? 'Function prospectus' : 'Estimate details');
  const isLeads = section === 'leads';

  async function handleLogout() {
    await logout();
    toast.success('Signed out');
    navigate('/login', { replace: true });
  }

  const roleLabel = ROLE_LABELS[user?.role] || user?.role || '';
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-topbar/95 px-3 backdrop-blur sm:gap-3 lg:px-5">
      <Button variant="ghost" size="icon" className="hidden h-8 w-8 lg:inline-flex" onClick={onToggleSidebar}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
      </Button>
      <span className="mr-3 hidden shrink-0 text-sm font-semibold lg:block">{pageName}</span>
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Brand (only when the sidebar is hidden) */}
      <div className="flex flex-col leading-tight lg:hidden">
        <span className="text-sm font-semibold text-foreground">Centre Point</span>
        <span className="hidden text-[11px] text-muted-foreground sm:block">
          {SECTION_LABELS[section] || SECTION_LABELS.leads}
        </span>
      </div>

      {/* Global search — a button that opens the palette; keyboard: Ctrl/⌘ K. */}
      {isLeads ? (
        <button
          type="button"
          onClick={onSearchClick}
          className="ml-auto flex h-9 items-center gap-2 rounded-lg border border-transparent bg-muted/70 px-3 text-sm text-muted-foreground transition-colors hover:border-input hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:ml-0 sm:w-56 xl:w-72"
          aria-label="Search leads or jump to a page"
        >
          <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="hidden flex-1 text-left sm:inline">Search leads, pages…</span>
          <span className="ml-auto hidden items-center gap-1 sm:flex" aria-hidden="true">
            <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
      ) : (
        <div className="mr-auto" />
      )}

      <div className="flex items-center gap-1 sm:ml-auto sm:gap-2">
        {isLeads ? (
          <>
            <Button
              size="sm"
              className="hidden md:inline-flex"
              onClick={() => navigate('/leads/new')}
            >
              <Plus className="h-4 w-4" />
              New lead
            </Button>
            <Button
              size="icon"
              className="md:hidden"
              onClick={() => navigate('/leads/new')}
              aria-label="New lead"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </>
        ) : null}

        <NotificationBell />

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-11 gap-2.5 rounded-lg px-1.5 sm:px-2"
              aria-label="User menu"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                {getInitials(user?.name)}
              </span>
              <span className="hidden flex-col items-start leading-tight md:flex">
                <span className="max-w-40 truncate text-sm font-medium text-foreground">
                  {user?.name || 'User'}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {roleLabel}
                </span>
              </span>
              <ChevronDown className="hidden h-4 w-4 text-muted-foreground md:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="flex flex-col">
              <span>{user?.name}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {user?.email}
              </span>
              <span className="mt-1 text-[11px] font-normal uppercase tracking-wider text-muted-foreground">
                {roleLabel}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/change-password')}>
              <KeyRound className="h-4 w-4" />
              Change password
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/email-settings')}>
              <Mail className="h-4 w-4" />
              Email settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export { Topbar };
export default Topbar;
