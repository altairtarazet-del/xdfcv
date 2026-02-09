-- Add exclusion columns to bgc_scan_status
ALTER TABLE bgc_scan_status
  ADD COLUMN IF NOT EXISTS is_excluded boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS excluded_at timestamptz,
  ADD COLUMN IF NOT EXISTS excluded_reason text;

CREATE INDEX IF NOT EXISTS idx_bgc_scan_excluded ON bgc_scan_status(is_excluded);
