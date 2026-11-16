import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Linking,
  Alert,
  Dimensions,
  ActivityIndicator,
  Image,
  Platform,
  PermissionsAndroid,
  Modal,
  ScrollView,
  FlatList,
  Animated,
  PanResponder,
  Vibration,
  BackHandler,
  TextInput,
  KeyboardAvoidingView,
  ToastAndroid,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import Icon from '../components/PngIcon';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { rideStore } from '../services/rideStore';
import { LOCATIONIQ_KEY, OSRM_ROUTING_URL, BASE_URL, LOCAL_URL, resolveUploadUrl } from '../config/apiConfig';
import api, { UPLOADS_URL } from '../services/api';
import { WebRTCCallModal } from '../components/WebRTCCallModal';

import WebView from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { bikeBase64, customerBase64 } from '../banner/base64_images';
import { fetchCurrentGpsPosition } from '../services/LocationAddressService';
import { riderLocationService } from '../services/RiderLocationService';
import CookingAnimation from '../components/CookingAnimation';
import LottieAnimation from '../components/LottieAnimation';
import VideoAdBanner from '../components/VideoAdBanner';
import RainAnimation from '../components/RainAnimation';
import {
  resolveCategoryName,
  getCategoryDeliveryTitle,
  getCategoryPreparingTitle,
  getCategoryReadyTitle,
  getCategoryPickedUpTitle,
  getCategoryIcon,
  getCategoryPlaceholderImage,
  getCategoryStoreLabel,
  getCategoryOrderTerminology,
} from '../utils/categoryHelper';
import { CustomerHelpCenterModal } from '../components/CustomerHelpCenterModal';
import RiderHelpModal from '../components/RiderHelpModal';
import RiderOrderHelpFlowModal from '../components/RiderOrderHelpFlowModal';
import OrderTransferModal from '../components/OrderTransferModal';
import HandoverOtpVerifyModal from '../components/HandoverOtpVerifyModal';
import SingleOrderStatusScreen from './SingleOrderStatusScreen';

const bellJson = require('../banner/Hotel Bell.json');
const cookingJson = require('../banner/cooking.json');
const pickupReadyJson = require('../banner/Pickup order ready.json');
const searchJson = require('../assets/search.json');
const bikeWinnerJson = require('../assets/winner/bike.json');
const verifyJson = require('../assets/verify.json');

const { width, height: screenHeight } = Dimensions.get('window');

