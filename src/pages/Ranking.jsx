import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_CONFIG } from '../config/api';
import { useAuth } from '../context/AuthContext';
import RestrictedContent from '../components/RestrictedContent';
import { Link } from 'react-router-dom';
import './Ranking.css';

const Ranking = () => {
  const { user } = useAuth();
  const [players, setPlayers] = useState([]);
  const [sortBy, setSortBy] = useState('points');
  const [loading, setLoading] = useState(true);

  if (!user) {
    return <RestrictedContent />;
  }

  useEffect(() => {
    fetchRanking();
    const interval = setInterval(fetchRanking, 10000);
    return () => clearInterval(interval);
  }, [sortBy]);

  const fetchRanking = async () => {
    try {
      const response = await axios.get(API_CONFIG.ENDPOINTS.API.RANKING, {
        params: { sortBy }
      });
      setPlayers(response.data);
    } catch (error) {
      console.error('Error al obtener ranking:', error);
    } finally {
      setLoading(false);
    }
  };

  const sortOptions = [
    { value: 'points', label: 'PUNTOS' },
    { value: 'wins', label: 'VICTORIAS' },
    { value: 'losses', label: 'DERROTAS' },
    { value: 'mvps', label: 'MVP' },
    { value: 'streak', label: 'RACHA' },
  ];

  const getRankIcon = (index) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `#${index + 1}`;
  };

  if (loading) {
    return <div className="loading">Cargando ranking...</div>;
  }

  return (
    <div className="ranking">
      <div className="ranking-header">
        <h1 className="ranking-title">RANKING OFICIAL</h1>
        
        <div className="sort-options">
          <span className="sort-label">ORDENAR POR:</span>
          {sortOptions.map((option) => (
            <button
              key={option.value}
              className={`sort-btn ${sortBy === option.value ? 'active' : ''}`}
              onClick={() => setSortBy(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ranking-table">
        <div className="ranking-table-header">
          <div className="header-rank">#</div>
          <div className="header-player">JUGADOR</div>
          <div className="header-points">PUNTOS</div>
          <div className="header-wins">VICTORIAS</div>
          <div className="header-losses">DERROTAS</div>
          <div className="header-mvp">MVP</div>
          <div className="header-streak">RACHA</div>
        </div>

        {players.map((player, index) => (
          <Link
            key={player.discordId}
            to={`/profile/${player.discordId}`}
            className="ranking-row"
          >
            <div className="cell-rank">
              <span className="rank-icon">{getRankIcon(index)}</span>
            </div>
            <div className="cell-player">
              <img
                src={`https://cdn.discordapp.com/avatars/${player.discordId}/${player.avatar}.png`}
                alt={player.username}
                className="player-avatar"
              />
              <span className="player-name">{player.username}</span>
              <span className="player-platform">
                {player.platform === 'pc' ? '🖥️' : '📱'}
              </span>
            </div>
            <div className="cell-points">{player.points}</div>
            <div className="cell-wins">{player.wins}</div>
            <div className="cell-losses">{player.losses}</div>
            <div className="cell-mvp">{player.mvps}</div>
            <div className="cell-streak">
              {player.streak > 0 ? `🔥 ${player.streak}` : player.streak}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default Ranking;
