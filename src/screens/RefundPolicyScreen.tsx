import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing } from '../theme/colors';
import { PremiumIcons } from '../assets/PremiumIcons';

const RefundPolicyScreen = ({ navigation }: any) => {
  const { currentColors } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: currentColors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Image source={PremiumIcons.back_arrow} style={{ width: 28, height: 28, tintColor: currentColors.text }} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: currentColors.text }]}>Refund Policy</Text>
        <View style={{ width: 28 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.text, { color: currentColors.text }]}>
          Our refund policy is simple:{'\n\n'}
          All purchases for Premium subscriptions are handled via App Store & Payment Gateway. To request a refund, please contact customer support directly.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: spacing.xs, marginLeft: -spacing.xs },
  headerTitle: { fontSize: typography.sizes.xl, fontWeight: 'bold' },
  content: { padding: spacing.lg },
  text: { fontSize: typography.sizes.md, lineHeight: 24 },
});

export default RefundPolicyScreen;
