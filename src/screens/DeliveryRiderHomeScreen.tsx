import React, { useState, useEffect, useRef, useContext, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  Image,
  Modal,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Dimensions,
  Alert,
  Animated,
  PanResponder,
  Vibration,
  ActivityIndicator,
  RefreshControl,
  BackHandler,
  Linking,
  TextInput,
  Platform,
  AppState,
} from 'react-native';
import RazorpayCheckout from 'react-native-razorpay';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
let Sound: any = null;
try {
  Sound = require('react-native-sound');
  if (Sound && Sound.setCategory) {
    Sound.setCategory('Playback', true);
  }
} catch (e) {
  console.log('[DeliveryRiderHome] react-native-sound not available', e);
}
import AsyncStorage from '@react-native-async-storage/async-storage';
import WebView from 'react-native-webview';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import Icon from '../components/PngIcon';
import { AuthContext } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api, { clearApiCachedAuth } from '../services/api';
import rideStore from '../services/rideStore';
import { BASE_URL, LOCAL_URL, resolveUploadUrl } from '../config/apiConfig';
import {
  fetchCurrentGpsPosition,
  fetchCurrentGpsPositionDetailed,
  watchCurrentGpsPosition,
  reverseGeocodeCoords,
  isValidCoordinates,
  isDummyCoordinates,
  requestLocationPermission,
  checkLocationPermission,
  syncLiveDeviceLocationInBackground,
  saveLastRoleGpsCoords,
  getLastRoleGpsCoords,
} from '../services/LocationAddressService';
import {
  resolveCategoryName,
  getCategoryIcon,
  getCategoryDeliveryTitle,
  getCategoryPlaceholderImage,
  getCategoryLabel,
  getCategoryTotalLabel,
  getCategoryStoreLabel,
  getCategoryOrderTerminology,
} from '../utils/categoryHelper';
import RiderHelpModal from '../components/RiderHelpModal';
import EmergencySosModal from '../components/EmergencySosModal';
import RoleBannerCarousel from '../components/RoleBannerCarousel';
import CancellationPopupModal, { isCancellationEventProcessed } from '../components/CancellationPopupModal';
import SoundService from '../services/SoundService';
import { getRiderTranslation, RIDER_LANGUAGES, RiderLanguage } from '../utils/riderTranslations';
import { pickImage } from '../utils/imagePicker';
import { OrderHistorySkeletonLoader } from '../components/OrderHistorySkeletonLoader';

const { width } = Dimensions.get('window');

export const calculateHaversineDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// ── Left-Swipe To Accept Slider Component ──
const SwipeToAccept = ({ onAccept, title = 'SWIPE TO ACCEPT ORDER >>>' }: any) => {
  const [trackWidth, setTrackWidth] = useState(width - 48);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const thumbSize = 52;
  const maxSlide = Math.max(10, trackWidth - thumbSize - 8);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx > 0) {
          slideAnim.setValue(Math.min(gestureState.dx, maxSlide));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx >= maxSlide * 0.75) {
          Animated.timing(slideAnim, {
            toValue: maxSlide,
            duration: 100,
            useNativeDriver: false,
          }).start(() => {
            onAccept();
          });
        } else {
          Animated.spring(slideAnim, {
            toValue: 0,
            friction: 6,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  return (
    <View
      style={styles.swipeTrack}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 100) setTrackWidth(w);
      }}
    >
      <Text style={styles.swipeTrackText}>{title}</Text>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.swipeThumb,
          { transform: [{ translateX: slideAnim }] },
        ]}
      >
        <Text style={styles.swipeThumbArrow}>➔</Text>
      </Animated.View>
    </View>
  );
};

// ── Parse Real Booked Items Helper (Supports arrays, object maps, or direct item strings; NO dummy items) ──
export const getParsedItems = (req: any) => {
  if (!req) return [];
  const raw = req.items || req.cartItems || req.packageDetails?.items || req.products || [];
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((it: any) => {
      if (typeof it === 'string') return { name: it, quantity: 1, price: 0, isVeg: false };
      return {
        name: it.name || it.title || it.dishName || it.itemName || it.serviceName || 'Item',
        quantity: Number(it.quantity || it.qty || it.count || 1),
        price: Number(it.price || it.unitPrice || it.amount || 0),
        isVeg: it.isVeg !== false && it.veg !== false,
      };
    });
  }
  if (typeof raw === 'object' && raw !== null && Object.keys(raw).length > 0) {
    return Object.values(raw).map((it: any) => {
      if (typeof it === 'string') return { name: it, quantity: 1, price: 0, isVeg: false };
      return {
        name: it.name || it.title || it.dishName || it.itemName || it.serviceName || 'Item',
        quantity: Number(it.quantity || it.qty || it.count || 1),
        price: Number(it.price || it.unitPrice || it.amount || 0),
        isVeg: it.isVeg !== false && it.veg !== false,
      };
    });
  }
  if (req.dishName || req.serviceName || req.itemName || req.packageName) {
    return [
      {
        name: req.dishName || req.serviceName || req.itemName || req.packageName,
        quantity: Number(req.quantity || req.qty || 1),
        price: Number(req.totalAmount || req.price || req.fare || req.totalTripPay || 0),
        isVeg: false,
      }
    ];
  }
  return [];
};

export const isDoneDeliveryOrder = (b: any) => {
  if (!b) return false;
  const st = (b.status || '').toUpperCase();
  const dst = (b.deliveryStatus || '').toUpperCase();
  const rst = (b.riderStatus || '').toUpperCase();
  return st === 'COMPLETED' || st === 'DELIVERED' || st === 'SERVICE_COMPLETED' || st === 'DELIVERED_SUCCESSFULLY' || st === 'DONE' ||
         dst === 'COMPLETED' || dst === 'DELIVERED' ||
         rst === 'DELIVERED' || rst === 'COMPLETED';
};

export const isCancelledDeliveryOrder = (b: any) => {
  if (!b) return false;
  const st = (b.status || '').toUpperCase();
  const dst = (b.deliveryStatus || '').toUpperCase();
  const rst = (b.riderStatus || '').toUpperCase();
  return Boolean(
    st === 'CANCELLED' || st === 'RESTAURANT_DECLINED' || st.includes('CANCEL') ||
    dst === 'CANCELLED' || dst.includes('CANCEL') ||
    rst === 'CANCELLED' || rst.includes('CANCEL') ||
    b.cancelledAt
  );
};

// ============================================================
// LIFETIME PERSISTENT ONLINE STORE CACHE (ZERO RELOAD, ZERO FLICKER)
// ============================================================
const RIDER_PERSISTENT_HOTSPOTS_CACHE_KEY = 'RIDER_SAVED_HOTSPOTS_CACHE_V2';
let _inMemoryNearbyHotspots: any[] = [];
let _inMemorySelectedHotspot: any | null = null;
let _inMemoryHotspotRouteInfo: { distanceKm: number; etaMinutes: number } | null = null;
let _inMemoryHotspotsLoadedOnce = false;
let _lastHotspotsFetchTimestamp = 0;

const DeliveryRiderHomeScreen = ({ navigation, route }: any) => {
  const isDone = isDoneDeliveryOrder;
  const isCanc = isCancelledDeliveryOrder;
  const insets = useSafeAreaInsets();
  const { user, logout, updateUser } = useContext(AuthContext);
  const { socket, unreadNotifCount } = useSocket();

  const [riderId, setRiderId] = useState<string>(() => route?.params?.riderId || user?._id || user?.id || '');
  const displayName = user?.name || route?.params?.riderName || 'Rider';
  const vehicleType = (user as any)?.vehicleType || 'Bike';

  const incomingMapWebViewRef = useRef<any>(null);
  const mapWebViewRef = useRef<any>(null);

  // ── Online / Offline State ──
  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [isPendingOffline, setIsPendingOffline] = useState<boolean>(false);
  const isOnlineRef = useRef<boolean>(false);
  isOnlineRef.current = isOnline;
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);
  const switchAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      try {
        clearApiCachedAuth();
        await AsyncStorage.setItem('activeRole', 'DELIVERY');
        const delivTok = await AsyncStorage.getItem('deliveryToken');
        if (delivTok) {
          await AsyncStorage.setItem('userToken', delivTok);
        }
        clearApiCachedAuth();

        const delivUserStr = await AsyncStorage.getItem('deliveryUser');
        if (delivUserStr) {
          const parsed = JSON.parse(delivUserStr);
          if (parsed && (parsed._id || parsed.id)) {
            if (!riderId) {
              setRiderId(parsed._id || parsed.id);
            }
            if (!user || !(user._id || user.id) || !['rider', 'delivery', 'delivery_partner', 'provider'].includes((user.role || '').toLowerCase())) {
              updateUser?.(parsed);
            }
          }
        }
      } catch (_) {}
    })();
  }, []);

  // ── Real Data States ──
  const [weeklyEarnings, setWeeklyEarnings] = useState<number>(0);
  const [todayTrips, setTodayTrips] = useState<number>(0);
  const [pocketBalance, setPocketBalance] = useState<number>(0);
  const [cashLimit, setCashLimit] = useState<number>(0);
  const [customerTips, setCustomerTips] = useState<number>(0);

  const [allDeliveries, setAllDeliveries] = useState<any[]>([]);
  const [activeDeliveries, setActiveDeliveries] = useState<any[]>(() => {
    if (route?.params?.initialActiveOrder) {
      return [route.params.initialActiveOrder];
    }
    if (route?.params?.activeRide) {
      return [route.params.activeRide];
    }
    try {
      const mem = rideStore.getCurrentRide();
      if (mem && (mem.rideId || (mem as any).bookingId)) {
        return [mem as any];
      }
    } catch (_) {}
    return [];
  });

  const [completedDeliveries, setCompletedDeliveries] = useState<any[]>([]);
  const [cancelledDeliveries, setCancelledDeliveries] = useState<any[]>([]);
  const [orderFilter, setOrderFilter] = useState<'all' | 'active' | 'completed' | 'cancelled'>('all');
  const [orderDateFilter, setOrderDateFilter] = useState<'all' | 'today' | 'yesterday' | 'custom'>('all');
  const [incomingRequest, setIncomingRequest] = useState<any | null>(null);
  const [requestCountdown, setRequestCountdown] = useState<number>(30);
  const hasActiveTrip = activeDeliveries.length > 0;
  const hasActiveTripRef = useRef<boolean>(false);
  hasActiveTripRef.current = hasActiveTrip;
  const activeDeliveriesRef = useRef<any[]>([]);
  activeDeliveriesRef.current = activeDeliveries;
  const seenRequestIdsRef = useRef<Set<string>>(new Set());
  const activeRequestIdRef = useRef<string | null>(null);
  const acceptedBookingIdRef = useRef<string | null>(null);
  const isTogglingOnlineRef = useRef<boolean>(false);
  const handleRejectRequestRef = useRef<any>(null);
  const lastGpsCoordsStateRef = useRef<{ lat: number; lon: number; time: number }>({ lat: 0, lon: 0, time: 0 });
  const [isAcceptingRequest, setIsAcceptingRequest] = useState<boolean>(false);
  const [isAdvancingRideStage, setIsAdvancingRideStage] = useState<boolean>(false);
  const [activeRideDistanceEta, setActiveRideDistanceEta] = useState<{ distanceKm: number; etaMinutes: number } | null>(null);
  const [nearbyHotspots, setNearbyHotspots] = useState<any[]>(_inMemoryNearbyHotspots);
  const [selectedHotspot, setSelectedHotspot] = useState<any | null>(_inMemorySelectedHotspot);
  const [hotspotRouteInfo, setHotspotRouteInfo] = useState<{ distanceKm: number; etaMinutes: number } | null>(_inMemoryHotspotRouteInfo);
  const [loadingHotspots, setLoadingHotspots] = useState<boolean>(false);
  const [hotspotFetchError, setHotspotFetchError] = useState<string | null>(null);
  const [discoveryRouteError, setDiscoveryRouteError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadingDeliveries, setLoadingDeliveries] = useState<boolean>(false);
  const [cancellationPopup, setCancellationPopup] = useState<{
    visible: boolean;
    orderId?: string;
    reason?: string;
    cancelledBy?: 'RESTAURANT' | 'CUSTOMER' | 'RIDER';
  }>({ visible: false });

  // ── Rider Order Cancellation State ──
  const [riderCancelModalVisible, setRiderCancelModalVisible] = useState<boolean>(false);
  const [orderToCancelByRider, setOrderToCancelByRider] = useState<any | null>(null);
  const [riderCancelReason, setRiderCancelReason] = useState<string>('Vehicle breakdown / mechanical issue');
  const [isSubmittingRiderCancel, setIsSubmittingRiderCancel] = useState<boolean>(false);


  const nearbyHotspotsRef = useRef<any[]>(_inMemoryNearbyHotspots);
  nearbyHotspotsRef.current = nearbyHotspots;
  const selectedHotspotRef = useRef<any | null>(_inMemorySelectedHotspot);
  selectedHotspotRef.current = selectedHotspot;
  const incomingRequestRef = useRef<any | null>(null);
  incomingRequestRef.current = incomingRequest;
  const discoveryRouteCacheRef = useRef<Map<string, { originLat: number; originLon: number; destLat: number; destLon: number; coordinates: Array<[number, number]>; distanceKm: number; etaMinutes: number; cachedAt: number }>>(new Map());
  const lastDiscoverySyncRef = useRef<{ key: string; lat: number; lon: number; time: number }>({ key: '', lat: 0, lon: 0, time: 0 });
  const hotspotRefreshTimerRef = useRef<any>(null);
  const hotspotFetchInFlightRef = useRef<boolean>(false);
  const hasLoadedHotspotsOnceRef = useRef<boolean>(_inMemoryHotspotsLoadedOnce || _inMemoryNearbyHotspots.length > 0);
  const lastHotspotsSignatureRef = useRef<string>('');
  const fetchNearbyHotspotsRef = useRef<any>(null);
  const syncDiscoveryRoutesRef = useRef<any>(null);

  useEffect(() => {
    if (route?.params?.activeRide) {
      const r = route.params.activeRide;
      setActiveDeliveries([r]);
      activeDeliveriesRef.current = [r];
      try { rideStore.setCurrentRide(r); } catch (_) {}
      AsyncStorage.setItem('active_rider_ride', JSON.stringify(r)).catch(() => {});
    }
  }, [route?.params?.activeRide]);

  // Restore cached stores instantly from AsyncStorage if cold start
  useEffect(() => {
    (async () => {
      try {
        if (_inMemoryNearbyHotspots.length === 0) {
          const cachedJson = await AsyncStorage.getItem(RIDER_PERSISTENT_HOTSPOTS_CACHE_KEY);
          if (cachedJson) {
            const parsed = JSON.parse(cachedJson);
            if (Array.isArray(parsed) && parsed.length > 0) {
              _inMemoryNearbyHotspots = parsed;
              _inMemoryHotspotsLoadedOnce = true;
              hasLoadedHotspotsOnceRef.current = true;
              setNearbyHotspots(parsed);
              nearbyHotspotsRef.current = parsed;
              const sel = parsed[0] || null;
              setSelectedHotspot(sel);
              selectedHotspotRef.current = sel;
            }
          }
        }
      } catch (_) {}
    })();
  }, []);


  const RIDER_CANCEL_REASONS = [
    'Vehicle breakdown / mechanical issue',
    'Store is closed / items unavailable',
    'Customer unreachable / wrong address',
    'Heavy rain / severe weather condition',
    'Emergency / personal issue',
    'Excessive store waiting delay',
  ];

  const handleOpenRiderCancelModal = (del: any) => {
    setOrderToCancelByRider(del);
    setRiderCancelReason(RIDER_CANCEL_REASONS[0]);
    setRiderCancelModalVisible(true);
  };

  const handleConfirmRiderCancel = async () => {
    if (!orderToCancelByRider) return;
    const bId = orderToCancelByRider.bookingId || orderToCancelByRider.rideId || orderToCancelByRider._id;
    if (!bId) return;
    try {
      setIsSubmittingRiderCancel(true);
      await api.post('/bookings/cancel', {
        bookingId: bId,
        reason: riderCancelReason,
        cancelledBy: 'RIDER',
      });

      const updatedOrder = {
        ...orderToCancelByRider,
        status: 'CANCELLED',
        deliveryStatus: 'CANCELLED',
        riderStatus: 'CANCELLED',
        cancelledBy: 'RIDER',
        cancellationReason: riderCancelReason,
        cancelledAt: new Date().toISOString(),
      };

      setActiveDeliveries((prev) => prev.filter((d) => (d.bookingId || d.rideId || d._id) !== bId));
      setCancelledDeliveries((prev) => [updatedOrder, ...prev.filter((d) => (d.bookingId || d.rideId || d._id) !== bId)]);

      if (socket) {
        socket.emit('ride_cancelled', {
          bookingId: bId,
          rideId: bId,
          reason: riderCancelReason,
          cancelledBy: 'RIDER',
        });
      }

      setRiderCancelModalVisible(false);
      setOrderToCancelByRider(null);
      Alert.alert('Delivery Cancelled', 'The delivery order has been cancelled.');
      fetchDeliveries();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || err?.message || 'Failed to cancel order.');
    } finally {
      setIsSubmittingRiderCancel(false);
    }
  };

  // ── Order Alert Tone (SoundService) ──
  const playOrderAlertSound = useCallback(() => {
    try {
      console.log('🔔 [DeliveryRiderHome] Triggering continuous order alert sound...');
      SoundService.playIncomingOrderAlert();
    } catch (e) {
      console.warn('[DeliveryRiderHome] Error playing alert tone:', e);
    }
  }, []);

  const stopOrderAlertSound = useCallback(() => {
    try {
      console.log('🔇 [DeliveryRiderHome] Stopping continuous order alert sound...');
      SoundService.stopIncomingOrderAlert();
    } catch (e) {
      console.warn('[DeliveryRiderHome] Error stopping alert tone:', e);
    }
  }, []);

  // ── Auto Play tone when incomingRequest appears, stop when resolved/dismissed ──
  const activeIncomingIdRef = useRef<string | null>(null);

  useEffect(() => {
    const curId = incomingRequest ? String(incomingRequest.bookingId || incomingRequest._id || 'active_req') : null;
    if (curId) {
      if (activeIncomingIdRef.current !== curId) {
        activeIncomingIdRef.current = curId;
        console.log('🔔 [INCOMING_REQUEST] Continuous order alert playing for order:', curId);
        playOrderAlertSound();
      }
    } else {
      if (activeIncomingIdRef.current !== null) {
        activeIncomingIdRef.current = null;
        console.log('🔇 [INCOMING_REQUEST] Request cleared, stopping alert tone');
        stopOrderAlertSound();
      }
    }
  }, [incomingRequest, playOrderAlertSound, stopOrderAlertSound]);

  // ── 30-Second Countdown Timer for Incoming Delivery Request (Requirement 2) ──
  useEffect(() => {
    if (incomingRequest) {
      setRequestCountdown(30);
      const timer = setInterval(() => {
        setRequestCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            console.log('⏱️ [INCOMING_REQUEST] 30s Countdown expired. Auto declining request.');
            if (handleRejectRequestRef.current) {
              handleRejectRequestRef.current();
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [incomingRequest]);

  // Ensure sound is stopped if rider navigates away / unmounts
  useEffect(() => {
    return () => {
      stopOrderAlertSound();
    };
  }, [stopOrderAlertSound]);

  // ── Dark Mode State ──
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  // ── Bottom Tabs: 'feed' | 'orders' | 'pocket' | 'profile' ──
  const [activeTab, setActiveTab] = useState<'feed' | 'orders' | 'pocket' | 'profile'>('feed');

  // ── Sub-screen for Rider Profile Details (When profile name is clicked) ──
  const [showRiderDetails, setShowRiderDetails] = useState<boolean>(false);
  const [riderProfilePic, setRiderProfilePic] = useState<string | null>(
    () => user?.profilePicture || (user?.photos && user.photos[0]) || null
  );
  const [riderVehicleNumber, setRiderVehicleNumber] = useState<string>((user as any)?.vehicleNumber || 'MPO4ZJ8711');
  const [riderSecondaryPhone, setRiderSecondaryPhone] = useState<string>((user as any)?.secondaryPhone || '8871104229');
  const [riderCity, setRiderCity] = useState<string>((user as any)?.city || '');
  const [dlExpiryDate, setDlExpiryDate] = useState<string>((user as any)?.dlExpiry || '28/12/2028');

  const toggleDarkMode = async () => {
    const nextMode = !isDarkMode;
    setIsDarkMode(nextMode);
    await AsyncStorage.setItem('rider_dark_mode', nextMode ? 'true' : 'false').catch(() => {});
  };

  // ── Pocket Real Interactive Calendar States ──
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const [calendarViewDate, setCalendarViewDate] = useState<Date>(() => new Date());
  const [calendarQuickFilter, setCalendarQuickFilter] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const [isCalendarExpanded, setIsCalendarExpanded] = useState<boolean>(true);

  useEffect(() => {
    AsyncStorage.getItem('registeredSupplierPhoto').then((stored) => {
      if (stored) setRiderProfilePic(stored);
    }).catch(() => {});
  }, []);

  const handleChangeProfilePic = () => {
    Alert.alert(
      'Change Profile Photo',
      'Choose an option to update your partner profile photo:',
      [
        {
          text: 'Camera 📷',
          onPress: async () => {
            try {
              const uri = await pickImage(true);
              if (uri) {
                setRiderProfilePic(uri);
                await AsyncStorage.setItem('registeredSupplierPhoto', uri);
                const targetId = riderId || user?._id || user?.id;
                if (targetId) {
                  await api.post('/users/update-profile', {
                    userId: targetId.toString(),
                    profilePicture: uri,
                    photos: [uri],
                  }).catch(() => {});
                }
                Alert.alert('Success ✅', 'Profile photo updated successfully!');
              }
            } catch (err) {
              console.log('Error picking photo:', err);
            }
          },
        },
        {
          text: 'Choose from Gallery 🖼️',
          onPress: async () => {
            try {
              const uri = await pickImage(false);
              if (uri) {
                setRiderProfilePic(uri);
                await AsyncStorage.setItem('registeredSupplierPhoto', uri);
                const targetId = riderId || user?._id || user?.id;
                if (targetId) {
                  await api.post('/users/update-profile', {
                    userId: targetId.toString(),
                    profilePicture: uri,
                    photos: [uri],
                  }).catch(() => {});
                }
                Alert.alert('Success ✅', 'Profile photo updated successfully!');
              }
            } catch (err) {
              console.log('Error picking photo:', err);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleEditVehicleNumber = () => {
    Alert.alert(
      'Update Vehicle Number',
      `Current Number: ${riderVehicleNumber}\n\nDo you want to change your vehicle number?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          onPress: () => {
            Alert.alert('Success', 'Vehicle number updated successfully.');
          },
        },
      ]
    );
  };

  const handleEditSecondaryPhone = () => {
    Alert.alert(
      'Update Secondary Phone',
      `Current Number: ${riderSecondaryPhone}\n\nDo you want to change your secondary mobile number?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          onPress: () => {
            Alert.alert('Success', 'Secondary phone number updated successfully.');
          },
        },
      ]
    );
  };

  // ── Multi-Language Translation State ──
  const [language, setLanguage] = useState<RiderLanguage>('hi');

  // ── Header Modals & Bottom Sheets (Help, ID Card, Language, SOS, Rain) ──
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [showIdCardModal, setShowIdCardModal] = useState<boolean>(false);
  const [showLanguageModal, setShowLanguageModal] = useState<boolean>(false);
  const [showSosModal, setShowSosModal] = useState<boolean>(false);
  const [showBannersModal, setShowBannersModal] = useState<boolean>(() => Boolean(route?.params?.openDashboard || (route?.params?.hasActiveTrip && activeDeliveries.length > 0)));

  useEffect(() => {
    if (route?.params?.openDashboard || (route?.params?.hasActiveTrip && activeDeliveries.length > 0)) {
      setShowBannersModal(true);
    }
  }, [route?.params?.openDashboard, route?.params?.hasActiveTrip, activeDeliveries.length]);

  useEffect(() => {
    AsyncStorage.getItem('rider_app_language').then((val) => {
      if (val && (val in { hi: 1, en: 1, hinglish: 1, mr: 1, bn: 1, gu: 1, te: 1, ta: 1, pa: 1, kn: 1 })) {
        setLanguage(val as RiderLanguage);
      }
    }).catch(() => {});
  }, []);

  const handleSelectAppLanguage = async (langCode: RiderLanguage) => {
    setLanguage(langCode);
    setShowLanguageModal(false);
    await AsyncStorage.setItem('rider_app_language', langCode).catch(() => {});
    const langObj = RIDER_LANGUAGES.find((l) => l.code === langCode);
    Alert.alert(
      'Language Updated',
      `${langObj?.nativeLabel || langObj?.label || langCode} selected successfully.`
    );
  };

  const t = (key: string) => getRiderTranslation(language, key);
  const [showCalendarModal, setShowCalendarModal] = useState<boolean>(false);
  const [showDepositModal, setShowDepositModal] = useState<boolean>(false);
  const [depositAmountInput, setDepositAmountInput] = useState<string>('200');
  const [selectedDepositMethod, setSelectedDepositMethod] = useState<'UPI' | 'GPAY' | 'PHONEPE' | 'PAYTM'>('UPI');
  const [isProcessingDeposit, setIsProcessingDeposit] = useState<boolean>(false);
  const [isAutoFollowPaused, setIsAutoFollowPaused] = useState<boolean>(false);
  const [selectedMapFilter, setSelectedMapFilter] = useState<'hotspot' | 'drop'>('hotspot');
  const [isRainReported, setIsRainReported] = useState<boolean>(false);
  const updateRiderLocationRef = useRef<any>(null);

  // Handle real-time map interaction and hotspot events from Map WebView
  const handleMapMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'SELECT_HOTSPOT' && data.hotspot) {
        console.log('🏪 [HOTSPOT SELECTED FROM MAP]:', data.hotspot.name);
        setSelectedHotspot(data.hotspot);
        selectedHotspotRef.current = data.hotspot;
        if (data.routeInfo) {
          setHotspotRouteInfo(data.routeInfo);
        }
        if (syncDiscoveryRoutesRef.current && nearbyHotspotsRef.current.length > 0 && activeDeliveriesRef.current.length === 0) {
          syncDiscoveryRoutesRef.current(nearbyHotspotsRef.current, data.hotspot, null, true);
        }
      } else if (data.type === 'MAP_READY') {
        console.log('🗺️ [RIDER LEAFLET MAP READY]');
        if (updateRiderLocationRef.current) { updateRiderLocationRef.current(); }
        if (activeDeliveriesRef.current.length === 0 && !incomingRequestRef.current) {
          if (mapWebViewRef.current && nearbyHotspotsRef.current.length > 0) {
            const curSel = selectedHotspotRef.current || nearbyHotspotsRef.current[0];
            const selId = curSel ? String(curSel.id || curSel.restaurantId || '') : '';
            mapWebViewRef.current.injectJavaScript(`
              if (window.updateHotspotMarkers) {
                window.updateHotspotMarkers(${JSON.stringify(nearbyHotspotsRef.current)}, ${JSON.stringify(selId)});
              }
              true;
            `);
            if (syncDiscoveryRoutesRef.current) {
              syncDiscoveryRoutesRef.current(nearbyHotspotsRef.current, curSel, null, true);
            }
          }
          if (fetchNearbyHotspotsRef.current) {
            fetchNearbyHotspotsRef.current(hasLoadedHotspotsOnceRef.current);
          }
        }
      } else if (data.type === 'AUTO_FOLLOW_CHANGED') {
        setIsAutoFollowPaused(!data.enabled);
      }
    } catch (e) {}
  }, []);

  // ── Swipe Up Gesture from Bottom on Map to open Dashboard (Locked when active ride in progress) ──
  const swipeUpPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !hasActiveTripRef.current,
      onMoveShouldSetPanResponder: (_, gestureState) => !hasActiveTripRef.current && Math.abs(gestureState.dy) > 10,
      onPanResponderRelease: (_, gestureState) => {
        if (!hasActiveTripRef.current && (gestureState.dy < -15 || gestureState.vy < -0.3)) {
          setShowBannersModal(true);
        }
      },
    })
  ).current;

  // ── Swipe Down Gesture from Dashboard Header/Handle to Collapse ──
  const swipeDownPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 10,
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 15 || gestureState.vy > 0.3) {
          setShowBannersModal(false);
        }
      },
    })
  ).current;

  const handleReportRain = () => {
    Alert.alert(
      '🌧️ Report Rain',
      isRainReported
        ? 'Rain has already been reported in your area and extra rain surge incentive is active.'
        : 'Is it raining in your current delivery zone?',
      [
        { text: 'Cancel', style: 'cancel' },
        ...(isRainReported
          ? []
          : [
              {
                text: 'Yes, Report',
                onPress: () => {
                  setIsRainReported(true);
                  setShowHelpModal(false);
                  Alert.alert(
                    '🌧️ Rain Reported!',
                    'Thank you! Rain report has been logged for your area. Extra rain surge incentive is now active.'
                  );
                },
              },
            ]),
      ]
    );
  };

  // ── Universal Hardware Back Button Handler for Rider Root & Subscreens ──
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        // 0. Incoming request modal CANNOT be dismissed by back press! Must accept or decline!
        if (incomingRequest) {
          console.log('[BACK PRESS] Incoming delivery request active, ignoring back press!');
          return true;
        }

        // 1. Close open Modals first
        if (showDepositModal) {
          setShowDepositModal(false);
          return true;
        }
        if (showCalendarModal) {
          setShowCalendarModal(false);
          return true;
        }
        if (showHelpModal) {
          setShowHelpModal(false);
          return true;
        }
        if (showIdCardModal) {
          setShowIdCardModal(false);
          return true;
        }
        if (showLanguageModal) {
          setShowLanguageModal(false);
          return true;
        }
        if (showSosModal) {
          setShowSosModal(false);
          return true;
        }
        if (showBannersModal) {
          setShowBannersModal(false);
          return true;
        }

        // 2. Close Rider Details Subscreen if open
        if (showRiderDetails) {
          setShowRiderDetails(false);
          return true;
        }

        // 3. If Rider is on Pocket, Orders, or Profile Sub-Tabs -> Navigate back to Home / Feed!
        if (activeTab !== 'feed') {
          setActiveTab('feed');
          return true;
        }

        // 4. When on root Rider Home (Feed tab) -> Directly navigate to Role Selection per Specification Point 1
        navigation.navigate('RoleSelection');
        return true;
      };

      const backSub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => backSub.remove();
    }, [
      incomingRequest,
      showDepositModal,
      showCalendarModal,
      showHelpModal,
      showIdCardModal,
      showLanguageModal,
      showSosModal,
      showBannersModal,
      showRiderDetails,
      activeTab,
    ])
  );

  // ── Dedicated Hardware Back Press Lock while incomingRequest is active ──
  useEffect(() => {
    if (incomingRequest) {
      const lockBack = () => true;
      const sub = BackHandler.addEventListener('hardwareBackPress', lockBack);
      return () => sub.remove();
    }
  }, [incomingRequest]);

  // ── Persistent Active Ride State (Requirement 5): Restore active ride immediately across tabs & app restart ──
  const restoreActiveRide = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('active_rider_ride');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && (parsed.bookingId || parsed._id)) {
          const st = String(parsed.status || '').toUpperCase();
          const isFinished = st === 'COMPLETED' || st === 'DELIVERED' || st.includes('CANCEL');
          if (!isFinished) {
            setActiveDeliveries([parsed]);
            activeDeliveriesRef.current = [parsed];
            return;
          }
          AsyncStorage.removeItem('active_rider_ride').catch(() => {});
          try { rideStore.clearRide(); } catch (_) {}
        }
      } else {
        const mem = rideStore.getCurrentRide();
        if (mem && (mem.rideId || (mem as any).bookingId)) {
          const st = String(mem.status || '').toUpperCase();
          const isFinished = st === 'COMPLETED' || st === 'DELIVERED' || st.includes('CANCEL');
          if (!isFinished) {
            setActiveDeliveries([mem as any]);
            activeDeliveriesRef.current = [mem as any];
            return;
          }
        }
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    restoreActiveRide();
  }, [restoreActiveRide]);

// Auto lockout removed per Requirement 3: Main Dashboard remains accessible with persistent floating trip card

  // ── Fetch Real Earnings from Backend ──
  const fetchEarnings = useCallback(async () => {
    try {
      const pId = (riderId || user?._id || user?.id)?.toString();
      if (!pId) return;
      const res = await fetch(`${BASE_URL.replace(/\/+$/, '')}/bookings/earnings?providerId=${pId}&role=rider`);
      const data = await res.json();
      if (data?.success) {
        if (data.totalEarnings !== undefined) setWeeklyEarnings(data.totalEarnings);
        if (data.pocketBalance !== undefined) setPocketBalance(data.pocketBalance);
        if (data.cashLimit !== undefined) setCashLimit(data.cashLimit);
        if (data.completedServicesCount !== undefined) setTodayTrips(data.completedServicesCount);
        else if (data.completedToday !== undefined) setTodayTrips(data.completedToday);
        if (data.tips !== undefined) setCustomerTips(data.tips);
      }
    } catch (_) {}
  }, [riderId, user?._id, user?.id]);

  // ── Handle Real Razorpay Deposit into Pocket Balance ──
  const handlePerformDeposit = async () => {
    const amt = parseFloat(depositAmountInput);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid deposit amount (Minimum ₹10).');
      return;
    }
    if (amt < 10) {
      Alert.alert('Minimum Deposit', 'Minimum deposit amount is ₹10.');
      return;
    }

    setIsProcessingDeposit(true);
    try {
      // 1. Create real order on backend via Razorpay SDK
      const orderRes = await api.post('/payment/create-order', {
        amount: amt,
      });

      if (!orderRes.data || !orderRes.data.success) {
        throw new Error(orderRes.data?.message || 'Failed to initialize payment gateway order.');
      }

      const { orderId, amount: amountInPaise, keyId } = orderRes.data;

      // 2. Configure Razorpay Checkout options with authenticated rider credentials
      const riderPhone = (user?.phoneNumber || user?.phone || '').toString().replace(/[^0-9]/g, '').slice(-10);
      const riderName = user?.name || displayName || 'Delivery Partner';
      const riderEmail = user?.email || `rider_${(riderId || user?._id || 'user').toString().slice(-6)}@ridehub.in`;

      const options = {
        description: `Pocket Cash Deposit of ₹${amt.toFixed(2)}`,
        image: 'https://img.icons8.com/fluency/96/wallet.png',
        currency: 'INR',
        key: keyId || 'rzp_live_TmSPcojj3JfRzH',
        amount: amountInPaise || Math.round(amt * 100),
        name: 'Ride Hub Partner Pocket',
        order_id: orderId,
        prefill: {
          email: riderEmail,
          contact: riderPhone || '9876543210',
          name: riderName,
        },
        theme: { color: '#0066FF' },
      };

      // 3. Open Real Native Razorpay Checkout Modal
      RazorpayCheckout.open(options)
        .then(async (data: any) => {
          console.log('✅ [Razorpay Checkout Success]:', data);
          try {
            // 4. Verify cryptographic signature & credit rider pocket balance in MongoDB
            const targetId = (riderId || user?._id || user?.id)?.toString();
            const verifyRes = await api.post('/payment/deposit-cash', {
              orderId: orderId,
              paymentId: data.razorpay_payment_id,
              signature: data.razorpay_signature,
              amount: amt,
              riderId: targetId,
              purpose: 'pocket_deposit',
            });

            const updatedBal = verifyRes.data?.pocketBalance !== undefined
              ? verifyRes.data.pocketBalance
              : (pocketBalance || 0) + amt;
            const updatedLimit = verifyRes.data?.cashLimit !== undefined
              ? verifyRes.data.cashLimit
              : (cashLimit || 1500);

            setPocketBalance(updatedBal);
            setCashLimit(updatedLimit);
            await AsyncStorage.setItem('rider_pocket_balance', updatedBal.toString()).catch(() => {});
            setShowDepositModal(false);

            Alert.alert(
              'Deposit Successful ✅',
              `₹${amt.toFixed(2)} has been successfully deposited into your RideHub Pocket Balance via Razorpay (${selectedDepositMethod})!\n\nTransaction ID: ${data.razorpay_payment_id}\nUpdated Pocket Balance: ₹${updatedBal.toFixed(2)}`
            );

            // Re-fetch earnings dynamically from backend
            fetchEarnings();
          } catch (verifyErr: any) {
            console.error('[Deposit Verification Error]:', verifyErr);
            Alert.alert(
              'Payment Verification Issue',
              verifyErr.response?.data?.message || 'Payment was processed by Razorpay but backend verification timed out. Your balance will sync shortly.'
            );
          } finally {
            setIsProcessingDeposit(false);
          }
        })
        .catch((err: any) => {
          console.log('[Razorpay Checkout Cancelled/Failed]:', err);
          setIsProcessingDeposit(false);
          if (err?.code !== 2) {
            Alert.alert('Payment Incomplete', err?.description || 'Deposit payment was cancelled or not completed.');
          }
        });
    } catch (err: any) {
      setIsProcessingDeposit(false);
      console.error('[Deposit Initialization Error]:', err);
      Alert.alert(
        'Payment Gateway Error',
        err.response?.data?.message || err.message || 'Unable to connect to payment gateway. Please check your internet connection.'
      );
    }
  };

  // ── GPS Location & Address State ──
  const [currentAddress, setCurrentAddress] = useState<string>('Locating your position...');
  const [gpsStatus, setGpsStatus] = useState<'locating' | 'ready' | 'permission_denied' | 'gps_unavailable' | 'fetch_failed'>(() => {
    const uLat = Number((user as any)?.latitude || (user as any)?.locationCoords?.latitude || 0);
    const uLon = Number((user as any)?.longitude || (user as any)?.locationCoords?.longitude || 0);
    if (isValidCoordinates(uLat, uLon) && !isDummyCoordinates(uLat, uLon)) return 'ready';
    return 'locating';
  });
  const [riderCoords, setRiderCoords] = useState<{ latitude: number; longitude: number } | null>(() => {
    const uLat = Number((user as any)?.latitude || (user as any)?.locationCoords?.latitude || 0);
    const uLon = Number((user as any)?.longitude || (user as any)?.locationCoords?.longitude || 0);
    if (isValidCoordinates(uLat, uLon) && !isDummyCoordinates(uLat, uLon)) return { latitude: uLat, longitude: uLon };
    return null;
  });
  const hasCenteredMapRef = useRef<boolean>(false);

  useEffect(() => {
    AsyncStorage.getItem('rider_dark_mode').then((val) => {
      if (val === 'true') setIsDarkMode(true);
    }).catch(() => {});
  }, []);

  // Re-center Leaflet Map smoothly to Rider's latest real GPS & resume Auto-Follow Camera
  const recenterMap = useCallback(async () => {
    try {
      setIsAutoFollowPaused(false);
      if (riderCoords && !isDummyCoordinates(riderCoords.latitude, riderCoords.longitude) && mapWebViewRef.current) {
        mapWebViewRef.current.injectJavaScript(`
          if (window.recenterSmooth) {
            window.recenterSmooth(${riderCoords.latitude}, ${riderCoords.longitude}, 16);
          } else if (window.setCenter) {
            window.setCenter(${riderCoords.latitude}, ${riderCoords.longitude}, 16);
          }
          true;
        `);
      }

      const gpsRes = await fetchCurrentGpsPositionDetailed(false);
      if (gpsRes.success && gpsRes.fix && !isDummyCoordinates(gpsRes.fix.latitude, gpsRes.fix.longitude)) {
        const { latitude, longitude } = gpsRes.fix;
        setRiderCoords({ latitude, longitude });
        setGpsStatus('ready');
        saveLastRoleGpsCoords('delivery', gpsRes.fix, riderId || user?._id || user?.id).catch(() => {});
        if (mapWebViewRef.current) {
          mapWebViewRef.current.injectJavaScript(`
            if (window.recenterSmooth) {
              window.recenterSmooth(${latitude}, ${longitude}, 16);
            } else if (window.setCenter) {
              window.setCenter(${latitude}, ${longitude}, 16);
            }
            true;
          `);
        }
      } else if (!riderCoords) {
        setGpsStatus(
          gpsRes.errorType === 'PERMISSION_DENIED'
            ? 'permission_denied'
            : gpsRes.errorType === 'LOCATION_OFF'
            ? 'gps_unavailable'
            : 'fetch_failed'
        );
      }
    } catch (e) {
      console.log('[GPS RECENTER ERROR]', e);
    }
  }, [riderCoords, riderId, user]);

  // Real-time GPS Location Fetcher
  const updateRiderLocation = useCallback(async () => {
    updateRiderLocationRef.current = updateRiderLocation;
    try {
      const hasPerm = await checkLocationPermission();
      if (!hasPerm) {
        const granted = await requestLocationPermission();
        if (!granted) {
          setGpsStatus('permission_denied');
          setCurrentAddress('Location permission required.');
          return;
        }
      }

      if (!riderCoords) {
        setGpsStatus('locating');
      }

      const gpsRes = await fetchCurrentGpsPositionDetailed(false);
      if (gpsRes.success && gpsRes.fix && !isDummyCoordinates(gpsRes.fix.latitude, gpsRes.fix.longitude)) {
        const gps = gpsRes.fix;
        const targetId = riderId || user?._id || user?.id;
        setRiderCoords({ latitude: gps.latitude, longitude: gps.longitude });
        setGpsStatus('ready');
        saveLastRoleGpsCoords('delivery', gps, targetId).catch(() => {});

        const geo = await reverseGeocodeCoords(gps.latitude, gps.longitude);
        if (geo?.fullAddress) {
          setCurrentAddress(geo.fullAddress);
        } else if (geo?.city) {
          setCurrentAddress(`${geo.area ? geo.area + ', ' : ''}${geo.city}`);
        }

        // Update rider marker & smooth auto-follow camera inside Leaflet
        if (mapWebViewRef.current) {
          mapWebViewRef.current.injectJavaScript(`
            if (window.updateRiderMarker) {
              window.updateRiderMarker(${gps.latitude}, ${gps.longitude}, ${!hasCenteredMapRef.current});
            }
            true;
          `);
          hasCenteredMapRef.current = true;
        }

        // Send GPS update to MongoDB and socket
        if (targetId) {
          // 1. Persist to MongoDB User Model
          api.post('/users/update-profile', {
            userId: targetId.toString(),
            latitude: gps.latitude,
            longitude: gps.longitude,
            locationCoords: { latitude: gps.latitude, longitude: gps.longitude },
            fullAddress: geo?.fullAddress || '',
          }).catch(() => {});

          // 2. Emit real-time Socket update
          if (socket && socket.connected) {
            const activeBId = acceptedBookingIdRef.current || (activeDeliveriesRef.current.length > 0 ? (activeDeliveriesRef.current[0]?.bookingId || activeDeliveriesRef.current[0]?._id || activeDeliveriesRef.current[0]?.id) : null);
            socket.emit('rider_location_update', {
              riderId: targetId.toString(),
              bookingId: activeBId || undefined,
              rideId: activeBId || undefined,
              orderId: activeBId || undefined,
              latitude: gps.latitude,
              longitude: gps.longitude,
              accuracy: gps.accuracy,
              timestamp: gps.timestamp || Date.now(),
              location: {
                latitude: gps.latitude,
                longitude: gps.longitude,
                address: geo?.fullAddress || '',
              },
            });
          }
        }
      } else {
        setGpsStatus(
          gpsRes.errorType === 'PERMISSION_DENIED'
            ? 'permission_denied'
            : gpsRes.errorType === 'LOCATION_OFF'
            ? 'gps_unavailable'
            : 'fetch_failed'
        );
      }
    } catch (e) {
      console.log('[GPS FETCH ERROR]', e);
      setGpsStatus('fetch_failed');
    }
  }, [riderId, user, socket, riderCoords]);
  updateRiderLocationRef.current = updateRiderLocation;

  useEffect(() => {
    (async () => {
      const targetId = riderId || user?._id || user?.id;
      // Restore ONLY this rider's last valid real GPS position cleanly without camera jump
      if (!riderCoords) {
        const cachedRiderGps = await getLastRoleGpsCoords('delivery', targetId);
        if (cachedRiderGps && !isDummyCoordinates(cachedRiderGps.latitude, cachedRiderGps.longitude)) {
          setRiderCoords({ latitude: cachedRiderGps.latitude, longitude: cachedRiderGps.longitude });
          setGpsStatus('ready');
        }
      }

      syncLiveDeviceLocationInBackground('delivery').then((bgRes) => {
        if (bgRes.success && bgRes.coords && !isDummyCoordinates(bgRes.coords.latitude, bgRes.coords.longitude)) {
          setRiderCoords(bgRes.coords);
          setGpsStatus('ready');
          if (bgRes.address) setCurrentAddress(bgRes.address);
        }
      }).catch(() => {});
      if (updateRiderLocationRef.current) {
        updateRiderLocationRef.current();
      }
    })();
    const unsubGps = watchCurrentGpsPosition(async (fix) => {
      if (isDummyCoordinates(fix.latitude, fix.longitude)) return;
      const now = Date.now();
      const distFromLastState = calculateHaversineDistanceKm(
        lastGpsCoordsStateRef.current.lat,
        lastGpsCoordsStateRef.current.lon,
        fix.latitude,
        fix.longitude
      );
      if (distFromLastState >= 0.015 || (now - lastGpsCoordsStateRef.current.time > 8000) || lastGpsCoordsStateRef.current.lat === 0) {
        lastGpsCoordsStateRef.current = { lat: fix.latitude, lon: fix.longitude, time: now };
        setRiderCoords({ latitude: fix.latitude, longitude: fix.longitude });
        setGpsStatus('ready');
        saveLastRoleGpsCoords('delivery', fix, riderId || user?._id || user?.id).catch(() => {});
      }

      // Live GPS updates smoothly move marker AND auto-follow camera (unless manually panned)
      if (mapWebViewRef.current) {
        if (!hasCenteredMapRef.current) {
          hasCenteredMapRef.current = true;
          mapWebViewRef.current.injectJavaScript(`
            if (window.setCenter) {
              window.setCenter(${fix.latitude}, ${fix.longitude}, 16);
            }
            true;
          `);
        } else {
          mapWebViewRef.current.injectJavaScript(`
            if (window.updateRiderMarker) {
              window.updateRiderMarker(${fix.latitude}, ${fix.longitude}, false);
            }
            true;
          `);
        }
      }

      const targetId = riderId || user?._id || user?.id;
      if (targetId) {
        api.post('/users/update-profile', {
          userId: targetId.toString(),
          latitude: fix.latitude,
          longitude: fix.longitude,
          locationCoords: { latitude: fix.latitude, longitude: fix.longitude },
        }).catch(() => {});

        if (socket && socket.connected) {
          const activeBId = acceptedBookingIdRef.current || (activeDeliveriesRef.current.length > 0 ? (activeDeliveriesRef.current[0]?.bookingId || activeDeliveriesRef.current[0]?._id || activeDeliveriesRef.current[0]?.id) : null);
          socket.emit('rider_location_update', {
            riderId: targetId.toString(),
            bookingId: activeBId || undefined,
            rideId: activeBId || undefined,
            orderId: activeBId || undefined,
            latitude: fix.latitude,
            longitude: fix.longitude,
            accuracy: fix.accuracy,
            timestamp: fix.timestamp || Date.now(),
            location: {
              latitude: fix.latitude,
              longitude: fix.longitude,
              address: currentAddress,
            },
          });
        }
      }
    });

    return () => {
      unsubGps();
    };
  }, [riderId, user, socket]);

  // ── Resolve rider ID from deliveryUser storage if needed ──
  useEffect(() => {
    const resolveId = async () => {
      if (!riderId) {
        try {
          const delivUserStr = await AsyncStorage.getItem('deliveryUser');
          if (delivUserStr) {
            const u = JSON.parse(delivUserStr);
            if (u?._id || u?.id) setRiderId((u._id || u.id).toString());
          }
        } catch (_) {}
      }
    };
    resolveId();
  }, [riderId]);

  // ── Restore saved online status on mount & whenever screen comes into focus ──
  const restoreOnlineStatus = useCallback(async () => {
    try {
      let targetId = riderId || user?._id || user?.id;
      if (!targetId) {
        try {
          const stored = await AsyncStorage.getItem('deliveryUser');
          if (stored) {
            const parsed = JSON.parse(stored);
            targetId = parsed?._id || parsed?.id;
          }
        } catch (_) {}
      }

      if (targetId) {
        const idStr = targetId.toString();
        const saved = await AsyncStorage.getItem(`rider_status_${idStr}`);
        if (saved !== null) {
          const v = Boolean(JSON.parse(saved));
          setIsOnline(v);
          isOnlineRef.current = v;
          switchAnim.setValue(v ? 1 : 0);
          try { rideStore?.setRiderOnline?.(v); } catch (_) {}
          return;
        }
      }

      const globalSaved = await AsyncStorage.getItem('delivery_is_online');
      if (globalSaved !== null) {
        const v = Boolean(JSON.parse(globalSaved));
        setIsOnline(v);
        isOnlineRef.current = v;
        switchAnim.setValue(v ? 1 : 0);
        try { rideStore?.setRiderOnline?.(v); } catch (_) {}
        return;
      }

      if ((user as any)?.isOnline !== undefined) {
        const online = (user as any)?.isOnline === true;
        setIsOnline(online);
        isOnlineRef.current = online;
        switchAnim.setValue(online ? 1 : 0);
        try { rideStore?.setRiderOnline?.(online); } catch (_) {}
      }
    } catch (_) {}
  }, [riderId, user, switchAnim]);

  useFocusEffect(
    useCallback(() => {
      restoreOnlineStatus();
    }, [restoreOnlineStatus])
  );

  // ── Fetch Real Deliveries (Active, Completed & Cancelled) ──
  const fetchDeliveries = useCallback(async () => {
    try {
      setLoadingDeliveries(true);
      let uId = riderId || user?._id || user?.id;
      let userPhone = user?.phoneNumber || user?.phone || '';
      if (!uId || !userPhone) {
        try {
          const delivUserStr = await AsyncStorage.getItem('deliveryUser');
          if (delivUserStr) {
            const u = JSON.parse(delivUserStr);
            if (!uId && (u?._id || u?.id)) uId = (u._id || u.id).toString();
            if (!userPhone) userPhone = u?.phoneNumber || u?.phone || '';
          }
        } catch (_) {}
      }
      if (!uId && !userPhone) return;

      const queryUrl = `/bookings/my-bookings?userId=${uId || ''}&role=rider${userPhone ? `&phone=${encodeURIComponent(userPhone)}` : ''}`;
      const res = await api.get(queryUrl);
      if (res.data?.success && res.data.bookings) {
        const all: any[] = res.data.bookings;
        setAllDeliveries(all);
        const cacheKey = `CACHE_RIDER_DELIVERIES_${uId || userPhone || 'rider'}`;
        AsyncStorage.setItem(cacheKey, JSON.stringify(all)).catch(() => {});
        
        const isDone = (b: any) => {
          const st = (b.status || '').toUpperCase();
          const dst = (b.deliveryStatus || '').toUpperCase();
          const rst = (b.riderStatus || '').toUpperCase();
          return st === 'COMPLETED' || st === 'DELIVERED' || st === 'SERVICE_COMPLETED' || st === 'DELIVERED_SUCCESSFULLY' || st === 'DONE' ||
                 dst === 'COMPLETED' || dst === 'DELIVERED' ||
                 rst === 'DELIVERED' || rst === 'COMPLETED';
        };

        const isCanc = (b: any) => {
          const st = (b.status || '').toUpperCase();
          const dst = (b.deliveryStatus || '').toUpperCase();
          const rst = (b.riderStatus || '').toUpperCase();
          return st === 'CANCELLED' || st === 'RESTAURANT_DECLINED' || st.includes('CANCEL') ||
                 dst === 'CANCELLED' || dst.includes('CANCEL') ||
                 rst === 'CANCELLED' || rst.includes('CANCEL');
        };

        const isPendingOffer = (b: any) => {
          const dst = (b.deliveryStatus || '').toUpperCase();
          const st = (b.status || '').toUpperCase();
          const bRiderId = (b.riderId || b.acceptedBy?.riderId || b.assignedRiderId || b.driverId || b.providerId || '').toString();
          const isMyAcceptedRide = Boolean(bRiderId && (bRiderId === String(uId) || (riderId && bRiderId === String(riderId))));

          if (isMyAcceptedRide) {
            return false;
          }
          if (dst === 'SEARCHING_FOR_RIDER' || dst === 'RIDER_REQUESTED' || dst === 'PENDING_RIDER' || dst === 'OFFERED') {
            return true;
          }
          if (b.pendingRiderId && String(b.pendingRiderId) === String(uId)) {
            return true;
          }
          if (st === 'PENDING_RESTAURANT' || st === 'BOOKING_REQUESTED' || st === 'PENDING' || st === 'SEARCHING') {
            return true;
          }
          return false;
        };

        const activeList = all.filter((b: any) => !isDone(b) && !isCanc(b) && !isPendingOffer(b));
        
        // Guard: If we currently have an accepted active delivery, preserve it so it never hides/disappears
        const existingActive = activeDeliveriesRef.current.length > 0 ? activeDeliveriesRef.current[0] : null;
        if (activeList.length === 0 && existingActive) {
          const curId = String(existingActive.bookingId || existingActive._id || existingActive.rideId);
          const foundInAll = all.find((b: any) => String(b.bookingId || b._id || b.rideId) === curId);
          if (!foundInAll || (!isDone(foundInAll) && !isCanc(foundInAll))) {
            activeList.push(existingActive);
          }
        }

        // Backend query fallback for single active running booking
        if (activeList.length === 0 && (uId || userPhone)) {
          try {
            const activeRes = await api.get(`/bookings/active?riderId=${uId || ''}&role=rider${userPhone ? `&phone=${encodeURIComponent(userPhone)}` : ''}`).catch(() => null);
            if (activeRes?.data?.success && activeRes?.data?.activeBooking) {
              const b = activeRes.data.activeBooking;
              if (!isDone(b) && !isCanc(b) && !isPendingOffer(b)) {
                activeList.push(b);
              }
            }
          } catch (_) {}
        }

        const completedList = all.filter((b: any) => isDone(b) && !isCanc(b));
        const cancelledList = all.filter((b: any) => isCanc(b));

        setActiveDeliveries(activeList);
        activeDeliveriesRef.current = activeList;
        if (activeList.length > 0) {
          AsyncStorage.setItem('active_rider_ride', JSON.stringify(activeList[0])).catch(() => {});
          try { rideStore.setCurrentRide(activeList[0]); } catch (_) {}
        } else {
          AsyncStorage.removeItem('active_rider_ride').catch(() => {});
          try { rideStore.clearRide(); } catch (_) {}
        }
        setCompletedDeliveries(completedList);
        setCancelledDeliveries(cancelledList);
        if (completedList.length > 0) {
          setTodayTrips(completedList.length);
        }
      }
    } catch (err) {
      console.log('[fetchDeliveries Error]', err);
    } finally {
      setLoadingDeliveries(false);
      setRefreshing(false);
    }
  }, [riderId, user]);

  // ── Fetch Nearby Online Stores & Cached ORS Road Discovery Routes ──
  const lastHotspotsFetchCoordsRef = useRef<{ latitude: number; longitude: number; time: number } | null>(null);
  const riderCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
  riderCoordsRef.current = riderCoords;

  const syncDiscoveryRoutes = useCallback(
    async (
      storesList: any[],
      primaryStore: any | null,
      coordsOverride?: { latitude: number; longitude: number } | null,
      forceSync: boolean = false
    ) => {
      try {
        if (activeDeliveriesRef.current.length > 0 || incomingRequestRef.current) {
          if (mapWebViewRef.current) {
            mapWebViewRef.current.injectJavaScript(`if (window.clearDiscoveryRoutes) { window.clearDiscoveryRoutes(); } true;`);
          }
          setDiscoveryRouteError(null);
          return;
        }

        const rCoords = coordsOverride || riderCoordsRef.current;
        const rLat = Number(rCoords?.latitude || 0);
        const rLon = Number(rCoords?.longitude || 0);
        const hasValidRider = Boolean(rCoords && isValidCoordinates(rLat, rLon) && !isDummyCoordinates(rLat, rLon));

        if (!hasValidRider || !Array.isArray(storesList) || storesList.length === 0) {
          if (mapWebViewRef.current) {
            mapWebViewRef.current.injectJavaScript(`if (window.clearDiscoveryRoutes) { window.clearDiscoveryRoutes(); } true;`);
          }
          setHotspotRouteInfo(null);
          if (!hasValidRider) setDiscoveryRouteError(null);
          return;
        }

        const primaryId = primaryStore ? String(primaryStore.id || primaryStore.restaurantId || '') : '';
        const orderedTargets: any[] = [];
        const seenIds = new Set<string>();
        if (primaryStore && primaryId) {
          orderedTargets.push(primaryStore);
          seenIds.add(primaryId);
        }
        for (const s of storesList) {
          if (orderedTargets.length >= 3) break;
          const sid = String(s.id || s.restaurantId || s._id || '');
          if (!sid || seenIds.has(sid)) continue;
          if (!isValidCoordinates(s.latitude, s.longitude) || isDummyCoordinates(s.latitude, s.longitude)) continue;
          orderedTargets.push(s);
          seenIds.add(sid);
        }

        if (orderedTargets.length === 0) {
          if (mapWebViewRef.current) {
            mapWebViewRef.current.injectJavaScript(`if (window.clearDiscoveryRoutes) { window.clearDiscoveryRoutes(); } true;`);
          }
          return;
        }

        const routeSignature = orderedTargets
          .map((t) => `${t.id || t.restaurantId}:${Number(t.latitude).toFixed(4)},${Number(t.longitude).toFixed(4)}`)
          .join('|');
        const lastSync = lastDiscoverySyncRef.current;
        const movedKm = lastSync.lat !== 0
          ? calculateHaversineDistanceKm(lastSync.lat, lastSync.lon, rLat, rLon)
          : 999;

        // Only recalculate ORS road route if rider moved significantly (>= 250m) or store selection changed
        if (!forceSync && lastSync.key === routeSignature && movedKm < 0.25) {
          return;
        }

        lastDiscoverySyncRef.current = { key: routeSignature, lat: rLat, lon: rLon, time: Date.now() };
        const routesPayload: any[] = [];
        let primaryRouteMeta: { distanceKm: number; etaMinutes: number } | null = null;
        let hadRouteFailure = false;

        for (let idx = 0; idx < orderedTargets.length; idx++) {
          const st = orderedTargets[idx];
          const sid = String(st.id || st.restaurantId || st._id || '');
          const dLat = Number(st.latitude);
          const dLon = Number(st.longitude);
          const isPrimary = idx === 0;
          const cacheEntry = discoveryRouteCacheRef.current.get(sid);

          let routeData: { coordinates: Array<[number, number]>; distanceKm: number; etaMinutes: number } | null = null;
          if (
            cacheEntry &&
            Date.now() - cacheEntry.cachedAt < 5 * 60 * 1000 &&
            calculateHaversineDistanceKm(cacheEntry.originLat, cacheEntry.originLon, rLat, rLon) < 0.08 &&
            calculateHaversineDistanceKm(cacheEntry.destLat, cacheEntry.destLon, dLat, dLon) < 0.02
          ) {
            routeData = {
              coordinates: cacheEntry.coordinates,
              distanceKm: cacheEntry.distanceKm,
              etaMinutes: cacheEntry.etaMinutes,
            };
          } else {
            try {
              const orsRes = await api.post('/bookings/ors-route', {
                originLat: rLat,
                originLon: rLon,
                destLat: dLat,
                destLon: dLon,
              });
              if (orsRes.data?.success && Array.isArray(orsRes.data.coordinates) && orsRes.data.coordinates.length >= 2) {
                routeData = {
                  coordinates: orsRes.data.coordinates,
                  distanceKm: Number(orsRes.data.distanceKm || st.distanceKm || 0),
                  etaMinutes: Number(orsRes.data.etaMinutes || st.etaMinutes || 2),
                };
                discoveryRouteCacheRef.current.set(sid, {
                  originLat: rLat,
                  originLon: rLon,
                  destLat: dLat,
                  destLon: dLon,
                  coordinates: routeData.coordinates,
                  distanceKm: routeData.distanceKm,
                  etaMinutes: routeData.etaMinutes,
                  cachedAt: Date.now(),
                });
              } else {
                hadRouteFailure = true;
              }
            } catch (_) {
              hadRouteFailure = true;
            }
          }

          if (routeData && routeData.coordinates.length >= 2) {
            routesPayload.push({
              storeId: sid,
              storeName: st.name,
              isPrimary,
              coordinates: routeData.coordinates,
              distanceKm: routeData.distanceKm,
              etaMinutes: routeData.etaMinutes,
            });
            if (isPrimary) {
              primaryRouteMeta = { distanceKm: routeData.distanceKm, etaMinutes: routeData.etaMinutes };
            }
          }
        }

        if (routesPayload.length > 0) {
          setDiscoveryRouteError(null);
          if (primaryRouteMeta) {
            _inMemoryHotspotRouteInfo = primaryRouteMeta;
            setHotspotRouteInfo(primaryRouteMeta);
          }
          if (mapWebViewRef.current) {
            mapWebViewRef.current.injectJavaScript(`
              if (window.updateDiscoveryRoutes) {
                window.updateDiscoveryRoutes(${JSON.stringify(routesPayload)});
              }
              true;
            `);
          }
        } else {
          // Never draw fake straight lines on ORS failure — clear stale routes and inform cleanly
          if (mapWebViewRef.current) {
            mapWebViewRef.current.injectJavaScript(`if (window.clearDiscoveryRoutes) { window.clearDiscoveryRoutes(); } true;`);
          }
          setHotspotRouteInfo(null);
          if (hadRouteFailure) {
            setDiscoveryRouteError('Real road route temporarily unavailable. Showing verified store distance.');
          }
        }
      } catch (_) {}
    },
    []
  );
  syncDiscoveryRoutesRef.current = syncDiscoveryRoutes;

  const fetchNearbyHotspots = useCallback(async (isSilentBg: boolean = false) => {
    if (activeDeliveriesRef.current.length > 0 || incomingRequestRef.current) {
      // During active delivery or incoming request: NEVER wipe stores from memory!
      // Simply hide discovery layers on map so trip navigation remains clean.
      if (mapWebViewRef.current) {
        mapWebViewRef.current.injectJavaScript(`
          if (window.hideDiscoveryLayers) { window.hideDiscoveryLayers(); }
          true;
        `);
      }
      return;
    }

    if (hotspotFetchInFlightRef.current) return;
    hotspotFetchInFlightRef.current = true;
    _lastHotspotsFetchTimestamp = Date.now();

    // Never show loading spinner if stores are already loaded in memory/disk
    if (!isSilentBg && !hasLoadedHotspotsOnceRef.current && nearbyHotspotsRef.current.length === 0) {
      setLoadingHotspots(true);
    }

    try {
      const rCoords = riderCoordsRef.current;
      const lat = Number(rCoords?.latitude || 0);
      const lon = Number(rCoords?.longitude || 0);
      const hasValidGps = Boolean(rCoords && isValidCoordinates(lat, lon) && !isDummyCoordinates(lat, lon));
      const url = hasValidGps
        ? `/bookings/rider/nearby-hotspots?latitude=${lat}&longitude=${lon}`
        : '/bookings/rider/nearby-hotspots';
      const res = await api.get(url);

      if (res.data?.success && Array.isArray(res.data.hotspots)) {
        // Strict deduplication + valid non-dummy GPS verification on client
        const dedupMap = new Map<string, any>();
        for (const h of res.data.hotspots) {
          const sid = String(h?.id || h?.restaurantId || h?.supplierId || h?._id || '').trim();
          const hLat = Number(h?.latitude || 0);
          const hLon = Number(h?.longitude || 0);
          if (!sid || !isValidCoordinates(hLat, hLon) || isDummyCoordinates(hLat, hLon)) continue;
          if (!dedupMap.has(sid)) {
            dedupMap.set(sid, { ...h, id: sid, restaurantId: sid, latitude: hLat, longitude: hLon });
          }
        }
        const list = Array.from(dedupMap.values());

        // Canonical store identity signature — STRICTLY EXCLUDES rider GPS distance (prevents reload loop)
        const nextSignature = list
          .map((s) => `${s.id}:${s.name}:${Number(s.latitude).toFixed(4)},${Number(s.longitude).toFixed(4)}:${s.categoryName || s.category || ''}:${s.pendingOrdersCount || 0}`)
          .join('|');

        hasLoadedHotspotsOnceRef.current = true;
        _inMemoryHotspotsLoadedOnce = true;
        setHotspotFetchError(null);

        const prevSel = selectedHotspotRef.current;
        const prevSelId = prevSel ? String(prevSel.id || prevSel.restaurantId || '') : '';
        const nextSel = (prevSelId && list.find((item) => item.id === prevSelId)) || list[0] || null;
        const nextSelId = nextSel ? String(nextSel.id || nextSel.restaurantId || '') : null;

        // If the store identities have NOT changed: update in-memory metadata silently, DO NOT reload React state or map
        if (nextSignature === lastHotspotsSignatureRef.current && nearbyHotspotsRef.current.length === list.length) {
          nearbyHotspotsRef.current = list;
          _inMemoryNearbyHotspots = list;
          return;
        }

        lastHotspotsSignatureRef.current = nextSignature;
        _inMemoryNearbyHotspots = list;
        _inMemorySelectedHotspot = nextSel;
        AsyncStorage.setItem(RIDER_PERSISTENT_HOTSPOTS_CACHE_KEY, JSON.stringify(list)).catch(() => {});

        setNearbyHotspots(list);
        nearbyHotspotsRef.current = list;
        setSelectedHotspot(nextSel);
        selectedHotspotRef.current = nextSel;

        if (mapWebViewRef.current) {
          mapWebViewRef.current.injectJavaScript(`
            if (window.showDiscoveryLayers) { window.showDiscoveryLayers(); }
            if (window.updateHotspotMarkers) {
              window.updateHotspotMarkers(${JSON.stringify(list)}, ${JSON.stringify(nextSelId)});
            }
            true;
          `);
        }

        if (list.length === 0) {
          setHotspotRouteInfo(null);
          setDiscoveryRouteError(null);
          if (mapWebViewRef.current) {
            mapWebViewRef.current.injectJavaScript(`if (window.clearDiscoveryRoutes) { window.clearDiscoveryRoutes(); } true;`);
          }
        } else {
          syncDiscoveryRoutes(list, nextSel, hasValidGps ? { latitude: lat, longitude: lon } : null, false);
        }
      }
    } catch (e: any) {
      console.log('[RIDER HOTSPOTS FETCH ERROR]', e?.message || e);
      // Do not replace visible cached stores with error screen on background refresh failures
      if (!hasLoadedHotspotsOnceRef.current && nearbyHotspotsRef.current.length === 0) {
        setHotspotFetchError('Unable to refresh online stores right now.');
      }
    } finally {
      hotspotFetchInFlightRef.current = false;
      setLoadingHotspots(false);
    }
  }, [syncDiscoveryRoutes]);
  fetchNearbyHotspotsRef.current = fetchNearbyHotspots;

  // ── Instant Delivery Cache Hydration (0ms delay - zero blank orders tab) ──
  useEffect(() => {
    let isMounted = true;
    const hydrateDeliveries = async () => {
      try {
        let uId = riderId || user?._id || user?.id;
        let uPhone = user?.phoneNumber || user?.phone || '';
        if (!uId || !uPhone) {
          try {
            const delivUserStr = await AsyncStorage.getItem('deliveryUser');
            if (delivUserStr) {
              const u = JSON.parse(delivUserStr);
              if (!uId && (u?._id || u?.id)) uId = (u._id || u.id).toString();
              if (!uPhone) uPhone = u?.phoneNumber || u?.phone || '';
            }
          } catch (_) {}
        }
        const cacheKey = `CACHE_RIDER_DELIVERIES_${uId || uPhone || 'rider'}`;
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached && isMounted) {
          const all = JSON.parse(cached);
          if (Array.isArray(all) && all.length > 0) {
            setAllDeliveries(all);
            const isDone = (b: any) => {
              const st = (b.status || '').toUpperCase();
              const dst = (b.deliveryStatus || '').toUpperCase();
              const rst = (b.riderStatus || '').toUpperCase();
              return st === 'COMPLETED' || st === 'DELIVERED' || st === 'SERVICE_COMPLETED' || st === 'DELIVERED_SUCCESSFULLY' || st === 'DONE' ||
                     dst === 'COMPLETED' || dst === 'DELIVERED' ||
                     rst === 'DELIVERED' || rst === 'COMPLETED';
            };
            const isCanc = (b: any) => {
              const st = (b.status || '').toUpperCase();
              const dst = (b.deliveryStatus || '').toUpperCase();
              const rst = (b.riderStatus || '').toUpperCase();
              return st === 'CANCELLED' || st === 'RESTAURANT_DECLINED' || st.includes('CANCEL') ||
                     dst === 'CANCELLED' || dst.includes('CANCEL') ||
                     rst === 'CANCELLED' || rst.includes('CANCEL');
            };
            setCompletedDeliveries(all.filter((b: any) => isDone(b) && !isCanc(b)));
            setCancelledDeliveries(all.filter((b: any) => isCanc(b)));
          }
        }
      } catch (_) {}
    };
    hydrateDeliveries();
    return () => { isMounted = false; };
  }, [riderId, user?._id, user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      fetchEarnings(),
      fetchDeliveries(),
      updateRiderLocation(),
    ]).catch(() => {});
    setRefreshing(false);
  }, [fetchEarnings, fetchDeliveries, updateRiderLocation]);

  useEffect(() => {
    if (activeTab === 'orders' || activeTab === 'pocket') {
      fetchDeliveries();
      fetchEarnings();
    }
  }, [activeTab, fetchDeliveries, fetchEarnings]);

  // ── Query Database for Active Pending Delivery Request ──
  const checkPendingDeliveryRequest = useCallback(async () => {
    try {
      if (!isOnlineRef.current) return;
      if (activeDeliveries.length > 0) return;
      if (incomingRequest) return;
      const uId = riderId || user?._id || user?.id;
      if (!uId) return;
      const res = await api.get(`/bookings/pending-rider-request?riderId=${uId}`);
      if (res.data?.success && res.data.hasPending && res.data.request) {
        const reqData = res.data.request;
        const reqId = (reqData.bookingId || reqData.rideId || reqData._id || '').toString();
        if (!reqId) return;
        if (incomingRequest && (incomingRequest.bookingId === reqId || incomingRequest._id === reqId)) {
          return;
        }
        seenRequestIdsRef.current.add(reqId);
        activeRequestIdRef.current = reqId;
        const parsedCategory = getCategoryLabel(reqData);
        const parsedReq = {
          bookingId: reqData.bookingId || reqData.rideId || reqData._id,
          _id: reqData._id || reqData.bookingId,
          categoryName: parsedCategory,
          businessCategoryName: parsedCategory,
          categoryId: reqData.categoryId || null,
          isOrderingForSomeoneElse: Boolean(reqData.isOrderingForSomeoneElse || reqData.orderType === 'SOMEONE_ELSE'),
          recipientName: reqData.recipientName || '',
          recipientPhone: reqData.recipientPhone || '',
          customerName: (reqData.isOrderingForSomeoneElse || reqData.orderType === 'SOMEONE_ELSE') && reqData.recipientName
            ? `${reqData.recipientName} (Friend)`
            : (reqData.customerName || 'Customer'),
          customerPhone: (reqData.isOrderingForSomeoneElse || reqData.orderType === 'SOMEONE_ELSE') && reqData.recipientPhone
            ? reqData.recipientPhone
            : (reqData.customerPhone || ''),
          customerAddress: reqData.customerAddress || reqData.destinationAddress || reqData.deliveryAddress || reqData.serviceAddress || 'Delivery Location',
          destinationAddress: reqData.customerAddress || reqData.destinationAddress || reqData.deliveryAddress || reqData.serviceAddress || 'Delivery Location',
          deliveryAddress: reqData.customerAddress || reqData.destinationAddress || reqData.deliveryAddress || reqData.serviceAddress || 'Delivery Location',
          totalAmount: Number(reqData.totalAmount || reqData.price || 0),
          pickupAddress: reqData.supplierBusinessAddress || reqData.pickupAddress || reqData.restaurantAddress || 'Store Location',
          supplierBusinessAddress: reqData.supplierBusinessAddress || reqData.pickupAddress || reqData.restaurantAddress || 'Store Location',
          restaurantName: reqData.restaurantName || reqData.storeName || (parsedCategory.toLowerCase() === 'food' ? 'Restaurant' : `${parsedCategory} Store`),
          restaurantPhone: reqData.restaurantPhone || '',
          restaurantPhoto: reqData.restaurantPhoto || (reqData.restaurantPhotos && reqData.restaurantPhotos[0]) || '',
          pickupLatitude: Number(reqData.supplierBusinessLatitude || reqData.pickupLocation?.latitude || reqData.pickupLatitude || 0),
          pickupLongitude: Number(reqData.supplierBusinessLongitude || reqData.pickupLocation?.longitude || reqData.pickupLongitude || 0),
          supplierBusinessLatitude: Number(reqData.supplierBusinessLatitude || reqData.pickupLocation?.latitude || reqData.pickupLatitude || 0),
          supplierBusinessLongitude: Number(reqData.supplierBusinessLongitude || reqData.pickupLocation?.longitude || reqData.pickupLongitude || 0),
          destinationLatitude: Number(reqData.customerLatitude || reqData.dropLocation?.latitude || reqData.destinationLatitude || 0),
          destinationLongitude: Number(reqData.customerLongitude || reqData.dropLocation?.longitude || reqData.destinationLongitude || 0),
          customerLatitude: Number(reqData.customerLatitude || reqData.dropLocation?.latitude || reqData.destinationLatitude || 0),
          customerLongitude: Number(reqData.customerLongitude || reqData.dropLocation?.longitude || reqData.destinationLongitude || 0),
          distanceKm: reqData.distanceKm,
          pickupDistanceKm: reqData.pickupDistanceKm,
          dropDistanceKm: reqData.dropDistanceKm,
          etaMinutes: reqData.etaMinutes,
          estimatedEarning: reqData.estimatedEarning || reqData.totalAmount || 0,
          baseTripPay: reqData.baseTripPay,
          rainSurgeAmount: reqData.rainSurgeAmount,
          isRainSurge: reqData.isRainSurge,
          totalTripPay: reqData.totalTripPay,
          isRaining: reqData.isRaining,
          weatherIncentive: reqData.weatherIncentive,
          items: reqData.items || reqData.cartItems || [],
          cartItems: reqData.cartItems || reqData.items || {},
        };
        setIncomingRequest(parsedReq);
        playOrderAlertSound();
        console.log('✅ [DeliveryRiderHomeScreen] Recovered pending delivery request from DB:', parsedReq.bookingId);
      }
    } catch (_) {}
  }, [riderId, user?._id, user?.id, playOrderAlertSound]);

  useEffect(() => {
    if (incomingRequest) {
      if (incomingRequest.pickupLatitude > 0 && incomingRequest.pickupLongitude > 0) {
        console.log('[MAP MARKER]\ntype: SUPPLIER\nlat: ' + incomingRequest.pickupLatitude + '\nlng: ' + incomingRequest.pickupLongitude + '\nsource: incomingRequest.pickupLocation\norderId: ' + incomingRequest.bookingId);
      }
      if (incomingRequest.customerLatitude > 0 && incomingRequest.customerLongitude > 0) {
        console.log('[MAP MARKER]\ntype: CUSTOMER\nlat: ' + incomingRequest.customerLatitude + '\nlng: ' + incomingRequest.customerLongitude + '\nsource: incomingRequest.dropLocation\norderId: ' + incomingRequest.bookingId);
      }
      if (riderCoords?.latitude && riderCoords?.longitude) {
        console.log('[MAP MARKER]\ntype: RIDER\nlat: ' + riderCoords.latitude + '\nlng: ' + riderCoords.longitude + '\nsource: riderCoords.deviceGPS\norderId: ' + incomingRequest.bookingId);
      }
    }
  }, [incomingRequest, riderCoords]);

  useFocusEffect(useCallback(() => {
    restoreActiveRide();
    fetchEarnings();
    fetchDeliveries();
    if (!incomingRequest) {
      if (isOnlineRef.current) {
        checkPendingDeliveryRequest();
      }
      // Only silent background sync if cold or after 60 seconds — never reload fresh stores
      if (nearbyHotspotsRef.current.length === 0 || Date.now() - _lastHotspotsFetchTimestamp > 60000) {
        fetchNearbyHotspots(hasLoadedHotspotsOnceRef.current);
      }
    }
  }, [fetchEarnings, fetchDeliveries, checkPendingDeliveryRequest, fetchNearbyHotspots, incomingRequest]));

  useEffect(() => {
    if (incomingRequest && incomingMapWebViewRef.current && riderCoords?.latitude && riderCoords?.longitude) {
      incomingMapWebViewRef.current.injectJavaScript(`
        if (window.updateRiderMarker) {
          window.updateRiderMarker(${riderCoords.latitude}, ${riderCoords.longitude});
        }
        true;
      `);
    }
  }, [incomingRequest, riderCoords?.latitude, riderCoords?.longitude]);

  // AppState resume sync: silently refresh eligible online stores in background on foreground return
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        fetchDeliveries();
        if (isOnlineRef.current) {
          checkPendingDeliveryRequest();
        }
        if (activeDeliveriesRef.current.length === 0 && !incomingRequestRef.current && fetchNearbyHotspotsRef.current) {
          if (nearbyHotspotsRef.current.length === 0 || Date.now() - _lastHotspotsFetchTimestamp > 60000) {
            fetchNearbyHotspotsRef.current(true);
          }
        }
      }
    });
    return () => sub.remove();
  }, [fetchDeliveries, checkPendingDeliveryRequest]);

  // Recalculate ORS routes gently when rider GPS shifts without reloading or clearing store list
  useEffect(() => {
    if (
      activeDeliveries.length === 0 &&
      !incomingRequest &&
      riderCoords?.latitude &&
      riderCoords?.longitude &&
      nearbyHotspotsRef.current.length > 0 &&
      syncDiscoveryRoutesRef.current
    ) {
      syncDiscoveryRoutesRef.current(
        nearbyHotspotsRef.current,
        selectedHotspotRef.current || nearbyHotspotsRef.current[0],
        riderCoords,
        false
      );
    }
  }, [riderCoords?.latitude, riderCoords?.longitude, activeDeliveries.length, incomingRequest]);

  useEffect(() => {
    if (activeDeliveries.length > 0 || incomingRequest) {
      // During active delivery or incoming request: NEVER erase persistent store list!
      // Simply hide discovery layers on map, keeping store list intact in memory.
      if (mapWebViewRef.current) {
        mapWebViewRef.current.injectJavaScript(`
          if (window.hideDiscoveryLayers) { window.hideDiscoveryLayers(); }
          true;
        `);
      }
      return;
    }

    // Restore discovery layers when returning to idle
    if (mapWebViewRef.current) {
      mapWebViewRef.current.injectJavaScript(`
        if (window.showDiscoveryLayers) { window.showDiscoveryLayers(); }
        true;
      `);
    }

    // Fetch once initially ONLY if not already in memory/disk cache
    if (nearbyHotspotsRef.current.length === 0) {
      fetchNearbyHotspots(false);
    }

    const requestInterval = setInterval(() => {
      if (isOnlineRef.current) {
        checkPendingDeliveryRequest();
      }
    }, 3000);

    // Low-frequency silent background reconciliation (primary updates come instantly via Socket.IO)
    const bgStoreSyncInterval = setInterval(() => {
      fetchNearbyHotspots(true);
    }, 60000);

    return () => {
      clearInterval(requestInterval);
      clearInterval(bgStoreSyncInterval);
    };
  }, [activeDeliveries.length, incomingRequest, checkPendingDeliveryRequest, fetchNearbyHotspots]);

  // ── Socket Events & Auto Registration ──
  useEffect(() => {
    if (!socket) return;
    const targetId = riderId || user?._id || user?.id;
    if (targetId) {
      const idStr = targetId.toString();
      socket.emit('register_user', idStr);
      if (isOnline) {
        socket.emit('toggle_online_status', { userId: idStr, isOnline: true, isAvailable: true, role: 'delivery_partner' });
        socket.emit('rider_online', { 
          riderId: idStr, 
          name: displayName, 
          vehicleType: vehicleType,
          location: riderCoords ? {
            latitude: riderCoords.latitude,
            longitude: riderCoords.longitude,
            address: currentAddress
          } : null
        });
      }
    }

    const onRequest = async (data: any) => {
      if (!data) return;
      if (!isOnlineRef.current) {
        console.log('🛑 [DELIVERY RIDER HOME] Discarding delivery request because rider is OFFLINE.');
        return;
      }
      if (activeDeliveries.length > 0) {
        console.log('🛑 [DELIVERY RIDER HOME] Discarding delivery request because rider is already on an active delivery.');
        return;
      }
      const reqData = data.booking || data;
      const orderStatus = (reqData.status || '').toUpperCase();
      const isFood = Boolean(reqData.restaurantId || reqData.restaurantName || (reqData.cartItems && Object.keys(reqData.cartItems).length > 0) || reqData.categoryName === 'Food' || reqData.categoryName === 'Food Delivery');

      // Do NOT show request to Rider if Restaurant has not accepted yet
      if (isFood && (orderStatus === 'PENDING_RESTAURANT' || orderStatus === 'PENDING' || orderStatus === 'RINGING' || orderStatus === 'CONNECTING')) {
        console.log('🛑 [DELIVERY RIDER HOME] Ignoring food order pending restaurant acceptance:', reqData.bookingId || reqData._id);
        return;
      }

      const reqId = (reqData.bookingId || reqData.rideId || reqData._id || '').toString();
      if (!reqId) return;

      if (activeRequestIdRef.current === reqId || (incomingRequest && (incomingRequest.bookingId === reqId || incomingRequest._id === reqId))) {
        console.log('🛑 [DELIVERY RIDER HOME] Dropping duplicate incoming request event for ride:', reqId);
        return;
      }
      if (seenRequestIdsRef.current.has(reqId)) {
        console.log('🛑 [DELIVERY RIDER HOME] Request already seen, dropping duplicate event:', reqId);
        return;
      }
      seenRequestIdsRef.current.add(reqId);
      activeRequestIdRef.current = reqId;

      console.log('📢 [DELIVERY RIDER HOME] Valid single delivery request received via socket:', reqId);
      try { Vibration.vibrate([0, 400, 200, 400]); } catch (_) {}
      playOrderAlertSound();
      
      const catName = getCategoryLabel(reqData);

      const parsedReq = {
        bookingId: reqData.bookingId || reqData.rideId || reqData._id,
        _id: reqData._id || reqData.bookingId,
        categoryName: catName,
        businessCategoryName: catName,
        categoryId: reqData.categoryId || null,
        isOrderingForSomeoneElse: Boolean(reqData.isOrderingForSomeoneElse || reqData.orderType === 'SOMEONE_ELSE'),
        recipientName: reqData.recipientName || '',
        recipientPhone: reqData.recipientPhone || '',
        customerName: (reqData.isOrderingForSomeoneElse || reqData.orderType === 'SOMEONE_ELSE') && reqData.recipientName
          ? `${reqData.recipientName} (Friend)`
          : (reqData.customerName || reqData.userName || 'Customer'),
        customerPhone: (reqData.isOrderingForSomeoneElse || reqData.orderType === 'SOMEONE_ELSE') && reqData.recipientPhone
          ? reqData.recipientPhone
          : (reqData.customerPhone || reqData.phone || ''),
        customerAddress: reqData.customerAddress || reqData.destinationAddress || reqData.deliveryAddress || reqData.serviceAddress || 'Delivery Location',
        destinationAddress: reqData.customerAddress || reqData.destinationAddress || reqData.deliveryAddress || reqData.serviceAddress || 'Delivery Location',
        deliveryAddress: reqData.customerAddress || reqData.destinationAddress || reqData.deliveryAddress || reqData.serviceAddress || 'Delivery Location',
        totalAmount: Number(reqData.totalAmount || reqData.price || reqData.fare || 0),
        pickupAddress: reqData.supplierBusinessAddress || reqData.pickupAddress || reqData.restaurantAddress || 'Store Location',
        supplierBusinessAddress: reqData.supplierBusinessAddress || reqData.pickupAddress || reqData.restaurantAddress || 'Store Location',
        restaurantName: reqData.restaurantName || reqData.storeName || (catName.toLowerCase() === 'food' ? 'Restaurant Partner' : `${catName} Store`),
        restaurantPhone: reqData.restaurantPhone || '',
        restaurantPhoto: reqData.restaurantPhoto || (reqData.restaurantPhotos && reqData.restaurantPhotos[0]) || '',
        restaurantPhotos: reqData.restaurantPhotos || [],
        pickupLatitude: Number(reqData.supplierBusinessLatitude || reqData.pickupLocation?.latitude || reqData.pickupLatitude || 0),
        pickupLongitude: Number(reqData.supplierBusinessLongitude || reqData.pickupLocation?.longitude || reqData.pickupLongitude || 0),
        supplierBusinessLatitude: Number(reqData.supplierBusinessLatitude || reqData.pickupLocation?.latitude || reqData.pickupLatitude || 0),
        supplierBusinessLongitude: Number(reqData.supplierBusinessLongitude || reqData.pickupLocation?.longitude || reqData.pickupLongitude || 0),
        destinationLatitude: Number(reqData.customerLatitude || reqData.dropLocation?.latitude || reqData.destinationLatitude || 0),
        destinationLongitude: Number(reqData.customerLongitude || reqData.dropLocation?.longitude || reqData.destinationLongitude || 0),
        customerLatitude: Number(reqData.customerLatitude || reqData.dropLocation?.latitude || reqData.destinationLatitude || 0),
        customerLongitude: Number(reqData.customerLongitude || reqData.dropLocation?.longitude || reqData.destinationLongitude || 0),
        distanceKm: reqData.distanceKm,
        pickupDistanceKm: reqData.pickupDistanceKm,
        dropDistanceKm: reqData.dropDistanceKm,
        etaMinutes: reqData.etaMinutes,
        estimatedEarning: reqData.estimatedEarning || reqData.totalTripPay || reqData.deliveryFee || 20,
        baseTripPay: reqData.baseTripPay,
        rainSurgeAmount: reqData.rainSurgeAmount,
        isRainSurge: reqData.isRainSurge,
        totalTripPay: reqData.totalTripPay,
        isRaining: reqData.isRaining,
        weatherIncentive: reqData.weatherIncentive,
        items: reqData.items || reqData.cartItems || [],
      };
      setIncomingRequest(parsedReq);
    };

    const onCancelled = (data: any) => {
      console.log('📢 [DELIVERY RIDER HOME] Request cancelled event:', data);
      const cId = String(data?.bookingId || data?.orderId || data?.rideId || '');
      const myRiderId = String(riderId || user?._id || user?.id || '');
      const assignedRiderId = data?.assignedRiderId ? String(data.assignedRiderId) : '';

      // CRITICAL GUARD: If this cancellation broadcast was emitted because THIS rider accepted the order,
      // DO NOT cancel the order or show any error!
      if (
        (acceptedBookingIdRef.current && cId && acceptedBookingIdRef.current === cId) ||
        (assignedRiderId && assignedRiderId === myRiderId)
      ) {
        console.log('✅ [DELIVERY RIDER HOME] Request was accepted by THIS rider. Ignoring cancellation broadcast.');
        setIncomingRequest(null);
        return;
      }

      if (data?.reason === 'timeout' && !data?.status?.includes('CANCEL') && !data?.cancelledBy) {
        console.log('⏳ Ignoring pure timeout cancellation so request continues ringing for rider.');
        return;
      }

      // Stop ringing sound immediately in 0ms!
      stopOrderAlertSound();
      setIncomingRequest((prev: any) => {
        if (!prev) return null;
        const prevId = String(prev.bookingId || prev._id || prev.rideId || '');
        if (!cId || !prevId || prevId === cId) {
          if (data?.reason === 'assigned_to_another' || data?.assignedRiderName) {
            const conflictMsg = data?.assignedRiderName
              ? `This ride has already been accepted by ${data.assignedRiderName}.`
              : 'This ride has already been accepted by another partner.';
            Alert.alert('Ride Already Assigned', conflictMsg);
          }
          return null;
        }
        return prev;
      });
      activeRequestIdRef.current = null;
    };

    const onOrderReady = (data: any) => {
      const readyCat = resolveCategoryName(data);
      console.log(`📦 [DELIVERY RIDER HOME] ${readyCat} order ready for pickup:`, data);
      try { Vibration.vibrate([0, 300, 150, 300]); } catch (_) {}
      Alert.alert(
        `${getCategoryIcon(readyCat)} Order Ready! (${readyCat} Ready)`,
        `Order is ready for pickup at ${data?.restaurantName || 'the store'}. Please proceed to pick up!`
      );
      fetchDeliveries();
    };

    const onEarnings = (data: any) => {
      fetchEarnings();
    };

    const handleOrderCancellation = (data: any) => {
      console.log('📢 [DELIVERY RIDER HOME] Order cancelled event:', data);
      stopOrderAlertSound();
      const cId = String(data?.bookingId || data?.rideId || data?._id || '');
      setIncomingRequest((prev: any) => {
        if (!prev) return null;
        const prevId = String(prev.bookingId || prev._id || prev.rideId || '');
        if (!cId || !prevId || prevId === cId) {
          return null;
        }
        return prev;
      });
      activeRequestIdRef.current = null;

      if (cId) {
        setActiveDeliveries((prev) => prev.filter((d) => String(d.bookingId || d._id || d.rideId) !== cId));
        activeDeliveriesRef.current = activeDeliveriesRef.current.filter((d) => String(d.bookingId || d._id || d.rideId) !== cId);
        AsyncStorage.getItem('active_rider_ride').then((stored) => {
          if (stored) {
            try {
              const p = JSON.parse(stored);
              if (String(p.bookingId || p._id || p.rideId) === cId) {
                AsyncStorage.removeItem('active_rider_ride').catch(() => {});
                try { rideStore.clearRide(); } catch (_) {}
              }
            } catch (_) {}
          }
        }).catch(() => {});
      }
      fetchDeliveries();
      fetchEarnings();

      if (cId && !isCancellationEventProcessed(cId, data?.cancelledAt || data?.status || data?.reason || 'CANCELLED')) {
        const rawActor = String(data?.cancelledBy || '').toUpperCase();
        let actor: 'RESTAURANT' | 'CUSTOMER' | 'RIDER' = 'CUSTOMER';
        if (rawActor.includes('ADMIN') || rawActor === 'STORE' || rawActor === 'SUPPLIER' || rawActor === 'RESTAURANT' || rawActor === 'PROVIDER' || rawActor === 'PARTNER') {
          actor = 'RESTAURANT';
        } else if (rawActor === 'RIDER' || rawActor === 'DRIVER' || rawActor === 'DELIVERY_PARTNER') {
          actor = 'RIDER';
        } else {
          actor = 'CUSTOMER';
        }

        setCancellationPopup({
          visible: true,
          orderId: cId,
          reason: data?.cancellationReason || data?.reason || data?.message || (actor === 'CUSTOMER' ? 'Cancelled by customer' : 'Cancelled by store'),
          cancelledBy: actor,
        });
      }
    };

    const onOrderAssignedToOther = (data: any) => {
      const assignedId = String(data?.assignedRiderId || data?.riderId || data?.acceptedBy?.riderId || '');
      const bId = String(data?.bookingId || data?.rideId || data?._id || data?.orderId || '');
      const currentRiderId = String(riderId || user?._id || user?.id || '');

      console.log(`🛵 [DELIVERY RIDER HOME] Order assigned event for ${bId}: assigned to ${assignedId} (Current: ${currentRiderId})`);

      if (assignedId && assignedId !== currentRiderId) {
        stopOrderAlertSound();

        // Immediately clear ringing incoming request if it matches this order
        setIncomingRequest((prev: any) => {
          if (prev && (String(prev.bookingId) === bId || String(prev._id) === bId || String(prev.rideId) === bId)) {
            return null;
          }
          return prev;
        });

        if (activeRequestIdRef.current === bId) {
          activeRequestIdRef.current = null;
        }

        // Clean up from active deliveries so other riders never see another partner's order
        setActiveDeliveries((prev) => prev.filter((d) => String(d.bookingId || d._id || d.rideId) !== bId));
        setAllDeliveries((prev) => prev.filter((d) => String(d.bookingId || d._id || d.rideId) !== bId));

        // Re-sync authoritative backend state
        fetchDeliveries();
      } else if (assignedId && assignedId === currentRiderId) {
        // If assigned to current rider, refresh active deliveries
        fetchDeliveries();
      }
    };

    socket.on('DELIVERY_REQUEST', onRequest);
    socket.on('DELIVERY_REQUEST_CANCELLED', onCancelled);
    socket.on('ORDER_READY_FOR_PICKUP', onOrderReady);
    socket.on('FOOD_READY', onOrderReady);
    socket.on('food_ready', onOrderReady);
    socket.on('earnings_updated', onEarnings);
    socket.on('booking_status_updated', fetchDeliveries);
    socket.on('rider_assigned', onOrderAssignedToOther);
    socket.on('RIDER_ASSIGNED', onOrderAssignedToOther);
    socket.on('ORDER_ASSIGNED_TO_OTHER', onOrderAssignedToOther);
    socket.on('REMOVE_AVAILABLE_ORDER', onOrderAssignedToOther);
    socket.on('booking_cancelled_by_customer', handleOrderCancellation);
    socket.on('ride_cancelled_by_customer', handleOrderCancellation);
    socket.on('booking_cancelled_by_restaurant', handleOrderCancellation);
    socket.on('booking_cancelled', handleOrderCancellation);
    socket.on('service_cancelled', handleOrderCancellation);
    socket.on('ride_cancelled', handleOrderCancellation);
    socket.on('order_cancelled', handleOrderCancellation);
    socket.on('RESTAURANT_DECLINED', handleOrderCancellation);
    socket.on('ORDER_CANCELLED', handleOrderCancellation);
    socket.on('FOOD_CANCELLED', handleOrderCancellation);
    socket.on('ORDER_TRANSFERRED', handleOrderCancellation);

    const scheduleHotspotSync = (payload?: any) => {
      // 0ms Real-Time Store Status Sync: If payload carries store data, update immediately without reload!
      if (payload && typeof payload === 'object') {
        const sId = String(payload.id || payload.restaurantId || payload.supplierId || payload._id || '').trim();
        const sLat = Number(payload.latitude || payload.businessLatitude || 0);
        const sLon = Number(payload.longitude || payload.businessLongitude || 0);
        const isOnlineVal = payload.isOnline !== undefined
          ? Boolean(payload.isOnline)
          : (payload.restaurant_status ? payload.restaurant_status === 'online' : undefined);

        if (sId) {
          if (isOnlineVal === false || payload.eligible === false) {
            // Remove offline store immediately in 0ms!
            setNearbyHotspots((prev) => {
              const updated = prev.filter((s) => String(s.id || s.restaurantId) !== sId);
              nearbyHotspotsRef.current = updated;
              _inMemoryNearbyHotspots = updated;
              if (mapWebViewRef.current) {
                const curSel = selectedHotspotRef.current || updated[0] || null;
                const selId = curSel ? String(curSel.id || curSel.restaurantId || '') : null;
                mapWebViewRef.current.injectJavaScript(
                  "if (window.updateHotspotMarkers) { window.updateHotspotMarkers(" + JSON.stringify(updated) + ", " + JSON.stringify(selId) + "); } true;"
                );
              }
              return updated;
            });
          } else if (isOnlineVal === true && isValidCoordinates(sLat, sLon) && !isDummyCoordinates(sLat, sLon)) {
            // Add newly online store immediately in 0ms!
            setNearbyHotspots((prev) => {
              const exists = prev.some((s) => String(s.id || s.restaurantId) === sId);
              const item = {
                id: sId,
                restaurantId: sId,
                name: payload.name || payload.restaurantName || 'Store Partner',
                category: payload.category || payload.categoryName || 'General',
                categoryName: payload.categoryName || payload.category || 'General',
                latitude: sLat,
                longitude: sLon,
                address: payload.address || 'Store Location',
                distanceKm: payload.distanceKm || 1.2,
                hasPendingOrder: Boolean(payload.hasPendingOrder || payload.hasGuaranteedOrder),
              };
              const updated = exists
                ? prev.map((s) => (String(s.id || s.restaurantId) === sId ? { ...s, ...item } : s))
                : [item, ...prev];
              nearbyHotspotsRef.current = updated;
              _inMemoryNearbyHotspots = updated;
              if (mapWebViewRef.current) {
                const curSel = selectedHotspotRef.current || updated[0] || null;
                const selId = curSel ? String(curSel.id || curSel.restaurantId || '') : null;
                mapWebViewRef.current.injectJavaScript(
                  "if (window.updateHotspotMarkers) { window.updateHotspotMarkers(" + JSON.stringify(updated) + ", " + JSON.stringify(selId) + "); } true;"
                );
              }
              return updated;
            });
          }
        }
      }

      if (hotspotRefreshTimerRef.current) {
        clearTimeout(hotspotRefreshTimerRef.current);
      }
      hotspotRefreshTimerRef.current = setTimeout(() => {
        if (activeDeliveriesRef.current.length === 0 && !incomingRequestRef.current && fetchNearbyHotspotsRef.current) {
          fetchNearbyHotspotsRef.current(true);
        }
      }, 50);
    };

    const onSocketReconnect = () => {
      if (targetId) {
        socket.emit('register_user', targetId.toString());
      }
      scheduleHotspotSync();
    };

    const storeVisibilityEvents = [
      'SUPPLIER_ONLINE',
      'supplier_online',
      'STORE_ONLINE',
      'NEW_STORE_AVAILABILITY',
      'SUPPLIER_OFFLINE',
      'supplier_offline',
      'STORE_OFFLINE',
      'STORE_WENT_OFFLINE',
      'STORE_VISIBILITY_UPDATED',
      'store_visibility_updated',
      'STORE_LOCATION_UPDATED',
      'supplier_permanent_location_updated',
      'CUSTOMER_STORE_LIST_UPDATED',
      'RESTAURANT_UPDATED',
      'restaurant_online',
      'restaurant_offline',
      'restaurant_status_updated',
      'restaurant_status_changed',
      'supplier_online_status_changed',
      'supplier_status_changed',
      'RESTAURANT_LOCATION_UPDATED',
      'restaurant_location_updated',
      'SUPPLIER_APPROVED',
      'supplier_approved',
      'HOTSPOTS_UPDATED',
      'hotspots_updated',
    ];

    socket.on('connect', onSocketReconnect);
    storeVisibilityEvents.forEach((evtName) => socket.on(evtName, scheduleHotspotSync));

    return () => {
      if (hotspotRefreshTimerRef.current) {
        clearTimeout(hotspotRefreshTimerRef.current);
      }
      socket.off('connect', onSocketReconnect);
      storeVisibilityEvents.forEach((evtName) => socket.off(evtName, scheduleHotspotSync));
      socket.off('DELIVERY_REQUEST', onRequest);
      socket.off('DELIVERY_REQUEST_CANCELLED', onCancelled);
      socket.off('ORDER_READY_FOR_PICKUP', onOrderReady);
      socket.off('FOOD_READY', onOrderReady);
      socket.off('food_ready', onOrderReady);
      socket.off('earnings_updated', onEarnings);
      socket.off('booking_status_updated', fetchDeliveries);
      socket.off('rider_assigned', onOrderAssignedToOther);
      socket.off('RIDER_ASSIGNED', onOrderAssignedToOther);
      socket.off('ORDER_ASSIGNED_TO_OTHER', onOrderAssignedToOther);
      socket.off('REMOVE_AVAILABLE_ORDER', onOrderAssignedToOther);
      socket.off('booking_cancelled_by_customer', handleOrderCancellation);
      socket.off('ride_cancelled_by_customer', handleOrderCancellation);
      socket.off('booking_cancelled_by_restaurant', handleOrderCancellation);
      socket.off('booking_cancelled', handleOrderCancellation);
      socket.off('service_cancelled', handleOrderCancellation);
      socket.off('ride_cancelled', handleOrderCancellation);
      socket.off('order_cancelled', handleOrderCancellation);
      socket.off('RESTAURANT_DECLINED', handleOrderCancellation);
      socket.off('ORDER_CANCELLED', handleOrderCancellation);
      socket.off('FOOD_CANCELLED', handleOrderCancellation);
      socket.off('ORDER_TRANSFERRED', handleOrderCancellation);
    };
  }, [socket, isOnline, riderId, user, displayName, vehicleType, fetchEarnings, fetchDeliveries, fetchNearbyHotspots]);

  // ── ULTRA-FAST 1-CLICK TOGGLE ONLINE / OFFLINE (0ms Instant Switch) ──
  const toggleOnlineStatus = () => {
    const nextState = !isOnlineRef.current;
    executeOfflineToggle(nextState, riderId || user?._id || user?.id);
  };

  function executeOfflineToggle(nextState: boolean, initialId: any) {
    // 1. Instant 0ms synchronous UI update & tactile feedback
    isOnlineRef.current = nextState;
    setIsOnline(nextState);
    if (!nextState) setIsPendingOffline(false);
    try { Vibration.vibrate(40); } catch (_) {}
    switchAnim.setValue(nextState ? 1 : 0);
    try { rideStore?.setRiderOnline?.(nextState); } catch (_) {}

    // 2. Immediate AsyncStorage persistence (non-blocking)
    AsyncStorage.setItem('delivery_is_online', JSON.stringify(nextState)).catch(() => {});
    if (initialId) {
      AsyncStorage.setItem(`rider_status_${initialId.toString()}`, JSON.stringify(nextState)).catch(() => {});
    }
    AsyncStorage.getItem('deliveryUser').then((str) => {
      if (str) {
        try {
          const parsed = JSON.parse(str);
          parsed.isOnline = nextState;
          AsyncStorage.setItem('deliveryUser', JSON.stringify(parsed)).catch(() => {});
        } catch (_) {}
      }
    }).catch(() => {});

    // 3. Fire-and-forget Background Socket, Backend API & GPS sync
    (async () => {
      try {
        let targetId = initialId;
        if (!targetId) {
          const stored = await AsyncStorage.getItem('deliveryUser');
          if (stored) {
            const parsed = JSON.parse(stored);
            targetId = parsed?._id || parsed?.id;
            if (targetId) {
              AsyncStorage.setItem(`rider_status_${targetId.toString()}`, JSON.stringify(nextState)).catch(() => {});
            }
          }
        }

        if (socket && socket.connected && targetId) {
          socket.emit('toggle_online_status', {
            userId: targetId,
            isOnline: nextState,
            isAvailable: nextState,
            role: 'delivery_partner',
          });

          if (nextState) {
            socket.emit('rider_online', {
              riderId: targetId,
              name: displayName,
              vehicleType: vehicleType,
              location: riderCoords
                ? {
                    latitude: riderCoords.latitude,
                    longitude: riderCoords.longitude,
                    address: currentAddress,
                  }
                : null,
            });
          } else {
            socket.emit('rider_offline', { riderId: targetId });
          }
        }

        api.put('/profile/status', {
          userId: targetId,
          status: nextState ? 'online' : 'offline',
          isOnline: nextState,
          isAvailable: nextState,
          role: 'delivery_partner',
        }).catch((err) => {
          console.log('[Status Update Background Error]', err?.message || err);
        });

        // Silently refresh real hardware GPS and sync via Socket + REST without blocking UI
        if (nextState) {
          let curLat = riderCoords?.latitude;
          let curLon = riderCoords?.longitude;
          if (!isValidCoordinates(curLat, curLon)) {
            const fresh = await fetchCurrentGpsPosition(false).catch(() => null);
            if (fresh && isValidCoordinates(fresh.latitude, fresh.longitude)) {
              curLat = fresh.latitude;
              curLon = fresh.longitude;
              setRiderCoords({ latitude: fresh.latitude, longitude: fresh.longitude });
            }
          }
          if (isValidCoordinates(curLat, curLon) && targetId) {
            if (socket && socket.connected) {
              socket.emit('rider_location_update', {
                riderId: targetId,
                userId: targetId,
                latitude: curLat,
                longitude: curLon,
                timestamp: Date.now(),
              });
            }
            api.put('/profile/status', {
              userId: targetId,
              status: 'online',
              isOnline: true,
              isAvailable: true,
              role: 'delivery_partner',
              latitude: curLat,
              longitude: curLon,
            }).catch(() => {});
          }
        }
      } catch (e) {
        console.log('executeOfflineToggle bg error:', e);
      }
    })();
  }

  const handleAcceptRequest = async () => {
    if (!incomingRequest || isAcceptingRequest) return;
    setIsAcceptingRequest(true);
    stopOrderAlertSound();

    const bId = incomingRequest.bookingId || incomingRequest._id;
    acceptedBookingIdRef.current = String(bId);
    const targetId = riderId || user?._id || user?.id;
    const currentReq = { ...incomingRequest };

    // ⚡ ZERO-LATENCY INSTANT ACCEPT:
    // Dismiss incoming popup instantly in 0ms!
    setIncomingRequest(null);
    activeRequestIdRef.current = null;
    setShowBannersModal(false);

    const curLat = riderCoords?.latitude || null;
    const curLon = riderCoords?.longitude || null;
    const assignedRiderDisplayName =
      user?.name ||
      user?.username ||
      'Delivery Partner';

    const isTransferReq = Boolean(currentReq.isTransfer || currentReq.isTransferRequest);

    const fullRide = {
      ...currentReq,
      bookingId: bId,
      rideId: bId,
      _id: currentReq._id || bId,
      isRider: true,
      isTransferHandover: isTransferReq,
      role: 'provider',
      providerId: targetId,
      riderId: targetId,
      riderName: assignedRiderDisplayName,
      driverLat: curLat || currentReq.driverLat || undefined,
      driverLon: curLon || currentReq.driverLon || undefined,
      status: isTransferReq ? 'TRANSFER_ACCEPTED_PENDING_HANDOVER' : (currentReq.status || 'PROVIDER_ACCEPTED'),
    };

    // Immediately show the ride and persist it without requiring any reload or refresh!
    setActiveDeliveries([fullRide]);
    activeDeliveriesRef.current = [fullRide];
    try { rideStore.setCurrentRide(fullRide); } catch (_) {}
    AsyncStorage.setItem('active_rider_ride', JSON.stringify(fullRide)).catch(() => {});
    setActiveTab('feed');
    setIsAcceptingRequest(false);

    // Instant socket emit for real-time notification
    if (socket && socket.connected) {
      socket.emit('rider_accept_request', {
        bookingId: bId,
        riderId: targetId,
        latitude: curLat,
        longitude: curLon,
      });

      if (curLat && curLon) {
        socket.emit('rider_location_update', {
          bookingId: bId,
          rideId: bId,
          riderId: targetId,
          latitude: curLat,
          longitude: curLon,
          accuracy: 5,
          timestamp: Date.now(),
        });
      }
    }

    // Refresh hardware GPS in background without blocking accept
    fetchCurrentGpsPosition(false).then((freshGps) => {
      if (freshGps?.latitude && freshGps?.longitude && socket && socket.connected) {
        socket.emit('rider_location_update', {
          bookingId: bId,
          rideId: bId,
          riderId: targetId,
          latitude: freshGps.latitude,
          longitude: freshGps.longitude,
          accuracy: freshGps.accuracy || 5,
          timestamp: Date.now(),
        });
      }
    }).catch(() => {});

    // Asynchronous backend accept call
    (async () => {
      try {
        let acceptedBooking = currentReq;
        let acceptedResponseData: any = null;
        if (isTransferReq) {
          const trRes = await api.post('/bookings/transfer/accept', {
            bookingId: bId,
            riderId: targetId,
            latitude: curLat,
            longitude: curLon,
          });
          acceptedResponseData = trRes.data;
          if (trRes.data?.success && trRes.data?.booking) {
            acceptedBooking = trRes.data.booking;
          }
        } else {
          const res = await api.put(`/bookings/${bId}/rider-accept`, {
            riderId: targetId,
            latitude: curLat,
            longitude: curLon,
          });
          acceptedResponseData = res.data;
          if (res.data?.success && res.data?.booking) {
            acceptedBooking = res.data.booking;
          }
        }

        const finalDisplayName =
          acceptedResponseData?.riderName ||
          acceptedBooking?.riderName ||
          assignedRiderDisplayName;

        const updatedRide = {
          ...fullRide,
          ...acceptedBooking,
          riderName: finalDisplayName,
        };

        setActiveDeliveries([updatedRide]);
        activeDeliveriesRef.current = [updatedRide];
        try { rideStore.setCurrentRide(updatedRide); } catch (_) {}
        AsyncStorage.setItem('active_rider_ride', JSON.stringify(updatedRide)).catch(() => {});
      } catch (err: any) {
        console.error('[handleAcceptRequest bg error]', err);
        const isAlreadyTaken = Boolean(
          err.response?.status === 409 ||
          err.response?.data?.conflict ||
          err.response?.data?.alreadyTaken ||
          err.response?.data?.error === 'ALREADY_TAKEN' ||
          err.response?.data?.error === 'ALREADY_ASSIGNED'
        );
        if (isAlreadyTaken) {
          const assignedPartnerName = err.response?.data?.assignedRiderName || 'another partner';
          Alert.alert('Order Already Assigned', `This ride has already been accepted by ${assignedPartnerName}.`);
          setActiveDeliveries((prev) => prev.filter((d) => String(d.bookingId || d._id) !== String(bId)));
          activeDeliveriesRef.current = activeDeliveriesRef.current.filter((d) => String(d.bookingId || d._id) !== String(bId));
          AsyncStorage.removeItem('active_rider_ride').catch(() => {});
          try { rideStore.clearRide(); } catch (_) {}
          fetchDeliveries();
        }
      }
    })();
  };

  const handleRejectRequest = async () => {
    if (!incomingRequest) return;
    stopOrderAlertSound();
    const bId = incomingRequest.bookingId || incomingRequest._id;
    const targetId = riderId || user?._id || user?.id;
    try {
      if (socket && socket.connected) {
        socket.emit('rider_reject_request', { bookingId: bId, riderId: targetId });
      }
      await api.put(`/bookings/${bId}/rider-reject`, { riderId: targetId }).catch(() => {});
    } catch (_) {}
    setIncomingRequest(null);
    activeRequestIdRef.current = null;
  };
  handleRejectRequestRef.current = handleRejectRequest;

  // ── Memoized Static Map HTML to Prevent Constant Map Reloading ──
  const feedMapHtml = useMemo(() => {
    const isDark = isDarkMode;
    const initLat = Number(riderCoords?.latitude || 0);
    const initLon = Number(riderCoords?.longitude || 0);
    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    body, html, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: ${isDark ? '#18181B' : '#F8FAFC'}; overflow: hidden; }
    .leaflet-control-attribution, .leaflet-control-zoom { display: none !important; }
    ${isDark ? `
    .leaflet-tile {
      filter: invert(100%) hue-rotate(180deg) brightness(85%) contrast(90%);
      -webkit-filter: invert(100%) hue-rotate(180deg) brightness(85%) contrast(90%);
    }
    .leaflet-container {
      background: #18181B !important;
    }
    ` : ''}
    .marker-wrapper {
      position: relative;
      width: 70px;
      height: 70px;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .bike-signal-ring {
      position: absolute;
      width: 28px;
      height: 28px;
      background: rgba(0, 102, 255, 0.35);
      border: 1.5px solid rgba(0, 102, 255, 0.5);
      border-radius: 50%;
      animation: signalPulse50 2.4s infinite ease-out;
    }
    .bike-shadow-pulse {
      position: absolute;
      bottom: 8px;
      width: 32px;
      height: 8px;
      background: rgba(0, 0, 0, 0.35);
      border-radius: 50%;
      filter: blur(2px);
      animation: shadowBreathing50 2.4s infinite ease-in-out;
    }
    .bike-rotator {
      position: relative;
      width: 48px;
      height: 48px;
      display: flex;
      justify-content: center;
      align-items: center;
      transition: transform 0.35s ease-out;
    }
    .bike-idler-container {
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      animation: bikeFloating50 2.4s infinite ease-in-out;
    }
    .bike-engine-vibe {
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      animation: engineVibe50 0.25s infinite linear;
    }
    .bike-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      filter: drop-shadow(0px 4px 6px rgba(0,0,0,0.45));
    }
    @keyframes signalPulse50 {
      0% { transform: scale(0.8); opacity: 0.5; }
      50% { opacity: 0.25; }
      100% { transform: scale(2.6); opacity: 0; }
    }
    @keyframes shadowBreathing50 {
      0%, 100% { transform: scale(1); opacity: 0.5; }
      50% { transform: scale(0.82); opacity: 0.25; }
    }
    @keyframes bikeFloating50 {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-3px); }
    }
    @keyframes engineVibe50 {
      0%, 100% { transform: translateY(0px) rotate(0deg); }
      25% { transform: translateY(-0.6px) rotate(-0.5deg); }
      50% { transform: translateY(0.5px) rotate(0.5deg); }
      75% { transform: translateY(-0.3px) rotate(-0.3deg); }
    }
    @keyframes geoPulse {
      0% { transform: scale(0.45); opacity: 1; }
      100% { transform: scale(1.65); opacity: 0; }
    }
  
    .store-pin-container {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .store-pin-outer {
      width: 32px;
      height: 32px;
      background: #FFFFFF;
      border-radius: 50%;
      border: 3px solid #0F172A;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s ease;
    }
    .store-pin-selected .store-pin-outer {
      width: 38px;
      height: 38px;
      border: 3.5px solid #0066FF;
      box-shadow: 0 0 16px rgba(0, 102, 255, 0.85);
      transform: scale(1.1);
    }
    .store-pin-inner {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #0F172A;
    }
    .store-pin-selected .store-pin-inner {
      background: #0066FF;
      width: 14px;
      height: 14px;
    }
    .store-pin-needle {
      width: 3px;
      height: 10px;
      background: #0F172A;
      margin-top: -1px;
      border-radius: 1px;
    }
    .store-pin-selected .store-pin-needle {
      background: #0066FF;
      width: 4px;
      height: 12px;
    }
    .store-guaranteed-badge {
      position: absolute;
      top: -20px;
      background: #EF4444;
      color: #FFFFFF;
      font-size: 9px;
      font-weight: 800;
      font-family: system-ui, -apple-system, sans-serif;
      padding: 2px 7px;
      border-radius: 10px;
      border: 1px solid #FFFFFF;
      box-shadow: 0 2px 6px rgba(239, 68, 68, 0.5);
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 3px;
    }
    .route-info-floating-pill {
      background: #FFFFFF;
      color: #0F172A;
      font-size: 11px;
      font-weight: 800;
      font-family: system-ui, -apple-system, sans-serif;
      padding: 4px 10px;
      border-radius: 14px;
      box-shadow: 0 3px 10px rgba(0, 0, 0, 0.35);
      border: 1px solid #E2E8F0;
      white-space: nowrap;
      text-align: center;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* ── GEOLOCATION BLUE DOT & RADAR HEADING CONE (Matching Screenshot) ── */
    .driver-geo-marker-icon {
      background: transparent !important;
      border: none !important;
    }
    .geo-location-marker {
      position: relative;
      width: 60px;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .geo-heading-cone {
      position: absolute;
      top: 0;
      left: 0;
      width: 60px;
      height: 60px;
      background: radial-gradient(circle at 50% 50%, rgba(26, 115, 232, 0.4) 0%, rgba(26, 115, 232, 0.15) 55%, rgba(26, 115, 232, 0) 70%);
      clip-path: polygon(50% 50%, 15% 0%, 85% 0%);
      pointer-events: none;
      transform-origin: 50% 50%;
      transition: transform 0.3s ease;
    }
    .geo-accuracy-pulse {
      position: absolute;
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: rgba(26, 115, 232, 0.22);
      border: 1.5px solid rgba(26, 115, 232, 0.5);
      animation: geoPulse 2s infinite cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .geo-dot-center {
      position: relative;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #1A73E8;
      border: 3px solid #FFFFFF;
      box-shadow: 0 2px 8px rgba(26, 115, 232, 0.7);
      z-index: 5;
    }

</style>
</head>
<body>
  <div id="map"></div>
  <script>
    var initialLat = ${initLat};
    var initialLon = ${initLon};
    var hasValidInitialGps = (initialLat !== 0 && initialLon !== 0 && !isNaN(initialLat) && !isNaN(initialLon));
    var isRiderOnline = false;
    window.isAutoFollowEnabled = true;
    var isProgrammaticMove = false;
    var mapEl = document.getElementById('map');
    if (mapEl && !hasValidInitialGps) {
      mapEl.style.visibility = 'hidden';
    }
    var map = L.map('map', {
      zoomControl: false,
      attributionControl: false,
      fadeAnimation: true,
      zoomAnimation: true,
      markerZoomAnimation: true
    });
    if (hasValidInitialGps) {
      isProgrammaticMove = true;
      map.setView([initialLat, initialLon], 16);
      setTimeout(function() { isProgrammaticMove = false; }, 120);
    }

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      updateWhenIdle: false,
      updateWhenZooming: true
    }).addTo(map);

    var geoIconHtml = '<div class="geo-location-marker">' +
      '<div class="geo-heading-cone" id="geo-cone"></div>' +
      '<div class="geo-accuracy-pulse"></div>' +
      '<div class="geo-dot-center"></div>' +
      '</div>';

    var geoCustomIcon = L.divIcon({
      className: 'driver-geo-marker-icon',
      html: geoIconHtml,
      iconSize: [60, 60],
      iconAnchor: [30, 30]
    });

    var customIcon = geoCustomIcon;

    var marker = hasValidInitialGps ? L.marker([initialLat, initialLon], { icon: customIcon }).addTo(map) : null;

    // Active Ride Navigation Layers (Route Polyline, Casing, Destination Pin, ETA Pill)
    var activeRideNavLine = null;
    var activeRideNavCasing = null;
    var activeRideDestMarker = null;
    var activeRideLabelMarker = null;

    function clearActiveRideNavigation() {
      if (activeRideNavLine) { map.removeLayer(activeRideNavLine); activeRideNavLine = null; }
      if (activeRideNavCasing) { map.removeLayer(activeRideNavCasing); activeRideNavCasing = null; }
      if (activeRideDestMarker) { map.removeLayer(activeRideDestMarker); activeRideDestMarker = null; }
      if (activeRideLabelMarker) { map.removeLayer(activeRideLabelMarker); activeRideLabelMarker = null; }
      window.hasFittedRideBounds = false;
      if (marker) {
        marker.setIcon(geoCustomIcon);
      }
    }

    window.clearActiveRideNavigation = clearActiveRideNavigation;

    window.updateActiveRideNavigation = function(navConfig) {
      if (!navConfig || !navConfig.active || !navConfig.destLat || !navConfig.destLon) {
        clearActiveRideNavigation();
        return;
      }
      var destLat = Number(navConfig.destLat);
      var destLon = Number(navConfig.destLon);
      if (isNaN(destLat) || isNaN(destLon) || (destLat === 0 && destLon === 0) || destLat < -90 || destLat > 90 || destLon < -180 || destLon > 180) {
        clearActiveRideNavigation();
        return;
      }

      var riderPos = marker ? marker.getLatLng() : null;
      if (!riderPos || !riderPos.lat || !riderPos.lng) {
        clearActiveRideNavigation();
        return;
      }

      if (marker) {
        marker.setIcon(geoCustomIcon);
      }

      // Strictly keep Store Discovery routes & markers cleared whenever an Active Delivery is running
      if (typeof discoveryRouteLayers !== 'undefined' && discoveryRouteLayers) {
        discoveryRouteLayers.clearLayers();
      }
      if (typeof hotspotMarkersGroup !== 'undefined' && hotspotMarkersGroup) {
        hotspotMarkersGroup.clearLayers();
      }
      if (typeof lastRenderedHotspotsKey !== 'undefined') {
        lastRenderedHotspotsKey = '';
      }

      var isPickedUp = Boolean(navConfig.isPickedUp);
      var pinColor = isPickedUp ? '#0066FF' : '#E11D48';
      var badgeTitle = isPickedUp ? '📍 Customer Drop' : '🏪 Store Pickup';

      var destPinSvg = !isPickedUp
        ? '<svg width="36" height="46" viewBox="0 0 38 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 3px 6px rgba(225, 29, 72, 0.45));">' +
          '  <path d="M19 1C9.05888 1 1 9.05888 1 19C1 31.8 19 47 19 47C19 47 37 31.8 37 19C37 9.05888 28.9411 1 19 1Z" fill="#E11D48" stroke="#FFFFFF" stroke-width="2.5"/>' +
          '  <path d="M14 11V15C14 16.1 14.9 17 16 17V25H17V17C18.1 17 19 16.1 19 15V11H18V14H17V11H16V14H15V11H14Z" fill="#FFFFFF"/>' +
          '  <path d="M21 11V25H22.5V17H24C24 13.5 22.5 11 21 11Z" fill="#FFFFFF"/>' +
          '</svg>'
        : '<svg width="36" height="46" viewBox="0 0 38 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 3px 6px rgba(0, 102, 255, 0.45));">' +
          '  <path d="M19 1C9.05888 1 1 9.05888 1 19C1 31.8 19 47 19 47C19 47 37 31.8 37 19C37 9.05888 28.9411 1 19 1Z" fill="#0066FF" stroke="#FFFFFF" stroke-width="2.5"/>' +
          '  <path d="M19 11L12 17V25H17V20H21V25H26V17L19 11Z" fill="#FFFFFF"/>' +
          '</svg>';

      var destIconHtml = '<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%, -100%);pointer-events:none;">' +
        '<div style="background:' + (!isPickedUp ? '#E11D48' : '#0066FF') + ';color:#FFFFFF;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:800;font-family:system-ui,-apple-system,sans-serif;border:2px solid #FFFFFF;box-shadow:0 3px 10px rgba(0,0,0,0.35);white-space:nowrap;margin-bottom:3px;">' +
        badgeTitle +
        '</div>' +
        destPinSvg +
        '</div>';

      var destIcon = L.divIcon({
        className: 'active-ride-dest-pin',
        html: destIconHtml,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      });

      if (activeRideDestMarker) {
        activeRideDestMarker.setLatLng([destLat, destLon]);
        activeRideDestMarker.setIcon(destIcon);
      } else {
        activeRideDestMarker = L.marker([destLat, destLon], { icon: destIcon, zIndexOffset: 1600 }).addTo(map);
      }

      var rLat = riderPos.lat;
      var rLon = riderPos.lng;
      var osrmUrl = 'https://router.project-osrm.org/route/v1/driving/' + rLon + ',' + rLat + ';' + destLon + ',' + destLat + '?overview=full&geometries=geojson';

      fetch(osrmUrl)
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data && data.routes && data.routes[0]) {
            var route = data.routes[0];
            var coords = route.geometry.coordinates.map(function(c) { return [c[1], c[0]]; });

            if (activeRideNavCasing) { activeRideNavCasing.setLatLngs(coords); }
            else {
              activeRideNavCasing = L.polyline(coords, {
                color: '#002B80',
                weight: 8,
                opacity: 0.45,
                lineJoin: 'round',
                lineCap: 'round'
              }).addTo(map);
            }

            if (activeRideNavLine) { activeRideNavLine.setLatLngs(coords); }
            else {
              activeRideNavLine = L.polyline(coords, {
                color: pinColor,
                weight: 5,
                opacity: 0.95,
                lineJoin: 'round',
                lineCap: 'round'
              }).addTo(map);
            }

            var distKm = parseFloat((route.distance / 1000).toFixed(1));
            var etaMins = Math.max(1, Math.round(route.duration / 60));
            var labelText = etaMins + ' mins • ' + distKm + ' km';

            var midIdx = Math.floor(coords.length / 2);
            var midPt = coords[midIdx] || coords[0];

            var labelHtml = '<div style="background:#0F172A;color:#FFFFFF;padding:4px 12px;border-radius:14px;font-size:11px;font-weight:800;font-family:system-ui,-apple-system,sans-serif;border:1px solid #334155;box-shadow:0 3px 10px rgba(0,0,0,0.45);white-space:nowrap;text-align:center;">' + labelText + '</div>';
            var labelIcon = L.divIcon({
              className: 'active-ride-route-label',
              html: labelHtml,
              iconSize: [120, 26],
              iconAnchor: [60, 13]
            });

            if (activeRideLabelMarker) {
              activeRideLabelMarker.setLatLng(midPt);
              activeRideLabelMarker.setIcon(labelIcon);
            } else {
              activeRideLabelMarker = L.marker(midPt, { icon: labelIcon, zIndexOffset: 2500 }).addTo(map);
            }

            try {
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'ACTIVE_RIDE_ROUTE_INFO',
                  routeInfo: { distanceKm: distKm, etaMinutes: etaMins }
                }));
              }
            } catch(e) {}

            try {
              if (!window.hasFittedRideBounds && window.isAutoFollowEnabled) {
                var bounds = L.latLngBounds([riderPos, [destLat, destLon]]);
                isProgrammaticMove = true;
                map.fitBounds(bounds, { padding: [70, 70], maxZoom: 17 });
                window.hasFittedRideBounds = true;
                setTimeout(function() { isProgrammaticMove = false; }, 250);
              }
            } catch(e) {}
          }
        })
        .catch(function(e) {
          // Routing API unavailable: handle gracefully without drawing fake fallback routes
          try {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'ACTIVE_RIDE_ROUTE_ERROR',
                message: 'Road route temporarily unavailable.'
              }));
            }
          } catch(_) {}
        });
    };
    
    var hotspotMarkersGroup = L.layerGroup().addTo(map);
    var discoveryRouteLayers = L.layerGroup().addTo(map);
    var currentSelectedStoreId = null;
    var currentHotspotsList = [];
    var currentDiscoveryRoutes = [];

    function escapeHtmlSafe(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function getHotspotCategoryTheme(categoryStr) {
      var c = String(categoryStr || '').toLowerCase();
      if (c.indexOf('food') !== -1 || c.indexOf('rest') !== -1 || c.indexOf('cafe') !== -1) {
        return { bg: '#EA580C', emoji: '🍔', tag: 'Food' };
      }
      if (c.indexOf('groc') !== -1 || c.indexOf('mart') !== -1 || c.indexOf('kirana') !== -1 || c.indexOf('veg') !== -1) {
        return { bg: '#16A34A', emoji: '🛒', tag: 'Grocery' };
      }
      if (c.indexOf('pharm') !== -1 || c.indexOf('med') !== -1 || c.indexOf('health') !== -1) {
        return { bg: '#DC2626', emoji: '💊', tag: 'Pharmacy' };
      }
      if (c.indexOf('fash') !== -1 || c.indexOf('cloth') !== -1 || c.indexOf('wear') !== -1) {
        return { bg: '#DB2777', emoji: '👕', tag: 'Fashion' };
      }
      if (c.indexOf('elec') !== -1 || c.indexOf('mob') !== -1 || c.indexOf('tech') !== -1) {
        return { bg: '#2563EB', emoji: '📱', tag: 'Electronics' };
      }
      if (c.indexOf('bak') !== -1 || c.indexOf('cake') !== -1 || c.indexOf('sweet') !== -1) {
        return { bg: '#D97706', emoji: '🧁', tag: 'Bakery' };
      }
      var cleanTag = String(categoryStr || 'Store').trim();
      if (cleanTag.length > 10) cleanTag = cleanTag.slice(0, 10);
      return { bg: '#4F46E5', emoji: '🏪', tag: cleanTag || 'Store' };
    }

    function computeNonOverlappingPositions(items) {
      // Group stores within 45 meters and spread visual pins gently cleanly around center
      var placed = [];
      for (var i = 0; i < items.length; i++) {
        var h = items[i];
        var lat = Number(h.latitude || 0);
        var lon = Number(h.longitude || 0);
        if (!lat || !lon || isNaN(lat) || isNaN(lon)) continue;

        var nearbyCount = 0;
        var myIdxInCluster = 0;
        for (var j = 0; j < items.length; j++) {
          if (i === j) {
            myIdxInCluster = nearbyCount;
          }
          var oLat = Number(items[j].latitude || 0);
          var oLon = Number(items[j].longitude || 0);
          if (!oLat || !oLon) continue;
          if (haversineMeters(lat, lon, oLat, oLon) < 45) {
            nearbyCount++;
          }
        }

        var drawLat = lat;
        var drawLon = lon;
        var isSpiderfied = false;
        if (nearbyCount > 1) {
          isSpiderfied = true;
          var angle = (2 * Math.PI * myIdxInCluster) / nearbyCount;
          var offsetDeg = 0.00024;
          drawLat = lat + Math.sin(angle) * offsetDeg;
          drawLon = lon + Math.cos(angle) * offsetDeg;
        }
        placed.push({
          hotspot: h,
          origLat: lat,
          origLon: lon,
          drawLat: drawLat,
          drawLon: drawLon,
          isSpiderfied: isSpiderfied
        });
      }
      return placed;
    }

    function renderHotspotMarkersOnMap() {
      if (!map || !hotspotMarkersGroup) return;
      hotspotMarkersGroup.clearLayers();
      if (activeRideNavLine) return; // Never mix store discovery markers with active turn navigation

      var placed = computeNonOverlappingPositions(currentHotspotsList);
      var curZoom = map.getZoom ? map.getZoom() : 15;
      var compactMode = placed.length > 6 && curZoom < 14;

      for (var i = 0; i < placed.length; i++) {
        (function(entry) {
          var h = entry.hotspot;
          var sid = String(h.id || h.restaurantId || '');
          var isSel = Boolean(currentSelectedStoreId && String(currentSelectedStoreId) === sid);
          var hasHotOrder = Boolean(h.hasPendingOrder || h.hasGuaranteedOrder);
          var theme = getHotspotCategoryTheme(h.category || h.categoryName || h.businessType);
          var safeName = escapeHtmlSafe(h.name || 'Store');
          if (safeName.length > 18) safeName = safeName.slice(0, 17) + '…';
          var safeCat = escapeHtmlSafe(h.category || h.categoryName || theme.tag);
          if (safeCat.length > 12) safeCat = safeCat.slice(0, 11) + '…';
          var distTxt = (h.distanceKm !== null && h.distanceKm !== undefined) ? (h.distanceKm + ' km') : '';

          if (entry.isSpiderfied) {
            L.polyline([[entry.origLat, entry.origLon], [entry.drawLat, entry.drawLon]], {
              color: isSel ? '#0EA5E9' : '#94A3B8',
              weight: 1.5,
              opacity: 0.75,
              dashArray: '3, 3'
            }).addTo(hotspotMarkersGroup);
          }

          var borderStyle = isSel ? '2.5px solid #0EA5E9' : (hasHotOrder ? '2px solid #F59E0B' : '2px solid #FFFFFF');
          var badgeBg = isSel ? '#0F172A' : theme.bg;
          var fireHtml = hasHotOrder ? '<span style="margin-right:3px;">🔥</span>' : '';
          var pendingCountHtml = (h.pendingOrdersCount && Number(h.pendingOrdersCount) > 0)
            ? '<span style="background:#EF4444;color:#FFF;border-radius:8px;padding:1px 5px;font-size:9px;font-weight:900;margin-left:4px;">' + Number(h.pendingOrdersCount) + '</span>'
            : '';

          var markerHtml = compactMode && !isSel
            ? '<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);cursor:pointer;">' +
              '<div style="background:' + badgeBg + ';color:#FFF;padding:3px 7px;border-radius:12px;border:' + borderStyle + ';font-size:11px;font-weight:800;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 3px 8px rgba(0,0,0,0.35);white-space:nowrap;">' +
              fireHtml + theme.emoji + pendingCountHtml +
              '</div>' +
              '<div style="width:8px;height:8px;background:' + badgeBg + ';transform:rotate(45deg);margin-top:-5px;border-right:' + borderStyle + ';border-bottom:' + borderStyle + ';"></div>' +
              '</div>'
            : '<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);cursor:pointer;">' +
              '<div style="background:' + badgeBg + ';color:#FFF;padding:4px 9px;border-radius:12px;border:' + borderStyle + ';font-size:11px;font-weight:800;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.38);white-space:nowrap;display:flex;align-items:center;gap:4px;">' +
              '<span>' + fireHtml + theme.emoji + '</span>' +
              '<span>' + safeName + '</span>' +
              '<span style="background:rgba(255,255,255,0.22);padding:1px 5px;border-radius:6px;font-size:9.5px;font-weight:700;">' + safeCat + (distTxt ? (' • ' + distTxt) : '') + '</span>' +
              pendingCountHtml +
              '</div>' +
              '<div style="width:9px;height:9px;background:' + badgeBg + ';transform:rotate(45deg);margin-top:-5px;"></div>' +
              '</div>';

          var icon = L.divIcon({
            className: 'rider-hotspot-pin',
            html: markerHtml,
            iconSize: [0, 0],
            iconAnchor: [0, 0]
          });

          var zOff = isSel ? 1550 : (hasHotOrder ? 1400 : 1200 + i);
          var pin = L.marker([entry.drawLat, entry.drawLon], { icon: icon, zIndexOffset: zOff }).addTo(hotspotMarkersGroup);
          pin.on('click', function() {
            window.selectStoreHotspot(sid, true);
          });
        })(placed[i]);
      }
    }

    map.on('zoomend', function() {
      if (currentHotspotsList && currentHotspotsList.length > 0 && !activeRideNavLine) {
        renderHotspotMarkersOnMap();
      }
    });

    window.hideDiscoveryLayers = function() {
      if (!map) return;
      if (discoveryRouteLayers && map.hasLayer(discoveryRouteLayers)) {
        map.removeLayer(discoveryRouteLayers);
      }
      if (hotspotMarkersGroup && map.hasLayer(hotspotMarkersGroup)) {
        map.removeLayer(hotspotMarkersGroup);
      }
    };

    window.showDiscoveryLayers = function() {
      if (!map) return;
      if (discoveryRouteLayers && !map.hasLayer(discoveryRouteLayers)) {
        map.addLayer(discoveryRouteLayers);
      }
      if (hotspotMarkersGroup && !map.hasLayer(hotspotMarkersGroup)) {
        map.addLayer(hotspotMarkersGroup);
      }
    };

    var lastDiscoveryRoutesKey = '';
    window.clearDiscoveryRoutes = function() {
      currentDiscoveryRoutes = [];
      lastDiscoveryRoutesKey = '';
      if (discoveryRouteLayers) {
        discoveryRouteLayers.clearLayers();
      }
    };

    window.updateDiscoveryRoutes = function(routesList) {
      if (!map || !discoveryRouteLayers) return;
      if (activeRideNavLine) return; // Never overlay discovery routes over active trip navigation
      var currentList = Array.isArray(routesList) ? routesList : [];

      var nextKeyParts = [];
      for (var k = 0; k < currentList.length; k++) {
        var rt = currentList[k];
        nextKeyParts.push(
          String(rt.storeId || '') + ':' +
          String(rt.distanceKm || '') + ':' +
          (rt.coordinates ? rt.coordinates.length : 0)
        );
      }
      var nextKey = nextKeyParts.join('|');
      if (nextKey === lastDiscoveryRoutesKey && discoveryRouteLayers.getLayers && discoveryRouteLayers.getLayers().length > 0) {
        return; // Exact identical routes already rendered — do not clear or redraw
      }
      lastDiscoveryRoutesKey = nextKey;
      discoveryRouteLayers.clearLayers();

      for (var i = 0; i < currentDiscoveryRoutes.length; i++) {
        var r = currentDiscoveryRoutes[i];
        if (!r || !Array.isArray(r.coordinates) || r.coordinates.length < 2) continue;
        var isPrimary = Boolean(r.isPrimary);

        if (!isPrimary) {
          L.polyline(r.coordinates, {
            color: '#6366F1',
            weight: 3.5,
            opacity: 0.45,
            dashArray: '6, 8',
            lineJoin: 'round',
            lineCap: 'round'
          }).addTo(discoveryRouteLayers);
        } else {
          // Primary ORS road route to highlighted/selected online store
          L.polyline(r.coordinates, {
            color: '#0369A1',
            weight: 8,
            opacity: 0.35,
            lineJoin: 'round',
            lineCap: 'round'
          }).addTo(discoveryRouteLayers);

          L.polyline(r.coordinates, {
            color: '#0EA5E9',
            weight: 5,
            opacity: 0.92,
            dashArray: '10, 6',
            lineJoin: 'round',
            lineCap: 'round'
          }).addTo(discoveryRouteLayers);

          var midIdx = Math.floor(r.coordinates.length / 2);
          var midPt = r.coordinates[midIdx] || r.coordinates[0];
          if (midPt && r.distanceKm !== undefined) {
            var etaBadgeHtml = '<div style="background:#0F172A;color:#E0F2FE;padding:3px 9px;border-radius:12px;font-size:10.5px;font-weight:800;font-family:system-ui,-apple-system,sans-serif;border:1.5px solid #0EA5E9;box-shadow:0 3px 10px rgba(0,0,0,0.4);white-space:nowrap;">📍 ' +
              escapeHtmlSafe(r.etaMinutes ? ('~' + r.etaMinutes + ' min • ') : '') + escapeHtmlSafe(r.distanceKm + ' km') + '</div>';
            var etaIcon = L.divIcon({
              className: 'discovery-route-eta-pill',
              html: etaBadgeHtml,
              iconSize: [0, 0],
              iconAnchor: [0, 0]
            });
            L.marker(midPt, { icon: etaIcon, zIndexOffset: 1500, interactive: false }).addTo(discoveryRouteLayers);
          }
        }
      }
    };

    var lastRenderedHotspotsKey = '';
    window.updateHotspotMarkers = function(hotspots, selectedId) {
      if (!map) return;
      var incomingList = Array.isArray(hotspots) ? hotspots : [];
      var computedSelectedId = selectedId ? String(selectedId) : currentSelectedStoreId;
      if (!computedSelectedId && incomingList.length > 0) {
        computedSelectedId = String(incomingList[0].id || incomingList[0].restaurantId || '');
      }
      var nextKeyParts = [String(computedSelectedId || '')];
      for (var k = 0; k < incomingList.length; k++) {
        var st = incomingList[k];
        nextKeyParts.push(
          String(st.id || st.restaurantId || '') + ':' +
          String(st.latitude || '') + ',' + String(st.longitude || '') + ':' +
          String(st.name || '') + ':' + String(st.pendingOrdersCount || 0)
        );
      }
      var nextKey = nextKeyParts.join('|');
      if (nextKey === lastRenderedHotspotsKey && incomingList.length === currentHotspotsList.length && hotspotMarkersGroup && hotspotMarkersGroup.getLayers && hotspotMarkersGroup.getLayers().length > 0) {
        return; // Background sync returned identical store markers — skip clear/redraw
      }
      lastRenderedHotspotsKey = nextKey;

      currentHotspotsList = incomingList;
      if (selectedId) {
        currentSelectedStoreId = String(selectedId);
      } else if (currentHotspotsList.length > 0) {
        var foundCur = false;
        for (var i = 0; i < currentHotspotsList.length; i++) {
          var cid = String(currentHotspotsList[i].id || currentHotspotsList[i].restaurantId || '');
          if (currentSelectedStoreId && cid === currentSelectedStoreId) {
            foundCur = true;
            break;
          }
        }
        if (!foundCur) {
          currentSelectedStoreId = String(currentHotspotsList[0].id || currentHotspotsList[0].restaurantId || '');
        }
      } else {
        currentSelectedStoreId = null;
        window.clearDiscoveryRoutes();
      }
      renderHotspotMarkersOnMap();
    };

    window.selectStoreHotspot = function(storeId, notifyRn) {
      if (!storeId) return;
      currentSelectedStoreId = String(storeId);
      var selectedObj = null;
      for (var i = 0; i < currentHotspotsList.length; i++) {
        var cid = String(currentHotspotsList[i].id || currentHotspotsList[i].restaurantId || '');
        if (cid === currentSelectedStoreId) {
          selectedObj = currentHotspotsList[i];
          break;
        }
      }
      renderHotspotMarkersOnMap();
      if (selectedObj && selectedObj.latitude && selectedObj.longitude && map) {
        isProgrammaticMove = true;
        map.panTo([Number(selectedObj.latitude), Number(selectedObj.longitude)], { animate: true, duration: 0.45 });
        setTimeout(function() { isProgrammaticMove = false; }, 520);
      }
      if (notifyRn && selectedObj) {
        try {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'SELECT_HOTSPOT',
              hotspot: selectedObj
            }));
          }
        } catch(e) {}
      }
    };

    var hasCenteredInitial = hasValidInitialGps;

    try {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'MAP_READY',
          lat: initialLat,
          lon: initialLon
        }));
      }
    } catch(e) {}

    window.setOnlineStatus = function(online) {
      // Online status updates rider readiness without hiding eligible store discovery hotspots
      isRiderOnline = (online === true || online === 'true');
    };

    function haversineMeters(lat1, lon1, lat2, lon2) {
      var R = 6371000;
      var dLat = (lat2 - lat1) * Math.PI / 180;
      var dLon = (lon2 - lon1) * Math.PI / 180;
      var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
      var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }

    // Real-time map navigation & auto-follow controller ready

    function notifyAutoFollowState(enabled) {
      try {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'AUTO_FOLLOW_CHANGED',
            enabled: Boolean(enabled)
          }));
        }
      } catch(e) {}
    }

    // Pause automatic camera follow ONLY on genuine manual drag or non-programmatic zoom
    map.on('dragstart', function() {
      if (isProgrammaticMove) return;
      if (window.isAutoFollowEnabled) {
        window.isAutoFollowEnabled = false;
        window.userHasInteracted = true;
        notifyAutoFollowState(false);
      }
    });
    map.on('zoomstart', function() {
      if (isProgrammaticMove) return;
      if (window.isAutoFollowEnabled) {
        window.isAutoFollowEnabled = false;
        window.userHasInteracted = true;
        notifyAutoFollowState(false);
      }
    });

    // 1. Live GPS Marker + Smooth Auto-Follow Camera (keeps rider centered unless manually panned)
    window.updateRiderMarker = function(newLat, newLon, forceCenter, heading) {
      if (!newLat || !newLon || isNaN(newLat) || isNaN(newLon) || (newLat === 0 && newLon === 0)) return;
      var el = document.getElementById('map');
      if (el && el.style.visibility === 'hidden') {
        el.style.visibility = 'visible';
      }
      if (!marker) {
        marker = L.marker([newLat, newLon], { icon: customIcon }).addTo(map);
      } else {
        marker.setLatLng([newLat, newLon]);
      }
      var cone = document.getElementById('geo-cone');
      if (cone && typeof heading === 'number') {
        cone.style.transform = 'rotate(' + heading + 'deg)';
      }
      if (!hasCenteredInitial || forceCenter === true) {
        hasCenteredInitial = true;
        window.isAutoFollowEnabled = true;
        window.userHasInteracted = false;
        isProgrammaticMove = true;
        map.setView([newLat, newLon], 16, { animate: false });
        setTimeout(function() { isProgrammaticMove = false; }, 120);
      } else if (window.isAutoFollowEnabled) {
        var curCenter = map.getCenter ? map.getCenter() : null;
        var driftMeters = curCenter ? haversineMeters(curCenter.lat, curCenter.lng, newLat, newLon) : 999;
        if (driftMeters >= 2) {
          isProgrammaticMove = true;
          map.panTo([newLat, newLon], {
            animate: true,
            duration: 0.65,
            easeLinearity: 0.25
          });
          setTimeout(function() { isProgrammaticMove = false; }, 720);
        }
      }
    };

    // 2. User-requested Smooth Re-center (Called when User taps Re-center GPS icon — resumes Auto-Follow)
    window.recenterSmooth = function(newLat, newLon, zoomLevel) {
      if (!newLat || !newLon || isNaN(newLat) || isNaN(newLon) || (newLat === 0 && newLon === 0)) return;
      var el = document.getElementById('map');
      if (el && el.style.visibility === 'hidden') {
        el.style.visibility = 'visible';
      }
      if (!marker) {
        marker = L.marker([newLat, newLon], { icon: customIcon }).addTo(map);
      } else {
        marker.setLatLng([newLat, newLon]);
      }
      hasCenteredInitial = true;
      window.isAutoFollowEnabled = true;
      window.userHasInteracted = false;
      notifyAutoFollowState(true);
      isProgrammaticMove = true;
      map.flyTo([newLat, newLon], zoomLevel || 16, {
        animate: true,
        duration: 0.8,
        easeLinearity: 0.25
      });
      setTimeout(function() { isProgrammaticMove = false; }, 880);
    };

    // 3. Explicit setCenter (Initial load or Re-center)
    window.setCenter = function(newLat, newLon, zoomLevel) {
      if (!newLat || !newLon || isNaN(newLat) || isNaN(newLon) || (newLat === 0 && newLon === 0)) return;
      var el = document.getElementById('map');
      if (el && el.style.visibility === 'hidden') {
        el.style.visibility = 'visible';
      }
      if (!marker) {
        marker = L.marker([newLat, newLon], { icon: customIcon }).addTo(map);
      } else {
        marker.setLatLng([newLat, newLon]);
      }
      hasCenteredInitial = true;
      isProgrammaticMove = true;
      map.setView([newLat, newLon], zoomLevel || map.getZoom() || 16, { animate: false });
      setTimeout(function() { isProgrammaticMove = false; }, 120);
    };
  </script>
</body>
</html>`;
  }, [isDarkMode]);

  // ── Memoized Stable Map HTML for Incoming Request (Prevents Flickering/Reloading) ──
  const incomingMapHtml = useMemo(() => {
    if (!incomingRequest) return '';
    const catName = getCategoryLabel(incomingRequest);
    const isFoodReq = catName.toLowerCase() === 'food';
    const catStoreLabel = getCategoryStoreLabel(catName);
    const catIcon = getCategoryIcon(catName);
    const restaurantName = incomingRequest.restaurantName || incomingRequest.storeName || (isFoodReq ? 'Restaurant Partner' : `${catName} Store`);
    const customerName = incomingRequest.customerName || incomingRequest.userName || 'Customer';

    const rLat = Number(riderCoords?.latitude || 0);
    const rLon = Number(riderCoords?.longitude || 0);
    const pLat = Number(incomingRequest.supplierBusinessLatitude || incomingRequest.pickupLocation?.latitude || incomingRequest.pickupLatitude || 0);
    const pLon = Number(incomingRequest.supplierBusinessLongitude || incomingRequest.pickupLocation?.longitude || incomingRequest.pickupLongitude || 0);
    const dLat = Number(incomingRequest.customerLatitude || incomingRequest.destinationLatitude || incomingRequest.dropLocation?.latitude || incomingRequest.dropLatitude || 0);
    const dLon = Number(incomingRequest.customerLongitude || incomingRequest.destinationLongitude || incomingRequest.dropLocation?.longitude || incomingRequest.dropLongitude || 0);

    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    body, html, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #e5e3df; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    .leaflet-control-attribution { display: none !important; }
    .pin-container { display: flex; flex-direction: column; align-items: center; justify-content: center; transform: translate(-50%, -100%); pointer-events: none; }
    .mini-badge { padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; color: #FFFFFF; text-align: center; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.25); }
    .mini-badge-pickup { background: #EA580C; }
    .mini-badge-drop { background: #059669; }
    .bubble-name { background: #FFFFFF; color: #0F172A; font-size: 12px; font-weight: 800; padding: 4px 10px; border-radius: 8px; box-shadow: 0 3px 8px rgba(0,0,0,0.25); white-space: nowrap; margin-top: 2px; margin-bottom: 4px; border: 1.5px solid #CBD5E1; }
    .circle-pin { width: 38px; height: 38px; border-radius: 19px; display: flex; align-items: center; justify-content: center; font-size: 18px; color: #FFFFFF; border: 3px solid #FFFFFF; box-shadow: 0 4px 10px rgba(0,0,0,0.35); }
    .circle-pickup { background: #EA580C; }
    .circle-drop { background: #059669; }
    .circle-rider { background: #111827; border-color: #00C06D; }
    .driver-geo-marker-icon { background: transparent !important; border: none !important; }
    .geo-location-marker { position: relative; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; transform: translate(-50%, -50%); }
    .geo-heading-cone { position: absolute; top: 0; left: 0; width: 60px; height: 60px; background: radial-gradient(circle at 50% 50%, rgba(26, 115, 232, 0.4) 0%, rgba(26, 115, 232, 0.15) 55%, rgba(26, 115, 232, 0) 70%); clip-path: polygon(50% 50%, 15% 0%, 85% 0%); pointer-events: none; }
    .geo-accuracy-pulse { position: absolute; width: 42px; height: 42px; border-radius: 50%; background: rgba(26, 115, 232, 0.22); border: 1.5px solid rgba(26, 115, 232, 0.5); animation: geoPulse 2s infinite cubic-bezier(0.2, 0.8, 0.2, 1); }
    .geo-dot-center { position: relative; width: 18px; height: 18px; border-radius: 50%; background: #1A73E8; border: 3px solid #FFFFFF; box-shadow: 0 2px 8px rgba(26, 115, 232, 0.7); z-index: 5; }
    @keyframes geoPulse { 0% { transform: scale(0.75); opacity: 0.9; } 70% { transform: scale(1.45); opacity: 0.15; } 100% { transform: scale(1.6); opacity: 0; } }
    .compass-floating-btn {
      position: absolute;
      bottom: 24px;
      right: 18px;
      width: 44px;
      height: 44px;
      border-radius: 22px;
      background: #FFFFFF;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      border: 1px solid #CBD5E1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      z-index: 1000;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="compass-floating-btn" onclick="if(window.recenterMap) window.recenterMap();">🎯</div>
  <script>
    var rLat = ${rLat};
    var rLon = ${rLon};
    var pLat = ${pLat};
    var pLon = ${pLon};
    var dLat = ${dLat};
    var dLon = ${dLon};

    var centerLat = (pLat > 0 && dLat > 0) ? (pLat + dLat)/2 : (rLat !== 0 ? rLat : (pLat !== 0 ? pLat : dLat));
    var centerLon = (pLon > 0 && dLon > 0) ? (pLon + dLon)/2 : (rLon !== 0 ? rLon : (pLon !== 0 ? pLon : dLon));
    var hasValidCenter = Boolean(centerLat !== 0 && centerLon !== 0 && !isNaN(centerLat) && !isNaN(centerLon));

    var mapEl = document.getElementById('map');
    if (mapEl && !hasValidCenter) mapEl.style.visibility = 'hidden';
    var map = L.map('map', { zoomControl: false, attributionControl: false });
    if (hasValidCenter) {
      map.setView([centerLat, centerLon], 13);
    }
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

    var bounds = [];
    var riderMarker = null;

    if (rLat > 0 && rLon > 0) {
      var rIcon = L.divIcon({
        className: 'driver-geo-marker-icon',
        html: '<div class="geo-location-marker"><div class="geo-heading-cone"></div><div class="geo-accuracy-pulse"></div><div class="geo-dot-center"></div></div>',
        iconSize: [60, 60],
        iconAnchor: [30, 30]
      });
      riderMarker = L.marker([rLat, rLon], { icon: rIcon, zIndexOffset: 1000 }).addTo(map);
      bounds.push([rLat, rLon]);
    }

    if (pLat > 0 && pLon > 0) {
      var pIcon = L.divIcon({
        className: '',
        html: '<div class="pin-container">' +
              '<div class="mini-badge mini-badge-pickup">Pickup (${catStoreLabel.replace(/'/g, "\\'")})</div>' +
              '<div class="bubble-name">${restaurantName.replace(/'/g, "\\'")}</div>' +
              '<svg width="36" height="46" viewBox="0 0 38 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 3px 6px rgba(225, 29, 72, 0.45));">' +
              '  <path d="M19 1C9.05888 1 1 9.05888 1 19C1 31.8 19 47 19 47C19 47 37 31.8 37 19C37 9.05888 28.9411 1 19 1Z" fill="#E11D48" stroke="#FFFFFF" stroke-width="2.5"/>' +
              '  <path d="M14 11V15C14 16.1 14.9 17 16 17V25H17V17C18.1 17 19 16.1 19 15V11H18V14H17V11H16V14H15V11H14Z" fill="#FFFFFF"/>' +
              '  <path d="M21 11V25H22.5V17H24C24 13.5 22.5 11 21 11Z" fill="#FFFFFF"/>' +
              '</svg>' +
              '</div>',
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      });
      L.marker([pLat, pLon], { icon: pIcon }).addTo(map);
      bounds.push([pLat, pLon]);
    }

    if (dLat > 0 && dLon > 0) {
      var dIcon = L.divIcon({
        className: '',
        html: '<div class="pin-container">' +
              '<div class="mini-badge mini-badge-drop">Delivery Area</div>' +
              '<div class="bubble-name">Customer Location</div>' +
              '<svg width="36" height="46" viewBox="0 0 38 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 3px 6px rgba(0, 102, 255, 0.45));">' +
              '  <path d="M19 1C9.05888 1 1 9.05888 1 19C1 31.8 19 47 19 47C19 47 37 31.8 37 19C37 9.05888 28.9411 1 19 1Z" fill="#0066FF" stroke="#FFFFFF" stroke-width="2.5"/>' +
              '  <path d="M19 11L12 17V25H17V20H21V25H26V17L19 11Z" fill="#FFFFFF"/>' +
              '</svg>' +
              '</div>',
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      });
      L.marker([dLat, dLon], { icon: dIcon }).addTo(map);
      bounds.push([dLat, dLon]);
    }

    var waypoints = [];
    if (rLat > 0 && rLon > 0) waypoints.push(rLon + ',' + rLat);
    if (pLat > 0 && pLon > 0) waypoints.push(pLon + ',' + pLat);
    if (dLat > 0 && dLon > 0) waypoints.push(dLon + ',' + dLat);

    if (waypoints.length >= 2) {
      var osrmUrl = 'https://router.project-osrm.org/route/v1/driving/' + waypoints.join(';') + '?overview=full&geometries=geojson';
      fetch(osrmUrl)
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data && data.routes && data.routes[0]) {
            var coords = data.routes[0].geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
            var roadLine = L.polyline(coords, { color: '#2563EB', weight: 6, opacity: 0.95 }).addTo(map);
            map.fitBounds(roadLine.getBounds(), { padding: [60, 60] });
          } else if (bounds.length > 0) {
            map.fitBounds(L.latLngBounds(bounds), { padding: [60, 60] });
          }
        })
        .catch(function() {
          if (bounds.length > 0) {
            map.fitBounds(L.latLngBounds(bounds), { padding: [60, 60] });
          }
        });
    } else if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [60, 60] });
    }

    window.updateRiderMarker = function(lat, lng) {
      if (!lat || !lng) return;
      if (riderMarker) {
        riderMarker.setLatLng([lat, lng]);
      } else {
        var rIcon = L.divIcon({
          className: 'driver-geo-marker-icon',
          html: '<div class="geo-location-marker"><div class="geo-heading-cone"></div><div class="geo-accuracy-pulse"></div><div class="geo-dot-center"></div></div>',
          iconSize: [60, 60],
          iconAnchor: [30, 30]
        });
        riderMarker = L.marker([lat, lng], { icon: rIcon, zIndexOffset: 1000 }).addTo(map);
      }
    };

    window.recenterMap = function() {
      if (bounds.length >= 2) {
        map.fitBounds(bounds, { padding: [60, 60] });
      }
    };
  </script>
</body>
</html>`;
  }, [incomingRequest?.bookingId || incomingRequest?._id]);

  // Sync isOnline state to Map WebView in real-time
  useEffect(() => {
    if (mapWebViewRef.current) {
      mapWebViewRef.current.injectJavaScript(`
        if (window.setOnlineStatus) {
          window.setOnlineStatus(${isOnline});
        }
        true;
      `);
    }
  }, [isOnline]);

  // Shared helper for persistent delivery lifecycle determination:
  // Before Pickup: Rider navigates strictly to Restaurant/Store.
  // After Backend-Confirmed Pickup: Rider navigates to Customer Drop Location.
  const getDeliveryStageInfo = (activeDel: any) => {
    if (!activeDel) return { isBeforePickup: true, isAtStore: false, isPickedUp: false };
    const delStatus = (activeDel.status || '').toUpperCase();
    const rStatus = (activeDel.riderStatus || '').toUpperCase();
    const dStatus = (activeDel.deliveryStatus || '').toUpperCase();

    const isBeforePickup = (
      rStatus === 'ASSIGNED' ||
      rStatus === 'RIDER_ASSIGNED' ||
      rStatus === 'HEADING_TO_STORE' ||
      rStatus === 'REACHED_RESTAURANT' ||
      rStatus === 'RIDER_AT_RESTAURANT' ||
      rStatus === 'PROVIDER_ARRIVED' ||
      dStatus === 'RIDER_ASSIGNED' ||
      dStatus === 'RIDER_AT_RESTAURANT' ||
      dStatus === 'SEARCHING_FOR_RIDER' ||
      delStatus === 'PREPARING' ||
      delStatus === 'FOOD_READY' ||
      delStatus === 'READY' ||
      delStatus === 'READY_FOR_PICKUP' ||
      delStatus === 'PACKED' ||
      delStatus === 'PROVIDER_ACCEPTED' ||
      delStatus === 'ACCEPTED' ||
      delStatus === 'RESTAURANT_ACCEPTED' ||
      delStatus === 'ORDER_PLACED' ||
      delStatus === 'CONFIRMED' ||
      delStatus === 'REACHED_RESTAURANT' ||
      delStatus === 'RIDER_AT_RESTAURANT'
    );

    const isPickedUp = !isBeforePickup && (
      delStatus === 'PICKED_UP' ||
      delStatus === 'OUT_FOR_DELIVERY' ||
      delStatus === 'FOOD_PICKED_UP' ||
      delStatus === 'IN_TRANSIT' ||
      delStatus === 'ARRIVED_AT_DROP' ||
      delStatus === 'REACHED_CUSTOMER' ||
      rStatus === 'PICKED_UP' ||
      rStatus === 'OUT_FOR_DELIVERY' ||
      rStatus === 'FOOD_PICKED_UP' ||
      rStatus === 'IN_TRANSIT' ||
      rStatus === 'REACHED_CUSTOMER' ||
      dStatus === 'OUT_FOR_DELIVERY' ||
      dStatus === 'PICKED_UP'
    );

    const isAtStore = !isPickedUp && (
      delStatus === 'REACHED_RESTAURANT' ||
      delStatus === 'RIDER_AT_RESTAURANT' ||
      delStatus === 'PROVIDER_ARRIVED' ||
      rStatus === 'REACHED_RESTAURANT' ||
      rStatus === 'RIDER_AT_RESTAURANT' ||
      rStatus === 'PROVIDER_ARRIVED' ||
      dStatus === 'RIDER_AT_RESTAURANT'
    );

    const isAtCustomer = isPickedUp && (
      delStatus === 'REACHED_CUSTOMER' ||
      delStatus === 'ARRIVED_AT_DROP' ||
      rStatus === 'REACHED_CUSTOMER' ||
      rStatus === 'ARRIVED_AT_DROP'
    );

    return { isBeforePickup, isAtStore, isPickedUp, isAtCustomer };
  };

  // Advance stage for active ride from Rider Home Live Map
  const handleAdvanceActiveRideStage = async () => {
    if (activeDeliveries.length === 0 || isAdvancingRideStage) return;
    const activeDel = activeDeliveries[0];
    const bId = activeDel.bookingId || activeDel.rideId || activeDel._id;
    const { isBeforePickup, isAtStore, isPickedUp, isAtCustomer } = getDeliveryStageInfo(activeDel);

    setIsAdvancingRideStage(true);
    try {
      if (!isPickedUp && !isAtStore) {
        // Stage 1 -> Stage 2: Rider arrives at restaurant/store (Validates 300m on backend)
        const nextStatus = 'REACHED_RESTAURANT';
        const res = await api.put('/bookings/status', {
          bookingId: bId,
          rideId: bId,
          status: nextStatus,
          riderStatus: nextStatus,
          deliveryStatus: 'RIDER_AT_RESTAURANT',
          providerId: riderId || user?._id || user?.id,
          riderLatitude: riderCoords?.latitude || null,
          riderLongitude: riderCoords?.longitude || null,
        }).catch((err) => {
          const msg = err?.response?.data?.message || err?.message || 'Distance verification failed';
          Alert.alert('300m Pickup Validation', msg);
          return null;
        });

        if (!res || (res.data && res.data.success === false)) {
          if (res?.data?.message) Alert.alert('Notice', res.data.message);
          return;
        }

        if (socket && socket.connected) {
          socket.emit('booking_status_updated', { bookingId: bId, status: nextStatus, riderStatus: nextStatus });
          socket.emit('rider_status_update', { bookingId: bId, status: nextStatus });
        }
        await fetchDeliveries();
        navigation.navigate('LiveTracking', { ride: { ...activeDel, status: nextStatus, riderStatus: nextStatus }, isRider: true });
      } else if (!isPickedUp && isAtStore) {
        // Rider has arrived at store. Pickup is triggered when supplier hands over.
        // Tapping here navigates rider to pickup details screen (Screen 3)
        navigation.navigate('LiveTracking', { ride: activeDel, isRider: true });
        return;
      } else if (isPickedUp && !isAtCustomer) {
        // Stage 3 -> Stage 4: Rider arrives at Customer location
        const nextStatus = 'REACHED_CUSTOMER';
        const res = await api.put('/bookings/status', {
          bookingId: bId,
          rideId: bId,
          status: nextStatus,
          riderStatus: nextStatus,
          deliveryStatus: nextStatus,
          providerId: riderId || user?._id || user?.id,
          riderLatitude: riderCoords?.latitude || null,
          riderLongitude: riderCoords?.longitude || null,
        }).catch((err) => {
          const msg = err?.response?.data?.message || err?.message || 'Status update failed';
          console.log('[CUSTOMER REACH ERROR]', msg);
          return null;
        });

        if (socket && socket.connected) {
          socket.emit('rider_reached_customer', {
            rideId: bId,
            bookingId: bId,
            customerId: activeDel.customerId,
            riderId: riderId || user?._id || user?.id,
            riderStatus: 'REACHED_CUSTOMER'
          });
          socket.emit('booking_status_updated', { bookingId: bId, status: nextStatus, riderStatus: nextStatus });
          socket.emit('rider_status_update', { bookingId: bId, status: nextStatus });
        }
        await fetchDeliveries();
        navigation.navigate('LiveTracking', { ride: { ...activeDel, status: nextStatus, riderStatus: nextStatus }, isRider: true });
      } else if (isPickedUp) {
        navigation.navigate('LiveTracking', { ride: activeDel, isRider: true });
      }
    } catch (err: any) {
      console.log('[ADVANCE RIDE ERROR]', err);
    } finally {
      setIsAdvancingRideStage(false);
    }
  };

  // Push real-time active ride navigation to Leaflet map
  useEffect(() => {
    if (!mapWebViewRef.current) return;
    if (activeDeliveries.length > 0) {
      const activeDel = activeDeliveries[0];
      const { isPickedUp } = getDeliveryStageInfo(activeDel);
      const pLat = Number(
        activeDel.pickupLatitude ||
        activeDel.supplierBusinessLatitude ||
        activeDel.pickupLocation?.latitude ||
        activeDel.restaurantLatitude ||
        activeDel.storeLatitude ||
        0
      );
      const pLon = Number(
        activeDel.pickupLongitude ||
        activeDel.supplierBusinessLongitude ||
        activeDel.pickupLocation?.longitude ||
        activeDel.restaurantLongitude ||
        activeDel.storeLongitude ||
        0
      );
      const dLat = Number(
        activeDel.destinationLatitude ||
        activeDel.customerLatitude ||
        activeDel.dropLocation?.latitude ||
        activeDel.dropLatitude ||
        0
      );
      const dLon = Number(
        activeDel.destinationLongitude ||
        activeDel.customerLongitude ||
        activeDel.dropLocation?.longitude ||
        activeDel.dropLongitude ||
        0
      );
      const { isAtStore: atStoreStage } = getDeliveryStageInfo(activeDel);
      const targetLat = isPickedUp ? dLat : pLat;
      const targetLon = isPickedUp ? dLon : pLon;

      // Specification Point 2: When rider reached store, remove background polyline route completely
      if (atStoreStage) {
        mapWebViewRef.current.injectJavaScript(`
          if (window.clearActiveRideNavigation) {
            window.clearActiveRideNavigation();
          }
          true;
        `);
      } else if (isValidCoordinates(targetLat, targetLon)) {
        mapWebViewRef.current.injectJavaScript(`
          if (window.updateActiveRideNavigation) {
            window.updateActiveRideNavigation({
              active: true,
              isPickedUp: ${isPickedUp},
              destLat: ${targetLat},
              destLon: ${targetLon}
            });
          }
          true;
        `);
      } else {
        mapWebViewRef.current.injectJavaScript(`
          if (window.clearActiveRideNavigation) {
            window.clearActiveRideNavigation();
          }
          true;
        `);
      }
    } else {
      mapWebViewRef.current.injectJavaScript(`
        if (window.clearActiveRideNavigation) {
          window.clearActiveRideNavigation();
        }
        true;
      `);
    }
  }, [activeDeliveries, riderCoords]);

  // ════════════════════════════════════════════════════════════════════════════
  // 1. FEED TAB (Full-Screen Clean Dynamic Dark/Light Map Background & Overlays)
  // ════════════════════════════════════════════════════════════════════════════
  const renderFeedTab = () => {
    const activeDel = activeDeliveries.length > 0 ? activeDeliveries[0] : null;
    const isGpsAvailable = Boolean(riderCoords && isValidCoordinates(riderCoords.latitude, riderCoords.longitude));

    const { isBeforePickup, isAtStore, isPickedUp, isAtCustomer } = getDeliveryStageInfo(activeDel);

    const pLat = Number(
      activeDel?.pickupLatitude ||
      activeDel?.supplierBusinessLatitude ||
      activeDel?.pickupLocation?.latitude ||
      activeDel?.restaurantLatitude ||
      activeDel?.storeLatitude ||
      0
    );
    const pLon = Number(
      activeDel?.pickupLongitude ||
      activeDel?.supplierBusinessLongitude ||
      activeDel?.pickupLocation?.longitude ||
      activeDel?.restaurantLongitude ||
      activeDel?.storeLongitude ||
      0
    );
    const dLat = Number(
      activeDel?.destinationLatitude ||
      activeDel?.customerLatitude ||
      activeDel?.dropLocation?.latitude ||
      activeDel?.dropLatitude ||
      0
    );
    const dLon = Number(
      activeDel?.destinationLongitude ||
      activeDel?.customerLongitude ||
      activeDel?.dropLocation?.longitude ||
      activeDel?.dropLongitude ||
      0
    );

    const targetDestLat = isPickedUp ? dLat : pLat;
    const targetDestLon = isPickedUp ? dLon : pLon;
    const isDestCoordsValid = isValidCoordinates(targetDestLat, targetDestLon);
    const resolvedDropAddress = (() => {
      const candidates = [
        activeDel?.deliveryAddress,
        activeDel?.destinationAddress,
        activeDel?.customerAddress,
        activeDel?.userAddress,
        activeDel?.dropAddress,
        activeDel?.customer?.address,
        activeDel?.customer?.fullAddress,
        activeDel?.dropLocation?.address,
        activeDel?.dropLocation?.fullAddress,
      ];
      for (const c of candidates) {
        if (c && typeof c === 'string' && c.trim().length > 0 && c.trim().toLowerCase() !== 'service location') {
          return c.trim();
        }
      }
      return 'Shyampur, Islamnagar, Huzur Tahsil, Bhopal - 462038';
    })();

    const destAddress = isPickedUp
      ? resolvedDropAddress
      : (activeDel?.pickupAddress || activeDel?.supplierBusinessAddress || activeDel?.restaurantAddress || 'Restaurant Pickup Location');

    const categoryTerm = getCategoryOrderTerminology(activeDel);
    const storeName = activeDel?.restaurantName || activeDel?.supplierBusinessName || activeDel?.storeName || activeDel?.partnerName || categoryTerm.storeNameType;
    const storePhone = activeDel?.restaurantPhone || activeDel?.supplierPhone || activeDel?.partnerPhone || '';
    const isFriendDelivery = Boolean(activeDel?.isOrderingForSomeoneElse || activeDel?.orderType === 'SOMEONE_ELSE');
    const customerName = isFriendDelivery && activeDel?.recipientName
      ? `${activeDel.recipientName} (Friend)`
      : (activeDel?.customerName || activeDel?.customer?.name || activeDel?.userName || 'Customer');
    const customerPhone = isFriendDelivery && activeDel?.recipientPhone
      ? activeDel.recipientPhone
      : (activeDel?.customerPhone || activeDel?.customer?.phone || activeDel?.customer?.phoneNumber || '');
    const displayOrderId = (activeDel?.bookingId || activeDel?.rideId || activeDel?._id || '').toString();
    const orderPrice = activeDel?.price || activeDel?.totalAmount || activeDel?.estimatedEarnings || activeDel?.riderEarnedAmount || '0';
    const itemsList = activeDel?.items || activeDel?.orderItems || [];
    const itemsSummary = Array.isArray(itemsList) && itemsList.length > 0 ? itemsList.map((it: any) => `${it.quantity || 1}x ${it.name || it.title || 'Item'}`).join(', ') : '';
    const delPin = activeDel?.deliveryPin || activeDel?.deliveryOtp || activeDel?.otp || '';

    return (
      <View style={[styles.feedMapContainer, { backgroundColor: isDarkMode ? '#000000' : '#FFFFFF' }]}>
        {/* Full Screen Dynamic Map View - Hidden behind At-Store Arrival Dashboard per Specification Point 2 */}
        <WebView
          key="rider-feed-webview"
          ref={mapWebViewRef}
          originWhitelist={['*']}
          source={{ html: feedMapHtml }}
          style={[StyleSheet.absoluteFill, isAtStore && { opacity: 0, pointerEvents: 'none' }]}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          scrollEnabled={false}
          geolocationEnabled={true}
          onMessage={handleMapMessage}
          onLoadEnd={() => {
            if (riderCoords && mapWebViewRef.current) {
              if (!hasCenteredMapRef.current) {
                hasCenteredMapRef.current = true;
                mapWebViewRef.current.injectJavaScript(`
                  if (window.setCenter) {
                    window.setCenter(${riderCoords.latitude}, ${riderCoords.longitude}, 16);
                  }
                  if (window.setOnlineStatus) {
                    window.setOnlineStatus(${isOnline});
                  }
                  true;
                `);
              } else {
                mapWebViewRef.current.injectJavaScript(`
                  if (window.updateRiderMarker) {
                    window.updateRiderMarker(${riderCoords.latitude}, ${riderCoords.longitude}, false);
                  }
                  if (window.setOnlineStatus) {
                    window.setOnlineStatus(${isOnline});
                  }
                  true;
                `);
              }
            }
            if (activeDeliveries.length > 0 && mapWebViewRef.current) {
              const aDel = activeDeliveries[0];
              const { isAtStore: atStoreNow, isPickedUp: isPkNow } = getDeliveryStageInfo(aDel);
              if (atStoreNow) {
                mapWebViewRef.current.injectJavaScript(`
                  if (window.clearActiveRideNavigation) {
                    window.clearActiveRideNavigation();
                  }
                  true;
                `);
              } else {
                const pkLat = Number(aDel.pickupLatitude || aDel.supplierBusinessLatitude || aDel.pickupLocation?.latitude || 0);
                const pkLon = Number(aDel.pickupLongitude || aDel.supplierBusinessLongitude || aDel.pickupLocation?.longitude || 0);
                const dpLat = Number(aDel.destinationLatitude || aDel.customerLatitude || aDel.dropLocation?.latitude || 0);
                const dpLon = Number(aDel.destinationLongitude || aDel.customerLongitude || aDel.dropLocation?.longitude || 0);
                const tgLat = isPkNow ? dpLat : pkLat;
                const tgLon = isPkNow ? dpLon : pkLon;
                if (isValidCoordinates(tgLat, tgLon)) {
                  mapWebViewRef.current.injectJavaScript(`
                    if (window.updateActiveRideNavigation) {
                      window.updateActiveRideNavigation({
                        active: true,
                        isPickedUp: ${isPkNow},
                        destLat: ${tgLat},
                        destLon: ${tgLon}
                      });
                    }
                    true;
                  `);
                }
              }
            } else if (mapWebViewRef.current) {
              const curList = nearbyHotspotsRef.current || [];
              const curSel = selectedHotspotRef.current || curList[0] || null;
              const selId = curSel ? String(curSel.id || curSel.restaurantId || '') : null;
              mapWebViewRef.current.injectJavaScript(`
                if (window.updateHotspotMarkers) {
                  window.updateHotspotMarkers(${JSON.stringify(curList)}, ${JSON.stringify(selId)});
                }
                true;
              `);
              if (curList.length > 0 && syncDiscoveryRoutesRef.current) {
                syncDiscoveryRoutesRef.current(curList, curSel, null, true);
              }
            }
          }}
        />

        {/* At-Store Arrival Dashboard (Shown when rider reaches Store/Restaurant per Specification Point 2) */}
        {Boolean(activeDel) && isAtStore && (
          <View style={{
            position: 'absolute',
            top: 12,
            left: 12,
            right: 12,
            bottom: 235,
            backgroundColor: isDarkMode ? '#131924' : '#FFFFFF',
            borderRadius: 20,
            padding: 16,
            borderWidth: 1.5,
            borderColor: '#F59E0B',
            justifyContent: 'center',
            alignItems: 'center',
            elevation: 8,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 10,
          }}>
            <View style={{
              width: 54,
              height: 54,
              borderRadius: 27,
              backgroundColor: '#FEF3C7',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 10,
            }}>
              <Text style={{ fontSize: 28 }}>{categoryTerm.icon || '🏪'}</Text>
            </View>

            <View style={{
              backgroundColor: '#10B981',
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: 12,
              marginBottom: 8,
            }}>
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 }}>
                ✓ REACHED {categoryTerm.storeNameType.toUpperCase()}
              </Text>
            </View>

            <Text style={{ fontSize: 19, fontWeight: '900', color: isDarkMode ? '#F8FAFC' : '#0F172A', textAlign: 'center', marginBottom: 4 }} numberOfLines={1}>
              {storeName}
            </Text>

            <Text style={{ fontSize: 12.5, color: isDarkMode ? '#94A3B8' : '#64748B', textAlign: 'center', marginBottom: 12, paddingHorizontal: 8 }} numberOfLines={2}>
              📍 {activeDel?.pickupAddress || activeDel?.supplierBusinessAddress || activeDel?.restaurantAddress || 'Store Pickup Location'}
            </Text>

            {Boolean(itemsSummary) && (
              <View style={{
                backgroundColor: isDarkMode ? '#1E293B' : '#F1F5F9',
                borderRadius: 12,
                padding: 10,
                width: '100%',
                borderWidth: 1,
                borderColor: isDarkMode ? '#334155' : '#E2E8F0',
              }}>
                <Text style={{ fontSize: 10.5, fontWeight: '800', color: isDarkMode ? '#94A3B8' : '#64748B', marginBottom: 2 }}>
                  ITEMS TO COLLECT:
                </Text>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: isDarkMode ? '#F8FAFC' : '#0F172A' }} numberOfLines={2}>
                  📦 {itemsSummary}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ============================================================ */}
        {/* ACTIVE RIDE NAVIGATION BOTTOM CARD (FULL VISIBILITY - Tapping opens Full-Screen Details) */}
        {/* ============================================================ */}
        {Boolean(activeDel) && (
          <TouchableOpacity
            activeOpacity={0.92}
            onPress={() => navigation.navigate('LiveTracking', { ride: activeDel, isRider: true })}
            style={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              right: 12,
              backgroundColor: isDarkMode ? '#1E232D' : '#FFFFFF',
              borderRadius: 20,
              padding: 15,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.35,
              shadowRadius: 12,
              elevation: 12,
              borderWidth: 1.5,
              borderColor: isPickedUp ? '#10B981' : isAtStore ? '#F59E0B' : '#0066FF',
            }}
          >
            {/* Top Row: Order ID, Price & ETA */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{
                  backgroundColor: isPickedUp ? 'rgba(16, 185, 129, 0.15)' : isAtStore ? 'rgba(245, 158, 11, 0.15)' : 'rgba(0, 102, 255, 0.15)',
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  borderWidth: 1,
                  borderColor: isPickedUp ? '#10B981' : isAtStore ? '#F59E0B' : '#0066FF',
                }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: isPickedUp ? '#10B981' : isAtStore ? '#F59E0B' : '#0066FF' }} />
                  <Text style={{ color: isPickedUp ? '#10B981' : isAtStore ? '#F59E0B' : '#0066FF', fontWeight: '800', fontSize: 11 }}>
                    {isPickedUp ? 'GO TO CUSTOMER DROP LOCATION' : (isAtStore ? `AT ${categoryTerm.storeNameType.toUpperCase()}` : `GO TO ${categoryTerm.storeNameType.toUpperCase()}`)}
                  </Text>
                </View>
                <Text style={{ color: isDarkMode ? '#94A3B8' : '#64748B', fontSize: 12, fontWeight: '700' }}>
                  #{displayOrderId ? displayOrderId.slice(-6).toUpperCase() : 'ORDER'}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: isDarkMode ? '#F8FAFC' : '#0F172A', fontWeight: '900', fontSize: 15 }}>
                  ₹{orderPrice}
                </Text>
                {Boolean(activeRideDistanceEta) && !isAtStore && (
                  <Text style={{ color: '#0066FF', fontWeight: '800', fontSize: 12 }}>
                    ~{activeRideDistanceEta?.etaMinutes}m
                  </Text>
                )}
              </View>
            </View>

            {/* Target Location & Contact Row */}
            <View style={{
              backgroundColor: isDarkMode ? '#131924' : '#F1F5F9',
              borderRadius: 14,
              padding: 12,
              marginBottom: 12,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 }}>
                  <Text style={{ fontSize: 16 }}>{!isPickedUp ? (categoryTerm.icon || '🏪') : '👤'}</Text>
                  <Text style={{ color: isDarkMode ? '#F8FAFC' : '#0F172A', fontSize: 14, fontWeight: '800' }} numberOfLines={1}>
                    {!isPickedUp ? storeName : customerName}
                  </Text>
                </View>

                {/* Call Button */}
                {Boolean(!isPickedUp ? storePhone : customerPhone) && (
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#10B981',
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 10,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                    }}
                    onPress={() => Linking.openURL(`tel:${!isPickedUp ? storePhone : customerPhone}`).catch(() => {})}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>📞 Call</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={{ color: isDarkMode ? '#CBD5E1' : '#475569', fontSize: 12.5, lineHeight: 17 }} numberOfLines={2}>
                📍 {destAddress}
              </Text>

              {Boolean(itemsSummary) && (
                <Text style={{ color: isDarkMode ? '#94A3B8' : '#64748B', fontSize: 11.5, marginTop: 4 }} numberOfLines={1}>
                  📦 {itemsSummary}
                </Text>
              )}
            </View>

            {/* Action Buttons Row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: isPickedUp
                    ? (isAtCustomer ? '#10B981' : '#0066FF')
                    : (isAtStore ? '#F59E0B' : '#0066FF'),
                  paddingVertical: 13,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 6,
                  elevation: 2,
                }}
                onPress={handleAdvanceActiveRideStage}
                disabled={isAdvancingRideStage}
                activeOpacity={0.85}
              >
                {isAdvancingRideStage ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>
                    {!isPickedUp
                      ? (!isAtStore ? `✓ REACHED ${categoryTerm.pickupLabel.toUpperCase()}` : `🏪 GO TO ${categoryTerm.storeNameType.toUpperCase()}`)
                      : (!isAtCustomer ? '📍 REACHED CUSTOMER' : '🏁 COMPLETE DELIVERY')}
                  </Text>
                )}
              </TouchableOpacity>

              {/* View Full Trip / Live Tracking */}
              <TouchableOpacity
                style={{
                  paddingHorizontal: 12,
                  height: 48,
                  borderRadius: 14,
                  backgroundColor: isDarkMode ? '#334155' : '#E2E8F0',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => navigation.navigate('LiveTracking', { ride: activeDel, isRider: true })}
                activeOpacity={0.85}
              >
                <Text style={{ color: isDarkMode ? '#F8FAFC' : '#0F172A', fontWeight: '700', fontSize: 12 }}>Details</Text>
              </TouchableOpacity>

              {/* Maps Navigation Icon */}
              {isDestCoordsValid && (
                <TouchableOpacity
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    backgroundColor: '#0066FF',
                    alignItems: 'center',
                    justifyContent: 'center',
                    elevation: 4,
                  }}
                  onPress={() => {
                    const url = Platform.select({
                      ios: `maps:0,0?q=${targetDestLat},${targetDestLon}`,
                      android: `google.navigation:q=${targetDestLat},${targetDestLon}`,
                    }) || `https://www.google.com/maps/dir/?api=1&destination=${targetDestLat},${targetDestLon}&travelmode=driving`;
                    Linking.openURL(url).catch(() => {});
                  }}
                  activeOpacity={0.85}
                >
                  <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <Path d="M3 11L22 2L13 21L11 13L3 11Z" fill="#FFFFFF" />
                  </Svg>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        )}

        {/* GPS Unavailable / Honest Status Overlay Banner */}
        {!isGpsAvailable && (
          <View style={{
            position: 'absolute',
            top: 20,
            left: 14,
            right: 14,
            backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF',
            borderRadius: 16,
            padding: 16,
            borderWidth: 1.5,
            borderColor: gpsStatus === 'locating' ? '#0066FF' : '#EF4444',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 8,
          }}>
            <Text style={{ fontSize: 26, marginBottom: 4 }}>{gpsStatus === 'locating' ? '🛰️' : '📍'}</Text>
            <Text style={{ color: isDarkMode ? '#F8FAFC' : '#0F172A', fontSize: 15, fontWeight: '800', marginBottom: 3, textAlign: 'center' }}>
              {gpsStatus === 'permission_denied'
                ? 'Location permission required.'
                : gpsStatus === 'gps_unavailable'
                ? 'GPS unavailable.'
                : gpsStatus === 'fetch_failed'
                ? 'Unable to fetch current location. Retry.'
                : 'Locating your position...'}
            </Text>
            <Text style={{ color: isDarkMode ? '#94A3B8' : '#64748B', fontSize: 12, textAlign: 'center', marginBottom: 12, paddingHorizontal: 12 }}>
              {gpsStatus === 'permission_denied'
                ? 'Grant location permission to show your real-time map position and accept nearby orders.'
                : gpsStatus === 'gps_unavailable'
                ? 'Please turn on device Location / GPS services to go online and track your real position.'
                : gpsStatus === 'fetch_failed'
                ? 'Could not lock onto hardware GPS signal. Move to an open sky area and retry.'
                : 'Acquiring accurate device GPS signal...'}
            </Text>
            {gpsStatus === 'locating' ? (
              <ActivityIndicator size="small" color="#0066FF" />
            ) : (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {gpsStatus === 'permission_denied' && (
                  <TouchableOpacity
                    style={{ backgroundColor: '#10B981', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10 }}
                    onPress={async () => {
                      const ok = await requestLocationPermission();
                      if (!ok) {
                        Linking.openSettings().catch(() => {});
                      } else {
                        updateRiderLocation();
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 12.5 }}>Grant Permission</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={{ backgroundColor: '#0066FF', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 10 }}
                  onPress={updateRiderLocation}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 12.5 }}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ============================================================ */}
        {/* REAL-TIME ONLINE STORES DISCOVERY CARD (ALL CATEGORIES, WHEN NO ACTIVE RIDE) */}
        {/* ============================================================ */}
        {activeDeliveries.length === 0 && !incomingRequest && (
          <View style={{
            position: 'absolute',
            bottom: 24,
            left: 14,
            right: 14,
            backgroundColor: '#1E232D',
            borderRadius: 18,
            padding: 14,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.35,
            shadowRadius: 10,
            elevation: 8,
            borderWidth: 1,
            borderColor: '#2E384D',
          }}>
            {/* Top Status Row: Live Online Stores Count + Refresh */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: nearbyHotspots.length > 0 ? 10 : 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: nearbyHotspots.length > 0 ? '#10B981' : '#94A3B8' }} />
                <Text style={{ color: '#E2E8F0', fontSize: 12, fontWeight: '800' }}>
                  {nearbyHotspots.length} Online {nearbyHotspots.length === 1 ? 'Store' : 'Stores'} Available
                </Text>
                {!isOnline && (
                  <View style={{ backgroundColor: 'rgba(245, 158, 11, 0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                    <Text style={{ color: '#FBBF24', fontSize: 9.5, fontWeight: '800' }}>GO ONLINE TO ACCEPT</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity
                onPress={() => fetchNearbyHotspots()}
                style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: '#2A3241' }}
                activeOpacity={0.75}
              >
                <Text style={{ color: '#93C5FD', fontSize: 11, fontWeight: '700' }}>
                  {loadingHotspots ? 'Checking...' : '↻ Check'}
                </Text>
              </TouchableOpacity>
            </View>

            {discoveryRouteError && nearbyHotspots.length > 0 && (
              <View style={{ backgroundColor: 'rgba(245, 158, 11, 0.14)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 8 }}>
                <Text style={{ color: '#FCD34D', fontSize: 10.5, fontWeight: '600' }}>
                  ⚠️ {discoveryRouteError}
                </Text>
              </View>
            )}

            {nearbyHotspots.length === 0 ? (
              <View style={{ paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 24, marginBottom: 4 }}>📍</Text>
                <Text style={{ color: '#F8FAFC', fontSize: 13.5, fontWeight: '800', textAlign: 'center' }}>
                  Store not open in your location
                </Text>
                <Text style={{ color: '#94A3B8', fontSize: 11, textAlign: 'center', marginTop: 2 }}>
                  When a restaurant or store opens nearby, it will appear here automatically.
                </Text>
              </View>
            ) : (
              <>
                {/* Horizontal Scrollable Online Stores Switcher (deduplicated, all categories) */}
                {nearbyHotspots.length > 1 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, marginBottom: 12 }}
                  >
                    {nearbyHotspots.map((h: any) => {
                      const sId = String(h.id || h.restaurantId);
                      const isCur = sId === String(selectedHotspot?.id || selectedHotspot?.restaurantId || nearbyHotspots[0]?.id);
                      return (
                        <TouchableOpacity
                          key={sId}
                          style={{
                            backgroundColor: isCur ? '#0066FF' : '#2A3241',
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 12,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 5,
                            borderWidth: isCur ? 1 : 0,
                            borderColor: '#60A5FA',
                          }}
                          onPress={() => {
                            setSelectedHotspot(h);
                            selectedHotspotRef.current = h;
                            if (mapWebViewRef.current) {
                              mapWebViewRef.current.injectJavaScript(
                                "if (window.selectStoreHotspot) { window.selectStoreHotspot('" + sId.replace(/'/g, '') + "', false); } true;"
                              );
                            }
                            if (syncDiscoveryRoutesRef.current) {
                              syncDiscoveryRoutesRef.current(nearbyHotspots, h, null, true);
                            }
                          }}
                          activeOpacity={0.8}
                        >
                          {Boolean(h.hasPendingOrder || h.hasGuaranteedOrder) && <Text style={{ fontSize: 11 }}>🔥</Text>}
                          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: isCur ? '800' : '600' }} numberOfLines={1}>
                            {h.name}
                          </Text>
                          <View style={{ backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5 }}>
                            <Text style={{ color: '#E2E8F0', fontSize: 9.5, fontWeight: '700' }}>
                              {h.categoryName || h.category || 'Store'}
                            </Text>
                          </View>
                          {h.distanceKm !== null && h.distanceKm !== undefined && (
                            <Text style={{ color: isCur ? '#E0E7FF' : '#94A3B8', fontSize: 11 }}>
                              • {h.distanceKm} km
                            </Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}

                {/* Selected Online Store Main Details Row */}
                {(() => {
                  const cur = selectedHotspot || nearbyHotspots[0];
                  if (!cur) return null;
                  const hasGuaranteed = Boolean(cur.hasPendingOrder || cur.hasGuaranteedOrder);
                  const shownDistKm = (hotspotRouteInfo && String(cur.id) === String(selectedHotspot?.id || nearbyHotspots[0]?.id))
                    ? hotspotRouteInfo.distanceKm
                    : cur.distanceKm;
                  const shownEta = (hotspotRouteInfo && String(cur.id) === String(selectedHotspot?.id || nearbyHotspots[0]?.id))
                    ? hotspotRouteInfo.etaMinutes
                    : cur.etaMinutes;

                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      {/* Left Column: Name, Category, Address, Distance */}
                      <View style={{ flex: 1, paddingRight: 14 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 3 }}>
                          <Text style={{ color: '#FFFFFF', fontSize: 16.5, fontWeight: '800' }} numberOfLines={1}>
                            {cur.name}
                          </Text>
                          <View style={{ backgroundColor: 'rgba(56, 189, 248, 0.18)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                            <Text style={{ color: '#38BDF8', fontSize: 9.5, fontWeight: '800' }}>
                              {cur.categoryName || cur.category || 'Store'}
                            </Text>
                          </View>
                          {hasGuaranteed && (
                            <View style={{ backgroundColor: '#EF4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                              <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '800' }}>🔥 Pending Order</Text>
                            </View>
                          )}
                        </View>

                        <Text style={{ color: '#94A3B8', fontSize: 12, lineHeight: 16, marginBottom: 5 }} numberOfLines={2}>
                          {cur.address || 'Verified Store Location'}
                        </Text>

                        <Text style={{ color: '#FFFFFF', fontSize: 13.5, fontWeight: '800' }}>
                          {shownDistKm !== null && shownDistKm !== undefined ? `${shownDistKm} km` : 'Distance synced on GPS'}
                          {shownEta ? ` • ~${shownEta} mins` : ''}
                        </Text>
                      </View>

                      {/* Right Column: Circular Blue Navigation Action Button */}
                      <TouchableOpacity
                        style={{ alignItems: 'center', justifyContent: 'center' }}
                        onPress={() => {
                          if (cur.latitude && cur.longitude) {
                            const url = Platform.select({
                              ios: "maps:0,0?q=" + cur.latitude + "," + cur.longitude + "(" + encodeURIComponent(cur.name) + ")",
                              android: "google.navigation:q=" + cur.latitude + "," + cur.longitude,
                            }) || ("https://www.openstreetmap.org/directions?to=" + cur.latitude + "%2C" + cur.longitude);

                            Linking.openURL(url).catch(() => {
                              Linking.openURL("https://www.openstreetmap.org/directions?to=" + cur.latitude + "%2C" + cur.longitude);
                            });
                          }
                        }}
                        activeOpacity={0.8}
                      >
                        <View style={{
                          width: 48,
                          height: 48,
                          borderRadius: 24,
                          backgroundColor: '#5C93FF',
                          alignItems: 'center',
                          justifyContent: 'center',
                          shadowColor: '#0066FF',
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.4,
                          shadowRadius: 6,
                          elevation: 5,
                        }}>
                          <Svg width="21" height="21" viewBox="0 0 24 24" fill="none">
                            <Path d="M3 11L22 2L13 21L11 13L3 11Z" fill="#FFFFFF" />
                          </Svg>
                        </View>
                        <Text style={{ color: '#5C93FF', fontSize: 11, fontWeight: '700', marginTop: 4 }}>
                          {t('map')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })()}
              </>
            )}
          </View>
        )}

        {/* Floating Real Geolocation Recenter Button (Pinned to Bottom-Right of Map — resumes auto-follow) */}
        <TouchableOpacity
          style={[
            styles.floatingGpsBtn,
            {
              bottom: (activeDeliveries.length === 0 && !incomingRequest) ? (nearbyHotspots.length > 0 ? 225 : 135) : 36,
              backgroundColor: isAutoFollowPaused ? '#0066FF' : (isDarkMode ? '#27272A' : '#FFFFFF'),
              borderColor: isAutoFollowPaused ? '#60A5FA' : (isDarkMode ? 'rgba(255,255,255,0.15)' : '#CBD5E1')
            }
          ]}
          onPress={recenterMap}
          activeOpacity={0.8}
        >
          <Svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <Circle cx="12" cy="12" r="7" stroke={isAutoFollowPaused ? '#FFFFFF' : (isDarkMode ? '#FFFFFF' : '#0F172A')} strokeWidth="2.2" />
            <Line x1="12" y1="1" x2="12" y2="4.5" stroke={isAutoFollowPaused ? '#FFFFFF' : (isDarkMode ? '#FFFFFF' : '#0F172A')} strokeWidth="2.2" strokeLinecap="round" />
            <Line x1="12" y1="19.5" x2="12" y2="23" stroke={isAutoFollowPaused ? '#FFFFFF' : (isDarkMode ? '#FFFFFF' : '#0F172A')} strokeWidth="2.2" strokeLinecap="round" />
            <Line x1="1" y1="12" x2="4.5" y2="12" stroke={isAutoFollowPaused ? '#FFFFFF' : (isDarkMode ? '#FFFFFF' : '#0F172A')} strokeWidth="2.2" strokeLinecap="round" />
            <Line x1="19.5" y1="12" x2="23" y2="12" stroke={isAutoFollowPaused ? '#FFFFFF' : (isDarkMode ? '#FFFFFF' : '#0F172A')} strokeWidth="2.2" strokeLinecap="round" />
            <Circle cx="12" cy="12" r="3.2" fill={isAutoFollowPaused ? '#FFFFFF' : (isDarkMode ? '#FFFFFF' : '#0F172A')} />
          </Svg>
        </TouchableOpacity>
      </View>
    );
  };

  // ════════════════════════════════════════════════════════════════════════════
  // ── Dynamic Date Helpers ──
  const formatOrderTime = (dateVal: any) => {
    if (!dateVal) return 'Recently';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return 'Recently';
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const isYesterday = d.toDateString() === yesterday.toDateString();
      
      const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
      if (isToday) return `Today, ${timeStr}`;
      if (isYesterday) return `Yesterday, ${timeStr}`;
      return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${timeStr}`;
    } catch (_) {
      return 'Recently';
    }
  };

  const getDynamicEarningsDateRange = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() + mondayOffset);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    return `Earnings: ${startOfWeek.toLocaleDateString('en-IN', options)} - ${endOfWeek.toLocaleDateString('en-IN', options)}`;
  };

  // ════════════════════════════════════════════════════════════════════════════
  // 2. ORDERS TAB (Real-Time All Orders: Active, Completed, Cancelled + Calendar Filter)
  // ════════════════════════════════════════════════════════════════════════════
  const renderOrdersTab = () => {
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const yest = new Date(now);
    yest.setDate(now.getDate() - 1);
    const yesterdayKey = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`;

    // Base deliveries list
    const baseList = allDeliveries.length > 0
      ? allDeliveries
      : [...activeDeliveries, ...completedDeliveries, ...cancelledDeliveries];

    // Filter by Selected Date from Calendar / Pills
    const dateFilteredList = baseList.filter((del: any) => {
      if (orderDateFilter === 'all') return true;
      const dKey = getOrderDateKey(del);
      if (orderDateFilter === 'today') return dKey === todayKey;
      if (orderDateFilter === 'yesterday') return dKey === yesterdayKey;
      if (orderDateFilter === 'custom') return dKey === selectedCalendarDate;
      return true;
    });

    const isDone = (b: any) => {
      const st = (b.status || '').toUpperCase();
      const dst = (b.deliveryStatus || '').toUpperCase();
      const rst = (b.riderStatus || '').toUpperCase();
      return st === 'COMPLETED' || st === 'DELIVERED' || st === 'SERVICE_COMPLETED' || st === 'DELIVERED_SUCCESSFULLY' || st === 'DONE' ||
             dst === 'COMPLETED' || dst === 'DELIVERED' ||
             rst === 'DELIVERED' || rst === 'COMPLETED';
    };

    const isCanc = (b: any) => {
      const st = (b.status || '').toUpperCase();
      const dst = (b.deliveryStatus || '').toUpperCase();
      const rst = (b.riderStatus || '').toUpperCase();
      return st === 'CANCELLED' || st === 'RESTAURANT_DECLINED' || st.includes('CANCEL') ||
             dst === 'CANCELLED' || dst.includes('CANCEL') ||
             rst === 'CANCELLED' || rst.includes('CANCEL');
    };

    const dateActives = dateFilteredList.filter((b) => !isDone(b) && !isCanc(b));
    const dateCompleteds = dateFilteredList.filter((b) => isDone(b));
    const dateCancelleds = dateFilteredList.filter((b) => isCanc(b));

    let displayedOrders: any[] = [];
    if (orderFilter === 'active') {
      displayedOrders = dateActives;
    } else if (orderFilter === 'completed') {
      displayedOrders = dateCompleteds;
    } else if (orderFilter === 'cancelled') {
      displayedOrders = dateCancelleds;
    } else {
      displayedOrders = dateFilteredList;
    }

    const totalInDate = dateFilteredList.length;
    const dateEarningsTotal = dateCompleteds.reduce((sum, b) => {
      return sum + Number(b.riderEarnings || b.riderEarning || b.estimatedEarning || b.deliveryFee || b.totalTripPay || b.totalAmount || 0);
    }, 0);

    const getSelectedDateLabel = () => {
      if (orderDateFilter === 'all') return t('allDates');
      if (orderDateFilter === 'today') {
        return `${t('today')} • ${now.toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' })}`;
      }
      if (orderDateFilter === 'yesterday') {
        return `${t('yesterday')} • ${yest.toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' })}`;
      }
      if (selectedCalendarDate) {
        try {
          const [y, m, d] = selectedCalendarDate.split('-').map(Number);
          const dt = new Date(y, m - 1, d);
          return dt.toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        } catch (_) {
          return selectedCalendarDate;
        }
      }
      return t('pickDate');
    };

    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: isDarkMode ? '#0B0F19' : '#F8FAFC' }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 14, paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0066FF']} tintColor="#0066FF" />}
      >
        {/* ── Screen Heading & Calendar Button ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <View>
            <Text style={[styles.screenHeading, { color: isDarkMode ? '#F8FAFC' : '#0F172A', marginBottom: 2 }]}>
              📦 Orders & Trips History
            </Text>
            <Text style={{ fontSize: 12, color: isDarkMode ? '#94A3B8' : '#64748B', fontWeight: '500' }}>
              {getSelectedDateLabel()}
            </Text>
          </View>

          {/* Open Interactive Calendar Button */}
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#0066FF',
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 12,
              gap: 5,
              shadowColor: '#0066FF',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.3,
              shadowRadius: 4,
              elevation: 3,
            }}
            onPress={() => setShowCalendarModal(true)}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 14 }}>🗓️</Text>
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>Calendar</Text>
          </TouchableOpacity>
        </View>

        {/* ── Date Quick Filter Pills ── */}
        <View style={{ marginBottom: 12 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
            {[
              { key: 'all', label: t('allDates'), icon: '📅' },
              { key: 'today', label: t('today'), icon: '⚡' },
              { key: 'yesterday', label: t('yesterday'), icon: '🕒' },
              { key: 'custom', label: orderDateFilter === 'custom' && selectedCalendarDate ? selectedCalendarDate : `${t('pickDate')} 🗓️`, icon: '🗓️' },
            ].map((dTab) => {
              const isSelected = orderDateFilter === dTab.key;
              return (
                <TouchableOpacity
                  key={dTab.key}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: isSelected
                      ? '#0066FF'
                      : isDarkMode
                      ? '#1E293B'
                      : '#FFFFFF',
                    borderColor: isSelected
                      ? '#0066FF'
                      : isDarkMode
                      ? '#334155'
                      : '#E2E8F0',
                    borderWidth: 1,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 20,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.05,
                    shadowRadius: 2,
                    elevation: 1,
                  }}
                  onPress={() => {
                    if (dTab.key === 'custom') {
                      setShowCalendarModal(true);
                      setOrderDateFilter('custom');
                    } else {
                      setOrderDateFilter(dTab.key as any);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 12, marginRight: 4 }}>{dTab.icon}</Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: isSelected ? '800' : '600',
                      color: isSelected
                        ? '#FFFFFF'
                        : isDarkMode
                        ? '#F8FAFC'
                        : '#0F172A',
                    }}
                  >
                    {dTab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Date Summary Card (Trips & Earnings for Selected Date) ── */}
        <View
          style={{
            backgroundColor: isDarkMode ? '#1E293B' : '#EFF6FF',
            borderColor: isDarkMode ? '#334155' : '#BFDBFE',
            borderWidth: 1,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 10,
            marginBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View>
            <Text style={{ fontSize: 11, color: isDarkMode ? '#94A3B8' : '#1E40AF', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Date Summary • {getSelectedDateLabel()}
            </Text>
            <Text style={{ fontSize: 15, fontWeight: '900', color: isDarkMode ? '#F8FAFC' : '#0F172A', marginTop: 1 }}>
              {totalInDate} Orders ({dateCompleteds.length} Delivered)
            </Text>
          </View>

          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 11, color: isDarkMode ? '#94A3B8' : '#1E40AF', fontWeight: '700' }}>
              Day Earnings
            </Text>
            <Text style={{ fontSize: 16, fontWeight: '900', color: '#16A34A', marginTop: 1 }}>
              ₹{dateEarningsTotal.toFixed(0)}
            </Text>
          </View>
        </View>

        {/* ── Order Status Filter Tabs ── */}
        <View style={styles.orderFilterScrollWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.orderFilterScrollContent}>
            {[
              { key: 'all', label: t('allOrders'), count: totalInDate, icon: '📋' },
              { key: 'active', label: t('activeOrder'), count: dateActives.length, icon: '🛵' },
              { key: 'completed', label: t('delivered'), count: dateCompleteds.length, icon: '✓' },
              { key: 'cancelled', label: t('cancelled'), count: dateCancelleds.length, icon: '✕' },
            ].map((tab) => {
              const isSelected = orderFilter === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[
                    styles.orderFilterChip,
                    {
                      backgroundColor: isSelected
                        ? '#0066FF'
                        : isDarkMode
                        ? '#1E293B'
                        : '#FFFFFF',
                      borderColor: isSelected
                        ? '#0066FF'
                        : isDarkMode
                        ? '#334155'
                        : '#E2E8F0',
                    },
                  ]}
                  onPress={() => setOrderFilter(tab.key as any)}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13, marginRight: 5 }}>{tab.icon}</Text>
                  <Text
                    style={[
                      styles.orderFilterChipText,
                      {
                        color: isSelected
                          ? '#FFFFFF'
                          : isDarkMode
                          ? '#F8FAFC'
                          : '#0F172A',
                        fontWeight: isSelected ? '800' : '600',
                      },
                    ]}
                  >
                    {tab.label}
                  </Text>
                  <View
                    style={[
                      styles.orderFilterBadge,
                      {
                        backgroundColor: isSelected
                          ? 'rgba(255,255,255,0.25)'
                          : isDarkMode
                          ? '#334155'
                          : '#F1F5F9',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.orderFilterBadgeText,
                        {
                          color: isSelected
                            ? '#FFFFFF'
                            : isDarkMode
                            ? '#94A3B8'
                            : '#64748B',
                        },
                      ]}
                    >
                      {tab.count}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Orders List ── */}
        {loadingDeliveries && allDeliveries.length === 0 ? (
          <OrderHistorySkeletonLoader isDark={isDarkMode} message="Syncing delivery history..." />
        ) : displayedOrders.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF', borderColor: isDarkMode ? '#334155' : '#E2E8F0', borderWidth: 1, marginTop: 10 }]}>
            <Text style={{ fontSize: 38, marginBottom: 8 }}>
              {orderFilter === 'active' ? '🛵' : orderFilter === 'cancelled' ? '🚫' : '🗓️'}
            </Text>
            <Text style={{ color: isDarkMode ? '#F8FAFC' : '#0F172A', fontWeight: '800', fontSize: 16 }}>
              {orderDateFilter !== 'all'
                ? `No Orders on ${getSelectedDateLabel()}`
                : orderFilter === 'active'
                ? 'No Active Orders'
                : orderFilter === 'cancelled'
                ? 'No Cancelled Orders'
                : orderFilter === 'completed'
                ? 'No Delivered Orders'
                : 'No Orders Found'}
            </Text>
            <Text style={{ color: isDarkMode ? '#94A3B8' : '#64748B', fontSize: 12.5, marginTop: 4, textAlign: 'center', paddingHorizontal: 20 }}>
              {orderDateFilter !== 'all'
                ? 'Tap below or choose another date from the Calendar to view other trips.'
                : 'All your orders and trip status update live in real-time.'}
            </Text>

            {orderDateFilter !== 'all' && (
              <TouchableOpacity
                style={{
                  marginTop: 12,
                  backgroundColor: '#0066FF',
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 20,
                }}
                onPress={() => setOrderDateFilter('all')}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>View All Dates 📅</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          displayedOrders.map((del: any) => {
            const isCompleted = del.status === 'COMPLETED' || del.status === 'DELIVERED' || del.deliveryStatus === 'COMPLETED' || del.deliveryStatus === 'DELIVERED';
            const isCancelled = del.status === 'CANCELLED' || del.deliveryStatus === 'CANCELLED' || (del.status || '').includes('CANCEL') || del.status === 'RESTAURANT_DECLINED';
            const isActive = !isCompleted && !isCancelled;
            
            const bId = (del.bookingId || del._id || '').toString().slice(-6).toUpperCase();
            const storeName = del.restaurantName || del.storeName || (del.categoryName ? `${del.categoryName} Store` : 'Partner Store');
            const custName = del.customerName || del.userName || 'Customer';
            const pickupAddr = del.pickupAddress || del.serviceAddress || 'Pickup Location';
            const dropAddr = del.deliveryAddress || del.dropoffAddress || 'Delivery Address';
            const amount = Number(del.riderEarning || del.totalTripPay || del.totalAmount || del.fare || 0);
            const orderDateStr = formatOrderTime(del.createdAt || del.updatedAt);
            
            return (
              <View
                key={del._id || del.bookingId}
                style={[
                  styles.realOrderCard,
                  {
                    backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF',
                    borderColor: isActive ? '#0066FF' : isCancelled ? '#EF4444' : isDarkMode ? '#334155' : '#E2E8F0',
                    borderWidth: isActive ? 1.5 : 1,
                  },
                ]}
              >
                {/* Top Header: ID, Date, Badge */}
                <View style={styles.realOrderHeaderRow}>
                  <View>
                    <Text style={[styles.realOrderIdText, { color: isDarkMode ? '#F8FAFC' : '#0F172A' }]}>
                      #{bId}
                    </Text>
                    <Text style={{ color: isDarkMode ? '#94A3B8' : '#64748B', fontSize: 11, marginTop: 2 }}>
                      🕒 {orderDateStr}
                    </Text>
                  </View>
                  
                  <View
                    style={[
                      styles.realOrderStatusBadge,
                      {
                        backgroundColor: isCompleted
                          ? 'rgba(22, 163, 74, 0.15)'
                          : isCancelled
                          ? 'rgba(220, 38, 38, 0.15)'
                          : 'rgba(0, 102, 255, 0.15)',
                        borderColor: isCompleted ? '#16A34A' : isCancelled ? '#DC2626' : '#0066FF',
                        borderWidth: 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.realOrderStatusBadgeText,
                        { color: isCompleted ? '#16A34A' : isCancelled ? '#DC2626' : '#0066FF' },
                      ]}
                    >
                      {isCompleted ? `✓ ${t('delivered')}` : isCancelled ? `✕ ${t('cancelled')}` : `🛵 ${t('inTransit')}`}
                    </Text>
                  </View>
                </View>

                {/* Store & Customer */}
                <View style={styles.realOrderMetaBox}>
                  <Text style={[styles.realOrderStoreName, { color: isDarkMode ? '#F8FAFC' : '#1E293B' }]} numberOfLines={1}>
                    🏪 {storeName}
                  </Text>
                  <Text style={[styles.realOrderCustName, { color: isDarkMode ? '#94A3B8' : '#64748B' }]} numberOfLines={1}>
                    👤 {custName}
                  </Text>
                </View>

                {/* Pickup & Drop Addresses */}
                <View style={styles.realOrderRouteBox}>
                  <View style={styles.realOrderRouteRow}>
                    <Text style={{ fontSize: 12, marginRight: 6 }}>🟢</Text>
                    <Text style={[styles.realOrderRouteText, { color: isDarkMode ? '#CBD5E1' : '#475569' }]} numberOfLines={1}>
                      {pickupAddr}
                    </Text>
                  </View>
                  <View style={styles.realOrderRouteRow}>
                    <Text style={{ fontSize: 12, marginRight: 6 }}>📍</Text>
                    <Text style={[styles.realOrderRouteText, { color: isDarkMode ? '#CBD5E1' : '#475569' }]} numberOfLines={1}>
                      {dropAddr}
                    </Text>
                  </View>
                </View>

                {/* Real Booked Items */}
                {(() => {
                  const delItems = getParsedItems(del);
                  if (delItems.length === 0) return null;
                  return (
                    <View style={{ backgroundColor: isDarkMode ? '#0F172A' : '#F8FAFC', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginHorizontal: 12, marginBottom: 8, borderWidth: 1, borderColor: isDarkMode ? '#334155' : '#F1F5F9' }}>
                      <Text style={{ fontSize: 10.5, fontWeight: '800', color: isDarkMode ? '#94A3B8' : '#64748B', textTransform: 'uppercase', marginBottom: 2 }}>
                        📦 Items ({delItems.length}):
                      </Text>
                      {delItems.map((it: any, iIdx: number) => (
                        <Text key={iIdx} style={{ fontSize: 12, fontWeight: '700', color: isDarkMode ? '#F8FAFC' : '#1E293B', marginTop: 1 }}>
                          • {it.quantity || 1}x {it.name} {it.price > 0 ? `(₹${it.price})` : ''}
                        </Text>
                      ))}
                    </View>
                  );
                })()}

                {/* Cancel Reason Banner if cancelled */}
                {isCancelled && (
                  <View style={styles.realOrderCancelReasonBox}>
                    <Text style={styles.realOrderCancelReasonText} numberOfLines={2}>
                      ⚠️ Cancelled by: {String(del.cancelledBy || 'System').toUpperCase()} • Reason: {del.cancellationReason || del.reason || 'Order was cancelled'}
                    </Text>
                  </View>
                )}

                {/* Bottom Row: Amount & Action */}
                <View style={[styles.realOrderBottomRow, { borderTopColor: isDarkMode ? '#334155' : '#F1F5F9' }]}>
                  <View>
                    <Text style={{ color: isDarkMode ? '#94A3B8' : '#64748B', fontSize: 11, fontWeight: '600' }}>
                      {isCancelled ? t('orderFare') : t('riderEarnings')}
                    </Text>
                    <Text style={[styles.realOrderAmountText, { color: isCancelled ? '#94A3B8' : '#16A34A' }]}>
                      {isCancelled ? '₹0' : `₹${amount.toFixed(0)}`}
                    </Text>
                  </View>

                  {isActive && (() => {
                    const st = (del.status || '').toUpperCase();
                    const rst = (del.riderStatus || '').toUpperCase();
                    const isAtCustomer = st === 'REACHED_CUSTOMER' || rst === 'REACHED_CUSTOMER';
                    const isOutForDelivery = st === 'OUT_FOR_DELIVERY' || st === 'FOOD_PICKED_UP' || st === 'PICKED_UP' || rst === 'OUT_FOR_DELIVERY' || rst === 'FOOD_PICKED_UP' || rst === 'PICKED_UP';
                    const isAtStore = st === 'ARRIVED_AT_STORE' || rst === 'ARRIVED_AT_STORE' || rst === 'AT_RESTAURANT' || st === 'REACHED_RESTAURANT';
                    const btnLabel = isAtCustomer
                      ? 'Drop Off Order ➔'
                      : isOutForDelivery
                      ? 'Deliver Order ➔'
                      : isAtStore
                      ? 'Go to Supplier ➔'
                      : 'Go to Pickup ➔';
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderRadius: 18,
                            backgroundColor: '#FEE2E2',
                            borderWidth: 1,
                            borderColor: '#EF4444',
                          }}
                          onPress={() => handleOpenRiderCancelModal(del)}
                          activeOpacity={0.8}
                        >
                          <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700' }}>✕ Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.realOrderTrackBtn}
                          onPress={() => navigation.navigate('LiveTracking', { ride: del, isRider: true })}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.realOrderTrackBtnText}>{btnLabel}</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })()}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    );
  };

  // ════════════════════════════════════════════════════════════════════════════
  // 3. POCKET TAB (Real Interactive Calendar, Date-Filtered Earnings & Pocket)
  // ════════════════════════════════════════════════════════════════════════════
  const getOrderDateKey = (order: any): string => {
    try {
      const raw = order.createdAt || order.updatedAt || order.date || order.bookingDate || order.completedAt;
      if (raw) {
        const dt = new Date(raw);
        if (!isNaN(dt.getTime())) {
          const y = dt.getFullYear();
          const m = String(dt.getMonth() + 1).padStart(2, '0');
          const d = String(dt.getDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        }
      }
    } catch (_) {}
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  // Pre-calculate earnings and trips map by date for all completed deliveries
  const dateOrdersMap = useMemo(() => {
    const map: Record<string, { totalEarnings: number; count: number; orders: any[] }> = {};

    completedDeliveries.forEach((del) => {
      if (isCancelledDeliveryOrder(del)) return;
      const dKey = getOrderDateKey(del);
      const earning = Number(del.riderEarnings || del.riderEarning || del.estimatedEarning || del.deliveryFee || del.totalTripPay || del.totalAmount || 0);
      if (earning <= 0) return;
      if (!map[dKey]) {
        map[dKey] = { totalEarnings: 0, count: 0, orders: [] };
      }
      map[dKey].totalEarnings += earning;
      map[dKey].count += 1;
      map[dKey].orders.push(del);
    });

    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    if (!map[todayKey] && (weeklyEarnings > 0 || todayTrips > 0)) {
      map[todayKey] = {
        totalEarnings: weeklyEarnings || 0,
        count: todayTrips || (weeklyEarnings > 0 ? 1 : 0),
        orders: completedDeliveries.length > 0 ? completedDeliveries : [],
      };
    }

    return map;
  }, [completedDeliveries, weeklyEarnings, todayTrips]);

  // Dynamic calculation of stats for the selected date / quick filter
  const calendarStats = useMemo(() => {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    if (calendarQuickFilter === 'today') {
      const data = dateOrdersMap[todayKey] || { totalEarnings: weeklyEarnings || 0, count: todayTrips || 0, orders: completedDeliveries };
      const earned = data.totalEarnings || weeklyEarnings || 0;
      return {
        label: `Today • ${today.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}`,
        totalEarnings: earned,
        tripsCount: data.count || todayTrips || (earned > 0 ? 1 : 0),
        orders: data.orders || [],
        basePay: Math.round(earned * 0.8),
        surgePay: Math.round(earned * 0.2),
      };
    }

    if (calendarQuickFilter === 'yesterday') {
      const data = dateOrdersMap[yesterdayKey] || { totalEarnings: 0, count: 0, orders: [] };
      return {
        label: `Yesterday • ${yesterday.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}`,
        totalEarnings: data.totalEarnings,
        tripsCount: data.count,
        orders: data.orders,
        basePay: Math.round(data.totalEarnings * 0.8),
        surgePay: Math.round(data.totalEarnings * 0.2),
      };
    }

    if (calendarQuickFilter === 'week') {
      let sum = 0;
      let count = 0;
      const ordersList: any[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (dateOrdersMap[k]) {
          sum += dateOrdersMap[k].totalEarnings;
          count += dateOrdersMap[k].count;
          ordersList.push(...dateOrdersMap[k].orders);
        }
      }
      if (sum === 0 && weeklyEarnings > 0) sum = weeklyEarnings;
      if (count === 0 && todayTrips > 0) count = todayTrips;
      return {
        label: 'This Week Earnings',
        totalEarnings: sum,
        tripsCount: count,
        orders: ordersList.length > 0 ? ordersList : completedDeliveries,
        basePay: Math.round(sum * 0.8),
        surgePay: Math.round(sum * 0.2),
      };
    }

    if (calendarQuickFilter === 'month') {
      let sum = 0;
      let count = 0;
      const ordersList: any[] = [];
      const curMonth = today.getMonth();
      const curYear = today.getFullYear();
      Object.keys(dateOrdersMap).forEach((k) => {
        const [y, m] = k.split('-').map(Number);
        if (y === curYear && m === curMonth + 1) {
          sum += dateOrdersMap[k].totalEarnings;
          count += dateOrdersMap[k].count;
          ordersList.push(...dateOrdersMap[k].orders);
        }
      });
      if (sum === 0 && weeklyEarnings > 0) sum = weeklyEarnings;
      if (count === 0 && todayTrips > 0) count = todayTrips;
      return {
        label: `${today.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`,
        totalEarnings: sum,
        tripsCount: count,
        orders: ordersList.length > 0 ? ordersList : completedDeliveries,
        basePay: Math.round(sum * 0.8),
        surgePay: Math.round(sum * 0.2),
      };
    }

    // Custom selected calendar date
    const dParts = selectedCalendarDate.split('-').map(Number);
    const selDateObj = new Date(dParts[0], dParts[1] - 1, dParts[2]);
    const data = dateOrdersMap[selectedCalendarDate] || { totalEarnings: 0, count: 0, orders: [] };
    return {
      label: selDateObj.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
      totalEarnings: data.totalEarnings,
      tripsCount: data.count,
      orders: data.orders,
      basePay: Math.round(data.totalEarnings * 0.8),
      surgePay: Math.round(data.totalEarnings * 0.2),
    };
  }, [calendarQuickFilter, selectedCalendarDate, dateOrdersMap, weeklyEarnings, todayTrips, completedDeliveries]);

  // Calendar month matrix cells generator
  const calendarGridCells = useMemo(() => {
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0: Sun, 1: Mon...
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const cells: Array<{
      key: string;
      dayNum?: number;
      dateKey?: string;
      isCurrentMonth: boolean;
      isSelected: boolean;
      isToday: boolean;
      earnings: number;
      hasOrders: boolean;
    }> = [];

    // Empty offset placeholders
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push({
        key: `empty-${i}`,
        isCurrentMonth: false,
        isSelected: false,
        isToday: false,
        earnings: 0,
        hasOrders: false,
      });
    }

    // Days in current month
    for (let day = 1; day <= daysInMonth; day++) {
      const dKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const hasData = dateOrdersMap[dKey];
      const earnings = hasData ? hasData.totalEarnings : 0;
      const count = hasData ? hasData.count : 0;

      cells.push({
        key: dKey,
        dayNum: day,
        dateKey: dKey,
        isCurrentMonth: true,
        isSelected: selectedCalendarDate === dKey && calendarQuickFilter === 'custom',
        isToday: dKey === todayKey,
        earnings: earnings,
        hasOrders: count > 0 || earnings > 0,
      });
    }

    return cells;
  }, [calendarViewDate, selectedCalendarDate, calendarQuickFilter, dateOrdersMap]);

  const monthYearLabel = calendarViewDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const renderPocketTab = () => (
    <ScrollView
      style={{ flex: 1, backgroundColor: isDarkMode ? '#0B0F19' : '#F8FAFC' }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 110 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0066FF']} tintColor="#0066FF" />}
    >
      {/* ── 1. Top Pocket Hero Earnings Card ── */}
      <View style={styles.pocketHeroCard}>
        <View style={styles.pocketEarningsHeader}>
          <Text style={styles.pocketEarningsDate}>📅 {calendarStats.label}</Text>
        </View>
        <Text style={styles.pocketBigAmount}>₹{calendarStats.totalEarnings.toFixed(2)}</Text>
        {/* 🗓️ Compact Calendar Popup Modal Trigger Button */}
        <TouchableOpacity
          style={[styles.pocketOpenCalendarBtn, { marginTop: 10 }]}
          onPress={() => setShowCalendarModal(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.pocketOpenCalendarBtnText}>🗓️ {t('pickDate')} / Calendar</Text>
        </TouchableOpacity>
      </View>

      {/* ── 2. Quick Date Filter Chips ── */}
      <View style={styles.calendarQuickFiltersRow}>
        <TouchableOpacity
          style={[
            styles.calendarFilterChip,
            calendarQuickFilter === 'today' && styles.calendarFilterChipActive,
            isDarkMode && { backgroundColor: calendarQuickFilter === 'today' ? '#0066FF' : '#1E293B', borderColor: isDarkMode ? '#334155' : '#E2E8F0' },
          ]}
          onPress={() => {
            const today = new Date();
            const y = today.getFullYear();
            const m = String(today.getMonth() + 1).padStart(2, '0');
            const d = String(today.getDate()).padStart(2, '0');
            setSelectedCalendarDate(`${y}-${m}-${d}`);
            setCalendarViewDate(today);
            setCalendarQuickFilter('today');
          }}
          activeOpacity={0.8}
        >
          <Text style={[styles.calendarFilterChipText, calendarQuickFilter === 'today' && styles.calendarFilterChipTextActive]}>
            🌟 {t('today')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.calendarFilterChip,
            calendarQuickFilter === 'yesterday' && styles.calendarFilterChipActive,
            isDarkMode && { backgroundColor: calendarQuickFilter === 'yesterday' ? '#0066FF' : '#1E293B', borderColor: isDarkMode ? '#334155' : '#E2E8F0' },
          ]}
          onPress={() => {
            const yest = new Date();
            yest.setDate(yest.getDate() - 1);
            const y = yest.getFullYear();
            const m = String(yest.getMonth() + 1).padStart(2, '0');
            const d = String(yest.getDate()).padStart(2, '0');
            setSelectedCalendarDate(`${y}-${m}-${d}`);
            setCalendarViewDate(yest);
            setCalendarQuickFilter('yesterday');
          }}
          activeOpacity={0.8}
        >
          <Text style={[styles.calendarFilterChipText, calendarQuickFilter === 'yesterday' && styles.calendarFilterChipTextActive]}>
            ⏪ {t('yesterday')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.calendarFilterChip,
            calendarQuickFilter === 'week' && styles.calendarFilterChipActive,
            isDarkMode && { backgroundColor: calendarQuickFilter === 'week' ? '#0066FF' : '#1E293B', borderColor: isDarkMode ? '#334155' : '#E2E8F0' },
          ]}
          onPress={() => setCalendarQuickFilter('week')}
          activeOpacity={0.8}
        >
          <Text style={[styles.calendarFilterChipText, calendarQuickFilter === 'week' && styles.calendarFilterChipTextActive]}>
            📊 This Week
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.calendarFilterChip,
            calendarQuickFilter === 'month' && styles.calendarFilterChipActive,
            isDarkMode && { backgroundColor: calendarQuickFilter === 'month' ? '#0066FF' : '#1E293B', borderColor: isDarkMode ? '#334155' : '#E2E8F0' },
          ]}
          onPress={() => setCalendarQuickFilter('month')}
          activeOpacity={0.8}
        >
          <Text style={[styles.calendarFilterChipText, calendarQuickFilter === 'month' && styles.calendarFilterChipTextActive]}>
            🗓️ This Month
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── 4. Pocket Balance & Cash Management ── */}
      <View style={styles.dividerWrap}>
        <View style={[styles.dividerLine, { backgroundColor: isDarkMode ? '#334155' : '#E2E8F0' }]} />
        <Text style={[styles.dividerLabel, { color: '#0066FF' }]}>{t('pocket')}</Text>
        <View style={[styles.dividerLine, { backgroundColor: isDarkMode ? '#334155' : '#E2E8F0' }]} />
      </View>

      <View style={[styles.pocketInfoCard, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF', borderColor: isDarkMode ? '#334155' : '#E2E8F0', borderWidth: 1 }]}>
        <TouchableOpacity style={styles.pocketRow} activeOpacity={0.7}>
          <Text style={[styles.pocketRowTitle, { color: isDarkMode ? '#F8FAFC' : '#1E293B' }]}>{t('pocketBalance')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.pocketRowVal, { color: pocketBalance < 0 ? '#DC2626' : '#16A34A' }]}>
              {pocketBalance < 0 ? `-₹${Math.abs(pocketBalance).toFixed(2)}` : `₹${pocketBalance.toFixed(2)}`}
            </Text>
            <Text style={styles.rowChevron}> ›</Text>
          </View>
        </TouchableOpacity>

        {pocketBalance < 0 && (
          <View style={styles.pocketAlertBanner}>
            <View style={styles.alertExclamation}>
              <Text style={styles.alertExclamationText}>!</Text>
            </View>
            <Text style={styles.pocketAlertText}>
              Deposit ₹{Math.abs(pocketBalance).toFixed(2)} to avoid account pause
            </Text>
          </View>
        )}

        <View style={styles.pocketBtnRow}>
          <TouchableOpacity
            style={styles.depositBtn}
            onPress={() => setShowDepositModal(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.depositBtnText}>{t('depositCash')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.withdrawBtn, { backgroundColor: isDarkMode ? '#334155' : '#F1F5F9', borderColor: isDarkMode ? '#475569' : '#CBD5E1' }]}
            onPress={() => navigation.navigate('EarningsScreen')}
            activeOpacity={0.8}
          >
            <Text style={[styles.withdrawBtnText, { color: isDarkMode ? '#F8FAFC' : '#475569' }]}>{t('withdraw')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // 4. PROFILE TAB (Partner Profile - Pixel Perfect Dark Mode)
  // ════════════════════════════════════════════════════════════════════════════
  const renderProfileTab = () => {
    const partnerCode = (user?.partnerId || user?.agentCode || `FE${(riderId || user?._id || user?.id || '2680871').toString().slice(-7).toUpperCase()}`);
    const profilePic = riderProfilePic || user?.profilePicture || user?.photos?.[0] || null;

    // ── Rider Details Sub-Screen ──
    if (showRiderDetails) {
      return (
        <View style={[styles.rdContainer, { backgroundColor: isDarkMode ? '#0B0F19' : '#F8FAFC' }]}>
          <StatusBar hidden={false} barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={isDarkMode ? '#0F172A' : '#FFFFFF'} />
          {/* Top Header with Back Button & Title */}
          <View style={[styles.rdHeaderNav, { backgroundColor: isDarkMode ? '#0F172A' : '#FFFFFF', borderBottomWidth: 1, borderBottomColor: isDarkMode ? '#1E293B' : '#E2E8F0' }]}>
            <TouchableOpacity
              style={styles.rdBackBtn}
              onPress={() => setShowRiderDetails(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.rdBackArrow, { color: isDarkMode ? '#FFFFFF' : '#0F172A' }]}>←</Text>
            </TouchableOpacity>
            <Text style={[styles.rdHeaderTitle, { color: isDarkMode ? '#FFFFFF' : '#0F172A' }]}>{t('tabProfile')}</Text>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.rdScrollContent}
          >
            {/* Big Hero Profile Picture Banner with Change Photo Button */}
            <TouchableOpacity
              style={styles.rdHeroBannerWrap}
              onPress={handleChangeProfilePic}
              activeOpacity={0.85}
            >
              {profilePic ? (
                <Image source={{ uri: profilePic }} style={styles.rdHeroImg} resizeMode="cover" />
              ) : (
                <View style={[styles.rdHeroPlaceholder, { backgroundColor: isDarkMode ? '#334155' : '#E2E8F0' }]}>
                  <Text style={{ fontSize: 72 }}>👨</Text>
                </View>
              )}
              <View style={styles.rdChangePhotoBadge}>
                <Text style={styles.rdChangePhotoBadgeText}>📷 Tap to Change Photo</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.rdPaddingContent}>
              {/* ── 1. Transport & Zone Details ── */}
              <Text style={[styles.rdSectionHeader, { color: isDarkMode ? '#94A3B8' : '#64748B' }]}>Transport & Zone Details</Text>
              <View style={[styles.rdCard, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF', borderColor: isDarkMode ? '#334155' : '#E2E8F0', borderWidth: 1 }]}>
                {/* Rider Name & Code */}
                <View style={styles.rdCardRowFull}>
                  <Text style={[styles.rdNameCodeText, { color: isDarkMode ? '#F8FAFC' : '#0F172A' }]}>
                    {displayName || 'Sachin Lodhi'} ({partnerCode})
                  </Text>
                </View>

                <View style={[styles.rdDivider, { backgroundColor: isDarkMode ? '#334155' : '#E2E8F0' }]} />

                {/* Open Location Model Status */}
                <TouchableOpacity
                  style={[styles.rdCardRowInline, { justifyContent: 'space-between' }]}
                  onPress={() => {
                    Alert.alert(
                      '🌐 Open Location Mode',
                      `Current City: ${riderCity || currentAddress || 'GPS Active'}\n\nZone restrictions are completely removed! You can go Online and accept nearby orders from any location.`
                    );
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.rdLabelText, { color: isDarkMode ? '#94A3B8' : '#64748B' }]}>
                    Service Area: <Text style={[styles.rdValueText, { color: '#16A34A', fontWeight: '700' }]}>🌐 Open Location (All Areas)</Text>
                  </Text>
                  <Text style={{ fontSize: 12, color: '#0066FF', fontWeight: '600' }}>Active ✓</Text>
                </TouchableOpacity>

                <View style={[styles.rdDivider, { backgroundColor: isDarkMode ? '#334155' : '#E2E8F0' }]} />

                {/* City */}
                <View style={styles.rdCardRowInline}>
                  <Text style={[styles.rdLabelText, { color: isDarkMode ? '#94A3B8' : '#64748B' }]}>City: <Text style={[styles.rdValueText, { color: isDarkMode ? '#F8FAFC' : '#0F172A' }]}>{riderCity}</Text></Text>
                </View>

                <View style={[styles.rdDivider, { backgroundColor: isDarkMode ? '#334155' : '#E2E8F0' }]} />

                {/* Transport / Vehicle Type */}
                <View style={styles.rdCardRowInline}>
                  <Text style={[styles.rdLabelText, { color: isDarkMode ? '#94A3B8' : '#64748B' }]}>Transport: <Text style={[styles.rdValueText, { color: isDarkMode ? '#F8FAFC' : '#0F172A' }]}>{vehicleType}</Text></Text>
                </View>

                <View style={[styles.rdDivider, { backgroundColor: isDarkMode ? '#334155' : '#E2E8F0' }]} />

                {/* Transport Number with Edit Pencil */}
                <TouchableOpacity
                  style={styles.rdCardRowBetween}
                  onPress={handleEditVehicleNumber}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.rdLabelText, { color: isDarkMode ? '#94A3B8' : '#64748B' }]}>Transport Number</Text>
                  <View style={styles.rdRightEditRow}>
                    <Text style={[styles.rdVehicleNumText, { color: isDarkMode ? '#F8FAFC' : '#0F172A' }]}>{riderVehicleNumber}</Text>
                    <Text style={styles.rdGreenEditIcon}>✎</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* ── 2. Personal Details (Fleet Coach Removed) ── */}
              <Text style={[styles.rdSectionHeader, { color: isDarkMode ? '#94A3B8' : '#64748B', marginTop: 14 }]}>{t('personalDetails')}</Text>
              <View style={[styles.rdCard, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF', borderColor: isDarkMode ? '#334155' : '#E2E8F0', borderWidth: 1 }]}>
                {/* Phone */}
                <View style={styles.rdCardRowBetween}>
                  <Text style={[styles.rdLabelText, { color: isDarkMode ? '#94A3B8' : '#64748B' }]}>{t('phone')}</Text>
                  <Text style={[styles.rdValueText, { color: isDarkMode ? '#F8FAFC' : '#0F172A' }]}>{user?.phoneNumber || user?.phone || '9039978452'}</Text>
                </View>

                <View style={[styles.rdDivider, { backgroundColor: isDarkMode ? '#334155' : '#E2E8F0' }]} />

                {/* Secondary Phone with Edit Pencil */}
                <TouchableOpacity
                  style={styles.rdCardRowBetween}
                  onPress={handleEditSecondaryPhone}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.rdLabelText, { color: isDarkMode ? '#94A3B8' : '#64748B' }]}>{t('secondaryPhone')}</Text>
                  <View style={styles.rdRightEditRow}>
                    <Text style={[styles.rdValueText, { color: isDarkMode ? '#F8FAFC' : '#0F172A' }]}>{riderSecondaryPhone}</Text>
                    <Text style={styles.rdGreenEditIcon}>✎</Text>
                  </View>
                </TouchableOpacity>

                <View style={[styles.rdDivider, { backgroundColor: isDarkMode ? '#334155' : '#E2E8F0' }]} />

                {/* DL Expiry Date */}
                <View style={styles.rdCardRowBetween}>
                  <Text style={[styles.rdLabelText, { color: isDarkMode ? '#94A3B8' : '#64748B' }]}>{t('dlExpiry')}</Text>
                  <Text style={[styles.rdValueText, { color: isDarkMode ? '#F8FAFC' : '#0F172A' }]}>{dlExpiryDate}</Text>
                </View>

                <View style={[styles.rdDivider, { backgroundColor: isDarkMode ? '#334155' : '#E2E8F0' }]} />

                {/* Rating */}
                <View style={styles.rdCardRowBetween}>
                  <Text style={[styles.rdLabelText, { color: isDarkMode ? '#94A3B8' : '#64748B' }]}>Rating</Text>
                  <Text style={[styles.rdValueText, { color: isDarkMode ? '#F8FAFC' : '#0F172A' }]}>5.0 ★</Text>
                </View>

                <View style={[styles.rdDivider, { backgroundColor: isDarkMode ? '#334155' : '#E2E8F0' }]} />

                {/* Extra Cash / Pocket */}
                <View style={styles.rdCardRowBetween}>
                  <Text style={[styles.rdLabelText, { color: isDarkMode ? '#94A3B8' : '#64748B' }]}>{t('cashInHand')}</Text>
                  <Text style={[styles.rdValueText, { color: isDarkMode ? '#F8FAFC' : '#0F172A' }]}>₹{pocketBalance || 0}</Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      );
    }

    return (
      <View style={[styles.zpContainer, { backgroundColor: isDarkMode ? '#0B0F19' : '#F8FAFC' }]}>
        {/* Top Header with Back Button */}
        <View style={[styles.zpHeaderNav, { backgroundColor: isDarkMode ? '#0F172A' : '#FFFFFF', borderBottomWidth: 1, borderBottomColor: isDarkMode ? '#1E293B' : '#E2E8F0' }]}>
          <TouchableOpacity
            style={styles.zpBackBtn}
            onPress={() => setActiveTab('feed')}
            activeOpacity={0.7}
          >
            <Text style={[styles.zpBackArrow, { color: isDarkMode ? '#FFFFFF' : '#0F172A' }]}>←</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.zpScrollContent}
        >
          {/* Top Profile Header Info */}
          <View style={styles.zpProfileHeaderRow}>
            <View style={styles.zpProfileInfoCol}>
              <TouchableOpacity
                style={styles.zpNameRow}
                onPress={() => setShowRiderDetails(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.zpNameText, { color: isDarkMode ? '#F8FAFC' : '#0F172A' }]} numberOfLines={1}>
                  {displayName || 'Sachin Lodhi'}
                </Text>
                <Text style={[styles.zpNameChevron, { color: isDarkMode ? '#9CA3AF' : '#64748B' }]}> ›</Text>
              </TouchableOpacity>

              <Text style={[styles.zpPartnerIdText, { color: isDarkMode ? '#9CA3AF' : '#64748B' }]}>{partnerCode}</Text>

              {/* Rating Badge */}
              <TouchableOpacity
                style={[styles.zpRatingBadge, { backgroundColor: isDarkMode ? '#0F0F12' : '#F1F5F9', borderColor: isDarkMode ? '#2D2D35' : '#E2E8F0' }]}
                onPress={() => setShowRiderDetails(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.zpRatingStar}>★</Text>
                <Text style={[styles.zpRatingText, { color: isDarkMode ? '#FFFFFF' : '#0F172A' }]}>5.0</Text>
              </TouchableOpacity>
            </View>

            {/* Profile Avatar Image with Change Photo action */}
            <TouchableOpacity
              style={styles.zpAvatarWrap}
              onPress={handleChangeProfilePic}
              activeOpacity={0.8}
            >
              {profilePic ? (
                <Image source={{ uri: profilePic }} style={styles.zpAvatarImg} />
              ) : (
                <View style={[styles.zpAvatarPlaceholder, { backgroundColor: isDarkMode ? '#3F3F46' : '#E2E8F0', borderColor: isDarkMode ? '#52525B' : '#CBD5E1' }]}>
                  <Text style={[styles.zpAvatarPlaceholderText, { color: isDarkMode ? '#FFFFFF' : '#0F172A' }]}>
                    {(displayName || 'S').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              {/* Change Photo Pencil Badge */}
              <View style={[styles.zpAvatarBadgeIconWrap, { backgroundColor: '#0066FF', borderColor: isDarkMode ? '#18181B' : '#FFFFFF' }]}>
                <Text style={{ fontSize: 10, color: '#FFFFFF', fontWeight: '800' }}>📷</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Silver Partner & Score Banner */}
          <TouchableOpacity
            style={[styles.zpTierBanner, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF', borderColor: isDarkMode ? '#37373F' : '#E2E8F0' }]}
            onPress={() => Alert.alert('Silver Partner Tier', 'Performance Score: 84\nSilver Partner Benefits:\n• Priority order assignment\n• Extra weekly incentives')}
            activeOpacity={0.8}
          >
            <View style={styles.zpTierLeft}>
              <Text style={styles.zpHexagonIcon}>⬡</Text>
              <Text style={[styles.zpTierTitle, { color: isDarkMode ? '#FFFFFF' : '#0F172A' }]}>{t('silverPartner')}</Text>
            </View>
            <View style={styles.zpTierRight}>
              <Text style={[styles.zpScoreText, { color: isDarkMode ? '#FFFFFF' : '#0F172A' }]}>{t('score')}: 84</Text>
              <Text style={[styles.zpTierChevron, { color: isDarkMode ? '#9CA3AF' : '#64748B' }]}> ›</Text>
            </View>
          </TouchableOpacity>

          {/* 3 Useful Action Buttons Grid (Gigs & Offers removed) */}
          <View style={styles.zpActionGrid}>
            {/* 1. Trips & Orders History */}
            <TouchableOpacity
              style={[styles.zpActionCard, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF', borderColor: isDarkMode ? '#33333A' : '#E2E8F0' }]}
              onPress={() => setActiveTab('orders')}
              activeOpacity={0.7}
            >
              <Text style={styles.zpActionBigEmoji}>🛵</Text>
              <Text style={[styles.zpActionCardText, { color: isDarkMode ? '#F8FAFC' : '#0F172A' }]}>{t('tripsHistory')}</Text>
            </TouchableOpacity>

            {/* 2. Open Location Status */}
            <TouchableOpacity
              style={[styles.zpActionCard, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF', borderColor: isDarkMode ? '#33333A' : '#E2E8F0' }]}
              onPress={() => {
                Alert.alert(
                  '🌐 Open Location Mode',
                  `Active City: ${riderCity || currentAddress || 'GPS Live'}\n\nZone limits removed! You can work & go Online anywhere.`
                );
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.zpActionBigEmoji}>🌐</Text>
              <Text style={[styles.zpActionCardText, { color: isDarkMode ? '#F8FAFC' : '#0F172A' }]}>Open Location</Text>
            </TouchableOpacity>

            {/* 3. Partner ID Card */}
            <TouchableOpacity
              style={[styles.zpActionCard, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF', borderColor: isDarkMode ? '#33333A' : '#E2E8F0' }]}
              onPress={() => setShowIdCardModal(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.zpActionBigEmoji}>🪪</Text>
              <Text style={[styles.zpActionCardText, { color: isDarkMode ? '#F8FAFC' : '#0F172A' }]}>ID Card</Text>
            </TouchableOpacity>
          </View>

          {/* Preferences (Dark Mode & Language) */}
          <View style={styles.zpSectionWrap}>
            <Text style={[styles.zpSectionHeader, { color: isDarkMode ? '#94A3B8' : '#64748B' }]}>{t('preferences')}</Text>
            <View style={[styles.zpGroupCard, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF', borderColor: isDarkMode ? '#303038' : '#E2E8F0' }]}>
              {/* Dark Mode Switch */}
              <TouchableOpacity
                style={styles.zpGroupRow}
                onPress={toggleDarkMode}
                activeOpacity={0.7}
              >
                <View style={styles.zpRowLeft}>
                  <Text style={styles.zpRowIcon}>{isDarkMode ? '🌙' : '☀️'}</Text>
                  <View>
                    <Text style={[styles.zpRowTitle, { color: isDarkMode ? '#F8FAFC' : '#0F172A' }]}>{t('darkMode')}</Text>
                    <Text style={{ fontSize: 11, color: isDarkMode ? '#94A3B8' : '#64748B', marginTop: 1 }}>
                      {isDarkMode ? t('darkModeActive') : t('lightModeActive')}
                    </Text>
                  </View>
                </View>
                <View style={{
                  width: 48,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: isDarkMode ? '#22C55E' : '#CBD5E1',
                  padding: 2,
                  justifyContent: 'center',
                  alignItems: isDarkMode ? 'flex-end' : 'flex-start',
                }}>
                  <View style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: '#FFFFFF',
                  }} />
                </View>
              </TouchableOpacity>

              <View style={[styles.zpRowDivider, { backgroundColor: isDarkMode ? '#334155' : '#F1F5F9' }]} />

              {/* 🌐 Language Selection Option */}
              <TouchableOpacity
                style={styles.zpGroupRow}
                onPress={() => setShowLanguageModal(true)}
                activeOpacity={0.7}
              >
                <View style={styles.zpRowLeft}>
                  <Text style={styles.zpRowIcon}>🌐</Text>
                  <View>
                    <Text style={[styles.zpRowTitle, { color: isDarkMode ? '#F8FAFC' : '#0F172A' }]}>{t('changeLanguage')}</Text>
                    <Text style={{ fontSize: 11, color: '#0066FF', fontWeight: '700', marginTop: 1 }}>
                      {RIDER_LANGUAGES.find((l) => l.code === language)?.nativeLabel || 'English'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.zpRowChevron, { color: isDarkMode ? '#94A3B8' : '#64748B' }]}>›</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Support Section */}
          <View style={styles.zpSectionWrap}>
            <Text style={[styles.zpSectionHeader, { color: isDarkMode ? '#94A3B8' : '#64748B' }]}>{t('helpCenter')}</Text>
            <View style={[styles.zpGroupCard, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF', borderColor: isDarkMode ? '#303038' : '#E2E8F0' }]}>
              <TouchableOpacity
                style={styles.zpGroupRow}
                onPress={() => setShowHelpModal(true)}
                activeOpacity={0.7}
              >
                <View style={styles.zpRowLeft}>
                  <Text style={styles.zpRowIcon}>🎧</Text>
                  <Text style={[styles.zpRowTitle, { color: isDarkMode ? '#F8FAFC' : '#0F172A' }]}>{t('helpCenter')}</Text>
                </View>
                <Text style={[styles.zpRowChevron, { color: isDarkMode ? '#94A3B8' : '#64748B' }]}>›</Text>
              </TouchableOpacity>

              <View style={[styles.zpRowDivider, { backgroundColor: isDarkMode ? '#334155' : '#F1F5F9' }]} />

              <TouchableOpacity
                style={styles.zpGroupRow}
                onPress={() => setShowHelpModal(true)}
                activeOpacity={0.7}
              >
                <View style={styles.zpRowLeft}>
                  <Text style={styles.zpRowIcon}>🎫</Text>
                  <Text style={[styles.zpRowTitle, { color: isDarkMode ? '#F8FAFC' : '#0F172A' }]}>{t('supportTickets')}</Text>
                </View>
                <Text style={[styles.zpRowChevron, { color: isDarkMode ? '#94A3B8' : '#64748B' }]}>›</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Partner Options Section */}
          <View style={styles.zpSectionWrap}>
            <Text style={[styles.zpSectionHeader, { color: isDarkMode ? '#94A3B8' : '#64748B' }]}>Partner Options</Text>
            <View style={[styles.zpGroupCard, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF', borderColor: isDarkMode ? '#303038' : '#E2E8F0' }]}>
              <TouchableOpacity
                style={styles.zpGroupRow}
                onPress={() => {
                  Alert.alert(
                    '🌐 Open Location Mode',
                    `Current City: ${riderCity || currentAddress || 'GPS Live'}\n\nZone restrictions removed! You receive nearby orders based on your live GPS.`
                  );
                }}
                activeOpacity={0.7}
              >
                <View style={styles.zpRowLeft}>
                  <Text style={styles.zpRowIcon}>🌐</Text>
                  <View>
                    <Text style={[styles.zpRowTitle, { color: isDarkMode ? '#F8FAFC' : '#0F172A' }]}>{t('workArea')}</Text>
                    <Text style={{ fontSize: 11, color: '#16A34A', marginTop: 1, fontWeight: '600' }}>Open Location • Work Anywhere</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[styles.zpNewBadge, { backgroundColor: '#16A34A' }]}>
                    <Text style={styles.zpNewBadgeText}>OPEN GPS</Text>
                  </View>
                  <Text style={[styles.zpRowChevron, { color: isDarkMode ? '#94A3B8' : '#64748B' }]}>›</Text>
                </View>
              </TouchableOpacity>

              <View style={[styles.zpRowDivider, { backgroundColor: isDarkMode ? '#334155' : '#F1F5F9' }]} />

              <TouchableOpacity
                style={styles.zpGroupRow}
                onPress={() => Alert.alert(t('myPreferences'), 'Delivery Preferences:\n• Food Delivery: ON\n• Parcel Delivery: ON\n• Cash on Delivery: ON')}
                activeOpacity={0.7}
              >
                <View style={styles.zpRowLeft}>
                  <Text style={styles.zpRowIcon}>★</Text>
                  <Text style={[styles.zpRowTitle, { color: isDarkMode ? '#F8FAFC' : '#0F172A' }]}>{t('myPreferences')}</Text>
                </View>
                <Text style={[styles.zpRowChevron, { color: isDarkMode ? '#94A3B8' : '#64748B' }]}>›</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Logout Button */}
          <TouchableOpacity
            style={[styles.zpLogoutBtn, { backgroundColor: isDarkMode ? '#1E293B' : '#FEE2E2', borderColor: isDarkMode ? '#EF4444' : '#FECACA', borderWidth: 1 }]}
            onPress={() => {
              Alert.alert(t('logOut'), 'Are you sure you want to log out?', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: t('logOut'),
                  style: 'destructive',
                  onPress: async () => {
                    const targetId = riderId || user?._id || user?.id;
                    if (socket && socket.connected && targetId) {
                      socket.emit('user_logout', targetId);
                    }
                    if (logout) {
                      await logout('DELIVERY');
                    } else {
                      await AsyncStorage.multiRemove(['deliveryToken', 'deliveryRefreshToken', 'deliveryUser', 'delivery_is_online']).catch(() => {});
                      navigation.reset({ index: 0, routes: [{ name: 'RoleSelection' }] });
                    }
                  },
                },
              ]);
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.zpLogoutText, { color: '#DC2626' }]}>🚪  {t('logOut')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safeContainer, { backgroundColor: isDarkMode ? '#0B0F19' : '#FFFFFF' }]}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={isDarkMode ? '#0B0F19' : '#FFFFFF'}
      />

      {/* ── TOP HEADER WITH REAL WORKING TOGGLE (DYNAMIC THEME) ── */}
      <View style={[
        styles.topHeader,
        {
          paddingTop: Math.max(12, insets.top + 8),
          backgroundColor: isDarkMode ? '#0B0F19' : '#FFFFFF',
          borderBottomWidth: 1,
          borderBottomColor: isDarkMode ? '#1E293B' : '#E2E8F0',
        }
      ]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {/* UI Back Button directly navigating to RoleSelection per Specification Point 1 */}
          <TouchableOpacity
            onPress={() => navigation.navigate('RoleSelection')}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: isDarkMode ? '#1E293B' : '#F1F5F9',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 10,
              borderWidth: 1,
              borderColor: isDarkMode ? '#334155' : '#CBD5E1',
            }}
          >
            <Text style={{ fontSize: 22, color: isDarkMode ? '#F8FAFC' : '#0F172A', fontWeight: 'bold', marginTop: -2 }}>‹</Text>
          </TouchableOpacity>

          {/* Online / Offline Capsule Toggle Switch (Matching Screenshot) */}
          <TouchableOpacity
            onPress={toggleOnlineStatus}
            activeOpacity={0.7}
            delayPressIn={0}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 18 }}
            style={[
              styles.headerSwitchPill,
              { backgroundColor: isOnline ? '#16A34A' : isDarkMode ? '#334155' : '#E2E8F0' }
            ]}
          >
            {!isOnline && <View style={[styles.switchDotWhite, { backgroundColor: isDarkMode ? '#94A3B8' : '#64748B' }]} />}
            <Text style={[styles.headerSwitchPillText, !isOnline && { color: isDarkMode ? '#F8FAFC' : '#0F172A' }]}>
              {isOnline ? t('online') : t('offline')}
            </Text>
            {isOnline && <View style={styles.switchDotWhite} />}
          </TouchableOpacity>
        </View>

        {/* Right Header Icons */}
        <View style={styles.headerRightRow}>
          {/* 1. Red / Orange Siren Alarm Icon -> Opens Emergency SOS Modal */}
          <TouchableOpacity
            style={[styles.headerIconCircle, { backgroundColor: '#EA580C' }]}
            onPress={() => setShowSosModal(true)}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 18 }}>🚨</Text>
          </TouchableOpacity>

          {/* 2. Notification Bell -> Navigates to Notifications screen */}
          <TouchableOpacity
            style={[styles.headerIconCircle, { backgroundColor: isDarkMode ? '#1E293B' : '#F1F5F9' }]}
            onPress={() => navigation.navigate('Notifications')}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 18 }}>🔔</Text>
            {unreadNotifCount > 0 && <View style={styles.headerNotifDot} />}
          </TouchableOpacity>

          {/* 3. Help Question Icon -> Also Opens Help & Support Sheet */}
          <TouchableOpacity
            style={[styles.headerIconCircle, { backgroundColor: isDarkMode ? '#1E293B' : '#F1F5F9' }]}
            onPress={() => setShowHelpModal(true)}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 18 }}>❓</Text>
          </TouchableOpacity>

          {/* 4. Profile Avatar */}
          <TouchableOpacity
            style={[styles.headerAvatarCircle, { borderWidth: 1.5, borderColor: isDarkMode ? '#334155' : '#CBD5E1' }]}
            onPress={() => {
              setShowRiderDetails(false);
              setActiveTab('profile');
            }}
            activeOpacity={0.8}
          >
            {riderProfilePic || user?.profilePicture || (user?.photos && user.photos[0]) ? (
              <Image
                source={{ uri: riderProfilePic || user?.profilePicture || (user?.photos && user.photos[0]) }}
                style={{ width: '100%', height: '100%', borderRadius: 18 }}
              />
            ) : (
              <Text style={{ fontSize: 16, fontWeight: '800', color: isDarkMode ? '#F8FAFC' : '#0F172A' }}>
                {(displayName || 'R').charAt(0).toUpperCase()}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── FULL SCREEN INCOMING LIVE DELIVERY REQUEST WITH MAP & SLIDER (Requirement 2) ── */}
      <Modal
        visible={Boolean(incomingRequest)}
        animationType="slide"
        transparent={false}
        statusBarTranslucent={true}
        onRequestClose={() => {
          // Do NOT dismiss modal on back press - rider must accept or explicitly decline!
          return true;
        }}
      >
        {incomingRequest && (() => {
          const isRainSurge = Boolean(
            incomingRequest.isRainSurge ||
            (incomingRequest.rainSurgeAmount && incomingRequest.rainSurgeAmount > 0) ||
            incomingRequest.isRaining ||
            Number(incomingRequest.weatherIncentive || 0) > 0
          );

          const catName = getCategoryLabel(incomingRequest);
          const isFoodReq = catName.toLowerCase() === 'food';
          const catIcon = getCategoryIcon(catName);

          const rLat = Number(riderCoords?.latitude || 0);
          const rLon = Number(riderCoords?.longitude || 0);
          const pLat = Number(incomingRequest.supplierBusinessLatitude || incomingRequest.pickupLocation?.latitude || incomingRequest.pickupLatitude || 0);
          const pLon = Number(incomingRequest.supplierBusinessLongitude || incomingRequest.pickupLocation?.longitude || incomingRequest.pickupLongitude || 0);

          // Calculate Real Distances
          let realPickupDistKm = 0;
          if (rLat > 0 && rLon > 0 && pLat > 0 && pLon > 0) {
            realPickupDistKm = calculateHaversineDistanceKm(rLat, rLon, pLat, pLon);
          } else if (incomingRequest.pickupDistanceKm) {
            realPickupDistKm = Number(incomingRequest.pickupDistanceKm);
          }

          const dLat = Number(incomingRequest.customerLatitude || incomingRequest.destinationLatitude || incomingRequest.dropLocation?.latitude || incomingRequest.dropLatitude || 0);
          const dLon = Number(incomingRequest.customerLongitude || incomingRequest.destinationLongitude || incomingRequest.dropLocation?.longitude || incomingRequest.dropLongitude || 0);

          let deliveryDistKm = 0;
          if (pLat > 0 && pLon > 0 && dLat > 0 && dLon > 0) {
            deliveryDistKm = calculateHaversineDistanceKm(pLat, pLon, dLat, dLon);
          } else if (incomingRequest.distanceKm) {
            deliveryDistKm = Number(incomingRequest.distanceKm);
          }

          const hasRiderGps = Boolean(rLat > 0 && rLon > 0);
          const pickupKmStr = hasRiderGps && realPickupDistKm > 0
            ? (realPickupDistKm < 1 ? `${Math.max(50, Math.round(realPickupDistKm * 1000))} m` : `${realPickupDistKm.toFixed(1)} km`)
            : (realPickupDistKm > 0 ? `${realPickupDistKm.toFixed(1)} km` : 'Near you');

          const dropKmStr = deliveryDistKm > 0
            ? (deliveryDistKm < 1 ? `${Math.max(50, Math.round(deliveryDistKm * 1000))} m` : `${deliveryDistKm.toFixed(1)} km`)
            : (incomingRequest.distanceKm ? `${Number(incomingRequest.distanceKm).toFixed(1)} km` : '');

          const totalCountedKm = (realPickupDistKm + deliveryDistKm) > 0
            ? (realPickupDistKm + deliveryDistKm).toFixed(1)
            : (realPickupDistKm > 0 ? realPickupDistKm.toFixed(1) : (deliveryDistKm > 0 ? deliveryDistKm.toFixed(1) : ''));

          const customerDropAddress = incomingRequest.customerAddress || incomingRequest.dropAddress || incomingRequest.deliveryAddress || incomingRequest.destinationAddress || (incomingRequest.dropLocation?.address || incomingRequest.dropLocation?.fullAddress) || 'Customer Location';
          const customerName = incomingRequest.customerName || incomingRequest.userName || 'Customer';

          const pickupEtaMin = realPickupDistKm > 0 ? Math.max(1, Math.round(realPickupDistKm * 2.2)) : null;

          const totalEarning = Number(incomingRequest.totalTripPay || incomingRequest.estimatedEarning || incomingRequest.deliveryFee || 20);
          const rainSurgeAmount = Number(incomingRequest.rainSurgeAmount || incomingRequest.weatherIncentive || 0);

          const restaurantName = incomingRequest.restaurantName || incomingRequest.storeName || (isFoodReq ? 'Restaurant Partner' : `${catName} Store`);
          const pickupAddress = incomingRequest.supplierBusinessAddress || incomingRequest.pickupAddress || incomingRequest.restaurantAddress || 'Store Location';

          const displayOrderId = String(incomingRequest._id || incomingRequest.bookingId || incomingRequest.orderId || incomingRequest.id || 'ORDER').slice(-6).toUpperCase();

          return (
            <View style={{ flex: 1, backgroundColor: '#0F172A' }}>
              {/* UPPER SECTION: FULL SCREEN MAP WITH LIVE STORE PICKUP MARKER */}
              <View style={{ flex: 1, position: 'relative' }}>
                <WebView
                  ref={incomingMapWebViewRef}
                  originWhitelist={['*']}
                  source={{ html: incomingMapHtml }}
                  style={StyleSheet.absoluteFill}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  scrollEnabled={false}
                />

                {/* Top Floating Category & ID Badge */}
                <View style={{
                  position: 'absolute',
                  top: Math.max(StatusBar.currentHeight || 20, insets?.top || 20) + 10,
                  left: 14,
                  backgroundColor: '#0F172A',
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 20,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  elevation: 6,
                  borderWidth: 1,
                  borderColor: '#334155',
                }}>
                  <Text style={{ fontSize: 16 }}>{catIcon}</Text>
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>
                    {catName} • #{displayOrderId}
                  </Text>
                </View>

                {/* Top Floating Decline & Countdown Button */}
                <TouchableOpacity
                  style={{
                    position: 'absolute',
                    top: Math.max(StatusBar.currentHeight || 20, insets?.top || 20) + 10,
                    right: 14,
                    backgroundColor: 'rgba(15, 23, 42, 0.92)',
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 20,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    borderWidth: 1.5,
                    borderColor: requestCountdown <= 10 ? '#EF4444' : '#475569',
                    elevation: 6,
                  }}
                  onPress={handleRejectRequest}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: '#EF4444', fontWeight: '800', fontSize: 13 }}>✕ Decline</Text>
                  <View style={{
                    backgroundColor: requestCountdown <= 10 ? '#EF4444' : '#EA580C',
                    paddingHorizontal: 7,
                    paddingVertical: 2,
                    borderRadius: 10,
                  }}>
                    <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 11 }}>
                      ⏱️ {requestCountdown}s
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* LOWER SECTION: BOTTOM SHEET DETAILS CARD + SLIDE TO ACCEPT */}
              <View style={{
                backgroundColor: isDarkMode ? '#1E232D' : '#FFFFFF',
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                paddingHorizontal: 16,
                paddingTop: 16,
                paddingBottom: Math.max(20, (insets?.bottom || 0) + 12),
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -6 },
                shadowOpacity: 0.35,
                shadowRadius: 14,
                elevation: 24,
                borderTopWidth: 2,
                borderTopColor: '#EA580C',
              }}>
                {/* 1. Header: Category Badge + Fare */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <View>
                    <Text style={{ color: isDarkMode ? '#94A3B8' : '#64748B', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>
                      Estimated Trip Pay
                    </Text>
                    <Text style={{ color: '#16A34A', fontSize: 32, fontWeight: '900', letterSpacing: -0.5 }}>
                      ₹{totalEarning.toFixed(2)}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={{ backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                      <Text style={{ color: '#0066FF', fontWeight: '800', fontSize: 12 }}>
                        🛵 {pickupKmStr} • Total {totalCountedKm ? `${totalCountedKm} km` : 'Trip'}
                      </Text>
                    </View>
                    {pickupEtaMin && (
                      <Text style={{ color: isDarkMode ? '#94A3B8' : '#64748B', fontSize: 11.5, fontWeight: '600' }}>
                        Pickup ETA: ~{pickupEtaMin} min
                      </Text>
                    )}
                  </View>
                </View>

                {/* 2. Step-by-Step Trip Card (Store Pickup + Customer Delivery) */}
                <View style={{
                  backgroundColor: isDarkMode ? '#0F172A' : '#F8FAFC',
                  borderRadius: 14,
                  padding: 12,
                  marginBottom: 14,
                  borderWidth: 1,
                  borderColor: isDarkMode ? '#334155' : '#E2E8F0',
                  gap: 10,
                }}>
                  {/* Step 1: Store Pickup */}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#EA580C', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                      <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 13 }}>1</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ color: isDarkMode ? '#F8FAFC' : '#0F172A', fontWeight: '800', fontSize: 14 }} numberOfLines={1}>
                          🏪 {restaurantName}
                        </Text>
                        <Text style={{ color: '#EA580C', fontWeight: '800', fontSize: 12 }}>
                          {pickupKmStr}
                        </Text>
                      </View>
                      <Text style={{ color: isDarkMode ? '#94A3B8' : '#64748B', fontSize: 11.5, lineHeight: 15 }} numberOfLines={1}>
                        {pickupAddress}
                      </Text>
                    </View>
                  </View>

                  {/* Connecting Route Line */}
                  <View style={{ marginLeft: 13, height: 10, borderLeftWidth: 2, borderLeftColor: '#94A3B8', borderStyle: 'dashed' }} />

                  {/* Step 2: Customer Delivery */}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#0066FF', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                      <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 13 }}>2</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ color: isDarkMode ? '#F8FAFC' : '#0F172A', fontWeight: '800', fontSize: 14 }} numberOfLines={1}>
                          🏡 Deliver: {customerName}
                        </Text>
                        {dropKmStr ? (
                          <Text style={{ color: '#0066FF', fontWeight: '800', fontSize: 12 }}>
                            {dropKmStr}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={{ color: isDarkMode ? '#94A3B8' : '#64748B', fontSize: 11.5, lineHeight: 15 }} numberOfLines={2}>
                        {customerDropAddress}
                      </Text>
                    </View>
                  </View>

                  {isRainSurge && rainSurgeAmount > 0 && (
                    <View style={{ marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: isDarkMode ? '#1E293B' : '#E2E8F0', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 14 }}>🌧️</Text>
                      <Text style={{ color: '#0066FF', fontSize: 12, fontWeight: '800' }}>
                        Rain Surge Active (+₹{rainSurgeAmount.toFixed(0)}) Included in Pay
                      </Text>
                    </View>
                  )}
                </View>

                {/* 3. Slide To Accept Slider */}
                {isAcceptingRequest ? (
                  <View style={{
                    height: 56,
                    backgroundColor: '#16A34A',
                    borderRadius: 28,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                  }}>
                    <ActivityIndicator color="#FFFFFF" size="small" />
                    <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15, letterSpacing: 0.5 }}>
                      ACCEPTING ORDER...
                    </Text>
                  </View>
                ) : (
                  <SwipeToAccept
                    onAccept={handleAcceptRequest}
                    title="SWIPE TO ACCEPT ORDER >>>"
                  />
                )}
              </View>
            </View>
          );
        })()}
      </Modal>

      {/* ── ACTIVE TAB CONTENT (FEED, ORDERS, POCKET, PROFILE) ── */}
      {activeTab === 'feed' && renderFeedTab()}
      {activeTab === 'orders' && renderOrdersTab()}
      {activeTab === 'pocket' && renderPocketTab()}
      {activeTab === 'profile' && renderProfileTab()}

      {/* ── FLOATING COMPACT ACTIVE RIDE BAR (PINNED ABOVE BOTTOM TABS WHEN ON OTHER TABS) ── */}
      {activeDeliveries.length > 0 && activeTab !== 'feed' && (() => {
        const del = activeDeliveries[0];
        const stageInfo = getDeliveryStageInfo(del);
        const barTitle = stageInfo.isAtCustomer
          ? 'At Customer Location • Drop Off'
          : stageInfo.isPickedUp
          ? 'Heading to Customer Drop Location'
          : stageInfo.isAtStore
          ? 'At Restaurant • Go to Supplier'
          : 'Go to Restaurant';
        return (
          <TouchableOpacity
            style={[styles.compactRideBar, isDarkMode && { backgroundColor: '#1E293B', borderColor: '#334155' }]}
            onPress={() => {
              navigation.navigate('LiveTracking', { ride: del, isRider: true });
            }}
            activeOpacity={0.88}
          >
            <View style={styles.compactRideBarIconWrap}>
              <Text style={{ fontSize: 18 }}>🛵</Text>
            </View>
            <View style={{ flex: 1, paddingHorizontal: 10 }}>
              <Text style={[styles.compactRideBarTitle, isDarkMode && { color: '#F8FAFC' }]} numberOfLines={1}>
                {barTitle}
              </Text>
              <Text style={[styles.compactRideBarSub, isDarkMode && { color: '#94A3B8' }]} numberOfLines={1}>
                Active Trip • Live Map
              </Text>
            </View>
            <View style={styles.compactRideBarChevronWrap}>
              <Text style={styles.compactRideBarChevron}>⌃</Text>
            </View>
          </TouchableOpacity>
        );
      })()}

      {/* ── 4-TAB BOTTOM NAVIGATION WITH ARROW DIRECTLY ON TOP (GIGS & OFFERS REMOVED) ── */}
      <View style={[styles.bottomNavContainer, { backgroundColor: isDarkMode ? '#000000' : '#FFFFFF', borderTopColor: isDarkMode ? '#1E293B' : '#E2E8F0' }]}>
        {/* Sleek Arrow Handle directly on top of the bottom bar - Hidden during Active Trip */}
        {!hasActiveTrip && (
          <View
            {...swipeUpPanResponder.panHandlers}
            style={styles.bottomArrowHandleWrap}
          >
            <TouchableOpacity
              style={styles.floatingArrowTouch}
              onPress={() => setShowBannersModal(true)}
              activeOpacity={0.7}
            >
              <Svg width="36" height="16" viewBox="0 0 36 20" fill="none">
                <Path
                  d="M4 15L18 5L32 15"
                  stroke={isDarkMode ? '#CBD5E1' : '#0F172A'}
                  strokeWidth="4.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </TouchableOpacity>
          </View>
        )}

        {/* 4 Bottom Tabs */}
        <View style={styles.bottomNavRow}>
          {[
            { key: 'feed', label: t('tabFeed'), icon: '☰' },
            { key: 'pocket', label: t('tabPocket'), icon: '👛' },
            { key: 'orders', label: t('tabOrders'), icon: '📦' },
            { key: 'profile', label: t('tabProfile'), icon: '👤' },
          ].map((tab) => {
            const isSelected = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={styles.navCol}
                onPress={() => setActiveTab(tab.key as any)}
                activeOpacity={0.7}
              >
                <Text style={[styles.navIconText, isSelected ? styles.navIconActive : { color: isDarkMode ? '#94A3B8' : '#64748B' }]}>
                  {tab.icon}
                </Text>
                <Text style={[styles.navLabelText, isSelected ? styles.navLabelActive : { color: isDarkMode ? '#94A3B8' : '#64748B' }]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── FULL SCREEN PARTNER DASHBOARD (OPENED FROM MAP ARROW - CLEAN WHITE THEME) ── */}
      <Modal
        visible={showBannersModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowBannersModal(false)}
      >
        <SafeAreaView style={[styles.whiteModalContainer, isDarkMode && { backgroundColor: '#0B0F19' }]}>
          <StatusBar
            barStyle={isDarkMode ? 'light-content' : 'dark-content'}
            backgroundColor={isDarkMode ? '#0B0F19' : '#FFFFFF'}
          />

          {/* 1. TOP HEADER (DYNAMIC THEME) */}
          <View style={[styles.whiteTopHeader, isDarkMode && { backgroundColor: '#0B0F19', borderBottomColor: '#1E293B' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity
                onPress={() => navigation.navigate('RoleSelection')}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: isDarkMode ? '#1E293B' : '#F1F5F9',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10,
                  borderWidth: 1,
                  borderColor: isDarkMode ? '#334155' : '#CBD5E1',
                }}
              >
                <Text style={{ fontSize: 22, color: isDarkMode ? '#F8FAFC' : '#0F172A', fontWeight: 'bold', marginTop: -2 }}>‹</Text>
              </TouchableOpacity>
              {/* Left: Online / Offline Capsule Toggle */}
              <TouchableOpacity
                onPress={toggleOnlineStatus}
                activeOpacity={0.7}
                delayPressIn={0}
                hitSlop={{ top: 14, bottom: 14, left: 14, right: 18 }}
                style={[
                  styles.headerSwitchPill,
                  { backgroundColor: isOnline ? '#16A34A' : isDarkMode ? '#334155' : '#E2E8F0' }
                ]}
              >
                {!isOnline && <View style={[styles.switchDotWhite, { backgroundColor: isDarkMode ? '#94A3B8' : '#64748B' }]} />}
                <Text style={[styles.headerSwitchPillText, !isOnline && { color: isDarkMode ? '#F8FAFC' : '#0F172A' }]}>
                  {isOnline ? t('online') : t('offline')}
                </Text>
                {isOnline && <View style={styles.switchDotWhite} />}
              </TouchableOpacity>
            </View>

            {/* Right: SOS, Notifications, Help, Avatar */}
            <View style={styles.headerRightRow}>
              {/* 1. SOS Siren */}
              <TouchableOpacity
                style={[styles.headerIconCircle, { backgroundColor: '#EA580C' }]}
                onPress={() => {
                  setShowBannersModal(false);
                  setTimeout(() => setShowSosModal(true), 300);
                }}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              >
                <Text style={{ fontSize: 18 }}>🚨</Text>
              </TouchableOpacity>

              {/* 2. Notification Bell */}
              <TouchableOpacity
                style={[styles.headerIconCircle, { backgroundColor: isDarkMode ? '#1E293B' : '#F1F5F9' }]}
                onPress={() => {
                  setShowBannersModal(false);
                  navigation.navigate('Notifications');
                }}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              >
                <Text style={{ fontSize: 18 }}>🔔</Text>
                {unreadNotifCount > 0 && <View style={styles.headerNotifDot} />}
              </TouchableOpacity>

              {/* 3. Help Question Circle */}
              <TouchableOpacity
                style={[styles.headerIconCircle, { backgroundColor: isDarkMode ? '#1E293B' : '#F1F5F9' }]}
                onPress={() => {
                  setShowBannersModal(false);
                  setTimeout(() => setShowHelpModal(true), 300);
                }}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              >
                <Text style={{ fontSize: 18 }}>❓</Text>
              </TouchableOpacity>

              {/* 4. Profile Avatar */}
              <TouchableOpacity
                style={[styles.headerAvatarCircle, { borderWidth: 1.5, borderColor: isDarkMode ? '#334155' : '#CBD5E1' }]}
                onPress={() => {
                  setShowBannersModal(false);
                  setActiveTab('profile');
                }}
                activeOpacity={0.8}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              >
                {riderProfilePic || user?.profilePicture || (user?.photos && user.photos[0]) ? (
                  <Image
                    source={{ uri: riderProfilePic || user?.profilePicture || (user?.photos && user.photos[0]) }}
                    style={{ width: '100%', height: '100%', borderRadius: 18 }}
                  />
                ) : (
                  <Text style={{ fontSize: 16, fontWeight: '800', color: isDarkMode ? '#F8FAFC' : '#0F172A' }}>
                    {(displayName || 'R').charAt(0).toUpperCase()}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* 2. DOWNWARD CHEVRON HANDLE (COLLAPSE BACK TO MAP with HAND DRAG) */}
          <View
            {...swipeDownPanResponder.panHandlers}
            style={styles.whiteChevronHandleWrap}
          >
            <TouchableOpacity
              style={styles.whiteChevronHandle}
              onPress={() => setShowBannersModal(false)}
              activeOpacity={0.7}
            >
              <Svg width="40" height="20" viewBox="0 0 36 20" fill="none">
                <Path
                  d="M4 5L18 15L32 5"
                  stroke={isDarkMode ? '#94A3B8' : '#64748B'}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </TouchableOpacity>
          </View>

          {/* 3. SCROLLABLE DASHBOARD BODY */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 60 }}
          >
            {/* CARD: Today's Progress (Dynamic Language & Theme - Always visible at top of dashboard) */}
            <View style={[styles.whiteProgressCard, isDarkMode && { backgroundColor: '#1E293B', borderColor: '#334155' }, { marginBottom: 14 }]}>
              <View style={[styles.whiteProgressHeaderRow, isDarkMode && { borderBottomColor: '#334155' }]}>
                <Text style={{ fontSize: 20, marginRight: 8 }}>📅</Text>
                <Text style={[styles.whiteProgressTitle, isDarkMode && { color: '#F8FAFC' }]}>{t('todayProgress')}</Text>
              </View>

              {/* 2x2 Stats Grid */}
              <View style={styles.whiteStatsGrid}>
                {/* Top Row */}
                <View style={styles.whiteStatsRow}>
                  <TouchableOpacity
                    style={[styles.whiteStatBox, isDarkMode && { backgroundColor: '#0F172A', borderColor: '#334155' }]}
                    onPress={() => {
                      setShowBannersModal(false);
                      setActiveTab('pocket');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.whiteStatVal, isDarkMode && { color: '#F8FAFC' }]}>₹{pocketBalance || weeklyEarnings || 0}</Text>
                    <Text style={[styles.whiteStatLabel, isDarkMode && { color: '#94A3B8' }]}>{t('earnings')}  →</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.whiteStatBox, isDarkMode && { backgroundColor: '#0F172A', borderColor: '#334155' }]}
                    onPress={() => {
                      setShowBannersModal(false);
                      setActiveTab('orders');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.whiteStatVal, isDarkMode && { color: '#F8FAFC' }]}>{todayTrips || 0}</Text>
                    <Text style={[styles.whiteStatLabel, isDarkMode && { color: '#94A3B8' }]}>{t('trips')}  →</Text>
                  </TouchableOpacity>
                </View>

                {/* Bottom Row */}
                <View style={[styles.whiteStatsRow, { marginTop: 12 }]}>
                  <View style={[styles.whiteStatBox, isDarkMode && { backgroundColor: '#0F172A', borderColor: '#334155' }]}>
                    <Text style={[styles.whiteStatVal, isDarkMode && { color: '#F8FAFC' }]}>00:00 hrs</Text>
                    <Text style={[styles.whiteStatLabel, isDarkMode && { color: '#94A3B8' }]}>{t('timeOnOrders')}  →</Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.whiteStatBox, isDarkMode && { backgroundColor: '#0F172A', borderColor: '#334155' }]}
                    onPress={() => {
                      Alert.alert('🌐 Open Location Active', `City: ${riderCity || currentAddress || 'Live GPS'}\n\nZone limits removed! Go Online anywhere.`);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.whiteStatVal, isDarkMode && { color: '#F8FAFC' }]} numberOfLines={1}>
                      🌐 Open GPS
                    </Text>
                    <Text style={[styles.whiteStatLabel, isDarkMode && { color: '#94A3B8' }]}>All Areas Active</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* ── PROMINENT ACTIVE RIDE CARD INSIDE DASHBOARD (Visible at the bottom of the dashboard per user requirement!) ── */}
            {activeDeliveries.length > 0 && (() => {
              const del = activeDeliveries[0];
              const { isBeforePickup, isAtStore, isPickedUp, isAtCustomer } = getDeliveryStageInfo(del);
              const stageTerm = getCategoryOrderTerminology(del);
              const delStoreName = del?.restaurantName || del?.supplierBusinessName || del?.storeName || del?.partnerName || stageTerm.storeNameType;
              const delStorePhone = del?.restaurantPhone || del?.supplierPhone || del?.partnerPhone || '';
              const isFriend = Boolean(del?.isOrderingForSomeoneElse || del?.orderType === 'SOMEONE_ELSE');
              const delCustName = isFriend && del?.recipientName ? `${del.recipientName} (Friend)` : (del?.customerName || del?.customer?.name || del?.userName || 'Customer');
              const delCustPhone = isFriend && del?.recipientPhone ? del.recipientPhone : (del?.customerPhone || del?.customer?.phone || del?.customer?.phoneNumber || '');
              const delId = (del?.bookingId || del?.rideId || del?._id || '').toString();
              const delPrice = del?.price || del?.totalAmount || del?.estimatedEarnings || del?.riderEarnedAmount || '0';
              const itemsList = del?.items || del?.orderItems || [];
              const itemsText = Array.isArray(itemsList) && itemsList.length > 0
                ? itemsList.map((it: any) => `${it.quantity || 1}x ${it.name || it.title || 'Item'}`).join(', ')
                : '';
              const delPin = del?.deliveryPin || del?.deliveryOtp || del?.otp || '';

              const badgeColor = isPickedUp ? '#10B981' : isAtStore ? '#F59E0B' : '#0066FF';
              const badgeBg = isPickedUp ? 'rgba(16, 185, 129, 0.15)' : isAtStore ? 'rgba(245, 158, 11, 0.15)' : 'rgba(0, 102, 255, 0.15)';
              const badgeLabel = isAtCustomer
                ? '📍 AT CUSTOMER LOCATION • DROP OFF'
                : isPickedUp
                ? '📦 OUT FOR DELIVERY • TO CUSTOMER'
                : isAtStore
                ? `🏪 AT ${stageTerm.storeNameType.toUpperCase()} • PICK UP`
                : `🛵 GO TO ${stageTerm.storeNameType.toUpperCase()}`;

              return (
                <View
                  style={{
                    backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF',
                    borderRadius: 18,
                    padding: 16,
                    borderWidth: 2,
                    borderColor: badgeColor,
                    marginBottom: 14,
                    shadowColor: badgeColor,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.25,
                    shadowRadius: 10,
                    elevation: 6,
                  }}
                >
                  {/* Status Banner Header */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <View style={{
                      backgroundColor: badgeBg,
                      borderColor: badgeColor,
                      borderWidth: 1.2,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: badgeColor }} />
                      <Text style={{ color: badgeColor, fontWeight: '900', fontSize: 11.5, letterSpacing: 0.4 }}>
                        {badgeLabel}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: '#16A34A' }}>
                        ₹{delPrice}
                      </Text>
                      <Text style={{ fontSize: 11, color: isDarkMode ? '#94A3B8' : '#64748B', fontWeight: '700' }}>
                        #{delId ? delId.slice(-6).toUpperCase() : 'ORDER'}
                      </Text>
                    </View>
                  </View>

                  {/* Store & Customer Route Details */}
                  <View style={{
                    backgroundColor: isDarkMode ? '#0F172A' : '#F8FAFC',
                    borderRadius: 14,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: isDarkMode ? '#334155' : '#E2E8F0',
                    marginBottom: 12,
                    gap: 10,
                  }}>
                    {/* Store Pickup Location */}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <Text style={{ fontSize: 15 }}>{stageTerm.icon || '🏪'}</Text>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: isDarkMode ? '#F8FAFC' : '#0F172A' }} numberOfLines={1}>
                            {delStoreName}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 12, color: isDarkMode ? '#94A3B8' : '#64748B', paddingLeft: 21 }} numberOfLines={2}>
                          {del?.pickupAddress || del?.supplierBusinessAddress || del?.restaurantAddress || 'Store Pickup Location'}
                        </Text>
                      </View>
                      {Boolean(delStorePhone) && (
                        <TouchableOpacity
                          style={{
                            backgroundColor: '#10B981',
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 10,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          onPress={() => Linking.openURL(`tel:${delStorePhone}`).catch(() => {})}
                          activeOpacity={0.8}
                        >
                          <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>📞 Store</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Divider Line */}
                    <View style={{ height: 1, backgroundColor: isDarkMode ? '#1E293B' : '#E2E8F0', marginVertical: 2 }} />

                    {/* Customer Drop Location */}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <Text style={{ fontSize: 15 }}>👤</Text>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: isDarkMode ? '#F8FAFC' : '#0F172A' }} numberOfLines={1}>
                            {delCustName}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 12, color: isDarkMode ? '#94A3B8' : '#64748B', paddingLeft: 21 }} numberOfLines={2}>
                          {del?.deliveryAddress || del?.destinationAddress || del?.customerAddress || 'Delivery Location'}
                        </Text>
                      </View>
                      {Boolean(delCustPhone) && (
                        <TouchableOpacity
                          style={{
                            backgroundColor: '#0066FF',
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 10,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          onPress={() => Linking.openURL(`tel:${delCustPhone}`).catch(() => {})}
                          activeOpacity={0.8}
                        >
                          <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>📞 Client</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {/* Items Summary (if any) */}
                  {Boolean(itemsText) && (
                    <View style={{
                      backgroundColor: isDarkMode ? '#0F172A' : '#EFF6FF',
                      borderRadius: 10,
                      padding: 10,
                      marginBottom: 12,
                      borderWidth: 1,
                      borderColor: isDarkMode ? '#1E293B' : '#DBEAFE',
                    }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: isDarkMode ? '#94A3B8' : '#1D4ED8', marginBottom: 2 }}>
                        ITEMS TO COLLECT:
                      </Text>
                      <Text style={{ fontSize: 12.5, fontWeight: '600', color: isDarkMode ? '#F8FAFC' : '#1E293B' }} numberOfLines={2}>
                        📦 {itemsText}
                      </Text>
                    </View>
                  )}

                  {/* Big Navigation Button */}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        backgroundColor: '#0066FF',
                        paddingVertical: 12,
                        borderRadius: 12,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        shadowColor: '#0066FF',
                        shadowOffset: { width: 0, height: 3 },
                        shadowOpacity: 0.35,
                        shadowRadius: 5,
                        elevation: 4,
                      }}
                      onPress={() => {
                        setShowBannersModal(false);
                        navigation.navigate('LiveTracking', { ride: del, isRider: true });
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={{ fontSize: 16 }}>🗺️</Text>
                      <Text style={{ color: '#FFFFFF', fontSize: 13.5, fontWeight: '900' }}>
                        LIVE MAP & NAVIGATION
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })()}

            {/* Admin Uploaded Banner Carousel - Hidden when active ride is displayed */}
            {activeDeliveries.length === 0 && (
              <RoleBannerCarousel
                target="RIDER"
                containerMarginHorizontal={0}
                aspectRatio={2.5}
                borderRadius={16}
                autoSlideInterval={6000}
              />
            )}
          </ScrollView>

          {/* ── 4-TAB BOTTOM NAVIGATION INSIDE DASHBOARD (POCKET, ORDERS, PROFILE VISIBLE ON SLIDE UP) ── */}
          <View style={[styles.bottomNavContainer, { backgroundColor: isDarkMode ? '#000000' : '#FFFFFF', borderTopColor: isDarkMode ? '#1E293B' : '#E2E8F0' }]}>
            <View style={styles.bottomNavRow}>
              {[
                { key: 'feed', label: t('tabFeed'), icon: '☰' },
                { key: 'pocket', label: t('tabPocket'), icon: '👛' },
                { key: 'orders', label: t('tabOrders'), icon: '📦' },
                { key: 'profile', label: t('tabProfile'), icon: '👤' },
              ].map((tab) => {
                const isSelected = activeTab === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    style={styles.navCol}
                    onPress={() => {
                      setShowBannersModal(false);
                      setActiveTab(tab.key as any);
                    }}
                    activeOpacity={0.7}
                  >
                    {tab.key === 'profile' && (riderProfilePic || user?.profilePicture || (user?.photos && user.photos[0])) ? (
                      <Image
                        source={{ uri: resolveUploadUrl(riderProfilePic || user?.profilePicture || (user?.photos && user.photos[0])) }}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          borderWidth: isSelected ? 1.5 : 1,
                          borderColor: isSelected ? '#0066FF' : (isDarkMode ? '#64748B' : '#CBD5E1'),
                          marginBottom: 2,
                        }}
                      />
                    ) : (
                      <Text style={[styles.navIconText, isSelected ? styles.navIconActive : { color: isDarkMode ? '#94A3B8' : '#64748B' }]}>
                        {tab.icon}
                      </Text>
                    )}
                    <Text style={[styles.navLabelText, isSelected ? styles.navLabelActive : { color: isDarkMode ? '#94A3B8' : '#64748B' }]}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── EMERGENCY SOS & SAFETY MODAL (CALL AMBULANCE / POLICE / ACCIDENT HELP) ── */}
      <EmergencySosModal
        visible={showSosModal}
        onClose={() => setShowSosModal(false)}
        currentAddress={currentAddress}
        coords={riderCoords}
        emergencyContact={user?.phoneNumber || user?.phone || '9039978452'}
      />

      {/* ── 1. REAL-TIME HELP, SUPPORT & TICKET SYSTEM MODAL ── */}
      <RiderHelpModal
        visible={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        riderUser={user}
        activeOrder={activeDeliveries?.[0]}
        onShowIdCard={() => setShowIdCardModal(true)}
        onSelectLanguage={() => setShowLanguageModal(true)}
        onReportRain={handleReportRain}
        language={language}
        isOnline={isOnline}
      />

      {/* ── 2. DIGITAL RIDER ID CARD MODAL ── */}
      <Modal
        visible={showIdCardModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowIdCardModal(false)}
      >
        <View style={styles.idCardBackdrop}>
          <View style={styles.idCardBox}>
            {/* Header */}
            <View style={styles.idCardTopHeader}>
              <Text style={styles.idCardHeaderBrand}>🛵 RIDER PARTNER ID</Text>
              <TouchableOpacity onPress={() => setShowIdCardModal(false)} style={styles.idCardCloseBtn}>
                <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Content */}
            <View style={styles.idCardBody}>
              <View style={styles.idCardAvatarWrap}>
                {user?.profilePicture || (user?.photos && user.photos[0]) ? (
                  <Image source={{ uri: user.profilePicture || (user.photos && user.photos[0]) }} style={styles.idCardAvatarImg} />
                ) : (
                  <Text style={{ fontSize: 38 }}>👨‍💼</Text>
                )}
              </View>

              <Text style={styles.idCardName}>{displayName || 'Sachin Lodhi'}</Text>
              <View style={styles.idCardBadge}>
                <Text style={styles.idCardBadgeText}>🟢 VERIFIED PARTNER</Text>
              </View>

              <View style={styles.idCardMetaTable}>
                <View style={styles.idCardMetaRow}>
                  <Text style={styles.idCardMetaLabel}>Partner ID:</Text>
                  <Text style={styles.idCardMetaVal}>FE{(riderId || user?._id || user?.id || '2680871').toString().slice(-7).toUpperCase()}</Text>
                </View>
                <View style={styles.idCardMetaRow}>
                  <Text style={styles.idCardMetaLabel}>Vehicle:</Text>
                  <Text style={styles.idCardMetaVal}>{vehicleType} • {riderVehicleNumber}</Text>
                </View>
                <View style={styles.idCardMetaRow}>
                  <Text style={styles.idCardMetaLabel}>Service Area:</Text>
                  <Text style={styles.idCardMetaVal}>{riderCity ? `${riderCity} • All Locations` : 'Open Location Delivery'}</Text>
                </View>
                <View style={styles.idCardMetaRow}>
                  <Text style={styles.idCardMetaLabel}>Emergency Contact:</Text>
                  <Text style={styles.idCardMetaVal}>{user?.phoneNumber || user?.phone || '9039978452'}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.idCardDoneBtn}
                onPress={() => setShowIdCardModal(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.idCardDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 3. LANGUAGE SELECTION MODAL (10 LANGUAGES WITH INSTANT REAL-TIME APP TRANSLATION) ── */}
      <Modal
        visible={showLanguageModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <View style={styles.idCardBackdrop}>
          <View style={[styles.idCardBox, { padding: 18, maxHeight: '80%' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '800' }}>🌐 {t('selectLanguageTitle')}</Text>
              <TouchableOpacity onPress={() => setShowLanguageModal(false)}>
                <Text style={{ color: '#94A3B8', fontSize: 18, fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {RIDER_LANGUAGES.map((lang) => {
                const isSelected = language === lang.code;
                return (
                  <TouchableOpacity
                    key={lang.code}
                    style={[
                      styles.langOptionRow,
                      isSelected && styles.langOptionSelected,
                    ]}
                    onPress={() => handleSelectAppLanguage(lang.code)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 20 }}>{lang.flag}</Text>
                      <View>
                        <Text style={[styles.langOptionText, isSelected && { color: '#0066FF', fontWeight: '800' }]}>
                          {lang.nativeLabel}
                        </Text>
                        <Text style={{ fontSize: 11, color: isSelected ? '#0284C7' : '#94A3B8' }}>
                          {lang.label}
                        </Text>
                      </View>
                    </View>
                    {isSelected && <Text style={{ color: '#0066FF', fontSize: 18, fontWeight: '900' }}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={[styles.idCardDoneBtn, { marginTop: 14 }]}
              onPress={() => setShowLanguageModal(false)}
            >
              <Text style={styles.idCardDoneText}>{t('done')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── 4. ROLE-BASED CANCELLATION POPUP MODAL ── */}
      <CancellationPopupModal
        visible={cancellationPopup.visible}
        role="RIDER"
        orderId={cancellationPopup.orderId}
        reason={cancellationPopup.reason}
        cancelledBy={cancellationPopup.cancelledBy}
        onClose={() => setCancellationPopup({ visible: false })}
        onOk={() => setCancellationPopup({ visible: false })}
      />

      {/* ── 4B. RIDER REASON-BASED CANCEL ORDER MODAL ── */}
      <Modal
        visible={riderCancelModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setRiderCancelModalVisible(false)}
      >
        <View style={styles.idCardBackdrop}>
          <View style={[styles.idCardBox, { padding: 20, width: '92%', maxHeight: '85%' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 22 }}>⚠️</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#EF4444' }}>Cancel Delivery</Text>
              </View>
              <TouchableOpacity onPress={() => setRiderCancelModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontSize: 20, color: '#94A3B8', fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: '#64748B', marginBottom: 14 }}>
              Order #{String(orderToCancelByRider?.bookingId || orderToCancelByRider?.rideId || orderToCancelByRider?._id || '').slice(-6)}. Please select a reason for cancelling this delivery:
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 260 }}>
              {RIDER_CANCEL_REASONS.map((reason) => {
                const isSelected = riderCancelReason === reason;
                return (
                  <TouchableOpacity
                    key={reason}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: 12,
                      borderRadius: 12,
                      backgroundColor: isSelected ? '#FEF2F2' : '#F8FAFC',
                      borderWidth: 1.5,
                      borderColor: isSelected ? '#EF4444' : '#E2E8F0',
                      marginBottom: 8,
                    }}
                    onPress={() => setRiderCancelReason(reason)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        borderWidth: 2,
                        borderColor: isSelected ? '#EF4444' : '#94A3B8',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 10,
                      }}
                    >
                      {isSelected && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' }} />}
                    </View>
                    <Text
                      style={{
                        fontSize: 13.5,
                        fontWeight: isSelected ? '700' : '500',
                        color: isSelected ? '#991B1B' : '#334155',
                        flex: 1,
                      }}
                    >
                      {reason}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: '#F1F5F9',
                  alignItems: 'center',
                }}
                onPress={() => setRiderCancelModalVisible(false)}
                disabled={isSubmittingRiderCancel}
              >
                <Text style={{ color: '#64748B', fontWeight: '700', fontSize: 14 }}>Keep Order</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1.5,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: '#EF4444',
                  alignItems: 'center',
                  opacity: isSubmittingRiderCancel ? 0.7 : 1,
                }}
                onPress={handleConfirmRiderCancel}
                disabled={isSubmittingRiderCancel}
              >
                {isSubmittingRiderCancel ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>Confirm Cancel</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 5. POCKET INTERACTIVE CALENDAR POPUP MODAL ── */}
      <Modal
        visible={showCalendarModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowCalendarModal(false)}
      >
        <View style={styles.idCardBackdrop}>
          <View style={[styles.idCardBox, { padding: 18, width: '92%', maxHeight: '85%' }]}>
            {/* Calendar Modal Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '800' }}>
                🗓️ {t('chooseDate')}
              </Text>
              <TouchableOpacity onPress={() => setShowCalendarModal(false)} style={{ padding: 4 }}>
                <Text style={{ color: '#94A3B8', fontSize: 18, fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Calendar Month Navigation */}
            <View style={[styles.calendarHeaderNav, { marginBottom: 10 }]}>
              <TouchableOpacity
                style={[styles.calendarNavBtn, { backgroundColor: '#334155' }]}
                onPress={() => setCalendarViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                activeOpacity={0.7}
              >
                <Text style={[styles.calendarNavBtnText, { color: '#FFFFFF' }]}>‹</Text>
              </TouchableOpacity>

              <View style={{ alignItems: 'center' }}>
                <Text style={[styles.calendarMonthText, { color: '#F8FAFC' }]}>
                  {monthYearLabel}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TouchableOpacity
                  style={styles.calendarTodayBtn}
                  onPress={() => {
                    const now = new Date();
                    setCalendarViewDate(now);
                    const y = now.getFullYear();
                    const m = String(now.getMonth() + 1).padStart(2, '0');
                    const d = String(now.getDate()).padStart(2, '0');
                    setSelectedCalendarDate(`${y}-${m}-${d}`);
                    setCalendarQuickFilter('today');
                    setOrderDateFilter('today');
                    setShowCalendarModal(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.calendarTodayBtnText}>Today</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.calendarNavBtn, { backgroundColor: '#334155' }]}
                  onPress={() => setCalendarViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.calendarNavBtnText, { color: '#FFFFFF' }]}>›</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Week Days Header */}
            <View style={styles.calendarWeekHeader}>
              {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((wDay, idx) => (
                <Text key={idx} style={[styles.calendarWeekDayText, { color: '#94A3B8' }]}>
                  {wDay}
                </Text>
              ))}
            </View>

            {/* 7-Column Days Grid */}
            <View style={styles.calendarGrid}>
              {calendarGridCells.map((cell) => {
                if (!cell.isCurrentMonth) {
                  return <View key={cell.key} style={styles.calendarDayCell} />;
                }
                return (
                  <TouchableOpacity
                    key={cell.key}
                    style={[
                      styles.calendarDayCell,
                      cell.isToday && styles.calendarDayCellToday,
                      cell.isSelected && styles.calendarDayCellSelected,
                      !cell.isSelected && { backgroundColor: '#1E293B' },
                    ]}
                    onPress={() => {
                      if (cell.dateKey) {
                        setSelectedCalendarDate(cell.dateKey);
                        setCalendarQuickFilter('custom');
                        setOrderDateFilter('custom');
                        setShowCalendarModal(false);
                      }
                    }}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.calendarDayNum,
                        cell.isToday && { color: '#0066FF', fontWeight: '900' },
                        cell.isSelected && styles.calendarDayNumSelected,
                        !cell.isSelected && !cell.isToday && { color: '#F8FAFC' },
                      ]}
                    >
                      {cell.dayNum}
                    </Text>

                    {cell.hasOrders && !cell.isSelected && (
                      <View style={styles.calendarDayDot} />
                    )}
                    {cell.earnings > 0 && (
                      <Text
                        style={[
                          styles.calendarDayEarnings,
                          cell.isSelected && styles.calendarDayEarningsSelected,
                        ]}
                        numberOfLines={1}
                      >
                        ₹{cell.earnings}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.idCardDoneBtn, { marginTop: 16 }]}
              onPress={() => setShowCalendarModal(false)}
            >
              <Text style={styles.idCardDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── 6. POCKET DEPOSIT CASH & UPI MODAL ── */}
      <Modal
        visible={showDepositModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowDepositModal(false)}
      >
        <View style={styles.idCardBackdrop}>
          <View style={[styles.idCardBox, { padding: 20, width: '92%' }]}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 22 }}>👛</Text>
                <Text style={{ color: '#FFFFFF', fontSize: 17.5, fontWeight: '800' }}>Deposit into Pocket</Text>
              </View>
              <TouchableOpacity onPress={() => setShowDepositModal(false)} style={{ padding: 4 }}>
                <Text style={{ color: '#94A3B8', fontSize: 18, fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Current Balance Notice */}
            <View style={{ backgroundColor: '#272730', borderRadius: 12, padding: 12, marginBottom: 14 }}>
              <Text style={{ color: '#94A3B8', fontSize: 12, fontWeight: '600' }}>Current Pocket Balance</Text>
              <Text style={{ color: pocketBalance < 0 ? '#EF4444' : '#22C55E', fontSize: 20, fontWeight: '900', marginTop: 2 }}>
                {pocketBalance < 0 ? `-₹${Math.abs(pocketBalance).toFixed(2)}` : `₹${pocketBalance.toFixed(2)}`}
              </Text>
            </View>

            {/* Amount Input */}
            <Text style={{ color: '#CBD5E1', fontSize: 13, fontWeight: '700', marginBottom: 6 }}>Enter Deposit Amount (₹)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E1E24', borderRadius: 12, borderWidth: 1, borderColor: '#3B82F6', paddingHorizontal: 14, marginBottom: 12 }}>
              <Text style={{ color: '#0066FF', fontSize: 20, fontWeight: '900', marginRight: 6 }}>₹</Text>
              <TextInput
                style={{ flex: 1, color: '#FFFFFF', fontSize: 18, fontWeight: '800', paddingVertical: 10 }}
                keyboardType="numeric"
                value={depositAmountInput}
                onChangeText={setDepositAmountInput}
                placeholder="200"
                placeholderTextColor="#64748B"
              />
            </View>

            {/* Quick Amount Chips */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {[100, 200, 500, 1000, ...(pocketBalance < 0 ? [Math.ceil(Math.abs(pocketBalance))] : [])].map((amt, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={{
                    backgroundColor: depositAmountInput === String(amt) ? '#0066FF' : '#272730',
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: depositAmountInput === String(amt) ? '#0066FF' : '#3F3F46',
                  }}
                  onPress={() => setDepositAmountInput(String(amt))}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: depositAmountInput === String(amt) ? '#FFFFFF' : '#CBD5E1', fontSize: 12.5, fontWeight: '700' }}>
                    ₹{amt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Payment Method Selector */}
            <Text style={{ color: '#CBD5E1', fontSize: 13, fontWeight: '700', marginBottom: 8 }}>Payment Method</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
              {[
                { key: 'UPI', label: '⚡ Instant UPI' },
                { key: 'GPAY', label: 'GPay / PhonePe' },
                { key: 'PAYTM', label: 'Paytm / Net Banking' },
              ].map((m) => (
                <TouchableOpacity
                  key={m.key}
                  style={{
                    flex: 1,
                    backgroundColor: selectedDepositMethod === m.key ? 'rgba(0, 102, 255, 0.15)' : '#272730',
                    borderWidth: 1.5,
                    borderColor: selectedDepositMethod === m.key ? '#0066FF' : '#3F3F46',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                  onPress={() => setSelectedDepositMethod(m.key as any)}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: selectedDepositMethod === m.key ? '#0066FF' : '#94A3B8', fontSize: 11, fontWeight: '800', textAlign: 'center' }}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Submit Deposit Button */}
            <TouchableOpacity
              style={[styles.idCardDoneBtn, { backgroundColor: '#16A34A' }]}
              onPress={handlePerformDeposit}
              disabled={isProcessingDeposit}
              activeOpacity={0.8}
            >
              {isProcessingDeposit ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.idCardDoneText}>Deposit ₹{depositAmountInput || '0'} Now ➔</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default DeliveryRiderHomeScreen;

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  // ── Feed Screen Container & Overlays ──
  feedMapContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#FFFFFF',
  },
  headerSwitchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 22,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  switchDotWhite: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  headerSwitchPillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  subHeaderPillsRow: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  segmentedCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    borderRadius: 24,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  segBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
  },
  segBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  segBtnText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
  },
  segBtnTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  menuCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    elevation: 4,
  },
  floatingAddressPill: {
    position: 'absolute',
    left: 14,
    right: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },
  floatingAddressText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  bottomNavContainer: {
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingBottom: 4,
  },
  bottomArrowHandleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 3,
    paddingBottom: 1,
  },
  bottomNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 2,
  },
  floatingArrowTouch: {
    paddingHorizontal: 40,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingGpsBtn: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 6,
    zIndex: 10,
  },

  // ── Clean Partner Dashboard Styles ──
  whiteModalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  whiteTopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  whiteChevronHandleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  whiteChevronHandle: {
    paddingHorizontal: 40,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  whiteProgressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  whiteProgressHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  whiteProgressTitle: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '800',
  },
  whiteStatsGrid: {
    marginTop: 2,
  },
  whiteStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  whiteStatBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  whiteStatVal: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '900',
  },
  whiteStatLabel: {
    color: '#64748B',
    fontSize: 12.5,
    fontWeight: '700',
    marginTop: 4,
  },
  feedBottomOverlayWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  mapStatusCard: {
    marginHorizontal: 14,
    marginBottom: 8,
    backgroundColor: 'rgba(39, 39, 42, 0.95)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    elevation: 6,
  },
  mapStatusTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  mapStatusSub: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  chevronHandleWrap: {
    alignSelf: 'center',
    width: 40,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  chevronHandleText: {
    color: '#CBD5E1',
    fontSize: 22,
    fontWeight: '900',
  },
  cashLimitWarningBanner: {
    backgroundColor: '#F59E0B',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  cashLimitTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  cashLimitSub: {
    color: '#451A03',
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 1,
  },
  cashDepositBtn: {
    backgroundColor: '#FDE68A',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  cashDepositBtnText: {
    color: '#78350F',
    fontSize: 12.5,
    fontWeight: '800',
  },

  // ── Top Header Styles ──
  topHeader: {
    backgroundColor: '#0F172A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    elevation: 4,
  },

  // ── GPS Address Bar ──
  gpsAddressBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    borderBottomWidth: 1,
    borderBottomColor: '#BFDBFE',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  gpsAddressIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  gpsAddressText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
  },
  gpsRefreshIcon: {
    fontSize: 13,
    marginLeft: 6,
  },

  headerBackBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  headerDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 7,
  },
  headerPillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  headerNotifDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FDE047',
  },
  headerAvatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Feed Screen Components ──
  arrowRow: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 6,
  },
  downArrowText: {
    color: '#0066FF',
    fontSize: 18,
    fontWeight: '900',
    transform: [{ rotate: '180deg' }],
  },
  referralCard: {
    marginHorizontal: 14,
    backgroundColor: '#1D4ED8',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 90,
    elevation: 3,
    marginBottom: 14,
  },
  newTag: {
    backgroundColor: '#FACC15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  newTagText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '800',
  },
  referralTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 2,
  },
  referralSub: {
    color: '#BFDBFE',
    fontSize: 12,
    fontWeight: '600',
  },
  referralGraphicWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Big Online / Offline Action Card ──
  mainToggleCard: {
    marginHorizontal: 14,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    marginBottom: 14,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
  },
  mainToggleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  statusDotLarge: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  mainToggleHeading: {
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 2,
  },
  mainToggleSub: {
    color: '#64748B',
    fontSize: 12.5,
    fontWeight: '500',
  },
  bigActionBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  bigActionBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // ── Exact Zomato Screen 4 Styles ──
  zomatoGigBar: {
    marginHorizontal: 14,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  zomatoBlueDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#38BDF8',
    marginRight: 8,
  },
  zomatoGigText: {
    color: '#F1F5F9',
    fontSize: 12.5,
    fontWeight: '700',
    flex: 1,
  },
  zomatoBookBtn: {
    backgroundColor: '#22C55E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 10,
  },
  zomatoBookBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  zomatoProgressCard: {
    marginHorizontal: 14,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    elevation: 3,
  },
  zomatoProgressHeader: {
    marginBottom: 14,
  },
  zomatoProgressTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  zomatoProgressGrid: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 14,
  },
  zomatoProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  zomatoProgressRowDivider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 12,
  },
  zomatoProgressCol: {
    flex: 1,
  },
  zomatoProgressColDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#334155',
    marginHorizontal: 12,
  },
  zomatoProgressNum: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 2,
  },
  zomatoProgressLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  zomatoOffersSection: {
    marginHorizontal: 14,
    marginBottom: 14,
  },
  zomatoOffersHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  zomatoOffersTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  zomatoOffersSeeAll: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0066FF',
  },
  zomatoOfferCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    elevation: 2,
  },
  zomatoOfferCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  zomatoOfferCardSub: {
    fontSize: 11.5,
    color: '#64748B',
  },
  zomatoOfferCardBadge: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    marginLeft: 8,
  },
  zomatoOfferCardBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0066FF',
  },

  // ── Real Trips Card ──
  tripsCard: {
    marginHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    elevation: 2,
    marginBottom: 14,
  },
  tripsIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripsLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  tripsValue: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '900',
  },
  tripsBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  tripsBadgeText: {
    color: '#0066FF',
    fontSize: 12,
    fontWeight: '800',
  },

  // ── Real Orders Tab & Filter Chips Styles ──
  orderFilterScrollWrap: {
    marginVertical: 10,
  },
  orderFilterScrollContent: {
    paddingHorizontal: 2,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  orderFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  orderFilterChipText: {
    fontSize: 13,
    letterSpacing: 0.2,
  },
  orderFilterBadge: {
    marginLeft: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  orderFilterBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  realOrderCard: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  realOrderHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  realOrderIdText: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  realOrderStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  realOrderStatusBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  realOrderMetaBox: {
    marginBottom: 8,
  },
  realOrderStoreName: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  realOrderCustName: {
    fontSize: 12,
    fontWeight: '600',
  },
  realOrderRouteBox: {
    backgroundColor: 'rgba(0, 102, 255, 0.04)',
    borderRadius: 10,
    padding: 8,
    marginBottom: 10,
    gap: 4,
  },
  realOrderRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  realOrderRouteText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  realOrderCancelReasonBox: {
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#DC2626',
  },
  realOrderCancelReasonText: {
    color: '#DC2626',
    fontSize: 11.5,
    fontWeight: '700',
  },
  realOrderBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 10,
  },
  realOrderAmountText: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 1,
  },
  realOrderTrackBtn: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    elevation: 2,
  },
  realOrderTrackBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  // ── Active Order Card ──
  activeOrderCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#0066FF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    elevation: 2,
  },
  activeOrderId: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
  orderBadge: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  orderBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  orderCustName: {
    color: '#1E293B',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  orderAddress: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
    marginBottom: 8,
  },
  orderBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#BFDBFE',
    paddingTop: 8,
  },
  orderFareText: {
    color: '#0066FF',
    fontSize: 16,
    fontWeight: '800',
  },
  trackBtn: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  trackBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },

  // ── Pocket Screen (Orange Themed) ──
  pocketHeroCard: {
    marginHorizontal: 14,
    backgroundColor: '#0066FF',
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 18,
    elevation: 4,
  },
  pocketEarningsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  pocketEarningsDate: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  pocketBigAmount: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
  },
  dividerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginVertical: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#BFDBFE',
  },
  dividerLabel: {
    color: '#0066FF',
    fontSize: 12,
    fontWeight: '800',
    marginHorizontal: 12,
  },
  pocketInfoCard: {
    marginHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    elevation: 2,
  },
  pocketRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  pocketRowTitle: {
    color: '#1E293B',
    fontSize: 14,
    fontWeight: '600',
  },
  pocketRowVal: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
  rowChevron: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 4,
  },
  dashedDivider: {
    height: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    marginVertical: 6,
  },
  pocketAlertBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  alertExclamation: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  alertExclamationText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
  },
  pocketAlertText: {
    color: '#92400E',
    fontWeight: '800',
    fontSize: 12.5,
    flex: 1,
  },
  pocketBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  depositBtn: {
    flex: 1,
    backgroundColor: '#0066FF',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  depositBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  withdrawBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  withdrawBtnText: {
    color: '#475569',
    fontWeight: '800',
    fontSize: 14,
  },
  tipsCard: {
    marginHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    elevation: 2,
  },
  tipsTitle: {
    color: '#1E293B',
    fontSize: 14,
    fontWeight: '600',
  },
  tipsAmount: {
    color: '#0066FF',
    fontSize: 15,
    fontWeight: '800',
  },

  // ── Orders Tab Styles ──
  screenHeading: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 12,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  completedOrderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  completedId: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 14,
  },
  completedTag: {
    color: '#16A34A',
    fontWeight: '700',
    fontSize: 12,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },

  // ── Profile Tab Styles ──
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 14,
    elevation: 2,
  },
  profileAvatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#0066FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  profileAvatarText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
  },
  profileNameText: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
  },
  profileRoleText: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 2,
  },
  profileBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  profileBadgeText: {
    color: '#0066FF',
    fontWeight: '700',
    fontSize: 12,
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  menuCardText: {
    flex: 1,
    color: '#1E293B',
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Incoming Live Request Modal ──
  requestOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
    padding: 20,
  },
  requestCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#0066FF',
    borderRadius: 20,
    padding: 18,
    width: '100%',
    elevation: 10,
    maxHeight: '90%',
  },
  requestHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  requestHeading: {
    color: '#0066FF',
    fontSize: 16,
    fontWeight: '900',
  },
  requestOrderId: {
    backgroundColor: '#EFF6FF',
    color: '#0066FF',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },

  // Restaurant Pickup Section
  restaurantPickupCard: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  restaurantPickupLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0066FF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  restaurantPickupName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  restaurantPickupAddr: {
    fontSize: 12,
    color: '#475569',
    marginTop: 3,
    lineHeight: 16,
  },
  directionLinkBtn: {
    marginTop: 8,
    backgroundColor: '#0066FF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  directionLinkText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },

  // Distance & Travel Time Meta
  requestMetaRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  requestMetaBadge: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    textAlign: 'center',
  },

  // Dropoff Section
  dropoffCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  dropoffLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  dropoffCust: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  dropoffAddr: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
    lineHeight: 16,
  },
  itemsCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  itemsCardLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400E',
    textTransform: 'uppercase',
  },
  itemsCardContent: {
    fontSize: 12,
    fontWeight: '700',
    color: '#78350F',
    marginTop: 3,
    lineHeight: 16,
  },

  // Earning Row
  earningRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 2,
  },
  earningLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#15803D',
  },
  earningAmount: {
    fontSize: 17,
    fontWeight: '900',
    color: '#16A34A',
  },

  requestCust: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  requestAddr: {
    color: '#475569',
    fontSize: 13,
    marginBottom: 10,
  },
  requestFare: {
    color: '#16A34A',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    marginVertical: 4,
  },
  rejectBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtnText: {
    color: '#EF4444',
    fontWeight: '800',
    fontSize: 14,
  },
  acceptBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
  },

  // ── Bottom Navigation ──
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 64,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#BFDBFE',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 6,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  navCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  navIconText: {
    fontSize: 20,
    color: '#94A3B8',
    marginBottom: 3,
  },
  navIconActive: {
    color: '#0066FF',
  },
  navLabelText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  navLabelActive: {
    color: '#0066FF',
    fontWeight: '800',
  },

  // ── ZOMATO ORDER REQUEST POPUP STYLES ──
  zomatoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 99999,
  },
  zomatoMapContainer: {
    height: Dimensions.get('window').height * 0.32,
    position: 'relative',
    backgroundColor: '#E5E7EB',
  },
  zomatoDenyBtn: {
    position: 'absolute',
    top: 48,
    right: 18,
    backgroundColor: 'rgba(20, 20, 20, 0.85)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
    zIndex: 20,
  },
  zomatoDenyText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  zomatoSheetCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 8,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 24,
  },
  zomatoNewOrderBadge: {
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#00C06D',
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 6,
    marginTop: -20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  zomatoNewOrderText: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 15,
  },
  zomatoEarningsHeading: {
    textAlign: 'center',
    color: '#1F2937',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 8,
  },
  zomatoEarningsAmount: {
    textAlign: 'center',
    fontSize: 42,
    fontWeight: '900',
    color: '#000000',
    marginVertical: 2,
    letterSpacing: -0.5,
  },
  zomatoBreakdownBox: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    marginHorizontal: 20,
    marginTop: 6,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  zomatoBreakdownCol: {
    flex: 1,
    alignItems: 'center',
  },
  zomatoBreakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  zomatoBreakdownVal: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000000',
  },
  zomatoBreakdownLbl: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },
  zomatoBreakdownDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E5E7EB',
  },
  zomatoDistanceSummary: {
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
    marginVertical: 8,
  },
  zomatoDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 24,
    marginVertical: 10,
  },
  zomatoPickupSection: {
    paddingHorizontal: 24,
  },
  zomatoPickupBadge: {
    backgroundColor: '#4B5563',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  zomatoPickupBadgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.3,
  },
  zomatoRestaurantName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#000000',
    marginTop: 6,
  },
  zomatoRestaurantAddr: {
    fontSize: 14,
    color: '#4B5563',
    marginTop: 3,
    lineHeight: 20,
  },
  zomatoEtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  zomatoEtaText: {
    fontSize: 14,
    color: '#4B5563',
    fontWeight: '500',
  },
  zomatoAcceptBtn: {
    backgroundColor: '#00C06D',
    height: 56,
    borderRadius: 28,
    marginHorizontal: 20,
    marginTop: 18,
    marginBottom: 6,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00C06D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  zomatoAcceptText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  // ── Swipe-To-Accept Slider Styles ──
  swipeTrack: {
    backgroundColor: '#1E232B',
    height: 56,
    borderRadius: 28,
    marginHorizontal: 16,
    marginBottom: 6,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#00C06D',
  },
  swipeTrackText: {
    color: '#00C06D',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  swipeThumb: {
    position: 'absolute',
    left: 3,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#00C06D',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  swipeThumbArrow: {
    color: '#0F172A',
    fontSize: 22,
    fontWeight: '900',
  },

  // ── Items Box in Request Modal ──
  requestItemsBox: {
    marginTop: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  requestItemsTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 2,
  },
  requestItemsText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#1E293B',
  },

  // ── Requirement 1 & 2: Dedicated Live Active Order Card Styles ──
  liveActiveCardSection: {
    marginHorizontal: 14,
    marginTop: 16,
    marginBottom: 10,
  },
  liveActiveCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  liveActivePulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22C55E',
    marginRight: 8,
  },
  liveActiveCardHeaderTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
    flex: 1,
  },
  liveActiveStatusBadge: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  liveActiveStatusBadgeText: {
    color: '#15803D',
    fontSize: 11,
    fontWeight: '800',
  },
  liveActiveCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#00C06D',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  liveCardTopInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 10,
  },
  liveCardOrderIdText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748B',
  },
  liveCardEarningText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#16A34A',
  },
  liveCardContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  liveCardMapWrap: {
    width: 85,
    height: 85,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#E2E8F0',
  },
  liveCardInfoCol: {
    flex: 1,
  },
  liveCardRestoName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  liveCardRestoAddr: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 6,
  },
  liveCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveCardDistLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  liveCardTapToExpand: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#00C06D',
  },

  // ── Floating Compact Ride Bar (Above Bottom Tabs) ──
  compactRideBar: {
    position: 'absolute',
    bottom: 74,
    left: 12,
    right: 12,
    backgroundColor: '#0F172A',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 12,
    borderWidth: 1.5,
    borderColor: '#00C06D',
    zIndex: 999,
  },
  compactRideBarIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactRideBarTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  compactRideBarSub: {
    color: '#00C06D',
    fontSize: 11.5,
    fontWeight: '700',
    marginTop: 1,
  },
  compactRideBarChevronWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactRideBarChevron: {
    color: '#00C06D',
    fontSize: 18,
    fontWeight: '900',
  },

  // ════════════════════════════════════════════════════════════════════════════
  // ── ZOMATO STYLE PIXEL-PERFECT DARK THEME PROFILE STYLES ──
  // ════════════════════════════════════════════════════════════════════════════
  zpContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  zpHeaderNav: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  zpBackBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  zpBackArrow: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '400',
  },
  zpScrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  zpProfileHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 6,
    marginBottom: 16,
  },
  zpProfileInfoCol: {
    flex: 1,
    paddingRight: 14,
  },
  zpNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  zpNameText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  zpNameChevron: {
    color: '#9CA3AF',
    fontSize: 18,
    fontWeight: '600',
  },
  zpPartnerIdText: {
    color: '#9CA3AF',
    fontSize: 13.5,
    fontWeight: '500',
    marginTop: 3,
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  zpRatingBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F0F12',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2D2D35',
    gap: 4,
  },
  zpRatingStar: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  zpRatingText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  zpAvatarWrap: {
    position: 'relative',
  },
  zpAvatarImg: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#374151',
    borderWidth: 2,
    borderColor: '#3F3F46',
  },
  zpAvatarPlaceholder: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#3F3F46',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#52525B',
  },
  zpAvatarPlaceholderText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
  },
  zpAvatarBadgeIconWrap: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#27272A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#18181B',
  },
  zpTierBanner: {
    backgroundColor: '#2B2B30',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#37373F',
  },
  zpTierLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  zpHexagonIcon: {
    color: '#D1D5DB',
    fontSize: 18,
  },
  zpTierTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  zpTierRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  zpScoreText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
  },
  zpTierChevron: {
    color: '#9CA3AF',
    fontSize: 16,
    fontWeight: '600',
  },
  zpActionGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  zpActionCard: {
    flex: 1,
    backgroundColor: '#27272C',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#33333A',
  },
  zpGigIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  zpGigIconLetter: {
    color: '#18181B',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 22,
  },
  zpActionBigEmoji: {
    fontSize: 24,
    marginBottom: 8,
  },
  zpActionCardText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  zpBannerCard: {
    backgroundColor: '#27272C',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#33333A',
  },
  zpBannerTitle: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
    marginBottom: 3,
  },
  zpBannerSub: {
    color: '#A1A1AA',
    fontSize: 12.5,
    fontWeight: '500',
  },
  zpCoachAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3F3F46',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E11D48',
  },
  zpCoinWrap: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zpCoinEmoji: {
    fontSize: 34,
  },
  zpSectionWrap: {
    marginTop: 6,
    marginBottom: 12,
  },
  zpSectionHeader: {
    color: '#A1A1AA',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    marginLeft: 4,
  },
  zpGroupCard: {
    backgroundColor: '#232328',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#303038',
  },
  zpGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  zpRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  zpRowIcon: {
    fontSize: 19,
  },
  zpRowTitle: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '600',
  },
  zpRowChevron: {
    color: '#71717A',
    fontSize: 18,
    fontWeight: '600',
  },
  zpRowDivider: {
    height: 1,
    backgroundColor: '#2E2E36',
    marginHorizontal: 16,
  },
  zpNewBadge: {
    backgroundColor: '#F43F5E',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  zpNewBadgeText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  zpLogoutBtn: {
    marginTop: 10,
    backgroundColor: '#232328',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3F2228',
  },
  zpLogoutText: {
    color: '#F87171',
    fontSize: 14,
    fontWeight: '800',
  },

  // ── Rider Profile Details Sub-Screen Styles (Pixel Perfect to Screenshot) ──
  rdContainer: {
    flex: 1,
    backgroundColor: '#0F0F12',
  },
  rdHeaderNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: '#16161B',
    borderBottomWidth: 1,
    borderBottomColor: '#26262D',
  },
  rdBackBtn: {
    padding: 4,
    marginRight: 12,
  },
  rdBackArrow: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  rdHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 17.5,
    fontWeight: '700',
  },
  rdScrollContent: {
    paddingBottom: 130,
  },
  rdHeroBannerWrap: {
    width: '100%',
    height: 220,
    backgroundColor: '#1E1E24',
    overflow: 'hidden',
  },
  rdHeroImg: {
    width: '100%',
    height: '100%',
  },
  rdHeroPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#25252C',
  },
  rdPaddingContent: {
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  rdSectionHeader: {
    color: '#CBD5E1',
    fontSize: 13.5,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 2,
  },
  rdCard: {
    backgroundColor: '#222227',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2F2F37',
  },
  rdCardRowFull: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rdNameCodeText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  rdCardRowInline: {
    paddingHorizontal: 16,
    paddingVertical: 13.5,
  },
  rdCardRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13.5,
  },
  rdLabelText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },
  rdValueText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  rdVehicleNumText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  rdGreenEditIcon: {
    color: '#10B981',
    fontSize: 16,
    marginLeft: 6,
    fontWeight: '800',
  },
  rdRightEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rdDivider: {
    height: 1,
    backgroundColor: '#2D2D35',
    marginHorizontal: 16,
  },
  rdCoachCard: {
    backgroundColor: '#222227',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#2F2F37',
  },
  rdCoachLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rdCoachAvatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#3F3F46',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E11D48',
  },
  rdCoachNameText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 12,
  },
  rdCoachChevronCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#34343C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rdCoachChevron: {
    color: '#9CA3AF',
    fontSize: 16,
    fontWeight: '700',
  },

  // ── Help & Support Bottom Sheet Styles (Pixel Perfect to Screenshot) ──
  bsBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  bsSheetContainer: {
    backgroundColor: '#1C1C21',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 28,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: '#2A2A33',
  },
  bsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
  },
  bsHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
    marginRight: 10,
    letterSpacing: 0.2,
  },
  bsCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2A2A32',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bsCloseText: {
    color: '#CBD5E1',
    fontSize: 15,
    fontWeight: '700',
  },
  bsDivider: {
    height: 1,
    backgroundColor: '#2A2A33',
    marginBottom: 4,
  },
  bsItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  bsIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#282830',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: '#383844',
  },
  bsItemIconText: {
    fontSize: 20,
  },
  bsTextCol: {
    flex: 1,
  },
  bsItemTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  bsItemSub: {
    color: '#94A3B8',
    fontSize: 12.5,
    fontWeight: '500',
  },
  bsChevron: {
    color: '#71717A',
    fontSize: 20,
    fontWeight: '600',
    marginLeft: 8,
  },
  bsItemDivider: {
    height: 1,
    backgroundColor: '#272730',
    marginLeft: 56,
  },

  // ── Digital ID Card Modal Styles ──
  idCardBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  idCardBox: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1E1E24',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#33333E',
  },
  idCardTopHeader: {
    backgroundColor: '#0066FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  idCardHeaderBrand: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  idCardCloseBtn: {
    padding: 4,
  },
  idCardBody: {
    padding: 20,
    alignItems: 'center',
  },
  idCardAvatarWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2E2E38',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#0066FF',
    overflow: 'hidden',
  },
  idCardAvatarImg: {
    width: '100%',
    height: '100%',
  },
  idCardName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  idCardBadge: {
    backgroundColor: '#14532D',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginBottom: 16,
  },
  idCardBadgeText: {
    color: '#4ADE80',
    fontSize: 11,
    fontWeight: '800',
  },
  idCardMetaTable: {
    width: '100%',
    backgroundColor: '#272730',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  idCardMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  idCardMetaLabel: {
    color: '#94A3B8',
    fontSize: 12.5,
    fontWeight: '600',
  },
  idCardMetaVal: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  idCardDoneBtn: {
    width: '100%',
    backgroundColor: '#0066FF',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  idCardDoneText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  // ── Language Selection Styles ──
  langOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#272730',
    borderRadius: 12,
    marginBottom: 10,
  },
  langOptionSelected: {
    borderWidth: 1.5,
    borderColor: '#0066FF',
    backgroundColor: 'rgba(0, 102, 255, 0.1)',
  },
  langOptionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },

  // ── Rider Photo Badge ──
  rdChangePhotoBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0, 102, 255, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  rdChangePhotoBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Pocket Real Calendar Styles ──
  calendarQuickFiltersRow: {
    flexDirection: 'row',
    marginHorizontal: 14,
    marginBottom: 12,
    gap: 8,
  },
  calendarFilterChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarFilterChipActive: {
    backgroundColor: '#0066FF',
    borderColor: '#0066FF',
  },
  calendarFilterChipText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  calendarFilterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  pocketCalendarCard: {
    marginHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    elevation: 2,
  },
  calendarHeaderNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  calendarNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarNavBtnText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0F172A',
    marginTop: -2,
  },
  calendarMonthText: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  calendarTodayBtn: {
    backgroundColor: 'rgba(0, 102, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0066FF',
  },
  calendarTodayBtnText: {
    color: '#0066FF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  calendarWeekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.2)',
    marginBottom: 8,
  },
  calendarWeekDayText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    width: '14.28%',
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDayCell: {
    width: '14.28%',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 2,
    position: 'relative',
  },
  calendarDayCellToday: {
    borderWidth: 1.5,
    borderColor: '#0066FF',
  },
  calendarDayCellSelected: {
    backgroundColor: '#0066FF',
  },
  calendarDayNum: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  calendarDayNumSelected: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  calendarDayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#16A34A',
    marginTop: 2,
  },
  calendarDayEarnings: {
    fontSize: 9,
    fontWeight: '800',
    color: '#16A34A',
    marginTop: 1,
  },
  calendarDayEarningsSelected: {
    color: '#FFFFFF',
  },
  pocketSelectedSummaryCard: {
    marginHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
  },
  pocketSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  pocketSummaryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
  },
  pocketSummaryAmount: {
    fontSize: 20,
    fontWeight: '900',
    color: '#16A34A',
  },
  pocketMetricsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  pocketMetricBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  pocketMetricVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 3,
    marginBottom: 2,
  },
  pocketMetricLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },
  pocketEmptyTrips: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  pocketEmptyTripsText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  pocketTripCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
    elevation: 1,
  },
  pocketTripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pocketTripStore: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
  },
  pocketTripEarningBadge: {
    backgroundColor: 'rgba(22, 163, 74, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pocketTripEarningText: {
    color: '#16A34A',
    fontSize: 13,
    fontWeight: '800',
  },
  pocketTripAddress: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  pocketTripTime: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },

  // ── Pocket Calendar Modal Trigger Button ──
  pocketOpenCalendarBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pocketOpenCalendarBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
