import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  TextInput,
  Dimensions,
  Animated,
} from 'react-native';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';
import { fetchCurrentGpsPosition, reverseGeocodeCoords } from '../services/LocationAddressService';
import rideStore from '../services/rideStore';
import { useTheme } from '../context/ThemeContext';

const { width } = Dimensions.get('window');

export interface OrderTransferModalProps {
  visible: boolean;
  onClose: () => void;
  bookingId: string;
  orderData?: any;
  riderUser?: any;
  onTransferSuccess?: (updatedBooking?: any) => void;
}

const TRANSFER_REASONS = [
  { id: 'Bike Puncture', label: 'Bike Puncture', icon: '🚲', desc: 'Cannot ride due to puncture or tyre issue' },
  { id: 'Vehicle Breakdown', label: 'Bike Breakdown', icon: '🔧', desc: 'Engine failure, chain issue or mechanical problem' },
  { id: 'Accident', label: 'Accident', icon: '🩹', desc: 'Collision or slip on road, unable to continue' },
  { id: 'Personal Emergency', label: 'Personal Emergency', icon: '🚨', desc: 'Urgent personal or family matter' },
  { id: 'Health Problem', label: 'Health Problem', icon: '🩺', desc: 'Sudden illness, weakness or medical condition' },
  { id: 'Road Block', label: 'Road Block', icon: '🚧', desc: 'Route blocked, diversion or construction' },
  { id: 'Traffic', label: 'Traffic', icon: '🚦', desc: 'Severe gridlock or unmovable congestion' },
  { id: 'Helmet Not Available', label: 'Helmet Not Available', icon: '🪖', desc: 'Safety gear missing or damaged' },
];

