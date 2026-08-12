-- Read-only integration API for third-party wait time consumers.
-- Exposes only: court_name, wait_time, comment, reported_at, confirmed_count, outdated_count.
-- Never exposes: device_id, id, expires_at, or other columns.
--
-- Run once in Supabase → SQL Editor (after wait_times exists).

-- Latest non-expired report per court (SECURITY DEFINER so callers cannot read base table).
CREATE OR REPLACE FUNCTION public.get_latest_wait_times_per_court()
RETURNS TABLE (
  court_name text,
  wait_time text,
  comment text,
  reported_at timestamptz,
  confirmed_count integer,
  outdated_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (w.court_name)
    w.court_name,
    w.wait_time,
    w.comment,
    w.created_at AS reported_at,
    w.confirmed_count,
    w.outdated_count
  FROM public.wait_times w
  WHERE w.expires_at > now()
  ORDER BY w.court_name, w.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_latest_wait_times_per_court() IS
  'Integration API: latest active wait time per court. No device_id or PII.';

-- Only the service role (Edge Functions) may call this RPC directly.
REVOKE ALL ON FUNCTION public.get_latest_wait_times_per_court() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_latest_wait_times_per_court() FROM anon;
REVOKE ALL ON FUNCTION public.get_latest_wait_times_per_court() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_wait_times_per_court() TO service_role;

-- Optional read-only view for SQL Editor / internal checks (same columns as the function).
CREATE OR REPLACE VIEW public.wait_times_integration
WITH (security_barrier = true) AS
SELECT
  w.court_name,
  w.wait_time,
  w.comment,
  w.created_at AS reported_at,
  w.confirmed_count,
  w.outdated_count
FROM public.wait_times w
WHERE w.expires_at > now();

COMMENT ON VIEW public.wait_times_integration IS
  'Read-only integration columns. Do not grant SELECT to anon/authenticated.';

REVOKE ALL ON public.wait_times_integration FROM PUBLIC;
REVOKE ALL ON public.wait_times_integration FROM anon;
REVOKE ALL ON public.wait_times_integration FROM authenticated;
GRANT SELECT ON public.wait_times_integration TO service_role;
