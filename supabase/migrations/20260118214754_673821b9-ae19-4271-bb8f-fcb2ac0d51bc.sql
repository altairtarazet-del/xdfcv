-- Add allowed_subjects column to role_permissions table
ALTER TABLE role_permissions 
ADD COLUMN allowed_subjects TEXT[] DEFAULT NULL;

COMMENT ON COLUMN role_permissions.allowed_subjects IS 
'Only shows emails with specified subject patterns. Supports wildcards: *code*, Checkr:*';