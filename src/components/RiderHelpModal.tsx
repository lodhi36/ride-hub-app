import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  Animated,
  Easing,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useSocket } from '../context/SocketContext';
import { rideStore } from '../services/rideStore';
import SupportChatModal, { SupportTicketData } from './SupportChatModal';
import AIAgentChatModal from './AIAgentChatModal';
import { getRiderTranslation, RIDER_LANGUAGES, RiderLanguage } from '../utils/riderTranslations';

interface PreviousOrder {
  _id?: string;
  bookingId?: string;
  orderRef?: string;
  serviceCategory?: string;
  categoryName?: string;
  restaurantName?: string;
  customerName?: string;
  customerPhone?: string;
  totalAmount?: number;
  deliveryStatus?: string;
  createdAt?: string | Date;
}

interface RiderHelpModalProps {
  visible: boolean;
  onClose: () => void;
  riderUser: any;
  activeOrder?: any;
  onShowIdCard?: () => void;
  onSelectLanguage?: () => void;
  onReportRain?: () => void;
  language?: string;
  isOnline?: boolean;
}

// 12 Interactive Categories matching Help Center (Image 2)
const HELP_CENTER_CATEGORIES = [
  {
    id: 'past_orders',
    key: 'catPastOrders',
    subKey: 'catPastOrdersSub',
    icon: '📦',
    color: '#3B82F6',
    subIssues: [
      { id: 'fare_discrepancy', title: 'Fare / Payout Mismatch' },
      { id: 'penalty_dispute', title: 'Penalty Charged Unfairly' },
      { id: 'customer_marked_undelivered', title: 'Customer Claims Item Not Received' },
      { id: 'damaged_during_transit', title: 'Item Damaged / Spilled During Transit' },
      { id: 'restaurant_packed_wrong', title: 'Restaurant Gave Wrong Packet' },
    ],
  },
  {
    id: 'payout_issue',
    key: 'catPayout',
    subKey: 'catPayoutSub',
    icon: '💰',
    color: '#10B981',
    subIssues: [
      { id: 'payout_delay', title: 'Weekly Payout Not Received' },
      { id: 'tds_deduction', title: 'Incorrect TDS / Deductions' },
      { id: 'bank_account_issue', title: 'Change / Update Bank Account Details' },
      { id: 'surge_pay_missing', title: 'Rain / Peak Surge Pay Missing' },
    ],
  },
  {
    id: 'profile_issue',
    key: 'catProfile',
    subKey: 'catProfileSub',
    icon: '🪪',
    color: '#8B5CF6',
    subIssues: [
      { id: 'change_vehicle_num', title: 'Update Vehicle Number / RC' },
      { id: 'update_phone', title: 'Update Registered Mobile Number' },
      { id: 'dl_renewal', title: 'Driving License (DL) Expiry Renewal' },
      { id: 'zone_change', title: 'Change Preferred Delivery Zone' },
    ],
  },
  {
    id: 'cash_deposit_issue',
    key: 'catCashDeposit',
    subKey: 'catCashDepositSub',
    icon: '💵',
    color: '#F59E0B',
    subIssues: [
      { id: 'cod_deposit_failed', title: 'Cash Deposit at UPI / Store Failed' },
      { id: 'floating_cash_limit', title: 'Increase Floating Cash Limit' },
      { id: 'pocket_deduction_mismatch', title: 'Pocket Balance Deduction Mismatch' },
    ],
  },
  {
    id: 'ev_issue',
    key: 'catEV',
    subKey: 'catEVSub',
    icon: '⚡',
    color: '#06B6D4',
    subIssues: [
      { id: 'battery_swap_station', title: 'Battery Swapping Station Closed / Unavailable' },
      { id: 'ev_breakdown', title: 'EV Breakdown / Low Battery Emergency' },
      { id: 'ev_rental_payout', title: 'EV Rental Deduction Dispute' },
    ],
  },
  {
    id: 'incentive_issue',
    key: 'catIncentives',
    subKey: 'catIncentivesSub',
    icon: '🎁',
    color: '#EC4899',
    subIssues: [
      { id: 'daily_target_missed', title: 'Daily Milestone Target Bonus Not Added' },
      { id: 'weekend_special_bonus', title: 'Weekend Special Bonus Dispute' },
      { id: 'referral_bonus_pending', title: 'Friend Referral Bonus Not Credited' },
    ],
  },
  {
    id: 'uniform_kit_issue',
    key: 'catUniformKit',
    subKey: 'catUniformKitSub',
    icon: '🎽',
    color: '#6366F1',
    subIssues: [
      { id: 'new_bag_request', title: 'Need New / Replacement Delivery Bag' },
      { id: 'tshirt_size_exchange', title: 'Rider T-Shirt Size Exchange' },
      { id: 'raincoat_kit', title: 'Request Monsoon Raincoat Kit' },
    ],
  },
  {
    id: 'app_technical_issue',
    key: 'catApp',
    subKey: 'catAppSub',
    icon: '⚙️',
    color: '#64748B',
    subIssues: [
      { id: 'gps_not_updating', title: 'GPS / Live Location Tracking Error' },
      { id: 'no_orders_received', title: 'Online but Not Receiving Orders' },
      { id: 'app_crashing', title: 'App Freezing or Crashing Frequently' },
      { id: 'sound_notif_issue', title: 'Order Sound / Notifications Not Ringing' },
    ],
  },
  {
    id: 'pan_aadhaar_issue',
    key: 'catPanAadhaar',
    subKey: 'catPanAadhaarSub',
    icon: '📄',
    color: '#14B8A6',
    subIssues: [
      { id: 'pan_aadhaar_link_failed', title: 'PAN-Aadhaar Link Verification Failed' },
      { id: 'name_mismatch_kyc', title: 'Name Mismatch in Aadhaar & Bank' },
      { id: 'kyc_pending_approval', title: 'KYC Document Pending Approval' },
    ],
  },
  {
    id: 'voucher_issue',
    key: 'catVoucher',
    subKey: 'catVoucherSub',
    icon: '🏷️',
    color: '#D97706',
    subIssues: [
      { id: 'petrol_voucher_not_working', title: 'Partner Petrol Pump Voucher Not Working' },
      { id: 'food_discount_voucher', title: 'Rider Food Voucher Code Error' },
      { id: 'service_discount_error', title: 'Bike Service Discount Voucher Issue' },
    ],
  },
  {
    id: 'other_issue',
    key: 'catOther',
    subKey: 'catOtherSub',
    icon: '❓',
    color: '#84CC16',
    subIssues: [
      { id: 'general_inquiry', title: 'General Rider Support Query' },
      { id: 'behavior_report', title: 'Report Store / Customer Misbehavior' },
      { id: 'other_custom', title: 'Other Unlisted Issue' },
    ],
  },
  {
    id: 'insurance_inquiry',
    key: 'catInsurance',
    subKey: 'catInsuranceSub',
    icon: '🛡️',
    color: '#EF4444',
    subIssues: [
      { id: 'accidental_claim', title: 'File Accidental Injury / Hospitalization Claim' },
      { id: 'insurance_policy_copy', title: 'Get Policy Copy & Certificate' },
      { id: 'nominee_update', title: 'Update Insurance Nominee Details' },
    ],
  },
];

const ORDER_SPECIFIC_ISSUES = [
  { id: 'order_payment_discrepancy', title: 'Fare Discrepancy' },
  { id: 'penalty_disputed', title: 'Penalty Dispute' },
  { id: 'store_delay_reported', title: 'Store Delay' },
  { id: 'customer_location_wrong', title: 'Wrong Location / Contact Issue' },
  { id: 'order_damaged_leakage', title: 'Damaged / Leaking Item' },
  { id: 'other_order_issue', title: 'Other Order Issue' },
];

