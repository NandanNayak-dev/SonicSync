import React, { useState } from 'react';
import { X, UploadCloud, Music, CheckCircle2, AlertCircle } from 'lucide-react';
import { socket } from '../services/socket';

export default function UploadModal({ isOpen, onClose, roomCode }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setError('');
      // Auto-extract title from file name
      const cleanTitle = file.name.replace(/\.[^/.]+$/, "");
      if (!title) setTitle(cleanTitle);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please select an audio file (MP3, WAV, M4A).');
      return;
    }

    setIsUploading(true);
    setError('');

    const formData = new FormData();
    formData.append('audio', selectedFile);
    formData.append('title', title.trim() || selectedFile.name);
    formData.append('artist', artist.trim() || 'Custom Upload');
    if (roomCode) formData.append('roomCode', roomCode);

    try {
      const res = await fetch('/api/upload-audio', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Upload failed');
      }

      setSuccess('Audio uploaded! Adding to room queue...');

      // Notify room via socket so all phones immediately update their queue
      socket.emit('playback:add_track', { track: data.track });

      setTimeout(() => {
        setIsUploading(false);
        setSuccess('');
        setSelectedFile(null);
        setTitle('');
        setArtist('');
        onClose();
      }, 1200);

    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message || 'Failed to upload audio.');
      setIsUploading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} id="upload-modal-overlay">
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '460px' }}>
        <button className="modal-close-btn" onClick={onClose} id="btn-close-upload-modal">
          <X size={20} />
        </button>

        <div style={{ display: 'inline-flex', padding: '0.6rem', borderRadius: '12px', background: 'rgba(0, 245, 212, 0.1)', color: '#00f5d4', marginBottom: '0.75rem' }}>
          <UploadCloud size={28} />
        </div>

        <h3>Upload Audio Track</h3>
        <p className="qr-instructions">
          Upload an MP3 or WAV file. It will be streamed and synchronized to every connected phone in room <strong>{roomCode}</strong>.
        </p>

        {error && (
          <div style={{ background: 'rgba(244,63,94,0.15)', color: '#f43f5e', padding: '0.5rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', padding: '0.5rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {success}
          </div>
        )}

        <form onSubmit={handleUpload}>
          <div className="upload-dropzone" onClick={() => document.getElementById('audio-file-input').click()}>
            <input 
              id="audio-file-input"
              type="file" 
              accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg" 
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <Music size={32} color="#00f5d4" style={{ marginBottom: '0.5rem' }} />
            <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>
              {selectedFile ? selectedFile.name : 'Tap to select MP3 / WAV audio file'}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
              {selectedFile ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB` : 'Max 25 MB • MP3, WAV, M4A'}
            </div>
          </div>

          <div className="form-group" style={{ textAlign: 'left', marginTop: '1rem' }}>
            <label className="form-label" htmlFor="input-track-title">Song Title</label>
            <input 
              id="input-track-title"
              type="text" 
              className="input-field" 
              placeholder="e.g. Summer Anthem"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ textAlign: 'left' }}>
            <label className="form-label" htmlFor="input-track-artist">Artist / Credit</label>
            <input 
              id="input-track-artist"
              type="text" 
              className="input-field" 
              placeholder="e.g. My Band / Artist"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={!selectedFile || isUploading}
            id="btn-submit-upload"
          >
            {isUploading ? 'Uploading & Buffering...' : 'Upload to Sonic Cluster'}
          </button>
        </form>
      </div>
    </div>
  );
}
