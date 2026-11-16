import React, { useState, useContext, useEffect } from 'react';
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
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthContext } from '../context/AuthContext';
import api, { clearApiCachedAuth } from '../services/api';
import Icon from '../components/PngIcon';
import { fetchCurrentGpsPosition, reverseGeocodeCoords } from '../services/LocationAddressService';
import HindiTermsModal from '../components/HindiTermsModal';
import * as ImagePicker from 'react-native-image-picker';
import { LottieAnimation } from '../components/LottieAnimation';
import { resolveUploadUrl } from '../config/apiConfig';
import { useSocket } from '../context/SocketContext';

const { width, height } = Dimensions.get('window');

const VEHICLE_TYPES = [
  { id: 'bike', label: '🏍️ Bike', name: '🏍️ Petrol Bike / Motorcycle', desc: 'Standard petrol motorcycle' },
  { id: 'scooty', label: '🛵 Scooty', name: '🛵 Scooty / Scooter', desc: 'Petrol scooter / scooty' },
  { id: 'ev', label: '⚡ EV Scooter', name: '⚡ EV Scooter / Electric Bike', desc: 'Electric scooter or e-bike' },
  { id: 'cycle', label: '🚲 Bicycle', name: '🚲 Bicycle', desc: 'Pedal bicycle delivery' },
  { id: 'multivehicle', label: '🚐 Fleet', name: '🚐 Multi-Vehicle Fleet', desc: 'Multiple vehicle types' },
];

