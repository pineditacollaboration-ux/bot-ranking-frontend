import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import RestrictedContent from '../components/RestrictedContent';
import './Estadisticas.css';

const Estadisticas = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
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

  if (!user) {
    return <RestrictedContent />;
  }

  if (loading) {
    return <div className="loading">Cargando estadísticas...</div>;
  }

  return (
    <div className="estadisticas">
      <div className="estadisticas-container">
        <h1 className="page-title">ESTADÍSTICAS</h1>
        <p className="page-subtitle">Métricas y análisis del servidor</p>

        <div className="stats-overview">
          <div className="stat-card-large">
            <div className="stat-icon">👥</div>
            <h3>JUGADORES TOTALES</h3>
            <p className="stat-value">{stats?.totalPlayers || 0}</p>
          </div>
          <div className="stat-card-large">
            <div className="stat-icon">⚔️</div>
            <h3>PARTIDAS JUGADAS</h3>
            <p className="stat-value">{stats?.totalMatches || 0}</p>
          </div>
          <div className="stat-card-large">
            <div className="stat-icon">🔥</div>
            <h3>JUGADORES ACTIVOS</h3>
            <p className="stat-value">{stats?.activePlayers || 0}</p>
          </div>
          <div className="stat-card-large">
            <div className="stat-icon">🏆</div>
            <h3>TEMPORADA ACTUAL</h3>
            <p className="stat-value">S{stats?.currentSeason || 1}</p>
          </div>
        </div>

        <div className="stats-section">
          <h2 className="section-title">TOP JUGADORES</h2>
          <div className="top-players-grid">
            {stats?.topPoints && (
              <div className="top-player-card">
                <div className="top-badge">🥇 MÁS PUNTOS</div>
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
                <div className="top-badge">🥈 MÁS VICTORIAS</div>
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
                <div className="top-badge">🥉 MÁS MVP</div>
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

        <div className="stats-section">
          <h2 className="section-title">ACTIVIDAD RECIENTE</h2>
          <div className="activity-stats">
            <div className="activity-card">
              <div className="activity-icon">📊</div>
              <h3>PROMEDIO DE PUNTOS</h3>
              <p className="activity-value">{stats?.avgPoints || 0}</p>
            </div>
            <div className="activity-card">
              <div className="activity-icon">🎯</div>
              <h3>TASA DE VICTORIA</h3>
              <p className="activity-value">{stats?.winRate || 0}%</p>
            </div>
            <div className="activity-card">
              <div className="activity-icon">⏱️</div>
              <h3>TIEMPO PROMEDIO</h3>
              <p className="activity-value">{stats?.avgMatchTime || 0} min</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Estadisticas;
