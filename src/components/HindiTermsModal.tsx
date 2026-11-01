import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import axios from 'axios';
import { BASE_URL as API_BASE_URL } from '../config/apiConfig';
import { useTheme } from '../context/ThemeContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface HindiTermsModalProps {
  visible: boolean;
  role: 'customer' | 'rider' | 'supplier' | 'delivery_partner' | 'seller_partner';
  userId?: string;
  defaultName?: string;
  onAccept: (consentData: { signedName: string; clausesAccepted: string[]; version: string; language?: string }) => void;
  onClose?: () => void;
}

interface ClauseItem {
  clauseId: string;
  order: number;
  icon?: string;
  title: string;
  titleHi?: string;
  content: string;
  contentHi?: string;
  isMandatory: boolean;
}

interface TermsSet {
  title: string;
  titleHi: string;
  subtitle: string;
  subtitleHi: string;
  clauses: ClauseItem[];
}

const ALL_TERMS: Record<string, TermsSet> = {
  customer: {
    title: 'Ride Hub — Customer Terms & Conditions',
    titleHi: 'Ride Hub — ग्राहक सेवा नियम एवं शर्तें',
    subtitle: 'Please review and accept our fair-usage policy and service agreement.',
    subtitleHi: 'कृपया निष्पक्ष सेवा नीति एवं आधिकारिक नियमों को ध्यान से पढ़ें।',
    clauses: [
      {
        clauseId: 'cust_1_account',
        order: 1,
        icon: '🛡️',
        title: '1. Account Integrity & Accurate Details',
        titleHi: '१. खाता सुरक्षा एवं सही जानकारी',
        content: 'Customers must provide their authentic name, active mobile number, and accurate delivery address. Any identity spoofing or fraudulent activity will result in immediate account suspension.',
        contentHi: 'ग्राहक अपना वास्तविक नाम, वैध मोबाइल नंबर एवं सही डिलीवरी पता दर्ज करने के लिए जिम्मेदार है। खाते के दुरुपयोग पर खाता तत्काल निलंबित किया जा सकता है।',
        isMandatory: true,
      },
      {
        clauseId: 'cust_2_cancellation',
        order: 2,
        icon: '🔄',
        title: '2. Fair Cancellation & Refund Policy',
        titleHi: '२. ऑर्डर रद्दीकरण एवं रिफंड नीति',
        content: 'A full refund is provided if the order is canceled before food preparation starts. Once preparation begins or a rider is dispatched, standard food wastage and operational deductions apply.',
        contentHi: 'रेस्तरां द्वारा खाना तैयार करने से पहले रद्दीकरण पर पूरा रिफंड मिलेगा। खाना तैयार होने के बाद या राइडर के स्टोर पहुँचने पर खाद्य बर्बादी के कारण रिफंड कटौती लागू होगी।',
        isMandatory: true,
      },
      {
        clauseId: 'cust_3_rider_comp',
        order: 3,
        icon: '⚡',
        title: '3. Rider ₹20 Arrival Guarantee Protection',
        titleHi: '३. राइडर की ₹20 आगमन सुरक्षा',
        content: 'If the assigned rider has reached the merchant/store and the order is subsequently canceled by the customer, a mandatory ₹20 arrival fee will be deducted to compensate the rider for time and fuel.',
        contentHi: 'यदि राइडर स्टोर/रेस्तरां पहुँच चुका है और ग्राहक द्वारा ऑर्डर रद्द किया जाता है, तो राइडर के समय एवं ईंधन व्यय हेतु ₹20 की अनिवार्य भरपाई राशि काटी जाएगी।',
        isMandatory: true,
      },
      {
        clauseId: 'cust_4_delivery_conduct',
        order: 4,
        icon: '📦',
        title: '4. Delivery Etiquette & OTP Handover',
        titleHi: '४. डिलीवरी एवं शिष्टाचार',
        content: 'Please collect your delivery promptly upon rider arrival and share the secure delivery OTP. Treat delivery partners and merchants with respect, dignity, and courteous conduct.',
        contentHi: 'डिलीवरी के समय सही ओटीपी (OTP) साझा करें। राइडर एवं सप्लायर पार्टनर के साथ सम्मानजनक व्यवहार करें।',
        isMandatory: true,
      },
    ],
  },
  rider: {
    title: 'Ride Hub — Rider / Delivery Partner Terms & Conditions',
    titleHi: 'Ride Hub — राइडर / डिलीवरी पार्टनर नियम एवं शर्तें',
    subtitle: 'Transparent payouts, ₹20 arrival guarantee & safety guidelines.',
    subtitleHi: 'पारदर्शी भुगतान, ₹20 आगमन सुरक्षा एवं सुरक्षा दिशानिर्देश।',
    clauses: [
      {
        clauseId: 'rider_1_verification',
        order: 1,
        icon: '🪪',
        title: '1. Document Verification & Live GPS Tracking',
        titleHi: '१. दस्तावेज सत्यापन एवं लाइव लोकेशन',
        content: 'Riders must hold a valid Driving License, vehicle registration, and active insurance. Real-time GPS location sharing is mandatory while on active delivery duty.',
        contentHi: 'राइडर के पास वैध ड्राइविंग लाइसेंस, वाहन और बीमा होना अनिवार्य है। ड्यूटी के दौरान वास्तविक जीपीएस लोकेशन साझा करना आवश्यक है।',
        isMandatory: true,
      },
      {
        clauseId: 'rider_2_arrival_guarantee',
        order: 2,
        icon: '💰',
        title: '2. Guaranteed ₹20 Arrival Payout Protection',
        titleHi: '२. ₹20 सुनिश्चित आगमन पारिश्रमिक (Guaranteed Arrival Fee)',
        content: 'When you arrive at the merchant and mark arrival in the app, you will receive a guaranteed minimum ₹20 compensation if the customer or merchant cancels the order.',
        contentHi: 'जब राइडर स्टोर/रेस्तरां पहुँच जाता है और सिस्टम में आगमन दर्ज हो जाता है, यदि ऑर्डर रद्द होता है तो राइडर को ₹20 का न्यूनतम सुनिश्चित आगमन भुगतान मिलेगा।',
        isMandatory: true,
      },
      {
        clauseId: 'rider_3_delivery_safety',
        order: 3,
        icon: '🛵',
        title: '3. Food Safety, Hygiene & Sealed Thermal Bags',
        titleHi: '३. खाद्य सुरक्षा एवं हाइजीन',
        content: 'Transport orders inside clean, insulated thermal bags. Maintain package seals intact and only complete delivery upon successful customer OTP verification.',
        contentHi: 'ऑर्डर को सुरक्षित थर्मल बैग में ले जाएँ। पार्सल के साथ कोई छेड़छाड़ न करें और ओटीपी (OTP) सत्यापन के बाद ही डिलीवरी पूरी करें।',
        isMandatory: true,
      },
      {
        clauseId: 'rider_4_payouts',
        order: 4,
        icon: '💳',
        title: '4. Digital Wallet & Transparent Payouts',
        titleHi: '४. वॉलेट एवं पारदर्शी भुगतान',
        content: 'Delivery earnings, distance bonuses, and arrival fees are credited directly into your wallet with transparent statements and instant UPI/bank withdrawal.',
        contentHi: 'डिलीवरी शुल्क, दूरी भत्ता एवं आगमन शुल्क सीधे वॉलेट में जमा होंगे। राइडर बैंक खाते या यूपीआई में पारदर्शी रूप से निकासी कर सकते हैं।',
        isMandatory: true,
      },
    ],
  },
  supplier: {
    title: 'Ride Hub — Merchant / Supplier Terms & Conditions',
    titleHi: 'Ride Hub — सप्लायर / रेस्तरां पार्टनर नियम एवं शर्तें',
    subtitle: 'Category compliance, real-time stock & gross value protection.',
    subtitleHi: 'कैटेगरी नियम, लाइव स्टॉक एवं सुरक्षित भुगतान।',
    clauses: [
      {
        clauseId: 'supp_1_category_restriction',
        order: 1,
        icon: '🏪',
        title: '1. Authorized Category & Catalog Integrity',
        titleHi: '१. अधिकृत कैटेगरी एवं आइटम प्रतिबंध',
        content: 'Merchants may only list items under their officially admin-approved business categories. Listing items outside approved categories will lead to catalog delisting.',
        contentHi: 'सप्लायर केवल एडमिन द्वारा स्वीकृत अपनी आधिकारिक बिजनेस कैटेगरी में ही आइटम जोड़ सकते हैं। अनधिकृत कैटेगरी में सामान जोड़ना प्रतिबंधित है।',
        isMandatory: true,
      },
      {
        clauseId: 'supp_2_realtime_stock',
        order: 2,
        icon: '📶',
        title: '2. Real-Time Online Status & Stock Availability',
        titleHi: '२. रियल-टाइम ऑनलाइन/ऑफलाइन एवं स्टॉक स्टेटस',
        content: 'Keep your store online only during active business hours. Immediately mark sold-out items as Out of Stock. When offline, all menu listings are hidden from customer search.',
        contentHi: 'जब दुकान खुली हो तभी ऑनलाइन रहें। सामान समाप्त होने पर उसे तुरंत आउट-ऑफ-स्टॉक करें। जब स्टोर ऑफलाइन होगा, लिस्टिंग्स ऐप से स्वतः हट जाएँगी।',
        isMandatory: true,
      },
      {
        clauseId: 'supp_3_quality_packaging',
        order: 3,
        icon: '🥗',
        title: '3. FSSAI Quality & Spill-Proof Packaging',
        titleHi: '३. खाद्य गुणवत्ता एवं स्वच्छ पैकेजिंग',
        content: 'All food and grocery items must comply with FSSAI hygiene standards and be handed over to delivery partners in tamper-evident, sealed spill-proof packages.',
        contentHi: 'एफएसएसएआई (FSSAI) मानकों के अनुरूप ताजा, स्वच्छ एवं उच्च गुणवत्ता वाला सामान सुरक्षित सील-पैक डिब्बों में राइडर को सौंपें।',
        isMandatory: true,
      },
      {
        clauseId: 'supp_4_financial_settlement',
        order: 4,
        icon: '📊',
        title: '4. Gross Value Protection & Settlements',
        titleHi: '४. पारदर्शी वित्तीय हिसाब एवं कमीशन',
        content: 'Merchants receive up to 80% gross value protection on prepared orders canceled through no fault of the store. Clear commission summaries are accessible 24/7.',
        contentHi: 'स्वीकृत ऑर्डर के तैयार होने के बाद रद्द होने की स्थिति में रेस्तरां को 80% तक ग्रॉस वैल्यू सुरक्षा प्राप्त होगी। सभी कमीशन एवं कटौती की स्पष्ट रसीद उपलब्ध होगी।',
        isMandatory: true,
      },
    ],
  },
};

