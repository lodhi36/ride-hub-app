import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Dimensions,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  StatusBar,
  Modal,
  Switch,
} from 'react-native';
import { PermissionsAndroid } from 'react-native';
import { WebView } from 'react-native-webview';
import Geolocation from 'react-native-geolocation-service';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'react-native-image-picker';
import { useTheme } from '../context/ThemeContext';
import { PngIcon } from '../components/PngIcon';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api, { UPLOADS_URL } from '../services/api';
import { resolveUploadUrl } from '../config/apiConfig';
import { LottieAnimation } from '../components/LottieAnimation';
import { reverseGeocodeCoords } from '../services/LocationAddressService';
import AddressSelectionModal from '../components/AddressSelectionModal';
import { CartService } from '../services/CartService';
import { getSellerCategoryType, getCategoryTerminology } from './RiderHomeScreen';
import LanguageSelectModal from '../components/LanguageSelectModal';
import { useAppLanguage } from '../context/LanguageContext';


const { width } = Dimensions.get('window');

const ProfileScreen = ({ navigation, route }: any) => {

  const { isDark, currentColors, toggleTheme } = useTheme('supplier');
  const { user, updateUser, logout } = useAuth();
  const { t, language } = useAppLanguage();
  const [showLangModal, setShowLangModal] = useState<boolean>(false);
  const [completedOrdersCount, setCompletedOrdersCount] = useState<number>(0);
  const [dbCategories, setDbCategories] = useState<any[]>([]);
  const [loadingCats, setLoadingCats] = useState<boolean>(false);

  const rawCat = user?.categoryName || user?.businessCategoryName || '';
  let finalCat = rawCat;
  if (!finalCat && user?.category) {
    finalCat = typeof user.category === 'string' ? user.category : (user.category.name || '');
  }
  const rawPartnerType = user?.partnerType || route?.params?.partnerType || '';
  const rawBusinessType = user?.businessType || user?.business_type || route?.params?.businessType || '';
  const catType = getSellerCategoryType(finalCat, rawPartnerType, rawBusinessType);
  const terminology = getCategoryTerminology(catType);
  const isRestaurant = catType === 'restaurant';

  const { socket } = useSocket();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Edit States
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameText, setEditNameText] = useState('');

  const [isEditingBio, setIsEditingBio] = useState(false);
  const [editBioText, setEditBioText] = useState('');

  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [editLocationText, setEditLocationText] = useState('');

  const [uploading, setUploading] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  // ProfileScreen in Ride Hub is strictly the Supplier / Store management profile
  const isSupplier = true;

  // ── SPEC PART 2 & 3: PERMANENT STORE LOCATION STATE & HANDLERS ──
  const [confirmLocationModalVisible, setConfirmLocationModalVisible] = useState(false);
  const [pendingLocationData, setPendingLocationData] = useState<{
    latitude: number;
    longitude: number;
    formattedAddress: string;
    accuracy: number;
  } | null>(null);
  const [confirmingLocation, setConfirmingLocation] = useState(false);

  const handleStartConfirmPermanentLocation = async () => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Permission Denied', 'GPS Location permission is required to detect your permanent store coordinates.');
          return;
        }
      }

      setConfirmingLocation(true);
      Geolocation.getCurrentPosition(
        async (position) => {
          try {
            if (!position || !position.coords) {
              setConfirmingLocation(false);
              Alert.alert('Location Error', 'Could not obtain GPS fix. Please ensure device location is enabled.');
              return;
            }
            const { latitude, longitude, accuracy } = position.coords;

            // Strict Zero Dummy validation
            if (!latitude || !longitude || (Math.abs(latitude - 23.2505) < 0.0001 && Math.abs(longitude - 77.4065) < 0.0001)) {
              setConfirmingLocation(false);
              Alert.alert('Invalid GPS Fix', 'Dummy or default coordinates detected. Please ensure live device GPS is active.');
              return;
            }

            const addr = await reverseGeocodeCoords(latitude, longitude);
            setPendingLocationData({
              latitude,
              longitude,
              formattedAddress: addr || `Lat: ${latitude.toFixed(5)}, Lon: ${longitude.toFixed(5)}`,
              accuracy: Math.round(accuracy || 5),
            });
            setConfirmingLocation(false);
            setConfirmLocationModalVisible(true);
          } catch (posErr: any) {
            setConfirmingLocation(false);
            Alert.alert('Error', posErr.message || 'Failed to resolve location address.');
          }
        },
        (error) => {
          setConfirmingLocation(false);
          Alert.alert('GPS Error', error.message || 'Unable to retrieve device GPS coordinates.');
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    } catch (e: any) {
      setConfirmingLocation(false);
      Alert.alert('Error', e.message || 'Could not initiate GPS detection.');
    }
  };

  const handleSavePermanentLocation = async () => {
    if (!pendingLocationData) return;
    try {
      setConfirmingLocation(true);
      const res = await api.post('/profile/supplier-permanent-location', {
        latitude: pendingLocationData.latitude,
        longitude: pendingLocationData.longitude,
        formattedAddress: pendingLocationData.formattedAddress,
        accuracy: pendingLocationData.accuracy,
        isConfirmed: true,
      });

      if (res.data && res.data.success) {
        setProfile((prev: any) => ({
          ...(prev || {}),
          permanentStoreLocation: res.data.permanentStoreLocation,
          location: pendingLocationData.formattedAddress,
          businessAddress: pendingLocationData.formattedAddress,
        }));
        setConfirmLocationModalVisible(false);
        Alert.alert(
          'Permanent Store Location Locked ✓',
          'Your physical store coordinates are permanently locked in Ride Hub. They will never change when you travel or re-login.'
        );
      } else {
        Alert.alert('Failed', res.data?.message || 'Could not lock store location.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || err.message || 'Server error saving store location.');
    } finally {
      setConfirmingLocation(false);
    }
  };

  // ── SPEC PART 8: 3 STORE PHOTOS SHOWCASE STATE & HANDLERS ──
  const [showcaseSlots, setShowcaseSlots] = useState<{ uri?: string; url?: string; caption?: string }[]>([
    { caption: 'Store Front & Board' },
    { caption: 'Inside Store & Ambience' },
    { caption: 'Products & Specialties' },
  ]);
  const [isSavingPhotos, setIsSavingPhotos] = useState(false);

  // Sync existing storePhotos on profile load
  useEffect(() => {
    if (profile?.storePhotos && Array.isArray(profile.storePhotos)) {
      const isReal = (u: any) => {
        if (!u || typeof u !== 'string') return false;
        const s = u.toLowerCase();
        return !s.includes('dummy') && !s.includes('sample') && !s.includes('placeholder') && !s.includes('default');
      };
      const p0 = profile.storePhotos[0]?.url || profile.storePhotos[0] || '';
      const p1 = profile.storePhotos[1]?.url || profile.storePhotos[1] || '';
      const p2 = profile.storePhotos[2]?.url || profile.storePhotos[2] || '';
      setShowcaseSlots([
        { url: isReal(p0) ? p0 : '', caption: 'Store Front & Board' },
        { url: isReal(p1) ? p1 : '', caption: 'Inside Store & Ambience' },
        { url: isReal(p2) ? p2 : '', caption: 'Products & Specialties' },
      ]);
    }
  }, [profile?.storePhotos]);

  const handlePickShowcasePhoto = (slotIndex: number) => {
    Alert.alert(
      `Showcase Photo ${slotIndex + 1}`,
      `Select photo for ${showcaseSlots[slotIndex]?.caption || 'store showcase'}:`,
      [
        {
          text: '📷 Take Camera Photo',
          onPress: () => {
            ImagePicker.launchCamera(
              { mediaType: 'photo', maxWidth: 1200, maxHeight: 1200, quality: 0.8 },
              (resp) => {
                if (resp.assets && resp.assets[0]?.uri) {
                  const updated = [...showcaseSlots];
                  updated[slotIndex] = { ...updated[slotIndex], uri: resp.assets[0].uri };
                  setShowcaseSlots(updated);
                }
              }
            );
          },
        },
        {
          text: '🖼️ Choose from Gallery',
          onPress: () => {
            ImagePicker.launchImageLibrary(
              { mediaType: 'photo', maxWidth: 1200, maxHeight: 1200, quality: 0.8 },
              (resp) => {
                if (resp.assets && resp.assets[0]?.uri) {
                  const updated = [...showcaseSlots];
                  updated[slotIndex] = { ...updated[slotIndex], uri: resp.assets[0].uri };
                  setShowcaseSlots(updated);
                }
              }
            );
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleRemoveShowcasePhoto = (slotIndex: number) => {
    const updated = [...showcaseSlots];
    updated[slotIndex] = { caption: updated[slotIndex]?.caption || '' };
    setShowcaseSlots(updated);
  };

  const handleSaveAll3ShowcasePhotos = async () => {
    try {
      setIsSavingPhotos(true);
      const formData = new FormData();
      let hasAnyNew = false;
      const captions: string[] = [];

      showcaseSlots.forEach((slot, idx) => {
        captions.push(slot.caption || `Photo ${idx + 1}`);
        if (slot.uri) {
          hasAnyNew = true;
          formData.append('photos', {
            uri: slot.uri,
            name: `store_showcase_${idx + 1}_${Date.now()}.jpg`,
            type: 'image/jpeg',
          } as any);
        } else if (slot.url) {
          // If already on server
          formData.append('existingUrls', slot.url);
        }
      });

      formData.append('captions', JSON.stringify(captions));

      const res = await api.post('/profile/upload-store-showcase-photos', formData, {
        headers: { 'Content-Type': 'multipart/form-data', 'X-Role': 'supplier' },
      });

      if (res.data && res.data.success) {
        setProfile((prev: any) => ({
          ...(prev || {}),
          storePhotos: res.data.storePhotos,
        }));
        Alert.alert('Success ✓', 'Store showcase photos uploaded and saved to your profile!');
      } else {
        Alert.alert('Notice', res.data?.message || 'Could not upload photos.');
      }
    } catch (e: any) {
      Alert.alert('Upload Error', e.response?.data?.message || e.message || 'Error uploading showcase photos.');
    } finally {
      setIsSavingPhotos(false);
    }
  };

  // ── SPEC PART 9: SUPPLIER STORE JSON ANIMATION STATE & HANDLERS ──
  const [lottieModalVisible, setLottieModalVisible] = useState(false);
  const [lottieInputMode, setLottieInputMode] = useState<'file' | 'preset'>('file');
  const [selectedJsonFile, setSelectedJsonFile] = useState<{
    name: string;
    size: number;
    content: any;
  } | null>(null);
  const [customLottieInput, setCustomLottieInput] = useState('');
  const [lottieTitleInput, setLottieTitleInput] = useState('');
  const [isSavingLottie, setIsSavingLottie] = useState(false);

  const handleJsonFileMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'FILE_PICKED') {
        setSelectedJsonFile({
          name: data.fileName || 'store_animation.json',
          size: data.fileSize || 0,
          content: data.rawJson,
        });
        setLottieTitleInput((prev) => (prev ? prev : (data.fileName || 'Store Showcase').replace(/\.json$/i, '')));
      } else if (data.type === 'FILE_ERROR') {
        Alert.alert('Invalid File', data.error || 'The selected file is not a valid JSON.');
      }
    } catch (e: any) {
      Alert.alert('File Read Error', 'Failed to read file from storage.');
    }
  }, []);

  // Curated ready-to-use 60 FPS Lottie showcase presets
  const LOTTIE_PRESETS = [
    {
      title: 'Grand Welcome & Open',
      desc: 'Welcoming customer animation with sparkling badge',
      json: {
        v: '5.5.7', fr: 60, ip: 0, op: 180, w: 500, h: 500, nm: 'Welcome', ddd: 0, assets: [],
        layers: [
          { ddd: 0, ind: 1, ty: 4, nm: 'Badge', sr: 1, ks: { o: { a: 0, k: 100 }, r: { a: 1, k: [{ t: 0, s: [0] }, { t: 180, s: [360] }] }, p: { a: 0, k: [250, 250, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } }, shapes: [{ ty: 'rc', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [240, 240] }, r: { a: 0, k: 40 } }, { ty: 'fl', c: { a: 0, k: [0, 0.4, 1, 1] } }] }
        ]
      }
    },
    {
      title: 'Hot Sale & 50% Off Offer',
      desc: 'Pulsing promotional badge for discounts and special deals',
      json: {
        v: '5.5.7', fr: 60, ip: 0, op: 180, w: 500, h: 500, nm: 'Sale', ddd: 0, assets: [],
        layers: [
          { ddd: 0, ind: 1, ty: 4, nm: 'SaleTag', sr: 1, ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [250, 250, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 1, k: [{ t: 0, s: [90, 90, 100] }, { t: 90, s: [110, 110, 100] }, { t: 180, s: [90, 90, 100] }] } }, shapes: [{ ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [260, 260] } }, { ty: 'fl', c: { a: 0, k: [0.95, 0.2, 0.2, 1] } }] }
        ]
      }
    },
    {
      title: 'Super Fresh Quality Express',
      desc: 'Quality certified badge highlighting fresh items and top hygiene',
      json: {
        v: '5.5.7', fr: 60, ip: 0, op: 180, w: 500, h: 500, nm: 'Fresh', ddd: 0, assets: [],
        layers: [
          { ddd: 0, ind: 1, ty: 4, nm: 'Quality', sr: 1, ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [250, 250, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 1, k: [{ t: 0, s: [95, 95, 100] }, { t: 90, s: [105, 105, 100] }, { t: 180, s: [95, 95, 100] }] } }, shapes: [{ ty: 'rc', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [250, 250] }, r: { a: 0, k: 50 } }, { ty: 'fl', c: { a: 0, k: [0.06, 0.72, 0.5, 1] } }] }
        ]
      }
    },
    {
      title: 'Ultra Fast Delivery',
      desc: 'High-speed delivery motion banner for rapid dispatch',
      json: {
        v: '5.5.7', fr: 60, ip: 0, op: 180, w: 500, h: 500, nm: 'FastDelivery', ddd: 0, assets: [],
        layers: [
          { ddd: 0, ind: 1, ty: 4, nm: 'Fast', sr: 1, ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 1, k: [{ t: 0, s: [230, 250, 0] }, { t: 90, s: [270, 250, 0] }, { t: 180, s: [230, 250, 0] }] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } }, shapes: [{ ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [240, 240] } }, { ty: 'fl', c: { a: 0, k: [0.96, 0.62, 0.05, 1] } }] }
        ]
      }
    }
  ];

  const handleToggleLottieActive = async (newValue: boolean) => {
    try {
      const res = await api.post('/profile/upload-store-lottie', {
        toggleOnly: true,
        isActive: newValue,
      });
      if (res.data && res.data.success) {
        const anim = res.data.supplierLottieAnimation;
        setProfile((prev: any) => ({
          ...(prev || {}),
          supplierLottieAnimation: anim,
        }));
        try {
          await AsyncStorage.setItem('cached_supplier_lottie', JSON.stringify(anim));
          const suppUserStr = await AsyncStorage.getItem('supplierUser');
          if (suppUserStr) {
            const p = { ...JSON.parse(suppUserStr), supplierLottieAnimation: anim };
            await AsyncStorage.setItem('supplierUser', JSON.stringify(p));
          }
        } catch (_) {}
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not toggle animation.');
    }
  };

  const handleDeleteLottie = async () => {
    Alert.alert('Remove Animation', 'Are you sure you want to remove your store Lottie animation?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          // 1. Instant 0ms Optimistic UI update
          setProfile((prev: any) => ({
            ...(prev || {}),
            supplierLottieAnimation: null,
          }));

          // 2. Clear local storage in parallel
          AsyncStorage.removeItem('cached_supplier_lottie').catch(() => {});
          AsyncStorage.getItem('supplierUser').then((suppUserStr) => {
            if (suppUserStr) {
              const p = { ...JSON.parse(suppUserStr), supplierLottieAnimation: null };
              AsyncStorage.setItem('supplierUser', JSON.stringify(p)).catch(() => {});
            }
          }).catch(() => {});

          // 3. Fast backend sync
          try {
            await api.delete('/profile/store-lottie');
          } catch (e: any) {
            console.log('[DELETE LOTTIE NOTICE]', e?.message);
          }
        },
      },
    ]);
  };

  const handlePublishLottie = async (jsonContent: any, title: string) => {
    try {
      setIsSavingLottie(true);

      // Instant optimistic UI update for instant feedback
      const parsedDirectJson = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;
      const previewAnim = {
        rawJson: parsedDirectJson,
        url: '',
        title: title || 'Store Showcase Animation',
        isActive: true,
      };
      setProfile((prev: any) => ({
        ...(prev || {}),
        supplierLottieAnimation: previewAnim,
      }));
      setLottieModalVisible(false);

      const res = await api.post('/profile/upload-store-lottie', {
        rawJson: jsonContent,
        title: title || 'Store Showcase Animation',
      });

      if (res.data && res.data.success) {
        const anim = {
          ...res.data.supplierLottieAnimation,
          rawJson: parsedDirectJson, // Keep rawJson locally so rendering is 100% immediate and never blocked by network fetch
        };
        setProfile((prev: any) => ({
          ...(prev || {}),
          supplierLottieAnimation: anim,
        }));
        AsyncStorage.setItem('cached_supplier_lottie', JSON.stringify(anim)).catch(() => {});
        AsyncStorage.getItem('supplierUser').then((suppUserStr) => {
          if (suppUserStr) {
            const p = { ...JSON.parse(suppUserStr), supplierLottieAnimation: anim };
            AsyncStorage.setItem('supplierUser', JSON.stringify(p)).catch(() => {});
          }
        }).catch(() => {});
      } else {
        Alert.alert('Upload Error', res.data?.message || 'Could not publish animation.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || e.message || 'Failed to publish Lottie animation.');
    } finally {
      setIsSavingLottie(false);
    }
  };

  // Restore supplier cached profile immediately on mount
  useEffect(() => {
    const initSupplierProfile = async () => {
      try {
        let cachedLottie: any = null;
        try {
          const lottieRaw = await AsyncStorage.getItem('cached_supplier_lottie');
          if (lottieRaw) cachedLottie = JSON.parse(lottieRaw);
        } catch (_) {}

        const suppUserStr = await AsyncStorage.getItem('supplierUser');
        if (suppUserStr) {
          const parsed = JSON.parse(suppUserStr);
          if (parsed) {
            if (!parsed.supplierLottieAnimation && cachedLottie) {
              parsed.supplierLottieAnimation = cachedLottie;
            }
            setProfile(parsed);
            setEditNameText(parsed.name || parsed.restaurantName || '');
            setEditBioText(parsed.bio || '');
            setEditLocationText(parsed.businessAddress || parsed.location || parsed.address || '');
            setLoading(false);
            return;
          }
        }
        if (user) {
          const u = { ...user };
          if (!u.supplierLottieAnimation && cachedLottie) {
            u.supplierLottieAnimation = cachedLottie;
          }
          setProfile(u);
          setEditNameText(user.restaurantName || user.name || '');
          setEditBioText(user.bio || '');
          setEditLocationText(user.businessAddress || user.location || user.fullAddress || user.address || '');
          setLoading(false);
        }
      } catch (e) {}
    };
    initSupplierProfile();
  }, [user]);

  // Single Backend Source of Truth for Completed Orders Count (Persistent & Isolated)
  const fetchSupplierCompletedOrders = useCallback(async (isSilent: boolean = false) => {
    try {
      const restoId = String(profile?._id || profile?.id || user?._id || user?.id || '');
      if (!restoId) return;

      // 1. Immediately read cached count from disk on initial mount (prevents 0 -> 1 toggling)
      if (!isSilent) {
        const cachedCount = await AsyncStorage.getItem(`cached_completed_orders_${restoId}`);
        if (cachedCount !== null) {
          const parsed = parseInt(cachedCount, 10);
          if (!isNaN(parsed)) setCompletedOrdersCount(parsed);
        }
      }

      // 2. Fetch authoritative count from single backend source of truth
      let finalCount: number | null = null;
      try {
        const res = await api.get(`/profile/completed-count/${restoId}`);
        if (res.data?.success && typeof res.data.completedCount === 'number') {
          finalCount = res.data.completedCount;
        }
      } catch (_) {}

      // 3. Fallback to /bookings/earnings if single endpoint is unreachable
      if (finalCount === null) {
        try {
          const earnRes = await api.get(`/bookings/earnings?providerId=${restoId}`);
          if (earnRes.data?.success && typeof earnRes.data.completedServicesCount === 'number') {
            finalCount = earnRes.data.completedServicesCount;
          }
        } catch (_) {}
      }

      if (finalCount !== null) {
        setCompletedOrdersCount(finalCount);
        await AsyncStorage.setItem(`cached_completed_orders_${restoId}`, String(finalCount));
      }
    } catch (e) {}
  }, [profile?._id, profile?.id, user?._id, user?.id]);

  // Initial fetch on mount
  useEffect(() => {
    fetchSupplierCompletedOrders(false);
  }, [fetchSupplierCompletedOrders]);

  // Background sync on screen focus without reloading or screen blink
  useFocusEffect(
    useCallback(() => {
      fetchSupplierCompletedOrders(true);
    }, [fetchSupplierCompletedOrders])
  );

  // ⚡ REAL-TIME: Socket.IO listener for live completed orders updates without reload
  useEffect(() => {
    if (!socket) return;

    const onRealtimeCompletedOrder = (data: any) => {
      const restoId = String(profile?._id || profile?.id || user?._id || user?.id || '');
      const eventResto = String(data?.restaurantId || data?.supplierId || data?.providerId || data?.booking?.restaurantId || '');

      // If store ID is specified in event, ensure it matches this store
      if (eventResto && restoId && eventResto !== restoId) {
        return;
      }

      console.log('⚡ [PROFILE SCREEN] Real-time order completed event received! Updating count with 0ms delay.');

      // 1. Instantly increment in UI & local cache (0ms immediate feedback!)
      setCompletedOrdersCount((prev) => {
        const updated = prev + 1;
        if (restoId) {
          AsyncStorage.setItem(`cached_completed_orders_${restoId}`, String(updated)).catch(() => {});
        }
        return updated;
      });

      // 2. Background sync authoritative count from backend
      fetchSupplierCompletedOrders(true);
    };

    socket.on('service_completed', onRealtimeCompletedOrder);
    socket.on('order_completed_count_updated', onRealtimeCompletedOrder);
    socket.on('earnings_updated', onRealtimeCompletedOrder);

    const onOrderStatusUpdate = (data: any) => {
      const st = String(data?.status || data?.booking?.status || '').toUpperCase();
      if (['COMPLETED', 'DELIVERED', 'SERVICE_COMPLETED'].includes(st)) {
        onRealtimeCompletedOrder(data);
      }
    };
    socket.on('order_status_updated', onOrderStatusUpdate);
    socket.on('booking_status_updated', onOrderStatusUpdate);

    return () => {
      socket.off('service_completed', onRealtimeCompletedOrder);
      socket.off('order_completed_count_updated', onRealtimeCompletedOrder);
      socket.off('earnings_updated', onRealtimeCompletedOrder);
      socket.off('order_status_updated', onOrderStatusUpdate);
      socket.off('booking_status_updated', onOrderStatusUpdate);
    };
  }, [socket, profile?._id, profile?.id, user?._id, user?.id, fetchSupplierCompletedOrders]);

  // ⚡ Live Socket listener for store showcase / animation changes (0ms live update without reload)
  useEffect(() => {
    if (!socket) return;

    const onShowcaseUpdate = (data: any) => {
      const currentRestoId = String(profile?._id || profile?.id || user?._id || user?.id || '');
      const eventSupplierId = String(data?.supplierId || data?.restaurantId || '');

      if (!currentRestoId || (eventSupplierId && eventSupplierId !== currentRestoId)) {
        return;
      }

      console.log('⚡ [PROFILE SCREEN] Real-time showcase animation update received via socket!');
      const newLottie = data?.supplierLottieAnimation || null;
      setProfile((prev: any) => ({
        ...(prev || {}),
        supplierLottieAnimation: newLottie,
      }));

      if (newLottie) {
        AsyncStorage.setItem('cached_supplier_lottie', JSON.stringify(newLottie)).catch(() => {});
        AsyncStorage.getItem('supplierUser').then((suppUserStr) => {
          if (suppUserStr) {
            const p = { ...JSON.parse(suppUserStr), supplierLottieAnimation: newLottie };
            AsyncStorage.setItem('supplierUser', JSON.stringify(p)).catch(() => {});
          }
        }).catch(() => {});
      } else {
        AsyncStorage.removeItem('cached_supplier_lottie').catch(() => {});
        AsyncStorage.getItem('supplierUser').then((suppUserStr) => {
          if (suppUserStr) {
            const p = { ...JSON.parse(suppUserStr), supplierLottieAnimation: null };
            AsyncStorage.setItem('supplierUser', JSON.stringify(p)).catch(() => {});
          }
        }).catch(() => {});
      }
    };

    socket.on('supplier_showcase_updated', onShowcaseUpdate);
    return () => {
      socket.off('supplier_showcase_updated', onShowcaseUpdate);
    };
  }, [socket, profile?._id, profile?.id, user?._id, user?.id]);

  // Fetch real categories from database for category editing
  useEffect(() => {
    const fetchCats = async () => {
      try {
        setLoadingCats(true);
        const res = await api.get('/categories');
        let list: any[] = [];
        if (res.data && Array.isArray(res.data.categories)) {
          list = res.data.categories;
        } else if (Array.isArray(res.data)) {
          list = res.data;
        }
        if (list.length > 0) {
          setDbCategories(list.filter((c: any) => c.isActive !== false));
        }
      } catch (e) {
      } finally {
        setLoadingCats(false);
      }
    };
    fetchCats();
  }, []);

  // Customer-specific states
  const [addressModalVisible, setAddressModalVisible] = useState(false);
  const [customerOrdersCount, setCustomerOrdersCount] = useState(0);
  const [customerCartCount, setCustomerCartCount] = useState(CartService.getCartCount());

  // Subscribe to CartService for customer
  useEffect(() => {
    const unsub = CartService.subscribe((cartState) => {
      setCustomerCartCount(cartState.count);
    });
    return unsub;
  }, []);

  // Fetch real customer orders count from backend
  useEffect(() => {
    const fetchStats = async () => {
      const uId = user?._id || user?.id;
      if (uId) {
        try {
          const res = await api.get(`/bookings/my-bookings?userId=${uId}&date=ALL`);
          if (res.data && Array.isArray(res.data.bookings)) {
            setCustomerOrdersCount(res.data.bookings.length);
          }
        } catch (e) {}
      }
    };
    fetchStats();
  }, [user]);

  const handleCustomerLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out of your account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await logout('CUSTOMER');
          navigation.reset({
            index: 0,
            routes: [{ name: 'RoleSelection' }],
          });
        },
      },
    ]);
  };

  // Edit Phone & OTP state
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [newPhoneInput, setNewPhoneInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    let interval: any = null;
    if (resendTimer > 0) {
      interval = setInterval(() => setResendTimer((prev) => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  const handleSendPhoneOtp = async () => {
    const clean = newPhoneInput.replace(/[^0-9]/g, '').slice(-10);
    if (!clean || clean.length !== 10) {
      Alert.alert('Invalid Number', 'Please enter a valid 10-digit mobile number.');
      return;
    }
    const currentClean = String(user?.phoneNumber || user?.phone || '').replace(/[^0-9]/g, '').slice(-10);
    if (clean === currentClean) {
      Alert.alert('Same Number', 'The new number cannot be the same as your current registered number.');
      return;
    }

    try {
      setOtpSending(true);
      const res = await api.post('/auth/send-otp', {
        phoneNumber: clean,
        purpose: 'update_phone',
        role: user?.role || 'customer',
      });

      if (res.data?.success) {
        setOtpSent(true);
        setResendTimer(45);
        Alert.alert('OTP Sent', `A 6-digit verification code has been sent to +91 ${clean}`);
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to send OTP.');
      }
    } catch (e: any) {
      const errMsg = e?.response?.data?.message || 'Failed to send OTP. Please check the number and try again.';
      Alert.alert('Notice', errMsg);
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyAndUpdatePhone = async () => {
    const cleanPhone = newPhoneInput.replace(/[^0-9]/g, '').slice(-10);
    const cleanOtp = otpInput.trim();

    if (!cleanPhone || cleanPhone.length !== 10) {
      Alert.alert('Invalid Number', 'Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!cleanOtp || cleanOtp.length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter the complete 6-digit OTP.');
      return;
    }

    const uId = user?._id || user?.id;
    if (!uId) {
      Alert.alert('Error', 'Session error. Please re-login.');
      return;
    }

    try {
      setOtpVerifying(true);
      const res = await api.post('/users/update-phone', {
        userId: uId,
        newPhone: cleanPhone,
        otp: cleanOtp,
      });

      if (res.data?.success) {
        const updatedUserData = {
          ...user,
          phoneNumber: cleanPhone,
          phone: cleanPhone,
          username: /^\d{10}$/.test(user?.username || '') ? cleanPhone : user?.username,
          isMobileVerified: true,
        };
        await updateUser(updatedUserData);
        if (res.data.user) {
          setProfile(res.data.user);
        }
        setShowPhoneModal(false);
        setNewPhoneInput('');
        setOtpInput('');
        setOtpSent(false);
        Alert.alert('Success', 'Your mobile number has been updated successfully!');
      } else {
        Alert.alert('Verification Failed', res.data?.message || 'Could not verify OTP.');
      }
    } catch (e: any) {
      const errMsg = e?.response?.data?.message || 'OTP verification failed. Please try again.';
      Alert.alert('Error', errMsg);
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleSaveCustomerName = async () => {
    try {
      setUploading(true);
      const trimmed = editNameText.trim();
      if (!trimmed) {
        Alert.alert('Error', 'Name cannot be empty.');
        return;
      }
      updateUser({ name: trimmed });
      try {
        await api.put('/users/me', { name: trimmed });
      } catch (err) {}
      setIsEditingName(false);
      Alert.alert('Success', 'Profile name updated successfully!');
    } catch (e) {
      Alert.alert('Error', 'Unable to save profile changes.');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchProfile();
    });
    fetchProfile();
    return unsubscribe;
  }, [navigation, user?._id]);

  const resolveUserId = async (): Promise<string> => {
    const paramId = (route as any)?.params?.restaurantId || (route as any)?.params?.id;
    if (paramId && paramId !== 'undefined' && paramId !== 'null') return String(paramId);
    if (user?._id || user?.id) return String(user._id || user.id);
    try {
      const suppUser = await AsyncStorage.getItem('supplierUser');
      if (suppUser) {
        const parsed = JSON.parse(suppUser);
        const pRole = String(parsed?.role || '').toLowerCase();
        if (['supplier', 'seller_partner', 'restaurant'].includes(pRole) && (parsed?._id || parsed?.id)) {
          return String(parsed._id || parsed.id);
        }
      }
    } catch (e) {}
    return '';
  };

  const fetchProfile = async () => {
    try {
      if (!profile && !user) setLoading(true);

      // 1. Authoritative: Fetch from /auth/partner-profile using supplierToken ONLY (never fallback to ambiguous userToken)
      const suppToken = await AsyncStorage.getItem('supplierToken');
      if (suppToken) {
        try {
          const res = await api.get('/auth/partner-profile', {
            headers: { Authorization: `Bearer ${suppToken}`, 'X-Role': 'supplier' }
          });
          if (res.data && res.data.success && (res.data.partner || res.data.user)) {
            const p = res.data.partner || res.data.user;
            const pRole = String(p.role || '').toLowerCase();
            if (!['supplier', 'seller_partner', 'restaurant'].includes(pRole)) {
              setLoading(false);
              return;
            }
            // Preserve supplierLottieAnimation ONLY for this exact supplier
            if (!p.supplierLottieAnimation) {
              const cachedLottieStr = await AsyncStorage.getItem(`cached_supplier_lottie_${p._id || p.id}`);
              if (cachedLottieStr) {
                p.supplierLottieAnimation = JSON.parse(cachedLottieStr);
              }
            } else {
              await AsyncStorage.setItem(`cached_supplier_lottie_${p._id || p.id}`, JSON.stringify(p.supplierLottieAnimation));
            }
            setProfile(p);
            setEditNameText(p.restaurantName || p.name || '');
            setEditBioText(p.bio || '');
            setEditLocationText(p.businessAddress || p.location || p.address || '');
            await AsyncStorage.setItem('supplierUser', JSON.stringify(p));
            setLoading(false);
            return;
          }
        } catch (e) {}
      }

      // 2. Fallback to /profile/:userId with strict role check
      const userId = await resolveUserId();
      if (!userId) return;

      const res = await api.get(`/profile/${userId}?role=supplier`);
      if (res.data && res.data.success && res.data.profile) {
        const prof = res.data.profile;
        const profRole = String(prof.role || '').toLowerCase();
        if (!['supplier', 'seller_partner', 'restaurant'].includes(profRole)) {
          return;
        }
        if (!prof.supplierLottieAnimation) {
          const cachedLottieStr = await AsyncStorage.getItem(`cached_supplier_lottie_${prof._id || prof.id}`);
          if (cachedLottieStr) {
            prof.supplierLottieAnimation = JSON.parse(cachedLottieStr);
          }
        } else {
          await AsyncStorage.setItem(`cached_supplier_lottie_${prof._id || prof.id}`, JSON.stringify(prof.supplierLottieAnimation));
        }
        setProfile(prof);
        setEditNameText(prof.restaurantName || prof.name || '');
        setEditBioText(prof.bio || '');
        setEditLocationText(prof.businessAddress || prof.location || prof.address || '');
        await AsyncStorage.setItem('supplierUser', JSON.stringify(prof));
      }
    } catch (error) {
      console.log('[PROFILE FETCH NOTICE]', error);
    } finally {
      setLoading(false);
    }
  };

  const saveProfileUpdates = async (updates: any) => {
    try {
      const userId = await resolveUserId();
      if (!userId) {
        Alert.alert('Error', 'User ID could not be identified. Please try again.');
        return;
      }

      // 1. Instant Socket broadcast for name updates
      if (updates.name && socket) {
        console.log('📢 [PROFILE SCREEN] Emitting update_restaurant_name on socket:', userId, updates.name);
        socket.emit('update_restaurant_name', {
          restaurantId: userId,
          name: updates.name,
          restaurantName: updates.name,
        });
      }

      // 2. Local state and storage sync
      updateUser(updates);
      setProfile((prev: any) => ({ ...(prev || {}), ...updates }));

      try {
        const suppUser = await AsyncStorage.getItem('supplierUser');
        if (suppUser) {
          const parsedSupp = JSON.parse(suppUser);
          if (String(parsedSupp?._id || parsedSupp?.id) === String(userId)) {
            const p = { ...parsedSupp, ...updates };
            await AsyncStorage.setItem('supplierUser', JSON.stringify(p));
          }
        }
      } catch (e) {}

      // 3. API PUT to backend
      const payload = {
        ...updates,
        ...(updates.name ? { restaurantName: updates.name } : {}),
      };
      console.log('[PROFILE UPDATE] Saving updates for user:', userId, payload);
      const res = await api.put(`/profile/${userId}`, payload);
      if (res && res.data && res.data.profile) {
        setProfile(res.data.profile);
      } else if (res && res.data && res.data.user) {
        setProfile(res.data.user);
      }
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (error) {
      console.log('[PROFILE UPDATE ERROR]', error);
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    }
  };

  const handleSaveName = () => {
    setIsEditingName(false);
    const clean = (editNameText || '').trim();
    if (clean && clean !== (profile?.name || '')) {
      saveProfileUpdates({ name: clean });
    }
  };

  const handleSaveBio = () => {
    setIsEditingBio(false);
    const clean = (editBioText || '').trim();
    if (clean !== (profile?.bio || '')) {
      saveProfileUpdates({ bio: clean });
    }
  };

  const handleSaveLocation = () => {
    setIsEditingLocation(false);
    const clean = (editLocationText || '').trim();
    if (clean !== (profile?.location || '')) {
      saveProfileUpdates({ location: clean });
    }
  };

  const fetchCurrentLocation = async () => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Permission Denied', `Location permission is required to detect ${isRestaurant ? 'restaurant' : 'store'} address.`);
          return;
        }
      }

      setUploading(true);
      if (!Geolocation || typeof Geolocation.getCurrentPosition !== 'function') {
        setUploading(false);
        Alert.alert('Notice', `Please type your ${isRestaurant ? 'restaurant' : 'store'} address manually.`);
        return;
      }

      Geolocation.getCurrentPosition(
        async (position) => {
          try {
            if (!position || !position.coords) {
              setUploading(false);
              return;
            }
            const { latitude, longitude } = position.coords;
            const latStr = typeof latitude === 'number' && !isNaN(latitude) ? latitude.toFixed(4) : '';
            const lonStr = typeof longitude === 'number' && !isNaN(longitude) ? longitude.toFixed(4) : '';
            let fetchedAddr = latStr && lonStr ? `Lat: ${latStr}, Lon: ${lonStr}` : 'Current Location';

            try {
              if (latStr && lonStr) {
                const res = await fetch(
                  `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
                  {
                    headers: { 'User-Agent': 'RideHubApp/1.0' },
                  }
                );
                const data = await res.json();
                if (data && data.display_name) {
                  const addr = data.address || {};
                  const area =
                    addr.suburb ||
                    addr.neighbourhood ||
                    addr.road ||
                    addr.village ||
                    addr.town ||
                    addr.city_district ||
                    (data.display_name ? data.display_name.split(',')[0] : '');
                  const city = addr.city || addr.state_district || addr.state || '';
                  const cleanAddress = area ? `${area}${city && city !== area ? ', ' + city : ''}` : data.display_name;
                  if (cleanAddress) fetchedAddr = cleanAddress;
                }
              }
            } catch (geoErr) {
              console.log('[REVERSE GEOCODE NOTICE]', geoErr);
            }

            setEditLocationText(fetchedAddr);

            // Validate against 0,0 or invalid coordinates
            if (latitude === 0 && longitude === 0) {
              setUploading(false);
              Alert.alert('Location Notice', 'Your current location could not be fetched. Please refresh location.');
              return;
            }

            // Check if supplier is within applicable service area
            try {
              const zoneRes = await api.post('/zones/check-customer-serviceable', {
                latitude,
                longitude,
              });
              if (zoneRes.data && zoneRes.data.serviceable === false) {
                Alert.alert(
                  'Service Area Alert',
                  'Service is not available at your current location. You are outside your service area.',
                  [{ text: 'OK' }]
                );
              }
            } catch (zErr) {}

            await saveProfileUpdates({ 
              location: fetchedAddr,
              latitude: latitude,
              longitude: longitude,
              currentDeviceLocation: {
                latitude: latitude,
                longitude: longitude,
                address: fetchedAddr,
                timestamp: new Date().toISOString(),
              },
              businessLocation: profile?.businessLocation || profile?.location || fetchedAddr,
              liveLocation: { type: 'Point', coordinates: [longitude, latitude] },
              coordinates: { lat: latitude, lng: longitude }
            });
            setUploading(false);
            Alert.alert('Location Updated', `${isRestaurant ? 'Restaurant' : 'Store'} address updated from current GPS location!`);
          } catch (innerErr) {
            setUploading(false);
          }
        },
        (error) => {
          console.warn('[LOCATION ERROR]', error);
          setUploading(false);
          Alert.alert('Location Notice', 'Unable to detect GPS position. Please enter address manually.');
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    } catch (e) {
      setUploading(false);
    }
  };

  // Image Upload Handler
  const uploadFile = async (asset: any) => {
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('photo', {
        uri: asset.uri,
        name: asset.fileName || (isRestaurant ? 'restaurant_photo.jpg' : 'store_photo.jpg'),
        type: asset.type || 'image/jpeg',
      } as any);

      const token =
        (await AsyncStorage.getItem('supplierToken')) ||
        (await AsyncStorage.getItem('userToken'));

      const res = await api.post('/profile/upload-photo', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`,
          'X-Role': 'supplier',
        },
      });

      if (res.data && res.data.success) {
        return res.data.photoUrl;
      }
      return null;
    } catch (error: any) {
      console.error('[IMAGE UPLOAD ERROR]', error);
      Alert.alert('Upload Failed', 'Could not upload image.');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSelectProfilePicture = () => {
    Alert.alert(isRestaurant ? 'Restaurant Profile Photo' : `${terminology?.storeTypeLabel || 'Store'} Profile Photo`, 'Choose an option to update your photo:', [
      {
        text: '📷 Take Camera Photo',
        onPress: () => {
          ImagePicker.launchCamera(
            { mediaType: 'photo', quality: 0.7, maxWidth: 600, maxHeight: 600 },
            async (response) => {
              if (response.didCancel || !response.assets || response.assets.length === 0) return;
              const photoUrl = await uploadFile(response.assets[0]);
              if (photoUrl) {
                await saveProfileUpdates({
                  profilePicture: photoUrl,
                  coverImage: photoUrl,
                  image: photoUrl,
                  photos: [photoUrl],
                  supplierPhotos: [photoUrl],
                });
                await fetchProfile();
              }
            }
          );
        },
      },
      {
        text: '🖼️ Choose from Gallery',
        onPress: () => {
          ImagePicker.launchImageLibrary(
            { mediaType: 'photo', quality: 0.7, selectionLimit: 1, maxWidth: 600, maxHeight: 600 },
            async (response) => {
              if (response.didCancel || !response.assets || response.assets.length === 0) return;
              const photoUrl = await uploadFile(response.assets[0]);
              if (photoUrl) {
                await saveProfileUpdates({
                  profilePicture: photoUrl,
                  coverImage: photoUrl,
                  image: photoUrl,
                  photos: [photoUrl],
                  supplierPhotos: [photoUrl],
                });
                await fetchProfile();
              }
            }
          );
        },
      },
      {
        text: '🗑️ Remove Photo',
        style: 'destructive',
        onPress: async () => {
          setUploading(true);
          try {
            await saveProfileUpdates({
              profilePicture: '',
              coverImage: '',
              image: '',
              photos: [],
              supplierPhotos: [],
            });
            setProfile((prev: any) => ({
              ...(prev || {}),
              profilePicture: '',
              coverImage: '',
              image: '',
              photos: [],
              supplierPhotos: [],
            }));
            try {
              const suppUser = await AsyncStorage.getItem('supplierUser');
              if (suppUser) {
                const parsedSupp = JSON.parse(suppUser);
                if (String(parsedSupp?._id || parsedSupp?.id) === String(user?._id || user?.id)) {
                  const p = { ...parsedSupp, profilePicture: '', coverImage: '', image: '', photos: [], supplierPhotos: [] };
                  await AsyncStorage.setItem('supplierUser', JSON.stringify(p));
                }
              }
            } catch (storageErr) {}
            await fetchProfile();
          } finally {
            setUploading(false);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleLogoutPress = () => {
    Alert.alert('Log Out', `Are you sure you want to log out from your ${isRestaurant ? 'restaurant' : terminology?.storeTypeLabel?.toLowerCase() || 'store'} account?`, [
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
          await logout('SUPPLIER');
          navigation.reset({
            index: 0,
            routes: [{ name: 'RoleSelection' }],
          });
        },
      },
    ]);
  };

  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Build Image List for Carousel (profilePicture + photos array)
  const imageList: string[] = [];
  if (profile?.profilePicture && typeof profile.profilePicture === 'string' && profile.profilePicture.trim()) {
    const pPic = profile.profilePicture.trim();
    if (!pPic.startsWith('data:image')) {
      const formattedUrl = pPic.startsWith('http')
        ? pPic
        : `${UPLOADS_URL}${pPic.replace('/uploads', '')}`;
      imageList.push(formattedUrl);
    }
  }
  if (profile?.photos && Array.isArray(profile.photos)) {
    profile.photos.forEach((ph: string) => {
      if (ph && typeof ph === 'string' && ph.trim() && !ph.startsWith('data:image')) {
        const cleanPh = ph.trim();
        const formattedUrl = cleanPh.startsWith('http')
          ? cleanPh
          : `${UPLOADS_URL}${cleanPh.replace('/uploads', '')}`;
        if (!imageList.includes(formattedUrl)) {
          imageList.push(formattedUrl);
        }
      }
    });
  }
  if (profile?.supplierPhotos && Array.isArray(profile.supplierPhotos)) {
    profile.supplierPhotos.forEach((ph: string) => {
      if (ph && typeof ph === 'string' && ph.trim() && !ph.startsWith('data:image')) {
        const cleanPh = ph.trim();
        const formattedUrl = cleanPh.startsWith('http')
          ? cleanPh
          : `${UPLOADS_URL}${cleanPh.replace('/uploads', '')}`;
        if (!imageList.includes(formattedUrl)) {
          imageList.push(formattedUrl);
        }
      }
    });
  }

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + imageList.length) % imageList.length);
  };

  const handleNextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % imageList.length);
  };

  if (!isSupplier) {
    const customerName = (user?.name || user?.username || profile?.name || 'Customer').trim();
    const customerPhone = user?.phoneNumber || user?.phone || profile?.phoneNumber || 'Not Provided';
    const customerEmail = user?.email || profile?.email || 'customer@example.com';
    const rawPic = user?.profilePicture || profile?.profilePicture;
    const avatarUri = rawPic
      ? rawPic.startsWith('http') || rawPic.startsWith('data:')
        ? rawPic
        : `${UPLOADS_URL}${rawPic.replace('/uploads', '')}`
      : null;

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#F8FAFC' }]} edges={['top']}>
        <StatusBar hidden={false} barStyle="light-content" backgroundColor="#0066FF" />

        {uploading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.loadingOverlayText}>Updating Profile...</Text>
          </View>
        )}

        {/* Address Selection Modal */}
        <AddressSelectionModal
          visible={addressModalVisible}
          onClose={() => setAddressModalVisible(false)}
          onSelectAddress={() => {
            setAddressModalVisible(false);
            Alert.alert('Address Saved', 'Default delivery address selected!');
          }}
        />

        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          {/* Header */}
          <View style={customerStyles.header}>
            <View style={customerStyles.headerNavRow}>
              <TouchableOpacity style={customerStyles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
                <Text style={customerStyles.backBtnText}>‹ Back</Text>
              </TouchableOpacity>
              <Text style={customerStyles.headerTitle}>My Profile</Text>
              <View style={{ width: 45 }} />
            </View>

            {/* Profile Avatar Card */}
            <View style={customerStyles.avatarCard}>
              <View style={customerStyles.avatarWrap}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={customerStyles.avatarImg} />
                ) : (
                  <View style={customerStyles.avatarPlaceholder}>
                    <Text style={{ fontSize: 36 }}>👤</Text>
                  </View>
                )}
                <TouchableOpacity style={customerStyles.avatarCameraBtn} onPress={handleSelectProfilePicture} activeOpacity={0.85}>
                  <Text style={{ fontSize: 13 }}>📷</Text>
                </TouchableOpacity>
              </View>

              {isEditingName ? (
                <View style={customerStyles.editNameWrap}>
                  <TextInput
                    style={customerStyles.nameInput}
                    value={editNameText}
                    onChangeText={setEditNameText}
                    placeholder="Enter Full Name"
                    placeholderTextColor="#94A3B8"
                  />
                  <TouchableOpacity style={customerStyles.saveNameBtn} onPress={handleSaveCustomerName}>
                    <Text style={customerStyles.saveNameBtnText}>Save</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={customerStyles.nameRow}>
                  <Text style={customerStyles.customerNameText}>{customerName}</Text>
                  <TouchableOpacity onPress={() => { setEditNameText(customerName); setIsEditingName(true); }}>
                    <Text style={{ fontSize: 16 }}>✏️</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={customerStyles.badgeRow}>
                <View style={customerStyles.verifiedBadge}>
                  <Text style={customerStyles.verifiedBadgeText}>✓ VERIFIED CUSTOMER</Text>
                </View>
                <View style={customerStyles.roleBadge}>
                  <Text style={customerStyles.roleBadgeText}>⚡ VERIFIED MEMBER</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Account Details Card */}
          <View style={customerStyles.detailsCard}>
            <Text style={customerStyles.cardSectionHeader}>Customer Account Details</Text>

            <View style={customerStyles.infoRow}>
              <View style={customerStyles.infoIconBox}>
                <Text style={{ fontSize: 18 }}>📱</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={customerStyles.infoLabel}>Mobile Number</Text>
                <Text style={customerStyles.infoValue}>+91 {customerPhone}</Text>
              </View>
              <TouchableOpacity
                style={customerStyles.editPhoneBtn}
                onPress={() => {
                  setNewPhoneInput('');
                  setOtpInput('');
                  setOtpSent(false);
                  setShowPhoneModal(true);
                }}
                activeOpacity={0.8}
              >
                <Text style={customerStyles.editPhoneBtnText}>✏️ Edit</Text>
              </TouchableOpacity>
            </View>

            <View style={customerStyles.infoRow}>
              <View style={customerStyles.infoIconBox}>
                <Text style={{ fontSize: 18 }}>✉️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={customerStyles.infoLabel}>Email Address</Text>
                <Text style={customerStyles.infoValue}>{customerEmail}</Text>
              </View>
            </View>
          </View>

          {/* Activity Stats Strip */}
          <View style={customerStyles.statsCard}>
            <TouchableOpacity
              style={customerStyles.statItem}
              onPress={() => navigation.navigate('MyBookingsScreen')}
              activeOpacity={0.8}
            >
              <Text style={customerStyles.statNumber}>{customerOrdersCount}</Text>
              <Text style={customerStyles.statLabel}>Orders Placed</Text>
            </TouchableOpacity>

            <View style={customerStyles.statDivider} />

            <TouchableOpacity
              style={customerStyles.statItem}
              onPress={() => navigation.navigate('CartScreen')}
              activeOpacity={0.8}
            >
              <Text style={customerStyles.statNumber}>{customerCartCount}</Text>
              <Text style={customerStyles.statLabel}>Items in Cart</Text>
            </TouchableOpacity>
          </View>

          {/* Navigation Shortcuts */}
          <View style={customerStyles.menuCard}>
            <Text style={customerStyles.cardSectionHeader}>Quick Shortcuts</Text>

            <TouchableOpacity
              style={customerStyles.menuRow}
              onPress={() => navigation.navigate('MyBookingsScreen')}
              activeOpacity={0.7}
            >
              <View style={[customerStyles.menuIconWrap, { backgroundColor: '#EFF6FF' }]}>
                <Text style={{ fontSize: 18 }}>📑</Text>
              </View>
              <Text style={customerStyles.menuRowText}>My Orders</Text>
              <Text style={customerStyles.menuChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={customerStyles.menuRow}
              onPress={() => navigation.navigate('CartScreen')}
              activeOpacity={0.7}
            >
              <View style={[customerStyles.menuIconWrap, { backgroundColor: '#EFF6FF' }]}>
                <Text style={{ fontSize: 18 }}>🛒</Text>
              </View>
              <Text style={customerStyles.menuRowText}>My Cart ({customerCartCount})</Text>
              <Text style={customerStyles.menuChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={customerStyles.menuRow}
              onPress={() => setAddressModalVisible(true)}
              activeOpacity={0.7}
            >
              <View style={[customerStyles.menuIconWrap, { backgroundColor: '#EFF6FF' }]}>
                <Text style={{ fontSize: 18 }}>📍</Text>
              </View>
              <Text style={customerStyles.menuRowText}>Saved Delivery Addresses</Text>
              <Text style={customerStyles.menuChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={customerStyles.menuRow}
              onPress={() => navigation.navigate('Notifications')}
              activeOpacity={0.7}
            >
              <View style={[customerStyles.menuIconWrap, { backgroundColor: '#EFF6FF' }]}>
                <Text style={{ fontSize: 18 }}>🔔</Text>
              </View>
              <Text style={customerStyles.menuRowText}>Notifications</Text>
              <Text style={customerStyles.menuChevron}>›</Text>
            </TouchableOpacity>

            {/* Language Selection */}
            <TouchableOpacity
              style={customerStyles.menuRow}
              onPress={() => setShowLangModal(true)}
              activeOpacity={0.7}
            >
              <View style={[customerStyles.menuIconWrap, { backgroundColor: '#EFF6FF' }]}>
                <Text style={{ fontSize: 18 }}>🌐</Text>
              </View>
              <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={customerStyles.menuRowText}>{t('common.change_language', 'Change Language')}</Text>
                <Text style={{ fontSize: 13, color: '#0066FF', fontWeight: '700', marginRight: 8 }}>
                  {language === 'hi' ? 'हिन्दी 🇮🇳' : 'English 🇬🇧'}
                </Text>
              </View>
              <Text style={customerStyles.menuChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={customerStyles.menuRow}
              onPress={() => navigation.navigate('HelpCenter')}
              activeOpacity={0.7}
            >
              <View style={[customerStyles.menuIconWrap, { backgroundColor: '#EFF6FF' }]}>
                <Text style={{ fontSize: 18 }}>🎧</Text>
              </View>
              <Text style={customerStyles.menuRowText}>Help & Support</Text>
              <Text style={customerStyles.menuChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[customerStyles.menuRow, { borderBottomWidth: 0 }]}
              onPress={() => navigation.navigate('CommunityGuidelines')}
              activeOpacity={0.7}
            >
              <View style={[customerStyles.menuIconWrap, { backgroundColor: '#EFF6FF' }]}>
                <Text style={{ fontSize: 18 }}>📜</Text>
              </View>
              <Text style={customerStyles.menuRowText}>Community Guidelines</Text>
              <Text style={customerStyles.menuChevron}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Log Out Button */}
          <TouchableOpacity
            style={customerStyles.logoutBtn}
            onPress={handleCustomerLogout}
            activeOpacity={0.8}
          >
            <Text style={customerStyles.logoutBtnText}>🚪 Log Out</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Edit Phone Number with Real Backend OTP Modal */}
        <Modal
          visible={showPhoneModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowPhoneModal(false)}
        >
          <View style={customerStyles.modalOverlay}>
            <View style={customerStyles.modalCard}>
              <View style={customerStyles.modalHeaderRow}>
                <Text style={customerStyles.modalTitle}>📱 Update Mobile Number</Text>
                <TouchableOpacity onPress={() => setShowPhoneModal(false)}>
                  <Text style={customerStyles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={customerStyles.modalSubText}>
                Enter your new 10-digit mobile number. We will send a real verification code (OTP).
              </Text>

              {/* Current Number */}
              <View style={customerStyles.modalCurrentBox}>
                <Text style={customerStyles.modalCurrentLabel}>Current Registered Number</Text>
                <Text style={customerStyles.modalCurrentValue}>+91 {customerPhone}</Text>
              </View>

              {/* New Number Input */}
              <Text style={customerStyles.modalInputLabel}>New Mobile Number</Text>
              <View style={customerStyles.modalPhoneInputRow}>
                <Text style={customerStyles.modalPrefix}>+91</Text>
                <TextInput
                  style={customerStyles.modalPhoneInput}
                  value={newPhoneInput}
                  onChangeText={(val) => {
                    setNewPhoneInput(val);
                    if (otpSent) setOtpSent(false);
                  }}
                  placeholder="Enter 10-digit number"
                  placeholderTextColor="#94A3B8"
                  keyboardType="phone-pad"
                  maxLength={10}
                  editable={!otpSending && !otpVerifying}
                />
              </View>

              {!otpSent ? (
                <TouchableOpacity
                  style={[
                    customerStyles.modalPrimaryBtn,
                    (newPhoneInput.replace(/[^0-9]/g, '').length !== 10 || otpSending) && customerStyles.modalBtnDisabled,
                  ]}
                  onPress={handleSendPhoneOtp}
                  disabled={newPhoneInput.replace(/[^0-9]/g, '').length !== 10 || otpSending}
                  activeOpacity={0.8}
                >
                  {otpSending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={customerStyles.modalPrimaryBtnText}>Send Verification OTP →</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <View style={{ marginTop: 12 }}>
                  <Text style={customerStyles.modalInputLabel}>Enter 6-Digit OTP</Text>
                  <TextInput
                    style={customerStyles.modalOtpInput}
                    value={otpInput}
                    onChangeText={setOtpInput}
                    placeholder="• • • • • •"
                    placeholderTextColor="#94A3B8"
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={!otpVerifying}
                  />

                  <TouchableOpacity
                    style={[
                      customerStyles.modalPrimaryBtn,
                      (otpInput.trim().length !== 6 || otpVerifying) && customerStyles.modalBtnDisabled,
                    ]}
                    onPress={handleVerifyAndUpdatePhone}
                    disabled={otpInput.trim().length !== 6 || otpVerifying}
                    activeOpacity={0.8}
                  >
                    {otpVerifying ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={customerStyles.modalPrimaryBtnText}>✓ Verify & Update Number</Text>
                    )}
                  </TouchableOpacity>

                  {/* Resend OTP Row */}
                  <View style={customerStyles.resendRow}>
                    {resendTimer > 0 ? (
                      <Text style={customerStyles.resendTimerText}>Resend OTP in {resendTimer}s</Text>
                    ) : (
                      <TouchableOpacity onPress={handleSendPhoneOtp} disabled={otpSending}>
                        <Text style={customerStyles.resendActiveText}>Resend OTP</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }
 
  if (loading && !profile && !user) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator size="large" color="#0066FF" />
        <Text style={styles.loadingSubText}>{isRestaurant ? 'Loading Restaurant Profile...' : `Loading ${terminology?.storeTypeLabel || 'Store'} Profile...`}</Text>
      </SafeAreaView>
    );
  }

  const isOnline = Boolean(profile?.isOnline ?? user?.isOnline ?? true);
  const restaurantName = profile?.restaurantName || profile?.name || user?.restaurantName || user?.name || 'Restaurant Partner';
  const phoneNumber = profile?.phoneNumber || profile?.phone || user?.phoneNumber || user?.phone || 'Not Provided';
  const locationText = profile?.businessAddress || profile?.location || profile?.address || profile?.fullAddress || user?.businessAddress || user?.location || (isRestaurant ? 'Add Restaurant Location' : 'Add Store Location');

  const activeImgUri = imageList[currentImageIndex] || imageList[0];

  return (
    <SafeAreaView style={[styles.container, isDark && { backgroundColor: '#0B0F19' }]} edges={['top']}>
      <StatusBar hidden={false} barStyle="light-content" backgroundColor={isDark ? '#0F172A' : '#0066FF'} />

      {uploading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.loadingOverlayText}>Updating Location / Photo...</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        {/* ============================================================ */}
        {/* 1. HERO HEADER SECTION */}
        {/* ============================================================ */}
        <View style={[styles.heroHeader, isDark && { backgroundColor: '#0F172A' }]}>
          <View style={styles.heroNavRow}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.backBtnText}>‹ Back</Text>
            </TouchableOpacity>
            <Text style={styles.heroNavTitle}>{isRestaurant ? 'Restaurant Profile' : `${terminology.storeTypeLabel} Profile`}</Text>
            <TouchableOpacity style={styles.editHeaderBtn} onPress={() => setIsEditingName(true)}>
              <Text style={styles.editHeaderBtnText}>Edit ✏️</Text>
            </TouchableOpacity>
          </View>

          {/* LARGE 4-ANGLE RESTAURANT IMAGE CAROUSEL CARD */}
          <View style={[styles.largeCardWrap, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}>
            {activeImgUri ? (
              <Image
                source={{ uri: activeImgUri }}
                style={styles.largeCardImg}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.largeCardImg, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ fontSize: 44 }}>🏪</Text>
                <Text style={{ fontSize: 14, color: isDark ? '#94A3B8' : '#64748B', fontWeight: '700', marginTop: 8 }}>
                  No Store Photo
                </Text>
                <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
                  Tap the camera badge below to add
                </Text>
              </View>
            )}

            {/* Left Arrow Button */}
            {imageList.length > 1 && (
              <TouchableOpacity style={styles.leftArrowBtn} onPress={handlePrevImage} activeOpacity={0.8}>
                <Text style={styles.arrowIconText}>‹</Text>
              </TouchableOpacity>
            )}

            {/* Right Arrow Button */}
            {imageList.length > 1 && (
              <TouchableOpacity style={styles.rightArrowBtn} onPress={handleNextImage} activeOpacity={0.8}>
                <Text style={styles.arrowIconText}>›</Text>
              </TouchableOpacity>
            )}

            {/* Image Counter Badge */}
            {imageList.length > 1 && (
              <View style={styles.imageCounterBadge}>
                <Text style={styles.imageCounterText}>
                  {currentImageIndex + 1} / {imageList.length}
                </Text>
              </View>
            )}

            {/* Camera Upload Button */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.cameraBadgeBtn}
              onPress={handleSelectProfilePicture}
            >
              <Text style={styles.cameraBadgeText}>📷 Add / Change Photo</Text>
            </TouchableOpacity>
          </View>

          {/* RESTAURANT NAME EDIT SECTION */}
          {isEditingName ? (
            <View style={[styles.nameEditBox, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}>
              <TextInput
                style={[styles.nameInput, isDark && { backgroundColor: '#0F172A', color: '#F8FAFC', borderColor: '#334155' }]}
                value={editNameText}
                onChangeText={setEditNameText}
                placeholder={isRestaurant ? 'Enter Restaurant Name' : 'Enter Store Name'}
                placeholderTextColor="#94A3B8"
                autoFocus
              />
              <View style={styles.editActionRow}>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveName}>
                  <Text style={styles.saveBtnText}>Save ✓</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => {
                    setIsEditingName(false);
                    setEditNameText(restaurantName);
                  }}
                >
                  <Text style={styles.cancelBtnText}>Cancel ✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.nameDisplayRow}>
              <Text style={styles.restaurantNameText}>{restaurantName}</Text>
            </View>
          )}

          <View style={styles.verifiedBadgeRow}>
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedBadgeText}>✓ VERIFIED PARTNER</Text>
            </View>
            <View style={styles.roleTag}>
              <Text style={styles.roleTagText}>{terminology.menuNavIcon} {isRestaurant ? 'RESTAURANT' : terminology.storeTypeLabel.toUpperCase()}</Text>
            </View>
          </View>
          {/* PROMINENT STORE VIDEO JSON & SHOWCASE SHORTCUTS */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <TouchableOpacity
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#7C3AED',
                paddingVertical: 11,
                paddingHorizontal: 10,
                borderRadius: 12,
                elevation: 3,
              }}
              onPress={() => { setSelectedJsonFile(null); setLottieInputMode('file'); setLottieModalVisible(true); }}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 16, marginRight: 6 }}>🎬</Text>
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>
                Store Video JSON
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#2563EB',
                paddingVertical: 11,
                paddingHorizontal: 10,
                borderRadius: 12,
                elevation: 3,
              }}
              onPress={handleStartConfirmPermanentLocation}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 16, marginRight: 6 }}>📍</Text>
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>
                Lock Store GPS
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ============================================================ */}
        {/* 2. REAL STATS CARDS (STATUS, COMPLETED ORDERS, CATEGORY) */}
        {/* ============================================================ */}
        <View style={styles.statsRow}>
          {/* Active / Inactive Status */}
          <View style={[styles.statCard, isDark && { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <View
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 4.5,
                  backgroundColor: isOnline ? '#10B981' : '#EF4444',
                  marginRight: 6,
                }}
              />
              <Text
                style={[
                  styles.statVal,
                  { color: isOnline ? '#10B981' : '#EF4444', fontSize: 15, fontWeight: '800' },
                ]}
              >
                {isOnline ? 'Active' : 'Inactive'}
              </Text>
            </View>
            <Text style={[styles.statLabel, isDark && { color: '#94A3B8' }]}>Store Status</Text>
          </View>

          {/* Completed Orders strictly isolated to this store (Real-time live updates without reload) */}
          <TouchableOpacity
            style={[styles.statCard, isDark && { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1 }]}
            activeOpacity={0.8}
            onPress={() => {
              try { navigation.navigate('Earnings'); } catch (_) {}
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
              <PngIcon name="checkmark-done" size={20} color="#0066FF" />
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#22C55E' }} />
            </View>
            <Text style={[styles.statVal, isDark && { color: '#38BDF8' }]}>{completedOrdersCount}</Text>
            <Text style={[styles.statLabel, isDark && { color: '#94A3B8' }]}>Completed Orders</Text>
          </TouchableOpacity>

          {/* Store Category (No Earnings here; strictly in Wallet/Earnings screen) */}
          <View style={[styles.statCard, isDark && { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1 }]}>
            <PngIcon name="pricetag" size={20} color="#F59E0B" style={{ marginBottom: 4 }} />
            <Text style={[styles.statVal, { fontSize: 13 }, isDark && { color: '#F8FAFC' }]} numberOfLines={1}>
              {profile?.categoryName || user?.categoryName || 'General'}
            </Text>
            <Text style={[styles.statLabel, isDark && { color: '#94A3B8' }]}>Category</Text>
          </View>
        </View>

        {/* ============================================================ */}
        {/* 3. RESTAURANT DETAILS CARD */}
        {/* ============================================================ */}
        <View style={[styles.infoCard, isDark && { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1 }]}>
          <Text style={[styles.cardHeaderTitle, isDark && { color: '#F8FAFC' }]}>{terminology.menuNavIcon} {isRestaurant ? 'Restaurant Details' : `${terminology.storeTypeLabel} Details`}</Text>

          {/* Restaurant / Store Name Item */}
          <View style={[styles.infoItemRow, isDark && { borderBottomColor: '#334155' }]}>
            <View style={[styles.infoIconBox, isDark && { backgroundColor: '#0F172A' }]}>
              <PngIcon name="business" size={18} color="#0066FF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoItemLabel, isDark && { color: '#94A3B8' }]}>{isRestaurant ? 'Restaurant Name' : 'Store Name'}</Text>
              <Text style={[styles.infoItemVal, isDark && { color: '#F8FAFC' }]}>{restaurantName}</Text>
            </View>
          </View>

          {/* Phone Number */}
          <View style={[styles.infoItemRow, isDark && { borderBottomColor: '#334155' }]}>
            <View style={[styles.infoIconBox, isDark && { backgroundColor: '#0F172A' }]}>
              <PngIcon name="call" size={18} color="#0066FF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoItemLabel, isDark && { color: '#94A3B8' }]}>Contact Number</Text>
              <Text style={[styles.infoItemVal, isDark && { color: '#F8FAFC' }]}>{phoneNumber}</Text>
            </View>
          </View>

          {/* Location / Address with GPS Auto-Fetch */}
          <View style={[styles.infoItemRow, isDark && { borderBottomColor: '#334155' }]}>
            <View style={[styles.infoIconBox, isDark && { backgroundColor: '#0F172A' }]}>
              <PngIcon name="location" size={18} color="#0066FF" />
            </View>
            <View style={{ flex: 1 }}>
              {isEditingLocation ? (
                <View style={{ marginTop: 4 }}>
                  <TextInput
                    style={[styles.locationInput, isDark && { backgroundColor: '#0F172A', color: '#F8FAFC', borderColor: '#334155' }]}
                    value={editLocationText}
                    onChangeText={setEditLocationText}
                    placeholder={isRestaurant ? 'Enter Restaurant Address' : 'Enter Store Address'}
                    placeholderTextColor="#94A3B8"
                  />
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                    <TouchableOpacity style={styles.smallSaveBtn} onPress={handleSaveLocation}>
                      <Text style={styles.smallSaveBtnText}>Save Address</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.gpsFetchBtn} onPress={fetchCurrentLocation}>
                      <Text style={styles.gpsFetchBtnText}>🎯 Use GPS</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <Text style={[styles.infoItemLabel, isDark && { color: '#94A3B8' }]}>{isRestaurant ? 'Restaurant Address' : 'Store Address'}</Text>
                  <Text style={[styles.infoItemVal, isDark && { color: '#F8FAFC' }]}>{locationText}</Text>
                  <TouchableOpacity style={styles.gpsFetchBtnInline} onPress={fetchCurrentLocation}>
                    <Text style={styles.gpsFetchBtnTextInline}>🎯 Fetch Current GPS Location</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
            {!isEditingLocation && (
              <TouchableOpacity onPress={() => setIsEditingLocation(true)}>
                <Text style={styles.itemEditBtn}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Store Category with Edit Option */}
          <View style={[styles.infoItemRow, { borderBottomWidth: 0 }]}>
            <View style={[styles.infoIconBox, isDark && { backgroundColor: '#0F172A' }]}>
              <PngIcon name="pricetag" size={18} color="#0066FF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoItemLabel, isDark && { color: '#94A3B8' }]}>Store Category</Text>
              <Text style={[styles.infoItemVal, isDark && { color: '#F8FAFC' }]}>
                {profile?.categoryName || user?.categoryName || (isRestaurant ? 'Food & Restaurant' : 'General Store')}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowCategoryModal(true)}>
              <Text style={styles.itemEditBtn}>Edit</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ============================================================ */}
        {/* 3A. SPEC PART 9: STORE VIDEO JSON (LOTTIE ANIMATION) CARD */}
        {/* ============================================================ */}
        <View style={[styles.infoCard, isDark && { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 20 }}>🎬</Text>
              <Text style={[styles.cardHeaderTitle, isDark && { color: '#F8FAFC' }]}>Store Video JSON (Animation)</Text>
            </View>
            <View style={{ backgroundColor: '#FAF5FF', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#E9D5FF' }}>
              <Text style={{ color: '#7E22CE', fontSize: 11, fontWeight: '800' }}>60 FPS SHOWCASE</Text>
            </View>
          </View>

          <Text style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#64748B', marginBottom: 12, lineHeight: 17 }}>
            Showcase your store with an eye-catching 60 FPS animated promotional video JSON banner at the top of your customer store menu.
          </Text>

          {Boolean(profile?.supplierLottieAnimation?.url || profile?.supplierLottieAnimation?.rawJson) ? (
            <View style={{
              borderRadius: 14,
              overflow: 'hidden',
              marginBottom: 12,
              backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
              borderWidth: 1,
              borderColor: isDark ? '#334155' : '#E2E8F0',
            }}>
              <LottieAnimation
                key={profile.supplierLottieAnimation.url || (profile.supplierLottieAnimation.rawJson ? 'raw_json_active' : 'lottie_view')}
                source={profile.supplierLottieAnimation.rawJson || profile.supplierLottieAnimation.url}
                height={150}
                speed={1.5}
                loop={true}
                autoPlay={true}
                preserveAspectRatio="xMidYMid meet"
                style={{ width: '100%' }}
              />
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 10,
                borderTopWidth: 1,
                borderTopColor: isDark ? '#334155' : '#E2E8F0',
              }}>
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                    {profile.supplierLottieAnimation.title || 'Store Video Animation'}
                  </Text>
                  <Text style={{ fontSize: 10, color: isDark ? '#94A3B8' : '#64748B' }}>
                    {profile.supplierLottieAnimation.isActive ? 'Active on Store Menu ✓' : 'Disabled (Hidden)'}
                  </Text>
                </View>
                <Switch
                  value={Boolean(profile.supplierLottieAnimation.isActive)}
                  onValueChange={handleToggleLottieActive}
                  trackColor={{ false: '#CBD5E1', true: '#10B981' }}
                />
              </View>
            </View>
          ) : (
            <View style={{
              backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
              padding: 16,
              borderRadius: 12,
              alignItems: 'center',
              marginBottom: 12,
              borderWidth: 1,
              borderColor: isDark ? '#334155' : '#E2E8F0',
            }}>
              <Text style={{ fontSize: 26, marginBottom: 4 }}>🎬</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                No Store Video JSON Added Yet
              </Text>
              <Text style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B', textAlign: 'center', marginTop: 2 }}>
                Add a curated animation or paste your custom Lottie JSON to showcase on your store menu.
              </Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[styles.smallSaveBtn, { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, backgroundColor: '#7C3AED' }]}
              onPress={() => setLottieModalVisible(true)}
            >
              <Text style={[styles.smallSaveBtnText, { fontWeight: '800' }]}>
                {(profile?.supplierLottieAnimation?.url || profile?.supplierLottieAnimation?.rawJson) ? '🔄 Replace Store Video JSON' : '➕ Upload Store Video JSON'}
              </Text>
            </TouchableOpacity>

            {Boolean(profile?.supplierLottieAnimation?.url || profile?.supplierLottieAnimation?.rawJson) && (
              <TouchableOpacity
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderRadius: 8,
                  backgroundColor: '#FEE2E2',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
                onPress={handleDeleteLottie}
              >
                <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 12 }}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ============================================================ */}
        {/* 3B. SPEC PART 8: 3 STORE PHOTOS SHOWCASE CARD */}
        {/* ============================================================ */}
        <View style={[styles.infoCard, isDark && { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 20 }}>🏪</Text>
              <Text style={[styles.cardHeaderTitle, isDark && { color: '#F8FAFC' }]}>Store Showcase (3 Photos)</Text>
            </View>
            <View style={{ backgroundColor: '#EFF6FF', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE' }}>
              <Text style={{ color: '#1D4ED8', fontSize: 11, fontWeight: '800' }}>AUTO-SLIDER</Text>
            </View>
          </View>
          <Text style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#64748B', marginBottom: 14, lineHeight: 17 }}>
            Showcase your store with 3 high-quality views (Front, Inside & Products). These will auto-slide on the customer store menu.
          </Text>

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
            {showcaseSlots.map((slot, sIdx) => {
              const photoSrc = slot.uri || (slot.url ? resolveUploadUrl(slot.url) : null);
              return (
                <View key={`slot-${sIdx}`} style={{ flex: 1, alignItems: 'center' }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handlePickShowcasePhoto(sIdx)}
                    style={{
                      width: '100%',
                      height: 95,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: photoSrc ? '#10B981' : (isDark ? '#334155' : '#CBD5E1'),
                      borderStyle: photoSrc ? 'solid' : 'dashed',
                      backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                      overflow: 'hidden',
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    {photoSrc ? (
                      <Image source={{ uri: photoSrc }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    ) : (
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: 22 }}>📷</Text>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? '#94A3B8' : '#64748B', marginTop: 4 }}>
                          Slot {sIdx + 1}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? '#E2E8F0' : '#1E293B', marginTop: 4, textAlign: 'center' }} numberOfLines={2}>
                    {slot.caption}
                  </Text>

                  {photoSrc && (
                    <TouchableOpacity onPress={() => handleRemoveShowcasePhoto(sIdx)} style={{ marginTop: 2 }}>
                      <Text style={{ fontSize: 10, color: '#EF4444', fontWeight: '700' }}>Remove ✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.smallSaveBtn, { width: '100%', alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }]}
            onPress={handleSaveAll3ShowcasePhotos}
            disabled={isSavingPhotos}
          >
            {isSavingPhotos ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.smallSaveBtnText}>💾 Save & Publish 3 Showcase Photos</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ============================================================ */}
        {/* 3C. SPEC PART 2 & 3: PERMANENT STORE LOCATION CARD */}
        {/* ============================================================ */}
        <View style={[styles.infoCard, isDark && { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 20 }}>📍</Text>
              <Text style={[styles.cardHeaderTitle, isDark && { color: '#F8FAFC' }]}>Permanent Store Location</Text>
            </View>
            <View style={{
              backgroundColor: profile?.permanentStoreLocation?.isConfirmed ? '#DCFCE7' : '#FEF3C7',
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 12,
            }}>
              <Text style={{
                color: profile?.permanentStoreLocation?.isConfirmed ? '#166534' : '#92400E',
                fontSize: 11,
                fontWeight: '800',
              }}>
                {profile?.permanentStoreLocation?.isConfirmed ? 'LOCKED ✓' : 'UNCONFIRMED'}
              </Text>
            </View>
          </View>

          <Text style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#64748B', marginBottom: 12, lineHeight: 17 }}>
            Your physical store coordinates are permanently locked in Ride Hub database. They will NEVER change when you travel or re-login.
          </Text>

          {profile?.permanentStoreLocation?.latitude && profile?.permanentStoreLocation?.longitude ? (
            <View style={{
              backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
              padding: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: isDark ? '#334155' : '#E2E8F0',
              marginBottom: 12,
            }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: 4 }}>
                {profile.permanentStoreLocation.formattedAddress || 'Store Address Verified'}
              </Text>
              <Text style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B' }}>
                GPS: {Number(profile.permanentStoreLocation.latitude).toFixed(5)}, {Number(profile.permanentStoreLocation.longitude).toFixed(5)}
                {profile.permanentStoreLocation.accuracy ? ` (± ${profile.permanentStoreLocation.accuracy}m)` : ''}
              </Text>
              {profile.permanentStoreLocation.confirmedAt && (
                <Text style={{ fontSize: 10, color: '#10B981', marginTop: 4, fontWeight: '700' }}>
                  Confirmed: {new Date(profile.permanentStoreLocation.confirmedAt).toLocaleDateString()}
                </Text>
              )}
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.smallSaveBtn, { width: '100%', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, backgroundColor: '#2563EB' }]}
            onPress={handleStartConfirmPermanentLocation}
            disabled={confirmingLocation}
          >
            {confirmingLocation ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.smallSaveBtnText}>🎯 Detect & Lock Permanent Store GPS</Text>
            )}
          </TouchableOpacity>
        </View>
        {/* ============================================================ */}
        {/* 4. ACTIONS & MENU SECTION */}
        {/* ============================================================ */}
        <View style={[styles.actionsCard, isDark && { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1 }]}>
          <Text style={[styles.cardHeaderTitle, isDark && { color: '#F8FAFC' }]}>⚙️ Store Settings & Actions</Text>

          {/* DARK MODE SWITCH */}
          <View style={[styles.actionRow, isDark && { borderBottomColor: '#334155' }]}>
            <View style={[styles.actionIconWrap, { backgroundColor: isDark ? '#0F172A' : '#EFF6FF' }]}>
              <PngIcon name="moon" size={20} color={isDark ? '#FACC15' : '#475569'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionRowText, isDark && { color: '#F8FAFC' }]}>Dark Mode</Text>
              <Text style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B' }}>
                {isDark ? 'Dark theme enabled' : 'Light theme enabled'}
              </Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: '#CBD5E1', true: '#3B82F6' }}
              thumbColor={isDark ? '#FFFFFF' : '#FFFFFF'}
            />
          </View>

          {/* Upload Photo */}
          <TouchableOpacity
            style={[styles.actionRow, isDark && { borderBottomColor: '#334155' }]}
            onPress={handleSelectProfilePicture}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: isDark ? '#0F172A' : '#EFF6FF' }]}>
              <PngIcon name="camera" size={20} color="#0066FF" />
            </View>
            <Text style={[styles.actionRowText, isDark && { color: '#F8FAFC' }]}>Upload {isRestaurant ? 'Restaurant' : 'Store'} Logo / Photo</Text>
            <Text style={[styles.arrowText, isDark && { color: '#64748B' }]}>›</Text>
          </TouchableOpacity>

          {/* Change Language */}
          <TouchableOpacity
            style={[styles.actionRow, isDark && { borderBottomColor: '#334155' }]}
            onPress={() => setShowLangModal(true)}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: isDark ? '#0F172A' : '#EFF6FF' }]}>
              <PngIcon name="globe" size={20} color="#0066FF" />
            </View>
            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.actionRowText, isDark && { color: '#F8FAFC' }]}>{t('common.change_language', 'Change Language')}</Text>
              <Text style={{ fontSize: 13, color: '#0066FF', fontWeight: '700', marginRight: 8 }}>
                {language === 'hi' ? 'हिन्दी 🇮🇳' : 'English 🇬🇧'}
              </Text>
            </View>
            <Text style={[styles.arrowText, isDark && { color: '#64748B' }]}>›</Text>
          </TouchableOpacity>

          {/* Logout */}
          <TouchableOpacity
            style={[styles.actionRow, { borderBottomWidth: 0 }]}
            onPress={handleLogoutPress}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: '#FEE2E2' }]}>
              <PngIcon name="log-out" size={20} color="#EF4444" />
            </View>
            <Text style={[styles.actionRowText, { color: '#EF4444' }]}>Log Out {isRestaurant ? 'Restaurant' : 'Store'}</Text>
            <Text style={[styles.arrowText, { color: '#EF4444' }]}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* EDIT STORE CATEGORY MODAL - DYNAMIC DATABASE CATEGORIES */}
      <Modal
        visible={showCategoryModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCategoryModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: 20, width: '100%', maxWidth: 360, padding: 20, elevation: 5, borderWidth: isDark ? 1 : 0, borderColor: '#334155' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A' }}>Select Store Category</Text>
              <TouchableOpacity onPress={() => setShowCategoryModal(false)}>
                <Text style={{ fontSize: 16, color: '#64748B', fontWeight: 'bold' }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#64748B', marginBottom: 14 }}>
              Choose the authorized category that best describes your store catalog.
            </Text>

            {loadingCats ? (
              <ActivityIndicator size="small" color="#0066FF" style={{ marginVertical: 20 }} />
            ) : dbCategories.length === 0 ? (
              <Text style={{ textAlign: 'center', color: '#94A3B8', marginVertical: 15 }}>No categories found in database.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                {dbCategories.map((catItem: any) => {
                  const catName = catItem.name || catItem.categoryName || '';
                  const isSelected =
                    (profile?.categoryName || user?.categoryName || '').toLowerCase() === catName.toLowerCase();
                  const catImg = catItem.image
                    ? catItem.image.startsWith('http')
                      ? catItem.image
                      : `${UPLOADS_URL}${catItem.image.replace('/uploads', '')}`
                    : null;

                  return (
                    <TouchableOpacity
                      key={catItem._id || catItem.id || catName}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        borderRadius: 12,
                        backgroundColor: isSelected
                          ? isDark ? '#1E3A8A' : '#EFF6FF'
                          : isDark ? '#0F172A' : '#F8FAFC',
                        borderWidth: 1,
                        borderColor: isSelected ? '#3B82F6' : isDark ? '#334155' : '#E2E8F0',
                        marginBottom: 8,
                      }}
                      onPress={async () => {
                        setShowCategoryModal(false);
                        const cSlug = catItem.slug || catName.toLowerCase();
                        const partner = catItem.partnerType || (cSlug.includes('resto') || cSlug.includes('food') ? 'RESTAURANT' : 'STORE');
                        await saveProfileUpdates({
                          categoryName: catName,
                          businessCategoryName: catName,
                          category: catItem._id || catItem.id,
                          businessCategoryId: catItem._id || catItem.id,
                          businessType: cSlug,
                          partnerType: partner,
                        });
                        if (socket) {
                          socket.emit('RESTAURANT_CATEGORY_UPDATED', {
                            restaurantId: profile?._id || user?._id,
                            categoryName: catName,
                            category: catItem._id || catItem.id,
                          });
                        }
                        fetchProfile();
                      }}
                    >
                      {catImg ? (
                        <Image source={{ uri: catImg }} style={{ width: 28, height: 28, borderRadius: 6, marginRight: 12 }} />
                      ) : (
                        <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                          <PngIcon name="pricetag" size={16} color="#0066FF" />
                        </View>
                      )}
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: isSelected ? '700' : '500',
                          color: isSelected ? '#38BDF8' : isDark ? '#F8FAFC' : '#0F172A',
                          flex: 1,
                        }}
                      >
                        {catName}
                      </Text>
                      {isSelected && <Text style={{ color: '#38BDF8', fontSize: 16, fontWeight: 'bold' }}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Language Selection Modal */}
      <LanguageSelectModal
        visible={showLangModal}
        onClose={() => setShowLangModal(false)}
      />
      {/* SPEC PART 2 & 3: PERMANENT LOCATION CONFIRMATION MODAL */}
      <Modal visible={confirmLocationModalVisible} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 380, backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: 20, padding: 20, elevation: 8 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: 8 }}>
              Confirm Permanent Store Location
            </Text>
            <Text style={{ fontSize: 13, color: isDark ? '#94A3B8' : '#64748B', marginBottom: 14, lineHeight: 18 }}>
              Are you currently at your physical store location? This GPS location will be locked permanently in the Ride Hub database.
            </Text>

            <View style={{ backgroundColor: isDark ? '#0F172A' : '#F1F5F9', padding: 14, borderRadius: 12, marginBottom: 16 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: 6 }}>
                {pendingLocationData?.formattedAddress}
              </Text>
              <Text style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B' }}>
                Latitude: {pendingLocationData?.latitude.toFixed(6)}
              </Text>
              <Text style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B' }}>
                Longitude: {pendingLocationData?.longitude.toFixed(6)}
              </Text>
              <Text style={{ fontSize: 11, color: '#10B981', fontWeight: '700', marginTop: 4 }}>
                Accuracy: ± {pendingLocationData?.accuracy} meters (Verified)
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: isDark ? '#334155' : '#CBD5E1', alignItems: 'center' }}
                onPress={() => setConfirmLocationModalVisible(false)}
              >
                <Text style={{ fontWeight: '700', color: isDark ? '#94A3B8' : '#64748B' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1.5, paddingVertical: 12, borderRadius: 10, backgroundColor: '#0066FF', alignItems: 'center' }}
                onPress={handleSavePermanentLocation}
                disabled={confirmingLocation}
              >
                {confirmingLocation ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={{ fontWeight: '800', color: '#FFFFFF' }}>Lock Location ✓</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* SPEC PART 9: STORE VIDEO JSON / LOTTIE UPLOAD MODAL */}
      <Modal visible={lottieModalVisible} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <View style={{ width: '100%', maxWidth: 400, maxHeight: '88%', backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: 20, padding: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                Store Video JSON (Animation)
              </Text>
              <TouchableOpacity onPress={() => setLottieModalVisible(false)}>
                <Text style={{ fontSize: 18, color: '#94A3B8', fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Mode Switch: JSON File Upload vs Curated Presets */}
            <View style={{ flexDirection: 'row', backgroundColor: isDark ? '#0F172A' : '#F1F5F9', borderRadius: 10, padding: 3, marginBottom: 14 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, backgroundColor: lottieInputMode === 'file' ? '#7C3AED' : 'transparent' }}
                onPress={() => setLottieInputMode('file')}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: lottieInputMode === 'file' ? '#FFFFFF' : (isDark ? '#94A3B8' : '#64748B') }}>
                  📁 Upload .JSON File
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, backgroundColor: lottieInputMode === 'preset' ? '#7C3AED' : 'transparent' }}
                onPress={() => setLottieInputMode('preset')}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: lottieInputMode === 'preset' ? '#FFFFFF' : (isDark ? '#94A3B8' : '#64748B') }}>
                  ✨ Curated Presets
                </Text>
              </TouchableOpacity>
            </View>

            {lottieInputMode === 'file' ? (
              <View style={{ width: '100%' }}>
                {!selectedJsonFile ? (
                  <View style={{
                    width: '100%',
                    height: 155,
                    borderRadius: 14,
                    overflow: 'hidden',
                    borderWidth: 1.5,
                    borderColor: '#7C3AED',
                    borderStyle: 'dashed',
                    backgroundColor: isDark ? '#0F172A' : '#FAF5FF',
                    marginBottom: 10,
                  }}>
                    <WebView
                      originWhitelist={['*']}
                      source={{
                        html: `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body, html {
      width: 100%;
      height: 100%;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
    }
    .picker-btn {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 12px;
      text-align: center;
      -webkit-tap-highlight-color: transparent;
    }
    .icon { font-size: 34px; margin-bottom: 6px; }
    .main-text { font-size: 14px; font-weight: 800; color: #7C3AED; margin-bottom: 3px; }
    .sub-text { font-size: 11px; color: ${isDark ? '#94A3B8' : '#64748B'}; font-weight: 500; }
    input[type="file"] { display: none; }
  </style>
</head>
<body>
  <label for="jsonFileInput" class="picker-btn" id="pickerLabel">
    <div class="icon">📁</div>
    <div class="main-text">Tap to Select .JSON File</div>
    <div class="sub-text">Choose any Store JSON from device storage</div>
  </label>
  <input id="jsonFileInput" type="file" accept=".json,application/json" onchange="handleFile(this)" />
  <script>
    function handleFile(input) {
      var file = input.files && input.files[0];
      if (!file) return;
      var label = document.getElementById('pickerLabel');
      label.innerHTML = '<div class="icon">⏳</div><div class="main-text">Reading ' + file.name + '...</div>';
      var reader = new FileReader();
      reader.onload = function(e) {
        try {
          var text = e.target.result;
          var parsed = JSON.parse(text);
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'FILE_PICKED',
              fileName: file.name,
              fileSize: file.size,
              rawJson: parsed
            }));
          }
        } catch (err) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'FILE_ERROR',
              error: 'Invalid JSON file: ' + err.message
            }));
          }
          label.innerHTML = '<div class="icon">❌</div><div class="main-text">Invalid JSON File</div><div class="sub-text">Tap to try another file</div>';
        }
      };
      reader.onerror = function() {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'FILE_ERROR',
            error: 'Failed to read file from storage'
          }));
        }
        label.innerHTML = '<div class="icon">❌</div><div class="main-text">Read Error</div><div class="sub-text">Tap to retry</div>';
      };
      reader.readAsText(file);
    }
  </script>
</body>
</html>`
                      }}
                      onMessage={handleJsonFileMessage}
                      style={{ backgroundColor: 'transparent', flex: 1 }}
                      javaScriptEnabled={true}
                      domStorageEnabled={true}
                      allowFileAccess={true}
                    />
                  </View>
                ) : (
                  <View style={{ width: '100%', marginBottom: 10 }}>
                    {/* Selected File Card */}
                    <View style={{
                      backgroundColor: isDark ? '#0F172A' : '#FAF5FF',
                      borderWidth: 1.5,
                      borderColor: '#22C55E',
                      borderRadius: 14,
                      padding: 12,
                      marginBottom: 10,
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                          <Text style={{ fontSize: 24 }}>📄</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A' }} numberOfLines={1}>
                              {selectedJsonFile.name}
                            </Text>
                            <Text style={{ fontSize: 11, color: '#22C55E', fontWeight: '700', marginTop: 2 }}>
                              ✓ Valid Store JSON ({(selectedJsonFile.size / 1024).toFixed(1)} KB)
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          onPress={() => setSelectedJsonFile(null)}
                          style={{ backgroundColor: isDark ? '#334155' : '#E2E8F0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? '#CBD5E1' : '#475569' }}>Change</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Animation Title */}
                    <TextInput
                      style={{
                        backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                        color: isDark ? '#F8FAFC' : '#0F172A',
                        borderWidth: 1,
                        borderColor: isDark ? '#334155' : '#CBD5E1',
                        borderRadius: 10,
                        padding: 10,
                        fontSize: 12,
                        marginBottom: 12,
                      }}
                      placeholder="Store Showcase Title (e.g. Mega Sale Banner)"
                      placeholderTextColor="#94A3B8"
                      value={lottieTitleInput}
                      onChangeText={setLottieTitleInput}
                    />

                    {/* Submit Button */}
                    <TouchableOpacity
                      style={{
                        backgroundColor: '#7C3AED',
                        paddingVertical: 13,
                        borderRadius: 12,
                        alignItems: 'center',
                        elevation: 3,
                      }}
                      onPress={() => {
                        if (!selectedJsonFile) {
                          Alert.alert('No File', 'Please select a JSON file first.');
                          return;
                        }
                        handlePublishLottie(
                          selectedJsonFile.content,
                          lottieTitleInput.trim() || selectedJsonFile.name.replace(/\.json$/i, '')
                        );
                      }}
                      disabled={isSavingLottie}
                    >
                      {isSavingLottie ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>
                          🚀 Upload & Publish Store JSON
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 340 }}>
                {LOTTIE_PRESETS.map((preset, pIdx) => (
                  <TouchableOpacity
                    key={`preset-${pIdx}`}
                    activeOpacity={0.8}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: isDark ? '#334155' : '#E2E8F0',
                      backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                      marginBottom: 10,
                    }}
                    onPress={() => handlePublishLottie(preset.json, preset.title)}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                        {preset.title}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#7C3AED', fontWeight: '800' }}>Select ✓</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B', marginTop: 4 }}>
                      {preset.desc}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default ProfileScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingSubText: {
    marginTop: 12,
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingOverlay: {
    ...(StyleSheet.absoluteFill as any),
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  loadingOverlayText: {
    marginTop: 12,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  heroHeader: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: 28,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    alignItems: 'center',
  },
  heroNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
  },
  backBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  heroNavTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  editHeaderBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  editHeaderBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  largeCardWrap: {
    position: 'relative',
    width: width - 40,
    height: 230,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    marginBottom: 16,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  largeCardImg: {
    width: '100%',
    height: '100%',
  },
  leftArrowBtn: {
    position: 'absolute',
    left: 10,
    top: '42%',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  rightArrowBtn: {
    position: 'absolute',
    right: 10,
    top: '42%',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  arrowIconText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: 'bold',
    marginTop: -3,
  },
  imageCounterBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  imageCounterText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  cameraBadgeBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  cameraBadgeText: {
    color: '#0066FF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  nameDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  restaurantNameText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
  },
  pencilTouch: {
    marginLeft: 8,
    padding: 4,
  },
  nameEditBox: {
    width: '90%',
    alignItems: 'center',
    marginBottom: 10,
  },
  nameInput: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
    textAlign: 'center',
  },
  editActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  saveBtn: {
    backgroundColor: '#22C55E',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  cancelBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
  },
  cancelBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  verifiedBadgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  verifiedBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  verifiedBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  roleTag: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  roleTagText: {
    color: '#0066FF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: -20,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    justifyContent: 'space-around',
  },
  statCard: {
    alignItems: 'center',
    flex: 1,
  },
  statIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  statVal: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  statLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    padding: 18,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  cardHeaderTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 16,
  },
  infoItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  infoIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  infoItemLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  infoItemVal: {
    fontSize: 15,
    color: '#0F172A',
    fontWeight: 'bold',
    marginTop: 2,
  },
  itemEditBtn: {
    color: '#0066FF',
    fontWeight: 'bold',
    fontSize: 13,
    paddingLeft: 8,
  },
  locationInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    color: '#0F172A',
  },
  bioInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    color: '#0F172A',
    minHeight: 60,
  },
  smallSaveBtn: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  smallSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  gpsFetchBtn: {
    backgroundColor: '#0EA5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  gpsFetchBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  gpsFetchBtnInline: {
    marginTop: 6,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  gpsFetchBtnTextInline: {
    color: '#0066FF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  actionsCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    padding: 18,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  actionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  actionRowText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  arrowText: {
    fontSize: 20,
    color: '#94A3B8',
    fontWeight: 'bold',
  },
});

const customerStyles = StyleSheet.create({
  header: {
    backgroundColor: '#0066FF',
    paddingBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  avatarCard: {
    alignItems: 'center',
    paddingTop: 10,
  },
  avatarWrap: {
    position: 'relative',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 48,
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 48,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#0066FF',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  customerNameText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  editNameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  nameInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 15,
    color: '#0F172A',
    minWidth: 160,
  },
  saveNameBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  saveNameBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  verifiedBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  verifiedBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  roleBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  detailsCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardSectionHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  infoIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '700',
    marginTop: 2,
  },
  verifiedSmallBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  verifiedSmallBadgeText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '700',
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 16,
    paddingVertical: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0066FF',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#F1F5F9',
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuRowText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  menuChevron: {
    fontSize: 20,
    color: '#94A3B8',
    fontWeight: 'bold',
  },
  logoutBtn: {
    backgroundColor: '#FEE2E2',
    marginHorizontal: 16,
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  logoutBtnText: {
    color: '#DC2626',
    fontSize: 15,
    fontWeight: '800',
  },
  editPhoneBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  editPhoneBtnText: {
    color: '#0066FF',
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalCloseText: {
    fontSize: 18,
    color: '#94A3B8',
    fontWeight: 'bold',
    padding: 4,
  },
  modalSubText: {
    fontSize: 12.5,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 16,
  },
  modalCurrentBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalCurrentLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  modalCurrentValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginTop: 2,
  },
  modalInputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  modalPhoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  modalPrefix: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    marginRight: 8,
  },
  modalPhoneInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    paddingVertical: 10,
  },
  modalOtpInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#0066FF',
    borderRadius: 12,
    paddingVertical: 12,
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: 8,
    marginBottom: 14,
  },
  modalPrimaryBtn: {
    backgroundColor: '#0066FF',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  modalBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  modalPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  resendRow: {
    alignItems: 'center',
    marginTop: 12,
  },
  resendTimerText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  resendActiveText: {
    fontSize: 12.5,
    color: '#0066FF',
    fontWeight: '800',
  },
});
