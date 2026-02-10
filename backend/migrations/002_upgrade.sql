-- 002_upgrade.sql — DasherHelp v2 Schema Evolution
-- All changes are additive (ALTER ADD, CREATE TABLE) for zero-downtime migration.

-- 1. Extend accounts table
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::JSONB;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','suspended','archived'));
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS assigned_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL;

-- 2. Extend admin_users table
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin'
    CHECK (role IN ('super_admin','admin','viewer'));
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- 3. Extend portal_users table
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- 4. Audit logs — tracks all critical admin actions
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    admin_username TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Email analyses — cache for email analysis results
CREATE TABLE IF NOT EXISTS email_analyses (
    id BIGSERIAL PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL,
    category TEXT NOT NULL,
    sub_category TEXT,
    confidence REAL NOT NULL DEFAULT 1.0,
    analysis_source TEXT NOT NULL DEFAULT 'rules'
        CHECK (analysis_source IN ('rules','ai','manual')),
    summary TEXT,
    urgency TEXT DEFAULT 'low'
        CHECK (urgency IN ('critical','high','medium','low','info')),
    action_required BOOLEAN DEFAULT FALSE,
    key_details JSONB,
    raw_ai_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(account_id, message_id)
);

-- 6. Alerts — stage transitions, deactivation, anomaly warnings
CREATE TABLE IF NOT EXISTS alerts (
    id BIGSERIAL PRIMARY KEY,
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL
        CHECK (alert_type IN ('stage_change','deactivation','contract_violation',
                              'low_rating','anomaly','system')),
    severity TEXT NOT NULL DEFAULT 'info'
        CHECK (severity IN ('critical','warning','info')),
    title TEXT NOT NULL,
    message TEXT,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    user_type TEXT NOT NULL CHECK (user_type IN ('admin','portal')),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin ON audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_analyses_account ON email_analyses(account_id);
CREATE INDEX IF NOT EXISTS idx_email_analyses_category ON email_analyses(category);
CREATE INDEX IF NOT EXISTS idx_alerts_account ON alerts(account_id);
CREATE INDEX IF NOT EXISTS idx_alerts_unread ON alerts(is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id, user_type);
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);
CREATE INDEX IF NOT EXISTS idx_accounts_assigned ON accounts(assigned_admin_id);
