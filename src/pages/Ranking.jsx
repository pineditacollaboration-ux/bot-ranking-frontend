import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { API_CONFIG } from '../config/api';
import { useAuth } from '../context/AuthContext';
import RestrictedContent from '../components/RestrictedContent';
import './Ranking.css';

const getAvatarUrl = (discordId, avatarHash) => {
  if (avatarHash && avatarHash !== 'null' && avatarHash !== 'undefined') {
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.png`;
  }
  try {
    const idx = discordId ? (BigInt(discordId) >> 22n) % 6n : 0n;
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
  } catch {
    return `https://cdn.discordapp.com/embed/avatars/0.png`;
  }
};

const SORT_OPTIONS = [
  { value: 'points',  label: '⭐ PUNTOS' },
  { value: 'wins',    label: '🏆 VICTORIAS' },
  { value: 'mvps',   label: '👑 MVP' },
  { value: 'streak', label: '🔥 RACHA' },
  { value: 'losses', label: '💀 DERROTAS' },
];

const SHIMMER_ROWS = 8;

const Ranking = () => {
  const { user } = useAuth();
  const [players, setPlayers] = useState([]);
  const [sortBy, setSortBy] = useState('points');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetchRanking();
    const iv = setInterval(fetchRanking, 15000);
    return () => clearInterval(iv);
  }, [sortBy, user]);

  const fetchRanking = async () => {
    try {
      const res = await axios.get(API_CONFIG.ENDPOINTS.API.RANKING, { params: { sortBy } });
      const d = res.data;
      const arr = Array.isArray(d) ? d : d?.ranking ?? d?.players ?? d?.data ?? [];
      setPlayers(arr);
    } catch {
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return <RestrictedContent />;

  const top3 = players.slice(0, 3);
  const rest = players.slice(3);

  return (
    <div className="ranking-page">
      {/* Header */}
      <div className="ranking-page-header anim-fade-up">
        <div className="ranking-page-header-top">
          <div className="ranking-title-block">
            <div className="badge badge-live" style={{ width: 'fit-content', marginBottom: 8 }}>
              <span className="dot" /> RANKING EN VIVO
            </div>
            <h1 className="section-heading">CLASIFICACIÓN <span className="text-crimson">GLOBAL</span></h1>
            <p className="section-lead">Los mejores jugadores de la comunidad Royal Ranked</p>
          </div>
          <div className="sort-pills">
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`sort-pill ${sortBy === opt.value ? 'active' : ''}`}
                onClick={() => setSortBy(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* PODIUM (top 3) */}
      {!loading && top3.length >= 3 && (
        <div className="podium-section anim-fade-up d1">
          {/* Reorder: 2nd, 1st, 3rd */}
          {[top3[1], top3[0], top3[2]].map((player, displayIdx) => {
            const realRank = displayIdx === 0 ? 2 : displayIdx === 1 ? 1 : 3;
            const rankClass = `rank-${realRank}`;
            const avatarUrl = getAvatarUrl(player.discordId, player.avatar);
            const winRate = player.matchesPlayed > 0
              ? ((player.wins / player.matchesPlayed) * 100).toFixed(0)
              : 0;

            return (
              <Link
                key={player.discordId}
                to={`/profile/${player.discordId}`}
                className={`podium-card ${rankClass}`}
              >
                {realRank === 1 && <div className="podium-crown">👑</div>}

                <div className="podium-rank-label">
                  {realRank === 1 ? '1°' : realRank === 2 ? '2°' : '3°'}
                </div>

                <div className="podium-avatar-wrap">
                  <img
                    src={avatarUrl}
                    alt={player.username}
                    className="podium-avatar"
                    onError={e => {
                      e.target.onerror = null;
                      e.target.src = 'https://cdn.discordapp.com/embed/avatars/0.png';
                    }}
                  />
                  <div className="podium-platform-badge">
                    {player.platform === 'pc' ? '🖥️' : '📱'}
                  </div>
                </div>

                <div className="podium-name">{player.username}</div>

                <div className="podium-points">{(player.points ?? 0).toLocaleString()}</div>
                <div className="podium-pts-label">PUNTOS</div>

                <div className="podium-stats-row">
                  <div className="podium-stat">
                    <span className="podium-stat-val">{player.wins}</span>
                    <span className="podium-stat-key">WINS</span>
                  </div>
                  <div className="podium-stat">
                    <span className="podium-stat-val">{player.mvps}</span>
                    <span className="podium-stat-key">MVP</span>
                  </div>
                  <div className="podium-stat">
                    <span className="podium-stat-val">{winRate}%</span>
                    <span className="podium-stat-key">WR</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* TABLE (rank 4+) */}
      <div className="ranking-table-wrap anim-fade-up d2">
        <div className="ranking-table-head">
          <span className="center">#</span>
          <span>JUGADOR</span>
          <span className="right">PUNTOS</span>
          <span className="right">WINS</span>
          <span className="right">DERROTAS</span>
          <span className="center">MVP</span>
          <span className="right">RACHA</span>
        </div>

        <div className="ranking-table-body">
          {loading ? (
            Array.from({ length: SHIMMER_ROWS }).map((_, i) => (
              <div key={i} className="shimmer-row">
                <div className="shimmer-cell" style={{ height: 20, borderRadius: 4 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="shimmer-avatar" />
                  <div className="shimmer-cell" style={{ flex: 1, height: 18 }} />
                </div>
                <div className="shimmer-cell" />
                <div className="shimmer-cell" />
                <div className="shimmer-cell" />
                <div className="shimmer-cell" />
                <div className="shimmer-cell" />
              </div>
            ))
          ) : rest.length === 0 && top3.length === 0 ? (
            <div className="ranking-empty">No hay jugadores en el ranking todavía</div>
          ) : (
            rest.map((player, i) => {
              const pos = i + 4;
              const avatarUrl = getAvatarUrl(player.discordId, player.avatar);
              return (
                <Link
                  key={player.discordId}
                  to={`/profile/${player.discordId}`}
                  className="ranking-row"
                >
                  <div className="row-rank">{pos}</div>
                  <div className="row-player">
                    <img
                      src={avatarUrl}
                      alt={player.username}
                      className="row-avatar"
                      onError={e => { e.target.onerror=null; e.target.src='https://cdn.discordapp.com/embed/avatars/0.png'; }}
                    />
                    <div className="row-player-info">
                      <span className="row-player-name">{player.username}</span>
                      <span className="row-player-platform">
                        {player.platform === 'pc' ? '🖥️ PC' : '📱 MÓVIL'}
                      </span>
                    </div>
                  </div>
                  <div className="row-stat highlight">{(player.points ?? 0).toLocaleString()}</div>
                  <div className="row-stat">{player.wins}</div>
                  <div className="row-stat">{player.losses}</div>
                  <div className="row-stat center">{player.mvps}</div>
                  <div className="row-streak">
                    {player.streak > 0 ? `🔥 ${player.streak}` : player.streak ?? 0}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default Ranking;
