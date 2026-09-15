import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import { Trophy, Swords, Medal, Star, Shield, Flame, Activity } from 'lucide-react';
import './Ranking.css';

const getAvatarUrl = (discordId, avatarHash) => {
  if (!avatarHash || avatarHash === 'null' || avatarHash === 'undefined') {
    try {
      const idx = discordId ? (BigInt(discordId) >> 22n) % 6n : 0n;
      return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
    } catch {
      return `https://cdn.discordapp.com/embed/avatars/0.png`;
    }
  }
  if (avatarHash.startsWith('http')) return avatarHash;
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.png`;
};

const SORT_OPTIONS = [
  { id: 'points', label: 'PUNTOS', icon: <Star size={16} /> },
  { id: 'wins', label: 'VICTORIAS', icon: <Trophy size={16} /> },
  { id: 'mvps', label: 'MVP', icon: <Shield size={16} /> },
  { id: 'streak', label: 'RACHA', icon: <Flame size={16} /> },
  { id: 'losses', label: 'DERROTAS', icon: <Activity size={16} /> },
];

const Ranking = () => {
  const { user } = useAuth();
  const [ranking, setRanking] = useState([]);
  const [sortBy, setSortBy] = useState('points');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchRanking();
    const interval = setInterval(fetchRanking, 15000);
    return () => clearInterval(interval);
  }, [sortBy]);

  const fetchRanking = async () => {
    try {
      setLoading(true);
      const res = await axios.get(API_CONFIG.ENDPOINTS.API.RANKING, { params: { sortBy } });
      const d = res.data;
      const arr = Array.isArray(d) ? d : d?.ranking ?? d?.players ?? d?.data ?? [];
      setRanking(arr);
      setError(null);
    } catch (err) {
      setError('Error al sincronizar el ranking con Discord');
    } finally {
      setLoading(false);
    }
  };

  const winRate = (wins, losses) => {
    const total = wins + losses;
    if (total === 0) return 0;
    return ((wins / total) * 100).toFixed(1);
  };

  const top3 = ranking.slice(0, 3);
  const restOfPlayers = ranking.slice(3);

  return (
    <div className="ranking-page">
      <div className="ranking-header anim-fade-up">
        <div className="ranking-title-row">
          <div>
            <div className="badge badge-live" style={{ marginBottom: 10 }}>
              <span className="dot" /> ONLINE
            </div>
            <h1 className="section-heading">RANKING <span className="text-crimson">GLOBAL</span></h1>
          </div>

          <div className="ranking-filters">
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.id}
                className={`filter-pill ${sortBy === opt.id ? 'active' : ''}`}
                onClick={() => setSortBy(opt.id)}
              >
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>
        </div>
        {error && <div className="error-message">{error}</div>}
      </div>

      {loading && ranking.length === 0 ? (
        <div className="loading-screen" style={{ minHeight: '50vh' }}>
          <div className="loading-ring" />
          <div className="loading-text">Sincronizando con Discord...</div>
        </div>
      ) : (
        <>
          {/* PODIUM DIRECT TOP 3 */}
          {top3.length >= 3 && (
            <div className="podium-container anim-fade-up d1">
              {[top3[1], top3[0], top3[2]].map((p, idx) => {
                const pos = idx === 0 ? 2 : idx === 1 ? 1 : 3;
                return (
                  <Link to={user ? `/profile/${p.discordId}` : '/login'} key={p.discordId} className={`podium-slot pos-${pos}`}>
                    <div className="podium-card">
                      <div className="podium-rank-badge">{pos}</div>
                      {pos === 1 && <CrownIcon className="podium-crown" />}
                      <div className="podium-avatar-frame">
                        <img
                          src={getAvatarUrl(p.discordId, p.avatar)}
                          alt={p.username}
                          className="podium-avatar"
                          onError={(e) => { e.target.onerror = null; e.target.src = 'https://cdn.discordapp.com/embed/avatars/0.png'; }}
                        />
                      </div>
                      <div className="podium-name">{p.username}</div>
                      <div className="podium-points">{(p.points ?? 0).toLocaleString()}</div>
                      <div className="podium-stat"><span>{p.wins} W</span> / <span>{p.mvps} MVP</span></div>
                      <div className="podium-stat-label">WR: {winRate(p.wins, p.losses)}%</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* TABLE RANKING */}
          <div className="ranking-table-card anim-fade-up d2">
            <div className="rt-head">
              <span style={{ textAlign: 'center' }}>POS</span>
              <span>JUGADOR</span>
              <span className="right" style={{ color: 'var(--text-bright)' }}>PUNTOS</span>
              <span className="right">WINS</span>
              <span className="right">MVP</span>
              <span className="right">WR%</span>
            </div>
            
            <div className="rt-body">
              {restOfPlayers.map((p, i) => (
                <Link to={user ? `/profile/${p.discordId}` : '/login'} key={p.discordId} className="rt-row">
                  <div className="rt-cell center pos-num">{i + 4}</div>
                  <div className="rt-cell player-cell">
                    <img
                      src={getAvatarUrl(p.discordId, p.avatar)}
                      alt={p.username}
                      className="player-avatar"
                      onError={(e) => { e.target.onerror = null; e.target.src = 'https://cdn.discordapp.com/embed/avatars/0.png'; }}
                    />
                    <span className="player-name">{p.username}</span>
                  </div>
                  <div className="rt-cell right pts">{(p.points ?? 0).toLocaleString()}</div>
                  <div className="rt-cell right wins">{p.wins}</div>
                  <div className="rt-cell right mvps">{p.mvps}</div>
                  <div className="rt-cell right target">{winRate(p.wins, p.losses)}%</div>
                </Link>
              ))}
            </div>
            
            {ranking.length === 0 && !loading && (
              <div className="empty-state">No hay jugadores para esta estadística</div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const CrownIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M2.5 19h19v2h-19zm19.53-12.2l-4.04 6.2h-11.98l-4.04-6.2 3.66-2.56 2.33 4.2 3.53-7.44 3.53 7.44 2.33-4.2z" />
  </svg>
);

export default Ranking;
