-- Table to store found BGC emails permanently
CREATE TABLE public.bgc_complete_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text NOT NULL,
  account_email text NOT NULL,
  mailbox_id text NOT NULL,
  mailbox_path text NOT NULL,
  message_id text NOT NULL,
  subject text NOT NULL,
  from_address text,
  from_name text,
  email_date timestamptz NOT NULL,
  scanned_at timestamptz DEFAULT now(),
  scanned_by uuid,
  
  -- Duplicate prevention
  UNIQUE(account_id, mailbox_id, message_id)
);

-- Table to track last scan time per account
CREATE TABLE public.bgc_scan_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text NOT NULL UNIQUE,
  account_email text NOT NULL,
  last_scanned_at timestamptz NOT NULL,
  last_message_date timestamptz,
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bgc_complete_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bgc_scan_status ENABLE ROW LEVEL SECURITY;

-- BGC emails policies
CREATE POLICY "Users with BGC permission can view emails"
  ON public.bgc_complete_emails FOR SELECT
  USING (
    is_admin(auth.uid()) OR 
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN role_permissions rp ON ur.custom_role_id = rp.custom_role_id
      WHERE ur.user_id = auth.uid() AND rp.can_view_bgc_complete = true
    )
  );

CREATE POLICY "Service role can insert emails"
  ON public.bgc_complete_emails FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can delete emails"
  ON public.bgc_complete_emails FOR DELETE
  USING (is_admin(auth.uid()));

-- Scan status policies
CREATE POLICY "Users with BGC permission can view scan status"
  ON public.bgc_scan_status FOR SELECT
  USING (
    is_admin(auth.uid()) OR 
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN role_permissions rp ON ur.custom_role_id = rp.custom_role_id
      WHERE ur.user_id = auth.uid() AND rp.can_view_bgc_complete = true
    )
  );

CREATE POLICY "Service role can manage scan status"
  ON public.bgc_scan_status FOR ALL
  USING (true);

-- Indexes for performance
CREATE INDEX idx_bgc_emails_date ON public.bgc_complete_emails(email_date DESC);
CREATE INDEX idx_bgc_emails_account ON public.bgc_complete_emails(account_id);
CREATE INDEX idx_bgc_scan_status_account ON public.bgc_scan_status(account_id);