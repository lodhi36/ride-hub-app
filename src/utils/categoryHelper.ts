/**
 * categoryHelper.ts
 * Centralized Category Resolver, Label Formatter, Icon & Dynamic Image Helper.
 * Ensures consistent category detection across Customer, Supplier, and Rider screens.
 */

export interface CategoryInfo {
  name: string;
  key: string;
  icon: string;
  deliveryTitle: string;
  preparingTitle: string;
  readyTitle: string;
  image: string;
}

// Canonical high-resolution category banner/placeholder images
export const CATEGORY_IMAGES: Record<string, string> = {
  toy: 'https://images.unsplash.com/photo-1558060370-d644479cb6f7?w=600&auto=format&fit=crop&q=80',
  toys: 'https://images.unsplash.com/photo-1558060370-d644479cb6f7?w=600&auto=format&fit=crop&q=80',
  food: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&auto=format&fit=crop&q=80',
  grocery: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&auto=format&fit=crop&q=80',
  groceries: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&auto=format&fit=crop&q=80',
  vegetables: 'https://images.unsplash.com/photo-1610348725531-843dff563e2c?w=600&auto=format&fit=crop&q=80',
  fruits: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=600&auto=format&fit=crop&q=80',
  beauty: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&auto=format&fit=crop&q=80',
  fashion: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=600&auto=format&fit=crop&q=80',
  bakery: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop&q=80',
  electronics: 'https://images.unsplash.com/photo-1550009158-9ebf69173e03?w=600&auto=format&fit=crop&q=80',
  home: 'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?w=600&auto=format&fit=crop&q=80',
  pharmacy: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80',
  general: 'https://images.unsplash.com/photo-1534723452862-4c874018d66d?w=600&auto=format&fit=crop&q=80',
  default: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=600&auto=format&fit=crop&q=80',
};

// Canonical Category Icons
export const CATEGORY_ICONS: Record<string, string> = {
  toy: '🧸',
  toys: '🧸',
  food: '🍽️',
  grocery: '🛒',
  groceries: '🛒',
  vegetables: '🥦',
  fruits: '🍎',
  beauty: '💄',
  fashion: '👗',
  bakery: '🎂',
  electronics: '📱',
  home: '🛋️',
  pharmacy: '💊',
  bike: '🏍️',
  car: '🚗',
  general: '🏪',
  default: '📦',
};

/**
 * Centralized Category Label Formatter (Requirement 9 & 10)
 * FOOD → Food
 * TOY → Toy
 * FASHION → Fashion
 * BEAUTY → Beauty
 * GROCERY → Grocery
 * FRUITS_VEGETABLES → Fruits & Vegetables
 * If missing/invalid → "Category unavailable" (never default to Food)
 */
