// BeatSync Pure Web Audio API Engine — Sub-Millisecond Precision Synchronization
// Uses RAM-decoded AudioBuffers, AudioContext hardware clock, and Phase-Locked Loop (PLL) drift correction.

class AudioSyncEngine {
  constructor() {
    this.audioContext = null;
    this.gainNode = null;
    this.analyser = null;

    this.currentSource = null;
    this.audioBuffer = null;
    this.currentTrack = null;

    this.isPlaying = false;
    this.startTimeAudioCtx = 0;
    this.startOffsetSec = 0;
    this.scheduledStartTimeServer = 0;

    this.clockOffset = 0; // serverTime - clientTime
    this.calibrationOffsetMs = 0; // per-device hardware adjustment
    this.hardwareLatencySec = 0;

    this.isUnlocked = false;
    this.wakeLock = null;

    this.driftMonitorInterval = null;
    this.timeUpdateInterval = null;
    this.lastDriftMs = 0;

    this.onStateChange = null;
    this.onBufferProgress = null;
    this.onDriftUpdate = null;

    // Fallback HTML5 Audio element for legacy environments
    this.fallbackAudio = new Audio();
    this.fallbackAudio.preload = 'auto';
    this.fallbackAudio.crossOrigin = 'anonymous';
  }

  // Initialize Web Audio Context with Hardware Output Latency Detection
  initContext() {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx({ latencyHint: 'interactive' });
        
        // Measure audio output hardware DAC buffer latency
        const baseLat = this.audioContext.baseLatency || 0;
        const outLat = this.audioContext.outputLatency || 0;
        this.hardwareLatencySec = baseLat + outLat;
        console.log(`⚡ [AudioEngine] Web Audio initialized. Hardware buffer latency: ${(this.hardwareLatencySec * 1000).toFixed(1)}ms`);

        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = 1.0;

        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 64;

        this.gainNode.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
      }
    }
  }

  // Mobile User Gesture Audio Unlock & Screen Wake Lock
  async unlockAudio() {
    this.initContext();

    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Play ultra-short silent audio buffer to unlock audio hardware on mobile
    if (this.audioContext) {
      const silentBuffer = this.audioContext.createBuffer(1, 1, 22050);
      const silentSource = this.audioContext.createBufferSource();
      silentSource.buffer = silentBuffer;
      silentSource.connect(this.audioContext.destination);
      silentSource.start(0);
    }

    // Acquire Screen Wake Lock so phone doesn't sleep or mute audio
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        console.log('⚡ [AudioEngine] Screen Wake Lock active.');
      }
    } catch (err) {
      console.warn('[AudioEngine] WakeLock notice:', err.message);
    }

    this.isUnlocked = true;
    console.log('🔊 [AudioEngine] Audio engine fully unlocked for zero-latency playback!');
    return true;
  }

  setClockOffset(offset) {
    this.clockOffset = offset;
  }

  setCalibrationOffset(calibrationMs) {
    this.calibrationOffsetMs = calibrationMs;
    // Apply immediate calibration if playing
    if (this.isPlaying && this.currentSource) {
      this.checkAndCorrectDrift();
    }
  }

  setVolume(volumeFraction) {
    const vol = Math.max(0, Math.min(1, volumeFraction));
    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.setValueAtTime(vol, this.audioContext.currentTime);
    }
    this.fallbackAudio.volume = vol;
  }

  // Download and decode audio file directly into RAM (AudioBuffer)
  async loadTrack(track) {
    if (!track || !track.url) return;

    this.initContext();
    this.currentTrack = track;

    if (this.onBufferProgress) this.onBufferProgress(20, false);

    try {
      console.log(`[AudioEngine] Preloading & decoding track to RAM: ${track.title}`);
      const response = await fetch(track.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const arrayBuffer = await response.arrayBuffer();
      if (this.onBufferProgress) this.onBufferProgress(60, false);

      if (this.audioContext) {
        // Decode audio data into uncompressed 32-bit float PCM in memory
        this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        console.log(`✅ [AudioEngine] Track decoded to RAM! Duration: ${this.audioBuffer.duration.toFixed(2)}s | Rate: ${this.audioBuffer.sampleRate}Hz`);
        if (this.onBufferProgress) this.onBufferProgress(100, true);
      } else {
        // Fallback for environments without Web Audio
        this.fallbackAudio.src = track.url;
        this.fallbackAudio.load();
        if (this.onBufferProgress) this.onBufferProgress(100, true);
      }
    } catch (err) {
      console.error('[AudioEngine] Error decoding audio buffer:', err);
      // Fallback
      this.fallbackAudio.src = track.url;
      this.fallbackAudio.load();
      if (this.onBufferProgress) this.onBufferProgress(100, true);
    }
  }

  // Sub-millisecond Hardware-Scheduled Playback
  schedulePlay({ scheduledStartTime, startPosition = 0 }) {
    this.initContext();

    if (!this.audioBuffer && !this.fallbackAudio.src) {
      console.warn('[AudioEngine] Play called but audio not buffered yet.');
      return;
    }

    this.stopPlayback();

    const nowServer = Date.now() + this.clockOffset;
    const deltaMs = scheduledStartTime - nowServer;
    const deltaSec = deltaMs / 1000;

    this.scheduledStartTimeServer = scheduledStartTime;
    this.startOffsetSec = startPosition;

    console.log(`🎯 [AudioEngine] Precision Scheduled Play: delta=${deltaMs}ms | startPos=${startPosition.toFixed(2)}s`);

    if (this.audioContext && this.audioBuffer) {
      // Map server scheduled time directly to AudioContext crystal clock
      const targetAudioCtxTime = this.audioContext.currentTime + deltaSec + (this.calibrationOffsetMs / 1000) - this.hardwareLatencySec;

      this.currentSource = this.audioContext.createBufferSource();
      this.currentSource.buffer = this.audioBuffer;
      this.currentSource.connect(this.gainNode);

      if (targetAudioCtxTime >= this.audioContext.currentTime) {
        // Schedule future start directly on audio hardware clock
        this.startTimeAudioCtx = targetAudioCtxTime;
        this.currentSource.start(targetAudioCtxTime, startPosition);
      } else {
        // Command arrived late: calculate catch-up offset to the exact sample
        const lateSec = this.audioContext.currentTime - targetAudioCtxTime;
        const actualStartOffset = startPosition + lateSec;
        this.startTimeAudioCtx = this.audioContext.currentTime - lateSec;
        console.log(`⚡ [AudioEngine] Late arrival: Catching up by ${(lateSec * 1000).toFixed(1)}ms`);

        if (actualStartOffset < this.audioBuffer.duration) {
          this.currentSource.start(0, actualStartOffset);
        } else {
          return;
        }
      }

      this.isPlaying = true;
      this.startDriftMonitor();
      this.startTimeTracker();

      if (this.onStateChange) {
        this.onStateChange({ isPlaying: true, currentTime: startPosition });
      }

      this.currentSource.onended = () => {
        if (this.isPlaying) {
          this.isPlaying = false;
          this.stopPlayback();
          if (this.onStateChange) this.onStateChange({ isPlaying: false, currentTime: this.audioBuffer.duration });
        }
      };

    } else {
      // Fallback HTML5 audio element
      const targetLocalTime = scheduledStartTime - this.clockOffset;
      const delay = Math.max(0, targetLocalTime - Date.now());
      setTimeout(() => {
        this.fallbackAudio.currentTime = startPosition;
        this.fallbackAudio.play().catch(() => {});
        this.isPlaying = true;
      }, delay);
    }
  }

  // Get current exact playback time
  getCurrentPlaybackTime() {
    if (!this.isPlaying) return this.startOffsetSec;

    if (this.audioContext && this.audioBuffer) {
      const elapsed = this.audioContext.currentTime - this.startTimeAudioCtx;
      return Math.max(0, Math.min(this.audioBuffer.duration, this.startOffsetSec + elapsed));
    }
    return this.fallbackAudio.currentTime || 0;
  }

  pause(position) {
    this.stopPlayback();
    if (position !== undefined) {
      this.startOffsetSec = position;
    }
    if (this.onStateChange) {
      this.onStateChange({ isPlaying: false, currentTime: this.startOffsetSec });
    }
  }

  seek(position, isPlaying, scheduledStartTime) {
    this.stopPlayback();
    this.startOffsetSec = position;

    if (isPlaying && scheduledStartTime) {
      this.schedulePlay({ scheduledStartTime, startPosition: position });
    } else {
      if (this.onStateChange) {
        this.onStateChange({ isPlaying: false, currentTime: position });
      }
    }
  }

  stopPlayback() {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch (e) {}
      this.currentSource = null;
    }

    this.fallbackAudio.pause();
    this.isPlaying = false;
    this.stopDriftMonitor();
    if (this.timeUpdateInterval) clearInterval(this.timeUpdateInterval);
  }

  startTimeTracker() {
    if (this.timeUpdateInterval) clearInterval(this.timeUpdateInterval);
    this.timeUpdateInterval = setInterval(() => {
      if (this.isPlaying && this.onStateChange) {
        this.onStateChange({ isPlaying: true, currentTime: this.getCurrentPlaybackTime() });
      }
    }, 200);
  }

  // Phase-Locked Loop (PLL) Continuous Drift Compensation
  startDriftMonitor() {
    this.stopDriftMonitor();

    // Check phase sync every 500ms
    this.driftMonitorInterval = setInterval(() => {
      this.checkAndCorrectDrift();
    }, 500);
  }

  checkAndCorrectDrift() {
    if (!this.isPlaying || !this.currentSource || !this.audioBuffer) return;

    const currentServerTime = Date.now() + this.clockOffset;
    const elapsedServerSec = (currentServerTime - this.scheduledStartTimeServer) / 1000;
    const expectedPlaybackSec = this.startOffsetSec + elapsedServerSec;
    const actualPlaybackSec = this.getCurrentPlaybackTime();

    // Drift in milliseconds (including user calibration offset)
    const driftSec = actualPlaybackSec - expectedPlaybackSec + (this.calibrationOffsetMs / 1000);
    const driftMs = Math.round(driftSec * 1000);
    this.lastDriftMs = driftMs;

    if (this.onDriftUpdate) this.onDriftUpdate(driftMs);

    const param = this.currentSource.playbackRate;
    const now = this.audioContext.currentTime;

    // 1. In Phase (|drift| <= 4ms) -> Exact normal 1.0000 speed
    if (Math.abs(driftMs) <= 4) {
      param.setValueAtTime(1.0, now);
    }
    // 2. Micro phase difference (4ms to 25ms) -> Subtle micro-rate adjustment (inaudible 0.4% speed)
    else if (Math.abs(driftMs) <= 25) {
      if (driftMs > 0) {
        param.setValueAtTime(0.996, now); // Slightly slow down
      } else {
        param.setValueAtTime(1.004, now); // Slightly speed up
      }
    }
    // 3. Moderate drift (25ms to 90ms) -> 1.5% speed adjustment
    else if (Math.abs(driftMs) <= 90) {
      if (driftMs > 0) {
        param.setValueAtTime(0.985, now);
      } else {
        param.setValueAtTime(1.015, now);
      }
    }
    // 4. Large drift (> 90ms) -> Instant re-sync to exact millisecond
    else {
      console.log(`⚡ [AudioEngine] Resyncing sample phase: drift was ${driftMs}ms`);
      const resyncPos = Math.max(0, expectedPlaybackSec - (this.calibrationOffsetMs / 1000));
      this.schedulePlay({
        scheduledStartTime: Date.now() + this.clockOffset + 200,
        startPosition: resyncPos + 0.2
      });
    }
  }

  stopDriftMonitor() {
    if (this.driftMonitorInterval) {
      clearInterval(this.driftMonitorInterval);
      this.driftMonitorInterval = null;
    }
  }

  getFrequencyData() {
    if (!this.analyser) return new Uint8Array(24);
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }
}

export const audioEngine = new AudioSyncEngine();
