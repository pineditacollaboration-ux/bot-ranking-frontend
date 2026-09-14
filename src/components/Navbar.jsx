import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';

const ExitIcon = () => (
  <svg className="logout-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

const Navbar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMenuClosing, setIsMenuClosing] = useState(false);

  const navItems = [
    { path: '/', label: 'HOME' },
    { path: '/ranking', label: 'RANKING' },
    { path: '/temporadas', label: 'TEMPORADA' },
    { path: '/estadisticas', label: 'ESTADÍSTICAS' },
  ];

  // Close mobile menu when route changes
  const closeMobileMenu = () => {
    setIsMenuClosing(true);
    setTimeout(() => {
      setIsMobileMenuOpen(false);
      setIsMenuClosing(false);
    }, 400);
  };

  useEffect(() => {
    closeMobileMenu();
  }, [location.pathname]);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isMobileMenuOpen && !event.target.closest('.navbar') && !event.target.closest('.mobile-menu-overlay')) {
        closeMobileMenu();
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isMobileMenuOpen]);

  return (
    <>
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
                <Link to={`/profile/${user.id}`} className="user-profile">
                  <div className="user-avatar-wrapper">
                    {user.avatar ? (
                      <img
                        src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
                        alt={user.username}
                        className="user-avatar"
                        onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                      />
                    ) : null}
                    <div
                      className="user-avatar-fallback"
                      style={{ display: user.avatar ? 'none' : 'flex' }}
                    >
                      {user.username?.[0] ?? '?'}
                    </div>
                    <span className="user-status-dot" />
                  </div>
                  <span className="user-name">{user.username}</span>
                </Link>
                <button onClick={logout} className="logout-btn">
                  <ExitIcon />
                  Salir
                </button>
              </div>
            ) : (
              <Link to="/login" className="login-btn btn-skewed">
                <span className="btn-skewed-content">ENTRAR</span>
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className={`mobile-menu-overlay ${isMenuClosing ? 'closing' : ''}`} onClick={closeMobileMenu}>
          <div className={`mobile-menu ${isMenuClosing ? 'closing' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="mobile-menu-header">
              <h3 className="mobile-menu-title">MENÚ</h3>
              <button 
                className="mobile-close-button"
                onClick={closeMobileMenu}
                aria-label="Cerrar menú"
              >
                ✕
              </button>
            </div>
            
            <div className="mobile-nav-links">
              {navItems.map((item) => (
                item.external ? (
                  <a
                    key={item.path}
                    href={item.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mobile-nav-link"
                    onClick={closeMobileMenu}
                  >
                    <span className="mobile-link-icon">→</span>
                    {item.label}
                  </a>
                ) : (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`mobile-nav-link ${location.pathname === item.path ? 'active' : ''}`}
                    onClick={closeMobileMenu}
                  >
                    <span className="mobile-link-icon">{location.pathname === item.path ? '●' : '○'}</span>
                    {item.label}
                  </Link>
                )
              ))}
            </div>
            
            <div className="mobile-auth-section">
              {user ? (
                <>
                  <Link 
                    to={`/profile/${user.id}`} 
                    className="mobile-user-link"
                    onClick={closeMobileMenu}
                  >
                    <img
                      src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
                      alt={user.username}
                      className="mobile-user-avatar"
                    />
                    <div className="mobile-user-info">
                      <span className="mobile-user-name">{user.username}</span>
                      <span className="mobile-user-label">Ver Perfil</span>
                    </div>
                  </Link>
                  <button 
                    onClick={() => {
                      logout();
                      closeMobileMenu();
                    }} 
                    className="mobile-logout-btn"
                  >
                    <span className="mobile-btn-icon">🚪</span>
                    Cerrar Sesión
                  </button>
                </>
              ) : (
                <Link 
                  to="/login" 
                  className="mobile-login-btn"
                  onClick={closeMobileMenu}
                >
                  <span className="mobile-btn-icon">🔐</span>
                  Iniciar Sesión
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;
