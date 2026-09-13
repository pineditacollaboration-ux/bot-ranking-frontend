import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';

const Navbar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { path: '/', label: 'HOME' },
    { path: '/ranking', label: 'RANKING' },
    { path: '/temporadas', label: 'TEMPORADA' },
    { path: '/estadisticas', label: 'ESTADÍSTICAS' },
  ];

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isMobileMenuOpen && !event.target.closest('.navbar') && !event.target.closest('.mobile-menu-overlay')) {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isMobileMenuOpen]);

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          <img 
            src="/logo.gif" 
            alt="ROYAL RANKED" 
            className="logo-image" 
            loading="lazy"
            width="200"
            height="50"
          />
        </Link>

        {/* Mobile Menu Button */}
        <button 
          className="mobile-menu-button"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Toggle menu"
        >
          <span className={`hamburger ${isMobileMenuOpen ? 'open' : ''}`}>
            <span></span>
            <span></span>
            <span></span>
          </span>
        </button>

        {/* Desktop Menu */}
        <div className="navbar-menu">
          {navItems.map((item) => (
            item.external ? (
              <a
                key={item.path}
                href={item.path}
                target="_blank"
                rel="noopener noreferrer"
                className="nav-link btn-skewed"
              >
                <span className="btn-skewed-content">{item.label}</span>
              </a>
            ) : (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-link btn-skewed ${location.pathname === item.path ? 'active' : ''}`}
              >
                <span className="btn-skewed-content">{item.label}</span>
              </Link>
            )
          ))}
        </div>

        {/* Desktop Auth */}
        <div className="navbar-auth">
          {user ? (
            <div className="user-menu">
              <Link to={`/profile/${user.id}`} className="user-profile btn-skewed">
                <span className="btn-skewed-content" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <img
                    src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
                    alt={user.username}
                    className="user-avatar"
                  />
                  <span className="user-name">{user.username}</span>
                </span>
              </Link>
              <button onClick={logout} className="logout-btn btn-skewed">
                <span className="btn-skewed-content">Cerrar Sesión</span>
              </button>
            </div>
          ) : (
            <Link to="/login" className="login-btn btn-skewed">
              <span className="btn-skewed-content">ENTRAR</span>
            </Link>
          )}
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="mobile-menu-overlay">
          <div className="mobile-menu">
            {navItems.map((item) => (
              item.external ? (
                <a
                  key={item.path}
                  href={item.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mobile-nav-link"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`mobile-nav-link ${location.pathname === item.path ? 'active' : ''}`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {item.label}
                </Link>
              )
            ))}
            
            <div className="mobile-auth-section">
              {user ? (
                <>
                  <Link 
                    to={`/profile/${user.id}`} 
                    className="mobile-user-link"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <img
                      src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
                      alt={user.username}
                      className="mobile-user-avatar"
                    />
                    <span>{user.username}</span>
                  </Link>
                  <button 
                    onClick={() => {
                      logout();
                      setIsMobileMenuOpen(false);
                    }} 
                    className="mobile-logout-btn"
                  >
                    Cerrar Sesión
                  </button>
                </>
              ) : (
                <Link 
                  to="/login" 
                  className="mobile-login-btn"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  ENTRAR
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
