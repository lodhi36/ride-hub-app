// Global In-Memory State Manager for Ride Request Testing Flow
// Preserves Ride state and Rider Online state across Role Selection navigation on the same physical device.

export interface RideRequestData {
  rideId: string;
  customerId: string;
  customerName: string;
  pickupLatitude: number;
  pickupLongitude: number;
  destinationLatitude: number;
  destinationLongitude: number;
  pickupAddress: string;
  destinationAddress: string;
  categoryName?: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'STARTED' | 'COMPLETED';
  acceptedBy?: {
    riderId: string;
    riderName: string;
    riderPhone: string;
    riderLocation?: {
      latitude: number;
      longitude: number;
      address?: string;
    };
  };
}

class RideStore {
  private isRiderOnline: boolean = false;
  private riderId: string = '';
  private riderName: string = '';
  private riderLocation: { latitude: number; longitude: number; address: string } | null = null;

  private currentRide: RideRequestData | null = null;
  private pendingRides: RideRequestData[] = [];

  // Rider Online State
  getRiderOnline(): boolean {
    return this.isRiderOnline;
  }

  setRiderOnline(online: boolean) {
    this.isRiderOnline = online;
  }

  getRiderId(): string {
    return this.riderId;
  }

  setRiderId(id: string) {
    this.riderId = id;
  }

  getRiderName(): string {
    return this.riderName;
  }

  setRiderName(name: string) {
    this.riderName = name;
  }

  setRiderLocation(loc: { latitude: number; longitude: number; address: string }) {
    this.riderLocation = loc;
  }

  getRiderLocation() {
    return this.riderLocation;
  }

  // Active/Pending Ride State
  getCurrentRide(): RideRequestData | null {
    return this.currentRide;
  }

  setCurrentRide(ride: RideRequestData | null) {
    this.currentRide = ride;
    if (ride && !this.pendingRides.some(r => r.rideId === ride.rideId)) {
      this.pendingRides.unshift(ride);
    }
  }

  getPendingRides(): RideRequestData[] {
    return this.pendingRides;
  }

  addPendingRide(ride: RideRequestData) {
    if (!this.pendingRides.some(r => r.rideId === ride.rideId)) {
      this.pendingRides.unshift(ride);
    }
  }

  removePendingRide(rideId: string) {
    this.pendingRides = this.pendingRides.filter(r => r.rideId !== rideId);
    if (this.currentRide?.rideId === rideId) {
      this.currentRide = this.pendingRides[0] || null;
    }
  }

  updateRideStatus(status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED', acceptedBy?: any) {
    if (this.currentRide) {
      this.currentRide.status = status;
      if (acceptedBy) {
        this.currentRide.acceptedBy = acceptedBy;
      }
    }
  }

  clearRide() {
    this.currentRide = null;
    this.pendingRides = [];
  }

  clear() {
    // Preserve isRiderOnline status across navigation
    this.riderLocation = null;
    this.currentRide = null;
    this.pendingRides = [];
  }
}

export const rideStore = new RideStore();
export default rideStore;
