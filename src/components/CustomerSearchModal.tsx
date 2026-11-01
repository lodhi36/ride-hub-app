import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  Dimensions,
  Modal,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from './PngIcon';
import VoiceSearchModal from './VoiceSearchModal';
import { getCanonicalRestaurantLocation } from '../services/LocationAddressService';
import { useTheme } from '../context/ThemeContext';

const { width } = Dimensions.get('window');
const RECENT_SEARCHES_STORAGE_KEY = 'customer_recent_searches_v2';

interface CustomerSearchModalProps {
  visible: boolean;
  onClose: () => void;
  navigation: any;
  restaurants: any[];
  customerCoords: { latitude: number; longitude: number } | null;
}

export default function CustomerSearchModal({
  visible,
  onClose,
  navigation,
  restaurants = [],
  customerCoords,
}: CustomerSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const searchInputRef = useRef<TextInput>(null);

  // 1. Helper: Check if a restaurant is strictly Online & Approved
  const isStoreOnline = (resto: any): boolean => {
    if (!resto) return false;
    const role = String(resto.role || resto.rawUser?.role || '').toLowerCase();
    const isSellerRole = role === 'restaurant' || role === 'supplier' || role === 'seller' || role === 'driver' || role === 'business';
    const isBus = Boolean(resto.isBusinessAccount || resto.rawUser?.isBusinessAccount || resto.businessName || resto.restaurantName || isSellerRole);
    if (!isBus) return false;

    const appStatus = String(resto.approvalStatus || resto.rawUser?.approvalStatus || '').toUpperCase();
    if (appStatus && appStatus !== 'APPROVED') return false;

    return Boolean(
      resto.isOnline === true ||
      resto.rawUser?.isOnline === true ||
      resto.restaurant_status === 'online' ||
      resto.rawUser?.restaurant_status === 'online' ||
      resto.status === 'online' ||
      resto.rawUser?.status === 'online'
    );
  };

  // 2. Filter strictly eligible Online Stores with at least 1 in-stock item
  const eligibleStores = useMemo(() => {
    return (restaurants || []).filter((r) => {
      if (!isStoreOnline(r)) return false;
      const items = Array.isArray(r.menuItems) ? r.menuItems : (Array.isArray(r.rawUser?.menuItems) ? r.rawUser.menuItems : []);
      return items.some((it: any) => it && it.name && it.isAvailable !== false && it.inStock !== false && it.isActive !== false);
    });
  }, [restaurants]);

  // 3. Extract all Real In-Stock Dishes from eligible stores
  const allAvailableDishes = useMemo(() => {
    const list: any[] = [];
    eligibleStores.forEach((resto) => {
      const items = Array.isArray(resto.menuItems) ? resto.menuItems : (Array.isArray(resto.rawUser?.menuItems) ? resto.rawUser.menuItems : []);
      items.forEach((item: any) => {
        if (item && item.name && String(item.name).trim() && item.isAvailable !== false && item.inStock !== false && item.isActive !== false) {
          list.push({
            ...item,
            restaurant: resto,
          });
        }
      });
    });
    return list;
  }, [eligibleStores]);

  // 4. Distinct Real Categories available in eligible stores
  const availableCategories = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    allAvailableDishes.forEach((d) => {
      const catName = (d.category || d.categoryName || d.restaurant?.categoryName || 'General').trim();
      if (catName) {
        const existing = map.get(catName.toLowerCase());
        if (existing) {
          existing.count += 1;
        } else {
          map.set(catName.toLowerCase(), { name: catName, count: 1 });
        }
      }
    });
    return Array.from(map.values());
  }, [allAvailableDishes]);

  // Load Recent Searches on Mount & Visibility
  useEffect(() => {
    if (visible) {
      loadRecentSearches();
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    } else {
      setSearchQuery('');
      Keyboard.dismiss();
    }
  }, [visible]);

  const loadRecentSearches = async () => {
    try {
      const saved = await AsyncStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRecentSearches(parsed.slice(0, 8));
          return;
        }
      }
      setRecentSearches([]);
    } catch (e) {
      setRecentSearches([]);
    }
  };

  const saveRecentSearch = async (term: string) => {
    const clean = term.trim();
    if (!clean) return;
    try {
      const updated = [clean, ...recentSearches.filter((s) => s.toLowerCase() !== clean.toLowerCase())].slice(0, 10);
      setRecentSearches(updated);
      await AsyncStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {}
  };

  const handleClearRecentSearches = async () => {
    try {
      setRecentSearches([]);
      await AsyncStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
    } catch (e) {}
  };

  const handleSelectQuery = (term: string) => {
    setSearchQuery(term);
    saveRecentSearch(term);
    Keyboard.dismiss();
  };

  // Real Search Filtering across real MongoDB online restaurants & in-stock dishes
  const { matchedDishes, matchedRestaurants } = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return { matchedDishes: [], matchedRestaurants: [] };
    }

    const dishes: any[] = [];
    const restos: any[] = [];

    eligibleStores.forEach((resto) => {
      const rName = (resto.name || resto.restaurantName || resto.username || '').toLowerCase();
      const rCat = (resto.categoryName || resto.businessCategoryName || resto.partnerType || '').toLowerCase();
      const rAddr = (resto.address || resto.fullAddress || resto.businessAddress || '').toLowerCase();

      const restoMatches = rName.includes(q) || rCat.includes(q) || rAddr.includes(q);
      if (restoMatches) {
        restos.push(resto);
      }

      // Check in-stock menu items
      const items = Array.isArray(resto.menuItems) ? resto.menuItems : (Array.isArray(resto.rawUser?.menuItems) ? resto.rawUser.menuItems : []);
      items.forEach((item: any) => {
        if (!item || !item.name || item.isAvailable === false || item.inStock === false || item.isActive === false) return;
        const iName = String(item.name).toLowerCase();
        const iCat = String(item.category || item.categoryName || '').toLowerCase();
        const iDesc = String(item.description || '').toLowerCase();

        if (iName.includes(q) || iCat.includes(q) || iDesc.includes(q)) {
          dishes.push({
            ...item,
            restaurant: resto,
          });
        }
      });
    });

    return { matchedDishes: dishes, matchedRestaurants: restos };
  }, [searchQuery, eligibleStores]);

  const hasQuery = searchQuery.trim().length > 0;
  const isServiceAvailable = eligibleStores.length > 0 && allAvailableDishes.length > 0;

  const { isDark, currentColors } = useTheme('customer');

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, isDark && { backgroundColor: currentColors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? currentColors.surface : '#FFFFFF'} />

        {/* ── TOP SEARCH HEADER ── */}
        <View style={[styles.headerRow, isDark && { backgroundColor: currentColors.surface, borderBottomColor: currentColors.border }]}>
          {/* Back Arrow Button */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <Text style={[styles.backArrowText, isDark && { color: currentColors.primaryText }]}>‹</Text>
          </TouchableOpacity>

          {/* Search Input Box */}
          <View style={[styles.searchBarBox, isDark && { backgroundColor: currentColors.inputBackground, borderColor: currentColors.border }]}>
            <TextInput
              ref={searchInputRef}
              style={[styles.searchInput, isDark && { color: currentColors.primaryText }]}
              placeholder="Search items or stores..."
              placeholderTextColor={isDark ? currentColors.disabled : '#94A3B8'}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={() => {
                if (searchQuery.trim()) {
                  saveRecentSearch(searchQuery.trim());
                }
              }}
              returnKeyType="search"
            />

            {/* Clear Button (if query present) */}
            {hasQuery ? (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                style={styles.clearBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.clearBtnText}>✕</Text>
              </TouchableOpacity>
            ) : null}

            {/* Microphone Button */}
            <TouchableOpacity
              style={styles.micBtn}
              onPress={() => setShowVoiceModal(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={{ fontSize: 18 }}>🎙️</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── SEARCH BODY CONTAINER ── */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {!isServiceAvailable ? (
            /* ══════════════════════════════════════════════════
               CASE 1: NO ONLINE STORES / ITEMS
               ══════════════════════════════════════════════════ */
            <View style={styles.serviceUnavailableWrap}>
              <View style={styles.serviceUnavailableIconCircle}>
                <Text style={{ fontSize: 36 }}>🏪</Text>
              </View>
              <Text style={styles.serviceUnavailableTitle}>No active stores nearby</Text>
              <Text style={styles.serviceUnavailableSub}>
                Stores in this area may currently be offline. Please check back soon or explore our categories.
              </Text>
            </View>
          ) : hasQuery ? (
            /* ══════════════════════════════════════════════════
               CASE 2: LIVE SEARCH RESULTS (STRICTLY REAL IN-STOCK ITEMS)
               ══════════════════════════════════════════════════ */
            <View style={styles.resultsContainer}>
              <View style={styles.resultsHeaderRow}>
                <Text style={styles.resultsCountText}>
                  Results for "{searchQuery}" ({matchedDishes.length + matchedRestaurants.length})
                </Text>
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Text style={styles.resultsClearLink}>Clear</Text>
                </TouchableOpacity>
              </View>

              {/* Matched Real Dishes */}
              {matchedDishes.length > 0 && (
                <View style={{ marginBottom: 20 }}>
                  <Text style={styles.subSectionTitle}>In-Stock Items</Text>
                  {matchedDishes.map((dish, idx) => {
                    const resto = dish.restaurant || {};
                    const restoName = resto.name || resto.restaurantName || 'Partner Store';
                    const dishPrice = dish.price ? `₹${dish.price}` : (dish.rawPrice ? `₹${dish.rawPrice}` : '');
                    const loc = getCanonicalRestaurantLocation(resto, customerCoords, 'SearchModal');
                    const hasRealImg = Boolean(
                      dish.image &&
                      typeof dish.image === 'string' &&
                      !dish.image.includes('unsplash') &&
                      (dish.image.startsWith('http') || dish.image.startsWith('file://') || dish.image.startsWith('data:image'))
                    );

                    return (
                      <TouchableOpacity
                        key={`dish_${dish.id || dish._id || idx}_${resto._id || idx}`}
                        style={styles.dishCard}
                        activeOpacity={0.85}
                        onPress={() => {
                          saveRecentSearch(dish.name || searchQuery);
                          onClose();
                          navigation.navigate('ItemDetailsScreen', {
                            item: dish,
                            restaurantId: resto._id || resto.id,
                            restaurant: resto.rawUser || resto,
                            customerCoords,
                          });
                        }}
                      >
                        {hasRealImg ? (
                          <Image
                            source={{ uri: dish.image }}
                            style={styles.dishCardImg}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.dishPlaceholderImg}>
                            <Text style={{ fontSize: 28 }}>📦</Text>
                          </View>
                        )}
                        <View style={styles.dishCardDetails}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Text style={styles.dishCardTitle} numberOfLines={1}>
                              {dish.name}
                            </Text>
                            {dishPrice ? <Text style={styles.dishCardPrice}>{dishPrice}</Text> : null}
                          </View>
                          <Text style={styles.dishCardStoreName} numberOfLines={1}>
                            🏪 {restoName}
                          </Text>
                          <View style={styles.dishCardMetaRow}>
                            <Text style={styles.dishCardMeta}>📍 {loc.distanceText || 'Nearby'}</Text>
                            <Text style={styles.metaDot}>•</Text>
                            <Text style={styles.dishCardCategoryBadge}>{dish.category || resto.categoryName || 'Item'}</Text>
                            <Text style={styles.metaDot}>•</Text>
                            <Text style={styles.dishCardAction}>View Item ›</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Matched Real Stores */}
              {matchedRestaurants.length > 0 && (
                <View style={{ marginBottom: 20 }}>
                  <Text style={styles.subSectionTitle}>Online Stores</Text>
                  {matchedRestaurants.map((resto, idx) => {
                    const restoName = resto.name || resto.restaurantName || resto.username || 'Store';
                    const rawRestoImg = resto.coverImage || resto.profilePicture || resto.image;
                    const hasRealRestoImg = Boolean(rawRestoImg && !rawRestoImg.includes('unsplash'));
                    const loc = getCanonicalRestaurantLocation(resto, customerCoords, 'SearchModal');

                    return (
                      <TouchableOpacity
                        key={`resto_${resto._id || resto.id || idx}`}
                        style={styles.storeCard}
                        activeOpacity={0.85}
                        onPress={() => {
                          saveRecentSearch(restoName);
                          onClose();
                          navigation.navigate('RestaurantMenuScreen', {
                            restaurantId: resto._id || resto.id,
                            restaurant: resto,
                            customerCoords,
                          });
                        }}
                      >
                        {hasRealRestoImg ? (
                          <Image source={{ uri: rawRestoImg }} style={styles.storeCardImg} resizeMode="cover" />
                        ) : (
                          <View style={styles.storePlaceholderImg}>
                            <Text style={{ fontSize: 28 }}>🏪</Text>
                          </View>
                        )}
                        <View style={styles.storeCardDetails}>
                          <Text style={styles.storeCardTitle} numberOfLines={1}>
                            🏪 {restoName}
                          </Text>
                          <Text style={styles.storeCardCategory} numberOfLines={1}>
                            {resto.categoryName || resto.partnerType || 'Store'}
                          </Text>
                          <View style={styles.dishCardMetaRow}>
                            <Text style={styles.dishCardMeta}>📍 {loc.distanceText || 'Nearby'}</Text>
                            <Text style={styles.metaDot}>•</Text>
                            <Text style={styles.dishCardAction}>Open Store ›</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* No items matched -> STRICT "No results found" */}
              {matchedDishes.length === 0 && matchedRestaurants.length === 0 && (
                <View style={styles.emptyContainer}>
                  <View style={styles.notAvailableIconCircle}>
                    <Text style={{ fontSize: 34 }}>🔍</Text>
                  </View>
                  <Text style={styles.emptyTitle}>No results found</Text>
                  <Text style={styles.emptySubtitle}>
                    No matching in-stock items found for "{searchQuery}".
                  </Text>
                  <TouchableOpacity
                    style={styles.emptyClearBtn}
                    onPress={() => setSearchQuery('')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.emptyClearBtnText}>✕ Clear Search</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            /* ══════════════════════════════════════════════════
               CASE 3: ZERO-STATE SEARCH (ONLY REAL USER DATA & REAL IN-STOCK CATEGORIES)
               ══════════════════════════════════════════════════ */
            <>
              {/* 1. Real Recent Searches (Only if user actually searched previously) */}
              {recentSearches.length > 0 && (
                <View style={styles.recentSection}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionHeaderTitle}>YOUR RECENT SEARCHES</Text>
                    <TouchableOpacity onPress={handleClearRecentSearches} activeOpacity={0.7}>
                      <Text style={styles.clearRecentLink}>Clear</Text>
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.recentChipsRow}
                  >
                    {recentSearches.map((term, index) => (
                      <TouchableOpacity
                        key={`recent_${index}_${term}`}
                        style={styles.recentChip}
                        onPress={() => handleSelectQuery(term)}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.recentClockIcon}>⏱️</Text>
                        <Text style={styles.recentChipText} numberOfLines={1}>
                          {term}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* 2. Real Available Categories in Online Stores */}
              {availableCategories.length > 0 && (
                <View style={styles.availableCategoriesSection}>
                  <Text style={styles.sectionHeaderTitle}>AVAILABLE CATEGORIES</Text>
                  <View style={styles.categoriesWrap}>
                    {availableCategories.map((cat, cIdx) => (
                      <TouchableOpacity
                        key={`avail_cat_${cIdx}_${cat.name}`}
                        style={styles.categoryPill}
                        onPress={() => handleSelectQuery(cat.name)}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.categoryPillText}>{cat.name}</Text>
                        <View style={styles.categoryCountBadge}>
                          <Text style={styles.categoryCountText}>{cat.count}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* 3. Real In-Stock Items Available Now */}
              {allAvailableDishes.length > 0 && (
                <View style={styles.availableItemsSection}>
                  <Text style={styles.sectionHeaderTitle}>AVAILABLE IN-STOCK ITEMS</Text>
                  {allAvailableDishes.slice(0, 10).map((dish, idx) => {
                    const resto = dish.restaurant || {};
                    const restoName = resto.name || resto.restaurantName || 'Partner Store';
                    const dishPrice = dish.price ? `₹${dish.price}` : '';
                    const hasRealImg = Boolean(
                      dish.image &&
                      typeof dish.image === 'string' &&
                      !dish.image.includes('unsplash') &&
                      (dish.image.startsWith('http') || dish.image.startsWith('file://') || dish.image.startsWith('data:image'))
                    );

                    return (
                      <TouchableOpacity
                        key={`live_dish_${dish.id || dish._id || idx}`}
                        style={styles.dishCard}
                        activeOpacity={0.85}
                        onPress={() => {
                          saveRecentSearch(dish.name);
                          onClose();
                          navigation.navigate('ItemDetailsScreen', {
                            item: dish,
                            restaurantId: resto._id || resto.id,
                            restaurant: resto.rawUser || resto,
                            customerCoords,
                          });
                        }}
                      >
                        {hasRealImg ? (
                          <Image source={{ uri: dish.image }} style={styles.dishCardImg} resizeMode="cover" />
                        ) : (
                          <View style={styles.dishPlaceholderImg}>
                            <Text style={{ fontSize: 28 }}>📦</Text>
                          </View>
                        )}
                        <View style={styles.dishCardDetails}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Text style={styles.dishCardTitle} numberOfLines={1}>
                              {dish.name}
                            </Text>
                            {dishPrice ? <Text style={styles.dishCardPrice}>{dishPrice}</Text> : null}
                          </View>
                          <Text style={styles.dishCardStoreName} numberOfLines={1}>
                            🏪 {restoName}
                          </Text>
                          <View style={styles.dishCardMetaRow}>
                            <Text style={styles.dishCardCategoryBadge}>{dish.category || 'In Stock'}</Text>
                            <Text style={styles.metaDot}>•</Text>
                            <Text style={styles.dishCardAction}>View Item ›</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* Voice Search Modal */}
        <VoiceSearchModal
          visible={showVoiceModal}
          onClose={() => setShowVoiceModal(false)}
          onResult={(spokenText: string) => {
            setShowVoiceModal(false);
            if (spokenText) {
              handleSelectQuery(spokenText);
            }
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  backArrowText: {
    fontSize: 34,
    color: '#E11D48',
    fontWeight: '300',
    lineHeight: 34,
    marginTop: -4,
  },
  searchBarBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '500',
    paddingVertical: 0,
  },
  clearBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  clearBtnText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '700',
  },
  micBtn: {
    paddingLeft: 8,
    paddingVertical: 4,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // Service not available
  serviceUnavailableWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 28,
  },
  serviceUnavailableIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  serviceUnavailableTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  serviceUnavailableSub: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
  },

  // Recent searches
  recentSection: {
    marginTop: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionHeaderTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  clearRecentLink: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#EF4444',
  },
  recentChipsRow: {
    gap: 8,
    paddingRight: 16,
  },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 5,
  },
  recentClockIcon: {
    fontSize: 12,
  },
  recentChipText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
    maxWidth: 150,
  },

  // Available Categories
  availableCategoriesSection: {
    paddingHorizontal: 16,
    marginBottom: 20,
    marginTop: 6,
  },
  categoriesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  categoryCountBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  categoryCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E40AF',
  },

  // Available Items
  availableItemsSection: {
    paddingHorizontal: 16,
  },

  // Results
  resultsContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  resultsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  resultsCountText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  resultsClearLink: {
    fontSize: 13,
    color: '#E11D48',
    fontWeight: '700',
  },
  subSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },

  // Dish Card
  dishCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    alignItems: 'center',
  },
  dishCardImg: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  dishPlaceholderImg: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dishCardDetails: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  dishCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    marginRight: 6,
  },
  dishCardPrice: {
    fontSize: 15,
    fontWeight: '900',
    color: '#16A34A',
  },
  dishCardStoreName: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  dishCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    flexWrap: 'wrap',
  },
  dishCardMeta: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
  dishCardCategoryBadge: {
    fontSize: 11,
    color: '#2563EB',
    fontWeight: '700',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  metaDot: {
    marginHorizontal: 5,
    color: '#CBD5E1',
    fontSize: 10,
  },
  dishCardAction: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#E11D48',
  },

  // Store Card
  storeCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    alignItems: 'center',
  },
  storeCardImg: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  storePlaceholderImg: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  storeCardDetails: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  storeCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  storeCardCategory: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  notAvailableIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
    lineHeight: 18,
  },
  emptyClearBtn: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
  },
  emptyClearBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
