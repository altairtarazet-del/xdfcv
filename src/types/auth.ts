export type AppRole = 'admin' | 'moderator' | 'user';

export interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomRole {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  custom_role_id: string | null;
}

export interface RolePermission {
  id: string;
  custom_role_id: string;
  time_filter_minutes: number | null;
  allowed_mailboxes: string[] | null;
  allowed_senders: string[] | null;
  allowed_receivers: string[] | null;
  allowed_subjects: string[] | null;
  realtime_enabled: boolean;
  can_create_email: boolean;
  can_change_password: boolean;
  can_delete_account: boolean;
  can_delete_emails: boolean;
  can_edit_background: boolean;
  // Cash permissions
  can_view_cash: boolean;
  can_manage_cash: boolean;
  can_add_payment: boolean;
  can_process_refund: boolean;
  can_edit_cash_settings: boolean;
  can_edit_transactions: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserWithRole extends UserProfile {
  role?: AppRole;
  custom_role?: CustomRole | null;
  permissions?: RolePermission | null;
}
