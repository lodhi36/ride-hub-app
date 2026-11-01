import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing } from '../theme/colors';
import { PremiumIcons } from '../assets/PremiumIcons';

const ReportProblemScreen = ({ navigation }: any) => {
  const { currentColors } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: currentColors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Image source={PremiumIcons.back_arrow} style={{ width: 28, height: 28, tintColor: currentColors.text }} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: currentColors.text }]}>Report a Problem</Text>
        <View style={{ width: 28 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.text, { color: currentColors.text }]}>
          Did you find a bug? Let us know so we can fix it!{'\n\n'}
          Please email bugs@datingapp.com with screenshots and steps to reproduce the issue.
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

export default ReportProblemScreen;
