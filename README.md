# 🎵 BeatSync (SonicSync) — Your Phones. One Beat.

> Turn a group of mobile phones into a shared, synchronized wireless speaker system without carrying a physical speaker.

---

## 🚀 Phase 1 Completed: Room System & Real-Time Socket.IO Mesh

Phase 1 establishes the real-time communication backbone and device clustering mesh:

1. **Host Room Creation**:
   - Host chooses their name, session title, and device model.
   - Server dynamically generates a distinct, uppercase 6-character room code (e.g. `SYNC99`).
2. **Instant Multi-Device Joining**:
   - Friends can join by typing the 6-character code, or scanning the **live QR Code** with their phone camera.
   - Query parameter support: Scanning the QR code automatically navigates to `?room=CODE` and pre-fills the join screen.
3. **Live Participant Mesh & Telemetry**:
   - Real-time participant roster with Host badge (👑), device identification, and active speaker status.
   - **NTP-style Time Synchronization Ping Loop**: Measures continuous Round-Trip Time (RTT latency) and Server-Client Clock Offset in milliseconds, laying the foundation for Phase 4's microsecond playback synchronization.
4. **Local Wi-Fi Network LAN Auto-Discovery**:
   - Backend auto-detects host machine's Wi-Fi IPv4 address (`192.168.1.x`) and generates mobile-ready QR codes and join URLs that real smartphones on the same Wi-Fi can open instantly.
5. **Resilient Backend Store**:
   - Connected to MongoDB with automatic, non-blocking fallback to an in-memory cache so it runs with zero configuration out-of-the-box.

---

## 🛠 Tech Stack

- **Frontend**: React 19, Vite, Vanilla CSS Design System (Dark/Cyber Audio Aesthetics, Glassmorphism, Responsive Touch-first UI), Lucide Icons, QRCode.
- **Backend**: Node.js, Express.js, Socket.IO, CORS, Mongoose, Dotenv.
- **Protocol**: Real-time WebSockets with NTP clock offset calculation.

---

## 💻 How to Run Locally

### 1. Start Both Backend & Frontend
From the root directory:
```bash
npm run dev
```

Or run them individually in separate terminals:
- **Backend (Port 5000)**:
  ```bash
  npm run dev:server
  ```
- **Frontend (Port 5173)**:
  ```bash
  npm run dev:client
  ```

---

## 📱 How to Test on Multiple Phones on Your Wi-Fi

1. Open `http://localhost:5173` on your computer.
2. Click **"Start New Session"** to create a room.
3. Click **"Show QR Code"**.
4. With your mobile phone connected to the same Wi-Fi network, scan the QR code using your phone camera (or open `http://<YOUR-LAN-IP>:5173/?room=CODE`).
5. Tap **"Join as Speaker Node"**.
6. Watch both devices appear live in the **Active Speaker Cluster** with real-time latency badges!

---

## 🗺 Implementation Roadmap

- [x] **Phase 1 — Room System & Real-Time Mesh** *(Completed)*
- [ ] **Phase 2 — Music Upload & Pre-buffer Engine** (Audio upload, cloud/local storage, pre-loading audio buffer on all connected phones)
- [ ] **Phase 3 — Shared Playback Timeline** (Host Play, Pause, Seek controls broadcast to cluster)
- [ ] **Phase 4 — Precision Synchronization & Drift Correction** (Target server timestamp scheduling, audio clock alignment, periodic drift compensation)
- [ ] **Phase 5 — Mobile Audio Optimization & Wake Lock** (Mobile audio unlocking policies, background audio, volume calibration)
- [ ] **Phase 6 — Collaborative Queue & Session Analytics**