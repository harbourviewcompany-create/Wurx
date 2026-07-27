
-- ============================================================
-- Wurx Ottawa — initial schema
-- Migrated from Harbourview Marketplace DB (zvxdgdkukjrrwamdpqrg)
-- Table: wurx_ottawa_leads
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wurx_ottawa_leads (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  email       text        NOT NULL,
  phone       text,
  message     text,
  source      text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.wurx_ottawa_leads ENABLE ROW LEVEL SECURITY;

-- Anon may INSERT (public intake form)
CREATE POLICY "allow_anon_insert"
  ON public.wurx_ottawa_leads
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- No public reads
CREATE POLICY "no_public_read"
  ON public.wurx_ottawa_leads
  FOR SELECT
  USING (false);

-- service_role full access
GRANT ALL ON public.wurx_ottawa_leads TO service_role;
GRANT INSERT ON public.wurx_ottawa_leads TO anon;
