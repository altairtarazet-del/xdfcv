-- Create email_accounts table to store email and DOB information
CREATE TABLE public.email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  date_of_birth DATE NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view all email accounts
CREATE POLICY "Authenticated users can view email_accounts"
ON public.email_accounts FOR SELECT
TO authenticated USING (true);

-- Authenticated users can insert email accounts
CREATE POLICY "Authenticated users can insert email_accounts"
ON public.email_accounts FOR INSERT
TO authenticated WITH CHECK (auth.uid() = created_by);

-- Admins can delete email accounts
CREATE POLICY "Admins can delete email_accounts"
ON public.email_accounts FOR DELETE
TO authenticated USING (public.is_admin(auth.uid()));