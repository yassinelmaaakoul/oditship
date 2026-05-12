ALTER TABLE public.invoice_schedules
  ADD COLUMN IF NOT EXISTS schedule_mode text NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS days_of_week int[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS hour int NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS minute int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_invoice_items_order_id ON public.invoice_items(order_id);