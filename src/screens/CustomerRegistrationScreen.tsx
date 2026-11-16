import React, { useState, useContext, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Image,
  ImageBackground,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthContext } from '../context/AuthContext';
import { ThemeContext } from '../context/ThemeContext';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';
import Icon from '../components/PngIcon';
import { fetchCurrentGpsPosition, reverseGeocodeCoords } from '../services/LocationAddressService';
import HindiTermsModal from '../components/HindiTermsModal';
import { LottieAnimation } from '../components/LottieAnimation';
import { resolveUploadUrl } from '../config/apiConfig';

const { width, height } = Dimensions.get('window');

const CITY_HERO_BG = 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=1200&auto=format&fit=crop&q=80';

export default function CustomerRegistrationScreen({ route, navigation }: any) {
  const { login } = useContext(AuthContext);
  const { theme } = useContext(ThemeContext);

  let socket: any = null;
  try {
    const sockCtx = useSocket();
    socket = sockCtx?.socket;
  } catch (_) {}

  const initialMode = route?.params?.initialMode;
  const [isLogin, setIsLogin] = useState(initialMode !== 'signup');

  // Input fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [usePasswordLogin, setUsePasswordLogin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Address & Location fields
  const [fullAddress, setFullAddress] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [detectingGps, setDetectingGps] = useState(false);

  // OTP Authentication State
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpTimer, setOtpTimer] = useState(0);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [verificationToken, setVerificationToken] = useState('');

  // Terms Modal State
  const [termsModalVisible, setTermsModalVisible] = useState<boolean>(false);
  const [agreedToTerms, setAgreedToTerms] = useState<boolean>(true);

  // General Loading State
  const [loading, setLoading] = useState(false);

  // Dynamic Media & Animations from Admin Panel (CUSTOMER_SIGNUP)
  const [signupMedia, setSignupMedia] = useState<any>(null);

  // Dynamic Categories from Backend & Continuous Auto-Slide
  const [categoriesList, setCategoriesList] = useState<any[]>([]);
  const catScrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef<number>(0);

  const DEFAULT_FALLBACK_CATS = [
    { id: 'food', name: 'Food', icon: '🍔', bg: '#FFEDD5' },
    { id: 'grocery', name: 'Grocery', icon: '🧺', bg: '#DCFCE7' },
    { id: 'fashion', name: 'Fashion', icon: '👕', bg: '#EDE9FE' },
    { id: 'beauty', name: 'Beauty', icon: '💄', bg: '#FCE7F3' },
    { id: 'kirana', name: 'Kirana', icon: '🏪', bg: '#FEF3C7' },
    { id: 'fast_delivery', name: 'Fast Delivery', icon: '🛵', bg: '#E0F2FE' },
  ];

  // Fetch CUSTOMER_SIGNUP media from Admin + Live Socket Listener
  useEffect(() => {
    let mounted = true;
    const fetchMedia = () => {
      api.get('/screen-media/CUSTOMER_SIGNUP')
        .then((res) => {
          if (!mounted) return;
          if (res.data?.success && res.data?.screen) {
            setSignupMedia(res.data.screen);
          }
        })
        .catch(() => {});
    };
    fetchMedia();

    if (socket) {
      const handleMediaUpdate = (data: any) => {
        if (!mounted || !data) return;
        const sid = String(data.screenId || '').toUpperCase();
        if (sid === 'CUSTOMER_SIGNUP' || sid === 'CUSTOMER_LOGIN') {
          setSignupMedia(data);
        }
      };
      socket.on('screen_media_updated', handleMediaUpdate);
      socket.on('screen_media_customer_signup', handleMediaUpdate);
      return () => {
        mounted = false;
        socket.off('screen_media_updated', handleMediaUpdate);
        socket.off('screen_media_customer_signup', handleMediaUpdate);
      };
    }
    return () => { mounted = false; };
  }, [socket]);

  // Fetch real categories from Backend /api/categories
  useEffect(() => {
    let mounted = true;
    api.get('/categories')
      .then((res) => {
        if (!mounted) return;
        const raw = res.data?.categories || (Array.isArray(res.data) ? res.data : []);
        if (raw && raw.length > 0) {
          // Strict: ONLY categories with genuine uploaded images (No dummy categories)
          const formatted = raw
            .filter((c: any) => c.isActive !== false && c.image && typeof c.image === 'string' && c.image.trim() !== '')
            .map((c: any) => ({
              id: c._id || c.id,
              name: c.name ? c.name.charAt(0).toUpperCase() + c.name.slice(1) : 'Item',
              image: c.image ? resolveUploadUrl(c.image) : null,
              icon:
                c.name?.toLowerCase().includes('food') ? '🍔' :
                c.name?.toLowerCase().includes('groc') ? '🧺' :
                c.name?.toLowerCase().includes('fash') ? '👕' :
                c.name?.toLowerCase().includes('veg') ? '🥦' :
                c.name?.toLowerCase().includes('beaut') ? '💄' :
                c.name?.toLowerCase().includes('kiran') ? '🏪' : '🛍️',
              bg: c.bgColor || '#F1F5F9',
            }));
          setCategoriesList(formatted);
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  // Smooth Auto-Slide Categories Carousel
  useEffect(() => {
    const list = categoriesList.length > 0 ? categoriesList : DEFAULT_FALLBACK_CATS;
    if (list.length <= 1) return;

    const interval = setInterval(() => {
      if (!catScrollRef.current) return;
      const cardStep = 82;
      const maxScroll = list.length * cardStep - (width - 40);
      let nextOffset = scrollOffsetRef.current + cardStep;
      if (nextOffset > Math.max(0, maxScroll + 30)) {
        nextOffset = 0;
      }
      scrollOffsetRef.current = nextOffset;
      catScrollRef.current.scrollTo({ x: nextOffset, animated: true });
    }, 2200);

    return () => clearInterval(interval);
  }, [categoriesList]);

  useEffect(() => {
    if (route?.params?.initialMode === 'signup') {
      setIsLogin(false);
      setOtpSent(false);
      setOtp('');
    } else if (route?.params?.initialMode === 'login') {
      setIsLogin(true);
      setOtpSent(false);
      setOtp('');
    }
  }, [route?.params?.initialMode]);

  // Resend Timer Countdown
  useEffect(() => {
    let interval: any = null;
    if (otpTimer > 0) {
      interval = setInterval(() => {
        setOtpTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [otpTimer]);

  // Check persistent session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const custToken = (await AsyncStorage.getItem('customerToken')) || (await AsyncStorage.getItem('userToken'));
        const custUserStr = await AsyncStorage.getItem('customerUser');
        const activeRole = await AsyncStorage.getItem('activeRole');
        if (custToken && activeRole === 'CUSTOMER') {
          navigation.replace('CustomerHomeScreen');
        }
      } catch (e) {}
    };
    checkSession();
  }, []);

  const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);

  // 1-Tap Real-Time GPS Detection & Reverse Geocoding
  const handleDetectGps = async () => {
    try {
      setDetectingGps(true);
      const pos = await fetchCurrentGpsPosition(false);
      if (pos) {
        setLatitude(pos.latitude);
        setLongitude(pos.longitude);
        const geo = await reverseGeocodeCoords(pos.latitude, pos.longitude);
        if (geo) {
          const formatted = geo.fullAddress || `${geo.area}, ${geo.city}`;
          setFullAddress(formatted);
          setCity(geo.city || 'Bhopal');
          setArea(geo.area || '');
          Alert.alert(
            'Location Detected ✅',
            `Area: ${geo.area || geo.city}\nAddress: ${formatted}\n\nAddress has been auto-filled!`
          );
        }
      } else {
        Alert.alert('GPS Notice', 'Could not detect device GPS. You can manually enter your address.');
      }
    } catch (e) {
      Alert.alert('GPS Notice', 'Unable to detect device GPS. You can manually enter your address.');
    } finally {
      setDetectingGps(false);
    }
  };

  // Send OTP to Mobile Number
  const handleSendOtp = async (purposeOverride?: 'login' | 'signup') => {
    if (!cleanPhone || cleanPhone.length !== 10) {
      Alert.alert('Invalid Mobile', 'Please enter a valid 10-digit mobile number.');
      return;
    }

    const purpose = purposeOverride || (isLogin ? 'login' : 'signup');

    if (purpose === 'signup') {
      if (!fullName.trim()) {
        Alert.alert('Required Field', 'Please enter your Full Name.');
        return;
      }
      if (!fullAddress.trim() && !latitude) {
        Alert.alert('Required Field', 'Please enter your Delivery Address or auto-detect GPS location.');
        return;
      }
      if (!agreedToTerms) {
        Alert.alert('Terms Agreement Required', 'Please accept Ride Hub Terms & Conditions to proceed.');
        return;
      }
    }

    try {
      setSendingOtp(true);
      const res = await api.post('/auth/otp/send', {
        phoneNumber: cleanPhone,
        purpose,
        role: 'customer',
      });

      if (res.data.success) {
        setOtpSent(true);
        setOtpTimer(45);
        Alert.alert('OTP Sent 📲', `A 6-digit verification code has been sent to +91 ${cleanPhone}.`);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to send OTP. Please try again.';
      if (err.response?.data?.notFound && isLogin) {
        Alert.alert('Account Not Found', 'No customer account found with this number. Please Sign Up to continue.', [
          {
            text: 'Sign Up',
            onPress: () => {
              setIsLogin(false);
              setOtpSent(false);
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ]);
      } else if (err.response?.data?.alreadyRegistered && !isLogin) {
        Alert.alert('Already Registered', 'This mobile number is already registered. Please Login.', [
          {
            text: 'Login',
            onPress: () => {
              setIsLogin(true);
              setOtpSent(false);
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ]);
      } else {
        Alert.alert('Notice', msg);
      }
    } finally {
      setSendingOtp(false);
    }
  };

  // Verify OTP and Login
  const handleVerifyOtpLogin = async () => {
    const cleanOtp = otp.trim();
    if (!cleanOtp || cleanOtp.length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter the 6-digit OTP sent to your phone.');
      return;
    }

    try {
      setVerifyingOtp(true);
      const res = await api.post('/auth/otp/login', {
        phoneNumber: cleanPhone,
        otp: cleanOtp,
        role: 'customer',
      });

      if (res.data.success) {
        const { token, refreshToken, user } = res.data;

        await AsyncStorage.setItem('customerToken', token);
        await AsyncStorage.setItem('registeredCustomerId', user._id || user.id);
        await AsyncStorage.setItem('registeredCustomerName', user.name || user.username || 'Customer');
        await AsyncStorage.setItem('customerUser', JSON.stringify(user));
        await AsyncStorage.setItem('activeRole', 'CUSTOMER');
        await AsyncStorage.setItem('userToken', token);
        if (refreshToken) {
          await AsyncStorage.setItem('refreshToken', refreshToken);
        }

        await login(token, refreshToken || '', user);
        Alert.alert('Welcome Back! 🎉', `Logged in as ${user.name || 'Customer'}`);
        navigation.replace('CustomerHomeScreen');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Invalid or expired OTP. Please try again.';
      Alert.alert('Verification Failed', msg);
    } finally {
      setVerifyingOtp(false);
    }
  };

  // Verify OTP and Complete Registration
  const handleVerifyOtpRegister = async () => {
    const cleanOtp = otp.trim();
    if (!cleanOtp || cleanOtp.length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter the 6-digit OTP sent to your phone.');
      return;
    }

    const cleanName = fullName.trim();
    const cleanAddr = fullAddress.trim();

    try {
      setVerifyingOtp(true);

      // Step 1: Verify OTP
      const verifyRes = await api.post('/auth/otp/verify', {
        phoneNumber: cleanPhone,
        otp: cleanOtp,
        purpose: 'signup',
        role: 'customer',
      });

      if (!verifyRes.data.success) {
        Alert.alert('Verification Failed', verifyRes.data.message || 'Incorrect OTP');
        return;
      }

      // Step 2: Register User in Database
      let sendLat = latitude;
      let sendLon = longitude;
      if (!sendLat || !sendLon) {
        const freshGps = await fetchCurrentGpsPosition(false);
        if (freshGps?.latitude && freshGps?.longitude) {
          sendLat = freshGps.latitude;
          sendLon = freshGps.longitude;
        }
      }

      const regRes = await api.post('/auth/register', {
        name: cleanName,
        phoneNumber: cleanPhone,
        role: 'customer',
        fullAddress: cleanAddr,
        city: city || 'Bhopal',
        area: area || '',
        latitude: sendLat || null,
        longitude: sendLon || null,
        termsConsent: {
          accepted: true,
          version: '1.0',
          signedName: cleanName,
          acceptedAt: new Date(),
        },
      });

      if (regRes.data.success) {
        const { token, refreshToken, user } = regRes.data;

        await AsyncStorage.setItem('customerToken', token);
        await AsyncStorage.setItem('registeredCustomerId', user._id || user.id);
        await AsyncStorage.setItem('registeredCustomerName', user.name || user.username || cleanName);
        await AsyncStorage.setItem('customerUser', JSON.stringify(user));
        await AsyncStorage.setItem('activeRole', 'CUSTOMER');
        await AsyncStorage.setItem('userToken', token);
        if (refreshToken) {
          await AsyncStorage.setItem('refreshToken', refreshToken);
        }

        await login(token, refreshToken || '', user);
        Alert.alert('Welcome to Ride Hub! 🎉', 'Your customer account has been created successfully!');
        navigation.replace('CustomerHomeScreen');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Registration failed. Please try again.';
      Alert.alert('Registration Error', msg);
    } finally {
      setVerifyingOtp(false);
    }
  };

  // Fallback Password Login
  const handlePasswordLogin = async () => {
    if (!cleanPhone || cleanPhone.length !== 10) {
      Alert.alert('Invalid Number', 'Please enter a valid 10-digit mobile number.');
      return;
    }
    const cleanPwd = password.trim();
    if (!cleanPwd) {
      Alert.alert('Password Required', 'Please enter your password.');
      return;
    }

    try {
      setLoading(true);
      const res = await api.post('/auth/login', {
        phoneNumber: cleanPhone,
        password: cleanPwd,
        role: 'customer',
      });

      if (res.data.success) {
        const { token, refreshToken, user } = res.data;

        await AsyncStorage.setItem('customerToken', token);
        await AsyncStorage.setItem('registeredCustomerId', user._id || user.id);
        await AsyncStorage.setItem('registeredCustomerName', user.name || user.username || 'Customer');
        await AsyncStorage.setItem('customerUser', JSON.stringify(user));
        await AsyncStorage.setItem('activeRole', 'CUSTOMER');
        await AsyncStorage.setItem('userToken', token);
        if (refreshToken) {
          await AsyncStorage.setItem('refreshToken', refreshToken);
        }

        await login(token, refreshToken || '', user);
        navigation.replace('CustomerHomeScreen');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Login failed. Please check your mobile number and password.';
      Alert.alert('Login Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden={false} barStyle="light-content" backgroundColor="#0066FF" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          bounces={true}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Hero Header with Logo, Bhopal Pill & Admin Animation Card */}
          <View style={styles.topHeaderContainer}>
            <View style={styles.topBarRow}>
              <View style={styles.topLogoWrap}>
                <View style={styles.logoIconRow}>
                  <View style={styles.citySilhouetteBox}>
                    <View style={[styles.buildingBar, { height: 14 }]} />
                    <View style={[styles.buildingBar, { height: 22 }]} />
                    <View style={[styles.buildingBar, { height: 30 }]} />
                    <View style={[styles.buildingBar, { height: 20 }]} />
                    <View style={[styles.buildingBar, { height: 12 }]} />
                  </View>
                  <View style={styles.speedArrowBadge}>
                    <Text style={styles.speedArrowText}>➔</Text>
                  </View>
                </View>
                <Text style={styles.rideHubLogoText}>
                  Ride<Text style={styles.hubLogoText}>Hub</Text>
                </Text>
              </View>
              <View style={styles.bhopalPill}>
                <Text style={styles.bhopalPillText}>📍 Bhopal</Text>
              </View>
            </View>

            {/* Dynamic Screen Media (Admin Configured Lottie / Image or Sleek Placeholder) */}
            {signupMedia && signupMedia.isActive && (signupMedia.lottieUrl || signupMedia.imageUrl || signupMedia.mediaUrl) ? (
              <View style={styles.animationLiveContainer}>
                {signupMedia.lottieUrl ? (
                  <LottieAnimation
                    source={{ uri: resolveUploadUrl(signupMedia.lottieUrl) }}
                    height={130}
                    speed={signupMedia.lottieConfig?.speed || 1.0}
                    loop={signupMedia.lottieConfig?.loop !== false}
                    autoplay={true}
                  />
                ) : (
                  <Image
                    source={{ uri: resolveUploadUrl(signupMedia.imageUrl || signupMedia.mediaUrl) }}
                    style={styles.animationLiveImage}
                    resizeMode="cover"
                  />
                )}
              </View>
            ) : (
              <View style={styles.animationDashedCard}>
                <View style={styles.clapperIconWrap}>
                  <Text style={{ fontSize: 26 }}>🎬</Text>
                </View>
                <Text style={styles.animationDashedTitle}>Add Your Animation Here</Text>
                <Text style={styles.animationDashedSub}>(Lottie / Video / 3D Animation)</Text>
              </View>
            )}
          </View>

          {/* Main Card */}
          <View style={styles.bottomSection}>
            <Text style={styles.headline}>
              India's <Text style={styles.headlineBlue}>#1</Text> Multi Vendor App
            </Text>
            <Text style={styles.subHeadline}>
              Food, Grocery, Fashion, Pharmacy & Fast Delivery
            </Text>

            {/* Horizontal Multi-Vendor Category Strip - Dynamic & Auto-Sliding (Real Images Only) */}
            {categoriesList.length > 0 && (
              <View style={styles.categoriesOuterWrap}>
                <ScrollView
                  ref={catScrollRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.customerCatsRow}
                >
                  {categoriesList.map((c) => (
                    <View key={String(c.id)} style={[styles.customerCatCard, { backgroundColor: c.bg || '#F8FAFC' }]}>
                      {c.image ? (
                        <Image source={{ uri: c.image }} style={styles.customerCatImg} resizeMode="contain" />
                      ) : (
                        <Text style={styles.customerCatIcon}>{c.icon || '🛍️'}</Text>
                      )}
                      <Text style={styles.customerCatName} numberOfLines={1}>{c.name}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Auth Mode Toggle Tabs (Login vs Sign Up) */}
            <View style={styles.tabToggleRow}>
              <TouchableOpacity
                style={[styles.tabToggleBtn, isLogin && styles.tabToggleBtnActive]}
                onPress={() => {
                  setIsLogin(true);
                  setOtpSent(false);
                  setOtp('');
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabToggleText, isLogin && styles.tabToggleTextActive]}>
                  📱 Mobile OTP Login
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabToggleBtn, !isLogin && styles.tabToggleBtnActive]}
                onPress={() => {
                  setIsLogin(false);
                  setOtpSent(false);
                  setOtp('');
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabToggleText, !isLogin && styles.tabToggleTextActive]}>
                  👤 New Sign Up
                </Text>
              </TouchableOpacity>
            </View>

            {isLogin ? (
              /* ── 1. CUSTOMER LOGIN WITH MOBILE OTP ── */
              <View style={styles.authCardContainer}>
                <Text style={styles.formSectionTitle}>Customer Login</Text>
                <Text style={styles.formSectionSub}>
                  Enter your 10-digit mobile number to receive a secure OTP
                </Text>

                {/* Mobile Number Input */}
                <View style={styles.inputContainer}>
                  <View style={styles.countryCodeBox}>
                    <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="10-digit Mobile Number"
                    placeholderTextColor="#9CA3AF"
                    value={phone}
                    onChangeText={(txt) => {
                      setPhone(txt);
                      if (otpSent) setOtpSent(false);
                    }}
                    keyboardType="phone-pad"
                    maxLength={10}
                    editable={!otpSent}
                  />
                  {otpSent && (
                    <TouchableOpacity
                      onPress={() => {
                        setOtpSent(false);
                        setOtp('');
                      }}
                      style={styles.editPhoneBtn}
                    >
                      <Text style={styles.editPhoneBtnText}>Change</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* OTP Input Section if OTP Sent */}
                {otpSent ? (
                  <View style={styles.otpSection}>
                    <Text style={styles.otpInputLabel}>Enter 6-Digit Verification OTP</Text>
                    <TextInput
                      style={styles.otpInput}
                      placeholder="••••••"
                      placeholderTextColor="#CBD5E1"
                      value={otp}
                      onChangeText={setOtp}
                      keyboardType="number-pad"
                      maxLength={6}
                      autoFocus={true}
                    />

                    <View style={styles.resendRow}>
                      {otpTimer > 0 ? (
                        <Text style={styles.timerText}>Resend OTP in {otpTimer}s</Text>
                      ) : (
                        <TouchableOpacity onPress={() => handleSendOtp('login')} disabled={sendingOtp}>
                          <Text style={styles.resendLinkText}>Resend OTP 🔄</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Verify & Login Button */}
                    <TouchableOpacity
                      style={styles.primaryBtn}
                      onPress={handleVerifyOtpLogin}
                      disabled={verifyingOtp}
                      activeOpacity={0.88}
                    >
                      {verifyingOtp ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.primaryBtnText}>Verify OTP & Sign In ➔</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  /* Send OTP Button */
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={() => handleSendOtp('login')}
                    disabled={sendingOtp}
                    activeOpacity={0.88}
                  >
                    {sendingOtp ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Get OTP ➔</Text>
                    )}
                  </TouchableOpacity>
                )}

                {/* Password Login Alternative */}
                {usePasswordLogin ? (
                  <View style={{ marginTop: 16 }}>
                    <View style={styles.inputContainer}>
                      <TextInput
                        style={styles.input}
                        placeholder="Password"
                        placeholderTextColor="#9CA3AF"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                      />
                      <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 10 }}>
                        <Text>{showPassword ? '👁️' : '🔒'}</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      style={[styles.primaryBtn, { marginTop: 8, backgroundColor: '#475569' }]}
                      onPress={handlePasswordLogin}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.primaryBtnText}>Sign In with Password</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : null}

                <TouchableOpacity
                  onPress={() => setUsePasswordLogin(!usePasswordLogin)}
                  style={styles.switchAuthTypeBtn}
                >
                  <Text style={styles.switchAuthTypeText}>
                    {usePasswordLogin ? '← Switch to OTP Login' : 'Login with Password instead'}
                  </Text>
                </TouchableOpacity>

                {/* Switch to Signup */}
                <View style={styles.toggleRow}>
                  <Text style={{ color: '#64748B', fontSize: 14 }}>Don't have an account? </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setIsLogin(false);
                      setOtpSent(false);
                    }}
                  >
                    <Text style={styles.toggleLink}>Register New Account</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              /* ── 2. CUSTOMER SIGN UP WITH OTP ── */
              <View style={styles.authCardContainer}>
                <Text style={styles.formSectionTitle}>Customer Registration</Text>
                <Text style={styles.formSectionSub}>
                  Create your profile to order food, groceries, rides & more
                </Text>

                {/* Full Name Input */}
                <View style={[styles.inputContainer, { marginBottom: 12 }]}>
                  <Icon name="person-outline" size={20} color="#0066FF" style={{ marginLeft: 16, marginRight: 12 }} />
                  <TextInput
                    style={styles.input}
                    placeholder="Full Name *"
                    placeholderTextColor="#9CA3AF"
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                    editable={!otpSent}
                  />
                </View>

                {/* Mobile Number Input */}
                <View style={[styles.inputContainer, { marginBottom: 12 }]}>
                  <View style={styles.countryCodeBox}>
                    <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="10-digit Mobile Number *"
                    placeholderTextColor="#9CA3AF"
                    value={phone}
                    onChangeText={(txt) => {
                      setPhone(txt);
                      if (otpSent) setOtpSent(false);
                    }}
                    keyboardType="phone-pad"
                    maxLength={10}
                    editable={!otpSent}
                  />
                </View>

                {/* Delivery Location & Address (1-Tap GPS Auto-Detect) */}
                <View style={{ marginBottom: 12 }}>
                  <TouchableOpacity
                    style={styles.gpsAutoBtn}
                    onPress={handleDetectGps}
                    disabled={detectingGps || otpSent}
                    activeOpacity={0.8}
                  >
                    {detectingGps ? (
                      <ActivityIndicator size="small" color="#0066FF" />
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 16, marginRight: 6 }}>📍</Text>
                        <Text style={styles.gpsAutoBtnText}>
                          {latitude ? 'Location Detected (Tap to update)' : 'Auto-Detect Delivery Location (GPS)'}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {(area || city) ? (
                    <View style={styles.detectedAreaBanner}>
                      <Text style={styles.detectedAreaText}>
                        {`✓ Detected Area: ${area ? area + ', ' : ''}${city}`}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Full Address Input */}
                <View style={[styles.inputContainer, { marginBottom: 14 }]}>
                  <Icon name="location-outline" size={20} color="#0066FF" style={{ marginLeft: 16, marginRight: 12 }} />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Delivery Address / House No, Street, Landmark *"
                    placeholderTextColor="#9CA3AF"
                    value={fullAddress}
                    onChangeText={setFullAddress}
                    editable={!otpSent}
                  />
                </View>

                {/* Terms Agreement Checkbox */}
                <View style={styles.termsBox}>
                  <TouchableOpacity
                    style={styles.termsCheckRow}
                    activeOpacity={0.8}
                    onPress={() => setAgreedToTerms(!agreedToTerms)}
                  >
                    <View style={[styles.termsBoxCheck, agreedToTerms && styles.termsBoxCheckActive]}>
                      {agreedToTerms && <Text style={styles.termsBoxCheckmark}>✓</Text>}
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.termsBoxText}>
                        I agree to Ride Hub{' '}
                        <Text style={styles.termsBoxLink} onPress={() => setTermsModalVisible(true)}>
                          Terms & Conditions (नियम एवं शर्तें)
                        </Text>
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* OTP Input if sent */}
                {otpSent ? (
                  <View style={styles.otpSection}>
                    <Text style={styles.otpInputLabel}>Enter 6-Digit OTP sent to +91 {cleanPhone}</Text>
                    <TextInput
                      style={styles.otpInput}
                      placeholder="••••••"
                      placeholderTextColor="#CBD5E1"
                      value={otp}
                      onChangeText={setOtp}
                      keyboardType="number-pad"
                      maxLength={6}
                      autoFocus={true}
                    />

                    <View style={styles.resendRow}>
                      {otpTimer > 0 ? (
                        <Text style={styles.timerText}>Resend OTP in {otpTimer}s</Text>
                      ) : (
                        <TouchableOpacity onPress={() => handleSendOtp('signup')} disabled={sendingOtp}>
                          <Text style={styles.resendLinkText}>Resend OTP 🔄</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Verify & Register Button */}
                    <TouchableOpacity
                      style={styles.primaryBtn}
                      onPress={handleVerifyOtpRegister}
                      disabled={verifyingOtp}
                      activeOpacity={0.88}
                    >
                      {verifyingOtp ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.primaryBtnText}>Verify OTP & Create Account ➔</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  /* Send OTP Button */
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={() => handleSendOtp('signup')}
                    disabled={sendingOtp}
                    activeOpacity={0.88}
                  >
                    {sendingOtp ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Send Verification OTP ➔</Text>
                    )}
                  </TouchableOpacity>
                )}

                {/* Toggle to Login */}
                <View style={styles.toggleRow}>
                  <Text style={{ color: '#64748B', fontSize: 14 }}>Already have an account? </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setIsLogin(true);
                      setOtpSent(false);
                    }}
                  >
                    <Text style={styles.toggleLink}>Login with OTP</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Footer */}
            <View style={styles.footerWrap}>
              <Text style={styles.footerNoteText}>
                By continuing, you agree to our{' '}
                <Text style={styles.footerLinkBold} onPress={() => setTermsModalVisible(true)}>Terms</Text>,{' '}
                <Text style={styles.footerLinkBold} onPress={() => setTermsModalVisible(true)}>Privacy Policy</Text> and{' '}
                <Text style={styles.footerLinkBold} onPress={() => setTermsModalVisible(true)}>Content Policy</Text>.
              </Text>
              <View style={styles.footerLinksRow}>
                <TouchableOpacity onPress={() => setTermsModalVisible(true)} activeOpacity={0.7}>
                  <Text style={styles.footerLinkBlue}>Terms of Service</Text>
                </TouchableOpacity>
                <Text style={styles.footerDot}>•</Text>
                <TouchableOpacity onPress={() => setTermsModalVisible(true)} activeOpacity={0.7}>
                  <Text style={styles.footerLinkBlue}>Privacy Policy</Text>
                </TouchableOpacity>
                <Text style={styles.footerDot}>•</Text>
                <TouchableOpacity onPress={() => setTermsModalVisible(true)} activeOpacity={0.7}>
                  <Text style={styles.footerLinkBlue}>Content Policy</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Terms & Conditions Modal */}
      <HindiTermsModal
        visible={termsModalVisible}
        onClose={() => setTermsModalVisible(false)}
        role="customer"
        onAccept={() => {
          setAgreedToTerms(true);
          setTermsModalVisible(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0066FF',
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: '#F8FAFC',
  },
  topHeaderContainer: {
    paddingTop: Platform.OS === 'ios' ? 12 : 24,
    paddingHorizontal: 16,
    paddingBottom: 20,
    backgroundColor: '#0066FF',
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  topLogoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bhopalPill: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bhopalPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  animationDashedCard: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
    borderStyle: 'dashed',
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  animationLiveContainer: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    minHeight: 120,
  },
  animationLiveImage: {
    width: '100%',
    height: 130,
    borderRadius: 18,
  },
  clapperIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  animationDashedTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  animationDashedSub: {
    color: '#1E293B',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  heroBackground: {
    width: '100%',
    height: 160,
  },
  heroOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 50, 150, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandHeroContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  citySilhouetteBox: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 6,
  },
  buildingBar: {
    width: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    marginHorizontal: 1.5,
  },
  speedArrowBadge: {
    backgroundColor: '#00E5FF',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  speedArrowText: {
    color: '#003366',
    fontWeight: '900',
    fontSize: 14,
  },
  pinDotBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDotText: {
    fontSize: 12,
  },
  logoTextWrap: {
    flexDirection: 'row',
  },
  rideHubLogoText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  hubLogoText: {
    color: '#00E5FF',
  },
  bottomSection: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -20,
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    minHeight: height - 140,
  },
  headline: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  headlineBlue: {
    color: '#0066FF',
  },
  subHeadline: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  tabToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tabToggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabToggleBtnActive: {
    backgroundColor: '#0066FF',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  tabToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabToggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  authCardContainer: {
    backgroundColor: '#FFFFFF',
  },
  formSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  formSectionSub: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 52,
  },
  countryCodeBox: {
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: '#CBD5E1',
    marginRight: 10,
  },
  countryCodeText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '500',
  },
  editPhoneBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  editPhoneBtnText: {
    fontSize: 12,
    color: '#0066FF',
    fontWeight: '700',
  },
  otpSection: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  otpInputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: 8,
    textAlign: 'center',
  },
  otpInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#0066FF',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 10,
    textAlign: 'center',
    height: 54,
    color: '#0F172A',
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  timerText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  resendLinkText: {
    fontSize: 13,
    color: '#0066FF',
    fontWeight: '700',
  },
  primaryBtn: {
    backgroundColor: '#0066FF',
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  switchAuthTypeBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  switchAuthTypeText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  toggleLink: {
    color: '#0066FF',
    fontWeight: '700',
    fontSize: 14,
  },
  gpsAutoBtn: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#93C5FD',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsAutoBtnText: {
    color: '#0066FF',
    fontWeight: '700',
    fontSize: 13,
  },
  detectedAreaBanner: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 6,
  },
  detectedAreaText: {
    fontSize: 12,
    color: '#166534',
    fontWeight: '600',
  },
  termsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
  },
  termsCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  termsBoxCheck: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  termsBoxCheckActive: {
    backgroundColor: '#0066FF',
    borderColor: '#0066FF',
  },
  termsBoxCheckmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  termsBoxText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  termsBoxLink: {
    color: '#0066FF',
    fontWeight: '700',
  },
  footerWrap: {
    marginTop: 30,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  footerNoteText: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 8,
  },
  footerLinkBold: {
    color: '#475569',
    fontWeight: '600',
  },
  footerLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerLinkBlue: {
    fontSize: 11,
    color: '#0066FF',
    fontWeight: '600',
  },
  footerDot: {
    fontSize: 11,
    color: '#94A3B8',
    marginHorizontal: 6,
  },
  categoriesOuterWrap: {
    marginTop: 4,
    marginBottom: 6,
    paddingVertical: 2,
  },
  customerCatsRow: {
    paddingHorizontal: 2,
    alignItems: 'center',
  },
  customerCatCard: {
    width: 68,
    height: 74,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  customerCatImg: {
    width: 40,
    height: 40,
    borderRadius: 8,
    marginBottom: 4,
  },
  customerCatIcon: {
    fontSize: 26,
    marginBottom: 4,
  },
  customerCatName: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
  },
});
