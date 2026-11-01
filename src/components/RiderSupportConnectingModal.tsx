import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Alert,
  StatusBar,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';

export interface RiderSupportConnectingModalProps {
  visible: boolean;
  onClose: () => void;
  onBackToHome: () => void;
  ticket: {
    _id?: string;
    ticketId?: string;
    caseNumber?: string;
    issueTitle?: string;
    category?: string;
    status?: string;
    createdAt?: string | Date;
  } | null;
  onAgentConnected?: (agentData: { agentName: string; ticket: any }) => void;
  onCancelRequest?: () => void;
}

export const RiderSupportConnectingModal: React.FC<RiderSupportConnectingModalProps> = ({
  visible,
  onClose,
  onBackToHome,
  ticket,
  onAgentConnected,
  onCancelRequest,
}) => {
  const { isDark } = useTheme();
  const { socket } = useSocket();

  // Animation values
  const ring1Scale = useRef(new Animated.Value(1)).current;
  const ring1Opacity = useRef(new Animated.Value(0.7)).current;
  const ring2Scale = useRef(new Animated.Value(1)).current;
  const ring2Opacity = useRef(new Animated.Value(0.7)).current;
  const ring3Scale = useRef(new Animated.Value(1)).current;
  const ring3Opacity = useRef(new Animated.Value(0.7)).current;

  const spinAnim = useRef(new Animated.Value(0)).current;
  const pulseHeadset = useRef(new Animated.Value(1)).current;
  const dotsOpacity = useRef(new Animated.Value(0.3)).current;

  const [cancelling, setCancelling] = useState(false);

  // Setup loop animations
  useEffect(() => {
    if (!visible) return;

    // Concentric Wave Ring 1
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

    // Concentric Wave Ring 2 (Staggered)
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

    // Concentric Wave Ring 3 (Staggered)
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

    // Rotating Radar Spinner
    const spinLoop = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    // Pulse Headset
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

    // Dots Opacity Pulse
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
  }, [visible]);

  // Listen for Live Ticket Assignment via Socket
  useEffect(() => {
    if (!visible || !ticket) return;

    const currentTicketId = ticket.ticketId || ticket.caseNumber || ticket._id;

    if (socket && socket.connected && currentTicketId) {
      socket.emit('join_ticket_room', currentTicketId);
      socket.emit('join_ticket_room', ticket.ticketId);
    }

    const handleTicketAssigned = (payload: any) => {
      console.log('⚡ [SOCKET SUPPORT ASSIGNED RECEIVED IN RIDER APP]:', payload);
      const assignedId = payload?.ticketId || payload?.caseNumber || payload?.ticket?.ticketId || payload?.ticket?._id || payload?.case?.ticketId;
      if (assignedId && (assignedId === currentTicketId || String(assignedId) === String(currentTicketId) || String(payload?.ticketId) === String(ticket?.ticketId))) {
        const agentName = payload?.assignedAgentName || payload?.ticket?.assignedAgentName || 'Support Agent';
        if (onAgentConnected) {
          onAgentConnected({
            agentName,
            ticket: {
              ...ticket,
              assignedAgentName: agentName,
              status: 'IN_PROGRESS',
            },
          });
        }
      }
    };

    if (socket) {
      socket.on('support_ticket_assigned', handleTicketAssigned);
      socket.on('support_case_assigned', handleTicketAssigned);
      socket.on('case_assigned', handleTicketAssigned);
      socket.on('ticket_assigned', handleTicketAssigned);
      socket.on('support_call_connected', handleTicketAssigned);
      socket.on('support_request_accepted', handleTicketAssigned);
      socket.on('support_ticket_status_changed', handleTicketAssigned);
    }

    // 2-Second Fast Poller Fallback (Guarantees instant sync without manual refresh)
    const poller = setInterval(async () => {
      try {
        const res = await api.get(`/support/cases/${currentTicketId}`).catch(() => api.get(`/support/ticket/${currentTicketId}`));
        const t = res.data?.case || res.data?.ticket;
        if (t && t.assignedAgentName && t.status !== 'OPEN' && t.status !== 'CANCELLED') {
          console.log('⚡ [RIDER POLLER INSTANT CONNECTED]:', t);
          if (onAgentConnected) {
            onAgentConnected({
              agentName: t.assignedAgentName,
              ticket: {
                ...ticket,
                assignedAgentName: t.assignedAgentName,
                status: 'IN_PROGRESS',
              },
            });
          }
        }
      } catch (err) {}
    }, 2000);

    return () => {
      clearInterval(poller);
      if (socket) {
        socket.off('support_ticket_assigned', handleTicketAssigned);
        socket.off('support_case_assigned', handleTicketAssigned);
        socket.off('case_assigned', handleTicketAssigned);
        socket.off('ticket_assigned', handleTicketAssigned);
        socket.off('support_call_connected', handleTicketAssigned);
        socket.off('support_request_accepted', handleTicketAssigned);
        socket.off('support_ticket_status_changed', handleTicketAssigned);
      }
    };
  }, [socket, visible, ticket, onAgentConnected]);

  // Handle Cancel Ticket Request
  const handleCancel = () => {
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
              setCancelling(true);
              const tId = ticket?.ticketId || ticket?.caseNumber || ticket?._id;
              if (tId) {
                // Inform backend & socket
                if (socket && socket.connected) {
                  socket.emit('cancel_support_ticket', { ticketId: tId });
                }
                await api.post(`/support/tickets/${tId}/cancel`, {}).catch(() => {});
              }
              if (onCancelRequest) {
                onCancelRequest();
              } else {
                onClose();
              }
            } catch (_) {
              if (onCancelRequest) onCancelRequest();
              else onClose();
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  };

  const spinRotation = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const displayTicketId = ticket?.ticketId || ticket?.caseNumber || (ticket?._id ? `TKT-${String(ticket._id).slice(-6).toUpperCase()}` : 'TKT-439625');
  const displayIssue = ticket?.issueTitle || ticket?.category || 'Fare Discrepancy';
  const displayStatus = ticket?.status ? ticket.status.toUpperCase() : 'OPEN • WAITING';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent={true}
      onRequestClose={onBackToHome}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#0B0F19' : '#FFFFFF' }]}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={isDark ? '#0B0F19' : '#FFFFFF'}
        />

        {/* 1. Header Bar */}
        <View style={[styles.header, { borderBottomColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
          <TouchableOpacity onPress={onBackToHome} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={[styles.backArrow, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
              Support Request
            </Text>
            <Text style={styles.headerSubtitle}>
              Connecting you with a Support Agent
            </Text>
          </View>
          <View style={styles.headerRightIconWrap}>
            <Text style={{ fontSize: 18 }}>🎧</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* 2. Top Animated Headset Illustration Area with Concentric Waves */}
          <View style={styles.heroSection}>
            <View style={styles.wavesContainer}>
              <Animated.View
                style={[
                  styles.waveRing,
                  {
                    transform: [{ scale: ring1Scale }],
                    opacity: ring1Opacity,
                    borderColor: '#0066FF',
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.waveRing,
                  {
                    transform: [{ scale: ring2Scale }],
                    opacity: ring2Opacity,
                    borderColor: '#38BDF8',
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.waveRing,
                  {
                    transform: [{ scale: ring3Scale }],
                    opacity: ring3Opacity,
                    borderColor: '#60A5FA',
                  },
                ]}
              />

              {/* Center Headset Glowing Badge */}
              <Animated.View
                style={[
                  styles.headsetCenterBadge,
                  {
                    transform: [{ scale: pulseHeadset }],
                    backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                    shadowColor: '#0066FF',
                  },
                ]}
              >
                <View style={styles.headsetInnerCircle}>
                  <Text style={{ fontSize: 44 }}>🎧</Text>
                </View>
              </Animated.View>
            </View>

            <Text style={[styles.mainHeading, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
              Connecting with Support Agent...
            </Text>
            <Text style={styles.mainDescription}>
              Please wait. Our support team is reviewing your request and will connect with you shortly.
            </Text>
          </View>

          {/* 3. Ticket Details Card */}
          <View
            style={[
              styles.ticketCard,
              {
                backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                borderColor: isDark ? '#334155' : '#E2E8F0',
              },
            ]}
          >
            <View style={styles.ticketCardLeft}>
              <View style={styles.ticketIconBadge}>
                <Text style={{ fontSize: 20 }}>📄</Text>
              </View>
              <View style={styles.ticketMetaCol}>
                <Text style={styles.ticketMetaLabel}>Ticket ID</Text>
                <Text style={[styles.ticketMetaValue, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                  {displayTicketId}
                </Text>
                <Text style={[styles.ticketMetaLabel, { marginTop: 6 }]}>Issue</Text>
                <Text style={[styles.ticketMetaValue, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                  {displayIssue}
                </Text>
              </View>
            </View>

            <View style={styles.ticketCardRight}>
              <View style={styles.statusPill}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>{displayStatus}</Text>
              </View>
            </View>
          </View>

          {/* 4. Live Agent Finder Card with Animated Spinner */}
          <View
            style={[
              styles.finderCard,
              {
                backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                borderColor: isDark ? '#334155' : '#E2E8F0',
              },
            ]}
          >
            <View style={styles.finderSpinnerWrapper}>
              {/* Rotating Outer Ring */}
              <Animated.View
                style={[
                  styles.spinnerRing,
                  {
                    transform: [{ rotate: spinRotation }],
                  },
                ]}
              >
                <View style={styles.spinnerDash} />
              </Animated.View>

              {/* Central Headset with Dots */}
              <View style={styles.finderCenterContent}>
                <Animated.Text style={[styles.pulseDots, { opacity: dotsOpacity }]}>••</Animated.Text>
                <Text style={styles.finderHeadsetIcon}>🎧</Text>
                <Animated.Text style={[styles.pulseDots, { opacity: dotsOpacity }]}>••</Animated.Text>
              </View>
            </View>

            <Text style={[styles.finderTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
              Finding an available support agent...
            </Text>
            <Text style={styles.finderSub}>
              You'll be connected shortly.
            </Text>
          </View>

          {/* 5. Info Tip Notice */}
          <View
            style={[
              styles.infoNoticeBox,
              {
                backgroundColor: isDark ? '#0F172A' : '#EFF6FF',
                borderColor: isDark ? '#1E3A8A' : '#BFDBFE',
              },
            ]}
          >
            <Text style={styles.infoNoticeIcon}>ℹ️</Text>
            <Text style={[styles.infoNoticeText, { color: isDark ? '#93C5FD' : '#1E40AF' }]}>
              Please keep this screen open. Our support team is working on your request.
            </Text>
          </View>
        </ScrollView>

        {/* 6. Action Buttons at Bottom */}
        <View style={[styles.footerActions, { backgroundColor: isDark ? '#0B0F19' : '#FFFFFF', borderTopColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
          <TouchableOpacity
            style={styles.primaryHomeBtn}
            onPress={onBackToHome}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryHomeBtnText}>🏠 Back to Home</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.secondaryCancelBtn,
              {
                backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                borderColor: isDark ? '#334155' : '#CBD5E1',
              },
            ]}
            onPress={handleCancel}
            disabled={cancelling}
            activeOpacity={0.7}
          >
            <Text style={[styles.secondaryCancelBtnText, { color: isDark ? '#94A3B8' : '#475569' }]}>
              ✕ Cancel Request
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 6,
    marginRight: 8,
  },
  backArrow: {
    fontSize: 22,
    fontWeight: '700',
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  headerRightIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  wavesContainer: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  waveRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
  },
  headsetCenterBadge: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    borderWidth: 3,
    borderColor: '#0066FF',
  },
  headsetInnerCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainHeading: {
    fontSize: 18.5,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  mainDescription: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18.5,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  ticketCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 10,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  ticketCardLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  ticketIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  ticketMetaCol: {
    flex: 1,
  },
  ticketMetaLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  ticketMetaValue: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 1,
  },
  ticketCardRight: {
    alignItems: 'flex-end',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0066FF',
    marginRight: 6,
  },
  statusText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0066FF',
    letterSpacing: 0.2,
  },
  finderCard: {
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
  },
  finderSpinnerWrapper: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  spinnerRing: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2.5,
    borderColor: '#E2E8F0',
    borderTopColor: '#0066FF',
    borderRightColor: '#0066FF',
  },
  spinnerDash: {
    position: 'absolute',
    top: 4,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0066FF',
  },
  finderCenterContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseDots: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0066FF',
    marginHorizontal: 4,
  },
  finderHeadsetIcon: {
    fontSize: 24,
  },
  finderTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  finderSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  infoNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoNoticeIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  infoNoticeText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    lineHeight: 16,
  },
  footerActions: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    borderTopWidth: 1,
    gap: 10,
  },
  primaryHomeBtn: {
    backgroundColor: '#0066FF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  primaryHomeBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
  },
  secondaryCancelBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  secondaryCancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});

export default RiderSupportConnectingModal;
