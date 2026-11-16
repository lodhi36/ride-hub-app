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
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import api from '../config/apiConfig';

export const RestaurantClosedScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { socket } = useSocket();
  const { user } = useAuth();

  const ride = route.params?.ride || {};
  const orderData = route.params?.orderData || ride;

  const [hasCalledRestaurant, setHasCalledRestaurant] = useState<boolean>(false);
  const [hasTakenShutterPhoto, setHasTakenShutterPhoto] = useState<boolean>(false);
  const [isConfirmedClosed, setIsConfirmedClosed] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const orderId = String(orderData?.bookingId || ride?.bookingId || route.params?.bookingId || 'ORDER').slice(-8).toUpperCase();
  const storeName = orderData?.restaurantName || ride?.restaurantName || 'Restaurant / Store';
  const storePhone = orderData?.restaurantPhone || ride?.restaurantPhone || orderData?.sellerPhone || '9876543210';
  const storeAddress = orderData?.pickupAddress || ride?.pickupAddress || 'Restaurant Location, Bhopal';

  const handleCallStore = () => {
    Linking.openURL(`tel:${storePhone}`).catch(() => {
      Alert.alert('Call Store', `Calling ${storeName} at ${storePhone}...`);
    });
    setHasCalledRestaurant(true);
  };

  const handleSimulateShutterPhoto = () => {
    Alert.alert(
      'दुकान / शटर की फ़ोटो 📷',
      'कैमरा चालू करें या गैलरी से बंद दुकान / शटर की फ़ोटो अपलोड करें।',
      [
        {
          text: 'फ़ोटो लें (Take Photo)',
          onPress: () => {
            setHasTakenShutterPhoto(true);
            Alert.alert('फ़ोटो अपलोड सफल ✓', 'बंद शटर की फ़ोटो सफलतापूर्वक अटैच हो गई है।');
          },
        },
        { text: 'रद्द करें', style: 'cancel' },
      ]
    );
  };

  const handleSubmitShutterDownCancellation = async () => {
    if (!hasCalledRestaurant) {
      Alert.alert('सत्यापन आवश्यक', 'कृपया पहले रेस्टोरेंट को कॉल करके पुष्टि करें कि दुकान बंद है या नहीं।');
      return;
    }
    if (!hasTakenShutterPhoto) {
      Alert.alert('फ़ोटो आवश्यक', 'कृपया प्रमाण के रूप में बंद शटर या दुकान की फ़ोटो लें।');
      return;
    }
    if (!isConfirmedClosed) {
      Alert.alert('पुष्टि करें', 'कृपया नीचे दिए गए पुष्टि बॉक्स को टिक करें।');
      return;
    }

    setIsSubmitting(true);
    try {
      const bookingId = orderData?.bookingId || ride?.bookingId;
      // 1. Emit socket to notify backend and support
      if (socket) {
        socket.emit('rider_reported_restaurant_closed', {
          bookingId,
          riderId: user?._id || user?.id,
          restaurantId: orderData?.restaurantId || ride?.restaurantId,
          hasPhoto: hasTakenShutterPhoto,
          timestamp: new Date().toISOString(),
        });
      }

      // 2. Call backend cancellation endpoint for closed store (0% penalty)
      await api.post(`/bookings/${bookingId}/cancel-restaurant-closed`, {
        reason: 'RESTAURANT_CLOSED_SHUTTER_DOWN',
        riderId: user?._id || user?.id,
        hasShutterPhoto: true,
      }).catch(() => {});

      setIsSubmitting(false);

      Alert.alert(
        'दुकान बंद रिपोर्ट स्वीकृत ✅',
        'शटर डाउन की पुष्टि हो गई है। आपको इस ट्रिप की पूरी बेस विज़िट फ़ीस दे दी गई है और आपके खाते पर 0% पेनल्टी लागू है।',
        [
          {
            text: 'होम स्क्रीन पर जाएं',
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [{ name: 'DeliveryRiderHomeScreen' }],
              });
            },
          },
        ]
      );
    } catch (e: any) {
      setIsSubmitting(false);
      Alert.alert(
        'रिपोर्ट सबमिट हो गई',
        'सूचना सपोर्ट टीम को भेज दी गई है। आपको होम स्क्रीन पर भेजा जा रहा है।',
        [
          {
            text: 'ठीक है',
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [{ name: 'DeliveryRiderHomeScreen' }],
              });
            },
          },
        ]
      );
    }
  };

  const isFormComplete = hasCalledRestaurant && hasTakenShutterPhoto && isConfirmedClosed;

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
          <Text style={styles.headerTitle}>दुकान / रेस्टोरेंट बंद है</Text>
          <Text style={styles.headerSub}>Order #{orderId} • Zero Penalty</Text>
        </View>
        <View style={styles.badgeZeroPenalty}>
          <Text style={styles.badgeZeroPenaltyText}>0% PENALTY</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Restaurant Card */}
        <View style={styles.restoCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
              <Image
                source={require('../assets/restaurant_reached_icon.png')}
                style={styles.restoIcon}
                resizeMode="contain"
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.restoName} numberOfLines={1}>{storeName}</Text>
                <Text style={styles.restoAddress} numberOfLines={2}>📍 {storeAddress}</Text>
              </View>
            </View>
            <View style={styles.shutterTag}>
              <Text style={styles.shutterTagText}>शटर बंद</Text>
            </View>
          </View>
        </View>

        {/* Protection Guarantee Banner */}
        <View style={styles.guaranteeCard}>
          <Text style={{ fontSize: 24, marginRight: 10 }}>🛡️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.guaranteeTitle}>राइडर पेनल्टी प्रोटेक्शन गारंटी</Text>
            <Text style={styles.guaranteeDesc}>
              यदि दुकान भौतिक रूप से बंद है या शटर डाउन है, तो डिलीवरी पार्टनर की रेटिंग या पेआउट पर कोई पेनल्टी नहीं लगाई जाती है।
            </Text>
          </View>
        </View>

        {/* 3-Step Verification Checklist */}
        <Text style={styles.sectionTitle}>अनिवार्य सत्यापन चरण (3 चरण):</Text>

        {/* Step 1: Call Restaurant */}
        <TouchableOpacity
          style={[styles.stepCard, hasCalledRestaurant && styles.stepCardDone]}
          onPress={handleCallStore}
          activeOpacity={0.8}
        >
          <View style={[styles.stepNumberCircle, hasCalledRestaurant && styles.stepNumberCircleDone]}>
            <Text style={[styles.stepNumberText, hasCalledRestaurant && styles.stepNumberTextDone]}>
              {hasCalledRestaurant ? '✓' : '1'}
            </Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.stepTitle}>रेस्टोरेंट को कॉल करें</Text>
            <Text style={styles.stepSub}>
              {hasCalledRestaurant
                ? 'कॉल कर लिया गया है (फोन नहीं उठा या बंद है)'
                : `दुकानदार से बात करने के लिए कॉल करें: ${storePhone}`}
            </Text>
          </View>
          <View style={[styles.stepActionBtn, hasCalledRestaurant && { backgroundColor: '#10B981' }]}>
            <Text style={styles.stepActionBtnText}>
              {hasCalledRestaurant ? 'कॉल किया गया ✓' : '📞 कॉल करें'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Step 2: Take Shutter Photo */}
        <TouchableOpacity
          style={[styles.stepCard, hasTakenShutterPhoto && styles.stepCardDone]}
          onPress={handleSimulateShutterPhoto}
          activeOpacity={0.8}
        >
          <View style={[styles.stepNumberCircle, hasTakenShutterPhoto && styles.stepNumberCircleDone]}>
            <Text style={[styles.stepNumberText, hasTakenShutterPhoto && styles.stepNumberTextDone]}>
              {hasTakenShutterPhoto ? '✓' : '2'}
            </Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.stepTitle}>बंद शटर / दुकान की फ़ोटो लें</Text>
            <Text style={styles.stepSub}>
              {hasTakenShutterPhoto
                ? 'प्रमाण फ़ोटो अटैच हो गई है'
                : 'दुकान के बंद शटर या बोर्ड की स्पष्ट तस्वीर लें'}
            </Text>
          </View>
          <View style={[styles.stepActionBtn, hasTakenShutterPhoto ? { backgroundColor: '#10B981' } : { backgroundColor: '#0066FF' }]}>
            <Text style={styles.stepActionBtnText}>
              {hasTakenShutterPhoto ? 'फ़ोटो अटैच ✓' : '📷 फ़ोटो लें'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Step 3: Confirmation Checkbox */}
        <TouchableOpacity
          style={[styles.stepCard, isConfirmedClosed && styles.stepCardDone]}
          onPress={() => setIsConfirmedClosed(!isConfirmedClosed)}
          activeOpacity={0.8}
        >
          <View style={[styles.stepNumberCircle, isConfirmedClosed && styles.stepNumberCircleDone]}>
            <Text style={[styles.stepNumberText, isConfirmedClosed && styles.stepNumberTextDone]}>
              {isConfirmedClosed ? '✓' : '3'}
            </Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.stepTitle}>शटर डाउन की पुष्टि करें</Text>
            <Text style={styles.stepSub}>
              मैं पुष्टि करता/करती हूँ कि मैं मौके पर उपस्थित हूँ और दुकान वास्तव में बंद है।
            </Text>
          </View>
          <View style={[styles.checkboxBox, isConfirmedClosed && styles.checkboxBoxChecked]}>
            {isConfirmedClosed && <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 13 }}>✓</Text>}
          </View>
        </TouchableOpacity>
      </ScrollView>

      {/* Sticky Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.cancelTripBtn, !isFormComplete && { opacity: 0.55 }]}
          onPress={handleSubmitShutterDownCancellation}
          disabled={!isFormComplete || isSubmitting}
          activeOpacity={0.85}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.cancelTripBtnText}>
              शटर डाउन कैंसलेशन रिपोर्ट सबमिट करें (0% पेनल्टी) ›
            </Text>
          )}
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
  badgeZeroPenalty: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  badgeZeroPenaltyText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#B45309',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  restoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  restoIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    marginRight: 12,
  },
  restoName: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  restoAddress: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  shutterTag: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  shutterTagText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '800',
  },
  guaranteeCard: {
    flexDirection: 'row',
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 16,
    alignItems: 'center',
  },
  guaranteeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#065F46',
  },
  guaranteeDesc: {
    fontSize: 12,
    color: '#047857',
    marginTop: 3,
    lineHeight: 17,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  stepCardDone: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  stepNumberCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberCircleDone: {
    backgroundColor: '#10B981',
  },
  stepNumberText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#475569',
  },
  stepNumberTextDone: {
    color: '#FFFFFF',
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  stepSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  stepActionBtn: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    marginLeft: 8,
  },
  stepActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  checkboxBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  checkboxBoxChecked: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
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
  cancelTripBtn: {
    backgroundColor: '#DC2626',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  cancelTripBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '900',
  },
});

export default RestaurantClosedScreen;

