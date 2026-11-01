import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar, Image, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';

const { width } = Dimensions.get('window');

const OffersScreen = ({ navigation }: any) => {
  const { isDark, currentColors } = useTheme('customer');
  const [isLoading, setIsLoading] = useState(true);
  const [offers, setOffers] = useState<any[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchOffers = async () => {
      try {
        setIsLoading(true);
        const res = await api.get('/banner');
        if (isMounted && res.data?.success && Array.isArray(res.data.data)) {
          const bannerOffers = res.data.data
            .filter((b: any) => b.status === 'Active' && (b.title || b.promoCode || b.discount))
            .map((b: any, idx: number) => ({
              id: b._id || `offer-${idx}`,
              title: b.title || b.description || 'Special Discount',
              code: b.promoCode || b.code || `RIDE${idx + 1}0`,
              discount: b.discount || 'Special Offer',
              minBooking: b.minBooking || '₹199',
              validUntil: b.validUntil ? new Date(b.validUntil).toLocaleDateString() : 'Active',
              category: b.category || b.target || 'All Services',
              status: 'Available',
            }));
          setOffers(bannerOffers);
        }
      } catch (err) {
        if (isMounted) setOffers([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchOffers();
    return () => { isMounted = false; };
  }, []);

  const handleCopyCode = (code: string) => {
    setCopiedCode(code);
    setTimeout(() => {
      setCopiedCode(null);
    }, 2000);
  };

  const renderSkeletons = () => {
    return Array.from({ length: 3 }).map((_, i) => (
      <View key={`skel-${i}`} style={styles.offerCardSkel}>
        <View style={styles.skelHeaderRow}>
          <View style={styles.skelBadge} />
          <View style={styles.skelTitle} />
        </View>
        <View style={styles.skelDivider} />
        <View style={styles.skelRow} />
        <View style={styles.skelRowShort} />
      </View>
    ));
  };

  return (
    <SafeAreaView style={[styles.container, isDark && { backgroundColor: currentColors.background }]}>
      <StatusBar hidden={false} barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={isDark ? currentColors.secondaryBackground : "#FFFFFF"} />
      
      {/* Premium Header */}
      <View style={[styles.header, isDark && { backgroundColor: currentColors.surface, borderBottomColor: currentColors.border }]}>
        <View>
          <Text style={[styles.headerTitle, isDark && { color: currentColors.primaryText }]}>Offers & Discounts</Text>
          <Text style={[styles.headerSub, isDark && { color: currentColors.secondaryText }]}>Save more on your home services</Text>
        </View>
        <Image source={{ uri: 'https://img.icons8.com/fluency/96/discount.png' }} style={{ width: 32, height: 32 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {isLoading ? (
          renderSkeletons()
        ) : offers.length === 0 ? (
          <View style={[styles.emptyStateContainer, isDark && { backgroundColor: currentColors.card, borderColor: currentColors.border }]}>
            <Image source={{ uri: 'https://img.icons8.com/fluency/144/gift.png' }} style={styles.emptyStateImage} />
            <Text style={[styles.emptyStateTitle, isDark && { color: currentColors.primaryText }]}>No Offers Available</Text>
            <Text style={[styles.emptyStateSub, isDark && { color: currentColors.secondaryText }]}>New discounts and promo codes will appear here as soon as they are launched.</Text>
            <TouchableOpacity style={styles.browseBtn} onPress={() => navigation.navigate('CustomerHomeScreen')}>
              <Text style={styles.browseBtnText}>Browse Services</Text>
            </TouchableOpacity>
          </View>
        ) : (
          offers.map((offer) => {
            const isExpired = offer.status === 'Expired';
            return (
              <View key={offer.id} style={[
                styles.offerCard,
                isDark && { backgroundColor: currentColors.card, borderColor: currentColors.border },
                isExpired && styles.offerCardExpired
              ]}>
                
                {/* Card Top */}
                <View style={styles.offerCardTop}>
                  <View style={[styles.discountBadge, isDark && { backgroundColor: currentColors.elevatedSurface, borderColor: currentColors.border }]}>
                    <Text style={[styles.discountBadgeText, isDark && { color: '#60A5FA' }]}>{offer.discount}</Text>
                  </View>
                  <Text style={[styles.offerTitle, isDark && { color: currentColors.primaryText }, isExpired && styles.textExpired]}>{offer.title}</Text>
                </View>

                {/* Card Middle (Code) */}
                <View style={[styles.codeRow, isDark && { backgroundColor: currentColors.elevatedSurface, borderColor: currentColors.border }]}>
                  <View style={styles.codeBox}>
                    <Text style={[styles.codeText, isDark && { color: '#60A5FA' }, isExpired && styles.textExpired]}>{offer.code}</Text>
                  </View>
                  {!isExpired && (
                    <TouchableOpacity style={[styles.copyBtn, isDark && { backgroundColor: currentColors.card, borderColor: currentColors.border }]} onPress={() => handleCopyCode(offer.code)}>
                      <Image source={{ uri: copiedCode === offer.code ? 'https://img.icons8.com/fluency/96/checked.png' : 'https://img.icons8.com/fluency/96/copy.png' }} style={{ width: 18, height: 18 }} />
                      <Text style={[styles.copyBtnText, isDark && { color: currentColors.primaryText }, copiedCode === offer.code && { color: '#16A34A' }]}>
                        {copiedCode === offer.code ? 'Copied!' : 'Copy'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Card Bottom (Details & CTA) */}
                <View style={styles.offerDetailsContainer}>
                  <View style={styles.detailCol}>
                    <Text style={[styles.detailLabel, isDark && { color: currentColors.mutedText }]}>Min. Booking</Text>
                    <Text style={[styles.detailValue, isDark && { color: currentColors.primaryText }]}>{offer.minBooking}</Text>
                  </View>
                  <View style={styles.detailCol}>
                    <Text style={[styles.detailLabel, isDark && { color: currentColors.mutedText }]}>Valid Until</Text>
                    <Text style={[styles.detailValue, isDark && { color: currentColors.primaryText }, isExpired && { color: '#EF4444' }]}>{offer.validUntil}</Text>
                  </View>
                  <View style={styles.detailCol}>
                    <Text style={[styles.detailLabel, isDark && { color: currentColors.mutedText }]}>Applies To</Text>
                    <Text style={[styles.detailValue, isDark && { color: currentColors.primaryText }]} numberOfLines={1}>{offer.category}</Text>
                  </View>
                </View>

                {/* Action Button */}
                <TouchableOpacity 
                  style={[styles.applyBtn, isExpired && styles.applyBtnDisabled]} 
                  disabled={isExpired}
                >
                  <Text style={styles.applyBtnText}>{isExpired ? 'Expired' : 'Apply Offer'}</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#0F172A', marginBottom: 2 },
  headerSub: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  
  scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 100 },
  
  /* Offer Card */
  offerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  offerCardExpired: { opacity: 0.65, backgroundColor: '#F8FAFC' },
  offerCardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  discountBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginRight: 12, borderWidth: 1, borderColor: '#BFDBFE' },
  discountBadgeText: { color: '#0066FF', fontWeight: '900', fontSize: 13 },
  offerTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: '#0F172A' },
  textExpired: { color: '#94A3B8' },

  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9', borderStyle: 'dashed', marginBottom: 20 },
  codeBox: { flex: 1 },
  codeText: { fontSize: 18, fontWeight: '900', color: '#1D4ED8', letterSpacing: 1 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  copyBtnText: { marginLeft: 6, fontSize: 12, fontWeight: '700', color: '#475569' },

  offerDetailsContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  detailCol: { flex: 1 },
  detailLabel: { fontSize: 11, color: '#64748B', fontWeight: '500', marginBottom: 4 },
  detailValue: { fontSize: 12, color: '#0F172A', fontWeight: '700' },

  applyBtn: { backgroundColor: '#0066FF', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  applyBtnDisabled: { backgroundColor: '#E2E8F0' },
  applyBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },

  /* Empty State */
  emptyStateContainer: { alignItems: 'center', backgroundColor: '#FFFFFF', padding: 40, borderRadius: 24, borderWidth: 1, borderColor: '#F1F5F9', marginTop: 40 },
  emptyStateImage: { width: 100, height: 100, marginBottom: 20 },
  emptyStateTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: 8 },
  emptyStateSub: { fontSize: 13, color: '#64748B', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  browseBtn: { backgroundColor: '#0F172A', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
  browseBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },

  /* Skeletons */
  offerCardSkel: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#F1F5F9' },
  skelHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  skelBadge: { width: 80, height: 30, backgroundColor: '#E2E8F0', borderRadius: 8, marginRight: 12 },
  skelTitle: { flex: 1, height: 20, backgroundColor: '#E2E8F0', borderRadius: 4 },
  skelDivider: { height: 40, backgroundColor: '#F8FAFC', borderRadius: 12, marginBottom: 20 },
  skelRow: { height: 12, backgroundColor: '#E2E8F0', borderRadius: 4, marginBottom: 12 },
  skelRowShort: { height: 12, backgroundColor: '#E2E8F0', borderRadius: 4, width: '60%' },
});

export default OffersScreen;
