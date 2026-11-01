import React, { useState, useEffect, useMemo } from 'react';
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
  KeyboardAvoidingView, 
  Platform, 
  Dimensions, 
  Alert, 
  ActivityIndicator 
} from 'react-native';
import RazorpayCheckout from 'react-native-razorpay';
import CustomerBottomNav from '../components/CustomerBottomNav';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

const { width } = Dimensions.get('window');

const QUICK_AMOUNTS = [100, 200, 500, 1000];
const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WalletScreen = ({ navigation }: any) => {
  const { isDark, currentColors } = useTheme();
  const { user } = useAuth();
  const { socket } = useSocket();

  // Core Balances
  const [balance, setBalance] = useState<number>(0);
  const [totalEarnings, setTotalEarnings] = useState<number>(0);
  const [pendingBalance, setPendingBalance] = useState<number>(0);
  const [totalWithdrawn, setTotalWithdrawn] = useState<number>(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Add Money Modal State
  const [isAddMoneyModalVisible, setIsAddMoneyModalVisible] = useState(false);
  const [amountToAdd, setAmountToAdd] = useState<string>('');

  // Calendar & Date-Wise State
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null); // 'YYYY-MM-DD'
  const [calendarYear, setCalendarYear] = useState<number>(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState<number>(new Date().getMonth()); // 0-indexed

  // Date-wise specific results
  const [selectedDateEarnings, setSelectedDateEarnings] = useState<number>(0);
  const [selectedDateOrdersCount, setSelectedDateOrdersCount] = useState<number>(0);
  const [selectedDateOrders, setSelectedDateOrders] = useState<any[]>([]);

  // Fetch Wallet Data (Optionally by Date)
  const fetchWalletData = async (filterDate?: string | null) => {
    try {
      setLoading(true);
      const url = filterDate 
        ? `/payments/my-earnings?date=${filterDate}`
        : '/payments/my-earnings';

      const res = await api.get(url);
      if (res.data.success) {
        setBalance(res.data.walletBalance || res.data.availableBalance || 0);
        setTotalEarnings(res.data.totalEarnings || res.data.totalEarnedCoins || 0);
        setPendingBalance(res.data.pendingBalance || res.data.pendingSettlement || 0);
        setTotalWithdrawn(res.data.totalWithdrawn || 0);
        setTransactions(res.data.transactions || []);

        if (filterDate) {
          setSelectedDateEarnings(res.data.selectedDateEarnings || 0);
          setSelectedDateOrdersCount(res.data.selectedDateOrdersCount || 0);
          setSelectedDateOrders(res.data.selectedDateOrders || []);
        } else {
          setSelectedDateEarnings(0);
          setSelectedDateOrdersCount(0);
          setSelectedDateOrders([]);
        }
      }
    } catch (err) {
      console.log('Error fetching wallet details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWalletData(selectedDateStr);
  }, [selectedDateStr]);

  // Real-time socket updates: auto-refresh wallet on completion or payout
  useEffect(() => {
    if (!socket) return;
    const handleWalletSync = () => {
      fetchWalletData(selectedDateStr);
    };

    socket.on('wallet_updated', handleWalletSync);
    socket.on('earnings_updated', handleWalletSync);
    socket.on('service_completed', handleWalletSync);
    socket.on('withdrawal_status_updated', handleWalletSync);

    return () => {
      socket.off('wallet_updated', handleWalletSync);
      socket.off('earnings_updated', handleWalletSync);
      socket.off('service_completed', handleWalletSync);
      socket.off('withdrawal_status_updated', handleWalletSync);
    };
  }, [socket, selectedDateStr]);

  const handleQuickAmount = (amt: number) => {
    setAmountToAdd(amt.toString());
  };

  // Calendar Navigation
  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(calendarYear - 1);
    } else {
      setCalendarMonth(calendarMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(calendarYear + 1);
    } else {
      setCalendarMonth(calendarMonth + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const mm = String(calendarMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const isoDate = `${calendarYear}-${mm}-${dd}`;
    setSelectedDateStr(isoDate);
    setIsCalendarVisible(false);
  };

  const handleQuickFilter = (type: 'today' | 'yesterday' | 'all') => {
    if (type === 'today') {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      setSelectedDateStr(`${yyyy}-${mm}-${dd}`);
    } else if (type === 'yesterday') {
      const yest = new Date();
      yest.setDate(yest.getDate() - 1);
      const yyyy = yest.getFullYear();
      const mm = String(yest.getMonth() + 1).padStart(2, '0');
      const dd = String(yest.getDate()).padStart(2, '0');
      setSelectedDateStr(`${yyyy}-${mm}-${dd}`);
    } else {
      setSelectedDateStr(null);
    }
    setIsCalendarVisible(false);
  };

  // Days matrix for the calendar month
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const cells = [];

    // Empty lead cells
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push(null);
    }
    // Days in current month
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(d);
    }
    return cells;
  }, [calendarYear, calendarMonth]);

  const handleProceedToPay = async () => {
    if (!amountToAdd || isNaN(Number(amountToAdd)) || Number(amountToAdd) <= 0) {
      return;
    }
    setIsAddMoneyModalVisible(false);

    try {
      setLoading(true);
      const orderRes = await api.post('/payment/create-order', {
        amount: Number(amountToAdd),
      });

      if (!orderRes.data.success) {
        Alert.alert('Error', 'Failed to initialize payment gateway order');
        return;
      }

      const { orderId, amount, keyId } = orderRes.data;

      const options = {
        description: 'Recharging Ride Hub Wallet credits',
        image: 'https://img.icons8.com/fluency/96/wallet.png',
        currency: 'INR',
        key: keyId,
        amount: amount,
        name: 'Ride Hub Partner Platform',
        order_id: orderId,
        prefill: {
          email: user?.email || 'partner@ridehub.com',
          contact: user?.phoneNumber || user?.phone || '9876543210',
          name: user?.name || 'Ride Hub Partner',
        },
        theme: { color: '#0066FF' },
      };

      RazorpayCheckout.open(options)
        .then(async (data: any) => {
          const verifyRes = await api.post('/payment/verify', {
            orderId: orderId,
            paymentId: data.razorpay_payment_id,
            signature: data.razorpay_signature,
            amount: Number(amountToAdd),
          });

          if (verifyRes.data.success) {
            Alert.alert('Success ✅', 'Wallet recharged successfully!');
            fetchWalletData(selectedDateStr);
          } else {
            Alert.alert('Payment Error', verifyRes.data.message || 'Signature verification failed.');
          }
        })
        .catch((error: any) => {
          console.log('[Razorpay checkout failed/cancelled]', error);
          Alert.alert('Cancelled', 'Payment checkout was cancelled or failed.');
        });
    } catch (err: any) {
      console.log('Payment gateway error:', err);
      Alert.alert(
        'Error',
        err.response?.data?.message || err.message || 'Payment initiation failed.'
      );
    } finally {
      setLoading(false);
      setAmountToAdd('');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]}>
      <StatusBar hidden={false} barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={currentColors.background} />
      
      {/* Header */}
      <View style={[styles.header, { backgroundColor: currentColors.surface, borderBottomColor: currentColors.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: currentColors.text }]}>Supplier Wallet</Text>
          <Text style={[styles.headerSub, { color: currentColors.textMuted }]}>
            {user?.restaurantName ? `${user.restaurantName} • Real-time Earnings` : 'Earnings & Ledger Reconciliation'}
          </Text>
        </View>
        <View style={styles.headerRightActions}>
          <TouchableOpacity 
            style={[styles.calendarIconBtn, selectedDateStr ? styles.calendarIconBtnActive : null]}
            onPress={() => setIsCalendarVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 18 }}>📅</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#0066FF" />
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Main Balance Card */}
        <View style={[styles.balanceCard, { backgroundColor: isDark ? currentColors.surface : '#0F172A', borderColor: currentColors.border, borderWidth: isDark ? 1 : 0 }]}>
          <View style={styles.balanceCardTop}>
            <View>
              <Text style={styles.balanceLabel}>Available For Withdrawal</Text>
              <Text style={[styles.balanceAmount, { color: '#FFFFFF' }]}>₹{balance.toFixed(2)}</Text>
            </View>
            <TouchableOpacity 
              style={styles.calendarMiniPill} 
              onPress={() => setIsCalendarVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 14 }}>📅</Text>
              <Text style={styles.calendarMiniPillText}>
                {selectedDateStr ? selectedDateStr : 'Filter Date'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Quick Metrics Grid */}
          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Lifetime Earnings</Text>
              <Text style={styles.metricValue}>₹{totalEarnings.toFixed(2)}</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Pending Settlement</Text>
              <Text style={[styles.metricValue, { color: '#FCD34D' }]}>₹{pendingBalance.toFixed(2)}</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Total Withdrawn</Text>
              <Text style={styles.metricValue}>₹{totalWithdrawn.toFixed(2)}</Text>
            </View>
          </View>

          <View style={styles.cardActionRow}>
            <TouchableOpacity style={styles.addMoneyCardBtn} onPress={() => setIsAddMoneyModalVisible(true)}>
              <Text style={styles.addMoneyCardBtnText}>+ Recharge Credits</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Selected Date Summary Banner */}
        {selectedDateStr && (
          <View style={styles.dateFilterBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dateBannerTitle}>
                📅 Date-Wise Earnings: <Text style={{ fontWeight: '900' }}>{selectedDateStr}</Text>
              </Text>
              <Text style={styles.dateBannerSub}>
                Eligible Earning: <Text style={{ color: '#16A34A', fontWeight: '800' }}>₹{selectedDateEarnings.toFixed(2)}</Text> • {selectedDateOrdersCount} completed order{selectedDateOrdersCount === 1 ? '' : 's'}
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.clearDateBtn} 
              onPress={() => handleQuickFilter('all')}
            >
              <Text style={styles.clearDateBtnText}>Clear ✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Completed Orders for Selected Date */}
        {selectedDateStr && (
          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionTitle, { color: currentColors.text }]}>
              Completed Orders on {selectedDateStr} ({selectedDateOrders.length})
            </Text>

            {selectedDateOrders.length === 0 ? (
              <View style={styles.emptyStateContainer}>
                <Text style={{ fontSize: 32, marginBottom: 8 }}>📦</Text>
                <Text style={[styles.emptyStateTitle, { color: currentColors.text }]}>No completed orders on this date</Text>
                <Text style={[styles.emptyStateSub, { color: currentColors.textMuted }]}>
                  Orders marked completed on {selectedDateStr} will appear here with full transaction reconciliation.
                </Text>
              </View>
            ) : (
              selectedDateOrders.map((ord) => (
                <View key={ord.bookingId || ord.orderId} style={[styles.orderCard, { backgroundColor: currentColors.surface, borderColor: currentColors.border }]}>
                  <View style={styles.orderCardTop}>
                    <View>
                      <Text style={[styles.orderIdText, { color: currentColors.text }]}>
                        Order #{String(ord.bookingId).slice(-8).toUpperCase()}
                      </Text>
                      <Text style={[styles.orderTimeText, { color: currentColors.textMuted }]}>
                        {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {ord.customerName}
                      </Text>
                    </View>
                    <View style={styles.orderBadge}>
                      <Text style={styles.orderBadgeText}>{ord.status}</Text>
                    </View>
                  </View>

                  <View style={styles.orderCardBottom}>
                    <Text style={[styles.orderDetailText, { color: currentColors.textMuted }]}>
                      Total: ₹{ord.price} • {ord.itemsCount} item{ord.itemsCount === 1 ? '' : 's'}
                    </Text>
                    <Text style={styles.orderEarningText}>
                      Earned: +₹{Number(ord.earnedAmount || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Wallet Transaction Ledger */}
        <View style={styles.sectionContainer}>
          <View style={styles.transactionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: currentColors.text }]}>
              {selectedDateStr ? `Ledger Transactions (${selectedDateStr})` : 'Wallet Transaction Ledger'}
            </Text>
            <TouchableOpacity onPress={() => fetchWalletData(selectedDateStr)}>
              <Text style={styles.seeAllText}>Refresh 🔄</Text>
            </TouchableOpacity>
          </View>

          {transactions.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>💳</Text>
              <Text style={[styles.emptyStateTitle, { color: currentColors.text }]}>
                {selectedDateStr ? `No transactions on ${selectedDateStr}` : 'No transactions recorded yet'}
              </Text>
              <Text style={[styles.emptyStateSub, { color: currentColors.textMuted }]}>
                Real database transactions from completed orders, payouts, and recharges will appear here.
              </Text>
            </View>
          ) : (
            transactions.map((tx) => {
              const isCredit = tx.type === 'service_earning' || tx.type === 'order_earning' || tx.type === 'delivery_earning' || tx.type === 'gift_received' || tx.type === 'coin_purchase';
              let txTitle = 'Order Earning';
              if (tx.type === 'service_earning' || tx.type === 'order_earning') txTitle = 'Store Order Settlement';
              else if (tx.type === 'delivery_earning') txTitle = 'Delivery Fee Earned';
              else if (tx.type === 'withdrawal_payout') txTitle = 'Bank / UPI Withdrawal';
              else if (tx.type === 'coin_purchase') txTitle = 'Wallet Recharge';

              return (
                <View key={tx._id || tx.id} style={[styles.transactionCard, { backgroundColor: currentColors.surface, borderColor: currentColors.border }]}>
                  <View style={styles.txLeft}>
                    <View style={[styles.txIconWrap, { backgroundColor: isCredit ? '#ECFDF5' : '#FFF1F2' }]}>
                      <Text style={{ fontSize: 18 }}>{isCredit ? '📥' : '📤'}</Text>
                    </View>
                    <View style={styles.txDetails}>
                      <Text style={[styles.txTitle, { color: currentColors.text }]}>{txTitle}</Text>
                      <Text style={[styles.txDate, { color: currentColors.textMuted }]}>
                        {new Date(tx.createdAt || tx.date).toLocaleDateString()} • {new Date(tx.createdAt || tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      {tx.description ? (
                        <Text style={[styles.txDesc, { color: currentColors.textMuted }]} numberOfLines={1}>
                          {tx.description}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.txRight}>
                    <Text style={[styles.txAmount, { color: isCredit ? '#16A34A' : '#E11D48' }]}>
                      {isCredit ? '+' : '-'}₹{Math.abs(tx.amount)}
                    </Text>
                    <Text style={[styles.txStatus, { color: tx.status === 'completed' ? '#16A34A' : '#E11D48' }]}>
                      {tx.status}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

      </ScrollView>

      {/* Interactive Calendar Modal (Month & Year Navigation) */}
      <Modal visible={isCalendarVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.calendarModalBox, { backgroundColor: currentColors.surface }]}>
            {/* Modal Header */}
            <View style={styles.calendarModalHeader}>
              <View>
                <Text style={[styles.calendarModalTitle, { color: currentColors.text }]}>Select Date for Earnings</Text>
                <Text style={[styles.calendarModalSub, { color: currentColors.textMuted }]}>View completed orders & daily earnings</Text>
              </View>
              <TouchableOpacity onPress={() => setIsCalendarVisible(false)} style={styles.calendarCloseBtn}>
                <Text style={{ fontSize: 16, fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Quick Filter Buttons */}
            <View style={styles.quickFilterRow}>
              <TouchableOpacity style={styles.quickFilterBtn} onPress={() => handleQuickFilter('today')}>
                <Text style={styles.quickFilterBtnText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickFilterBtn} onPress={() => handleQuickFilter('yesterday')}>
                <Text style={styles.quickFilterBtnText}>Yesterday</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickFilterBtn} onPress={() => handleQuickFilter('all')}>
                <Text style={styles.quickFilterBtnText}>View All</Text>
              </TouchableOpacity>
            </View>

            {/* Month / Year Navigator */}
            <View style={styles.monthNavRow}>
              <TouchableOpacity onPress={handlePrevMonth} style={styles.navArrowBtn}>
                <Text style={styles.navArrowText}>‹</Text>
              </TouchableOpacity>
              <Text style={[styles.monthYearText, { color: currentColors.text }]}>
                {MONTH_NAMES[calendarMonth]} {calendarYear}
              </Text>
              <TouchableOpacity onPress={handleNextMonth} style={styles.navArrowBtn}>
                <Text style={styles.navArrowText}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Day Names Row */}
            <View style={styles.daysHeaderRow}>
              {DAYS_OF_WEEK.map((d, i) => (
                <Text key={i} style={styles.dayColLabel}>{d}</Text>
              ))}
            </View>

            {/* Calendar Days Grid */}
            <View style={styles.daysGrid}>
              {calendarDays.map((day, idx) => {
                if (!day) {
                  return <View key={`empty-${idx}`} style={styles.dayCellEmpty} />;
                }
                const mm = String(calendarMonth + 1).padStart(2, '0');
                const dd = String(day).padStart(2, '0');
                const cellIso = `${calendarYear}-${mm}-${dd}`;
                const isSelected = selectedDateStr === cellIso;
                const isToday = new Date().toISOString().split('T')[0] === cellIso;

                return (
                  <TouchableOpacity
                    key={`day-${day}`}
                    style={[
                      styles.dayCell,
                      isSelected && styles.dayCellSelected,
                      isToday && !isSelected && styles.dayCellToday,
                    ]}
                    onPress={() => handleSelectDay(day)}
                  >
                    <Text style={[
                      styles.dayCellText,
                      isSelected && styles.dayCellTextSelected,
                      isToday && !isSelected && styles.dayCellTextToday,
                    ]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Money Modal */}
      <Modal visible={isAddMoneyModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalBg} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.addMoneyModalContent, { backgroundColor: currentColors.surface }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: currentColors.text }]}>Recharge Wallet Credits</Text>
              <TouchableOpacity onPress={() => setIsAddMoneyModalVisible(false)} style={styles.closeBtn}>
                <Text style={{ fontSize: 16, fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={[styles.currencySymbol, { color: currentColors.text }]}>₹</Text>
              <TextInput
                style={[styles.amountInput, { color: currentColors.text }]}
                keyboardType="numeric"
                value={amountToAdd}
                onChangeText={setAmountToAdd}
                placeholder="0"
                placeholderTextColor={currentColors.placeholder}
                autoFocus
              />
            </View>

            <View style={styles.modalQuickAmounts}>
              {QUICK_AMOUNTS.map((amt) => (
                <TouchableOpacity key={`mod-${amt}`} style={[styles.modalQuickPill, { backgroundColor: isDark ? '#2D3748' : '#EFF6FF', borderColor: currentColors.border }]} onPress={() => handleQuickAmount(amt)}>
                  <Text style={[styles.modalQuickText, { color: isDark ? currentColors.text : '#0066FF' }]}>₹{amt}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity 
              style={[styles.proceedBtn, (!amountToAdd || Number(amountToAdd) <= 0) && styles.proceedBtnDisabled]} 
              onPress={handleProceedToPay}
              disabled={!amountToAdd || Number(amountToAdd) <= 0}
            >
              <Text style={styles.proceedBtnText}>Proceed with Razorpay</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <CustomerBottomNav currentTab="wallet" navigation={navigation} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#0F172A', marginBottom: 2 },
  headerSub: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  headerRightActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  calendarIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  calendarIconBtnActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  loadingOverlay: {
    ...(StyleSheet.absoluteFill as any),
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  scrollContent: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 100 },
  
  balanceCard: {
    backgroundColor: '#0F172A',
    borderRadius: 24,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
    marginBottom: 20,
  },
  balanceCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  balanceLabel: { color: '#94A3B8', fontSize: 13, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  balanceAmount: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', letterSpacing: 0.5 },
  calendarMiniPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  calendarMiniPillText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },

  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 10,
    marginBottom: 18,
  },
  metricItem: { flex: 1, alignItems: 'center' },
  metricDivider: { width: 1, backgroundColor: 'rgba(255, 255, 255, 0.12)' },
  metricLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  metricValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },

  cardActionRow: { flexDirection: 'row', gap: 10 },
  addMoneyCardBtn: {
    flex: 1,
    backgroundColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
  },
  addMoneyCardBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },

  dateFilterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  dateBannerTitle: { fontSize: 13, fontWeight: '700', color: '#1E3A8A', marginBottom: 2 },
  dateBannerSub: { fontSize: 12, color: '#3B82F6', fontWeight: '600' },
  clearDateBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  clearDateBtnText: { fontSize: 11, fontWeight: '800', color: '#1E40AF' },

  sectionContainer: { marginBottom: 28 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: '#0F172A', marginBottom: 14 },

  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  orderCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  orderIdText: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  orderTimeText: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  orderBadge: { backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  orderBadgeText: { fontSize: 10, fontWeight: '800', color: '#059669' },
  orderCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderDetailText: { fontSize: 12, color: '#64748B' },
  orderEarningText: { fontSize: 13, fontWeight: '900', color: '#16A34A' },

  transactionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  seeAllText: { color: '#0066FF', fontWeight: '700', fontSize: 13 },
  
  emptyStateContainer: { alignItems: 'center', backgroundColor: '#FFFFFF', padding: 28, borderRadius: 20, borderWidth: 1, borderColor: '#F1F5F9' },
  emptyStateTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 6 },
  emptyStateSub: { fontSize: 12, color: '#64748B', textAlign: 'center', lineHeight: 18 },

  transactionCard: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  txLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  txIconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  txDetails: { marginLeft: 12, flex: 1 },
  txTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 2 },
  txDate: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  txDesc: { fontSize: 11, color: '#64748B', marginTop: 2 },
  txRight: { alignItems: 'flex-end' },
  txAmount: { fontSize: 15, fontWeight: '900', marginBottom: 2 },
  txStatus: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },

  // Calendar Modal Styles
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.65)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  calendarModalBox: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 10,
  },
  calendarModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  calendarModalTitle: { fontSize: 17, fontWeight: '900', color: '#0F172A' },
  calendarModalSub: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  calendarCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },

  quickFilterRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  quickFilterBtn: { flex: 1, backgroundColor: '#F1F5F9', paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  quickFilterBtnText: { fontSize: 12, fontWeight: '700', color: '#334155' },

  monthNavRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  navArrowBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  navArrowText: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginTop: -2 },
  monthYearText: { fontSize: 15, fontWeight: '900', color: '#0F172A' },

  daysHeaderRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
  dayColLabel: { width: 38, textAlign: 'center', fontSize: 11, fontWeight: '800', color: '#94A3B8' },

  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, justifyContent: 'center', alignItems: 'center', marginVertical: 3, borderRadius: 12 },
  dayCellEmpty: { width: `${100 / 7}%`, aspectRatio: 1 },
  dayCellSelected: { backgroundColor: '#3B82F6' },
  dayCellToday: { borderWidth: 1.5, borderColor: '#3B82F6' },
  dayCellText: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  dayCellTextSelected: { color: '#FFFFFF', fontWeight: '900' },
  dayCellTextToday: { color: '#3B82F6', fontWeight: '900' },

  // Add Money Modal Styles
  modalBg: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  addMoneyModalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  closeBtn: { width: 36, height: 36, backgroundColor: '#F1F5F9', borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, borderColor: '#0066FF', paddingBottom: 8, marginBottom: 24 },
  currencySymbol: { fontSize: 32, fontWeight: '900', color: '#0F172A', marginRight: 8 },
  amountInput: { flex: 1, fontSize: 34, fontWeight: '900', color: '#0F172A', height: 60, padding: 0 },
  modalQuickAmounts: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  modalQuickPill: { flex: 1, backgroundColor: '#F1F5F9', paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginHorizontal: 4 },
  modalQuickText: { color: '#0F172A', fontWeight: '700', fontSize: 14 },
  proceedBtn: { backgroundColor: '#0066FF', height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  proceedBtnDisabled: { backgroundColor: '#E2E8F0' },
  proceedBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});

export default WalletScreen;
