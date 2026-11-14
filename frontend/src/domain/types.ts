export type Role = 'MAIN_ADMIN' | 'SUB_ADMIN' | 'EMPLOYEE';

export interface User {
  id: string;
  name: string;
  email: string;
  employeeId: string;
  role: Role;
  reportSubAdminId?: string | null;
  status?: 'ACTIVE' | 'DISABLED';
  passwordChangeRequired?: boolean;
  lastLoginAt?: string;
}
