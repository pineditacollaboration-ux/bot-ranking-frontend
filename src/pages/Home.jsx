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
                <span className="btn-icon">🎮</span>
                ENTRA EN NUESTRO DISCORD
              </span>
            </a>
            <Link to="/ranking" className="btn-real-dark-skew">
              <span className="btn-inner">
                <span className="btn-icon">↗</span>
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

        {/* ── RIGHT: Visual Filler ── */}
        <div className="hhr-right">
           <div className="hhr-char-glow"></div>
        </div>

      </div>
    </div>
  );
};

export default Home;
