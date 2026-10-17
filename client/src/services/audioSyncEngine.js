// BeatSync High-Precision Audio Synchronization Engine (Web Audio API + Drift Compensation)

class AudioSyncEngine {
  constructor() {
    this.audioContext = null;
    this.audioElement = new Audio();
    this.audioElement.preload = 'auto';
    this.audioElement.crossOrigin = 'anonymous';

    this.analyser = null;
    this.sourceNode = null;
    this.gainNode = null;

    this.isUnlocked = false;
    this.wakeLock = null;

    this.currentTrack = null;
    this.isPlaying = false;
    this.scheduledTimer = null;
    this.driftMonitorInterval = null;

    this.clockOffset = 0; // serverTime - clientTime
    this.calibrationOffsetMs = 0; // per-device hardware adjustment
    this.lastDriftMs = 0;

    this.onStateChange = null;
    this.onBufferProgress = null;
    this.onDriftUpdate = null;

    this.initAudioElementListeners();
  }

  // Initialize Web Audio graph
  initContext() {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 64;

        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = 1.0;

        try {
          this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement);
          this.sourceNode.connect(this.gainNode);
          this.gainNode.connect(this.analyser);
          this.analyser.connect(this.audioContext.destination);
        } catch (e) {
          console.warn('[AudioEngine] MediaElementSource warning:', e);
        }
      }
    }
  }

  initAudioElementListeners() {
    this.audioElement.addEventListener('canplaythrough', () => {
      console.log('[AudioEngine] Track buffered and ready.');
      if (this.onBufferProgress) this.onBufferProgress(100, true);
    });

    this.audioElement.addEventListener('waiting', () => {
      console.log('[AudioEngine] Buffering audio...');
      if (this.onBufferProgress) this.onBufferProgress(50, false);
    });

    this.audioElement.addEventListener('ended', () => {
      this.isPlaying = false;
      this.stopDriftMonitor();
      if (this.onStateChange) this.onStateChange({ isPlaying: false, currentTime: this.audioElement.duration || 0 });
    });

    this.audioElement.addEventListener('error', (e) => {
      console.error('[AudioEngine] Audio element error:', e);
    });
  }

  // Mobile User Gesture Audio Unlock
  async unlockAudio() {
    this.initContext();

    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Play micro-silence to satisfy iOS Safari / Android Chrome autoplay policy
    try {
      this.audioElement.volume = 0.001;
      const playPromise = this.audioElement.play();
      if (playPromise !== undefined) {
        await playPromise;
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
        this.audioElement.volume = 1.0;
      }
    } catch (err) {
      console.warn('[AudioEngine] Gesture test error:', err);
    }

    // Request Screen Wake Lock so phone doesn't sleep
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        console.log('⚡ [AudioEngine] Screen Wake Lock acquired.');
      }
    } catch (err) {
      console.warn('[AudioEngine] WakeLock notice:', err.message);
    }

    this.isUnlocked = true;
    console.log('🔊 [AudioEngine] Audio engine fully unlocked for mobile speakers!');
    return true;
  }

  setClockOffset(offset) {
    this.clockOffset = offset;
  }

  setCalibrationOffset(calibrationMs) {
    this.calibrationOffsetMs = calibrationMs;
  }

  setVolume(volumeFraction) {
    const vol = Math.max(0, Math.min(1, volumeFraction));
    this.audioElement.volume = vol;
    if (this.gainNode) {
      this.gainNode.gain.value = vol;
    }
  }

  // Load and pre-buffer a track
  async loadTrack(track) {
    if (!track || !track.url) return;

    if (this.currentTrack?.url === track.url && this.audioElement.src) {
      return; // Already loaded
    }

    this.currentTrack = track;
    this.audioElement.src = track.url;
    this.audioElement.load();

    if (this.onBufferProgress) this.onBufferProgress(10, false);
  }

  // Microsecond Precision Scheduled Play
  schedulePlay({ scheduledStartTime, startPosition = 0 }) {
    if (this.scheduledTimer) clearTimeout(this.scheduledTimer);

    const nowClient = Date.now();
    // Convert server schedule timestamp to local device timestamp using NTP clockOffset
    const targetLocalTime = scheduledStartTime - this.clockOffset;
    const delayMs = targetLocalTime - nowClient;

    console.log(`[AudioEngine] Scheduled play: now=${nowClient}, targetLocal=${targetLocalTime}, delay=${delayMs}ms, pos=${startPosition}s`);

    const executeStart = () => {
      this.audioElement.currentTime = startPosition + (this.calibrationOffsetMs / 1000);
      this.audioElement.playbackRate = 1.0;

      const playPromise = this.audioElement.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          this.isPlaying = true;
          this.startDriftMonitor({ scheduledStartTime, startPosition });
          if (this.onStateChange) this.onStateChange({ isPlaying: true, currentTime: this.audioElement.currentTime });
        }).catch(err => {
          console.warn('[AudioEngine] Auto-play prevented. User needs to tap unlock:', err);
        });
      }
    };

    if (delayMs > 0) {
      // Future start
      this.scheduledTimer = setTimeout(executeStart, delayMs);
    } else {
      // Command arrived late -> Catch up immediately!
      const catchUpSec = Math.abs(delayMs) / 1000;
      console.log(`[AudioEngine] Late arrival: catching up by ${catchUpSec.toFixed(3)}s`);
      executeStart();
    }
  }

  pause(position) {
    if (this.scheduledTimer) clearTimeout(this.scheduledTimer);
    this.stopDriftMonitor();

    this.audioElement.pause();
    this.audioElement.playbackRate = 1.0;
    if (position !== undefined) {
      this.audioElement.currentTime = position;
    }
    this.isPlaying = false;
    if (this.onStateChange) this.onStateChange({ isPlaying: false, currentTime: this.audioElement.currentTime });
  }

  seek(position, isPlaying, scheduledStartTime) {
    if (this.scheduledTimer) clearTimeout(this.scheduledTimer);
    this.stopDriftMonitor();

    this.audioElement.currentTime = position + (this.calibrationOffsetMs / 1000);

    if (isPlaying && scheduledStartTime) {
      this.schedulePlay({ scheduledStartTime, startPosition: position });
    } else {
      this.audioElement.pause();
      this.isPlaying = false;
      if (this.onStateChange) this.onStateChange({ isPlaying: false, currentTime: position });
    }
  }

  // Continuous Drift Correction Loop (Adaptive Rate Scaling)
  startDriftMonitor({ scheduledStartTime, startPosition }) {
    this.stopDriftMonitor();

    this.driftMonitorInterval = setInterval(() => {
      if (!this.isPlaying || this.audioElement.paused) return;

      const currentServerTime = Date.now() + this.clockOffset;
      const elapsedServerSec = (currentServerTime - scheduledStartTime) / 1000;
      const expectedTimelineSec = startPosition + elapsedServerSec;
      const actualTimeSec = this.audioElement.currentTime - (this.calibrationOffsetMs / 1000);

      const driftSec = actualTimeSec - expectedTimelineSec;
      const driftMs = Math.round(driftSec * 1000);
      this.lastDriftMs = driftMs;

      if (this.onDriftUpdate) this.onDriftUpdate(driftMs);

      // DRIFT CORRECTION LOGIC:
      // 1. Excellent Sync (|drift| <= 20ms) -> Normal speed
      if (Math.abs(driftMs) <= 20) {
        if (this.audioElement.playbackRate !== 1.0) {
          this.audioElement.playbackRate = 1.0;
        }
      }
      // 2. Subtle Drift (20ms to 140ms) -> Smooth micro-rate adjustment (imperceptible pitch/speed fix)
      else if (Math.abs(driftMs) <= 140) {
        if (driftMs > 0) {
          // Running ahead: slightly slow down
          this.audioElement.playbackRate = 0.96;
        } else {
          // Lagging behind: slightly speed up
          this.audioElement.playbackRate = 1.04;
        }
      }
      // 3. Significant Drift (> 140ms) -> Snap Seek
      else {
        console.log(`[AudioEngine] Large drift detected (${driftMs}ms). Resynchronizing position.`);
        this.audioElement.currentTime = Math.max(0, expectedTimelineSec + (this.calibrationOffsetMs / 1000));
        this.audioElement.playbackRate = 1.0;
      }
    }, 1200);
  }

  stopDriftMonitor() {
    if (this.driftMonitorInterval) {
      clearInterval(this.driftMonitorInterval);
      this.driftMonitorInterval = null;
    }
  }

  // Get frequency spectrum for audio visualizer
  getFrequencyData() {
    if (!this.analyser) return new Uint8Array(32);
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }
}

export const audioEngine = new AudioSyncEngine();
