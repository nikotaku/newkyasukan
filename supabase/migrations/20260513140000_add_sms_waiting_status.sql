-- Allow sms_waiting as a reservation status
ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_status_check;

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_status_check
  CHECK (status IN ('pending', 'sms_waiting', 'confirmed', 'completed', 'cancelled'));

notify pgrst, 'reload schema';
