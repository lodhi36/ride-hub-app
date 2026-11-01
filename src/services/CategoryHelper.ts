/**
 * Centralized Category Helper
 * Provides canonical category normalization, category-specific icons,
 * delivery labels, preparation/packing terminology, and banners.
 * Ensures NO hardcoded "Food" or food icons appear for non-food orders (Toy, Beauty, Fashion, etc.)
 */

export type CanonicalCategory =
  | 'Toy'
  | 'Beauty'
  | 'Fashion'
  | 'Grocery'
  | 'Vegetables'
  | 'Fruits'
  | 'Namkeen'
  | 'Oil & Food'
  | 'Stationery'
  | 'Bakery'
  | 'Pharmacy'
  | 'Electronics'
  | 'Bike'
  | 'Car'
  | 'Food'
  | 'General Store';

/**
 * Normalizes any category string or candidate list to a canonical category name
 */
export const normalizeCategory = (
  candidates: (string | null | undefined)[] | string | null | undefined,
  defaultFallback: CanonicalCategory = 'General Store'
): CanonicalCategory => {
  const list = Array.isArray(candidates) ? candidates : [candidates];

  for (const cand of list) {
    if (!cand) continue;
    const lower = String(cand).toLowerCase().trim();
    if (!lower) continue;

    // Check specific categories first
    if (lower.includes('toy') || lower.includes('bear') || lower.includes('game') || lower.includes('khilon')) {
      return 'Toy';
    }
    if (lower.includes('beauty') || lower.includes('cosmetic') || lower.includes('salon') || lower.includes('makeup') || lower.includes('spa')) {
      return 'Beauty';
    }
    if (lower.includes('fashion') || lower.includes('cloth') || lower.includes('apparel') || lower.includes('wear') || lower.includes('garment')) {
      return 'Fashion';
    }
    if (lower.includes('vegetable') || lower.includes('sabzi') || lower.includes('sabji')) {
      return 'Vegetables';
    }
    if (lower.includes('fruit') || lower.includes('fal')) {
      return 'Fruits';
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
    if (lower.includes('grocery') || lower.includes('kirana') || lower.includes('supermarket') || lower.includes('ration') || lower.includes('rashan')) {
      return 'Grocery';
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
  }

  // If candidate is a custom non-empty string that wasn't matched above, check if it's explicitly food
  for (const cand of list) {
    if (!cand) continue;
    const str = String(cand).trim();
    if (str && str.toLowerCase() !== 'undefined' && str.toLowerCase() !== 'null') {
      const lower = str.toLowerCase();
      if (lower === 'food' || lower === 'food delivery') return 'Food';
      return (str.charAt(0).toUpperCase() + str.slice(1)) as CanonicalCategory;
    }
  }

  return defaultFallback;
};

/**
 * Returns category-specific emoji/icon
 */
export const getCategoryIcon = (category: string): string => {
  const norm = normalizeCategory(category);
  switch (norm) {
    case 'Toy':
      return '🧸';
    case 'Beauty':
      return '💄';
    case 'Fashion':
      return '👗';
    case 'Grocery':
      return '🛒';
    case 'Vegetables':
      return '🥦';
    case 'Fruits':
      return '🍎';
    case 'Namkeen':
      return '🥨';
    case 'Oil & Food':
      return '🌻';
    case 'Stationery':
      return '📚';
    case 'Bakery':
      return '🎂';
    case 'Pharmacy':
      return '💊';
    case 'Electronics':
      return '📱';
    case 'Bike':
      return '🏍️';
    case 'Car':
      return '🚗';
    case 'Food':
      return '🍽️';
    case 'General Store':
    default:
      return '🏪';
  }
};

/**
 * Returns category-aware delivery label (e.g. "Toy Delivery", "Food Delivery")
 */
export const getCategoryDeliveryLabel = (category: string): string => {
  const norm = normalizeCategory(category);
  if (norm === 'General Store') return 'Store Delivery';
  return `${norm} Delivery`;
};

/**
 * Returns store type label (e.g. "Toy Store", "Beauty Store", "Restaurant")
 */
export const getCategoryStoreLabel = (category: string): string => {
  const norm = normalizeCategory(category);
  if (norm === 'Food') return 'Restaurant';
  return `${norm} Store`;
};

/**
 * Returns preparation or packing terminology
 */
export const getCategoryPrepTerminology = (category: string) => {
  const norm = normalizeCategory(category);
  const isFood = norm === 'Food';

  return {
    isFood,
    prepNoun: isFood ? 'Cooking' : 'Packing',
    prepProgressLabel: isFood ? 'Food Preparing' : `${norm} Packing`,
    prepInProgressTitle: isFood ? '🍳 STATUS: FOOD PREPARATION IN PROGRESS' : `📦 STATUS: ${norm.toUpperCase()} PACKING IN PROGRESS`,
    prepSubText: isFood
      ? 'Cooking and preparing your fresh meal.'
      : `Packing your ${norm.toLowerCase()} items safely.`,
    liveProgressText: isFood
      ? 'Live food preparation in progress...'
      : `Live ${norm.toLowerCase()} packing in progress...`,
    readyLabel: isFood ? '🍲 Food Ready' : `📦 ${norm} Ready`,
    readySubText: isFood
      ? 'Your meal has been freshly cooked and packed.'
      : `Your ${norm.toLowerCase()} items have been safely packed and ready.`,
    itemNoun: isFood ? 'Dish' : `${norm} Item`,
    itemsNoun: isFood ? 'Dishes' : `${norm} Items`,
    actionTimeLabel: isFood ? 'Preparation Time' : 'Packing Time',
    selectTimeLabel: isFood ? '⏱️ Select Preparation Time' : '⏱️ Select Packing Time',
    itemsListHeader: isFood ? 'ITEMS TO PREPARE:' : 'ITEMS TO PACK:',
    billLabel: isFood ? 'Food Total' : `${norm} Total`,
    deliveryLabel: getCategoryDeliveryLabel(norm),
    storeLabel: getCategoryStoreLabel(norm),
    icon: getCategoryIcon(norm),
  };
};

/**
 * Returns appropriate status badge metadata for active orders
 */
export const getActiveOrderStatusBadge = (statusStr: string, category: string) => {
  const s = (statusStr || '').toUpperCase();
  const term = getCategoryPrepTerminology(category);
  const catName = normalizeCategory(category);

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

export const getCategoryLabel = (categoryInput: any): string => {
  if (categoryInput === undefined || categoryInput === null) {
    return 'Category unavailable';
  }
  const norm = normalizeCategory(categoryInput, 'General Store' as any);
  if (norm === 'General Store') {
    const raw = typeof categoryInput === 'string' ? categoryInput : (categoryInput?.categoryName || categoryInput?.category || '');
    if (!raw || !raw.trim()) return 'Category unavailable';
    return raw.trim();
  }
  return norm;
};

export const getCategoryTotalLabel = (categoryInput: any): string => {
  const label = getCategoryLabel(categoryInput);
  if (label === 'Category unavailable') {
    return 'Order Total';
  }
  return `${label} Total`;
};

export default {
  normalizeCategory,
  getCategoryIcon,
  getCategoryDeliveryLabel,
  getCategoryStoreLabel,
  getCategoryPrepTerminology,
  getActiveOrderStatusBadge,
  getCategoryLabel,
  getCategoryTotalLabel,
};

