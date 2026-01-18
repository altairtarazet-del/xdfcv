-- Add UPDATE policy for email_accounts table
-- Allow admins to update any email account
CREATE POLICY "Admins can update email_accounts"
ON public.email_accounts
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Allow users with can_edit_background permission to update email accounts
CREATE POLICY "Users with permission can update email_accounts"
ON public.email_accounts
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.custom_role_id = rp.custom_role_id
    WHERE ur.user_id = auth.uid() AND rp.can_edit_background = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.custom_role_id = rp.custom_role_id
    WHERE ur.user_id = auth.uid() AND rp.can_edit_background = true
  )
);