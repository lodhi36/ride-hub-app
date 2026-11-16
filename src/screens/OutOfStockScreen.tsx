import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  Linking,
  StatusBar,
  SafeAreaView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { resolveUploadUrl } from '../config/apiConfig';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';

export const OutOfStockScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { socket } = useSocket();
  const { user } = useAuth();

  const ride = route.params?.ride || {};
  const orderData = route.params?.orderData || ride;
  const items = route.params?.items || orderData?.items || orderData?.cartItems || [];

  const [selectedItems, setSelectedItems] = useState<{ [key: string]: boolean }>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const orderId = String(orderData?.bookingId || ride?.bookingId || route.params?.bookingId || 'ORDER').slice(-8).toUpperCase();
  const customerPhone = orderData?.customerPhone || ride?.customerPhone || orderData?.userPhone;
  const customerName = orderData?.customerName || ride?.customerName || 'Customer';

  const toggleItem = (key: string) => {
    setSelectedItems((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const selectedCount = Object.values(selectedItems).filter(Boolean).length;

  const handleSubmitReport = () => {
    if (selectedCount === 0) {
      Alert.alert('आइटम चुनें', 'कृपया कम से कम एक आइटम चुनें जो आउट ऑफ स्टॉक है।');
      return;
    }

    setIsSubmitting(true);
    try {
      if (socket) {
        socket.emit('rider_reported_out_of_stock', {
          bookingId: orderData?.bookingId || ride?.bookingId,
          riderId: user?._id || user?.id,
          restaurantId: orderData?.restaurantId || ride?.restaurantId,
          items: selectedItems,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (_) {}

    setIsSubmitting(false);
    Alert.alert(
      'आउट ऑफ स्टॉक रिपोर्ट सबमिट हो गई ✅',
      'सपोर्ट टीम और ग्राहक को तुरंत सूचना भेज दी गई है। सपोर्ट टीम आपसे ऐप चैट या कॉल पर संपर्क करेगी।',
      [
        {
          text: 'सपोर्ट चैट खोलें',
          onPress: () => {
            navigation.goBack();
            navigation.navigate('ContactSupport', {
              bookingId: orderData?.bookingId || ride?.bookingId,
              issue: 'OUT_OF_STOCK',
            });
          },
        },
        {
          text: 'वापस जाएं',
          style: 'cancel',
          onPress: () => navigation.goBack(),
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.headerTitle}>आइटम आउट ऑफ स्टॉक है</Text>
          <Text style={styles.headerSub}>Order #{orderId} • {orderData?.restaurantName || 'Restaurant'}</Text>
        </View>
        <View style={styles.badgeWarning}>
          <Text style={styles.badgeWarningText}>0% पेनल्टी</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Notice Banner */}
        <View style={styles.noticeCard}>
          <Text style={{ fontSize: 22, marginRight: 10 }}>📦</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.noticeTitle}>उपलब्ध न होने वाले आइटम चुनें</Text>
            <Text style={styles.noticeDesc}>
              रेस्टोरेंट में जो सामान उपलब्ध नहीं है, उसे नीचे टिक करें। ग्राहक को रिप्लेसमेंट या रिफंड का विकल्प दिया जाएगा।
            </Text>
          </View>
        </View>

        {/* Item Selection List */}
        <Text style={styles.sectionTitle}>ऑर्डर के आइटम ({items.length}):</Text>

        {Array.isArray(items) && items.length > 0 ? (
          items.map((item: any, idx: number) => {
            const key = String(item.itemId || item.id || idx);
            const isChecked = Boolean(selectedItems[key]);
            const pName = item.name || item.title || item.dishName || 'Food Item';
            const pQty = item.quantity || item.qty || 1;
            const pPrice = item.price || item.unitPrice || 0;

            return (
              <TouchableOpacity
                key={`oos_row_${idx}`}
                style={[styles.itemCard, isChecked && styles.itemCardChecked]}
                onPress={() => toggleItem(key)}
                activeOpacity={0.8}
              >
                <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
                  {isChecked && <Text style={styles.checkboxCheckmark}>✓</Text>}
                </View>

                <Image
                  source={item.image ? { uri: resolveUploadUrl(item.image) } : require('../assets/restaurant_reached_icon.png')}
                  style={styles.itemThumb}
                  resizeMode="contain"
                />

                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.itemName, isChecked && styles.itemNameChecked]}>
                    {pQty} × {pName}
                  </Text>
                  {Boolean(pPrice > 0) && (
                    <Text style={styles.itemPrice}>₹{pPrice}</Text>
                  )}
                  {Boolean(item.variant) && (
                    <Text style={styles.itemVariant}>{item.variant}</Text>
                  )}
                </View>

                <View style={[styles.pill, isChecked ? styles.pillOut : styles.pillAvail]}>
                  <Text style={[styles.pillText, isChecked ? styles.pillTextOut : styles.pillTextAvail]}>
                    {isChecked ? 'आउट ऑफ स्टॉक' : 'उपलब्ध'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={styles.emptyCard}>
            <Text style={{ color: '#64748B' }}>कोई आइटम सूची उपलब्ध नहीं है।</Text>
          </View>
        )}

        {/* Resolution Options */}
        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>तुरंत समाधान विकल्प:</Text>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
            onPress={() => {
              if (customerPhone) {
                Linking.openURL(`tel:${customerPhone}`).catch(() => {
                  Alert.alert('Call Customer', `Calling ${customerName}...`);
                });
              } else {
                Alert.alert('Phone Not Available', 'ग्राहक का फ़ोन नंबर उपलब्ध नहीं है।');
              }
            }}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 18, marginRight: 6 }}>📞</Text>
            <Text style={styles.actionBtnText}>कॉल करें</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#0066FF' }]}
            onPress={() => {
              navigation.navigate('ContactSupport', {
                bookingId: orderData?.bookingId || ride?.bookingId,
                issue: 'OUT_OF_STOCK',
              });
            }}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 18, marginRight: 6 }}>💬</Text>
            <Text style={styles.actionBtnText}>लाइव सपोर्ट चैट</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Sticky Bottom Submit Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.submitBtn, selectedCount === 0 && { opacity: 0.6 }]}
          onPress={handleSubmitReport}
          disabled={isSubmitting || selectedCount === 0}
          activeOpacity={0.85}
        >
          <Text style={styles.submitBtnText}>
            {selectedCount > 0
              ? `${selectedCount} आइटम आउट ऑफ स्टॉक रिपोर्ट सबमिट करें ›`
              : 'आइटम चुनें'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: (StatusBar.currentHeight || 24) + 8,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 26,
    color: '#0F172A',
    fontWeight: '700',
    marginTop: -2,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  badgeWarning: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  badgeWarningText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  noticeCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF7ED',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FFEDD5',
    marginBottom: 16,
    alignItems: 'center',
  },
  noticeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#9A3412',
  },
  noticeDesc: {
    fontSize: 12,
    color: '#7C2D12',
    marginTop: 3,
    lineHeight: 17,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  itemCardChecked: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  checkboxCheckmark: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  itemThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginLeft: 12,
    backgroundColor: '#F1F5F9',
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  itemNameChecked: {
    color: '#B91C1C',
  },
  itemPrice: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 2,
  },
  itemVariant: {
    fontSize: 11,
    color: '#94A3B8',
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pillAvail: {
    backgroundColor: '#F1F5F9',
  },
  pillOut: {
    backgroundColor: '#FEE2E2',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  pillTextAvail: {
    color: '#64748B',
  },
  pillTextOut: {
    color: '#DC2626',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    elevation: 2,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13.5,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  submitBtn: {
    backgroundColor: '#EF4444',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
});

export default OutOfStockScreen;

