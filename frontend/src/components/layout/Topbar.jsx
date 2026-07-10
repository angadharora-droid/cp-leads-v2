import { useNavigate } from 'react-router-dom';
import { Menu, KeyRound, LogOut, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { getInitials } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
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
  sales_exec: 'Sales Executive',
};

/**
 * Top application bar: mobile menu trigger, brand, theme toggle, and a
 * user dropdown (change password, logout).
 *
 * @param {object} props
 * @param {() => void} props.onMenuClick opens the mobile sidebar
 */
function Topbar({ onMenuClick }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    toast.success('Signed out');
    navigate('/login', { replace: true });
  }

  const roleLabel = ROLE_LABELS[user?.role] || user?.role || '';

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold text-foreground sm:text-base">
          Centre Point Hospitality
        </span>
        <span className="hidden text-xs text-muted-foreground sm:block">
          Leads CRM
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-10 gap-2 px-2 sm:px-3"
              aria-label="User menu"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                {getInitials(user?.name)}
              </span>
              <span className="hidden flex-col items-start leading-tight sm:flex">
                <span className="text-sm font-medium text-foreground">
                  {user?.name || 'User'}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {roleLabel}
                </span>
              </span>
              <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col">
              <span>{user?.name}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {user?.email}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/change-password')}>
              <KeyRound className="h-4 w-4" />
              Change password
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
