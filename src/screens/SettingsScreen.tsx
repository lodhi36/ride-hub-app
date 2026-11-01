import React, { useState } from 'react';
import { Dimensions, View, Text, ScrollView, TouchableOpacity, Switch, StyleSheet, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/PngIcon';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { colors, typography, spacing, radius } from '../theme/colors';
import api from '../services/api';

const windowWidth = Dimensions.get('window').width;

const SettingsScreen = ({ navigation }: any) => {
  const { isDark, setIsDark, currentColors } = useTheme();
  const { logout } = useAuth();

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => { logout('CUSTOMER'); } }
    ]);
  };

  const handleThemeToggle = async (val: boolean) => {
    await setIsDark(val);
    try {
      await api.put('/settings', { theme: val ? 'dark' : 'light' });
    } catch (e) {
      console.log('[Settings] Failed to sync theme to backend:', e);
    }
  };

  interface SettingsRowProps {
    title: string;
    icon: string;
    color: string;
    onPress?: () => void;
    hasSwitch?: boolean;
    switchValue?: boolean;
    onSwitchChange?: (value: boolean) => void;
  }

  const SettingsRow = ({ title, icon, color, onPress, hasSwitch, switchValue, onSwitchChange }: SettingsRowProps) => {
    const handleSwitchChange = (value: boolean) => {
      console.log(`[SettingsScreen] Switch "${title}" changed to:`, value);
      if (typeof onSwitchChange === 'function') {
        onSwitchChange(value);
      } else {
        console.warn(`[SettingsScreen] onSwitchChange is not a function for row: "${title}"`);
      }
    };

    return (
      <TouchableOpacity 
        style={[styles.row, { borderBottomColor: currentColors.border }]} 
        onPress={onPress}
        disabled={hasSwitch}
      >
        <View style={styles.rowLeft}>
          <View style={{ width: windowWidth * 0.12, height: windowWidth * 0.12, justifyContent: 'center', alignItems: 'center', marginRight: 16 }}>
            <Icon name={icon} size={28} color={color} />
          </View>
          <Text style={[styles.rowTitle, { color: currentColors.text }]}>{title}</Text>
        </View>
        {hasSwitch ? (
          <Switch 
            value={switchValue} 
            onValueChange={handleSwitchChange}
            trackColor={{ false: currentColors.border, true: colors.primary }}
            thumbColor={switchValue ? '#FFFFFF' : '#f4f3f4'}
          />
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: currentColors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Image source={require('../assets/generated_icons/back_arrow_icon.jpg')} style={{ width: 24, height: 24 }} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: currentColors.text }]}>Settings</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Account & Privacy */}
        <Text style={[styles.sectionTitle, { color: currentColors.textMuted }]}>Account</Text>
        <View style={[styles.card, { backgroundColor: currentColors.surface }]}>
          <SettingsRow 
            title="Personal Information" 
            icon="person"
            color="#0066FF" 
            onPress={() => navigation.navigate('AccountSettings')} 
          />
          <SettingsRow 
            title="Privacy" 
            icon="shield-checkmark"
            color="#10B981" 
            onPress={() => navigation.navigate('PrivacySettings')} 
          />
          <View style={{ borderBottomWidth: 0 }}>
            <SettingsRow 
              title="Security" 
              icon="lock-closed"
              color="#F59E0B" 
              onPress={() => navigation.navigate('SecuritySettings')} 
            />
          </View>
        </View>

        {/* Preferences */}
        <Text style={[styles.sectionTitle, { color: currentColors.textMuted }]}>Preferences</Text>
        <View style={[styles.card, { backgroundColor: currentColors.surface }]}>
          <SettingsRow 
            title="Notifications" 
            icon="notifications"
            color="#EF4444" 
            onPress={() => navigation.navigate('NotificationSettings')} 
          />
          <View style={{ borderBottomWidth: 0 }}>
            <SettingsRow 
              title="Dark Mode" 
              icon="snow-outline"
              color="#0066FF" 
              hasSwitch 
              switchValue={isDark} 
              onSwitchChange={handleThemeToggle}
            />
          </View>
        </View>

        {/* Support */}
        <Text style={[styles.sectionTitle, { color: currentColors.textMuted }]}>Support</Text>
        <View style={[styles.card, { backgroundColor: currentColors.surface }]}>
          <SettingsRow 
            title="Customer Support" 
            icon="headset"
            color="#6366F1" 
            onPress={() => navigation.navigate('ContactSupport')} 
          />
          <SettingsRow 
            title="Help Center & FAQs" 
            icon="information-circle"
            color="#0066FF" 
            onPress={() => navigation.navigate('HelpCenter')} 
          />
          <SettingsRow 
            title="Report a Problem" 
            icon="alert-circle-outline"
            color="#EF4444" 
            onPress={() => navigation.navigate('ReportProblem')} 
          />
          <View style={{ borderBottomWidth: 0 }}>
            <SettingsRow 
              title="Legal & Policies" 
              icon="clipboard-outline"
              color="#10B981" 
              onPress={() => navigation.navigate('LegalSupport')} 
            />
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
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
  premiumBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  premiumContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  premiumIconBadge: {
    width: windowWidth * 0.12, height: windowWidth * 0.12,
    borderRadius: 24,
    backgroundColor: '#FDE68A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  premiumTextCol: {
    flex: 1,
  },
  premiumTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: 'bold',
    color: '#92400E',
    marginBottom: 2,
  },
  premiumDesc: {
    fontSize: typography.sizes.sm,
    color: '#B45309',
  },
  sectionTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrapper: {
    width: windowWidth * 0.09, height: windowWidth * 0.09,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  rowTitle: {
    fontSize: typography.sizes.md,
    fontWeight: '600',
  },
  logoutButton: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: '#FEE2E2',
    borderRadius: radius.md,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: colors.error,
    fontSize: typography.sizes.md,
    fontWeight: 'bold',
  },
});

export default SettingsScreen;
