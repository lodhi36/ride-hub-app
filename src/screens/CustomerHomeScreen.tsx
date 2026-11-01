import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  TextInput,
  StatusBar,
  Image,
  ImageBackground,
  ActivityIndicator,
  FlatList,
  Dimensions,
  RefreshControl,
  Alert,
  PermissionsAndroid,
  Platform,
  Animated,
  BackHandler,
  Switch,
  Easing,
  Modal,
  AppState,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import api, { UPLOADS_URL } from '../services/api';
import { BASE_URL, LOCAL_URL, resolveUploadUrl } from '../config/apiConfig';
import restaurantDataService from '../services/RestaurantDataService';
import { CartService } from '../services/CartService';
import { useTheme } from '../context/ThemeContext';
import {
  fetchCurrentGpsPosition,
  fetchCurrentGpsPositionDetailed,
  reverseGeocodeCoords,
  getActiveDeliveryAddress,
  getPermanentCustomerAddress,
  savePermanentCustomerAddress,
  checkLocationPermission,
  requestLocationPermission,
  getCanonicalRestaurantLocation,
  calculateHaversineDistanceKm,
  syncLiveDeviceLocationInBackground,
  DeliveryAddress,
  DeviceGpsFix,
} from '../services/LocationAddressService';
import AddressSelectionModal from '../components/AddressSelectionModal';
import { CustomerMapLocationModal } from '../components/CustomerMapLocationModal';
import { DeviceLocationRequiredModal } from '../components/DeviceLocationRequiredModal';
import RainAnimation from '../components/RainAnimation';
import Icon from '../components/PngIcon';
import { CustomerHelpCenterModal } from '../components/CustomerHelpCenterModal';
import RoleBannerCarousel from '../components/RoleBannerCarousel';
import CancellationPopupModal, { isCancellationEventProcessed } from '../components/CancellationPopupModal';
import { LottieAnimation } from '../components/LottieAnimation';
import VoiceSearchModal from '../components/VoiceSearchModal';
import CustomerSearchModal from '../components/CustomerSearchModal';
import RestaurantImageCarousel from '../components/RestaurantImageCarousel';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import {
  resolveCategoryName,
  getCategoryIcon,
  getCategoryPlaceholderImage,
  getCategoryDeliveryTitle,
  normalizeCategory,
} from '../utils/categoryHelper';

const toranGarlandLottie = require('../banner/toran_garland.json');
const shoppingLottieJson = require('../banner/SingleShoppingGirl.json');
const shoppingBagLottieJson = require('../banner/Shopping bag.json');

const TRENDING_SEARCH_SUGGESTIONS = [
  { label: '🍕 Pizza', query: 'Pizza' },
  { label: '🍲 Biryani', query: 'Biryani' },
  { label: '🍔 Burger', query: 'Burger' },
  { label: '🥛 Fresh Milk', query: 'Milk' },
  { label: '🍰 Cake & Bakery', query: 'Cake' },
  { label: '🥦 Fresh Veggies', query: 'Vegetables' },
  { label: '🥗 Paneer Tikka', query: 'Paneer' },
  { label: '☕ Cold Coffee', query: 'Coffee' },
  { label: '🥪 Sandwich', query: 'Sandwich' },
  { label: '👗 Fashion', query: 'Fashion' },
  { label: '🍗 Chicken Roll', query: 'Chicken' },
  { label: '🍨 Ice Cream', query: 'Ice Cream' },
];

const { width, height } = Dimensions.get('window');
const SCREEN_WIDTH = width;
const SCREEN_HEIGHT = height;

// Helper for resolving category images
const resolveCategoryImageUrl = (img?: string) => {
  if (!img || typeof img !== 'string') return null;
  const url = resolveUploadUrl(img);
  return url || null;
};

// Promo Banners (Super App Multi-Service Banners)
const PROMO_BANNERS: any[] = [];


// Category Item Interface
interface CategoryItemDef {
  key: string;
  name: string;
  image?: string;
  fallbackImage?: string;
  isAll?: boolean;
  isMore?: boolean;
  icon?: string;
}

const CATEGORY_ROW_1: CategoryItemDef[] = [
  { key: 'food', name: 'Food' },
  { key: 'grocery', name: 'Grocery' },
  { key: 'fashion', name: 'Fashion' },
  { key: 'beauty', name: 'Beauty' },
  { key: 'home', name: 'Home & Living' },
];

const CATEGORY_ROW_2: CategoryItemDef[] = [
  { key: 'vegetables', name: 'Vegetables\n& Fruits' },
  { key: 'meat', name: 'Meat & Fish' },
  { key: 'bakery', name: 'Bakery & Cakes' },
  { key: 'beverages', name: 'Beverages' },
  { key: 'more', name: 'More', isMore: true },
];

const POPULAR_DISHES: any[] = [];

const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
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
  return Math.round(R * c * 10) / 10;
};

const formatDistance = (distKm: number): string => {
  if (!distKm || isNaN(distKm)) return '1.2 km';
  if (distKm < 1) {
    return `${Math.round(distKm * 1000)} m`;
  }
  return `${distKm.toFixed(1)} km`;
};

const resolveBannerUrl = (img?: string) => {
  if (!img || typeof img !== 'string') return null;
  const url = resolveUploadUrl(img);
  return url || null;
};

const formatRating = (rating: any): string => {
  if (rating === undefined || rating === null || rating === '') return 'No ratings yet';
  const num = Number(rating);
  if (isNaN(num) || num <= 0) return 'No ratings yet';
  return num.toFixed(1);
};



const SEARCH_PHRASES = [
  'Search Food, Grocery, Beauty, Fashion & More...',
  'Search Fresh Food & Dishes...',
  'Search Daily Groceries & Kirana...',
  'Search Vegetables & Fruits...',
  'Search Beauty & Salon Stores...',
  'Search Fashion & Clothing...',
  'Search Bakery & Delicious Cakes...',
];

const CATEGORY_GROUPS: any[] = [];

