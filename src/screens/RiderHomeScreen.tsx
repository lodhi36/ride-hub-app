import React, { useState, useEffect, useRef, useContext, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Dimensions,
  Platform,
  Alert,
  Animated,
  PermissionsAndroid,
  LayoutAnimation,
  UIManager,
  BackHandler,
  Linking,
  Vibration,
  RefreshControl,
  Modal,
  ActivityIndicator,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { AuthContext } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

import api from '../services/api';
import Icon from '../components/PngIcon';
import AsyncStorage from '@react-native-async-storage/async-storage';
import rideStore from '../services/rideStore';
import { BASE_URL, resolveUploadUrl } from '../config/apiConfig';
import { useTheme } from '../context/ThemeContext';
import {
  fetchCurrentGpsPositionDetailed,
  fetchCurrentGpsPosition,
  reverseGeocodeCoords,
  getPermanentStoreLocation,
  savePermanentStoreLocation,
  syncLiveDeviceLocationInBackground,
} from '../services/LocationAddressService';
import StoreHelpModal from '../components/StoreHelpModal';
import StoreMapLocationModal from '../components/StoreMapLocationModal';
import RoleBannerCarousel from '../components/RoleBannerCarousel';
import CancellationPopupModal, { isCancellationEventProcessed } from '../components/CancellationPopupModal';
import BillPrintModal from '../components/BillPrintModal';
import RidersTrackingModal from '../components/RidersTrackingModal';
import { getCategoryLabel, getCategoryTotalLabel, getCategoryStoreLabel } from '../utils/categoryHelper';
import SoundService from '../services/SoundService';
import { OrderHistorySkeletonLoader } from '../components/OrderHistorySkeletonLoader';

// Category Resolution
export type SellerCategoryType =
  | 'restaurant'
  | 'beauty'
  | 'grocery'
  | 'vegetables'
  | 'fruits'
  | 'namkeen'
  | 'oil_food'
  | 'stationery'
  | 'fashion'
  | 'toys'
  | 'bakery'
  | 'electronics'
  | 'services'
  | 'pharmacy'
  | 'general';

export const getSellerCategoryType = (
  categoryRaw?: string,
  partnerTypeRaw?: string,
  businessTypeRaw?: string
): SellerCategoryType => {
  const s = (categoryRaw || '').toLowerCase();
  const pt = (partnerTypeRaw || '').toUpperCase();
  const bt = (businessTypeRaw || '').toLowerCase().trim();

  // 1. Check partnerType first if explicitly set
  if (pt === 'BEAUTY') return 'beauty';
  if (pt === 'GROCERY') return 'grocery';
  if (pt === 'VEGETABLES') return 'vegetables';
  if (pt === 'FRUITS') return 'fruits';
  if (pt === 'NAMKEEN') return 'namkeen';
  if (pt === 'OIL_FOOD') return 'oil_food';
  if (pt === 'STATIONERY') return 'stationery';
  if (pt === 'FASHION') return 'fashion';
  if (pt === 'TOYS') return 'toys';
  if (pt === 'BAKERY') return 'bakery';
  if (pt === 'ELECTRONICS') return 'electronics';
  if (pt === 'SERVICES' || pt === 'CLEANING') return 'services';
  if (pt === 'PHARMACY') return 'pharmacy';
  if (pt === 'RESTAURANT') return 'restaurant';

  // 2. Comprehensive Keyword matching on categoryRaw (Highest priority after explicit PT)
  if (s.includes('beauty') || s.includes('salon') || s.includes('cosmetic') || s.includes('makeup') || s.includes('spa') || s.includes('wellness')) return 'beauty';
  if (s.includes('fashion') || s.includes('cloth') || s.includes('wear') || s.includes('garment') || s.includes('apparel') || s.includes('shoe') || s.includes('dress')) return 'fashion';
  if (s.includes('fruit') || s.includes('fal')) return 'fruits';
  if (s.includes('veg') || s.includes('sabji')) return 'vegetables';
  if (s.includes('namkeen') || s.includes('snack') || s.includes('farsan') || s.includes('bhujia')) return 'namkeen';
  if (s.includes('oil') || s.includes('tel') || s.includes('food product')) return 'oil_food';
  if (s.includes('stationery') || s.includes('stationary') || s.includes('book') || s.includes('pen') || s.includes('office') || s.includes('school')) return 'stationery';
  if (s.includes('grocery') || s.includes('kirana') || s.includes('supermarket') || s.includes('daily') || s.includes('mart') || s.includes('pantry') || s.includes('rashan')) return 'grocery';
  if (s.includes('toy') || s.includes('game') || s.includes('kids') || s.includes('baby') || s.includes('khilon')) return 'toys';
  if (s.includes('bakery') || s.includes('cake') || s.includes('sweet') || s.includes('mithai') || s.includes('pastry') || s.includes('dessert')) return 'bakery';
  if (s.includes('electr') || s.includes('gadget') || s.includes('appliances') || s.includes('repair') || s.includes('mobile') || s.includes('phone') || s.includes('hardware')) return 'electronics';
  if (s.includes('clean') || s.includes('service') || s.includes('plumb') || s.includes('house') || s.includes('maid') || s.includes('ride') || s.includes('auto') || s.includes('taxi') || s.includes('cab') || s.includes('bike')) return 'services';
  if (s.includes('pharm') || s.includes('medic') || s.includes('chemist') || s.includes('health') || s.includes('dawa')) return 'pharmacy';
  if (s.includes('food') || s.includes('restaurant') || s.includes('cafe') || s.includes('hotel') || s.includes('dhaba') || s.includes('kitchen') || s.includes('dine') || s.includes('meal') || s.includes('pizza') || s.includes('burger') || s.includes('biryani')) return 'restaurant';

  // 3. Fallback to businessType checking LAST
  if (bt === 'toys' || bt === 'toy') return 'toys';
  if (bt === 'beauty') return 'beauty';
  if (bt === 'grocery' || bt === 'kirana') return 'grocery';
  if (bt === 'vegetables' || bt === 'vegetable') return 'vegetables';
  if (bt === 'fruits' || bt === 'fruit') return 'fruits';
  if (bt === 'namkeen' || bt === 'snacks') return 'namkeen';
  if (bt === 'oil_food' || bt === 'oil' || bt === 'food_products') return 'oil_food';
  if (bt === 'stationery' || bt === 'stationary' || bt === 'non_food') return 'stationery';
  if (bt === 'fashion') return 'fashion';
  if (bt === 'restaurant') return 'restaurant';

  return 'restaurant';
};

export const getCategoryTerminology = (catType: SellerCategoryType) => {
  switch (catType) {
    case 'beauty':
      return {
        storeTypeLabel: 'Beauty Store',
        statusTitle: 'Beauty Store Status',
        tabs: ['Packing', 'Ready', 'Out for delivery', 'Completed'],
        menuNavLabel: 'Catalogue',
        menuNavIcon: '💄',
        readyBtnText: '📦 Mark Order Ready',
        itemNoun: 'Product',
        itemsNoun: 'Products',
        addItemActionLabel: 'Add Product',
        emptyItemsText: 'No products found',
        searchPlaceholder: 'Search beauty products...',
        categoriesLabel: 'Product Categories',
        refreshLabel: 'Refresh Products',
        totalLabel: 'Order Total',
        isFoodDietFilterAllowed: false,
      };
    case 'fashion':
      return {
        storeTypeLabel: 'Fashion Store',
        statusTitle: 'Fashion Store Status',
        tabs: ['Packing', 'Ready', 'Out for delivery', 'Completed'],
        menuNavLabel: 'Products',
        menuNavIcon: '👗',
        readyBtnText: '📦 Mark Order Ready',
        itemNoun: 'Fashion Item',
        itemsNoun: 'Products',
        addItemActionLabel: 'Add Product',
        emptyItemsText: 'No products found',
        searchPlaceholder: 'Search clothing & fashion...',
        categoriesLabel: 'Fashion Categories',
        refreshLabel: 'Refresh Products',
        totalLabel: 'Fashion Total',
        isFoodDietFilterAllowed: false,
      };
    case 'vegetables':
      return {
        storeTypeLabel: 'Vegetables Store',
        statusTitle: 'Vegetable Store Status',
        tabs: ['Packing', 'Ready', 'Out for delivery', 'Completed'],
        menuNavLabel: 'Vegetables',
        menuNavIcon: '🥦',
        readyBtnText: '📦 Mark Order Ready',
        itemNoun: 'Vegetable',
        itemsNoun: 'Vegetables',
        addItemActionLabel: 'Add Vegetable',
        emptyItemsText: 'No vegetables found',
        searchPlaceholder: 'Search fresh vegetables...',
        categoriesLabel: 'Vegetable Categories',
        refreshLabel: 'Refresh Vegetables',
        totalLabel: 'Vegetables Total',
        isFoodDietFilterAllowed: false,
      };
    case 'fruits':
      return {
        storeTypeLabel: 'Fruits Store',
        statusTitle: 'Fruits Store Status',
        tabs: ['Packing', 'Ready', 'Out for delivery', 'Completed'],
        menuNavLabel: 'Fruits',
        menuNavIcon: '🍎',
        readyBtnText: '📦 Mark Order Ready',
        itemNoun: 'Fruit',
        itemsNoun: 'Fruits',
        addItemActionLabel: 'Add Fruit',
        emptyItemsText: 'No fruits found',
        searchPlaceholder: 'Search fresh fruits...',
        categoriesLabel: 'Fruit Categories',
        refreshLabel: 'Refresh Fruits',
        totalLabel: 'Fruits Total',
        isFoodDietFilterAllowed: false,
      };
    case 'grocery':
      return {
        storeTypeLabel: 'Grocery Store',
        statusTitle: 'Grocery Store Status',
        tabs: ['Packing', 'Ready', 'Out for delivery', 'Completed'],
        menuNavLabel: 'Products',
        menuNavIcon: '🛒',
        readyBtnText: '📦 Mark Order Ready',
        itemNoun: 'Grocery Item',
        itemsNoun: 'Products',
        addItemActionLabel: 'Add Product',
        emptyItemsText: 'No products found',
        searchPlaceholder: 'Search grocery items...',
        categoriesLabel: 'Grocery Categories',
        refreshLabel: 'Refresh Products',
        totalLabel: 'Grocery Total',
        isFoodDietFilterAllowed: false,
      };
    case 'namkeen':
      return {
        storeTypeLabel: 'Namkeen & Snacks',
        statusTitle: 'Snacks Store Status',
        tabs: ['Packing', 'Ready', 'Out for delivery', 'Completed'],
        menuNavLabel: 'Snacks',
        menuNavIcon: '🥨',
        readyBtnText: '📦 Mark Order Ready',
        itemNoun: 'Snack Item',
        itemsNoun: 'Snacks',
        addItemActionLabel: 'Add Snack',
        emptyItemsText: 'No snacks found',
        searchPlaceholder: 'Search snacks & namkeen...',
        categoriesLabel: 'Snack Categories',
        refreshLabel: 'Refresh Snacks',
        totalLabel: 'Snacks Total',
        isFoodDietFilterAllowed: false,
      };
    case 'oil_food':
      return {
        storeTypeLabel: 'Oil & Food Products',
        statusTitle: 'Food Products Status',
        tabs: ['Packing', 'Ready', 'Out for delivery', 'Completed'],
        menuNavLabel: 'Products',
        menuNavIcon: '🌻',
        readyBtnText: '📦 Mark Order Ready',
        itemNoun: 'Food Product',
        itemsNoun: 'Products',
        addItemActionLabel: 'Add Product',
        emptyItemsText: 'No products found',
        searchPlaceholder: 'Search oil & food products...',
        categoriesLabel: 'Product Categories',
        refreshLabel: 'Refresh Products',
        totalLabel: 'Oil & Food Total',
        isFoodDietFilterAllowed: false,
      };
    case 'stationery':
      return {
        storeTypeLabel: 'Stationery Store',
        statusTitle: 'Stationery Status',
        tabs: ['Packing', 'Ready', 'Out for delivery', 'Completed'],
        menuNavLabel: 'Catalogue',
        menuNavIcon: '📚',
        readyBtnText: '📦 Mark Order Ready',
        itemNoun: 'Stationery Item',
        itemsNoun: 'Products',
        addItemActionLabel: 'Add Product',
        emptyItemsText: 'No stationery items found',
        searchPlaceholder: 'Search stationery & supplies...',
        categoriesLabel: 'Product Categories',
        refreshLabel: 'Refresh Catalogue',
        totalLabel: 'Stationery Total',
        isFoodDietFilterAllowed: false,
      };
    case 'toys':
      return {
        storeTypeLabel: 'Toy Store',
        statusTitle: 'Toy Store Status',
        tabs: ['Packing', 'Ready', 'Out for delivery', 'Completed'],
        menuNavLabel: 'Toys',
        menuNavIcon: '🧸',
        readyBtnText: '📦 Mark Order Ready',
        itemNoun: 'Toy & Game Item',
        itemsNoun: 'Toys',
        addItemActionLabel: 'Add Toy',
        emptyItemsText: 'No toys found',
        searchPlaceholder: 'Search toys & games...',
        categoriesLabel: 'Toy Categories',
        refreshLabel: 'Refresh Toys',
        totalLabel: 'Toy Total',
        isFoodDietFilterAllowed: false,
      };
    case 'bakery':
      return {
        storeTypeLabel: 'Bakery & Sweets',
        statusTitle: 'Bakery Status',
        tabs: ['Preparing', 'Ready', 'Out for delivery', 'Completed'],
        menuNavLabel: 'Catalogue',
        menuNavIcon: '🧁',
        readyBtnText: '📦 Mark Order Ready',
        itemNoun: 'Bakery Item',
        itemsNoun: 'Bakery Items',
        addItemActionLabel: 'Add Bakery Item',
        emptyItemsText: 'No bakery items found',
        searchPlaceholder: 'Search cakes & bakery...',
        categoriesLabel: 'Bakery Categories',
        refreshLabel: 'Refresh Catalogue',
        totalLabel: 'Bakery Total',
        isFoodDietFilterAllowed: false,
      };
    case 'electronics':
      return {
        storeTypeLabel: 'Electronics Store',
        statusTitle: 'Electronics Status',
        tabs: ['Packing', 'Ready', 'Out for delivery', 'Completed'],
        menuNavLabel: 'Products',
        menuNavIcon: '🔌',
        readyBtnText: '📦 Mark Order Ready',
        itemNoun: 'Electronic Item',
        itemsNoun: 'Products',
        addItemActionLabel: 'Add Product',
        emptyItemsText: 'No electronic items found',
        searchPlaceholder: 'Search gadgets & accessories...',
        categoriesLabel: 'Product Categories',
        refreshLabel: 'Refresh Products',
        totalLabel: 'Electronics Total',
        isFoodDietFilterAllowed: false,
      };
    case 'services':
      return {
        storeTypeLabel: 'Services Partner',
        statusTitle: 'Service Status',
        tabs: ['Assigned', 'In Progress', 'Completed'],
        menuNavLabel: 'Services',
        menuNavIcon: '🧹',
        readyBtnText: '✅ Mark Service Done',
        itemNoun: 'Service',
        itemsNoun: 'Services',
        addItemActionLabel: 'Add Service',
        emptyItemsText: 'No services found',
        searchPlaceholder: 'Search services...',
        categoriesLabel: 'Service Categories',
        refreshLabel: 'Refresh Services',
        totalLabel: 'Service Total',
        isFoodDietFilterAllowed: false,
      };
    case 'pharmacy':
      return {
        storeTypeLabel: 'Pharmacy / Medical',
        statusTitle: 'Pharmacy Status',
        tabs: ['Packing', 'Ready', 'Out for delivery', 'Completed'],
        menuNavLabel: 'Medicines',
        menuNavIcon: '💊',
        readyBtnText: '📦 Mark Order Ready',
        itemNoun: 'Medicine',
        itemsNoun: 'Medicines',
        addItemActionLabel: 'Add Medicine',
        emptyItemsText: 'No medicines found',
        searchPlaceholder: 'Search medicines & health products...',
        categoriesLabel: 'Medicine Categories',
        refreshLabel: 'Refresh Medicines',
        totalLabel: 'Pharmacy Total',
        isFoodDietFilterAllowed: false,
      };
    case 'general':
      return {
        storeTypeLabel: 'Store Partner',
        statusTitle: 'Store Status',
        tabs: ['Packing', 'Ready', 'Out for delivery', 'Completed'],
        menuNavLabel: 'Products',
        menuNavIcon: '🛍️',
        readyBtnText: '📦 Mark Order Ready',
        itemNoun: 'Product',
        itemsNoun: 'Products',
        addItemActionLabel: 'Add Product',
        emptyItemsText: 'No products found',
        searchPlaceholder: 'Search products...',
        categoriesLabel: 'Product Categories',
        refreshLabel: 'Refresh Products',
        totalLabel: 'Store Total',
        isFoodDietFilterAllowed: false,
      };
    case 'restaurant':
    default:
      return {
        storeTypeLabel: 'Restaurant',
        statusTitle: 'Restaurant Status',
        tabs: ['Preparing', 'Ready', 'Out for delivery', 'Completed'],
        menuNavLabel: 'Menu',
        menuNavIcon: '🍽️',
        readyBtnText: '🍲 Mark Food Ready',
        itemNoun: 'Dish',
        itemsNoun: 'Dishes',
        addItemActionLabel: 'Add Dish',
        emptyItemsText: 'No dishes found',
        searchPlaceholder: 'Search in dishes...',
        categoriesLabel: 'Menu Categories',
        refreshLabel: 'Refresh Menu',
        totalLabel: 'Food Total',
        isFoodDietFilterAllowed: true,
      };
  }
};

const { width } = Dimensions.get('window');

const RiderHomeScreen = ({ navigation, route }: any) => {
  const { user, logout } = useContext(AuthContext);
  const { socket, unreadNotifCount } = useSocket();

  const routePartnerType = route?.params?.partnerType || '';
  const routeCategoryName = route?.params?.businessType || route?.params?.categoryName || '';

  const [partnerProfile, setPartnerProfile] = useState<any>(null);
  const [showStoreHelpModal, setShowStoreHelpModal] = useState(false);

  // Restore cached supplierUser ONLY if it matches the currently logged-in supplier ID (zero cross-account bleed)
  useEffect(() => {
    let mounted = true;
    const currentUserId = String(user?._id || user?.id || '');
    const currentRole = String(user?.role || '').toLowerCase();
    // Reset stale supplier UI immediately if identity changed
    setPartnerProfile(null);
    setRestoDisplayName('Restaurant Partner');

    const restoreCachedProfile = async () => {
      try {
        if (currentRole && !['supplier', 'seller_partner', 'restaurant'].includes(currentRole)) {
          return;
        }
        const cached = await AsyncStorage.getItem('supplierUser');
        if (cached && mounted) {
          const parsed = JSON.parse(cached);
          const cachedId = String(parsed?._id || parsed?.id || '');
          const cachedRole = String(parsed?.role || '').toLowerCase();
          const isSupplierRole = ['supplier', 'seller_partner', 'restaurant'].includes(cachedRole);
          if (isSupplierRole && (!currentUserId || cachedId === currentUserId)) {
            setPartnerProfile(parsed);
            const sName = parsed.restaurantName || parsed.businessName || parsed.storeName || parsed.name;
            if (sName) {
              setRestoDisplayName(sName);
            }
          }
        }
      } catch (e) {}
    };
    restoreCachedProfile();
    return () => { mounted = false; };
  }, [user?._id, user?.id, user?.role]);

  // Fetch real partner profile from backend whenever logged-in user changes
  useEffect(() => {
    let isMounted = true;
    const loadPartnerProfile = async () => {
      try {
        const res = await api.get('/auth/partner-profile');
        if (res.data?.success && res.data.partner) {
          if (isMounted) {
            const partnerObj = res.data.partner;
            const pRole = String(partnerObj.role || '').toLowerCase();
            if (!['supplier', 'seller_partner', 'restaurant'].includes(pRole)) {
              return;
            }
            setPartnerProfile(partnerObj);
            const pName = partnerObj.restaurantName || partnerObj.businessName || partnerObj.storeName || partnerObj.name;
            if (pName) {
              setRestoDisplayName(pName);
            }
            const targetId = (partnerObj._id || partnerObj.id || user?._id || user?.id)?.toString();
            let savedStatus = null;
            if (targetId) {
              savedStatus = await AsyncStorage.getItem(`restaurant_status_${targetId}`).catch(() => null);
            }
            if (savedStatus !== null && savedStatus !== undefined) {
              const parsed = JSON.parse(savedStatus);
              setIsOnline(parsed);
              switchAnim.setValue(parsed ? 1 : 0);
            } else if (partnerObj.restaurant_status !== undefined || partnerObj.isOnline !== undefined) {
              const serverOnline = partnerObj.restaurant_status === 'online' || partnerObj.isOnline === true;
              setIsOnline(serverOnline);
              switchAnim.setValue(serverOnline ? 1 : 0);
            }
          }
        }
      } catch (e: any) {
        console.log('[RiderHomeScreen] Partner profile fetch notice:', e.message);
      }
    };
    loadPartnerProfile();
    return () => { isMounted = false; };
  }, [user?._id, user?.id]);

  // Instant local disk restore of online/offline status on initial render
  useEffect(() => {
    let isMounted = true;
    const restoreSavedStatus = async () => {
      const targetId = user?._id || user?.id;
      if (targetId) {
        try {
          const saved = await AsyncStorage.getItem(`restaurant_status_${targetId}`);
          if (saved !== null && isMounted) {
            const parsed = JSON.parse(saved);
            setIsOnline(parsed);
            switchAnim.setValue(parsed ? 1 : 0);
          }
        } catch (e) {}
      }
    };
    restoreSavedStatus();
    return () => { isMounted = false; };
  }, [user?._id, user?.id]);

  const rawPartnerType = partnerProfile?.partnerType || routePartnerType || (user as any)?.partnerType || '';
  const rawCat = partnerProfile?.categoryName || partnerProfile?.businessCategoryName || routeCategoryName || user?.categoryName || (user as any)?.businessCategoryName || (user as any)?.businessType || (user as any)?.category || '';
  const catType = getSellerCategoryType(rawCat, rawPartnerType);
  const terminology = getCategoryTerminology(catType);
  const { isDark } = useTheme('supplier');

  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return (user as any)?.restaurant_status === 'online' || user?.isOnline === true;
  });
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState('Preparing');
  const [activeBottomNav, setActiveBottomNav] = useState('Home');
  const [showTroubleshoot, setShowTroubleshoot] = useState(true);
  const [currentLocation, setCurrentLocation] = useState('Fetching location...');
  const [mapLocationModalVisible, setMapLocationModalVisible] = useState<boolean>(false);
  const [restoDisplayName, setRestoDisplayName] = useState<string>('Restaurant Partner');

  // Smooth Bottom Bar Hide/Show on Scroll Animation for Supplier Home
  const bottomBarTranslateY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);

  const handleSupplierScroll = (event: any) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const diff = currentY - lastScrollY.current;

    if (currentY <= 15) {
      // Top of screen -> Always show
      Animated.timing(bottomBarTranslateY, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
    } else if (diff > 8 && currentY > 40) {
      // User is scrolling DOWN (content moving UP) -> Smoothly hide bottom bar
      Animated.timing(bottomBarTranslateY, {
        toValue: 120,
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

  const resolveTargetSupplierId = useCallback(async (): Promise<string> => {
    // 1. Prioritize canonical 24-character hex MongoDB ObjectId
    const candidates = [
      user?._id,
      user?.id,
      partnerProfile?._id,
      partnerProfile?.id,
      partnerProfile?.businessId,
      partnerProfile?.ownerUserId,
    ];
    for (const c of candidates) {
      const s = c?.toString();
      if (s && /^[0-9a-fA-F]{24}$/.test(s)) {
        return s;
      }
    }

    try {
      const suppUserStr = await AsyncStorage.getItem('supplierUser');
      if (suppUserStr) {
        const p = JSON.parse(suppUserStr);
        const pId = (p?._id || p?.id || p?.businessId)?.toString();
        if (pId && /^[0-9a-fA-F]{24}$/.test(pId)) return pId;
      }
    } catch (e) {}

    // 2. Fallback to alphanumeric partnerId/supplierId
    const partnerCode = (
      partnerProfile?.partnerId ||
      partnerProfile?.supplierId ||
      partnerProfile?.restaurantId ||
      user?.partnerId ||
      user?.supplierId ||
      user?.restaurantId
    )?.toString();
    if (partnerCode && partnerCode !== 'undefined' && partnerCode !== 'null') {
      return partnerCode;
    }

    return (user?._id || user?.id)?.toString() || '';
  }, [partnerProfile, user]);

  // Real Orders & Real-time Request States
  const [orders, setOrders] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadingOrders, setLoadingOrders] = useState<boolean>(false);
  const [incomingOrder, setIncomingOrder] = useState<any | null>(null);
  const incomingCountdownRef = useRef<any>(null);
  const [cancelModalVisible, setCancelModalVisible] = useState<boolean>(false);
  const [orderToCancel, setOrderToCancel] = useState<any | null>(null);
  const [selectedCancelReason, setSelectedCancelReason] = useState<string>('Item / Ingredients Out of Stock');
  const [cancellationPopup, setCancellationPopup] = useState<{
    visible: boolean;
    orderId?: string;
    reason?: string;
    cancelledBy?: string;
    customerName?: string;
    restaurantName?: string;
  }>({ visible: false });

  const [billModalVisible, setBillModalVisible] = useState<boolean>(false);
  const [selectedOrderToPrint, setSelectedOrderToPrint] = useState<any | null>(null);
  const [showRidersModal, setShowRidersModal] = useState<boolean>(false);

  // 🛡️ One-Click Order Acceptance & Duplicate Request / Popup Guards
  const [acceptingOrderId, setAcceptingOrderId] = useState<string | null>(null);
  const inFlightAcceptIdsRef = useRef<Set<string>>(new Set());
  const acceptedOrderIdsRef = useRef<Set<string>>(new Set());
  const dismissedOrderIdsRef = useRef<Set<string>>(new Set());
  const shownAcceptPopupsRef = useRef<Set<string>>(new Set());

  // 🛡️ Helper: Guarantees "Order Accepted!" popup is shown exactly once per Order ID
  const showOrderAcceptedPopupOnce = useCallback((orderId: string, prepTime: number) => {
    if (!orderId) return;
    const cleanId = orderId.toString();
    if (shownAcceptPopupsRef.current.has(cleanId)) {
      console.log(`🛡️ [POPUP GUARD] "Order Accepted!" popup already displayed for order #${cleanId}. Suppressing duplicate.`);
      return;
    }
    shownAcceptPopupsRef.current.add(cleanId);
    Alert.alert(
      'Order Accepted! 🍳',
      `Order #${cleanId.slice(-6)} accepted (${prepTime} min prep time). Nearest rider search started!`,
      [{ text: 'OK', style: 'default' }]
    );
  }, []);

  // Continuous sound alert & vibration for incoming food order requests
  useEffect(() => {
    if (incomingOrder) {
      console.log('🔔 [RESTAURANT HOME] Incoming order active -> Playing sound & vibration alert');
      SoundService.playIncomingOrderAlert();
    } else {
      SoundService.stopIncomingOrderAlert();
    }
    return () => {
      SoundService.stopIncomingOrderAlert();
    };
  }, [incomingOrder]);

  // Preparation Timer (server-driven countdown)
  const [selectedPrepTime, setSelectedPrepTime] = useState<number>(15);
  const [, setTimerTick] = useState<number>(0);

  useEffect(() => {
    const ticker = setInterval(() => {
      setTimerTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  const getRemainingPrepSeconds = (order: any) => {
    if (order?.prepEndsAt) {
      const ends = new Date(order.prepEndsAt).getTime();
      return Math.floor((ends - Date.now()) / 1000);
    }
    if (order?.acceptedAt && order?.preparationTime) {
      const ends = new Date(order.acceptedAt).getTime() + Number(order.preparationTime) * 60 * 1000;
      return Math.floor((ends - Date.now()) / 1000);
    }
    return 0;
  };

  const formatCountdown = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Real-time Wallet Balance
  const [walletBalance, setWalletBalance] = useState<number>(0);

  // Real-time Reached Riders Count
  const [reachedRidersCount, setReachedRidersCount] = useState<number>(0);

  const fetchReachedRidersCount = useCallback(async () => {
    try {
      const pId = await resolveTargetSupplierId();
      const cleanBase = BASE_URL.replace(/\/+$/, '');
      const res = await fetch(`${cleanBase}/bookings/restaurant/reached-riders-count?restaurantId=${pId || ''}`);
      const data = await res.json();
      if (data && data.success && typeof data.count === 'number') {
        setReachedRidersCount(data.count);
      }
    } catch (e: any) {
      console.log('Error fetching reached riders count:', e.message);
    }
  }, [resolveTargetSupplierId]);

  // Fetch Wallet Balance & Earnings in Real-Time
  const fetchWalletBalance = useCallback(async () => {
    try {
      const pId = await resolveTargetSupplierId();
      if (!pId) return;
      const cleanBase = BASE_URL.replace(/\/+$/, '');
      const res = await fetch(`${cleanBase}/bookings/earnings?providerId=${pId}`);
      const data = await res.json();
      if (data && data.success) {
        setWalletBalance(data.pocketBalance !== undefined ? data.pocketBalance : (data.totalEarnings || 0));
      }
    } catch (e) {
      console.log('Error fetching restaurant wallet balance:', e);
    }
  }, [resolveTargetSupplierId]);

  useEffect(() => {
    fetchWalletBalance();
    fetchReachedRidersCount();
    if (!socket) return;
    const onEarningsUpdate = (data: any) => {
      console.log('💰 [RESTAURANT] Earnings updated in real time:', data);
      if (data?.pocketBalance !== undefined) {
        setWalletBalance(data.pocketBalance);
      } else {
        fetchWalletBalance();
      }
    };
    socket.on('earnings_updated', onEarningsUpdate);
    return () => {
      socket.off('earnings_updated', onEarningsUpdate);
    };
  }, [socket, fetchWalletBalance]);

  const CANCELLATION_REASONS = [
    'Item / Ingredients Out of Stock',
    'Kitchen Overloaded / Long Delay',
    'Power / Kitchen Equipment Issue',
    'Customer Requested Cancellation',
    'Closing Kitchen Early',
    'Other Operational Reason',
  ];

    // Removed 60-second ringing countdown as per requirements
  // (No countdown needed for incoming orders)

  // Immediately load cached online status on mount
  useEffect(() => {
    const userId = user?._id || user?.id;
    if (userId) {
      AsyncStorage.getItem(`restaurant_status_${userId}`).then((cached) => {
        if (cached !== null) {
          const isCachedOnline = JSON.parse(cached) === true;
          setIsOnline(isCachedOnline);
        }
      }).catch(() => {});
    }
  }, [user?._id, user?.id]);



  useEffect(() => {
    if (!socket) return;
    const handleName = async (data: any) => {
      // Strictly ignore events from Customers, Riders, or OTHER Suppliers!
      const evRole = String(data?.role || data?.user?.role || '').toLowerCase();
      if (evRole && !['supplier', 'seller_partner', 'restaurant'].includes(evRole)) {
        return;
      }
      const eventTargetId = String(
        data?.restaurantId || data?.supplierId || data?.userId || data?.id || data?.user?._id || ''
      );
      if (!eventTargetId) return;

      const myResolvedId = String(await resolveTargetSupplierId());
      const myUserId = String(user?._id || user?.id || '');
      const myPartnerId = String(user?.partnerId || partnerProfile?.partnerId || '');
      const isMyStore =
        (myResolvedId && eventTargetId === myResolvedId) ||
        (myUserId && eventTargetId === myUserId) ||
        (myPartnerId && eventTargetId === myPartnerId);
      if (!isMyStore) {
        return;
      }

      const newName = (data?.restaurantName || data?.name || '').trim();
      if (newName) {
        console.log('📢 [RIDER HOME] Real-time OWN store name updated:', newName);
        setRestoDisplayName(newName);
      }
    };
    socket.on('RESTAURANT_NAME_UPDATED', handleName);
    socket.on('restaurant_name_updated', handleName);
    socket.on('RESTAURANT_UPDATED', handleName);
    return () => {
      socket.off('RESTAURANT_NAME_UPDATED', handleName);
      socket.off('restaurant_name_updated', handleName);
      socket.off('RESTAURANT_UPDATED', handleName);
    };
  }, [socket, resolveTargetSupplierId, user?._id, user?.id, user?.partnerId, partnerProfile?.partnerId]);

  // Load Permanent Saved Store Location from Database & Cache with silent background GPS sync
  const loadSavedStoreLocation = useCallback(async () => {
    try {
      // ⚡ Background Silent Device GPS Fetch (0 repeated prompts, no dummy location)
      syncLiveDeviceLocationInBackground('supplier').then((bgRes) => {
        if (bgRes.success && bgRes.address) {
          setCurrentLocation(bgRes.address);
        }
      }).catch(() => {});

      // 1. Check permanent locked store location first
      const permStore = await getPermanentStoreLocation();
      if (permStore && (permStore.fullAddress || permStore.address)) {
        setCurrentLocation(permStore.fullAddress || permStore.address);
        return;
      }

      // 2. Prioritize partner profile address/location
      const profileAddress = partnerProfile?.businessAddress || partnerProfile?.fullAddress || partnerProfile?.address || partnerProfile?.location;
      if (profileAddress) {
        setCurrentLocation(profileAddress);
        const lat = partnerProfile?.businessLatitude || partnerProfile?.latitude || 0;
        const lon = partnerProfile?.businessLongitude || partnerProfile?.longitude || 0;
        savePermanentStoreLocation({
          address: profileAddress,
          fullAddress: profileAddress,
          latitude: lat,
          longitude: lon,
          businessLatitude: lat,
          businessLongitude: lon,
          businessAddress: profileAddress,
        }).catch(() => {});
        return;
      }

      // 3. Check cached supplier user
      const cachedSupp = await AsyncStorage.getItem('supplierUser');
      if (cachedSupp) {
        const parsed = JSON.parse(cachedSupp);
        const suppAddr = parsed.businessAddress || parsed.fullAddress || parsed.address || parsed.location;
        if (suppAddr) {
          setCurrentLocation(suppAddr);
          return;
        }
      }

      // 4. Fallback to cached location string
      const cachedLoc = await AsyncStorage.getItem('last_known_resto_location');
      if (cachedLoc) {
        setCurrentLocation(cachedLoc);
      }
    } catch (err) {
      console.warn('[STORE LOCATION NOTICE]', err);
    }
  }, [partnerProfile]);

  useEffect(() => {
    loadSavedStoreLocation();
  }, [loadSavedStoreLocation, partnerProfile, user]);

  // Save store location coordinates to storage, backend MongoDB, and real-time sockets
  const handleSaveStoreLocationFromMap = async (
    pos: { latitude: number; longitude: number },
    fullAddr: string,
    showSuccessAlert: boolean = true
  ) => {
    try {
      setCurrentLocation(fullAddr);

      // 1. Permanently lock location in local storage
      await savePermanentStoreLocation({
        address: fullAddr,
        fullAddress: fullAddr,
        latitude: pos.latitude,
        longitude: pos.longitude,
        businessLatitude: pos.latitude,
        businessLongitude: pos.longitude,
        businessAddress: fullAddr,
        city: 'Bhopal',
      });

      const pId = await resolveTargetSupplierId();
      if (pId) {
        const suppToken = (await AsyncStorage.getItem('supplierToken')) || (await AsyncStorage.getItem('userToken'));
        const authHeader = suppToken ? { Authorization: `Bearer ${suppToken}` } : undefined;

        const locationPayload = {
          supplierId: pId,
          partnerId: partnerProfile?.partnerId || user?.partnerId,
          userId: pId,
          currentDeviceLocation: {
            latitude: pos.latitude,
            longitude: pos.longitude,
            address: fullAddr,
            timestamp: new Date().toISOString(),
          },
          businessLocation: fullAddr,
          businessLatitude: pos.latitude,
          businessLongitude: pos.longitude,
          businessAddress: fullAddr,
          latitude: pos.latitude,
          longitude: pos.longitude,
          location: fullAddr,
          address: fullAddr,
          fullAddress: fullAddr,
          locationCoords: {
            latitude: pos.latitude,
            longitude: pos.longitude,
          },
        };

        // 2. Dedicated supplier-location endpoint
        await api.put('/profile/supplier-location', locationPayload, {
          headers: authHeader,
        }).catch((e: any) => console.log('[SUPPLIER LOC NOTE]:', e.message));

        // 3. Authoritative profile update
        await api.put(`/profile/${pId}`, locationPayload, {
          headers: authHeader,
        }).catch((e: any) => console.log('Location update API notice:', e.message));

        // 4. Sync status endpoint with coordinates
        await api.put('/profile/status', {
          userId: pId,
          status: isOnline ? 'online' : 'offline',
          isOnline: isOnline,
          isAvailable: isOnline,
          latitude: pos.latitude,
          longitude: pos.longitude,
          businessLatitude: pos.latitude,
          businessLongitude: pos.longitude,
          address: fullAddr,
          fullAddress: fullAddr,
        }, {
          headers: authHeader,
        }).catch(() => {});

        // 5. Update component profile state immediately
        setPartnerProfile((prev: any) => ({
          ...(prev || {}),
          businessLatitude: pos.latitude,
          businessLongitude: pos.longitude,
          businessAddress: fullAddr,
          latitude: pos.latitude,
          longitude: pos.longitude,
          location: fullAddr,
          address: fullAddr,
          fullAddress: fullAddr,
        }));

        // 6. Refresh authoritative profile from backend
        try {
          const freshRes = await api.get('/auth/partner-profile', { headers: authHeader });
          if (freshRes.data?.success && freshRes.data.partner) {
            setPartnerProfile(freshRes.data.partner);
          }
        } catch (e) {}

        // 7. Emit real-time WebSocket events to customers and riders
        if (socket && socket.connected) {
          socket.emit('update_restaurant_location', {
            restaurantId: pId,
            userId: pId,
            latitude: pos.latitude,
            longitude: pos.longitude,
            businessLatitude: pos.latitude,
            businessLongitude: pos.longitude,
            businessAddress: fullAddr,
            location: fullAddr,
            address: fullAddr,
            fullAddress: fullAddr,
          });
          socket.emit('rider_location_update', {
            riderId: pId,
            location: {
              latitude: pos.latitude,
              longitude: pos.longitude,
              address: fullAddr,
            },
          });
        }
      }
      if (showSuccessAlert) {
        Alert.alert('Store Location Saved ✅', `Your store location has been updated on the map:\n\n${fullAddr}`);
      }
    } catch (e: any) {
      if (showSuccessAlert) {
        Alert.alert('Location Error', 'Unable to save store location. Please try again.');
      }
    }
  };

  // MANDATORY REQUIREMENT 1: Zero Background GPS Overwriting
  // Supplier store location is permanent and must NEVER be overwritten by background GPS after registration.

  // Open Interactive Map & Geolocation Picker Modal
  const handleUpdateShopLocation = () => {
    const isLocked = Boolean(
      partnerProfile?.locationLocked ||
      user?.locationLocked ||
      partnerProfile?.permanentStoreLocation?.isConfirmed ||
      user?.permanentStoreLocation?.isConfirmed
    );
    if (isLocked) {
      Alert.alert(
        'दुकान लोकेशन लॉक है 🔒',
        'आपकी दुकान की स्थायी लोकेशन लॉक हो चुकी है।\n\nसुरक्षा और ऑर्डर सटीकता के लिए इसे ऐप से सीधे नहीं बदला जा सकता। बदलाव केवल मेन एडमिन पैनल से एडमिन सत्यापन के बाद ही संभव है।',
        [{ text: 'समझ गया (OK)' }]
      );
      return;
    }
    setMapLocationModalVisible(true);
  };



  const getOrderId = (o: any) => String(o?.bookingId || o?.rideId || o?._id || o?.id || '').trim();

  // Helper to format Date and Time cleanly (e.g. "Today, 08:30 PM", "Yesterday, 08:30 PM", "05 Sep 2026, 08:30 PM")
  const formatOrderDateTime = (dateStr: any) => {
    if (!dateStr) return 'Just now';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'Recently';
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();

      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      const isYesterday = d.toDateString() === yesterday.toDateString();

      const timeString = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

      if (isToday) {
        return `Today, ${timeString}`;
      }
      if (isYesterday) {
        return `Yesterday, ${timeString}`;
      }
      const day = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      return `${day}, ${timeString}`;
    } catch (e) {
      return 'Recently';
    }
  };

  // Safe item parser ensuring real dish name, quantity and real price are shown, never ₹0
  const parseOrderItems = (cartItems: any, fallbackPrice?: number) => {
    if (!cartItems) return [];
    let itemsList: any[] = [];
    if (Array.isArray(cartItems)) {
      itemsList = cartItems.map((it: any, index: number) => ({
        id: it.id || it.itemId || `item_${index}`,
        name: it.name || it.dishName || it.title || 'Dish Item',
        quantity: Number(it.quantity) || 1,
        price: Number(it.price) || 0,
        isVeg: it.isVeg !== false,
      }));
    } else if (typeof cartItems === 'object') {
      itemsList = Object.entries(cartItems).map(([key, val]: [string, any]) => {
        if (typeof val === 'number') {
          return {
            id: key,
            name: 'Dish Item',
            quantity: val,
            price: 0,
          };
        }
        return {
          id: key,
          name: val?.name || val?.dishName || val?.title || 'Dish Item',
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

  // Get restaurant's real food earning (excludes rider delivery fee completely)
  const getOrderFoodTotal = (order: any) => {
    if (!order) return 0;
    const sub = Number(order.subtotal);
    if (!isNaN(sub) && sub > 0) return sub;
    const items = parseOrderItems(order.cartItems);
    const itemsTotal = items.reduce((sum, it) => sum + ((Number(it.price) || 0) * (Number(it.quantity) || 1)), 0);
    if (itemsTotal > 0) return itemsTotal;
    const deliveryFee = Number(order.deliveryFee) || 0;
    const price = Number(order.price) || 0;
    return Math.max(0, price - deliveryFee);
  };

  // Fetch Restaurant Orders from Backend
  const isFetchingOrdersRef = useRef(false);
  const lastSupplierOrdersFetchTimeRef = useRef<number>(0);

  // Fetch Restaurant Orders from Backend
  const fetchOrders = useCallback(async (isUserInitiated: any = false) => {
    if (isFetchingOrdersRef.current) return;
    try {
      isFetchingOrdersRef.current = true;
      const suppId = await resolveTargetSupplierId();
      if (!suppId) return;

      const suppToken = (await AsyncStorage.getItem('supplierToken')) || (await AsyncStorage.getItem('userToken'));
      const authHeaders: any = { 'X-Role': 'supplier' };
      if (suppToken) authHeaders.Authorization = `Bearer ${suppToken}`;

      if (isUserInitiated === true || orders.length === 0) {
        setLoadingOrders(true);
      }

      const targetRestoName = (restoDisplayName && restoDisplayName !== 'Restaurant Partner')
        ? restoDisplayName
        : (partnerProfile?.restaurantName || partnerProfile?.businessName || partnerProfile?.name || '');
      const suppPhone = user?.phone || partnerProfile?.phone;

      let queryUrl = `/bookings/my-bookings?userId=${encodeURIComponent(suppId)}&role=provider`;
      if (targetRestoName) {
        queryUrl += `&restaurantName=${encodeURIComponent(targetRestoName)}`;
      }
      if (suppPhone) {
        queryUrl += `&phone=${encodeURIComponent(suppPhone)}`;
      }

      let res = await api.get(queryUrl, {
        headers: authHeaders,
      });

      if (res.data?.success && Array.isArray(res.data.bookings)) {
        // Strict deduplication by order ID
        const uniqueList: any[] = [];
        const seenIds = new Set<string>();
        res.data.bookings.forEach((b: any) => {
          const id = getOrderId(b);
          if (id && !seenIds.has(id)) {
            seenIds.add(id);
            // 🛡️ Status Protection: If order is accepted in this session, never regress status back to pending
            if (acceptedOrderIdsRef.current.has(id)) {
              const currentSt = (b.status || '').toUpperCase();
              if (['ORDER_PLACED', 'PENDING_RESTAURANT', 'BOOKING_REQUESTED', 'RINGING', 'PENDING'].includes(currentSt)) {
                b.status = 'PREPARING';
                b.deliveryStatus = b.deliveryStatus || 'SEARCHING_FOR_RIDER';
              }
            }
            uniqueList.push(b);
          }
        });

        // Strict sort by Date and Time descending (newest first)
        uniqueList.sort((a, b) => {
          const timeA = new Date(a.createdAt || a.scheduledDate || 0).getTime();
          const timeB = new Date(b.createdAt || b.scheduledDate || 0).getTime();
          return timeB - timeA;
        });

        setOrders(uniqueList);
        lastSupplierOrdersFetchTimeRef.current = Date.now();
        AsyncStorage.setItem(`CACHE_SUPPLIER_ORDERS_${suppId}`, JSON.stringify(uniqueList)).catch(() => {});

        // If there is an active pending incoming food order created at least 20 seconds ago, show alert modal to supplier
        const pendingOrder = uniqueList.find((b: any) => {
          const id = getOrderId(b);
          if (!id) return false;
          // 🛡️ Skip any order already accepted, in-flight, or previously dismissed by supplier
          if (acceptedOrderIdsRef.current.has(id) || inFlightAcceptIdsRef.current.has(id) || dismissedOrderIdsRef.current.has(id)) {
            return false;
          }
          // Strict store isolation: only alert if this order strictly belongs to this store
          const oRestoId = String(b.restaurantId || b.supplierId || b.providerId || '');
          if (oRestoId && oRestoId !== suppId && oRestoId !== String(user?._id || user?.id)) {
            return false;
          }
          const st = (b.status || '').toUpperCase();
          const isPending =
            st === 'PENDING_RESTAURANT' ||
            st === 'PENDING' ||
            st === 'BOOKING_REQUESTED' ||
            st === 'ORDER_PLACED' ||
            st === 'RINGING';
          if (!isPending) return false;
          const createdMs = new Date(b.createdAt).getTime();
          const ageMs = Date.now() - createdMs;
          // Only alert for active fresh pending orders (between 20s and 3 minutes old)
          return !isNaN(createdMs) && ageMs >= 20000 && ageMs < 180000;
        });

        if (pendingOrder) {
          const bId = getOrderId(pendingOrder);
          if (!acceptedOrderIdsRef.current.has(bId) && !inFlightAcceptIdsRef.current.has(bId)) {
            setIncomingOrder((curr: any) => {
              if (curr && getOrderId(curr) === bId) return curr;
              return pendingOrder;
            });
            try {
              Vibration.vibrate([0, 500, 200, 500, 200, 500]);
            } catch (e) {}
            if (socket) {
              socket.emit('restaurant_ringing', {
                bookingId: bId,
                rideId: bId,
                restaurantId: suppId || pendingOrder.restaurantId || user?._id || user?.id,
                restaurantName: restoDisplayName || partnerProfile?.restaurantName || partnerProfile?.name || 'Restaurant Partner',
                customerId: pendingOrder.customerId,
              });
            }
          }
        } else {
          // If no pending order or active incomingOrder was already accepted, dismiss it
          setIncomingOrder((curr: any) => {
            if (curr) {
              const currId = getOrderId(curr);
              if (currId && (acceptedOrderIdsRef.current.has(currId) || inFlightAcceptIdsRef.current.has(currId))) {
                return null;
              }
            }
            return curr;
          });
        }
      }
    } catch (e) {
      console.log('[RIDER HOME FETCH ORDERS ERROR]', e);
    } finally {
      isFetchingOrdersRef.current = false;
      setLoadingOrders(false);
    }
  }, [user?._id, user?.id, user?.phone, resolveTargetSupplierId, restoDisplayName, partnerProfile, socket, orders.length]);

  // ⚡ Instant Cache Hydration: Load cached orders in 0ms so supplier sees orders instantly
  useEffect(() => {
    let isMounted = true;
    const hydrateCachedSupplierOrders = async () => {
      try {
        const suppId = await resolveTargetSupplierId();
        if (!suppId) return;
        const cached = await AsyncStorage.getItem(`CACHE_SUPPLIER_ORDERS_${suppId}`);
        if (cached && isMounted) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setOrders(parsed);
          }
        }
      } catch (e) {}
    };
    hydrateCachedSupplierOrders();
    return () => { isMounted = false; };
  }, [resolveTargetSupplierId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        fetchOrders(true),
        fetchWalletBalance(),
        fetchReachedRidersCount(),
      ]);
    } catch (e) {}
    setRefreshing(false);
  }, [fetchOrders, fetchWalletBalance, fetchReachedRidersCount]);

  // Production-Grade Status Synchronization (Source of truth: Backend DB)
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      const syncAuthoritativeStatus = async () => {
        const userId = user?._id || user?.id;
        try {
          // Check local supplierUser cache first
          const cachedSupp = await AsyncStorage.getItem('supplierUser');
          if (cachedSupp && isMounted) {
            const parsed = JSON.parse(cachedSupp);
            const sName = parsed.restaurantName || parsed.businessName || parsed.storeName || (parsed.role === 'supplier' ? parsed.name : null);
            if (sName) {
              setRestoDisplayName(sName);
            }
          }

          // 1. Fetch authoritative status directly from Backend API / Database
          const res = await api.get('/auth/me');
          if (res.data && res.data.success && res.data.user) {
            const dbUser = res.data.user;
            const isDbOnline = dbUser.restaurant_status === 'online' || dbUser.isOnline === true;

            if (isMounted) {
              setIsOnline(isDbOnline);
              const sName = dbUser.restaurantName || dbUser.businessName || dbUser.storeName || (dbUser.role === 'supplier' ? dbUser.name : null);
              if (sName) {
                setRestoDisplayName(sName);
              }
              const dbAddr = dbUser.fullAddress || dbUser.address || dbUser.location;
              if (dbAddr) {
                setCurrentLocation(dbAddr);
              }
              if (dbUser.categoryName || dbUser.businessCategoryName || dbUser.partnerType) {
                setPartnerProfile((prev: any) => ({ ...(prev || {}), ...dbUser }));
                AsyncStorage.setItem('supplierUser', JSON.stringify({ ...(cachedSupp ? JSON.parse(cachedSupp) : {}), ...dbUser })).catch(() => {});
              }
              try { rideStore?.setRiderOnline?.(isDbOnline); } catch (e) {}
              if (userId) {
                await AsyncStorage.setItem(`restaurant_status_${userId}`, JSON.stringify(isDbOnline));
              }
            }
            return;
          }
        } catch (err) {
          console.warn('[STATUS SYNC] Backend API offline/network error, using restaurant local cache');
        }

        // 2. Offline Fallback: Restaurant-specific local storage cache
        try {
          if (userId) {
            const cached = await AsyncStorage.getItem(`restaurant_status_${userId}`);
            if (cached !== null && isMounted) {
              const isCachedOnline = JSON.parse(cached) === true;
              setIsOnline(isCachedOnline);
              try { rideStore?.setRiderOnline?.(isCachedOnline); } catch (e) {}
            }
          }
        } catch (e) {}
      };

      syncAuthoritativeStatus();
      const now = Date.now();
      if (now - lastSupplierOrdersFetchTimeRef.current > 20000) {
        fetchOrders(false);
      }
      loadSavedStoreLocation();

      const onBackPress = () => {
        if (incomingOrder) {
          return true;
        }
        navigation.navigate('RoleSelection');
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => {
        isMounted = false;
        sub.remove();
      };
    }, [user?._id, user?.id, navigation, fetchOrders, loadSavedStoreLocation, incomingOrder])
  );

  // 5-second continuous background polling on screen to guarantee 100% order pickup
  useEffect(() => {
    const interval = setInterval(() => {
      fetchOrders(false);
      fetchReachedRidersCount();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchOrders, fetchReachedRidersCount]);

  // Real-Time Socket Listener for Incoming Orders & Status Sync
  useEffect(() => {
    if (!socket) return;
    const registerSocket = async () => {
      const myId = await resolveTargetSupplierId();
      const uId = (user?._id || user?.id)?.toString();
      const myPartnerId = (user?.partnerId || partnerProfile?.partnerId)?.toString();

      if (myId) {
        socket.emit('join_restaurant_room', { supplierId: myId, restaurantId: myId, partnerId: myPartnerId });
        socket.emit('join_supplier_room', { supplierId: myId });
        socket.emit('register_user', myId);
        socket.emit('join_room', `supplier:${myId}`);
        socket.emit('join_room', `supplier_${myId}`);
        socket.emit('join_room', `restaurant_${myId}`);
      }
      if (uId && uId !== myId) {
        socket.emit('join_restaurant_room', { supplierId: uId, restaurantId: uId, partnerId: myPartnerId });
        socket.emit('join_supplier_room', { supplierId: uId });
        socket.emit('register_user', uId);
        socket.emit('join_room', `supplier:${uId}`);
        socket.emit('join_room', `supplier_${uId}`);
        socket.emit('join_room', `restaurant_${uId}`);
      }
      socket.emit('join_room', 'online_suppliers');
      socket.emit('join_room', 'suppliers_room');
      console.log(`[RIDER HOME] Socket registered for myId=${myId}, uId=${uId}, myPartnerId=${myPartnerId}`);
    };

    registerSocket();
    socket.on('connect', registerSocket);

    const onIncomingOrder = async (data: any) => {
      console.log('📢 [RESTAURANT HOME] Incoming food order received:', data);
      const bId = getOrderId(data);
      if (!bId) return;
      const cleanBId = bId.toString();

      // 🛡️ Skip if this order was already accepted or is in-flight
      if (acceptedOrderIdsRef.current.has(cleanBId) || inFlightAcceptIdsRef.current.has(cleanBId)) {
        console.log(`🛑 [RESTAURANT HOME] Discarding incoming event for already accepted/in-flight order #${cleanBId}`);
        return;
      }

      const orderData = data.booking || data;
      const myId = (await resolveTargetSupplierId())?.toString();
      const uId = (user?._id || user?.id)?.toString();
      const myPartnerId = (user?.partnerId || partnerProfile?.partnerId)?.toString();

      const reqRestoId = (orderData.restaurantId || orderData.supplierId || orderData.partnerId || orderData.providerId || data.restaurantId || data.supplierId)?.toString();

      // STRICT ROLE & IDENTITY GUARDS:
      if ((user?.role || '').toLowerCase() === 'customer') {
        console.log(`🛑 [RESTAURANT HOME] Logged-in user is Customer. Ignoring incoming supplier order #${bId}`);
        return;
      }

      // Verify that this order strictly belongs to THIS logged-in supplier
      if (reqRestoId && reqRestoId !== 'null' && reqRestoId !== 'undefined') {
        const isMatch =
          (myId && reqRestoId === myId) ||
          (uId && reqRestoId === uId) ||
          (myPartnerId && reqRestoId === myPartnerId) ||
          (partnerProfile?.businessId && reqRestoId === partnerProfile?.businessId?.toString()) ||
          (user?.businessId && reqRestoId === (user as any)?.businessId?.toString());
        if (!isMatch) {
          console.log(`🛑 [RESTAURANT HOME] Ignoring incoming order #${bId}: target restaurantId (${reqRestoId}) does not match this supplier (${myId || uId}).`);
          return;
        }
      } else {
        console.log(`🛑 [RESTAURANT HOME] Ignoring incoming order #${bId} with missing restaurantId.`);
        return;
      }

      console.log('✅ [RESTAURANT HOME] Instantly showing incoming order modal for supplier:', bId);

      // 1. Immediately show modal on restaurant screen (0ms delay)
      setIncomingOrder((curr: any) => {
        if (curr && getOrderId(curr) === bId) return curr;
        return orderData;
      });
      try {
        SoundService.playIncomingOrderAlert();
      } catch (sErr) {}
      try {
        Vibration.vibrate([0, 500, 200, 500, 200, 500]);
      } catch (e) {}

      // 2. ⚡ Emit ringing acknowledgement back to customer screen ONLY AFTER modal is displayed!
      socket.emit('restaurant_ringing', {
        bookingId: bId,
        rideId: bId,
        restaurantId: myId || uId,
        restaurantName: restoDisplayName || partnerProfile?.restaurantName || partnerProfile?.name || 'Restaurant Partner',
        customerId: data?.customerId,
      });

      // 3. Add to orders list deduplicated
      setOrders((prev) => {
        const exists = prev.some((o) => getOrderId(o) === bId);
        if (exists) {
          return prev.map((o) => (getOrderId(o) === bId ? { ...o, ...data } : o));
        }
        return [data, ...prev];
      });
    };

    const onStatusUpdate = (data: any) => {
      const bId = data?.bookingId || data?.rideId;
      if (!bId) return;
      const cleanBId = bId.toString();
      const st = (data.status || '').toUpperCase();

      // 🛡️ Record acceptance if status is PREPARING or RESTAURANT_ACCEPTED
      if (st === 'PREPARING' || st === 'RESTAURANT_ACCEPTED' || st === 'FOOD_READY' || st === 'READY') {
        acceptedOrderIdsRef.current.add(cleanBId);
        // Dismiss ringing incoming modal if matching this order
        setIncomingOrder((curr: any) => (curr && getOrderId(curr) === cleanBId ? null : curr));
      }

      if (st === 'COMPLETED' || st === 'DELIVERED' || st === 'SERVICE_COMPLETED') {
        fetchWalletBalance();
      }
      if (st === 'CANCELLED' || st.includes('CANCEL')) {
        onOrderCancelledOrTimedOut(data);
        return;
      }
      fetchReachedRidersCount();
      setOrders((prev) =>
        prev.map((o) => {
          if ((o.bookingId || o.rideId) === bId) {
            const currentSt = (o.status || '').toUpperCase();
            if (currentSt === 'CANCELLED' && st !== 'CANCELLED') {
              console.log(`🛡️ [RIDER HOME] Blocked stale status "${st}" on cancelled order #${bId}`);
              return o;
            }
            return {
              ...o,
              status: data.status,
              ...(data.riderStatus ? { riderStatus: data.riderStatus } : {}),
              ...(data.deliveryStatus ? { deliveryStatus: data.deliveryStatus } : {}),
              ...(data.providerId ? { providerId: data.providerId } : {}),
              ...(data.providerName ? { providerName: data.providerName } : {}),
              ...(data.providerPhone ? { providerPhone: data.providerPhone } : {}),
              ...(data.providerPhoto ? { providerPhoto: data.providerPhoto } : {}),
            };
          }
          return o;
        })
      );
    };

    const onRiderReachedRestaurant = (data: any) => {
      const bId = data?.bookingId || data?.rideId;
      if (!bId) return;
      console.log('🛵 [RESTAURANT HOME] Rider reached restaurant:', data);

      // Play alert sound & vibration to notify supplier
      try {
        SoundService.playIncomingOrderAlert();
        setTimeout(() => {
          SoundService.stopIncomingOrderAlert();
        }, 5000);
      } catch (e) {}

      try {
        Vibration.vibrate([0, 500, 200, 500]);
      } catch (e) {}

      const riderDisplayName = data.riderName || 'Assigned Delivery Partner';
      Alert.alert(
        '🛵 Rider Arrived at Store!',
        `${riderDisplayName} has arrived at your store for Order #${bId.slice(-6)}. Please prepare to hand over the package!`,
        [
          { text: 'View Rider', onPress: () => setShowRidersModal(true) },
          { text: 'OK', style: 'default' }
        ]
      );

      fetchReachedRidersCount();
      setOrders((prev) =>
        prev.map((o) => {
          if ((o.bookingId || o.rideId) === bId) {
            return {
              ...o,
              riderStatus: 'REACHED_RESTAURANT',
              deliveryStatus: 'RIDER_AT_RESTAURANT',
              providerId: data.riderId || o.providerId,
              providerName: data.riderName || o.providerName,
              providerPhone: data.riderPhone || o.providerPhone,
              providerPhoto: data.riderPhoto || o.providerPhoto,
            };
          }
          return o;
        })
      );
    };

    const onOrderCancelledOrTimedOut = (data: any) => {
      const bId = String(data?.bookingId || data?.rideId || data?.orderId || data?._id || '');
      if (!bId) return;
      console.log('📢 [RESTAURANT HOME] Order cancelled or declined:', data);

      const isMatch = (o: any) => {
        const id = String(o?.bookingId || o?.rideId || o?.orderId || o?._id || '');
        return id === bId || id.endsWith(bId) || bId.endsWith(id);
      };

      // Stop incoming order alert if this order was ringing
      setIncomingOrder((curr: any) => {
        if (curr && isMatch(curr)) {
          SoundService.stopIncomingOrderAlert();
          return null;
        }
        return curr;
      });

      // Play alert vibration and tone on cancellation
      try {
        Vibration.vibrate([0, 400, 200, 400]);
        SoundService.playIncomingOrderAlert();
        setTimeout(() => {
          SoundService.stopIncomingOrderAlert();
        }, 3500);
      } catch (e) {}

      fetchReachedRidersCount();
      // 0ms INSTANT STATE UPDATE: Mark CANCELLED so it immediately vanishes from active tabs without reload!
      setOrders((prev) =>
        prev.map((o) => {
          if (isMatch(o)) {
            return {
              ...o,
              status: 'CANCELLED',
              riderStatus: 'CANCELLED',
              deliveryStatus: 'CANCELLED',
              cancellationReason: data.reason || data.cancellationReason || 'Cancelled by customer',
            };
          }
          return o;
        })
      );
      fetchOrders();

      const cancelMsg = data?.reason || data?.cancellationReason || 'Customer cancelled the order';
      const custDisplayName = data?.customerName || 'Customer';

      // 1. Popup Modal
      setCancellationPopup({
        visible: true,
        orderId: bId,
        reason: cancelMsg,
        cancelledBy: data?.cancelledBy || 'CUSTOMER',
        customerName: custDisplayName,
        restaurantName: data?.restaurantName || restoDisplayName,
      });

      // 2. Alert Notification banner fallback
      Alert.alert(
        '❌ Order Cancelled',
        `Order #${bId.slice(-6)} has been cancelled by ${custDisplayName}.\nReason: ${cancelMsg}`,
        [{ text: 'OK', style: 'default' }]
      );
    };

    const onRiderArrivedRemoved = (data: any) => {
      console.log('🛵 [RESTAURANT HOME] Rider arrived removed event received:', data);
      fetchReachedRidersCount();
    };

    const onFoodPickedUp = (data: any) => {
      const bId = data?.bookingId || data?.rideId;
      if (!bId) return;
      console.log('🛵 [SUPPLIER HOME] Order picked up by rider:', data);
      setOrders((prev) =>
        prev.map((o) => {
          if ((o.bookingId || o.rideId) === bId) {
            return {
              ...o,
              status: 'OUT_FOR_DELIVERY',
              riderStatus: 'OUT_FOR_DELIVERY',
              deliveryStatus: 'OUT_FOR_DELIVERY',
            };
          }
          return o;
        })
      );
      fetchOrders();
    };

    socket.on('new_food_order', onIncomingOrder);
    socket.on('new_ride_request', onIncomingOrder);
    socket.on('ride_request', onIncomingOrder);
    socket.on('service_request', onIncomingOrder);
    socket.on('new_booking_request', onIncomingOrder);
    socket.on('BOOKING_REQUEST', onIncomingOrder);
    socket.on('FOOD_ORDER', onIncomingOrder);
    socket.on('DELIVERY_REQUEST', onIncomingOrder);
    socket.on('new_order', onIncomingOrder);
    socket.on('booking_status_updated', onStatusUpdate);
    socket.on('order_status_updated', onStatusUpdate);
    socket.on('food_picked_up', onFoodPickedUp);
    socket.on('rider_reached_restaurant', onRiderReachedRestaurant);
    socket.on('rider_arrived_removed', onRiderArrivedRemoved);
    socket.on('order_timed_out', onOrderCancelledOrTimedOut);
    socket.on('service_cancelled', onOrderCancelledOrTimedOut);
    socket.on('ride_cancelled', onOrderCancelledOrTimedOut);
    socket.on('order_cancelled', onOrderCancelledOrTimedOut);
    socket.on('ORDER_CANCELLED', onOrderCancelledOrTimedOut);
    socket.on('DELIVERY_REQUEST_CANCELLED', onOrderCancelledOrTimedOut);
    socket.on('FOOD_ORDER_UPDATED', (data: any) => {
      const st = (data?.status || '').toUpperCase();
      if (st === 'CANCELLED' || st.includes('CANCEL')) {
        onOrderCancelledOrTimedOut(data);
      } else {
        onStatusUpdate(data);
      }
    });
    socket.on('RESTAURANT_DECLINED', onOrderCancelledOrTimedOut);
    socket.on('booking_cancelled', onOrderCancelledOrTimedOut);
    socket.on('booking_cancelled_by_customer', onOrderCancelledOrTimedOut);

    return () => {
      socket.off('connect', registerSocket);
      socket.off('new_food_order', onIncomingOrder);
      socket.off('new_ride_request', onIncomingOrder);
      socket.off('ride_request', onIncomingOrder);
      socket.off('service_request', onIncomingOrder);
      socket.off('new_booking_request', onIncomingOrder);
      socket.off('BOOKING_REQUEST', onIncomingOrder);
      socket.off('FOOD_ORDER', onIncomingOrder);
      socket.off('DELIVERY_REQUEST', onIncomingOrder);
      socket.off('new_order', onIncomingOrder);
      socket.off('booking_status_updated', onStatusUpdate);
      socket.off('order_status_updated', onStatusUpdate);
      socket.off('food_picked_up', onFoodPickedUp);
      socket.off('rider_reached_restaurant', onRiderReachedRestaurant);
      socket.off('rider_arrived_removed', onRiderArrivedRemoved);
      socket.off('order_timed_out', onOrderCancelledOrTimedOut);
      socket.off('service_cancelled', onOrderCancelledOrTimedOut);
      socket.off('ride_cancelled', onOrderCancelledOrTimedOut);
      socket.off('order_cancelled', onOrderCancelledOrTimedOut);
      socket.off('ORDER_CANCELLED', onOrderCancelledOrTimedOut);
      socket.off('DELIVERY_REQUEST_CANCELLED', onOrderCancelledOrTimedOut);
      socket.off('FOOD_ORDER_UPDATED');
      socket.off('RESTAURANT_DECLINED', onOrderCancelledOrTimedOut);
      socket.off('booking_cancelled', onOrderCancelledOrTimedOut);
      socket.off('booking_cancelled_by_customer', onOrderCancelledOrTimedOut);
      socket.off('order_timed_out', onOrderCancelledOrTimedOut);
      socket.off('service_cancelled', onOrderCancelledOrTimedOut);
      socket.off('ride_cancelled', onOrderCancelledOrTimedOut);
      socket.off('order_cancelled', onOrderCancelledOrTimedOut);
      socket.off('RESTAURANT_DECLINED', onOrderCancelledOrTimedOut);
      socket.off('booking_cancelled', onOrderCancelledOrTimedOut);
      socket.off('booking_cancelled_by_customer', onOrderCancelledOrTimedOut);
    };
  }, [socket, user?._id, user?.id, partnerProfile?._id, partnerProfile?.id, fetchReachedRidersCount, fetchOrders]);

  const handleAcceptOrder = async (order: any, prepTime?: number) => {
    const bId = order?.bookingId || order?.rideId || order?._id;
    if (!bId) return;
    const cleanId = bId.toString();

    // 🛡️ 1. In-flight guard: Prevent duplicate click / concurrent requests
    if (inFlightAcceptIdsRef.current.has(cleanId) || acceptingOrderId === cleanId) {
      console.log(`⏳ [ACCEPT GUARD] Order #${cleanId} acceptance already in progress. Ignoring duplicate click.`);
      return;
    }

    // 🛡️ 2. Already accepted guard: Never accept an already accepted order
    const currStatus = (order?.status || '').toUpperCase();
    if (
      acceptedOrderIdsRef.current.has(cleanId) ||
      ['PREPARING', 'RESTAURANT_ACCEPTED', 'FOOD_READY', 'READY_FOR_PICKUP', 'READY', 'PROVIDER_ACCEPTED', 'RIDER_ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(currStatus)
    ) {
      console.log(`⚠️ [ACCEPT GUARD] Order #${cleanId} has already been accepted (status: ${currStatus}).`);
      setIncomingOrder((curr: any) => (curr && (curr.bookingId || curr.rideId || curr._id)?.toString() === cleanId ? null : curr));
      return;
    }

    const effectivePrepTime = prepTime || selectedPrepTime || 15;

    // 🛡️ 3. One-Click Immediate Processing State Lock
    inFlightAcceptIdsRef.current.add(cleanId);
    setAcceptingOrderId(cleanId);

    try {
      try { Vibration.cancel(); } catch (e) {}
      try { SoundService.stopIncomingOrderAlert(); } catch (e) {}

      // Immediately dismiss incoming order modal so user cannot click again
      setIncomingOrder((curr: any) => (curr && (curr.bookingId || curr.rideId || curr._id)?.toString() === cleanId ? null : curr));
      setActiveTab('Preparing');

      const now = new Date();
      const endsAt = new Date(now.getTime() + effectivePrepTime * 60 * 1000);

      // Optimistic status update
      setOrders((prev) =>
        prev.map((o) =>
          (o.bookingId || o.rideId || o._id)?.toString() === cleanId
            ? {
                ...o,
                status: 'PREPARING',
                prepStartedAt: now,
                prepEndsAt: endsAt,
                preparationTime: effectivePrepTime,
                deliveryStatus: 'SEARCHING_FOR_RIDER',
              }
            : o
        )
      );

      const targetSuppId = await resolveTargetSupplierId();
      const res = await api.put('/bookings/restaurant-accept', {
        bookingId: cleanId,
        restaurantId: targetSuppId,
        preparationTime: effectivePrepTime,
      });

      if (res.data?.success) {
        // Record as accepted
        acceptedOrderIdsRef.current.add(cleanId);

        // Display "Order Accepted!" popup exactly once
        showOrderAcceptedPopupOnce(cleanId, effectivePrepTime);

        // Fetch fresh orders
        fetchOrders();
      } else {
        throw new Error(res.data?.message || 'Could not accept order.');
      }
    } catch (e: any) {
      console.error('[ACCEPT ORDER ERROR]', e);
      // Handle idempotent already-accepted response gracefully
      if (e.response?.data?.alreadyAccepted) {
        acceptedOrderIdsRef.current.add(cleanId);
        showOrderAcceptedPopupOnce(cleanId, effectivePrepTime);
        fetchOrders();
      } else {
        Alert.alert('Error', e.response?.data?.message || e.message || 'Could not accept order. Please check network connection and try again.');
      }
    } finally {
      inFlightAcceptIdsRef.current.delete(cleanId);
      setAcceptingOrderId(null);
    }
  };

  const handleMarkReady = async (order: any) => {
    const bId = order?.bookingId || order?.rideId;
    if (!bId) return;
    try {
      const targetSuppId = await resolveTargetSupplierId();
      await api.put('/bookings/food-ready', {
        bookingId: bId,
        restaurantId: targetSuppId,
      });
      setActiveTab('Ready');
      setOrders((prev) =>
        prev.map((o) =>
          (o.bookingId || o.rideId) === bId ? { ...o, status: 'FOOD_READY' } : o
        )
      );
      fetchOrders();
      Alert.alert(`${terminology.itemsNoun} Ready!`, 'Order marked ready. Customer notified and waiting for delivery partner pickup.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not update order status.');
    }
  };

  const handleHandoverToRider = async (order: any) => {
    const bId = order?.bookingId || order?.rideId || order?._id;
    if (!bId) return;
    const cleanId = bId.toString();
    const riderDisplayName = order.providerName || order.riderName || 'डिलीवरी पार्टनर';

    Alert.alert(
      '📦 ऑर्डर हैंडओवर (Supplier Pickup)',
      `क्या आपने ${riderDisplayName} को ऑर्डर #${cleanId.slice(-6)} सौंप दिया है?`,
      [
        { text: 'रद्द करें', style: 'cancel' },
        {
          text: 'हाँ, राइडर को सौंप दिया',
          onPress: async () => {
            try {
              const targetSuppId = await resolveTargetSupplierId();
              await api.put('/bookings/supplier-handover', {
                bookingId: cleanId,
                restaurantId: targetSuppId,
                providerId: order.providerId,
              });

              if (socket) {
                socket.emit('food_picked_up', {
                  rideId: cleanId,
                  bookingId: cleanId,
                  customerId: order.customerId,
                  restaurantId: targetSuppId,
                  riderId: order.providerId,
                });
                socket.emit('order_status_updated', {
                  rideId: cleanId,
                  bookingId: cleanId,
                  status: 'OUT_FOR_DELIVERY',
                  riderStatus: 'OUT_FOR_DELIVERY',
                });
              }

              setOrders((prev) =>
                prev.map((o) =>
                  (o.bookingId || o.rideId || o._id)?.toString() === cleanId
                    ? { ...o, status: 'OUT_FOR_DELIVERY', riderStatus: 'OUT_FOR_DELIVERY', deliveryStatus: 'OUT_FOR_DELIVERY' }
                    : o
                )
              );
              setActiveTab('Out for delivery');
              fetchOrders();

              Alert.alert(
                'ऑर्डर हैंडओवर सफल! 🛵',
                `ऑर्डर #${cleanId.slice(-6)} ${riderDisplayName} को सौंप दिया गया है। आर्डर अब 'Out for delivery' में है।`
              );
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Could not update handover status.');
            }
          },
        },
      ]
    );
  };

  const handleRejectOrder = async (order: any) => {
    const bId = order?.bookingId || order?.rideId;
    if (!bId) return;
    try {
      dismissedOrderIdsRef.current.add(String(bId));
      try { Vibration.cancel(); } catch (e) {}
      try { SoundService.stopIncomingOrderAlert(); } catch (e) {}
      const targetSuppId = await resolveTargetSupplierId();
      await api.put('/bookings/restaurant-decline', {
        bookingId: bId,
        restaurantId: targetSuppId,
        reason: 'Restaurant unable to prepare order right now',
      });
      setIncomingOrder(null);
      setOrders((prev) =>
        prev.map((o) =>
          (o.bookingId || o.rideId) === bId ? { ...o, status: 'RESTAURANT_DECLINED' } : o
        )
      );
      fetchOrders();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not decline order.');
    }
  };

  const handleCompleteOrder = async (order: any) => {
    const bId = order?.bookingId || order?.rideId;
    if (!bId) return;
    const foodTotal = getOrderFoodTotal(order);
    try {
      const targetSuppId = await resolveTargetSupplierId();
      await api.put('/bookings/status', {
        bookingId: bId,
        status: 'COMPLETED',
        providerId: targetSuppId,
      });
      setOrders((prev) =>
        prev.map((o) =>
          (o.bookingId || o.rideId) === bId ? { ...o, status: 'COMPLETED' } : o
        )
      );
      fetchOrders();
      fetchWalletBalance();
      Alert.alert(
        'Order Completed! 🎉',
        `Order #${bId.slice(-6)} completed. ₹${foodTotal} has been added to your earnings!`
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not complete order.');
    }
  };

  const promptCancelOrder = (order: any) => {
    setOrderToCancel(order);
    setSelectedCancelReason(CANCELLATION_REASONS[0]);
    setCancelModalVisible(true);
  };

  const confirmCancelOrder = async () => {
    if (!orderToCancel) return;
    const bId = orderToCancel?.bookingId || orderToCancel?.rideId;
    if (!bId) return;
    try {
      const targetSuppId = await resolveTargetSupplierId();
      await api.put('/bookings/restaurant-decline', {
        bookingId: bId,
        restaurantId: targetSuppId,
        reason: selectedCancelReason || 'Cancelled by restaurant',
      });
      setCancelModalVisible(false);
      setOrderToCancel(null);
      fetchReachedRidersCount();
      setOrders((prev) =>
        prev.map((o) =>
          (o.bookingId || o.rideId) === bId
            ? { ...o, status: 'RESTAURANT_DECLINED', cancellationReason: selectedCancelReason }
            : o
        )
      );
      fetchOrders();
      setCancellationPopup({
        visible: true,
        orderId: bId,
        reason: selectedCancelReason || 'Cancelled by store',
        cancelledBy: 'STORE',
        customerName: orderToCancel?.customerName || orderToCancel?.userName,
        restaurantName: restoDisplayName,
      });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not cancel order.');
    }
  };

  const filteredOrders = orders
    .filter((order) => {
      const orderId = getOrderId(order);
      const activeIncomingId = getOrderId(incomingOrder);

      // If this order is currently active in the Incoming Modal, DO NOT display in the background list
      if (activeIncomingId && orderId === activeIncomingId) {
        return false;
      }

      if (activeBottomNav === 'Order History' || activeTab === 'Order History') {
        return true;
      }

      const st = (order.status || '').toUpperCase();
      if (activeTab === 'Preparing' || activeTab === 'Packing') {
        // Strictly show orders that are accepted and cooking/packing - NOT pending/unaccepted orders!
        return (
          st === 'RESTAURANT_ACCEPTED' ||
          st === 'ACCEPTED' ||
          st === 'PROVIDER_ACCEPTED' ||
          st === 'PREPARING' ||
          st === 'PACKING'
        );
      }
      if (activeTab === 'Ready') {
        return st === 'FOOD_READY' || st === 'READY_FOR_PICKUP' || st === 'READY';
      }
      if (activeTab === 'Out for delivery') {
        return (
          st === 'OUT_FOR_DELIVERY' ||
          st === 'STARTED' ||
          st === 'SERVICE_STARTED'
        );
      }
      if (activeTab === 'Scheduled') {
        return st === 'SCHEDULED';
      }
      if (activeTab === 'Completed') {
        return st === 'COMPLETED' || st === 'SERVICE_COMPLETED' || st === 'DELIVERED';
      }
      return false;
    })
    .sort((a, b) => {
      const timeA = new Date(a.createdAt || a.scheduledDate || 0).getTime();
      const timeB = new Date(b.createdAt || b.scheduledDate || 0).getTime();
      return timeB - timeA;
    });

  // Load saved store location on mount
  useEffect(() => {
    loadSavedStoreLocation();
  }, [loadSavedStoreLocation]);

  // Button press scale animation
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.92,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  // Toggle Switch Animation (Super-Fast 100fps Spring Response)
  const switchAnim = useRef(new Animated.Value(isOnline ? 1 : 0)).current;

  // Wi-Fi Pulse & Live Indicator Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.8)).current;
  const dotPulseAnim = useRef(new Animated.Value(1)).current;

  // Animate switch instantly when isOnline changes
  useEffect(() => {
    Animated.spring(switchAnim, {
      toValue: isOnline ? 1 : 0,
      speed: 60,
      bounciness: 6,
      useNativeDriver: false,
    }).start();
  }, [isOnline]);

  useEffect(() => {
    if (isOnline) {
      const pulseLoop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.6,
              duration: 1200,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(opacityAnim, {
              toValue: 0,
              duration: 1200,
              useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
              toValue: 0.8,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(dotPulseAnim, {
              toValue: 0.3,
              duration: 600,
              useNativeDriver: true,
            }),
            Animated.timing(dotPulseAnim, {
              toValue: 1,
              duration: 600,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      pulseLoop.start();
      return () => pulseLoop.stop();
    }
  }, [isOnline]);

  // Ultra-Fast Instant Optimistic Status Toggle (0ms UI latency + Direct Animation + Async DB Sync)
  const toggleOnlineStatus = () => {
    const targetStatusBool = !isOnline;
    const targetStatusStr = targetStatusBool ? 'online' : 'offline';
    const targetId = user?._id || user?.id;

    // ⚡ 0. INSTANT MICROSECOND ANIMATION FLIP (0ms Latency!)
    try {
      Vibration.vibrate(40);
    } catch (e) {}
    switchAnim.setValue(targetStatusBool ? 1 : 0);

    // ⚡ 1. INSTANT OPTIMISTIC UI STATE UPDATE
    setIsOnline(targetStatusBool);
    try {
      rideStore?.setRiderOnline?.(targetStatusBool);
    } catch (e) {}

    // ⚡ 2. Instant Background Local Disk Persistence
    if (targetId) {
      AsyncStorage.setItem(`restaurant_status_${targetId}`, JSON.stringify(targetStatusBool)).catch(() => {});
    }

    // ⚡ 3. Instant Real-Time WebSocket Emit
    if (socket && socket.connected) {
      socket.emit('toggle_online_status', { userId: targetId, isOnline: targetStatusBool, isAvailable: targetStatusBool });
    }

    const storeLat = partnerProfile?.businessLatitude || partnerProfile?.latitude || 0;
    const storeLon = partnerProfile?.businessLongitude || partnerProfile?.longitude || 0;
    const storeAddr = currentLocation && !currentLocation.includes('Fetching')
      ? currentLocation
      : (partnerProfile?.businessAddress || partnerProfile?.fullAddress || partnerProfile?.address || '');

    // ⚡ 4. Asynchronous Non-Blocking Backend REST API Sync
    api.put('/profile/status', {
      status: targetStatusStr,
      isOnline: targetStatusBool,
      isAvailable: targetStatusBool,
      latitude: storeLat,
      longitude: storeLon,
      businessLatitude: storeLat,
      businessLongitude: storeLon,
      address: storeAddr,
      fullAddress: storeAddr,
    }).then((res) => {
      console.log(`⚡ [SUPER FAST STATUS SYNC] MongoDB updated to '${targetStatusStr}' with coords (${storeLat}, ${storeLon})`);
    }).catch((err) => {
      console.log('[SUPER FAST STATUS NOTICE] Network retry queued:', err?.message || err);
    });
  };

  const pillBgColor = switchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#475569', '#22C55E'],
  });

  const restaurantName = (restoDisplayName && restoDisplayName !== 'Restaurant Partner')
    ? restoDisplayName
    : (partnerProfile?.restaurantName || partnerProfile?.businessName || partnerProfile?.storeName || (partnerProfile?.role === 'supplier' ? partnerProfile?.name : null) || (catType === 'restaurant' ? 'Restaurant Partner' : 'Store Partner'));

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          try {
            const FastStorage = require('../services/FastStorage').default;
            if (FastStorage?.clearUserSession) await FastStorage.clearUserSession();
          } catch (_) {}
          try {
            const { clearSupplierLocationCache } = require('../services/LocationAddressService');
            if (clearSupplierLocationCache) await clearSupplierLocationCache();
          } catch (_) {}
          if (logout) {
            await logout('SUPPLIER');
          } else {
            try {
              await AsyncStorage.removeItem('supplierToken');
              await AsyncStorage.removeItem('registeredSupplierId');
              await AsyncStorage.removeItem('activeRole');
              await AsyncStorage.removeItem('supplierUser');
            } catch (e) {}
            navigation.reset({
              index: 0,
              routes: [{ name: 'RoleSelection' }],
            });
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.safeArea, isDark && { backgroundColor: '#0B0F19' }]}>
      <StatusBar hidden={false} barStyle="light-content" backgroundColor={isDark ? '#0F172A' : '#0066FF'} translucent={false} />

      {/* MAIN SCROLL VIEW */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContainer, isDark && { backgroundColor: '#0B0F19' }]}
        onScroll={handleSupplierScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0066FF']} />}
      >
        {/* TOP HEADER */}
        <View style={[styles.topHeader, isDark && { backgroundColor: '#0F172A' }]}>
          {/* Left: Store Name & Location */}
          <View style={styles.restoHeaderLeft}>
            <View style={styles.headerTitleRow}>
              <View style={styles.storeHeaderIconCircle}>
                <Icon name="storefront" size={18} color="#0066FF" />
              </View>
              <Text style={styles.restoTitleText} numberOfLines={1}>
                {restaurantName || (catType === 'restaurant' ? 'Restaurant Partner' : 'Store Partner')}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.locationRow}
              onPress={handleUpdateShopLocation}
              activeOpacity={0.7}
            >
              <Icon name="location-sharp" size={13} color="#FFFFFF" style={{ marginRight: 3 }} />
              <Text style={styles.locationText} numberOfLines={1} ellipsizeMode="tail">
                {(() => {
                  if (!currentLocation || currentLocation.includes('Fetching')) return currentLocation || 'Location';
                  const displayAddr = currentLocation.replace(/,?\s*(India|IN)\s*$/i, '').trim();
                  return displayAddr || 'Store Location';
                })()}
              </Text>
              <Icon name="chevron-down" size={12} color="#FFFFFF" style={{ opacity: 0.9, marginLeft: 3 }} />
            </TouchableOpacity>
          </View>

          {/* Right: Toggle Button & Icons */}
          <View style={styles.headerRightActions}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={toggleOnlineStatus}
              disabled={isUpdatingStatus}
              style={[
                styles.onlinePill,
                { backgroundColor: isOnline ? '#22C55E' : '#EF4444', opacity: isUpdatingStatus ? 0.7 : 1 },
              ]}
            >
              <View style={styles.pillDotRow}>
                <View
                  style={[
                    styles.dotCircle,
                    { backgroundColor: '#FFFFFF' },
                  ]}
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Text style={styles.onlinePillText}>
                    {isOnline ? 'Online' : 'Offline'}
                  </Text>
                  <Icon name="chevron-down" size={11} color="#FFFFFF" />
                </View>
              </View>
            </TouchableOpacity>

            {/* Notification Icon */}
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => navigation.navigate('Notifications')}
            >
              <Icon name="notifications" size={18} color="#FFFFFF" />
              {unreadNotifCount > 0 && (
                <View style={styles.notifDot}>
                  <Text style={styles.notifDotText}>
                    {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Chat / Message Icon */}
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => {
                try { navigation.navigate('ChatList'); } catch (e) {}
              }}
              activeOpacity={0.7}
            >
              <Icon name="chatbubble-ellipses" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* 1.1 Dynamic Admin Uploaded Store/Restaurant Banner (Top of Screen) */}
        <RoleBannerCarousel
          target="SUPPLIER"
          category={user?.categoryName || user?.businessCategoryName || user?.partnerType}
          containerMarginHorizontal={14}
          borderRadius={16}
          aspectRatio={2.5}
          autoSlideInterval={6000}
        />

        {/* 2. LIVE RIDERS REACHED CARD */}
        {isOnline && (
          <View style={styles.waitingRidersCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <Icon name="bicycle" size={26} color="#0066FF" />
              <View style={{ flex: 1 }}>
                <Text style={styles.waitingRidersTitle}>
                  Riders Reached: {reachedRidersCount}
                </Text>
                <Text style={styles.waitingRidersSub}>
                  {reachedRidersCount > 0 ? 'Delivery partners waiting at your store' : 'No riders waiting right now'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.viewRidersBtn}
              activeOpacity={0.7}
              onPress={() => {
                setShowRidersModal(true);
              }}
            >
              <Text style={styles.viewRidersBtnText}>View Riders ›</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 3. ORDER STATUS TABS (HORIZONTAL FILTER) OR ORDER HISTORY BANNER */}
        {activeBottomNav === 'Order History' ? (
          <View style={{ marginHorizontal: 14, marginVertical: 10, padding: 14, backgroundColor: '#EFF6FF', borderRadius: 14, borderWidth: 1.5, borderColor: '#BFDBFE', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="receipt" size={18} color="#1D4ED8" />
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#1D4ED8' }}>
                  Order History
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                All completed, delivered, active and cancelled orders ({filteredOrders.length})
              </Text>
            </View>
            <TouchableOpacity
              style={{ backgroundColor: '#0066FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}
              onPress={() => fetchOrders(true)}
            >
              <Icon name="refresh" size={13} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 12 }}>Refresh</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabScrollContainer}
          >
            {terminology.tabs.map((tab) => {
              const isSelected = activeTab === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={[
                    styles.tabChip,
                    isSelected ? styles.tabChipActive : styles.tabChipInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabChipText,
                      isSelected
                        ? styles.tabChipTextActive
                        : styles.tabChipTextInactive,
                    ]}
                  >
                    {tab}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* 4. STORE ONLINE STATUS GREEN PILL STRIP */}
        {isOnline && (
          <View style={styles.storeOnlinePillStrip}>
            <View style={styles.lightningCircle}>
              <Icon name="flash" size={12} color="#16A34A" />
            </View>
            <Text style={styles.storeOnlinePillText}>
              Store is ONLINE • Ready to Receive Orders
            </Text>
          </View>
        )}

        {/* ORDER LIST / OFFLINE CONTENT DISPLAY */}
        {!isOnline && activeBottomNav !== 'Order History' && (
          <View style={styles.offlineContainer}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
              <Icon name="moon" size={28} color="#DC2626" />
            </View>
            <Text style={styles.offlineMsgTitle}>
              {terminology?.storeTypeLabel || 'Store'} is currently Offline
            </Text>
            <Text style={styles.offlineMsgSub}>
              Turn online using the top switch to start receiving customer orders
            </Text>
          </View>
        )}

        <View style={styles.ordersContentArea}>
            {filteredOrders.length > 0 ? (
              filteredOrders.map((order: any, orderIndex: number) => {
                const bId = getOrderId(order) || `order_${orderIndex}`;
                const foodTotal = getOrderFoodTotal(order);
                const items = parseOrderItems(order.cartItems, foodTotal);
                const isPlaced = order.status === 'ORDER_PLACED' || order.status === 'BOOKING_REQUESTED' || order.status === 'PENDING_RESTAURANT';
                const isPreparing = order.status === 'PREPARING' || order.status === 'RESTAURANT_ACCEPTED' || order.status === 'ACCEPTED' || order.status === 'PROVIDER_ACCEPTED';
                const isReady = order.status === 'READY_FOR_PICKUP' || order.status === 'READY' || order.status === 'FOOD_READY';
                const isOutForDelivery = order.status === 'OUT_FOR_DELIVERY' || order.status === 'STARTED' || order.status === 'SERVICE_STARTED';
                const isCompleted = order.status === 'COMPLETED' || order.status === 'SERVICE_COMPLETED' || order.status === 'DELIVERED';
                const isCancelled = (order.status || '').includes('CANCEL') || order.status === 'RESTAURANT_DECLINED';

                return (
                  <View key={bId} style={[styles.orderCard, { padding: 12, marginBottom: 10, borderRadius: 12 }]}>
                    {/* Compact Header: Order ID + Time + Status Badge in 1 Row */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A' }}>#{bId.slice(-6).toUpperCase()}</Text>
                        <Text style={{ fontSize: 11, color: '#64748B' }}>• {formatOrderDateTime(order.createdAt || order.scheduledDate)}</Text>
                      </View>
                      <View style={[
                        { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
                        isPlaced && { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' },
                        isPreparing && { backgroundColor: '#DBEAFE', borderColor: '#0066FF' },
                        isReady && { backgroundColor: '#D1FAE5', borderColor: '#10B981' },
                        isOutForDelivery && { backgroundColor: '#EFF6FF', borderColor: '#0066FF' },
                        isCompleted && { backgroundColor: '#DCFCE7', borderColor: '#22C55E' },
                        isCancelled && { backgroundColor: '#FEE2E2', borderColor: '#EF4444' },
                      ]}>
                        <Text style={[
                          { fontSize: 11, fontWeight: '800' },
                          isPlaced && { color: '#B45309' },
                          isPreparing && { color: '#1D4ED8' },
                          isReady && { color: '#047857' },
                          isOutForDelivery && { color: '#6D28D9' },
                          isCompleted && { color: '#15803D' },
                          isCancelled && { color: '#B91C1C' },
                        ]}>
                          {isPlaced ? '🔔 NEW' : isPreparing ? '🍳 PREPARING' : isReady ? '🍲 READY' : isOutForDelivery ? '🛵 OUT' : isCompleted ? '✅ DONE' : isCancelled ? '❌ CANCELLED' : order.status}
                        </Text>
                      </View>
                    </View>

                    {/* Customer & Address Row (Inline & Compact) */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Icon name="person" size={13} color="#0066FF" />
                          <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E293B' }} numberOfLines={1}>
                            {order.customerName || 'Customer'}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 11.5, color: '#64748B', marginTop: 1 }} numberOfLines={1}>
                          📍 {order.destinationAddress || order.serviceAddress || order.customerAddress || 'Delivery Address'}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {order.customerPhone ? (
                          <TouchableOpacity
                            style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#86EFAC' }}
                            onPress={() => Linking.openURL(`tel:${order.customerPhone}`)}
                            activeOpacity={0.7}
                          >
                            <Icon name="call" size={14} color="#16A34A" />
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 }}
                          onPress={() => {
                            setSelectedOrderToPrint(order);
                            setBillModalVisible(true);
                          }}
                          activeOpacity={0.7}
                        >
                          <Icon name="print" size={13} color="#0066FF" />
                          <Text style={{ fontSize: 11, fontWeight: '800', color: '#0066FF' }}>Bill</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Rider Reached Alert (Compact Banner) */}
                    {(order.riderStatus === 'REACHED_RESTAURANT' || order.deliveryStatus === 'RIDER_AT_RESTAURANT') && (
                      <View style={{
                        backgroundColor: '#EFF6FF',
                        borderColor: '#3B82F6',
                        borderWidth: 1,
                        borderRadius: 8,
                        paddingVertical: 5,
                        paddingHorizontal: 8,
                        marginBottom: 8,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
                          <Icon name="bicycle" size={14} color="#1D4ED8" />
                          <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#1D4ED8' }} numberOfLines={1}>
                            Rider Arrived: {order.providerName || 'Partner'}
                          </Text>
                        </View>
                        {order.providerPhone ? (
                          <TouchableOpacity
                            onPress={() => Linking.openURL(`tel:${order.providerPhone}`)}
                            style={{ backgroundColor: '#2563EB', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}
                          >
                            <Text style={{ color: '#FFFFFF', fontSize: 10.5, fontWeight: '800' }}>📞 Call</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    )}

                    {/* Compact Items & Total Row */}
                    <View style={{
                      backgroundColor: '#F8FAFC',
                      borderRadius: 8,
                      padding: 8,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor: '#E2E8F0',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#334155' }} numberOfLines={1}>
                          📦 {items.length > 0 ? items.map((it: any) => `${it.quantity || 1}x ${it.name}`).join(', ') : `${getCategoryLabel(order)} items`}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 13, fontWeight: '900', color: '#16A34A' }}>
                          ₹{foodTotal}
                        </Text>
                      </View>
                    </View>

                    {/* Customer Instruction / Note (if any - compact) */}
                    {Boolean(order.specialInstructions || order.customerNotes || order.deliveryNotes) && (
                      <View style={{ backgroundColor: '#FEF3C7', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ fontSize: 11 }}>📝</Text>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#78350F', flex: 1 }} numberOfLines={1}>
                          {order.specialInstructions || order.customerNotes || order.deliveryNotes}
                        </Text>
                      </View>
                    )}

                    {/* Compact Preparation Countdown & Rider Search Status */}
                    {isPreparing && (() => {
                      const remainingSec = getRemainingPrepSeconds(order);
                      const isOverdue = remainingSec < 0;
                      const displaySec = isOverdue ? Math.abs(remainingSec) : remainingSec;
                      const formattedTime = (isOverdue ? '+' : '') + formatCountdown(displaySec);
                      const overdueMins = isOverdue ? Math.floor(displaySec / 60) : 0;
                      const isCriticalLate = isOverdue && overdueMins >= 15;
                      const isWarningLate = isOverdue && overdueMins >= 10 && overdueMins < 15;

                      return (
                        <View style={{
                          backgroundColor: isCriticalLate ? '#FEF2F2' : isWarningLate ? '#FFFBEB' : isOverdue ? '#FEF2F2' : '#EFF6FF',
                          borderWidth: 1,
                          borderColor: isCriticalLate ? '#DC2626' : isWarningLate ? '#F59E0B' : isOverdue ? '#F87171' : '#BFDBFE',
                          borderRadius: 8,
                          paddingVertical: 5,
                          paddingHorizontal: 8,
                          marginBottom: 8,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Icon name={isOverdue ? "warning" : "timer-outline"} size={13} color={isOverdue ? "#DC2626" : "#1D4ED8"} />
                            <Text style={{ fontSize: 11.5, fontWeight: '800', color: isOverdue ? '#DC2626' : '#1D4ED8' }}>
                              ⏱️ {formattedTime} {isCriticalLate ? '(15m+ Late)' : isWarningLate ? '(10m+ Late)' : isOverdue ? '(Late)' : ''}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Icon name="bicycle" size={12} color={order.riderName ? "#16A34A" : "#64748B"} />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: order.riderName ? '#16A34A' : '#64748B' }}>
                              {order.riderName ? order.riderName : 'Searching Rider...'}
                            </Text>
                          </View>
                        </View>
                      );
                    })()}

                    {/* Action Buttons - Clean Column Layout (No overlapping) */}
                    <View style={styles.orderActionsRow}>
                      {isPlaced && (
                        <View style={styles.orderActionsPrimaryRow}>
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: '#FEE2E2', borderColor: '#EF4444', flex: 1 }]}
                            onPress={() => promptCancelOrder(order)}
                            activeOpacity={0.8}
                          >
                            <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Reject</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.actionBtn,
                              {
                                backgroundColor: acceptingOrderId === (order.bookingId || order.rideId || order._id)?.toString() ? '#16A34A' : '#22C55E',
                                borderColor: '#16A34A',
                                flex: 2,
                                opacity: Boolean(acceptingOrderId) ? 0.7 : 1,
                              },
                            ]}
                            onPress={() => handleAcceptOrder(order)}
                            disabled={Boolean(acceptingOrderId)}
                            activeOpacity={0.8}
                          >
                            {acceptingOrderId === (order.bookingId || order.rideId || order._id)?.toString() ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                                <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 6 }} />
                                <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>Accepting...</Text>
                              </View>
                            ) : (
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                                <Icon name="checkmark" size={16} color="#FFFFFF" />
                                <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>Accept Order</Text>
                              </View>
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: '#0066FF', borderColor: '#1D4ED8', flex: 1.5 }]}
                            onPress={() => navigation.navigate('SingleOrderStatusScreen', { bookingId: order.bookingId || order.rideId, activeFoodOrder: order, order: order })}
                            activeOpacity={0.8}
                          >
                            <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>Details</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {isPreparing && (
                        <View style={styles.orderActionsPrimaryRow}>
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: '#FEE2E2', borderColor: '#EF4444', flex: 1 }]}
                            onPress={() => promptCancelOrder(order)}
                            activeOpacity={0.8}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                              <Icon name="close" size={15} color="#EF4444" />
                              <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Cancel</Text>
                            </View>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: '#0066FF', borderColor: '#1D4ED8', flex: 2 }]}
                            onPress={() => handleMarkReady(order)}
                            activeOpacity={0.8}
                          >
                            <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>{terminology.readyBtnText}</Text>
                          </TouchableOpacity>
                          {(order.riderStatus === 'REACHED_RESTAURANT' || order.deliveryStatus === 'RIDER_AT_RESTAURANT') && (
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#16A34A', borderColor: '#15803D', flex: 2 }]}
                              onPress={() => handleHandoverToRider(order)}
                              activeOpacity={0.8}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                <Text style={{ fontSize: 13 }}>🤝</Text>
                                <Text style={[styles.actionBtnText, { color: '#FFFFFF', fontWeight: '900' }]}>Handover</Text>
                              </View>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}

                      {isReady && (
                        <View style={styles.orderActionsPrimaryRow}>
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: '#FEE2E2', borderColor: '#EF4444', flex: 1 }]}
                            onPress={() => promptCancelOrder(order)}
                            activeOpacity={0.8}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                              <Icon name="close" size={15} color="#EF4444" />
                              <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Cancel</Text>
                            </View>
                          </TouchableOpacity>
                          {/* Dedicated Supplier Handover / Pick Order Action */}
                          <TouchableOpacity
                            style={[
                              styles.actionBtn,
                              {
                                backgroundColor: (order.riderStatus === 'REACHED_RESTAURANT' || order.deliveryStatus === 'RIDER_AT_RESTAURANT') ? '#16A34A' : '#0066FF',
                                borderColor: (order.riderStatus === 'REACHED_RESTAURANT' || order.deliveryStatus === 'RIDER_AT_RESTAURANT') ? '#15803D' : '#1D4ED8',
                                flex: 2.2,
                              },
                            ]}
                            onPress={() => handleHandoverToRider(order)}
                            activeOpacity={0.8}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                              <Text style={{ fontSize: 16 }}>🤝</Text>
                              <Text style={[styles.actionBtnText, { color: '#FFFFFF', fontWeight: '900' }]}>
                                Handover to Rider
                              </Text>
                            </View>
                          </TouchableOpacity>
                        </View>
                      )}

                      {isOutForDelivery && (
                        <View style={{ backgroundColor: '#F5F3FF', borderColor: '#8B5CF6', borderWidth: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, width: '100%', alignItems: 'center' }}>
                          <Text style={{ color: '#6D28D9', fontWeight: '800', fontSize: 13 }}>
                            🛵 Out for Delivery • Delivery Partner on the Way
                          </Text>
                        </View>
                      )}

                      {/* Real-time Customer Chat & Call Options for Active Orders */}
                      {(isPlaced || isPreparing || isReady || isOutForDelivery) && (
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0', width: '100%' }}>
                          <TouchableOpacity
                            style={{
                              flex: 1,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: '#EFF6FF',
                              borderWidth: 1,
                              borderColor: '#BFDBFE',
                              paddingVertical: 10,
                              borderRadius: 8,
                              gap: 6,
                            }}
                            onPress={() => {
                              const custId = order.customerId || order.userId || order.customer?._id || order.customer?.id;
                              const custName = order.customerName || order.customer?.name || 'Customer';
                              navigation.navigate('ChatRoom', {
                                user: { _id: custId, name: custName, username: custName },
                                otherUser: { _id: custId, name: custName, username: custName },
                                receiverId: custId,
                                userId: custId,
                                orderId: (order._id || order.bookingId || '').slice(-6),
                                bookingId: order._id || order.bookingId,
                                rideId: order._id || order.bookingId,
                                restaurantName: order.restaurantName || restoDisplayName || partnerProfile?.restaurantName || 'Restaurant',
                                customerName: custName,
                                orderStatus: order.status,
                                chatContext: 'RESTAURANT',
                              });
                            }}
                            activeOpacity={0.8}
                          >
                            <Icon name="chatbubble-ellipses" size={14} color="#0066FF" />
                            <Text style={{ color: '#0066FF', fontWeight: '700', fontSize: 12 }}>
                              Chat & Send Photo to Customer
                            </Text>
                          </TouchableOpacity>

                          {Boolean(order.customerPhone || order.customer?.phone) && (
                            <TouchableOpacity
                              style={{
                                paddingHorizontal: 14,
                                paddingVertical: 10,
                                borderRadius: 8,
                                backgroundColor: '#F0FDF4',
                                borderWidth: 1,
                                borderColor: '#BBF7D0',
                                justifyContent: 'center',
                                alignItems: 'center',
                              }}
                              onPress={() => {
                                Linking.openURL(`tel:${order.customerPhone || order.customer?.phone}`).catch(() => {});
                              }}
                              activeOpacity={0.8}
                            >
                              <Icon name="call" size={14} color="#16A34A" />
                            </TouchableOpacity>
                          )}
                        </View>
                      )}

                      {isCompleted && (
                        <View style={{ backgroundColor: '#DCFCE7', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, flex: 1, alignItems: 'center' }}>
                          <Text style={{ color: '#16A34A', fontWeight: '800', fontSize: 13 }}>
                            ✅ Completed • ₹{foodTotal} Added to Wallet
                          </Text>
                        </View>
                      )}

                      {isCancelled && (() => {
                        const actor = (order.cancelledBy || 'STORE').toUpperCase();
                        const reason = order.cancellationReason || order.reason || 'Order cancelled';
                        return (
                          <View style={{ backgroundColor: '#FEE2E2', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, flex: 1, borderWidth: 1, borderColor: '#FCA5A5' }}>
                            <Text style={{ color: '#991B1B', fontWeight: '800', fontSize: 13, marginBottom: 2 }}>
                              ❌ Order Cancelled (By {actor})
                            </Text>
                            <Text style={{ color: '#DC2626', fontWeight: '600', fontSize: 12 }}>
                              Reason: {reason}
                            </Text>
                          </View>
                        );
                      })()}
                    </View>
                  </View>
                );
              })
            ) : loadingOrders && filteredOrders.length === 0 ? (
              <OrderHistorySkeletonLoader isDark={isDark} message="Syncing live store orders..." />
            ) : (
              <View style={styles.emptyOrdersWrap}>
                <View style={styles.emptyBoxIconCircle}>
                  <Icon name="cube-outline" size={44} color="#94A3B8" />
                </View>
                <Text style={styles.emptyOrdersTitle}>
                  No '{activeTab}' orders right now
                </Text>
                <Text style={styles.emptyOrdersSub}>
                  New orders from customers nearby will appear here automatically with sound alert!
                </Text>
              </View>
            )}
          </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* BOTTOM OFFLINE BAR (IF OFFLINE) */}
      {!isOnline && (
        <View style={styles.bottomOfflineAlert}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bottomAlertTitle}>1 {terminology.storeTypeLabel.toLowerCase()} is offline</Text>
            <Text style={styles.bottomAlertSub}>Due to manual toggle</Text>
          </View>
          <TouchableOpacity
            style={[styles.viewBtn, { opacity: isUpdatingStatus ? 0.7 : 1 }]}
            onPress={toggleOnlineStatus}
            disabled={isUpdatingStatus}
          >
            <Text style={styles.viewBtnText}>Turn On</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* CUSTOM BOTTOM NAVIGATION BAR - BLUE THEME (SMOOTH SLIDE HIDE ON SCROLL) */}
      <Animated.View
        style={[
          styles.bottomTabBar,
          {
            transform: [{ translateY: bottomBarTranslateY }],
          },
        ]}
      >
        {/* 1. Home */}
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => {
            setActiveBottomNav('Home');
            setActiveTab(terminology.tabs[0] || 'Preparing');
            fetchOrders();
          }}
        >
          <Icon
            name={activeBottomNav === 'Home' ? "home" : "home-outline"}
            size={22}
            color={activeBottomNav === 'Home' ? '#0066FF' : '#64748B'}
            style={{ marginBottom: 2 }}
          />
          <Text style={[styles.navLabel, activeBottomNav === 'Home' && { color: '#0066FF', fontWeight: '700' }]}>
            Home
          </Text>
        </TouchableOpacity>

        {/* 2. Order History (OPENS INLINE DEDICATED RESTAURANT VIEW) */}
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => {
            setActiveBottomNav('Order History');
            setActiveTab('Order History');
            fetchOrders(orders.length === 0);
          }}
        >
          <Icon
            name={activeBottomNav === 'Order History' ? "receipt" : "receipt-outline"}
            size={22}
            color={activeBottomNav === 'Order History' ? '#0066FF' : '#64748B'}
            style={{ marginBottom: 2 }}
          />
          <Text style={[styles.navLabel, activeBottomNav === 'Order History' && { color: '#0066FF', fontWeight: '700' }]}>
            Order History
          </Text>
        </TouchableOpacity>

        {/* 3. Menu / Catalog / Products */}
        <TouchableOpacity
          style={styles.navItem}
          onPress={async () => {
            setActiveBottomNav('Menu');
            try {
              const mySuppId = await resolveTargetSupplierId();
              navigation.navigate('RestaurantMenu', {
                restaurantId: mySuppId,
                partnerType: rawPartnerType,
                catType,
              });
            } catch (e) {
              console.log('[NAV MENU ERROR]', e);
            }
          }}
        >
          <Icon
            name={activeBottomNav === 'Menu' ? "restaurant" : "restaurant-outline"}
            size={22}
            color={activeBottomNav === 'Menu' ? '#0066FF' : '#64748B'}
            style={{ marginBottom: 2 }}
          />
          <Text style={[styles.navLabel, activeBottomNav === 'Menu' && { color: '#0066FF', fontWeight: '700' }]}>
            {terminology.menuNavLabel}
          </Text>
        </TouchableOpacity>

        {/* 4. Earnings */}
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => {
            setActiveBottomNav('Earnings');
            try { navigation.navigate('Earnings'); } catch (e) {}
          }}
        >
          <Icon
            name={activeBottomNav === 'Earnings' ? "wallet" : "wallet-outline"}
            size={22}
            color={activeBottomNav === 'Earnings' ? '#0066FF' : '#64748B'}
            style={{ marginBottom: 2 }}
          />
          <Text style={[styles.navLabel, activeBottomNav === 'Earnings' && { color: '#0066FF', fontWeight: '700' }]}>
            Earnings
          </Text>
        </TouchableOpacity>

        {/* 5. Profile */}
        <TouchableOpacity
          style={styles.navItem}
          onPress={async () => {
            setActiveBottomNav('Profile');
            try {
              const mySuppId = await resolveTargetSupplierId();
              navigation.navigate('ProfileScreen', { role: 'supplier', restaurantId: mySuppId });
            } catch (e) {
              navigation.navigate('ProfileScreen', { role: 'supplier' });
            }
          }}
        >
          {(() => {
            const rawPhoto =
              partnerProfile?.profilePicture ||
              partnerProfile?.coverImage ||
              partnerProfile?.image ||
              partnerProfile?.logo;
            if (rawPhoto) {
              return (
                <Image
                  source={{ uri: resolveUploadUrl(rawPhoto) }}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: activeBottomNav === 'Profile' ? 1.5 : 1,
                    borderColor: activeBottomNav === 'Profile' ? '#0066FF' : '#94A3B8',
                    marginBottom: 2,
                  }}
                />
              );
            }
            return (
              <Icon
                name={activeBottomNav === 'Profile' ? "person" : "person-outline"}
                size={22}
                color={activeBottomNav === 'Profile' ? '#0066FF' : '#64748B'}
                style={{ marginBottom: 2 }}
              />
            );
          })()}
          <Text style={[styles.navLabel, activeBottomNav === 'Profile' && { color: '#0066FF', fontWeight: '700' }]}>
            Profile
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* REAL-TIME INCOMING ORDER POPUP MODAL */}
      <Modal
        visible={Boolean(incomingOrder)}
        transparent={true}
        animationType="slide"
        statusBarTranslucent={true}
        onRequestClose={() => {}}
      >
        {incomingOrder && (
          <View style={styles.modalBackdrop}>
            <View style={styles.incomingModalCard}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Icon name="notifications" size={18} color="#D97706" />
                    <View>
                      <Text style={styles.modalHeaderTitle}>NEW {getCategoryLabel(incomingOrder).toUpperCase()} ORDER RECEIVED!</Text>
                      <Text style={styles.modalHeaderSub}>
                        Order #{String(incomingOrder.bookingId || incomingOrder.rideId || incomingOrder._id || '').slice(-6).toUpperCase()} • {formatOrderDateTime(incomingOrder.createdAt)}
                      </Text>
                    </View>
                  </View>
                  <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#D97706' }}>PENDING</Text>
                  </View>
                </View>
              </View>

              <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                <View style={styles.modalCustomerBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Icon name="person" size={15} color="#0F172A" />
                        <Text style={styles.modalCustomerName}>
                          {incomingOrder.customerName || 'Customer'}
                        </Text>
                      </View>
                      {incomingOrder.customerPhone ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <Icon name="call-outline" size={13} color="#0066FF" />
                          <Text style={{ fontSize: 13, color: '#0066FF', fontWeight: '700' }}>
                            +91 {incomingOrder.customerPhone}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {incomingOrder.customerPhone ? (
                      <TouchableOpacity
                        style={[styles.customerCallBtn, { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10 }]}
                        onPress={() => Linking.openURL(`tel:${incomingOrder.customerPhone}`)}
                        activeOpacity={0.7}
                      >
                        <Icon name="call" size={14} color="#16A34A" />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#16A34A' }}>Call</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 4 }}>
                    <Icon name="location-sharp" size={14} color="#64748B" style={{ marginTop: 2 }} />
                    <Text style={styles.modalDeliveryAddr}>
                      {incomingOrder.destinationAddress || incomingOrder.serviceAddress || 'Customer Address'}
                    </Text>
                  </View>

                  {Boolean(incomingOrder.distanceKm) && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <Icon name="bicycle" size={14} color="#0066FF" />
                      <Text style={styles.modalDistanceText}>
                        Delivery Distance: {incomingOrder.distanceKm} km
                      </Text>
                    </View>
                  )}
                </View>

                <Text style={styles.modalSectionLabel}>ITEMS TO {getCategoryLabel(incomingOrder).toLowerCase() === 'food' ? 'PREPARE' : 'PACK'}:</Text>
                <View style={styles.modalItemsList}>
                  {(() => {
                    const modalFoodTotal = getOrderFoodTotal(incomingOrder);
                    const incomingItems = parseOrderItems(incomingOrder.cartItems, modalFoodTotal);
                    return incomingItems.length > 0 ? (
                      incomingItems.map((item: any, idx: number) => (
                        <View key={item.id || idx} style={styles.modalItemRow}>
                          <Text style={styles.modalItemName}>
                            • {item.name} <Text style={{ fontWeight: 'bold' }}>x {item.quantity}</Text>
                          </Text>
                          <Text style={styles.modalItemPrice}>
                            ₹{Math.round((Number(item.price) || 0) * (Number(item.quantity) || 1))}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.modalItemName}>• {getCategoryLabel(incomingOrder)} items ordered</Text>
                    );
                  })()}
                </View>

                <View style={styles.modalTotalRow}>
                  <Text style={styles.modalTotalLabel}>
                    {getCategoryTotalLabel(incomingOrder)} ({incomingOrder.paymentMethod === 'cash' ? 'COD' : 'PAID'}):
                  </Text>
                  <Text style={styles.modalTotalVal}>₹{getOrderFoodTotal(incomingOrder)}</Text>
                </View>

                {/* Preparation / Packing Time Selection (10m, 15m, 20m, 25m) */}
                <View style={{ marginTop: 12, marginBottom: 6, backgroundColor: '#EFF6FF', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                    <Icon name="timer-outline" size={15} color="#1D4ED8" />
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#1D4ED8' }}>
                      Select {getCategoryLabel(incomingOrder).toLowerCase() === 'food' ? 'Preparation' : 'Packing'} Time:
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
                    {[10, 15, 20, 25].map((mins) => {
                      const isSel = selectedPrepTime === mins;
                      return (
                        <TouchableOpacity
                          key={mins}
                          onPress={() => setSelectedPrepTime(mins)}
                          activeOpacity={0.7}
                          style={{
                            flex: 1,
                            paddingVertical: 8,
                            borderRadius: 8,
                            backgroundColor: isSel ? '#0066FF' : '#FFFFFF',
                            borderWidth: 1.5,
                            borderColor: isSel ? '#1D4ED8' : '#BFDBFE',
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '800', color: isSel ? '#FFFFFF' : '#7C2D12' }}>
                            {mins}m
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={{ fontSize: 11, color: '#9A3412', marginTop: 6, textAlign: 'center' }}>
                    Accepting order will start a {selectedPrepTime} min timer + Rider search
                  </Text>
                </View>
              </ScrollView>

              {/* REAL-TIME BILL PRINT BUTTON FOR INCOMING ORDER */}
              <TouchableOpacity
                style={{
                  backgroundColor: '#EFF6FF',
                  borderWidth: 1.5,
                  borderColor: '#0066FF',
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                  marginTop: 10,
                  marginBottom: 6,
                }}
                onPress={() => {
                  setSelectedOrderToPrint(incomingOrder);
                  setBillModalVisible(true);
                }}
                activeOpacity={0.8}
              >
                <Icon name="print" size={16} color="#0066FF" />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#0066FF' }}>
                  Print Bill (POS Receipt)
                </Text>
              </TouchableOpacity>

              <View style={styles.modalActionsRow}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#FEE2E2', borderColor: '#EF4444' }]}
                  onPress={() => handleRejectOrder(incomingOrder)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.modalBtnText, { color: '#EF4444' }]}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalBtn,
                    {
                      backgroundColor: acceptingOrderId === (incomingOrder?.bookingId || incomingOrder?.rideId || incomingOrder?._id)?.toString() ? '#16A34A' : '#22C55E',
                      borderColor: '#16A34A',
                      flex: 2,
                      opacity: Boolean(acceptingOrderId) ? 0.7 : 1,
                    },
                  ]}
                  onPress={() => handleAcceptOrder(incomingOrder, selectedPrepTime)}
                  disabled={Boolean(acceptingOrderId)}
                  activeOpacity={0.8}
                >
                  {acceptingOrderId === (incomingOrder?.bookingId || incomingOrder?.rideId || incomingOrder?._id)?.toString() ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                      <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                      <Text style={[styles.modalBtnText, { color: '#FFFFFF' }]}>Accepting...</Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                      <Icon name="checkmark" size={16} color="#FFFFFF" />
                      <Text style={[styles.modalBtnText, { color: '#FFFFFF' }]}>Accept ({selectedPrepTime}m)</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </Modal>

      {/* RESTAURANT CANCELLATION REASON MODAL */}
      <Modal
        visible={Boolean(cancelModalVisible && orderToCancel)}
        transparent={true}
        animationType="fade"
        statusBarTranslucent={true}
        onRequestClose={() => setCancelModalVisible(false)}
      >
        {cancelModalVisible && orderToCancel && (
          <View style={styles.modalBackdrop}>
            <View style={styles.cancelModalCard}>
              <View style={styles.cancelModalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="close-circle" size={18} color="#DC2626" />
                  <Text style={styles.cancelModalTitle}>Cancel Food Order</Text>
                </View>
                <Text style={styles.cancelModalSub}>
                  Order #{((orderToCancel.bookingId || orderToCancel.rideId) || '').slice(-6)} • Select cancellation reason
                </Text>
              </View>

              <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
                {CANCELLATION_REASONS.map((reason) => {
                  const isSelected = selectedCancelReason === reason;
                  return (
                    <TouchableOpacity
                      key={reason}
                      style={[styles.cancelReasonItem, isSelected && styles.cancelReasonItemActive]}
                      onPress={() => setSelectedCancelReason(reason)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.cancelRadioOuter, isSelected && styles.cancelRadioOuterActive]}>
                        {isSelected && <View style={styles.cancelRadioInner} />}
                      </View>
                      <Text style={[styles.cancelReasonText, isSelected && styles.cancelReasonTextActive]}>
                        {reason}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.modalActionsRow}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' }]}
                  onPress={() => {
                    setCancelModalVisible(false);
                    setOrderToCancel(null);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.modalBtnText, { color: '#475569' }]}>Keep Order</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#EF4444', borderColor: '#DC2626' }]}
                  onPress={confirmCancelOrder}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.modalBtnText, { color: '#FFFFFF' }]}>Confirm Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </Modal>

      {/* Real-Time Store Help & Support Modal */}
      <StoreHelpModal
        visible={showStoreHelpModal}
        onClose={() => setShowStoreHelpModal(false)}
        storeUser={user || partnerProfile}
        categoryName={terminology?.storeTypeLabel || 'Store'}
        activeOrders={orders}
      />

      {/* Interactive Map & Geolocation Store Location Modal */}
      <StoreMapLocationModal
        visible={mapLocationModalVisible}
        onClose={() => setMapLocationModalVisible(false)}
        initialCoords={{
          latitude: partnerProfile?.businessLatitude || partnerProfile?.latitude || 0,
          longitude: partnerProfile?.businessLongitude || partnerProfile?.longitude || 0,
        }}
        onLocationSaved={(coords, fullAddress) => {
          handleSaveStoreLocationFromMap(coords, fullAddress, true);
        }}
      />

      {/* Role-Based Cancellation Popup Modal for Restaurant/Supplier */}
      <CancellationPopupModal
        visible={cancellationPopup.visible}
        role="RESTAURANT"
        orderId={cancellationPopup.orderId}
        reason={cancellationPopup.reason}
        cancelledBy={cancellationPopup.cancelledBy}
        customerName={cancellationPopup.customerName}
        restaurantName={cancellationPopup.restaurantName}
        onClose={() => setCancellationPopup({ visible: false })}
        onOk={() => setCancellationPopup({ visible: false })}
      />

      {/* Real-Time POS Thermal Bill Print Modal */}
      <BillPrintModal
        visible={billModalVisible}
        order={selectedOrderToPrint}
        storeInfo={{
          name: restoDisplayName || partnerProfile?.restaurantName || partnerProfile?.name || 'Restaurant Partner',
          address: currentLocation || partnerProfile?.fullAddress || partnerProfile?.address || user?.fullAddress || (user as any)?.address || '',
          phone: user?.phone || (user as any)?.mobile,
        }}
        onClose={() => {
          setBillModalVisible(false);
          setSelectedOrderToPrint(null);
        }}
      />

      {/* Real-Time Delivery Partners List & Interactive GPS Tracking Map Modal */}
      <RidersTrackingModal
        visible={showRidersModal}
        onClose={() => setShowRidersModal(false)}
        restaurantId={(user?._id || user?.id || partnerProfile?._id || partnerProfile?.id)?.toString()}
        socket={socket}
      />
    </SafeAreaView>
  );
};

export default RiderHomeScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 8 : 16,
    paddingBottom: 16,
    backgroundColor: '#0066FF',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  restoHeaderLeft: {
    flex: 1,
    paddingRight: 10,
    minWidth: 0,
  },
  restoTitleText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    maxWidth: '100%',
  },
  locationDot: {
    fontSize: 12,
    marginRight: 4,
  },
  locationText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '500',
    flexShrink: 1,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  walletPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  walletPillAmount: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '900',
  },
  walletWithdrawTag: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 6,
  },
  walletWithdrawText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  onlinePill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  },
  pillDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dotCircle: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  onlinePillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notifDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: 'center',
  },
  notifDotText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: 'bold',
  },
  scrollContainer: {
    paddingBottom: 20,
  },
  alertBanner: {
    backgroundColor: '#FEF3C7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
  },
  alertText: {
    color: '#92400E',
    fontSize: 13,
    flex: 1,
  },
  underlineText: {
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  closeAlert: {
    color: '#92400E',
    fontSize: 16,
    paddingLeft: 10,
  },
  bannerCenterContainer: {
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    height: 150,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  storeHeaderIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeHeroCard: {
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 20,
    backgroundColor: '#0066FF',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    height: 165,
  },
  storeHeroCardLeft: {
    flex: 1.2,
    zIndex: 2,
    justifyContent: 'center',
  },
  storeStatusBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  storeStatusSubtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
  },
  storeStatusMainTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 2,
    marginBottom: 4,
  },
  storeStatusDesc: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 11.5,
    lineHeight: 15,
    marginBottom: 8,
  },
  viewDetailsBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 18,
    alignSelf: 'flex-start',
  },
  viewDetailsBtnText: {
    color: '#0066FF',
    fontSize: 12,
    fontWeight: '800',
  },
  storeHeroCardRight: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeHeroImg: {
    width: 145,
    height: 135,
    borderRadius: 14,
  },
  waitingRidersCard: {
    marginHorizontal: 14,
    marginTop: 4,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  waitingRidersTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  waitingRidersSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  viewRidersBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  viewRidersBtnText: {
    color: '#0066FF',
    fontSize: 12,
    fontWeight: '700',
  },
  tabScrollContainer: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
  },
  tabChip: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 22,
  },
  tabChipActive: {
    backgroundColor: '#0066FF',
    elevation: 2,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  tabChipInactive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabChipText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  tabChipTextActive: {
    color: '#FFFFFF',
  },
  tabChipTextInactive: {
    color: '#334155',
  },
  bannerCenterImg: {
    width: '100%',
    height: '100%',
  },
  wifiAnimationBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 10,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.4)',
  },
  wifiPulseRing: {
    position: 'absolute',
    left: 4,
    top: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#22C55E',
  },
  wifiIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wifiLiveText: {
    color: '#22C55E',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  bannerOverlayTag: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  bannerOverlayTagText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  offlineCenterImg: {
    width: 200,
    height: 130,
    borderRadius: 12,
    marginBottom: 16,
    alignSelf: 'center',
  },
  offlineContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  storeIconWrap: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  offlineTag: {
    position: 'absolute',
    bottom: 25,
    backgroundColor: '#64748B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  offlineTagText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  offlineMsgTitle: {
    color: '#1E293B',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  offlineMsgSub: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 280,
  },
  ordersContentArea: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  storeOnlinePillStrip: {
    marginHorizontal: 14,
    marginVertical: 10,
    backgroundColor: '#DCFCE7',
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  lightningCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeOnlinePillText: {
    color: '#15803D',
    fontSize: 13,
    fontWeight: '800',
  },
  emptyBoxIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyOrdersWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 1,
  },
  onlineEmptyCenterImg: {
    width: '100%',
    height: 140,
    borderRadius: 12,
    marginBottom: 14,
  },
  onlineEmptyLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 10,
  },
  emptyOrdersTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  emptyOrdersSub: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  bottomOfflineAlert: {
    position: 'absolute',
    bottom: 75,
    left: 16,
    right: 16,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#0066FF',
  },
  bottomAlertTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  bottomAlertSub: {
    color: '#94A3B8',
    fontSize: 11,
  },
  viewBtn: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  viewBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  bottomTabBar: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIcon: {
    fontSize: 16,
    color: '#64748B',
    marginBottom: 2,
  },
  navLabel: {
    fontSize: 10,
    color: '#64748B',
  },
  // Order Card Styles
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderCardId: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  orderCardTime: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  orderStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  orderStatusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  orderCustomerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  customerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  orderCustomerName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  orderDeliveryAddr: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  orderItemsBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  orderItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  orderItemText: {
    fontSize: 13,
    color: '#334155',
  },
  orderItemPriceText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  orderBillRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginBottom: 12,
  },
  orderPaymentMode: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  orderTotalAmount: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0066FF',
  },
  orderActionsRow: {
    flexDirection: 'column',
    gap: 8,
    width: '100%',
  },
  orderActionsPrimaryRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    alignItems: 'center',
  },
  actionBtn: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  waitingRiderBanner: {
    flex: 1,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  waitingRiderText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#047857',
  },
  // Modal Styles
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    padding: 20,
  },
  incomingModalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 12,
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0066FF',
    letterSpacing: 0.5,
  },
  modalHeaderSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  modalCustomerBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  modalCustomerName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  modalDeliveryAddr: {
    fontSize: 12,
    color: '#475569',
    marginTop: 4,
  },
  modalDistanceText: {
    fontSize: 12,
    color: '#0066FF',
    fontWeight: 'bold',
    marginTop: 4,
  },
  modalSectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 6,
  },
  modalItemsList: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
  },
  modalItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  modalItemName: {
    fontSize: 13,
    color: '#1E293B',
  },
  modalItemPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    marginBottom: 16,
  },
  modalTotalLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  modalTotalVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0066FF',
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtn: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalPrepSelectorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  modalPrepTextCol: {
    flex: 1,
    marginRight: 8,
  },
  modalPrepSelectorTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#9A3412',
  },
  modalPrepSelectorSub: {
    fontSize: 10,
    color: '#1D4ED8',
    marginTop: 2,
  },
  modalPrepControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  prepStepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0066FF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  prepStepBtnDisabled: {
    backgroundColor: '#E2E8F0',
    elevation: 0,
    shadowOpacity: 0,
  },
  prepStepBtnText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 22,
  },
  prepStepBtnTextDisabled: {
    color: '#94A3B8',
  },
  prepTimeNumberWrap: {
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prepTimeNumberVal: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0066FF',
  },
  prepTimeUnitVal: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9A3412',
    marginTop: -2,
  },
  customerCallBtn: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 18,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  cancelModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '90%',
    maxWidth: 400,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  cancelModalHeader: {
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 10,
  },
  cancelModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#DC2626',
  },
  cancelModalSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
  },
  cancelReasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 8,
    backgroundColor: '#F8FAFC',
  },
  cancelReasonItemActive: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  cancelRadioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  cancelRadioOuterActive: {
    borderColor: '#EF4444',
  },
  cancelRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  cancelReasonText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
    flex: 1,
  },
  cancelReasonTextActive: {
    color: '#991B1B',
    fontWeight: '700',
  },
  cancelModalActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  metricsSummaryContainer: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  metricsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  metricsHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  refreshMetricsBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
  },
  refreshMetricsText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  metricsCardsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  metricIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  metricNumber: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },
});
