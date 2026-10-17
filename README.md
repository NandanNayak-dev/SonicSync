# 🎵 BeatSync (SonicSync) — Your Phones. One Beat.

> Turn a group of mobile phones into a shared, synchronized wireless speaker system without carrying a physical speaker.

[![Node.js](https://img.shields.io/badge/Node.js-v24+-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19+-blue.svg)](https://react.dev/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-Real--Time-black.svg)](https://socket.io/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas%20Ready-brightgreen.svg)](https://www.mongodb.com/atlas)
[![License](https://img.shields.io/badge/License-ISC-purple.svg)](LICENSE)

---

## 🚀 Fully Implemented Features (All Phases Complete)

### 1. Room System & Mesh Clustering
- **Host Room Creation**: Generates clean, distinct 6-character room codes (`SYNC99`).
- **Instant QR Code Joining**: Friends scan the QR code to join in seconds without downloading an app or creating an account.
- **Auto LAN IP Discovery**: Detects host Wi-Fi address for seamless mobile device connection.

### 2. Audio Engine & Multi-Device Pre-buffering
- **Built-in Presets**: 3 synthesized demo tracks (Electronic Anthem, Midnight Bass Drop, Lo-Fi Chill) ready to play out-of-the-box.
- **Custom Audio Uploader**: Supports uploading your own MP3, WAV, M4A, or AAC audio files with HTTP 206 Partial Content range streaming.
- **Cluster Buffer Readiness**: Every phone preloads the audio track into memory before playback begins. Host can see live buffer readiness (e.g. `All Phones Ready 3/3`).

### 3. Master Host Playback Timeline
- **Single Source of Truth**: Host controls Play, Pause, Seek bar, Track Selection, and Master Queue.
- **Synchronized Playback Broadcast**: Commands broadcast via Socket.IO events to all speaker nodes.

### 4. True Microsecond Synchronization & Drift Correction
- **Continuous NTP Clock Sync**: Continually calculates round-trip latency (RTT) and clock offset between each phone and the server.
- **Scheduled Target Timestamps**: When Host presses Play, playback is scheduled for a target timestamp 600ms in the future ($T_{server}$). Every phone starts at the exact same physical millisecond!
- **Adaptive Drift Monitor**: Runs every 1.2s during playback:
  - If drift is within $\pm 20\text{ms}$: 100% in sync.
  - If drift is between $20\text{ms} - 140\text{ms}$: Smoothly micro-adjusts `playbackRate` ($0.96\times$ or $1.04\times$) to align timeline imperceptibly without audio glitches.
  - If drift $> 140\text{ms}$: Snaps audio timeline to exact millisecond.

### 5. Mobile Audio Autoplay Unlocking & Screen WakeLock
- **One-Tap Speaker Unlock**: Bypasses mobile browser autoplay restrictions (iOS Safari / Android Chrome).
- **Screen Wake Lock API**: Prevents mobile screens from turning off or sleeping the audio output during sessions.
- **Per-Device Hardware Calibration**: Slider ($-100\text{ms}$ to $+100\text{ms}$) to compensate for individual phone DAC or Bluetooth speaker latency.

### 6. Real-Time Audio Visualizer & MongoDB Atlas
- **Synchronized Web Audio Visualizer**: 24-band frequency analyzer canvas dancing live to the music on all connected phones.
- **Collaborative Playlist**: Queue songs on the fly.
- **MongoDB Atlas Integration**: Fully connected Mongoose schemas for rooms, participants, and playlists.

---

## 🛠 Tech Stack

- **Frontend**: React 19, Vite, Web Audio API, Vanilla CSS Design System (Cyber Dark Mode, Glassmorphism), Lucide Icons, QRCode.
- **Backend**: Node.js, Express.js, Socket.IO, Multer, Mongoose, Dotenv.
- **Database**: MongoDB Atlas (with automatic fallback to high-speed in-memory caching).

---

## 💻 How to Run Locally

### 1. Start Both Backend & Frontend
From the root directory:
```bash
npm run dev
```

Or in separate terminal tabs:
- **Backend (Port 5000)**:
  ```bash
  cd server
  npm run dev
  ```
- **Frontend (Port 5173)**:
  ```bash
  cd client
  npm run dev
  ```

---

## 🍃 MongoDB Atlas Configuration

Your connection string is set up in [`server/.env`](server/.env):
```env
MONGODB_URI=mongodb+srv://<db_username>:ZuU1PVASelx0jHJ2@cluster0.5xaqrrl.mongodb.net/sonicsync?retryWrites=true&w=majority
```
> Replace `<db_username>` with your MongoDB Atlas database username (e.g. `nandan` or `admin`).
> *Note: If `<db_username>` is not yet configured, BeatSync automatically and seamlessly runs in high-speed In-Memory mode so it never crashes!*

---

## 🌐 1-Click Deployment to Render.com (100% Free)

1. Go to [dashboard.render.com](https://dashboard.render.com/) and sign in with GitHub.
2. Click **New +** &rarr; **Web Service**.
3. Select your repository: `NandanNayak-dev/SonicSync`.
4. Enter these settings:
   - **Runtime**: `Node`
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
5. Click **Create Web Service**!
Render will generate a live HTTPS URL like `https://sonicsync.onrender.com` that you and your friends can open on any phone anywhere!