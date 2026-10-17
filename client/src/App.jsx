import React, { useState, useEffect } from 'react';
import { socket, startLatencyMeasurement } from './services/socket';
import { audioEngine } from './services/audioSyncEngine';
import Header from './components/Header';
import Lobby from './components/Lobby';
import RoomView from './components/RoomView';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [latencyStats, setLatencyStats] = useState({ latencyMs: 0, offsetMs: 0, roundTripMs: 0 });
  const [lanIp, setLanIp] = useState('');
  const [toastMessage, setToastMessage] = useState(null);
  const [urlRoomCode, setUrlRoomCode] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // 1. Fetch LAN network info on mount
  useEffect(() => {
    fetch('/api/network-info')
      .then(res => res.json())
      .then(data => {
        if (data?.primaryIp) {
          setLanIp(data.primaryIp);
        }
      })
      .catch(err => {
        console.warn('Network info endpoint unreachable; defaulting to window location.', err);
      });

    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setUrlRoomCode(roomParam.toUpperCase().trim());
    }
  }, []);

  // 2. Setup Socket.IO & Playback lifecycle listeners
  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
      console.log('[Socket] Connected with ID:', socket.id);
    }

    function onDisconnect() {
      setIsConnected(false);
      console.log('[Socket] Disconnected from server');
    }

    function onParticipantJoined(data) {
      if (data?.room) {
        setCurrentRoom(data.room);
        showToast(`🎉 ${data.participant?.name || 'A new phone'} joined the session!`);
      }
    }

    function onParticipantLeft(data) {
      if (data?.room) {
        setCurrentRoom(data.room);
        showToast(`👋 ${data.participantName || 'A listener'} left the room.`);
        if (data.hostChanged && data.newHost?.socketId === socket.id) {
          setIsHost(true);
          showToast(`👑 You are now the host of this room!`);
        }
      }
    }

    function onParticipantsUpdated(data) {
      if (data?.participants) {
        setCurrentRoom(prev => prev ? { ...prev, participants: data.participants } : null);
      }
    }

    function onRoomClosed(data) {
      showToast(`⚠️ ${data?.message || 'Room was closed.'}`);
      audioEngine.pause();
      setCurrentRoom(null);
      setIsHost(false);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Playback Synchronization Events
    function onTrackChanged(data) {
      console.log('[Socket] Track changed:', data);
      if (data?.track) {
        audioEngine.loadTrack(data.track);
        setCurrentRoom(prev => prev ? { 
          ...prev, 
          state: { 
            ...prev.state, 
            currentTrack: data.track, 
            isPlaying: false, 
            currentTime: 0 
          } 
        } : null);
        showToast(`🎵 Loaded: ${data.track.title}`);
      }
    }

    function onStartScheduled(data) {
      console.log('[Socket] Playback scheduled start:', data);
      audioEngine.schedulePlay({
        scheduledStartTime: data.scheduledStartTime,
        startPosition: data.position || 0
      });

      setCurrentRoom(prev => prev ? {
        ...prev,
        state: {
          ...prev.state,
          isPlaying: true,
          scheduledStartTime: data.scheduledStartTime
        }
      } : null);
    }

    function onPaused(data) {
      console.log('[Socket] Playback paused:', data);
      audioEngine.pause(data.position);
      setCurrentRoom(prev => prev ? {
        ...prev,
        state: {
          ...prev.state,
          isPlaying: false,
          currentTime: data.position
        }
      } : null);
    }

    function onSeeked(data) {
      console.log('[Socket] Playback seeked:', data);
      audioEngine.seek(data.position, data.isPlaying, data.scheduledStartTime);
      setCurrentRoom(prev => prev ? {
        ...prev,
        state: {
          ...prev.state,
          currentTime: data.position,
          isPlaying: Boolean(data.isPlaying)
        }
      } : null);
    }

    function onPlaylistUpdated(data) {
      console.log('[Socket] Playlist updated:', data);
      if (data?.playlist) {
        setCurrentRoom(prev => prev ? { ...prev, playlist: data.playlist } : null);
        showToast('🎶 Playlist updated');
      }
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:participant_joined', onParticipantJoined);
    socket.on('room:participant_left', onParticipantLeft);
    socket.on('room:participants_updated', onParticipantsUpdated);
    socket.on('room:closed', onRoomClosed);

    socket.on('playback:track_changed', onTrackChanged);
    socket.on('playback:start_scheduled', onStartScheduled);
    socket.on('playback:paused', onPaused);
    socket.on('playback:seeked', onSeeked);
    socket.on('playback:playlist_updated', onPlaylistUpdated);

    if (socket.connected) {
      setIsConnected(true);
    }

    // High-Precision NTP Latency & Clock Synchronization Loop
    const stopLatency = startLatencyMeasurement((stats) => {
      setLatencyStats(stats);
      audioEngine.setClockOffset(stats.offsetMs);
    });

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:participant_joined', onParticipantJoined);
      socket.off('room:participant_left', onParticipantLeft);
      socket.off('room:participants_updated', onParticipantsUpdated);
      socket.off('room:closed', onRoomClosed);

      socket.off('playback:track_changed', onTrackChanged);
      socket.off('playback:start_scheduled', onStartScheduled);
      socket.off('playback:paused', onPaused);
      socket.off('playback:seeked', onSeeked);
      socket.off('playback:playlist_updated', onPlaylistUpdated);

      stopLatency();
    };
  }, []);

  // Handler: Host creates a room
  const handleCreateRoom = (roomData, callback) => {
    socket.emit('room:create', roomData, (res) => {
      if (res?.success) {
        setCurrentRoom(res.room);
        setIsHost(true);
        if (res.room.state?.currentTrack) {
          audioEngine.loadTrack(res.room.state.currentTrack);
        }
        showToast(`Room ${res.room.roomCode} created! Share the code with friends.`);
        window.history.replaceState({}, document.title, `?room=${res.room.roomCode}`);
        callback && callback(null);
      } else {
        callback && callback(res?.error || 'Failed to create room.');
      }
    });
  };

  // Handler: Participant joins a room
  const handleJoinRoom = (joinData, callback) => {
    socket.emit('room:join', joinData, (res) => {
      if (res?.success) {
        setCurrentRoom(res.room);
        setIsHost(res.isHost || false);
        if (res.room.state?.currentTrack) {
          audioEngine.loadTrack(res.room.state.currentTrack);
        }
        showToast(`Connected to room ${res.room.roomCode}!`);
        window.history.replaceState({}, document.title, `?room=${res.room.roomCode}`);
        callback && callback(null);
      } else {
        callback && callback(res?.error || 'Could not join room.');
      }
    });
  };

  // Handler: Leave room
  const handleLeaveRoom = () => {
    audioEngine.pause();
    socket.emit('room:leave', () => {
      setCurrentRoom(null);
      setIsHost(false);
      showToast('Left the room session.');
      window.history.replaceState({}, document.title, window.location.pathname);
    });
  };

  return (
    <div className="app-container">
      <Header isConnected={isConnected} lanIp={lanIp} />

      {!currentRoom ? (
        <Lobby 
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          initialRoomCode={urlRoomCode}
          isConnected={isConnected}
        />
      ) : (
        <RoomView 
          room={currentRoom}
          isHost={isHost}
          currentSocketId={socket.id}
          latencyStats={latencyStats}
          onLeaveRoom={handleLeaveRoom}
          lanIp={lanIp}
        />
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="toast-notice" id="toast-notification">
          <CheckCircle2 size={16} color="#00f5d4" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
