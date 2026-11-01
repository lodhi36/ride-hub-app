import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing } from '../theme/colors';
import { PremiumIcons } from '../assets/PremiumIcons';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import AIAgentChatModal from '../components/AIAgentChatModal';

const HelpCenterScreen = ({ navigation }: any) => {
  const { currentColors, isDark } = useTheme();
  const { user } = useAuth();

  const [showAiModal, setShowAiModal] = useState<boolean>(false);
  const [selectedPrompt, setSelectedPrompt] = useState<string>('');
  const [loadingStatus, setLoadingStatus] = useState<boolean>(true);
  const [hasOrders, setHasOrders] = useState<boolean>(false);
  const [latestOrder, setLatestOrder] = useState<any | null>(null);

  // Fetch real customer active order status from backend
  useEffect(() => {
    const fetchCustomerOrderStatus = async () => {
      try {
        setLoadingStatus(true);
        const uId = user?._id || user?.id;
        if (!uId) {
          setHasOrders(false);
          setLatestOrder(null);
          return;
        }

        const inactiveStatuses = [
          'COMPLETED',
          'SERVICE_COMPLETED',
          'DELIVERED',
          'DELIVERED_SUCCESSFULLY',
          'CANCELLED',
          'CANCELLED_BY_CUSTOMER',
          'CANCELLED_BY_SUPPLIER',
          'CANCELLED_BY_PROVIDER',
          'RESTAURANT_DECLINED',
        ];

        // 1. Try dedicated active booking endpoint first
        const activeRes = await api.get(`/bookings/active?customerId=${uId}&userId=${uId}&role=customer`).catch(() => null);
        let active = activeRes?.data?.activeBooking;

        // 2. Fallback check: check latest booking from my-bookings
        if (!active) {
          const myRes = await api.get(`/bookings/my-bookings?userId=${uId}&role=customer&limit=1`).catch(() => null);
          const first = myRes?.data?.bookings?.[0];
          if (first && first.status && !inactiveStatuses.includes(String(first.status).toUpperCase())) {
            active = first;
          }
        }

        if (active && active.status && !inactiveStatuses.includes(String(active.status).toUpperCase())) {
          setHasOrders(true);
          setLatestOrder(active);
        } else {
          setHasOrders(false);
          setLatestOrder(null);
        }
      } catch (err) {
        console.log('[HelpCenterScreen] Error fetching active orders:', err);
        setHasOrders(false);
        setLatestOrder(null);
      } finally {
        setLoadingStatus(false);
      }
    };

    fetchCustomerOrderStatus();
  }, [user]);

  const handleOpenAiWithPrompt = (prompt: string) => {
    setSelectedPrompt(prompt);
    setShowAiModal(true);
  };

  const handleOpenGeneralAi = () => {
    setSelectedPrompt('');
    setShowAiModal(true);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: currentColors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Image source={PremiumIcons.back_arrow} style={{ width: 28, height: 28, tintColor: currentColors.text }} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: currentColors.text }]}>Help Center & Support</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── 1. AI AGENT HERO CARD (Always Primary) ── */}
        <TouchableOpacity
          style={[styles.aiHeroCard, { backgroundColor: isDark ? '#1E293B' : '#EFF6FF', borderColor: '#3B82F6' }]}
          onPress={handleOpenGeneralAi}
          activeOpacity={0.85}
        >
          <View style={styles.aiHeroTop}>
            <View style={styles.aiBadge}>
              <View style={styles.aiGreenDot} />
              <Text style={styles.aiBadgeText}>24/7 SUPPORT AGENT</Text>
            </View>
            <Text style={{ fontSize: 26 }}>🤖</Text>
          </View>

          <Text style={[styles.aiHeroTitle, { color: currentColors.text }]}>
            Chat with Support Agent
          </Text>
          <Text style={[styles.aiHeroSub, { color: currentColors.textMuted }]}>
            {hasOrders
              ? 'Aapke active order, delivery status, aur raddikaran ki real-time sahayata.'
              : 'Naya order lagane, payment, refund policy aur khule hue stores ki live jankari.'}
          </Text>

          <View style={styles.aiHeroBtn}>
            <Text style={styles.aiHeroBtnText}>Start Live Chat (चैट शुरू करें) ➔</Text>
          </View>
        </TouchableOpacity>

        {/* Active Order Snapshot Banner (If Customer Has an Active Order) */}
        {hasOrders && latestOrder && (
          <View style={[styles.orderSnapshotCard, { backgroundColor: isDark ? '#1E293B' : '#F0FDF4', borderColor: isDark ? '#334155' : '#86EFAC', marginTop: 12 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#16A34A', fontSize: 11, fontWeight: '800' }}>📦 CURRENT ACTIVE ORDER</Text>
              <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 11, fontWeight: '700' }}>
                #{String(latestOrder.bookingId || latestOrder._id).slice(-6)}
              </Text>
            </View>
            <Text style={{ color: currentColors.text, fontSize: 15, fontWeight: '800' }}>
              {latestOrder.restaurantName || latestOrder.serviceName || 'Store Order'}
            </Text>
            <Text style={{ color: '#0066FF', fontSize: 12.5, fontWeight: '700', marginTop: 2 }}>
              Status: {latestOrder.status || 'IN_PROGRESS'}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* AI Agent Chat Modal with Auto-Prompt Support */}
      <AIAgentChatModal
        visible={showAiModal}
        onClose={() => {
          setShowAiModal(false);
          setSelectedPrompt('');
        }}
        userRole="customer"
        activeOrder={latestOrder}
        initialPrompt={selectedPrompt}
      />
    </SafeAreaView>
  );
};

export default HelpCenterScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: spacing.xs, marginLeft: -spacing.xs },
  headerTitle: { fontSize: typography.sizes.lg, fontWeight: 'bold' },
  content: { padding: spacing.lg, paddingBottom: 40 },
  aiHeroCard: {
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#0066FF',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
  },
  aiHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 6,
  },
  aiGreenDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#22C55E',
  },
  aiBadgeText: {
    color: '#16A34A',
    fontSize: 10.5,
    fontWeight: '800',
  },
  aiHeroTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  aiHeroSub: {
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 14,
  },
  aiHeroBtn: {
    backgroundColor: '#0066FF',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  aiHeroBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  orderSnapshotCard: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 12,
    marginTop: 4,
  },
  statusOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
  },
  statusOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  statusOptionDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
});
