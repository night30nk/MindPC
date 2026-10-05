// Small fetch wrapper for MindPC backend API

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function getUserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

export async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Auto-append timezone query param for GET requests if not specified
  let url = `${BASE_URL}${endpoint}`;
  if (!options.method || options.method.toUpperCase() === 'GET') {
    const tz = getUserTimeZone();
    const separator = url.includes('?') ? '&' : '?';
    if (!url.includes('tz=')) {
      url += `${separator}tz=${encodeURIComponent(tz)}`;
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle unauthorized / token expired
  if (response.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new Error('Session expired. Please log in again.');
  }

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Request failed');
  }

  return data.data;
}

// ── Formatter Helpers ────────────────────────────────────────────────
export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

export function formatTime(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

export function formatShortDate(dateStr) {
  if (!dateStr) return '';
  try {
    // dateStr is YYYY-MM-DD
    const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getNDaysAgoString(daysAgo, baseDateStr) {
  const base = baseDateStr ? new Date(baseDateStr) : new Date();
  base.setDate(base.getDate() - daysAgo);
  const year = base.getFullYear();
  const month = String(base.getMonth() + 1).padStart(2, '0');
  const day = String(base.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