const CustomerHomeScreen = ({ navigation, route }: any) => {
  const insets = useSafeAreaInsets();
  const topSafeHeight = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 36) : 0);
  const { socket } = useSocket();
  const { user } = useAuth();
  const { isDark, currentColors } = useTheme('customer');

  const [currentAddress, setCurrentAddress] = useState<string>('Detecting location...');
  const [customerCoords, setCustomerCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isOutOfZone, setIsOutOfZone] = useState<boolean>(false);
  const [zoneCheckMessage, setZoneCheckMessage] = useState<string>('');
  const [showMapLocationModal, setShowMapLocationModal] = useState<boolean>(false);
  const [showLocationRequiredModal, setShowLocationRequiredModal] = useState<boolean>(false);

  // Set of cancelled order IDs to prevent stale track orders from re-appearing
  const cancelledOrdersRef = useRef<Set<string>>(new Set());

  // When customer updates location from Map Modal
  const handleLocationUpdatedFromMap = (coords: { latitude: number; longitude: number }, fullAddress: string) => {
    console.log('📍 [CustomerHomeScreen] Location updated from Map:', coords, fullAddress);
    setCustomerCoords(coords);
    setCurrentAddress(fullAddress);
    setLocationPermissionGranted(true);
    setShowLocationRequiredModal(false);
    setIsOutOfZone(false);
    setZoneCheckMessage('');
    fetchOnlineRestaurants(true, coords);
    savePermanentCustomerAddress({
      id: `addr_map_${Date.now()}`,
      fullAddress,
      latitude: coords.latitude,
      longitude: coords.longitude,
      tag: 'Other',
      houseNo: '',
      landmark: '',
      pincode: '',
      city: 'Bhopal',
    }).catch(() => {});
  };

  // Real-time Service Zone Verification for Customer GPS
  useEffect(() => {
    if (!customerCoords?.latitude || !customerCoords?.longitude || (customerCoords.latitude === 0 && customerCoords.longitude === 0)) return;
    let isMounted = true;
    const verifyZone = async () => {
      try {
        const res = await api.post('/zones/check-customer-serviceable', {
          latitude: customerCoords.latitude,
          longitude: customerCoords.longitude,
        });
        if (isMounted) {
          if (res.data && res.data.serviceable === false && !res.data.pendingLocation) {
            setIsOutOfZone(true);
            setZoneCheckMessage(res.data.message || 'This service is not available in your location.');
          } else {
            setIsOutOfZone(false);
            setZoneCheckMessage('');
          }
        }
      } catch (e: any) {
        console.warn('[CUSTOMER ZONE CHECK NOTICE]', e?.message);
        if (isMounted) {
          setIsOutOfZone(false);
        }
      }
    };
    verifyZone();
    return () => { isMounted = false; };
  }, [customerCoords?.latitude, customerCoords?.longitude]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showSearchModal, setShowSearchModal] = useState<boolean>(false);
  const [showVoiceModal, setShowVoiceModal] = useState<boolean>(false);
  const [selectedCat, setSelectedCat] = useState<string>('all');
  const [categories, setCategories] = useState<any[]>([]);
  const [cartCount, setCartCount] = useState<number>(CartService.getCartCount());
  const [cartState, setCartState] = useState<any>(CartService.getCart());
  const [activeTab, setActiveTab] = useState<'home' | 'search' | 'orders' | 'profile'>('home');
  const [activeFoodOrder, setActiveFoodOrder] = useState<any | null>(null);
  const [cancelingActiveOrder, setCancelingActiveOrder] = useState<boolean>(false);
  const [showCustomerHelpModal, setShowCustomerHelpModal] = useState<boolean>(false);
  const [isVegMode, setIsVegMode] = useState<boolean>(false);
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [cancellationPopup, setCancellationPopup] = useState<{
    visible: boolean;
    orderId?: string | number;
    reason?: string;
    cancelledBy?: string;
    storeName?: string;
    refundStatus?: string;
    refundAmount?: number;
    paidAmount?: number;
    isNonRefundable?: boolean;
    cancelledAt?: string | Date;
  }>({ visible: false });

  // ── Customer Active Order Cancellation Reason State ──
  const [customerCancelModalVisible, setCustomerCancelModalVisible] = useState<boolean>(false);
  const [customerCancelOrderTarget, setCustomerCancelOrderTarget] = useState<any | null>(null);
  const [customerSelectedReason, setCustomerSelectedReason] = useState<string>('Ordered by mistake');

  const CUSTOMER_CANCEL_REASONS = [
    'Ordered by mistake',
    'Delivery taking too long',
    'Need to change delivery address',
    'Placed duplicate order',
    'Items not needed anymore',
    'Other personal reason',
  ];

  // Smooth Bottom Bar Hide/Show on Scroll Animation
  const bottomBarTranslateY = useRef(new Animated.Value(0)).current;
  const searchBarShiftAnim = useRef(new Animated.Value(0)).current;
  const searchBarGradientOpacity = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);

  const handleMainScroll = (event: any) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const diff = currentY - lastScrollY.current;

    // Requirement 9: Customer Home Search Bar Gradient Animation
    // Gradual smooth transition on upward scroll/swipe: 0 at top, 1 when scrolled
    const gradientProgress = Math.max(0, Math.min(1, (currentY - 8) / 55));
    Animated.timing(searchBarGradientOpacity, {
      toValue: gradientProgress,
      duration: 100,
      useNativeDriver: true,
    }).start();

    // Requirement 15: Slight swipe up moves ONLY the search bar downward with smooth bounded translation
    if (currentY > 15) {
      Animated.timing(searchBarShiftAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(searchBarShiftAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
    }

    if (currentY <= 15) {
      // Top of screen -> Always show
      Animated.timing(bottomBarTranslateY, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
    } else if (diff > 8 && currentY > 50) {
      // User is scrolling DOWN (content moving UP) -> Smoothly hide bottom bar
      Animated.timing(bottomBarTranslateY, {
        toValue: 140,
        duration: 220,
        useNativeDriver: true,
      }).start();
    } else if (diff < -8) {
      // User is scrolling UP (content moving DOWN) -> Smoothly show bottom bar
      Animated.timing(bottomBarTranslateY, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
    }

    lastScrollY.current = currentY;
  };

  // Subscribe to CartService updates for real-time sticky card & badge updates
  useEffect(() => {
    const unsub = CartService.subscribe((state) => {
      setCartState(state);
      setCartCount(state.count);
    });
    return unsub;
  }, []);

  // Stale-While-Revalidate Caching State
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [loadingRestaurants, setLoadingRestaurants] = useState<boolean>(true);
  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [popularDishes, setPopularDishes] = useState<any[]>([]);
  const [failedImages, setFailedImages] = useState<{ [key: string]: boolean }>({});
  const [bannerIndex, setBannerIndex] = useState(0);

  // Dynamic Admin-Uploaded Customer Hero Posters (6-Second Auto Slide)
  const [customerBanners, setCustomerBanners] = useState<any[]>([]);
  const [failedBannerIds, setFailedBannerIds] = useState<{ [key: string]: boolean }>({});
  const [heroActiveIndex, setHeroActiveIndex] = useState<number>(0);
  const heroScrollRef = useRef<ScrollView>(null);

  const activeVisibleBanners = customerBanners.filter((b: any) => {
    const bKey = String(b._id || b.id || b.imageUrl || b.mediaUrl || '');
    return !failedBannerIds[bKey];
  });

  // Dynamic Diamond / Hero Lottie Animation State (Admin Controlled)
  const [activeDiamondLottie, setActiveDiamondLottie] = useState<any>(shoppingLottieJson);

  // Requirement 4: Prompt Review directly on Customer Home when an order is completed/delivered
  const [deliveredOrderToReview, setDeliveredOrderToReview] = useState<any>(null);
  const [reviewRatingStars, setReviewRatingStars] = useState<number>(5);
  const [reviewRatingText, setReviewRatingText] = useState<string>('');
  const [isSubmittingHomeReview, setIsSubmittingHomeReview] = useState<boolean>(false);
  const dismissedReviewOrdersRef = useRef<Set<string>>(new Set());

  const handleSubmitDeliveredReview = async () => {
    if (!deliveredOrderToReview || isSubmittingHomeReview) return;
    try {
      setIsSubmittingHomeReview(true);
      const bId = deliveredOrderToReview.bookingId || deliveredOrderToReview.rideId || deliveredOrderToReview._id;
      await api.post('/bookings/rate', {
        bookingId: bId,
        rating: reviewRatingStars,
        reviewText: reviewRatingText.trim(),
        ratingTarget: 'both',
      });
      dismissedReviewOrdersRef.current.add(String(bId));
      Alert.alert('Thank You! ⭐', 'Your rating & review have been submitted successfully!');
      setDeliveredOrderToReview(null);
      setReviewRatingText('');
      setReviewRatingStars(5);
    } catch (e: any) {
      console.warn('Review submit error:', e);
      Alert.alert('Notice', 'Could not submit review at this moment. Please try again.');
    } finally {
      setIsSubmittingHomeReview(false);
    }
  };

  const handleDismissDeliveredReview = () => {
    if (deliveredOrderToReview) {
      const bId = deliveredOrderToReview.bookingId || deliveredOrderToReview.rideId || deliveredOrderToReview._id;
      dismissedReviewOrdersRef.current.add(String(bId));
    }
    setDeliveredOrderToReview(null);
  };

  const fetchCustomerBanners = useCallback(async () => {
    try {
      // Fetch Customer/User banners explicitly managed by Admin in Banners Campaign
      const res = await api.get('/banner?status=Active&target=USER').catch(() => null);
      let bannersList: any[] = [];
      if (res?.data?.success && Array.isArray(res.data.data)) {
        bannersList = res.data.data.filter((b: any) => {
          const t = String(b.target || 'USER').toUpperCase();
          return t === 'USER' || t === 'CUSTOMER' || t === 'HOME' || t === 'ALL' || !b.target;
        });
      }

      setCustomerBanners(bannersList);
      setFailedBannerIds({});
      if (Array.isArray(bannersList) && bannersList.length > 0) {
        AsyncStorage.setItem('@cached_customer_banners', JSON.stringify(bannersList)).catch(() => {});
      } else {
        AsyncStorage.removeItem('@cached_customer_banners').catch(() => {});
      }
    } catch (e) {
      console.log('[CustomerHome] Error fetching banners:', e);
    }
  }, []);

  const fetchDiamondLottie = useCallback(async () => {
    try {
      const res = await api.get('/settings/diamond-animation').catch(() => null);
      if (res?.data?.success && res.data.diamondAnimation) {
        const anim = res.data.diamondAnimation;
        if (anim.isActive !== false && anim.animationUrl) {
          const url = resolveBannerUrl(anim.animationUrl);
          if (url) {
            setActiveDiamondLottie({ uri: `${url}?v=${Date.now()}` });
          }
        }
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    fetchCustomerBanners();
    fetchDiamondLottie();

    // Background safety sync every 15s
    const bgSyncTimer = setInterval(() => {
      fetchCustomerBanners();
      fetchDynamicCategories();
    }, 15000);

    if (!socket) return () => clearInterval(bgSyncTimer);

    const handleBannerCreated = (data: any) => {
      console.log('📢 [CUSTOMER HOME] Real-time banner created:', data);
      const b = data?.banner || data;
      if (b && (b.imageUrl || b._id)) {
        const t = String(b.target || 'USER').toUpperCase();
        if (t === 'USER' || t === 'CUSTOMER' || t === 'HOME' || t === 'ALL' || !b.target) {
          setCustomerBanners((prev) => {
            const exists = prev.some((x) => String(x._id || x.id) === String(b._id || b.id));
            if (exists) return prev;
            const next = [b, ...prev];
            AsyncStorage.setItem('@cached_customer_banners', JSON.stringify(next)).catch(() => {});
            return next;
          });
        }
      }
      fetchCustomerBanners();
    };

    const handleBannerDeleted = (data: any) => {
      console.log('⚡ [CUSTOMER HOME] Real-time banner deleted:', data);
      const delId = String(data?.id || data?._id || '');
      if (delId) {
        setCustomerBanners((prev) => {
          const next = prev.filter((b) => String(b._id || b.id) !== delId);
          if (next.length === 0) {
            AsyncStorage.removeItem('@cached_customer_banners').catch(() => {});
          } else {
            AsyncStorage.setItem('@cached_customer_banners', JSON.stringify(next)).catch(() => {});
          }
          return next;
        });
      }
      fetchCustomerBanners();
    };

    const handleBannersUpdate = () => fetchCustomerBanners();

    const handleDiamondUpdate = (data: any) => {
      if (data?.animationUrl) {
        const url = resolveBannerUrl(data.animationUrl);
        if (url) setActiveDiamondLottie({ uri: `${url}?v=${Date.now()}` });
      }
    };
    const handleScreenMediaUpdate = (data: any) => {
      const sid = String(data?.screenId || '').toLowerCase();
      if (sid.includes('home') || sid.includes('customer')) {
        fetchCustomerBanners();
      }
    };

    socket.on('banner_created', handleBannerCreated);
    socket.on('banner_updated', handleBannersUpdate);
    socket.on('banner_deleted', handleBannerDeleted);
    socket.on('banner_change', handleBannersUpdate);
    socket.on('screen_media_updated', handleScreenMediaUpdate);
    socket.on('screen_media_customer_home', handleScreenMediaUpdate);
    socket.on('diamond_animation_updated', handleDiamondUpdate);
    socket.on('connect', handleBannersUpdate);

    return () => {
      clearInterval(bgSyncTimer);
      socket.off('banner_created', handleBannerCreated);
      socket.off('banner_updated', handleBannersUpdate);
      socket.off('banner_deleted', handleBannerDeleted);
      socket.off('banner_change', handleBannersUpdate);
      socket.off('screen_media_updated', handleScreenMediaUpdate);
      socket.off('screen_media_customer_home', handleScreenMediaUpdate);
      socket.off('diamond_animation_updated', handleDiamondUpdate);
      socket.off('connect', handleBannersUpdate);
    };
  }, [socket, fetchCustomerBanners, fetchDiamondLottie]);

  const totalHeroSlides = activeVisibleBanners.length;
  useEffect(() => {
    if (totalHeroSlides <= 1) return;
    const heroTimer = setInterval(() => {
      setHeroActiveIndex((prev) => {
        const next = (prev + 1) % totalHeroSlides;
        heroScrollRef.current?.scrollTo({ x: next * (SCREEN_WIDTH - 28), animated: true });
        return next;
      });
    }, 6000);
    return () => clearInterval(heroTimer);
  }, [totalHeroSlides]);

  const [addressModalVisible, setAddressModalVisible] = useState<boolean>(false);

  // Location Permission & Real-Time OpenWeather State & Rain Mode
  const [locationPermissionGranted, setLocationPermissionGranted] = useState<boolean | null>(null);
  const [rainModeConfig, setRainModeConfig] = useState<{
    isActive: boolean;
    surgeFee?: number;
    title?: string;
    subtitle?: string;
  }>({
    isActive: false,
    surgeFee: 0,
    title: 'Rainy Weather in your area',
    subtitle: 'Rider weather incentive active • Safe deliveries in progress',
  });
  const [isRaining, setIsRaining] = useState<boolean>(false);
  const [weatherData, setWeatherData] = useState<{
    temp: number;
    feels_like?: number;
    condition: string;
    mainCondition?: string;
    weatherId?: number;
    icon: string;
    updatedTime: string;
    locationName: string;
    isRain: boolean;
    source: string;
  } | null>(null);
  const [isWeatherRefreshing, setIsWeatherRefreshing] = useState<boolean>(false);
  const [isWeatherLoading, setIsWeatherLoading] = useState<boolean>(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  // Animated Search State
  const [searchPhraseIdx, setSearchPhraseIdx] = useState<number>(0);
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const searchInputRef = useRef<TextInput>(null);
  const searchFadeAnim = useRef(new Animated.Value(1)).current;
  const searchTranslateYAnim = useRef(new Animated.Value(0)).current;

  // Dynamic Animated Hero Banner Values
  const bhopalFloatAnim = useRef(new Animated.Value(0)).current;
  const fastDeliveryPulseAnim = useRef(new Animated.Value(1)).current;
  const riderMoveAnim = useRef(new Animated.Value(0)).current;

  // Animated loop for Hero Banner elements
  useEffect(() => {
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bhopalFloatAnim, {
          toValue: -4,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bhopalFloatAnim, {
          toValue: 4,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(fastDeliveryPulseAnim, {
          toValue: 1.06,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(fastDeliveryPulseAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    const riderLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(riderMoveAnim, {
          toValue: 6,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(riderMoveAnim, {
          toValue: -6,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    floatLoop.start();
    pulseLoop.start();
    riderLoop.start();

    return () => {
      floatLoop.stop();
      pulseLoop.stop();
      riderLoop.stop();
    };
  }, []);

  // Search cycling loop with vertical slide-up transition
  useEffect(() => {
    if (isSearchFocused || searchQuery.trim().length > 0) return;

    let isMounted = true;
    const interval = setInterval(() => {
      Animated.parallel([
        Animated.timing(searchFadeAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(searchTranslateYAnim, {
          toValue: -12,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (!isMounted) return;
        setSearchPhraseIdx((prev) => (prev + 1) % SEARCH_PHRASES.length);
        searchTranslateYAnim.setValue(12);
        searchFadeAnim.setValue(0);

        Animated.parallel([
          Animated.timing(searchFadeAnim, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.timing(searchTranslateYAnim, {
            toValue: 0,
            duration: 220,
            useNativeDriver: true,
          }),
        ]).start();
      });
    }, 2200);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isSearchFocused, searchQuery]);



  // Real unread notification count
  const [unreadNotificationCount, setUnreadNotificationCount] = useState<number>(0);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.get('/notifications/unread-count');
      if (res.data?.success && typeof res.data.unreadCount === 'number') {
        setUnreadNotificationCount(res.data.unreadCount);
      }
    } catch (e) {
      console.log('[UNREAD COUNT FETCH NOTICE]', e);
    }
  }, []);

  // Real-time Weather check from Backend API using actual device coordinates ONLY
  const checkLiveWeather = useCallback(async (lat?: number, lon?: number) => {
    const useLat = lat || customerCoords?.latitude;
    const useLon = lon || customerCoords?.longitude;

    if (!useLat || !useLon) {
      console.log('[WEATHER API NOTICE] Skipping weather fetch: Valid device GPS coordinates not available yet');
      setWeatherData(null);
      setIsRaining(Boolean(rainModeConfig?.isActive));
      return;
    }

    try {
      setIsWeatherRefreshing(true);
      setIsWeatherLoading(true);
      setWeatherError(null);

      console.log(`[WEATHER API REQ] Querying OpenWeather via backend for exact GPS: (${useLat}, ${useLon})`);
      const res = await api.get(`/weather?lat=${useLat}&lon=${useLon}`);
      if (res.data?.success) {
        const { temp, feels_like, condition, mainCondition, weatherId, icon, isRain, locationName, source } = res.data;
        const rainConfirmed = Boolean(isRain || rainModeConfig?.isActive);
        setIsRaining(rainConfirmed);

        const now = new Date();
        const hours = now.getHours();
        const mins = now.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const formattedHour = hours % 12 || 12;
        const timeStr = `${formattedHour}:${mins} ${ampm}`;

        const parsedTemp = typeof temp === 'number' ? temp : 27;

        setWeatherData({
          temp: parsedTemp,
          feels_like,
          condition: condition || 'Clear Sky',
          mainCondition,
          weatherId,
          icon: icon || '☀️',
          updatedTime: timeStr,
          locationName: locationName || 'Current Location',
          isRain: rainConfirmed,
          source: source || 'OpenWeather',
        });

        console.log(`[WEATHER API SUCCESS] Location: ${locationName} | Temp: ${parsedTemp}°C | Condition: ${condition} | Rain: ${rainConfirmed}`);
      } else {
        setWeatherError('Weather unavailable');
        setIsRaining(false);
      }
    } catch (e) {
      console.log('[WEATHER API EXCEPTION]', e);
      setWeatherError('Weather unavailable');
      setIsRaining(false);
    } finally {
      setIsWeatherRefreshing(false);
      setIsWeatherLoading(false);
    }
  }, [customerCoords?.latitude, customerCoords?.longitude]);

  // Request location permission & fetch fresh device GPS positioning
  const handleRequestPermissionAndFetch = async () => {
    try {
      setIsWeatherLoading(true);
      const granted = await requestLocationPermission();
      setLocationPermissionGranted(granted);
      if (granted) {
        const res = await fetchCurrentGpsPositionDetailed(false);
        if (res.success && res.fix) {
          setShowLocationRequiredModal(false);
          const gps = res.fix;
          setCustomerCoords({ latitude: gps.latitude, longitude: gps.longitude });
          await checkLiveWeather(gps.latitude, gps.longitude);
          const geo = await reverseGeocodeCoords(gps.latitude, gps.longitude);
          if (geo?.fullAddress) setCurrentAddress(geo.fullAddress);
        } else {
          setWeatherError('Weather unavailable');
          setShowLocationRequiredModal(true);
        }
      } else {
        setWeatherData(null);
        setIsRaining(false);
        setShowLocationRequiredModal(true);
      }
    } catch (e) {
      console.log('[LOCATION PERMISSION REQUEST ERROR]', e);
    } finally {
      setIsWeatherLoading(false);
    }
  };

  // Fetch dynamic categories from Admin-managed backend API
  const fetchDynamicCategories = async () => {
    try {
      const res = await api.get('/categories');
      if (res.data?.success && Array.isArray(res.data.categories)) {
        const active = res.data.categories.filter((c: any) => c.isActive !== false);
        if (active.length === 0) {
          setCategories([]);
          AsyncStorage.removeItem('@cached_customer_categories').catch(() => {});
          return;
        }
        const dynamicList = [
          { id: 'all', _id: 'all', name: 'All Services', icon: '⚡', isAll: true },
          ...active.map((c: any) => ({
            id: c._id || c.id,
            _id: c._id || c.id,
            name: c.name,
            icon: c.icon || 'store',
            image: c.image || '',
            description: c.description || '',
          })),
        ];
        setCategories(dynamicList);
        AsyncStorage.setItem('@cached_customer_categories', JSON.stringify(dynamicList)).catch(() => {});
      } else {
        setCategories([]);
        AsyncStorage.removeItem('@cached_customer_categories').catch(() => {});
      }
    } catch (err) {
      console.log('[CustomerHomeScreen] Category fetch notice:', err);
    }
  };

  // Subscribe to persistent Cart updates
  useEffect(() => {
    const unsubscribe = CartService.subscribe((cartState) => {
      setCartCount(cartState.count);
    });
    return unsubscribe;
  }, []);


  // Fetch backend Rain Mode & listen to real-time socket updates
  useEffect(() => {
    const fetchRainMode = async () => {
      try {
        const res = await api.get('/settings/rain');
        if (res.data?.success && res.data.rainMode) {
          setRainModeConfig(res.data.rainMode);
          setIsRaining(Boolean(res.data.rainMode.isActive));
          console.log('🌧️ [CustomerHomeScreen] Rain Mode from backend:', res.data.rainMode);
        }
      } catch (e) {
        console.log('[CustomerHomeScreen] Rain Mode fetch error:', e);
      }
    };
    fetchRainMode();

    if (socket) {
      const handleRainUpdate = (updatedRainMode: any) => {
        console.log('🌧️ [CustomerHomeScreen] Socket rain_mode_updated:', updatedRainMode);
        if (updatedRainMode) {
          setRainModeConfig(updatedRainMode);
          setIsRaining(Boolean(updatedRainMode.isActive));
        }
      };
      socket.on('rain_mode_updated', handleRainUpdate);
      return () => {
        socket.off('rain_mode_updated', handleRainUpdate);
      };
    }
  }, [socket]);

  // Auto-detect when user returns to app to re-check GPS status
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active') {
        const bgSync = await syncLiveDeviceLocationInBackground('customer');
        if (bgSync.success && bgSync.coords && bgSync.address) {
          setShowLocationRequiredModal(false);
          setLocationPermissionGranted(true);
          setCustomerCoords(bgSync.coords);
          setCurrentAddress(bgSync.address);
          checkLiveWeather(bgSync.coords.latitude, bgSync.coords.longitude);
          fetchOnlineRestaurants(false, bgSync.coords);
        }
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const initLocationAndWeather = async () => {
      try {
        // ⚡ Silent Background Device Location Sync (0 repeated prompts, real hardware GPS)
        const bgSync = await syncLiveDeviceLocationInBackground('customer');
        if (bgSync.success && bgSync.coords && bgSync.address) {
          setShowLocationRequiredModal(false);
          setLocationPermissionGranted(true);
          setCustomerCoords(bgSync.coords);
          setCurrentAddress(bgSync.address);
          checkLiveWeather(bgSync.coords.latitude, bgSync.coords.longitude);
          fetchOnlineRestaurants(false, bgSync.coords);
          try {
            const res = await api.post('/zones/check-customer-serviceable', bgSync.coords);
            if (res.data && res.data.serviceable === false && !res.data.pendingLocation) {
              setIsOutOfZone(true);
              setZoneCheckMessage(res.data.message || 'This service is not available in your location.');
            } else {
              setIsOutOfZone(false);
              setZoneCheckMessage('');
            }
          } catch (e) {
            setIsOutOfZone(false);
          }
          return;
        }

        const hasPermission = await checkLocationPermission();
        setLocationPermissionGranted(hasPermission);

        // Always prioritize real hardware GPS position to guarantee NO dummy coordinates
        if (hasPermission) {
          const gpsRes = await fetchCurrentGpsPositionDetailed(false);
          if (gpsRes.success && gpsRes.fix) {
            setShowLocationRequiredModal(false);
            const gps = gpsRes.fix;
            console.log('📍 [CUSTOMER HOME] Real Hardware GPS Fix detected:', gps.latitude, gps.longitude);
            const coords = { latitude: gps.latitude, longitude: gps.longitude };
            setCustomerCoords(coords);
            checkLiveWeather(gps.latitude, gps.longitude);
            fetchOnlineRestaurants(false);
            const geo = await reverseGeocodeCoords(gps.latitude, gps.longitude);
            const full = geo?.fullAddress || `Location near (${gps.latitude.toFixed(3)}, ${gps.longitude.toFixed(3)})`;
            setCurrentAddress(full);
            const autoAddr: DeliveryAddress = {
              id: `addr_init_${Date.now()}`,
              tag: 'Home',
              houseNo: geo?.area || 'Current Location',
              landmark: full,
              city: geo?.city || 'Bhopal',
              pincode: geo?.pincode || '',
              fullAddress: full,
              latitude: gps.latitude,
              longitude: gps.longitude,
              isCurrentLocation: true,
            };
            await savePermanentCustomerAddress(autoAddr);
            await setActiveDeliveryAddress(autoAddr);

            try {
              const res = await api.post('/zones/check-customer-serviceable', coords);
              if (res.data && res.data.serviceable === false && !res.data.pendingLocation) {
                setIsOutOfZone(true);
                setZoneCheckMessage(res.data.message || 'This service is not available in your location.');
              } else {
                setIsOutOfZone(false);
                setZoneCheckMessage('');
              }
            } catch (e) {
              setIsOutOfZone(false);
            }
            return;
          } else {
            setShowLocationRequiredModal(true);
          }
        } else {
          setShowLocationRequiredModal(true);
        }

        // If GPS not locked yet or permission pending, check saved permanent address as graceful fallback
        const savedPerm = await getPermanentCustomerAddress();
        if (savedPerm && (savedPerm.fullAddress || (savedPerm.latitude && savedPerm.longitude))) {
          if (savedPerm.fullAddress) setCurrentAddress(savedPerm.fullAddress);
          if (savedPerm.latitude && savedPerm.longitude) {
            const coords = { latitude: savedPerm.latitude, longitude: savedPerm.longitude };
            setCustomerCoords(coords);
            checkLiveWeather(coords.latitude, coords.longitude);
            try {
              const res = await api.post('/zones/check-customer-serviceable', coords);
              if (res.data && res.data.serviceable === false && !res.data.pendingLocation) {
                setIsOutOfZone(true);
                setZoneCheckMessage(res.data.message || 'This service is not available in your location.');
              } else {
                setIsOutOfZone(false);
                setZoneCheckMessage('');
                fetchOnlineRestaurants(false);
              }
            } catch (e) {
              setIsOutOfZone(false);
              fetchOnlineRestaurants(false);
            }
          }
        }
      } catch (e) {
        console.log('[INIT GPS & WEATHER NOTICE]', e);
      }
    };

    // 1. Preload & Instant cache restoration (0ms)
    loadCachedData();
    restaurantDataService.preload().catch(() => {});
    // 2. Fetch dynamic categories & online stores in background
    fetchDynamicCategories();
    fetchOnlineRestaurants();
    // 3. Check for active food order in background
    checkActiveFoodOrder();
    // 4. Initialize location & weather asynchronously
    initLocationAndWeather();
  }, []);

  const loadCachedData = async () => {
    try {
      // ⚡ Prioritize permanent locked address (NEVER drifts or changes on reload/restart)
      const permAddr = await getPermanentCustomerAddress();
      if (permAddr) {
        if (permAddr.fullAddress) setCurrentAddress(permAddr.fullAddress);
        if (permAddr.latitude && permAddr.longitude) {
          setCustomerCoords({ latitude: permAddr.latitude, longitude: permAddr.longitude });
        }
      } else if ((user as any)?.fullAddress || (user as any)?.address || (user as any)?.location) {
        const userAddr = (user as any)?.fullAddress || (user as any)?.address || (user as any)?.location;
        setCurrentAddress(userAddr);
        const lat = (user as any)?.latitude || (user as any)?.locationCoords?.latitude || 0;
        const lon = (user as any)?.longitude || (user as any)?.locationCoords?.longitude || 0;
        if (lat && lon) {
          setCustomerCoords({ latitude: lat, longitude: lon });
        }
        // Save to permanent storage
        const userSavedAddr: DeliveryAddress = {
          id: `addr_user_${Date.now()}`,
          tag: 'Home',
          houseNo: 'Home',
          landmark: userAddr,
          city: (user as any)?.city || 'Bhopal',
          pincode: (user as any)?.pincode || '',
          fullAddress: userAddr,
          latitude: lat,
          longitude: lon,
        };
        savePermanentCustomerAddress(userSavedAddr).catch(() => {});
      } else {
        const cachedAddr = await AsyncStorage.getItem('last_known_customer_address');
        if (cachedAddr) setCurrentAddress(cachedAddr);
      }

      // Restore cached categories
      const cachedCats = await AsyncStorage.getItem('@cached_customer_categories');
      if (cachedCats) {
        try {
          const parsed = JSON.parse(cachedCats);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCategories(parsed);
          }
        } catch (e) {}
      }

      // Restore cached banners instantly for instant loading
      const cachedBanners = await AsyncStorage.getItem('@cached_customer_banners');
      if (cachedBanners) {
        try {
          const parsedBanners = JSON.parse(cachedBanners);
          if (Array.isArray(parsedBanners) && parsedBanners.length > 0) {
            setCustomerBanners(parsedBanners);
          }
        } catch (e) {}
      }

      const diskData = await restaurantDataService.loadFromDisk();
      if (diskData.restaurants && diskData.restaurants.length > 0) {
        setRestaurants(diskData.restaurants);
        setPopularDishes(diskData.dishes);
        setLoadingRestaurants(false);
      }
    } catch (e) {}
  };

  // Silently re-compute distance in memory when GPS updates, ZERO network reloads
  useEffect(() => {
    if (customerCoords?.latitude && customerCoords?.longitude) {
      if (restaurants.length === 0) {
        fetchOnlineRestaurants(false, customerCoords);
      } else {
        setRestaurants((prev) => {
          return prev.map((resto) => {
            const canonical = getCanonicalRestaurantLocation(resto, customerCoords, 'CustomerHome_CoordsLocal');
            return {
              ...resto,
              distanceKm: canonical.distanceKm,
              distanceText: canonical.distanceText,
              deliveryTime: canonical.deliveryTimeText,
            };
          }).sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
        });
      }
    }
  }, [customerCoords?.latitude, customerCoords?.longitude]);

  // Animation values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  // Single-shot GPS Location detection ONLY when customer explicitly requests it
  const handleSelectDeliveryAddress = async (addr: DeliveryAddress) => {
    if (addr.fullAddress) {
      setCurrentAddress(addr.fullAddress);
    }
    if (addr.latitude && addr.longitude) {
      const coords = { latitude: addr.latitude, longitude: addr.longitude };
      setCustomerCoords(coords);
      checkLiveWeather(addr.latitude, addr.longitude);
      try {
        const res = await api.post('/zones/check-customer-serviceable', coords);
        if (res.data && res.data.serviceable === false && !res.data.pendingLocation) {
          setIsOutOfZone(true);
          setZoneCheckMessage(res.data.message || 'This service is not available in your location.');
        } else {
          setIsOutOfZone(false);
          setZoneCheckMessage('');
          fetchDynamicCategories();
          fetchOnlineRestaurants(true);
        }
      } catch (e) {
        setIsOutOfZone(false);
      }
    }
    // Permanently lock in local device storage
    await savePermanentCustomerAddress(addr);

    // Asynchronously save to user profile on backend MongoDB
    const userId = (user as any)?._id || (user as any)?.id;
    if (userId) {
      api.put(`/profile/${userId}`, {
        fullAddress: addr.fullAddress,
        address: addr.fullAddress,
        location: addr.fullAddress,
        city: addr.city,
        latitude: addr.latitude,
        longitude: addr.longitude,
        locationCoords: {
          latitude: addr.latitude,
          longitude: addr.longitude,
        },
      }).catch((err) => console.log('[CUSTOMER PROFILE LOCATION SYNC NOTICE]', err));
    }
  };

  // Cancel active running order directly from Home Screen with reason modal
  const handleOpenCustomerCancelModal = (order: any) => {
    if (!order) return;
    setCustomerCancelOrderTarget(order);
    setCustomerSelectedReason(CUSTOMER_CANCEL_REASONS[0]);
    setCustomerCancelModalVisible(true);
  };

  const handleConfirmCustomerCancel = async () => {
    if (!customerCancelOrderTarget) return;
    const bId = customerCancelOrderTarget.bookingId || customerCancelOrderTarget.rideId || customerCancelOrderTarget._id;
    const restoId = customerCancelOrderTarget.restaurantId || customerCancelOrderTarget.providerId;
    const custId = (user as any)?._id || (user as any)?.id;
    const currentOrder = customerCancelOrderTarget;
    const chosenReason = customerSelectedReason || 'Cancelled by customer';

    try {
      setCancelingActiveOrder(true);

      // 1. Emit instant socket cancellation
      if (socket) {
        const cancelPayload = {
          bookingId: bId,
          rideId: bId,
          customerId: custId,
          restaurantId: restoId,
          cancelledBy: 'CUSTOMER',
          reason: chosenReason,
          cancellationReason: chosenReason,
        };
        socket.emit('booking_cancelled_by_customer', cancelPayload);
        socket.emit('order_cancelled', cancelPayload);
        socket.emit('ride_cancelled', cancelPayload);
        socket.emit('service_cancelled', cancelPayload);
      }

      // 2. Put status to backend to get authoritative record
      let backendResult: any = null;
      try {
        const res = await api.put('/bookings/status', {
          bookingId: bId,
          status: 'CANCELLED',
          cancelledBy: 'CUSTOMER',
          cancellationReason: chosenReason,
        });
        backendResult = res.data;
      } catch (e) {
        try {
          const res2 = await api.post(`/bookings/${bId}/cancel`, {
            cancelledBy: 'CUSTOMER',
            cancellationReason: chosenReason,
          });
          backendResult = res2.data;
        } catch (_) {}
      }

      // 3. Purge storage & cart completely
      await AsyncStorage.multiRemove([
        'active_food_booking_id',
        'active_food_order_data',
        'active_food_order_id',
        'active_booking_id',
        'active_ride_id',
        'active_order_id',
      ]).catch(() => {});
      await CartService.clearCart().catch(() => {});

      setActiveFoodOrder(null);
      setCartCount(0);
      setCartState(CartService.getCart());

      setCustomerCancelModalVisible(false);
      setCustomerCancelOrderTarget(null);

      // 4. Mark processed and show dynamic cancellation popup with reason
      if (!isCancellationEventProcessed(bId, 'CUSTOMER_CANCELLED')) {
        const refundStatus = backendResult?.refundStatus || (backendResult?.booking && backendResult.booking.refundStatus);
        const refundAmount = backendResult?.refundAmount ?? (backendResult?.booking && backendResult.booking.refundAmount);
        const isNonRefundable = backendResult?.isNonRefundable ?? (backendResult?.booking && backendResult.booking.isNonRefundable);

        setCancellationPopup({
          visible: true,
          orderId: bId,
          reason: chosenReason,
          cancelledBy: 'CUSTOMER',
          storeName: currentOrder?.restaurantName || currentOrder?.storeName,
          refundStatus: refundStatus,
          refundAmount: refundAmount,
          isNonRefundable: isNonRefundable,
          cancelledAt: new Date(),
        });
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not cancel order.');
    } finally {
      setCancelingActiveOrder(false);
    }
  };

  const handleCancelActiveOrderFromHome = (bId: string, restoId?: string) => {
    handleOpenCustomerCancelModal(activeFoodOrder);
  };

  // Listen to route params for direct cancellations from SingleOrderStatusScreen
  useEffect(() => {
    if (route?.params?.orderCancelled || route?.params?.cancelledBookingId) {
      const cId = route?.params?.cancelledBookingId;
      if (cId) {
        cancelledOrdersRef.current.add(String(cId));
      }
      setActiveFoodOrder(null);
      AsyncStorage.multiRemove([
        'active_food_booking_id',
        'active_food_order_data',
        'active_food_order_id',
        'active_booking_id',
        'active_ride_id',
        'active_order_id',
      ]).catch(() => {});
      CartService.clearCart().catch(() => {});
      setCartCount(0);
      setCartState(CartService.getCart());
    }
  }, [route?.params]);

  // Cancel active order wrapper
  const handleCancelActiveOrder = (order: any) => {
    handleOpenCustomerCancelModal(order);
  };

  // Check and sync any active running food orders (Guaranteed to filter out cancelled orders)
  const checkActiveFoodOrder = useCallback(async () => {
    try {
      const savedId = await AsyncStorage.getItem('active_food_booking_id');
      const savedDataRaw = await AsyncStorage.getItem('active_food_order_data');
      const userId = (user as any)?._id || (user as any)?.id || (user as any)?.phone;
      let order: any = null;

      // 0. Instant discard if saved ID is known to be cancelled
      if (savedId && cancelledOrdersRef.current.has(String(savedId))) {
        await AsyncStorage.multiRemove([
          'active_food_booking_id',
          'active_food_order_data',
          'active_food_order_id',
          'active_booking_id',
          'active_ride_id',
          'active_order_id',
        ]).catch(() => {});
        setActiveFoodOrder(null);
        return;
      }

      // 1. Fast disk restoration (only if NOT cancelled or completed)
      if (savedDataRaw) {
        try {
          const parsed = JSON.parse(savedDataRaw);
          const st = (parsed?.status || '').toUpperCase();
          const pId = String(parsed?.bookingId || parsed?.rideId || parsed?._id || '');
          if (
            parsed &&
            !cancelledOrdersRef.current.has(pId) &&
            !st.includes('CANCEL') &&
            st !== 'RESTAURANT_DECLINED' &&
            st !== 'NO_RESPONSE' &&
            st !== 'TIMEOUT' &&
            st !== 'COMPLETED' &&
            st !== 'DELIVERED'
          ) {
            order = parsed;
            setActiveFoodOrder(parsed);
          } else {
            AsyncStorage.multiRemove([
              'active_food_booking_id',
              'active_food_order_data',
              'active_food_order_id',
              'active_booking_id',
              'active_ride_id',
              'active_order_id',
            ]).catch(() => {});
            setActiveFoodOrder(null);
          }
        } catch (_) {}
      }

      if (savedId && !cancelledOrdersRef.current.has(String(savedId))) {
        try {
          const res = await api.get(`/bookings/details/${savedId}`);
          if (res.data?.success && res.data.booking) {
            const b = res.data.booking;
            const bId = String(b.bookingId || b.rideId || b._id || '');
            const bStatus = (b.status || '').toUpperCase();

            // 🛡️ Isolation Guard: If this order belongs to a store/supplier where this user is the supplier and not the customer, discard it!
            const custId = String(b.customerId || '');
            const restoId = String(b.restaurantId || b.supplierId || b.providerId || '');
            const myCustId = String((user as any)?._id || (user as any)?.id || '');
            if (myCustId && restoId === myCustId && custId !== myCustId) {
              console.log('[checkActiveFoodOrder] Detected restaurant order in customer storage. Purging.');
              AsyncStorage.multiRemove([
                'active_food_booking_id',
                'active_food_order_data',
                'active_food_order_id',
                'active_booking_id',
                'active_ride_id',
                'active_order_id',
              ]).catch(() => {});
              setActiveFoodOrder(null);
              return;
            }

            if (
              cancelledOrdersRef.current.has(bId) ||
              bStatus.includes('CANCEL') ||
              bStatus === 'RESTAURANT_DECLINED' ||
              bStatus === 'NO_RESPONSE' ||
              bStatus === 'TIMEOUT' ||
              bStatus === 'COMPLETED' ||
              bStatus === 'DELIVERED' ||
              bStatus === 'SERVICE_COMPLETED'
            ) {
              if (bId) cancelledOrdersRef.current.add(bId);
              // Order is cancelled or finished - do not show card and clean up storage
              AsyncStorage.multiRemove([
                'active_food_booking_id',
                'active_food_order_data',
                'active_food_order_id',
                'active_booking_id',
                'active_ride_id',
                'active_order_id',
              ]).catch(() => {});
              CartService.clearCart().catch(() => {});
              setCartCount(0);
              setCartState(CartService.getCart());
              order = null;
              setActiveFoodOrder(null);
            } else {
              order = b;
              AsyncStorage.setItem('active_food_order_data', JSON.stringify(b)).catch(() => {});
            }
          } else {
            AsyncStorage.multiRemove([
              'active_food_booking_id',
              'active_food_order_data',
              'active_food_order_id',
              'active_booking_id',
              'active_ride_id',
              'active_order_id',
            ]).catch(() => {});
            setActiveFoodOrder(null);
          }
        } catch (e) {
          // Network issue
        }
      }

      if (!order && userId) {
        try {
          // 1. Try authoritative active booking endpoint
          const actRes = await api.get(`/bookings/active?customerId=${userId}&role=customer`);
          if (actRes.data?.success && actRes.data.activeBooking) {
            const actB = actRes.data.activeBooking;
            const actId = String(actB.bookingId || actB.rideId || actB._id || '');
            const actStatus = (actB.status || '').toUpperCase();
            if (
              !cancelledOrdersRef.current.has(actId) &&
              !actStatus.includes('CANCEL') &&
              actStatus !== 'RESTAURANT_DECLINED' &&
              actStatus !== 'COMPLETED' &&
              actStatus !== 'DELIVERED' &&
              actStatus !== 'NO_RESPONSE' &&
              actStatus !== 'TIMEOUT'
            ) {
              order = actB;
              if (actId) {
                AsyncStorage.setItem('active_food_booking_id', actId).catch(() => {});
              }
              AsyncStorage.setItem('active_food_order_data', JSON.stringify(actB)).catch(() => {});
            }
          }

          // 2. Fallback: check my-bookings list
          if (!order) {
            const listRes = await api.get(`/bookings/my-bookings?userId=${userId}&statusFilter=ALL`);
            if (listRes.data?.success && Array.isArray(listRes.data.bookings) && listRes.data.bookings.length > 0) {
              const activeOne = listRes.data.bookings.find((b: any) => {
                const bId = String(b.bookingId || b.rideId || b._id || '');
                const st = (b.status || '').toUpperCase();
                return (
                  !cancelledOrdersRef.current.has(bId) &&
                  !st.includes('CANCEL') &&
                  st !== 'RESTAURANT_DECLINED' &&
                  st !== 'COMPLETED' &&
                  st !== 'DELIVERED' &&
                  st !== 'SERVICE_COMPLETED' &&
                  st !== 'NO_RESPONSE' &&
                  st !== 'TIMEOUT'
                );
              });
              if (activeOne) {
                order = activeOne;
                const realId = String(activeOne.bookingId || activeOne.rideId || activeOne._id || '');
                if (realId) {
                  AsyncStorage.setItem('active_food_booking_id', realId).catch(() => {});
                }
                AsyncStorage.setItem('active_food_order_data', JSON.stringify(activeOne)).catch(() => {});
              }
            }
          }
        } catch (e) {}
      }

      const activeStatuses = [
        'BOOKING_REQUESTED',
        'PENDING',
        'PENDING_RESTAURANT',
        'RINGING',
        'RESTAURANT_ACCEPTED',
        'PREPARING',
        'FOOD_PREPARING',
        'FOOD_READY',
        'READY_FOR_PICKUP',
        'READY',
        'SEARCHING_FOR_RIDER',
        'OUT_FOR_DELIVERY',
        'ON_THE_WAY',
        'PICKED_UP',
        'ACCEPTED',
        'PROVIDER_ASSIGNED',
        'PROVIDER_ACCEPTED',
        'PROVIDER_ON_THE_WAY',
        'PROVIDER_ARRIVED',
        'STARTED',
        'SERVICE_STARTED',
      ];

      const checkId = String(order?.bookingId || order?.rideId || order?._id || '');
      if (order && !cancelledOrdersRef.current.has(checkId) && activeStatuses.includes((order.status || '').toUpperCase())) {
        setActiveFoodOrder(order);
        setDeliveredOrderToReview(null);
      } else {
        setActiveFoodOrder(null);
        // Requirement 4: Check if there is a completed/delivered order awaiting review
        if (userId) {
          try {
            const listRes = await api.get(`/bookings/my-bookings?userId=${userId}&statusFilter=ALL`);
            if (listRes.data?.success && Array.isArray(listRes.data.bookings)) {
              const unreviewed = listRes.data.bookings.find((b: any) => {
                const bId = String(b.bookingId || b.rideId || b._id || '');
                const st = (b.status || '').toUpperCase();
                const isFinished = st === 'DELIVERED' || st === 'COMPLETED' || st === 'SERVICE_COMPLETED';
                const hasRated = Boolean(b.restaurantRating || b.rating || b.riderRating);
                const isDismissed = dismissedReviewOrdersRef.current.has(bId);
                return isFinished && !hasRated && !isDismissed;
              });
              setDeliveredOrderToReview(unreviewed || null);
            }
          } catch (_) {}
        }
      }
    } catch (e) {
      console.log('[CUSTOMER HOME CHECK ORDER ERROR]', e);
    }
  }, [(user as any)?._id, (user as any)?.id, (user as any)?.phone]);

  // Focus effect: Re-run checks whenever customer returns to Home Screen
  useFocusEffect(
    useCallback(() => {
      checkActiveFoodOrder();
      setCartCount(CartService.getCartCount());
      setCartState(CartService.getCart());
      fetchUnreadCount();
      if (restaurants.length === 0) {
        fetchOnlineRestaurants(false);
      }
    }, [checkActiveFoodOrder, fetchUnreadCount, restaurants.length])
  );

  // Periodic Polling for active order status while on Home screen (every 4s)
  useEffect(() => {
    const timer = setInterval(() => {
      checkActiveFoodOrder();
    }, 4000);
    return () => clearInterval(timer);
  }, [checkActiveFoodOrder]);

  // Real-time socket listeners for active food order updates & cancellations
  useEffect(() => {
    if (!socket) return;

    const onOrderStatus = (data: any) => {
      const st = (data?.status || '').toUpperCase();
      const bId = String(data?.bookingId || data?.rideId || (data?.booking && (data.booking.bookingId || data.booking._id)) || '');
      console.log('📢 [CUSTOMER HOME] Order status updated via socket:', st, data);

      if (
        cancelledOrdersRef.current.has(bId) ||
        st.includes('CANCEL') ||
        st === 'COMPLETED' ||
        st === 'DELIVERED' ||
        st === 'SERVICE_COMPLETED' ||
        st === 'RESTAURANT_DECLINED' ||
        st === 'NO_RESPONSE' ||
        st === 'TIMEOUT'
      ) {
        if (bId) cancelledOrdersRef.current.add(bId);
        setActiveFoodOrder(null);
        AsyncStorage.multiRemove([
          'active_food_booking_id',
          'active_food_order_data',
          'active_food_order_id',
          'active_booking_id',
          'active_ride_id',
          'active_order_id',
        ]).catch(() => {});
        CartService.clearCart().catch(() => {});
        setCartCount(0);
        setCartState(CartService.getCart());
      } else if (
        st === 'PREPARING' ||
        st === 'RESTAURANT_ACCEPTED' ||
        st === 'FOOD_PREPARING' ||
        st === 'FOOD_READY' ||
        st === 'READY' ||
        st === 'READY_FOR_PICKUP' ||
        st === 'OUT_FOR_DELIVERY' ||
        st === 'ON_THE_WAY' ||
        st === 'PICKED_UP'
      ) {
        if (!cancelledOrdersRef.current.has(bId)) {
          const normalizedStatus = (st === 'RESTAURANT_ACCEPTED' || st === 'FOOD_PREPARING')
            ? 'PREPARING'
            : (st === 'READY_FOR_PICKUP' ? 'FOOD_READY' : st);
          setActiveFoodOrder((prev: any) => ({
            ...(prev || {}),
            ...(data?.booking || data || {}),
            status: normalizedStatus,
          }));
        }
      } else {
        checkActiveFoodOrder();
      }
    };

    const handleImmediateCancellation = (data: any) => {
      if (data?.reason === 'assigned_to_another') {
        // Rider assigned event; customer order is active and now has a rider assigned!
        return;
      }
      console.log('📢 [CUSTOMER HOME] Order cancellation event received:', data);
      const bId = String(data?.bookingId || data?.rideId || (data?.booking && (data.booking.bookingId || data.booking._id)) || '');
      if (bId) {
        cancelledOrdersRef.current.add(bId);
      }
      setActiveFoodOrder(null);
      AsyncStorage.multiRemove([
        'active_food_booking_id',
        'active_food_order_data',
        'active_food_order_id',
        'active_booking_id',
        'active_ride_id',
        'active_order_id',
      ]).catch(() => {});
      CartService.clearCart().catch(() => {});
      setCartCount(0);
      setCartState(CartService.getCart());

      const rawActor = String(data?.cancelledBy || '').toUpperCase();
      let actor = 'CUSTOMER';
      if (rawActor.includes('ADMIN')) actor = 'ADMIN';
      else if (rawActor === 'RIDER' || rawActor === 'DRIVER' || rawActor === 'DELIVERY_PARTNER') actor = 'RIDER';
      else if (rawActor === 'STORE' || rawActor === 'SUPPLIER' || rawActor === 'RESTAURANT' || rawActor === 'PROVIDER' || rawActor === 'PARTNER') actor = 'STORE';
      else actor = 'CUSTOMER';

      const reason = data?.cancellationReason || data?.reason || (actor === 'STORE' ? 'Store unavailable or item out of stock' : (actor === 'RIDER' ? 'Delivery partner unavailable' : 'Order cancelled'));
      const storeName = data?.storeName || data?.restaurantName || (data?.booking && (data.booking.storeName || data.booking.restaurantName)) || '';
      const refundStatus = data?.refundStatus || (data?.booking && data.booking.refundStatus);
      const refundAmount = data?.refundAmount ?? (data?.booking && data.booking.refundAmount);
      const isNonRefundable = data?.isNonRefundable ?? (data?.booking && data.booking.isNonRefundable);

      // Single source of truth popup: only show once per order ID
      if (bId && !isCancellationEventProcessed(bId, data?.cancelledAt || data?.status || 'CANCELLED')) {
        setCancellationPopup({
          visible: true,
          orderId: bId,
          reason: reason,
          cancelledBy: actor,
          storeName: storeName,
          refundStatus: refundStatus,
          refundAmount: refundAmount,
          isNonRefundable: isNonRefundable,
          cancelledAt: data?.cancelledAt || new Date(),
        });
      }
    };

    socket.on('FOOD_PREPARING', onOrderStatus);
    socket.on('RESTAURANT_ACCEPTED', onOrderStatus);
    socket.on('FOOD_READY', onOrderStatus);
    socket.on('food_ready', onOrderStatus);
    socket.on('order_status_updated', onOrderStatus);
    socket.on('booking_status_updated', onOrderStatus);
    socket.on('service_completed', onOrderStatus);
    socket.on('order_timed_out', onOrderStatus);

    // Cancellation Socket Events
    socket.on('booking_cancelled', handleImmediateCancellation);
    socket.on('booking_cancelled_by_customer', handleImmediateCancellation);
    socket.on('booking_cancelled_by_restaurant', handleImmediateCancellation);
    socket.on('ride_cancelled', handleImmediateCancellation);
    socket.on('ride_cancelled_by_customer', handleImmediateCancellation);
    socket.on('DELIVERY_REQUEST_CANCELLED', handleImmediateCancellation);
    socket.on('ORDER_CANCELLED', handleImmediateCancellation);
    socket.on('FOOD_CANCELLED', handleImmediateCancellation);
    socket.on('order_cancelled', handleImmediateCancellation);
    socket.on('RESTAURANT_DECLINED', handleImmediateCancellation);
    socket.on('service_cancelled', handleImmediateCancellation);

    return () => {
      socket.off('FOOD_PREPARING', onOrderStatus);
      socket.off('RESTAURANT_ACCEPTED', onOrderStatus);
      socket.off('FOOD_READY', onOrderStatus);
      socket.off('food_ready', onOrderStatus);
      socket.off('order_status_updated', onOrderStatus);
      socket.off('booking_status_updated', onOrderStatus);
      socket.off('service_completed', onOrderStatus);
      socket.off('order_timed_out', onOrderStatus);

      socket.off('booking_cancelled', handleImmediateCancellation);
      socket.off('booking_cancelled_by_customer', handleImmediateCancellation);
      socket.off('booking_cancelled_by_restaurant', handleImmediateCancellation);
      socket.off('ride_cancelled', handleImmediateCancellation);
      socket.off('ride_cancelled_by_customer', handleImmediateCancellation);
      socket.off('DELIVERY_REQUEST_CANCELLED', handleImmediateCancellation);
      socket.off('ORDER_CANCELLED', handleImmediateCancellation);
      socket.off('FOOD_CANCELLED', handleImmediateCancellation);
      socket.off('order_cancelled', handleImmediateCancellation);
      socket.off('RESTAURANT_DECLINED', handleImmediateCancellation);
      socket.off('service_cancelled', handleImmediateCancellation);
    };
  }, [socket, checkActiveFoodOrder]);

  // Refresh restaurant list & safely handle Back press without logout
  useFocusEffect(
    React.useCallback(() => {
      if (restaurants.length === 0) {
        fetchOnlineRestaurants(false);
      }
      checkActiveFoodOrder();
      // Ensure cart is refreshed when returning to Home
      const c = CartService.getCart();
      setCartState(c);
      setCartCount(c.count);

      const onBackPress = () => {
        navigation.navigate('RoleSelection');
        return true;
      };

      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [navigation, checkActiveFoodOrder])
  );

  // Real-time socket listeners for live restaurant & menu updates without full-screen reload
  useEffect(() => {
    if (!socket) return;

    const matchesRestaurant = (r: any, targetId: string) => {
      if (!targetId) return false;
      const t = String(targetId).toLowerCase();
      if (
        String(r._id || '').toLowerCase() === t ||
        String(r.id || '').toLowerCase() === t ||
        String(r.rawUser?._id || '').toLowerCase() === t ||
        String(r.rawUser?.id || '').toLowerCase() === t ||
        String(r.rawUser?.phoneNumber || '') === t ||
        String(r.rawUser?.phone || '') === t
      ) {
        return true;
      }
      return false;
    };

    const handleRestoUpdate = (data: any) => {
      console.log('📢 [CUSTOMER HOME] Real-time RESTAURANT_UPDATED received:', data);
      const targetId = String(data?.restaurantId || data?.userId || data?.id || data?.user?._id || '');
      if (!targetId) return;

      const updatedUser = data?.user || {};
      const newName = (data?.name || updatedUser.name || data?.restaurantName || '').trim();
      const newCategory = data?.categoryName || updatedUser.categoryName;
      const newOnline = data?.isOnline !== undefined
        ? Boolean(data.isOnline)
        : (data?.restaurant_status !== undefined ? data.restaurant_status === 'online' : undefined);

      const newAddr = String(data?.fullAddress || data?.address || data?.location || updatedUser?.fullAddress || updatedUser?.address || updatedUser?.location || '').trim();
      const newLat = Number(data?.latitude || updatedUser?.latitude || (updatedUser?.locationCoords && updatedUser.locationCoords.latitude) || 0);
      const newLon = Number(data?.longitude || updatedUser?.longitude || (updatedUser?.locationCoords && updatedUser.locationCoords.longitude) || 0);

      setRestaurants((prev) => {
        const exists = prev.some((r) => matchesRestaurant(r, targetId));
        if (!exists && newOnline) {
          setTimeout(() => fetchOnlineRestaurants(true), 100);
          return prev;
        }
        return prev.map((r) => {
          if (matchesRestaurant(r, targetId)) {
            const finalName = newName || r.name;
            const finalCat = newCategory || r.category || r.categoryName;
            const finalOnline = newOnline !== undefined ? newOnline : r.isOnline;
            const lat = newLat || r.latitude || r.rawUser?.latitude;
            const lon = newLon || r.longitude || r.rawUser?.longitude;
            const merged = {
              ...r,
              ...updatedUser,
              name: finalName,
              category: finalCat,
              categoryName: finalCat,
              isOnline: finalOnline,
              restaurant_status: finalOnline ? 'online' : 'offline',
              latitude: lat,
              longitude: lon,
              address: (newAddr && newAddr !== '[object Object]') ? newAddr : r.fullAddress || r.address || r.location,
              fullAddress: (newAddr && newAddr !== '[object Object]') ? newAddr : r.fullAddress || r.address || r.location,
            };
            const canonical = getCanonicalRestaurantLocation(merged, customerCoords, 'CustomerHome_SocketUserUpdated');

            return {
              ...merged,
              latitude: canonical.latitude,
              longitude: canonical.longitude,
              address: canonical.address,
              fullAddress: canonical.address,
              location: canonical.address,
              distanceKm: canonical.distanceKm || 1.2,
              distanceText: canonical.distanceText,
              deliveryTime: canonical.deliveryTimeText,
              rawUser: {
                ...(r.rawUser || {}),
                ...updatedUser,
                name: finalName,
                isOnline: finalOnline,
                restaurant_status: finalOnline ? 'online' : 'offline',
                latitude: canonical.latitude,
                longitude: canonical.longitude,
                address: canonical.address,
                fullAddress: canonical.address,
                location: canonical.address,
              },
            };
          }
          return r;
        });
      });

      if (newName) {
        if (targetId) {
          restaurantDataService.updateRestaurantNameInCache(targetId, newName);
        }
        setPopularDishes((prev) => {
          const isSingle = prev.length === 1;
          return prev.map((d) => {
            if (d.restaurant && (matchesRestaurant(d.restaurant, targetId) || isSingle)) {
              return {
                ...d,
                restaurant: {
                  ...d.restaurant,
                  name: newName,
                  rawUser: { ...(d.restaurant.rawUser || {}), name: newName },
                },
              };
            }
            return d;
          });
        });
      }
      restaurantDataService.invalidateCache();
    };

    const handleRestoName = (data: any) => {
      console.log('📢 [CUSTOMER HOME] Real-time RESTAURANT_NAME_UPDATED received:', data);
      const targetId = String(data?.restaurantId || data?.userId || data?.id || data?.user?._id || '');
      const newName = (data?.name || data?.restaurantName || data?.user?.name || '').trim();

      if (newName) {
        if (targetId) {
          restaurantDataService.updateRestaurantNameInCache(targetId, newName);
        }
        setRestaurants((prev) => {
          if (!prev.length) return prev;
          const isSingle = prev.length === 1;
          return prev.map((r) =>
            matchesRestaurant(r, targetId) || isSingle
              ? {
                  ...r,
                  name: newName,
                  rawUser: { ...(r.rawUser || {}), name: newName },
                }
              : r
          );
        });

        setPopularDishes((prev) => {
          const isSingle = prev.length === 1;
          return prev.map((d) => {
            if (d.restaurant && (matchesRestaurant(d.restaurant, targetId) || isSingle)) {
              return {
                ...d,
                restaurant: {
                  ...d.restaurant,
                  name: newName,
                  rawUser: { ...(d.restaurant.rawUser || {}), name: newName },
                },
              };
            }
            return d;
          });
        });

        restaurantDataService.invalidateCache();
      }
    };

    const handleRestoImage = (data: any) => {
      console.log('[CUSTOMER HOME] Real-time RESTAURANT_IMAGE_UPDATED received:', data);
      if (data?.restaurantId) {
        const newImg = data.profilePicture !== undefined ? (data.profilePicture || null) : (data.coverImage !== undefined ? (data.coverImage || null) : (data.image !== undefined ? (data.image || null) : null));
        setRestaurants((prev) =>
          prev.map((r) =>
            String(r._id) === String(data.restaurantId)
              ? {
                  ...r,
                  image: newImg,
                  images: data.photos && data.photos.length > 0 ? data.photos : (newImg ? [newImg] : []),
                  rawUser: {
                    ...(r.rawUser || {}),
                    coverImage: newImg,
                    profilePicture: newImg,
                    image: newImg,
                    photos: data.photos || [],
                    supplierPhotos: data.supplierPhotos || [],
                  },
                }
              : r
          )
        );
        restaurantDataService.invalidateCache();
      }
    };

    const handleRestoLocation = (data: any) => {
      console.log('📢 [CUSTOMER HOME] Real-time RESTAURANT_LOCATION_UPDATED received:', data);
      const targetId = String(data?.restaurantId || data?.userId || data?.id || '');
      if (!targetId) return;

      const newLat = Number(data.latitude || 0);
      const newLon = Number(data.longitude || 0);
      const newAddr = String(data.fullAddress || data.address || data.location || '').trim();

      setRestaurants((prev) => {
        if (!prev.length) return prev;
        return prev.map((r) => {
          if (matchesRestaurant(r, targetId)) {
            const raw = r.rawUser || {};
            const lat = newLat || r.latitude || raw.latitude;
            const lon = newLon || r.longitude || raw.longitude;
            const addr = newAddr || raw.fullAddress || raw.address || r.fullAddress || r.address;
            const merged = {
              ...r,
              latitude: lat,
              longitude: lon,
              address: addr,
              fullAddress: addr,
              rawUser: {
                ...raw,
                latitude: lat,
                longitude: lon,
                address: addr,
                fullAddress: addr,
              },
            };
            const canonical = getCanonicalRestaurantLocation(merged, customerCoords, 'CustomerHome_SocketLocationUpdated');
            return {
              ...merged,
              latitude: canonical.latitude,
              longitude: canonical.longitude,
              address: canonical.address,
              fullAddress: canonical.address,
              location: canonical.address,
              distanceKm: canonical.distanceKm || 1.2,
              distanceText: canonical.distanceText,
              deliveryTime: canonical.deliveryTimeText,
              rawUser: {
                ...raw,
                latitude: canonical.latitude,
                longitude: canonical.longitude,
                address: canonical.address,
                fullAddress: canonical.address,
                location: canonical.address,
              },
            };
          }
          return r;
        });
      });
      restaurantDataService.invalidateCache();
    };

    const handleMenuChange = (data: any) => {
      console.log('[CUSTOMER HOME] Real-time MENU event received:', data);
      restaurantDataService.invalidateCache();
      fetchOnlineRestaurants(true);
    };

    const handleConnect = () => {
      console.log('[CUSTOMER HOME] Socket reconnected. Refreshing data...');
      fetchOnlineRestaurants(true);
    };

    const onRestaurantAccepted = (data: any) => {
      console.log('📢 [CUSTOMER HOME] RESTAURANT_ACCEPTED received:', data);
      checkActiveFoodOrder();
    };

    const onFoodReady = (data: any) => {
      console.log('📢 [CUSTOMER HOME] FOOD_READY received:', data);
      checkActiveFoodOrder();
    };

    const handleCategoryDeleted = (data: any) => {
      console.log('⚡ [CUSTOMER HOME] Real-time category DELETED event:', data);
      const delId = String(data?._id || data?.id || data?.categoryId || '');
      const delName = String(data?.name || '').trim().toLowerCase();
      const delKey = String(data?.key || '').trim().toLowerCase();

      // 1. Instantly remove from local categories state without page reload
      setCategories((prevList) =>
        prevList.filter((c: any) => {
          const cId = String(c._id || c.id || '');
          const cName = String(c.name || '').trim().toLowerCase();
          const cKey = String(c.key || '').trim().toLowerCase();
          if (delId && cId === delId) return false;
          if (delName && (cName === delName || cName.replace(/[^a-z0-9]/g, '') === delName.replace(/[^a-z0-9]/g, ''))) return false;
          if (delKey && (cKey === delKey || cKey.replace(/[^a-z0-9]/g, '') === delKey.replace(/[^a-z0-9]/g, ''))) return false;
          return true;
        })
      );

      // 2. Reset active category filter to 'all' if user was viewing deleted category
      setSelectedCat((prev) => {
        if (String(prev).toLowerCase() === delName || String(prev) === delId) {
          return 'all';
        }
        return prev;
      });

      // 3. Smooth silent refresh in background without triggering full-screen loading/reload
      fetchDynamicCategories();
      fetchOnlineRestaurants(false);
    };

    const handleCategoryChange = (data: any) => {
      console.log('📢 [CUSTOMER HOME] Real-time category change received:', data);
      const updatedCat = data?.category || data;
      if (updatedCat && (updatedCat._id || updatedCat.id)) {
        const uId = String(updatedCat._id || updatedCat.id);
        const uName = String(updatedCat.name || '').toLowerCase();
        setCategories((prevList) => {
          if (updatedCat.isActive === false) {
            return prevList.filter((c: any) => String(c._id || c.id) !== uId && String(c.name || '').toLowerCase() !== uName);
          }
          const exists = prevList.some((c: any) => String(c._id || c.id) === uId || String(c.name || '').toLowerCase() === uName);
          if (exists) {
            return prevList.map((c: any) => {
              if (String(c._id || c.id) === uId || String(c.name || '').toLowerCase() === uName) {
                return {
                  ...c,
                  name: updatedCat.name || c.name,
                  image: updatedCat.image !== undefined ? updatedCat.image : '',
                  icon: updatedCat.icon || c.icon,
                  description: updatedCat.description !== undefined ? updatedCat.description : c.description,
                  isActive: updatedCat.isActive,
                };
              }
              return c;
            });
          }
          return [...prevList, {
            id: updatedCat._id || updatedCat.id,
            _id: updatedCat._id || updatedCat.id,
            name: updatedCat.name,
            icon: updatedCat.icon || 'store',
            image: updatedCat.image || '',
            description: updatedCat.description || '',
          }];
        });
      }
      // Smooth silent refresh in background without triggering full-screen loading/reload
      fetchDynamicCategories();
      fetchOnlineRestaurants(false);
    };

    const handleRatingUpdate = (data: any) => {
      console.log('📢 [CUSTOMER HOME] Real-time review/rating received:', data);
      if (data?.restaurantId && data.averageRating !== undefined) {
        setRestaurants((prevList: any[]) =>
          prevList.map((r: any) => {
            const id = (r._id || r.id || r.supplierId)?.toString();
            if (id === data.restaurantId.toString()) {
              return {
                ...r,
                rating: Number(data.averageRating),
                reviewCount: data.totalReviews !== undefined ? Number(data.totalReviews) : (Number(r.reviewCount || 0) + 1),
                reviewsCount: data.totalReviews !== undefined ? Number(data.totalReviews) : (Number(r.reviewsCount || 0) + 1),
              };
            }
            return r;
          })
        );
      }
    };

    socket.on('RESTAURANT_REVIEWED', handleRatingUpdate);
    socket.on('RESTAURANT_REVIEW_UPDATED', handleRatingUpdate);
    socket.on('RESTAURANT_REVIEW_DELETED', handleRatingUpdate);
    socket.on('restaurant_rating_updated', handleRatingUpdate);
    socket.on('RESTAURANT_ACCEPTED', onRestaurantAccepted);
    socket.on('restaurant_accepted', onRestaurantAccepted);
    socket.on('FOOD_READY', onFoodReady);
    socket.on('food_ready', onFoodReady);
    socket.on('order_status_updated', checkActiveFoodOrder);
    socket.on('RESTAURANT_UPDATED', handleRestoUpdate);
    socket.on('RESTAURANT_NAME_UPDATED', handleRestoName);
    socket.on('restaurant_name_updated', handleRestoName);
    socket.on('RESTAURANT_LOCATION_UPDATED', handleRestoLocation);
    socket.on('restaurant_location_updated', handleRestoLocation);
    socket.on('RESTAURANT_IMAGE_UPDATED', handleRestoImage);
    socket.on('MENU_ITEM_CREATED', handleMenuChange);
    socket.on('MENU_ITEM_UPDATED', handleMenuChange);
    socket.on('MENU_ITEM_DELETED', handleMenuChange);
    socket.on('MENU_ITEM_AVAILABILITY_UPDATED', handleMenuChange);
    socket.on('user_status_change', handleRestoUpdate);
    socket.on('restaurant_online', handleRestoUpdate);
    socket.on('restaurant_offline', handleRestoUpdate);
    socket.on('restaurant_status_changed', handleRestoUpdate);
    socket.on('supplier_status_changed', handleRestoUpdate);
    socket.on('category_created', handleCategoryChange);
    socket.on('category_updated', handleCategoryChange);
    socket.on('category_enabled', handleCategoryChange);
    socket.on('category_deleted', handleCategoryDeleted);
    socket.on('category_disabled', handleCategoryDeleted);
    socket.on('categories_updated', (payload: any) => {
      if (payload?.type === 'delete' || payload?.type === 'category_deleted' || payload?.type === 'category_disabled') {
        handleCategoryDeleted(payload?.category || payload);
      } else {
        handleCategoryChange(payload);
      }
    });
    socket.on('category_change', (payload: any) => {
      if (payload?.type === 'category_deleted' || payload?.type === 'category_disabled') {
        handleCategoryDeleted(payload?.category || payload);
      } else {
        handleCategoryChange(payload);
      }
    });
    socket.on('connect', handleConnect);

    return () => {
      socket.off('RESTAURANT_REVIEWED', handleRatingUpdate);
      socket.off('RESTAURANT_REVIEW_UPDATED', handleRatingUpdate);
      socket.off('RESTAURANT_REVIEW_DELETED', handleRatingUpdate);
      socket.off('restaurant_rating_updated', handleRatingUpdate);
      socket.off('RESTAURANT_ACCEPTED', onRestaurantAccepted);
      socket.off('restaurant_accepted', onRestaurantAccepted);
      socket.off('FOOD_READY', onFoodReady);
      socket.off('food_ready', onFoodReady);
      socket.off('order_status_updated', checkActiveFoodOrder);
      socket.off('RESTAURANT_UPDATED', handleRestoUpdate);
      socket.off('RESTAURANT_NAME_UPDATED', handleRestoName);
      socket.off('restaurant_name_updated', handleRestoName);
      socket.off('RESTAURANT_LOCATION_UPDATED', handleRestoLocation);
      socket.off('restaurant_location_updated', handleRestoLocation);
      socket.off('RESTAURANT_IMAGE_UPDATED', handleRestoImage);
      socket.off('MENU_ITEM_CREATED', handleMenuChange);
      socket.off('MENU_ITEM_UPDATED', handleMenuChange);
      socket.off('MENU_ITEM_DELETED', handleMenuChange);
      socket.off('MENU_ITEM_AVAILABILITY_UPDATED', handleMenuChange);
      socket.off('MENU_CATEGORY_UPDATED', handleMenuChange);
      socket.off('user_status_change', handleRestoUpdate);
      socket.off('restaurant_online', handleRestoUpdate);
      socket.off('restaurant_offline', handleRestoUpdate);
      socket.off('restaurant_status_changed', handleRestoUpdate);
      socket.off('supplier_status_changed', handleRestoUpdate);
      socket.off('category_created', handleCategoryChange);
      socket.off('category_updated', handleCategoryChange);
      socket.off('category_enabled', handleCategoryChange);
      socket.off('category_deleted', handleCategoryDeleted);
      socket.off('category_disabled', handleCategoryDeleted);
      socket.off('categories_updated', handleCategoryChange);
      socket.off('category_change', handleCategoryChange);
      socket.off('connect', handleConnect);
    };
  }, [socket, checkActiveFoodOrder, navigation]);

  const fetchOnlineRestaurants = async (
    force: boolean = false,
    coordsOverride?: { latitude: number; longitude: number } | null
  ) => {
    try {
      const activeCoords = coordsOverride || customerCoords;
      // Never tear down or flash loading state if restaurants are already on screen or cached!
      if (restaurants.length > 0 || restaurantDataService.hasCachedRestaurants()) {
        setIsBackgroundRefreshing(true);
      } else {
        setLoadingRestaurants(true);
      }
      setFetchError(null);

      const result = await restaurantDataService.getRestaurants(force, activeCoords);

      if (result.restaurants && result.restaurants.length > 0) {
        const updated = result.restaurants
          .map((resto) => {
            const canonical = getCanonicalRestaurantLocation(resto, activeCoords, 'CustomerHome_Fetch');
            return {
              ...resto,
              latitude: canonical.latitude,
              longitude: canonical.longitude,
              address: canonical.address,
              fullAddress: canonical.address,
              location: canonical.address,
              distanceKm: canonical.distanceKm !== null ? canonical.distanceKm : null,
              distanceText: canonical.distanceText,
              deliveryTime: canonical.deliveryTimeText,
            };
          })
          .filter((resto) => {
            if (!activeCoords) return true;
            const rLat = Number(resto.latitude || 0);
            const rLon = Number(resto.longitude || 0);
            if (!rLat || !rLon || rLat === 0 || rLon === 0) return false;
            if (resto.distanceKm === null || isNaN(resto.distanceKm)) return false;
            return resto.distanceKm <= 5.0; // Strictly 5.0 KM
          })
          .sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));

        setRestaurants(updated);
        setPopularDishes(result.popularDishes);
      } else if (restaurants.length === 0) {
        setRestaurants([]);
      }

      if (result.error) {
        setFetchError(result.error);
      }
    } catch (error: any) {
      console.log('[FETCH RESTAURANTS ERROR]', error);
      setFetchError('Unable to refresh restaurants. Please check your network connection.');
    } finally {
      setLoadingRestaurants(false);
      setIsBackgroundRefreshing(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchDynamicCategories();
    fetchOnlineRestaurants(true, customerCoords);
  };

  const filterCatNormalized = selectedCat.trim().toLowerCase();

  const isBusinessOnly = (resto: any): boolean => {
    if (!resto) return false;
    const role = String(resto?.role || resto?.rawUser?.role || '').toLowerCase();
    const isSellerRole = role === 'restaurant' || role === 'supplier' || role === 'seller_partner' || role === 'seller' || role === 'driver' || role === 'business' || role === 'merchant' || role === 'store' || role === 'provider';
    return Boolean(resto.isBusinessAccount || resto.rawUser?.isBusinessAccount || resto.businessName || resto.restaurantName || isSellerRole);
  };

  const isStoreOnline = (resto: any): boolean => {
    if (!resto) return false;
    const rawOnline = resto.isOnline !== undefined ? resto.isOnline : resto.rawUser?.isOnline;
    const rawStatus = resto.restaurant_status || resto.rawUser?.restaurant_status || resto.status || resto.rawUser?.status;

    if (rawStatus === 'offline' && rawOnline === false) return false;

    return Boolean(
      rawOnline === true ||
      rawStatus === 'online' ||
      resto.isOnline === true ||
      resto.restaurant_status === 'online' ||
      resto.status === 'online' ||
      resto.rawUser?.isOnline === true ||
      resto.rawUser?.restaurant_status === 'online' ||
      resto.rawUser?.status === 'online'
    );
  };

  // Strict Distance Filter: Customer Selected Location Radius (5.0 KM)
  const MAX_STORE_DISTANCE_KM = 5.0;

  const isWithin5km = (resto: any): boolean => {
    if (!customerCoords?.latitude || !customerCoords?.longitude) return false;
    const rLat = Number(
      resto.businessLatitude ??
      resto.latitude ??
      resto.rawUser?.businessLatitude ??
      resto.rawUser?.latitude ??
      resto.locationCoords?.latitude ??
      0
    );
    const rLon = Number(
      resto.businessLongitude ??
      resto.longitude ??
      resto.rawUser?.businessLongitude ??
      resto.rawUser?.longitude ??
      resto.locationCoords?.longitude ??
      0
    );
    // Strict requirement: Restaurant coordinates missing or invalid => EXCLUDE
    if (!rLat || !rLon || rLat === 0 || rLon === 0 || isNaN(rLat) || isNaN(rLon)) {
      return false;
    }
    const dist = calculateHaversineDistanceKm(customerCoords.latitude, customerCoords.longitude, rLat, rLon);
    if (dist === null || isNaN(dist)) return false;
    return dist <= MAX_STORE_DISTANCE_KM;
  };

  // Strict Helper: Check if store is a Registered, Approved, Online Business within 5 KM
  const isStoreEligibleAndOnline = (r: any): boolean => {
    if (!r) return false;
    if (!isBusinessOnly(r)) return false;

    const appStatus = String(r.approvalStatus || r.rawUser?.approvalStatus || '').toUpperCase();
    if (appStatus && appStatus !== 'APPROVED') return false;

    if (!isStoreOnline(r)) return false;

    // Must be strictly within 5.0 KM of customerCoords
    if (!isWithin5km(r)) return false;

    const items = Array.isArray(r.menuItems) ? r.menuItems : (Array.isArray(r.rawUser?.menuItems) ? r.rawUser.menuItems : []);
    if (items.length === 0) return true;
    return items.some((it: any) => it && it.name && it.isAvailable !== false && it.inStock !== false && it.isActive !== false);
  };

  // Helper: Verify whether dish/item belongs to Food category ONLY
  const isFoodDish = (dish: any): boolean => {
    const rawCategory = dish.category || dish.categoryName || dish.restaurant?.categoryName || dish.restaurant?.businessCategoryName;
    const cat = normalizeCategory(rawCategory);
    return cat === 'Food';
  };

  // Filter stores & restaurants: STRICTLY ONLINE ONLY + Business Only + 5KM
  const filteredRestaurants = useMemo(() => {
    return (restaurants || [])
      .filter((resto) => {
        if (!isStoreEligibleAndOnline(resto)) return false;
        if (filterCatNormalized === 'all') return true;
        const catIdMatch =
          resto.businessCategoryId &&
          (String(resto.businessCategoryId) === String(selectedCat) || String(resto.businessCategoryId).toLowerCase() === filterCatNormalized);
        const catNameMatch =
          (resto.businessCategoryName && resto.businessCategoryName.toLowerCase().includes(filterCatNormalized)) ||
          (resto.categoryName && resto.categoryName.toLowerCase().includes(filterCatNormalized)) ||
          (resto.businessType && resto.businessType.toLowerCase().includes(filterCatNormalized));
        const dishMatch = resto.menuItems?.some((item: any) =>
          item.name?.toLowerCase().includes(filterCatNormalized) ||
          item.category?.toLowerCase().includes(filterCatNormalized)
        );
        const featuredMatch = resto.featuredDish?.toLowerCase().includes(filterCatNormalized);
        const nameMatch =
          (resto.name && resto.name.toLowerCase().includes(filterCatNormalized)) ||
          (resto.restaurantName && resto.restaurantName.toLowerCase().includes(filterCatNormalized)) ||
          (resto.businessName && resto.businessName.toLowerCase().includes(filterCatNormalized));
        return Boolean(catIdMatch || catNameMatch || dishMatch || featuredMatch || nameMatch);
      })
      .sort((a, b) => (a.distanceKm || 99) - (b.distanceKm || 99));
  }, [restaurants, filterCatNormalized, selectedCat, customerCoords?.latitude, customerCoords?.longitude]);

  // 1. Strictly Eligible Online Stores with at least 1 in-stock item
  const eligibleOnlineStores = useMemo(() => {
    return (restaurants || []).filter(isStoreEligibleAndOnline);
  }, [restaurants, customerCoords?.latitude, customerCoords?.longitude]);

  // 2. Strictly In-Stock Dishes from Online Stores
  const availableInStockDishes = useMemo(() => {
    const list: any[] = [];
    eligibleOnlineStores.forEach((resto) => {
      const items = Array.isArray(resto.menuItems) ? resto.menuItems : (Array.isArray(resto.rawUser?.menuItems) ? resto.rawUser.menuItems : []);
      items.forEach((item: any) => {
        if (item && item.name && String(item.name).trim() && item.isAvailable !== false && item.inStock !== false && item.isActive !== false) {
          list.push({
            ...item,
            restaurant: resto,
          });
        }
      });
    });
    return list;
  }, [eligibleOnlineStores]);

  // 3. Dynamic Categories derived strictly from active Admin categories in database
  const activeInStockCategories = useMemo(() => {
    const adminActiveList = (categories || []).filter((c: any) => !c.isAll && c.isActive !== false);
    return adminActiveList.map((c: any) => {
      const catName = String(c.name || '').trim();
      const catNameLower = catName.toLowerCase();
      const key = catNameLower.replace(/[^a-z0-9]/g, '_');
      return {
        id: c._id || c.id || key,
        _id: c._id || c.id || key,
        key: key,
        name: catName,
        icon: c.icon || getCategoryIcon(catName) || '🏪',
        image: c.image || '',
        description: c.description || '',
      };
    });
  }, [categories]);

  // Category Rows with rich visual images and dynamic DB sync
  const displayCategoryRow1 = useMemo(() => {
    return CATEGORY_ROW_1.map((base) => {
      const dbMatch = (categories || []).find((c: any) => {
        const cn = String(c.name || '').toLowerCase();
        return cn === base.key || cn.includes(base.key) || base.key.includes(cn);
      });
      return {
        ...base,
        _id: dbMatch?._id || base.key,
        id: dbMatch?._id || base.key,
        image: dbMatch?.image || '',
      };
    });
  }, [categories]);

  const displayCategoryRow2 = useMemo(() => {
    return CATEGORY_ROW_2.map((base) => {
      const dbMatch = (categories || []).find((c: any) => {
        const cn = String(c.name || '').toLowerCase();
        return cn === base.key || cn.includes(base.key) || base.key.includes(cn);
      });
      return {
        ...base,
        _id: dbMatch?._id || base.key,
        id: dbMatch?._id || base.key,
        image: dbMatch?.image || '',
      };
    });
  }, [categories]);

  // Dynamic 2-Row Category Grid
  const dynamicCategoryRows = useMemo(() => {
    return {
      row1: displayCategoryRow1,
      row2: displayCategoryRow2,
    };
  }, [displayCategoryRow1, displayCategoryRow2]);

  const allCategoryDefs = [...(dynamicCategoryRows.row1 || []), ...(dynamicCategoryRows.row2 || [])];
  const matchedCategoryDef = allCategoryDefs.find((c: any) =>
    (c?.key && (c.key === selectedCat || String(c.key).toLowerCase() === filterCatNormalized)) ||
    (c?.name && String(c.name).toLowerCase() === filterCatNormalized) ||
    (c?.id && c.id === selectedCat)
  );
  const activeCategoryObj = activeInStockCategories.find((c: any) =>
    c &&
    (c.id === selectedCat ||
      (c.id && typeof c.id === 'string' && c.id.toLowerCase() === filterCatNormalized) ||
      (c.key && typeof c.key === 'string' && c.key.toLowerCase() === filterCatNormalized) ||
      (c.name && typeof c.name === 'string' && c.name.toLowerCase() === filterCatNormalized))
  );
  const activeCategoryName = matchedCategoryDef
    ? String(matchedCategoryDef.name || '').replace('\n', ' ')
    : (activeCategoryObj?.name ? String(activeCategoryObj.name).replace('\n', ' ') : 'Services');

  const isServiceAvailable = eligibleOnlineStores.length > 0;

  // Dynamic Category-Aware Presentation for Hero Banner (Requirement 2)
  const heroBannerContent = useMemo(() => {
    const cat = (selectedCat || 'all').toLowerCase().trim();
    if (cat === 'food' || cat === 'restaurant') {
      return {
        badge: '⚡ 10-20 MIN EXPRESS FOOD',
        title: 'Craving Delicious\nMeals in Bhopal 🍔',
        subtitle: 'Hot & Fresh from Top Kitchens',
        chips: ['🍕 Pizza', '🍲 Biryani', '🍛 Thali', '🥤 Drinks'],
      };
    }
    if (cat === 'grocery' || cat === 'kirana') {
      return {
        badge: '⚡ 15 MIN GROCERY EXPRESS',
        title: 'Daily Kirana &\nFresh Essentials 🛒',
        subtitle: 'Vegetables • Dairy • Staples',
        chips: ['🥦 Vegetables', '🥛 Milk & Dairy', '🌾 Atta & Dal', '🧼 Essentials'],
      };
    }
    if (cat === 'fashion') {
      return {
        badge: '✨ TRENDING LOCAL FASHION',
        title: 'Trendy Apparel &\nLocal Boutiques 👗',
        subtitle: 'Men • Women • Kids • Accessories',
        chips: ['👗 Saree & Kurti', '👕 Shirts & Tees', '👖 Jeans', '👟 Footwear'],
      };
    }
    if (cat === 'beauty') {
      return {
        badge: '💄 SALON & BEAUTY CARE',
        title: 'Top Cosmetics &\nWellness Stores 💄',
        subtitle: 'Skincare • Makeup • Grooming',
        chips: ['💄 Makeup', '🧴 Skincare', '💆 Wellness', '💅 Care'],
      };
    }
    if (cat === 'toys' || cat === 'toy') {
      return {
        badge: '🧸 KIDS & TOYS SPECIAL',
        title: 'Fun Toys, Games &\nKids Delights 🧸',
        subtitle: 'Board Games • Dolls • Action Toys',
        chips: ['🧸 Plush Toys', '🚗 Remote Cars', '🎲 Games', '🎁 Gifts'],
      };
    }
    if (cat === 'vegetables' || cat === 'fruits') {
      return {
        badge: '🥦 FARM FRESH EXPRESS',
        title: 'Fresh Vegetables &\nSeasonal Fruits 🍎',
        subtitle: 'Farm Fresh • Handpicked Daily',
        chips: ['🥦 Sabzi', '🍎 Fresh Fruits', '🥔 Potatoes', '🍅 Tomatoes'],
      };
    }
    if (cat === 'electronics') {
      return {
        badge: '📱 GADGETS & ACCESSORIES',
        title: 'Tech Gadgets &\nMobile Essentials 📱',
        subtitle: 'Cables • Audio • Power Banks',
        chips: ['🎧 Audio', '🔌 Chargers', '📱 Cases', '⌚ Wearables'],
      };
    }
    // Default: Multi-Service Super App Marketplace (on All)
    return {
      badge: '⚡ 10-20 MIN EXPRESS',
      title: 'Bhopal Me Ab\nFast Delivery ⚡',
      subtitle: 'Food • Kirana • Fashion • Beauty',
      chips: ['🍔 Food', '🥦 Kirana', '👗 Fashion', '💄 Beauty'],
    };
  }, [selectedCat]);

  const renderHorizontalStoreCard = (resto: any) => {
    const categoryLabel = resto.businessCategoryName || resto.categoryName || resto.businessType || 'Partner Store';
    const canonical = getCanonicalRestaurantLocation(resto, customerCoords, 'CustomerHome_HorizontalCard');
    const storeImages = (Array.isArray(resto.images) && resto.images.length > 0)
      ? resto.images
      : (resto.image ? [resto.image] : []);

    const openProfile = () =>
      navigation.navigate('RestaurantProfileScreen', {
        restaurantId: resto._id,
        restaurant: resto.rawUser ? { ...resto.rawUser, menuItems: resto.menuItems || resto.rawUser.menuItems || [] } : resto,
        customerCoords,
        isRaining,
      });

    return (
      <View key={resto._id} style={[styles.restoCard, isDark && { backgroundColor: currentColors.card, borderColor: currentColors.border }]}>
        <RestaurantImageCarousel
          images={storeImages}
          restaurantId={resto._id}
          restaurantName={resto.name || resto.restaurantName || 'Partner Store'}
          height={125}
          width="100%"
          isOnline={resto.isOnline}
          rating={resto.rating}
          reviewCount={resto.reviewCount || resto.reviewsCount || 0}
          featuredDish={resto.featuredDish}
          onPress={openProfile}
        />

        <TouchableOpacity
          style={styles.restoInfoWrap}
          activeOpacity={0.88}
          onPress={openProfile}
        >
          <Text style={[styles.restoName, isDark && { color: currentColors.primaryText }]} numberOfLines={1}>
            {resto.name}
          </Text>
          <Text style={[styles.restoCuisine, isDark && { color: currentColors.secondaryText }]} numberOfLines={1}>
            {resto.featuredDish ? `${resto.featuredDish} • ` : ''}{categoryLabel}
          </Text>
          <Text style={[styles.restoMeta, isDark && { color: currentColors.mutedText }]} numberOfLines={1}>
            📍 {canonical.distanceText} • {canonical.deliveryTimeText}
            {Boolean(canonical.address) && canonical.address !== '[object Object]'
              ? ` • ${canonical.address}`
              : ''}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderVerticalStoreCard = (resto: any) => {
    const categoryLabel = resto.businessCategoryName || resto.categoryName || resto.businessType || 'Partner Store';
    const canonical = getCanonicalRestaurantLocation(resto, customerCoords, 'CustomerHome_VerticalCard');
    const storeImages = (Array.isArray(resto.images) && resto.images.length > 0)
      ? resto.images
      : (resto.image ? [resto.image] : []);

    const openProfile = () =>
      navigation.navigate('RestaurantProfileScreen', {
        restaurantId: resto._id,
        restaurant: resto.rawUser ? { ...resto.rawUser, menuItems: resto.menuItems || resto.rawUser.menuItems || [] } : resto,
        customerCoords,
        isRaining,
      });

    return (
      <View key={resto._id} style={[styles.verticalRestoCard, isDark && { backgroundColor: currentColors.card, borderColor: currentColors.border }]}>
        <RestaurantImageCarousel
          images={storeImages}
          restaurantId={resto._id}
          restaurantName={resto.name || resto.restaurantName || 'Partner Store'}
          height={160}
          width="100%"
          isOnline={resto.isOnline}
          rating={resto.rating}
          reviewCount={resto.reviewCount || resto.reviewsCount || 0}
          featuredDish={resto.featuredDish}
          onPress={openProfile}
        />

        <TouchableOpacity
          style={styles.verticalInfoWrap}
          activeOpacity={0.88}
          onPress={openProfile}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[styles.verticalRestoName, isDark && { color: currentColors.primaryText }]} numberOfLines={1}>
              {resto.name}
            </Text>
            <Text style={[styles.verticalPriceForTwo, isDark && { color: currentColors.secondaryText }]}>₹200 for two</Text>
          </View>
          <Text style={[styles.verticalRestoCuisine, isDark && { color: currentColors.secondaryText }]} numberOfLines={1}>
            {resto.featuredDish ? `${resto.featuredDish} • ` : ''}{categoryLabel}
          </Text>
          <View style={styles.verticalMetaRow}>
            <Text style={[styles.verticalMetaText, isDark && { color: currentColors.mutedText }]}>
              📍 {canonical.distanceText}
            </Text>
            <Text style={styles.metaDotText}>•</Text>
            <Text style={[styles.verticalMetaText, isDark && { color: currentColors.mutedText }]}>
              ⏱️ {canonical.deliveryTimeText}
            </Text>
            {Boolean(canonical.address) && canonical.address !== '[object Object]' ? (
              <>
                <Text style={styles.metaDotText}>•</Text>
                <Text style={[styles.verticalMetaText, { flex: 1 }, isDark && { color: currentColors.mutedText }]} numberOfLines={1}>
                  🏠 {canonical.address}
                </Text>
              </>
            ) : null}
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const renderSearchDishCard = (dish: any) => {
    const resto = dish.restaurant || {};
    const restoName = resto.name || resto.restaurantName || 'Partner Store';
    const dishImg = dish.image;
    const dishPrice = dish.price || (dish.rawPrice ? `₹${dish.rawPrice}` : '₹100');
    const canonical = getCanonicalRestaurantLocation(resto, customerCoords, 'CustomerHome_SearchDish');

    return (
      <TouchableOpacity
        key={`dish_${dish.id || dish._id}_${resto._id || resto.id}`}
        style={[styles.searchDishCard, isDark && { backgroundColor: currentColors.card, borderColor: currentColors.border }]}
        activeOpacity={0.88}
        onPress={() => {
          navigation.navigate('ItemDetailsScreen', {
            item: dish,
            restaurantId: resto._id || resto.id,
            restaurant: resto.rawUser || resto,
            customerCoords,
          });
        }}
      >
        <View style={styles.searchDishImgWrap}>
          {dishImg ? (
            <Image
              source={{ uri: dishImg }}
              style={styles.searchDishImg}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.searchDishPlaceholder, isDark && { backgroundColor: currentColors.elevatedSurface }]}>
              <Text style={{ fontSize: 28 }}>🍲</Text>
            </View>
          )}
        </View>

        <View style={styles.searchDishInfoWrap}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text style={[styles.searchDishTitle, isDark && { color: currentColors.primaryText }]} numberOfLines={1}>
              {dish.name}
            </Text>
            <Text style={[styles.searchDishPriceText, isDark && { color: '#60A5FA' }]}>{dishPrice}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="storefront" size={13} color={isDark ? currentColors.secondaryText : "#64748B"} />
            <Text style={[styles.searchDishRestoName, isDark && { color: currentColors.secondaryText }]} numberOfLines={1}>
              {restoName}
            </Text>
          </View>
          <View style={styles.searchDishMetaRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Icon name="location-outline" size={11} color={isDark ? currentColors.mutedText : "#64748B"} />
              <Text style={[styles.searchDishMetaText, isDark && { color: currentColors.mutedText }]}>{canonical.distanceText}</Text>
            </View>
            <Text style={[styles.metaDotText, isDark && { color: currentColors.divider }]}>•</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Icon name="star" size={11} color="#F59E0B" />
              <Text style={[styles.searchDishMetaText, isDark && { color: currentColors.mutedText }]}>{formatRating(dish.rating || resto.rating)}</Text>
            </View>
            <Text style={[styles.metaDotText, isDark && { color: currentColors.divider }]}>•</Text>
            <Text style={styles.searchDishActionText}>View Item ›</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderCategoryPill = (item: any) => {
    const itemKey = item.key || item.id || item._id || item.name;
    const isSel =
      selectedCat === itemKey ||
      selectedCat === item.id ||
      selectedCat === item._id ||
      (typeof selectedCat === 'string' &&
        item.name &&
        selectedCat.toLowerCase() === item.name.toLowerCase());
    const resolvedImg = item.image ? resolveCategoryImageUrl(item.image) : null;
    const finalImgUri = resolvedImg || null;
    const itemIcon = getCategoryIcon(item.name || itemKey) || item.icon || '🏪';

    return (
      <TouchableOpacity
        key={String(item._id || item.id || itemKey)}
        style={styles.categoryItemBtn}
        onPress={() => {
          if (item.isMore || item.isAll) {
            setSelectedCat('all');
            return;
          }

          const catStr = String(item.name || itemKey || '').toLowerCase();
          if (
            catStr.includes('fashion') ||
            catStr.includes('फैशन') ||
            catStr.includes('फ़ैशन') ||
            catStr.includes('cloth') ||
            catStr.includes('कपड़े') ||
            catStr.includes('wear')
          ) {
            navigation.navigate('FashionScreen', {
              customerCoords,
              selectedCategory: item,
              categoryId: item._id || item.id,
              categoryName: item.name || 'Fashion',
            });
            return;
          }

          navigation.navigate('Subcategories', {
            selectedCategory: item,
            categoryId: item._id || item.id,
            categoryName: item.name || itemKey,
            customerCoords,
          });
        }}
        activeOpacity={0.75}
      >
        <View
          style={[
            styles.categoryCircleCard,
            item.isAll && styles.categoryAllCard,
            isSel && !item.isAll && styles.categoryCircleCardSelected,
          ]}
        >
          {item.isAll ? (
            <View style={styles.allIconGrid}>
              <View style={styles.gridRow}>
                <View style={styles.gridSquare} />
                <View style={styles.gridSquare} />
              </View>
              <View style={styles.gridRow}>
                <View style={styles.gridSquare} />
                <View style={styles.gridSquare} />
              </View>
            </View>
          ) : item.isMore ? (
            <View style={styles.moreCircleWrap}>
              <Text style={styles.moreDotsText}>•••</Text>
            </View>
          ) : finalImgUri ? (
            <Image
              source={{ uri: finalImgUri, cache: 'force-cache' }}
              style={styles.categoryImg}
              resizeMode="cover"
            />
          ) : (
            <Text style={{ fontSize: 24 }}>{typeof itemIcon === 'string' ? itemIcon : '🏪'}</Text>
          )}
        </View>
        <Text
          style={[
            styles.categoryLabel,
            isSel && styles.categoryLabelSelected,
          ]}
          numberOfLines={2}
        >
          {item.name || itemKey}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, isDark && { backgroundColor: currentColors.background }]}>
      <StatusBar hidden={false} barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={isDark ? currentColors.secondaryBackground : "#FFFFFF"} />

      {/* Top Status Bar Shield */}
      <View style={{ height: topSafeHeight, backgroundColor: isDark ? currentColors.secondaryBackground : '#FFFFFF', zIndex: 1000 }} />

      {/* SCROLLABLE FEED CONTAINER WITH STICKY SEARCH BAR */}
      <ScrollView
        style={[{ flex: 1 }, isDark && { backgroundColor: currentColors.background }]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 16, flexGrow: 1 }}
        stickyHeaderIndices={!isOutOfZone ? [1] : undefined}
        onScroll={handleMainScroll}
        scrollEventThrottle={16}
        removeClippedSubviews={false}
        nestedScrollEnabled={true}
        overScrollMode="never"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0066FF']} />}
      >
        {/* CHILD 0: TOP LOCATION / ADDRESS HEADER ROW (SLIDES UP ON SCROLL) */}
        <View style={[styles.topAddressHeaderRow, isDark && { backgroundColor: currentColors.background }]}>
          {/* Deliver to Location Dropdown */}
          <TouchableOpacity style={styles.locationWrapWhite} onPress={() => setShowMapLocationModal(true)} activeOpacity={0.85}>
            <View style={[styles.locationPinCircle, isOutOfZone && { backgroundColor: "#FBBF24" }]}>
              <Text style={{ fontSize: 14 }}>{isOutOfZone ? "↗" : "📍"}</Text>
            </View>
            <View style={{ flex: 1, paddingRight: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={[styles.deliverToLabelWhite, { fontSize: 16, fontWeight: "900" }, isDark && { color: currentColors.primaryText }]}>
                  {(() => {
                    const parts = currentAddress.split(",").map((p) => p.trim()).filter(Boolean);
                    return parts[0] || "Location";
                  })()}
                </Text>
                <Text style={[styles.arrowDownIconWhite, { fontSize: 14 }, isDark && { color: currentColors.mutedText }]}>∨</Text>
              </View>
              <Text style={[styles.locationTextWhite, isDark && { color: currentColors.secondaryText }]} numberOfLines={1}>
                {currentAddress || "Locating..."}
              </Text>
              {isOutOfZone && (
                <View style={{
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderRadius: 6,
                  alignSelf: "flex-start",
                  marginTop: 3,
                  borderWidth: 1,
                  borderColor: "#F472B6",
                }}>
                  <Text style={{ fontSize: 9.5, color: "#DB2777", fontWeight: "800" }}>
                    ⤴ Tap here to change your location
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          {/* Right Header Actions */}
          <View style={styles.headerRightRow}>
            {/* Help Button */}
            <TouchableOpacity
              style={[styles.headerGlassBtn, isDark && { backgroundColor: currentColors.elevatedSurface, borderColor: currentColors.border }]}
              onPress={() => setShowCustomerHelpModal(true)}
              activeOpacity={0.8}
            >
              <Icon name="headset-outline" size={15} color={isDark ? "#38BDF8" : "#0F172A"} />
              <Text style={[styles.headerGlassBtnText, isDark && { color: currentColors.primaryText }]}>Help</Text>
            </TouchableOpacity>

            {/* Notification Bell */}
            <TouchableOpacity
              style={[styles.headerGlassIconBtn, isDark && { backgroundColor: currentColors.elevatedSurface, borderColor: currentColors.border }]}
              onPress={() => {
                navigation.navigate('Notifications');
                setUnreadNotificationCount(0);
              }}
            >
              <Icon name="notifications-outline" size={17} color={isDark ? currentColors.primaryText : "#0F172A"} />
              {unreadNotificationCount > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>{unreadNotificationCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Header Cart Button */}
            <TouchableOpacity
              style={[styles.headerGlassIconBtn, isDark && { backgroundColor: currentColors.elevatedSurface, borderColor: currentColors.border }]}
              onPress={() => navigation.navigate('CartScreen', { customerCoords })}
              activeOpacity={0.8}
            >
              <Icon name="cart-outline" size={17} color={isDark ? currentColors.primaryText : "#0F172A"} />
              {cartCount > 0 && (
                <View style={styles.headerCartBadge}>
                  <Text style={styles.headerCartBadgeText}>{cartCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* CHILD 1: STICKY SEARCH BAR (OPENS DEDICATED SEARCH SCREEN) */}
        {!isOutOfZone ? (
          <Animated.View style={[styles.heroSearchStickyContainer, isDark && { backgroundColor: currentColors.background }, { transform: [{ translateY: searchBarShiftAnim }] }]}>
            <View style={styles.heroSearchRow}>
              <TouchableOpacity
                style={[styles.pillSearchWrap, { overflow: 'hidden' }, isDark && { backgroundColor: currentColors.elevatedSurface, borderColor: currentColors.border, borderWidth: 1 }]}
                activeOpacity={0.88}
                onPress={() => setShowSearchModal(true)}
              >
                {/* Search Icon with clean brand blue color */}
                <View style={{ width: 20, height: 20, marginRight: 8, justifyContent: 'center', alignItems: 'center' }}>
                  <Icon name="search" size={20} color="#2563EB" />
                </View>

                <View style={styles.animatedPlaceholderContainer}>
                  <Animated.View
                    style={{
                      transform: [{ translateY: searchTranslateYAnim }],
                      opacity: searchFadeAnim,
                    }}
                  >
                    <Text style={[styles.pillPlaceholderText, { color: isDark ? currentColors.mutedText : '#334155', fontWeight: '500' }]}>
                      {SEARCH_PHRASES[searchPhraseIdx] || 'Search Food, Fashion, Kirana & More...'}
                    </Text>
                  </Animated.View>
                </View>

                <TouchableOpacity
                  style={styles.searchMicDividerWrap}
                  activeOpacity={0.7}
                  onPress={() => setShowSearchModal(true)}
                >
                  <Text style={[styles.searchDividerPipe, isDark && { color: currentColors.divider }]}>|</Text>
                  <Icon name="mic" size={17} color="#E11D48" />
                </TouchableOpacity>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.heroFilterBtn, { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' }]}
                onPress={handleRequestPermissionAndFetch}
                activeOpacity={0.8}
              >
                <Icon name="location-outline" size={19} color="#0066FF" />
              </TouchableOpacity>
            </View>
          </Animated.View>
        ) : (
          <View />
        )}

        {isOutOfZone ? (
          /* ============================================================ */
          /* OUT OF ZONE SCREEN: CLEAN VECTOR CARD (NO HARDCODED BANNER)  */
          /* ============================================================ */
          <View style={{ width: "100%", alignItems: "center", backgroundColor: "#FFFFFF", paddingBottom: 30 }}>
            <View style={{ width: SCREEN_WIDTH - 32, alignItems: "center", backgroundColor: "#F8FAFC", borderRadius: 24, paddingVertical: 40, paddingHorizontal: 20, marginVertical: 20, borderWidth: 1, borderColor: "#E2E8F0" }}>
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <Text style={{ fontSize: 38 }}>📍</Text>
              </View>
              <Text style={{ fontSize: 20, fontWeight: "800", color: "#1E293B", textAlign: "center", marginBottom: 8 }}>
                Currently Not Serviceable
              </Text>
              <Text style={{ fontSize: 14, color: "#64748B", textAlign: "center", lineHeight: 20, marginBottom: 24 }}>
                We haven't launched in this area yet. Please select another location to explore available stores and services.
              </Text>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setShowMapLocationModal(true)}
                style={{
                  width: "100%",
                  height: 50,
                  borderRadius: 25,
                  backgroundColor: "#0066FF",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  elevation: 4,
                  shadowColor: "#0066FF",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                }}
              >
                <Text style={{ fontSize: 18 }}>🎯</Text>
                <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "800" }}>
                  Change Your Location ›
                </Text>
              </TouchableOpacity>
            </View>

            {/* Secondary Option: Refresh GPS */}
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={async () => {
                const fresh = await fetchCurrentGpsPosition(true);
                if (fresh) {
                  setCustomerCoords({ latitude: fresh.latitude, longitude: fresh.longitude });
                }
              }}
              style={{
                marginTop: 16,
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: "#F1F5F9",
                borderWidth: 1,
                borderColor: "#CBD5E1",
              }}
            >
              <Text style={{ fontSize: 12, color: "#475569", fontWeight: "700" }}>
                🔄 Refresh GPS Location
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
        {/* ============================================================ */}
        {/* TOP HERO BANNER CAROUSEL (ADMIN UPLOADED BANNERS ONLY)       */}
        {/* ============================================================ */}
        <RoleBannerCarousel
          target="USER"
          containerMarginHorizontal={12}
          containerMarginTop={8}
          containerMarginBottom={0}
          borderRadius={16}
          aspectRatio={2.1}
          resizeMode="cover"
          autoSlideInterval={6000}
        />

        {/* ============================================================ */}
        {/* FESTIVE TORAN GARLAND (ANIMATED LOTTIE)                      */}
        {/* ============================================================ */}
        <View style={styles.toranContainer} pointerEvents="none">
          <LottieAnimation
            source={toranGarlandLottie}
            width={SCREEN_WIDTH - 24}
            height={Math.round((SCREEN_WIDTH - 24) / 3.0)}
            preserveAspectRatio="none"
            loop={true}
            autoPlay={true}
          />
        </View>

        {/* ============================================================ */}
        {/* CATEGORIES CONTAINER - SINGLE LINE (DIRECTLY UNDER BANNER)   */}
        {/* ============================================================ */}
        {activeInStockCategories.length > 0 && (
          <View style={styles.categoriesContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled={true}
              contentContainerStyle={styles.categorySingleRowScroll}
            >
              {activeInStockCategories.map((item: any) => renderCategoryPill(item))}
            </ScrollView>
          </View>
        )}

        {/* Real-time Rain Weather Alert Notice */}
        {isRaining && (
          <View style={styles.rainNoticeBanner}>
            <Text style={styles.rainNoticeEmoji}>🌧️</Text>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={styles.rainNoticeTitle}>{rainModeConfig?.title || 'Rainy Weather in your area'}</Text>
                <View style={styles.rainLiveBadge}>
                  <Text style={styles.rainLiveBadgeText}>🌧️ RAIN ACTIVE</Text>
                </View>
              </View>
              <Text style={styles.rainNoticeSub}>
                {rainModeConfig?.subtitle || 'Rider weather incentive active • Safe deliveries in progress'}
              </Text>
            </View>
          </View>
        )}

        {/* ACTIVE RUNNING STORE/FOOD ORDER CARD (REAL-TIME STATUS & VIEW STATUS & CANCEL OPTION) */}
        {activeFoodOrder && (() => {
          const bannerCleanCat = resolveCategoryName(activeFoodOrder);
          const isBannerFood = bannerCleanCat.toLowerCase() === 'food';
          const navToTracking = () => {
            navigation.navigate('SingleOrderStatusScreen', {
              isFoodDelivery: true,
              bookingId: activeFoodOrder.bookingId,
              rideId: activeFoodOrder.bookingId,
              restaurant: {
                name: activeFoodOrder.restaurantName,
                address: activeFoodOrder.pickupAddress,
                id: activeFoodOrder.restaurantId,
                categoryName: bannerCleanCat,
                businessCategoryName: bannerCleanCat,
              },
              restoName: activeFoodOrder.restaurantName,
              activeFoodOrder: activeFoodOrder,
              order: activeFoodOrder,
              totalAmount: activeFoodOrder.price,
              price: activeFoodOrder.price,
              categoryName: bannerCleanCat,
              serviceName: bannerCleanCat,
            });
          };

          return (
          <View style={styles.activeOrderBanner}>
            <TouchableOpacity
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
              activeOpacity={0.9}
              onPress={navToTracking}
            >
              <View
                style={[
                  styles.activeOrderIconCircle,
                  {
                    backgroundColor:
                      activeFoodOrder.status === 'FOOD_READY' || activeFoodOrder.status === 'READY'
                        ? '#DCFCE7'
                        : activeFoodOrder.status === 'OUT_FOR_DELIVERY'
                        ? '#DBEAFE'
                        : '#EFF6FF',
                  },
                ]}
              >
                <Text style={{ fontSize: 22 }}>
                  {activeFoodOrder.status === 'FOOD_READY' || activeFoodOrder.status === 'READY'
                    ? (isBannerFood ? '🍲' : '📦')
                    : activeFoodOrder.status === 'OUT_FOR_DELIVERY'
                    ? '🛵'
                    : (isBannerFood ? '🍳' : getCategoryIcon(bannerCleanCat))}
                </Text>
              </View>

              <View style={{ flex: 1, marginLeft: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={styles.activeOrderTitle} numberOfLines={1}>
                    {activeFoodOrder.restaurantName || `${bannerCleanCat} Order`}
                  </Text>
                  <View
                    style={[
                      styles.activeOrderBadge,
                      {
                        backgroundColor:
                          activeFoodOrder.status === 'FOOD_READY' || activeFoodOrder.status === 'READY'
                            ? '#16A34A'
                            : activeFoodOrder.status === 'OUT_FOR_DELIVERY'
                            ? '#0066FF'
                            : '#0066FF',
                      },
                    ]}
                  >
                    <Text style={styles.activeOrderBadgeText}>
                      {activeFoodOrder.status === 'FOOD_READY' || activeFoodOrder.status === 'READY'
                        ? (isBannerFood ? 'ORDER READY' : `${bannerCleanCat.toUpperCase()} READY`)
                        : activeFoodOrder.status === 'OUT_FOR_DELIVERY'
                        ? 'DELIVERING'
                        : (isBannerFood ? 'PREPARING' : `${bannerCleanCat.toUpperCase()} PACKING`)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.activeOrderSub} numberOfLines={1}>
                  #{String(activeFoodOrder.bookingId || '').slice(-6)} • ₹{activeFoodOrder.price} • Tap to track
                </Text>
              </View>
            </TouchableOpacity>

            {/* DIRECT TRACK ORDER BUTTON */}
            <TouchableOpacity
              style={styles.trackActiveOrderBtn}
              activeOpacity={0.8}
              onPress={navToTracking}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="navigate-sharp" size={13} color="#FFFFFF" />
                <Text style={styles.trackActiveOrderBtnText}>Track</Text>
              </View>
            </TouchableOpacity>

            {/* DIRECT CANCEL ORDER BUTTON */}
            <TouchableOpacity
              style={styles.cancelActiveOrderBtn}
              activeOpacity={0.8}
              disabled={cancelingActiveOrder}
              onPress={() => handleCancelActiveOrder(activeFoodOrder)}
            >
              {cancelingActiveOrder ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={styles.cancelActiveOrderBtnText}>Cancel</Text>
                  <Icon name="close" size={13} color="#EF4444" />
                </View>
              )}
            </TouchableOpacity>
          </View>
          );
        })()}

        {/* REQUIREMENT 4: COMPLETED / DELIVERED ORDER REVIEW CARD ON CUSTOMER HOME */}
        {!activeFoodOrder && deliveredOrderToReview && (
          <View
            style={{
              marginHorizontal: 16,
              marginTop: 10,
              marginBottom: 14,
              backgroundColor: isDark ? currentColors.card : '#FFFFFF',
              borderRadius: 18,
              padding: 16,
              borderWidth: 1.5,
              borderColor: isDark ? currentColors.border : '#F59E0B',
              borderBottomWidth: 3.5,
              borderBottomColor: isDark ? currentColors.border : '#D97706',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.15,
              shadowRadius: 6,
              elevation: 4,
            }}
          >
            {/* Header: Title + Close */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: isDark ? currentColors.elevatedSurface : '#FEF3C7',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 20 }}>🎉</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: currentColors.primaryText }}>
                    Order Delivered! How was it?
                  </Text>
                  <Text style={{ fontSize: 12, color: currentColors.secondaryText, fontWeight: '600' }} numberOfLines={1}>
                    {deliveredOrderToReview.restaurantName || deliveredOrderToReview.storeName || 'Store Order'} • #{String(deliveredOrderToReview.bookingId || deliveredOrderToReview.rideId || '').slice(-6)}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={handleDismissDeliveredReview}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ padding: 4 }}
              >
                <Icon name="close" size={20} color={currentColors.mutedText} />
              </TouchableOpacity>
            </View>

            {/* Interactive 5-Star Rating Row */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, marginVertical: 12 }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => setReviewRatingStars(star)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Icon
                    name={star <= reviewRatingStars ? 'star' : 'star-outline'}
                    size={32}
                    color={star <= reviewRatingStars ? '#F59E0B' : (isDark ? currentColors.border : '#CBD5E1')}
                  />
                </TouchableOpacity>
              ))}
            </View>

            {/* Optional Feedback Input */}
            <View
              style={{
                backgroundColor: isDark ? currentColors.inputBackground : '#F8FAFC',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: currentColors.border,
                paddingHorizontal: 12,
                paddingVertical: 6,
                marginBottom: 12,
              }}
            >
              <TextInput
                placeholder="Share your experience (food taste, packaging, delivery)..."
                placeholderTextColor={currentColors.placeholder}
                value={reviewRatingText}
                onChangeText={setReviewRatingText}
                style={{ fontSize: 13, color: currentColors.primaryText, minHeight: 36, padding: 0 }}
                multiline
              />
            </View>

            {/* Action Buttons */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={handleDismissDeliveredReview}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 12,
                  backgroundColor: isDark ? currentColors.elevatedSurface : '#F1F5F9',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: currentColors.secondaryText }}>Maybe Later</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSubmitDeliveredReview}
                disabled={isSubmittingHomeReview}
                style={{
                  flex: 2,
                  paddingVertical: 10,
                  borderRadius: 12,
                  backgroundColor: '#F59E0B',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 6,
                }}
              >
                {isSubmittingHomeReview ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Icon name="check-circle" size={16} color="#FFFFFF" />
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>Submit Rating</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}






        {/* Subtle Non-Blocking Background Refresh / Error Notice */}
        {fetchError && restaurants.length === 0 && (
          <View style={styles.inlineNoticeBanner}>
            <Text style={styles.inlineNoticeText}>⚠️ {fetchError}</Text>
            <TouchableOpacity style={styles.retryInlineBtn} onPress={() => fetchOnlineRestaurants(true)}>
              <Text style={styles.retryInlineBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {isBackgroundRefreshing && !fetchError && restaurants.length === 0 && (
          <View style={styles.syncBadge}>
            <ActivityIndicator size="small" color="#0066FF" style={{ transform: [{ scale: 0.8 }] }} />
            <Text style={styles.syncBadgeText}>Updating restaurants...</Text>
          </View>
        )}

        {isOutOfZone ? (
          /* ============================================================ */
          /* OUT OF ZONE SCREEN: HIDE STORE LIST COMPLETELY */
          /* ============================================================ */
          <View style={{
            marginHorizontal: 16,
            marginVertical: 18,
            padding: 24,
            backgroundColor: '#FFFFFF',
            borderRadius: 24,
            borderWidth: 1.5,
            borderColor: '#FCA5A5',
            alignItems: 'center',
            shadowColor: '#EF4444',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.1,
            shadowRadius: 14,
            elevation: 4,
          }}>
            <View style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: '#FEF2F2',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
              borderWidth: 2,
              borderColor: '#FECACA',
            }}>
              <Text style={{ fontSize: 36 }}>📍</Text>
            </View>
            <View style={{
              backgroundColor: '#FEE2E2',
              paddingHorizontal: 12,
              paddingVertical: 4,
              borderRadius: 20,
              marginBottom: 10,
            }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#DC2626', letterSpacing: 0.8 }}>OUT OF SERVICE AREA</Text>
            </View>
            <Text style={{
              fontSize: 18,
              fontWeight: '800',
              color: '#0F172A',
              textAlign: 'center',
              marginBottom: 8,
            }}>
              Stores are not available in your location
            </Text>
            <Text style={{
              fontSize: 13,
              color: '#64748B',
              textAlign: 'center',
              lineHeight: 20,
              marginBottom: 20,
              paddingHorizontal: 8,
            }}>
              Aapki current GPS location hamari active delivery service boundary ke bahar hai. Hamari service filhal Bhopal ke designated delivery zones (New Bhopal, Old Bhopal, BHEL) me uplabdh hai.
            </Text>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={async () => {
                const fresh = await fetchCurrentGpsPosition(true);
                if (fresh) setCustomerCoords({ latitude: fresh.latitude, longitude: fresh.longitude });
              }}
              style={{
                backgroundColor: '#DC2626',
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                shadowColor: '#DC2626',
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.3,
                shadowRadius: 6,
                elevation: 3,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>🔄 Refresh GPS Location</Text>
            </TouchableOpacity>
          </View>
        ) : loadingRestaurants ? (
          /* Modern Skeleton Cards for First Visit - NEVER an infinite spinner */
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.restaurantsScroll}
          >
            {[1, 2, 3].map((key) => (
              <View key={key} style={styles.skeletonCard}>
                <View style={styles.skeletonImg}>
                  <ActivityIndicator size="small" color="#94A3B8" />
                </View>
                <View style={styles.skeletonInfoWrap}>
                  <View style={styles.skeletonTitleBar} />
                  <View style={styles.skeletonSubBar} />
                  <View style={styles.skeletonMetaBar} />
                </View>
              </View>
            ))}
          </ScrollView>
        ) : selectedCat !== 'all' ? (
          /* ============================================================ */
          /* SINGLE CATEGORY SELECTION: DEDICATED LONG VERTICAL LIST */
          /* ============================================================ */
          <View style={{ paddingHorizontal: 16 }}>
            <View style={[styles.sectionHeaderRow, { paddingHorizontal: 0 }]}>
              <Text style={styles.sectionTitle}>
                {activeCategoryObj?.icon || '🏪'} {activeCategoryName} Stores ({filteredRestaurants.length})
              </Text>
              <TouchableOpacity onPress={() => setSelectedCat('all')}>
                <Text style={styles.seeAllText}>Clear Filter ✕</Text>
              </TouchableOpacity>
            </View>

            {(loadingRestaurants && filteredRestaurants.length === 0) ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.restaurantsScroll}
              >
                {[1, 2, 3].map((key) => (
                  <View key={key} style={styles.skeletonCard}>
                    <View style={styles.skeletonImg}>
                      <ActivityIndicator size="small" color="#94A3B8" />
                    </View>
                    <View style={styles.skeletonInfoWrap}>
                      <View style={styles.skeletonTitleBar} />
                      <View style={styles.skeletonSubBar} />
                      <View style={styles.skeletonMetaBar} />
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : filteredRestaurants.length === 0 ? (
              <View style={styles.serviceUnavailableCard}>
                <View style={styles.serviceUnavailableIconWrap}>
                  <Text style={{ fontSize: 36 }}>{activeCategoryObj?.icon || '🏪'}</Text>
                </View>
                <Text style={styles.serviceUnavailableTitle}>
                  No stores available in {activeCategoryObj?.name || 'this category'}
                </Text>
                <Text style={styles.serviceUnavailableSubtitle}>
                  There are no open stores in this category right now. Browse other categories or view all stores.
                </Text>
                <View style={styles.serviceUnavailableActionsRow}>
                  <TouchableOpacity
                    style={styles.retryBtn}
                    activeOpacity={0.8}
                    onPress={() => setSelectedCat('all')}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Icon name="flash" size={14} color="#FFFFFF" />
                      <Text style={styles.retryBtnText}>View All Stores</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.changeLocationBtn}
                    activeOpacity={0.8}
                    onPress={() => setShowMapLocationModal(true)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Icon name="location-sharp" size={14} color="#0066FF" />
                      <Text style={styles.changeLocationBtnText}>Change Location</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              filteredRestaurants.map((resto) => renderVerticalStoreCard(resto))
            )}
          </View>
        ) : (
          /* ============================================================ */
          /* ALL CATEGORIES VIEW: SEPARATE HORIZONTAL SLIDERS PER CATEGORY */
          /* ============================================================ */
          <>
            {(loadingRestaurants && restaurants.length === 0) ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.restaurantsScroll}
              >
                {[1, 2, 3].map((key) => (
                  <View key={key} style={styles.skeletonCard}>
                    <View style={styles.skeletonImg}>
                      <ActivityIndicator size="small" color="#94A3B8" />
                    </View>
                    <View style={styles.skeletonInfoWrap}>
                      <View style={styles.skeletonTitleBar} />
                      <View style={styles.skeletonSubBar} />
                      <View style={styles.skeletonMetaBar} />
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : fetchError && eligibleOnlineStores.length === 0 ? (
              <View style={styles.serviceUnavailableCard}>
                <View style={styles.serviceUnavailableIconWrap}>
                  <Icon name="alert-circle" size={36} color="#DC2626" />
                </View>
                <Text style={styles.serviceUnavailableTitle}>Unable to connect to service</Text>
                <Text style={styles.serviceUnavailableSubtitle}>{fetchError}</Text>
                <View style={styles.serviceUnavailableActionsRow}>
                  <TouchableOpacity
                    style={styles.retryBtn}
                    activeOpacity={0.8}
                    onPress={() => fetchOnlineRestaurants(true)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Icon name="refresh" size={14} color="#FFFFFF" />
                      <Text style={styles.retryBtnText}>Retry</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            ) : eligibleOnlineStores.length === 0 ? (
              <View style={styles.serviceUnavailableCard}>
                <View style={styles.serviceUnavailableIconWrap}>
                  <Icon
                    name={(locationPermissionGranted === false && !customerCoords) ? "lock-closed" : "location-outline"}
                    size={40}
                    color="#0066FF"
                  />
                </View>
                <Text style={styles.serviceUnavailableTitle}>
                  {locationPermissionGranted === false && !customerCoords
                    ? 'Location permission needed'
                    : !customerCoords
                    ? 'Detecting your location...'
                    : 'No stores currently open nearby'}
                </Text>
                <Text style={styles.serviceUnavailableSubtitle}>
                  {locationPermissionGranted === false && !customerCoords
                    ? 'Please enable location permissions in your phone settings to see nearby stores.'
                    : !customerCoords
                    ? 'Getting your current device location, or tap below to choose your delivery address.'
                    : 'All partner stores in this area are currently offline. Check back shortly or change location.'}
                </Text>
                <View style={styles.serviceUnavailableActionsRow}>
                  {locationPermissionGranted === false && !customerCoords ? (
                    <TouchableOpacity
                      style={styles.retryBtn}
                      activeOpacity={0.8}
                      onPress={handleRequestPermissionAndFetch}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Icon name="key" size={14} color="#FFFFFF" />
                        <Text style={styles.retryBtnText}>Grant Permission</Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={styles.changeLocationBtn}
                        activeOpacity={0.8}
                        onPress={() => setShowMapLocationModal(true)}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Icon name="location-sharp" size={14} color="#0066FF" />
                          <Text style={styles.changeLocationBtnText}>Change Location</Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.retryBtn}
                        activeOpacity={0.8}
                        onPress={() => fetchOnlineRestaurants(true)}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Icon name="refresh" size={14} color="#FFFFFF" />
                          <Text style={styles.retryBtnText}>Refresh</Text>
                        </View>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            ) : (
              <>
                {activeInStockCategories.map((catItem: any) => {
                  const catNameLower = String(catItem.name || '').toLowerCase();
                  const catIdStr = String(catItem.id || catItem._id || '');
                  const groupStores = eligibleOnlineStores.filter((r) => {
                    const rCatName = String(r.categoryName || r.businessCategoryName || r.partnerType || r.businessType || '').toLowerCase();
                    const rName = String(r.name || r.restaurantName || r.businessName || '').toLowerCase();
                    const rCatId = String(r.businessCategoryId || '');
                    const hasDish = r.menuItems?.some((it: any) =>
                      String(it.category || it.categoryName || '').toLowerCase().includes(catNameLower)
                    );
                    return (
                      rCatName.includes(catNameLower) ||
                      catNameLower.includes(rCatName) ||
                      rName.includes(catNameLower) ||
                      (catIdStr && rCatId === catIdStr) ||
                      Boolean(hasDish)
                    );
                  });
                  if (groupStores.length === 0) return null;
                  return (
                    <View key={String(catItem._id || catItem.id || catItem.key)} style={{ marginBottom: 20 }}>
                      <View style={styles.sectionHeaderRow}>
                        <Text style={styles.sectionTitle}>
                          {getCategoryIcon(catItem.name || catItem.key)} {catItem.name} — Popular Near You
                        </Text>
                        <TouchableOpacity onPress={() => {
                          const catStr = String(catItem.name || catItem.key || '').toLowerCase();
                          if (
                            catStr.includes('fashion') ||
                            catStr.includes('फैशन') ||
                            catStr.includes('फ़ैशन') ||
                            catStr.includes('cloth') ||
                            catStr.includes('कपड़े') ||
                            catStr.includes('wear')
                          ) {
                            navigation.navigate('FashionScreen', {
                              customerCoords,
                              selectedCategory: catItem,
                              categoryId: catItem._id || catItem.id,
                              categoryName: catItem.name || 'Fashion',
                            });
                          } else {
                            navigation.navigate('Subcategories', {
                              selectedCategory: catItem,
                              categoryId: catItem._id || catItem.id,
                              categoryName: catItem.name || catItem.key,
                              customerCoords,
                            });
                          }
                        }}>
                          <Text style={styles.seeAllText}>See all →</Text>
                        </TouchableOpacity>
                      </View>
                      <ScrollView
                        horizontal
                        nestedScrollEnabled={true}
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.restaurantsScroll}
                      >
                        {groupStores.map((resto) => renderHorizontalStoreCard(resto))}
                      </ScrollView>
                    </View>
                  );
                })}

                {/* Any remaining stores not matching active categories */}
                {(() => {
                  const matchedStoreIds = new Set<string>();
                  activeInStockCategories.forEach((catItem: any) => {
                    const catNameLower = String(catItem.name || '').toLowerCase();
                    const catIdStr = String(catItem.id || catItem._id || '');
                    eligibleOnlineStores.forEach((r) => {
                      const rCatName = String(r.categoryName || r.businessCategoryName || r.partnerType || r.businessType || '').toLowerCase();
                      const rName = String(r.name || r.restaurantName || r.businessName || '').toLowerCase();
                      const rCatId = String(r.businessCategoryId || '');
                      const hasDish = r.menuItems?.some((it: any) =>
                        String(it.category || it.categoryName || '').toLowerCase().includes(catNameLower)
                      );
                      if (
                        rCatName.includes(catNameLower) ||
                        catNameLower.includes(rCatName) ||
                        rName.includes(catNameLower) ||
                        (catIdStr && rCatId === catIdStr) ||
                        Boolean(hasDish)
                      ) {
                        matchedStoreIds.add(String(r._id || r.id));
                      }
                    });
                  });
                  const otherStores = eligibleOnlineStores.filter(
                    (r) => !matchedStoreIds.has(String(r._id || r.id))
                  );
                  if (otherStores.length === 0) return null;
                  return (
                    <View style={{ marginBottom: 20 }}>
                      <View style={styles.sectionHeaderRow}>
                        <Text style={styles.sectionTitle}>
                          🏪 All Available Stores — Popular Near You
                        </Text>
                        <TouchableOpacity onPress={() => setSelectedCat('all')}>
                          <Text style={styles.seeAllText}>See all →</Text>
                        </TouchableOpacity>
                      </View>
                      <ScrollView
                        horizontal
                        nestedScrollEnabled={true}
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.restaurantsScroll}
                      >
                        {otherStores.map((resto) => renderHorizontalStoreCard(resto))}
                      </ScrollView>
                    </View>
                  );
                })()}
              </>
            )}
          </>
        )}


        </>
      )}
      </ScrollView>
      {/* ============================================================ */}
      {/* 7 & 8. AUTO-ADJUSTED BOTTOM NAVIGATION BAR & ACTIVE CARD */}
      {/* ============================================================ */}
      <View style={styles.bottomBarOuterWrap}>
        {/* 7. FIXED / STICKY ACTIVE ORDER & CART CARD (ABOVE BOTTOM NAV) */}
        {(() => {
          // PRIORITY 1: Live Active Placed Order (in-progress, not cancelled)
          if (activeFoodOrder && activeFoodOrder.status) {
            const st = (activeFoodOrder.status || '').toUpperCase();
            const isCancelledOrDone =
              st.includes('CANCEL') ||
              st === 'RESTAURANT_DECLINED' ||
              st === 'NO_RESPONSE' ||
              st === 'TIMEOUT' ||
              st === 'COMPLETED' ||
              st === 'DELIVERED' ||
              st === 'SERVICE_COMPLETED';

            if (!isCancelledOrDone) {
              const restoName = (activeFoodOrder.restaurantName || activeFoodOrder.name || 'Restaurant').trim();
              const orderId = (activeFoodOrder.bookingId || activeFoodOrder.rideId || activeFoodOrder._id || '').toString();
              const displayId = orderId ? `#${orderId.slice(-6).toUpperCase()}` : '';
              const totalAmount = Number(activeFoodOrder.totalAmount || activeFoodOrder.price || activeFoodOrder.fare || 0);
              const itemsCount = Array.isArray(activeFoodOrder.items)
                ? activeFoodOrder.items.length
                : Array.isArray(activeFoodOrder.cartItems)
                ? activeFoodOrder.cartItems.length
                : typeof activeFoodOrder.cartItems === 'object' && activeFoodOrder.cartItems !== null
                ? Object.keys(activeFoodOrder.cartItems).length
                : 1;

              const cleanCat = resolveCategoryName(activeFoodOrder);
              const isFoodCategory = cleanCat.toLowerCase() === 'food';

              const getStatusBadge = (statusStr: string) => {
                const s = statusStr.toUpperCase();
                if (s === 'RINGING' || s === 'CONNECTING' || s === 'PENDING' || s === 'PENDING_RESTAURANT' || s === 'BOOKING_REQUESTED') {
                  return { text: isFoodCategory ? '🔔 Ringing to restaurant' : `🔔 Ringing to ${cleanCat} store`, bg: '#EFF6FF', color: '#0066FF' };
                }
                if (s === 'PREPARING' || s === 'RESTAURANT_ACCEPTED' || s === 'FOOD_PREPARING') {
                  return { text: isFoodCategory ? '👨‍🍳 Food Preparing' : `📦 ${cleanCat} Packing`, bg: '#FEF3C7', color: '#B45309' };
                }
                if (s === 'FOOD_READY' || s === 'READY' || s === 'READY_FOR_PICKUP') {
                  return { text: isFoodCategory ? '🥡 Food Ready' : `📦 ${cleanCat} Ready`, bg: '#DCFCE7', color: '#15803D' };
                }
                if (s === 'OUT_FOR_DELIVERY' || s === 'ON_THE_WAY' || s === 'PICKED_UP' || s === 'STARTED') {
                  return { text: '🛵 Out for Delivery', bg: '#DBEAFE', color: '#1D4ED8' };
                }
                return { text: '⏳ Order in Progress', bg: '#DBEAFE', color: '#1D4ED8' };
              };

              const badge = getStatusBadge(st);

              return (
                <View style={styles.stickyCardWrap}>
                  <TouchableOpacity
                    style={styles.stickyCardContainer}
                    activeOpacity={0.9}
                    onPress={() => {
                      navigation.navigate('LiveTracking', {
                        ride: activeFoodOrder,
                        rideId: orderId,
                        bookingId: orderId,
                        isRider: false,
                      });
                    }}
                  >
                    {/* Left Category Icon */}
                    <View style={styles.stickyIconWrap}>
                      <Text style={{ fontSize: 22 }}>{getCategoryIcon(cleanCat)}</Text>
                    </View>

                    {/* Center Details: Restaurant Name, Status Badge, Items */}
                    <View style={styles.stickyInfoCol}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <Text style={styles.stickyRestoTitle} numberOfLines={1}>
                          {restoName}
                        </Text>
                        {displayId ? <Text style={styles.stickyOrderIdBadge}>{displayId}</Text> : null}
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={[styles.stickyStatusPill, { backgroundColor: badge.bg }]}>
                          <Text style={[styles.stickyStatusText, { color: badge.color }]}>{badge.text}</Text>
                        </View>
                        <Text style={styles.stickyMetaDot}>•</Text>
                        <Text style={styles.stickyItemsCountText}>{itemsCount} item{itemsCount > 1 ? 's' : ''}</Text>
                      </View>
                    </View>

                    {/* Right Price & Track Button */}
                    <View style={styles.stickyRightCol}>
                      <Text style={styles.stickyPriceText}>₹{totalAmount.toFixed(0)}</Text>
                      <View style={styles.stickyTrackBtn}>
                        <Text style={styles.stickyTrackBtnText}>Track ›</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            }
          }

          // PRIORITY 2: Unplaced Pending Cart (User added items from restaurant, backed out before completing payment)
          if (cartState && cartState.count > 0 && cartState.restaurant) {
            const resto = cartState.restaurant;
            const restoName = (resto.name || resto.username || 'Restaurant').trim();
            const itemsCount = cartState.count;
            const subtotal = cartState.subtotal;
            const rId = cartState.restaurantId || resto._id || resto.id;

            return (
              <View style={styles.stickyCardWrap}>
                <View style={[styles.stickyCardContainer, styles.stickyCartBorder]}>
                  {/* Left Cart Icon */}
                  <TouchableOpacity
                    style={[styles.stickyIconWrap, { backgroundColor: '#0066FF' }]}
                    activeOpacity={0.8}
                    onPress={() => {
                      navigation.navigate('CartScreen', {
                        restaurantId: rId,
                        restaurant: resto,
                        isRaining,
                      });
                    }}
                  >
                    <Icon name="cart" size={20} color="#FFFFFF" />
                  </TouchableOpacity>

                  {/* Center Details: Restaurant Name, Items in Cart */}
                  <TouchableOpacity
                    style={styles.stickyInfoCol}
                    activeOpacity={0.8}
                    onPress={() => {
                      navigation.navigate('CartScreen', {
                        restaurantId: rId,
                        restaurant: resto,
                        isRaining,
                      });
                    }}
                  >
                    <Text style={styles.stickyRestoTitle} numberOfLines={1}>
                      {restoName}
                    </Text>
                    <Text style={styles.stickyCartSubText} numberOfLines={1}>
                      {itemsCount} item{itemsCount > 1 ? 's' : ''} in cart • Tap to view
                    </Text>
                  </TouchableOpacity>

                  {/* Right Subtotal, View Cart Button & Instant Clear ✕ */}
                  <View style={[styles.stickyRightCol, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                    <TouchableOpacity
                      style={styles.stickyPayBtn}
                      activeOpacity={0.8}
                      onPress={() => {
                        navigation.navigate('CartScreen', {
                          restaurantId: rId,
                          restaurant: resto,
                          isRaining,
                        });
                      }}
                    >
                      <Text style={styles.stickyPayBtnText}>₹{subtotal.toFixed(0)} ›</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ padding: 6, backgroundColor: '#F1F5F9', borderRadius: 14 }}
                      activeOpacity={0.7}
                      onPress={async () => {
                        await CartService.clearCart();
                        setCartCount(0);
                        setCartState(CartService.getCart());
                      }}
                    >
                      <Icon name="close" size={13} color="#64748B" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          }

          return null;
        })()}

        {/* 8. CUSTOM BOTTOM NAVIGATION BAR */}
        <View style={styles.bottomNavContainer}>
          {/* Home */}
          <TouchableOpacity style={styles.navTab} onPress={() => setActiveTab('home')}>
            <Icon
              name={activeTab === 'home' ? 'home' : 'home-outline'}
              size={22}
              color={activeTab === 'home' ? '#0066FF' : '#64748B'}
              style={{ marginBottom: 2 }}
            />
            <Text style={[styles.navTabLabel, activeTab === 'home' && { color: '#0066FF', fontWeight: 'bold' }]}>
              Home
            </Text>
          </TouchableOpacity>

          {/* Cart - Lottie Bag when items in cart */}
          <TouchableOpacity style={styles.navTab} onPress={() => navigation.navigate('CartScreen', { customerCoords })}>
            <View style={{ position: 'relative', width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
              {cartCount > 0 ? (
                <LottieAnimation
                  source={shoppingBagLottieJson}
                  width={44}
                  height={44}
                  loop={true}
                  autoplay={true}
                  speed={1.0}
                />
              ) : (
                <Icon
                  name="cart-outline"
                  size={24}
                  color={cartCount > 0 ? '#0066FF' : '#64748B'}
                />
              )}
              {cartCount > 0 && (
                <View style={[styles.tabCartBadge, { position: 'absolute', top: -4, right: -8 }]}>
                  <Text style={styles.tabCartBadgeText}>{cartCount}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.navTabLabel, cartCount > 0 ? { color: '#0066FF', fontWeight: '700' } : {}]}>Cart</Text>
          </TouchableOpacity>

          {/* Orders */}
          <TouchableOpacity style={styles.navTab} onPress={() => navigation.navigate('MyBookingsScreen', { role: 'customer', title: 'My Orders' })}>
            <Icon
              name={activeTab === 'orders' ? 'receipt' : 'receipt-outline'}
              size={22}
              color={activeTab === 'orders' ? '#0066FF' : '#64748B'}
              style={{ marginBottom: 2 }}
            />
            <Text style={[styles.navTabLabel, activeTab === 'orders' && { color: '#0066FF', fontWeight: 'bold' }]}>
              Orders
            </Text>
          </TouchableOpacity>

          {/* Profile */}
          <TouchableOpacity style={styles.navTab} onPress={() => navigation.navigate('CustomerProfileScreen')} activeOpacity={0.8}>
            {(() => {
              const u = user as any;
              const photo = u?.profilePicture || u?.avatar || (Array.isArray(u?.photos) && u.photos[0]) || null;
              if (photo) {
                return (
                  <Image
                    source={{ uri: resolveUploadUrl(photo) }}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      borderWidth: activeTab === 'profile' ? 2 : 1,
                      borderColor: activeTab === 'profile' ? '#0066FF' : '#94A3B8',
                      marginBottom: 2,
                    }}
                  />
                );
              }
              return (
                <Icon
                  name={activeTab === 'profile' ? 'person' : 'person-outline'}
                  size={22}
                  color={activeTab === 'profile' ? '#0066FF' : '#64748B'}
                  style={{ marginBottom: 2 }}
                />
              );
            })()}
            <Text style={[styles.navTabLabel, activeTab === 'profile' && { color: '#0066FF', fontWeight: 'bold' }]}>
              Profile
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Delivery Address Selection Modal */}
      {/* Customer Map Location Picker Modal (Interactive Leaflet Map with Bhopal Zones) */}
      <DeviceLocationRequiredModal
        visible={showLocationRequiredModal}
        isMandatory={true}
        onLocationResolved={async (fix) => {
          setShowLocationRequiredModal(false);
          const coords = { latitude: fix.latitude, longitude: fix.longitude };
          setCustomerCoords(coords);
          checkLiveWeather(coords.latitude, coords.longitude);
          fetchOnlineRestaurants(false);
          const geo = await reverseGeocodeCoords(coords.latitude, coords.longitude);
          const full = geo?.fullAddress || `Location near (${coords.latitude.toFixed(3)}, ${coords.longitude.toFixed(3)})`;
          setCurrentAddress(full);
        }}
        onDismiss={() => {
          setShowLocationRequiredModal(false);
        }}
      />

      <CustomerMapLocationModal
        visible={showMapLocationModal}
        onClose={() => setShowMapLocationModal(false)}
        initialCoords={customerCoords}
        onLocationUpdated={handleLocationUpdatedFromMap}
      />

      <AddressSelectionModal
        visible={addressModalVisible}
        onClose={() => setAddressModalVisible(false)}
        onSelectAddress={handleSelectDeliveryAddress}
      />

      {/* Heavy Rain Animation Overlay only when Raining */}
      {isRaining && <RainAnimation active={isRaining} intensity="heavy" />}

      {/* Dynamic Category-Aware Customer Help Center Modal */}
      <CustomerHelpCenterModal
        visible={showCustomerHelpModal}
        onClose={() => setShowCustomerHelpModal(false)}
        orderStage={activeFoodOrder ? 'ORDER_SENT_TO_STORE' : 'BEFORE_PAYMENT'}
        categoryName={activeFoodOrder?.categoryName || activeFoodOrder?.serviceName || 'Food'}
        bookingId={activeFoodOrder?.bookingId || activeFoodOrder?._id}
        orderData={activeFoodOrder || undefined}
        user={user}
        userCoords={customerCoords || undefined}
      />

      {/* Real-time Order Cancellation Popup */}
      <CancellationPopupModal
        visible={cancellationPopup.visible}
        role="CUSTOMER"
        orderId={cancellationPopup.orderId}
        reason={cancellationPopup.reason}
        cancelledBy={cancellationPopup.cancelledBy}
        storeName={cancellationPopup.storeName}
        refundStatus={cancellationPopup.refundStatus}
        refundAmount={cancellationPopup.refundAmount}
        paidAmount={cancellationPopup.paidAmount}
        isNonRefundable={cancellationPopup.isNonRefundable}
        cancelledAt={cancellationPopup.cancelledAt}
        onClose={() => setCancellationPopup({ visible: false })}
        onOk={() => setCancellationPopup({ visible: false })}
      />

      {/* Customer Cancellation Reason Selection Modal */}
      <Modal
        visible={customerCancelModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCustomerCancelModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, width: '90%', maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 22 }}>⚠️</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#EF4444' }}>Cancel Order</Text>
              </View>
              <TouchableOpacity onPress={() => setCustomerCancelModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontSize: 20, color: '#94A3B8', fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: '#64748B', marginBottom: 14 }}>
              Order #{String(customerCancelOrderTarget?.bookingId || customerCancelOrderTarget?.rideId || customerCancelOrderTarget?._id || '').slice(-6)}. Please select your reason for cancellation:
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 260 }}>
              {CUSTOMER_CANCEL_REASONS.map((reason) => {
                const isSelected = customerSelectedReason === reason;
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
                    onPress={() => setCustomerSelectedReason(reason)}
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
                onPress={() => setCustomerCancelModalVisible(false)}
                disabled={cancelingActiveOrder}
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
                  opacity: cancelingActiveOrder ? 0.7 : 1,
                }}
                onPress={handleConfirmCustomerCancel}
                disabled={cancelingActiveOrder}
              >
                {cancelingActiveOrder ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>Confirm Cancel</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Voice Assistant Microphone Search Modal */}
      <VoiceSearchModal
        visible={showVoiceModal}
        onClose={() => setShowVoiceModal(false)}
        onResult={(spokenText) => {
          setSearchQuery(spokenText);
          setIsSearchFocused(true);
        }}
      />
          {/* Dedicated Zomato-Style Search Screen Modal */}
      <CustomerSearchModal
        visible={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        navigation={navigation}
        restaurants={restaurants}
        customerCoords={customerCoords}
      />
    </View>
  );
};

export default CustomerHomeScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  locationWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  locationPinIcon: {
    fontSize: 22,
    marginRight: 8,
  },
  locationCityTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  locationSubAddress: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },
  deliverToLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  locationText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F172A',
    maxWidth: 200,
  },
  arrowDownIcon: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: 'bold',
  },
  bellBtn: {
    position: 'relative',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  bellBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#EF4444',
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerHelpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  headerHelpText: {
    color: '#0066FF',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 3,
  },
  headerCartBtn: {
    position: 'relative',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  headerCartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#0066FF',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  headerCartBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: 'bold',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 10,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 46,
  },
  searchIconText: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  filterBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topAddressHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  locationWrapWhite: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  locationPinCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  deliverToLabelWhite: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  arrowDownIconWhite: {
    fontSize: 12,
    color: '#0066FF',
    fontWeight: 'bold',
  },
  locationTextWhite: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerGlassBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  headerGlassBtnText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
  headerGlassIconBtn: {
    position: 'relative',
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSearchStickyContainer: {
    backgroundColor: '#FFFFFF',
    zIndex: 999,
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: 1.5,
    borderBottomColor: '#E2E8F0',
  },
  heroSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
  },
  heroFilterBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    borderBottomWidth: 2.5,
    borderBottomColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  pillSearchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    borderBottomWidth: 3,
    borderBottomColor: '#1D4ED8',
    borderRadius: 22,
    paddingHorizontal: 14,
    height: 46,
    elevation: 3,
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  centerHeroBannerWrap: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 18,
    overflow: 'hidden',
    height: 185,
    backgroundColor: '#0F172A',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 5,
  },
  centerHeroBannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerDarkGradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  bannerFlexRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerLeftCol: {
    flex: 1,
    paddingRight: 6,
    justifyContent: 'center',
  },
  bannerLottieWrap: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  bannerWowBadge: {
    position: 'absolute',
    top: 2,
    right: 6,
    zIndex: 10,
    backgroundColor: '#FEF08A',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#EAB308',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  bannerWowBadgeText: {
    color: '#854D0E',
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  bannerContentPill: {
    justifyContent: 'flex-end',
  },
  bannerLivePillBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 10,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  bannerLivePillText: {
    color: '#0066FF',
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  bannerMainTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.2,
    lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
    marginBottom: 2,
  },
  bannerSubTitle: {
    color: '#FEF08A',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    marginBottom: 6,
  },
  bannerCategoryMiniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  bannerMiniChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  bannerMiniChipText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  searchMagnifierIcon: {
    fontSize: 16,
    marginRight: 8,
    color: '#E11D48',
  },
  pillSearchInput: {
    flex: 1,
    fontSize: 13.5,
    color: '#0F172A',
    fontWeight: '500',
  },
  pillPlaceholderText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  searchMicDividerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 4,
  },
  searchDividerPipe: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '300',
  },
  placeholderText: {
    fontSize: 13.5,
    color: '#94A3B8',
    fontWeight: '500',
  },
  micIconWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  micDivider: {
    color: '#CBD5E1',
    fontSize: 16,
  },
  micIcon: {
    fontSize: 16,
  },
  vegModeToggleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  vegModeLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 10,
    marginBottom: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  topHeroBannerContent: {
    marginTop: 4,
    paddingTop: 4,
  },
  greetingTextWhite: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  heroHeadlineWhite: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 26,
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroSubTextWhite: {
    fontSize: 11,
    color: '#F8FAFC',
    lineHeight: 15,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  weatherCardGlass: {
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 115,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  goldDeliveryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FEF3C7',
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  goldDeliveryText: {
    flex: 1,
    fontSize: 12,
    color: '#78350F',
    lineHeight: 16,
  },
  goldKnowMore: {
    color: '#DC2626',
    fontWeight: 'bold',
  },
  filterChipsScroll: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  filterChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#0066FF',
  },
  filterChipVegActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#22C55E',
  },
  recommendedSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  heroWrapper: {
    marginHorizontal: 16,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 16,
    position: 'relative',
    backgroundColor: '#0284C7',
    minHeight: 280,
  },
  heroBackgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  heroOverlayContent: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 16,
    justifyContent: 'space-between',
    minHeight: 280,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroLeftWrap: {
    flex: 1,
    paddingRight: 10,
  },
  greetingText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  heroHeadline: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 31,
    marginBottom: 6,
  },
  heroSubText: {
    fontSize: 11.5,
    color: '#334155',
    lineHeight: 16,
    fontWeight: '500',
  },
  weatherCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minWidth: 125,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  weatherPermissionBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  weatherPermissionText: {
    fontSize: 9.5,
    color: '#FFFFFF',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 6,
    maxWidth: 110,
    lineHeight: 13,
  },
  enableLocationBtn: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  enableLocationBtnText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: 'bold',
  },
  weatherCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weatherCardIcon: {
    fontSize: 22,
    marginRight: 4,
  },
  weatherCardRight: {
    flex: 1,
  },
  weatherTempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weatherTempText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  weatherRefreshIcon: {
    fontSize: 10,
    color: '#E2E8F0',
    marginLeft: 3,
  },
  weatherConditionText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#CBD5E1',
    marginTop: 0,
  },
  weatherLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  weatherLocPin: {
    fontSize: 9,
    marginRight: 2,
  },
  weatherLocText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#F8FAFC',
    maxWidth: 90,
  },
  weatherUpdatedText: {
    fontSize: 8.5,
    color: '#94A3B8',
    marginTop: 2,
  },
  bhopalBadgeWrap: {
    alignSelf: 'flex-end',
    marginTop: 10,
    marginBottom: 10,
    alignItems: 'flex-end',
  },
  bhopalBadgeTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    fontStyle: 'italic',
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  bhopalBadgeSub: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.95)',
    fontStyle: 'italic',
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
    lineHeight: 14,
  },
  floatingSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  floatingSearchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 14,
    height: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterSlidersBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  toranContainer: {
    width: SCREEN_WIDTH - 24,
    marginHorizontal: 12,
    height: Math.round((SCREEN_WIDTH - 24) / 3.0),
    marginTop: -20,
    marginBottom: -6,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    zIndex: 2,
  },
  categoriesContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 16,
    paddingBottom: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  categorySingleRowScroll: {
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryTwoRowScroll: {
    paddingHorizontal: 12,
  },
  categoryTwoRowWrapper: {
    flexDirection: 'column',
    gap: 14,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  categoryItemBtn: {
    width: 72,
    alignItems: 'center',
    marginHorizontal: 3,
  },
  categoryCircleCard: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  categoryAllCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  categoryCircleCardSelected: {
    borderColor: '#E11D48',
    borderWidth: 2.5,
  },
  allIconGrid: {
    width: 22,
    height: 22,
    justifyContent: 'space-between',
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  gridSquare: {
    width: 9,
    height: 9,
    borderRadius: 2.5,
    backgroundColor: '#FFFFFF',
  },
  moreCircleWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreDotsText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#475569',
  },
  categoryImg: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
    marginTop: 5,
    textAlign: 'center',
    height: 26,
  },
  categoryLabelSelected: {
    color: '#E11D48',
    fontWeight: 'bold',
  },
  activeUnderlineBar: {
    width: 24,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#E11D48',
    marginTop: 2,
  },
  bannerWrap: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  bannerCard: {
    backgroundColor: '#0F172A',
    borderRadius: 24,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    height: 170,
    overflow: 'hidden',
  },
  bannerLeftContent: {
    flex: 1,
    paddingRight: 10,
  },
  hotDealTag: {
    backgroundColor: '#0066FF',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginBottom: 6,
  },
  hotDealTagText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: 'bold',
  },
  bannerHeadline: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
    lineHeight: 22,
  },
  bannerSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 4,
    marginBottom: 10,
  },
  bannerCtaBtn: {
    backgroundColor: '#0066FF',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  bannerCtaText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  bannerImg: {
    width: 120,
    height: 140,
    borderRadius: 16,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 18,
    backgroundColor: '#0066FF',
  },
  dotInactive: {
    width: 6,
    backgroundColor: '#CBD5E1',
  },
  categoriesScroll: {
    paddingHorizontal: 16,
    gap: 14,
    marginBottom: 24,
  },
  categoriesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  catItemBtn: {
    alignItems: 'center',
  },
  catIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  catIconWrapActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#DBEAFE',
  },
  catLabelText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  catLabelTextActive: {
    color: '#0066FF',
    fontWeight: 'bold',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  sectionSubRadius: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0066FF',
    marginTop: 2,
  },
  seeAllText: {
    fontSize: 13,
    color: '#0066FF',
    fontWeight: 'bold',
  },
  restaurantsScroll: {
    paddingHorizontal: 16,
    gap: 14,
    marginBottom: 24,
  },
  inlineNoticeBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inlineNoticeText: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  retryInlineBtn: {
    backgroundColor: '#D97706',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  retryInlineBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  syncBadge: {
    marginHorizontal: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  syncBadgeText: {
    color: '#0066FF',
    fontSize: 11,
    fontWeight: '600',
  },
  skeletonCard: {
    width: 220,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginRight: 12,
    overflow: 'hidden',
  },
  skeletonImg: {
    height: 125,
    width: '100%',
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonInfoWrap: {
    padding: 12,
  },
  skeletonTitleBar: {
    width: '75%',
    height: 14,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    marginBottom: 8,
  },
  skeletonSubBar: {
    width: '50%',
    height: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    marginBottom: 6,
  },
  skeletonMetaBar: {
    width: '35%',
    height: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
  },
  emptyRestoWrap: {
    marginHorizontal: 16,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 20,
  },
  emptyRestoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#334155',
    marginTop: 8,
  },
  emptyRestoSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    marginBottom: 12,
  },
  emptyRetryBtn: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  emptyRetryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  serviceUnavailableCard: {
    marginHorizontal: 16,
    marginVertical: 14,
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  serviceUnavailableIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  serviceUnavailableTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
  },
  serviceUnavailableSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 18,
    paddingHorizontal: 8,
  },
  serviceUnavailableActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  changeLocationBtn: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  changeLocationBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  retryBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  retryBtnText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  restoCard: {
    width: 220,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    marginRight: 12,
    overflow: 'hidden',
  },
  restoImgWrap: {
    position: 'relative',
    height: 125,
    width: '100%',
  },
  restoImg: {
    width: '100%',
    height: '100%',
  },
  noImgPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noImgText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
    marginTop: 4,
  },
  discountTag: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: '#16A34A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  discountTagText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  itemTag: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: '85%',
  },
  itemTagText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  statusBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  onlineBadge: {
    backgroundColor: 'rgba(22, 163, 74, 0.9)',
  },
  offlineBadge: {
    backgroundColor: 'rgba(100, 116, 139, 0.9)',
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: 'bold',
  },
  ratingBadge: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
  },
  ratingStar: {
    color: '#F59E0B',
    fontSize: 12,
    marginRight: 3,
  },
  ratingVal: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  restoInfoWrap: {
    padding: 12,
  },
  restoName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  restoCuisine: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  restoMeta: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
  },
  freeDelTag: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#16A34A',
    marginTop: 6,
  },
  offersScroll: {
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 24,
  },
  couponCard: {
    width: 230,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    marginRight: 12,
    justifyContent: 'space-between',
  },
  couponDiscountText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  couponSubText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  couponCodeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  couponCodeLabel: {
    fontSize: 11,
    color: '#475569',
  },
  couponArrow: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  popularScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  popularCard: {
    width: 150,
    marginRight: 12,
  },
  popularImgWrap: {
    position: 'relative',
    height: 110,
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 8,
  },
  popularImg: {
    width: '100%',
    height: '100%',
  },
  heartBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popularDishName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  popularPrice: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0066FF',
  },
  popularRating: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  bottomBarOuterWrap: {
    width: '100%',
    backgroundColor: 'transparent',
    paddingBottom: Platform.OS === 'android' ? 6 : 10,
  },
  bottomNavContainer: {
    height: 58,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: 0,
    borderTopColor: 'transparent',
    elevation: 0,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  navTab: {
    alignItems: 'center',
    flex: 1,
  },
  navTabIcon: {
    fontSize: 20,
    color: '#94A3B8',
  },
  navTabLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  tabCartBadge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: '#0066FF',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  tabCartBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  activeOrderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#2563EB',
    elevation: 4,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
  },
  activeOrderIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeOrderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    marginRight: 6,
  },
  activeOrderBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activeOrderBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  activeOrderSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  trackActiveOrderBtn: {
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#0066FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackActiveOrderBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  cancelActiveOrderBtn: {
    marginLeft: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelActiveOrderBtnText: {
    color: '#DC2626',
    fontSize: 11.5,
    fontWeight: '700',
  },
  animatedPlaceholderContainer: {
    flex: 1,
    height: 22,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  animatedPlaceholderText: {
    fontSize: 13.5,
    color: '#64748B',
    fontWeight: '500',
  },
  cancelSearchBtn: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  cancelSearchBtnText: {
    color: '#0066FF',
    fontWeight: '600',
    fontSize: 13.5,
  },
  rainNoticeBanner: {
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rainNoticeEmoji: {
    fontSize: 22,
  },
  rainNoticeTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E40AF',
  },
  rainNoticeSub: {
    fontSize: 11.5,
    color: '#0066FF',
    marginTop: 1,
  },
  rainLiveBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  rainLiveBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  verticalRestoCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  verticalImgWrap: {
    width: '100%',
    height: 160,
    backgroundColor: '#F8FAFC',
    position: 'relative',
  },
  verticalImg: {
    width: '100%',
    height: '100%',
  },
  verticalInfoWrap: {
    padding: 14,
  },
  verticalRestoName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
    flex: 1,
    marginRight: 8,
  },
  verticalPriceForTwo: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '500',
  },
  verticalRestoCuisine: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 3,
  },
  verticalMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  verticalMetaText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  metaDotText: {
    fontSize: 10,
    color: '#94A3B8',
  },

  // ── Fixed / Sticky Bottom Order & Cart Card Styles ──
  stickyCardWrap: {
    position: 'absolute',
    bottom: 68,
    left: 12,
    right: 12,
    zIndex: 9999,
    elevation: 16,
  },
  stickyCardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 16,
    borderWidth: 1.5,
    borderColor: '#0066FF',
  },
  stickyCartBorder: {
    borderColor: '#2563EB',
  },
  stickyIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stickyInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  stickyRestoTitle: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
    maxWidth: 160,
  },
  stickyOrderIdBadge: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: '#1E293B',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  stickyStatusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  stickyStatusText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  stickyMetaDot: {
    color: '#64748B',
    fontSize: 10,
  },
  stickyItemsCountText: {
    color: '#CBD5E1',
    fontSize: 11.5,
    fontWeight: '600',
  },
  stickyCartSubText: {
    color: '#93C5FD',
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 2,
  },
  stickyRightCol: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  stickyPriceText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 2,
  },
  stickyTrackBtn: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  stickyTrackBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  stickyPayBtn: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  stickyPayBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  searchDishCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  searchDishImgWrap: {
    width: 68,
    height: 68,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  searchDishImg: {
    width: '100%',
    height: '100%',
  },
  searchDishPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchDishInfoWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  searchDishTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    marginRight: 8,
  },
  searchDishPriceText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#16A34A',
  },
  searchDishRestoName: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  searchDishMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  searchDishMetaText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  searchDishActionText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0066FF',
  },
  suggestionTagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  suggestionTagText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
});