export const HindiTermsModal: React.FC<HindiTermsModalProps> = ({
  visible,
  role,
  userId,
  defaultName = '',
  onAccept,
  onClose,
}) => {
  const normalizedRole = (role === 'delivery_partner' || role === 'rider')
    ? 'rider'
    : (role === 'supplier' || role === 'seller_partner')
    ? 'supplier'
    : 'customer';

  const { isDark, currentColors } = useTheme(normalizedRole);
  const defaultTerms = ALL_TERMS[normalizedRole] || ALL_TERMS.customer;

  // Language state: default English with 1-tap Hindi toggle
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const [termsData, setTermsData] = useState<TermsSet>(defaultTerms);

  // Default check all clauses for fast, seamless one-tap continuation
  const [selectedClauses, setSelectedClauses] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    defaultTerms.clauses.forEach(c => { init[c.clauseId] = true; });
    return init;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (visible) {
      setErrorMessage('');
      setTermsData(ALL_TERMS[normalizedRole] || ALL_TERMS.customer);
      fetchTerms();
    }
  }, [visible, role, defaultName, normalizedRole]);

  const fetchTerms = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/terms/${normalizedRole}`, { timeout: 4000 });
      if (response.data?.terms?.clauses) {
        // Backend terms loaded
      }
    } catch (e) {
      // Use local high-fidelity terms
    }
  };

  const toggleClause = (id: string) => {
    setSelectedClauses(prev => ({ ...prev, [id]: !prev[id] }));
    setErrorMessage('');
  };

  const isAllSelected = termsData.clauses.length > 0 && termsData.clauses.every(c => selectedClauses[c.clauseId]);
  const acceptedCount = termsData.clauses.filter(c => selectedClauses[c.clauseId]).length;

  const toggleSelectAll = () => {
    const nextState = !isAllSelected;
    const updated: Record<string, boolean> = {};
    termsData.clauses.forEach(c => {
      updated[c.clauseId] = nextState;
    });
    setSelectedClauses(updated);
    setErrorMessage('');
  };

  const handleAccept = async () => {
    setErrorMessage('');
    const mandatoryClauses = termsData.clauses.filter(c => c.isMandatory);
    const missing = mandatoryClauses.filter(c => !selectedClauses[c.clauseId]);

    if (missing.length > 0) {
      setErrorMessage(
        language === 'en'
          ? 'Please check "Accept All Terms" or tick all clauses to proceed.'
          : 'आगे बढ़ने के लिए कृपया ऊपर "सभी नियम स्वीकार करें" पर टिक करें।'
      );
      return;
    }

    const resolvedName = defaultName.trim() || 'Verified User';

    setIsSubmitting(true);
    const acceptedList = Object.keys(selectedClauses).filter(k => selectedClauses[k]);

    try {
      await axios.post(`${API_BASE_URL}/api/terms/accept`, {
        userId,
        role: normalizedRole,
        signedName: resolvedName,
        clausesAccepted: acceptedList,
        version: '1.0',
        language,
      }, { timeout: 6000 });
    } catch (apiErr) {
      console.log('Terms accept API note:', apiErr);
    } finally {
      setIsSubmitting(false);
      onAccept({
        signedName: resolvedName,
        clausesAccepted: acceptedList,
        version: '1.0',
        language,
      });
    }
  };

  const isEn = language === 'en';

  return (
    <Modal visible={visible} animationType="fade" transparent={true}>
      <SafeAreaView style={styles.overlay}>
        <View style={[styles.modalCard, isDark && { backgroundColor: currentColors.card, borderColor: currentColors.border, borderWidth: 1 }]}>
          {/* Header - Ride Hub Vibrant Blue Theme */}
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <View style={styles.badgePill}>
                <Text style={styles.badgeText}>
                  {isEn ? '🛡️ OFFICIAL TERMS' : '🛡️ आधिकारिक नियम'}
                </Text>
              </View>

              {/* Language Switcher */}
              <View style={styles.langSwitchWrap}>
                <TouchableOpacity
                  style={[styles.langBtn, isEn && styles.langBtnActive]}
                  onPress={() => setLanguage('en')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.langBtnText, isEn && styles.langBtnTextActive]}>EN</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.langBtn, !isEn && styles.langBtnActive]}
                  onPress={() => setLanguage('hi')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.langBtnText, !isEn && styles.langBtnTextActive]}>हिन्दी</Text>
                </TouchableOpacity>
              </View>

              {onClose && (
                <TouchableOpacity style={styles.closeHeaderBtn} onPress={onClose}>
                  <Text style={styles.closeHeaderBtnText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.headerTitle}>
              {isEn ? termsData.title : termsData.titleHi}
            </Text>
            <Text style={styles.headerSubtitle}>
              {isEn ? termsData.subtitle : termsData.subtitleHi}
            </Text>
          </View>

          {/* Master Select All Bar */}
          <TouchableOpacity
            style={[
              styles.selectAllBar,
              isDark && { backgroundColor: currentColors.elevatedSurface, borderBottomColor: currentColors.border },
              isAllSelected && (isDark ? { backgroundColor: '#1A2332', borderBottomColor: '#0066FF' } : styles.selectAllBarActive)
            ]}
            activeOpacity={0.85}
            onPress={toggleSelectAll}
          >
            <View style={[styles.checkbox, isDark && { backgroundColor: currentColors.card, borderColor: currentColors.border }, isAllSelected && styles.checkboxActive]}>
              {isAllSelected && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.selectAllTitle, isDark && { color: isAllSelected ? '#60A5FA' : currentColors.primaryText }, isAllSelected && !isDark && styles.selectAllTitleActive]}>
                {isEn
                  ? (isAllSelected ? '✓ All Clauses Accepted' : 'Accept All Terms & Conditions')
                  : (isAllSelected ? '✓ सभी नियम स्वीकृत हैं' : 'सभी नियम एक साथ स्वीकार करें')}
              </Text>
              <Text style={[styles.selectAllSub, isDark && { color: currentColors.secondaryText }]}>
                {isEn ? 'Tap to toggle all clauses at once' : 'एक क्लिक में सभी शर्तों पर सहमति दें'}
              </Text>
            </View>
            <View style={[styles.countBadge, isDark && { backgroundColor: currentColors.card }, isAllSelected && (isDark ? { backgroundColor: '#0066FF' } : styles.countBadgeActive)]}>
              <Text style={[styles.countBadgeText, isDark && { color: '#60A5FA' }, isAllSelected && (isDark ? { color: '#FFFFFF' } : styles.countBadgeTextActive)]}>
                {acceptedCount}/{termsData.clauses.length}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Error Banner */}
          {Boolean(errorMessage) && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
            </View>
          )}

          {/* Clauses Scroll Area */}
          <ScrollView
            style={[styles.clausesScroll, isDark && { backgroundColor: currentColors.background }]}
            contentContainerStyle={styles.clausesScrollContent}
            showsVerticalScrollIndicator={true}
          >
            {termsData.clauses.map((clause) => {
              const isChecked = Boolean(selectedClauses[clause.clauseId]);
              return (
                <TouchableOpacity
                  key={clause.clauseId}
                  style={[
                    styles.clauseCard,
                    isDark && { backgroundColor: currentColors.card, borderColor: currentColors.border },
                    isChecked && (isDark ? { backgroundColor: currentColors.elevatedSurface, borderColor: '#0066FF' } : styles.clauseCardChecked)
                  ]}
                  activeOpacity={0.88}
                  onPress={() => toggleClause(clause.clauseId)}
                >
                  <View style={styles.clauseTopRow}>
                    <View style={[styles.checkbox, isDark && { backgroundColor: currentColors.elevatedSurface, borderColor: currentColors.border }, isChecked && styles.checkboxActive]}>
                      {isChecked && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={styles.clauseIcon}>{clause.icon || '📜'}</Text>
                    <Text style={[styles.clauseTitle, isDark && { color: currentColors.primaryText }, isChecked && (isDark ? { color: '#60A5FA' } : styles.clauseTitleChecked)]}>
                      {isEn ? clause.title : (clause.titleHi || clause.title)}
                    </Text>
                  </View>

                  <Text style={[styles.clauseContent, isDark && { color: currentColors.secondaryText }]}>
                    {isEn ? clause.content : (clause.contentHi || clause.content)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Modern Footer with Big Vibrant Blue "OK, Accept & Continue" */}
          <View style={[styles.footer, isDark && { backgroundColor: currentColors.card, borderTopColor: currentColors.border }]}>
            {onClose && (
              <TouchableOpacity style={[styles.cancelBtn, isDark && { borderColor: currentColors.border }]} onPress={onClose} disabled={isSubmitting}>
                <Text style={[styles.cancelBtnText, isDark && { color: currentColors.mutedText }]}>{isEn ? 'Cancel' : 'रद्द करें'}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.submitBtn, !isAllSelected && styles.submitBtnDisabled]}
              activeOpacity={0.85}
              onPress={handleAccept}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <View style={styles.submitBtnContent}>
                  <Text style={styles.submitBtnIcon}>✓</Text>
                  <Text style={styles.submitBtnText}>
                    {isEn ? 'OK, Accept & Continue →' : 'स्वीकार करें एवं जारी रखें →'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
  },
  modalCard: {
    width: '100%',
    maxHeight: SCREEN_HEIGHT * 0.88,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 14,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#0052CC',
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  langSwitchWrap: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 16,
    padding: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    marginLeft: 'auto',
    marginRight: 8,
  },
  langBtn: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 14,
  },
  langBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  langBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  langBtnTextActive: {
    color: '#0066FF',
    fontWeight: '900',
  },
  closeHeaderBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeHeaderBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22,
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    color: '#E0EDFF',
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
  },
  selectAllBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F6FF',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#DBEAFE',
  },
  selectAllBarActive: {
    backgroundColor: '#EFF6FF',
    borderBottomColor: '#BFDBFE',
  },
  selectAllTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0066FF',
  },
  selectAllTitleActive: {
    color: '#0052CC',
  },
  selectAllSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  countBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  countBadgeActive: {
    backgroundColor: '#0066FF',
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0066FF',
  },
  countBadgeTextActive: {
    color: '#FFFFFF',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    padding: 10,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 10,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
  },
  clausesScroll: {
    flexGrow: 0,
    flexShrink: 1,
    paddingHorizontal: 16,
  },
  clausesScrollContent: {
    paddingVertical: 12,
  },
  clauseCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  clauseCardChecked: {
    backgroundColor: '#F8FBFF',
    borderColor: '#93C5FD',
  },
  clauseTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  clauseIcon: {
    fontSize: 16,
    marginLeft: 8,
    marginRight: 6,
  },
  clauseTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
    flex: 1,
  },
  clauseTitleChecked: {
    color: '#0066FF',
  },
  clauseContent: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
    paddingLeft: 30,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: '#0066FF',
    borderColor: '#0066FF',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 15,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
  },
  submitBtn: {
    flex: 1,
    backgroundColor: '#0066FF',
    paddingVertical: 14,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  submitBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  submitBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnIcon: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    marginRight: 6,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
});

export default HindiTermsModal;