const RIDER_DENIAL_REASONS = [
  { id: 'personal_emergency', title: '🚨 Personal Emergency', desc: 'Urgent personal or family matter' },
  { id: 'bike_problem', title: '🏍️ Bike Breakdown / Issue', desc: 'Puncture, mechanical failure or out of fuel' },
  { id: 'met_accident', title: '🏥 Met With An Accident', desc: 'Road accident or injury' },
  { id: 'long_distance_weather', title: '📍 Long Distance / Severe Weather', desc: 'Route blocked or extreme rainfall' },
  { id: 'customer_contact_issue', title: '📵 Customer Unreachable', desc: 'Customer phone switched off / not answering' },
  { id: 'location_address_issue', title: '🗺️ Wrong Address / Location Issue', desc: 'Incorrect map pin or untraceable address' },
  { id: 'other_denial_reason', title: '❓ Other Reason', desc: 'Unable to deliver due to unforeseen reasons' },
];

export const RiderHelpModal: React.FC<RiderHelpModalProps> = ({
  visible,
  onClose,
  riderUser,
  activeOrder,
  onShowIdCard,
  onSelectLanguage,
  onReportRain,
  language = 'hi',
  isOnline = true,
}) => {
  const navigation = useNavigation<any>();
  const { isDark } = useTheme();
  const { socket } = useSocket();

  const [currentView, setCurrentView] = useState<
    | 'main'
    | 'help_center_categories'
    | 'orders'
    | 'order_detail'
    | 'category_form'
    | 'insurance_detail'
    | 'issue_form'
    | 'waiting_agent'
    | 'agent_accepted'
    | 'tickets_list'
    | 'denial_reasons'
    | 'denial_confirm'
    | 'denial_success'
  >('main');

  const [previousOrders, setPreviousOrders] = useState<PreviousOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PreviousOrder | any | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<any | null>(null);
  const [selectedSubIssue, setSelectedSubIssue] = useState<any | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<any | null>(null);
  const [selectedDenialReason, setSelectedDenialReason] = useState<any | null>(null);
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Active Submitted Ticket & Assigned Agent State
  const [activeWaitingTicket, setActiveWaitingTicket] = useState<any | null>(null);
  const [assignedAgentName, setAssignedAgentName] = useState<string>('');

  // 2-Way Chat Modal State
  const [activeChatTicket, setActiveChatTicket] = useState<SupportTicketData | null>(null);
  const [showChatModal, setShowChatModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [myTickets, setMyTickets] = useState<SupportTicketData[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);

  const riderId = riderUser?._id || riderUser?.id || '';

  // Helper translation function
  const t = (k: string) => getRiderTranslation(language, k);

  // Animations for Support Connecting Waiting Screen
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ring1Scale = useRef(new Animated.Value(1)).current;
  const ring1Opacity = useRef(new Animated.Value(0.7)).current;
  const ring2Scale = useRef(new Animated.Value(1)).current;
  const ring2Opacity = useRef(new Animated.Value(0.7)).current;
  const ring3Scale = useRef(new Animated.Value(1)).current;
  const ring3Opacity = useRef(new Animated.Value(0.7)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const pulseHeadset = useRef(new Animated.Value(1)).current;
  const dotsOpacity = useRef(new Animated.Value(0.3)).current;
  const [cancellingWaitingTicket, setCancellingWaitingTicket] = useState(false);

  useEffect(() => {
    if (currentView === 'waiting_agent') {
      const anim1 = Animated.loop(
        Animated.parallel([
          Animated.timing(ring1Scale, {
            toValue: 2.2,
            duration: 2200,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(ring1Opacity, {
            toValue: 0,
            duration: 2200,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );

      const anim2 = Animated.loop(
        Animated.sequence([
          Animated.delay(600),
          Animated.parallel([
            Animated.timing(ring2Scale, {
              toValue: 2.2,
              duration: 2200,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(ring2Opacity, {
              toValue: 0,
              duration: 2200,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        ])
      );

      const anim3 = Animated.loop(
        Animated.sequence([
          Animated.delay(1200),
          Animated.parallel([
            Animated.timing(ring3Scale, {
              toValue: 2.2,
              duration: 2200,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(ring3Opacity, {
              toValue: 0,
              duration: 2200,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        ])
      );

      const spinLoop = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 3000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );

      const headsetLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseHeadset, {
            toValue: 1.08,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseHeadset, {
            toValue: 1.0,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );

      const dotsLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(dotsOpacity, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(dotsOpacity, {
            toValue: 0.2,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );

      anim1.start();
      anim2.start();
      anim3.start();
      spinLoop.start();
      headsetLoop.start();
      dotsLoop.start();

      return () => {
        anim1.stop();
        anim2.stop();
        anim3.stop();
        spinLoop.stop();
        headsetLoop.stop();
        dotsLoop.stop();
        ring1Scale.setValue(1);
        ring1Opacity.setValue(0.7);
        ring2Scale.setValue(1);
        ring2Opacity.setValue(0.7);
        ring3Scale.setValue(1);
        ring3Opacity.setValue(0.7);
        spinAnim.setValue(0);
        pulseHeadset.setValue(1);
        dotsOpacity.setValue(0.3);
      };
    }
  }, [currentView]);

  // Load Previous Delivered Orders
  const loadPreviousOrders = async () => {
    if (!riderId) return;
    try {
      setLoadingOrders(true);
      const res = await api.get(`/support/previous-orders?role=rider&userId=${riderId}`);
      if (res.data?.success && Array.isArray(res.data.orders)) {
        setPreviousOrders(res.data.orders);
        return;
      }
      // Fallback
      const fallback = await api.get('/bookings/rider-history');
      if (fallback.data?.success && Array.isArray(fallback.data?.rides)) {
        setPreviousOrders(fallback.data.rides);
      }
    } catch (err) {
      console.warn('[RiderHelpModal] Error loading delivered orders:', err);
    } finally {
      setLoadingOrders(false);
    }
  };

  // Load Rider's Open Support Tickets
  const loadMyTickets = async () => {
    if (!riderId) return;
    try {
      setLoadingTickets(true);
      const res = await api.get(`/support/tickets?userId=${riderId}`);
      if (res.data?.success && Array.isArray(res.data?.tickets)) {
        setMyTickets(res.data.tickets);
      }
    } catch (err) {
      console.warn('[RiderHelpModal] Error loading my tickets:', err);
    } finally {
      setLoadingTickets(false);
    }
  };

  useEffect(() => {
    if (visible && riderId) {
      loadPreviousOrders();
      loadMyTickets();
    }
  }, [visible, riderId]);

  // Real-Time Socket.IO Assignment Listener
  useEffect(() => {
    if (!socket || !visible) return;

    const handleTicketAssigned = (payload: any) => {
      const targetTicketId = activeWaitingTicket?.ticketId || activeWaitingTicket?.caseNumber;
      if (targetTicketId && (payload?.ticketId === targetTicketId || payload?.caseNumber === targetTicketId)) {
        const agentName = payload?.assignedAgentName || payload?.ticket?.assignedAgentName || 'Support Agent';
        setAssignedAgentName(agentName);
        setCurrentView('agent_accepted');

        setTimeout(() => {
          const updatedTicket: SupportTicketData = {
            ...(activeWaitingTicket || {}),
            ticketId: targetTicketId,
            assignedAgentName: agentName,
            status: 'IN_PROGRESS',
          };
          setActiveChatTicket(updatedTicket);
          setShowChatModal(true);
          setCurrentView('main');
        }, 2200);
      }
    };

    socket.on('support_ticket_assigned', handleTicketAssigned);
    socket.on('support_ticket_status_changed', handleTicketAssigned);

    return () => {
      socket.off('support_ticket_assigned', handleTicketAssigned);
      socket.off('support_ticket_status_changed', handleTicketAssigned);
    };
  }, [socket, visible, activeWaitingTicket]);

  // Reset view on visibility change
  useEffect(() => {
    if (visible) {
      setCurrentView('main');
      setSelectedOrder(activeOrder || null);
      setSelectedCategory(null);
      setSelectedSubIssue(null);
      setSelectedIssue(null);
      setSelectedDenialReason(null);
      setRemarks('');
      setAssignedAgentName('');
    }
  }, [visible, activeOrder]);

  const handleCategoryClick = (cat: typeof HELP_CENTER_CATEGORIES[0]) => {
    setSelectedCategory(cat);
    if (cat.id === 'past_orders') {
      loadPreviousOrders();
      setCurrentView('orders');
    } else if (cat.id === 'insurance_inquiry') {
      setCurrentView('insurance_detail');
    } else {
      setSelectedSubIssue(cat.subIssues?.[0] || null);
      setCurrentView('category_form');
    }
  };

  const handleSelectOrderIssue = (issue: any, order?: PreviousOrder) => {
    setSelectedIssue(issue);
    if (order) setSelectedOrder(order);
    setCurrentView('issue_form');
  };

  const handleSubmitCategoryTicket = async () => {
    if (!selectedCategory) return;
    setSubmitting(true);
    try {
      const payload = {
        userId: riderId,
        requesterId: riderId,
        userName: riderUser?.name || riderUser?.displayName || 'Delivery Partner',
        requesterName: riderUser?.name || riderUser?.displayName || 'Delivery Partner',
        userRole: 'rider',
        requesterRole: 'rider',
        userPhone: riderUser?.phoneNumber || riderUser?.phone || '',
        requesterPhone: riderUser?.phoneNumber || riderUser?.phone || '',
        category: selectedCategory.key ? t(selectedCategory.key) : selectedCategory.id,
        issueCategory: selectedCategory.key ? t(selectedCategory.key) : selectedCategory.id,
        issueTitle: selectedSubIssue?.title || selectedCategory.key || 'Rider Support Request',
        remarks: remarks.trim() || `Support requested for ${selectedSubIssue?.title || selectedCategory.id}`,
        description: remarks.trim() || `Support requested for ${selectedSubIssue?.title || selectedCategory.id}`,
        source: 'RIDER_HELP_CENTER',
      };

      if (socket && socket.connected) {
        socket.emit('create_support_ticket', payload);
        socket.emit('rider_support_request', payload);
      }

      const res = await api.post('/support/tickets', payload);
      const createdTicket = res.data?.ticket || res.data?.case || {
        ticketId: res.data?.ticketId || ('TKT-' + Math.floor(100000 + Math.random() * 900000)),
        category: payload.category,
        issueTitle: payload.issueTitle,
        status: 'OPEN',
        createdAt: new Date(),
      };
      setActiveWaitingTicket(createdTicket);
      loadMyTickets();
      setCurrentView('waiting_agent');
    } catch (err: any) {
      console.warn('[RiderHelpModal] Ticket submit error fallback:', err?.message);
      const fallbackTicket = {
        ticketId: 'TKT-' + Math.floor(100000 + Math.random() * 900000),
        category: selectedCategory?.id || 'General',
        issueTitle: selectedSubIssue?.title || 'Rider Support Request',
        status: 'OPEN',
        createdAt: new Date(),
      };
      setActiveWaitingTicket(fallbackTicket);
      setCurrentView('waiting_agent');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitOrderTicket = async () => {
    if (!selectedIssue) return;
    setSubmitting(true);
    try {
      const payload = {
        userId: riderId,
        requesterId: riderId,
        userName: riderUser?.name || riderUser?.displayName || 'Delivery Partner',
        requesterName: riderUser?.name || riderUser?.displayName || 'Delivery Partner',
        userRole: 'rider',
        requesterRole: 'rider',
        userPhone: riderUser?.phoneNumber || riderUser?.phone || '',
        requesterPhone: riderUser?.phoneNumber || riderUser?.phone || '',
        orderId: selectedOrder?._id || selectedOrder?.bookingId,
        orderRef: selectedOrder?.bookingId || selectedOrder?._id,
        restaurantName: selectedOrder?.restaurantName || 'Partner Store',
        category: 'Order Issue',
        issueCategory: 'Order Issue',
        issueTitle: selectedIssue.title,
        remarks: remarks.trim() || `Rider reported issue: ${selectedIssue.title}`,
        description: remarks.trim() || `Rider reported issue: ${selectedIssue.title}`,
        source: 'RIDER_HELP_CENTER',
      };

      if (socket && socket.connected) {
        socket.emit('create_support_ticket', payload);
        socket.emit('rider_support_request', payload);
      }

      const res = await api.post('/support/tickets', payload);
      const createdTicket = res.data?.ticket || res.data?.case || {
        ticketId: res.data?.ticketId || ('TKT-' + Math.floor(100000 + Math.random() * 900000)),
        orderRef: selectedOrder?.bookingId || selectedOrder?._id,
        restaurantName: selectedOrder?.restaurantName || 'Partner Store',
        category: 'Order Issue',
        issueTitle: selectedIssue.title,
        status: 'OPEN',
        createdAt: new Date(),
      };
      setActiveWaitingTicket(createdTicket);
      loadMyTickets();
      setCurrentView('waiting_agent');
    } catch (err: any) {
      console.warn('[RiderHelpModal] Order ticket submit error fallback:', err?.message);
      const fallbackTicket = {
        ticketId: 'TKT-' + Math.floor(100000 + Math.random() * 900000),
        orderRef: selectedOrder?.bookingId || selectedOrder?._id,
        restaurantName: selectedOrder?.restaurantName || 'Partner Store',
        category: 'Order Issue',
        issueTitle: selectedIssue.title,
        status: 'OPEN',
        createdAt: new Date(),
      };
      setActiveWaitingTicket(fallbackTicket);
      setCurrentView('waiting_agent');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDenyOrderConfirm = async () => {
    if (!activeOrder || !selectedDenialReason) return;
    setIsTransferring(true);
    try {
      const orderId = activeOrder._id || activeOrder.bookingId;
      await api.post(`/bookings/${orderId}/rider-reject`, {
        reason: selectedDenialReason.title,
        reasonId: selectedDenialReason.id,
        remarks: remarks.trim(),
      });

      try {
        rideStore.clearRide();
        await AsyncStorage.removeItem('active_food_booking_id').catch(() => {});
        await AsyncStorage.removeItem('current_ride_data').catch(() => {});
      } catch (_) {}

      setCurrentView('denial_success');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Could not reject order.');
    } finally {
      setIsTransferring(false);
    }
  };

  const handleFinishDenial = () => {
    onClose();
    navigation.reset({
      index: 0,
      routes: [{ name: 'DeliveryRiderHomeScreen' }],
    });
  };

  const spinRotation = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const openTicketChat = (tkt: SupportTicketData) => {
    setActiveChatTicket(tkt);
    setShowChatModal(true);
  };

  const handleCancelWaitingTicket = () => {
    Alert.alert(
      'Cancel Support Request',
      'Are you sure you want to cancel this support request?',
      [
        { text: 'No, Keep Waiting', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              setCancellingWaitingTicket(true);
              const tId = activeWaitingTicket?.ticketId || activeWaitingTicket?.caseNumber || activeWaitingTicket?._id;
              if (tId) {
                if (socket && socket.connected) {
                  socket.emit('cancel_support_ticket', { ticketId: tId });
                }
                await api.post(`/support/tickets/${tId}/cancel`, {}).catch(() => {});
              }
              setActiveWaitingTicket(null);
              setCurrentView('main');
            } catch (_) {
              setActiveWaitingTicket(null);
              setCurrentView('main');
            } finally {
              setCancellingWaitingTicket(false);
            }
          },
        },
      ]
    );
  };

  const renderHeader = (title: string, onBack?: () => void) => (
    <View style={[styles.headerRow, isDark && { borderBottomColor: '#334155' }]}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, isDark && { color: '#F1F5F9' }]}>←</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ width: 34 }} />
      )}
      <Text style={[styles.headerTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]} numberOfLines={1}>
        {title}
      </Text>
      <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
        <Text style={[styles.closeBtnText, isDark && { color: '#94A3B8' }]}>✕</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <>
      <Modal visible={visible && !showChatModal} animationType="slide" transparent={false} statusBarTranslucent={true} onRequestClose={onClose}>
        <SafeAreaView style={[styles.fullScreenContainer, { backgroundColor: isDark ? '#0B0F19' : '#FFFFFF' }]}>
          <StatusBar
            barStyle={isDark ? 'light-content' : 'dark-content'}
            backgroundColor={isDark ? '#0B0F19' : '#FFFFFF'}
          />
          <View style={[styles.innerContainer, { backgroundColor: isDark ? '#0B0F19' : '#FFFFFF' }]}>
            
            {/* ══════════════════════════════════════════════════════════════════════════
                VIEW 1: MAIN SHEET (Image 1 - "हम आपकी किस तरह से सहायता कर सकते हैं?")
               ══════════════════════════════════════════════════════════════════════════ */}
            {currentView === 'main' && (
              <>
                {renderHeader(t('helpTitle'))}

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                  {/* Active Order Card if currently delivering */}
                  {activeOrder && (
                    <View style={[styles.activeOrderBanner, isDark && { backgroundColor: '#0F172A', borderColor: '#334155' }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={styles.activeOrderTag}>🚨 {t('activeOrder')}</Text>
                        <Text style={styles.activeOrderId}>#{String(activeOrder.bookingId || activeOrder._id).slice(-6)}</Text>
                      </View>
                      <Text style={[styles.activeOrderStore, isDark && { color: '#F8FAFC' }]}>
                        {activeOrder.restaurantName || activeOrder.storeName || 'Partner Store'}
                      </Text>

                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                        <TouchableOpacity
                          style={styles.activeOrderHelpBtn}
                          onPress={() => {
                            setSelectedOrder(activeOrder);
                            setCurrentView('order_detail');
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.activeOrderHelpText}>{t('liveHelp')}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.activeOrderDenyBtn}
                          onPress={() => {
                            setSelectedOrder(activeOrder);
                            setCurrentView('denial_reasons');
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.activeOrderDenyText}>{t('denyOrder')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* 🤖 CHAT WITH AI RIDER ASSISTANT */}
                  <TouchableOpacity
                    style={[styles.menuRow, { backgroundColor: isDark ? 'rgba(0,102,255,0.14)' : '#EFF6FF', borderColor: '#3B82F6', borderWidth: 1 }]}
                    onPress={() => setShowAiModal(true)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.iconWrap, { backgroundColor: '#3B82F6' }]}>
                      <Text style={{ fontSize: 20 }}>🤖</Text>
                    </View>
                    <View style={styles.menuTextCol}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.menuTitle, { color: isDark ? '#FFFFFF' : '#1E40AF', fontWeight: '800' }]}>
                          Chat with Rider AI Assistant
                        </Text>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' }} />
                      </View>
                      <Text style={[styles.menuSub, { color: isDark ? '#93C5FD' : '#3B82F6' }]}>
                        Delivery, route issue, kamai & customer help 24/7
                      </Text>
                    </View>
                    <Text style={[styles.chevron, { color: '#3B82F6', fontWeight: '800' }]}>➔</Text>
                  </TouchableOpacity>

                  <View style={[styles.divider, isDark && { backgroundColor: '#334155' }]} />

                  {/* 1. सहायता केंद्र (Help Center -> Opens Image 2 View) */}
                  <TouchableOpacity
                    style={styles.menuRow}
                    onPress={() => setCurrentView('help_center_categories')}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.iconWrap, { backgroundColor: '#EFF6FF' }]}>
                      <Text style={styles.iconEmoji}>❓</Text>
                    </View>
                    <View style={styles.menuTextCol}>
                      <Text style={[styles.menuTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                        {t('helpCenter')}
                      </Text>
                      <Text style={[styles.menuSub, isDark && { color: '#94A3B8' }]}>
                        {t('helpCenterSub')}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>

                  <View style={[styles.divider, isDark && { backgroundColor: '#334155' }]} />

                  {/* 2. समर्थन टिकट (Support Tickets) */}
                  <TouchableOpacity
                    style={styles.menuRow}
                    onPress={() => {
                      loadMyTickets();
                      setCurrentView('tickets_list');
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.iconWrap, { backgroundColor: '#F0FDF4' }]}>
                      <Text style={styles.iconEmoji}>🎫</Text>
                    </View>
                    <View style={styles.menuTextCol}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.menuTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                          {t('supportTickets')}
                        </Text>
                        {myTickets.length > 0 && (
                          <View style={styles.badgePill}>
                            <Text style={styles.badgePillText}>{myTickets.length}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.menuSub, isDark && { color: '#94A3B8' }]}>
                        {myTickets.length > 0
                          ? `Check status of ${myTickets.length} active/resolved tickets`
                          : t('supportTicketsSub')}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>

                  <View style={[styles.divider, isDark && { backgroundColor: '#334155' }]} />

                  {/* 3. आई.डी कार्ड दिखाएं (Show ID Card) */}
                  <TouchableOpacity
                    style={styles.menuRow}
                    onPress={() => {
                      onClose();
                      if (onShowIdCard) onShowIdCard();
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.iconWrap, { backgroundColor: '#FAF5FF' }]}>
                      <Text style={styles.iconEmoji}>🪪</Text>
                    </View>
                    <View style={styles.menuTextCol}>
                      <Text style={[styles.menuTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                        {t('showIdCard')}
                      </Text>
                      <Text style={[styles.menuSub, isDark && { color: '#94A3B8' }]}>
                        {t('showIdCardSub')}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>

                  <View style={[styles.divider, isDark && { backgroundColor: '#334155' }]} />

                  {/* 4. भाषा बदलें (Change Language) */}
                  <TouchableOpacity
                    style={styles.menuRow}
                    onPress={() => {
                      if (onSelectLanguage) {
                        onSelectLanguage();
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.iconWrap, { backgroundColor: '#FEF3C7' }]}>
                      <Text style={styles.iconEmoji}>🌐</Text>
                    </View>
                    <View style={styles.menuTextCol}>
                      <Text style={[styles.menuTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                        {t('changeLang')}
                      </Text>
                      <Text style={[styles.menuSub, isDark && { color: '#94A3B8' }]}>
                        {t('changeLangSub')}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>

                  <View style={[styles.divider, isDark && { backgroundColor: '#334155' }]} />

                  {/* 5. बारिश रिपोर्ट करें (Report Rain) */}
                  <TouchableOpacity
                    style={styles.menuRow}
                    onPress={() => {
                      if (!isOnline) {
                        Alert.alert('🌧️ Report Rain', t('rainOfflineAlert'));
                        return;
                      }
                      if (onReportRain) {
                        onReportRain();
                      } else {
                        Alert.alert('🌧️ Report Rain', t('rainReportedSuccess'));
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.iconWrap, { backgroundColor: '#E0F2FE' }]}>
                      <Text style={styles.iconEmoji}>🌧️</Text>
                    </View>
                    <View style={styles.menuTextCol}>
                      <Text style={[styles.menuTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                        {t('reportRain')}
                      </Text>
                      <Text style={[styles.menuSub, { color: isOnline ? '#0284C7' : '#94A3B8' }]}>
                        {t('reportRainSub')}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            )}

            {/* ══════════════════════════════════════════════════════════════════════════
                VIEW 2: HELP CENTER CATEGORIES (Image 2 - 12 Interactive Items)
               ══════════════════════════════════════════════════════════════════════════ */}
            {currentView === 'help_center_categories' && (
              <>
                {renderHeader(t('hcHeading'), () => setCurrentView('main'))}

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 }}>
                  <View style={styles.hcSubheaderWrap}>
                    <Text style={[styles.hcSubheadingText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      {t('hcSubheading')}
                    </Text>
                  </View>

                  {HELP_CENTER_CATEGORIES.map((cat, idx) => (
                    <React.Fragment key={cat.id}>
                      <TouchableOpacity
                        style={styles.categoryRow}
                        onPress={() => handleCategoryClick(cat)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.categoryIconCircle, { backgroundColor: isDark ? '#0F172A' : '#F1F5F9' }]}>
                          <Text style={{ fontSize: 18 }}>{cat.icon}</Text>
                        </View>
                        <View style={styles.categoryTextCol}>
                          <Text style={[styles.categoryTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                            {t(cat.key)}
                          </Text>
                          <Text style={[styles.categorySub, { color: isDark ? '#94A3B8' : '#64748B' }]} numberOfLines={1}>
                            {t(cat.subKey)}
                          </Text>
                        </View>
                        <Text style={styles.chevron}>›</Text>
                      </TouchableOpacity>
                      {idx < HELP_CENTER_CATEGORIES.length - 1 && (
                        <View style={[styles.categoryDivider, isDark && { backgroundColor: '#334155' }]} />
                      )}
                    </React.Fragment>
                  ))}
                </ScrollView>
              </>
            )}

            {/* ══════════════════════════════════════════════════════════════════════════
                VIEW 3: PREVIOUS / DELIVERED ORDERS LIST
               ══════════════════════════════════════════════════════════════════════════ */}
            {currentView === 'orders' && (
              <>
                {renderHeader(t('selectOrder'), () => setCurrentView('help_center_categories'))}

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, paddingBottom: 24 }}>
                  {loadingOrders ? (
                    <ActivityIndicator size="small" color="#0066FF" style={{ marginVertical: 30 }} />
                  ) : previousOrders.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Text style={{ fontSize: 36, marginBottom: 10 }}>📦</Text>
                      <Text style={[styles.emptyTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                        {t('noPastOrders')}
                      </Text>
                      <Text style={styles.emptySub}>{t('noPastOrdersSub')}</Text>
                    </View>
                  ) : (
                    previousOrders.map((ord) => (
                      <TouchableOpacity
                        key={ord._id || ord.bookingId}
                        style={[
                          styles.orderCard,
                          { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' },
                        ]}
                        onPress={() => {
                          setSelectedOrder(ord);
                          setCurrentView('order_detail');
                        }}
                        activeOpacity={0.8}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                            <Text style={{ fontSize: 16 }}>🏪</Text>
                            <Text style={[styles.orderStoreName, { color: isDark ? '#F1F5F9' : '#0F172A' }]} numberOfLines={1}>
                              {ord.restaurantName || 'Store Partner'}
                            </Text>
                          </View>
                          <Text style={styles.orderAmount}>₹{ord.totalAmount || 0}</Text>
                        </View>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                          <Text style={styles.orderRefText}>
                            #{String(ord.bookingId || ord._id).slice(-6)} • {ord.categoryName || ord.serviceCategory || 'Delivery'}
                          </Text>
                          <Text style={styles.orderStatusBadge}>
                            {ord.deliveryStatus === 'DELIVERED' ? '✅ Delivered' : (ord.deliveryStatus || 'Completed')}
                          </Text>
                        </View>

                        {ord.createdAt && (
                          <Text style={styles.orderDateText}>
                            📅 {new Date(ord.createdAt).toLocaleDateString('en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        )}
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </>
            )}

            {/* ══════════════════════════════════════════════════════════════════════════
                VIEW 4: ORDER DETAIL & ORDER SPECIFIC ISSUES
               ══════════════════════════════════════════════════════════════════════════ */}
            {currentView === 'order_detail' && selectedOrder && (
              <>
                {renderHeader(
                  `#${String(selectedOrder.bookingId || selectedOrder._id).slice(-6)} ${t('orderHelp')}`,
                  () => setCurrentView('orders')
                )}

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, paddingBottom: 24 }}>
                  <View style={[styles.orderDetailCard, { backgroundColor: isDark ? '#0F172A' : '#EFF6FF' }]}>
                    <Text style={styles.orderDetailHeading}>📦 Order Details</Text>
                    <Text style={[styles.orderDetailStore, { color: isDark ? '#F1F5F9' : '#1E40AF' }]}>
                      {selectedOrder.restaurantName || 'Store Partner'}
                    </Text>
                    <Text style={styles.orderDetailMeta}>
                      Customer: {selectedOrder.customerName || 'Customer'} • Amount: ₹{selectedOrder.totalAmount || 0}
                    </Text>
                  </View>

                  <Text style={[styles.sectionHeader, { color: isDark ? '#94A3B8' : '#64748B', marginTop: 14 }]}>
                    Select an issue related to this order:
                  </Text>

                  {ORDER_SPECIFIC_ISSUES.map((issue) => (
                    <TouchableOpacity
                      key={issue.id}
                      style={styles.topicRow}
                      onPress={() => handleSelectOrderIssue(issue, selectedOrder)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.topicTitle, { color: isDark ? '#F1F5F9' : '#0F172A', flex: 1 }]}>
                        {issue.title}
                      </Text>
                      <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {/* ══════════════════════════════════════════════════════════════════════════
                VIEW 5: CATEGORY TICKET FORM (For 12 Help Center Categories)
               ══════════════════════════════════════════════════════════════════════════ */}
            {currentView === 'category_form' && selectedCategory && (
              <>
                {renderHeader(t(selectedCategory.key), () => setCurrentView('help_center_categories'))}

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, paddingBottom: 24 }}>
                  <View style={[styles.categoryBannerCard, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
                    <Text style={{ fontSize: 24, marginBottom: 4 }}>{selectedCategory.icon}</Text>
                    <Text style={[styles.categoryBannerTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                      {t(selectedCategory.key)}
                    </Text>
                    <Text style={[styles.categoryBannerSub, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      {t(selectedCategory.subKey)}
                    </Text>
                  </View>

                  {selectedCategory.subIssues && selectedCategory.subIssues.length > 0 && (
                    <View style={{ marginBottom: 14 }}>
                      <Text style={[styles.formLabel, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                        Select Specific Issue:
                      </Text>
                      {selectedCategory.subIssues.map((sub: any) => {
                        const isSelected = selectedSubIssue?.id === sub.id;
                        return (
                          <TouchableOpacity
                            key={sub.id}
                            style={[
                              styles.subIssueOption,
                              { backgroundColor: isDark ? '#0F172A' : '#FFFFFF', borderColor: isSelected ? '#0066FF' : isDark ? '#334155' : '#E2E8F0' },
                              isSelected && { backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF' },
                            ]}
                            onPress={() => setSelectedSubIssue(sub)}
                            activeOpacity={0.8}
                          >
                            <Text style={[styles.subIssueOptionText, { color: isSelected ? '#0066FF' : isDark ? '#F1F5F9' : '#0F172A', fontWeight: isSelected ? '800' : '600' }]}>
                              {sub.title}
                            </Text>
                            {isSelected && <Text style={{ color: '#0066FF', fontSize: 16, fontWeight: '800' }}>✓</Text>}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  <Text style={[styles.formLabel, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                    Details / Remarks:
                  </Text>

                  <TextInput
                    style={[
                      styles.remarksInput,
                      {
                        backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                        borderColor: isDark ? '#334155' : '#CBD5E1',
                        color: isDark ? '#F1F5F9' : '#0F172A',
                      },
                    ]}
                    placeholder={t('remarksPlaceholder')}
                    placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                    value={remarks}
                    onChangeText={setRemarks}
                    multiline
                    numberOfLines={4}
                  />

                  <TouchableOpacity
                    style={[styles.submitBtn, { backgroundColor: submitting ? '#94A3B8' : '#0066FF' }]}
                    onPress={handleSubmitCategoryTicket}
                    disabled={submitting}
                    activeOpacity={0.8}
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.submitBtnText}>{t('submitTicket')}</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.directCallBtn}
                    onPress={() => Linking.openURL('tel:18001234567')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.directCallText}>{t('directCall')}</Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            )}

            {/* ══════════════════════════════════════════════════════════════════════════
                VIEW 6: INSURANCE POLICY DETAILS
               ══════════════════════════════════════════════════════════════════════════ */}
            {currentView === 'insurance_detail' && (
              <>
                {renderHeader(t('catInsurance'), () => setCurrentView('help_center_categories'))}

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, paddingBottom: 24 }}>
                  <View style={[styles.insuranceCard, { backgroundColor: isDark ? '#0F172A' : '#FEF2F2', borderColor: '#F87171' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <Text style={{ fontSize: 24 }}>🛡️</Text>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#DC2626' }}>Rider Group Insurance Policy</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#475569', lineHeight: 18 }}>
                      All verified active delivery partners are covered automatically during active duty hours.
                    </Text>

                    <View style={styles.insuranceBenefitBox}>
                      <Text style={styles.insuranceBenefitTitle}>💰 Accidental Death Cover:</Text>
                      <Text style={styles.insuranceBenefitValue}>₹ 10,00,000 (10 Lakhs)</Text>
                    </View>

                    <View style={styles.insuranceBenefitBox}>
                      <Text style={styles.insuranceBenefitTitle}>🏥 Hospitalization & Medical Expense:</Text>
                      <Text style={styles.insuranceBenefitValue}>₹ 1,00,000 (1 Lakh)</Text>
                    </View>

                    <View style={styles.insuranceBenefitBox}>
                      <Text style={styles.insuranceBenefitTitle}>🚑 Emergency Ambulance Coverage:</Text>
                      <Text style={styles.insuranceBenefitValue}>₹ 10,000 (Actuals)</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.submitBtn, { backgroundColor: '#DC2626', marginTop: 14 }]}
                    onPress={() => {
                      setSelectedCategory(HELP_CENTER_CATEGORIES.find((c) => c.id === 'insurance_inquiry'));
                      setSelectedSubIssue({ id: 'accidental_claim', title: 'File Accidental Injury Claim' });
                      setCurrentView('category_form');
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.submitBtnText}>📋 File Insurance Claim Ticket →</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.directCallBtn}
                    onPress={() => Linking.openURL('tel:18001234567')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.directCallText, { color: '#DC2626' }]}>📞 24x7 Insurance Claim Helpline</Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            )}

            {/* ══════════════════════════════════════════════════════════════════════════
                VIEW 7: ORDER ISSUE FORM / SUBMIT ORDER TICKET
               ══════════════════════════════════════════════════════════════════════════ */}
            {currentView === 'issue_form' && selectedIssue && (
              <>
                {renderHeader(selectedIssue.title, () => setCurrentView('order_detail'))}

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, paddingBottom: 24 }}>
                  {selectedOrder && (
                    <View style={[styles.orderSummaryChip, { backgroundColor: isDark ? '#0F172A' : '#EFF6FF' }]}>
                      <Text style={styles.orderSummaryChipText}>
                        📦 Order: #{String(selectedOrder.bookingId || selectedOrder._id).slice(-6)} ({selectedOrder.restaurantName || 'Store'})
                      </Text>
                    </View>
                  )}

                  <Text style={[styles.formLabel, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                    Remarks / Details:
                  </Text>

                  <TextInput
                    style={[
                      styles.remarksInput,
                      {
                        backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                        borderColor: isDark ? '#334155' : '#CBD5E1',
                        color: isDark ? '#F1F5F9' : '#0F172A',
                      },
                    ]}
                    placeholder={t('remarksPlaceholder')}
                    placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                    value={remarks}
                    onChangeText={setRemarks}
                    multiline
                    numberOfLines={4}
                  />

                  <TouchableOpacity
                    style={[styles.submitBtn, { backgroundColor: submitting ? '#94A3B8' : '#0066FF' }]}
                    onPress={handleSubmitOrderTicket}
                    disabled={submitting}
                    activeOpacity={0.8}
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.submitBtnText}>{t('submitTicket')}</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.directCallBtn}
                    onPress={() => Linking.openURL('tel:18001234567')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.directCallText}>{t('directCall')}</Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            )}

            {/* ══════════════════════════════════════════════════════════════════════════
                VIEW 8: MY TICKETS LIST
               ══════════════════════════════════════════════════════════════════════════ */}
            {currentView === 'tickets_list' && (
              <>
                {renderHeader(t('supportTickets'), () => setCurrentView('main'))}

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, paddingBottom: 24 }}>
                  {loadingTickets ? (
                    <ActivityIndicator size="small" color="#0066FF" style={{ marginVertical: 30 }} />
                  ) : myTickets.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Text style={{ fontSize: 36, marginBottom: 10 }}>🎫</Text>
                      <Text style={[styles.emptyTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                        No Support Tickets
                      </Text>
                      <Text style={styles.emptySub}>
                        Any support ticket you raise will appear here with real-time status.
                      </Text>
                    </View>
                  ) : (
                    myTickets.map((tkt: any) => (
                      <TouchableOpacity
                        key={tkt.ticketId || tkt._id}
                        style={[
                          styles.ticketCard,
                          { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' },
                        ]}
                        onPress={() => openTicketChat(tkt)}
                        activeOpacity={0.8}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={styles.ticketIdText}>#{tkt.ticketId || tkt.caseNumber}</Text>
                          <View
                            style={[
                              styles.ticketStatusPill,
                              { backgroundColor: tkt.status === 'RESOLVED' || tkt.status === 'CLOSED' ? '#DEF7EC' : '#EFF6FF' },
                            ]}
                          >
                            <Text
                              style={[
                                styles.ticketStatusText,
                                { color: tkt.status === 'RESOLVED' || tkt.status === 'CLOSED' ? '#03543F' : '#1E40AF' },
                              ]}
                            >
                              {tkt.status || 'OPEN'}
                            </Text>
                          </View>
                        </View>

                        <Text style={[styles.ticketTitleText, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                          {tkt.issueTitle || tkt.category || 'Support Ticket'}
                        </Text>

                        {tkt.assignedAgentName && (
                          <Text style={styles.ticketAgentText}>
                            🎧 Agent: {tkt.assignedAgentName}
                          </Text>
                        )}

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                          <Text style={styles.ticketDateText}>
                            {tkt.createdAt ? new Date(tkt.createdAt).toLocaleDateString() : 'Recent'}
                          </Text>
                          <Text style={{ color: '#0066FF', fontWeight: '700', fontSize: 12 }}>Open Chat 💬 →</Text>
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </>
            )}

            {/* ══════════════════════════════════════════════════════════════════════════
                VIEW 9: WAITING FOR AGENT (ANIMATED RADAR & CONCENTRIC WAVES)
               ══════════════════════════════════════════════════════════════════════════ */}
            {currentView === 'waiting_agent' && (
              <View style={{ flex: 1 }}>
                {/* Custom Header for Support Request */}
                <View style={[styles.supportHeaderRow, { borderBottomColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                  <TouchableOpacity onPress={() => setCurrentView('main')} style={styles.backBtn} activeOpacity={0.7}>
                    <Text style={[styles.backBtnText, isDark && { color: '#F1F5F9' }]}>←</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.supportHeaderTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                      Support Request
                    </Text>
                    <Text style={styles.supportHeaderSubtitle}>
                      Connecting you with a Support Agent
                    </Text>
                  </View>
                  <View style={styles.supportHeaderRightIcon}>
                    <Text style={{ fontSize: 18 }}>🎧</Text>
                  </View>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.supportScrollContent}
                >
                  {/* Top Animated Concentric Wave Rings & Headset Badge */}
                  <View style={styles.heroAnimSection}>
                    <View style={styles.concentricWavesWrap}>
                      <Animated.View
                        style={[
                          styles.concentricWaveRing,
                          {
                            transform: [{ scale: ring1Scale }],
                            opacity: ring1Opacity,
                            borderColor: '#0066FF',
                          },
                        ]}
                      />
                      <Animated.View
                        style={[
                          styles.concentricWaveRing,
                          {
                            transform: [{ scale: ring2Scale }],
                            opacity: ring2Opacity,
                            borderColor: '#38BDF8',
                          },
                        ]}
                      />
                      <Animated.View
                        style={[
                          styles.concentricWaveRing,
                          {
                            transform: [{ scale: ring3Scale }],
                            opacity: ring3Opacity,
                            borderColor: '#60A5FA',
                          },
                        ]}
                      />

                      {/* Center Glowing Headset Badge */}
                      <Animated.View
                        style={[
                          styles.headsetCenterGlowBadge,
                          {
                            transform: [{ scale: pulseHeadset }],
                            backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                          },
                        ]}
                      >
                        <View style={styles.headsetInnerCircleBadge}>
                          <Text style={{ fontSize: 44 }}>🎧</Text>
                        </View>
                      </Animated.View>
                    </View>

                    <Text style={[styles.connectingTitleText, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                      Connecting with Support Agent...
                    </Text>
                    <Text style={styles.connectingSubText}>
                      Please wait. Our support team is reviewing your request and will connect with you shortly.
                    </Text>
                  </View>

                  {/* Ticket Details Card */}
                  <View
                    style={[
                      styles.supportTicketCard,
                      {
                        backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                        borderColor: isDark ? '#334155' : '#E2E8F0',
                      },
                    ]}
                  >
                    <View style={styles.supportTicketCardLeft}>
                      <View style={styles.supportTicketIconWrap}>
                        <Text style={{ fontSize: 20 }}>📄</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.supportTicketLabel}>Ticket ID</Text>
                        <Text style={[styles.supportTicketValue, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                          {activeWaitingTicket?.ticketId || activeWaitingTicket?.caseNumber || (activeWaitingTicket?._id ? `TKT-${String(activeWaitingTicket._id).slice(-6).toUpperCase()}` : 'TKT-439625')}
                        </Text>
                        <Text style={[styles.supportTicketLabel, { marginTop: 6 }]}>Issue</Text>
                        <Text style={[styles.supportTicketValue, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                          {activeWaitingTicket?.issueTitle || activeWaitingTicket?.category || selectedSubIssue?.title || selectedIssue?.title || 'Fare Discrepancy'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.supportStatusPill}>
                      <View style={styles.supportStatusDot} />
                      <Text style={styles.supportStatusText}>
                        {activeWaitingTicket?.status ? activeWaitingTicket.status.toUpperCase() : 'OPEN • WAITING'}
                      </Text>
                    </View>
                  </View>

                  {/* Live Agent Finder Card with Animated Rotating Spinner */}
                  <View
                    style={[
                      styles.agentFinderBox,
                      {
                        backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                        borderColor: isDark ? '#334155' : '#E2E8F0',
                      },
                    ]}
                  >
                    <View style={styles.finderSpinnerContainer}>
                      {/* Rotating Outer Ring */}
                      <Animated.View
                        style={[
                          styles.finderSpinRing,
                          {
                            transform: [{ rotate: spinRotation }],
                          },
                        ]}
                      >
                        <View style={styles.finderSpinDash} />
                      </Animated.View>

                      {/* Headset with animated dots */}
                      <View style={styles.finderCenterRow}>
                        <Animated.Text style={[styles.finderPulseDots, { opacity: dotsOpacity }]}>••</Animated.Text>
                        <Text style={{ fontSize: 24 }}>🎧</Text>
                        <Animated.Text style={[styles.finderPulseDots, { opacity: dotsOpacity }]}>••</Animated.Text>
                      </View>
                    </View>

                    <Text style={[styles.finderBoxTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                      Finding an available support agent...
                    </Text>
                    <Text style={styles.finderBoxSub}>
                      You'll be connected shortly.
                    </Text>
                  </View>

                  {/* Info Notice Banner */}
                  <View
                    style={[
                      styles.supportInfoNotice,
                      {
                        backgroundColor: isDark ? '#0F172A' : '#EFF6FF',
                        borderColor: isDark ? '#1E3A8A' : '#BFDBFE',
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 16, marginRight: 10 }}>ℹ️</Text>
                    <Text style={[styles.supportInfoNoticeText, { color: isDark ? '#93C5FD' : '#1E40AF' }]}>
                      Please keep this screen open. Our support team is working on your request.
                    </Text>
                  </View>
                </ScrollView>

                {/* Bottom Action Buttons */}
                <View style={[styles.supportFooterActions, { backgroundColor: isDark ? '#0B0F19' : '#FFFFFF', borderTopColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                  <TouchableOpacity
                    style={styles.supportHomeBtn}
                    onPress={() => setCurrentView('main')}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.supportHomeBtnText}>🏠 Back to Home</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.supportCancelBtn,
                      {
                        backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                        borderColor: isDark ? '#334155' : '#CBD5E1',
                      },
                    ]}
                    onPress={handleCancelWaitingTicket}
                    disabled={cancellingWaitingTicket}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.supportCancelBtnText, { color: isDark ? '#94A3B8' : '#475569' }]}>
                      ✕ Cancel Request
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ══════════════════════════════════════════════════════════════════════════
                VIEW 10: AGENT ACCEPTED STATE
               ══════════════════════════════════════════════════════════════════════════ */}
            {currentView === 'agent_accepted' && (
              <View style={styles.waitingContainer}>
                <View style={styles.acceptedIconWrap}>
                  <Text style={{ fontSize: 40 }}>✅</Text>
                </View>

                <Text style={[styles.acceptedTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                  Support Agent Connected
                </Text>
                <Text style={styles.acceptedAgentName}>
                  {assignedAgentName || 'Support Agent'}
                </Text>
                <Text style={styles.acceptedSub}>
                  Your support request has been accepted.
                </Text>

                <View style={[styles.acceptedPill, { backgroundColor: '#EFF6FF' }]}>
                  <Text style={styles.acceptedPillText}>💬 Live chat starting...</Text>
                </View>
              </View>
            )}

            {/* ══════════════════════════════════════════════════════════════════════════
                VIEW 11: DENIAL REASONS LIST
               ══════════════════════════════════════════════════════════════════════════ */}
            {currentView === 'denial_reasons' && (
              <>
                {renderHeader('Select Denial Reason', () => setCurrentView('main'))}

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, paddingBottom: 24 }}>
                  <View style={[styles.denialHeaderBox, { backgroundColor: isDark ? '#0F172A' : '#EFF6FF' }]}>
                    <Text style={styles.denialHeaderTitle}>Why are you unable to deliver this order?</Text>
                    <Text style={styles.denialHeaderSub}>Please select an authentic reason to prevent assignment penalty.</Text>
                  </View>

                  {RIDER_DENIAL_REASONS.map((r) => (
                    <TouchableOpacity
                      key={r.id}
                      style={[styles.denialReasonCard, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' }]}
                      onPress={() => {
                        setSelectedDenialReason(r);
                        setCurrentView('denial_confirm');
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.denialReasonTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>{r.title}</Text>
                        <Text style={styles.denialReasonSub}>{r.desc}</Text>
                      </View>
                      <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {/* ══════════════════════════════════════════════════════════════════════════
                VIEW 12: CONFIRM DENIAL SCREEN
               ══════════════════════════════════════════════════════════════════════════ */}
            {currentView === 'denial_confirm' && selectedDenialReason && (
              <>
                {renderHeader('Confirm Rejection', () => setCurrentView('denial_reasons'))}

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, paddingBottom: 24 }}>
                  <View style={[styles.denialConfirmBox, { backgroundColor: isDark ? '#0F172A' : '#EFF6FF' }]}>
                    <Text style={styles.denialConfirmTag}>REJECTING ACTIVE ORDER</Text>
                    <Text style={[styles.denialConfirmStore, { color: isDark ? '#F1F5F9' : '#1E40AF' }]}>
                      {activeOrder?.restaurantName || 'Partner Store'}
                    </Text>
                    <Text style={styles.denialConfirmMeta}>
                      Reason: <Text style={{ fontWeight: '700' }}>{selectedDenialReason.title}</Text>
                    </Text>
                  </View>

                  <TextInput
                    style={[
                      styles.remarksInput,
                      {
                        backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                        borderColor: isDark ? '#334155' : '#CBD5E1',
                        color: isDark ? '#F1F5F9' : '#0F172A',
                      },
                    ]}
                    placeholder="Provide additional details regarding rejection (optional)..."
                    placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                    value={remarks}
                    onChangeText={setRemarks}
                    multiline
                    numberOfLines={3}
                  />

                  <TouchableOpacity
                    style={[styles.confirmDenyBtn, { backgroundColor: isTransferring ? '#94A3B8' : '#DC2626' }]}
                    onPress={handleDenyOrderConfirm}
                    disabled={isTransferring}
                    activeOpacity={0.8}
                  >
                    {isTransferring ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.confirmDenyBtnText}>Confirm Order Rejection</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.cancelDenyBtn, { marginTop: 10 }]}
                    onPress={() => setCurrentView('main')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.cancelDenyBtnText}>Cancel & Continue Delivering</Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            )}

            {/* ══════════════════════════════════════════════════════════════════════════
                VIEW 13: DENIAL SUCCESS
               ══════════════════════════════════════════════════════════════════════════ */}
            {currentView === 'denial_success' && (
              <View style={styles.waitingContainer}>
                <View style={[styles.acceptedIconWrap, { borderColor: '#10B981' }]}>
                  <Text style={{ fontSize: 40 }}>✅</Text>
                </View>

                <Text style={[styles.acceptedTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                  Order Rejected
                </Text>
                <Text style={styles.acceptedSub}>
                  The order has been unassigned and returned to the pool.
                </Text>

                <TouchableOpacity
                  style={[styles.submitBtn, { marginTop: 24, width: '100%' }]}
                  onPress={handleFinishDenial}
                  activeOpacity={0.8}
                >
                  <Text style={styles.submitBtnText}>Back to Home</Text>
                </TouchableOpacity>
              </View>
            )}

          </View>
        </SafeAreaView>
      </Modal>

      {/* Real-time 2-Way Chat Modal with Support Agent */}
      {activeChatTicket && (
        <SupportChatModal
          visible={showChatModal}
          onClose={() => {
            setShowChatModal(false);
            setActiveChatTicket(null);
          }}
          ticket={activeChatTicket}
          currentUser={riderUser}
          userRole="rider"
        />
      )}

      {/* ── 24/7 AI Rider Assistant Chat Modal ── */}
      <AIAgentChatModal
        visible={showAiModal}
        onClose={() => setShowAiModal(false)}
        userRole="rider"
        activeOrder={activeOrder}
      />
    </>
  );
};

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
  },
  innerContainer: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 14 : 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
    textAlign: 'center',
  },
  backBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
  },
  closeBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#64748B',
  },
  activeOrderBanner: {
    margin: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  activeOrderTag: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0066FF',
    textTransform: 'uppercase',
  },
  activeOrderId: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  activeOrderStore: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 4,
  },
  activeOrderHelpBtn: {
    flex: 1,
    backgroundColor: '#0066FF',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  activeOrderHelpText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  activeOrderDenyBtn: {
    flex: 1,
    backgroundColor: '#DC2626',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  activeOrderDenyText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  iconEmoji: {
    fontSize: 22,
  },
  menuTextCol: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  menuSub: {
    fontSize: 12,
    color: '#64748B',
  },
  chevron: {
    fontSize: 22,
    color: '#94A3B8',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginLeft: 74,
  },
  badgePill: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 10,
  },
  badgePillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  hcSubheaderWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'transparent',
  },
  hcSubheadingText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  categoryIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  categoryTextCol: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  categorySub: {
    fontSize: 11.5,
  },
  categoryDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginLeft: 68,
  },
  categoryBannerCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    alignItems: 'center',
  },
  categoryBannerTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
    marginBottom: 2,
  },
  categoryBannerSub: {
    fontSize: 12,
    textAlign: 'center',
  },
  subIssueOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  subIssueOptionText: {
    fontSize: 13,
    flex: 1,
  },
  insuranceCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  insuranceBenefitBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 10,
  },
  insuranceBenefitTitle: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  insuranceBenefitValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#DC2626',
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  orderCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  orderStoreName: {
    fontSize: 14,
    fontWeight: '800',
  },
  orderAmount: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0066FF',
  },
  orderRefText: {
    fontSize: 12,
    color: '#64748B',
  },
  orderStatusBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16A34A',
  },
  orderDateText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 6,
  },
  orderDetailCard: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  orderDetailHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0066FF',
    marginBottom: 4,
  },
  orderDetailStore: {
    fontSize: 16,
    fontWeight: '800',
  },
  orderDetailMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  topicTitle: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  orderSummaryChip: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  orderSummaryChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0066FF',
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  remarksInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    minHeight: 90,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  submitBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  directCallBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  directCallText: {
    color: '#0066FF',
    fontSize: 13,
    fontWeight: '700',
  },
  ticketCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  ticketIdText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0066FF',
  },
  ticketStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ticketStatusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  ticketTitleText: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 6,
  },
  ticketAgentText: {
    fontSize: 12,
    color: '#16A34A',
    fontWeight: '700',
    marginTop: 4,
  },
  ticketDateText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  waitingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  waitingIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  waitingTitle: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  waitingSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  waitingCard: {
    width: '100%',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 10,
  },
  waitingTicketId: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0066FF',
  },
  waitingIssueTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
    textAlign: 'center',
  },
  waitingBadge: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 8,
  },
  waitingBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  waitingCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  waitingCancelBtnText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  acceptedIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#0066FF',
  },
  acceptedTitle: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  acceptedAgentName: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0066FF',
    marginTop: 4,
    marginBottom: 4,
  },
  acceptedSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
  },
  acceptedPill: {
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  acceptedPillText: {
    color: '#0066FF',
    fontSize: 12,
    fontWeight: '700',
  },
  denialHeaderBox: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  denialHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0066FF',
    marginBottom: 2,
  },
  denialHeaderSub: {
    fontSize: 11.5,
    color: '#64748B',
  },
  denialReasonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  denialReasonTitle: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  denialReasonSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  denialConfirmBox: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 14,
  },
  denialConfirmTag: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DC2626',
  },
  denialConfirmStore: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  denialConfirmMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  confirmDenyBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmDenyBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  cancelDenyBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelDenyBtnText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
  },
  // Animated Support Screen Styles
  supportHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  supportHeaderTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  supportHeaderSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  supportHeaderRightIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportScrollContent: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 24,
  },
  heroAnimSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  concentricWavesWrap: {
    width: 130,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  concentricWaveRing: {
    position: 'absolute',
    width: 95,
    height: 95,
    borderRadius: 47.5,
    borderWidth: 2,
  },
  headsetCenterGlowBadge: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    borderWidth: 3,
    borderColor: '#0066FF',
  },
  headsetInnerCircleBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectingTitleText: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  connectingSubText: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  supportTicketCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 8,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  supportTicketCardLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    marginRight: 8,
  },
  supportTicketIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  supportTicketLabel: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  supportTicketValue: {
    fontSize: 13.5,
    fontWeight: '800',
    marginTop: 1,
  },
  supportStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  supportStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0066FF',
    marginRight: 5,
  },
  supportStatusText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0066FF',
    letterSpacing: 0.2,
  },
  agentFinderBox: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  finderSpinnerContainer: {
    width: 74,
    height: 74,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  finderSpinRing: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2.5,
    borderColor: '#E2E8F0',
    borderTopColor: '#0066FF',
    borderRightColor: '#0066FF',
  },
  finderSpinDash: {
    position: 'absolute',
    top: 4,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0066FF',
  },
  finderCenterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  finderPulseDots: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0066FF',
    marginHorizontal: 4,
  },
  finderBoxTitle: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 3,
  },
  finderBoxSub: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
  },
  supportInfoNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  supportInfoNoticeText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    lineHeight: 16,
  },
  supportFooterActions: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    gap: 8,
  },
  supportHomeBtn: {
    backgroundColor: '#0066FF',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  supportHomeBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  supportCancelBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  supportCancelBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
});

export default RiderHelpModal;
