import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, PermissionsAndroid } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import api from './api';

export interface DeliveryAddress {
  id: string;
  tag: 'Home' | 'Work' | 'Other' | 'Someone Else';
  houseNo: string;
  landmark: string;
  city: string;
  pincode: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
  isCurrentLocation?: boolean;
  isOrderingForSomeoneElse?: boolean;
  recipientRelationship?: 'Friend' | 'Wife/Family' | 'Other' | string;
  recipientName?: string;
  recipientPhone?: string;
  originalLocationUrl?: string;
}

const STORAGE_KEY_SAVED_ADDRS = '@customer_saved_addresses_v2';
const STORAGE_KEY_ACTIVE_ADDR = '@customer_active_address_v2';
export const STORAGE_KEY_PERMANENT_CUSTOMER = '@permanent_customer_delivery_address';
export const STORAGE_KEY_PERMANENT_STORE = '@permanent_supplier_store_location';
export const STORAGE_KEY_RIDER_LAST_GPS = '@last_known_gps_delivery_v2';
export const STORAGE_KEY_CUSTOMER_LAST_GPS = '@last_known_gps_customer_v2';

const KNOWN_DUMMY_COORDS: ReadonlyArray<[number, number]> = [
  [23.2599, 77.4126], // Bhopal static dummy
  [23.2330, 77.4350], // Friend/Booking test dummy
  [23.2505, 77.4065], // Old Bhopal polygon center dummy
  [23.3050, 77.4200], // Islamnagar map default dummy
  [28.6139, 77.2090], // New Delhi dummy
  [28.6129, 77.2295], // Kartavya Path dummy
];

const isDummyCoord = (lat?: number, lon?: number): boolean => isDummyCoordinates(lat, lon);

/**
 * Haversine formula to compute distance in KM between two coordinates
 */
export const calculateHaversineDistanceKm = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  if (lat1 === 0 || lon1 === 0 || lat2 === 0 || lon2 === 0) return 0;
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const dist = R * c;
  return Number(dist.toFixed(2));
};

export interface CanonicalRestaurantLocation {
  latitude: number;
  longitude: number;
  address: string;
  locality: string;
  distanceKm: number | null;
  distanceText: string;
  deliveryTimeText: string;
}

/**
 * Canonical Restaurant Location & Distance Extractor
 * Guarantees 100% exact same coordinates, distance calculation, and address across all screens.
 */
export const getCanonicalRestaurantLocation = (
  resto: any,
  customerCoords?: { latitude: number; longitude: number } | null,
  screenName: string = 'App'
): CanonicalRestaurantLocation => {
  if (!resto) {
    return {
      latitude: 0,
      longitude: 0,
      address: '',
      locality: 'Store Location',
      distanceKm: null,
      distanceText: '',
      deliveryTimeText: '20-30 min',
    };
  }

  // 1. Exact raw business latitude & longitude
  const rawLat =
    resto.businessLatitude ??
    resto.pickupLatitude ??
    resto.rawUser?.businessLatitude ??
    resto.latitude ??
    resto.locationCoords?.latitude ??
    resto.locationCoords?.lat ??
    resto.rawUser?.latitude ??
    resto.rawUser?.locationCoords?.latitude ??
    resto.rawUser?.locationCoords?.lat ??
    0;

  const rawLon =
    resto.businessLongitude ??
    resto.pickupLongitude ??
    resto.rawUser?.businessLongitude ??
    resto.longitude ??
    resto.locationCoords?.longitude ??
    resto.locationCoords?.lon ??
    resto.locationCoords?.lng ??
    resto.rawUser?.longitude ??
    resto.rawUser?.locationCoords?.longitude ??
    resto.rawUser?.locationCoords?.lon ??
    resto.rawUser?.locationCoords?.lng ??
    0;

  const lat = Number(rawLat) || 0;
  const lon = Number(rawLon) || 0;

  // 2. Exact address & locality
  let rawAddr =
    resto.businessAddress ||
    resto.fullAddress ||
    resto.address ||
    resto.location ||
    resto.rawUser?.fullAddress ||
    resto.rawUser?.address ||
    resto.rawUser?.location ||
    resto.city ||
    resto.rawUser?.city ||
    '';

  if (typeof rawAddr === 'object' && rawAddr !== null) {
    rawAddr = rawAddr.fullAddress || rawAddr.address || rawAddr.location || '';
  }
  let cleanAddr = String(rawAddr || '').trim();
  if (cleanAddr === '[object Object]') cleanAddr = '';

  const locality = cleanAddr || 'Store Location';

  // 3. Exact raw distance calculation via Haversine formula
  const cLat = Number(customerCoords?.latitude || 0);
  const cLon = Number(customerCoords?.longitude || 0);

  let distKm: number | null = null;
  if (lat !== 0 && lon !== 0 && cLat !== 0 && cLon !== 0) {
    distKm = calculateHaversineDistanceKm(lat, lon, cLat, cLon);
  } else if (Number(resto.distanceKm) > 0) {
    distKm = Number(Number(resto.distanceKm).toFixed(2));
  }

  let distanceText = '-- km';
  let deliveryTimeText = '15-25 min';
  if (distKm !== null && !isNaN(distKm)) {
    if (distKm < 1.0) {
      distanceText = `${Math.round(distKm * 1000)} m`;
    } else {
      distanceText = `${distKm.toFixed(1)} km`;
    }
    const deliveryMins = Math.max(10, Math.round(distKm * 5 + 10));
    deliveryTimeText = `${deliveryMins}-${deliveryMins + 10} min`;
  }

  // Debugging Output
  const restoId = String(resto._id || resto.id || resto.restaurantId || 'unknown');
  console.log(`📍 [CANONICAL LOCATION DEBUG - ${screenName}]`, {
    restaurantId: restoId,
    businessLatitude: lat,
    businessLongitude: lon,
    customerLatitude: cLat,
    customerLongitude: cLon,
    calculatedDistance: distanceText,
    address: cleanAddr,
    locationSource: 'MongoDB User Model (Canonical)',
    timestamp: new Date().toISOString(),
  });

  return {
    latitude: lat,
    longitude: lon,
    address: cleanAddr,
    locality,
    distanceKm: distKm,
    distanceText,
    deliveryTimeText,
  };
};

