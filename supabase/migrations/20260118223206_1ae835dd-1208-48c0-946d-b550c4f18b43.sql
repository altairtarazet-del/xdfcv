-- Add name columns to email_accounts table
ALTER TABLE email_accounts 
ADD COLUMN first_name TEXT,
ADD COLUMN middle_name TEXT,
ADD COLUMN last_name TEXT;