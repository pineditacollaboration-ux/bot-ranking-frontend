import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import RestrictedContent from '../components/RestrictedContent';
import { Users, Swords, Zap, Trophy, Crown, Medal, Shield } from 'lucide-react';
import './Estadisticas.css';

const Estadisticas = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [topPoints, setTopPoints] = useState(null);
  const [topWins, setTopWins] = useState(null);
  const [topMvp, setTopMvp] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 15000);
    return () => clearInterval(iv);
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, ptsRes, winsRes, mvpRes] = await Promise.all([
        axios.get(API_CONFIG.ENDPOINTS.API.STATS),
        axios.get(API_CONFIG.ENDPOINTS.API.RANKING, { params: { sortBy: 'points', limit: 1 } }),
        axios.get(API_CONFIG.ENDPOINTS.API.RANKING, { params: { sortBy: 'wins', limit: 1 } }),
        axios.get(API_CONFIG.ENDPOINTS.API.RANKING, { params: { sortBy: 'mvps', limit: 1 } })
      ]);
      setStats(statsRes.data);
      
      const getFirst = (res) => {
        const d = res.data;
        const arr = Array.isArray(d) ? d : d?.players ?? d?.ranking ?? d?.data ?? [];
        return arr[0] || null;
      };

      setTopPoints(getFirst(ptsRes));
      setTopWins(getFirst(winsRes));
      setTopMvp(getFirst(mvpRes));
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

  const fmt = n => loading ? <div className="skeleton-box" style={{ height: 28, width: 80, display: 'inline-block' }} /> : (n ?? 0).toLocaleString('es');

  const kpis = [
    { icon: <Users size={20} />, label: 'JUGADORES TOTALES', val: fmt(stats?.totalPlayers), sub: 'Vinculados a la plataforma' },
    { icon: <Swords size={20} />, label: 'PARTIDAS JUGADAS',  val: fmt(stats?.totalMatches), sub: 'Registradas en el servidor' },
    { icon: <Zap size={20} />, label: 'JUGADORES ACTIVOS', val: fmt(stats?.activePlayers), sub: 'Con partidas recientes' },
    { icon: <Trophy size={20} />, label: 'PARTIDAS ACTIVAS',  val: fmt(stats?.activeMatches), sub: 'En curso actualmente' },
  ];

  const topCards = [
    {
      cls: 't1', icon: <Crown size={36} className="text-gold" />, crown: 'MÁS PUNTOS',
      player: topPoints, score: topPoints?.points, unit: 'PUNTOS',
    },
    {
      cls: 't2', icon: <Medal size={36} className="text-crimson" />, crown: 'MÁS VICTORIAS',
      player: topWins, score: topWins?.wins, unit: 'WINS',
    },
    {
      cls: 't3', icon: <Shield size={36} className="text-green" />, crown: 'MÁS MVP',
      player: topMvp, score: topMvp?.mvps, unit: 'MVPs',
    },
  ];

  return (
    <div className="estadisticas-page">
      <div className="anim-fade-up" style={{ marginBottom: 40 }}>
        <div className="badge badge-live" style={{ marginBottom: 10 }}>
          <span className="dot" /> DATOS EN VIVO
        </div>
        <h1 className="section-heading">ESTADÍSTICAS <span className="text-crimson">GLOBALES</span></h1>
        <p className="section-lead">Métricas y análisis completos del servidor competitivo</p>
      </div>

      <div className="stats-kpi-grid">
        {kpis.map((k, i) => (
          <div key={k.label} className={`stats-kpi-card anim-fade-up d${i+1}`}>
            <div className="stats-kpi-top">
              <span className="stats-kpi-label">{k.label}</span>
              <span className="stats-kpi-icon" style={{ color: 'var(--text-muted)' }}>{k.icon}</span>
            </div>
            <div className="stats-kpi-val">{k.val}</div>
            <div className="stats-kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="stats-section anim-fade-up d5">
        <div className="stats-section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Crown size={24} className="text-gold"/> TOP JUGADORES</div>
        <div className="top-trio">
          {topCards.map((tc, i) => {
            if (!tc.player) return (
              <div key={tc.crown} className={`top-player-card ${tc.cls}`}>
                <div className="top-player-trophy">{tc.icon}</div>
                <div className="skeleton-box" style={{ width: 80, height: 80, borderRadius: '50%' }} />
                <div className={`top-player-crown`}>{tc.crown}</div>
                <div className="skeleton-box" style={{ width: 100, height: 20, margin: '6px 0' }} />
                <div className="skeleton-box" style={{ width: 60, height: 26, margin: '4px 0' }} />
              </div>
            );
            return (
              <div key={tc.player.discordId} className={`top-player-card ${tc.cls}`}>
                <div className="top-player-trophy">{tc.icon}</div>
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
    </div>
  );
};

export default Estadisticas;
