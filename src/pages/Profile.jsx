import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import RestrictedContent from '../components/RestrictedContent';
import './Profile.css';

const Profile = () => {
  const { user } = useAuth();
  const { discordId } = useParams();
  const [profile, setProfile] = useState(null);
  const [recentMatches, setRecentMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  if (!user) return <RestrictedContent />;

  useEffect(() => {
    fetchProfile();
    const iv = setInterval(fetchProfile, 15000);
    return () => clearInterval(iv);
  }, [discordId]);

  const fetchProfile = async () => {
    try {
      const res = await axios.get(API_CONFIG.ENDPOINTS.API.PROFILE(discordId));
      setProfile(res.data.user);
      setRecentMatches(res.data.recentMatches ?? []);
    } catch (_) {}
    finally { setLoading(false); }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-ring" />
        <div className="loading-text">Cargando perfil...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="profile-page">
        <div className="profile-not-found">
          <div style={{ fontSize: 80 }}>😶</div>
          <h2>JUGADOR NO ENCONTRADO</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            Este perfil no existe o no ha participado en partidas aún.
          </p>
          <Link to="/ranking" className="btn-primary" style={{ marginTop: 16 }}>
            ← Volver al Ranking
          </Link>
        </div>
      </div>
    );
  }

  const avatarUrl = profile.avatar && profile.avatar !== 'null' && profile.avatar !== 'undefined'
    ? `https://cdn.discordapp.com/avatars/${profile.discordId}/${profile.avatar}.png`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;

  const winRate = profile.matchesPlayed > 0
    ? ((profile.wins / profile.matchesPlayed) * 100).toFixed(1)
    : 0;

  const stats = [
    { key: 'PUNTOS',       val: (profile.points ?? 0).toLocaleString(), primary: true },
    { key: 'VICTORIAS',    val: profile.wins ?? 0 },
    { key: 'DERROTAS',     val: profile.losses ?? 0 },
    { key: 'MVP',          val: profile.mvps ?? 0 },
    { key: 'PARTIDAS',     val: profile.matchesPlayed ?? 0 },
    { key: 'RACHA MÁX',   val: profile.maxStreak ?? 0 },
    { key: 'WAGERS',       val: profile.wagerWon ?? 0 },
    { key: 'WIN RATE',     val: `${winRate}%` },
  ];

  return (
    <div className="profile-page">
      {/* HEADER CARD */}
      <div className="profile-header-card anim-fade-up">
        <div className="profile-header-banner" />
        <div className="profile-header-content">
          <div className="profile-avatar-frame">
            <img
              src={avatarUrl}
              alt={profile.username}
              className="profile-avatar-img"
              onError={e => { e.target.onerror=null; e.target.src='https://cdn.discordapp.com/embed/avatars/0.png'; }}
            />
            <div className="profile-platform-badge">
              {profile.platform === 'pc' ? '🖥️' : '📱'}
            </div>
          </div>
          <div className="profile-info">
            <h1 className="profile-name">{profile.username}</h1>
            <div className="profile-discordid">ID: {profile.discordId}</div>
            <div className="profile-badges">
              {profile.isStaff && <span className="profile-badge">👑 STAFF</span>}
              <span className="profile-badge badge-live" style={{ background: 'rgba(232,0,42,0.1)', borderColor: 'rgba(232,0,42,0.3)', color: 'var(--crimson-glow)' }}>
                {profile.platform === 'pc' ? '🖥️ PC' : '📱 MÓVIL'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* STATS GRID */}
      <div className="profile-stats-grid anim-fade-up d1">
        {stats.map(s => (
          <div key={s.key} className={`profile-stat-cell ${s.primary ? 'primary' : ''}`}>
            <div className="profile-stat-val">{s.val}</div>
            <div className="profile-stat-key">{s.key}</div>
          </div>
        ))}
      </div>

      {/* WIN RATE BAR */}
      <div className="winrate-section anim-fade-up d2">
        <div className="winrate-header">
          <span className="winrate-title">📈 TASA DE VICTORIA</span>
          <span className="winrate-pct">{winRate}%</span>
        </div>
        <div className="winrate-bar-bg">
          <div className="winrate-bar-fill" style={{ width: `${Math.min(winRate, 100)}%` }} />
        </div>
        <div className="winrate-labels">
          <span className="winrate-label">0%</span>
          <span className="winrate-label">{profile.wins ?? 0} victorias / {profile.losses ?? 0} derrotas</span>
          <span className="winrate-label">100%</span>
        </div>
      </div>

      {/* RECENT MATCHES */}
      <div className="matches-section anim-fade-up d3">
        <div className="matches-title">⚔️ PARTIDAS RECIENTES</div>

        {recentMatches.length === 0 ? (
          <div className="no-matches">No hay partidas recientes registradas</div>
        ) : (
          recentMatches.map(match => (
            <div key={match.matchId} className="match-card">
              <div className="match-card-top">
                <span className="match-type-badge">{match.gameType ?? 'RANKED'}</span>
                <span className="match-date">
                  {new Date(match.createdAt).toLocaleDateString('es', {
                    day: '2-digit', month: 'short', year: 'numeric'
                  })}
                </span>
              </div>

              <div className="match-versus">
                <div className="match-team left">
                  <span className="match-team-label">EQUIPO 1 {match.winner === 'team1' ? '🏆' : ''}</span>
                  {(match.team1 ?? []).map(p => (
                    <span key={p.discordId} className={`match-team-name ${match.winner === 'team1' ? 'winner' : ''}`}>
                      {p.username}
                      {match.mvp === p.discordId && <span className="mvp-tag">👑</span>}
                    </span>
                  ))}
                </div>

                <div className="match-vs-divider">VS</div>

                <div className="match-team right">
                  <span className="match-team-label">{match.winner === 'team2' ? '🏆' : ''} EQUIPO 2</span>
                  {(match.team2 ?? []).map(p => (
                    <span key={p.discordId} className={`match-team-name ${match.winner === 'team2' ? 'winner' : ''}`}>
                      {match.mvp === p.discordId && <span className="mvp-tag">👑</span>}
                      {p.username}
                    </span>
                  ))}
                </div>
              </div>

              {match.wager > 0 && (
                <div className="match-wager-tag">💰 WAGER: {match.wager} PTS</div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Profile;
