-- Add email_type column to bgc_complete_emails
ALTER TABLE public.bgc_complete_emails 
ADD COLUMN email_type text NOT NULL DEFAULT 'bgc_complete';

-- Create index for faster filtering by email_type
CREATE INDEX idx_bgc_emails_type ON public.bgc_complete_emails(email_type);

-- Create index for faster lookup by account_email
CREATE INDEX idx_bgc_emails_account_email ON public.bgc_complete_emails(account_email);