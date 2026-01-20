-- Add BGC Complete permission column
ALTER TABLE public.role_permissions 
ADD COLUMN IF NOT EXISTS can_view_bgc_complete boolean DEFAULT false;