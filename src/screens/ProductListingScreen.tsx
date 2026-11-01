import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  FlatList,
  Image,
  Dimensions,
  TextInput,
  StatusBar,
  ActivityIndicator,
  Modal,
  ScrollView,
  Platform,
  Vibration,
} from 'react-native';
import Icon from '../components/PngIcon';
import api, { UPLOADS_URL } from '../services/api';
import { CartService } from '../services/CartService';
import { useTheme } from '../context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMN_WIDTH = (SCREEN_WIDTH - 28) / 2;

const resolveFullUrl = (u?: string) => {
  if (!u || !u.trim()) return '';
  if (u.startsWith('http') || u.startsWith('data:')) return u;
  const clean = u.replace(/^\/?(api\/)?(uploads\/)?/, '');
  return `${UPLOADS_URL}/${clean}`;
};

// Real products loaded from backend store
const DEFAULT_PRODUCTS: any[] = [];

export default function ProductListingScreen({ navigation, route }: any) {
  const { isDark, currentColors } = useTheme('customer');
  const initialCategory = route?.params?.category || route?.params?.subCategory || 'Fashion';
  const initialDemographic = route?.params?.demographic || 'ALL';
  const initialSubcategory = route?.params?.subcategory || '';
  const initialQuery = route?.params?.query || (initialSubcategory ? initialSubcategory : (initialCategory !== 'Fashion' ? initialCategory : ''));

  const [searchQuery, setSearchQuery] = useState<string>(initialQuery);
  const [activeDemographic, setActiveDemographic] = useState<string>(initialDemographic);
  const [activeFilterPill, setActiveFilterPill] = useState<string>('all');
  const [wishlist, setWishlist] = useState<{ [id: string]: boolean }>({});
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [cartCount, setCartCount] = useState<number>(() => CartService.getCartCount());
  const [showFilterModal, setShowFilterModal] = useState<boolean>(false);
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [selectedFabric, setSelectedFabric] = useState<string>('ALL');

  // Sync cart count
  useEffect(() => {
    const unsub = CartService.subscribe((c) => setCartCount(c.count || 0));
    return unsub;
  }, []);

  // Fetch real items from backend
  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const storeId = route?.params?.restaurantId || '6ac8693de868a5421c3d7f7d';
      const res = await api.get(`/menu/${storeId}?forCustomer=true`).catch(() => null);

      if (res?.data?.success && Array.isArray(res.data.items) && res.data.items.length > 0) {
        const backendItems = res.data.items.map((it: any, idx: number) => {
          const calcMrp = it.mrp || Math.round(Number(it.price || 299) * 2.8);
          const calcDiscount = Math.max(10, Math.round(((calcMrp - it.price) / calcMrp) * 100));
          return {
            ...it,
            _id: it._id || it.id || `be_${idx}`,
            id: it._id || it.id || `be_${idx}`,
            brand: it.brand || (idx % 4 === 0 ? 'VYLOX' : idx % 4 === 1 ? 'SPOQUE' : idx % 4 === 2 ? 'bollydolldesigner' : 'Solbiza'),
            mrp: calcMrp,
            discount: calcDiscount,
            rating: it.rating || (3.5 + (idx % 15) * 0.1).toFixed(1),
            reviewsCount: it.reviewsCount || (15 + idx * 23),
            deliveryDate: 'Get it by 19th Oct',
            isAssured: idx % 2 === 1,
            tag: idx % 3 === 0 ? 'urgent' : idx % 3 === 1 ? 'sale' : '',
            tagText: idx % 3 === 0 ? 'Only a few left' : 'Lowest Price of the Sale',
          };
        });

        setProducts(backendItems);
      } else {
        setProducts([]);
      }
    } catch (e) {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [route?.params?.restaurantId]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const toggleWishlist = (id: string) => {
    setWishlist((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Filter products based on search, demographic, pills, brands
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Search / Category text
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesName = (p.name || '').toLowerCase().includes(q);
        const matchesBrand = (p.brand || '').toLowerCase().includes(q);
        const matchesCat = (p.category || '').toLowerCase().includes(q);
        const matchesDesc = (p.description || '').toLowerCase().includes(q);
        if (!matchesName && !matchesBrand && !matchesCat && !matchesDesc) {
          // If query is broad (e.g. 'shirts' vs 'shirt')
          const qSingular = q.endsWith('s') ? q.slice(0, -1) : q;
          if (
            !(p.name || '').toLowerCase().includes(qSingular) &&
            !(p.category || '').toLowerCase().includes(qSingular)
          ) {
            return false;
          }
        }
      }

      // Demographic filter
      if (activeDemographic !== 'ALL' && activeDemographic !== 'All') {
        const itemDemo = (p.demographic || 'All').toUpperCase();
        const filterDemo = activeDemographic.toUpperCase();
        if (itemDemo !== filterDemo && itemDemo !== 'ALL' && itemDemo !== 'UNISEX') {
          return false;
        }
      }

      // Subcategory filter (matching when opened from Fashion Subcategories)
      if (initialSubcategory) {
        const targetSub = initialSubcategory.toLowerCase().trim();
        const pSub = (p.subcategory || '').toLowerCase().trim();
        const pCat = (p.category || '').toLowerCase().trim();
        const pName = (p.name || '').toLowerCase().trim();
        const matchesSub = pSub.includes(targetSub) || pCat.includes(targetSub) || pName.includes(targetSub);
        const hasAnySubMatch = products.some((pr) => {
          const s = (pr.subcategory || '').toLowerCase();
          const c = (pr.category || '').toLowerCase();
          const n = (pr.name || '').toLowerCase();
          return s.includes(targetSub) || c.includes(targetSub) || n.includes(targetSub);
        });
        if (hasAnySubMatch && !matchesSub) {
          return false;
        }
      }

      // Quick filter pills
      if (activeFilterPill === 'discount' && (p.discount || 0) < 70) return false;
      if (activeFilterPill === 'value' && (p.price || 0) > 400) return false;
      if (activeFilterPill === 'assured' && !p.isAssured) return false;

      // Brand filter
      if (selectedBrand !== 'ALL' && p.brand !== selectedBrand) return false;

      return true;
    });
  }, [products, searchQuery, activeDemographic, activeFilterPill, selectedBrand]);

  const handleProductPress = (item: any) => {
    navigation.navigate('ItemDetailsScreen', {
      item: {
        ...item,
        name: item.name,
        price: item.price,
        mrp: item.mrp,
        image: item.image,
        brand: item.brand,
        description: item.description,
        rating: item.rating,
        reviewsCount: item.reviewsCount,
      },
      restaurant: {
        _id: item.restaurantId || '6ac8693de868a5421c3d7f7d',
        name: item.brand || 'Poonam fashion',
        restaurantName: 'Poonam fashion',
        categoryName: 'Fashion',
      },
      customerCoords: route?.params?.customerCoords,
    });
  };

  const handleAddToCart = async (item: any) => {
    const storeId = String(item.restaurantId || route?.params?.restaurantId || '6ac8693de868a5421c3d7f7d');
    const storeObj = {
      _id: storeId,
      name: item.brand || item.restaurantName || 'Poonam fashion',
      restaurantName: item.brand || item.restaurantName || 'Poonam fashion',
      categoryName: 'Fashion',
      restaurant_status: 'online',
      isOnline: true,
    };
    const res = CartService.addItem(storeId, storeObj, item, 1, true);
    if (res?.success) {
      try {
        Vibration.vibrate([0, 40, 30, 50]);
      } catch (_) {}
    }
  };

  const renderProductCard = ({ item }: { item: any }) => {
    const isWished = wishlist[item._id || item.id];
    const subcatImg = item.subcategoryImage || item.subCategory?.image || item.subCategoryImage;
    const displayImg = resolveFullUrl(item.image || subcatImg);

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={() => handleProductPress(item)}
      >
        {/* IMAGE CONTAINER */}
        <View style={styles.imageWrap}>
          {displayImg ? (
            <Image
              source={{ uri: displayImg }}
              style={styles.productImg}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.productImgPlaceholder}>
              <Icon name="bag-handle-outline" size={32} color="#CBD5E1" />
            </View>
          )}

          {/* WISHLIST HEART ICON */}
          <TouchableOpacity
            style={styles.wishlistBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => toggleWishlist(item._id || item.id)}
            activeOpacity={0.8}
          >
            <View style={styles.wishlistCircle}>
              <Text style={{ fontSize: 16, color: isWished ? '#EF4444' : '#64748B' }}>
                {isWished ? '♥' : '♡'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* RATING BADGE OVERLAY ON BOTTOM-LEFT */}
          {item.rating && (
            <View style={styles.ratingOverlay}>
              <Text style={styles.ratingText}>{item.rating} ★</Text>
              <Text style={styles.ratingDivider}>|</Text>
              <Text style={styles.reviewsCountText}>{item.reviewsCount || 15}</Text>
            </View>
          )}
        </View>

        {/* INFO SECTION */}
        <View style={styles.infoWrap}>
          {/* ASSURED BADGE & BRAND */}
          <View style={styles.brandRow}>
            {item.isAssured && (
              <View style={styles.assuredBadge}>
                <Text style={styles.assuredCheck}>✔</Text>
                <Text style={styles.assuredText}>Assured</Text>
              </View>
            )}
            <Text style={styles.brandName} numberOfLines={1}>
              {item.brand || 'VYLOX'}
            </Text>
            {subcatImg ? (
              <View style={styles.subcatPillBadge}>
                <Image
                  source={{ uri: resolveFullUrl(subcatImg) }}
                  style={styles.subcatPillImg}
                  resizeMode="cover"
                />
              </View>
            ) : null}
          </View>

          {/* ITEM TITLE */}
          <Text style={styles.productTitle} numberOfLines={2}>
            {item.name}
          </Text>

          {/* PRICING ROW */}
          <View style={styles.priceRow}>
            {item.discount ? (
              <View style={styles.discountBadge}>
                <Text style={styles.discountArrow}>↓</Text>
                <Text style={styles.discountText}>{item.discount}%</Text>
              </View>
            ) : null}
            {item.mrp ? (
              <Text style={styles.mrpText}>₹{item.mrp.toLocaleString('en-IN')}</Text>
            ) : null}
            <Text style={styles.sellingPrice}>₹{item.price.toLocaleString('en-IN')}</Text>
          </View>

          {/* URGENCY / SALE TAG */}
          {item.tag === 'urgent' && (
            <Text style={styles.urgentTagText}>{item.tagText || 'Only a few left'}</Text>
          )}
          {item.tag === 'sale' && (
            <View style={styles.saleTagPill}>
              <Text style={styles.saleTagText}>{item.tagText || 'Lowest Price of the Sale'}</Text>
            </View>
          )}

          {/* DELIVERY PROMISE */}
          <Text style={styles.deliveryText}>{item.deliveryDate || 'Get it by 19th Oct'}</Text>

          {/* QUICK ADD BUTTON */}
          <TouchableOpacity
            style={styles.quickAddBtn}
            onPress={() => handleAddToCart(item)}
            activeOpacity={0.8}
          >
            <Text style={styles.quickAddText}>+ Add to Cart</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, isDark && { backgroundColor: '#0B0F19' }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? '#0F172A' : '#FFFFFF'} />

      {/* TOP HEADER */}
      <View style={[styles.header, isDark && { backgroundColor: '#0F172A', borderBottomColor: '#1E293B' }]}>
        <TouchableOpacity
          style={[styles.backBtn, isDark && { backgroundColor: '#1E293B' }]}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={[styles.backIcon, isDark && { color: '#F8FAFC' }]}>←</Text>
        </TouchableOpacity>

        {/* SEARCH BAR */}
        <View style={[styles.searchBar, isDark && { backgroundColor: '#1E293B' }]}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={[styles.searchInput, isDark && { color: '#F8FAFC' }]}
            placeholder="Search shirts, jeans, brands..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.clearSearchIcon}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* CART WITH LIVE BADGE */}
        <TouchableOpacity
          style={[styles.cartBtn, isDark && { backgroundColor: '#1E293B' }]}
          onPress={() => navigation.navigate('CartScreen')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.cartIcon}>🛒</Text>
          {cartCount > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cartCount > 99 ? '99+' : cartCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* HORIZONTAL QUICK FILTER PILLS (Matching screenshot) */}
      <View style={styles.filterPillsRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsContent}>
          {/* Main Filter Button */}
          <TouchableOpacity
            style={[styles.filterPill, styles.mainFilterPill]}
            onPress={() => setShowFilterModal(true)}
            activeOpacity={0.8}
          >
            <View style={styles.filterCountBadge}>
              <Text style={styles.filterCountText}>1</Text>
            </View>
            <Text style={styles.filterPillText}>⚲ Filters</Text>
          </TouchableOpacity>

          {/* Top Sale Discounts */}
          <TouchableOpacity
            style={[
              styles.filterPill,
              activeFilterPill === 'discount' && styles.filterPillActive,
            ]}
            onPress={() => setActiveFilterPill(activeFilterPill === 'discount' ? 'all' : 'discount')}
          >
            <Text style={styles.pillPrefixIcon}>%</Text>
            <Text style={[styles.filterPillText, activeFilterPill === 'discount' && styles.filterPillTextActive]}>
              Top Sale Discounts
            </Text>
          </TouchableOpacity>

          {/* Value 365 */}
          <TouchableOpacity
            style={[
              styles.filterPill,
              activeFilterPill === 'value' && styles.filterPillActive,
            ]}
            onPress={() => setActiveFilterPill(activeFilterPill === 'value' ? 'all' : 'value')}
          >
            <Text style={styles.pillPrefixIcon}>⊞</Text>
            <Text style={[styles.filterPillText, activeFilterPill === 'value' && styles.filterPillTextActive]}>
              Value 365
            </Text>
          </TouchableOpacity>

          {/* Assured Delivery */}
          <TouchableOpacity
            style={[
              styles.filterPill,
              activeFilterPill === 'assured' && styles.filterPillActive,
            ]}
            onPress={() => setActiveFilterPill(activeFilterPill === 'assured' ? 'all' : 'assured')}
          >
            <Text style={styles.pillPrefixIcon}>⚡</Text>
            <Text style={[styles.filterPillText, activeFilterPill === 'assured' && styles.filterPillTextActive]}>
              Fast Delivery
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* PRODUCT GRID */}
      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#0066FF" />
          <Text style={styles.loaderText}>Loading products...</Text>
        </View>
      ) : filteredProducts.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>👕</Text>
          <Text style={styles.emptyTitle}>No matching products</Text>
          <Text style={styles.emptySub}>Try searching for "Shirts", "Kurtis", or clear filters.</Text>
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => {
              setSearchQuery('');
              setActiveDemographic('ALL');
              setActiveFilterPill('all');
              setSelectedBrand('ALL');
            }}
          >
            <Text style={styles.resetBtnText}>Reset All Filters</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => String(item._id || item.id)}
          numColumns={2}
          renderItem={renderProductCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={<View style={{ height: 80 }} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backBtn: {
    padding: 6,
    marginRight: 6,
  },
  backIcon: {
    fontSize: 22,
    color: '#0F172A',
    fontWeight: 'bold',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 22,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
    paddingVertical: 0,
  },
  clearSearchIcon: {
    fontSize: 13,
    color: '#64748B',
    padding: 4,
  },
  cartBtn: {
    padding: 8,
    marginLeft: 8,
    position: 'relative',
  },
  cartIcon: {
    fontSize: 22,
  },
  cartBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  cartBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  filterPillsRow: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  filterPillsContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: 5,
  },
  mainFilterPill: {
    borderColor: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  filterCountBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCountText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 'bold',
  },
  pillPrefixIcon: {
    fontSize: 13,
    color: '#6366F1',
    fontWeight: 'bold',
  },
  filterPillActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#0066FF',
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  filterPillTextActive: {
    color: '#0066FF',
    fontWeight: 'bold',
  },
  listContent: {
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  card: {
    width: COLUMN_WIDTH,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginHorizontal: 4,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  imageWrap: {
    width: '100%',
    height: COLUMN_WIDTH * 1.25,
    backgroundColor: '#F1F5F9',
    position: 'relative',
  },
  productImg: {
    width: '100%',
    height: '100%',
  },
  productImgPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  subcatPillBadge: {
    marginLeft: 'auto',
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: '#CBD5E1',
  },
  subcatPillImg: {
    width: 16,
    height: 16,
  },
  wishlistBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
  },
  wishlistCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  ratingOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#CBD5E1',
    gap: 3,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#16A34A',
  },
  ratingDivider: {
    fontSize: 10,
    color: '#94A3B8',
  },
  reviewsCountText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  infoWrap: {
    padding: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 3,
  },
  assuredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    gap: 2,
  },
  assuredCheck: {
    fontSize: 8,
    color: '#0066FF',
    fontWeight: 'bold',
  },
  assuredText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#0066FF',
    fontStyle: 'italic',
  },
  brandName: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  productTitle: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
    marginBottom: 6,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  discountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  discountArrow: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#16A34A',
  },
  discountText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#16A34A',
  },
  mrpText: {
    fontSize: 11,
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  sellingPrice: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  urgentTagText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DC2626',
    marginBottom: 4,
  },
  saleTagPill: {
    backgroundColor: '#FAF5FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  saleTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9333EA',
  },
  deliveryText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 8,
  },
  quickAddBtn: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickAddText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0066FF',
  },
  loaderWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loaderText: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748B',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 16,
  },
  resetBtn: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  resetBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  bottomBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomBarLeftText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  bottomBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomBarRightText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0066FF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalCloseText: {
    fontSize: 18,
    color: '#64748B',
    fontWeight: 'bold',
  },
  sheetSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 12,
    marginBottom: 8,
  },
  sheetChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  sheetChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sheetChipActive: {
    backgroundColor: '#0066FF',
    borderColor: '#0066FF',
  },
  sheetChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  sheetChipTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  applyFilterBtn: {
    backgroundColor: '#0066FF',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 18,
  },
  applyFilterBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
