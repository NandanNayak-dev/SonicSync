import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import roomRoutes from './routes/roomRoutes.js';
import { setupRoomSocket } from './socket/roomHandler.js';
import { roomStore } from './roomStore.js';
import { ensurePresetTracks } from './audioGenerator.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.resolve(__dirname, 'uploads');
const clientDistPath = path.resolve(__dirname, '../client/dist');

// Generate / ensure preset audio tracks on boot
const presetTracks = ensurePresetTracks(uploadDir);
roomStore.setPresetTracks(presetTracks);

const app = express();
const server = http.createServer(app);

// Setup Socket.IO with permissive CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingInterval: 10000,
  pingTimeout: 5000
});

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', roomRoutes);

// Serve static frontend build if it exists (for production deployment e.g. on Render)
app.use(express.static(clientDistPath));

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
      if (err) {
        res.json({
          message: 'SonicSync / BeatSync Backend API running.',
          hint: 'Frontend dist not found. Run npm run build in client/ to generate production bundle.'
        });
      }
    });
  }
});

// Setup Socket.IO Event Handlers
setupRoomSocket(io);

// MongoDB Atlas Connection (with automatic non-blocking fallback)
const rawMongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sonicsync';

async function connectMongo() {
  if (rawMongoUri.includes('<db_username>')) {
    console.log('ℹ️  [MongoDB Atlas] Notice: <db_username> placeholder detected in server/.env.');
    console.log('👉 To persist rooms to Atlas, replace <db_username> with your Atlas database username.');
    console.log('⚡ Running smoothly with ultra-fast In-Memory room caching in the meantime!\n');
    roomStore.setMongoConnected(false);
    return;
  }

  try {
    await mongoose.connect(rawMongoUri, {
      serverSelectionTimeoutMS: 3000
    });
    console.log('✅ [MongoDB Atlas] Connected successfully to cloud database!');
    roomStore.setMongoConnected(true);
  } catch (err) {
    console.log('ℹ️  [MongoDB] Connection notice:', err.message);
    console.log('⚡ Running smoothly with ultra-fast In-Memory room caching!\n');
    roomStore.setMongoConnected(false);
  }
}

connectMongo();

// Helper to get local IP prioritizing Wi-Fi
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  let fallbackIp = 'localhost';

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        if (/wi-fi|wlan|wireless/i.test(name)) {
          return net.address;
        }
        if (!/virtual|vbox|vmware|vethernet/i.test(name)) {
          fallbackIp = net.address;
        }
      }
    }
  }
  return fallbackIp;
}

const PORT = process.env.PORT || 5000;
const localIp = getLocalIp();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=================================================`);
  console.log(`🚀 BeatSync (SonicSync) Full Server Running`);
  console.log(`📡 Local URL:          http://localhost:${PORT}`);
  console.log(`📱 LAN / Mobile URL:    http://${localIp}:${PORT}`);
  console.log(`🎵 Preset Tracks:      ${presetTracks.length} ready in /uploads`);
  console.log(`⚡ Synchronization:    Microsecond Precision Scheduler`);
  console.log(`=================================================\n`);
});