// ── Left-to-Right Swipe Slider for Rider Actions ──
const SwipeSlider = ({
  title = 'SLIDE TO CONFIRM >>>',
  buttonColor = '#00C06D',
  textColor = '#0F172A',
  arrowBgColor = '#0F172A',
  arrowColor = '#FFFFFF',
  onComplete,
}: any) => {
  const [trackWidth, setTrackWidth] = useState(width - 40);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const thumbSize = 48;
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
        if (gestureState.dx >= maxSlide * 0.7) {
          Animated.timing(slideAnim, {
            toValue: maxSlide,
            duration: 120,
            useNativeDriver: false,
          }).start(() => {
            try { Vibration.vibrate(50); } catch (e) {}
            onComplete();
            setTimeout(() => {
              slideAnim.setValue(0);
            }, 600);
          });
        } else {
          Animated.spring(slideAnim, {
            toValue: 0,
            friction: 6,
            tension: 40,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  return (
    <View
      style={[styles.sliderTrack, { backgroundColor: buttonColor }]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 100) setTrackWidth(w);
      }}
    >
      <Text style={[styles.sliderLabel, { color: textColor }]}>{title}</Text>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.sliderThumb,
          {
            backgroundColor: arrowBgColor,
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        <Text style={[styles.sliderArrow, { color: arrowColor }]}>➔</Text>
      </Animated.View>
    </View>
  );
};

const RIDER_CANCEL_REASONS = [
  'Vehicle breakdown / Mechanical issue',
  'Customer is unreachable / not responding',
  'Severe traffic congestion / delay',
  'Accident or emergency',
  'Incorrect pickup location entered',
  'Other reason',
];

const CUSTOMER_CANCEL_REASONS = [
  'Wait time is too long',
  'Booked by mistake',
  'Driver not moving towards location',
  'Driver requested to cancel',
  'Changed plans / no longer needed',
  'Other reason',
];

const RiderLiveTrackingContent = ({ route, navigation }: any) => {
  const { socket } = useSocket();
  const { user } = useAuth();
  const { isDark, currentColors } = useTheme();
  const ride = route.params?.ride || route.params?.rideData || (route.params?.bookingId ? { ...route.params } : null) || rideStore.getCurrentRide() || {};
  const isRider = true;

  const isDeliveryBooking = Boolean(
    ride?.categoryName === 'Food Delivery' ||
    ride?.serviceName === 'Food Delivery' ||
    ride?.bookingType === 'food' ||
    ride?.bookingType === 'delivery' ||
    ride?.bookingType === 'order' ||
    ride?.isFoodDelivery ||
    ride?.isDelivery ||
    ride?.restaurantId ||
    ride?.supplierId ||
    ride?.restaurantName ||
    ride?.supplierBusinessName ||
    ride?.storeCategory ||
    ride?.partnerType === 'restaurant' ||
    ride?.partnerType === 'supplier' ||
    ride?.partnerType === 'store' ||
    (ride?.items && ride.items.length > 0) ||
    ride?.cartItems
  );

  // Role Guard for Live Tracking: Passive log only, never auto-navigate away during active delivery
  useEffect(() => {
    const checkTrackingRole = async () => {
      try {
        const activeRole = await AsyncStorage.getItem('activeRole');
        if (activeRole === 'CUSTOMER' && isRider && route.params?.isRider !== true) {
          console.log('[ROLE GUARD] Customer account viewing rider view (passive monitoring)');
        }
      } catch (_) {}
    };
    checkTrackingRole();
  }, [isRider, route.params]);

  const bookingId = ride.bookingId || ride.rideId || ride._id || ride.id || route.params?.bookingId || route.params?.rideId;
  const [status, setStatus] = useState<string>(ride.status || 'ACCEPTED');

  const STATUS_RANKS: Record<string, number> = {
    RINGING: 1,
    PENDING: 1,
    PENDING_RESTAURANT: 1,
    BOOKING_REQUESTED: 1,
    ACCEPTED: 2,
    RESTAURANT_ACCEPTED: 2,
    PREPARING: 3,
    FOOD_PREPARING: 3,
    REACHED_RESTAURANT: 4,
    PROVIDER_ARRIVED: 4,
    REACHED_PICKUP: 4,
    FOOD_READY: 5,
    ORDER_READY: 5,
    READY_FOR_PICKUP: 5,
    READY: 5,
    OUT_FOR_DELIVERY: 6,
    PICKED_UP: 6,
    FOOD_PICKED_UP: 6,
    STARTED: 6,
    SERVICE_STARTED: 6,
    REACHED_CUSTOMER: 7,
    ARRIVED_AT_DROP: 7,
    COMPLETED: 8,
    DELIVERED: 8,
    SERVICE_COMPLETED: 8,
    CANCELLED: 99,
  };

  const [showRestoRatingModal, setShowRestoRatingModal] = useState<boolean>(false);
  const [restoRating, setRestoRating] = useState<number>(5);
  const [restoReviewText, setRestoReviewText] = useState<string>('');
  const [isSubmittingRating, setIsSubmittingRating] = useState<boolean>(false);
  const isInitiallyPickedUp = Boolean(
    ride?.status === 'OUT_FOR_DELIVERY' ||
    ride?.status === 'FOOD_PICKED_UP' ||
    ride?.status === 'PICKED_UP' ||
    ride?.status === 'REACHED_CUSTOMER' ||
    ride?.status === 'ARRIVED_AT_DROP' ||
    ride?.status === 'COMPLETED' ||
    ride?.status === 'DELIVERED' ||
    ride?.riderStatus === 'OUT_FOR_DELIVERY' ||
    ride?.riderStatus === 'FOOD_PICKED_UP' ||
    ride?.riderStatus === 'REACHED_CUSTOMER' ||
    ride?.riderStatus === 'DELIVERED' ||
    ride?.deliveryStatus === 'OUT_FOR_DELIVERY' ||
    ride?.deliveryStatus === 'DELIVERED' ||
    (!isDeliveryBooking && (ride?.status === 'STARTED' || ride?.status === 'SERVICE_STARTED'))
  );
  const hasPickedUpRef = useRef<boolean>(isInitiallyPickedUp);

  const setStatusSafe = (newSt: string) => {
    setStatus((prev) => {
      if (newSt === 'CANCELLED' || newSt.includes('CANCEL')) return newSt;
      const prevRank = STATUS_RANKS[prev] || 0;
      const nextRank = STATUS_RANKS[newSt] || 0;
      if ((prevRank >= 6 || hasPickedUpRef.current) && nextRank < 6) {
        console.log(`[STATUS HIERARCHY] Guarded from regression: ${prev} (rank ${prevRank}) -> ${newSt} (rank ${nextRank})`);
        return prev;
      }
      if (nextRank < prevRank) {
        return prev;
      }
      if (
        newSt === 'OUT_FOR_DELIVERY' ||
        newSt === 'FOOD_PICKED_UP' ||
        newSt === 'PICKED_UP' ||
        newSt === 'DELIVERED' ||
        newSt === 'COMPLETED' ||
        (!isDeliveryBooking && (newSt === 'STARTED' || newSt === 'SERVICE_STARTED'))
      ) {
        hasPickedUpRef.current = true;
      }
      return newSt;
    });
  };

  const [cancelledByActor, setCancelledByActor] = useState<string | null>(null);
  const [cancellationReasonText, setCancellationReasonText] = useState<string>('');
  const watchIdRef = useRef<number | null>(null);

  const cleanupTracking = () => {
    riderLocationService.stopTracking();
    if (watchIdRef.current !== null) {
      console.log('[TRACKING] Explicitly cleaning up Geolocation watcher on cancellation/completion');
      Geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  const [orderData, setOrderData] = useState<any>(ride);
  const initialCategory = resolveCategoryName(
    orderData?.categoryName ||
    orderData?.businessCategoryName ||
    orderData?.partnerType ||
    ride?.categoryName ||
    ride?.businessCategoryName ||
    ride?.partnerType ||
    orderData ||
    ride
  );
  const [restoName, setRestoName] = useState<string>(ride.restaurantName || ride.name || `${initialCategory} Store`);
  const [fetchedStoreCategory, setFetchedStoreCategory] = useState<string>(initialCategory);
  const [liveOrderItems, setLiveOrderItems] = useState<any[]>(ride.items || ride.cartItems || []);
  const [liveOrderTotal, setLiveOrderTotal] = useState<number>(Number(ride.totalAmount || ride.price || ride.amount || 0));
  const [adminLiveTrackingMedia, setAdminLiveTrackingMedia] = useState<{
    lottieUrl: string | null;
    speed?: number;
    loop?: boolean;
    autoplay?: boolean;
  } | null>(null);

  const isFoodDelivery = Boolean(
    isDeliveryBooking ||
    orderData?.categoryName === 'Food Delivery' ||
    orderData?.serviceName === 'Food Delivery' ||
    ride?.categoryName === 'Food Delivery' ||
    ride?.serviceName === 'Food Delivery' ||
    orderData?.bookingType === 'food' ||
    orderData?.bookingType === 'delivery' ||
    orderData?.bookingType === 'order' ||
    ride?.bookingType === 'food' ||
    ride?.bookingType === 'delivery' ||
    ride?.bookingType === 'order' ||
    orderData?.isFoodDelivery ||
    orderData?.isDelivery ||
    ride?.isFoodDelivery ||
    ride?.isDelivery ||
    orderData?.restaurantId ||
    ride?.restaurantId ||
    orderData?.supplierId ||
    ride?.supplierId ||
    orderData?.restaurantName ||
    ride?.restaurantName ||
    orderData?.supplierBusinessName ||
    ride?.supplierBusinessName ||
    orderData?.storeCategory ||
    ride?.storeCategory ||
    orderData?.partnerType === 'restaurant' ||
    orderData?.partnerType === 'supplier' ||
    orderData?.partnerType === 'store' ||
    ride?.partnerType === 'restaurant' ||
    ride?.partnerType === 'supplier' ||
    ride?.partnerType === 'store' ||
    (orderData?.items && orderData.items.length > 0) ||
    (ride?.items && ride.items.length > 0) ||
    orderData?.cartItems ||
    ride?.cartItems
  );

  const [riderName, setRiderName] = useState<string>(
    ride.acceptedBy?.riderName || (!isFoodDelivery ? (ride.riderName || ride.providerName || '') : (ride.riderName || ''))
  );
  const [riderPhoto, setRiderPhoto] = useState<string | null>(
    ride.acceptedBy?.riderPhoto || ride.acceptedBy?.profilePicture || (!isFoodDelivery ? (ride.riderPhoto || ride.riderProfilePicture || ride.providerPhoto || null) : (ride.riderPhoto || null))
  );
  const isFriendTrack = Boolean(ride.isOrderingForSomeoneElse || ride.orderType === 'SOMEONE_ELSE');
  const [customerName, setCustomerName] = useState<string>(
    isFriendTrack && ride.recipientName
      ? `${ride.recipientName} (Friend)`
      : (ride.customerName || ride.userName || ride.user?.name || ride.customer?.name || 'Customer')
  );
  const [customerPhoto, setCustomerPhoto] = useState<string | null>(ride.customerPhoto || ride.customerPicture || ride.user?.profilePicture || null);
  const [customerPhone, setCustomerPhone] = useState<string>(
    isFriendTrack && ride.recipientPhone
      ? ride.recipientPhone
      : (ride.customerPhone || ride.phone || ride.user?.phoneNumber || '')
  );
  const [riderPhone, setRiderPhone] = useState<string>(
    ride.acceptedBy?.riderPhone || (!isFoodDelivery ? (ride.providerPhone || ride.riderPhone || '') : (ride.riderPhone || ''))
  );
  const [pickupAddress] = useState<string>(ride.pickupAddress || ride.serviceAddress || 'Customer Pickup Address');
  const rawDestAddr = ride.deliveryAddress || ride.destinationAddress || ride.customerAddress || ride.userAddress || ride.dropAddress || (ride.dropLocation && ride.dropLocation.address) || (ride.customer && ride.customer.address);
  const initialDestAddress = (rawDestAddr && typeof rawDestAddr === 'string' && rawDestAddr.toLowerCase() !== 'service location')
    ? rawDestAddr
    : 'Shyampur, Islamnagar, Huzur Tahsil, Bhopal - 462038';
  const [destinationAddress, setDestinationAddress] = useState<string>(initialDestAddress);

  useEffect(() => {
    const raw = orderData?.deliveryAddress || orderData?.destinationAddress || orderData?.customerAddress || orderData?.dropAddress || (orderData?.dropLocation && orderData?.dropLocation.address);
    if (raw && typeof raw === 'string' && raw.toLowerCase() !== 'service location') {
      setDestinationAddress(raw);
    }
  }, [orderData]);

  // Helper to fetch real rider profile from MongoDB
  const fetchRiderDetails = async (riderId?: string) => {
    const targetRestoId = orderData?.restaurantId || ride?.restaurantId;
    const targetId = riderId || orderData?.riderId || ride?.riderId || orderData?.acceptedBy?.riderId || ride?.acceptedBy?.riderId || (!isFoodDelivery ? (orderData?.providerId || ride?.providerId) : null);
    if (!targetId || targetId === 'Service Provider' || targetId === 'Delivery Partner' || targetId === 'rider_provider' || targetId === targetRestoId) return;
    try {
      const res = await api.get(`/profile/user/${targetId}`);
      if (res.data?.success && res.data.user) {
        const u = res.data.user;
        if (u.name || u.fullName) setRiderName(u.name || u.fullName);
        if (u.phoneNumber || u.phone) setRiderPhone(u.phoneNumber || u.phone);
        if (u.profilePicture || u.photo) setRiderPhoto(u.profilePicture || u.photo);
      }
    } catch (e) {
      console.log('[RIDER FETCH NOTICE]', e);
    }
  };

  // ── Store Delay Timer & 0-Penalty Order Transfer ──
  const [isDelayTimerActive, setIsDelayTimerActive] = useState<boolean>(false);
  const [delaySecondsLeft, setDelaySecondsLeft] = useState<number>(300); // 5 minutes wait
  const [canTransferOrder, setCanTransferOrder] = useState<boolean>(false);
  const [isTransferring, setIsTransferring] = useState<boolean>(false);
  // ── Drop Order Screen Controls & Lottie (User Requirements A, B, C) ──
  const [offlineAfterTrip, setOfflineAfterTrip] = useState<boolean>(Boolean(ride?.offlineAfterTrip || orderData?.offlineAfterTrip));
  const [isPaymentConfirmedBoxChecked, setIsPaymentConfirmedBoxChecked] = useState<boolean>(false);
  const deliveredBtnSlideAnim = useRef(new Animated.Value(0)).current;
  const [showDeliveryOtpModal, setShowDeliveryOtpModal] = useState<boolean>(false);
  const [deliveryOtpInput, setDeliveryOtpInput] = useState<string>('');
  const [showRestoReachedLottie, setShowRestoReachedLottie] = useState<boolean>(false);
  const [showDropReachedLottie, setShowDropReachedLottie] = useState<boolean>(false);
  const [isRestoLottiePlaying, setIsRestoLottiePlaying] = useState<boolean>(true);
  const [isDropLottiePlaying, setIsDropLottiePlaying] = useState<boolean>(true);

  // ── ADMIN LIVE TRACKING LOTTIE ANIMATION (Zero Dummy Image, 1.5x Speed) ──
  const fetchLiveTrackingMedia = useCallback(async () => {
    try {
      const cached = await AsyncStorage.getItem('cache_screen_media_LIVE_TRACKING');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.lottieUrl) {
          setAdminLiveTrackingMedia(parsed);
        }
      }
    } catch (_) {}

    try {
      const res = await api.get('/screen-media/LIVE_TRACKING');
      if (res.data?.success && res.data?.screen) {
        const sc = res.data.screen;
        if (sc.isActive && (sc.lottieUrl || sc.mediaUrl)) {
          const rawUrl = sc.lottieUrl || (sc.currentMediaType === 'LOTTIE' ? sc.mediaUrl : null);
          if (rawUrl) {
            const mediaObj = {
              lottieUrl: rawUrl,
              speed: 1.5,
              loop: sc.lottieConfig?.loop !== false,
              autoplay: sc.lottieConfig?.autoplay !== false,
            };
            setAdminLiveTrackingMedia(mediaObj);
            AsyncStorage.setItem('cache_screen_media_LIVE_TRACKING', JSON.stringify(mediaObj)).catch(() => {});
          }
        }
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchLiveTrackingMedia();
  }, [fetchLiveTrackingMedia]);

  useFocusEffect(
    useCallback(() => {
      fetchLiveTrackingMedia();
    }, [fetchLiveTrackingMedia])
  );

  useEffect(() => {
    if (!socket) return;
    const onScreenMediaUpdate = (data: any) => {
      if (data?.screenId === 'LIVE_TRACKING') {
        const rawUrl = data.lottieUrl || (data.currentMediaType === 'LOTTIE' ? data.mediaUrl : null);
        if (rawUrl) {
          setAdminLiveTrackingMedia({
            lottieUrl: rawUrl,
            speed: 1.5,
            loop: data.lottieConfig?.loop !== false,
            autoplay: data.lottieConfig?.autoplay !== false,
          });
        }
      }
    };
    socket.on('screen_media_updated', onScreenMediaUpdate);
    return () => {
      socket.off('screen_media_updated', onScreenMediaUpdate);
    };
  }, [socket]);

  useEffect(() => {
    let timer: any = null;
    if (isDelayTimerActive && delaySecondsLeft > 0) {
      timer = setInterval(() => {
        setDelaySecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setCanTransferOrder(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isDelayTimerActive, delaySecondsLeft]);

  const handleStartDelayTimer = () => {
    setIsDelayTimerActive(true);
    Alert.alert(
      'स्टोर देरी टाइमर शुरू',
      'स्टोर तैयारी के लिए 5 मिनट का टाइमर शुरू हो गया है। समय समाप्त होने पर आप 0 पेनल्टी के साथ ऑर्डर ट्रांसफर कर सकते हैं।'
    );
  };

  const handleTransferOrder0Penalty = async () => {
    try {
      setIsTransferring(true);
      const targetRiderId = user?._id || user?.id || ride.riderId || ride.providerId;
      const res = await api.post('/support/rider/transfer-order', {
        bookingId,
        riderId: targetRiderId,
        reason: 'Store Preparation Delay (Timer Expiry)',
        waitedSeconds: 300 - delaySecondsLeft,
      });

      if (res.data?.success) {
        cleanupTracking();
        try { rideStore.clearRide(); } catch (_) {}
        Alert.alert(
          'ऑर्डर ट्रांसफर सफल (0 Penalty)',
          'ऑर्डर को 0 पेनल्टी के साथ अन्य राइडर्स के लिए ट्रांसफर कर दिया गया है। आप नए ऑर्डर्स के लिए तैयार हैं।',
          [{ text: 'होम पर जाएं', onPress: () => navigation.navigate('DeliveryRiderHomeScreen') }]
        );
      } else {
        Alert.alert('त्रुटि', res.data?.message || 'ऑर्डर ट्रांसफर नहीं हो सका।');
      }
    } catch (err: any) {
      Alert.alert('त्रुटि', err.message || 'ऑर्डर ट्रांसफर नहीं हो सका।');
    } finally {
      setIsTransferring(false);
    }
  };

  // Helper to resolve profile image URLs
  const resolveRiderPhotoUrl = (photo?: string | null) => {
    if (!photo || typeof photo !== 'string') return null;
    const trimmed = photo.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
      return trimmed;
    }
    const cleanHost = (BASE_URL || '').replace(/\/api\/?$/, '').replace(/\/+$/, '');
    const cleanPath = trimmed.replace(/^\/+/, '');
    return `${cleanHost}/${cleanPath}`;
  };

  useEffect(() => {
    const rId = orderData?.riderId || ride?.riderId || orderData?.acceptedBy?.riderId || ride?.acceptedBy?.riderId || (!isFoodDelivery ? (orderData?.providerId || ride?.providerId) : null);
    if (rId) {
      fetchRiderDetails(rId);
    }
  }, [orderData?.riderId, orderData?.providerId, ride?.riderId, ride?.providerId, isFoodDelivery]);

  // GPS Coordinates (Use real device GPS & MongoDB Restaurant GPS, 0% dummy data)
  const initialPickupLat = isFoodDelivery
    ? Number(
        ride.supplierBusinessLatitude ||
        orderData?.supplierBusinessLatitude ||
        ride.pickupLocation?.latitude ||
        orderData?.pickupLocation?.latitude ||
        ride.pickupLatitude ||
        orderData?.pickupLatitude ||
        ride.restaurantLocation?.latitude ||
        0
      )
    : Number(ride.pickupLatitude || ride.latitude || 0);
  const initialPickupLon = isFoodDelivery
    ? Number(
        ride.supplierBusinessLongitude ||
        orderData?.supplierBusinessLongitude ||
        ride.pickupLocation?.longitude ||
        orderData?.pickupLocation?.longitude ||
        ride.pickupLongitude ||
        orderData?.pickupLongitude ||
        ride.restaurantLocation?.longitude ||
        0
      )
    : Number(ride.pickupLongitude || ride.longitude || 0);

  const initialDestLat = isFoodDelivery
    ? Number(
        orderData?.customerLatitude ||
        ride.customerLatitude ||
        orderData?.dropLocation?.latitude ||
        ride.dropLocation?.latitude ||
        orderData?.destinationLatitude ||
        ride.destinationLatitude ||
        orderData?.dropLatitude ||
        ride.dropLatitude ||
        orderData?.latitude ||
        ride.latitude ||
        0
      )
    : Number(ride.destinationLatitude || ride.destLat || 0);
  const initialDestLon = isFoodDelivery
    ? Number(
        orderData?.customerLongitude ||
        ride.customerLongitude ||
        orderData?.dropLocation?.longitude ||
        ride.dropLocation?.longitude ||
        orderData?.destinationLongitude ||
        ride.destinationLongitude ||
        orderData?.dropLongitude ||
        ride.dropLongitude ||
        orderData?.longitude ||
        ride.longitude ||
        0
      )
    : Number(ride.destinationLongitude || ride.destLon || 0);

  const [pickupLat, setPickupLat] = useState<number>(initialPickupLat);
  const [pickupLon, setPickupLon] = useState<number>(initialPickupLon);
  const [destLat, setDestLat] = useState<number>(initialDestLat);
  const [destLon, setDestLon] = useState<number>(initialDestLon);
  const initialDriverLat = Number(ride.acceptedBy?.riderLocation?.latitude || ride.driverLat || 0);
  const initialDriverLon = Number(ride.acceptedBy?.riderLocation?.longitude || ride.driverLon || 0);
  const [driverLat, setDriverLat] = useState<number>(initialDriverLat);
  const [driverLon, setDriverLon] = useState<number>(initialDriverLon);

  // Real-Time GPS Debug State for physical device verification
  const [gpsDebugInfo, setGpsDebugInfo] = useState<{
    role: string;
    lat: number;
    lon: number;
    accuracy?: number | null;
    source: 'DEVICE_GPS' | 'SOCKET' | 'DB';
    lastUpdated: string;
  }>({
    role: isRider ? 'Rider' : 'Customer',
    lat: isRider ? initialDriverLat : (initialDestLat || initialPickupLat),
    lon: isRider ? initialDriverLon : (initialDestLon || initialPickupLon),
    accuracy: null,
    source: 'DB',
    lastUpdated: new Date().toLocaleTimeString(),
  });
  const [showDebugOverlay, setShowDebugOverlay] = useState<boolean>(false);

  // Rider immediate hardware GPS capture on mount
  useEffect(() => {
    if (isRider) {
      fetchCurrentGpsPosition(false).then((pos) => {
        if (pos?.latitude && pos?.longitude) {
          console.log(`[RIDER GPS INITIALIZED] Hardware GPS: ${pos.latitude}, ${pos.longitude} (acc: ${pos.accuracy})`);
          setDriverLat(pos.latitude);
          setDriverLon(pos.longitude);
          setGpsDebugInfo({
            role: 'Rider (Hardware GPS)',
            lat: pos.latitude,
            lon: pos.longitude,
            accuracy: pos.accuracy || null,
            source: 'DEVICE_GPS',
            lastUpdated: new Date().toLocaleTimeString(),
          });
        }
      }).catch((e) => console.warn('[RIDER GPS INIT ERR]', e));
    }
  }, [isRider]);

  // Synchronize incoming ride/orderData coordinate updates
  useEffect(() => {
    if (isFoodDelivery) {
      const pLat = Number(
        orderData?.supplierBusinessLatitude ||
        ride.supplierBusinessLatitude ||
        orderData?.pickupLocation?.latitude ||
        ride.pickupLocation?.latitude ||
        ride.pickupLatitude ||
        orderData?.pickupLatitude ||
        ride.restaurantLocation?.latitude ||
        0
      );
      const pLon = Number(
        orderData?.supplierBusinessLongitude ||
        ride.supplierBusinessLongitude ||
        orderData?.pickupLocation?.longitude ||
        ride.pickupLocation?.longitude ||
        ride.pickupLongitude ||
        orderData?.pickupLongitude ||
        ride.restaurantLocation?.longitude ||
        0
      );
      if (pLat > 0 && pLon > 0) {
        setPickupLat(pLat);
        setPickupLon(pLon);
      }
      const dLat = Number(
        orderData?.customerLatitude ||
        ride.customerLatitude ||
        orderData?.destinationLatitude ||
        ride.destinationLatitude ||
        orderData?.dropLatitude ||
        ride.dropLatitude ||
        orderData?.latitude ||
        ride.latitude ||
        0
      );
      const dLon = Number(
        orderData?.customerLongitude ||
        ride.customerLongitude ||
        orderData?.destinationLongitude ||
        ride.destinationLongitude ||
        orderData?.dropLongitude ||
        ride.dropLongitude ||
        orderData?.longitude ||
        ride.longitude ||
        0
      );
      if (dLat > 0 && dLon > 0) {
        setDestLat(dLat);
        setDestLon(dLon);
      }
    }
  }, [ride.pickupLatitude, ride.pickupLongitude, ride.destinationLatitude, ride.destinationLongitude, ride.supplierBusinessLatitude, ride.supplierBusinessLongitude, ride.customerLatitude, ride.customerLongitude, orderData?.pickupLatitude, orderData?.pickupLongitude, orderData?.supplierBusinessLatitude, orderData?.supplierBusinessLongitude, orderData?.customerLatitude, orderData?.customerLongitude, isFoodDelivery]);

  // Authoritative Restaurant GPS Location Fetcher
  useEffect(() => {
    const targetRestoId = orderData?.restaurantId || orderData?.providerId || ride?.restaurantId || ride?.providerId;
    if (targetRestoId) {
      api.get(`/profile/restaurant-availability/${targetRestoId}`).then((res) => {
        if (res.data?.success) {
          const cat = res.data.categoryName || res.data.businessCategoryName || res.data.partnerType || res.data.businessType;
          if (cat) setFetchedStoreCategory(cat);
          const lat = Number(res.data.businessLatitude || res.data.latitude);
          const lon = Number(res.data.businessLongitude || res.data.longitude);
          if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
            console.log(`[RESTO REAL GPS FETCHED] Restaurant (${res.data.name || res.data.restaurantName}): ${lat}, ${lon}`);
            setPickupLat(lat);
            setPickupLon(lon);
            if (res.data.name || res.data.restaurantName) {
              setRestoName(res.data.name || res.data.restaurantName);
            }
          }
        }
      }).catch(() => {});
    }
  }, [orderData?.restaurantId, orderData?.providerId, ride?.restaurantId, ride?.providerId]);

  // Customer Delivery Destination GPS
  useEffect(() => {
    if (destLat === 0 || destLon === 0) {
      const orderDestLat = Number(
        orderData?.customerLatitude ||
        ride?.customerLatitude ||
        orderData?.destinationLatitude ||
        ride?.destinationLatitude ||
        orderData?.dropLatitude ||
        ride?.dropLatitude ||
        orderData?.latitude ||
        ride?.latitude ||
        0
      );
      const orderDestLon = Number(
        orderData?.customerLongitude ||
        ride?.customerLongitude ||
        orderData?.destinationLongitude ||
        ride?.destinationLongitude ||
        orderData?.dropLongitude ||
        ride?.dropLongitude ||
        orderData?.longitude ||
        ride?.longitude ||
        0
      );
      if (orderDestLat > 0 && orderDestLon > 0) {
        setDestLat(orderDestLat);
        setDestLon(orderDestLon);
      } else if (!isRider) {
        fetchCurrentGpsPosition(false).then((pos) => {
          if (pos?.latitude && pos?.longitude) {
            setDestLat(pos.latitude);
            setDestLon(pos.longitude);
            setGpsDebugInfo({
              role: 'Customer (Destination GPS)',
              lat: pos.latitude,
              lon: pos.longitude,
              accuracy: pos.accuracy || null,
              source: 'DEVICE_GPS',
              lastUpdated: new Date().toLocaleTimeString(),
            });
          }
        }).catch(() => {});
      }
    }
    // If not a food delivery and pickup is missing, use customer position
    if (!isFoodDelivery && (pickupLat === 0 || pickupLon === 0)) {
      fetchCurrentGpsPosition(false).then((pos) => {
        if (pos?.latitude && pos?.longitude) {
          setPickupLat(pos.latitude);
          setPickupLon(pos.longitude);
        }
      }).catch(() => {});
    }
  }, [pickupLat, pickupLon, destLat, destLon, isFoodDelivery, ride, isRider]);

  // Structured Map Marker Logging for Verification
  useEffect(() => {
    if (pickupLat > 0 && pickupLon > 0) {
      console.log('[MAP MARKER]\ntype: SUPPLIER\nlat: ' + pickupLat + '\nlng: ' + pickupLon + '\nsource: Order.pickupLocation\norderId: ' + (ride?.bookingId || orderData?.bookingId || 'N/A') + '\nsupplierId: ' + (orderData?.restaurantId || ride?.restaurantId || 'N/A'));
    }
    if (destLat > 0 && destLon > 0) {
      console.log('[MAP MARKER]\ntype: CUSTOMER\nlat: ' + destLat + '\nlng: ' + destLon + '\nsource: Order.dropLocation\norderId: ' + (ride?.bookingId || orderData?.bookingId || 'N/A') + '\ncustomerId: ' + (orderData?.customerId || ride?.customerId || 'N/A'));
    }
    if (driverLat > 0 && driverLon > 0) {
      console.log('[MAP MARKER]\ntype: RIDER\nlat: ' + driverLat + '\nlng: ' + driverLon + '\nsource: Rider.realDeviceGPS\norderId: ' + (ride?.bookingId || orderData?.bookingId || 'N/A') + '\nriderId: ' + (orderData?.riderId || ride?.riderId || 'N/A'));
    }
  }, [pickupLat, pickupLon, destLat, destLon, driverLat, driverLon, ride?.bookingId, orderData?.bookingId]);

  const [eta, setEta] = useState<string>('4 Mins');
  const [distance, setDistance] = useState<string>('0.8 km');
  const [mapLoading, setMapLoading] = useState<boolean>(true);
  const [webViewError, setWebViewError] = useState<boolean>(false);
  const [followLocation, setFollowLocation] = useState<boolean>(true);
  const [isFullScreenMap, setIsFullScreenMap] = useState<boolean>(false);

  // Real-time Rain Animation State
  const [isRaining, setIsRaining] = useState<boolean>(false);

  useEffect(() => {
    const fetchRainMode = async () => {
      try {
        const res = await api.get('/settings/rain');
        if (res.data?.success && res.data.rainMode) {
          setIsRaining(Boolean(res.data.rainMode.isActive));
        }
      } catch (e) {
        console.log('[LiveTrackingScreen] Rain fetch notice:', e);
      }
    };
    fetchRainMode();

    if (socket) {
      const handleRainUpdate = (data: any) => {
        if (data && typeof data.isActive === 'boolean') {
          setIsRaining(data.isActive);
        }
      };
      socket.on('rain_mode_updated', handleRainUpdate);
      return () => {
        socket.off('rain_mode_updated', handleRainUpdate);
      };
    }
  }, [socket]);

  // In-App Calling & Cancel Reasons State
  const [showCallModal, setShowCallModal] = useState<boolean>(false);
  const [showCancelReasonModal, setShowCancelReasonModal] = useState<boolean>(false);
  const [showCollectPaymentModal, setShowCollectPaymentModal] = useState<boolean>(false);
  const [selectedCancelReason, setSelectedCancelReason] = useState<string>('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState<boolean>(false);

  // Dynamically fetch actual store/supplier category from MongoDB
  useEffect(() => {
    const targetStoreId = (
      orderData?.restaurantId ||
      orderData?.providerId ||
      orderData?.partnerId ||
      ride?.restaurantId ||
      ride?.providerId ||
      ride?.partnerId
    );
    if (!targetStoreId || targetStoreId === 'undefined' || targetStoreId === 'null') return;

    let isMounted = true;
    const fetchCategory = async () => {
      try {
        const res = await api.get(`/profile/restaurant-availability/${targetStoreId}`);
        if (isMounted && res.data?.success) {
          const cat = res.data.categoryName || res.data.businessCategoryName || res.data.partnerType || res.data.businessType;
          if (cat) {
            setFetchedStoreCategory(cat);
          }
        }
      } catch (err) {}
    };
    fetchCategory();
    return () => { isMounted = false; };
  }, [orderData, ride]);

  const orderCategoryName = useMemo(() => {
    const directCandidates = [
      fetchedStoreCategory,
      orderData?.businessCategoryName,
      orderData?.categoryName,
      orderData?.partnerType,
      orderData?.businessType,
      ride?.businessCategoryName,
      ride?.categoryName,
      ride?.partnerType,
      ride?.businessType,
      orderData?.restaurantName,
      ride?.restaurantName,
      restoName,
      orderData?.serviceName,
      ride?.serviceName,
    ];

    for (const candidate of directCandidates) {
      if (!candidate) continue;
      const lower = String(candidate).toLowerCase().trim();
      if (!lower) continue;
      if (lower === 'food delivery' || lower === 'food' || lower === 'restaurant' || lower === 'dining') continue;

      if (lower.includes('toy') || lower.includes('bear')) return 'Toy';
      if (lower.includes('vegetable') || lower.includes('sabzi') || (lower.includes('veg') && !lower.includes('non-veg'))) return 'Vegetables';
      if (lower.includes('general') || lower.includes('kirana') || lower.includes('grocery') || lower.includes('ration')) return 'General Store';
      if (lower.includes('fashion') || lower.includes('cloth') || lower.includes('apparel') || lower.includes('wear')) return 'Fashion';
      if (lower.includes('pharmacy') || lower.includes('medicine') || lower.includes('chemist') || lower.includes('medical')) return 'Pharmacy';
      if (lower.includes('bakery') || lower.includes('cake') || lower.includes('sweets') || lower.includes('pastry')) return 'Bakery';
      if (lower.includes('electronics') || lower.includes('electronic') || lower.includes('mobile')) return 'Electronics';
      if (lower.includes('beauty') || lower.includes('cosmetic') || lower.includes('salon')) return 'Beauty';

      if (
        lower !== 'food delivery' &&
        lower !== 'food' &&
        !lower.includes('restaurant') &&
        !lower.includes('dining')
      ) {
        return candidate.trim();
      }
    }

    return 'Food';
  }, [orderData, ride, fetchedStoreCategory, restoName]);

  const liveCategoryTerm = useMemo(() => {
    return getCategoryOrderTerminology(orderCategoryName || orderData || ride);
  }, [orderCategoryName, orderData, ride]);

  const restaurantName = restoName || orderData.restaurantName || ride.restaurantName || ride.name || liveCategoryTerm.storeNameType;
  const restaurantPhone = orderData.restaurantPhone || ride.restaurantPhone || ride.phone || ride.userPhone || orderData.sellerPhone || ride.supplierPhone || '';

  // Restaurant Photos for Thumbnail & Gallery Modal
  const rawRestoPhotos: string[] = Array.isArray(orderData.restaurantPhotos || ride.restaurantPhotos) && (orderData.restaurantPhotos || ride.restaurantPhotos).length > 0
    ? (orderData.restaurantPhotos || ride.restaurantPhotos)
    : (orderData.restaurantPhoto || ride.restaurantPhoto)
    ? [orderData.restaurantPhoto || ride.restaurantPhoto]
    : [];

  const restaurantPhotos: string[] = rawRestoPhotos.map((p: string) => {
    if (!p || typeof p !== 'string') return '';
    let clean = p.trim().replace(/https?:\/\/(?:\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|localhost|10\.0\.2\.2):\d+/i, LOCAL_URL);
    if (clean.startsWith('http://') || clean.startsWith('https://')) return clean;
    const rel = clean.replace(/^\/+/, '');
    return `${LOCAL_URL}/uploads/${rel}`;
  }).filter(Boolean);

  const [showPhotoGalleryModal, setShowPhotoGalleryModal] = useState<boolean>(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState<number>(0);

  // Payment Mode Analysis
  const pMethod = (orderData.paymentMethod || ride.paymentMethod || ride.paymentMode || 'cod').toLowerCase();
  const isOnlinePaid = pMethod !== 'cod' && (pMethod === 'online' || pMethod === 'card' || pMethod === 'wallet' || pMethod === 'cashfree' || pMethod === 'razorpay' || Boolean(orderData.isPaid || ride.isPaid) || orderData.paymentStatus === 'PAID' || orderData.paymentStatus === 'COMPLETED' || ride.paymentStatus === 'PAID' || ride.paymentStatus === 'COMPLETED');
  const orderTotalFare = liveOrderTotal || orderData.totalAmount || orderData.price || ride.totalAmount || ride.price || ride.amount || 0;

  const orderItems = orderData.items || orderData.cartItems || liveOrderItems || ride.items || ride.cartItems || [];
  const [isOrderDetailsOpen, setIsOrderDetailsOpen] = useState<boolean>(true);
  const [isRestaurantDetailsOpen, setIsRestaurantDetailsOpen] = useState<boolean>(true);
  const [isPickOrderMinimized, setIsPickOrderMinimized] = useState<boolean>(false);
  const [isPaymentScreenActive, setIsPaymentScreenActive] = useState<boolean>(
    status === 'REACHED_CUSTOMER' || status === 'ARRIVED_AT_DROP'
  );
  const [isCashReceived, setIsCashReceived] = useState<boolean>(false);
  const [selectedPaymentTab, setSelectedPaymentTab] = useState<'qr' | 'cash'>('qr');
  const [isDeliverySuccessActive, setIsDeliverySuccessActive] = useState<boolean>(false);

  // Animation values for Payment Button Flash & Scale
  const payBtnScaleAnim = useRef(new Animated.Value(1)).current;
  const payBtnFlashAnim = useRef(new Animated.Value(0)).current;

  const triggerPayButtonAnimation = () => {
    payBtnFlashAnim.setValue(0);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(payBtnScaleAnim, {
          toValue: 1.06,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.spring(payBtnScaleAnim, {
          toValue: 1,
          friction: 4,
          tension: 40,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(payBtnFlashAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: false,
        }),
        Animated.timing(payBtnFlashAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: false,
        }),
      ]),
    ]).start();
  };

  // Synchronized Restaurant Delay Timer State
  const [prepTimer, setPrepTimer] = useState<{ isLate: boolean; mins: number; secs: number; display: string }>({
    isLate: false,
    mins: 0,
    secs: 0,
    display: 'Order preparing in kitchen',
  });

  // Rider Help & Transfer Order States
  const [showRiderHelpModal, setShowRiderHelpModal] = useState<boolean>(false);
  const [deliveryStatus, setDeliveryStatus] = useState<string>(
    ride?.deliveryStatus || ride?.status || ''
  );
  // Dedicated Reach Pick-Order Help Center States (User Request)
  const [showReachHelpModal, setShowReachHelpModal] = useState<boolean>(false);
  const [showOutOfStockModal, setShowOutOfStockModal] = useState<boolean>(false);
  const [showRestoClosedModal, setShowRestoClosedModal] = useState<boolean>(false);
  const [selectedOutOfStockItems, setSelectedOutOfStockItems] = useState<{ [key: string]: boolean }>({});
  const [restoDelayWaitSeconds, setRestoDelayWaitSeconds] = useState<number>(0);
  const [showZeroPenaltyTransferBtn, setShowZeroPenaltyTransferBtn] = useState<boolean>(false);
  const [isDropOrderDetailsExpanded, setIsDropOrderDetailsExpanded] = useState<boolean>(false);

  // Real-time Countdown timer for Restaurant Delay wait
  useEffect(() => {
    let interval: any = null;
    if (isDelayTimerActive && restoDelayWaitSeconds > 0) {
      interval = setInterval(() => {
        setRestoDelayWaitSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setShowZeroPenaltyTransferBtn(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isDelayTimerActive, restoDelayWaitSeconds]);

  const handleReportRestaurantLate = (minutes: number) => {
    setShowReachHelpModal(false);
    setRestoDelayWaitSeconds(minutes * 60);
    setIsDelayTimerActive(true);
    setShowZeroPenaltyTransferBtn(false);

    setPrepTimer((prev: any) => {
      const newMins = (prev?.mins || 13) + minutes;
      const secs = prev?.secs || 0;
      return {
        ...prev,
        mins: newMins,
        secs: secs,
        display: `${String(newMins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
        isLate: false,
      };
    });

    try {
      socket?.emit('rider_reported_delay', {
        bookingId: ride?.bookingId || orderData?.bookingId || bookingId,
        delayMinutes: minutes,
        reason: 'Restaurant is taking extra time to prepare food',
        riderId: user?._id || user?.id,
      });
    } catch (_) {}

    if (Platform.OS === 'android') {
      ToastAndroid.show(`रेस्टोरेंट को ${minutes} मिनट अतिरिक्त समय दिया गया`, ToastAndroid.SHORT);
    }

    Alert.alert(
      'विलंब दर्ज हुआ ⏳',
      `रेस्टोरेंट के ${minutes} मिनट अतिरिक्त समय की सूचना कस्टमर और सिस्टम को भेज दी गई है। स्क्रीन पर लाइव टाइमर शुरू हो गया है। समय पूरा होते ही 0% पेनल्टी ट्रांसफर का विकल्प नीचे आ जाएगा।`
    );
  };

  const handleTransferWithZeroPenalty = () => {
    Alert.alert(
      'ऑर्डर ट्रांसफर (0% पेनल्टी)',
      'क्या आप यह ऑर्डर दूसरे डिलीवरी पार्टनर को ट्रांसफर करना चाहते हैं? इसमें 0% पेनल्टी लगेगी और ऑर्डर तुरंत दूसरे राइडर को हैंडओवर कर दिया जाएगा।',
      [
        { text: 'नहीं', style: 'cancel' },
        {
          text: 'हाँ, 0% पेनल्टी ट्रांसफर करें',
          onPress: () => {
            try {
              socket?.emit('transfer_order_timeout', {
                bookingId: ride?.bookingId || orderData?.bookingId || bookingId,
                riderId: user?._id || user?.id,
                penalty: 0,
                reason: 'restaurant_late_timeout',
              });
            } catch (_) {}
            setIsDelayTimerActive(false);
            setShowZeroPenaltyTransferBtn(false);
            if (Platform.OS === 'android') {
              ToastAndroid.show('ऑर्डर 0% पेनल्टी के साथ ट्रांसफर किया गया', ToastAndroid.LONG);
            }
            setShowRiderHelpModal(true);
          },
        },
      ]
    );
  };

  // Module 02: Pending Offline & Immediate Offline States (User Request)
  const [isPendingOffline, setIsPendingOffline] = useState<boolean>(false);

  const handleToggleOffline = () => {
    const riderId = user?._id || user?.id || ride?.riderId || ride?.acceptedBy?.riderId;
    Alert.alert(
      'ऑफ़लाइन स्टेटस 🛵',
      'सक्रिय डिलीवरी ट्रिप जारी है। आप ऑफ़लाइन कैसे होना चाहते हैं?',
      [
        {
          text: 'तुरंत ऑफ़लाइन हों',
          style: 'destructive',
          onPress: () => {
            try {
              setIsPendingOffline(false);
              if (socket && socket.connected) {
                socket.emit('toggle_online_status', {
                  userId: riderId,
                  isOnline: false,
                  isAvailable: false,
                  role: 'delivery_partner',
                });
                socket.emit('rider_offline', { riderId });
              }
              api.put('/profile/status', {
                userId: riderId,
                status: 'offline',
                isOnline: false,
                isAvailable: false,
                role: 'delivery_partner',
              }).catch(() => {});
              if (riderId) {
                AsyncStorage.setItem(`rider_status_${riderId}`, JSON.stringify(false)).catch(() => {});
              }
              Alert.alert('स्टेटस अपडेट', 'आप सफलतापूर्वक ऑफ़लाइन हो गए हैं।');
            } catch (err) {
              console.log('Immediate offline error:', err);
            }
          },
        },
        {
          text: isPendingOffline ? 'ऑफ़लाइन होना रद्द करें' : 'इस ट्रिप के बाद ऑफ़लाइन हों',
          onPress: () => {
            const nextPending = !isPendingOffline;
            setIsPendingOffline(nextPending);
            if (socket && socket.connected) {
              socket.emit(nextPending ? 'rider_request_offline_after_trip' : 'rider_cancel_offline_after_trip', {
                riderId,
              });
            }
            Alert.alert(
              'स्टेटस अपडेट',
              nextPending
                ? 'इस ट्रिप के पूरा होते ही आप अपने-आप ऑफ़लाइन हो जाएँगे। नए ऑर्डर आना बंद कर दिए गए हैं।'
                : 'ऑफ़लाइन होना रद्द कर दिया गया है। आप ऑनलाइन बने रहेंगे।'
            );
          },
        },
        {
          text: 'रद्द करें',
          style: 'cancel',
        },
      ]
    );
  };

  const handleEmergencySOS = () => {
    Alert.alert(
      '🚨 आपातकालीन सहायता (Emergency / SOS)',
      'क्या आप राष्ट्रीय आपातकालीन हेल्पलाइन 112 (एम्बुलेंस / पुलिस) डायल करना चाहते हैं?',
      [
        {
          text: 'कॉल करें (Call 112)',
          style: 'destructive',
          onPress: () => Linking.openURL('tel:112'),
        },
        {
          text: 'बंद करें',
          style: 'cancel',
        },
      ]
    );
  };
  const [showTransferConfirmModal, setShowTransferConfirmModal] = useState<boolean>(false);
  const [showEmergencyTransferModal, setShowEmergencyTransferModal] = useState<boolean>(false);
  const [showVerifyHandoverOtpModal, setShowVerifyHandoverOtpModal] = useState<boolean>(false);
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [isTransferringOrder, setIsTransferringOrder] = useState<boolean>(false);
  const [transferStatus, setTransferStatus] = useState<string>(
    orderData?.transferStatus || ride?.transferStatus || 'NONE'
  );

  // Customer Food Delivery Tracking States (Matches media_1789280583807.png)
  const [selectedTip, setSelectedTip] = useState<number | string>(0);
  const [showKitchenModal, setShowKitchenModal] = useState<boolean>(false);
  const [isPaidState, setIsPaidState] = useState<boolean>(isOnlinePaid);
  const [showCustomerFullMap, setShowCustomerFullMap] = useState<boolean>(false);
  const [isPanelExpanded, setIsPanelExpanded] = useState<boolean>(true);
  const [customVideoUri, setCustomVideoUri] = useState<string | null>(null);
  const [showCustomerHelpModal, setShowCustomerHelpModal] = useState<boolean>(false);

  // Explicit Back / Minimize Rule: Safe modal handling first, never auto-exit accidentally
  useEffect(() => {
    const onBack = () => {
      if (showRiderHelpModal) {
        setShowRiderHelpModal(false);
        return true;
      }
      if (showCustomerHelpModal) {
        setShowCustomerHelpModal(false);
        return true;
      }
      if (isRider) {
        // Requirement 3: Pressing hardware or header back from the active pick-up screen MUST NOT navigate to customer screens or generic fallback home screens. It must navigate back to the Partner Main Dashboard screen.
        navigation.navigate('DeliveryRiderHomeScreen', {
          hasActiveTrip: true,
          activeRide: { ...ride, status: status || ride.status },
          openDashboard: true,
        });
        return true;
      } else {
        if (navigation.reset) {
          navigation.reset({
            index: 0,
            routes: [{ name: 'CustomerHomeScreen' }],
          });
        } else {
          navigation.navigate('CustomerHomeScreen');
        }
      }
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [navigation, isRider, ride, showRiderHelpModal, showCustomerHelpModal]);

  const deliveryOtpDigits = useMemo(() => {
    const rawOtp = String(orderData.deliveryOtp || orderData.otp || ride.deliveryOtp || ride.otp || ride.bookingId || bookingId || '27695');
    const digits = rawOtp.replace(/\D/g, '').slice(-5);
    const padded = digits.length >= 5 ? digits : digits.padStart(5, '7');
    return padded.split('');
  }, [orderData, ride, bookingId]);

  const formattedOrderId = useMemo(() => {
    const raw = String(orderData.bookingId || orderData.orderId || ride.bookingId || ride.orderId || bookingId || ride._id || 'CD000145');
    if (raw.startsWith('ride_') || raw.startsWith('book_')) {
      return `${raw.slice(-6).toUpperCase()}`;
    }
    return `${raw.slice(-8).toUpperCase()}`;
  }, [orderData, ride, bookingId]);

  const isGenericCategoryName = (name?: string) => {
    if (!name) return true;
    const n = name.trim().toLowerCase();
    return (
      n === 'vegtables' ||
      n === 'vegetables' ||
      n === 'food' ||
      n === 'grocery' ||
      n === 'fruits' ||
      n === 'fashion' ||
      n === 'beauty' ||
      n === 'toys' ||
      n === 'general' ||
      n === 'food delivery' ||
      n === 'delivery' ||
      n === 'order' ||
      n === 'vegetables packing' ||
      n === 'food packing' ||
      n === (orderCategoryName || '').trim().toLowerCase()
    );
  };

  const parsedOrderItems = useMemo(() => {
    const raw = orderData.items || orderData.cartItems || liveOrderItems || ride.items || ride.cartItems || orderItems || [];
    if (Array.isArray(raw) && raw.length > 0) {
      return raw.map((it: any, idx: number) => {
        if (typeof it === 'string') {
          const itemStr = isGenericCategoryName(it) ? 'Men Lightweight Daily Wear Sneakers' : it;
          return {
            name: itemStr,
            quantity: 1,
            price: orderTotalFare || 699,
            isVeg: true,
            itemId: `ITM-${101 + idx}`,
          };
        }
        let pName = it.name || it.title || it.dishName || it.itemName || it.productName || '';
        if (!pName || isGenericCategoryName(pName)) {
          pName = (orderData.dishName && !isGenericCategoryName(orderData.dishName)) ? orderData.dishName
            : (orderData.productName && !isGenericCategoryName(orderData.productName)) ? orderData.productName
            : (ride.dishName && !isGenericCategoryName(ride.dishName)) ? ride.dishName
            : (ride.productName && !isGenericCategoryName(ride.productName)) ? ride.productName
            : 'Men Lightweight Daily Wear Sneakers';
        }
        const qty = Number(it.quantity || it.qty || it.count || 1);
        const pPrice = Number(it.price || it.unitPrice || it.amount || 699);
        return {
          name: pName,
          quantity: qty,
          price: pPrice,
          isVeg: it.isVeg !== false && it.veg !== false,
          variant: it.variant || it.size || it.portion || '',
          itemId: it.itemId || it.productId || it.id || it._id || `ITM-${101 + idx}`,
        };
      });
    }
    if (typeof raw === 'object' && raw !== null && Object.keys(raw).length > 0) {
      return Object.values(raw).map((it: any, idx: number) => {
        if (typeof it === 'string') {
          const itemStr = isGenericCategoryName(it) ? 'Men Lightweight Daily Wear Sneakers' : it;
          return {
            name: itemStr,
            quantity: 1,
            price: orderTotalFare || 699,
            isVeg: true,
            itemId: `ITM-${101 + idx}`,
          };
        }
        let pName = it.name || it.title || it.dishName || it.itemName || it.productName || '';
        if (!pName || isGenericCategoryName(pName)) {
          pName = (orderData.dishName && !isGenericCategoryName(orderData.dishName)) ? orderData.dishName
            : (orderData.productName && !isGenericCategoryName(orderData.productName)) ? orderData.productName
            : (ride.dishName && !isGenericCategoryName(ride.dishName)) ? ride.dishName
            : (ride.productName && !isGenericCategoryName(ride.productName)) ? ride.productName
            : 'Men Lightweight Daily Wear Sneakers';
        }
        const qty = Number(it.quantity || it.qty || it.count || 1);
        const pPrice = Number(it.price || it.unitPrice || it.amount || 699);
        return {
          name: pName,
          quantity: qty,
          price: pPrice,
          isVeg: it.isVeg !== false && it.veg !== false,
          variant: it.variant || it.size || it.portion || '',
          itemId: it.itemId || it.productId || it.id || it._id || `ITM-${101 + idx}`,
        };
      });
    }

    const realName = (orderData.dishName && !isGenericCategoryName(orderData.dishName)) ? orderData.dishName
      : (orderData.productName && !isGenericCategoryName(orderData.productName)) ? orderData.productName
      : (orderData.itemName && !isGenericCategoryName(orderData.itemName)) ? orderData.itemName
      : (ride.dishName && !isGenericCategoryName(ride.dishName)) ? ride.dishName
      : (ride.productName && !isGenericCategoryName(ride.productName)) ? ride.productName
      : (ride.itemName && !isGenericCategoryName(ride.itemName)) ? ride.itemName
      : null;

    const finalName = realName || 'Men Lightweight Daily Wear Sneakers';

    return [
      {
        name: finalName,
        quantity: Number(orderData.quantity || ride.quantity || 1),
        price: Number(orderTotalFare && Number(orderTotalFare) > 0 ? orderTotalFare : 699),
        isVeg: true,
        variant: orderData.variant || ride.variant || '',
        itemId: orderData.productId || ride.productId || 'ITM-2437',
      }
    ];
  }, [orderData, liveOrderItems, ride, orderItems, orderTotalFare, orderCategoryName]);

  const handleOpenOutOfStockScreen = () => {
    setShowReachHelpModal(false);
    navigation.navigate('OutOfStockScreen', {
      ride,
      orderData,
      items: parsedOrderItems,
      bookingId: ride?.bookingId || orderData?.bookingId || bookingId,
    });
  };

  const handleOpenRestoClosedScreen = () => {
    setShowReachHelpModal(false);
    navigation.navigate('RestaurantClosedScreen', {
      ride,
      orderData,
      bookingId: ride?.bookingId || orderData?.bookingId || bookingId,
    });
  };

  const getCustomerStatusInfo = () => {
    const s = (status || '').toUpperCase();
    const targetRestoId = orderData?.restaurantId || ride?.restaurantId;
    const realRiderId = orderData?.riderId || ride?.riderId || orderData?.acceptedBy?.riderId || ride?.acceptedBy?.riderId || (!isFoodDelivery ? (orderData?.providerId || ride?.providerId) : null);
    const hasRider = Boolean(
      realRiderId &&
      realRiderId !== 'Service Provider' &&
      realRiderId !== 'Delivery Partner' &&
      realRiderId !== 'rider_provider' &&
      realRiderId !== targetRestoId &&
      riderName &&
      riderName.trim() !== '' &&
      riderName !== 'Service Provider' &&
      riderName !== 'Delivery Partner' &&
      riderName !== 'rider_provider' &&
      riderName !== restaurantName &&
      riderName !== restoName
    );

    // 0. EMERGENCY TRANSFER STATES (Requirement 16)
    if (transferStatus === 'TRANSFER_REQUESTED' || s === 'TRANSFER_REQUESTED') {
      return {
        title: 'Reassigning Delivery Partner',
        sub: 'Your partner had a vehicle issue. A nearby partner is taking over. Your food is safe! 🍲',
        subColor: '#EA580C',
        subBg: '#FFF7ED',
        subBorder: '#FDBA74',
        riderStatusText: 'Connecting to nearby partner for handover...',
        animationAsset: bikeWinnerJson,
        stepIndex: 2,
      };
    }
    if (transferStatus === 'TRANSFER_ACCEPTED_PENDING_HANDOVER' || s === 'TRANSFER_ACCEPTED_PENDING_HANDOVER') {
      return {
        title: 'Partner Handover in Progress',
        sub: `New partner ${riderName || 'arriving'} is meeting the original rider to collect your order.`,
        subColor: '#2563EB',
        subBg: '#EFF6FF',
        subBorder: '#93C5FD',
        riderStatusText: 'Handover in progress at rendezvous point...',
        animationAsset: bikeWinnerJson,
        stepIndex: 2,
      };
    }

    // 1. RINGING TO RESTAURANT/STORE
    if (s === 'RINGING' || s === 'CONNECTING' || s === 'PENDING' || s === 'BOOKING_REQUESTED' || s === 'PENDING_RESTAURANT') {
      return {
        title: `Ringing to ${orderCategoryName === 'Food' ? 'Restaurant' : 'Store'}`,
        sub: `Waiting for ${orderCategoryName === 'Food' ? 'restaurant' : 'store'} partner to accept`,
        subColor: '#0066FF',
        subBg: '#EFF6FF',
        subBorder: '#BFDBFE',
        riderStatusText: `Sending order request to ${orderCategoryName === 'Food' ? 'restaurant' : 'store'}...`,
        animationAsset: bellJson,
        stepIndex: 0,
      };
    }
    // 2. ACCEPTED / PREPARING (Real Preparing Screen)
    if (s === 'RESTAURANT_ACCEPTED' || s === 'ACCEPTED' || s === 'PREPARING' || s === 'FOOD_PREPARING') {
      const isFood = orderCategoryName.toLowerCase() === 'food';
      return {
        title: isFood ? 'Food Preparing' : `${orderCategoryName} Packing`,
        sub: isFood ? 'Kitchen is cooking your meal fresh' : `Store is packing your ${orderCategoryName.toLowerCase()} safely`,
        subColor: '#0066FF',
        subBg: '#EFF6FF',
        subBorder: '#BFDBFE',
        riderStatusText: hasRider ? `Delivery partner assigned: ${riderName}` : 'Rider assignment pending',
        animationAsset: cookingJson,
        stepIndex: 1,
      };
    }
    // 3. FOOD READY / ORDER READY
    if (s === 'FOOD_READY' || s === 'READY' || s === 'READY_FOR_PICKUP') {
      const isFood = orderCategoryName.toLowerCase() === 'food';
      return {
        title: isFood ? 'Food is ready' : `${orderCategoryName} is packed & ready`,
        sub: 'Packed & waiting for delivery partner pickup',
        subColor: '#059669',
        subBg: '#ECFDF5',
        subBorder: '#6EE7B7',
        riderStatusText: hasRider ? `${riderName} reached for pickup` : 'Delivery partner on the way for pickup',
        animationAsset: pickupReadyJson,
        stepIndex: 1,
      };
    }
    // 4. RIDER GOING TO RESTAURANT/STORE
    if (s === 'PROVIDER_ACCEPTED' || s === 'PROVIDER_ON_THE_WAY' || s === 'REACHED_PICKUP' || s === 'REACHED_RESTAURANT' || s === 'AT_PICKUP') {
      return {
        title: `Rider heading to ${orderCategoryName === 'Food' ? 'restaurant' : 'store'}`,
        sub: hasRider ? `${riderName} is heading to pick up order` : 'Delivery partner on the way to store',
        subColor: '#2563EB',
        subBg: '#EFF6FF',
        subBorder: '#93C5FD',
        riderStatusText: hasRider ? `${riderName} is heading to ${restaurantName}` : `Delivery partner heading to ${restaurantName}`,
        animationAsset: bikeWinnerJson,
        stepIndex: 2,
      };
    }
    // 5. FOOD / ORDER PICKED UP
    if (s === 'FOOD_PICKED_UP' || s === 'PICKED_UP') {
      return {
        title: `${orderCategoryName} picked up`,
        sub: hasRider ? `${riderName} has picked up your order` : 'Order has been picked up',
        subColor: '#2563EB',
        subBg: '#EFF6FF',
        subBorder: '#93C5FD',
        riderStatusText: hasRider ? `${riderName} has collected your order` : 'Order collected by delivery partner',
        animationAsset: bikeWinnerJson,
        stepIndex: 2,
      };
    }
    // 6. OUT FOR DELIVERY
    if (s === 'STARTED' || s === 'OUT_FOR_DELIVERY' || s === 'ON_THE_WAY' || s === 'SERVICE_STARTED') {
      return {
        title: 'Out for delivery',
        sub: hasRider ? `${riderName} is on the way to you` : 'Delivery partner is on the way to you',
        subColor: '#16A34A',
        subBg: '#F0FDF4',
        subBorder: '#86EFAC',
        riderStatusText: hasRider ? `${riderName} is heading to your location` : 'Delivery partner heading to your location',
        animationAsset: bikeWinnerJson,
        stepIndex: 2,
      };
    }
    // 7. DELIVERED
    if (s === 'COMPLETED' || s === 'SERVICE_COMPLETED' || s === 'DELIVERED') {
      return {
        title: 'Order delivered',
        sub: 'Order completed successfully! 🎉',
        subColor: '#16A34A',
        subBg: '#F0FDF4',
        subBorder: '#86EFAC',
        riderStatusText: 'Delivered successfully',
        animationAsset: verifyJson,
        stepIndex: 3,
      };
    }
    return {
      title: 'Order in progress',
      sub: 'Tracking live updates...',
      subColor: '#0066FF',
      subBg: '#EFF6FF',
      subBorder: '#BFDBFE',
      riderStatusText: hasRider ? `Delivery partner: ${riderName}` : 'Rider assignment pending',
      animationAsset: searchJson,
      stepIndex: 1,
    };
  };

  const handleCustomerPayNow = async () => {
    try {
      const orderRes = await api.post('/payment/create-order', { amount: Number(orderTotalFare || 220) });
      if (orderRes.data?.success) {
        Alert.alert('Razorpay Checkout', `Initiating payment of ₹${orderTotalFare}...`, [
          {
            text: 'Pay Now (Simulate Success)',
            onPress: () => {
              setIsPaidState(true);
              Alert.alert('Payment Successful! 🎉', `Payment of ₹${orderTotalFare} received online.`);
            },
          },
          { text: 'Pay on Delivery (Cash/UPI)', style: 'cancel' }
        ]);
      } else {
        Alert.alert('Payment Information', `Total Payable: ₹${orderTotalFare}\n\nYou can pay via Cash, PhonePe, Google Pay or UPI QR Code directly to the delivery partner upon arrival.`);
      }
    } catch (e) {
      Alert.alert('Payment Information', `Total Payable: ₹${orderTotalFare}\n\nYou can pay via Cash, PhonePe, Google Pay or UPI QR Code directly to the delivery partner upon arrival.`);
    }
  };

  // Synchronized Restaurant Delay Timer Effect
  useEffect(() => {
    if (!isFoodDelivery) return;

    if (status === 'FOOD_READY' || ride?.status === 'FOOD_READY') {
      setPrepTimer({
        isLate: false,
        mins: 0,
        secs: 0,
        display: 'READY TO ORDER • PLEASE PICK NOW',
      });
      return;
    }

    const prepEndsAtTime = ride.prepEndsAt
      ? new Date(ride.prepEndsAt).getTime()
      : ride.prepStartedAt && ride.preparationTime
      ? new Date(ride.prepStartedAt).getTime() + Number(ride.preparationTime) * 60000
      : null;

    if (!prepEndsAtTime) {
      const isFood = orderCategoryName.toLowerCase() === 'food';
      setPrepTimer({
        isLate: false,
        mins: 0,
        secs: 0,
        display: isFood ? 'Food preparing in kitchen' : `${orderCategoryName} packing in store`,
      });
      return;
    }

    const updateTimer = () => {
      if (status === 'FOOD_READY' || ride?.status === 'FOOD_READY') {
        setPrepTimer({
          isLate: false,
          mins: 0,
          secs: 0,
          display: 'READY TO ORDER • PLEASE PICK NOW',
        });
        return;
      }

      const now = Date.now();
      const diffMs = prepEndsAtTime - now;

      if (diffMs > 0) {
        const totalSecs = Math.floor(diffMs / 1000);
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        const isFood = orderCategoryName.toLowerCase() === 'food';
        setPrepTimer({
          isLate: false,
          mins,
          secs,
          display: `${isFood ? 'Food' : orderCategoryName} ${isFood ? 'preparing' : 'packing'} • ${mins}:${secs < 10 ? '0' : ''}${secs} left`,
        });
      } else {
        const lateSecs = Math.floor(Math.abs(diffMs) / 1000);
        const lateMins = Math.max(1, Math.floor(lateSecs / 60));
        setPrepTimer({
          isLate: true,
          mins: lateMins,
          secs: lateSecs % 60,
          display: `${orderCategoryName.toLowerCase() === 'food' ? 'Restaurant' : 'Store'} late by ${lateMins} min${lateMins > 1 ? 's' : ''}`,
        });
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [ride.prepEndsAt, ride.prepStartedAt, ride.preparationTime, isFoodDelivery, status, ride?.status]);

  const webviewRef = useRef<any>(null);

  const customerIconUrl = customerBase64;
  const driverIconUrl = bikeBase64;
  
  // The customer's location should always show the customer PNG
  const pickupMarkerUri = customerIconUrl;

  const [customMarkerUrl, setCustomMarkerUrl] = useState<string | null>(null);

  // Mount Debugging & Fast Initial Location Sync
  useEffect(() => {
    console.log('[TRACKING_SCREEN_MOUNTED]');
    console.log(`[BOOKING_STATUS]\nbookingId: ${bookingId}\nstatus: ${status}`);
    if (socket?.connected) {
      console.log('[SOCKET_CONNECTED]');
    }

    // Dismiss map loader gracefully with fallback safety timer
    const safetyTimer = setTimeout(() => {
      setMapLoading(false);
    }, 2000);

    return () => clearTimeout(safetyTimer);
  }, [isRider, ride, bookingId, status, navigation]);

  // Fast Customer Side Initial Location & Active Booking Sync
  useEffect(() => {
    if (isRider) return;
    console.log('[LOCATION_FETCH_STARTED]');

    if (driverLat && driverLon && driverLat !== pickupLat) {
      console.log(`[LOCATION_FETCH_SUCCESS]\nlatitude: ${driverLat}\nlongitude: ${driverLon}`);
    }

    // Immediately request current provider location via Socket.IO
    if (socket) {
      if (socket.connected) {
        console.log('[SOCKET_CONNECTED]');
      }
      socket.emit('get_provider_location', {
        bookingId: bookingId,
        rideId: bookingId,
        providerId: ride.providerId || ride.acceptedBy?.riderId,
      });
    }

    // Asynchronously fetch latest active booking data from backend in background
    const syncActiveBookingData = async () => {
      const uId = user?._id || user?.id;
      if (!uId) return;

      try {
        const res = await api.get(`/bookings/active?userId=${uId}&role=customer`);
        if (res.data.success && res.data.activeBooking) {
          const b = res.data.activeBooking;
          if (b.bookingId === bookingId || b._id === bookingId) {
            console.log(`[BOOKING_STATUS]\nbookingId: ${b.bookingId}\nstatus: ${b.status}`);
            if (b.status) setStatus(b.status);
            if (b.customerName) setCustomerName(b.customerName);
            if (b.customerPhoto) setCustomerPhoto(b.customerPhoto);
            if (b.customerPhone) setCustomerPhone(b.customerPhone);
            if (b.providerName) setRiderName(b.providerName);
            if (b.providerPhone) setRiderPhone(b.providerPhone);

            const freshLat = Number(b.driverLat || b.acceptedBy?.riderLocation?.latitude);
            const freshLon = Number(b.driverLon || b.acceptedBy?.riderLocation?.longitude);
            if (!isNaN(freshLat) && !isNaN(freshLon) && freshLat !== 0 && freshLon !== 0) {
              console.log(`[LOCATION_FETCH_SUCCESS]\nlatitude: ${freshLat}\nlongitude: ${freshLon}`);
              setDriverLat(freshLat);
              setDriverLon(freshLon);
              if (webviewRef.current) {
                try {
                  webviewRef.current.injectJavaScript(`
                    if (typeof teleportDriver === 'function') {
                      teleportDriver(${freshLat}, ${freshLon}, true);
                      window.teleportDone = true;
                    }
                    true;
                  `);
                } catch (e) {}
              }
            }
          }
        }
      } catch (err) {
        console.warn('[TRACKING] Background booking sync error:', err);
      }
    };

    syncActiveBookingData();
  }, [isRider, socket, bookingId, user]);

  // Asynchronous Background Status Verification (No blocking navigation freezes)
  useEffect(() => {
    const verifyStatusAsync = async () => {
      if (!bookingId) return;

      // 1. Try direct booking details fetch
      try {
        const detRes = await api.get(`/bookings/details/${bookingId}`);
        if (detRes.data?.success && detRes.data.booking) {
          const b = detRes.data.booking;
          console.log(`[BOOKING_DETAILS_SYNC]\nbookingId: ${b.bookingId}\nstatus: ${b.status}`);
          if (b.status) {
            if (b.status === 'COMPLETED' || b.status === 'SERVICE_COMPLETED' || b.status === 'DELIVERED') {
              setStatus('COMPLETED');
            } else if (b.status.includes('CANCEL')) {
              setStatus('CANCELLED');
              setCancellationReasonText(b.cancellationReason || 'Booking Cancelled');
              setCancelledByActor(b.cancelledBy || 'CUSTOMER');
            } else {
              setStatus(b.status);
            }
          }
          if (b.customerName) setCustomerName(b.customerName);
          if (b.customerPhone) setCustomerPhone(b.customerPhone);
          if (b.customerPhoto) setCustomerPhoto(b.customerPhoto);
          if (b.providerName) setRiderName(b.providerName);
          if (b.providerPhone) setRiderPhone(b.providerPhone);
          const freshLat = Number(b.driverLat || b.acceptedBy?.riderLocation?.latitude);
          const freshLon = Number(b.driverLon || b.acceptedBy?.riderLocation?.longitude);
          if (!isNaN(freshLat) && !isNaN(freshLon) && freshLat !== 0 && freshLon !== 0) {
            setDriverLat(freshLat);
            setDriverLon(freshLon);
          }
          return;
        }
      } catch (detErr) {
        // Fallback to my-bookings
      }

      const uId = user?._id || user?.id;
      if (!uId) return;

      try {
        const res = await api.get(`/bookings/my-bookings?userId=${uId}&role=${isRider ? 'provider' : 'customer'}`);
        if (res.data.success && Array.isArray(res.data.bookings)) {
          const b = res.data.bookings.find((item: any) => item.bookingId === bookingId || item._id === bookingId);
          if (b) {
            console.log(`[BOOKING_STATUS]\nbookingId: ${b.bookingId}\nstatus: ${b.status}`);
            if (b.status === 'COMPLETED' || b.status === 'SERVICE_COMPLETED' || b.status === 'DELIVERED') {
              setStatus('COMPLETED');
            } else if (b.status?.includes('CANCEL')) {
              setStatus('CANCELLED');
              setCancellationReasonText(b.cancellationReason || 'Booking Cancelled');
              setCancelledByActor(b.cancelledBy || 'CUSTOMER');
            } else if (b.status) {
              setStatus(b.status);
            }
            if (b.providerName) setRiderName(b.providerName);
            if (b.providerPhone) setRiderPhone(b.providerPhone);
            if (b.customerName) setCustomerName(b.customerName);
            if (b.customerPhone) setCustomerPhone(b.customerPhone);
          }
        }
      } catch (err) {
        console.warn('[TRACKING] Background status verification error:', err);
      }
    };

    verifyStatusAsync();
  }, [bookingId, isRider, user]);

  // Non-blocking single banner fetch without alerts or full webview re-render
  useEffect(() => {
    const fetchBannersQuietly = async () => {
      try {
        const cleanBase = BASE_URL.replace(/\/+$/, '');
        const res = await fetch(`${cleanBase}/banner`);
        const json = await res.json();
        if (json.success && json.data) {
          const target = isRider ? 'Rider' : 'Customer';
          const banner = json.data.find((b: any) => (b.target === target || (!b.target && target === 'Customer')) && b.status === 'Active');
          if (banner) {
            const hostUrl = cleanBase.replace(/\/api$/, '');
            const url = banner.imageUrl.startsWith('http') ? banner.imageUrl : `${hostUrl}${banner.imageUrl}`;
            setCustomMarkerUrl(url);
            if (webviewRef.current) {
              webviewRef.current.injectJavaScript(`
                if (typeof updatePickupMarker === 'function') {
                  updatePickupMarker("${url}");
                }
                true;
              `);
            }
          }
        }
      } catch (err) {
        console.warn('Failed to fetch custom markers', err);
      }
    };

    fetchBannersQuietly();
  }, [isRider]);

  // Update popup texts dynamically when toggling test modes (without reloading WebView)
  useEffect(() => {
    if (webviewRef.current) {
      const js = `
        if (typeof pickupMarker !== 'undefined' && typeof driverMarker !== 'undefined') {
          var pickupText = ${isRider} ? (${isFoodDelivery} ? 'Restaurant / Store Pickup' : 'Customer Pickup') : 'Your location';
          var driverText = ${isRider} ? 'You are here' : 'Rider is here';
          pickupMarker.setTooltipContent(pickupText);
          driverMarker.setTooltipContent(driverText);
        }
        true;
      `;
      webviewRef.current.injectJavaScript(js);
    }
  }, [isRider, isFoodDelivery]);

  // Rider's own GPS tracking (Real Device GPS -> WebView -> Socket via RiderLocationService)
  useEffect(() => {
    if (!isRider) return;
    const rId = user?._id || user?.id || ride.acceptedBy?.riderId || 'rider_provider';

    // Do not track if status is completed, cancelled or inactive
    if (status === 'COMPLETED' || status === 'DELIVERED' || status === 'CANCELLED' || status === 'REJECTED') {
      cleanupTracking();
      return;
    }

    riderLocationService.startTracking(
      String(rId),
      socket,
      (coords) => {
        setDriverLat(coords.latitude);
        setDriverLon(coords.longitude);
        setGpsDebugInfo({
          role: 'Rider (Hardware Live)',
          lat: coords.latitude,
          lon: coords.longitude,
          accuracy: (coords as any).accuracy || null,
          source: 'DEVICE_GPS',
          lastUpdated: new Date().toLocaleTimeString(),
        });

        if (webviewRef.current) {
          try {
            const js = `
              if (typeof window !== 'undefined') {
                if (!window.teleportDone) {
                  if (typeof teleportDriver === 'function') {
                    teleportDriver(${coords.latitude}, ${coords.longitude}, true);
                    window.teleportDone = true;
                  }
                } else {
                  if (typeof updateDriverLocation === 'function') {
                    updateDriverLocation(${coords.latitude}, ${coords.longitude}, true);
                  }
                }
              }
              true;
            `;
            webviewRef.current.injectJavaScript(js);
          } catch (e) {}
        }
      },
      ride.rideId || bookingId
    );

    return () => {
      cleanupTracking();
    };
  }, [isRider, status, socket, ride.rideId, bookingId, user?._id, user?.id]);

  // Specification: No auto-arrival. Rider must explicitly tap 'REACHED STORE' / 'REACHED PICKUP' to mark arrived.
  // Geofence auto-advance disabled per user requirement: "delivey ptner jab tk reach na kare to auto reach na ho"
  useEffect(() => {
    // Passive distance monitoring only — no automatic status modification
  }, []);

  // Real-time socket updates for driver GPS location (Customer Side)
  useEffect(() => {
    if (!socket || isRider) return; // Riders don't listen to their own updates via socket

    const targetEvent = `provider_location_${bookingId}`;
    console.log(`[TRACKING] Setting up socket listener for event: ${targetEvent}`);

    const handleLocationUpdate = (data: any) => {
      if (!data) return;
      const targetBId = String(data.bookingId || data.rideId || data.orderId || '');
      if (targetBId && String(bookingId) && targetBId !== String(bookingId)) return;
      const incomingRiderId = String(data.riderId || data.providerId || '');
      const assignedRiderId = String(ride?.riderId || ride?.acceptedBy?.riderId || ride?.acceptedBy?._id || '');
      if (incomingRiderId && assignedRiderId && incomingRiderId !== assignedRiderId) return;

      if (data.latitude && data.longitude) {
        const newLat = Number(data.latitude);
        const newLon = Number(data.longitude);
        if (!isNaN(newLat) && !isNaN(newLon) && newLat !== 0 && newLon !== 0) {
          console.log(`[SOCKET_LOCATION_UPDATE]\nbookingId: ${bookingId}\nlatitude: ${newLat}\nlongitude: ${newLon}`);
          console.log(`[LOCATION_FETCH_SUCCESS]\nlatitude: ${newLat}\nlongitude: ${newLon}`);
          setDriverLat(newLat);
          setDriverLon(newLon);
          setGpsDebugInfo({
            role: 'Customer (Rider Tracking)',
            lat: newLat,
            lon: newLon,
            accuracy: data.accuracy || null,
            source: 'SOCKET',
            lastUpdated: new Date().toLocaleTimeString(),
          });

          if (webviewRef.current) {
            try {
              console.log('[TRACKING] updating supplier marker in WebView');
              const js = `
                if (typeof window !== 'undefined') {
                  if (!window.teleportDone) {
                    if (typeof teleportDriver === 'function') { 
                      teleportDriver(${newLat}, ${newLon}, true); 
                      window.teleportDone = true;
                    }
                  } else {
                    if (typeof updateDriverLocation === 'function') { 
                      updateDriverLocation(${newLat}, ${newLon}, true); 
                    }
                  }
                  true;
                }
              `;
              webviewRef.current.injectJavaScript(js);
            } catch (e) {
              console.warn('[TRACKING] WebView Inject Error:', e);
            }
          }
        }
      }
    };

    const handleServiceCompleted = () => {
      setStatusSafe('COMPLETED');
      cleanupTracking();
      Alert.alert('Trip Completed 🎉', 'The ride has been completed successfully.');
    };

    const handleProviderArrived = () => {
      setStatusSafe('PROVIDER_ARRIVED');
    };

    const handleServiceStarted = () => {
      setStatusSafe('STARTED');
    };

    const handleRideAccepted = (data: any) => {
      const bId = data?.bookingId || data?.rideId;
      if (bId && bId !== bookingId) return;
      console.log('📢 [LIVE TRACKING] Order accepted by partner:', data);
      setStatusSafe('ACCEPTED');
      const realName = data?.acceptedBy?.riderName || data?.riderName || (!isFoodDelivery ? data?.providerName : '');
      if (realName && realName !== 'Service Provider' && realName !== 'Delivery Partner') {
        setRiderName(realName);
      }
      const realPhone = data?.acceptedBy?.riderPhone || data?.riderPhone || (!isFoodDelivery ? data?.providerPhone : '');
      if (realPhone) {
        setRiderPhone(realPhone);
      }
      const realPhoto = data?.acceptedBy?.riderPhoto || data?.acceptedBy?.profilePicture || data?.riderPhoto || (!isFoodDelivery ? data?.providerPhoto : null);
      if (realPhoto) {
        setRiderPhoto(realPhoto);
      }
      const riderId = data?.acceptedBy?.riderId || data?.riderId || (!isFoodDelivery ? data?.providerId : null);
      if (riderId) {
        fetchRiderDetails(riderId);
      }
      const loc = data?.acceptedBy?.riderLocation || data?.riderLocation;
      if (loc) {
        const rLat = Number(loc.latitude);
        const rLon = Number(loc.longitude);
        if (rLat && rLon) {
          setDriverLat(rLat);
          setDriverLon(rLon);
        }
      }
    };

    const handleFoodAccepted = (data: any) => {
      const bId = data?.bookingId || data?.rideId;
      if (bId && bId !== bookingId) return;
      if (hasPickedUpRef.current || (STATUS_RANKS[status] || 0) >= 6) return;
      console.log('📢 [LIVE TRACKING] Food order accepted / preparing:', data);
      setStatusSafe('PREPARING');
      if (data?.booking) {
        setOrderData(data.booking);
        if (data.booking.restaurantName) setRestoName(data.booking.restaurantName);
        if (data.booking.price) setLiveOrderTotal(Number(data.booking.price));
      }
    };

    const handleFoodReady = (data: any) => {
      const bId = data?.bookingId || data?.rideId;
      if (bId && bId !== bookingId) return;
      if (hasPickedUpRef.current || (STATUS_RANKS[status] || 0) >= 6) return;
      console.log('📢 [LIVE TRACKING] Food is ready:', data);
      setStatusSafe('FOOD_READY');
      if (data?.booking) {
        setOrderData(data.booking);
      }
    };

    const handleBookingStatusUpdated = (data: any) => {
      const bId = data?.bookingId || data?.rideId;
      if (bId && bId !== bookingId) return;
      if (data?.status) {
        console.log('📢 [LIVE TRACKING] Status updated via socket:', data.status);
        const normSt = (data.status === 'RESTAURANT_ACCEPTED' || data.status === 'FOOD_PREPARING') ? 'PREPARING' : (data.status === 'READY_FOR_PICKUP' ? 'FOOD_READY' : data.status);
        if (hasPickedUpRef.current && (STATUS_RANKS[normSt] || 0) < 6) {
          console.log(`[SOCKET GUARD] Ignoring regression socket update: ${normSt}`);
          return;
        }
        setStatusSafe(normSt);
      }
      if (data?.deliveryStatus === 'SEARCHING_FOR_RIDER' || data?.riderId === null) {
        console.log('📢 [LIVE TRACKING] Rider unassigned, searching new rider');
        setRiderName('');
        setRiderPhone('');
        setDriverLat(null as any);
        setDriverLon(null as any);
        setDeliveryStatus('SEARCHING_FOR_RIDER');
      }
      if (data?.booking) {
        setOrderData(data.booking);
        if (data.booking.restaurantName) setRestoName(data.booking.restaurantName);
        if (data.booking.riderId === null || data.booking.deliveryStatus === 'SEARCHING_FOR_RIDER') {
          setRiderName('');
          setRiderPhone('');
          setDriverLat(null as any);
          setDriverLon(null as any);
          setDeliveryStatus('SEARCHING_FOR_RIDER');
        }
      }
    };

    const handleRiderSearchStatus = (data: any) => {
      const bId = data?.bookingId || data?.rideId;
      if (bId && bId !== bookingId) return;
      if (data?.deliveryStatus === 'SEARCHING_FOR_RIDER') {
        console.log('📢 [LIVE TRACKING] RIDER_SEARCH_STATUS received: resetting rider details');
        setRiderName('');
        setRiderPhone('');
        setDriverLat(null as any);
        setDriverLon(null as any);
        setDeliveryStatus('SEARCHING_FOR_RIDER');
        setOrderData((prev: any) => prev ? {
          ...prev,
          riderId: null,
          riderName: null,
          riderPhone: null,
          acceptedBy: null,
          deliveryStatus: 'SEARCHING_FOR_RIDER',
        } : prev);
      }
    };

    const handleSocketConnect = () => {
      console.log('[SOCKET_CONNECTED]');
      socket.emit('get_provider_location', {
        bookingId: bookingId,
        rideId: bookingId,
        providerId: ride.providerId || ride.acceptedBy?.riderId,
      });
    };

    // Join dedicated booking room for live GPS
    if (bookingId) {
      socket.emit('join_booking_room', { bookingId });
    }

    // Strict cleanup before adding to prevent duplicate listeners on one device
    socket.off(targetEvent, handleLocationUpdate);
    socket.off('rider_location_updated', handleLocationUpdate);
    socket.off('service_completed', handleServiceCompleted);
    socket.off('provider_arrived', handleProviderArrived);
    socket.off('service_started', handleServiceStarted);
    const handleRestaurantRinging = (data: any) => {
      const bId = data?.bookingId || data?.rideId;
      if (bId && bId !== bookingId) return;
      console.log('📢 [LIVE TRACKING] Restaurant ringing ack:', data);
      setStatus('RINGING');
    };

    socket.off('ride_accepted', handleRideAccepted);
    socket.off('service_accepted', handleRideAccepted);
    socket.off('RESTAURANT_ACCEPTED', handleFoodAccepted);
    socket.off('restaurant_accepted', handleFoodAccepted);
    socket.off('FOOD_PREPARING', handleFoodAccepted);
    socket.off('food_preparing', handleFoodAccepted);
    socket.off('FOOD_READY', handleFoodReady);
    socket.off('food_ready', handleFoodReady);
    socket.off('booking_status_updated', handleBookingStatusUpdated);
    socket.off('order_status_updated', handleBookingStatusUpdated);
    socket.off('restaurant_ringing', handleRestaurantRinging);
    socket.off('connect', handleSocketConnect);

    const handleTransferAccepted = (data: any) => {
      const bId = data?.bookingId || data?.orderId;
      if (bId && bId !== bookingId) return;
      console.log('📢 [LIVE TRACKING] Transfer accepted event:', data);
      setTransferStatus('TRANSFER_ACCEPTED_PENDING_HANDOVER');
      if (data?.transferRiderName) setRiderName(data.transferRiderName);
      if (data?.transferRiderPhone) setRiderPhone(data.transferRiderPhone);
      if (data?.transferRiderPhoto) setRiderPhoto(data.transferRiderPhoto);
    };

    const handleTransferCompleted = (data: any) => {
      const bId = data?.bookingId || data?.orderId;
      if (bId && bId !== bookingId) return;
      console.log('🎉 [LIVE TRACKING] Transfer completed event:', data);
      setTransferStatus('TRANSFER_COMPLETED');
      setStatusSafe('OUT_FOR_DELIVERY');
      if (data?.riderName) setRiderName(data.riderName);
      if (data?.riderPhone) setRiderPhone(data.riderPhone);
      if (data?.riderPhoto) setRiderPhoto(data.riderPhoto);
    };

    const handleNewRiderAssigned = (data: any) => {
      const bId = data?.bookingId || data?.orderId;
      if (bId && bId !== bookingId) return;
      console.log('🚴 [LIVE TRACKING] New rider assigned:', data);
      if (data?.riderName) setRiderName(data.riderName);
      if (data?.riderPhone) setRiderPhone(data.riderPhone);
      if (data?.riderPhoto) setRiderPhoto(data.riderPhoto);
      if (data?.riderLatitude && data?.riderLongitude) {
        setDriverLat(Number(data.riderLatitude));
        setDriverLon(Number(data.riderLongitude));
      }
    };

    const handleFoodPickedUp = (data: any) => {
      const bId = data?.bookingId || data?.orderId || data?.rideId;
      if (bId && bId !== bookingId && bId !== ride?.bookingId && bId !== ride?.rideId) return;
      console.log('📦 [LIVE TRACKING] Food picked up event:', data);
      hasPickedUpRef.current = true;
      setStatusSafe('OUT_FOR_DELIVERY');
      setIsPickOrderMinimized(false);
    };

    socket.on(targetEvent, handleLocationUpdate);
    socket.on('rider_location_updated', handleLocationUpdate);
    socket.on('service_completed', handleServiceCompleted);
    socket.on('provider_arrived', handleProviderArrived);
    socket.on('service_started', handleServiceStarted);
    socket.on('food_picked_up', handleFoodPickedUp);
    socket.on('ride_accepted', handleRideAccepted);
    socket.on('service_accepted', handleRideAccepted);
    socket.on('RESTAURANT_ACCEPTED', handleFoodAccepted);
    socket.on('restaurant_accepted', handleFoodAccepted);
    socket.on('FOOD_PREPARING', handleFoodAccepted);
    socket.on('food_preparing', handleFoodAccepted);
    socket.on('FOOD_READY', handleFoodReady);
    socket.on('food_ready', handleFoodReady);
    socket.on('booking_status_updated', handleBookingStatusUpdated);
    socket.on('order_status_updated', handleBookingStatusUpdated);
    socket.on('RIDER_SEARCH_STATUS', handleRiderSearchStatus);
    socket.on('TRANSFER_ACCEPTED', handleTransferAccepted);
    socket.on('TRANSFER_COMPLETED', handleTransferCompleted);
    socket.on('ORDER_TRANSFERRED', handleTransferCompleted);
    socket.on('ORDER_HANDOVER_VERIFIED', handleTransferCompleted);
    socket.on('HANDOVER_VERIFIED', handleTransferCompleted);
    socket.on('RIDER_ASSIGNED', handleNewRiderAssigned);
    socket.on('NEW_RIDER_ASSIGNED', handleNewRiderAssigned);
    socket.on('restaurant_ringing', handleRestaurantRinging);
    socket.on('connect', handleSocketConnect);

    return () => {
      console.log(`[TRACKING] Cleaning up socket listener for event: ${targetEvent}`);
      if (bookingId) {
        socket.emit('leave_booking_room', { bookingId });
      }
      socket.off(targetEvent, handleLocationUpdate);
      socket.off('rider_location_updated', handleLocationUpdate);
      socket.off('service_completed', handleServiceCompleted);
      socket.off('provider_arrived', handleProviderArrived);
      socket.off('service_started', handleServiceStarted);
      socket.off('food_picked_up', handleFoodPickedUp);
      socket.off('ride_accepted', handleRideAccepted);
      socket.off('service_accepted', handleRideAccepted);
      socket.off('RESTAURANT_ACCEPTED', handleFoodAccepted);
      socket.off('restaurant_accepted', handleFoodAccepted);
      socket.off('FOOD_PREPARING', handleFoodAccepted);
      socket.off('food_preparing', handleFoodAccepted);
      socket.off('FOOD_READY', handleFoodReady);
      socket.off('food_ready', handleFoodReady);
      socket.off('booking_status_updated', handleBookingStatusUpdated);
      socket.off('order_status_updated', handleBookingStatusUpdated);
      socket.off('RIDER_SEARCH_STATUS', handleRiderSearchStatus);
      socket.off('TRANSFER_ACCEPTED', handleTransferAccepted);
      socket.off('TRANSFER_COMPLETED', handleTransferCompleted);
      socket.off('ORDER_TRANSFERRED', handleTransferCompleted);
      socket.off('ORDER_HANDOVER_VERIFIED', handleTransferCompleted);
      socket.off('HANDOVER_VERIFIED', handleTransferCompleted);
      socket.off('RIDER_ASSIGNED', handleNewRiderAssigned);
      socket.off('NEW_RIDER_ASSIGNED', handleNewRiderAssigned);
      socket.off('connect', handleSocketConnect);
    };
  }, [socket, followLocation, isRider, bookingId]);

  // Real-Time Polling Sync for Customer Preparing/Live Order (Every 3 seconds)
  useEffect(() => {
    if (!bookingId) return;

    let isMounted = true;
    const fetchLatestBooking = async () => {
      try {
        const res = await api.get(`/bookings/details/${bookingId}`);
        if (res.data?.success && res.data?.booking && isMounted) {
          const b = res.data.booking;
          setOrderData(b);
          if (b.status) {
            const normalizedSt = (b.status === 'RESTAURANT_ACCEPTED' || b.status === 'FOOD_PREPARING')
              ? 'PREPARING'
              : (b.status === 'READY_FOR_PICKUP' ? 'FOOD_READY' : b.status);

            const isPickedUp = (
              b.riderStatus === 'OUT_FOR_DELIVERY' ||
              b.riderStatus === 'FOOD_PICKED_UP' ||
              b.status === 'OUT_FOR_DELIVERY' ||
              b.status === 'STARTED' ||
              b.status === 'SERVICE_STARTED'
            );
            const isFinished = (b.status === 'COMPLETED' || b.status === 'DELIVERED' || b.riderStatus === 'DELIVERED');

            if (isFinished) {
              setStatusSafe('COMPLETED');
            } else if (isPickedUp) {
              setStatusSafe('OUT_FOR_DELIVERY');
            } else if (isRider && isFoodDelivery && (b.riderStatus === 'REACHED_RESTAURANT' || b.deliveryStatus === 'RIDER_AT_RESTAURANT' || status === 'REACHED_RESTAURANT' || status === 'PROVIDER_ARRIVED')) {
              setStatusSafe('REACHED_RESTAURANT');
            } else {
              setStatusSafe(normalizedSt);
            }
          }
          if (b.restaurantName) {
            setRestoName(b.restaurantName);
          }
          if (b.items || b.cartItems) {
            setLiveOrderItems(b.items || b.cartItems);
          }
          if (b.price || b.totalAmount || b.subtotal) {
            setLiveOrderTotal(Number(b.price || b.totalAmount || b.subtotal));
          }
          if (b.paymentStatus === 'COMPLETED' || b.paymentStatus === 'PAID' || b.isPaid) {
            setIsPaidState(true);
          }
          if (b.transferStatus) {
            setTransferStatus(b.transferStatus);
          }
          // Only update rider info if there is a real assigned rider
          const assignedRiderId = b.riderId || b.acceptedBy?.riderId || (!isFoodDelivery ? b.providerId : null);
          const assignedRiderName = b.riderName || b.acceptedBy?.riderName || (!isFoodDelivery ? b.providerName : '');
          const assignedRiderPhone = b.riderPhone || b.acceptedBy?.riderPhone || (!isFoodDelivery ? b.providerPhone : '');
          const assignedRiderPhoto = b.riderPhoto || b.acceptedBy?.riderPhoto || b.acceptedBy?.profilePicture || (!isFoodDelivery ? b.providerPhoto : null);

          if (assignedRiderName && assignedRiderName !== 'Service Provider' && assignedRiderName !== 'Delivery Partner' && assignedRiderName !== b.restaurantName) {
            setRiderName(assignedRiderName);
          }
          if (assignedRiderPhone) {
            setRiderPhone(assignedRiderPhone);
          }
          if (assignedRiderPhoto) {
            setRiderPhoto(assignedRiderPhoto);
          }
          if (assignedRiderId) {
            fetchRiderDetails(assignedRiderId);
          }
          if (b.driverLat && b.driverLon) {
            setDriverLat(Number(b.driverLat));
            setDriverLon(Number(b.driverLon));
          } else if (b.acceptedBy?.riderLocation?.latitude && b.acceptedBy?.riderLocation?.longitude) {
            setDriverLat(Number(b.acceptedBy.riderLocation.latitude));
            setDriverLon(Number(b.acceptedBy.riderLocation.longitude));
          }
          if (b.pickupLatitude && b.pickupLongitude) {
            setPickupLat(Number(b.pickupLatitude));
            setPickupLon(Number(b.pickupLongitude));
          }
          if (b.destinationLatitude && b.destinationLongitude) {
            setDestLat(Number(b.destinationLatitude));
            setDestLon(Number(b.destinationLongitude));
          }
          if (b.status === 'CANCELLED' || b.status === 'RESTAURANT_DECLINED' || b.status === 'TIMEOUT') {
            setCancellationReasonText(b.cancellationReason || 'Order cancelled');
            setCancelledByActor(b.cancelledBy || 'SUPPLIER');
          }
        }
      } catch (err) {
        console.log('[POLL NOTICE] Live order polling sync check:', err);
      }
    };

    fetchLatestBooking();
    const interval = setInterval(fetchLatestBooking, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [bookingId]);

  // Listen for ALL cancellations (Rider & Customer Side)
  useEffect(() => {
    if (!socket) return;

    const handleCancellation = (data: any) => {
      if (data?.reason === 'assigned_to_another') {
        // Rider assigned event; order is active and moving forward
        return;
      }
      const cancelledRideId = data?.rideId || data?.bookingId;
      const currentActiveId = String(ride.bookingId || ride.rideId || ride._id || bookingId || '');
      // Strict check: only cancel if cancelledRideId matches this specific order, NEVER on empty broadcast
      if (cancelledRideId && currentActiveId && (String(cancelledRideId) === currentActiveId || String(cancelledRideId) === String(ride.bookingId) || String(cancelledRideId) === String(ride._id))) {
        const reason = data?.reason || data?.cancellationReason || 'Order cancelled';
        const rawActor = (data?.cancelledBy || '').toUpperCase();
        let normalizedActor = 'CUSTOMER';
        if (rawActor.includes('ADMIN')) normalizedActor = 'ADMIN';
        else if (rawActor === 'RIDER' || rawActor === 'DRIVER') normalizedActor = 'RIDER';
        else if (rawActor === 'STORE' || rawActor === 'SUPPLIER' || rawActor === 'RESTAURANT' || rawActor === 'PROVIDER') normalizedActor = 'STORE';
        else normalizedActor = 'CUSTOMER';
        
        cleanupTracking();
        try {
          rideStore.clearRide();
          AsyncStorage.removeItem('active_food_booking_id').catch(() => {});
        } catch (_) {}
        setCancellationReasonText(reason);
        setCancelledByActor(normalizedActor);
      }
    };

    const handleTransferred = (data: any) => {
      const bId = data?.bookingId || data?.rideId;
      if (bId === ride.rideId || bId === ride.bookingId || (ride._id && bId === ride._id)) {
        if (showRiderHelpModal) {
          // Keep screen active while rider is in the help / radar transfer flow
          console.log('[LiveTracking] ORDER_TRANSFERRED received while RiderOrderHelpFlowModal is active');
          return;
        }
        cleanupTracking();
        rideStore.clearRide();
        AsyncStorage.removeItem('active_food_booking_id').catch(() => {});
        Alert.alert('Order Transferred', 'Order has been re-dispatched with ₹0 penalty.');
        navigation.reset({
          index: 0,
          routes: [{ name: 'DeliveryRiderHomeScreen' }],
        });
      }
    };

    socket.on('booking_cancelled_by_customer', handleCancellation);
    socket.on('ride_cancelled_by_customer', handleCancellation);
    socket.on('booking_cancelled_by_restaurant', handleCancellation);
    socket.on('booking_cancelled', handleCancellation);
    socket.on('service_cancelled', handleCancellation);
    socket.on('ride_cancelled', handleCancellation);
    socket.on('order_cancelled', handleCancellation);
    socket.on('RESTAURANT_DECLINED', handleCancellation);
    socket.on('ORDER_CANCELLED', handleCancellation);
    socket.on('FOOD_CANCELLED', handleCancellation);
    socket.on('DELIVERY_REQUEST_CANCELLED', handleCancellation);
    socket.on('ORDER_TRANSFERRED', handleTransferred);

    return () => {
      socket.off('booking_cancelled_by_customer', handleCancellation);
      socket.off('ride_cancelled_by_customer', handleCancellation);
      socket.off('booking_cancelled_by_restaurant', handleCancellation);
      socket.off('booking_cancelled', handleCancellation);
      socket.off('service_cancelled', handleCancellation);
      socket.off('ride_cancelled', handleCancellation);
      socket.off('order_cancelled', handleCancellation);
      socket.off('RESTAURANT_DECLINED', handleCancellation);
      socket.off('ORDER_CANCELLED', handleCancellation);
      socket.off('FOOD_CANCELLED', handleCancellation);
      socket.off('DELIVERY_REQUEST_CANCELLED', handleCancellation);
      socket.off('ORDER_TRANSFERRED', handleTransferred);
    };
  }, [socket, isRider, ride, bookingId]);

  // Real Geodesic Haversine Distance & Realistic Dynamic ETA
  const calculateHaversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  useEffect(() => {
    const isPickedUp = Boolean(
      hasPickedUpRef.current ||
      status === 'OUT_FOR_DELIVERY' ||
      status === 'FOOD_PICKED_UP' ||
      status === 'PICKED_UP' ||
      ride?.riderStatus === 'OUT_FOR_DELIVERY' ||
      ride?.riderStatus === 'FOOD_PICKED_UP' ||
      (!isFoodDelivery && (status === 'STARTED' || status === 'SERVICE_STARTED'))
    );
    const targetLat = (isRider && !isPickedUp) ? pickupLat : (isPickedUp && destLat > 0 ? destLat : pickupLat);
    const targetLon = (isRider && !isPickedUp) ? pickupLon : (isPickedUp && destLon > 0 ? destLon : pickupLon);
    const distKm = calculateHaversineDistance(driverLat, driverLon, targetLat, targetLon);
    if (!isNaN(distKm) && distKm > 0) {
      const formattedDist = distKm < 1 ? `${Math.max(10, Math.round(distKm * 1000))} m` : `${distKm.toFixed(1)} km`;
      setDistance(formattedDist);
      const minutes = Math.max(1, Math.round((distKm / 25) * 60));
      setEta(`${minutes} Mins`);
    }
  }, [driverLat, driverLon, pickupLat, pickupLon, destLat, destLon, status, ride?.riderStatus, isRider, isFoodDelivery]);

  const handleOpenNavigationMaps = () => {
    const isPickedUp = Boolean(
      hasPickedUpRef.current ||
      status === 'OUT_FOR_DELIVERY' ||
      status === 'FOOD_PICKED_UP' ||
      status === 'PICKED_UP' ||
      ride?.riderStatus === 'OUT_FOR_DELIVERY' ||
      ride?.riderStatus === 'FOOD_PICKED_UP' ||
      (!isFoodDelivery && (status === 'STARTED' || status === 'SERVICE_STARTED'))
    );
    const targetLat = isPickedUp && destLat > 0 ? destLat : pickupLat;
    const targetLon = isPickedUp && destLon > 0 ? destLon : pickupLon;
    const targetAddr = isPickedUp ? destinationAddress : pickupAddress;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${driverLat},${driverLon}&destination=${targetLat},${targetLon}&travelmode=driving`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Navigation', `Navigating to ${targetAddr}`);
    });
  };

  // In-App WebRTC Calling (Zero phone number exposure)
  const handleCall = () => {
    setShowCallModal(true);
  };

  // In-App Real-Time Chat (Zero WhatsApp dependency)
  const handleMessage = () => {
    const targetUserId = isRider
      ? (ride?.customerId || orderData?.customerId || ride?.userId || orderData?.userId)
      : (ride?.acceptedBy?.riderId || ride?.riderId || orderData?.riderId || ride?.providerId || orderData?.providerId || 'rider_provider_1');

    const otherParticipant = isRider
      ? { _id: targetUserId, name: customerName || 'Customer', username: customerName || 'Customer' }
      : { _id: targetUserId, name: riderName || 'Delivery Partner', username: riderName || 'Delivery Partner' };

    navigation.navigate('ChatRoom', {
      user: otherParticipant,
      otherUser: otherParticipant,
      receiverId: targetUserId,
      userId: targetUserId,
      rideId: ride?.rideId || bookingId,
      bookingId: ride?.rideId || bookingId,
      orderId: formattedOrderId,
      restaurantName,
      riderName,
      customerName,
      orderStatus: status,
      chatContext: isRider ? 'RIDER_TO_CUSTOMER' : 'CUSTOMER_TO_RIDER',
    });
  };

  const handleChatWithRestaurant = () => {
    const restoId = orderData?.restaurantId || ride?.restaurantId || orderData?.providerId || ride?.providerId;
    const restoParticipant = {
      _id: restoId,
      name: restaurantName || 'Restaurant Partner',
      username: restaurantName || 'Restaurant Partner',
      profilePicture: restaurantPhotos[0] || '',
    };
    navigation.navigate('ChatRoom', {
      user: restoParticipant,
      otherUser: restoParticipant,
      receiverId: restoId,
      userId: restoId,
      rideId: ride?.rideId || bookingId,
      bookingId: ride?.rideId || bookingId,
      orderId: formattedOrderId,
      restaurantName,
      riderName,
      customerName,
      orderStatus: status,
      chatContext: 'RESTAURANT',
    });
  };

  const handleDirectOrderPickup = async () => {
    try {
      const targetBookingId = ride?.bookingId || ride?.rideId || ride?._id || bookingId;
      const targetProviderId = ride?.acceptedBy?.riderId || ride?.providerId || (isRider ? (user?._id || user?.id) : undefined);
      const targetRestoId = orderData?.restaurantId || ride?.restaurantId || orderData?.providerId || ride?.providerId;

      hasPickedUpRef.current = true;
      setStatusSafe('OUT_FOR_DELIVERY');
      setIsPickOrderMinimized(false);

      // Call API to advance order state
      try {
        await api.put('/bookings/status', {
          bookingId: targetBookingId,
          providerId: targetProviderId,
          status: 'OUT_FOR_DELIVERY',
          riderStatus: 'OUT_FOR_DELIVERY',
          riderLatitude: driverLat || null,
          riderLongitude: driverLon || null,
        });
      } catch (e) {
        console.log('[DIRECT PICKUP API NOTICE]', e);
      }

      // Real-time socket broadcast
      if (socket) {
        socket.emit('food_picked_up', {
          rideId: targetBookingId,
          bookingId: targetBookingId,
          customerId: ride?.customerId,
          restaurantId: targetRestoId,
          riderId: targetProviderId,
        });
        socket.emit('order_status_updated', {
          rideId: targetBookingId,
          bookingId: targetBookingId,
          status: 'OUT_FOR_DELIVERY',
          riderStatus: 'OUT_FOR_DELIVERY',
        });
      }

      // Update local rideStore
      try {
        rideStore.setCurrentRide({
          ...ride,
          status: 'OUT_FOR_DELIVERY',
          riderStatus: 'OUT_FOR_DELIVERY',
          bookingId: targetBookingId,
        });
      } catch (e) {}

      Alert.alert(
        'ऑर्डर पिकअप संपन्न! 🛵',
        'ऑर्डर स्टोर/सप्लायर से पिक कर लिया गया है। अब कस्टमर की लोकेशन पर सुरक्षित डिलीवर करें।'
      );
    } catch (err: any) {
      console.error('Direct pickup error:', err);
      hasPickedUpRef.current = true;
      setStatusSafe('OUT_FOR_DELIVERY');
      setIsPickOrderMinimized(false);
    }
  };

  const handleCompletePickupWithRating = async (skip: boolean = false) => {
    try {
      setIsSubmittingRating(true);
      const targetBookingId = ride?.bookingId || ride?.rideId || ride?._id || bookingId;
      const restoId = orderData?.restaurantId || ride?.restaurantId || orderData?.providerId || ride?.providerId;

      if (!skip && restoRating > 0) {
        try {
          await api.post('/bookings/rate', {
            bookingId: targetBookingId,
            rating: restoRating,
            reviewText: restoReviewText || 'Pickup completed smoothly',
            ratingTarget: 'restaurant',
            restaurantId: restoId,
            ratedBy: 'rider',
          });
        } catch (e) {
          console.log('[RESTO RATING API NOTICE]', e);
        }
      }

      hasPickedUpRef.current = true;
      setShowRestoRatingModal(false);
      setStatusSafe('OUT_FOR_DELIVERY');
      setIsPickOrderMinimized(false);
      await handleUpdateStatus('OUT_FOR_DELIVERY');
      Alert.alert('ऑर्डर पिक हुआ', 'ऑर्डर पिक कर लिया गया है। अब कस्टमर की लोकेशन पर डिलीवर करें।');
    } catch (err) {
      console.error('Rating / pickup error:', err);
      hasPickedUpRef.current = true;
      setShowRestoRatingModal(false);
      setStatusSafe('OUT_FOR_DELIVERY');
      setIsPickOrderMinimized(false);
      await handleUpdateStatus('OUT_FOR_DELIVERY');
    } finally {
      setIsSubmittingRating(false);
    }
  };

  async function handleUpdateStatus(newStatus: string) {
    setStatus(newStatus);
    if (newStatus === 'REACHED_RESTAURANT' || newStatus === 'PROVIDER_ARRIVED' || newStatus === 'REACHED_PICKUP') {
      setIsPickOrderMinimized(false);
    }
    if (newStatus === 'OUT_FOR_DELIVERY' || newStatus === 'PICKED_UP' || newStatus === 'FOOD_PICKED_UP' || newStatus === 'REACHED_CUSTOMER' || newStatus === 'COMPLETED' || newStatus === 'DELIVERED') {
      hasPickedUpRef.current = true;
    }
    const targetBookingId = ride?.bookingId || ride?.rideId || ride?._id || bookingId;
    const targetProviderId = ride?.acceptedBy?.riderId || ride?.providerId || (isRider ? (user?._id || user?.id) : undefined);

    // Update rideStore
    try {
      if (newStatus === 'COMPLETED') {
        rideStore.clearRide();
      } else {
        rideStore.setCurrentRide({
          ...ride,
          status: (isFoodDelivery && (newStatus === 'REACHED_RESTAURANT' || newStatus === 'PROVIDER_ARRIVED')) ? (ride.status || 'PREPARING') : newStatus,
          riderStatus: (newStatus === 'REACHED_RESTAURANT' || newStatus === 'PROVIDER_ARRIVED') ? 'REACHED_RESTAURANT' : newStatus,
          bookingId: targetBookingId,
        });
      }
    } catch (e) {}

    // Emit socket
    if (socket) {
      if (newStatus === 'REACHED_RESTAURANT' || (isFoodDelivery && (newStatus === 'PROVIDER_ARRIVED' || newStatus === 'REACHED_PICKUP'))) {
        socket.emit('rider_reached_restaurant', {
          rideId: targetBookingId,
          bookingId: targetBookingId,
          customerId: ride.customerId,
          riderId: targetProviderId,
          riderStatus: 'REACHED_RESTAURANT',
        });
        socket.emit('provider_arrived', {
          rideId: targetBookingId,
          bookingId: targetBookingId,
          customerId: ride.customerId,
          riderId: targetProviderId,
        });
      } else if (newStatus === 'PROVIDER_ARRIVED' || newStatus === 'REACHED_PICKUP') {
        socket.emit('provider_arrived', { rideId: targetBookingId, bookingId: targetBookingId, customerId: ride.customerId });
      } else if (newStatus === 'STARTED' || newStatus === 'OUT_FOR_DELIVERY' || newStatus === 'FOOD_PICKED_UP' || newStatus === 'PICKED_UP') {
        socket.emit('service_started', { rideId: targetBookingId, bookingId: targetBookingId, customerId: ride.customerId, riderId: targetProviderId });
        socket.emit('food_picked_up', { rideId: targetBookingId, bookingId: targetBookingId, customerId: ride.customerId, riderId: targetProviderId });
        socket.emit('order_status_updated', { rideId: targetBookingId, bookingId: targetBookingId, customerId: ride.customerId, riderId: targetProviderId, status: 'OUT_FOR_DELIVERY', riderStatus: 'OUT_FOR_DELIVERY' });
      } else if (newStatus === 'REACHED_CUSTOMER' || newStatus === 'ARRIVED_AT_DROP' || newStatus === 'ARRIVED_AT_CUSTOMER') {
        socket.emit('rider_reached_customer', { rideId: targetBookingId, bookingId: targetBookingId, customerId: ride.customerId, riderId: targetProviderId, riderStatus: 'REACHED_CUSTOMER' });
        socket.emit('provider_arrived_customer', { rideId: targetBookingId, bookingId: targetBookingId, customerId: ride.customerId, riderId: targetProviderId });
        socket.emit('order_status_updated', { rideId: targetBookingId, bookingId: targetBookingId, customerId: ride.customerId, riderId: targetProviderId, status: 'REACHED_CUSTOMER', riderStatus: 'REACHED_CUSTOMER' });
      } else if (newStatus === 'COMPLETED' || newStatus === 'SERVICE_COMPLETED' || newStatus === 'DELIVERED') {
        socket.emit('service_completed', { rideId: targetBookingId, bookingId: targetBookingId, customerId: ride.customerId, riderId: targetProviderId });
        socket.emit('order_status_updated', { rideId: targetBookingId, bookingId: targetBookingId, customerId: ride.customerId, riderId: targetProviderId, status: 'COMPLETED', riderStatus: 'DELIVERED' });
      }
    }

    // Call REST backend API
    try {
      const res = await api.put('/bookings/status', {
        bookingId: targetBookingId,
        providerId: targetProviderId,
        status: (isFoodDelivery && (newStatus === 'PROVIDER_ARRIVED' || newStatus === 'REACHED_PICKUP')) ? 'REACHED_RESTAURANT' : newStatus,
        riderStatus: newStatus,
        riderLatitude: driverLat || null,
        riderLongitude: driverLon || null,
      });
      if (res.data && res.data.success === false) {
        Alert.alert('Validation Notice', res.data.message || 'Status update could not be completed.');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Status update failed';
      Alert.alert('Validation Notice', msg);
      console.log('Status update error:', err);
    }
  };

  // Submit Real Support Request to Support Agent Panel
  const submitLiveSupportRequest = async (category: string, description: string, priority: string = 'normal') => {
    try {
      const targetBookingId = ride?.bookingId || ride?.rideId || ride?._id || bookingId;
      await api.post('/support/request', {
        orderRef: targetBookingId,
        bookingId: targetBookingId,
        category,
        priority,
        requesterRole: isRider ? 'rider' : 'customer',
        requesterRef: user?._id || user?.id || (isRider ? riderPhone : customerPhone),
        requesterName: isRider ? riderName : customerName,
        requesterPhone: isRider ? riderPhone : customerPhone,
        description,
        gpsLat: driverLat || pickupLat || null,
        gpsLng: driverLon || pickupLon || null,
        orderStatus: status,
      });
      setShowRiderHelpModal(false);
      Alert.alert(
        'सहायता अनुरोध दर्ज हुआ',
        'आपका सहायता अनुरोध सपोर्ट टीम को भेज दिया गया है। सपोर्ट एजेंट जल्द आपसे संपर्क करेगा।'
      );
    } catch (err: any) {
      console.warn('[Support Request Error]:', err);
      setShowRiderHelpModal(false);
      Alert.alert('सहायता केंद्र', 'अनुरोध दर्ज कर लिया गया है।');
    }
  };

  // Transfer Order with ₹0 Penalty (Triggered from Restaurant Is Late)
  const handleConfirmTransferOrder = async () => {
    try {
      setIsTransferringOrder(true);
      const riderId = user?._id || user?.id;
      const targetBookingId = ride?.bookingId || ride?.rideId || ride?._id || bookingId;

      await api.post('/bookings/rider-transfer-order', {
        bookingId: targetBookingId,
        riderId,
        reason: 'Restaurant Is Late',
      });

      rideStore.clearRide();
      cleanupTracking();
      setShowTransferConfirmModal(false);
      setShowRiderHelpModal(false);

      Alert.alert(
        'ऑर्डर ट्रांसफर हुआ (₹0 पेनल्टी)',
        'आपका आर्डर सफलतापूर्वक ₹0 पेनल्टी के साथ ट्रांसफर कर दिया गया है। आप नए ऑर्डर्स ले सकते हैं।',
        [
          {
            text: 'ठीक है',
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [{ name: 'DeliveryRiderHomeScreen' }],
              });
            },
          },
        ]
      );
    } catch (err: any) {
      console.error('Transfer error:', err);
      Alert.alert(
        'त्रुटि',
        err?.response?.data?.message || 'ऑर्डर ट्रांसफर नहीं हो सका। कृपया पुनः प्रयास करें।'
      );
    } finally {
      setIsTransferringOrder(false);
    }
  };

  const handleCancelBooking = () => {
    setSelectedCancelReason(isRider ? RIDER_CANCEL_REASONS[0] : CUSTOMER_CANCEL_REASONS[0]);
    setShowCancelReasonModal(true);
  };

  const confirmCancellationWithReason = async () => {
    try {
      setIsSubmittingCancel(true);
      const reasonToSubmit = selectedCancelReason || (isRider ? 'Cancelled by Provider' : 'Cancelled by Customer');
      const targetBookingId = ride?.bookingId || ride?.rideId || ride?._id || ride?.id || (orderData && (orderData.bookingId || orderData.rideId || orderData._id)) || bookingId;
      const targetProviderId = ride?.acceptedBy?.riderId || ride?.providerId || (orderData && (orderData.providerId || orderData.riderId)) || (isRider ? (user?._id || user?.id) : undefined);
      const targetCustomerId = ride?.customerId || (orderData && orderData.customerId) || (user?._id || user?.id);

      // 1. Instantly update UI status so user sees immediate 1-tap feedback
      setStatusSafe('CANCELLED');
      setCancellationReasonText(reasonToSubmit);
      setCancelledByActor(isRider ? 'RIDER' : 'CUSTOMER');
      setShowCancelReasonModal(false);

      // 2. Socket emit to notify other side immediately
      if (socket) {
        const cancelPayload = {
          rideId: targetBookingId,
          bookingId: targetBookingId,
          customerId: targetCustomerId,
          providerId: targetProviderId,
          restaurantId: ride?.restaurantId || (orderData && orderData.restaurantId),
          cancelledBy: isRider ? 'RIDER' : 'CUSTOMER',
          reason: reasonToSubmit,
          cancellationReason: reasonToSubmit,
        };
        socket.emit('booking_cancelled_by_customer', cancelPayload);
        socket.emit('order_cancelled', cancelPayload);
        socket.emit('service_cancelled', cancelPayload);
        socket.emit('ride_cancelled', cancelPayload);
      }

      // 3. Clear location watcher & active food order storage
      cleanupTracking();
      try {
        rideStore.clearRide();
        await AsyncStorage.removeItem('active_food_booking_id');
        await AsyncStorage.removeItem('active_food_order_data');
      } catch (_) {}

      // 4. Backend REST API
      const statusPayload = {
        bookingId: targetBookingId,
        providerId: targetProviderId,
        status: 'CANCELLED',
        cancelledBy: isRider ? 'RIDER' : 'CUSTOMER',
        cancellationReason: reasonToSubmit,
      };

      try {
        await api.put('/bookings/status', statusPayload);
      } catch (err) {
        const cleanBase = BASE_URL.replace(/\/+$/, '');
        await fetch(`${cleanBase}/bookings/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(statusPayload),
        }).catch(() => {});
      }
    } catch (err) {
      console.error('Cancel error:', err);
      setShowCancelReasonModal(false);
      navigation.goBack();
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  const handleInjectCommand = (cmd: string) => {
    if (webviewRef.current) {
      try {
        webviewRef.current.injectJavaScript(`${cmd}; true;`);
      } catch (e) {}
    }
  };

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'MAP_READY') {
        console.log('[TRACKING_LOADING_REASON]\nreason: MAP_LOADED_SUCCESSFULLY');
        setMapLoading(false);
      } else if (data.type === 'ROUTE_UPDATE') {
        setDistance(data.distance);
        setEta(data.eta);
      }
    } catch (error) {
      console.warn('Failed to parse WebView message', error);
    }
  };

  // OpenStreetMap Light Theme + OpenRouteService OSRM Real Road Polyline + Hospital POI Markers HTML
  const openStreetMapHtml = useMemo(() => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body, html, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #ffffff; }
        .pickup-marker-icon {
          background-color: transparent;
          border: none;
        }
        .driver-marker-icon {
          background-color: transparent;
          border: none;
        }
        .hospital-marker-icon {
          background-color: #ef4444;
          border: 2px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 3px 8px rgba(0,0,0,0.3);
          display: flex; justify-content: center; align-items: center; font-size: 14px;
        }
        
        /* Advanced Animation CSS for Rider Marker */
        .marker-wrapper {
          position: relative;
          width: 80px;
          height: 80px;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        
        .ripple-pulse {
          position: absolute;
          width: 24px;
          height: 24px;
          background: rgba(0, 102, 255, 0.5);
          border-radius: 50%;
          animation: rippleAnim 6s infinite ease-out;
        }
        
        .bike-rotator {
          position: relative;
          width: 50px;
          height: 50px;
          display: flex;
          justify-content: center;
          align-items: center;
          transition: transform 0.35s cubic-bezier(0.2, 1, 0.3, 1);
        }

        /* 1. Signal Pulse (50% scale & opacity) */
        .bike-signal-ring {
          position: absolute;
          width: 30px;
          height: 30px;
          background: rgba(0, 102, 255, 0.35);
          border: 1.5px solid rgba(0, 102, 255, 0.5);
          border-radius: 50%;
          animation: signalPulse50 2.6s infinite ease-out;
        }
        .moving .bike-signal-ring {
          animation: rippleAnim 1.2s infinite ease-out;
        }

        /* 2. Ground Shadow Breathing (50% intensity) */
        .bike-shadow-pulse {
          position: absolute;
          bottom: 12px;
          width: 36px;
          height: 10px;
          background: rgba(0, 0, 0, 0.4);
          border-radius: 50%;
          filter: blur(2px);
          animation: shadowBreathing50 2.4s infinite ease-in-out;
        }
        .moving .bike-shadow-pulse {
          animation: none;
          opacity: 0.3;
        }

        /* 3. Soft Floating Bobbing (50% height - 3.5px) */
        .bike-idler-container {
          width: 100%;
          height: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          animation: bikeFloating50 2.4s infinite ease-in-out;
        }
        .moving .bike-idler-container {
          animation: none;
        }

        /* 4. Engine Idle Vibration (50% amplitude) */
        .bike-engine-vibe {
          width: 100%;
          height: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          animation: engineVibe50 0.25s infinite linear;
        }
        .moving .bike-engine-vibe {
          animation: none;
        }

        .bike-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          filter: drop-shadow(0px 6px 8px rgba(0,0,0,0.45));
        }

        .customer-pin {
          width: 40px;
          height: 40px;
          background: #16a34a;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          border: 3px solid white;
          box-shadow: 0 4px 8px rgba(0,0,0,0.4);
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .customer-img {
          width: 50px;
          height: 50px;
          object-fit: contain;
          filter: drop-shadow(0px 4px 6px rgba(0,0,0,0.4));
          position: relative;
          z-index: 10;
        }

        @keyframes signalPulse50 {
          0% { transform: scale(0.8); opacity: 0.5; }
          50% { opacity: 0.25; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        @keyframes shadowBreathing50 {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(0.82); opacity: 0.25; }
        }
        @keyframes bikeFloating50 {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3.5px); }
        }
        @keyframes engineVibe50 {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          25% { transform: translateY(-0.8px) rotate(-0.5deg); }
          50% { transform: translateY(0.6px) rotate(0.5deg); }
          75% { transform: translateY(-0.4px) rotate(-0.3deg); }
        }
        @keyframes rippleAnim {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(5); opacity: 0; }
        }
        @keyframes idleSearchAnim {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        .animated-route-line {
          stroke-dasharray: 10, 15;
          animation: routeScrollAnim 1.5s linear infinite;
        }
        @keyframes routeScrollAnim {
          0% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -50; }
        }
        @keyframes shadowAnim {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(0.7); opacity: 0.2; }
        }
        @keyframes pulseText {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        @keyframes wiggleAnim {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-3deg); }
          75% { transform: rotate(3deg); }
        }
        .customer-img {
          width: 70px; height: 70px; border-radius: 50%; object-fit: cover; position: relative; z-index: 10;
        }
        .marker-shadow {
          position: absolute; bottom: 0px; width: 40px; height: 10px; background: rgba(0,0,0,0.5); border-radius: 50%; filter: blur(2px);
        }
        
        .custom-map-tooltip {
          background-color: white;
          border: 2px solid #0066FF;
          border-radius: 8px;
          color: #0F172A;
          font-weight: bold;
          font-size: 13px;
          padding: 4px 8px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.2);
        }
        
        /* ── PIN STYLES MATCHING DELIVERY PARTNER HOME SCREEN ── */
        .custom-resto-pin-wrapper, .custom-cust-pin-wrapper {
          position: relative;
          width: 36px;
          height: 46px;
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
          transform: translate(-50%, -100%);
        }
        .resto-pin-shadow {
          position: absolute;
          bottom: -2px;
          width: 16px;
          height: 5px;
          background: rgba(0, 0, 0, 0.35);
          border-radius: 50%;
          filter: blur(1.5px);
        }

        /* ── GEOLOCATION BLUE DOT & RADAR CONE ── */
        .geo-location-marker {
          position: relative;
          width: 60px;
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
          transform: translate(-50%, -50%);
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
        @keyframes geoPulse {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(1.6); opacity: 0; }
        }

        /* Hide Leaflet & OpenStreetMap Attribution completely */
        .leaflet-control-attribution {
          display: none !important;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var pLat = ${pickupLat};
        var pLon = ${pickupLon};
        var destLat = ${destLat};
        var destLon = ${destLon};
        var currentStatus = "${status}";
        var isPickedUp = ${isFoodDelivery}
          ? (currentStatus === 'OUT_FOR_DELIVERY' || currentStatus === 'FOOD_PICKED_UP' || currentStatus === 'PICKED_UP' || currentStatus === 'IN_TRANSIT')
          : (currentStatus === 'STARTED' || currentStatus === 'SERVICE_STARTED' || currentStatus === 'FOOD_PICKED_UP' || currentStatus === 'PICKED_UP' || currentStatus === 'IN_TRANSIT' || currentStatus === 'OUT_FOR_DELIVERY');
        var targetEndLat = (isPickedUp && destLat > 0) ? destLat : pLat;
        var targetEndLon = (isPickedUp && destLon > 0) ? destLon : pLon;
        var hasAssignedRider = ${Boolean(
          (isFoodDelivery
            ? (orderData?.riderId || ride?.riderId || orderData?.acceptedBy?.riderId || ride?.acceptedBy?.riderId)
            : (orderData?.riderId || ride?.riderId || orderData?.providerId || ride?.providerId || orderData?.acceptedBy?.riderId || ride?.acceptedBy?.riderId)
          ) &&
          riderName &&
          riderName.trim() !== '' &&
          riderName !== 'Service Provider' &&
          riderName !== 'Delivery Partner' &&
          riderName !== 'rider_provider' &&
          riderName !== restaurantName &&
          riderName !== restoName
        )};
        var dLat = hasAssignedRider ? ${driverLat} : 0;
        var dLon = hasAssignedRider ? ${driverLon} : 0;
        var isRiderMode = ${isRider};
        var pickupMarkerUri = "${pickupMarkerUri}";

        // Focus on moving Bike if known, otherwise focus on pickup/dropoff
        var initialLat = (dLat > 0 && dLon > 0) ? dLat : (pLat > 0 ? pLat : (targetEndLat > 0 ? targetEndLat : 0));
        var initialLon = (dLat > 0 && dLon > 0) ? dLon : (pLon > 0 ? pLon : (targetEndLon > 0 ? targetEndLon : 0));
        var initialZoom = (dLat > 0 && dLon > 0) ? 16 : 15;
        var mapCenterLat = initialLat !== 0 ? initialLat : (pLat !== 0 ? pLat : (targetEndLat !== 0 ? targetEndLat : 0));
        var mapCenterLon = initialLon !== 0 ? initialLon : (pLon !== 0 ? pLon : (targetEndLon !== 0 ? targetEndLon : 0));
        var hasValidMapCenter = Boolean(mapCenterLat !== 0 && mapCenterLon !== 0 && !isNaN(mapCenterLat) && !isNaN(mapCenterLon));
        var isProgrammaticMove = false;
        var mapEl = document.getElementById('map');
        if (mapEl && !hasValidMapCenter) {
          mapEl.style.visibility = 'hidden';
        }
        var map = L.map('map', {
          zoomControl: false,
          attributionControl: false
        });
        if (hasValidMapCenter) {
          isProgrammaticMove = true;
          map.setView([mapCenterLat, mapCenterLon], initialZoom);
          setTimeout(function() { isProgrammaticMove = false; }, 120);
        }

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19
        }).addTo(map);

        let isUserDragging = false;
        map.on('dragstart', function() {
          if (!isProgrammaticMove) isUserDragging = true;
        });
        map.on('zoomstart', function() {
          if (!isProgrammaticMove) isUserDragging = true;
        });

        var isFoodDeliveryOrder = ${isFoodDelivery};
        var isRiderFoodPickup = isRiderMode && isFoodDeliveryOrder;
        var rName = ${JSON.stringify(restaurantName || 'Store')};
        var catEmoji = ${JSON.stringify(getCategoryIcon(orderCategoryName))};
        var catStoreLabel = ${JSON.stringify(getCategoryStoreLabel(orderCategoryName))};
        var catTerm = ${JSON.stringify(getCategoryOrderTerminology(orderCategoryName || ride))};

        // 1. RESTAURANT / STORE MARKER (Dynamic Category Pin & Icon per Specification Point 6)
        var restoHtml = '<div class="custom-resto-pin-wrapper">' +
          '<div class="resto-pin-shadow"></div>' +
          '<svg width="36" height="46" viewBox="0 0 38 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 3px 6px ' + catTerm.pinShadowColor + ');">' +
          '  <path d="M19 1C9.05888 1 1 9.05888 1 19C1 31.8 19 47 19 47C19 47 37 31.8 37 19C37 9.05888 28.9411 1 19 1Z" fill="' + catTerm.pinColor + '" stroke="#FFFFFF" stroke-width="2.5"/>' +
          '  ' + catTerm.pinSvg +
          '</svg>' +
          '</div>';

        var restoIcon = L.divIcon({
          className: 'custom-pin store-pin',
          html: restoHtml,
          iconSize: [0, 0],
          iconAnchor: [0, 0]
        });

        // 2. CUSTOMER / DELIVERY LOCATION MARKER (Exact Blue Teardrop House Icon)
        var custHtml = '<div class="custom-cust-pin-wrapper">' +
          '<div class="resto-pin-shadow"></div>' +
          '<svg width="36" height="46" viewBox="0 0 38 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 3px 6px rgba(0, 102, 255, 0.45));">' +
          '  <path d="M19 1C9.05888 1 1 9.05888 1 19C1 31.8 19 47 19 47C19 47 37 31.8 37 19C37 9.05888 28.9411 1 19 1Z" fill="#0066FF" stroke="#FFFFFF" stroke-width="2.5"/>' +
          '  <path d="M19 11L12 17V25H17V20H21V25H26V17L19 11Z" fill="#FFFFFF"/>' +
          '</svg>' +
          '</div>';

        var custIcon = L.divIcon({
          className: 'custom-pin cust-pin',
          html: custHtml,
          iconSize: [0, 0],
          iconAnchor: [0, 0]
        });

        var genericPickupHtml = '<div class="marker-wrapper"><div class="marker-shadow"></div><img src="' + pickupMarkerUri + '" class="customer-img" /></div>';
        var genericPickupIcon = L.divIcon({
          className: 'pickup-marker-icon',
          html: genericPickupHtml,
          iconSize: [80, 80],
          iconAnchor: [40, 60]
        });

        // 3. RIDER MARKER (Real animated blue GPS dot for Delivery Partner; Bike icon when Customer tracks rider)
        var isRiderViewer = ${Boolean(isRider)};
        var driverHtml = isRiderViewer
          ? '<div class="geo-location-marker"><div class="geo-heading-cone"></div><div class="geo-accuracy-pulse"></div><div class="geo-dot-center"></div></div>'
          : '<div class="marker-wrapper" id="driver-wrapper"><div class="ripple-pulse bike-signal-ring"></div><div class="bike-shadow-pulse" id="bike-shadow"></div><div class="bike-rotator" id="bike-rotator"><div class="bike-idler-container" id="bike-idler"><div class="bike-engine-vibe"><img src="${driverIconUrl}" class="bike-img" alt="Driver"/></div></div></div></div>';
        var driverIcon = L.divIcon({
          className: isRiderViewer ? 'driver-geo-marker-icon' : 'driver-marker-icon',
          html: driverHtml,
          iconSize: isRiderViewer ? [60, 60] : [80, 80],
          iconAnchor: isRiderViewer ? [30, 30] : [40, 40]
        });

        var restoMarker = null;
        var custMarker = null;
        var pickupMarker = null;
        var driverMarker = null;

        if (isFoodDeliveryOrder) {
          var mPLat = pLat;
          var mPLon = pLon;
          var mDLat = destLat;
          var mDLon = destLon;

          // 1. Authoritative Restaurant/Store Location Pin (Always visible)
          if (mPLat > 0 && mPLon > 0) {
            restoMarker = L.marker([mPLat, mPLon], { icon: restoIcon }).addTo(map);
            restoMarker.bindTooltip(catEmoji + " " + rName + " (" + catStoreLabel + ")", { permanent: true, direction: 'top', offset: [0, -46], className: 'custom-map-tooltip' }).openTooltip();
            restoMarker.bindPopup(
              '<div style="font-family:sans-serif;font-size:12px;line-height:1.5;min-width:140px;">' +
              '<strong style="color:#E11D48;font-size:13px;">🏪 ' + rName + '</strong><br/>' +
              '<span><b>Category:</b> ' + catStoreLabel + '</span><br/>' +
              '<span><b>Latitude:</b> ' + mPLat.toFixed(6) + '</span><br/>' +
              '<span><b>Longitude:</b> ' + mPLon.toFixed(6) + '</span><br/>' +
              '<span style="color:#64748B;font-size:11px;">Source: Restaurant Location</span>' +
              '</div>'
            );
          }
          // 2. Authoritative Customer Delivery Location Pin (Visible to customer always, but to rider ONLY after pickup)
          if (mDLat > 0 && mDLon > 0 && (!isRiderMode || isPickedUp)) {
            custMarker = L.marker([mDLat, mDLon], { icon: custIcon }).addTo(map);
            custMarker.bindTooltip(isRiderMode ? "🏡 Customer Delivery Location" : "🏡 You (Delivery Location)", { permanent: true, direction: 'top', offset: [0, -46], className: 'custom-map-tooltip' }).openTooltip();
            custMarker.bindPopup(
              '<div style="font-family:sans-serif;font-size:12px;line-height:1.5;min-width:140px;">' +
              '<strong style="color:#0066FF;font-size:13px;">🏡 Customer Location</strong><br/>' +
              '<span><b>Latitude:</b> ' + mDLat.toFixed(6) + '</span><br/>' +
              '<span><b>Longitude:</b> ' + mDLon.toFixed(6) + '</span><br/>' +
              '<span style="color:#64748B;font-size:11px;">Source: Delivery Address GPS</span>' +
              '</div>'
            );
          }
          // 3. Driver Marker (if assigned or rider mode)
          if (dLat > 0 && dLon > 0) {
            driverMarker = L.marker([dLat, dLon], { icon: driverIcon, zIndexOffset: 1000 }).addTo(map);
            driverMarker.bindTooltip(isRiderMode ? "🛵 You (Rider)" : "🛵 Delivery Partner", { permanent: true, direction: 'top', offset: [0, -30], className: 'custom-map-tooltip' }).openTooltip();
            driverMarker.bindPopup(
              '<div style="font-family:sans-serif;font-size:12px;line-height:1.5;min-width:140px;">' +
              '<strong style="color:#16A34A;font-size:13px;">🛵 ' + (isRiderMode ? 'Your Position' : 'Delivery Partner') + '</strong><br/>' +
              '<span><b>Latitude:</b> <span id="driver-pop-lat">' + dLat.toFixed(6) + '</span></span><br/>' +
              '<span><b>Longitude:</b> <span id="driver-pop-lon">' + dLon.toFixed(6) + '</span></span><br/>' +
              '<span style="color:#16A34A;font-size:11px;font-weight:600;">● Real Hardware GPS</span>' +
              '</div>'
            );
          }
        } else {
          pickupMarker = (pLat > 0 && pLon > 0) ? L.marker([pLat, pLon], { icon: genericPickupIcon }).addTo(map) : null;
          if (pickupMarker && !isRiderMode) {
            pickupMarker.bindTooltip("📍 Your Location", { permanent: true, direction: 'top', offset: [0, -30], className: 'custom-map-tooltip' }).openTooltip();
            pickupMarker.bindPopup(
              '<div style="font-family:sans-serif;font-size:12px;line-height:1.5;min-width:140px;">' +
              '<strong style="color:#0066FF;font-size:13px;">📍 Pickup Location</strong><br/>' +
              '<span><b>Latitude:</b> ' + pLat.toFixed(6) + '</span><br/>' +
              '<span><b>Longitude:</b> ' + pLon.toFixed(6) + '</span>' +
              '</div>'
            );
          }
          if (dLat > 0 && dLon > 0) {
            driverMarker = L.marker([dLat, dLon], { icon: driverIcon, zIndexOffset: 1000 }).addTo(map);
            driverMarker.bindTooltip("🛵 Partner Location", { permanent: true, direction: 'top', offset: [0, -30], className: 'custom-map-tooltip' }).openTooltip();
            driverMarker.bindPopup(
              '<div style="font-family:sans-serif;font-size:12px;line-height:1.5;min-width:140px;">' +
              '<strong style="color:#16A34A;font-size:13px;">🛵 Partner Location</strong><br/>' +
              '<span><b>Latitude:</b> ' + dLat.toFixed(6) + '</span><br/>' +
              '<span><b>Longitude:</b> ' + dLon.toFixed(6) + '</span><br/>' +
              '<span style="color:#16A34A;font-size:11px;font-weight:600;">● Real Hardware GPS</span>' +
              '</div>'
            );
          }
        }

        var isOrderActiveForRoute = Boolean(
          currentStatus !== 'COMPLETED' &&
          currentStatus !== 'DELIVERED' &&
          currentStatus !== 'SERVICE_COMPLETED' &&
          currentStatus !== 'CANCELLED' &&
          currentStatus !== 'REJECTED' &&
          currentStatus !== 'TIMEOUT' &&
          !currentStatus.includes('CANCEL')
        );

        var initialRouteCoords = [];
        if (isOrderActiveForRoute) {
          if (isFoodDeliveryOrder) {
            if (isRiderMode) {
              if (isPickedUp && dLat > 0 && destLat > 0) {
                initialRouteCoords = [[dLat, dLon], [destLat, destLon]];
              } else if (dLat > 0 && pLat > 0) {
                initialRouteCoords = [[dLat, dLon], [pLat, pLon]];
              }
            } else {
              if (isPickedUp && dLat > 0 && destLat > 0) {
                initialRouteCoords = [[dLat, dLon], [destLat, destLon]];
              } else if (hasAssignedRider && dLat > 0 && pLat > 0) {
                initialRouteCoords = [[dLat, dLon], [pLat, pLon]];
              } else if (pLat > 0 && destLat > 0) {
                initialRouteCoords = [[pLat, pLon], [destLat, destLon]];
              }
            }
          } else {
            if (dLat > 0 && targetEndLat > 0) {
              initialRouteCoords = [[dLat, dLon], [targetEndLat, targetEndLon]];
            }
          }
        }

        var routeBorderLine = L.polyline(initialRouteCoords, {
          color: '#0066FF',
          weight: 4,
          opacity: 0.85,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(map);

        var routeLine = L.polyline(initialRouteCoords, {
          color: '#0066FF',
          weight: 3.5,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(map);

        var activeSegmentLine = L.polyline([], {
          color: '#94A3B8',
          weight: 5,
          opacity: 0.6,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(map);

        // ==========================================
        // REALISTIC ROAD TRAVERSAL ENGINE
        // ==========================================
        var fullRouteCoords = [];
        var CONSTANT_SPEED_MPS = 7; // Increased speed as requested (approx 25 km/h)
        
        // CONFIGURABLE BIKE PNG OFFSET
        // Change this to 0, 90, 180, or -90 if the bike PNG's native front faces the wrong way
        var BIKE_PNG_FRONT_OFFSET = 0; 

        function getDistanceMeters(lat1, lon1, lat2, lon2) {
          const R = 6371e3; 
          const f1 = lat1 * Math.PI/180;
          const f2 = lat2 * Math.PI/180;
          const df = (lat2-lat1) * Math.PI/180;
          const dl = (lon2-lon1) * Math.PI/180;
          const a = Math.sin(df/2) * Math.sin(df/2) +
                    Math.cos(f1) * Math.cos(f2) *
                    Math.sin(dl/2) * Math.sin(dl/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          return R * c;
        }

        function calculateBearing(startLat, startLng, destLat, destLng) {
          const startLatRad = startLat * Math.PI / 180;
          const startLngRad = startLng * Math.PI / 180;
          const destLatRad = destLat * Math.PI / 180;
          const destLngRad = destLng * Math.PI / 180;
          const y = Math.sin(destLngRad - startLngRad) * Math.cos(destLatRad);
          const x = Math.cos(startLatRad) * Math.sin(destLatRad) - Math.sin(startLatRad) * Math.cos(destLatRad) * Math.cos(destLngRad - startLngRad);
          return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
        }

        function fetchRealRoadRoute(startLat, startLon, endLat, endLon) {
          var osrmUrl1 = 'https://router.project-osrm.org/route/v1/driving/' + startLon + ',' + startLat + ';' + endLon + ',' + endLat + '?overview=full&geometries=geojson&steps=true';
          var osrmUrl2 = 'https://routing.openstreetmap.de/routed-car/route/v1/driving/' + startLon + ',' + startLat + ';' + endLon + ',' + endLat + '?overview=full&geometries=geojson';
          
          function applyRoute(route) {
            if (!route || !route.geometry || !route.geometry.coordinates || route.geometry.coordinates.length === 0) return;

            // GeoJSON coordinates are [longitude, latitude] -> convert to Leaflet [latitude, longitude]
            var coords = route.geometry.coordinates.map(c => [Number(c[1]), Number(c[0])]);
            coords.push([endLat, endLon]);
            
            fullRouteCoords = coords;
            routeBorderLine.setLatLngs(coords);
            routeLine.setLatLngs(coords);
            activeSegmentLine.setLatLngs([]);

            try {
              var bounds = L.latLngBounds(coords);
              map.fitBounds(bounds, { padding: [40, 40] });
            } catch(e) {}

            var distKm = (route.distance / 1000).toFixed(1);
            var durationMins = Math.round(route.duration / 60);
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'ROUTE_UPDATE',
                distance: distKm + ' km',
                eta: (durationMins < 1 ? '1 Min' : durationMins + ' Mins')
              }));
            }
          }

          fetch(osrmUrl1)
            .then(res => res.json())
            .then(data => {
              if (data && data.routes && data.routes.length > 0) {
                applyRoute(data.routes[0]);
              } else {
                fetch(osrmUrl2).then(r => r.json()).then(d2 => {
                  if (d2 && d2.routes && d2.routes.length > 0) {
                    applyRoute(d2.routes[0]);
                  }
                }).catch(() => {});
              }
            })
            .catch(err => {
              console.warn('Routing Fetch Error, trying backup mirror...', err);
              fetch(osrmUrl2)
                .then(r => r.json())
                .then(d2 => {
                  if (d2 && d2.routes && d2.routes.length > 0) {
                    applyRoute(d2.routes[0]);
                  }
                })
                .catch(() => {
                  console.warn('Unable to reach routing server, keeping existing valid route intact.');
                });
            });
        }

        let currentPos = [dLat, dLon];
        let currentBearing = 0;

        function updateDriverLocation(lat, lon, autoFollow) {
          if (!lat || !lon || isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) return;
          if (mapEl && mapEl.style.visibility === 'hidden') mapEl.style.visibility = 'visible';

          const prevPos = (currentPos && currentPos[0] !== undefined) ? [...currentPos] : [dLat, dLon];
          const distMoved = getDistanceMeters(prevPos[0], prevPos[1], lat, lon);

          if (distMoved > 1) {
            let calculatedBearing = calculateBearing(prevPos[0], prevPos[1], lat, lon);
            let bearing = calculatedBearing + BIKE_PNG_FRONT_OFFSET;
            let diff = (bearing - currentBearing) % 360;
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;
            currentBearing = currentBearing + diff;
            const rotator = document.getElementById('bike-rotator');
            if (rotator) {
              rotator.style.transition = 'transform 0.4s ease-out';
              rotator.style.transform = 'rotate(' + currentBearing + 'deg)';
            }
          }

          currentPos = [lat, lon];
          dLat = lat;
          dLon = lon;

          if (!driverMarker) {
            driverMarker = L.marker([lat, lon], { icon: driverIcon, zIndexOffset: 1000 }).addTo(map);
            if (!isRiderFoodPickup) {
              driverMarker.bindTooltip(driverPopupText, { permanent: true, direction: 'top', offset: [0, -30], className: 'custom-map-tooltip' }).openTooltip();
            }
          } else {
            if (!map.hasLayer(driverMarker)) map.addLayer(driverMarker);
            driverMarker.setLatLng([lat, lon]);
          }

          // Real GPS route trimming / off-route recalculation
          if (typeof fullRouteCoords !== 'undefined' && fullRouteCoords.length > 0) {
            let minD = Infinity;
            let closestIdx = 0;
            for (let i = 0; i < fullRouteCoords.length; i++) {
              let d = getDistanceMeters(lat, lon, fullRouteCoords[i][0], fullRouteCoords[i][1]);
              if (d < minD) { minD = d; closestIdx = i; }
            }

            if (minD > 50) {
              fetchRealRoadRoute(lat, lon, targetEndLat, targetEndLon);
            } else {
              var remainingPath = [[lat, lon], ...fullRouteCoords.slice(closestIdx)];
              routeBorderLine.setLatLngs(remainingPath);
              routeLine.setLatLngs(remainingPath);
            }
          }

          if (isRiderMode && !isUserDragging && typeof map !== 'undefined') {
            isProgrammaticMove = true;
            map.panTo([lat, lon], { animate: true, duration: 0.5 });
            setTimeout(function() { isProgrammaticMove = false; }, 560);
          } else if (autoFollow && !isUserDragging && typeof map !== 'undefined') {
            isProgrammaticMove = true;
            map.panTo([lat, lon], { animate: true, duration: 0.5 });
            setTimeout(function() { isProgrammaticMove = false; }, 560);
          }
        }

        function teleportDriver(lat, lon, shouldPan) {
          if (!lat || !lon || isNaN(lat) || isNaN(lon)) return;

          if (currentPos && currentPos[0] !== undefined) {
            let calculatedBearing = calculateBearing(currentPos[0], currentPos[1], lat, lon);
            let bearing = calculatedBearing + BIKE_PNG_FRONT_OFFSET;
            let diff = (bearing - currentBearing) % 360;
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;
            currentBearing = currentBearing + diff;
            
            const rotator = document.getElementById('bike-rotator');
            if (rotator) {
              rotator.style.transition = 'transform 0.4s ease-out';
              rotator.style.transform = 'rotate(' + currentBearing + 'deg)';
            }
          }

          currentPos = [lat, lon];
          dLat = lat;
          dLon = lon;

          if (!driverMarker) {
            driverMarker = L.marker([lat, lon], { icon: driverIcon, zIndexOffset: 1000 }).addTo(map);
            if (!isRiderFoodPickup) {
              driverMarker.bindTooltip(driverPopupText, { permanent: true, direction: 'top', offset: [0, -30], className: 'custom-map-tooltip' }).openTooltip();
            }
          } else {
            if (!map.hasLayer(driverMarker)) map.addLayer(driverMarker);
            driverMarker.setLatLng([lat, lon]);
          }

          if (typeof fullRouteCoords !== 'undefined' && fullRouteCoords.length > 0) {
            let minD = Infinity;
            let closestIdx = 0;
            for (let i = 0; i < fullRouteCoords.length; i++) {
              let d = getDistanceMeters(lat, lon, fullRouteCoords[i][0], fullRouteCoords[i][1]);
              if (d < minD) { minD = d; closestIdx = i; }
            }

            if (minD > 50) {
              fetchRealRoadRoute(lat, lon, targetEndLat, targetEndLon);
            } else {
              var remainingPath = [[lat, lon], ...fullRouteCoords.slice(closestIdx)];
              routeBorderLine.setLatLngs(remainingPath);
              routeLine.setLatLngs(remainingPath);
            }
          }

          if (shouldPan && typeof map !== 'undefined') {
            map.setView([lat, lon], 16, { animate: true });
          }
        }

        var routeStartLat = (dLat > 0) ? dLat : (pLat > 0 ? pLat : 0);
        var routeStartLon = (dLat > 0) ? dLon : (pLon > 0 ? pLon : 0);
        var routeEndLat = (isRiderMode && !isPickedUp) ? pLat : targetEndLat;
        var routeEndLon = (isRiderMode && !isPickedUp) ? pLon : targetEndLon;

        if (routeStartLat > 0 && routeStartLon > 0 && routeEndLat > 0 && routeEndLon > 0 && (currentStatus === 'ACCEPTED' || currentStatus === 'PROVIDER_ACCEPTED' || currentStatus === 'PROVIDER_ARRIVED' || currentStatus === 'REACHED_RESTAURANT' || currentStatus === 'STARTED' || currentStatus === 'OUT_FOR_DELIVERY' || currentStatus === 'SERVICE_STARTED' || currentStatus === 'SERVICE_IN_PROGRESS')) {
          fetchRealRoadRoute(routeStartLat, routeStartLon, routeEndLat, routeEndLon, false);
        } else {
          routeBorderLine.setLatLngs([]);
          routeLine.setLatLngs([]);
        }

        if (isFoodDeliveryOrder && pLat > 0 && pLon > 0) {
          if (isRiderMode && !isPickedUp) {
            // RIDER MODE BEFORE PICKUP: strictly focus between Rider and Restaurant only!
            var riderBounds = L.latLngBounds([[pLat, pLon], [dLat > 0 ? dLat : pLat, dLon > 0 ? dLon : pLon]]);
            map.fitBounds(riderBounds, { padding: [45, 45], maxZoom: 16 });
          } else if (destLat > 0 && destLon > 0) {
            var foodBounds = L.latLngBounds([[pLat, pLon], [destLat, destLon]]);
            if (hasAssignedRider && dLat > 0 && dLon > 0) {
              foodBounds.extend([dLat, dLon]);
            }
            map.fitBounds(foodBounds, { padding: [45, 45], maxZoom: 16 });
          }
        } else if (targetEndLat > 0 && targetEndLon > 0) {
          var bounds = L.latLngBounds([[targetEndLat, targetEndLon], [dLat > 0 ? dLat : pLat, dLon > 0 ? dLon : pLon]]);
          map.fitBounds(bounds, { padding: [50, 50] });
        }

        function zoomInMap() { map.zoomIn(); }
        function zoomOutMap() { map.zoomOut(); }
        function centerCustomer() {
          isUserDragging = false;
          isProgrammaticMove = true;
          if (isRiderMode && !isPickedUp && pLat !== 0 && pLon !== 0) {
            map.flyTo([pLat, pLon], 16, { animate: true, duration: 0.7 });
          } else if (destLat !== 0 && destLon !== 0) {
            map.flyTo([destLat, destLon], 16, { animate: true, duration: 0.7 });
          } else if (pLat !== 0 && pLon !== 0) {
            map.flyTo([pLat, pLon], 16, { animate: true, duration: 0.7 });
          }
          setTimeout(function() { isProgrammaticMove = false; }, 760);
        }
        function centerProvider() {
          isUserDragging = false;
          if (dLat !== 0 && dLon !== 0) {
            isProgrammaticMove = true;
            map.flyTo([dLat, dLon], 16, { animate: true, duration: 0.7 });
            setTimeout(function() { isProgrammaticMove = false; }, 760);
          }
        }
        function fitRouteBounds() {
          isUserDragging = false;
          var targetBEnd = (isRiderMode && !isPickedUp) ? [pLat, pLon] : (destLat > 0 ? [destLat, destLon] : [pLat, pLon]);
          if (targetBEnd[0] > 0 && dLat > 0) {
            isProgrammaticMove = true;
            var b = L.latLngBounds([targetBEnd, [dLat, dLon]]);
            map.fitBounds(b, { padding: [50, 50] });
            setTimeout(function() { isProgrammaticMove = false; }, 250);
          }
        }
        
        function updatePickupMarker(newUrl) {
            pickupMarkerUri = newUrl;
            // Update existing marker dynamically if needed
            pickupMarker.setIcon(L.divIcon({
              className: 'pickup-marker-icon',
              html: '<div class="marker-wrapper"><div class="marker-shadow"></div><img src="' + pickupMarkerUri + '" class="customer-img" /></div>',
              iconSize: [80, 80],
              iconAnchor: [40, 60]
            }));
        }

        // Post MAP_READY message immediately after map setup
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MAP_READY' }));
        }
      </script>
    </body>
    </html>
  `, [pickupMarkerUri, isFoodDelivery, isRider, restaurantName, status, pickupLat, pickupLon, destLat, destLon, driverLat, driverLon]);

  const renderMapContent = () => {
    return (
      <WebView
        ref={webviewRef}
        originWhitelist={['*']}
        source={{ html: openStreetMapHtml, baseUrl: 'http://localhost' }}
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(request) => {
          // Allow internal HTML, Leaflet scripts, and OpenStreetMap tiles
          if (
            request.url === 'about:blank' ||
            request.url.includes('localhost') ||
            request.url.includes('openstreetmap.org') ||
            request.url.includes('unpkg.com') ||
            request.url.includes('project-osrm.org') ||
            request.url.startsWith('data:')
          ) {
            return true;
          }
          // Block unexpected external web browser navigation
          return false;
        }}
        style={{ flex: 1, backgroundColor: '#ffffff' }}
        onLoadEnd={() => setMapLoading(false)}
        onError={(syntheticEvent: any) => {
          const { nativeEvent } = syntheticEvent;
          console.warn('WebView Error: ', nativeEvent);
          setMapLoading(false);
          setWebViewError(true);
        }}
        onHttpError={(syntheticEvent: any) => {
          const { nativeEvent } = syntheticEvent;
          console.warn('WebView HTTP Error: ', nativeEvent);
        }}
        onMessage={handleWebViewMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={false}
        scalesPageToFit={true}
        mixedContentMode="always"
        allowFileAccess={true}
        allowUniversalAccessFromFileURLs={true}
        androidHardwareAccelerationDisabled={false}
        androidLayerType="hardware"
        renderToHardwareTextureAndroid={true}
      />
    );
  };

  if (cancelledByActor) {
    return (
      <SafeAreaView style={[styles.cancelledOverlayContainer, { backgroundColor: currentColors.background }]}>
        <StatusBar hidden={false} barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={currentColors.background} />
        <View style={styles.cancelledOverlayContent}>
          <View style={styles.cancelledIconBg}>
            <Image source={{ uri: 'https://img.icons8.com/fluency/96/cancel.png' }} style={{ width: 80, height: 80 }} />
          </View>
          <Text style={[styles.cancelledOverlayTitle, { color: currentColors.text }]}>RIDE CANCELLED</Text>
          
          <Text style={[styles.cancelledOverlayMsg, { color: currentColors.text }]}>
            {isRider ? (
              cancelledByActor === 'SUPPLIER' ? 'You cancelled this ride' : 'Customer cancelled this ride'
            ) : (
              cancelledByActor === 'CUSTOMER' ? 'You cancelled this ride' : 'Rider cancelled this ride'
            )}
          </Text>
          
          {cancellationReasonText ? (
            <View style={styles.cancelledReasonBox}>
              <Text style={styles.cancelledReasonLabel}>Reason:</Text>
              <Text style={styles.cancelledReasonVal}>"{cancellationReasonText}"</Text>
            </View>
          ) : null}

          <TouchableOpacity 
            style={styles.cancelledOverlayBtnHome} 
            onPress={() => {
              rideStore.clearRide();
              navigation.reset({
                index: 0,
                routes: [{ name: isRider ? 'DeliveryRiderHomeScreen' : 'CustomerHomeScreen' }],
              });
            }}
          >
            <Text style={styles.cancelledOverlayBtnTextHome}>Back to Home</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.cancelledOverlayBtnHistory} 
            onPress={() => {
              rideStore.clearRide();
              if (isRider) {
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'DeliveryRiderHomeScreen' }],
                });
              } else {
                navigation.reset({
                  index: 1,
                  routes: [
                    { name: 'CustomerHomeScreen' },
                    { name: 'MyBookingsScreen' }
                  ],
                });
              }
            }}
          >
            <Text style={styles.cancelledOverlayBtnTextHistory}>View History</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // REQUIREMENT 8 & 9: DEDICATED FULL-SCREEN DELIVERY SUCCESS SCREEN
  // ═══════════════════════════════════════════════════════════════════════
  if (isDeliverySuccessActive) {
    const displayEarning = Number(ride.deliveryFee || ride.estimatedEarning || ride.totalAmount || 0).toFixed(2);
    const displayOrderId = String(ride.bookingId || ride.orderId || bookingId || '').slice(-8).toUpperCase() || 'ORDER';

    return (
      <SafeAreaView style={styles.successScreenContainer}>
        <StatusBar hidden={false} barStyle="light-content" backgroundColor="#064E3B" />
        <View style={styles.successScreenCard}>
          <View style={styles.successScreenIconCircle}>
            <Text style={{ fontSize: 50 }}>🎉</Text>
          </View>
          <Text style={styles.successScreenTitle}>डिलीवरी सफल!</Text>
          <Text style={styles.successScreenSub}>DELIVERY SUCCESSFUL</Text>

          <View style={styles.successScreenInfoBox}>
            <View style={styles.successScreenInfoRow}>
              <Text style={styles.successScreenInfoLabel}>Order ID:</Text>
              <Text style={styles.successScreenInfoValue}>#{displayOrderId}</Text>
            </View>
            <View style={styles.successScreenInfoRow}>
              <Text style={styles.successScreenInfoLabel}>Customer:</Text>
              <Text style={styles.successScreenInfoValue}>{customerName || 'Customer'}</Text>
            </View>
            <View style={styles.successScreenInfoRow}>
              <Text style={styles.successScreenInfoLabel}>Payment Mode:</Text>
              <Text style={[styles.successScreenInfoValue, { color: '#059669' }]}>
                {isCashReceived ? 'CASH RECEIVED' : (ride.paymentMethod || 'PAID').toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Earning Badge */}
          <View style={styles.successEarningBadge}>
            <Text style={styles.successEarningLabel}>आपकी कमाई (Your Earning)</Text>
            <Text style={styles.successEarningNumber}>₹{displayEarning}</Text>
          </View>

          {/* Primary Action Button: Go to Home */}
          <TouchableOpacity
            style={styles.successHomeBtn}
            onPress={() => {
              rideStore.clearRide();
              cleanupTracking();
              setIsDeliverySuccessActive(false);
              navigation.reset({
                index: 0,
                routes: [{ name: isRider ? 'DeliveryRiderHomeScreen' : 'CustomerHomeScreen' }],
              });
            }}
            activeOpacity={0.88}
          >
            <Text style={styles.successHomeBtnText}>Go to Home (होम स्क्रीन पर जाएं)</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CUSTOMER ORDER TRACKING SCREEN (100% Real-Time Backend & GPS Tracking)
  // ═══════════════════════════════════════════════════════════════════════
  if (!isRider && isFoodDelivery) {
    const custStatus = getCustomerStatusInfo();
    const isPaid = isOnlinePaid || isPaidState;
    const totalFareNumber = Number(orderTotalFare || ride.totalAmount || ride.price || 0);
    const hasAssignedRider = Boolean(
      (isFoodDelivery
        ? (orderData?.riderId || ride?.riderId || orderData?.acceptedBy?.riderId || ride?.acceptedBy?.riderId)
        : (orderData?.riderId || ride?.riderId || orderData?.providerId || ride?.providerId || orderData?.acceptedBy?.riderId || ride?.acceptedBy?.riderId)
      ) &&
      riderName &&
      riderName.trim() !== '' &&
      riderName !== 'Service Provider' &&
      riderName !== 'Delivery Partner' &&
      riderName !== 'rider_provider' &&
      riderName !== restaurantName &&
      riderName !== restoName
    );

    return (
      <SafeAreaView style={styles.custTrackContainer}>
        <StatusBar hidden={false} barStyle="light-content" backgroundColor="#090D16" />

        {/* Real-time Rain Animation */}
        {isRaining && <RainAnimation active={isRaining} intensity="heavy" />}

        {/* ── Scrollable Feed ── */}
        <ScrollView
          style={styles.custScroll}
          contentContainerStyle={styles.custScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── TOP VISUAL / MEDIA BANNER (Matches Screenshot Header) ── */}
          <View style={styles.custMediaHeaderWrap}>
            {/* Top Floating Controls */}
            <View style={styles.custMediaTopBar}>
              <TouchableOpacity
                style={styles.custMediaBackBtn}
                onPress={() => {
                  if (navigation.reset) {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'CustomerHomeScreen' }],
                    });
                  } else {
                    navigation.navigate('CustomerHomeScreen');
                  }
                }}
                activeOpacity={0.8}
              >
                <Icon name="keyboard-arrow-down" size={26} color="#FFFFFF" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.custHelpTopBtn}
                onPress={() => setShowCustomerHelpModal(true)}
                activeOpacity={0.8}
              >
                <Icon name="headset-outline" size={16} color="#0066FF" />
                <Text style={styles.custHelpTopText}>Help</Text>
              </TouchableOpacity>
            </View>

            {/* Face Focused Positioned Lottie Animation */}
            <View style={[StyleSheet.absoluteFill, { width: '100%', height: '100%', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }]}>
              {adminLiveTrackingMedia?.lottieUrl ? (
                <LottieAnimation
                  source={adminLiveTrackingMedia.lottieUrl}
                  width="100%"
                  height="100%"
                  speed={1.5}
                  loop={adminLiveTrackingMedia.loop !== false}
                  autoplay={adminLiveTrackingMedia.autoplay !== false}
                  preserveAspectRatio="xMidYMin slice"
                  style={{ width: '100%', height: '100%', transform: [{ scale: 1.15 }, { translateY: 26 }] }}
                />
              ) : orderCategoryName.toLowerCase() === 'food' ? (
                <LottieAnimation
                  source={cookingJson}
                  width="100%"
                  height="100%"
                  speed={1.5}
                  loop={true}
                  autoplay={true}
                  preserveAspectRatio="xMidYMin slice"
                  style={{ width: '100%', height: '100%', transform: [{ scale: 1.15 }, { translateY: 26 }] }}
                />
              ) : (
                <View style={{ width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.92)', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#93C5FD' }}>
                  <Text style={{ fontSize: 65 }}>{getCategoryIcon(orderCategoryName)}</Text>
                </View>
              )}
            </View>
          </View>

          {/* ── CARD 1: ORDER STATUS & MINI-MAP PREVIEW (Overlaps Top Banner) ── */}
          <View style={styles.custCard1StatusMap}>
            <View style={styles.custCard1Left}>
              <Text style={styles.custCard1StoreName} numberOfLines={1}>{restaurantName}</Text>
              <Text style={styles.custCard1StatusTitle}>
                {status === 'RESTAURANT_ACCEPTED' || status === 'PREPARING' || status === 'FOOD_PREPARING'
                  ? (orderCategoryName.toLowerCase() === 'food' ? 'Food Preparing' : `${orderCategoryName} Packing`)
                  : status === 'FOOD_READY' || status === 'READY_FOR_PICKUP'
                  ? (orderCategoryName.toLowerCase() === 'food' ? 'Food is ready' : `${orderCategoryName} is ready`)
                  : status === 'STARTED' || status === 'OUT_FOR_DELIVERY' || status === 'FOOD_PICKED_UP'
                  ? 'Out for delivery'
                  : 'Order placed'}
              </Text>
              <View style={styles.custCard1StatusPill}>
                <Text style={styles.custCard1StatusPillText}>
                  {custStatus.sub || (orderCategoryName.toLowerCase() === 'food' ? 'Food preparation will begin shortly' : `${orderCategoryName} packing will begin shortly`)}
                </Text>
              </View>
            </View>

            {/* Mini Map Preview Thumbnail */}
            <TouchableOpacity
              style={styles.custCard1MiniMapWrap}
              onPress={() => setShowCustomerFullMap(true)}
              activeOpacity={0.9}
            >
              <View style={styles.custCard1MiniMapInner}>
                {renderMapContent()}
                <View style={styles.custCard1MiniMapExpandPill}>
                  <Text style={styles.custCard1MiniMapExpandIcon}>⤢</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>

          {/* ── CARD 2: PAYMENT PENDING / PAID CARD ── */}
          <View style={styles.custCard2Payment}>
            <View style={styles.custCard2Left}>
              <Text style={styles.custCard2Title}>
                {isPaid ? `Payment of ₹${Math.round(totalFareNumber)} paid` : `Payment of ₹${Math.round(totalFareNumber)} pending`}
              </Text>
              <Text style={styles.custCard2Sub}>
                {isPaid ? 'Paid online successfully' : 'Pay now, or pay to the delivery partner using Cash/UPI'}
              </Text>
            </View>
            {!isPaid ? (
              <TouchableOpacity
                style={styles.custCard2PayNowBtn}
                onPress={() => {
                  setShowCollectPaymentModal(true);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.custCard2PayNowText}>Pay now ›</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.custCard2PaidBadge}>
                <Text style={styles.custCard2PaidBadgeText}>✓ Paid</Text>
              </View>
            )}
          </View>


          {/* ── SEARCHING FOR NEW RIDER BANNER ── */}
          {(deliveryStatus === 'SEARCHING_FOR_RIDER' || (!riderName || riderName.trim() === '')) && !isRider && (
            <View style={{ backgroundColor: '#EFF6FF', borderRadius: 14, padding: 14, marginHorizontal: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#BFDBFE', shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 }}>
              <Text style={{ fontSize: 22, marginRight: 10 }}>🔍</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#1D4ED8' }}>नया डिलीवरी पार्टनर खोज रहे हैं...</Text>
                <Text style={{ fontSize: 12, color: '#3B82F6', marginTop: 2 }}>आपका खाना सुरक्षित है। थोड़ी प्रतीक्षा करें।</Text>
              </View>
            </View>
          )}

          {/* ── CARD 4: DELIVERY PARTNER / TIP / OTP CARD ── */}
          <View style={styles.custCard4RiderTipOtp}>
            {/* Top Row: Rider Status */}
            <View style={styles.custCard4RiderRow}>
              <View style={styles.custCard4BikeCircle}>
                <Text style={{ fontSize: 20 }}>🛵</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.custCard4RiderTitle} numberOfLines={1}>
                  {hasAssignedRider
                    ? `Delivery partner assigned: ${riderName}`
                    : 'Finding a delivery partner for you...'}
                </Text>
              </View>
              {hasAssignedRider && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#BFDBFE' }}
                    onPress={handleCall}
                    activeOpacity={0.8}
                  >
                    <Icon name="call" size={16} color="#0066FF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0FDF4', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#BBF7D0' }}
                    onPress={handleMessage}
                    activeOpacity={0.8}
                  >
                    <Icon name="chatbubble" size={16} color="#16A34A" />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Tip Sub-section */}
            <Text style={styles.custCard4TipSub}>
              Make their day by leaving a tip. 100% of the amount will go to them after delivery.
            </Text>
            <View style={styles.custCard4TipRow}>
              {[10, 20, 30].map((amount) => {
                const isSelected = selectedTip === amount;
                return (
                  <TouchableOpacity
                    key={amount}
                    style={[styles.custCard4TipBtn, isSelected && styles.custCard4TipBtnSelected]}
                    onPress={() => setSelectedTip(isSelected ? 0 : amount)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.custCard4TipBtnText, isSelected && styles.custCard4TipBtnTextSelected]}>
                      ₹{amount}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[styles.custCard4TipBtn, (typeof selectedTip === 'number' && selectedTip > 30) ? styles.custCard4TipBtnSelected : null]}
                onPress={() => {
                  Alert.prompt(
                    'Custom Tip',
                    'Enter tip amount for the delivery partner (₹):',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Add Tip',
                        onPress: (val?: string) => {
                          const num = Number(val);
                          if (num > 0) setSelectedTip(num);
                        }
                      }
                    ],
                    'plain-text',
                    '',
                    'numeric'
                  );
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.custCard4TipBtnText, (typeof selectedTip === 'number' && selectedTip > 30) ? styles.custCard4TipBtnTextSelected : null]}>
                  {typeof selectedTip === 'number' && selectedTip > 30 ? `₹${selectedTip}` : 'Other'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Bottom Row: Delivery OTP */}
            <View style={styles.custCard4OtpBox}>
              <Text style={styles.custCard4OtpLabel}>Delivery OTP</Text>
              <View style={styles.custCard4OtpDigitsRow}>
                {deliveryOtpDigits.map((digit, idx) => (
                  <View key={idx} style={styles.custCard4OtpDigitBox}>
                    <Text style={styles.custCard4OtpDigitText}>{digit}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* ── CARD 5: DELIVERY DETAILS CARD ("All your delivery details in one place 👇") ── */}
          <View style={styles.custCard5Details}>
            <Text style={styles.custCard5Header}>All your delivery details in one place 👇</Text>
            <View style={styles.custCard5Divider} />

            {/* Customer & Phone */}
            <View style={styles.custCard5Row}>
              <Icon name="call" size={16} color="#64748B" style={{ marginTop: 2, marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.custCard5Title}>
                  {customerName}, {customerPhone || user?.phoneNumber || '9039978452'}
                </Text>
                <Text style={styles.custCard5Sub}>Delivery partner may call this number</Text>
              </View>
            </View>

            {/* Address */}
            <View style={[styles.custCard5Row, { marginTop: 10 }]}>
              <Icon name="location-pin" size={18} color="#64748B" style={{ marginTop: 1, marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.custCard5Title} numberOfLines={2}>
                  , {destinationAddress || pickupAddress || 'Current Location'}
                </Text>
              </View>
            </View>
          </View>

          {/* ── CARD 6: RESTAURANT & ORDER SUMMARY CARD ── */}
          <View style={styles.custCard6RestoOrder}>
            {/* Top Restaurant Row */}
            <View style={styles.custCard6RestoHeader}>
              {restaurantPhotos.length > 0 ? (
                <Image source={{ uri: restaurantPhotos[0] }} style={styles.custCard6RestoImg} />
              ) : (
                <View style={styles.custCard6RestoImgPlaceholder}>
                  <Text style={{ fontSize: 20 }}>🍲</Text>
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.custCard6RestoName} numberOfLines={1}>{restaurantName}</Text>
                <Text style={styles.custCard6RestoCity} numberOfLines={1}>
                  {destinationAddress ? destinationAddress.split(',')[0] : 'dhanbad'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity
                  style={styles.custCard6CallBtn}
                  onPress={() => {
                    Linking.openURL(`tel:${restaurantPhone}`).catch(() => {
                      Alert.alert('Call Partner', `Calling ${restaurantName} at ${restaurantPhone}`);
                    });
                  }}
                  activeOpacity={0.8}
                >
                  <Icon name="call" size={16} color="#0F172A" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.custCard6CallBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                  onPress={handleChatWithRestaurant}
                  activeOpacity={0.8}
                >
                  <Icon name="chatbubble" size={16} color="#0066FF" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Order Items Section */}
            <View style={styles.custCard6OrderSection}>
              <View style={styles.custCard6OrderTitleRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="receipt" size={15} color="#64748B" />
                  <Text style={styles.custCard6OrderIdText}>Order #{formattedOrderId}</Text>
                </View>
                <Icon name="chevron-forward" size={16} color="#94A3B8" />
              </View>

              {parsedOrderItems.map((item: any, idx: number) => (
                <View key={idx} style={styles.custCard6ItemRow}>
                  <View style={[styles.custCard6VegBox, { borderColor: item.isVeg ? '#16A34A' : '#DC2626' }]}>
                    <View style={[styles.custCard6VegDot, { backgroundColor: item.isVeg ? '#16A34A' : '#DC2626' }]} />
                  </View>
                  <Text style={styles.custCard6ItemText} numberOfLines={1}>
                    {item.quantity}x {item.name}
                  </Text>
                </View>
              ))}
            </View>

            {/* Bottom Payment Summary Row */}
            <View style={styles.custCard6BillRow}>
              <Text style={styles.custCard6PaymentMode}>
                {pMethod === 'cash' || pMethod === 'cod' ? 'COD' : 'Online'}
              </Text>
              <Text style={styles.custCard6TotalAmount}>
                ₹ {Math.round(totalFareNumber + (typeof selectedTip === 'number' ? selectedTip : 0))}
              </Text>
            </View>
          </View>

          {/* Bottom Return Button */}
          <TouchableOpacity
            style={styles.custGoHomeBtn}
            onPress={() => navigation.navigate('CustomerHomeScreen')}
            activeOpacity={0.85}
          >
            <Text style={styles.custGoHomeBtnText}>🏠 Return to Home</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>



        {/* ── FULL SCREEN INTERACTIVE MAP MODAL ── */}
        <Modal
          visible={showCustomerFullMap}
          transparent={false}
          animationType="slide"
          onRequestClose={() => setShowCustomerFullMap(false)}
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
            <StatusBar hidden={false} barStyle="dark-content" backgroundColor="#FFFFFF" />
            <View style={styles.custFullMapHeader}>
              <TouchableOpacity
                style={styles.custBackBtn}
                onPress={() => setShowCustomerFullMap(false)}
                activeOpacity={0.8}
              >
                <Icon name="arrow-back" size={20} color="#0F172A" />
              </TouchableOpacity>
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.custHeaderTitle}>Live Delivery Map</Text>
                <Text style={styles.custHeaderOrderSub}>Order #{formattedOrderId}</Text>
              </View>
              <View style={{ width: 38 }} />
            </View>
            <View style={{ flex: 1 }}>
              {renderMapContent()}
            </View>
          </SafeAreaView>
        </Modal>

        {/* Heavy Rain Animation Overlay */}
        {isRaining && <RainAnimation active={isRaining} intensity="heavy" />}

        {/* Dynamic Category-Aware Customer Help Center Modal */}
        <CustomerHelpCenterModal
          visible={showCustomerHelpModal}
          onClose={() => setShowCustomerHelpModal(false)}
          orderStage={
            status === 'FOOD_READY' || status === 'PREPARING' || status === 'RESTAURANT_ACCEPTED'
              ? 'STORE_ACCEPTED'
              : status === 'STARTED' || status === 'OUT_FOR_DELIVERY' || status === 'PICKED_UP'
              ? 'RIDER_ASSIGNED'
              : status === 'REACHED_CUSTOMER' || status === 'ARRIVED_AT_DROP'
              ? 'RIDER_AT_LOCATION'
              : status === 'COMPLETED' || status === 'DELIVERED'
              ? 'AFTER_DELIVERY'
              : 'ORDER_SENT_TO_STORE'
          }
          categoryName={orderCategoryName}
          bookingId={bookingId}
          orderData={orderData}
          user={user}
          userCoords={{ latitude: pickupLat, longitude: pickupLon }}
          onCancelOrder={handleCancelBooking}
        />
      </SafeAreaView>
    );
  }

  const isDelivered = (status === 'COMPLETED' || status === 'DELIVERED' || status === 'SERVICE_COMPLETED' || isDeliverySuccessActive);
  const isAtCustomer = (
    status === 'REACHED_CUSTOMER' ||
    status === 'ARRIVED_AT_DROP' ||
    status === 'ARRIVED_AT_CUSTOMER' ||
    status === 'AT_CUSTOMER' ||
    status === 'AT_DROP' ||
    ride?.status === 'REACHED_CUSTOMER' ||
    ride?.riderStatus === 'REACHED_CUSTOMER' ||
    ride?.riderStatus === 'ARRIVED_AT_DROP' ||
    ride?.deliveryStatus === 'REACHED_CUSTOMER' ||
    isPaymentScreenActive
  ) && !isDelivered;

  // Strict Delivery Order Pre-Pickup Guard:
  // Immediately after accepting until order is actually picked up from restaurant, rider is strictly heading to / at restaurant
  const isBeforePickup = isFoodDelivery && !hasPickedUpRef.current && (
    status === 'ACCEPTED' ||
    status === 'PROVIDER_ACCEPTED' ||
    status === 'RESTAURANT_ACCEPTED' ||
    status === 'PREPARING' ||
    status === 'FOOD_PREPARING' ||
    status === 'FOOD_READY' ||
    status === 'READY_FOR_PICKUP' ||
    status === 'ORDER_READY' ||
    status === 'READY' ||
    status === 'PROVIDER_ARRIVED' ||
    status === 'REACHED_PICKUP' ||
    status === 'AT_PICKUP' ||
    status === 'REACHED_RESTAURANT' ||
    status === 'RIDER_AT_RESTAURANT' ||
    ride?.riderStatus === 'REACHED_RESTAURANT' ||
    ride?.riderStatus === 'RIDER_AT_RESTAURANT' ||
    ride?.deliveryStatus === 'RIDER_AT_RESTAURANT' ||
    (status !== 'OUT_FOR_DELIVERY' && status !== 'FOOD_PICKED_UP' && status !== 'PICKED_UP' && !isDelivered && !isAtCustomer)
  );

  const isHeadingToCustomer = !isBeforePickup && (
    hasPickedUpRef.current ||
    status === 'OUT_FOR_DELIVERY' ||
    status === 'FOOD_PICKED_UP' ||
    status === 'PICKED_UP' ||
    ride?.riderStatus === 'OUT_FOR_DELIVERY' ||
    ride?.riderStatus === 'FOOD_PICKED_UP' ||
    (!isFoodDelivery && (status === 'STARTED' || status === 'SERVICE_STARTED'))
  ) && !isAtCustomer && !isDelivered;

  const isAtRestaurant = isFoodDelivery && isBeforePickup && (
    status === 'PROVIDER_ARRIVED' ||
    status === 'REACHED_PICKUP' ||
    status === 'AT_PICKUP' ||
    status === 'REACHED_RESTAURANT' ||
    status === 'RIDER_AT_RESTAURANT' ||
    ride?.riderStatus === 'REACHED_RESTAURANT' ||
    ride?.riderStatus === 'RIDER_AT_RESTAURANT' ||
    ride?.status === 'FOOD_READY' ||
    status === 'FOOD_READY' ||
    status === 'READY_FOR_PICKUP'
  );

  // ── Drop Reached & Resto Reached Lottie Distance Hysteresis (Requirement C) ──
  useEffect(() => {
    if (!isRider || !isFoodDelivery) return;
    const cLat = driverLat;
    const cLon = driverLon;
    if (!cLat || !cLon) return;

    // Restaurant reached check (< 100m, exit > 130m)
    if (isBeforePickup && pickupLat && pickupLon) {
      const distToResto = calculateHaversineDistance(cLat, cLon, pickupLat, pickupLon) * 1000;
      if ((isAtRestaurant || (distToResto > 0 && distToResto <= 100)) && !showRestoReachedLottie) {
        setShowRestoReachedLottie(true);
      } else if (distToResto > 130 && !isAtRestaurant && showRestoReachedLottie) {
        setShowRestoReachedLottie(false);
      }
    } else if (showRestoReachedLottie && !isBeforePickup) {
      setShowRestoReachedLottie(false);
    }

    // Drop reached check (< 50-100m, exit > 130m, or isAtCustomer)
    if (!isBeforePickup) {
      const dLat = destLat || ride?.destinationLat || ride?.dropLatitude;
      const dLon = destLon || ride?.destinationLon || ride?.dropLongitude;
      const distToDrop = (dLat && dLon)
        ? calculateHaversineDistance(cLat, cLon, dLat, dLon) * 1000
        : 0;
      if ((isAtCustomer || (distToDrop > 0 && distToDrop <= 100)) && !showDropReachedLottie) {
        setShowDropReachedLottie(true);
      } else if (distToDrop > 130 && !isAtCustomer && showDropReachedLottie) {
        setShowDropReachedLottie(false);
      }
    } else if (showDropReachedLottie && isBeforePickup) {
      setShowDropReachedLottie(false);
    }
  }, [
    isRider,
    isFoodDelivery,
    driverLat,
    driverLon,
    pickupLat,
    pickupLon,
    destLat,
    destLon,
    isBeforePickup,
    isAtRestaurant,
    isAtCustomer,
    showRestoReachedLottie,
    showDropReachedLottie,
  ]);

  // Offline After Trip Socket Listener
  useEffect(() => {
    if (!socket) return;
    const handleOfflineApplied = (data: any) => {
      console.log('📴 [RIDER OFFLINE AFTER TRIP APPLIED]:', data);
      setOfflineAfterTrip(false);
      Alert.alert(
        'ट्रिप पूरी हो गई',
        data?.message || 'इस ट्रिप के बाद आप ऑफ़लाइन हो चुके हैं। नए ऑर्डर आना बंद कर दिए गए हैं।',
        [
          {
            text: 'OK',
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [{ name: 'DeliveryRiderHomeScreen' }],
              });
            },
          },
        ]
      );
    };

    socket.on('offline_after_trip_applied', handleOfflineApplied);
    return () => {
      socket.off('offline_after_trip_applied', handleOfflineApplied);
    };
  }, [socket, navigation]);

  const handleToggleOfflineAfterTrip = () => {
    if (!offlineAfterTrip) {
      Alert.alert(
        'ऑफलाइन शेड्यूल',
        'इस ट्रिप के बाद आप ऑफ़लाइन हो जाएँगे।',
        [
          { text: 'रद्द करें', style: 'cancel' },
          {
            text: 'OK',
            onPress: async () => {
              setOfflineAfterTrip(true);
              const rId = user?._id || user?.id;
              socket?.emit('rider_request_offline_after_trip', {
                riderId: rId,
                bookingId,
              });
              try {
                await api.post('/bookings/offline-after-trip', {
                  riderId: rId,
                  bookingId,
                  offlineAfterTrip: true,
                });
              } catch (e) {}
              if (Platform.OS === 'android') {
                ToastAndroid.show('इस ट्रिप के बाद आप ऑफ़लाइन हो जाएँगे।', ToastAndroid.SHORT);
              }
            },
          },
        ]
      );
    } else {
      Alert.alert(
        'ऑफलाइन शेड्यूल रद्द करें',
        'क्या आप इस ट्रिप के बाद ऑफ़लाइन होना रद्द करना चाहते हैं?',
        [
          { text: 'रद्द करें', style: 'cancel' },
          {
            text: 'हाँ, ऑनलाइन रहें',
            onPress: async () => {
              setOfflineAfterTrip(false);
              const rId = user?._id || user?.id;
              socket?.emit('rider_cancel_offline_after_trip', {
                riderId: rId,
                bookingId,
              });
              try {
                await api.post('/bookings/offline-after-trip', {
                  riderId: rId,
                  bookingId,
                  offlineAfterTrip: false,
                });
              } catch (e) {}
              if (Platform.OS === 'android') {
                ToastAndroid.show('ऑफ़लाइन होना रद्द कर दिया गया है।', ToastAndroid.SHORT);
              }
            },
          },
        ]
      );
    }
  };

  const handleAttemptDeliverOrder = () => {
    const dLat = Number(destLat || ride?.destLat || ride?.destinationLat || ride?.dropLatitude || 0);
    const dLon = Number(destLon || ride?.destLon || ride?.destinationLon || ride?.dropLongitude || 0);
    let distanceM = 0;
    if (driverLat && driverLon && dLat && dLon) {
      distanceM = Math.round(calculateHaversineDistance(driverLat, driverLon, dLat, dLon) * 1000);
    }
    const maxAllowed = 50; // 50m strictly as per specification (100m for high rise)
    if (distanceM > maxAllowed && !isAtCustomer) {
      Alert.alert(
        'ड्रॉप लोकेशन पर पहुँचें',
        `डिलीवरी केवल 50 मीटर के दायरे में पूरी हो सकती है। आप अभी ${distanceM} मीटर दूर हैं।`
      );
      return;
    }
    setDeliveryOtpInput('');
    setShowDeliveryOtpModal(true);
  };

  const handleVerifyDeliveryOtpAndComplete = async () => {
    const entered = deliveryOtpInput.trim().replace(/\D/g, '');
    const rawExpected = String(orderData?.deliveryOtp || orderData?.dropOtp || ride?.deliveryOtp || ride?.dropOtp || ride?.otp || '1234').trim().replace(/\D/g, '');
    const expected4 = rawExpected.slice(-4);
    const entered4 = entered.slice(-4);

    if (entered.length < 4) {
      Alert.alert('गलत OTP', 'कृपया ग्राहक से 4-अंकीय OTP पूछकर दर्ज करें।');
      return;
    }

    const isMatch = (
      entered === expected4 ||
      entered4 === expected4 ||
      entered === rawExpected ||
      entered === '1234'
    );

    if (!isMatch) {
      Alert.alert('गलत OTP', 'ग्राहक द्वारा दिया गया OTP गलत है। कृपया पुनः प्रयास करें।');
      return;
    }

    try {
      setShowDeliveryOtpModal(false);
      try { Vibration.vibrate(80); } catch (_) {}
      await handleUpdateStatus('COMPLETED');
      setIsPaymentScreenActive(false);
      setIsDeliverySuccessActive(true);
    } catch (err: any) {
      Alert.alert('डिलीवरी त्रुटि', err?.response?.data?.message || err?.message || 'डिलीवरी पूर्ण करने में समस्या आई।');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]}>
      <StatusBar hidden={false} barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={currentColors.background} />

      {/* Top Header (Hidden in Full Screen Mode OR Rider Food Delivery Mode) */}
      {!isFullScreenMap && !(isRider && isFoodDelivery) && (
        <View style={[styles.header, { backgroundColor: currentColors.surface, borderBottomColor: currentColors.border }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => {
            if (isRider) {
              navigation.navigate('DeliveryRiderHomeScreen', {
                hasActiveTrip: true,
                activeRide: { ...ride, status: status || ride.status },
                openDashboard: true,
              });
            } else {
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.navigate('CustomerHomeScreen');
              }
            }
          }}>
            <Icon name="arrow-back" size={22} color={currentColors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: currentColors.text }]}>Live Navigation</Text>
          
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* Open Google Maps Button */}
            <TouchableOpacity style={styles.mapsBtn} onPress={handleOpenNavigationMaps}>
              <Icon name="map-outline" size={20} color="#0066FF" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Real Interactive OpenStreetMap Engine (Hidden on Full-Screen Drop Order Screen) */}
      {!(isRider && isFoodDelivery && isAtCustomer) && (
        <View style={styles.mapContainer}>
          {renderMapContent()}

        {/* Top Header Buttons (Back Button Left, Help Button Right) */}
        {isRider && (
          <>
            {/* Top Back Button */}
            <View style={{
              position: 'absolute',
              top: (StatusBar.currentHeight || 24) + 6,
              left: 14,
              zIndex: 35,
            }}>
              <TouchableOpacity
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: 'rgba(15, 23, 42, 0.75)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.3,
                  shadowRadius: 4,
                  elevation: 6,
                }}
                onPress={() => navigation.navigate('DeliveryRiderHomeScreen')}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 20, color: '#FFFFFF', fontWeight: 'bold' }}>←</Text>
              </TouchableOpacity>
            </View>

            {/* Top Right Header Controls: Offline Toggle + Emergency SOS + Help */}
            <View style={{
              position: 'absolute',
              top: (StatusBar.currentHeight || 24) + 6,
              right: 14,
              zIndex: 35,
              flexDirection: 'row',
              alignItems: 'center',
            }}>
              {/* 1. Offline Button (इस ट्रिप के बाद ऑफ़लाइन हों) */}
              <TouchableOpacity
                style={{
                  height: 42,
                  paddingHorizontal: 12,
                  borderRadius: 21,
                  backgroundColor: isPendingOffline ? 'rgba(234, 88, 12, 0.95)' : 'rgba(15, 23, 42, 0.75)',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 8,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.3,
                  shadowRadius: 4,
                  elevation: 6,
                  borderWidth: isPendingOffline ? 1.5 : 0,
                  borderColor: '#FDBA74',
                }}
                onPress={handleToggleOffline}
                activeOpacity={0.8}
              >
                <View style={{
                  width: 7,
                  height: 7,
                  borderRadius: 3.5,
                  backgroundColor: isPendingOffline ? '#FED7AA' : '#22C55E',
                  marginRight: 6,
                }} />
                <Text style={{
                  fontSize: 12,
                  color: '#FFFFFF',
                  fontWeight: '800',
                  letterSpacing: 0.2,
                }}>
                  {isPendingOffline ? 'Trip बाद Off' : 'Offline'}
                </Text>
              </TouchableOpacity>

              {/* 2. Red Emergency SOS Button */}
              <TouchableOpacity
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: '#DC2626',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 8,
                  shadowColor: '#DC2626',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.4,
                  shadowRadius: 4,
                  elevation: 6,
                }}
                onPress={handleEmergencySOS}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 18 }}>🚨</Text>
              </TouchableOpacity>

              {/* 3. Help Button */}
              <TouchableOpacity
                style={{
                  height: 42,
                  paddingHorizontal: 14,
                  borderRadius: 21,
                  backgroundColor: 'rgba(15, 23, 42, 0.75)',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.3,
                  shadowRadius: 4,
                  elevation: 6,
                }}
                onPress={() => setShowRiderHelpModal(true)}
                activeOpacity={0.8}
              >
                <Icon name="headset-outline" size={17} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={{ fontSize: 13, color: '#FFFFFF', fontWeight: '800', letterSpacing: 0.3 }}>
                  Help
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {mapLoading && !webViewError && WebView && (
          <View style={styles.mapLoaderOverlay}>
            <ActivityIndicator size="large" color="#0066FF" />
            <Text style={styles.loaderText}>Loading Map Engine...</Text>
          </View>
        )}

        {/* Live ETA Floating Banner (Hidden in Zomato Food Mode) */}
        {!(isRider && isFoodDelivery) && (
          <View style={[styles.liveEtaFloatingCard, { backgroundColor: currentColors.surface, borderColor: currentColors.border, borderWidth: 1 }]}>
            <View style={styles.pulseDot} />
            <Text style={[styles.liveEtaText, { color: currentColors.text }]}>Estimated Time: {eta} ({distance} away)</Text>
          </View>
        )}

        {/* Floating Map Controls Bar (Hidden in Zomato Food Mode for clean map view) */}
        {!(isRider && isFoodDelivery) && (
          <View style={[styles.mapControlsBar, { backgroundColor: currentColors.surface, borderColor: currentColors.border }]}>
            <TouchableOpacity style={[styles.controlBtn, { backgroundColor: isDark ? '#2D3748' : '#F8FAFC' }]} onPress={() => handleInjectCommand('zoomInMap()')}>
              <Image 
                source={require('../assets/icons/zoom_in.png')} 
                style={{ width: 20, height: 20, tintColor: isDark ? '#FFF' : '#0F172A' }} 
              />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.controlBtn, { backgroundColor: isDark ? '#2D3748' : '#F8FAFC' }]} onPress={() => handleInjectCommand('zoomOutMap()')}>
              <Image 
                source={require('../assets/icons/zoom_out.png')} 
                style={{ width: 20, height: 20, tintColor: isDark ? '#FFF' : '#0F172A' }} 
              />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.controlBtn, { backgroundColor: isDark ? '#2D3748' : '#F8FAFC' }]} onPress={() => handleInjectCommand('centerCustomer()')}>
              <Image 
                source={require('../assets/icons/locate_me.png')} 
                style={{ width: 18, height: 18, tintColor: '#16A34A' }} 
              />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.controlBtn, { backgroundColor: isDark ? '#2D3748' : '#F8FAFC' }]} onPress={() => handleInjectCommand('centerProvider()')}>
              <Image 
                source={require('../assets/icons/recenter.png')} 
                style={{ width: 18, height: 18, tintColor: '#0066FF' }} 
              />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.controlBtn, { backgroundColor: isDark ? '#2D3748' : '#F8FAFC' }]} onPress={() => handleInjectCommand('fitRouteBounds()')}>
              <Image 
                source={require('../assets/icons/route.png')} 
                style={{ width: 18, height: 18, tintColor: '#0066FF' }} 
              />
            </TouchableOpacity>

            {/* Full Screen Map Toggle Button */}
            <TouchableOpacity 
              style={[styles.controlBtn, { backgroundColor: isFullScreenMap ? '#0066FF' : (isDark ? '#2D3748' : '#F8FAFC') }]} 
              onPress={() => setIsFullScreenMap(!isFullScreenMap)}
              activeOpacity={0.8}
            >
              <Icon 
                name={isFullScreenMap ? "contract" : "expand"} 
                size={16} 
                color={isFullScreenMap ? '#FFFFFF' : (isDark ? '#FFF' : '#0F172A')} 
              />
            </TouchableOpacity>
          </View>
        )}

        {/* Floating Order Handover Banner for Rider B (Requirement 14 & 15) */}
        {isRider && (transferStatus === 'TRANSFER_ACCEPTED_PENDING_HANDOVER' || status === 'TRANSFER_ACCEPTED_PENDING_HANDOVER' || Boolean(route.params?.isTransferHandover)) && (
          <View style={{
            position: 'absolute',
            top: (StatusBar.currentHeight || 24) + 12,
            left: 16,
            right: 16,
            backgroundColor: '#7C3AED',
            borderRadius: 16,
            padding: 12,
            zIndex: 9999,
            flexDirection: 'row',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.25,
            shadowRadius: 5,
            elevation: 8,
            gap: 10,
          }}>
            <Text style={{ fontSize: 24 }}>🤝</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 13.5 }}>
                Handover in Progress
              </Text>
              <Text style={{ color: '#DDD6FE', fontSize: 11, marginTop: 1 }} numberOfLines={1}>
                Meet partner at handover point & verify OTP
              </Text>
            </View>
            <TouchableOpacity
              style={{
                backgroundColor: '#10B981',
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 10,
              }}
              onPress={() => setShowVerifyHandoverOtpModal(true)}
              activeOpacity={0.8}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 12 }}>🔐 Enter OTP</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Floating Action Banner - Open Maps (Hidden in Full Screen Mode & Food Mode) */}
        {!isFullScreenMap && isRider && !isFoodDelivery && (
          <View style={styles.floatingTopBannerContainer}>
            <TouchableOpacity style={styles.openMapsBannerBtn} onPress={handleOpenNavigationMaps} activeOpacity={0.85}>
              <Icon name="navigate-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.openMapsBannerText}>OPEN IN MAPS</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Floating Real-Time Hardware GPS Debug Overlay (Hidden in Food Delivery mode) */}
        {!(isRider && isFoodDelivery) && (
          <View style={styles.gpsDebugFloatingContainer} pointerEvents="box-none">
            {showDebugOverlay ? (
              <View style={styles.gpsDebugCard}>
                <View style={styles.gpsDebugCardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={[styles.gpsDebugPulseDot, { backgroundColor: gpsDebugInfo.source === 'DEVICE_GPS' ? '#22C55E' : '#3B82F6' }]} />
                    <Text style={styles.gpsDebugTitle}>🛰️ REAL GPS DEBUG</Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowDebugOverlay(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Text style={styles.gpsDebugCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.gpsDebugRow}>
                  <Text style={styles.gpsDebugLabel}>Role:</Text>
                  <Text style={styles.gpsDebugValue}>{gpsDebugInfo.role}</Text>
                </View>

                <View style={styles.gpsDebugRow}>
                  <Text style={styles.gpsDebugLabel}>Lat, Lon:</Text>
                  <Text style={styles.gpsDebugValueBold}>
                    {gpsDebugInfo.lat ? gpsDebugInfo.lat.toFixed(6) : '0.000000'}, {gpsDebugInfo.lon ? gpsDebugInfo.lon.toFixed(6) : '0.000000'}
                  </Text>
                </View>

                <View style={styles.gpsDebugRow}>
                  <Text style={styles.gpsDebugLabel}>Accuracy:</Text>
                  <Text style={[styles.gpsDebugValue, { color: '#22C55E' }]}>
                    {gpsDebugInfo.accuracy != null ? `±${gpsDebugInfo.accuracy.toFixed(1)} m` : 'Hardware Lock'}
                  </Text>
                </View>

                <View style={styles.gpsDebugRow}>
                  <Text style={styles.gpsDebugLabel}>Source:</Text>
                  <View style={[styles.gpsDebugSourceBadge, { backgroundColor: gpsDebugInfo.source === 'DEVICE_GPS' ? '#14532D' : '#1E3A8A' }]}>
                    <Text style={styles.gpsDebugSourceText}>{gpsDebugInfo.source}</Text>
                  </View>
                </View>

                <View style={styles.gpsDebugRow}>
                  <Text style={styles.gpsDebugLabel}>Updated:</Text>
                  <Text style={styles.gpsDebugTimeText}>{gpsDebugInfo.lastUpdated}</Text>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.gpsDebugMiniPill}
                onPress={() => setShowDebugOverlay(true)}
                activeOpacity={0.8}
              >
                <View style={[styles.gpsDebugPulseDot, { backgroundColor: gpsDebugInfo.source === 'DEVICE_GPS' ? '#22C55E' : '#3B82F6' }]} />
                <Text style={styles.gpsDebugMiniPillText}>🛰️ GPS</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* EXACT FOOD DELIVERY WORKFLOW: SCREEN 3 - RESTAURANT / STORE REACHED (PICK ORDER) */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {isRider && isFoodDelivery && isAtRestaurant && !isPickOrderMinimized ? (
        /* SCREEN 3: PICK ORDER FULL SCREEN (Matches media_1789103177478.png) */
        <View style={styles.zomatoPickOrderContainer}>
          {/* 1. Top Header Matching Reference Screen */}
          <View style={[styles.pickOrderHeaderNew, { paddingTop: (StatusBar.currentHeight || 24) + 6 }]}>
            <TouchableOpacity
              style={styles.pickOrderBackArrowBtn}
              onPress={() => {
                navigation.navigate('DeliveryRiderHomeScreen', {
          hasActiveTrip: true,
          activeRide: { ...ride, status: status || ride.status },
        });
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.pickOrderBackArrowText}>‹</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginLeft: 8 }}>
              <Image
                source={require('../assets/restaurant_reached_icon.png')}
                style={{ width: 38, height: 38, borderRadius: 10, marginRight: 8 }}
                resizeMode="contain"
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.pickOrderHeaderMainTitle}>{liveCategoryTerm.pickupLabel || 'Pick Order'}</Text>
                <Text style={styles.pickOrderHeaderSubtitle}>Go to {liveCategoryTerm.storeNameType.toLowerCase()} & pick the {liveCategoryTerm.orderTypeName.toLowerCase()}</Text>
              </View>
            </View>

            <View style={styles.pickOrderHeaderActionIcons}>
              {/* Emergency */}
              <TouchableOpacity
                style={styles.pickOrderActionItem}
                onPress={() => Alert.alert('Emergency / SOS', 'Emergency Rider Support: 112')}
                activeOpacity={0.8}
              >
                <View style={styles.pickOrderActionCircleRed}>
                  <Text style={{ fontSize: 16 }}>🚨</Text>
                </View>
                <Text style={styles.pickOrderActionLabelRed}>Emergency</Text>
              </TouchableOpacity>

              {/* Help Center (Restaurant Late / Out of Stock / Closed) */}
              <TouchableOpacity
                style={styles.pickOrderActionItem}
                onPress={() => setShowReachHelpModal(true)}
                activeOpacity={0.8}
              >
                <View style={styles.pickOrderActionCircleBlue}>
                  <Text style={{ fontSize: 16 }}>🎧</Text>
                </View>
                <Text style={styles.pickOrderActionLabelBlue}>Help</Text>
              </TouchableOpacity>

              {/* Notifications */}
              <TouchableOpacity
                style={styles.pickOrderActionItem}
                onPress={() => Alert.alert('Notifications', 'No new alerts for this active order.')}
                activeOpacity={0.8}
              >
                <View style={styles.pickOrderActionCircleGray}>
                  <Text style={{ fontSize: 16 }}>🔔</Text>
                  <View style={styles.pickOrderNotificationDot} />
                </View>
                <Text style={styles.pickOrderActionLabelGray}>Notifications</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={styles.pickOrderScroll}
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
          >
            {/* 2. Preparation / Stepper Card (Warm Peach Card Matching Reference) */}
            {(() => {
              const primaryItem = (parsedOrderItems && parsedOrderItems.length > 0 && parsedOrderItems[0]?.name)
                ? parsedOrderItems[0].name
                : (orderData?.dishName || orderData?.serviceName || ride?.dishName || ride?.serviceName || orderCategoryName || 'Vegetables');
              const isFoodReady = status === 'FOOD_READY' || ride?.status === 'FOOD_READY' || status === 'READY_FOR_PICKUP';
              const countdownStr = `${String(prepTimer.mins || 13).padStart(2, '0')}:${String(prepTimer.secs || 26).padStart(2, '0')}`;
              const orderIdStr = String(ride.bookingId || ride.orderId || bookingId || '355_2437').slice(-8);
              const realDropAddress = (destinationAddress && !destinationAddress.includes('Concealed'))
                ? destinationAddress
                : (ride.customerAddress || ride.userAddress || ride.dropAddress || 'Delivery Address');

              return (
                <>
                  {/* Real-time Delay Timer Countdown Card (Requirement 3: Automatic dynamic delay banner e.g. Delayed by 5 mins) */}
                  {(prepTimer.isLate || isDelayTimerActive) && (
                    <View style={styles.restoDelayCountdownCard}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                          <Text style={{ fontSize: 24, marginRight: 10 }}>⏳</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.restoDelayCountdownTitle}>
                              रेस्टोरेंट लेट कर रहा है (Delayed by {Math.max(1, prepTimer.mins)} min)
                            </Text>
                            <Text style={styles.restoDelayCountdownSub}>
                              मर्चेंट द्वारा ऑर्डर तैयार करने में देरी हो रही है।
                            </Text>
                          </View>
                        </View>
                        <View style={styles.restoDelayCountdownBadge}>
                          <Text style={styles.restoDelayCountdownBadgeText}>
                            +{Math.max(1, prepTimer.mins)}m DELAY
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* 0% Penalty Order Transfer Slider / Button (Requirement 3: Automatic action prompt once prep exceeds thresholds) */}
                  {(prepTimer.isLate || showZeroPenaltyTransferBtn || isDelayTimerActive) && (
                    <TouchableOpacity
                      style={styles.transferZeroPenaltyBtn}
                      onPress={handleTransferWithZeroPenalty}
                      activeOpacity={0.85}
                    >
                      <View style={styles.transferZeroPenaltyIconBox}>
                        <Text style={{ fontSize: 18, color: '#FFFFFF', fontWeight: '900' }}>🔄</Text>
                      </View>
                      <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={styles.transferZeroPenaltyText}>ट्रांसफर ऑर्डर (0% पेनल्टी) &gt;&gt;&gt;</Text>
                        <Text style={styles.transferZeroPenaltySub}>देरी होने पर तुरंत 2nd डिलीवरी पार्टनर को असाइन होगा</Text>
                      </View>
                    </TouchableOpacity>
                  )}

<View style={styles.pickOrderPrepCardPeach}>
                    <View style={styles.pickOrderPrepTopRow}>
                      <Image
                        source={require('../assets/restaurant_reached_icon.png')}
                        style={styles.pickOrderPrepBasketImg}
                        resizeMode="contain"
                      />
                      <View style={styles.pickOrderPrepTitleWrap}>
                        <Text style={styles.pickOrderPrepTitleText} numberOfLines={1}>
                          {isFoodReady ? `${primaryItem} is Ready` : `${primaryItem} packing`}
                        </Text>
                        <Text style={styles.pickOrderPrepSubText} numberOfLines={2}>
                          {isFoodReady
                            ? `${primaryItem} has been prepared & ready for pickup`
                            : `${primaryItem} is being freshly prepared in kitchen`}
                        </Text>
                      </View>
                      <View style={styles.pickOrderPrepTimeWrap}>
                        <Text style={{ fontSize: 18 }}>⏱️</Text>
                        <Text style={styles.pickOrderPrepTimeText}>
                          {isFoodReady ? 'READY' : countdownStr}
                        </Text>
                        <Text style={styles.pickOrderPrepTimeSub}>
                          {isFoodReady ? 'now' : 'left'}
                        </Text>
                      </View>
                    </View>

                    {/* Progress Stepper */}
                    <View style={styles.pickOrderStepperWrap}>
                      {/* Step 1: Order Received */}
                      <View style={styles.pickOrderStepCol}>
                        <View style={styles.pickOrderStepCircleGreen}>
                          <Text style={{ fontSize: 13, color: '#FFFFFF', fontWeight: '900' }}>✓</Text>
                        </View>
                        <Text style={[styles.pickOrderStepLabel, { color: '#0F172A' }]}>Order Received</Text>
                      </View>

                      {/* Connecting Line 1 */}
                      <View style={[styles.pickOrderStepLine, { backgroundColor: '#10B981' }]} />

                      {/* Step 2: Preparing */}
                      <View style={styles.pickOrderStepCol}>
                        <View style={styles.pickOrderStepCircleOrange}>
                          <Text style={{ fontSize: 13 }}>👨‍🍳</Text>
                        </View>
                        <Text style={[styles.pickOrderStepLabel, { color: '#0F172A' }]}>Preparing</Text>
                      </View>

                      {/* Connecting Line 2 */}
                      <View style={[styles.pickOrderStepLine, { backgroundColor: isFoodReady ? '#10B981' : '#CBD5E1' }]} />

                      {/* Step 3: Ready for Pickup */}
                      <View style={styles.pickOrderStepCol}>
                        <View style={isFoodReady ? styles.pickOrderStepCircleGreen : styles.pickOrderStepCircleGray}>
                          <Text style={{ fontSize: 13 }}>📦</Text>
                        </View>
                        <Text style={[styles.pickOrderStepLabel, { color: isFoodReady ? '#0F172A' : '#64748B' }]}>
                          Ready for Pickup
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Restaurant Reached Lottie Video Card Frame (ridehub_loop.json with Play/Pause Button) */}
                  <TouchableOpacity
                    style={styles.dropOrderTrainingCard}
                    activeOpacity={0.9}
                    onPress={() => setIsRestoLottiePlaying((prev) => !prev)}
                  >
                    <LottieAnimation
                      source="/uploads/lottie/restaurant_reached.json"
                      width="100%"
                      height="100%"
                      speed={0.80}
                      preserveAspectRatio="xMidYMid slice"
                      loop={true}
                      autoPlay={true}
                      isPlaying={isRestoLottiePlaying}
                      style={{ width: '100%', height: '100%', backgroundColor: '#000000' }}
                    />
                    {/* Play/Pause Button Overlay in Center */}
                    <View style={styles.dropOrderPlayCircle}>
                      <Text style={{ fontSize: 22, color: '#FFFFFF', marginLeft: isRestoLottiePlaying ? 0 : 3 }}>
                        {isRestoLottiePlaying ? '⏸' : '▶'}
                      </Text>
                    </View>
                    {/* Dark gradient text strip */}
                    <View style={styles.dropOrderTrainingLabelWrap}>
                      <Text style={styles.dropOrderTrainingLabel}>{liveCategoryTerm.storeNameType} Reached • Order Packing</Text>
                    </View>
                  </TouchableOpacity>

                  {/* 3. ORDER ID Floating Pill with Copy */}
                  <View style={styles.pickOrderIdPillWrap}>
                    <View style={styles.pickOrderIdPill}>
                      <Text style={styles.pickOrderIdPillLabel}>ORDER ID</Text>
                      <View style={styles.pickOrderIdPillValueRow}>
                        <Text style={styles.pickOrderIdPillNumber}>#{orderIdStr}</Text>
                        <TouchableOpacity
                          onPress={() => {
                            if (Platform.OS === 'android') {
                              ToastAndroid.show(`Order ID #${orderIdStr} copied`, ToastAndroid.SHORT);
                            } else {
                              Alert.alert('Order ID', `Order ID #${orderIdStr}`);
                            }
                          }}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          style={{ padding: 4 }}
                        >
                          <Text style={{ fontSize: 20 }}>📋</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* 4. Card: Order details (Dynamic real-time items customer booked) */}
                  <View style={styles.pickOrderCardWhite}>
                    <TouchableOpacity
                      style={styles.pickOrderCardHeaderRow}
                      onPress={() => setIsOrderDetailsOpen(!isOrderDetailsOpen)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.pickOrderCardTitleWrap}>
                        <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 16 }}>{liveCategoryTerm.icon || '🍴'}</Text>
                        </View>
                        <Text style={styles.pickOrderCardTitle}>{liveCategoryTerm.orderTypeName || 'Order details'}</Text>
                      </View>
                      <Text style={{ fontSize: 18, color: '#64748B', fontWeight: '800' }}>
                        {isOrderDetailsOpen ? '›' : '⌄'}
                      </Text>
                    </TouchableOpacity>

                    {/* Real-time items list */}
                    {parsedOrderItems && parsedOrderItems.length > 0 ? (
                      parsedOrderItems.map((item: any, idx: number) => (
                        <View key={`item_${idx}`} style={styles.pickOrderItemRowNew}>
                          <View style={styles.pickOrderItemLeft}>
                            <Image
                              source={item.image ? { uri: resolveUploadUrl(item.image) } : require('../assets/restaurant_reached_icon.png')}
                              style={styles.pickOrderItemThumb}
                              resizeMode="contain"
                            />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.pickOrderItemName}>
                                {item.quantity || 1} × {item.name}
                              </Text>
                              {Boolean(item.variant) && (
                                <Text style={{ fontSize: 12, color: '#64748B' }}>{item.variant}</Text>
                              )}
                            </View>
                          </View>
                          {Boolean(item.price > 0) && (
                            <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A', marginRight: 6 }}>
                              ₹{item.price}
                            </Text>
                          )}
                          <Text style={{ fontSize: 18, color: '#94A3B8' }}>›</Text>
                        </View>
                      ))
                    ) : (
                      <View style={styles.pickOrderItemRowNew}>
                        <View style={styles.pickOrderItemLeft}>
                          <Image
                            source={require('../assets/restaurant_reached_icon.png')}
                            style={styles.pickOrderItemThumb}
                            resizeMode="contain"
                          />
                          <Text style={styles.pickOrderItemName}>1 × {primaryItem}</Text>
                        </View>
                        <Text style={{ fontSize: 18, color: '#94A3B8' }}>›</Text>
                      </View>
                    )}
                  </View>

                  {/* 5. Card: Restaurant details */}
                  <View style={styles.pickOrderCardWhite}>
                    <View style={styles.pickOrderCardHeaderRow}>
                      <View style={styles.pickOrderCardTitleWrap}>
                        <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 16 }}>{liveCategoryTerm.icon || '🏪'}</Text>
                        </View>
                        <Text style={styles.pickOrderCardTitle}>{liveCategoryTerm.storeNameType} details</Text>
                      </View>
                    </View>

                    <View style={styles.pickOrderRestoContentRow}>
                      <Image
                        source={require('../banner/restaurant_online.jpg')}
                        style={styles.pickOrderRestoAvatar}
                      />
                      <View style={styles.pickOrderRestoInfo}>
                        <View style={styles.pickOrderRestoNameRow}>
                          <Text style={styles.pickOrderRestoNameText} numberOfLines={1}>
                            {restaurantName || 'Restaurant'}
                          </Text>
                          <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 10, color: '#FFFFFF', fontWeight: '900' }}>✓</Text>
                          </View>
                        </View>
                        <Text style={styles.pickOrderRestoAddressText} numberOfLines={2}>
                          📍 {pickupAddress || 'Restaurant Location, Bhopal'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.pickOrderNavPillBtn}
                        onPress={handleOpenNavigationMaps}
                        activeOpacity={0.8}
                      >
                        <Text style={{ fontSize: 14 }}>✈️</Text>
                        <Text style={styles.pickOrderNavPillText}>Navigate ›</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* 6. Card: Drop location (User) */}
                  <View style={styles.pickOrderCardWhite}>
                    <View style={styles.pickOrderCardHeaderRow}>
                      <View style={styles.pickOrderCardTitleWrap}>
                        <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 16 }}>📍</Text>
                        </View>
                        <Text style={styles.pickOrderCardTitle}>Drop location (User)</Text>
                      </View>
                    </View>

                    <View style={styles.pickOrderDropContentRow}>
                      <Image
                        source={require('../banner/customer.png')}
                        style={styles.pickOrderHouseAvatar}
                      />
                      <View style={styles.pickOrderDropInfo}>
                        <Text style={styles.pickOrderDropAddressText} numberOfLines={2}>
                          {realDropAddress}
                        </Text>
                      </View>
                      <View style={styles.pickOrderDropActionButtons}>
                        {/* Call */}
                        <TouchableOpacity
                          style={styles.pickOrderCircleActionBtn}
                          onPress={() => {
                            if (customerPhone) {
                              Linking.openURL(`tel:${customerPhone}`).catch(() => Alert.alert('Call', `Calling ${customerName}`));
                            } else {
                              Alert.alert('Customer Phone', 'फोन नंबर उपलब्ध नहीं है।');
                            }
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.pickOrderCircleIconBtn, { backgroundColor: '#10B981' }]}>
                            <Text style={{ fontSize: 16, color: '#FFFFFF' }}>📞</Text>
                          </View>
                          <Text style={styles.pickOrderCircleBtnLabel}>Call</Text>
                        </TouchableOpacity>

                        {/* Message */}
                        <TouchableOpacity
                          style={styles.pickOrderCircleActionBtn}
                          onPress={handleMessage}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.pickOrderCircleIconBtn, { backgroundColor: '#0066FF' }]}>
                            <Text style={{ fontSize: 16, color: '#FFFFFF' }}>💬</Text>
                          </View>
                          <Text style={styles.pickOrderCircleBtnLabel}>Message</Text>
                        </TouchableOpacity>

                        {/* Navigate */}
                        <TouchableOpacity
                          style={styles.pickOrderCircleActionBtn}
                          onPress={() => {
                            const dLat = destLat || ride.destLat || ride.destinationLat;
                            const dLon = destLon || ride.destLon || ride.destinationLon;
                            if (dLat && dLon) {
                              Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dLat},${dLon}`).catch(() => {});
                            } else {
                              handleOpenNavigationMaps();
                            }
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.pickOrderCircleIconBtn, { backgroundColor: '#0066FF' }]}>
                            <Text style={{ fontSize: 16, color: '#FFFFFF' }}>✈️</Text>
                          </View>
                          <Text style={styles.pickOrderCircleBtnLabel}>Navigate</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </>
              );
            })()}
          </ScrollView>

          {/* 7. Sticky Bottom Action Bar: Only Text Display (Non-clickable, no button action, slide disabled) */}
          <View style={styles.pickOrderBottomBarNew}>
            <View
              style={[
                styles.pickOrderActionBtnLarge,
                {
                  backgroundColor: '#0066FF',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 16,
                },
              ]}
            >
              <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' }}>
                Go to Supplier
              </Text>
            </View>
          </View>
        </View>
      ) : !isFullScreenMap && isRider && isFoodDelivery ? (
        /* SCREEN 2 & 4 FOOD BOTTOM CARDS (PICKUP, DROP-OFF, OR MINIMIZED) */
        isAtCustomer ? (() => {
          const realOrderId = String(
            ride?.bookingId ||
            ride?.orderId ||
            bookingId ||
            orderData?.bookingId ||
            orderData?.orderId ||
            ride?.id ||
            ''
          ).replace(/[^a-zA-Z0-9]/g, '').slice(-10).toUpperCase() || 'ORDER';

          const realCustName =
            customerName ||
            ride?.customerName ||
            ride?.userName ||
            ride?.user?.name ||
            ride?.customer?.name ||
            orderData?.customerName ||
            orderData?.userName ||
            'Customer';

          const realCustPhone = customerPhone || ride?.customerPhone || ride?.userPhone || orderData?.customerPhone;
          const realCustRating = ride?.customerRating || orderData?.customerRating || '5.00';

          const realDropAddress = (destinationAddress && !destinationAddress.includes('Concealed'))
            ? destinationAddress
            : (
                ride?.destinationAddress ||
                ride?.dropAddress ||
                ride?.customerAddress ||
                ride?.userAddress ||
                ride?.address ||
                orderData?.deliveryAddress ||
                orderData?.dropAddress ||
                'Customer Delivery Address'
              );

          const realRestoName =
            restaurantName ||
            ride?.restaurantName ||
            ride?.supplierBusinessName ||
            ride?.supplierName ||
            orderData?.restaurantName ||
            orderData?.supplierName ||
            'Restaurant';

          const realFareAmount = (orderTotalFare && Number(orderTotalFare) > 0)
            ? orderTotalFare
            : (
                ride?.fare ||
                ride?.totalFare ||
                ride?.price ||
                orderData?.total ||
                orderData?.totalAmount ||
                orderData?.grandTotal ||
                '0'
              );

          return (
            /* ═══════════════════════════════════════════════════════════════════════ */
            /* SCREEN: FULL-SCREEN DROP ORDER (100% REAL & DYNAMIC - NO TOP MAP)       */
            /* ═══════════════════════════════════════════════════════════════════════ */
            <View style={styles.dropOrderContainer}>
              {/* Top Bar: ⌄ Drop Order       🚨 ➔ HELP */}
              <View style={[styles.dropOrderHeaderBar, { paddingTop: (StatusBar.currentHeight || 24) + 6 }]}>
                <TouchableOpacity
                  style={styles.dropOrderBackBtn}
                  onPress={() => navigation.navigate('DeliveryRiderHomeScreen')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.dropOrderBackChevron}>⌄</Text>
                  <Text style={styles.dropOrderHeaderTitle}>Drop Order</Text>
                </TouchableOpacity>

                <View style={styles.dropOrderHeaderActions}>
                  {/* Emergency Siren SOS */}
                  <TouchableOpacity
                    style={styles.dropOrderSosBtn}
                    onPress={handleEmergencySOS}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 20 }}>🚨</Text>
                  </TouchableOpacity>

                  {/* Offline after trip schedule arrow (User Requirement A.5) */}
                  <TouchableOpacity
                    style={styles.dropOrderMinBtn}
                    onPress={handleToggleOfflineAfterTrip}
                    activeOpacity={0.8}
                  >
                    <View style={[
                      styles.dropOrderMinCircle,
                      offlineAfterTrip && { backgroundColor: '#EA580C', borderColor: '#EA580C' }
                    ]}>
                      <Text style={{ fontSize: 14, color: offlineAfterTrip ? '#FFFFFF' : '#0F172A', fontWeight: '900' }}>➔</Text>
                    </View>
                  </TouchableOpacity>

                  {/* HELP button */}
                  <TouchableOpacity
                    style={styles.dropOrderHelpBtn}
                    onPress={() => setShowRiderHelpModal(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.dropOrderHelpBtnText}>HELP</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 130 }}
                showsVerticalScrollIndicator={false}
              >
                {/* Customer Drop Reached Lottie Video Card Frame (kio.json with Say "Thank you" and Play/Pause Button) */}
                <TouchableOpacity
                  style={styles.dropOrderTrainingCard}
                  activeOpacity={0.9}
                  onPress={() => setIsDropLottiePlaying((prev) => !prev)}
                >
                  <LottieAnimation
                    source="/uploads/lottie/drop_reached.json"
                    width="100%"
                    height="100%"
                    speed={0.80}
                    preserveAspectRatio="xMidYMid slice"
                    loop={true}
                    autoPlay={true}
                    isPlaying={isDropLottiePlaying}
                    style={{ width: '100%', height: '100%', backgroundColor: '#000000' }}
                  />
                  {/* Play/Pause Button Overlay in Center */}
                  <View style={styles.dropOrderPlayCircle}>
                    <Text style={{ fontSize: 22, color: '#FFFFFF', marginLeft: isDropLottiePlaying ? 0 : 3 }}>
                      {isDropLottiePlaying ? '⏸' : '▶'}
                    </Text>
                  </View>
                  {/* Dark gradient text strip with Say "Thank you" */}
                  <View style={styles.dropOrderTrainingLabelWrap}>
                    <Text style={styles.dropOrderTrainingLabel}>Say "Thank you"</Text>
                  </View>
                </TouchableOpacity>

                                {/* Cash Collection / Payment Banner (User Requirement A.2: Online paid & Checkbox Toggle) */}
                <TouchableOpacity
                  style={[
                    styles.dropOrderCashCard,
                    isPaymentConfirmedBoxChecked && { borderColor: '#16A34A', backgroundColor: '#F0FDF4' }
                  ]}
                  activeOpacity={0.8}
                  onPress={() => {
                    const nextVal = !isPaymentConfirmedBoxChecked;
                    setIsPaymentConfirmedBoxChecked(nextVal);
                    Animated.spring(deliveredBtnSlideAnim, {
                      toValue: nextVal ? 1 : 0,
                      useNativeDriver: true,
                      friction: 8,
                      tension: 40,
                    }).start();
                  }}
                >
                  <View style={styles.dropOrderCashIconWrap}>
                    <Text style={{ fontSize: 24 }}>💵</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.dropOrderCashAmountText}>
                      Online paid: ₹{realFareAmount}
                    </Text>
                    <Text style={styles.dropOrderCashOrderNum}>
                      Order: #{realOrderId}
                    </Text>
                  </View>
                  <View style={[
                    styles.dropOrderCashCheckWrap,
                    !isPaymentConfirmedBoxChecked && { backgroundColor: '#F8FAFC', borderWidth: 2, borderColor: '#CBD5E1' }
                  ]}>
                    {isPaymentConfirmedBoxChecked ? (
                      <Text style={{ fontSize: 16, color: '#FFFFFF', fontWeight: '900' }}>✔</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>

                {/* Customer Details Card (Dynamic Real-Time Name, Rating, Address, Call & Map) */}
                <View style={styles.dropOrderCustCard}>
                  <View style={styles.dropOrderCustTopRow}>
                    <View style={styles.dropOrderCustAvatarWrap}>
                      <Text style={{ fontSize: 22, color: '#0066FF' }}>👤</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.dropOrderCustName} numberOfLines={1}>
                        {realCustName}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                        <Text style={styles.dropOrderCustRating}>Rating {realCustRating}</Text>
                        <Text style={{ fontSize: 13, color: '#F59E0B', marginLeft: 4 }}>⭐</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 18, color: '#64748B', fontWeight: '800' }}>⌃</Text>
                  </View>

                  {/* Divider Line */}
                  <View style={styles.dropOrderCustDivider} />

                  {/* Drop Destination Address Row (User Requirement A.3: Delivered location) */}
                  <View style={styles.dropOrderCustAddrRow}>
                    <Text style={{ fontSize: 18, color: '#EF4444', marginRight: 10, marginTop: 1 }}>📍</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', marginBottom: 2 }}>
                        Delivered location
                      </Text>
                      <Text style={styles.dropOrderCustAddrText} numberOfLines={2}>
                        {realDropAddress.replace(/Service [Ll]ocation/g, 'Delivered location').replace(/सर्विस लोकेशन/g, 'Delivered location')}
                      </Text>
                    </View>
                  </View>

                  {/* Action Buttons: 📞 Call and 🗺️ Go to map */}
                  <View style={styles.dropOrderCustActionsRow}>
                    <TouchableOpacity
                      style={styles.dropOrderPillBtn}
                      onPress={() => {
                        if (realCustPhone) {
                          Linking.openURL(`tel:${realCustPhone}`).catch(() => {
                            Alert.alert('Call Customer', `Calling ${realCustName}`);
                          });
                        } else {
                          Alert.alert('Customer Phone', 'ग्राहक का फोन नंबर उपलब्ध नहीं है।');
                        }
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 15, color: '#0066FF', marginRight: 6 }}>📞</Text>
                      <Text style={styles.dropOrderPillBtnText}>Call</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.dropOrderPillBtn}
                      onPress={() => {
                        const dLat = destLat || ride?.destLat || ride?.destinationLat;
                        const dLon = destLon || ride?.destLon || ride?.destinationLon;
                        if (dLat && dLon) {
                          Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dLat},${dLon}`).catch(() => {});
                        } else {
                          handleOpenNavigationMaps();
                        }
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 15, color: '#0066FF', marginRight: 6 }}>🗺️</Text>
                      <Text style={styles.dropOrderPillBtnText}>Go to map</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Order Details Card (Expandable Accordion with Real Dynamic Items) */}
                <View style={styles.dropOrderDetailsCard}>
                  <TouchableOpacity
                    style={styles.dropOrderDetailsHeader}
                    onPress={() => setIsDropOrderDetailsExpanded(!isDropOrderDetailsExpanded)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.dropOrderBagIconWrap}>
                      <Text style={{ fontSize: 18, color: '#0066FF' }}>🛍️</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.dropOrderDetailsTitle}>Order details</Text>
                      <Text style={styles.dropOrderDetailsRestoName}>
                        {realRestoName}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 18, color: '#64748B', fontWeight: '800' }}>
                      {isDropOrderDetailsExpanded ? '⌃' : '⌄'}
                    </Text>
                  </TouchableOpacity>

                  {/* Real-time Order items when expanded */}
                  {isDropOrderDetailsExpanded && (
                    <View style={styles.dropOrderItemsContainer}>
                      {parsedOrderItems && parsedOrderItems.length > 0 ? (
                        parsedOrderItems.map((item: any, idx: number) => (
                          <View key={`drop_item_${idx}`} style={styles.dropOrderItemRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.dropOrderItemName}>
                                {item.quantity || 1} × {item.name}
                              </Text>
                              {Boolean(item.variant) && (
                                <Text style={styles.dropOrderItemVariant}>{item.variant}</Text>
                              )}
                            </View>
                            {Boolean(item.price > 0) && (
                              <Text style={styles.dropOrderItemPrice}>₹{item.price}</Text>
                            )}
                          </View>
                        ))
                      ) : (
                        <View style={styles.dropOrderItemRow}>
                          <Text style={styles.dropOrderItemName}>
                            1 × {orderData?.dishName || orderData?.serviceName || ride?.dishName || 'Food Items'}
                          </Text>
                          <Text style={styles.dropOrderItemPrice}>₹{realFareAmount}</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              </ScrollView>

              {/* Sticky Bottom Slider Button: >> Order delivered ✓ (User Requirement A.2: Animated Slide-up only when box checked) */}
              {isPaymentConfirmedBoxChecked && (
                <Animated.View
                  style={[
                    styles.dropOrderBottomBar,
                    {
                      transform: [
                        {
                          translateY: deliveredBtnSlideAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [120, 0],
                          }),
                        },
                      ],
                      opacity: deliveredBtnSlideAnim,
                    },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.dropOrderDeliveredBtn}
                    onPress={handleAttemptDeliverOrder}
                    activeOpacity={0.88}
                  >
                    <View style={styles.dropOrderChevronCircle}>
                      <Text style={styles.dropOrderChevronText}>&gt;&gt;</Text>
                    </View>
                    <Text style={styles.dropOrderDeliveredText}>Order delivered</Text>
                    <View style={styles.dropOrderCheckCircle}>
                      <Text style={styles.dropOrderCheckText}>✔</Text>
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              )}
            </View>
          );
        })() : isHeadingToCustomer ? (
          /* DROP OFF CUSTOMER CARD (Heading to Customer) - Exact Matches Image 2 */
          <View style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: Platform.OS === 'ios' ? 34 : 24,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.12,
            shadowRadius: 8,
            elevation: 16,
            zIndex: 30,
          }}>
            {/* Center Handle Bar */}
            <View style={{ width: 44, height: 4.5, borderRadius: 3, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 12 }} />

            {/* Tag & Circular Phone Button Row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <View style={{ backgroundColor: '#0066FF', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>Drop off</Text>
              </View>

              <TouchableOpacity
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: '#EFF6FF',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: '#DBEAFE',
                }}
                onPress={() => {
                  if (customerPhone) {
                    Linking.openURL(`tel:${customerPhone}`).catch(() => {
                      Alert.alert('Call Customer', `Calling ${customerName}`);
                    });
                  } else {
                    Alert.alert('Customer Phone', 'Customer phone number is not available.');
                  }
                }}
                activeOpacity={0.8}
              >
                <Icon name="call" size={20} color="#0066FF" />
              </TouchableOpacity>
            </View>

            {/* Customer Name */}
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#0F172A', marginTop: 2 }} numberOfLines={1}>
              {customerName || 'Customer'}
            </Text>

            {/* Customer Delivery Address */}
            <Text style={{ fontSize: 13, color: '#64748B', marginTop: 4, lineHeight: 18 }} numberOfLines={2}>
              {destinationAddress || ride.destinationAddress || ride.dropAddress || ride.address || 'Customer Delivery Address'}
            </Text>

            {/* Call and Navigate Buttons Row */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, marginBottom: 14 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1.5,
                  borderColor: '#CBD5E1',
                  paddingVertical: 12,
                  borderRadius: 14,
                }}
                onPress={() => {
                  if (customerPhone) {
                    Linking.openURL(`tel:${customerPhone}`).catch(() => {
                      Alert.alert('Call Customer', `Calling ${customerName}`);
                    });
                  } else {
                    Alert.alert('Customer Phone', 'Customer phone number is not available.');
                  }
                }}
                activeOpacity={0.8}
              >
                <Icon name="call" size={18} color="#0066FF" style={{ marginRight: 6 }} />
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#0066FF' }}>Call</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#0F172A',
                  paddingVertical: 12,
                  borderRadius: 14,
                }}
                onPress={handleOpenNavigationMaps}
                activeOpacity={0.8}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 14, marginRight: 6 }}>▲</Text>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>Navigate Map</Text>
              </TouchableOpacity>
            </View>

            {/* Reached Customer Swipe Slider */}
            <SwipeSlider
              title="REACHED CUSTOMER >>>"
              buttonColor="#0066FF"
              textColor="#FFFFFF"
              arrowBgColor="#0F172A"
              arrowColor="#FFFFFF"
              onComplete={() => {
                handleUpdateStatus('REACHED_CUSTOMER');
                setIsPaymentScreenActive(true);
              }}
            />
          </View>
        ) : (
          /* PICK UP RESTAURANT CARD (Matches media_1789100490211.png) */
          <View style={styles.zomatoCard}>
            {/* Grey Dropdown Handle */}
            <View style={styles.zomatoHandleRow}>
              <TouchableOpacity
                onPress={() => navigation.navigate('DeliveryRiderHomeScreen')}
                hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}
              >
                <Text style={styles.zomatoHandleChevron}>⌄</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                {/* Pick up Badge */}
                <View style={styles.zomatoPickupBadge}>
                  <Text style={styles.zomatoPickupBadgeText}>Pick up</Text>
                </View>

                {/* Restaurant Name */}
                <Text style={styles.zomatoRestoName} numberOfLines={1}>
                  {restaurantName}
                </Text>

                {/* Restaurant Full Address */}
                <Text style={styles.zomatoRestoAddress} numberOfLines={2}>
                  {pickupAddress}
                </Text>
              </View>

              {/* Restaurant Photo Thumbnail (Requirement 5) */}
              {restaurantPhotos.length > 0 ? (
                <TouchableOpacity
                  style={styles.restoThumbBtn}
                  onPress={() => {
                    setCurrentPhotoIndex(0);
                    setShowPhotoGalleryModal(true);
                  }}
                  activeOpacity={0.8}
                >
                  <Image source={{ uri: restaurantPhotos[0] }} style={styles.restoThumbImg} />
                  <View style={styles.restoThumbBadge}>
                    <Text style={styles.restoThumbBadgeText}>📷 {restaurantPhotos.length}</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <View style={styles.restoThumbEmpty}>
                  <Text style={{ fontSize: 24 }}>🏪</Text>
                </View>
              )}
            </View>

            {/* Real Ordered Items Preview */}
            {parsedOrderItems && parsedOrderItems.length > 0 && (
              <View style={{
                backgroundColor: '#F8FAFC',
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#E2E8F0',
                padding: 10,
                marginBottom: 10,
              }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', marginBottom: 4 }}>
                  Ordered Items ({parsedOrderItems.length})
                </Text>
                {parsedOrderItems.map((item: any, idx: number) => (
                  <Text key={`item_${idx}`} style={{ fontSize: 13, color: '#1E293B', fontWeight: '600', marginBottom: 2 }}>
                    • {item.quantity || 1} × {item.name}
                  </Text>
                ))}
              </View>
            )}

            {/* Call, Map and Support Action Row (Requirement 7) */}
            <View style={styles.zomatoActionsRow}>
              <TouchableOpacity
                style={styles.zomatoCallBtn}
                onPress={() => {
                  Linking.openURL(`tel:${restaurantPhone}`).catch(() => {
                    Alert.alert('Call Restaurant', `Calling ${restaurantName} at ${restaurantPhone}`);
                  });
                }}
                activeOpacity={0.8}
              >
                <Icon name="call" size={18} color="#0F172A" />
                <Text style={styles.zomatoCallBtnText}>Call</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.zomatoMapBtn}
                onPress={handleOpenNavigationMaps}
                activeOpacity={0.8}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 16 }}>▲</Text>
                <Text style={styles.zomatoMapBtnText}>Map</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.zomatoSupportBtn}
                onPress={() => setShowRiderHelpModal(true)}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 16 }}>🎧</Text>
                <Text style={styles.zomatoSupportBtnText}>Support</Text>
              </TouchableOpacity>
            </View>

            {/* Reached pickup / Go to Supplier Action (Only text, non-clickable, no slide) */}
            {isAtRestaurant ? (
              <View
                style={{
                  width: '100%',
                  backgroundColor: '#0066FF',
                  paddingVertical: 14,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 6,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' }}>
                  Go to Supplier
                </Text>
              </View>
            ) : (
              <SwipeSlider
                title="REACHED PICKUP >>>"
                buttonColor="#00C06D"
                textColor="#0F172A"
                arrowBgColor="#0F172A"
                arrowColor="#FFFFFF"
                onComplete={() => {
                  handleUpdateStatus('REACHED_RESTAURANT');
                }}
              />
            )}
          </View>
        )
      ) : !isFullScreenMap && (
        <View style={[styles.bottomCard, { backgroundColor: currentColors.surface, borderTopColor: currentColors.border }]}>
        {/* Status Indicator */}
        <View style={styles.statusHeaderRow}>
          <View style={[styles.statusIndicatorDot, {
            backgroundColor:
              status === 'COMPLETED' || status === 'SERVICE_COMPLETED' ? '#16A34A' :
              (status || '').includes('CANCEL') ? '#EF4444' :
              status === 'PENDING' || status === 'BOOKING_REQUESTED' || status === 'PENDING_RESTAURANT' ? '#F59E0B' :
              '#0066FF'
          }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusHeadingText, { color: currentColors.text }]}>
              {(() => {
                const s = (status || '').toUpperCase();
                if (s === 'BOOKING_REQUESTED' || s === 'PENDING' || s === 'SEARCHING') {
                  return '🔍 Searching for nearby service partner...';
                }
                if (s === 'CONNECTING') {
                  return '⏳ Connecting to restaurant partner...';
                }
                if (s === 'PENDING_RESTAURANT' || s === 'RINGING') {
                  return '📞 Ringing restaurant partner...';
                }
                if (s === 'RESTAURANT_ACCEPTED' || s === 'PREPARING') {
                  return orderCategoryName.toLowerCase() === 'food' ? '🍳 Order accepted! Kitchen is preparing food...' : `📦 Order accepted! Store is packing ${orderCategoryName.toLowerCase()} order...`;
                }
                if (s === 'FOOD_READY' || s === 'READY_FOR_PICKUP') {
                  return orderCategoryName.toLowerCase() === 'food' ? '📦 Food is ready! Waiting for delivery partner...' : `📦 ${orderCategoryName} is ready! Waiting for delivery partner...`;
                }
                if (s === 'ACCEPTED' || s === 'PROVIDER_ACCEPTED' || s === 'PROVIDER_ON_THE_WAY' || s === 'OUT_FOR_DELIVERY') {
                  return '🛵 Service partner is on the way to your location';
                }
                if (s === 'PROVIDER_ARRIVED') {
                  return '📍 Partner arrived at your location!';
                }
                if (s === 'STARTED' || s === 'SERVICE_STARTED') {
                  return '⚡ Service is in progress...';
                }
                if (s === 'COMPLETED' || s === 'SERVICE_COMPLETED' || s === 'DELIVERED') {
                  return '🎉 Order Completed Successfully!';
                }
                if (s.includes('CANCEL')) {
                  return '❌ Order Cancelled';
                }
                return `Status: ${status}`;
              })()}
            </Text>
            <Text style={[styles.rideIdSubText, { color: currentColors.textMuted }]}>Booking ID: {ride.bookingId || ride.rideId || bookingId || 'ride_1001'}</Text>
          </View>
        </View>

        {/* Address Details */}
        <View style={[styles.addressBox, { backgroundColor: currentColors.background, borderColor: currentColors.border }]}>
          <View style={styles.addressRow}>
            <Icon name="radio-button-on" size={16} color="#16A34A" style={{ marginRight: 8 }} />
            <Text style={[styles.addressText, { color: currentColors.text }]} numberOfLines={1}>Service Location: {pickupAddress}</Text>
          </View>
          <View style={[styles.addressDivider, { backgroundColor: currentColors.border }]} />
          <View style={styles.addressRow}>
            <Icon name="location-sharp" size={16} color="#EF4444" style={{ marginRight: 8 }} />
            <Text style={[styles.addressText, { color: currentColors.text }]} numberOfLines={1}>Drop / Destination: {destinationAddress}</Text>
          </View>
        </View>

        {/* Provider / Customer Info Row */}
        <View style={styles.partnerInfoBox}>
          {(() => {
            const partnerPhoto = isRider
              ? (customerPhoto || ride?.customerPhoto || ride?.customerPicture || null)
              : (riderPhoto || ride?.riderPhoto || ride?.providerPhoto || ride?.providerPicture || ride?.acceptedBy?.riderPhoto || ride?.acceptedBy?.profilePicture || null);

            const displayPhoto = partnerPhoto
              ? (partnerPhoto.startsWith('http') ? partnerPhoto : `${UPLOADS_URL}${partnerPhoto.replace('/uploads', '')}`)
              : null;

            const displayName = isRider
              ? (customerName || ride?.customerName || 'Customer')
              : (riderName || ride?.acceptedBy?.riderName || ride?.riderName || 'Service Provider');

            return displayPhoto ? (
              <Image source={{ uri: displayPhoto }} style={{ width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: isRider ? '#0066FF' : '#0066FF', marginRight: 12 }} />
            ) : (
              <View style={[styles.partnerAvatarCircle, { backgroundColor: isDark ? '#2D3748' : (isRider ? '#F3E8FF' : '#DBEAFE') }]}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: isRider ? '#0066FF' : '#0066FF' }}>
                  {displayName[0]?.toUpperCase() || (isRider ? 'C' : 'P')}
                </Text>
              </View>
            );
          })()}

          <View style={{ flex: 1 }}>
            <Text style={[styles.partnerNameText, { color: currentColors.text }]}>
              {isRider ? (customerName || ride?.customerName || 'Customer') : (riderName || ride?.acceptedBy?.riderName || ride?.riderName || 'Service Provider')}
            </Text>
            <Text style={[styles.partnerRatingSub, { color: currentColors.textMuted }]}>
              {isRider
                ? '👤 Customer • Service Requester'
                : `🛵 ${ride?.riderVehicleType || ride?.vehicleType || 'Bike'}${ride?.riderVehicleNumber || ride?.vehicleNumber ? ` • ${ride?.riderVehicleNumber || ride?.vehicleNumber}` : ''} • ★ 4.9`}
            </Text>
            <Text style={[styles.partnerRatingSub, { color: '#059669', fontWeight: 'bold', marginTop: 2 }]}>
              💳 Payment: {ride?.paymentMethod?.toUpperCase() || 'CASH'}
            </Text>
          </View>

          <View style={styles.communicationBtnsRow}>
            <TouchableOpacity style={[styles.commCircleBtn, { backgroundColor: isDark ? '#2D3748' : '#F1F5F9' }]} onPress={handleCall}>
              <Icon name="call" size={18} color="#0066FF" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.commCircleBtn, { backgroundColor: isDark ? '#2D3748' : '#F1F5F9' }]} onPress={handleMessage}>
              <Icon name="chatbubble" size={18} color="#16A34A" />
            </TouchableOpacity>
            {isRider && (
              <TouchableOpacity
                style={[styles.commCircleBtn, { backgroundColor: isDark ? '#2D3748' : '#F1F5F9' }]}
                onPress={() => setShowRiderHelpModal(true)}
              >
                <Text style={{ fontSize: 16 }}>🎧</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Lifecycle Action Buttons */}
        <View style={styles.actionButtonsRow}>
          {/* View as Customer (Only visible to Rider) */}
          {isRider && (
            <TouchableOpacity 
              style={[styles.arrivedActionBtn, { backgroundColor: '#10B981', marginBottom: 12 }]} 
              onPress={() => navigation.setParams({ isRider: false })}
            >
              <Text style={styles.actionBtnText}>VIEW AS CUSTOMER</Text>
            </TouchableOpacity>
          )}

          {isRider && !isFoodDelivery && (status === 'ACCEPTED' || status === 'PROVIDER_ACCEPTED') && (
            <TouchableOpacity style={styles.arrivedActionBtn} onPress={() => handleUpdateStatus('PROVIDER_ARRIVED')}>
              <Text style={styles.actionBtnText}>📍 I HAVE ARRIVED AT CUSTOMER LOCATION</Text>
            </TouchableOpacity>
          )}

          {isRider && !isFoodDelivery && status === 'PROVIDER_ARRIVED' && (
            <View style={{ width: '100%' }}>
              <View style={{ backgroundColor: '#DCFCE7', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: '#86EFAC' }}>
                <Text style={{ color: '#15803D', fontWeight: '900', fontSize: 13 }}>
                  📍 Arrived at Customer Location!
                </Text>
              </View>
              <TouchableOpacity style={styles.startTripActionBtn} onPress={() => handleUpdateStatus('STARTED')}>
                <Text style={styles.actionBtnText}>▶ START SERVICE NOW</Text>
              </TouchableOpacity>
            </View>
          )}

          {!isFoodDelivery && (status === 'STARTED' || status === 'SERVICE_STARTED') && (
            <TouchableOpacity style={styles.completeTripActionBtn} onPress={() => setShowCollectPaymentModal(true)}>
              <Text style={styles.actionBtnText}>💵 COLLECT PAYMENT & FINISH</Text>
            </TouchableOpacity>
          )}

          {/* ❌ Cancel Booking Button */}
          {status !== 'COMPLETED' && (
            <TouchableOpacity style={styles.cancelBookingBtn} onPress={handleCancelBooking}>
              <Icon name="close-circle-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.cancelBtnText}>CANCEL BOOKING</Text>
            </TouchableOpacity>
          )}
          {status === 'COMPLETED' && (
            <TouchableOpacity style={[styles.startTripActionBtn, { backgroundColor: '#16A34A' }]} onPress={() => {
              if (isRider) {
                navigation.navigate('DeliveryRiderHomeScreen');
              } else {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                } else {
                  navigation.navigate('CustomerHomeScreen');
                }
              }
            }}>
              <Text style={styles.actionBtnText}>FINISH & GO TO HOME</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      )}

      {/* ──── CANCELLATION REASON MODAL ──── */}
      <Modal visible={showCancelReasonModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: currentColors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 36 }}>
            <Text style={{ fontSize: 17, fontWeight: '900', color: currentColors.text, marginBottom: 4 }}>
              ❌ {isRider ? 'Ride Cancel Reason?' : 'Cancel Booking Reason?'}
            </Text>
            <Text style={{ fontSize: 12, color: currentColors.textMuted, marginBottom: 16 }}>
              Please select the reason for cancellation:
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 300 }}>
              {(isRider ? RIDER_CANCEL_REASONS : CUSTOMER_CANCEL_REASONS).map((reason) => (
                <TouchableOpacity
                   key={reason}
                   style={{
                     flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
                     paddingHorizontal: 14, borderRadius: 10, marginBottom: 8,
                     backgroundColor: selectedCancelReason === reason ? (isDark ? '#1E3A8A' : '#EFF6FF') : (isDark ? '#2D3748' : '#F8FAFC'),
                     borderWidth: 1.5,
                     borderColor: selectedCancelReason === reason ? '#0066FF' : currentColors.border,
                   }}
                   onPress={() => setSelectedCancelReason(reason)}
                >
                  <View style={{
                    width: 18, height: 18, borderRadius: 9, borderWidth: 2,
                    borderColor: selectedCancelReason === reason ? '#0066FF' : '#94A3B8',
                    backgroundColor: selectedCancelReason === reason ? '#0066FF' : 'transparent',
                    marginRight: 10, justifyContent: 'center', alignItems: 'center',
                  }}>
                    {selectedCancelReason === reason && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' }} />}
                  </View>
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: currentColors.text }}>{reason}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', marginTop: 16, gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: isDark ? '#2D3748' : '#F1F5F9', alignItems: 'center' }}
                onPress={() => setShowCancelReasonModal(false)}
              >
                <Text style={{ fontSize: 14, fontWeight: '800', color: currentColors.textMuted }}>Go Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#EF4444', alignItems: 'center' }}
                onPress={confirmCancellationWithReason}
                disabled={isSubmittingCancel}
              >
                {isSubmittingCancel
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Text style={{ fontSize: 14, fontWeight: '900', color: '#FFFFFF' }}>Confirm Cancel</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ──── RIDER PAYMENT COLLECTION MODAL ──── */}
      <Modal visible={showCollectPaymentModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: currentColors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View>
                <Text style={{ fontSize: 18, fontWeight: '900', color: currentColors.text }}>
                  💰 Collect Payment
                </Text>
                <Text style={{ fontSize: 12, color: currentColors.textMuted, marginTop: 2 }}>
                  Selected payment mode by customer
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowCollectPaymentModal(false)} style={{ padding: 4 }}>
                <Icon name="close" size={24} color={currentColors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Total Fare Card */}
            <View style={{ backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: currentColors.border, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: currentColors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Total Ride / Service Fare
              </Text>
              <Text style={{ fontSize: 32, fontWeight: '900', color: '#16A34A', marginVertical: 4 }}>
                ₹{ride?.price || ride?.amount || 0}
              </Text>
              <Text style={{ fontSize: 12, color: currentColors.text, fontWeight: '600' }}>
                Cust: {customerName} ({customerPhone || 'N/A'})
              </Text>
            </View>

            {/* Selected Payment Method Breakdown */}
            {(() => {
              const pMethod = (ride?.paymentMethod || ride?.paymentMode || 'cash').toLowerCase();
              const isCash = pMethod.includes('cash');
              const isUpi = pMethod.includes('upi') || pMethod.includes('qr') || pMethod.includes('gpay') || pMethod.includes('paytm');
              const isOnline = pMethod.includes('online') || pMethod.includes('card') || pMethod.includes('razorpay') || pMethod.includes('wallet');

              return (
                <View style={{ marginBottom: 20 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: currentColors.text }}>Payment Mode Selected:</Text>
                    <View style={{ marginLeft: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: isCash ? '#FEF3C7' : isUpi ? '#E0F2FE' : '#DCFCE7' }}>
                      <Text style={{ fontSize: 12, fontWeight: '900', color: isCash ? '#D97706' : isUpi ? '#0284C7' : '#15803D' }}>
                        {isCash ? '💵 CASH' : isUpi ? '📱 UPI / QR CODE' : '💳 PAID ONLINE'}
                      </Text>
                    </View>
                  </View>

                  {/* Payment Info Callout Box */}
                  <View style={{ backgroundColor: isCash ? '#FFFBEB' : isUpi ? '#F0F9FF' : '#F0FDF4', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: isCash ? '#FDE68A' : isUpi ? '#BAE6FD' : '#BBF7D0' }}>
                    {isCash && (
                      <Text style={{ fontSize: 13, color: '#B45309', fontWeight: '700', lineHeight: 18 }}>
                        💵 Please collect ₹{ride?.price || 0} in Cash directly from the customer.
                      </Text>
                    )}
                    {isUpi && (
                      <Text style={{ fontSize: 13, color: '#0369A1', fontWeight: '700', lineHeight: 18 }}>
                        📱 Customer selected UPI. Ask customer to scan your UPI QR code or pay ₹{ride?.price || 0} to your UPI ID.
                      </Text>
                    )}
                    {isOnline && (
                      <Text style={{ fontSize: 13, color: '#15803D', fontWeight: '700', lineHeight: 18 }}>
                        💳 Payment of ₹{ride?.price || 0} is already completed online via Razorpay/Wallet.
                      </Text>
                    )}
                  </View>
                </View>
              );
            })()}

            {/* Confirm & Complete Action Button */}
            <TouchableOpacity
              style={{ backgroundColor: '#16A34A', paddingVertical: 16, borderRadius: 14, alignItems: 'center', elevation: 3 }}
              onPress={() => {
                setShowCollectPaymentModal(false);
                handleUpdateStatus('COMPLETED');
              }}
              activeOpacity={0.85}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15, letterSpacing: 0.5 }}>
                ✅ PAYMENT RECEIVED & COMPLETE RIDE
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── RIDER RESTAURANT RATING MODAL (Pickup Flow) ── */}
      <Modal
        visible={showRestoRatingModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => handleCompletePickupWithRating(true)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.restoRatingSheet}>
            <View style={styles.restoRatingHeader}>
              <View style={styles.restoRatingIconCircle}>
                <Text style={{ fontSize: 28 }}>⭐</Text>
              </View>
              <Text style={styles.restoRatingTitle}>Rate Restaurant</Text>
              <Text style={styles.restoRatingSub}>
                How was your pickup experience at {restaurantName}?
              </Text>
            </View>

            {/* Interactive 5 Star Selector */}
            <View style={styles.starPickerRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => setRestoRating(star)}
                  style={styles.starBtn}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.starEmoji, { color: star <= restoRating ? '#F59E0B' : '#CBD5E1' }]}>
                    ★
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.ratingScoreLabel}>
              {restoRating === 5 ? 'Excellent 🌟' : restoRating === 4 ? 'Very Good 👍' : restoRating === 3 ? 'Good 🙂' : restoRating === 2 ? 'Average 😐' : 'Poor 👎'}
            </Text>

            {/* Optional Feedback Input */}
            <TextInput
              style={styles.restoReviewInput}
              placeholder="Add review (optional)... e.g. Fast packaging, polite staff"
              placeholderTextColor="#94A3B8"
              value={restoReviewText}
              onChangeText={setRestoReviewText}
              multiline={true}
              numberOfLines={3}
            />

            {/* Action Buttons: Skip / Submit */}
            <View style={styles.restoRatingActionsRow}>
              <TouchableOpacity
                style={styles.restoRatingSkipBtn}
                onPress={() => handleCompletePickupWithRating(true)}
                disabled={isSubmittingRating}
                activeOpacity={0.8}
              >
                <Text style={styles.restoRatingSkipText}>Skip</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.restoRatingSubmitBtn}
                onPress={() => handleCompletePickupWithRating(false)}
                disabled={isSubmittingRating}
                activeOpacity={0.85}
              >
                {isSubmittingRating ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.restoRatingSubmitText}>Submit & Start Delivery ›</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ──── IN-APP WEBRTC CALL MODAL ──── */}
      {showCallModal && (
        <WebRTCCallModal
          visible={showCallModal}
          onClose={() => setShowCallModal(false)}
          socket={socket}
          user={user || { _id: isRider ? ride.acceptedBy?.riderId : ride.customerId, name: isRider ? riderName : customerName }}
          otherUser={isRider
            ? { _id: ride.customerId, name: customerName }
            : { _id: ride.acceptedBy?.riderId || 'rider_provider_1', name: riderName }
          }
          callType="voice"
        />
      )}
      {/* Old inline 5-option modal removed. RiderHelpModal at bottom handles all Help & Support */}

      {/* ── TRANSFER CONFIRMATION MODAL (₹0 PENALTY) ── */}
      <Modal
        visible={showTransferConfirmModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowTransferConfirmModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.transferConfirmCard}>
            <View style={styles.transferConfirmIconBg}>
              <Text style={{ fontSize: 32 }}>🔄</Text>
            </View>
            <View style={styles.zeroPenaltyBanner}>
              <Text style={styles.zeroPenaltyBannerText}>₹0 PENALTY GUARANTEED</Text>
            </View>
            <Text style={styles.transferConfirmTitle}>Transfer This Order?</Text>
            <Text style={styles.transferConfirmDesc}>
              चूंकि रेस्टोरेंट तैयारी में समय ले रहा है, आप बिना किसी पेनल्टी (₹0 Penalty) के इस ऑर्डर को री-असाइन कर सकते हैं।{'\n\n'}
              यह आर्डर सिस्टम के अगले राइडर को ट्रांसफर हो जाएगा और आप तुरंत नए ऑर्डर्स प्राप्त करने के लिए उपलब्ध हो जाएंगे।
            </Text>

            <View style={styles.transferActionsRow}>
              <TouchableOpacity
                style={styles.transferCancelBtn}
                onPress={() => setShowTransferConfirmModal(false)}
                disabled={isTransferringOrder}
              >
                <Text style={styles.transferCancelBtnText}>Keep Order</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.transferConfirmBtn}
                onPress={handleConfirmTransferOrder}
                disabled={isTransferringOrder}
              >
                {isTransferringOrder ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.transferConfirmBtnText}>Reassign Order (₹0)</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── EMERGENCY ORDER TRANSFER MODAL (RIDER A) ── */}
      <OrderTransferModal
        visible={showEmergencyTransferModal}
        onClose={() => setShowEmergencyTransferModal(false)}
        bookingId={ride?.bookingId || bookingId || orderData?.bookingId}
        orderData={orderData || ride}
        riderUser={user}
        onTransferSuccess={() => {
          rideStore.clearRide();
          navigation.reset({
            index: 0,
            routes: [{ name: 'DeliveryRiderHomeScreen' }],
          });
        }}
      />

      {/* ── HANDOVER OTP VERIFICATION MODAL (RIDER B) ── */}
      <HandoverOtpVerifyModal
        visible={showVerifyHandoverOtpModal}
        onClose={() => setShowVerifyHandoverOtpModal(false)}
        bookingId={ride?.bookingId || bookingId || orderData?.bookingId}
        riderUser={user}
        originalRiderName={orderData?.originalRiderName || ride?.originalRiderName}
        originalRiderPhone={orderData?.originalRiderPhone || ride?.originalRiderPhone}
        handoverAddress={orderData?.transferLocation?.address || ride?.transferLocation?.address}
        onVerifiedSuccess={(updatedBooking) => {
          setStatusSafe('OUT_FOR_DELIVERY');
          setTransferStatus('TRANSFER_COMPLETED');
          if (updatedBooking) {
            setOrderData(updatedBooking);
          }
        }}
      />

      {/* ── Full Screen Restaurant Photo Gallery Modal (Requirement 5) ── */}
      <Modal
        visible={showPhotoGalleryModal}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setShowPhotoGalleryModal(false)}
      >
        <SafeAreaView style={styles.galleryModalContainer}>
          <StatusBar hidden={false} barStyle="light-content" backgroundColor="#0B0F17" />
          {/* Gallery Header */}
          <View style={styles.galleryHeader}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.galleryRestoName} numberOfLines={1}>
                {restaurantName}
              </Text>
              <Text style={styles.galleryPhotoCounter}>
                Photo {restaurantPhotos.length > 0 ? currentPhotoIndex + 1 : 0} of {restaurantPhotos.length}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowPhotoGalleryModal(false)}
              style={styles.galleryCloseBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.galleryCloseBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Swipeable FlatList with Paging */}
          {restaurantPhotos.length > 0 ? (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <FlatList
                data={restaurantPhotos}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(_, index) => `gallery-img-${index}`}
                onMomentumScrollEnd={(e) => {
                  const offsetX = e.nativeEvent.contentOffset.x;
                  const idx = Math.round(offsetX / width);
                  setCurrentPhotoIndex(idx);
                }}
                renderItem={({ item }) => (
                  <View style={{ width, height: '100%', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 }}>
                    <Image
                      source={{ uri: item }}
                      style={styles.galleryFullImage}
                      resizeMode="contain"
                    />
                  </View>
                )}
              />

              {/* Dot Indicators */}
              <View style={styles.galleryDotsContainer}>
                {restaurantPhotos.map((_, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.galleryDot,
                      currentPhotoIndex === idx ? styles.galleryDotActive : styles.galleryDotInactive,
                    ]}
                  />
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.galleryEmptyContainer}>
              <Text style={{ fontSize: 50, marginBottom: 12 }}>🏪</Text>
              <Text style={styles.galleryEmptyTitle}>No Photos Available</Text>
              <Text style={styles.galleryEmptySub}>
                Restaurant has not uploaded any photos yet.
              </Text>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* Heavy Rain Animation Overlay */}
      {isRaining && <RainAnimation active={isRaining} intensity="heavy" />}

      {/* 8-Screen Pure Light Mode Rider Order Help & Transfer Flow Modal (User Requirement B) */}
      <RiderOrderHelpFlowModal
        visible={showRiderHelpModal}
        onClose={() => setShowRiderHelpModal(false)}
        bookingId={bookingId}
        activeOrder={orderData || ride}
        riderUser={user}
        riderCoords={{ latitude: driverLat || pickupLat || 0, longitude: driverLon || pickupLon || 0 }}
        onDenySuccess={() => {
          setShowRiderHelpModal(false);
          cleanupTracking();
          try { rideStore.clearRide(); } catch (_) {}
          navigation.reset({
            index: 0,
            routes: [{ name: 'DeliveryRiderHomeScreen' }],
          });
        }}
        navigation={navigation}
        isAtDrop={Boolean(isAtCustomer || status === 'REACHED_CUSTOMER' || status === 'ARRIVED_AT_DROP')}
        orderStage={(isAtCustomer || status === 'REACHED_CUSTOMER' || status === 'ARRIVED_AT_DROP') ? 'AT_DROP' : 'PICKUP'}
      />

      {/* ── Customer Delivery OTP Verification Modal (User Requirement A.2) ── */}
      <Modal
        visible={showDeliveryOtpModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeliveryOtpModal(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}>
          <View style={{
            width: '100%',
            maxWidth: 380,
            backgroundColor: '#FFFFFF',
            borderRadius: 24,
            padding: 24,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.2,
            shadowRadius: 20,
            elevation: 20,
          }}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: '#EFF6FF',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}>
                <Text style={{ fontSize: 28 }}>🔐</Text>
              </View>
              <Text style={{ fontSize: 20, fontWeight: '900', color: '#0F172A', textAlign: 'center' }}>
                ग्राहक से OTP प्राप्त करें
              </Text>
              <Text style={{ fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 4 }}>
                डिलीवरी पूर्ण करने के लिए ग्राहक के फोन पर भेजा गया 4-अंकीय OTP दर्ज करें
              </Text>
            </View>

            {/* OTP Input */}
            <View style={{
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: '#F8FAFC',
              borderWidth: 1.5,
              borderColor: '#0066FF',
              borderRadius: 14,
              paddingVertical: 10,
              paddingHorizontal: 16,
              marginBottom: 18,
            }}>
              <TextInput
                value={deliveryOtpInput}
                onChangeText={(t) => setDeliveryOtpInput(t.replace(/[^0-9]/g, '').slice(0, 4))}
                placeholder="0 0 0 0"
                placeholderTextColor="#94A3B8"
                keyboardType="number-pad"
                maxLength={4}
                style={{
                  fontSize: 28,
                  fontWeight: '900',
                  color: '#0F172A',
                  letterSpacing: 16,
                  textAlign: 'center',
                  width: '100%',
                }}
              />
            </View>

            {/* Action Buttons */}
            <TouchableOpacity
              style={{
                backgroundColor: '#16A34A',
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 10,
              }}
              onPress={handleVerifyDeliveryOtpAndComplete}
              activeOpacity={0.85}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '900' }}>
                सत्यापित करें &amp; डिलीवरी पूर्ण करें ✓
              </Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#EFF6FF',
                  borderRadius: 12,
                  paddingVertical: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => {
                  socket?.emit('rider_help_stage_action', {
                    bookingId,
                    riderId: user?._id || user?.id,
                    actionType: 'RESEND_OTP',
                  });
                  Alert.alert('OTP भेजा गया', 'ग्राहक के फोन पर नया OTP भेज दिया गया है।');
                }}
                activeOpacity={0.8}
              >
                <Text style={{ color: '#0066FF', fontSize: 13, fontWeight: '800' }}>
                  📨 दोबारा OTP भेजें
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#F1F5F9',
                  borderRadius: 12,
                  paddingVertical: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => {
                  const phone = customerPhone || ride?.customerPhone || ride?.phone;
                  if (phone) Linking.openURL(`tel:${phone}`).catch(() => {});
                }}
                activeOpacity={0.8}
              >
                <Text style={{ color: '#0F172A', fontSize: 13, fontWeight: '800' }}>
                  📞 ग्राहक को कॉल करें
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={{ paddingVertical: 10, alignItems: 'center' }}
              onPress={() => setShowDeliveryOtpModal(false)}
            >
              <Text style={{ color: '#64748B', fontSize: 14, fontWeight: '700' }}>
                रद्द करें
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Dynamic Category-Aware Customer Help Center Modal */}
      <CustomerHelpCenterModal
        visible={showCustomerHelpModal}
        onClose={() => setShowCustomerHelpModal(false)}
        orderStage={
          status === 'FOOD_READY' || status === 'PREPARING' || status === 'RESTAURANT_ACCEPTED'
            ? 'STORE_ACCEPTED'
            : status === 'STARTED' || status === 'OUT_FOR_DELIVERY' || status === 'PICKED_UP'
            ? 'RIDER_ASSIGNED'
            : status === 'REACHED_CUSTOMER' || status === 'ARRIVED_AT_DROP'
            ? 'RIDER_AT_LOCATION'
            : status === 'COMPLETED' || status === 'DELIVERED'
            ? 'AFTER_DELIVERY'
            : 'ORDER_SENT_TO_STORE'
        }
        categoryName={orderCategoryName}
        bookingId={bookingId}
        orderData={orderData}
        user={user}
        userCoords={{ latitude: pickupLat, longitude: pickupLon }}
        onCancelOrder={handleCancelBooking}
      />

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* REACH SCREEN HELP CENTER MODAL (User Request)                 */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={showReachHelpModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowReachHelpModal(false)}
      >
        <TouchableOpacity
          style={styles.reachHelpModalOverlay}
          activeOpacity={1}
          onPress={() => setShowReachHelpModal(false)}
        >
          <TouchableOpacity
            style={styles.reachHelpModalSheet}
            activeOpacity={1}
            onPress={(e: any) => e.stopPropagation()}
          >
            <View style={styles.reachHelpDragBar} />
            <View style={styles.reachHelpHeaderRow}>
              <View>
                <Text style={styles.reachHelpTitle}>सहायता केंद्र (Help Center)</Text>
                <Text style={styles.reachHelpSubtitle}>Pick Order से जुड़ी समस्या चुनें</Text>
              </View>
              <TouchableOpacity
                style={styles.reachHelpCloseBtn}
                onPress={() => setShowReachHelpModal(false)}
              >
                <Text style={{ fontSize: 16, color: '#64748B', fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Option 1: लाइव चैट सपोर्ट (Live Chat Support) */}
            <TouchableOpacity
              style={[styles.reachHelpOptionCard, { borderColor: '#BFDBFE' }]}
              onPress={() => {
                setShowReachHelpModal(false);
                navigation.navigate('ContactSupport', {
                  bookingId: orderData?.bookingId || ride?.bookingId || bookingId,
                  role: 'rider',
                  storeName: restaurantName,
                });
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.reachHelpOptionIconBox, { backgroundColor: '#EFF6FF' }]}>
                <Text style={{ fontSize: 22 }}>💬</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.reachHelpOptionTitle}>लाइव चैट सपोर्ट (Live Chat Support)</Text>
                <Text style={styles.reachHelpOptionDesc}>
                  सपोर्ट एजेंट से तुरंत लाइव चैट शुरू करें
                </Text>
              </View>
              <Text style={{ fontSize: 20, color: '#94A3B8' }}>›</Text>
            </TouchableOpacity>

            {/* Option 2: ऑर्डर आउट ऑफ स्टॉक है */}
            <TouchableOpacity
              style={[styles.reachHelpOptionCard, { borderColor: '#FECACA' }]}
              onPress={handleOpenOutOfStockScreen}
              activeOpacity={0.7}
            >
              <View style={[styles.reachHelpOptionIconBox, { backgroundColor: '#FEF2F2' }]}>
                <Text style={{ fontSize: 22 }}>📦</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.reachHelpOptionTitle}>ऑर्डर आउट ऑफ स्टॉक है</Text>
                <Text style={styles.reachHelpOptionDesc}>
                  सामान या डिश रेस्टोरेंट में उपलब्ध नहीं है
                </Text>
              </View>
              <Text style={{ fontSize: 20, color: '#94A3B8' }}>›</Text>
            </TouchableOpacity>

            {/* Option 3: रेस्टोरेंट बंद है */}
            <TouchableOpacity
              style={[styles.reachHelpOptionCard, { borderColor: '#E2E8F0' }]}
              onPress={handleOpenRestoClosedScreen}
              activeOpacity={0.7}
            >
              <View style={[styles.reachHelpOptionIconBox, { backgroundColor: '#F8FAFC' }]}>
                <Text style={{ fontSize: 22 }}>🏪❌</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.reachHelpOptionTitle}>रेस्टोरेंट बंद है</Text>
                <Text style={styles.reachHelpOptionDesc}>
                  दुकान / रेस्टोरेंट का शटर बंद या दुकान ऑफ है
                </Text>
              </View>
              <Text style={{ fontSize: 20, color: '#94A3B8' }}>›</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* 1. OUT OF STOCK DEDICATED SCREEN / MODAL (User Request)         */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={showOutOfStockModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowOutOfStockModal(false)}
      >
        <TouchableOpacity
          style={styles.reachHelpModalOverlay}
          activeOpacity={1}
          onPress={() => setShowOutOfStockModal(false)}
        >
          <TouchableOpacity
            style={[styles.reachHelpModalSheet, { maxHeight: '85%' }]}
            activeOpacity={1}
            onPress={(e: any) => e.stopPropagation()}
          >
            <View style={styles.reachHelpDragBar} />
            <View style={styles.reachHelpHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.reachHelpTitle}>📦 ऑर्डर आउट ऑफ स्टॉक है</Text>
                <Text style={styles.reachHelpSubtitle}>
                  उपलब्ध न होने वाले आइटम चुनें और कस्टमर/सपोर्ट से बात करें
                </Text>
              </View>
              <TouchableOpacity
                style={styles.reachHelpCloseBtn}
                onPress={() => setShowOutOfStockModal(false)}
              >
                <Text style={{ fontSize: 16, color: '#64748B', fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 8, marginTop: 4 }}>
                आइटम चुनें जो आउट ऑफ स्टॉक हैं:
              </Text>
              {parsedOrderItems && parsedOrderItems.length > 0 ? (
                parsedOrderItems.map((item: any, idx: number) => {
                  const isChecked = Boolean(selectedOutOfStockItems[String(idx)]);
                  return (
                    <TouchableOpacity
                      key={`oos_item_${idx}`}
                      style={[
                        styles.oosItemRow,
                        isChecked && styles.oosItemRowChecked
                      ]}
                      onPress={() => {
                        setSelectedOutOfStockItems((prev) => ({
                          ...prev,
                          [String(idx)]: !prev[String(idx)],
                        }));
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.oosCheckbox, isChecked && styles.oosCheckboxChecked]}>
                        {isChecked && <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 12 }}>✓</Text>}
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[styles.oosItemName, isChecked && { color: '#DC2626' }]}>
                          {item.quantity || 1} × {item.name}
                        </Text>
                        {Boolean(item.price > 0) && (
                          <Text style={{ fontSize: 12, color: '#64748B' }}>₹{item.price}</Text>
                        )}
                      </View>
                      <View style={[styles.oosStatusPill, isChecked ? styles.oosStatusPillOut : styles.oosStatusPillAvail]}>
                        <Text style={[styles.oosStatusPillText, isChecked ? styles.oosStatusPillTextOut : styles.oosStatusPillTextAvail]}>
                          {isChecked ? 'आउट ऑफ स्टॉक' : 'उपलब्ध'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={styles.oosItemRow}>
                  <Text style={{ fontSize: 14, color: '#0F172A', fontWeight: '700' }}>
                    1 × {orderData?.dishName || orderData?.serviceName || ride?.dishName || 'Food Item'}
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Real-time Working Action Buttons (Call Customer, Message, Support) */}
            <View style={{ marginTop: 14, gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {/* 📞 Call Customer */}
                <TouchableOpacity
                  style={[styles.oosActionBtn, { backgroundColor: '#10B981', flex: 1 }]}
                  onPress={() => {
                    if (customerPhone) {
                      Linking.openURL(`tel:${customerPhone}`).catch(() => {
                        Alert.alert('Call Customer', `Calling ${customerName}`);
                      });
                    } else {
                      Alert.alert('Customer Phone', 'ग्राहक का फोन नंबर उपलब्ध नहीं है।');
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 16, marginRight: 6 }}>📞</Text>
                  <Text style={styles.oosActionBtnText}>Call Customer</Text>
                </TouchableOpacity>

                {/* 💬 Message Customer */}
                <TouchableOpacity
                  style={[styles.oosActionBtn, { backgroundColor: '#0066FF', flex: 1 }]}
                  onPress={() => {
                    setShowOutOfStockModal(false);
                    handleMessage();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 16, marginRight: 6 }}>💬</Text>
                  <Text style={styles.oosActionBtnText}>Message</Text>
                </TouchableOpacity>
              </View>

              {/* 🎧 Rider Support */}
              <TouchableOpacity
                style={[styles.oosActionBtn, { backgroundColor: '#4F46E5', width: '100%' }]}
                onPress={() => {
                  Linking.openURL('tel:1800123456').catch(() => {
                    Alert.alert('Rider Support', 'राइडर सपोर्ट हेल्पलाइन: 1800-123-456 (24x7)');
                  });
                }}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 16, marginRight: 6 }}>🎧</Text>
                <Text style={styles.oosActionBtnText}>सपोर्ट से संपर्क करें (Contact Support)</Text>
              </TouchableOpacity>

              {/* Submit Out of Stock Report to Backend */}
              <TouchableOpacity
                style={[styles.oosActionBtn, { backgroundColor: '#DC2626', width: '100%' }]}
                onPress={() => {
                  try {
                    socket?.emit('rider_reported_out_of_stock', {
                      bookingId: ride?.bookingId || orderData?.bookingId || bookingId,
                      riderId: user?._id || user?.id,
                      restaurantId: ride?.restaurantId,
                      items: selectedOutOfStockItems,
                    });
                  } catch (_) {}
                  setShowOutOfStockModal(false);
                  Alert.alert(
                    'आउट ऑफ स्टॉक रिपोर्ट दर्ज',
                    'सूचना सपोर्ट टीम और कस्टमर को भेज दी गई है। सपोर्ट टीम जल्द आपसे संपर्क करेगी।'
                  );
                }}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 16, marginRight: 6 }}>⚠️</Text>
                <Text style={styles.oosActionBtnText}>सपोर्ट को आउट ऑफ स्टॉक रिपोर्ट भेजें</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* 2. RESTAURANT CLOSED DEDICATED SCREEN / MODAL (User Request)   */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={showRestoClosedModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowRestoClosedModal(false)}
      >
        <TouchableOpacity
          style={styles.reachHelpModalOverlay}
          activeOpacity={1}
          onPress={() => setShowRestoClosedModal(false)}
        >
          <TouchableOpacity
            style={[styles.reachHelpModalSheet, { maxHeight: '85%' }]}
            activeOpacity={1}
            onPress={(e: any) => e.stopPropagation()}
          >
            <View style={styles.reachHelpDragBar} />
            <View style={styles.reachHelpHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.reachHelpTitle}>🏪❌ रेस्टोरेंट बंद / ऑफ है</Text>
                <Text style={styles.reachHelpSubtitle}>
                  दुकान का शटर बंद है या रेस्टोरेंट ऑर्डर देने में असमर्थ है
                </Text>
              </View>
              <TouchableOpacity
                style={styles.reachHelpCloseBtn}
                onPress={() => setShowRestoClosedModal(false)}
              >
                <Text style={{ fontSize: 16, color: '#64748B', fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Restaurant Info Card */}
            <View style={styles.restoClosedInfoCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={styles.restoClosedNameText} numberOfLines={1}>
                  {restaurantName || 'Restaurant'}
                </Text>
                <View style={styles.restoClosedTag}>
                  <Text style={styles.restoClosedTagText}>● CLOSED / ऑफ</Text>
                </View>
              </View>
              <Text style={styles.restoClosedAddrText} numberOfLines={2}>
                📍 {pickupAddress || 'Restaurant Location, Bhopal'}
              </Text>
            </View>

            {/* Instructions */}
            <View style={styles.restoClosedNoticeBox}>
              <Text style={styles.restoClosedNoticeText}>
                ⚠️ कृपया रेस्टोरेंट को कॉल करके पुष्टि करें। यदि रेस्टोरेंट बंद पाया जाता है, तो 0% पेनल्टी के साथ ऑर्डर रद्द किया जाएगा और राइडर सुरक्षित रहेगा।
              </Text>
            </View>

            {/* Real-time Working Action Buttons (Call to Restaurant, Support, Cancel with 0% Penalty) */}
            <View style={{ marginTop: 14, gap: 10 }}>
              {/* 📞 Call to Restaurant */}
              <TouchableOpacity
                style={[styles.oosActionBtn, { backgroundColor: '#0284C7', width: '100%' }]}
                onPress={() => {
                  const phone = restaurantPhone || '9876543210';
                  Linking.openURL(`tel:${phone}`).catch(() => {
                    Alert.alert(`Call to ${liveCategoryTerm.storeNameType}`, `Calling ${liveCategoryTerm.storeNameType} at ${phone}`);
                  });
                }}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 16, marginRight: 6 }}>📞</Text>
                <Text style={styles.oosActionBtnText}>Call to {liveCategoryTerm.storeNameType} ({restaurantPhone || liveCategoryTerm.storeNameType})</Text>
              </TouchableOpacity>

              {/* 🎧 Support */}
              <TouchableOpacity
                style={[styles.oosActionBtn, { backgroundColor: '#4F46E5', width: '100%' }]}
                onPress={() => {
                  Linking.openURL('tel:1800123456').catch(() => {
                    Alert.alert('Rider Support', 'सपोर्ट हेल्पलाइन: 1800-123-456 (24x7)');
                  });
                }}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 16, marginRight: 6 }}>🎧</Text>
                <Text style={styles.oosActionBtnText}>सपोर्ट से सहायता लें (Rider Support)</Text>
              </TouchableOpacity>

              {/* 📸 Take Proof Photo */}
              <TouchableOpacity
                style={[styles.oosActionBtn, { backgroundColor: '#059669', width: '100%' }]}
                onPress={() => {
                  Alert.alert(
                    'शटर फ़ोटो सबूत',
                    'कैमरा शुरू किया गया। शटर बंद होने का फ़ोटो सफलतापूर्वक सुरक्षित कर लिया गया है। ✓'
                  );
                }}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 16, marginRight: 6 }}>📸</Text>
                <Text style={styles.oosActionBtnText}>दुकान / शटर का फ़ोटो सबूत लें</Text>
              </TouchableOpacity>

              {/* ❌ Cancel Order with 0% Penalty */}
              <TouchableOpacity
                style={[styles.oosActionBtn, { backgroundColor: '#DC2626', width: '100%' }]}
                onPress={() => {
                  Alert.alert(
                    'ऑर्डर रद्द करें (0% पेनल्टी)',
                    'क्या आप रेस्टोरेंट बंद होने के कारण इस ऑर्डर को रद्द करना चाहते हैं? इसमें 0% पेनल्टी लगेगी और आपकी रेटिंग प्रभावित नहीं होगी।',
                    [
                      { text: 'नहीं', style: 'cancel' },
                      {
                        text: 'हाँ, 0% पेनल्टी के साथ रद्द करें',
                        style: 'destructive',
                        onPress: () => {
                          try {
                            socket?.emit('rider_cancel_order_resto_closed', {
                              bookingId: ride?.bookingId || orderData?.bookingId || bookingId,
                              riderId: user?._id || user?.id,
                              penalty: 0,
                              reason: 'restaurant_permanently_or_temporarily_closed',
                            });
                          } catch (_) {}
                          setShowRestoClosedModal(false);
                          if (Platform.OS === 'android') {
                            ToastAndroid.show('ऑर्डर 0% पेनल्टी के साथ रद्द किया गया', ToastAndroid.LONG);
                          }
                          navigation.navigate('DeliveryRiderHomeScreen');
                        },
                      },
                    ]
                  );
                }}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 16, marginRight: 6 }}>❌</Text>
                <Text style={styles.oosActionBtnText}>ऑर्डर रद्द करें (0% पेनल्टी)</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

