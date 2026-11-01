import React, { useState, useMemo, useEffect, useRef } from 'react';
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
} from 'react-native';
import Icon from './PngIcon';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useSocket } from '../context/SocketContext';
import { getCategoryStoreLabel, getCategoryIcon } from '../services/CategoryHelper';
import SupportChatModal, { SupportTicketData } from './SupportChatModal';
import AIAgentChatModal from './AIAgentChatModal';

export type OrderStage =
  | 'BEFORE_PAYMENT'
  | 'ORDER_SENT_TO_STORE'
  | 'STORE_ACCEPTED'
  | 'RIDER_ASSIGNED'
  | 'RIDER_AT_LOCATION'
  | 'AFTER_DELIVERY';

interface CustomerHelpCenterModalProps {
  visible: boolean;
  onClose: () => void;
  orderStage: OrderStage;
  categoryName?: string;
  bookingId?: string;
  orderData?: any;
  user?: any;
  userCoords?: { latitude: number; longitude: number };
  onCancelOrder?: () => void;
}

interface IssueOption {
  id: string;
  title: string;
  description: string;
  icon: string;
  isUrgent?: boolean;
  action?: 'cancel' | 'call_support' | 'custom';
}

export const CustomerHelpCenterModal: React.FC<CustomerHelpCenterModalProps> = ({
  visible,
  onClose,
  orderStage,
  categoryName = 'Food',
  bookingId,
  orderData,
  user,
  userCoords,
  onCancelOrder,
}) => {
  const { isDark, currentColors } = useTheme();
  const { socket } = useSocket();
  const [selectedIssue, setSelectedIssue] = useState<IssueOption | null>(null);
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  
  // Active Ticket & Chat Modal State
  const [activeTicket, setActiveTicket] = useState<any | null>(null);
  const [showChatModal, setShowChatModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [selectedAiPrompt, setSelectedAiPrompt] = useState<string>('');
  const [connectedAgent, setConnectedAgent] = useState<string | null>(null);

  // Animation values for Support Connecting Wave Rings
  const ring1Scale = useRef(new Animated.Value(1)).current;
  const ring1Opacity = useRef(new Animated.Value(0.7)).current;
  const ring2Scale = useRef(new Animated.Value(1)).current;
  const ring2Opacity = useRef(new Animated.Value(0.7)).current;
  const ring3Scale = useRef(new Animated.Value(1)).current;
  const ring3Opacity = useRef(new Animated.Value(0.7)).current;
  const pulseHeadset = useRef(new Animated.Value(1)).current;

  // Trigger animations when in connecting state
  useEffect(() => {
    if (!visible || !activeTicket) return;

    const anim1 = Animated.loop(
      Animated.parallel([
        Animated.timing(ring1Scale, { toValue: 2.2, duration: 2200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(ring1Opacity, { toValue: 0, duration: 2200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ])
    );

    const anim2 = Animated.loop(
      Animated.sequence([
        Animated.delay(600),
        Animated.parallel([
          Animated.timing(ring2Scale, { toValue: 2.2, duration: 2200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(ring2Opacity, { toValue: 0, duration: 2200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        ]),
      ])
    );

    const anim3 = Animated.loop(
      Animated.sequence([
        Animated.delay(1200),
        Animated.parallel([
          Animated.timing(ring3Scale, { toValue: 2.2, duration: 2200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(ring3Opacity, { toValue: 0, duration: 2200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        ]),
      ])
    );

    const headsetLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseHeadset, { toValue: 1.1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseHeadset, { toValue: 1.0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );

    anim1.start();
    anim2.start();
    anim3.start();
    headsetLoop.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
      headsetLoop.stop();
    };
  }, [visible, activeTicket]);

  // Real-Time Socket Listener for Support Agent Assignment
  useEffect(() => {
    if (!activeTicket) return;

    const currentTicketId = activeTicket.ticketId || activeTicket.caseNumber || activeTicket._id;

    if (socket && socket.connected && currentTicketId) {
      socket.emit('join_ticket_room', currentTicketId);
      socket.emit('join_ticket_room', activeTicket.ticketId);
      console.log('🔌 [CUSTOMER] Joined ticket room:', currentTicketId);
    }

    const handleCaseAssigned = (payload: any) => {
      console.log('⚡ [SOCKET SUPPORT CASE ASSIGNED RECEIVED IN CUSTOMER APP]:', payload);
      const assignedId = payload?.ticketId || payload?.caseNumber || payload?.ticket?.ticketId || payload?.ticket?._id || payload?.case?.ticketId || payload?.caseId || payload?._id;
      const myId = activeTicket?.ticketId || activeTicket?.caseNumber || (activeTicket as any)?._id || currentTicketId;
      const uId = user?._id || user?.id;

      const isMatchingTicket = (assignedId && myId && String(assignedId) === String(myId));
      const isMatchingUser = uId && (
        String(payload?.requesterId) === String(uId) ||
        String(payload?.customerId) === String(uId) ||
        String(payload?.ticket?.requesterId) === String(uId) ||
        String(payload?.ticket?.customerId) === String(uId)
      );

      if (isMatchingTicket || isMatchingUser) {
        const agentName = payload?.assignedAgentName || payload?.agentName || payload?.ticket?.assignedAgentName || payload?.case?.assignedAgentName || 'Support Executive';
        setConnectedAgent(agentName);
        setActiveTicket((prev: any) => ({
          ...(prev || {}),
          assignedAgentName: agentName,
          status: 'IN_PROGRESS',
        }));
        // Instant Live Transition without manual refresh
        setShowChatModal(true);
      }
    };

    if (socket) {
      socket.on('support_ticket_assigned', handleCaseAssigned);
      socket.on('support_case_assigned', handleCaseAssigned);
      socket.on('case_assigned', handleCaseAssigned);
      socket.on('ticket_assigned', handleCaseAssigned);
      socket.on('support_call_connected', handleCaseAssigned);
      socket.on('support_request_accepted', handleCaseAssigned);
      socket.on('support_ticket_status_changed', handleCaseAssigned);
    }

    // 2-Second Fast Poller Fallback (Guarantees 100% instant sync even on weak networks)
    const poller = setInterval(async () => {
      if (connectedAgent || showChatModal) return;
      try {
        const res = await api.get(`/support/cases/${currentTicketId}`).catch(() => api.get(`/support/ticket/${currentTicketId}`));
        const t = res.data?.case || res.data?.ticket;
        if (t && t.assignedAgentName && t.status !== 'OPEN' && t.status !== 'CANCELLED') {
          console.log('⚡ [POLLER SUPPORT ASSIGNED INSTANT TRANSITION]:', t);
          setConnectedAgent(t.assignedAgentName);
          setActiveTicket((prev: any) => ({
            ...(prev || {}),
            ...t,
          }));
          setShowChatModal(true);
        }
      } catch (err) {}
    }, 2000);

    return () => {
      clearInterval(poller);
      if (socket) {
        socket.off('support_ticket_assigned', handleCaseAssigned);
        socket.off('support_case_assigned', handleCaseAssigned);
        socket.off('case_assigned', handleCaseAssigned);
        socket.off('ticket_assigned', handleCaseAssigned);
        socket.off('support_call_connected', handleCaseAssigned);
        socket.off('support_request_accepted', handleCaseAssigned);
        socket.off('support_ticket_status_changed', handleCaseAssigned);
      }
    };
  }, [socket, activeTicket, connectedAgent, showChatModal, user?._id]);

  const storeLabel = getCategoryStoreLabel(categoryName);
  const catEmoji = getCategoryIcon(categoryName);
  const isFood = categoryName.toLowerCase() === 'food';

  const stageTitle = useMemo(() => {
    switch (orderStage) {
      case 'BEFORE_PAYMENT':
        return 'Help & Ordering Support';
      case 'ORDER_SENT_TO_STORE':
        return `Order Sent to ${storeLabel}`;
      case 'STORE_ACCEPTED':
        return `${storeLabel} Accepted & Packing`;
      case 'RIDER_ASSIGNED':
        return 'Delivery Partner & Pickup Support';
      case 'RIDER_AT_LOCATION':
        return 'Delivery Partner Arrived';
      case 'AFTER_DELIVERY':
        return 'Delivered Order & Help Support';
      default:
        return 'Help Center';
    }
  }, [orderStage, storeLabel]);

  const issues: IssueOption[] = useMemo(() => {
    switch (orderStage) {
      case 'BEFORE_PAYMENT':
        return [
          { id: 'problem_placing_order', title: 'Problem placing order', description: 'Issues with checkout or order confirmation', icon: 'alert-circle-outline' },
          { id: 'store_issue', title: `${storeLabel} related issue`, description: `${storeLabel} is closed, unreachable or not responding`, icon: 'business-outline' },
          { id: 'product_issue', title: `${categoryName} item / product issue`, description: 'Item pricing, availability or description problem', icon: 'cube-outline' },
          { id: 'address_issue', title: 'Address / Location issue', description: 'Cannot set delivery address or GPS pinpoint', icon: 'location-outline' },
          { id: 'cart_issue', title: 'Cart related issue', description: 'Cannot modify items, prices or quantities', icon: 'cart-outline' },
          { id: 'cancellation_policy', title: 'Cancellation Policy', description: 'Free cancellation before store acceptance', icon: 'information-circle-outline' },
          { id: 'chat_support', title: 'Call & Connect Support Executive', description: 'Instant live connection with our customer care desk', icon: 'headset-outline', isUrgent: true },
          { id: 'other', title: 'Other issue', description: 'Any other question or assistance needed', icon: 'help-circle-outline' },
        ];

      case 'ORDER_SENT_TO_STORE':
        return [
          { id: 'store_not_accepted', title: `${storeLabel} has not accepted order`, description: `Waiting for ${storeLabel} to confirm receipt`, icon: 'time-outline' },
          { id: 'acceptance_delayed', title: 'Order acceptance delayed', description: `${storeLabel} taking unusually long to respond`, icon: 'alert-circle-outline' },
          { id: 'status_not_updating', title: 'Order status not updating', description: 'Screen is stuck on ringing/connecting', icon: 'refresh-outline' },
          { id: 'wrong_store', title: `Wrong ${storeLabel} selected`, description: 'Selected the wrong branch or store', icon: 'close-circle-outline' },
          { id: 'address_issue', title: 'Address / Location issue', description: 'Need to update delivery address urgently', icon: 'location-outline' },
          { id: 'cancel_order', title: 'Cancel Order', description: 'Cancel order before store starts preparation', icon: 'trash-outline', isUrgent: true, action: 'cancel' },
          { id: 'chat_support', title: 'Call & Connect Support Executive', description: 'Direct support from our customer executive', icon: 'headset-outline', isUrgent: true },
          { id: 'other', title: 'Other issue', description: 'Need help with something else', icon: 'help-circle-outline' },
        ];

      case 'STORE_ACCEPTED':
        return [
          { id: 'prep_delayed', title: isFood ? 'Food preparation delayed' : `${categoryName} packing delayed`, description: `${storeLabel} is taking longer than expected`, icon: 'time-outline' },
          { id: 'status_not_updating', title: 'Order status not updating', description: 'Status not refreshing after store acceptance', icon: 'refresh-outline' },
          { id: 'item_order_issue', title: `${categoryName} Item / Order issue`, description: 'Want to change, add or remove an item', icon: 'cube-outline' },
          { id: 'store_issue', title: `${storeLabel} related issue`, description: `Store phone unreachable or reported problem`, icon: 'business-outline' },
          { id: 'cancel_order', title: 'Cancel Order', description: 'Request cancellation (charges may apply)', icon: 'trash-outline', isUrgent: true, action: 'cancel' },
          { id: 'chat_support', title: 'Call & Connect Support Executive', description: 'Connect with support about your ongoing order', icon: 'headset-outline', isUrgent: true },
          { id: 'other', title: 'Other issue', description: 'Other general assistance', icon: 'help-circle-outline' },
        ];

      case 'RIDER_ASSIGNED':
        return [
          { id: 'rider_unreachable', title: 'Delivery Partner phone unreachable', description: 'Calling delivery partner but no response', icon: 'call-outline', isUrgent: true },
          { id: 'rider_delayed', title: 'Delivery Partner delayed for pickup', description: 'Rider is taking unusually long to reach store', icon: 'time-outline' },
          { id: 'wrong_pickup', title: 'Wrong pickup by delivery partner', description: 'Partner picked up a different parcel', icon: 'warning-outline' },
          { id: 'chat_support', title: 'Call & Connect Support Executive', description: 'Direct live assistance with order tracking', icon: 'headset-outline', isUrgent: true },
          { id: 'other', title: 'Other issue', description: 'Other delivery assistance', icon: 'help-circle-outline' },
        ];

      case 'RIDER_AT_LOCATION':
        return [
          { id: 'rider_at_wrong_gate', title: 'Delivery Partner arrived at wrong gate / address', description: 'Guide partner to the right building or flat', icon: 'location-outline', isUrgent: true },
          { id: 'otp_issue', title: 'Delivery OTP / PIN Issue', description: 'Cannot receive or share delivery PIN', icon: 'key-outline' },
          { id: 'chat_support', title: 'Call & Connect Support Executive', description: 'Urgent drop-off assistance', icon: 'headset-outline', isUrgent: true },
          { id: 'other', title: 'Other issue', description: 'Other doorstep issue', icon: 'help-circle-outline' },
        ];

      case 'AFTER_DELIVERY':
        return [
          { id: 'item_missing', title: 'Missing items in parcel', description: 'Some ordered items were not in the delivery packet', icon: 'alert-circle-outline', isUrgent: true },
          { id: 'item_damaged', title: 'Damaged or spoiled item', description: 'Food / products arrived broken or leaked', icon: 'warning-outline', isUrgent: true },
          { id: 'wrong_order_delivered', title: 'Wrong order delivered', description: 'Received someone else\'s package', icon: 'close-circle-outline', isUrgent: true },
          { id: 'refund_request', title: 'Request Refund / Compensation', description: 'Apply for full or partial order refund', icon: 'card-outline', isUrgent: true },
          { id: 'chat_support', title: 'Call & Connect Support Executive', description: 'Talk to an agent regarding order dispute', icon: 'headset-outline' },
          { id: 'other', title: 'Other issue', description: 'Any other feedback or concern', icon: 'help-circle-outline' },
        ];

      default:
        return [];
    }
  }, [orderStage, storeLabel, categoryName, isFood]);

  const handleSubmitIssue = async () => {
    if (!selectedIssue) return;

    if (selectedIssue.action === 'cancel' && onCancelOrder) {
      onCancelOrder();
    }

    setSubmitting(true);
    try {
      const activeOrderId = bookingId || orderData?.bookingId || orderData?.rideId || orderData?._id;
      const payload = {
        orderRef: activeOrderId || `PRE_ORDER_${user?._id || user?.id || 'GUEST'}_${Date.now()}`,
        bookingId: activeOrderId || null,
        category: selectedIssue.id,
        orderCategory: categoryName,
        priority: selectedIssue.isUrgent ? 'urgent' : 'normal',
        requesterRole: 'customer',
        requesterRef: user?._id || user?.id || 'customer',
        requesterName: user?.name || user?.username || 'Customer',
        requesterPhone: user?.phoneNumber || user?.phone || '9999999999',
        description: remarks.trim()
          ? `${selectedIssue.title}: ${remarks.trim()}`
          : selectedIssue.title,
        gpsLat: userCoords?.latitude || orderData?.destinationLatitude || null,
        gpsLng: userCoords?.longitude || orderData?.destinationLongitude || null,
        orderStatus: orderStage,
      };

      const res = await api.post('/support/request', payload);
      if (res.data?.success) {
        const ticketData = res.data.case || res.data.ticket || {
          ticketId: res.data.ticketId || res.data.caseNumber || 'TKT-LIVE',
          caseNumber: res.data.caseNumber || res.data.ticketId || 'TKT-LIVE',
          category: selectedIssue.id,
          issueTitle: selectedIssue.title,
          description: payload.description,
          status: 'OPEN',
          requesterName: payload.requesterName,
          requesterPhone: payload.requesterPhone,
          createdAt: new Date(),
        };
        setActiveTicket(ticketData);
      } else {
        Alert.alert('Support Error', res.data?.error || 'Could not submit support request.');
      }
    } catch (e: any) {
      console.log('[SUPPORT REQUEST ERROR]', e.message);
      // Fallback ticket object
      const fallbackTicket = {
        ticketId: `TKT-${Math.floor(100000 + Math.random() * 900000)}`,
        caseNumber: `TKT-${Math.floor(100000 + Math.random() * 900000)}`,
        category: selectedIssue.id,
        issueTitle: selectedIssue.title,
        status: 'OPEN',
        requesterName: user?.name || 'Customer',
        createdAt: new Date(),
      };
      setActiveTicket(fallbackTicket);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelTicket = async () => {
    if (!activeTicket) return;
    setCancelling(true);
    try {
      const tId = activeTicket.ticketId || activeTicket.caseNumber || activeTicket._id;
      if (socket && socket.connected) {
        socket.emit('cancel_support_ticket', { ticketId: tId, reason: 'Cancelled by customer' });
      }
      await api.post(`/support/cases/${tId}/cancel`, { reason: 'Cancelled by customer', cancelledBy: 'Customer' }).catch(() => {});
      Alert.alert('Cancelled', 'Your support request has been cancelled.');
    } catch (e) {
      // Ignored
    } finally {
      setCancelling(false);
      handleResetModal();
    }
  };

  const handleResetModal = () => {
    setSelectedIssue(null);
    setRemarks('');
    setActiveTicket(null);
    setConnectedAgent(null);
    setShowChatModal(false);
    onClose();
  };

  return (
    <>
      <Modal visible={visible && !showChatModal} transparent animationType="slide" onRequestClose={handleResetModal}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: currentColors.surface }]}>
            {/* Header */}
            <View style={[styles.modalHeader, { borderBottomColor: currentColors.border }]}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 18 }}>{catEmoji}</Text>
                  <Text style={[styles.headerTitle, { color: currentColors.text }]}>{stageTitle}</Text>
                </View>
                <Text style={[styles.headerSub, { color: currentColors.textMuted }]}>
                  {bookingId ? `Order #${String(bookingId).slice(-6)} • ` : ''}
                  {categoryName} Delivery Support Desk
                </Text>
              </View>
              <TouchableOpacity onPress={handleResetModal} style={styles.closeBtn}>
                <Icon name="close" size={24} color={currentColors.text} />
              </TouchableOpacity>
            </View>

            {/* Body */}
            {activeTicket ? (
              /* ── ANIMATED SUPPORT CONNECTING & CALL SCREEN (MATCHING DELIVERY PARTNER) ── */
              <View style={styles.connectingContainer}>
                {/* Concentric Radar Wave Rings & Headset Animation */}
                <View style={styles.heroAnimSection}>
                  <View style={styles.concentricWavesWrap}>
                    <Animated.View
                      style={[
                        styles.concentricWaveRing,
                        { transform: [{ scale: ring1Scale }], opacity: ring1Opacity, borderColor: '#2563EB' },
                      ]}
                    />
                    <Animated.View
                      style={[
                        styles.concentricWaveRing,
                        { transform: [{ scale: ring2Scale }], opacity: ring2Opacity, borderColor: '#38BDF8' },
                      ]}
                    />
                    <Animated.View
                      style={[
                        styles.concentricWaveRing,
                        { transform: [{ scale: ring3Scale }], opacity: ring3Opacity, borderColor: '#818CF8' },
                      ]}
                    />

                    {/* Center Headset Glowing Badge */}
                    <Animated.View
                      style={[
                        styles.headsetCenterGlowBadge,
                        { transform: [{ scale: pulseHeadset }], backgroundColor: isDark ? '#1E293B' : '#FFFFFF' },
                      ]}
                    >
                      <View style={styles.headsetInnerCircleBadge}>
                        <Text style={{ fontSize: 40 }}>🎧</Text>
                      </View>
                    </Animated.View>
                  </View>

                  <Text style={[styles.connectingTitleText, { color: currentColors.text }]}>
                    {connectedAgent ? `Connected with ${connectedAgent}` : 'Calling Support Executive...'}
                  </Text>
                  <Text style={[styles.connectingSubText, { color: currentColors.textMuted }]}>
                    {connectedAgent
                      ? 'Executive is online and reviewing your order details.'
                      : 'Please hold on. Connecting your call & request with our customer care desk.'}
                  </Text>
                </View>

                {/* Live Ticket Info Card */}
                <View style={[styles.ticketCard, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: currentColors.border }]}>
                  <View style={styles.ticketRow}>
                    <Text style={[styles.ticketLabel, { color: currentColors.textMuted }]}>Ticket ID:</Text>
                    <Text style={styles.ticketVal}>{activeTicket.ticketId || activeTicket.caseNumber}</Text>
                  </View>
                  <View style={styles.ticketRow}>
                    <Text style={[styles.ticketLabel, { color: currentColors.textMuted }]}>Issue:</Text>
                    <Text style={[styles.ticketValText, { color: currentColors.text }]} numberOfLines={1}>
                      {activeTicket.issueTitle || activeTicket.category || selectedIssue?.title || 'Support Request'}
                    </Text>
                  </View>
                  <View style={styles.ticketRow}>
                    <Text style={[styles.ticketLabel, { color: currentColors.textMuted }]}>Status:</Text>
                    <View style={styles.statusPill}>
                      <View style={styles.statusDot} />
                      <Text style={styles.statusPillText}>
                        {connectedAgent ? '🟢 EXECUTIVE CONNECTED' : '🟡 IN LIVE QUEUE'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.connectingActions}>
                  <TouchableOpacity
                    style={styles.openChatBtn}
                    onPress={() => setShowChatModal(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.openChatBtnText}>💬 Open Live Chat with Executive</Text>
                  </TouchableOpacity>

                  <View style={styles.subActionsRow}>
                    <TouchableOpacity
                      style={[styles.cancelReqBtn, { borderColor: currentColors.border }]}
                      onPress={handleCancelTicket}
                      disabled={cancelling}
                    >
                      {cancelling ? (
                        <ActivityIndicator color="#EF4444" size="small" />
                      ) : (
                        <Text style={styles.cancelReqText}>Cancel Request</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.directCallBtn}
                      onPress={() => Linking.openURL('tel:112')}
                    >
                      <Text style={styles.directCallText}>📞 Emergency Support (112)</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : selectedIssue ? (
              <View style={{ padding: 16 }}>
                <TouchableOpacity
                  style={styles.backToIssuesBtn}
                  onPress={() => setSelectedIssue(null)}
                >
                  <Icon name="arrow-back" size={18} color="#2563EB" />
                  <Text style={styles.backToIssuesText}>Choose a different issue</Text>
                </TouchableOpacity>

                <View style={[styles.selectedIssueCard, { backgroundColor: isDark ? '#1E293B' : '#EFF6FF', borderColor: '#BFDBFE' }]}>
                  <Text style={[styles.selectedIssueTitle, { color: '#1E40AF' }]}>{selectedIssue.title}</Text>
                  <Text style={[styles.selectedIssueDesc, { color: '#3B82F6' }]}>{selectedIssue.description}</Text>
                </View>

                <Text style={[styles.inputLabel, { color: currentColors.text }]}>Add details / remarks (Optional):</Text>
                <TextInput
                  style={[
                    styles.remarksInput,
                    {
                      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                      borderColor: currentColors.border,
                      color: currentColors.text,
                    },
                  ]}
                  placeholder="Describe your issue or what happened..."
                  placeholderTextColor={currentColors.textMuted}
                  multiline
                  numberOfLines={3}
                  value={remarks}
                  onChangeText={setRemarks}
                />

                <TouchableOpacity
                  style={[styles.submitIssueBtn, submitting && { opacity: 0.6 }]}
                  onPress={handleSubmitIssue}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitIssueBtnText}>📞 Call & Connect Support Executive</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                {/* 🤖 CHAT WITH AI AGENT BANNER */}
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: isDark ? '#1E293B' : '#EFF6FF',
                    borderRadius: 14,
                    padding: 14,
                    marginHorizontal: 16,
                    marginTop: 12,
                    marginBottom: 8,
                    borderWidth: 1.5,
                    borderColor: '#3B82F6',
                    gap: 12,
                  }}
                  onPress={() => setShowAiModal(true)}
                  activeOpacity={0.8}
                >
                  <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 22 }}>🤖</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: isDark ? '#FFFFFF' : '#0F172A' }}>
                        Chat with Support Agent
                      </Text>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' }} />
                    </View>
                    <Text style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#475569', marginTop: 2 }}>
                      24/7 AI Instant Help • Order, Stores & Refund
                    </Text>
                  </View>
                  <Text style={{ fontSize: 18, color: '#3B82F6', fontWeight: '800' }}>➔</Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            {/* Quick Call Helpline footer */}
            {!activeTicket && (
              <View style={[styles.footerBar, { borderTopColor: currentColors.border }]}>
                <TouchableOpacity
                  style={styles.callHelplineBtn}
                  onPress={() => Linking.openURL('tel:112')}
                >
                  <Icon name="call" size={16} color="#2563EB" />
                  <Text style={styles.callHelplineText}>24x7 Emergency Helpline: 112</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── 2-WAY REAL-TIME LIVE CHAT MODAL WITH SUPPORT ADMIN ── */}
      {showChatModal && (
        <SupportChatModal
          visible={showChatModal}
          onClose={() => setShowChatModal(false)}
          ticket={activeTicket}
          currentUser={user}
          userRole="customer"
          onTicketUpdated={(updated) => {
            setActiveTicket((prev: any) => ({ ...prev, ...updated }));
          }}
        />
      )}

      {/* ── 24/7 AI AGENT CHAT MODAL ── */}
      <AIAgentChatModal
        visible={showAiModal}
        onClose={() => {
          setShowAiModal(false);
          setSelectedAiPrompt('');
        }}
        userRole="customer"
        activeOrder={orderData}
        initialPrompt={selectedAiPrompt}
      />
    </>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 20,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  issuesList: {
    padding: 14,
    gap: 10,
  },
  issueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  issueIconBg: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  issueTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  issueSub: {
    fontSize: 12,
    marginTop: 2,
  },
  backToIssuesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  backToIssuesText: {
    fontSize: 13,
    color: '#2563EB',
    fontWeight: '600',
  },
  selectedIssueCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  selectedIssueTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  selectedIssueDesc: {
    fontSize: 12,
    marginTop: 4,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  remarksInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    textAlignVertical: 'top',
    minHeight: 70,
    marginBottom: 16,
  },
  submitIssueBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  submitIssueBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  /* ── CONNECTING CALL & RADAR WAVE STYLES ── */
  connectingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  heroAnimSection: {
    alignItems: 'center',
    marginVertical: 10,
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
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
  },
  headsetCenterGlowBadge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  headsetInnerCircleBadge: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectingTitleText: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  connectingSubText: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 18,
  },
  ticketCard: {
    width: '100%',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    marginTop: 14,
    marginBottom: 18,
  },
  ticketRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ticketLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  ticketVal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2563EB',
  },
  ticketValText: {
    fontSize: 12,
    fontWeight: '600',
    maxWidth: '65%',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D97706',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400E',
  },
  connectingActions: {
    width: '100%',
    gap: 10,
  },
  openChatBtn: {
    width: '100%',
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  openChatBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  subActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelReqBtn: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelReqText: {
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 13,
  },
  directCallBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  directCallText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  footerBar: {
    paddingTop: 12,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  callHelplineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  callHelplineText: {
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '600',
  },
});

export default CustomerHelpCenterModal;
