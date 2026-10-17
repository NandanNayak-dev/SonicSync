import React from 'react';
import { Radio, Wifi } from 'lucide-react';

export default function Header({ isConnected, lanIp }) {
  return (
    <header className="app-header" id="main-header">
      <div className="brand-wrapper">
        <div className="brand-icon">
          <Radio size={22} color="#070a13" />
        </div>
        <div className="brand-text">
          <h1>
            BeatSync
            <div className="eq-bars">
              <span className="eq-bar" />
              <span className="eq-bar" />
              <span className="eq-bar" />
              <span className="eq-bar" />
            </div>
          </h1>
          <div className="brand-tagline">Your Phones. One Beat.</div>
        </div>
      </div>

      <div className="header-meta">
        {lanIp && lanIp !== 'localhost' && (
          <div 
            style={{ 
              display: 'none', 
              fontSize: '0.75rem', 
              color: '#94a3b8', 
              background: 'rgba(255,255,255,0.05)', 
              padding: '0.3rem 0.6rem', 
              borderRadius: '6px',
              fontFamily: 'var(--font-mono)'
            }}
            className="d-md-block"
            title="Local Wi-Fi Network IP"
          >
            Wi-Fi: {lanIp}
          </div>
        )}

        <div className="live-pill" style={!isConnected ? { background: 'rgba(244, 63, 94, 0.15)', borderColor: 'rgba(244, 63, 94, 0.3)', color: '#f43f5e' } : {}}>
          <span className="live-dot" style={!isConnected ? { background: '#f43f5e', boxShadow: 'none' } : {}} />
          <span>{isConnected ? 'Socket Online' : 'Connecting...'}</span>
        </div>
      </div>
    </header>
  );
}
