import React, { useState, useRef, useEffect, useContext, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Image,
  ScrollView,
  Animated,
  Dimensions,
  Easing,
  ActivityIndicator,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import { AuthContext } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import api from '../services/api';
import { LOCAL_URL, BASE_URL } from '../config/apiConfig';
import { rideStore } from '../services/rideStore';

const { width, height } = Dimensions.get('window');

const RoleSelectionScreen = ({ navigation }: any) => {
  const { user, updateUser } = useContext(AuthContext);
  const { isDark } = useTheme();

  // Auto-Play Intro Video (Ultra-Fast Progressive Playback)
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const webViewRef = useRef<any>(null);

  const cleanHost = (LOCAL_URL || BASE_URL.replace(/\/api\/?$/, '')).replace(/\/+$/, '');
  const posterUrl = `${cleanHost}/uploads/bhopal_lake_hero.jpg`;

  // Pause video on screen blur / navigate away to free GPU/CPU; Resume on focus
  useFocusEffect(
    useCallback(() => {
      webViewRef.current?.injectJavaScript(`
        (function() {
          var v = document.getElementById('roleVideo');
          if (v) { v.play().catch(function(){}); }
        })();
        true;
      `);
      return () => {
        webViewRef.current?.injectJavaScript(`
          (function() {
            var v = document.getElementById('roleVideo');
            if (v) { v.pause(); }
          })();
          true;
        `);
      };
    }, [])
  );

  const videoHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body {
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: transparent;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          video {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
          }
        </style>
      </head>
      <body>
        <video
          id="roleVideo"
          autoplay
          loop
          muted
          playsinline
          webkit-playsinline
          preload="auto"
          poster="${posterUrl}"
        >
          <source src="${cleanHost}/uploads/video.mp4?v=pure2" type="video/mp4" />
          <source src="http://127.0.0.1:5000/uploads/video.mp4?v=pure2" type="video/mp4" />
          <source src="${cleanHost}/uploads/vedio.mp4?v=pure2" type="video/mp4" />
          <source src="http://127.0.0.1:5000/uploads/vedio.mp4?v=pure2" type="video/mp4" />
          <source src="http://10.166.80.3:5000/uploads/video.mp4?v=pure2" type="video/mp4" />
          <source src="http://10.166.80.3:5000/uploads/vedio.mp4?v=pure2" type="video/mp4" />
        </video>
        <script>
          var v = document.getElementById('roleVideo');
          var notified = false;
          function notifyReady() {
            if (!notified && window.ReactNativeWebView) {
              notified = true;
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'VIDEO_PLAYING' }));
            }
          }
          v.addEventListener('playing', notifyReady);
          v.addEventListener('timeupdate', function() {
            if (v.currentTime > 0) notifyReady();
          });
          v.addEventListener('canplay', function() {
            v.muted = true;
            var p = v.play();
            if (p !== undefined) {
              p.then(notifyReady).catch(function() {
                v.muted = true;
                v.play().catch(function(){});
              });
            }
          });
          v.addEventListener('canplaythrough', function() {
            v.muted = true;
            v.play().catch(function(){});
          });
          v.addEventListener('error', function() {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'VIDEO_ERROR',
                error: v.error ? (v.error.code + ': ' + v.error.message) : 'unknown',
                currentSrc: v.currentSrc
              }));
            }
          }, true);

          // Immediate start with muted state guaranteed
          v.muted = true;
          var p0 = v.play();
          if (p0 !== undefined) {
            p0.then(notifyReady).catch(function(){});
          }
        </script>
      </body>
    </html>
  `;

  // Entrance Animations: Staggered side-slide for 3 roles
  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-20)).current;

  const card1Slide = useRef(new Animated.Value(-70)).current;
  const card1Fade = useRef(new Animated.Value(0)).current;

  const card2Slide = useRef(new Animated.Value(70)).current;
  const card2Fade = useRef(new Animated.Value(0)).current;

  const card3Slide = useRef(new Animated.Value(-70)).current;
  const card3Fade = useRef(new Animated.Value(0)).current;

  const footerFade = useRef(new Animated.Value(0)).current;

  // Press Scale feedback
  const customerScale = useRef(new Animated.Value(1)).current;
  const deliveryScale = useRef(new Animated.Value(1)).current;
  const supplierScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Header animates in first
    Animated.parallel([
      Animated.timing(headerFade, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(headerSlide, {
        toValue: 0,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // 3 Role Cards slide in smoothly with slow staggered timing
    Animated.stagger(150, [
      Animated.parallel([
        Animated.timing(card1Slide, {
          toValue: 0,
          duration: 550,
          easing: Easing.out(Easing.back(1.1)),
          useNativeDriver: true,
        }),
        Animated.timing(card1Fade, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(card2Slide, {
          toValue: 0,
          duration: 550,
          easing: Easing.out(Easing.back(1.1)),
          useNativeDriver: true,
        }),
        Animated.timing(card2Fade, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(card3Slide, {
          toValue: 0,
          duration: 550,
          easing: Easing.out(Easing.back(1.1)),
          useNativeDriver: true,
        }),
        Animated.timing(card3Fade, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      Animated.timing(footerFade, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    });
  }, []);

  // Clear stale local ride cache on RoleSelection screen mount
  useEffect(() => {
    try {
      rideStore.clearRide();
    } catch (err) {}
  }, []);

  const handlePressIn = (role: 'customer' | 'delivery' | 'supplier') => {
    const scale =
      role === 'customer'
        ? customerScale
        : role === 'delivery'
        ? deliveryScale
        : supplierScale;

    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = (role: 'customer' | 'delivery' | 'supplier') => {
    const scale =
      role === 'customer'
        ? customerScale
        : role === 'delivery'
        ? deliveryScale
        : supplierScale;

    Animated.spring(scale, {
      toValue: 1,
      friction: 4,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  const [hasCustSession, setHasCustSession] = useState(false);
  const [hasSuppSession, setHasSuppSession] = useState(false);
  const [hasDeliverySession, setHasDeliverySession] = useState(false);

  const checkSessions = async () => {
    try {
      const custToken = await AsyncStorage.getItem('customerToken');
      const custUser = await AsyncStorage.getItem('customerUser');
      const suppToken = await AsyncStorage.getItem('supplierToken');
      const suppUser = await AsyncStorage.getItem('supplierUser');
      const delivToken = await AsyncStorage.getItem('deliveryToken');
      const delivUser = await AsyncStorage.getItem('deliveryUser');
      setHasCustSession(Boolean(custToken && custUser));
      setHasSuppSession(Boolean(suppToken && suppUser));
      setHasDeliverySession(Boolean(delivToken && delivUser));
    } catch (e) {}
  };

  useEffect(() => {
    checkSessions();
    const unsub = navigation.addListener('focus', () => {
      checkSessions();
    });
    return unsub;
  }, [navigation]);

  const handleContinueAsCustomer = async () => {
    try {
      const custToken = await AsyncStorage.getItem('customerToken');
      const custUserStr = await AsyncStorage.getItem('customerUser');
      if (custToken && custUserStr) {
        try {
          const parsed = JSON.parse(custUserStr);
          if (parsed) {
            await AsyncStorage.setItem('userToken', custToken);
            await AsyncStorage.setItem('activeRole', 'CUSTOMER');
            updateUser(parsed);
            navigation.navigate('CustomerHomeScreen');
            return;
          }
        } catch (e) {}
      }
    } catch (e) {}
    navigation.navigate('CustomerLogin');
  };

  const handleContinueAsDeliveryPartner = async () => {
    try {
      const delivToken = await AsyncStorage.getItem('deliveryToken');
      const delivUserStr = await AsyncStorage.getItem('deliveryUser');
      if (delivToken && delivUserStr) {
        try {
          const parsed = JSON.parse(delivUserStr);
          if (parsed) {
            await AsyncStorage.setItem('userToken', delivToken);
            await AsyncStorage.setItem('activeRole', 'DELIVERY');
            updateUser(parsed);
            navigation.navigate('DeliveryRiderHomeScreen', { riderName: parsed?.name, riderId: parsed?._id || parsed?.id });
            return;
          }
        } catch (e) {}
      }
    } catch (e) {}
    navigation.navigate('DeliveryRegistration', { initialMode: 'login' });
  };

  const handleContinueAsSupplier = async () => {
    try {
      const suppToken = await AsyncStorage.getItem('supplierToken');
      const suppUserStr = await AsyncStorage.getItem('supplierUser');
      if (suppToken && suppUserStr) {
        try {
          const parsed = JSON.parse(suppUserStr);
          if (parsed) {
            const appStatus = parsed.approvalStatus || 'APPROVED';
            if (appStatus === 'REJECTED') {
              Alert.alert('Account Rejected', 'Your store application has been rejected by Admin. Please contact partner support.');
              return;
            }
            if (appStatus === 'PENDING') {
              navigation.navigate('SellerPendingApprovalScreen', {
                user: parsed,
                userId: parsed._id || parsed.id,
              });
              return;
            }

            await AsyncStorage.setItem('userToken', suppToken);
            await AsyncStorage.setItem('activeRole', 'SUPPLIER');
            updateUser(parsed);
            navigation.navigate('RiderHomeScreen', {
              riderName: parsed.name || parsed.restaurantName || 'Supplier Partner',
              riderId: parsed._id || parsed.id,
            });
            return;
          }
        } catch (e) {}
      }
    } catch (e) {}
    navigation.navigate('RiderRegistration', { initialMode: 'login' });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden={false} barStyle="light-content" backgroundColor="#0066FF" />

      {/* Blue Top Background Accent */}
      <View style={styles.topCurvedBg} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Top Auto-Play Video Banner */}
        <Animated.View
          style={[
            styles.videoBannerWrapper,
            {
              opacity: headerFade,
              transform: [{ translateY: headerSlide }],
            }
          ]}
        >
          <View style={styles.videoCardContainer}>
            {/* Native Instant Thumbnail Poster while WebView boots (Zero delay visual) */}
            <Image
              source={require('../assets/bhopal_lake_hero.jpg')}
              style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
              resizeMode="cover"
            />
            <WebView
              ref={webViewRef}
              originWhitelist={['*']}
              source={{ html: videoHtml, baseUrl: cleanHost }}
              style={[styles.videoWebView, { opacity: isVideoReady ? 1 : 0 }]}
              allowsInlineMediaPlayback={true}
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              cacheEnabled={true}
              scrollEnabled={false}
              androidHardwareAccelerationDisabled={false}
              androidLayerType="hardware"
              renderToHardwareTextureAndroid={true}
              mixedContentMode="always"
              onMessage={(event) => {
                try {
                  const data = JSON.parse(event.nativeEvent.data);
                  if (data.type === 'VIDEO_PLAYING') {
                    console.log('🎬 [RoleSelectionScreen] VIDEO_PLAYING event received! Ultra-fast video is playing smoothly!');
                    setIsVideoReady(true);
                  } else if (data.type === 'VIDEO_ERROR') {
                    console.log('RoleSelectionScreen Video Notice:', data.error, data.currentSrc);
                  }
                } catch (e) {}
              }}
            />
            <TouchableOpacity
              style={styles.videoAudioBtn}
              onPress={() => {
                const nextMuted = !isVideoMuted;
                setIsVideoMuted(nextMuted);
                webViewRef.current?.injectJavaScript(`
                  (function() {
                    var v = document.getElementById('roleVideo');
                    if (v) {
                      v.muted = ${nextMuted};
                      v.volume = ${nextMuted ? 0 : 1.0};
                      v.play();
                    }
                  })();
                  true;
                `);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.videoAudioBtnText}>{isVideoMuted ? '🔇 Unmute' : '🔊 Sound On'}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* 2. Header Section (Title & Subtitle with cyan accent) */}
        <Animated.View
          style={[
            styles.headerSection,
            {
              opacity: headerFade,
              transform: [{ translateY: headerSlide }],
            },
          ]}
        >
          <Text style={styles.mainTitle}>
            Welcome to <Text style={styles.mainTitleAccent}>Ride Hub</Text>
          </Text>
          <Text style={styles.subtitle}>Select your role to continue</Text>
        </Animated.View>

        {/* 3 Role Selection Cards with Staggered Side-Slide */}
        <View style={styles.cardsColumn}>
          {/* 1. Customer */}
          <Animated.View
            style={[
              styles.cardWrapper,
              {
                opacity: card1Fade,
                transform: [{ translateX: card1Slide }],
              },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.92}
              onPressIn={() => handlePressIn('customer')}
              onPressOut={() => handlePressOut('customer')}
              onPress={handleContinueAsCustomer}
            >
              <Animated.View style={[styles.card, { transform: [{ scale: customerScale }] }]}>
                <View style={styles.cardIconBg}>
                  <Image
                    source={require('../banner/customer.png')}
                    style={styles.cardIconImg}
                    resizeMode="contain"
                  />
                </View>

                <View style={styles.cardContent}>
                  <View style={styles.badgeRow}>
                    <View style={styles.rolePill}>
                      <Text style={styles.rolePillText}>BUYER & USER</Text>
                    </View>
                  </View>
                  <Text style={styles.cardTitle}>Customer</Text>
                  <Text style={styles.categoryTags}>
                    🍴 Food   |   🛒 Groceries   |   🚗 Rides
                  </Text>
                  <Text style={styles.cardSubtext} numberOfLines={1}>
                    Order • Book • Fast Delivery • Live Tracking
                  </Text>
                </View>

                <View style={styles.arrowBg}>
                  <Text style={styles.arrowIcon}>›</Text>
                </View>
              </Animated.View>
            </TouchableOpacity>
          </Animated.View>

          {/* 2. Rider / Delivery Partner */}
          <Animated.View
            style={[
              styles.cardWrapper,
              {
                opacity: card2Fade,
                transform: [{ translateX: card2Slide }],
              },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.92}
              onPressIn={() => handlePressIn('delivery')}
              onPressOut={() => handlePressOut('delivery')}
              onPress={handleContinueAsDeliveryPartner}
            >
              <Animated.View style={[styles.card, { transform: [{ scale: deliveryScale }] }]}>
                <View style={styles.cardIconBg}>
                  <Image
                    source={require('../banner/rider.png')}
                    style={styles.cardIconImg}
                    resizeMode="contain"
                  />
                </View>

                <View style={styles.cardContent}>
                  <View style={styles.badgeRow}>
                    <View style={styles.rolePill}>
                      <Text style={styles.rolePillText}>RIDER & FLEET</Text>
                    </View>
                  </View>
                  <Text style={styles.cardTitle}>Rider / Delivery Partner</Text>
                  <Text style={styles.categoryTags}>
                    🛵 Bike & EV   |   📦 Parcel   |   💰 Earn Daily
                  </Text>
                  <Text style={styles.cardSubtext} numberOfLines={1}>
                    Deliver customer orders & earn per delivery
                  </Text>
                </View>

                <View style={styles.arrowBg}>
                  <Text style={styles.arrowIcon}>›</Text>
                </View>
              </Animated.View>
            </TouchableOpacity>
          </Animated.View>

          {/* 3. Restaurant / Supplier / Store */}
          <Animated.View
            style={[
              styles.cardWrapper,
              {
                opacity: card3Fade,
                transform: [{ translateX: card3Slide }],
              },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.92}
              onPressIn={() => handlePressIn('supplier')}
              onPressOut={() => handlePressOut('supplier')}
              onPress={handleContinueAsSupplier}
            >
              <Animated.View style={[styles.card, { transform: [{ scale: supplierScale }] }]}>
                <View style={styles.cardIconBg}>
                  <Image
                    source={require('../banner/l.png')}
                    style={styles.cardIconImg}
                    resizeMode="contain"
                  />
                </View>

                <View style={styles.cardContent}>
                  <View style={styles.badgeRow}>
                    <View style={styles.rolePill}>
                      <Text style={styles.rolePillText}>MERCHANT & STORE</Text>
                    </View>
                  </View>
                  <Text style={styles.cardTitle}>Restaurant / Supplier / Store</Text>
                  <Text style={styles.categoryTags}>
                    🍴 Food   |   🥦 Sabji   |   🛒 Grocery   |   📦 Stores
                  </Text>
                  <Text style={styles.cardSubtext} numberOfLines={1}>
                    List Your Store • Manage Orders • Grow Business
                  </Text>
                </View>

                <View style={styles.arrowBg}>
                  <Text style={styles.arrowIcon}>›</Text>
                </View>
              </Animated.View>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Footer */}
        <Animated.View style={[styles.footerContainer, { opacity: footerFade }]}>
          <View style={styles.madeInIndiaBadge}>
            <Text style={styles.footerFlag}>🇮🇳</Text>
            <Text style={styles.footerText}>PROUDLY MADE IN INDIA</Text>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  cardFaceLoginPill: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginLeft: 6,
  },
  cardFaceLoginPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#16A34A',
    letterSpacing: 0.3,
  },
  container: {
    flex: 1,
    backgroundColor: '#F0F6FF',
  },
  topCurvedBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 320,
    backgroundColor: '#0066FF',
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 36,
    alignItems: 'center',
  },
  headerSection: {
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 14,
    width: '100%',
  },
  mainTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 3,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  mainTitleAccent: {
    color: '#00E5FF',
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.92)',
    fontWeight: '600',
    textAlign: 'center',
  },
  cardsColumn: {
    width: '100%',
    gap: 14,
    marginTop: 4,
  },
  cardWrapper: {
    width: '100%',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardIconBg: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  cardIconImg: {
    width: 58,
    height: 58,
  },
  cardContent: {
    flex: 1,
    paddingRight: 28,
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  rolePill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  rolePillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#0066FF',
    letterSpacing: 0.5,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 22,
    marginTop: 1,
  },
  categoryTags: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    marginTop: 3,
  },
  cardSubtext: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    lineHeight: 15,
    marginTop: 3,
  },
  arrowBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0066FF',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    right: 12,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  arrowIcon: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginTop: -2,
    marginLeft: 1,
  },
  footerContainer: {
    marginTop: 22,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  madeInIndiaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: '#0066FF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    gap: 8,
  },
  footerFlag: {
    fontSize: 18,
  },
  footerText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  videoBannerWrapper: {
    width: '100%',
    marginTop: 35,
    marginBottom: 8,
    alignItems: 'center',
  },
  videoCardContainer: {
    width: width - 28,
    height: 195,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000000',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  videoWebView: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  videoBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  videoLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#22C55E',
  },
  videoBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  videoAudioBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  videoAudioBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});

export default RoleSelectionScreen;
