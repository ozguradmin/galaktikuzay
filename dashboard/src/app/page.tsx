'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getStatus,
  getPosts,
  togglePause,
  formatDateTR,
  formatRelativeTime,
  type SystemStatus,
  type Post,
} from '@/lib/api';

// Demo data for when API is not available
const DEMO_STATUS: SystemStatus = {
  status: 'active',
  phase: {
    week: 2,
    postsPerDay: 3,
    times: ['09:00', '14:00', '20:00'],
  },
  stats: {
    total: 147,
    today: 2,
    thisWeek: 18,
    thisMonth: 64,
    avgWordCount: 1150,
    lastPublished: new Date(Date.now() - 3600000).toISOString(),
  },
  nextPublishTime: new Date(Date.now() + 2 * 3600000 + 15 * 60000).toISOString(),
};

const DEMO_POSTS: Post[] = [
  { id: 1, wp_post_id: 101, title: 'Kara Deliklerin Gizemli Dünyası: Işığın Bile Kaçamadığı Yerler', slug: 'kara-deliklerin-gizemli-dunyasi', category: 'Astrofizik', source_url: 'https://example.com', source_domain: 'example.com', tags: 'kara delik,astrofizik', meta_description: '', image_url: '', word_count: 1250, model_used: 'gpt-4o-mini', created_at: new Date(Date.now() - 3600000).toISOString(), published_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 2, wp_post_id: 102, title: 'Mars\'ta Su Bulundu mu? Son Keşifler ve Analizler', slug: 'marsta-su-bulundu-mu', category: 'Gezegen Bilimi', source_url: 'https://example.com', source_domain: 'example.com', tags: 'mars,su', meta_description: '', image_url: '', word_count: 980, model_used: 'gpt-4o-mini', created_at: new Date(Date.now() - 7200000).toISOString(), published_at: new Date(Date.now() - 7200000).toISOString() },
  { id: 3, wp_post_id: 103, title: 'James Webb Teleskobu ile Evrenin İlk Galaksileri', slug: 'james-webb-ilk-galaksiler', category: 'Uzay Teknolojisi', source_url: 'https://example.com', source_domain: 'example.com', tags: 'jwst,galaksi', meta_description: '', image_url: '', word_count: 1100, model_used: 'gpt-4o-mini', created_at: new Date(Date.now() - 86400000).toISOString(), published_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 4, wp_post_id: 104, title: 'Güneş Sistemi Dışı Gezegenler: Yaşanabilir Dünyalar', slug: 'gunes-sistemi-disi-gezegenler', category: 'Astrobiyoloji', source_url: 'https://example.com', source_domain: 'example.com', tags: 'exoplanet', meta_description: '', image_url: '', word_count: 1340, model_used: 'gpt-4o-mini', created_at: new Date(Date.now() - 172800000).toISOString(), published_at: new Date(Date.now() - 172800000).toISOString() },
  { id: 5, wp_post_id: 105, title: 'Uzay Madenciliği: Asteroitlerden Kaynak Çıkarmak', slug: 'uzay-madenciligi', category: 'Uzay Ekonomisi', source_url: 'https://example.com', source_domain: 'example.com', tags: 'asteroit,madencilik', meta_description: '', image_url: '', word_count: 890, model_used: 'gpt-4o-mini', created_at: new Date(Date.now() - 259200000).toISOString(), published_at: new Date(Date.now() - 259200000).toISOString() },
];

