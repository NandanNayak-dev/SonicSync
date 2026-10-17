import express from 'express';
import os from 'os';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { roomStore } from '../roomStore.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.resolve(__dirname, '../uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E6)}`;
    cb(null, `${uniqueSuffix}-${cleanName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
  fileFilter: (req, file, cb) => {
    const allowed = /mp3|wav|m4a|aac|ogg|audio/i.test(path.extname(file.originalname)) || file.mimetype.startsWith('audio/');
    if (allowed) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files (MP3, WAV, M4A, AAC, OGG) are supported.'));
    }
  }
});

// Helper to get local network IPv4 addresses
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
    service: 'BeatSync Master Hub',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    mongoConnected: roomStore.isMongoConnected,
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

// Get available preset demo tracks
router.get('/presets', (req, res) => {
  res.json({
    success: true,
    presets: roomStore.presetTracks
  });
});

// Audio Stream Handler with HTTP 206 Partial Content (HTTP Range Requests)
// Critical for mobile devices (Safari iOS, Chrome Android) to buffer & seek smoothly
router.get('/audio/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(uploadDir, path.basename(filename));

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Audio file not found' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  const ext = path.extname(filename).toLowerCase();
  let contentType = 'audio/mpeg';
  if (ext === '.wav') contentType = 'audio/wav';
  else if (ext === '.ogg') contentType = 'audio/ogg';
  else if (ext === '.m4a' || ext === '.aac') contentType = 'audio/mp4';

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, immutable'
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400, immutable'
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// Upload custom audio track
router.post('/upload-audio', upload.single('audio'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No audio file provided' });
    }

    const title = req.body.title || req.file.originalname.replace(/\.[^/.]+$/, "");
    const artist = req.body.artist || 'Custom Upload';
    const roomCode = req.body.roomCode;

    const track = {
      id: `custom-${Date.now()}`,
      title,
      artist,
      filename: req.file.filename,
      url: `/api/audio/${req.file.filename}`,
      sizeBytes: req.file.size,
      addedAt: new Date().toISOString()
    };

    if (roomCode) {
      roomStore.addTrackToPlaylist(roomCode, track);
    }

    res.json({
      success: true,
      track,
      message: 'Audio track uploaded successfully'
    });
  } catch (err) {
    console.error('Audio upload error:', err);
    res.status(500).json({ success: false, error: err.message || 'Audio upload failed' });
  }
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

export default router;
