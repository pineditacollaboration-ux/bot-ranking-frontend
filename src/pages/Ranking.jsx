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
  { id: 'season', label: 'T. ACTUAL', icon: <Star size={16} /> },
  { id: 'points', label: 'GLOBAL', icon: <Star size={16} /> },
  { id: 'wins', label: 'VICTORIAS', icon: <Trophy size={16} /> },
  { id: 'mvps', label: 'MVP', icon: <Shield size={16} /> },
  { id: 'losses', label: 'DERROTAS', icon: <Activity size={16} /> },
];

const Ranking = () => {
  const { user } = useAuth();
  const [ranking, setRanking] = useState([]);
  const [sortBy, setSortBy] = useState('season');
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
      const res = await axios.get(API_CONFIG.ENDPOINTS.API.RANKING, { params: { type: sortBy } });
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
      <div className="ranking-header">
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
            <div className="podium-container">
              {[top3[1], top3[0], top3[2]].map((p, idx) => {
                const pos = idx === 0 ? 2 : idx === 1 ? 1 : 3;
                const censor = !user;
                const dName = censor ? '???' : p.username;
                const dPts = censor ? '—' : (p.points ?? 0).toLocaleString();
                const dWins = censor ? '—' : p.wins;
                const dMvps = censor ? '—' : p.mvps;
                const dAvatar = censor ? null : getAvatarUrl(p.discordId, p.avatar);

                const cardContent = (
                    <div className="podium-card" style={censor ? { filter: 'blur(3px)', userSelect: 'none' } : {}}>
                      <div className="podium-rank-badge">{pos}</div>
                      {pos === 1 && <CrownIcon className="podium-crown" />}
                      <div className="podium-avatar-frame">
                        {dAvatar ?
                          <img
                            src={dAvatar}
                            alt={dName}
                            className="podium-avatar"
                            onError={(e) => { e.target.onerror = null; e.target.src = 'https://cdn.discordapp.com/embed/avatars/0.png'; }}
                          /> : <div className="podium-avatar" style={{background:'#222', display:'flex', alignItems:'center', justifyContent:'center'}}>?</div>
                        }
                      </div>
                      <div className="podium-name">{dName}</div>
                      <div className="podium-points">{dPts}</div>
                      <div className="podium-stat"><span>{dWins} W</span> / <span>{dMvps} MVP</span></div>
                      {!censor && <div className="podium-stat-label">WR: {winRate(p.wins, p.losses)}%</div>}
                    </div>
                );

                return censor ? (
                   <div key={p.discordId ?? idx} className={`podium-slot pos-${pos}`}>{cardContent}</div>
                ) : (
                  <Link to={`/profile/${p.discordId}`} key={p.discordId} className={`podium-slot pos-${pos}`}>{cardContent}</Link>
                );
              })}
            </div>
          )}

          {/* TABLE RANKING */}
          <div className="ranking-table-wrap" style={{ position: 'relative' }}>
            <div className="ranking-table-head">
              <span style={{ textAlign: 'center' }}>POS</span>
              <span>JUGADOR</span>
              <span className="right" style={{ color: 'var(--text-bright)' }}>PUNTOS</span>
              <span className="right">WINS</span>
              <span className="right">MVP</span>
              <span className="right">WR%</span>
            </div>
            
            <div className="ranking-table-body">
              {restOfPlayers.map((p, i) => {
                const censor = !user;
                const inner = (
                   <div className="ranking-row" style={censor ? { filter: 'blur(3px)', userSelect: 'none', pointerEvents: 'none' } : {}}>
                    <div className="row-rank">{i + 4}</div>
                    <div className="row-player">
                      {censor ?
                        <div className="row-avatar" style={{background:'#222', display:'flex', alignItems:'center', justifyContent:'center'}}>?</div> :
                        <img
                          src={getAvatarUrl(p.discordId, p.avatar)}
                          alt={p.username}
                          className="row-avatar"
                          onError={(e) => { e.target.onerror = null; e.target.src = 'https://cdn.discordapp.com/embed/avatars/0.png'; }}
                        />
                      }
                      <div className="row-player-info">
                        <span className="row-player-name">{censor ? '???' : p.username}</span>
                      </div>
                    </div>
                    <div className="row-stat right highlight">{censor ? '—' : (p.points ?? 0).toLocaleString()}</div>
                    <div className="row-stat right">{censor ? '—' : p.wins}</div>
                    <div className="row-stat right">{censor ? '—' : p.mvps}</div>
                    <div className="row-stat right">{censor ? '—' : `${winRate(p.wins, p.losses)}%`}</div>
                   </div>
                );

                return censor ? (
                   <div key={p.discordId ?? i}>{inner}</div>
                ) : (
                  <Link to={`/profile/${p.discordId}`} key={p.discordId} style={{textDecoration:'none', color:'inherit'}}>
                    {inner}
                  </Link>
                );
              })}

              {!user && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(to top, rgba(2,2,5,0.9) 20%, rgba(2,2,5,0.5) 80%, transparent)' }}>
                  <div style={{ padding: '20px', textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--crimson)', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
                    <div style={{ color: 'var(--crimson)', fontSize: '12px', letterSpacing: '3px', fontWeight: 'bold', marginBottom: '8px' }}>ACCESO RESTRINGIDO</div>
                    <h2 style={{ fontSize: '32px', margin: '0 0 16px 0' }}>INICIA SESIÓN<br/><span style={{ color: 'var(--crimson)' }}>PARA VER TODO</span></h2>
                    <Link to="/login" className="nav-discord-btn" style={{ display: 'inline-flex', justifyContent: 'center' }}>ENTRAR PARA VER RANKING</Link>
                  </div>
                </div>
              )}
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
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
    <path d="M2.5 19h19v2h-19zm19.53-12.2l-4.04 6.2h-11.98l-4.04-6.2 3.66-2.56 2.33 4.2 3.53-7.44 3.53 7.44 2.33-4.2z" />
  </svg>
);

export default Ranking;
