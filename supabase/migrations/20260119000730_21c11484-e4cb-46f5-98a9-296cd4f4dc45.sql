-- Update RLS policies for cash_transactions to include permission checks
DROP POLICY IF EXISTS "Admins can manage cash_transactions" ON public.cash_transactions;
DROP POLICY IF EXISTS "Users with cash permission can view transactions" ON public.cash_transactions;
DROP POLICY IF EXISTS "Users with cash permission can insert transactions" ON public.cash_transactions;
DROP POLICY IF EXISTS "Users with cash permission can manage transactions" ON public.cash_transactions;

-- Create separate policies for different operations
CREATE POLICY "Users with cash permission can view transactions" 
ON public.cash_transactions
FOR SELECT USING (
  public.is_admin(auth.uid()) 
  OR public.has_cash_permission(auth.uid(), 'view')
);

CREATE POLICY "Users with cash permission can insert transactions" 
ON public.cash_transactions
FOR INSERT WITH CHECK (
  public.is_admin(auth.uid()) 
  OR public.has_cash_permission(auth.uid(), 'add_payment')
);

CREATE POLICY "Users with cash permission can update transactions" 
ON public.cash_transactions
FOR UPDATE USING (
  public.is_admin(auth.uid()) 
  OR public.has_cash_permission(auth.uid(), 'manage')
);

CREATE POLICY "Users with cash permission can delete transactions" 
ON public.cash_transactions
FOR DELETE USING (
  public.is_admin(auth.uid()) 
  OR public.has_cash_permission(auth.uid(), 'refund')
);

-- Update RLS policies for cash_settings
DROP POLICY IF EXISTS "Admins can manage cash_settings" ON public.cash_settings;
DROP POLICY IF EXISTS "Users with settings permission can manage cash_settings" ON public.cash_settings;
DROP POLICY IF EXISTS "Users with settings permission can view cash_settings" ON public.cash_settings;
DROP POLICY IF EXISTS "Users with settings permission can update cash_settings" ON public.cash_settings;

CREATE POLICY "Users with settings permission can view cash_settings" 
ON public.cash_settings
FOR SELECT USING (
  public.is_admin(auth.uid()) 
  OR public.has_cash_permission(auth.uid(), 'view')
);

CREATE POLICY "Users with settings permission can update cash_settings" 
ON public.cash_settings
FOR UPDATE USING (
  public.is_admin(auth.uid()) 
  OR public.has_cash_permission(auth.uid(), 'settings')
);