export const getCategoryLabel = (categoryInput: any): string => {
  if (categoryInput === undefined || categoryInput === null) {
    console.warn('⚠️ [CATEGORY MISSING] Order or object has missing category. Data issue logged.');
    return 'Category unavailable';
  }

  let raw = '';
  if (typeof categoryInput === 'string') {
    raw = categoryInput.trim();
  } else if (typeof categoryInput === 'object') {
    raw = (
      categoryInput.categoryName ||
      categoryInput.businessCategoryName ||
      categoryInput.category ||
      categoryInput.supplierCategory ||
      categoryInput.serviceName ||
      categoryInput.storeCategory ||
      categoryInput.partnerType ||
      categoryInput.businessType ||
      categoryInput.restaurant?.categoryName ||
      categoryInput.restaurant?.businessCategoryName ||
      categoryInput.order?.categoryName ||
      categoryInput.order?.businessCategoryName ||
      ''
    ).toString().trim();

    // Check items if category string empty
    if (!raw && categoryInput.cartItems) {
      const items = Array.isArray(categoryInput.cartItems) ? categoryInput.cartItems : Object.values(categoryInput.cartItems);
      for (const item of items) {
        if (!item) continue;
        const n = ((item as any).name || (item as any).title || '').toLowerCase();
        if (n.includes('toy') || n.includes('car') || n.includes('game') || n.includes('doll') || n.includes('bear') || n.includes('khilon')) { raw = 'Toy'; break; }
        if (n.includes('saree') || n.includes('shirt') || n.includes('pant') || n.includes('cloth') || n.includes('dress') || n.includes('kurti')) { raw = 'Fashion'; break; }
        if (n.includes('beauty') || n.includes('makeup') || n.includes('lipstick') || n.includes('cream') || n.includes('shampoo')) { raw = 'Beauty'; break; }
        if (n.includes('fruit') && n.includes('veg')) { raw = 'Fruits & Vegetables'; break; }
        if (n.includes('vegetable') || n.includes('sabzi') || n.includes('potato') || n.includes('onion') || n.includes('tomato')) { raw = 'Vegetables'; break; }
        if (n.includes('fruit') || n.includes('apple') || n.includes('banana') || n.includes('mango')) { raw = 'Fruits'; break; }
        if (n.includes('oil') || n.includes('rice') || n.includes('atta') || n.includes('dal') || n.includes('sugar') || n.includes('grocery') || n.includes('kirana')) { raw = 'Grocery'; break; }
        if (n.includes('bike') || n.includes('two-wheeler') || n.includes('motorcycle') || n.includes('scooter')) { raw = 'Bike'; break; }
        if (n.includes('car') || n.includes('cab') || n.includes('taxi') || n.includes('auto')) { raw = 'Car'; break; }
        if (n.includes('burger') || n.includes('pizza') || n.includes('biryani') || n.includes('paneer') || n.includes('roll') || n.includes('thali') || n.includes('curry')) { raw = 'Food'; break; }
      }
    }
  }

  if (!raw || raw.toLowerCase() === 'undefined' || raw.toLowerCase() === 'null') {
    console.warn('⚠️ [CATEGORY INVALID] Category is missing or invalid. Returning "Category unavailable".');
    return 'Category unavailable';
  }

  const lower = raw.toLowerCase().trim();

  // Canonical Mappings
  if (lower.includes('toy') || lower.includes('bear') || lower.includes('game') || lower.includes('khilon') || lower.includes('doll')) {
    return 'Toy';
  }
  if (lower.includes('beauty') || lower.includes('cosmetic') || lower.includes('salon') || lower.includes('makeup') || lower.includes('spa') || lower.includes('skin')) {
    return 'Beauty';
  }
  if (lower.includes('fashion') || lower.includes('saree') || lower.includes('cloth') || lower.includes('apparel') || lower.includes('wear') || lower.includes('garment') || lower.includes('kurti') || lower.includes('dress') || lower.includes('suit') || lower.includes('shirt')) {
    return 'Fashion';
  }
  if (lower.includes('fruit') && (lower.includes('veg') || lower.includes('sabzi'))) {
    return 'Fruits & Vegetables';
  }
  if (lower.includes('vegetable') || lower.includes('sabzi') || lower.includes('sabji')) {
    return 'Vegetables';
  }
  if (lower.includes('fruit') || lower.includes('fal')) {
    return 'Fruits';
  }
  if (lower.includes('grocery') || lower.includes('kirana') || lower.includes('supermarket') || lower.includes('ration') || lower.includes('rashan')) {
    return 'Grocery';
  }
  if (lower.includes('namkeen') || lower.includes('snack') || lower.includes('farsan') || lower.includes('bhujia')) {
    return 'Namkeen';
  }
  if (lower.includes('oil') || lower.includes('tel')) {
    return 'Oil & Food';
  }
  if (lower.includes('stationery') || lower.includes('stationary') || lower.includes('book') || lower.includes('pen')) {
    return 'Stationery';
  }
  if (lower.includes('bakery') || lower.includes('cake') || lower.includes('pastry') || lower.includes('sweet') || lower.includes('mithai')) {
    return 'Bakery';
  }
  if (lower.includes('pharmacy') || lower.includes('medicine') || lower.includes('chemist') || lower.includes('medical') || lower.includes('dawa')) {
    return 'Pharmacy';
  }
  if (lower.includes('electronics') || lower.includes('electronic') || lower.includes('mobile') || lower.includes('gadget')) {
    return 'Electronics';
  }
  if (lower.includes('bike') || lower.includes('two-wheeler') || lower.includes('motorcycle') || lower.includes('scooter')) {
    return 'Bike';
  }
  if (lower.includes('car') || lower.includes('cab') || lower.includes('taxi') || lower.includes('auto') || lower.includes('four-wheeler')) {
    return 'Car';
  }
  if (
    lower.includes('restaurant') ||
    lower.includes('food') ||
    lower.includes('dining') ||
    lower.includes('kitchen') ||
    lower.includes('cafe') ||
    lower.includes('hotel') ||
    lower.includes('dhaba') ||
    lower.includes('burger') ||
    lower.includes('pizza') ||
    lower.includes('biryani')
  ) {
    return 'Food';
  }

  // Format as clean title case (DO NOT default to Food)
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

/**
 * Returns dynamic category total label (Requirement 6 & 9)
 * e.g. "Food Total", "Toy Total", "Fashion Total", "Beauty Total", "Grocery Total"
 */
export const getCategoryTotalLabel = (categoryInput: any): string => {
  const label = getCategoryLabel(categoryInput);
  if (
    label === 'Category unavailable' ||
    label.toLowerCase() === 'vegetables' ||
    label.toLowerCase() === 'vegtables' ||
    label.toLowerCase() === 'general'
  ) {
    return 'Order Total';
  }
  return `${label} Total`;
};

/**
 * Resolves the clean display category name from any order, booking, store, or param object.
 * Checks multiple candidate fields in priority order without falling back blindly to 'Food'.
 */
export const resolveCategoryName = (data: any): string => {
  const label = getCategoryLabel(data);
  if (label !== 'Category unavailable') {
    return label;
  }
  const fallback = typeof data === 'object' && data ? (data.serviceName || data.restaurantName || data.name) : '';
  if (fallback && typeof fallback === 'string' && fallback.trim()) {
    return fallback.trim();
  }
  return 'Store';
};

/**
 * Returns dynamic category delivery title (e.g. "Toy Delivery", "Fashion Delivery")
 */
export const getCategoryDeliveryTitle = (categoryInput: any): string => {
  const cat = resolveCategoryName(categoryInput);
  return `${cat} Delivery`;
};

/**
 * Returns dynamic preparing title (e.g. "Preparing your toy order", "Preparing your grocery order")
 */
export const getCategoryPreparingTitle = (categoryInput: any): string => {
  const cat = resolveCategoryName(categoryInput);
  if (cat.toLowerCase() === 'food') return 'Preparing your fresh food';
  return `Preparing your ${cat.toLowerCase()} order`;
};

/**
 * Returns dynamic ready title (e.g. "Toy Order Ready for Pickup")
 */
export const getCategoryReadyTitle = (categoryInput: any): string => {
  const cat = resolveCategoryName(categoryInput);
  return `${cat} Ready for Pickup`;
};

/**
 * Returns dynamic picked up title (e.g. "Toy Order Picked Up")
 */
export const getCategoryPickedUpTitle = (categoryInput: any): string => {
  const cat = resolveCategoryName(categoryInput);
  return `${cat} Picked Up`;
};

/**
 * Returns dynamic category icon emoji
 */
export const getCategoryIcon = (categoryInput: any): string => {
  const cat = resolveCategoryName(categoryInput).toLowerCase();
  for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
    if (cat.includes(key)) return icon;
  }
  return CATEGORY_ICONS.default;
};