/**
 * Rider Delivery Fee Calculation Formula:
 * - Up to 2.0 km (1 km or 1 to 2 km): Fixed ₹20
 * - Above 2.0 km: Fixed ₹20 + ₹10 per km for distance beyond 2 km
 */
export const calculateRiderDeliveryFee = (
  distanceKm: number
): { fee: number; distanceKm: number; formulaNote: string } => {
  const dist = Math.max(0.1, Number(distanceKm.toFixed(1)));
  if (dist <= 2.0) {
    return {
      fee: 20,
      distanceKm: dist,
      formulaNote: '₹20 fixed fee (within 2 km)',
    };
  }
  const extraKm = dist - 2.0;
  const extraFee = Math.round(extraKm * 10);
  const total = 20 + extraFee;
  return {
    fee: total,
    distanceKm: dist,
    formulaNote: `₹20 base (first 2 km) + ₹${extraFee} (${extraKm.toFixed(1)} km @ ₹10/km)`,
  };
};

export interface DeviceGpsFix {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

// In-memory geocode cache to eliminate repetitive OSM Nominatim latency
const geocodeCache = new Map<string, { fullAddress: string; city: string; area: string; pincode: string }>();
let memoryGpsCache: DeviceGpsFix | null = null;

/**
 * Reverse geocode coordinates via OpenStreetMap Nominatim with memory cache & fast timeout
 */
export const reverseGeocodeCoords = async (
  lat: number,
  lon: number
): Promise<{ fullAddress: string; city: string; area: string; pincode: string }> => {
  const cacheKey = `${lat.toFixed(3)}_${lon.toFixed(3)}`;
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
      {
        headers: {
          'User-Agent': 'DatingApp/1.0',
        },
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);

    const data = await res.json();
    if (data && data.address) {
      const a = data.address;
      const road = a.road || a.suburb || a.neighbourhood || a.village || a.town || '';
      const city = a.city || a.state_district || a.county || a.state || 'Bhopal';
      const pincode = a.postcode || '';
      const area = road ? `${road}, ${city}` : city;
      const full = data.display_name ? data.display_name.split(',').slice(0, 4).join(', ') : `${area}`;
      const result = {
        fullAddress: full,
        city,
        area: road || city,
        pincode,
      };
      geocodeCache.set(cacheKey, result);
      return result;
    }
  } catch (e) {
    console.log('[REVERSE GEOCODE FAST FALLBACK]', e);
  }

  const fallback = {
    fullAddress: `Location near (${lat.toFixed(3)}, ${lon.toFixed(3)})`,
    city: 'Bhopal',
    area: 'Current Location',
    pincode: '',
  };
  geocodeCache.set(cacheKey, fallback);
  return fallback;
};

export const checkLocationPermission = async (): Promise<boolean> => {
  if (Platform.OS === 'ios') return true;
  if (Platform.OS === 'android') {
    try {
      const fine = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      const coarse = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
      return fine || coarse;
    } catch (e) {
      return false;
    }
  }
  return true;
};

export const requestLocationPermission = async (): Promise<boolean> => {
  if (Platform.OS === 'ios') return true;
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ]);
      const fineGranted = granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
      const coarseGranted = granted[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
      return fineGranted || coarseGranted;
    } catch (e) {
      return false;
    }
  }
  return true;
};

