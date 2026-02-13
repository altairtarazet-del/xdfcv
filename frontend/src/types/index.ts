// Shared type definitions — deduplicated from multiple files

// === Email Types (used by EmailPanel, Inbox, AllEmails, CustomerEmails) ===

export interface Mailbox {
  id: string;
  name: string;
  unread?: number;
}

export interface Message {
  id: string;
  from?: string;
  sender?: string;
  subject: string;
  date?: string;
  created_at?: string;
  seen?: boolean;
}

export interface Attachment {
  id: string;
  filename: string;
  contentType?: string;
  size?: number;
}

export interface FullMessage extends Message {
  html?: string;
  text?: string;
  to?: string;
  attachments?: Attachment[];
}

// === Account Types (used by Dashboard, AccountDetail, AllEmails) ===

export interface Account {
  id: string;
  email: string;
  stage: string;
  stage_updated_at: string | null;
  last_scanned_at: string | null;
  scan_error: string | null;
  notes: string | null;
  customer_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  created_at?: string;
  status: string;
  tags: string[];
  assigned_admin_id?: string | null;
}

export interface HistoryEntry {
  id: number;
  old_stage: string | null;
  new_stage: string;
  trigger_email_subject: string | null;
  trigger_email_date: string | null;
  changed_at: string;
}

// === Admin Types (used by AccountDetail, TeamManagement) ===

export interface Admin {
  id: string;
  username: string;
  display_name: string | null;
  role?: string;
  is_active?: boolean;
  last_login_at?: string | null;
  created_at?: string;
}

// === Dashboard Types ===

export interface StageInfo {
  label: string;
  color: string;
}

export interface Stats {
  stage_counts: Record<string, number>;
  total_accounts: number;
  unread_alerts: number;
  last_scan: {
    id: number;
    status: string;
    started_at: string;
    finished_at: string | null;
    scanned: number;
    errors: number;
    transitions: number;
  } | null;
}

export interface Alert {
  id: number;
  alert_type: string;
  severity: string;
  title: string;
  message: string | null;
  is_read: boolean;
  created_at: string;
}

// === Analysis Types (used by AccountDetail) ===

export interface Analysis {
  id: number;
  message_id: string;
  category: string;
  sub_category: string;
  confidence: number;
  analysis_source: string;
  summary: string;
  urgency: string;
  action_required: boolean;
  created_at: string;
}

// === Portal User Types (used by PortalUsers) ===

export interface PortalUser {
  id: string;
  email: string;
  display_name: string | null;
  account_id: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
}

export interface ExtractNamesResult {
  processed: number;
  updated: number;
  failed: number;
}

export interface ProvisionResult {
  credentials: {
    email: string;
    portal_password: string;
  };
}

// === Analytics Types ===

export interface AnalyticsData {
  accounts_by_stage: Record<string, number>;
  analysis_by_category: Record<string, number>;
  scans: { total: number; successful: number; failed: number; avg_duration: number };
  alerts: { total: number; unread: number; by_type: Record<string, number> };
  portal: { total_users: number; active_users: number; logins_30d: number };
}

// === Stage Constants ===

export const STAGE_MAP: Record<string, StageInfo> = {
  REGISTERED: { label: "Registered", color: "bg-dd-100 text-dd-800" },
  IDENTITY_VERIFIED: { label: "ID Verified", color: "bg-[#E0F0FF] text-[#004A99]" },
  BGC_PENDING: { label: "BGC Pending", color: "bg-[#FFF3D6] text-[#8A6100]" },
  BGC_CLEAR: { label: "BGC Clear", color: "bg-[#E5F9EB] text-[#004C1B]" },
  BGC_CONSIDER: { label: "BGC Consider", color: "bg-dd-red-lighter text-dd-red-active" },
  ACTIVE: { label: "Active", color: "bg-[#E5F9EB] text-[#004C1B]" },
  DEACTIVATED: { label: "Deactivated", color: "bg-dd-red-lighter text-dd-red-active" },
};

export const STAGES = Object.keys(STAGE_MAP);

export const STAGE_COLORS: Record<string, { active: string; bar: string }> = {
  REGISTERED: { active: "bg-dd-400", bar: "bg-dd-300" },
  IDENTITY_VERIFIED: { active: "bg-blue-500", bar: "bg-blue-400" },
  BGC_PENDING: { active: "bg-yellow-500", bar: "bg-yellow-400" },
  BGC_CLEAR: { active: "bg-emerald-500", bar: "bg-emerald-400" },
  BGC_CONSIDER: { active: "bg-orange-500", bar: "bg-orange-400" },
  ACTIVE: { active: "bg-dd-red", bar: "bg-dd-red" },
  DEACTIVATED: { active: "bg-red-600", bar: "bg-red-500" },
};

export const STAGE_BADGE: Record<string, string> = {
  REGISTERED: "bg-dd-200 text-dd-800",
  IDENTITY_VERIFIED: "bg-blue-100 text-blue-700",
  BGC_PENDING: "bg-yellow-100 text-yellow-700",
  BGC_CLEAR: "bg-emerald-100 text-emerald-700",
  BGC_CONSIDER: "bg-orange-100 text-orange-700",
  ACTIVE: "bg-dd-red-lighter text-dd-red",
  DEACTIVATED: "bg-red-100 text-red-700",
};

export const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  suspended: "bg-yellow-100 text-yellow-700",
  archived: "bg-dd-200 text-dd-700",
};

export const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-dd-red-lighter text-dd-red-active",
  admin: "bg-blue-100 text-blue-700",
  viewer: "bg-dd-200 text-dd-700",
};
