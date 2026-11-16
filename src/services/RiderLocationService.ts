import Geolocation from 'react-native-geolocation-service';
import { Platform, PermissionsAndroid } from 'react-native';
import { isValidCoordinates } from './LocationAddressService';

function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

class RiderLocationService {
  private static instance: RiderLocationService;
  private watchId: number | null = null;
  private isTracking: boolean = false;
  private lastCoords: { latitude: number; longitude: number; accuracy?: number } | null = null;
  private lastValidCoords: { latitude: number; longitude: number; time: number } | null = null;
  private lastEmitTime: number = 0;
  private recentPoints: Array<{ lat: number; lon: number; time: number }> = [];

  private constructor() {}

  public static getInstance(): RiderLocationService {
    if (!RiderLocationService.instance) {
      RiderLocationService.instance = new RiderLocationService();
    }
    return RiderLocationService.instance;
  }

  /**
   * Start live GPS tracking for a Rider with:
   * - High accuracy GPS mode
   * - Accuracy verification (reject > 100m)
   * - Mock location detection & rejection
   * - Teleport/speed jump filter (>300m in <5s or speed > 120 km/h)
   * - 3-5 point weighted smoothing buffer
   * - 5-second server emission throttle
   */
  public async startTracking(
    riderId: string,
    socket: any,
    onLocationUpdate?: (coords: { latitude: number; longitude: number }) => void,
    bookingId?: string
  ): Promise<boolean> {
    if (this.isTracking && this.watchId !== null) {
      console.log('📍 [RiderLocationService] Already tracking, skipping duplicate watcher');
      return true;
    }

    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          console.warn('📍 [RiderLocationService] Location permission denied by user');
          return false;
        }

