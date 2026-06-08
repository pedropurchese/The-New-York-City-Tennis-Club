'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase, formatSupabaseError, type WaitTime } from '@/lib/supabase';
import type { WaitReportVoteKind } from '@/lib/waitTimeReportVotes';
import { incrementWaitTimeFlag, alertFlagError } from '@/lib/incrementWaitTimeFlag';
import { normalizeCourtNameFromDb } from '@/lib/waitTimesCourt';
import { ensureSmartcourtDeviceIdOnPageLoad, getOrCreateSmartcourtDeviceId } from '@/lib/smartcourtDeviceId';
import {
  releaseWaitTimeReportLock,
  startWaitTimeReportCooldown,
  tryAcquireWaitTimeReportLock,
} from '@/lib/waitTimeReportCooldown';
import { useWaitTimeReportCooldown } from '@/hooks/useWaitTimeReportCooldown';
import {
  mergeWaitTimeUpdateIntoCourts,
  subscribeWaitTimesRealtime,
} from '@/lib/waitTimesRealtime';

const BRIAN_WATKINS_KEY = 'Brian Watkins Tennis Courts';
const SOUTH_OXFORD_KEY = 'South Oxford Park Tennis Courts';

const EMPTY_COURTS = (): { [key: string]: WaitTime | null } => ({
  'Hudson River Park Courts': null,
  'Pier 42': null,
  [BRIAN_WATKINS_KEY]: null,
  [SOUTH_OXFORD_KEY]: null,
});

export function useWaitTimes() {
  const [waitTimes, setWaitTimes] = useState<{ [key: string]: WaitTime | null }>(
    EMPTY_COURTS()
  );
  const [loading, setLoading] = useState(true);
  const [reporting, setReporting] = useState<string | null>(null);
  const [reportSuccess, setReportSuccess] = useState<string | null>(null);
  const {
    reportCooldownActive,
    reportCooldownSecondsLeft,
    refreshCooldown,
  } = useWaitTimeReportCooldown();

  const getStatusFromWaitTime = (waitTime: string) => {
    if (waitTime.includes('Less than 1 hour')) return 'green';
    if (waitTime.includes('1-2 hours')) return 'yellow';
    if (waitTime.includes('2-3 hours')) return 'orange';
    if (waitTime.includes('More than 3 hours')) return 'red';
    return 'gray';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'green':
        return 'bg-[#2D5A27]';
      case 'yellow':
        return 'bg-yellow-500';
      case 'orange':
        return 'bg-orange-500';
      case 'red':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const formatTimeDifference = (timestamp: number) => {
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    return `${Math.floor(diffHours / 24)} day${Math.floor(diffHours / 24) !== 1 ? 's' : ''} ago`;
  };

  const loadWaitTimes = async () => {
    try {
      setLoading(true);
      if (!supabase) {
        setWaitTimes(EMPTY_COURTS());
        return;
      }
      const { data, error } = await supabase
        .from('wait_times')
        .select('*')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        setWaitTimes(EMPTY_COURTS());
        return;
      }

      const courtWaitTimes = EMPTY_COURTS();

      data?.forEach((wt) => {
        const key = normalizeCourtNameFromDb(wt.court_name);
        if (courtWaitTimes.hasOwnProperty(key) && !courtWaitTimes[key]) {
          courtWaitTimes[key] = wt;
        }
      });

      setWaitTimes(courtWaitTimes);
    } catch {
      setWaitTimes(EMPTY_COURTS());
    } finally {
      setLoading(false);
    }
  };

  const loadWaitTimesRef = useRef(loadWaitTimes);
  loadWaitTimesRef.current = loadWaitTimes;

  const handleReportWaitTime = async (
    courtName: string,
    waitTime: string,
    comment: string = ''
  ) => {
    if (!tryAcquireWaitTimeReportLock()) {
      return;
    }
    if (!waitTime || waitTime === 'Select wait time...') {
      releaseWaitTimeReportLock();
      alert('Please select a wait time before reporting');
      return;
    }
    if (!supabase) {
      releaseWaitTimeReportLock();
      alert('Wait times are not configured. Add Supabase env vars to enable.');
      return;
    }
    setReporting(courtName);
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const { error } = await supabase.from('wait_times').insert({
        court_name: courtName,
        wait_time: waitTime,
        comment: comment || '',
        expires_at: expiresAt.toISOString(),
        hour_of_day: now.getHours(),
        day_of_week: now.getDay(),
        device_id: getOrCreateSmartcourtDeviceId(),
      });
      if (error) throw error;
      startWaitTimeReportCooldown();
      refreshCooldown();
      setReportSuccess(courtName);
      setTimeout(() => setReportSuccess(null), 3000);
      await loadWaitTimes();
    } catch (error) {
      console.error('Error reporting wait time:', error);
      alert(`Failed to report: ${formatSupabaseError(error)}`);
    } finally {
      releaseWaitTimeReportLock();
      setReporting(null);
    }
  };

  const handleFlagWaitTime = async (reportId: string, kind: WaitReportVoteKind) => {
    if (!supabase) {
      alert('Wait times are not configured. Add Supabase env vars to enable.');
      return;
    }
    try {
      await incrementWaitTimeFlag(supabase, reportId, kind);
      await loadWaitTimes();
    } catch (error) {
      console.error('Error flagging wait time:', error);
      alertFlagError(error);
    }
  };

  useEffect(() => {
    ensureSmartcourtDeviceIdOnPageLoad();
    loadWaitTimes();
    const client = supabase;
    if (client) {
      const run = async () => {
        try {
          await client.from('wait_times').delete().lt('expires_at', new Date().toISOString());
        } catch {
          // Ignore cleanup errors
        }
      };
      run();
    }
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    return subscribeWaitTimesRealtime(
      client,
      (row) => setWaitTimes((prev) => mergeWaitTimeUpdateIntoCourts(prev, row)),
      () => void loadWaitTimesRef.current()
    );
  }, []);

  return {
    waitTimes,
    loading,
    reporting,
    reportSuccess,
    reportCooldownActive,
    reportCooldownSecondsLeft,
    getStatusFromWaitTime,
    getStatusColor,
    formatTimeDifference,
    handleReportWaitTime,
    handleFlagWaitTime,
    loadWaitTimes,
  };
}
