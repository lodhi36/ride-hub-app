import React, { useState, useEffect, useRef, useMemo, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  StatusBar,
  Dimensions,
  BackHandler,
  SafeAreaView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from '../components/PngIcon';
import api, { BASE_URL } from '../services/api';
import AddressSelectionModal from '../components/AddressSelectionModal';
import { CustomerHelpCenterModal } from '../components/CustomerHelpCenterModal';
import { FriendDeliveryLocationModal } from '../components/FriendDeliveryLocationModal';
import { AuthContext } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';
import { CartService, CartState } from '../services/CartService';
import {
  DeliveryAddress,
  getActiveDeliveryAddress,
  fetchCurrentGpsPosition,
  reverseGeocodeCoords,
} from '../services/LocationAddressService';
import { resolveCategoryName } from '../utils/categoryHelper';

const { width } = Dimensions.get('window');

// ── GPS & Link Extraction Helpers ──
function extractCoordinatesFromLinkOrText(input: string): { latitude: number; longitude: number } | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  // Pattern 1: Raw numbers "23.2599, 77.4126" or "23.2599,77.4126"
  const rawCoordMatch = trimmed.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
  if (rawCoordMatch) {
    const lat = parseFloat(rawCoordMatch[1]);
    const lon = parseFloat(rawCoordMatch[2]);
    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { latitude: lat, longitude: lon };
    }
  }

  // Pattern 2: Google Maps @lat,lon
  const atMatch = trimmed.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lon = parseFloat(atMatch[2]);
    if (!isNaN(lat) && !isNaN(lon)) return { latitude: lat, longitude: lon };
  }

  // Pattern 3: query q=lat,lon or ll=lat,lon
  const qMatch = trimmed.match(/[?&](?:q|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (qMatch) {
    const lat = parseFloat(qMatch[1]);
    const lon = parseFloat(qMatch[2]);
    if (!isNaN(lat) && !isNaN(lon)) return { latitude: lat, longitude: lon };
  }

  return null;
}

// ── Multi-Strategy Forward Geocoding ──
async function geocodeAddressText(inputAddress: string): Promise<{ latitude: number; longitude: number; formattedAddress: string } | null> {
  const clean = inputAddress.trim();
  if (!clean) return null;

  // Strategy 1: Direct raw query with Nominatim
  try {
    const u1 = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(clean)}&format=json&limit=1`;
    const r1 = await fetch(u1, { headers: { 'User-Agent': 'RideHub-CustomerApp/2.0' } });
    const d1 = await r1.json();
    if (Array.isArray(d1) && d1.length > 0) {
      return {
        latitude: parseFloat(d1[0].lat),
        longitude: parseFloat(d1[0].lon),
        formattedAddress: d1[0].display_name || clean,
      };
    }
  } catch (_) {}

  // Strategy 2: Extract 6-digit Indian PIN code
  const pinMatch = clean.match(/\b([1-9][0-9]{5})\b/);
  if (pinMatch) {
    const pin = pinMatch[1];
    try {
      const u2 = `https://nominatim.openstreetmap.org/search?postalcode=${pin}&country=India&format=json&limit=1`;
      const r2 = await fetch(u2, { headers: { 'User-Agent': 'RideHub-CustomerApp/2.0' } });
      const d2 = await r2.json();
      if (Array.isArray(d2) && d2.length > 0) {
        return {
          latitude: parseFloat(d2[0].lat),
          longitude: parseFloat(d2[0].lon),
          formattedAddress: d2[0].display_name || clean,
        };
      }
    } catch (_) {}
  }

  // Strategy 3: LocationIQ Geocoding API
  try {
    const u3 = `https://us1.locationiq.com/v1/search?key=11c8e94d2cb34945948b31fc14356b31&q=${encodeURIComponent(clean)}&format=json&limit=1`;
    const r3 = await fetch(u3);
    const d3 = await r3.json();
    if (Array.isArray(d3) && d3.length > 0) {
      return {
        latitude: parseFloat(d3[0].lat),
        longitude: parseFloat(d3[0].lon),
        formattedAddress: d3[0].display_name || clean,
      };
    }
  } catch (_) {}

  // Strategy 4: Append Bhopal fallback if not present
  if (!clean.toLowerCase().includes('bhopal')) {
    try {
      const u4 = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(clean + ', Bhopal')}&format=json&limit=1`;
      const r4 = await fetch(u4, { headers: { 'User-Agent': 'RideHub-CustomerApp/2.0' } });
      const d4 = await r4.json();
      if (Array.isArray(d4) && d4.length > 0) {
        return {
          latitude: parseFloat(d4[0].lat),
          longitude: parseFloat(d4[0].lon),
          formattedAddress: d4[0].display_name || clean,
        };
      }
    } catch (_) {}
  }

  return null;
}

// ── Road Distance Calculation ──
function calculateHaversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const CartScreen: React.FC<any> = ({ route, navigation }) => {
  const { user } = useContext(AuthContext);
  const { socket } = useSocket();
  const { isDark, currentColors } = useTheme();

  // Cart State from CartService
  const [cartState, setCartState] = useState<CartState>(() => CartService.getCart());
  const [deliveryAddress, setDeliveryAddress] = useState<DeliveryAddress | null>(null);
  const [addressModalVisible, setAddressModalVisible] = useState<boolean>(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'cod' | 'online'>('cod');
  const [specialInstructions, setSpecialInstructions] = useState<string>('');
  const [placingOrder, setPlacingOrder] = useState<boolean>(false);
  const [showCustomerHelpModal, setShowCustomerHelpModal] = useState<boolean>(false);

  // ── Delivery Target Selection: Self vs Friend ──
  const [deliveryTargetMode, setDeliveryTargetMode] = useState<'SELF' | 'FRIEND'>('SELF');
  const [friendName, setFriendName] = useState<string>('');
  const [friendPhone, setFriendPhone] = useState<string>('');
  const [friendLocationInput, setFriendLocationInput] = useState<string>('');
  const [friendCoords, setFriendCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [friendResolvedAddress, setFriendResolvedAddress] = useState<string>('');
  const [friendChecking, setFriendChecking] = useState<boolean>(false);
  const [friendLocationStatus, setFriendLocationStatus] = useState<'NONE' | 'INSIDE' | 'OUTSIDE'>('NONE');
  const [friendDistanceKm, setFriendDistanceKm] = useState<number | null>(null);
  const [isOutside5KmRadius, setIsOutside5KmRadius] = useState<boolean>(false);
  const [actualRoadDistanceKm, setActualRoadDistanceKm] = useState<number | null>(null);
  const [friendMapModalVisible, setFriendMapModalVisible] = useState<boolean>(false);

  // Idempotency submission ref to prevent double-tap submissions
  const isSubmittingRef = useRef<boolean>(false);

  // Subscribe to CartService
  useEffect(() => {
    setCartState(CartService.getCart());
    const unsub = CartService.subscribe((newState) => {
      setCartState({ ...newState });
    });
    return () => {
      unsub();
    };
  }, []);

  // Load Saved Delivery Address for SELF mode
  useEffect(() => {
    let isMounted = true;
    const loadAddress = async () => {
      try {
        const active = await getActiveDeliveryAddress();
        if (isMounted && active) {
          setDeliveryAddress(active);
        }
      } catch (err) {
        console.warn('[CartScreen] Error loading active delivery address:', err);
      }
    };
    loadAddress();
    return () => {
      isMounted = false;
    };
  }, []);

  // Hardware Back Button
  useEffect(() => {
    const handleBack = () => {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('CustomerHomeScreen');
      }
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => sub.remove();
  }, [navigation]);

  // Real-time socket unavailable item listener
  useEffect(() => {
    if (!socket) return;
    const handleItemDeleted = (data: any) => {
      if (data?.itemId && data?.isAvailable === false) {
        const sId = String(data.itemId);
        if (cartState.items && cartState.items[sId]) {
          CartService.removeItem(sId);
          Alert.alert('Item Unavailable', `"${cartState.items[sId]?.item?.name || 'An item'}" is currently out of stock.`);
        }
      }
    };
    socket.on('menu:item_deleted', handleItemDeleted);
    socket.on('menu:item_updated', handleItemDeleted);
    return () => {
      socket.off('menu:item_deleted', handleItemDeleted);
      socket.off('menu:item_updated', handleItemDeleted);
    };
  }, [socket, cartState]);

  // Restaurant details
  const restaurant = cartState.restaurant || {};
  const restoName = restaurant.name || restaurant.restaurantName || 'Store';
  const rId = cartState.restaurantId || restaurant._id || restaurant.id;
  const resolvedCat = resolveCategoryName(restaurant);

  const itemsList = useMemo(() => {
    if (!cartState.items) return [];
    return Object.values(cartState.items).map((ci: any) => ({
      id: ci.item?._id || ci.item?.id || ci.id,
      name: ci.item?.name || ci.item?.title || 'Item',
      price: Number(ci.item?.price || ci.price || 0),
      quantity: Number(ci.quantity || 1),
      image: ci.item?.image || ci.item?.photo || null,
      isVeg: Boolean(ci.item?.isVeg),
    }));
  }, [cartState.items]);

  const subtotal = useMemo(() => {
    return itemsList.reduce((acc, it) => acc + it.price * it.quantity, 0);
  }, [itemsList]);

  // Active Distance in KM based on Target Mode (FRIEND vs SELF)
  const activeDistanceKm = useMemo(() => {
    if (deliveryTargetMode === 'FRIEND') {
      return actualRoadDistanceKm || friendDistanceKm || 0;
    }
    const rLat = Number(restaurant.businessLatitude || restaurant.latitude || 0);
    const rLon = Number(restaurant.businessLongitude || restaurant.longitude || 0);
    const cLat = Number(deliveryAddress?.latitude || 0);
    const cLon = Number(deliveryAddress?.longitude || 0);
    if (rLat > 0 && rLon > 0 && cLat > 0 && cLon > 0) {
      return parseFloat(calculateHaversineKm(rLat, rLon, cLat, cLon).toFixed(1));
    }
    return 1.5; // Safe default local distance
  }, [deliveryTargetMode, actualRoadDistanceKm, friendDistanceKm, restaurant, deliveryAddress]);

  // Delivery Charge Formula:
  // - 1 to 2 km -> ₹20 flat
  // - Above 2 km -> ₹10 per km (e.g. 3km = ₹30, 4km = ₹40, 5km = ₹50)
  const deliveryFee = useMemo(() => {
    if (subtotal <= 0) return 0;
    if (activeDistanceKm <= 2.0) return 20;
    return Math.max(20, Math.round(activeDistanceKm * 10));
  }, [subtotal, activeDistanceKm]);

  const grandTotal = subtotal + deliveryFee;

  // ── 5 KM Road Distance Checker ──
  const check5KmRoadDistance = async (destLat: number, destLon: number) => {
    const rLat = Number(restaurant.businessLatitude || restaurant.latitude || 0);
    const rLon = Number(restaurant.businessLongitude || restaurant.longitude || 0);

    if (rLat === 0 || rLon === 0) {
      console.log('Restaurant coordinates not configured, allowing distance check');
      setIsOutside5KmRadius(false);
      return;
    }

    try {
      // 1. Try Backend Road Distance / Friend Delivery Validation endpoint
      const res = await api.post('/bookings/validate-friend-delivery', {
        restaurantId: rId,
        recipientLatitude: destLat,
        recipientLongitude: destLon,
      });

      if (res.data) {
        const roadDist = Number(res.data.calculatedRoadDistance || 0);
        setActualRoadDistanceKm(roadDist);
        if (res.data.isWithin5Km === false || roadDist > 5.0) {
          setIsOutside5KmRadius(true);
        } else {
          setIsOutside5KmRadius(false);
        }
        return;
      }
    } catch (apiErr: any) {
      const errData = apiErr.response?.data;
      if (errData && errData.isWithin5Km === false) {
        setIsOutside5KmRadius(true);
        if (errData.calculatedRoadDistance) {
          setActualRoadDistanceKm(Number(errData.calculatedRoadDistance));
        }
        return;
      }
    }

    // 2. Direct OSRM Fallback
    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${rLon},${rLat};${destLon},${destLat}?overview=false`;
      const osrmRes = await fetch(osrmUrl, {
        headers: { 'User-Agent': 'RideHub-CustomerApp/2.0' },
      });
      const data = await osrmRes.json();
      if (data.code === 'Ok' && data.routes && data.routes[0]) {
        const distKm = parseFloat((data.routes[0].distance / 1000).toFixed(2));
        setActualRoadDistanceKm(distKm);
        setIsOutside5KmRadius(distKm > 5.0);
        return;
      }
    } catch (_) {}

    // 3. Fallback Haversine straight-line distance
    const hDist = parseFloat(calculateHaversineKm(rLat, rLon, destLat, destLon).toFixed(2));
    setActualRoadDistanceKm(hDist);
    setIsOutside5KmRadius(hDist > 5.0);
  };

  // Re-check 5 KM road distance when friend coordinates change
  useEffect(() => {
    if (deliveryTargetMode === 'FRIEND' && friendCoords) {
      check5KmRoadDistance(friendCoords.latitude, friendCoords.longitude);
    }
  }, [deliveryTargetMode, friendCoords, rId]);

  // ── Friend Location Verification (Text / Address / Link) ──
  const handleCheckFriendLocation = async () => {
    if (!friendLocationInput.trim()) {
      Alert.alert(
        'Address or Location Needed',
        'कृपया अपने दोस्त का पता या WhatsApp Location लिंक यहाँ पेस्ट करें और Verify पर क्लिक करें।'
      );
      return;
    }

    try {
      setFriendChecking(true);
      setFriendLocationStatus('NONE');

      let resolvedLat = 0;
      let resolvedLon = 0;
      let displayAddress = '';

      // 1. Try coordinate parsing from link or raw text
      let parsed = extractCoordinatesFromLinkOrText(friendLocationInput);

      // If short link e.g. maps.app.goo.gl, expand via fetch redirect
      if (!parsed && friendLocationInput.includes('http')) {
        try {
          const resp = await fetch(friendLocationInput.trim(), { method: 'GET', redirect: 'follow' });
          if (resp.url) {
            parsed = extractCoordinatesFromLinkOrText(resp.url);
          }
        } catch (_) {}
      }

      if (parsed) {
        resolvedLat = parsed.latitude;
        resolvedLon = parsed.longitude;
        try {
          const geo = await reverseGeocodeCoords(parsed.latitude, parsed.longitude);
          displayAddress = geo.fullAddress || `Lat: ${parsed.latitude.toFixed(4)}, Lon: ${parsed.longitude.toFixed(4)}`;
        } catch (_) {
          displayAddress = `Lat: ${parsed.latitude.toFixed(4)}, Lon: ${parsed.longitude.toFixed(4)}`;
        }
      } else {
        // 2. Multi-step Forward Geocoding for plain text address (e.g. Lambakheda, MP Nagar, Bhopal)
        const geoResult = await geocodeAddressText(friendLocationInput.trim());
        if (geoResult) {
          resolvedLat = geoResult.latitude;
          resolvedLon = geoResult.longitude;
          displayAddress = geoResult.formattedAddress;
        }
      }

      if (!resolvedLat || !resolvedLon || resolvedLat === 0) {
        Alert.alert(
          'Location Not Recognized',
          'Could not find coordinates for this address. Please ensure the colony/area name, city (Bhopal), or 6-digit PIN code is mentioned, or use "Open Pin on Map".'
        );
        setFriendLocationStatus('NONE');
        return;
      }

      // 3. First Validation: Zone Check via Backend API
      const zoneRes = await api.post('/zones/check-customer-serviceable', {
        latitude: resolvedLat,
        longitude: resolvedLon,
      });

      if (zoneRes.data && zoneRes.data.serviceable === false) {
        setFriendLocationStatus('OUTSIDE');
        setFriendDistanceKm(zoneRes.data.distanceKm || null);
        setFriendCoords({ latitude: resolvedLat, longitude: resolvedLon });
        setFriendResolvedAddress(displayAddress || friendLocationInput.trim());
        setIsOutside5KmRadius(false);
      } else {
        setFriendLocationStatus('INSIDE');
        setFriendCoords({ latitude: resolvedLat, longitude: resolvedLon });
        setFriendResolvedAddress(displayAddress || friendLocationInput.trim());

        // 4. Second Validation: 5 KM Road Distance from Restaurant
        await check5KmRoadDistance(resolvedLat, resolvedLon);
      }
    } catch (err: any) {
      console.warn('[CartScreen] Error verifying friend location:', err);
      Alert.alert('Verification Notice', 'Could not complete verification. Please check internet connection.');
    } finally {
      setFriendChecking(false);
    }
  };

  // Called when user picks friend address from the map modal
  const handleFriendLocationConfirmed = (locationData: {
    latitude: number;
    longitude: number;
    address: string;
    name?: string;
    phone?: string;
  }) => {
    setFriendCoords({ latitude: locationData.latitude, longitude: locationData.longitude });
    setFriendResolvedAddress(locationData.address);
    setFriendLocationInput(locationData.address);
    setFriendLocationStatus('INSIDE');
    if (locationData.name) setFriendName(locationData.name);
    if (locationData.phone) setFriendPhone(locationData.phone);
    check5KmRoadDistance(locationData.latitude, locationData.longitude);
  };

  const handleUpdateQuantity = (itemId: string, delta: number) => {
    CartService.updateItemQuantity(itemId, delta);
  };

  // ── Place Order / Proceed to Pay ──
  const handleProceedToPay = async () => {
    if (isSubmittingRef.current || placingOrder) return;

    if (itemsList.length === 0) {
      Alert.alert('Cart is Empty', 'Please add items before placing an order.');
      return;
    }

    // ── 1. SELF Mode Validations ──
    if (deliveryTargetMode === 'SELF') {
      if (!deliveryAddress || !deliveryAddress.fullAddress) {
        Alert.alert('Delivery Address Required', 'Please select or add a delivery address to continue.', [
          { text: 'Select Address', onPress: () => setAddressModalVisible(true) },
        ]);
        return;
      }
    } else {
      // ── 2. FRIEND Mode Validations ──
      if (!friendName.trim()) {
        Alert.alert('Friend Name Required', "Please enter your friend's full name.");
        return;
      }

      const cleanPhone = friendPhone.replace(/\D/g, '');
      if (cleanPhone.length < 10) {
        Alert.alert('Valid Phone Number Required', "Please enter your friend's valid 10-digit mobile number so the delivery partner can contact them.");
        return;
      }

      if (!friendCoords) {
        Alert.alert(
          'Friend Delivery Location Required',
          "Please verify your friend's address or pin their exact delivery location on the map before proceeding."
        );
        return;
      }

      if (friendLocationStatus === 'OUTSIDE') {
        Alert.alert(
          'Out of Service Zone',
          'Sorry! This location is out of our delivery zone.'
        );
        return;
      }

      if (isOutside5KmRadius) {
        Alert.alert(
          'Restaurant Range Exceeded',
          "Sorry! This restaurant cannot deliver to your friend's selected address because it is outside the 5 KM delivery range. Please select another restaurant or change the delivery address."
        );
        return;
      }
    }

    try {
      isSubmittingRef.current = true;
      setPlacingOrder(true);

      const newBookingId = `ride_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;
      let custLat = deliveryTargetMode === 'FRIEND' && friendCoords ? friendCoords.latitude : Number(deliveryAddress?.latitude || 0);
      let custLon = deliveryTargetMode === 'FRIEND' && friendCoords ? friendCoords.longitude : Number(deliveryAddress?.longitude || 0);

      if (custLat === 0 || custLon === 0 || custLat === 23.2599) {
        const liveGps = await fetchCurrentGpsPosition(false);
        if (liveGps && liveGps.latitude && liveGps.longitude) {
          custLat = liveGps.latitude;
          custLon = liveGps.longitude;
        }
      }

      const restoLat = Number(restaurant.businessLatitude || restaurant.latitude || (custLat !== 0 ? custLat : 0));
      const restoLon = Number(restaurant.businessLongitude || restaurant.longitude || (custLon !== 0 ? custLon : 0));

      const deliveryFullAddr =
        deliveryTargetMode === 'FRIEND' && friendResolvedAddress
          ? `${friendName.trim()} (${friendPhone.trim()}) - ${friendResolvedAddress}`
          : (deliveryAddress?.fullAddress || 'Customer Address');

      const orderCustomerName =
        deliveryTargetMode === 'FRIEND' && friendName.trim()
          ? friendName.trim()
          : ((deliveryAddress as any)?.contactPersonName || user?.name || (user as any)?.username || 'Customer');

      const orderCustomerPhone =
        deliveryTargetMode === 'FRIEND' && friendPhone.trim()
          ? friendPhone.trim()
          : ((deliveryAddress as any)?.contactPersonPhone || user?.phoneNumber || '9999999999');

      const richCartItems = itemsList.map((it) => ({
        id: it.id,
        itemId: it.id,
        name: it.name,
        title: it.name,
        price: Number(it.price || 0),
        cost: Number(it.price || 0),
        quantity: Number(it.quantity || 1),
        image: it.image || null,
        isVeg: Boolean(it.isVeg),
      }));

      const foodPayload = {
        bookingId: newBookingId,
        bookingType: 'food',
        isFoodDelivery: true,
        customerId: user?._id || (user as any)?.id || 'guest_user',
        customerName: orderCustomerName,
        customerPhone: orderCustomerPhone,
        customerMobile: orderCustomerPhone,
        pickupLocation: restaurant.address || restaurant.businessAddress || restoName,
        dropLocation: deliveryFullAddr,
        pickupLatitude: restoLat,
        pickupLongitude: restoLon,
        destinationLatitude: custLat,
        destinationLongitude: custLon,
        latitude: custLat,
        longitude: custLon,
        deliveryFee: deliveryFee,
        subtotal: subtotal,
        distanceKm: activeDistanceKm,
        fare: grandTotal,
        totalAmount: grandTotal,
        paymentMethod: selectedPaymentMethod,
        paymentStatus: selectedPaymentMethod === 'cod' ? 'pending' : 'completed',
        restaurantId: rId,
        storeId: rId,
        restaurantName: restoName,
        storeName: restoName,
        items: richCartItems,
        orderType: deliveryTargetMode === 'FRIEND' ? 'SOMEONE_ELSE' : 'SELF',
        recipientName: deliveryTargetMode === 'FRIEND' ? friendName.trim() : null,
        recipientPhone: deliveryTargetMode === 'FRIEND' ? friendPhone.trim() : null,
        recipientAddress: deliveryTargetMode === 'FRIEND' ? (friendResolvedAddress || friendLocationInput.trim()) : null,
        recipientLatitude: deliveryTargetMode === 'FRIEND' ? custLat : null,
        recipientLongitude: deliveryTargetMode === 'FRIEND' ? custLon : null,
        calculatedRoadDistance: actualRoadDistanceKm || null,
        allowedDeliveryRadius: 5,
        customerNotes: specialInstructions.trim(),
        createdAt: new Date().toISOString(),
      };

      console.log('🚀 [CartScreen] Submitting order to backend:', foodPayload.bookingId);
      const createRes = await api.post('/bookings/create', foodPayload);

      if (createRes.data?.success || createRes.data?.booking) {
        const createdBooking = createRes.data.booking || { ...foodPayload, _id: createRes.data.bookingId || newBookingId };
        const assignedBId = createdBooking.bookingId || newBookingId;

        Promise.all([
          CartService.clearCart(),
          AsyncStorage.setItem('active_food_booking_id', assignedBId),
          AsyncStorage.setItem('active_food_order_data', JSON.stringify(createdBooking)),
        ]).catch((err) => console.warn('[CartScreen] Storage sync notice:', err));

        navigation.reset({
          index: 0,
          routes: [
            { name: 'CustomerHomeScreen' },
            {
              name: 'OrderSuccessScreen',
              params: {
                bookingId: assignedBId,
                order: createdBooking,
                amount: grandTotal,
                storeName: restoName,
                paymentMethod: selectedPaymentMethod,
              },
            },
          ],
        });
      } else {
        Alert.alert('Order Placement Notice', createRes.data?.message || 'Failed to place order. Please try again.');
      }
    } catch (err: any) {
      console.error('[CartScreen] Order creation error:', err);
      const msg = err.response?.data?.message || err.message || 'Could not place order. Please try again.';
      Alert.alert('Order Failed', msg);
    } finally {
      isSubmittingRef.current = false;
      setPlacingOrder(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="#FFFFFF" />

      {/* HEADER */}
      <View style={styles.topHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (navigation.canGoBack()) navigation.goBack();
            else navigation.navigate('CustomerHomeScreen');
          }}
          activeOpacity={0.7}
        >
          <Icon name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>My Cart</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {itemsList.length > 0 ? `${restoName} • ${itemsList.length} items` : 'No store selected'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.helpButton}
          onPress={() => setShowCustomerHelpModal(true)}
          activeOpacity={0.7}
        >
          <Icon name="help-circle-outline" size={24} color="#64748B" />
        </TouchableOpacity>
      </View>

      {/* EMPTY STATE */}
      {itemsList.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Icon name="cart-outline" size={48} color="#94A3B8" />
          </View>
          <Text style={styles.emptyTitle}>Your Cart is Empty</Text>
          <Text style={styles.emptySubtitle}>
            Add items from your favorite stores and restaurants to proceed with checkout.
          </Text>
          <TouchableOpacity
            style={styles.browseButton}
            onPress={() => navigation.navigate('CustomerHomeScreen')}
            activeOpacity={0.8}
          >
            <Text style={styles.browseButtonText}>Browse Restaurants</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* 1. DELIVERY TARGET: SELF VS FRIEND */}
          <View style={styles.targetSectionCard}>
            <Text style={styles.sectionHeaderTitle}>Who is this order for?</Text>
            <View style={styles.deliveryTargetRow}>
              <TouchableOpacity
                style={[styles.deliveryTargetBtn, deliveryTargetMode === 'SELF' && styles.deliveryTargetBtnActive]}
                onPress={() => setDeliveryTargetMode('SELF')}
                activeOpacity={0.8}
              >
                <Icon
                  name="person"
                  size={18}
                  color={deliveryTargetMode === 'SELF' ? '#0066FF' : '#64748B'}
                />
                <Text
                  style={[
                    styles.deliveryTargetText,
                    deliveryTargetMode === 'SELF' && styles.deliveryTargetTextActive,
                  ]}
                >
                  Order for Myself
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.deliveryTargetBtn, deliveryTargetMode === 'FRIEND' && styles.deliveryTargetBtnActive]}
                onPress={() => setDeliveryTargetMode('FRIEND')}
                activeOpacity={0.8}
              >
                <Icon
                  name="people"
                  size={18}
                  color={deliveryTargetMode === 'FRIEND' ? '#0066FF' : '#64748B'}
                />
                <Text
                  style={[
                    styles.deliveryTargetText,
                    deliveryTargetMode === 'FRIEND' && styles.deliveryTargetTextActive,
                  ]}
                >
                  Order for Friend
                </Text>
              </TouchableOpacity>
            </View>

            {/* If Order for Friend is selected */}
            {deliveryTargetMode === 'FRIEND' && (
              <View style={styles.friendDetailsContainer}>
                <Text style={styles.friendNoticeTitle}>Friend Delivery Information</Text>
                <Text style={styles.friendNoticeSub}>
                  Enter your friend's contact and delivery address or WhatsApp location pin link.
                </Text>

                <View style={styles.friendInputGroup}>
                  <Text style={styles.friendInputLabel}>Friend's Name *</Text>
                  <TextInput
                    style={styles.friendTextInput}
                    placeholder="e.g. Rahul Sharma"
                    placeholderTextColor="#94A3B8"
                    value={friendName}
                    onChangeText={setFriendName}
                  />
                </View>

                <View style={styles.friendInputGroup}>
                  <Text style={styles.friendInputLabel}>Friend's Phone (Rider will call them) *</Text>
                  <TextInput
                    style={styles.friendTextInput}
                    placeholder="e.g. 9876543210"
                    placeholderTextColor="#94A3B8"
                    keyboardType="phone-pad"
                    maxLength={12}
                    value={friendPhone}
                    onChangeText={setFriendPhone}
                  />
                </View>

                {/* Open Pin on Map Dedicated Button */}
                <TouchableOpacity
                  style={styles.openMapBtn}
                  onPress={() => setFriendMapModalVisible(true)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.openMapBtnIcon}>🗺️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.openMapBtnTitle}>Choose on Interactive Map</Text>
                    <Text style={styles.openMapBtnSub}>Drag map pin, check Bhopal zones & 5 KM distance</Text>
                  </View>
                  <Text style={styles.openMapBtnArrow}>›</Text>
                </TouchableOpacity>

                <View style={styles.friendInputGroup}>
                  <Text style={styles.friendInputLabel}>Or Enter Address / WhatsApp Location Link</Text>
                  <View style={styles.linkInputRow}>
                    <TextInput
                      style={[styles.friendTextInput, { flex: 1, marginRight: 8 }]}
                      placeholder="e.g. Lambakheda, MP Nagar, or Maps link"
                      placeholderTextColor="#94A3B8"
                      value={friendLocationInput}
                      onChangeText={(t) => {
                        setFriendLocationInput(t);
                        setFriendLocationStatus('NONE');
                      }}
                    />
                    <TouchableOpacity
                      style={[styles.verifyLinkBtn, friendChecking && { opacity: 0.7 }]}
                      onPress={handleCheckFriendLocation}
                      disabled={friendChecking}
                      activeOpacity={0.8}
                    >
                      {friendChecking ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.verifyLinkBtnText}>Verify</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Friend Location Status Banners */}
                {friendLocationStatus === 'OUTSIDE' && (
                  <View style={styles.outOfZoneBox}>
                    <View style={styles.outOfZoneHeaderRow}>
                      <Icon name="warning" size={18} color="#DC2626" style={{ marginRight: 6 }} />
                      <Text style={styles.outOfZoneTitle}>Outside Service Zone</Text>
                    </View>
                    <Text style={styles.outOfZoneDesc}>
                      Sorry! This location is out of our delivery zone.
                    </Text>
                  </View>
                )}

                {friendLocationStatus === 'INSIDE' && (
                  <View>
                    <View style={styles.insideZoneBox}>
                      <Icon name="checkmark-circle" size={20} color="#16A34A" style={{ marginRight: 8 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.insideZoneTitle}>Delivery address is within our service zone.</Text>
                        <Text style={styles.insideZoneDesc} numberOfLines={2}>
                          {friendResolvedAddress || friendLocationInput}
                        </Text>
                      </View>
                    </View>

                    {/* 5 KM Check Result */}
                    {isOutside5KmRadius ? (
                      <View style={[styles.outOfZoneBox, { marginTop: 8 }]}>
                        <View style={styles.outOfZoneHeaderRow}>
                          <Icon name="close-circle" size={18} color="#DC2626" style={{ marginRight: 6 }} />
                          <Text style={styles.outOfZoneTitle}>Outside 5 KM Range</Text>
                        </View>
                        <Text style={styles.outOfZoneDesc}>
                          Sorry! This restaurant cannot deliver to your friend's selected address because it is outside the 5 KM delivery range. Please select another restaurant or change the delivery address.
                        </Text>
                        {actualRoadDistanceKm !== null && (
                          <Text style={styles.outOfZoneDistance}>
                            Actual road distance: {actualRoadDistanceKm} KM (Limit: 5 KM)
                          </Text>
                        )}
                      </View>
                    ) : (
                      actualRoadDistanceKm !== null && (
                        <View style={styles.distanceOkBox}>
                          <Icon name="checkmark-done" size={16} color="#15803D" style={{ marginRight: 6 }} />
                          <Text style={styles.distanceOkText}>
                            Road distance: {actualRoadDistanceKm} KM (Within 5 KM delivery range)
                          </Text>
                        </View>
                      )
                    )}
                  </View>
                )}
              </View>
            )}

            {/* If Order for Myself is selected */}
            {deliveryTargetMode === 'SELF' && (
              <View style={styles.addressHeaderRow}>
                <View style={styles.addressIconWrap}>
                  <Icon name="location-sharp" size={18} color="#0066FF" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.addressLabel}>Delivery Address</Text>
                  <Text style={styles.addressValue} numberOfLines={2}>
                    {deliveryAddress?.fullAddress || 'Select Delivery Address'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.changeAddressBtn}
                  onPress={() => setAddressModalVisible(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.changeAddressText}>Change</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* 2. CART ITEMS LIST */}
          <View style={styles.cardSection}>
            <Text style={styles.sectionHeaderTitle}>Items in Cart</Text>

            {itemsList.map((it) => (
              <View key={it.id} style={styles.itemRow}>
                <View style={styles.itemInfoWrap}>
                  <Text style={styles.itemName} numberOfLines={2}>{it.name}</Text>
                  <Text style={styles.itemPrice}>₹{Number(it.price) * Number(it.quantity)}</Text>
                  <Text style={styles.itemUnitPrice}>₹{it.price} each</Text>
                </View>

                {/* Quantity Controls */}
                <View style={styles.qtyContainer}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => handleUpdateQuantity(it.id, -1)}
                    activeOpacity={0.7}
                  >
                    <Icon name={it.quantity === 1 ? 'trash-outline' : 'remove'} size={16} color="#DC2626" />
                  </TouchableOpacity>
                  <Text style={styles.qtyText}>{it.quantity}</Text>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => handleUpdateQuantity(it.id, 1)}
                    activeOpacity={0.7}
                  >
                    <Icon name="add" size={16} color="#0066FF" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>

          {/* 3. SPECIAL INSTRUCTIONS */}
          <View style={styles.cardSection}>
            <Text style={styles.sectionHeaderTitle}>Order Notes / Instructions</Text>
            <TextInput
              style={styles.instructionsInput}
              placeholder="e.g. Leave at door, avoid ringing bell, add extra napkins..."
              placeholderTextColor="#94A3B8"
              value={specialInstructions}
              onChangeText={setSpecialInstructions}
              multiline
              maxLength={200}
            />
          </View>

          {/* 4. BILL DETAILS */}
          <View style={styles.cardSection}>
            <Text style={styles.sectionHeaderTitle}>Bill Details</Text>

            <View style={styles.billRow}>
              <Text style={styles.billLabel}>Item Subtotal</Text>
              <Text style={styles.billValue}>₹{subtotal}</Text>
            </View>

            <View style={styles.billRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.billLabel}>Delivery Partner Fee</Text>
                {activeDistanceKm > 0 && (
                  <Text style={[styles.billLabel, { fontSize: 12, color: '#0066FF', marginLeft: 6 }]}>
                    ({activeDistanceKm} km @ {activeDistanceKm <= 2 ? '₹20' : '₹10/km'})
                  </Text>
                )}
              </View>
              <Text style={styles.billValue}>₹{deliveryFee}</Text>
            </View>

            <View style={[styles.billRow, styles.grandTotalRow]}>
              <Text style={styles.grandTotalLabel}>To Pay</Text>
              <Text style={styles.grandTotalValue}>₹{grandTotal}</Text>
            </View>
          </View>

          {/* 5. PAYMENT METHOD */}
          <View style={styles.cardSection}>
            <Text style={styles.sectionHeaderTitle}>Select Payment Method</Text>

            <TouchableOpacity
              style={[
                styles.paymentOptionCard,
                selectedPaymentMethod === 'cod' && styles.paymentOptionCardActive,
              ]}
              onPress={() => setSelectedPaymentMethod('cod')}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.paymentRadio,
                  selectedPaymentMethod === 'cod' && styles.paymentRadioActive,
                ]}
              >
                {selectedPaymentMethod === 'cod' && <View style={styles.paymentRadioDot} />}
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.paymentTitle}>Cash on Delivery (COD)</Text>
                <Text style={styles.paymentSub}>Pay with cash or UPI on delivery</Text>
              </View>
              <Text style={{ fontSize: 24 }}>💵</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.paymentOptionCard,
                selectedPaymentMethod === 'online' && styles.paymentOptionCardActive,
              ]}
              onPress={() => setSelectedPaymentMethod('online')}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.paymentRadio,
                  selectedPaymentMethod === 'online' && styles.paymentRadioActive,
                ]}
              >
                {selectedPaymentMethod === 'online' && <View style={styles.paymentRadioDot} />}
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.paymentTitle}>Online Payment</Text>
                <Text style={styles.paymentSub}>UPI, Debit/Credit Card, Netbanking</Text>
              </View>
              <Text style={{ fontSize: 24 }}>💳</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* BOTTOM CHECKOUT BAR */}
      {itemsList.length > 0 && (
        <View style={styles.bottomBar}>
          <View style={styles.bottomAmountWrap}>
            <Text style={styles.bottomTotalLabel}>Total Amount</Text>
            <Text style={styles.bottomTotalValue}>₹{grandTotal}</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.placeOrderBtn,
              (placingOrder ||
                (deliveryTargetMode === 'FRIEND' &&
                  (friendLocationStatus === 'OUTSIDE' || isOutside5KmRadius))) && {
                backgroundColor: '#94A3B8',
              },
            ]}
            onPress={handleProceedToPay}
            disabled={
              placingOrder ||
              (deliveryTargetMode === 'FRIEND' &&
                (friendLocationStatus === 'OUTSIDE' || isOutside5KmRadius))
            }
            activeOpacity={0.85}
          >
            {placingOrder ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.placeOrderBtnText}>
                {deliveryTargetMode === 'FRIEND' && friendLocationStatus === 'OUTSIDE'
                  ? 'Outside Service Zone'
                  : deliveryTargetMode === 'FRIEND' && isOutside5KmRadius
                  ? 'Delivery not available for this location (> 5 km)'
                  : selectedPaymentMethod === 'cod'
                  ? `Place Order • ₹${grandTotal}`
                  : `Pay & Place Order • ₹${grandTotal}`}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ADDRESS SELECTION MODAL (SELF) */}
      <AddressSelectionModal
        visible={addressModalVisible}
        onClose={() => setAddressModalVisible(false)}
        activeAddressId={deliveryAddress?.id}
        onSelectAddress={(addr) => setDeliveryAddress(addr)}
      />

      {/* CUSTOMER HELP MODAL */}
      <CustomerHelpCenterModal
        visible={showCustomerHelpModal}
        onClose={() => setShowCustomerHelpModal(false)}
        orderStage="BEFORE_PAYMENT"
      />

      {/* DEDICATED FRIEND DELIVERY LOCATION MODAL (INTERACTIVE MAP) */}
      <FriendDeliveryLocationModal
        visible={friendMapModalVisible}
        onClose={() => setFriendMapModalVisible(false)}
        initialCoords={friendCoords}
        initialName={friendName}
        initialPhone={friendPhone}
        restaurantCoords={{
          latitude: Number(restaurant?.businessLatitude || restaurant?.latitude || 0),
          longitude: Number(restaurant?.businessLongitude || restaurant?.longitude || 0),
        }}
        restaurantName={restoName}
        restaurantId={rId || restaurant?._id || restaurant?.id}
        onConfirm={handleFriendLocationConfirmed}
      />
    </SafeAreaView>
  );
};

export default CartScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Math.max(StatusBar.currentHeight || 20, 24) + 8,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    marginLeft: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  helpButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  browseButton: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  browseButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  cardSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 12,
  },
  addressHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  addressValue: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  changeAddressBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
  },
  changeAddressText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0066FF',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  itemInfoWrap: {
    flex: 1,
    paddingRight: 12,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  itemPrice: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0066FF',
    marginTop: 2,
  },
  itemUnitPrice: {
    fontSize: 11.5,
    color: '#94A3B8',
    marginTop: 1,
  },
  qtyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 2,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    paddingHorizontal: 8,
  },
  instructionsInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 70,
    textAlignVertical: 'top',
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  billLabel: {
    fontSize: 13.5,
    color: '#64748B',
  },
  billValue: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  grandTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 8,
    paddingTop: 12,
  },
  grandTotalLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  grandTotalValue: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0066FF',
  },
  paymentOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  paymentOptionCardActive: {
    borderColor: '#0066FF',
    backgroundColor: '#F0F7FF',
  },
  paymentRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentRadioActive: {
    borderColor: '#0066FF',
  },
  paymentRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0066FF',
  },
  paymentTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  paymentSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  bottomAmountWrap: {
    flex: 1,
  },
  bottomTotalLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  bottomTotalValue: {
    fontSize: 19,
    fontWeight: '900',
    color: '#0F172A',
  },
  placeOrderBtn: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 160,
  },
  placeOrderBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  // ── Self vs Friend Styles ──
  targetSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  deliveryTargetRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 8,
  },
  deliveryTargetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  deliveryTargetBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  deliveryTargetText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    marginLeft: 6,
  },
  deliveryTargetTextActive: {
    color: '#0066FF',
    fontWeight: '800',
  },
  friendDetailsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  friendNoticeTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  friendNoticeSub: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 12,
    lineHeight: 16,
  },
  friendInputGroup: {
    marginBottom: 10,
  },
  friendInputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
  },
  friendTextInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  linkInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verifyLinkBtn: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  verifyLinkBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  outOfZoneBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#F87171',
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  outOfZoneHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  outOfZoneTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#DC2626',
  },
  outOfZoneDesc: {
    fontSize: 12,
    color: '#991B1B',
    lineHeight: 17,
  },
  outOfZoneDistance: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#B91C1C',
    marginTop: 4,
  },
  insideZoneBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#4ADE80',
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  insideZoneTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#16A34A',
  },
  insideZoneDesc: {
    fontSize: 12,
    color: '#15803D',
    marginTop: 2,
  },
  openMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#EC4899',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#EC4899',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  openMapBtnIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  openMapBtnTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  openMapBtnSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  openMapBtnArrow: {
    fontSize: 22,
    color: '#EC4899',
    fontWeight: '700',
    marginLeft: 6,
  },
  distanceOkBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },
  distanceOkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
    flex: 1,
  },
});
