import { SupabaseClient } from '@supabase/supabase-js';

export type DeuceWaitTimeRow = {
  court_name: string;
  wait_time: string;
  comment: string;
  reported_at: string;
  confirmed_count: number;
  outdated_count: number;
};

type WaitTimeDbRow = {
  court_name: string;
  wait_time: string;
  comment: string;
  created_at: string;
  confirmed_count: number;
  outdated_count: number;
};

/** Latest non-expired wait time per court; never selects device_id. */
export async function fetchLatestWaitTimesPerCourt(
  supabase: SupabaseClient
): Promise<DeuceWaitTimeRow[]> {
  const { data, error } = await supabase
    .from('wait_times')
    .select(
      'court_name, wait_time, comment, created_at, confirmed_count, outdated_count'
    )
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) throw error;

  const latestByCourt = new Map<string, DeuceWaitTimeRow>();
  for (const row of (data ?? []) as WaitTimeDbRow[]) {
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
    a.court_name.localeCompare(b.court_name)
  );
}
