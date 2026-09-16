import React from 'react';
import './Footer.css';

const Footer = () => {
  return (
    <footer className="site-footer">
      <div className="footer-content">
        <div className="footer-line"></div>
        <p className="footer-text">
          <span className="footer-muted">HECHO POR</span> 
          <span className="footer-brand">PINEDA</span>
        </p>
        <div className="footer-line"></div>
      </div>
    </footer>
  );
};

export default Footer;
