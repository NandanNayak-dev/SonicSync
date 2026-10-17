import React, { useState, useEffect } from 'react';
import { PlusCircle, LogIn, Sparkles, Smartphone, ShieldCheck } from 'lucide-react';
import { detectDeviceType } from '../services/socket';

export default function Lobby({ onCreateRoom, onJoinRoom, initialRoomCode, isConnected }) {
  const defaultDevice = detectDeviceType();

  // Host form state
  const [hostName, setHostName] = useState('Host');
  const [roomName, setRoomName] = useState('Roadtrip Sound System');
  const [hostDevice, setHostDevice] = useState(defaultDevice);

  // Join form state
  const [joinCode, setJoinCode] = useState(initialRoomCode || '');
  const [listenerName, setListenerName] = useState('');
  const [listenerDevice, setListenerDevice] = useState(defaultDevice);

  const [loadingAction, setLoadingAction] = useState(null); // 'create' | 'join'
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (initialRoomCode) {
      setJoinCode(initialRoomCode.toUpperCase().trim());
    }
  }, [initialRoomCode]);

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    setErrorMessage('');
    if (!hostName.trim()) {
      setErrorMessage('Please enter your name as the Host.');
      return;
    }
    setLoadingAction('create');
    onCreateRoom({
      roomName: roomName.trim() || 'BeatSync Session',
      userName: hostName.trim(),
      device: hostDevice
    }, (err) => {
      setLoadingAction(null);
      if (err) setErrorMessage(err);
    });
  };

  const handleJoinSubmit = (e) => {
    e.preventDefault();
    setErrorMessage('');
    if (!joinCode.trim()) {
      setErrorMessage('Please enter the 6-character Room Code.');
      return;
    }
    setLoadingAction('join');
    onJoinRoom({
      roomCode: joinCode.trim().toUpperCase(),
      userName: listenerName.trim() || `Listener`,
      device: listenerDevice
    }, (err) => {
      setLoadingAction(null);
      if (err) setErrorMessage(err);
    });
  };

  return (
    <div style={{ width: '100%' }}>
      {/* Hero Header */}
      <section className="hero-section">
        <div className="hero-pill">
          <Sparkles size={14} />
          <span>Phase 1 — Room System & Real-Time Mesh</span>
        </div>
        <h2 className="hero-title">
          Turn your phones into <br />
          <span className="gradient-text">One Unified Speaker System.</span>
        </h2>
        <p className="hero-subtitle">
          No external speaker? No problem. Connect multiple mobile devices to play the same audio timeline in unison.
        </p>
      </section>

      {/* Error banner */}
      {errorMessage && (
        <div style={{
          background: 'rgba(244, 63, 94, 0.15)',
          border: '1px solid rgba(244, 63, 94, 0.4)',
          color: '#f43f5e',
          padding: '0.85rem 1.25rem',
          borderRadius: '12px',
          marginBottom: '1.5rem',
          fontSize: '0.9rem',
          textAlign: 'center'
        }}>
          {errorMessage}
        </div>
      )}

      {/* Lobby Choice Grid */}
      <div className="lobby-grid">
        {/* Host Card */}
        <div className="lobby-card card-host">
          <div>
            <div className="card-header-icon">
              <PlusCircle size={26} />
            </div>
            <h3 className="card-title">Create a Room</h3>
            <p className="card-desc">
              Be the host, upload the song, and generate a QR code for your friends to join.
            </p>

            <form onSubmit={handleCreateSubmit} id="form-create-room">
              <div className="form-group">
                <label className="form-label" htmlFor="input-host-name">Host Name</label>
                <input 
                  id="input-host-name"
                  type="text" 
                  className="input-field" 
                  placeholder="e.g. Nandan" 
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="input-room-name">Room / Session Name</label>
                <input 
                  id="input-room-name"
                  type="text" 
                  className="input-field" 
                  placeholder="e.g. Camping Soundbox" 
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="select-host-device">Your Device</label>
                <input 
                  id="select-host-device"
                  type="text" 
                  className="input-field" 
                  value={hostDevice}
                  onChange={(e) => setHostDevice(e.target.value)}
                  placeholder="Device model"
                />
              </div>

              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={!isConnected || loadingAction === 'create'}
                id="btn-create-room"
              >
                {loadingAction === 'create' ? 'Creating Room...' : 'Start New Session'}
              </button>
            </form>
          </div>
        </div>

        {/* Join Card */}
        <div className="lobby-card card-join" style={initialRoomCode ? { borderColor: 'var(--accent-purple)', boxShadow: '0 0 25px var(--accent-purple-glow)' } : {}}>
          <div>
            <div className="card-header-icon">
              <LogIn size={26} />
            </div>
            <h3 className="card-title">Join Existing Room</h3>
            <p className="card-desc">
              Enter a 6-digit room code or join directly via friend's QR code.
            </p>

            <form onSubmit={handleJoinSubmit} id="form-join-room">
              <div className="form-group">
                <label className="form-label" htmlFor="input-join-code">Room Code</label>
                <input 
                  id="input-join-code"
                  type="text" 
                  className="input-field input-code" 
                  placeholder="SYNC99" 
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="input-listener-name">Your Display Name</label>
                <input 
                  id="input-listener-name"
                  type="text" 
                  className="input-field" 
                  placeholder="e.g. Alex's iPhone" 
                  value={listenerName}
                  onChange={(e) => setListenerName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="select-listener-device">Your Device</label>
                <input 
                  id="select-listener-device"
                  type="text" 
                  className="input-field" 
                  value={listenerDevice}
                  onChange={(e) => setListenerDevice(e.target.value)}
                  placeholder="Device model"
                />
              </div>

              <button 
                type="submit" 
                className="btn btn-purple"
                disabled={!isConnected || loadingAction === 'join'}
                id="btn-join-room"
              >
                {loadingAction === 'join' ? 'Connecting to Room...' : 'Join as Speaker Node'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
