import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Alert,
  ScrollView,
  Share,
  Dimensions,
} from 'react-native';

const { width } = Dimensions.get('window');

interface EmergencySosModalProps {
  visible: boolean;
  onClose: () => void;
  currentAddress?: string;
  coords?: { latitude: number; longitude: number } | null;
  emergencyContact?: string;
}

const EmergencySosModal: React.FC<EmergencySosModalProps> = ({
  visible,
  onClose,
  currentAddress = 'Detecting current location...',
  coords,
  emergencyContact = '9039978452',
}) => {
  const handleCall = (phoneNumber: string, title: string) => {
    Alert.alert(
      `Call ${title}?`,
      `Kya aap ${title} (${phoneNumber}) ko call lagana chahte hain?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Call Now',
          style: 'destructive',
          onPress: () => {
            Linking.openURL(`tel:${phoneNumber}`).catch(() => {
              Alert.alert('Error', `Could not open dialer for ${phoneNumber}`);
            });
          },
        },
      ]
    );
  };

  const handleShareLocation = async () => {
    try {
      const locStr = coords
        ? `https://maps.google.com/?q=${coords.latitude},${coords.longitude}`
        : currentAddress;
      await Share.share({
        message: `🚨 EMERGENCY SOS! I need immediate help. My current location is: ${currentAddress} (${locStr})`,
        title: 'Emergency SOS Alert',
      });
    } catch (e) {
      console.log('Share error:', e);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.modalBox}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.sirenWrap}>
                <Text style={{ fontSize: 22 }}>🚨</Text>
              </View>
              <View>
                <Text style={styles.headerTitle}>Emergency & Safety SOS</Text>
                <Text style={styles.headerSub}>आपातकालीन सहायता एवं सुरक्षा</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* Live Location Box */}
            <View style={styles.locationBox}>
              <View style={styles.locHeaderRow}>
                <Text style={styles.locPin}>📍</Text>
                <Text style={styles.locTitle}>Your Current GPS Location:</Text>
              </View>
              <Text style={styles.locAddress} numberOfLines={2}>
                {currentAddress}
              </Text>
              {coords && (
                <Text style={styles.locCoords}>
                  GPS: {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
                </Text>
              )}
            </View>

            {/* Emergency Action Buttons */}
            <Text style={styles.sectionHeading}>Tap below for immediate help:</Text>

            {/* 1. Call Ambulance */}
            <TouchableOpacity
              style={[styles.actionCard, { borderColor: '#EF4444', backgroundColor: '#FEF2F2' }]}
              activeOpacity={0.8}
              onPress={() => handleCall('108', 'Ambulance (एम्बुलेंस - 108)')}
            >
              <View style={[styles.iconCircle, { backgroundColor: '#FEE2E2' }]}>
                <Text style={{ fontSize: 24 }}>🚑</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.actionTitle, { color: '#B91C1C' }]}>Call Ambulance (एम्बुलेंस)</Text>
                <Text style={styles.actionSub}>Dial 108 • National Medical Emergency Service</Text>
              </View>
              <View style={[styles.callPill, { backgroundColor: '#DC2626' }]}>
                <Text style={styles.callPillText}>Call 108</Text>
              </View>
            </TouchableOpacity>

            {/* 2. Call Police */}
            <TouchableOpacity
              style={[styles.actionCard, { borderColor: '#3B82F6', backgroundColor: '#EFF6FF' }]}
              activeOpacity={0.8}
              onPress={() => handleCall('112', 'Police Helpline (पुलिस - 112)')}
            >
              <View style={[styles.iconCircle, { backgroundColor: '#DBEAFE' }]}>
                <Text style={{ fontSize: 24 }}>👮</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.actionTitle, { color: '#1D4ED8' }]}>Call Police (पुलिस सहायता)</Text>
                <Text style={styles.actionSub}>Dial 112 / 100 • Police & All-in-one Emergency</Text>
              </View>
              <View style={[styles.callPill, { backgroundColor: '#2563EB' }]}>
                <Text style={styles.callPillText}>Call 112</Text>
              </View>
            </TouchableOpacity>

            {/* 3. Accident Help / Roadside */}
            <TouchableOpacity
              style={[styles.actionCard, { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' }]}
              activeOpacity={0.8}
              onPress={() => handleCall('1073', 'Accident Relief (दुर्घटना सहायता - 1073)')}
            >
              <View style={[styles.iconCircle, { backgroundColor: '#FEF3C7' }]}>
                <Text style={{ fontSize: 24 }}>🆘</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.actionTitle, { color: '#B45309' }]}>Accident Help (दुर्घटना सहायता)</Text>
                <Text style={styles.actionSub}>Dial 1073 • National Highway & Roadside Help</Text>
              </View>
              <View style={[styles.callPill, { backgroundColor: '#D97706' }]}>
                <Text style={styles.callPillText}>Call 1073</Text>
              </View>
            </TouchableOpacity>

            {/* 4. Safety Response Helpline */}
            <TouchableOpacity
              style={[styles.actionCard, { borderColor: '#10B981', backgroundColor: '#ECFDF5' }]}
              activeOpacity={0.8}
              onPress={() => handleCall(emergencyContact, 'Safety Helpline')}
            >
              <View style={[styles.iconCircle, { backgroundColor: '#D1FAE5' }]}>
                <Text style={{ fontSize: 24 }}>🛡️</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.actionTitle, { color: '#047857' }]}>Emergency Contact / Safety Team</Text>
                <Text style={styles.actionSub}>Direct Support • {emergencyContact}</Text>
              </View>
              <View style={[styles.callPill, { backgroundColor: '#059669' }]}>
                <Text style={styles.callPillText}>Call</Text>
              </View>
            </TouchableOpacity>

            {/* 5. Share Location via WhatsApp / SMS */}
            <TouchableOpacity
              style={styles.shareBtn}
              activeOpacity={0.8}
              onPress={handleShareLocation}
            >
              <Text style={{ fontSize: 18, marginRight: 8 }}>📲</Text>
              <Text style={styles.shareBtnText}>Share SOS & Live Location</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export default EmergencySosModal;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FEF2F2',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sirenWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#991B1B',
  },
  headerSub: {
    fontSize: 12,
    color: '#B91C1C',
    marginTop: 2,
    fontWeight: '500',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#475569',
  },
  scrollContent: {
    padding: 16,
  },
  locationBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  locHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  locPin: {
    fontSize: 14,
    marginRight: 4,
  },
  locTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  locAddress: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    lineHeight: 18,
  },
  locCoords: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '500',
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 12,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  actionSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  callPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  callPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 6,
  },
  shareBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
