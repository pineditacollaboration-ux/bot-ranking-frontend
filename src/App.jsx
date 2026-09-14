import React, { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import './App.css';

// Lazy load components for better performance
const Home = lazy(() => import('./pages/Home'));
const Ranking = lazy(() => import('./pages/Ranking'));
const Profile = lazy(() => import('./pages/Profile'));
const Login = lazy(() => import('./pages/Login'));
const Seasons = lazy(() => import('./pages/Seasons'));
const Estadisticas = lazy(() => import('./pages/Estadisticas'));

const LoadingFallback = () => (
  <div className="loading" style={{ minHeight: '100vh', background: '#0a0a0a' }}></div>
);

// Scroll to top component
const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    // Force scroll to top immediately
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    
    // Also force scroll after a short delay to ensure DOM is loaded
    setTimeout(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }, 100);
  }, [pathname]);

  return null;
};

function App() {
  useEffect(() => {
    // Force scroll to top on initial load
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  return (
    <AuthProvider>
      <Router>
        <ScrollToTop />
        <div className="scanlines"></div>
        <div className="app">
          <Navbar />
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/ranking" element={<Ranking />} />
              <Route path="/profile/:discordId" element={<Profile />} />
              <Route path="/login" element={<Login />} />
              <Route path="/temporadas" element={<Seasons />} />
              <Route path="/estadisticas" element={<Estadisticas />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Suspense>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
