const configuredBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
export const API_BASE_URL = configuredBase;

async function request(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = window.localStorage.getItem('vps.token');
  if (token) headers.Authorization = 'Bearer ' + token;

  let response;
  try {
    response = await fetch(API_BASE_URL + path, { ...options, headers });
  } catch {
    throw new Error('Cannot reach the VPS API. Check that the backend is running.');
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : {};

  if (!response.ok) {
    const error = new Error(payload.message || ('Request failed (' + response.status + ').'));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

const json = (method, data) => ({ method, body: JSON.stringify(data) });

export const api = {
  register: (data) => request('/api/auth/register', json('POST', data)),
  login: (data) => request('/api/auth/login', json('POST', data)),
  lots: (filters = {}) => {
    const parameters = new URLSearchParams(
      Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== '')
    ).toString();
    return request('/api/lots' + (parameters ? '?' + parameters : ''));
  },
  lotSlots: (lotId, window = {}) => {
    const query = new URLSearchParams(window).toString();
    return request('/api/lots/' + encodeURIComponent(lotId) + '/slots' + (query ? '?' + query : ''));
  },
  reserve: (data) => request('/api/slots/reserve', json('POST', data)),
  gateEntry: (data) => request('/api/tracking/entry', json('POST', data)),
  gateExit: (data) => request('/api/tracking/exit', json('POST', data)),
  createLot: (data) => request('/api/lots', json('POST', data)),
  bulkSlots: (lotId, data) => request('/api/lots/' + encodeURIComponent(lotId) + '/slots/bulk', json('POST', data)),
};

export function saveSession(session) {
  if (!session || !session.token || !session.user) throw new Error('Invalid login response.');
  window.localStorage.setItem('vps.token', session.token);
  window.localStorage.setItem('vps.user', JSON.stringify(session.user));
}

export function clearSession() {
  window.localStorage.removeItem('vps.token');
  window.localStorage.removeItem('vps.user');
}

export function readSession() {
  const token = window.localStorage.getItem('vps.token');
  try {
    const user = JSON.parse(window.localStorage.getItem('vps.user') || 'null');
    return token && user ? { token, user } : null;
  } catch {
    return null;
  }
}