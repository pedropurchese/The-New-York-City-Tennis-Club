import { SupabaseClient } from '@supabase/supabase-js';

/** Distinguishes Deuce integration writes from SmartCourtNYC browser reports. */
export const DEUCE_INTEGRATION_DEVICE_ID = 'deuce-integration';

export const DEUCE_WAIT_TIME_COURTS = [
  'Hudson River Park Courts',
  'Pier 42',
  'Brian Watkins Tennis Courts',
  'South Oxford Park Tennis Courts',
] as const;

export const DEUCE_WAIT_TIME_OPTIONS = [
  'Less than 1 hour',
  '1-2 hours',
  '2-3 hours',
  'More than 3 hours',
] as const;

export type DeuceWaitTimeCourt = (typeof DEUCE_WAIT_TIME_COURTS)[number];
export type DeuceWaitTimeOption = (typeof DEUCE_WAIT_TIME_OPTIONS)[number];

export type DeuceWaitTimeSubmission = {
  court_name: DeuceWaitTimeCourt;
  wait_time: DeuceWaitTimeOption;
  comment: string;
};

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

const courtSet = new Set<string>(DEUCE_WAIT_TIME_COURTS);
const waitTimeSet = new Set<string>(DEUCE_WAIT_TIME_OPTIONS);

export function parseDeuceWaitTimeSubmission(
  body: unknown
): { ok: true; value: DeuceWaitTimeSubmission } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const { court_name, wait_time, comment } = body as Record<string, unknown>;

  if (typeof court_name !== 'string' || !courtSet.has(court_name)) {
    return {
      ok: false,
      error: `court_name must be one of: ${DEUCE_WAIT_TIME_COURTS.join(', ')}`,
    };
  }

  if (typeof wait_time !== 'string' || !waitTimeSet.has(wait_time)) {
    return {
      ok: false,
      error: `wait_time must be one of: ${DEUCE_WAIT_TIME_OPTIONS.join(', ')}`,
    };
  }

  if (comment !== undefined && comment !== null && typeof comment !== 'string') {
    return { ok: false, error: 'comment must be a string when provided' };
  }

  return {
    ok: true,
    value: {
      court_name: court_name as DeuceWaitTimeCourt,
      wait_time: wait_time as DeuceWaitTimeOption,
      comment: typeof comment === 'string' ? comment : '',
    },
  };
}

export type DeuceCreatedWaitTimeReport = {
  id: string;
  court_name: string;
  wait_time: string;
  comment: string;
  reported_at: string;
  expires_at: string;
};

/** Inserts a Deuce-submitted wait time report (2-hour expiry). */
export async function createDeuceWaitTimeReport(
  supabase: SupabaseClient,
  submission: DeuceWaitTimeSubmission
): Promise<DeuceCreatedWaitTimeReport> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('wait_times')
    .insert({
      court_name: submission.court_name,
      wait_time: submission.wait_time,
      comment: submission.comment,
      expires_at: expiresAt.toISOString(),
      device_id: DEUCE_INTEGRATION_DEVICE_ID,
    })
    .select('id, court_name, wait_time, comment, created_at, expires_at')
    .single();

  if (error) throw error;
  if (!data) throw new Error('Insert succeeded but no row was returned');

  return {
    id: data.id,
    court_name: data.court_name,
    wait_time: data.wait_time,
    comment: data.comment ?? '',
    reported_at: data.created_at,
    expires_at: data.expires_at,
  };
}
