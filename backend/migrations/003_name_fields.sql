-- 003_name_fields.sql — Add structured name fields and DOB to accounts
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS middle_name TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS date_of_birth DATE;
