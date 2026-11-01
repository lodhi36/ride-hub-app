import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Linking,
  AppState,
  AppStateStatus,
  ActivityIndicator,
  Animated,
  Dimensions,
} from 'react-native';
import {
  fetchCurrentGpsPositionDetailed,
  DeviceGpsFix,
} from '../services/LocationAddressService';
import { useTheme } from '../context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface DeviceLocationRequiredModalProps {
  visible: boolean;
  onLocationResolved: (coords: DeviceGpsFix) => void;
  onDismiss?: () => void;
  isMandatory?: boolean;
}

export const DeviceLocationRequiredModal: React.FC<DeviceLocationRequiredModalProps> = ({
  visible,
  onLocationResolved,
  onDismiss,
  isMandatory = true,
}) => {
  const { isDark, currentColors } = useTheme();
  const [checking, setChecking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for location radar icon
  useEffect(() => {
    if (!visible) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [visible, pulseAnim]);

  // Open Android / iOS Location Settings
  const openLocationSettings = async () => {
    try {
      if (Platform.OS === 'android') {
        await Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(async () => {
          await Linking.openSettings();
        });
      } else {
        await Linking.openURL('App-Prefs:Privacy&path=LOCATION').catch(async () => {
          await Linking.openSettings();
        });
      }
    } catch (_) {
      Linking.openSettings();
    }
  };

  // Re-check live GPS hardware status
  const checkLiveLocation = useCallback(async () => {
    if (checking) return;
    try {
      setChecking(true);
      setErrorMsg(null);
      const res = await fetchCurrentGpsPositionDetailed(false);
      if (res.success && res.fix) {
        onLocationResolved(res.fix);
      } else {
        setErrorMsg(
          res.errorType === 'LOCATION_OFF' || res.errorType === 'PERMISSION_DENIED'
            ? 'Location is still turned off. Please turn it on in settings.'
            : 'Could not detect device GPS yet. Please ensure high accuracy location is ON.'
        );
      }
    } catch (err: any) {
      setErrorMsg('Could not detect location. Please try again.');
    } finally {
      setChecking(false);
    }
  }, [checking, onLocationResolved]);

  // Auto-detect when user returns from device Settings
  useEffect(() => {
    if (!visible) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        checkLiveLocation();
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [visible, checkLiveLocation]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!isMandatory && onDismiss) onDismiss();
      }}
    >
      <View style={styles.overlay}>
        <View style={[styles.card, isDark && { backgroundColor: currentColors.card, borderColor: currentColors.border, borderWidth: 1 }]}>
          {/* Animated GPS Icon */}
          <View style={styles.iconContainer}>
            <Animated.View
              style={[
                styles.pulseRing,
                {
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            />
            <View style={[styles.iconCircle, isDark && { backgroundColor: currentColors.elevatedSurface, borderColor: '#0066FF' }]}>
              <Text style={styles.iconEmoji}>📍</Text>
            </View>
          </View>

          {/* Title & Description */}
          <Text style={[styles.title, isDark && { color: currentColors.primaryText }]}>Device Location Required</Text>
          <Text style={styles.subtitle}>
            Please turn on your device location to continue.
          </Text>

          <Text style={[styles.description, isDark && { color: currentColors.secondaryText }]}>
            Ride Hub uses your device's actual GPS to find nearby stores, show available items,
            and deliver orders accurately to your doorstep.
          </Text>

          {errorMsg ? (
            <View style={[styles.errorBox, isDark && { backgroundColor: '#2E1515', borderColor: '#7F1D1D' }]}>
              <Text style={[styles.errorText, isDark && { color: '#F87171' }]}>⚠️ {errorMsg}</Text>
            </View>
          ) : null}

          {/* Action Buttons */}
          <View style={styles.buttonGroup}>
            {/* 1. Open Settings Button */}
            <TouchableOpacity
              style={styles.primaryButton}
              activeOpacity={0.85}
              onPress={openLocationSettings}
            >
              <Text style={styles.primaryButtonText}>Enable Location in Settings ⚙️</Text>
            </TouchableOpacity>

            {/* 2. Re-Check GPS Button */}
            <TouchableOpacity
              style={[styles.secondaryButton, isDark && { backgroundColor: currentColors.elevatedSurface }]}
              activeOpacity={0.75}
              disabled={checking}
              onPress={checkLiveLocation}
            >
              {checking ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color="#0066FF" />
                  <Text style={[styles.secondaryButtonText, isDark && { color: '#60A5FA' }]}>Checking GPS...</Text>
                </View>
              ) : (
                <Text style={[styles.secondaryButtonText, isDark && { color: '#60A5FA' }]}>I Have Turned It On — Check Again 🔄</Text>
              )}
            </TouchableOpacity>

            {!isMandatory && onDismiss && (
              <TouchableOpacity
                style={styles.cancelButton}
                activeOpacity={0.7}
                onPress={onDismiss}
              >
                <Text style={[styles.cancelButtonText, isDark && { color: currentColors.mutedText }]}>Dismiss For Now</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default DeviceLocationRequiredModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: Math.min(SCREEN_WIDTH - 40, 380),
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  iconContainer: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  pulseRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 102, 255, 0.15)',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#BFDBFE',
  },
  iconEmoji: {
    fontSize: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0066FF',
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  errorBox: {
    width: '100%',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 10,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    textAlign: 'center',
    fontWeight: '600',
  },
  buttonGroup: {
    width: '100%',
    gap: 10,
  },
  primaryButton: {
    backgroundColor: '#0066FF',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#0066FF',
    fontSize: 13,
    fontWeight: '700',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancelButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
});

