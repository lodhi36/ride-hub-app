import { LottieAnimation } from './LottieAnimation';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Image,
  Dimensions,
  StyleSheet,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TouchableOpacity,
  Text,
} from 'react-native';
import api from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveUploadUrl } from '../config/apiConfig';
import { useSocket } from '../context/SocketContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface BannerItem {
  _id?: string;
  id?: string;
  imageUrl?: string;
  mediaUrl?: string;
  mediaType?: 'IMAGE' | 'LOTTIE' | 'BOTH';
  lottieUrl?: string;
  lottieConfig?: any;
  target?: string;
  order?: number;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface RoleBannerCarouselProps {
  target: 'USER' | 'RIDER' | 'SUPPLIER' | string;
  category?: string;
  containerMarginHorizontal?: number;
  containerMarginTop?: number;
  containerMarginBottom?: number;
  borderRadius?: number;
  aspectRatio?: number;
  height?: number;
  autoSlideInterval?: number; // 6 seconds default
  resizeMode?: 'contain' | 'cover' | 'stretch' | 'center';
  onBannerPress?: (banner: BannerItem) => void;
}

const resolveBannerUri = (img?: string, item?: BannerItem) => {
  if (!img || typeof img !== 'string') return null;
  const resolved = resolveUploadUrl(img);
  if (!resolved) return null;
  if (resolved.startsWith('data:')) return resolved;
  // Strictly use a stable version from the item to prevent infinite re-render loops and WebView reloads!
  const version = item?.updatedAt || item?.createdAt;
  if (!version) return resolved;
  const vTime = new Date(version).getTime();
  return Number.isNaN(vTime) ? resolved : (resolved.includes('?') ? resolved : `${resolved}?v=${vTime}`);
};

