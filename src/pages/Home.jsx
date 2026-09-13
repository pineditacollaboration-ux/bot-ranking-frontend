import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import './Home.css';

const Home = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Error al obtener estadísticas:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Cargando...</div>;
  }

  return (
    <div className="home">
      <div className="hero">
        <div className="hero-content">
          <h1 className="hero-title">
            RANKING <span className="hero-accent">OFICIAL</span>
          </h1>
          <p className="hero-subtitle">
            Compite con los mejores jugadores y sube en el ranking
          </p>
          
          <div className="hero-stats">
            <div className="stat-card">
              <div className="stat-number">{stats?.totalPlayers || 0}+</div>
              <div className="stat-label">JUGADORES</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{stats?.activePlayers || 0}+</div>
              <div className="stat-label">ACTIVOS</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{stats?.totalMatches || 0}+</div>
              <div className="stat-label">PARTIDAS</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">S{stats?.currentSeason || 1}</div>
              <div className="stat-label">TEMPORADA</div>
            </div>
          </div>

          <div className="hero-actions">
            <Link to="/ranking" className="btn btn-primary">
              VER RANKING
            </Link>
            <Link to="/login" className="btn btn-secondary">
              INICIAR SESIÓN
            </Link>
          </div>
        </div>
      </div>

      <div className="top-players">
        <h2 className="section-title">TOP JUGADORES</h2>
        <div className="top-players-grid">
          {stats?.topPoints && (
            <div className="top-player-card">
              <div className="top-badge">🏆 PUNTOS</div>
              <img
                src={`https://cdn.discordapp.com/avatars/${stats.topPoints.discordId}/${stats.topPoints.avatar}.png`}
                alt={stats.topPoints.username}
                className="top-player-avatar"
              />
              <div className="top-player-name">{stats.topPoints.username}</div>
              <div className="top-player-score">{stats.topPoints.points} pts</div>
            </div>
          )}
          {stats?.topWins && (
            <div className="top-player-card">
              <div className="top-badge">⚔️ VICTORIAS</div>
              <img
                src={`https://cdn.discordapp.com/avatars/${stats.topWins.discordId}/${stats.topWins.avatar}.png`}
                alt={stats.topWins.username}
                className="top-player-avatar"
              />
              <div className="top-player-name">{stats.topWins.username}</div>
              <div className="top-player-score">{stats.topWins.wins} wins</div>
            </div>
          )}
          {stats?.topMvp && (
            <div className="top-player-card">
              <div className="top-badge">👑 MVP</div>
              <img
                src={`https://cdn.discordapp.com/avatars/${stats.topMvp.discordId}/${stats.topMvp.avatar}.png`}
                alt={stats.topMvp.username}
                className="top-player-avatar"
              />
              <div className="top-player-name">{stats.topMvp.username}</div>
              <div className="top-player-score">{stats.topMvp.mvps} mvps</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Home;
