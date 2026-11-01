import React, { useState } from 'react';
import { View, Text, Switch, ScrollView, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/PngIcon';
import { useTheme } from '../context/ThemeContext';
import { colors, typography, spacing, radius } from '../theme/colors';

const PrivacySettingsScreen = ({ navigation }: any) => {
  const { currentColors } = useTheme();

  const [profileVisible, setProfileVisible] = useState(true);
  const [showOnlineStatus, setShowOnlineStatus] = useState(true);
  const [hideAge, setHideAge] = useState(false);
  const [hideDistance, setHideDistance] = useState(false);

  interface SettingRowProps {
    title: string;
    description: string;
    value: boolean;
    onToggle?: (value: boolean) => void;
  }

  const SettingRow = ({ title, description, value, onToggle }: SettingRowProps) => {
    const handleToggle = (newValue: boolean) => {
      console.log(`[PrivacySettingsScreen] Switch "${title}" changed to:`, newValue);
      if (typeof onToggle === 'function') {
        onToggle(newValue);
      } else {
        console.warn(`[PrivacySettingsScreen] onToggle is not a function for row: "${title}"`);
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
        <Text style={[styles.headerTitle, { color: currentColors.text }]}>Privacy</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        <View style={[styles.card, { backgroundColor: currentColors.surface }]}>
          <SettingRow 
            title="Profile Visibility" 
            description="Allow others to see your profile in Discover"
            value={profileVisible} 
            onToggle={setProfileVisible} 
          />
          <SettingRow 
            title="Show Online Status" 
            description="Let others know when you are active"
            value={showOnlineStatus} 
            onToggle={setShowOnlineStatus} 
          />
        </View>

        <Text style={[styles.sectionTitle, { color: currentColors.textMuted }]}>Profile Details</Text>
        <View style={[styles.card, { backgroundColor: currentColors.surface }]}>
          <SettingRow 
            title="Hide Age" 
            description="Your age will not be shown on your profile"
            value={hideAge} 
            onToggle={setHideAge} 
          />
          <SettingRow 
            title="Hide Distance" 
            description="Your distance will not be shown to others"
            value={hideDistance} 
            onToggle={setHideDistance} 
          />
        </View>

        <Text style={[styles.sectionTitle, { color: currentColors.textMuted }]}>Connections</Text>
        <View style={[styles.card, { backgroundColor: currentColors.surface }]}>
          <TouchableOpacity style={[styles.row, { borderBottomWidth: 0 }]}>
            <View style={{ marginRight: spacing.md, width: 24, alignItems: 'center' }}>
              <Image source={require('../assets/generated_icons/shield_icon.jpg')} style={{ width: 24, height: 24 }} />
            </View>
            <View style={styles.rowLeft}>
              <Text style={[styles.rowTitle, { color: currentColors.text, marginBottom: 0 }]}>Blocked Users</Text>
            </View>
          </TouchableOpacity>
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

export default PrivacySettingsScreen;
