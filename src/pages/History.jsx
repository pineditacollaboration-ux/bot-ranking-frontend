import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import RestrictedContent from '../components/RestrictedContent';
import './History.css';

const History = () => {
  const { user } = useAuth();
  const { discordId } = useParams();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  if (!user) {
    return <RestrictedContent />;
  }

  useEffect(() => {
    fetchMatches();
  }, []);

  const fetchMatches = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/matches', {
        params: { limit: 50 }
      });
      setMatches(response.data);
    } catch (error) {
      console.error('Error al obtener historial:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Cargando historial...</div>;
  }

  return (
    <div className="history">
      <div className="history-header">
        <h1 className="history-title">HISTORIAL DE PARTIDAS</h1>
        <p className="history-subtitle">Últimas partidas jugadas en el servidor</p>
      </div>

      <div className="matches-container">
        {matches.length === 0 ? (
          <div className="no-matches">
            <p>No hay partidas registradas</p>
          </div>
        ) : (
          matches.map((match) => (
            <div key={match.matchId} className="match-card">
              <div className="match-header">
                <div className="match-info">
                  <span className="match-type">{match.gameType}</span>
                  <span className="match-season">TEMPORADA {match.season}</span>
                </div>
                <div className="match-date">
                  {new Date(match.createdAt).toLocaleString()}
                </div>
              </div>

              <div className="match-body">
                <div className={`match-team ${match.winner === 'team1' ? 'winner' : 'loser'}`}>
                  <div className="team-header">
                    <span className="team-name">EQUIPO 1</span>
                    {match.winner === 'team1' && <span className="winner-badge">🏆 GANADOR</span>}
                  </div>
                  <div className="team-players">
                    {match.team1.map((player) => (
                      <div key={player.discordId} className="team-player">
                        <img
                          src={`https://cdn.discordapp.com/avatars/${player.discordId}/${player.avatar || 'default'}.png`}
                          alt={player.username}
                          className="player-avatar-small"
                        />
                        <span className="player-name-small">{player.username}</span>
                        {match.mvp === player.discordId && <span className="mvp-badge-small">👑</span>}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="match-divider">VS</div>

                <div className={`match-team ${match.winner === 'team2' ? 'winner' : 'loser'}`}>
                  <div className="team-header">
                    <span className="team-name">EQUIPO 2</span>
                    {match.winner === 'team2' && <span className="winner-badge">🏆 GANADOR</span>}
                  </div>
                  <div className="team-players">
                    {match.team2.map((player) => (
                      <div key={player.discordId} className="team-player">
                        <img
                          src={`https://cdn.discordapp.com/avatars/${player.discordId}/${player.avatar || 'default'}.png`}
                          alt={player.username}
                          className="player-avatar-small"
                        />
                        <span className="player-name-small">{player.username}</span>
                        {match.mvp === player.discordId && <span className="mvp-badge-small">👑</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {match.wager > 0 && (
                <div className="match-footer">
                  <span className="wager-info">💰 WAGER: {match.wager} puntos</span>
                </div>
              )}

              {match.transcriptUrl && (
                <div className="match-footer">
                  <a 
                    href={match.transcriptUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="transcript-link"
                  >
                    📄 Ver transcripción
                  </a>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default History;
