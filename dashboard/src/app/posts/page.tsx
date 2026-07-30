'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getPosts,
  formatDateTR,
  type Post,
} from '@/lib/api';

const DEMO_POSTS: Post[] = [
  { id: 1, wp_post_id: 101, title: 'Kara Deliklerin Gizemli Dünyası: Işığın Bile Kaçamadığı Yerler', slug: 'kara-deliklerin-gizemli-dunyasi', category: 'Astrofizik', source_url: 'https://nasa.gov', source_domain: 'nasa.gov', tags: 'kara delik,astrofizik', meta_description: '', image_url: '', word_count: 1250, model_used: 'gpt-4o-mini', created_at: new Date(Date.now() - 3600000).toISOString(), published_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 2, wp_post_id: 102, title: 'Mars\'ta Su Bulundu mu? Son Keşifler ve Analizler', slug: 'marsta-su-bulundu-mu', category: 'Gezegen Bilimi', source_url: 'https://esa.int', source_domain: 'esa.int', tags: 'mars,su', meta_description: '', image_url: '', word_count: 980, model_used: 'gpt-4o-mini', created_at: new Date(Date.now() - 7200000).toISOString(), published_at: new Date(Date.now() - 7200000).toISOString() },
  { id: 3, wp_post_id: 103, title: 'James Webb Teleskobu ile Evrenin İlk Galaksileri', slug: 'james-webb-ilk-galaksiler', category: 'Uzay Teknolojisi', source_url: 'https://space.com', source_domain: 'space.com', tags: 'jwst,galaksi', meta_description: '', image_url: '', word_count: 1100, model_used: 'gpt-4o-mini', created_at: new Date(Date.now() - 86400000).toISOString(), published_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 4, wp_post_id: 104, title: 'Güneş Sistemi Dışı Gezegenler: Yaşanabilir Dünyalar', slug: 'gunes-sistemi-disi-gezegenler', category: 'Astrobiyoloji', source_url: 'https://nasa.gov', source_domain: 'nasa.gov', tags: 'exoplanet', meta_description: '', image_url: '', word_count: 1340, model_used: 'gpt-4o-mini', created_at: new Date(Date.now() - 172800000).toISOString(), published_at: new Date(Date.now() - 172800000).toISOString() },
  { id: 5, wp_post_id: 105, title: 'Uzay Madenciliği: Asteroitlerden Kaynak Çıkarmak', slug: 'uzay-madenciligi', category: 'Uzay Ekonomisi', source_url: 'https://spacenews.com', source_domain: 'spacenews.com', tags: 'asteroit,madencilik', meta_description: '', image_url: '', word_count: 890, model_used: 'gpt-4o-mini', created_at: new Date(Date.now() - 259200000).toISOString(), published_at: new Date(Date.now() - 259200000).toISOString() },
  { id: 6, wp_post_id: 106, title: 'Nötron Yıldızları ve Pulsarlar Hakkında Bilmeniz Gerekenler', slug: 'notron-yildizlari-pulsarlar', category: 'Astrofizik', source_url: 'https://esa.int', source_domain: 'esa.int', tags: 'nötron,pulsar', meta_description: '', image_url: '', word_count: 1150, model_used: 'gpt-4o-mini', created_at: new Date(Date.now() - 345600000).toISOString(), published_at: new Date(Date.now() - 345600000).toISOString() },
  { id: 7, wp_post_id: 107, title: 'SpaceX Starship: İnsanlığın Mars Yolculuğu', slug: 'spacex-starship-mars', category: 'Uzay Teknolojisi', source_url: 'https://spacex.com', source_domain: 'spacex.com', tags: 'spacex,starship', meta_description: '', image_url: '', word_count: 1420, model_used: 'gpt-4o-mini', created_at: new Date(Date.now() - 432000000).toISOString(), published_at: new Date(Date.now() - 432000000).toISOString() },
  { id: 8, wp_post_id: 108, title: 'Karanlık Madde Nedir? Evrenin Görünmez İskeleti', slug: 'karanlik-madde-nedir', category: 'Kozmoloji', source_url: 'https://cern.ch', source_domain: 'cern.ch', tags: 'karanlık madde', meta_description: '', image_url: '', word_count: 1380, model_used: 'gpt-4o-mini', created_at: new Date(Date.now() - 518400000).toISOString(), published_at: new Date(Date.now() - 518400000).toISOString() },
  { id: 9, wp_post_id: 109, title: 'Uluslararası Uzay İstasyonu\'nda Yaşam', slug: 'iss-yasam', category: 'Uzay Keşfi', source_url: 'https://nasa.gov', source_domain: 'nasa.gov', tags: 'ISS,uzay istasyonu', meta_description: '', image_url: '', word_count: 1050, model_used: 'gpt-4o-mini', created_at: new Date(Date.now() - 604800000).toISOString(), published_at: new Date(Date.now() - 604800000).toISOString() },
  { id: 10, wp_post_id: 110, title: 'Büyük Patlama Teorisi: Evrenin Başlangıcı', slug: 'buyuk-patlama-teorisi', category: 'Kozmoloji', source_url: 'https://cern.ch', source_domain: 'cern.ch', tags: 'büyük patlama', meta_description: '', image_url: '', word_count: 760, model_used: 'gpt-4o-mini', created_at: new Date(Date.now() - 691200000).toISOString(), published_at: new Date(Date.now() - 691200000).toISOString() },
];

