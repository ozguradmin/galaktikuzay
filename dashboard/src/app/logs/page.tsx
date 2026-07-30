'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getLogs,
  formatTimeTR,
  formatDateTR,
  type LogEntry,
} from '@/lib/api';

const DEMO_LOGS: LogEntry[] = [
  { id: 1, level: 'INFO', message: 'Post başarıyla yayınlandı: "Kara Deliklerin Gizemli Dünyası"', detail: 'Slug: kara-deliklerin-gizemli-dunyasi\nKategori: Astrofizik\nKelime sayısı: 1250\nYayın zamanı: 2026-06-13 00:46:00', created_at: new Date(Date.now() - 600000).toISOString() },
  { id: 2, level: 'INFO', message: 'AI içerik üretimi tamamlandı', detail: 'Model: gpt-4o-mini\nToken kullanımı: 2340 input, 1856 output\nSüre: 12.4s', created_at: new Date(Date.now() - 900000).toISOString() },
  { id: 3, level: 'WARN', message: 'RSS kaynağı yanıt süresi yüksek: space.com', detail: 'Yanıt süresi: 4.2s (eşik: 3s)\nHTTP durum: 200\nÖnbellek: miss', created_at: new Date(Date.now() - 1800000).toISOString() },
  { id: 4, level: 'INFO', message: 'Zamanlayıcı tetiklendi: günlük yayın kontrolü', detail: 'Sonraki tetiklenme: 3 saat sonra\nKalan günlük post: 1', created_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 5, level: 'ERROR', message: 'WordPress API bağlantı hatası (yeniden deneme 2/3)', detail: 'Hata: ECONNRESET\nEndpoint: /wp-json/wp/v2/posts\nYeniden deneme: 2/3\nSonraki deneme: 5s sonra', created_at: new Date(Date.now() - 5400000).toISOString() },
  { id: 6, level: 'INFO', message: 'Post başarıyla yayınlandı: "Mars\'ta Su Bulundu mu?"', detail: 'Slug: marsta-su-bulundu-mu\nKategori: Gezegen Bilimi\nKelime sayısı: 980', created_at: new Date(Date.now() - 7200000).toISOString() },
  { id: 7, level: 'WARN', message: 'Dil analizi düşük skor: 0.72 (eşik: 0.80)', detail: 'Orijinal skor: 0.72\nİyileştirme sonrası: 0.85\nOtomatik düzeltme uygulandı', created_at: new Date(Date.now() - 10800000).toISOString() },
  { id: 8, level: 'INFO', message: 'RSS feed güncellendi: 12 yeni kaynak bulundu', detail: 'nasa.gov: 4 yeni\nesa.int: 3 yeni\nspace.com: 5 yeni', created_at: new Date(Date.now() - 14400000).toISOString() },
  { id: 9, level: 'ERROR', message: 'Görsel indirme hatası: unsplash.com zaman aşımı', detail: 'URL: https://unsplash.com/photos/xyz\nZaman aşımı: 10s\nFallback görsel kullanıldı', created_at: new Date(Date.now() - 18000000).toISOString() },
  { id: 10, level: 'INFO', message: 'Günlük rapor oluşturuldu', detail: 'Toplam post: 3\nBaşarılı: 3\nBaşarısız: 0\nOrtalama kelime: 1043', created_at: new Date(Date.now() - 21600000).toISOString() },
  { id: 11, level: 'INFO', message: 'Sistem başlatıldı', detail: 'Versiyon: 1.0.0\nFaz: 2\nModel: gpt-4o-mini', created_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 12, level: 'WARN', message: 'Bellek kullanımı %85 seviyesine ulaştı', detail: 'Kullanılan: 109MB / 128MB\nWorker limiti yaklaşıyor', created_at: new Date(Date.now() - 90000000).toISOString() },
];

type LogLevel = 'all' | 'info' | 'warn' | 'error';

