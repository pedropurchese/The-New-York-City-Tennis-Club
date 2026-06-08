'use client';

import { useCallback, useEffect, useState } from 'react';
import { getWaitTimeReportCooldownRemainingMs } from '@/lib/waitTimeReportCooldown';

export function useWaitTimeReportCooldown() {
  const [cooldownSecondsLeft, setCooldownSecondsLeft] = useState(0);

  const refreshCooldown = useCallback(() => {
    const remainingMs = getWaitTimeReportCooldownRemainingMs();
    setCooldownSecondsLeft(
      remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0
    );
  }, []);

  useEffect(() => {
    refreshCooldown();
    const id = window.setInterval(refreshCooldown, 500);
    return () => window.clearInterval(id);
  }, [refreshCooldown]);

  return {
    reportCooldownActive: cooldownSecondsLeft > 0,
    reportCooldownSecondsLeft: cooldownSecondsLeft,
    refreshCooldown,
  };
}
