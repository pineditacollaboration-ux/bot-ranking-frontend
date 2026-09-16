import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

const Footer = () => {
  return (
    <footer className="rr-footer">
      <div className="rr-footer-content">
        <div className="rr-footer-left">
          <h3 className="rr-footer-brand">ROYAL <span>RANKED</span></h3>
          <p className="rr-footer-desc">
            Plataforma competitiva líder en la comunidad. Registramos, 
            procesamos y premiamos el verdadero nivel de juego.
          </p>
        </div>
        
        <div className="rr-footer-links">
          <div className="rr-footer-col">
            <h4>Secciones</h4>
            <Link to="/">Inicio</Link>
            <Link to="/ranking">Ranking Oficial</Link>
            <Link to="/temporadas">Historial</Link>
          </div>
          <div className="rr-footer-col">
            <h4>Comunidad</h4>
            <a href="https://discord.gg/zscGKBdfGA" target="_blank" rel="noreferrer">Únete al Discord</a>
            <a href="#" onClick={(e) => e.preventDefault()}>Términos y Reglas</a>
          </div>
        </div>
      </div>
      
      <div className="rr-footer-bottom">
        <p>&copy; {new Date().getFullYear()} ROYAL RANKED. Todos los derechos reservados.</p>
        <div className="rr-footer-social">
          {/* Social placeholders if needed */}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
