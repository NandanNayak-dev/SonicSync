import React, { useState } from 'react';
import { 
  Users, 
  QrCode, 
  Copy, 
  Check, 
  LogOut, 
  Music, 
  Activity, 
  Radio, 
  Sparkles, 
  Share2, 
  Volume2
} from 'lucide-react';
import ParticipantCard from './ParticipantCard';
import QRCodeModal from './QRCodeModal';

export default function RoomView({ 
  room, 
  isHost, 
  currentSocketId, 
  latencyStats, 
  onLeaveRoom, 
  lanIp 
}) {
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const participants = room?.participants || [];
  const roomCode = room?.roomCode || '';
  const roomName = room?.roomName || 'SonicSync Room';

  const isCloudHosted = typeof window !== 'undefined' && 
    window.location.hostname !== 'localhost' && 
    window.location.hostname !== '127.0.0.1';

  const hostname = isCloudHosted 
    ? window.location.hostname 
    : ((lanIp && lanIp !== 'localhost') ? lanIp : window.location.hostname);
    
  const port = (window.location.port && !isCloudHosted) ? `:${window.location.port}` : '';
  const shareUrl = `${window.location.protocol}//${hostname}${port}/?room=${roomCode}`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="room-view-container" id="room-view-container">
      {/* Top Session Card */}
      <div className="room-header-card">
        <div className="room-top-bar">
          <div className="room-badge-group">
            <span className={`role-badge ${isHost ? 'host' : 'listener'}`}>
              {isHost ? '👑 Host Controller' : '🎧 Speaker Node'}
            </span>
            <div className="live-pill">
              <span className="live-dot" />
              <span>Mesh Synchronized</span>
            </div>
          </div>

          <button 
            className="btn-icon btn-danger" 
            onClick={onLeaveRoom}
            id="btn-leave-room"
            title="Leave current room"
          >
            <LogOut size={15} />
            <span>Leave Session</span>
          </button>
        </div>

        <div className="room-title-area">
          <h2>{roomName}</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
            {isHost ? 'You are leading this session. Friends can join with your QR code or Room Code.' : 'Connected as a synchronized speaker node in this cluster.'}
          </p>
        </div>

        {/* Code & Share Bar */}
        <div className="room-code-badge-container">
          <div className="code-pill" title="6-character Room Code">
            <span>{roomCode}</span>
            <button 
              onClick={handleCopyCode} 
              style={{ background: 'transparent', color: '#00f5d4', padding: '2px' }}
              title="Copy code"
              id="btn-copy-code"
            >
              {copiedCode ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
            </button>
          </div>

          <button 
            className="btn-icon" 
            onClick={() => setIsQrOpen(true)}
            id="btn-open-qr-modal"
          >
            <QrCode size={16} color="#00f5d4" />
            <span>Show QR Code</span>
          </button>

          <button 
            className="btn-icon" 
            onClick={handleCopyLink}
            id="btn-copy-share-link"
          >
            {copiedLink ? <Check size={16} color="#10b981" /> : <Share2 size={16} />}
            <span>{copiedLink ? 'Link Copied!' : 'Copy Invite Link'}</span>
          </button>
        </div>
      </div>

      {/* Real-time Telemetry & Sync Health */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '0.85rem'
      }}>
        <div className="participant-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'rgba(0, 245, 212, 0.1)', padding: '0.5rem', borderRadius: '8px', color: '#00f5d4' }}>
              <Users size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Connected Speakers</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '700' }}>{participants.length} Phone{participants.length > 1 ? 's' : ''}</div>
            </div>
          </div>
        </div>

        <div className="participant-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'rgba(121, 40, 202, 0.15)', padding: '0.5rem', borderRadius: '8px', color: '#a855f7' }}>
              <Activity size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Network Ping / RTT</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '700', fontFamily: 'var(--font-mono)', color: '#10b981' }}>
                {latencyStats?.latencyMs || 0} ms
              </div>
            </div>
          </div>
        </div>

        <div className="participant-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'rgba(255, 184, 0, 0.15)', padding: '0.5rem', borderRadius: '8px', color: '#ffb800' }}>
              <Radio size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>NTP Clock Sync Offset</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>
                {latencyStats?.offsetMs > 0 ? `+${latencyStats.offsetMs}` : (latencyStats?.offsetMs || 0)} ms
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Connected Participants Section */}
      <div>
        <div className="section-header">
          <h3 className="section-title">
            <Users size={18} color="#00f5d4" />
            <span>Active Speaker Cluster</span>
            <span className="count-pill">{participants.length} online</span>
          </h3>
        </div>

        <div className="participants-grid">
          {participants.map((p) => (
            <ParticipantCard 
              key={p.socketId} 
              participant={p} 
              currentSocketId={currentSocketId} 
            />
          ))}
        </div>
      </div>

      {/* Phase 2 Feature Preview */}
      <div className="phase-preview-card">
        <div className="preview-icon">
          🎵
        </div>
        <div className="preview-text">
          <h4>Phase 1 Milestone Complete: Real-Time Room & Socket Mesh</h4>
          <p>
            Your phones are connected to the central Socket.IO room hub with millisecond latency telemetry.
            In <strong>Phase 2</strong>, we will implement audio upload and synchronized local audio caching so every phone streams the exact same track!
          </p>
        </div>
      </div>

      {/* QR Code Modal */}
      <QRCodeModal 
        isOpen={isQrOpen} 
        onClose={() => setIsQrOpen(false)} 
        roomCode={roomCode}
        lanIp={lanIp}
      />
    </div>
  );
}