/**
 * Strict Coordinate Validation
 * Checks latitude [-90, 90], longitude [-180, 180], and ensures non-zero, valid numbers
 */
export const isValidCoordinates = (lat?: number | null, lon?: number | null): boolean => {
  if (lat === undefined || lat === null || lon === undefined || lon === null) return false;
  const nLat = Number(lat);
  const nLon = Number(lon);
  if (isNaN(nLat) || isNaN(nLon)) return false;
  if (nLat === 0 && nLon === 0) return false;
  if (nLat < -90 || nLat > 90) return false;
  if (nLon < -180 || nLon > 180) return false;
  return true;
};

export const isDummyCoordinates = (lat?: number | null, lon?: number | null): boolean => {
  if (!isValidCoordinates(lat, lon)) return true;
  const nLat = Number(lat);
  const nLon = Number(lon);
  for (const [dLat, dLon] of KNOWN_DUMMY_COORDS) {
    if (Math.abs(nLat - dLat) < 0.0001 && Math.abs(nLon - dLon) < 0.0001) {
      return true;
    }
  }
  return false;
};

export interface GpsFetchResult {
  success: boolean;
  fix?: DeviceGpsFix;
  errorType?: 'PERMISSION_DENIED' | 'LOCATION_OFF' | 'ACCURACY_LOW' | 'TIMEOUT' | 'UNKNOWN';
  message?: string;
}

/**
 * Single Canonical GPS Fetch Function for all roles (Customer, Rider, Restaurant).
 * Queries hardware GPS sensor directly. Never returns hardcoded/dummy fallback coordinates.
 */
export const fetchCurrentGpsPositionDetailed = async (
  allowRecentMemoryCache: boolean = false
): Promise<GpsFetchResult> => {
  try {
    if (Platform.OS === 'android') {
      const hasFine = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      const hasCoarse = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
      let fineGranted = hasFine;
      let coarseGranted = hasCoarse;

      if (!fineGranted && !coarseGranted) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ]);
        fineGranted =
          granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] ===
          PermissionsAndroid.RESULTS.GRANTED;
        coarseGranted =
          granted[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] ===
          PermissionsAndroid.RESULTS.GRANTED;
      }

      if (!fineGranted && !coarseGranted) {
        return {
          success: false,
          errorType: 'PERMISSION_DENIED',
          message: 'Location permission denied. Please allow location access in settings.',
        };
      }
    }

    let lastGpsErrorCode: number | null = null;
    let lastGpsErrorMessage: string = '';
    let rejectedForLowAccuracy = false;

    const getLocationPromise = (
      highAccuracy: boolean,
      timeoutMs: number,
      maxAge: number
    ): Promise<DeviceGpsFix | null> => {
      return new Promise((resolve) => {
        Geolocation.getCurrentPosition(
          (pos) => {
            if (
              pos?.coords &&
              isValidCoordinates(pos.coords.latitude, pos.coords.longitude) &&
              !isDummyCoordinates(pos.coords.latitude, pos.coords.longitude)
            ) {
              const rawAccuracy = Number(pos.coords.accuracy);
              if (Number.isFinite(rawAccuracy) && rawAccuracy > 1000) {
                rejectedForLowAccuracy = true;
                resolve(null);
                return;
              }
              const res: DeviceGpsFix = {
                latitude: Number(pos.coords.latitude),
                longitude: Number(pos.coords.longitude),
                accuracy: Number.isFinite(rawAccuracy) && rawAccuracy > 0 ? Math.round(rawAccuracy * 10) / 10 : 10,
                timestamp: pos.timestamp || Date.now(),
              };
              memoryGpsCache = res;
              resolve(res);
              return;
            }
            resolve(null);
          },
          (err: any) => {
            lastGpsErrorCode = err?.code ?? null;
            lastGpsErrorMessage = err?.message || '';
            console.log(`[GPS fetch note: highAccuracy=${highAccuracy}, code=${err?.code}]`, err?.message || err);
            resolve(null);
          },
          {
            enableHighAccuracy: highAccuracy,
            timeout: timeoutMs,
            maximumAge: maxAge,
            forceRequestLocation: true,
            showLocationDialog: true,
          }
        );
      });
    };

    // 1. High Accuracy Hardware GPS Lock
    const hardwareFix = await getLocationPromise(true, 10000, 0);
    if (hardwareFix) {
      return { success: true, fix: hardwareFix };
    }

    // 2. Coarse Network Fix (if device is indoors)
    const coarseFix = await getLocationPromise(false, 6000, 4000);
    if (coarseFix) {
      return { success: true, fix: coarseFix };
    }

    // 3. Very recent in-memory cache (< 20s old) if explicitly permitted
    if (
      allowRecentMemoryCache &&
      memoryGpsCache &&
      Date.now() - memoryGpsCache.timestamp < 20000 &&
      !isDummyCoordinates(memoryGpsCache.latitude, memoryGpsCache.longitude)
    ) {
      return { success: true, fix: memoryGpsCache };
    }

    if (rejectedForLowAccuracy && lastGpsErrorCode === null) {
      return {
        success: false,
        errorType: 'ACCURACY_LOW',
        message: 'GPS accuracy too low. Please move to an open area and retry.',
      };
    }

    if (lastGpsErrorCode === 1) {
      return {
        success: false,
        errorType: 'PERMISSION_DENIED',
        message: 'Location permission required.',
      };
    }

    // Detect Location Services OFF (Code 2 = POSITION_UNAVAILABLE, Code 5 = SETTINGS_NOT_SATISFIED)
    if (
      lastGpsErrorCode === 2 ||
      lastGpsErrorCode === 5 ||
      lastGpsErrorMessage.toLowerCase().includes('location') ||
      lastGpsErrorMessage.toLowerCase().includes('disabled') ||
      lastGpsErrorMessage.toLowerCase().includes('provider')
    ) {
      return {
        success: false,
        errorType: 'LOCATION_OFF',
        message: 'GPS unavailable.',
      };
    }

    return {
      success: false,
      errorType: 'TIMEOUT',
      message: 'Unable to fetch current location. Retry.',
    };
  } catch (e: any) {
    return {
      success: false,
      errorType: 'UNKNOWN',
      message: e?.message || 'Failed to detect location.',
    };
  }
};

