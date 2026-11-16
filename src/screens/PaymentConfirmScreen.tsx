import React, { useState, useEffect, useMemo, useRef, useContext, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
  Image,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Platform,
  Dimensions,
  BackHandler,
  Animated,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from '../components/PngIcon';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';
import { AuthContext } from '../context/AuthContext';
import { rideStore } from '../services/rideStore';
import { BASE_URL } from '../config/apiConfig';
import api from '../services/api';
import { CartService } from '../services/CartService';
import WebView from 'react-native-webview';
import AddressSelectionModal from '../components/AddressSelectionModal';
import { CustomerHelpCenterModal } from '../components/CustomerHelpCenterModal';
import { isCancellationEventProcessed } from '../components/CancellationPopupModal';
import {
  DeliveryAddress,
  DeviceGpsFix,
  calculateHaversineDistanceKm,
  calculateRiderDeliveryFee,
  getActiveDeliveryAddress,
  fetchCurrentGpsPosition,
  reverseGeocodeCoords,
  saveAddressToStorage,
} from '../services/LocationAddressService';
import CookingAnimation from '../components/CookingAnimation';
import { LottieAnimation } from '../components/LottieAnimation';
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
  getCategoryPrepTerminology,
  getActiveOrderStatusBadge,
  getCategoryTotalLabel,
} from '../utils/categoryHelper';

const hotelBellAnim = require('../banner/Hotel Bell.json');
const cookingAnim = require('../banner/cooking.json');
const pickupReadyAnim = require('../banner/Pickup order ready.json');
const bikeWinnerAnim = require('../assets/winner/bike.json');

const { width } = Dimensions.get('window');

interface PaymentConfirmScreenProps {
  route: any;
  navigation: any;
}

