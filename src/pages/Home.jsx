import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import './Home.css';

const DiscordIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

const Home = () => {
  const { user, login } = useAuth();
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

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

  const winRate = stats && stats.totalMatches > 0
    ? ((stats.totalWins / stats.totalMatches) * 100).toFixed(1)
    : null;

  const floatingCards = (
    <div className="hero-stats-grid">
      <div className="glass-panel stat-card animate-fade-up delay-1">
        <div className="stat-card-header">
          <div className="stat-icon-wrapper">⚔️</div>
          <span className="stat-title">PARTIDAS TOTALES</span>
        </div>
        <div className="stat-value">
          {statsLoading ? '—' : (stats?.totalMatches ?? 0).toLocaleString()}
        </div>
        <div className="stat-subtitle">Registradas en el servidor</div>
      </div>

      <div className="glass-panel stat-card animate-fade-up delay-2">
        <div className="stat-card-header">
          <div className="stat-icon-wrapper">📈</div>
          <span className="stat-title">WIN RATE AVG</span>
        </div>
        <div className="stat-value">
          {statsLoading ? '—' : winRate ? `${winRate}%` : 'N/A'}
        </div>
        <div className="stat-subtitle">Rendimiento global</div>
      </div>

      <div className="glass-panel stat-card animate-fade-up delay-3">
        <div className="stat-card-header">
          <div className="stat-icon-wrapper">👥</div>
          <span className="stat-title">JUGADORES</span>
        </div>
        <div className="stat-value">
          {statsLoading ? '—' : (stats?.totalPlayers ?? 0).toLocaleString()}
        </div>
        <div className="stat-subtitle">Registrados en plataforma</div>
      </div>
    </div>
  );

  if (!user) {
    return (
      <div className="home-container">
        <div className="hero-section">
          <div className="hero-content">
            <div className="badge-pill animate-fade-up">
              <span className="pulse-dot"></span>
              <span>COMUNIDAD COMPETITIVA</span>
            </div>
            
            <h1 className="main-title animate-fade-up delay-1">
              DOMINA EL <span className="text-gradient">RANKING</span><br />
              CONVIÉRTETE EN LEYENDA
            </h1>
            
            <p className="main-description animate-fade-up delay-2">
              La plataforma definitiva para jugadores de Free Fire. 
              Sincronización en tiempo real con Discord y estadísticas avanzadas para llevar tu juego al siguiente nivel.
            </p>
            
            <div className="action-buttons animate-fade-up delay-3">
              <button onClick={login} className="btn-glow-primary">
                <DiscordIcon />
                <span>INICIAR SESIÓN CON DISCORD</span>
              </button>
              <a href="https://discord.gg/VBrarJu9DP" target="_blank" rel="noopener noreferrer" className="btn-outline">
                UNIRSE AL SERVIDOR
              </a>
            </div>
          </div>
          
          <div className="hero-visuals">
            {floatingCards}
          </div>
        </div>
      </div>
    );
  }

  if (statsLoading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <div className="loading-text">Sincronizando Base de Datos...</div>
      </div>
    );
  }

  return (
    <div className="home-dashboard">
      <div className="dashboard-header animate-fade-up">
        <h1 className="dashboard-title">DASHBOARD <span className="text-gradient">EN VIVO</span></h1>
        <p className="dashboard-subtitle">Métricas del servidor procesadas en tiempo real</p>
      </div>

      <div className="dashboard-grid">
        <div className="glass-panel stat-card-large animate-fade-up delay-1">
          <div className="stat-icon-large">👥</div>
          <div className="stat-content-large">
            <h3>JUGADORES VINCULADOS</h3>
            <p className="stat-value-large">{(stats?.totalPlayers ?? 0).toLocaleString()}</p>
          </div>
        </div>
        
        <div className="glass-panel stat-card-large animate-fade-up delay-2">
          <div className="stat-icon-large">⚔️</div>
          <div className="stat-content-large">
            <h3>BATALLAS REGISTRADAS</h3>
            <p className="stat-value-large">{(stats?.totalMatches ?? 0).toLocaleString()}</p>
          </div>
        </div>
        
        <div className="glass-panel stat-card-large animate-fade-up delay-3">
          <div className="stat-icon-large">🏆</div>
          <div className="stat-content-large">
            <h3>VICTORIAS OTORGADAS</h3>
            <p className="stat-value-large">{(stats?.totalWins ?? 0).toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
