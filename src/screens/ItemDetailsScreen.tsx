import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Image,
  StatusBar,
  Dimensions,
  Share,
  Alert,
  Platform,
  Animated,
  Vibration,
} from 'react-native';
import Icon from '../components/PngIcon';
import api, { UPLOADS_URL } from '../services/api';
import { CartService, useCart } from '../services/CartService';
import {
  getActiveDeliveryAddress,
  getCanonicalRestaurantLocation,
  DeliveryAddress,
} from '../services/LocationAddressService';
import AddressSelectionModal from '../components/AddressSelectionModal';
import {
  normalizeCategory,
  getCategoryIcon,
  getCategoryLabel,
  getCategoryPrepTerminology,
} from '../services/CategoryHelper';

const { width, height } = Dimensions.get('window');

// Dynamic auto-adjusting safe top padding across all devices: 10% higher for optimal screen reach
const AUTO_HEADER_PADDING_TOP = Platform.select({
  android: Math.max(StatusBar.currentHeight || 0, 24) + 4,
  ios: Math.round(height * 0.02) + 8,
  default: 36,
});

const ItemDetailsScreen = ({ route, navigation }: any) => {
  const { item, restaurant: passedResto, restaurantId: passedRestoId, customerCoords: passedCoords } =
    route.params || {};

  // Resolve restaurant identity
  const restaurant = passedResto || item?.restaurant || null;
  const restaurantId =
    passedRestoId ||
    restaurant?._id ||
    restaurant?.id ||
    item?.restaurantId ||
    item?.restaurant?._id ||
    item?.restaurant?.id ||
    '';

  // Dynamic Category Resolution strictly from backend item and store data (NEVER default to Food)
  const rawItemCategory =
    (typeof item?.category === 'object' ? item?.category?.name : item?.category) ||
    item?.categoryName ||
    item?.businessCategoryName ||
    (typeof restaurant?.category === 'object' ? restaurant?.category?.name : restaurant?.category) ||
    restaurant?.categoryName ||
    restaurant?.businessCategoryName ||
    restaurant?.businessType ||
    '';

  const canonicalCategory = normalizeCategory(rawItemCategory, 'General Store');
  const isFoodCategory = canonicalCategory === 'Food';
  const categoryIcon = getCategoryIcon(rawItemCategory);
  const categoryLabel = getCategoryLabel(rawItemCategory);
  const prepTerm = getCategoryPrepTerminology(rawItemCategory);
  const itemNameStr = String(item?.name || item?.title || '').toLowerCase();
  const rawCatStr = String(rawItemCategory).toLowerCase();

  // Persistent cart subscription
  const { cartItemCount, addItem } = useCart();

  // Active image index in gallery
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);

  // Quantity stepper
  const [quantity, setQuantity] = useState<number>(1);

  // Wishlist state
  const [isWishlisted, setIsWishlisted] = useState<boolean>(false);

  // Delivery address state
  const [activeAddress, setActiveAddress] = useState<DeliveryAddress | null>(null);
  const [addressModalVisible, setAddressModalVisible] = useState<boolean>(false);

  // Added-to-cart temporary toast state
  const [showAddedToast, setShowAddedToast] = useState<boolean>(false);

  // Scroll offset — only the delivery address bar hides on scroll.
  // The top header (back button + cart icons) ALWAYS stays fixed and visible.
  const scrollY = useRef(new Animated.Value(0)).current;

  // Only address bar slides up (~50px) and fades when user scrolls down
  const addressBarTranslateY = scrollY.interpolate({
    inputRange: [0, 50],
    outputRange: [0, -50],
    extrapolate: 'clamp',
  });

  const addressBarOpacity = scrollY.interpolate({
    inputRange: [0, 40],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // Quantity Plus / Minus spring button animations
  const plusScale = useRef(new Animated.Value(1)).current;
  const minusScale = useRef(new Animated.Value(1)).current;
  const qtyScale = useRef(new Animated.Value(1)).current;

  const animateButton = (val: Animated.Value, fromVal = 0.82) => {
    val.setValue(fromVal);
    Animated.spring(val, {
      toValue: 1,
      friction: 4,
      tension: 65,
      useNativeDriver: true,
    }).start();
  };

  const animateQtyBounce = () => {
    qtyScale.setValue(1.25);
    Animated.spring(qtyScale, {
      toValue: 1,
      friction: 5,
      tension: 50,
      useNativeDriver: true,
    }).start();
  };

  // Load active delivery address
  useEffect(() => {
    let isMounted = true;
    getActiveDeliveryAddress().then((addr) => {
      if (isMounted && addr) {
        setActiveAddress(addr);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Resolve gallery images: STRICTLY only REAL uploaded images of this item!
  // No dummy stock photos, no unsplash, and no mixing in other menu items!
  const galleryImages = useMemo(() => {
    const list: string[] = [];

    const resolveUri = (raw: any): string | null => {
      if (!raw || typeof raw !== 'string' || !raw.trim()) return null;
      if (raw.startsWith('http') || raw.startsWith('data:')) return raw;
      return `${UPLOADS_URL}${raw.replace('/uploads', '')}`;
    };

    // 1. Direct item images array if present
    if (Array.isArray(item?.images) && item.images.length > 0) {
      item.images.forEach((img: any) => {
        const u = resolveUri(img);
        if (u && !list.includes(u)) list.push(u);
      });
    }

    // 2. Direct item photos array if present
    if (Array.isArray(item?.photos) && item.photos.length > 0) {
      item.photos.forEach((img: any) => {
        const u = resolveUri(img);
        if (u && !list.includes(u)) list.push(u);
      });
    }

    // 3. Primary item image
    const primaryUri = resolveUri(item?.image || item?.imageUrl || item?.photo);
    if (primaryUri && !list.includes(primaryUri)) {
      list.unshift(primaryUri);
    }

    return list;
  }, [item]);

  // Automatic slideshow if the item has multiple images (auto-slides every 3.5 seconds)
  useEffect(() => {
    if (galleryImages.length <= 1) return;
    const timer = setInterval(() => {
      setActiveImageIndex((prev) => (prev + 1) % galleryImages.length);
    }, 3500);
    return () => clearInterval(timer);
  }, [galleryImages.length]);

  const activeImageUri = galleryImages[activeImageIndex] || galleryImages[0] || null;

  // Pricing calculations
  const price = Number(item?.rawPrice || item?.price?.toString().replace(/[^0-9.]/g, '') || 0);
  const mrp = Number(item?.mrp) || Math.round(price * 1.25);
  const discountPercent = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;

  // Delivery text calculation
  const canonicalLoc = useMemo(() => {
    return getCanonicalRestaurantLocation(restaurant, passedCoords, 'ItemDetailsScreen');
  }, [restaurant, passedCoords]);

  // Formatted address line
  const deliveryAddressLine = useMemo(() => {
    if (activeAddress) {
      const area = activeAddress.landmark || activeAddress.city || 'Your Location';
      const pin = activeAddress.pincode ? ` - ${activeAddress.pincode}` : '';
      return `${area}${pin}`;
    }
    return 'Bhopal - Set Location';
  }, [activeAddress]);

  // Wishlist toggle
  const toggleWishlist = () => {
    const next = !isWishlisted;
    setIsWishlisted(next);
    if (next) {
      Alert.alert('Saved to Wishlist ❤️', `"${item?.name}" has been saved to your wishlist.`);
    }
  };

  // Share dish
  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out "${item?.name}" on Ride Hub! Price: ₹${price}. Order now!`,
      });
    } catch (e) {
      console.warn('Share error:', e);
    }
  };

  // Stepper handlers with spring bounce animation & tactile feedback
  const handleDecreaseQty = () => {
    if (quantity > 1) {
      animateButton(minusScale, 0.82);
      animateQtyBounce();
      try { Vibration.vibrate(15); } catch (_) {}
      setQuantity((prev) => prev - 1);
    }
  };

  const handleIncreaseQty = () => {
    animateButton(plusScale, 1.22);
    animateQtyBounce();
    try { Vibration.vibrate(15); } catch (_) {}
    setQuantity((prev) => prev + 1);
  };

  // Add to Cart handler (saves complete item image and details)
  const handleAddToCart = () => {
    if (!restaurantId) {
      Alert.alert('Error', 'Unable to identify store. Please try again.');
      return;
    }
    const resolvedItem = {
      ...item,
      id: String(item?._id || item?.id || `item_${Date.now()}`),
      itemId: String(item?._id || item?.id || `item_${Date.now()}`),
      name: item?.name || item?.title || 'Product',
      price: price,
      rawPrice: price,
      image: activeImageUri || item?.image || item?.imageUrl || '',
      imageUrl: activeImageUri || item?.image || item?.imageUrl || '',
      isVeg: item?.isVeg !== false,
      description: item?.description || '',
    };
    addItem(restaurantId, restaurant, resolvedItem, quantity);
    setShowAddedToast(true);
    setTimeout(() => {
      setShowAddedToast(false);
    }, 2500);
  };

  // Buy Now handler (saves complete item image and details and opens Cart)
  const handleBuyNow = () => {
    if (!restaurantId) {
      Alert.alert('Error', 'Unable to identify store. Please try again.');
      return;
    }
    const resolvedItem = {
      ...item,
      id: String(item?._id || item?.id || `item_${Date.now()}`),
      itemId: String(item?._id || item?.id || `item_${Date.now()}`),
      name: item?.name || item?.title || 'Product',
      price: price,
      rawPrice: price,
      image: activeImageUri || item?.image || item?.imageUrl || '',
      imageUrl: activeImageUri || item?.image || item?.imageUrl || '',
      isVeg: item?.isVeg !== false,
      description: item?.description || '',
    };
    addItem(restaurantId, restaurant, resolvedItem, quantity);
    navigation.navigate('CartScreen', {
      restaurantId,
      restaurant,
      customerCoords: passedCoords,
    });
  };

  // Missing/Invalid Item State Handling (Requirement 1)
  if (!item || (!item.name && !item.title)) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <StatusBar backgroundColor="#0066FF" barStyle="light-content" />
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <Text style={{ fontSize: 40 }}>📦</Text>
        </View>
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#0F172A', marginBottom: 8, textAlign: 'center' }}>
          Item Information is Unavailable
        </Text>
        <Text style={{ fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22, marginBottom: 24, paddingHorizontal: 16 }}>
          This item details could not be loaded from the store. Please try choosing another item.
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: '#0066FF', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, elevation: 3 }}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15 }}>← Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#0066FF" barStyle="light-content" />

      {/* ============================================================ */}
      {/* 1. FIXED TOP HEADER — always visible, never hides            */}
      {/* (Back button + Wishlist + Cart icons stay fixed at top)      */}
      {/* ============================================================ */}
      <View style={styles.collapsibleHeaderContainer}>
        <View style={styles.topHeader}>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Icon name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerRightActions}>
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={toggleWishlist}
              activeOpacity={0.8}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Image
                source={require('../assets/icons/best_wishlist.png')}
                style={{ width: 22, height: 22 }}
                resizeMode="contain"
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.headerIconButton, { marginLeft: 12 }]}
              onPress={() =>
                navigation.navigate('CartScreen', {
                  restaurantId,
                  restaurant,
                  customerCoords: passedCoords,
                })
              }
              activeOpacity={0.8}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Image
                source={require('../assets/icons/best_cart.png')}
                style={{ width: 22, height: 22, tintColor: '#FFFFFF' }}
                resizeMode="contain"
              />
              {cartItemCount > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{cartItemCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ============================================================ */}
        {/* 2. DELIVERY ADDRESS BAR — collapses/fades on scroll          */}
        {/* ============================================================ */}
        <Animated.View
          style={[
            styles.deliveryBar,
            {
              transform: [{ translateY: addressBarTranslateY }],
              opacity: addressBarOpacity,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.deliveryBarLeft}
            activeOpacity={0.8}
            onPress={() => setAddressModalVisible(true)}
          >
            <View style={styles.pinCircle}>
              <Image
                source={require('../assets/icons/best_location.png')}
                style={{ width: 18, height: 18 }}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.deliveryBarText} numberOfLines={1}>
              Delivering to {deliveryAddressLine}
            </Text>
            <Icon name="chevron-forward" size={14} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setAddressModalVisible(true)}
            style={styles.changeAddressTouch}
          >
            <Text style={styles.changeAddressText}>Change</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* ============================================================ */}
      {/* 3. MAIN SCROLLABLE CONTENT */}
      {/* ============================================================ */}
      <Animated.ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
      >
        {/* HERO IMAGE CONTAINER: ONLY REAL ITEM IMAGES */}
        <View style={styles.heroImageWrapper}>
          {activeImageUri ? (
            <Image
              source={{ uri: activeImageUri }}
              style={styles.heroImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.noImageWrapper}>
              <Text style={{ fontSize: 52 }}>{categoryIcon}</Text>
              <Text style={styles.noImageTitle}>{item?.name || 'Product Details'}</Text>
              <Text style={styles.noImageSubtext}>{categoryLabel} Item</Text>
            </View>
          )}

          {/* IMAGE COUNTER BADGE IF MULTIPLE REAL PHOTOS */}
          {galleryImages.length > 1 && (
            <View style={styles.imageCounterBadge}>
              <Icon name="images" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.imageCounterText}>
                {activeImageIndex + 1}/{galleryImages.length}
              </Text>
            </View>
          )}
        </View>

        {/* THUMBNAIL GALLERY STRIP: ONLY SHOWN IF MULTIPLE REAL PHOTOS */}
        {galleryImages.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbnailStrip}
          >
            {galleryImages.map((imgUri, idx) => {
              const isSelected = idx === activeImageIndex;
              return (
                <TouchableOpacity
                  key={`thumb-${idx}`}
                  style={[
                    styles.thumbnailCard,
                    isSelected && styles.thumbnailCardSelected,
                  ]}
                  onPress={() => setActiveImageIndex(idx)}
                  activeOpacity={0.8}
                >
                  <Image
                    source={{ uri: imgUri }}
                    style={styles.thumbnailImage}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* TRUST BADGE: 100% GENUINE & VERIFIED QUALITY */}
        <View style={styles.trustBadgeWrap}>
          <View style={styles.trustBadgePill}>
            <View style={styles.trustShieldCircle}>
              <Icon name="shield-checkmark" size={14} color="#0066FF" />
            </View>
            <Text style={styles.trustBadgeText}>100% Genuine & Verified Quality</Text>
          </View>
        </View>

        {/* PRODUCT TITLE & ACTION BUTTONS */}
        <View style={styles.titleRow}>
          <View style={styles.titleCol}>
            <Text style={styles.productTitle}>{item?.name || item?.title || 'Product Details'}</Text>
            <View style={styles.categoryPillRow}>
              <View style={styles.categoryBadgePill}>
                <Text style={styles.categoryBadgePillText}>
                  {categoryIcon} {categoryLabel}
                </Text>
              </View>
              {/* Veg / Non-Veg Badge is STRICTLY rendered for Food category only */}
              {isFoodCategory && (
                <View style={[styles.vegBadgePill, item?.isVeg === false ? styles.nonVegBadgePill : styles.vegBadgePill]}>
                  <Text style={[styles.vegBadgePillText, item?.isVeg === false ? { color: '#DC2626' } : { color: '#16A34A' }]}>
                    {item?.isVeg !== false ? '🌱 100% Veg' : '🍗 Non-Veg'}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.actionButtonsCol}>
            <TouchableOpacity
              style={styles.sideActionBtn}
              onPress={toggleWishlist}
              activeOpacity={0.8}
            >
              <View style={[styles.sideActionIconCircle, isWishlisted && styles.sideActionIconCircleActive]}>
                <Image
                  source={require('../assets/icons/best_wishlist.png')}
                  style={{ width: 20, height: 20 }}
                  resizeMode="contain"
                />
              </View>
              <Text style={[styles.sideActionLabel, isWishlisted && { color: '#EF4444' }]}>Wishlist</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sideActionBtn}
              onPress={handleShare}
              activeOpacity={0.8}
            >
              <View style={styles.sideActionIconCircle}>
                <Image
                  source={require('../assets/icons/best_share.png')}
                  style={{ width: 20, height: 20 }}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.sideActionLabel}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ============================================================ */}
        {/* DEDICATED DESCRIPTION & DETAILS CARD (CATEGORY-AWARE)         */}
        {/* ============================================================ */}
        <View style={styles.descriptionSectionCard}>
          <View style={styles.descriptionHeaderRow}>
            <View style={styles.descriptionIconBadge}>
              <Image
                source={require('../assets/icons/clipboard.png')}
                style={{ width: 18, height: 18, tintColor: '#0066FF' }}
                resizeMode="contain"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.descriptionSectionTitle}>
                {isFoodCategory ? 'Dish Description & Details' : 'Item Description & Details'}
              </Text>
              <Text style={styles.descriptionSectionSub}>
                {isFoodCategory ? 'Kitchen Recipe & Preparation' : 'Verified Store Standard & Specs'}
              </Text>
            </View>
            <View style={styles.verifiedRecipePill}>
              <Text style={styles.verifiedRecipeText}>✓ Verified</Text>
            </View>
          </View>

          <Text style={styles.descriptionBodyText}>
            {item?.description || item?.details || item?.about || `${item?.name || 'This item'} is fulfilled maintaining quality and standard specifications from ${restaurant?.name || 'our verified store'}.`}
          </Text>

          {/* Highlights & Quality Chips */}
          <View style={styles.specChipsRow}>
            <View style={styles.specChip}>
              <Text style={styles.specChipText}>{categoryIcon} {categoryLabel}</Text>
            </View>
            <View style={styles.specChip}>
              <Text style={styles.specChipText}>
                {isFoodCategory ? '🔥 Freshly Cooked' : '✨ 100% Genuine'}
              </Text>
            </View>
            <View style={styles.specChip}>
              <Text style={styles.specChipText}>🛡️ Quality Checked</Text>
            </View>
            <View style={styles.specChip}>
              <Text style={styles.specChipText}>📦 Safe Packaging</Text>
            </View>
          </View>
        </View>

        {/* PRICE SECTION */}
        <View style={styles.priceRow}>
          <Text style={styles.currentPrice}>₹{price}</Text>
          {mrp > price && (
            <Text style={styles.mrpStrikethrough}>₹{mrp}</Text>
          )}
          {discountPercent > 0 && (
            <Text style={styles.discountBadge}>{discountPercent}% off</Text>
          )}
          <TouchableOpacity
            onPress={() =>
              Alert.alert(
                'Price Details',
                `Item Price: ₹${price}\nMaximum Retail Price (MRP): ₹${mrp}\nTotal Savings: ₹${
                  mrp - price
                } (${discountPercent}% OFF)\nAll taxes included.`
              )
            }
          >
            <Icon
              name="information-circle-outline"
              size={18}
              color="#94A3B8"
              style={{ marginLeft: 8 }}
            />
          </TouchableOpacity>
        </View>

        {/* QUANTITY SELECTOR WITH SPRING BOUNCE ANIMATION ON + / - */}
        <View style={styles.quantityRow}>
          <View style={styles.quantityLabelRow}>
            <View style={styles.quantityIconCircle}>
              <Text style={{ fontSize: 13 }}>🔢</Text>
            </View>
            <Text style={styles.quantityLabel}>Select Quantity</Text>
          </View>

          <View style={styles.quantityStepper}>
            <TouchableOpacity
              onPress={handleDecreaseQty}
              disabled={quantity <= 1}
              activeOpacity={0.7}
            >
              <Animated.View
                style={[
                  styles.stepperAction,
                  quantity <= 1 && styles.stepperActionDisabled,
                  { transform: [{ scale: minusScale }] },
                ]}
              >
                <Icon name="remove" size={18} color={quantity <= 1 ? '#94A3B8' : '#0F172A'} />
              </Animated.View>
            </TouchableOpacity>

            <Animated.Text
              style={[
                styles.quantityValue,
                { transform: [{ scale: qtyScale }] },
              ]}
            >
              {quantity}
            </Animated.Text>

            <TouchableOpacity
              onPress={handleIncreaseQty}
              activeOpacity={0.7}
            >
              <Animated.View
                style={[
                  styles.stepperAction,
                  { transform: [{ scale: plusScale }] },
                ]}
              >
                <Icon name="add" size={18} color="#0066FF" />
              </Animated.View>
            </TouchableOpacity>
          </View>
        </View>

        {/* STORE & VERIFIED SELLER DETAILS */}
        <View style={styles.sellerInfoCard}>
          <View style={styles.sellerHeaderRow}>
            <View style={styles.storeIconWrap}>
              <Icon name="storefront" size={18} color="#0066FF" />
            </View>
            <Text style={styles.sellerTitle}>
              {restaurant?.name || 'Verified Partner Store'}
            </Text>
            <View style={styles.verifiedTick}>
              <Icon name="checkmark" size={11} color="#FFFFFF" />
            </View>
          </View>
          <Text style={styles.sellerAddress}>
            📍 {canonicalLoc.address || restaurant?.address || restaurant?.city || 'Locally fulfilled'}
          </Text>
        </View>

        <View style={{ height: 100 }} />
      </Animated.ScrollView>

      {/* ============================================================ */}
      {/* 4. TEMPORARY ADDED-TO-CART TOAST NOTIFICATION */}
      {/* ============================================================ */}
      {showAddedToast && (
        <View style={styles.toastWrap}>
          <Icon name="checkmark-circle" size={20} color="#FFFFFF" />
          <Text style={styles.toastText}>
            Added {quantity} x {item?.name} to Cart 🛒
          </Text>
        </View>
      )}

      {/* ============================================================ */}
      {/* 5. FIXED BOTTOM ACTION BAR */}
      {/* ============================================================ */}
      <View style={styles.fixedBottomContainer}>
        <View style={styles.bottomBarRow}>
          <TouchableOpacity
            style={styles.addToCartBtn}
            onPress={handleAddToCart}
            activeOpacity={0.8}
          >
            <Image
              source={require('../assets/icons/best_cart.png')}
              style={{ width: 20, height: 20, tintColor: '#0066FF' }}
              resizeMode="contain"
            />
            <Text style={styles.addToCartText}>Add to Cart</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.buyNowBtn}
            onPress={handleBuyNow}
            activeOpacity={0.85}
          >
            <Icon name="flash" size={18} color="#FFFFFF" />
            <Text style={styles.buyNowText}>Buy Now</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ============================================================ */}
      {/* 6. ADDRESS SELECTION MODAL */}
      {/* ============================================================ */}
      <AddressSelectionModal
        visible={addressModalVisible}
        onClose={() => setAddressModalVisible(false)}
        activeAddressId={activeAddress?.id}
        onSelectAddress={(addr) => {
          setActiveAddress(addr);
          setAddressModalVisible(false);
        }}
      />
    </SafeAreaView>
  );
};

export default ItemDetailsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  /* FIXED TOP CONTAINER: TopHeader always fixed; only address bar inside slides */
  collapsibleHeaderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    elevation: 8,
    overflow: 'hidden',
  },

  /* 1. TOP BLUE APP BAR (10% higher for optimal notch/camera cutout reach) */
  topHeader: {
    backgroundColor: '#0066FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: AUTO_HEADER_PADDING_TOP,
    paddingBottom: 10,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
  },
  headerIconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.38)',
    position: 'relative',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    elevation: 4,
  },
  cartBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },

  /* 2. DELIVERY ADDRESS SUBHEADER (Hides on scroll) */
  deliveryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  deliveryBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  pinCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    elevation: 2,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  deliveryBarText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginRight: 4,
    maxWidth: width * 0.62,
  },
  changeAddressTouch: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  changeAddressText: {
    color: '#0066FF',
    fontSize: 13,
    fontWeight: '800',
  },

  /* 3. SCROLL CONTENT */
  scrollContent: {
    paddingTop: AUTO_HEADER_PADDING_TOP + 105,
    paddingBottom: 40,
  },

  /* HERO IMAGE */
  heroImageWrapper: {
    marginHorizontal: 16,
    marginTop: 14,
    height: 330,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    position: 'relative',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  noImageWrapper: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  noImageTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 12,
    textAlign: 'center',
  },
  noImageSubtext: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
  },
  imageCounterBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  imageCounterText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  /* THUMBNAILS STRIP */
  thumbnailStrip: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  thumbnailCard: {
    width: 72,
    height: 60,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  thumbnailCardSelected: {
    borderColor: '#0066FF',
    borderWidth: 2.5,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },

  /* TRUST BADGE */
  trustBadgeWrap: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  trustBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 8,
  },
  trustShieldCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustBadgeText: {
    color: '#0066FF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  /* TITLE & ACTIONS */
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    marginTop: 12,
  },
  titleCol: {
    flex: 1,
    paddingRight: 12,
  },
  productTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 26,
  },
  categoryPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  categoryBadgePill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  categoryBadgePillText: {
    color: '#0066FF',
    fontSize: 11,
    fontWeight: '700',
  },
  vegBadgePill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  nonVegBadgePill: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  vegBadgePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  actionButtonsCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sideActionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideActionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  sideActionIconCircleActive: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  sideActionLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '700',
  },

  /* PRICE SECTION */
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 14,
  },
  currentPrice: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0052CC',
  },
  mrpStrikethrough: {
    fontSize: 16,
    color: '#94A3B8',
    textDecorationLine: 'line-through',
    marginLeft: 10,
    fontWeight: '500',
  },
  discountBadge: {
    fontSize: 16,
    fontWeight: '800',
    color: '#16A34A',
    marginLeft: 10,
  },

  /* DEDICATED DESCRIPTION CARD WITH ICON */
  descriptionSectionCard: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  descriptionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  descriptionIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  descriptionSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  descriptionSectionSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  verifiedRecipePill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  verifiedRecipeText: {
    color: '#15803D',
    fontSize: 10,
    fontWeight: '800',
  },
  descriptionBodyText: {
    fontSize: 13.5,
    color: '#334155',
    lineHeight: 20,
    fontWeight: '500',
  },
  specChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  specChip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  specChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '700',
  },

  /* QUANTITY SELECTOR */
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 18,
  },
  quantityLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quantityIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  quantityLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  quantityStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 24,
    paddingHorizontal: 6,
    paddingVertical: 4,
    elevation: 1,
  },
  stepperAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  stepperActionDisabled: {
    opacity: 0.4,
  },
  quantityValue: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
    minWidth: 36,
    textAlign: 'center',
  },

  /* STORE / SELLER CARD */
  sellerInfoCard: {
    marginHorizontal: 16,
    marginTop: 18,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  sellerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  storeIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  sellerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  verifiedTick: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#0066FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerAddress: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 6,
  },

  /* TOAST NOTIFICATION */
  toastWrap: {
    position: 'absolute',
    bottom: 84,
    alignSelf: 'center',
    backgroundColor: '#0F172A',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 25,
    gap: 8,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  /* FIXED BOTTOM ACTION BAR */
  fixedBottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'android' ? 14 : 24,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  bottomBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'android' ? 16 : 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  addToCartBtn: {
    flex: 1,
    height: 52,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#0066FF',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    elevation: 2,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  addToCartText: {
    color: '#0066FF',
    fontSize: 16,
    fontWeight: '800',
  },
  buyNowBtn: {
    flex: 1,
    height: 52,
    backgroundColor: '#0066FF',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    elevation: 4,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  buyNowText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
