-- Add new permission columns to role_permissions table
ALTER TABLE public.role_permissions 
ADD COLUMN IF NOT EXISTS can_create_email BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_change_password BOOLEAN DEFAULT false;

-- Create a unique constraint on custom_role_id if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'role_permissions_custom_role_id_key'
  ) THEN
    ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_custom_role_id_key UNIQUE (custom_role_id);
  END IF;
END $$;