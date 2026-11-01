import React, { useContext, useState } from 'react';
import {
  ScrollView,
  Text,
  StyleSheet,
  View,
  TouchableOpacity,
  SafeAreaView,
  Alert,
} from 'react-native';
import { ThemeContext } from '../context/ThemeContext';
import { colors } from '../theme/colors';

const CUSTOMER_TERMS = [
  {
    id: 'cust_1',
    icon: '🛡️',
    titleEn: '1. Account Integrity & Accurate Details',
    titleHi: '१. खाता सुरक्षा एवं सही जानकारी',
    descEn: 'Customers are responsible for providing their authentic full name, verified mobile number, and precise delivery location. Fraudulent activity or account misuse will lead to immediate suspension.',
    descHi: 'ग्राहक अपना वास्तविक नाम, वैध मोबाइल नंबर एवं सही डिलीवरी पता दर्ज करने के लिए जिम्मेदार है। खाते के दुरुपयोग पर खाता तत्काल निलंबित किया जा सकता है।',
  },
  {
    id: 'cust_2',
    icon: '🔄',
    titleEn: '2. Fair Cancellation & Refund Policy',
    titleHi: '२. ऑर्डर रद्दीकरण एवं रिफंड नीति',
    descEn: 'Full refunds apply if canceled before the store starts order preparation. Once cooking begins or a rider is dispatched, standard cancellation and wastage fees apply.',
    descHi: 'रेस्तरां द्वारा खाना तैयार करने से पहले रद्दीकरण पर पूरा रिफंड मिलेगा। खाना तैयार होने के बाद या राइडर के स्टोर पहुँचने पर खाद्य बर्बादी के कारण रिफंड कटौती लागू होगी।',
  },
  {
    id: 'cust_3',
    icon: '⚡',
    titleEn: '3. Rider ₹20 Arrival Guarantee Protection',
    titleHi: '३. राइडर की ₹20 आगमन सुरक्षा',
    descEn: 'If the assigned rider has reached the merchant/store and the order is canceled by the customer, a mandatory ₹20 arrival fee will be deducted to compensate the rider for time and fuel.',
    descHi: 'यदि राइडर स्टोर पहुँच चुका है और ग्राहक ऑर्डर रद्द करता है, तो राइडर के समय एवं ईंधन व्यय हेतु ₹20 की अनिवार्य भरपाई राशि काटी जाएगी।',
  },
  {
    id: 'cust_4',
    icon: '📦',
    titleEn: '4. Delivery Etiquette & OTP Handover',
    titleHi: '४. डिलीवरी एवं शिष्टाचार',
    descEn: 'Please collect your delivery promptly upon rider arrival and share the secure delivery OTP. Treat delivery partners and merchants with dignity, courtesy, and respect.',
    descHi: 'डिलीवरी के समय सही ओटीपी (OTP) साझा करें। राइडर एवं सप्लायर पार्टनर के साथ सम्मानजनक एवं सुरक्षित व्यवहार करें।',
  },
  {
    id: 'cust_5',
    icon: '🤖',
    titleEn: '5. AI-Powered Customer Support & Quality Assurance',
    titleHi: '५. एआई-सपोर्ट एवं चैट प्राइवेसी नीति',
    descEn: 'Customer support in Ride Hub is augmented with Artificial Intelligence (AI) to deliver instantaneous assistance 24/7. Transcripts and interaction logs are safely retained for quality training and dispute resolution in strict accordance with our Privacy Policy.',
    descHi: 'Ride Hub पर सहायता सेवा कृत्रिम बुद्धिमत्ता (AI) द्वारा संचालित है ताकि आपको 24x7 तत्काल सहायता मिल सके। गुणवत्ता और त्वरित समाधान हेतु संवाद विवरण को गोपनीयता नीति के तहत सुरक्षित रूप से दर्ज किया जाता है।',
  },
];

