const API_BASE = '/api/backend';

export interface SystemStatus {
  status: string;
  phase: {
    week: number;
    postsPerDay: number;
    times: string[];
  };
  stats: {
    total: number;
    today: number;
    thisWeek: number;
    thisMonth: number;
    avgWordCount: number;
    lastPublished?: string;
  };
  nextPublishTime: string;
}

export interface Post {
  id: number;
  wp_post_id: number;
  title: string;
  slug: string;
  source_url: string;
  source_domain: string;
  category: string;
  tags: string;
  meta_description: string;
  image_url: string;
  word_count: number;
  model_used: string;
  published_at: string;
  created_at: string;
}

export interface LogEntry {
  id: number;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  detail: string | null;
  created_at: string;
}

export interface Config {
  is_active: string;
  posts_per_day: string;
  current_phase: string;
  phase_start_date: string;
  publish_times: string;
  last_publish_time: string;
  total_published: string;
  auto_publish?: string;
  schedule_mode?: string;
}

// Backend returns plain JSON, not wrapped in {success, data}
async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`API Error: ${res.status} ${res.statusText}`);
  }

  return await res.json() as T;
}

export async function getStatus(): Promise<SystemStatus> {
  return apiFetch<SystemStatus>('/api/status');
}

export async function getPosts(page = 1, limit = 20): Promise<{ posts: Post[] }> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  return apiFetch(`/api/posts?${params}`);
}

export async function getLogs(level?: string, limit = 100): Promise<{ logs: LogEntry[] }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (level && level !== 'all') params.set('level', level.toUpperCase());
  return apiFetch(`/api/logs?${params}`);
}

export async function getConfig(): Promise<{ config: Config }> {
  return apiFetch<{ config: Config }>('/api/config');
}

export async function updateConfig(updates: Record<string, string>): Promise<{ success: boolean; updated: string[] }> {
  return apiFetch('/api/config', {
    method: 'POST',
    body: JSON.stringify(updates),
  });
}

export async function togglePause(): Promise<{ success: boolean; updated: string[] }> {
  // Read current status then toggle
  const status = await getStatus();
  const newValue = status.status === 'active' ? 'false' : 'true';
  return updateConfig({ is_active: newValue });
}

export async function forcePublish(): Promise<{ success: boolean; message: string }> {
  return apiFetch('/api/force-publish', {
    method: 'POST',
  });
}

export async function generateDraft(): Promise<{ success: boolean; message: string }> {
  return apiFetch('/api/generate-draft', { method: 'POST' });
}

// Date formatting helper for Turkey timezone
export function formatDateTR(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimeTR(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const absDiff = Math.abs(diff);

  if (absDiff < 60000) return 'az önce';
  if (absDiff < 3600000) return `${Math.floor(absDiff / 60000)} dk ${diff > 0 ? 'sonra' : 'önce'}`;
  if (absDiff < 86400000) return `${Math.floor(absDiff / 3600000)} saat ${diff > 0 ? 'sonra' : 'önce'}`;
  return `${Math.floor(absDiff / 86400000)} gün ${diff > 0 ? 'sonra' : 'önce'}`;
}
