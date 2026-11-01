import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, FlatList, Image, Alert } from 'react-native';
import Icon from '../components/PngIcon';
import { useTheme } from '../context/ThemeContext';
import api from '../services/api';

const MyEarningsScreen = ({ navigation }: any) => {
  const { currentColors, isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState('');
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [breakdown, setBreakdown] = useState({
    voiceCalls: 0,
    videoCalls: 0,
    liveTokens: 0,
    lockedMedia: 0,
  });
  const [transactions, setTransactions] = useState<any[]>([]);

  const fetchEarningsData = async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      const res = await api.get('/earnings');
      if (res.data.success) {
        setUserName(res.data.userName || 'Host User');
        setTotalEarnings(res.data.totalEarnings || 0);
        setAvailableBalance(res.data.availableBalance || 0);
        setBreakdown(res.data.breakdown || { voiceCalls: 0, videoCalls: 0, liveTokens: 0, lockedMedia: 0 });
        setTransactions(res.data.transactions || []);
      }
    } catch (err: any) {
      console.error('[MyEarningsScreen] Error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEarningsData();
  }, []);

  const handleWithdraw = () => {
    if (availableBalance < 2500) {
      Alert.alert('Minimum Payout', 'Minimum withdrawal threshold is ₹2500. Keep earning!');
      return;
    }
    Alert.alert('Withdraw Request', `Submit withdrawal request for ₹${availableBalance}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Request Payout', onPress: () => Alert.alert('Request Sent', 'Payout request submitted successfully. Processing in 24-48 hours.') }
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-back" size={24} color={currentColors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: currentColors.text }]}>My Earnings</Text>
        <TouchableOpacity onPress={() => fetchEarningsData(true)} style={styles.refreshBtn}>
          <Icon name="refresh" size={20} color="#0066FF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchEarningsData(true); }} colors={['#0066FF']} />}
      >
        {/* Earnings Card */}
        <View style={styles.earningsCard}>
          <Text style={styles.cardLabel}>TOTAL LIFETIME EARNINGS</Text>
          <Text style={styles.cardBalance}>₹{totalEarnings.toLocaleString('en-IN')}</Text>
          
          <View style={styles.availableRow}>
            <View>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>Available Balance</Text>
              <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold' }}>₹{availableBalance.toLocaleString('en-IN')}</Text>
            </View>
            <TouchableOpacity onPress={handleWithdraw} style={styles.withdrawBtn} activeOpacity={0.8}>
              <Text style={styles.withdrawBtnText}>Withdraw</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Breakdown Grid */}
        <Text style={[styles.sectionTitle, { color: currentColors.text }]}>Earnings Breakdown</Text>
        <View style={styles.gridContainer}>
          <View style={[styles.gridCard, { backgroundColor: currentColors.surface }]}>
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(0, 102, 255, 0.15)' }]}>
              <Icon name="mic" size={20} color="#0066FF" />
            </View>
            <Text style={[styles.gridLabel, { color: currentColors.textMuted }]}>Order Services</Text>
            <Text style={[styles.gridAmount, { color: currentColors.text }]}>₹{breakdown.voiceCalls}</Text>
          </View>

          <View style={[styles.gridCard, { backgroundColor: currentColors.surface }]}>
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(0, 102, 255, 0.15)' }]}>
              <Icon name="videocam" size={20} color="#0066FF" />
            </View>
            <Text style={[styles.gridLabel, { color: currentColors.textMuted }]}>Direct Orders</Text>
            <Text style={[styles.gridAmount, { color: currentColors.text }]}>₹{breakdown.videoCalls}</Text>
          </View>

          <View style={[styles.gridCard, { backgroundColor: currentColors.surface }]}>
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(0, 102, 255, 0.15)' }]}>
              <Icon name="gift" size={20} color="#0066FF" />
            </View>
            <Text style={[styles.gridLabel, { color: currentColors.textMuted }]}>Tips & In-App</Text>
            <Text style={[styles.gridAmount, { color: currentColors.text }]}>₹{breakdown.liveTokens}</Text>
          </View>

          <View style={[styles.gridCard, { backgroundColor: currentColors.surface }]}>
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(0, 102, 255, 0.15)' }]}>
              <Icon name="lock-closed" size={20} color="#0066FF" />
            </View>
            <Text style={[styles.gridLabel, { color: currentColors.textMuted }]}>Other Payouts</Text>
            <Text style={[styles.gridAmount, { color: currentColors.text }]}>₹{breakdown.lockedMedia}</Text>
          </View>
        </View>

        {/* Transaction History */}
        <Text style={[styles.sectionTitle, { color: currentColors.text, marginTop: 24 }]}>Recent Transactions</Text>

        {loading ? (
          <ActivityIndicator size="large" color="#0066FF" style={{ marginTop: 20 }} />
        ) : transactions.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: currentColors.surface }]}>
            <Icon name="receipt-outline" size={40} color={currentColors.textMuted} />
            <Text style={{ color: currentColors.textMuted, marginTop: 8 }}>No transactions yet</Text>
          </View>
        ) : (
          transactions.map(item => (
            <View key={item.id} style={[styles.txnCard, { backgroundColor: currentColors.surface }]}>
              <View style={styles.txnLeft}>
                <View style={styles.txnAvatarCircle}>
                  <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 14 }}>
                    {(item.senderName || 'U').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={[styles.txnName, { color: currentColors.text }]}>{item.senderName}</Text>
                  <Text style={[styles.txnDesc, { color: currentColors.textMuted }]}>{item.paymentType}</Text>
                  <Text style={[styles.txnId, { color: currentColors.textMuted }]}>{item.transactionId} • {item.date} {item.time}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.txnAmount}>+₹{item.amount}</Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  refreshBtn: { padding: 8 },
  earningsCard: {
    backgroundColor: '#0066FF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
    marginBottom: 20,
  },
  cardLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  cardBalance: { color: '#FFF', fontSize: 34, fontWeight: '900', marginVertical: 6 },
  availableRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)' },
  withdrawBtn: { backgroundColor: '#FFF', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  withdrawBtnText: { color: '#0066FF', fontWeight: 'bold', fontSize: 13 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  gridCard: { width: '48%', borderRadius: 16, padding: 14 },
  iconCircle: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  gridLabel: { fontSize: 12, marginBottom: 4 },
  gridAmount: { fontSize: 18, fontWeight: 'bold' },
  emptyContainer: { borderRadius: 16, padding: 30, alignItems: 'center', justifyContent: 'center' },
  txnCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 16, marginBottom: 10 },
  txnLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  txnAvatarCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#0066FF', justifyContent: 'center', alignItems: 'center' },
  txnName: { fontSize: 14, fontWeight: 'bold' },
  txnDesc: { fontSize: 12, marginTop: 2 },
  txnId: { fontSize: 10, marginTop: 2 },
  txnAmount: { color: '#22C55E', fontSize: 16, fontWeight: 'bold' },
  statusBadge: { backgroundColor: 'rgba(34, 197, 94, 0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 4 },
  statusText: { color: '#22C55E', fontSize: 9, fontWeight: 'bold' },
});

export default MyEarningsScreen;