export default function HomePage() {
  const [status, setStatus] = useState<SystemStatus>(DEMO_STATUS);
  const [recentPosts, setRecentPosts] = useState<Post[]>(DEMO_POSTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [toggling, setToggling] = useState(false);
  const [apiAvailable, setApiAvailable] = useState(false);

  const isPaused = status.status !== 'active';

  const fetchData = useCallback(async () => {
    try {
      const [statusData, postsData] = await Promise.all([
        getStatus(),
        getPosts(1, 5),
      ]);
      setStatus(statusData);
      setRecentPosts(postsData.posts);
      setApiAvailable(true);
      setError(null);
    } catch {
      // Use demo data when API is unavailable
      setApiAvailable(false);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialFetch = setTimeout(() => void fetchData(), 0);
    const interval = setInterval(fetchData, 30000);
    return () => {
      clearTimeout(initialFetch);
      clearInterval(interval);
    };
  }, [fetchData]);

  // Countdown timer
  useEffect(() => {
    if (!status.nextPublishTime) return;

    const updateCountdown = () => {
      const now = new Date().getTime();
      const target = new Date(status.nextPublishTime).getTime();
      const diff = Math.max(0, target - now);

      setCountdown({
        hours: Math.floor(diff / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [status.nextPublishTime]);

  const handleTogglePause = async () => {
    setToggling(true);
    try {
      if (apiAvailable) {
        await togglePause();
        // Re-fetch status to get the updated state
        const newStatus = await getStatus();
        setStatus(newStatus);
      } else {
        setStatus((prev) => ({
          ...prev,
          status: prev.status === 'active' ? 'paused' : 'active',
        }));
      }
    } catch {
      setError('Durum değiştirilemedi');
    } finally {
      setToggling(false);
    }
  };

  const pad = (n: number) => String(n).padStart(2, '0');

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <p>Yükleniyor...</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Kontrol Paneli</h1>
        <p className="page-subtitle">
          Galaktik Uzay otomatik yayın sistemi genel bakış
          {!apiAvailable && ' · Demo Modu'}
        </p>
      </div>

      {error && (
        <div className="error-state" style={{ marginBottom: 24 }}>
          <span>⚠️</span>
          <p>{error}</p>
          <button className="btn btn-secondary btn-sm" onClick={fetchData}>Tekrar Dene</button>
        </div>
      )}

      {/* Status Card */}
      <div className="status-card">
        <div className="status-info">
          <div className={`status-icon ${isPaused ? 'paused' : 'active'}`}>
            {isPaused ? '⏸️' : '▶️'}
          </div>
          <div className="status-text">
            <h3>
              Sistem {isPaused ? 'Duraklatıldı' : 'Aktif'}
            </h3>
            <p>
              {isPaused
                ? 'Otomatik yayınlama duraklatıldı'
                : `Günde ${status.phase.postsPerDay} post yayınlanıyor`}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="health-bar">
            <div className={`health-dot ${isPaused ? 'warning' : 'healthy'}`} />
            <span className="health-label" style={{ color: isPaused ? 'var(--warning)' : 'var(--success)' }}>
              {isPaused ? 'Duraklatıldı' : 'Sağlıklı'}
            </span>
          </div>
          <button
            className={`btn ${isPaused ? 'btn-success' : 'btn-warning'} btn-sm`}
            onClick={handleTogglePause}
            disabled={toggling}
          >
            {toggling ? '...' : isPaused ? '▶ Devam Et' : '⏸ Duraklat'}
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="card stat-card stagger-1">
          <div className="stat-icon">📊</div>
          <div className="stat-value">{status.stats.total}</div>
          <div className="stat-label">Toplam Post</div>
        </div>
        <div className="card stat-card stagger-2">
          <div className="stat-icon">📅</div>
          <div className="stat-value">{status.stats.today}</div>
          <div className="stat-label">Bugün</div>
        </div>
        <div className="card stat-card stagger-3">
          <div className="stat-icon">📈</div>
          <div className="stat-value">{status.stats.thisWeek}</div>
          <div className="stat-label">Bu Hafta</div>
        </div>
        <div className="card stat-card stagger-4">
          <div className="stat-icon">🗓️</div>
          <div className="stat-value">{status.stats.thisMonth}</div>
          <div className="stat-label">Bu Ay</div>
        </div>
      </div>

      {/* Bottom Grid */}
      <div className="grid-2">
        {/* Countdown */}
        <div className="card stagger-5">
          <div className="card-header">
            <h3 className="card-title">
              <span>⏰</span> Sonraki Yayın
            </h3>
            {status.nextPublishTime && (
              <span className="badge badge-info">
                {formatDateTR(status.nextPublishTime)}
              </span>
            )}
          </div>
          {isPaused ? (
            <div className="empty-state" style={{ padding: '30px 20px' }}>
              <span style={{ fontSize: '2rem' }}>⏸️</span>
              <p style={{ color: 'var(--text-muted)' }}>Sistem duraklatıldı</p>
            </div>
          ) : status.nextPublishTime ? (
            <div className="countdown">
              <div className="countdown-segment">
                <span className="countdown-value">{pad(countdown.hours)}</span>
                <span className="countdown-label">Saat</span>
              </div>
              <span className="countdown-separator">:</span>
              <div className="countdown-segment">
                <span className="countdown-value">{pad(countdown.minutes)}</span>
                <span className="countdown-label">Dakika</span>
              </div>
              <span className="countdown-separator">:</span>
              <div className="countdown-segment">
                <span className="countdown-value">{pad(countdown.seconds)}</span>
                <span className="countdown-label">Saniye</span>
              </div>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '30px 20px' }}>
              <span style={{ fontSize: '2rem' }}>🕐</span>
              <p style={{ color: 'var(--text-muted)' }}>Zamanlanmış yayın yok</p>
            </div>
          )}
        </div>

        {/* Recent Posts */}
        <div className="card stagger-6">
          <div className="card-header">
            <h3 className="card-title">
              <span>📝</span> Son Yayınlar
            </h3>
            <a href="/posts" className="btn btn-ghost btn-sm" style={{ color: 'var(--primary-light)' }}>
              Tümünü Gör →
            </a>
          </div>
          {recentPosts.length === 0 ? (
            <div className="empty-state" style={{ padding: '30px 20px' }}>
              <span className="empty-icon">📭</span>
              <p>Henüz yayın yok</p>
            </div>
          ) : (
            <div className="mini-list">
              {recentPosts.map((post) => (
                <div key={post.id} className="mini-list-item">
                  <span className="mini-list-title">{post.title}</span>
                  <span className="mini-list-meta">
                    {post.published_at ? formatRelativeTime(post.published_at) : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
