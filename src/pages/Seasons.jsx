import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import RestrictedContent from '../components/RestrictedContent';
import { Trophy, Crown } from 'lucide-react';
import './Seasons.css';

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

const Seasons = () => {
  const { user } = useAuth();
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [seasonStats, setSeasonStats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchSeasons();
  }, [user]);

  const fetchSeasons = async () => {
    try {
      const res = await axios.get(API_CONFIG.ENDPOINTS.API.SEASONS);
      const d = res.data;
      const arr = Array.isArray(d) ? d : d?.seasons ?? d?.data ?? [];
      setSeasons(arr);
      if (arr.length > 0) {
        setSelectedSeason(arr[0]);
        fetchSeasonStats(arr[0]);
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  };

  const fetchSeasonStats = async (season) => {
    setLoading(true);
    try {
      const res = await axios.get(API_CONFIG.ENDPOINTS.API.RANKING, { params: { season, limit: 20 } });
      const d = res.data;
      const arr = Array.isArray(d) ? d : d?.ranking ?? d?.players ?? d?.data ?? [];
      setSeasonStats(arr);
    } catch {
      setSeasonStats([]);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return <RestrictedContent />;

  const top3 = seasonStats.slice(0, 3);
  const rest = seasonStats.slice(3);

  return (
    <div className="seasons-page">
      <div className="seasons-header anim-fade-up">
        <div className="seasons-title-row">
          <div>
            <div className="badge badge-live" style={{ marginBottom: 10 }}>
              <span className="dot" /> HISTORIAL
            </div>
            <h1 className="section-heading">TEMPORADAS <span className="text-crimson">OFICIALES</span></h1>
          </div>
          {seasons.length > 0 && (
            <div className="season-tabs">
              {seasons.map(s => (
                <button
                  key={s}
                  className={`season-tab ${selectedSeason === s ? 'active' : ''}`}
                  onClick={() => { setSelectedSeason(s); fetchSeasonStats(s); }}
                >
                  TEMPORADA {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {seasons.length === 0 && !loading && (
        <div className="seasons-empty">
          <div className="seasons-empty-icon"><Trophy size={64} style={{ opacity: 0.3 }} /></div>
          <div className="seasons-empty-text">No hay temporadas registradas</div>
          <div className="seasons-empty-sub">Las temporadas aparecerán aquí cuando estén disponibles</div>
        </div>
      )}

      {selectedSeason && (
        <>
          <div className="season-hero anim-fade-up d1">
            <div className="season-hero-badge">RESULTADOS FINALES</div>
            <div className="season-hero-title">TEMPORADA <span>{selectedSeason}</span></div>
            <div className="season-hero-sub">
              {loading
                ? <div className="skeleton-box" style={{ width: 250, height: 20, margin: '10px auto' }} />
                : `${seasonStats.length} jugadores clasificados en esta temporada`
              }
            </div>
          </div>

          {loading ? (
            <div className="season-podium anim-fade-up d2">
              {[2, 1, 3].map(pos => (
                <div key={pos} className={`season-podium-card pos-${pos}`}>
                  <div className="sp-pos">{pos}°</div>
                  <div className="skeleton-box skeleton-avatar" />
                  <div className="skeleton-box" style={{ width: 100, height: 20, marginTop: 10 }} />
                  <div className="skeleton-box" style={{ width: 60, height: 30, margin: '14px 0' }} />
                </div>
              ))}
            </div>
          ) : seasonStats.length === 0 ? (
            <div className="seasons-empty">
              <div className="seasons-empty-icon"><Trophy size={64} style={{ opacity: 0.3 }} /></div>
              <div className="seasons-empty-text">Sin datos para esta temporada</div>
            </div>
          ) : (
            <>
              {top3.length >= 3 && (
                <div className="season-podium anim-fade-up d2">
                  {[top3[1], top3[0], top3[2]].map((p, idx) => {
                    const pos = idx === 0 ? 2 : idx === 1 ? 1 : 3;
                    return (
                      <div key={p.discordId} className={`season-podium-card pos-${pos}`}>
                        {pos === 1 && <div style={{ position: 'absolute', top: 8 }}><Crown size={24} className="text-gold" /></div>}
                        <div className="sp-pos">{pos}°</div>
                        <img
                          src={getAvatarUrl(p.discordId, p.avatar)}
                          alt={p.username}
                          className="sp-avatar"
                          onError={e => { e.target.onerror=null; e.target.src='https://cdn.discordapp.com/embed/avatars/0.png'; }}
                        />
                        <div className="sp-name">{p.username}</div>
                        <div className="sp-points">{(p.points ?? 0).toLocaleString()}</div>
                        <div className="sp-pts-label">PUNTOS</div>
                        <div className="sp-stats">
                          <div className="sp-stat">
                            <span className="sp-stat-v">{p.wins}</span>
                            <span className="sp-stat-k">WINS</span>
                          </div>
                          <div className="sp-stat">
                            <span className="sp-stat-v">{p.mvps}</span>
                            <span className="sp-stat-k">MVP</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {rest.length > 0 && (
                <div className="season-rest-table anim-fade-up d3">
                  <div className="season-rest-head">
                    <span style={{ textAlign: 'center' }}>#</span>
                    <span>JUGADOR</span>
                    <span className="right">PUNTOS</span>
                    <span className="right">WINS</span>
                    <span className="right">MVP</span>
                  </div>
                  <div>
                    {rest.map((p, i) => (
                      <div key={p.discordId} className="season-rest-row">
                        <div className="srr-pos">{i + 4}</div>
                        <div className="srr-player">
                          <img
                            src={getAvatarUrl(p.discordId, p.avatar)}
                            alt={p.username}
                            className="srr-avatar"
                            onError={e => { e.target.onerror=null; e.target.src='https://cdn.discordapp.com/embed/avatars/0.png'; }}
                          />
                          <span className="srr-name">{p.username}</span>
                        </div>
                        <div className="srr-stat pts">{(p.points ?? 0).toLocaleString()}</div>
                        <div className="srr-stat">{p.wins}</div>
                        <div className="srr-stat">{p.mvps}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default Seasons;
