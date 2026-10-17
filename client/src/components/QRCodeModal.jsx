import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Check, QrCode, Smartphone } from 'lucide-react';

export default function QRCodeModal({ isOpen, onClose, roomCode, lanIp }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  // Construct mobile URL: If deployed on cloud (Render/Railway), use public HTTPS origin directly.
  // Otherwise prioritize local Wi-Fi IP for local testing.
  const isCloudHosted = typeof window !== 'undefined' && 
    window.location.hostname !== 'localhost' && 
    window.location.hostname !== '127.0.0.1';

  const hostname = isCloudHosted 
    ? window.location.hostname 
    : ((lanIp && lanIp !== 'localhost') ? lanIp : window.location.hostname);
    
  const port = (window.location.port && !isCloudHosted) ? `:${window.location.port}` : '';
  const joinUrl = `${window.location.protocol}//${hostname}${port}/?room=${roomCode}`;

  useEffect(() => {
    if (isOpen && roomCode) {
      QRCode.toDataURL(joinUrl, {
        width: 260,
        margin: 2,
        color: {
          dark: '#070a13',
          light: '#ffffff'
        }
      })
      .then(url => setQrDataUrl(url))
      .catch(err => console.error('Error generating QR code:', err));
    }
  }, [isOpen, roomCode, joinUrl]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose} id="qr-modal-overlay">
      <div className="modal-content" onClick={(e) => e.stopPropagation()} id="qr-modal-content">
        <button 
          className="modal-close-btn" 
          onClick={onClose} 
          aria-label="Close modal"
          id="btn-close-qr-modal"
        >
          <X size={20} />
        </button>

        <div style={{ display: 'inline-flex', padding: '0.5rem', borderRadius: '12px', background: 'rgba(0, 245, 212, 0.1)', color: '#00f5d4', marginBottom: '0.75rem' }}>
          <QrCode size={28} />
        </div>

        <h3>Scan to Join BeatSync</h3>
        <p className="qr-instructions">
          Point your phone camera at this QR code to join room <strong>{roomCode}</strong> instantly.
        </p>

        <div className="qr-code-wrapper">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={`QR Code for room ${roomCode}`} />
          ) : (
            <div style={{ width: 240, height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
              Generating QR Code...
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', color: '#94a3b8', fontSize: '0.8rem', marginBottom: '1rem' }}>
          <Smartphone size={14} />
          <span>Make sure phone is connected to the same Wi-Fi network</span>
        </div>

        <div className="qr-link-copy">
          <input 
            type="text" 
            readOnly 
            value={joinUrl} 
            className="qr-link-input"
            id="input-qr-link"
          />
          <button 
            className="btn-icon" 
            onClick={handleCopy} 
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}
            id="btn-copy-qr-link"
          >
            {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
