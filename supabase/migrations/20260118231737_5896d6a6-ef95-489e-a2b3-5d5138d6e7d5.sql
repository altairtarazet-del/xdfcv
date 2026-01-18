-- Status enum oluşturma
CREATE TYPE account_status AS ENUM ('acildi', 'background', 'aktif', 'kapandi', 'suspend');

-- email_accounts tablosuna status kolonu ekleme
ALTER TABLE public.email_accounts 
ADD COLUMN status account_status NOT NULL DEFAULT 'acildi';