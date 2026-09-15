import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import './Home.css';

const DiscordIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
  </svg>
);

const FEATURES = [
  {
    icon: '⚔️',
    title: 'Sistema Ranked',
    desc: 'Compite en partidas organizadas y sube de posición con cada victoria. Sistema de puntos justo y transparente.',
  },
  {
    icon: '📊',
    title: 'Stats en Tiempo Real',
    desc: 'Todas tus estadísticas sincronizadas al instante con el servidor de Discord. Cero retrasos, datos siempre precisos.',
  },
  {
    icon: '🏆',
    title: 'Temporadas Históricas',
    desc: 'Revive cada temporada, analiza tus progresos y demuestra tu evolución a lo largo del tiempo.',
  },
  {
    icon: '👑',
    title: 'Hall of Fame',
    desc: 'Los mejores jugadores de cada temporada quedan inmortalizados. ¿Tienes lo que se necesita para estar ahí?',
  },
  {
    icon: '🎯',
    title: 'MVP System',
    desc: 'Cada partida premia al mejor jugador. Acumula MVPs y demuestra que eres el más letal de la comunidad.',
  },
  {
    icon: '💰',
    title: 'Wager Matches',
    desc: 'Apuesta puntos contra otros jugadores y duplica tus ganancias. Solo para los que tienen temple de acero.',
  },
];

