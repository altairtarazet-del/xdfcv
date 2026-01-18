-- Add new permission columns for delete operations
ALTER TABLE public.role_permissions 
ADD COLUMN IF NOT EXISTS can_delete_account boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS can_delete_emails boolean DEFAULT false;