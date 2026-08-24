import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import { AppProvider } from '@/context/AppContext';
import { ProtectedLayout, RequirePermission } from '@/components/auth/ProtectedLayout';
import { PortalProtectedLayout } from '@/components/auth/PortalProtectedLayout';
import { LoginPage } from '@/pages/LoginPage';
import { LandingPage } from '@/pages/LandingPage';
import { AccessDeniedPage } from '@/pages/AccessDeniedPage';
import { InternalHomePage } from '@/pages/InternalHomePage';
import { DashboardPage } from '@/pages/DashboardPage';
import { UploadPage } from '@/pages/UploadPage';
import { PreviewPage } from '@/pages/PreviewPage';
import { MasterfilePage } from '@/pages/MasterfilePage';
import { Lot2526MasterfilePage } from '@/pages/Lot2526MasterfilePage';
import { HistoryPage } from '@/pages/HistoryPage';
import { RecycleBinPage } from '@/pages/RecycleBinPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SearchPage } from '@/pages/SearchPage';
import { DownloadPage } from '@/pages/DownloadPage';
import { UserManagementPage } from '@/pages/UserManagementPage';
import { RequestQueuePage } from '@/pages/RequestQueuePage';
import { PortalHomePage } from '@/pages/portal/PortalHomePage';
import { SubmitRequestPage } from '@/pages/portal/SubmitRequestPage';
import { MyRequestsPage } from '@/pages/portal/MyRequestsPage';
import { PortalLoginPage } from '@/pages/portal/PortalLoginPage';
import { PortalRegisterPage } from '@/pages/portal/PortalRegisterPage';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/welcome" element={<LandingPage />} />
              <Route path="/portal/login" element={<PortalLoginPage />} />
              <Route path="/portal/register" element={<PortalRegisterPage />} />
              <Route element={<ProtectedLayout />}>
                <Route path="/access-denied" element={<AccessDeniedPage />} />
                <Route path="/home" element={<RequirePermission permission="view"><InternalHomePage /></RequirePermission>} />
                <Route path="/" element={<RequirePermission permission="view"><DashboardPage /></RequirePermission>} />
                <Route path="/upload" element={<RequirePermission permission="upload"><UploadPage /></RequirePermission>} />
                <Route path="/preview" element={<RequirePermission permission="process"><PreviewPage /></RequirePermission>} />
                <Route path="/masterfile" element={<RequirePermission permission="view"><MasterfilePage /></RequirePermission>} />
                <Route path="/masterfile-2526" element={<RequirePermission permission="view"><Lot2526MasterfilePage /></RequirePermission>} />
                <Route path="/history" element={<RequirePermission permission="view_logs"><HistoryPage /></RequirePermission>} />
                <Route path="/recycle-bin" element={<RequirePermission permission="delete"><RecycleBinPage /></RequirePermission>} />
                <Route path="/settings" element={<RequirePermission permission="configure"><SettingsPage /></RequirePermission>} />
                <Route path="/search" element={<RequirePermission permission="search"><SearchPage /></RequirePermission>} />
                <Route path="/download" element={<RequirePermission permission="download"><DownloadPage /></RequirePermission>} />
                <Route path="/users" element={<RequirePermission permission="manage_users"><UserManagementPage /></RequirePermission>} />
                <Route path="/requests" element={<RequirePermission permission="manage_requests"><RequestQueuePage /></RequirePermission>} />
              </Route>
              <Route element={<PortalProtectedLayout />}>
                <Route path="/portal" element={<RequirePermission permission="submit_request"><PortalHomePage /></RequirePermission>} />
                <Route path="/portal/submit" element={<RequirePermission permission="submit_request"><SubmitRequestPage /></RequirePermission>} />
                <Route path="/portal/my-requests" element={<RequirePermission permission="submit_request"><MyRequestsPage /></RequirePermission>} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AppProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
