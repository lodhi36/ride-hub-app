import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { UPLOADS_URL } from './api';
import { resolveUploadUrl } from '../config/apiConfig';
import { fetchCurrentGpsPosition, calculateHaversineDistanceKm, getCanonicalRestaurantLocation } from './LocationAddressService';

// Cache Storage Keys
const CACHE_KEY_RESTOS = '@prod_cache_restaurants_v4';
const CACHE_KEY_DISHES = '@prod_cache_dishes_v4';
const CACHE_KEY_TIMESTAMP = '@prod_cache_timestamp_v4';
const MENU_CACHE_PREFIX = '@prod_cache_menu_v4_';

const STALE_TIME_MS = 45 * 1000; // 45 seconds before background revalidation
const API_TIMEOUT_MS = 15000; // 15 seconds timeout to ensure reliable responses over mobile data

export interface RestaurantData {
  _id: string;
  id?: string;
  name: string;
  categoryName: string;
  businessCategoryId?: string;
  businessCategoryName?: string;
  businessType?: string;
  partnerType?: string;
  restaurantName?: string;
  phoneNumber?: string;
  address?: string;
  fullAddress?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  featuredDish: string;
  rating: number | null;
  deliveryTime: string;
  distanceKm: number;
  distanceText: string;
  priceForTwo: string;
  discountBadge: string;
  image: string | null;
  images: string[];
  reviewCount?: number;
  reviewsCount?: number;
  itemImages: string[];
  menuItems: any[];
  freeDelivery: boolean;
  isOnline: boolean;
  rawUser: any;
}

export interface DishData {
  id: string;
  name: string;
  image: string;
  price: string;
  rating: number;
  restaurant: any;
}

export interface FetchResult {
  restaurants: RestaurantData[];
  popularDishes: DishData[];
  fromCache: boolean;
  isStale: boolean;
  error: string | null;
}

class RestaurantDataService {
  private inFlightRestoPromise: Promise<FetchResult> | null = null;
  private inFlightMenuPromises: Map<string, Promise<any>> = new Map();
  private memoryRestos: RestaurantData[] | null = null;
  private memoryDishes: DishData[] | null = null;
  private memoryTimestamp: number = 0;
  private lastCoordsKey: string | null = null;

  /**
   * Preload restaurant data into memory/disk silently without blocking UI
   */
  public async preload(): Promise<void> {
    try {
      if (!this.memoryRestos) {
        await this.loadFromDisk();
      }
      // Silently refresh in background
      this.fetchFromNetwork(false).catch(() => {});
    } catch (e) {
      // Preload errors should never bubble up
    }
  }

  /**
   * Load cached restaurants and dishes from disk
   */
  public async loadFromDisk(): Promise<{ restaurants: RestaurantData[]; dishes: DishData[] }> {
    try {
      const [restosRaw, dishesRaw, timeRaw] = await Promise.all([
        AsyncStorage.getItem(CACHE_KEY_RESTOS),
        AsyncStorage.getItem(CACHE_KEY_DISHES),
        AsyncStorage.getItem(CACHE_KEY_TIMESTAMP),
      ]);

      if (restosRaw) {
        this.memoryRestos = JSON.parse(restosRaw);
      }
      if (dishesRaw) {
        this.memoryDishes = JSON.parse(dishesRaw);
      }
      if (timeRaw) {
        this.memoryTimestamp = parseInt(timeRaw, 10) || 0;
      }
    } catch (e) {
      console.warn('[RestaurantDataService] Error reading disk cache', e);
    }
    return {
      restaurants: this.memoryRestos || [],
      dishes: this.memoryDishes || [],
    };
  }

  public getCachedRestaurants(): RestaurantData[] {
    return this.memoryRestos || [];
  }

  public hasCachedRestaurants(): boolean {
    return Boolean(this.memoryRestos && this.memoryRestos.length > 0);
  }