export const fetchCurrentGpsPosition = async (
  allowCache: boolean = false
): Promise<DeviceGpsFix | null> => {
  const res = await fetchCurrentGpsPositionDetailed(allowCache);
  return res.success && res.fix ? res.fix : null;
};

/**
 * Continuous high-accuracy device GPS tracking subscription
 */
export const watchCurrentGpsPosition = (
  onLocation: (fix: DeviceGpsFix) => void,
  onError?: (err: any) => void
): (() => void) => {
  try {
    const watchId = Geolocation.watchPosition(
      (pos) => {
        if (pos?.coords && pos.coords.latitude && pos.coords.longitude) {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const acc = Number(pos.coords.accuracy);
          if (!isDummyCoordinates(lat, lon) && (!Number.isFinite(acc) || acc <= 1000)) {
            const fix: DeviceGpsFix = {
              latitude: lat,
              longitude: lon,
              accuracy: Number.isFinite(acc) && acc > 0 ? Math.round(acc * 10) / 10 : 10,
              timestamp: pos.timestamp || Date.now(),
            };
            memoryGpsCache = fix;
            onLocation(fix);
          }
        }
      },
      (err) => {
        console.log('[GPS Watcher Error]:', err?.message || err);
        onError?.(err);
      },
      {
        enableHighAccuracy: true,
        distanceFilter: 8, // battery-safe movement threshold (8 meters)
        interval: 4000,
        fastestInterval: 2000,
        showLocationDialog: true,
        forceRequestLocation: true,
      }
    );

    return () => {
      try {
        Geolocation.clearWatch(watchId);
      } catch (_) {}
    };
  } catch (e) {
    console.log('[watchCurrentGpsPosition Exception]:', e);
    return () => {};
  }
};

// Helper to resolve current active role user ID without cross-role leakage
const getRoleSessionUserId = async (roleKey: 'customerUser' | 'supplierUser' | 'deliveryUser'): Promise<string | null> => {
  try {
    const raw = await AsyncStorage.getItem(roleKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return (parsed?._id || parsed?.id) ? String(parsed._id || parsed.id) : null;
  } catch (_) {
    return null;
  }
};

export const clearCustomerAddressCache = async () => {
  _memoryCustomerAddress = null;
  memoryGpsCache = null;
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEY_SAVED_ADDRS,
      STORAGE_KEY_ACTIVE_ADDR,
      STORAGE_KEY_PERMANENT_CUSTOMER,
      STORAGE_KEY_CUSTOMER_LAST_GPS,
      'last_known_customer_address',
      'last_known_gps_position',
    ]);
  } catch (_) {}
};

export const clearRiderLocationCache = async () => {
  memoryGpsCache = null;
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEY_RIDER_LAST_GPS,
      'last_known_rider_location',
      'last_rider_gps_coords',
    ]);
  } catch (_) {}
};

