ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS extra_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_description text;