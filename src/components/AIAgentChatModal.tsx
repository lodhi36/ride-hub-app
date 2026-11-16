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
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Animated,
} from 'react-native';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
  feedback?: 'thumbs_up' | 'thumbs_down' | null;
  actionSuggested?: string | null;
  source?: string | null;
  failedPrompt?: string | null;
}

interface AIAgentChatModalProps {
  visible: boolean;
  onClose: () => void;
  userRole?: 'customer' | 'supplier' | 'rider';
  activeOrder?: any;
  initialPrompt?: string;
}


const BouncingDots: React.FC<{ isDark: boolean }> = ({ isDark }) => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createAnim = (val: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: -6, duration: 240, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 240, useNativeDriver: true }),
          Animated.delay(480 - delay),
        ])
      );
    };

    const anim1 = createAnim(dot1, 0);
    const anim2 = createAnim(dot2, 140);
    const anim3 = createAnim(dot3, 280);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, []);

  const dotColor = isDark ? '#38BDF8' : '#0066FF';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 16 }}>
        <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dotColor, transform: [{ translateY: dot1 }] }} />
        <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dotColor, transform: [{ translateY: dot2 }] }} />
        <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dotColor, transform: [{ translateY: dot3 }] }} />
      </View>
      <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 13, fontWeight: '700' }}>टाइपिंग...</Text>
    </View>
  );
};

