import { Navigate, Route, Routes } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import AppLayout from './layouts/AppLayout';
import DashboardPage from './pages/shared/DashboardPage';
import DailyReportsPage from './pages/shared/DailyReportsPage';
import ReportTeamPage from './pages/shared/ReportTeamPage';
import DatabasePage from './pages/admin/DatabasePage';

export default function App() {
  return <Routes>
    <Route path="/" element={<Navigate to="/login" replace />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/change-password" element={<ChangePasswordPage />} />
    <Route path="/admin" element={<AppLayout role="MAIN_ADMIN" />}>
      <Route index element={<DashboardPage />} />
      <Route path="daily-reports" element={<DailyReportsPage />} />
      <Route path="report-team" element={<ReportTeamPage />} />
      <Route path="database" element={<DatabasePage />} />
    </Route>
    <Route path="/sub-admin" element={<AppLayout role="SUB_ADMIN" />}>
      <Route index element={<DashboardPage />} />
      <Route path="daily-reports" element={<DailyReportsPage />} />
      <Route path="report-team" element={<ReportTeamPage />} />
    </Route>
    <Route path="/app" element={<AppLayout role="EMPLOYEE" />}>
      <Route index element={<DashboardPage />} />
      <Route path="daily-reports" element={<DailyReportsPage mode="submit" />} />
      <Route path="my-reports" element={<DailyReportsPage mode="mine" />} />
    </Route>
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes>;
}
