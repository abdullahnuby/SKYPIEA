-- BENO rebrand migration for deployments that already applied the previous MIYAR alpha schema.
-- Run as database owner before deploying the BENO API. Safe to run more than once.
DO $$
BEGIN
  IF to_regclass('public.miyar_rate_limits') IS NOT NULL
     AND to_regclass('public.beno_rate_limits') IS NULL THEN
    ALTER TABLE public.miyar_rate_limits RENAME TO beno_rate_limits;
  END IF;
END $$;

-- Recreate the RPC under the BENO name and with the renamed table reference.
DROP FUNCTION IF EXISTS public.miyar_consume_rate_limit(text,text,integer,integer);
CREATE OR REPLACE FUNCTION public.beno_consume_rate_limit(
  p_key text,
  p_scope text,
  p_limit integer,
  p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_hits integer;
BEGIN
  IF p_key IS NULL OR length(p_key) <> 64 OR p_scope NOT IN ('tool','lead')
     OR p_limit < 1 OR p_window_seconds < 1 OR p_window_seconds > 3600 THEN
    RAISE EXCEPTION 'invalid rate limit arguments';
  END IF;
  INSERT INTO public.beno_rate_limits(bucket_key, scope, window_start, hits)
  VALUES (p_key, p_scope, now(), 1)
  ON CONFLICT (bucket_key, scope) DO UPDATE
    SET window_start = CASE
          WHEN public.beno_rate_limits.window_start <= now() - make_interval(secs => p_window_seconds) THEN now()
          ELSE public.beno_rate_limits.window_start END,
        hits = CASE
          WHEN public.beno_rate_limits.window_start <= now() - make_interval(secs => p_window_seconds) THEN 1
          ELSE public.beno_rate_limits.hits + 1 END
  RETURNING hits INTO v_hits;
  RETURN v_hits <= p_limit;
END;
$$;
ALTER TABLE public.beno_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.beno_rate_limits FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.beno_rate_limits TO service_role;
GRANT EXECUTE ON FUNCTION public.beno_consume_rate_limit(text,text,integer,integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.beno_consume_rate_limit(text,text,integer,integer) FROM public, anon, authenticated;
COMMENT ON TABLE public.beno_rate_limits IS 'Distributed IP/session throttling buckets keyed by SHA-256.';
