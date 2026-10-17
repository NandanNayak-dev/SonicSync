import React, { useState, useEffect } from 'react';
import { socket, startLatencyMeasurement } from './services/socket';
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

  // Show auto-dismissing toast notifications
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // 1. Fetch LAN network info on mount for multi-phone QR connection
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

    // Check if URL has ?room=CODE from a QR scan or link
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setUrlRoomCode(roomParam.toUpperCase().trim());
    }
  }, []);

  // 2. Setup Socket.IO lifecycle listeners
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
      console.log('[Socket] Participant joined:', data);
      if (data?.room) {
        setCurrentRoom(data.room);
        showToast(`🎉 ${data.participant?.name || 'A new phone'} joined the session!`);
      }
    }

    function onParticipantLeft(data) {
      console.log('[Socket] Participant left:', data);
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
      setCurrentRoom(null);
      setIsHost(false);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:participant_joined', onParticipantJoined);
    socket.on('room:participant_left', onParticipantLeft);
    socket.on('room:participants_updated', onParticipantsUpdated);
    socket.on('room:closed', onRoomClosed);

    if (socket.connected) {
      setIsConnected(true);
    }

    // Start NTP latency measurement
    const stopLatency = startLatencyMeasurement((stats) => {
      setLatencyStats(stats);
    });

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:participant_joined', onParticipantJoined);
      socket.off('room:participant_left', onParticipantLeft);
      socket.off('room:participants_updated', onParticipantsUpdated);
      socket.off('room:closed', onRoomClosed);
      stopLatency();
    };
  }, []);

  // Handler: Host creates a room
  const handleCreateRoom = (roomData, callback) => {
    socket.emit('room:create', roomData, (res) => {
      if (res?.success) {
        setCurrentRoom(res.room);
        setIsHost(true);
        showToast(`Room ${res.room.roomCode} created! Share the code with friends.`);
        // Update URL query param cleanly without reload
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
