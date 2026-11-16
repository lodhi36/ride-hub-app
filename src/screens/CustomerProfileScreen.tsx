import React, { useState, useEffect, useCallback } from 'react';
import {
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
  Dimensions,
  Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'react-native-image-picker';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { PngIcon } from '../components/PngIcon';
import api, { UPLOADS_URL } from '../services/api';
import AddressSelectionModal from '../components/AddressSelectionModal';
import { CustomerMapLocationModal } from '../components/CustomerMapLocationModal';
import { CartService } from '../services/CartService';
import {
  getPermanentCustomerAddress,
  savePermanentCustomerAddress,
  DeliveryAddress,
} from '../services/LocationAddressService';
import LanguageSelectModal from '../components/LanguageSelectModal';
import { useAppLanguage } from '../context/LanguageContext';

const { width } = Dimensions.get('window');

const CustomerProfileScreen = ({ navigation }: any) => {
  const { user, updateUser, logout } = useAuth();
  const { isDark, toggleTheme, currentColors } = useTheme('customer');
  const { t, language } = useAppLanguage();
  const [showLangModal, setShowLangModal] = useState<boolean>(false);

  // Customer identity
  const [customerName, setCustomerName] = useState<string>(
    user?.name || user?.username || 'Customer'
  );
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [editNameText, setEditNameText] = useState<string>(
    user?.name || user?.username || 'Customer'
  );

  const [customerPhone, setCustomerPhone] = useState<string>(
    user?.phoneNumber || user?.phone || 'Not Provided'
  );
  const [customerEmail, setCustomerEmail] = useState<string>(
    user?.email || 'customer@ridehub.com'
  );
  const [customerAddress, setCustomerAddress] = useState<string>('Bhopal, Madhya Pradesh');

  const [customerOrdersCount, setCustomerOrdersCount] = useState<number>(0);
  const [customerCartCount, setCustomerCartCount] = useState<number>(CartService.getCartCount());

  const [uploading, setUploading] = useState<boolean>(false);
  const [addressModalVisible, setAddressModalVisible] = useState<boolean>(false);
  const [showMapModal, setShowMapModal] = useState<boolean>(false);

  // Phone OTP Update Modal State
  const [showPhoneModal, setShowPhoneModal] = useState<boolean>(false);
  const [newPhoneInput, setNewPhoneInput] = useState<string>('');
  const [otpInput, setOtpInput] = useState<string>('');
  const [otpSent, setOtpSent] = useState<boolean>(false);
  const [otpSending, setOtpSending] = useState<boolean>(false);
  const [otpVerifying, setOtpVerifying] = useState<boolean>(false);
  const [resendTimer, setResendTimer] = useState<number>(0);

  // Avatar resolution
  const rawPic = user?.profilePicture || user?.avatar || '';
  const avatarUri = rawPic
    ? rawPic.startsWith('http') || rawPic.startsWith('data:')
      ? rawPic
      : `${UPLOADS_URL}${rawPic.replace('/uploads', '')}`
    : null;

  // Strict identity sync: reset & refetch authoritative customer profile whenever user changes
  useEffect(() => {
    const authRole = String(user?.role || '').toLowerCase();
    if (!user || (authRole && !['customer', 'user'].includes(authRole))) {
      setCustomerName('Customer');
      setEditNameText('');
      setCustomerPhone('Not Provided');
      setCustomerEmail('');
      return;
    }
    setCustomerName(user.name || user.username || 'Customer');
    setEditNameText(user.name || user.username || 'Customer');
    setCustomerPhone(user.phoneNumber || user.phone || 'Not Provided');
    setCustomerEmail(user.email || '');

    let mounted = true;
    const refreshCustomerFromBackend = async () => {
      try {
        const custToken = await AsyncStorage.getItem('customerToken');
        if (!custToken) return;
        const res = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${custToken}`, 'X-Role': 'customer' },
        });
        const dbUser = res.data?.user;
        const dbRole = String(dbUser?.role || '').toLowerCase();
        if (mounted && res.data?.success && dbUser && (!dbRole || ['customer', 'user'].includes(dbRole))) {
          setCustomerName(dbUser.name || dbUser.username || 'Customer');
          setEditNameText(dbUser.name || dbUser.username || 'Customer');
          setCustomerPhone(dbUser.phoneNumber || dbUser.phone || 'Not Provided');
          setCustomerEmail(dbUser.email || '');
          await updateUser(dbUser);
        }
      } catch (_) {}
    };
    refreshCustomerFromBackend();
    return () => { mounted = false; };
  }, [user?._id, user?.id]);

  // Load permanent saved delivery address
  useEffect(() => {
    const loadAddress = async () => {
      try {
        const perm = await getPermanentCustomerAddress();
        if (perm?.fullAddress) {
          setCustomerAddress(perm.fullAddress);
        } else if (user?.fullAddress || user?.address || user?.location) {
          setCustomerAddress(user.fullAddress || user.address || user.location);
        }
      } catch (e) {}
    };
    loadAddress();
  }, [user]);

  // Subscribe to persistent Cart updates
  useEffect(() => {
    const unsub = CartService.subscribe((cartState) => {
      setCustomerCartCount(cartState.count);
    });
    return unsub;
  }, []);

  // Fetch real customer order count
  useEffect(() => {
    const fetchOrderStats = async () => {
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
    fetchOrderStats();
  }, [user?._id, user?.id]);

  // OTP Timer countdown
  useEffect(() => {
    let interval: any = null;
    if (resendTimer > 0) {
      interval = setInterval(() => setResendTimer((prev) => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  // Profile Avatar Upload
  const uploadAvatar = async (asset: any) => {
    try {
      setUploading(true);
      const formData = new FormData();
      const filename = asset.fileName || `avatar_${Date.now()}.jpg`;
      const type = asset.type || 'image/jpeg';
      formData.append('photo', {
        uri: Platform.OS === 'android' ? asset.uri : asset.uri.replace('file://', ''),
        name: filename,
        type: type,
      } as any);

      const res = await api.post('/profile/upload-photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data?.success && res.data.photoUrl) {
        const updatedPhoto = res.data.photoUrl;
        const uId = user?._id || user?.id;
        if (uId) {
          await api.put(`/profile/${uId}`, { profilePicture: updatedPhoto }).catch(() => {});
        }
        await updateUser({ profilePicture: updatedPhoto });
        Alert.alert('Success', 'Profile photo updated successfully!');
      } else {
        Alert.alert('Error', 'Could not upload photo. Please try again.');
      }
    } catch (err) {
      console.log('[CUSTOMER PHOTO UPLOAD ERROR]', err);
      Alert.alert('Error', 'Failed to upload photo.');
    } finally {
      setUploading(false);
    }
  };

  const handleSelectProfilePicture = () => {
    Alert.alert('Profile Photo', 'Choose an option to update your photo:', [
      {
        text: '📷 Take Photo',
        onPress: () => {
          ImagePicker.launchCamera(
            { mediaType: 'photo', quality: 0.7, maxWidth: 600, maxHeight: 600 },
            (response) => {
              if (response.didCancel || !response.assets || response.assets.length === 0) return;
              uploadAvatar(response.assets[0]);
            }
          );
        },
      },
      {
        text: '🖼️ Choose from Gallery',
        onPress: () => {
          ImagePicker.launchImageLibrary(
            { mediaType: 'photo', quality: 0.7, selectionLimit: 1, maxWidth: 600, maxHeight: 600 },
            (response) => {
              if (response.didCancel || !response.assets || response.assets.length === 0) return;
              uploadAvatar(response.assets[0]);
            }
          );
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // Save Name
  const handleSaveName = async () => {
    const trimmed = editNameText.trim();
    if (!trimmed) {
      Alert.alert('Invalid Name', 'Name cannot be empty.');
      return;
    }
    try {
      setUploading(true);
      const res = await api.put('/users/update-profile', { name: trimmed });
      if (!res.data?.success) {
        throw new Error(res.data?.message || 'Could not update name');
      }
      const nextUser = res.data.user ? { ...res.data.user } : { name: trimmed };
      await updateUser(nextUser);
      setCustomerName(nextUser.name || trimmed);
      setIsEditingName(false);
      Alert.alert('Success', 'Name updated successfully!');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'Could not update name.');
    } finally {
      setUploading(false);
    }
  };

  // Send OTP for Phone Update
  const handleSendPhoneOtp = async () => {
    const clean = newPhoneInput.replace(/[^0-9]/g, '').slice(-10);
    if (!clean || clean.length !== 10) {
      Alert.alert('Invalid Number', 'Please enter a valid 10-digit mobile number.');
      return;
    }
    const currentClean = String(customerPhone).replace(/[^0-9]/g, '').slice(-10);
    if (clean === currentClean) {
      Alert.alert('Same Number', 'The new number cannot be the same as your current registered number.');
      return;
    }

    try {
      setOtpSending(true);
      const res = await api.post('/auth/send-otp', {
        phoneNumber: clean,
        purpose: 'update_phone',
        role: 'customer',
      });

      if (res.data?.success) {
        setOtpSent(true);
        setResendTimer(45);
        Alert.alert('OTP Sent', `A 6-digit verification code has been sent to +91 ${clean}`);
      } else {
        Alert.alert('Notice', res.data?.message || 'Failed to send OTP.');
      }
    } catch (e: any) {
      Alert.alert('Notice', e?.response?.data?.message || 'Failed to send OTP.');
    } finally {
      setOtpSending(false);
    }
  };

  // Verify OTP for Phone Update
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
        const updatedData = {
          ...user,
          phoneNumber: cleanPhone,
          phone: cleanPhone,
        };
        await updateUser(updatedData);
        setCustomerPhone(cleanPhone);
        setShowPhoneModal(false);
        setNewPhoneInput('');
        setOtpInput('');
        setOtpSent(false);
        Alert.alert('Success', 'Mobile number updated successfully!');
      } else {
        Alert.alert('Verification Failed', res.data?.message || 'Could not verify OTP.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'OTP verification failed.');
    } finally {
      setOtpVerifying(false);
    }
  };

  // Clean Customer Log Out
  const handleCustomerLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out of your account?', [
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
            const { clearCustomerAddressCache } = require('../services/LocationAddressService');
            if (clearCustomerAddressCache) await clearCustomerAddressCache();
          } catch (_) {}
          await logout('CUSTOMER');
          navigation.reset({
            index: 0,
            routes: [{ name: 'RoleSelection' }],
          });
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, isDark && { backgroundColor: currentColors.background }]} edges={['top']}>
      <StatusBar hidden={false} barStyle="light-content" backgroundColor={isDark ? currentColors.secondaryBackground : '#0066FF'} />

      {uploading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.loadingOverlayText}>Saving changes...</Text>
        </View>
      )}

      {/* Address Selection Modal */}
      <AddressSelectionModal
        visible={addressModalVisible}
        onClose={() => setAddressModalVisible(false)}
        onSelectAddress={async (addr: DeliveryAddress) => {
          setAddressModalVisible(false);
          if (addr.fullAddress) {
            setCustomerAddress(addr.fullAddress);
            await savePermanentCustomerAddress(addr);
          }
          Alert.alert('Address Selected', 'Default delivery address updated!');
        }}
      />

      {/* Map Location Modal */}
      <CustomerMapLocationModal
        visible={showMapModal}
        onClose={() => setShowMapModal(false)}
        onLocationUpdated={(coords, fullAddr) => {
          setShowMapModal(false);
          setCustomerAddress(fullAddr);
        }}
      />

      <ScrollView showsVerticalScrollIndicator={false} bounces={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* ============================================================ */}
        {/* 1. TOP HEADER & CUSTOMER AVATAR CARD */}
        {/* ============================================================ */}
        <View style={[styles.header, isDark && { backgroundColor: currentColors.secondaryBackground }]}>
          <View style={styles.headerNavRow}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
              <Text style={styles.backBtnText}>‹ Back</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>My Profile</Text>
            <View style={{ width: 45 }} />
          </View>

          {/* Avatar Card */}
          <View style={[styles.avatarCard, isDark && { backgroundColor: currentColors.card, borderColor: currentColors.border, borderWidth: 1 }]}>
            <View style={styles.avatarWrap}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={[styles.avatarImg, isDark && { borderColor: '#38BDF8' }]} />
              ) : (
                <View style={[styles.avatarPlaceholder, isDark && { backgroundColor: currentColors.elevatedSurface, borderColor: currentColors.border }]}>
                  <PngIcon name="person" size={40} color={isDark ? currentColors.mutedText : '#0066FF'} />
                </View>
              )}
              <TouchableOpacity style={styles.avatarCameraBtn} onPress={handleSelectProfilePicture} activeOpacity={0.85}>
                <PngIcon name="camera" size={13} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {isEditingName ? (
              <View style={styles.editNameWrap}>
                <TextInput
                  style={[styles.nameInput, isDark && { backgroundColor: currentColors.inputBackground, color: currentColors.primaryText, borderColor: currentColors.border }]}
                  value={editNameText}
                  onChangeText={setEditNameText}
                  placeholder="Enter Full Name"
                  placeholderTextColor={currentColors.placeholder}
                  autoFocus
                />
                <TouchableOpacity style={styles.saveNameBtn} onPress={handleSaveName}>
                  <Text style={styles.saveNameBtnText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelNameBtn} onPress={() => setIsEditingName(false)}>
                  <Text style={styles.cancelNameBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.nameRow}>
                <Text style={[styles.customerNameText, isDark && { color: currentColors.primaryText }]}>{customerName}</Text>
                <TouchableOpacity
                  onPress={() => {
                    setEditNameText(customerName);
                    setIsEditingName(true);
                  }}
                  style={styles.pencilTouch}
                >
                  <PngIcon name="create" size={16} color={isDark ? '#60A5FA' : '#0066FF'} />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.badgeRow}>
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedBadgeText}>✓ VERIFIED CUSTOMER</Text>
              </View>
              <View style={styles.memberBadge}>
                <Text style={styles.memberBadgeText}>⚡ RIDE HUB MEMBER</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ============================================================ */}
        {/* 2. ACTIVITY STATS (ORDERS & CART) */}
        {/* ============================================================ */}
        <View style={[styles.statsCard, isDark && { backgroundColor: currentColors.card, borderColor: currentColors.border, borderWidth: 1 }]}>
          <TouchableOpacity
            style={styles.statItem}
            onPress={() => navigation.navigate('MyBookingsScreen', { role: 'customer', title: 'My Orders' })}
            activeOpacity={0.8}
          >
            <Text style={[styles.statNumber, isDark && { color: '#60A5FA' }]}>{customerOrdersCount}</Text>
            <Text style={[styles.statLabel, isDark && { color: currentColors.mutedText }]}>Orders Placed</Text>
          </TouchableOpacity>

          <View style={[styles.statDivider, isDark && { backgroundColor: currentColors.divider }]} />

          <TouchableOpacity
            style={styles.statItem}
            onPress={() => navigation.navigate('CartScreen')}
            activeOpacity={0.8}
          >
            <Text style={[styles.statNumber, isDark && { color: '#60A5FA' }]}>{customerCartCount}</Text>
            <Text style={[styles.statLabel, isDark && { color: currentColors.mutedText }]}>Items in Cart</Text>
          </TouchableOpacity>
        </View>

        {/* ============================================================ */}
        {/* 3. CUSTOMER ACCOUNT DETAILS CARD */}
        {/* ============================================================ */}
        <View style={[styles.detailsCard, isDark && { backgroundColor: currentColors.card, borderColor: currentColors.border, borderWidth: 1 }]}>
          <Text style={[styles.cardSectionHeader, isDark && { color: currentColors.primaryText }]}>Personal Information</Text>

          {/* Mobile Number Row */}
          <View style={[styles.infoRow, isDark && { borderBottomColor: currentColors.border }]}>
            <View style={[styles.infoIconBox, isDark && { backgroundColor: currentColors.elevatedSurface }]}>
              <PngIcon name="call" size={18} color="#0066FF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoLabel, isDark && { color: currentColors.mutedText }]}>Mobile Number</Text>
              <Text style={[styles.infoValue, isDark && { color: currentColors.primaryText }]}>+91 {customerPhone}</Text>
            </View>
            <TouchableOpacity
              style={styles.editPhoneBtn}
              onPress={() => {
                setNewPhoneInput('');
                setOtpInput('');
                setOtpSent(false);
                setShowPhoneModal(true);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.editPhoneBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>

          {/* Email Address Row */}
          <View style={[styles.infoRow, isDark && { borderBottomColor: currentColors.border }]}>
            <View style={[styles.infoIconBox, isDark && { backgroundColor: currentColors.elevatedSurface }]}>
              <PngIcon name="mail" size={18} color="#0066FF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoLabel, isDark && { color: currentColors.mutedText }]}>Email Address</Text>
              <Text style={[styles.infoValue, isDark && { color: currentColors.primaryText }]}>{customerEmail}</Text>
            </View>
          </View>

          {/* Delivery Address Row */}
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <View style={[styles.infoIconBox, isDark && { backgroundColor: currentColors.elevatedSurface }]}>
              <PngIcon name="location" size={18} color="#0066FF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoLabel, isDark && { color: currentColors.mutedText }]}>Delivery Address</Text>
              <Text style={[styles.infoValue, isDark && { color: currentColors.primaryText }]} numberOfLines={2}>
                {customerAddress}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.editPhoneBtn}
              onPress={() => setAddressModalVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.editPhoneBtnText}>Change</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ============================================================ */}
        {/* 4. QUICK SHORTCUTS & SUPPORT */}
        {/* ============================================================ */}
        <View style={[styles.menuCard, isDark && { backgroundColor: currentColors.card, borderColor: currentColors.border, borderWidth: 1 }]}>
          <Text style={[styles.cardSectionHeader, isDark && { color: currentColors.primaryText }]}>Quick Shortcuts & Settings</Text>

          {/* DARK MODE SWITCH ROW */}
          <View style={[styles.menuRow, isDark && { borderBottomColor: currentColors.border }]}>
            <View style={[styles.menuIconWrap, { backgroundColor: isDark ? currentColors.elevatedSurface : '#EFF6FF' }]}>
              <PngIcon name="moon" size={18} color={isDark ? '#FACC15' : '#475569'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuRowText, isDark && { color: currentColors.primaryText }]}>Dark Mode</Text>
              <Text style={{ fontSize: 11, color: isDark ? currentColors.secondaryText : '#64748B' }}>
                {isDark ? 'Dark theme enabled' : 'Light theme enabled'}
              </Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: '#CBD5E1', true: '#3B82F6' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <TouchableOpacity
            style={[styles.menuRow, isDark && { borderBottomColor: currentColors.border }]}
            onPress={() => navigation.navigate('MyBookingsScreen', { role: 'customer', title: 'My Orders' })}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: isDark ? currentColors.elevatedSurface : '#EFF6FF' }]}>
              <PngIcon name="document-text" size={18} color="#0066FF" />
            </View>
            <Text style={[styles.menuRowText, isDark && { color: currentColors.primaryText }]}>My Orders</Text>
            <Text style={[styles.menuChevron, isDark && { color: currentColors.disabled }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuRow, isDark && { borderBottomColor: currentColors.border }]}
            onPress={() => navigation.navigate('CartScreen')}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: isDark ? currentColors.elevatedSurface : '#EFF6FF' }]}>
              <PngIcon name="cart" size={18} color="#0066FF" />
            </View>
            <Text style={[styles.menuRowText, isDark && { color: currentColors.primaryText }]}>My Cart ({customerCartCount})</Text>
            <Text style={[styles.menuChevron, isDark && { color: currentColors.disabled }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuRow, isDark && { borderBottomColor: currentColors.border }]}
            onPress={() => setAddressModalVisible(true)}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: isDark ? currentColors.elevatedSurface : '#EFF6FF' }]}>
              <PngIcon name="location" size={18} color="#0066FF" />
            </View>
            <Text style={[styles.menuRowText, isDark && { color: currentColors.primaryText }]}>Saved Delivery Addresses</Text>
            <Text style={[styles.menuChevron, isDark && { color: currentColors.disabled }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuRow, isDark && { borderBottomColor: currentColors.border }]}
            onPress={() => navigation.navigate('Notifications')}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: isDark ? currentColors.elevatedSurface : '#EFF6FF' }]}>
              <PngIcon name="notifications" size={18} color="#0066FF" />
            </View>
            <Text style={[styles.menuRowText, isDark && { color: currentColors.primaryText }]}>Notifications</Text>
            <Text style={[styles.menuChevron, isDark && { color: currentColors.disabled }]}>›</Text>
          </TouchableOpacity>

          {/* Language Selection Option */}
          <TouchableOpacity
            style={[styles.menuRow, isDark && { borderBottomColor: currentColors.border }]}
            onPress={() => setShowLangModal(true)}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: isDark ? currentColors.elevatedSurface : '#EFF6FF' }]}>
              <PngIcon name="globe" size={18} color="#0066FF" />
            </View>
            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.menuRowText, isDark && { color: currentColors.primaryText }]}>{t('common.change_language', 'Change Language')}</Text>
              <Text style={{ fontSize: 13, color: '#0066FF', fontWeight: '700', marginRight: 8 }}>
                {language === 'hi' ? 'हिन्दी 🇮🇳' : 'English 🇬🇧'}
              </Text>
            </View>
            <Text style={[styles.menuChevron, isDark && { color: currentColors.disabled }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuRow, isDark && { borderBottomColor: currentColors.border }]}
            onPress={() => navigation.navigate('HelpCenter')}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: isDark ? currentColors.elevatedSurface : '#EFF6FF' }]}>
              <PngIcon name="call" size={18} color="#0066FF" />
            </View>
            <Text style={[styles.menuRowText, isDark && { color: currentColors.primaryText }]}>Help & Support</Text>
            <Text style={[styles.menuChevron, isDark && { color: currentColors.disabled }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuRow, isDark && { borderBottomColor: currentColors.border }]}
            onPress={() => navigation.navigate('Terms')}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: isDark ? currentColors.elevatedSurface : '#EFF6FF' }]}>
              <PngIcon name="document-text" size={18} color="#0066FF" />
            </View>
            <Text style={[styles.menuRowText, isDark && { color: currentColors.primaryText }]}>Terms & Conditions</Text>
            <Text style={[styles.menuChevron, isDark && { color: currentColors.disabled }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuRow, { borderBottomWidth: 0 }]}
            onPress={() => navigation.navigate('Privacy')}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: isDark ? currentColors.elevatedSurface : '#EFF6FF' }]}>
              <PngIcon name="shield-checkmark" size={18} color="#0066FF" />
            </View>
            <Text style={[styles.menuRowText, isDark && { color: currentColors.primaryText }]}>Privacy Policy</Text>
            <Text style={[styles.menuChevron, isDark && { color: currentColors.disabled }]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* ============================================================ */}
        {/* 5. LOG OUT BUTTON */}
        {/* ============================================================ */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleCustomerLogout}
          activeOpacity={0.8}
        >
          <PngIcon name="log-out" size={18} color="#EF4444" style={{ marginRight: 8 }} />
          <Text style={styles.logoutBtnText}>Log Out</Text>
        </TouchableOpacity>

        <Text style={[styles.versionText, isDark && { color: currentColors.mutedText }]}>Ride Hub Multi Vendor v2.0 • Customer Edition</Text>
      </ScrollView>

      {/* ============================================================ */}
      {/* 6. EDIT PHONE NUMBER OTP MODAL */}
      {/* ============================================================ */}
      <Modal
        visible={showPhoneModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPhoneModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isDark && { backgroundColor: currentColors.card, borderColor: currentColors.border, borderWidth: 1 }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, isDark && { color: currentColors.primaryText }]}>📱 Update Mobile Number</Text>
              <TouchableOpacity onPress={() => setShowPhoneModal(false)}>
                <Text style={[styles.modalCloseText, isDark && { color: currentColors.primaryText }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSubText, isDark && { color: currentColors.secondaryText }]}>
              Enter your new 10-digit mobile number. We will send a verification code (OTP).
            </Text>

            {/* Current Number */}
            <View style={[styles.modalCurrentBox, isDark && { backgroundColor: currentColors.elevatedSurface, borderColor: currentColors.border }]}>
              <Text style={[styles.modalCurrentLabel, isDark && { color: currentColors.mutedText }]}>Current Registered Number</Text>
              <Text style={[styles.modalCurrentValue, isDark && { color: currentColors.primaryText }]}>+91 {customerPhone}</Text>
            </View>

            {/* New Number Input */}
            <Text style={[styles.modalInputLabel, isDark && { color: currentColors.primaryText }]}>New Mobile Number</Text>
            <View style={[styles.modalPhoneInputRow, isDark && { backgroundColor: currentColors.inputBackground, borderColor: currentColors.border }]}>
              <Text style={[styles.modalPrefix, isDark && { color: currentColors.secondaryText }]}>+91</Text>
              <TextInput
                style={[styles.modalPhoneInput, isDark && { color: currentColors.primaryText }]}
                value={newPhoneInput}
                onChangeText={(val) => {
                  setNewPhoneInput(val);
                  if (otpSent) setOtpSent(false);
                }}
                placeholder="Enter 10-digit number"
                placeholderTextColor={currentColors.placeholder}
                keyboardType="phone-pad"
                maxLength={10}
                editable={!otpSending && !otpVerifying}
              />
            </View>

            {!otpSent ? (
              <TouchableOpacity
                style={[
                  styles.modalPrimaryBtn,
                  (newPhoneInput.replace(/[^0-9]/g, '').length !== 10 || otpSending) && styles.modalBtnDisabled,
                ]}
                onPress={handleSendPhoneOtp}
                disabled={newPhoneInput.replace(/[^0-9]/g, '').length !== 10 || otpSending}
                activeOpacity={0.8}
              >
                {otpSending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalPrimaryBtnText}>Send Verification OTP →</Text>
                )}
              </TouchableOpacity>
            ) : (
              <View style={{ marginTop: 12 }}>
                <Text style={[styles.modalInputLabel, isDark && { color: currentColors.primaryText }]}>Enter 6-Digit OTP</Text>
                <TextInput
                  style={[styles.modalOtpInput, isDark && { backgroundColor: currentColors.inputBackground, borderColor: currentColors.border, color: currentColors.primaryText }]}
                  value={otpInput}
                  onChangeText={setOtpInput}
                  placeholder="• • • • • •"
                  placeholderTextColor={currentColors.placeholder}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!otpVerifying}
                />

                <TouchableOpacity
                  style={[
                    styles.modalPrimaryBtn,
                    (otpInput.trim().length !== 6 || otpVerifying) && styles.modalBtnDisabled,
                  ]}
                  onPress={handleVerifyAndUpdatePhone}
                  disabled={otpInput.trim().length !== 6 || otpVerifying}
                  activeOpacity={0.8}
                >
                  {otpVerifying ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalPrimaryBtnText}>✓ Verify & Update Number</Text>
                  )}
                </TouchableOpacity>

                {/* Resend OTP Row */}
                <View style={styles.resendRow}>
                  {resendTimer > 0 ? (
                    <Text style={styles.resendTimerText}>Resend OTP in {resendTimer}s</Text>
                  ) : (
                    <TouchableOpacity onPress={handleSendPhoneOtp} disabled={otpSending}>
                      <Text style={styles.resendActiveText}>Resend OTP</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Language Selection Modal */}
      <LanguageSelectModal
        visible={showLangModal}
        onClose={() => setShowLangModal(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlayText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 10,
  },
  header: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  avatarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarImg: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 3,
    borderColor: '#0066FF',
  },
  avatarPlaceholder: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#BFDBFE',
  },
  avatarCameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0066FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  customerNameText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
  },
  pencilTouch: {
    padding: 4,
  },
  editNameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    width: '100%',
    paddingHorizontal: 10,
  },
  nameInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#0066FF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '700',
    backgroundColor: '#F8FAFC',
  },
  saveNameBtn: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  saveNameBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  cancelNameBtn: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  cancelNameBtnText: {
    color: '#475569',
    fontWeight: 'bold',
    fontSize: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  verifiedBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  verifiedBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#15803D',
  },
  memberBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  memberBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#0066FF',
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 20,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
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
    height: 32,
    backgroundColor: '#E2E8F0',
  },
  detailsCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardSectionHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  infoIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  editPhoneBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  editPhoneBtnText: {
    color: '#0066FF',
    fontSize: 12,
    fontWeight: '800',
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuRowText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  menuChevron: {
    fontSize: 18,
    color: '#94A3B8',
    fontWeight: 'bold',
  },
  logoutBtn: {
    backgroundColor: '#FEF2F2',
    marginHorizontal: 16,
    marginTop: 18,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FECACA',
  },
  logoutBtnText: {
    color: '#DC2626',
    fontSize: 15,
    fontWeight: '800',
  },
  versionText: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
    elevation: 6,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalCloseText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#64748B',
    padding: 4,
  },
  modalSubText: {
    fontSize: 12.5,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 14,
  },
  modalCurrentBox: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  modalCurrentLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  modalCurrentValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
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
    borderRadius: 14,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  modalPrefix: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginRight: 6,
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
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 18,
    fontWeight: '900',
    color: '#0066FF',
    textAlign: 'center',
    letterSpacing: 6,
    marginBottom: 12,
  },
  modalPrimaryBtn: {
    backgroundColor: '#0066FF',
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  modalBtnDisabled: {
    backgroundColor: '#93C5FD',
  },
  resendRow: {
    alignItems: 'center',
    marginTop: 10,
  },
  resendTimerText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  resendActiveText: {
    fontSize: 12.5,
    color: '#0066FF',
    fontWeight: '800',
  },
});

export default CustomerProfileScreen;
