import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import RestrictedContent from '../components/RestrictedContent';
import './Seasons.css';

const Seasons = () => {
  const { user } = useAuth();
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [seasonStats, setSeasonStats] = useState(null);
  const [loading, setLoading] = useState(true);

  if (!user) {
    return <RestrictedContent />;
  }

  useEffect(() => {
    fetchSeasons();
  }, []);

  const fetchSeasons = async () => {
    try {
      const response = await axios.get(API_CONFIG.ENDPOINTS.API.SEASONS);
      setSeasons(response.data);
      if (response.data.length > 0) {
        setSelectedSeason(response.data[0]);
        fetchSeasonStats(response.data[0]);
      }
    } catch (error) {
      console.error('Error al obtener temporadas:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSeasonStats = async (season) => {
    try {
      const response = await axios.get(API_CONFIG.ENDPOINTS.API.RANKING, {
        params: { season, limit: 10 }
      });
      setSeasonStats(response.data);
    } catch (error) {
      console.error('Error al obtener estadísticas de temporada:', error);
    }
  };

  const handleSeasonChange = (season) => {
    setSelectedSeason(season);
    fetchSeasonStats(season);
  };

  if (loading) {
    return <div className="loading">Cargando temporadas...</div>;
  }

  return (
    <div className="seasons">
      <div className="seasons-header">
        <h1 className="seasons-title">TEMPORADAS</h1>
        
        <div className="season-selector">
          {seasons.map((season) => (
            <button
              key={season}
              className={`season-btn ${selectedSeason === season ? 'active' : ''}`}
              onClick={() => handleSeasonChange(season)}
            >
              TEMPORADA {season}
            </button>
          ))}
        </div>
      </div>

      {selectedSeason && (
        <div className="season-content">
          <div className="season-info">
            <h2>TEMPORADA {selectedSeason}</h2>
            <p>Estadísticas y ranking de la temporada seleccionada</p>
          </div>

          {seasonStats && seasonStats.length > 0 ? (
            <div className="season-ranking">
              <h3>TOP 10 DE LA TEMPORADA</h3>
              <div className="ranking-list">
                {seasonStats.map((player, index) => (
                  <div key={player.discordId} className="ranking-item">
                    <div className="rank-position">
                      {index === 0 && '🥇'}
                      {index === 1 && '🥈'}
                      {index === 2 && '🥉'}
                      {index > 2 && `#${index + 1}`}
                    </div>
                    <img
                      src={`https://cdn.discordapp.com/avatars/${player.discordId}/${player.avatar}.png`}
                      alt={player.username}
                      className="player-avatar"
                    />
                    <div className="player-info">
                      <div className="player-name">{player.username}</div>
                      <div className="player-stats">
                        <span>{player.points} pts</span>
                        <span>{player.wins} wins</span>
                        <span>{player.mvps} mvp</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="no-data">
              <p>No hay datos disponibles para esta temporada</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Seasons;