export const OrderTransferModal: React.FC<OrderTransferModalProps> = ({
  visible,
  onClose,
  bookingId,
  orderData,
  riderUser,
  onTransferSuccess,
}) => {
  const { socket } = useSocket();
  const { isDark, currentColors } = useTheme('delivery');

  // Steps: 'SELECT_REASON' | 'CONFIRM' | 'WAITING_HANDOVER' | 'COMPLETED'
  const [step, setStep] = useState<'SELECT_REASON' | 'CONFIRM' | 'WAITING_HANDOVER' | 'COMPLETED'>('SELECT_REASON');
  const [selectedReason, setSelectedReason] = useState<string>('Bike Puncture');
  const [otherDetails, setOtherDetails] = useState<string>('');

  // Real GPS Handover Location State
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [handoverCoords, setHandoverCoords] = useState<{ latitude: number; longitude: number; accuracy?: number } | null>(null);
  const [handoverAddress, setHandoverAddress] = useState<string>('');
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Transfer Request Processing State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  // Active Transfer Handover State
  const [transferOtp, setTransferOtp] = useState<string>('');
  const [incomingPartner, setIncomingPartner] = useState<{
    riderId?: string;
    name?: string;
    phone?: string;
    etaMinutes?: number;
    distKm?: number;
  } | null>(null);

  // Pulse animation for waiting screen
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      setStep('SELECT_REASON');
      setSelectedReason('Bike Puncture');
      setOtherDetails('');
      setIncomingPartner(null);
      setTransferOtp('');
      detectRealGpsLocation();
    }
  }, [visible]);

  // Pulse effect when waiting for handover partner
  useEffect(() => {
    if (step === 'WAITING_HANDOVER') {
      Animated.loop(
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
      ).start();
    }
  }, [step]);

  // Socket listeners for Transfer events
  useEffect(() => {
    if (!socket || !visible) return;

    const onTransferAccepted = (data: any) => {
      console.log('📢 [ORDER_TRANSFER] Partner accepted transfer:', data);
      if (data?.bookingId === bookingId || data?.orderId === bookingId) {
        setIncomingPartner({
          riderId: data.transferRiderId,
          name: data.transferRiderName || 'Nearby Delivery Partner',
          phone: data.transferRiderPhone || '',
          etaMinutes: data.etaMinutes || 5,
          distKm: data.distKm || 1.2,
        });
        if (data.transferOtp) {
          setTransferOtp(data.transferOtp);
        }
      }
    };

    const onTransferCompleted = (data: any) => {
      console.log('🎉 [ORDER_TRANSFER] Handover completed:', data);
      if (data?.bookingId === bookingId || data?.orderId === bookingId) {
        setStep('COMPLETED');
      }
    };

    socket.on('TRANSFER_ACCEPTED', onTransferAccepted);
    socket.on('TRANSFER_COMPLETED', onTransferCompleted);
    socket.on('ORDER_TRANSFERRED', onTransferCompleted);

    return () => {
      socket.off('TRANSFER_ACCEPTED', onTransferAccepted);
      socket.off('TRANSFER_COMPLETED', onTransferCompleted);
      socket.off('ORDER_TRANSFERRED', onTransferCompleted);
    };
  }, [socket, visible, bookingId]);

  // Real Hardware GPS Location Fetch
  const detectRealGpsLocation = async () => {
    try {
      setIsLocating(true);
      setGpsError(null);
      const pos = await fetchCurrentGpsPosition(false);
      if (pos && pos.latitude && pos.longitude) {
        setHandoverCoords({
          latitude: pos.latitude,
          longitude: pos.longitude,
          accuracy: pos.accuracy || 10,
        });
        const addrRes = await reverseGeocodeCoords(pos.latitude, pos.longitude);
        const addrText = typeof addrRes === 'string' ? addrRes : (addrRes?.fullAddress || (addrRes?.area ? `${addrRes.area}, ${addrRes.city}` : `Lat: ${pos.latitude.toFixed(5)}, Lon: ${pos.longitude.toFixed(5)}`));
        setHandoverAddress(addrText);
      } else {
        setGpsError('Real GPS location unavailable. Turn on high accuracy location.');
      }
    } catch (err: any) {
      console.warn('[OrderTransferModal] GPS error:', err);
      setGpsError('Could not fetch device GPS. Please check location settings.');
    } finally {
      setIsLocating(false);
    }
  };

  // 1. Submit Transfer Request
  const handleConfirmTransfer = async () => {
    if (!handoverCoords || !handoverCoords.latitude || !handoverCoords.longitude) {
      Alert.alert('GPS Location Required', 'Real device location is required to set the handover point for the new partner.');
      await detectRealGpsLocation();
      return;
    }

    try {
      setIsSubmitting(true);
      const targetRiderId = riderUser?._id || riderUser?.id || orderData?.riderId || orderData?.providerId;
      const targetBookingId = bookingId || orderData?.bookingId || orderData?._id;

      const payload = {
        bookingId: targetBookingId,
        riderId: targetRiderId,
        reason: selectedReason,
        details: otherDetails,
        transferLocation: {
          latitude: handoverCoords.latitude,
          longitude: handoverCoords.longitude,
          address: handoverAddress,
          accuracy: handoverCoords.accuracy || 10,
        },
      };

      console.log('🚀 [ORDER_TRANSFER] Submitting transfer request:', payload);
      const res = await api.post('/bookings/transfer/request', payload);

      if (res.data?.success) {
        const otpCode = res.data.transferOtp || '7391';
        setTransferOtp(otpCode);
        setStep('WAITING_HANDOVER');
      } else {
        Alert.alert('Transfer Error', res.data?.message || 'Could not initiate transfer. Please try again.');
      }
    } catch (err: any) {
      console.error('[OrderTransferModal] Error submitting transfer:', err);
      Alert.alert(
        'Transfer Failed',
        err?.response?.data?.message || err?.message || 'Failed to submit order transfer request.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cancel Transfer before handover OTP verified
  const handleCancelTransfer = async () => {
    try {
      setIsCancelling(true);
      const targetRiderId = riderUser?._id || riderUser?.id;
      const targetBookingId = bookingId || orderData?.bookingId || orderData?._id;

      const res = await api.post('/bookings/transfer/cancel', {
        bookingId: targetBookingId,
        riderId: targetRiderId,
      });

      if (res.data?.success) {
        Alert.alert('Transfer Cancelled', 'You remain assigned to this delivery.');
        onClose();
      } else {
        Alert.alert('Notice', res.data?.message || 'Could not cancel transfer.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not cancel transfer.');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleFinish = () => {
    try {
      rideStore.clearRide();
    } catch (_) {}
    if (onTransferSuccess) {
      onTransferSuccess();
    }
    onClose();
  };

  const displayOrderId = String(orderData?.bookingId || bookingId || 'RH-ORDER').slice(-8).toUpperCase();

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={step === 'WAITING_HANDOVER' ? undefined : onClose}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, isDark && { backgroundColor: currentColors.card, borderColor: currentColors.border, borderWidth: 1 }]}>
          {/* Header Bar */}
          <View style={[styles.headerRow, isDark && { borderBottomColor: currentColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 24 }}>🔄</Text>
              <View>
                <Text style={[styles.headerTitle, isDark && { color: currentColors.primaryText }]}>Order Transfer</Text>
                <Text style={[styles.orderIdSub, isDark && { color: currentColors.mutedText }]}>Order #{displayOrderId}</Text>
              </View>
            </View>
            {step !== 'WAITING_HANDOVER' && step !== 'COMPLETED' && (
              <TouchableOpacity onPress={onClose} style={[styles.closeBtn, isDark && { backgroundColor: currentColors.elevatedSurface }]}>
                <Text style={[styles.closeBtnText, isDark && { color: currentColors.primaryText }]}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ═══════════════════════════════════════════════════ */}
          {/* STEP 1: SELECT REASON & EMERGENCY ASSISTANCE        */}
          {/* ═══════════════════════════════════════════════════ */}
          {step === 'SELECT_REASON' && (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {/* Emergency Banner */}
              <TouchableOpacity
                style={[styles.emergencyCard, isDark && { backgroundColor: '#2E1515', borderColor: '#7F1D1D' }]}
                onPress={() => {
                  Alert.alert(
                    'Emergency SOS Helpline',
                    'If you or someone else is hurt in a serious accident, call emergency help immediately:',
                    [
                      { text: 'Police (112)', onPress: () => Linking.openURL('tel:112'), style: 'destructive' },
                      { text: 'Ambulance (108)', onPress: () => Linking.openURL('tel:108') },
                      { text: 'National Emergency (112)', onPress: () => Linking.openURL('tel:112') },
                      { text: 'Cancel', style: 'cancel' },
                    ]
                  );
                }}
                activeOpacity={0.85}
              >
                <View style={styles.emergencyIconWrap}>
                  <Text style={{ fontSize: 22 }}>🚨</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.emergencyTitle, isDark && { color: '#F87171' }]}>Had a Serious Accident?</Text>
                  <Text style={[styles.emergencySub, isDark && { color: '#FCA5A5' }]}>Call 112 / 108 Emergency Helpline immediately</Text>
                </View>
                <Text style={[styles.emergencyChevron, isDark && { color: '#F87171' }]}>›</Text>
              </TouchableOpacity>

              <Text style={[styles.sectionHeader, isDark && { color: currentColors.primaryText }]}>Why do you need to transfer this delivery?</Text>

              {TRANSFER_REASONS.map((item) => {
                const isSelected = selectedReason === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.reasonItem,
                      isDark && { backgroundColor: currentColors.elevatedSurface, borderColor: currentColors.border },
                      isSelected && (isDark ? { borderColor: '#0066FF', backgroundColor: '#1A2332' } : styles.reasonItemSelected)
                    ]}
                    onPress={() => setSelectedReason(item.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.reasonIconCircle, isDark && { backgroundColor: currentColors.card }, isSelected && styles.reasonIconCircleSelected]}>
                      <Text style={{ fontSize: 20 }}>{item.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.reasonLabel, isDark && { color: currentColors.primaryText }, isSelected && styles.reasonLabelSelected]}>
                        {item.label}
                      </Text>
                      <Text style={[styles.reasonDesc, isDark && { color: currentColors.secondaryText }]}>{item.desc}</Text>
                    </View>
                    <View style={[styles.radioCircle, isDark && { borderColor: currentColors.border }, isSelected && styles.radioCircleSelected]}>
                      {isSelected && <View style={styles.radioDot} />}
                    </View>
                  </TouchableOpacity>
                );
              })}

              {selectedReason === 'Other' && (
                <View style={styles.otherInputWrap}>
                  <TextInput
                    style={[styles.otherInput, isDark && { backgroundColor: currentColors.inputBackground, borderColor: '#0066FF', color: currentColors.primaryText }]}
                    placeholder="Describe the issue briefly..."
                    placeholderTextColor={currentColors.placeholder}
                    value={otherDetails}
                    onChangeText={setOtherDetails}
                    multiline
                  />
                </View>
              )}

              {/* Next Button */}
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => setStep('CONFIRM')}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryBtnText}>Continue to Confirmation ›</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* ═══════════════════════════════════════════════════ */}
          {/* STEP 2: CONFIRMATION & REAL GPS HANDOVER POINT      */}
          {/* ═══════════════════════════════════════════════════ */}
          {step === 'CONFIRM' && (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {/* ₹0 Penalty Banner */}
              <View style={[styles.policyBanner, isDark && { backgroundColor: currentColors.elevatedSurface, borderColor: currentColors.border }]}>
                <View style={styles.policyBadge}>
                  <Text style={styles.policyBadgeText}>₹0 PENALTY FOR BREAKDOWN</Text>
                </View>
                <Text style={[styles.policyBannerTitle, isDark && { color: currentColors.primaryText }]}>Emergency Handover Policy</Text>
                <Text style={[styles.policyBannerDesc, isDark && { color: currentColors.secondaryText }]}>
                  The order will NOT be cancelled. It will continue with the same Order ID and will be reassigned to a nearby delivery partner.
                </Text>
              </View>

              {/* Selected Reason Summary */}
              <View style={[styles.summaryRow, isDark && { borderBottomColor: currentColors.border }]}>
                <Text style={[styles.summaryLabel, isDark && { color: currentColors.mutedText }]}>Selected Reason:</Text>
                <Text style={[styles.summaryValueBold, isDark && { color: currentColors.primaryText }]}>{selectedReason}</Text>
              </View>

              {/* Real GPS Handover Location Card */}
              <View style={[styles.gpsLocationCard, isDark && { backgroundColor: currentColors.elevatedSurface, borderColor: currentColors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 16 }}>📍</Text>
                    <Text style={[styles.gpsCardTitle, isDark && { color: currentColors.primaryText }]}>Order Handover Location</Text>
                  </View>
                  {handoverCoords ? (
                    <View style={styles.gpsBadgeSuccess}>
                      <Text style={styles.gpsBadgeSuccessText}>🟢 Real GPS Locked</Text>
                    </View>
                  ) : (
                    <View style={styles.gpsBadgePending}>
                      <Text style={styles.gpsBadgePendingText}>Locating...</Text>
                    </View>
                  )}
                </View>

                {isLocating ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 }}>
                    <ActivityIndicator size="small" color="#0066FF" />
                    <Text style={{ fontSize: 13, color: currentColors.mutedText }}>Fetching hardware GPS coordinates...</Text>
                  </View>
                ) : gpsError ? (
                  <View>
                    <Text style={{ color: '#EF4444', fontSize: 13, marginBottom: 8 }}>{gpsError}</Text>
                    <TouchableOpacity onPress={detectRealGpsLocation} style={[styles.retryGpsBtn, isDark && { backgroundColor: currentColors.card, borderColor: currentColors.border }]}>
                      <Text style={styles.retryGpsBtnText}>🔄 Retry GPS Lock</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    <Text style={[styles.gpsCoordsText, isDark && { color: currentColors.primaryText }]}>
                      Coordinates: {handoverCoords?.latitude?.toFixed(6)}, {handoverCoords?.longitude?.toFixed(6)}
                    </Text>
                    <Text style={[styles.gpsAddressText, isDark && { color: currentColors.secondaryText }]} numberOfLines={2}>
                      {handoverAddress || 'Current Physical Device Location'}
                    </Text>
                    <Text style={styles.gpsAccuracyText}>
                      Sensor Accuracy: ±{handoverCoords?.accuracy ? handoverCoords.accuracy.toFixed(1) : '5.0'} meters
                    </Text>
                  </View>
                )}
              </View>

              {/* Policy Checklist */}
              <View style={[styles.policyChecklist, isDark && { backgroundColor: currentColors.elevatedSurface }]}>
                <Text style={[styles.policyCheckTitle, isDark && { color: currentColors.primaryText }]}>Important Information:</Text>
                <Text style={[styles.policyCheckItem, isDark && { color: currentColors.secondaryText }]}>• We will assign this order to the nearest available delivery partner.</Text>
                <Text style={[styles.policyCheckItem, isDark && { color: currentColors.secondaryText }]}>• You must wait at the handover location until the new partner arrives.</Text>
                <Text style={[styles.policyCheckItem, isDark && { color: currentColors.secondaryText }]}>• You will share a secure 4-digit OTP with the partner when handing over the food.</Text>
                <Text style={[styles.policyCheckItem, isDark && { color: currentColors.secondaryText }]}>• Your earnings will be credited according to the emergency transfer policy.</Text>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionBtnRow}>
                <TouchableOpacity
                  style={[styles.secondaryBtn, isDark && { backgroundColor: currentColors.elevatedSurface }]}
                  onPress={() => setStep('SELECT_REASON')}
                  disabled={isSubmitting}
                >
                  <Text style={[styles.secondaryBtnText, isDark && { color: currentColors.primaryText }]}>‹ Back</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.confirmBtn}
                  onPress={handleConfirmTransfer}
                  disabled={isSubmitting || !handoverCoords}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.confirmBtnText}>Confirm Handover</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {/* ═══════════════════════════════════════════════════ */}
          {/* STEP 3: SEARCHING & HANDOVER OTP DISPLAY           */}
          {/* ═══════════════════════════════════════════════════ */}
          {step === 'WAITING_HANDOVER' && (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {/* Radar / Pulsing Indicator */}
              <View style={styles.pulseContainer}>
                <Animated.View style={[styles.pulseCircle, isDark && { backgroundColor: '#1A2332', borderColor: '#3B82F6' }, { transform: [{ scale: pulseAnim }] }]}>
                  <Text style={{ fontSize: 36 }}>📦</Text>
                </Animated.View>
                <Text style={[styles.pulseTitle, isDark && { color: currentColors.primaryText }]}>
                  {incomingPartner ? 'Delivery Partner Arriving!' : 'Finding Nearby Delivery Partner...'}
                </Text>
                <Text style={[styles.pulseSubtitle, isDark && { color: currentColors.secondaryText }]}>
                  {incomingPartner
                    ? `${incomingPartner.name} has accepted the handover`
                    : 'Broadcasting request to active riders near your handover location'}
                </Text>
              </View>

              {/* Secure 4-Digit Handover OTP Box */}
              <View style={[styles.otpBoxContainer, isDark && { backgroundColor: currentColors.elevatedSurface }]}>
                <Text style={styles.otpBoxHeading}>HANDOVER VERIFICATION OTP</Text>
                <Text style={[styles.otpBoxSub, isDark && { color: currentColors.secondaryText }]}>Share this 4-digit OTP when handing over the package:</Text>
                
                <View style={styles.otpDigitsRow}>
                  {String(transferOtp || '7391').split('').map((digit, idx) => (
                    <View key={idx} style={[styles.otpDigitBlock, isDark && { backgroundColor: currentColors.card, borderColor: '#3B82F6' }]}>
                      <Text style={styles.otpDigitText}>{digit}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.otpSecurityNote}>🔒 Handover transfers only after this OTP is verified</Text>
              </View>

              {/* Incoming Partner Status Card */}
              {incomingPartner && (
                <View style={[styles.partnerCard, isDark && { backgroundColor: '#143323', borderColor: '#166534' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.partnerName, isDark && { color: '#4ADE80' }]}>{incomingPartner.name}</Text>
                      <Text style={[styles.partnerEta, isDark && { color: '#86EFAC' }]}>
                        ETA: ~{incomingPartner.etaMinutes} mins ({incomingPartner.distKm} km away)
                      </Text>
                    </View>
                    {Boolean(incomingPartner.phone) && (
                      <TouchableOpacity
                        style={styles.callPartnerBtn}
                        onPress={() => Linking.openURL(`tel:${incomingPartner.phone}`)}
                      >
                        <Text style={{ fontSize: 16, marginRight: 4 }}>📞</Text>
                        <Text style={styles.callPartnerBtnText}>Call</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}

              {/* Handover Point Preview */}
              <View style={[styles.handoverLocationPreview, isDark && { backgroundColor: currentColors.elevatedSurface }]}>
                <Text style={[styles.previewLabel, isDark && { color: currentColors.mutedText }]}>📍 Meet Partner at Handover Location:</Text>
                <Text style={[styles.previewAddress, isDark && { color: currentColors.primaryText }]}>{handoverAddress}</Text>
              </View>

              {/* Cancel Option */}
              <TouchableOpacity
                style={styles.cancelTransferBtn}
                onPress={handleCancelTransfer}
                disabled={isCancelling}
              >
                {isCancelling ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <Text style={styles.cancelTransferBtnText}>Cancel Transfer (Bike Fixed)</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* ═══════════════════════════════════════════════════ */}
          {/* STEP 4: COMPLETED SCREEN                           */}
          {/* ═══════════════════════════════════════════════════ */}
          {step === 'COMPLETED' && (
            <View style={styles.completedContainer}>
              <View style={styles.completedIconWrap}>
                <Text style={{ fontSize: 44 }}>✅</Text>
              </View>
              <Text style={styles.completedTitle}>Order Handover Complete!</Text>
              <Text style={styles.completedDesc}>
                The delivery has been successfully transferred to the new partner. The customer has been notified and the order is continuing without interruption.
              </Text>
              <View style={styles.completedZeroPenaltyBadge}>
                <Text style={styles.completedZeroPenaltyText}>₹0 PENALTY APPLIED</Text>
              </View>
              <TouchableOpacity
                style={styles.finishBtn}
                onPress={handleFinish}
                activeOpacity={0.8}
              >
                <Text style={styles.finishBtnText}>Return to Dashboard</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    maxHeight: '90%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  orderIdSub: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: '700',
  },
  emergencyCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FECACA',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  emergencyIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emergencyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#DC2626',
  },
  emergencySub: {
    fontSize: 11.5,
    color: '#991B1B',
    marginTop: 1,
  },
  emergencyChevron: {
    fontSize: 20,
    fontWeight: '700',
    color: '#DC2626',
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    backgroundColor: '#F8FAFC',
    gap: 10,
  },
  reasonItemSelected: {
    borderColor: '#0066FF',
    backgroundColor: '#EFF6FF',
  },
  reasonIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonIconCircleSelected: {
    backgroundColor: '#DBEAFE',
  },
  reasonLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  reasonLabelSelected: {
    color: '#0066FF',
  },
  reasonDesc: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: '#0066FF',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0066FF',
  },
  otherInputWrap: {
    marginBottom: 14,
  },
  otherInput: {
    borderWidth: 1.5,
    borderColor: '#0066FF',
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    minHeight: 60,
  },
  primaryBtn: {
    backgroundColor: '#0066FF',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  policyBanner: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  policyBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  policyBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  policyBannerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E3A8A',
  },
  policyBannerDesc: {
    fontSize: 12,
    color: '#3B82F6',
    marginTop: 4,
    lineHeight: 17,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  summaryValueBold: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  gpsLocationCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  gpsCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  gpsBadgeSuccess: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  gpsBadgeSuccessText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#16A34A',
  },
  gpsBadgePending: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  gpsBadgePendingText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#D97706',
  },
  gpsCoordsText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 4,
  },
  gpsAddressText: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  gpsAccuracyText: {
    fontSize: 11,
    color: '#16A34A',
    fontWeight: '600',
    marginTop: 3,
  },
  retryGpsBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  retryGpsBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0066FF',
  },
  policyChecklist: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  policyCheckTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 6,
  },
  policyCheckItem: {
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 4,
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  confirmBtn: {
    flex: 2,
    backgroundColor: '#0066FF',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  pulseContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  pulseCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EFF6FF',
    borderWidth: 2,
    borderColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  pulseTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  pulseSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 20,
  },
  otpBoxContainer: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  otpBoxHeading: {
    fontSize: 11,
    fontWeight: '900',
    color: '#94A3B8',
    letterSpacing: 1,
  },
  otpBoxSub: {
    fontSize: 12,
    color: '#CBD5E1',
    marginTop: 4,
    marginBottom: 12,
    textAlign: 'center',
  },
  otpDigitsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  otpDigitBlock: {
    width: 52,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    borderWidth: 2,
    borderColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpDigitText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  otpSecurityNote: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  partnerCard: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  partnerName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#065F46',
  },
  partnerEta: {
    fontSize: 12.5,
    color: '#047857',
    marginTop: 2,
    fontWeight: '600',
  },
  callPartnerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  callPartnerBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  handoverLocationPreview: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  previewAddress: {
    fontSize: 12.5,
    color: '#0F172A',
    marginTop: 3,
  },
  cancelTransferBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelTransferBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#EF4444',
  },
  completedContainer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  completedIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  completedTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#15803D',
  },
  completedDesc: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 19,
    paddingHorizontal: 16,
  },
  completedZeroPenaltyBadge: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    marginTop: 16,
    marginBottom: 24,
  },
  completedZeroPenaltyText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  finishBtn: {
    backgroundColor: '#0F172A',
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 14,
    alignItems: 'center',
  },
  finishBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

export default OrderTransferModal;
