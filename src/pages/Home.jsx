import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import './Home.css';

const getAvatarUrl = (discordId, avatarHash) => {
  if (!avatarHash || avatarHash === 'null' || avatarHash === 'undefined') {
    try {
      const idx = discordId ? (BigInt(discordId) >> 22n) % 6n : 0n;
      return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
    } catch { return `https://cdn.discordapp.com/embed/avatars/0.png`; }
  }
  if (avatarHash.startsWith('http')) return avatarHash;
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.png`;
};

const Home = () => {
  const { user } = useAuth();
  const [stats, setStats]   = useState(null);
  const [top3, setTop3]     = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const sRes = await axios.get(API_CONFIG.ENDPOINTS.API.STATS);
        setStats(sRes.data);
      } catch (_) {}
    };
    fetchData();
    const iv = setInterval(fetchData, 20000);
    return () => clearInterval(iv);
  }, []);

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="home-page-real">
      <div className="home-hero-real">

        {/* ── LEFT ── */}
        <div className="hhr-left">
          <div className="hhr-subtitle">
            <span className="hhr-line" />
            RANKED DE LIGA COMPETITIVA
          </div>

          <h1 className="hhr-title">
            ROYAL <span className="hhr-title-red">RANKED</span>
          </h1>

          <p className="hhr-desc">
            Comunidad destinada al público competitivo.<br/>
            Salas privadas, partidas rankeadas y eventos épicos.
          </p>

          <div className="hhr-actions">
            <a href="https://discord.gg/zscGKBdfGA" target="_blank" rel="noreferrer" className="btn-real-red-skew">
              <span className="btn-inner">
                <span className="btn-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                </span>
                ENTRA EN NUESTRO DISCORD
              </span>
            </a>
            <Link to="/ranking" className="btn-real-dark-skew">
              <span className="btn-inner">
                <span className="btn-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                </span>
              </span>
            </Link>
          </div>

          {/* Live stats bar */}
          <div className="hhr-stats-bar">
            <div className="hhr-stat">
              <span className="hst-val">{stats ? stats.totalPlayers.toLocaleString() : '—'}</span>
              <span className="hst-key">JUGADORES</span>
            </div>
            <div className="hhr-stat-div" />
            <div className="hhr-stat">
              <span className="hst-val">{stats ? stats.totalMatches.toLocaleString() : '—'}</span>
              <span className="hst-key">PARTIDAS</span>
            </div>
            <div className="hhr-stat-div" />
            <div className="hhr-stat">
              <span className="hst-val" style={{ color: stats?.botOnline ? '#00e06a' : '#ff4444' }}>
                {stats?.botOnline ? 'ONLINE' : 'OFFLINE'}
              </span>
              <span className="hst-key">BOT</span>
            </div>
          </div>
        </div>

        {/* ── RIGHT: How It Works Panel ── */}
        <div className="hhr-right">
           <div className="hhr-char-glow"></div>
           <div className="hhr-info-card">
              <div className="hhr-info-title">
                <span className="hhr-info-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--crimson)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                </span>
                ¿CÓMO FUNCIONA?
              </div>
              
              <div className="hhr-steps">
                <div className="hhr-step">
                  <div className="step-num">1</div>
                  <div className="step-text">
                    <strong>ÚNETE A LA COMUNIDAD</strong>
                    <span>Entra a nuestro Discord y vincula tu cuenta.</span>
                  </div>
                </div>
                
                <div className="hhr-step">
                  <div className="step-num">2</div>
                  <div className="step-text">
                    <strong>COMPITE EN LOBBIES</strong>
                    <span>Juega en los distintos modos y registra victorias.</span>
                  </div>
                </div>
                
                <div className="hhr-step">
                  <div className="step-num">3</div>
                  <div className="step-text">
                    <strong>ESCALA EL RANKING</strong>
                    <span>Acumula Puntos, Mejora tu Winrate y gana premios.</span>
                  </div>
                </div>
              </div>
           </div>
        </div>

      </div>
    </div>
  );
};

export default Home;
