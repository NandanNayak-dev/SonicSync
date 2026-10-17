import { io } from 'socket.io-client';

const getSocketUrl = () => {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin;
  }
  return 'http://localhost:5000';
};

export const socket = io(getSocketUrl(), {
  autoConnect: true,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 15,
  reconnectionDelay: 800
});

// Precision NTP Clock Synchronization Engine
let syncInterval = null;
let currentLatency = 0;
let clockOffset = 0; // serverTime - clientTime
let isSynchronized = false;

// Burst NTP Sync with Outlier Rejection (Christian's Algorithm)
export async function performNTPBurst(sampleCount = 8) {
  if (!socket.connected) return null;

  const samples = [];

  for (let i = 0; i < sampleCount; i++) {
    const sample = await new Promise((resolve) => {
      const t0 = Date.now();
      socket.emit('sync:ping', { clientSendTime: t0 }, (response) => {
        if (!response) return resolve(null);
        const t3 = Date.now();
        const { serverReceiveTime: t1, serverSendTime: t2 } = response;

        // Round-trip network transit time
        const rtt = Math.max(0, (t3 - t0) - (t2 - t1));
        // True clock offset: ((t1 - t0) + (t2 - t3)) / 2
        const offset = ((t1 - t0) + (t2 - t3)) / 2;

        resolve({ rtt, offset });
      });
    });

    if (sample) samples.push(sample);
    // 40ms interval between burst pings
    if (i < sampleCount - 1) {
      await new Promise(r => setTimeout(r, 40));
    }
  }

  if (samples.length === 0) return null;

  // Sort by RTT ascending (packets with lowest latency experienced lowest network buffering jitter)
  samples.sort((a, b) => a.rtt - b.rtt);

  // Take the best 40% of samples (minimum RTTs)
  const bestCount = Math.max(1, Math.floor(samples.length * 0.4));
  const bestSamples = samples.slice(0, bestCount);

  // Calculate precision average offset from best samples
  const totalOffset = bestSamples.reduce((sum, s) => sum + s.offset, 0);
  const avgOffset = Math.round(totalOffset / bestCount);
  const minRtt = bestSamples[0].rtt;

  clockOffset = avgOffset;
  currentLatency = Math.round(minRtt / 2);
  isSynchronized = true;

  return {
    offset: avgOffset,
    rtt: minRtt,
    latency: currentLatency
  };
}

export function startLatencyMeasurement(onLatencyUpdate) {
  if (syncInterval) clearInterval(syncInterval);

  const runSync = async () => {
    if (!socket.connected) return;

    // Use burst sync for ultra-high accuracy
    const result = await performNTPBurst(6);
    if (!result) return;

    socket.emit('room:update_latency', { latencyMs: currentLatency });

    if (typeof onLatencyUpdate === 'function') {
      onLatencyUpdate({
        latencyMs: currentLatency,
        offsetMs: clockOffset,
        roundTripMs: result.rtt
      });
    }
  };

  // Perform initial high-sample burst sync immediately upon connection
  if (socket.connected) {
    runSync();
  }

  socket.on('connect', () => {
    runSync();
  });

  // Re-synchronize every 3 seconds to eliminate thermal clock drift
  syncInterval = setInterval(runSync, 3000);

  return () => {
    if (syncInterval) clearInterval(syncInterval);
  };
}

export function getEstimatedServerTime() {
  return Date.now() + clockOffset;
}

export function getClockOffset() {
  return clockOffset;
}

export function detectDeviceType() {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'Android Device';
  if (/iPad|iPhone|iPod/.test(ua)) return 'iPhone / iPad';
  if (/Macintosh/.test(ua)) return 'Mac Computer';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Linux/.test(ua)) return 'Linux Machine';
  return 'Web Device';
}
