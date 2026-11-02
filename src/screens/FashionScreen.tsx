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
  Platform,
  ActivityIndicator,
} from 'react-native';
import Icon from '../components/PngIcon';
import api, { UPLOADS_URL } from '../services/api';
import { CartService } from '../services/CartService';
import { useSocket } from '../context/SocketContext';
import { LottieAnimation } from '../components/LottieAnimation';
import { useTheme } from '../context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// In-memory cache to prevent fashion screen reload / flickering
let _cachedFashionProducts: any[] = [];
let _cachedFashionBanners: any[] = [];
let _cachedFashionDemographics: any = null;

const resolveFullUrl = (u?: string) => {
  if (!u || !u.trim()) return '';
  if (u.startsWith('http') || u.startsWith('data:')) return u;
  const clean = u.replace(/^\/?(api\/)?(uploads\/)?/, '');
  return `${UPLOADS_URL}/${clean}`;
};

export default function FashionScreen({ navigation, route }: any) {
  const { customerCoords } = route?.params || {};
  const { socket } = useSocket();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchVisible, setIsSearchVisible] = useState<boolean>(false);

  // Dynamic Admin Hero Banners & Top Deals Slider
  const [fashionBanners, setFashionBanners] = useState<any[]>([]);
  const [bannerActiveIndex, setBannerActiveIndex] = useState<number>(0);
  const bannerScrollRef = React.useRef<ScrollView>(null);
  const [adminBannerUrl, setAdminBannerUrl] = useState<string | null>(null);
  const [bannerAspectRatio, setBannerAspectRatio] = useState<number>(2.27);
  const [adminLottieConfig, setAdminLottieConfig] = useState<any>(null);
  const [displayMode, setDisplayMode] = useState<'IMAGE' | 'LOTTIE' | 'BOTH'>('BOTH');

  const { isDark, currentColors } = useTheme('customer');

  // Dynamic Admin Demographic Images (Men/Male, Women/Female, Kids)
  const [demographicImages, setDemographicImages] = useState<{ men: string; women: string; kids: string }>(
    _cachedFashionDemographics || {
      men: '',
      women: '',
      kids: '',
    }
  );

  // Real items state for Male, Female, Kids
  const [realFashionItems, setRealFashionItems] = useState<any[]>(_cachedFashionProducts);
  const [loadingItems, setLoadingItems] = useState<boolean>(_cachedFashionProducts.length === 0);

  // Active demographic and subcategories 2-line slider state
  const [activeDemographic, setActiveDemographic] = useState<'Male' | 'Female' | 'Kids'>('Male');
  const [fashionSubcategories, setFashionSubcategories] = useState<any[]>([]);
  const [loadingSubcategories, setLoadingSubcategories] = useState<boolean>(false);

  const fetchSubcategoriesForDemographic = useCallback(async (demo: string) => {
    try {
      setLoadingSubcategories(true);
      const res = await api.get(`/categories/fashion?demographic=${encodeURIComponent(demo)}`).catch(() => null);
      if (res?.data?.success && Array.isArray(res.data.subcategories)) {
        const activeSubs = res.data.subcategories.filter((s: any) => s.isActive !== false && s.name && s.name.trim().length > 0);
        setFashionSubcategories(activeSubs);
      } else {
        setFashionSubcategories([]);
      }
    } catch (_) {
      setFashionSubcategories([]);
    } finally {
      setLoadingSubcategories(false);
    }
  }, []);

  useEffect(() => {
    fetchSubcategoriesForDemographic(activeDemographic);
  }, [activeDemographic, fetchSubcategoriesForDemographic]);

  const subcatPairs = useMemo(() => {
    const list = fashionSubcategories;
    const pairs: any[][] = [];
    for (let i = 0; i < list.length; i += 2) {
      if (i + 1 < list.length) {
        pairs.push([list[i], list[i + 1]]);
      } else {
        pairs.push([list[i]]);
      }
    }
    return pairs;
  }, [fashionSubcategories]);

  // Live cart synchronization
  const [cartCount, setCartCount] = useState<number>(() => CartService.getCartCount());

  useEffect(() => {
    const unsub = CartService.subscribe((state) => {
      setCartCount(state.count || 0);
    });
    return unsub;
  }, []);

  // Fetch real items from backend store
  const fetchFashionProducts = useCallback(async () => {
    try {
      if (_cachedFashionProducts.length === 0) {
        setLoadingItems(true);
      }
      const res = await api.get('/menu/6ac8693de868a5421c3d7f7d?forCustomer=true').catch(() => null);
      if (res?.data?.success && Array.isArray(res.data.items) && res.data.items.length > 0) {
        _cachedFashionProducts = res.data.items;
        setRealFashionItems(res.data.items);
      } else if (_cachedFashionProducts.length === 0) {
        setRealFashionItems([]);
      }
    } catch (_) {
      if (_cachedFashionProducts.length === 0) {
        setRealFashionItems([]);
      }
    } finally {
      setLoadingItems(false);
    }
  }, []);

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

  // Fetch Admin Banner & Lottie Animation for Fashion screen
  const fetchFashionBanner = useCallback(async () => {
    try {
      let lottieCfg: any = null;
      let dMode: 'IMAGE' | 'LOTTIE' | 'BOTH' = 'IMAGE';
      const allBanners: any[] = [];

      // 1. Fetch /banner?target=FASHION as primary authoritative source
      const res = await api.get('/banner?target=FASHION&status=Active').catch(() => null);
      if (res?.data?.success && Array.isArray(res.data.data) && res.data.data.length > 0) {
        const activeBanners = res.data.data.filter((b: any) => b.status === 'Active');
        activeBanners.forEach((b: any) => {
          const cleanUrl = resolveFullUrl(b.imageUrl);
          if (cleanUrl) {
            const rawBase = cleanUrl.split('?')[0].trim().toLowerCase();
            if (!allBanners.some((existing) => existing.rawBase === rawBase)) {
              const versioned = cleanUrl.includes('?') ? cleanUrl : `${cleanUrl}?v=${b.updatedAt ? new Date(b.updatedAt).getTime() : 1}`;
              allBanners.push({ id: b._id, rawBase, imageUrl: versioned, title: b.title });
            }
          }
        });
      }

      // 2. Fetch ScreenMedia ONLY for Lottie config or fallback if /banner is empty
      const screenRes = await api.get('/screen-media/target/FASHION').catch(() => null);
      if (screenRes?.data?.success && screenRes.data.screen) {
        const sc = screenRes.data.screen;
        if (sc.isActive !== false) {
          const rawImg = sc.imageUrl || (sc.currentMediaType === 'IMAGE' || sc.currentMediaType === 'BOTH' ? sc.mediaUrl : '');
          const rawLottie = sc.lottieUrl || (sc.currentMediaType === 'LOTTIE' ? sc.mediaUrl : '');

          const img = resolveFullUrl(rawImg);
          const lottie = resolveFullUrl(rawLottie);

          // If no banners from /banner, fallback to ScreenMedia image
          if (img && allBanners.length === 0) {
            const rawBase = img.split('?')[0].trim().toLowerCase();
            allBanners.push({ id: sc._id || 'screen_media', rawBase, imageUrl: img, title: sc.title });
          }

          if (lottie || sc.lottieConfig?.rawJson) {
            lottieCfg = {
              source: sc.lottieConfig?.rawJson || (lottie ? { uri: lottie } : null),
              speed: sc.lottieConfig?.speed || 1.0,
              loop: sc.lottieConfig?.loop !== false,
              autoplay: sc.lottieConfig?.autoplay !== false,
            };
          }

          if (sc.displayMode) {
            dMode = sc.displayMode;
          } else if (allBanners.length > 0 && lottie) {
            dMode = 'BOTH';
          } else if (lottie) {
            dMode = 'LOTTIE';
          } else {
            dMode = 'IMAGE';
          }
        }
      }

      setFashionBanners(allBanners);
      const primaryUrl = allBanners.length > 0 ? allBanners[0].imageUrl : null;
      setAdminBannerUrl(primaryUrl);
      if (primaryUrl) {
        Image.getSize(primaryUrl, (w, h) => {
          if (w > 0 && h > 0) {
            setBannerAspectRatio(w / h);
          }
        }, () => {});
      }
      setAdminLottieConfig(lottieCfg);
      setDisplayMode(dMode);
    } catch (_) {
      setFashionBanners([]);
      setAdminBannerUrl(null);
      setAdminLottieConfig(null);
    }
  }, []);

  // Auto-slide banner carousel every 3.5s when multiple real banners exist
  useEffect(() => {
    if (fashionBanners.length <= 1) return;
    const timer = setInterval(() => {
      setBannerActiveIndex((prev) => {
        const next = (prev + 1) % fashionBanners.length;
        bannerScrollRef.current?.scrollTo({ x: next * (SCREEN_WIDTH - 24), animated: true });
        return next;
      });
    }, 3500);

    return () => clearInterval(timer);
  }, [fashionBanners.length]);

  // Fetch Dynamic Demographic Cards (Men, Women, Kids) uploaded from Admin Panel
  const fetchFashionDemographics = useCallback(async () => {
    try {
      const res = await api.get('/settings/fashion-demographics').catch(() => null);
      if (res?.data?.success && res.data.fashionImages) {
        const fi = res.data.fashionImages;
        const resolveUrl = (u?: string) => {
          if (!u || !u.trim()) return '';
          if (u.startsWith('http') || u.startsWith('data:')) return u;
          const clean = u.replace(/^\/?(api\/)?(uploads\/)?/, '');
          const base = `${UPLOADS_URL}/${clean}`;
          return base.includes('?') ? base : `${base}?v=${Date.now()}`;
        };
        setDemographicImages({
          men: resolveUrl(fi.men),
          women: resolveUrl(fi.women),
          kids: resolveUrl(fi.kids),
        });
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchFashionBanner();
    fetchFashionDemographics();
    fetchFashionProducts();
  }, [fetchFashionBanner, fetchFashionDemographics, fetchFashionProducts]);

  // Real-time socket listeners for banner and demographics updates from Admin
  useEffect(() => {
    if (!socket) return;

    const onBannerChange = (b: any) => {
      const target = String(b?.target || '').toUpperCase();
      if (target === 'FASHION' || target === 'SUBCATEGORY') {
        fetchFashionBanner();
      }
    };

    const onScreenMediaChange = (data: any) => {
      const sid = String(data?.screenId || '').toLowerCase();
      if (sid.includes('fashion')) {
        fetchFashionBanner();
      }
    };

    const onDemographicsChange = () => {
      fetchFashionDemographics();
    };

    socket.on('banner_created', onBannerChange);
    socket.on('banner_updated', onBannerChange);
    socket.on('screen_media_updated', onScreenMediaChange);
    socket.on('screen_media_fashion_banner', onScreenMediaChange);
    socket.on('fashion_demographics_updated', onDemographicsChange);

    return () => {
      socket.off('banner_created', onBannerChange);
      socket.off('banner_updated', onBannerChange);
      socket.off('screen_media_updated', onScreenMediaChange);
      socket.off('screen_media_fashion_banner', onScreenMediaChange);
      socket.off('fashion_demographics_updated', onDemographicsChange);
    };
  }, [socket, fetchFashionBanner, fetchFashionDemographics]);

  // Navigation: Clicking a demographic opens Screen 2 (FashionSubcategoriesScreen)
  const openSubcategories = (demographic: 'Male' | 'Female' | 'Kids', title: string) => {
    navigation.navigate('FashionSubcategoriesScreen', {
      demographic,
      title,
      customerCoords,
    });
  };

  const bannerHeight = Math.min((SCREEN_WIDTH - 24) * 0.75, (SCREEN_WIDTH - 24) / (bannerAspectRatio || 2.27));

  return (
    <SafeAreaView style={[styles.safeArea, isDark && { backgroundColor: '#0B0F19' }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? '#0F172A' : '#FFFFFF'} />

      {/* 1. TOP HEADER (Back, Title, Search, Cart) */}
      <View style={[styles.headerBar, isDark && { backgroundColor: '#0F172A', borderBottomColor: '#1E293B' }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={[styles.backButton, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}
            activeOpacity={0.7}
            onPress={() => navigation.goBack()}
          >
            <Text style={[styles.backChevronGlyph, isDark && { color: '#F8FAFC' }]}>‹</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, isDark && { color: '#F8FAFC' }]}>Fashion</Text>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.headerIconBtn, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}
            activeOpacity={0.7}
            onPress={() => setIsSearchVisible(!isSearchVisible)}
          >
            <Icon name="search" size={20} color={isDark ? '#F8FAFC' : '#0F172A'} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.headerIconBtn, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('CartScreen', { customerCoords })}
          >
            <Icon name="cart-outline" size={21} color={isDark ? '#F8FAFC' : '#0F172A'} />
            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* EXPANDABLE SEARCH BAR */}
      {isSearchVisible && (
        <View style={[styles.searchBarContainer, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}>
          <Icon name="search" size={17} color="#64748B" style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, isDark && { color: '#F8FAFC' }]}
            placeholder="Search fashion: Male, Female, Kids..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={() => {
              const q = searchQuery.toLowerCase().trim();
              if (q.includes('kid') || q.includes('child') || q.includes('baby')) {
                openSubcategories('Kids', 'Kids Fashion');
              } else if (q.includes('fem') || q.includes('wom') || q.includes('girl') || q.includes('saree')) {
                openSubcategories('Female', 'Female Fashion');
              } else {
                openSubcategories('Male', 'Male Fashion');
              }
            }}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 16, color: '#64748B', fontWeight: 'bold' }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* SCROLLABLE MAIN CONTENT */}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {/* 2. DYNAMIC PROMOTIONAL HERO BANNER & ANIMATION (Admin Managed - Real Data Only) */}
        {(fashionBanners.length > 0 || adminLottieConfig?.source || adminBannerUrl) ? (
          <View style={[styles.bannerContainer, { height: bannerHeight }]}>
            {adminLottieConfig?.source && (displayMode === 'LOTTIE' || (!adminBannerUrl && fashionBanners.length === 0)) ? (
              <View style={styles.heroLottieWrap}>
                <LottieAnimation
                  source={adminLottieConfig.source}
                  width="100%"
                  height={bannerHeight}
                  speed={adminLottieConfig.speed || 1.0}
                  loop={adminLottieConfig.loop !== false}
                  autoplay={adminLottieConfig.autoplay !== false}
                />
              </View>
            ) : fashionBanners.length > 1 ? (
              <View>
                <ScrollView
                  ref={bannerScrollRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={(e) => {
                    const offset = e.nativeEvent.contentOffset.x;
                    const idx = Math.round(offset / (SCREEN_WIDTH - 24));
                    setBannerActiveIndex(idx);
                  }}
                  style={{ width: SCREEN_WIDTH - 24, borderRadius: 16 }}
                >
                  {fashionBanners.map((banner, bIdx) => (
                    <View key={banner.id || bIdx} style={{ width: SCREEN_WIDTH - 24, height: bannerHeight, borderRadius: 16, overflow: 'hidden' }}>
                      <Image source={{ uri: banner.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    </View>
                  ))}
                </ScrollView>
                <View style={styles.bannerDotsRow}>
                  {fashionBanners.map((_, dotIdx) => (
                    <View
                      key={dotIdx}
                      style={[
                        styles.bannerDot,
                        bannerActiveIndex === dotIdx && styles.bannerDotActive,
                      ]}
                    />
                  ))}
                </View>
              </View>
            ) : (adminBannerUrl || fashionBanners.length > 0) ? (
              <Image
                source={{ uri: adminBannerUrl || fashionBanners[0]?.imageUrl }}
                style={{ width: '100%', height: '100%', borderRadius: 16 }}
                resizeMode="cover"
              />
            ) : null}
          </View>
        ) : null}

        {/* 3. FASHION MAIN CATEGORIES: Male, Female, Kids */}
        <View style={styles.demographicSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.demographicSectionTitle}>Categories</Text>
            <Text style={styles.demographicSectionSub}>Select category to explore subcategories</Text>
          </View>

          <View style={styles.demographicCardsRow}>
            {/* Card 1: Male */}
            <TouchableOpacity
              style={styles.demographicCard}
              activeOpacity={0.88}
              onPress={() => openSubcategories('Male', 'Male Fashion')}
            >
              <View style={styles.demographicImgWrap}>
                {demographicImages.men ? (
                  <Image
                    source={{ uri: demographicImages.men }}
                    style={styles.demographicCardImg}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.placeholderCardWrap}>
                    <Text style={{ fontSize: 40 }}>👔</Text>
                  </View>
                )}
              </View>
              <View style={styles.demographicFooter}>
                <Text style={styles.demographicTitleText}>Male</Text>
                <Text style={styles.demographicChevron}>›</Text>
              </View>
            </TouchableOpacity>

            {/* Card 2: Female */}
            <TouchableOpacity
              style={styles.demographicCard}
              activeOpacity={0.88}
              onPress={() => openSubcategories('Female', 'Female Fashion')}
            >
              <View style={styles.demographicImgWrap}>
                {demographicImages.women ? (
                  <Image
                    source={{ uri: demographicImages.women }}
                    style={styles.demographicCardImg}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.placeholderCardWrap}>
                    <Text style={{ fontSize: 40 }}>👗</Text>
                  </View>
                )}
              </View>
              <View style={styles.demographicFooter}>
                <Text style={styles.demographicTitleText}>Female</Text>
                <Text style={styles.demographicChevron}>›</Text>
              </View>
            </TouchableOpacity>

            {/* Card 3: Kids */}
            <TouchableOpacity
              style={styles.demographicCard}
              activeOpacity={0.88}
              onPress={() => openSubcategories('Kids', 'Kids Fashion')}
            >
              <View style={styles.demographicImgWrap}>
                {demographicImages.kids ? (
                  <Image
                    source={{ uri: demographicImages.kids }}
                    style={styles.demographicCardImg}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.placeholderCardWrap}>
                    <Text style={{ fontSize: 40 }}>🧒</Text>
                  </View>
                )}
              </View>
              <View style={styles.demographicFooter}>
                <Text style={styles.demographicTitleText}>Kids</Text>
                <Text style={styles.demographicChevron}>›</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* 3B. 2-LINE HORIZONTAL SLIDER FOR SUBCATEGORIES (ONLY SIDE SLIDE) */}
        <View style={[styles.subcatSliderSection, isDark && { backgroundColor: '#0F172A', borderColor: '#1E293B' }]}>
          <View style={styles.subcatSliderHeaderRow}>
            <View>
              <Text style={[styles.subcatSliderTitle, isDark && { color: '#F8FAFC' }]}>
                {activeDemographic === 'Male'
                  ? "Men's Subcategories"
                  : activeDemographic === 'Female'
                  ? "Women's Subcategories"
                  : "Kids Subcategories"}
              </Text>
              <Text style={[styles.subcatSliderSub, isDark && { color: '#94A3B8' }]}>
                2 rows • Side-slide to explore ({fashionSubcategories.length})
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => openSubcategories(activeDemographic, `${activeDemographic} Fashion`)}
              style={styles.subcatViewAllChip}
            >
              <Text style={styles.subcatViewAllText}>View All ›</Text>
            </TouchableOpacity>
          </View>

          {/* Demographic Selector Pills */}
          <View style={styles.subcatTabRow}>
            {[
              { id: 'Male', label: 'Men', icon: '👔' },
              { id: 'Female', label: 'Women', icon: '👗' },
              { id: 'Kids', label: 'Kids', icon: '🧒' },
            ].map((tab) => {
              const isActive = activeDemographic === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[
                    styles.subcatTabPill,
                    isDark && { backgroundColor: '#1E293B', borderColor: '#334155' },
                    isActive && styles.subcatTabPillActive,
                  ]}
                  activeOpacity={0.8}
                  onPress={() => setActiveDemographic(tab.id as any)}
                >
                  <Text style={styles.subcatTabEmoji}>{tab.icon}</Text>
                  <Text
                    style={[
                      styles.subcatTabLabel,
                      isDark && { color: '#94A3B8' },
                      isActive && styles.subcatTabLabelActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ⚡ 2-ROW HORIZONTAL SLIDER (ONLY SIDE SLIDE) */}
          {loadingSubcategories ? (
            <View style={{ height: 140, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator size="small" color="#0066FF" />
            </View>
          ) : subcatPairs.length === 0 ? (
            <View style={{ height: 90, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, color: '#94A3B8' }}>No subcategories found for {activeDemographic}</Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalSubcatScroll}
              decelerationRate="fast"
            >
              {subcatPairs.map((pair, colIdx) => (
                <View key={`col_${colIdx}`} style={styles.subcatColumn}>
                  {pair.map((subcat: any, rowIdx: number) => {
                    const imgUrl = subcat.image ? resolveFullUrl(subcat.image) : null;
                    return (
                      <TouchableOpacity
                        key={subcat._id || subcat.name || `sub_${colIdx}_${rowIdx}`}
                        style={styles.compactSubcatCard}
                        activeOpacity={0.8}
                        onPress={() => {
                          navigation.navigate('FashionSubcategoriesScreen', {
                            demographic: activeDemographic,
                            title: `${activeDemographic} Fashion`,
                            subcategoryId: subcat._id,
                            customerCoords,
                          });
                        }}
                      >
                        <View
                          style={[
                            styles.compactCircleWrap,
                            isDark && { backgroundColor: '#1E293B', borderColor: '#334155' },
                          ]}
                        >
                          {imgUrl ? (
                            <Image source={{ uri: imgUrl }} style={styles.compactCircleImg} resizeMode="cover" />
                          ) : (
                            <View style={styles.compactPlaceholder}>
                              <Text style={{ fontSize: 20 }}>
                                {activeDemographic === 'Male' ? '👔' : activeDemographic === 'Female' ? '👗' : '🧒'}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text
                          style={[styles.compactSubcatTitle, isDark && { color: '#E2E8F0' }]}
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

        {/* 4. REAL FASHION ITEMS (Under Male, Female, Kids) */}
        {realFashionItems.length > 0 && (
          <View style={styles.realItemsSection}>
            <View style={styles.realItemsHeaderRow}>
              <View>
                <Text style={styles.realItemsTitle}>Trending Real Items</Text>
                <Text style={styles.realItemsSub}>Authentic products available for instant order</Text>
              </View>
            </View>

            <View style={styles.realItemsGrid}>
              {realFashionItems.map((item, idx) => {
                const imgUri = resolveFullUrl(item.image || item.photo);
                return (
                  <TouchableOpacity
                    key={item._id || idx}
                    style={styles.realItemCard}
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
                    <View style={styles.realItemImgWrap}>
                      {imgUri ? (
                        <Image source={{ uri: imgUri }} style={styles.realItemImg} resizeMode="cover" />
                      ) : (
                        <View style={styles.realItemPlaceholder}>
                          <Text style={{ fontSize: 32 }}>🛍️</Text>
                        </View>
                      )}
                      <View style={styles.priceTagBadge}>
                        <Text style={styles.priceTagText}>₹{item.price}</Text>
                      </View>
                    </View>

                    <View style={styles.realItemInfo}>
                      <Text style={styles.realItemName} numberOfLines={2}>{item.name}</Text>
                      <View style={styles.realItemBottomRow}>
                        <Text style={styles.realItemCat} numberOfLines={1}>{item.category || 'Fashion'}</Text>
                        <TouchableOpacity
                          style={styles.addCartBtn}
                          onPress={() => handleAddToCart(item)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.addCartBtnText}>+ ADD</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      {/* 4. BOTTOM NAVIGATION BAR - Standard Customer 4-Tab Navigation */}
      <View style={styles.bottomNavContainer}>
        {/* Home */}
        <TouchableOpacity
          style={styles.navTab}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('CustomerHomeScreen')}
        >
          <Text style={[styles.navTabIcon, { color: '#0066FF' }]}>🏠</Text>
          <Text style={[styles.navTabLabel, { color: '#0066FF', fontWeight: 'bold' }]}>Home</Text>
        </TouchableOpacity>

        {/* Cart */}
        <TouchableOpacity
          style={styles.navTab}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('CartScreen', { customerCoords })}
        >
          <View style={{ position: 'relative', width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={styles.navTabIcon}>🛒</Text>
            {cartCount > 0 && (
              <View style={styles.tabCartBadge}>
                <Text style={styles.tabCartBadgeText}>{cartCount}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.navTabLabel, cartCount > 0 ? { color: '#0066FF', fontWeight: '700' } : {}]}>Cart</Text>
        </TouchableOpacity>

        {/* Orders */}
        <TouchableOpacity
          style={styles.navTab}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('MyBookingsScreen', { role: 'customer', title: 'My Orders' })}
        >
          <Text style={styles.navTabIcon}>📑</Text>
          <Text style={styles.navTabLabel}>Orders</Text>
        </TouchableOpacity>

        {/* Profile */}
        <TouchableOpacity
          style={styles.navTab}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('CustomerProfileScreen')}
        >
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
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
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
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    backgroundColor: '#F8FAFC',
  },
  backChevronGlyph: {
    fontSize: 28,
    fontWeight: '300',
    color: '#0F172A',
    lineHeight: 32,
    marginTop: -2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
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
    backgroundColor: '#EF4444',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  cartBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: 0,
  },
  bannerContainer: {
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
    position: 'relative',
  },
  heroLottieWrap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  bannerDotsRow: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  bannerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  bannerDotActive: {
    width: 16,
    backgroundColor: '#FFFFFF',
  },
  demographicSection: {
    marginTop: 20,
    paddingHorizontal: 12,
  },
  sectionHeaderRow: {
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  demographicSectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  demographicSectionSub: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  demographicCardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  demographicCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  demographicImgWrap: {
    width: '100%',
    height: 140,
    backgroundColor: '#F1F5F9',
  },
  demographicCardImg: {
    width: '100%',
    height: '100%',
  },
  placeholderCardWrap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
  },
  demographicFooter: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  demographicTitleText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  demographicChevron: {
    fontSize: 16,
    color: '#0066FF',
    fontWeight: 'bold',
    marginLeft: 4,
  },
  bottomNavContainer: {
    flexDirection: 'row',
    height: 60,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 4,
  },
  navTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
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
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  // ── Real Items Section Styles ──
  realItemsSection: {
    marginHorizontal: 12,
    marginTop: 20,
    marginBottom: 16,
  },
  realItemsHeaderRow: {
    marginBottom: 12,
  },
  realItemsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  realItemsSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  realItemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  realItemCard: {
    width: (SCREEN_WIDTH - 36) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  realItemImgWrap: {
    width: '100%',
    height: 140,
    backgroundColor: '#F8FAFC',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  realItemImg: {
    width: '100%',
    height: '100%',
  },
  realItemPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceTagBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  priceTagText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  realItemInfo: {
    padding: 10,
  },
  realItemName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
    minHeight: 34,
  },
  realItemBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  realItemCat: {
    fontSize: 11,
    color: '#64748B',
    flex: 1,
    marginRight: 6,
  },
  addCartBtn: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  addCartBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  // ⚡ 2-Row Subcategory Slider Styles
  subcatSliderSection: {
    marginTop: 20,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    paddingVertical: 14,
  },
  subcatSliderHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  subcatSliderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  subcatSliderSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  subcatViewAllChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  subcatViewAllText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0066FF',
  },
  subcatTabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  subcatTabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  subcatTabPillActive: {
    backgroundColor: '#0066FF',
    borderColor: '#0066FF',
  },
  subcatTabEmoji: {
    fontSize: 13,
    marginRight: 4,
  },
  subcatTabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  subcatTabLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  horizontalSubcatScroll: {
    paddingHorizontal: 16,
    gap: 12,
    flexDirection: 'row',
  },
  subcatColumn: {
    flexDirection: 'column',
    gap: 10,
    justifyContent: 'space-between',
  },
  compactSubcatCard: {
    width: 72,
    alignItems: 'center',
  },
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
});
