import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Vibration,
  Clipboard,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

let Sound: any = null;
try {
  Sound = require('react-native-sound');
  if (Sound && Sound.setCategory) {
    Sound.setCategory('Playback', true);
  }
} catch (e) {
  console.log('[CancellationPopup] react-native-sound not available', e);
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Global persistent deduplication registry for dismissed/processed cancellation popups
const dismissedCancellationOrderIds = new Set<string>();
const processedEventKeys = new Set<string>();

/**
 * Helper to check if a cancellation event has already been processed or dismissed.
 * Prevents duplicate popups on component re-render, socket reconnect, and API refetch.
 */
export const isCancellationEventProcessed = (orderId?: string | number, eventKey?: any): boolean => {
  if (!orderId) return true;
  const idStr = String(orderId).trim();
  if (dismissedCancellationOrderIds.has(idStr)) {
    return true;
  }
  const fullKey = `${idStr}_${eventKey || 'CANCELLED'}`;
  if (processedEventKeys.has(fullKey)) {
    return true;
  }
  processedEventKeys.add(fullKey);
  return false;
};

/**
 * Mark an order cancellation as acknowledged and dismissed.
 */
export const markCancellationDismissed = (orderId?: string | number) => {
  if (!orderId) return;
  const idStr = String(orderId).trim();
  dismissedCancellationOrderIds.add(idStr);
};

export interface CancellationRecordData {
  orderId?: string | number;
  bookingId?: string | number;
  status?: string;
  cancelledBy?: 'CUSTOMER' | 'STORE' | 'RESTAURANT' | 'SUPPLIER' | 'RIDER' | 'ADMIN' | string;
  cancellationReason?: string;
  reason?: string;
  cancelledAt?: string | Date;
  refundStatus?: 'NOT_APPLICABLE' | 'PENDING' | 'REFUND_PROCESSED' | 'NO_REFUND' | 'FAILED' | string;
  refundAmount?: number;
  paidAmount?: number;
  isNonRefundable?: boolean;
  storeName?: string;
  restaurantName?: string;
  categoryName?: string;
}

export interface CancellationPopupModalProps {
  visible: boolean;
  role?: 'CUSTOMER' | 'RESTAURANT' | 'RIDER' | 'SUPPLIER';
  cancellationRecord?: CancellationRecordData;
  orderId?: string | number;
  reason?: string;
  cancelledBy?: string;
  customerName?: string;
  restaurantName?: string;
  storeName?: string;
  refundStatus?: string;
  refundAmount?: number;
  paidAmount?: number;
  isNonRefundable?: boolean;
  cancelledAt?: string | Date;
  onClose: () => void;
  onOk?: () => void;
}

let notificationSound: any = null;

export const playCancellationBell = () => {
  if (Sound) {
    try {
      let soundUri = '';
      try {
        const resolved = Image.resolveAssetSource(require('../tone/whats_ringtone.mp3'));
        if (resolved && resolved.uri) soundUri = resolved.uri;
      } catch (_) {
        try {
          const resolvedBanner = Image.resolveAssetSource(require('../banner/tone.mp3'));
          if (resolvedBanner && resolvedBanner.uri) soundUri = resolvedBanner.uri;
        } catch (__) {}
      }

      if (soundUri) {
        notificationSound = new Sound(soundUri, '', (error: any) => {
          if (!error && notificationSound) {
            notificationSound.setVolume(1.0);
            notificationSound.play();
          }
        });
      } else {
        notificationSound = new Sound(require('../tone/whats_ringtone.mp3'), (error: any) => {
          if (!error && notificationSound) {
            notificationSound.setVolume(1.0);
            notificationSound.play();
          }
        });
      }
    } catch (e) {
      console.log('[CancellationPopup] Bell sound playback error:', e);
    }
  }

  try {
    Vibration.vibrate([0, 250, 100, 250]);
  } catch (_) {}
};

export const CancellationPopupModal: React.FC<CancellationPopupModalProps> = ({
  visible,
  role = 'CUSTOMER',
  cancellationRecord,
  orderId,
  reason,
  cancelledBy,
  storeName,
  restaurantName,
  refundStatus,
  refundAmount,
  paidAmount,
  isNonRefundable,
  cancelledAt,
  onClose,
  onOk,
}) => {
  const { isDark, currentColors } = useTheme(role);
  const [copied, setCopied] = useState<boolean>(false);
  const [imageError, setImageError] = useState<boolean>(false);

  // Authoritative Single Source of Truth resolution
  const effectiveOrderId = useMemo(() => {
    return String(
      cancellationRecord?.orderId ||
      cancellationRecord?.bookingId ||
      orderId ||
      ''
    ).trim();
  }, [cancellationRecord, orderId]);

  const displayOrderId = useMemo(() => {
    if (!effectiveOrderId) return '#RH784562';
    if (effectiveOrderId.startsWith('#')) return effectiveOrderId;
    if (effectiveOrderId.startsWith('RH')) return `#${effectiveOrderId}`;
    return `#RH${effectiveOrderId.slice(-6).toUpperCase()}`;
  }, [effectiveOrderId]);

  // Actor normalization: CUSTOMER | STORE | RIDER | ADMIN
  const actor = useMemo(() => {
    const raw = String(
      cancellationRecord?.cancelledBy ||
      cancelledBy ||
      'CUSTOMER'
    ).toUpperCase().trim();

    if (raw.includes('ADMIN')) return 'ADMIN';
    if (raw === 'RIDER' || raw === 'DRIVER' || raw === 'DELIVERY_PARTNER') return 'RIDER';
    if (raw === 'STORE' || raw === 'SUPPLIER' || raw === 'RESTAURANT' || raw === 'PARTNER' || raw === 'PROVIDER') return 'STORE';
    return 'CUSTOMER';
  }, [cancellationRecord, cancelledBy]);

  const displayReason = useMemo(() => {
    const r = cancellationRecord?.cancellationReason || cancellationRecord?.reason || reason;
    if (r && r.trim()) return r.trim();
    if (actor === 'CUSTOMER') return 'Cancelled by customer';
    if (actor === 'STORE') return 'Item out of stock or store busy';
    if (actor === 'RIDER') return 'Delivery partner unavailable';
    if (actor === 'ADMIN') return 'Cancelled by Ride Hub administration';
    return 'Order cancelled';
  }, [cancellationRecord, reason, actor]);

  const resolvedStoreName = useMemo(() => {
    return (
      cancellationRecord?.storeName ||
      cancellationRecord?.restaurantName ||
      storeName ||
      restaurantName ||
      ''
    ).trim();
  }, [cancellationRecord, storeName, restaurantName]);

  const effectiveRefundStatus = useMemo(() => {
    return (
      cancellationRecord?.refundStatus ||
      refundStatus ||
      'NOT_APPLICABLE'
    ).toUpperCase();
  }, [cancellationRecord, refundStatus]);

  const effectiveRefundAmount = useMemo(() => {
    const amt = cancellationRecord?.refundAmount ?? refundAmount;
    return Number(amt || 0);
  }, [cancellationRecord, refundAmount]);

  const effectiveIsNonRefundable = useMemo(() => {
    return Boolean(
      cancellationRecord?.isNonRefundable ||
      isNonRefundable ||
      effectiveRefundStatus === 'NO_REFUND'
    );
  }, [cancellationRecord, isNonRefundable, effectiveRefundStatus]);

  const effectiveCancelledAt = useMemo(() => {
    const raw = cancellationRecord?.cancelledAt || cancelledAt;
    if (!raw) return '';
    try {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (_) {
      return '';
    }
  }, [cancellationRecord, cancelledAt]);

  // Check if dismissed before rendering
  const isDismissed = effectiveOrderId ? dismissedCancellationOrderIds.has(effectiveOrderId) : false;

  useEffect(() => {
    if (visible && !isDismissed) {
      playCancellationBell();
    }
    if (!visible) {
      setCopied(false);
      setImageError(false);
    }
  }, [visible, isDismissed]);

  if (!visible || isDismissed) {
    return null;
  }

  // Dismiss handler
  const handleDismiss = () => {
    if (effectiveOrderId) {
      dismissedCancellationOrderIds.add(effectiveOrderId);
    }
    if (onOk) onOk();
    onClose();
  };

  // Copy order ID to clipboard
  const handleCopyOrderId = () => {
    try {
      Clipboard.setString(effectiveOrderId || displayOrderId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {}
  };

  // Header, Title & Theme determination (Requirement 1 & 2)
  const headerConfig = (() => {
    switch (actor) {
      case 'CUSTOMER':
        return {
          title: 'Order Cancelled by Customer',
          subtitle: role === 'CUSTOMER' ? 'You have cancelled this order.' : 'The customer has cancelled this order.',
          actorLabel: 'Customer',
          actorIcon: '👤',
          badgeColor: '#EF4444',
          badgeBg: '#FEE2E2',
          imageSource: require('../banner/cancel_customer.jpg'),
        };
      case 'STORE':
        return {
          title: resolvedStoreName ? `Order Cancelled by ${resolvedStoreName}` : 'Order Cancelled by Store',
          subtitle: role === 'SUPPLIER' ? 'You have cancelled this order.' : 'The store has cancelled this order.',
          actorLabel: resolvedStoreName || 'Store',
          actorIcon: '🏪',
          badgeColor: '#EA580C',
          badgeBg: '#FFEDD5',
          imageSource: require('../banner/cancel_store.jpg'),
        };
      case 'RIDER':
        return {
          title: 'Ride Cancelled by Delivery Partner',
          subtitle: role === 'RIDER' ? 'You have cancelled this delivery assignment.' : 'The delivery partner was unable to fulfill pickup.',
          actorLabel: 'Delivery Partner',
          actorIcon: '🛵',
          badgeColor: '#0284C7',
          badgeBg: '#E0F2FE',
          imageSource: require('../banner/cancel_rider.jpg'),
        };
      case 'ADMIN':
      default:
        return {
          title: 'Order Cancelled by Admin',
          subtitle: 'Ride Hub Support has cancelled this order.',
          actorLabel: 'Ride Hub Support',
          actorIcon: '🛡️',
          badgeColor: '#6366F1',
          badgeBg: '#EEF2FF',
          imageSource: null,
        };
    }
  })();

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <View style={[styles.popupCard, isDark && { backgroundColor: currentColors.card, borderColor: currentColors.border, borderWidth: 1 }]}>
          {/* Top Close Button */}
          <TouchableOpacity
            style={[styles.closeBtn, isDark && { backgroundColor: currentColors.elevatedSurface }]}
            onPress={handleDismiss}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <Text style={[styles.closeIcon, isDark && { color: currentColors.primaryText }]}>✕</Text>
          </TouchableOpacity>

          {/* Top Dynamic Illustration or Fallback (Requirement 2) */}
          <View style={styles.topIllustrationContainer}>
            {headerConfig.imageSource && !imageError ? (
              <Image
                source={headerConfig.imageSource}
                style={styles.illustrationImg}
                resizeMode="contain"
                onError={() => setImageError(true)}
              />
            ) : (
              <View style={[styles.fallbackAvatarContainer, { backgroundColor: isDark ? currentColors.elevatedSurface : headerConfig.badgeBg }]}>
                <Text style={styles.fallbackAvatarEmoji}>{headerConfig.actorIcon}</Text>
                <View style={styles.fallbackCancelBadge}>
                  <Text style={styles.fallbackCancelText}>✕</Text>
                </View>
              </View>
            )}
          </View>

          {/* Dynamic Title & Subtitle (Requirement 1) */}
          <Text style={[styles.titleText, isDark && { color: currentColors.primaryText }]}>{headerConfig.title}</Text>
          <Text style={[styles.subtitleText, isDark && { color: currentColors.secondaryText }]}>{headerConfig.subtitle}</Text>

          {/* Details Card (Requirement 3: Single Source of Truth) */}
          <View style={[styles.detailsCard, isDark && { backgroundColor: currentColors.secondaryBackground, borderColor: currentColors.border }]}>
            {/* Row 1: Order ID with Copy button */}
            <View style={styles.orderIdRow}>
              <View>
                <Text style={[styles.orderIdLabel, isDark && { color: currentColors.mutedText }]}>Order ID</Text>
                <Text style={[styles.orderIdValue, isDark && { color: currentColors.primaryText }]}>{displayOrderId}</Text>
              </View>
              <TouchableOpacity
                style={[styles.copyBtn, isDark && { backgroundColor: currentColors.elevatedSurface, borderColor: currentColors.border }]}
                onPress={handleCopyOrderId}
                activeOpacity={0.7}
              >
                <Text style={[styles.copyBtnText, isDark && { color: '#60A5FA' }]}>{copied ? 'Copied ✓' : 'Copy 📋'}</Text>
              </TouchableOpacity>
            </View>

            {/* Row 2: Cancelled By Tag & Time */}
            <View style={styles.actorRow}>
              <View style={[styles.actorPill, { backgroundColor: isDark ? currentColors.elevatedSurface : headerConfig.badgeBg, borderWidth: isDark ? 1 : 0, borderColor: currentColors.border }]}>
                <Text style={[styles.actorPillText, { color: isDark ? '#F87171' : headerConfig.badgeColor }]}>
                  {headerConfig.actorIcon} Cancelled by {headerConfig.actorLabel}
                </Text>
              </View>
              {Boolean(effectiveCancelledAt) && (
                <Text style={[styles.timeText, isDark && { color: currentColors.mutedText }]}>🕒 {effectiveCancelledAt}</Text>
              )}
            </View>

            {/* Row 3: Cancellation Reason */}
            <View style={[styles.reasonBox, isDark && { backgroundColor: currentColors.card, borderColor: currentColors.border }]}>
              <Text style={[styles.reasonLabel, isDark && { color: currentColors.mutedText }]}>REASON</Text>
              <Text style={[styles.reasonText, isDark && { color: currentColors.secondaryText }]} numberOfLines={3}>{displayReason}</Text>
            </View>

            {/* Row 4: Dynamic Refund Status Card */}
            {effectiveIsNonRefundable ? (
              <View style={[styles.refundCard, { backgroundColor: isDark ? '#2D1B13' : '#FFF7ED', borderColor: isDark ? '#7C2D12' : '#FFEDD5' }]}>
                <Text style={styles.refundIcon}>⚠️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.refundTitle, { color: isDark ? '#FB923C' : '#C2410C' }]}>Non-Refundable Order</Text>
                  <Text style={[styles.refundDesc, isDark && { color: currentColors.secondaryText }]}>
                    Preparation had already begun before cancellation; as per policy, this order is non-refundable.
                  </Text>
                </View>
              </View>
            ) : effectiveRefundStatus === 'REFUND_PROCESSED' || effectiveRefundAmount > 0 ? (
              <View style={[styles.refundCard, { backgroundColor: isDark ? '#143323' : '#F0FDF4', borderColor: isDark ? '#166534' : '#DCFCE7' }]}>
                <Text style={styles.refundIcon}>💳</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.refundTitle, { color: isDark ? '#4ADE80' : '#15803D' }]}>
                    Refund Initiated: ₹{effectiveRefundAmount}
                  </Text>
                  <Text style={[styles.refundDesc, isDark && { color: currentColors.secondaryText }]}>
                    Amount will reflect in your original payment method / Ride Hub wallet.
                  </Text>
                </View>
              </View>
            ) : effectiveRefundStatus === 'PENDING' ? (
              <View style={[styles.refundCard, { backgroundColor: isDark ? '#152545' : '#EFF6FF', borderColor: isDark ? '#1E40AF' : '#DBEAFE' }]}>
                <Text style={styles.refundIcon}>⏳</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.refundTitle, { color: isDark ? '#60A5FA' : '#1D4ED8' }]}>Refund In Process</Text>
                  <Text style={[styles.refundDesc, isDark && { color: currentColors.secondaryText }]}>
                    Refund is being processed and will be credited within 2-4 business days.
                  </Text>
                </View>
              </View>
            ) : (
              <View style={[styles.refundCard, { backgroundColor: isDark ? currentColors.elevatedSurface : '#F8FAFC', borderColor: currentColors.border }]}>
                <Text style={styles.refundIcon}>ℹ️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.refundTitle, { color: isDark ? currentColors.primaryText : '#475569' }]}>No Payment Deducted</Text>
                  <Text style={[styles.refundDesc, isDark && { color: currentColors.secondaryText }]}>
                    This order was cancelled with zero cancellation charge.
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Primary Action Button */}
          <TouchableOpacity
            style={styles.okButton}
            onPress={handleDismiss}
            activeOpacity={0.85}
          >
            <Text style={styles.okButtonText}>OK, UNDERSTOOD</Text>
          </TouchableOpacity>

          {/* Bottom Policy Footer */}
          <Text style={[styles.footerNote, isDark && { color: currentColors.mutedText }]}>
            This order has been safely recorded in your order history.
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 99999,
  },
  popupCard: {
    width: Math.min(SCREEN_WIDTH - 36, 380),
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 28,
    elevation: 24,
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeIcon: {
    fontSize: 15,
    color: '#475569',
    fontWeight: '800',
  },
  topIllustrationContainer: {
    width: '100%',
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 10,
  },
  illustrationImg: {
    width: 140,
    height: 140,
  },
  fallbackAvatarContainer: {
    width: 110,
    height: 110,
    borderRadius: 55,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  fallbackAvatarEmoji: {
    fontSize: 50,
  },
  fallbackCancelBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackCancelText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  titleText: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  subtitleText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  detailsCard: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  orderIdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  orderIdLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  orderIdValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  copyBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  copyBtnText: {
    fontSize: 12,
    color: '#1E40AF',
    fontWeight: '700',
  },
  actorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 6,
  },
  actorPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  actorPillText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  timeText: {
    fontSize: 11.5,
    color: '#94A3B8',
    fontWeight: '600',
  },
  reasonBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  reasonLabel: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  reasonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginTop: 2,
    lineHeight: 18,
  },
  refundCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  refundIcon: {
    fontSize: 20,
  },
  refundTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  refundDesc: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
  },
  okButton: {
    width: '100%',
    backgroundColor: '#0066FF',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 10,
  },
  okButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  footerNote: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    fontWeight: '500',
  },
});

export default CancellationPopupModal;
