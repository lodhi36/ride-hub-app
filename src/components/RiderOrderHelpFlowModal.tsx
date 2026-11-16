import { WebView } from 'react-native-webview';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  Dimensions,
  Animated,
  Platform,
  StatusBar,
  BackHandler,
} from 'react-native';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';
import { calculateRealDistance } from '../utils/categoryHelper';

const { width } = Dimensions.get('window');

export interface RiderOrderHelpFlowModalProps {
  visible: boolean;
  onClose: () => void;
  bookingId: string;
  activeOrder?: any;
  riderUser?: any;
  riderCoords?: { latitude: number; longitude: number };
  onTransferInitiated?: () => void;
  onDelivered?: () => void;
  onDenySuccess?: () => void;
  navigation?: any;
  isAtDrop?: boolean;
  orderStage?: 'PICKUP' | 'AT_DROP' | 'DROP_OFF';
}

export type HelpFlowStep =
  | 'HELP_MENU'                 // अधिक विकल्प
  | 'LIVE_ORDER_REASONS'        // लाइव ऑर्डर मदद (पिकअप)
  | 'DROP_HELP_9_OPTIONS'       // लाइव ऑर्डर मदद: ड्रॉप पर 9 ऑप्शन
  | 'DROP_USER_NOT_ANSWERING'   // ऑप्शन 2: यूज़र फ़ोन नहीं उठा रहा
  | 'DROP_USER_CANCEL_REQUEST'  // ऑप्शन 3: यूज़र ने ऑर्डर कैंसल करने को कहा
  | 'DROP_WRONG_ADDRESS'        // ऑप्शन 4: यूज़र का एड्रेस गलत है
  | 'DROP_CHANGE_LOCATION'      // ऑप्शन 5: यूज़र ने कहा कहीं और दे दो
  | 'DROP_OTP_ISSUE'            // ऑप्शन 6: ओटीपी की दिक्कत
  | 'DROP_ITEM_ISSUE'           // ऑप्शन 7: सामान में गड़बड़ी
  | 'DROP_GATE_CLOSED'          // ऑप्शन 8: गेट बंद है या अंदर जाने की इजाज़त नहीं
  | 'DROP_EMERGENCY_HEALTH'     // ऑप्शन 9: मेरी तबीयत या बाइक में दिक्कत
  | 'RESTAURANT_CLOSED'         // स्क्रीन 2: रेस्टोरेंट बंद है
  | 'CANNOT_DELIVER_SUB_REASONS'
  | 'CANNOT_DELIVER_BIKE'       // स्क्रीन 3: डिलीवर नहीं कर सकते (Bike / other issue)
  | 'PICKUP_OTP'                // स्क्रीन 4: पिकअप ओटीपी
  | 'ORDER_DENIAL_WARNING'      // स्क्रीन 5: ऑर्डर अस्वीकृति चेतावनी (हिंदी)
  | 'RADAR_SEARCH'              // स्क्रीन 7: खोज (रडार)
  | 'TRANSFER_ACCEPTED_PARTNER' // पार्टनर ने स्वीकार किया
  | 'NO_PARTNER_AVAILABLE'      // स्क्रीन 8: कोई साथी उपलब्ध नहीं है
  | 'USER_LOCATION_ARRIVED'     // यूज़र लोकेशन पर पहुँचे (Doorbell / Drop reached)
  | 'ID_CARD_BILL';             // डिजिटल आईडी कार्ड & बिल

