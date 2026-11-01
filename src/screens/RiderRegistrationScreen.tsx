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
import api from '../services/api';
import { BASE_URL, LOCAL_URL } from '../config/apiConfig';
import Icon from '../components/PngIcon';
import ImagePicker from 'react-native-image-crop-picker';
import { fetchCurrentGpsPosition, reverseGeocodeCoords } from '../services/LocationAddressService';
import HindiTermsModal from '../components/HindiTermsModal';

const { width, height } = Dimensions.get('window');

const DEFAULT_CATEGORY_IMAGES: Record<string, string> = {
  food: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=500&auto=format&fit=crop&q=80',
  restaurant: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=500&auto=format&fit=crop&q=80',
  grocery: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=80',
  fashion: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=500&auto=format&fit=crop&q=80',
  clothing: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=500&auto=format&fit=crop&q=80',
  beauty: 'https://images.unsplash.com/photo-1560750588-73207b1ef5b8?w=500&auto=format&fit=crop&q=80',
  wellness: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=500&auto=format&fit=crop&q=80',
  electronics: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=500&auto=format&fit=crop&q=80',
  repair: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=500&auto=format&fit=crop&q=80',
  cleaning: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=500&auto=format&fit=crop&q=80',
};

export const STANDARD_PARTNER_TYPES = [
  { id: 'restaurant', label: 'Restaurant', icon: '🍽️', partnerType: 'RESTAURANT', desc: 'Dishes, Meals, Cafe, Fast Food', fssaiNeeded: true },
  { id: 'beauty', label: 'Beauty', icon: '💄', partnerType: 'BEAUTY', desc: 'Cosmetics, Salon, Skincare, Makeup', fssaiNeeded: false },
  { id: 'grocery', label: 'Grocery / Kirana', icon: '🛒', partnerType: 'GROCERY', desc: 'Daily Staples, Packaged Goods, Mart', fssaiNeeded: true },
  { id: 'vegetables', label: 'Vegetables', icon: '🥦', partnerType: 'VEGETABLES', desc: 'Fresh Mandi Vegetables', fssaiNeeded: false },
  { id: 'fruits', label: 'Fruits', icon: '🍎', partnerType: 'FRUITS', desc: 'Fresh Seasonal & Exotic Fruits', fssaiNeeded: false },
  { id: 'namkeen', label: 'Namkeen / Snacks', icon: '🥨', partnerType: 'NAMKEEN', desc: 'Packaged Snacks, Sweets, Farsan', fssaiNeeded: true },
  { id: 'oil_food', label: 'Oil / Food Products', icon: '🌻', partnerType: 'OIL_FOOD', desc: 'Cooking Oils, Ghee, Food Products', fssaiNeeded: true },
  { id: 'stationery', label: 'Stationery / Non-Food', icon: '📚', partnerType: 'STATIONERY', desc: 'Books, Pens, Office & School Supplies', fssaiNeeded: false },
];

