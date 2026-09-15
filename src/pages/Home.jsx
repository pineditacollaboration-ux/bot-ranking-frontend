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
        const [sRes, rRes] = await Promise.all([
          axios.get(API_CONFIG.ENDPOINTS.API.STATS),
          axios.get(API_CONFIG.ENDPOINTS.API.RANKING, { params: { type: 'season', limit: 3 } }),
        ]);
        setStats(sRes.data);
        const d = rRes.data;
        const arr = Array.isArray(d) ? d : d?.players ?? d?.ranking ?? d?.data ?? [];
        setTop3(arr.slice(0, 3));
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

        {/* ── RIGHT: Live Top 3 ── */}
        <div className="hhr-right">
          <div className="hhr-top3-panel">
            <div className="hhr-top3-label">
              <span className="hhr-t3-line" />
              TOP JUGADORES
              <span className="hhr-t3-line" />
            </div>

            {top3.length === 0 ? (
              <div className="hhr-top3-empty">Cargando...</div>
            ) : (
              top3.map((p, idx) => (
                <Link to={user ? `/profile/${p.discordId}` : '/ranking'} key={p.discordId} className="hhr-top3-row" style={{ textDecoration: 'none' }}>
                  <span className="hhr-t3-medal">{medals[idx]}</span>
                  <img
                    src={getAvatarUrl(p.discordId, p.avatar)}
                    alt={p.username}
                    className="hhr-t3-avatar"
                    onError={e => { e.target.onerror = null; e.target.src = 'https://cdn.discordapp.com/embed/avatars/0.png'; }}
                  />
                  <div className="hhr-t3-info">
                    <span className="hhr-t3-name">{p.username}</span>
                    <span className="hhr-t3-sub">{(p.seasonPoints ?? p.points ?? 0).toLocaleString()} pts · {p.wins ?? 0} wins</span>
                  </div>
                  <span className="hhr-t3-rank">#{idx + 1}</span>
                </Link>
              ))
            )}

            <Link to="/ranking" className="hhr-top3-cta">
              VER RANKING COMPLETO →
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Home;
