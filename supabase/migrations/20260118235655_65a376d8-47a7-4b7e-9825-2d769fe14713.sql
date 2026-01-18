-- Kasa izinlerini kontrol eden fonksiyon
CREATE OR REPLACE FUNCTION public.has_cash_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
        ELSE false
      END
    )
  )
$$;

-- cash_transactions için mevcut ALL politikasını güncelle
DROP POLICY IF EXISTS "Admins can manage cash_transactions" ON public.cash_transactions;

CREATE POLICY "Users with cash permission can manage transactions" 
ON public.cash_transactions
FOR ALL USING (
  is_admin(auth.uid()) 
  OR has_cash_permission(auth.uid(), 'add_payment')
  OR has_cash_permission(auth.uid(), 'refund')
);

-- cash_settings için mevcut ALL politikasını güncelle
DROP POLICY IF EXISTS "Admins can manage cash_settings" ON public.cash_settings;

CREATE POLICY "Users with settings permission can manage cash_settings" 
ON public.cash_settings
FOR ALL USING (
  is_admin(auth.uid()) 
  OR has_cash_permission(auth.uid(), 'settings')
);