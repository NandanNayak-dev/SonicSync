import express from 'express';
import os from 'os';
import { roomStore } from '../roomStore.js';

const router = express.Router();

// Helper to get local network IPv4 addresses, prioritizing Wi-Fi
function getLocalNetworkIps() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        const isWifi = /wi-fi|wlan|wireless/i.test(name);
        const isVirtual = /virtual|vbox|vmware|vethernet/i.test(name);
        addresses.push({
          interface: name,
          ip: net.address,
          isWifi,
          isVirtual
        });
      }
    }
  }

  // Sort so Wi-Fi comes first, then physical ethernet, virtual last
  addresses.sort((a, b) => {
    if (a.isWifi && !b.isWifi) return -1;
    if (!a.isWifi && b.isWifi) return 1;
    if (!a.isVirtual && b.isVirtual) return -1;
    if (a.isVirtual && !b.isVirtual) return 1;
    return 0;
  });

  return addresses;
}

// Health check endpoint
router.get('/health', (req, res) => {
  const rooms = roomStore.getAllRooms();
  const totalParticipants = rooms.reduce((acc, r) => acc + r.participants.length, 0);

  res.json({
    status: 'online',
    service: 'SonicSync Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    stats: {
      activeRooms: rooms.length,
      totalParticipants
    }
  });
});

// Network information for mobile device connection
router.get('/network-info', (req, res) => {
  const ips = getLocalNetworkIps();
  const primaryIp = ips.length > 0 ? ips[0].ip : 'localhost';

  res.json({
    localIps: ips,
    primaryIp,
    recommendedClientPort: 5173,
    serverPort: process.env.PORT || 5000
  });
});

// Get room details by room code
router.get('/rooms/:roomCode', (req, res) => {
  const { roomCode } = req.params;
  const room = roomStore.getRoom(roomCode);

  if (!room) {
    return res.status(404).json({
      success: false,
      error: `Room "${roomCode}" not found`
    });
  }

  res.json({
    success: true,
    room
  });
});

// List all active rooms (useful for debugging/testing)
router.get('/rooms', (req, res) => {
  const rooms = roomStore.getAllRooms().map(r => ({
    roomCode: r.roomCode,
    roomName: r.roomName,
    hostName: r.hostName,
    participantCount: r.participants.length,
    createdAt: r.createdAt
  }));

  res.json({
    success: true,
    count: rooms.length,
    rooms
  });
});

export default router;