        // Request background location if available
        if (Platform.Version >= 29) {
          try {
            await PermissionsAndroid.request(
              'android.permission.ACCESS_BACKGROUND_LOCATION' as any
            );
          } catch (_) {}
        }
      } catch (err) {
        console.warn('📍 [RiderLocationService] Permission request failed:', err);
        return false;
      }
    }

    this.isTracking = true;
    this.recentPoints = [];

    // Single-shot initial fix (fresh hardware lock)
    Geolocation.getCurrentPosition(
      (pos) => {
        if (!pos?.coords) return;
        const accuracy = pos.coords.accuracy || 10;
        const isMock = Boolean(
          (pos as any).mocked ||
          (pos.coords as any).mocked ||
          (pos as any).isFromMockProvider
        );

        if (isMock) {
          console.warn('🚫 [RiderLocationService] Rejected initial mock location');
          return;
        }

        if (accuracy > 100) {
          console.warn(`⚠️ [RiderLocationService] Rejected initial fix with poor accuracy (${accuracy}m > 100m)`);
          return;
        }

        const lat = Number(pos.coords.latitude);
        const lon = Number(pos.coords.longitude);

        if (isValidCoordinates(lat, lon)) {
          const coords = { latitude: lat, longitude: lon, accuracy };
          this.lastCoords = coords;
          this.lastValidCoords = { latitude: lat, longitude: lon, time: Date.now() };
          this.recentPoints = [{ lat, lon, time: Date.now() }];
          if (onLocationUpdate) onLocationUpdate(coords);
          this.emitLocation(riderId, coords, socket, bookingId);
        }
      },
      (err) => {
        console.warn('📍 [RiderLocationService] Initial position error:', err);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0, forceRequestLocation: true }
    );

    // Continuous watcher
    this.watchId = Geolocation.watchPosition(
      (position) => {
        if (!this.isTracking || !position?.coords) return;

        // 1. Mock location rejection
        const isMock = Boolean(
          (position as any).mocked ||
          (position.coords as any).mocked ||
          (position as any).isFromMockProvider
        );
        if (isMock) {
          console.warn('🚫 [RiderLocationService] Rejected mock location');
          return;
        }

        // 2. Reject accuracy > 100 meters
        const accuracy = position.coords.accuracy || 10;
        if (accuracy > 100) {
          console.warn(`⚠️ [RiderLocationService] Dropped point with poor accuracy (${Math.round(accuracy)}m > 100m)`);
          return;
        }

        const lat = Number(position.coords.latitude);
        const lon = Number(position.coords.longitude);
        if (!isValidCoordinates(lat, lon)) return;

        const now = Date.now();

        // 3. Reject teleportation leaps (> 300m in <5s or speed > 120 km/h)
        if (this.lastValidCoords) {
          const elapsedSec = (now - this.lastValidCoords.time) / 1000;
          const deltaMeters = haversineDistanceMeters(
            this.lastValidCoords.latitude,
            this.lastValidCoords.longitude,
            lat,
            lon
          );
          const calculatedSpeedKmh = elapsedSec > 0 ? (deltaMeters / 1000) / (elapsedSec / 3600) : 0;
          const reportedSpeedKmh = (position.coords.speed || 0) * 3.6;

          if ((deltaMeters > 300 && elapsedSec < 5) || calculatedSpeedKmh > 120 || reportedSpeedKmh > 120) {
            console.warn(`⚡ [RiderLocationService] Dropped impossible jump (${Math.round(deltaMeters)}m in ${elapsedSec.toFixed(1)}s, ${Math.round(calculatedSpeedKmh)} km/h)`);
            return;
          }
        }

        // 4. Rolling smoothing buffer over last 3-5 valid points
        this.recentPoints.push({ lat, lon, time: now });
        if (this.recentPoints.length > 5) {
          this.recentPoints.shift();
        }

        let totalW = 0;
        let weightedLat = 0;
        let weightedLon = 0;
        this.recentPoints.forEach((p, idx) => {
          const w = idx + 1; // Latest point has highest weight
          weightedLat += p.lat * w;
          weightedLon += p.lon * w;
          totalW += w;
        });

        const smoothedLat = Number((weightedLat / totalW).toFixed(7));
        const smoothedLon = Number((weightedLon / totalW).toFixed(7));

        this.lastValidCoords = { latitude: smoothedLat, longitude: smoothedLon, time: now };
        const cleanCoords = {
          latitude: smoothedLat,
          longitude: smoothedLon,
          accuracy,
          heading: position.coords.heading || 0,
          speed: position.coords.speed || 0,
        };
        this.lastCoords = cleanCoords;

        // 5. Throttle server emission to ~5 seconds (5000ms)
        if (now - this.lastEmitTime >= 5000) {
          this.lastEmitTime = now;
          this.emitLocation(riderId, cleanCoords, socket, bookingId);
        }

        if (onLocationUpdate) {
          onLocationUpdate(cleanCoords);
        }
      },
      (error) => {
        console.warn('📍 [RiderLocationService] Watch position error:', error);
      },
      {
        enableHighAccuracy: true,
        distanceFilter: 3, // update every 3 meters
        interval: 3000,
        fastestInterval: 2000,
        forceRequestLocation: true,
        showLocationDialog: true,
      }
    );

    console.log(`📍 [RiderLocationService] Live tracking started (watchId=${this.watchId})`);
    return true;
  }

  /**
   * Immediately stop live GPS tracking and release watcher.
   */
  public stopTracking(): void {
    if (this.watchId !== null) {
      console.log(`📍 [RiderLocationService] Stopping live tracking (watchId=${this.watchId})`);
      Geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.isTracking = false;
    this.recentPoints = [];
  }

  public getTrackingStatus(): boolean {
    return this.isTracking;
  }

  public getLastCoords(): { latitude: number; longitude: number } | null {
    return this.lastCoords;
  }

  private emitLocation(
    riderId: string,
    coords: { latitude: number; longitude: number; heading?: number; speed?: number; accuracy?: number },
    socket: any,
    bookingId?: string
  ) {
    if (!socket || !socket.connected) return;

    const payload = {
      providerId: String(riderId),
      riderId: String(riderId),
      bookingId: bookingId || undefined,
      rideId: bookingId || undefined,
      latitude: coords.latitude,
      longitude: coords.longitude,
      heading: coords.heading ?? 0,
      speed: coords.speed ?? 0,
      accuracy: coords.accuracy ?? 10,
      location: {
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy ?? 10,
      },
      timestamp: Date.now(),
    };

    console.log(
      `📍 [RIDER GPS EMIT 5s] Lat: ${coords.latitude.toFixed(5)}, Lon: ${coords.longitude.toFixed(5)}, Acc: ${coords.accuracy}m, Booking: ${bookingId || 'none'}`
    );

    // Emits provider live position for active bookings
    socket.emit('provider_location_update', payload);
    socket.emit('rider_location_update', payload);
  }
}

export const riderLocationService = RiderLocationService.getInstance();
