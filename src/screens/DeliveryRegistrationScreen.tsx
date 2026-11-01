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
import Icon from '../components/PngIcon';
import { fetchCurrentGpsPosition, reverseGeocodeCoords } from '../services/LocationAddressService';
import HindiTermsModal from '../components/HindiTermsModal';

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

  // Input Fields
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [usePasswordLogin, setUsePasswordLogin] = useState(false);

  // Delivery Partner Details
  const [fullName, setFullName] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('🛵 Motorcycle / Bike');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [drivingLicense, setDrivingLicense] = useState('');
  const [currentAddress, setCurrentAddress] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [area, setArea] = useState('');
  const [upiId, setUpiId] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [selectedZone, setSelectedZone] = useState<string>('New Bhopal');
  const [selectedZoneId, setSelectedZoneId] = useState<string>('new_bhopal');
  const [selectedZoneTagline, setSelectedZoneTagline] = useState<string>('MP Nagar • Arera Colony • Shahpura • Kolar');

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
          Alert.alert(
            'Rider Location Detected ✅',
            `Area: ${geo.area || geo.city}\nAddress: ${formatted}\n\nCity and Address auto-filled!`
          );
        } else {
          Alert.alert('Location Detected ✅', `Lat: ${pos.latitude.toFixed(4)}, Lon: ${pos.longitude.toFixed(4)}`);
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
    await AsyncStorage.setItem('deliveryToken', token);
    await AsyncStorage.setItem('deliveryUser', JSON.stringify(user));
    await AsyncStorage.setItem('activeRole', 'DELIVERY');
    await AsyncStorage.setItem('userToken', token);
    if (refreshToken) {
      await AsyncStorage.setItem('refreshToken', refreshToken);
    }

    await login(token, refreshToken || '', user);

    // Redirect to Delivery Rider Home Dashboard
    navigation.reset({
      index: 0,
      routes: [{ name: 'DeliveryRiderHomeScreen', params: { riderName: user.name, riderId: user._id || user.id } }],
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
      if (!fullName.trim()) {
        Alert.alert('Required Field', 'Please enter your Full Name.');
        return;
      }
      if (!vehicleNumber.trim()) {
        Alert.alert('Vehicle Required', 'Please enter your vehicle registration number.');
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
      if (err.response?.data?.notFound && isLogin) {
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
      Alert.alert('Login Failed', msg);
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
        fullAddress: currentAddress.trim() || undefined,
        address: currentAddress.trim() || undefined,
        city: city.trim() || undefined,
        pincode: pincode.trim() || undefined,
        upiId: upiId.trim() || undefined,
        latitude: sendLat || null,
        longitude: sendLon || null,
        zone: selectedZone,
        selectedZone: selectedZone,
        zoneId: selectedZoneId,
        tagline: selectedZoneTagline,
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
      Alert.alert('Registration Error', msg);
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
            <Image source={require('../banner/bike.png')} style={styles.bikeImage} resizeMode="contain" />
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
                <Text style={styles.expressText}>DELIVERY PARTNER PORTAL</Text>
                <Text style={styles.speedLine}>—</Text>
              </View>

              <View style={styles.trustedBadge}>
                <Text style={styles.trustedStar}>★</Text>
                <Text style={styles.trustedText}>Earn on Every Delivery • Flexible Hours</Text>
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

                {/* 2. Vehicle & Fleet Information */}
                <Text style={styles.sectionHeader}>2. Vehicle & Fleet Type</Text>
                <View style={{ marginBottom: 14 }}>
                  <Text style={styles.inputLabel}>Select Your Delivery Vehicle:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                    {VEHICLE_TYPES.map((v) => {
                      const isSelected = selectedVehicle === v.name;
                      return (
                        <TouchableOpacity
                          key={v.id}
                          style={[styles.vehicleChip, isSelected && styles.vehicleChipActive]}
                          onPress={() => setSelectedVehicle(v.name)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.vehicleChipText, isSelected && styles.vehicleChipTextActive]}>
                            {v.label || v.name}
                          </Text>
                          {v.desc ? <Text style={{ fontSize: 10, color: isSelected ? '#fff' : '#64748B', marginTop: 2, textAlign: 'center' }} numberOfLines={1}>{v.desc}</Text> : null}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                <View style={[styles.inputContainer, { marginBottom: 12 }]}>
                  <TextInput
                    style={styles.input}
                    placeholder="Vehicle Number (e.g. DL 01 AB 1234) *"
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
                    placeholder="Driving License No. (Optional for Cycle)"
                    placeholderTextColor="#9CA3AF"
                    value={drivingLicense}
                    onChangeText={setDrivingLicense}
                    autoCapitalize="characters"
                    editable={!otpSent}
                  />
                </View>

                {/* 3. Operating City & Location */}
                <Text style={styles.sectionHeader}>3. Service City & Location</Text>
                
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

                <TouchableOpacity style={styles.gpsBtn} onPress={handleDetectGps} disabled={detectingGps || otpSent}>
                  {detectingGps ? (
                    <ActivityIndicator size="small" color="#0066FF" />
                  ) : (
                    <Text style={styles.gpsBtnText}>
                      📍 Auto-Detect GPS & Address ({latitude ? `${latitude.toFixed(4)}, ${longitude?.toFixed(4)}` : 'Tap to scan'})
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

            {/* Footer */}
            <View style={styles.footerBrand}>
              <Text style={styles.footerBrandText}>RIDE HUB MULTI VENDOR DELIVERY</Text>
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
    height: 180,
    backgroundColor: '#0066FF',
    justifyContent: 'flex-end',
    position: 'relative',
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
});