export default function DeliveryRegistrationScreen({ route, navigation }: any) {
  const { login } = useContext(AuthContext);

  const initialMode = route?.params?.initialMode;
  const [isLogin, setIsLogin] = useState(initialMode !== 'signup');

  // Auto-redirect if already logged in delivery partner so user is never asked to login again
  useEffect(() => {
    let isMounted = true;
    const checkExistingDeliveryAuth = async () => {
      try {
        const token = await AsyncStorage.getItem('deliveryToken');
        const userStr = await AsyncStorage.getItem('deliveryUser');
        if (token && userStr) {
          let parsed: any = null;
          try { parsed = JSON.parse(userStr); } catch (_) {}
          if (parsed && isMounted) {
            clearApiCachedAuth();
            await AsyncStorage.setItem('activeRole', 'DELIVERY');
            await AsyncStorage.setItem('userToken', token);
            clearApiCachedAuth();
            navigation.reset({
              index: 0,
              routes: [{ name: 'DeliveryRiderHomeScreen', params: { riderName: parsed?.name, riderId: parsed?._id || parsed?.id } }],
            });
          }
        }
      } catch (_) {}
    };
    checkExistingDeliveryAuth();
    return () => { isMounted = false; };
  }, [navigation]);

  // Input Fields
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [usePasswordLogin, setUsePasswordLogin] = useState(false);

  // Delivery Partner Details
  const [fullName, setFullName] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('🏍️ Petrol Bike / Motorcycle');
  const [selectedVehicleKey, setSelectedVehicleKey] = useState<'bike' | 'ebike'>('bike');
  const [selfiePhoto, setSelfiePhoto] = useState<any>(null);
  const [selfieBase64, setSelfieBase64] = useState<string | null>(null);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [drivingLicense, setDrivingLicense] = useState('');
  const [currentAddress, setCurrentAddress] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [area, setArea] = useState('');
  const [upiId, setUpiId] = useState('');
  const [panCard, setPanCard] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  // Real-Time Dynamic Fleet Vehicles from Backend
  const [dynamicVehicles, setDynamicVehicles] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;
    api.get('/settings/delivery-vehicles')
      .then((res) => {
        if (!mounted) return;
        if (res.data?.success && Array.isArray(res.data?.vehicles) && res.data.vehicles.length > 0) {
          setDynamicVehicles(res.data.vehicles);
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  // OTP Auth State
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpTimer, setOtpTimer] = useState(0);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // Terms Modal State
  const [termsModalVisible, setTermsModalVisible] = useState<boolean>(false);
  const [agreedToTerms, setAgreedToTerms] = useState<boolean>(true);

  // Loading States
  const [loading, setLoading] = useState(false);
  const [deliveryMedia, setDeliveryMedia] = useState<any>(null);

  let socket: any = null;
  try {
    const sockCtx = useSocket();
    socket = sockCtx?.socket;
  } catch (_) {}

  // Live Screen Media Fetch & Socket Sync from Admin Panel (DELIVERY_SIGNUP)
  useEffect(() => {
    let mounted = true;
    const fetchDeliveryMedia = () => {
      api.get('/screen-media/DELIVERY_SIGNUP')
        .then((res) => {
          if (!mounted) return;
          if (res.data?.success && res.data?.screen) {
            setDeliveryMedia(res.data.screen);
          }
        })
        .catch(() => {});
    };
    fetchDeliveryMedia();

    if (socket) {
      const handleMediaUpdate = (data: any) => {
        if (!mounted || !data) return;
        const sid = String(data.screenId || '').toUpperCase();
        if (sid === 'DELIVERY_SIGNUP' || sid === 'DELIVERY_LOGIN') {
          setDeliveryMedia(data);
        }
      };
      socket.on('screen_media_updated', handleMediaUpdate);
      socket.on('screen_media_delivery_signup', handleMediaUpdate);
      return () => {
        mounted = false;
        socket.off('screen_media_updated', handleMediaUpdate);
        socket.off('screen_media_delivery_signup', handleMediaUpdate);
      };
    }
    return () => { mounted = false; };
  }, [socket]);
  const [detectingGps, setDetectingGps] = useState(false);

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

  // Countdown Timer for Resend OTP
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

  const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);

  // GPS Auto-detect coordinates & reverse-geocode address
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
          setCurrentAddress(formatted);
          if (geo.city) setCity(geo.city);
          if (geo.pincode) setPincode(geo.pincode);
          setArea(geo.area || geo.city || '');
          Alert.alert('Location Detected ✅', `Address: ${formatted}\n\n🌐 Open Location Model: You can go Online and deliver orders from any location!`);
        } else {
          Alert.alert('GPS Detected ✅', `Coordinates captured (${pos.latitude.toFixed(4)}, ${pos.longitude.toFixed(4)}).`);
        }
      } else {
        Alert.alert('GPS Notice', 'Could not detect device GPS. You can enter your service city manually.');
      }
    } catch (e) {
      Alert.alert('Notice', 'Unable to detect GPS. Please enter your address/city manually.');
    } finally {
      setDetectingGps(false);
    }
  };

  // Helper after successful delivery auth
  const handleDeliveryAuthSuccess = async (token: string, refreshToken: string, user: any) => {
    clearApiCachedAuth();
    await AsyncStorage.setItem('deliveryToken', token);
    await AsyncStorage.setItem('deliveryUser', JSON.stringify(user));
    await AsyncStorage.setItem('activeRole', 'DELIVERY');
    await AsyncStorage.setItem('userToken', token);
    if (refreshToken) {
      await AsyncStorage.setItem('deliveryRefreshToken', refreshToken);
      await AsyncStorage.setItem('refreshToken', refreshToken);
    }

    await login(token, refreshToken || '', user);
    clearApiCachedAuth();

    // Redirect to Delivery Rider Home Dashboard
    navigation.reset({
      index: 0,
      routes: [{ name: 'DeliveryRiderHomeScreen', params: { riderName: user.name, riderId: user._id || user.id } }],
    });
  };

  // Driver Photo & Live Selfie Picker
  const handlePickSelfie = () => {
    Alert.alert(
      'राइडर सेल्फी / फोटो (Rider Selfie)',
      'कृपया अपनी एक साफ़ सेल्फी या पहचान फोटो चुनें:',
      [
        {
          text: '📷 सेल्फी लें (Camera)',
          onPress: () => {
            ImagePicker.launchCamera(
              {
                mediaType: 'photo',
                cameraType: 'front',
                quality: 0.7,
                maxWidth: 800,
                maxHeight: 800,
                includeBase64: true,
              },
              (response) => {
                if (response.didCancel || response.errorCode) return;
                if (response.assets && response.assets.length > 0) {
                  const asset = response.assets[0];
                  setSelfiePhoto(asset);
                  if (asset.base64) {
                    setSelfieBase64(`data:${asset.type || 'image/jpeg'};base64,${asset.base64}`);
                  }
                }
              }
            );
          },
        },
        {
          text: '🖼️ गैलरी से चुनें (Gallery)',
          onPress: () => {
            ImagePicker.launchImageLibrary(
              {
                mediaType: 'photo',
                quality: 0.7,
                selectionLimit: 1,
                maxWidth: 800,
                maxHeight: 800,
                includeBase64: true,
              },
              (response) => {
                if (response.didCancel || response.errorCode) return;
                if (response.assets && response.assets.length > 0) {
                  const asset = response.assets[0];
                  setSelfiePhoto(asset);
                  if (asset.base64) {
                    setSelfieBase64(`data:${asset.type || 'image/jpeg'};base64,${asset.base64}`);
                  }
                }
              }
            );
          },
        },
        { text: 'रद्द करें (Cancel)', style: 'cancel' },
      ]
    );
  };

  // Send OTP
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
      if (!vehicleNumber.trim()) {
        Alert.alert('Vehicle Required', 'Please enter your vehicle registration number.');
        return;
      }
      if (!upiId.trim() || !upiId.includes('@')) {
        Alert.alert('UPI ID Required', 'Please enter your valid UPI ID (e.g. mobile@upi, name@okhdfcbank) for daily payout transfers.');
        return;
      }
      if (panCard.trim() && panCard.trim().length !== 10) {
        Alert.alert('Invalid PAN', 'PAN Card Number must be 10 characters (e.g. ABCDE1234F).');
        return;
      }
      if (aadhaarNumber.trim() && aadhaarNumber.trim().replace(/\s/g, '').length !== 12) {
        Alert.alert('Invalid Aadhaar', 'Aadhaar Number must be 12 digits.');
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
        role: 'rider',
      });

      if (res.data.success) {
        setOtpSent(true);
        setOtpTimer(45);
        Alert.alert('OTP Sent 📲', `A 6-digit verification code has been sent to +91 ${cleanPhone}.`);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to send OTP. Please try again.';
      if (err.response?.data?.errorType === 'ROLE_CONFLICT') {
        Alert.alert('रोल प्रतिबंध (Role Restriction)', msg, [
          { text: 'रोल बदलें (Change Role)', onPress: () => navigation.navigate('RoleSelection') },
          { text: 'ठीक है (OK)', style: 'cancel' },
        ]);
      } else if (err.response?.data?.notFound && isLogin) {
        Alert.alert('Account Not Found', 'No rider account found with this number. Please Sign Up to join fleet.', [
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

  // Verify OTP Login
  const handleVerifyOtpLogin = async () => {
    const cleanOtp = otp.trim();
    if (!cleanOtp || cleanOtp.length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter the 6-digit OTP sent to your mobile.');
      return;
    }

    try {
      setVerifyingOtp(true);
      const res = await api.post('/auth/otp/login', {
        phoneNumber: cleanPhone,
        otp: cleanOtp,
        role: 'rider',
      });

      if (res.data.success) {
        const { token, refreshToken, user } = res.data;
        await handleDeliveryAuthSuccess(token, refreshToken, user);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Invalid or expired OTP. Please try again.';
      if (err.response?.data?.errorType === 'ROLE_CONFLICT') {
        Alert.alert('रोल प्रतिबंध (Role Restriction)', msg, [
          { text: 'रोल बदलें (Change Role)', onPress: () => navigation.navigate('RoleSelection') },
          { text: 'ठीक है (OK)', style: 'cancel' },
        ]);
      } else {
        Alert.alert('Login Failed', msg);
      }
    } finally {
      setVerifyingOtp(false);
    }
  };

  // Verify OTP Sign Up
  const handleVerifyOtpRegister = async () => {
    const cleanOtp = otp.trim();
    if (!cleanOtp || cleanOtp.length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter the 6-digit OTP sent to your mobile.');
      return;
    }

    const cleanName = fullName.trim();

    try {
      setVerifyingOtp(true);

      // Verify OTP first
      const verifyRes = await api.post('/auth/otp/verify', {
        phoneNumber: cleanPhone,
        otp: cleanOtp,
        purpose: 'signup',
        role: 'rider',
      });

      if (!verifyRes.data.success) {
        Alert.alert('Verification Failed', verifyRes.data.message || 'Incorrect OTP');
        return;
      }

      // Register Rider
      let sendLat = latitude;
      let sendLon = longitude;
      if (!sendLat || !sendLon) {
        const freshGps = await fetchCurrentGpsPosition(false);
        if (freshGps?.latitude && freshGps?.longitude) {
          sendLat = freshGps.latitude;
          sendLon = freshGps.longitude;
        }
      }

      const res = await api.post('/auth/register', {
        role: 'rider',
        name: cleanName,
        phoneNumber: cleanPhone,
        vehicleType: selectedVehicle,
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
        drivingLicense: drivingLicense.trim().toUpperCase(),
        upiId: upiId.trim(),
        panCard: panCard.trim().toUpperCase() || undefined,
        panNumber: panCard.trim().toUpperCase() || undefined,
        aadhaarNumber: aadhaarNumber.trim().replace(/\s/g, '') || undefined,
        referralCode: referralCode.trim().toUpperCase() || undefined,
        profilePicture: selfieBase64 || selfiePhoto?.uri || undefined,
        verifiedFaceImage: selfieBase64 || selfiePhoto?.uri || undefined,
        photos: selfieBase64 ? [selfieBase64] : (selfiePhoto?.uri ? [selfiePhoto.uri] : []),
        fullAddress: currentAddress.trim() || undefined,
        address: currentAddress.trim() || undefined,
        city: city.trim() || undefined,
        pincode: pincode.trim() || undefined,
        latitude: sendLat || null,
        longitude: sendLon || null,
        termsConsent: {
          accepted: true,
          signedName: cleanName,
          clausesAccepted: ['rider_1_verification', 'rider_2_arrival_guarantee', 'rider_3_delivery_safety', 'rider_4_payouts'],
          version: '1.0',
        },
      });

      if (res.data.success) {
        const { token, refreshToken, user } = res.data;
        Alert.alert(
          'Registration Successful! 🎉',
          `Rider ID: ${user.partnerId || 'DLV-ACTIVE'}\nWelcome to the Delivery Fleet!`,
          [
            {
              text: 'Open Rider App',
              onPress: () => handleDeliveryAuthSuccess(token, refreshToken, user),
            },
          ]
        );
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Registration failed. Please try again.';
      if (err.response?.data?.errorType === 'ROLE_CONFLICT') {
        Alert.alert('रोल प्रतिबंध (Role Restriction)', msg, [
          { text: 'रोल बदलें (Change Role)', onPress: () => navigation.navigate('RoleSelection') },
          { text: 'ठीक है (OK)', style: 'cancel' },
        ]);
      } else {
        Alert.alert('Registration Error', msg);
      }
    } finally {
      setVerifyingOtp(false);
    }
  };

  // Password Login
  const handleDeliveryPasswordLogin = async () => {
    if (!cleanPhone || cleanPhone.length !== 10) {
      Alert.alert('Invalid Mobile', 'Please enter a valid 10-digit mobile number.');
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
        role: 'rider',
      });

      if (res.data.success) {
        const { token, refreshToken, user } = res.data;
        await handleDeliveryAuthSuccess(token, refreshToken, user);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Login failed. Please check your credentials.';
      if (err.response?.data?.errorType === 'ROLE_CONFLICT') {
        Alert.alert('रोल प्रतिबंध (Role Restriction)', msg, [
          { text: 'रोल बदलें (Change Role)', onPress: () => navigation.navigate('RoleSelection') },
          { text: 'ठीक है (OK)', style: 'cancel' },
        ]);
      } else {
        Alert.alert('Login Failed', msg);
      }
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
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 240 }]}
          bounces={true}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets={true}
        >
          {/* Header Banner (Live from Admin Screen Media or Default Artwork) */}
          <View style={styles.headerBackground}>
            {deliveryMedia && deliveryMedia.isActive && (deliveryMedia.lottieUrl || deliveryMedia.imageUrl || deliveryMedia.mediaUrl) ? (
              deliveryMedia.lottieUrl ? (
                <View style={styles.mediaContainerWrap}>
                  <LottieAnimation
                    source={{ uri: resolveUploadUrl(deliveryMedia.lottieUrl) }}
                    height={160}
                    speed={deliveryMedia.lottieConfig?.speed || 1.0}
                    loop={deliveryMedia.lottieConfig?.loop !== false}
                    autoplay={true}
                  />
                </View>
              ) : (
                <Image
                  source={{ uri: resolveUploadUrl(deliveryMedia.imageUrl || deliveryMedia.mediaUrl) }}
                  style={styles.bikeImage}
                  resizeMode="cover"
                />
              )
            ) : (
              <Image source={require('../banner/bike.png')} style={styles.bikeImage} resizeMode="contain" />
            )}
            <View style={styles.gradientOverlay} />

            <View style={styles.headerContent}>
              <View style={styles.topNavRow}>
                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={() => navigation.goBack()}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Icon name="arrow-back" size={16} color="#FFFFFF" />
                  <Text style={styles.backBtnText}>Role Select</Text>
                </TouchableOpacity>

                <View style={styles.centerBrandLogo}>
                  <View style={styles.logoBarsIcon}>
                    <View style={[styles.barItem, { height: 10 }]} />
                    <View style={[styles.barItem, { height: 16 }]} />
                    <View style={[styles.barItem, { height: 22 }]} />
                    <View style={[styles.barItem, { height: 14 }]} />
                    <View style={[styles.barItem, { height: 8 }]} />
                  </View>
                  <View style={styles.logoArrowCircle}>
                    <Text style={styles.logoArrowText}>➔</Text>
                  </View>
                  <Text style={styles.rideHubBrandText}>
                    Ride<Text style={styles.hubBrandText}>Hub</Text>
                  </Text>
                </View>

                <View style={styles.locationPill}>
                  <Text style={styles.locationPinIcon}>📍</Text>
                  <Text style={styles.locationPillText}>{city ? city : 'Open Location'}</Text>
                </View>
              </View>

              <View style={styles.heroTitlesWrap}>
                <Text style={styles.heroPortalTitle}>
                  Ride<Text style={{ color: '#00E5FF' }}>Hub</Text>
                </Text>
                <Text style={styles.heroPortalSub}>Delivery Partner Portal</Text>

                <View style={styles.heroBulletsList}>
                  <View style={styles.bulletItemRow}>
                    <Text style={styles.bulletCheckIcon}>✓</Text>
                    <Text style={styles.bulletText}>Earn on Every Delivery</Text>
                  </View>
                  <View style={styles.bulletItemRow}>
                    <Text style={styles.bulletCheckIcon}>✓</Text>
                    <Text style={styles.bulletText}>Flexible Hours</Text>
                  </View>
                  <View style={styles.bulletItemRow}>
                    <Text style={styles.bulletCheckIcon}>✓</Text>
                    <Text style={styles.bulletText}>Be Your Own Boss</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* Form Content */}
          <View style={styles.formContainer}>
            {/* Top Segmented Mode Tabs: Login vs Register */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tabButton, isLogin && styles.tabButtonActive]}
                onPress={() => {
                  setIsLogin(true);
                  setOtpSent(false);
                  setOtp('');
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabButtonText, isLogin && styles.tabButtonTextActive]}>
                  📱 Rider OTP Login
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabButton, !isLogin && styles.tabButtonActive]}
                onPress={() => {
                  setIsLogin(false);
                  setOtpSent(false);
                  setOtp('');
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabButtonText, !isLogin && styles.tabButtonTextActive]}>
                  🛵 Join Fleet
                </Text>
              </TouchableOpacity>
            </View>

            {isLogin ? (
              /* DELIVERY PARTNER LOGIN */
              <View>
                <Text style={styles.mainTitle}>Delivery Partner Login</Text>
                <Text style={styles.subSubtitle}>Log in with your registered mobile number and OTP</Text>

                <View style={styles.perksRow}>
                  <Text style={styles.perksText}>
                    ⚡ Live Orders • 💰 Instant Daily Payout • 🗺️ Turn-by-Turn GPS
                  </Text>
                </View>

                {/* Mobile Number Input */}
                <View style={[styles.inputContainer, { marginBottom: 14 }]}>
                  <View style={styles.countryCodeBox}>
                    <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Registered Mobile Number"
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
                    <TouchableOpacity onPress={() => setOtpSent(false)} style={{ paddingHorizontal: 8 }}>
                      <Text style={{ color: '#0066FF', fontWeight: '700', fontSize: 12 }}>Change</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* OTP Section if sent */}
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

                    <TouchableOpacity
                      style={styles.primaryBtn}
                      onPress={handleVerifyOtpLogin}
                      disabled={verifyingOtp}
                      activeOpacity={0.88}
                    >
                      {verifyingOtp ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.primaryBtnText}>Verify OTP & Login to Fleet →</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={() => handleSendOtp('login')}
                    disabled={sendingOtp}
                    activeOpacity={0.88}
                  >
                    {sendingOtp ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Get OTP to Login →</Text>
                    )}
                  </TouchableOpacity>
                )}

                {/* Password Login Alternative */}
                {usePasswordLogin ? (
                  <View style={{ marginTop: 16 }}>
                    <View style={[styles.inputContainer, { marginBottom: 12 }]}>
                      <TextInput
                        style={styles.input}
                        placeholder="Enter Password"
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
                      style={[styles.primaryBtn, { backgroundColor: '#475569' }]}
                      onPress={handleDeliveryPasswordLogin}
                      disabled={loading}
                    >
                      {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.primaryBtnText}>Login with Password</Text>}
                    </TouchableOpacity>
                  </View>
                ) : null}

                <TouchableOpacity
                  onPress={() => setUsePasswordLogin(!usePasswordLogin)}
                  style={{ alignItems: 'center', paddingVertical: 12 }}
                >
                  <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '600' }}>
                    {usePasswordLogin ? '← Switch to OTP Login' : 'Login with Password instead'}
                  </Text>
                </TouchableOpacity>

                {/* Switch to Sign Up */}
                <View style={styles.toggleRow}>
                  <Text style={{ color: '#64748B', fontSize: 14 }}>Want to deliver with us? </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setIsLogin(false);
                      setOtpSent(false);
                    }}
                  >
                    <Text style={styles.toggleLink}>Register as Delivery Partner</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              /* DELIVERY PARTNER SIGN UP FORM */
              <View>
                <Text style={styles.mainTitle}>Join Delivery Fleet</Text>
                <Text style={styles.subSubtitle}>Register your vehicle and start earning daily income</Text>

                {/* 1. Rider Account & Credentials */}
                <Text style={styles.sectionHeader}>1. Personal Details</Text>

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

                {/* Referral / Invite Code (User Request) */}
                <View style={[styles.inputContainer, { marginBottom: 12 }]}>
                  <Text style={{ fontSize: 16, marginLeft: 16, marginRight: 10 }}>🎁</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Referral / Order Code (Optional)"
                    placeholderTextColor="#9CA3AF"
                    value={referralCode}
                    onChangeText={setReferralCode}
                    autoCapitalize="characters"
                    editable={!otpSent}
                  />
                </View>

                {/* 2. Vehicle Type (Matching Image 2) */}
                <Text style={styles.sectionHeader}>2. Vehicle Type</Text>
                <Text style={styles.vehicleInstruction}>
                  Select Your Delivery Vehicle (Choose one):
                </Text>

                <View style={styles.vehicleCardsRow}>
                  {/* Card 1: Bike with Premium 3D Generated Icon */}
                  <TouchableOpacity
                    style={[
                      styles.vehicleBigCard,
                      selectedVehicleKey === 'bike' && styles.vehicleBigCardActive,
                    ]}
                    onPress={() => {
                      setSelectedVehicleKey('bike');
                      setSelectedVehicle('🏍️ Petrol Bike / Motorcycle');
                    }}
                    activeOpacity={0.8}
                  >
                    <Image source={require('../banner/bike_premium.png')} style={styles.vehicleCardImg} resizeMode="contain" />
                    <View style={styles.vehicleCardTextWrap}>
                      <Text style={styles.vehicleCardTitle} numberOfLines={1}>Bike</Text>
                      <Text style={styles.vehicleCardSub} numberOfLines={1}>Petrol Motorcycle</Text>
                    </View>
                    <View style={[styles.vehicleCheckCircle, selectedVehicleKey === 'bike' && styles.vehicleCheckCircleActive]}>
                      {selectedVehicleKey === 'bike' && <Text style={styles.vehicleCheckmarkText}>✓</Text>}
                    </View>
                  </TouchableOpacity>

                  {/* Card 2: E-Bike with Premium 3D Generated Icon */}
                  <TouchableOpacity
                    style={[
                      styles.vehicleBigCard,
                      selectedVehicleKey === 'ebike' && styles.vehicleBigCardActive,
                    ]}
                    onPress={() => {
                      setSelectedVehicleKey('ebike');
                      setSelectedVehicle('⚡ EV Scooter / Electric Bike');
                    }}
                    activeOpacity={0.8}
                  >
                    <Image source={require('../banner/ebike_premium.png')} style={styles.vehicleCardImg} resizeMode="contain" />
                    <View style={styles.vehicleCardTextWrap}>
                      <Text style={styles.vehicleCardTitle} numberOfLines={1}>E-Bike</Text>
                      <Text style={styles.vehicleCardSub} numberOfLines={1}>Electric Scooter</Text>
                    </View>
                    <View style={[styles.vehicleCheckCircle, selectedVehicleKey === 'ebike' && styles.vehicleCheckCircleActive]}>
                      {selectedVehicleKey === 'ebike' && <Text style={styles.vehicleCheckmarkText}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                </View>

                <View style={[styles.inputContainer, { marginBottom: 12 }]}>
                  <TextInput
                    style={styles.input}
                    placeholder="Vehicle Number (e.g. MP 04 AB 1234) *"
                    placeholderTextColor="#9CA3AF"
                    value={vehicleNumber}
                    onChangeText={setVehicleNumber}
                    autoCapitalize="characters"
                    editable={!otpSent}
                  />
                </View>

                <View style={[styles.inputContainer, { marginBottom: 16 }]}>
                  <TextInput
                    style={styles.input}
                    placeholder="Driving License No. (Optional)"
                    placeholderTextColor="#9CA3AF"
                    value={drivingLicense}
                    onChangeText={setDrivingLicense}
                    autoCapitalize="characters"
                    editable={!otpSent}
                  />
                </View>

                {/* 3. Identity & Daily Payouts (UPI, PAN, Aadhaar) */}
                <Text style={styles.sectionHeader}>3. Daily Payout & Verification</Text>
                <View style={styles.payoutNoticePill}>
                  <Text style={styles.payoutNoticeIcon}>⚡</Text>
                  <Text style={styles.payoutNoticeText}>
                    Daily earnings are deposited directly into your UPI ID every evening!
                  </Text>
                </View>

                {/* UPI ID Field (User Explicit Request) */}
                <View style={[styles.inputContainer, { marginBottom: 12 }]}>
                  <Text style={{ fontSize: 16, marginLeft: 16, marginRight: 10 }}>💳</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="UPI ID for Daily Payouts (e.g. mobile@upi) *"
                    placeholderTextColor="#9CA3AF"
                    value={upiId}
                    onChangeText={setUpiId}
                    autoCapitalize="none"
                    editable={!otpSent}
                  />
                </View>

                {/* PAN Card Field (User Explicit Request) */}
                <View style={[styles.inputContainer, { marginBottom: 12 }]}>
                  <Text style={{ fontSize: 16, marginLeft: 16, marginRight: 10 }}>📄</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="PAN Card Number (e.g. ABCDE1234F)"
                    placeholderTextColor="#9CA3AF"
                    value={panCard}
                    onChangeText={setPanCard}
                    autoCapitalize="characters"
                    maxLength={10}
                    editable={!otpSent}
                  />
                </View>

                {/* Aadhaar Number Field (User Explicit Request) */}
                <View style={[styles.inputContainer, { marginBottom: 16 }]}>
                  <Text style={{ fontSize: 16, marginLeft: 16, marginRight: 10 }}>🆔</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Aadhaar Card No. (12 Digits)"
                    placeholderTextColor="#9CA3AF"
                    value={aadhaarNumber}
                    onChangeText={setAadhaarNumber}
                    keyboardType="numeric"
                    maxLength={12}
                    editable={!otpSent}
                  />
                </View>

                {/* 4. Driver Photo & Selfie Verification */}
                <Text style={styles.sectionHeader}>4. Driver Photo & Selfie (राइडर सेल्फी फोटो)</Text>
                <Text style={styles.selfieInstruction}>
                  कृपया अपनी एक साफ़ सेल्फी या प्रोफाइल फोटो जोड़ें (सुरक्षा और सत्यापन हेतु):
                </Text>

                <TouchableOpacity
                  style={[styles.selfieUploadBox, (selfiePhoto || selfieBase64) && styles.selfieUploadBoxFilled]}
                  onPress={handlePickSelfie}
                  activeOpacity={0.8}
                >
                  {selfiePhoto ? (
                    <View style={styles.selfiePreviewContainer}>
                      <Image
                        source={{ uri: selfiePhoto.uri }}
                        style={styles.selfieImagePreview}
                        resizeMode="cover"
                      />
                      <View style={styles.selfieInfoWrap}>
                        <View style={styles.selfieBadgeRow}>
                          <Text style={styles.selfieBadgeText}>✅ Selfie Selected</Text>
                        </View>
                        <Text style={styles.selfieFileName} numberOfLines={1}>
                          {selfiePhoto.fileName || 'Driver_Selfie.jpg'}
                        </Text>
                        <TouchableOpacity style={styles.selfieChangeBtn} onPress={handlePickSelfie}>
                          <Text style={styles.selfieChangeBtnText}>🔄 Change Photo / बदलें</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.selfieEmptyContainer}>
                      <View style={styles.selfieCameraCircle}>
                        <Text style={{ fontSize: 26 }}>📷</Text>
                      </View>
                      <Text style={styles.selfieEmptyTitle}>Take Live Selfie or Upload Photo</Text>
                      <Text style={styles.selfieEmptySub}>Camera या Gallery से अपनी साफ़ फोटो अपलोड करें</Text>
                      <View style={styles.selfieButtonsRow}>
                        <View style={styles.selfieOptionPill}>
                          <Text style={styles.selfieOptionPillText}>📸 Camera</Text>
                        </View>
                        <View style={styles.selfieOptionPill}>
                          <Text style={styles.selfieOptionPillText}>🖼️ Gallery</Text>
                        </View>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>

                {/* 5. Operating City & Location (Matching Image 2) */}
                <Text style={styles.sectionHeader}>5. Service City & Location</Text>
                
                <View style={[styles.inputContainer, { marginBottom: 12 }]}>
                  <TextInput
                    style={styles.input}
                    placeholder="Current Street Address / Area *"
                    placeholderTextColor="#9CA3AF"
                    value={currentAddress}
                    onChangeText={setCurrentAddress}
                    editable={!otpSent}
                  />
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                  <View style={[styles.inputContainer, { flex: 1 }]}>
                    <TextInput
                      style={styles.input}
                      placeholder="City"
                      placeholderTextColor="#9CA3AF"
                      value={city}
                      onChangeText={setCity}
                      editable={!otpSent}
                    />
                  </View>
                  <View style={[styles.inputContainer, { flex: 1 }]}>
                    <TextInput
                      style={styles.input}
                      placeholder="Pincode"
                      placeholderTextColor="#9CA3AF"
                      value={pincode}
                      onChangeText={setPincode}
                      keyboardType="numeric"
                      editable={!otpSent}
                    />
                  </View>
                </View>

                {/* Open Location Model Notice (Zone System Removed) */}
                <View style={styles.zonePromptCard}>
                  <Text style={styles.zonePromptTitle}>🌐 Open Location Delivery Model</Text>
                  <Text style={styles.zonePromptSub}>
                    No zone restriction! Go Online & accept nearby orders from any location across the city.
                  </Text>
                </View>

                {/* Single Clean Dashed GPS Button (Duplicate Removed) */}
                <TouchableOpacity
                  style={styles.gpsAutoBtnDashed}
                  onPress={handleDetectGps}
                  disabled={detectingGps || otpSent}
                  activeOpacity={0.8}
                >
                  {detectingGps ? (
                    <ActivityIndicator size="small" color="#0066FF" />
                  ) : (
                    <View style={styles.gpsAutoContentRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 18 }}>🎯</Text>
                        <Text style={styles.gpsAutoBtnText}>
                          {latitude ? `GPS Scanned (${latitude.toFixed(3)}, ${longitude?.toFixed(3)})` : 'Auto-Detect Delivery Location (GPS)'}
                        </Text>
                      </View>
                      <View style={styles.gpsBlueArrowWrap}>
                        <Text style={styles.gpsBlueArrowText}>➤</Text>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>

                {/* Terms Box */}
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
                        I agree to Rider Delivery Terms & Conditions (नियम एवं शर्तें)
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* OTP Section */}
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

                    <TouchableOpacity
                      style={styles.primaryBtn}
                      onPress={handleVerifyOtpRegister}
                      disabled={verifyingOtp}
                      activeOpacity={0.88}
                    >
                      {verifyingOtp ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.primaryBtnText}>Verify OTP & Complete Registration →</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={() => handleSendOtp('signup')}
                    disabled={sendingOtp}
                    activeOpacity={0.88}
                  >
                    {sendingOtp ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Send Verification OTP →</Text>
                    )}
                  </TouchableOpacity>
                )}

                {/* Switch to Login */}
                <View style={styles.toggleRow}>
                  <Text style={{ color: '#64748B', fontSize: 14 }}>Already registered as rider? </Text>
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

            {/* Lakefront Banner / Multi Vendor Delivery Text */}
            <View style={styles.footerBrand}>
              <Text style={styles.footerBrandText}>RIDE HUB MULTI VENDOR DELIVERY</Text>
            </View>

            {/* Bottom Trust Badges (Matching Image 4) */}
            <View style={styles.trustBadgesRow}>
              <View style={styles.trustBadgeItem}>
                <Text style={styles.trustBadgeIcon}>🛡️</Text>
                <Text style={styles.trustBadgeText}>Safe & Secure</Text>
              </View>
              <View style={styles.trustBadgeDivider} />
              <View style={styles.trustBadgeItem}>
                <Text style={styles.trustBadgeIcon}>🎧</Text>
                <Text style={styles.trustBadgeText}>24×7 Support</Text>
              </View>
              <View style={styles.trustBadgeDivider} />
              <View style={styles.trustBadgeItem}>
                <Text style={styles.trustBadgeIcon}>⚡</Text>
                <Text style={styles.trustBadgeText}>Fast Payouts</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <HindiTermsModal
        visible={termsModalVisible}
        onClose={() => setTermsModalVisible(false)}
        role="rider"
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
  scrollContent: {
    flexGrow: 1,
    backgroundColor: '#F8FAFC',
  },
  headerBackground: {
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 12 : 44,
    paddingBottom: 24,
    backgroundColor: '#0066FF',
    position: 'relative',
  },
  mediaContainerWrap: {
    position: 'absolute',
    top: 40,
    right: 10,
    width: 170,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  bikeImage: {
    position: 'absolute',
    right: -20,
    top: 20,
    width: 200,
    height: 140,
    opacity: 0.35,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 70, 200, 0.4)',
  },
  headerContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rideText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  hubText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#00E5FF',
    letterSpacing: 1,
  },
  expressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  speedLine: {
    color: '#00E5FF',
    fontWeight: '900',
    marginHorizontal: 4,
  },
  expressText: {
    color: '#E0F2FE',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  trustedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  trustedStar: {
    color: '#FBBF24',
    fontSize: 12,
    marginRight: 4,
  },
  trustedText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  formContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -16,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabButtonActive: {
    backgroundColor: '#0066FF',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  tabButtonTextActive: {
    color: '#FFFFFF',
  },
  mainTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  subSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
  },
  perksRow: {
    backgroundColor: '#EFF6FF',
    padding: 10,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  perksText: {
    fontSize: 11,
    color: '#1E40AF',
    fontWeight: '700',
    textAlign: 'center',
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 8,
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
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
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
  },
  vehicleChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  vehicleChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#0066FF',
  },
  vehicleChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  vehicleChipTextActive: {
    color: '#0066FF',
  },
  gpsBtn: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#0066FF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  gpsBtnText: {
    color: '#0066FF',
    fontWeight: '800',
    fontSize: 12,
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
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  toggleLink: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0066FF',
  },
  footerBrand: {
    alignItems: 'center',
    marginTop: 24,
  },
  footerBrandText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1,
  },
  termsBox: {
    backgroundColor: '#F0F6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    borderRadius: 14,
    padding: 12,
    marginTop: 16,
    marginBottom: 8,
  },
  termsCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  termsBoxCheck: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#0066FF',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  termsBoxCheckActive: {
    backgroundColor: '#0066FF',
  },
  termsBoxCheckmark: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  termsBoxText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 17,
  },
  topNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  centerBrandLogo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  logoBarsIcon: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    marginRight: 4,
  },
  barItem: {
    width: 3,
    backgroundColor: '#38BDF8',
    borderRadius: 2,
  },
  logoArrowCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#00E5FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  logoArrowText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0066FF',
  },
  rideHubBrandText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  hubBrandText: {
    color: '#00E5FF',
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  locationPinIcon: {
    fontSize: 11,
    marginRight: 4,
  },
  locationPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  heroTitlesWrap: {
    marginTop: 4,
  },
  heroPortalTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  heroPortalSub: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E0F2FE',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  heroBulletsList: {
    gap: 3,
  },
  bulletItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bulletCheckIcon: {
    fontSize: 11,
    color: '#FBBF24',
    fontWeight: '900',
    marginRight: 6,
  },
  bulletText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  vehicleInstruction: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 10,
  },
  vehicleCardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 14,
  },
  vehicleBigCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    minWidth: 0,
  },
  vehicleBigCardActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#0066FF',
    borderWidth: 2,
  },
  vehicleCardImg: {
    width: 38,
    height: 38,
    flexShrink: 0,
    marginRight: 6,
  },
  vehicleCardTextWrap: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  vehicleCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  vehicleCardSub: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  vehicleCheckCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginLeft: 4,
  },
  vehicleCheckCircleActive: {
    backgroundColor: '#0066FF',
    borderColor: '#0066FF',
  },
  vehicleCheckmarkText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  selfieInstruction: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 10,
    lineHeight: 18,
  },
  selfieUploadBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selfieUploadBoxFilled: {
    borderColor: '#0066FF',
    borderStyle: 'solid',
    backgroundColor: '#F0F9FF',
  },
  selfiePreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  selfieImagePreview: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: '#0066FF',
    backgroundColor: '#E2E8F0',
  },
  selfieInfoWrap: {
    flex: 1,
    marginLeft: 14,
  },
  selfieBadgeRow: {
    alignSelf: 'flex-start',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 4,
  },
  selfieBadgeText: {
    color: '#16A34A',
    fontWeight: '700',
    fontSize: 12,
  },
  selfieFileName: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
    marginBottom: 6,
  },
  selfieChangeBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#0066FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  selfieChangeBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  selfieEmptyContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  selfieCameraCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  selfieEmptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  selfieEmptySub: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 12,
    textAlign: 'center',
  },
  selfieButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  selfieOptionPill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  selfieOptionPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0066FF',
  },
  payoutNoticePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    gap: 8,
  },
  payoutNoticeIcon: {
    fontSize: 16,
    color: '#0066FF',
  },
  payoutNoticeText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#1E40AF',
    flex: 1,
  },
  singleZoneCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  singleZoneHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  zoneActiveBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  zoneActiveBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
    letterSpacing: 0.5,
  },
  zoneDistBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  singleZoneName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#065F46',
    marginBottom: 2,
  },
  singleZoneTagline: {
    fontSize: 11.5,
    color: '#047857',
    fontWeight: '500',
    lineHeight: 16,
  },
  zonePromptCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  zonePromptTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 2,
  },
  zonePromptSub: {
    fontSize: 11.5,
    color: '#64748B',
  },
  gpsAutoBtnDashed: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#0066FF',
    borderStyle: 'dashed',
    borderRadius: 14,
    height: 52,
    paddingHorizontal: 14,
    justifyContent: 'center',
    marginBottom: 14,
  },
  gpsAutoContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  gpsBlueArrowWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0066FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsBlueArrowText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  gpsAutoBtn: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#0066FF',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  gpsAutoBtnText: {
    color: '#0066FF',
    fontSize: 13,
    fontWeight: '800',
  },
  trustBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#F0F9FF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginTop: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  trustBadgeItem: {
    alignItems: 'center',
    flex: 1,
  },
  trustBadgeDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#BAE6FD',
  },
  trustBadgeIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  trustBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0369A1',
    textAlign: 'center',
  },
});
