import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions, Image, Alert } from 'react-native';
import RazorpayCheckout from 'react-native-razorpay';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/PngIcon';
import { useTheme } from '../context/ThemeContext';
import { colors, typography, spacing, radius, shadows } from '../theme/colors';
import api from '../services/api';

const { width } = Dimensions.get('window');

const PremiumUpgradeScreen = ({ navigation }: any) => {
  const { isDark, currentColors } = useTheme();

  const handleSubscribe = async () => {
    try {
      const res = await api.post('/payments/create-order', { amount: 600 });
      if (!res.data.success) {
        Alert.alert('Error', 'Failed to initialize payment order on server.');
        return;
      }

      const options = {
        description: 'Premium Upgrade',
        image: 'https://cdn.razorpay.com/logos/HhKz37WpYqB2N8_medium.png',
        currency: res.data.order.currency,
        key: 'rzp_live_TmSPcojj3JfRzH', // Used actual Razorpay Live Key from backend
        amount: res.data.order.amount,
        name: 'Dating App Premium',
        order_id: res.data.order.id, // Required by Razorpay
        prefill: {
          email: 'user@example.com',
          contact: '9999999999',
          name: 'User'
        },
        theme: { color: colors.primary }
      };
      
      RazorpayCheckout.open(options).then(async (data: any) => {
        try {
          const verifyRes = await api.post('/payments/verify-payment', {
            razorpay_order_id: data.razorpay_order_id,
            razorpay_payment_id: data.razorpay_payment_id,
            razorpay_signature: data.razorpay_signature,
            amount: 600
          });
          
          if (verifyRes.data.success) {
            Alert.alert('Success', 'Welcome to Premium! Payment successful.');
          } else {
            Alert.alert('Payment Error', 'Payment verification failed.');
          }
        } catch (e) {
          Alert.alert('Error', 'Payment succeeded but server verification failed.');
        }
      }).catch((error: any) => {
        Alert.alert('Payment Error', `Could not complete payment. Error: ${error.code || error.description}`);
      });
    } catch (error) {
      Alert.alert('Error', 'Server error while creating order.');
    }
  };

  const benefits = [
    { icon: 'eye', title: 'See Who Likes You', desc: 'Match instantly with people who already like you.' },
    { icon: 'star', title: '5 Super Likes a Day', desc: 'Stand out from the crowd and triple your match rate.' },
    { icon: 'arrow-undo', title: 'Unlimited Rewinds', desc: 'Accidentally swiped left? Go back and change it.' },
    { icon: 'airplane', title: 'Passport Mode', desc: 'Change your location and match anywhere in the world.' }
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: currentColors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Image source={require('../assets/generated_icons/back_arrow_icon.jpg')} style={{width: 24, height: 24}} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: currentColors.text }]}>Premium</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        <View style={styles.heroSection}>
          <View style={[styles.iconCircle, { backgroundColor: '#FEF3C7' }]}>
            <Image source={require('../assets/generated_icons/premium_icon.jpg')} style={{width: 40, height: 40}} />
          </View>
          <Text style={[styles.title, { color: currentColors.text }]}>Upgrade to Premium</Text>
          <Text style={[styles.subtitle, { color: currentColors.textMuted }]}>Unlock all features and get more matches.</Text>
        </View>

        <View style={[styles.card, { backgroundColor: currentColors.surface, ...(isDark ? {} : shadows.sm) }]}>
          {benefits.map((item, index) => (
            <View key={index} style={[styles.benefitRow, index === benefits.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={[styles.benefitIcon, { backgroundColor: isDark ? currentColors.border : currentColors.grayBg }]}>
                <Image source={require('../assets/generated_icons/premium_icon.jpg')} style={{width: 20, height: 20}} />
              </View>
              <View style={styles.benefitTextCol}>
                <Text style={[styles.benefitTitle, { color: currentColors.text }]}>{item.title}</Text>
                <Text style={[styles.benefitDesc, { color: currentColors.textMuted }]}>{item.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.pricingSection}>
          <TouchableOpacity style={[styles.pricingCard, { borderColor: colors.primary, borderWidth: 2, backgroundColor: currentColors.surface }]}>
            <View style={[styles.popularBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.popularText}>Most Popular</Text>
            </View>
            <Text style={[styles.months, { color: currentColors.text }]}>6 Months</Text>
            <Text style={[styles.price, { color: currentColors.text }]}>₹600<Text style={styles.perMonth}>/mo</Text></Text>
            <Text style={[styles.savings, { color: colors.success }]}>Save 40%</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[styles.subscribeBtn, { backgroundColor: colors.primary }]} onPress={handleSubscribe}>
          <Text style={styles.subscribeText}>Subscribe Now</Text>
        </TouchableOpacity>
        
        <Text style={[styles.termsText, { color: currentColors.placeholder }]}>
          By subscribing, you agree to our Terms of Service and Privacy Policy. Subscription automatically renews unless canceled.
        </Text>

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
  heroSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.sizes.md,
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150,150,150,0.2)',
  },
  benefitIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  benefitTextCol: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: typography.sizes.md,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  benefitDesc: {
    fontSize: typography.sizes.sm,
    lineHeight: 18,
  },
  pricingSection: {
    marginBottom: spacing.xl,
  },
  pricingCard: {
    padding: spacing.xl,
    borderRadius: radius.lg,
    alignItems: 'center',
    position: 'relative',
  },
  popularBadge: {
    position: 'absolute',
    top: -12,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  popularText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  months: {
    fontSize: typography.sizes.lg,
    fontWeight: 'bold',
    marginBottom: spacing.sm,
  },
  price: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: spacing.xs,
  },
  perMonth: {
    fontSize: typography.sizes.sm,
    fontWeight: 'normal',
  },
  savings: {
    fontSize: typography.sizes.sm,
    fontWeight: 'bold',
  },
  subscribeBtn: {
    width: '100%',
    padding: 18,
    borderRadius: radius.full,
    alignItems: 'center',
    marginBottom: spacing.md,
    ...shadows.md,
  },
  subscribeText: {
    color: '#FFF',
    fontSize: typography.sizes.lg,
    fontWeight: 'bold',
  },
  termsText: {
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: spacing.lg,
  },
});

export default PremiumUpgradeScreen;
