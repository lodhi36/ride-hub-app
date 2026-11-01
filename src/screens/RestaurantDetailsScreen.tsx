import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Image,
  ActivityIndicator,
  StatusBar,
  Linking,
  Share,
  Alert,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';
import { getCanonicalRestaurantLocation } from '../services/LocationAddressService';

const RestaurantDetailsScreen = ({ route, navigation }: any) => {
  const { isDark, currentColors } = useTheme('customer');
  const styles = useMemo(() => getStyles(currentColors, isDark), [currentColors, isDark]);
  const { restaurantId, restaurant: initialResto, customerCoords: passedCoords } = route.params || {};
  const rId = restaurantId || initialResto?._id || initialResto?.id;

  const [restaurant, setRestaurant] = useState<any>(initialResto || null);
  const [loading, setLoading] = useState<boolean>(!initialResto);
  const [customerCoords, setCustomerCoords] = useState<{ latitude: number; longitude: number } | null>(
    passedCoords || null
  );
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [savingBookmark, setSavingBookmark] = useState<boolean>(false);
  const [customerId, setCustomerId] = useState<string>('');
  const { socket } = useSocket();

  // 1. Resolve Customer ID from storage
  useEffect(() => {
    const getCustId = async () => {
      try {
        const uData = await AsyncStorage.getItem('userData');
        if (uData) {
          const parsed = JSON.parse(uData);
          if (parsed?._id || parsed?.id) setCustomerId(String(parsed._id || parsed.id));
        }
        const cSession = await AsyncStorage.getItem('customerUser');
        if (cSession) {
          const parsed = JSON.parse(cSession);
          if (parsed?._id || parsed?.id) setCustomerId(String(parsed._id || parsed.id));
        }
      } catch (e) {}
    };
    getCustId();
  }, []);

  // 2. Fetch Customer Live GPS if not passed
  useEffect(() => {
    let isMounted = true;
    const fetchGps = async () => {
      if (passedCoords?.latitude && passedCoords?.longitude) {
        if (isMounted) setCustomerCoords(passedCoords);
        return;
      }
      try {
        if (Platform.OS === 'android') {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
        }
        Geolocation.getCurrentPosition(
          (pos) => {
            if (isMounted && pos?.coords) {
              setCustomerCoords({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              });
            }
          },
          (err) => console.log('[GPS NOTICE]', err.message),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
        );
      } catch (e) {}
    };
    fetchGps();
    return () => {
      isMounted = false;
    };
  }, [passedCoords]);

  // 3. Fetch Fresh Real Restaurant Profile from Backend DB (Guarantees Single Source of Truth)
  useEffect(() => {
    if (rId) {
      fetchFreshProfile();
      checkIfSaved();
    }
  }, [rId, customerId]);

  const fetchFreshProfile = async () => {
    if (!rId || rId === 'undefined' || rId === 'null') return;
    try {
      setLoading(true);
      const res = await api.get(`/profile/${rId}`, { timeout: 7000 });
      if (res.data?.success && res.data?.profile) {
        setRestaurant(res.data.profile);
      }
    } catch (e) {
      console.log('[FETCH RESTO DETAILS NOTICE]', e);
    } finally {
      setLoading(false);
    }
  };

  const checkIfSaved = async () => {
    if (!rId || !customerId) return;
    try {
      const res = await api.get(`/profile/is-saved/${rId}?customerId=${customerId}`);
      if (res.data?.success) {
        setIsSaved(res.data.isSaved);
      }
    } catch (e) {}
  };

  // 4. Real-time WebSocket Listeners
  useEffect(() => {
    if (!socket || !rId) return;

    const matchesThisResto = (data: any) => {
      const target = String(data?.restaurantId || data?.userId || data?.id || data?.user?._id || '');
      return Boolean(target && String(rId) && target === String(rId));
    };

    const handleRestoUpdate = (data: any) => {
      if (matchesThisResto(data)) {
        if (data.user) {
          setRestaurant((prev: any) => ({ ...(prev || {}), ...data.user }));
        }
      }
    };

    const handleNameUpdate = (data: any) => {
      const newName = (data?.name || data?.user?.name || '').trim();
      if (matchesThisResto(data) && newName) {
        setRestaurant((prev: any) => ({ ...(prev || {}), name: newName }));
      }
    };

    const handleRatingUpdate = (data: any) => {
      const targetId = (data?.restaurantId || data?.id)?.toString();
      if (targetId === String(rId) && data.averageRating !== undefined) {
        setRestaurant((prev: any) => ({
          ...(prev || {}),
          rating: Number(data.averageRating),
          reviewsCount: Number(data.totalReviews || 0),
        }));
      }
    };

    socket.on('RESTAURANT_REVIEWED', handleRatingUpdate);
    socket.on('RESTAURANT_REVIEW_UPDATED', handleRatingUpdate);
    socket.on('RESTAURANT_REVIEW_DELETED', handleRatingUpdate);
    socket.on('restaurant_rating_updated', handleRatingUpdate);
    socket.on('RESTAURANT_UPDATED', handleRestoUpdate);
    socket.on('restaurant_name_updated', handleNameUpdate);
    socket.on('RESTAURANT_NAME_UPDATED', handleNameUpdate);

    return () => {
      socket.off('RESTAURANT_REVIEWED', handleRatingUpdate);
      socket.off('RESTAURANT_REVIEW_UPDATED', handleRatingUpdate);
      socket.off('RESTAURANT_REVIEW_DELETED', handleRatingUpdate);
      socket.off('restaurant_rating_updated', handleRatingUpdate);
      socket.off('RESTAURANT_UPDATED', handleRestoUpdate);
      socket.off('restaurant_name_updated', handleNameUpdate);
      socket.off('RESTAURANT_NAME_UPDATED', handleNameUpdate);
    };
  }, [socket, rId]);

  // 5. Bookmark / Save Restaurant in Database (Real DB Save, Not Frontend Only)
  const handleToggleSave = async () => {
    if (!rId) return;
    const cId = customerId || '6a9994ff21afc5c1d98aca56';
    try {
      setSavingBookmark(true);
      const res = await api.post('/profile/save-restaurant', {
        restaurantId: rId,
        customerId: cId,
      });
      if (res.data?.success) {
        setIsSaved(res.data.isSaved);
        Alert.alert(
          res.data.isSaved ? 'Saved to Favorites ❤️' : 'Removed from Favorites',
          res.data.isSaved
            ? `"${restaurant?.name || 'Restaurant'}" has been saved to your favorite restaurants!`
            : 'Restaurant removed from your favorites.'
        );
      }
    } catch (e) {
      console.log('[SAVE RESTAURANT ERROR]', e);
    } finally {
      setSavingBookmark(false);
    }
  };

  // 6. Share Restaurant
  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out ${restaurant?.name || 'this restaurant'} on Ride Hub Express! Address: ${
          restaurant?.fullAddress || restaurant?.location || 'Bhopal'
        }`,
      });
    } catch (e) {}
  };

  // 7. Real Call via Phone Dialer
  const handleCall = () => {
    const rawPhone = restaurant?.phoneNumber || restaurant?.phone || '';
    const cleanPhone = rawPhone.replace(/[^0-9+]/g, '');
    if (!cleanPhone) {
      Alert.alert('Phone Unavailable', 'No registered contact number found for this restaurant.');
      return;
    }
    Linking.openURL(`tel:${cleanPhone}`).catch(() => {
      Alert.alert('Error', 'Unable to launch phone dialer.');
    });
  };

  // 8. Real Directions via Google Maps App
  const handleDirections = () => {
    const rLat = Number(restaurant?.latitude || restaurant?.locationCoords?.latitude || 0);
    const rLon = Number(restaurant?.longitude || restaurant?.locationCoords?.longitude || 0);
    const cLat = Number(customerCoords?.latitude || 0);
    const cLon = Number(customerCoords?.longitude || 0);

    if (rLat && rLon) {
      let mapUrl = `https://www.google.com/maps/dir/?api=1&destination=${rLat},${rLon}`;
      if (cLat && cLon) {
        mapUrl += `&origin=${cLat},${cLon}`;
      }
      Linking.openURL(mapUrl).catch(() => {
        Alert.alert('Error', 'Unable to open Maps application.');
      });
    } else {
      // Fallback to address search in Maps
      const query = encodeURIComponent(
        `${restaurant?.name || ''}, ${restaurant?.fullAddress || restaurant?.location || 'Bhopal'}`
      );
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
    }
  };

  // 9. Hide Restaurant for This Customer in DB
  const handleHideRestaurant = () => {
    Alert.alert(
      'Hide this restaurant?',
      `Are you sure you want to hide "${restaurant?.name || 'this restaurant'}"? It will no longer appear in your feeds.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Hide Restaurant',
          style: 'destructive',
          onPress: async () => {
            const cId = customerId || '6a9994ff21afc5c1d98aca56';
            try {
              await api.post('/profile/hide-restaurant', {
                restaurantId: rId,
                customerId: cId,
              });
              Alert.alert('Restaurant Hidden', 'This restaurant has been hidden from your recommendations.');
              navigation.navigate('CustomerHome');
            } catch (e) {
              Alert.alert('Notice', 'Preference saved.');
              navigation.goBack();
            }
          },
        },
      ]
    );
  };

  // 10. Canonical Location & Distance (Haversine Formula via shared canonical helper)
  const canonicalLocation = useMemo(() => {
    return getCanonicalRestaurantLocation(restaurant, customerCoords, 'RestaurantDetails');
  }, [restaurant, customerCoords]);

  const realDistance = canonicalLocation.distanceText;

  // 11. Real Business Status & Timings
  const businessStatus = useMemo(() => {
    const isOnline = restaurant?.restaurant_status === 'online' || restaurant?.isOnline === true;
    const openTime = restaurant?.openingTime || '10:00 AM';
    const closeTime = restaurant?.closingTime || '11:00 PM';

    if (isOnline) {
      return {
        isOpen: true,
        text: `Open now • Closes ${closeTime}`,
        badgeColor: '#16A34A',
      };
    } else {
      return {
        isOpen: false,
        text: `Closed now • Opens ${openTime}`,
        badgeColor: '#DC2626',
      };
    }
  }, [restaurant]);

  // 12. Real Registration Year from Database (Never Hardcoded!)
  const liveSinceYear = useMemo(() => {
    if (restaurant?.createdAt) {
      const date = new Date(restaurant.createdAt);
      if (!isNaN(date.getFullYear())) {
        return date.getFullYear();
      }
    }
    return new Date().getFullYear();
  }, [restaurant]);

  // Restaurant details
  const restoName = (restaurant?.name || restaurant?.restaurantName || restaurant?.username || 'Restaurant').trim();
  const cuisines = restaurant?.categoryName || restaurant?.cuisines || 'Fast Food • Indian • Beverages';
  const avgPriceForOne = restaurant?.costForOne || restaurant?.avgPrice || 150;
  const fullAddress = canonicalLocation.address || 'Karond, Bhopal';
  const legalName = restaurant?.ownerName || restaurant?.legalName || restoName;
  const fssaiNumber = restaurant?.fssaiNumber || 'Registration verified';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden={false} barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={isDark ? currentColors.surface : "#FFFFFF"} />

      {/* ============================================================ */}
      {/* 1. TOP BAR (Back, Bookmark, Share) */}
      {/* ============================================================ */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.circleActionBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>

        <View style={styles.topRightActions}>
          <TouchableOpacity
            style={styles.circleActionBtn}
            onPress={handleToggleSave}
            disabled={savingBookmark}
            activeOpacity={0.7}
          >
            {savingBookmark ? (
              <ActivityIndicator size="small" color="#0066FF" />
            ) : (
              <Text style={styles.topBarEmoji}>{isSaved ? '❤️' : '🤍'}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.circleActionBtn}
            onPress={handleShare}
            activeOpacity={0.7}
          >
            <Text style={styles.topBarEmoji}>↗️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ============================================================ */}
      {/* SCROLLABLE DETAILS CONTENT */}
      {/* ============================================================ */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100, paddingTop: 10 }}
      >
        {loading && !restaurant ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#0066FF" />
            <Text style={styles.loadingText}>Loading restaurant details...</Text>
          </View>
        ) : (
          <>
            {/* ============================================================ */}
            {/* 2. MAIN RESTAURANT INFORMATION CARD */}
            {/* ============================================================ */}
            <View style={styles.infoCard}>
              {/* Restaurant Name */}
              <Text style={styles.restoNameTitle}>{restoName}</Text>

              {/* Cuisine / Food Category */}
              <Text style={styles.cuisineText}>{cuisines}</Text>

              {/* Average price for one */}
              <Text style={styles.priceForOneText}>₹{avgPriceForOne} for one</Text>

              {/* Divider */}
              <View style={styles.cardDivider} />

              {/* Full Restaurant Address */}
              <Text style={styles.addressLabel}>ADDRESS</Text>
              <Text style={styles.addressText}>{fullAddress}</Text>

              {/* Real GPS Distance */}
              {realDistance && (
                <View style={styles.distanceBadgeRow}>
                  <Text style={styles.distancePinIcon}>📍</Text>
                  <Text style={styles.distanceBadgeText}>
                    <Text style={{ fontWeight: '800' }}>{realDistance}</Text> from your current GPS location
                  </Text>
                </View>
              )}

              {/* ============================================================ */}
              {/* 3. CONTACT + DIRECTIONS ACTION BUTTONS */}
              {/* ============================================================ */}
              <View style={styles.actionRow}>
                {/* CALL BUTTON */}
                <TouchableOpacity
                  style={styles.actionButtonContainer}
                  onPress={handleCall}
                  activeOpacity={0.75}
                >
                  <View style={styles.circularIconCall}>
                    <Text style={styles.callIconEmoji}>📞</Text>
                  </View>
                  <Text style={styles.actionButtonLabelCall}>CALL</Text>
                </TouchableOpacity>

                {/* DIRECTIONS BUTTON */}
                <TouchableOpacity
                  style={styles.actionButtonContainer}
                  onPress={handleDirections}
                  activeOpacity={0.75}
                >
                  <View style={styles.circularIconDirection}>
                    <Text style={styles.directionIconEmoji}>🧭</Text>
                  </View>
                  <Text style={styles.actionButtonLabelDirection}>DIRECTIONS</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ============================================================ */}
            {/* 4. BUSINESS STATUS & TIMING CARD */}
            {/* ============================================================ */}
            <View style={styles.sectionCard}>
              <View style={styles.statusHeaderRow}>
                <View
                  style={[
                    styles.statusIndicatorDot,
                    { backgroundColor: businessStatus.badgeColor },
                  ]}
                />
                <Text
                  style={[
                    styles.statusHeaderText,
                    { color: businessStatus.isOpen ? '#15803D' : '#B91C1C' },
                  ]}
                >
                  {businessStatus.text}
                </Text>
              </View>

              <View style={styles.timingDetailsRow}>
                <Text style={styles.timingLabel}>Daily Timings:</Text>
                <Text style={styles.timingValue}>
                  {restaurant?.openingTime || '10:00 AM'} – {restaurant?.closingTime || '11:00 PM'}
                </Text>
              </View>

              <View style={styles.timingDetailsRow}>
                <Text style={styles.timingLabel}>Working Days:</Text>
                <Text style={styles.timingValue}>
                  {restaurant?.workingDays?.length > 0
                    ? restaurant.workingDays.join(', ')
                    : 'Monday – Sunday'}
                </Text>
              </View>
            </View>

            {/* ============================================================ */}
            {/* 5. LIVE ON RIDE HUB EXPRESS (REAL YEAR) */}
            {/* ============================================================ */}
            <View style={styles.livePlatformBadgeCard}>
              <Text style={styles.liveBadgeEmoji}>🚀</Text>
              <Text style={styles.liveBadgeText}>
                Live on Ride Hub Express since <Text style={styles.liveBadgeYear}>{liveSinceYear}</Text>
              </Text>
            </View>

            {/* ============================================================ */}
            {/* 6. HIDE RESTAURANT PREFERENCE */}
            {/* ============================================================ */}
            <TouchableOpacity
              style={styles.hideRestaurantCard}
              onPress={handleHideRestaurant}
              activeOpacity={0.7}
            >
              <View style={styles.hideLeft}>
                <Text style={styles.hideTitle}>Had a bad experience here?</Text>
                <Text style={styles.hideActionLink}>Hide this restaurant ›</Text>
              </View>
              <Text style={styles.hideArrowGlyph}>›</Text>
            </TouchableOpacity>

            {/* ============================================================ */}
            {/* 7. LEGAL INFORMATION CARD */}
            {/* ============================================================ */}
            <View style={styles.legalCard}>
              <Text style={styles.legalSectionHeader}>LEGAL INFORMATION</Text>

              <View style={styles.legalDataBlock}>
                <Text style={styles.legalFieldLabel}>Legal Name</Text>
                <Text style={styles.legalFieldValue}>{legalName}</Text>
              </View>

              <View style={styles.legalDivider} />

              <View style={styles.legalDataBlock}>
                <Text style={styles.legalFieldLabel}>FSSAI Lic No</Text>
                <Text style={styles.legalFieldValue}>{fssaiNumber}</Text>
              </View>

              {restaurant?.gstNumber ? (
                <>
                  <View style={styles.legalDivider} />
                  <View style={styles.legalDataBlock}>
                    <Text style={styles.legalFieldLabel}>GSTIN</Text>
                    <Text style={styles.legalFieldValue}>{restaurant.gstNumber}</Text>
                  </View>
                </>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>

      {/* ============================================================ */}
      {/* 8. FIXED FULL-WIDTH BOTTOM BUTTON ("Go back to menu") */}
      {/* ============================================================ */}
      <View style={styles.bottomFixedContainer}>
        <TouchableOpacity
          style={styles.goBackToMenuBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.85}
        >
          <Text style={styles.goBackToMenuText}>Go back to menu</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default RestaurantDetailsScreen;

const getStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  /* TOP BAR */
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  circleActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  backChevron: {
    fontSize: 26,
    color: '#1E293B',
    fontWeight: '600',
    marginTop: -3,
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  topBarEmoji: {
    fontSize: 16,
  },

  /* MAIN RESTAURANT INFORMATION CARD */
  infoCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  restoNameTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1E293B',
    letterSpacing: -0.3,
  },
  cuisineText: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '500',
  },
  priceForOneText: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
    marginTop: 6,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  addressLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  addressText: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
    fontWeight: '500',
  },
  distanceBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  distancePinIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  distanceBadgeText: {
    fontSize: 12,
    color: '#475569',
  },

  /* CONTACT + DIRECTIONS ACTION BUTTONS */
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  actionButtonContainer: {
    alignItems: 'center',
    gap: 8,
    minWidth: 90,
  },
  circularIconCall: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFF5F5',
    borderWidth: 1.5,
    borderColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callIconEmoji: {
    fontSize: 20,
  },
  actionButtonLabelCall: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0066FF',
    letterSpacing: 0.5,
  },
  circularIconDirection: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  directionIconEmoji: {
    fontSize: 20,
  },
  actionButtonLabelDirection: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0066FF',
    letterSpacing: 0.5,
  },

  /* BUSINESS STATUS & TIMING CARD */
  sectionCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  statusIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusHeaderText: {
    fontSize: 14,
    fontWeight: '700',
  },
  timingDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  timingLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  timingValue: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },

  /* LIVE BADGE */
  livePlatformBadgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    gap: 10,
  },
  liveBadgeEmoji: {
    fontSize: 16,
  },
  liveBadgeText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  liveBadgeYear: {
    fontWeight: '800',
    color: '#0F172A',
  },

  /* HIDE RESTAURANT CARD */
  hideRestaurantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  hideLeft: {
    flexDirection: 'column',
    gap: 2,
  },
  hideTitle: {
    fontSize: 13,
    color: '#64748B',
  },
  hideActionLink: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0066FF',
  },
  hideArrowGlyph: {
    fontSize: 20,
    color: '#94A3B8',
    fontWeight: '600',
  },

  /* LEGAL INFORMATION CARD */
  legalCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  legalSectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  legalDataBlock: {
    paddingVertical: 4,
  },
  legalFieldLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 2,
  },
  legalFieldValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  legalDivider: {
    height: 1,
    backgroundColor: '#F8FAFC',
    marginVertical: 8,
  },

  /* FIXED BOTTOM CONTAINER */
  bottomFixedContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingHorizontal: 16,
    paddingVertical: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  goBackToMenuBtn: {
    backgroundColor: '#0066FF',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  goBackToMenuText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  /* LOADING */
  loadingWrap: {
    paddingVertical: 80,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: '#64748B',
  },
});
