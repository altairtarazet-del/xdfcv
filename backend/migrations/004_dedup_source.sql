-- Add dedup analysis source values for template deduplication
ALTER TABLE email_analyses DROP CONSTRAINT IF EXISTS email_analyses_analysis_source_check;
ALTER TABLE email_analyses ADD CONSTRAINT email_analyses_analysis_source_check
    CHECK (analysis_source IN ('rules', 'ai', 'manual', 'rules_dedup', 'ai_dedup'));
