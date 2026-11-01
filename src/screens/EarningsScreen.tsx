import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from '../components/PngIcon';
import { AuthContext } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useAppLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { rideStore } from '../services/rideStore';
import { BASE_URL } from '../config/apiConfig';
import api from '../services/api';

const QUICK_WITHDRAW_AMOUNTS = [100, 250, 500, 1000];

const EarningsScreen = ({ navigation }: any) => {
  const { user } = useContext(AuthContext);
  const { socket } = useSocket();
  const { language, isHindi, t } = useAppLanguage();
  const { isDark, currentColors } = useTheme('supplier');

  const providerId = (user?._id || user?.id || user?.partnerId || rideStore.getRiderId() || '').toString();

  const [filterPeriod, setFilterPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [loading, setLoading] = useState(true);
  const [isCalendarModalVisible, setIsCalendarModalVisible] = useState<boolean>(false);

  // Real Database Earning States
  const [todaysEarnings, setTodaysEarnings] = useState<number>(0);
  const [totalServiceEarnings, setTotalServiceEarnings] = useState<number>(0);
  const [totalEarnings, setTotalEarnings] = useState<number>(0);
  const [totalWithdrawn, setTotalWithdrawn] = useState<number>(0);
  const [pocketBalance, setPocketBalance] = useState<number>(0);
  const [completedServicesCount, setCompletedServicesCount] = useState<number>(0);
  const [averageEarning, setAverageEarning] = useState<number>(0);
  const [earningsList, setEarningsList] = useState<any[]>([]);

  const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [selectedDate, setSelectedDate] = useState<string>('All Time');
  const [calYear, setCalYear] = useState<number>(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState<number>(new Date().getMonth());
  const [isCalendarExpanded, setIsCalendarExpanded] = useState<boolean>(true);

  const handlePrevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear(prev => prev - 1);
    } else {
      setCalMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear(prev => prev + 1);
    } else {
      setCalMonth(prev => prev + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const mm = String(calMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const isoDate = `${calYear}-${mm}-${dd}`;
    setSelectedDate(isoDate);
  };

  const handleQuickFilter = (type: 'all' | 'today' | 'yesterday' | 'this_month') => {
    if (type === 'today') {
      setSelectedDate(todayIso);
      setCalYear(new Date().getFullYear());
      setCalMonth(new Date().getMonth());
    } else if (type === 'yesterday') {
      const yest = new Date();
      yest.setDate(yest.getDate() - 1);
      const yIso = yest.toISOString().split('T')[0];
      setSelectedDate(yIso);
      setCalYear(yest.getFullYear());
      setCalMonth(yest.getMonth());
    } else if (type === 'this_month') {
      const now = new Date();
      setCalYear(now.getFullYear());
      setCalMonth(now.getMonth());
      setSelectedDate('All Time');
    } else {
      setSelectedDate('All Time');
    }
  };

  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDayIndex; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [calYear, calMonth]);

  const earningsDateMap = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    earningsList.forEach((e: any) => {
      const d = e.date ? e.date.split('T')[0] : '';
      if (!d) return;
      const current = map.get(d) || { count: 0, total: 0 };
      map.set(d, {
        count: current.count + 1,
        total: current.total + Number(e.netEarning || e.price || 0),
      });
    });
    return map;
  }, [earningsList]);

  const filteredEarningsList = useMemo(() => {
    const monthPrefix = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
    if (selectedDate === 'All Time' || selectedDate === 'this_month' || selectedDate === 'all') {
      return earningsList.filter(e => {
        const d = e.date ? e.date.split('T')[0] : '';
        return d.startsWith(monthPrefix);
      });
    }
    const targetDate = selectedDate === 'Today' ? todayIso : selectedDate;
    return earningsList.filter(e => {
      const d = e.date ? e.date.split('T')[0] : '';
      return d === targetDate;
    });
  }, [selectedDate, earningsList, todayIso, calYear, calMonth]);

  const filteredTotalEarning = useMemo(() => {
    return filteredEarningsList.reduce((sum: number, e: any) => sum + (e.netEarning || e.price || 0), 0);
  }, [filteredEarningsList]);

  const filteredOrdersCount = filteredEarningsList.length;


  // UPI & Withdrawal Modal States
  const [savedUpiId, setSavedUpiId] = useState<string>('');
  const [upiInput, setUpiInput] = useState<string>('');
  const [isUpiModalVisible, setIsUpiModalVisible] = useState<boolean>(false);
  const [isWithdrawModalVisible, setIsWithdrawModalVisible] = useState<boolean>(false);
  const [withdrawAmountInput, setWithdrawAmountInput] = useState<string>('');
  const [isSubmittingWithdraw, setIsSubmittingWithdraw] = useState<boolean>(false);

  // Load Saved UPI ID from Storage
  useEffect(() => {
    const loadUpi = async () => {
      try {
        const uId = providerId || 'default';
        const upi = await AsyncStorage.getItem(`saved_resto_upi_id_${uId}`);
        if (upi) {
          setSavedUpiId(upi);
          setUpiInput(upi);
        }
      } catch (e) {}
    };
    loadUpi();
  }, [providerId]);

  // Fetch Real Earnings from Backend API
  const fetchEarningsData = useCallback(async () => {
    if (!providerId) return;
    try {
      setLoading(true);
      const cleanBase = BASE_URL.replace(/\/+$/, '');
      const dateParam = (selectedDate && selectedDate !== 'All Time') ? `&date=${encodeURIComponent(selectedDate)}` : '';
      const res = await fetch(`${cleanBase}/bookings/earnings?providerId=${providerId}${dateParam}`);
      const data = await res.json();
      if (data && data.success) {
        setTodaysEarnings(data.todaysEarnings || 0);
        setTotalServiceEarnings(data.totalServiceEarnings || 0);
        setTotalEarnings(data.totalEarnings || 0);
        setTotalWithdrawn(data.totalWithdrawn || 0);
        setPocketBalance(data.pocketBalance !== undefined ? data.pocketBalance : (data.totalEarnings || 0));
        setCompletedServicesCount(data.completedServicesCount || 0);
        setAverageEarning(data.averageEarning || 0);
        setEarningsList(data.earningsList || []);
      }
    } catch (e) {
      console.log('Error fetching earnings:', e);
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    fetchEarningsData();
  }, [fetchEarningsData]);

  // Listen to real-time socket events for completed orders and withdrawals
  useEffect(() => {
    if (!socket) return;
    const onEarningsUpdate = (data: any) => {
      console.log('ðŸ’° [EARNINGS_SCREEN] Real-time earnings update received:', data);
      fetchEarningsData();
    };
    socket.on('earnings_updated', onEarningsUpdate);
    socket.on('service_completed', onEarningsUpdate);
    socket.on('order_status_updated', onEarningsUpdate);
    return () => {
      socket.off('earnings_updated', onEarningsUpdate);
      socket.off('service_completed', onEarningsUpdate);
      socket.off('order_status_updated', onEarningsUpdate);
    };
  }, [socket, fetchEarningsData]);

  // Save UPI ID Handler
  const handleSaveUpi = async () => {
    const trimmed = upiInput.trim();
    if (!trimmed || !trimmed.includes('@')) {
      Alert.alert('Invalid UPI ID', 'Please enter a valid UPI ID (e.g. 9876543210@paytm, resto@okhdfcbank)');
      return;
    }
    try {
      const uId = providerId || 'default';
      await AsyncStorage.setItem(`saved_resto_upi_id_${uId}`, trimmed);
      setSavedUpiId(trimmed);
      setIsUpiModalVisible(false);
      Alert.alert('UPI ID Saved âœ…', `Your payout UPI ID (${trimmed}) has been saved successfully.`);
    } catch (e) {
      Alert.alert('Error', 'Could not save UPI ID.');
    }
  };

  // Submit Withdrawal Request Handler
  const handleConfirmWithdraw = async () => {
    const amt = Number(withdrawAmountInput);
    if (isNaN(amt) || amt < 1) {
      Alert.alert('Invalid Amount', 'Minimum withdrawal amount is â‚¹1.');
      return;
    }
    if (amt > pocketBalance) {
      Alert.alert('Insufficient Balance', `You can withdraw up to â‚¹${pocketBalance} only.`);
      return;
    }
    if (!savedUpiId) {
      Alert.alert('UPI ID Required', 'Please add your UPI ID first before withdrawing.', [
        { text: 'Add UPI ID', onPress: () => { setIsWithdrawModalVisible(false); setIsUpiModalVisible(true); } },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }

    try {
      setIsSubmittingWithdraw(true);
      const res = await api.post('/bookings/withdraw', {
        providerId: providerId,
        userId: providerId,
        withdrawAmount: amt,
        upiId: savedUpiId,
        bankDetails: `UPI ID: ${savedUpiId}`,
      });

      if (res.data?.success) {
        setIsWithdrawModalVisible(false);
        setWithdrawAmountInput('');
        const updatedBal = res.data.pocketBalance !== undefined ? res.data.pocketBalance : (pocketBalance - amt);
        setPocketBalance(updatedBal);
        fetchEarningsData();
        Alert.alert(
          'Withdrawal Request Sent! ðŸ’¸',
          `Withdrawal request for â‚¹${amt} to ${savedUpiId} has been submitted successfully. Admin will review and transfer the amount to your UPI ID.`
        );
      } else {
        Alert.alert('Withdrawal Failed', res.data?.message || 'Could not process withdrawal request.');
      }
    } catch (e: any) {
      console.log('Error submitting withdrawal:', e);
      Alert.alert('Withdrawal Error', e.response?.data?.message || e.message || 'Server error submitting payout request.');
    } finally {
      setIsSubmittingWithdraw(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, isDark && { backgroundColor: '#0B0F19' }]}>
      <StatusBar hidden={false} barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? '#0F172A' : '#FFFFFF'} />

      {/* Header */}
      <View style={[styles.header, isDark && { backgroundColor: '#0F172A', borderBottomColor: '#1E293B' }]}>
        <TouchableOpacity style={[styles.backBtn, isDark && { backgroundColor: '#1E293B' }]} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={22} color={isDark ? '#F8FAFC' : '#0F172A'} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isDark && { color: '#F8FAFC' }]}>
          {isHindi ? 'पार्टनर कमाई और वॉलेट' : 'Partner Earnings & Wallet'}
        </Text>
        <TouchableOpacity style={[styles.backBtn, isDark && { backgroundColor: '#1E293B' }]} onPress={fetchEarningsData}>
          <Icon name="refresh-outline" size={20} color="#0066FF" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* TOTAL WALLET BALANCE CARD (ORANGE THEME) */}
        <View style={styles.totalEarningsCard}>
          <View style={styles.walletHeaderRow}>
            <Text style={styles.totalLabel}>
              {isHindi ? 'उपलब्ध वॉलेट बैलेंस' : 'AVAILABLE WALLET BALANCE'}
            </Text>
            <TouchableOpacity
              style={styles.walletCalendarBtn}
              onPress={() => setIsCalendarModalVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 16 }}>📅</Text>
              <Text style={styles.walletCalendarText}>
                {isHindi ? 'कैलेंडर' : 'Calendar'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.totalValue}>₹{pocketBalance}</Text>
          <Text style={styles.totalSub}>
            {isHindi
              ? `पूर्ण ऑर्डर्स से कमाई: ₹${totalServiceEarnings} • निकाली गई राशि: ₹${totalWithdrawn}`
              : `Earnings from Completed Orders: ₹${totalServiceEarnings} • Withdrawn: ₹${totalWithdrawn}`}
          </Text>

          {/* Action Buttons on Wallet Card */}
          <View style={styles.walletActionsRow}>
            <TouchableOpacity
              style={styles.withdrawMainBtn}
              onPress={() => {
                if (pocketBalance < 1) {
                  Alert.alert(
                    isHindi ? 'कोई बैलेंस नहीं है' : 'No Balance',
                    isHindi
                      ? 'निकासी के लिए कोई बैलेंस उपलब्ध नहीं है। पेआउट बैलेंस अर्जित करने के लिए ऑर्डर पूरे करें!'
                      : 'You currently do not have any available balance to withdraw. Complete orders to earn payout balance!'
                  );
                  return;
                }
                setWithdrawAmountInput(String(pocketBalance));
                setIsWithdrawModalVisible(true);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.withdrawBtnIcon}>⚡</Text>
              <Text style={styles.withdrawMainBtnText}>
                {isHindi ? 'पैसे निकालें' : 'Withdraw Funds'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.upiManageBtn}
              onPress={() => {
                setUpiInput(savedUpiId);
                setIsUpiModalVisible(true);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.upiManageBtnText}>
                {savedUpiId
                  ? (isHindi ? '📱 UPI प्रबंधित करें' : '📱 Manage UPI')
                  : (isHindi ? '➕ UPI आईडी जोड़ें' : '➕ Add UPI ID')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ACTIVE UPI ID INFO BANNER */}
        <View style={styles.upiStatusCard}>
          <View style={styles.upiIconCircle}>
            <Text style={{ fontSize: 18 }}>📱</Text>
          </View>
          <View style={{ flex: 1, marginRight: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.upiStatusLabel}>
                {isHindi ? 'पेआउट UPI आईडी' : 'Payout UPI ID'}
              </Text>
              {savedUpiId ? (
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedText}>
                    {isHindi ? '✓ सक्रिय' : '✓ ACTIVE'}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.upiStatusValue} numberOfLines={1}>
              {savedUpiId || (isHindi ? 'अभी कोई UPI आईडी नहीं जुड़ी है' : 'No UPI ID Added Yet')}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.upiChangeBtn}
            onPress={() => {
              setUpiInput(savedUpiId);
              setIsUpiModalVisible(true);
            }}
            activeOpacity={0.75}
          >
            <Text style={styles.upiChangeBtnText}>
              {savedUpiId ? (isHindi ? 'बदलें' : 'Change') : (isHindi ? 'अभी जोड़ें' : 'Add Now')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Filter Period Selector: Daily | Weekly | Monthly */}
        <View style={styles.filterTabsRow}>
          <TouchableOpacity
            style={[styles.filterTab, filterPeriod === 'daily' && styles.filterTabActive]}
            onPress={() => setFilterPeriod('daily')}
          >
            <Text style={[styles.filterTabText, filterPeriod === 'daily' && styles.filterTabTextActive]}>
              {isHindi ? 'दैनिक' : 'DAILY'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, filterPeriod === 'weekly' && styles.filterTabActive]}
            onPress={() => setFilterPeriod('weekly')}
          >
            <Text style={[styles.filterTabText, filterPeriod === 'weekly' && styles.filterTabTextActive]}>
              {isHindi ? 'साप्ताहिक' : 'WEEKLY'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, filterPeriod === 'monthly' && styles.filterTabActive]}
            onPress={() => setFilterPeriod('monthly')}
          >
            <Text style={[styles.filterTabText, filterPeriod === 'monthly' && styles.filterTabTextActive]}>
              {isHindi ? 'मासिक' : 'MONTHLY'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Summary Grid Cards */}
        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Icon name="cash-check" size={22} color="#0066FF" />
            <Text style={styles.summaryLabel}>
              {isHindi ? 'आज की कमाई' : "Today's Earnings"}
            </Text>
            <Text style={styles.summaryValue}>₹{todaysEarnings}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Icon name="calendar-check" size={22} color="#0066FF" />
            <Text style={styles.summaryLabel}>
              {isHindi ? 'पूर्ण ऑर्डर्स' : 'Completed Orders'}
            </Text>
            <Text style={styles.summaryValue}>{completedServicesCount}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Icon name="calculator" size={22} color="#0066FF" />
            <Text style={styles.summaryLabel}>
              {isHindi ? 'औसत / ऑर्डर' : 'Avg / Order'}
            </Text>
            <Text style={styles.summaryValue}>₹{averageEarning}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Icon name="shield-check" size={22} color="#0066FF" />
            <Text style={styles.summaryLabel}>
              {isHindi ? 'कुल लाइफटाइम' : 'Total Lifetime'}
            </Text>
            <Text style={[styles.summaryValue, { color: '#16A34A' }]}>₹{totalEarnings}</Text>
          </View>
        </View>

        {/* ──── INTERACTIVE EARNINGS CALENDAR CARD ──── */}
        <View style={styles.calendarCard}>
          <View style={styles.calendarHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 20 }}>📅</Text>
              <View>
                <Text style={styles.calendarTitle}>{isHindi ? 'कमाई कैलेंडर' : 'Earnings Calendar'}</Text>
                <Text style={styles.calendarSubTitle}>{isHindi ? 'दैनिक ऑर्डर्स और पेआउट्स देखें' : 'Filter daily orders & payouts'}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.calendarToggleBtn}
              onPress={() => setIsCalendarExpanded(!isCalendarExpanded)}
              activeOpacity={0.7}
            >
              <Text style={styles.calendarToggleText}>
                {isCalendarExpanded
                  ? (isHindi ? 'कैलेंडर छिपाएं ▲' : 'Collapse ▲')
                  : (isHindi ? 'कैलेंडर खोलें ▼' : 'Open Calendar ▼')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Quick Date Filter Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickChipsScroll}>
            <TouchableOpacity
              style={[styles.quickChip, selectedDate === 'All Time' && styles.quickChipActive]}
              onPress={() => handleQuickFilter('all')}
            >
              <Text style={[styles.quickChipText, selectedDate === 'All Time' && styles.quickChipTextActive]}>
                {isHindi ? `पूरा महीना (${MONTH_NAMES[calMonth].slice(0, 3)})` : `All in ${MONTH_NAMES[calMonth].slice(0, 3)}`}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickChip, selectedDate === todayIso && styles.quickChipActive]}
              onPress={() => handleQuickFilter('today')}
            >
              <Text style={[styles.quickChipText, selectedDate === todayIso && styles.quickChipTextActive]}>
                {isHindi ? 'आज' : 'Today'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickChip, selectedDate !== 'All Time' && selectedDate !== todayIso && selectedDate.includes(new Date(Date.now() - 86400000).toISOString().split('T')[0]) && styles.quickChipActive]}
              onPress={() => handleQuickFilter('yesterday')}
            >
              <Text style={[styles.quickChipText, selectedDate !== 'All Time' && selectedDate !== todayIso && selectedDate.includes(new Date(Date.now() - 86400000).toISOString().split('T')[0]) && styles.quickChipTextActive]}>
                {isHindi ? 'कल' : 'Yesterday'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickChip, selectedDate === 'All Time' && calMonth === new Date().getMonth() && calYear === new Date().getFullYear() && styles.quickChipOutline]}
              onPress={() => handleQuickFilter('this_month')}
            >
              <Text style={styles.quickChipText}>
                {isHindi
                  ? `चालू महीना (${MONTH_NAMES[new Date().getMonth()].slice(0, 3)})`
                  : `Current Month (${MONTH_NAMES[new Date().getMonth()].slice(0, 3)})`}
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {isCalendarExpanded && (
            <View style={styles.calendarBody}>
              {/* Month & Year Navigation Header */}
              <View style={styles.monthNavRow}>
                <TouchableOpacity style={styles.monthNavBtn} onPress={handlePrevMonth} activeOpacity={0.7}>
                  <Text style={styles.monthNavBtnText}>◀</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.monthNavLabelBox} activeOpacity={0.7} onPress={() => setSelectedDate('All Time')}>
                  <Text style={styles.monthNavMonthText}>
                    {MONTH_NAMES[calMonth]} {calYear}
                  </Text>
                  <Text style={styles.monthNavHintText}>
                    {isHindi ? 'महीने के सभी ऑर्डर देखने के लिए यहाँ टैप करें' : 'Tap to view all orders for this month'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.monthNavBtn} onPress={handleNextMonth} activeOpacity={0.7}>
                  <Text style={styles.monthNavBtnText}>▶</Text>
                </TouchableOpacity>
              </View>

              {/* Day of Week Labels */}
              <View style={styles.dayOfWeekRow}>
                {DAYS_OF_WEEK.map((d, i) => (
                  <View key={i} style={styles.dayOfWeekCell}>
                    <Text style={[styles.dayOfWeekText, (i === 0 || i === 6) && { color: '#E11D48' }]}>
                      {d}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Calendar Days Matrix */}
              <View style={styles.daysGrid}>
                {calendarDays.map((day, idx) => {
                  if (day === null) {
                    return <View key={`empty-${idx}`} style={styles.dayCell} />;
                  }

                  const mm = String(calMonth + 1).padStart(2, '0');
                  const dd = String(day).padStart(2, '0');
                  const dayIso = `${calYear}-${mm}-${dd}`;
                  const isSelected = selectedDate === dayIso;
                  const isToday = dayIso === todayIso;
                  const dayData = earningsDateMap.get(dayIso);
                  const hasEarnings = !!dayData && dayData.count > 0;

                  return (
                    <TouchableOpacity
                      key={`day-${day}`}
                      style={[
                        styles.dayCell,
                        isToday && styles.dayCellToday,
                        isSelected && styles.dayCellSelected,
                        hasEarnings && !isSelected && styles.dayCellHasEarnings,
                      ]}
                      onPress={() => handleSelectDay(day)}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.dayNumberText,
                          isToday && styles.dayNumberTextToday,
                          isSelected && styles.dayNumberTextSelected,
                          hasEarnings && !isSelected && styles.dayNumberTextHasEarnings,
                        ]}
                      >
                        {day}
                      </Text>

                      {hasEarnings && (
                        <View style={[styles.earningBadgeDot, isSelected && { backgroundColor: '#FFFFFF' }]}>
                          <Text style={[styles.earningBadgeDotText, isSelected && { color: '#0066FF' }]}>
                            ₹{dayData.total > 999 ? `${Math.round(dayData.total / 1000)}k` : dayData.total}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Active Filter Summary Strip */}
          <View style={styles.filterSummaryStrip}>
            <View style={{ flex: 1 }}>
              <Text style={styles.filterSummaryLabel}>
                {selectedDate === 'All Time'
                  ? (isHindi ? 'दिखा रहा है: सभी समय का विवरण' : 'Showing: All Time History')
                  : (isHindi ? `📅 दिनांक: ${selectedDate}` : `📅 Date: ${selectedDate}`)}
              </Text>
              <Text style={styles.filterSummaryValues}>
                {isHindi ? 'कुल कमाई:' : 'Earned:'}{' '}
                <Text style={{ color: '#16A34A', fontWeight: '900' }}>₹{filteredTotalEarning}</Text> • {isHindi ? 'ऑर्डर्स:' : 'Orders:'}{' '}
                <Text style={{ color: '#0F172A', fontWeight: '900' }}>{filteredOrdersCount}</Text>
              </Text>
            </View>

            {selectedDate !== 'All Time' && (
              <TouchableOpacity
                style={styles.clearDateBtn}
                onPress={() => setSelectedDate('All Time')}
                activeOpacity={0.7}
              >
                <Text style={styles.clearDateBtnText}>
                  {isHindi ? 'फ़िल्टर हटाएं ✕' : 'Clear Filter ✕'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Completed Services & Orders Earnings List */}
        <Text style={styles.sectionTitle}>
          {selectedDate === 'All Time'
            ? (isHindi ? 'पूर्ण ऑर्डर्स का विवरण' : 'Completed Orders Breakdown')
            : (isHindi ? `ऑर्डर्स विवरण (${selectedDate})` : `Orders Breakdown (${selectedDate})`)}
        </Text>

        {loading ? (
          <ActivityIndicator size="large" color="#0066FF" style={{ marginVertical: 20 }} />
        ) : filteredEarningsList.length === 0 ? (
          <View style={styles.emptyCard}>
            <Icon name="cash-remove" size={36} color="#94A3B8" />
            <Text style={styles.emptyTitle}>
              {isHindi ? 'कोई पूर्ण ऑर्डर नहीं मिला' : 'No Completed Order Payouts Yet'}
            </Text>
            <Text style={styles.emptySubText}>
              {isHindi
                ? 'इस तारीख के लिए कोई ऑर्डर नहीं है। अपने वॉलेट में पैसे पाने के लिए ग्राहकों के ऑर्डर पूरे करें।'
                : 'Complete customer orders to earn payout amounts credited directly to your wallet.'}
            </Text>
          </View>
        ) : (
          filteredEarningsList.map((item: any, idx: number) => (
            <View key={item.bookingId || idx} style={styles.earningItemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemServiceName}>{item.serviceName || (isHindi ? 'स्टोर ऑर्डर' : 'Food Delivery')}</Text>
                <Text style={styles.itemPrice}>+₹{item.price}</Text>
              </View>
              <Text style={styles.itemAddress}>👤 {item.customerName || (isHindi ? 'ग्राहक' : 'Customer')} • #{String(item.bookingId || '').slice(-6)}</Text>
              <Text style={styles.itemMeta}>📅 {item.date} • {item.time} • {isHindi ? 'स्थिति:' : 'Status:'} {item.status || 'COMPLETED'}</Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* ──── WITHDRAWAL REQUEST MODAL ──── */}
      <Modal visible={isWithdrawModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{isHindi ? 'कमाई निकालें' : 'Withdraw Earnings'}</Text>
                <Text style={styles.modalSubtitle}>
                  {isHindi ? 'पैसे आपकी सुरक्षित UPI आईडी पर भेजे जाएंगे' : 'Funds will be transferred to your saved UPI ID'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsWithdrawModalVisible(false)} style={styles.closeModalBtn}>
                <Text style={{ fontSize: 18, color: '#64748B' }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Current Balance Banner */}
            <View style={styles.modalBalanceBanner}>
              <Text style={styles.modalBalanceLabel}>{isHindi ? 'उपलब्ध बैलेंस' : 'Available Balance'}</Text>
              <Text style={styles.modalBalanceAmount}>₹{pocketBalance}</Text>
            </View>

            {/* Withdrawal Amount Input */}
            <Text style={styles.inputLabel}>{isHindi ? 'निकाली जाने वाली राशि दर्ज करें (₹)' : 'Enter Amount to Withdraw (₹)'}</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="numeric"
              placeholder="e.g. 500"
              placeholderTextColor="#94A3B8"
              value={withdrawAmountInput}
              onChangeText={setWithdrawAmountInput}
            />

            {/* Quick Amount Selection Chips */}
            <View style={styles.quickAmountsRow}>
              {QUICK_WITHDRAW_AMOUNTS.filter((a) => a <= pocketBalance).map((amt) => (
                <TouchableOpacity
                  key={amt}
                  style={styles.quickAmountChip}
                  onPress={() => setWithdrawAmountInput(String(amt))}
                >
                  <Text style={styles.quickAmountText}>₹{amt}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.quickAmountChip, { backgroundColor: '#DBEAFE', borderColor: '#93C5FD' }]}
                onPress={() => setWithdrawAmountInput(String(pocketBalance))}
              >
                <Text style={[styles.quickAmountText, { color: '#0066FF', fontWeight: '800' }]}>
                  {isHindi ? `अधिकतम ₹${pocketBalance}` : `Max ₹${pocketBalance}`}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Payout Destination Info */}
            <View style={styles.payoutDestinationBox}>
              <Text style={styles.payoutDestLabel}>{isHindi ? 'पेआउट UPI आईडी:' : 'Destination UPI ID:'}</Text>
              <Text style={styles.payoutDestValue}>{savedUpiId || (isHindi ? 'कोई UPI आईडी सेव नहीं है' : 'No UPI ID saved')}</Text>
            </View>

            {/* Submit Withdrawal Button */}
            <TouchableOpacity
              style={[styles.confirmWithdrawBtn, isSubmittingWithdraw && { opacity: 0.7 }]}
              onPress={handleConfirmWithdraw}
              disabled={isSubmittingWithdraw}
              activeOpacity={0.85}
            >
              {isSubmittingWithdraw ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.confirmWithdrawBtnText}>
                  {isHindi ? 'अनुरोध भेजें' : 'Confirm & Send Request'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ──── ADD / MANAGE UPI ID MODAL ──── */}
      <Modal visible={isUpiModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{isHindi ? 'UPI आईडी प्रबंधित करें' : 'Manage UPI ID'}</Text>
                <Text style={styles.modalSubtitle}>
                  {isHindi ? 'वह UPI आईडी दर्ज करें जिस पर पेआउट भेजा जाएगा' : 'Enter the UPI ID where payout money will be sent'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsUpiModalVisible(false)} style={styles.closeModalBtn}>
                <Text style={{ fontSize: 18, color: '#64748B' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>{isHindi ? 'UPI पता (VPA)' : 'UPI Address (VPA)'}</Text>
            <TextInput
              style={styles.textInput}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="e.g. mobile@paytm, resto@okhdfcbank"
              placeholderTextColor="#94A3B8"
              value={upiInput}
              onChangeText={setUpiInput}
            />
            <Text style={styles.helperText}>
              {isHindi ? 'समर्थित: PhonePe (@ybl), Google Pay (@okaxis, @okhdfcbank), Paytm (@paytm), BHIM (@upi)' : 'Supported: PhonePe (@ybl), Google Pay (@okaxis, @okhdfcbank), Paytm (@paytm), BHIM (@upi)'}
            </Text>

            <TouchableOpacity
              style={styles.confirmWithdrawBtn}
              onPress={handleSaveUpi}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmWithdrawBtnText}>
                {isHindi ? 'UPI आईडी सुरक्षित करें' : 'Save UPI ID'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ──── DEDICATED CALENDAR POPUP MODAL (Triggered by 📅 on Wallet) ──── */}
      <Modal visible={isCalendarModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdropCenter}>
          <View style={styles.calendarModalBox}>
            <View style={styles.calendarModalHeader}>
              <View>
                <Text style={styles.calendarModalTitle}>
                  {isHindi ? '📅 कमाई कैलेंडर' : '📅 Earnings Calendar'}
                </Text>
                <Text style={styles.calendarModalSub}>
                  {isHindi ? 'किसी भी दिन की कमाई और ऑर्डर्स देखें' : 'View daily earnings & completed orders'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsCalendarModalVisible(false)} style={styles.closeModalBtn}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#64748B' }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Quick Filter Buttons inside Modal */}
            <View style={styles.modalQuickFilterRow}>
              <TouchableOpacity
                style={[styles.modalQuickBtn, selectedDate === 'All Time' && styles.modalQuickBtnActive]}
                onPress={() => { handleQuickFilter('all'); setIsCalendarModalVisible(false); }}
              >
                <Text style={[styles.modalQuickBtnText, selectedDate === 'All Time' && styles.modalQuickBtnTextActive]}>
                  {isHindi ? 'सभी समय' : 'All Time'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalQuickBtn, selectedDate === todayIso && styles.modalQuickBtnActive]}
                onPress={() => { handleQuickFilter('today'); setIsCalendarModalVisible(false); }}
              >
                <Text style={[styles.modalQuickBtnText, selectedDate === todayIso && styles.modalQuickBtnTextActive]}>
                  {isHindi ? 'आज' : 'Today'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalQuickBtn, selectedDate !== 'All Time' && selectedDate !== todayIso && styles.modalQuickBtnActive]}
                onPress={() => { handleQuickFilter('yesterday'); setIsCalendarModalVisible(false); }}
              >
                <Text style={[styles.modalQuickBtnText, selectedDate !== 'All Time' && selectedDate !== todayIso && styles.modalQuickBtnTextActive]}>
                  {isHindi ? 'कल' : 'Yesterday'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Month & Year Navigation */}
            <View style={styles.monthNavRow}>
              <TouchableOpacity style={styles.monthNavBtn} onPress={handlePrevMonth}>
                <Text style={styles.monthNavBtnText}>◀</Text>
              </TouchableOpacity>
              <View style={styles.monthNavLabelBox}>
                <Text style={styles.monthNavMonthText}>
                  {MONTH_NAMES[calMonth]} {calYear}
                </Text>
              </View>
              <TouchableOpacity style={styles.monthNavBtn} onPress={handleNextMonth}>
                <Text style={styles.monthNavBtnText}>▶</Text>
              </TouchableOpacity>
            </View>

            {/* Day of Week Row */}
            <View style={styles.dayOfWeekRow}>
              {DAYS_OF_WEEK.map((d, i) => (
                <View key={i} style={styles.dayOfWeekCell}>
                  <Text style={[styles.dayOfWeekText, (i === 0 || i === 6) && { color: '#E11D48' }]}>
                    {d}
                  </Text>
                </View>
              ))}
            </View>

            {/* Days Grid in Modal */}
            <View style={styles.daysGrid}>
              {calendarDays.map((day, idx) => {
                if (day === null) {
                  return <View key={`m-empty-${idx}`} style={styles.dayCell} />;
                }
                const mm = String(calMonth + 1).padStart(2, '0');
                const dd = String(day).padStart(2, '0');
                const dayIso = `${calYear}-${mm}-${dd}`;
                const isSelected = selectedDate === dayIso;
                const isToday = dayIso === todayIso;
                const dayData = earningsDateMap.get(dayIso);
                const hasEarnings = !!dayData && dayData.count > 0;

                return (
                  <TouchableOpacity
                    key={`m-day-${day}`}
                    style={[
                      styles.dayCell,
                      isToday && styles.dayCellToday,
                      isSelected && styles.dayCellSelected,
                      hasEarnings && !isSelected && styles.dayCellHasEarnings,
                    ]}
                    onPress={() => {
                      handleSelectDay(day);
                      setIsCalendarModalVisible(false);
                    }}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.dayNumberText,
                        isToday && styles.dayNumberTextToday,
                        isSelected && styles.dayNumberTextSelected,
                        hasEarnings && !isSelected && styles.dayNumberTextHasEarnings,
                      ]}
                    >
                      {day}
                    </Text>
                    {hasEarnings && (
                      <View style={[styles.earningBadgeDot, isSelected && { backgroundColor: '#FFFFFF' }]}>
                        <Text style={[styles.earningBadgeDotText, isSelected && { color: '#0066FF' }]}>
                          ₹{dayData.total > 999 ? `${Math.round(dayData.total / 1000)}k` : dayData.total}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.closeCalendarModalBtn}
              onPress={() => setIsCalendarModalVisible(false)}
            >
              <Text style={styles.closeCalendarModalBtnText}>
                {isHindi ? 'पूर्ण / बंद करें' : 'Done / Close'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFBFD',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: '16%',
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  scrollContent: {
    padding: 16,
  },
  bonusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16A34A',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },
  bonusIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  bonusBadgeText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#DCFCE7',
  },
  bonusTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  bonusSubText: {
    fontSize: 11,
    color: '#DCFCE7',
  },
  totalEarningsCard: {
    backgroundColor: '#0066FF',
    borderRadius: 22,
    padding: 20,
    marginBottom: 14,
    elevation: 4,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  walletHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 11,
    color: '#DBEAFE',
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  liveSyncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#86EFAC',
    marginRight: 5,
  },
  liveSyncText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  totalValue: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FFFFFF',
    marginVertical: 4,
  },
  totalSub: {
    fontSize: 11,
    color: '#EFF6FF',
    lineHeight: 15,
    marginBottom: 16,
  },
  walletActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  withdrawMainBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    borderRadius: 14,
    elevation: 2,
  },
  withdrawBtnIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  withdrawMainBtnText: {
    color: '#0066FF',
    fontSize: 14,
    fontWeight: '900',
  },
  upiManageBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  upiManageBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  upiStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
  },
  upiIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  upiStatusLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
  },
  verifiedBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  verifiedText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#166534',
  },
  upiStatusValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  upiChangeBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  upiChangeBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0066FF',
  },
  filterTabsRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  filterTabActive: {
    backgroundColor: '#0066FF',
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  summaryCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 6,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 12,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 8,
  },
  emptySubText: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },
  earningItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemServiceName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: '900',
    color: '#16A34A',
  },
  itemAddress: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 2,
  },
  itemMeta: {
    fontSize: 10.5,
    color: '#94A3B8',
  },

  /* MODAL STYLES */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeModalBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBalanceBanner: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  modalBalanceLabel: {
    fontSize: 11,
    color: '#9A3412',
    fontWeight: '700',
  },
  modalBalanceAmount: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0066FF',
    marginTop: 2,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
  },
  quickAmountsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  quickAmountChip: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  quickAmountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  payoutDestinationBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  payoutDestLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  payoutDestValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  helperText: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 16,
    lineHeight: 16,
  },
  confirmWithdrawBtn: {
    backgroundColor: '#0066FF',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmWithdrawBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },

  /* ──── CALENDAR CARD STYLES ──── */
  calendarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calendarTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  calendarSubTitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  calendarToggleBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  calendarToggleText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0066FF',
  },
  quickChipsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
    marginBottom: 10,
  },
  quickChip: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  quickChipActive: {
    backgroundColor: '#0066FF',
    borderColor: '#0066FF',
  },
  quickChipOutline: {
    borderColor: '#93C5FD',
    backgroundColor: '#F0F9FF',
  },
  quickChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  quickChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  calendarBody: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  monthNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  monthNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  monthNavBtnText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '900',
  },
  monthNavLabelBox: {
    alignItems: 'center',
  },
  monthNavMonthText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  monthNavHintText: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
  },
  dayOfWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  dayOfWeekCell: {
    width: '14.28%',
    alignItems: 'center',
  },
  dayOfWeekText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    marginVertical: 2,
    position: 'relative',
  },
  dayCellToday: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
  },
  dayCellSelected: {
    backgroundColor: '#0066FF',
    borderWidth: 0,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  dayCellHasEarnings: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  dayNumberText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  dayNumberTextToday: {
    color: '#16A34A',
    fontWeight: '900',
  },
  dayNumberTextSelected: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  dayNumberTextHasEarnings: {
    color: '#0066FF',
    fontWeight: '900',
  },
  earningBadgeDot: {
    position: 'absolute',
    bottom: 2,
    backgroundColor: '#0066FF',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  earningBadgeDotText: {
    fontSize: 7.5,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  filterSummaryStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    paddingHorizontal: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterSummaryLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  filterSummaryValues: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  clearDateBtn: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  clearDateBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#DC2626',
  },
  walletCalendarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  walletCalendarIcon: {
    fontSize: 14,
  },
  walletCalendarText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalBackdropCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  calendarModalBox: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 8,
  },
  calendarModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  calendarModalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  calendarModalSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  modalQuickFilterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  modalQuickBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalQuickBtnActive: {
    backgroundColor: '#0066FF',
    borderColor: '#0066FF',
  },
  modalQuickBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  modalQuickBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  closeCalendarModalBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  closeCalendarModalBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
  },
});

export default EarningsScreen;