/**
 * Returns dynamic category image / banner URL with priority:
 * 1. Store's uploaded photo / logo
 * 2. Item image
 * 3. Canonical high-res category image (Toy image for Toys, Beauty image for Beauty, etc.)
 */
export const getCategoryPlaceholderImage = (categoryInput: any, existingPhoto?: string | null): string => {
  if (existingPhoto && typeof existingPhoto === 'string' && existingPhoto.startsWith('http')) {
    return existingPhoto;
  }
  const cat = resolveCategoryName(categoryInput).toLowerCase();
  for (const [key, url] of Object.entries(CATEGORY_IMAGES)) {
    if (cat.includes(key)) return url;
  }
  return CATEGORY_IMAGES.default;
};

/**
 * Returns dynamic store type label (e.g. "Toy Store", "Beauty Store", "Restaurant")
 */
export const getCategoryStoreLabel = (categoryInput: any): string => {
  const cat = resolveCategoryName(categoryInput);
  if (cat.toLowerCase() === 'food') return 'Restaurant';
  return `${cat} Store`;
};

/**
 * Returns comprehensive preparation or packing terminology
 */
export const getCategoryPrepTerminology = (categoryInput: any) => {
  const cat = resolveCategoryName(categoryInput);
  const lowerCat = cat.toLowerCase();
  const isFood = lowerCat === 'food';
  const isVegetables = lowerCat.includes('veg') || lowerCat.includes('fruit') || lowerCat.includes('produce');

  let prepProgressLabel = 'Packing order';
  let prepNoun = 'Packing';
  let prepInProgressTitle = `📦 STATUS: ${cat.toUpperCase()} PACKING IN PROGRESS`;
  let prepSubText = `Packing your ${cat.toLowerCase()} items safely.`;
  let liveProgressText = `Live ${cat.toLowerCase()} packing in progress...`;

  if (isFood) {
    prepProgressLabel = 'Preparing order';
    prepNoun = 'Cooking';
    prepInProgressTitle = '🍳 STATUS: PREPARING ORDER';
    prepSubText = 'Cooking and preparing your fresh meal.';
    liveProgressText = 'Live food preparation in progress...';
  } else if (isVegetables) {
    prepProgressLabel = 'Preparing & packing order';
    prepNoun = 'Preparing & Packing';
    prepInProgressTitle = '🥦 STATUS: PREPARING & PACKING ORDER';
    prepSubText = 'Sorting, preparing and packing fresh produce.';
    liveProgressText = 'Live produce preparing & packing in progress...';
  }

  return {
    isFood,
    isVegetables,
    categoryName: cat,
    prepNoun,
    prepProgressLabel,
    prepInProgressTitle,
    prepSubText,
    liveProgressText,
    readyLabel: isFood ? '🍲 Food Ready' : `📦 ${cat} Ready`,
    readySubText: isFood
      ? 'Your meal has been freshly cooked and packed.'
      : `Your ${cat.toLowerCase()} items have been safely packed and ready.`,
    itemNoun: isFood ? 'Dish' : `${cat} Item`,
    itemsNoun: isFood ? 'Dishes' : `${cat} Items`,
    actionTimeLabel: isFood ? 'Preparation Time' : 'Packing Time',
    selectTimeLabel: isFood ? '⏱️ Select Preparation Time' : '⏱️ Select Packing Time',
    itemsListHeader: isFood ? 'ITEMS TO PREPARE:' : (isVegetables ? 'ITEMS TO PREPARE & PACK:' : 'ITEMS TO PACK:'),
    billLabel: isFood ? 'Food Total' : `${cat} Total`,
    deliveryLabel: getCategoryDeliveryTitle(cat),
    storeLabel: getCategoryStoreLabel(cat),
    icon: getCategoryIcon(cat),
  };
};

