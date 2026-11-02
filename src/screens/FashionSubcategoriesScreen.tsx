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

// In-memory cache to prevent subcategories reload / flickering
const _fashionSubcategoriesCache: Record<string, any[]> = {};
let _cachedFashionItems: any[] = [];

const resolveFullUrl = (u?: string) => {
  if (!u || !u.trim()) return '';
  if (u.startsWith('http') || u.startsWith('data:')) return u;
  const clean = u.replace(/^\/?(api\/)?(uploads\/)?/, '');
  return `${UPLOADS_URL}/${clean}`;
};

export default function FashionSubcategoriesScreen({ navigation, route }: any) {
  const initialDemographic = route?.params?.demographic || 'Male';
  const customerCoords = route?.params?.customerCoords;
  const { isDark, currentColors } = useTheme('customer');

  // Demographic state: 'Male' | 'Female' | 'Kids' | 'All'
  const [currentDemographic, setCurrentDemographic] = useState<string>(initialDemographic);
  const [subcategories, setSubcategories] = useState<any[]>(() => _fashionSubcategoriesCache[initialDemographic] || []);
  const [loading, setLoading] = useState<boolean>(!_fashionSubcategoriesCache[initialDemographic]);
  const [selectedSubcat, setSelectedSubcat] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cartCount, setCartCount] = useState<number>(() => CartService.getCartCount());

  // Real fashion products for selected category/subcategory
  const [products, setProducts] = useState<any[]>(_cachedFashionItems);
  const [loadingProducts, setLoadingProducts] = useState<boolean>(_cachedFashionItems.length === 0);

  // Socket instance for real-time admin sync
  const { socket } = useSocket();

  // Cart synchronization
  useEffect(() => {
    const unsub = CartService.subscribe((state) => {
      setCartCount(state.count || 0);
    });
    return unsub;
  }, []);

  // Fetch subcategories for current demographic
  const fetchSubcategories = useCallback(async (demoToFetch: string) => {
    try {
      if (!_fashionSubcategoriesCache[demoToFetch]) {
        setLoading(true);
      }
      const res = await api.get(`/categories/fashion?demographic=${encodeURIComponent(demoToFetch)}`).catch(() => null);
      if (res?.data?.success && Array.isArray(res.data.subcategories)) {
        const activeSubs = res.data.subcategories.filter((s: any) => s.isActive !== false && s.name && s.name.trim().length > 0);
        _fashionSubcategoriesCache[demoToFetch] = activeSubs;
        setSubcategories(activeSubs);
      } else if (!_fashionSubcategoriesCache[demoToFetch]) {
        setSubcategories([]);
      }
    } catch (e) {
      if (!_fashionSubcategoriesCache[demoToFetch]) {
        setSubcategories([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch products from fashion store
  const fetchProducts = useCallback(async () => {
    try {
      if (_cachedFashionItems.length === 0) setLoadingProducts(true);
      const res = await api.get('/menu/6ac8693de868a5421c3d7f7d?forCustomer=true').catch(() => null);
      if (res?.data?.success && Array.isArray(res.data.items) && res.data.items.length > 0) {
        _cachedFashionItems = res.data.items;
        setProducts(res.data.items);
      } else if (_cachedFashionItems.length === 0) {
        setProducts([]);
      }
    } catch (_) {
      if (_cachedFashionItems.length === 0) setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    fetchSubcategories(currentDemographic);
    fetchProducts();
  }, [currentDemographic, fetchSubcategories, fetchProducts]);

  // Real-time socket sync when Admin adds/updates/deletes subcategories
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => {
      fetchSubcategories(currentDemographic);
    };
    socket.on('fashion_subcategories_updated', handleUpdate);
    socket.on('subcategories_updated', handleUpdate);
    socket.on('category_updated', handleUpdate);

    return () => {
      socket.off('fashion_subcategories_updated', handleUpdate);
      socket.off('subcategories_updated', handleUpdate);
      socket.off('category_updated', handleUpdate);
    };
  }, [socket, currentDemographic, fetchSubcategories]);

  // Filter subcategories by search query
  const filteredSubcategories = useMemo(() => {
    if (!searchQuery.trim()) return subcategories;
    const q = searchQuery.toLowerCase().trim();
    return subcategories.filter((s) => (s.name || '').toLowerCase().includes(q));
  }, [subcategories, searchQuery]);

  // Chunk subcategories into pairs of 2 for 2-line horizontal slider
  const subcatPairs = useMemo(() => {
    const list = filteredSubcategories;
    const pairs: any[][] = [];
    for (let i = 0; i < list.length; i += 2) {
      if (i + 1 < list.length) {
        pairs.push([list[i], list[i + 1]]);
      } else {
        pairs.push([list[i]]);
      }
    }
    return pairs;
  }, [filteredSubcategories]);

  // Filter products by selected subcategory & demographic
  const displayedProducts = useMemo(() => {
    let result = products;
    if (selectedSubcat) {
      const targetSub = selectedSubcat.name.toLowerCase().trim();
      result = result.filter((p) => {
        const itemSub = (p.subcategory || p.subCategory || '').toLowerCase();
        const itemName = (p.name || '').toLowerCase();
        return itemSub.includes(targetSub) || itemName.includes(targetSub);
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((p) => (p.name || '').toLowerCase().includes(q));
    }
    return result;
  }, [products, selectedSubcat, searchQuery]);

  const handleSubcatSelect = (subcat: any) => {
    if (selectedSubcat && (selectedSubcat._id === subcat._id || selectedSubcat.name === subcat.name)) {
      setSelectedSubcat(null); // Toggle off if already selected
    } else {
      setSelectedSubcat(subcat);
    }
  };

  const handleAddToCart = (item: any) => {
    const storeObj = {
      _id: item.restaurantId || '6ac8693de868a5421c3d7f7d',
      name: 'Poonam fashion',
      restaurantName: 'Poonam fashion',
      categoryName: 'Fashion',
      restaurant_status: 'online',
      isOnline: true,
    };
    CartService.addItem(storeObj._id, storeObj, item, 1, true);
  };

  const handleDemographicChange = (demo: string) => {
    setCurrentDemographic(demo);
    setSelectedSubcat(null);
  };

  const screenTitle = currentDemographic === 'Male'
    ? "Men's Fashion"
    : currentDemographic === 'Female'
    ? "Women's Fashion"
    : currentDemographic === 'Kids'
    ? "Kids Fashion"
    : "Fashion Hub";

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
            <Text style={[styles.headerSub, isDark && { color: '#94A3B8' }]}>
              {subcategories.length} subcategories
            </Text>
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

      {/* SEARCH BAR */}
      <View style={[styles.searchBarWrap, isDark && { backgroundColor: '#0B0F19' }]}>
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

      {/* 4. MAIN SCROLLABLE CONTENT */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* SECTION: 2-LINE HORIZONTAL SLIDER FOR SUBCATEGORIES (ONLY SIDE SLIDE) */}
        <View style={[styles.subcategoriesSection, isDark && { backgroundColor: '#0F172A', borderColor: '#1E293B' }]}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={[styles.sectionTitle, isDark && { color: '#F8FAFC' }]}>
                {currentDemographic === 'Male'
                  ? "Men's Subcategories"
                  : currentDemographic === 'Female'
                  ? "Women's Subcategories"
                  : currentDemographic === 'Kids'
                  ? "Kids Subcategories"
                  : 'All Subcategories'}
              </Text>
              <Text style={[styles.sectionSubtitle, isDark && { color: '#94A3B8' }]}>
                Side-slide to explore • {filteredSubcategories.length} items
              </Text>
            </View>

            {selectedSubcat && (
              <TouchableOpacity
                onPress={() => setSelectedSubcat(null)}
                style={styles.clearFilterChip}
                activeOpacity={0.8}
              >
                <Text style={styles.clearFilterText}>Clear Filter ✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <View style={styles.sliderLoadingWrap}>
              <ActivityIndicator size="small" color="#0066FF" />
              <Text style={styles.sliderLoadingText}>Loading subcategories...</Text>
            </View>
          ) : filteredSubcategories.length === 0 ? (
            <View style={styles.sliderEmptyWrap}>
              <Text style={styles.sliderEmptyText}>No subcategories found for {currentDemographic}</Text>
            </View>
          ) : (
            /* ⚡ 2-LINE HORIZONTAL SCROLLVIEW (ONLY SIDE SLIDE) */
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.twoLineHorizontalContent}
              decelerationRate="fast"
            >
              {subcatPairs.map((pair, colIdx) => (
                <View key={`col_${colIdx}`} style={styles.twoLineColumn}>
                  {pair.map((subcat: any, rowIdx: number) => {
                    const isSelected = selectedSubcat && (selectedSubcat._id === subcat._id || selectedSubcat.name === subcat.name);
                    const imgUrl = subcat.image ? resolveFullUrl(subcat.image) : null;
                    return (
                      <TouchableOpacity
                        key={subcat._id || subcat.name || `sub_${colIdx}_${rowIdx}`}
                        style={[
                          styles.compactSubcatCard,
                          isSelected && styles.compactSubcatCardActive,
                        ]}
                        activeOpacity={0.8}
                        onPress={() => handleSubcatSelect(subcat)}
                      >
                        {/* Compact Round Circle (52x52) */}
                        <View
                          style={[
                            styles.compactCircleWrap,
                            isDark && { backgroundColor: '#1E293B', borderColor: '#334155' },
                            isSelected && styles.compactCircleWrapActive,
                          ]}
                        >
                          {imgUrl ? (
                            <Image source={{ uri: imgUrl }} style={styles.compactCircleImg} resizeMode="cover" />
                          ) : (
                            <View style={styles.compactPlaceholder}>
                              <Text style={{ fontSize: 20 }}>
                                {currentDemographic === 'Male' ? '👔' : currentDemographic === 'Female' ? '👗' : '🧒'}
                              </Text>
                            </View>
                          )}
                        </View>

                        {/* Compact Subcategory Name */}
                        <Text
                          style={[
                            styles.compactSubcatTitle,
                            isDark && { color: '#E2E8F0' },
                            isSelected && styles.compactSubcatTitleActive,
                          ]}
                          numberOfLines={2}
                        >
                          {subcat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        {/* SECTION: MATCHING PRODUCTS GRID */}
        <View style={styles.productsSection}>
          <View style={styles.productsHeaderRow}>
            <View>
              <Text style={[styles.productsTitle, isDark && { color: '#F8FAFC' }]}>
                {selectedSubcat ? `${selectedSubcat.name} Products` : `${screenTitle} Collections`}
              </Text>
              <Text style={[styles.productsSubtitle, isDark && { color: '#94A3B8' }]}>
                {displayedProducts.length} items available for instant delivery
              </Text>
            </View>

            <TouchableOpacity
              style={styles.viewFullGridBtn}
              activeOpacity={0.8}
              onPress={() => {
                navigation.navigate('ProductListingScreen', {
                  category: 'Fashion',
                  demographic: currentDemographic,
                  subcategory: selectedSubcat?.name || '',
                  title: selectedSubcat ? `${currentDemographic} ${selectedSubcat.name}` : screenTitle,
                  customerCoords,
                });
              }}
            >
              <Text style={styles.viewFullGridBtnText}>View All ›</Text>
            </TouchableOpacity>
          </View>

          {loadingProducts ? (
            <View style={styles.productsLoadingWrap}>
              <ActivityIndicator size="large" color="#0066FF" />
              <Text style={styles.productsLoadingText}>Loading products...</Text>
            </View>
          ) : displayedProducts.length === 0 ? (
            <View style={styles.noProductsCard}>
              <Text style={{ fontSize: 32 }}>🛍️</Text>
              <Text style={[styles.noProductsTitle, isDark && { color: '#F8FAFC' }]}>No Products Available Yet</Text>
              <Text style={styles.noProductsSub}>
                {selectedSubcat
                  ? `No products currently listed under "${selectedSubcat.name}". Try another subcategory above!`
                  : `Products for this collection will be available soon.`}
              </Text>
            </View>
          ) : (
            <View style={styles.productsGrid}>
              {displayedProducts.map((item, idx) => {
                const imgUri = resolveFullUrl(item.image || item.photo);
                return (
                  <TouchableOpacity
                    key={item._id || idx}
                    style={[styles.productCard, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}
                    activeOpacity={0.9}
                    onPress={() => {
                      navigation.navigate('ItemDetailsScreen', {
                        item,
                        restaurant: {
                          _id: item.restaurantId || '6ac8693de868a5421c3d7f7d',
                          name: 'Poonam fashion',
                          categoryName: 'Fashion',
                        },
                        customerCoords,
                      });
                    }}
                  >
                    <View style={styles.productImgWrap}>
                      {imgUri ? (
                        <Image source={{ uri: imgUri }} style={styles.productImg} resizeMode="cover" />
                      ) : (
                        <View style={styles.productPlaceholder}>
                          <Text style={{ fontSize: 30 }}>👕</Text>
                        </View>
                      )}
                      <View style={styles.priceTag}>
                        <Text style={styles.priceTagText}>₹{item.price}</Text>
                      </View>
                    </View>

                    <View style={styles.productInfo}>
                      <Text style={[styles.productName, isDark && { color: '#F8FAFC' }]} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <Text style={styles.productCategory} numberOfLines={1}>
                        {item.subcategory || item.category || 'Fashion'}
                      </Text>

                      <View style={styles.productBottomRow}>
                        <View>
                          <Text style={styles.livePrice}>₹{item.price}</Text>
                          {item.originalPrice > item.price && (
                            <Text style={styles.strikePrice}>₹{item.originalPrice}</Text>
                          )}
                        </View>

                        <TouchableOpacity
                          style={styles.addBtn}
                          activeOpacity={0.8}
                          onPress={() => handleAddToCart(item)}
                        >
                          <Text style={styles.addBtnText}>+ ADD</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* 5. AUTO-ADJUSTED BOTTOM NAVIGATION BAR */}
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
  demoTabsBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingVertical: 8,
  },
  demoTabsContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
  },
  demoTabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  demoTabPillActive: {
    backgroundColor: '#0066FF',
    borderColor: '#0066FF',
  },
  demoTabEmoji: {
    fontSize: 14,
    marginRight: 6,
  },
  demoTabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  demoTabLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
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
  subcategoriesSection: {
    backgroundColor: '#FFFFFF',
    marginTop: 6,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  clearFilterChip: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  clearFilterText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0066FF',
  },
  sliderLoadingWrap: {
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderLoadingText: {
    marginTop: 8,
    fontSize: 12,
    color: '#64748B',
  },
  sliderEmptyWrap: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sliderEmptyText: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
  },
  // ⚡ 2-ROW HORIZONTAL SLIDER (ONLY SIDE SLIDE)
  twoLineHorizontalContent: {
    paddingHorizontal: 16,
    gap: 12,
    flexDirection: 'row',
  },
  twoLineColumn: {
    flexDirection: 'column',
    gap: 10,
    justifyContent: 'space-between',
  },
  // ⚡ COMPACT SUBCATEGORY CARD (Optimized size)
  compactSubcatCard: {
    width: 72,
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: 10,
  },
  compactSubcatCardActive: {
    backgroundColor: '#EFF6FF',
  },
  // ⚡ COMPACT ROUND CIRCLE (52x52)
  compactCircleWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactCircleWrapActive: {
    borderColor: '#0066FF',
    borderWidth: 2,
    backgroundColor: '#EFF6FF',
  },
  compactCircleImg: {
    width: '100%',
    height: '100%',
  },
  compactPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactSubcatTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1E293B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 13,
    width: 72,
  },
  compactSubcatTitleActive: {
    color: '#0066FF',
    fontWeight: '700',
  },
  // Products Section
  productsSection: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  productsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  productsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  productsSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  viewFullGridBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  viewFullGridBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0066FF',
  },
  productsLoadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  productsLoadingText: {
    marginTop: 8,
    fontSize: 12,
    color: '#64748B',
  },
  noProductsCard: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noProductsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 10,
  },
  noProductsSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 24,
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  productCard: {
    width: (SCREEN_WIDTH - 44) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 12,
  },
  productImgWrap: {
    width: '100%',
    height: 140,
    backgroundColor: '#F8FAFC',
    position: 'relative',
  },
  productImg: {
    width: '100%',
    height: '100%',
  },
  productPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceTag: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  priceTagText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  productInfo: {
    padding: 10,
  },
  productName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 17,
  },
  productCategory: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  productBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  livePrice: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0066FF',
  },
  strikePrice: {
    fontSize: 10,
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  addBtn: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  bottomNavContainer: {
    flexDirection: 'row',
    height: 56,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  navTab: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  navTabIcon: {
    fontSize: 20,
  },
  navTabLabel: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  tabCartBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#0066FF',
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  tabCartBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
