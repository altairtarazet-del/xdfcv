-- Add portal access columns to email_accounts
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS smtp_account_id TEXT;
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS portal_password TEXT;
