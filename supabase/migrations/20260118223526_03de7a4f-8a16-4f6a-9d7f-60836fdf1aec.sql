-- Add can_edit_background permission to role_permissions table
ALTER TABLE role_permissions 
ADD COLUMN can_edit_background BOOLEAN DEFAULT false;