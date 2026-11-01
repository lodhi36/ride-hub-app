import React, { useContext } from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemeContext } from '../context/ThemeContext';
import { colors } from '../theme/colors';

const PrivacyScreen = () => {
  const { theme } = useContext(ThemeContext);
  const isDark = theme === 'dark';
  const currentColors = isDark ? colors.dark : colors.light;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.title, { color: currentColors.text }]}>Privacy Policy</Text>
        
        <Text style={[styles.sectionTitle, { color: currentColors.text }]}>1. Information We Collect</Text>
        <Text style={[styles.bodyText, { color: currentColors.textMuted }]}>
          We collect information you provide directly to us, such as when you create or modify your account, request on-demand services, contact customer support, or otherwise communicate with us.
        </Text>

        <Text style={[styles.sectionTitle, { color: currentColors.text }]}>2. Use of Information</Text>
        <Text style={[styles.bodyText, { color: currentColors.textMuted }]}>
          We may use the information we collect to provide, maintain, and improve our services, including to facilitate matchmaking, facilitate payments, send receipts, provide products and services you request.
        </Text>

        <Text style={[styles.sectionTitle, { color: currentColors.text }]}>3. Sharing of Information</Text>
        <Text style={[styles.bodyText, { color: currentColors.textMuted }]}>
          We do not share your personal information with third parties without your consent, except as described in this policy.
        </Text>

        <Text style={[styles.sectionTitle, { color: currentColors.text }]}>4. Security</Text>
        <Text style={[styles.bodyText, { color: currentColors.textMuted }]}>
          We take reasonable measures to help protect information about you from loss, theft, misuse and unauthorized access, disclosure, alteration and destruction.
        </Text>

        <Text style={[styles.sectionTitle, { color: currentColors.text }]}>5. AI-Powered Support & Chat Privacy</Text>
        <Text style={[styles.bodyText, { color: currentColors.textMuted }]}>
          Our customer support features are powered by Artificial Intelligence (AI) to deliver 24/7 instantaneous assistance. Interaction transcripts are securely encrypted and used solely for safety verification, dispute handling, and quality training in accordance with our data protection guidelines.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  bodyText: {
    fontSize: 16,
    lineHeight: 24,
  },
});

export default PrivacyScreen;
