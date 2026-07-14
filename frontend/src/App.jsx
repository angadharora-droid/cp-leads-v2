import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';

import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';

import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import LeadsListPage from '@/pages/LeadsListPage';
import LeadFormPage from '@/pages/LeadFormPage';
import LeadDetailPage from '@/pages/LeadDetailPage';
import KitPage from '@/pages/KitPage';
import FollowUpsPage from '@/pages/FollowUpsPage';
import LeadTrackerPage from '@/pages/LeadTrackerPage';
import UsersPage from '@/pages/UsersPage';
import AuditLogsPage from '@/pages/AuditLogsPage';
import ChangePasswordPage from '@/pages/ChangePasswordPage';
import NotFoundPage from '@/pages/NotFoundPage';

/** Sonner toaster that follows the app's light/dark theme. */
function ThemedToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      richColors
      closeButton
      position="top-right"
      theme={theme === 'dark' ? 'dark' : 'light'}
      toastOptions={{ className: 'font-sans' }}
    />
  );
}

function App() {
  return (
    <ThemeProvider>
      <ThemedToaster />
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AuthProvider>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />

            {/* Protected (authenticated) */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="/leads" element={<LeadsListPage />} />
              <Route path="/leads/new" element={<LeadFormPage />} />
              <Route path="/leads/:id" element={<LeadDetailPage />} />
              <Route path="/leads/:id/edit" element={<LeadFormPage />} />
              <Route path="/leads/:id/kits/new" element={<KitPage />} />
              <Route path="/leads/:id/kits/:kitId" element={<KitPage />} />
              <Route path="/follow-ups" element={<FollowUpsPage />} />
              <Route path="/change-password" element={<ChangePasswordPage />} />

              {/* Admin-only */}
              <Route
                path="/lead-tracker"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <LeadTrackerPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/users"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <UsersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/audit"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <AuditLogsPage />
                  </ProtectedRoute>
                }
              />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
