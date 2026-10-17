import React from 'react';
import { Music, Play, ListMusic, PlusCircle, Check } from 'lucide-react';
import { socket } from '../services/socket';

export default function PlaylistQueue({ 
  playlist = [], 
  currentTrack, 
  isHost, 
  onOpenUploadModal 
}) {
  const handleSelectTrack = (track) => {
    if (!isHost) return;
    socket.emit('playback:load_track', { track });
  };

  return (
    <div className="playlist-card" id="playlist-queue">
      <div className="section-header" style={{ marginBottom: '0.85rem' }}>
        <h3 className="section-title">
          <ListMusic size={18} color="#00f5d4" />
          <span>Synchronized Queue</span>
          <span className="count-pill">{playlist.length} track{playlist.length > 1 ? 's' : ''}</span>
        </h3>

        <button 
          className="btn-icon" 
          onClick={onOpenUploadModal}
          id="btn-open-upload-modal"
          style={{ borderColor: 'rgba(0, 245, 212, 0.3)', color: '#00f5d4' }}
        >
          <PlusCircle size={15} />
          <span>Upload Song</span>
        </button>
      </div>

      <div className="tracks-list">
        {playlist.map((track, idx) => {
          const isCurrent = currentTrack?.id === track.id || currentTrack?.url === track.url;

          return (
            <div 
              key={track.id || idx}
              className={`track-item ${isCurrent ? 'track-active' : ''}`}
              onClick={() => isHost && handleSelectTrack(track)}
              style={{ cursor: isHost ? 'pointer' : 'default' }}
              title={isHost ? 'Click to load track across all phones' : ''}
              id={`track-item-${idx}`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div className={`track-index-pill ${isCurrent ? 'active' : ''}`}>
                  {isCurrent ? <Play size={12} fill="#070a13" /> : (idx + 1)}
                </div>
                <div>
                  <div className="track-row-title">
                    {track.title}
                    {track.isPreset && (
                      <span className="preset-tag">Preset</span>
                    )}
                  </div>
                  <div className="track-row-artist">{track.artist || 'BeatSync Audio'}</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                {isCurrent && (
                  <span style={{ fontSize: '0.72rem', color: '#00f5d4', fontWeight: '700' }}>
                    Now Playing
                  </span>
                )}
                {isHost && !isCurrent && (
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    Play Next &rarr;
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