const CATEGORIES = ['Tümü', 'Astrofizik', 'Gezegen Bilimi', 'Uzay Teknolojisi', 'Astrobiyoloji', 'Uzay Ekonomisi', 'Kozmoloji', 'Uzay Keşfi'];

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>(DEMO_POSTS);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Tümü');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const postsPerPage = 10;

  const fetchPosts = useCallback(async () => {
    try {
      const data = await getPosts(currentPage, postsPerPage);
      let filtered = data.posts;

      // Client-side filtering since API may not support search/category params
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(p =>
          p.title.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
        );
      }
      if (category !== 'Tümü') {
        filtered = filtered.filter(p => p.category === category);
      }

      setPosts(filtered);
      setTotalPages(Math.max(1, Math.ceil(filtered.length / postsPerPage)));
    } catch {
      // Use demo data with client-side filtering
      let filtered = [...DEMO_POSTS];
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(p =>
          p.title.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
        );
      }
      if (category !== 'Tümü') {
        filtered = filtered.filter(p => p.category === category);
      }
      const start = (currentPage - 1) * postsPerPage;
      setPosts(filtered.slice(start, start + postsPerPage));
      setTotalPages(Math.max(1, Math.ceil(filtered.length / postsPerPage)));
    } finally {
      setLoading(false);
    }
  }, [currentPage, search, category]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      setLoading(true);
      void fetchPosts();
    }, 300);
    return () => clearTimeout(debounce);
  }, [fetchPosts]);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Postlar</h1>
        <p className="page-subtitle">Yayınlanan tüm blog postlarını yönetin</p>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search-input" style={{ flex: 1, maxWidth: 400 }}>
            <span className="search-input-icon">🔍</span>
            <input
              type="text"
              className="input"
              placeholder="Post ara..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
        </div>
        <div className="toolbar-right">
          <select
            className="input"
            style={{ width: 'auto', minWidth: 140 }}
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setCurrentPage(1);
            }}
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Posts Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="loading-state">
            <div className="spinner" />
            <p>Postlar yükleniyor...</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📭</span>
            <p>Post bulunamadı</p>
            {search && (
              <button className="btn btn-secondary btn-sm" onClick={() => setSearch('')}>
                Aramayı Temizle
              </button>
            )}
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Başlık</th>
                  <th>Kategori</th>
                  <th>Kaynak</th>
                  <th>Kelime</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post, i) => (
                  <tr key={post.id} style={{ animation: `fadeInUp 0.3s ease ${i * 0.05}s both` }}>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                      {formatDateTR(post.published_at || post.created_at)}
                    </td>
                    <td>
                      <a
                        href={`https://galaktikuzay.com/${post.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="table-link table-title"
                      >
                        {post.title}
                      </a>
                    </td>
                    <td>
                      <span className="tag">{post.category}</span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                      {post.source_domain}
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      {post.word_count.toLocaleString('tr-TR')}
                    </td>
                    <td>
                      <span className="badge badge-success"><span className="badge-dot" /> Yayında</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="pagination-btn"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => p - 1)}
          >
            ←
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => {
              if (totalPages <= 7) return true;
              if (p === 1 || p === totalPages) return true;
              if (Math.abs(p - currentPage) <= 1) return true;
              return false;
            })
            .map((p, i, arr) => {
              const items = [];
              if (i > 0 && arr[i - 1] !== p - 1) {
                items.push(
                  <span key={`dots-${p}`} className="pagination-info">...</span>
                );
              }
              items.push(
                <button
                  key={p}
                  className={`pagination-btn ${currentPage === p ? 'active' : ''}`}
                  onClick={() => setCurrentPage(p)}
                >
                  {p}
                </button>
              );
              return items;
            })}
          <button
            className="pagination-btn"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
          >
            →
          </button>
        </div>
      )}
    </>
  );
}