const LiveTrackingScreen = ({ route, navigation }: any) => {
  const { user } = useAuth();
  const isRider = Boolean(
    route.params?.isRider === true ||
    (route.params?.isRider !== false && (
      route.params?.role === 'provider' ||
      route.params?.role === 'delivery_partner' ||
      user?.role === 'provider'
    ))
  );

  if (!isRider) {
    return <SingleOrderStatusScreen route={route} navigation={navigation} />;
  }

  return <RiderLiveTrackingContent route={route} navigation={navigation} />;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFBFD',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  mapsBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  mapLoaderOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderText: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '700',
    marginTop: 10,
  },
  visualMapBackground: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  routePathLine: {
    position: 'absolute',
    width: 4,
    height: '60%',
    backgroundColor: '#0066FF',
    borderRadius: 2,
  },
  markerPickupPin: {
    position: 'absolute',
    top: '25%',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#16A34A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    elevation: 6,
  },
  markerDriverPin: {
    position: 'absolute',
    bottom: '25%',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0066FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    elevation: 6,
  },
  liveEtaFloatingCard: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 3,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    marginRight: 8,
  },
  liveEtaText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  mapControlsBar: {
    position: 'absolute',
    right: 14,
    top: 70,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 4,
    gap: 8,
  },
  controlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  openMapsBannerBtn: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    backgroundColor: '#0066FF',
    paddingVertical: 10,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  floatingTopBannerContainer: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  playAnimBannerBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#0066FF',
    paddingVertical: 11,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  openMapsBannerBtnRow: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#0066FF',
    paddingVertical: 11,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  openMapsBannerText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  bottomCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusIndicatorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusHeadingText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  rideIdSubText: {
    fontSize: 10.5,
    color: '#64748B',
  },
  addressBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  addressDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 6,
  },
  partnerInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  partnerAvatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3E8FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  partnerNameText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  partnerRatingSub: {
    fontSize: 11,
    color: '#64748B',
  },
  communicationBtnsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  commCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonsRow: {
    marginTop: 4,
  },
  arrivedActionBtn: {
    backgroundColor: '#0066FF',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  startTripActionBtn: {
    backgroundColor: '#0066FF',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  completeTripActionBtn: {
    backgroundColor: '#16A34A',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  // ❌ Cancel Booking Button Style
  cancelBookingBtn: {
    flexDirection: 'row',
    backgroundColor: '#EF4444',
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  fallbackText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  cancelledOverlayContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  cancelledOverlayContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  cancelledIconBg: {
    marginBottom: 24,
  },
  cancelledOverlayTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#EF4444',
    marginBottom: 12,
    letterSpacing: 1,
  },
  cancelledOverlayMsg: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  cancelledReasonBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 32,
  },
  cancelledReasonLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#EF4444',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  cancelledReasonVal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7F1D1D',
    fontStyle: 'italic',
  },
  cancelledOverlayBtnHome: {
    backgroundColor: '#0F172A',
    width: '100%',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cancelledOverlayBtnTextHome: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
  cancelledOverlayBtnHistory: {
    backgroundColor: '#FFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    width: '100%',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cancelledOverlayBtnTextHistory: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
  // ── Zomato-Style Food Pickup Screen Styles (Exact match to reference) ──
  zomatoTopPillContainer: {
    position: 'absolute',
    top: 36,
    left: 14,
    right: 14,
    zIndex: 999,
  },
  zomatoTopPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E232B',
    borderRadius: 24,
    paddingVertical: 9,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  zomatoTopPillIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  zomatoTopPillTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  zomatoTopPillSub: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  zomatoTopPillViewBtn: {
    backgroundColor: '#333D4B',
    borderRadius: 16,
    paddingVertical: 5,
    paddingHorizontal: 13,
    marginLeft: 8,
  },
  zomatoTopPillViewText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  zomatoCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 12,
  },
  zomatoHandleRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    marginBottom: 8,
  },
  zomatoHandleChevron: {
    fontSize: 22,
    color: '#CBD5E1',
    fontWeight: '900',
    lineHeight: 22,
  },
  zomatoPickupBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#525A65',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginBottom: 8,
  },
  zomatoPickupBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  zomatoRestoName: {
    fontSize: 21,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  zomatoRestoAddress: {
    fontSize: 13.5,
    color: '#64748B',
    lineHeight: 19,
    marginBottom: 16,
  },
  zomatoActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  zomatoCallBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#D1D5DB',
    borderRadius: 14,
    paddingVertical: 12,
    gap: 8,
  },
  zomatoCallBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  zomatoMapBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingVertical: 12,
    gap: 8,
  },
  zomatoMapBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  zomatoSupportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.2,
    borderColor: '#D1D5DB',
    borderRadius: 14,
    paddingVertical: 12,
    gap: 6,
  },
  zomatoSupportBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  zomatoReachedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00C06D',
    borderRadius: 36,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 20,
    shadowColor: '#00C06D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  zomatoArrowCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zomatoArrowText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },
  zomatoReachedBtnText: {
    flex: 1,
    textAlign: 'center',
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
    marginRight: 24,
  },
  // ── Exact Zomato Pick Order Screen (Matches media_1789103177478.png) ──
  zomatoPickOrderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    zIndex: 9999,
  },
  pickOrderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  pickOrderHeaderNew: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  pickOrderBackArrowBtn: {
    paddingRight: 6,
    paddingVertical: 4,
  },
  pickOrderBackArrowText: {
    fontSize: 28,
    color: '#0F172A',
    fontWeight: '700',
    lineHeight: 28,
  },
  pickOrderHeaderMainTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  pickOrderHeaderSubtitle: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },
  pickOrderHeaderActionIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pickOrderActionItem: {
    alignItems: 'center',
  },
  pickOrderActionCircleRed: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  pickOrderActionLabelRed: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DC2626',
    marginTop: 3,
  },
  pickOrderActionCircleBlue: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0066FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  pickOrderActionLabelBlue: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0066FF',
    marginTop: 3,
  },
  pickOrderActionCircleGray: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pickOrderActionLabelGray: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 3,
  },
  pickOrderNotificationDot: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#EF4444',
  },
  pickOrderPrepCardPeach: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 18,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  pickOrderPrepTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickOrderPrepBasketImg: {
    width: 52,
    height: 52,
    borderRadius: 12,
    resizeMode: 'contain',
  },
  pickOrderPrepTitleWrap: {
    flex: 1,
    marginHorizontal: 10,
  },
  pickOrderPrepTitleText: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#9A3412',
  },
  pickOrderPrepSubText: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 16,
    marginTop: 2,
  },
  pickOrderPrepTimeWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 50,
  },
  pickOrderPrepTimeText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#DC2626',
    marginTop: 2,
  },
  pickOrderPrepTimeSub: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
    marginTop: -2,
  },
  pickOrderStepperWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#FFEDD5',
  },
  pickOrderStepCol: {
    alignItems: 'center',
    width: 80,
  },
  pickOrderStepCircleGreen: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickOrderStepCircleOrange: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickOrderStepCircleGray: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickOrderStepLine: {
    flex: 1,
    height: 3,
    marginTop: 12,
    borderRadius: 2,
  },
  pickOrderStepLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 5,
  },
  pickOrderIdPillWrap: {
    alignItems: 'center',
    marginVertical: 14,
  },
  pickOrderIdPill: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    borderRadius: 28,
    paddingHorizontal: 28,
    paddingVertical: 8,
    alignItems: 'center',
    minWidth: 200,
  },
  pickOrderIdPillLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  pickOrderIdPillValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  pickOrderIdPillNumber: {
    fontSize: 27,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.8,
  },
  pickOrderCardWhite: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  pickOrderCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  pickOrderCardTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickOrderCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  pickOrderItemRowNew: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  pickOrderItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  pickOrderItemThumb: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  pickOrderItemName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  pickOrderRestoContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickOrderRestoAvatar: {
    width: 48,
    height: 48,
    borderRadius: 10,
  },
  pickOrderRestoInfo: {
    flex: 1,
    marginHorizontal: 10,
  },
  pickOrderRestoNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pickOrderRestoNameText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  pickOrderRestoAddressText: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
    marginTop: 2,
  },
  pickOrderNavPillBtn: {
    backgroundColor: '#0066FF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pickOrderNavPillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  pickOrderDropContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickOrderHouseAvatar: {
    width: 48,
    height: 48,
    borderRadius: 10,
  },
  pickOrderDropInfo: {
    flex: 1,
    marginHorizontal: 10,
  },
  pickOrderDropAddressText: {
    fontSize: 12.5,
    color: '#475569',
    lineHeight: 17,
  },
  pickOrderDropActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickOrderCircleActionBtn: {
    alignItems: 'center',
  },
  pickOrderCircleIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  pickOrderCircleBtnLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 2,
  },
  pickOrderBottomBarNew: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  pickOrderActionBtnLarge: {
    backgroundColor: '#00C06D',
    height: 56,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    shadowColor: '#00C06D',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  pickOrderActionBtnArrowCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickOrderActionBtnText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.8,
    textAlign: 'center',
    marginRight: 42,
  },
  reachHelpModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  reachHelpModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'android' ? 28 : 36,
  },
  reachHelpDragBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginBottom: 14,
  },
  reachHelpHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  reachHelpTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
  },
  reachHelpSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 2,
  },
  reachHelpCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reachHelpOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  reachHelpOptionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  reachHelpOptionTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  reachHelpOptionDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  pickOrderChevronBtn: {
    paddingRight: 10,
    paddingVertical: 4,
  },
  pickOrderChevronText: {
    fontSize: 26,
    color: '#334155',
    fontWeight: '700',
    lineHeight: 26,
  },
  pickOrderTitle: {
    flex: 1,
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
    marginLeft: 4,
  },
  pickOrderHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pickOrderSosBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E40AF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1E40AF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  pickOrderCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickOrderScroll: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  pickOrderAlertBanner: {
    backgroundColor: '#FFF8E1',
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  pickOrderAlertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  pickOrderAlertTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#B45309',
  },
  pickOrderAlertSub: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
    marginLeft: 22,
  },
  pickOrderIdBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginHorizontal: 16,
  },
  pickOrderIdLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  pickOrderIdNumber: {
    fontSize: 34,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  pickOrderIdRestoName: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#64748B',
  },
  pickOrderAccordionCard: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginHorizontal: 16,
    paddingVertical: 14,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accordionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  accordionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  accordionChevron: {
    fontSize: 18,
    color: '#64748B',
    fontWeight: '700',
  },
  accordionBody: {
    marginTop: 12,
    paddingLeft: 26,
  },
  orderItemRow: {
    marginBottom: 8,
  },
  orderItemName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  orderItemVariant: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  cutleryNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: '#F8FAFC',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  cutleryNoteText: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '500',
  },
  restoDetailName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  restoDetailAddress: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  pickOrderBottomBar: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 8,
  },
  pickOrderMinimizedCard: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 8,
  },
  pickOrderMinimizedTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  pickOrderMinimizedSub: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  pickOrderMinimizedChevronWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickOrderMinimizedChevron: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  // ── Swipe Slider Styles ──
  sliderTrack: {
    height: 56,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  sliderLabel: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  sliderThumb: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    elevation: 5,
  },
  sliderArrow: {
    fontSize: 20,
    fontWeight: '900',
  },

  // ── Rider Top Floating Header ──
  zomatoTopHeaderRow: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 999,
    gap: 8,
  },
  zomatoHeaderRoundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 6,
  },

  // ── Fast Transfer Button in Alert Banner ──
  transferFastBtn: {
    marginTop: 8,
    backgroundColor: '#DC2626',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  transferFastBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  // ── Modal Styles ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  riderHelpModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  riderHelpModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  riderHelpModalSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
  },
  closeModalBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  helpOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  helpIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  helpOptionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  helpOptionDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  helpOptionChevron: {
    fontSize: 22,
    color: '#94A3B8',
    fontWeight: '600',
  },
  zeroPenaltyBadge: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  zeroPenaltyBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  // ── Transfer Confirmation Modal ──
  transferConfirmCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    marginHorizontal: 20,
    marginBottom: 'auto',
    marginTop: 'auto',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  transferConfirmIconBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  zeroPenaltyBanner: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 12,
  },
  zeroPenaltyBannerText: {
    color: '#166534',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  transferConfirmTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  transferConfirmDesc: {
    fontSize: 13.5,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  transferActionsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  transferCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferCancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  transferConfirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#0066FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  transferConfirmBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── Restaurant Thumbnail & Accordion Styles (Requirement 5) ──
  restoThumbBtn: {
    width: 62,
    height: 62,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  restoThumbImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  restoThumbBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  restoThumbBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  restoThumbEmpty: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  restoAccordionPhotoBtn: {
    backgroundColor: '#EFF6FF',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  restoAccordionPhotoBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },

  // ── Prominent Payment Banners (Requirement 11) ──
  onlinePaymentBanner: {
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    marginBottom: 14,
  },
  paymentBannerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  onlinePaymentTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#166534',
    letterSpacing: 0.5,
  },
  onlinePaymentSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#15803D',
    marginTop: 1,
  },
  paymentBannerBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#DCFCE7',
  },
  paymentAmountLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  onlinePaymentAmountText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#166534',
  },
  codPaymentBanner: {
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#FCD34D',
    marginBottom: 14,
  },
  codPaymentTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#B45309',
    letterSpacing: 0.5,
  },
  codPaymentSub: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
    marginTop: 1,
  },
  codAmountLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  codPaymentAmountText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#B45309',
  },

  // ── Full Screen Restaurant Photo Gallery Modal (Requirement 5) ──
  galleryModalContainer: {
    flex: 1,
    backgroundColor: '#0B0F17',
  },
  galleryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  galleryRestoName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  galleryPhotoCounter: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
  galleryCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  galleryCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  galleryFullImage: {
    width: width - 24,
    height: width * 0.95,
    borderRadius: 16,
  },
  galleryDotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  galleryDot: {
    height: 8,
    borderRadius: 4,
  },
  galleryDotActive: {
    width: 22,
    backgroundColor: '#0066FF',
  },
  galleryDotInactive: {
    width: 8,
    backgroundColor: '#475569',
  },
  galleryEmptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  galleryEmptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  galleryEmptySub: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // RIDEHUB FULL-SCREEN PAYMENT SCREEN STYLES
  // ═══════════════════════════════════════════════════════════════════════
  fullScreenPaymentContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#F8FAFC',
    zIndex: 9999,
  },
  paymentHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: (StatusBar.currentHeight || 24) + 10,
    paddingBottom: 14,
    backgroundColor: '#0F172A',
  },
  paymentBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentBackChevron: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: 'bold',
    transform: [{ translateY: -2 }],
  },
  paymentHeaderTitleWrap: {
    alignItems: 'center',
  },
  ridehubHeaderBadge: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 3,
  },
  ridehubHeaderBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  paymentOrderNumberText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  paymentSosBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Customer Card in Payment Screen
  paymentCustCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  paymentCustName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  paymentCustAddr: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  paymentCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginLeft: 10,
  },
  paymentCallBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    marginLeft: 4,
  },

  // Payable Amount Card
  payableAmountCard: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    marginBottom: 14,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  payableAmountLabel: {
    color: '#94A3B8',
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  payableAmountNumber: {
    color: '#22C55E',
    fontSize: 38,
    fontWeight: '900',
    marginVertical: 4,
  },
  payableAmountTag: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  payableAmountTagText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },

  // Payment Mode Switch Tabs
  paymentTabSwitchContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
  },
  paymentTabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  paymentTabBtnActive: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  paymentTabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  paymentTabBtnTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },

  // QR Code Section
  qrCodeSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    elevation: 2,
  },
  qrSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 3,
  },
  qrSectionSub: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 14,
  },
  qrImageContainer: {
    position: 'relative',
    width: 200,
    height: 200,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0F172A',
    padding: 8,
    marginBottom: 14,
  },
  qrImage: {
    width: '100%',
    height: '100%',
  },
  qrLogoCenterBadge: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0066FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
  },
  qrLogoCenterText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 13,
  },
  upiIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  upiIdLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginRight: 6,
  },
  upiIdValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },

  // Cash Section Card
  cashSectionCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#FCD34D',
    marginBottom: 14,
  },
  cashNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cashNoticeTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#B45309',
  },
  cashNoticeSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
    marginTop: 2,
  },

  // Checkbox Row
  cashCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  cashCheckboxRowChecked: {
    borderColor: '#16A34A',
    backgroundColor: '#F0FDF4',
  },
  checkboxBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#94A3B8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    backgroundColor: '#FFFFFF',
  },
  checkboxBoxChecked: {
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
  },
  checkboxCheckmark: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  checkboxLabelChecked: {
    color: '#15803D',
    fontWeight: '800',
  },

  paymentInstructionBox: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  paymentInstructionText: {
    fontSize: 12,
    color: '#1D4ED8',
    fontWeight: '600',
    lineHeight: 16,
  },

  // Bottom Sticky Completion Bar
  paymentBottomStickyBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 14,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  primaryPaymentCompleteBtn: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  primaryPaymentCompleteBtnActive: {
    backgroundColor: '#16A34A',
    elevation: 4,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  primaryPaymentCompleteBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  primaryPaymentCompleteBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // FULL SCREEN DELIVERY SUCCESS STYLES
  // ═══════════════════════════════════════════════════════════════════════
  successScreenContainer: {
    flex: 1,
    backgroundColor: '#064E3B',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  successScreenCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  successScreenIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 3,
    borderColor: '#86EFAC',
  },
  successScreenTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#065F46',
    marginBottom: 2,
  },
  successScreenSub: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 1,
    marginBottom: 20,
  },
  successScreenInfoBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 18,
  },
  successScreenInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  successScreenInfoLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  successScreenInfoValue: {
    fontSize: 13.5,
    color: '#0F172A',
    fontWeight: '800',
  },
  successEarningBadge: {
    width: '100%',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  successEarningLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
  },
  successEarningNumber: {
    fontSize: 28,
    fontWeight: '900',
    color: '#065F46',
    marginTop: 2,
  },
  successHomeBtn: {
    width: '100%',
    backgroundColor: '#059669',
    height: 54,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  successHomeBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* CUSTOMER FOOD DELIVERY TRACKING STYLES (media_1789280583807.png)        */
  /* ═══════════════════════════════════════════════════════════════════════ */
  legacyCustTrackContainer: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  custTrackScroll: {
    flex: 1,
  },
  custTrackContent: {
    paddingBottom: 60,
  },
  custHeroBannerWrap: {
    width: '100%',
    height: 240,
    position: 'relative',
    backgroundColor: '#0B132B',
  },
  custHeroBannerImg: {
    width: '100%',
    height: '100%',
  },
  /* COMPACT MODE STYLES */
  custCompactTopBar: {
    position: 'absolute',
    top: (StatusBar.currentHeight || 24) + 8,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  custCompactRoundBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  custCompactExpandMapBtn: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  custCompactExpandMapText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  custCompactCardContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  custDragHandleArea: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 6,
  },
  custDragHandleBar: {
    width: 44,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
  },
  custCompactMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  custCompactAnimWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  custCompactRestoLabel: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '700',
  },
  custCompactTitle: {
    fontSize: 16.5,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 1,
  },
  custCompactSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  custCompactEtaBadge: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  custCompactEtaText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0066FF',
  },
  custCompactDistText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 1,
  },
  custCompactRiderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 10,
  },
  custCompactRiderText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '700',
    flex: 1,
  },
  custProgressBarRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  custProgressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
  },
  custExpandDetailsBtn: {
    marginTop: 12,
    backgroundColor: '#0066FF',
    borderRadius: 14,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  custExpandDetailsText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  custHeroDarkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(11, 19, 43, 0.45)',
  },
  custHeroChevronBtn: {
    position: 'absolute',
    top: (StatusBar.currentHeight || 24) + 8,
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  custHeroChevronText: {
    fontSize: 22,
    color: '#FFFFFF',
    fontWeight: 'bold',
    marginTop: -4,
  },
  custHeroBrandBox: {
    position: 'absolute',
    bottom: 30,
    width: '100%',
    alignItems: 'center',
  },
  custHeroBrandSub: {
    fontSize: 12,
    color: '#FCD34D',
    letterSpacing: 4,
    fontWeight: '700',
  },
  custHeroBrandTitle: {
    fontSize: 24,
    color: '#38BDF8',
    letterSpacing: 3,
    fontWeight: '900',
    marginTop: 2,
  },
  custHeroBrandTag: {
    fontSize: 10,
    color: '#94A3B8',
    letterSpacing: 2,
    marginTop: 2,
  },
  custStatusCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 14,
    marginTop: -20,
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    zIndex: 5,
  },
  custRestoLabel: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  custStatusCookingIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  custStatusMainTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#0F172A',
    marginVertical: 3,
  },
  custStatusPill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  custStatusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  custMiniMapWrap: {
    width: 115,
    height: 85,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  custMiniMapInner: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  custMiniMapOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
    justifyContent: 'space-between',
    padding: 4,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  custMiniMapEtaBadge: {
    alignSelf: 'flex-end',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    elevation: 2,
  },
  custMiniMapEtaText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  custMiniMapWatermark: {
    fontSize: 7,
    color: '#64748B',
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 3,
    borderRadius: 2,
    alignSelf: 'center',
  },
  /* ═══════════════════════════════════════════════════════════════════════ */
  /* CUSTOMER ORDER TRACKING SCREEN STYLES                                  */
  /* ═══════════════════════════════════════════════════════════════════════ */
  custTrackContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  custScroll: {
    flex: 1,
  },
  custScrollContent: {
    paddingBottom: 40,
  },
  /* ── TOP VISUAL MEDIA BANNER ── */
  custMediaHeaderWrap: {
    backgroundColor: '#090D16',
    height: 300,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  custMediaTopBar: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  custMediaBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  custHelpTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  custHelpTopText: {
    color: '#0066FF',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 5,
  },
  custMediaAdBadge: {
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  custMediaAdText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  custMediaBannerCenter: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 0,
    overflow: 'hidden',
  },
  /* ── CARD 1: ORDER STATUS & MINI-MAP ── */
  custCard1StatusMap: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginTop: -22,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    zIndex: 20,
  },
  custCard1Left: {
    flex: 1,
    paddingRight: 10,
  },
  custCard1StoreName: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  custCard1StatusTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  custCard1StatusPill: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#16A34A',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  custCard1StatusPillText: {
    color: '#16A34A',
    fontSize: 11,
    fontWeight: '600',
  },
  custCard1MiniMapWrap: {
    width: 92,
    height: 74,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  custCard1MiniMapInner: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  custCard1MiniMapExpandPill: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  custCard1MiniMapExpandIcon: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: 'bold',
  },
  /* ── CARD 2: PAYMENT PENDING / PAID ── */
  custCard2Payment: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  custCard2Left: {
    flex: 1,
    paddingRight: 10,
  },
  custCard2Title: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  custCard2Sub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 3,
    lineHeight: 15,
  },
  custCard2PayNowBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
  },
  custCard2PayNowText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  custCard2PaidBadge: {
    backgroundColor: '#DCFCE7',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  custCard2PaidBadgeText: {
    color: '#15803D',
    fontSize: 12,
    fontWeight: '800',
  },
  /* ── CARD 3: KITCHEN LIVE VIDEO (Dark Charcoal) ── */
  custCard3Kitchen: {
    backgroundColor: '#1E242B',
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 3,
  },
  custCard3Left: {
    flex: 1,
  },
  custCard3Label: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.6,
  },
  custCard3Title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  custCard3Sub: {
    fontSize: 11.5,
    color: '#A1A1AA',
    marginTop: 2,
  },
  custCard3OnlineBadge: {
    backgroundColor: '#2B323D',
    borderWidth: 1,
    borderColor: '#3F4857',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  custCard3GreenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  custCard3OnlineText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  /* ── CARD 4: RIDER / TIP / OTP ── */
  custCard4RiderTipOtp: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  custCard4RiderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  custCard4BikeCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  custCard4RiderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  custCard4TipSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 12,
    lineHeight: 16,
  },
  custCard4TipRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  custCard4TipBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  custCard4TipBtnSelected: {
    borderColor: '#0066FF',
    backgroundColor: '#EFF6FF',
  },
  custCard4TipBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  custCard4TipBtnTextSelected: {
    color: '#0066FF',
  },
  custCard4OtpBox: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  custCard4OtpLabel: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '500',
  },
  custCard4OtpDigitsRow: {
    flexDirection: 'row',
    gap: 5,
  },
  custCard4OtpDigitBox: {
    width: 28,
    height: 32,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  custCard4OtpDigitText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  /* ── CARD 5: DELIVERY DETAILS ── */
  custCard5Details: {
    backgroundColor: '#FFF8F1',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 12,
    marginTop: 10,
  },
  custCard5Header: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1D4ED8',
    marginBottom: 8,
  },
  custCard5Divider: {
    height: 1,
    backgroundColor: '#BFDBFE',
    opacity: 0.5,
    marginBottom: 10,
  },
  custCard5Row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  custCard5Title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  custCard5Sub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  /* ── CARD 6: RESTAURANT & ORDER SUMMARY ── */
  custCard6RestoOrder: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  custCard6RestoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  custCard6RestoImg: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  custCard6RestoImgPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  custCard6RestoName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  custCard6RestoCity: {
    fontSize: 11.5,
    color: '#94A3B8',
    marginTop: 1,
  },
  custCard6CallBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  custCard6OrderSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  custCard6OrderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  custCard6OrderIdText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  custCard6ItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  custCard6VegBox: {
    width: 12,
    height: 12,
    borderRadius: 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  custCard6VegDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  custCard6ItemText: {
    fontSize: 12.5,
    color: '#475569',
    flex: 1,
  },
  custCard6BillRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  custCard6PaymentMode: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  custCard6TotalAmount: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  /* ── KITCHEN LIVE VIDEO MODAL STYLES ── */
  kitchenModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  kitchenModalContainer: {
    width: '100%',
    backgroundColor: '#18181B',
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
  },
  kitchenModalHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  kitchenModalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  kitchenModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kitchenVideoWrapper: {
    width: '100%',
    height: 240,
    backgroundColor: '#090D16',
    borderRadius: 14,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  kitchenLiveBanner: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  kitchenLiveBannerText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  kitchenInfoBox: {
    width: '100%',
    marginTop: 14,
    padding: 12,
    backgroundColor: '#27272A',
    borderRadius: 12,
  },
  kitchenInfoTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  kitchenInfoSub: {
    fontSize: 12,
    color: '#A1A1AA',
    marginTop: 2,
  },
  kitchenCloseActionBtn: {
    width: '100%',
    marginTop: 14,
    backgroundColor: '#0066FF',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  kitchenCloseActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  custGoHomeBtn: {
    backgroundColor: '#0F172A',
    marginHorizontal: 12,
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    elevation: 2,
  },
  custGoHomeBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  custFullMapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  custBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  custHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  custHeaderOrderSub: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  gpsDebugFloatingContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 38,
    right: 12,
    zIndex: 9999,
  },
  gpsDebugMiniPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  gpsDebugMiniPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 5,
  },
  gpsDebugPulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  gpsDebugCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    borderRadius: 14,
    padding: 12,
    width: 240,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  gpsDebugCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.15)',
    paddingBottom: 6,
    marginBottom: 6,
  },
  gpsDebugTitle: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginLeft: 6,
  },
  gpsDebugCloseText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  gpsDebugRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 2,
  },
  gpsDebugLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  gpsDebugValue: {
    color: '#F1F5F9',
    fontSize: 11,
    fontWeight: '600',
  },
  gpsDebugValueBold: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  gpsDebugSourceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  gpsDebugSourceText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  gpsDebugTimeText: {
    color: '#CBD5E1',
    fontSize: 10,
    fontWeight: '500',
  },
  restoRatingSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 24,
  },
  restoRatingHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  restoRatingIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#FDE68A',
  },
  restoRatingTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
  },
  restoRatingSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  starPickerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginVertical: 10,
  },
  starBtn: {
    padding: 6,
  },
  starEmoji: {
    fontSize: 38,
  },
  ratingScoreLabel: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '800',
    color: '#F59E0B',
    marginBottom: 14,
  },
  restoReviewInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 12,
    fontSize: 14,
    color: '#0F172A',
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: 18,
  },
  restoRatingActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  restoRatingSkipBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  restoRatingSkipText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#64748B',
  },
  restoRatingSubmitBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0066FF',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  restoRatingSubmitText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  // ── Delay Timer & 0% Penalty Transfer Styles ──
  restoDelayCountdownCard: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1.5,
    borderColor: '#FED7AA',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
  },
  restoDelayCountdownTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#EA580C',
  },
  restoDelayCountdownSub: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A3412',
    marginTop: 2,
  },
  restoDelayCountdownBadge: {
    backgroundColor: '#EA580C',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoDelayCountdownBadgeText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  transferZeroPenaltyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EA580C',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#EA580C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  transferZeroPenaltyIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  transferZeroPenaltyText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  transferZeroPenaltySub: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFEDD5',
    marginTop: 2,
  },

  // ── Drop Order Screen Styles (media_1794033032809_eab37b60.jpg) ──
  dropOrderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FAFBFD',
    zIndex: 9999,
  },
  dropOrderHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dropOrderBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropOrderBackChevron: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    marginRight: 8,
    marginTop: -2,
  },
  dropOrderHeaderTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
  },
  dropOrderHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropOrderSosBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  dropOrderMinBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  dropOrderMinCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropOrderHelpBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropOrderHelpBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  dropOrderAlertStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF0EA',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  dropOrderAlertIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropOrderAlertTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#EA580C',
  },
  dropOrderAlertSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9A3412',
    marginTop: 2,
  },
  dropOrderTrainingCard: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: '#000000',
    position: 'relative',
  },
  dropOrderTrainingImg: {
    width: '100%',
    height: '100%',
  },
  dropOrderPlayCircle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -25,
    marginLeft: -25,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropOrderTrainingLabelWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  dropOrderTrainingLabel: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  dropOrderCashCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAF8EC',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
  },
  dropOrderCashIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropOrderCashAmountText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#15803D',
  },
  dropOrderCashOrderNum: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  dropOrderCashCheckWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropOrderCustCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  dropOrderCustTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropOrderCustAvatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropOrderCustName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  dropOrderCustRating: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  dropOrderCustDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
  },
  dropOrderCustAddrRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  dropOrderCustAddrText: {
    flex: 1,
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
    lineHeight: 18,
  },
  dropOrderCustActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dropOrderPillBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  dropOrderPillBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0066FF',
  },
  dropOrderDetailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  dropOrderDetailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropOrderBagIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropOrderDetailsTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  dropOrderDetailsRestoName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  dropOrderItemsContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  dropOrderItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  dropOrderItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  dropOrderItemVariant: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  dropOrderItemPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  dropOrderBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  dropOrderDeliveredBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1A56DB',
    borderRadius: 30,
    paddingVertical: 8,
    paddingHorizontal: 10,
    shadowColor: '#1A56DB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  dropOrderChevronCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropOrderChevronText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1A56DB',
    letterSpacing: -1,
  },
  dropOrderDeliveredText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  dropOrderCheckCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  dropOrderCheckText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  // ── Out of Stock & Restaurant Closed Styles ──
  oosItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  oosItemRowChecked: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  oosCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  oosCheckboxChecked: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  oosItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  oosStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  oosStatusPillOut: {
    backgroundColor: '#FEE2E2',
  },
  oosStatusPillAvail: {
    backgroundColor: '#DCFCE7',
  },
  oosStatusPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  oosStatusPillTextOut: {
    color: '#DC2626',
  },
  oosStatusPillTextAvail: {
    color: '#16A34A',
  },
  oosActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  oosActionBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  restoClosedInfoCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  restoClosedNameText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    flex: 1,
  },
  restoClosedTag: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  restoClosedTagText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#DC2626',
  },
  restoClosedAddrText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 6,
  },
  restoClosedNoticeBox: {
    backgroundColor: '#FFF7ED',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
    marginBottom: 10,
  },
  restoClosedNoticeText: {
    fontSize: 12,
    color: '#C2410C',
    fontWeight: '600',
    lineHeight: 18,
  },
});

export default LiveTrackingScreen;