/**
 * Returns appropriate status badge metadata for active orders
 */
export const getActiveOrderStatusBadge = (statusStr: string, categoryInput: any) => {
  const s = (statusStr || '').toUpperCase();
  const term = getCategoryPrepTerminology(categoryInput);
  const catName = term.categoryName;

  if (s === 'RINGING' || s === 'CONNECTING' || s === 'PENDING' || s === 'PENDING_RESTAURANT' || s === 'BOOKING_REQUESTED') {
    return {
      text: term.isFood ? '🔔 Ringing to restaurant' : `🔔 Ringing to ${catName} store`,
      bg: '#EFF6FF',
      color: '#0066FF',
    };
  }
  if (s === 'PREPARING' || s === 'RESTAURANT_ACCEPTED' || s === 'FOOD_PREPARING') {
    return {
      text: term.isFood ? '👨‍🍳 Food Preparing' : `📦 ${catName} Packing`,
      bg: '#FEF3C7',
      color: '#B45309',
    };
  }
  if (s === 'FOOD_READY' || s === 'READY' || s === 'READY_FOR_PICKUP') {
    return {
      text: term.isFood ? '🥡 Food Ready' : `📦 ${catName} Ready`,
      bg: '#DCFCE7',
      color: '#15803D',
    };
  }
  if (s === 'OUT_FOR_DELIVERY' || s === 'ON_THE_WAY' || s === 'PICKED_UP' || s === 'STARTED') {
    return {
      text: '🛵 Out for Delivery',
      bg: '#DBEAFE',
      color: '#1D4ED8',
    };
  }
  if (s === 'COMPLETED' || s === 'DELIVERED') {
    return {
      text: '✅ Delivered',
      bg: '#DCFCE7',
      color: '#15803D',
    };
  }
  return {
    text: '⏳ Order in Progress',
    bg: '#DBEAFE',
    color: '#1D4ED8',
  };
};

