import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Ranking from './pages/Ranking';
import Profile from './pages/Profile';
import Login from './pages/Login';
import Seasons from './pages/Seasons';
import History from './pages/History';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="app">
          <Navbar />
          <Routes>
            <Route path="/" element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            } />
            <Route path="/ranking" element={
              <ProtectedRoute>
                <Ranking />
              </ProtectedRoute>
            } />
            <Route path="/profile/:discordId" element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } />
            <Route path="/login" element={<Login />} />
            <Route path="/temporadas" element={
              <ProtectedRoute>
                <Seasons />
              </ProtectedRoute>
            } />
            <Route path="/historial" element={
              <ProtectedRoute>
                <History />
              </ProtectedRoute>
            } />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
