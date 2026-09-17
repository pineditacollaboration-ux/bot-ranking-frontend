import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { API_CONFIG } from '../config/api';
import './Home.css';

const Home = () => {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const sRes = await axios.get(API_CONFIG.ENDPOINTS.API.STATS);
        setStats(sRes.data);
      } catch (_) {}
    };
    fetchData();
    const iv = setInterval(fetchData, 20000); // Sincronizado en tiempo real (20s)
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="home-wrapper">
      <div className="home-container">
        
        {/* Left Side */}
        <div className="hero-content">
          <div className="hero-subtitle">
            <span className="hero-line"></span>
            RANKED DE FREE FIRE
          </div>
          
          <h1 className="hero-title">
            <span className="text-white">ROYAL </span>
            <span className="text-gradient">RANKED</span>
          </h1>
          
          <p className="hero-desc">
            HECHO CON MUCHO AMOR PARA TODA LA COMUNIDAD DE ROYAL.
          </p>

          <div className="hero-actions">
            <a href="https://discord.gg/zscGKBdfGA" target="_blank" rel="noreferrer" className="btn-skewed btn-red">
              <span className="btn-skewed-content">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
                ENTRA A NUESTRO DISCORD
              </span>
            </a>
            
            <Link to="/ranking" className="btn-skewed btn-dark">
              <span className="btn-skewed-content">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
              </span>
            </Link>
          </div>

          <div className="home-bot-stats">
             <div className="hbs-item">
                <span className="hbs-val">{stats ? stats.totalPlayers.toLocaleString() : '—'}</span>
                <span className="hbs-key">JUGADORES</span>
             </div>
             <div className="hbs-item">
                <span className="hbs-val">{stats ? stats.totalMatches.toLocaleString() : '—'}</span>
                <span className="hbs-key">PARTIDAS JUGADAS</span>
             </div>
             <div className="hbs-item">
                <span className="hbs-val" style={{ color: stats?.botOnline ? '#00e06a' : '#ff4444', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                    background: stats?.botOnline ? '#00e06a' : '#ff4444',
                    boxShadow: stats?.botOnline ? '0 0 8px #00e06a' : '0 0 8px #ff4444',
                    animation: 'pulse-dot 2s ease-in-out infinite'
                  }}/>
                  {stats?.botOnline ? 'ONLINE' : 'OFFLINE'}
                </span>
                <span className="hbs-key">ESTADO DEL BOT</span>
             </div>
          </div>
        </div>

        {/* Right Side Image */}
        <div className="hero-media">
           <div className="media-placeholder">
             <img src="/fondo.png?v=3" alt="Shadow Hero" />
           </div>
        </div>

      </div>
    </div>
  );
};

export default Home;
