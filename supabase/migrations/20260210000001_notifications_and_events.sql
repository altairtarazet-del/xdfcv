-- ============================================
-- BGC Complete System: Notifications, Events, Risk Scores
-- ============================================

-- 1. Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('new_bgc_complete', 'new_deactivation', 'stale_account', 'missing_package', 'scan_complete')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can read and update their own notifications
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role can insert notifications for any user
CREATE POLICY "Service role can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX idx_notifications_created ON public.notifications(created_at DESC);

-- 2. Account Events table
CREATE TABLE IF NOT EXISTS public.account_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_email TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('account_created', 'bgc_complete', 'deactivated', 'first_package')),
  event_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  source_email_id UUID REFERENCES public.bgc_complete_emails(id) ON DELETE SET NULL
);

ALTER TABLE public.account_events ENABLE ROW LEVEL SECURITY;

-- BGC permission holders can view events
CREATE POLICY "BGC users can view account events"
  ON public.account_events FOR SELECT
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.custom_role_id = ur.custom_role_id
      WHERE ur.user_id = auth.uid() AND rp.can_view_bgc_complete = true
    )
  );

CREATE POLICY "Service role can insert account events"
  ON public.account_events FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_account_events_email ON public.account_events(account_email);
CREATE INDEX idx_account_events_date ON public.account_events(event_date DESC);

-- 3. BGC Risk Scores table
CREATE TABLE IF NOT EXISTS public.bgc_risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_email TEXT NOT NULL UNIQUE,
  risk_score INTEGER NOT NULL DEFAULT 0,
  risk_factors JSONB DEFAULT '[]'::jsonb,
  last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bgc_risk_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "BGC users can view risk scores"
  ON public.bgc_risk_scores FOR SELECT
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.custom_role_id = ur.custom_role_id
      WHERE ur.user_id = auth.uid() AND rp.can_view_bgc_complete = true
    )
  );

CREATE POLICY "Service role can manage risk scores"
  ON public.bgc_risk_scores FOR ALL
  USING (true)
  WITH CHECK (true);

-- 4. Add new columns to bgc_complete_emails
ALTER TABLE public.bgc_complete_emails
  ADD COLUMN IF NOT EXISTS ai_classified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_confidence REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extracted_data JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS email_body_fetched BOOLEAN DEFAULT false;

-- 5. Backfill account_events from existing bgc_complete_emails
INSERT INTO public.account_events (account_email, event_type, event_date, source_email_id)
SELECT DISTINCT ON (account_email, email_type)
  account_email,
  CASE email_type
    WHEN 'bgc_complete' THEN 'bgc_complete'
    WHEN 'deactivated' THEN 'deactivated'
    WHEN 'first_package' THEN 'first_package'
  END,
  email_date::timestamptz,
  id
FROM public.bgc_complete_emails
ORDER BY account_email, email_type, email_date DESC
ON CONFLICT DO NOTHING;
