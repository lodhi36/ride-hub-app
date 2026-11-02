import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Vibration,
  Platform,
} from 'react-native';
import Icon from '../components/PngIcon';
import api, { UPLOADS_URL } from '../services/api';
import { CartService } from '../services/CartService';
import { useSocket } from '../context/SocketContext';
import { CATEGORY_IMAGES, CATEGORY_ICONS } from '../utils/categoryHelper';
import { LottieAnimation } from '../components/LottieAnimation';
import { useAppLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// In-memory cache to prevent subcategories reload / flickering
const _subcategoriesGeneralCache: Record<string, any[]> = {};

// Fashion subcategory icon assets
const iconTop50 = require('../banner/sub_top50.png');
const iconShirt = require('../banner/sub_shirt.png');
const iconTshirt = require('../banner/sub_tshirt.png');
const iconCasualShoes = require('../banner/sub_casual_shoes.png');
const iconFormalShoes = require('../banner/sub_formal_shoes.png');
const iconKurta = require('../banner/sub_kurta.png');
const iconSaree = require('../banner/sub_saree.png');
const iconKurti = require('../banner/sub_kurti.png');
const iconTops = require('../banner/sub_tops.png');
const iconJeans = require('../banner/sub_jeans.png');

// Subcategory icon resolver
const resolveSubcategoryIcon = (title: string, categoryName: string = '') => {
  const t = (title || '').toLowerCase();
  const c = (categoryName || '').toLowerCase();

  // Fashion specific
  if (t.includes('50') || t.includes('deal')) return { type: 'image', source: iconTop50 };
  if (t.includes('shirt') && !t.includes('t-shirt') && !t.includes('tshirt')) return { type: 'image', source: iconShirt };
  if (t.includes('t-shirt') || t.includes('tshirt') || t.includes('polo')) return { type: 'image', source: iconTshirt };
  if (t.includes('casual shoe') || t.includes('sneaker') || t.includes('daily wear')) return { type: 'image', source: iconCasualShoes };
  if (t.includes('formal shoe') || t.includes('office')) return { type: 'image', source: iconFormalShoes };
  if (t.includes('kurta')) return { type: 'image', source: iconKurta };
  if (t.includes('saree') || t.includes('साड़ी')) return { type: 'image', source: iconSaree };
  if (t.includes('kurti') || t.includes('कुर्ती')) return { type: 'image', source: iconKurti };
  if (t.includes('top')) return { type: 'image', source: iconTops };
  if (t.includes('jean') || t.includes('denim')) return { type: 'image', source: iconJeans };

  // Food specific
  if (t.includes('biryani') || t.includes('rice')) return { type: 'emoji', value: '🍚' };
  if (t.includes('pizza')) return { type: 'emoji', value: '🍕' };
  if (t.includes('burger') || t.includes('sandwich')) return { type: 'emoji', value: '🍔' };
  if (t.includes('roll') || t.includes('wrap')) return { type: 'emoji', value: '🌯' };
  if (t.includes('thali') || t.includes('combo')) return { type: 'emoji', value: '🍱' };
  if (t.includes('north indian') || t.includes('curry')) return { type: 'emoji', value: '🍲' };
  if (t.includes('chinese') || t.includes('momo') || t.includes('noodle')) return { type: 'emoji', value: '🥟' };
  if (t.includes('dessert') || t.includes('shake') || t.includes('sweet') || t.includes('cake')) return { type: 'emoji', value: '🍨' };
  if (t.includes('snack') || t.includes('starter') || t.includes('chaat') || t.includes('fry')) return { type: 'emoji', value: '🍟' };

  // Kirana / Grocery specific
  if (t.includes('atta') || t.includes('flour') || t.includes('grain')) return { type: 'emoji', value: '🌾' };
  if (t.includes('dal') || t.includes('pulse')) return { type: 'emoji', value: '🥣' };
  if (t.includes('dairy') || t.includes('milk') || t.includes('egg') || t.includes('dahi')) return { type: 'emoji', value: '🥛' };
  if (t.includes('oil') || t.includes('ghee')) return { type: 'emoji', value: '🛢️' };
  if (t.includes('masala') || t.includes('spice')) return { type: 'emoji', value: '🧂' };
  if (t.includes('tea') || t.includes('coffee')) return { type: 'emoji', value: '☕' };
  if (t.includes('biscuit') || t.includes('cookie') || t.includes('namkeen')) return { type: 'emoji', value: '🍪' };
  if (t.includes('clean') || t.includes('household') || t.includes('detergent')) return { type: 'emoji', value: '🧼' };

  // Vegetables & Fruits specific
  if (t.includes('vegetable') || t.includes('sabzi')) return { type: 'emoji', value: '🥦' };
  if (t.includes('fruit') || t.includes('fal')) return { type: 'emoji', value: '🍎' };
  if (t.includes('herb') || t.includes('organic') || t.includes('green')) return { type: 'emoji', value: '🌿' };
  if (t.includes('exotic') || t.includes('avocado')) return { type: 'emoji', value: '🥑' };
  if (t.includes('potato') || t.includes('onion') || t.includes('garlic') || t.includes('aaloo')) return { type: 'emoji', value: '🥔' };
  if (t.includes('seasonal')) return { type: 'emoji', value: '🥭' };

  // Beauty & Personal Care specific
  if (t.includes('skin') || t.includes('cream') || t.includes('lotion')) return { type: 'emoji', value: '🧴' };
  if (t.includes('hair') || t.includes('shampoo')) return { type: 'emoji', value: '💇' };
  if (t.includes('bath') || t.includes('body') || t.includes('soap')) return { type: 'emoji', value: '🧼' };
  if (t.includes('makeup') || t.includes('lipstick') || t.includes('cosmetic')) return { type: 'emoji', value: '💄' };
  if (t.includes('fragrance') || t.includes('perfume') || t.includes('deo')) return { type: 'emoji', value: '✨' };
  if (t.includes('grooming') || t.includes('shave') || t.includes('razor')) return { type: 'emoji', value: '🪒' };

  // Toys & Kids specific
  if (t.includes('toy') || t.includes('game')) return { type: 'emoji', value: '🧸' };
  if (t.includes('baby') || t.includes('diaper')) return { type: 'emoji', value: '👶' };
  if (t.includes('feed') || t.includes('nursing')) return { type: 'emoji', value: '🍼' };
  if (t.includes('school') || t.includes('stationery') || t.includes('supply')) return { type: 'emoji', value: '🎒' };
  if (t.includes('kid')) return { type: 'emoji', value: '🎈' };

  // Electronics & Mobile specific
  if (t.includes('phone') || t.includes('mobile')) return { type: 'emoji', value: '📱' };
  if (t.includes('accessory') || t.includes('headphone') || t.includes('earbud')) return { type: 'emoji', value: '🎧' };
  if (t.includes('electronic') || t.includes('gadget') || t.includes('laptop')) return { type: 'emoji', value: '💻' };
  if (t.includes('charger') || t.includes('cable') || t.includes('power')) return { type: 'emoji', value: '🔋' };

  // Fallbacks by Category
  if (c.includes('food')) return { type: 'emoji', value: '🍽️' };
  if (c.includes('kirana') || c.includes('grocery')) return { type: 'emoji', value: '🛒' };
  if (c.includes('veg') || c.includes('fruit')) return { type: 'emoji', value: '🥦' };
  if (c.includes('beauty')) return { type: 'emoji', value: '💄' };
  if (c.includes('toy')) return { type: 'emoji', value: '🧸' };
  if (c.includes('electronic')) return { type: 'emoji', value: '📱' };

  return { type: 'emoji', value: '✨' };
};

// Products catalog loaded directly from backend store menu
const CATEGORY_DEFAULT_PRODUCTS: Record<string, any[]> = {
  food: [],
  kirana: [],
  vegetables: [],
  beauty: [],
  toys: [],
  electronics: [],
  fashion: [],
};

const resolveFullUrl = (u?: string) => {
  if (!u || !u.trim()) return '';
  if (u.startsWith('http') || u.startsWith('data:')) return u;
  const clean = u.replace(/^\/?(api\/)?(uploads\/)?/, '');
  return `${UPLOADS_URL}/${clean}`;
};

export default function SubcategoriesScreen({ route, navigation }: any) {
  const { selectedCategory, categoryId, categoryName: routeCatName, customerCoords } = route?.params || {};
  const { socket } = useSocket();
  const { t, isHindi } = useAppLanguage();

  // Normalize category identity
  const categoryIdentifier = useMemo(() => {

  return (
      categoryId ||
      selectedCategory?._id ||
      selectedCategory?.id ||
      routeCatName ||
      selectedCategory?.name ||
      'food'
    );
  }, [categoryId, selectedCategory, routeCatName]);

  const categoryTitle = useMemo(() => {
    const raw = routeCatName || selectedCategory?.name || selectedCategory?.title || 'Category';
    return String(raw).charAt(0).toUpperCase() + String(raw).slice(1);
  }, [routeCatName, selectedCategory]);

  const cleanCategoryKey = useMemo(() => {
    const t = categoryTitle.toLowerCase();
    if (t.includes('food') || t.includes('rest') || t.includes('खाना')) return 'food';
    if (t.includes('kirana') || t.includes('groc') || t.includes('किराना')) return 'kirana';
    if (t.includes('veg') || t.includes('fruit') || t.includes('सब्जी')) return 'vegetables';
    if (t.includes('beauty') || t.includes('personal') || t.includes('सुंदरता')) return 'beauty';
    if (t.includes('toy') || t.includes('kid') || t.includes('खिलौने')) return 'toys';
    if (t.includes('elect') || t.includes('mobile')) return 'electronics';
    if (t.includes('fashion') || t.includes('cloth') || t.includes('फैशन')) return 'fashion';
    return 'food';
  }, [categoryTitle]);

  const isKirana = useMemo(() => {
    return cleanCategoryKey === 'kirana' ||
      String(routeCatName || '').toLowerCase().includes('kirana') ||
      String(selectedCategory?.name || '').toLowerCase().includes('kirana') ||
      String(routeCatName || '').toLowerCase().includes('grocery') ||
      String(selectedCategory?.name || '').toLowerCase().includes('grocery');
  }, [cleanCategoryKey, routeCatName, selectedCategory]);

  // Theme
  const { isDark, currentColors } = useTheme('customer');

  // States
  const cachedInitialSubs = _subcategoriesGeneralCache[categoryIdentifier] || selectedCategory?.subcategories || [];
  const [subcategories, setSubcategories] = useState<any[]>(cachedInitialSubs);
  const [loading, setLoading] = useState<boolean>(cachedInitialSubs.length === 0);
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchVisible, setIsSearchVisible] = useState<boolean>(false);
  const [categoryBanners, setCategoryBanners] = useState<any[]>([]);
  const [bannerActiveIndex, setBannerActiveIndex] = useState<number>(0);
  const bannerScrollRef = React.useRef<ScrollView>(null);
  const [adminBannerUrl, setAdminBannerUrl] = useState<string | null>(null);
  const [bannerAspectRatio, setBannerAspectRatio] = useState<number>(2.27);
  const [adminLottieConfig, setAdminLottieConfig] = useState<any>(null);
  const [displayMode, setDisplayMode] = useState<'IMAGE' | 'LOTTIE' | 'BOTH'>('BOTH');
  const [products, setProducts] = useState<any[]>([]);
  const [supplierData, setSupplierData] = useState<any>(null);

  // Cart synchronization
  const [cartCount, setCartCount] = useState<number>(() => CartService.getCartCount());
  const [cartQuantities, setCartQuantities] = useState<{ [id: string]: number }>({});

  useEffect(() => {
    const syncCart = (cartState: any) => {
      setCartCount(cartState.count || 0);
      const qMap: { [id: string]: number } = {};
      for (const [k, v] of Object.entries(cartState.items || {})) {
        if (v && (v as any).quantity > 0) {
          qMap[k] = (v as any).quantity;
        }
      }
      setCartQuantities(qMap);
    };

    syncCart(CartService.getCart());
    const unsub = CartService.subscribe(syncCart);
    return unsub;
  }, []);

  // Fetch Admin Banner & Lottie Animation for this specific category (Food, Vegetables, Kirana, Beauty, Toys)
  const fetchCategoryBanner = useCallback(async () => {
    try {
      let mainImgUrl: string | null = null;
      let lottieCfg: any = null;
      let dMode: 'IMAGE' | 'LOTTIE' | 'BOTH' = 'IMAGE';
      const allBanners: any[] = [];

      const resolveFullUrl = (u?: string) => {
        if (!u || !u.trim()) return '';
        if (u.startsWith('http') || u.startsWith('data:')) return u;
        const clean = u.replace(/^\/?(api\/)?(uploads\/)?/, '');
        return `${UPLOADS_URL}/${clean}`;
      };

      // 1. Fetch /banner collection for this category as primary authoritative source
      const bannerTarget = categoryTitle.toUpperCase().replace(/\s+/g, '_');
      const res = await api.get(`/banner?target=${bannerTarget}&status=Active`).catch(() => null);
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
      const screenRes = await api.get(`/screen-media/target/${cleanCategoryKey}`).catch(() => null);
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
            let directJson = sc.lottieConfig?.rawJson || null;
            if (!directJson && lottie) {
              try {
                const lRes = await fetch(lottie);
                if (lRes.ok) {
                  const parsed = await lRes.json();
                  if (parsed && (parsed.v || parsed.layers)) {
                    directJson = parsed;
                  }
                }
              } catch (_) {}
            }

            lottieCfg = {
              source: directJson || (lottie ? { uri: lottie } : null),
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

      setCategoryBanners(allBanners);
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
      setCategoryBanners([]);
      setAdminBannerUrl(null);
      setAdminLottieConfig(null);
    }
  }, [categoryTitle, cleanCategoryKey]);

  // Auto-slide banner carousel every 3.5s when multiple real banners exist
  useEffect(() => {
    if (categoryBanners.length <= 1) return;
    const timer = setInterval(() => {
      setBannerActiveIndex((prev) => {
        const next = (prev + 1) % categoryBanners.length;
        bannerScrollRef.current?.scrollTo({ x: next * (SCREEN_WIDTH - 24), animated: true });
        return next;
      });
    }, 3500);
    return () => clearInterval(timer);
  }, [categoryBanners.length]);

  // Fetch Category & Subcategories from Backend API
  const fetchCategoryDetails = useCallback(async () => {
    try {
      if (!_subcategoriesGeneralCache[categoryIdentifier]) {
        setLoading(true);
      }
      const res = await api.get(`/categories/${categoryIdentifier}`).catch(() => null);
      if (res?.data?.success && res.data.category) {
        const activeSubs = (res.data.subcategories || res.data.category?.subcategories || []).filter(
          (s: any) => s.isActive !== false
        );
        _subcategoriesGeneralCache[categoryIdentifier] = activeSubs;
        setSubcategories(activeSubs);
      } else if (selectedCategory?.subcategories && selectedCategory.subcategories.length > 0) {
        const activeSubs = selectedCategory.subcategories.filter((s: any) => s.isActive !== false);
        _subcategoriesGeneralCache[categoryIdentifier] = activeSubs;
        setSubcategories(activeSubs);
      }
    } catch (err) {
      console.log('[SubcategoriesScreen] Error fetching category details:', err);
    } finally {
      setLoading(false);
    }
  }, [categoryIdentifier, selectedCategory]);

  // Fetch Online Store and Products for this Category
  const fetchCategoryProducts = useCallback(async () => {
    try {
      const coordsParams =
        customerCoords?.latitude && customerCoords?.longitude
          ? `?lat=${customerCoords.latitude}&lng=${customerCoords.longitude}&radius=5.0`
          : '';
      const restoRes = await api.get(`/restaurants/online${coordsParams}`).catch(() => null);
      let catStore: any = null;
      if (restoRes?.data?.restaurants && Array.isArray(restoRes.data.restaurants)) {
        catStore = restoRes.data.restaurants.find((r: any) => {
          const cName = (r.categoryName || r.name || r.restaurantName || r.businessCategoryName || '').toLowerCase();
          return cName.includes(cleanCategoryKey) || cName.includes(categoryTitle.toLowerCase());
        });
      }

      if (!catStore) {
        setSupplierData(null);
        setProducts([]);
        return;
      }

      const storeId = catStore._id;
      setSupplierData(catStore);

      // Try fetching backend store menu
      const menuRes = await api.get(`/menu/${storeId}?forCustomer=true`).catch(() => null);
      const beItems: any[] = [];
      if (menuRes?.data?.success && Array.isArray(menuRes.data.items) && menuRes.data.items.length > 0) {
        menuRes.data.items.forEach((it: any) => {
          beItems.push({
            ...it,
            _id: it._id || it.id,
            id: it._id || it.id,
            rating: it.rating || 4.3,
            mrp: it.mrp || Math.round(Number(it.price || 199) * 2.2),
            restaurantId: storeId,
          });
        });
      }

      setProducts(beItems);
    } catch (e) {
      console.log('[SubcategoriesScreen] Error fetching products:', e);
      setProducts([]);
      setSupplierData(null);
    }
  }, [cleanCategoryKey, categoryTitle, customerCoords?.latitude, customerCoords?.longitude]);

  useEffect(() => {
    fetchCategoryBanner();
    fetchCategoryDetails();
    fetchCategoryProducts();
  }, [fetchCategoryBanner, fetchCategoryDetails, fetchCategoryProducts]);

  // Real-time socket updates for subcategories, screen media and banner
  useEffect(() => {
    if (!socket) return;

    const onBannerChange = (b: any) => {
      const target = String(b?.target || '').toUpperCase();
      if (
        target === categoryTitle.toUpperCase() ||
        target.includes(cleanCategoryKey.toUpperCase()) ||
        target === 'ALL' ||
        target === 'SUBCATEGORY'
      ) {
        fetchCategoryBanner();
      }
    };

    const onScreenMediaUpdate = (data: any) => {
      const sid = String(data?.screenId || '').toLowerCase();
      if (
        sid.includes(cleanCategoryKey) ||
        sid.includes(categoryTitle.toLowerCase()) ||
        sid === 'category_images'
      ) {
        fetchCategoryBanner();
      }
    };

    const onCategoryChange = (catData: any) => {
      const changedId = String(catData?._id || catData?.categoryId || '');
      const changedName = String(catData?.name || '').toLowerCase();
      if (
        changedId === String(categoryIdentifier) ||
        changedName.includes(categoryTitle.toLowerCase()) ||
        categoryTitle.toLowerCase().includes(changedName)
      ) {
        fetchCategoryDetails();
      }
    };

    socket.on('banner_created', onBannerChange);
    socket.on('banner_updated', onBannerChange);
    socket.on('screen_media_updated', onScreenMediaUpdate);
    socket.on('category_updated', onCategoryChange);
    socket.on('subcategories_updated', onCategoryChange);
    socket.on('categories_updated', onCategoryChange);
    socket.on('fashion_subcategories_updated', onCategoryChange);

    return () => {
      socket.off('banner_created', onBannerChange);
      socket.off('banner_updated', onBannerChange);
      socket.off('screen_media_updated', onScreenMediaUpdate);
      socket.off('category_updated', onCategoryChange);
      socket.off('subcategories_updated', onCategoryChange);
      socket.off('categories_updated', onCategoryChange);
      socket.off('fashion_subcategories_updated', onCategoryChange);
    };
  }, [socket, categoryIdentifier, categoryTitle, cleanCategoryKey, fetchCategoryBanner, fetchCategoryDetails]);

  // Subcategories split into Row 1 & Row 2
  const { subcategoriesRow1, subcategoriesRow2 } = useMemo(() => {
    const active = subcategories.filter((s) => s.isActive !== false);
    const half = Math.ceil(active.length / 2);
    return {
      subcategoriesRow1: active.slice(0, half),
      subcategoriesRow2: active.slice(half),
    };
  }, [subcategories]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchesName = p.name && p.name.toLowerCase().includes(query);
        const matchesCat = p.category && p.category.toLowerCase().includes(query);
        const matchesBrand = p.brand && p.brand.toLowerCase().includes(query);
        const matchesDesc = p.description && p.description.toLowerCase().includes(query);
        if (!matchesName && !matchesCat && !matchesBrand && !matchesDesc) return false;
      }

      if (activeFilter !== 'ALL') {
        const matchesCategory =
          (p.category && p.category.toLowerCase().includes(activeFilter.toLowerCase())) ||
          (p.name && p.name.toLowerCase().includes(activeFilter.toLowerCase()));
        if (!matchesCategory) return false;
      }

      return true;
    });
  }, [products, searchQuery, activeFilter]);

  // Add to cart handler
  const handleAddToCart = (product: any) => {
    const targetStore = supplierData || {
      _id: '6ac8693de868a5421c3d7f7d',
      name: `${categoryTitle} Store`,
      restaurantName: `${categoryTitle} Store`,
      categoryName: categoryTitle,
      restaurant_status: 'online',
      isOnline: true,
    };

    const storeId = String(targetStore._id || '6ac8693de868a5421c3d7f7d');
    const result = CartService.addItem(storeId, targetStore, product, 1, false);

    if (result.conflict) {
      CartService.addItem(storeId, targetStore, product, 1, true);
    }

    try {
      Vibration.vibrate([0, 50, 40, 70]);
    } catch (_) {}
  };

  // Navigate to Product Listing Screen
  const openProductListing = (params: { subcategory?: string; query?: string }) => {
    navigation.navigate('ProductListingScreen', {
      category: categoryTitle,
      subCategory: params.subcategory || categoryTitle,
      query: params.query || params.subcategory || '',
      restaurantId: supplierData?._id,
      customerCoords,
    });
  };

  // Render Subcategory Chip (Row 1 & Row 2)
  const renderSubcatItem = (item: any) => {
    const isSelected = activeFilter === item.name;
    const resolvedIcon = resolveSubcategoryIcon(item.name, categoryTitle);

    return (
      <TouchableOpacity
        key={String(item._id || item.id || item.name)}
        style={[styles.subcatCard, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }, isSelected && styles.subcatCardActive]}
        activeOpacity={0.8}
        onPress={() => {
          if (activeFilter === item.name) {
            setActiveFilter('ALL');
          } else {
            setActiveFilter(item.name);
          }
        }}
      >
        <View style={[styles.subcatIconWrap, isDark && { backgroundColor: '#0F172A' }, isSelected && styles.subcatIconWrapActive]}>
          {item.image ? (
            <Image
              source={{ uri: resolveFullUrl(item.image) }}
              style={styles.subcatIconImg}
              resizeMode="cover"
            />
          ) : resolvedIcon.type === 'image' ? (
            <Image source={resolvedIcon.source} style={styles.subcatIconImg} resizeMode="contain" />
          ) : (
            <Text style={styles.subcatEmojiText}>{resolvedIcon.value}</Text>
          )}
        </View>
        <Text style={[styles.subcatTitleText, isDark && { color: '#F8FAFC' }, isSelected && styles.subcatTitleTextActive]} numberOfLines={1}>
          {item.name}
        </Text>
        {item.description ? (
          <Text style={styles.subcatSubText} numberOfLines={1}>
            {item.description}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
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
          <View>
            <Text style={[styles.headerTitle, isDark && { color: '#F8FAFC' }]}>{categoryTitle}</Text>
            <Text style={[styles.headerSub, isDark && { color: '#94A3B8' }]}>Explore Subcategories</Text>
          </View>
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
            placeholder={`Search ${categoryTitle}...`}
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={() => openProductListing({ query: searchQuery })}
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
        contentContainerStyle={{ paddingBottom: 16 }}
      >
        {/* 2. DYNAMIC HERO PROMOTIONAL BANNER & ANIMATION (Admin Managed - Real Data Only) */}
        {(categoryBanners.length > 0 || adminLottieConfig?.source || adminBannerUrl) ? (
          <View style={[styles.bannerContainer, { height: bannerHeight }]}>
            {adminLottieConfig?.source && (displayMode === 'LOTTIE' || (!adminBannerUrl && categoryBanners.length === 0)) ? (
              <View style={[styles.heroLottieWrap, isKirana && { paddingTop: 0 }]}>
                <View style={isKirana ? styles.kiranaLottieOverlay : undefined}>
                  <LottieAnimation
                    source={adminLottieConfig.source}
                    width={isKirana ? "80%" : "100%"}
                    height={(SCREEN_WIDTH - 24) * (isKirana ? 0.38 : 0.44)}
                    speed={adminLottieConfig.speed || 1.0}
                    loop={adminLottieConfig.loop !== false}
                    autoplay={adminLottieConfig.autoplay !== false}
                  />
                </View>
              </View>
            ) : categoryBanners.length > 1 ? (
              <View style={{ width: '100%', height: '100%', position: 'relative' }}>
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
                  {categoryBanners.map((banner, bIdx) => (
                    <View key={banner.id || bIdx} style={{ width: SCREEN_WIDTH - 24, height: bannerHeight, borderRadius: 16, overflow: 'hidden' }}>
                      <Image source={{ uri: banner.imageUrl }} style={styles.heroBannerImage} resizeMode="cover" />
                    </View>
                  ))}
                </ScrollView>
                <View style={styles.bannerDotsRow}>
                  {categoryBanners.map((_, dotIdx) => (
                    <View
                      key={dotIdx}
                      style={[
                        styles.bannerDot,
                        bannerActiveIndex === dotIdx && styles.bannerDotActive,
                      ]}
                    />
                  ))}
                </View>
                {adminLottieConfig?.source && displayMode === 'BOTH' && (
                  <View
                    style={[
                      styles.heroLottieOverlay,
                      isKirana && styles.kiranaLottieOverlay,
                    ]}
                    pointerEvents="none"
                  >
                    <LottieAnimation
                      source={adminLottieConfig.source}
                      width={isKirana ? "80%" : "100%"}
                      height={(SCREEN_WIDTH - 24) * (isKirana ? 0.38 : 0.44)}
                      speed={adminLottieConfig.speed || 1.0}
                      loop={adminLottieConfig.loop !== false}
                      autoplay={adminLottieConfig.autoplay !== false}
                    />
                  </View>
                )}
              </View>
            ) : adminLottieConfig?.source && displayMode === 'BOTH' ? (
              <View style={styles.heroCombinedWrap}>
                <Image
                  source={{ uri: adminBannerUrl || categoryBanners[0]?.imageUrl }}
                  style={styles.heroBannerImage}
                  resizeMode="cover"
                />
                <View
                  style={[
                    styles.heroLottieOverlay,
                    isKirana && styles.kiranaLottieOverlay,
                  ]}
                  pointerEvents="none"
                >
                  <LottieAnimation
                    source={adminLottieConfig.source}
                    width={isKirana ? "80%" : "100%"}
                    height={(SCREEN_WIDTH - 24) * (isKirana ? 0.38 : 0.44)}
                    speed={adminLottieConfig.speed || 1.0}
                    loop={adminLottieConfig.loop !== false}
                    autoplay={adminLottieConfig.autoplay !== false}
                  />
                </View>
              </View>
            ) : (adminBannerUrl || categoryBanners.length > 0) ? (
              <Image
                source={{ uri: adminBannerUrl || categoryBanners[0]?.imageUrl }}
                style={styles.heroBannerImage}
                resizeMode="cover"
              />
            ) : null}
          </View>
        ) : null}

        {/* 3. DYNAMIC SUBCATEGORIES ROWS (Row 1 & Row 2 layout) */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color="#0066FF" />
            <Text style={styles.loadingText}>Loading {categoryTitle} subcategories...</Text>
          </View>
        ) : subcategories.length === 0 ? (
          /* CLEAN EMPTY STATE IF NO ACTIVE SUBCATEGORIES */
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Text style={{ fontSize: 36 }}>{CATEGORY_ICONS[cleanCategoryKey] || '📦'}</Text>
            </View>
            <Text style={styles.emptyTitle}>No Subcategories Available Yet</Text>
            <Text style={styles.emptyText}>
              Subcategories for {categoryTitle} are currently being configured by the admin. Please check back soon!
            </Text>
            <TouchableOpacity
              style={styles.browseOtherBtn}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('CategoriesScreen')}
            >
              <Text style={styles.browseOtherBtnText}>Explore Other Categories</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.subcatsSection}>
            <View style={styles.subcatsHeaderRow}>
              <Text style={styles.subcatsSectionTitle}>Subcategories</Text>
              {activeFilter !== 'ALL' && (
                <TouchableOpacity onPress={() => setActiveFilter('ALL')}>
                  <Text style={styles.clearFilterText}>Show All ({activeFilter} ✕)</Text>
                </TouchableOpacity>
              )}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subcatsRowScroll}>
              {subcategoriesRow1.map(renderSubcatItem)}
            </ScrollView>
            {subcategoriesRow2.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[styles.subcatsRowScroll, { marginTop: 12 }]}
              >
                {subcategoriesRow2.map(renderSubcatItem)}
              </ScrollView>
            )}
          </View>
        )}

        {/* 4. PRODUCTS GRID SECTION (Flipkart / Fashion Style with Ratings, MRP & Add to Cart) */}
        <View style={styles.productsSection}>
          <View style={styles.productsHeaderRow}>
            <View>
              <Text style={styles.productsSectionTitle}>
                {activeFilter !== 'ALL' ? activeFilter : `Top ${categoryTitle} Deals`}
              </Text>
              <Text style={styles.productsSectionSub}>
                {filteredProducts.length} items available in your area
              </Text>
            </View>

            <TouchableOpacity
              style={styles.rightCircleActionBtn}
              activeOpacity={0.7}
              onPress={() => openProductListing({ subcategory: activeFilter !== 'ALL' ? activeFilter : '' })}
            >
              <Text style={styles.rightArrowGlyph}>›</Text>
            </TouchableOpacity>
          </View>

          {filteredProducts.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Icon name="cube-outline" size={48} color="#94A3B8" />
              <Text style={styles.emptyWrapTitle}>
                {t('empty.no_items', 'No items available in this category')}
              </Text>
              <Text style={styles.emptyWrapSub}>
                {searchQuery || activeFilter !== 'ALL'
                  ? (isHindi ? 'फ़िल्टर के अनुसार कोई आइटम नहीं मिला। सभी आइटम देखने के लिए नीचे टैप करें।' : 'No items match your filter. Tap below to show all products.')
                  : t('empty.no_items_sub', 'Currently, no stores have listed items in this category. Please check back later.')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
                <TouchableOpacity
                  style={[styles.resetFilterBtn, { backgroundColor: '#0066FF' }]}
                  onPress={() => navigation.navigate('CustomerHomeScreen')}
                >
                  <Text style={[styles.resetFilterBtnText, { color: '#FFFFFF' }]}>
                    {isHindi ? '‹ अन्य श्रेणियां देखें' : '‹ Explore Categories'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.resetFilterBtn}
                  onPress={() => {
                    if (searchQuery || activeFilter !== 'ALL') {
                      setActiveFilter('ALL');
                      setSearchQuery('');
                    } else {
                      fetchCategoryProducts();
                    }
                  }}
                >
                  <Text style={styles.resetFilterBtnText}>
                    {searchQuery || activeFilter !== 'ALL'
                      ? (isHindi ? 'सभी आइटम दिखाएं' : 'Show All Items')
                      : (isHindi ? '↻ पुनः लोड करें' : '↻ Refresh')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.productGrid}>
              {filteredProducts.map((prod) => {
                const qtyInCart = cartQuantities[prod._id || prod.id] || 0;
                const discountPct = Math.round(((prod.mrp - prod.price) / prod.mrp) * 100);

                // Match subcategory for fallback image and badge
                const matchingSubcat = subcategories.find(
                  (s: any) =>
                    s.name &&
                    (s.name.toLowerCase() === (prod.subcategory || '').toLowerCase() ||
                     s.name.toLowerCase() === (prod.category || '').toLowerCase() ||
                     (prod.name || '').toLowerCase().includes(s.name.toLowerCase()))
                );
                const isDummyUrl = (u?: string | null) => {
                  if (!u || typeof u !== 'string') return true;
                  const l = u.toLowerCase();
                  return (
                    l.includes('unsplash.com') ||
                    l.includes('placeholder') ||
                    l.includes('dummyimage') ||
                    l.includes('picsum.photos') ||
                    l.includes('sample') ||
                    l.includes('lorem')
                  );
                };
                const rawProdImg = prod.image && !isDummyUrl(prod.image) ? prod.image : null;
                const subcatImg = matchingSubcat?.image && !isDummyUrl(matchingSubcat.image) ? matchingSubcat.image : null;
                const displayImgUri = rawProdImg ? resolveFullUrl(rawProdImg) : (subcatImg ? resolveFullUrl(subcatImg) : null);

                return (
                  <View key={prod._id || prod.id} style={styles.productCard}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => {
                        navigation.navigate('ItemDetailsScreen', {
                          item: prod,
                          restaurant: supplierData,
                          restaurantId: supplierData?._id,
                          customerCoords,
                        });
                      }}
                    >
                      {/* Product Image - ONLY rendered when real image is uploaded by Admin / Merchant */}
                      {displayImgUri ? (
                        <View style={styles.productImgContainer}>
                          <Image
                            source={{ uri: displayImgUri }}
                            style={styles.productImg}
                            resizeMode="cover"
                          />
                          {/* Rating Badge */}
                          <View style={styles.ratingBadge}>
                            <Text style={styles.ratingBadgeText}>{prod.rating || 4.2} ★</Text>
                          </View>
                        </View>
                      ) : null}

                      {/* Product Info */}
                      <View style={styles.productInfo}>
                        <View style={styles.productBrandRow}>
                          <Text style={styles.productBrandName} numberOfLines={1}>
                            {prod.brand || prod.category || categoryTitle}
                          </Text>
                          {!displayImgUri && (
                            <View style={[styles.ratingBadge, { position: 'relative', top: 0, left: 0 }]}>
                              <Text style={styles.ratingBadgeText}>{prod.rating || 4.2} ★</Text>
                            </View>
                          )}
                          {matchingSubcat?.image ? (
                            <View style={styles.subcatPillBadge}>
                              <Image
                                source={{ uri: resolveFullUrl(matchingSubcat.image) }}
                                style={styles.subcatPillImg}
                                resizeMode="cover"
                              />
                              <Text style={styles.subcatPillText} numberOfLines={1}>
                                {matchingSubcat.name}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.productTitle} numberOfLines={2}>
                          {prod.name}
                        </Text>

                        {/* Price Details */}
                        <View style={styles.priceRow}>
                          <Text style={styles.currentPrice}>₹{prod.price}</Text>
                          <Text style={styles.mrpText}>₹{prod.mrp}</Text>
                          {discountPct > 0 && (
                            <Text style={styles.discountText}>{discountPct}% off</Text>
                          )}
                        </View>

                        <Text style={styles.deliveryBadgeText}>⚡ Free Fast Delivery</Text>
                      </View>
                    </TouchableOpacity>

                    {/* Add to Cart Button */}
                    <View style={styles.cardActionRow}>
                      <TouchableOpacity
                        style={[styles.addToCartBtn, qtyInCart > 0 && styles.addToCartBtnAdded]}
                        activeOpacity={0.8}
                        onPress={() => handleAddToCart(prod)}
                      >
                        <Text style={[styles.addToCartText, qtyInCart > 0 && styles.addToCartTextAdded]}>
                          {qtyInCart > 0 ? `ADDED (${qtyInCart}) ✓` : 'ADD +'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* 5. BOTTOM NAVIGATION BAR - Standard Customer 4-Tab Navigation */}
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
    marginRight: 10,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backChevronGlyph: {
    fontSize: 30,
    lineHeight: 32,
    color: '#0F172A',
    fontWeight: '300',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  headerSub: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerIconBtn: {
    padding: 4,
    position: 'relative',
  },
  cartBadge: {
    position: 'absolute',
    top: -3,
    right: -6,
    backgroundColor: '#EF4444',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    marginHorizontal: 14,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: 0,
  },
  bannerContainer: {
    width: SCREEN_WIDTH - 24,
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  heroBannerImage: {
    width: SCREEN_WIDTH - 24,
    height: (SCREEN_WIDTH - 24) * 0.52,
  },
  heroLottieWrap: {
    width: SCREEN_WIDTH - 24,
    height: (SCREEN_WIDTH - 24) * 0.52,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroCombinedWrap: {
    position: 'relative',
    width: SCREEN_WIDTH - 24,
    height: (SCREEN_WIDTH - 24) * 0.52,
  },
  heroLottieOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kiranaLottieOverlay: {
    top: -16,
    bottom: 16,
  },
  subcatsSection: {
    marginTop: 16,
  },
  subcatsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  subcatsSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  clearFilterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0066FF',
  },
  subcatsRowScroll: {
    paddingHorizontal: 12,
    gap: 10,
  },
  subcatCard: {
    alignItems: 'center',
    width: 78,
  },
  subcatCardActive: {
    transform: [{ scale: 1.05 }],
  },
  subcatIconWrap: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  subcatIconWrapActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#0066FF',
    borderWidth: 2,
  },
  subcatIconImg: {
    width: 48,
    height: 48,
  },
  subcatEmojiText: {
    fontSize: 28,
  },
  subcatTitleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
  },
  subcatTitleTextActive: {
    color: '#0066FF',
    fontWeight: '900',
  },
  subcatSubText: {
    fontSize: 9,
    color: '#F59E0B',
    fontWeight: '800',
    marginTop: 1,
  },
  loadingWrap: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748B',
  },
  emptyContainer: {
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    marginHorizontal: 14,
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyIconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  browseOtherBtn: {
    backgroundColor: '#0066FF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  browseOtherBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  productsSection: {
    marginTop: 24,
    paddingHorizontal: 12,
  },
  productsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  productsSectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  productsSectionSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  rightCircleActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightArrowGlyph: {
    fontSize: 22,
    lineHeight: 24,
    color: '#0066FF',
    fontWeight: 'bold',
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  productCard: {
    width: (SCREEN_WIDTH - 34) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  productImgContainer: {
    width: '100%',
    height: 155,
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
  ratingBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: '#16A34A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  ratingBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  productInfo: {
    padding: 10,
  },
  productBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 4,
  },
  productBrandName: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    flex: 1,
  },
  subcatPillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: 3,
    maxWidth: '55%',
    borderWidth: 0.5,
    borderColor: '#BFDBFE',
  },
  subcatPillImg: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  subcatPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  productTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
    lineHeight: 16,
    minHeight: 32,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 6,
  },
  currentPrice: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  mrpText: {
    fontSize: 11,
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  discountText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#16A34A',
  },
  deliveryBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0066FF',
    marginTop: 6,
  },
  cardActionRow: {
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  addToCartBtn: {
    backgroundColor: '#0066FF',
    borderRadius: 10,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addToCartBtnAdded: {
    backgroundColor: '#16A34A',
  },
  addToCartText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  addToCartTextAdded: {
    color: '#FFFFFF',
  },
  emptyWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyWrapTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#64748B',
  },
  emptyWrapSub: {
    marginTop: 4,
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  resetFilterBtn: {
    marginTop: 14,
    backgroundColor: '#0066FF',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 12,
  },
  resetFilterBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  bannerDotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  bannerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
  },
  bannerDotActive: {
    width: 18,
    backgroundColor: '#0066FF',
  },
  bottomNavContainer: {
    height: 58,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: 0,
    borderTopColor: 'transparent',
    elevation: 0,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    paddingBottom: Platform.OS === 'android' ? 6 : 10,
  },
  navTab: {
    alignItems: 'center',
    flex: 1,
  },
  navTabIcon: {
    fontSize: 20,
    color: '#94A3B8',
  },
  navTabLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  tabCartBadge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: '#0066FF',
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
    fontWeight: '800',
  },
});
