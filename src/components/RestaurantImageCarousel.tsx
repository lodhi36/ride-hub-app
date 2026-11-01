import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
  AppState,
  AppStateStatus,
  TouchableOpacity,
  LayoutChangeEvent,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';

interface RestaurantImageCarouselProps {
  images: string[];
  restaurantId: string;
  restaurantName: string;
  height: number;
  width?: number | string;
  isOnline: boolean;
  rating: number | null;
  reviewCount?: number;
  featuredDish?: string;
  onPress?: () => void;
  autoSlideInterval?: number; // Milliseconds, defaults to 3500ms
}

export const RestaurantImageCarousel: React.FC<RestaurantImageCarouselProps> = React.memo(({
  images = [],
  restaurantId,
  restaurantName,
  height,
  width = '100%',
  isOnline,
  rating,
  reviewCount = 0,
  featuredDish,
  onPress,
  autoSlideInterval = 3500,
}) => {
  const isFocused = useIsFocused();
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [imageLoading, setImageLoading] = useState<{ [key: number]: boolean }>({});
  const [failedImages, setFailedImages] = useState<{ [key: string]: boolean }>({});

  const scrollViewRef = useRef<ScrollView>(null);
  const timerRef = useRef<any>(null);
  const isUserTouchingRef = useRef<boolean>(false);
  const currentIndexRef = useRef<number>(0);
  currentIndexRef.current = currentIndex;

  // Filter valid, non-failed images and cap at 5
  const validImages = useMemo(() => {
    if (!Array.isArray(images)) return [];
    return images
      .filter((img) => typeof img === 'string' && img.trim().length > 0 && !failedImages[img])
      .slice(0, 5);
  }, [images, failedImages]);

  const numImages = validImages.length;

  // Track layout width for pixel-perfect paging
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - containerWidth) > 1) {
      setContainerWidth(w);
    }
  }, [containerWidth]);

  // Handle image load events
  const handleImageLoadStart = (idx: number) => {
    setImageLoading((prev) => ({ ...prev, [idx]: true }));
  };

  const handleImageLoadEnd = (idx: number) => {
    setImageLoading((prev) => ({ ...prev, [idx]: false }));
  };

  const handleImageError = (uri: string) => {
    setFailedImages((prev) => ({ ...prev, [uri]: true }));
  };

  // Scroll to a specific slide index
  const goToSlide = useCallback((index: number, animated: boolean = true) => {
    if (!scrollViewRef.current || containerWidth <= 0 || numImages <= 1) return;
    const clampedIndex = (index + numImages) % numImages;
    setCurrentIndex(clampedIndex);
    scrollViewRef.current.scrollTo({
      x: clampedIndex * containerWidth,
      y: 0,
      animated,
    });
  }, [containerWidth, numImages]);

  // Clear timer safely
  const clearAutoSlideTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Setup auto-slide timer when 2 to 5 images exist
  const startAutoSlideTimer = useCallback(() => {
    clearAutoSlideTimer();
    if (numImages <= 1 || !isFocused || containerWidth <= 0) return;

    timerRef.current = setInterval(() => {
      if (isUserTouchingRef.current) return;
      const nextIndex = (currentIndexRef.current + 1) % numImages;
      goToSlide(nextIndex, true);
    }, Math.max(2000, autoSlideInterval));
  }, [numImages, isFocused, containerWidth, autoSlideInterval, clearAutoSlideTimer, goToSlide]);

  // Respond to focus, app state, and image count changes
  useEffect(() => {
    if (isFocused && numImages > 1 && containerWidth > 0) {
      startAutoSlideTimer();
    } else {
      clearAutoSlideTimer();
    }

    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && isFocused && numImages > 1 && containerWidth > 0) {
        startAutoSlideTimer();
      } else {
        clearAutoSlideTimer();
      }
    });

    return () => {
      clearAutoSlideTimer();
      subscription.remove();
    };
  }, [isFocused, numImages, containerWidth, startAutoSlideTimer, clearAutoSlideTimer]);

  // Touch gesture callbacks: pause auto-slide during user manual drag
  const onScrollBeginDrag = () => {
    isUserTouchingRef.current = true;
    clearAutoSlideTimer();
  };

  const onScrollEndDrag = () => {
    isUserTouchingRef.current = false;
    startAutoSlideTimer();
  };

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (containerWidth <= 0) return;
    const offsetX = e.nativeEvent.contentOffset.x;
    const newIdx = Math.round(offsetX / containerWidth);
    if (newIdx !== currentIndex && newIdx >= 0 && newIdx < numImages) {
      setCurrentIndex(newIdx);
    }
    isUserTouchingRef.current = false;
    startAutoSlideTimer();
  };

  // Badges rendered over image
  const renderOverlayBadges = () => (
    <>
      {/* Featured Item / Dish Tag */}
      {featuredDish ? (
        <View style={styles.itemTag} pointerEvents="none">
          <Text style={styles.itemTagText} numberOfLines={1}>
            ★ {featuredDish}
          </Text>
        </View>
      ) : null}

      {/* Online / Offline Status Badge */}
      <View
        style={[styles.statusBadge, isOnline ? styles.onlineBadge : styles.offlineBadge]}
        pointerEvents="none"
      >
        <Text style={styles.statusBadgeText}>
          {isOnline ? '🟢 ONLINE' : '🔴 OFFLINE'}
        </Text>
      </View>

      {/* Real Rating Badge (5-star scale or 'No ratings yet') */}
      {rating !== null && rating > 0 ? (
        <View style={styles.ratingBadge} pointerEvents="none">
          <Text style={styles.ratingStar}>★</Text>
          <Text style={styles.ratingVal}>
            {rating.toFixed(1)}
            {reviewCount > 0 ? ` (${reviewCount})` : ''}
          </Text>
        </View>
      ) : (
        <View style={[styles.ratingBadge, styles.noRatingBadge]} pointerEvents="none">
          <Text style={styles.noRatingText}>No ratings yet</Text>
        </View>
      )}

      {/* Pagination Dots (Only shown when 2 to 5 images exist) */}
      {numImages > 1 && (
        <View style={styles.dotsWrap} pointerEvents="none">
          {validImages.map((_, i) => (
            <View
              key={`dot_${restaurantId}_${i}`}
              style={[styles.dot, i === currentIndex ? styles.activeDot : styles.inactiveDot]}
            />
          ))}
        </View>
      )}
    </>
  );

  return (
    <View style={[styles.container, { height, width: width as any }]} onLayout={onLayout}>
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={onPress}
        style={styles.touchableWrapper}
      >
        {numImages === 0 ? (
          /* Scenario 1: ZERO IMAGES — Clean, neutral placeholder (NO fake food/demo images) */
          <View style={[styles.placeholderWrap, { height }]}>
            <Text style={styles.placeholderIcon}>🏪</Text>
            <Text style={styles.placeholderTitle} numberOfLines={1}>
              {restaurantName}
            </Text>
            <Text style={styles.placeholderSub}>Store Partner</Text>
          </View>
        ) : numImages === 1 ? (
          /* Scenario 2: EXACTLY 1 IMAGE — Static display without auto-slide or dots */
          <View style={[styles.singleImageWrap, { height }]}>
            <Image
              source={{ uri: validImages[0] }}
              style={styles.fullImage}
              resizeMode="cover"
              onLoadStart={() => handleImageLoadStart(0)}
              onLoadEnd={() => handleImageLoadEnd(0)}
              onError={() => handleImageError(validImages[0])}
            />
            {imageLoading[0] && (
              <View style={styles.loaderWrap}>
                <ActivityIndicator size="small" color="#0066FF" />
              </View>
            )}
          </View>
        ) : (
          /* Scenario 3: 2 TO 5 IMAGES — Smooth swipeable & auto-sliding carousel */
          <ScrollView
            ref={scrollViewRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
            scrollEventThrottle={16}
            onScrollBeginDrag={onScrollBeginDrag}
            onScrollEndDrag={onScrollEndDrag}
            onMomentumScrollEnd={onMomentumScrollEnd}
            style={[styles.scrollArea, { height }]}
            contentContainerStyle={{ width: containerWidth > 0 ? containerWidth * numImages : undefined }}
          >
            {validImages.map((uri, idx) => (
              <View
                key={`slide_${restaurantId}_${idx}_${uri.slice(-10)}`}
                style={[
                  styles.slideWrap,
                  { width: containerWidth > 0 ? containerWidth : '100%', height },
                ]}
              >
                <Image
                  source={{ uri }}
                  style={styles.fullImage}
                  resizeMode="cover"
                  onLoadStart={() => handleImageLoadStart(idx)}
                  onLoadEnd={() => handleImageLoadEnd(idx)}
                  onError={() => handleImageError(uri)}
                />
                {imageLoading[idx] && (
                  <View style={styles.loaderWrap}>
                    <ActivityIndicator size="small" color="#0066FF" />
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        )}

        {/* Overlay Badges & Pagination */}
        {renderOverlayBadges()}
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
  },
  touchableWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  placeholderWrap: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  placeholderIcon: {
    fontSize: 34,
  },
  placeholderTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginTop: 4,
  },
  placeholderSub: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
  },
  singleImageWrap: {
    width: '100%',
    position: 'relative',
  },
  scrollArea: {
    width: '100%',
  },
  slideWrap: {
    height: '100%',
    position: 'relative',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  loaderWrap: {
    ...(StyleSheet.absoluteFill as any),
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(241, 245, 249, 0.4)',
  },
  itemTag: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.84)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: '75%',
    zIndex: 10,
  },
  itemTagText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  statusBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    zIndex: 10,
  },
  onlineBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.95)',
  },
  offlineBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.92)',
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  ratingBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  noRatingBadge: {
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
  },
  ratingStar: {
    color: '#F59E0B',
    fontSize: 11,
    marginRight: 2.5,
  },
  ratingVal: {
    fontSize: 10.5,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  noRatingText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  dotsWrap: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    zIndex: 10,
    gap: 4,
  },
  dot: {
    height: 4.5,
    borderRadius: 2.5,
  },
  activeDot: {
    width: 13,
    backgroundColor: '#FFFFFF',
  },
  inactiveDot: {
    width: 4.5,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
});

export default RestaurantImageCarousel;