const FILTER_TABS: { key: LogLevel; label: string; icon: string }[] = [
  { key: 'all', label: 'Tümü', icon: '📋' },
  { key: 'info', label: 'Bilgi', icon: 'ℹ️' },
  { key: 'warn', label: 'Uyarı', icon: '⚠️' },
  { key: 'error', label: 'Hata', icon: '❌' },
];

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>(DEMO_LOGS);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<LogLevel>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchLogs = useCallback(async () => {
    try {
      const data = await getLogs(level, 100);
      setLogs(data.logs);
    } catch {
      // Use demo data with client-side filtering
      if (level === 'all') {
        setLogs(DEMO_LOGS);
      } else {
        setLogs(DEMO_LOGS.filter(log => log.level.toLowerCase() === level));
      }
    } finally {
      setLoading(false);
    }
  }, [level]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading(true);
      void fetchLogs();
    }, 0);
    return () => clearTimeout(timeout);
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const handleCopy = async (log: LogEntry) => {
    const text = `[${log.created_at}] [${log.level.toUpperCase()}] ${log.message}${log.detail ? '\n' + log.detail : ''}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(log.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
    }
  };

  const getLevelBadge = (lvl: string) => {
    switch (lvl) {
      case 'INFO':
        return <span className="log-badge badge-info">BİLGİ</span>;
      case 'WARN':
        return <span className="log-badge badge-warning">UYARI</span>;
      case 'ERROR':
        return <span className="log-badge badge-error">HATA</span>;
      default:
        return <span className="log-badge badge-neutral">{lvl}</span>;
    }
  };

  const isToday = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Sistem Logları</h1>
        <p className="page-subtitle">Otomatik yayın sistemi olay kayıtları</p>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="filter-tabs">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                className={`filter-tab ${level === tab.key ? 'active' : ''}`}
                onClick={() => {
                  setLevel(tab.key);
                  setExpandedId(null);
                }}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar-right">
          <button
            className={`btn btn-sm ${autoRefresh ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? '🔄 Otomatik' : '⏹️ Manuel'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={fetchLogs}>
            🔄 Yenile
          </button>
        </div>
      </div>

      {/* Log List */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="loading-state">
            <div className="spinner" />
            <p>Loglar yükleniyor...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📋</span>
            <p>Bu filtreye uygun log bulunamadı</p>
          </div>
        ) : (
          <div className="log-list" style={{ padding: 12 }}>
            {logs.map((log, i) => (
              <div
                key={log.id}
                className={`log-entry ${expandedId === log.id ? 'expanded' : ''}`}
                style={{ animation: `fadeInUp 0.3s ease ${i * 0.03}s both` }}
                onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
              >
                <span className="log-time">
                  {isToday(log.created_at)
                    ? formatTimeTR(log.created_at)
                    : formatDateTR(log.created_at)
                  }
                </span>
                {getLevelBadge(log.level)}
                <div className="log-content">
                  <p className="log-message">{log.message}</p>
                  {expandedId === log.id && log.detail && (
                    <div className="log-detail">{log.detail}</div>
                  )}
                </div>
                <div className="log-actions">
                  <button
                    className={`copy-btn ${copiedId === log.id ? 'copied' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy(log);
                    }}
                    title="Kopyala"
                  >
                    {copiedId === log.id ? '✓' : '📋'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary footer */}
      <div style={{ marginTop: 16, display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
          ℹ️ Bilgi: {logs.filter(l => l.level === 'INFO').length}
        </span>
        <span className="badge badge-warning" style={{ fontSize: '0.75rem' }}>
          ⚠️ Uyarı: {logs.filter(l => l.level === 'WARN').length}
        </span>
        <span className="badge badge-error" style={{ fontSize: '0.75rem' }}>
          ❌ Hata: {logs.filter(l => l.level === 'ERROR').length}
        </span>
      </div>
    </>
  );
}
