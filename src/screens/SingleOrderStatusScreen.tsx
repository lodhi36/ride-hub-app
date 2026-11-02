import React, { useState, useEffect, useRef, useMemo, useContext, useCallback } from 'react';
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
  ScrollView,
  Modal,
  BackHandler,
  Animated,
  Easing,
  TextInput,
  Platform,
} from 'react-native';
import WebView from 'react-native-webview';
const WebViewComponent = WebView as any;
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from '../components/PngIcon';
import { useSocket } from '../context/SocketContext';
import { AuthContext } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { BASE_URL } from '../config/apiConfig';
import api, { UPLOADS_URL } from '../services/api';
import { resolveCategoryName, getCategoryPlaceholderImage, getCategoryLabel, getCategoryTotalLabel } from '../utils/categoryHelper';
import { bikeBase64 } from '../banner/base64_images';

const { width, height } = Dimensions.get('window');
const SCREEN_WIDTH = width;
const SCREEN_HEIGHT = height;
const EXPANDED_VIDEO_HEIGHT = Math.round(SCREEN_HEIGHT * 0.48);

interface SingleOrderStatusScreenProps {
  route: any;
  navigation: any;
}

export const SingleOrderStatusScreen: React.FC<SingleOrderStatusScreenProps> = ({ route, navigation }) => {
  const { user } = useContext(AuthContext);
  const { isDark, currentColors } = useTheme();
  const { socket } = useSocket();

  const initialRide = route.params?.ride || route.params?.activeFoodOrder || route.params?.order || {};
  const bookingId =
    route.params?.bookingId ||
    route.params?.rideId ||
    initialRide.bookingId ||
    initialRide.rideId ||
    initialRide._id ||
    initialRide.id;

  // Real Order State
  const [order, setOrder] = useState<any>(initialRide);
  const [loading, setLoading] = useState<boolean>(!initialRide?.status);
  const [status, setStatus] = useState<string>(initialRide.status || 'RINGING');
  const [cancelling, setCancelling] = useState<boolean>(false);
  const [cancelModalVisible, setCancelModalVisible] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>('Change of plans');
  const [mapModalVisible, setMapModalVisible] = useState<boolean>(false);
  const mapWebViewRef = useRef<any>(null);
  const latestRiderLocRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const [selectedTip, setSelectedTip] = useState<number | string | null>(null);
  const [liveStoreProfile, setLiveStoreProfile] = useState<any>(null);

  // ── Rating Flow State ──
  const [ratingTarget, setRatingTarget] = useState<'restaurant' | 'rider'>('restaurant');
  const [restaurantStars, setRestaurantStars] = useState<number>(0);
  const [riderStars, setRiderStars] = useState<number>(0);
  const [restaurantFeedback, setRestaurantFeedback] = useState<string>('');
  const [riderFeedback, setRiderFeedback] = useState<string>('');
  const [submittingRating, setSubmittingRating] = useState<boolean>(false);
  const [restaurantRated, setRestaurantRated] = useState<boolean>(false);
  const [riderRated, setRiderRated] = useState<boolean>(false);

  // Subtle pulsing animation for current active timeline step indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseGlowAnim = useRef(new Animated.Value(0.4)).current;

  // Collapsible Background Video Scroll Animation
  const scrollY = useRef(new Animated.Value(0)).current;

  const videoScale = scrollY.interpolate({
    inputRange: [-160, 0],
    outputRange: [1.35, 1],
    extrapolateRight: 'clamp',
  });

  const videoTranslateY = scrollY.interpolate({
    inputRange: [-160, 0, EXPANDED_VIDEO_HEIGHT],
    outputRange: [0, 0, -EXPANDED_VIDEO_HEIGHT * 0.75],
    extrapolate: 'clamp',
  });

  const videoOpacity = scrollY.interpolate({
    inputRange: [0, EXPANDED_VIDEO_HEIGHT * 0.65, EXPANDED_VIDEO_HEIGHT],
    outputRange: [1, 0.4, 0],
    extrapolate: 'clamp',
  });

  // Smoothly hide back & help icons on scroll up
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 40, 90],
    outputRange: [1, 0.3, 0],
    extrapolate: 'clamp',
  });

  const headerTranslateY = scrollY.interpolate({
    inputRange: [0, 90],
    outputRange: [0, -25],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(pulseGlowAnim, {
            toValue: 0.1,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseGlowAnim, {
            toValue: 0.45,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [pulseAnim, pulseGlowAnim]);

  const bgVideoRef = useRef<any>(null);

  // Decoupled Video Lifecycle: Pause background video when Map modal is open to give 100% GPU to Live GPS Map
  useEffect(() => {
    if (mapModalVisible) {
      bgVideoRef.current?.injectJavaScript('var v=document.getElementById("bgvid"); if(v) v.pause(); true;');
    } else {
      bgVideoRef.current?.injectJavaScript('var v=document.getElementById("bgvid"); if(v) v.play().catch(function(){}); true;');
    }
  }, [mapModalVisible]);

  // Pause video on screen blur / navigate away; resume on focus
  useFocusEffect(
    useCallback(() => {
      bgVideoRef.current?.injectJavaScript('var v=document.getElementById("bgvid"); if(v) v.play().catch(function(){}); true;');
      return () => {
        bgVideoRef.current?.injectJavaScript('var v=document.getElementById("bgvid"); if(v) v.pause(); true;');
      };
    }, [])
  );

  useEffect(() => {
    const pOrder = route.params?.ride || route.params?.activeFoodOrder || route.params?.order;
    if (pOrder) {
      setOrder(pOrder);
      if (pOrder.status) {
        setStatus(pOrder.status.toUpperCase());
      }
    }
  }, [route.params]);

  // Fetch Authoritative Real Restaurant Profile from MongoDB
  useEffect(() => {
    const storeId = order.restaurantId || order.providerId || order.sellerId || route.params?.restaurantId;
    if (!storeId || storeId === 'undefined' || storeId === 'null') return;

    let isMounted = true;
    const fetchStore = async () => {
      try {
        const res = await api.get(`/profile/${storeId}`).catch(() => null);
        if (isMounted && res?.data?.success && res.data.profile) {
          setLiveStoreProfile(res.data.profile);
        } else {
          const availRes = await api.get(`/profile/restaurant-availability/${storeId}`).catch(() => null);
          if (isMounted && availRes?.data?.success) {
            setLiveStoreProfile(availRes.data);
          }
        }
      } catch (e) {}
    };
    fetchStore();
    return () => { isMounted = false; };
  }, [order.restaurantId, order.providerId, order.sellerId]);

  // Helper to extract clean Rider Profile from any backend payload or order object
  const extractRiderFromData = (rawData: any) => {
    if (!rawData) return null;
    if (rawData.rider || rawData.acceptedBy) {
      const base = rawData.rider || rawData.acceptedBy;
      return {
        _id: String(base._id || base.id || base.riderId || rawData.riderId || ''),
        id: String(base.id || base._id || base.riderId || rawData.riderId || ''),
        riderId: String(base.riderId || base._id || base.id || rawData.riderId || ''),
        name: base.name || rawData.riderName || rawData.driverName || 'Delivery Partner',
        phone: base.phone || base.phoneNumber || rawData.riderPhone || rawData.driverPhone || '',
        phoneNumber: base.phoneNumber || base.phone || rawData.riderPhone || rawData.driverPhone || '',
        photo: base.photo || base.profilePicture || rawData.riderPhoto || null,
        profilePicture: base.profilePicture || base.photo || rawData.riderPhoto || null,
        vehicleNumber: base.vehicleNumber || rawData.riderVehicleNumber || '',
        vehicleType: base.vehicleType || rawData.riderVehicleType || 'Bike',
        rating: Number(base.rating || rawData.riderRating || 4.9),
        location: base.location || (base.latitude && base.longitude ? { latitude: Number(base.latitude), longitude: Number(base.longitude) } : null),
      };
    }
    if (rawData.riderId) {
      return {
        _id: String(rawData.riderId),
        id: String(rawData.riderId),
        riderId: String(rawData.riderId),
        name: rawData.riderName || rawData.driverName || 'Delivery Partner',
        phone: rawData.riderPhone || rawData.driverPhone || '',
        phoneNumber: rawData.riderPhone || rawData.driverPhone || '',
        photo: rawData.riderPhoto || null,
        profilePicture: rawData.riderPhoto || null,
        vehicleNumber: rawData.riderVehicleNumber || rawData.vehicleNumber || '',
        vehicleType: rawData.riderVehicleType || rawData.vehicleType || 'Bike',
        rating: Number(rawData.riderRating || 4.9),
        location: rawData.riderLocation || (rawData.riderLatitude && rawData.riderLongitude ? { latitude: Number(rawData.riderLatitude), longitude: Number(rawData.riderLongitude) } : null),
      };
    }
    return null;
  };

  // Rider Live State
  const [riderInfo, setRiderInfo] = useState<any>(() => extractRiderFromData(initialRide));
  const [riderLocation, setRiderLocation] = useState<{ latitude: number; longitude: number } | null>(() => {
    const r = extractRiderFromData(initialRide);
    if (r?.location?.latitude && r?.location?.longitude) return r.location;
    if (initialRide.driverLat && initialRide.driverLon) return { latitude: Number(initialRide.driverLat), longitude: Number(initialRide.driverLon) };
    return null;
  });

  // Sync rider whenever order object updates
  useEffect(() => {
    const resolved = extractRiderFromData(order);
    if (resolved) {
      setRiderInfo(resolved);
      if (resolved.location) {
        setRiderLocation(resolved.location);
      }
    }
  }, [order]);

  // Fetch full rider profile from MongoDB if details need enrichment
  useEffect(() => {
    const targetRiderId = riderInfo?.riderId || riderInfo?._id || riderInfo?.id || order.riderId;
    if (!targetRiderId || targetRiderId === 'undefined' || targetRiderId === 'null') return;

    let isMounted = true;
    const fetchRiderProf = async () => {
      try {
        const res = await api.get(`/profile/${targetRiderId}`).catch(() => null);
        if (isMounted && res?.data?.success && res.data.profile) {
          const prof = res.data.profile;
          setRiderInfo((prev: any) => ({
            ...(prev || {}),
            _id: String(prof._id || targetRiderId),
            riderId: String(prof._id || targetRiderId),
            name: prof.name || prof.username || prev?.name || 'Delivery Partner',
            phone: prof.phoneNumber || prof.phone || prev?.phone || '',
            phoneNumber: prof.phoneNumber || prof.phone || prev?.phoneNumber || '',
            photo: prof.profilePicture || prof.avatar || prev?.photo || null,
            profilePicture: prof.profilePicture || prof.avatar || prev?.profilePicture || null,
            vehicleNumber: prof.vehicleNumber || prof.vehicle_number || prev?.vehicleNumber || '',
            vehicleType: prof.vehicleType || prev?.vehicleType || 'Bike',
            rating: Number(prof.rating || prev?.rating || 4.9),
          }));
          if (prof.latitude && prof.longitude) {
            setRiderLocation({
              latitude: Number(prof.latitude),
              longitude: Number(prof.longitude),
            });
          }
        }
      } catch (e) {}
    };
    fetchRiderProf();
    return () => { isMounted = false; };
  }, [riderInfo?.riderId, order.riderId]);

  // Back Button Handling: Safely navigate to CustomerHomeScreen without getting stuck in loop
  useEffect(() => {
    const handleBack = () => {
      if (mapModalVisible) {
        setMapModalVisible(false);
        return true;
      }
      if (navigation.reset) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'CustomerHomeScreen' }],
        });
      } else {
        navigation.navigate('CustomerHomeScreen');
      }
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => sub.remove();
  }, [navigation, mapModalVisible]);

  // Fetch Full Order Details from Backend
  const fetchOrderDetails = async () => {
    if (!bookingId) return;
    try {
      let res = await api.get(`/bookings/${bookingId}`).catch(() => null);
      if (!res || !res.data?.success) {
        res = await api.get(`/rides/${bookingId}`).catch(() => null);
      }
      if (res && res.data) {
        const rawData = res.data.booking || res.data.ride || res.data.data || res.data;
        if (rawData) {
          setOrder(rawData);
          if (rawData.status) {
            setStatus(rawData.status.toUpperCase());
          }
          const parsedR = extractRiderFromData(rawData);
          if (parsedR) {
            setRiderInfo(parsedR);
            if (parsedR.location) {
              setRiderLocation(parsedR.location);
            }
          }
        }
      }
    } catch (e: any) {
      console.log('[SingleOrderStatus] Fetch error:', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderDetails();
    const interval = setInterval(fetchOrderDetails, 10000); // Polling backup
    return () => clearInterval(interval);
  }, [bookingId]);

  // Realtime Socket Listeners
  useEffect(() => {
    if (!socket || !bookingId) return;

    const bIdStr = String(bookingId);
    socket.emit('join_room', `booking_${bIdStr}`);
    socket.emit('join_room', `ride_${bIdStr}`);
    socket.emit('join_room', `order_${bIdStr}`);

    const handleStatusUpdate = (data: any) => {
      if (!data) return;
      const targetId = String(data.bookingId || data.rideId || data.orderId || data._id || '');
      if (targetId && targetId !== bIdStr) return;

      console.log('⚡ [SingleOrderStatus] Status update event received:', data.status);
      if (data.status) {
        const nextSt = data.status.toUpperCase();
        setStatus((prevSt: string) => {
          if (prevSt === 'CANCELLED' && nextSt !== 'CANCELLED') {
            console.log(`🛡️ [SingleOrderStatus] Blocked stale status "${nextSt}" on CANCELLED order.`);
            return prevSt;
          }
          return nextSt;
        });

        // Inform Leaflet map immediately of status transition and route
        if (mapWebViewRef.current) {
          const isPk = Boolean(nextSt === 'OUT_FOR_DELIVERY' || nextSt === 'IN_TRANSIT' || nextSt === 'PICKED_UP');
          const isSuppAcc = Boolean(nextSt === 'RESTAURANT_ACCEPTED' || nextSt === 'PREPARING' || nextSt === 'FOOD_READY' || nextSt === 'ACCEPTED');
          mapWebViewRef.current.injectJavaScript(`
            if (window.setPickedUpStatus) {
              window.setPickedUpStatus(${isPk});
            }
            if (${isSuppAcc} && window.updateSupplierAcceptedRoute) {
              window.updateSupplierAcceptedRoute(${storeCoords.latitude}, ${storeCoords.longitude}, ${customerCoords.latitude}, ${customerCoords.longitude});
            }
            true;
          `);
        }
      }
      const parsedR = extractRiderFromData(data) || extractRiderFromData(data.booking);
      if (parsedR) {
        setRiderInfo(parsedR);
      }
      const lat = Number(data.riderLocation?.latitude || data.latitude || (parsedR?.location?.latitude) || 0);
      const lon = Number(data.riderLocation?.longitude || data.longitude || (parsedR?.location?.longitude) || 0);
      if (lat > 0 && lon > 0) {
        latestRiderLocRef.current = { latitude: lat, longitude: lon };
        setRiderLocation({ latitude: lat, longitude: lon });
        if (mapWebViewRef.current) {
          mapWebViewRef.current.injectJavaScript(`
            if (window.updateRiderLiveGPS) {
              window.updateRiderLiveGPS(${lat}, ${lon}, 0);
            }
            true;
          `);
        }
      }
      // Re-fetch to guarantee complete fresh state
      fetchOrderDetails();
    };

    const handleRiderLocation = (data: any) => {
      if (!data) return;
      const targetId = String(data.bookingId || data.rideId || data.orderId || '');
      const incomingRiderId = String(data.riderId || data.providerId || '');
      const currentRiderId = String(riderInfo?.riderId || riderInfo?._id || order.riderId || '');

      if (targetId && bIdStr && targetId !== bIdStr) return;
      if (incomingRiderId && currentRiderId && incomingRiderId !== currentRiderId) return;

      console.log('📍 [SingleOrderStatus] Live Rider Location Update:', data);
      const lat = Number(data.location?.latitude || data.latitude || data.driverLat || 0);
      const lon = Number(data.location?.longitude || data.longitude || data.driverLon || 0);
      const heading = Number(data.heading || 0);

      if (lat > 0 && lon > 0) {
        latestRiderLocRef.current = { latitude: lat, longitude: lon };
        setRiderLocation({
          latitude: lat,
          longitude: lon,
        });

        // ⚡ ZERO-FLICKER 60FPS LIVE MARKER GLIDE:
        if (mapWebViewRef.current) {
          mapWebViewRef.current.injectJavaScript(`
            if (window.updateRiderLiveGPS) {
              window.updateRiderLiveGPS(${lat}, ${lon}, ${heading});
            }
            true;
          `);
        }
      }
    };

    const handleRiderAssigned = (data: any) => {
      if (!data) return;
      const targetId = String(data.bookingId || data.rideId || data.orderId || data._id || '');
      if (targetId && targetId !== bIdStr) return;

      console.log('🛵 [SingleOrderStatus] Rider assigned event received:', data);
      const parsedRider = extractRiderFromData(data) || extractRiderFromData(data.booking);
      if (parsedRider) {
        setRiderInfo(parsedRider);
      }
      const lat = Number(data.riderLocation?.latitude || data.latitude || (parsedRider?.location?.latitude) || 0);
      const lon = Number(data.riderLocation?.longitude || data.longitude || (parsedRider?.location?.longitude) || 0);
      if (lat > 0 && lon > 0) {
        latestRiderLocRef.current = { latitude: lat, longitude: lon };
        setRiderLocation({ latitude: lat, longitude: lon });
        if (mapWebViewRef.current) {
          mapWebViewRef.current.injectJavaScript(`
            if (window.updateRiderLiveGPS) {
              window.updateRiderLiveGPS(${lat}, ${lon}, 0);
            }
            true;
          `);
        }
      }
      if (data.status) {
        setStatus(data.status.toUpperCase());
      }
      fetchOrderDetails();
    };

    const handleCancelled = (data: any) => {
      const targetId = String(data?.bookingId || data?.rideId || '');
      if (targetId && targetId !== bIdStr) return;
      setStatus('CANCELLED');
      setRiderLocation(null);
      latestRiderLocRef.current = null;
      if (mapWebViewRef.current) {
        mapWebViewRef.current.injectJavaScript(`
          if (roadLine && map.hasLayer(roadLine)) map.removeLayer(roadLine);
          if (roadCasing && map.hasLayer(roadCasing)) map.removeLayer(roadCasing);
          if (riderMarker && map.hasLayer(riderMarker)) map.removeLayer(riderMarker);
          true;
        `);
      }
      Alert.alert('Order Cancelled', data?.reason || 'This order was cancelled.');
    };

    socket.on('order_status_update', handleStatusUpdate);
    socket.on('order_status_updated', handleStatusUpdate);
    socket.on('ORDER_STATUS_UPDATED', handleStatusUpdate);
    socket.on('RESTAURANT_ACCEPTED', handleStatusUpdate);
    socket.on('FOOD_PREPARING', handleStatusUpdate);
    socket.on('booking_status_updated', handleStatusUpdate);
    socket.on('FOOD_ORDER_UPDATED', handleStatusUpdate);
    socket.on('booking_updated', handleStatusUpdate);
    socket.on('ride_status_update', handleStatusUpdate);
    socket.on('rider_location_update', handleRiderLocation);
    socket.on('rider_location_updated', handleRiderLocation);
    socket.on('RIDER_LOCATION_UPDATED', handleRiderLocation);
    socket.on('provider_location_update', handleRiderLocation);
    socket.on(`provider_location_${bIdStr}`, handleRiderLocation);
    socket.on('driver_location', handleRiderLocation);
    socket.on('driver_location_update', handleRiderLocation);
    socket.on('rider_assigned', handleRiderAssigned);
    socket.on('RIDER_ASSIGNED', handleRiderAssigned);
    socket.on('driver_assigned', handleRiderAssigned);
    socket.on('order_cancelled', handleCancelled);
    socket.on('booking_cancelled', handleCancelled);

    return () => {
      socket.off('order_status_update', handleStatusUpdate);
      socket.off('order_status_updated', handleStatusUpdate);
      socket.off('ORDER_STATUS_UPDATED', handleStatusUpdate);
      socket.off('RESTAURANT_ACCEPTED', handleStatusUpdate);
      socket.off('FOOD_PREPARING', handleStatusUpdate);
      socket.off('booking_status_updated', handleStatusUpdate);
      socket.off('FOOD_ORDER_UPDATED', handleStatusUpdate);
      socket.off('booking_updated', handleStatusUpdate);
      socket.off('ride_status_update', handleStatusUpdate);
      socket.off('rider_location_update', handleRiderLocation);
      socket.off('rider_location_updated', handleRiderLocation);
      socket.off('RIDER_LOCATION_UPDATED', handleRiderLocation);
      socket.off('provider_location_update', handleRiderLocation);
      socket.off(`provider_location_${bIdStr}`, handleRiderLocation);
      socket.off('driver_location', handleRiderLocation);
      socket.off('driver_location_update', handleRiderLocation);
      socket.off('rider_assigned', handleRiderAssigned);
      socket.off('RIDER_ASSIGNED', handleRiderAssigned);
      socket.off('driver_assigned', handleRiderAssigned);
      socket.off('order_cancelled', handleCancelled);
      socket.off('booking_cancelled', handleCancelled);
    };
  }, [socket, bookingId, riderInfo, order.riderId]);

  // Order Details Extractors
  const restaurantName =
    order.restaurantName ||
    order.restaurant?.name ||
    order.providerName ||
    order.sellerName ||
    route.params?.restaurant?.name ||
    'Affogato Store';

  const categoryName = resolveCategoryName(
    order.categoryName || order.businessCategoryName || route.params?.categoryName || order
  );

  const items = useMemo(() => {
    if (Array.isArray(order.items) && order.items.length > 0) return order.items;
    if (Array.isArray(order.cartItems) && order.cartItems.length > 0) return order.cartItems;
    if (order.cart && typeof order.cart === 'object') {
      return Object.values(order.cart).map((it: any) => ({
        name: it.name || it.title || 'Item',
        quantity: it.quantity || it.qty || 1,
        price: it.price || 0,
        image: it.image || it.imageUrl || it.photo || null,
      }));
    }
    return [];
  }, [order]);

  const calculatedItemsTotal = useMemo(() => {
    return items.reduce((sum: number, it: any) => {
      const q = Number(it.quantity || it.qty || 1);
      const p = Number(it.price || it.unitPrice || it.rate || 0);
      return sum + (q * p);
    }, 0);
  }, [items]);

  const totalAmount = useMemo(() => {
    const rawVal =
      order.totalAmount ??
      order.grandTotal ??
      order.finalAmount ??
      order.billAmount ??
      order.price ??
      order.amount ??
      order.total ??
      route.params?.totalAmount ??
      calculatedItemsTotal;
    const num = Number(rawVal);
    if (!isNaN(num) && num > 0) return num;
    if (calculatedItemsTotal > 0) return calculatedItemsTotal;
    return 0;
  }, [order, route.params?.totalAmount, calculatedItemsTotal]);

  const restaurantImageUri = useMemo(() => {
    const raw =
      order.restaurantImage ||
      order.restaurant?.image ||
      order.restaurant?.photo ||
      order.restaurant?.logo ||
      order.restaurant?.businessImage ||
      order.storeImage ||
      liveStoreProfile?.image ||
      liveStoreProfile?.businessImage ||
      liveStoreProfile?.profileImage ||
      liveStoreProfile?.photo ||
      order.supplierImage ||
      order.providerImage ||
      order.image ||
      '';
    if (!raw || typeof raw !== 'string') return '';
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) return raw;
    const clean = raw.replace(/^\/+/, '');
    return `${BASE_URL}/${clean}`;
  }, [order, liveStoreProfile]);

  const paymentStatus = (order.paymentStatus || order.payment_status || 'PENDING').toUpperCase();
  const isPaid = paymentStatus === 'COMPLETED' || paymentStatus === 'PAID';

  // Real Store Coordinates (Pickup Location - Canonical Real GPS from MongoDB)
  const storeCoords = useMemo(() => {
    const lat = Number(
      order.supplierBusinessLatitude ||
      order.pickupLocation?.latitude ||
      order.pickupLatitude ||
      order.restaurant?.businessLatitude ||
      order.restaurant?.latitude ||
      order.restaurantLatitude ||
      order.sellerLatitude ||
      liveStoreProfile?.businessLatitude ||
      liveStoreProfile?.latitude ||
      0
    );
    const lon = Number(
      order.supplierBusinessLongitude ||
      order.pickupLocation?.longitude ||
      order.pickupLongitude ||
      order.restaurant?.businessLongitude ||
      order.restaurant?.longitude ||
      order.restaurantLongitude ||
      order.sellerLongitude ||
      liveStoreProfile?.businessLongitude ||
      liveStoreProfile?.longitude ||
      0
    );
    return {
      latitude: lat,
      longitude: lon,
    };
  }, [order, liveStoreProfile]);

  // Real Customer Coordinates (Destination / Delivery Location)
  const customerCoords = useMemo(() => {
    const lat = Number(
      order.customerLatitude ||
      order.dropLocation?.latitude ||
      order.destinationLatitude ||
      order.dropLatitude ||
      order.latitude ||
      0
    );
    const lon = Number(
      order.customerLongitude ||
      order.dropLocation?.longitude ||
      order.destinationLongitude ||
      order.dropLongitude ||
      order.longitude ||
      0
    );
    return {
      latitude: lat,
      longitude: lon,
    };
  }, [order]);

  // Development Debug Logging & Canonical Map Marker Verification
  useEffect(() => {
    console.log('[ORDER MAP]', {
      orderId: order.bookingId || order._id,
      pickupLatitude: storeCoords.latitude,
      pickupLongitude: storeCoords.longitude,
      customerLatitude: customerCoords.latitude,
      customerLongitude: customerCoords.longitude,
      distanceResult: order.distanceKm ?? 0,
    });
    if (storeCoords.latitude > 0 && storeCoords.longitude > 0) {
      console.log('[MAP MARKER]\ntype: SUPPLIER\nlat: ' + storeCoords.latitude + '\nlng: ' + storeCoords.longitude + '\nsource: Order.pickupLocation\norderId: ' + (order.bookingId || order._id) + '\nsupplierId: ' + (order.restaurantId || order.sellerId || order.supplierId || 'N/A'));
    }
    if (customerCoords.latitude > 0 && customerCoords.longitude > 0) {
      console.log('[MAP MARKER]\ntype: CUSTOMER\nlat: ' + customerCoords.latitude + '\nlng: ' + customerCoords.longitude + '\nsource: Order.dropLocation\norderId: ' + (order.bookingId || order._id) + '\ncustomerId: ' + (order.customerId || order.userId || 'N/A'));
    }
    if (riderLocation && riderLocation.latitude > 0 && riderLocation.longitude > 0) {
      console.log('[MAP MARKER]\ntype: RIDER\nlat: ' + riderLocation.latitude + '\nlng: ' + riderLocation.longitude + '\nsource: Rider.realDeviceGPS\norderId: ' + (order.bookingId || order._id) + '\nriderId: ' + (riderInfo?.riderId || order.riderId || 'N/A'));
    }
  }, [order.bookingId, order._id, storeCoords, customerCoords, riderLocation, riderInfo?.riderId, order.riderId, order.restaurantId, order.sellerId, order.supplierId, order.customerId, order.userId]);

  const storeAddress = useMemo(() => {
    const raw =
      order.pickupAddress ||
      order.restaurantAddress ||
      order.restaurant?.address ||
      order.restaurant?.fullAddress ||
      order.provider?.address ||
      liveStoreProfile?.fullAddress ||
      liveStoreProfile?.address ||
      liveStoreProfile?.location ||
      '';
    if (typeof raw === 'string' && raw.trim() && raw !== '[object Object]') return raw.trim();
    if (typeof raw === 'object' && raw !== null) {
      return (raw.fullAddress || raw.address || raw.location || '').trim();
    }
    return '';
  }, [order, liveStoreProfile]);

  // Customer Details Extractors & Friend Delivery Detection
  const isFriendOrder = Boolean(order.isOrderingForSomeoneElse || order.orderType === 'SOMEONE_ELSE');

  const customerName = useMemo(() => {
    if (isFriendOrder && order.recipientName) {
      return `${order.recipientName} (Friend)`;
    }
    return (
      order.customerName ||
      order.customer?.name ||
      order.customer?.fullName ||
      order.userName ||
      order.user?.name ||
      order.user?.fullName ||
      user?.name ||
      user?.username ||
      user?.fullName ||
      'Customer'
    );
  }, [order, user, isFriendOrder]);

  const customerPhone = useMemo(() => {
    if (isFriendOrder && order.recipientPhone) {
      return order.recipientPhone;
    }
    return (
      order.customerPhone ||
      order.customer?.phone ||
      order.customer?.phoneNumber ||
      order.userPhone ||
      order.phoneNumber ||
      order.user?.phoneNumber ||
      order.user?.phone ||
      user?.phoneNumber ||
      user?.phone ||
      ''
    );
  }, [order, user, isFriendOrder]);

  const customerAddress = useMemo(() => {
    if (isFriendOrder && order.recipientAddress) {
      return order.recipientAddress;
    }
    const raw =
      order.dropAddress ||
      order.customerAddress ||
      order.deliveryAddress ||
      order.dropLocation?.address ||
      order.dropLocation?.fullAddress ||
      order.destinationAddress ||
      order.address ||
      '';
    if (typeof raw === 'string' && raw.trim() && raw !== '[object Object]') return raw.trim();
    if (typeof raw === 'object' && raw !== null) {
      return (raw.fullAddress || raw.address || raw.location || '').trim();
    }
    return '';
  }, [order, isFriendOrder]);

  // Determine Current Step Index for Vertical Timeline (1 to 5)
  // 1: ORDER RECEIVED / RINGING
  // 2: PREPARING
  // 3: READY FOR PICKUP
  // 4: OUT FOR DELIVERY / LIVE TRACKING
  // 5: DELIVERED
  // 0: CANCELLED
  const currentStep = useMemo(() => {
    const s = String(status || order.status || '').toUpperCase();
    if (s.includes('CANCEL') || s === 'REJECTED' || s === 'TIMEOUT') return 0;
    // CRITICAL FIX: Only strictly completed/delivered status maps to Step 5.
    // 'OUT_FOR_DELIVERY' must NEVER match here! Substring check s.includes('DELIVER') is prohibited.
    if (s === 'DELIVERED' || s === 'COMPLETED' || s === 'SERVICE_COMPLETED') return 5;
    if (
      s === 'OUT_FOR_DELIVERY' ||
      s === 'ON_THE_WAY' ||
      s === 'STARTED' ||
      s === 'SERVICE_STARTED' ||
      s === 'PICKED_UP' ||
      s === 'FOOD_PICKED_UP' ||
      s === 'IN_TRANSIT' ||
      s === 'REACHED_CUSTOMER' ||
      s === 'ARRIVED_AT_DROP' ||
      s.includes('OUT') ||
      s.includes('PICKED') ||
      s.includes('WAY')
    ) return 4;
    if (s.includes('READY') || s.includes('PACK')) return 3;
    if (s.includes('PREPAR') || s.includes('ACCEPT') || s.includes('CONFIRM')) return 2;
    return 1; // RINGING / PLACED / PENDING
  }, [status, order.status]);

  // Production Status Color System (Exact Specification)
  // Order Received / Ringing: BLUE #3B82F6
  // Preparing: AMBER #F59E0B
  // Ready for Pickup: ORANGE #F97316
  // Out for Delivery: GREEN #22C55E
  // Delivered: DARK GREEN #16A34A
  // Cancelled: RED #EF4444
  const currentStatusColor = useMemo(() => {
    switch (currentStep) {
      case 0:
        return '#EF4444'; // RED (Cancelled)
      case 1:
        return '#3B82F6'; // BLUE (Order Received)
      case 2:
        return '#F59E0B'; // AMBER (Preparing)
      case 3:
        return '#F97316'; // ORANGE (Ready for Pickup)
      case 4:
        return '#22C55E'; // GREEN (Out for Delivery)
      case 5:
        return '#16A34A'; // DARK GREEN (Delivered)
      default:
        return '#3B82F6';
    }
  }, [currentStep]);

  // Dynamic Status Title & Subtitle for Top Order Status Card & Map
  const { statusTitle, statusSubtitle } = useMemo(() => {
    const s = String(status || order?.status || '').toUpperCase();
    const lowerCat = (categoryName || '').toLowerCase();
    const isFood = lowerCat === 'food';
    const isVegetables = lowerCat.includes('veg') || lowerCat.includes('fruit') || lowerCat.includes('produce');
    const storeLabel = restaurantName || (isFood ? 'restaurant' : `${categoryName ? categoryName.toLowerCase() : 'item'} store`);

    if (s.includes('CANCEL') || s === 'REJECTED' || s === 'TIMEOUT') {
      return {
        statusTitle: 'ORDER CANCELLED',
        statusSubtitle: order?.cancellationReason || 'This order has been cancelled',
      };
    }
    // CRITICAL FIX: Pickup is NOT delivery! NEVER match substring 'DELIVER' on 'OUT_FOR_DELIVERY'.
    if (s === 'DELIVERED' || s === 'COMPLETED' || s === 'SERVICE_COMPLETED') {
      return {
        statusTitle: 'DELIVERED',
        statusSubtitle: 'Order delivered successfully',
      };
    }
    if (
      s === 'OUT_FOR_DELIVERY' ||
      s === 'ON_THE_WAY' ||
      s === 'STARTED' ||
      s === 'SERVICE_STARTED' ||
      s === 'IN_TRANSIT' ||
      s.includes('OUT') ||
      s.includes('WAY')
    ) {
      return {
        statusTitle: 'OUT FOR DELIVERY',
        statusSubtitle: riderInfo?.name ? `${riderInfo.name} is on the way with your order` : 'Your delivery partner is on the way',
      };
    }
    if (s === 'PICKED_UP' || s === 'FOOD_PICKED_UP' || s.includes('PICKED')) {
      return {
        statusTitle: 'OUT FOR DELIVERY',
        statusSubtitle: riderInfo?.name
          ? `${riderInfo.name} has picked up your order and is on the way`
          : 'Your order has been picked up and is on its way to you.',
      };
    }
    if (s === 'REACHED_RESTAURANT' || s === 'PROVIDER_ARRIVED' || s === 'RIDER_AT_RESTAURANT' || s === 'REACHED_PICKUP') {
      return {
        statusTitle: 'RIDER AT STORE',
        statusSubtitle: riderInfo?.name
          ? `${riderInfo.name} has reached the ${storeLabel}`
          : `Delivery partner has reached the ${storeLabel}`,
      };
    }
    if (s === 'RIDER_ASSIGNED' || s === 'RIDER_ACCEPTED' || s === 'HEADING_TO_STORE' || (Boolean(riderInfo?.riderId || riderInfo?._id || order.riderId) && (s.includes('RIDER') || s.includes('ASSIGN')))) {
      return {
        statusTitle: 'RIDER HEADING TO STORE',
        statusSubtitle: 'Rider is heading to the store',
      };
    }
    if (s === 'READY' || s === 'FOOD_READY' || s === 'READY_FOR_PICKUP' || s.includes('PACK')) {
      return {
        statusTitle: 'READY FOR PICKUP',
        statusSubtitle: 'Your order is packed and ready for pickup',
      };
    }
    if (s === 'PREPARING' || s.includes('PREPAR')) {
      return {
        statusTitle: isFood ? 'PREPARING ORDER' : (isVegetables ? 'PREPARING & PACKING ORDER' : 'PACKING ORDER'),
        statusSubtitle: isFood
          ? 'Store has accepted and is preparing your order'
          : (isVegetables
          ? 'Store is preparing and packing fresh produce'
          : `Store is packing your ${categoryName.toLowerCase()} order`),
      };
    }
    if (s === 'RESTAURANT_ACCEPTED' || s === 'STORE_ACCEPTED' || s === 'ACCEPTED') {
      return {
        statusTitle: 'STORE ACCEPTED',
        statusSubtitle: 'Store accepted your order',
      };
    }
    // Default: PENDING_RESTAURANT / ORDER_PLACED / PENDING / BOOKING_REQUESTED
    return {
      statusTitle: 'ORDER PLACED',
      statusSubtitle: 'Waiting for store acceptance',
    };
  }, [status, order?.status, categoryName, restaurantName, order?.cancellationReason, riderInfo?.name]);

  // 5-Stage Order Journey Definition
  const JOURNEY_STAGES = useMemo(() => {
    const lowerCat = categoryName.toLowerCase();
    const isFood = lowerCat === 'food';
    const isVegetables = lowerCat.includes('veg') || lowerCat.includes('fruit') || lowerCat.includes('produce');

    return [
      {
        step: 1,
        key: 'ORDER_PLACED',
        name: 'Order Placed',
        subtitle: 'Waiting for store acceptance',
        icon: 'checkmark-circle-outline',
        color: '#3B82F6', // BLUE
      },
      {
        step: 2,
        key: 'PREPARING',
        name: isFood ? 'Preparing Order' : (isVegetables ? 'Preparing & Packing' : 'Packing Order'),
        subtitle: isFood
          ? 'Store has accepted and is preparing order'
          : (isVegetables
          ? 'Store has accepted and is preparing & packing fresh produce'
          : `Store has accepted and is packing your ${categoryName.toLowerCase()} order`),
        icon: 'time-outline',
        color: '#F59E0B', // AMBER
      },
      {
        step: 3,
        key: 'READY',
        name: 'Ready for Pickup',
        subtitle: 'Your order is packed and ready',
        icon: 'checkmark-circle-outline',
        color: '#F97316', // ORANGE
      },
      {
        step: 4,
        key: 'OUT_FOR_DELIVERY',
        name: 'Out for Delivery',
        subtitle: riderInfo ? `${riderInfo.name || 'Partner'} is on the way` : 'Rider assignment pending',
        icon: 'motorbike',
        color: '#22C55E', // GREEN
      },
      {
        step: 5,
        key: 'DELIVERED',
        name: 'Delivered',
        subtitle: 'Order delivered successfully',
        icon: 'checkmark-circle',
        color: '#16A34A', // DARK GREEN
      },
    ];
  }, [categoryName, riderInfo]);

  // Active Stage strictly for current backend state
  const activeStage = useMemo(() => {
    if (currentStep === 0) {
      return {
        step: 0,
        key: 'CANCELLED',
        name: 'Order Cancelled',
        subtitle: order?.cancellationReason || 'This order has been cancelled',
        icon: 'close',
        color: '#EF4444',
      };
    }
    return JOURNEY_STAGES.find((s) => s.step === currentStep) || JOURNEY_STAGES[0];
  }, [currentStep, JOURNEY_STAGES, order?.cancellationReason]);


  // Sync existing ratings from order if already present
  useEffect(() => {
    if (order?.restaurantRating) {
      setRestaurantStars(Number(order.restaurantRating));
      setRestaurantRated(true);
      if (order.restaurantFeedback) setRestaurantFeedback(order.restaurantFeedback);
    }
    if (order?.riderRating) {
      setRiderStars(Number(order.riderRating));
      setRiderRated(true);
      if (order.riderFeedback) setRiderFeedback(order.riderFeedback);
    }
  }, [order?.restaurantRating, order?.riderRating, order?.restaurantFeedback, order?.riderFeedback]);

  // Separate Rating Submission Handler (Restaurant vs Delivery Partner)
  const handleRateOrder = async (target: 'restaurant' | 'rider') => {
    const stars = target === 'restaurant' ? restaurantStars : riderStars;
    const feedback = target === 'restaurant' ? restaurantFeedback : riderFeedback;
    if (stars === 0) {
      Alert.alert('Rating Required', `Please select at least 1 star to rate the ${target === 'restaurant' ? 'restaurant' : 'delivery partner'}.`);
      return;
    }
    try {
      setSubmittingRating(true);
      const res = await api.post('/bookings/rate', {
        bookingId: order.bookingId || bookingId,
        rating: stars,
        reviewText: feedback,
        ratingTarget: target,
      });
      if (res.data?.success) {
        Alert.alert('Thank You!', `Your rating for the ${target === 'restaurant' ? 'restaurant' : 'delivery partner'} has been submitted.`);
        if (target === 'restaurant') {
          setRestaurantRated(true);
        } else {
          setRiderRated(true);
        }
        if (res.data.booking) {
          setOrder((prev: any) => ({ ...prev, ...res.data.booking }));
        }
      } else {
        Alert.alert('Error', res.data?.error || 'Failed to submit rating.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || err.message || 'Failed to submit rating.');
    } finally {
      setSubmittingRating(false);
    }
  };

  // Cancellation Eligibility & Status Determinations
  const normalizedStatus = String(status || order.status || '').toUpperCase();
  const isCancelled = normalizedStatus.includes('CANCEL') || currentStep === 0;
  // CRITICAL FIX: Only true verified completed/delivered state counts as isCompleted.
  // 'OUT_FOR_DELIVERY' must NEVER be marked as completed.
  const isCompleted = (normalizedStatus === 'DELIVERED' || normalizedStatus === 'COMPLETED' || normalizedStatus === 'SERVICE_COMPLETED') && currentStep === 5;
  const isOutForDelivery = !isCompleted && (
    normalizedStatus === 'OUT_FOR_DELIVERY' ||
    normalizedStatus === 'PICKED_UP' ||
    normalizedStatus === 'FOOD_PICKED_UP' ||
    normalizedStatus === 'STARTED' ||
    normalizedStatus === 'SERVICE_STARTED' ||
    normalizedStatus === 'ON_THE_WAY' ||
    normalizedStatus === 'IN_TRANSIT' ||
    normalizedStatus === 'REACHED_CUSTOMER' ||
    normalizedStatus === 'ARRIVED_AT_DROP' ||
    normalizedStatus.includes('OUT') ||
    normalizedStatus.includes('PICKED') ||
    currentStep === 4
  );
  const isFoodReady = normalizedStatus === 'FOOD_READY' || normalizedStatus === 'READY' || normalizedStatus === 'READY_FOR_PICKUP' || normalizedStatus === 'PACKED' || currentStep === 3;
  const isCancellable = !isCancelled && !isCompleted && !isOutForDelivery;

  // Synchronize dynamic stage transition (Before Pickup: Store Route; After Pickup: Customer Route)
  useEffect(() => {
    if (mapWebViewRef.current) {
      mapWebViewRef.current.injectJavaScript(`
        if (typeof window !== 'undefined' && window.setPickedUpStatus) {
          window.setPickedUpStatus(${isOutForDelivery});
        }
        true;
      `);
    }
  }, [isOutForDelivery]);

  // Open Cancellation Confirmation Modal
  const handleRequestCancel = () => {
    if (isOutForDelivery) {
      Alert.alert('Cannot Cancel', 'Your order is already out for delivery.');
      return;
    }
    setCancelModalVisible(true);
  };

  // Confirm Cancellation with Backend Enforcement (Zero Refund Rule after Food Ready)
  const handleConfirmCancellation = async () => {
    const targetBookingId =
      order?.bookingId ||
      order?.rideId ||
      order?._id ||
      order?.id ||
      bookingId ||
      route.params?.bookingId ||
      route.params?.rideId ||
      route.params?.id ||
      initialRide?.bookingId ||
      initialRide?.rideId ||
      initialRide?._id ||
      '';

    try {
      setCancelling(true);
      if (!targetBookingId) {
        Alert.alert('Notice', 'Order ID not found.');
        setCancelling(false);
        return;
      }

      const finalReason = cancelReason || (isFoodReady ? 'Cancelled after food ready' : 'Customer cancellation');
      let updatedBookingData = null;

      try {
        const res = await api.post('/bookings/cancel', {
          bookingId: targetBookingId,
          rideId: targetBookingId,
          reason: finalReason,
          cancellationReason: finalReason,
          cancelledBy: 'CUSTOMER',
        });
        if (res.data?.success) {
          updatedBookingData = res.data.booking || res.data.order;
        }
      } catch (errPost: any) {
        console.log('[CANCEL POST NOTICE, RETRYING VIA PUT /bookings/status]:', errPost?.message);
        try {
          const resPut = await api.put('/bookings/status', {
            bookingId: targetBookingId,
            rideId: targetBookingId,
            status: 'CANCELLED',
            cancellationReason: finalReason,
            reason: finalReason,
            cancelledBy: 'CUSTOMER',
          });
          if (resPut.data?.success) {
            updatedBookingData = resPut.data.booking || resPut.data.order;
          }
        } catch (errPut: any) {
          console.log('[CANCEL PUT NOTICE]:', errPut?.message);
        }
      }

      // Always update local status to CANCELLED immediately for seamless UX
      setStatus('CANCELLED');
      setCancelModalVisible(false);

      setOrder((prev: any) => ({
        ...prev,
        ...(updatedBookingData || {}),
        status: 'CANCELLED',
        cancellationReason: finalReason,
        paidAmount: updatedBookingData?.paidAmount ?? (isPaid ? totalAmount : 0),
        refundAmount: updatedBookingData?.refundAmount ?? (isPaid ? (isFoodReady ? 0 : totalAmount) : 0),
      }));

      await AsyncStorage.multiRemove([
        'active_food_booking_id',
        'active_food_order_data',
        'active_food_order_id',
        'active_booking_id',
        'active_ride_id',
        'active_order_id',
      ]).catch(() => {});

      if (socket) {
        socket.emit('order_cancelled', { bookingId: targetBookingId, rideId: targetBookingId, reason: finalReason, cancelledBy: 'CUSTOMER' });
        socket.emit('booking_cancelled', { bookingId: targetBookingId, rideId: targetBookingId, reason: finalReason, cancelledBy: 'CUSTOMER' });
        socket.emit('booking_cancelled_by_customer', { bookingId: targetBookingId, rideId: targetBookingId, reason: finalReason, cancelledBy: 'CUSTOMER' });
        socket.emit('order_status_update', { bookingId: targetBookingId, status: 'CANCELLED', reason: finalReason });
      }

      Alert.alert(
        'Order Cancelled',
        isFoodReady
          ? 'Your order was cancelled. Since the food was already prepared, refund amount is ₹0.'
          : 'Your order has been cancelled successfully.',
        [
          {
            text: 'OK',
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [
                  {
                    name: 'CustomerHomeScreen',
                    params: { orderCancelled: true, cancelledBookingId: targetBookingId },
                  },
                ],
              });
            },
          },
        ],
        { cancelable: false }
      );
    } catch (err: any) {
      console.error('[CANCEL ORDER ERR]', err);
      setStatus('CANCELLED');
      setCancelModalVisible(false);
      await AsyncStorage.multiRemove([
        'active_food_booking_id',
        'active_food_order_data',
        'active_food_order_id',
        'active_booking_id',
        'active_ride_id',
        'active_order_id',
      ]).catch(() => {});
      Alert.alert(
        'Order Cancelled',
        'Your order has been cancelled.',
        [
          {
            text: 'OK',
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [
                  {
                    name: 'CustomerHomeScreen',
                    params: { orderCancelled: true, cancelledBookingId: targetBookingId },
                  },
                ],
              });
            },
          },
        ],
        { cancelable: false }
      );
    } finally {
      setCancelling(false);
    }
  };

  // Communication Handlers
  const handleCallRider = () => {
    const phone = riderInfo?.phone || riderInfo?.phoneNumber || riderInfo?.mobile;
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    } else {
      Alert.alert('Contact Rider', 'Rider phone number is not available at the moment.');
    }
  };

  const handleChatRider = () => {
    const riderId = riderInfo?._id || riderInfo?.id || riderInfo?.riderId;
    navigation.navigate('ChatScreen', {
      recipientId: riderId,
      recipientName: riderInfo?.name || 'Delivery Partner',
      bookingId: bookingId,
      orderId: bookingId,
      restaurantName: restaurantName,
      status: status,
      role: 'RIDER',
    });
  };

  const handleCallStore = () => {
    const phone = order.restaurantPhone || order.restaurant?.phone || order.sellerPhone;
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    } else {
      Alert.alert('Store Contact', `Calling ${restaurantName}...`);
    }
  };

  const handleChatStore = () => {
    const sellerId = order.restaurantId || order.restaurant?._id || order.sellerId;
    navigation.navigate('ChatScreen', {
      recipientId: sellerId,
      recipientName: restaurantName,
      bookingId: bookingId,
      orderId: bookingId,
      restaurantName: restaurantName,
      status: status,
      role: 'RESTAURANT',
    });
  };

  // Static Map Preview URL (OpenStreetMap / Static tile for high-speed thumbnail showing Store & Customer)
  const mapThumbnailUri = useMemo(() => {
    const sLat = storeCoords.latitude;
    const sLon = storeCoords.longitude;
    const cLat = customerCoords.latitude;
    const cLon = customerCoords.longitude;
    if (sLat <= 0 || sLon <= 0 || cLat <= 0 || cLon <= 0) return undefined;
    const midLat = (sLat + cLat) / 2;
    const midLon = (sLon + cLon) / 2;
    return `https://static-maps.yandex.ru/1.x/?ll=${midLon},${midLat}&z=14&l=map&size=240,160&pt=${sLon},${sLat},pm2gnm~${cLon},${cLat},pm2rdm`;
  }, [storeCoords, customerCoords]);

  // Full Screen Leaflet Map HTML
  const mapHtml = useMemo(() => {
    const cLat = Number(customerCoords.latitude || 0);
    const cLon = Number(customerCoords.longitude || 0);
    const sLat = Number(storeCoords.latitude || 0);
    const sLon = Number(storeCoords.longitude || 0);
    const isRiderAssigned = Boolean(riderInfo?.riderId || riderInfo?._id || order.riderId || order.deliveryPartnerId);
    const normStat = String(status || order?.status || '').toUpperCase();
    const hasRiderAccepted = Boolean(
      isRiderAssigned && (
        normStat === 'RIDER_ASSIGNED' ||
        normStat === 'RIDER_ACCEPTED' ||
        normStat === 'HEADING_TO_STORE' ||
        normStat === 'REACHED_RESTAURANT' ||
        normStat === 'PROVIDER_ARRIVED' ||
        normStat === 'RIDER_AT_RESTAURANT' ||
        normStat === 'REACHED_PICKUP' ||
        isOutForDelivery ||
        currentStep >= 4
      )
    );
    const hasRider = Boolean(hasRiderAccepted && riderInfo && (riderLocation || latestRiderLocRef.current));
    const rLat = Number(riderLocation?.latitude || latestRiderLocRef.current?.latitude || 0);
    const rLon = Number(riderLocation?.longitude || latestRiderLocRef.current?.longitude || 0);
    const isPickedUp = Boolean(isOutForDelivery || currentStep >= 4);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          * { box-sizing: border-box; }
          body, html { margin:0; padding:0; width:100%; height:100%; overflow:hidden; background:#F8FAFC; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
          #map { width:100%; height:100%; }

          /* ── PINK BIKE MARKER (Identical to Rider Home Map) ── */
          .driver-marker-icon {
            background: transparent !important;
            border: none !important;
          }
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
            background: rgba(236, 72, 153, 0.35);
            border: 1.5px solid rgba(236, 72, 153, 0.6);
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
            width: 52px;
            height: 52px;
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
            0% { transform: scale(0.8); opacity: 0.6; }
            50% { opacity: 0.3; }
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
            50% { transform: translateY(0.6px) rotate(0.5deg); }
            75% { transform: translateY(-0.3px) rotate(-0.3deg); }
          }

          /* ── PIN STYLES ── */
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
          .custom-map-tooltip {
            background: rgba(15, 23, 42, 0.92);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            color: #fff;
            font-size: 12px;
            font-weight: 600;
            padding: 4px 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var bounds = [];
          var centerLat = ${rLat > 0 ? rLat : (sLat > 0 ? sLat : (cLat > 0 ? cLat : 23.2505))};
          var centerLon = ${rLon > 0 ? rLon : (sLon > 0 ? sLon : (cLon > 0 ? cLon : 77.4065))};
          var map = L.map('map', { zoomControl: false }).setView([centerLat, centerLon], 14);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

          var isPickedUp = ${isPickedUp};
          var hasRiderAccepted = ${hasRiderAccepted};
          var sLat = ${sLat};
          var sLon = ${sLon};
          var cLat = ${cLat};
          var cLon = ${cLon};
          var currentRiderLat = ${rLat};
          var currentRiderLon = ${rLon};
          var riderMarker = null;
          var roadLine = null;
          var roadCasing = null;
          var lastRoutingLat = 0;
          var lastRoutingLon = 0;
          var lastRoutingTime = 0;

          var storeMarker = null;
          var custMarker = null;

          function renderStoreMarker() {
            if (sLat > 0 && sLon > 0 && !storeMarker) {
              var storeHtml = '<div class="custom-resto-pin-wrapper">' +
                '<div class="resto-pin-shadow"></div>' +
                '<svg width="36" height="46" viewBox="0 0 38 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 3px 6px rgba(225, 29, 72, 0.45));">' +
                '  <path d="M19 1C9.05888 1 1 9.05888 1 19C1 31.8 19 47 19 47C19 47 37 31.8 37 19C37 9.05888 28.9411 1 19 1Z" fill="#E11D48" stroke="#FFFFFF" stroke-width="2.5"/>' +
                '  <path d="M14 11V15C14 16.1 14.9 17 16 17V25H17V17C18.1 17 19 16.1 19 15V11H18V14H17V11H16V14H15V11H14Z" fill="#FFFFFF"/>' +
                '  <path d="M21 11V25H22.5V17H24C24 13.5 22.5 11 21 11Z" fill="#FFFFFF"/>' +
                '</svg>' +
                '</div>';
              var storeIcon = L.divIcon({ className: 'custom-pin store-pin', html: storeHtml, iconSize: [0, 0], iconAnchor: [0, 0] });
              storeMarker = L.marker([sLat, sLon], { icon: storeIcon }).addTo(map);
              storeMarker.bindTooltip('${restaurantName.replace(/'/g, "\\'")}', { permanent: true, direction: 'top', offset: [0, -46], className: 'custom-map-tooltip' });
            }
          }

          function removeStoreMarker() {
            if (storeMarker && map.hasLayer(storeMarker)) {
              map.removeLayer(storeMarker);
              storeMarker = null;
            }
          }

          function renderCustMarker() {
            if (cLat > 0 && cLon > 0 && !custMarker) {
              var custHtml = '<div class="custom-cust-pin-wrapper">' +
                '<div class="resto-pin-shadow"></div>' +
                '<svg width="36" height="46" viewBox="0 0 38 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 3px 6px rgba(0, 102, 255, 0.45));">' +
                '  <path d="M19 1C9.05888 1 1 9.05888 1 19C1 31.8 19 47 19 47C19 47 37 31.8 37 19C37 9.05888 28.9411 1 19 1Z" fill="#0066FF" stroke="#FFFFFF" stroke-width="2.5"/>' +
                '  <path d="M19 11L12 17V25H17V20H21V25H26V17L19 11Z" fill="#FFFFFF"/>' +
                '</svg>' +
                '</div>';
              var custIcon = L.divIcon({ className: 'custom-pin cust-pin', html: custHtml, iconSize: [0, 0], iconAnchor: [0, 0] });
              custMarker = L.marker([cLat, cLon], { icon: custIcon }).addTo(map);
              custMarker.bindTooltip('Delivery Address', { permanent: true, direction: 'top', offset: [0, -46], className: 'custom-map-tooltip' });
            }
          }

          function removeCustMarker() {
            if (custMarker && map.hasLayer(custMarker)) {
              map.removeLayer(custMarker);
              custMarker = null;
            }
          }

          // Store & Customer Location Markers:
          // Store location icon is ALWAYS visible on map from order placement
          renderStoreMarker();
          if (sLat > 0 && sLon > 0) bounds.push([sLat, sLon]);

          renderCustMarker();
          if (cLat > 0 && cLon > 0) bounds.push([cLat, cLon]);

          // 3. Pink Bike Marker Icon Template
          var bikeHtml = '<div class="marker-wrapper" id="driver-wrapper">' +
            '<div class="bike-signal-ring"></div>' +
            '<div class="bike-shadow-pulse" id="bike-shadow"></div>' +
            '<div class="bike-rotator" id="bike-rotator">' +
              '<div class="bike-idler-container" id="bike-idler">' +
                '<div class="bike-engine-vibe">' +
                  '<img src="${bikeBase64}" class="bike-img" alt="Rider"/>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>';

          var bikeIcon = L.divIcon({
            className: 'driver-marker-icon',
            html: bikeHtml,
            iconSize: [70, 70],
            iconAnchor: [35, 35]
          });

          // Rider Marker: ONLY rendered when Rider has actually accepted & coordinates exist (Stage C+)
          if (hasRiderAccepted && currentRiderLat > 0 && currentRiderLon > 0) {
            riderMarker = L.marker([currentRiderLat, currentRiderLon], { icon: bikeIcon, zIndexOffset: 1000 }).addTo(map);
            riderMarker.bindTooltip('${(riderInfo?.name || 'Rider').replace(/'/g, "\\'")}', { permanent: true, direction: 'top', offset: [0, -34], className: 'custom-map-tooltip' });
            bounds.push([currentRiderLat, currentRiderLon]);
          }

          function getDistanceMeters(lat1, lon1, lat2, lon2) {
            var R = 6371e3;
            var f1 = lat1 * Math.PI/180;
            var f2 = lat2 * Math.PI/180;
            var df = (lat2-lat1) * Math.PI/180;
            var dl = (lon2-lon1) * Math.PI/180;
            var a = Math.sin(df/2) * Math.sin(df/2) + Math.cos(f1) * Math.cos(f2) * Math.sin(dl/2) * Math.sin(dl/2);
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          }

          function calculateBearing(startLat, startLng, destLat, destLng) {
            var startLatRad = startLat * Math.PI / 180;
            var startLngRad = startLng * Math.PI / 180;
            var destLatRad = destLat * Math.PI / 180;
            var destLngRad = destLng * Math.PI / 180;
            var y = Math.sin(destLngRad - startLngRad) * Math.cos(destLatRad);
            var x = Math.cos(startLatRad) * Math.sin(destLatRad) - Math.sin(startLatRad) * Math.cos(destLatRad) * Math.cos(destLngRad - startLngRad);
            return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
          }

          function drawRouteLine(coords) {
            if (roadLine) map.removeLayer(roadLine);
            if (roadCasing) map.removeLayer(roadCasing);
            roadCasing = L.polyline(coords, { color: '#BE185D', weight: 7, opacity: 0.45, lineCap: 'round', lineJoin: 'round' }).addTo(map);
            roadLine = L.polyline(coords, { color: '#EC4899', weight: 4.5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(map);
            try {
              map.fitBounds(roadLine.getBounds(), { padding: [45, 45] });
            } catch(e) {}
          }

          function fetchRoadRoute(fromLat, fromLon, toLat, toLon) {
            if (!fromLat || !fromLon || !toLat || !toLon) return;
            var now = Date.now();
            var distSinceLast = getDistanceMeters(fromLat, fromLon, lastRoutingLat, lastRoutingLon);
            if (now - lastRoutingTime < 2500 && distSinceLast < 50) return;
            lastRoutingLat = fromLat;
            lastRoutingLon = fromLon;
            lastRoutingTime = now;

            var osrmUrl1 = 'https://router.project-osrm.org/route/v1/driving/' + fromLon + ',' + fromLat + ';' + toLon + ',' + toLat + '?overview=full&geometries=geojson';
            var osrmUrl2 = 'https://routing.openstreetmap.de/routed-car/route/v1/driving/' + fromLon + ',' + fromLat + ';' + toLon + ',' + toLat + '?overview=full&geometries=geojson';

            fetch(osrmUrl1)
              .then(function(r) { return r.json(); })
              .then(function(data) {
                if (data && data.routes && data.routes[0]) {
                  var coords = data.routes[0].geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
                  coords.push([toLat, toLon]);
                  drawRouteLine(coords);
                } else {
                  fetch(osrmUrl2).then(function(r2) { return r2.json(); }).then(function(d2) {
                    if (d2 && d2.routes && d2.routes[0]) {
                      var coords2 = d2.routes[0].geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
                      coords2.push([toLat, toLon]);
                      drawRouteLine(coords2);
                    }
                  }).catch(function() {});
                }
              })
              .catch(function() {
                fetch(osrmUrl2).then(function(r2) { return r2.json(); }).then(function(d2) {
                  if (d2 && d2.routes && d2.routes[0]) {
                    var coords2 = d2.routes[0].geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
                    coords2.push([toLat, toLon]);
                    drawRouteLine(coords2);
                  }
                }).catch(function() {});
              });
          }

          // Route Calculation:
          // 1. If Rider Accepted: Rider GPS -> Restaurant (or Customer if picked up)
          // 2. If Supplier Accepted (RESTAURANT_ACCEPTED / PREPARING / FOOD_READY / ACCEPTED): Store -> Customer
          var isSupplierAccepted = Boolean(
            normStat === 'RESTAURANT_ACCEPTED' ||
            normStat === 'PREPARING' ||
            normStat === 'FOOD_READY' ||
            normStat === 'ACCEPTED' ||
            normStat === 'STARTED'
          );

          if (hasRiderAccepted && currentRiderLat > 0 && currentRiderLon > 0) {
            var targetLat = isPickedUp ? cLat : sLat;
            var targetLon = isPickedUp ? cLon : sLon;
            fetchRoadRoute(currentRiderLat, currentRiderLon, targetLat, targetLon);
          } else if (isSupplierAccepted && sLat > 0 && sLon > 0 && cLat > 0 && cLon > 0) {
            fetchRoadRoute(sLat, sLon, cLat, cLon);
          } else if (bounds.length > 0) {
            map.fitBounds(bounds, { padding: [50, 50] });
          }

          // Exposed Hook: Draw road line when supplier accepts order in real time
          window.updateSupplierAcceptedRoute = function(sL, sLn, cL, cLn) {
            if (sL > 0 && sLn > 0 && cL > 0 && cLn > 0 && !hasRiderAccepted) {
              fetchRoadRoute(sL, sLn, cL, cLn);
            }
          };

          // Exposed Live Update Hook: Updates Rider Position Smoothly Without Page Reload
          window.updateRiderLiveGPS = function(lat, lon, heading) {
            lat = Number(lat);
            lon = Number(lon);
            if (!lat || !lon || isNaN(lat) || isNaN(lon) || lat <= 0 || lon <= 0) return;

            var prevLat = currentRiderLat;
            var prevLon = currentRiderLon;
            currentRiderLat = lat;
            currentRiderLon = lon;

            hasRiderAccepted = true;
            if (!riderMarker) {
              riderMarker = L.marker([lat, lon], { icon: bikeIcon, zIndexOffset: 1000 }).addTo(map);
              riderMarker.bindTooltip('${(riderInfo?.name || 'Rider').replace(/'/g, "\\'")}', { permanent: true, direction: 'top', offset: [0, -34], className: 'custom-map-tooltip' });
            } else {
              riderMarker.setLatLng([lat, lon]);
            }

            // Heading rotation
            var bearing = heading;
            if ((!bearing || isNaN(bearing)) && prevLat > 0 && prevLon > 0) {
              bearing = calculateBearing(prevLat, prevLon, lat, lon);
            }
            if (bearing !== undefined && bearing !== null && !isNaN(bearing)) {
              var rotator = document.getElementById('bike-rotator');
              if (rotator) {
                rotator.style.transform = 'rotate(' + bearing + 'deg)';
              }
            }

            var targetLat = isPickedUp ? cLat : sLat;
            var targetLon = isPickedUp ? cLon : sLon;
            if (targetLat > 0 && targetLon > 0) {
              fetchRoadRoute(lat, lon, targetLat, targetLon);
            }
          };

          // Exposed Status Switch: When Order is Picked Up, Destination Switches to Customer
          window.setPickedUpStatus = function(pickedUp) {
            isPickedUp = Boolean(pickedUp);
            if (isPickedUp) {
              removeStoreMarker();
              renderCustMarker();
              if (currentRiderLat > 0 && currentRiderLon > 0 && cLat > 0 && cLon > 0) {
                fetchRoadRoute(currentRiderLat, currentRiderLon, cLat, cLon);
              }
            } else {
              removeCustMarker();
              renderStoreMarker();
              if (currentRiderLat > 0 && currentRiderLon > 0 && sLat > 0 && sLon > 0) {
                fetchRoadRoute(currentRiderLat, currentRiderLon, sLat, sLon);
              }
            }
          };
        </script>
      </body>
      </html>
    `;
  }, [customerCoords.latitude, customerCoords.longitude, storeCoords.latitude, storeCoords.longitude, Boolean(riderInfo), restaurantName, isOutForDelivery, currentStep]);

  return (
    <View style={styles.rootScreenContainer}>
      <StatusBar hidden={false} barStyle="light-content" backgroundColor="#000000" translucent />

      {/* 1. TOP BACKGROUND VIDEO LAYER (FULL WIDTH HERO / BACKGROUND) */}
      <Animated.View
        style={[
          styles.bgVideoHeroContainer,
          {
            height: EXPANDED_VIDEO_HEIGHT,
            transform: [
              { translateY: videoTranslateY },
              { scale: videoScale },
            ],
            opacity: videoOpacity,
          },
        ]}
        pointerEvents="none"
      >
        {/* Native Instant Thumbnail Poster while WebView boots (Zero delay visual) */}
        <Image
          source={{ uri: restaurantImageUri || `${UPLOADS_URL}/bhopal_lake_hero.jpg` }}
          style={[StyleSheet.absoluteFill, { width: '100%', height: EXPANDED_VIDEO_HEIGHT }]}
          resizeMode="cover"
        />
        <WebViewComponent
          ref={bgVideoRef}
          originWhitelist={['*']}
          source={{
            html: `
              <!DOCTYPE html>
              <html>
                <head>
                  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
                  <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    html, body {
                      width: 100%; height: 100%;
                      background: transparent;
                      overflow: hidden;
                      display: flex; align-items: center; justify-content: center;
                    }
                    video {
                      width: 100%; height: 100%;
                      object-fit: cover;
                      object-position: 50% 12%;
                    }
                  </style>
                </head>
                <body>
                  <video id="bgvid" autoplay loop muted playsinline webkit-playsinline preload="auto" poster="${restaurantImageUri || `${UPLOADS_URL}/bhopal_lake_hero.jpg`}" style="width:100%;height:100%;object-fit:cover;object-position:50% 12%;">
                    <source src="${UPLOADS_URL}/adsfoog.mp4?v=pure2" type="video/mp4">
                    <source src="${UPLOADS_URL}/video.mp4?v=pure2" type="video/mp4">
                    <source src="https://raw.githubusercontent.com/lodhi36/sachin24/main/uploads/adsfoog.mp4" type="video/mp4">
                    <source src="https://raw.githubusercontent.com/lodhi36/sachin24/main/uploads/video.mp4" type="video/mp4">
                  </video>
                  <script>
                    var v = document.getElementById('bgvid');
                    if (v) {
                      v.muted = true;
                      v.play().catch(function(){});
                      v.addEventListener('loadeddata', function() { v.play().catch(function(){}); });
                      v.addEventListener('canplay', function() { v.play().catch(function(){}); });
                    }
                  </script>
                </body>
              </html>
            `,
            baseUrl: UPLOADS_URL,
          }}
          style={styles.bgVideoWebView}
          scrollEnabled={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          cacheEnabled={true}
          androidHardwareAccelerationDisabled={false}
          androidLayerType="hardware"
          renderToHardwareTextureAndroid={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
        />
        {/* Subtle bottom gradient to blend seamlessly into content */}
        <View style={styles.bgVideoDarkGradientOverlay} />
      </Animated.View>

      {/* 2. FLOATING TOP HEADER BAR (CLEAN & 100% TRANSPARENT, HIDES ON SCROLL UP) */}
      <Animated.View
        style={[
          styles.floatingHeaderBar,
          {
            opacity: headerOpacity,
            transform: [{ translateY: headerTranslateY }],
          },
        ]}
        pointerEvents="box-none"
      >
        <SafeAreaView style={styles.headerSafeAreaWrap}>
          <View style={styles.headerInnerRow}>
            <TouchableOpacity
              style={styles.backButton}
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
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.backChevron}>‹</Text>
            </TouchableOpacity>

            <View style={styles.headerBrandCenter} />

            <TouchableOpacity
              style={styles.helpButton}
              onPress={handleCallStore}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.helpButtonText}>Help</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Animated.View>

      {/* 3. SCROLLABLE CUSTOMER ORDER CONTENT (OVERLAID ON TOP OF VIDEO) */}
      <Animated.ScrollView
        style={styles.mainContentScrollView}
        contentContainerStyle={styles.mainContentScrollContainer}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        bounces={false}
        overScrollMode="never"
        nestedScrollEnabled={true}
        keyboardShouldPersistTaps="handled"
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
      >
        {/* Transparent Top Spacer to reveal the background video */}
        <View style={{ height: EXPANDED_VIDEO_HEIGHT - 38 }} pointerEvents="none" />

        {/* Sheet Content Wrapper with curved top corners */}
        <View style={styles.sheetContentWrapper}>
          {/* Drag handle indicator bar */}
          <View style={styles.sheetDragBarWrap}>
            <View style={styles.sheetDragBar} />
          </View>

          {/* 1. TOP STATUS CARD (DYNAMIC ACCENT & STATUS) */}
        <View style={[styles.topStatusCard, { borderLeftWidth: 4.5, borderLeftColor: currentStatusColor }]}>
          <View style={styles.topCardLeft}>
            <View style={styles.topCardStoreRow}>
              {restaurantImageUri ? (
                <Image source={{ uri: restaurantImageUri }} style={styles.topStoreRealImg} resizeMode="cover" />
              ) : (
                <View style={styles.topStorePlaceholder}>
                  <Text style={{ fontSize: 13 }}>🏪</Text>
                </View>
              )}
              <Text style={styles.storeNameLabel} numberOfLines={1}>
                {restaurantName}
              </Text>
            </View>
            <Text style={[styles.statusHeading, { color: '#0F172A' }]} numberOfLines={1}>
              {statusTitle}
            </Text>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: `${currentStatusColor}14`,
                  borderColor: `${currentStatusColor}40`,
                },
              ]}
            >
              <Text style={[styles.statusPillText, { color: currentStatusColor }]}>
                {statusSubtitle}
              </Text>
            </View>
          </View>

          {currentStep !== 0 && currentStep !== 5 && !isCompleted && (
            <TouchableOpacity
              style={styles.mapThumbnailContainer}
              activeOpacity={0.88}
              onPress={() => setMapModalVisible(true)}
            >
              <Image
                source={{ uri: mapThumbnailUri || 'https://tile.openstreetmap.org/14/11718/7057.png' }}
                style={styles.mapThumbnailImage}
                resizeMode="cover"
              />
              <View style={[styles.mapPinBadge, { backgroundColor: currentStatusColor }]}>
                <Text style={styles.mapPinText}>📍 Live Map</Text>
              </View>
              <View style={[styles.mapExpandOverlay, { backgroundColor: currentStatusColor }]}>
                <Text style={styles.mapExpandIcon}>⤢</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Professional Cancel Order Button */}
        {isCancellable && (
          <TouchableOpacity
            style={styles.cancelOrderBtn}
            onPress={handleRequestCancel}
            activeOpacity={0.82}
          >
            <View style={styles.cancelOrderBtnInner}>
              <Icon name="close" size={14} color="#EF4444" />
              <Text style={styles.cancelOrderBtnText}>Cancel Order</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* 2. PAYMENT / BILLING STATUS PILL */}
        {isCancelled ? (
          <View style={styles.cancelledPaymentCard}>
            <View style={styles.cancelledBadgeRow}>
              <View style={styles.cancelledIconPill}>
                <Icon name="close" size={16} color="#EF4444" />
              </View>
              <View style={styles.cancelledTextWrap}>
                <Text style={styles.cancelledTitle}>
                  Order Cancelled {order?.cancelledBy ? `(By ${String(order.cancelledBy).toUpperCase()})` : ''}
                </Text>
                <Text style={styles.cancelledSubtitle}>
                  Reason: {order?.cancellationReason || 'Order was cancelled'}
                </Text>
              </View>
            </View>

            <View style={styles.cancelledBreakdownBox}>
              <View style={styles.cancelledRow}>
                <Text style={styles.cancelledLabel}>Payment Status:</Text>
                <Text style={styles.cancelledVal}>
                  {isPaid ? 'Paid' : 'Cash (No charge)'}
                </Text>
              </View>
              <View style={styles.cancelledRow}>
                <Text style={styles.cancelledLabel}>Paid Amount:</Text>
                <Text style={styles.cancelledVal}>
                  ₹{Number(order.paidAmount ?? (isPaid ? totalAmount : 0))}
                </Text>
              </View>
              <View style={styles.cancelledDivider} />
              <View style={styles.cancelledRow}>
                <Text style={[styles.cancelledLabel, { fontWeight: '700', color: '#0F172A' }]}>
                  Refund Amount:
                </Text>
                <Text
                  style={[
                    styles.cancelledVal,
                    {
                      fontWeight: '800',
                      color: Number(order.refundAmount || 0) > 0 ? '#16A34A' : '#EF4444',
                      fontSize: 16,
                    },
                  ]}
                >
                  ₹{Number(order.refundAmount || 0)}
                </Text>
              </View>
              {Boolean(order.isNonRefundable || (order.refundAmount === 0 && isPaid)) && (
                <View style={styles.nonRefundTagBox}>
                  <Text style={styles.nonRefundTagText}>
                    ⚠️ Non-Refundable (Order was already ready)
                  </Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.paymentCard}>
            <View style={styles.paymentTextWrap}>
              <Text style={styles.paymentTitle}>
                Payment of ₹{totalAmount} {isPaid ? 'completed' : 'pending'}
              </Text>
              <Text style={styles.paymentSubtitle}>
                {isPaid
                  ? 'Paid online successfully via UPI / Card'
                  : 'Pay now, or pay to the delivery partner using Cash/UPI'}
              </Text>
            </View>

            {!isPaid ? (
              <TouchableOpacity
                style={styles.payNowButton}
                onPress={() => {
                  Alert.alert(
                    'Payment Options',
                    `Pay ₹${totalAmount} via Cash on Delivery or UPI on arrival.`,
                    [{ text: 'OK' }]
                  );
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.payNowText}>Pay now ›</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.paidBadge}>
                <Text style={styles.paidBadgeText}>Paid ✓</Text>
              </View>
            )}
          </View>
        )}

        {/* 3. CUSTOMER DELIVERY DETAILS CARD (DELIVERING TO) */}
        <View style={styles.customerDetailsCard}>
          <View style={styles.customerHeaderRow}>
            <View style={styles.customerAvatarCircle}>
              <Text style={styles.customerAvatarLetter}>
                {(customerName || 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.customerInfoCol}>
              <View style={styles.customerTitleRow}>
                <Text style={styles.customerSectionLabel}>📍 DELIVERING TO</Text>
                <View style={styles.customerTag}>
                  <Text style={styles.customerTagText}>You</Text>
                </View>
              </View>
              <Text style={styles.customerNameText}>{customerName}</Text>
              {customerPhone ? (
                <Text style={styles.customerPhoneText}>📞 {customerPhone}</Text>
              ) : null}
              <Text style={styles.customerAddressText} numberOfLines={2}>
                🏠 {customerAddress || 'Delivery Address'}
              </Text>
            </View>
          </View>
        </View>

        {currentStep !== 0 && ( <> {/* 4. RIDER / DELIVERY PARTNER CARD */}
        {riderInfo ? (
          <View style={styles.riderCard}>
            <View style={styles.riderHeaderRow}>
              {(() => {
                const rawPhoto = riderInfo.photo || riderInfo.profilePicture || riderInfo.avatar;
                const photoUri =
                  rawPhoto && (rawPhoto.startsWith('http') || rawPhoto.startsWith('data:'))
                    ? rawPhoto
                    : rawPhoto
                    ? `${UPLOADS_URL}${rawPhoto.replace('/uploads', '')}`
                    : null;

                return photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.riderAvatar} />
                ) : (
                  <View style={[styles.riderAvatar, { backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#BFDBFE' }]}>
                    <Text style={{ fontSize: 24 }}>🛵</Text>
                  </View>
                );
              })()}
              <View style={styles.riderTextColumn}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={styles.riderName}>{riderInfo.name || 'Delivery Partner'}</Text>
                  <View style={styles.mapRiderVerifiedBadge}>
                    <Text style={styles.mapRiderVerifiedText}>✓ Verified</Text>
                  </View>
                </View>
                <Text style={styles.riderVehicle}>
                  🛵 {riderInfo.vehicleType || 'Bike'} • {riderInfo.vehicleNumber || 'Fast Fleet'}
                </Text>
                <View style={styles.riderRatingBadge}>
                  <Text style={styles.riderRatingText}>⭐ {Number(riderInfo.rating || 4.9).toFixed(1)} • Delivery Partner</Text>
                </View>
              </View>
            </View>

            {/* Action Buttons: Call & Chat */}
            <View style={styles.riderActionRow}>
              <TouchableOpacity
                style={[styles.actionBtnPrimary, { backgroundColor: currentStatusColor }]}
                onPress={handleCallRider}
                activeOpacity={0.85}
              >
                <Icon name="call" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.actionBtnPrimaryText}>Call Partner</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtnSecondary}
                onPress={handleChatRider}
                activeOpacity={0.85}
              >
                <Icon name="chatbubble-outline" size={14} color="#0066FF" style={{ marginRight: 6 }} />
                <Text style={styles.actionBtnSecondaryText}>Chat Partner</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.riderTrustRow}>
              <Text style={styles.riderTrustText}>🛡️ Contactless delivery & temperature verified</Text>
            </View>
          </View>
        ) : (
          <View style={styles.riderSearchingCard}>
            <View style={styles.searchingHeaderRow}>
              <View style={styles.searchingIconBox}>
                <Text style={styles.searchingBikeIcon}>🛵</Text>
              </View>
              <View style={styles.searchingTextColumn}>
                <Text style={styles.searchingTitle}>🛵 Rider assignment pending</Text>
                <Text style={styles.searchingSubtitle}>
                  Finding the nearest delivery partner. Live GPS route will activate as soon as partner is assigned.
                </Text>
              </View>
            </View>

            {/* Tip Selection Chips */}
            <View style={styles.tipRow}>
              {['10', '20', '30', 'Other'].map((tipVal) => (
                <TouchableOpacity
                  key={tipVal}
                  style={[
                    styles.tipChip,
                    selectedTip === tipVal && styles.tipChipActive,
                  ]}
                  onPress={() => setSelectedTip(tipVal)}
                >
                  <Text
                    style={[
                      styles.tipChipText,
                      selectedTip === tipVal && styles.tipChipTextActive,
                    ]}
                  >
                    {tipVal === 'Other' ? 'Other' : `₹${tipVal}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        </> )} {/* 5. RESTAURANT SUMMARY & ACTIONS */}
        <View style={styles.storeDetailsCard}>
          <View style={styles.storeHeaderRow}>
            {restaurantImageUri ? (
              <Image source={{ uri: restaurantImageUri }} style={styles.storeHeaderRealImg} resizeMode="cover" />
            ) : (
              <View style={styles.storeIconBox}>
                <Text style={styles.storeEmoji}>🏪</Text>
              </View>
            )}
            <View style={styles.storeInfoColumn}>
              <Text style={styles.storeDetailsTitle}>{restaurantName}</Text>
              <Text style={styles.storeCategorySub}>{categoryName} Order • ID: #{String(bookingId).slice(-6)}</Text>
            </View>
          </View>

          {/* Store Real Address */}
          {storeAddress ? (
            <View style={styles.storeAddressRow}>
              <Text style={styles.storeAddressText} numberOfLines={2}>
                📍 {storeAddress}
              </Text>
            </View>
          ) : null}

          {/* Items Breakdown with Real Thumbnail Images */}
          {items.length > 0 ? (
            <View style={styles.itemsList}>
              {items.map((it: any, idx: number) => {
                const rawImg = it.image || it.imageUrl || it.photo || (Array.isArray(it.images) ? it.images[0] : null);
                const itImgUri = rawImg && typeof rawImg === 'string' && rawImg.trim()
                  ? (rawImg.startsWith('http') || rawImg.startsWith('data:') ? rawImg : `${UPLOADS_URL}${rawImg.replace('/uploads', '')}`)
                  : null;

                return (
                  <View key={idx} style={styles.itemRowWithThumb}>
                    <View style={styles.itemThumbWrap}>
                      {itImgUri ? (
                        <Image source={{ uri: itImgUri }} style={styles.itemThumbImg} resizeMode="cover" />
                      ) : (
                        <View style={styles.itemThumbPlaceholder}>
                          <Text style={{ fontSize: 16 }}>🍲</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.itemName}>
                        {it.name} <Text style={styles.itemQty}>× {it.quantity || 1}</Text>
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '600' }}>
                          ₹{it.price || 0} each
                        </Text>
                        {it.isRefundable !== undefined && (
                          <Text style={{ fontSize: 10, fontWeight: '700', color: it.isRefundable ? '#15803D' : '#94A3B8' }}>
                            {it.isRefundable ? '• ✓ Refundable' : '• Non-Refundable'}
                          </Text>
                        )}
                      </View>
                    </View>
                    <Text style={styles.itemPrice}>
                      ₹{(Number(it.price || 0) * Number(it.quantity || 1)).toFixed(0)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* Store Actions: Chat & Call */}
          <View style={styles.storeActionRow}>
            <TouchableOpacity
              style={styles.storeActionBtn}
              onPress={handleCallStore}
              activeOpacity={0.85}
            >
              <Text style={styles.storeActionBtnText}>📞 Call Store</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.storeActionBtnFilled}
              onPress={handleChatStore}
              activeOpacity={0.85}
            >
              <Text style={styles.storeActionBtnFilledText}>💬 Chat with Store</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 6. RATE YOUR ORDER CARD (Delivered / Completed) */}
        {currentStep === 5 && (
          <View style={styles.ratingCard}>
            <View style={styles.ratingHeaderRow}>
              <Text style={styles.ratingCardTitle}>⭐ Rate Your Experience</Text>
              <Text style={styles.ratingCardSubtitle}>Help us improve by rating the restaurant and delivery partner</Text>
            </View>

            {/* Target Selector Tabs: Restaurant vs Rider */}
            <View style={styles.ratingTabRow}>
              <TouchableOpacity
                style={[styles.ratingTabBtn, ratingTarget === 'restaurant' && styles.ratingTabBtnActive]}
                onPress={() => setRatingTarget('restaurant')}
                activeOpacity={0.8}
              >
                <Text style={[styles.ratingTabText, ratingTarget === 'restaurant' && styles.ratingTabTextActive]}>
                  🏪 Restaurant {restaurantRated ? '✓' : ''}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.ratingTabBtn, ratingTarget === 'rider' && styles.ratingTabBtnActive]}
                onPress={() => setRatingTarget('rider')}
                activeOpacity={0.8}
              >
                <Text style={[styles.ratingTabText, ratingTarget === 'rider' && styles.ratingTabTextActive]}>
                  🛵 Delivery Partner {riderRated ? '✓' : ''}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Tab Content: Restaurant Rating */}
            {ratingTarget === 'restaurant' && (
              <View style={styles.ratingContentBox}>
                <Text style={styles.ratingTargetName}>{restaurantName || 'Restaurant'}</Text>
                <Text style={styles.ratingPromptText}>How was the food and packaging?</Text>

                {/* Star Row */}
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity
                      key={star}
                      onPress={() => setRestaurantStars(star)}
                      activeOpacity={0.7}
                      style={styles.starTouch}
                    >
                      <Text style={[styles.starEmoji, star <= restaurantStars ? styles.starFilled : styles.starEmpty]}>
                        {star <= restaurantStars ? '★' : '☆'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Feedback Input */}
                <TextInput
                  style={styles.ratingFeedbackInput}
                  placeholder="Leave comments about food taste, quality, packaging..."
                  placeholderTextColor="#94A3B8"
                  value={restaurantFeedback}
                  onChangeText={setRestaurantFeedback}
                  multiline
                  numberOfLines={3}
                />

                {/* Submit Button */}
                <TouchableOpacity
                  style={[styles.submitRatingBtn, submittingRating && { opacity: 0.6 }]}
                  onPress={() => handleRateOrder('restaurant')}
                  disabled={submittingRating}
                  activeOpacity={0.85}
                >
                  {submittingRating ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.submitRatingBtnText}>
                      {restaurantRated ? '✓ Update Restaurant Rating' : 'Submit Restaurant Rating'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Tab Content: Rider Rating */}
            {ratingTarget === 'rider' && (
              <View style={styles.ratingContentBox}>
                <Text style={styles.ratingTargetName}>{riderInfo?.name || 'Delivery Partner'}</Text>
                <Text style={styles.ratingPromptText}>How was the delivery service and speed?</Text>

                {/* Star Row */}
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity
                      key={star}
                      onPress={() => setRiderStars(star)}
                      activeOpacity={0.7}
                      style={styles.starTouch}
                    >
                      <Text style={[styles.starEmoji, star <= riderStars ? styles.starFilled : styles.starEmpty]}>
                        {star <= riderStars ? '★' : '☆'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Feedback Input */}
                <TextInput
                  style={styles.ratingFeedbackInput}
                  placeholder="Leave comments about delivery partner, speed, politeness..."
                  placeholderTextColor="#94A3B8"
                  value={riderFeedback}
                  onChangeText={setRiderFeedback}
                  multiline
                  numberOfLines={3}
                />

                {/* Submit Button */}
                <TouchableOpacity
                  style={[styles.submitRatingBtn, submittingRating && { opacity: 0.6 }]}
                  onPress={() => handleRateOrder('rider')}
                  disabled={submittingRating}
                  activeOpacity={0.85}
                >
                  {submittingRating ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.submitRatingBtnText}>
                      {riderRated ? '✓ Update Rider Rating' : 'Submit Rider Rating'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
        </View>
      </Animated.ScrollView>

      {/* FULL-SCREEN INTERACTIVE MAP MODAL (Triggered when tapping top-right Map thumbnail) */}
      <Modal
        visible={mapModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setMapModalVisible(false)}
      >
        <SafeAreaView style={styles.mapModalContainer}>
          <StatusBar hidden={false} barStyle="light-content" backgroundColor={currentStatusColor} />

          {/* Map Header with Dynamic Status Accent */}
          <View style={[styles.mapModalHeader, { backgroundColor: currentStatusColor }]}>
            <TouchableOpacity
              style={styles.mapCloseBtn}
              onPress={() => setMapModalVisible(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Icon name="close" size={15} color="#FFFFFF" />
              <Text style={styles.mapCloseBtnText}>Close</Text>
            </TouchableOpacity>

            <View style={styles.mapHeaderTitleWrap}>
              <Text style={styles.mapModalStatusTitle}>{statusTitle}</Text>
              <Text style={styles.mapModalSubtitle} numberOfLines={1}>
                {restaurantName}
              </Text>
            </View>

            <View style={{ width: 60 }} />
          </View>

          {/* Map WebView Area (Occupies top 40% of screen) */}
          <View style={styles.mapWebViewContainer}>
            <WebView
              ref={mapWebViewRef}
              source={{ html: mapHtml }}
              style={styles.fullMapWebView}
              javaScriptEnabled
              domStorageEnabled
              androidHardwareAccelerationDisabled={false}
              androidLayerType="hardware"
              renderToHardwareTextureAndroid={true}
              onLoadEnd={() => {
                const curLat = Number(riderLocation?.latitude || latestRiderLocRef.current?.latitude || 0);
                const curLon = Number(riderLocation?.longitude || latestRiderLocRef.current?.longitude || 0);
                if (curLat > 0 && curLon > 0 && mapWebViewRef.current) {
                  mapWebViewRef.current.injectJavaScript(`
                    if (window.updateRiderLiveGPS) {
                      window.updateRiderLiveGPS(${curLat}, ${curLon}, 0);
                    }
                    if (window.setPickedUpStatus) {
                      window.setPickedUpStatus(${isOutForDelivery});
                    }
                    true;
                  `);
                }
              }}
            />
          </View>

          {/* ZOMATO-STYLE SCROLLABLE BOTTOM SHEET */}
          <View style={styles.mapScrollableSheet}>
            <View style={styles.mapSheetDragPillWrap}>
              <View style={styles.mapSheetDragPill} />
            </View>

            <ScrollView
              style={styles.mapSheetScrollView}
              contentContainerStyle={styles.mapSheetScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* 1. LIVE ORDER STATUS & ETA CARD */}
              <View style={[styles.mapStatusHeaderCard, { borderLeftColor: currentStatusColor }]}>
                <View style={styles.mapStatusTopRow}>
                  <View
                    style={[
                      styles.mapStatusPillLarge,
                      {
                        backgroundColor: `${currentStatusColor}18`,
                        borderColor: `${currentStatusColor}45`,
                      },
                    ]}
                  >
                    <View style={[styles.mapStatusDotLarge, { backgroundColor: currentStatusColor }]} />
                    <Text style={[styles.mapStatusPillTextLarge, { color: currentStatusColor }]}>
                      {statusTitle}
                    </Text>
                  </View>
                  <Text style={styles.mapOrderIdText}>#{String(bookingId).slice(-6)}</Text>
                </View>

                <Text style={styles.mapStatusSubtitleLarge}>{statusSubtitle}</Text>

                {currentStep > 0 && currentStep < 5 && (
                  <View style={styles.mapProgressWrap}>
                    <View style={styles.mapProgressTrack}>
                      <View
                        style={[
                          styles.mapProgressFill,
                          {
                            width: `${Math.min(100, Math.max(20, (currentStep / 5) * 100))}%`,
                            backgroundColor: currentStatusColor,
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.mapProgressMeta}>
                      <Text style={styles.mapProgressStepText}>Stage {currentStep} of 5</Text>
                      <Text style={[styles.mapProgressPercentText, { color: currentStatusColor }]}>
                        {Math.round((currentStep / 5) * 100)}%
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              {/* 2. DELIVERY PARTNER (RIDER) CARD */}
              {riderInfo ? (
                <View style={styles.mapRiderCardFull}>
                  <View style={styles.mapRiderCardHeader}>
                    <Text style={styles.mapSectionLabel}>🛵 DELIVERY PARTNER</Text>
                    <View style={styles.mapRiderVerifiedBadge}>
                      <Text style={styles.mapRiderVerifiedText}>✓ Verified</Text>
                    </View>
                  </View>

                  <View style={styles.mapRiderMainRow}>
                    {(() => {
                      const rawPhoto = riderInfo.photo || riderInfo.profilePicture || riderInfo.avatar;
                      const photoUri =
                        rawPhoto && (rawPhoto.startsWith('http') || rawPhoto.startsWith('data:'))
                          ? rawPhoto
                          : rawPhoto
                          ? `${UPLOADS_URL}${rawPhoto.replace('/uploads', '')}`
                          : null;

                      return photoUri ? (
                        <Image source={{ uri: photoUri }} style={styles.mapRiderAvatarLarge} />
                      ) : (
                        <View style={styles.mapRiderAvatarPlaceholderLarge}>
                          <Text style={{ fontSize: 24 }}>🛵</Text>
                        </View>
                      );
                    })()}

                    <View style={styles.mapRiderInfoCol}>
                      <Text style={styles.mapRiderNameLarge}>{riderInfo.name || 'Delivery Partner'}</Text>
                      <Text style={styles.mapRiderVehicleLarge}>
                        {riderInfo.vehicleNumber || 'Bike'} • {riderInfo.vehicleType || 'Two-Wheeler'}
                      </Text>
                      <View style={styles.mapRiderRatingPill}>
                        <Text style={styles.mapRiderRatingPillText}>★ {riderInfo.rating || 4.9} Rating</Text>
                      </View>
                    </View>
                  </View>

                  {/* Rider Action Buttons */}
                  <View style={styles.mapRiderActionsRow}>
                    <TouchableOpacity
                      style={[styles.mapRiderActionBtn, styles.mapRiderCallBtn, { backgroundColor: currentStatusColor }]}
                      onPress={handleCallRider}
                      activeOpacity={0.85}
                    >
                      <Icon name="call" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.mapRiderActionBtnText}>Call Partner</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.mapRiderActionBtn, styles.mapRiderChatBtn]}
                      onPress={handleChatRider}
                      activeOpacity={0.85}
                    >
                      <Icon name="chatbubble-outline" size={15} color="#0F172A" style={{ marginRight: 6 }} />
                      <Text style={styles.mapRiderChatBtnText}>Chat</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.mapRiderTrustRow}>
                    <Text style={styles.mapRiderTrustText}>🛡️ Contactless delivery & temperature verified</Text>
                  </View>
                </View>
              ) : currentStep > 0 && currentStep < 5 ? (
                <View style={styles.mapSearchingPartnerCard}>
                  <View style={styles.mapSearchingIconCircle}>
                    <Text style={{ fontSize: 22 }}>🛵</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mapSearchingPartnerTitle}>Finding Delivery Partner</Text>
                    <Text style={styles.mapSearchingPartnerSub}>
                      Assigning the nearest rider for speedy pickup from store.
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* 3. DELIVERING TO (CUSTOMER DETAILS CARD) */}
              <View style={styles.mapCustomerCard}>
                <View style={styles.mapCardHeaderRow}>
                  <Text style={styles.mapSectionLabel}>📍 DELIVERING TO</Text>
                  <View style={styles.mapCustomerTag}>
                    <Text style={styles.mapCustomerTagText}>You</Text>
                  </View>
                </View>

                <View style={styles.mapCustomerMainRow}>
                  <View style={styles.mapCustomerAvatarCircle}>
                    <Text style={styles.mapCustomerAvatarLetter}>
                      {(customerName || 'U').charAt(0).toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.mapCustomerInfoCol}>
                    <Text style={styles.mapCustomerName}>{customerName}</Text>
                    {customerPhone ? (
                      <Text style={styles.mapCustomerPhone}>📞 {customerPhone}</Text>
                    ) : null}
                    <Text style={styles.mapCustomerAddress} numberOfLines={2}>
                      🏠 {customerAddress || 'Delivery Address'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* 4. STORE / RESTAURANT DETAILS CARD */}
              <View style={styles.mapStoreCard}>
                <View style={styles.mapCardHeaderRow}>
                  <Text style={styles.mapSectionLabel}>🏪 STORE DETAILS</Text>
                  <Text style={styles.mapCategoryLabel}>{categoryName}</Text>
                </View>

                <View style={styles.mapStoreMainRow}>
                  <View style={styles.mapStoreIconCircle}>
                    <Text style={{ fontSize: 20 }}>🏪</Text>
                  </View>
                  <View style={styles.mapStoreInfoCol}>
                    <Text style={styles.mapStoreTitle}>{restaurantName}</Text>
                    {storeAddress ? (
                      <Text style={styles.mapStoreAddress} numberOfLines={2}>
                        📍 {storeAddress}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View style={styles.mapStoreActionsRow}>
                  <TouchableOpacity
                    style={styles.mapStoreActionBtn}
                    onPress={handleCallStore}
                    activeOpacity={0.85}
                  >
                    <Icon name="call-outline" size={14} color="#0F172A" style={{ marginRight: 6 }} />
                    <Text style={styles.mapStoreActionBtnText}>Call Store</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.mapStoreActionBtn}
                    onPress={handleChatStore}
                    activeOpacity={0.85}
                  >
                    <Icon name="chatbubble-outline" size={14} color="#0F172A" style={{ marginRight: 6 }} />
                    <Text style={styles.mapStoreActionBtnText}>Chat Store</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* 5. ORDER ITEMS BREAKDOWN */}
              {items.length > 0 && (
                <View style={styles.mapItemsCard}>
                  <View style={styles.mapCardHeaderRow}>
                    <Text style={styles.mapSectionLabel}>📦 ORDER SUMMARY</Text>
                    <Text style={styles.mapItemsCountBadge}>{items.length} {items.length === 1 ? 'item' : 'items'}</Text>
                  </View>

                  <View style={styles.mapItemsList}>
                    {items.map((it: any, idx: number) => {
                      const rawImg = it.image || it.imageUrl || it.photo || (Array.isArray(it.images) ? it.images[0] : null);
                      const itImgUri = rawImg && typeof rawImg === 'string' && rawImg.trim()
                        ? (rawImg.startsWith('http') || rawImg.startsWith('data:') ? rawImg : `${UPLOADS_URL}${rawImg.replace('/uploads', '')}`)
                        : null;

                      return (
                        <View key={idx} style={styles.mapItemRow}>
                          <View style={styles.mapItemThumbWrap}>
                            {itImgUri ? (
                              <Image source={{ uri: itImgUri }} style={styles.mapItemThumbImg} resizeMode="cover" />
                            ) : (
                              <View style={styles.mapItemThumbPlaceholder}>
                                <Text style={{ fontSize: 15 }}>🍲</Text>
                              </View>
                            )}
                          </View>
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={styles.mapItemName} numberOfLines={1}>
                              {it.name}
                            </Text>
                            <Text style={styles.mapItemQtyText}>
                              Qty: {it.quantity || 1} • ₹{it.price || 0} each
                            </Text>
                          </View>
                          <Text style={styles.mapItemTotalText}>
                            ₹{(Number(it.price || 0) * Number(it.quantity || 1)).toFixed(0)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* 6. BILL & PAYMENT DETAILS */}
              <View style={styles.mapBillingCard}>
                <View style={styles.mapCardHeaderRow}>
                  <Text style={styles.mapSectionLabel}>💳 PAYMENT SUMMARY</Text>
                  <View style={[styles.mapPaidBadge, { backgroundColor: isPaid ? '#DCFCE7' : '#FEF3C7' }]}>
                    <Text style={[styles.mapPaidBadgeText, { color: isPaid ? '#15803D' : '#B45309' }]}>
                      {isPaid ? 'Paid Online ✓' : 'Cash on Delivery'}
                    </Text>
                  </View>
                </View>

                <View style={styles.mapBillRow}>
                  <Text style={styles.mapBillLabel}>Total Amount to Pay</Text>
                  <Text style={styles.mapBillAmountLarge}>₹{totalAmount}</Text>
                </View>
              </View>

              <View style={{ height: 30 }} />
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>

      {/* CANCELLATION CONFIRMATION MODAL */}
      <Modal
        visible={cancelModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => !cancelling && setCancelModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.cancelModalCard}>
            {/* Modal Header */}
            <View style={styles.cancelModalHeader}>
              <View
                style={[
                  styles.cancelModalIconWrap,
                  isFoodReady ? styles.cancelIconWrapWarning : styles.cancelIconWrapStandard,
                ]}
              >
                <Text style={styles.cancelModalEmoji}>{isFoodReady ? '⚠️' : '❓'}</Text>
              </View>
              <Text style={styles.cancelModalTitle}>Cancel Your Order?</Text>
            </View>

            {/* Food Ready Non-Refundable Alert Box */}
            {isFoodReady ? (
              <View style={styles.nonRefundableAlertBox}>
                <Text style={styles.nonRefundableAlertText}>
                  Your order is already ready. If you cancel now, the order amount is non-refundable.
                </Text>
              </View>
            ) : (
              <Text style={styles.cancelModalDesc}>
                Are you sure you want to cancel this order?
              </Text>
            )}

            {/* Refund & Payment Breakdown */}
            <View style={styles.cancelSummaryBox}>
              <View style={styles.cancelSummaryRow}>
                <Text style={styles.cancelSummaryLabel}>Order Status:</Text>
                <Text style={styles.cancelSummaryValue}>{statusTitle}</Text>
              </View>
              <View style={styles.cancelSummaryRow}>
                <Text style={styles.cancelSummaryLabel}>Order Amount:</Text>
                <Text style={styles.cancelSummaryValue}>₹{totalAmount}</Text>
              </View>
              <View style={styles.cancelSummaryDivider} />
              <View style={styles.cancelSummaryRow}>
                <Text style={[styles.cancelSummaryLabel, { fontWeight: '700', color: '#0F172A' }]}>
                  Refund Amount:
                </Text>
                <Text
                  style={[
                    styles.cancelSummaryValue,
                    {
                      fontWeight: '800',
                      color: isFoodReady ? '#EF4444' : isPaid ? '#16A34A' : '#64748B',
                      fontSize: 16,
                    },
                  ]}
                >
                  {isFoodReady ? '₹0' : isPaid ? `₹${totalAmount}` : '₹0 (No charge)'}
                </Text>
              </View>
              {isFoodReady ? (
                <View style={styles.nonRefundableTag}>
                  <Text style={styles.nonRefundableTagText}>Refund Amount: ₹0</Text>
                </View>
              ) : !isPaid ? (
                <View style={styles.cashNoticeTag}>
                  <Text style={styles.cashNoticeTagText}>Cash order • No refund required</Text>
                </View>
              ) : null}
            </View>

            {/* Reason Selection Chips */}
            <View style={styles.cancelReasonWrap}>
              <Text style={styles.cancelReasonTitle}>Reason for cancellation:</Text>
              <View style={styles.cancelReasonChipGrid}>
                {[
                  'Ordered by mistake',
                  'Taking too long',
                  'Changed my mind',
                  'Other reason',
                ].map((r) => {
                  const isSelected = cancelReason === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[
                        styles.cancelReasonChip,
                        isSelected && styles.cancelReasonChipActive,
                      ]}
                      onPress={() => setCancelReason(r)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.cancelReasonChipText,
                          isSelected && styles.cancelReasonChipTextActive,
                        ]}
                      >
                        {r}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Buttons */}
            <View style={styles.cancelModalBtnRow}>
              <TouchableOpacity
                style={styles.cancelModalGoBackBtn}
                onPress={() => setCancelModalVisible(false)}
                disabled={cancelling}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelModalGoBackText}>Go Back</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.cancelModalConfirmBtn,
                  cancelling && { opacity: 0.7 },
                ]}
                onPress={handleConfirmCancellation}
                disabled={cancelling}
                activeOpacity={0.85}
              >
                {cancelling ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.cancelModalConfirmText}>Cancel Order</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  rootScreenContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    position: 'relative',
  },
  bgVideoHeroContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: '100%',
    backgroundColor: '#000000',
    zIndex: 1,
    overflow: 'hidden',
  },
  bgVideoWebView: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  bgVideoDarkGradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: 'transparent',
  },
  bgVideoAdFloatingBadge: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : (StatusBar.currentHeight || 24) + 52,
    left: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bgVideoAdFloatingBadgeText: {
    color: '#FDE047',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  bgVideoLiveTag: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '700',
  },
  floatingHeaderBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
  },
  headerSafeAreaWrap: {
    width: '100%',
    backgroundColor: 'transparent',
  },
  headerInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backChevron: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    marginTop: -4,
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 4,
  },
  headerBrandCenter: {
    alignItems: 'center',
  },
  headerBrandTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  headerBrandSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 9.5,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  helpButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 2,
  },
  helpButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 4,
  },
  mainContentScrollView: {
    flex: 1,
    zIndex: 10,
  },
  mainContentScrollContainer: {
    paddingTop: 0,
    paddingBottom: 40,
  },
  sheetContentWrapper: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    minHeight: SCREEN_HEIGHT,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  sheetDragBarWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    marginBottom: 8,
  },
  sheetDragBar: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
  },

  /* 1. TOP STATUS CARD */
  topStatusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 12,
  },
  topCardLeft: {
    flex: 1,
    paddingRight: 12,
  },
  topCardStoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  topStoreRealImg: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  topStorePlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  storeNameLabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  statusHeading: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16A34A',
  },
  mapThumbnailContainer: {
    width: 96,
    height: 76,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#E2E8F0',
    position: 'relative',
  },
  mapThumbnailImage: {
    width: '100%',
    height: '100%',
  },
  mapPinBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  mapPinText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  mapExpandOverlay: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#0066FF',
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapExpandIcon: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },

  /* 2. PAYMENT / BILLING CARD */
  paymentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 12,
  },
  paymentTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  paymentTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  paymentSubtitle: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  payNowButton: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  payNowText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  paidBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  paidBadgeText: {
    color: '#16A34A',
    fontSize: 12,
    fontWeight: '700',
  },

  /* 3. CUSTOMER DELIVERY DETAILS CARD */
  customerDetailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 12,
  },
  customerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  customerAvatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
  },
  customerAvatarLetter: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0066FF',
  },
  customerInfoCol: {
    flex: 1,
  },
  customerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  customerSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  customerTag: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  customerTagText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  customerNameText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  customerPhoneText: {
    fontSize: 12,
    color: '#0066FF',
    fontWeight: '700',
    marginTop: 2,
  },
  customerAddressText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 3,
    lineHeight: 16,
  },
  riderTrustRow: {
    paddingTop: 10,
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
  },
  riderTrustText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  journeyLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    gap: 5,
  },
  journeyLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  journeyLiveText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  activeStatusMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  activeStatusIconWrapper: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginRight: 14,
  },
  activeStatusGlowRing: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  activeStatusIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  activeStatusTextCol: {
    flex: 1,
  },
  activeStatusTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  activeStatusSubtitle: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 3,
    lineHeight: 18,
  },
  statusProgressContainer: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressStepCountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  progressStepCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  progressStepPercentText: {
    fontSize: 12,
    fontWeight: '800',
  },

  /* 4. RIDER CARD */
  riderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 14,
  },
  riderHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  riderAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#0066FF',
    marginRight: 14,
  },
  riderTextColumn: {
    flex: 1,
  },
  riderName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  riderVehicle: {
    fontSize: 13,
    color: '#64748B',
    marginVertical: 2,
  },
  riderRatingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  riderRatingText: {
    fontSize: 11,
    color: '#0066FF',
    fontWeight: '700',
  },
  riderActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtnSecondary: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#0066FF44',
  },
  actionBtnSecondaryText: {
    color: '#0066FF',
    fontSize: 13,
    fontWeight: '700',
  },
  actionBtnPrimary: {
    flex: 1,
    backgroundColor: '#0066FF',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  /* RIDER SEARCHING / UNASSIGNED CARD */
  riderSearchingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 14,
  },
  searchingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  searchingIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#0066FF33',
  },
  searchingBikeIcon: {
    fontSize: 22,
  },
  searchingTextColumn: {
    flex: 1,
  },
  searchingTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  searchingSubtitle: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  tipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tipChip: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  tipChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#0066FF',
  },
  tipChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  tipChipTextActive: {
    color: '#0066FF',
  },

  /* 5. STORE DETAILS CARD */
  storeDetailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 14,
  },
  storeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  storeHeaderRealImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginRight: 12,
  },
  storeIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  storeEmoji: {
    fontSize: 18,
  },
  storeInfoColumn: {
    flex: 1,
  },
  storeDetailsTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  storeCategorySub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  storeAddressRow: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  storeAddressText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
    fontWeight: '500',
  },
  itemsList: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    paddingVertical: 10,
    marginBottom: 12,
  },
  itemRowWithThumb: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  itemThumbWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  itemThumbImg: {
    width: '100%',
    height: '100%',
  },
  itemThumbPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
  },
  itemQty: {
    color: '#0066FF',
    fontWeight: '700',
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginLeft: 8,
  },
  storeActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  storeActionBtn: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  storeActionBtnText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  storeActionBtnFilled: {
    flex: 1,
    backgroundColor: '#0066FF',
    borderRadius: 12,
    paddingVertical: 9,
    alignItems: 'center',
  },
  storeActionBtnFilledText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  /* 6. CANCEL BUTTON */
  cancelButton: {
    borderWidth: 1.5,
    borderColor: '#0066FF',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginTop: 4,
  },
  cancelButtonText: {
    color: '#0066FF',
    fontSize: 15,
    fontWeight: '800',
  },

  /* FULL-SCREEN MAP MODAL */
  mapModalContainer: {
    flex: 1,
    backgroundColor: '#0066FF',
  },
  mapModalHeader: {
    marginTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  mapCloseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  mapCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  mapHeaderTitleWrap: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 8,
  },
  mapModalStatusTitle: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  mapModalSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 1,
  },
  mapWebViewContainer: {
    height: height * 0.38,
    width: '100%',
    backgroundColor: '#E2E8F0',
  },
  fullMapWebView: {
    flex: 1,
  },
  mapScrollableSheet: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 10,
    overflow: 'hidden',
  },
  mapSheetDragPillWrap: {
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  mapSheetDragPill: {
    width: 44,
    height: 4.5,
    borderRadius: 2.5,
    backgroundColor: '#CBD5E1',
  },
  mapSheetScrollView: {
    flex: 1,
  },
  mapSheetScrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  mapSectionLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  mapCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  /* 1. MAP STATUS HEADER CARD */
  mapStatusHeaderCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  mapStatusTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  mapStatusPillLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  mapStatusDotLarge: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  mapStatusPillTextLarge: {
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  mapOrderIdText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  mapStatusSubtitleLarge: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    marginTop: 2,
    lineHeight: 18,
  },
  mapProgressWrap: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  mapProgressTrack: {
    height: 5,
    backgroundColor: '#E2E8F0',
    borderRadius: 2.5,
    overflow: 'hidden',
  },
  mapProgressFill: {
    height: '100%',
    borderRadius: 2.5,
  },
  mapProgressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  mapProgressStepText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  mapProgressPercentText: {
    fontSize: 11,
    fontWeight: '800',
  },

  /* 2. DELIVERY PARTNER CARD */
  mapRiderCardFull: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  mapRiderCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  mapRiderVerifiedBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
  },
  mapRiderVerifiedText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
  },
  mapRiderMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  mapRiderAvatarLarge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  mapRiderAvatarPlaceholderLarge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
  },
  mapRiderInfoCol: {
    flex: 1,
  },
  mapRiderNameLarge: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  mapRiderVehicleLarge: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },
  mapRiderRatingPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF9C3',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 3,
  },
  mapRiderRatingPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#854D0E',
  },
  mapRiderActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  mapRiderActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
  },
  mapRiderCallBtn: {
    backgroundColor: '#0066FF',
  },
  mapRiderChatBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  mapRiderActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  mapRiderChatBtnText: {
    color: '#0F172A',
    fontSize: 12.5,
    fontWeight: '700',
  },
  mapRiderTrustRow: {
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
  },
  mapRiderTrustText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  mapSearchingPartnerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 12,
    gap: 12,
  },
  mapSearchingIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapSearchingPartnerTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#1E40AF',
  },
  mapSearchingPartnerSub: {
    fontSize: 11.5,
    color: '#3B82F6',
    marginTop: 2,
    lineHeight: 15,
  },

  /* 3. CUSTOMER DETAILS CARD */
  mapCustomerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  mapCustomerTag: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  mapCustomerTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  mapCustomerMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  mapCustomerAvatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  mapCustomerAvatarLetter: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0066FF',
  },
  mapCustomerInfoCol: {
    flex: 1,
  },
  mapCustomerName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  mapCustomerPhone: {
    fontSize: 12,
    color: '#0066FF',
    fontWeight: '700',
    marginTop: 2,
  },
  mapCustomerAddress: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 3,
    lineHeight: 16,
  },

  /* 4. STORE CARD */
  mapStoreCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  mapCategoryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0066FF',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  mapStoreMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  mapStoreIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  mapStoreInfoCol: {
    flex: 1,
  },
  mapStoreTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  mapStoreAddress: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  mapStoreActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  mapStoreActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  mapStoreActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },

  /* 5. ORDER ITEMS CARD */
  mapItemsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  mapItemsCountBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  mapItemsList: {
    marginTop: 4,
  },
  mapItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  mapItemThumbWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  mapItemThumbImg: {
    width: '100%',
    height: '100%',
  },
  mapItemThumbPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
  },
  mapItemName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  mapItemQtyText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  mapItemTotalText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },

  /* 6. BILLING CARD */
  mapBillingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  mapPaidBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  mapPaidBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  mapBillRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  mapBillLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  mapBillAmountLarge: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
  },

  /* 6. RATING CARD */
  ratingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FEF08A',
  },
  ratingHeaderRow: {
    marginBottom: 14,
  },
  ratingCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  ratingCardSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  ratingTabRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    marginBottom: 14,
  },
  ratingTabBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 10,
  },
  ratingTabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  ratingTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  ratingTabTextActive: {
    color: '#0066FF',
    fontWeight: '800',
  },
  ratingContentBox: {
    alignItems: 'center',
  },
  ratingTargetName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  ratingPromptText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 10,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  starTouch: {
    padding: 4,
  },
  starEmoji: {
    fontSize: 34,
  },
  starFilled: {
    color: '#F59E0B',
  },
  starEmpty: {
    color: '#CBD5E1',
  },
  ratingFeedbackInput: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 64,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  submitRatingBtn: {
    width: '100%',
    backgroundColor: '#0066FF',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitRatingBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  /* CANCEL ORDER BUTTON UNDER STATUS */
  cancelOrderBtn: {
    marginBottom: 12,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FECACA',
  },
  cancelOrderBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  cancelOrderBtnIcon: {
    fontSize: 14,
    fontWeight: '800',
    color: '#EF4444',
  },
  cancelOrderBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
  },

  /* CANCELLED PAYMENT BREAKDOWN CARD */
  cancelledPaymentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cancelledBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cancelledIconPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  cancelledIconText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '800',
  },
  cancelledTextWrap: {
    flex: 1,
  },
  cancelledTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#EF4444',
  },
  cancelledSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  cancelledBreakdownBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cancelledRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  cancelledLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  cancelledVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  cancelledDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 6,
  },
  nonRefundTagBox: {
    marginTop: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  nonRefundTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },

  /* CANCELLATION MODAL */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cancelModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  cancelModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  cancelModalIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cancelIconWrapWarning: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  cancelIconWrapStandard: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  cancelModalEmoji: {
    fontSize: 20,
  },
  cancelModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  nonRefundableAlertBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#F87171',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  nonRefundableAlertText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
    lineHeight: 18,
    textAlign: 'center',
  },
  cancelModalDesc: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 14,
    lineHeight: 20,
  },
  cancelSummaryBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  cancelSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  cancelSummaryLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  cancelSummaryValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  cancelSummaryDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 6,
  },
  nonRefundableTag: {
    marginTop: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  nonRefundableTagText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#DC2626',
  },
  cashNoticeTag: {
    marginTop: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  cashNoticeTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  cancelReasonWrap: {
    marginBottom: 18,
  },
  cancelReasonTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  cancelReasonChipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cancelReasonChip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cancelReasonChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#0066FF',
  },
  cancelReasonChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  cancelReasonChipTextActive: {
    color: '#0066FF',
    fontWeight: '700',
  },
  cancelModalBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelModalGoBackBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelModalGoBackText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  cancelModalConfirmBtn: {
    flex: 1.3,
    backgroundColor: '#0066FF',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelModalConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default SingleOrderStatusScreen;