const Home = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const res = await axios.get(API_CONFIG.ENDPOINTS.API.STATS);
      setStats(res.data);
    } catch (_) {}
    finally { setStatsLoading(false); }
  };

  const fmt = n => statsLoading ? '—' : (n ?? 0).toLocaleString('es');
  const winRate = stats && stats.totalMatches > 0
    ? ((stats.totalWins / stats.totalMatches) * 100).toFixed(1) : null;

  /* ── LOGGED-IN DASHBOARD ── */
  if (user) {
    const avatarUrl = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
      : null;

    return (
      <div className="dashboard-page">
        {/* Welcome */}
        <div className="dashboard-welcome anim-fade-up">
          {avatarUrl ? (
            <img src={avatarUrl} alt={user.username} className="dashboard-welcome-avatar"
              onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }}
            />
          ) : null}
          <div className="dashboard-welcome-avatar-fallback" style={{ display: avatarUrl ? 'none' : 'flex' }}>
            {user.username?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="dashboard-welcome-text">
            <h1>BIENVENIDO, <span style={{ color: 'var(--crimson)' }}>{user.username?.toUpperCase()}</span></h1>
            <p>Dashboard en vivo — datos sincronizados con tu servidor de Discord</p>
          </div>
        </div>

        {/* KPIs */}
        <div className="dashboard-kpi-grid">
          {[
            { label: 'JUGADORES', val: fmt(stats?.totalPlayers), icon: '👥', sub: 'Vinculados a la plataforma', cls: 'c1' },
            { label: 'PARTIDAS',  val: fmt(stats?.totalMatches), icon: '⚔️', sub: 'Registradas en el servidor',  cls: 'c2' },
            { label: 'VICTORIAS', val: fmt(stats?.totalWins),   icon: '🏆', sub: 'Otorgadas en total',           cls: 'c3' },
            { label: 'WIN RATE',  val: winRate ? `${winRate}%` : '—', icon: '🎯', sub: 'Promedio global',       cls: 'c4' },
          ].map((k, i) => (
            <div key={k.label} className={`kpi-card ${k.cls} anim-fade-up d${i+1}`}>
              <div className="kpi-top">
                <span className="kpi-label">{k.label}</span>
                <span className="kpi-icon">{k.icon}</span>
              </div>
              <div className="kpi-value">{k.val}</div>
              <div className="kpi-sub">{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Quick links */}
        <div className="features-grid anim-fade-up d5" style={{ maxWidth: '100%' }}>
          <Link to="/ranking" className="feature-card">
            <div className="feature-icon">🏆</div>
            <div className="feature-title">VER RANKING</div>
            <div className="feature-desc">Consulta la clasificación global de todos los jugadores de la comunidad.</div>
          </Link>
          <Link to="/temporadas" className="feature-card">
            <div className="feature-icon">🎖️</div>
            <div className="feature-title">TEMPORADAS</div>
            <div className="feature-desc">Revisa el histórico de temporadas y los campeones de cada una.</div>
          </Link>
          <Link to="/estadisticas" className="feature-card">
            <div className="feature-icon">📊</div>
            <div className="feature-title">ESTADÍSTICAS</div>
            <div className="feature-desc">Métricas avanzadas y análisis completo del servidor competitivo.</div>
          </Link>
        </div>
      </div>
    );
  }

  /* ── LANDING PAGE (no logueado) ── */
  return (
    <>
      {/* HERO */}
      <section className="hero">
        <div className="hero-bg">
          <div className="hero-bg-gradient" />
          <div className="hero-grid" />
        </div>

        <div className="hero-container">
          {/* Left */}
          <div className="hero-left">
            <div className="hero-season-tag anim-fade-up">
              <div className="badge badge-live">
                <span className="dot" />
                EN VIVO
              </div>
              <span className="hero-season-text">TEMPORADA ACTIVA</span>
            </div>

            <h1 className="hero-title anim-fade-up d1">
              DOMINA<br />
              <span className="line-2">EL RANKED</span>
            </h1>

            <p className="hero-description anim-fade-up d2">
              La plataforma competitiva definitiva para Free Fire.
              Rankings en tiempo real, estadísticas avanzadas y una comunidad
              de élite que vive para ganar.
            </p>

            <div className="hero-ctas anim-fade-up d3">
              <Link to="/login" className="btn-primary">
                <DiscordIcon />
                ENTRAR CON DISCORD
              </Link>
              <a href="https://discord.gg/VBrarJu9DP" target="_blank" rel="noopener noreferrer" className="btn-outline">
                🔗 UNIRSE AL SERVIDOR
              </a>
            </div>

            <div className="hero-tickers anim-fade-up d4">
              <div className="hero-ticker">
                <span className="hero-ticker-val">{fmt(stats?.totalPlayers)}</span>
                <span className="hero-ticker-label">Jugadores</span>
              </div>
              <div className="hero-ticker">
                <span className="hero-ticker-val">{fmt(stats?.totalMatches)}</span>
                <span className="hero-ticker-label">Partidas</span>
              </div>
              <div className="hero-ticker">
                <span className="hero-ticker-val">{winRate ? `${winRate}%` : '—'}</span>
                <span className="hero-ticker-label">Win Rate Avg</span>
              </div>
            </div>
          </div>

          {/* Right — floating stat cards */}
          <div className="hero-right">
            {[
              { icon: '👥', iconCls: 'red', val: fmt(stats?.totalPlayers), label: 'JUGADORES ACTIVOS', sub: 'En la plataforma', trend: '+12%' },
              { icon: '⚔️', iconCls: 'gold', val: fmt(stats?.totalMatches), label: 'BATALLAS ÉPICAS', sub: 'Registradas y contadas', trend: '+28%' },
              { icon: '🏆', iconCls: 'blue', val: fmt(stats?.totalWins), label: 'VICTORIAS TOTALES', sub: 'Otorgadas con honor', trend: '+19%' },
            ].map((c, i) => (
              <div key={c.label} className={`hero-card anim-fade-up d${i+2}`}>
                <div className={`hero-card-icon ${c.iconCls}`}>{c.icon}</div>
                <div className="hero-card-body">
                  <div className="hero-card-val">{c.val}</div>
                  <div className="hero-card-label">{c.label}</div>
                  <div className="hero-card-sub">{c.sub}</div>
                </div>
                <div className="hero-card-trend">↑ {c.trend}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll hint */}
        <div className="scroll-indicator">
          <div className="scroll-mouse"><div className="scroll-wheel" /></div>
          <span className="scroll-label">Scrollear</span>
        </div>
      </section>

      {/* FEATURES */}
      <section className="features-section">
        <div className="features-header anim-fade-up">
          <div className="badge badge-gold" style={{ margin: '0 auto 16px' }}>⚡ POR QUÉ ROYAL RANKED</div>
          <h2 className="section-heading">PLATAFORMA DE ÉLITE</h2>
          <p className="section-lead">Todo lo que necesitas para competir, mejorar y dominar</p>
        </div>
        <div className="features-grid">
          {FEATURES.map((f, i) => (
            <div key={f.title} className={`feature-card anim-fade-up d${i+1}`}>
              <div className="feature-icon">{f.icon}</div>
              <div className="feature-title">{f.title}</div>
              <div className="feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
};

export default Home;
