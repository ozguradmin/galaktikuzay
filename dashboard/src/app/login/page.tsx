'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setError(response.status === 401
          ? 'Geçersiz şifre! Lütfen tekrar deneyin.'
          : 'Giriş servisi şu anda kullanılamıyor.');
        return;
      }

      router.replace('/');
      router.refresh();
    } catch {
      setError('Giriş sırasında bağlantı hatası oluştu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={backgroundGlowStyle}></div>
      <div style={backgroundGlowAccentStyle}></div>
      
      <div style={cardStyle}>
        <div style={logoContainerStyle}>
          <span style={logoEmojiStyle}>🌌</span>
          <h1 style={titleStyle}>Galaktik Uzay</h1>
          <p style={subtitleStyle}>Yönetim Paneli Girişi</p>
        </div>

        <form onSubmit={handleSubmit} style={formStyle}>
          <div style={inputGroupStyle}>
            <label htmlFor="password" style={labelStyle}>Yönetici Şifresi</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={inputStyle}
              required
              autoFocus
            />
          </div>

          {error && <div style={errorStyle}>{error}</div>}

          <button
            type="submit"
            disabled={loading}
            style={loading ? { ...buttonStyle, opacity: 0.7, cursor: 'not-allowed' } : buttonStyle}
          >
            {loading ? 'Giriş Yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Inline styles for space-themed premium look ───────────────────

const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  width: '100vw',
  background: '#0a0a1a',
  fontFamily: "'Inter', sans-serif",
  position: 'relative',
  overflow: 'hidden',
};

const backgroundGlowStyle: React.CSSProperties = {
  position: 'absolute',
  top: '20%',
  left: '25%',
  width: '400px',
  height: '400px',
  background: 'rgba(99, 102, 241, 0.12)',
  borderRadius: '50%',
  filter: 'blur(100px)',
  pointerEvents: 'none',
};

const backgroundGlowAccentStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: '20%',
  right: '25%',
  width: '400px',
  height: '400px',
  background: 'rgba(139, 92, 246, 0.12)',
  borderRadius: '50%',
  filter: 'blur(100px)',
  pointerEvents: 'none',
};

const cardStyle: React.CSSProperties = {
  width: '90%',
  maxWidth: '420px',
  padding: '40px',
  borderRadius: '20px',
  background: 'rgba(18, 18, 42, 0.65)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(99, 102, 241, 0.2)',
  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(99, 102, 241, 0.15)',
  display: 'flex',
  flexDirection: 'column',
  gap: '30px',
  zIndex: 10,
};

const logoContainerStyle: React.CSSProperties = {
  textAlign: 'center',
};

const logoEmojiStyle: React.CSSProperties = {
  fontSize: '48px',
  display: 'block',
  marginBottom: '10px',
};

const titleStyle: React.CSSProperties = {
  fontSize: '28px',
  fontWeight: '800',
  color: '#f1f5f9',
  letterSpacing: '-0.025em',
  margin: '0 0 5px 0',
  background: 'linear-gradient(to right, #818cf8, #a78bfa)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#94a3b8',
  margin: 0,
};

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
};

const inputGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: '500',
  color: '#94a3b8',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: '10px',
  background: 'rgba(15, 15, 40, 0.8)',
  border: '1px solid rgba(99, 102, 241, 0.2)',
  color: '#e2e8f0',
  fontSize: '16px',
  outline: 'none',
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
};

const errorStyle: React.CSSProperties = {
  color: '#ef4444',
  fontSize: '13px',
  background: 'rgba(239, 68, 68, 0.1)',
  padding: '10px 14px',
  borderRadius: '8px',
  border: '1px solid rgba(239, 68, 68, 0.2)',
  textAlign: 'center',
};

const buttonStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px',
  borderRadius: '10px',
  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
  border: 'none',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: '600',
  cursor: 'pointer',
  transition: 'opacity 0.2s ease, transform 0.1s ease',
  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
};
