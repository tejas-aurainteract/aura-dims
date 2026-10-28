/**
 * Aura DIMS - Root Application Component & Routing
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Configures React Router, Authentication Provider, Protected Routes,
 * role authorization boundaries, and legacy route redirects.
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/Auth/ProtectedRoute';
import { Layout } from '@/components/Layout/Layout';

// Auth Pages
import { LoginPage } from '@/pages/LoginPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { AccessDeniedPage } from '@/pages/AccessDeniedPage';

// Business Pages
import { DashboardPage } from '@/pages/DashboardPage';
import { DisplaysPage } from '@/pages/DisplaysPage';
import { ContentPage } from '@/pages/ContentPage';
import { SchedulesPage } from '@/pages/SchedulesPage';
import { ApprovalsPage } from '@/pages/ApprovalsPage';
import { UsersPage } from '@/pages/UsersPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { DiagnosticsPage } from '@/pages/DiagnosticsPage';

export const App: React.FC = () => {
  const isDev = import.meta.env.DEV;

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Authentication Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/access-denied" element={<AccessDeniedPage />} />

          {/* Authenticated Application Shell */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            {/* Primary Business Navigation */}
            <Route index element={<DashboardPage />} />
            <Route path="displays" element={<DisplaysPage />} />
            <Route path="content" element={<ContentPage />} />
            <Route path="schedules" element={<SchedulesPage />} />
            <Route path="approvals" element={<ApprovalsPage />} />

            {/* Admin-Only Users Management */}
            <Route
              path="users"
              element={
                <ProtectedRoute requiredRole="admin">
                  <UsersPage />
                </ProtectedRoute>
              }
            />

            <Route path="settings" element={<SettingsPage />} />

            {/* Development-Only Diagnostics Probe */}
            {isDev && <Route path="dev/diagnostics" element={<DiagnosticsPage />} />}

            {/* Legacy Route Redirects */}
            <Route path="content-library" element={<Navigate to="/content?tab=media" replace />} />
            <Route path="content-creator" element={<Navigate to="/content?tab=designs" replace />} />
            <Route path="templates" element={<Navigate to="/content?tab=templates" replace />} />
            <Route path="users-and-roles" element={<Navigate to="/users" replace />} />
            <Route
              path="diagnostics"
              element={<Navigate to={isDev ? '/dev/diagnostics' : '/'} replace />}
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
