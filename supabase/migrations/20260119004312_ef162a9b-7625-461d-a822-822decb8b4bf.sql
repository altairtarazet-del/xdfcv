-- Fix security issues: Remove overly permissive RLS policies

-- 1. Drop the overly permissive policy on email_accounts that allows all authenticated users to view
DROP POLICY IF EXISTS "Authenticated users can view email_accounts" ON public.email_accounts;

-- 2. Drop the overly permissive policy on cash_transactions that allows all authenticated users to view
DROP POLICY IF EXISTS "Authenticated users can view cash_transactions" ON public.cash_transactions;

-- 3. Drop the overly permissive policy on cash_settings that allows all authenticated users to view
DROP POLICY IF EXISTS "Authenticated users can view cash_settings" ON public.cash_settings;

-- 4. Create a proper permission-based policy for email_accounts SELECT
-- Only admins and users with appropriate email-related permissions can view email accounts
CREATE POLICY "Users with permission can view email_accounts"
ON public.email_accounts
FOR SELECT
USING (
  is_admin(auth.uid()) 
  OR (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN role_permissions rp ON ur.custom_role_id = rp.custom_role_id
      WHERE ur.user_id = auth.uid()
      AND (
        rp.can_create_email = true 
        OR rp.can_edit_background = true 
        OR rp.can_delete_account = true
        OR rp.can_change_password = true
      )
    )
  )
);

-- The cash_transactions and cash_settings tables already have proper permission-based policies:
-- "Users with cash permission can view transactions" on cash_transactions
-- "Users with settings permission can view cash_settings" on cash_settings
-- So we just needed to remove the overly permissive ones