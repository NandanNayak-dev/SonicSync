import React from 'react';
import { Crown, Smartphone, Monitor, Volume2, Wifi } from 'lucide-react';

export default function ParticipantCard({ participant, currentSocketId }) {
  const isMe = participant.socketId === currentSocketId;
  const isHost = participant.isHost;
  const latency = participant.latencyMs || 0;

  // Determine latency color tier
  let latencyClass = 'latency-good';
  let latencyText = `${latency}ms`;
  if (latency > 80) {
    latencyClass = 'latency-poor';
  } else if (latency > 35) {
    latencyClass = 'latency-fair';
  }

  // Device icon
  const isMobile = /phone|android|ipad/i.test(participant.device);

  return (
    <div 
      className={`participant-card ${isMe ? 'is-current-user' : ''}`}
      id={`participant-${participant.socketId}`}
    >
      <div className="participant-left">
        <div className={`avatar-circle ${isHost ? 'host-avatar' : ''}`}>
          {isHost ? '👑' : (participant.name ? participant.name.charAt(0).toUpperCase() : 'U')}
        </div>
        <div className="participant-info">
          <h4>
            {participant.name}
            {isMe && <span style={{ fontSize: '0.72rem', color: '#00f5d4', fontWeight: 'normal' }}>(You)</span>}
            {isHost && (
              <span style={{ fontSize: '0.7rem', color: '#ffb800', background: 'rgba(255, 184, 0, 0.15)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                Host
              </span>
            )}
          </h4>
          <div className="device-label">
            {isMobile ? <Smartphone size={12} /> : <Monitor size={12} />}
            <span>{participant.device || 'Mobile Device'}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div className={`latency-badge ${latencyClass}`} title={`Round-trip network latency: ${latency}ms`}>
          <Wifi size={11} />
          <span>{latencyText}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '0.25rem', borderRadius: '6px' }} title="Speaker Node Active">
          <Volume2 size={15} />
        </div>
      </div>
    </div>
  );
}
