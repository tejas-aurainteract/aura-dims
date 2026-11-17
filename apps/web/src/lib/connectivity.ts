import { useState, useEffect } from 'react';

export type ConnectivityStatus = 'never_connected' | 'online' | 'offline';

export const HEARTBEAT_OFFLINE_THRESHOLD_MS = 60_000; // 60s (2 missed 30s heartbeats)

/**
 * Derive connectivity status for a digital display based on its last heartbeat timestamp.
 */
export function deriveConnectivity(
  lastHeartbeat: string | number | { toMillis?: () => number } | null | undefined,
  nowMs: number = Date.now()
): ConnectivityStatus {
  if (!lastHeartbeat) {
    return 'never_connected';
  }

  let heartbeatMs: number;
  if (typeof lastHeartbeat === 'number') {
    heartbeatMs = lastHeartbeat;
  } else if (typeof lastHeartbeat === 'object' && typeof lastHeartbeat.toMillis === 'function') {
    heartbeatMs = lastHeartbeat.toMillis();
  } else {
    heartbeatMs = new Date(lastHeartbeat as string).getTime();
  }

  if (Number.isNaN(heartbeatMs) || heartbeatMs <= 0) {
    return 'never_connected';
  }

  return nowMs - heartbeatMs <= HEARTBEAT_OFFLINE_THRESHOLD_MS ? 'online' : 'offline';
}

/**
 * React hook that ticks at a regular interval (default 5s) to trigger
 * re-evaluation of time-sensitive properties such as digital display connectivity.
 */
export function useNowTick(intervalMs: number = 5000): number {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);

    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