export default function RiderRegistrationScreen({ route, navigation }: any) {
  const { login } = useContext(AuthContext);

  const initialMode = route?.params?.initialMode;
  const [isLogin, setIsLogin] = useState(initialMode !== 'signup');
  const [selectedBusinessType, setSelectedBusinessType] = useState<string>('restaurant');

  // Categories State
  const [categories, setCategories] = useState<any[]>([]);
  const [loadingCategories, setLoadingCategories] = useState<boolean>(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedCategoryName, setSelectedCategoryName] = useState<string>('');

  // Seller Details
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [usePasswordLogin, setUsePasswordLogin] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [fullAddress, setFullAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [fssaiNumber, setFssaiNumber] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [openingTime, setOpeningTime] = useState('10:00 AM');
  const [closingTime, setClosingTime] = useState('11:00 PM');
  const [upiId, setUpiId] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [restaurantImages, setRestaurantImages] = useState<string[]>([]);
  const [area, setArea] = useState('');

  // OTP State
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpTimer, setOtpTimer] = useState(0);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // Terms State
  const [termsModalVisible, setTermsModalVisible] = useState<boolean>(false);
  const [agreedToTerms, setAgreedToTerms] = useState<boolean>(true);

  const [loading, setLoading] = useState(false);
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

  const fetchActiveCategories = async () => {
    try {
      setLoadingCategories(true);
      const res = await api.get('/categories');
      if (res.data?.success && Array.isArray(res.data.categories)) {
        const activeCats = res.data.categories.filter((c: any) => c.isActive !== false);
        setCategories(activeCats);
        if (activeCats.length > 0) {
          setSelectedCategoryId(activeCats[0]._id);
          setSelectedCategoryName(activeCats[0].name);
        }
      }
    } catch (e) {
      console.log('Error fetching categories:', e);
    } finally {
      setLoadingCategories(false);
    }
  };

  const getCategoryImageUrl = (img?: string, name?: string) => {
    if (img && typeof img === 'string' && img.trim()) {
      const trimmed = img.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
        return trimmed;
      }
      const cleanHost = (LOCAL_URL || BASE_URL.replace(/\/api\/?$/, '')).replace(/\/+$/, '');
      const cleanPath = trimmed.replace(/^\/+/, '');
      return `${cleanHost}/${cleanPath}`;
    }
    if (name && typeof name === 'string') {
      const lower = name.toLowerCase();
      for (const [key, url] of Object.entries(DEFAULT_CATEGORY_IMAGES)) {
        if (lower.includes(key)) return url;
      }
    }
    return 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=500&auto=format&fit=crop&q=80';
  };

  useEffect(() => {
    fetchActiveCategories();
  }, []);

  const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);

  // GPS Auto-detect coordinates
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
          if (geo.city) setCity(geo.city);
          if (geo.pincode) setPincode(geo.pincode);
          setArea(geo.area || geo.city || '');
          Alert.alert(
            'Store Location Detected ✅',
            `Area: ${geo.area || geo.city}\nAddress: ${formatted}\n\nAddress auto-filled!`
          );
        }
      } else {
        Alert.alert('GPS Notice', 'Could not detect device GPS. You can manually enter your store address.');
      }
    } catch (e) {
      Alert.alert('Notice', 'Unable to detect GPS. Please enter your address manually.');
    } finally {
      setDetectingGps(false);
    }
  };

  // Pick Photos
  const selectImages = async () => {
    try {
      const images = await ImagePicker.openPicker({
        multiple: true,
        maxFiles: 3,
        width: 600,
        height: 600,
        cropping: true,
        compressImageQuality: 0.7,
        includeBase64: true,
      });

      const newImages = images.map((img: any) => `data:${img.mime};base64,${img.data}`);
      setRestaurantImages(newImages.slice(0, 3));
    } catch (err: any) {
      if (err.message !== 'User cancelled image selection') {
        Alert.alert('Image Notice', 'Image selection cancelled.');
      }
    }
  };

  // Helper after successful auth
  const handleSupplierAuthSuccess = async (token: string, refreshToken: string, user: any) => {
    await AsyncStorage.multiRemove([
      'restaurant_menu',
      'restaurant_categories',
      'supplierUser',
      'registeredSupplierId',
      'partnerType',
      'partnerId',
      'businessType',
      'businessId',
    ]).catch(() => {});

    await AsyncStorage.setItem('supplierToken', token);
    await AsyncStorage.setItem('registeredSupplierId', user._id || user.id);
    await AsyncStorage.setItem('supplierUser', JSON.stringify(user));
    await AsyncStorage.setItem('activeRole', 'SUPPLIER');
    await AsyncStorage.setItem('userToken', token);
    if (refreshToken) {
      await AsyncStorage.setItem('refreshToken', refreshToken);
    }

    await login(token, refreshToken || '', user);

    const appStatus = user.approvalStatus || 'APPROVED';
    if (appStatus === 'PENDING') {
      navigation.replace('SellerPendingApprovalScreen', {
        user,
        userId: user._id || user.id,
      });
      return;
    }

    const targetPartnerType = STANDARD_PARTNER_TYPES.find(p => p.id === selectedBusinessType)?.partnerType || user.partnerType || 'RESTAURANT';
    navigation.replace('RiderHomeScreen', {
      riderName: user.name || user.restaurantName || 'Supplier Partner',
      riderId: user._id || user.id,
      partnerType: user.partnerType || targetPartnerType,
      partnerId: user.partnerId,
      businessType: user.businessType || selectedBusinessType,
      businessId: user.businessId || user._id,
    });
  };

  // Send OTP
  const handleSendOtp = async (purposeOverride?: 'login' | 'signup') => {
    if (!cleanPhone || cleanPhone.length !== 10) {
      Alert.alert('Invalid Mobile', 'Please enter a valid 10-digit mobile number.');
      return;
    }

    const purpose = purposeOverride || (isLogin ? 'login' : 'signup');

    if (purpose === 'signup') {
      if (!ownerName.trim()) {
        Alert.alert('Required Field', 'Please enter Store Owner / Manager Name.');
        return;
      }
      if (!restaurantName.trim()) {
        Alert.alert('Required Field', 'Please enter your Business / Store Name.');
        return;
      }
      if (!fullAddress.trim() && !latitude) {
        Alert.alert('Required Field', 'Please enter Store Address or auto-detect GPS location.');
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
        role: 'supplier',
      });

      if (res.data.success) {
        setOtpSent(true);
        setOtpTimer(45);
        Alert.alert('OTP Sent 📲', `A 6-digit verification code has been sent to +91 ${cleanPhone}.`);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to send OTP. Please try again.';
      if (err.response?.data?.notFound && isLogin) {
        Alert.alert('Account Not Found', 'No supplier account found with this number. Please Register your store.', [
          {
            text: 'Register Store',
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
      Alert.alert('Invalid OTP', 'Please enter the 6-digit OTP sent to your phone.');
      return;
    }

    try {
      setVerifyingOtp(true);
      const res = await api.post('/auth/otp/login', {
        phoneNumber: cleanPhone,
        otp: cleanOtp,
        role: 'supplier',
      });

      if (res.data.success) {
        const { token, refreshToken, user } = res.data;
        await handleSupplierAuthSuccess(token, refreshToken, user);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Invalid or expired OTP. Please try again.';
      Alert.alert('Login Failed', msg);
    } finally {
      setVerifyingOtp(false);
    }
  };

  // Verify OTP Sign Up
  const handleVerifyOtpRegister = async () => {
    const cleanOtp = otp.trim();
    if (!cleanOtp || cleanOtp.length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter the 6-digit OTP sent to your phone.');
      return;
    }

    const cleanRestoName = restaurantName.trim();
    const cleanOwner = ownerName.trim();
    const cleanAddr = fullAddress.trim();

    try {
      setVerifyingOtp(true);

      const verifyRes = await api.post('/auth/otp/verify', {
        phoneNumber: cleanPhone,
        otp: cleanOtp,
        purpose: 'signup',
        role: 'supplier',
      });

      if (!verifyRes.data.success) {
        Alert.alert('Verification Failed', verifyRes.data.message || 'Incorrect OTP');
        return;
      }

      let sendLat = latitude;
      let sendLon = longitude;
      if (!sendLat || !sendLon) {
        const freshGps = await fetchCurrentGpsPosition(false);
        if (freshGps?.latitude && freshGps?.longitude) {
          sendLat = freshGps.latitude;
          sendLon = freshGps.longitude;
        }
      }

      const targetPartnerType = STANDARD_PARTNER_TYPES.find(p => p.id === selectedBusinessType)?.partnerType || 'RESTAURANT';
      const selectedTypeLabel = STANDARD_PARTNER_TYPES.find(p => p.id === selectedBusinessType)?.label || 'Store';

      const res = await api.post('/auth/register', {
        role: 'supplier',
        name: cleanRestoName,
        restaurantName: cleanRestoName,
        ownerName: cleanOwner,
        phoneNumber: cleanPhone,
        businessType: selectedBusinessType,
        business_type: selectedBusinessType,
        partnerType: targetPartnerType,
        businessCategoryId: selectedCategoryId || undefined,
        categoryName: selectedCategoryName || selectedTypeLabel,
        fullAddress: cleanAddr,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        pincode: pincode.trim() || undefined,
        fssaiNumber: fssaiNumber.trim() || undefined,
        gstNumber: gstNumber.trim() || undefined,
        panNumber: panNumber.trim() || undefined,
        openingTime,
        closingTime,
        upiId: upiId.trim() || undefined,
        latitude: sendLat || null,
        longitude: sendLon || null,
        profilePicture: restaurantImages.length > 0 ? restaurantImages[0] : '',
        photos: restaurantImages,
      });

      if (res.data.success) {
        const { token, refreshToken, user } = res.data;
        await handleSupplierAuthSuccess(token, refreshToken, user);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Registration failed. Please try again.';
      Alert.alert('Registration Error', msg);
    } finally {
      setVerifyingOtp(false);
    }
  };

  // Password Login
  const handlePartnerPasswordLogin = async () => {
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
        role: 'supplier',
      });

      if (res.data.success) {
        const { token, refreshToken, user } = res.data;
        await handleSupplierAuthSuccess(token, refreshToken, user);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Login failed. Please check your credentials.';
      Alert.alert('Login Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden={false} barStyle="light-content" backgroundColor="#0066FF" />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Header Banner */}
          <View style={styles.headerBackground}>
            <Image source={require('../banner/l.png')} style={styles.personImage} resizeMode="contain" />
            <View style={styles.gradientOverlay} />

            <View style={styles.headerContent}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => navigation.goBack()}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon name="arrow-back" size={16} color="#FFFFFF" />
                <Text style={styles.backBtnText}>Role Select</Text>
              </TouchableOpacity>

              <View style={styles.brandRow}>
                <Text style={styles.rideText}>RIDE</Text>
                <Text style={styles.hubText}>HUB</Text>
              </View>
              <View style={styles.expressRow}>
                <Text style={styles.speedLine}>—</Text>
                <Text style={styles.expressText}>SUPPLIER & MERCHANT PORTAL</Text>
                <Text style={styles.speedLine}>—</Text>
              </View>

              <View style={styles.trustedBadge}>
                <Text style={styles.trustedStar}>★</Text>
                <Text style={styles.trustedText}>Verified Supplier Network</Text>
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
                  🔑 Supplier OTP Login
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
                  📝 Register Store
                </Text>
              </TouchableOpacity>
            </View>

            {isLogin ? (
              /* SUPPLIER LOGIN */
              <View>
                <Text style={styles.mainTitle}>Supplier Partner Login</Text>
                <Text style={styles.subSubtitle}>Log in with your registered mobile number and OTP</Text>

                {/* Partner Categories Carousel */}
                <View style={{ marginBottom: 18, width: '100%' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#64748B', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6, textAlign: 'center' }}>
                    Supported Store Categories
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 2, paddingHorizontal: 4 }}>
                    {categories.map((cat: any) => {
                      const imgUri = getCategoryImageUrl(cat.image, cat.name);
                      return (
                        <View key={`login_cat_${cat._id}`} style={styles.loginCatChip}>
                          <Image source={{ uri: imgUri }} style={styles.loginCatThumb} resizeMode="cover" />
                          <Text style={styles.loginCatText} numberOfLines={1}>{cat.name}</Text>
                        </View>
                      );
                    })}
                  </ScrollView>
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
                        <Text style={styles.primaryBtnText}>Verify OTP & Open Dashboard →</Text>
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
                      onPress={handlePartnerPasswordLogin}
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

                {/* Switch to Register */}
                <View style={styles.toggleRow}>
                  <Text style={{ color: '#64748B', fontSize: 14 }}>Want to register a new store? </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setIsLogin(false);
                      setOtpSent(false);
                    }}
                  >
                    <Text style={styles.toggleLink}>Register Store</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              /* REGISTER STORE FORM */
              <View>
                <Text style={styles.mainTitle}>Supplier Registration</Text>
                <Text style={styles.subSubtitle}>Register your shop, restaurant, or business on Ride Hub</Text>

                {/* 1. Account Details */}
                <Text style={styles.sectionHeader}>1. Owner Details</Text>

                <View style={[styles.inputContainer, { marginBottom: 14 }]}>
                  <Icon name="person-outline" size={20} color="#0066FF" style={{ marginLeft: 16, marginRight: 12 }} />
                  <TextInput
                    style={styles.input}
                    placeholder="Store Owner / Manager Name *"
                    placeholderTextColor="#9CA3AF"
                    value={ownerName}
                    onChangeText={setOwnerName}
                    editable={!otpSent}
                  />
                </View>

                <View style={[styles.inputContainer, { marginBottom: 14 }]}>
                  <View style={styles.countryCodeBox}>
                    <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Owner Contact / Mobile Number *"
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

                {/* 2. Business Category & Type */}
                <Text style={styles.sectionHeader}>2. Business Type & Category</Text>

                <View style={{ marginBottom: 16 }}>
                  <Text style={styles.inputLabel}>Select Business Category:</Text>
                  <View style={styles.btypeGrid}>
                    {STANDARD_PARTNER_TYPES.map((b) => {
                      const isSelected = selectedBusinessType === b.id;
                      return (
                        <TouchableOpacity
                          key={b.id}
                          style={[styles.btypeCard, isSelected && styles.btypeCardActive]}
                          onPress={() => setSelectedBusinessType(b.id)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.btypeIcon}>{b.icon}</Text>
                          <Text style={[styles.btypeTitle, isSelected && styles.btypeTitleActive]}>
                            {b.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* 3. Business Name & Address */}
                <Text style={styles.sectionHeader}>3. Store Information</Text>

                <View style={[styles.inputContainer, { marginBottom: 14 }]}>
                  <TextInput
                    style={styles.input}
                    placeholder="Shop / Restaurant / Store Name *"
                    placeholderTextColor="#9CA3AF"
                    value={restaurantName}
                    onChangeText={setRestaurantName}
                    editable={!otpSent}
                  />
                </View>

                <View style={[styles.inputContainer, { marginBottom: 14 }]}>
                  <TextInput
                    style={styles.input}
                    placeholder="Full Address / Shop No, Street, Landmark *"
                    placeholderTextColor="#9CA3AF"
                    value={fullAddress}
                    onChangeText={setFullAddress}
                    editable={!otpSent}
                  />
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
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

                <TouchableOpacity style={styles.gpsBtn} onPress={handleDetectGps} disabled={detectingGps || otpSent}>
                  {detectingGps ? (
                    <ActivityIndicator size="small" color="#0066FF" />
                  ) : (
                    <Text style={styles.gpsBtnText}>
                      📍 Auto-Detect Store GPS ({latitude ? `${latitude.toFixed(4)}, ${longitude?.toFixed(4)}` : 'Tap to scan'})
                    </Text>
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
                        I agree to Ride Hub Merchant Partner Terms & Conditions (नियम एवं शर्तें)
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
                        <Text style={styles.primaryBtnText}>Verify OTP & Complete Store Registration →</Text>
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
                  <Text style={{ color: '#64748B', fontSize: 14 }}>Already registered? </Text>
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

            <View style={styles.footerBrand}>
              <Text style={styles.footerBrandText}>RIDE HUB MULTI VENDOR MERCHANT NETWORK</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <HindiTermsModal
        visible={termsModalVisible}
        onClose={() => setTermsModalVisible(false)}
        role="supplier"
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
    height: 180,
    backgroundColor: '#0066FF',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  personImage: {
    position: 'absolute',
    right: 0,
    top: 20,
    width: 170,
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
  btypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  btypeCard: {
    width: (width - 56) / 4,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  btypeCardActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#0066FF',
  },
  btypeIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  btypeTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },
  btypeTitleActive: {
    color: '#0066FF',
  },
  loginCatChip: {
    alignItems: 'center',
    marginRight: 12,
    width: 65,
  },
  loginCatThumb: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#E2E8F0',
    marginBottom: 4,
  },
  loginCatText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    textAlign: 'center',
  },
  termsBox: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
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
});