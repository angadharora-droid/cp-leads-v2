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
import ReportsPage from '@/pages/ReportsPage';
import LeadTrackerPage from '@/pages/LeadTrackerPage';
import EnquiriesBoardPage from '@/pages/EnquiriesBoardPage';
import EnquiryPage from '@/pages/EnquiryPage';
import ArcsBoardPage from '@/pages/ArcsBoardPage';
import ArcPage from '@/pages/ArcPage';
import BanquetCalendarPage from '@/pages/BanquetCalendarPage';
import BanquetSetupPage from '@/pages/BanquetSetupPage';
import SignProposalPage from '@/pages/SignProposalPage';
import UsersPage from '@/pages/UsersPage';
import AuditLogsPage from '@/pages/AuditLogsPage';
import ChangePasswordPage from '@/pages/ChangePasswordPage';
import EmailSettingsPage from '@/pages/EmailSettingsPage';
import NotificationsPage from '@/pages/NotificationsPage';
import ProspectusOverview from '@/pages/prospectus/ProspectusOverview';
import ProspectusListPage from '@/pages/prospectus/ProspectusListPage';
import ProspectusPage from '@/pages/prospectus/ProspectusPage';
import ProspectusSettingsPage from '@/pages/prospectus/ProspectusSettingsPage';
import EstimatesOverview from '@/pages/estimates/EstimatesOverview';
import EstimateListPage from '@/pages/estimates/EstimateListPage';
import EstimatePage from '@/pages/estimates/EstimatePage';
import EstimateSettingsPage from '@/pages/estimates/EstimateSettingsPage';
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
            {/* Client-facing contract signing (token-gated, no login). */}
            <Route path="/sign/:token" element={<SignProposalPage />} />

            {/* Protected: Leads CRM section */}
            <Route
              element={
                <ProtectedRoute module="leads">
                  <AppLayout section="leads" />
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
              <Route path="/enquiries" element={<EnquiriesBoardPage />} />
              <Route path="/enquiries/:enquiryId" element={<EnquiryPage />} />
              <Route path="/rate-contracts" element={<ArcsBoardPage />} />
              <Route path="/rate-contracts/:arcId" element={<ArcPage />} />
              <Route path="/banquet-calendar" element={<BanquetCalendarPage />} />
              <Route path="/reports" element={<ReportsPage />} />

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
                path="/banquet-setup"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <BanquetSetupPage />
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

            {/* Protected: Function Prospectus section */}
            <Route
              element={
                <ProtectedRoute module="prospectus">
                  <AppLayout section="prospectus" />
                </ProtectedRoute>
              }
            >
              <Route path="/prospectus" element={<ProspectusOverview />} />
              <Route path="/prospectus/list" element={<ProspectusListPage />} />
              <Route
                path="/prospectus/settings"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <ProspectusSettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/prospectus/:id" element={<ProspectusPage />} />
            </Route>

            {/* Protected: Banquet Estimate section */}
            <Route
              element={
                <ProtectedRoute module="estimates">
                  <AppLayout section="estimates" />
                </ProtectedRoute>
              }
            >
              <Route path="/estimates" element={<EstimatesOverview />} />
              <Route path="/estimates/list" element={<EstimateListPage />} />
              <Route
                path="/estimates/settings"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <EstimateSettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/estimates/sheets/:id" element={<ProtectedRoute requiredRole={['admin', 'manager']}><ProspectusPage accountsView /></ProtectedRoute>} />
              <Route path="/estimates/:id" element={<EstimatePage />} />
            </Route>

            {/* Protected: pages every account keeps, whatever its sections */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/change-password" element={<ChangePasswordPage />} />
              <Route path="/email-settings" element={<EmailSettingsPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
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
