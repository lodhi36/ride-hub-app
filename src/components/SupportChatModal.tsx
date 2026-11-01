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
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';

export interface SupportChatMessage {
  messageId: string;
  senderId: string;
  senderRole: 'rider' | 'customer' | 'supplier' | 'restaurant' | 'agent' | 'admin' | 'user' | string;
  senderName: string;
  text: string;
  attachments?: string[];
  isInternal?: boolean;
  createdAt: string | Date;
}

export interface SupportTicketData {
  _id?: string;
  ticketId: string;
  caseNumber?: string;
  bookingId?: string;
  orderRef?: string;
  category?: string;
  issueTitle?: string;
  issueCategory?: string;
  description?: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'RESOLVED' | 'CLOSED' | string;
  priority?: string;
  requesterRole?: string;
  requesterName?: string;
  requesterPhone?: string;
  assignedAgentName?: string;
  messages?: SupportChatMessage[];
  createdAt?: string | Date;
}

interface SupportChatModalProps {
  visible: boolean;
  onClose: () => void;
  ticket: SupportTicketData | null;
  currentUser?: any;
  userRole?: 'rider' | 'customer' | 'supplier' | 'restaurant';
  onTicketUpdated?: (updatedTicket: SupportTicketData) => void;
}

export const SupportChatModal: React.FC<SupportChatModalProps> = ({
  visible,
  onClose,
  ticket,
  currentUser,
  userRole = 'rider',
  onTicketUpdated,
}) => {
  const { isDark, currentColors } = useTheme();
  const { socket } = useSocket();
  const [messages, setMessages] = useState<SupportChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [ticketStatus, setTicketStatus] = useState<string>('OPEN');
  const scrollViewRef = useRef<ScrollView>(null);

  // Sync initial ticket state
  useEffect(() => {
    if (ticket) {
      setTicketStatus(ticket.status || 'OPEN');
      if (ticket.messages && Array.isArray(ticket.messages)) {
        setMessages(ticket.messages);
      }
      const tId = ticket.ticketId || ticket.caseNumber || (ticket as any)._id;
      if (tId) loadTicketDetails(tId);
    }
  }, [ticket?.ticketId, ticket?._id, visible]);

  // Join ticket room and listen for real-time messages
  useEffect(() => {
    if (!socket || !ticket?.ticketId || !visible) return;

    const tId = ticket.ticketId;
    socket.emit('join_ticket_room', tId);
    console.log(`🎫 [SUPPORT CHAT] Joined ticket room: support_ticket_${tId}`);

    const handleNewMessage = (payload: any) => {
      console.log('💬 [SUPPORT CHAT MSG RECEIVED IN MODAL]:', payload);
      if (payload?.ticketId === tId || payload?.caseNumber === tId) {
        if (payload.message) {
          setMessages((prev) => {
            const exists = prev.some((m) => m.messageId === payload.message.messageId);
            if (exists) return prev;
            return [...prev, payload.message];
          });
        }
        if (payload.ticketStatus) {
          setTicketStatus(payload.ticketStatus);
        }
      }
    };

    const handleStatusUpdate = (payload: any) => {
      if (payload?.ticketId === tId || payload?.caseNumber === tId) {
        if (payload.status) setTicketStatus(payload.status);
      }
    };

    const handleAssignment = (payload: any) => {
      if (payload?.ticketId === tId || payload?.caseNumber === tId) {
        if (payload.status) setTicketStatus(payload.status);
        if (payload.assignedAgentName && onTicketUpdated && ticket) {
          onTicketUpdated({
            ...ticket,
            assignedAgentName: payload.assignedAgentName,
            status: payload.status || 'IN_PROGRESS',
          });
        }
      }
    };

    socket.on('support_message_received', handleNewMessage);
    socket.on('support_ticket_status_updated', handleStatusUpdate);
    socket.on('support_ticket_status_changed', handleStatusUpdate);
    socket.on('support_ticket_assigned', handleAssignment);
    socket.on('support_case_assigned', handleAssignment);
    socket.on('case_assigned', handleAssignment);

    return () => {
      socket.emit('leave_ticket_room', tId);
      socket.off('support_message_received', handleNewMessage);
      socket.off('support_ticket_status_updated', handleStatusUpdate);
      socket.off('support_ticket_status_changed', handleStatusUpdate);
      socket.off('support_ticket_assigned', handleAssignment);
      socket.off('support_case_assigned', handleAssignment);
      socket.off('case_assigned', handleAssignment);
    };
  }, [socket, ticket?.ticketId, visible]);

  const loadTicketDetails = async (tId: string) => {
    if (!tId) return;
    try {
      setLoadingHistory(true);
      const res = await api.get(`/support/ticket/${tId}`);
      if (res.data?.success && res.data?.ticket) {
        const t = res.data.ticket;
        setTicketStatus(t.status || 'OPEN');
        if (t.messages && Array.isArray(t.messages)) {
          setMessages(t.messages);
        }
        if (onTicketUpdated) onTicketUpdated(t);
      }
    } catch (err) {
      console.log('Error loading ticket details:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || sending || !ticket) return;

    const textToSend = inputText.trim();
    setInputText('');
    setSending(true);

    const senderId = currentUser?._id || currentUser?.id || 'user_anon';
    const senderName = currentUser?.name || currentUser?.username || 'You';
    const tId = ticket.ticketId || ticket.caseNumber || ticket._id;

    // Optimistic local update
    const tempMsg: SupportChatMessage = {
      messageId: 'tmp_' + Date.now(),
      senderId: String(senderId),
      senderRole: userRole,
      senderName,
      text: textToSend,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempMsg]);

    try {
      // 1. Emit direct socket event
      if (socket && socket.connected) {
        socket.emit('send_support_message', {
          ticketId: tId,
          senderId,
          senderRole: userRole,
          senderName,
          text: textToSend,
        });
      }

      // 2. Call REST endpoint
      const res = await api.post(`/support/ticket/${tId}/message`, {
        senderId,
        senderRole: userRole,
        senderName,
        text: textToSend,
      });

      if (res.data?.success && res.data?.newMessage) {
        setMessages((prev) =>
          prev.map((m) => (m.messageId === tempMsg.messageId ? res.data.newMessage : m))
        );
      }
    } catch (err: any) {
      console.error('Error sending support message:', err.message);
    } finally {
      setSending(false);
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (String(status).toUpperCase()) {
      case 'OPEN':
        return '#3B82F6';
      case 'IN_PROGRESS':
        return '#0066FF';
      case 'WAITING':
        return '#8B5CF6';
      case 'RESOLVED':
        return '#10B981';
      case 'CLOSED':
        return '#64748B';
      default:
        return '#3B82F6';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (String(status).toUpperCase()) {
      case 'OPEN':
        return 'खुल गया (Open)';
      case 'IN_PROGRESS':
        return 'सक्रिय (In Progress)';
      case 'WAITING':
        return 'प्रतीक्षारत (Waiting)';
      case 'RESOLVED':
        return 'समाधान (Resolved)';
      case 'CLOSED':
        return 'बंद (Closed)';
      default:
        return status;
    }
  };

  const isMyMessage = (msg: SupportChatMessage) => {
    if (msg.senderRole === 'agent' || msg.senderRole === 'admin') return false;
    const myId = String(currentUser?._id || currentUser?.id || '');
    if (myId && String(msg.senderId) === myId) return true;
    return msg.senderRole === userRole;
  };

  if (!ticket) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
        {/* Header Bar */}
        <View style={[styles.header, { backgroundColor: '#0066FF' }]}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={styles.backBtnText}>✕</Text>
          </TouchableOpacity>

          <View style={{ flex: 1, marginLeft: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.headerTitle}>
                {ticket.ticketId || ticket.caseNumber || 'सपोर्ट चैट'}
              </Text>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: getStatusBadgeColor(ticketStatus) },
                ]}
              >
                <Text style={styles.statusBadgeText}>{getStatusLabel(ticketStatus)}</Text>
              </View>
            </View>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {ticket.issueTitle || ticket.category || '24x7 लाइव सपोर्ट टीम'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.callSupportBtn}
            onPress={() => Linking.openURL('tel:18001234567')}
            activeOpacity={0.8}
          >
            <Text style={styles.callSupportIcon}>📞</Text>
            <Text style={styles.callSupportText}>कॉल</Text>
          </TouchableOpacity>
        </View>

        {/* Ticket Context Info Strip */}
        <View style={[styles.contextStrip, { backgroundColor: isDark ? '#1E293B' : '#EFF6FF' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[styles.contextText, { color: isDark ? '#94A3B8' : '#1E40AF' }]}>
              {ticket.orderRef ? `📦 ऑर्डर: #${String(ticket.orderRef).slice(-6)}` : '🛡️ सामान्य सपोर्ट'}
            </Text>
            <Text style={[styles.contextText, { color: isDark ? '#94A3B8' : '#1E40AF' }]}>
              {ticket.assignedAgentName ? `👤 एजेंट: ${ticket.assignedAgentName}` : '⚡ तत्काल प्रतिक्रिया'}
            </Text>
          </View>
        </View>

        {/* Messages List */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={{ padding: 14, paddingBottom: 20 }}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          showsVerticalScrollIndicator={false}
        >
          {loadingHistory && messages.length === 0 && (
            <ActivityIndicator size="small" color="#0066FF" style={{ marginVertical: 20 }} />
          )}

          {/* Welcome Card */}
          <View style={[styles.welcomeCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
            <Text style={{ fontSize: 24, textAlign: 'center', marginBottom: 4 }}>🎧</Text>
            <Text style={[styles.welcomeTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
              राइड हब सहायता टीम से जुड़ गए हैं
            </Text>
            <Text style={[styles.welcomeSub, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              हमारी टीम आपकी समस्या का समाधान करने में सहायता कर रही है। नीचे संदेश लिखें।
            </Text>
          </View>

          {messages.map((msg, index) => {
            const isMe = isMyMessage(msg);
            const timeStr = msg.createdAt
              ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '';

            return (
              <View
                key={msg.messageId || index}
                style={[
                  styles.messageWrapper,
                  isMe ? styles.myMessageWrapper : styles.agentMessageWrapper,
                ]}
              >
                {!isMe && (
                  <View style={styles.agentAvatar}>
                    <Text style={{ fontSize: 13, color: '#FFFFFF', fontWeight: '700' }}>
                      {msg.senderRole === 'admin' ? 'A' : 'S'}
                    </Text>
                  </View>
                )}

                <View
                  style={[
                    styles.messageBubble,
                    isMe
                      ? [styles.myBubble, { backgroundColor: '#0066FF' }]
                      : [
                          styles.agentBubble,
                          { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' },
                        ],
                  ]}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <Text
                      style={[
                        styles.senderName,
                        { color: isMe ? '#BFDBFE' : '#0066FF' },
                      ]}
                    >
                      {isMe ? 'आप' : (msg.senderName || 'सपोर्ट एजेंट')}
                    </Text>
                    {timeStr ? (
                      <Text
                        style={[
                          styles.messageTime,
                          { color: isMe ? 'rgba(255,255,255,0.7)' : '#94A3B8' },
                        ]}
                      >
                        {timeStr}
                      </Text>
                    ) : null}
                  </View>

                  <Text
                    style={[
                      styles.messageText,
                      { color: isMe ? '#FFFFFF' : isDark ? '#F1F5F9' : '#0F172A' },
                    ]}
                  >
                    {msg.text}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* Input Bar */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <View
            style={[
              styles.inputContainer,
              {
                backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                borderTopColor: isDark ? '#334155' : '#E2E8F0',
              },
            ]}
          >
            <TextInput
              style={[
                styles.textInput,
                {
                  color: isDark ? '#F1F5F9' : '#0F172A',
                  backgroundColor: isDark ? '#0F172A' : '#F1F5F9',
                },
              ]}
              placeholder="यहाँ अपनी समस्या या संदेश लिखें..."
              placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={500}
            />

            <TouchableOpacity
              style={[
                styles.sendBtn,
                { backgroundColor: inputText.trim() ? '#0066FF' : '#94A3B8' },
              ]}
              onPress={handleSendMessage}
              disabled={!inputText.trim() || sending}
              activeOpacity={0.8}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.sendBtnIcon}>➤</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    elevation: 4,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  callSupportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  callSupportIcon: {
    fontSize: 12,
  },
  callSupportText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  contextStrip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  contextText: {
    fontSize: 12,
    fontWeight: '600',
  },
  messagesContainer: {
    flex: 1,
  },
  welcomeCard: {
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
    elevation: 1,
  },
  welcomeTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  welcomeSub: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  messageWrapper: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  myMessageWrapper: {
    justifyContent: 'flex-end',
  },
  agentMessageWrapper: {
    justifyContent: 'flex-start',
    gap: 8,
  },
  agentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0066FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  messageBubble: {
    maxWidth: '78%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  myBubble: {
    borderBottomRightRadius: 2,
  },
  agentBubble: {
    borderBottomLeftRadius: 2,
    borderWidth: 1,
  },
  senderName: {
    fontSize: 11,
    fontWeight: '700',
    marginRight: 8,
  },
  messageTime: {
    fontSize: 10,
  },
  messageText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  textInput: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 13,
    maxHeight: 100,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default SupportChatModal;
