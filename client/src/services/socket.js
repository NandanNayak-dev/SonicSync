import { io } from 'socket.io-client';

// Determine backend server URL:
// Uses window.location.origin so all WebSocket traffic proxies through port 5173 seamlessly.
// This means mobile phones only need to reach a single port (5173)!
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
  reconnectionAttempts: 10,
  reconnectionDelay: 1000
});

// Real-time NTP-style Clock & Latency Sync
let syncInterval = null;
let currentLatency = 0;
let clockOffset = 0; // serverTime - clientTime

export function startLatencyMeasurement(onLatencyUpdate) {
  if (syncInterval) clearInterval(syncInterval);

  const measure = () => {
    if (!socket.connected) return;

    const t0 = Date.now();
    socket.emit('sync:ping', { clientSendTime: t0 }, (response) => {
      if (!response) return;

      const t3 = Date.now();
      const { serverReceiveTime: t1, serverSendTime: t2 } = response;

      // NTP standard calculations:
      // Round-trip time: (t3 - t0) - (t2 - t1)
      const roundTrip = Math.max(0, (t3 - t0) - (t2 - t1));
      // Clock offset: ((t1 - t0) + (t2 - t3)) / 2
      const offset = Math.round(((t1 - t0) + (t2 - t3)) / 2);

      currentLatency = Math.round(roundTrip / 2);
      clockOffset = offset;

      // Notify backend of our latency so other participants see it
      socket.emit('room:update_latency', { latencyMs: currentLatency });

      if (typeof onLatencyUpdate === 'function') {
        onLatencyUpdate({
          latencyMs: currentLatency,
          offsetMs: clockOffset,
          roundTripMs: roundTrip
        });
      }
    });
  };

  // Immediate first run, then every 4 seconds
  measure();
  syncInterval = setInterval(measure, 4000);

  return () => {
    if (syncInterval) clearInterval(syncInterval);
  };
}

export function getEstimatedServerTime() {
  return Date.now() + clockOffset;
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
