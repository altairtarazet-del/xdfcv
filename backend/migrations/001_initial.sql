-- 1. Accounts
CREATE TABLE IF NOT EXISTS accounts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    smtp_account_id  TEXT NOT NULL UNIQUE,
    email            TEXT NOT NULL UNIQUE,
    stage            TEXT NOT NULL DEFAULT 'REGISTERED'
                     CHECK (stage IN ('REGISTERED','IDENTITY_VERIFIED','BGC_PENDING',
                                      'BGC_CLEAR','BGC_CONSIDER','ACTIVE','DEACTIVATED')),
    stage_updated_at TIMESTAMPTZ,
    last_scanned_at  TIMESTAMPTZ,
    scan_error       TEXT,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Stage history (audit trail)
CREATE TABLE IF NOT EXISTS stage_history (
    id                    BIGSERIAL PRIMARY KEY,
    account_id            UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    old_stage             TEXT,
    new_stage             TEXT NOT NULL,
    trigger_email_subject TEXT,
    trigger_email_date    TIMESTAMPTZ,
    changed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Scan logs
CREATE TABLE IF NOT EXISTS scan_logs (
    id             BIGSERIAL PRIMARY KEY,
    started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at    TIMESTAMPTZ,
    total_accounts INTEGER NOT NULL DEFAULT 0,
    scanned        INTEGER NOT NULL DEFAULT 0,
    errors         INTEGER NOT NULL DEFAULT 0,
    transitions    INTEGER NOT NULL DEFAULT 0,
    status         TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
    error_details  JSONB
);

-- 4. Portal users
CREATE TABLE IF NOT EXISTS portal_users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name  TEXT,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Admin users
CREATE TABLE IF NOT EXISTS admin_users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_accounts_stage ON accounts(stage);
CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
CREATE INDEX IF NOT EXISTS idx_stage_history_account ON stage_history(account_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_status ON scan_logs(status);