const TermsScreen = ({ navigation }: any) => {
  const { theme } = useContext(ThemeContext);
  const isDark = theme === 'dark';
  const currentColors = isDark ? colors.dark : colors.light;

  const [lang, setLang] = useState<'en' | 'hi'>('en');
  const [isAccepted, setIsAccepted] = useState(true);

  const isEn = lang === 'en';

  const handleContinue = () => {
    if (!isAccepted) {
      Alert.alert(
        isEn ? 'Agreement Required' : 'सहमति आवश्यक',
        isEn ? 'Please accept the Terms & Conditions to proceed.' : 'कृपया आगे बढ़ने के लिए नियमों पर सहमति दें।'
      );
      return;
    }
    Alert.alert(
      isEn ? 'Terms Accepted ✅' : 'सहमति दर्ज ✅',
      isEn ? 'You have successfully agreed to Ride Hub Terms & Conditions.' : 'आपने Ride Hub नियम एवं शर्तों को सफलतापूर्वक स्वीकार कर लिया है।'
    );
    if (navigation && navigation.canGoBack && navigation.canGoBack()) {
      navigation.goBack();
    } else if (navigation && navigation.navigate) {
      navigation.navigate('CustomerHomeScreen');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Top Header Row */}
        <View style={styles.topHeaderRow}>
          <View style={styles.badgeContainer}>
            <Text style={styles.badgeText}>🛡️ {isEn ? 'OFFICIAL TERMS' : 'आधिकारिक नियम'}</Text>
          </View>

          {/* Language Switcher */}
          <View style={styles.langSwitch}>
            <TouchableOpacity
              style={[styles.langBtn, isEn && styles.langBtnActive]}
              onPress={() => setLang('en')}
              activeOpacity={0.8}
            >
              <Text style={[styles.langText, isEn && styles.langTextActive]}>EN</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.langBtn, !isEn && styles.langBtnActive]}
              onPress={() => setLang('hi')}
              activeOpacity={0.8}
            >
              <Text style={[styles.langText, !isEn && styles.langTextActive]}>हिन्दी</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.title, { color: currentColors.text }]}>
          {isEn ? 'Ride Hub Terms of Service' : 'Ride Hub ग्राहक सेवा नियम एवं शर्तें'}
        </Text>
        <Text style={styles.subtitle}>
          {isEn
            ? 'Please review our fair-use policies and service guarantees carefully before continuing.'
            : 'Ride Hub ऐप पर ऑर्डर एवं सेवाओं का उपयोग करने के लिए इन नियमों को ध्यान से पढ़ें:'}
        </Text>

        {/* Clause Cards */}
        {CUSTOMER_TERMS.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardIcon}>{item.icon}</Text>
              <Text style={styles.sectionTitle}>{isEn ? item.titleEn : item.titleHi}</Text>
            </View>
            <Text style={styles.bodyText}>{isEn ? item.descEn : item.descHi}</Text>
          </View>
        ))}

        {/* Select All Checkbox */}
        <TouchableOpacity
          style={[styles.checkboxRow, isAccepted && styles.checkboxRowActive]}
          activeOpacity={0.8}
          onPress={() => setIsAccepted(!isAccepted)}
        >
          <View style={[styles.checkbox, isAccepted && styles.checkboxActive]}>
            {isAccepted && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={[styles.checkboxLabel, isAccepted && styles.checkboxLabelActive]}>
            {isEn
              ? 'I have read and agree to all Ride Hub Terms & Conditions'
              : 'मैं सभी नियमों एवं शर्तों से पूर्णतः सहमत हूँ'}
          </Text>
        </TouchableOpacity>

        {/* Big Prominent OK Continue Button in Blue */}
        <TouchableOpacity
          style={[styles.continueBtn, !isAccepted && styles.continueBtnDisabled]}
          activeOpacity={0.85}
          onPress={handleContinue}
        >
          <Text style={styles.continueBtnIcon}>✓</Text>
          <Text style={styles.continueBtnText}>
            {isEn ? 'OK, Accept & Continue →' : 'स्वीकार करें एवं जारी रखें →'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  topHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeContainer: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  badgeText: {
    color: '#0066FF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  langSwitch: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    padding: 2,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  langBtn: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 14,
  },
  langBtnActive: {
    backgroundColor: '#0066FF',
  },
  langText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  langTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
    lineHeight: 18,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  bodyText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 19,
    paddingLeft: 26,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginTop: 6,
    marginBottom: 18,
  },
  checkboxRowActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
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
    marginRight: 10,
  },
  checkboxActive: {
    backgroundColor: '#0066FF',
    borderColor: '#0066FF',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  checkboxLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    flex: 1,
  },
  checkboxLabelActive: {
    color: '#0066FF',
  },
  continueBtn: {
    backgroundColor: '#0066FF',
    paddingVertical: 14,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  continueBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  continueBtnIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    marginRight: 8,
  },
  continueBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
});

export default TermsScreen;
