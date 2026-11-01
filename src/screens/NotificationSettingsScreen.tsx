import React, { useState } from 'react';
import { View, Text, Switch, ScrollView, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/PngIcon';
import { useTheme } from '../context/ThemeContext';
import { colors, typography, spacing, radius } from '../theme/colors';

const NotificationSettingsScreen = ({ navigation }: any) => {
  const { currentColors } = useTheme();

  const [pushEnabled, setPushEnabled] = useState(true);
  const [matchEnabled, setMatchEnabled] = useState(true);
  const [messageEnabled, setMessageEnabled] = useState(true);
  const [likeEnabled, setLikeEnabled] = useState(true);
  const [promoEnabled, setPromoEnabled] = useState(false);

  interface SettingRowProps {
    title: string;
    description: string;
    value: boolean;
    onToggle?: (value: boolean) => void;
  }

  const SettingRow = ({ title, description, value, onToggle }: SettingRowProps) => {
    const handleToggle = (newValue: boolean) => {
      console.log(`[NotificationSettingsScreen] Switch "${title}" changed to:`, newValue);
      if (typeof onToggle === 'function') {
        onToggle(newValue);
      } else {
        console.warn(`[NotificationSettingsScreen] onToggle is not a function for row: "${title}"`);
      }
    };

    return (
      <View style={[styles.row, { borderBottomColor: currentColors.border }]}>
        <View style={styles.rowLeft}>
          <Text style={[styles.rowTitle, { color: currentColors.text }]}>{title}</Text>
          <Text style={[styles.rowDesc, { color: currentColors.textMuted }]}>{description}</Text>
        </View>
        <Switch 
          value={value} 
          onValueChange={handleToggle}
          trackColor={{ false: currentColors.border, true: colors.primary }}
          thumbColor={value ? '#FFFFFF' : '#f4f3f4'}
        />
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: currentColors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Image source={require('../assets/generated_icons/back_arrow_icon.jpg')} style={{ width: 24, height: 24 }} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: currentColors.text }]}>Notifications</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        <View style={[styles.card, { backgroundColor: currentColors.surface }]}>
          <SettingRow 
            title="Push Notifications" 
            description="Enable or disable all push notifications"
            value={pushEnabled} 
            onToggle={setPushEnabled} 
          />
        </View>

        {pushEnabled && (
          <>
            <Text style={[styles.sectionTitle, { color: currentColors.textMuted }]}>Alert Types</Text>
            <View style={[styles.card, { backgroundColor: currentColors.surface }]}>
              <SettingRow 
                title="New Matches" 
                description="Get notified when you get a new match"
                value={matchEnabled} 
                onToggle={setMatchEnabled} 
              />
              <SettingRow 
                title="Messages" 
                description="Get notified when someone sends you a message"
                value={messageEnabled} 
                onToggle={setMessageEnabled} 
              />
              <SettingRow 
                title="Likes" 
                description="Get notified when someone likes your profile"
                value={likeEnabled} 
                onToggle={setLikeEnabled} 
              />
            </View>

            <Text style={[styles.sectionTitle, { color: currentColors.textMuted }]}>Marketing</Text>
            <View style={[styles.card, { backgroundColor: currentColors.surface }]}>
              <SettingRow 
                title="Promotional & Offers" 
                description="Receive special offers and updates"
                value={promoEnabled} 
                onToggle={setPromoEnabled} 
              />
            </View>
          </>
        )}

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
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft: {
    flex: 1,
    paddingRight: spacing.md,
  },
  rowTitle: {
    fontSize: typography.sizes.md,
    fontWeight: '600',
    marginBottom: 4,
  },
  rowDesc: {
    fontSize: typography.sizes.sm,
    lineHeight: 18,
  },
});

export default NotificationSettingsScreen;
