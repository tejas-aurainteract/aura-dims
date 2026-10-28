import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/Layout/Layout';
import { DashboardPage } from '@/pages/DashboardPage';
import { DisplaysPage } from '@/pages/DisplaysPage';
import { ContentLibraryPage } from '@/pages/ContentLibraryPage';
import { ContentCreatorPage } from '@/pages/ContentCreatorPage';
import { TemplatesPage } from '@/pages/TemplatesPage';
import { SchedulesPage } from '@/pages/SchedulesPage';
import { ApprovalsPage } from '@/pages/ApprovalsPage';
import { UsersAndRolesPage } from '@/pages/UsersAndRolesPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { DiagnosticsPage } from '@/pages/DiagnosticsPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="displays" element={<DisplaysPage />} />
          <Route path="content-library" element={<ContentLibraryPage />} />
          <Route path="content-creator" element={<ContentCreatorPage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="schedules" element={<SchedulesPage />} />
          <Route path="approvals" element={<ApprovalsPage />} />
          <Route path="users-and-roles" element={<UsersAndRolesPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="diagnostics" element={<DiagnosticsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;