export const saveLastRoleGpsCoords = async (
  role: 'customer' | 'delivery',
  fix: { latitude: number; longitude: number; accuracy?: number; timestamp?: number },
  ownerUserId?: string | null
): Promise<void> => {
  if (isDummyCoordinates(fix?.latitude, fix?.longitude)) return;
  try {
    const key = role === 'delivery' ? STORAGE_KEY_RIDER_LAST_GPS : STORAGE_KEY_CUSTOMER_LAST_GPS;
    const roleKey = role === 'delivery' ? 'deliveryUser' : 'customerUser';
    const uid = ownerUserId || (await getRoleSessionUserId(roleKey));
    const payload = {
      latitude: Number(fix.latitude),
      longitude: Number(fix.longitude),
      accuracy: fix.accuracy || 10,
      timestamp: fix.timestamp || Date.now(),
      ownerUserId: uid || undefined,
    };
    await AsyncStorage.setItem(key, JSON.stringify(payload));
  } catch (_) {}
};

export const getLastRoleGpsCoords = async (
  role: 'customer' | 'delivery',
  ownerUserId?: string | null
): Promise<DeviceGpsFix | null> => {
  try {
    const key = role === 'delivery' ? STORAGE_KEY_RIDER_LAST_GPS : STORAGE_KEY_CUSTOMER_LAST_GPS;
    const roleKey = role === 'delivery' ? 'deliveryUser' : 'customerUser';
    const uid = ownerUserId || (await getRoleSessionUserId(roleKey));
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || isDummyCoordinates(parsed.latitude, parsed.longitude)) return null;
    if (uid && parsed.ownerUserId && String(parsed.ownerUserId) !== String(uid)) return null;
    return {
      latitude: Number(parsed.latitude),
      longitude: Number(parsed.longitude),
      accuracy: Number(parsed.accuracy || 10),
      timestamp: Number(parsed.timestamp || Date.now()),
    };
  } catch (_) {
    return null;
  }
};

export const clearSupplierLocationCache = async () => {
  _memoryStoreLocation = null;
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEY_PERMANENT_STORE,
      'last_known_resto_location',
    ]);
  } catch (_) {}
};

export const clearAllLocationMemoryCaches = () => {
  _memoryCustomerAddress = null;
  _memoryStoreLocation = null;
};

/**
 * Retrieve saved customer addresses from storage (strictly scoped to current customer)
 */
export const getSavedAddresses = async (): Promise<DeliveryAddress[]> => {
  try {
    const custId = await getRoleSessionUserId('customerUser');
    const raw = await AsyncStorage.getItem(STORAGE_KEY_SAVED_ADDRS);
    if (raw) {
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) return [];
      if (!custId) return list.filter((a: any) => !a?.ownerUserId);
      return list.filter((a: any) => !a?.ownerUserId || String(a.ownerUserId) === custId);
    }
  } catch (e) {}
  return [];
};

/**
 * Save new address to storage and set it as active (tagged with customer userId)
 */
export const saveAddressToStorage = async (
  addr: DeliveryAddress
): Promise<DeliveryAddress[]> => {
  try {
    const custId = await getRoleSessionUserId('customerUser');
    const taggedAddr = custId ? { ...addr, ownerUserId: custId } : addr;
    const current = await getSavedAddresses();
    const updated = [taggedAddr, ...current.filter((a) => a.id !== addr.id)];
    await AsyncStorage.setItem(STORAGE_KEY_SAVED_ADDRS, JSON.stringify(updated));
    await AsyncStorage.setItem(STORAGE_KEY_ACTIVE_ADDR, JSON.stringify(taggedAddr));
    return updated;
  } catch (e) {
    return [addr];
  }
};

// In-memory instant caches for 0ms Zomato / Swiggy latency
let _memoryCustomerAddress: (DeliveryAddress & { ownerUserId?: string }) | null = null;
let _memoryStoreLocation: any = null;

// SPEC PART 1: ZERO DUMMY LOCATION POLICY - No fake Bhopal or dummy coordinates
export const DEFAULT_CUSTOMER_FALLBACK_ADDRESS: DeliveryAddress | null = null;

/**
 * Get the currently active delivery address from storage (strictly validates customer ownerUserId)
 */