  /**
   * Get restaurants: Instant cache first, background sync if stale, deduplicated in-flight requests
   */
  public async getRestaurants(
    forceRefresh: boolean = false,
    coords?: { latitude: number; longitude: number } | null
  ): Promise<FetchResult> {
    // Avoid micro-jitter reloads: only invalidate on genuine large-scale city/zone move (> 20 km)
    let locationChanged = false;
    const coordsKey = coords?.latitude && coords?.longitude
      ? `${Number(coords.latitude).toFixed(2)}_${Number(coords.longitude).toFixed(2)}`
      : 'no_coords';
    this.lastCoordsKey = coordsKey;

    // 1. Check memory cache first
    if (!this.memoryRestos) {
      await this.loadFromDisk();
    }

    const hasCachedData = Boolean(this.memoryRestos && this.memoryRestos.length > 0);
    const now = Date.now();
    const isStale = now - this.memoryTimestamp > STALE_TIME_MS;

    // If we have valid, fresh cache and no force refresh or location change is needed, return immediately
    if (hasCachedData && !isStale && !forceRefresh && !locationChanged) {
      return {
        restaurants: this.memoryRestos || [],
        popularDishes: this.memoryDishes || [],
        fromCache: true,
        isStale: false,
        error: null,
      };
    }

    // If request is already in-flight, return the shared deduplicated promise
    if (this.inFlightRestoPromise) {
      return this.inFlightRestoPromise;
    }

    // Otherwise initiate network fetch
    this.inFlightRestoPromise = this.fetchFromNetwork(hasCachedData, coords)
      .finally(() => {
        this.inFlightRestoPromise = null;
      });

    // If we already have cached data, return the cached data immediately
    // and let the network fetch run in the background (Stale-While-Revalidate)
    if (hasCachedData && !forceRefresh && !locationChanged) {
      return {
        restaurants: this.memoryRestos || [],
        popularDishes: this.memoryDishes || [],
        fromCache: true,
        isStale: true,
        error: null,
      };
    }

    return this.inFlightRestoPromise;
  }

