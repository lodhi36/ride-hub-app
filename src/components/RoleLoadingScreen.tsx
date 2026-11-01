import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Easing,
  Platform,
} from 'react-native';
import { useAppLanguage } from '../context/LanguageContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export type RoleType = 'customer' | 'rider' | 'supplier';

export type OperationType =
  | 'stores'
  | 'menu'
  | 'categories'
  | 'location'
  | 'orders'
  | 'earnings'
  | 'network'
  | 'zone'
  | 'dashboard'
  | 'catalog'
  | 'banners'
  | 'profile'
  | 'general';

interface RoleLoadingScreenProps {
  role: RoleType;
  operation?: OperationType;
  customMessage?: string;
  customSubMessage?: string;
  isDarkMode?: boolean;
  timeoutMs?: number;
  onRetry?: () => void;
  onCancel?: () => void;
  inline?: boolean;
}

export const RoleLoadingScreen: React.FC<RoleLoadingScreenProps> = ({
  role,
  operation = 'general',
  customMessage,
  customSubMessage,
  isDarkMode = false,
  timeoutMs = 12000,
  onRetry,
  onCancel,
  inline = false,
}) => {
  const { t, language } = useAppLanguage();
  const [hasTimedOut, setHasTimedOut] = useState<boolean>(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation for role badge
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // Timeout handler to prevent infinite loading
  useEffect(() => {
    setHasTimedOut(false);
    const timer = setTimeout(() => {
      setHasTimedOut(true);
    }, timeoutMs);

    return () => clearTimeout(timer);
  }, [timeoutMs]);

  // Determine localized primary message
  const getPrimaryMessage = (): string => {
    if (customMessage) return customMessage;

    switch (role) {
      case 'customer':
        if (operation === 'stores') return t('loading.customer_stores', 'Finding nearby stores and services...');
        if (operation === 'menu') return t('loading.customer_menu', 'Loading store catalog & menu...');
        if (operation === 'categories') return t('loading.customer_categories', 'Fetching live categories...');
        if (operation === 'location') return t('loading.customer_location', 'Verifying delivery location...');
        return t('loading.customer_stores', 'Finding nearby stores and services...');

      case 'rider':
        if (operation === 'orders') return t('loading.rider_orders', 'Checking for nearby delivery orders...');
        if (operation === 'earnings') return t('loading.rider_earnings', 'Syncing your earnings & trips...');
        if (operation === 'network') return t('loading.rider_network', 'Connecting to Ride Hub rider network...');
        if (operation === 'zone') return t('loading.rider_zone', 'Verifying service zone & GPS...');
        return t('loading.rider_orders', 'Checking for nearby delivery orders...');

      case 'supplier':
        if (operation === 'dashboard') return t('loading.supplier_dashboard', 'Loading store dashboard & orders...');
        if (operation === 'catalog') return t('loading.supplier_catalog', 'Fetching live inventory & catalog...');
        if (operation === 'banners') return t('loading.supplier_banners', 'Syncing promotional banners...');
        if (operation === 'profile') return t('loading.supplier_profile', 'Updating store profile & timings...');
        return t('loading.supplier_dashboard', 'Loading store dashboard & orders...');

      default:
        return 'Loading...';
    }
  };

  // Determine role glyph icon
  const getRoleIcon = (): string => {
    switch (role) {
      case 'customer':
        return operation === 'menu' ? '🍽️' : '🛍️';
      case 'rider':
        return '🛵';
      case 'supplier':
        return '🏪';
      default:
        return '⚡';
    }
  };

  const getThemeColors = () => {
    if (isDarkMode) {
      return {
        bg: '#0F172A',
        cardBg: '#1E293B',
        text: '#F8FAFC',
        subText: '#94A3B8',
        border: '#334155',
        primary: role === 'rider' ? '#10B981' : '#0066FF',
      };
    }
    return {
      bg: '#F8FAFC',
      cardBg: '#FFFFFF',
      text: '#0F172A',
      subText: '#64748B',
      border: '#E2E8F0',
      primary: role === 'rider' ? '#059669' : '#0066FF',
    };
  };

  const colors = getThemeColors();

  if (hasTimedOut) {
    return (
      <View
        style={[
          inline ? styles.inlineContainer : styles.fullScreenContainer,
          { backgroundColor: inline ? 'transparent' : colors.bg },
        ]}
      >
        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={{ fontSize: 44, marginBottom: 12 }}>⚠️</Text>
          <Text style={[styles.title, { color: colors.text }]}>
            {t('loading.taking_longer', 'Taking longer than expected...')}
          </Text>
          <Text style={[styles.subText, { color: colors.subText }]}>
            {customSubMessage ||
              t(
                'loading.check_connection',
                'Please check your network connection and try again.'
              )}
          </Text>

          <View style={styles.actionRow}>
            {onRetry && (
              <TouchableOpacity
                style={[styles.retryBtn, { backgroundColor: colors.primary }]}
                activeOpacity={0.8}
                onPress={() => {
                  setHasTimedOut(false);
                  onRetry();
                }}
              >
                <Text style={styles.retryBtnText}>↻ {t('common.retry', 'Retry')}</Text>
              </TouchableOpacity>
            )}

            {onCancel && (
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                activeOpacity={0.8}
                onPress={onCancel}
              >
                <Text style={[styles.cancelBtnText, { color: colors.subText }]}>
                  {t('common.cancel', 'Cancel')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        inline ? styles.inlineContainer : styles.fullScreenContainer,
        { backgroundColor: inline ? 'transparent' : colors.bg },
      ]}
    >
      <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
        <Animated.View
          style={[
            styles.iconCircle,
            {
              backgroundColor: isDarkMode ? '#1E293B' : '#EFF6FF',
              transform: [{ scale: pulseAnim }],
            },
          ]}
        >
          <Text style={{ fontSize: 34 }}>{getRoleIcon()}</Text>
        </Animated.View>

        <ActivityIndicator
          size="small"
          color={colors.primary}
          style={{ marginVertical: 14 }}
        />

        <Text style={[styles.title, { color: colors.text }]}>{getPrimaryMessage()}</Text>

        <Text style={[styles.subText, { color: colors.subText }]}>
          {customSubMessage ||
            (language === 'hi' ? 'कृपया प्रतीक्षा करें...' : 'Please wait a moment...')}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fullScreenContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  inlineContainer: {
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  card: {
    width: SCREEN_WIDTH - 48,
    maxWidth: 380,
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
    lineHeight: 22,
  },
  subText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    width: '100%',
    justifyContent: 'center',
  },
  retryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

export default RoleLoadingScreen;
