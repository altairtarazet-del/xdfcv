-- Kasa işlemleri tablosu
CREATE TABLE public.cash_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_account_id UUID REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('payment', 'refund')),
  payment_stage TEXT NOT NULL CHECK (payment_stage IN ('first_payment', 'second_payment')),
  amount DECIMAL(10,2) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

-- Kasa ayarları tablosu (varsayılan tutarlar)
CREATE TABLE public.cash_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_payment_default DECIMAL(10,2) NOT NULL DEFAULT 400,
  second_payment_default DECIMAL(10,2) NOT NULL DEFAULT 400,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

-- Varsayılan ayarları ekle
INSERT INTO public.cash_settings (first_payment_default, second_payment_default)
VALUES (400, 400);

-- RLS politikaları
ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_settings ENABLE ROW LEVEL SECURITY;

-- Cash transactions policies
CREATE POLICY "Admins can manage cash_transactions" ON public.cash_transactions
  FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated users can view cash_transactions" ON public.cash_transactions
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Cash settings policies
CREATE POLICY "Admins can manage cash_settings" ON public.cash_settings
  FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated users can view cash_settings" ON public.cash_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);