  /**
   * Fetch from backend with timeout, 5KM query parameters, and exponential backoff retry
   */
  private async fetchFromNetwork(
    hasFallback: boolean,
    coords?: { latitude: number; longitude: number } | null
  ): Promise<FetchResult> {
    let lastError: any = null;

    const queryParams: any = {};
    if (coords?.latitude && coords?.longitude && coords.latitude !== 0 && coords.longitude !== 0) {
      queryParams.lat = coords.latitude;
      queryParams.lng = coords.longitude;
      queryParams.radius = 5.0; // Strictly 5.0 KM
    }

    // Attempt up to 2 times (1 initial + 1 fast retry on network failure)
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await api.get('/profile/restaurants/online', {
          params: queryParams,
          timeout: API_TIMEOUT_MS,
        });

        if (res.data && res.data.success && Array.isArray(res.data.restaurants)) {
          // STRICT BUSINESS PRIVACY FILTER: Only genuine registered stores/restaurants
          const rawList = res.data.restaurants.filter((r: any) => {
            const role = String(r.role || '').toLowerCase();
            const isExcluded =
              role === 'customer' ||
              role === 'user' ||
              role === 'client' ||
              role === 'rider' ||
              role === 'delivery_partner' ||
              role === 'driver' ||
              role === 'admin';
            return !isExcluded;
          });

          // Process popular dishes with real photos
          const dishes: DishData[] = [];
          rawList.forEach((r: any) => {
            if (Array.isArray(r.menuItems) && r.menuItems.length > 0) {
              r.menuItems.forEach((item: any) => {
                if (item.isAvailable !== false && item.name && item.image && typeof item.image === 'string' && item.image.trim()) {
                  const itemImg = resolveUploadUrl(item.image);

                  dishes.push({
                    ...item,
                    id: item._id || item.id,
                    _id: item._id || item.id,
                    name: item.name,
                    image: itemImg,
                    price: `₹${item.price}`,
                    rawPrice: item.price,
                    rating: r.rating ? Number(r.rating) : null,
                    restaurant: r,
                  });
                }
              });
            }
          });

          const custPos = await fetchCurrentGpsPosition(true).catch(() => null);
          const custLat = custPos?.latitude || 0;
          const custLon = custPos?.longitude || 0;

          // Generic category placeholder names that should NOT appear as a featuredDish.
          // Only real item names (e.g. "Butter Chicken", "Samsung TV") should be shown — never raw category labels.
          const GENERIC_CATEGORY_NAMES = new Set([
            'food', 'grocery', 'groceries', 'item', 'items', 'product', 'products',
            'fashion', 'beauty', 'electronics', 'vegetables', 'fruits', 'bakery',
            'pharmacy', 'medicine', 'toys', 'beverages', 'drinks', 'general',
            'store', 'shop', 'kirana', 'restaurant', 'multi-cuisine', 'fast food',
            'home', 'living', 'furniture', 'decor', 'meat', 'fish', 'poultry',
            'stationary', 'stationery', 'oil', 'namkeen', 'snacks',
          ]);
          const isRealItemName = (name: string | null | undefined): boolean => {
            if (!name) return false;
            const trimmed = name.trim();
            if (!trimmed || trimmed.length < 2) return false;
            return !GENERIC_CATEGORY_NAMES.has(trimmed.toLowerCase());
          };

          const activeCustomerCoords = (coords?.latitude && coords?.longitude && coords.latitude !== 0 && coords.longitude !== 0)
            ? { latitude: Number(coords.latitude), longitude: Number(coords.longitude) }
            : ((custLat > 0 && custLon > 0) ? { latitude: custLat, longitude: custLon } : null);

          // Process restaurants: Gather up to 5 real images & authentic ratings
          const restos: RestaurantData[] = rawList.map((resto: any, idx: number) => {
            const rawCandidates = [];
            if (resto.profilePicture && typeof resto.profilePicture === 'string' && resto.profilePicture.trim() && !resto.profilePicture.startsWith('data:image')) {
              rawCandidates.push(resto.profilePicture.trim());
            }
            if (resto.coverImage && typeof resto.coverImage === 'string' && resto.coverImage.trim() && !resto.coverImage.startsWith('data:image')) {
              rawCandidates.push(resto.coverImage.trim());
            }
            if (Array.isArray(resto.supplierPhotos)) {
              rawCandidates.push(...resto.supplierPhotos.filter((p: any) => p && typeof p === 'string' && !p.startsWith('data:image')));
            }
            if (Array.isArray(resto.photos)) {
              rawCandidates.push(...resto.photos.filter((p: any) => p && typeof p === 'string' && !p.startsWith('data:image')));
            }
            if (Array.isArray(resto.images)) {
              rawCandidates.push(...resto.images.filter((p: any) => p && typeof p === 'string' && !p.startsWith('data:image')));
            }
            if (resto.featuredItemImage) rawCandidates.push(resto.featuredItemImage);
            if (Array.isArray(resto.itemImages)) rawCandidates.push(...resto.itemImages);
            if (Array.isArray(resto.menuItems)) {
              resto.menuItems.forEach((m: any) => { if (m?.image) rawCandidates.push(m.image); });
            }

            const cleanStoreImages: string[] = [];
            const seenImgs = new Set<string>();
            for (const imgItem of rawCandidates) {
              if (typeof imgItem === 'string' && imgItem.trim()) {
                const trimmed = imgItem.trim();
                const formatted = resolveUploadUrl(trimmed);
                if (!seenImgs.has(formatted)) {
                  seenImgs.add(formatted);
                  cleanStoreImages.push(formatted);
                }
              }
            }
            const finalImages = cleanStoreImages.slice(0, 5);
            const imgUrl: string | null = finalImages[0] || null;

            const isOnline = Boolean(
              resto.restaurant_status === 'online' ||
              resto.isOnline === true ||
              resto.status === 'online' ||
              resto.rawUser?.restaurant_status === 'online' ||
              resto.rawUser?.isOnline === true
            );

            const canonical = getCanonicalRestaurantLocation(resto, activeCustomerCoords, 'RestaurantDataService');

            // Pick real item name as featured dish — skip generic category labels like "Food", "Grocery" etc.
            const firstRealMenuItemName =
              resto.menuItems?.find((mi: any) => isRealItemName(mi?.name))?.name || '';
            const featuredDish = isRealItemName(resto.featuredItemName)
              ? resto.featuredItemName
              : firstRealMenuItemName;

            return {
              _id: resto._id || resto.id,
              id: resto._id || resto.id,
              name: resto.name && resto.name.trim() ? resto.name.trim() : resto.username || 'Restaurant Partner',
              categoryName: resto.categoryName || resto.businessCategoryName || resto.businessType || 'Multi-Cuisine, Fast Food',
              businessCategoryId: resto.businessCategoryId ? String(resto.businessCategoryId) : '',
              businessCategoryName: resto.businessCategoryName || '',
              businessType: resto.businessType || '',
              partnerType: resto.partnerType || '',
              restaurantName: resto.restaurantName || resto.name || '',
              phoneNumber: resto.phoneNumber || resto.phone || '',
              address: canonical.address,
              fullAddress: canonical.address,
              location: canonical.address,
              latitude: canonical.latitude,
              longitude: canonical.longitude,
              featuredDish,
              rating: (resto.rating !== undefined && resto.rating !== null && Number(resto.rating) > 0)
                ? Number(Number(resto.rating).toFixed(1))
                : null,
              reviewCount: Number(resto.reviewCount || resto.reviewsCount || resto.ratingCount || 0),
              reviewsCount: Number(resto.reviewCount || resto.reviewsCount || resto.ratingCount || 0),
              deliveryTime: resto.deliveryTime || canonical.deliveryTimeText,
              distanceKm: resto.distanceKm !== undefined && resto.distanceKm !== null ? Number(resto.distanceKm) : (canonical.distanceKm !== null ? canonical.distanceKm : null),
              distanceText: resto.distanceText || canonical.distanceText,
              priceForTwo: '₹200 for two',
              discountBadge: '',
              image: imgUrl,
              images: finalImages,
              itemImages: resto.itemImages || [],
              menuItems: resto.menuItems || [],
              freeDelivery: false,
              isOnline,
              restaurant_status: isOnline ? 'online' : 'offline',
              rawUser: {
                ...resto,
                isOnline,
                restaurant_status: isOnline ? 'online' : 'offline',
              },
            };
          });

          // Strict 5.0 KM Haversine filtering when customer coordinates are available
          const finalRestos = activeCustomerCoords
            ? restos.filter((r) => {
                if (!r.latitude || !r.longitude || r.latitude === 0 || r.longitude === 0) return false;
                if (r.distanceKm === null || isNaN(r.distanceKm)) return false;
                return r.distanceKm <= 5.0; // Strictly 5.0 KM radius
              }).sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0))
            : restos;

