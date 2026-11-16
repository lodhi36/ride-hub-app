import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Image,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  Alert,
  TextInput,
  Modal,
  Share,
  Platform,
  PermissionsAndroid,
  Animated,
  Keyboard,
  BackHandler,
  Linking,
  Vibration,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import WebView from 'react-native-webview';
import api, { UPLOADS_URL } from '../services/api';
import { resolveUploadUrl } from '../config/apiConfig';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import restaurantDataService from '../services/RestaurantDataService';
import { CartService } from '../services/CartService';
import { getCanonicalRestaurantLocation } from '../services/LocationAddressService';
import { getSellerCategoryType, getCategoryTerminology } from './RiderHomeScreen';
import Icon from '../components/PngIcon';
import { LottieAnimation } from '../components/LottieAnimation';
import { getCategoryIcon } from '../services/CategoryHelper';

const { width } = Dimensions.get('window');
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

const RestaurantProfileScreen = ({ route, navigation }: any) => {
  const { isDark, currentColors } = useTheme('customer');
  const styles = useMemo(() => getStyles(currentColors, isDark), [currentColors, isDark]);
  const { user } = useAuth();
  const { restaurantId, restaurant: initialResto, customerCoords: passedCoords } = route.params || {};
  const rId = restaurantId || initialResto?._id || initialResto?.id;

  // Restaurant details from DB
  const [restaurant, setRestaurant] = useState<any>(initialResto || null);
  const [loadingProfile, setLoadingProfile] = useState<boolean>(!initialResto);

  // Derive business type, category and terminology from DB fields
  const storeCatRaw = restaurant?.categoryName || restaurant?.businessCategoryName || restaurant?.category || initialResto?.categoryName || '';
  const storePartnerType = restaurant?.partnerType || initialResto?.partnerType || '';
  const storeBusinessType = restaurant?.business_type || restaurant?.businessType || initialResto?.business_type || initialResto?.businessType || '';
  const catType = getSellerCategoryType(storeCatRaw, storePartnerType, storeBusinessType);
  const terminology = getCategoryTerminology(catType);
  const isRestaurant = catType === 'restaurant';

  // Menu items and categories strictly from DB
  const [menuItems, setMenuItems] = useState<any[]>(initialResto?.menuItems || []);
  const [categories, setCategories] = useState<any[]>([]);
  const [loadingMenu, setLoadingMenu] = useState<boolean>(!initialResto?.menuItems?.length);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [isRefreshingMenu, setIsRefreshingMenu] = useState<boolean>(false);
  const [failedDishImages, setFailedDishImages] = useState<{ [key: string]: boolean }>({});

  // Real GPS Coordinates of customer
  const [customerCoords, setCustomerCoords] = useState<{ latitude: number; longitude: number } | null>(
    passedCoords || null
  );

  // Search state — ONLY searches inside THIS restaurant's menu
  const [isSearchActive, setIsSearchActive] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // ── SPEC PART 8, 9 & 10: SUPPLIER SHOWCASE 3 PHOTOS & LOTTIE ANIMATION ──
  const PHOTO_LABELS = ['Store Front & Board', 'Inside Store & Ambience', 'Products & Specialties'];
  const [activePhotoIndex, setActivePhotoIndex] = useState<number>(0);
  const photoScrollRef = useRef<FlatList>(null);
  const isUserInteractingWithSlider = useRef<boolean>(false);

  // Collect exactly 3 store photos or fall back to profile image
  const showcasePhotos: string[] = useMemo(() => {
    const list: string[] = [];
    if (Array.isArray(restaurant?.storePhotos) && restaurant.storePhotos.length > 0) {
      restaurant.storePhotos.forEach((p: any) => {
        const u = typeof p === 'string' ? p : p?.url;
        if (u && typeof u === 'string' && u.trim() && !list.includes(u)) {
          list.push(u);
        }
      });
    }
    if (list.length === 0) {
      const rawCandidate =
        restaurant?.profilePicture ||
        restaurant?.coverImage ||
        restaurant?.image ||
        restaurant?.rawUser?.profilePicture ||
        restaurant?.rawUser?.coverImage ||
        restaurant?.rawUser?.image ||
        (Array.isArray(restaurant?.images) && restaurant.images[0]) ||
        null;
      if (rawCandidate && typeof rawCandidate === 'string' && !rawCandidate.startsWith('data:image')) {
        list.push(rawCandidate);
      }
    }
    return list;
  }, [restaurant]);

  // 3.5-second Auto-Slider with pause on touch
  useEffect(() => {
    if (showcasePhotos.length <= 1) return;
    const interval = setInterval(() => {
      if (isUserInteractingWithSlider.current) return;
      setActivePhotoIndex((prev) => {
        const next = (prev + 1) % showcasePhotos.length;
        try {
          photoScrollRef.current?.scrollToIndex({ index: next, animated: true });
        } catch (e) {}
        return next;
      });
    }, 3500);

    return () => clearInterval(interval);
  }, [showcasePhotos.length]);
  const searchInputRef = useRef<TextInput>(null);
  const scrollY = useRef(new Animated.Value(0)).current;

  // Animated search placeholder state & slide transition
  const [currentWordIndex, setCurrentWordIndex] = useState<number>(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const translateYAnim = useRef(new Animated.Value(0)).current;

  // Active filters: 'ALL' | 'VEG' | 'NON_VEG' | 'EGG' | 'HIGHLY_ORDERED' | 'SPICY' | 'KIDS_CHOICE'
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Accordion collapsed state per category
  const [collapsedCategories, setCollapsedCategories] = useState<{ [key: string]: boolean }>({});
  // Expanded dish description state
  const [expandedDescs, setExpandedDescs] = useState<{ [key: string]: boolean }>({});
  // Bookmarked / Wishlisted items
  const [bookmarkedItems, setBookmarkedItems] = useState<{ [key: string]: boolean }>({});

  // Modals
  const [menuModalVisible, setMenuModalVisible] = useState<boolean>(false);
  const [infoModalVisible, setInfoModalVisible] = useState<boolean>(false);
  const [selectedItemForDetails, setSelectedItemForDetails] = useState<any | null>(null);
  const [showItemVideo, setShowItemVideo] = useState<boolean>(false);

  // Restaurant Reviews & Ratings Modal State
  const [reviewsModalVisible, setReviewsModalVisible] = useState<boolean>(false);
  const [reviewsList, setReviewsList] = useState<any[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState<boolean>(false);
  const [reviewsStats, setReviewsStats] = useState<{ averageRating: number; totalReviews: number }>({
    averageRating: 4.8,
    totalReviews: 0,
  });

  // Instant Video Playback for Item Details Modal (Super Fast)
  useEffect(() => {
    if (!selectedItemForDetails) {
      setShowItemVideo(false);
      return;
    }
    const videoUri =
      selectedItemForDetails?.videoUrl ||
      selectedItemForDetails?.video ||
      selectedItemForDetails?.menuVideo ||
      restaurant?.menuVideo ||
      restaurant?.introVideo;

    if (videoUri) {
      setShowItemVideo(true);
    } else {
      setShowItemVideo(false);
    }
  }, [selectedItemForDetails, restaurant]);

  // Fetch Real Restaurant Reviews from Database
  const fetchReviews = async () => {
    if (!rId) return;
    try {
      setReviewsLoading(true);
      let res = await api.get(`/reviews/${rId}`).catch(() => null);
      if (!res?.data?.success) {
        res = await api.get(`/bookings/reviews/${rId}`).catch(() => null);
      }
      if (res?.data?.success) {
        setReviewsList(res.data.reviews || []);
        const total = Number(res.data.totalReviews ?? res.data.reviews?.length ?? 0);
        const avg = Number(res.data.averageRating || 4.8);
        setReviewsStats({
          averageRating: avg,
          totalReviews: total,
        });
        setRestaurant((prev: any) => ({
          ...(prev || {}),
          rating: avg,
          reviewsCount: total,
        }));
      }
    } catch (e) {
      console.log('[REVIEWS FETCH NOTICE]', e);
    } finally {
      setReviewsLoading(false);
    }
  };

  const handleOpenReviews = () => {
    fetchReviews();
    setReviewsModalVisible(true);
  };

  // Real Cart state: itemId -> quantity
  const [cart, setCart] = useState<{ [key: string]: number }>({});
  const { socket } = useSocket();

  // Synchronize local cart with persistent CartService
  useEffect(() => {
    const syncFromCartService = (cartState: any) => {
      if (String(cartState.restaurantId) === String(rId)) {
        const qtyMap: { [key: string]: number } = {};
        for (const [id, entry] of Object.entries(cartState.items || {})) {
          if (entry && (entry as any).quantity > 0) {
            qtyMap[id] = (entry as any).quantity;
          }
        }
        setCart(qtyMap);
      } else if (!cartState.restaurantId || cartState.count === 0) {
        setCart({});
      }
    };

    syncFromCartService(CartService.getCart());
    const unsub = CartService.subscribe(syncFromCartService);
    return unsub;
  }, [rId]);

  // 1. Fetch Real GPS Location of customer for real distance calculation
  useEffect(() => {
    let isMounted = true;
    const getLiveGps = async () => {
      if (passedCoords?.latitude && passedCoords?.longitude) {
        if (isMounted) setCustomerCoords(passedCoords);
        return;
      }
      try {
        if (Platform.OS === 'android') {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            return;
          }
        }
        Geolocation.getCurrentPosition(
          (pos) => {
            if (isMounted && pos?.coords) {
              setCustomerCoords({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              });
            }
          },
          (err) => {
            console.log('[GPS NOTICE]', err.message);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
        );
      } catch (e) {
        console.log('[GPS ERROR]', e);
      }
    };

    getLiveGps();
    return () => {
      isMounted = false;
    };
  }, [passedCoords]);

  // 2. Fetch Restaurant Profile & Menu from Database
  useEffect(() => {
    if (rId) {
      fetchRestaurantProfile();
      fetchRestaurantMenu(true);
      fetchReviews();
    }
  }, [rId]);

  // 3. Real-Time WebSocket listeners for DB menu updates (item add/edit/delete/availability)
  useEffect(() => {
    if (!socket || !rId) return;

    const matchesThisResto = (data: any) => {
      const target = String(data?.restaurantId || data?.userId || data?.id || data?.user?._id || '');
      return Boolean(target && String(rId) && target === String(rId));
    };

    const handleNameUpdate = (data: any) => {
      const newName = (data?.name || data?.user?.name || '').trim();
      if (matchesThisResto(data) && newName) {
        setRestaurant((prev: any) => ({ ...(prev || {}), name: newName }));
      }
    };

    const handleRestoUpdate = (data: any) => {
      if (matchesThisResto(data) && data.user) {
        setRestaurant((prev: any) => ({ ...(prev || {}), ...data.user }));
      }
    };

    const handleItemCreated = (data: any) => {
      if (matchesThisResto(data) && data.item) {
        setMenuItems((prev: any[]) => [data.item, ...prev.filter((i) => String(i._id) !== String(data.item._id))]);
      }
    };

    const handleItemUpdated = (data: any) => {
      if (matchesThisResto(data) && data.item) {
        setMenuItems((prev: any[]) =>
          prev.map((i) => (String(i._id) === String(data.item._id) ? { ...i, ...data.item } : i))
        );
      }
    };

    const handleItemAvailability = (data: any) => {
      if (matchesThisResto(data) && data.itemId) {
        setMenuItems((prev: any[]) =>
          prev.map((i) => (String(i._id) === String(data.itemId) ? { ...i, isAvailable: data.isAvailable } : i))
        );
        // Automatically purge out-of-stock items from customer cart in real time
        if (data.isAvailable === false) {
          CartService.removeItem(String(data.itemId));
          setCart((prev) => {
            const copy = { ...prev };
            delete copy[String(data.itemId)];
            return copy;
          });
        }
      }
    };

    const handleItemDeleted = (data: any) => {
      if (matchesThisResto(data) && data.itemId) {
        CartService.removeItem(String(data.itemId));
        setMenuItems((prev: any[]) => prev.filter((i) => String(i._id) !== String(data.itemId)));
        setCart((prev) => {
          const copy = { ...prev };
          delete copy[String(data.itemId)];
          return copy;
        });
      }
    };

    const handleCatUpdate = (data: any) => {
      if (matchesThisResto(data) && data.category) {
        setCategories((prev: any[]) => {
          const exists = prev.some(
            (c) => (c.name || c).trim().toLowerCase() === data.category.name.trim().toLowerCase()
          );
          return exists ? prev : [...prev, data.category];
        });
      }
    };

    const handleReviewEvent = (data: any) => {
      const targetId = (data?.restaurantId || data?.id)?.toString();
      const currentId = (rId || '').toString();
      if (targetId === currentId || matchesThisResto(data)) {
        console.log('[RESTAURANT PROFILE] Real-time review/rating event received:', data);
        if (data.averageRating !== undefined) {
          setReviewsStats({
            averageRating: Number(data.averageRating),
            totalReviews: Number(data.totalReviews || 0),
          });
          setRestaurant((prev: any) => ({
            ...(prev || {}),
            rating: Number(data.averageRating),
            reviewsCount: Number(data.totalReviews || 0),
          }));
        }
        if (data.review) {
          setReviewsList((prev: any[]) => [data.review, ...prev.filter((r) => String(r._id || r.id) !== String(data.review._id || data.review.id))]);
        }
        fetchReviews();
      }
    };

    const handleReviewDeleted = (data: any) => {
      const targetId = (data?.restaurantId || data?.id)?.toString();
      const currentId = (rId || '').toString();
      if (targetId === currentId || matchesThisResto(data)) {
        console.log('[RESTAURANT PROFILE] Review deleted event received:', data);
        if (data.reviewId) {
          setReviewsList((prev: any[]) => prev.filter((r) => String(r._id || r.id) !== String(data.reviewId)));
        }
        if (data.totalReviews !== undefined) {
          setReviewsStats({
            averageRating: Number(data.averageRating || 4.8),
            totalReviews: Number(data.totalReviews || 0),
          });
          setRestaurant((prev: any) => ({
            ...(prev || {}),
            rating: Number(data.averageRating || 4.8),
            reviewsCount: Number(data.totalReviews || 0),
          }));
        }
        fetchReviews();
      }
    };

    socket.on('RESTAURANT_REVIEWED', handleReviewEvent);
    socket.on('RESTAURANT_REVIEW_UPDATED', handleReviewEvent);
    socket.on('RESTAURANT_REVIEW_DELETED', handleReviewDeleted);
    socket.on('restaurant_rating_updated', handleReviewEvent);
    socket.on('new_review_received', handleReviewEvent);
    socket.on('restaurant_name_updated', handleNameUpdate);
    socket.on('RESTAURANT_NAME_UPDATED', handleNameUpdate);
    socket.on('RESTAURANT_UPDATED', handleRestoUpdate);
    const handleSupplierShowcase = (data: any) => {
      const targetId = String(data?.supplierId || data?.restaurantId || '');
      if (targetId && String(rId) && targetId === String(rId)) {
        console.log('⚡ [RESTAURANT PROFILE] Live supplier showcase/animation updated via socket:', data);
        if (data.supplierLottieAnimation !== undefined) {
          setRestaurant((prev: any) => ({
            ...(prev || {}),
            supplierLottieAnimation: data.supplierLottieAnimation,
          }));
        }
      }
    };
    socket.on('supplier_showcase_updated', handleSupplierShowcase);
    socket.on('MENU_ITEM_CREATED', handleItemCreated);
    socket.on('menu_item_added', handleItemCreated);
    socket.on('MENU_ITEM_UPDATED', handleItemUpdated);
    socket.on('MENU_ITEM_AVAILABILITY_UPDATED', handleItemAvailability);
    socket.on('MENU_ITEM_DELETED', handleItemDeleted);
    socket.on('MENU_CATEGORY_UPDATED', handleCatUpdate);
    return () => {
      socket.off('RESTAURANT_REVIEWED', handleReviewEvent);
      socket.off('RESTAURANT_REVIEW_UPDATED', handleReviewEvent);
      socket.off('RESTAURANT_REVIEW_DELETED', handleReviewDeleted);
      socket.off('restaurant_rating_updated', handleReviewEvent);
      socket.off('new_review_received', handleReviewEvent);
      socket.off('restaurant_name_updated', handleNameUpdate);
      socket.off('RESTAURANT_NAME_UPDATED', handleNameUpdate);
      socket.off('RESTAURANT_UPDATED', handleRestoUpdate);
      socket.off('supplier_showcase_updated', handleSupplierShowcase);
      socket.off('MENU_ITEM_CREATED', handleItemCreated);
      socket.off('menu_item_added', handleItemCreated);
      socket.off('MENU_ITEM_UPDATED', handleItemUpdated);
      socket.off('MENU_ITEM_AVAILABILITY_UPDATED', handleItemAvailability);
      socket.off('MENU_ITEM_DELETED', handleItemDeleted);
      socket.off('MENU_CATEGORY_UPDATED', handleCatUpdate);
    };
  }, [socket, rId, user]);

  const fetchRestaurantProfile = async () => {
    if (!rId || rId === 'undefined' || rId === 'null') {
      setLoadingProfile(false);
      return;
    }
    try {
      setLoadingProfile(true);
      const res = await api.get(`/profile/${rId}`, { timeout: 7000 });
      if (res && res.data && res.data.success && res.data.profile) {
        setRestaurant(res.data.profile);
      }
    } catch (e) {
      console.log('[FETCH RESTO PROFILE NOTICE]', e);
    } finally {
      setLoadingProfile(false);
    }
  };

  const fetchRestaurantMenu = async (force: boolean = false) => {
    try {
      if (menuItems.length > 0) {
        setIsRefreshingMenu(true);
      } else {
        setLoadingMenu(true);
      }
      setMenuError(null);

      // Force refresh ensures DB is the single source of truth (no stale cache)
      const result = await restaurantDataService.getRestaurantMenu(rId, force);

      if (result.items && result.items.length > 0) {
        setMenuItems(result.items);
      }
      if (result.categories && result.categories.length > 0) {
        setCategories(result.categories);
      }
      if (result.error) {
        setMenuError(result.error);
      }
    } catch (e) {
      console.log('[FETCH RESTO MENU ERROR]', e);
      if (menuItems.length > 0) {
        setMenuError('Unable to refresh menu. Showing available dishes.');
      }
    } finally {
      setLoadingMenu(false);
      setIsRefreshingMenu(false);
    }
  };

  // Authoritative Restaurant Online/Offline Status Check
  const isStoreOnline = useMemo(() => {
    if (!restaurant) return true;
    const rawOnline = restaurant.isOnline !== undefined ? restaurant.isOnline : restaurant.rawUser?.isOnline;
    const rawStatus = restaurant.restaurant_status || restaurant.rawUser?.restaurant_status || restaurant.status || restaurant.rawUser?.status;

    // Only strictly offline if explicitly set to offline and not online
    if (rawStatus === 'offline' && rawOnline !== true) return false;
    if (rawOnline === false && rawStatus !== 'online') return false;

    return Boolean(
      rawStatus === 'online' ||
      rawOnline === true ||
      restaurant.restaurant_status === 'online' ||
      restaurant.isOnline === true ||
      restaurant.status === 'online'
    );
  }, [restaurant]);

  const isOffline = !isStoreOnline;

  // 4. Cart management (0ms instant optimistic response)
  const updateCart = (itemId: string, delta: number) => {
    if (isOffline && delta > 0) {
      Alert.alert('Restaurant Offline', 'This restaurant is currently offline and not accepting orders.');
      return;
    }

    const dish = menuItems.find((i) => (i._id || i.id) === itemId);
    if (dish && dish.isAvailable === false && delta > 0) {
      Alert.alert('Out of Stock', 'This dish is currently unavailable.');
      return;
    }

    const currentRestoId = CartService.getRestaurantId();
    if (delta > 0 && currentRestoId && String(currentRestoId) !== String(rId) && CartService.getCartCount() > 0) {
      Alert.alert(
        'Replace Cart?',
        `Your cart contains items from ${CartService.getRestaurant()?.name || 'another restaurant'}. Reset cart to add items from ${restaurant?.name || 'this restaurant'}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Yes, Start Fresh',
            onPress: () => {
              setCart({ [itemId]: 1 });
              CartService.addItem(rId, restaurant, dish, 1, true);
            },
          },
        ]
      );
      return;
    }

    // Instant optimistic update on local state
    setCart((prev) => {
      const currentQty = prev[itemId] || 0;
      const nextQty = currentQty + delta;
      if (nextQty <= 0) {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      }
      return { ...prev, [itemId]: nextQty };
    });

    if (delta > 0) {
      CartService.addItem(rId, restaurant, dish, delta);
    } else {
      CartService.updateQuantity(itemId, delta);
    }
  };

  // 5. Bookmark / Share
  const toggleBookmark = (itemId: string, dishName: string) => {
    setBookmarkedItems((prev) => {
      const isNowSaved = !prev[itemId];
      if (isNowSaved) {
        Alert.alert('Saved to Favorites ❤️', `"${dishName}" has been added to your favorites!`);
      }
      return { ...prev, [itemId]: isNowSaved };
    });
  };

  const handleCallRestaurant = () => {
    const phone =
      restaurant?.phoneNumber ||
      restaurant?.phone ||
      initialResto?.phoneNumber ||
      initialResto?.phone;
    if (phone && phone !== 'N/A') {
      Linking.openURL(`tel:${phone}`).catch(() => {
        Alert.alert('Error', 'Unable to initiate phone call on this device.');
      });
    } else {
      Alert.alert(
        'Phone Unavailable',
        `No direct phone number is listed for ${restoName}. You can contact customer support for assistance.`
      );
    }
  };

  const handleDirections = () => {
    const rLat = Number(restaurant?.latitude || restaurant?.locationCoords?.latitude || 0);
    const rLon = Number(restaurant?.longitude || restaurant?.locationCoords?.longitude || 0);
    const query = encodeURIComponent(`${restoName}, ${restoArea}`);

    if (rLat && rLon) {
      const url = Platform.select({
        ios: `maps:0,0?q=${rLat},${rLon}`,
        android: `geo:0,0?q=${rLat},${rLon}(${encodeURIComponent(restoName)})`,
      }) || `https://www.google.com/maps/dir/?api=1&destination=${rLat},${rLon}`;

      Linking.openURL(url).catch(() => {
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${rLat},${rLon}`);
      });
    } else {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${query}`);
    }
  };

  const handleShareRestaurant = async () => {
    try {
      await Share.share({
        message: `Order from ${restaurant?.name || 'this store'} on Ride Hub!`,
      });
    } catch (e) {}
  };

  const handleShareDish = async (dish: any) => {
    try {
      await Share.share({
        message: `Order "${dish.name}" (₹${dish.price}) from ${restaurant?.name || 'our partner store'} on Ride Hub!`,
      });
    } catch (e) {}
  };

  const toggleCategoryCollapse = (catName: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [catName]: !prev[catName],
    }));
  };

  const toggleDescExpand = (dishId: string) => {
    setExpandedDescs((prev) => ({
      ...prev,
      [dishId]: !prev[dishId],
    }));
  };

  // 6. Canonical GPS Distance & Delivery Calculation (Exact shared formula)
  const canonicalLocation = useMemo(() => {
    return getCanonicalRestaurantLocation(restaurant || initialResto, customerCoords, 'RestaurantProfile');
  }, [restaurant, initialResto, customerCoords]);

  const realDistanceKm = canonicalLocation.distanceKm;
  const deliveryTimeStr = canonicalLocation.deliveryTimeText;

  // 7. Filter available items strictly (hide out of stock items from customer)
  const availableItems = useMemo(() => {
    return (menuItems || []).filter((i: any) => i.isAvailable !== false);
  }, [menuItems]);

  // Real distinct categories that actually have items in this store
  const distinctCategoriesWithCounts = useMemo(() => {
    const map = new Map<string, number>();
    (availableItems || []).forEach((item: any) => {
      const cat = (item?.category || 'Other').trim();
      if (cat) {
        map.set(cat, (map.get(cat) || 0) + 1);
      }
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [availableItems]);

  // Real search keywords dynamically collected from this restaurant's categories & items
  const searchKeywords = useMemo(() => {
    const list: string[] = [];

    // 1. Add unique real categories from DB
    (categories || []).forEach((c: any) => {
      const name = (typeof c === 'string' ? c : c?.name || '').trim();
      if (name && name.toLowerCase() !== 'all' && !list.includes(name)) {
        list.push(name);
      }
    });

    // 2. Add unique real dish names from DB
    (availableItems || []).forEach((item: any) => {
      const name = (item?.name || '').trim();
      if (name && !list.includes(name)) {
        list.push(name);
      }
    });

    return list.length > 0 ? list : (isRestaurant ? ['dishes', 'starters', 'combos'] : [terminology.itemsNoun.toLowerCase(), 'popular', 'featured']);
  }, [categories, availableItems, isRestaurant, terminology]);

  // Animated search placeholder cycling loop with smooth vertical slide-up transition
  useEffect(() => {
    if (isSearchActive || searchKeywords.length <= 1) return;

    let isMounted = true;
    let timer: any;

    const cycle = () => {
      timer = setTimeout(() => {
        if (!isMounted) return;

        // Current text slides UP and fades OUT
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.timing(translateYAnim, {
            toValue: -14,
            duration: 250,
            useNativeDriver: true,
          }),
        ]).start(() => {
          if (!isMounted) return;
          setCurrentWordIndex((prev) => (prev + 1) % searchKeywords.length);
          translateYAnim.setValue(14);
          fadeAnim.setValue(0);

          // Next text slides UP from bottom and fades IN
          Animated.parallel([
            Animated.timing(fadeAnim, {
              toValue: 1,
              duration: 250,
              useNativeDriver: true,
            }),
            Animated.timing(translateYAnim, {
              toValue: 0,
              duration: 250,
              useNativeDriver: true,
            }),
          ]).start(() => {
            if (isMounted) cycle();
          });
        });
      }, 2200);
    };

    cycle();

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [isSearchActive, searchKeywords.length]);

  // Hardware back press handler on Android to exit search mode
  useEffect(() => {
    const onBackPress = () => {
      if (isSearchActive) {
        setIsSearchActive(false);
        setSearchQuery('');
        Keyboard.dismiss();
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [isSearchActive]);

  // 8. Apply Search (ONLY within this restaurant) & Active Diet/Feature Filter
  const filteredDishes = useMemo(() => {
    let list = availableItems;

    // Search query within THIS restaurant ONLY
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (i) =>
          (i.name || '').toLowerCase().includes(q) ||
          (i.category || '').toLowerCase().includes(q) ||
          (i.description || '').toLowerCase().includes(q)
      );
    }

    // Specific filters
    if (activeFilter === 'VEG') {
      list = list.filter((i) => i.isVeg === true);
    } else if (activeFilter === 'NON_VEG') {
      list = list.filter((i) => i.isVeg === false);
    } else if (activeFilter === 'EGG') {
      list = list.filter((i) => {
        const str = `${i.name || ''} ${i.category || ''} ${i.description || ''}`.toLowerCase();
        return str.includes('egg') || str.includes('anda') || str.includes('omelet');
      });
    } else if (activeFilter === 'HIGHLY_ORDERED') {
      // Top items by popularity or price
      list = [...list].sort((a, b) => (b.price || 0) - (a.price || 0));
    } else if (activeFilter === 'SPICY') {
      list = list.filter((i) => {
        const str = `${i.name || ''} ${i.description || ''}`.toLowerCase();
        return (
          str.includes('spic') ||
          str.includes('chilli') ||
          str.includes('chili') ||
          str.includes('hot') ||
          str.includes('masala') ||
          str.includes('tadka') ||
          str.includes('achari')
        );
      });
    } else if (activeFilter === 'KIDS_CHOICE') {
      list = list.filter((i) => {
        const str = `${i.name || ''} ${i.category || ''}`.toLowerCase();
        return (
          i.isVeg &&
          (str.includes('cheese') ||
            str.includes('paneer') ||
            str.includes('pizza') ||
            str.includes('shake') ||
            str.includes('sweet') ||
            str.includes('fries') ||
            str.includes('pasta') ||
            str.includes('maggi') ||
            str.includes('ice cream'))
        );
      });
    }

    // Category filter if a category chip is selected
    if (selectedCategory !== 'All') {
      list = list.filter(
        (i) => (i.category || '').trim().toLowerCase() === selectedCategory.trim().toLowerCase()
      );
    }

    console.log('🔴 [DEBUG_DISHES]', {
      selectedCategory,
      activeFilter,
      searchQuery,
      availableItemsCount: availableItems.length,
      filteredDishesCount: list.length,
      dishesTitles: list.map(d => d.name)
    });

    return list;
  }, [availableItems, searchQuery, activeFilter, selectedCategory]);

  // 9. Group filtered dishes by REAL categories from DB
  const categorySections = useMemo(() => {
    if (selectedCategory === 'All' && !searchQuery.trim() && activeFilter === 'ALL') {
      return {
        'All Products': filteredDishes,
      };
    }

    if (selectedCategory !== 'All') {
      return {
        [selectedCategory]: filteredDishes,
      };
    }

    const groups: { [key: string]: any[] } = {};
    filteredDishes.forEach((dish) => {
      const cat = (dish.category || 'Other').trim();
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(dish);
    });

    return groups;
  }, [filteredDishes, selectedCategory, searchQuery, activeFilter]);

  // Cart summary
  const cartItemCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const cartTotalPrice = Object.entries(cart).reduce((total, [itemId, qty]) => {
    const dish = menuItems.find((i) => (i._id || i.id) === itemId);
    return total + (dish ? (dish.price || 0) * qty : 0);
  }, 0);

  // Floating Cart Banner Animation (Slide up/down + Fade in/out + Spring + Scroll auto-hide)
  const cartAnim = useRef(new Animated.Value(cartItemCount > 0 ? 1 : 0)).current;
  const [cartBannerVisible, setCartBannerVisible] = useState<boolean>(cartItemCount > 0);
  const isBannerVisibleRef = useRef<boolean>(cartItemCount > 0);
  const lastScrollY = useRef<number>(0);
  const isScrollingDown = useRef<boolean>(false);

  const showCartBanner = () => {
    if (cartItemCount === 0) return;
    if (isBannerVisibleRef.current) return;
    isBannerVisibleRef.current = true;
    setCartBannerVisible(true);
    Animated.spring(cartAnim, {
      toValue: 1,
      tension: 65,
      friction: 9,
      useNativeDriver: true,
    }).start();
  };

  const hideCartBanner = () => {
    if (!isBannerVisibleRef.current) return;
    isBannerVisibleRef.current = false;
    Animated.timing(cartAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      if (cartItemCount === 0) {
        setCartBannerVisible(false);
      }
    });
  };

  useEffect(() => {
    if (cartItemCount > 0) {
      isScrollingDown.current = false;
      isBannerVisibleRef.current = true;
      setCartBannerVisible(true);
      Animated.spring(cartAnim, {
        toValue: 1,
        tension: 65,
        friction: 9,
        useNativeDriver: true,
      }).start();
    } else {
      isScrollingDown.current = false;
      isBannerVisibleRef.current = false;
      Animated.timing(cartAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(() => {
        setCartBannerVisible(false);
      });
    }
  }, [cartItemCount]);

  const handleScroll = (event: any) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const diff = currentY - lastScrollY.current;

    // Near the top of the menu
    if (currentY <= 15) {
      if (isScrollingDown.current) {
        isScrollingDown.current = false;
        showCartBanner();
      }
      lastScrollY.current = currentY;
      return;
    }

    // Ignore micro jitter
    if (Math.abs(diff) < 8) return;

    if (diff > 0 && currentY > 40) {
      // User is scrolling down into dishes (swipe up) -> Hide banner
      if (!isScrollingDown.current) {
        isScrollingDown.current = true;
        hideCartBanner();
      }
    } else if (diff < 0) {
      // User is scrolling up towards top (swipe down) -> Show banner
      if (isScrollingDown.current) {
        isScrollingDown.current = false;
        showCartBanner();
      }
    }

    lastScrollY.current = currentY;
  };

  const bannerTranslateY = cartAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [110, 0],
  });

  const bannerOpacity = cartAnim.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0, 0.7, 1],
  });

  const bannerScale = cartAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.93, 1],
  });

  const menuPillTranslateY = cartAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -68],
  });

  // Restaurant details from DB
  const restoName = (restaurant?.name || restaurant?.restaurantName || initialResto?.name || initialResto?.restaurantName || restaurant?.username || 'Restaurant Partner').trim();
  const restoArea = canonicalLocation.locality || canonicalLocation.address || 'Store Location';
  const hasRating = (reviewsStats.totalReviews > 0) || (restaurant?.rating && !isNaN(Number(restaurant.rating)) && Number(restaurant.rating) > 0);
  const realRating = reviewsStats.totalReviews > 0
    ? reviewsStats.averageRating.toFixed(1)
    : (restaurant?.rating && !isNaN(Number(restaurant.rating)) && Number(restaurant.rating) > 0 ? Number(restaurant.rating).toFixed(1) : 'New');
  const reviewsCount = reviewsStats.totalReviews !== undefined && reviewsStats.totalReviews > 0
    ? reviewsStats.totalReviews
    : (restaurant?.reviewsCount || restaurant?.ratingsCount || 0);
  const realReviewsText = reviewsCount > 0 ? `By ${reviewsCount}+` : '0 reviews';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden={false} barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={isDark ? currentColors.surface : "#FFFFFF"} />

      {/* ============================================================ */}
      {/* 1. TOP HEADER: Back + Store Name + Share & Info */}
      {/* ============================================================ */}
      <View style={styles.topHeaderBar}>
        <TouchableOpacity
          style={styles.circleBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Icon name="arrow-back" size={20} color={isDark ? currentColors.text : "#0F172A"} />
        </TouchableOpacity>

        <View style={{ flex: 1, paddingHorizontal: 12 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: currentColors.text }} numberOfLines={1}>
            {restoName}
          </Text>
          <Text style={{ fontSize: 12, color: currentColors.secondaryText, marginTop: 1 }} numberOfLines={1}>
            {(storeCatRaw || (isRestaurant ? 'Restaurant' : 'Store'))} • {restoArea}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.circleBtn}
          onPress={handleShareRestaurant}
          activeOpacity={0.7}
        >
          <Icon name="share" size={18} color="#0F172A" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.circleBtn, { marginLeft: 6 }]}
          onPress={() =>
            navigation.navigate('RestaurantDetails', {
              restaurantId: rId,
              restaurant,
              customerCoords,
            })
          }
          activeOpacity={0.7}
        >
          <Icon name="information-circle" size={18} color="#0F172A" />
        </TouchableOpacity>
      </View>

      {/* ============================================================ */}
      {/* 2. FIXED RESTAURANT HEADER (Store Photo + Details + Search + Categories) */}
      {/* ============================================================ */}
      <View style={styles.fixedRestaurantHeaderWrap}>
        <View style={styles.restaurantHeaderWrap}>
          {/* DYNAMIC TOP BANNER: Priority #1 = Supplier Uploaded Lottie Animation; Fallback = Store Real Image */}
          {(() => {
            const hasLottie = Boolean(
              restaurant?.supplierLottieAnimation?.isActive !== false &&
              (restaurant?.supplierLottieAnimation?.url || restaurant?.supplierLottieAnimation?.rawJson)
            );

            if (hasLottie) {
              const lottieSrc = restaurant?.supplierLottieAnimation?.rawJson || restaurant?.supplierLottieAnimation?.url;
              return (
                <View style={{
                  width: '100%',
                  height: 220, // Frame enlarged downward (from 190px to 220px)
                  backgroundColor: isDark ? '#1E293B' : '#0F172A',
                  marginBottom: 10,
                  borderRadius: 14,
                  overflow: 'hidden',
                  elevation: 3,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.15,
                  shadowRadius: 4,
                }}>
                  {/* Natural unzoomed Lottie filling the enlarged frame cleanly */}
                  <LottieAnimation
                    source={lottieSrc}
                    width="100%"
                    height="100%"
                    speed={1.5}
                    loop={true}
                    autoplay={true}
                    preserveAspectRatio="xMidYMid meet"
                    style={{ width: '100%', height: '100%' }}
                  />
                </View>
              );
            }

            const rawCandidate =
              restaurant?.profilePicture ||
              restaurant?.coverImage ||
              restaurant?.image ||
              restaurant?.rawUser?.profilePicture ||
              restaurant?.rawUser?.coverImage ||
              restaurant?.rawUser?.image ||
              (Array.isArray(restaurant?.images) && restaurant.images[0]) ||
              null;

            const storeImg = (rawCandidate && typeof rawCandidate === 'string' && !rawCandidate.startsWith('data:image'))
              ? rawCandidate
              : null;

            if (storeImg) {
              const resolvedUri = resolveUploadUrl(storeImg);
              return (
                <View style={{ width: '100%', height: 135, backgroundColor: '#0F172A', marginBottom: 10, borderRadius: 14, overflow: 'hidden', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4 }}>
                  <Image
                    source={{ uri: resolvedUri }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                </View>
              );
            }
            return null;
          })()}
          <View style={styles.restoTitleAndRatingRow}>
            {/* Restaurant Name + Info (i) */}
            <TouchableOpacity
              style={styles.nameWithInfoWrap}
              onPress={() =>
                navigation.navigate('RestaurantDetails', {
                  restaurantId: rId,
                  restaurant,
                  customerCoords,
                })
              }
              activeOpacity={0.8}
            >
              <Text style={styles.restaurantTitle} numberOfLines={1}>
                {restoName}
              </Text>
              <View style={styles.infoBadgeBtn}>
                <Icon name="information-circle" size={17} color="#0066FF" />
              </View>
            </TouchableOpacity>
          </View>

          {/* REAL GPS DISTANCE & LOCALITY */}
          <View style={styles.subDetailRow}>
            <Icon name="location-outline" size={14} color="#64748B" style={{ marginRight: 6 }} />
            <Text style={styles.subDetailText}>
              {realDistanceKm !== null ? `${realDistanceKm} km · ` : ''}
              <Text style={styles.subDetailBold}>{restoArea}</Text>
            </Text>
          </View>

          {/* ESTIMATED DELIVERY TIME */}
          <View style={styles.subDetailRow}>
            <Icon name="clock-outline" size={14} color="#64748B" style={{ marginRight: 6 }} />
            <Text style={styles.subDetailText}>
              {deliveryTimeStr} · <Text style={styles.scheduleText}>Schedule for later ⌄</Text>
            </Text>
          </View>

          {/* NO PACKAGING CHARGES / REAL PERK BADGE */}
          <View style={styles.perkBadgeRow}>
            <View style={styles.noPackagingBadge}>
              <Icon name="checkmark" size={13} color="#16A34A" />
              <Text style={styles.noPackagingText}>No packaging charges</Text>
            </View>
          </View>

          {/* OFFLINE STATUS NOTICE BANNER */}
          {isOffline && (
            <View style={{
              backgroundColor: '#FEF2F2',
              borderRadius: 8,
              paddingVertical: 8,
              paddingHorizontal: 12,
              marginTop: 10,
              flexDirection: 'row',
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#FECACA'
            }}>
              <Text style={{ fontSize: 13, color: '#DC2626', fontWeight: '600' }}>
                🔴 Currently Closed / Offline · Browsing menu only
              </Text>
            </View>
          )}

          {/* RESTAURANT OFFER BANNER */}
          {false && (
          <TouchableOpacity
            style={styles.offerBannerRow}
            onPress={() => Alert.alert('Offers', `Flat 40% OFF up to ₹120 on orders above ₹99 at ${restoName}!`)}
            activeOpacity={0.8}
          >
            <View style={styles.offerBannerLeft}>
              <Icon name="gift" size={15} color="#0066FF" />
              <Text style={styles.offerBannerTitle}>40% OFF up to ₹120 above ₹99</Text>
            </View>
            <Text style={styles.offerChevronAction}>5 offers ⌄</Text>
          </TouchableOpacity>
          )}

          {/* QUICK ACTION BUTTONS: CALL, DIRECTIONS, SHARE, INFO */}
          <View style={styles.headerQuickActionsRow}>
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={handleCallRestaurant}
              activeOpacity={0.8}
            >
              <Icon name="call" size={16} color="#0066FF" />
              <Text style={styles.headerActionText}>Call</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={handleDirections}
              activeOpacity={0.8}
            >
              <Icon name="direction" size={16} color="#0066FF" />
              <Text style={styles.headerActionText}>Directions</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={handleShareRestaurant}
              activeOpacity={0.8}
            >
              <Icon name="share" size={16} color="#0066FF" />
              <Text style={styles.headerActionText}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => setInfoModalVisible(true)}
              activeOpacity={0.8}
            >
              <Icon name="information-circle" size={16} color="#0066FF" />
              <Text style={styles.headerActionText}>Info</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ============================================================ */}
        {/* 4. IN-MENU DEDICATED SEARCH BAR */}
        {/* ============================================================ */}
        <View style={styles.inMenuSearchBarContainer}>
          <View style={styles.inMenuSearchBarInner}>
            <Icon name="search" size={17} color="#64748B" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.inMenuSearchTextInput}
              placeholder={`Search dishes or items in ${restoName}...`}
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                if (text.trim().length > 0) {
                  setIsSearchActive(true);
                }
              }}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                style={{ padding: 6 }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon name="close" size={15} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ============================================================ */}
        {/* 5. FILTER BAR (Horizontal Scrollable: Categories, All, Specific Categories, Diet/Popular) */}
        {/* ============================================================ */}
        <View style={styles.filtersBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterBarScroll}
          >
            {/* Categories Modal Button */}
            <TouchableOpacity
              style={[styles.chip, activeFilter !== 'ALL' && styles.chipSelected]}
              onPress={() => setMenuModalVisible(true)}
              activeOpacity={0.7}
            >
              <Icon
                name="filter-variant"
                size={14}
                color={activeFilter !== 'ALL' ? '#0066FF' : '#475569'}
              />
              <Text style={[styles.chipLabel, activeFilter !== 'ALL' && styles.chipLabelSelected]}>
                Categories
              </Text>
              <Icon name="chevron-down" size={12} color="#64748B" />
            </TouchableOpacity>

            {/* All Products Chip */}
            <TouchableOpacity
              style={[styles.chip, selectedCategory === 'All' && styles.chipSelected]}
              onPress={() => {
                setSelectedCategory('All');
                setActiveFilter('ALL');
                setSearchQuery('');
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipLabel, selectedCategory === 'All' && styles.chipLabelSelected]}>
                All ({availableItems.length})
              </Text>
            </TouchableOpacity>

            {/* Dynamic Real Category Chips with Counts */}
            {distinctCategoriesWithCounts.map((catObj) => {
              const isSel = selectedCategory.trim().toLowerCase() === catObj.name.trim().toLowerCase();
              return (
                <TouchableOpacity
                  key={catObj.name}
                  style={[styles.chip, isSel && styles.chipSelected]}
                  onPress={() => {
                    setSelectedCategory(isSel ? 'All' : catObj.name);
                    setActiveFilter('ALL');
                    setSearchQuery('');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipLabel, isSel && styles.chipLabelSelected]}>
                    {catObj.name} ({catObj.count})
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* Highly Ordered / Popular Filter */}
            <TouchableOpacity
              style={[styles.chip, activeFilter === 'HIGHLY_ORDERED' && styles.chipSelected]}
              onPress={() => setActiveFilter((prev) => (prev === 'HIGHLY_ORDERED' ? 'ALL' : 'HIGHLY_ORDERED'))}
              activeOpacity={0.7}
            >
              <Icon
                name="star"
                size={14}
                color={activeFilter === 'HIGHLY_ORDERED' ? '#0066FF' : '#F59E0B'}
              />
              <Text style={[styles.chipLabel, activeFilter === 'HIGHLY_ORDERED' && styles.chipLabelSelected]}>
                {isRestaurant ? 'Highly Ordered' : 'Popular Items'}
              </Text>
            </TouchableOpacity>

            {/* Diet & Food Filters — STRICTLY ONLY for Restaurant Partner Type */}
            {isRestaurant && (
              <>
                {/* Veg Filter */}
                <TouchableOpacity
                  style={[styles.chip, activeFilter === 'VEG' && styles.chipActiveVeg]}
                  onPress={() => setActiveFilter((prev) => (prev === 'VEG' ? 'ALL' : 'VEG'))}
                  activeOpacity={0.7}
                >
                  <View style={styles.vegSquare}>
                    <View style={styles.vegDot} />
                  </View>
                  <Text style={[styles.chipLabel, activeFilter === 'VEG' && styles.chipLabelVeg]}>
                    Veg
                  </Text>
                </TouchableOpacity>

                {/* Non-Veg Filter */}
                <TouchableOpacity
                  style={[styles.chip, activeFilter === 'NON_VEG' && styles.chipActiveNonVeg]}
                  onPress={() => setActiveFilter((prev) => (prev === 'NON_VEG' ? 'ALL' : 'NON_VEG'))}
                  activeOpacity={0.7}
                >
                  <View style={styles.nonVegSquare}>
                    <Text style={styles.nonVegTriangle}>▲</Text>
                  </View>
                  <Text style={[styles.chipLabel, activeFilter === 'NON_VEG' && styles.chipLabelNonVeg]}>
                    Non-veg
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </View>

      {/* ============================================================ */}
      {/* 6. INDEPENDENT ITEMS SCROLL CONTAINER (SCROLLS SEPARATELY) */}
      {/* ============================================================ */}
      <ScrollView
        showsVerticalScrollIndicator={true}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingBottom: cartItemCount > 0 ? 170 : 90,
          flexGrow: 1,
        }}
        removeClippedSubviews={false}
        nestedScrollEnabled={true}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >

        {/* ============================================================ */}
        {/* 6. REAL MENU LIST GROUPED BY APPROVED DB CATEGORIES */}
        {/* ============================================================ */}
        {loadingMenu && menuItems.length === 0 ? (
          /* Lightweight Skeleton for First Visit — NO Infinite Loader */
          <View style={styles.skeletonContainer}>
            {[1, 2, 3].map((k) => (
              <View key={k} style={styles.skeletonCard}>
                <View style={styles.skeletonLeft}>
                  <View style={styles.skeletonLineBadge} />
                  <View style={styles.skeletonLineTitle} />
                  <View style={styles.skeletonLinePrice} />
                  <View style={styles.skeletonLineDesc} />
                </View>
                <View style={styles.skeletonImg} />
              </View>
            ))}
          </View>
        ) : Object.keys(categorySections).length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>{isRestaurant ? '🍲' : (terminology.menuNavIcon || '📦')}</Text>
            <Text style={styles.emptyHeader}>{isRestaurant ? 'No dishes found' : `No ${terminology.itemsNoun.toLowerCase()} found`}</Text>
            <Text style={styles.emptySubtext}>
              {searchQuery
                ? `No ${isRestaurant ? 'dishes' : terminology.itemsNoun.toLowerCase()} in ${restoName} match "${searchQuery}".`
                : `No ${isRestaurant ? 'food items' : terminology.itemsNoun.toLowerCase()} are currently available for the selected filter.`}
            </Text>
            {activeFilter !== 'ALL' || searchQuery.trim() ? (
              <TouchableOpacity
                style={styles.clearFilterBtn}
                onPress={() => {
                  setActiveFilter('ALL');
                  setSearchQuery('');
                  setSelectedCategory('All');
                }}
              >
                <Text style={styles.clearFilterBtnText}>Reset Filters</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.clearFilterBtn} onPress={() => fetchRestaurantMenu(true)}>
                <Text style={styles.clearFilterBtnText}>🔄 {isRestaurant ? 'Refresh Menu' : `Refresh ${terminology.itemsNoun}`}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          Object.entries(categorySections).map(([catTitle, dishes]) => {
            const isCollapsed = collapsedCategories[catTitle];

            return (
              <View key={catTitle} style={styles.categoryBlock}>
                {/* Category Section Header with Toggle Chevron */}
                <TouchableOpacity
                  style={styles.categoryHeaderRow}
                  onPress={() => toggleCategoryCollapse(catTitle)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.categoryHeaderText}>
                    {catTitle} ({dishes.length})
                  </Text>
                  <Icon
                    name={isCollapsed ? 'chevron-down' : 'chevron-forward'}
                    size={16}
                    color="#64748B"
                  />
                </TouchableOpacity>

                {/* Dishes inside this Category */}
                {!isCollapsed &&
                  dishes.map((dish, index) => {
                    const dishId = dish._id || dish.id;
                    const qty = cart[dishId] || 0;
                    const isSaved = Boolean(bookmarkedItems[dishId]);
                    const isDescExpanded = Boolean(expandedDescs[dishId]);

                    const rawImg =
                      dish.image && typeof dish.image === 'string' && dish.image.trim()
                        ? dish.image
                        : (Array.isArray(dish.images) && dish.images[0]) || null;
                    const dishImgUri =
                      rawImg && !failedDishImages[dishId]
                        ? rawImg.startsWith('http') || rawImg.startsWith('data:')
                          ? rawImg
                          : `${UPLOADS_URL}${rawImg.replace('/uploads', '')}`
                        : null;

                    const desc = dish.description || '';
                    const shouldTruncate = desc.length > 85;
                    const displayDesc =
                      shouldTruncate && !isDescExpanded ? `${desc.slice(0, 85)}...` : desc;

                    const isSpicy =
                      (dish.name || '').toLowerCase().includes('spic') ||
                      (dish.name || '').toLowerCase().includes('achari') ||
                      (dish.name || '').toLowerCase().includes('chilli');

                    return (
                      <View key={dishId ? `${dishId}_${index}` : `dish_${index}`}>
                        <View style={styles.dishRow}>
                          {/* ======================================== */}
                          {/* 7. LEFT: DISH DETAILS */}
                          {/* ======================================== */}
                          <TouchableOpacity
                            style={styles.dishDetailsLeft}
                            activeOpacity={0.8}
                            onPress={() =>
                              navigation.navigate('ItemDetailsScreen', {
                                item: dish,
                                restaurant,
                                restaurantId: rId,
                                customerCoords,
                              })
                            }
                          >
                            {/* Veg / Non-Veg Indicator for Restaurant */}
                            {isRestaurant && (
                              <View style={styles.foodTypeIndicatorRow}>
                                {dish.isVeg ? (
                                  <View style={styles.vegSquare}>
                                    <View style={styles.vegDot} />
                                  </View>
                                ) : (
                                  <View style={styles.nonVegSquare}>
                                    <Text style={styles.nonVegTriangle}>▲</Text>
                                  </View>
                                )}
                                {isSpicy && <Text style={styles.spicyGlyph}>🌶️</Text>}
                              </View>
                            )}

                            {/* Item Name */}
                            <Text style={styles.dishTitleText}>{dish.name}</Text>

                            {/* Price and MRP */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                              <Text style={styles.dishPriceText}>₹{dish.price}</Text>
                              {dish.mrp && Number(dish.mrp) > Number(dish.price) && (
                                <Text style={{ fontSize: 13, color: '#94A3B8', textDecorationLine: 'line-through', marginLeft: 8 }}>
                                  ₹{dish.mrp}
                                </Text>
                              )}
                            </View>

                            {/* Dish Rating & Review */}
                            {dish.rating && Number(dish.rating) > 0 && reviewsStats.totalReviews > 0 ? (
                              <TouchableOpacity
                                style={styles.dishRatingReviewRow}
                                onPress={handleOpenReviews}
                                activeOpacity={0.75}
                              >
                                <View style={styles.dishStarBox}>
                                  <Text style={styles.dishStarBoxGlyph}>★</Text>
                                  <Text style={styles.dishStarBoxScore}>
                                    {Number(dish.rating).toFixed(1)}
                                  </Text>
                                </View>
                                <Text style={styles.dishReviewCountLabel}>
                                  ({reviewsStats.totalReviews} reviews)
                                </Text>
                              </TouchableOpacity>
                            ) : null}

                            {/* Description with ...more */}
                            {desc ? (
                              <Text style={styles.dishDescriptionText}>
                                {displayDesc}
                                {shouldTruncate && (
                                  <Text
                                    style={styles.moreExpandText}
                                    onPress={() => toggleDescExpand(dishId)}
                                  >
                                    {isDescExpanded ? ' less' : 'more'}
                                  </Text>
                                )}
                              </Text>
                            ) : null}

                            {/* Action Buttons: Bookmark & Share */}
                            <View style={styles.dishActionsRow}>
                              <TouchableOpacity
                                style={styles.actionSquareBtn}
                                onPress={() => toggleBookmark(dishId, dish.name)}
                                activeOpacity={0.7}
                              >
                                <Icon
                                  name={isSaved ? 'heart' : 'heart-outline'}
                                  size={16}
                                  color={isSaved ? '#EF4444' : '#64748B'}
                                />
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={styles.actionSquareBtn}
                                onPress={() => handleShareDish(dish)}
                                activeOpacity={0.7}
                              >
                                <Icon name="share" size={15} color="#64748B" />
                              </TouchableOpacity>
                            </View>
                          </TouchableOpacity>

                          {/* ======================================== */}
                          {/* 8. RIGHT: PRODUCT / ITEM IMAGE + ADD BTN */}
                          {/* ======================================== */}
                          <View style={styles.dishImageRight}>
                            <TouchableOpacity
                              activeOpacity={0.85}
                              onPress={() =>
                                navigation.navigate('ItemDetailsScreen', {
                                  item: dish,
                                  restaurant,
                                  restaurantId: rId,
                                  customerCoords,
                                })
                              }
                              style={{ width: 128, height: 122 }}
                            >
                              {dishImgUri ? (
                                <Image
                                  source={{ uri: dishImgUri }}
                                  style={styles.dishSquareImage}
                                  resizeMode="cover"
                                  onError={() =>
                                    setFailedDishImages((prev) => ({ ...prev, [dishId]: true }))
                                  }
                                />
                              ) : (
                                <View style={styles.noDishImageSquare}>
                                  <Text style={{ fontSize: 28 }}>
                                    {getCategoryIcon(dish.category || storeCatRaw)}
                                  </Text>
                                  <Text style={styles.noDishCategoryLabel} numberOfLines={1}>
                                    {dish.category || terminology.itemNoun || 'Item'}
                                  </Text>
                                </View>
                              )}
                            </TouchableOpacity>

                            {/* ADD / Quantity Stepper Button */}
                            <View style={styles.addBtnWrap}>
                              {qty > 0 ? (
                                <View style={styles.stepperButtonPill}>
                                  <TouchableOpacity
                                    onPress={() => updateCart(dishId, -1)}
                                    style={{ paddingHorizontal: 8, paddingVertical: 5 }}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                  >
                                    <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' }}>−</Text>
                                  </TouchableOpacity>
                                  <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 'bold', marginHorizontal: 6 }}>
                                    {qty}
                                  </Text>
                                  <TouchableOpacity
                                    onPress={() => updateCart(dishId, 1)}
                                    style={{ paddingHorizontal: 8, paddingVertical: 5 }}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                  >
                                    <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' }}>+</Text>
                                  </TouchableOpacity>
                                </View>
                              ) : (
                                <TouchableOpacity
                                  style={styles.addButtonPill}
                                  onPress={() => updateCart(dishId, 1)}
                                  activeOpacity={0.85}
                                >
                                  <Text style={styles.addButtonText}>ADD</Text>
                                  <Text style={styles.addButtonPlusGlyph}>+</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        </View>

                        {/* Dashed line divider between items */}
                        {index < dishes.length - 1 && <View style={styles.dashedDivider} />}
                      </View>
                    );
                  })}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ============================================================ */}
      {/* FLOATING BUTTON (Quick Category Selector - Synchronized Animation) */}
      {/* ============================================================ */}
      <AnimatedTouchable
        style={[
          styles.floatingMenuPill,
          {
            bottom: 24,
            transform: [{ translateY: menuPillTranslateY }],
          },
        ]}
        onPress={() => setMenuModalVisible(true)}
        activeOpacity={0.88}
      >
        <Text style={styles.floatingMenuCutlery}>{isRestaurant ? '🍴' : (terminology.menuNavIcon || '📦')}</Text>
        <Text style={styles.floatingMenuLabel}>{isRestaurant ? 'Menu' : terminology.menuNavLabel}</Text>
      </AnimatedTouchable>

      {/* ============================================================ */}
      {/* 9. FLOATING CART BANNER (Smooth Spring Transition & Floating Pill Design) */}
      {/* ============================================================ */}
      {cartBannerVisible ? (
        <Animated.View
          style={[
            styles.floatingCartBanner,
            {
              opacity: bannerOpacity,
              transform: [
                { translateY: bannerTranslateY },
                { scale: bannerScale },
              ],
            },
          ]}
        >
          {/* Left: Cart Badge & Details */}
          <View style={styles.floatingCartLeft}>
            <View style={styles.floatingCartBadge}>
              <Icon name="cart" size={17} color="#0066FF" />
              <View style={styles.floatingCartCountPill}>
                <Text style={styles.floatingCartCountNumber}>{cartItemCount}</Text>
              </View>
            </View>

            <View style={styles.floatingCartTextCol}>
              <Text style={styles.floatingCartLabel}>
                {cartItemCount} {cartItemCount === 1 ? 'ITEM' : 'ITEMS'} ADDED
              </Text>
              <Text style={styles.floatingCartPrice}>₹{cartTotalPrice}</Text>
            </View>
          </View>

          {/* Right: View Cart Action Button */}
          <TouchableOpacity
            style={styles.floatingCartActionBtn}
            onPress={() =>
              navigation.navigate('CartScreen', {
                restaurantId: rId,
                restaurant,
                cart,
                totalAmount: cartTotalPrice,
                customerCoords,
                categoryName: restaurant?.categoryName || restaurant?.businessCategoryName || restaurant?.partnerType || route.params?.categoryName || 'Food',
                isRaining: route.params?.isRaining !== undefined ? route.params.isRaining : false,
              })
            }
            activeOpacity={0.85}
          >
            <Text style={styles.floatingCartActionText}>View Cart</Text>
            <Text style={styles.floatingCartActionArrow}>➔</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : null}

      {/* ============================================================ */}
      {/* MODAL: CATEGORY LIST */}
      {/* ============================================================ */}
      <Modal visible={menuModalVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.menuSheet}>
            <View style={styles.sheetTopRow}>
              <Text style={styles.sheetTitle}>{isRestaurant ? '🍽️ Menu Categories' : `${terminology.menuNavIcon} ${terminology.categoriesLabel}`}</Text>
              <TouchableOpacity onPress={() => setMenuModalVisible(false)}>
                <Text style={styles.sheetCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
              <TouchableOpacity
                style={[styles.sheetCatRow, selectedCategory === 'All' && styles.sheetCatRowSelected]}
                onPress={() => {
                  setSelectedCategory('All');
                  setActiveFilter('ALL');
                  setSearchQuery('');
                  setMenuModalVisible(false);
                }}
              >
                <Text style={[styles.sheetCatName, selectedCategory === 'All' && styles.sheetCatNameSelected]}>
                  {isRestaurant ? 'All Dishes' : 'All Products'}
                </Text>
                <Text style={styles.sheetCatCount}>{availableItems.length}</Text>
              </TouchableOpacity>

              {distinctCategoriesWithCounts.map((catObj) => {
                const catName = catObj.name;
                const count = catObj.count;
                const isSel = selectedCategory.trim().toLowerCase() === catName.trim().toLowerCase();

                return (
                  <TouchableOpacity
                    key={catName}
                    style={[styles.sheetCatRow, isSel && styles.sheetCatRowSelected]}
                    onPress={() => {
                      setSelectedCategory(catName);
                      setActiveFilter('ALL');
                      setSearchQuery('');
                      setMenuModalVisible(false);
                    }}
                  >
                    <Text style={[styles.sheetCatName, isSel && styles.sheetCatNameSelected]}>
                      {catName}
                    </Text>
                    <Text style={styles.sheetCatCount}>{count}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ============================================================ */}
      {/* MODAL: RESTAURANT INFO / TIMINGS / RATING */}
      {/* ============================================================ */}
      <Modal visible={infoModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.infoDialog}>
            <View style={styles.sheetTopRow}>
              <Text style={styles.sheetTitle}>{terminology.menuNavIcon} {isRestaurant ? 'Restaurant Details' : `${terminology.storeTypeLabel} Details`}</Text>
              <TouchableOpacity onPress={() => setInfoModalVisible(false)}>
                <Text style={styles.sheetCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.dialogRestoName}>{restoName}</Text>
            <Text style={styles.dialogAddress}>📍 {restoArea}</Text>

            <View style={styles.dialogDataRow}>
              <Text style={styles.dialogLabel}>Status:</Text>
              <Text style={[styles.dialogVal, { color: isStoreOnline ? '#16A34A' : '#DC2626', fontWeight: 'bold' }]}>
                {isStoreOnline ? '🟢 Open Now' : '🔴 Closed'}
              </Text>
            </View>

            <View style={styles.dialogDataRow}>
              <Text style={styles.dialogLabel}>Rating:</Text>
              <Text style={styles.dialogVal}>
                ★ {realRating} {reviewsCount > 0 ? `(${reviewsCount}+ reviews)` : '(0 reviews)'}
              </Text>
            </View>

            <View style={styles.dialogDataRow}>
              <Text style={styles.dialogLabel}>GPS Distance:</Text>
              <Text style={styles.dialogVal}>
                {realDistanceKm !== null ? `${realDistanceKm} km` : 'Calculating...'}
              </Text>
            </View>

            <View style={styles.dialogDataRow}>
              <Text style={styles.dialogLabel}>Estimated Delivery:</Text>
              <Text style={styles.dialogVal}>{deliveryTimeStr}</Text>
            </View>

            <TouchableOpacity
              style={styles.dialogCloseAction}
              onPress={() => setInfoModalVisible(false)}
            >
              <Text style={styles.dialogCloseActionText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    
      {/* ============================================================ */}
      {/* ITEM DETAILS POPUP MODAL (Requirement 9 & 10) */}
      {/* ============================================================ */}
      <Modal
        visible={Boolean(selectedItemForDetails)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedItemForDetails(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, width: '100%', maxWidth: 360, overflow: 'hidden', elevation: 8 }}>
            {/* Item Image or Smooth 2-Second Video Player */}
            {(() => {
              const videoUri =
                selectedItemForDetails?.videoUrl ||
                selectedItemForDetails?.video ||
                selectedItemForDetails?.menuVideo ||
                restaurant?.menuVideo ||
                restaurant?.introVideo;

              if (showItemVideo && videoUri) {
                const finalVideoUrl = videoUri.startsWith('http') ? videoUri : `${UPLOADS_URL}${videoUri.replace('/uploads', '')}`;
                const posterUrl = selectedItemForDetails?.image
                  ? (selectedItemForDetails.image.startsWith('http')
                      ? selectedItemForDetails.image
                      : `${UPLOADS_URL}${selectedItemForDetails.image.replace('/uploads', '')}`)
                  : '';
                return (
                  <View style={{ width: '100%', height: 210, backgroundColor: '#000000', overflow: 'hidden' }}>
                    <WebView
                      source={{
                        html: `
                          <!DOCTYPE html>
                          <html>
                          <head>
                            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
                            <style>
                              * { margin:0; padding:0; box-sizing:border-box; }
                              html, body { width:100%; height:100%; background:#000; overflow:hidden; display:flex; align-items:center; justify-content:center; }
                              video { width:100%; height:100%; object-fit:cover; }
                            </style>
                          </head>
                          <body>
                            <video id="v" src="${finalVideoUrl}" autoplay loop muted playsinline webkit-playsinline preload="auto" ${posterUrl ? `poster="${posterUrl}"` : ''} style="width:100%;height:100%;object-fit:cover;"></video>
                            <script>
                              var v = document.getElementById('v');
                              if (v) {
                                v.play().catch(function(){});
                                v.addEventListener('loadeddata', function() { v.play().catch(function(){}); });
                                v.addEventListener('canplay', function() { v.play().catch(function(){}); });
                              }
                            </script>
                          </body>
                          </html>
                        `
                      }}
                      style={{ width: '100%', height: '100%', backgroundColor: '#000000' }}
                      containerStyle={{ backgroundColor: '#000000' }}
                      allowsInlineMediaPlayback={true}
                      mediaPlaybackRequiresUserAction={false}
                      javaScriptEnabled={true}
                      domStorageEnabled={true}
                      cacheEnabled={true}
                      androidHardwareAccelerationDisabled={false}
                      androidLayerType="hardware"
                      renderToHardwareTextureAndroid={true}
                    />
                    <View style={{ position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                      <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>🎬 Menu Video</Text>
                    </View>
                  </View>
                );
              }

              if (selectedItemForDetails?.image) {
                return (
                  <View style={{ width: '100%', height: 200, position: 'relative' }}>
                    <Image
                      source={{
                        uri: selectedItemForDetails.image.startsWith('http')
                          ? selectedItemForDetails.image
                          : `${UPLOADS_URL}${selectedItemForDetails.image.replace('/uploads', '')}`,
                      }}
                      style={{ width: '100%', height: 200 }}
                      resizeMode="cover"
                    />
                    {videoUri && (
                      <View style={{ position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,102,255,0.85)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                        <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>▶ Video loading...</Text>
                      </View>
                    )}
                  </View>
                );
              }

              return (
                <View style={{ width: '100%', height: 140, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 48 }}>🍲</Text>
                </View>
              );
            })()}

            <View style={{ padding: 18 }}>
              {/* Category & Refundable Pill Row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <View style={{ backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#0066FF' }}>
                    {selectedItemForDetails?.category || 'General'}
                  </Text>
                </View>

                {/* Refundable / Non-Refundable Badge */}
                <View style={{
                  backgroundColor: selectedItemForDetails?.isRefundable ? '#DCFCE7' : '#FEE2E2',
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 12,
                }}>
                  <Text style={{
                    fontSize: 12,
                    fontWeight: '800',
                    color: selectedItemForDetails?.isRefundable ? '#15803D' : '#DC2626',
                  }}>
                    {selectedItemForDetails?.isRefundable ? '✅ Refundable' : '❌ Non-Refundable'}
                  </Text>
                </View>
              </View>

              {Boolean(selectedItemForDetails?.refundPolicy) && (
                <View style={{ backgroundColor: '#F8FAFC', borderRadius: 8, padding: 8, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
                  <Text style={{ fontSize: 12, color: '#475569', fontStyle: 'italic' }}>
                    Policy: {selectedItemForDetails?.refundPolicy}
                  </Text>
                </View>
              )}

              {/* Item Name */}
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#1E293B', marginBottom: 6 }}>
                {selectedItemForDetails?.name}
              </Text>

              {/* Price */}
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 10 }}>
                ₹{selectedItemForDetails?.price}
              </Text>

              {/* Description */}
              <Text style={{ fontSize: 14, color: '#475569', lineHeight: 21, marginBottom: 16 }}>
                {selectedItemForDetails?.description && selectedItemForDetails.description.trim()
                  ? selectedItemForDetails.description.trim()
                  : 'Freshly prepared specialty dish crafted with authentic culinary recipes and premium quality ingredients.'}
              </Text>

              {/* Existing Add / Stepper Button */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                <TouchableOpacity
                  style={{ paddingVertical: 10, paddingHorizontal: 16 }}
                  onPress={() => setSelectedItemForDetails(null)}
                >
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#64748B' }}>Close</Text>
                </TouchableOpacity>

                {cart[selectedItemForDetails?._id || selectedItemForDetails?.id] ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#0066FF', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <TouchableOpacity
                      onPress={() => updateCart(selectedItemForDetails._id || selectedItemForDetails.id, -1)}
                      style={{ paddingHorizontal: 8 }}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' }}>−</Text>
                    </TouchableOpacity>
                    <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 'bold', marginHorizontal: 8 }}>
                      {cart[selectedItemForDetails._id || selectedItemForDetails.id]}
                    </Text>
                    <TouchableOpacity
                      onPress={() => updateCart(selectedItemForDetails._id || selectedItemForDetails.id, 1)}
                      style={{ paddingHorizontal: 8 }}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' }}>+</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={{ backgroundColor: '#0066FF', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 }}
                    onPress={() => {
                      updateCart(selectedItemForDetails._id || selectedItemForDetails.id, 1);
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800' }}>+ ADD TO CART</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>
      </Modal>


      {/* ============================================================ */}
      {/* MODAL: RESTAURANT REVIEWS & RATINGS (Full Screen)             */}
      {/* ============================================================ */}
      <Modal
        visible={reviewsModalVisible}
        animationType="slide"
        onRequestClose={() => setReviewsModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
          <StatusBar backgroundColor="#0066FF" barStyle="light-content" />

          {/* Full-Screen Header */}
          <View
            style={{
              backgroundColor: '#0066FF',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 16,
              paddingBottom: 14,
              borderBottomLeftRadius: 18,
              borderBottomRightRadius: 18,
              elevation: 6,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.15,
              shadowRadius: 5,
            }}
          >
            <TouchableOpacity
              onPress={() => setReviewsModalVisible(false)}
              activeOpacity={0.8}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: 'rgba(255, 255, 255, 0.22)',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.35)',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' }}>←</Text>
            </TouchableOpacity>

            <View style={{ flex: 1, marginHorizontal: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFFFFF' }}>
                Customer Ratings & Reviews
              </Text>
              <Text style={{ fontSize: 12, color: '#E0EDFF', marginTop: 2, fontWeight: '600' }} numberOfLines={1}>
                {restoName} • {reviewsStats.averageRating.toFixed(1)} ★ ({reviewsStats.totalReviews} ratings)
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => setReviewsModalVisible(false)}
              activeOpacity={0.8}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 14,
                backgroundColor: 'rgba(255, 255, 255, 0.25)',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800' }}>Done</Text>
            </TouchableOpacity>
          </View>

          {reviewsLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
              <ActivityIndicator size="large" color="#0066FF" />
              <Text style={{ marginTop: 12, color: '#64748B', fontSize: 14, fontWeight: '600' }}>
                Loading verified reviews...
              </Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
              {/* Overall Score Card */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#FFFFFF',
                  marginHorizontal: 16,
                  marginTop: 16,
                  borderRadius: 18,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  elevation: 3,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.08,
                  shadowRadius: 6,
                }}
              >
                <View style={{ alignItems: 'center', justifyContent: 'center', paddingRight: 16, minWidth: 110 }}>
                  <Text style={{ fontSize: 40, fontWeight: '900', color: '#0F172A', lineHeight: 46 }}>
                    {reviewsStats.averageRating.toFixed(1)}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#F59E0B', fontWeight: '800', marginVertical: 3 }}>
                    ★★★★★
                  </Text>
                  <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600', textAlign: 'center' }}>
                    {reviewsStats.totalReviews > 0 ? `${reviewsStats.totalReviews} verified orders` : 'Verified store'}
                  </Text>
                </View>

                <View style={{ width: 1, height: '80%', backgroundColor: '#E2E8F0', marginRight: 14 }} />

                <View style={{ flex: 1, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#1E293B' }}>
                    100% Genuine Ratings
                  </Text>
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 4, lineHeight: 17 }}>
                    Real ratings and feedback submitted by authenticated customers after delivery.
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: '#DCFCE7',
                      alignSelf: 'flex-start',
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 8,
                      marginTop: 8,
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#15803D' }}>
                      ✓ Verified Supplier
                    </Text>
                  </View>
                </View>
              </View>

              {/* Reviews List Header */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 16,
                  marginTop: 20,
                  marginBottom: 8,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }}>
                  Customer Reviews ({reviewsList.length})
                </Text>
              </View>

              {reviewsList.length === 0 ? (
                <View
                  style={{
                    backgroundColor: '#FFFFFF',
                    marginHorizontal: 16,
                    marginTop: 10,
                    borderRadius: 18,
                    padding: 30,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                  }}
                >
                  <Text style={{ fontSize: 44, marginBottom: 8 }}>⭐</Text>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: '#1E293B' }}>
                    No Written Reviews Yet
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: '#64748B',
                      textAlign: 'center',
                      marginTop: 6,
                      lineHeight: 18,
                    }}
                  >
                    Be the first customer to order and review dishes from {restoName}!
                  </Text>
                </View>
              ) : (
                reviewsList.map((rev: any, idx: number) => {
                  const revImg = rev.image || (Array.isArray(rev.photos) && rev.photos[0]) || '';
                  const revImgUri = revImg
                    ? revImg.startsWith('http')
                      ? revImg
                      : `${UPLOADS_URL}${revImg.replace('/uploads', '')}`
                    : null;
                  const revText =
                    rev.comment || rev.restaurantFeedback || rev.reviewText || rev.feedback || '';
                  const cName = rev.customerName || rev.userName || 'Verified Buyer';

                  return (
                    <View
                      key={rev._id || idx}
                      style={{
                        backgroundColor: '#FFFFFF',
                        marginHorizontal: 16,
                        marginTop: 10,
                        borderRadius: 16,
                        padding: 16,
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                        elevation: 2,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.05,
                        shadowRadius: 3,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 8,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <View
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 18,
                              backgroundColor: '#0066FF',
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginRight: 10,
                            }}
                          >
                            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }}>
                              {cName.slice(0, 1).toUpperCase()}
                            </Text>
                          </View>
                          <View>
                            <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A' }}>
                              {cName}
                            </Text>
                            <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>
                              {rev.createdAt
                                ? new Date(rev.createdAt).toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })
                                : 'Recent Order'}
                            </Text>
                          </View>
                        </View>

                        <View
                          style={{
                            backgroundColor: '#15803D',
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 6,
                          }}
                        >
                          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>
                            ★ {rev.restaurantRating || rev.rating || 5}.0
                          </Text>
                        </View>
                      </View>

                      {Boolean(revText) && (
                        <Text style={{ fontSize: 13.5, color: '#334155', lineHeight: 20, marginTop: 4 }}>
                          {revText}
                        </Text>
                      )}

                      {Boolean(revImgUri) && (
                        <TouchableOpacity
                          activeOpacity={0.9}
                          style={{
                            marginTop: 10,
                            borderRadius: 12,
                            overflow: 'hidden',
                            backgroundColor: '#F8FAFC',
                            borderWidth: 1,
                            borderColor: '#E2E8F0',
                            height: 180,
                          }}
                          onPress={() => Alert.alert('Customer Photo', `Uploaded by ${cName}`)}
                        >
                          <Image
                            source={{ uri: revImgUri! }}
                            style={{ width: '100%', height: '100%' }}
                            resizeMode="cover"
                          />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
};

export default RestaurantProfileScreen;

const getStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  /* TOP HEADER */
  topHeaderBar: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: isDark ? colors.border : '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? colors.elevatedSurface : '#FFFFFF',
  },
  backChevronText: {
    fontSize: 24,
    color: colors.text,
    fontWeight: '600',
    marginTop: -3,
  },
  topHeaderRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  searchBarWrapper: {
    flex: 1,
    height: 40,
    backgroundColor: colors.inputBackground,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchFixedIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  animatedTextClipContainer: {
    flex: 1,
    height: 22,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  animatedPlaceholderText: {
    fontSize: 13.5,
    color: colors.secondaryText,
    fontWeight: '500',
  },
  searchRealInput: {
    flex: 1,
    fontSize: 13.5,
    color: colors.text,
    paddingVertical: 0,
    height: 38,
  },
  clearSearchCrossBtn: {
    padding: 4,
    marginLeft: 4,
  },
  clearSearchCrossText: {
    fontSize: 13,
    color: colors.secondaryText,
    fontWeight: 'bold',
  },
  cancelTextBtn: {
    paddingHorizontal: 6,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelTextLabel: {
    fontSize: 13.5,
    color: '#0066FF',
    fontWeight: '700',
  },
  headerEmojiIcon: {
    fontSize: 15,
    color: colors.text,
  },

  /* RESTAURANT HEADER SECTION */
  fixedRestaurantHeaderWrap: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    zIndex: 10,
  },
  restaurantHeaderWrap: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  restoTitleAndRatingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  nameWithInfoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  restaurantTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  infoBadgeBtn: {
    marginLeft: 6,
    padding: 2,
  },
  infoBadgeIcon: {
    fontSize: 16,
    color: colors.secondaryText,
  },

  /* RATING BADGE */
  ratingBadgeWrap: {
    alignItems: 'center',
  },
  ratingPill: {
    backgroundColor: '#15803D',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 3,
  },
  starGlyph: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  ratingValueText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  ratingUnderlineText: {
    fontSize: 10,
    color: colors.secondaryText,
    marginTop: 3,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderStyle: 'dotted',
  },

  /* SUB DETAILS */
  subDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  subDetailIcon: {
    fontSize: 13,
    marginRight: 6,
  },
  subDetailText: {
    fontSize: 13,
    color: colors.secondaryText,
  },
  subDetailBold: {
    fontWeight: '600',
    color: colors.text,
  },
  scheduleText: {
    color: colors.secondaryText,
    fontWeight: '500',
  },

  /* NO PACKAGING PERK CHIP */
  perkBadgeRow: {
    marginTop: 10,
    flexDirection: 'row',
  },
  noPackagingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? colors.elevatedSurface : '#F0FDF4',
    borderWidth: 1,
    borderColor: isDark ? colors.border : '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 6,
  },
  checkGlyph: {
    color: '#16A34A',
    fontWeight: '800',
    fontSize: 12,
  },
  noPackagingText: {
    color: isDark ? '#4ADE80' : '#166534',
    fontSize: 12,
    fontWeight: '600',
  },

  /* OFFER BANNER */
  offerBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  offerBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  offerTagIcon: {
    fontSize: 14,
  },
  offerBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  offerChevronAction: {
    fontSize: 12,
    color: colors.secondaryText,
    fontWeight: '500',
  },

  /* HORIZONTAL FILTER BAR */
  filtersBar: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  filterBarScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: isDark ? colors.elevatedSurface : '#FFFFFF',
    gap: 6,
  },
  chipGlyph: {
    fontSize: 12,
  },
  chipDropdownArrow: {
    fontSize: 12,
    color: colors.secondaryText,
    marginLeft: 2,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.secondaryText,
  },
  chipSelected: {
    borderColor: '#0066FF',
    backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF',
  },
  chipLabelSelected: {
    color: '#0066FF',
    fontWeight: '700',
  },
  chipActiveVeg: {
    borderColor: '#16A34A',
    backgroundColor: isDark ? '#064E3B' : '#F0FDF4',
  },
  chipLabelVeg: {
    color: isDark ? '#4ADE80' : '#15803D',
    fontWeight: '700',
  },
  chipActiveNonVeg: {
    borderColor: '#DC2626',
    backgroundColor: isDark ? '#7F1D1D' : '#FEF2F2',
  },
  chipLabelNonVeg: {
    color: isDark ? '#F87171' : '#B91C1C',
    fontWeight: '700',
  },
  chipActiveEgg: {
    borderColor: '#D97706',
    backgroundColor: isDark ? '#78350F' : '#FFFBEB',
  },
  chipLabelEgg: {
    color: isDark ? '#FBBF24' : '#B45309',
    fontWeight: '700',
  },

  /* FOOD TYPE ICONS (VEG / NON-VEG) */
  vegSquare: {
    width: 14,
    height: 14,
    borderWidth: 1.5,
    borderColor: '#16A34A',
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vegDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
  },
  nonVegSquare: {
    width: 14,
    height: 14,
    borderWidth: 1.5,
    borderColor: '#DC2626',
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nonVegTriangle: {
    color: '#DC2626',
    fontSize: 8,
    marginTop: -1,
  },
  spicyGlyph: {
    fontSize: 12,
    marginLeft: 4,
  },

  /* CATEGORY BLOCK */
  categoryBlock: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  categoryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  categoryHeaderText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.2,
  },
  categoryChevron: {
    fontSize: 14,
    color: colors.secondaryText,
    fontWeight: 'bold',
  },

  /* DISH ROW (TWO COLUMNS: DETAILS + IMAGE) */
  dishRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingBottom: 24,
  },
  dishDetailsLeft: {
    flex: 1,
    paddingRight: 14,
  },
  foodTypeIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  dishTitleText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 22,
  },
  dishPriceText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginTop: 4,
  },
  dishRatingReviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  dishStarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16A34A',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    marginRight: 6,
  },
  dishStarBoxGlyph: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    marginRight: 2,
  },
  dishStarBoxScore: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  dishReviewCountLabel: {
    color: colors.secondaryText,
    fontSize: 12,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  dishDescriptionText: {
    fontSize: 12.5,
    color: colors.secondaryText,
    lineHeight: 18,
    marginTop: 6,
  },
  moreExpandText: {
    color: colors.text,
    fontWeight: '700',
  },
  dishActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  actionSquareBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? colors.elevatedSurface : '#FFFFFF',
  },
  actionSquareEmoji: {
    fontSize: 13,
  },

  /* DISH IMAGE RIGHT */
  dishImageRight: {
    width: 128,
    alignItems: 'center',
    position: 'relative',
    marginBottom: 16,
  },
  dishSquareImage: {
    width: 128,
    height: 122,
    borderRadius: 16,
    backgroundColor: isDark ? colors.elevatedSurface : '#F1F5F9',
  },
  noDishImageSquare: {
    width: 128,
    height: 122,
    borderRadius: 16,
    backgroundColor: isDark ? colors.elevatedSurface : '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noDishCategoryLabel: {
    fontSize: 11,
    color: colors.secondaryText,
    fontWeight: '600',
    marginTop: 4,
  },

  /* REVIEW BADGE ON DISH IMAGE */
  addBtnWrap: {
    position: 'absolute',
    bottom: -8,
    alignSelf: 'center',
    alignItems: 'center',
  },
  plusReviewTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? colors.elevatedSurface : '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  plusReviewStar: {
    color: '#EAB308',
    fontSize: 10,
    fontWeight: '800',
    marginRight: 3,
  },
  plusReviewScore: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  plusReviewCount: {
    color: colors.secondaryText,
    fontSize: 10,
    fontWeight: '500',
    marginLeft: 3,
  },
  addButtonPill: {
    backgroundColor: isDark ? colors.surface : '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#0066FF',
    borderRadius: 10,
    paddingHorizontal: 28,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  addButtonText: {
    color: '#0066FF',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  addButtonPlusGlyph: {
    color: '#0066FF',
    fontWeight: '700',
    fontSize: 13,
    marginLeft: 3,
    marginTop: -2,
  },
  stepperButtonPill: {
    backgroundColor: '#0066FF',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 7,
    minWidth: 100,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
  },
  stepperActionTouch: {
    paddingHorizontal: 6,
  },
  stepperActionGlyph: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  stepperValueText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  /* DASHED DIVIDER */
  dashedDivider: {
    height: 1,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderStyle: 'dashed',
    marginVertical: 4,
  },

  /* FLOATING MENU BUTTON */
  floatingMenuPill: {
    position: 'absolute',
    bottom: 80,
    right: 16,
    backgroundColor: isDark ? colors.elevatedSurface : '#1E293B',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    zIndex: 99,
  },
  floatingMenuCutlery: {
    fontSize: 14,
  },
  floatingMenuLabel: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.3,
  },

  /* FLOATING CART BANNER */
  floatingCartBanner: {
    position: 'absolute',
    bottom: 16,
    left: 14,
    right: 14,
    backgroundColor: isDark ? '#0F172A' : '#0B132B',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    zIndex: 100,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  floatingCartLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  floatingCartBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  floatingCartCountPill: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#0066FF',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  floatingCartCountNumber: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  floatingCartTextCol: {
    flexDirection: 'column',
  },
  floatingCartLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  floatingCartPrice: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  floatingCartActionBtn: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  floatingCartActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  floatingCartActionArrow: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },

  /* SKELETON LOADING */
  skeletonContainer: {
    padding: 16,
    gap: 16,
  },
  skeletonCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  skeletonLeft: {
    flex: 1,
    paddingRight: 14,
  },
  skeletonLineBadge: {
    width: 24,
    height: 14,
    backgroundColor: colors.border,
    borderRadius: 4,
    marginBottom: 8,
  },
  skeletonLineTitle: {
    width: '75%',
    height: 18,
    backgroundColor: colors.border,
    borderRadius: 4,
    marginBottom: 8,
  },
  skeletonLinePrice: {
    width: '30%',
    height: 16,
    backgroundColor: colors.border,
    borderRadius: 4,
    marginBottom: 8,
  },
  skeletonLineDesc: {
    width: '90%',
    height: 14,
    backgroundColor: colors.border,
    borderRadius: 4,
  },
  skeletonImg: {
    width: 128,
    height: 122,
    borderRadius: 16,
    backgroundColor: colors.elevatedSurface,
  },

  /* EMPTY */
  emptyContainer: {
    paddingVertical: 60,
    paddingHorizontal: 30,
    alignItems: 'center',
  },
  emptyHeader: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.secondaryText,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  clearFilterBtn: {
    marginTop: 16,
    backgroundColor: '#0066FF',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
  },
  clearFilterBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  /* MODALS */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 30,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 8,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  sheetCloseText: {
    fontSize: 18,
    color: colors.secondaryText,
    padding: 4,
  },
  sheetCatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetCatRowSelected: {
    backgroundColor: isDark ? colors.elevatedSurface : '#EFF6FF',
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  sheetCatName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  sheetCatNameSelected: {
    color: '#0066FF',
    fontWeight: '800',
  },
  sheetCatCount: {
    fontSize: 13,
    color: colors.secondaryText,
    fontWeight: '600',
  },

  infoDialog: {
    backgroundColor: colors.surface,
    marginHorizontal: 20,
    marginBottom: 'auto',
    marginTop: 'auto',
    borderRadius: 20,
    padding: 20,
    elevation: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dialogRestoName: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  dialogAddress: {
    fontSize: 13,
    color: colors.secondaryText,
    marginBottom: 16,
  },
  dialogDataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dialogLabel: {
    fontSize: 13,
    color: colors.secondaryText,
  },
  dialogVal: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
  },
  dialogCloseAction: {
    marginTop: 16,
    backgroundColor: isDark ? colors.elevatedSurface : '#1E293B',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  dialogCloseActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  headerQuickActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 8,
  },
  headerActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? colors.elevatedSurface : '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 6,
    gap: 6,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  headerActionText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.2,
  },
  inMenuSearchBarContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: colors.surface,
  },
  inMenuSearchBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inMenuSearchTextInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
    paddingVertical: 0,
  },
});
