import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { fetchLatestWaitTimesPerCourt } from '@/lib/deuceWaitTimes';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const expectedKey = process.env.INTEGRATION_API_KEY;
  const providedKey = request.headers.get('x-api-key');

  if (!expectedKey || providedKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const data = await fetchLatestWaitTimesPerCourt(supabase);
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Query failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
