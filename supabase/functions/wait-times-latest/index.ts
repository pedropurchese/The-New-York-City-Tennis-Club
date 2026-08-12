import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, x-api-key, content-type',
};

type WaitTimeRow = {
  court_name: string;
  wait_time: string;
  comment: string;
  created_at: string;
  confirmed_count: number;
  outdated_count: number;
};

async function fetchLatestWaitTimesPerCourt(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from('wait_times')
    .select(
      'court_name, wait_time, comment, created_at, confirmed_count, outdated_count'
    )
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) throw error;

  const latestByCourt = new Map<string, Record<string, unknown>>();
  for (const row of (data ?? []) as WaitTimeRow[]) {
    if (!latestByCourt.has(row.court_name)) {
      latestByCourt.set(row.court_name, {
        court_name: row.court_name,
        wait_time: row.wait_time,
        comment: row.comment ?? '',
        reported_at: row.created_at,
        confirmed_count: row.confirmed_count ?? 0,
        outdated_count: row.outdated_count ?? 0,
      });
    }
  }

  return Array.from(latestByCourt.values()).sort((a, b) =>
    String(a.court_name).localeCompare(String(b.court_name))
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const expectedKey = Deno.env.get('INTEGRATION_API_KEY');
  const providedKey = req.headers.get('x-api-key');

  if (!expectedKey || providedKey !== expectedKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const data = await fetchLatestWaitTimesPerCourt(supabase);
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Query failed';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
