import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  StatusBar, 
  Image, 
  TouchableOpacity, 
  ScrollView, 
  Modal, 
  TextInput, 
  ActivityIndicator, 
  Alert,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  FlatList,
  LayoutAnimation,
  UIManager,
  RefreshControl
} from 'react-native';
import Icon from '../components/PngIcon';

import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { UPLOADS_URL } from '../services/api';
import { OrderHistorySkeletonLoader } from '../components/OrderHistorySkeletonLoader';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get('window');

const CANCEL_REASONS = [
  'Wait time is too long',
  'Booked by mistake',
  'Provider not moving towards location',
  'Provider requested to cancel',
  'Changed plans / no longer needed',
  'Other reason'
];

const MyBookingsScreen = ({ navigation, route }: any) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { isDark, currentColors } = useTheme();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const lastFetchTimeRef = useRef(0);

  const screenTitle = route?.params?.title || 'Order History';
  const roleParam = route?.params?.role;
  const userIdParam = route?.params?.userId;

  // Instant Cache Hydration on Mount (0ms delay - zero blank screen)
  useEffect(() => {
    let isMounted = true;
    const hydrateCache = async () => {
      try {
        const uId = userIdParam || user?._id || user?.id || 'customer';
        const cacheKey = `CACHE_CUSTOMER_BOOKINGS_${roleParam || 'customer'}_${uId}`;
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached && isMounted) {
          let parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // If navigated with cancelled booking param, immediately reconcile status
            const cancelledId = route?.params?.cancelledBookingId;
            if (cancelledId) {
              parsed = parsed.map((b: any) => {
                const bId = b.bookingId || b.rideId || b._id || b.id;
                if (String(bId) === String(cancelledId)) {
                  return {
                    ...b,
                    status: 'CANCELLED',
                    deliveryStatus: 'CANCELLED',
                    riderStatus: 'CANCELLED',
                    cancelledBy: 'CUSTOMER',
                    cancelledAt: new Date().toISOString(),
                    cancellationStatus: 'CANCELLED',
                  };
                }
                return b;
              });
              AsyncStorage.setItem(cacheKey, JSON.stringify(parsed)).catch(() => {});
            }
            setBookings(parsed);
          }
        }
      } catch (_) {}
    };
    hydrateCache();
    return () => { isMounted = false; };
  }, [roleParam, userIdParam, user?._id, user?.id, route?.params?.cancelledBookingId]);
  
  // Date Helpers
  const _today = new Date();
  const _todayStr = `${_today.getFullYear()}-${String(_today.getMonth() + 1).padStart(2, '0')}-${String(_today.getDate()).padStart(2, '0')}`;

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'CANCELLED'>('ALL');
  const [selectedDateStr, setSelectedDateStr] = useState<string>('ALL');
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(-1);

  // Scroll Header visibility
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const lastOffset = useRef(0);

  const handleScroll = (e: any) => {
    const currentOffset = e.nativeEvent.contentOffset.y;
    const diff = currentOffset - lastOffset.current;
    
    if (currentOffset > 20 && diff > 5) {
      if (isHeaderVisible) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsHeaderVisible(false);
      }
    } else if (diff < -5 || currentOffset <= 0) {
      if (!isHeaderVisible) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsHeaderVisible(true);
      }
    }
    lastOffset.current = currentOffset;
  };

  const MONTHS = ['ALL', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Cancellation Modal State
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [bookingToCancel, setBookingToCancel] = useState<any>(null);
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [customReasonText, setCustomReasonText] = useState<string>('');
  const [submittingCancel, setSubmittingCancel] = useState(false);

  // Requirement 5: Cancelled Order Details View Modal State
  const [cancelledDetailsModalVisible, setCancelledDetailsModalVisible] = useState(false);
  const [selectedCancelledOrder, setSelectedCancelledOrder] = useState<any>(null);

  // Supplier Order Details Modal State (Strict separation: Supplier never sees SingleOrderStatusScreen)
  const [supplierOrderModalVisible, setSupplierOrderModalVisible] = useState(false);
  const [selectedSupplierOrder, setSelectedSupplierOrder] = useState<any>(null);

  // Generate calendar days based on selected month
  const calendarDays = React.useMemo(() => {
    const list = [];
    
    // Add "All Dates" option for the current selection
    list.push({ dateStr: 'ALL', label: 'All Dates', dayNum: '', dayName: 'All', monthName: '' });

    const today = new Date();
    const currentYear = today.getFullYear();
    
    // If a specific month is selected, only show days for that month
    // If 'ALL' is selected (-1), show days for the whole year
    let startMonth = selectedMonthIndex === -1 ? 0 : selectedMonthIndex;
    let endMonth = selectedMonthIndex === -1 ? 11 : selectedMonthIndex;
    
    let d = new Date(currentYear, startMonth, 1);
    
    while (d.getFullYear() === currentYear && d.getMonth() <= endMonth) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const date = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${date}`;
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const monthName = d.toLocaleDateString('en-US', { month: 'short' });
      const dayNum = String(d.getDate());
      
      list.push({
        dateStr,
        label: `${dayName} ${dayNum} ${monthName}`,
        dayNum,
        dayName,
        monthName
      });
      
      d.setDate(d.getDate() + 1);
    }
    return list;
  }, [selectedMonthIndex]);

  const isFetchingRef = useRef(false);
  const fetchBookings = useCallback(async (isUserInitiated: any = false) => {
    if (isFetchingRef.current) return;
    try {
      isFetchingRef.current = true;
      const userInit = Boolean(isUserInitiated === true);
      if (userInit) {
        setRefreshing(true);
      } else if (bookings.length === 0) {
        setLoading(true);
      }

      const isSupplierMode = roleParam === 'provider' || roleParam === 'supplier' || roleParam === 'seller_partner';
      let targetUserId = userIdParam;
      let userRole = isSupplierMode ? 'provider' : 'customer';
      let userPhone = route?.params?.phone || '';
      let authHeader: any = { 'X-Role': isSupplierMode ? 'supplier' : 'customer' };

      if (isSupplierMode) {
        const suppToken = (await AsyncStorage.getItem('supplierToken')) || (await AsyncStorage.getItem('userToken'));
        if (suppToken) {
          authHeader.Authorization = `Bearer ${suppToken}`;
        }
        if (!targetUserId) {
          const suppUserStr = await AsyncStorage.getItem('supplierUser');
          if (suppUserStr) {
            try {
              const parsed = JSON.parse(suppUserStr);
              targetUserId = parsed._id || parsed.id || parsed.businessId;
              userPhone = userPhone || parsed.phoneNumber || parsed.phone || '';
            } catch (e) {}
          }
        }
        if (!targetUserId && (user?.role === 'supplier' || user?.role === 'seller_partner')) {
          targetUserId = user._id || user.id;
          userPhone = userPhone || user?.phoneNumber || user?.phone || '';
        }
      } else {
        const custToken = (await AsyncStorage.getItem('customerToken')) || (await AsyncStorage.getItem('userToken'));
        if (custToken) {
          authHeader.Authorization = `Bearer ${custToken}`;
        }
        if (!targetUserId) {
          const custUserStr = await AsyncStorage.getItem('customerUser');
          if (custUserStr) {
            try {
              const parsed = JSON.parse(custUserStr);
              targetUserId = parsed._id || parsed.id;
              userPhone = userPhone || parsed.phoneNumber || parsed.phone || '';
            } catch (e) {}
          }
        }
        if (!targetUserId) {
          targetUserId = (user?._id || user?.id || user?.phone || 'customer_device_1')?.toString();
          userPhone = userPhone || user?.phoneNumber || user?.phone || '';
        }
      }

      console.log('[MyBookingsScreen] Fetching bookings for userId:', targetUserId, 'role:', userRole, 'date:', selectedDateStr, 'statusFilter:', statusFilter);
      let res = await api.get(`/bookings/my-bookings?userId=${targetUserId || ''}&role=${userRole}&phone=${userPhone}&date=${selectedDateStr}&statusFilter=${statusFilter}`, {
        headers: authHeader,
      });
      let list = (res.data && Array.isArray(res.data.bookings)) ? res.data.bookings : [];
      setBookings(list);
      lastFetchTimeRef.current = Date.now();
      const uId = targetUserId || user?._id || user?.id || 'customer';
      const cacheKey = `CACHE_CUSTOMER_BOOKINGS_${userRole}_${uId}`;
      AsyncStorage.setItem(cacheKey, JSON.stringify(list)).catch(() => {});
    } catch (err) {
      console.log('Error fetching bookings:', err);
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [userIdParam, roleParam, route?.params?.phone, user?._id, user?.id, user?.role, user?.phone, user?.phoneNumber, selectedDateStr, statusFilter]);

  useFocusEffect(
    useCallback(() => {
      // Re-fetch bookings on screen focus silently in background (instant sync)
      fetchBookings(false);
    }, [fetchBookings])
  );

  // Real-time updates via Socket (Instant 0ms cancellation reflection)
  useEffect(() => {
    if (!socket) return;

    const handleBookingUpdate = () => {
      fetchBookings(false);
    };

    const handleOrderCancellation = (data: any) => {
      const targetId = data?.bookingId || data?.rideId || data?.orderId || data?.id;
      if (targetId) {
        setBookings((prev) => {
          const updated = prev.map((b: any) => {
            const bId = b.bookingId || b.rideId || b._id || b.id;
            if (String(bId) === String(targetId)) {
              return {
                ...b,
                status: 'CANCELLED',
                deliveryStatus: 'CANCELLED',
                riderStatus: 'CANCELLED',
                cancelledBy: data?.cancelledBy || b.cancelledBy || 'CUSTOMER',
                cancellationReason: data?.cancellationReason || data?.reason || b.cancellationReason || 'Order Cancelled',
                cancelledAt: data?.cancelledAt || b.cancelledAt || new Date().toISOString(),
                cancellationStatus: 'CANCELLED',
                paidAmount: data?.paidAmount ?? b.paidAmount,
                refundAmount: data?.refundAmount ?? b.refundAmount,
              };
            }
            return b;
          });

          // Re-persist immediately so app restart retains CANCELLED
          const userRole = roleParam || user?.role || 'customer';
          const uId = userIdParam || user?._id || user?.id || 'customer';
          const cacheKey = `CACHE_CUSTOMER_BOOKINGS_${userRole}_${uId}`;
          AsyncStorage.setItem(cacheKey, JSON.stringify(updated)).catch(() => {});
          return updated;
        });
      }
      fetchBookings(false);
    };

    socket.on('order_cancelled', handleOrderCancellation);
    socket.on('ORDER_CANCELLED', handleOrderCancellation);
    socket.on('DELIVERY_REQUEST_CANCELLED', handleOrderCancellation);
    socket.on('booking_cancelled', handleOrderCancellation);
    socket.on('booking_cancelled_by_customer', handleOrderCancellation);
    socket.on('ride_cancelled', handleOrderCancellation);
    socket.on('ride_cancelled_by_customer', handleOrderCancellation);
    socket.on('service_cancelled', handleOrderCancellation);
    socket.on('food_order_updated', handleBookingUpdate);
    socket.on('FOOD_ORDER_UPDATED', handleBookingUpdate);
    socket.on('order_status_updated', handleBookingUpdate);
    socket.on('booking_status_updated', handleBookingUpdate);
    socket.on('ride_accepted', handleBookingUpdate);
    socket.on('service_accepted', handleBookingUpdate);
    socket.on('ride_rejected', handleBookingUpdate);
    socket.on('service_rejected', handleBookingUpdate);
    socket.on('service_completed', handleBookingUpdate);
    socket.on('provider_arrived', handleBookingUpdate);
    socket.on('service_started', handleBookingUpdate);
    socket.on('new_booking_created', handleBookingUpdate);

    return () => {
      socket.off('order_cancelled', handleOrderCancellation);
      socket.off('ORDER_CANCELLED', handleOrderCancellation);
      socket.off('DELIVERY_REQUEST_CANCELLED', handleOrderCancellation);
      socket.off('booking_cancelled', handleOrderCancellation);
      socket.off('booking_cancelled_by_customer', handleOrderCancellation);
      socket.off('ride_cancelled', handleOrderCancellation);
      socket.off('ride_cancelled_by_customer', handleOrderCancellation);
      socket.off('service_cancelled', handleOrderCancellation);
      socket.off('food_order_updated', handleBookingUpdate);
      socket.off('FOOD_ORDER_UPDATED', handleBookingUpdate);
      socket.off('order_status_updated', handleBookingUpdate);
      socket.off('booking_status_updated', handleBookingUpdate);
      socket.off('ride_accepted', handleBookingUpdate);
      socket.off('service_accepted', handleBookingUpdate);
      socket.off('ride_rejected', handleBookingUpdate);
      socket.off('service_rejected', handleBookingUpdate);
      socket.off('service_completed', handleBookingUpdate);
      socket.off('provider_arrived', handleBookingUpdate);
      socket.off('service_started', handleBookingUpdate);
      socket.off('new_booking_created', handleBookingUpdate);
    };
  }, [socket, user, roleParam, userIdParam]);

  const handleOpenCancelSheet = (booking: any) => {
    setBookingToCancel(booking);
    setSelectedReason(CANCEL_REASONS[0]);
    setCustomReasonText('');
    setCancelModalVisible(true);
  };

  const handleConfirmCancel = async () => {
    if (!bookingToCancel) return;

    let finalReason = selectedReason;
    if (selectedReason === 'Other reason') {
      if (!customReasonText.trim()) {
        Alert.alert('Required', 'Please write a reason for cancellation.');
        return;
      }
      finalReason = customReasonText.trim();
    }

    try {
      setSubmittingCancel(true);
      const targetId = bookingToCancel.bookingId || bookingToCancel.rideId || bookingToCancel._id || bookingToCancel.id;
      const res = await api.put('/bookings/status', {
        bookingId: targetId,
        status: 'CANCELLED',
        cancellationReason: finalReason,
        cancelledBy: 'customer'
      });

      if (res.data.success) {
        // Emit Socket event to sync immediately across supplier client & admin panel
        if (socket) {
          socket.emit('ride_cancelled', { 
            rideId: targetId,
            bookingId: targetId, 
            reason: finalReason 
          });
        }
        
        Alert.alert('Success ✅', 'Booking has been cancelled successfully.');
        setCancelModalVisible(false);
        setBookingToCancel(null);
        fetchBookings();
      } else {
        Alert.alert('Error', res.data.error || 'Failed to cancel booking.');
      }
    } catch (err) {
      console.log('Error cancelling booking:', err);
      Alert.alert('Error', 'Unable to process cancellation.');
    } finally {
      setSubmittingCancel(false);
    }
  };

  const datesWithBookings = React.useMemo(() => {
    const set = new Set<string>();
    bookings.forEach(b => {
      const bDate = b.scheduledDate || (b.createdAt ? b.createdAt.split('T')[0] : '');
      if (bDate) set.add(bDate);
    });
    return set;
  }, [bookings]);

  const formatBookingDateTime = (b: any) => {
    if (!b) return 'Recently';
    const dateSource = b.createdAt || b.scheduledDate;
    if (!dateSource) return 'Recently';
    try {
      const d = new Date(dateSource);
      if (isNaN(d.getTime())) {
        return b.scheduledDate ? `${b.scheduledDate} @ ${b.scheduledTime || '10:00 AM'}` : 'Recently';
      }
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();

      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      const isYesterday = d.toDateString() === yesterday.toDateString();

      const timeString = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

      if (isToday) {
        return `Today, ${timeString}`;
      }
      if (isYesterday) {
        return `Yesterday, ${timeString}`;
      }
      const day = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      return `${day}, ${timeString}`;
    } catch (e) {
      return b.scheduledDate ? `${b.scheduledDate} @ ${b.scheduledTime || '10:00 AM'}` : 'Recently';
    }
  };

  const filteredBookings = React.useMemo(() => {
    let list = bookings;
    if (statusFilter !== 'ALL' || selectedDateStr !== 'ALL' || selectedMonthIndex !== -1) {
      list = bookings.filter((b) => {
        if (!b) return false;
        const statusUpper = (b.status || '').toUpperCase();

        // 1. Status Filter
        if (statusFilter === 'COMPLETED' && !statusUpper.includes('COMPLET') && !statusUpper.includes('DELIVER')) return false;
        if (statusFilter === 'CANCELLED' && !statusUpper.includes('CANCEL') && !statusUpper.includes('REJECT') && !statusUpper.includes('DECLINE') && !statusUpper.includes('TIMEOUT')) return false;

        // 2. Calendar Month & Date Filter
        if (selectedMonthIndex !== -1) {
          const bDate = b.scheduledDate || (b.createdAt ? b.createdAt.split('T')[0] : '');
          if (bDate) {
            const [, bMonth] = bDate.split('-');
            if (parseInt(bMonth, 10) !== selectedMonthIndex + 1) return false;
          }
        }

        if (selectedDateStr !== 'ALL') {
          const bDate = b.scheduledDate || (b.createdAt ? b.createdAt.split('T')[0] : '');
          if (bDate !== selectedDateStr) return false;
        }

        return true;
      });
    }

    // Strict sort by Date and Time descending (newest first)
    return [...list].sort((a, b) => {
      const timeA = new Date(a.createdAt || a.scheduledDate || 0).getTime();
      const timeB = new Date(b.createdAt || b.scheduledDate || 0).getTime();
      return timeB - timeA;
    });
  }, [bookings, statusFilter, selectedDateStr, selectedMonthIndex]);

  const getStatusColor = (status: string) => {
    const s = (status || '').toUpperCase();
    if (s.includes('CANCEL')) {
      return { bg: '#FEE2E2', text: '#EF4444' };
    }
    if (s.includes('COMPLET')) {
      return { bg: '#DCFCE7', text: '#16A34A' };
    }
    if (s.includes('ACCEPT') || s.includes('ARRIVE')) {
      return { bg: '#DBEAFE', text: '#2563EB' };
    }
    if (s.includes('START')) {
      return { bg: '#EFF6FF', text: '#2563EB' };
    }
    return { bg: '#DBEAFE', text: '#1D4ED8' };
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]}>
      <StatusBar hidden={false} barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={currentColors.background} />
      
      {/* Header */}
      <View style={[styles.header, { backgroundColor: currentColors.surface, borderBottomColor: currentColors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
            <Icon name="arrow-back" size={22} color={currentColors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: currentColors.text }]}>{screenTitle}</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => fetchBookings(true)}>
          <Icon name="refresh-outline" size={20} color={currentColors.text} />
        </TouchableOpacity>
      </View>

      {/* Month Selector */}
      {isHeaderVisible && (
        <View style={[styles.calendarContainer, { backgroundColor: currentColors.surface, paddingBottom: 8 }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.calendarScroll}>
            {MONTHS.map((m, idx) => {
              const index = idx - 1;
              const isSelected = selectedMonthIndex === index;
              return (
                <TouchableOpacity
                  key={m}
                  style={[
                    styles.filterPill, 
                    { backgroundColor: isDark ? '#1E1E1E' : '#F1F5F9', marginHorizontal: 4, paddingVertical: 6, paddingHorizontal: 12 }, 
                    isSelected && styles.filterPillActive
                  ]}
                  onPress={() => {
                    setSelectedMonthIndex(index);
                    setSelectedDateStr('ALL');
                  }}
                >
                  <Text style={[styles.filterPillText, { color: currentColors.textMuted }, isSelected && styles.filterPillTextActive]}>
                    {m}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Horizontal Calendar Date Picker */}
      {isHeaderVisible && (
        <View style={[{ backgroundColor: currentColors.surface, paddingBottom: 12, borderBottomWidth: 1, borderColor: isDark ? '#333' : '#F1F5F9' }]}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.calendarScroll}
            data={calendarDays}
            keyExtractor={(item) => item.dateStr}
            initialNumToRender={30}
            renderItem={({ item: day }) => {
              const isSelected = selectedDateStr === day.dateStr;
              return (
                <TouchableOpacity
                  style={[styles.calendarCard, { backgroundColor: isDark ? '#2D3748' : '#F1F5F9' }, isSelected && styles.calendarCardActive]}
                  onPress={() => setSelectedDateStr(day.dateStr)}
                >
                  {day.monthName ? (
                    <Text style={[{ fontSize: 9, fontWeight: '700', marginBottom: 2, color: currentColors.textMuted }, isSelected && styles.calendarDayActiveText]}>
                      {day.monthName.toUpperCase()}
                    </Text>
                  ) : null}
                  <Text style={[styles.calendarDayName, { color: currentColors.textMuted }, isSelected && styles.calendarDayActiveText]}>
                    {day.dayName}
                  </Text>
                  {day.dayNum ? (
                    <Text style={[styles.calendarDayNum, { color: currentColors.text }, isSelected && styles.calendarDayActiveText]}>
                    {day.dayNum}
                  </Text>
                ) : null}
                {datesWithBookings.has(day.dateStr) && (
                  <View style={[styles.indicatorDot, isSelected && styles.indicatorDotActive]} />
                )}
              </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {/* Status Filter Row */}
      <View style={[styles.filterRow, { backgroundColor: currentColors.background }]}>
        {(['ALL', 'COMPLETED', 'CANCELLED'] as const).map((filter) => {
          const isSelected = statusFilter === filter;
          return (
            <TouchableOpacity
              key={filter}
              style={[styles.filterPill, { backgroundColor: isDark ? '#1E1E1E' : '#E2E8F0' }, isSelected && styles.filterPillActive]}
              onPress={() => setStatusFilter(filter)}
            >
              <Text style={[styles.filterPillText, { color: currentColors.textMuted }, isSelected && styles.filterPillTextActive]}>
                {filter}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading && bookings.length === 0 ? (
        <OrderHistorySkeletonLoader isDark={isDark} message="Loading your order history..." />
      ) : filteredBookings.length === 0 ? (
        <ScrollView 
          contentContainerStyle={styles.emptyContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchBookings(true)} colors={['#0066FF']} tintColor="#0066FF" />}
        >
          <Image 
            source={{ uri: 'https://img.icons8.com/fluency/144/purchase-order.png' }} 
            style={styles.emptyImage} 
          />
          <Text style={[styles.emptyTitle, { color: currentColors.text }]}>No Bookings Found</Text>
          <Text style={[styles.emptySubtitle, { color: currentColors.textMuted }]}>
            {statusFilter === 'ALL' 
              ? 'No bookings on this date. Try selecting another date from the calendar.' 
              : statusFilter === 'COMPLETED' 
                ? 'No completed bookings on this date.' 
                : 'No cancelled bookings on this date.'}
          </Text>
        </ScrollView>
      ) : (
        <ScrollView 
          contentContainerStyle={styles.listContainer} 
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchBookings(true)} colors={['#0066FF']} tintColor="#0066FF" />}
        >
          {filteredBookings.map((b) => {
            const stUpper = (b.status || '').toUpperCase();
            const isCancelled = stUpper.includes('CANCEL');
            const isCompleted = ['COMPLETED', 'DELIVERED', 'SERVICE_COMPLETED'].includes(stUpper);
            const isCancellable = ['BOOKING_REQUESTED', 'PENDING', 'ACCEPTED', 'PROVIDER_ARRIVED', 'PENDING_RESTAURANT'].includes(b.status);
            const isTrackable = !isCancelled && !isCompleted;
            const colors = getStatusColor(b?.status || '') || { bg: '#FEF3C7', text: '#D97706' };

            const isCallerRider = roleParam === 'rider' || roleParam === 'delivery_partner' || route?.params?.isRider === true || user?.role === 'rider' || user?.role === 'delivery_partner';
            const isSupplier = roleParam === 'provider' || roleParam === 'supplier' || roleParam === 'seller_partner' || user?.role === 'supplier' || user?.role === 'seller_partner';

            const handleOpenLiveStatus = () => {
              const bId = b.bookingId || b.rideId || b._id;
              console.log(`[CUSTOMER_OPEN_MY_RIDE]\nbookingId: ${bId}\nstatus: ${b.status}`);

              // Requirement 5: Cancelled orders must show cancellation details modal, NEVER navigate to tracking!
              if (isCancelled) {
                setSelectedCancelledOrder(b);
                setCancelledDetailsModalVisible(true);
                return;
              }

              // Requirement: Completed rides/orders must NOT open live tracking!
              if (isCompleted) {
                console.log(`[COMPLETED_ORDER_NO_TRACK] Order #${bId} is completed. Tracking is disabled.`);
                return;
              }

              // Supplier Mode: Show dedicated order details modal, NEVER navigate to customer tracking!
              if (isSupplier) {
                setSelectedSupplierOrder(b);
                setSupplierOrderModalVisible(true);
                return;
              }

              // Requirement 6: Rider must NEVER see customer SingleOrderStatusScreen, only rider LiveTracking workflow
              if (isCallerRider) {
                navigation.navigate('LiveTracking', {
                  ride: { ...b, rideId: bId, bookingId: bId },
                  isRider: true,
                });
                return;
              }

              const isFood =
                b.categoryName === 'Food Delivery' ||
                b.bookingType === 'food' ||
                b.isFoodDelivery ||
                Boolean(b.items && b.items.length > 0) ||
                Boolean(b.restaurantId);

              if (isFood) {
                navigation.navigate('SingleOrderStatusScreen', {
                  isFoodDelivery: true,
                  restaurant: {
                    name: b.restaurantName || b.name,
                    address: b.pickupAddress,
                  },
                  restoName: b.restaurantName || b.name,
                  bookingId: bId,
                  rideId: bId,
                  order: b,
                  activeFoodOrder: b,
                  totalAmount: b.price,
                  price: b.price,
                  categoryName: b.categoryName || b.businessCategoryName || b.partnerType || 'Store',
                  businessCategoryName: b.categoryName || b.businessCategoryName || b.partnerType || 'Store',
                  serviceName: b.serviceName || b.categoryName || 'Store',
                });
                return;
              }

              navigation.navigate('LiveTracking', {
                ride: { ...b, rideId: bId, bookingId: bId },
                isRider: false
              });
            };

            return (
              <TouchableOpacity
                key={b._id || b.bookingId}
                style={[styles.bookingCard, { backgroundColor: currentColors.surface, borderColor: currentColors.border }]}
                onPress={handleOpenLiveStatus}
                activeOpacity={0.92}
              >
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={[styles.serviceName, { color: currentColors.text }]} numberOfLines={1}>
                      {isSupplier 
                        ? (b.customerName ? `👤 ${b.customerName}` : (b.categoryName || 'Store Order'))
                        : (b.restaurantName || b.serviceName || b.categoryName || b.title || b.name || 'Order')}
                    </Text>
                    <Text style={[styles.bookingIdText, { color: currentColors.textMuted }]}>
                      {isSupplier && b.customerPhone ? `📞 ${b.customerPhone} • ` : ''}ID: {b.bookingId}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
                    <Text style={[styles.statusText, { color: colors.text }]}>{b.status}</Text>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  {b.status?.includes('CANCEL') && (
                    <View style={[styles.detailRow, { backgroundColor: '#FEE2E2', padding: 8, borderRadius: 8, marginBottom: 8 }]}>
                      <Icon name="close-circle-outline" size={18} color="#EF4444" />
                      <Text style={[styles.detailText, { color: '#EF4444', fontWeight: '700', marginLeft: 6 }]}>
                        {b.cancelledBy?.toUpperCase() === 'SUPPLIER' || b.cancelledBy?.toUpperCase() === 'PROVIDER' || b.cancelledBy?.toUpperCase() === 'RIDER'
                          ? 'Cancelled By: Rider/Provider'
                          : b.cancelledBy?.toUpperCase() === 'CUSTOMER'
                            ? 'Cancelled By: You'
                            : 'Cancelled'}
                        {b.cancellationReason ? ` - ${b.cancellationReason}` : ''}
                      </Text>
                    </View>
                  )}
                  {b.status?.includes('COMPLET') && b.completedAt && (
                    <View style={[styles.detailRow, { backgroundColor: '#DCFCE7', padding: 8, borderRadius: 8, marginBottom: 8 }]}>
                      <Icon name="checkmark-circle-outline" size={18} color="#16A34A" />
                      <Text style={[styles.detailText, { color: '#16A34A', fontWeight: '700', marginLeft: 6 }]}>
                        Completed at {new Date(b.completedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </Text>
                    </View>
                  )}
                  <View style={styles.detailRow}>
                    <Icon name="calendar-outline" size={16} color={currentColors.textMuted} />
                    <Text style={[styles.detailText, { color: currentColors.grayText }]}>
                      📅 {formatBookingDateTime(b)}
                    </Text>
                  </View>
                  {b.cartItems && typeof b.cartItems === 'object' && Object.keys(b.cartItems).length > 0 && (
                    <View style={{ backgroundColor: isDark ? '#1E1E1E' : '#F8FAFC', padding: 8, borderRadius: 8, marginVertical: 4 }}>
                      {Object.entries(b.cartItems).slice(0, 3).map(([key, item]: [string, any]) => {
                        const name = typeof item === 'object' ? (item?.name || item?.dishName || 'Dish Item') : 'Dish Item';
                        const qty = typeof item === 'object' ? (item?.quantity || 1) : item;
                        return (
                          <Text key={key} style={{ fontSize: 12, color: currentColors.text, marginVertical: 1 }}>
                            🍽️ {name} <Text style={{ fontWeight: 'bold' }}>x {qty}</Text>
                          </Text>
                        );
                      })}
                    </View>
                  )}
                  <View style={styles.detailRow}>
                    <Icon name="location-outline" size={16} color={currentColors.textMuted} />
                    <Text style={[styles.detailText, { color: currentColors.grayText }]} numberOfLines={1}>
                      {isSupplier ? `📍 Delivery: ${b.dropAddress || b.serviceAddress || 'Customer Address'}` : (b.serviceAddress || b.pickupAddress || 'Address')}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Icon name="cash-outline" size={16} color={currentColors.textMuted} />
                    <Text style={[styles.priceText, { color: currentColors.text }]}>₹{b.price || '0.00'}</Text>
                  </View>
                  {b.providerName ? (
                    <View style={styles.providerRow}>
                      <Icon name="person-circle-outline" size={18} color="#0066FF" />
                      <Text style={[styles.providerText, { color: currentColors.text }]}>Assigned: {b.providerName}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.cardActions}>
                  {isCancellable && !isSupplier ? (
                    <TouchableOpacity 
                      style={styles.cancelBtn} 
                      onPress={() => handleOpenCancelSheet(b)}
                    >
                      <Text style={styles.cancelBtnText}>Cancel Booking</Text>
                    </TouchableOpacity>
                  ) : null}

                  {isTrackable ? (
                    <TouchableOpacity 
                      style={styles.trackBtn} 
                      onPress={handleOpenLiveStatus}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.trackBtnText}>
                        {isCallerRider ? '🛵 View Delivery ➔' : isSupplier ? '📋 Order Details ➔' : '📍 Track Order ➔'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Cancellation Sheet Modal */}
      <Modal visible={cancelModalVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cancel Service Booking</Text>
              <TouchableOpacity onPress={() => setCancelModalVisible(false)} style={styles.closeBtn}>
                <Icon name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Please select a cancellation reason to help us improve our services.
            </Text>

            <ScrollView style={styles.reasonsList} showsVerticalScrollIndicator={false}>
              {CANCEL_REASONS.map((reason) => {
                const isSelected = selectedReason === reason;
                return (
                  <TouchableOpacity
                    key={reason}
                    style={[styles.reasonItem, isSelected && styles.reasonItemActive]}
                    onPress={() => setSelectedReason(reason)}
                  >
                    <Icon 
                      name={isSelected ? 'radio-button-on' : 'radio-button-off'} 
                      size={20} 
                      color={isSelected ? '#0066FF' : '#94A3B8'} 
                    />
                    <Text style={[styles.reasonText, isSelected && styles.reasonTextActive]}>
                      {reason}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {selectedReason === 'Other reason' && (
                <TextInput
                  style={styles.customReasonInput}
                  multiline
                  numberOfLines={3}
                  value={customReasonText}
                  onChangeText={setCustomReasonText}
                  placeholder="Explain your reason here..."
                  placeholderTextColor="#94A3B8"
                />
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.modalCloseBtn} 
                onPress={() => setCancelModalVisible(false)}
              >
                <Text style={styles.modalCloseBtnText}>Go Back</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalConfirmBtn, submittingCancel && styles.disabledBtn]} 
                onPress={handleConfirmCancel}
                disabled={submittingCancel}
              >
                {submittingCancel ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.modalConfirmBtnText}>Confirm Cancellation</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* REQUIREMENT 5: CANCELLED ORDER DETAILS MODAL */}
      <Modal
        visible={cancelledDetailsModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCancelledDetailsModalVisible(false)}
      >
        <View style={styles.modalBg}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: '#FEE2E2',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="close" size={20} color="#EF4444" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Order Cancelled</Text>
                  <Text style={{ fontSize: 12, color: '#94A3B8', fontWeight: '600' }}>
                    #{String(selectedCancelledOrder?.bookingId || selectedCancelledOrder?.rideId || selectedCancelledOrder?._id || '').slice(-8)}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setCancelledDetailsModalVisible(false)}
              >
                <Icon name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginVertical: 12 }}>
              {/* Store & Category Info */}
              <View
                style={{
                  backgroundColor: '#F8FAFC',
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 4 }}>
                  {selectedCancelledOrder?.restaurantName || selectedCancelledOrder?.storeName || selectedCancelledOrder?.name || 'Store Order'}
                </Text>
                <Text style={{ fontSize: 12, color: '#64748B' }}>
                  {selectedCancelledOrder?.categoryName || 'Delivery Order'} • ₹{selectedCancelledOrder?.price || 0}
                </Text>
              </View>

              {/* Cancellation Summary Card */}
              <View
                style={{
                  backgroundColor: '#FFF1F2',
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: '#FECDD3',
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ fontSize: 13, color: '#9F1239', fontWeight: '700' }}>Cancelled By</Text>
                  <Text style={{ fontSize: 13, color: '#E11D48', fontWeight: '800' }}>
                    {(() => {
                      const by = (selectedCancelledOrder?.cancelledBy || selectedCancelledOrder?.cancellationSource || '').toUpperCase();
                      if (by.includes('RIDER') || by.includes('DELIVERY')) return 'Delivery Partner';
                      if (by.includes('STORE') || by.includes('SUPPLIER') || by.includes('RESTAURANT')) return 'Store';
                      if (by.includes('ADMIN')) return 'Admin';
                      return 'Customer';
                    })()}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ fontSize: 13, color: '#9F1239', fontWeight: '700' }}>Reason</Text>
                  <Text style={{ fontSize: 13, color: '#0F172A', fontWeight: '600', flex: 1, textAlign: 'right', marginLeft: 12 }}>
                    {selectedCancelledOrder?.cancellationReason || selectedCancelledOrder?.reason || 'Order cancelled'}
                  </Text>
                </View>

                {selectedCancelledOrder?.cancelledAt && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ fontSize: 13, color: '#9F1239', fontWeight: '700' }}>Cancelled At</Text>
                    <Text style={{ fontSize: 13, color: '#475569', fontWeight: '600' }}>
                      {new Date(selectedCancelledOrder.cancelledAt).toLocaleString()}
                    </Text>
                  </View>
                )}

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: '#FECDD3', paddingTop: 8, marginTop: 4 }}>
                  <Text style={{ fontSize: 13, color: '#9F1239', fontWeight: '700' }}>Refund Status</Text>
                  <Text style={{ fontSize: 13, color: '#16A34A', fontWeight: '800' }}>
                    {selectedCancelledOrder?.refundStatus || (selectedCancelledOrder?.paymentMethod === 'ONLINE' ? 'Refund Processed' : 'Not Applicable (COD)')}
                  </Text>
                </View>
              </View>

              {/* Items in the order */}
              {Array.isArray(selectedCancelledOrder?.items) && selectedCancelledOrder.items.length > 0 && (
                <View
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 14,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginBottom: 8 }}>
                    Ordered Items ({selectedCancelledOrder.items.length})
                  </Text>
                  {selectedCancelledOrder.items.map((it: any, idx: number) => (
                    <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                      <Text style={{ fontSize: 13, color: '#334155' }}>
                        {it.quantity || 1}x {it.name || it.itemName || 'Item'}
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                        ₹{Number(it.price || 0) * Number(it.quantity || 1)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              style={{
                height: 46,
                backgroundColor: '#0F172A',
                borderRadius: 12,
                justifyContent: 'center',
                alignItems: 'center',
                marginTop: 8,
              }}
              onPress={() => setCancelledDetailsModalVisible(false)}
            >
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>Close Details</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* DEDICATED SUPPLIER / STORE ORDER DETAILS MODAL */}
      <Modal
        visible={supplierOrderModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSupplierOrderModalVisible(false)}
      >
        <View style={styles.modalBg}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: '#EFF6FF',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="receipt-outline" size={20} color="#0066FF" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Store Order Details</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '600' }}>
                    #{String(selectedSupplierOrder?.bookingId || selectedSupplierOrder?._id || '').slice(-8)}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setSupplierOrderModalVisible(false)}
              >
                <Icon name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginVertical: 12 }}>
              {/* Order Status Badge & Date */}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  backgroundColor: '#F8FAFC',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                }}
              >
                <View>
                  <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>STATUS</Text>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginTop: 2 }}>
                    {selectedSupplierOrder?.status || 'UNKNOWN'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>DATE & TIME</Text>
                  <Text style={{ fontSize: 12, color: '#334155', marginTop: 2 }}>
                    {selectedSupplierOrder ? formatBookingDateTime(selectedSupplierOrder) : ''}
                  </Text>
                </View>
              </View>

              {/* Customer Information Card */}
              <View
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginBottom: 8 }}>
                  👤 Customer Details
                </Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E293B' }}>
                  {selectedSupplierOrder?.customerName || 'Customer'}
                </Text>
                {selectedSupplierOrder?.customerPhone ? (
                  <Text style={{ fontSize: 13, color: '#0066FF', marginTop: 4, fontWeight: '600' }}>
                    📞 {selectedSupplierOrder.customerPhone}
                  </Text>
                ) : null}
                <Text style={{ fontSize: 12, color: '#64748B', marginTop: 6, lineHeight: 18 }}>
                  📍 {selectedSupplierOrder?.dropAddress || selectedSupplierOrder?.serviceAddress || 'Customer Address'}
                </Text>
              </View>

              {/* Items Card */}
              {selectedSupplierOrder && (
                <View
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginBottom: 8 }}>
                    🍽️ Order Items
                  </Text>
                  {Array.isArray(selectedSupplierOrder.items) && selectedSupplierOrder.items.length > 0 ? (
                    selectedSupplierOrder.items.map((it: any, idx: number) => (
                      <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: idx < selectedSupplierOrder.items.length - 1 ? 0.5 : 0, borderBottomColor: '#F1F5F9' }}>
                        <Text style={{ fontSize: 13, color: '#334155', flex: 1 }}>
                          {it.quantity || 1}x {it.name || it.itemName || 'Item'}
                        </Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                          ₹{Number(it.price || 0) * Number(it.quantity || 1)}
                        </Text>
                      </View>
                    ))
                  ) : selectedSupplierOrder.cartItems && typeof selectedSupplierOrder.cartItems === 'object' && Object.keys(selectedSupplierOrder.cartItems).length > 0 ? (
                    Object.entries(selectedSupplierOrder.cartItems).map(([k, item]: [string, any], idx: number) => {
                      const name = typeof item === 'object' ? (item?.name || item?.dishName || 'Item') : 'Item';
                      const qty = typeof item === 'object' ? (item?.quantity || 1) : item;
                      const pr = typeof item === 'object' ? (item?.price || 0) : 0;
                      return (
                        <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
                          <Text style={{ fontSize: 13, color: '#334155', flex: 1 }}>
                            {qty}x {name}
                          </Text>
                          {pr > 0 && (
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                              ₹{Number(pr) * Number(qty)}
                            </Text>
                          )}
                        </View>
                      );
                    })
                  ) : (
                    <Text style={{ fontSize: 12, color: '#94A3B8' }}>{selectedSupplierOrder.categoryName || 'Standard Order'}</Text>
                  )}
                </View>
              )}

              {/* Bill Total */}
              <View
                style={{
                  backgroundColor: '#F0FDF4',
                  borderRadius: 12,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: '#BBF7D0',
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#166534' }}>Total Order Amount</Text>
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#166534' }}>
                  ₹{selectedSupplierOrder?.price || '0.00'}
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={{
                height: 46,
                backgroundColor: '#0066FF',
                borderRadius: 12,
                justifyContent: 'center',
                alignItems: 'center',
                marginTop: 8,
              }}
              onPress={() => setSupplierOrderModalVisible(false)}
            >
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? Math.max(StatusBar.currentHeight || 0, 24) + 16 : 22,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  backBtn: {
    width: 36,
    height: 36,
    backgroundColor: '#F1F5F9',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  refreshBtn: { width: 36, height: 36, backgroundColor: '#F1F5F9', borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  
  calendarContainer: { backgroundColor: '#FFFFFF', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#F1F5F9' },
  calendarScroll: { paddingHorizontal: 16 },
  calendarCard: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  calendarCardActive: { backgroundColor: '#0066FF' },
  calendarDayName: { fontSize: 11, fontWeight: '600', color: '#64748B', textTransform: 'uppercase', marginBottom: 2 },
  calendarDayNum: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  calendarDayActiveText: { color: '#FFFFFF' },
  indicatorDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#0066FF', marginTop: 4 },
  indicatorDotActive: { backgroundColor: '#FFFFFF' },

  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF' },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    marginRight: 8,
  },
  filterPillActive: { backgroundColor: '#0066FF' },
  filterPillText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  filterPillTextActive: { color: '#FFFFFF' },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyImage: { width: 96, height: 96, marginBottom: 20, opacity: 0.8 },
  emptyTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: 8 },
  emptySubtitle: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 18 },

  listContainer: { padding: 16, paddingBottom: 30 },
  bookingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  serviceName: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 2 },
  bookingIdText: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '800' },

  cardBody: { marginBottom: 16 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  detailText: { fontSize: 13, color: '#475569', fontWeight: '500', marginLeft: 8, flex: 1 },
  priceText: { fontSize: 14, fontWeight: '800', color: '#0F172A', marginLeft: 8 },
  providerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, backgroundColor: '#EFF6FF', padding: 8, borderRadius: 8 },
  providerText: { fontSize: 13, color: '#1E40AF', fontWeight: '700', marginLeft: 8 },

  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', borderTopWidth: 1, borderColor: '#F1F5F9', paddingTop: 12 },
  cancelBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1', marginRight: 8 },
  cancelBtnText: { fontSize: 13, color: '#64748B', fontWeight: '700' },
  trackBtn: { backgroundColor: '#0066FF', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, flexDirection: 'row', alignItems: 'center' },
  trackBtnText: { fontSize: 13, color: '#FFFFFF', fontWeight: '800' },

  modalBg: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  closeBtn: { width: 32, height: 32, backgroundColor: '#F1F5F9', borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  modalSubtitle: { fontSize: 13, color: '#64748B', lineHeight: 18, marginBottom: 20 },
  reasonsList: { marginBottom: 20 },
  reasonItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#F1F5F9' },
  reasonItemActive: { borderColor: '#BFDBFE' },
  reasonText: { fontSize: 14, color: '#475569', fontWeight: '500', marginLeft: 12, flex: 1 },
  reasonTextActive: { color: '#0066FF', fontWeight: '700' },
  customReasonInput: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, padding: 12, fontSize: 14, color: '#0F172A', marginTop: 12, height: 70, textAlignVertical: 'top' },

  modalActions: { flexDirection: 'row', justifyContent: 'space-between' },
  modalCloseBtn: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  modalCloseBtnText: { fontSize: 14, color: '#64748B', fontWeight: '700' },
  modalConfirmBtn: { flex: 2, height: 48, backgroundColor: '#EF4444', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  modalConfirmBtnText: { fontSize: 14, color: '#FFFFFF', fontWeight: '800' },
  disabledBtn: { opacity: 0.6 },
});

export default MyBookingsScreen;
