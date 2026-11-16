import React, { useState, useEffect, useContext, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  AppState,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthContext } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';

export default function SellerPendingApprovalScreen({ route, navigation }: any) {
  const { user: authUser, logout, updateUser } = useContext(AuthContext);
  const insets = useSafeAreaInsets();
  const { socket } = useSocket();

  const [sellerData, setSellerData] = useState<any>(route?.params?.user || authUser || {});
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<string>(
    route?.params?.user?.approvalStatus || authUser?.approvalStatus || 'PENDING'
  );

  const sellerId = sellerData?._id || sellerData?.id || authUser?._id || authUser?.id;

  const isNavigatingRef = useRef(false);

  // Navigate to Supplier Home (RiderHomeScreen) without manual reload or user click
  const navigateToSupplierHome = (userData: any) => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    const sId = userData?._id || userData?.id || sellerId;
    const sName = userData?.restaurantName || userData?.name || 'Store Partner';
    const pType = userData?.partnerType || 'RESTAURANT';
    const bType = userData?.businessType || 'RESTAURANT';

    console.log('🚀 [SELLER AUTO-APPROVAL] Supplier APPROVED! Instant automatic navigation to RiderHomeScreen for:', sName, sId);

    navigation.reset({
      index: 0,
      routes: [
        {
          name: 'RiderHomeScreen',
          params: {
            riderName: sName,
            riderId: sId,
            partnerType: pType,
            businessType: bType,
          },
        },
      ],
    });
  };

  // Verify latest approval status directly from backend (Requirement 2: never navigate solely on unverified socket event)
  const verifyAndNavigate = async (silent = true) => {
    if (isNavigatingRef.current) return;
    try {
      if (!silent) setChecking(true);
      const res = await api.get('/auth/me');
      if (res.data?.success && res.data.user) {
        const user = res.data.user;
        const currentApproval = String(user.approvalStatus || 'PENDING').toUpperCase();
        setStatus(currentApproval);
        setSellerData(user);

        // Update local persistent storage and global context
        await AsyncStorage.setItem('supplierUser', JSON.stringify(user));
        if (updateUser) updateUser(user);

        if (currentApproval === 'APPROVED') {
          console.log('✅ [SELLER PENDING] Backend verified APPROVED status! Auto-navigating immediately...');
          navigateToSupplierHome(user);
        } else if (currentApproval === 'REJECTED') {
          if (!silent) {
            Alert.alert('Notice', 'Your application status is currently marked as Rejected.');
          }
        } else {
          if (!silent) {
            Alert.alert('Status: In Review ⏳', 'Your application is still under review by our Admin team. We appreciate your patience!');
          }
        }
      }
    } catch (err: any) {
      console.log('[SELLER PENDING] Verification check notice:', err?.message || err);
      if (!silent) {
        Alert.alert('Check Failed', 'Could not refresh status. Please check your internet connection.');
      }
    } finally {
      if (!silent) setChecking(false);
    }
  };

  // Load user from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem('supplierUser').then((stored) => {
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setSellerData(parsed);
          if (parsed.approvalStatus) {
            const st = String(parsed.approvalStatus).toUpperCase();
            setStatus(st);
            if (st === 'APPROVED') {
              navigateToSupplierHome(parsed);
            }
          }
        } catch (e) {}
      }
    });
  }, []);

  // Real-time socket listener for instant admin approval (Requirement 2 & 7)
  useEffect(() => {
    if (!socket) return;

    const handleApprovalEvent = async (data: any) => {
      console.log('📡 [SELLER PENDING] Received approval event:', data);
      const incomingId = String(
        data?.supplierId || data?.sellerId || data?.userId || data?.user?._id || data?.user?.id || ''
      );
      const myId = String(sellerId || sellerData?._id || sellerData?.id || authUser?._id || authUser?.id || '');

      // Check if event targets this supplier or is broadcast for this account
      if (!incomingId || !myId || incomingId === myId) {
        const targetStatus = String(data?.approvalStatus || '').toUpperCase();
        if (targetStatus === 'APPROVED' || !targetStatus) {
          // Verify with backend before navigation as per prompt requirement
          await verifyAndNavigate(true);
        } else if (targetStatus === 'REJECTED') {
          setStatus('REJECTED');
        }
      }
    };

    const approvalEvents = [
      'SUPPLIER_APPROVED',
      'supplier_approved',
      'seller_approval_updated',
      'seller_status_updated',
      'approval_status_updated',
      'user_status_changed',
    ];

    approvalEvents.forEach((evt) => socket.on(evt, handleApprovalEvent));

    // If internet disconnected during approval, automatically fetch when socket reconnects
    const handleSocketConnect = () => {
      console.log('🔌 [SELLER PENDING] Socket connected/reconnected. Verifying approval status...');
      verifyAndNavigate(true);
    };
    socket.on('connect', handleSocketConnect);

    return () => {
      approvalEvents.forEach((evt) => socket.off(evt, handleApprovalEvent));
      socket.off('connect', handleSocketConnect);
    };
  }, [socket, sellerId, sellerData, authUser]);

  // AppState Listener: If app was backgrounded or connection dropped, auto-fetch when app resumes (Requirement 2)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        console.log('📱 [SELLER PENDING] App resumed to active. Checking approval status...');
        verifyAndNavigate(true);
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [sellerId]);

  // Background silent polling (every 3.5s) while on this screen
  useEffect(() => {
    verifyAndNavigate(true);

    const interval = setInterval(() => {
      if (!isNavigatingRef.current) {
        verifyAndNavigate(true);
      }
    }, 3500);

    return () => clearInterval(interval);
  }, [sellerId]);

  // Manual Check Status Button
  const handleCheckStatus = () => {
    verifyAndNavigate(false);
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          if (logout) {
            await logout('SUPPLIER');
          } else {
            await AsyncStorage.removeItem('supplierToken');
            await AsyncStorage.removeItem('registeredSupplierId');
            await AsyncStorage.removeItem('activeRole');
            navigation.reset({
              index: 0,
              routes: [{ name: 'RoleSelection' }],
            });
          }
        },
      },
    ]);
  };

  const businessName = sellerData?.restaurantName || sellerData?.name || 'Your Store';
  const category = sellerData?.businessCategoryName || sellerData?.categoryName || 'General Store';
  const partnerId = sellerData?.partnerId || 'PRT-PENDING';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden={false} barStyle="light-content" backgroundColor="#0066FF" />

      <View style={[styles.header, { paddingTop: insets.top + 15 }]}>
        <View style={styles.brandRow}>
          <Text style={styles.rideText}>RIDE</Text>
          <Text style={styles.hubText}>HUB</Text>
        </View>
        <Text style={styles.headerSub}>SELLER PARTNER NETWORK</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.statusCard}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconEmoji}>{status === 'REJECTED' ? '❌' : '⏳'}</Text>
          </View>

          <View style={styles.badgeWrap}>
            <View
              style={[
                styles.statusBadge,
                status === 'REJECTED' ? styles.badgeRejected : styles.badgePending,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  status === 'REJECTED' ? styles.badgeTextRejected : styles.badgeTextPending,
                ]}
              >
                {status === 'REJECTED' ? 'APPLICATION REJECTED' : 'PENDING ADMIN APPROVAL'}
              </Text>
            </View>
          </View>

          <Text style={styles.statusTitle}>
            {status === 'REJECTED'
              ? 'Application Not Approved'
              : 'Application Under Review'}
          </Text>

          <Text style={styles.statusDescription}>
            {status === 'REJECTED'
              ? 'Your store registration has been reviewed and was not approved. Please contact our partner support team for assistance.'
              : 'Thank you for submitting your store application! Our admin verification team is reviewing your business details and documents. Once approved, your store dashboard will activate automatically in real time.'}
          </Text>

          {status !== 'REJECTED' && (
            <View style={styles.liveIndicatorRow}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Live Auto-Approval Enabled • No Reload Needed</Text>
            </View>
          )}
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoSectionTitle}>STORE SUMMARY</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Store Name</Text>
            <Text style={styles.infoValue}>{businessName}</Text>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Business Category</Text>
            <View style={styles.catChip}>
              <Text style={styles.catChipText}>🏷️ {category}</Text>
            </View>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Partner ID</Text>
            <Text style={[styles.infoValue, { color: '#0066FF', fontWeight: '800' }]}>
              {partnerId}
            </Text>
          </View>

          {sellerData?.ownerName ? (
            <>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Owner Name</Text>
                <Text style={styles.infoValue}>{sellerData.ownerName}</Text>
              </View>
            </>
          ) : null}

          {sellerData?.phoneNumber ? (
            <>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Registered Mobile</Text>
                <Text style={styles.infoValue}>+91 {sellerData.phoneNumber}</Text>
              </View>
            </>
          ) : null}

          {sellerData?.fullAddress ? (
            <>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Store Address</Text>
                <Text style={[styles.infoValue, { flex: 1, textAlign: 'right' }]} numberOfLines={2}>
                  {sellerData.fullAddress}
                </Text>
              </View>
            </>
          ) : null}
        </View>

        <View style={styles.actionsWrap}>
          <TouchableOpacity
            style={styles.checkBtn}
            onPress={handleCheckStatus}
            disabled={checking}
            activeOpacity={0.8}
          >
            {checking ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.checkBtnText}>🔄 Check Approval Status</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <Text style={styles.logoutBtnText}>Log Out & Exit</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: '#0066FF',
    paddingVertical: 18,
    alignItems: 'center',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rideText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  hubText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#BFDBFE',
    letterSpacing: 1.5,
  },
  headerSub: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 1.5,
    marginTop: 2,
  },
  scrollContent: {
    padding: 20,
    alignItems: 'center',
  },
  statusCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#BFDBFE',
    marginBottom: 16,
  },
  iconEmoji: {
    fontSize: 38,
  },
  badgeWrap: {
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgePending: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  badgeRejected: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  badgeTextPending: {
    color: '#B45309',
  },
  badgeTextRejected: {
    color: '#B91C1C',
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 10,
  },
  statusDescription: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  liveIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    marginRight: 8,
  },
  liveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  infoCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 24,
  },
  infoSectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#94A3B8',
    letterSpacing: 1,
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  infoDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  catChip: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  catChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0066FF',
  },
  actionsWrap: {
    width: '100%',
    gap: 12,
  },
  checkBtn: {
    width: '100%',
    height: 52,
    backgroundColor: '#0066FF',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  checkBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  logoutBtn: {
    width: '100%',
    height: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  logoutBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
});
