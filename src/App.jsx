import React, { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import './App.css';

const Home         = lazy(() => import('./pages/Home'));
const Ranking      = lazy(() => import('./pages/Ranking'));
const Profile      = lazy(() => import('./pages/Profile'));
const Login        = lazy(() => import('./pages/Login'));
const Seasons      = lazy(() => import('./pages/Seasons'));
const Estadisticas = lazy(() => import('./pages/Estadisticas'));

const LoadingFallback = () => (
  <div className="loading-screen">
    <div className="loading-ring" />
    <div className="loading-text">Cargando...</div>
  </div>
);

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
    setTimeout(() => window.scrollTo({ top: 0 }), 50);
  }, [pathname]);
  return null;
};

function App() {
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <AuthProvider>
      <Router>
        <ScrollToTop />
        {/* Ambient background */}
        <div className="app-bg">
          <div className="app-bg-orb app-bg-orb-1" />
          <div className="app-bg-orb app-bg-orb-2" />
          <div className="app-bg-orb app-bg-orb-3" />
        </div>
        <div className="scanlines" />
        <div className="app">
          <Navbar />
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/"                    element={<Home />} />
              <Route path="/ranking"             element={<Ranking />} />
              <Route path="/profile/:discordId"  element={<Profile />} />
              <Route path="/login"               element={<Login />} />
              <Route path="/temporadas"          element={<Seasons />} />
              <Route path="/estadisticas"        element={<Estadisticas />} />
              <Route path="*"                    element={<Navigate to="/" />} />
            </Routes>
          </Suspense>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
