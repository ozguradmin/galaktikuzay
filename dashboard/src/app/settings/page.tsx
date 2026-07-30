'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getConfig,
  updateConfig,
  togglePause,
  forcePublish,
  generateDraft,
  type Config,
} from '@/lib/api';

const DEMO_CONFIG: Config = {
  is_active: 'true',
  current_phase: '2',
  posts_per_day: '3',
  phase_start_date: '2026-06-01',
  publish_times: '09:00,14:00,20:00',
  last_publish_time: new Date(Date.now() - 3600000).toISOString(),
  total_published: '147',
};

interface Toast {
  message: string;
  type: 'success' | 'error';
}

export default function SettingsPage() {
  const [config, setConfig] = useState<Config>(DEMO_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [apiAvailable, setApiAvailable] = useState(false);

  // Editable fields (derived from config strings)
  const [postsPerDay, setPostsPerDay] = useState(3);
  const [publishTimes, setPublishTimes] = useState<string[]>(['09:00', '14:00', '20:00']);
  const [autoPublish, setAutoPublish] = useState<string>('draft');

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchConfig = useCallback(async () => {
    try {
      const data = await getConfig();
      setConfig(data.config);
      setPostsPerDay(parseInt(data.config.posts_per_day, 10) || 3);
      setPublishTimes(data.config.publish_times ? data.config.publish_times.split(',').map(t => t.trim()) : ['09:00']);
      setAutoPublish(data.config.auto_publish || 'draft');
      setApiAvailable(true);
    } catch {
      setApiAvailable(false);
      // Use demo defaults
      setPostsPerDay(parseInt(DEMO_CONFIG.posts_per_day, 10));
      setPublishTimes(DEMO_CONFIG.publish_times.split(',').map(t => t.trim()));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => void fetchConfig(), 0);
    return () => clearTimeout(timeout);
  }, [fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (apiAvailable) {
        await updateConfig({
          posts_per_day: String(postsPerDay),
          publish_times: publishTimes.join(','),
          auto_publish: autoPublish,
        });
      }
      setConfig(prev => ({
        ...prev,
        posts_per_day: String(postsPerDay),
        publish_times: publishTimes.join(','),
        auto_publish: autoPublish,
      }));
      showToast('Ayarlar kaydedildi', 'success');
    } catch {
      showToast('Ayarlar kaydedilemedi', 'error');
    } finally {
      setSaving(false);
    }
  };

  const isPaused = config.is_active !== 'true';

  const handleTogglePause = async () => {
    setToggling(true);
    try {
      if (apiAvailable) {
        await togglePause();
      }
      setConfig(prev => ({
        ...prev,
        is_active: prev.is_active === 'true' ? 'false' : 'true',
      }));
      showToast(
        isPaused ? 'Sistem devam ettirildi' : 'Sistem duraklatıldı',
        'success'
      );
    } catch {
      showToast('Durum değiştirilemedi', 'error');
    } finally {
      setToggling(false);
    }
  };

  const handleForcePublish = async () => {
    if (!confirm('Hemen bir post yayınlamak istediğinizden emin misiniz?')) return;
    setPublishing(true);
    try {
      if (apiAvailable) {
        await forcePublish();
      }
      showToast('Post yayınlanması başlatıldı', 'success');
    } catch {
      showToast('Post yayınlanamadı', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const handleGenerateDraft = async () => {
    setGenerating(true);
    try {
      if (apiAvailable) {
        const result = await generateDraft();
        showToast(result.message || 'Taslak içerik üretildi', 'success');
      } else {
        showToast('Taslak içerik üretildi (demo)', 'success');
      }
    } catch {
      showToast('İçerik üretilemedi', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleAddTime = () => {
    if (publishTimes.length < 6) {
      setPublishTimes([...publishTimes, '12:00']);
    }
  };

  const handleRemoveTime = (index: number) => {
    if (publishTimes.length > 1) {
      setPublishTimes(publishTimes.filter((_, i) => i !== index));
    }
  };

  const handleTimeChange = (index: number, value: string) => {
    const updated = [...publishTimes];
    updated[index] = value;
    setPublishTimes(updated);
  };

  const phaseNumber = parseInt(config.current_phase, 10) || 2;

  const phaseNames: Record<number, { label: string; desc: string; color: string }> = {
    1: { label: 'Faz 1 · Başlangıç', desc: 'Günde 1-2 post, temel kategoriler', color: 'var(--info)' },
    2: { label: 'Faz 2 · Büyüme', desc: 'Günde 2-3 post, genişletilmiş kategoriler', color: 'var(--success)' },
    3: { label: 'Faz 3 · Olgunluk', desc: 'Günde 3-5 post, tüm kategoriler aktif', color: 'var(--accent)' },
    4: { label: 'Faz 4 · Ölçeklendirme', desc: 'Günde 5+ post, tam otomasyon', color: 'var(--warning)' },
  };

  const currentPhase = phaseNames[phaseNumber] || phaseNames[2];

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <p>Ayarlar yükleniyor...</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Ayarlar</h1>
        <p className="page-subtitle">
          Sistem yapılandırması ve kontroller
          {!apiAvailable && ' · Demo Modu'}
        </p>
      </div>

      {/* Phase & Status Row */}
      <div className="status-card" style={{ marginBottom: 28 }}>
        <div className="status-info">
          <div className={`status-icon ${isPaused ? 'paused' : 'active'}`}>
            {isPaused ? '⏸️' : '🚀'}
          </div>
          <div className="status-text">
            <h3 style={{ color: currentPhase.color }}>{currentPhase.label}</h3>
            <p>{currentPhase.desc}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className={`btn ${isPaused ? 'btn-success' : 'btn-warning'}`}
            onClick={handleTogglePause}
            disabled={toggling}
          >
            {toggling ? '...' : isPaused ? '▶ Devam Et' : '⏸ Duraklat'}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleForcePublish}
            disabled={publishing || isPaused}
          >
            {publishing ? '⏳ Yayınlanıyor...' : '🚀 Hemen Yayınla'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleGenerateDraft}
            disabled={generating}
          >
            {generating ? '⏳ Üretiliyor...' : '✨ Örnek İçerik Üret'}
          </button>
        </div>
      </div>

      {/* Settings Grid */}
      <div className="settings-grid">
        {/* Publishing Settings */}
        <div className="card stagger-1">
          <div className="card-header">
            <h3 className="card-title">📝 Yayın Ayarları</h3>
          </div>

          <div className="setting-item">
            <label className="setting-label">Günlük Post Sayısı</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setPostsPerDay(Math.max(1, postsPerDay - 1))}
                disabled={postsPerDay <= 1}
              >
                −
              </button>
              <input
                type="number"
                className="input number-input"
                value={postsPerDay}
                onChange={(e) => setPostsPerDay(Math.max(1, Math.min(10, Number(e.target.value))))}
                min={1}
                max={10}
              />
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setPostsPerDay(Math.min(10, postsPerDay + 1))}
                disabled={postsPerDay >= 10}
              >
                +
              </button>
            </div>
            <p className="setting-description">Günde kaç post otomatik yayınlansın</p>
          </div>

          <div className="setting-item">
            <label className="setting-label">Yayın Saatleri (Türkiye)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {publishTimes.map((time, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="time"
                    className="input"
                    style={{ maxWidth: 140 }}
                    value={time}
                    onChange={(e) => handleTimeChange(i, e.target.value)}
                  />
                  {publishTimes.length > 1 && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleRemoveTime(i)}
                      style={{ color: 'var(--error)', fontSize: '1rem' }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {publishTimes.length < 6 && (
                <button className="btn btn-secondary btn-sm" onClick={handleAddTime} style={{ width: 'fit-content' }}>
                  + Saat Ekle
                </button>
              )}
            </div>
            <p className="setting-description">Postların yayınlanacağı saatler (UTC+3)</p>
          </div>

          <div className="setting-item">
            <label className="setting-label">Yayınlama Modu</label>
            <select
              className="input select-input"
              value={autoPublish}
              onChange={(e) => setAutoPublish(e.target.value)}
              style={{
                width: '100%',
                maxWidth: 240,
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'var(--card-bg)',
                border: '1px solid var(--border)',
                color: 'var(--text)'
              }}
            >
              <option value="draft">Taslak olarak kaydet (Draft)</option>
              <option value="publish">Direkt olarak yayınla (Publish)</option>
            </select>
            <p className="setting-description">Üretilen içerikler WordPress&apos;te doğrudan yayınlansın mı yoksa taslak olarak mı kaydedilsin?</p>
          </div>

          <div style={{ marginTop: 8 }}>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
              style={{ width: '100%' }}
            >
              {saving ? '⏳ Kaydediliyor...' : '💾 Ayarları Kaydet'}
            </button>
          </div>
        </div>

        {/* System Info */}
        <div className="card stagger-2">
          <div className="card-header">
            <h3 className="card-title">🖥️ Sistem Bilgileri</h3>
          </div>

          <div className="setting-item">
            <label className="setting-label">Mevcut Faz</label>
            <div className="setting-value" style={{ color: currentPhase.color }}>
              Faz {config.current_phase}
            </div>
            <p className="setting-description">{currentPhase.desc}</p>
          </div>

          <div className="setting-item">
            <label className="setting-label">Toplam Yayın</label>
            <div className="setting-value">
              📊 {config.total_published}
            </div>
            <p className="setting-description">Bugüne kadar yayınlanan toplam post sayısı</p>
          </div>

          <div className="setting-item" style={{ marginBottom: 0 }}>
            <label className="setting-label">API Durumu</label>
            <div className="api-status-list">
              <div className="api-status-item">
                <span className="api-status-name">Worker API</span>
                <span className="health-bar">
                  <span className={`health-dot ${apiAvailable ? 'healthy' : 'error'}`} />
                  <span className="health-label" style={{ color: apiAvailable ? 'var(--success)' : 'var(--error)' }}>
                    {apiAvailable ? 'Bağlı' : 'Bağlantı Yok'}
                  </span>
                </span>
              </div>
              <div className="api-status-item">
                <span className="api-status-name">Cloudflare D1</span>
                <span className="health-bar">
                  <span className={`health-dot ${apiAvailable ? 'healthy' : 'warning'}`} />
                  <span className="health-label" style={{ color: apiAvailable ? 'var(--success)' : 'var(--warning)' }}>
                    {apiAvailable ? 'Aktif' : 'Bilinmiyor'}
                  </span>
                </span>
              </div>
              <div className="api-status-item">
                <span className="api-status-name">WordPress API</span>
                <span className="health-bar">
                  <span className={`health-dot ${apiAvailable ? 'healthy' : 'warning'}`} />
                  <span className="health-label" style={{ color: apiAvailable ? 'var(--success)' : 'var(--warning)' }}>
                    {apiAvailable ? 'Aktif' : 'Bilinmiyor'}
                  </span>
                </span>
              </div>
              <div className="api-status-item">
                <span className="api-status-name">OpenAI API</span>
                <span className="health-bar">
                  <span className={`health-dot ${apiAvailable ? 'healthy' : 'warning'}`} />
                  <span className="health-label" style={{ color: apiAvailable ? 'var(--success)' : 'var(--warning)' }}>
                    {apiAvailable ? 'Aktif' : 'Bilinmiyor'}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.message}
        </div>
      )}
    </>
  );
}
