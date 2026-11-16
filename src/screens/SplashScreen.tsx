import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Text,
  Image,
  Animated,
  Easing,
  StatusBar,
  TouchableOpacity,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { BASE_URL, LOCAL_URL, SOCKET_URL, resolveUploadUrl } from '../config/apiConfig';
import api from '../services/api';
import splash from '../assets/splash.png';
import {
  fetchCurrentGpsPositionDetailed,
  reverseGeocodeCoords,
  getActiveDeliveryAddress,
  getPermanentCustomerAddress,
} from '../services/LocationAddressService';

const { width, height } = Dimensions.get('window');

export interface SplashRoleConfig {
  title: string;
  subtitle: string;
  image?: string;
}

export interface SplashScreenConfig {
  backgroundColor: string;
  splashImage?: string;
  brandNamePrimary: string;
  brandNameSecondary: string;
  brandTagline: string;
  superAppText: string;
  durationSeconds: number;
  customer: SplashRoleConfig;
  supplier: SplashRoleConfig;
  delivery: SplashRoleConfig;
}

const DEFAULT_SPLASH_CONFIG: SplashScreenConfig = {
  backgroundColor: '#01299a',
  splashImage: '/uploads/splash_screen_latest.png',
  brandNamePrimary: 'RIDE',
  brandNameSecondary: 'HUB',
  brandTagline: 'EXPRESS ECOSYSTEM',
  superAppText: 'MULTI-ROLE UNIFIED SUPER APP',
  durationSeconds: 3.5,
  customer: {
    title: 'Order & Book',
    subtitle: 'Food • Groceries • Rides',
    image: '',
  },
  supplier: {
    title: 'Sell & Grow',
    subtitle: 'Store & Merchant Portal',
    image: '',
  },
  delivery: {
    title: 'Deliver & Earn',
    subtitle: 'Fast Fleet & Daily Payouts',
    image: '',
  },
};

// URL helper for uploaded images
const resolveImageUrl = (img?: string) => {
  if (!img || typeof img !== 'string') return null;
  const resolved = resolveUploadUrl(img);
  return resolved || null;
};

// Word-by-Word Animated Component
const WordAnimatedAddress = ({ fullText }: { fullText: string }) => {
  const words = fullText.split(' ').filter(Boolean);
  const animValues = useRef<Animated.Value[]>([]).current;

  // Ensure enough animated values for each word
  if (animValues.length < words.length) {
    for (let i = animValues.length; i < words.length; i++) {
      animValues.push(new Animated.Value(0));
    }
  }

  useEffect(() => {
    // Reset all word animations
    animValues.forEach((val) => val.setValue(0));

    // Stagger animation across words (each word slides up and fades in)
    const animSequence = words.map((_, i) =>
      Animated.timing(animValues[i], {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      })
    );

    Animated.stagger(65, animSequence).start();
  }, [fullText, words.length]);

  return (
    <View style={styles.wordsRowWrap}>
      {words.map((word, idx) => {
        const animVal = animValues[idx] || new Animated.Value(1);
        const translateY = animVal.interpolate({
          inputRange: [0, 1],
          outputRange: [10, 0],
        });
        const scale = animVal.interpolate({
          inputRange: [0, 0.7, 1],
          outputRange: [0.75, 1.1, 1],
        });

        return (
          <Animated.Text
            key={`${word}_${idx}`}
            style={[
              styles.addressWordText,
              {
                opacity: animVal,
                transform: [{ translateY }, { scale }],
              },
            ]}
          >
            {word}{' '}
          </Animated.Text>
        );
      })}
    </View>
  );
};

