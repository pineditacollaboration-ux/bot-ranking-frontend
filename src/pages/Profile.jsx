import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import RestrictedContent from '../components/RestrictedContent';
import './Profile.css';

const Profile = () => {
  const { user } = useAuth();
  const { discordId } = useParams();
  const [profile, setProfile] = useState(null);
  const [recentMatches, setRecentMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  if (!user) {
    return <RestrictedContent />;
  }

  useEffect(() => {
    fetchProfile();
    const interval = setInterval(fetchProfile, 10000);
    return () => clearInterval(interval);
  }, [discordId]);

  const fetchProfile = async () => {
    try {
      const response = await axios.get(`http://localhost:3001/api/profile/${discordId}`);
      setProfile(response.data.user);
      setRecentMatches(response.data.recentMatches);
    } catch (error) {
      console.error('Error al obtener perfil:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Cargando perfil...</div>;
  }

  if (!profile) {
    return <div className="error">Usuario no encontrado</div>;
  }

  const winRate = profile.matchesPlayed > 0 
    ? ((profile.wins / profile.matchesPlayed) * 100).toFixed(1) 
    : 0;

  return (
    <div className="profile">
      <div className="profile-header">
        <div className="profile-avatar-container">
          <img
            src={`https://cdn.discordapp.com/avatars/${profile.discordId}/${profile.avatar}.png`}
            alt={profile.username}
            className="profile-avatar"
          />
          <div className="profile-platform">
            {profile.platform === 'pc' ? '🖥️ PC' : '📱 MÓVIL'}
          </div>
        </div>

        <div className="profile-info">
          <h1 className="profile-name">{profile.username}</h1>
          <p className="profile-id">ID: {profile.discordId}</p>
          
          {profile.isStaff && (
            <div className="staff-badge">👑 STAFF</div>
          )}
        </div>
      </div>

      <div className="profile-stats">
        <div className="stat-card stat-primary">
          <div className="stat-value">{profile.points}</div>
          <div className="stat-label">PUNTOS</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{profile.wins}</div>
          <div className="stat-label">VICTORIAS</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{profile.losses}</div>
          <div className="stat-label">DERROTAS</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{profile.mvps}</div>
          <div className="stat-label">MVP</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{winRate}%</div>
          <div className="stat-label">WIN RATE</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{profile.maxStreak}</div>
          <div className="stat-label">RACHA MÁX</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{profile.matchesPlayed}</div>
          <div className="stat-label">PARTIDAS</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{profile.wagerWon}</div>
          <div className="stat-label">WAGERS GANADOS</div>
        </div>
      </div>

      <div className="profile-sections">
        <div className="profile-section">
          <h2 className="section-title">PARTIDAS RECIENTES</h2>
          {recentMatches.length === 0 ? (
            <p className="no-matches">No hay partidas recientes</p>
          ) : (
            <div className="matches-list">
              {recentMatches.map((match) => (
                <div key={match.matchId} className="match-card">
                  <div className="match-header">
                    <span className="match-type">{match.gameType}</span>
                    <span className="match-date">
                      {new Date(match.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="match-teams">
                    <div className={`team ${match.winner === 'team1' ? 'winner' : ''}`}>
                      <span className="team-label">EQUIPO 1</span>
                      {match.team1.map((player) => (
                        <span key={player.discordId} className="team-player">
                          {player.username}
                          {match.mvp === player.discordId && <span className="mvp-badge">👑</span>}
                        </span>
                      ))}
                    </div>
                    <div className="vs">VS</div>
                    <div className={`team ${match.winner === 'team2' ? 'winner' : ''}`}>
                      <span className="team-label">EQUIPO 2</span>
                      {match.team2.map((player) => (
                        <span key={player.discordId} className="team-player">
                          {player.username}
                          {match.mvp === player.discordId && <span className="mvp-badge">👑</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                  {match.wager > 0 && (
                    <div className="match-wager">💰 Wager: {match.wager}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;
