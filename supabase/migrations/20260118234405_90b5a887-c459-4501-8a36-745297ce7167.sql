-- Add cash management permissions to role_permissions table
ALTER TABLE public.role_permissions 
ADD COLUMN IF NOT EXISTS can_view_cash boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS can_manage_cash boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS can_add_payment boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS can_process_refund boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS can_edit_cash_settings boolean DEFAULT false;