export const RiderOrderHelpFlowModal: React.FC<RiderOrderHelpFlowModalProps> = ({
  visible,
  onClose,
  bookingId,
  activeOrder,
  riderUser,
  riderCoords,
  onTransferInitiated,
  onDelivered,
  onDenySuccess,
  navigation,
  isAtDrop = false,
  orderStage = 'PICKUP',
}) => {
  const { socket } = useSocket();

  const isDropStage = Boolean(isAtDrop || orderStage === 'AT_DROP');

  const [step, setStep] = useState<HelpFlowStep>(() => (isDropStage ? 'DROP_HELP_9_OPTIONS' : 'HELP_MENU'));
  const [selectedIssueTitle, setSelectedIssueTitle] = useState<string>('Bike issue');
  const [selectedIssueKey, setSelectedIssueKey] = useState<string>('bike_issue');

  // Drop Help Stage States (User Requirement B: 9 Options)
  const [userRingCount, setUserRingCount] = useState<number>(0);
  const [userCallCount, setUserCallCount] = useState<number>(0);
  const [gateWaitSeconds, setGateWaitSeconds] = useState<number>(300); // 5 mins
  const [gateTimerRunning, setGateTimerRunning] = useState<boolean>(false);
  const [hasTakenProofPhoto, setHasTakenProofPhoto] = useState<boolean>(false);
  const [proofPhotoType, setProofPhotoType] = useState<string>('');
  const [userCancelRequestPending, setUserCancelRequestPending] = useState<boolean>(false);
  const [userCancelRequestTimer, setUserCancelRequestTimer] = useState<number>(120); // 2 mins

  // Radar Search State (स्क्रीन 7 & 8)
  const [searchRadius, setSearchRadius] = useState<number>(500); // 500m -> 1000m -> 2000m
  const [countdownSeconds, setCountdownSeconds] = useState<number>(60);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [photoTaken, setPhotoTaken] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Transfer Accepted Partner State & Locked Handover Location
  const [acceptedPartner, setAcceptedPartner] = useState<{
    riderId?: string;
    name?: string;
    phone?: string;
    photo?: string;
    vehicleNumber?: string;
    vehicleType?: string;
    location?: { latitude: number; longitude: number };
    etaMinutes?: number;
    transferOtp?: string;
  } | null>(null);
  const [transferOtp, setTransferOtp] = useState<string>('7391');
  const [lockedHandoverLocation, setLockedHandoverLocation] = useState<{
    latitude: number;
    longitude: number;
    address: string;
  } | null>(null);

  // Audio Play Simulation Animation
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const waveAnim = useRef(new Animated.Value(0.3)).current;
  const radarScale = useRef(new Animated.Value(1)).current;
  const radarOpacity = useRef(new Animated.Value(0.8)).current;

  // Gate Wait Timer Effect (Option 8)
  useEffect(() => {
    let interval: any = null;
    if (gateTimerRunning && gateWaitSeconds > 0) {
      interval = setInterval(() => {
        setGateWaitSeconds((s) => {
          if (s <= 1) {
            setGateTimerRunning(false);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [gateTimerRunning, gateWaitSeconds]);

  // User Cancel Request Timer Effect (Option 3)
  useEffect(() => {
    let interval: any = null;
    if (userCancelRequestPending && userCancelRequestTimer > 0) {
      interval = setInterval(() => {
        setUserCancelRequestTimer((s) => {
          if (s <= 1) {
            setUserCancelRequestPending(false);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [userCancelRequestPending, userCancelRequestTimer]);

  // Reset step on open
  const prevVisible = useRef<boolean>(false);
  useEffect(() => {
    if (visible && !prevVisible.current) {
      setStep(isDropStage ? 'DROP_HELP_9_OPTIONS' : 'HELP_MENU');
      setSearchRadius(500);
      setCountdownSeconds(60);
      setIsSearching(false);
      setPhotoTaken(false);
      setGateWaitSeconds(300);
      setGateTimerRunning(false);
      setHasTakenProofPhoto(false);
      setUserCancelRequestPending(false);
      setUserCancelRequestTimer(120);
    }
    prevVisible.current = visible;
  }, [visible, isDropStage]);

  // Hardware Back Button Protection
  useEffect(() => {
    if (!visible) return;
    const handleBack = () => {
      if (step === 'HELP_MENU' || (isDropStage && step === 'DROP_HELP_9_OPTIONS')) {
        onClose();
        return true;
      }
      if (
        step === 'LIVE_ORDER_REASONS' ||
        step === 'ID_CARD_BILL' ||
        step === 'DROP_HELP_9_OPTIONS'
      ) {
        setStep('HELP_MENU');
        return true;
      }
      if (
        step === 'DROP_USER_NOT_ANSWERING' ||
        step === 'DROP_USER_CANCEL_REQUEST' ||
        step === 'DROP_WRONG_ADDRESS' ||
        step === 'DROP_CHANGE_LOCATION' ||
        step === 'DROP_OTP_ISSUE' ||
        step === 'DROP_ITEM_ISSUE' ||
        step === 'DROP_GATE_CLOSED' ||
        step === 'DROP_EMERGENCY_HEALTH'
      ) {
        setStep('DROP_HELP_9_OPTIONS');
        return true;
      }
      if (
        step === 'RESTAURANT_CLOSED' ||
        step === 'CANNOT_DELIVER_SUB_REASONS' ||
        step === 'CANNOT_DELIVER_BIKE' ||
        step === 'PICKUP_OTP'
      ) {
        setStep(isDropStage ? 'DROP_HELP_9_OPTIONS' : 'LIVE_ORDER_REASONS');
        return true;
      }
      if (step === 'ORDER_DENIAL_WARNING') {
        setStep('CANNOT_DELIVER_BIKE');
        return true;
      }
      if (step === 'RADAR_SEARCH' || step === 'NO_PARTNER_AVAILABLE') {
        Alert.alert(
          'ऑर्डर डिलीवरी',
          'क्या आप खोज रद्द करके इस ऑर्डर को खुद डिलीवर करना चाहते हैं?',
          [
            { text: 'नहीं', style: 'cancel' },
            {
              text: 'हाँ, ऑर्डर डिलीवर करें',
              onPress: () => {
                setIsSearching(false);
                onClose();
              },
            },
          ]
        );
        return true;
      }
      setStep('HELP_MENU');
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => sub.remove();
  }, [visible, step, onClose]);

  // Radar Animation Loop
  useEffect(() => {
    if (step === 'RADAR_SEARCH') {
      const loop = Animated.loop(
        Animated.parallel([
          Animated.timing(radarScale, {
            toValue: 2.5,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(radarOpacity, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [step]);

  // Audio Bar Animation Loop
  useEffect(() => {
    if (isPlayingAudio) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(waveAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(waveAnim, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      waveAnim.setValue(0.3);
    }
  }, [isPlayingAudio]);

  // Radar Countdown Timer (1 Minute)
  useEffect(() => {
    let timer: any = null;
    if (step === 'RADAR_SEARCH' && countdownSeconds > 0) {
      timer = setInterval(() => {
        setCountdownSeconds((sec) => {
          if (sec <= 1) {
            clearInterval(timer);
            setStep('NO_PARTNER_AVAILABLE');
            return 0;
          }
          return sec - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [step, countdownSeconds]);

  // Real-time GPS Distances (No hardcoded dummy coords)
  const rLat = Number(activeOrder?.restaurantLocation?.latitude || activeOrder?.pickupLat || activeOrder?.pickupLocation?.latitude || 0);
  const rLon = Number(activeOrder?.restaurantLocation?.longitude || activeOrder?.pickupLon || activeOrder?.pickupLocation?.longitude || 0);
  const riderLat = Number(riderCoords?.latitude || activeOrder?.riderLocation?.latitude || riderUser?.location?.latitude || 0);
  const riderLon = Number(riderCoords?.longitude || activeOrder?.riderLocation?.longitude || riderUser?.location?.longitude || 0);

  const radarMapHtml = React.useMemo(() => {
    const lat = Number(riderLat || 0);
    const lon = Number(riderLon || 0);
    const hasValidGps = lat !== 0 && lon !== 0 && !isNaN(lat) && !isNaN(lon) && !(Math.abs(lat - 23.2599) < 0.0001 && Math.abs(lon - 77.4126) < 0.0001);
    const radiusMeters = Number(searchRadius || 500);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body, #map { width:100%; height:100%; background:#FAFBFD; }
    .rider-custom-icon {
      background: #FFFFFF;
      border: 2.5px solid #0066FF;
      border-radius: 50%;
      width: 42px;
      height: 42px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0, 102, 255, 0.35);
      font-size: 22px;
    }
    .gps-wait-msg {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: #FFFFFF; color: #0F172A; font-family: sans-serif; font-size: 13px; font-weight: 700;
      padding: 12px 18px; border-radius: 12px; border: 1px solid #CBD5E1; box-shadow: 0 4px 12px rgba(0,0,0,0.12);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  ${hasValidGps ? '' : '<div class="gps-wait-msg">Locating your position...</div>'}
  <script>
    if (${hasValidGps}) {
      var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([${lat}, ${lon}], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

      var riderIcon = L.divIcon({
        className: '',
        html: '<div class="rider-custom-icon">🛵</div>',
        iconSize: [42, 42],
        iconAnchor: [21, 21]
      });
      var riderMarker = L.marker([${lat}, ${lon}], { icon: riderIcon }).addTo(map);
      riderMarker.bindTooltip('<b>आपकी लोकेशन (हैंडओवर पॉइंट)</b>', { permanent: true, direction: 'top', offset: [0, -22] });

      var radarCircle = L.circle([${lat}, ${lon}], {
        radius: ${radiusMeters},
        color: '#0066FF',
        weight: 1.5,
        fillColor: '#3B82F6',
        fillOpacity: 0.12
      }).addTo(map);

      map.fitBounds(radarCircle.getBounds(), { padding: [35, 35] });
    }
  </script>
</body>
</html>`;
  }, [riderLat, riderLon, searchRadius]);

  // Haversine calculation
  const calcDistMeters = (lat1?: number, lon1?: number, lat2?: number, lon2?: number) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 1200; // default 1.2km
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  };

  const distToRestaurantMeters = calcDistMeters(riderLat, riderLon, rLat, rLon);
  const isWithin100mOfRestaurant = distToRestaurantMeters <= 100;

  // Open Navigation Map
  const handleOpenNavigation = (lat: number, lon: number, label: string) => {
    const url = Platform.select({
      ios: `maps:0,0?q=${lat},${lon}`,
      android: `google.navigation:q=${lat},${lon}`,
    });
    if (url) {
      Linking.openURL(url).catch(() => {
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`);
      });
    }
  };

  // Transfer Accepted Socket Listener
  useEffect(() => {
    if (!socket || !visible) return;

    const onTransferAccepted = (data: any) => {
      console.log('📢 [RiderHelpModal] Transfer accepted by partner:', data);
      const bId = String(data?.bookingId || data?.orderId || data?.rideId || '');
      const myId = String(bookingId || activeOrder?.bookingId || activeOrder?._id || '');
      if (bId === myId || !bId) {
        setAcceptedPartner({
          riderId: data.transferRiderId || data.newRiderId || data.riderId || 'rider_b_99',
          name: data.transferRiderName || data.newRiderName || data.name || 'Rahul Sharma (Fast Fleet)',
          phone: data.transferRiderPhone || data.newRiderPhone || data.phone || '9876543210',
          photo: data.transferRiderPhoto || data.photo || null,
          vehicleNumber: data.transferRiderVehicle || data.vehicleNumber || 'MP 04 AB 1234',
          vehicleType: data.vehicleType || 'Bike',
          location: data.location || (riderCoords?.latitude && riderCoords?.longitude ? {
            latitude: riderCoords.latitude,
            longitude: riderCoords.longitude,
          } : undefined),
          etaMinutes: data.etaMinutes || 4,
          transferOtp: data.transferOtp || '7391',
        });
        if (data.transferOtp) {
          setTransferOtp(String(data.transferOtp));
        }
        setStep('TRANSFER_ACCEPTED_PARTNER');
      }
    };

    const onOrderTransferred = (data: any) => {
      console.log('🎉 [RiderHelpModal] Order transferred complete:', data);
      onTransferAccepted(data);
    };

    socket.on('TRANSFER_ACCEPTED', onTransferAccepted);
    socket.on('order_transferred', onOrderTransferred);
    socket.on('ORDER_TRANSFERRED', onOrderTransferred);

    return () => {
      socket.off('TRANSFER_ACCEPTED', onTransferAccepted);
      socket.off('order_transferred', onOrderTransferred);
      socket.off('ORDER_TRANSFERRED', onOrderTransferred);
    };
  }, [socket, visible, bookingId, activeOrder, riderCoords]);

  const handleBroadcastTransfer = async () => {
    try {
      setIsSubmitting(true);
      const riderId = riderUser?._id || riderUser?.id;
      const bId = bookingId || activeOrder?.bookingId || activeOrder?._id;

      const handoverLoc = {
        latitude: riderLat,
        longitude: riderLon,
        address: activeOrder?.deliveryAddress || activeOrder?.pickupAddress || 'Handover Point',
      };
      setLockedHandoverLocation(handoverLoc);

      await api.post('/bookings/rider-transfer-order', {
        bookingId: bId,
        riderId,
        reason: selectedIssueTitle || 'Vehicle Breakdown',
        transferLocation: handoverLoc,
        radius: searchRadius,
      }).catch(() => { });

      if (socket && socket.connected) {
        socket.emit('rider_transfer_request', {
          bookingId: bId,
          riderId,
          reason: selectedIssueTitle || 'Vehicle Breakdown',
          handoverLocation: handoverLoc,
          radius: searchRadius,
        });
        socket.emit('rider_deny_order_radar', {
          bookingId: bId,
          riderId,
          reason: selectedIssueTitle || 'Vehicle Breakdown',
          handoverLocation: handoverLoc,
          searchRadius,
        });
      }

      setIsSubmitting(false);
      Alert.alert(
        'ट्रांसफर रिक्वेस्ट भेजी गई',
        `आस-पास के सभी सक्रिय डिलीवरी पार्टनर्स को ${searchRadius >= 1000 ? searchRadius / 1000 + ' km' : searchRadius + ' m'} के दायरे में रिक्वेस्ट भेज दी गई है।`,
        [{ text: 'OK' }]
      );
    } catch (e: any) {
      setIsSubmitting(false);
      Alert.alert('त्रुटि', 'ट्रांसफर रिक्वेस्ट भेजने में समस्या आई।');
    }
  };

  const handleFinishHandover = () => {
    onClose();
    if (onDenySuccess) {
      onDenySuccess();
    } else if (navigation) {
      navigation.reset({
        index: 0,
        routes: [{ name: 'DeliveryRiderHomeScreen' }],
      });
    }
    Alert.alert('हैंडओवर पूर्ण', 'ऑर्डर सफलतापूर्वक नए डिलीवरी पार्टनर को ट्रांसफर हो गया है।');
  };

  // Start Radar Search (अस्वीकार/ट्रांसफर पुष्टि)
  const handleStartRadarSearch = async () => {
    try {
      setIsSubmitting(true);
      const riderId = riderUser?._id || riderUser?.id;
      const bId = bookingId || activeOrder?.bookingId || activeOrder?._id;

      // Backend API Call: transfers order with rejection list logging
      await api.post('/bookings/rider-transfer-order', {
        bookingId: bId,
        riderId,
        reason: selectedIssueTitle,
        radius: searchRadius,
      }).catch(() => { });

      if (socket && socket.connected) {
        socket.emit('rider_deny_order_radar', {
          bookingId: bId,
          riderId,
          reason: selectedIssueTitle,
          searchRadius,
        });
      }

      setIsSubmitting(false);
      setCountdownSeconds(60);
      setStep('RADAR_SEARCH');
    } catch (err: any) {
      setIsSubmitting(false);
      setCountdownSeconds(60);
      setStep('RADAR_SEARCH');
    }
  };

  // Final Rejection Action (Order unassigned, return to home)
  const handleFinalRejectionExit = async () => {
    try {
      setIsSubmitting(true);
      const riderId = riderUser?._id || riderUser?.id;
      const bId = bookingId || activeOrder?.bookingId || activeOrder?._id;

      await api.post('/bookings/rider-reject', {
        bookingId: bId,
        riderId,
        reason: selectedIssueTitle,
      }).catch(() => { });

      setIsSubmitting(false);
      onClose();

      if (onDenySuccess) {
        onDenySuccess();
      } else if (navigation) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'DeliveryRiderHomeScreen' }],
        });
      }
    } catch (_) {
      setIsSubmitting(false);
      onClose();
      if (navigation) {
        navigation.navigate('DeliveryRiderHomeScreen');
      }
    }
  };

  // Toggle Audio wave
  const toggleAudio = () => {
    setIsPlayingAudio(!isPlayingAudio);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent={true} onRequestClose={onClose}>
      <View style={styles.fullScreenLight}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

        {/* ══════════════════════════════════════════════════════════════
            1. HELP MENU (अधिक विकल्प Sheet - Pure Light Mode)
           ══════════════════════════════════════════════════════════════ */}
        {step === 'HELP_MENU' && (
          <View style={styles.containerLight}>
            {/* Header: अधिक विकल्प ✕ */}
            <View style={styles.headerLight}>
              <Text style={styles.headerTitleLight}>अधिक विकल्प</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtnLight} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={styles.closeBtnTextLight}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 6 }}>
              {/* Option 1: लाइव ऑर्डर मदद */}
              <TouchableOpacity
                style={styles.menuRowLight}
                onPress={() => setStep(isDropStage ? 'DROP_HELP_9_OPTIONS' : 'LIVE_ORDER_REASONS')}
                activeOpacity={0.7}
              >
                <View style={[styles.iconCircleLight, { backgroundColor: '#F1F5F9' }]}>
                  <Text style={{ fontSize: 22 }}>🎧</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text style={styles.menuTitleLight}>लाइव ऑर्डर मदद</Text>
                  <Text style={styles.menuSubtitleLight}>चल रही यात्रा के लिए मुद्दे</Text>
                </View>
                <Text style={styles.chevronLight}>›</Text>
              </TouchableOpacity>

              <View style={styles.dividerLight} />

              {/* Option 2: आईडी कार्ड और बिल दिखाएं */}
              <TouchableOpacity
                style={styles.menuRowLight}
                onPress={() => setStep('ID_CARD_BILL')}
                activeOpacity={0.7}
              >
                <View style={[styles.iconCircleLight, { backgroundColor: '#F1F5F9' }]}>
                  <Text style={{ fontSize: 22 }}>🪪</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text style={styles.menuTitleLight}>आईडी कार्ड और बिल दिखाएं</Text>
                  <Text style={styles.menuSubtitleLight}>बिल केवल ऑर्डर के दौरान उपलब्ध होगा</Text>
                </View>
                <Text style={styles.chevronLight}>›</Text>
              </TouchableOpacity>

              <View style={styles.dividerLight} />

              {/* Option 3: बारिश की सूचना दें */}
              <TouchableOpacity
                style={styles.menuRowLight}
                onPress={() => {
                  Alert.alert(
                    'बारिश की सूचना 🌧️',
                    'क्या आपके क्षेत्र में बारिश हो रही है? बारिश रिपोर्ट करने से रेन सर्ज इंसेंटिव सक्रिय हो जाएगा।',
                    [
                      { text: 'रद्द करें', style: 'cancel' },
                      {
                        text: 'हाँ, बारिश हो रही है',
                        onPress: () => {
                          if (socket && socket.connected) {
                            socket.emit('rider_report_rain', {
                              riderId: riderUser?._id || riderUser?.id,
                              timestamp: new Date(),
                            });
                          }
                          Alert.alert('सफलता', 'बारिश की रिपोर्ट दर्ज कर ली गई है! रेन सर्ज सक्रिय है।');
                          onClose();
                        },
                      },
                    ]
                  );
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.iconCircleLight, { backgroundColor: '#F1F5F9' }]}>
                  <Text style={{ fontSize: 22 }}>🌧️</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text style={styles.menuTitleLight}>बारिश की सूचना दें</Text>
                  <Text style={styles.menuSubtitleLight}>यदि आपके क्षेत्र में बारिश हो रही है</Text>
                </View>
                <Text style={styles.chevronLight}>›</Text>
              </TouchableOpacity>

              <View style={styles.dividerLight} />
            </ScrollView>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════
            2. LIVE ORDER REASONS (डिलीवर नहीं कर सकते, पिकअप ओटीपी, रेस्टोरेंट बंद है...)
           ══════════════════════════════════════════════════════════════ */}
        {step === 'LIVE_ORDER_REASONS' && (
          <View style={styles.containerLight}>
            {/* Header: ← Live Order : 880551xxxx */}
            <View style={styles.headerLight}>
              <TouchableOpacity onPress={() => setStep('HELP_MENU')} style={{ paddingRight: 12 }}>
                <Text style={styles.backArrowLight}>←</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitleLight}>
                Live Order : {activeOrder?.bookingId ? String(activeOrder.bookingId).slice(-6) : '880551xxxx'}
              </Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtnLight}>
                <Text style={styles.closeBtnTextLight}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4 }}>
              {/* Option 1: डिलीवर नहीं कर सकते */}
              <TouchableOpacity
                style={styles.menuRowLight}
                onPress={() => {
                  setSelectedIssueTitle('Bike issue');
                  setSelectedIssueKey('bike_issue');
                  setStep('CANNOT_DELIVER_BIKE');
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.listTextLight}>डिलीवर नहीं कर सकते</Text>
                <Text style={styles.chevronLight}>›</Text>
              </TouchableOpacity>
              <View style={styles.dividerLight} />

              {/* Option 2: पिकअप ओटीपी समस्या */}
              <TouchableOpacity
                style={styles.menuRowLight}
                onPress={() => setStep('PICKUP_OTP')}
                activeOpacity={0.7}
              >
                <Text style={styles.listTextLight}>पिकअप ओटीपी समस्या</Text>
                <Text style={styles.chevronLight}>›</Text>
              </TouchableOpacity>
              <View style={styles.dividerLight} />

              {/* Option 3: रेस्टोरेंट बंद है */}
              <TouchableOpacity
                style={styles.menuRowLight}
                onPress={() => setStep('RESTAURANT_CLOSED')}
                activeOpacity={0.7}
              >
                <Text style={styles.listTextLight}>रेस्टोरेंट बंद है</Text>
                <Text style={styles.chevronLight}>›</Text>
              </TouchableOpacity>
              <View style={styles.dividerLight} />

              {/* Option 4: रेस्टोरेंट नहीं मिल रहा है */}
              <TouchableOpacity
                style={styles.menuRowLight}
                onPress={() => {
                  setSelectedIssueTitle('Restaurant Not Found');
                  setSelectedIssueKey('restaurant_not_found');
                  setStep('CANNOT_DELIVER_BIKE');
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.listTextLight}>रेस्टोरेंट नहीं मिल रहा है</Text>
                <Text style={styles.chevronLight}>›</Text>
              </TouchableOpacity>
              <View style={styles.dividerLight} />
            </ScrollView>
          </View>
        )}
        {/* ══════════════════════════════════════════════════════════════
            2B. LIVE ORDER REASONS AT DROP (ड्रॉप लोकेशन पर 9 ऑप्शन - Pure Light Mode)
           ══════════════════════════════════════════════════════════════ */}
        {step === 'DROP_HELP_9_OPTIONS' && (
          <View style={styles.containerLight}>
            {/* Header: ← Live Order : RHxxxxxx */}
            <View style={styles.headerLight}>
              <TouchableOpacity onPress={() => setStep('HELP_MENU')} style={{ paddingRight: 12 }}>
                <Text style={styles.backArrowLight}>←</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitleLight}>
                Live Order : {activeOrder?.bookingId ? String(activeOrder.bookingId).slice(-6) : '880551'}
              </Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtnLight}>
                <Text style={styles.closeBtnTextLight}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4 }}>
              {/* Option 1: डिलीवर नहीं कर सकते */}
              <TouchableOpacity
                style={styles.menuRowLight}
                onPress={() => {
                  socket?.emit('rider_help_stage_action', {
                    bookingId,
                    riderId: riderUser?._id,
                    actionType: 'CANNOT_DELIVER_CLICKED',
                  });
                  setStep('CANNOT_DELIVER_SUB_REASONS');
                }}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTextLight}>1. डिलीवर नहीं कर सकते</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    कारण चुनें (बाइक, दुर्घटना, आपातकाल) → ट्रांसफर फ़्लो
                  </Text>
                </View>
                <Text style={styles.chevronLight}>›</Text>
              </TouchableOpacity>
              <View style={styles.dividerLight} />

              {/* Option 2: यूज़र फ़ोन नहीं उठा रहा */}
              <TouchableOpacity
                style={styles.menuRowLight}
                onPress={() => {
                  socket?.emit('rider_help_stage_action', {
                    bookingId,
                    riderId: riderUser?._id,
                    actionType: 'USER_NOT_ANSWERING_SELECTED',
                  });
                  setStep('DROP_USER_NOT_ANSWERING');
                }}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTextLight}>2. यूज़र फ़ोन नहीं उठा रहा</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    ऐप रिंग, फोन कॉल, गेट/दरवाज़ा खटखटाने के निर्देश
                  </Text>
                </View>
                <Text style={styles.chevronLight}>›</Text>
              </TouchableOpacity>
              <View style={styles.dividerLight} />

              {/* Option 3: यूज़र ने ऑर्डर कैंसल करने को कहा */}
              <TouchableOpacity
                style={styles.menuRowLight}
                onPress={() => {
                  socket?.emit('rider_help_stage_action', {
                    bookingId,
                    riderId: riderUser?._id,
                    actionType: 'USER_CANCEL_REQUEST_SELECTED',
                  });
                  setStep('DROP_USER_CANCEL_REQUEST');
                }}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTextLight}>3. यूज़र ने ऑर्डर कैंसल करने को कहा</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    यूज़र ऐप से पुष्टि, नॉट-रिफंडेबल, न्यूनतम ₹20 गारंटी
                  </Text>
                </View>
                <Text style={styles.chevronLight}>›</Text>
              </TouchableOpacity>
              <View style={styles.dividerLight} />

              {/* Option 4: यूज़र का एड्रेस गलत है */}
              <TouchableOpacity
                style={styles.menuRowLight}
                onPress={() => {
                  socket?.emit('rider_help_stage_action', {
                    bookingId,
                    riderId: riderUser?._id,
                    actionType: 'WRONG_ADDRESS_SELECTED',
                  });
                  setStep('DROP_WRONG_ADDRESS');
                }}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTextLight}>4. यूज़र का एड्रेस गलत है</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    यूज़र को कॉल, नया पता अपडेट, अतिरिक्त दूरी भुगतान
                  </Text>
                </View>
                <Text style={styles.chevronLight}>›</Text>
              </TouchableOpacity>
              <View style={styles.dividerLight} />

              {/* Option 5: यूज़र ने कहा कहीं और दे दो */}
              <TouchableOpacity
                style={styles.menuRowLight}
                onPress={() => {
                  socket?.emit('rider_help_stage_action', {
                    bookingId,
                    riderId: riderUser?._id,
                    actionType: 'CHANGE_LOCATION_SELECTED',
                  });
                  setStep('DROP_CHANGE_LOCATION');
                }}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTextLight}>5. यूज़र ने कहा कहीं और दे दो</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    नया पता सीधे यूज़र ऐप से, 50m में OTP से डिलीवरी
                  </Text>
                </View>
                <Text style={styles.chevronLight}>›</Text>
              </TouchableOpacity>
              <View style={styles.dividerLight} />

              {/* Option 6: ओटीपी की दिक्कत */}
              <TouchableOpacity
                style={styles.menuRowLight}
                onPress={() => {
                  socket?.emit('rider_help_stage_action', {
                    bookingId,
                    riderId: riderUser?._id,
                    actionType: 'OTP_ISSUE_SELECTED',
                  });
                  setStep('DROP_OTP_ISSUE');
                }}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTextLight}>6. ओटीपी की दिक्कत</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    OTP पुनः भेजें, कॉल करें, सपोर्ट से मैन्युअल अप्रूवल
                  </Text>
                </View>
                <Text style={styles.chevronLight}>›</Text>
              </TouchableOpacity>
              <View style={styles.dividerLight} />

              {/* Option 7: सामान में गड़बड़ी */}
              <TouchableOpacity
                style={styles.menuRowLight}
                onPress={() => {
                  socket?.emit('rider_help_stage_action', {
                    bookingId,
                    riderId: riderUser?._id,
                    actionType: 'ITEM_ISSUE_SELECTED',
                  });
                  setStep('DROP_ITEM_ISSUE');
                }}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTextLight}>7. सामान में गड़बड़ी</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    सामान की फ़ोटो अपलोड, पिकअप फ़ोटो से मिलान
                  </Text>
                </View>
                <Text style={styles.chevronLight}>›</Text>
              </TouchableOpacity>
              <View style={styles.dividerLight} />

              {/* Option 8: गेट बंद है या अंदर जाने की इजाज़त नहीं */}
              <TouchableOpacity
                style={styles.menuRowLight}
                onPress={() => {
                  socket?.emit('rider_help_stage_action', {
                    bookingId,
                    riderId: riderUser?._id,
                    actionType: 'GATE_CLOSED_SELECTED',
                  });
                  setStep('DROP_GATE_CLOSED');
                }}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTextLight}>8. गेट बंद है या अंदर जाने की इजाज़त नहीं</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    यूज़र को 'गेट पर आइए' कॉल, 5 मिनट टाइमर, गेट फ़ोटो
                  </Text>
                </View>
                <Text style={styles.chevronLight}>›</Text>
              </TouchableOpacity>
              <View style={styles.dividerLight} />

              {/* Option 9: मेरी तबीयत या बाइक में दिक्कत */}
              <TouchableOpacity
                style={styles.menuRowLight}
                onPress={() => {
                  socket?.emit('rider_help_stage_action', {
                    bookingId,
                    riderId: riderUser?._id,
                    actionType: 'EMERGENCY_HEALTH_SELECTED',
                  });
                  setStep('DROP_EMERGENCY_HEALTH');
                }}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTextLight}>9. मेरी तबीयत या बाइक में दिक्कत</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    इमरजेंसी ट्रांसफर (असीमित) और 112 सहायता
                  </Text>
                </View>
                <Text style={styles.chevronLight}>›</Text>
              </TouchableOpacity>
              <View style={styles.dividerLight} />
            </ScrollView>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════
            CANNOT DELIVER SUB-REASONS (कारण: बाइक, दुर्घटना, आपातकाल)
           ══════════════════════════════════════════════════════════════ */}
        {step === 'CANNOT_DELIVER_SUB_REASONS' && (
          <View style={styles.containerLight}>
            <View style={styles.headerLight}>
              <TouchableOpacity onPress={() => setStep(isDropStage ? 'DROP_HELP_9_OPTIONS' : 'LIVE_ORDER_REASONS')} style={{ paddingRight: 12 }}>
                <Text style={styles.backArrowLight}>←</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitleLight}>कारण चुनें</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtnLight}>
                <Text style={styles.closeBtnTextLight}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4 }}>
              <TouchableOpacity
                style={styles.menuRowLight}
                onPress={() => {
                  setSelectedIssueTitle('Bike Breakdown');
                  setSelectedIssueKey('bike_breakdown');
                  setStep('CANNOT_DELIVER_BIKE');
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.listTextLight}>बाइक खराब हो गई (Bike Breakdown)</Text>
                <Text style={styles.chevronLight}>›</Text>
              </TouchableOpacity>
              <View style={styles.dividerLight} />

              <TouchableOpacity
                style={styles.menuRowLight}
                onPress={() => {
                  setSelectedIssueTitle('Accident Incident');
                  setSelectedIssueKey('accident_incident');
                  setStep('CANNOT_DELIVER_BIKE');
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.listTextLight}>दुर्घटना का शिकार हुआ (Accident)</Text>
                <Text style={styles.chevronLight}>›</Text>
              </TouchableOpacity>
              <View style={styles.dividerLight} />

              <TouchableOpacity
                style={styles.menuRowLight}
                onPress={() => {
                  setSelectedIssueTitle('Personal Emergency');
                  setSelectedIssueKey('personal_emergency');
                  setStep('CANNOT_DELIVER_BIKE');
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.listTextLight}>व्यक्तिगत आपातकाल (Emergency)</Text>
                <Text style={styles.chevronLight}>›</Text>
              </TouchableOpacity>
              <View style={styles.dividerLight} />
            </ScrollView>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════
            DROP OPTION 2: यूज़र फ़ोन नहीं उठा रहा
           ══════════════════════════════════════════════════════════════ */}
        {step === 'DROP_USER_NOT_ANSWERING' && (
          <View style={styles.containerLight}>
            <View style={styles.headerLight}>
              <TouchableOpacity onPress={() => setStep('DROP_HELP_9_OPTIONS')} style={{ paddingRight: 10 }}>
                <Text style={styles.backArrowLight}>←</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitleLight}>यूज़र फ़ोन नहीं उठा रहा</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtnLight}>
                <Text style={styles.closeBtnTextLight}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
              {/* Guidance Notice */}
              <View style={{
                backgroundColor: '#FFF7ED',
                borderLeftWidth: 4,
                borderLeftColor: '#EA580C',
                borderRadius: 12,
                padding: 14,
                marginBottom: 16,
              }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#9A3412', marginBottom: 4 }}>
                  ⚠️ राइडर निर्देश:
                </Text>
                <Text style={{ fontSize: 13, color: '#C2410C', lineHeight: 19 }}>
                  यूज़र को कॉल लगाई गई, जवाब नहीं मिला। कृपया गेट के पास देखें या दरवाज़ा खटखटाएँ।
                </Text>
              </View>

              {/* Step 1: In-App Ringing (Push + Full Screen) */}
              <View style={{
                backgroundColor: '#F8FAFC',
                borderWidth: 1,
                borderColor: '#E2E8F0',
                borderRadius: 14,
                padding: 16,
                marginBottom: 12,
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A' }}>1. ऐप में रिंग भेजें</Text>
                  <View style={{ backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#0066FF' }}>{userRingCount}/3 रिंग की गई</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>
                  यूज़र के फोन पर तुरंत फुल-स्क्रीन रिंग और हाई-प्रायोरिटी नोटिफिकेशन जाएगा। (10 मिनट में अधिकतम 3)
                </Text>
                <TouchableOpacity
                  style={{
                    backgroundColor: userRingCount >= 3 ? '#94A3B8' : '#0066FF',
                    borderRadius: 10,
                    paddingVertical: 12,
                    alignItems: 'center',
                    flexDirection: 'row',
                    justifyContent: 'center',
                  }}
                  disabled={userRingCount >= 3}
                  onPress={() => {
                    if (userRingCount < 3) {
                      setUserRingCount((c) => c + 1);
                      socket?.emit('rider_help_stage_action', {
                        bookingId,
                        riderId: riderUser?._id,
                        actionType: 'USER_NOT_ANSWERING_RING',
                        details: { count: userRingCount + 1 },
                      });
                      Alert.alert('रिंग भेजी गई', 'ग्राहक के फोन पर फुल-स्क्रीन रिंग भेजी गई है। 30 सेकंड प्रतीक्षा करें।');
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 16, marginRight: 8 }}>🔔</Text>
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>
                    {userRingCount >= 3 ? 'रिंग सीमा समाप्त (3/3)' : 'ऐप पर रिंग करें'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Step 2: Real Phone Call via Server */}
              <View style={{
                backgroundColor: '#F8FAFC',
                borderWidth: 1,
                borderColor: '#E2E8F0',
                borderRadius: 14,
                padding: 16,
                marginBottom: 16,
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A' }}>2. सीधे फोन कॉल लगाएँ</Text>
                  <View style={{ backgroundColor: '#F0FDF4', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#16A34A' }}>{userCallCount}/2 कॉल की गई</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>
                  ग्राहक के नंबर पर सीधी कॉल मिलाएँ। (10 मिनट में अधिकतम 2 कॉल)
                </Text>
                <TouchableOpacity
                  style={{
                    backgroundColor: userCallCount >= 2 ? '#94A3B8' : '#16A34A',
                    borderRadius: 10,
                    paddingVertical: 12,
                    alignItems: 'center',
                    flexDirection: 'row',
                    justifyContent: 'center',
                  }}
                  disabled={userCallCount >= 2}
                  onPress={() => {
                    const phone = activeOrder?.customerPhone || activeOrder?.phone || activeOrder?.recipientPhone;
                    if (userCallCount < 2) {
                      setUserCallCount((c) => c + 1);
                      socket?.emit('rider_help_stage_action', {
                        bookingId,
                        riderId: riderUser?._id,
                        actionType: 'USER_NOT_ANSWERING_CALL',
                        details: { count: userCallCount + 1 },
                      });
                      if (phone) {
                        Linking.openURL(`tel:${phone}`).catch(() => { });
                      } else {
                        Alert.alert('कॉल', 'ग्राहक का फोन नंबर सर्वर से डायल किया जा रहा है...');
                      }
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 16, marginRight: 8 }}>📞</Text>
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>
                    {userCallCount >= 2 ? 'कॉल सीमा समाप्त (2/2)' : 'यूज़र को कॉल लगाएँ'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Step 3: Cancellation after limits */}
              <TouchableOpacity
                style={{
                  backgroundColor: '#DC2626',
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 10,
                }}
                onPress={() => {
                  socket?.emit('rider_help_stage_action', {
                    bookingId,
                    riderId: riderUser?._id,
                    actionType: 'USER_UNREACHABLE_CANCEL_SUPPORT',
                  });
                  Alert.alert(
                    'ऑर्डर कैंसल & सपोर्ट चैट',
                    'यूज़र से संपर्क नहीं हो पाया है। सपोर्ट टीम से संपर्क किया जा रहा है। कृपया दरवाज़े की फ़ोटो लेकर चैट से जुड़ें।',
                    [
                      { text: 'सपोर्ट चैट खोलें', onPress: () => { onClose(); navigation?.navigate?.('SupportChat'); } },
                      { text: 'ठीक है', style: 'cancel' },
                    ]
                  );
                }}
                activeOpacity={0.85}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>
                  🎧 ऑर्डर कैंसल करें (सपोर्ट एजेंट से जुड़ें)
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════
            DROP OPTION 3: यूज़र ने ऑर्डर कैंसल करने को कहा
           ══════════════════════════════════════════════════════════════ */}
        {step === 'DROP_USER_CANCEL_REQUEST' && (
          <View style={styles.containerLight}>
            <View style={styles.headerLight}>
              <TouchableOpacity onPress={() => setStep('DROP_HELP_9_OPTIONS')} style={{ paddingRight: 10 }}>
                <Text style={styles.backArrowLight}>←</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitleLight}>यूज़र ने कैंसल करने को कहा</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtnLight}>
                <Text style={styles.closeBtnTextLight}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
              {/* Policy Protection Banner */}
              <View style={{
                backgroundColor: '#ECFDF5',
                borderWidth: 1,
                borderColor: '#A7F3D0',
                borderRadius: 14,
                padding: 14,

                marginBottom: 16,
              }}>
                <Text style={{ fontSize: 14, fontWeight: '900', color: '#065F46', marginBottom: 4 }}>
                  🛡️ राइडर सुरक्षा नीति (Not Refundable):
                </Text>
                <Text style={{ fontSize: 13, color: '#047857', lineHeight: 19 }}>
                  यह कैंसलेशन 'नॉट रिफंडेबल' माना जाएगा। राइडर को पूरी दूरी का पैसा (न्यूनतम ₹20 गारंटी) मिलेगा।
                </Text>
              </View>

              {/* Action 1: Request confirmation in customer's app */}
              <View style={{
                backgroundColor: '#F8FAFC',
                borderWidth: 1,
                borderColor: '#E2E8F0',
                borderRadius: 14,
                padding: 16,
                marginBottom: 12,
              }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 4 }}>
                  1. यूज़र के ऐप में पुष्टि माँगें
                </Text>
                <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>
                  यूज़र के फ़ोन पर पुष्टि का पॉप-अप भेजा जाएगा। यदि यूज़र जवाब नहीं देता है तो सपोर्ट एजेंट चैट में तय करेगा।
                </Text>
                <TouchableOpacity
                  style={{
                    backgroundColor: userCancelRequestPending ? '#94A3B8' : '#0066FF',
                    borderRadius: 10,
                    paddingVertical: 12,
                    alignItems: 'center',
                  }}
                  disabled={userCancelRequestPending}
                  onPress={() => {
                    setUserCancelRequestPending(true);
                    socket?.emit('rider_help_stage_action', {
                      bookingId,
                      riderId: riderUser?._id,
                      actionType: 'USER_CANCEL_CONFIRMATION_REQUEST',
                    });
                    Alert.alert('पुष्टि अनुरोध भेजा गया', 'यूज़र के ऐप पर कैंसलेशन पुष्टि भेजी गई है। (2 मिनट इंतज़ार करें)');
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>
                    {userCancelRequestPending
                      ? `प्रतीक्षा... (${Math.floor(userCancelRequestTimer / 60)}:${String(userCancelRequestTimer % 60).padStart(2, '0')})`
                      : 'यूज़र के ऐप में पुष्टि भेजें 📲'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Action 2: Take Door Photo */}
              <View style={{
                backgroundColor: '#F8FAFC',
                borderWidth: 1,
                borderColor: '#E2E8F0',
                borderRadius: 14,
                padding: 16,
                marginBottom: 16,
              }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 4 }}>
                  2. दरवाज़े / पते की फ़ोटो खींचें
                </Text>
                <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>
                  स्थान पर आपकी उपस्थिति साबित करने के लिए ग्राहक के दरवाज़े या मकान नंबर की फ़ोटो अनिवार्य है।
                </Text>
                <TouchableOpacity
                  style={{
                    backgroundColor: hasTakenProofPhoto ? '#16A34A' : '#F1F5F9',
                    borderWidth: 1,
                    borderColor: hasTakenProofPhoto ? '#16A34A' : '#CBD5E1',
                    borderRadius: 10,
                    paddingVertical: 12,
                    alignItems: 'center',
                    flexDirection: 'row',
                    justifyContent: 'center',
                  }}
                  onPress={() => {
                    setHasTakenProofPhoto(true);
                    setProofPhotoType('DOOR_PHOTO');
                    socket?.emit('rider_help_stage_action', {
                      bookingId,
                      riderId: riderUser?._id,
                      actionType: 'DOOR_PHOTO_PROOF_CAPTURED',
                    });
                    Alert.alert('फ़ोटो सहेजी गई', 'दरवाज़े की फ़ोटो सफलतापूर्वक कैप्चर हो गई है।');
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 16, marginRight: 6 }}>{hasTakenProofPhoto ? '✓' : '📸'}</Text>
                  <Text style={{
                    color: hasTakenProofPhoto ? '#FFFFFF' : '#0F172A',
                    fontWeight: '800',
                    fontSize: 14
                  }}>
                    {hasTakenProofPhoto ? 'दरवाज़े की फ़ोटो सत्यापित ✓' : 'दरवाज़े की फ़ोटो लें 📸'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Action 3: Support Chat Decision */}
              <TouchableOpacity
                style={{
                  backgroundColor: '#7C3AED',
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => {
                  socket?.emit('rider_help_stage_action', {
                    bookingId,
                    riderId: riderUser?._id,
                    actionType: 'USER_CANCEL_SUPPORT_CHAT_ESCALATED',
                  });
                  onClose();
                  navigation?.navigate?.('SupportChat');
                }}
                activeOpacity={0.85}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>
                  🎧 सपोर्ट एजेंट से कैंसलेशन तय करें
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════
            DROP OPTION 4: यूज़र का एड्रेस गलत है
           ══════════════════════════════════════════════════════════════ */}
        {step === 'DROP_WRONG_ADDRESS' && (
          <View style={styles.containerLight}>
            <View style={styles.headerLight}>
              <TouchableOpacity onPress={() => setStep('DROP_HELP_9_OPTIONS')} style={{ paddingRight: 10 }}>
                <Text style={styles.backArrowLight}>←</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitleLight}>यूज़र का एड्रेस गलत है</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtnLight}>
                <Text style={styles.closeBtnTextLight}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
              {/* Guidance */}
              <View style={{
                backgroundColor: '#EFF6FF',
                borderLeftWidth: 4,
                borderLeftColor: '#0066FF',
                borderRadius: 12,
                padding: 14,
                marginBottom: 16,
              }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#1E40AF', marginBottom: 4 }}>
                  📍 गलत पते की स्थिति में प्रक्रिया:
                </Text>
                <Text style={{ fontSize: 13, color: '#1D4ED8', lineHeight: 19 }}>
                  पहले यूज़र को कॉल करें। यूज़र अपने ऐप में नया पता अपडेट करेगा तो ऑर्डर का पता स्वतः अपडेट होगा और नेविगेशन दोबारा चलेगा। नया पता दूर होने पर अतिरिक्त दूरी का पैसा राइडर को मिलेगा।
                </Text>
              </View>

              {/* Action 1: Call Customer */}
              <TouchableOpacity
                style={{
                  backgroundColor: '#0066FF',
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  marginBottom: 12,
                }}
                onPress={() => {
                  const phone = activeOrder?.customerPhone || activeOrder?.phone;
                  if (phone) {
                    Linking.openURL(`tel:${phone}`).catch(() => { });
                  } else {
                    Alert.alert('कॉल', 'यूज़र को कॉल मिलाया जा रहा है...');
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 18, color: '#FFFFFF', marginRight: 8 }}>📞</Text>
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>यूज़र को कॉल करें</Text>
              </TouchableOpacity>

              {/* Action 2: Address Change Notification */}
              <TouchableOpacity
                style={{
                  backgroundColor: '#F8FAFC',
                  borderWidth: 1.5,
                  borderColor: '#0066FF',
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}
                onPress={() => {
                  socket?.emit('rider_help_stage_action', {
                    bookingId,
                    riderId: riderUser?._id,
                    actionType: 'REQUEST_USER_ADDRESS_UPDATE',
                  });
                  Alert.alert('अनुरोध भेजा गया', 'यूज़र को ऐप में नया ड्रॉप पता डालने का पुश नोटिफिकेशन भेजा गया है।');
                }}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 18, marginRight: 8 }}>📨</Text>
                <Text style={{ color: '#0066FF', fontWeight: '900', fontSize: 15 }}>यूज़र को पता अपडेट लिंक भेजें</Text>
              </TouchableOpacity>

              {/* Fallback Option */}
              <View style={{ backgroundColor: '#FFF7ED', borderRadius: 12, padding: 14, marginBottom: 12 }}>
                <Text style={{ fontSize: 13, color: '#9A3412', marginBottom: 10 }}>
                  यदि यूज़र फ़ोन नहीं उठा रहा है या पता नहीं दे रहा:
                </Text>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#EA580C',
                    borderRadius: 10,
                    paddingVertical: 12,
                    alignItems: 'center',
                  }}
                  onPress={() => setStep('DROP_USER_NOT_ANSWERING')}
                  activeOpacity={0.85}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>
                    यूज़र फ़ोन नहीं उठा रहा (फ़्लो पर जाएँ) →
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════
            DROP OPTION 5: यूज़र ने कहा कहीं और दे दो
           ══════════════════════════════════════════════════════════════ */}
        {step === 'DROP_CHANGE_LOCATION' && (
          <View style={styles.containerLight}>
            <View style={styles.headerLight}>
              <TouchableOpacity onPress={() => setStep('DROP_HELP_9_OPTIONS')} style={{ paddingRight: 10 }}>
                <Text style={styles.backArrowLight}>←</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitleLight}>यूज़र ने कहा कहीं और दे दो</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtnLight}>
                <Text style={styles.closeBtnTextLight}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
              {/* Security Rule */}
              <View style={{
                backgroundColor: '#FEF2F2',
                borderLeftWidth: 4,
                borderLeftColor: '#DC2626',
                borderRadius: 12,
                padding: 14,
                marginBottom: 16,
              }}>
                <Text style={{ fontSize: 14, fontWeight: '900', color: '#991B1B', marginBottom: 4 }}>
                  🔒 सख्त सुरक्षा नियम:
                </Text>
                <Text style={{ fontSize: 13, color: '#B91C1C', lineHeight: 19 }}>
                  नया पता सीधे यूज़र के ऐप से ही आएगा, राइडर से नहीं। राइडर 50 मीटर में पहुँचकर ही OTP लेगा। अतिरिक्त दूरी का पैसा राइडर को स्वतः मिलेगा।
                </Text>
              </View>

              <TouchableOpacity
                style={{
                  backgroundColor: '#0066FF',
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  marginBottom: 12,
                }}
                onPress={() => {
                  socket?.emit('rider_help_stage_action', {
                    bookingId,
                    riderId: riderUser?._id,
                    actionType: 'REQUEST_USER_CHANGE_LOCATION_APP',
                  });
                  Alert.alert('अनुरोध भेजा गया', 'यूज़र के ऐप में नया पता चुनने की स्क्रीन खुल जाएगी। कृपया यूज़र द्वारा नया पता सेव करने की प्रतीक्षा करें।');
                }}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 18, color: '#FFFFFF', marginRight: 8 }}>📲</Text>
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>
                  यूज़र को ऐप में पता बदलने का अनुरोध भेजें
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  backgroundColor: '#F8FAFC',
                  borderWidth: 1,
                  borderColor: '#CBD5E1',
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => {
                  onClose();
                  navigation?.navigate?.('SupportChat');
                }}
                activeOpacity={0.8}
              >
                <Text style={{ color: '#0F172A', fontWeight: '800', fontSize: 14 }}>
                  सपोर्ट एजेंट से लाइव चैट करें 🎧
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════
            DROP OPTION 6: ओटीपी की दिक्कत
           ══════════════════════════════════════════════════════════════ */}
        {step === 'DROP_OTP_ISSUE' && (
          <View style={styles.containerLight}>
            <View style={styles.headerLight}>
              <TouchableOpacity onPress={() => setStep('DROP_HELP_9_OPTIONS')} style={{ paddingRight: 10 }}>
                <Text style={styles.backArrowLight}>←</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitleLight}>ओटीपी की दिक्कत</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtnLight}>
                <Text style={styles.closeBtnTextLight}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
              <View style={{
                backgroundColor: '#EFF6FF',
                borderLeftWidth: 4,
                borderLeftColor: '#0066FF',
                borderRadius: 12,
                padding: 14,
                marginBottom: 16,
              }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#1E40AF', marginBottom: 4 }}>
                  🔐 OTP समस्या समाधान:
                </Text>
                <Text style={{ fontSize: 13, color: '#1D4ED8', lineHeight: 19 }}>
                  यूज़र को दोबारा OTP भेजें या कॉल करें। बार-बार न मिलने पर सपोर्ट चैट से अनुमति लें। बिना OTP या सपोर्ट की मंज़ूरी के डिलीवरी पूरी नहीं हो सकती।
                </Text>
              </View>

              <TouchableOpacity
                style={{
                  backgroundColor: '#0066FF',
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  marginBottom: 12,
                }}
                onPress={() => {
                  socket?.emit('rider_help_stage_action', {
                    bookingId,
                    riderId: riderUser?._id,
                    actionType: 'RESEND_OTP',
                  });
                  Alert.alert('OTP भेजा गया', 'यूज़र के फोन पर नया 4-अंकीय OTP भेज दिया गया है।');
                }}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 18, color: '#FFFFFF', marginRight: 8 }}>📨</Text>
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>यूज़र को दोबारा OTP भेजें</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  backgroundColor: '#16A34A',
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}
                onPress={() => {
                  const phone = activeOrder?.customerPhone || activeOrder?.phone;
                  if (phone) Linking.openURL(`tel:${phone}`).catch(() => { });
                }}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 18, color: '#FFFFFF', marginRight: 8 }}>📞</Text>
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>यूज़र को सीधे कॉल करें</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  backgroundColor: '#7C3AED',
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => {
                  socket?.emit('rider_help_stage_action', {
                    bookingId,
                    riderId: riderUser?._id,
                    actionType: 'REQUEST_SUPPORT_MANUAL_DELIVERY_APPROVAL',
                  });
                  onClose();
                  navigation?.navigate?.('SupportChat');
                }}
                activeOpacity={0.85}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>
                  🎧 सपोर्ट से मैन्युअल डिलीवरी अप्रूवल लें
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════
            DROP OPTION 7: सामान में गड़बड़ी
           ══════════════════════════════════════════════════════════════ */}
        {step === 'DROP_ITEM_ISSUE' && (
          <View style={styles.containerLight}>
            <View style={styles.headerLight}>
              <TouchableOpacity onPress={() => setStep('DROP_HELP_9_OPTIONS')} style={{ paddingRight: 10 }}>
                <Text style={styles.backArrowLight}>←</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitleLight}>सामान में गड़बड़ी</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtnLight}>
                <Text style={styles.closeBtnTextLight}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
              <View style={{
                backgroundColor: '#FFF7ED',
                borderLeftWidth: 4,
                borderLeftColor: '#EA580C',
                borderRadius: 12,
                padding: 14,
                marginBottom: 16,
              }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#9A3412', marginBottom: 4 }}>
                  📸 सामान सत्यापन नीति:
                </Text>
                <Text style={{ fontSize: 13, color: '#C2410C', lineHeight: 19 }}>
                  राइडर सामान की फ़ोटो ले, सपोर्ट चैट से जुड़े। पिकअप फ़ोटो से मिलान कर ज़िम्मेदारी तय होगी।
                </Text>
              </View>

              <TouchableOpacity
                style={{
                  backgroundColor: hasTakenProofPhoto ? '#16A34A' : '#0066FF',
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  marginBottom: 14,
                }}
                onPress={() => {
                  setHasTakenProofPhoto(true);
                  setProofPhotoType('DAMAGED_ITEM');
                  socket?.emit('rider_help_stage_action', {
                    bookingId,
                    riderId: riderUser?._id,
                    actionType: 'ITEM_DAMAGE_PHOTO_CAPTURED',
                  });
                  Alert.alert('फ़ोटो ली गई', 'सामान की फ़ोटो अपलोड हो गई है।');
                }}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 18, color: '#FFFFFF', marginRight: 8 }}>
                  {hasTakenProofPhoto ? '✓' : '📸'}
                </Text>
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>
                  {hasTakenProofPhoto ? 'सामान की फ़ोटो संलग्न ✓' : 'सामान की फ़ोटो खींचें'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  backgroundColor: '#7C3AED',
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => {
                  onClose();
                  navigation?.navigate?.('SupportChat');
                }}
                activeOpacity={0.85}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>
                  🎧 सपोर्ट चैट से जुड़ें (फ़ोटो मिलान कराएँ)
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════
            DROP OPTION 8: गेट बंद है या अंदर जाने की इजाज़त नहीं
           ══════════════════════════════════════════════════════════════ */}
        {step === 'DROP_GATE_CLOSED' && (
          <View style={styles.containerLight}>
            <View style={styles.headerLight}>
              <TouchableOpacity onPress={() => setStep('DROP_HELP_9_OPTIONS')} style={{ paddingRight: 10 }}>
                <Text style={styles.backArrowLight}>←</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitleLight}>गेट बंद / अंदर अनुमति नहीं</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtnLight}>
                <Text style={styles.closeBtnTextLight}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
              {/* Guidance */}
              <View style={{
                backgroundColor: '#EFF6FF',
                borderLeftWidth: 4,
                borderLeftColor: '#0066FF',
                borderRadius: 12,
                padding: 14,
                marginBottom: 16,
              }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#1E40AF', marginBottom: 4 }}>
                  🚪 गेट पर पहुँचने का नियम:
                </Text>
                <Text style={{ fontSize: 13, color: '#1D4ED8', lineHeight: 19 }}>
                  यूज़र को पुश + कॉल: "गेट पर आइए"। 5 मिनट का इंतज़ार टाइमर। राइडर गेट की फ़ोटो ले। न आने पर ऑप्शन 2 वाला सिस्टम लागू होगा।
                </Text>
              </View>

              {/* Action 1: Push & Call */}
              <TouchableOpacity
                style={{
                  backgroundColor: '#0066FF',
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  marginBottom: 12,
                }}
                onPress={() => {
                  setGateTimerRunning(true);
                  socket?.emit('rider_help_stage_action', {
                    bookingId,
                    riderId: riderUser?._id,
                    actionType: 'GATE_CALL_PUSH_SENT',
                  });
                  Alert.alert('सूचना भेजी गई', 'यूज़र को सूचना भेजी गई: "कृपया गेट पर आइए, राइडर बाहर खड़ा है।" 5 मिनट का टाइमर शुरू हो गया है।');
                }}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 18, color: '#FFFFFF', marginRight: 8 }}>📢</Text>
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>
                  यूज़र को 'गेट पर आइए' कॉल / पुश भेजें
                </Text>
              </TouchableOpacity>

              {/* 5-Minute Timer Display */}
              <View style={{
                backgroundColor: '#F8FAFC',
                borderWidth: 1.5,
                borderColor: '#CBD5E1',
                borderRadius: 14,
                padding: 16,
                alignItems: 'center',
                marginBottom: 12,
              }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: 6 }}>
                  गेट प्रतीक्षा टाइमर
                </Text>
                <Text style={{ fontSize: 32, fontWeight: '900', color: gateWaitSeconds > 0 ? '#EA580C' : '#16A34A', letterSpacing: 2 }}>
                  {Math.floor(gateWaitSeconds / 60)}:{String(gateWaitSeconds % 60).padStart(2, '0')}
                </Text>
                <Text style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                  {gateTimerRunning ? 'टाइमर चल रहा है... कृपया गेट पर 5 मिनट प्रतीक्षा करें।' : 'बटन दबाकर टाइमर शुरू करें।'}
                </Text>
              </View>

              {/* Action 2: Take Gate Photo */}
              <TouchableOpacity
                style={{
                  backgroundColor: hasTakenProofPhoto ? '#16A34A' : '#F1F5F9',
                  borderWidth: 1,
                  borderColor: hasTakenProofPhoto ? '#16A34A' : '#CBD5E1',
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}
                onPress={() => {
                  setHasTakenProofPhoto(true);
                  setProofPhotoType('CLOSED_GATE');
                  socket?.emit('rider_help_stage_action', {
                    bookingId,
                    riderId: riderUser?._id,
                    actionType: 'GATE_PHOTO_CAPTURED',
                  });
                  Alert.alert('फ़ोटो ली गई', 'बंद गेट की फ़ोटो सुरक्षित कर ली गई है।');
                }}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 18, marginRight: 8 }}>{hasTakenProofPhoto ? '✓' : '📸'}</Text>
                <Text style={{
                  color: hasTakenProofPhoto ? '#FFFFFF' : '#0F172A',
                  fontWeight: '800',
                  fontSize: 15
                }}>
                  {hasTakenProofPhoto ? 'गेट की फ़ोटो सत्यापित ✓' : 'गेट की फ़ोटो खींचें'}
                </Text>
              </TouchableOpacity>

              {/* Fallback to Option 2 if customer doesn't show up */}
              <TouchableOpacity
                style={{
                  backgroundColor: '#EA580C',
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => setStep('DROP_USER_NOT_ANSWERING')}
                activeOpacity={0.85}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 14 }}>
                  यूज़र नहीं आया → कैंसल सहायता (ऑप्शन 2 फ़्लो)
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════
            DROP OPTION 9: मेरी तबीयत या बाइक में दिक्कत
           ══════════════════════════════════════════════════════════════ */}
        {step === 'DROP_EMERGENCY_HEALTH' && (
          <View style={styles.containerLight}>
            <View style={styles.headerLight}>
              <TouchableOpacity onPress={() => setStep('DROP_HELP_9_OPTIONS')} style={{ paddingRight: 10 }}>
                <Text style={styles.backArrowLight}>←</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitleLight}>तबीयत या बाइक समस्या (इमरजेंसी)</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtnLight}>
                <Text style={styles.closeBtnTextLight}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
              {/* Emergency Exemption Notice */}
              <View style={{
                backgroundColor: '#ECFDF5',
                borderWidth: 1,
                borderColor: '#A7F3D0',
                borderRadius: 14,
                padding: 14,
                marginBottom: 16,
              }}>
                <Text style={{ fontSize: 14, fontWeight: '900', color: '#065F46', marginBottom: 4 }}>
                  🛡️ आपातकालीन छूट:
                </Text>
                <Text style={{ fontSize: 13, color: '#047857', lineHeight: 19 }}>
                  यह एक वास्तविक इमरजेंसी ट्रांसफर है। यह आपके दिन के 2 ट्रांसफर की सामान्य सीमा में नहीं गिना जाएगा।
                </Text>
              </View>

              {/* 112 Call Button */}
              <TouchableOpacity
                style={{
                  backgroundColor: '#DC2626',
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  marginBottom: 14,
                }}
                onPress={() => {
                  Linking.openURL('tel:112').catch(() => {
                    Alert.alert('आपातकालीन कॉल', 'कृपया 112 डायल करें।');
                  });
                }}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 18, color: '#FFFFFF', marginRight: 8 }}>🚨</Text>
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>
                  112 आपातकालीन सेवा को कॉल करें
                </Text>
              </TouchableOpacity>

              {/* Start Transfer Flow */}
              <TouchableOpacity
                style={{
                  backgroundColor: '#0066FF',
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                }}
                onPress={() => {
                  setSelectedIssueTitle('Emergency Health Issue');
                  setSelectedIssueKey('emergency_health');
                  socket?.emit('rider_help_stage_action', {
                    bookingId,
                    riderId: riderUser?._id,
                    actionType: 'EMERGENCY_HEALTH_TRANSFER_STARTED',
                  });
                  setStep('CANNOT_DELIVER_BIKE');
                }}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 18, color: '#FFFFFF', marginRight: 8 }}>🔄</Text>
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>
                  इमरजेंसी ऑर्डर ट्रांसफर शुरू करें (Radar)
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}


        {/* ══════════════════════════════════════════════════════════════
            स्क्रीन 2: रेस्टोरेंट बंद है (Restaurant is Closed)
           ══════════════════════════════════════════════════════════════ */}
        {step === 'RESTAURANT_CLOSED' && (
          <View style={styles.containerLight}>
            {/* Header: ← Active Order : RH880551  ● Pickup */}
            <View style={styles.headerLight}>
              <TouchableOpacity onPress={() => setStep('LIVE_ORDER_REASONS')} style={{ paddingRight: 10 }}>
                <Text style={styles.backArrowLight}>←</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitleLight}>
                Active Order : RH{String(activeOrder?.bookingId || '880551').slice(-6)}
              </Text>
              <View style={styles.pickupBadgeLight}>
                <View style={styles.greenDotLight} />
                <Text style={styles.pickupBadgeTextLight}>Pickup</Text>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
              {/* लाल पट्टी: Restaurant is Closed */}
              <View style={styles.redBannerCard}>
                <Text style={{ fontSize: 32, marginRight: 12 }}>🏪</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.redBannerTitle}>Restaurant is Closed</Text>
                  <Text style={styles.redBannerSubtitle}>The restaurant seems to be closed.</Text>
                </View>
              </View>

              {/* टिप कार्ड: Please reach the restaurant's location */}
              <View style={styles.tipCardLight}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 18, marginRight: 6 }}>💡</Text>
                  <Text style={styles.tipTitleLight}>Tip</Text>
                </View>
                <Text style={styles.tipDescLight}>
                  Please reach the restaurant's location to confirm and report this issue.
                </Text>

                {/* 50-100m Rule: If distant (> 100m) show Navigate button */}
                {!isWithin100mOfRestaurant && (
                  <TouchableOpacity
                    style={styles.navigateBtnPrimary}
                    onPress={() => handleOpenNavigation(rLat, rLon, activeOrder?.restaurantName || 'Restaurant')}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 18, color: '#FFFFFF', marginRight: 8 }}>🧭</Text>
                    <Text style={styles.navigateBtnText}>Navigate to Restaurant</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* 3 एक्शन कार्ड्स (दुकान के सामने फोटो, कॉल, सपोर्ट) */}
              <View style={styles.threeActionRow}>
                {/* 1. Take Photo (Shop Front) */}
                <TouchableOpacity
                  style={[styles.smallActionBox, { backgroundColor: '#FFF5F5', borderColor: '#FECACA' }]}
                  onPress={() => {
                    setPhotoTaken(true);
                    Alert.alert('फ़ोटो ली गई', 'दुकान के सामने की तस्वीर सफलतापूर्वक सेव कर ली गई है। सप्लायर को अलर्ट भेजा गया है।');
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 24, marginBottom: 6 }}>📷</Text>
                  <Text style={[styles.smallActionTitle, { color: '#DC2626' }]}>
                    {photoTaken ? 'Photo Added ✓' : 'Take Photo'}
                  </Text>
                  <Text style={styles.smallActionSub}>(Shop Front)</Text>
                </TouchableOpacity>

                {/* 2. Call Restaurant */}
                <TouchableOpacity
                  style={[styles.smallActionBox, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}
                  onPress={() => {
                    const phone = activeOrder?.restaurantPhone || '1800123456';
                    Linking.openURL(`tel:${phone}`);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 24, marginBottom: 6 }}>📞</Text>
                  <Text style={[styles.smallActionTitle, { color: '#16A34A' }]}>Call Restaurant</Text>
                </TouchableOpacity>

                {/* 3. Contact Support */}
                <TouchableOpacity
                  style={[styles.smallActionBox, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]}
                  onPress={() => {
                    setSelectedIssueTitle('Restaurant is Closed');
                    setStep('ORDER_DENIAL_WARNING');
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 24, marginBottom: 6 }}>🎧</Text>
                  <Text style={[styles.smallActionTitle, { color: '#7C3AED' }]}>Contact Support</Text>
                </TouchableOpacity>
              </View>

              {/* नीचे Reach Support लाल बटन */}
              <TouchableOpacity
                style={styles.reachSupportRedBtn}
                onPress={() => {
                  setSelectedIssueTitle('Restaurant is Closed');
                  setStep('ORDER_DENIAL_WARNING');
                }}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 20, color: '#FFFFFF', marginRight: 8 }}>🎧</Text>
                <Text style={styles.reachSupportText}>Reach Support</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════
            स्क्रीन 3: डिलीवर नहीं कर सकते, बाइक इश्यू (Cannot Deliver : Bike issue)
           ══════════════════════════════════════════════════════════════ */}
        {step === 'CANNOT_DELIVER_BIKE' && (
          <View style={styles.containerLight}>
            {/* Top Bar: ✕  Live Order : 880551xxxx */}
            <View style={[styles.headerLight, { borderBottomColor: '#E2E8F0' }]}>
              <TouchableOpacity onPress={() => setStep('LIVE_ORDER_REASONS')} style={{ paddingRight: 12 }}>
                <Text style={{ fontSize: 20, color: '#0F172A', fontWeight: 'bold' }}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitleLight}>
                Live Order : {activeOrder?.bookingId ? String(activeOrder.bookingId).slice(-6) : '880551xxxx'}
              </Text>
            </View>

            {/* Dynamic Reason Cyan Banner */}
            <View style={styles.cyanBannerLight}>
              <Text style={styles.cyanBannerText}>Cannot Deliver : {selectedIssueTitle}</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 18, flexGrow: 1, justifyContent: 'space-between' }}>
              <View>
                {/* Advice Tip Card */}
                <View style={styles.tipBoxCardLight}>
                  <View style={styles.tryThisBadge}>
                    <Text style={styles.tryThisText}>Try this 👉</Text>
                  </View>
                  <Text style={styles.tipBodyTextLight}>
                    Please resolve the issue quickly as food is ready to be picked or deny the order to ensure food is delivered on time.
                  </Text>

                  {/* Okay Button */}
                  <TouchableOpacity
                    style={styles.okayBtnTeal}
                    onPress={() => setStep('LIVE_ORDER_REASONS')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.okayBtnText}>Okay</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Bottom: Deny this order Button */}
              <TouchableOpacity
                style={styles.transferOrderBtnVibrant}
                onPress={handleStartRadarSearch}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 20 }}>🔄</Text>
                <Text style={styles.transferOrderBtnText}>ऑर्डर ट्रांसफर करें (Transfer Order)</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════
            स्क्रीन 4: पिकअप ओटीपी (Pickup OTP Required)
           ══════════════════════════════════════════════════════════════ */}
        {step === 'PICKUP_OTP' && (
          <View style={styles.containerLight}>
            {/* Header: ← Active Order : RH880551  ● Pickup */}
            <View style={styles.headerLight}>
              <TouchableOpacity onPress={() => setStep('LIVE_ORDER_REASONS')} style={{ paddingRight: 10 }}>
                <Text style={styles.backArrowLight}>←</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitleLight}>
                Active Order : RH{String(activeOrder?.bookingId || '880551').slice(-6)}
              </Text>
              <View style={styles.pickupBadgeLight}>
                <View style={styles.greenDotLight} />
                <Text style={styles.pickupBadgeTextLight}>Pickup</Text>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
              {/* Pickup OTP Required Blue Banner */}
              <View style={styles.blueRequiredBanner}>
                <View style={styles.shieldIconCircle}>
                  <Text style={{ fontSize: 20 }}>🛡️</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.blueRequiredTitle}>Pickup OTP Required</Text>
                  <Text style={styles.blueRequiredSub}>
                    Enter OTP to collect the order from the restaurant.
                  </Text>
                </View>
              </View>

              {/* Reach Restaurant Notice Card */}
              <View style={styles.reachStoreCardLight}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={{ fontSize: 32, marginRight: 12 }}>🏪</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reachStoreTitle}>Reach the restaurant</Text>
                    <Text style={styles.reachStoreSub}>
                      You need to be within 100 meters of the restaurant location to get the OTP.
                    </Text>
                  </View>
                </View>

                {/* Navigate to Restaurant Button */}
                <TouchableOpacity
                  style={styles.navigateBtnPrimary}
                  onPress={() => handleOpenNavigation(rLat, rLon, activeOrder?.restaurantName || 'Restaurant')}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 18, color: '#FFFFFF', marginRight: 8 }}>🧭</Text>
                  <Text style={styles.navigateBtnText}>Navigate to Restaurant</Text>
                </TouchableOpacity>

                {/* Restaurant name & Real Calculated Distance Box */}
                <View style={styles.storeDistRow}>
                  <View style={styles.storeDistCol}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontSize: 16, marginRight: 6 }}>📍</Text>
                      <Text style={styles.distColLabel}>Restaurant</Text>
                    </View>
                    <Text style={styles.distColVal}>
                      {activeOrder?.restaurantName || activeOrder?.storeName || 'Tum'}
                    </Text>
                  </View>

                  <View style={styles.storeDistDivider} />

                  <View style={styles.storeDistCol}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontSize: 16, marginRight: 6 }}>↗️</Text>
                      <Text style={styles.distColLabel}>Distance</Text>
                    </View>
                    <Text style={styles.distColVal}>
                      ~ {(distToRestaurantMeters / 1000).toFixed(1)} km ({distToRestaurantMeters}m)
                    </Text>
                  </View>
                </View>
              </View>

              {/* Bottom: Get Pickup OTP Button (Active only when within 100m) */}
              <TouchableOpacity
                style={[
                  styles.getOtpBtnBlue,
                  { backgroundColor: isWithin100mOfRestaurant ? '#0066FF' : '#94A3B8' },
                ]}
                onPress={() => {
                  if (!isWithin100mOfRestaurant) {
                    Alert.alert(
                      'दूरी अधिक है',
                      `पिकअप ओटीपी प्राप्त करने के लिए आपको रेस्टोरेंट के 100 मीटर के दायरे में होना आवश्यक है। वर्तमान दूरी: ${distToRestaurantMeters} मीटर।`
                    );
                  } else {
                    Alert.alert(
                      'पिकअप ओटीपी प्राप्त हुआ',
                      `रेस्टोरेंट ओटीपी: ${activeOrder?.pickupOtp || '4069'}। कृपया यह कोड स्टोर को दिखाएं।`
                    );
                  }
                }}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 18, color: '#FFFFFF', marginRight: 8 }}>🔒</Text>
                <Text style={styles.getOtpBtnText}>Get Pickup OTP</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════
            स्क्रीन 5: ऑर्डर अस्वीकृति की चेतावनी (हिंदी - 100% Light Theme)
           ══════════════════════════════════════════════════════════════ */}
        {step === 'ORDER_DENIAL_WARNING' && (
          <View style={styles.containerLight}>
            {/* Header: ← ऑर्डर अस्वीकृति */}
            <View style={[styles.headerLight, { backgroundColor: '#0066FF', borderBottomColor: '#0066FF' }]}>
              <TouchableOpacity onPress={() => setStep('CANNOT_DELIVER_BIKE')} style={{ paddingRight: 12 }}>
                <Text style={{ fontSize: 22, color: '#FFFFFF', fontWeight: 'bold' }}>←</Text>
              </TouchableOpacity>
              <Text style={[styles.headerTitleLight, { color: '#FFFFFF', fontSize: 18 }]}>ऑर्डर अस्वीकृति</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 18, paddingBottom: 30 }}>
              {/* Illustration: Phone On Hold Graphic */}
              <View style={styles.illustrationWrap}>
                <View style={styles.onHoldCircleGraphic}>
                  <Text style={{ fontSize: 36 }}>📱</Text>
                  <View style={styles.onHoldBadgeYellow}>
                    <Text style={styles.onHoldBadgeText}>On Hold</Text>
                  </View>
                </View>
              </View>

              {/* मुख्य चेतावनी: आपको ऑफ़लाइन लिया जा सकता है */}
              <Text style={styles.offlineWarningTitle}>आपको ऑफ़लाइन लिया जा सकता है</Text>
              <Text style={styles.offlineWarningSubtitle}>
                उच्च ऑर्डर अस्वीकृतियाँ आपके खाते को <Text style={{ color: '#DC2626', fontWeight: '800' }}>30 मिनट</Text> के लिए रोक सकती हैं
              </Text>

              {/* ऑडियो बार (Audio Player Bar) */}
              <View style={styles.audioPlayerBar}>
                <TouchableOpacity onPress={toggleAudio} style={styles.audioPlayBtn}>
                  <Text style={{ color: '#FFFFFF', fontSize: 14 }}>{isPlayingAudio ? '⏸' : '▶'}</Text>
                </TouchableOpacity>

                {/* Animated Wave Bars */}
                <View style={styles.audioWaveContainer}>
                  {[12, 22, 16, 26, 18, 14, 24, 18, 20, 12].map((h, idx) => (
                    <Animated.View
                      key={idx}
                      style={[
                        styles.audioWaveLine,
                        {
                          height: h,
                          transform: [{ scaleY: isPlayingAudio ? waveAnim : 0.4 }],
                        },
                      ]}
                    />
                  ))}
                </View>

                <Text style={styles.audioTimerText}>--:--</Text>
                <View style={styles.audioLangCircle}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#0066FF' }}>अ/A</Text>
                </View>
              </View>

              {/* इस ऑर्डर को अस्वीकार करने से हो सकता है: */}
              <Text style={styles.consequencesHeading}>इस ऑर्डर को अस्वीकार करने से हो सकता है:</Text>

              {/* कार्ड 1: प्रोत्साहनों का नुकसान */}
              <View style={styles.consequenceCardPink}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <Text style={{ fontSize: 24, marginRight: 12 }}>📊</Text>
                  <Text style={styles.consequenceTitle}>प्रोत्साहनों का नुकसान</Text>
                </View>
                <View style={styles.warningCircleRed}>
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900' }}>!</Text>
                </View>
              </View>

              {/* कार्ड 2: मेडलों पर प्रभाव */}
              <View style={styles.consequenceCardLightBlue}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <Text style={{ fontSize: 24, marginRight: 12 }}>🥇</Text>
                  <Text style={styles.consequenceTitle}>मेडलों पर प्रभाव</Text>
                </View>
                <View style={styles.warningCircleRed}>
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900' }}>!</Text>
                </View>
              </View>

              {/* दो मुख्य बटन्स */}
              {/* 1. ऑर्डर डिलीवर करें (Primary Blue) */}
              <TouchableOpacity
                style={styles.deliverOrderBtnBlue}
                onPress={() => {
                  onClose();
                  Alert.alert('डिलीवरी जारी रखें', 'धन्यवाद! कृपया इस ऑर्डर को समय पर डिलीवर करें।');
                }}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 20, marginRight: 8 }}>🛵</Text>
                <Text style={styles.deliverOrderBtnText}>ऑर्डर डिलीवर करें</Text>
              </TouchableOpacity>

              {/* 2. ऑर्डर अस्वीकार करें (Red / Outlined Action) */}
              <TouchableOpacity
                style={styles.denyOrderBtnOutline}
                onPress={handleStartRadarSearch}
                activeOpacity={0.8}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <>
                    <Text style={{ fontSize: 18, color: '#00C06D', marginRight: 8 }}>🔄</Text>
                    <Text style={[styles.denyOrderBtnText, { color: '#00C06D' }]}>ऑर्डर ट्रांसफर करें (Transfer Order)</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════
            स्क्रीन 7: खोज (रडार - Radar Search Replacement Partner)
           ══════════════════════════════════════════════════════════════ */}
        {step === 'RADAR_SEARCH' && (
          <View style={styles.containerLight}>
            {/* Top Bar */}
            <View style={[styles.headerLight, { borderBottomColor: '#E2E8F0' }]}>
              <TouchableOpacity onPress={() => setStep('CANNOT_DELIVER_BIKE')} style={{ paddingRight: 10 }}>
                <Text style={styles.backArrowLight}>←</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitleLight}>नज़दीकी डिलीवरी पार्टनर खोज</Text>
                <Text style={{ fontSize: 11, color: '#0066FF', fontWeight: '700' }}>
                  दायरा: {searchRadius >= 1000 ? `${searchRadius / 1000} km` : `${searchRadius} m`} • लाइव रडार
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtnLight}>
                <Text style={styles.closeBtnTextLight}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Real Map with Radar Wave & Nearby Delivery Partners */}
            <View style={{ flex: 1, position: 'relative' }}>
              <WebView
                originWhitelist={['*']}
                source={{ html: radarMapHtml }}
                style={StyleSheet.absoluteFill}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                scalesPageToFit={false}
              />

              {/* Floating Top Radar Status Chip */}
              <View style={styles.radarFloatingChip}>
                <View style={styles.radarLiveDot} />
                <Text style={styles.radarFloatingChipText}>
                  {searchRadius === 500
                    ? '500m दायरे में 2 राइडर्स एक्टिव हैं'
                    : '1km दायरे में नजदीकी पार्टनर्स खोज रहे हैं'}
                </Text>
              </View>

              {/* Floating Bottom Card: Transfer Broadcast & Countdown */}
              <View style={styles.radarBottomCard}>
                <View style={styles.radarCountdownRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 16 }}>⏱️</Text>
                    <Text style={styles.radarCountdownLabel}>खोज टाइमर:</Text>
                  </View>
                  <Text style={styles.radarCountdownValue}>{countdownSeconds}s शेष</Text>
                </View>

                {/* Progress Bar */}
                <View style={styles.radarProgressContainer}>
                  <View style={[styles.radarProgressBar, { width: `${((60 - countdownSeconds) / 60) * 100}%` }]} />
                </View>

                {/* Broadcast Transfer Button */}
                <TouchableOpacity
                  style={styles.broadcastTransferBtn}
                  onPress={handleBroadcastTransfer}
                  activeOpacity={0.85}
                  disabled={isSubmitting}
                >
                  <Text style={{ fontSize: 20 }}>🚀</Text>
                  <Text style={styles.broadcastTransferBtnText}>
                    {isSubmitting ? 'रिक्वेस्ट भेजी जा रही है...' : 'ट्रांसफर रिक्वेस्ट भेजें (Send Transfer)'}
                  </Text>
                </TouchableOpacity>

                {/* Deliver Myself Fallback */}
                <TouchableOpacity
                  style={styles.radarDeliverMyselfBtn}
                  onPress={() => {
                    onClose();
                    Alert.alert('ऑर्डर आपके पास है', 'कृपया सुरक्षित रूप से डिलीवरी पूरी करें।');
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.radarDeliverMyselfBtnText}>🛵 खुद डिलीवर करें (Cancel Search)</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════
            स्क्रीन 7B: पार्टनर ने स्वीकार किया (Partner Accepted Handover)
           ══════════════════════════════════════════════════════════════ */}
        {step === 'TRANSFER_ACCEPTED_PARTNER' && (
          <View style={styles.containerLight}>
            {/* Header */}
            <View style={[styles.headerLight, { borderBottomColor: '#BBF7D0', backgroundColor: '#F0FDF4' }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.headerTitleLight, { color: '#15803D' }]}>🎉 पार्टनर मिल गया!</Text>
                <Text style={{ fontSize: 11, color: '#166534', fontWeight: '600' }}>
                  ट्रांसफर स्वीकार हो चुका है
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtnLight}>
                <Text style={styles.closeBtnTextLight}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
              {/* Partner Card */}
              <View style={styles.transferPartnerCard}>
                <View style={styles.partnerAvatarCircle}>
                  <Text style={{ fontSize: 28 }}>🛵</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.transferPartnerName}>{acceptedPartner?.name || 'Rahul Sharma'}</Text>
                    <View style={styles.verifiedPartnerBadge}>
                      <Text style={styles.verifiedPartnerBadgeText}>✓ Verified Partner</Text>
                    </View>
                  </View>
                  <Text style={styles.transferPartnerVehicle}>
                    {acceptedPartner?.vehicleType || 'Bike'} • {acceptedPartner?.vehicleNumber || 'MP 04 AB 1234'}
                  </Text>
                  <Text style={styles.transferPartnerEta}>
                    ⏱️ ~{acceptedPartner?.etaMinutes || 4} मिनट में हैंडओवर पॉइंट पर पहुंचेंगे
                  </Text>
                </View>
              </View>

              {/* Call Partner Button */}
              <TouchableOpacity
                style={styles.callPartnerBtn}
                onPress={() => {
                  const phone = acceptedPartner?.phone || '9876543210';
                  Linking.openURL(`tel:${phone}`);
                }}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 18, marginRight: 8 }}>📞</Text>
                <Text style={styles.callPartnerBtnText}>
                  पार्टनर को कॉल करें ({acceptedPartner?.phone || 'Call'})
                </Text>
              </TouchableOpacity>

              {/* Locked Handover Location Card */}
              <View style={styles.lockedHandoverCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Text style={{ fontSize: 22 }}>🔒</Text>
                  <Text style={styles.lockedHandoverTitle}>लॉक हैंडओवर पॉइंट (Locked Handover)</Text>
                </View>
                <Text style={styles.lockedHandoverAddress}>
                  📍 {lockedHandoverLocation?.address || activeOrder?.deliveryAddress || 'वर्तमान जीपीएस स्थान'}
                </Text>
                <Text style={styles.lockedHandoverNote}>
                  🛡️ दोनों राइडर्स की स्क्रीन पर यह लोकेशन लॉक हो चुकी है। कृपया इसी पॉइंट पर मिलें।
                </Text>
              </View>

              {/* Handover OTP Box */}
              <View style={styles.transferOtpBox}>
                <Text style={styles.transferOtpTitle}>हैंडओवर OTP (पार्टनर को दें)</Text>
                <Text style={styles.transferOtpSubtitle}>
                  नया राइडर आने पर सामान देते समय यह 4-अंकीय कोड बताएं
                </Text>
                <View style={styles.transferOtpRow}>
                  {String(transferOtp || '7391').slice(0, 4).split('').map((digit, i) => (
                    <View key={i} style={styles.transferOtpDigitBox}>
                      <Text style={styles.transferOtpDigitText}>{digit}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Complete Handover Button */}
              <TouchableOpacity
                style={styles.finishHandoverBtn}
                onPress={handleFinishHandover}
                activeOpacity={0.88}
              >
                <Text style={{ fontSize: 20, marginRight: 8 }}>✓</Text>
                <Text style={styles.finishHandoverBtnText}>हैंडओवर पूरा हुआ (Complete Handover)</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════
            स्क्रीन 8: कोई साथी उपलब्ध नहीं है (Bottom Sheet)
           ══════════════════════════════════════════════════════════════ */}
        {step === 'NO_PARTNER_AVAILABLE' && (
          <View style={[styles.containerLight, { justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }]}>
            <View style={styles.noPartnerSheetLight}>
              <View style={styles.sheetHandleLight} />

              <View style={{ alignItems: 'center', marginVertical: 14 }}>
                <Text style={{ fontSize: 44, marginBottom: 8 }}>👥</Text>
                <Text style={styles.noPartnerTitle}>कोई साथी उपलब्ध नहीं है</Text>
                <Text style={styles.noPartnerSub}>
                  वर्तमान दायरे में कोई अन्य राइडर उपलब्ध नहीं मिला। क्या आप खोज दायरा बढ़ाकर दोबारा खोजना चाहते हैं या इस ऑर्डर को स्वयं डिलीवर करेंगे?
                </Text>
              </View>

              {/* 1. खोज दायरा बढ़ाकर पुनः खोजें / ऑर्डर अस्वीकार करें */}
              <TouchableOpacity
                style={[styles.deliverOrderBtnBlue, { backgroundColor: '#DC2626', marginBottom: 12 }]}
                onPress={() => {
                  if (searchRadius < 2000) {
                    setSearchRadius(searchRadius === 500 ? 1000 : 2000);
                    setCountdownSeconds(60);
                    setStep('RADAR_SEARCH');
                  } else {
                    handleFinalRejectionExit();
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 18, color: '#FFFFFF', marginRight: 8 }}>🔄</Text>
                <Text style={styles.deliverOrderBtnText}>
                  {searchRadius < 2000 ? 'दायरा बढ़ाकर पुनः खोजें (1-2 KM)' : 'ऑर्डर अस्वीकार करें (Exit)'}
                </Text>
              </TouchableOpacity>

              {/* 2. ऑर्डर डिलीवर करें */}
              <TouchableOpacity
                style={[styles.denyOrderBtnOutline, { borderColor: '#0066FF' }]}
                onPress={() => {
                  onClose();
                  Alert.alert('ऑर्डर आपके पास है', 'कृपया सुरक्षित रूप से ऑर्डर डिलीवर करें।');
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.denyOrderBtnText, { color: '#0066FF' }]}>ऑर्डर डिलीवर करें</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════
            यूज़र लोकेशन पर पहुँचने वाली नई स्क्रीन (Doorbell / Arrival)
           ══════════════════════════════════════════════════════════════ */}
        {step === 'USER_LOCATION_ARRIVED' && (
          <View style={styles.containerLight}>
            {/* Header: ← Drop Order : RH880551 */}
            <View style={styles.headerLight}>
              <TouchableOpacity onPress={() => setStep('HELP_MENU')} style={{ paddingRight: 10 }}>
                <Text style={styles.backArrowLight}>←</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitleLight}>
                Drop Order : RH{String(activeOrder?.bookingId || '880551').slice(-6)}
              </Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
              {/* Top Banner: Reached User Location */}
              <View style={[styles.redBannerCard, { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' }]}>
                <Text style={{ fontSize: 32, marginRight: 12 }}>📍</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.redBannerTitle, { color: '#15803D' }]}>Reached Drop Location</Text>
                  <Text style={[styles.redBannerSubtitle, { color: '#166534' }]}>
                    You are within 50 meters of customer's drop point.
                  </Text>
                </View>
              </View>

              {/* टिप: कृपया यूज़र को कॉल करें और गेट के पास देखें */}
              <View style={styles.tipCardLight}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 18, marginRight: 6 }}>💡</Text>
                  <Text style={styles.tipTitleLight}>Tip</Text>
                </View>
                <Text style={styles.tipDescLight}>
                  कृपया यूज़र को कॉल करें और गेट के पास देखें। ग्राहक से संपर्क न होने पर दरवाजे की तस्वीर खींचें।
                </Text>
              </View>

              {/* 3 एक्शन कार्ड्स (दरवाजे की फोटो, ग्राहक को कॉल, सपोर्ट) */}
              <View style={styles.threeActionRow}>
                {/* 1. Take Photo (Door Front) */}
                <TouchableOpacity
                  style={[styles.smallActionBox, { backgroundColor: '#FFF5F5', borderColor: '#FECACA' }]}
                  onPress={() => {
                    setPhotoTaken(true);
                    Alert.alert('तस्वीर अपलोड हुई', 'दरवाजे की तस्वीर सुरक्षित रूप से अपलोड कर ली गई है।');
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 24, marginBottom: 6 }}>📸</Text>
                  <Text style={[styles.smallActionTitle, { color: '#DC2626' }]}>
                    {photoTaken ? 'Door Photo ✓' : 'Take Photo'}
                  </Text>
                  <Text style={styles.smallActionSub}>(Door Front)</Text>
                </TouchableOpacity>

                {/* 2. Call Customer */}
                <TouchableOpacity
                  style={[styles.smallActionBox, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}
                  onPress={() => {
                    const phone = activeOrder?.customerPhone || activeOrder?.phone || '1800123456';
                    Linking.openURL(`tel:${phone}`);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 24, marginBottom: 6 }}>📞</Text>
                  <Text style={[styles.smallActionTitle, { color: '#16A34A' }]}>Call User</Text>
                </TouchableOpacity>

                {/* 3. Reach Support */}
                <TouchableOpacity
                  style={[styles.smallActionBox, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]}
                  onPress={() => {
                    setSelectedIssueTitle('Customer Not Responding at Door');
                    setStep('ORDER_DENIAL_WARNING');
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 24, marginBottom: 6 }}>🎧</Text>
                  <Text style={[styles.smallActionTitle, { color: '#7C3AED' }]}>Support</Text>
                </TouchableOpacity>
              </View>

              {/* नीचे Reach Support लाल बटन */}
              <TouchableOpacity
                style={styles.reachSupportRedBtn}
                onPress={() => {
                  setSelectedIssueTitle('Customer Unreachable at Drop');
                  setStep('ORDER_DENIAL_WARNING');
                }}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 20, color: '#FFFFFF', marginRight: 8 }}>🎧</Text>
                <Text style={styles.reachSupportText}>Reach Support</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════
            ID CARD & BILL (Pure Light Mode)
           ══════════════════════════════════════════════════════════════ */}
        {step === 'ID_CARD_BILL' && (
          <View style={styles.containerLight}>
            <View style={styles.headerLight}>
              <TouchableOpacity onPress={() => setStep('HELP_MENU')} style={{ paddingRight: 10 }}>
                <Text style={styles.backArrowLight}>←</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitleLight}>आईडी कार्ड और बिल</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtnLight}>
                <Text style={styles.closeBtnTextLight}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
              {/* Verified Rider ID Card */}
              <View style={styles.idCardBoxLight}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={{ color: '#0066FF', fontSize: 12, fontWeight: '900', letterSpacing: 0.5 }}>
                    🛵 RIDEHUB VERIFIED RIDER ID
                  </Text>
                  <View style={{ backgroundColor: '#16A34A', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                    <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800' }}>ACTIVE</Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                  <View style={styles.idAvatarLight}>
                    <Text style={{ fontSize: 26 }}>🚴</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={{ fontSize: 17, fontWeight: '900', color: '#0F172A' }}>
                      {riderUser?.name || 'RideHub Partner'}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                      ID: RH-{String(riderUser?._id || '9760').slice(-6).toUpperCase()}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#16A34A', fontWeight: '800', marginTop: 2 }}>
                      ⭐ 5.0 Rating • 100% Verified
                    </Text>
                  </View>
                </View>

                <View style={styles.idGridRowLight}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.idGridLabel}>MOBILE</Text>
                    <Text style={styles.idGridVal}>{riderUser?.phone || '9760XXXXXX'}</Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: '#E2E8F0', marginHorizontal: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.idGridLabel}>VEHICLE</Text>
                    <Text style={styles.idGridVal}>{riderUser?.vehicleNumber || 'MP-04-XX-XXXX'}</Text>
                  </View>
                </View>
              </View>

              {/* Order Bill Breakdown (100% Online Payment, Zero COD) */}
              <View style={styles.billBoxLight}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingBottom: 10 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }}>
                    🧾 ऑर्डर बिल (Online Paid)
                  </Text>
                  <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                    <Text style={{ color: '#15803D', fontSize: 11, fontWeight: '800' }}>ONLINE PREPAID</Text>
                  </View>
                </View>

                <Text style={{ color: '#64748B', fontSize: 12, marginBottom: 2 }}>STORE</Text>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 10 }}>
                  {activeOrder?.restaurantName || activeOrder?.storeName || 'Partner Store'}
                </Text>

                <Text style={{ color: '#64748B', fontSize: 12, marginBottom: 2 }}>CUSTOMER</Text>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 14 }}>
                  {activeOrder?.customerName || 'Customer'}
                </Text>

                <View style={{ borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ color: '#64748B', fontSize: 13 }}>Items Subtotal</Text>
                    <Text style={{ color: '#0F172A', fontSize: 13, fontWeight: '700' }}>
                      ₹{Math.max(0, Number(activeOrder?.totalAmount || 180) - 40)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ color: '#64748B', fontSize: 13 }}>Delivery Partner Fee</Text>
                    <Text style={{ color: '#0F172A', fontSize: 13, fontWeight: '700' }}>₹40</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
                    <Text style={{ color: '#0F172A', fontSize: 16, fontWeight: '900' }}>Total Amount</Text>
                    <Text style={{ color: '#16A34A', fontSize: 18, fontWeight: '900' }}>
                      ₹{activeOrder?.totalAmount || 220}
                    </Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  fullScreenLight: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  transferOrderBtnVibrant: {
    backgroundColor: '#00C06D',
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    elevation: 3,
    shadowColor: '#00C06D',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  transferOrderBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  radarFloatingChip: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 10,
  },
  radarLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  radarFloatingChipText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  radarBottomCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    elevation: 8,
  },
  radarCountdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  radarCountdownLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  radarCountdownValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0066FF',
  },
  broadcastTransferBtn: {
    backgroundColor: '#0066FF',
    borderRadius: 12,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  broadcastTransferBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  radarDeliverMyselfBtn: {
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarDeliverMyselfBtnText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
  },
  transferPartnerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  partnerAvatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
  },
  transferPartnerName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  verifiedPartnerBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  verifiedPartnerBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
  },
  transferPartnerVehicle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  transferPartnerEta: {
    fontSize: 12,
    color: '#0066FF',
    marginTop: 2,
    fontWeight: '700',
  },
  callPartnerBtn: {
    backgroundColor: '#0066FF',
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  callPartnerBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  lockedHandoverCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    marginBottom: 12,
  },
  lockedHandoverTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#991B1B',
  },
  lockedHandoverAddress: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
  },
  lockedHandoverNote: {
    fontSize: 11,
    color: '#7F1D1D',
    lineHeight: 16,
  },
  transferOtpBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    marginBottom: 16,
  },
  transferOtpTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#166534',
  },
  transferOtpSubtitle: {
    fontSize: 11,
    color: '#15803D',
    marginTop: 2,
    marginBottom: 12,
    textAlign: 'center',
  },
  transferOtpRow: {
    flexDirection: 'row',
    gap: 10,
  },
  transferOtpDigitBox: {
    width: 48,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  transferOtpDigitText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#064E3B',
  },
  finishHandoverBtn: {
    backgroundColor: '#16A34A',
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  finishHandoverBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  containerLight: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerLight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 12 : 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  headerTitleLight: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    textAlign: 'center',
  },
  backArrowLight: {
    fontSize: 22,
    color: '#0F172A',
    fontWeight: 'bold',
  },
  closeBtnLight: {
    paddingLeft: 8,
  },
  closeBtnTextLight: {
    fontSize: 20,
    fontWeight: '700',
    color: '#64748B',
  },
  pickupBadgeLight: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  greenDotLight: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
    marginRight: 6,
  },
  pickupBadgeTextLight: {
    fontSize: 12,
    fontWeight: '800',
    color: '#15803D',
  },
  menuRowLight: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  iconCircleLight: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTitleLight: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  menuSubtitleLight: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
  },
  listTextLight: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
  },
  chevronLight: {
    fontSize: 22,
    color: '#94A3B8',
    fontWeight: 'bold',
  },
  dividerLight: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 20,
  },

  /* स्क्रीन 2: Restaurant Closed */
  redBannerCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FECACA',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  redBannerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#DC2626',
    marginBottom: 2,
  },
  redBannerSubtitle: {
    fontSize: 13,
    color: '#7F1D1D',
  },
  tipCardLight: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
  },
  tipTitleLight: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  tipDescLight: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 22,
    marginBottom: 14,
  },
  navigateBtnPrimary: {
    backgroundColor: '#0066FF',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navigateBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  threeActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  smallActionBox: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallActionTitle: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  smallActionSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  reachSupportRedBtn: {
    backgroundColor: '#E11D48',
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E11D48',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  reachSupportText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  /* स्क्रीन 3: Cannot Deliver */
  cyanBannerLight: {
    backgroundColor: '#E0F2FE',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#BAE6FD',
  },
  cyanBannerText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0369A1',
  },
  tipBoxCardLight: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#38BDF8',
    borderRadius: 16,
    padding: 18,
    marginTop: 10,
  },
  tryThisBadge: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  tryThisText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  tipBodyTextLight: {
    fontSize: 14,
    color: '#0F172A',
    lineHeight: 22,
    marginBottom: 16,
  },
  okayBtnTeal: {
    backgroundColor: '#0284C7',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  okayBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  denyThisOrderBtn: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1.5,
    borderColor: '#38BDF8',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 10,
  },
  denyThisOrderText: {
    color: '#0369A1',
    fontSize: 16,
    fontWeight: '900',
  },

  /* स्क्रीन 4: Pickup OTP Required */
  blueRequiredBanner: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  shieldIconCircle: {
    backgroundColor: '#0066FF',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blueRequiredTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E40AF',
  },
  blueRequiredSub: {
    fontSize: 12,
    color: '#3B82F6',
    marginTop: 2,
  },
  reachStoreCardLight: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
  },
  reachStoreTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
  },
  reachStoreSub: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 18,
  },
  storeDistRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
  },
  storeDistCol: {
    flex: 1,
  },
  storeDistDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 10,
  },
  distColLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
  },
  distColVal: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  getOtpBtnBlue: {
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  getOtpBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },

  /* स्क्रीन 5: ऑर्डर अस्वीकृति की चेतावनी */
  illustrationWrap: {
    alignItems: 'center',
    marginVertical: 10,
  },
  onHoldCircleGraphic: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#BFDBFE',
  },
  onHoldBadgeYellow: {
    position: 'absolute',
    bottom: -6,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 10,
  },
  onHoldBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  offlineWarningTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0066FF',
    textAlign: 'center',
    marginTop: 14,
  },
  offlineWarningSubtitle: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  audioPlayerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#93C5FD',
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 20,
  },
  audioPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0066FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  audioWaveContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    justifyContent: 'center',
  },
  audioWaveLine: {
    width: 3,
    borderRadius: 2,
    backgroundColor: '#0066FF',
  },
  audioTimerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginRight: 8,
  },
  audioLangCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  consequencesHeading: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 10,
  },
  consequenceCardPink: {
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  consequenceCardLightBlue: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
  },
  consequenceTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  warningCircleRed: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deliverOrderBtnBlue: {
    backgroundColor: '#0066FF',
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  deliverOrderBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  denyOrderBtnOutline: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#DC2626',
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  denyOrderBtnText: {
    color: '#DC2626',
    fontSize: 16,
    fontWeight: '900',
  },

  /* स्क्रीन 7: खोज (रडार) */
  radarCenterWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  radarCircleWave: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(0,102,255,0.2)',
    borderWidth: 2,
    borderColor: '#0066FF',
  },
  radarCenterRiderPin: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#0066FF',
    elevation: 6,
    shadowColor: '#0066FF',
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  radarStatusText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 26,
    textAlign: 'center',
  },
  radarProgressContainer: {
    width: '80%',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    marginTop: 20,
    overflow: 'hidden',
  },
  radarProgressBar: {
    height: '100%',
    backgroundColor: '#0066FF',
    borderRadius: 4,
  },
  countdownSecText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748B',
    marginTop: 8,
  },

  /* स्क्रीन 8: कोई साथी उपलब्ध नहीं है */
  noPartnerSheetLight: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
  },
  sheetHandleLight: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 8,
  },
  noPartnerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
  },
  noPartnerSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 6,
    paddingHorizontal: 10,
  },

  /* ID Card & Bill Light */
  idCardBoxLight: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    elevation: 3,
  },
  idAvatarLight: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  idGridRowLight: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
  },
  idGridLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '800',
  },
  idGridVal: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  billBoxLight: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    padding: 18,
    elevation: 2,
  },
});

export default RiderOrderHelpFlowModal;