/**
 * Requirement 3: Dynamic Order Details & Category Terminology
 * Standardized across Food, Fashion, Grocery, Electronics, Toys, Pharmacy, etc.
 */
export interface CategoryOrderTerminology {
  categoryKey: string;
  categoryLabel: string;
  storeNameType: string;       // e.g. "Restaurant", "Fashion Store", "Grocery Store", "Electronics Store"
  orderTypeName: string;       // e.g. "Food Order", "Shopping Order", "Grocery Order", "Product Order"
  kitchenOrPrepPlace: string;  // e.g. "Kitchen", "Fashion Studio / Store", "Grocery Store", "Electronics Store"
  pickupLabel: string;         // e.g. "Food Pickup", "Store Pickup", "Grocery Pickup"
  icon: string;
  pinColor: string;
  pinShadowColor: string;
  pinSvg: string;
}

export const getCategoryOrderTerminology = (categoryInput: any): CategoryOrderTerminology => {
  const cat = resolveCategoryName(categoryInput).toLowerCase();

  if (cat.includes('fashion') || cat.includes('cloth') || cat.includes('wear') || cat.includes('saree') || cat.includes('apparel') || cat.includes('kurti')) {
    return {
      categoryKey: 'fashion',
      categoryLabel: 'Fashion',
      storeNameType: 'Fashion Store',
      orderTypeName: 'Shopping Order',
      kitchenOrPrepPlace: 'Fashion Store',
      pickupLabel: 'Store Pickup',
      icon: '👗',
      pinColor: '#9333EA',
      pinShadowColor: 'rgba(147, 51, 234, 0.45)',
      pinSvg: '<path d="M14 16V13C14 10.24 16.24 8 19 8C21.76 8 24 10.24 24 13V16H27V26C27 27.1 26.1 28 25 28H13C11.9 28 11 27.1 11 26V16H14ZM16 16H22V13C22 11.34 20.66 10 19 10C17.34 10 16 11.34 16 13V16Z" fill="#FFFFFF"/>',
    };
  }

  if (cat.includes('grocery') || cat.includes('kirana') || cat.includes('supermarket') || cat.includes('ration') || cat.includes('rashan') || cat.includes('veg') || cat.includes('fruit')) {
    return {
      categoryKey: 'grocery',
      categoryLabel: 'Grocery',
      storeNameType: 'Grocery Store',
      orderTypeName: 'Grocery Order',
      kitchenOrPrepPlace: 'Grocery Store',
      pickupLabel: 'Grocery Pickup',
      icon: '🛒',
      pinColor: '#16A34A',
      pinShadowColor: 'rgba(22, 163, 74, 0.45)',
      pinSvg: '<path d="M12 12H14L16.5 22H24.5L27 15H15M17 26C16.45 26 16 25.55 16 25C16 24.45 16.45 24 17 24C17.55 24 18 24.45 18 25C18 25.55 17.55 26 17 26ZM24 26C23.45 26 23 25.55 23 25C23 24.45 23.45 24 24 24C24.55 24 25 24.45 25 25C25 25.55 24.55 26 24 26Z" fill="#FFFFFF"/>',
    };
  }

  if (cat.includes('electronic') || cat.includes('mobile') || cat.includes('gadget') || cat.includes('computer')) {
    return {
      categoryKey: 'electronics',
      categoryLabel: 'Electronics',
      storeNameType: 'Electronics Store',
      orderTypeName: 'Product Order',
      kitchenOrPrepPlace: 'Electronics Store',
      pickupLabel: 'Store Pickup',
      icon: '📱',
      pinColor: '#2563EB',
      pinShadowColor: 'rgba(37, 99, 235, 0.45)',
      pinSvg: '<path d="M15 11H23C24.1 11 25 11.9 25 13V25C25 26.1 24.1 27 23 27H15C13.9 27 13 26.1 13 25V13C13 11.9 13.9 11 15 11ZM19 25.5C19.55 25.5 20 25.05 20 24.5C20 23.95 19.55 23.5 19 23.5C18.45 23.5 18 23.95 18 24.5C18 25.05 18.45 25.5 19 25.5Z" fill="#FFFFFF"/>',
    };
  }

  if (cat.includes('toy') || cat.includes('bear') || cat.includes('game') || cat.includes('khilon')) {
    return {
      categoryKey: 'toys',
      categoryLabel: 'Toys',
      storeNameType: 'Toy Store',
      orderTypeName: 'Toy Order',
      kitchenOrPrepPlace: 'Toy Store',
      pickupLabel: 'Store Pickup',
      icon: '🧸',
      pinColor: '#F59E0B',
      pinShadowColor: 'rgba(245, 158, 11, 0.45)',
      pinSvg: '<path d="M19 11L21.2 15.5L26 16.2L22.5 19.6L23.3 24.4L19 22.1L14.7 24.4L15.5 19.6L12 16.2L16.8 15.5L19 11Z" fill="#FFFFFF"/>',
    };
  }

  if (cat.includes('pharmacy') || cat.includes('medicine') || cat.includes('chemist') || cat.includes('medical') || cat.includes('dawa')) {
    return {
      categoryKey: 'pharmacy',
      categoryLabel: 'Pharmacy',
      storeNameType: 'Pharmacy Store',
      orderTypeName: 'Medicine Order',
      kitchenOrPrepPlace: 'Pharmacy Store',
      pickupLabel: 'Store Pickup',
      icon: '💊',
      pinColor: '#059669',
      pinShadowColor: 'rgba(5, 150, 105, 0.45)',
      pinSvg: '<path d="M17 12H21V16H25V20H21V24H17V20H13V16H17V12Z" fill="#FFFFFF"/>',
    };
  }

  if (cat.includes('food') || cat.includes('restaurant') || cat.includes('dining') || cat.includes('kitchen') || cat.includes('cafe') || cat.includes('hotel') || cat.includes('dhaba')) {
    return {
      categoryKey: 'food',
      categoryLabel: 'Food',
      storeNameType: 'Restaurant',
      orderTypeName: 'Food Order',
      kitchenOrPrepPlace: 'Kitchen',
      pickupLabel: 'Food Pickup',
      icon: '🍽️',
      pinColor: '#E11D48',
      pinShadowColor: 'rgba(225, 29, 72, 0.45)',
      pinSvg: '<path d="M14 11V15C14 16.1 14.9 17 16 17V25H17V17C18.1 17 19 16.1 19 15V11H18V14H17V11H16V14H15V11H14Z" fill="#FFFFFF"/><path d="M21 11V25H22.5V17H24C24 13.5 22.5 11 21 11Z" fill="#FFFFFF"/>',
    };
  }

  // Fallback for general or unknown categories
  const resolved = resolveCategoryName(categoryInput);
  return {
    categoryKey: 'general',
    categoryLabel: resolved,
    storeNameType: `${resolved} Store`,
    orderTypeName: `${resolved} Order`,
    kitchenOrPrepPlace: `${resolved} Store`,
    pickupLabel: 'Store Pickup',
    icon: '🏪',
    pinColor: '#0284C7',
    pinShadowColor: 'rgba(2, 132, 199, 0.45)',
    pinSvg: '<path d="M12 11H26V15H12V11ZM13 16H25V25C25 25.5 24.5 26 24 26H14C13.5 26 13 25.5 13 25V16Z" fill="#FFFFFF"/>',
  };
};

export const calculateRealDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371; // km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export { normalizeCategory } from '../services/CategoryHelper';