export const getActiveDeliveryAddress = async (): Promise<DeliveryAddress | null> => {
  const custId = await getRoleSessionUserId('customerUser');
  if (_memoryCustomerAddress && (_memoryCustomerAddress.fullAddress || _memoryCustomerAddress.latitude)) {
    if (!custId || !_memoryCustomerAddress.ownerUserId || String(_memoryCustomerAddress.ownerUserId) === custId) {
      return _memoryCustomerAddress;
    }
    _memoryCustomerAddress = null;
  }
  try {
    const permanent = await AsyncStorage.getItem(STORAGE_KEY_PERMANENT_CUSTOMER);
    if (permanent) {
      const parsed = JSON.parse(permanent);
      if (parsed && (parsed.fullAddress || parsed.latitude)) {
        if (!custId || !parsed.ownerUserId || String(parsed.ownerUserId) === custId) {
          _memoryCustomerAddress = parsed;
          return parsed;
        }
      }
    }
    const raw = await AsyncStorage.getItem(STORAGE_KEY_ACTIVE_ADDR);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.fullAddress || parsed.latitude)) {
        if (!custId || !parsed.ownerUserId || String(parsed.ownerUserId) === custId) {
          _memoryCustomerAddress = parsed;
          return parsed;
        }
      }
    }
    const saved = await getSavedAddresses();
    if (saved && saved.length > 0) {
      const validSaved = saved.find((s) => !isDummyCoordinates(s.latitude, s.longitude));
      if (validSaved) {
        _memoryCustomerAddress = validSaved;
        return validSaved;
      }
    }
    const lastAddr = await AsyncStorage.getItem('last_known_customer_address');
    const lastCustGps = await getLastRoleGpsCoords('customer', custId);
    if (lastCustGps && lastAddr) {
      const reconstructed: DeliveryAddress = {
        id: 'addr_recovered',
        tag: 'Home',
        houseNo: 'Current Location',
        landmark: lastAddr,
        city: '',
        pincode: '',
        fullAddress: lastAddr,
        latitude: lastCustGps.latitude,
        longitude: lastCustGps.longitude,
        ownerUserId: custId || undefined,
        isCurrentLocation: true,
      };
      _memoryCustomerAddress = reconstructed;
      return reconstructed;
    }
  } catch (e) {}
  _memoryCustomerAddress = null;
  return null;
};

/**
 * Get permanent locked customer address (survives restarts/reloads permanently)
 */
export const getPermanentCustomerAddress = async (): Promise<DeliveryAddress | null> => {
  return await getActiveDeliveryAddress();
};

/**
 * Permanently save customer delivery address across all storage keys & cache
 */
export const savePermanentCustomerAddress = async (addr: DeliveryAddress): Promise<void> => {
  if (isDummyCoordinates(addr?.latitude, addr?.longitude)) return;
  const custId = await getRoleSessionUserId('customerUser');
  const taggedAddr = custId ? { ...addr, ownerUserId: custId } : addr;
  _memoryCustomerAddress = taggedAddr;
  try {
    await AsyncStorage.setItem(STORAGE_KEY_PERMANENT_CUSTOMER, JSON.stringify(taggedAddr));
    await AsyncStorage.setItem(STORAGE_KEY_ACTIVE_ADDR, JSON.stringify(taggedAddr));
    if (addr.fullAddress) {
      await AsyncStorage.setItem('last_known_customer_address', addr.fullAddress);
    }
    if (addr.latitude && addr.longitude) {
      await saveLastRoleGpsCoords('customer', {
        latitude: addr.latitude,
        longitude: addr.longitude,
        timestamp: Date.now(),
      }, custId);
    }
    await saveAddressToStorage(taggedAddr);
  } catch (e) {}
};

/**
 * Set an existing address as the active delivery address
 */
export const setActiveDeliveryAddress = async (addr: DeliveryAddress): Promise<void> => {
  try {
    await savePermanentCustomerAddress(addr);
  } catch (e) {}
};

/**
 * Get permanent locked restaurant / store location (owner-validated)
 */
export const getPermanentStoreLocation = async (): Promise<{
  address: string;
  latitude?: number;
  longitude?: number;
  city?: string;
  fullAddress?: string;
  businessLatitude?: number;
  businessLongitude?: number;
  businessAddress?: string;
} | null> => {
  const suppId = await getRoleSessionUserId('supplierUser');
  if (_memoryStoreLocation && (_memoryStoreLocation.address || _memoryStoreLocation.fullAddress)) {
    if (!suppId || !_memoryStoreLocation.ownerUserId || String(_memoryStoreLocation.ownerUserId) === suppId) {
      return _memoryStoreLocation;
    }
    _memoryStoreLocation = null;
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_PERMANENT_STORE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.address || parsed.fullAddress) && (!suppId || !parsed.ownerUserId || String(parsed.ownerUserId) === suppId)) {
        const pLat = parsed.businessLatitude || parsed.latitude || 0;
        const pLon = parsed.businessLongitude || parsed.longitude || 0;
        const pAddr = parsed.businessAddress || parsed.fullAddress || parsed.address;
        const result = {
          ownerUserId: parsed.ownerUserId || suppId || undefined,
          address: pAddr,
          fullAddress: pAddr,
          latitude: pLat,
          longitude: pLon,
          businessLatitude: pLat,
          businessLongitude: pLon,
          businessAddress: pAddr,
          city: parsed.city || 'Bhopal',
        };
        _memoryStoreLocation = result;
        return result;
      }
    }
    const cachedSupp = await AsyncStorage.getItem('supplierUser');
    if (cachedSupp) {
      const parsed = JSON.parse(cachedSupp);
      const suppAddr = parsed.businessAddress || parsed.fullAddress || parsed.address || parsed.location;
      if (suppAddr) {
        const sLat = parsed.businessLatitude || parsed.latitude || parsed.locationCoords?.latitude || 0;
        const sLon = parsed.businessLongitude || parsed.longitude || parsed.locationCoords?.longitude || 0;
        const result = {
          ownerUserId: suppId || undefined,
          address: suppAddr,
          fullAddress: suppAddr,
          latitude: sLat,
          longitude: sLon,
          businessLatitude: sLat,
          businessLongitude: sLon,
          businessAddress: suppAddr,
          city: parsed.city || 'Bhopal',
        };
        _memoryStoreLocation = result;
        return result;
      }
    }
  } catch (e) {}
  return null;
};