const PaymentConfirmScreen: React.FC<PaymentConfirmScreenProps> = ({ route, navigation }) => {
  const { user } = useContext(AuthContext);
  const {
    rideData = {},
    coords: passedCoords,
    categoryName = 'Service Booking',
    restaurant,
    cart = {},
    cartItems: initialCartItems,
    subtotal: initialSubtotal = 0,
    deliveryFee: initialDeliveryFee,
    taxesAndCharges: initialTaxes = 0,
    deliveryAddress: initialDeliveryAddress,
  } = route.params || {};

  const isFoodDelivery =
    categoryName === 'Food Delivery' ||
    Boolean(route.params?.cart) ||
    Boolean(restaurant) ||
    Boolean(route.params?.isFoodDelivery);

  const initialPrice = Number(
    route.params?.totalAmount || route.params?.price || rideData?.price || 299
  );

  const effectiveRideId =
    route.params?.rideId ||
    route.params?.bookingId ||
    rideData?.rideId ||
    rideData?.bookingId ||
    `ride_${Date.now()}`;

  // Restaurant details for food delivery
  const rId = String(
    route.params?.restaurantId ||
    restaurant?._id ||
    restaurant?.id ||
    restaurant?.partnerId ||
    CartService.getRestaurantId() ||
    ''
  );
  const initialRestoName = (
    restaurant?.name ||
    restaurant?.restaurantName ||
    restaurant?.username ||
    CartService.getRestaurant()?.name ||
    'Store Partner'
  ).trim();

  const rawRestoAddr = (
    (restaurant?.fullAddress && restaurant.fullAddress !== '[object Object]' && restaurant.fullAddress) ||
    (restaurant?.address && restaurant.address !== '[object Object]' && restaurant.address) ||
    (restaurant?.location && restaurant.location !== '[object Object]' && restaurant.location) ||
    restaurant?.city ||
    ''
  );

  const [restoDisplayName, setRestoDisplayName] = useState<string>(initialRestoName);
  const [restoAddressText, setRestoAddressText] = useState<string>(rawRestoAddr || 'Store Location');
  const [restoCoords, setRestoCoords] = useState<{ latitude: number; longitude: number }>(() => {
    const pLat = Number(restaurant?.businessLatitude || restaurant?.pickupLatitude || restaurant?.latitude || (restaurant?.locationCoords && restaurant.locationCoords.latitude) || 0);
    const pLon = Number(restaurant?.businessLongitude || restaurant?.pickupLongitude || restaurant?.longitude || (restaurant?.locationCoords && restaurant.locationCoords.longitude) || 0);
    return {
      latitude: pLat,
      longitude: pLon,
    };
  });
  const restoName = restoDisplayName;
  const restoAddress = restoAddressText;
  const restoLat = restoCoords.latitude;
  const restoLon = restoCoords.longitude;

  // Delivery Address & Location State
  const [deliveryAddress, setDeliveryAddress] = useState<DeliveryAddress | null>(
    initialDeliveryAddress || null
  );
  const [addressModalVisible, setAddressModalVisible] = useState<boolean>(false);
  const [fetchingGps, setFetchingGps] = useState<boolean>(false);
  const [gpsInfo, setGpsInfo] = useState<DeviceGpsFix | null>(null);
  const [showHelpCenter, setShowHelpCenter] = useState<boolean>(false);

  const { socket } = useSocket();
  const { isDark, currentColors } = useTheme();
  const webViewRef = useRef<any>(null);

  // Payment Options - Cash on Delivery (COD) & Zynvero Wallet
  const [selectedPayment, setSelectedPayment] = useState<'cod' | 'wallet'>('cod');
  const [paymentExpanded, setPaymentExpanded] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number>(0);

  const getPaymentLabel = () => {
    if (selectedPayment === 'wallet') return 'Zynvero Wallet';
    return 'Cash on Delivery (COD)';
  };

  // Promo Code State
  const [promoCode, setPromoCode] = useState<string>('');
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoSuccess, setPromoSuccess] = useState<string | null>(null);

  // Booking Flow States
  const [bookingState, setBookingState] = useState<'idle' | 'searching' | 'found'>(
    route.params?.bookingState || 'idle'
  );
  const [loading, setLoading] = useState(false);
  const searchTimeoutRef = useRef<any>(null);
  const isSubmittingRef = useRef<boolean>(false);

  // Real-Time Rain Drop Animation State
  const [isRaining, setIsRaining] = useState<boolean>(false);
  const [rainSurgeFee, setRainSurgeFee] = useState<number>(10);

  useEffect(() => {
    const fetchRainMode = async () => {
      try {
        const res = await api.get('/settings/rain');
        if (res.data?.success && res.data.rainMode) {
          setIsRaining(Boolean(res.data.rainMode.isActive));
          if (res.data.rainMode.surgeFee) {
            setRainSurgeFee(Number(res.data.rainMode.surgeFee));
          }
        }
      } catch (e) {
        console.log('[PaymentConfirmScreen] Rain fetch notice:', e);
      }
    };
    fetchRainMode();

    if (socket) {
      const handleRainUpdate = (data: any) => {
        if (data && typeof data.isActive === 'boolean') {
          setIsRaining(data.isActive);
          if (data.surgeFee) {
            setRainSurgeFee(Number(data.surgeFee));
          }
        }
      };
      socket.on('rain_mode_updated', handleRainUpdate);
      return () => {
        socket.off('rain_mode_updated', handleRainUpdate);
      };
    }
  }, [socket]);

  // Helper function to safely parse cart items into clean list with names, quantities and real prices
  const parseFoodOrderItems = (cartItems: any, fallbackPrice?: number) => {
    if (!cartItems) return [];
    let itemsList: any[] = [];
    if (Array.isArray(cartItems)) {
      itemsList = cartItems.map((it: any, index: number) => ({
        id: it.id || it.itemId || `item_${index}`,
        name: it.name || it.dishName || it.title || 'Item',
        quantity: Number(it.quantity) || 1,
        price: Number(it.price) || 0,
        isVeg: it.isVeg !== false,
      }));
    } else if (typeof cartItems === 'object') {
      itemsList = Object.entries(cartItems).map(([key, val]: [string, any]) => {
        if (typeof val === 'number') {
          return {
            id: key,
            name: 'Item',
            quantity: val,
            price: 0,
          };
        }
        return {
          id: key,
          name: val?.name || val?.dishName || val?.title || 'Item',
          quantity: Number(val?.quantity) || 1,
          price: Number(val?.price) || 0,
          isVeg: val?.isVeg !== false,
        };
      });
    }

    const totalItemsSum = itemsList.reduce((sum, it) => sum + ((Number(it.price) || 0) * (Number(it.quantity) || 1)), 0);
    if (totalItemsSum === 0 && fallbackPrice && fallbackPrice > 0 && itemsList.length > 0) {
      const totalQty = itemsList.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0) || 1;
      const perItemPrice = Math.round(fallbackPrice / totalQty);
      itemsList = itemsList.map((it) => ({
        ...it,
        price: it.price > 0 ? it.price : perItemPrice,
      }));
    }

    return itemsList;
  };

  // Real Food Order Lifecycle States (Backed 100% by Node.js Backend & MongoDB)
  const initialPassedStatus = (
    route.params?.foodOrderStatus ||
    route.params?.activeFoodOrder?.status ||
    (route.params?.bookingId || route.params?.rideId ? 'CONNECTING' : 'IDLE')
  );
  const [foodOrderStatus, setFoodOrderStatus] = useState<
    'IDLE' | 'CONNECTING' | 'RINGING' | 'RESTAURANT_ACCEPTED' | 'PREPARING' | 'FOOD_READY' | 'OUT_FOR_DELIVERY' | 'ON_THE_WAY' | 'PICKED_UP' | 'RESTAURANT_DECLINED' | 'NO_RESPONSE' | 'COMPLETED' | 'CANCELLED' | 'TIMEOUT'
  >(initialPassedStatus as any);
  const [activeFoodOrder, setActiveFoodOrder] = useState<any | null>(route.params?.activeFoodOrder || null);
  const [prepMinutes, setPrepMinutes] = useState<number>(15);
  const [ringingCountdown, setRingingCountdown] = useState<number>(60);
  const [fetchedStoreCategory, setFetchedStoreCategory] = useState<string>('');
  const countdownIntervalRef = useRef<any>(null);
  const ringingPulseAnim = useRef(new Animated.Value(1)).current;

  // Dynamically fetch actual store/supplier category from MongoDB
  useEffect(() => {
    const targetStoreId = (
      rId ||
      activeFoodOrder?.restaurantId ||
      activeFoodOrder?.providerId ||
      activeFoodOrder?.partnerId ||
      (route.params as any)?.restaurantId ||
      (route.params as any)?.providerId
    );
    if (!targetStoreId || targetStoreId === 'undefined' || targetStoreId === 'null') return;

    let isMounted = true;
    const fetchCategory = async () => {
      try {
        const res = await api.get(`/profile/restaurant-availability/${targetStoreId}`);
        if (isMounted && res.data?.success) {
          const d = res.data;
          const cat = d.categoryName || d.businessCategoryName || d.partnerType || d.businessType;
          if (cat) {
            setFetchedStoreCategory(cat);
          }
          if (d.name || d.restaurantName) {
            setRestoDisplayName(d.name || d.restaurantName);
          }
          const liveAddr = (
            (d.fullAddress && d.fullAddress !== '[object Object]' && d.fullAddress) ||
            (d.address && d.address !== '[object Object]' && d.address) ||
            (d.location && d.location !== '[object Object]' && d.location) ||
            ''
          ).trim();
          if (liveAddr) {
            setRestoAddressText(liveAddr);
          }
          const lat = Number(d.latitude || 0);
          const lon = Number(d.longitude || 0);
          if (lat !== 0 && lon !== 0 && !isNaN(lat) && !isNaN(lon)) {
            setRestoCoords({ latitude: lat, longitude: lon });
          }
        }
      } catch (err) {}
    };
    fetchCategory();
    return () => { isMounted = false; };
  }, [rId, activeFoodOrder]);

  const orderCategoryName = useMemo(() => {
    return resolveCategoryName({
      categoryName: fetchedStoreCategory || (route.params as any)?.categoryName || restaurant?.categoryName || restaurant?.businessCategoryName || activeFoodOrder?.categoryName || activeFoodOrder?.businessCategoryName,
      businessCategoryName: fetchedStoreCategory || restaurant?.businessCategoryName || activeFoodOrder?.businessCategoryName,
      partnerType: restaurant?.partnerType || activeFoodOrder?.partnerType,
      businessType: restaurant?.businessType || activeFoodOrder?.businessType,
      cartItems: initialCartItems || cart || activeFoodOrder?.cartItems,
      restaurantName: restoName,
      name: restoName,
      serviceName: (route.params as any)?.serviceName || activeFoodOrder?.serviceName,
    });
  }, [activeFoodOrder, route.params, restaurant, fetchedStoreCategory, restoName, initialCartItems, cart]);

  const categoryTerminology = useMemo(() => {
    return getCategoryPrepTerminology(orderCategoryName);
  }, [orderCategoryName]);

  const restoPhone = (
    restaurant?.phoneNumber ||
    restaurant?.phone ||
    activeFoodOrder?.providerPhone ||
    activeFoodOrder?.restaurantPhone ||
    activeFoodOrder?.rawUser?.phoneNumber ||
    activeFoodOrder?.partnerPhone ||
    ''
  ).trim();

  // Strict Role Isolation Guard for Customer Payment/Tracking screen
  useEffect(() => {
    const checkRoleGuard = async () => {
      const activeRole = await AsyncStorage.getItem('activeRole');
      if (activeRole && activeRole !== 'CUSTOMER') {
        console.log(`[ROLE GUARD] Redirecting non-customer role (${activeRole}) away from PaymentConfirmScreen`);
        if (activeRole === 'DELIVERY') {
          navigation.reset({ index: 0, routes: [{ name: 'DeliveryRiderHomeScreen' }] });
        } else if (activeRole === 'SUPPLIER') {
          navigation.reset({ index: 0, routes: [{ name: 'RiderHomeScreen' }] });
        } else {
          navigation.reset({ index: 0, routes: [{ name: 'RoleSelection' }] });
        }
      }
    };
    checkRoleGuard();
  }, [navigation]);

  const handleCallRestaurant = () => {
    if (restoPhone) {
      Linking.openURL(`tel:${restoPhone}`);
    } else {
      Alert.alert('Calling Restaurant', `Dialing restaurant partner at ${restoName}...`);
    }
  };

  // Hardware Back Button Handler for Customer Food Screen
  useEffect(() => {
    const backAction = () => {
      if (isFoodDelivery) {
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.navigate('CustomerHomeScreen');
        }
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [isFoodDelivery, navigation]);

  // Authoritative Restaurant Location Fetcher (Pulls real GPS coordinates from MongoDB)
  useEffect(() => {
    let isMounted = true;
    const fetchAuthoritativeRestoLocation = async () => {
      const targetId = rId || activeFoodOrder?.restaurantId || activeFoodOrder?.providerId;
      if (!targetId) return;

      try {
        const availRes = await api.get(`/profile/restaurant-availability/${targetId}`);
        if (isMounted && availRes.data?.success) {
          const d = availRes.data;
          const cat = d.categoryName || d.businessCategoryName || d.partnerType || d.businessType;
          if (cat) setFetchedStoreCategory(cat);
          const lat = Number(d.businessLatitude || d.latitude);
          const lon = Number(d.businessLongitude || d.longitude);
          if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
            setRestoCoords({ latitude: lat, longitude: lon });
            if (d.location || d.address) setRestoAddressText(d.location || d.address);
            if (d.restaurantName || d.name) setRestoDisplayName(d.restaurantName || d.name);

            if (webViewRef.current) {
              webViewRef.current.injectJavaScript(`
                if (typeof window !== 'undefined') {
                  window.postMessage(JSON.stringify({
                    type: 'UPDATE_RESTO_LOCATION',
                    latitude: ${lat},
                    longitude: ${lon},
                    name: ${JSON.stringify(d.restaurantName || d.name || 'Restaurant')}
                  }), '*');
                }
                true;
              `);
            }
            return;
          }
        }

        const profRes = await api.get(`/profile/${targetId}`);
        if (isMounted && profRes.data?.success && profRes.data.profile) {
          const p = profRes.data.profile;
          const cat = p.categoryName || p.businessCategoryName || p.partnerType || p.businessType;
          if (cat) setFetchedStoreCategory(cat);
          const lat = Number(p.businessLatitude || p.latitude || p.locationCoords?.latitude);
          const lon = Number(p.businessLongitude || p.longitude || p.locationCoords?.longitude);
          if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
            setRestoCoords({ latitude: lat, longitude: lon });
            if (p.location || p.address) setRestoAddressText(p.location || p.address);
            if (p.name || p.restaurantName) setRestoDisplayName(p.name || p.restaurantName);

            if (webViewRef.current) {
              webViewRef.current.injectJavaScript(`
                if (typeof window !== 'undefined') {
                  window.postMessage(JSON.stringify({
                    type: 'UPDATE_RESTO_LOCATION',
                    latitude: ${lat},
                    longitude: ${lon},
                    name: ${JSON.stringify(p.restaurantName || p.name || 'Restaurant')}
                  }), '*');
                }
                true;
              `);
            }
          }
        }
      } catch (err) {
        console.log('[RESTO COORDS FETCH NOTICE]', err);
      }
    };

    fetchAuthoritativeRestoLocation();

    if (socket) {
      const onRestoLocUpdate = (data: any) => {
        const targetId = rId || activeFoodOrder?.restaurantId || activeFoodOrder?.providerId;
        if (data && (String(data.restaurantId) === String(targetId) || String(data.id) === String(targetId))) {
          const lat = Number(data.latitude);
          const lon = Number(data.longitude);
          if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0 && isMounted) {
            setRestoCoords({ latitude: lat, longitude: lon });
            if (data.address || data.location) setRestoAddressText(data.address || data.location);
            if (webViewRef.current) {
              webViewRef.current.injectJavaScript(`
                if (typeof window !== 'undefined') {
                  window.postMessage(JSON.stringify({
                    type: 'UPDATE_RESTO_LOCATION',
                    latitude: ${lat},
                    longitude: ${lon}
                  }), '*');
                }
                true;
              `);
            }
          }
        }
      };

      socket.on('RESTAURANT_LOCATION_UPDATED', onRestoLocUpdate);
      socket.on('RESTAURANT_UPDATED', onRestoLocUpdate);
      socket.on('rider_location_update', onRestoLocUpdate);

      return () => {
        isMounted = false;
        socket.off('RESTAURANT_LOCATION_UPDATED', onRestoLocUpdate);
        socket.off('RESTAURANT_UPDATED', onRestoLocUpdate);
        socket.off('rider_location_update', onRestoLocUpdate);
      };
    }

    return () => {
      isMounted = false;
    };
  }, [rId, activeFoodOrder, socket]);

  // 1. Auto-fetch or initialize Customer Location & Delivery Address on Payment Screen
  // Function to fetch real-time device GPS location and reverse geocode it
  const fetchLiveGps = async () => {
    try {
      setFetchingGps(true);
      const pos = await fetchCurrentGpsPosition(false);
      if (pos?.latitude && pos?.longitude) {
        setGpsInfo(pos);
        const geo = await reverseGeocodeCoords(pos.latitude, pos.longitude);
        const liveAddr: DeliveryAddress = {
          id: `addr_live_${Date.now()}`,
          tag: 'Other',
          houseNo: geo.area || 'Current Location',
          landmark: geo.fullAddress,
          city: geo.city || 'Bhopal',
          pincode: geo.pincode || '',
          fullAddress: geo.fullAddress,
          latitude: pos.latitude,
          longitude: pos.longitude,
          isCurrentLocation: true,
        };
        await saveAddressToStorage(liveAddr);
        setDeliveryAddress(liveAddr);

        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(`
            if (typeof window !== 'undefined') {
              window.postMessage(JSON.stringify({
                type: 'UPDATE_LOCATION',
                latitude: ${pos.latitude},
                longitude: ${pos.longitude},
                timestamp: ${pos.timestamp || Date.now()}
              }), '*');
            }
            true;
          `);
        }
      } else if (passedCoords?.latitude && passedCoords?.longitude) {
        setGpsInfo({
          latitude: passedCoords.latitude,
          longitude: passedCoords.longitude,
          accuracy: 5.0,
          timestamp: Date.now(),
        });
        const geo = await reverseGeocodeCoords(passedCoords.latitude, passedCoords.longitude);
        const fallbackAddr: DeliveryAddress = {
          id: `addr_coords_${Date.now()}`,
          tag: 'Other',
          houseNo: geo.area || 'Current Location',
          landmark: geo.fullAddress,
          city: geo.city || 'Bhopal',
          pincode: geo.pincode || '',
          fullAddress: geo.fullAddress,
          latitude: passedCoords.latitude,
          longitude: passedCoords.longitude,
          isCurrentLocation: true,
        };
        setDeliveryAddress(fallbackAddr);
      }
    } catch (e) {
      console.log('[PAYMENT CONFIRM LIVE GPS ERROR]', e);
    } finally {
      setFetchingGps(false);
    }
  };

  // 1. Auto-fetch or initialize Customer Location & Delivery Address on Payment Screen
  useEffect(() => {
    let isMounted = true;
    const initAddress = async () => {
      // If no address or address is GPS detected, fetch fresh live GPS from device
      if (!deliveryAddress || deliveryAddress.isCurrentLocation) {
        await fetchLiveGps();
      } else {
        const active = await getActiveDeliveryAddress();
        if (isMounted && active) {
          setDeliveryAddress(active);
        } else {
          await fetchLiveGps();
        }
      }
    };

    initAddress();
    return () => {
      isMounted = false;
    };
  }, []);

  // Effective coordinates of customer (100% real physical device GPS / address, 0% dummy data)
  const effectiveCoords = useMemo(() => {
    const lat = Number(deliveryAddress?.latitude || passedCoords?.latitude || 0);
    const lon = Number(deliveryAddress?.longitude || passedCoords?.longitude || 0);
    return {
      latitude: lat,
      longitude: lon,
    };
  }, [deliveryAddress, passedCoords]);

  // 2. Real-Time Dynamic Rider Delivery Fee Calculation based on Restaurant Distance
  // Formula: Fixed ₹20 for <= 2.0 km (1 km or 1 to 2 km); ₹20 + ₹10/km for distance beyond 2 km
  const riderFeeCalculation = useMemo(() => {
    if (!isFoodDelivery) {
      return { fee: 0, distanceKm: 0, formulaNote: '' };
    }
    const dist = calculateHaversineDistanceKm(
      restoLat,
      restoLon,
      effectiveCoords.latitude,
      effectiveCoords.longitude
    );
    return calculateRiderDeliveryFee(dist);
  }, [isFoodDelivery, restoLat, restoLon, effectiveCoords]);

  const effectiveDeliveryFee = isFoodDelivery ? riderFeeCalculation.fee : 0;
  const effectiveRainFee = (isFoodDelivery && isRaining) ? (rainSurgeFee || 10) : 0;
  const effectiveSubtotal = isFoodDelivery
    ? Number(initialSubtotal || route.params?.subtotal || Math.max(0, initialPrice - (initialDeliveryFee || 20)))
    : initialPrice;
  const effectiveTaxes = 0; // 5% tax completely eliminated per requirement 8

  const baseOrderTotal = isFoodDelivery
    ? effectiveSubtotal + effectiveDeliveryFee + effectiveRainFee
    : initialPrice;

  const totalPayable = Math.max(0, baseOrderTotal - discountAmount);

  // Fetch Wallet Balance initially
  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const res = await api.get('/payments/my-earnings');
        if (res.data?.success) {
          setWalletBalance(res.data.walletBalance || 0);
        }
      } catch (e) {
        console.log('Error fetching wallet balance on checkout:', e);
      }
    };
    fetchBalance();
  }, []);

  const handleCancelSearching = async () => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    setBookingState('idle');
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        if (typeof window !== 'undefined' && typeof window.postMessage === 'function') {
          window.postMessage(JSON.stringify({ type: 'STOP_SEARCH' }), '*');
        }
        true;
      `);
    }
    const bId = effectiveRideId || (route.params as any)?.rideId || (route.params as any)?.bookingId;
    if (bId) {
      try {
        await api.put('/bookings/status', {
          bookingId: bId,
          status: 'CANCELLED',
          cancelledBy: 'CUSTOMER',
          cancellationReason: 'Cancelled by customer',
        });
      } catch (e) {
        console.log('Error cancelling booking:', e);
      }
    }
  };

  // Hardware Back button handling while searching or ringing
  useEffect(() => {
    const onBackPress = () => {
      if (
        foodOrderStatus === 'RINGING' ||
        foodOrderStatus === 'RESTAURANT_ACCEPTED' ||
        foodOrderStatus === 'PREPARING' ||
        foodOrderStatus === 'FOOD_READY'
      ) {
        // Do NOT cancel the food order! Keep the request running in background.
        navigation.goBack();
        return true;
      }
      if (bookingState === 'searching') {
        handleCancelSearching();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [bookingState, foodOrderStatus, effectiveRideId, navigation]);

  // Manage Searching Overlay animations and timeouts (safely guarded)
  useEffect(() => {
    if (bookingState === 'searching') {
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          if (typeof window !== 'undefined' && typeof window.postMessage === 'function') {
            window.postMessage(JSON.stringify({ type: 'START_SEARCH' }), '*');
          }
          true;
        `);
      }

      if (!searchTimeoutRef.current) {
        searchTimeoutRef.current = setTimeout(async () => {
          handleCancelSearching();
          Alert.alert('Timeout', 'Searching took too long. Please try again.');
        }, 60000);
      }
    } else {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
    };
  }, [bookingState, effectiveRideId]);

  useEffect(() => {
    if (!socket) return;

    // Fetch real nearby riders when screen loads
    socket.emit('get_nearby_riders', {
      latitude: effectiveCoords.latitude,
      longitude: effectiveCoords.longitude,
      radiusKm: 10,
    });

    const onNearbyRiders = (riders: any[]) => {
      if (webViewRef.current && riders.length > 0) {
        webViewRef.current.injectJavaScript(`
          window.postMessage(JSON.stringify({ type: 'UPDATE_REAL_RIDERS', riders: ${JSON.stringify(riders)} }), '*');
          true;
        `);
      }
    };

    const onRejection = async (data: any) => {
      if (data.rideId === effectiveRideId) {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        setBookingState('idle');
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(`
            if (typeof window !== 'undefined' && typeof window.postMessage === 'function') {
              window.postMessage(JSON.stringify({ type: 'STOP_SEARCH' }), '*');
            }
            true;
          `);
        }

        try {
          await api.put('/bookings/status', {
            bookingId: effectiveRideId,
            status: 'CANCELLED',
            cancelledBy: 'customer',
            cancellationReason: data.message || 'No providers nearby.',
          });
        } catch (e) {
          console.log('Error updating booking status to cancelled on rejection:', e);
        }

        Alert.alert('No Providers Nearby', data.message || 'Sorry, we could not find any providers near your location. Please try again later.');
      }
    };

    const onAccepted = (data: any) => {
      const bId = data?.rideId || data?.bookingId;
      const currentBId = activeFoodOrder?.bookingId || activeFoodOrder?.rideId || effectiveRideId;
      if (bId === currentBId || bId === effectiveRideId) {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        setBookingState('found');
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(`
            window.postMessage(JSON.stringify({ type: 'SUPPLIER_FOUND' }), '*');
            true;
          `);
        }
        if (isFoodDelivery) {
          // Food order stays on PaymentConfirmScreen - NO auto-navigation to LiveTracking
          setFoodOrderStatus('OUT_FOR_DELIVERY');
          setActiveFoodOrder((prev: any) => ({
            ...(prev || {}),
            ...(data?.booking || data || {}),
            status: 'OUT_FOR_DELIVERY',
          }));
          return;
        }
        setTimeout(() => {
          navigation.replace('LiveTracking', { ride: data, isRider: false });
        }, 1500);
      }
    };

    socket.on('nearby_riders_update', onNearbyRiders);
    socket.on('no_provider_available', onRejection);
    socket.on('service_rejected', onRejection);
    socket.on('ride_accepted', onAccepted);
    socket.on('service_accepted', onAccepted);

    return () => {
      socket.off('nearby_riders_update', onNearbyRiders);
      socket.off('no_provider_available', onRejection);
      socket.off('service_rejected', onRejection);
      socket.off('ride_accepted', onAccepted);
      socket.off('service_accepted', onAccepted);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [socket, effectiveCoords, effectiveRideId, isFoodDelivery, activeFoodOrder?.bookingId, activeFoodOrder?.rideId]);

  // Register customer with socket room
  useEffect(() => {
    if (!socket) return;
    const myId = (user?._id || user?.id)?.toString();
    if (myId) {
      socket.emit('register_user', myId);
    }
  }, [socket, user?._id, user?.id]);

  // Real-time socket listeners for food order lifecycle
  useEffect(() => {
    if (!socket) return;

    const onRestaurantAccepted = (data: any) => {
      const bId = data?.bookingId || data?.rideId;
      const currentBId = activeFoodOrder?.bookingId || activeFoodOrder?.rideId || effectiveRideId;
      if (bId && currentBId && bId !== currentBId) return;

      console.log('📢 [CUSTOMER] Restaurant accepted order:', data);
      setFoodOrderStatus('PREPARING');
      setActiveFoodOrder((prev: any) => ({
        ...(prev || {}),
        ...(data?.booking || data || {}),
        status: 'PREPARING',
        restaurantName: data?.restaurantName || prev?.restaurantName || restoName,
      }));

      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      Alert.alert('Restaurant Accepted! 🎉', 'The restaurant partner has accepted your order and is now preparing your food fresh.');
    };

    const onFoodReady = (data: any) => {
      const bId = data?.bookingId || data?.rideId;
      const currentBId = activeFoodOrder?.bookingId || activeFoodOrder?.rideId || effectiveRideId;
      if (bId && currentBId && bId !== currentBId) return;

      console.log('📢 [CUSTOMER] Food is ready:', data);
      setFoodOrderStatus('FOOD_READY');
      setActiveFoodOrder((prev: any) => ({
        ...(prev || {}),
        ...(data?.booking || data || {}),
        status: 'FOOD_READY',
      }));
      Alert.alert(
        `Your Order Is Ready! ${categoryTerminology.icon}`,
        orderCategoryName.toLowerCase() === 'food'
          ? 'Your meal has been freshly cooked and packed. Ready for pickup / delivery.'
          : `Your ${orderCategoryName.toLowerCase()} order has been safely packed. Ready for pickup / delivery.`
      );
    };

    const onRestaurantDeclined = (data: any) => {
      const bId = data?.bookingId || data?.rideId;
      const currentBId = activeFoodOrder?.bookingId || activeFoodOrder?.rideId || effectiveRideId;
      if (bId && currentBId && bId !== currentBId) return;

      console.log('📢 [CUSTOMER] Restaurant declined order:', data);
      setFoodOrderStatus('RESTAURANT_DECLINED');
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };

    const onFoodStatusUpdated = (data: any) => {
      const bId = data?.bookingId || data?.rideId;
      const currentBId = activeFoodOrder?.bookingId || activeFoodOrder?.rideId || effectiveRideId;
      if (bId && currentBId && bId !== currentBId) return;

      const st = (data?.status || '').toUpperCase();
      console.log('📢 [CUSTOMER] Food order status updated via socket:', st, data);

      if (st === 'RESTAURANT_ACCEPTED' || st === 'PREPARING' || st === 'FOOD_PREPARING' || st === 'ACCEPTED') {
        setFoodOrderStatus('PREPARING');
        setActiveFoodOrder((prev: any) => ({
          ...(prev || {}),
          ...(data?.booking || data || {}),
          status: 'PREPARING',
        }));
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      } else if (st === 'FOOD_READY' || st === 'READY_FOR_PICKUP' || st === 'READY') {
        setFoodOrderStatus('FOOD_READY');
        setActiveFoodOrder((prev: any) => ({
          ...(prev || {}),
          ...(data?.booking || data || {}),
          status: 'FOOD_READY',
        }));
      } else if (st === 'OUT_FOR_DELIVERY' || st === 'STARTED' || st === 'IN_TRANSIT' || st === 'PICKED_UP' || st === 'ON_THE_WAY') {
        setFoodOrderStatus('OUT_FOR_DELIVERY');
        setActiveFoodOrder((prev: any) => ({
          ...(prev || {}),
          ...(data?.booking || data || {}),
          status: 'OUT_FOR_DELIVERY',
        }));
      } else if (st === 'COMPLETED' || st === 'SERVICE_COMPLETED' || st === 'DELIVERED') {
        setFoodOrderStatus('COMPLETED');
        setActiveFoodOrder((prev: any) => ({
          ...(prev || {}),
          ...(data?.booking || data || {}),
          status: 'COMPLETED',
        }));
        AsyncStorage.removeItem('active_food_booking_id').catch(() => {});
      } else if (st === 'RESTAURANT_DECLINED' || st === 'NO_RESPONSE' || st === 'CANCELLED') {
        setFoodOrderStatus('RESTAURANT_DECLINED');
      }
    };

    const onServiceCompleted = (data: any) => {
      const bId = data?.bookingId || data?.rideId;
      const currentBId = activeFoodOrder?.bookingId || activeFoodOrder?.rideId || effectiveRideId;
      if (bId && currentBId && bId !== currentBId) return;

      console.log('📢 [CUSTOMER] Service/Food order completed:', data);
      setFoodOrderStatus('COMPLETED');
      setActiveFoodOrder((prev: any) => ({
        ...(prev || {}),
        ...(data?.booking || data || {}),
        status: 'COMPLETED',
      }));
      AsyncStorage.removeItem('active_food_booking_id').catch(() => {});
    };

    const onOrderTimedOut = (data: any) => {
      const bId = data?.bookingId || data?.rideId;
      const currentBId = activeFoodOrder?.bookingId || activeFoodOrder?.rideId || effectiveRideId;
      if (bId && currentBId && bId !== currentBId) return;

      console.log('📢 [CUSTOMER] Order timed out:', data);
      setFoodOrderStatus('TIMEOUT');
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      AsyncStorage.removeItem('active_food_booking_id').catch(() => {});
      AsyncStorage.removeItem('active_food_order_data').catch(() => {});
    };

    const onRestaurantRinging = (data: any) => {
      const bId = data?.bookingId || data?.rideId;
      const currentBId = activeFoodOrder?.bookingId || activeFoodOrder?.rideId || effectiveRideId;
      if (bId && currentBId && bId !== currentBId) return;

      console.log('🔔 [CUSTOMER] Restaurant ringing acknowledgement received:', data);
      setFoodOrderStatus('RINGING');
      setRingingCountdown(60);
    };

    socket.on('RESTAURANT_ACCEPTED', onRestaurantAccepted);
    socket.on('restaurant_accepted', onRestaurantAccepted);
    socket.on('FOOD_READY', onFoodReady);
    socket.on('food_ready', onFoodReady);
    socket.on('RESTAURANT_DECLINED', onRestaurantDeclined);
    socket.on('restaurant_declined', onRestaurantDeclined);
    socket.on('OUT_FOR_DELIVERY', onFoodStatusUpdated);
    socket.on('out_for_delivery', onFoodStatusUpdated);
    socket.on('order_status_updated', onFoodStatusUpdated);
    socket.on('service_completed', onServiceCompleted);
    socket.on('ORDER_COMPLETED', onServiceCompleted);
    socket.on('order_completed', onServiceCompleted);
    socket.on('delivery_completed', onServiceCompleted);
    socket.on('order_timed_out', onOrderTimedOut);
    socket.on('restaurant_ringing', onRestaurantRinging);
    socket.on('restaurant_ringing_started', onRestaurantRinging);

    return () => {
      socket.off('RESTAURANT_ACCEPTED', onRestaurantAccepted);
      socket.off('restaurant_accepted', onRestaurantAccepted);
      socket.off('FOOD_READY', onFoodReady);
      socket.off('food_ready', onFoodReady);
      socket.off('RESTAURANT_DECLINED', onRestaurantDeclined);
      socket.off('restaurant_declined', onRestaurantDeclined);
      socket.off('OUT_FOR_DELIVERY', onFoodStatusUpdated);
      socket.off('out_for_delivery', onFoodStatusUpdated);
      socket.off('order_status_updated', onFoodStatusUpdated);
      socket.off('service_completed', onServiceCompleted);
      socket.off('ORDER_COMPLETED', onServiceCompleted);
      socket.off('order_completed', onServiceCompleted);
      socket.off('delivery_completed', onServiceCompleted);
      socket.off('order_timed_out', onOrderTimedOut);
      socket.off('restaurant_ringing', onRestaurantRinging);
      socket.off('restaurant_ringing_started', onRestaurantRinging);
    };
  }, [socket, activeFoodOrder?.bookingId, activeFoodOrder?.rideId, effectiveRideId]);

  // Real-time GPS Location tracking for Rider on Customer Map
  useEffect(() => {
    if (!socket) return;
    const bId = effectiveRideId || activeFoodOrder?.bookingId || activeFoodOrder?.rideId || (route.params as any)?.bookingId || (route.params as any)?.rideId;
    if (!bId) return;

    console.log(`[CUSTOMER_MAP] Joining booking room for live GPS: booking_${bId}`);
    socket.emit('join_booking_room', { bookingId: bId });

    const onRiderLoc = (data: any) => {
      const lat = Number(data?.latitude || data?.location?.latitude || 0);
      const lon = Number(data?.longitude || data?.location?.longitude || 0);
      const heading = Number(data?.heading || 0);
      const isPickedUp = ['OUT_FOR_DELIVERY', 'PICKED_UP', 'FOOD_PICKED_UP', 'STARTED', 'IN_TRANSIT'].includes(foodOrderStatus);

      if (lat !== 0 && lon !== 0 && webViewRef.current) {
        console.log(`📍 [CUSTOMER_MAP_GPS] Live Rider GPS received: lat=${lat}, lon=${lon}, heading=${heading}`);
        webViewRef.current.injectJavaScript(`
          if (typeof window !== 'undefined' && typeof window.postMessage === 'function') {
            window.postMessage(JSON.stringify({
              type: 'UPDATE_RIDER_LOCATION',
              latitude: ${lat},
              longitude: ${lon},
              heading: ${heading},
              isPickedUp: ${isPickedUp}
            }), '*');
          }
          true;
        `);
      }
    };

    socket.on('rider_location_updated', onRiderLoc);
    socket.on(`provider_location_${bId}`, onRiderLoc);

    return () => {
      console.log(`[CUSTOMER_MAP] Leaving booking room: booking_${bId}`);
      socket.emit('leave_booking_room', { bookingId: bId });
      socket.off('rider_location_updated', onRiderLoc);
      socket.off(`provider_location_${bId}`, onRiderLoc);
    };
  }, [socket, effectiveRideId, activeFoodOrder?.bookingId, activeFoodOrder?.rideId, (route.params as any)?.bookingId, (route.params as any)?.rideId, foodOrderStatus]);

  // Production-Grade Authoritative Sync: Single Source of Truth is MongoDB
  const syncAuthoritativeOrderStatus = useCallback(async () => {
    if (!isFoodDelivery) return;

    try {
      const savedBookingId = await AsyncStorage.getItem('active_food_booking_id');
      const bId = savedBookingId || route.params?.bookingId || route.params?.rideId;

      if (bId) {
        try {
          const res = await api.get(`/bookings/details/${bId}`);
          if (res.data?.success && res.data.booking) {
            const b = res.data.booking;
            const st = (b.status || '').toUpperCase();
            console.log(`🔍 [AUTHORITATIVE DB SYNC] Order #${b.bookingId} status: "${st}", prep: ${b.preparationTime}m`);

            if (st === 'RESTAURANT_ACCEPTED' || st === 'PREPARING' || st === 'ACCEPTED' || st === 'FOOD_PREPARING') {
              setFoodOrderStatus('PREPARING');
              setActiveFoodOrder(b);
              if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
                countdownIntervalRef.current = null;
              }
              return;
            } else if (st === 'FOOD_READY' || st === 'READY_FOR_PICKUP' || st === 'READY') {
              setFoodOrderStatus('FOOD_READY');
              setActiveFoodOrder(b);
              if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
                countdownIntervalRef.current = null;
              }
              return;
            } else if (st === 'OUT_FOR_DELIVERY' || st === 'STARTED' || st === 'IN_TRANSIT' || st === 'PICKED_UP' || st === 'ON_THE_WAY') {
              setFoodOrderStatus('OUT_FOR_DELIVERY');
              setActiveFoodOrder(b);
              if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
                countdownIntervalRef.current = null;
              }
              return;
            } else if (st === 'COMPLETED' || st === 'SERVICE_COMPLETED' || st === 'DELIVERED') {
              setFoodOrderStatus('COMPLETED');
              setActiveFoodOrder(b);
              AsyncStorage.removeItem('active_food_booking_id').catch(() => {});
              if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
                countdownIntervalRef.current = null;
              }
              return;
            } else if (st === 'RESTAURANT_DECLINED' || st === 'NO_RESPONSE' || st === 'CANCELLED') {
              setFoodOrderStatus('RESTAURANT_DECLINED');
              setActiveFoodOrder(b);
              if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
                countdownIntervalRef.current = null;
              }
              return;
            } else if (st === 'PENDING_RESTAURANT' || st === 'RINGING') {
              const createdAtMs = new Date(b.createdAt).getTime();
              const elapsedSec = Math.floor((Date.now() - createdAtMs) / 1000);
              const remainingSec = Math.max(0, 60 - elapsedSec);
              if (remainingSec > 0) {
                setRingingCountdown(remainingSec);
                setFoodOrderStatus(st === 'RINGING' ? 'RINGING' : 'CONNECTING');
                setActiveFoodOrder(b);
              } else {
                setFoodOrderStatus('TIMEOUT');
                setActiveFoodOrder(b);
                AsyncStorage.removeItem('active_food_booking_id').catch(() => {});
                AsyncStorage.removeItem('active_food_order_data').catch(() => {});
              }
              return;
            }
          }
        } catch (detailErr) {
          console.log('[DETAIL DB SYNC NOTICE]', detailErr);
        }
      }

      // Check active booking for customer in MongoDB
      const uId = user?._id || user?.id;
      if (uId) {
        const activeRes = await api.get(`/bookings/active?customerId=${uId}&role=customer`);
        if (activeRes.data?.success && activeRes.data.activeBooking) {
          const ab = activeRes.data.activeBooking;
          const st = (ab.status || '').toUpperCase();
          if (st === 'RESTAURANT_ACCEPTED' || st === 'PREPARING' || st === 'ACCEPTED' || st === 'FOOD_PREPARING') {
            setFoodOrderStatus('PREPARING');
            setActiveFoodOrder(ab);
          } else if (st === 'FOOD_READY' || st === 'READY_FOR_PICKUP' || st === 'READY') {
            setFoodOrderStatus('FOOD_READY');
            setActiveFoodOrder(ab);
          } else if (st === 'OUT_FOR_DELIVERY' || st === 'STARTED' || st === 'IN_TRANSIT' || st === 'PICKED_UP' || st === 'ON_THE_WAY') {
            setFoodOrderStatus('OUT_FOR_DELIVERY');
            setActiveFoodOrder(ab);
          } else if (st === 'COMPLETED' || st === 'SERVICE_COMPLETED' || st === 'DELIVERED') {
            setFoodOrderStatus('COMPLETED');
            setActiveFoodOrder(ab);
          } else if (st === 'PENDING_RESTAURANT' || st === 'RINGING') {
            const createdAtMs = new Date(ab.createdAt).getTime();
            const elapsedSec = Math.floor((Date.now() - createdAtMs) / 1000);
            const remainingSec = Math.max(0, 60 - elapsedSec);
            if (remainingSec > 0) {
              setRingingCountdown(remainingSec);
              setFoodOrderStatus(st === 'RINGING' ? 'RINGING' : 'CONNECTING');
              setActiveFoodOrder(ab);
            } else {
              setFoodOrderStatus('TIMEOUT');
              setActiveFoodOrder(ab);
              AsyncStorage.removeItem('active_food_booking_id').catch(() => {});
              AsyncStorage.removeItem('active_food_order_data').catch(() => {});
            }
          }
        }
      }
    } catch (e) {
      console.log('[AUTHORITATIVE STATUS SYNC ERROR]', e);
    }
  }, [isFoodDelivery, effectiveRideId, route.params?.bookingId, route.params?.rideId, user?._id, user?.id]);

  useFocusEffect(
    useCallback(() => {
      syncAuthoritativeOrderStatus();
    }, [syncAuthoritativeOrderStatus])
  );

  // 1-minute visual countdown timer (01:00 -> 00:00)
  useEffect(() => {
    if (foodOrderStatus === 'RINGING') {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

      countdownIntervalRef.current = setInterval(async () => {
        setRingingCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;

            // Check MongoDB one last time
            const bId = activeFoodOrder?.bookingId || effectiveRideId;
            if (bId) {
              api.get(`/bookings/details/${bId}`).then((res) => {
                const b = res.data?.booking;
                const st = (b?.status || '').toUpperCase();
                if (st === 'RESTAURANT_ACCEPTED' || st === 'PREPARING') {
                  setPrepMinutes(b.preparationTime || 15);
                  setFoodOrderStatus('RESTAURANT_ACCEPTED');
                  setActiveFoodOrder(b);
                } else if (st === 'FOOD_READY') {
                  setFoodOrderStatus('FOOD_READY');
                  setActiveFoodOrder(b);
                } else {
                  if (socket) {
                    socket.emit('food_order_timeout', {
                      bookingId: bId,
                      rideId: bId,
                      restaurantId: rId,
                      customerId: user?._id || user?.id,
                    });
                  }
                  api.put('/bookings/status', {
                    bookingId: bId,
                    status: 'TIMEOUT',
                    cancellationReason: 'No restaurant accepted your order within 1 minute',
                  }).catch(() => {});
                  setFoodOrderStatus('TIMEOUT');
                  AsyncStorage.removeItem('active_food_booking_id').catch(() => {});
                  AsyncStorage.removeItem('active_food_order_data').catch(() => {});
                }
              }).catch(() => {
                setFoodOrderStatus('TIMEOUT');
                AsyncStorage.removeItem('active_food_booking_id').catch(() => {});
                AsyncStorage.removeItem('active_food_order_data').catch(() => {});
              });
            } else {
              setFoodOrderStatus('TIMEOUT');
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    }

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [foodOrderStatus, activeFoodOrder?.bookingId, effectiveRideId]);

  // Safety timer for 'CONNECTING' state (syncs restaurant status from DB after buffer)
  useEffect(() => {
    let connectingTimer: any = null;
    if (foodOrderStatus === 'CONNECTING') {
      connectingTimer = setTimeout(async () => {
        const bId = activeFoodOrder?.bookingId || effectiveRideId;
        if (!bId) return;
        try {
          const res = await api.get(`/bookings/details/${bId}`);
          const b = res.data?.booking;
          const st = (b?.status || '').toUpperCase();
          if (st === 'RINGING') {
            setFoodOrderStatus('RINGING');
            setRingingCountdown(60);
          } else if (st === 'RESTAURANT_ACCEPTED' || st === 'PREPARING') {
            setFoodOrderStatus('RESTAURANT_ACCEPTED');
            setActiveFoodOrder(b);
          } else if (st === 'CANCELLED') {
            setFoodOrderStatus('CANCELLED');
          }
        } catch (e) {}
      }, 31000);
    }
    return () => {
      if (connectingTimer) clearTimeout(connectingTimer);
    };
  }, [foodOrderStatus, activeFoodOrder, effectiveRideId, socket]);

  // Ringing Pulse Animation
  useEffect(() => {
    if (foodOrderStatus === 'RINGING') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(ringingPulseAnim, {
            toValue: 1.15,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(ringingPulseAnim, {
            toValue: 1.0,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      ringingPulseAnim.setValue(1);
    }
  }, [foodOrderStatus, ringingPulseAnim]);

  const handleCancelFoodOrder = async () => {
    Alert.alert(
      'Cancel Order',
      'Are you sure you want to cancel this food order?',
      [
        { text: 'No, Keep Waiting', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
            }
            const bId = activeFoodOrder?.bookingId || activeFoodOrder?.rideId || activeFoodOrder?._id || effectiveRideId;
            const custId = activeFoodOrder?.customerId || user?._id || user?.id;
            const restoId = activeFoodOrder?.restaurantId || activeFoodOrder?.providerId;

            if (bId) {
              isCancellationEventProcessed(bId, 'CUSTOMER_CANCELLED');
            }

            // 1. Emit instant socket cancellation events
            if (socket) {
              const cancelPayload = {
                bookingId: bId,
                rideId: bId,
                customerId: custId,
                restaurantId: restoId,
                cancelledBy: 'CUSTOMER',
                reason: 'Cancelled by customer during ringing',
                cancellationReason: 'Cancelled by customer during ringing',
              };
              socket.emit('booking_cancelled_by_customer', cancelPayload);
              socket.emit('order_cancelled', cancelPayload);
              socket.emit('ride_cancelled', cancelPayload);
              socket.emit('service_cancelled', cancelPayload);
            }

            // 2. Put status to backend API
            try {
              await api.put('/bookings/status', {
                bookingId: bId,
                status: 'CANCELLED',
                cancelledBy: 'CUSTOMER',
                cancellationReason: 'Cancelled by customer during ringing',
              });
            } catch (e) {
              console.log('[CANCEL ORDER NOTICE]', e);
            }

            // 3. Purge storage & clear cart
            await AsyncStorage.removeItem('active_food_booking_id').catch(() => {});
            await AsyncStorage.removeItem('active_food_order_data').catch(() => {});
            await CartService.clearCart().catch(() => {});

            setFoodOrderStatus('IDLE');
            setActiveFoodOrder(null);
            handleGoHome();
          },
        },
      ]
    );
  };

  const handleResetFoodOrder = async () => {
    try {
      await AsyncStorage.removeItem('active_food_booking_id');
      await AsyncStorage.removeItem('active_food_order_data');
      await CartService.clearCart();
    } catch (e) {}
    setFoodOrderStatus('IDLE');
    setActiveFoodOrder(null);
    navigation.goBack();
  };

  const handleGoHome = async () => {
    try {
      // 1. Completely clear and reset Cart so cart is refreshed and removed from Home Screen
      await CartService.clearCart();
    } catch (e) {}

    try {
      await AsyncStorage.removeItem('active_food_booking_id');
      await AsyncStorage.removeItem('active_food_order_data');
    } catch (e) {}

    setFoodOrderStatus('IDLE');
    setActiveFoodOrder(null);

    // 2. Reset and navigate directly to CustomerHomeScreen
    navigation.reset({
      index: 0,
      routes: [{ name: 'CustomerHomeScreen' }],
    });
  };

  const handleTrackLiveMap = () => {
    const currentRide = activeFoodOrder || rideStore.getCurrentRide() || {
      bookingId: effectiveRideId,
      rideId: effectiveRideId,
      status: foodOrderStatus,
      restaurantName: restoName,
      restaurantId: rId,
      providerId: rId,
      pickupLatitude: restoLat,
      pickupLongitude: restoLon,
      pickupAddress: restoAddress,
      destinationLatitude: effectiveCoords.latitude,
      destinationLongitude: effectiveCoords.longitude,
      destinationAddress: deliveryAddress?.fullAddress,
      price: totalPayable,
      latitude: effectiveCoords.latitude,
      longitude: effectiveCoords.longitude,
      categoryName: orderCategoryName,
      serviceName: orderCategoryName,
    };
    navigation.navigate('LiveTracking', {
      ride: {
        ...currentRide,
        restaurantId: currentRide.restaurantId || rId,
        providerId: currentRide.providerId || rId,
        pickupLatitude: currentRide.pickupLatitude || restoLat,
        pickupLongitude: currentRide.pickupLongitude || restoLon,
        destinationLatitude: currentRide.destinationLatitude || effectiveCoords.latitude,
        destinationLongitude: currentRide.destinationLongitude || effectiveCoords.longitude,
        latitude: currentRide.latitude || effectiveCoords.latitude,
        longitude: currentRide.longitude || effectiveCoords.longitude,
        categoryName: currentRide.categoryName || orderCategoryName,
        serviceName: currentRide.serviceName || orderCategoryName,
      },
      isRider: false,
    });
  };

  // Client-Side Coupon Validation
  const handleApplyPromo = () => {
    setPromoError(null);
    setPromoSuccess(null);
    const code = promoCode.trim().toUpperCase();

    if (!code) {
      setPromoError('Please enter a coupon code.');
      return;
    }

    if (code === 'CLEAN20') {
      if (initialPrice < 999) {
        setPromoError('CLEAN20 is valid on bookings above ₹999.');
        return;
      }
      const disc = Math.round(initialPrice * 0.20);
      setDiscountAmount(disc);
      setAppliedPromo('CLEAN20');
      setPromoSuccess('CLEAN20 applied! 20% Discount credited.');
    } else if (code === 'ACCOOL') {
      if (initialPrice < 499) {
        setPromoError('ACCOOL is valid on bookings above ₹499.');
        return;
      }
      setDiscountAmount(150);
      setAppliedPromo('ACCOOL');
      setPromoSuccess('ACCOOL applied! ₹150 discount credited.');
    } else if (code === 'FREEFIX') {
      const lowerCat = categoryName.toLowerCase();
      if (!lowerCat.includes('plumbing') && !lowerCat.includes('inspection')) {
        setPromoError('FREEFIX is only valid on Plumbing Inspection services.');
        return;
      }
      setDiscountAmount(initialPrice); // 100% off
      setAppliedPromo('FREEFIX');
      setPromoSuccess('FREEFIX applied! Inspection service is free.');
    } else {
      setPromoError('Invalid promo code.');
    }
  };

  const handleRemovePromo = () => {
    setPromoCode('');
    setAppliedPromo(null);
    setDiscountAmount(0);
    setPromoError(null);
    setPromoSuccess(null);
  };

  const handleFindProfessionals = async () => {
    if (isSubmittingRef.current || loading) return;

    if (!selectedPayment) {
      Alert.alert('Payment Required', 'Please select a payment option first.');
      return;
    }

    if (isFoodDelivery && !deliveryAddress) {
      Alert.alert('Address Required', 'Please choose or add a delivery address to proceed.');
      setAddressModalVisible(true);
      return;
    }

    // ── Strict 5.0 KM Store Delivery Radius Check (Open Location Model) ──
    const custLat = effectiveCoords?.latitude || deliveryAddress?.latitude;
    const custLon = effectiveCoords?.longitude || deliveryAddress?.longitude;
    if (isFoodDelivery && custLat && custLon && restoLat && restoLon && restoLat !== 0 && restoLon !== 0) {
      const straightKm = calculateHaversineDistanceKm(custLat, custLon, restoLat, restoLon);
      if (straightKm !== null && straightKm > 5.0) {
        Alert.alert(
          'Outside 5 KM Delivery Radius 📍',
          `यह स्टोर आपकी लोकेशन से ${straightKm.toFixed(1)} km दूर है (अधिकतम 5.0 km दायरे में ऑर्डर उपलब्ध है)।`,
          [{ text: 'OK' }]
        );
        return;
      }
    }

    // REQUIREMENT: Cannot place new order until previous active order is completed
    if (isFoodDelivery) {
      try {
        const uId = user?._id || user?.id;
        const savedActiveId = await AsyncStorage.getItem('active_food_booking_id');
        let existingOrder: any = null;

        if (savedActiveId && savedActiveId !== effectiveRideId) {
          try {
            const checkActive = await api.get(`/bookings/details/${savedActiveId}`);
            if (checkActive.data?.success && checkActive.data.booking) {
              const b = checkActive.data.booking;
              const activeStatuses = [
                'PENDING_RESTAURANT',
                'RESTAURANT_ACCEPTED',
                'PREPARING',
                'FOOD_READY',
                'OUT_FOR_DELIVERY',
                'ACCEPTED',
                'STARTED',
                'PICKED_UP',
                'ON_THE_WAY',
              ];
              if (activeStatuses.includes((b.status || '').toUpperCase())) {
                existingOrder = b;
              }
            }
          } catch (e) {}
        }

        if (!existingOrder && uId) {
          try {
            const actRes = await api.get(`/bookings/active?customerId=${uId}&role=customer`);
            if (actRes.data?.success && actRes.data.activeBooking) {
              const ab = actRes.data.activeBooking;
              const activeStatuses = [
                'PENDING_RESTAURANT',
                'RESTAURANT_ACCEPTED',
                'PREPARING',
                'FOOD_READY',
                'OUT_FOR_DELIVERY',
                'ACCEPTED',
                'STARTED',
                'PICKED_UP',
                'ON_THE_WAY',
              ];
              if (activeStatuses.includes((ab.status || '').toUpperCase()) && ab.bookingId !== effectiveRideId) {
                existingOrder = ab;
              }
            }
          } catch (e) {}
        }

        if (existingOrder) {
          const createdMs = new Date(existingOrder.createdAt).getTime();
          const isStalePending =
            (existingOrder.status === 'PENDING_RESTAURANT' || existingOrder.status === 'RINGING') &&
            Date.now() - createdMs > 65000;

          if (isStalePending) {
            AsyncStorage.removeItem('active_food_booking_id').catch(() => {});
            AsyncStorage.removeItem('active_food_order_data').catch(() => {});
            existingOrder = null;
          } else {
            Alert.alert(
              'Active Order in Progress',
              `Aapka ek order (#${(existingOrder.bookingId || '').slice(-6)}) pehle se in-progress hai.\n\nJab tak pehla order complete nahi ho jata, aap doosra order nahi kar sakte. Agar aapko extra items mangwane the, toh pehle wale order me hi add karne hote hain.`,
              [
                {
                  text: 'View Current Order',
                  onPress: () => {
                    setFoodOrderStatus(existingOrder.status);
                    setActiveFoodOrder(existingOrder);
                  },
                },
                { text: 'OK', style: 'cancel' },
              ]
            );
            return;
          }
        }
      } catch (checkErr) {
        console.log('[CHECK ACTIVE ORDER IN PAYMENT CONFIRM]', checkErr);
      }
    }

    // Restaurant availability check
    if (isFoodDelivery && rId) {
      try {
        const checkRes = await api.get(`/profile/restaurant-availability/${rId}`, { timeout: 4000 });
        if (checkRes.data?.success) {
          const isRestoOnline =
            checkRes.data.restaurant_status === 'online' ||
            checkRes.data.isOnline === true;
          if (!isRestoOnline) {
            Alert.alert(
              'Store Offline',
              `Sorry, "${restoName}" is currently offline and not accepting orders.\nPlease try again when they are online or choose another store.`
            );
            return;
          }
        }
      } catch (checkErr) {
        console.log('[RESTO AVAILABILITY CHECK NOTICE]', checkErr);
      }
    }

    if (selectedPayment === 'wallet') {
      if (walletBalance < totalPayable) {
        Alert.alert('Insufficient Balance', 'Your wallet balance is insufficient. Please choose Cash on Delivery (COD).');
        return;
      }
      isSubmittingRef.current = true;
      setLoading(true);
      try {
        const walletPayRes = await api.post('/payments/pay-booking', {
          amount: totalPayable,
          bookingId: effectiveRideId,
        });
        if (!walletPayRes.data?.success) {
          Alert.alert('Wallet Error', 'Failed to complete wallet transaction.');
          setLoading(false);
          isSubmittingRef.current = false;
          return;
        }
        await executeOrderBooking({ paymentMethod: 'wallet' });
      } catch (e) {
        Alert.alert('Payment Error', 'Wallet payment could not be processed.');
        setLoading(false);
        isSubmittingRef.current = false;
      }
      return;
    }

    // Cash on Delivery (COD) - Default payment method
    isSubmittingRef.current = true;
    setLoading(true);
    await executeOrderBooking({ paymentMethod: 'cod' });
  };

  const executeOrderBooking = async (paymentDetails: {
    paymentMethod: 'cod' | 'wallet' | 'razorpay';
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    razorpaySignature?: string;
  }) => {
    isSubmittingRef.current = true;
    setLoading(true);

    try {
      const isPending = paymentDetails.paymentMethod === 'cod';
      const resolvedPaymentStatus = isPending ? 'PENDING' : 'PAID';

      // 1. Dispatch Store / Product Order
      if (isFoodDelivery) {
        // Build rich resolvedCartItems ensuring real dish names and real prices are preserved
        let resolvedCartItems: any = initialCartItems || route.params?.cartItems || null;
        if (!resolvedCartItems || typeof resolvedCartItems !== 'object' || Object.keys(resolvedCartItems).length === 0) {
          const persistentItems = CartService.getCart()?.items || {};
          resolvedCartItems = {};
          const sourceEntries = Object.entries(cart && Object.keys(cart).length > 0 ? cart : persistentItems);
          for (const [id, val] of sourceEntries) {
            const dish = (val as any)?.item || (val as any)?.dish || persistentItems[id]?.item || (typeof val === 'object' ? val : {});
            const qty = typeof val === 'number' ? val : (val as any)?.quantity || 1;
            resolvedCartItems[id] = {
              id,
              itemId: id,
              name: dish.name || dish.dishName || dish.title || (typeof val === 'object' && (val as any)?.name) || 'Store Item',
              price: Number(dish.price || dish.cost || (typeof val === 'object' && (val as any)?.price) || 0),
              quantity: Number(qty),
              isVeg: dish.isVeg !== false,
              image: dish.image || dish.imageUrl || '',
            };
          }
        }

        const foodPayload: any = {
          bookingId: effectiveRideId,
          rideId: effectiveRideId,
          customerId: user?._id || user?.id || 'customer_device_1',
          customerName: user?.name || user?.username || 'Customer',
          customerPhone: user?.phoneNumber || '9999999999',
          serviceName: orderCategoryName,
          categoryName: orderCategoryName,
          businessCategoryName: orderCategoryName,
          partnerType: orderCategoryName,
          storeCategory: orderCategoryName,
          restaurantId: rId,
          partnerId: rId,
          providerId: rId,
          restaurantName: restoName,
          serviceAddress: deliveryAddress?.fullAddress || 'Customer Address',
          pickupAddress: restoAddress,
          destinationAddress: deliveryAddress?.fullAddress || 'Customer Address',
          latitude: effectiveCoords.latitude,
          longitude: effectiveCoords.longitude,
          pickupLatitude: restoLat,
          pickupLongitude: restoLon,
          supplierBusinessLatitude: restoLat,
          supplierBusinessLongitude: restoLon,
          supplierBusinessAddress: restoAddress,
          destinationLatitude: effectiveCoords.latitude,
          destinationLongitude: effectiveCoords.longitude,
          customerLatitude: effectiveCoords.latitude,
          customerLongitude: effectiveCoords.longitude,
          customerAddress: deliveryAddress?.fullAddress || 'Customer Address',
          isOrderingForSomeoneElse: Boolean(deliveryAddress?.isOrderingForSomeoneElse),
          recipientRelationship: deliveryAddress?.recipientRelationship || null,
          recipientName: deliveryAddress?.recipientName || null,
          recipientPhone: deliveryAddress?.recipientPhone || null,
          recipientAddress: deliveryAddress?.isOrderingForSomeoneElse ? deliveryAddress.fullAddress : null,
          recipientLatitude: deliveryAddress?.isOrderingForSomeoneElse ? effectiveCoords.latitude : null,
          recipientLongitude: deliveryAddress?.isOrderingForSomeoneElse ? effectiveCoords.longitude : null,
          originalLocationUrl: deliveryAddress?.originalLocationUrl || null,
          distanceKm: riderFeeCalculation.distanceKm,
          deliveryFee: effectiveDeliveryFee,
          subtotal: effectiveSubtotal,
          price: totalPayable,
          weatherIncentive: effectiveRainFee,
          rainFee: effectiveRainFee,
          isRaining: Boolean(isRaining),
          cartItems: resolvedCartItems,
          paymentMethod: paymentDetails.paymentMethod,
          paymentStatus: resolvedPaymentStatus,
          razorpayOrderId: paymentDetails.razorpayOrderId || null,
          razorpayPaymentId: paymentDetails.razorpayPaymentId || null,
          razorpaySignature: paymentDetails.razorpaySignature || null,
          status: 'PENDING_RESTAURANT',
          createdAt: new Date().toISOString(),
        };

        // Submit order to backend exactly once
        let createdBookingData: any = null;
        try {
          const createRes = await api.post('/bookings/create', foodPayload);
          if (createRes.data?.success || createRes.data?.booking) {
            createdBookingData = createRes.data.booking || { ...foodPayload, _id: createRes.data.bookingId || effectiveRideId };
            Object.assign(foodPayload, createdBookingData);
          } else {
            throw new Error(createRes.data?.message || 'Backend order creation was not successful');
          }
        } catch (e: any) {
          console.error('[PaymentConfirmScreen] Order creation failed:', e.message);
          setLoading(false);
          isSubmittingRef.current = false;
          Alert.alert('Order Failed', e.response?.data?.message || e.message || 'Could not place order. Please try again.');
          return;
        }

        const assignedBookingId = createdBookingData?.bookingId || foodPayload.bookingId || effectiveRideId;

        try {
          await AsyncStorage.setItem('active_food_booking_id', assignedBookingId);
          await AsyncStorage.setItem('active_food_order_data', JSON.stringify(foodPayload));
          await CartService.clearCart();
        } catch (storageErr) {
          console.log('[STORAGE NOTICE]', storageErr);
        }

        rideStore.setCurrentRide(foodPayload);
        setActiveFoodOrder(foodPayload);
        setLoading(false);
        isSubmittingRef.current = false;

        // IMMEDIATELY navigate to OrderSuccessScreen (No waiting for store/rider/socket!)
        navigation.reset({
          index: 0,
          routes: [
            { name: 'CustomerHomeScreen' },
            {
              name: 'OrderSuccessScreen',
              params: {
                bookingId: assignedBookingId,
                order: foodPayload,
                amount: totalPayable,
                storeName: restoName || 'Store',
                paymentMethod: paymentDetails.paymentMethod,
                status: 'PENDING_RESTAURANT',
                categoryName: orderCategoryName,
              },
            },
          ],
        });
        return;
      }

      // Home Service Booking
      setBookingState('searching');

      const fullRidePayload = {
        ...rideData,
        rideId: effectiveRideId,
        bookingId: effectiveRideId,
        price: totalPayable,
        paymentMethod: paymentDetails.paymentMethod,
        paymentStatus: resolvedPaymentStatus,
        razorpayOrderId: paymentDetails.razorpayOrderId || null,
        razorpayPaymentId: paymentDetails.razorpayPaymentId || null,
        razorpaySignature: paymentDetails.razorpaySignature || null,
        pickupLatitude: Number(effectiveCoords.latitude || 0),
        pickupLongitude: Number(effectiveCoords.longitude || 0),
        destinationLatitude: Number(effectiveCoords.latitude || 0),
        destinationLongitude: Number(effectiveCoords.longitude || 0),
      };

      if (socket) {
        socket.emit('ride_request', fullRidePayload);
      }

      try {
        await api.post('/bookings/create', {
          bookingId: effectiveRideId,
          customerId: rideData?.customerId || user?._id || user?.id || 'customer_device_1',
          customerName: rideData?.customerName || user?.name || user?.username || 'Customer',
          customerPhone: rideData?.customerPhone || user?.phoneNumber || '9999999999',
          serviceName: categoryName,
          categoryName: categoryName,
          serviceAddress: rideData?.pickupAddress || 'Service Location',
          pickupAddress: rideData?.pickupAddress || 'Service Location',
          latitude: effectiveCoords.latitude,
          longitude: effectiveCoords.longitude,
          pickupLatitude: effectiveCoords.latitude,
          pickupLongitude: effectiveCoords.longitude,
          price: totalPayable,
          paymentMethod: paymentDetails.paymentMethod,
          paymentStatus: resolvedPaymentStatus,
          razorpayOrderId: paymentDetails.razorpayOrderId || null,
          razorpayPaymentId: paymentDetails.razorpayPaymentId || null,
          razorpaySignature: paymentDetails.razorpaySignature || null,
          status: 'BOOKING_REQUESTED',
        });
      } catch (e: any) {
        console.error('[PaymentConfirmScreen] Error creating booking on backend:', e.message);
      }

      rideStore.setCurrentRide(fullRidePayload);
      setLoading(false);
      isSubmittingRef.current = false;
    } catch (err: any) {
      console.log('Checkout execution error:', err);
      Alert.alert('Error', 'An error occurred while processing your request.');
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  const mapHtml = useMemo(() => {
    const lat = Number(effectiveCoords.latitude || 0);
    const lon = Number(effectiveCoords.longitude || 0);
    const rLat = Number(restoCoords.latitude || 0);
    const rLon = Number(restoCoords.longitude || 0);
    const catEmoji = getCategoryIcon(orderCategoryName);
    const catStoreLabel = getCategoryStoreLabel(orderCategoryName);
    const rNameSafe = (restoDisplayName || restoName || `${catStoreLabel} Partner`).replace(/"/g, '').replace(/'/g, '');

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body, html, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #f0f4f8; overflow: hidden; }
        .supplier-dot {
            width: 45px !important;
            height: 45px !important;
            background: transparent;
            border: none;
        }
        .my-home-marker {
            width: 38px !important; height: 38px !important;
            background-color: #0066FF;
            color: white; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            border: 3px solid white; box-shadow: 0 4px 10px rgba(0, 102, 255,0.45);
            font-size: 18px;
        }
        .resto-marker {
            width: 38px !important; height: 38px !important;
            background-color: #DC2626;
            color: white; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            border: 3px solid white; box-shadow: 0 4px 10px rgba(220,38,38,0.45);
            font-size: 18px;
        }
        .active-rider-pin {
            display: flex; align-items: center; justify-content: center;
            background: transparent; border: none;
        }
        .leaflet-control-attribution {
            display: none !important;
        }
        .custom-map-tooltip {
            background-color: #111827;
            color: #FFFFFF;
            font-size: 11px;
            font-weight: 700;
            padding: 4px 8px;
            border-radius: 6px;
            border: 1px solid rgba(255,255,255,0.2);
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3);
            white-space: nowrap;
        }
        .custom-map-tooltip::before {
            border-top-color: #111827;
        }
        .no-gps-toast {
            position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
            background: rgba(17,24,39,0.92); color: #FFF; font-family: sans-serif;
            font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 20px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.25); z-index: 9999; pointer-events: none;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <div id="noGpsToast" class="no-gps-toast" style="display: none;">📍 Waiting for live GPS location...</div>
      <script>
        var currentLat = ${lat};
        var currentLon = ${lon};
        var restoLat = ${rLat};
        var restoLon = ${rLon};

        var hasValidCenter = Boolean((currentLat !== 0 && currentLon !== 0) || (restoLat !== 0 && restoLon !== 0));
        var initialCenterLat = (currentLat !== 0 && restoLat !== 0) ? (currentLat + restoLat)/2 : (currentLat !== 0 ? currentLat : (restoLat !== 0 ? restoLat : 0));
        var initialCenterLon = (currentLon !== 0 && restoLon !== 0) ? (currentLon + restoLon)/2 : (currentLon !== 0 ? currentLon : (restoLon !== 0 ? restoLon : 0));
        var initialZoom = (currentLat !== 0 && restoLat !== 0) ? 14 : 15;

        var mapEl = document.getElementById('map');
        if (mapEl && !hasValidCenter) mapEl.style.visibility = 'hidden';
        var map = L.map('map', { zoomControl: false, attributionControl: false });
        if (hasValidCenter) {
          map.setView([initialCenterLat, initialCenterLon], initialZoom);
        }
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap'
        }).addTo(map);

        var homeMarker = null;
        var homeIcon = L.divIcon({
            className: 'my-home-marker',
            html: '🏡',
            iconSize: [38, 38],
            iconAnchor: [19, 19]
        });

        var isSameLocation = (restoLat > 0 && currentLat > 0 && Math.abs(restoLat - currentLat) < 0.0003 && Math.abs(restoLon - currentLon) < 0.0003);
        var effectiveRestoLat = restoLat;
        var effectiveRestoLon = restoLon;
        var effectiveHomeLat = currentLat;
        var effectiveHomeLon = currentLon;

        if (effectiveHomeLat > 0 && effectiveHomeLon > 0) {
          homeMarker = L.marker([effectiveHomeLat, effectiveHomeLon], { icon: homeIcon })
            .addTo(map)
            .bindTooltip("🏡 You (Delivery Location)", { permanent: true, direction: "top", className: "custom-map-tooltip", offset: [0, -20] })
            .openTooltip();
        }

        var restoMarker = null;
        var restoPoly = null;
        ${isFoodDelivery ? `
        var restoIcon = L.divIcon({
            className: 'resto-marker',
            html: '${catEmoji}',
            iconSize: [38, 38],
            iconAnchor: [19, 19]
        });
        if (effectiveRestoLat > 0 && effectiveRestoLon > 0) {
          restoMarker = L.marker([effectiveRestoLat, effectiveRestoLon], { icon: restoIcon })
            .addTo(map)
            .bindTooltip("${catEmoji} ${rNameSafe} (${catStoreLabel})", { permanent: true, direction: "top", className: "custom-map-tooltip", offset: [0, -20] })
            .openTooltip();
        }

        if (effectiveRestoLat !== 0 && effectiveRestoLon !== 0 && effectiveHomeLat !== 0 && effectiveHomeLon !== 0) {
          var bounds = L.latLngBounds([[effectiveRestoLat, effectiveRestoLon], [effectiveHomeLat, effectiveHomeLon]]);
          map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17 });
          setTimeout(function() { fetchRoadRoute(effectiveRestoLat, effectiveRestoLon, effectiveHomeLat, effectiveHomeLon); }, 100);
        }
        ` : ''}

        if (currentLat === 0 && restoLat === 0) {
          document.getElementById('noGpsToast').style.display = 'block';
        }

        var rippleIcon = L.divIcon({
            className: 'ripple-container',
            html: '<div style="position: absolute; width: 40px; height: 40px; border-radius: 50%; border: 3px solid #0ea5e9; animation: rippleAnim 1.5s linear infinite;"></div><div style="position: absolute; width: 40px; height: 40px; border-radius: 50%; border: 3px solid #0ea5e9; animation: rippleAnim 1.5s linear infinite; animation-delay: 0.75s;"></div><style>@keyframes rippleAnim { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(6); opacity: 0; } }</style>',
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });

        var rippleMarker = null;
        var riderMarker = null;
        var riderRoadPolyline = null;
        var lastCustomerGpsTime = 0;
        var lastRiderGpsTime = 0;

        function fetchRoadRoute(fromLat, fromLon, toLat, toLon) {
          if (!fromLat || !fromLon || !toLat || !toLon) return;
          var url = 'https://router.project-osrm.org/route/v1/driving/' + fromLon + ',' + fromLat + ';' + toLon + ',' + toLat + '?overview=full&geometries=geojson';
          fetch(url)
            .then(function(res) { return res.json(); })
            .then(function(data) {
              if (data && data.routes && data.routes[0]) {
                var coords = data.routes[0].geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
                if (!riderRoadPolyline) {
                  riderRoadPolyline = L.polyline(coords, { color: '#0066FF', weight: 4.5, opacity: 0.9 }).addTo(map);
                } else {
                  riderRoadPolyline.setLatLngs(coords);
                }
              }
            })
            .catch(function() {});
        }

        function updateBounds() {
          ${isFoodDelivery ? `
          if (restoMarker && homeMarker) {
            var rP = restoMarker.getLatLng();
            var hP = homeMarker.getLatLng();
            var b = L.latLngBounds([rP, hP]);
            if (riderMarker) b.extend(riderMarker.getLatLng());
            map.fitBounds(b, { padding: [50, 50], maxZoom: 16 });
          } else if (homeMarker) {
            map.setView(homeMarker.getLatLng(), 15);
          }
          ` : `
          if (homeMarker) {
            map.setView(homeMarker.getLatLng(), 15);
          }
          `}
        }

        window.addEventListener("message", function(event) {
          try {
            var data = JSON.parse(event.data);
            if (data.type === 'UPDATE_LOCATION' || data.type === 'UPDATE_CUSTOMER_LOCATION') {
              var updateTimestamp = Number(data.timestamp || Date.now());
              if (updateTimestamp < lastCustomerGpsTime) return; // Discard older GPS event
              lastCustomerGpsTime = updateTimestamp;

              var newLat = Number(data.latitude);
              var newLon = Number(data.longitude);
              if (!isNaN(newLat) && !isNaN(newLon) && newLat !== 0 && newLon !== 0) {
                currentLat = newLat;
                currentLon = newLon;
                document.getElementById('noGpsToast').style.display = 'none';
                if (!homeMarker) {
                  homeMarker = L.marker([newLat, newLon], { icon: homeIcon })
                    .addTo(map)
                    .bindTooltip("🏡 You (Delivery Location)", { permanent: true, direction: "top", className: "custom-map-tooltip", offset: [0, -20] })
                    .openTooltip();
                } else {
                  homeMarker.setLatLng([newLat, newLon]);
                }
                updateBounds();
              }
              if (rippleMarker && currentLat !== 0 && currentLon !== 0) {
                rippleMarker.setLatLng([currentLat, currentLon]);
              }
            } else if (data.type === 'UPDATE_RESTO_LOCATION') {
              var newRLat = Number(data.latitude);
              var newRLon = Number(data.longitude);
              if (!isNaN(newRLat) && !isNaN(newRLon) && newRLat !== 0 && newRLon !== 0) {
                restoLat = newRLat;
                restoLon = newRLon;
                document.getElementById('noGpsToast').style.display = 'none';
                if (!restoMarker) {
                  restoMarker = L.marker([newRLat, newRLon], { icon: restoIcon })
                    .addTo(map)
                    .bindTooltip("${catEmoji} " + (data.name || "${rNameSafe}"), { permanent: true, direction: "top", className: "custom-map-tooltip", offset: [0, -20] })
                    .openTooltip();
                } else {
                  restoMarker.setLatLng([newRLat, newRLon]);
                  if (data.name) {
                    restoMarker.setTooltipContent("${catEmoji} " + data.name);
                  }
                }
                updateBounds();
              }
            } else if (data.type === 'UPDATE_RIDER_LOCATION') {
              var rGpsTime = Number(data.timestamp || Date.now());
              if (rGpsTime < lastRiderGpsTime) return; // Discard older GPS event
              lastRiderGpsTime = rGpsTime;

              var riderLat = Number(data.latitude);
              var riderLon = Number(data.longitude);
              var heading = Number(data.heading || 0);
              var isPickedUp = Boolean(data.isPickedUp);

              if (!isNaN(riderLat) && !isNaN(riderLon) && riderLat !== 0 && riderLon !== 0) {
                var bikeIcon = L.divIcon({
                  className: 'active-rider-pin',
                  html: '<div style="width: 38px; height: 38px; border-radius: 50%; background: #0066FF; border: 2.5px solid #FFFFFF; box-shadow: 0 4px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 20px; transform: rotate(' + heading + 'deg);">🛵</div>',
                  iconSize: [38, 38],
                  iconAnchor: [19, 19]
                });

                if (!riderMarker) {
                  riderMarker = L.marker([riderLat, riderLon], { icon: bikeIcon })
                    .addTo(map)
                    .bindTooltip("🛵 Delivery Partner", { permanent: true, direction: "top", className: "custom-map-tooltip", offset: [0, -20] })
                    .openTooltip();
                } else {
                  riderMarker.setIcon(bikeIcon);
                  riderMarker.setLatLng([riderLat, riderLon]);
                }

                var targetLat = isPickedUp ? currentLat : (restoLat > 0 ? restoLat : currentLat);
                var targetLon = isPickedUp ? currentLon : (restoLon > 0 ? restoLon : currentLon);
                if (targetLat > 0 && targetLon > 0) {
                  fetchRoadRoute(riderLat, riderLon, targetLat, targetLon);
                  var bounds = L.latLngBounds([[riderLat, riderLon], [targetLat, targetLon]]);
                  map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
                }
              }
            } else if (data.type === 'START_SEARCH') {
              if (currentLat > 0 && currentLon > 0) {
                rippleMarker = L.marker([currentLat, currentLon], { icon: rippleIcon }).addTo(map);
              }
            } else if (data.type === 'SUPPLIER_FOUND' || data.type === 'STOP_SEARCH') {
              if (rippleMarker) map.removeLayer(rippleMarker);
            }
          } catch(e) {}
        });
      </script>
    </body>
    </html>
    `;
  }, [effectiveCoords, isFoodDelivery, restoCoords, restoDisplayName, restoName, orderCategoryName]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]}>
      <StatusBar hidden={false} barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={currentColors.background} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: isFoodDelivery ? '#FFFFFF' : currentColors.surface, borderBottomColor: isFoodDelivery ? '#BFDBFE' : currentColors.border }]}>
        <TouchableOpacity
          onPress={() => {
            if (isFoodDelivery) {
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.navigate('CustomerHomeScreen');
              }
            } else if (bookingState === 'searching') {
              handleCancelSearching();
            } else {
              navigation.goBack();
            }
          }}
          style={styles.menuBtn}
        >
          <Icon name="arrow-back" size={28} color={isFoodDelivery ? '#0066FF' : currentColors.text} />
        </TouchableOpacity>
        
        {isFoodDelivery ? (
          <View style={styles.foodDeliveryHeaderTitleWrap}>
            <Text style={{ fontSize: 24, marginRight: 8 }}>{getCategoryIcon(orderCategoryName)}</Text>
            <View>
              <Text style={styles.foodDeliveryHeaderMain}>{categoryTerminology.deliveryLabel}</Text>
              <Text style={styles.foodDeliveryHeaderSub} numberOfLines={1}>
                {activeFoodOrder?.restaurantName || restoName}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.logoContainer}>
            <Text style={styles.logoZ}>Z<Text style={styles.logoCaret}>^</Text></Text>
            <View style={styles.logoTextContainer}>
              <Text style={[styles.logoTextMain, { color: isDark ? '#FFF' : '#1e3a8a' }]}>ZYNVERO</Text>
              <Text style={styles.logoTextSub}>Home Services</Text>
            </View>
          </View>
        )}

        <TouchableOpacity 
          style={[styles.helpBtn, { backgroundColor: isFoodDelivery ? '#EFF6FF' : currentColors.surface, borderColor: isFoodDelivery ? '#BFDBFE' : currentColors.border }]}
          onPress={() => setShowHelpCenter(true)}
          activeOpacity={0.8}
        >
          <Icon name="headset-outline" size={14} color={isFoodDelivery ? '#0066FF' : currentColors.text} />
          <Text style={[styles.helpText, { color: isFoodDelivery ? '#0066FF' : currentColors.text }]}>Help</Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#0066FF" />
        </View>
      )}

      {/* Map Area */}
      <View style={styles.mapArea}>
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: mapHtml }}
          style={{ flex: 1, backgroundColor: '#f1f5f9' }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowFileAccess={true}
          allowUniversalAccessFromFileURLs={true}
          geolocationEnabled={true}
        />

        {/* Location Bar overlaying map */}
        <View style={styles.locationOverlay}>
          <View style={styles.locationBar}>
            <View style={styles.locationIconContainer}>
              <View style={styles.locationIconBg}>
                <Icon name="home" size={20} color="#0066FF" />
              </View>
              <View style={styles.locationTextContainer}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.locationTitle}>
                    {isFoodDelivery
                      ? (deliveryAddress?.isCurrentLocation ? '📍 Current Location' : deliveryAddress?.tag === 'Work' ? '🏢 Work' : '🏠 Home')
                      : 'My Home'}
                  </Text>
                  {isFoodDelivery && deliveryAddress?.isCurrentLocation && (
                    <View style={styles.gpsPillSmall}>
                      <Text style={styles.gpsPillSmallText}>📍 GPS</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.locationSubtitle} numberOfLines={1}>
                  {isFoodDelivery
                    ? (deliveryAddress?.fullAddress || deliveryAddress?.landmark || (fetchingGps ? 'Locating via GPS...' : 'Select delivery address'))
                    : (rideData?.pickupAddress || 'Service Location')}
                </Text>
              </View>
            </View>

            {isFoodDelivery && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TouchableOpacity
                  style={[styles.changeAddressOverlayBtn, { backgroundColor: '#0066FF', paddingHorizontal: 8 }]}
                  onPress={() => fetchLiveGps()}
                  activeOpacity={0.8}
                  disabled={fetchingGps}
                >
                  <Text style={[styles.changeAddressOverlayText, { color: '#FFFFFF', fontWeight: 'bold', fontSize: 11 }]}>
                    {fetchingGps ? '⏳...' : '📍 GPS'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.changeAddressOverlayBtn}
                  onPress={() => setAddressModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.changeAddressOverlayText}>Change</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Bottom Sheet */}
      <View style={[styles.bottomSheet, { backgroundColor: currentColors.surface, borderTopWidth: 1, borderTopColor: currentColors.border }]}>
        <View style={styles.dragHandle} />
        
        {bookingState === 'idle' && (!isFoodDelivery || (foodOrderStatus === 'IDLE' && !activeFoodOrder && !route.params?.bookingId && !route.params?.rideId)) ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {isFoodDelivery ? (
              /* ======================================================= */
              /* FOOD DELIVERY UI: ADDRESS, RIDER FEE & BILL BREAKDOWN   */
              /* ======================================================= */
              <>
                {/* 1. CUSTOMER DELIVERY ADDRESS CARD */}
                <View style={styles.foodAddressCard}>
                  <View style={styles.foodAddressCardLeft}>
                    <View style={styles.foodTagRow}>
                      <View style={styles.foodTagBadge}>
                        <Text style={styles.foodTagText}>
                          {deliveryAddress?.isCurrentLocation ? '📍 CURRENT LOCATION' : (deliveryAddress?.tag === 'Work' ? '🏢 WORK' : '🏠 HOME')}
                        </Text>
                      </View>
                      {deliveryAddress?.isCurrentLocation && (
                        <View style={styles.gpsPillSmall}>
                          <Text style={styles.gpsPillSmallText}>📍 Device GPS Active</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.foodAddressTitle} numberOfLines={1}>
                      {deliveryAddress?.houseNo || (fetchingGps ? 'Locating GPS address...' : 'Delivery Address')}
                    </Text>
                    <Text style={styles.foodAddressSub} numberOfLines={2}>
                      {deliveryAddress?.landmark || deliveryAddress?.fullAddress || 'Tap Change to add or pick an address'}
                    </Text>
                    {Boolean(deliveryAddress?.city) && (
                      <Text style={styles.foodAddressCity}>
                        {deliveryAddress?.city} {deliveryAddress?.pincode ? `- ${deliveryAddress.pincode}` : ''}
                      </Text>
                    )}
                  </View>

                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <TouchableOpacity
                      style={[styles.changeAddressSheetBtn, { backgroundColor: '#EFF6FF', borderColor: '#0066FF', borderWidth: 1 }]}
                      onPress={() => fetchLiveGps()}
                      activeOpacity={0.8}
                      disabled={fetchingGps}
                    >
                      <Text style={[styles.changeAddressSheetBtnText, { color: '#0066FF', fontWeight: 'bold', fontSize: 12 }]}>
                        {fetchingGps ? '⏳ Locating...' : '📍 Live GPS'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.changeAddressSheetBtn}
                      onPress={() => setAddressModalVisible(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.changeAddressSheetBtnText}>
                        {deliveryAddress ? 'Change' : '+ Add'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 1.1 PERMANENT LIVE GPS / LOCATION INFORMATION SECTION (NEVER COLLAPSED) */}
                <View style={[styles.gpsSectionCard, { backgroundColor: isDark ? '#1E293B' : '#F0FDF4', borderColor: isDark ? '#334155' : '#86EFAC' }]}>
                  <View style={styles.gpsSectionTop}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={styles.gpsLivePill}>
                        <Text style={styles.gpsLivePillText}>📍 REAL PHYSICAL GPS</Text>
                      </View>
                      <Text style={[styles.gpsFixText, { color: isDark ? '#94A3B8' : '#166534' }]}>
                        Location Locked
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.gpsRefreshBtn}
                      onPress={() => fetchLiveGps()}
                      activeOpacity={0.7}
                      disabled={fetchingGps}
                    >
                      <Text style={styles.gpsRefreshBtnText}>{fetchingGps ? '⏳ Locating...' : '🔄 Refresh GPS'}</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.gpsMetaRow}>
                    <Text style={[styles.gpsMetaText, { color: isDark ? '#94A3B8' : '#374151' }]}>
                      Accuracy: <Text style={{ fontWeight: '700', color: '#16A34A' }}>±{gpsInfo?.accuracy ? Number(gpsInfo.accuracy).toFixed(1) : '5.0'} m</Text>
                    </Text>
                    <Text style={[styles.gpsMetaText, { color: isDark ? '#94A3B8' : '#374151' }]}>
                      Updated: <Text style={{ fontWeight: '700' }}>{gpsInfo?.timestamp ? new Date(gpsInfo.timestamp).toLocaleTimeString() : 'Live'}</Text>
                    </Text>
                  </View>
                </View>

                {/* 2. RESTAURANT & RIDER FEE CARD */}
                <View style={styles.restoCard}>
                  <View style={styles.restoCardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.restoNameText} numberOfLines={1}>
                        {categoryTerminology.icon} {restoName}
                      </Text>
                      <Text style={styles.restoAddressText} numberOfLines={1}>
                        {restoAddress}
                      </Text>
                    </View>
                    <View style={styles.riderFeeDistPill}>
                      <Text style={styles.riderFeeDistPillText}>
                        🛵 {riderFeeCalculation.distanceKm} km
                      </Text>
                    </View>
                  </View>

                  <View style={styles.riderFeeBreakdownRow}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.riderFeeLabel}>Rider Delivery Fee</Text>
                      <Text style={styles.riderFeeNoteText}>
                        {riderFeeCalculation.formulaNote}
                      </Text>
                    </View>
                    <Text style={styles.riderFeeAmountText}>₹{effectiveDeliveryFee}</Text>
                  </View>
                </View>

                {/* 3. PRICE BREAKDOWN */}
                <View style={[styles.breakdownBox, { backgroundColor: isDark ? '#1E1E1E' : '#F8FAFC', marginBottom: 16 }]}>
                  <View style={styles.breakdownRow}>
                    <Text style={[styles.breakdownLabel, { color: currentColors.textMuted }]}>{getCategoryTotalLabel(orderCategoryName)}</Text>
                    <Text style={[styles.breakdownVal, { color: currentColors.text }]}>₹{effectiveSubtotal}</Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={[styles.breakdownLabel, { color: currentColors.textMuted }]}>Delivery Partner Fee</Text>
                    <Text style={[styles.breakdownVal, { color: currentColors.text }]}>₹{effectiveDeliveryFee}</Text>
                  </View>
                  {isRaining && effectiveRainFee > 0 && (
                    <View style={styles.breakdownRow}>
                      <Text style={[styles.breakdownLabel, { color: '#0284C7', fontWeight: '700' }]}>🌧️ Rain Surge / Inclement Weather Fee</Text>
                      <Text style={[styles.breakdownVal, { color: '#0284C7', fontWeight: '800' }]}>+₹{effectiveRainFee}</Text>
                    </View>
                  )}
                  {discountAmount > 0 && (
                    <View style={styles.breakdownRow}>
                      <Text style={[styles.breakdownLabel, { color: '#16A34A' }]}>Coupon Discount ({appliedPromo})</Text>
                      <Text style={[styles.breakdownVal, { color: '#16A34A' }]}>-₹{discountAmount}</Text>
                    </View>
                  )}
                  <View style={[styles.breakdownRow, styles.totalRow, { borderColor: currentColors.border }]}>
                    <Text style={[styles.totalLabel, { color: currentColors.text }]}>To Pay</Text>
                    <Text style={[styles.totalVal, { color: '#0066FF' }]}>₹{totalPayable}</Text>
                  </View>
                </View>
              </>
            ) : (
              /* ======================================================= */
              /* HOME SERVICE BOOKING UI                                 */
              /* ======================================================= */
              <>
                <View style={styles.infoSection}>
                  <View style={styles.infoLeft}>
                    <View style={styles.infoIconBg}>
                      <Icon name="people" size={24} color="#059669" />
                    </View>
                    <View>
                      <Text style={[styles.infoTitle, { color: currentColors.text }]}>Nearby Service Professionals</Text>
                      <Text style={[styles.infoSubtitle, { color: currentColors.textMuted }]}>Finding trusted professionals near you</Text>
                    </View>
                  </View>
                </View>

                <View style={[styles.serviceSection, { borderColor: currentColors.border }]}>
                  <View style={styles.serviceRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.serviceTitle, { color: currentColors.text }]}>{categoryName}</Text>
                      <Text style={[styles.serviceSubtitle, { color: currentColors.textMuted }]}>Choose payment method to complete booking</Text>
                    </View>
                    <Text style={[styles.basePriceText, { color: currentColors.text }]}>₹{initialPrice}</Text>
                  </View>

                  <View style={[styles.breakdownBox, { backgroundColor: isDark ? '#1E1E1E' : '#F8FAFC' }]}>
                    <View style={styles.breakdownRow}>
                      <Text style={[styles.breakdownLabel, { color: currentColors.textMuted }]}>Service Charge</Text>
                      <Text style={[styles.breakdownVal, { color: currentColors.text }]}>₹{initialPrice}</Text>
                    </View>
                    {discountAmount > 0 && (
                      <View style={styles.breakdownRow}>
                        <Text style={[styles.breakdownLabel, { color: '#16A34A' }]}>Coupon Discount ({appliedPromo})</Text>
                        <Text style={[styles.breakdownVal, { color: '#16A34A' }]}>-₹{discountAmount}</Text>
                      </View>
                    )}
                    <View style={[styles.breakdownRow, styles.totalRow, { borderColor: currentColors.border }]}>
                      <Text style={[styles.totalLabel, { color: currentColors.text }]}>Total Payable</Text>
                      <Text style={[styles.totalVal, { color: '#0066FF' }]}>₹{totalPayable}</Text>
                    </View>
                  </View>
                </View>
              </>
            )}

            {/* Promo Code Apply Row */}
            <View style={styles.promoSection}>
              <Text style={[styles.sectionLabel, { color: currentColors.text }]}>Promo Coupon</Text>
              {appliedPromo ? (
                <View style={styles.appliedPromoBox}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.appliedPromoTitle}>Code Applied: {appliedPromo}</Text>
                    <Text style={styles.appliedPromoSub}>You saved ₹{discountAmount} on this order!</Text>
                  </View>
                  <TouchableOpacity style={styles.removePromoBtn} onPress={handleRemovePromo}>
                    <Text style={styles.removePromoText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.promoInputRow}>
                  <TextInput
                    style={[styles.promoInput, { color: currentColors.text, backgroundColor: isDark ? '#1E1E1E' : '#F8FAFC', borderColor: currentColors.border }]}
                    placeholder="Enter Code (e.g. CLEAN20, ACCOOL)"
                    placeholderTextColor={currentColors.placeholder}
                    autoCapitalize="characters"
                    value={promoCode}
                    onChangeText={setPromoCode}
                  />
                  <TouchableOpacity style={styles.promoApplyBtn} onPress={handleApplyPromo}>
                    <Text style={styles.promoApplyBtnText}>Apply</Text>
                  </TouchableOpacity>
                </View>
              )}
              {promoError && <Text style={styles.promoErrorText}>{promoError}</Text>}
              {promoSuccess && <Text style={styles.promoSuccessText}>{promoSuccess}</Text>}
            </View>

            {/* Payment Options Accordion */}
            <View style={styles.paymentSection}>
              <TouchableOpacity 
                style={[styles.paymentAccordionHeader, { backgroundColor: isDark ? '#2D3748' : '#F1F5F9' }]} 
                onPress={() => setPaymentExpanded(!paymentExpanded)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Icon name="wallet-outline" size={20} color={currentColors.text} />
                  <Text style={[styles.paymentAccordionTitle, { color: currentColors.text }]}>Payment Option</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.paymentAccordionSelected}>
                    {getPaymentLabel()}
                  </Text>
                  <Icon name={paymentExpanded ? "chevron-up" : "chevron-down"} size={20} color={currentColors.textMuted} style={{ marginLeft: 8 }} />
                </View>
              </TouchableOpacity>

              {paymentExpanded && (
                <View style={styles.paymentAccordionBody}>
                  {/* Cash on Delivery (COD) Option */}
                  <TouchableOpacity 
                    style={[styles.paymentCard, { backgroundColor: currentColors.surface, borderColor: currentColors.border }, selectedPayment === 'cod' && styles.paymentCardActive]}
                    onPress={() => {
                      setSelectedPayment('cod');
                      setPaymentExpanded(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.paymentCardLeft}>
                      <View style={[styles.officeIconBg, { backgroundColor: '#ECFDF5' }]}>
                        <Icon name="cash-outline" size={20} color="#10B981" />
                      </View>
                      <View>
                        <Text style={[styles.paymentTitle, { color: currentColors.text }]}>Cash on Delivery (COD)</Text>
                        <Text style={[styles.paymentSubtitle, { color: currentColors.textMuted }]}>Pay with cash upon delivery</Text>
                      </View>
                    </View>
                    <View style={[styles.radio, selectedPayment === 'cod' && styles.radioActive]}>
                      {selectedPayment === 'cod' && <Icon name="checkmark" size={14} color="#FFFFFF" />}
                    </View>
                  </TouchableOpacity>

                  {/* Wallet Option */}
                  <TouchableOpacity 
                    style={[
                      styles.paymentCard, 
                      { backgroundColor: currentColors.surface, borderColor: currentColors.border },
                      selectedPayment === 'wallet' && styles.paymentCardActive,
                      walletBalance < totalPayable && styles.paymentCardDisabled
                    ]}
                    onPress={() => {
                      if (walletBalance >= totalPayable) {
                        setSelectedPayment('wallet');
                        setPaymentExpanded(false);
                      } else {
                        Alert.alert('Insufficient Balance', 'Your wallet balance is insufficient.');
                      }
                    }}
                  >
                    <View style={styles.paymentCardLeft}>
                      <View style={[styles.officeIconBg, { backgroundColor: '#EFF6FF' }]}>
                        <Icon name="wallet-outline" size={20} color="#0066FF" />
                      </View>
                      <View>
                        <Text style={[styles.paymentTitle, { color: currentColors.text }]}>Zynvero Wallet</Text>
                        <Text style={[styles.paymentSubtitle, { color: currentColors.textMuted }]}>Available: ₹{walletBalance.toFixed(2)}</Text>
                      </View>
                    </View>
                    <View style={[styles.radio, selectedPayment === 'wallet' && styles.radioActive]}>
                      {selectedPayment === 'wallet' && <Icon name="checkmark" size={14} color="#FFFFFF" />}
                    </View>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Confirm / Find Button */}
            <TouchableOpacity
              style={[styles.findBtn, isFoodDelivery && { backgroundColor: '#0066FF' }]}
              onPress={handleFindProfessionals}
              activeOpacity={0.85}
            >
              <Text style={styles.findBtnText}>
                {isFoodDelivery ? `Place Order • ₹${totalPayable}` : 'Book Now & Search'}
              </Text>
              <Icon name="arrow-forward" size={20} color="#FFFFFF" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </ScrollView>
        ) : isFoodDelivery && foodOrderStatus !== 'IDLE' ? (
          <View style={styles.foodStatusContainer}>
            {/* 0. RINGING TO RESTAURANT SCREEN (SENDING REQUEST) */}
            {foodOrderStatus === 'CONNECTING' && (
              <View style={styles.ringingContentWrap}>
                <View style={{ width: 140, height: 140, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <LottieAnimation source={hotelBellAnim} width={140} height={140} />
                </View>

                <Text style={[styles.ringingTitle, { color: '#0066FF' }]}>
                  {orderCategoryName.toLowerCase() === 'food' ? 'Ringing to restaurant...' : `Connecting to ${getCategoryStoreLabel(orderCategoryName).toLowerCase()}...`}
                </Text>
                <Text style={styles.ringingRestoName}>{activeFoodOrder?.restaurantName || restoName}</Text>

                <View style={[styles.ringingTimerBox, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                  <Text style={[styles.ringingTimerPrefix, { color: '#0066FF' }]}>SENDING ORDER REQUEST</Text>
                  <Text style={[styles.ringingHintText, { marginTop: 4, color: '#475569' }]}>
                    Sending order details to {getCategoryStoreLabel(orderCategoryName).toLowerCase()} partner... Ringing will start once partner screen receives the order.
                  </Text>
                </View>

                {/* Cancel Button */}
                <TouchableOpacity
                  style={styles.ringingCancelBtn}
                  onPress={handleCancelFoodOrder}
                  activeOpacity={0.8}
                >
                  <Text style={styles.ringingCancelBtnText}>✕ Cancel Order</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 1. RINGING RESTAURANT HOLD SCREEN WITH 1-MIN COUNTDOWN */}
            {foodOrderStatus === 'RINGING' && (
              <View style={styles.ringingContentWrap}>
                <View style={{ width: 140, height: 140, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <LottieAnimation source={hotelBellAnim} width={140} height={140} />
                </View>

                <Text style={styles.ringingTitle}>
                  {orderCategoryName.toLowerCase() === 'food' ? 'Ringing to restaurant...' : `Connecting to ${getCategoryStoreLabel(orderCategoryName).toLowerCase()}...`}
                </Text>
                <Text style={styles.ringingRestoName}>{activeFoodOrder?.restaurantName || restoName}</Text>

                {/* 1-Minute Visual Countdown Timer */}
                <View style={styles.ringingTimerBox}>
                  <Text style={styles.ringingTimerPrefix}>
                    WAITING FOR {getCategoryStoreLabel(orderCategoryName).toUpperCase()} ACCEPTANCE
                  </Text>
                  <Text style={styles.ringingTimerDigits}>
                    00:{ringingCountdown < 10 ? '0' : ''}{ringingCountdown}
                  </Text>
                  <View style={styles.ringingProgressBarTrack}>
                    <View style={[styles.ringingProgressBarFill, { width: `${(ringingCountdown / 60) * 100}%` }]} />
                  </View>
                </View>

                <Text style={styles.ringingHintText}>
                  Please wait while the {getCategoryStoreLabel(orderCategoryName).toLowerCase()} partner reviews and accepts your {orderCategoryName.toLowerCase()} order.
                </Text>

                {/* Mini Order Summary */}
                <View style={styles.ringingSummaryCard}>
                  <View style={styles.ringingSummaryRow}>
                    <Text style={styles.ringingSummaryLabel}>Order ID:</Text>
                    <Text style={styles.ringingSummaryVal}>#{(activeFoodOrder?.bookingId || effectiveRideId).slice(-6)}</Text>
                  </View>
                  <View style={styles.ringingSummaryRow}>
                    <Text style={styles.ringingSummaryLabel}>Delivery To:</Text>
                    <Text style={styles.ringingSummaryVal} numberOfLines={1}>
                      {deliveryAddress?.houseNo || 'Current Location'}
                    </Text>
                  </View>
                  <View style={[styles.ringingSummaryRow, { borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 6, marginTop: 4 }]}>
                    <Text style={[styles.ringingSummaryLabel, { fontWeight: '800', color: '#0F172A' }]}>Total Bill:</Text>
                    <Text style={[styles.ringingSummaryVal, { color: '#0066FF', fontWeight: '900', fontSize: 15 }]}>
                      ₹{activeFoodOrder?.price || totalPayable}
                    </Text>
                  </View>
                </View>

                {/* Cancel Button */}
                <TouchableOpacity
                  style={styles.ringingCancelBtn}
                  onPress={handleCancelFoodOrder}
                  activeOpacity={0.8}
                >
                  <Text style={styles.ringingCancelBtnText}>✕ Cancel Order</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 2. ORDER ACCEPTED & PREPARING SCREEN (100% REAL BACKEND STATUS - NO TIMERS) */}
            {(foodOrderStatus === 'RESTAURANT_ACCEPTED' || foodOrderStatus === 'PREPARING') && (
              <View style={styles.acceptedContentWrap}>
                <View style={styles.acceptedLottieWrapper}>
                  {orderCategoryName.toLowerCase() === 'food' ? (
                    <LottieAnimation source={cookingAnim} width={220} height={220} />
                  ) : (
                    <View style={{ width: 140, height: 140, borderRadius: 70, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#93C5FD', marginVertical: 20 }}>
                      <Text style={{ fontSize: 64 }}>{getCategoryIcon(orderCategoryName)}</Text>
                    </View>
                  )}
                </View>

                <Text style={[styles.acceptedHeaderTitle, { color: '#0066FF' }]}>
                  {orderCategoryName.toLowerCase() === 'food' ? 'Food Preparing' : `${orderCategoryName} Packing`}
                </Text>
                <Text style={styles.acceptedHeaderSub}>
                  {activeFoodOrder?.restaurantName || restoName} Accepted Your Order — {orderCategoryName.toLowerCase() === 'food' ? 'Food is being prepared fresh for you' : `${orderCategoryName} is being packed safely for you`}
                </Text>

                {/* Status Highlight Banner */}
                <View style={[styles.prepTimeHighlightCard, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                  <Text style={[styles.prepTimeBadgeTitle, { color: '#0066FF' }]}>
                    {orderCategoryName.toLowerCase() === 'food' ? '🍳 STATUS: FOOD PREPARATION IN PROGRESS' : `📦 STATUS: ${orderCategoryName.toUpperCase()} PACKING IN PROGRESS`}
                  </Text>
                  
                  <Text style={[styles.prepTimeBadgeSub, { color: '#9A3412', textAlign: 'center', marginTop: 4 }]}>
                    {activeFoodOrder?.restaurantName || restoName} has accepted your order and is {orderCategoryName.toLowerCase() === 'food' ? 'cooking/preparing it fresh for you.' : `packing your ${orderCategoryName.toLowerCase()} items safely.`}
                  </Text>
                  <View style={[styles.cookingAnimationDotsRow, { justifyContent: 'center', marginTop: 8 }]}>
                    <Text style={styles.cookingDot}>{orderCategoryName.toLowerCase() === 'food' ? '🔥' : '📦'}</Text>
                    <Text style={[styles.cookingText, { color: '#1D4ED8', fontWeight: '800' }]}>
                      Live {orderCategoryName.toLowerCase() === 'food' ? 'food preparation' : `${orderCategoryName.toLowerCase()} packing`} in progress...
                    </Text>
                  </View>
                </View>

                {/* Order Details Card with Items List */}
                <View style={[styles.acceptedDetailsCard, { borderColor: '#BFDBFE' }]}>
                  <View style={styles.acceptedDetailRow}>
                    <Text style={styles.acceptedDetailLabel}>Restaurant/Store:</Text>
                    <Text style={styles.acceptedDetailVal}>{activeFoodOrder?.restaurantName || restoName}</Text>
                  </View>
                  <View style={styles.acceptedDetailRow}>
                    <Text style={styles.acceptedDetailLabel}>Delivery Address:</Text>
                    <Text style={styles.acceptedDetailVal} numberOfLines={1}>
                      {activeFoodOrder?.destinationAddress || deliveryAddress?.fullAddress || 'Delivery Address'}
                    </Text>
                  </View>
                  <View style={styles.acceptedDetailRow}>
                    <Text style={styles.acceptedDetailLabel}>Order ID:</Text>
                    <Text style={[styles.acceptedDetailVal, { color: '#64748B' }]}>
                      #{(activeFoodOrder?.bookingId || effectiveRideId).slice(-6)}
                    </Text>
                  </View>

                  {/* Complete List of Ordered Items */}
                  {(() => {
                    const rawItems = activeFoodOrder?.cartItems || initialCartItems || cart;
                    const items = parseFoodOrderItems(rawItems, Number(activeFoodOrder?.price || totalPayable));
                    if (items.length === 0) return null;
                    return (
                      <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#BFDBFE' }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#9A3412', marginBottom: 6, textTransform: 'uppercase' }}>
                          Items Ordered:
                        </Text>
                        {items.map((it: any, idx: number) => (
                          <View key={it.id || idx} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={{ fontSize: 13, color: '#334155', flex: 1 }}>
                              • {it.name} <Text style={{ fontWeight: 'bold' }}>x {it.quantity}</Text>
                            </Text>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                              ₹{Math.round((Number(it.price) || 0) * (Number(it.quantity) || 1))}
                            </Text>
                          </View>
                        ))}
                      </View>
                    );
                  })()}

                  <View style={[styles.acceptedDetailRow, { borderTopWidth: 1, borderTopColor: '#BFDBFE', paddingTop: 8, marginTop: 8 }]}>
                    <Text style={[styles.acceptedDetailLabel, { fontWeight: '800', color: '#0F172A' }]}>Total Bill:</Text>
                    <Text style={[styles.acceptedDetailVal, { color: '#0066FF', fontWeight: '900', fontSize: 16 }]}>
                      ₹{activeFoodOrder?.price || totalPayable}
                    </Text>
                  </View>
                </View>

                {/* Actions: Track on Map, Call Restaurant & Go Home */}
                <View style={{ flexDirection: 'column', gap: 10, marginTop: 16 }}>
                  <TouchableOpacity
                    style={[styles.trackLiveMapBtn, { backgroundColor: '#0066FF' }]}
                    onPress={handleTrackLiveMap}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.trackLiveMapBtnText}>📍 Track Live Order (Map View)</Text>
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      style={[styles.trackLiveMapBtn, { backgroundColor: '#EFF6FF', borderColor: '#0066FF', borderWidth: 1.5, flex: 1 }]}
                      onPress={handleCallRestaurant}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.trackLiveMapBtnText, { color: '#0066FF' }]}>📞 Call Partner</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.trackLiveMapBtn, { backgroundColor: '#475569', flex: 1 }]}
                      onPress={handleGoHome}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.trackLiveMapBtnText}>🏠 Go Home</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {/* 3. FOOD READY SCREEN (100% REAL BACKEND STATUS - NO TIMERS) */}
            {foodOrderStatus === 'FOOD_READY' && (
              <View style={styles.acceptedContentWrap}>
                <View style={{ width: 150, height: 150, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <LottieAnimation source={pickupReadyAnim} width={150} height={150} />
                </View>

                <Text style={[styles.acceptedHeaderTitle, { color: '#0066FF' }]}>Your {orderCategoryName} Is Ready! 🎉</Text>
                <Text style={styles.acceptedHeaderSub}>{orderCategoryName} Ready for Pickup / Delivery</Text>

                <View style={[styles.prepTimeHighlightCard, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                  <Text style={[styles.prepTimeBadgeTitle, { color: '#1D4ED8' }]}>📦 STATUS: READY FOR PICKUP</Text>
                  <Text style={[styles.prepTimeBadgeSub, { color: '#9A3412', marginTop: 4 }]}>
                    {activeFoodOrder?.restaurantName || restoName} has packed your {orderCategoryName.toLowerCase()} order safely. It is ready for delivery partner pickup.
                  </Text>
                </View>

                {/* Order Details Preview with Items List */}
                <View style={[styles.acceptedDetailsCard, { borderColor: '#BFDBFE' }]}>
                  <View style={styles.acceptedDetailRow}>
                    <Text style={styles.acceptedDetailLabel}>{orderCategoryName.toLowerCase() === 'food' ? 'Restaurant:' : 'Store:'}</Text>
                    <Text style={styles.acceptedDetailVal}>{activeFoodOrder?.restaurantName || restoName}</Text>
                  </View>
                  <View style={styles.acceptedDetailRow}>
                    <Text style={styles.acceptedDetailLabel}>Delivery Address:</Text>
                    <Text style={styles.acceptedDetailVal} numberOfLines={1}>
                      {activeFoodOrder?.destinationAddress || deliveryAddress?.fullAddress || 'Delivery Address'}
                    </Text>
                  </View>
                  <View style={styles.acceptedDetailRow}>
                    <Text style={styles.acceptedDetailLabel}>Order ID:</Text>
                    <Text style={[styles.acceptedDetailVal, { color: '#64748B' }]}>
                      #{(activeFoodOrder?.bookingId || effectiveRideId).slice(-6)}
                    </Text>
                  </View>

                  {/* Complete List of Ordered Items */}
                  {(() => {
                    const rawItems = activeFoodOrder?.cartItems || initialCartItems || cart;
                    const items = parseFoodOrderItems(rawItems, Number(activeFoodOrder?.price || totalPayable));
                    if (items.length === 0) return null;
                    return (
                      <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#BFDBFE' }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#9A3412', marginBottom: 6, textTransform: 'uppercase' }}>
                          Items Ordered:
                        </Text>
                        {items.map((it: any, idx: number) => (
                          <View key={it.id || idx} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={{ fontSize: 13, color: '#334155', flex: 1 }}>
                              • {it.name} <Text style={{ fontWeight: 'bold' }}>x {it.quantity}</Text>
                            </Text>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                              ₹{Math.round((Number(it.price) || 0) * (Number(it.quantity) || 1))}
                            </Text>
                          </View>
                        ))}
                      </View>
                    );
                  })()}

                  <View style={[styles.acceptedDetailRow, { borderTopWidth: 1, borderTopColor: '#BFDBFE', paddingTop: 8, marginTop: 8 }]}>
                    <Text style={[styles.acceptedDetailLabel, { fontWeight: '800', color: '#0F172A' }]}>Total Bill:</Text>
                    <Text style={[styles.acceptedDetailVal, { color: '#0066FF', fontWeight: '900', fontSize: 16 }]}>
                      ₹{activeFoodOrder?.price || totalPayable}
                    </Text>
                  </View>
                </View>

                {/* Actions: Track on Map, Call Restaurant & Go Home */}
                <View style={{ flexDirection: 'column', gap: 10, marginTop: 16 }}>
                  <TouchableOpacity
                    style={[styles.trackLiveMapBtn, { backgroundColor: '#0066FF' }]}
                    onPress={handleTrackLiveMap}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.trackLiveMapBtnText}>📍 Track Live Order (Map View)</Text>
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      style={[styles.trackLiveMapBtn, { backgroundColor: '#EFF6FF', borderColor: '#0066FF', borderWidth: 1.5, flex: 1 }]}
                      onPress={handleCallRestaurant}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.trackLiveMapBtnText, { color: '#0066FF' }]}>📞 Call Partner</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.trackLiveMapBtn, { backgroundColor: '#475569', flex: 1 }]}
                      onPress={handleGoHome}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.trackLiveMapBtnText}>🏠 Go Home</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {/* 3.5 OUT FOR DELIVERY SCREEN */}
            {(foodOrderStatus === 'OUT_FOR_DELIVERY' || foodOrderStatus === 'ON_THE_WAY' || foodOrderStatus === 'PICKED_UP') && (
              <View style={styles.acceptedContentWrap}>
                <View style={{ width: 150, height: 150, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <LottieAnimation source={bikeWinnerAnim} width={150} height={150} />
                </View>

                <Text style={[styles.acceptedHeaderTitle, { color: '#0066FF' }]}>Out for Delivery! 🛵</Text>
                <Text style={styles.acceptedHeaderSub}>Delivery partner is on the way to your doorstep</Text>

                <View style={[styles.prepTimeHighlightCard, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                  <Text style={[styles.prepTimeBadgeTitle, { color: '#1D4ED8' }]}>🚀 ORDER IN TRANSIT</Text>
                  <Text style={[styles.prepTimeBadgeSub, { color: '#1E40AF' }]}>
                    Your {orderCategoryName.toLowerCase() === 'food' ? 'meal' : 'order'} has been picked up from {activeFoodOrder?.restaurantName || restoName} and is on its way to your location.
                  </Text>
                </View>

                <View style={[styles.acceptedDetailsCard, { borderColor: '#BFDBFE' }]}>
                  <View style={styles.acceptedDetailRow}>
                    <Text style={styles.acceptedDetailLabel}>{orderCategoryName.toLowerCase() === 'food' ? 'Restaurant:' : 'Store:'}</Text>
                    <Text style={styles.acceptedDetailVal}>{activeFoodOrder?.restaurantName || restoName}</Text>
                  </View>
                  <View style={styles.acceptedDetailRow}>
                    <Text style={styles.acceptedDetailLabel}>Delivery Address:</Text>
                    <Text style={styles.acceptedDetailVal} numberOfLines={2}>
                      {activeFoodOrder?.destinationAddress || deliveryAddress?.fullAddress || 'Delivery Address'}
                    </Text>
                  </View>
                  {activeFoodOrder?.partnerName || activeFoodOrder?.driverName ? (
                    <View style={styles.acceptedDetailRow}>
                      <Text style={styles.acceptedDetailLabel}>Delivery Partner:</Text>
                      <Text style={[styles.acceptedDetailVal, { color: '#0066FF', fontWeight: '800' }]}>
                        {activeFoodOrder.partnerName || activeFoodOrder.driverName}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.acceptedDetailRow}>
                    <Text style={styles.acceptedDetailLabel}>Total Bill:</Text>
                    <Text style={[styles.acceptedDetailVal, { color: '#0066FF', fontWeight: '800' }]}>
                      ₹{activeFoodOrder?.price || totalPayable}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'column', gap: 10, marginTop: 16 }}>
                  <TouchableOpacity
                    style={[styles.trackLiveMapBtn, { backgroundColor: '#0066FF' }]}
                    onPress={handleTrackLiveMap}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.trackLiveMapBtnText}>📍 Track Live Order (Map View)</Text>
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      style={[styles.trackLiveMapBtn, { backgroundColor: '#EFF6FF', borderColor: '#0066FF', borderWidth: 1.5, flex: 1 }]}
                      onPress={handleCallRestaurant}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.trackLiveMapBtnText, { color: '#0066FF' }]}>📞 Call Partner</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.trackLiveMapBtn, { backgroundColor: '#475569', flex: 1 }]}
                      onPress={handleGoHome}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.trackLiveMapBtnText}>🏠 Go Home</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {/* 4. RESTAURANT DECLINED, TIMEOUT, OR CANCELLED SCREEN */}
            {(foodOrderStatus === 'RESTAURANT_DECLINED' || foodOrderStatus === 'NO_RESPONSE' || foodOrderStatus === 'CANCELLED' || foodOrderStatus === 'TIMEOUT') && (
              <View style={styles.acceptedContentWrap}>
                <View style={[styles.acceptedIconCircle, { backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 2 }]}>
                  <Text style={{ fontSize: 38 }}>{(foodOrderStatus === 'TIMEOUT' || foodOrderStatus === 'NO_RESPONSE') ? '⏰' : '❌'}</Text>
                </View>

                <Text style={[styles.acceptedHeaderTitle, { color: (foodOrderStatus === 'TIMEOUT' || foodOrderStatus === 'NO_RESPONSE') ? '#0066FF' : '#DC2626' }]}>
                  {(foodOrderStatus === 'TIMEOUT' || foodOrderStatus === 'NO_RESPONSE') ? 'Order Timed Out' : 'Order Cancelled'}
                </Text>
                <Text style={styles.acceptedHeaderSub}>
                  {(foodOrderStatus === 'TIMEOUT' || foodOrderStatus === 'NO_RESPONSE')
                    ? `No ${getCategoryStoreLabel(orderCategoryName).toLowerCase()} accepted your order. Please try again.`
                    : (activeFoodOrder?.cancellationReason || `The ${getCategoryStoreLabel(orderCategoryName).toLowerCase()} was unable to fulfill the order.`)}
                </Text>

                <View style={[styles.prepTimeHighlightCard, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                  <Text style={[styles.prepTimeBadgeTitle, { color: '#991B1B' }]}>
                    {(foodOrderStatus === 'TIMEOUT' || foodOrderStatus === 'NO_RESPONSE') ? `ℹ️ NO ${getCategoryStoreLabel(orderCategoryName).toUpperCase()} RESPONSE` : 'ℹ️ ORDER CANCELLED'}
                  </Text>
                  <Text style={[styles.prepTimeBadgeSub, { color: '#7F1D1D' }]}>
                    {(foodOrderStatus === 'TIMEOUT' || foodOrderStatus === 'NO_RESPONSE')
                      ? `No ${getCategoryStoreLabel(orderCategoryName).toLowerCase()} partner responded to your order request within 60 seconds. Please try again or select another partner.`
                      : `Reason: ${activeFoodOrder?.cancellationReason || 'Partner unavailable right now'}. Any advance payment will be automatically credited back.`}
                  </Text>
                </View>

                {/* Actions: Go Home & Choose Another Partner */}
                <View style={{ width: '100%', gap: 10, marginTop: 16 }}>
                  <TouchableOpacity
                    style={[styles.trackLiveMapBtn, { backgroundColor: '#0066FF' }]}
                    onPress={handleGoHome}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.trackLiveMapBtnText}>🏠 Go Home</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.trackLiveMapBtn, { backgroundColor: '#EFF6FF', borderColor: '#0066FF', borderWidth: 1.5 }]}
                    onPress={handleResetFoodOrder}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.trackLiveMapBtnText, { color: '#0066FF' }]}>
                      {(foodOrderStatus === 'TIMEOUT' || foodOrderStatus === 'NO_RESPONSE') ? '🔄 Try Again' : `🔄 Choose Another ${getCategoryStoreLabel(orderCategoryName)}`}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* 5. ORDER COMPLETED SCREEN */}
            {foodOrderStatus === 'COMPLETED' && (
              <View style={styles.acceptedContentWrap}>
                <View style={[styles.acceptedIconCircle, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderWidth: 2 }]}>
                  <Text style={{ fontSize: 38 }}>🎉</Text>
                </View>

                <Text style={[styles.acceptedHeaderTitle, { color: '#0066FF' }]}>Order Completed! 🎉</Text>
                <Text style={styles.acceptedHeaderSub}>
                  Thank you for ordering from {activeFoodOrder?.restaurantName || restoName}!
                </Text>

                <View style={[styles.prepTimeHighlightCard, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                  <Text style={[styles.prepTimeBadgeTitle, { color: '#1D4ED8' }]}>
                    {orderCategoryName.toLowerCase() === 'food' ? '🍽️ MEAL DELIVERED & COMPLETED' : `${categoryTerminology.icon} ORDER DELIVERED & COMPLETED`}
                  </Text>
                  <Text style={[styles.prepTimeBadgeSub, { color: '#9A3412' }]}>
                    {orderCategoryName.toLowerCase() === 'food'
                      ? 'Your food was prepared with love and handed over. Enjoy your food!'
                      : `Your ${orderCategoryName.toLowerCase()} order has been delivered safely. Thank you for shopping with us!`}
                  </Text>
                </View>

                <View style={[styles.acceptedDetailsCard, { borderColor: '#BFDBFE' }]}>
                  <View style={styles.acceptedDetailRow}>
                    <Text style={styles.acceptedDetailLabel}>{orderCategoryName.toLowerCase() === 'food' ? 'Restaurant:' : 'Store:'}</Text>
                    <Text style={styles.acceptedDetailVal}>{activeFoodOrder?.restaurantName || restoName}</Text>
                  </View>
                  <View style={styles.acceptedDetailRow}>
                    <Text style={styles.acceptedDetailLabel}>Total Paid:</Text>
                    <Text style={[styles.acceptedDetailVal, { color: '#0066FF', fontWeight: '800' }]}>
                      ₹{activeFoodOrder?.price || totalPayable}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.trackLiveMapBtn, { backgroundColor: '#0066FF', marginTop: 16 }]}
                  onPress={handleGoHome}
                  activeOpacity={0.85}
                >
                  <Text style={styles.trackLiveMapBtnText}>🏠 Go Home</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: 50 }}>
            {bookingState === 'searching' ? (
              <>
                <ActivityIndicator size="large" color="#0066FF" />
                <Text style={{ marginTop: 24, fontSize: 18, fontWeight: '900', color: '#111827' }}>Searching nearby professionals...</Text>
                <Text style={{ marginTop: 6, fontSize: 14, color: '#6B7280', textAlign: 'center', paddingHorizontal: 20 }}>Please wait while we connect you to the best match.</Text>

                <TouchableOpacity
                  style={{
                    marginTop: 24,
                    backgroundColor: '#FEE2E2',
                    borderColor: '#EF4444',
                    borderWidth: 1.5,
                    paddingVertical: 12,
                    paddingHorizontal: 28,
                    borderRadius: 24,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}
                  onPress={handleCancelSearching}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: '#EF4444', fontWeight: '800', fontSize: 15 }}>✕ Stop Searching / Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#d1fae5', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="checkmark" size={32} color="#059669" />
                </View>
                <Text style={{ marginTop: 20, fontSize: 20, fontWeight: '900', color: '#059669' }}>
                  {isFoodDelivery ? 'Order Confirmed!' : 'Professional Found!'}
                </Text>
                <Text style={{ marginTop: 6, fontSize: 14, color: '#6B7280' }}>
                  {orderCategoryName.toLowerCase() === 'food' ? 'Preparing your delicious meal...' : `Packing your ${orderCategoryName.toLowerCase()} order safely...`}
                </Text>
              </>
            )}
          </View>
        )}
      </View>

      {/* ADDRESS SELECTION & ADD MODAL */}
      <AddressSelectionModal
        visible={addressModalVisible}
        onClose={() => setAddressModalVisible(false)}
        activeAddressId={deliveryAddress?.id}
        onSelectAddress={(addr) => setDeliveryAddress(addr)}
      />

      {/* Heavy Rain Animation Overlay */}
      {isRaining && <RainAnimation active={isRaining} intensity="heavy" />}

      {/* CUSTOMER DYNAMIC HELP CENTER MODAL */}
      <CustomerHelpCenterModal
        visible={showHelpCenter}
        onClose={() => setShowHelpCenter(false)}
        orderStage={
          !isFoodDelivery || (foodOrderStatus === 'IDLE' && !activeFoodOrder)
            ? 'BEFORE_PAYMENT'
            : (foodOrderStatus === 'CONNECTING' || foodOrderStatus === 'RINGING')
            ? 'ORDER_SENT_TO_STORE'
            : (foodOrderStatus === 'RESTAURANT_ACCEPTED' || foodOrderStatus === 'PREPARING' || foodOrderStatus === 'FOOD_READY')
            ? 'STORE_ACCEPTED'
            : (foodOrderStatus === 'OUT_FOR_DELIVERY' || foodOrderStatus === 'ON_THE_WAY' || foodOrderStatus === 'PICKED_UP')
            ? 'RIDER_ASSIGNED'
            : foodOrderStatus === 'COMPLETED'
            ? 'AFTER_DELIVERY'
            : 'BEFORE_PAYMENT'
        }
        categoryName={orderCategoryName}
        bookingId={effectiveRideId}
        orderData={activeFoodOrder}
        user={user}
        userCoords={effectiveCoords}
        onCancelOrder={handleCancelSearching}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, backgroundColor: '#F8FAFC', zIndex: 50, marginTop: 25 },
  menuBtn: { padding: 4 },
  logoContainer: { flexDirection: 'row', alignItems: 'center' },
  logoZ: { color: '#0ea5e9', fontWeight: '900', fontSize: 28, letterSpacing: -1 },
  logoCaret: { color: '#10b981' },
  logoTextContainer: { marginLeft: 4, justifyContent: 'center' },
  logoTextMain: { color: '#1e3a8a', fontWeight: '900', fontSize: 20, letterSpacing: 1, lineHeight: 20 },
  logoTextSub: { color: '#4b5563', fontSize: 9, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', marginTop: 1 },
  helpBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  helpText: { fontSize: 12, fontWeight: 'bold', color: '#1F2937', marginLeft: 6 },
  
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },

  mapArea: { flex: 1, backgroundColor: '#e2e8f0', position: 'relative' },
  
  locationOverlay: { position: 'absolute', top: 16, left: 16, right: 16, zIndex: 50 },
  locationBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  locationIconContainer: { flexDirection: 'row', alignItems: 'center' },
  locationIconBg: { width: 40, height: 40, backgroundColor: '#EFF6FF', borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  locationTextContainer: { width: '80%' },
  locationTitle: { fontWeight: 'bold', fontSize: 15, color: '#111827', lineHeight: 20 },
  locationSubtitle: { fontSize: 12, color: '#6B7280' },
  
  bottomSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 10, maxHeight: '65%' },
  dragHandle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  
  infoSection: { marginBottom: 16 },
  infoLeft: { flexDirection: 'row', alignItems: 'center' },
  infoIconBg: { width: 40, height: 40, backgroundColor: '#ecfdf5', borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  infoTitle: { fontWeight: '900', fontSize: 15, color: '#111827' },
  infoSubtitle: { fontSize: 12, color: '#6B7280' },
  
  serviceSection: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#F3F4F6', paddingVertical: 14, marginBottom: 16 },
  serviceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  serviceTitle: { fontWeight: '900', fontSize: 16, color: '#111827' },
  serviceSubtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  basePriceText: { fontSize: 18, fontWeight: '900', color: '#111827' },

  breakdownBox: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  breakdownLabel: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  breakdownVal: { fontSize: 13, color: '#0F172A', fontWeight: '700' },
  totalRow: { borderTopWidth: 1, borderColor: '#E2E8F0', paddingTop: 8, marginTop: 4 },
  totalLabel: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  totalVal: { fontSize: 16, fontWeight: '900', color: '#0066FF' },

  promoSection: { marginBottom: 16 },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
  promoInputRow: { flexDirection: 'row', alignItems: 'center' },
  promoInput: { flex: 1, height: 44, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, paddingHorizontal: 12, fontSize: 13, color: '#0F172A', backgroundColor: '#F8FAFC' },
  promoApplyBtn: { backgroundColor: '#0F172A', height: 44, paddingHorizontal: 16, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  promoApplyBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  appliedPromoBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0', borderRadius: 10, padding: 10 },
  appliedPromoTitle: { fontSize: 13, fontWeight: '800', color: '#065F46' },
  appliedPromoSub: { fontSize: 11, color: '#047857', marginTop: 2 },
  removePromoBtn: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FCA5A5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  removePromoText: { fontSize: 11, fontWeight: '800', color: '#EF4444' },
  promoErrorText: { fontSize: 12, color: '#EF4444', fontWeight: '600', marginTop: 4 },
  promoSuccessText: { fontSize: 12, color: '#16A34A', fontWeight: '600', marginTop: 4 },

  paymentSection: { marginBottom: 16 },
  paymentAccordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F1F5F9',
    padding: 12,
    borderRadius: 12,
  },
  paymentAccordionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginLeft: 8,
  },
  paymentAccordionSelected: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
  },
  paymentAccordionBody: {
    marginTop: 10,
    gap: 8,
  },
  paymentCard: { padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  paymentCardActive: { borderColor: '#059669', backgroundColor: '#F0FDF4' },
  paymentCardDisabled: { opacity: 0.5 },
  paymentCardLeft: { flexDirection: 'row', alignItems: 'center' },
  cashIconBg: { width: 32, height: 32, backgroundColor: '#D1FAE5', borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  officeIconBg: { width: 32, height: 32, backgroundColor: '#DBEAFE', borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  paymentTitle: { fontWeight: '800', fontSize: 13, color: '#0F172A' },
  paymentSubtitle: { fontSize: 11, color: '#64748B', marginTop: 2 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  radioActive: { backgroundColor: '#059669', borderColor: '#059669' },
  
  findBtn: { backgroundColor: '#059669', paddingVertical: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  findBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16 },

  /* FOOD DELIVERY ADDRESS CARD STYLES */
  gpsPillSmall: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  gpsPillSmallText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#166534',
  },
  changeAddressOverlayBtn: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  changeAddressOverlayText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0066FF',
  },
  foodAddressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  foodAddressCardLeft: {
    flex: 1,
    marginRight: 10,
  },
  foodTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  foodTagBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  foodTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1E293B',
    letterSpacing: 0.5,
  },
  foodAddressTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  foodAddressSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  foodAddressCity: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  changeAddressSheetBtn: {
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  changeAddressSheetBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0066FF',
  },

  /* RESTAURANT & RIDER FEE CARD STYLES */
  restoCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#FEE2E2',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  restoCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 8,
  },
  restoNameText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  restoAddressText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  riderFeeDistPill: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginLeft: 8,
  },
  riderFeeDistPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  riderFeeBreakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  riderFeeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  riderFeeNoteText: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  riderFeeAmountText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },

  /* FOOD ORDER STATUS & HOLD SCREEN STYLES */
  foodStatusContainer: {
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    width: '100%',
  },
  ringingContentWrap: {
    alignItems: 'center',
    width: '100%',
  },
  ringingIconOuterCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  ringingIconInnerCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#0066FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringingTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  ringingRestoName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0066FF',
    marginBottom: 14,
  },
  ringingTimerBox: {
    width: '100%',
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#93C5FD',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  ringingTimerPrefix: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1D4ED8',
    letterSpacing: 1,
    marginBottom: 4,
  },
  ringingTimerDigits: {
    fontSize: 32,
    fontWeight: '900',
    color: '#9A3412',
    letterSpacing: 2,
    marginBottom: 8,
  },
  ringingProgressBarTrack: {
    width: '100%',
    height: 6,
    backgroundColor: '#BFDBFE',
    borderRadius: 3,
    overflow: 'hidden',
  },
  ringingProgressBarFill: {
    height: '100%',
    backgroundColor: '#0066FF',
    borderRadius: 3,
  },
  ringingHintText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 12,
    marginBottom: 14,
    lineHeight: 17,
  },
  ringingSummaryCard: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  ringingSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  ringingSummaryLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  ringingSummaryVal: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '700',
  },
  ringingCancelBtn: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1.5,
    borderColor: '#EF4444',
    paddingVertical: 11,
    paddingHorizontal: 26,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringingCancelBtnText: {
    color: '#EF4444',
    fontWeight: '800',
    fontSize: 14,
  },

  /* ACCEPTED & PREPARING STYLES */
  acceptedContentWrap: {
    alignItems: 'center',
    width: '100%',
  },
  acceptedLottieWrapper: {
    width: 220,
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: 'transparent',
  },
  acceptedIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  acceptedHeaderTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#16A34A',
    marginBottom: 4,
  },
  acceptedHeaderSub: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 14,
  },
  prepTimeHighlightCard: {
    width: '100%',
    backgroundColor: '#EFF6FF',
    borderWidth: 2,
    borderColor: '#BFDBFE',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  prepTimeBadgeTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0066FF',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  prepTimeBadgeSub: {
    fontSize: 12,
    color: '#9A3412',
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 8,
  },
  cookingAnimationDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  cookingDot: {
    fontSize: 14,
    marginRight: 6,
  },
  cookingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  acceptedDetailsCard: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  acceptedDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  acceptedDetailLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  acceptedDetailVal: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '700',
    maxWidth: '65%',
  },
  trackLiveMapBtn: {
    width: '100%',
    backgroundColor: '#0066FF',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  trackLiveMapBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  foodDeliveryHeaderTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  foodDeliveryHeaderMain: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0066FF',
  },
  foodDeliveryHeaderSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9A3412',
    marginTop: 1,
  },
  gpsSectionCard: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  gpsSectionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  gpsLivePill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  gpsLivePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#166534',
    letterSpacing: 0.5,
  },
  gpsFixText: {
    fontSize: 11,
    fontWeight: '600',
  },
  gpsRefreshBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  gpsRefreshBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0066FF',
  },
  gpsCoordsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  gpsCoordItem: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 8,
    padding: 8,
  },
  gpsCoordLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  gpsCoordVal: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  gpsMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  gpsMetaText: {
    fontSize: 11,
    fontWeight: '500',
  },
});

export default PaymentConfirmScreen;
