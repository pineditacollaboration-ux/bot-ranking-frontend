import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import './Home.css';

const DiscordIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

const Home = () => {
  const { user, login } = useAuth();
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Parallax Tilt Engine
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const response = await axios.get(API_CONFIG.ENDPOINTS.API.STATS);
      setStats(response.data);
    } catch (error) {
      console.error('Error al obtener estadísticas:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    const { left, top, width, height } = containerRef.current.getBoundingClientRect();
    // Normalize coordinates from -1 to 1 based on center of container
    const x = ((e.clientX - left) / width - 0.5) * 2;
    const y = ((e.clientY - top) / height - 0.5) * 2;
    setMousePos({ x, y });
  };

  // Convert stats real or display skeleton
  const winRate = stats && stats.totalMatches > 0
    ? ((stats.totalWins / stats.totalMatches) * 100).toFixed(1)
    : null;

  // Render variables for mouse tilt tracking
  const transformStyle = {
    transform: `perspective(1000px) rotateY(${mousePos.x * 20}deg) rotateX(${mousePos.y * -20}deg)`,
    transition: 'transform 0.1s ease-out'
  };

  const floatingCards = (
    <div className="hero-graphics" style={transformStyle}>
      {/* Animated HUD Backing */}
      <div className="hero-radar"></div>

      <div className="floating-card card-1" style={{ transform: `translateZ(80px) rotateY(${mousePos.x * 10}deg)` }}>
        <div className="f-card-header">
          <span>PARTIDAS TOTALES</span>
          <span>⚔️</span>
        </div>
        <div className="f-card-val">
          {statsLoading ? '—' : (stats?.totalMatches ?? 0).toLocaleString()}
        </div>
        <div className="f-card-sub">Registradas en el servidor</div>
      </div>

      <div className="floating-card card-2" style={{ transform: `translateZ(100px) rotateY(${mousePos.x * -10}deg)` }}>
        <div className="f-card-header">
          <span>WIN RATE AVG</span>
          <span>📈</span>
        </div>
        <div className="f-card-val">
          {statsLoading ? '—' : winRate ? `${winRate}%` : 'N/A'}
        </div>
        <div className="f-card-sub">Rendimiento global</div>
      </div>

      <div className="floating-card card-3" style={{ transform: `translateZ(120px) rotateX(${mousePos.y * 15}deg)` }}>
        <div className="f-card-header">
          <span>JUGADORES</span>
        </div>
        <div className="f-card-val">
          {statsLoading ? '—' : (stats?.totalPlayers ?? 0).toLocaleString()}
        </div>
        <div className="f-card-sub">Registrados en la plataforma</div>
      </div>
    </div>
  );

  if (!user) {
    return (
      <div className="home" onMouseMove={handleMouseMove} ref={containerRef}>
        
        {/* Dynamic Light Orbs */}
        <div className="light-orb orb-red" style={{ 
          transform: `translate(${mousePos.x * -50}px, ${mousePos.y * -50}px)` 
        }}></div>
        <div className="light-orb orb-cyan" style={{ 
          transform: `translate(${mousePos.x * 50}px, ${mousePos.y * 50}px)` 
        }}></div>

        <div className="hero-section">
          {/* Marquee Background */}
          <div className="marquee-container">
            <div className="marquee-content">
              ROYAL RANKED • PREMIUM LEAGUE • E-SPORTS PLATFORM • REAL TIME DATA • PURE COMPETITION • ROYAL RANKED • PREMIUM LEAGUE • 
            </div>
          </div>
          
          <div className="hero-layout">
            <div className="hero-content">
              <div className="hero-badge animate-fade-up">
                <span className="badge-text" style={{margin: '0'}}>🔥 COMUNIDAD COMPETITIVA</span>
              </div>
              <h1 className="hero-title glitch-wrapper animate-fade-up delay-1">
                <span className="title-line glitch" data-text="ROYAL">ROYAL</span>
                <span className="title-line title-accent">MEJOR RANKED</span>
              </h1>
              <p className="hero-description animate-fade-up delay-2">
                La plataforma definitiva para jugadores serios. Sincronización en tiempo real con Discord, Leaderboards globales y análisis de ligas privadas E-Sports.
              </p>
              <div className="hero-buttons animate-fade-up delay-3">
                <button onClick={login} className="btn btn-primary btn-skewed">
                  <span className="btn-skewed-content" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <DiscordIcon />
                    ENTRAR AL DASHBOARD
                  </span>
                </button>
                <a href="https://discord.gg/VBrarJu9DP" target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-skewed">
                  <span className="btn-skewed-content">Discord</span>
                </a>
              </div>
            </div>

            {floatingCards}

          </div>
        </div>
      </div>
    );
  }

  if (statsLoading) {
    return <div className="loading">Cargando Sistema...</div>;
  }

  return (
    <div className="home" onMouseMove={handleMouseMove} ref={containerRef}>
      
      <div className="light-orb orb-red"></div>
      
      <div className="stats-section">
        <h1 className="page-title animate-fade-up">DASHBOARD EN VIVO</h1>
        <p className="page-subtitle animate-fade-up delay-1">Métricas procesadas en tiempo real de la API de Discord</p>

        <div className="stats-overview">
          <div className="stat-card-large animate-fade-up delay-2" style={{ transform: `translateY(${mousePos.y * 10}px)` }}>
            <div className="stat-icon pulse-icon">👥</div>
            <h3>JUGADORES VINCULADOS</h3>
            <p className="stat-value">{(stats?.totalPlayers ?? 0).toLocaleString()}</p>
          </div>
          <div className="stat-card-large animate-fade-up delay-3" style={{ transform: `translateY(${mousePos.y * -10}px)` }}>
            <div className="stat-icon pulse-icon" style={{ animationDelay: '0.2s'}}>⚔️</div>
            <h3>BATALLAS REGISTRADAS</h3>
            <p className="stat-value">{(stats?.totalMatches ?? 0).toLocaleString()}</p>
          </div>
          <div className="stat-card-large animate-fade-up delay-4" style={{ transform: `translateY(${mousePos.y * 10}px)` }}>
            <div className="stat-icon pulse-icon" style={{ animationDelay: '0.4s'}}>🏆</div>
            <h3>VICTORIAS OTORGADAS</h3>
            <p className="stat-value">{(stats?.totalWins ?? 0).toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
