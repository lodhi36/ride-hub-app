import React, { useState, useEffect } from 'react';
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
  SafeAreaView,
} from 'react-native';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import SupportChatModal, { SupportTicketData } from './SupportChatModal';
import AIAgentChatModal from './AIAgentChatModal';

interface StoreHelpModalProps {
  visible: boolean;
  onClose: () => void;
  storeUser: any;
  categoryName?: string;
  activeOrders?: any[];
}

export const StoreHelpModal: React.FC<StoreHelpModalProps> = ({
  visible,
  onClose,
  storeUser,
  categoryName = 'Store',
  activeOrders = [],
}) => {
  const { isDark, currentColors } = useTheme();
  const [currentView, setCurrentView] = useState<'main' | 'issue_form' | 'tickets_list'>('main');
  const [selectedIssue, setSelectedIssue] = useState<any | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // User Tickets List
  const [myTickets, setMyTickets] = useState<SupportTicketData[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  // Active Chat Modal
  const [activeChatTicket, setActiveChatTicket] = useState<SupportTicketData | null>(null);
  const [showChatModal, setShowChatModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  const storeId = storeUser?._id || storeUser?.id || 'store_anon';
  const displayCategory = categoryName || storeUser?.categoryName || 'Store';

  const STORE_ISSUES = [
    { id: 'rider_delayed', title: '🛵 राइडर पिकअप के लिए नहीं पहुंचा (Rider Not Arrived)', desc: 'ऑर्डर तैयार है लेकिन राइडर असाइन नहीं हुआ या देरी कर रहा है' },
    { id: 'order_cancellation', title: '❌ तैयारी के बाद आर्डर कैंसिल (Order Cancellation Dispute)', desc: 'सामान तैयार होने के बाद ग्राहक द्वारा रद्द किया गया' },
    { id: 'out_of_stock', title: '📦 स्टॉक समाप्त / मेनू अनुपलब्धता (Item Out of Stock)', desc: 'कुछ आइटम उपलब्ध नहीं हैं, मेनू अपडेट करने में सहायता' },
    { id: 'settlement_payout', title: '💰 दैनिक भुगतान और सेटलमेंट (Daily Payout & Settlement)', desc: 'बिक्री राशि बैंक खाते में प्राप्त नहीं हुई' },
    { id: 'store_timing_location', title: '📍 स्टोर का समय व लोकेशन (Store Timings & GPS)', desc: 'दुकान का समय, पता या फ़ोन नंबर अपडेट करें' },
    { id: 'custom_support_ticket', title: '🎫 नया सपोर्ट टिकट दर्ज करें (Raise Custom Ticket)', desc: 'किसी अन्य समस्या के लिए सीधे सहायता टीम से जुड़ें' },
  ];

  useEffect(() => {
    if (visible) {
      setCurrentView('main');
      setSelectedIssue(null);
      setSelectedOrder(null);
      setRemarks('');
      loadMyTickets();
    }
  }, [visible]);

  const loadMyTickets = async () => {
    try {
      setLoadingTickets(true);
      const res = await api.get(`/support/user-tickets/${storeId}`);
      if (res.data?.success && Array.isArray(res.data.tickets)) {
        setMyTickets(res.data.tickets);
      }
    } catch (err) {
      console.log('Error loading store tickets:', err);
    } finally {
      setLoadingTickets(false);
    }
  };

  const handleSelectIssue = (issue: any, order?: any) => {
    setSelectedIssue(issue);
    if (order) setSelectedOrder(order);
    setCurrentView('issue_form');
  };

  const handleSubmitTicket = async () => {
    if (!selectedIssue) return;
    setSubmitting(true);

    try {
      const orderRef = selectedOrder?.bookingId || selectedOrder?._id || null;
      const payload = {
        orderRef,
        bookingId: orderRef,
        category: selectedIssue.id || 'other',
        storeCategory: displayCategory,
        categoryName: displayCategory,
        issueCategory: `${displayCategory} Support - ${selectedIssue.title}`,
        issueTitle: selectedIssue.title || `${displayCategory} Support Request`,
        description: remarks.trim() ? `${selectedIssue.title}: ${remarks.trim()}` : selectedIssue.title,
        priority: 'normal',
        requesterRole: 'restaurant',
        requesterId: String(storeId),
        requesterRef: String(storeId),
        requesterName: storeUser?.restaurantName || storeUser?.name || `${displayCategory} Partner`,
        requesterPhone: storeUser?.phoneNumber || storeUser?.phone || '',
      };

      const res = await api.post('/support/ticket/create', payload);
      if (res.data?.success && res.data?.ticket) {
        const createdTicket = res.data.ticket;
        setRemarks('');
        loadMyTickets();

        // Open live chat directly with support agent!
        setActiveChatTicket(createdTicket);
        setShowChatModal(true);
        setCurrentView('main');
      } else {
        Alert.alert('त्रुटि', res.data?.message || 'सपोर्ट टिकट दर्ज नहीं हो सका।');
      }
    } catch (err: any) {
      console.error('Error submitting store ticket:', err);
      Alert.alert('त्रुटि', err.message || 'सपोर्ट टिकट दर्ज नहीं हो सका।');
    } finally {
      setSubmitting(false);
    }
  };

  const renderHeader = (title: string, onBack?: () => void) => (
    <View style={styles.headerRow}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ width: 34 }} />
      )}
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
        <Text style={styles.closeBtnText}>✕</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <>
      <Modal visible={visible && !showChatModal} animationType="slide" transparent onRequestClose={onClose}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.sheetContainer, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
            {/* VIEW: MAIN MENU */}
            {currentView === 'main' && (
              <>
                {renderHeader(`🏪 ${displayCategory} सहायता केंद्र (Help & Support)`)}

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                  {/* Top Stats Banner */}
                  <View style={[styles.storeInfoBanner, { backgroundColor: isDark ? '#0F172A' : '#EFF6FF' }]}>
                    <Text style={[styles.storeInfoName, { color: isDark ? '#F1F5F9' : '#1E40AF' }]}>
                      {storeUser?.restaurantName || storeUser?.name || 'Store Partner'}
                    </Text>
                    <Text style={styles.storeInfoCategory}>
                      श्रेणी: {displayCategory} • 24x7 मर्चेंट सपोर्ट
                    </Text>
                  </View>

                  {/* 🤖 Chat with Store AI Agent */}
                  <TouchableOpacity
                    style={[styles.menuRow, { backgroundColor: isDark ? 'rgba(0,102,255,0.12)' : '#EFF6FF', borderColor: '#3B82F6', borderWidth: 1 }]}
                    onPress={() => setShowAiModal(true)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.iconWrap, { backgroundColor: '#3B82F6' }]}>
                      <Text style={{ fontSize: 20 }}>🤖</Text>
                    </View>
                    <View style={styles.menuTextCol}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.menuTitle, { color: isDark ? '#FFFFFF' : '#1E40AF', fontWeight: '800' }]}>
                          Chat with Store AI Agent
                        </Text>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' }} />
                      </View>
                      <Text style={[styles.menuSub, { color: isDark ? '#93C5FD' : '#3B82F6' }]}>
                        Naye orders, daily payout & menu stock सहायता
                      </Text>
                    </View>
                    <Text style={[styles.chevron, { color: '#3B82F6', fontWeight: '800' }]}>➔</Text>
                  </TouchableOpacity>

                  {/* My Tickets Button */}
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
                          सपोर्ट टिकट्स (Merchant Tickets)
                        </Text>
                        {myTickets.length > 0 && (
                          <View style={styles.badgePill}>
                            <Text style={styles.badgePillText}>{myTickets.length}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.menuSub}>
                        {myTickets.length > 0
                          ? `${myTickets.length} सक्रिय/पूर्ण टिकट्स की स्थिति जांचें`
                          : 'टिकटों की स्थिति की जाँच करें'}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>

                  <View style={styles.divider} />

                  <Text style={[styles.sectionHeader, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                    समस्या का प्रकार चुनें (SELECT ISSUE TOPIC)
                  </Text>

                  {STORE_ISSUES.map((issue) => (
                    <TouchableOpacity
                      key={issue.id}
                      style={styles.topicRow}
                      onPress={() => handleSelectIssue(issue)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.topicTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                          {issue.title}
                        </Text>
                        <Text style={styles.topicSub}>{issue.desc}</Text>
                      </View>
                      <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {/* VIEW: ISSUE FORM / RAISE TICKET */}
            {currentView === 'issue_form' && selectedIssue && (
              <>
                {renderHeader(selectedIssue.title, () => setCurrentView('main'))}

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, paddingBottom: 24 }}>
                  <Text style={[styles.formLabel, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                    समस्या का विवरण दर्ज करें:
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
                    placeholder="कृपया समस्या का विवरण लिखें ताकि सहायता टीम तुरंत समाधान कर सके..."
                    placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                    value={remarks}
                    onChangeText={setRemarks}
                    multiline
                    numberOfLines={4}
                  />

                  <TouchableOpacity
                    style={[styles.submitBtn, { backgroundColor: submitting ? '#94A3B8' : '#F25C05' }]}
                    onPress={handleSubmitTicket}
                    disabled={submitting}
                    activeOpacity={0.8}
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.submitBtnText}>🎫 टिकट दर्ज करें और लाइव चैट करें →</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.directCallBtn}
                    onPress={() => Linking.openURL('tel:18001234567')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.directCallText}>📞 पार्टनर हेल्पलाइन 1800-123-4567 पर कॉल करें</Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            )}

            {/* VIEW: TICKETS LIST */}
            {currentView === 'tickets_list' && (
              <>
                {renderHeader('आपके सपोर्ट टिकट्स', () => setCurrentView('main'))}

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, paddingBottom: 24 }}>
                  {loadingTickets ? (
                    <ActivityIndicator size="small" color="#F25C05" style={{ marginVertical: 30 }} />
                  ) : myTickets.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Text style={{ fontSize: 36, marginBottom: 10 }}>🎫</Text>
                      <Text style={[styles.emptyTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                        कोई सक्रिय टिकट नहीं है
                      </Text>
                    </View>
                  ) : (
                    myTickets.map((t) => (
                      <TouchableOpacity
                        key={t.ticketId || t._id}
                        style={[
                          styles.ticketCard,
                          { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' },
                        ]}
                        onPress={() => {
                          setActiveChatTicket(t);
                          setShowChatModal(true);
                        }}
                        activeOpacity={0.8}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={[styles.ticketIdText, { color: '#F25C05' }]}>
                            {t.ticketId || t.caseNumber}
                          </Text>
                          <View
                            style={[
                              styles.ticketStatusBadge,
                              {
                                backgroundColor:
                                  t.status === 'RESOLVED' ? '#10B981' : t.status === 'IN_PROGRESS' ? '#F59E0B' : '#3B82F6',
                              },
                            ]}
                          >
                            <Text style={styles.ticketStatusBadgeText}>{t.status}</Text>
                          </View>
                        </View>

                        <Text style={[styles.ticketTitleText, { color: isDark ? '#F1F5F9' : '#0F172A' }]} numberOfLines={1}>
                          {t.issueTitle || t.category}
                        </Text>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                          <Text style={styles.ticketChatPrompt}>💬 लाइव चैट खोलें →</Text>
                          {t.createdAt && (
                            <Text style={styles.ticketDateText}>
                              {new Date(t.createdAt).toLocaleDateString('hi-IN', { day: '2-digit', month: 'short' })}
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* 2-Way Real-time Live Chat Modal */}
      {activeChatTicket && (
        <SupportChatModal
          visible={showChatModal}
          onClose={() => setShowChatModal(false)}
          ticket={activeChatTicket}
          currentUser={storeUser}
          userRole="restaurant"
          onTicketUpdated={(updated) => {
            setActiveChatTicket(updated);
            loadMyTickets();
          }}
        />
      )}

      {/* ── 24/7 Store AI Agent Chat Modal ── */}
      <AIAgentChatModal
        visible={showAiModal}
        onClose={() => setShowAiModal(false)}
        userRole="supplier"
      />
    </>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '85%',
    paddingBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: 26,
    color: '#F25C05',
    fontWeight: '700',
    lineHeight: 28,
  },
  headerTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  storeInfoBanner: {
    margin: 14,
    padding: 12,
    borderRadius: 12,
  },
  storeInfoName: {
    fontSize: 15,
    fontWeight: '800',
  },
  storeInfoCategory: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
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
    borderRadius: 12,
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
  },
  menuSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  chevron: {
    fontSize: 20,
    color: '#94A3B8',
    fontWeight: '600',
    marginLeft: 8,
  },
  badgePill: {
    backgroundColor: '#10B981',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgePillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginHorizontal: 16,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 8,
  },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  topicTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  topicSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 36,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  remarksInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    textAlignVertical: 'top',
    minHeight: 100,
    marginBottom: 16,
  },
  submitBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  directCallBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  directCallText: {
    fontSize: 12,
    color: '#F25C05',
    fontWeight: '600',
  },
  ticketCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  ticketIdText: {
    fontSize: 13,
    fontWeight: '800',
  },
  ticketStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ticketStatusBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  ticketTitleText: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 6,
  },
  ticketChatPrompt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F25C05',
  },
  ticketDateText: {
    fontSize: 11,
    color: '#94A3B8',
  },
});

export default StoreHelpModal;