export const AIAgentChatModal: React.FC<AIAgentChatModalProps> = ({
  visible,
  onClose,
  userRole = 'customer',
  activeOrder,
  initialPrompt,
}) => {
  const { isDark, currentColors } = useTheme();
  const { user } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [quickButtons, setQuickButtons] = useState<Array<{ id: string; label: string; prompt: string }>>([]);
  const [sessionId, setSessionId] = useState<string>('');
  const [remainingLimit, setRemainingLimit] = useState<number>(50);
  const [ticketSubmitting, setTicketSubmitting] = useState<boolean>(false);

  const scrollViewRef = useRef<ScrollView>(null);

  // Initialize Session & Welcome Message
  useEffect(() => {
    if (visible) {
      const uId = user?._id || user?.id || 'anon_user';
      const sId = `session_${uId}_${Date.now()}`;
      setSessionId(sId);

      // Stage-aware Rider Quick Chips (Module 10)
      if (userRole === 'rider' && activeOrder) {
        const orderStatus = (activeOrder.riderStatus || activeOrder.deliveryStatus || activeOrder.status || '').toUpperCase();
        
        if (
          orderStatus === 'ACCEPTED' || 
          orderStatus === 'ASSIGNED' || 
          orderStatus === 'CONFIRMED' || 
          orderStatus === 'GOING_TO_RESTAURANT' || 
          orderStatus === 'RIDER_ACCEPTED'
        ) {
          // Stage 1: Towards Restaurant
          setQuickButtons([
            { id: 'stg1_loc', label: '📍 Restaurant Location Issue', prompt: 'रेस्टोरेंट की लोकेशन सही नहीं मिल रही है, सहायता करें।' },
            { id: 'stg1_park', label: '🅿️ Parking Issue', prompt: 'रेस्टोरेंट के पास पार्किंग नहीं मिल रही है।' },
            { id: 'stg1_call', label: '📞 Restaurant Unreachable', prompt: 'रेस्टोरेंट कॉल नहीं उठा रहा है।' },
            { id: 'stg1_wait', label: '⏳ Order Not Ready', prompt: 'ऑर्डर अभी तक किचन में तैयार नहीं हुआ है।' },
          ]);
        } else if (
          orderStatus === 'REACHED_RESTAURANT' || 
          orderStatus === 'AT_RESTAURANT' || 
          orderStatus === 'REACHED_PICKUP' || 
          orderStatus === 'WAITING_FOR_FOOD' ||
          orderStatus === 'FOOD_READY'
        ) {
          // Stage 2: At Restaurant
          setQuickButtons([
            { id: 'stg2_wait', label: '⏳ Long Wait Time', prompt: 'रेस्टोरेंट पर 10 मिनट से अधिक समय से इंतज़ार कर रहा हूँ, सहायता करें।' },
            { id: 'stg2_cancel', label: '❌ Order Cancel Request', prompt: 'ग्राहक या स्टोर ने ऑर्डर रद्द करने को कहा है।' },
            { id: 'stg2_wrong', label: '⚠️ Wrong Order Prepared', prompt: 'किचन ने गलत आइटम या अधूरा ऑर्डर तैयार किया है।' },
            { id: 'stg2_closed', label: '🏪 Restaurant Closed', prompt: 'रेस्टोरेंट बंद मिला है, ऑर्डर कैंसिल या री-असाइन करें।' },
          ]);
        } else {
          // Stage 3: Towards Customer
          setQuickButtons([
            { id: 'stg3_unreach', label: '📞 Customer Unreachable', prompt: 'ग्राहक कॉल नहीं उठा रहा है और घंटी नहीं बज रही।' },
            { id: 'stg3_addr', label: '🏠 Address Not Found', prompt: 'ग्राहक का पता मैप पर सही नहीं मिल रहा है।' },
            { id: 'stg3_refuse', label: '🚫 Customer Refusing', prompt: 'ग्राहक ऑर्डर स्वीकार करने से मना कर रहा है।' },
            { id: 'stg3_alt', label: '📍 Alternative Drop Request', prompt: 'ग्राहक ने दूसरे पते पर डिलीवरी मांगी है।' },
          ]);
        }
      } else {
        // Fetch standard quick chips from backend
        api.get(`/support/ai/quick-buttons?role=${userRole}&userId=${uId}`)
          .then(res => {
            if (res.data?.success && res.data.buttons) {
              setQuickButtons(res.data.buttons);
            }
          })
          .catch(() => {});
      }

      // Set Welcome greeting based on role
      const hasValidName = user?.name && user.name !== 'User' && user.name !== 'Customer' && user.name !== 'Guest';
      const roleGreeting =
        userRole === 'rider'
          ? `नमस्ते ${user?.name || 'राइडर साथी'}! 🚴\nMain Ride Hub ka Delivery Assistant hun. Active delivery, navigation ya kamai se juda koi bhi sawal poochhein.`
          : userRole === 'supplier'
          ? `नमस्ते ${user?.restaurantName || user?.name || 'स्टोर पार्टनर'}! 🏪\nMain Ride Hub ka Store Assistant hun. Naye orders ya payouts mein madad ke liye tayar hun.`
          : hasValidName
          ? `नमस्ते ${user.name} जी! 👋\nRide Hub में आपका स्वागत है। बताइए, आज मैं आपकी क्या मदद कर सकता हूँ?`
          : `Hello sir! Welcome to Ride Hub. 👋\nबताइए, आज मैं आपकी क्या सहायता कर सकता हूँ?`;

      setMessages([
        {
          id: 'welcome_1',
          sender: 'agent',
          text: roleGreeting,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);

      if (initialPrompt && initialPrompt.trim()) {
        setTimeout(() => {
          handleSendMessage(initialPrompt.trim());
        }, 350);
      }
    } else {
      setMessages([]);
      setInputText('');
    }
  }, [visible, userRole, user, initialPrompt]);

  const sendInFlightRef = useRef<boolean>(false);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || loading || sendInFlightRef.current) return;
    sendInFlightRef.current = true;

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    try {
      const res = await api.post('/support/ai/chat', {
        message: text,
        role: userRole,
        userId: user?._id || user?.id,
        userName: user?.name || user?.restaurantName || 'User',
        sessionId,
      });

      if (res.data?.success) {
        const agentMsg: ChatMessage = {
          id: `msg_agent_${Date.now()}`,
          sender: 'agent',
          text: res.data.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          actionSuggested: res.data.actionSuggestion,
          source: res.data.source || null,
        };
        setMessages(prev => [...prev, agentMsg]);
        if (res.data.remainingLimit !== undefined) {
          setRemainingLimit(res.data.remainingLimit);
        }
      } else {
        throw new Error(res.data?.message || 'Failed to get response');
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `msg_err_${Date.now()}`,
        sender: 'agent',
        text: err.response?.data?.message || 'Network/server issue: Unable to fetch reply right now. You can retry or connect with Human Support.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actionSuggested: 'TRANSFER_SUPPORT',
        failedPrompt: text,
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      sendInFlightRef.current = false;
      setLoading(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const handleFeedback = async (msgIndex: number, feedback: 'thumbs_up' | 'thumbs_down') => {
    try {
      setMessages(prev => {
        const copy = [...prev];
        copy[msgIndex] = { ...copy[msgIndex], feedback };
        return copy;
      });

      // User requested: When clicking Thumbs Up, reply with "Thank you!"
      if (feedback === 'thumbs_up') {
        const rawName = user?.name && user.name !== 'User' && user.name !== 'Customer' ? user.name : '';
        const thanksText = rawName
          ? `Thank you ${rawName}! Your feedback means a lot to us. 🙏\n(धन्यवाद ${rawName} जी! आपकी प्रतिक्रिया हमारे लिए बहुत महत्वपूर्ण है।)`
          : `Thank you! Your feedback means a lot to us. 🙏\n(धन्यवाद! आपकी प्रतिक्रिया हमारे लिए बहुत महत्वपूर्ण है।)`;

        const thankMsg: ChatMessage = {
          id: `msg_thanks_${Date.now()}`,
          sender: 'agent',
          text: thanksText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages(prev => [...prev, thankMsg]);
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 150);
      } else if (feedback === 'thumbs_down') {
        const rawName = user?.name && user.name !== 'User' && user.name !== 'Customer' ? user.name : '';
        const sorryText = rawName
          ? `माफ़ कीजिए ${rawName} जी! हम आपकी बेहतर सहायता करना चाहते हैं। क्या आप कस्टमर केयर सपोर्ट से बात करना चाहेंगे?`
          : `माफ़ कीजिए सर! हम आपकी बेहतर सहायता करना चाहते हैं। क्या आप कस्टमर केयर सपोर्ट से बात करना चाहेंगे?`;

        const sorryMsg: ChatMessage = {
          id: `msg_sorry_${Date.now()}`,
          sender: 'agent',
          text: sorryText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          actionSuggested: 'TRANSFER_SUPPORT',
        };
        setMessages(prev => [...prev, sorryMsg]);
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 150);
      }

      await api.post('/support/ai/feedback', {
        sessionId,
        messageIndex: msgIndex,
        feedback,
      });
    } catch (_) {}
  };

  const handleInitiateSmartOrderTransfer = async () => {
    Alert.alert(
      '🚨 Smart Order Transfer Confirmation',
      'क्या आप वाहन खराबी या आपात स्थिति के कारण वर्तमान ऑर्डर ट्रांसफर करना चाहते हैं? सिस्टम पास के 3-5 किमी में उपलब्ध राइडर को लाउड अलर्ट भेजेगा।',
      [
        { text: 'रद्द करें (Cancel)', style: 'cancel' },
        {
          text: 'हाँ, ट्रांसफर शुरू करें (Transfer)',
          style: 'destructive',
          onPress: async () => {
            try {
              setTicketSubmitting(true);
              const targetBookingId = activeOrder?.bookingId || activeOrder?.rideId || activeOrder?._id;
              const rId = user?._id || user?.id;

              const res = await api.post('/bookings/transfer/request', {
                bookingId: targetBookingId,
                riderId: rId,
                reason: 'Vehicle Breakdown / Emergency (Reported via AI Agent)',
              });

              if (res.data?.success) {
                const otp = res.data.transferOtp || res.data.otp;
                const transferMsg: ChatMessage = {
                  id: `msg_transfer_${Date.now()}`,
                  sender: 'agent',
                  text: `✅ **Smart Order Transfer Initiated!**\n\n🔑 **Handover OTP: ${otp || '----'}**\n\nपास के 3-5 किमी में उपलब्ध डिलीवरी पार्टनर को लाउड अलर्ट भेज दिया गया है। जब नया राइडर आपकी लोकेशन पर पहुंचे, तो पैकेज सौंपते समय उन्हें यह 4-अंकों का OTP बताएं। सत्यापन होते ही ऑर्डर नए पार्टनर के नाम ट्रांसफर हो जाएगा!`,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                };
                setMessages(prev => [...prev, transferMsg]);
                setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 150);
              } else {
                Alert.alert('Transfer Notice', res.data?.message || 'Could not initiate transfer.');
              }
            } catch (err: any) {
              Alert.alert('Transfer Error', err.response?.data?.message || err.message || 'Error initiating order transfer.');
            } finally {
              setTicketSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const handleExecuteAction = async (actionType: string) => {
    try {
      setTicketSubmitting(true);
      const res = await api.post('/support/ai/create-ticket', {
        orderRef: activeOrder?.bookingId || '',
        type: actionType,
        description: `Triggered from AI Chat conversation by ${userRole} (${user?.name || 'User'})`,
        userId: user?._id || user?.id,
        role: userRole,
      });

      if (res.data?.success) {
        Alert.alert(
          actionType === 'CANCEL_REQUEST' ? 'Request Submitted 📋' : 'Support Ticket Raised 🎧',
          `Aapki ticket #${res.data.ticketId} create ho gayi hai. Support team review karke turant aapse sampark karegi.`
        );
      }
    } catch (e: any) {
      Alert.alert('Error', 'Support ticket create karne mein dikkat aayi. Kripya thodi der mein koshish karein.');
    } finally {
      setTicketSubmitting(false);
    }
  };

  const isDarkMode = isDark;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: isDarkMode ? '#0F172A' : '#F8FAFC' }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF', borderBottomColor: isDarkMode ? '#334155' : '#E2E8F0' }]}>
          <View style={styles.headerLeft}>
            <View style={styles.avatarWrap}>
              <Text style={{ fontSize: 24 }}>🤖</Text>
              <View style={styles.onlineDot} />
            </View>
            <View>
              <Text style={[styles.agentTitle, { color: isDarkMode ? '#FFFFFF' : '#0F172A' }]}>
                Ride Hub AI Assistant
              </Text>
              <Text style={styles.agentSub}>
                {userRole.toUpperCase()} SUPPORT • 24/7 ONLINE
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[styles.limitBadge, { backgroundColor: isDarkMode ? '#334155' : '#EEF2F6' }]}>
              <Text style={[styles.limitBadgeText, { color: isDarkMode ? '#CBD5E1' : '#475569' }]}>
                ⚡ {remainingLimit} left
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Text style={[styles.closeBtnText, { color: isDarkMode ? '#94A3B8' : '#64748B' }]}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Chat Messages */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.chatScroll}
          contentContainerStyle={{ padding: 14, paddingBottom: 20 }}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map((m, idx) => {
            const isUser = m.sender === 'user';
            return (
              <View key={m.id || idx} style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAgent]}>
                {!isUser && <Text style={{ fontSize: 18, marginRight: 6, alignSelf: 'flex-start' }}>🤖</Text>}
                <View
                  style={[
                    styles.bubble,
                    isUser
                      ? styles.bubbleUser
                      : [styles.bubbleAgent, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF', borderColor: isDarkMode ? '#334155' : '#E2E8F0' }],
                  ]}
                >
                  {!isUser && m.source && (
                    <Text style={{ fontSize: 9.5, fontWeight: '800', color: m.source === 'knowledge_base' ? '#10B981' : '#6366F1', marginBottom: 4 }}>
                      {m.source === 'knowledge_base' ? '⚡ Instant Help Guide' : m.source === 'llm' ? '🤖 AI Support' : '📋 Help Center'}
                    </Text>
                  )}
                  <Text style={[styles.bubbleText, { color: isUser ? '#FFFFFF' : (isDarkMode ? '#F1F5F9' : '#1E293B') }]}>
                    {m.text}
                  </Text>
                  <Text style={[styles.timestamp, { color: isUser ? '#93C5FD' : '#94A3B8' }]}>
                    {m.timestamp}
                  </Text>

                  {!isUser && m.failedPrompt && (
                    <TouchableOpacity
                      style={[styles.actionBannerBtn, { backgroundColor: '#F59E0B', marginTop: 8 }]}
                      onPress={() => handleSendMessage(m.failedPrompt || '')}
                      disabled={loading}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.actionBannerBtnText}>🔄 Retry Sending Message</Text>
                    </TouchableOpacity>
                  )}

                  {/* Feedback Buttons for Agent messages */}
                  {!isUser && (
                    <View style={styles.feedbackRow}>
                      <TouchableOpacity
                        style={[styles.feedbackBtn, m.feedback === 'thumbs_up' && styles.feedbackBtnActive]}
                        onPress={() => handleFeedback(idx, 'thumbs_up')}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.feedbackIcon}>👍</Text>
                        {m.feedback === 'thumbs_up' && <Text style={styles.feedbackLabel}>Helpful</Text>}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.feedbackBtn, m.feedback === 'thumbs_down' && styles.feedbackBtnActive]}
                        onPress={() => handleFeedback(idx, 'thumbs_down')}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.feedbackIcon}>👎</Text>
                        {m.feedback === 'thumbs_down' && <Text style={styles.feedbackLabel}>Unhelpful</Text>}
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Action buttons if suggested */}
                  {!isUser && m.actionSuggested === 'CANCEL_REQUEST' && (
                    <TouchableOpacity
                      style={styles.actionBannerBtn}
                      onPress={() => handleExecuteAction('CANCEL_REQUEST')}
                      disabled={ticketSubmitting}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.actionBannerBtnText}>
                        {ticketSubmitting ? 'Submitting...' : '❌ Send Cancel Request to Support'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {!isUser && m.actionSuggested === 'INITIATE_ORDER_TRANSFER' && (
                    <TouchableOpacity
                      style={[styles.actionBannerBtn, { backgroundColor: '#DC2626' }]}
                      onPress={handleInitiateSmartOrderTransfer}
                      disabled={ticketSubmitting}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.actionBannerBtnText}>
                        {ticketSubmitting ? 'Searching Nearby Partners...' : '🚨 Confirm Order Transfer & Get OTP'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {!isUser && m.actionSuggested === 'TRANSFER_SUPPORT' && (
                    <TouchableOpacity
                      style={[styles.actionBannerBtn, { backgroundColor: '#0066FF' }]}
                      onPress={() => handleExecuteAction('TRANSFER_SUPPORT')}
                      disabled={ticketSubmitting}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.actionBannerBtnText}>
                        {ticketSubmitting ? 'Connecting...' : '🎧 Connect with Human Support'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}

          {loading && (
            <View style={[styles.msgRow, styles.msgRowAgent]}>
              <Text style={{ fontSize: 18, marginRight: 6 }}>🤖</Text>
              <View style={[styles.bubble, styles.bubbleAgent, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF', borderColor: isDarkMode ? '#334155' : '#E2E8F0', paddingVertical: 10, paddingHorizontal: 14 }]}>
                <BouncingDots isDark={isDarkMode} />
              </View>
            </View>
          )}
        </ScrollView>

        {/* Quick Suggestion Chips */}
        {quickButtons.length > 0 && (
          <View style={[styles.chipsContainer, { backgroundColor: isDarkMode ? '#0F172A' : '#F8FAFC' }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}>
              {quickButtons.map(btn => (
                <TouchableOpacity
                  key={btn.id}
                  style={[styles.chip, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF', borderColor: isDarkMode ? '#334155' : '#CBD5E1' }]}
                  onPress={() => handleSendMessage(btn.prompt)}
                  activeOpacity={0.7}
                  disabled={loading}
                >
                  <Text style={[styles.chipText, { color: isDarkMode ? '#38BDF8' : '#0066FF' }]}>
                    {btn.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Input Bar */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.inputBar, { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF', borderTopColor: isDarkMode ? '#334155' : '#E2E8F0' }]}>
            <TextInput
              style={[styles.textInput, { color: isDarkMode ? '#FFFFFF' : '#0F172A' }]}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Hindi, English ya Hinglish mein likhein..."
              placeholderTextColor="#94A3B8"
              multiline
              maxLength={400}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!inputText.trim() || loading) && styles.sendBtnDisabled]}
              onPress={() => handleSendMessage()}
              disabled={!inputText.trim() || loading}
              activeOpacity={0.8}
            >
              <Text style={styles.sendBtnText}>➔</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

export default AIAgentChatModal;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarWrap: {
    position: 'relative',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  agentTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  agentSub: {
    fontSize: 10.5,
    color: '#0066FF',
    fontWeight: '700',
    marginTop: 1,
  },
  limitBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  limitBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 20,
    fontWeight: '800',
  },
  chatScroll: {
    flex: 1,
  },
  msgRow: {
    flexDirection: 'row',
    marginVertical: 6,
    maxWidth: '88%',
  },
  msgRowUser: {
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
  },
  msgRowAgent: {
    alignSelf: 'flex-start',
    justifyContent: 'flex-start',
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUser: {
    backgroundColor: '#0066FF',
    borderBottomRightRadius: 4,
  },
  bubbleAgent: {
    borderWidth: 1,
    borderBottomLeftRadius: 4,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  timestamp: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
    fontWeight: '600',
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#334155',
  },
  feedbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
  },
  feedbackBtnActive: {
    backgroundColor: 'rgba(0, 102, 255, 0.2)',
  },
  feedbackIcon: {
    fontSize: 13,
  },
  feedbackLabel: {
    fontSize: 10.5,
    color: '#0066FF',
    fontWeight: '700',
    marginLeft: 4,
  },
  actionBannerBtn: {
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 8,
    alignItems: 'center',
  },
  actionBannerBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  chipsContainer: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  chip: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    maxHeight: 100,
    paddingVertical: 8,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0066FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#94A3B8',
    opacity: 0.5,
  },
  sendBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
});
