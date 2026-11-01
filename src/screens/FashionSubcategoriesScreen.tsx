import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Image,
  Dimensions,
  TextInput,
  StatusBar,
  ActivityIndicator,
  Platform,
} from 'react-native';
import Icon from '../components/PngIcon';
import api, { UPLOADS_URL } from '../services/api';
import { CartService } from '../services/CartService';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// 4-column compact round icon layout: (width - padding - gaps) / 4
const CARD_WIDTH = Math.floor((SCREEN_WIDTH - 32 - 36) / 4);

// In-memory cache to prevent subcategories reload / flickering
const _fashionSubcategoriesCache: Record<string, any[]> = {};

const resolveFullUrl = (u?: string) => {
  if (!u || !u.trim()) return '';
  if (u.startsWith('http') || u.startsWith('data:')) return u;
  const clean = u.replace(/^\/?(api\/)?(uploads\/)?/, '');
  return `${UPLOADS_URL}/${clean}`;
};

export default function FashionSubcategoriesScreen({ navigation, route }: any) {
  const demographic = route?.params?.demographic || 'Male';
  const screenTitle = route?.params?.title || `${demographic} Fashion`;
  const customerCoords = route?.params?.customerCoords;
  const { isDark, currentColors } = useTheme('customer');

  const [subcategories, setSubcategories] = useState<any[]>(() => _fashionSubcategoriesCache[demographic] || []);
  const [loading, setLoading] = useState<boolean>(!_fashionSubcategoriesCache[demographic]);
  const [searchQuery, setSearchQuery] = useState('');
  const [cartCount, setCartCount] = useState<number>(() => CartService.getCartCount());

  // Socket instance for real-time admin sync
  const { socket } = useSocket();

  // Cart sync
  useEffect(() => {
    const unsub = CartService.subscribe((state) => {
      setCartCount(state.count || 0);
    });
    return unsub;
  }, []);

  // Fetch subcategories for the selected demographic dynamically from backend
  const fetchSubcategories = useCallback(async () => {
    try {
      if (!_fashionSubcategoriesCache[demographic]) {
        setLoading(true);
      }
      const res = await api.get(`/categories/fashion?demographic=${encodeURIComponent(demographic)}`).catch(() => null);
      if (res?.data?.success && Array.isArray(res.data.subcategories)) {
        // Filter out inactive subcategories; strictly real data created by Admin
        const activeSubs = res.data.subcategories.filter((s: any) => s.isActive !== false && s.name && s.name.trim().length > 0);
        _fashionSubcategoriesCache[demographic] = activeSubs;
        setSubcategories(activeSubs);
      } else if (!_fashionSubcategoriesCache[demographic]) {
        setSubcategories([]);
      }
    } catch (e) {
      if (!_fashionSubcategoriesCache[demographic]) {
        setSubcategories([]);
      }
    } finally {
      setLoading(false);
    }
  }, [demographic]);

  useEffect(() => {
    fetchSubcategories();
  }, [fetchSubcategories]);

  // Real-time synchronization when Admin updates/deletes subcategories
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => {
      fetchSubcategories();
    };
    socket.on('fashion_subcategories_updated', handleUpdate);
    socket.on('subcategories_updated', handleUpdate);
    socket.on('category_updated', handleUpdate);

    return () => {
      socket.off('fashion_subcategories_updated', handleUpdate);
      socket.off('subcategories_updated', handleUpdate);
      socket.off('category_updated', handleUpdate);
    };
  }, [socket, fetchSubcategories]);

  // Filter subcategories by search query
  const filteredSubcategories = useMemo(() => {
    if (!searchQuery.trim()) return subcategories;
    const q = searchQuery.toLowerCase().trim();
    return subcategories.filter((s) => (s.name || '').toLowerCase().includes(q));
  }, [subcategories, searchQuery]);

  const handleSubcategoryPress = (subcat: any) => {
    navigation.navigate('ProductListingScreen', {
      category: 'Fashion',
      demographic,
      subcategory: subcat.name,
      subcategoryId: subcat._id || subcat.id,
      title: `${demographic} ${subcat.name}`,
      customerCoords,
    });
  };

  return (
    <SafeAreaView style={[styles.safeArea, isDark && { backgroundColor: '#0B0F19' }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? '#0F172A' : '#FFFFFF'} />

      {/* 1. TOP HEADER BAR */}
      <View style={[styles.headerBar, isDark && { backgroundColor: '#0F172A', borderBottomColor: '#1E293B' }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={[styles.backButton, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}
            activeOpacity={0.7}
            onPress={() => navigation.goBack()}
          >
            <Text style={[styles.backGlyph, isDark && { color: '#F8FAFC' }]}>‹</Text>
          </TouchableOpacity>
          <View style={{ marginLeft: 8 }}>
            <Text style={[styles.headerTitle, isDark && { color: '#F8FAFC' }]}>{screenTitle}</Text>
            <Text style={[styles.headerSub, isDark && { color: '#94A3B8' }]}>{subcategories.length} subcategories available</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.cartIconBtn, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('CartScreen', { customerCoords })}
        >
          <Icon name="cart-outline" size={22} color={isDark ? '#F8FAFC' : '#0F172A'} />
          {cartCount > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cartCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* 2. SEARCH BAR */}
      <View style={styles.searchBarWrap}>
        <View style={[styles.searchContainer, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}>
          <Icon name="search" size={16} color="#64748B" style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, isDark && { color: '#F8FAFC' }]}
            placeholder={`Search in ${screenTitle}...`}
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.clearSearchGlyph}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 3. SUBCATEGORIES GRID (Compact Circular Rounded Icons with Small Size) */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 24, paddingTop: 6 }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0066FF" />
            <Text style={styles.loadingText}>Loading subcategories...</Text>
          </View>
        ) : filteredSubcategories.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Text style={{ fontSize: 36 }}>
                {demographic === 'Male' ? '👔' : demographic === 'Female' ? '👗' : '🧒'}
              </Text>
            </View>
            <Text style={styles.emptyTitle}>
              {searchQuery ? 'No Subcategories Matched' : `No Subcategories in ${demographic}`}
            </Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? `No subcategories matched "${searchQuery}". Try clearing search.`
                : `Admin has not added subcategories for ${demographic} Fashion yet. Please check back soon.`}
            </Text>
            <TouchableOpacity
              style={styles.emptyActionBtn}
              activeOpacity={0.8}
              onPress={() => (searchQuery ? setSearchQuery('') : navigation.goBack())}
            >
              <Text style={styles.emptyActionBtnText}>
                {searchQuery ? 'Clear Search' : '‹ Choose Another Category'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.gridContainer}>
            {filteredSubcategories.map((subcat: any, idx: number) => {
              const imgUrl = subcat.image ? resolveFullUrl(subcat.image) : null;
              return (
                <TouchableOpacity
                  key={subcat._id || subcat.id || `sub_${idx}`}
                  style={styles.subcatCard}
                  activeOpacity={0.8}
                  onPress={() => handleSubcategoryPress(subcat)}
                >
                  <View style={styles.circleIconWrap}>
                    {imgUrl ? (
                      <Image source={{ uri: imgUrl }} style={styles.circleImage} resizeMode="cover" />
                    ) : (
                      <View style={styles.circlePlaceholder}>
                        <Text style={{ fontSize: 26 }}>
                          {demographic === 'Male' ? '👔' : demographic === 'Female' ? '👗' : '🧒'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.subcatTitle, isDark && { color: '#E2E8F0' }]} numberOfLines={2}>
                    {subcat.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* 4. AUTO-ADJUSTED BOTTOM NAVIGATION BAR */}
      <View style={[styles.bottomNavContainer, isDark && { backgroundColor: '#0F172A', borderTopColor: '#1E293B' }]}>
        <TouchableOpacity style={styles.navTab} activeOpacity={0.7} onPress={() => navigation.navigate('CustomerHomeScreen')}>
          <Text style={[styles.navTabIcon, { color: '#0066FF' }]}>🏠</Text>
          <Text style={[styles.navTabLabel, { color: '#0066FF', fontWeight: 'bold' }]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navTab} activeOpacity={0.7} onPress={() => navigation.navigate('CartScreen', { customerCoords })}>
          <View style={{ position: 'relative', width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={styles.navTabIcon}>🛒</Text>
            {cartCount > 0 && (
              <View style={styles.tabCartBadge}>
                <Text style={styles.tabCartBadgeText}>{cartCount}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.navTabLabel, cartCount > 0 && { color: '#0066FF', fontWeight: 'bold' }]}>Cart</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navTab}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('MyBookingsScreen', { role: 'customer', title: 'My Orders' })}
        >
          <Text style={styles.navTabIcon}>📑</Text>
          <Text style={styles.navTabLabel}>Orders</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navTab} activeOpacity={0.7} onPress={() => navigation.navigate('CustomerProfileScreen')}>
          <Text style={styles.navTabIcon}>👤</Text>
          <Text style={styles.navTabLabel}>Profile</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: {
    fontSize: 26,
    fontWeight: '300',
    color: '#0F172A',
    lineHeight: 28,
    marginTop: -2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  cartIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cartBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#0066FF',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  cartBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  searchBarWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: 0,
  },
  clearSearchGlyph: {
    fontSize: 14,
    color: '#94A3B8',
    padding: 4,
  },
  loadingContainer: {
    paddingTop: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 14,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  emptyContainer: {
    paddingTop: 70,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  emptyActionBtn: {
    marginTop: 20,
    backgroundColor: '#0066FF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyActionBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  // Compact 4-column rounded circle grid
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 12,
    justifyContent: 'flex-start',
  },
  subcatCard: {
    width: CARD_WIDTH,
    alignItems: 'center',
    marginBottom: 14,
  },
  // Gol round circle wrapper
  circleIconWrap: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  circleImage: {
    width: '100%',
    height: '100%',
  },
  circlePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
  },
  subcatTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 15,
  },
  bottomNavContainer: {
    height: 58,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingBottom: Platform.OS === 'android' ? 4 : 8,
  },
  navTab: {
    alignItems: 'center',
    flex: 1,
  },
  navTabIcon: {
    fontSize: 20,
    color: '#64748B',
  },
  navTabLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  tabCartBadge: {
    position: 'absolute',
    top: -2,
    right: -6,
    backgroundColor: '#EF4444',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  tabCartBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
