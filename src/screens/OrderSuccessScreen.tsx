import React, { useEffect, useState, useContext, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  BackHandler,
  Animated,
  Easing,
  Dimensions,
  Image,
  Platform,
} from 'react-native';
import { AuthContext } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';
import { resolveCategoryName } from '../utils/categoryHelper';

const { width, height } = Dimensions.get('window');

interface OrderSuccessScreenProps {
  route: any;
  navigation: any;
}

export const OrderSuccessScreen: React.FC<OrderSuccessScreenProps> = ({ route, navigation }) => {
  const { user } = useContext(AuthContext);
  const { socket } = useSocket();

  const {
    bookingId: passedBookingId,
    rideId: passedRideId,
    order: initialOrder = {},
    amount: passedAmount,
    total: passedTotal,
    price: passedPrice,
    storeName: passedStoreName,
    restaurantName: passedRestoName,
    paymentMethod: passedPaymentMethod = 'cod',
    categoryName: passedCategory = 'Order',
    status: initialStatus = 'PENDING_RESTAURANT',
  } = route.params || {};

  const bookingId =
    passedBookingId ||
    passedRideId ||
    initialOrder?.bookingId ||
    initialOrder?.rideId ||
    initialOrder?._id ||
    '';

  const [order, setOrder] = useState<any>(initialOrder);
  const [currentStatus, setCurrentStatus] = useState<string>(
    initialOrder?.status || initialStatus || 'PENDING_RESTAURANT'
  );

  const amount = Number(
    passedAmount ||
    passedTotal ||
    passedPrice ||
    order?.price ||
    order?.totalAmount ||
    order?.subtotal ||
    21
  );

  const storeName =
    passedStoreName ||
    passedRestoName ||
    order?.restaurantName ||
    order?.name ||
    'Kk';

  const categoryName = resolveCategoryName(order || { categoryName: passedCategory });

  // Format short 6-digit Order ID (e.g. #025745)
  const displayOrderId = (() => {
    if (!bookingId) return '#025745';
    const clean = String(bookingId).replace(/[^0-9a-zA-Z]/g, '');
    return `#${clean.slice(-6)}`;
  })();

  // Animations
  const bagBounceAnim = useRef(new Animated.Value(0)).current;
  const contentFadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(bagBounceAnim, {
        toValue: 1,
        tension: 40,
        friction: 6,
        useNativeDriver: true,
      }),
      Animated.timing(contentFadeAnim, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();

    // Subtle pulsing animation on tracking indicator
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.25,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();

    return () => pulseLoop.stop();
  }, [bagBounceAnim, contentFadeAnim, pulseAnim]);

  // Intercept hardware back button -> go to CustomerHomeScreen
  useEffect(() => {
    const onBackPress = () => {
      navigation.reset({
        index: 0,
        routes: [{ name: 'CustomerHomeScreen' }],
      });
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [navigation]);

  // Socket.IO real-time order status listeners
  useEffect(() => {
    if (!socket || !bookingId) return;

    const bIdStr = String(bookingId);
    socket.emit('join_room', `booking_${bIdStr}`);
    socket.emit('join_room', `order_${bIdStr}`);

    const handleStatusUpdate = (data: any) => {
      if (!data) return;
      const targetId = String(data.bookingId || data.rideId || data.orderId || data._id || '');
      if (targetId && targetId !== bIdStr) return;

      if (data.status) {
        setCurrentStatus(data.status.toUpperCase());
        setOrder((prev: any) => ({ ...prev, status: data.status }));
      }
    };

    socket.on('booking_status_updated', handleStatusUpdate);
    socket.on('order_status_updated', handleStatusUpdate);
    socket.on('food_order_accepted', handleStatusUpdate);

    return () => {
      socket.off('booking_status_updated', handleStatusUpdate);
      socket.off('order_status_updated', handleStatusUpdate);
      socket.off('food_order_accepted', handleStatusUpdate);
    };
  }, [socket, bookingId]);

  // Smooth auto-transition to live order tracking screen after 4.5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      handleTrackOrder();
    }, 4500);
    return () => clearTimeout(timer);
  }, [bookingId, order]);

  const handleTrackOrder = () => {
    navigation.navigate('SingleOrderStatusScreen', {
      bookingId: bookingId,
      order: order,
      activeFoodOrder: order,
      isFoodDelivery: true,
      categoryName: categoryName,
    });
  };

  const getStatusText = () => {
    const s = (currentStatus || '').toUpperCase();
    if (s === 'RESTAURANT_ACCEPTED' || s === 'STORE_ACCEPTED' || s === 'ACCEPTED') {
      return 'Store Accepted • Preparing';
    }
    if (s === 'PREPARING' || s === 'FOOD_PREPARING') {
      return 'Preparing Your Order';
    }
    if (s === 'FOOD_READY' || s === 'READY' || s === 'READY_FOR_PICKUP') {
      return 'Order Packed & Ready';
    }
    if (s === 'OUT_FOR_DELIVERY' || s === 'PICKED_UP') {
      return 'Out for Delivery';
    }
    if (s === 'DELIVERED' || s === 'COMPLETED') {
      return 'Delivered Successfully';
    }
    if (s.includes('CANCEL')) {
      return 'Cancelled';
    }
    return 'Connecting to Store...';
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#DCFCE7" />

      <View style={styles.container}>
        {/* Confetti Decorative Dots */}
        <View style={[styles.confettiParticle, { top: height * 0.12, left: width * 0.15, backgroundColor: '#86EFAC' }]} />
        <View style={[styles.confettiParticle, { top: height * 0.18, right: width * 0.18, backgroundColor: '#FDE047' }]} />
        <View style={[styles.confettiParticle, { top: height * 0.28, left: width * 0.12, backgroundColor: '#34D399' }]} />
        <View style={[styles.confettiParticle, { top: height * 0.26, right: width * 0.14, backgroundColor: '#6EE7B7' }]} />

        {/* 1. 3D Delivery Bag Illustration */}
        <Animated.View
          style={[
            styles.bagContainer,
            {
              transform: [
                {
                  scale: bagBounceAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.6, 1],
                  }),
                },
                {
                  translateY: bagBounceAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-30, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Image
            source={require('../assets/images/order_success_bag.png')}
            style={styles.bagImage}
            resizeMode="contain"
          />
        </Animated.View>

        {/* 2. Content Section */}
        <Animated.View style={[styles.contentSection, { opacity: contentFadeAnim }]}>
          {/* Order Confirmed Pill */}
          <View style={styles.confirmedPill}>
            <Text style={styles.confirmedPillCheck}>✓</Text>
            <Text style={styles.confirmedPillText}>ORDER CONFIRMED</Text>
          </View>

          {/* Heading */}
          <Text style={styles.successHeading}>🎉 Order Placed Successfully!</Text>

          {/* Subtitle */}
          <Text style={styles.successSubtitle}>
            Your order has been sent to <Text style={styles.storeNameText}>{storeName}</Text>.
          </Text>

          {/* 3. Glassmorphic Details Card */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleTrackOrder}
            style={styles.detailsCard}
          >
            {/* Row 1: Order ID */}
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Order ID</Text>
              <Text style={styles.cardValueBold}>{displayOrderId}</Text>
            </View>

            <View style={styles.cardDivider} />

            {/* Row 2: Total Amount */}
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Total Amount</Text>
              <Text style={styles.cardValueBold}>₹{amount}</Text>
            </View>

            <View style={styles.cardDivider} />

            {/* Row 3: Status */}
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Status</Text>
              <View style={styles.statusValueWrap}>
                <View style={styles.statusCircleDot} />
                <Text style={styles.statusText}>{getStatusText()}</Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* 4. Bottom Live Tracking Indicator */}
          <TouchableOpacity
            style={styles.bottomTrackingRow}
            onPress={handleTrackOrder}
            activeOpacity={0.8}
          >
            <Animated.View
              style={[
                styles.pulseRing,
                {
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            >
              <View style={styles.innerPulseDot} />
            </Animated.View>
            <Text style={styles.bottomTrackingText}>Opening Live Order Tracking...</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#E8F8EE',
  },
  container: {
    flex: 1,
    backgroundColor: '#E8F8EE',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: Platform.OS === 'android' ? 24 : 16,
  },
  confettiParticle: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 0.85,
  },
  bagContainer: {
    width: width * 0.75,
    height: height * 0.32,
    maxHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: height * 0.04,
  },
  bagImage: {
    width: '100%',
    height: '100%',
  },
  contentSection: {
    width: '100%',
    alignItems: 'center',
    marginBottom: height * 0.05,
  },
  confirmedPill: {
    backgroundColor: '#14532D',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 20,
    borderRadius: 24,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#14532D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  confirmedPillCheck: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    marginRight: 6,
  },
  confirmedPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  successHeading: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.2,
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
    textAlign: 'center',
    marginBottom: 20,
  },
  storeNameText: {
    fontWeight: '800',
    color: '#0F172A',
  },
  detailsCard: {
    width: '100%',
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 20,
    elevation: 3,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    marginBottom: 28,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#334155',
  },
  cardValueBold: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#DCFCE7',
    marginVertical: 12,
  },
  statusValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusCircleDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#22C55E',
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#15803D',
  },
  bottomTrackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  pulseRing: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  innerPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
  },
  bottomTrackingText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#15803D',
    letterSpacing: 0.2,
  },
});

export default OrderSuccessScreen;
