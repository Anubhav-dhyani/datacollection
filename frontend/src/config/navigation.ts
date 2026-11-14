import { BarChart3, Database, FileText, LayoutDashboard, Users, type LucideIcon } from 'lucide-react';
import type { Role } from '../domain/types';

export interface NavItem { label: string; path: string; icon: LucideIcon }
export interface NavGroup { title: string; items: NavItem[] }

export const navByRole: Record<Role, NavGroup[]> = {
  MAIN_ADMIN: [{ title: 'Overview', items: [
    { label: 'Dashboard', path: '/admin', icon: LayoutDashboard },
    { label: 'Daily Reports', path: '/admin/daily-reports', icon: BarChart3 },
    { label: 'Report Team', path: '/admin/report-team', icon: Users },
  ] }, { title: 'Administration', items: [
    { label: 'Database', path: '/admin/database', icon: Database },
  ] }],
  SUB_ADMIN: [{ title: 'Work', items: [
    { label: 'Dashboard', path: '/sub-admin', icon: LayoutDashboard },
    { label: 'Daily Reports', path: '/sub-admin/daily-reports', icon: BarChart3 },
    { label: 'My Employees', path: '/sub-admin/report-team', icon: Users },
  ] }],
  EMPLOYEE: [
    { title: 'Work', items: [
      { label: 'Dashboard', path: '/app', icon: LayoutDashboard },
      { label: 'Submit Report', path: '/app/daily-reports', icon: BarChart3 },
    ] },
    { title: 'Reports', items: [
      { label: 'My Reports', path: '/app/my-reports', icon: FileText },
    ] },
  ],
};
