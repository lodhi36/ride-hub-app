import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import Icon from './PngIcon';
import api from '../services/api';

interface RazorpayModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (newBalance: number) => void;
}

const RECHARGE_PLANS = [
  { price: 50, coins: 500, label: '₹50' },
  { price: 100, coins: 1000, label: '₹100 (Popular)' },
  { price: 200, coins: 2000, label: '₹200' },
  { price: 500, coins: 5000, label: '₹500 (Best Value)' },
];

const RazorpayModal: React.FC<RazorpayModalProps> = ({ visible, onClose, onSuccess }) => {
  const [selectedPlan, setSelectedPlan] = useState(RECHARGE_PLANS[1]);
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'card' | 'netbanking'>('upi');
  const [loading, setLoading] = useState(false);

  const handleProcessPayment = async () => {
    try {
      setLoading(true);
      // 1. Create Razorpay Order
      const orderRes = await api.post('/payment/create-order', { amount: selectedPlan.price });
      if (!orderRes.data.success) {
        Alert.alert('Payment Failed', 'Payment Failed. Please try again.');
        setLoading(false);
        return;
      }

      const { orderId } = orderRes.data;

      // 2. Simulate Razorpay Payment Verification
      const verifyRes = await api.post('/payment/verify', {
        orderId,
        paymentId: `pay_${Date.now()}`,
        signature: 'valid_signature',
        amount: selectedPlan.price,
      });

      if (verifyRes.data.success) {
        Alert.alert('Payment Successful', 'Payment Successful. Please start your call.');
        onSuccess(verifyRes.data.walletBalance);
        onClose();
      } else {
        Alert.alert('Payment Failed', 'Payment Failed. Please try again.');
      }
    } catch (err: any) {
      console.error('[RazorpayModal] Error:', err);
      Alert.alert('Payment Failed', 'Payment Failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Icon name="card" size={24} color="#0066FF" />
              <Text style={styles.title}>Razorpay Recharge</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Icon name="close" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={styles.sectionLabel}>SELECT RECHARGE PLAN</Text>
            <View style={styles.plansContainer}>
              {RECHARGE_PLANS.map((plan) => (
                <TouchableOpacity
                  key={plan.price}
                  style={[
                    styles.planCard,
                    selectedPlan.price === plan.price && styles.selectedPlanCard
                  ]}
                  onPress={() => setSelectedPlan(plan)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.planPrice}>{plan.label}</Text>
                  <Text style={styles.planCoins}>+{plan.coins} Tokens</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>PAYMENT METHOD</Text>
            
            <TouchableOpacity
              style={[styles.methodCard, paymentMethod === 'upi' && styles.selectedMethod]}
              onPress={() => setPaymentMethod('upi')}
            >
              <Icon name="qr-code-outline" size={20} color={paymentMethod === 'upi' ? '#0066FF' : '#94A3B8'} />
              <Text style={styles.methodText}>UPI (GPay / PhonePe / Paytm / BHIM)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.methodCard, paymentMethod === 'card' && styles.selectedMethod]}
              onPress={() => setPaymentMethod('card')}
            >
              <Icon name="card-outline" size={20} color={paymentMethod === 'card' ? '#0066FF' : '#94A3B8'} />
              <Text style={styles.methodText}>Credit / Debit Card</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.methodCard, paymentMethod === 'netbanking' && styles.selectedMethod]}
              onPress={() => setPaymentMethod('netbanking')}
            >
              <Icon name="business-outline" size={20} color={paymentMethod === 'netbanking' ? '#0066FF' : '#94A3B8'} />
              <Text style={styles.methodText}>Net Banking</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.payBtn}
              onPress={handleProcessPayment}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.payBtnText}>Pay ₹{selectedPlan.price} via Razorpay</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  container: { backgroundColor: '#0F172A', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  title: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginLeft: 8 },
  closeBtn: { padding: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },
  sectionLabel: { color: '#94A3B8', fontSize: 11, fontWeight: 'bold', letterSpacing: 1, marginBottom: 10 },
  plansContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  planCard: { width: '48%', backgroundColor: '#1E293B', padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: '#334155' },
  selectedPlanCard: { borderColor: '#0066FF', backgroundColor: 'rgba(0, 102, 255, 0.15)' },
  planPrice: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  planCoins: { color: '#0066FF', fontSize: 12, marginTop: 4, fontWeight: '600' },
  methodCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', padding: 14, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: '#334155' },
  selectedMethod: { borderColor: '#0066FF', backgroundColor: 'rgba(0, 102, 255, 0.15)' },
  methodText: { color: '#FFF', marginLeft: 12, fontSize: 14, fontWeight: '500' },
  payBtn: { backgroundColor: '#0066FF', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 16 },
  payBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
});

export default RazorpayModal;
