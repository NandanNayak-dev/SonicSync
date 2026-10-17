import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Sliders, 
  Zap, 
  Sparkles, 
  Music2, 
  ShieldCheck, 
  Smartphone,
  RotateCcw
} from 'lucide-react';
import { audioEngine } from '../services/audioSyncEngine';
import { socket } from '../services/socket';

export default function AudioPlayer({ 
  currentTrack, 
  isHost, 
  roomCode, 
  roomState 
}) {
  const [isPlaying, setIsPlaying] = useState(roomState?.isPlaying || false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(30);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [driftMs, setDriftMs] = useState(0);
  const [calibrationMs, setCalibrationMs] = useState(0);
  const [showCalibration, setShowCalibration] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(audioEngine.isUnlocked);
  const [isBufferReady, setIsBufferReady] = useState(false);

  const visualizerCanvasRef = useRef(null);
  const animFrameId = useRef(null);

  // 1. Listen to engine state updates
  useEffect(() => {
    audioEngine.onStateChange = ({ isPlaying: playing, currentTime: time }) => {
      setIsPlaying(playing);
      if (time !== undefined) setCurrentTime(time);
    };

    audioEngine.onDriftUpdate = (drift) => {
      setDriftMs(drift);
    };

    audioEngine.onBufferProgress = (percent, ready) => {
      setIsBufferReady(ready);
      if (ready) {
        socket.emit('playback:buffer_ready', { audioBuffered: true });
      }
    };

    // Sync current timeline directly from high-precision Web Audio clock
    const timeInterval = setInterval(() => {
      if (audioEngine.isPlaying) {
        setCurrentTime(audioEngine.getCurrentPlaybackTime());
      }
    }, 200);

    return () => {
      clearInterval(timeInterval);
    };
  }, []);

  // 2. Load track into Web Audio RAM buffer whenever currentTrack changes
  useEffect(() => {
    if (currentTrack) {
      if (currentTrack.duration) setDuration(currentTrack.duration);
      audioEngine.loadTrack(currentTrack).then(() => {
        if (audioEngine.audioBuffer) {
          setDuration(audioEngine.audioBuffer.duration);
        }
      });
    }
  }, [currentTrack]);

  // 3. Animated Audio Visualizer loop
  useEffect(() => {
    const canvas = visualizerCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const renderVisualizer = () => {
      const data = audioEngine.getFrequencyData();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const numBars = 24;
      const barWidth = (canvas.width / numBars) - 2;

      for (let i = 0; i < numBars; i++) {
        // Fallback subtle rhythm bounce if paused/unbuffered
        let val = data[i] || 0;
        if (!isPlaying) val = Math.sin((Date.now() / 400) + (i * 0.3)) * 8 + 12;

        const barHeight = Math.max(4, (val / 255) * canvas.height * 0.95);
        const x = i * (barWidth + 2);
        const y = canvas.height - barHeight;

        // Gradient coloring
        const grad = ctx.createLinearGradient(0, y, 0, canvas.height);
        grad.addColorStop(0, '#00f5d4');
        grad.addColorStop(0.6, '#7928ca');
        grad.addColorStop(1, '#ff007a');

        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barWidth, barHeight);
      }

      animFrameId.current = requestAnimationFrame(renderVisualizer);
    };

    animFrameId.current = requestAnimationFrame(renderVisualizer);

    return () => {
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
    };
  }, [isPlaying]);

  // Handle Play/Pause
  const togglePlay = () => {
    if (!isHost) return;

    if (!isUnlocked) {
      audioEngine.unlockAudio().then(() => setIsUnlocked(true));
    }

    if (isPlaying) {
      socket.emit('playback:pause', { position: currentTime });
    } else {
      socket.emit('playback:play', { position: currentTime });
    }
  };

  // Handle Seek
  const handleSeek = (e) => {
    if (!isHost) return;
    const newPos = parseFloat(e.target.value);
    setCurrentTime(newPos);
    socket.emit('playback:seek', { position: newPos });
  };

  // Handle Mobile Unlock button click
  const handleUnlockClick = async () => {
    await audioEngine.unlockAudio();
    setIsUnlocked(true);
    socket.emit('playback:buffer_ready', { audioBuffered: true });
  };

  // Handle Volume change
  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    audioEngine.setVolume(val);
    setIsMuted(val === 0);
  };

  const toggleMute = () => {
    if (isMuted) {
      audioEngine.setVolume(volume || 0.8);
      setIsMuted(false);
    } else {
      audioEngine.setVolume(0);
      setIsMuted(true);
    }
  };

  // Handle Calibration change
  const handleCalibrationChange = (e) => {
    const val = parseInt(e.target.value, 10);
    setCalibrationMs(val);
    audioEngine.setCalibrationOffset(val);
    socket.emit('playback:set_calibration', { calibrationMs: val });
  };

  // Format MM:SS
  const formatTime = (secs) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="audio-player-card" id="audio-player">
      {/* Mobile Audio Permission Banner */}
      {!isUnlocked && (
        <div className="audio-unlock-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Smartphone size={20} color="#00f5d4" />
            <div>
              <strong>Tap to Enable Mobile Speaker</strong>
              <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>
                Enables mobile audio hardware autoplay and activates Screen WakeLock.
              </div>
            </div>
          </div>
          <button 
            className="btn btn-primary" 
            style={{ width: 'auto', padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
            onClick={handleUnlockClick}
            id="btn-unlock-audio"
          >
            🔊 Unlock Speaker
          </button>
        </div>
      )}

      {/* Track Info & Visualizer Header */}
      <div className="player-top">
        <div className="track-info">
          <div className="track-disc-icon">
            <Music2 size={24} color="#00f5d4" className={isPlaying ? 'spinning-disc' : ''} />
          </div>
          <div>
            <h3 className="track-title">{currentTrack?.title || 'No Track Selected'}</h3>
            <p className="track-artist">{currentTrack?.artist || 'BeatSync Audio Mesh'}</p>
          </div>
        </div>

        {/* Live Drift Monitor Badge */}
        <div className="drift-badge-container">
          <div 
            className={`sync-drift-pill ${Math.abs(driftMs) <= 25 ? 'synced' : 'adjusting'}`}
            title="Real-time timeline alignment with master server clock"
          >
            <Zap size={13} />
            <span>
              {Math.abs(driftMs) <= 20 ? '⚡ 100% In Sync' : `Drift: ${driftMs > 0 ? `+${driftMs}` : driftMs}ms`}
            </span>
          </div>

          <button 
            className="btn-icon" 
            onClick={() => setShowCalibration(!showCalibration)}
            title="Adjust phone speaker latency calibration"
            id="btn-toggle-calibration"
          >
            <Sliders size={14} />
            <span style={{ fontSize: '0.75rem' }}>Tune</span>
          </button>
        </div>
      </div>

      {/* Visualizer Canvas */}
      <div className="visualizer-wrapper">
        <canvas ref={visualizerCanvasRef} width={500} height={48} className="visualizer-canvas" />
      </div>

      {/* Timeline Scrubber */}
      <div className="timeline-container">
        <input 
          type="range"
          min={0}
          max={duration || 30}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          disabled={!isHost}
          className="timeline-slider"
          id="playback-timeline-slider"
          style={{
            background: `linear-gradient(to right, #00f5d4 0%, #7928ca ${(currentTime / (duration || 30)) * 100}%, rgba(255,255,255,0.1) ${(currentTime / (duration || 30)) * 100}%)`
          }}
        />
        <div className="time-display">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Master Controls */}
      <div className="player-controls">
        {/* Left: Volume */}
        <div className="volume-control">
          <button onClick={toggleMute} className="vol-btn" id="btn-toggle-mute">
            {isMuted || volume === 0 ? <VolumeX size={18} color="#f43f5e" /> : <Volume2 size={18} color="#00f5d4" />}
          </button>
          <input 
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="vol-slider"
            id="slider-volume"
          />
        </div>

        {/* Center: Play/Pause button */}
        <div className="play-center">
          {isHost ? (
            <button 
              className={`main-play-btn ${isPlaying ? 'is-playing' : ''}`}
              onClick={togglePlay}
              id="btn-master-play"
              title={isPlaying ? 'Pause across all phones' : 'Play across all phones'}
            >
              {isPlaying ? <Pause size={28} /> : <Play size={28} style={{ marginLeft: '4px' }} />}
            </button>
          ) : (
            <div className="listener-play-indicator">
              <span className="live-dot" />
              <span>{isPlaying ? 'Host Playing • Synchronized' : 'Paused by Host'}</span>
            </div>
          )}
        </div>

        {/* Right: Buffer status */}
        <div className="buffer-status">
          <span className={`buffer-dot ${isBufferReady ? 'ready' : 'loading'}`} />
          <span>{isBufferReady ? 'Buffer Primed' : 'Buffering...'}</span>
        </div>
      </div>

      {/* Per-Device Calibration Slider (Expandable) */}
      {showCalibration && (
        <div className="calibration-panel" id="calibration-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#00f5d4' }}>
              🎧 Phone Speaker Hardware Delay Calibration
            </span>
            <button 
              onClick={() => handleCalibrationChange({ target: { value: 0 } })} 
              className="btn-icon" 
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
            >
              <RotateCcw size={11} /> Reset
            </button>
          </div>
          <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
            Compensate for your phone's internal DAC audio delay (e.g. if using Bluetooth speakers or older hardware):
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>-100ms</span>
            <input 
              type="range"
              min={-100}
              max={100}
              step={5}
              value={calibrationMs}
              onChange={handleCalibrationChange}
              style={{ flex: 1 }}
              id="slider-calibration"
            />
            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>+100ms</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '700', color: '#00f5d4', minWidth: '45px', textAlign: 'right' }}>
              {calibrationMs > 0 ? `+${calibrationMs}` : calibrationMs}ms
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
