import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  Dimensions,
} from 'react-native';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';

const { width } = Dimensions.get('window');

export interface HandoverOtpVerifyModalProps {
  visible: boolean;
  onClose: () => void;
  bookingId: string;
  riderUser?: any;
  originalRiderName?: string;
  originalRiderPhone?: string;
  handoverAddress?: string;
  onVerifiedSuccess: (updatedBooking?: any) => void;
}

export const HandoverOtpVerifyModal: React.FC<HandoverOtpVerifyModalProps> = ({
  visible,
  onClose,
  bookingId,
  riderUser,
  originalRiderName,
  originalRiderPhone,
  handoverAddress,
  onVerifiedSuccess,
}) => {
  const { isDark, currentColors } = useTheme('delivery');
  const [digits, setDigits] = useState<string[]>(['', '', '', '']);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const inputRefs = [
    useRef<TextInput>(null),
    useRef<TextInput>(null),
    useRef<TextInput>(null),
    useRef<TextInput>(null),
  ];

  const handleDigitChange = (val: string, index: number) => {
    const clean = val.replace(/\D/g, '');
    const newDigits = [...digits];
    newDigits[index] = clean ? clean[clean.length - 1] : '';
    setDigits(newDigits);
    setErrorMsg(null);

    // Auto-advance to next input
    if (clean && index < 3) {
      inputRefs[index + 1].current?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs[index - 1].current?.focus();
    }
  };

  const handleVerify = async () => {
    const fullOtp = digits.join('');
    if (fullOtp.length < 4) {
      setErrorMsg('कृपया 4-अंकीय OTP कोड दर्ज करें।');
      return;
    }

    try {
      setIsVerifying(true);
      setErrorMsg(null);
      const targetRiderId = riderUser?._id || riderUser?.id;

      const res = await api.post('/bookings/transfer/verify', {
        bookingId,
        riderId: targetRiderId,
        otp: fullOtp,
      });

      if (res.data?.success) {
        Alert.alert(
          'हैंडओवर सत्यापित! (Verified)',
          'ऑर्डर सफलतापूर्वक आपके नाम ट्रांसफर हो गया है। अब आप ग्राहक को आर्डर डिलीवर कर सकते हैं।'
        );
        onVerifiedSuccess(res.data.booking);
        onClose();
      } else {
        setErrorMsg(res.data?.message || 'अमान्य OTP कोड।');
      }
    } catch (err: any) {
      console.error('[HandoverOtpVerifyModal] Verify error:', err);
      setErrorMsg(err?.response?.data?.message || err?.message || 'सत्यापन विफल।');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, isDark && { backgroundColor: currentColors.card, borderColor: currentColors.border, borderWidth: 1 }]}>
          {/* Header */}
          <View style={[styles.headerRow, isDark && { borderBottomColor: currentColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 24 }}>🔐</Text>
              <View>
                <Text style={[styles.title, isDark && { color: currentColors.primaryText }]}>Verify Handover OTP</Text>
                <Text style={[styles.subTitle, isDark && { color: currentColors.mutedText }]}>Order #{String(bookingId).slice(-8).toUpperCase()}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, isDark && { backgroundColor: currentColors.elevatedSurface }]}>
              <Text style={[styles.closeBtnText, isDark && { color: currentColors.primaryText }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Original Rider Info Card */}
          <View style={[styles.origRiderCard, isDark && { backgroundColor: currentColors.elevatedSurface, borderColor: currentColors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.origRiderLabel, isDark && { color: '#60A5FA' }]}>Meet Original Partner:</Text>
                <Text style={[styles.origRiderName, isDark && { color: currentColors.primaryText }]}>{originalRiderName || 'Delivery Partner'}</Text>
                {Boolean(handoverAddress) && (
                  <Text style={[styles.handoverAddr, isDark && { color: currentColors.secondaryText }]} numberOfLines={2}>
                    📍 {handoverAddress}
                  </Text>
                )}
              </View>
              {Boolean(originalRiderPhone) && (
                <TouchableOpacity
                  style={styles.callBtn}
                  onPress={() => Linking.openURL(`tel:${originalRiderPhone}`)}
                >
                  <Text style={{ fontSize: 16 }}>📞</Text>
                  <Text style={styles.callBtnText}>Call</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Prompt */}
          <Text style={[styles.promptText, isDark && { color: currentColors.secondaryText }]}>
            मूल राइडर से 4-अंकीय हैंडओवर OTP प्राप्त करके नीचे दर्ज करें:
          </Text>

          {/* OTP Digit Inputs */}
          <View style={styles.otpRow}>
            {digits.map((digit, idx) => (
              <TextInput
                key={idx}
                ref={inputRefs[idx]}
                style={[
                  styles.digitInput,
                  isDark && { backgroundColor: currentColors.inputBackground, borderColor: currentColors.border, color: currentColors.primaryText },
                  Boolean(digit) && (isDark ? { borderColor: '#0066FF', backgroundColor: '#1A2332' } : styles.digitInputFilled)
                ]}
                placeholderTextColor={currentColors.placeholder}
                keyboardType="number-pad"
                maxLength={1}
                value={digit}
                onChangeText={(val) => handleDigitChange(val, idx)}
                onKeyPress={(e) => handleKeyPress(e, idx)}
                textAlign="center"
              />
            ))}
          </View>

          {errorMsg && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
            </View>
          )}

          {/* Submit Button */}
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleVerify}
            disabled={isVerifying || digits.join('').length < 4}
          >
            {isVerifying ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitBtnText}>Verify & Take Over Order</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    elevation: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  subTitle: {
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
  origRiderCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  origRiderLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#3B82F6',
    letterSpacing: 0.5,
  },
  origRiderName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E3A8A',
    marginTop: 2,
  },
  handoverAddr: {
    fontSize: 12,
    color: '#475569',
    marginTop: 4,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0066FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
  },
  callBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  promptText: {
    fontSize: 13.5,
    color: '#334155',
    marginBottom: 14,
    lineHeight: 19,
    textAlign: 'center',
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16,
  },
  digitInput: {
    width: 56,
    height: 64,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    fontSize: 28,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  digitInputFilled: {
    borderColor: '#0066FF',
    backgroundColor: '#EFF6FF',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 12.5,
    color: '#DC2626',
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

export default HandoverOtpVerifyModal;
