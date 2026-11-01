// ============================================================
// CENTRALIZED API CONFIGURATION - RIDE HUB
// ============================================================
// Live Production Backend: Render Cloud (24/7 online)
// Cloud URL: https://ride-hub-backend-4x3w.onrender.com
// Local Fallback IP: 10.95.242.70:5000 | USB: 127.0.0.1:5000
// ============================================================

export const USE_CLOUD = false; // false = connects to local PC backend
export const CLOUD_URL = 'https://ride-hub-backend-4x3w.onrender.com';

export const USE_LOCALHOST = false; // Connect directly to PC Wi-Fi/Ethernet IP
export const CENTRAL_IP = '10.166.80.3';
export const CENTRAL_PORT = '5000';

export const LOCAL_URL = USE_CLOUD
  ? CLOUD_URL
  : (USE_LOCALHOST ? `http://127.0.0.1:${CENTRAL_PORT}` : `http://${CENTRAL_IP}:${CENTRAL_PORT}`);

// Base URL for all REST API calls
export const BASE_URL = `${LOCAL_URL}/api`;

// Centralized Categories API URL (Single Source of Truth)
export const CATEGORIES_API_URL = `${LOCAL_URL}/api/categories`;

// Socket.IO server URL
export const SOCKET_URL = LOCAL_URL;

// Request timeout (20 seconds for mobile internet and cloud wake-up)
export const REQUEST_TIMEOUT = 20000;

// LocationIQ & Mappls / MapmyIndia API Keys
export const MAPPLI_TOKEN = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjFkOGVjM2NlZTljODQyOWY5MTY2MTNkOGVmMzU2NGQ4IiwiaCI6Im11cm11cjY0In0=';
export const LOCATIONIQ_KEY = '11c8e94d2cb34945948b31fc14356b31';

// India Map Default Center & Radius
export const DEFAULT_INDIA_LAT = 23.2505;
export const DEFAULT_INDIA_LON = 77.4065;
export const MATCHING_RADIUS_KM = 4.0;

// OpenRouteService / OSRM Real Road Routing Endpoints
export const OSRM_ROUTING_URL = 'https://router.project-osrm.org/route/v1/driving/';
export const OPENROUTESERVICE_ROUTING_URL = 'https://api.openrouteservice.org/v2/directions/driving-car';

// Uploads base URL for images
export const UPLOADS_URL = `${LOCAL_URL}/uploads`;

// Raw GitHub CDN for Instant High-Speed Media Delivery (Zero 404s, Global Caching)
export const CLOUD_UPLOADS_CDN = 'https://raw.githubusercontent.com/lodhi36/ride-hub-backend/main/uploads';

// Dynamic Server URL tracker (updated whenever active backend changes)
let _dynamicServerUrl: string = (LOCAL_URL || `http://127.0.0.1:${CENTRAL_PORT}`).replace(/\/api\/?$/, '').replace(/\/+$/, '');

export const setDynamicServerUrl = (url: string) => {
  if (url && typeof url === 'string') {
    _dynamicServerUrl = url.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  }
};

export const getDynamicServerUrl = (): string => {
  return _dynamicServerUrl || (LOCAL_URL || `http://127.0.0.1:${CENTRAL_PORT}`).replace(/\/api\/?$/, '').replace(/\/+$/, '');
};

// Unified Static Asset Resolver (Primary: active server host, fallback to GitHub CDN if cloud)
export const resolveUploadUrl = (img?: string): string => {
  if (!img || typeof img !== 'string') return '';
  const trimmed = img.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed;
  }
  const cleanPath = trimmed.replace(/^\/?(api\/)?(uploads\/)?/, '');
  const serverUrl = getDynamicServerUrl();
  return `${serverUrl}/uploads/${cleanPath}`;
};

// Expose connection metadata
export const CONNECTION_INFO = {
  mode: USE_CLOUD ? 'CLOUD (Render)' : (USE_LOCALHOST ? 'USB' : 'CENTRALIZED'),
  activeUrl: LOCAL_URL,
  categoriesUrl: CATEGORIES_API_URL,
  port: USE_CLOUD ? '443 (HTTPS)' : CENTRAL_PORT,
  ip: USE_CLOUD ? 'ride-hub-backend-4x3w.onrender.com' : CENTRAL_IP,
};