/**
 * Permanently save restaurant / store location
 */
export const savePermanentStoreLocation = async (data: {
  address: string;
  latitude?: number;
  longitude?: number;
  city?: string;
  fullAddress?: string;
  businessLatitude?: number;
  businessLongitude?: number;
  businessAddress?: string;
}): Promise<void> => {
  try {
    const suppId = await getRoleSessionUserId('supplierUser');
    const addr = data.businessAddress || data.fullAddress || data.address;
    const lat = data.businessLatitude || data.latitude || 0;
    const lon = data.businessLongitude || data.longitude || 0;
    const toSave = {
      ownerUserId: suppId || undefined,
      address: addr,
      fullAddress: addr,
      businessAddress: addr,
      latitude: lat,
      longitude: lon,
      businessLatitude: lat,
      businessLongitude: lon,
      city: data.city || 'Bhopal',
    };
    _memoryStoreLocation = toSave;
    await AsyncStorage.setItem(STORAGE_KEY_PERMANENT_STORE, JSON.stringify(toSave));
    await AsyncStorage.setItem('last_known_resto_location', addr);
    const cachedSupp = await AsyncStorage.getItem('supplierUser');
    if (cachedSupp) {
      const parsed = JSON.parse(cachedSupp);
      parsed.address = addr;
      parsed.location = addr;
      parsed.fullAddress = addr;
      parsed.businessAddress = addr;
      if (lat) {
        parsed.latitude = lat;
        parsed.businessLatitude = lat;
      }
      if (lon) {
        parsed.longitude = lon;
        parsed.businessLongitude = lon;
      }
      if (data.city) parsed.city = data.city;
      await AsyncStorage.setItem('supplierUser', JSON.stringify(parsed));
    }
  } catch (e) {}
};

/**
 * Delete a saved address
 */
export const deleteAddressFromStorage = async (
  id: string
): Promise<DeliveryAddress[]> => {
  try {
    const current = await getSavedAddresses();
    const updated = current.filter((a) => a.id !== id);
    await AsyncStorage.setItem(STORAGE_KEY_SAVED_ADDRS, JSON.stringify(updated));
    const active = await getActiveDeliveryAddress();
    if (active && active.id === id) {
      if (updated.length > 0) {
        await savePermanentCustomerAddress(updated[0]);
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY_ACTIVE_ADDR);
        await AsyncStorage.removeItem(STORAGE_KEY_PERMANENT_CUSTOMER);
      }
    }
    return updated;
  } catch (e) {
    return [];
  }
};

/**
 * Auto-Fetch Real Device GPS Location in Background (Silent, 0 Friction)
 * Used by Customer, Supplier, and Delivery Partner on App Open.
 * Never requires user to manually update location again and again.
 */
