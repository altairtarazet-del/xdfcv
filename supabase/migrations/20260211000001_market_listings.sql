-- Market Listings table for Portal Market
CREATE TABLE IF NOT EXISTS market_listings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  account_type TEXT NOT NULL DEFAULT 'DoorDash Dasher',
  bgc_status TEXT NOT NULL DEFAULT 'pending',
  price INTEGER NOT NULL,
  contact_info JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE market_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read available" ON market_listings FOR SELECT USING (status IN ('available','reserved'));
CREATE POLICY "Service role full" ON market_listings FOR ALL USING (true) WITH CHECK (true);
