-- Add discount_ids column to reservations for tracking applied discounts
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS discount_ids text[] DEFAULT '{}';