export const RoleBannerCarousel: React.FC<RoleBannerCarouselProps> = ({
  target,
  category,
  containerMarginHorizontal = 12,
  containerMarginTop = 10,
  containerMarginBottom,
  borderRadius = 16,
  aspectRatio = 2.1,
  height,
  autoSlideInterval = 6000,
  resizeMode = 'cover',
  onBannerPress,
}) => {
  const [banners, setBanners] = useState<BannerItem[]>(() => {
    const norm = (target || 'USER').toUpperCase();
    if (norm === 'USER') {
      return [{
        id: 'default_home_hero',
        imageUrl: '/uploads/screen-customer_home-1793402905146-353504771.png',
        target: 'USER',
        status: 'Active',
        order: 0,
      }];
    }
    return [];
  });
  const [failedBanners, setFailedBanners] = useState<{ [key: string]: boolean }>({});
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [detectedAspectRatio, setDetectedAspectRatio] = useState<number>(aspectRatio);

  const [isUserInteracting, setIsUserInteracting] = useState(false);
  const interactionTimerRef = useRef<any>(null);
  const scrollRef = useRef<ScrollView>(null);
  const timerRef = useRef<any>(null);
  const { socket } = useSocket();

  const bannerWidth = SCREEN_WIDTH - containerMarginHorizontal * 2;
  const effectiveAspectRatio = detectedAspectRatio || aspectRatio || 2.1;
  const bannerHeight = height ? height : Math.round(bannerWidth / effectiveAspectRatio);

  const fetchBanners = useCallback(async () => {
    try {
      setLoading(true);
      const normTarget = (target || 'USER').toUpperCase();
      const res = await api.get(`/banner?target=${normTarget}&status=Active`).catch(() => null);

      let list: BannerItem[] = [];
      if (res?.data?.success && Array.isArray(res.data.data)) {
        list = res.data.data.filter((b: any) => {
          const t = String(b.target || '').toUpperCase();
          if (normTarget === 'SUPPLIER') {
            return t === 'SUPPLIER' || t === 'RESTAURANT' || t === 'STORE';
          }
          if (normTarget === 'RIDER') {
            return t === 'RIDER' || t === 'DELIVERY';
          }
          return t === 'USER' || t === 'CUSTOMER' || !b.target;
        });
      }

      // If category is provided and returned banners are empty, check category banners ONLY for USER/CUSTOMER (never for SUPPLIER or RIDER!)
      if (normTarget === 'USER' && list.length === 0 && category && typeof category === 'string' && category.trim()) {
        const cleanCat = category.trim().toUpperCase().replace(/\s+/g, '_');
        if (cleanCat !== normTarget) {
          const catRes = await api.get(`/banner?target=${cleanCat}&status=Active`).catch(() => null);
          if (catRes?.data?.success && Array.isArray(catRes.data.data)) {
            list = catRes.data.data;
          }
        }
      }

      // Sort by order ascending
      list.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

      // Strictly deduplicate by clean URL to prevent duplicate identical banners from rendering
      const seenUrls = new Set<string>();
      const uniqueList: BannerItem[] = [];
      for (const item of list) {
        const raw = String(item.imageUrl || item.mediaUrl || '').split('?')[0].trim();
        if (raw && !seenUrls.has(raw)) {
          seenUrls.add(raw);
          uniqueList.push(item);
        }
      }

      // Check ScreenMedia for Admin-uploaded Lottie animation and display settings
      try {
        const smRes = await api.get('/screen-media').catch(() => null);
        if (smRes?.data?.screens && Array.isArray(smRes.data.screens)) {
          const matchKey =
            normTarget === 'USER'
              ? 'CUSTOMER_HOME'
              : normTarget === 'SUPPLIER'
              ? 'SUPPLIER_HOME'
              : normTarget === 'RIDER'
              ? 'RIDER_HOME'
              : normTarget;
          const sm = smRes.data.screens.find(
            (s: any) =>
              String(s.screenId).toUpperCase() === matchKey ||
              (normTarget === 'USER' && String(s.screenId).toUpperCase() === 'HOME')
          );
          if (sm) {
            const isInactive =
              sm.isActive === false ||
              sm.displayMode === 'NONE' ||
              sm.currentMediaType === 'NONE' ||
              (!sm.imageUrl && !sm.mediaUrl && !sm.lottieUrl && !sm.lottieConfig?.rawJson);

            if (isInactive) {
              // Admin has explicitly cleared / set media to NONE for this screen: strictly show 0 banners!
              uniqueList.length = 0;
            } else {
              const displayMode = (sm.displayMode || 'BOTH').toUpperCase();
              const hasLottie = Boolean(sm.lottieUrl || sm.lottieConfig?.rawJson);

              // If displayMode or currentMediaType is LOTTIE only, filter out images
              if (displayMode === 'LOTTIE' || sm.currentMediaType === 'LOTTIE') {
                uniqueList.length = 0;
              }

              // If displayMode allows LOTTIE, add the Lottie item
              if (
                (displayMode === 'BOTH' || displayMode === 'LOTTIE' || sm.currentMediaType === 'BOTH' || sm.currentMediaType === 'LOTTIE') &&
                hasLottie
              ) {
                uniqueList.push({
                  id: `sm_lottie_${sm.screenId}`,
                  mediaType: 'LOTTIE',
                  lottieUrl: sm.lottieUrl,
                  lottieConfig: sm.lottieConfig,
                  title: sm.title || 'Festival Animation',
                  order: uniqueList.length === 0 ? 0 : 2,
                  updatedAt: sm.publishedAt || sm.updatedAt || '1',
                });
              }
            }
          }
        }
      } catch (_) {}

      // NOTE: Strictly no artificial/dummy fallback. When admin has 0 banners/animations, render nothing.
      const upToThree = uniqueList.slice(0, 4);

      setBanners(upToThree);
      setFailedBanners({});

      const cacheKey = `@cached_role_banners_${normTarget}`;
      if (upToThree.length > 0) {
        AsyncStorage.setItem(cacheKey, JSON.stringify(upToThree)).catch(() => {});
      } else {
        AsyncStorage.removeItem(cacheKey).catch(() => {});
      }
    } catch (err) {
      console.log(`[RoleBannerCarousel] Error loading ${target} banners:`, err);
      setBanners([]);
    } finally {
      setLoading(false);
    }
  }, [target, category]);

  useEffect(() => {
    // Fast disk cache restore for instant zero-latency render
    const cacheKey = `@cached_role_banners_${(target || 'USER').toUpperCase()}`;
    AsyncStorage.getItem(cacheKey)
      .then((cached) => {
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setBanners(parsed.slice(0, 3));
              setLoading(false);
            }
          } catch (_) {}
        }
      })
      .catch(() => {});

    fetchBanners();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current);
    };
  }, [fetchBanners, target]);

  // Dynamically detect banner aspect ratio to prevent white/black gaps and cropping
  useEffect(() => {
    if (height) return;
    if (banners.length > 0) {
      const first = banners[0];
      const raw = first.imageUrl || first.mediaUrl;
      const uri = resolveBannerUri(raw, first);
      if (uri) {
        Image.getSize(
          uri,
          (w, h) => {
            if (w > 0 && h > 0) {
              const ratio = w / h;
              // Clamp between 1.6 and 2.5 for ideal mobile hero proportions
              const clamped = Math.max(1.6, Math.min(2.5, ratio));
              setDetectedAspectRatio(clamped);
            }
          },
          () => {}
        );
      }
    }
  }, [banners, height]);

  // Real-time banner updates via Socket.IO
  useEffect(() => {
    if (!socket) return;
    const handleBannerChange = () => {
      fetchBanners();
    };

    const handleBannerDelete = (payload?: any) => {
      const deletedId = payload?.id || payload?._id;
      if (deletedId) {
        setBanners((prev) => {
          const next = prev.filter((b) => (b._id || b.id) !== deletedId);
          const normTarget = (target || 'USER').toUpperCase();
          const cacheKey = `@cached_role_banners_${normTarget}`;
          if (next.length > 0) {
            AsyncStorage.setItem(cacheKey, JSON.stringify(next)).catch(() => {});
          } else {
            AsyncStorage.removeItem(cacheKey).catch(() => {});
          }
          return next;
        });
      }
      fetchBanners();
    };

    socket.on('banner_created', handleBannerChange);
    socket.on('banner_updated', handleBannerChange);
    socket.on('banner_deleted', handleBannerDelete);
    socket.on('banner_change', (payload?: any) => {
      if (payload?.type === 'delete') {
        handleBannerDelete(payload);
      } else {
        handleBannerChange();
      }
    });
    socket.on('BANNERS_UPDATED', handleBannerChange);
    socket.on('screen_media_updated', handleBannerChange);
    socket.on('screen_media_customer_home', handleBannerChange);
    socket.on('screen_media_supplier_home', handleBannerChange);
    socket.on('screen_media_rider_home', handleBannerChange);

    return () => {
      socket.off('banner_created', handleBannerChange);
      socket.off('banner_updated', handleBannerChange);
      socket.off('banner_deleted', handleBannerDelete);
      socket.off('banner_change', handleBannerChange);
      socket.off('BANNERS_UPDATED', handleBannerChange);
      socket.off('screen_media_updated', handleBannerChange);
      socket.off('screen_media_customer_home', handleBannerChange);
      socket.off('screen_media_supplier_home', handleBannerChange);
      socket.off('screen_media_rider_home', handleBannerChange);
    };
  }, [socket, fetchBanners, target]);

  const visibleBanners = banners.filter((b) => {
    const k = String(b._id || b.id || b.imageUrl || '');
    return !failedBanners[k];
  });

  // Auto-slide every 6 seconds if not currently interacting by hand
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (visibleBanners.length > 1 && !isUserInteracting) {
      timerRef.current = setInterval(() => {
        setActiveIndex((prev) => {
          const next = (prev + 1) % visibleBanners.length;
          scrollRef.current?.scrollTo({ x: next * bannerWidth, animated: true });
          return next;
        });
      }, autoSlideInterval);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visibleBanners.length, bannerWidth, autoSlideInterval, isUserInteracting]);

  // Hand Swipe Events
  const handleScrollBeginDrag = () => {
    setIsUserInteracting(true);
    if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current);
  };

  const handleScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / bannerWidth);
    if (index >= 0 && index < visibleBanners.length) {
      setActiveIndex(index);
    }
    if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current);
    interactionTimerRef.current = setTimeout(() => {
      setIsUserInteracting(false);
    }, 3500);
  };

  const handleMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / bannerWidth);
    if (index >= 0 && index < visibleBanners.length) {
      setActiveIndex(index);
    }
    if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current);
    interactionTimerRef.current = setTimeout(() => {
      setIsUserInteracting(false);
    }, 3500);
  };

  const handleDotPress = (idx: number) => {
    setActiveIndex(idx);
    scrollRef.current?.scrollTo({ x: idx * bannerWidth, animated: true });
    setIsUserInteracting(true);
    if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current);
    interactionTimerRef.current = setTimeout(() => {
      setIsUserInteracting(false);
    }, 3500);
  };

  // Requirement 3 & 5: When no active banners exist, render NULL so content moves upward naturally
  if (visibleBanners.length === 0) {
    return null;
  }

  return (
    <View style={[styles.container, {
        marginHorizontal: containerMarginHorizontal,
        marginTop: containerMarginTop !== undefined ? containerMarginTop : 10,
        marginBottom: containerMarginBottom !== undefined ? containerMarginBottom : (visibleBanners.length > 1 ? 4 : 10),
      }]}>
      {/* Banner Carousel Card */}
      <View
        style={[
          styles.bannerFrame,
          {
            width: bannerWidth,
            height: bannerHeight,
            borderRadius: borderRadius,
          },
        ]}
      >
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          scrollEventThrottle={16}
          style={{ width: bannerWidth, height: bannerHeight }}
        >
          {visibleBanners.map((item, idx) => {
            const itemKey = String(item._id || item.id || item.imageUrl || idx);

            if (item.mediaType === 'LOTTIE') {
              const lottieSrc = resolveBannerUri(item.lottieUrl, item) || item.lottieConfig?.rawJson;
              if (!lottieSrc) return null;
              return (
                <View
                  key={itemKey}
                  style={{
                    width: bannerWidth,
                    height: bannerHeight,
                    borderRadius: borderRadius,
                    overflow: 'hidden',
                    backgroundColor: 'transparent',
                  }}
                >
                  <LottieAnimation
                    source={lottieSrc}
                    width={bannerWidth}
                    height={bannerHeight}
                    preserveAspectRatio="xMidYMid meet"
                    loop={true}
                    autoPlay={true}
                  />
                </View>
              );
            }

            const rawImg = item.imageUrl || item.mediaUrl;
            const uri = resolveBannerUri(rawImg, item);
            if (!uri) return null;

            return (
              <TouchableOpacity
                key={itemKey}
                activeOpacity={onBannerPress ? 0.85 : 1}
                disabled={!onBannerPress}
                style={{ width: bannerWidth, height: bannerHeight }}
                onPress={() => onBannerPress && onBannerPress(item)}
              >
                <Image
                  source={{ uri }}
                  style={[
                    styles.bannerImage,
                    {
                      width: bannerWidth,
                      height: bannerHeight,
                      borderRadius: borderRadius,
                    },
                  ]}
                  resizeMode={resizeMode}
                  onError={() => {
                    console.log(`[RoleBannerCarousel] Banner image load error for ${uri}`);
                    setFailedBanners((prev) => ({ ...prev, [itemKey]: true }));
                  }}
                />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Pagination Dots (When multiple banners exist) */}
      {visibleBanners.length > 1 && (
        <View style={styles.paginationRow}>
          {visibleBanners.map((_, dotIdx) => (
            <TouchableOpacity
              key={dotIdx}
              onPress={() => handleDotPress(dotIdx)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <View
                style={[
                  styles.dot,
                  dotIdx === activeIndex ? styles.activeDot : styles.inactiveDot,
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

export default RoleBannerCarousel;

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
    alignItems: 'center',
  },
  bannerFrame: {
    backgroundColor: 'transparent',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  bannerImage: {
    backgroundColor: 'transparent',
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activeDot: {
    backgroundColor: '#0066FF',
    width: 18,
  },
  inactiveDot: {
    backgroundColor: '#CBD5E1',
  },
});
