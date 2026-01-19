-- Add can_edit_transactions permission to role_permissions table
ALTER TABLE public.role_permissions 
ADD COLUMN IF NOT EXISTS can_edit_transactions boolean DEFAULT false;

-- Update RLS policy to allow users with edit permission to update transactions
DROP POLICY IF EXISTS "Users with cash permission can update transactions" ON public.cash_transactions;

CREATE POLICY "Users with cash permission can update transactions" 
ON public.cash_transactions
FOR UPDATE USING (
  is_admin(auth.uid()) 
  OR has_cash_permission(auth.uid(), 'manage')
  OR has_cash_permission(auth.uid(), 'edit_transactions')
);

-- Update the has_cash_permission function to include new permission
CREATE OR REPLACE FUNCTION public.has_cash_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.custom_role_id = rp.custom_role_id
    WHERE ur.user_id = _user_id
    AND (
      CASE _permission
        WHEN 'view' THEN COALESCE(rp.can_view_cash, false) OR COALESCE(rp.can_manage_cash, false)
        WHEN 'add_payment' THEN COALESCE(rp.can_add_payment, false) OR COALESCE(rp.can_manage_cash, false)
        WHEN 'refund' THEN COALESCE(rp.can_process_refund, false) OR COALESCE(rp.can_manage_cash, false)
        WHEN 'settings' THEN COALESCE(rp.can_edit_cash_settings, false) OR COALESCE(rp.can_manage_cash, false)
        WHEN 'manage' THEN COALESCE(rp.can_manage_cash, false)
        WHEN 'edit_transactions' THEN COALESCE(rp.can_edit_transactions, false) OR COALESCE(rp.can_manage_cash, false)
        ELSE false
      END
    )
  )
$$;