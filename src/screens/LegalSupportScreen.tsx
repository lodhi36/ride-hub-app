import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PremiumIcons } from '../assets/PremiumIcons';
import { useTheme } from '../context/ThemeContext';
import { colors, typography, spacing, radius } from '../theme/colors';

const LegalSupportScreen = ({ navigation }: any) => {
  const { currentColors } = useTheme();

  const handleNavigation = (route: string) => {
    navigation.navigate(route);
  };

  const Row = ({ title, iconSource, onPress }: any) => (
    <TouchableOpacity style={[styles.row, { borderBottomColor: currentColors.border }]} onPress={onPress}>
      <View style={styles.rowLeft}>
        <Image source={iconSource} style={{ width: 26, height: 26, marginRight: spacing.md }} />
        <Text style={[styles.rowTitle, { color: currentColors.text }]}>{title}</Text>
      </View>
      <Image source={PremiumIcons.chevron_right} style={{ width: 20, height: 20, tintColor: currentColors.textMuted }} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: currentColors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Image source={PremiumIcons.back_arrow} style={{ width: 28, height: 28, tintColor: currentColors.text }} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: currentColors.text }]}>Support & Legal</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        <Text style={[styles.sectionTitle, { color: currentColors.textMuted }]}>Support</Text>
        <View style={[styles.card, { backgroundColor: currentColors.surface }]}>
          <Row title="Help Center & FAQ" iconSource={PremiumIcons.faq} onPress={() => handleNavigation('HelpCenter')} />
          <Row title="Contact Support" iconSource={PremiumIcons.contact} onPress={() => handleNavigation('ContactSupport')} />
          <View style={{ borderBottomWidth: 0 }}>
            <Row title="Report a Problem" iconSource={PremiumIcons.report} onPress={() => handleNavigation('ReportProblem')} />
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: currentColors.textMuted }]}>Legal</Text>
        <View style={[styles.card, { backgroundColor: currentColors.surface }]}>
          <Row title="Terms & Conditions" iconSource={PremiumIcons.terms} onPress={() => handleNavigation('Terms')} />
          <Row title="Privacy Policy" iconSource={PremiumIcons.privacy_shield} onPress={() => handleNavigation('Privacy')} />
          <Row title="Community Guidelines" iconSource={PremiumIcons.community} onPress={() => handleNavigation('CommunityGuidelines')} />
          <View style={{ borderBottomWidth: 0 }}>
            <Row title="Refund Policy" iconSource={PremiumIcons.refund} onPress={() => handleNavigation('RefundPolicy')} />
          </View>
        </View>

        <View style={styles.versionContainer}>
          <Image source={PremiumIcons.heart_filled} style={{ width: 28, height: 28, marginBottom: spacing.sm }} />
          <Text style={[styles.versionText, { color: currentColors.textMuted }]}>Dating App v1.0.0</Text>
          <Text style={[styles.versionText, { color: currentColors.textMuted }]}>Made with love.</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    padding: spacing.xs,
    marginLeft: -spacing.xs,
  },
  headerTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: 'bold',
  },
  content: {
    padding: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: spacing.md,
  },
  rowTitle: {
    fontSize: typography.sizes.md,
    fontWeight: '500',
  },
  versionContainer: {
    marginTop: spacing.xxl * 2,
    alignItems: 'center',
    opacity: 0.5,
  },
  versionText: {
    fontSize: typography.sizes.sm,
  },
});

export default LegalSupportScreen;
