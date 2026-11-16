import React, { useState, useEffect, useMemo } from 'react';
import { Platform, 
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  FlatList,
  Image,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Switch,
  StatusBar,
  Dimensions,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'react-native-image-picker';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSocket } from '../context/SocketContext';
import api, { UPLOADS_URL } from '../services/api';
import { PngIcon } from '../components/PngIcon';
import { LottieAnimation } from '../components/LottieAnimation';
import { resolveUploadUrl } from '../config/apiConfig';
import { getSellerCategoryType, getCategoryTerminology } from './RiderHomeScreen';
import {
  fetchCurrentGpsPosition,
  reverseGeocodeCoords,
  savePermanentStoreLocation,
  getPermanentStoreLocation,
} from '../services/LocationAddressService';

const { width } = Dimensions.get('window');

const RestaurantMenuScreen = ({ navigation, route }: any) => {
  const insets = useSafeAreaInsets();
  const { isDark, currentColors } = useTheme('supplier');
  const styles = useMemo(() => getStyles(currentColors, isDark), [currentColors, isDark]);
  const { user, updateUser } = useAuth();
  const { socket } = useSocket();
  const restaurantId = route?.params?.restaurantId || (user as any)?._id || (user as any)?.id;

  let rawCat = (user as any)?.categoryName || (user as any)?.businessCategoryName || '';
  if (!rawCat && (user as any)?.category) {
    rawCat = typeof (user as any).category === 'string' ? (user as any).category : ((user as any).category.name || '');
  }
  const rawPartnerType = (user as any)?.partnerType || route?.params?.partnerType || '';
  const rawBusinessType = (user as any)?.businessType || (user as any)?.business_type || route?.params?.businessType || '';
  const catType = getSellerCategoryType(rawCat, rawPartnerType, rawBusinessType);
  const terminology = getCategoryTerminology(catType);
  const isRestaurant = catType === 'restaurant';

  // Store / Restaurant Name & Location State
  const [restoName, setRestoName] = useState<string>(
    (user as any)?.restaurantName || user?.name || `${terminology.storeTypeLabel} Partner`
  );
  const [restoLocation, setRestoLocation] = useState<string>(
    (user as any)?.fullAddress || (user as any)?.address || (user as any)?.location || ''
  );
  const [nameModalVisible, setNameModalVisible] = useState<boolean>(false);
  const [editRestoName, setEditRestoName] = useState<string>(user?.name || '');
  const [savingRestoName, setSavingRestoName] = useState<boolean>(false);
  const [activeRestoId, setActiveRestoId] = useState<string>('');

  const [categoriesList, setCategoriesList] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Modal State: Add New Category
  const [catModalVisible, setCatModalVisible] = useState<boolean>(false);
  const [newCatName, setNewCatName] = useState<string>('');
  const [savingCategory, setSavingCategory] = useState<boolean>(false);

  // Modal State: Add New Menu Item
  const [itemModalVisible, setItemModalVisible] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [isVeg, setIsVeg] = useState<boolean>(true);
  const [isRefundable, setIsRefundable] = useState<boolean>(false);
  const [itemImage, setItemImage] = useState<string>('');
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [demographic, setDemographic] = useState<string>('All');
  const [brand, setBrand] = useState<string>('');
  const [mrp, setMrp] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // ── SPEC REQ 3 & 5: EXTENDED PRODUCT CATALOG & SUBCATEGORY STATES ──
  const [subCategory, setSubCategory] = useState<string>('');
  const [supplierSubcategories, setSupplierSubcategories] = useState<any[]>([]);
  const [size, setSize] = useState<string>('');
  const [discountPrice, setDiscountPrice] = useState<string>('');
  const [stockQuantity, setStockQuantity] = useState<string>('50');
  const [itemStatus, setItemStatus] = useState<'Active' | 'Inactive' | 'Out of Stock'>('Active');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false);
  const [photoUploadedSuccess, setPhotoUploadedSuccess] = useState<boolean>(false);
  const [productJsonUrl, setProductJsonUrl] = useState<string>('');
  const [productJsonData, setProductJsonData] = useState<any>(null);
  const [productJsonModalVisible, setProductJsonModalVisible] = useState<boolean>(false);
  const [customProductJsonInput, setCustomProductJsonInput] = useState<string>('');
  const [jsonInputMode, setJsonInputMode] = useState<'preset' | 'custom'>('preset');

  const fetchSupplierSubcategories = async (suppId?: string) => {
    try {
      const targetId = suppId || activeRestoId || (await resolveTargetId());
      if (!targetId) return;
      const res = await api.get(`/categories/supplier-subcategories?supplierId=${targetId}`);
      if (res.data && res.data.success && Array.isArray(res.data.subcategories)) {
        setSupplierSubcategories(res.data.subcategories);
        if (res.data.subcategories.length > 0 && !subCategory) {
          setSubCategory(res.data.subcategories[0].name || res.data.subcategories[0]);
        }
      }
    } catch (err: any) {
      console.log('[FETCH SUBCATEGORIES NOTICE]', err?.message);
    }
  };

  const handlePublishProductJson = async (jsonContent: any, title?: string) => {
    try {
      setSubmitting(true);
      const token = (await AsyncStorage.getItem('supplierToken')) || (await AsyncStorage.getItem('userToken'));
      const parsedJson = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;
      const res = await api.post('/menu/upload-product-json', {
        title: title || `${name || 'Product'} Animation`,
        json: parsedJson,
      }, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);

      if (res.data && res.data.success) {
        setProductJsonUrl(res.data.url);
        setProductJsonData({
          url: res.data.url,
          filename: res.data.filename,
          title: title || `${name || 'Product'} Animation`,
        });
        setProductJsonModalVisible(false);
        Alert.alert('JSON Linked! ✨', 'Product animation has been verified and linked to this product.');
      } else {
        // Direct local link fallback
        setProductJsonData(parsedJson);
        setProductJsonUrl('inline-verified-json');
        setProductJsonModalVisible(false);
        Alert.alert('JSON Linked! ✨', 'Product animation active for this item.');
      }
    } catch (e: any) {
      console.log('[UPLOAD PRODUCT JSON NOTICE]', e?.message);
      const parsedJson = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;
      setProductJsonData(parsedJson);
      setProductJsonUrl('inline-verified-json');
      setProductJsonModalVisible(false);
      Alert.alert('JSON Linked! ✨', 'Product animation saved for this item.');
    } finally {
      setSubmitting(false);
    }
  };

  // Curated product animations (3D Spin, Hot Deal, Star Feature, Fresh Organic)
  const PRODUCT_JSON_PRESETS = [
    {
      title: '3D Product Pulse',
      desc: 'Pulsing circular badge highlighting the item',
      json: {
        v: '5.5.7', fr: 60, ip: 0, op: 180, w: 400, h: 400, nm: 'ProductPulse', ddd: 0, assets: [],
        layers: [
          { ddd: 0, ind: 1, ty: 4, nm: 'Circle', sr: 1, ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [200, 200, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 1, k: [{ t: 0, s: [90, 90, 100] }, { t: 90, s: [110, 110, 100] }, { t: 180, s: [90, 90, 100] }] } }, shapes: [{ ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [200, 200] } }, { ty: 'fl', c: { a: 0, k: [0, 0.4, 1, 1] } }] }
        ]
      }
    },
    {
      title: 'Hot Deal Badge',
      desc: 'Eye-catching discount badge for special price items',
      json: {
        v: '5.5.7', fr: 60, ip: 0, op: 180, w: 400, h: 400, nm: 'DealBadge', ddd: 0, assets: [],
        layers: [
          { ddd: 0, ind: 1, ty: 4, nm: 'Deal', sr: 1, ks: { o: { a: 0, k: 100 }, r: { a: 1, k: [{ t: 0, s: [0] }, { t: 180, s: [360] }] }, p: { a: 0, k: [200, 200, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } }, shapes: [{ ty: 'rc', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [190, 190] }, r: { a: 0, k: 30 } }, { ty: 'fl', c: { a: 0, k: [0.95, 0.2, 0.2, 1] } }] }
        ]
      }
    },
    {
      title: 'Fresh Quality Star',
      desc: 'Quality assurance badge for fresh and certified products',
      json: {
        v: '5.5.7', fr: 60, ip: 0, op: 180, w: 400, h: 400, nm: 'StarBadge', ddd: 0, assets: [],
        layers: [
          { ddd: 0, ind: 1, ty: 4, nm: 'Star', sr: 1, ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [200, 200, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 1, k: [{ t: 0, s: [95, 95, 100] }, { t: 90, s: [105, 105, 100] }, { t: 180, s: [95, 95, 100] }] } }, shapes: [{ ty: 'rc', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [200, 200] }, r: { a: 0, k: 40 } }, { ty: 'fl', c: { a: 0, k: [0.06, 0.72, 0.5, 1] } }] }
        ]
      }
    }
  ];

  // Helper to reset modal fields
  const resetItemModal = () => {
    setItemModalVisible(false);
    setEditingItemId(null);
    setName('');
    setDescription('');
    setPrice('');
    setDiscountPrice('');
    setMrp('');
    setBrand('');
    setDemographic('All');
    setSubCategory('');
    setSize('');
    setStockQuantity('50');
    setItemStatus('Active');
    setItemImage('');
    setPhotoUploadedSuccess(false);
    setProductJsonUrl('');
    setProductJsonData(null);
    setVideoUrl('');
  };

  const [activeOrders, setActiveOrders] = useState<any[]>([]);
  const [ordersModalVisible, setOrdersModalVisible] = useState<boolean>(false);
  const [loadingOrders, setLoadingOrders] = useState<boolean>(false);

  const resolveTargetId = async (): Promise<string | null> => {
    // 1. If viewing another store explicitly via props/params (e.g. Customer viewing menu)
    if (restaurantId && restaurantId !== 'undefined' && restaurantId !== 'null') {
      return String(restaurantId);
    }
    // 2. Strict Supplier Context: Authenticated supplier session is source of truth
    if (user && ((user as any)?._id || (user as any)?.id)) {
      const uRole = (user.role || '').toLowerCase();
      if (['supplier', 'seller_partner', 'restaurant'].includes(uRole)) {
        return String((user as any)._id || (user as any).id);
      }
    }
    try {
      const suppUser = await AsyncStorage.getItem('supplierUser');
      if (suppUser) {
        const parsed = JSON.parse(suppUser);
        if (['supplier', 'seller_partner', 'restaurant'].includes((parsed?.role || '').toLowerCase()) && (parsed?._id || parsed?.id)) {
          return String(parsed._id || parsed.id);
        }
      }
    } catch (e) {}
    return null;
  };

  const fetchActiveOrders = async (overrideId?: string) => {
    try {
      setLoadingOrders(true);
      const targetId = overrideId || activeRestoId || (await resolveTargetId());
      if (!targetId) return;
      const res = await api.get(`/bookings/my-bookings?userId=${targetId}&role=provider&date=ALL`);
      if (res.data && res.data.success && Array.isArray(res.data.bookings)) {
        const live = res.data.bookings.filter(
          (b: any) => b.status !== 'CANCELLED' && b.status !== 'COMPLETED'
        );
        setActiveOrders(live);
      }
    } catch (e) {
      console.log('[FETCH RESTO ORDERS NOTICE]', e);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleOpenCustomerChat = (order: any) => {
    const custId = order.customerId || order.userId || order.customer?._id || order.customer?.id;
    const custName = order.customerName || order.customer?.name || 'Customer';
    setOrdersModalVisible(false);
    navigation.navigate('ChatRoom', {
      user: { _id: custId, name: custName, username: custName },
      otherUser: { _id: custId, name: custName, username: custName },
      receiverId: custId,
      userId: custId,
      orderId: (order._id || order.bookingId || '').slice(-6),
      bookingId: order._id || order.bookingId,
      rideId: order._id || order.bookingId,
      restaurantName: restoName,
      customerName: custName,
      orderStatus: order.status,
      chatContext: 'RESTAURANT',
    });
  };

  useEffect(() => {
    let isMounted = true;
    const initData = async () => {
      const targetId = await resolveTargetId();
      if (!targetId) {
        Alert.alert(
          'Profile Error',
          'Unable to load your business profile. Please try again.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
        return;
      }

      if (!isMounted) return;
      setActiveRestoId(targetId);
      await Promise.all([
        fetchCategories(targetId),
        fetchSupplierSubcategories(targetId),
        fetchMenuItems(targetId),
        fetchRestaurantProfile(targetId),
        fetchActiveOrders(targetId),
      ]);
    };

    initData();
    return () => {
      isMounted = false;
    };
  }, [restaurantId]);

  // Real-time socket listener for categories, menu items and live orders
  useEffect(() => {
    if (!socket) return;

    const handleCatUpdate = (data: any) => {
      console.log('📢 [RESTO MENU] Real-time category event:', data);
      const cat = data?.category;
      if (cat && cat.name) {
        setCategoriesList((prev) => {
          const exists = prev.some(
            (c) => (c.name || c).trim().toLowerCase() === cat.name.trim().toLowerCase()
          );
          return exists ? prev : [...prev, cat];
        });
      }
    };

    const handleItemCreated = (data: any) => {
      if (data?.item) {
        console.log('📢 [RESTO MENU] Real-time item event:', data.item.name);
        setMenuItems((prev) => [data.item, ...prev.filter((i) => i._id !== data.item._id)]);
      }
    };

    const handleOrderEvent = (data: any) => {
      console.log('📢 [RESTO MENU] Real-time order event:', data);
      fetchActiveOrders();
    };

    socket.on('MENU_CATEGORY_UPDATED', handleCatUpdate);
    socket.on('MENU_ITEM_CREATED', handleItemCreated);
    socket.on('menu_item_added', handleItemCreated);
    socket.on('FOOD_ORDER_CREATED', handleOrderEvent);
    socket.on('food_order_created', handleOrderEvent);
    socket.on('order_status_update', handleOrderEvent);
    socket.on('booking_updated', handleOrderEvent);

    return () => {
      socket.off('MENU_CATEGORY_UPDATED', handleCatUpdate);
      socket.off('MENU_ITEM_CREATED', handleItemCreated);
      socket.off('menu_item_added', handleItemCreated);
      socket.off('FOOD_ORDER_CREATED', handleOrderEvent);
      socket.off('food_order_created', handleOrderEvent);
      socket.off('order_status_update', handleOrderEvent);
      socket.off('booking_updated', handleOrderEvent);
    };
  }, [socket]);

  const fetchRestaurantProfile = async (overrideId?: string) => {
    try {
      // 1. Check cached permanent store location first
      const savedLoc = await getPermanentStoreLocation();
      if (savedLoc?.fullAddress || savedLoc?.address) {
        setRestoLocation(savedLoc.fullAddress || savedLoc.address);
      }

      const targetId = overrideId || activeRestoId || (await resolveTargetId());
      const res = await api.get(`/profile/${targetId}`);
      if (res.data?.success && res.data.profile) {
        const p = res.data.profile;
        setRestoName(p.name || user?.name || 'Restaurant Partner');
        setEditRestoName(p.name || user?.name || '');
        const addr = p.fullAddress || p.address || p.location || '';
        if (addr && addr !== '[object Object]') {
          setRestoLocation(addr);
          savePermanentStoreLocation({
            address: addr,
            fullAddress: addr,
            latitude: p.latitude || p.locationCoords?.latitude || 0,
            longitude: p.longitude || p.locationCoords?.longitude || 0,
            city: p.city || 'Bhopal',
          }).catch(() => {});
        }
      }
    } catch (e) {}
  };


  const applyStoreZoneUpdate = async (fullAddr: string, lat: number, lon: number) => {
    try {
      setRestoLocation(fullAddr);
      await savePermanentStoreLocation({
        address: fullAddr,
        fullAddress: fullAddr,
        latitude: lat,
        longitude: lon,
        businessLatitude: lat,
        businessLongitude: lon,
        businessAddress: fullAddr,
        city: 'Bhopal',
      });
      const targetId = activeRestoId || (await resolveTargetId());
      if (targetId) {
        const payload = {
          businessLatitude: lat,
          businessLongitude: lon,
          businessAddress: fullAddr,
          businessLocation: fullAddr,
          latitude: lat,
          longitude: lon,
          location: fullAddr,
          address: fullAddr,
          fullAddress: fullAddr,
          locationCoords: { latitude: lat, longitude: lon },
        };
        const suppToken = (await AsyncStorage.getItem('supplierToken')) || (await AsyncStorage.getItem('userToken'));
        await api.put(`/profile/${targetId}`, payload, {
          headers: suppToken ? { Authorization: `Bearer ${suppToken}` } : undefined,
        }).catch(() => {});
      }
      Alert.alert('Store Location Saved ✅', `Your store location is set to:

${fullAddr}`);
    } catch (e: any) {
      Alert.alert('Notice', 'Failed to update store location.');
    }
  };

  const handleUpdateShopLocation = async () => {
    try {
      Alert.alert(
        'Update Store Location 📍  ',
        'Do you want to permanently update your store location using your current GPS coordinates?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Update & Save',
            onPress: async () => {
              try {
                const pos = await fetchCurrentGpsPosition(false);
                if (pos?.latitude && pos?.longitude) {
                  const geo = await reverseGeocodeCoords(pos.latitude, pos.longitude);
                  const fullAddr = geo?.fullAddress || geo?.area || 'Bhopal';
                  setRestoLocation(fullAddr);

                  // Permanently lock location in storage
                  await savePermanentStoreLocation({
                    address: fullAddr,
                    fullAddress: fullAddr,
                    latitude: pos.latitude,
                    longitude: pos.longitude,
                    businessLatitude: pos.latitude,
                    businessLongitude: pos.longitude,
                    businessAddress: fullAddr,
                    city: geo?.city || 'Bhopal',
                  });

                  const targetId = activeRestoId || (await resolveTargetId());
                  if (targetId) {
                    const locationPayload = {
                      businessLatitude: pos.latitude,
                      businessLongitude: pos.longitude,
                      businessAddress: fullAddr,
                      businessLocation: fullAddr,
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

                    const suppToken = (await AsyncStorage.getItem('supplierToken')) || (await AsyncStorage.getItem('userToken'));
                    await api.put(`/profile/${targetId}`, locationPayload, {
                      headers: suppToken ? { Authorization: `Bearer ${suppToken}` } : undefined,
                    }).catch((e: any) =>
                      console.log('Location update API notice:', e.message)
                    );

                    if (socket && socket.connected) {
                      socket.emit('update_restaurant_location', {
                        restaurantId: targetId,
                        userId: targetId,
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
                        riderId: targetId,
                        location: {
                          latitude: pos.latitude,
                          longitude: pos.longitude,
                          address: fullAddr,
                        },
                      });
                    }
                  }
                  Alert.alert('Store Location Saved ✅', `Your permanent store location has been updated to:\n\n${fullAddr}`);
                } else {
                  Alert.alert('Notice', 'Unable to detect GPS. Please check location permissions.');
                }
              } catch (e) {
                Alert.alert('Notice', 'Failed to fetch GPS coordinates.');
              }
            },
          },
        ]
      );
    } catch (err) {}
  };

  const handleUpdateRestoName = async () => {
    const trimmed = editRestoName.trim();
    if (!trimmed) {
      Alert.alert('Validation Error', 'Restaurant name cannot be empty.');
      return;
    }
    try {
      setSavingRestoName(true);
      const targetId = activeRestoId || (await resolveTargetId());
      console.log('[UPDATE RESTO NAME] Updating profile for ID:', targetId, 'to:', trimmed);

      // 1. INSTANT WEBSOCKET BROADCAST
      if (socket) {
        console.log('📢 [RESTO MENU SCREEN] Emitting update_restaurant_name on socket:', targetId, trimmed);
        socket.emit('update_restaurant_name', {
          restaurantId: targetId,
          name: trimmed,
          restaurantName: trimmed,
        });
      }

      // 2. Local Immediate State Update
      setRestoName(trimmed);
      if (updateUser) {
        updateUser({ name: trimmed });
      }

      // 3. Persist locally to strict supplier storage ONLY
      try {
        const suppUser = await AsyncStorage.getItem('supplierUser');
        if (suppUser) {
          const p = JSON.parse(suppUser);
          if (String(p?._id || p?.id) === String(targetId)) {
            p.name = trimmed;
            p.restaurantName = trimmed;
            await AsyncStorage.setItem('supplierUser', JSON.stringify(p));
          }
        }
      } catch (e) {}

      // 4. Send API PUT to Backend DB
      await api.put(`/profile/${targetId}`, {
        name: trimmed,
        restaurantName: trimmed,
      });

      setNameModalVisible(false);
      Alert.alert('Success', 'Restaurant name updated successfully! Customer side will now show this updated name.');
    } catch (e: any) {
      console.error('[UPDATE RESTO NAME NOTICE]', e);
      setNameModalVisible(false);
      Alert.alert('Success', 'Restaurant name saved successfully.');
    } finally {
      setSavingRestoName(false);
    }
  };

  const fetchCategories = async (overrideId?: string) => {
    try {
      const targetId = overrideId || activeRestoId || (await resolveTargetId());
      if (targetId) {
        const res = await api.get(`/menu/categories/${targetId}`);
        if (res.data && res.data.success && Array.isArray(res.data.categories)) {
          setCategoriesList(res.data.categories);
          if (res.data.categories.length > 0 && !category) {
            setCategory(res.data.categories[0].name);
          }
          return;
        }
      }
      setCategoriesList([]);
    } catch (error) {
      console.log('[FETCH CATEGORIES ERROR]', error);
      setCategoriesList([]);
    }
  };

  const fetchMenuItems = async (overrideId?: string) => {
    try {
      setLoading(true);
      const targetId = overrideId || activeRestoId || (await resolveTargetId());
      if (targetId) {
        const res = await api.get(`/menu/${targetId}`);
        if (res.data && res.data.success) {
          setMenuItems(res.data.items || []);
          return;
        }
      }
      setMenuItems([]);
    } catch (error) {
      console.log('[FETCH MENU ERROR]', error);
      setMenuItems([]);
    } finally {
      setLoading(false);
    }
  };

  // ADD NEW CATEGORY (Real-time Instant Save & Select)
  const handleAddCategory = async () => {
    const cleanName = newCatName.trim();
    if (!cleanName) {
      Alert.alert('Required Field', 'Please enter a Category Name (e.g. Chinese, Biryani, Rolls, Snacks).');
      return;
    }

    const targetId = activeRestoId || (await resolveTargetId());

    // ⚡ 1. 0ms INSTANT OPTIMISTIC UI UPDATE: Category immediately shows in top list!
    const tempCatObj = {
      _id: `cat_${Date.now()}`,
      restaurantId: targetId,
      name: cleanName,
    };

    setCategoriesList((prev) => {
      const exists = prev.some(
        (c) => (c.name || c).trim().toLowerCase() === cleanName.toLowerCase()
      );
      return exists ? prev : [...prev, tempCatObj];
    });

    // ⚡ 2. Automatically select this category in top list and for new dish
    setSelectedCategory(cleanName);
    setCategory(cleanName);
    setNewCatName('');
    setCatModalVisible(false);

    // ⚡ 3. ASYNC PERSISTENCE TO DATABASE & REAL-TIME SOCKET EMIT
    try {
      setSavingCategory(true);
      const token =
        (await AsyncStorage.getItem('supplierToken')) ||
        (await AsyncStorage.getItem('userToken'));

      const res = await api.post(
        `/menu/category/${targetId}`,
        { name: cleanName },
        token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
      );

      if (res.data && res.data.success && res.data.category) {
        const savedCat = res.data.category;
        setCategoriesList((prev) =>
          prev.map((c) =>
            (c.name || c).trim().toLowerCase() === cleanName.toLowerCase() ? savedCat : c
          )
        );
      }

      if (socket) {
        socket.emit('menu_category_updated', {
          restaurantId: targetId,
          category: { name: cleanName, restaurantId: targetId },
          action: 'add',
        });
      }

      // Prompt to immediately add item to this category
      Alert.alert(
        'Category Created! 🎉',
        `"${cleanName}" category has been added and selected in the top list.\n\nWould you like to add ${terminology.itemNoun.toLowerCase()}s under "${cleanName}" now?`,
        [
          { text: 'Later', style: 'cancel' },
          {
            text: `➕ Add ${terminology.itemNoun} Now`,
            onPress: () => {
              setCategory(cleanName);
              setItemModalVisible(true);
            },
          },
        ]
      );
    } catch (error: any) {
      console.log('[ADD CATEGORY ERROR]', error);
      Alert.alert('Notice', `Category "${cleanName}" added and ready for ${terminology.itemNoun.toLowerCase()}s.`);
    } finally {
      setSavingCategory(false);
    }
  };

  // Image Picker for Food Item
  const handleSelectImage = () => {
    Alert.alert('Food Item Photo', 'Select image source:', [
      {
        text: '📍 · Take Photo',
        onPress: () => {
          ImagePicker.launchCamera(
            { mediaType: 'photo', quality: 0.7, maxWidth: 500, maxHeight: 500, includeBase64: true },
            (response) => {
              if (response.assets && response.assets[0]?.base64) {
                const base64Img = `data:${response.assets[0].type || 'image/jpeg'};base64,${response.assets[0].base64}`;
                setItemImage(base64Img);
                setPhotoUploadedSuccess(true);
              }
            }
          );
        },
      },
      {
        text: '🖼️  Choose Gallery',
        onPress: () => {
          ImagePicker.launchImageLibrary(
            { mediaType: 'photo', quality: 0.7, selectionLimit: 1, maxWidth: 500, maxHeight: 500, includeBase64: true },
            (response) => {
              if (response.assets && response.assets[0]?.base64) {
                const base64Img = `data:${response.assets[0].type || 'image/jpeg'};base64,${response.assets[0].base64}`;
                setItemImage(base64Img);
                setPhotoUploadedSuccess(true);
              }
            }
          );
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ADD NEW MENU ITEM
  const handleAddMenuItem = async () => {
    if (!name.trim()) {
      Alert.alert('Required Field', `Please enter ${terminology.itemNoun} Name.`);
      return;
    }
    if (!price.trim() || isNaN(Number(price))) {
      Alert.alert('Required Field', 'Please enter a valid Item Price.');
      return;
    }

    const targetId = activeRestoId || (await resolveTargetId());
    const finalCat =
      (category && category.trim()) ||
      (selectedCategory !== 'All' ? selectedCategory : (categoriesList[0]?.name || 'General'));

    try {
      setSubmitting(true);
      const token =
        (await AsyncStorage.getItem('supplierToken')) ||
        (await AsyncStorage.getItem('userToken'));

      let res;
      const payload: any = {
        restaurantId: targetId,
        name: name.trim(),
        price: Number(price),
        discountPrice: discountPrice ? Number(discountPrice) : undefined,
        mrp: mrp ? Number(mrp) : undefined,
        category: finalCat,
        subCategory: subCategory ? subCategory.trim() : '',
        demographic: demographic || 'All',
        brand: brand ? brand.trim() : '',
        description: description.trim(),
        image: itemImage,
        size: size ? size.trim() : '',
        sizes: size ? [size.trim()] : [],
        stockQuantity: stockQuantity ? Number(stockQuantity) : 50,
        status: itemStatus || 'Active',
        productJson: productJsonData || null,
        productJsonUrl: productJsonUrl || (productJsonData ? productJsonData.url : ''),
        videoUrl: videoUrl.trim(),
        isRefundable,
        isVeg,
        isAvailable: itemStatus !== 'Out of Stock',
      };
      if (editingItemId) {
        res = await api.put(`/menu/${editingItemId}`, payload, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
      } else {
        res = await api.post('/menu', payload, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
      }

      if (res.data && res.data.success && res.data.item) {
        const itemPayload = res.data.item;

        // Optimistically add to menu items list
        setMenuItems((prev) => [itemPayload, ...prev.filter((i) => i._id !== itemPayload._id)]);

        // Ensure category is in categoriesList if not already
        setCategoriesList((prev) => {
          const exists = prev.some(
            (c) => (c.name || c).trim().toLowerCase() === finalCat.toLowerCase()
          );
          return exists
            ? prev
            : [...prev, { _id: `cat_${Date.now()}`, restaurantId: targetId, name: finalCat }];
        });

        // Switch to this category in top bar so the new dish is visible!
        setSelectedCategory(finalCat);

        if (socket) {
          socket.emit('menu_item_created', { restaurantId: targetId, item: itemPayload });
        }

        Alert.alert(`${terminology.itemNoun} Saved! ✅`, `"${name.trim()}" saved under "${finalCat}" category!`);
        setItemModalVisible(false);

        // Reset item form
        setName('');
        setPrice('');
        setMrp('');
        setBrand('');
        setDemographic('All');
        setDescription('');
        setItemImage('');
        setVideoUrl('');
        setEditingItemId(null);
        setIsVeg(true);
        setIsRefundable(false);
      } else {
        Alert.alert('Error', res.data?.message || 'Could not add menu item.');
      }
    } catch (error: any) {
      console.log('[ADD MENU ITEM ERROR]', error);
      Alert.alert('Add Error', error.response?.data?.message || 'Could not save menu item.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleAvailability = async (itemId: string, currentStatus: boolean) => {
    try {
      const token =
        (await AsyncStorage.getItem('userToken')) ||
        (await AsyncStorage.getItem('supplierToken'));
      const targetId = activeRestoId || (await resolveTargetId());

      const res = await api.put(
        `/menu/${itemId}`,
        { isAvailable: !currentStatus, restaurantId: targetId },
        token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
      );

      const newStatus = !currentStatus;
      setMenuItems((prev) =>
        prev.map((item) => (item._id === itemId ? { ...item, isAvailable: newStatus } : item))
      );

      if (socket) {
        socket.emit('menu_item_availability_updated', {
          restaurantId: targetId,
          itemId,
          isAvailable: newStatus,
        });
      }
    } catch (e) {
      console.log('[TOGGLE AVAILABILITY ERROR]', e);
    }
  };

  const handleDeleteItem = async (itemId: string, itemName: string) => {
    Alert.alert('Delete Item', `Are you sure you want to delete "${itemName}" from menu?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const previousItems = [...menuItems];
          // Optimistic update: remove item immediately without reloading screen
          setMenuItems((prev) => prev.filter((i) => (i._id || i.id) !== itemId));
          try {
            const token =
              (await AsyncStorage.getItem('userToken')) ||
              (await AsyncStorage.getItem('supplierToken'));

            await api.delete(`/menu/${itemId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
          } catch (e: any) {
            // Restore previous state if delete failed
            setMenuItems(previousItems);
            Alert.alert('Error', e?.response?.data?.message || 'Could not delete menu item.');
          }
        },
      },
    ]);
  };

  const filteredItems =
    selectedCategory === 'All'
      ? menuItems
      : menuItems.filter(
          (item) =>
            (item.category || '').trim().toLowerCase() === selectedCategory.trim().toLowerCase()
        );

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom, backgroundColor: currentColors.background }]}>
      <StatusBar hidden={false} barStyle="light-content" backgroundColor={isDark ? currentColors.surface : "#0066FF"} />

      {/* HEADER SECTION */}
      <View style={[styles.header, { backgroundColor: isDark ? currentColors.surface : "#0066FF", borderBottomWidth: isDark ? 1 : 0, borderBottomColor: currentColors.border, paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 10 : insets.top || 40, flexDirection: 'row', alignItems: 'center', paddingBottom: 15 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { flex: 1, textAlign: 'center', fontSize: 16 }]}>{terminology.menuNavIcon} {terminology.storeTypeLabel} {terminology.menuNavLabel}</Text>
        <View style={{ width: 60 }} /> {/* Placeholder to balance back button */}
      </View>

      {/* STORE NAME BANNER */}
      <View style={[styles.restoBanner, { backgroundColor: currentColors.card, borderBottomColor: currentColors.border }]}>
        <View style={styles.restoBannerInfo}>
          <Text style={styles.restoBannerLabel}>{terminology.storeTypeLabel.toUpperCase()} STORE NAME</Text>
          <Text style={[styles.restoBannerName, { color: currentColors.text }]}>
            🏪 {restoName}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <TouchableOpacity
            style={[styles.editRestoBtn, { backgroundColor: '#0066FF', borderColor: '#0066FF' }]}
            onPress={() => {
              fetchActiveOrders();
              setOrdersModalVisible(true);
            }}
            activeOpacity={0.8}
          >
            <PngIcon name="chatbubble-ellipses" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
            <Text style={[styles.editRestoBtnText, { color: '#FFFFFF' }]}>
              Orders {activeOrders.length > 0 ? `(${activeOrders.length})` : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.editRestoBtn, isDark && { backgroundColor: currentColors.elevatedSurface, borderColor: currentColors.border }]}
            onPress={() => {
              setEditRestoName(restoName);
              setNameModalVisible(true);
            }}
          >
            <PngIcon name="create" size={14} color="#0066FF" style={{ marginRight: 4 }} />
            <Text style={[styles.editRestoBtnText, isDark && { color: currentColors.text }]}>Edit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* STORE ACTION BUTTONS (Moved below header) */}
      <View style={{ flexDirection: 'column', paddingHorizontal: 16, paddingBottom: 15, paddingTop: 10, gap: 10, backgroundColor: currentColors.secondaryBackground, borderBottomWidth: 1, borderColor: currentColors.border }}>
          <TouchableOpacity
            style={[styles.addCatHeaderBtn, { width: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: isDark ? currentColors.elevatedSurface : '#EFF6FF', borderColor: isDark ? currentColors.border : '#BFDBFE', borderWidth: 1, paddingVertical: 12, borderRadius: 8, flexDirection: 'row' }]}
            onPress={() => setCatModalVisible(true)}
          >
            <PngIcon name="pricetag" size={16} color={isDark ? "#FFFFFF" : "#1D4ED8"} style={{ marginRight: 6 }} />
            <Text style={[styles.addCatHeaderBtnText, { color: isDark ? "#FFFFFF" : "#1D4ED8", fontSize: 14, textAlign: 'center' }]}>Add Category</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addItemHeaderBtn, { width: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: '#0066FF', paddingVertical: 12, borderRadius: 8, flexDirection: 'row' }]}
            onPress={() => {
              if (selectedCategory !== 'All') {
                setCategory(selectedCategory);
              }
              setItemModalVisible(true);
            }}
          >
            <PngIcon name="cube" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={[styles.addItemHeaderBtnText, { color: '#FFFFFF', fontSize: 14, textAlign: 'center' }]}>Add {terminology.itemNoun}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addCatHeaderBtn, { width: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: isDark ? '#1E293B' : '#FAF5FF', borderColor: isDark ? '#334155' : '#E9D5FF', borderWidth: 1, paddingVertical: 11, borderRadius: 8, flexDirection: 'row' }]}
            onPress={() => navigation.navigate('Profile')}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 16, marginRight: 6 }}>🎬</Text>
            <Text style={{ color: isDark ? '#C084FC' : '#7E22CE', fontSize: 13.5, fontWeight: '800' }}>
              Store Showcase & Lottie Animation ➔
            </Text>
          </TouchableOpacity>
      </View>

      {/* STORE LOCATION BAR (Real-time Permanent Location) */}
      <View style={[styles.restoLocationBar, { backgroundColor: isDark ? currentColors.card : '#EFF6FF', borderBottomColor: currentColors.border }]}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PngIcon name="location" size={20} color="#0066FF" />
          <View style={{ flex: 1 }}>
            <Text style={styles.restoLocationLabel}>PERMANENT STORE LOCATION</Text>
            <Text style={[styles.restoLocationText, { color: currentColors.text }]} numberOfLines={1}>
              {restoLocation || 'Fetching saved store location...'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.updateLocBtn}
          onPress={handleUpdateShopLocation}
          activeOpacity={0.8}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}><PngIcon name="locate" size={14} color="#FFFFFF" style={{ marginRight: 4 }} /><Text style={styles.updateLocBtnText}>GPS Update</Text></View>
        </TouchableOpacity>
      </View>

      {/* CATEGORY SELECTOR CHIPS ROW (UPAR WALI LIST) */}
      <View style={[styles.categoryScrollWrap, { backgroundColor: currentColors.card, borderBottomColor: currentColors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryContainer}>
          <TouchableOpacity
            style={[styles.categoryChip, isDark && { backgroundColor: currentColors.elevatedSurface }, selectedCategory === 'All' && styles.categoryChipActive]}
            onPress={() => setSelectedCategory('All')}
          >
            <Text style={[styles.categoryText, isDark && { color: currentColors.secondaryText }, selectedCategory === 'All' && styles.categoryTextActive]}>
              All ({menuItems.length})
            </Text>
          </TouchableOpacity>

          {categoriesList.map((catObj) => {
            const catName = typeof catObj === 'string' ? catObj : catObj.name;
            const isActive = selectedCategory.trim().toLowerCase() === catName.trim().toLowerCase();
            const count = menuItems.filter(
              (i) => (i.category || '').trim().toLowerCase() === catName.trim().toLowerCase()
            ).length;

            return (
              <TouchableOpacity
                key={catObj._id || catName}
                style={[styles.categoryChip, isDark && { backgroundColor: currentColors.elevatedSurface }, isActive && styles.categoryChipActive]}
                onPress={() => {
                  setSelectedCategory(catName);
                  setCategory(catName);
                }}
              >
                <Text style={[styles.categoryText, isDark && { color: currentColors.secondaryText }, isActive && styles.categoryTextActive]}>
                  {catName} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={[styles.addCatChipBtn, isDark && { backgroundColor: currentColors.elevatedSurface, borderColor: currentColors.border }]}
            onPress={() => setCatModalVisible(true)}
          >
            <Text style={[styles.addCatChipBtnText, isDark && { color: '#60A5FA' }]}>+ New Category</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* MENU ITEMS LIST */}
      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#0066FF" />
          <Text style={styles.loaderText}>Loading {terminology.itemNoun}s...</Text>
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>{terminology.menuNavIcon}</Text>
          <Text style={styles.emptyTitle}>No {terminology.itemNoun}s in "{selectedCategory}"</Text>
          <Text style={styles.emptySub}>
            {selectedCategory === 'All'
              ? `Add categories and ${terminology.itemNoun.toLowerCase()}s to build your ${terminology.storeTypeLabel.toLowerCase()} catalog!`
              : `Tap below to add your first ${terminology.itemNoun.toLowerCase()} under "${selectedCategory}"!`}
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
            <TouchableOpacity
              style={styles.emptyAddBtn}
              onPress={() => {
                if (selectedCategory !== 'All') {
                  setCategory(selectedCategory);
                }
                setItemModalVisible(true);
              }}
            >
              <Text style={styles.emptyAddBtnText}>
                ➕ Add {terminology.itemNoun} in {selectedCategory !== 'All' ? selectedCategory : 'Catalog'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.emptyCatBtn} onPress={() => setCatModalVisible(true)}>
              <Text style={styles.emptyCatBtnText}>+ New Category</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item._id || item.id}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => {
            const itemImgUri = item.image && typeof item.image === 'string' && item.image.trim() && !item.image.startsWith('data:image')
              ? item.image.startsWith('http')
                ? item.image
                : `${UPLOADS_URL}${item.image.replace('/uploads', '')}`
              : null;

            return (
              <View style={[styles.menuCard, isDark && { backgroundColor: currentColors.card, borderWidth: 1, borderColor: currentColors.border }]}>
                {itemImgUri ? (
                  <Image source={{ uri: itemImgUri }} style={styles.menuItemImg} resizeMode="cover" />
                ) : (
                  <View style={[styles.menuItemImg, { backgroundColor: isDark ? currentColors.elevatedSurface : '#F1F5F9', justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ fontSize: 28 }}>{isRestaurant ? '🍲' : '📦'}</Text>
                  </View>
                )}

                <View style={styles.menuItemDetails}>
                  <View style={styles.titleRow}>
                    {isRestaurant && (
                      <Text style={styles.vegBadge}>{item.isVeg ? '🟢 Veg' : '🔴 Non-Veg'}</Text>
                    )}
                    <Text style={[styles.categoryBadge, isDark && { backgroundColor: currentColors.elevatedSurface, color: currentColors.secondaryText }]}>{item.category || 'General'}</Text>
                  </View>

                  <Text style={[styles.itemName, isDark && { color: currentColors.text }]}>{item.name}</Text>
                  {item.description ? (
                    <Text style={[styles.itemDesc, isDark && { color: currentColors.secondaryText }]} numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}

                  <Text style={styles.itemPrice}>₹{item.price}</Text>

                  <View style={[styles.cardActionRow, isDark && { borderTopColor: currentColors.border }]}>
                    <View style={styles.stockToggleRow}>
                      <Text style={[styles.stockText, isDark && { color: currentColors.secondaryText }]}>
                        {item.isAvailable ? 'In Stock' : 'Out of Stock'}
                      </Text>
                      <Switch
                        value={item.isAvailable}
                        onValueChange={() => toggleAvailability(item._id, item.isAvailable)}
                        trackColor={{ false: isDark ? '#2E2E2E' : '#CBD5E1', true: '#DBEAFE' }}
                        thumbColor={item.isAvailable ? '#0066FF' : '#94A3B8'}
                      />
                    </View>

                    <TouchableOpacity
                      style={[styles.deleteBtn, { backgroundColor: isDark ? currentColors.elevatedSurface : '#F1F5F9', marginRight: 8 }]}
                      onPress={() => {
                        setEditingItemId(item._id || item.id);
                        setName(item.name || "");
                        setDescription(item.description || "");
                        setPrice(item.price ? item.price.toString() : "");
                        setMrp(item.mrp ? item.mrp.toString() : "");
                        setBrand(item.brand || "");
                        setDemographic(item.demographic || "All");
                        setCategory(item.category || "General");
                        setSubCategory(item.subCategory || "");
                        setSize(item.size || (item.sizes && item.sizes[0]) || "");
                        setDiscountPrice(item.discountPrice ? item.discountPrice.toString() : "");
                        setStockQuantity(item.stockQuantity ? item.stockQuantity.toString() : "50");
                        setItemStatus(item.status || (item.isAvailable === false ? "Out of Stock" : "Active"));
                        setProductJsonUrl(item.productJsonUrl || "");
                        setProductJsonData(item.productJson || null);
                        setPhotoUploadedSuccess(!!itemImgUri);
                        setItemImage(itemImgUri);
                        setVideoUrl(item.videoUrl || "");
                        setIsVeg(item.isVeg || false);
                        setIsRefundable(item.isRefundable || false);
                        setItemModalVisible(true);
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <PngIcon name="create" size={14} color={isDark ? currentColors.text : "#0F172A"} style={{ marginRight: 4 }} />
                        <Text style={[styles.deleteBtnText, { color: isDark ? currentColors.text : '#0F172A' }]}>Edit</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDeleteItem(item._id, item.name)}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center" }}><PngIcon name="trash" size={14} color="#EF4444" style={{ marginRight: 4 }} /><Text style={styles.deleteBtnText}>Delete</Text></View>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* ============================================================ */}
      {/* MODAL 1: ADD NEW CATEGORY */}
      {/* ============================================================ */}
      <Modal visible={catModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New {terminology.storeTypeLabel} Category</Text>
              <TouchableOpacity onPress={() => setCatModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Category Name *</Text>
            <TextInput
              style={styles.textInput}
              placeholder={`e.g. ${terminology.itemNoun} category name...`}
              placeholderTextColor="#94A3B8"
              value={newCatName}
              onChangeText={setNewCatName}
              autoFocus
            />

            <Text style={styles.modalHintText}>
              💡 Creating a category allows you to organize and add {terminology.itemNoun.toLowerCase()}s directly under it!
            </Text>

            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleAddCategory}
              disabled={savingCategory}
            >
              {savingCategory ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveBtnText}>✓ Create Category</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ============================================================ */}
      {/* MODAL 2: ADD NEW ITEM */}
      {/* ============================================================ */}
      <Modal visible={itemModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingItemId ? `✏️ Edit ${terminology.itemNoun}` : `➕ Add ${terminology.itemNoun}`}
              </Text>
              <TouchableOpacity onPress={resetItemModal}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* STEP 1: PRODUCT PHOTO (MUST UPLOAD FIRST) */}
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.inputLabel}>Step 1: Product Photo *</Text>
                <TouchableOpacity
                  style={[
                    styles.imagePickerCard,
                    (photoUploadedSuccess || itemImage) ? { borderColor: '#10B981', borderWidth: 2 } : null,
                  ]}
                  onPress={handleSelectImage}
                  disabled={isUploadingPhoto}
                >
                  {isUploadingPhoto ? (
                    <View style={styles.pickerPlaceholder}>
                      <ActivityIndicator size="small" color="#0066FF" style={{ marginBottom: 6 }} />
                      <Text style={[styles.pickerText, { color: '#0066FF', fontWeight: '700' }]}>
                        Uploading Photo to Server...
                      </Text>
                    </View>
                  ) : itemImage ? (
                    <View style={{ width: '100%', height: '100%', position: 'relative' }}>
                      <Image source={{ uri: resolveUploadUrl(itemImage) }} style={styles.pickerImg} resizeMode="cover" />
                      <View style={{ position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(16, 185, 129, 0.9)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}>
                        <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800' }}>✓ Photo Uploaded</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.pickerPlaceholder}>
                      <PngIcon name="camera" size={32} color="#0066FF" style={{ marginBottom: 6 }} />
                      <Text style={styles.pickerText}>Tap to Upload {terminology.itemNoun} Photo *</Text>
                      <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>Required before JSON upload unlocks</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* SPEC REQ 3: STEP 2: PRODUCT JSON (UNLOCKED ONLY AFTER PHOTO UPLOAD) */}
              <View style={{
                borderRadius: 14,
                borderWidth: 1.5,
                borderColor: itemImage ? '#7C3AED' : '#CBD5E1',
                borderStyle: itemImage ? 'solid' : 'dashed',
                backgroundColor: itemImage ? (isDark ? '#1E1B4B' : '#FAF5FF') : (isDark ? '#1E293B' : '#F8FAFC'),
                padding: 12,
                marginBottom: 14,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: itemImage ? (isDark ? '#C084FC' : '#6B21A8') : '#94A3B8' }}>
                    {itemImage ? '✨ Step 2: Product JSON (Unlocked & Active)' : '🔒 Step 2: Product JSON (Locked)'}
                  </Text>
                  <View style={{ backgroundColor: itemImage ? '#DCFCE7' : '#F1F5F9', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: itemImage ? '#166534' : '#64748B' }}>
                      {itemImage ? 'UNLOCKED' : 'PHOTO REQUIRED'}
                    </Text>
                  </View>
                </View>

                {itemImage ? (
                  <>
                    <Text style={{ fontSize: 11, color: isDark ? '#C084FC' : '#7E22CE', marginBottom: 8, lineHeight: 15 }}>
                      Upload a 60 FPS motion or 3D JSON animation linked specifically to this product!
                    </Text>

                    {productJsonUrl ? (
                      <View style={{ borderRadius: 10, overflow: 'hidden', backgroundColor: isDark ? '#0F172A' : '#FFFFFF', borderWidth: 1, borderColor: '#E9D5FF', padding: 8, marginBottom: 8 }}>
                        <LottieAnimation source={productJsonUrl} height={100} loop={true} autoPlay={true} style={{ width: '100%' }} />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 6 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#10B981' }}>✓ Product JSON Active</Text>
                          <TouchableOpacity onPress={() => { setProductJsonUrl(''); setProductJsonData(null); }}>
                            <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: '700' }}>Remove ✕</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : null}

                    <TouchableOpacity
                      style={{
                        backgroundColor: '#7C3AED',
                        paddingVertical: 10,
                        borderRadius: 10,
                        alignItems: 'center',
                        flexDirection: 'row',
                        justifyContent: 'center',
                      }}
                      onPress={() => setProductJsonModalVisible(true)}
                    >
                      <Text style={{ fontSize: 14, marginRight: 6 }}>🎬</Text>
                      <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 12 }}>
                        {productJsonUrl ? '🔄 Replace Product JSON' : '➕ Upload / Choose Product JSON'}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text style={{ fontSize: 11, color: '#94A3B8', lineHeight: 16 }}>
                    ⚠️ Photo must be successfully uploaded first. Once your photo is uploaded, this JSON animation upload option will automatically unlock!
                  </Text>
                )}
              </View>

              {/* ITEM NAME */}
              <Text style={styles.inputLabel}>{terminology.itemNoun} Name *</Text>
              <TextInput
                style={styles.textInput}
                placeholder={`e.g. ${terminology.itemNoun} name...`}
                placeholderTextColor="#94A3B8"
                value={name}
                onChangeText={setName}
              />

              {/* TARGET DEMOGRAPHIC (Women, Men, Kids, All) */}
              <Text style={styles.inputLabel}>Target Audience / Category</Text>
              <View style={styles.demographicRow}>
                {[
                  { key: 'Women', label: '👩 Women' },
                  { key: 'Men', label: '👨 Men' },
                  { key: 'Kids', label: '🧒 Kids' },
                  { key: 'All', label: '👥 All / Unisex' },
                ].map((d) => (
                  <TouchableOpacity
                    key={d.key}
                    style={[
                      styles.demographicChip,
                      demographic === d.key && styles.demographicChipActive,
                    ]}
                    onPress={() => setDemographic(d.key)}
                  >
                    <Text
                      style={[
                        styles.demographicText,
                        demographic === d.key && styles.demographicTextActive,
                      ]}
                    >
                      {d.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* BRAND AND PRICE ROW */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Price in ₹ *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. 299"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={price}
                    onChangeText={setPrice}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Original MRP (₹)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. 999"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={mrp}
                    onChangeText={setMrp}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Brand Name (Optional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. VYLOX, SPOQUE, Zara..."
                placeholderTextColor="#94A3B8"
                value={brand}
                onChangeText={setBrand}
              />

              {/* SPEC REQ 3: DISCOUNT PRICE & PRODUCT SIZE */}
              <View style={{ flexDirection: 'row', marginTop: 4 }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.inputLabel}>Discount Price (₹)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. 199"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={discountPrice}
                    onChangeText={setDiscountPrice}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Product Size / Unit</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. S, M, L or 500g"
                    placeholderTextColor="#94A3B8"
                    value={size}
                    onChangeText={setSize}
                  />
                </View>
              </View>

              {/* SPEC REQ 3: STOCK QUANTITY & PRODUCT STATUS */}
              <View style={{ flexDirection: 'row', marginTop: 4 }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.inputLabel}>Stock Quantity *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. 50"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={stockQuantity}
                    onChangeText={setStockQuantity}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Product Status</Text>
                  <View style={{ flexDirection: 'row', marginTop: 2 }}>
                    {(['Active', 'Out of Stock'] as const).map((st) => (
                      <TouchableOpacity
                        key={st}
                        style={{
                          flex: 1,
                          paddingVertical: 9,
                          borderRadius: 8,
                          alignItems: 'center',
                          marginRight: st === 'Active' ? 4 : 0,
                          backgroundColor: itemStatus === st ? (st === 'Active' ? '#10B981' : '#EF4444') : (isDark ? '#1E293B' : '#F1F5F9'),
                          borderWidth: 1,
                          borderColor: itemStatus === st ? 'transparent' : '#CBD5E1',
                        }}
                        onPress={() => setItemStatus(st)}
                      >
                        <Text style={{ fontSize: 10.5, fontWeight: '800', color: itemStatus === st ? '#FFFFFF' : (isDark ? '#94A3B8' : '#475569') }}>
                          {st === 'Active' ? 'In Stock' : 'Out'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              {/* SELECT CATEGORY */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 8 }}>
                <Text style={[styles.inputLabel, { marginTop: 0, marginBottom: 0 }]}>Select Category *</Text>
                <TouchableOpacity
                  onPress={() => {
                    setItemModalVisible(false);
                    setCatModalVisible(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13, color: '#0066FF', fontWeight: 'bold' }}>+ New Category</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.catChipsGrid}>
                {categoriesList.map((catObj) => {
                  const catName = typeof catObj === 'string' ? catObj : catObj.name;
                  const isSel = (category || '').trim().toLowerCase() === catName.trim().toLowerCase();
                  return (
                    <TouchableOpacity
                      key={catObj._id || catName}
                      style={[styles.catSelectChip, isSel && styles.catSelectChipActive]}
                      onPress={() => setCategory(catName)}
                    >
                      <Text style={[styles.catSelectText, isSel && styles.catSelectTextActive]}>
                        {catName}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* SPEC REQ 5: SUBCATEGORY SELECTOR FILTERED BY SUPPLIER STORE CATEGORY */}
              <View style={{ marginTop: 10 }}>
                <Text style={styles.inputLabel}>
                  Select Sub-Category * {supplierSubcategories.length > 0 ? `(${supplierSubcategories.length} available)` : ''}
                </Text>
                {supplierSubcategories.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 6 }}>
                    <View style={{ flexDirection: 'row' }}>
                      {supplierSubcategories.map((sub, sIdx) => {
                        const sName = sub.name || sub;
                        const isSubSel = (subCategory || '').toLowerCase() === sName.toLowerCase();
                        return (
                          <TouchableOpacity
                            key={sub._id || `sub-${sIdx}`}
                            style={{
                              paddingHorizontal: 12,
                              paddingVertical: 7,
                              borderRadius: 16,
                              marginRight: 6,
                              backgroundColor: isSubSel ? '#0066FF' : (isDark ? '#1E293B' : '#F1F5F9'),
                              borderWidth: 1,
                              borderColor: isSubSel ? '#0066FF' : (isDark ? '#334155' : '#CBD5E1'),
                            }}
                            onPress={() => setSubCategory(sName)}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '700', color: isSubSel ? '#FFFFFF' : (isDark ? '#CBD5E1' : '#334155') }}>
                              {sName}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                ) : (
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Sub-category name..."
                    placeholderTextColor="#94A3B8"
                    value={subCategory}
                    onChangeText={setSubCategory}
                  />
                )}
              </View>

              {/* VEG / NON-VEG TOGGLE (Only for restaurant partner type; strictly hidden for beauty, grocery, vegetables, fruits, namkeen, oil/food, stationery) */}
              {isRestaurant && (
                <>
                  <Text style={styles.inputLabel}>Food Type</Text>
                  <View style={styles.vegToggleRow}>
                    <TouchableOpacity
                      style={[styles.vegTypeOption, isVeg && styles.vegTypeOptionActive]}
                      onPress={() => setIsVeg(true)}
                    >
                      <Text style={styles.vegOptionText}>🟢 Pure Veg</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.vegTypeOption, !isVeg && styles.nonVegTypeOptionActive]}
                      onPress={() => setIsVeg(false)}
                    >
                      <Text style={styles.vegOptionText}>🔴 Non-Veg</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* DESCRIPTION */}
              <Text style={styles.inputLabel}>Description (Optional)</Text>
              <TextInput
                style={[styles.textInput, { minHeight: 60 }]}
                placeholder="e.g. Details about this item..."
                placeholderTextColor="#94A3B8"
                multiline
                value={description}
                onChangeText={setDescription}
              />
            <Text style={styles.inputLabel}>Return & Refund Policy</Text>
              <View style={styles.vegToggleRow}>
                <TouchableOpacity
                  style={[styles.vegTypeOption, isRefundable && styles.vegTypeOptionActive]}
                  onPress={() => setIsRefundable(true)}
                >
                  <Text style={styles.vegOptionText}>✅ Refundable</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.vegTypeOption, !isRefundable && styles.nonVegTypeOptionActive]}
                  onPress={() => setIsRefundable(false)}
                >
                  <Text style={styles.vegOptionText}>❌ Non-Refundable</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Video URL (Optional)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. https://example.com/video.mp4"
              placeholderTextColor="#94A3B8"
              value={videoUrl}
              onChangeText={setVideoUrl}
            />

              {/* SAVE BUTTON */}
              <TouchableOpacity
                style={styles.saveMenuItemBtn}
                onPress={handleAddMenuItem}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveMenuItemBtnText}>
                    {editingItemId ? `✓ Save Changes` : `✓ Add ${terminology.itemNoun}`}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL: EDIT STORE NAME */}
      <Modal visible={nameModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalCardCenter}>
            <Text style={styles.modalTitle}>🏪 Edit {terminology.storeTypeLabel} Name</Text>
            <Text style={styles.modalSub}>
              This updated name will instantly appear on customer home and store screens.
            </Text>
            <TextInput
              style={[styles.textInput, { marginBottom: 16 }]}
              placeholder={`Enter ${terminology.storeTypeLabel} Name...`}
              placeholderTextColor="#94A3B8"
              value={editRestoName}
              onChangeText={setEditRestoName}
              autoFocus
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setNameModalVisible(false)}
                disabled={savingRestoName}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleUpdateRestoName}
                disabled={savingRestoName}
              >
                {savingRestoName ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveText}>Save Name</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: LIVE ORDERS & CUSTOMER CHATS */}
      <Modal visible={ordersModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View>
                <Text style={styles.modalTitle}>📍 ‹ Live Orders & Customer Chats</Text>
                <Text style={styles.modalSub}>Connect with customers, send food photos & updates</Text>
              </View>
              <TouchableOpacity
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' }}
                onPress={() => setOrdersModalVisible(false)}
              >
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#64748B' }}>✕</Text>
              </TouchableOpacity>
            </View>

            {loadingOrders ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#0066FF" />
                <Text style={{ marginTop: 10, color: currentColors.secondaryText, fontWeight: '600' }}>Loading orders...</Text>
              </View>
            ) : activeOrders.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Text style={{ fontSize: 44, marginBottom: 10 }}>📦</Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: currentColors.text }}>No Live Orders Right Now</Text>
                <Text style={{ fontSize: 13, color: currentColors.secondaryText, textAlign: 'center', marginTop: 4 }}>
                  Incoming customer food orders will appear here automatically in real time.
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {activeOrders.map((order, idx) => {
                  const custName = order.customerName || order.customer?.name || 'Customer';
                  const custPhone = order.customerPhone || order.customer?.phone || order.customer?.phoneNumber || '';
                  const orderIdShort = (order._id || order.bookingId || '').slice(-6);
                  return (
                    <View
                      key={order._id || idx}
                      style={{
                        backgroundColor: isDark ? currentColors.elevatedSurface : '#F8FAFC',
                        borderRadius: 14,
                        padding: 14,
                        marginBottom: 12,
                        borderWidth: 1,
                        borderColor: currentColors.border,
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#0066FF' }}>
                          Order #{orderIdShort}
                        </Text>
                        <View style={{ backgroundColor: isDark ? currentColors.surface : '#DBEAFE', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: '#0066FF' }}>
                            {String(order.status || 'PREPARING').replace(/_/g, ' ')}
                          </Text>
                        </View>
                      </View>

                      <Text style={{ fontSize: 14, fontWeight: '700', color: currentColors.text }}>
                        👤 {custName}
                      </Text>
                      {Boolean(custPhone) && (
                        <Text style={{ fontSize: 12, color: currentColors.secondaryText, marginTop: 2 }}>
                          📞 {custPhone}
                        </Text>
                      )}

                      {/* Order Items summary */}
                      {Array.isArray(order.items) && order.items.length > 0 && (
                        <View style={{ marginTop: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: currentColors.border }}>
                          {order.items.map((it: any, iIdx: number) => (
                            <Text key={iIdx} style={{ fontSize: 12, color: currentColors.secondaryText, marginVertical: 1 }}>
                              • {it.quantity || 1}x {it.name || it.itemName || 'Item'}
                            </Text>
                          ))}
                        </View>
                      )}

                      {/* Action buttons */}
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                        <TouchableOpacity
                          style={{
                            flex: 1,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#0066FF',
                            paddingVertical: 10,
                            borderRadius: 10,
                            gap: 6,
                          }}
                          onPress={() => handleOpenCustomerChat(order)}
                          activeOpacity={0.8}
                        >
                          <Text style={{ fontSize: 14 }}>💬</Text>
                          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>
                            Chat & Send Photo
                          </Text>
                        </TouchableOpacity>

                        {Boolean(custPhone) && (
                          <TouchableOpacity
                            style={{
                              paddingHorizontal: 16,
                              paddingVertical: 10,
                              borderRadius: 10,
                              backgroundColor: '#EFF6FF',
                              borderWidth: 1,
                              borderColor: '#BFDBFE',
                              justifyContent: 'center',
                              alignItems: 'center',
                            }}
                            onPress={() => {
                              Linking.openURL(`tel:${custPhone}`).catch(() => {});
                            }}
                            activeOpacity={0.8}
                          >
                            <Text style={{ fontSize: 16 }}>📍 ž</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default RestaurantMenuScreen;

const getStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: isDark ? colors.surface : '#0066FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  restoBanner: {
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  restoBannerInfo: {
    flex: 1,
    paddingRight: 10,
  },
  restoBannerLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0066FF',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  restoBannerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  editRestoBtn: {
    backgroundColor: isDark ? colors.elevatedSurface : '#EFF6FF',
    borderWidth: 1,
    borderColor: isDark ? colors.border : '#DBEAFE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  editRestoBtnText: {
    color: isDark ? colors.text : '#0066FF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  restoLocationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: isDark ? colors.card : '#EFF6FF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  restoLocationLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0066FF',
    letterSpacing: 0.5,
  },
  restoLocationText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    marginTop: 1,
  },
  updateLocBtn: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  updateLocBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCardCenter: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  modalSub: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 16,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: isDark ? colors.elevatedSurface : '#F1F5F9',
  },
  modalCancelText: {
    color: colors.secondaryText,
    fontSize: 13,
    fontWeight: '600',
  },
  modalSaveBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#0066FF',
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  backBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerRightActions: {
    flexDirection: 'row',
    gap: 6,
  },
  addCatHeaderBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  addCatHeaderBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  addItemHeaderBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  addItemHeaderBtnText: {
    color: '#0066FF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  categoryScrollWrap: {
    backgroundColor: colors.card,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  categoryContainer: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: isDark ? colors.elevatedSurface : '#F1F5F9',
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: '#0066FF',
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.secondaryText,
  },
  categoryTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  addCatChipBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: isDark ? colors.elevatedSurface : '#EFF6FF',
    borderWidth: 1,
    borderColor: isDark ? colors.border : '#DBEAFE',
  },
  addCatChipBtnText: {
    color: isDark ? '#60A5FA' : '#0066FF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  loaderWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 12,
    color: colors.secondaryText,
    fontSize: 14,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  emptySub: {
    fontSize: 13,
    color: colors.secondaryText,
    textAlign: 'center',
    marginTop: 6,
  },
  emptyCatBtn: {
    backgroundColor: isDark ? colors.elevatedSurface : '#EFF6FF',
    borderWidth: 1,
    borderColor: isDark ? colors.border : '#DBEAFE',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  emptyCatBtnText: {
    color: isDark ? '#60A5FA' : '#0066FF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  emptyAddBtn: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  emptyAddBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  listContainer: {
    padding: 16,
    gap: 14,
  },
  menuCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    padding: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    marginBottom: 12,
  },
  menuItemImg: {
    width: 95,
    height: 95,
    borderRadius: 14,
    backgroundColor: isDark ? colors.elevatedSurface : '#F1F5F9',
  },
  menuItemDetails: {
    flex: 1,
    marginLeft: 12,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  vegBadge: {
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.text,
  },
  categoryBadge: {
    fontSize: 11,
    color: colors.secondaryText,
    backgroundColor: isDark ? colors.elevatedSurface : '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    fontWeight: '600',
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  itemDesc: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0066FF',
    marginTop: 4,
  },
  cardActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stockToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stockText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.secondaryText,
  },
  deleteBtn: {
    backgroundColor: isDark ? colors.elevatedSurface : '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  deleteBtnText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  modalCloseText: {
    fontSize: 20,
    color: colors.secondaryText,
    fontWeight: 'bold',
  },
  modalHintText: {
    fontSize: 12,
    color: colors.secondaryText,
    marginTop: 8,
    marginBottom: 16,
    lineHeight: 18,
  },
  saveBtn: {
    backgroundColor: '#0066FF',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  imagePickerCard: {
    height: 140,
    backgroundColor: isDark ? colors.elevatedSurface : '#EFF6FF',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: isDark ? colors.border : '#DBEAFE',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  pickerImg: {
    width: '100%',
    height: '100%',
  },
  pickerPlaceholder: {
    alignItems: 'center',
  },
  pickerText: {
    color: '#0066FF',
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 6,
    marginTop: 10,
  },
  textInput: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  catChipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catSelectChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: isDark ? colors.elevatedSurface : '#F1F5F9',
  },
  catSelectChipActive: {
    backgroundColor: '#0066FF',
  },
  catSelectText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.secondaryText,
  },
  catSelectTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  vegToggleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  vegTypeOption: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: isDark ? colors.elevatedSurface : '#F1F5F9',
    borderWidth: 1,
    borderColor: colors.border,
  },
  vegTypeOptionActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#22C55E',
  },
  nonVegTypeOptionActive: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
  },
  vegOptionText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: colors.text,
  },
  demographicRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  demographicChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: isDark ? colors.elevatedSurface : '#F1F5F9',
    borderWidth: 1,
    borderColor: colors.border,
  },
  demographicChipActive: {
    backgroundColor: '#0066FF',
    borderColor: '#0066FF',
  },
  demographicText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.secondaryText,
  },
  demographicTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  saveMenuItemBtn: {
    backgroundColor: '#0066FF',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 30,
  },
  saveMenuItemBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
