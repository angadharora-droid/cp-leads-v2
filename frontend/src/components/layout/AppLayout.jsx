import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { userModules } from '@/lib/modules';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { CommandPalette, useCommandPalette } from '@/components/CommandPalette';
import { PdfPreviewHost } from '@/components/PdfPreview';

/**
 * Authenticated application shell: sidebar + topbar + routed content, with a
 * skip link, a `main` landmark that receives focus on route change, and the
 * global Ctrl/⌘K search.
 *
 * `section` picks which navigation the shell shows: the Leads CRM or the
 * Function Prospectus desk. Pages shared by both (password, email settings)
 * leave it at 'auto', which follows the sections the account has.
 */
function AppLayout({ section = 'auto' }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('cph_sidebar_compact') === '1'; } catch { return false; }
  });
  const toggleSidebar = () => setSidebarCollapsed((previous) => {
    try { localStorage.setItem('cph_sidebar_compact', previous ? '0' : '1'); } catch { /* optional preference */ }
    return !previous;
  });
  const [paletteOpen, setPaletteOpen] = useCommandPalette();
  const location = useLocation();
  const { user } = useAuth();
  const active = section === 'auto' ? (userModules(user)[0] || 'leads') : section;

  // Close the drawer and move focus to the content on navigation.
  useEffect(() => {
    setMobileOpen(false);
    const main = document.getElementById('main');
    if (main) {
      main.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    }
  }, [location.pathname]);

  return (
    <div className="flex min-h-dvh bg-background">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Sidebar section={active} collapsed={sidebarCollapsed} open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          section={active}
          collapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
          onMenuClick={() => setMobileOpen(true)}
          onSearchClick={() => setPaletteOpen(true)}
        />
        <main
          id="main"
          tabIndex={-1}
          className="app-main min-w-0 flex-1 px-4 pb-8 pt-4 outline-none lg:px-6"
        >
          <div key={location.pathname} className="mx-auto w-full max-w-[1600px] animate-slide-in">
            <Outlet />
          </div>
        </main>
      </div>
      {/* The palette searches leads, so it belongs to the Leads CRM only. */}
      {active === 'leads' ? <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} /> : null}
      {/* In-app PDF viewer for every Preview action (no new tabs, no downloads). */}
      <PdfPreviewHost />
    </div>
  );
}

export { AppLayout };
export default AppLayout;
