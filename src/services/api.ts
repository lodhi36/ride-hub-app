import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL, REQUEST_TIMEOUT, SOCKET_URL, UPLOADS_URL, CONNECTION_INFO, CENTRAL_IP, CLOUD_URL, USE_CLOUD, setDynamicServerUrl } from '../config/apiConfig';

// ============================================================
// CENTRALIZED AXIOS INSTANCE
// All API calls go through this instance.
// ============================================================

console.log(`[API] Mode: ${CONNECTION_INFO?.mode || 'LIVE'} | Active URL: ${CONNECTION_INFO?.activeUrl || BASE_URL}`);
const normalizedBaseUrl = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
setDynamicServerUrl(normalizedBaseUrl);

const api = axios.create({
  baseURL: normalizedBaseUrl,
  timeout: REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Hydrate last locked working backend URL if available
AsyncStorage.getItem('LOCKED_WORKING_BACKEND_URL').then((saved) => {
  if (saved && !USE_CLOUD) {
    if (saved.includes('onrender.com')) {
      AsyncStorage.removeItem('LOCKED_WORKING_BACKEND_URL').catch(() => {});
      api.defaults.baseURL = normalizedBaseUrl;
      setDynamicServerUrl(normalizedBaseUrl);
    } else {
      api.defaults.baseURL = saved;
      setDynamicServerUrl(saved);
    }
  }
}).catch(() => {});

// In-Memory Token Cache to eliminate redundant AsyncStorage bridge latency on every request
let _cachedTokens: { [key: string]: string | null } = {};
let _cachedActiveRole: string | null = null;
let _lastAuthReadTime = 0;

export const clearApiCachedAuth = () => {
  _cachedTokens = {};
  _cachedActiveRole = null;
  _lastAuthReadTime = 0;
};

// ── REQUEST INTERCEPTOR ─────────────────────────────────────
// Automatically attach JWT token from memory cache or AsyncStorage to every request
api.interceptors.request.use(
  async (config) => {
    if (config.url && config.url.startsWith('/')) {
      config.url = config.url.substring(1);
    }
    try {
      const existingAuth = config.headers?.Authorization || (config.headers as any)?.authorization;
      if (existingAuth && typeof existingAuth === 'string' && existingAuth.startsWith('Bearer ') && !existingAuth.includes('undefined') && !existingAuth.includes('null')) {
        config.headers.Authorization = existingAuth;
      } else {
        const headerRole = (config.headers?.['X-Role'] || (config.headers as any)?.['x-role'])?.toString().toUpperCase();
        const now = Date.now();
        const isCacheFresh = (now - _lastAuthReadTime < 15000) && _cachedActiveRole !== null;

        let activeRole = headerRole || (isCacheFresh ? _cachedActiveRole : await AsyncStorage.getItem('activeRole'));
        if (!isCacheFresh && !headerRole) {
          _cachedActiveRole = activeRole;
        }

        let token: string | null = null;
        const roleKey = activeRole || 'USER';

        if (isCacheFresh && _cachedTokens[roleKey]) {
          token = _cachedTokens[roleKey];
        } else {
          if (activeRole === 'SUPPLIER') {
            token = await AsyncStorage.getItem('supplierToken');
          } else if (activeRole === 'DELIVERY') {
            token = await AsyncStorage.getItem('deliveryToken');
          } else if (activeRole === 'CUSTOMER') {
            token = await AsyncStorage.getItem('customerToken');
          }
          if (!token && !headerRole) {
            token = await AsyncStorage.getItem('userToken');
          }
          _cachedTokens[roleKey] = token;
          _lastAuthReadTime = now;
        }

        if (activeRole) {
          config.headers['X-Role'] = activeRole.toLowerCase();
        }
        if (token && typeof token === 'string' && token.includes('.') && token !== 'jwt_token' && token !== 'undefined' && token !== 'null') {
          config.headers.Authorization = `Bearer ${token}`;
        } else {
          delete config.headers.Authorization;
        }
      }
    } catch (e) {
      // If AsyncStorage fails, continue without token
    }
    // Detailed logging
    const fullUrl = `${config.baseURL}${config.url}`;
    console.log(`\n--- [API Call] ---`);
    console.log(`Mode: ${CONNECTION_INFO.mode} (${CONNECTION_INFO.mode === 'USB' ? 'ADB Reverse / USB tunnel' : 'Wi-Fi LAN'})`);
    console.log(`Active URL: ${CONNECTION_INFO.activeUrl}`);
    console.log(`Port: ${CONNECTION_INFO.port}`);
    console.log(`Full request URL: ${fullUrl}`);
    console.log(`-------------------\n`);
    
    return config;
  },
  (error) => Promise.reject(error)
);

// ── RESPONSE INTERCEPTOR ────────────────────────────────────
// Normalize errors and automatically try USB/local fallback URLs if network fails
api.interceptors.response.use(
  (response) => {
    console.log(`[API Response] ${response.status} ${response.config.url}`);
    return response;
  },
  async (error) => {
    const config = error.config;
    console.log('[API Error] code:', error.code, '| message:', error.message);

    // Automatic Multi-Host Fallback Retry (Wi-Fi LAN IP <-> USB ADB Reverse <-> Emulator)
    if (!error.response && config && !config._retryAttempted) {
      config._retryAttempted = true;
      const currentNorm = (config.baseURL || '').replace(/\/+$/, '');
      const altCandidates = USE_CLOUD
        ? [`${CLOUD_URL}/api`]
        : [
            `http://${CENTRAL_IP}:5000/api`,
            'http://127.0.0.1:5000/api',
            'http://localhost:5000/api',
            'http://10.0.2.2:5000/api',
          ];
      // Only keep distinct alternative URLs that are different from the failed one
      const altUrls = Array.from(new Set(altCandidates)).filter(u => u.replace(/\/+$/, '') !== currentNorm);

      for (const altBaseUrl of altUrls) {
        if (!USE_CLOUD && altBaseUrl.includes('onrender.com')) continue;
        try {
          const targetUrl = altBaseUrl.endsWith('/') ? altBaseUrl : `${altBaseUrl}/`;
          console.log(`[API Fallback Auto-Connect] Trying: ${targetUrl}${config.url}`);
          const retryInstance = axios.create({
            baseURL: targetUrl,
            timeout: 10000,
            headers: config.headers,
          });
          const res = await retryInstance.request({
            method: config.method,
            url: config.url,
            data: config.data,
            params: config.params,
          });
          console.log(`✅ [API Connected & Locked] Successfully reached backend on ${targetUrl}`);
          // Lock working backend URL globally so every other screen connects instantly!
          api.defaults.baseURL = targetUrl;
          setDynamicServerUrl(targetUrl);
          if (USE_CLOUD || !targetUrl.includes('onrender.com')) {
            AsyncStorage.setItem('LOCKED_WORKING_BACKEND_URL', targetUrl).catch(() => {});
          }
          return res;
        } catch (e) {}
      }
    }

    if (error.response && error.response.status === 401 && !config._retry) {
      if (config.url === 'auth/refresh' || config.url === 'auth/login' || config.url === 'auth/otp/login' || config.url === 'auth/register') {
        return Promise.reject(error);
      }

      config._retry = true;
      try {
        const activeRole = ((await AsyncStorage.getItem('activeRole')) || '').toUpperCase();
        let roleRefreshKey = 'refreshToken';
        let roleTokenKey = 'userToken';
        if (activeRole === 'DELIVERY' || activeRole === 'RIDER') {
          roleRefreshKey = 'deliveryRefreshToken';
          roleTokenKey = 'deliveryToken';
        } else if (activeRole === 'SUPPLIER') {
          roleRefreshKey = 'supplierRefreshToken';
          roleTokenKey = 'supplierToken';
        } else if (activeRole === 'CUSTOMER') {
          roleRefreshKey = 'customerRefreshToken';
          roleTokenKey = 'customerToken';
        }

        const refreshToken = (await AsyncStorage.getItem(roleRefreshKey)) || (await AsyncStorage.getItem('refreshToken'));
        if (refreshToken && refreshToken !== 'undefined' && refreshToken !== 'null') {
          const activeBase = api.defaults.baseURL || normalizedBaseUrl;
          const refreshUrl = activeBase.endsWith('/') ? `${activeBase}auth/refresh` : `${activeBase}/auth/refresh`;
          const res = await axios.post(refreshUrl, { refreshToken });
          if (res.data && res.data.token) {
            await AsyncStorage.setItem('userToken', res.data.token);
            if (roleTokenKey !== 'userToken') {
              await AsyncStorage.setItem(roleTokenKey, res.data.token);
            }
            if (res.data.refreshToken) {
              await AsyncStorage.setItem(roleRefreshKey, res.data.refreshToken);
              await AsyncStorage.setItem('refreshToken', res.data.refreshToken);
            }
            clearApiCachedAuth();
            config.headers.Authorization = `Bearer ${res.data.token}`;
            return api(config);
          }
        }
      } catch (refreshError) {
        // LIFETIME SESSION PERSISTENCE: NEVER delete tokens or auto-logout on transient 401 / refresh error!
        console.log('[API Refresh Note] Preserving persistent session despite refresh error');
      }
    }

    if (error.code === 'ECONNABORTED') {
      error.message = 'Request timed out. Please check network connection.';
    } else if (!error.response) {
      error.message = `Cannot reach server. Ensure backend (npm start) is running on port 5000.`;
    }
    return Promise.reject(error);
  }
);

export default api;
export { BASE_URL, SOCKET_URL, UPLOADS_URL };
