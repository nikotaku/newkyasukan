ALTER TABLE option_rates ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true;
