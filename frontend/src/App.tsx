import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import { AppProvider } from '@/context/AppContext';
import { ProtectedLayout, RequirePermission } from '@/components/auth/ProtectedLayout';
import { LoginPage } from '@/pages/LoginPage';
import { AccessDeniedPage } from '@/pages/AccessDeniedPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { UploadPage } from '@/pages/UploadPage';
import { PreviewPage } from '@/pages/PreviewPage';
import { MasterfilePage } from '@/pages/MasterfilePage';
import { HistoryPage } from '@/pages/HistoryPage';
import { RecycleBinPage } from '@/pages/RecycleBinPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SearchPage } from '@/pages/SearchPage';
import { DownloadPage } from '@/pages/DownloadPage';
import { UserManagementPage } from '@/pages/UserManagementPage';
import { ExtractionDebugPage } from '@/pages/ExtractionDebugPage';
import { Lot2526CasesPage } from '@/pages/Lot2526CasesPage';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedLayout />}>
                <Route path="/access-denied" element={<AccessDeniedPage />} />
                <Route path="/" element={<RequirePermission permission="view"><DashboardPage /></RequirePermission>} />
                <Route path="/upload" element={<RequirePermission permission="upload"><UploadPage /></RequirePermission>} />
                <Route path="/preview" element={<RequirePermission permission="process"><PreviewPage /></RequirePermission>} />
                <Route path="/masterfile" element={<RequirePermission permission="view"><MasterfilePage /></RequirePermission>} />
                <Route path="/2526/cases" element={<RequirePermission permission="view"><Lot2526CasesPage /></RequirePermission>} />
                <Route path="/history" element={<RequirePermission permission="view_logs"><HistoryPage /></RequirePermission>} />
                <Route path="/recycle-bin" element={<RequirePermission permission="delete"><RecycleBinPage /></RequirePermission>} />
                <Route path="/settings" element={<RequirePermission permission="configure"><SettingsPage /></RequirePermission>} />
                <Route path="/extraction-debug" element={<RequirePermission permission="configure"><ExtractionDebugPage /></RequirePermission>} />
                <Route path="/search" element={<RequirePermission permission="search"><SearchPage /></RequirePermission>} />
                <Route path="/download" element={<RequirePermission permission="download"><DownloadPage /></RequirePermission>} />
                <Route path="/users" element={<RequirePermission permission="manage_users"><UserManagementPage /></RequirePermission>} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AppProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
