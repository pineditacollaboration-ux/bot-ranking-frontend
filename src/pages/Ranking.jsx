import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
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
  { id: 'season',  label: 'PUNTOS' },
  { id: 'wins',    label: 'VICTORIAS' },
  { id: 'losses',  label: 'DERROTAS' },
  { id: 'mvps',    label: 'MVP' },
];

/* DiscordIcon inline */
const DiscordIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
  </svg>
);

const Ranking = () => {
  const { user, login } = useAuth();
  const [ranking, setRanking]   = useState([]);
  const [sortBy, setSortBy]     = useState('season');
  const [loading, setLoading]   = useState(true);
  const [statsObj, setStatsObj] = useState(null);

  useEffect(() => {
    fetchRanking();
    fetchStats();
    const iv = setInterval(() => { fetchRanking(); fetchStats(); }, 15000);
    return () => clearInterval(iv);
  }, [sortBy]);

  const fetchRanking = async () => {
    try {
      setLoading(true);
      const res = await axios.get(API_CONFIG.ENDPOINTS.API.RANKING, { params: { type: sortBy } });
      const d = res.data;
      const arr = Array.isArray(d) ? d : d?.ranking ?? d?.players ?? d?.data ?? [];
      setRanking(arr);
    } catch (_) {}
    finally { setLoading(false); }
  };

  const fetchStats = async () => {
    try {
      const res = await axios.get(API_CONFIG.ENDPOINTS.API.STATS);
      setStatsObj(res.data);
    } catch (_) {}
  };

  /* ---------- ROW Component ---------- */
  const PlayerRow = ({ p, idx, isGated }) => {
    const isTop3 = idx < 3;
    const rankNum = idx + 1;

    /* gated row: censor only name/avatar, show real numbers */
    const displayName    = isGated ? '???' : p.username;
    const displayHash    = isGated ? '#????' : `#${p.discordId?.slice(-4) ?? '????'}`;
    const displayPoints  = (sortBy === 'season' ? (p.seasonPoints ?? p.points ?? 0) : (p.points ?? 0)).toLocaleString();
    const displayWins    = p.wins;
    const displayLosses  = p.losses;
    const displayMvps    = p.mvps;
    const avatarSrc      = isGated ? null : getAvatarUrl(p.discordId, p.avatar);

    const inner = (
      <div className={`rt-row ${isTop3 ? 'top3-row' : ''} ${isGated ? 'gated-row' : ''}`}>
        {/* RANK */}
        <div className="rt-cell cell-rank">
          <div className={`rank-skew-badge ${isTop3 ? 'top3' : ''}`}>
            <span>{isTop3 ? '🏆 ' : ''}{rankNum}</span>
          </div>
        </div>

        {/* PLAYER */}
        <div className="rt-cell cell-player">
          <div className={`rt-avatar-wrap ${isGated ? 'blurred' : ''}`}>
            {avatarSrc
              ? <img src={avatarSrc} alt={displayName} onError={e => { e.target.onerror = null; e.target.src = 'https://cdn.discordapp.com/embed/avatars/0.png'; }} />
              : <div className="rt-avatar-placeholder">?</div>
            }
          </div>
          <div className="rt-player-info">
            <span className={`rt-username ${isGated ? 'blurred' : ''}`}>{displayName}</span>
            <span className="rt-hash">{displayHash}</span>
          </div>
        </div>

        {/* STATS */}
        <div className="rt-cell cell-pts">
          <span className={`pts-num ${isGated ? 'blurred' : ''}`}>{displayPoints}</span>
          {!isGated && <span className="pts-label">PTS</span>}
        </div>
        <div className={`rt-cell cell-wins ${isGated ? 'blurred' : ''}`}>{displayWins}</div>
        <div className={`rt-cell cell-losses ${isGated ? 'blurred' : ''}`}>{displayLosses}</div>
        <div className="rt-cell cell-mvp">
          {isGated
            ? <span className="blurred">—</span>
            : <span className="mvp-badge">⭐ {displayMvps}</span>
          }
        </div>
      </div>
    );

    if (!isGated) {
      return <Link to={`/profile/${p.discordId}`} key={p.discordId} style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</Link>;
    }
    return <div key={idx}>{inner}</div>;
  };

  /* Which rows are locked */
  const VISIBLE_FREE = 0; // everything censored if not logged in

  return (
    <div className="ranking-page">

      {/* ── HEADER ── */}
      <div className="rk-header">
        <div className="rk-header-left">
          <div className="rk-season-tag">
            <span className="rk-season-line" />
            {statsObj?.currentSeason ? statsObj.currentSeason.toUpperCase() : '— CARGANDO —'}
          </div>
          <h1 className="rk-big-title">
            RANKING<br />
            <span className="rk-red-grad">OFICIAL</span>
          </h1>
          <p className="rk-subtext">
            Los mejores jugadores de la ranked.<br />
            Cada punto conquistado con sangre y sudor.
          </p>
        </div>

        <div className="rk-header-right">
          <div className="rk-stat-pill">
            <span className="rsp-icon">👤</span>
            <span className="rsp-val">{(statsObj?.totalPlayers ?? 0).toLocaleString()}+</span>
            <span className="rsp-key">JUGADORES</span>
          </div>
          <div className="rk-stat-pill">
            <span className="rsp-icon" style={{ color: '#ff4444' }}>⚡</span>
            <span className="rsp-val">{statsObj?.activeMatches ?? 0}+</span>
            <span className="rsp-key">LOBBIES ACTIVOS</span>
          </div>
          <div className="rk-stat-pill">
            <span className="rsp-icon" style={{ color: '#ffd700' }}>⭐</span>
            <span className="rsp-val" style={{ fontSize: statsObj?.currentSeason && statsObj.currentSeason.length > 4 ? '14px' : undefined }}>
              {statsObj?.currentSeason ?? '...'}
            </span>
            <span className="rsp-key">TEMPORADA ACTIVA</span>
          </div>
        </div>
      </div>

      {/* ── FILTERS ── */}
      <div className="rk-filters">
        <div className="rk-filter-group">
          <span className="rk-filter-label">ORDENAR POR</span>
          <div className="rk-pills">
            {SORT_OPTIONS.map(o => (
              <button
                key={o.id}
                className={`rk-pill ${sortBy === o.id ? 'active' : ''}`}
                onClick={() => setSortBy(o.id)}
              >
                <span>{o.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── TABLE ── */}
      <div className="rk-table-wrap">

        {/* Table header */}
        <div className="rk-table-head">
          <div className="rk-th" style={{ width: '80px', textAlign: 'center' }}>#</div>
          <div className="rk-th" style={{ flex: 1 }}>JUGADOR</div>
          <div className="rk-th right-align" style={{ width: '130px' }}>⚡ PUNTOS</div>
          <div className="rk-th center-align" style={{ width: '100px' }}>🛡 VICTORIAS</div>
          <div className="rk-th center-align" style={{ width: '100px' }}>DERROTAS</div>
          <div className="rk-th center-align" style={{ width: '110px' }}>⭐ MVP</div>
        </div>

        {/* Body */}
        <div className="rk-table-body" style={{ position: 'relative' }}>
          {loading && ranking.length === 0 ? (
            <div className="rk-empty">
              <div className="loading-ring" style={{ width: 36, height: 36, marginBottom: 12 }} />
              Sincronizando ranking...
            </div>
          ) : ranking.length === 0 ? (
            <div className="rk-empty">No hay jugadores registrados aún.</div>
          ) : (
            <>
              {ranking.map((p, idx) => (
                <PlayerRow key={p.discordId ?? idx} p={p} idx={idx} isGated={!user && idx >= VISIBLE_FREE} />
              ))}

              {/* ── GATED OVERLAY (no session) ── */}
              {!user && ranking.length > VISIBLE_FREE && (
                <div className="rk-gate-overlay">
                  <div className="rk-gate-card">
                    <div className="rk-gate-lines">
                      <span className="rgl" /><span className="rk-gate-restrict">ACCESO RESTRINGIDO</span><span className="rgl" />
                    </div>
                    <h2 className="rk-gate-title">
                      INICIA SESIÓN<br /><span>PARA VER</span>
                    </h2>
                    <p className="rk-gate-desc">
                      Conecta tu cuenta de Discord para acceder<br />
                      al ranking completo de la plataforma.
                    </p>
                    <button className="rk-gate-btn" onClick={login}>
                      <DiscordIcon />
                      <span>ENTRAR CON DISCORD</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Ranking;