const SplashScreen = ({ navigation }: any) => {
  const { isLoading } = useAuth();
  const [config, setConfig] = useState<SplashScreenConfig>(DEFAULT_SPLASH_CONFIG);
  const [realAddress, setRealAddress] = useState<string>('Locating your area...');

  // Entrance and layout animations
  const logoFade = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.82)).current;
  const cardsFade = useRef(new Animated.Value(0)).current;
  const cardsSlide = useRef(new Animated.Value(40)).current;
  const pulseCore = useRef(new Animated.Value(1)).current;

  // Address Bar Animations (Slide-down from top, Spring scale, Pin bounce & Pulse glow)
  const addressSlide = useRef(new Animated.Value(-60)).current;
  const addressFade = useRef(new Animated.Value(0)).current;
  const addressScale = useRef(new Animated.Value(0.9)).current;
  const pinBounce = useRef(new Animated.Value(0)).current;
  const pulseRing = useRef(new Animated.Value(1)).current;
  const pulseRingOpacity = useRef(new Animated.Value(0.8)).current;

  // Active role ticker index
  const [activeTickerIdx, setActiveTickerIdx] = useState(0);

  // 1. Fetch & Cache Splash Screen Config (with real-time socket sync)
  useEffect(() => {
    let isMounted = true;

    // Load cached config immediately so cold launches feel instantaneous
    AsyncStorage.getItem('@cached_splash_config')
      .then((cached) => {
        if (cached && isMounted) {
          try {
            const parsed = JSON.parse(cached);
            setConfig((prev) => ({ ...prev, ...parsed }));
          } catch (e) {
            // ignore
          }
        }
      })
      .catch(() => {});

    // Fetch authoritative splash config from backend
    const fetchLiveConfig = async () => {
      try {
        const res = await api.get('/settings/splash');
        const liveConfig = res?.data?.splashScreen || res?.data?.config || res?.data?.data;
        if (liveConfig && isMounted) {
          console.log('[SplashScreen] Admin splash config loaded:', liveConfig.splashImage);
          setConfig((prev) => ({ ...prev, ...liveConfig }));
          AsyncStorage.setItem('@cached_splash_config', JSON.stringify(liveConfig)).catch(() => {});
        }
      } catch (err) {
        console.log('[SplashScreen] Fallback to /screen-media/SPLASH_SCREEN');
        try {
          const smRes = await api.get('/screen-media/SPLASH_SCREEN');
          const smImg = smRes?.data?.screen?.imageUrl || smRes?.data?.screen?.mediaUrl;
          if (smImg && isMounted) {
            setConfig((prev) => ({ ...prev, splashImage: smImg }));
          }
        } catch (_) {}
      }
    };

    fetchLiveConfig();

    // Listen for live updates via Socket.IO
    let socket: any = null;
    try {
      socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        timeout: 5000,
      });

      socket.on('splash_screen_updated', (updatedConfig: any) => {
        if (isMounted && updatedConfig) {
          setConfig((prev) => ({ ...prev, ...updatedConfig }));
          AsyncStorage.setItem('@cached_splash_config', JSON.stringify(updatedConfig)).catch(() => {});
        }
      });

      socket.on('splash_updated', (updatedConfig: any) => {
        if (isMounted && updatedConfig) {
          setConfig((prev) => ({ ...prev, ...updatedConfig }));
          AsyncStorage.setItem('@cached_splash_config', JSON.stringify(updatedConfig)).catch(() => {});
        }
      });

      socket.on('screen_media_updated', (data: any) => {
        if ((data?.screenId === 'SPLASH_SCREEN' || data?.screenId === 'splash_screen') && isMounted) {
          fetchLiveConfig();
        }
      });
    } catch (e) {
      // Socket connection failed; continue without live updates
    }

    return () => {
      isMounted = false;
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  // 2. Fetch Real Dynamic User Address & Trigger Dynamic Word Animation
  useEffect(() => {
    let isMounted = true;

    // Start address entry animation immediately
    Animated.parallel([
      Animated.timing(addressFade, {
        toValue: 1,
        duration: 500,
        delay: 150,
        useNativeDriver: true,
      }),
      Animated.spring(addressSlide, {
        toValue: 0,
        friction: 7,
        tension: 40,
        delay: 150,
        useNativeDriver: true,
      }),
      Animated.spring(addressScale, {
        toValue: 1,
        friction: 6,
        tension: 45,
        delay: 150,
        useNativeDriver: true,
      }),
    ]).start();

    // Continuous Pin Bounce animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pinBounce, {
          toValue: -5,
          duration: 380,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pinBounce, {
          toValue: 0,
          duration: 380,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Continuous Radar Pulse animation
    Animated.loop(
      Animated.parallel([
        Animated.timing(pulseRing, {
          toValue: 2.4,
          duration: 1300,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseRingOpacity, {
          toValue: 0,
          duration: 1300,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    const detectAddress = async () => {
      try {
        // Step A: Check cached / permanent address first for instant display
        const saved = await getPermanentCustomerAddress();
        if (saved?.fullAddress && isMounted) {
          setRealAddress(saved.fullAddress);
        } else {
          const active = await getActiveDeliveryAddress();
          if (active?.fullAddress && isMounted) {
            setRealAddress(active.fullAddress);
          }
        }

        // Step B: Fetch real-time live GPS fix & reverse geocode
        const gps = await fetchCurrentGpsPositionDetailed(true);
        if (gps?.success && gps.fix?.latitude && gps.fix?.longitude) {
          const geo = await reverseGeocodeCoords(gps.fix.latitude, gps.fix.longitude);
          if (geo?.fullAddress && isMounted) {
            setRealAddress(geo.fullAddress);
          }
        }
      } catch (e) {
        // Silent fallback
      }
    };

    detectAddress();
    return () => {
      isMounted = false;
    };
  }, []);

  const displayDurationMs = Math.max(3000, ((config.durationSeconds || 3.0) * 1000));

  // 3. Entrance & Pulse Animations
  useEffect(() => {
    // 1. Logo Scale & Fade In
    Animated.parallel([
      Animated.timing(logoFade, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // 2. Role Cards Delayed Slide-Up
    Animated.parallel([
      Animated.timing(cardsFade, {
        toValue: 1,
        duration: 900,
        delay: 500,
        useNativeDriver: true,
      }),
      Animated.timing(cardsSlide, {
        toValue: 0,
        duration: 800,
        delay: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // 3. Continuous Central Core Pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseCore, {
          toValue: 1.14,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseCore, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // 4. Ticker Rotation interval
    const tickerInterval = setInterval(() => {
      setActiveTickerIdx((prev) => (prev + 1) % 3);
    }, 850);

    return () => clearInterval(tickerInterval);
  }, []);

  // Connect all roles: resolve active role or return RoleSelection
  const resolveNextScreen = async () => {
    try {
      const activeRoleRaw = await AsyncStorage.getItem('activeRole');
      const activeRole = (activeRoleRaw || '').toUpperCase();
      const customerToken = await AsyncStorage.getItem('customerToken');
      const deliveryToken = await AsyncStorage.getItem('deliveryToken');
      const supplierToken = await AsyncStorage.getItem('supplierToken');
      const deliveryUserRaw = await AsyncStorage.getItem('deliveryUser');
      const customerUserRaw = await AsyncStorage.getItem('customerUser');
      const supplierUserRaw = await AsyncStorage.getItem('supplierUser');

      console.log(`[SplashScreen] Resolving next screen. activeRole: "${activeRole}", hasDeliveryToken: ${Boolean(deliveryToken)}, hasDeliveryUser: ${Boolean(deliveryUserRaw)}`);

      // 1. DELIVERY / RIDER PARTNER: If active role is DELIVERY or RIDER with saved token or user
      if ((activeRole === 'DELIVERY' || activeRole === 'RIDER') && (deliveryToken || deliveryUserRaw)) {
        await AsyncStorage.setItem('activeRole', 'DELIVERY');
        if (deliveryToken) await AsyncStorage.setItem('userToken', deliveryToken);
        return 'DeliveryRiderHomeScreen';
      }

      // 2. CUSTOMER: If active role is CUSTOMER with saved token or user
      if (activeRole === 'CUSTOMER' && (customerToken || customerUserRaw)) {
        return 'CustomerHomeScreen';
      }

      // 3. SUPPLIER: If active role is SUPPLIER with saved token or user
      if (activeRole === 'SUPPLIER' && (supplierToken || supplierUserRaw)) {
        const supplierUser = supplierUserRaw ? JSON.parse(supplierUserRaw) : null;
        if (supplierUser?.approvalStatus !== 'APPROVED') {
          return 'SellerPendingApprovalScreen';
        }
        return 'RiderHomeScreen';
      }

      // 4. Fallback checks: If activeRole wasn't set or was desynced, inspect saved user sessions
      if (deliveryToken && deliveryUserRaw) {
        try {
          const dUser = JSON.parse(deliveryUserRaw);
          const r = (dUser?.role || '').toLowerCase();
          if (r === 'rider' || r === 'delivery_partner' || r === 'provider') {
            await AsyncStorage.setItem('activeRole', 'DELIVERY');
            return 'DeliveryRiderHomeScreen';
          }
        } catch (_) {}
      }

      if (customerToken && customerUserRaw) {
        await AsyncStorage.setItem('activeRole', 'CUSTOMER');
        return 'CustomerHomeScreen';
      }

      if (supplierToken && supplierUserRaw) {
        await AsyncStorage.setItem('activeRole', 'SUPPLIER');
        try {
          const sUser = JSON.parse(supplierUserRaw);
          if (sUser?.approvalStatus !== 'APPROVED') {
            return 'SellerPendingApprovalScreen';
          }
        } catch (_) {}
        return 'RiderHomeScreen';
      }
    } catch (e) {
      console.warn('[SplashScreen] Role resolution error:', e);
    }
    return 'RoleSelection';
  };

  // Automatic navigation to active role / RoleSelection
  useEffect(() => {
    let isMounted = true;
    if (!isLoading && navigation) {
      const timer = setTimeout(async () => {
        if (!isMounted) return;
        const targetScreen = await resolveNextScreen();
        navigation.replace(targetScreen);
      }, displayDurationMs);
      return () => {
        isMounted = false;
        clearTimeout(timer);
      };
    }
  }, [isLoading, navigation, displayDurationMs]);

  const handleSkip = async () => {
    if (navigation) {
      const targetScreen = await resolveNextScreen();
      navigation.replace(targetScreen);
    }
  };

  const [imageLoadError, setImageLoadError] = useState(false);

  const uploadedSplashUri = React.useMemo(() => {
    const raw = resolveImageUrl(config.splashImage);
    if (!raw) return null;
    return raw.includes('?') ? raw : `${raw}?v=${Date.now()}`;
  }, [config.splashImage]);

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={handleSkip}
      style={[styles.container, config.backgroundColor ? { backgroundColor: config.backgroundColor } : null]}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor={config.backgroundColor || '#0066FF'}
        translucent
      />

      {/* TOP FLOATING ANIMATED DYNAMIC ADDRESS BAR (100% Transparent Background, Larger Word-by-Word Text Animation) */}
      <Animated.View
        style={[
          styles.addressTopContainer,
          {
            opacity: addressFade,
            transform: [{ translateY: addressSlide }, { scale: addressScale }],
          },
        ]}
      >
        <View style={styles.addressPillTransparent}>
          {/* Animated Location Radar Dot & Bouncing Pin */}
          <View style={styles.pinWrap}>
            <Animated.View
              style={[
                styles.radarCircle,
                {
                  transform: [{ scale: pulseRing }],
                  opacity: pulseRingOpacity,
                },
              ]}
            />
            <Animated.Text
              style={[
                styles.addressPinIcon,
                { transform: [{ translateY: pinBounce }] },
              ]}
            >
              📍
            </Animated.Text>
          </View>

          <View style={styles.addressTextContent}>
            <Text style={styles.addressDeliverToLabel}>DELIVERING TO</Text>
            {/* Word-by-Word Animated Larger Text */}
            <WordAnimatedAddress fullText={realAddress} />
          </View>
        </View>
      </Animated.View>

      {/* Render Admin-Uploaded Splash Image with Zero-Cut, 100% Auto-Adjust for All Devices */}
      <View style={styles.splashWrap}>
        <Image
          source={splash}
          style={styles.containedSplashImage}
          resizeMode="contain"
        />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#01299a',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  addressTopContainer: {
    position: 'absolute',
    top: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 14 : 54,
    left: 14,
    right: 14,
    alignItems: 'center',
    zIndex: 9999,
  },
  // 100% Transparent Background (No black box) with subtle drop shadow for crisp readability
  addressPillTransparent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingVertical: 4,
    paddingHorizontal: 8,
    maxWidth: '100%',
  },
  pinWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    position: 'relative',
  },
  radarCircle: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#38BDF8',
  },
  addressPinIcon: {
    fontSize: 20,
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  addressTextContent: {
    flex: 1,
  },
  addressDeliverToLabel: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#38BDF8',
    letterSpacing: 1.2,
    marginBottom: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 3,
  },
  wordsRowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  // Larger Text Size (15px) with strong contrast drop-shadow
  addressWordText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.85)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
  splashWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#01299a',
  },
  containedSplashImage: {
    width: '100%',
    height: '100%',
    alignSelf: 'center',
  },
  brandedFallbackContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  brandLogoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  brandEmoji: {
    fontSize: 42,
  },
  brandNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandPrimaryText: {
    fontSize: 38,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.2,
  },
  brandSecondaryText: {
    fontSize: 38,
    fontWeight: '900',
    color: '#FACC15',
    letterSpacing: 1.2,
  },
  brandTaglineText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.85)',
    letterSpacing: 2,
    marginTop: 6,
  },
});

export default SplashScreen;
