-- ============================================================
-- DASHER INTELLIGENCE ENGINE
-- State machine, pattern classification, and decision system
-- ============================================================

-- 1. Account States — computed state for each account
CREATE TABLE IF NOT EXISTS account_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_email text NOT NULL UNIQUE,
  current_state text NOT NULL DEFAULT 'UNKNOWN',
  previous_state text,
  state_changed_at timestamptz DEFAULT now(),
  state_confidence numeric DEFAULT 0,
  days_in_state integer DEFAULT 0,
  lifecycle_score integer DEFAULT 0,
  anomaly_flags jsonb DEFAULT '[]'::jsonb,
  email_count integer DEFAULT 0,
  first_email_at timestamptz,
  last_email_at timestamptz,
  last_analyzed_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Account Insights — decisions, predictions, anomalies
CREATE TABLE IF NOT EXISTS account_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_email text NOT NULL,
  insight_type text NOT NULL,
  priority text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  description text NOT NULL,
  suggested_action text,
  is_dismissed boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- 3. Email Classifications — pattern matching results for all emails
CREATE TABLE IF NOT EXISTS email_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_email text NOT NULL,
  account_id text NOT NULL,
  message_id text NOT NULL,
  subject text NOT NULL,
  sender text,
  received_at timestamptz NOT NULL,
  category text NOT NULL,
  sub_category text,
  confidence numeric DEFAULT 1.0,
  extracted_data jsonb DEFAULT '{}'::jsonb,
  pattern_matched text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(account_id, message_id)
);

-- Indexes
CREATE INDEX idx_account_states_state ON account_states(current_state);
CREATE INDEX idx_account_states_score ON account_states(lifecycle_score);
CREATE INDEX idx_account_states_analyzed ON account_states(last_analyzed_at);

CREATE INDEX idx_account_insights_email ON account_insights(account_email);
CREATE INDEX idx_account_insights_priority ON account_insights(priority) WHERE NOT is_dismissed;
CREATE INDEX idx_account_insights_type ON account_insights(insight_type);

CREATE INDEX idx_email_classifications_email ON email_classifications(account_email);
CREATE INDEX idx_email_classifications_category ON email_classifications(category);
CREATE INDEX idx_email_classifications_account_msg ON email_classifications(account_id, message_id);
CREATE INDEX idx_email_classifications_received ON email_classifications(received_at);

-- RLS
ALTER TABLE account_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_classifications ENABLE ROW LEVEL SECURITY;

-- Policies: BGC-permitted users can read, service role can write
CREATE POLICY "BGC users can view account states"
  ON account_states FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'admin'
        OR EXISTS (
          SELECT 1 FROM role_permissions rp
          WHERE rp.custom_role_id = ur.custom_role_id
          AND rp.can_view_bgc_complete = true
        )
      )
    )
  );

CREATE POLICY "Service role can manage account states"
  ON account_states FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "BGC users can view account insights"
  ON account_insights FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'admin'
        OR EXISTS (
          SELECT 1 FROM role_permissions rp
          WHERE rp.custom_role_id = ur.custom_role_id
          AND rp.can_view_bgc_complete = true
        )
      )
    )
  );

CREATE POLICY "BGC users can dismiss insights"
  ON account_insights FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'admin'
        OR EXISTS (
          SELECT 1 FROM role_permissions rp
          WHERE rp.custom_role_id = ur.custom_role_id
          AND rp.can_view_bgc_complete = true
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'admin'
        OR EXISTS (
          SELECT 1 FROM role_permissions rp
          WHERE rp.custom_role_id = ur.custom_role_id
          AND rp.can_view_bgc_complete = true
        )
      )
    )
  );

CREATE POLICY "Service role can manage account insights"
  ON account_insights FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "BGC users can view email classifications"
  ON email_classifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND (
        ur.role = 'admin'
        OR EXISTS (
          SELECT 1 FROM role_permissions rp
          WHERE rp.custom_role_id = ur.custom_role_id
          AND rp.can_view_bgc_complete = true
        )
      )
    )
  );

CREATE POLICY "Service role can manage email classifications"
  ON email_classifications FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