export const syncLiveDeviceLocationInBackground = async (
  role: 'customer' | 'supplier' | 'delivery'
): Promise<{
  success: boolean;
  coords?: { latitude: number; longitude: number };
  address?: string;
  errorType?: GpsFetchResult['errorType'];
  message?: string;
}> => {
  try {
    // 1. Silent Permission Request / Verification
    const granted = await requestLocationPermission();
    if (!granted) {
      console.log(`[BG GPS SYNC] Location permission not granted for ${role}`);
      return { success: false, errorType: 'PERMISSION_DENIED', message: 'Location permission required.' };
    }

    // 2. Fetch fresh device GPS fix
    const res = await fetchCurrentGpsPositionDetailed(false);
    if (!res.success || !res.fix || isDummyCoordinates(res.fix.latitude, res.fix.longitude)) {
      console.log(`[BG GPS SYNC] No valid GPS fix yet for ${role}`, res.errorType);
      return {
        success: false,
        errorType: res.errorType || 'TIMEOUT',
        message: res.message || 'Unable to fetch current location. Retry.',
      };
    }

    const { latitude, longitude } = res.fix;
    console.log(`[BG GPS SYNC] Fresh real GPS fix for ${role}:`, latitude, longitude);

    // 3. Reverse Geocode to street address
    const geo = await reverseGeocodeCoords(latitude, longitude);
    const fallbackLabel = [geo?.area, geo?.city].filter(Boolean).join(', ');
    const fullAddress =
      geo?.fullAddress ||
      (fallbackLabel ? fallbackLabel : `Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`);

    // 4. Role-specific persistent lock & backend synchronization
    if (role === 'customer') {
      const autoAddr: DeliveryAddress = {
        id: `addr_auto_${Date.now()}`,
        tag: 'Home',
        houseNo: geo?.area || 'Current Location',
        landmark: fullAddress,
        city: geo?.city || '',
        pincode: geo?.pincode || '',
        fullAddress,
        latitude,
        longitude,
        isCurrentLocation: true,
      };
      await savePermanentCustomerAddress(autoAddr);
      await setActiveDeliveryAddress(autoAddr);

      // Background update ONLY authenticated customer in MongoDB (never shared userData)
      const activeRole = await AsyncStorage.getItem('activeRole');
      const uStr = activeRole === 'CUSTOMER' ? await AsyncStorage.getItem('customerUser') : null;
      if (uStr) {
        try {
          const u = JSON.parse(uStr);
          const uId = u?._id || u?.id;
          const uRole = String(u?.role || 'customer').toLowerCase();
          if (uId && ['customer', 'user'].includes(uRole)) {
            api.put(`/users/${uId}`, {
              location: fullAddress,
              fullAddress,
              latitude,
              longitude,
              currentDeviceLocation: {
                latitude,
                longitude,
                address: fullAddress,
                timestamp: new Date().toISOString(),
              },
            }).catch(() => {});
          }
        } catch (e) {}
      }
    } else if (role === 'supplier') {
      await savePermanentStoreLocation({
        address: fullAddress,
        fullAddress,
        businessAddress: fullAddress,
        latitude,
        longitude,
        businessLatitude: latitude,
        businessLongitude: longitude,
        city: geo?.city || '',
      });

      // Background update ONLY authenticated supplier in MongoDB (never shared userData)
      const activeRole = await AsyncStorage.getItem('activeRole');
      const suppStr = activeRole === 'SUPPLIER' ? await AsyncStorage.getItem('supplierUser') : null;
      if (suppStr) {
        try {
          const supp = JSON.parse(suppStr);
          const sId = supp?._id || supp?.id;
          const sRole = String(supp?.role || '').toLowerCase();
          if (sId && ['supplier', 'seller_partner', 'restaurant'].includes(sRole)) {
            api.put(`/profile/${sId}`, {
              location: fullAddress,
              businessAddress: fullAddress,
              latitude,
              longitude,
              businessLatitude: latitude,
              businessLongitude: longitude,
              currentDeviceLocation: {
                latitude,
                longitude,
                address: fullAddress,
                timestamp: new Date().toISOString(),
              },
              liveLocation: { type: 'Point', coordinates: [longitude, latitude] },
              coordinates: { lat: latitude, lng: longitude },
            }).catch(() => {});
          }
        } catch (e) {}
      }
    } else if (role === 'delivery') {
      await AsyncStorage.setItem('last_known_rider_location', fullAddress);
      await saveLastRoleGpsCoords('delivery', res.fix);

      // Background update ONLY authenticated rider in MongoDB (never shared userData)
      const activeRole = await AsyncStorage.getItem('activeRole');
      const delivStr = activeRole === 'DELIVERY' ? await AsyncStorage.getItem('deliveryUser') : null;
      if (delivStr) {
        try {
          const deliv = JSON.parse(delivStr);
          const rId = deliv?._id || deliv?.id;
          const rRole = String(deliv?.role || '').toLowerCase();
          if (rId && ['rider', 'delivery_partner', 'provider', 'delivery'].includes(rRole)) {
            api.put(`/users/${rId}`, {
              location: fullAddress,
              latitude,
              longitude,
              currentDeviceLocation: {
                latitude,
                longitude,
                address: fullAddress,
                timestamp: new Date().toISOString(),
              },
              liveLocation: { type: 'Point', coordinates: [longitude, latitude] },
            }).catch(() => {});
          }
        } catch (e) {}
      }
    }

    return {
      success: true,
      coords: { latitude, longitude },
      address: fullAddress,
    };
  } catch (err) {
    console.log(`[BG GPS SYNC ERROR ${role}]`, err);
    return { success: false, errorType: 'UNKNOWN', message: 'Unable to fetch current location. Retry.' };
  }
};
