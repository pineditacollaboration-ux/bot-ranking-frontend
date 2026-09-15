import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import RestrictedContent from '../components/RestrictedContent';
import './Estadisticas.css';

const Estadisticas = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Stats can be viewed even without login (public info)
  useEffect(() => {
    fetchStats();
    const iv = setInterval(fetchStats, 15000);
    return () => clearInterval(iv);
  }, []);

  const fetchStats = async () => {
    try {
      const res = await axios.get(API_CONFIG.ENDPOINTS.API.STATS);
      setStats(res.data);
    } catch (_) {}
    finally { setLoading(false); }
  };

  if (!user) return <RestrictedContent />;

  const getAvatar = (discordId, avatar) => {
    if (!avatar || avatar === 'null' || avatar === 'undefined') {
      return `https://cdn.discordapp.com/embed/avatars/0.png`;
    }
    if (avatar.startsWith('http')) return avatar;
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png`;
  };

  const fmt = n => loading ? '—' : (n ?? 0).toLocaleString('es');

  const kpis = [
    { icon: '👥', label: 'JUGADORES TOTALES', val: fmt(stats?.totalPlayers), sub: 'Vinculados a la plataforma' },
    { icon: '⚔️', label: 'PARTIDAS JUGADAS',  val: fmt(stats?.totalMatches), sub: 'Registradas en el servidor' },
    { icon: '🔥', label: 'JUGADORES ACTIVOS', val: fmt(stats?.activePlayers), sub: 'Con partidas recientes' },
    { icon: '🏆', label: 'TEMPORADA ACTUAL',  val: loading ? '—' : `S${stats?.currentSeason ?? 1}`, sub: 'En curso' },
  ];

  const topCards = [
    {
      cls: 't1', trophy: '🥇', crown: 'MÁS PUNTOS',
      player: stats?.topPoints, score: stats?.topPoints?.points, unit: 'PUNTOS',
    },
    {
      cls: 't2', trophy: '🥈', crown: 'MÁS VICTORIAS',
      player: stats?.topWins, score: stats?.topWins?.wins, unit: 'WINS',
    },
    {
      cls: 't3', trophy: '🥉', crown: 'MÁS MVP',
      player: stats?.topMvp, score: stats?.topMvp?.mvps, unit: 'MVPs',
    },
  ];

  const activities = [
    { icon: '📊', key: 'PUNTOS PROMEDIO',  val: fmt(stats?.avgPoints) },
    { icon: '🎯', key: 'TASA DE VICTORIA', val: loading ? '—' : `${stats?.winRate ?? 0}%` },
    { icon: '⏱️', key: 'DURACIÓN PROMEDIO', val: loading ? '—' : `${stats?.avgMatchTime ?? 0} min` },
  ];

  return (
    <div className="estadisticas-page">
      {/* Header */}
      <div className="anim-fade-up" style={{ marginBottom: 40 }}>
        <div className="badge badge-live" style={{ marginBottom: 10 }}>
          <span className="dot" /> DATOS EN VIVO
        </div>
        <h1 className="section-heading">ESTADÍSTICAS <span className="text-crimson">GLOBALES</span></h1>
        <p className="section-lead">Métricas y análisis completos del servidor competitivo</p>
      </div>

      {/* KPIs */}
      <div className="stats-kpi-grid">
        {kpis.map((k, i) => (
          <div key={k.label} className={`stats-kpi-card anim-fade-up d${i+1}`}>
            <div className="stats-kpi-top">
              <span className="stats-kpi-label">{k.label}</span>
              <span className="stats-kpi-icon">{k.icon}</span>
            </div>
            <div className="stats-kpi-val">{k.val}</div>
            <div className="stats-kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* TOP PLAYERS */}
      <div className="stats-section anim-fade-up d5">
        <div className="stats-section-title">👑 TOP JUGADORES</div>
        <div className="top-trio">
          {topCards.map((tc, i) => {
            if (!tc.player) return (
              <div key={tc.crown} className={`top-player-card ${tc.cls}`}>
                <div className="top-player-trophy">{tc.trophy}</div>
                <div style={{ width: 80, height: 80, borderRadius:'50%', background:'var(--bg-border)' }} />
                <div className={`top-player-crown`}>{tc.crown}</div>
                <div className="top-player-name" style={{ color: 'var(--text-dim)' }}>—</div>
                <div className="top-player-score" style={{ color: 'var(--text-dim)' }}>—</div>
              </div>
            );
            return (
              <div key={tc.player.discordId} className={`top-player-card ${tc.cls}`}>
                <div className="top-player-trophy">{tc.trophy}</div>
                <img
                  src={getAvatar(tc.player.discordId, tc.player.avatar)}
                  alt={tc.player.username}
                  className="top-player-avatar"
                  onError={e => { e.target.onerror=null; e.target.src='https://cdn.discordapp.com/embed/avatars/0.png'; }}
                />
                <div className={`top-player-crown`}>{tc.crown}</div>
                <div className="top-player-name">{tc.player.username}</div>
                <div className="top-player-score">{(tc.score ?? 0).toLocaleString()}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 3, textTransform: 'uppercase' }}>
                  {tc.unit}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ACTIVITY */}
      <div className="stats-section anim-fade-up d6">
        <div className="stats-section-title">📈 ACTIVIDAD RECIENTE</div>
        <div className="activity-grid">
          {activities.map((a, i) => (
            <div key={a.key} className="activity-card">
              <div className="activity-icon">{a.icon}</div>
              <div className="activity-body">
                <div className="activity-val">{a.val}</div>
                <div className="activity-key">{a.key}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Estadisticas;
