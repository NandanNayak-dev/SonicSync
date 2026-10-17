// BeatSync Pure Web Audio API Engine — Sub-Millisecond Precision Synchronization
// Features: In-RAM PCM AudioBuffers, Hardware Crystal Clock Scheduling,
// Continuous Mobile DAC Keep-Alive, Queued Preload Play, and Phase-Locked Loop (PLL).

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

    // Queued play command if buffer was still downloading when play arrived
    this.pendingPlay = null;
    this.isLoadingTrack = false;
    this.loadingPromise = null;

    this.clockOffset = 0; // serverTime - clientTime
    this.calibrationOffsetMs = 0; // per-device hardware calibration

    this.isUnlocked = false;
    this.wakeLock = null;
    this.keepAliveNode = null;

    this.driftMonitorInterval = null;
    this.timeUpdateInterval = null;
    this.lastDriftMs = 0;

    this.onStateChange = null;
    this.onBufferProgress = null;
    this.onDriftUpdate = null;
    this.onContextStateChange = null;

    // Fallback HTML5 Audio element for legacy environments
    this.fallbackAudio = new Audio();
    this.fallbackAudio.preload = 'auto';
    this.fallbackAudio.crossOrigin = 'anonymous';

    // Global unlock on ANY user touch or click anywhere in the window
    this.setupGlobalUnlockListener();
  }

  setupGlobalUnlockListener() {
    if (typeof window === 'undefined') return;

    const autoUnlock = () => {
      if (!this.isUnlocked || (this.audioContext && this.audioContext.state === 'suspended')) {
        this.unlockAudio().then(() => {
          console.log('👆 [AudioEngine] Auto-unlocked audio from user touch/click!');
        });
      }
    };

    window.addEventListener('click', autoUnlock, { passive: true });
    window.addEventListener('touchstart', autoUnlock, { passive: true });

    // Handle phone screen wake & tab visibility changes
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible') {
        if (this.audioContext && this.audioContext.state === 'suspended') {
          this.audioContext.resume().catch(() => {});
        }
        if ('wakeLock' in navigator && this.isUnlocked) {
          try {
            this.wakeLock = await navigator.wakeLock.request('screen');
          } catch (e) {}
        }
      }
    });
  }

  // Initialize Web Audio Context
  initContext() {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx({ latencyHint: 'interactive' });

        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = 1.0;

        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 64;

        this.gainNode.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);

        this.audioContext.onstatechange = () => {
          console.log(`🔊 [AudioEngine] AudioContext state: ${this.audioContext.state}`);
          if (this.onContextStateChange) {
            this.onContextStateChange(this.audioContext.state);
          }
        };
      }
    }
  }

  // Mobile Continuous DAC Keep-Alive
  startKeepAlive() {
    if (!this.audioContext || this.keepAliveNode) return;
    try {
      // Inaudible continuous oscillator keeps mobile audio DSP awake
      const osc = this.audioContext.createOscillator();
      const silentGain = this.audioContext.createGain();
      silentGain.gain.setValueAtTime(0.00001, this.audioContext.currentTime);
      osc.connect(silentGain);
      silentGain.connect(this.audioContext.destination);
      osc.start();
      this.keepAliveNode = osc;
      console.log('🛡️ [AudioEngine] Continuous mobile DAC keep-alive active.');
    } catch (e) {
      console.warn('[AudioEngine] Keep-alive setup notice:', e);
    }
  }

  // Mobile User Gesture Audio Unlock & Screen Wake Lock
  async unlockAudio() {
    this.initContext();

    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (e) {
        console.warn('[AudioEngine] Context resume error:', e);
      }
    }

    // Play ultra-short silence to satisfy mobile browser autoplay policies
    if (this.audioContext) {
      try {
        const silentBuffer = this.audioContext.createBuffer(1, 220, 22050);
        const silentSource = this.audioContext.createBufferSource();
        silentSource.buffer = silentBuffer;
        silentSource.connect(this.audioContext.destination);
        silentSource.start(0);
      } catch (e) {}

      this.startKeepAlive();
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

    if (this.onContextStateChange && this.audioContext) {
      this.onContextStateChange(this.audioContext.state);
    }

    // If a scheduled play was waiting for user unlock, fire it immediately!
    if (this.pendingPlay && this.audioBuffer) {
      const playData = this.pendingPlay;
      this.pendingPlay = null;
      console.log('▶️ [AudioEngine] Executing queued play after speaker unlock!');
      this.schedulePlay(playData);
    }

    return true;
  }

  setClockOffset(offset) {
    this.clockOffset = offset;
  }

  setCalibrationOffset(calibrationMs) {
    this.calibrationOffsetMs = calibrationMs;
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

    // If already loaded this exact URL, don't re-download
    if (this.currentTrack?.url === track.url && this.audioBuffer) {
      if (this.onBufferProgress) this.onBufferProgress(100, true);
      return this.audioBuffer;
    }

    // If already in flight downloading this exact track, return the existing promise
    if (this.currentTrack?.url === track.url && this.isLoadingTrack && this.loadingPromise) {
      return this.loadingPromise;
    }

    this.initContext();
    this.currentTrack = track;
    this.isLoadingTrack = true;
    this.audioBuffer = null;

    if (this.onBufferProgress) this.onBufferProgress(20, false);

    this.loadingPromise = (async () => {
      try {
        console.log(`[AudioEngine] Preloading & decoding track to RAM: ${track.title} (${track.url})`);
        const response = await fetch(track.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const arrayBuffer = await response.arrayBuffer();
        if (this.onBufferProgress) this.onBufferProgress(60, false);

        if (this.audioContext) {
          // Decode audio data into uncompressed 32-bit float PCM in memory
          this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
          this.isLoadingTrack = false;
          console.log(`✅ [AudioEngine] Track decoded to RAM! Duration: ${this.audioBuffer.duration.toFixed(2)}s | Rate: ${this.audioBuffer.sampleRate}Hz`);

          if (this.onBufferProgress) this.onBufferProgress(100, true);

          // If a play command arrived while downloading, calculate exact current position and start!
          if (this.pendingPlay) {
            const playData = this.pendingPlay;
            this.pendingPlay = null;

            const nowServer = Date.now() + this.clockOffset;
            const elapsedSinceScheduled = (nowServer - playData.scheduledStartTime) / 1000;
            const currentPosition = playData.startPosition + Math.max(0, elapsedSinceScheduled);

            if (currentPosition < this.audioBuffer.duration) {
              console.log(`▶️ [AudioEngine] Starting queued play at exact caught-up position: ${currentPosition.toFixed(2)}s`);
              this.schedulePlay({
                scheduledStartTime: nowServer + 50,
                startPosition: currentPosition + 0.05
              });
            }
          }
          return this.audioBuffer;
        } else {
          // Fallback for environments without Web Audio
          this.fallbackAudio.src = track.url;
          this.fallbackAudio.load();
          this.isLoadingTrack = false;
          if (this.onBufferProgress) this.onBufferProgress(100, true);
          if (this.pendingPlay) {
            const playData = this.pendingPlay;
            this.pendingPlay = null;
            this.schedulePlay(playData);
          }
        }
      } catch (err) {
        console.error('[AudioEngine] Error decoding audio buffer:', err);
        this.fallbackAudio.src = track.url;
        this.fallbackAudio.load();
        this.isLoadingTrack = false;
        if (this.onBufferProgress) this.onBufferProgress(100, true);
        if (this.pendingPlay) {
          const playData = this.pendingPlay;
          this.pendingPlay = null;
          this.schedulePlay(playData);
        }
      }
    })();

    return this.loadingPromise;
  }

  // Sub-millisecond Hardware Crystal Scheduled Playback
  schedulePlay({ scheduledStartTime, startPosition = 0 }) {
    this.initContext();

    // Auto-resume AudioContext if suspended
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }

    // CRITICAL: If audio buffer is still decoding into RAM, queue this play command!
    if (!this.audioBuffer && (!this.fallbackAudio.src || this.fallbackAudio.readyState < 2)) {
      console.log(`⏳ [AudioEngine] Track still preloading into RAM. Queued play for startPos=${startPosition.toFixed(2)}s`);
      this.pendingPlay = { scheduledStartTime, startPosition };
      return;
    }

    this.stopPlayback();

    const nowServer = Date.now() + this.clockOffset;
    const deltaMs = scheduledStartTime - nowServer;
    const deltaSec = deltaMs / 1000;

    this.scheduledStartTimeServer = scheduledStartTime;
    this.startOffsetSec = startPosition;

    console.log(`🎯 [AudioEngine] Precision Scheduled Play: lead=${deltaMs}ms | startPos=${startPosition.toFixed(2)}s`);

    if (this.audioContext && this.audioBuffer) {
      // Map server scheduled time directly to AudioContext crystal clock + calibration
      const targetAudioCtxTime = this.audioContext.currentTime + deltaSec + (this.calibrationOffsetMs / 1000);

      this.currentSource = this.audioContext.createBufferSource();
      this.currentSource.buffer = this.audioBuffer;
      this.currentSource.connect(this.gainNode);

      if (targetAudioCtxTime >= this.audioContext.currentTime) {
        // Scheduled in future: cue hardware DAC crystal clock
        this.startTimeAudioCtx = targetAudioCtxTime;
        this.currentSource.start(targetAudioCtxTime, startPosition);
      } else {
        // Arrived late or joined during playback: calculate exact sub-millisecond catch-up sample
        const lateSec = this.audioContext.currentTime - targetAudioCtxTime;
        const actualStartOffset = startPosition + lateSec;
        this.startTimeAudioCtx = this.audioContext.currentTime - lateSec;
        console.log(`⚡ [AudioEngine] Late arrival: Catching up by ${(lateSec * 1000).toFixed(1)}ms to pos ${actualStartOffset.toFixed(2)}s`);

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
      if (this.audioContext.currentTime < this.startTimeAudioCtx) {
        return this.startOffsetSec; // Still in pre-schedule countdown lead time
      }
      const elapsed = this.audioContext.currentTime - this.startTimeAudioCtx;
      return Math.max(0, Math.min(this.audioBuffer.duration, this.startOffsetSec + elapsed));
    }
    return this.fallbackAudio.currentTime || 0;
  }

  pause(position) {
    this.pendingPlay = null;
    this.stopPlayback();
    if (position !== undefined) {
      this.startOffsetSec = position;
    }
    if (this.onStateChange) {
      this.onStateChange({ isPlaying: false, currentTime: this.startOffsetSec });
    }
  }

  seek(position, isPlaying, scheduledStartTime) {
    this.pendingPlay = null;
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

    // Check phase sync every 600ms
    this.driftMonitorInterval = setInterval(() => {
      this.checkAndCorrectDrift();
    }, 600);
  }

  checkAndCorrectDrift() {
    if (!this.isPlaying || !this.currentSource || !this.audioBuffer) return;

    // 1. Guard: Never run drift checks while waiting in future lead-time window
    if (this.audioContext && this.audioContext.currentTime < this.startTimeAudioCtx) {
      return;
    }

    const currentServerTime = Date.now() + this.clockOffset;
    if (currentServerTime < this.scheduledStartTimeServer) {
      return;
    }

    // 2. Guard: Give 1.5 seconds of settling time after play begins before PLL corrections
    if ((currentServerTime - this.scheduledStartTimeServer) < 1500) {
      return;
    }

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

    // In Phase (|drift| <= 10ms) -> Perfect solid 1.0000x normal speed (Haas zone)
    if (Math.abs(driftMs) <= 10) {
      param.setValueAtTime(1.0, now);
    }
    // Subtle micro phase difference (10ms to 35ms) -> Inaudible 0.1% speed micro-tune
    else if (Math.abs(driftMs) <= 35) {
      if (driftMs > 0) {
        param.setValueAtTime(0.999, now);
      } else {
        param.setValueAtTime(1.001, now);
      }
    }
    // Moderate drift (35ms to 80ms) -> 0.5% speed micro-tune
    else if (Math.abs(driftMs) <= 80) {
      if (driftMs > 0) {
        param.setValueAtTime(0.995, now);
      } else {
        param.setValueAtTime(1.005, now);
      }
    }
    // Severe drift (> 120ms, e.g. mobile was backgrounded) -> Seamless re-alignment
    else if (Math.abs(driftMs) > 120) {
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
