import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import './Home.css';

const Home = () => {
  const { user } = useAuth();
  
  return (
    <div className="home-page-real">
      <div className="home-hero-real">
         
         <div className="hhr-left anim-fade-up">
            <div className="hhr-subtitle">
              <span className="hhr-line"></span>
              RANKED DE LIGA COMPETITIVA
            </div>

            <h1 className="hhr-title">
              REAL <span className="hhr-title-red">RANKED</span>
            </h1>

            <p className="hhr-desc">
              COMUNIDAD DESTINADA AL PÚBLICO COMPETITIVO. SALAS DE<br/>
              INTERACCIÓN, JUGADAS, Y EVENTOS ÉPICOS EN DISCORD.
            </p>

            <div className="hhr-actions">
              <a href="https://discord.gg/royalranked" target="_blank" rel="noreferrer" className="btn-real-red-skew">
                <span className="btn-inner">
                  <span className="btn-icon">🎮</span>
                  ENTRA EN NUESTRO DISCORD
                </span>
              </a>
              <Link to="/ranking" className="btn-real-dark-skew">
                <span className="btn-inner">
                  <span className="btn-icon">↗</span>
                </span>
              </Link>
            </div>
         </div>

         <div className="hhr-right anim-fade-up d2">
            <div className="hhr-char-glow"></div>
            {/* Si tienes una imagen del personaje, se recorta y pone aquí en CSS. Por defecto el CSS creará la figura iluminada. */}
         </div>

      </div>
    </div>
  );
};

export default Home;
