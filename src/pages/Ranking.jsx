import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import './Ranking.css';

const getAvatarUrl = (discordId, avatarHash) => {
  if (!avatarHash || avatarHash === 'null' || avatarHash === 'undefined') {
    return 'https://cdn.discordapp.com/embed/avatars/0.png';
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

const DiscordIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
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

  const PlayerRow = ({ p, idx, isGated }) => {
    const isTop = idx < 3;
    const rankNum = idx + 1;

    const displayName    = isGated ? '???' : p.username;
    const displayHash    = isGated ? '#????' : `#${p.discordId?.slice(-4) ?? '????'}`;
    const displayPoints  = (p.points ?? 0).toLocaleString();
    const avatarSrc      = isGated ? null : getAvatarUrl(p.discordId, p.avatar);

    return (
      <div className={`tbl-row ${isGated ? 'gated-row' : ''}`}>
        <div className="tbl-cell tbl-rank">
          <div className={`rank-badge ${idx===0 ? 'gold' : idx===1 ? 'silver' : idx===2 ? 'bronze' : ''}`}>
             <span className="rank-badge-content">{isTop ? '🏆 ' : ''}{rankNum}</span>
          </div>
        </div>

        <div className="tbl-cell tbl-player">
          <div className={`player-avatar-wrap ${isGated ? 'blur' : ''}`}>
             {avatarSrc ? <img src={avatarSrc} alt="" /> : <div className="avatar-ph">?</div>}
          </div>
          <div className="player-info">
             <span className={`player-name ${isGated ? 'blur' : ''}`}>{displayName}</span>
             <span className="player-hash">{displayHash}</span>
          </div>
        </div>

        <div className="tbl-cell tbl-points">
           <span className="electric">{displayPoints}</span>
           <span className="pts-txt">PTS</span>
        </div>
        <div className="tbl-cell tbl-wins text-green">{p.wins ?? 0}</div>
        <div className="tbl-cell tbl-losses">{p.losses ?? 0}</div>
        <div className="tbl-cell tbl-mvp">
           {isGated ? <span className="blur">—</span> : <span className="mvp-star">⭐ {p.mvps ?? 0}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="rank-wrapper">
      <div className="rank-container">
        
        {/* Header */}
        <div className="rank-header">
          <div className="rh-left">
            <div className="hero-subtitle">
              <span className="hero-line"></span>
              {statsObj?.currentSeason ? String(statsObj.currentSeason).toUpperCase() : 'TEMPORADA 1 — 2026'}
            </div>
            <h1 className="hero-title">
              <span className="text-white">RANKING<br/></span>
              <span className="text-gradient">OFICIAL</span>
            </h1>
            <p className="hero-desc">
              Los mejores jugadores de la ranked. Cada punto conquistado con<br/>sangre y sudor.
            </p>
          </div>

          <div className="rh-right">
             <div className="stat-card">
               <div className="stat-card-inner">
                 <span className="sc-icon text-red">👤</span>
                 <span className="sc-val">{(statsObj?.totalPlayers ?? 0).toLocaleString()}+</span>
                 <span className="sc-key">JUGADORES</span>
               </div>
             </div>
             <div className="stat-card">
               <div className="stat-card-inner">
                 <span className="sc-icon text-white">⚡</span>
                 <span className="sc-val">{statsObj?.activeMatches ?? 0}+</span>
                 <span className="sc-key">LOBBIES ACTIVOS</span>
               </div>
             </div>
             <div className="stat-card">
               <div className="stat-card-inner">
                 <span className="sc-icon text-red">⭐</span>
                 <span className="sc-val" style={{ fontSize: statsObj?.currentSeason && String(statsObj.currentSeason).length > 5 ? '16px' : undefined }}>
                   {statsObj?.currentSeason ? String(statsObj.currentSeason).toUpperCase() : 'S1'}
                 </span>
                 <span className="sc-key">TEMPORADA</span>
               </div>
             </div>
          </div>
        </div>

        {/* Filters */}
        <div className="rank-filters">
           <div className="rf-group">
              <span className="rf-label">DIVISIÓN</span>
              <div className="rf-pills">
                 <button className="btn-skewed rf-pill active"><span className="btn-skewed-content">MASCULINO</span></button>
                 <button className="btn-skewed rf-pill"><span className="btn-skewed-content">FEMININO</span></button>
              </div>
           </div>
           <div className="rf-group">
              <span className="rf-label">ORDENAR POR</span>
              <div className="rf-pills">
                 {SORT_OPTIONS.map(o => (
                   <button key={o.id} className={`btn-skewed rf-pill ${sortBy === o.id ? 'active' : ''}`} onClick={() => setSortBy(o.id)}>
                     <span className="btn-skewed-content">{o.label}</span>
                   </button>
                 ))}
              </div>
           </div>
        </div>

        {/* TABLE */}
        <div className="table-wrapper">
           <div className="tbl-head">
              <div className="tbl-th" style={{width: '90px'}}>#</div>
              <div className="tbl-th" style={{flex: 1}}>JUGADOR</div>
              <div className="tbl-th align-r" style={{width: '180px'}}>⚡ PUNTOS</div>
              <div className="tbl-th align-c" style={{width: '120px'}}>🛡 VICTORIAS</div>
              <div className="tbl-th align-c" style={{width: '120px'}}>DERROTAS</div>
              <div className="tbl-th align-c" style={{width: '120px'}}>⭐ MVP</div>
           </div>

           <div className="tbl-body">
             {loading && ranking.length === 0 ? (
                <div className="tbl-empty">Cargando...</div>
             ) : (
               <>
                 {ranking.map((p, i) => (
                   <PlayerRow key={p.discordId ?? i} p={p} idx={i} isGated={!user && i >= 0} />
                 ))}

                 {/* Premium Overlay */}
                 {!user && ranking.length > 0 && (
                   <div className="tbl-overlay">
                      <h2 className="to-title"><span className="text-gradient">RANKING</span> RESTRINGIDO</h2>
                      <p className="to-sub">Inicia sesión con tu Discord para ver el ranking completo de la temporada.</p>
                      <button onClick={login} className="btn-skewed btn-red" style={{marginTop: '20px'}}>
                         <span className="btn-skewed-content"><DiscordIcon/> ENTRAR CON DISCORD</span>
                      </button>
                   </div>
                 )}
               </>
             )}
           </div>
        </div>

      </div>
    </div>
  );
};

export default Ranking;
