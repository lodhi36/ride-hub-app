import Geolocation from 'react-native-geolocation-service';
import { Platform, PermissionsAndroid } from 'react-native';
import { isValidCoordinates } from './LocationAddressService';

class RiderLocationService {
  private static instance: RiderLocationService;
  private watchId: number | null = null;
  private isTracking: boolean = false;
  private lastCoords: { latitude: number; longitude: number } | null = null;
  private lastEmitTime: number = 0;

  private constructor() {}

  public static getInstance(): RiderLocationService {
    if (!RiderLocationService.instance) {
      RiderLocationService.instance = new RiderLocationService();
    }
    return RiderLocationService.instance;
  }

  /**
   * Start live GPS tracking for a Rider only when online & on active duty.
   * Throttles emission to once every 2000ms minimum to preserve device battery.
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
      } catch (err) {
        console.warn('📍 [RiderLocationService] Permission request failed:', err);
        return false;
      }
    }

    this.isTracking = true;

    // Single-shot initial fix (fresh hardware lock)
    Geolocation.getCurrentPosition(
      (pos) => {
        if (pos?.coords && isValidCoordinates(pos.coords.latitude, pos.coords.longitude)) {
          const lat = Number(pos.coords.latitude);
          const lon = Number(pos.coords.longitude);
          const coords = { latitude: lat, longitude: lon, accuracy: pos.coords.accuracy };
          this.lastCoords = coords;
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
        if (!this.isTracking) return;
        const lat = Number(position.coords.latitude);
        const lon = Number(position.coords.longitude);
        if (!isValidCoordinates(lat, lon)) return;

        const coords = { latitude: lat, longitude: lon, accuracy: position.coords.accuracy };
        this.lastCoords = coords;

        const now = Date.now();
        if (now - this.lastEmitTime >= 2000) {
          this.lastEmitTime = now;
          this.emitLocation(riderId, coords, socket, bookingId);
        }

        if (onLocationUpdate) {
          onLocationUpdate(coords);
        }
      },
      (error) => {
        console.warn('📍 [RiderLocationService] Watch position error:', error);
      },
      {
        enableHighAccuracy: true,
        distanceFilter: 1, // update every 1 meter
        interval: 2500,
        fastestInterval: 1000,
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
  }

  public getTrackingStatus(): boolean {
    return this.isTracking;
  }

  public getLastCoords(): { latitude: number; longitude: number } | null {
    return this.lastCoords;
  }

  private emitLocation(
    riderId: string,
    coords: { latitude: number; longitude: number; heading?: number; speed?: number },
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
      location: {
        latitude: coords.latitude,
        longitude: coords.longitude,
      },
      timestamp: Date.now(),
    };

    console.log(
      `📍 [RIDER GPS EMIT] Lat: ${coords.latitude.toFixed(5)}, Lon: ${coords.longitude.toFixed(5)}, Booking: ${bookingId || 'none'}, Rider: ${riderId}`
    );

    // Emits provider live position for active bookings
    socket.emit('provider_location_update', payload);
    socket.emit('rider_location_update', payload);
  }
}

export const riderLocationService = RiderLocationService.getInstance();
