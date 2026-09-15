import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import { ChevronRight, Trophy, Swords, Medal, AlertCircle, Crosshair, TrendingUp, Users } from 'lucide-react';
import './Home.css';

const Home = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    const inv = setInterval(fetchStats, 15000);
    return () => clearInterval(inv);
  }, []);

  const fetchStats = async () => {
    try {
      const res = await axios.get(API_CONFIG.ENDPOINTS.API.STATS);
      setStats(res.data);
    } catch (_) {}
    finally { setStatsLoading(false); }
  };

  const fmt = n => statsLoading ? '—' : (n ?? 0).toLocaleString('es');

  // Win rate in API isn't present, so we compute from matches/wins, but wait...
  // Global win rate of all matches played makes no sense (it's always 50% since someone wins, someone loses, unless draws exist).
  // I'll show Average Active Players per match or something similar requested by users, 
  // or fallback to showing the Active Matches.
  const globalStats = [
    { key: 'JUGADORES REGISTRADOS', icon: <Users size={22} />, val: fmt(stats?.totalPlayers) },
    { key: 'PARTIDAS JUGADAS', icon: <Swords size={22} />, val: fmt(stats?.totalMatches) },
    { key: 'MIEMBROS DISCORD', icon: <Medal size={22} />, val: fmt(stats?.discordMembers) },
    { key: 'TASA DE ACTIVIDAD', icon: <TrendingUp size={22} />, val: statsLoading ? '—' : `${((stats?.activePlayers / stats?.totalPlayers) * 100 || 0).toFixed(1)}%` },
  ];

  /* ── PUBLIC HERO ── */
  if (!user) {
    return (
      <div className="home-page">
        <div className="home-hero anim-fade-up">
          <div className="home-hero-bg" />
          <h1 className="home-hero-title">EL SIGUIENTE NIVEL DEL<br/><span>COMPETITIVO</span></h1>
          <p className="home-hero-desc">
            Únete a la liga, compite en partidas dinámicas y escala
            en el ranking oficial. El servidor donde las leyendas nacen.
          </p>
          <div className="home-hero-actions">
            <Link to="/ranking" className="btn-primary">
              <Trophy size={18} /> VER RANKING
            </Link>
            <Link to="/login" className="btn-secondary">
              INICIAR SESIÓN
            </Link>
          </div>
        </div>

        <div className="home-stats-ticker anim-fade-up d1">
          {globalStats.map(s => (
            <div key={s.key} className="ticker-item">
              <div className="ticker-icon">{s.icon}</div>
              <div className="ticker-info">
                <span className="ticker-val">{s.val}</span>
                <span className="ticker-key">{s.key}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── LOGGED-IN DASHBOARD ── */
  const avatarUrl = !user.avatar || user.avatar === 'null' || user.avatar === 'undefined'
    ? `https://cdn.discordapp.com/embed/avatars/0.png`
    : (user.avatar.startsWith('http') ? user.avatar : `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`);

  return (
    <div className="home-page">
      <div className="home-dashboard-header anim-fade-up">
        <div className="dash-header-bg" />
        <div className="dash-header-content">
          <img
            src={avatarUrl}
            alt="avatar"
            className="dash-header-avatar"
            onError={(e) => { e.target.onerror = null; e.target.src = 'https://cdn.discordapp.com/embed/avatars/0.png'; }}
          />
          <div className="dash-header-text">
            <div className="badge badge-live" style={{ marginBottom: 12 }}>
              <span className="dot" /> ONLINE
            </div>
            <h1>BIENVENIDO, <span>{user.username}</span></h1>
            <p>Dashboard en vivo — datos sincronizados con tu servidor de Discord</p>
          </div>
        </div>
      </div>

      {/* STATS GRID */}
      <div className="home-stats-grid anim-fade-up d1">
        <div className="home-stat-card">
          <div className="hsc-top">
            <span>JUGADORES</span>
            <Users size={18} />
          </div>
          <div className="hsc-val">{fmt(stats?.totalPlayers)}</div>
          <div className="hsc-sub">Vinculados a la plataforma</div>
        </div>
        <div className="home-stat-card">
          <div className="hsc-top">
            <span>PARTIDAS</span>
            <Swords size={18} />
          </div>
          <div className="hsc-val">{fmt(stats?.totalMatches)}</div>
          <div className="hsc-sub">Registradas en el servidor</div>
        </div>
        <div className="home-stat-card">
          <div className="hsc-top">
            <span>PARTIDAS ACTIVAS</span>
            <Crosshair size={18} />
          </div>
          <div className="hsc-val">{fmt(stats?.activeMatches)}</div>
          <div className="hsc-sub">Desarrollándose en este instante</div>
        </div>
        <div className="home-stat-card primary">
          <div className="hsc-top">
            <span>TASA DE ACTIVIDAD</span>
            <TrendingUp size={18} />
          </div>
          <div className="hsc-val">{statsLoading ? '—' : `${((stats?.activePlayers / stats?.totalPlayers) * 100 || 0).toFixed(1)}%`}</div>
          <div className="hsc-sub">Jugadores promedio activos</div>
        </div>
      </div>

      {/* QUICK LINKS */}
      <div className="home-features-grid anim-fade-up d2">
        <Link to="/ranking" className="feature-card">
          <div className="feature-icon"><Trophy size={32} /></div>
          <h3>VER RANKING</h3>
          <p>Consulta la clasificación global de todos los jugadores de la comunidad.</p>
        </Link>
        <Link to="/seasons" className="feature-card">
          <div className="feature-icon"><Medal size={32} /></div>
          <h3>TEMPORADAS</h3>
          <p>Revisa el histórico de temporadas y los campeones de cada una.</p>
        </Link>
        <Link to="/estadisticas" className="feature-card">
          <div className="feature-icon"><AlertCircle size={32} /></div>
          <h3>ESTADÍSTICAS</h3>
          <p>Métricas avanzadas y análisis completo del servidor competitivo.</p>
        </Link>
      </div>
    </div>
  );
};

export default Home;