          // Update memory cache
          this.memoryRestos = finalRestos;
          this.memoryDishes = dishes;
          this.memoryTimestamp = Date.now();

          // Persist to disk asynchronously
          Promise.all([
            AsyncStorage.setItem(CACHE_KEY_RESTOS, JSON.stringify(finalRestos)),
            AsyncStorage.setItem(CACHE_KEY_DISHES, JSON.stringify(dishes)),
            AsyncStorage.setItem(CACHE_KEY_TIMESTAMP, String(this.memoryTimestamp)),
          ]).catch(() => {});

          return {
            restaurants: finalRestos,
            popularDishes: dishes,
            fromCache: false,
            isStale: false,
            error: null,
          };
        }
      } catch (err: any) {
        lastError = err;
        // If first attempt failed and we have no fallback, wait 1s before retrying
        if (attempt === 1 && !hasFallback) {
          await new Promise<void>((resolve) => setTimeout(() => resolve(), 1000));
        }
      }
    }

    // Network completely failed after retries: fallback to cached data if available
    const errorMsg = lastError?.message || 'Network request failed';
    console.warn('[RestaurantDataService] Network fetch failed, using cache if available:', errorMsg);

    return {
      restaurants: this.memoryRestos || [],
      popularDishes: this.memoryDishes || [],
      fromCache: Boolean(this.memoryRestos && this.memoryRestos.length > 0),
      isStale: true,
      error: hasFallback ? 'Unable to refresh. Showing latest available restaurants.' : errorMsg,
    };
  }

  /**
   * Get restaurant menu with caching and deduplication
   */
  public async getRestaurantMenu(
    restaurantId: string,
    forceRefresh: boolean = false
  ): Promise<{ items: any[]; categories: any[]; fromCache: boolean; error: string | null }> {
    const cacheKey = `${MENU_CACHE_PREFIX}${restaurantId}`;

    // Check disk cache first
    let cachedItems: any[] | null = null;
    let cachedCats: any[] | null = null;

    try {
      const raw = await AsyncStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        cachedItems = parsed.items || [];
        cachedCats = parsed.categories || [];
      }
    } catch (e) {}

    const hasCachedMenu = Boolean(cachedItems && cachedItems.length > 0);

    if (hasCachedMenu && !forceRefresh) {
      // Trigger background refresh silently
      this.fetchMenuFromNetwork(restaurantId, cacheKey).catch(() => {});
      return {
        items: cachedItems || [],
        categories: cachedCats || [],
        fromCache: true,
        error: null,
      };
    }

    // Deduplicate in-flight requests for this restaurant
    if (this.inFlightMenuPromises.has(restaurantId)) {
      return this.inFlightMenuPromises.get(restaurantId)!;
    }

    const fetchPromise = this.fetchMenuFromNetwork(restaurantId, cacheKey)
      .finally(() => {
        this.inFlightMenuPromises.delete(restaurantId);
      });

    this.inFlightMenuPromises.set(restaurantId, fetchPromise);
    return fetchPromise;
  }

  private async fetchMenuFromNetwork(
    restaurantId: string,
    cacheKey: string
  ): Promise<{ items: any[]; categories: any[]; fromCache: boolean; error: string | null }> {
    try {
      const [menuRes, catRes] = await Promise.allSettled([
        api.get(`/menu/${restaurantId}?forCustomer=true`, { timeout: API_TIMEOUT_MS }),
        api.get(`/menu/categories/${restaurantId}`, { timeout: API_TIMEOUT_MS }),
      ]);

      let items: any[] = [];
      let categories: any[] = [];

      if (menuRes.status === 'fulfilled' && menuRes.value.data?.success) {
        items = (menuRes.value.data.items || []).filter((i: any) => i.isAvailable !== false);
      }

      if (catRes.status === 'fulfilled' && catRes.value.data?.success) {
        categories = catRes.value.data.categories || [];
      }

      // If categories were empty from API, extract distinct categories from items
      if (categories.length === 0 && items.length > 0) {
        const distinct = Array.from(new Set(items.map((i) => i.category).filter(Boolean)));
        categories = distinct.map((name) => ({ name }));
      }

      // If network returned 0 items, check if cache already has valid items to avoid wiping them out
      if (items.length === 0) {
        try {
          const raw = await AsyncStorage.getItem(cacheKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.items && parsed.items.length > 0) {
              return {
                items: parsed.items,
                categories: categories.length > 0 ? categories : (parsed.categories || []),
                fromCache: true,
                error: null,
              };
            }
          }
        } catch (e) {}
      } else {
        // Persist valid items to cache
        AsyncStorage.setItem(
          cacheKey,
          JSON.stringify({ items, categories, timestamp: Date.now() })
        ).catch(() => {});
      }

      return {
        items,
        categories,
        fromCache: false,
        error: null,
      };
    } catch (e: any) {
      // Try to read last known cache
      try {
        const raw = await AsyncStorage.getItem(cacheKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          return {
            items: parsed.items || [],
            categories: parsed.categories || [],
            fromCache: true,
            error: 'Unable to refresh. Showing latest menu.',
          };
        }
      } catch (err) {}

      return {
        items: [],
        categories: [],
        fromCache: false,
        error: 'Unable to load menu. Please retry.',
      };
    }
  }

  /**
   * Update restaurant name in memory and disk cache immediately
   */
  public async updateRestaurantNameInCache(restaurantId: string, newName: string): Promise<void> {
    const rIdStr = String(restaurantId);
    if (this.memoryRestos && this.memoryRestos.length > 0) {
      this.memoryRestos = this.memoryRestos.map((r) => {
        const matches =
          String(r._id) === rIdStr ||
          String(r.id) === rIdStr ||
          String(r.rawUser?._id) === rIdStr ||
          String(r.rawUser?.id) === rIdStr;
        return matches ? { ...r, name: newName, rawUser: { ...(r.rawUser || {}), name: newName } } : r;
      });
      try {
        await AsyncStorage.setItem(CACHE_KEY_RESTOS, JSON.stringify(this.memoryRestos));
      } catch (e) {}
    }
    this.memoryTimestamp = 0;
  }

  /**
   * Fetch real-time meal completion suggestions for a restaurant's cart
   */
  public async getCartSuggestions(
    restaurantId: string,
    excludeItemIds: string[] = []
  ): Promise<any[]> {
    try {
      const excludeQuery = excludeItemIds.length > 0 ? `?excludeItemIds=${excludeItemIds.join(',')}` : '';
      const res = await api.get(`/menu/suggestions/${restaurantId}${excludeQuery}`, { timeout: 6000 });
      if (res.data?.success && Array.isArray(res.data.suggestions)) {
        return res.data.suggestions.filter((i: any) => i.isAvailable !== false);
      }
      return [];
    } catch (e) {
      console.log('[GET CART SUGGESTIONS NOTICE]', e);
      return [];
    }
  }

  /**
   * Validate menu item availability & latest price before adding to cart
   */
  public async validateCartItem(
    restaurantId: string,
    itemId: string
  ): Promise<{ success: boolean; isAvailable: boolean; item?: any; message?: string }> {
    try {
      const res = await api.post(
        '/menu/validate-item',
        { restaurantId, itemId },
        { timeout: 5000 }
      );
      if (res.data) {
        return res.data;
      }
      return { success: false, isAvailable: false, message: 'Could not validate item' };
    } catch (e: any) {
      const msg = e.response?.data?.message || 'This item is currently unavailable.';
      return { success: false, isAvailable: false, message: msg };
    }
  }

  /**
   * Invalidate cache completely so next fetch hits the network
   */
  public async invalidateCache(): Promise<void> {
    this.memoryTimestamp = 0;
    try {
      await AsyncStorage.removeItem(CACHE_KEY_TIMESTAMP);
    } catch (e) {}
  }

  /**
   * Clear all restaurant and dish cache
   */
  public async clearAllCache(): Promise<void> {
    this.memoryRestos = [];
    this.memoryDishes = [];
    this.memoryTimestamp = 0;
    try {
      await AsyncStorage.multiRemove([CACHE_KEY_RESTOS, CACHE_KEY_DISHES, CACHE_KEY_TIMESTAMP]);
    } catch (e) {}
  }
}

export const restaurantDataService = new RestaurantDataService();
export default restaurantDataService;
