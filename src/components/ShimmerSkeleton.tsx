import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ShimmerProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: any;
  isDark?: boolean;
}

/**
 * Base 60 FPS Native Animated Shimmer Block
 */
export const ShimmerBox: React.FC<ShimmerProps> = ({
  width,
  height,
  borderRadius = 8,
  style,
  isDark = false,
}) => {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [animatedValue]);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.75],
  });

  const baseBg = isDark ? '#1E293B' : '#E2E8F0';

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: baseBg,
          opacity,
        },
        style,
      ]}
    />
  );
};

/**
 * Horizontal Categories Shimmer Skeleton (Used on CustomerHomeScreen)
 */
export const CategoryListSkeleton: React.FC<{ isDark?: boolean }> = ({ isDark }) => (
  <View style={styles.catSkeletonRow}>
    {[1, 2, 3, 4, 5].map(i => (
      <View key={i} style={styles.catSkeletonItem}>
        <ShimmerBox width={60} height={60} borderRadius={30} isDark={isDark} />
        <ShimmerBox width={48} height={10} borderRadius={5} style={{ marginTop: 8 }} isDark={isDark} />
      </View>
    ))}
  </View>
);

/**
 * Promotional Hero Banner Shimmer Skeleton
 */
export const BannerSkeleton: React.FC<{ isDark?: boolean; height?: number }> = ({
  isDark,
  height = (SCREEN_WIDTH - 24) * 0.44,
}) => (
  <View style={styles.bannerSkeletonWrap}>
    <ShimmerBox width={SCREEN_WIDTH - 24} height={height} borderRadius={16} isDark={isDark} />
  </View>
);

/**
 * Subcategories 2-Row Horizontal Shimmer Skeleton
 */
export const SubcategoriesSkeleton: React.FC<{ isDark?: boolean }> = ({ isDark }) => (
  <View style={styles.subsSkeletonWrap}>
    <View style={styles.subsSkeletonRow}>
      {[1, 2, 3, 4].map(i => (
        <View key={`r1_${i}`} style={styles.subPillSkeleton}>
          <ShimmerBox width={40} height={40} borderRadius={20} isDark={isDark} />
          <ShimmerBox width={60} height={10} borderRadius={5} style={{ marginTop: 6 }} isDark={isDark} />
        </View>
      ))}
    </View>
    <View style={styles.subsSkeletonRow}>
      {[1, 2, 3, 4].map(i => (
        <View key={`r2_${i}`} style={styles.subPillSkeleton}>
          <ShimmerBox width={40} height={40} borderRadius={20} isDark={isDark} />
          <ShimmerBox width={60} height={10} borderRadius={5} style={{ marginTop: 6 }} isDark={isDark} />
        </View>
      ))}
    </View>
  </View>
);

/**
 * 2-Column Product Grid Shimmer Skeleton
 */
export const ProductGridSkeleton: React.FC<{ isDark?: boolean; count?: number }> = ({
  isDark,
  count = 4,
}) => {
  const cardWidth = (SCREEN_WIDTH - 36) / 2;
  return (
    <View style={styles.productGridSkeleton}>
      {Array.from({ length: count }).map((_, idx) => (
        <View key={idx} style={[styles.productCardSkeleton, { width: cardWidth }]}>
          <ShimmerBox width="100%" height={cardWidth * 0.85} borderRadius={12} isDark={isDark} />
          <ShimmerBox width="80%" height={12} borderRadius={6} style={{ marginTop: 10 }} isDark={isDark} />
          <ShimmerBox width="50%" height={10} borderRadius={5} style={{ marginTop: 6 }} isDark={isDark} />
          <View style={styles.productFooterSkeleton}>
            <ShimmerBox width={50} height={14} borderRadius={6} isDark={isDark} />
            <ShimmerBox width={60} height={28} borderRadius={8} isDark={isDark} />
          </View>
        </View>
      ))}
    </View>
  );
};

/**
 * Store Card List Shimmer Skeleton
 */
export const StoreListSkeleton: React.FC<{ isDark?: boolean; count?: number }> = ({
  isDark,
  count = 3,
}) => (
  <View style={styles.storeListSkeleton}>
    {Array.from({ length: count }).map((_, idx) => (
      <View key={idx} style={styles.storeCardSkeleton}>
        <ShimmerBox width="100%" height={140} borderRadius={16} isDark={isDark} />
        <View style={{ paddingVertical: 10 }}>
          <ShimmerBox width="60%" height={16} borderRadius={8} isDark={isDark} />
          <ShimmerBox width="40%" height={12} borderRadius={6} style={{ marginTop: 6 }} isDark={isDark} />
        </View>
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  catSkeletonRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 12,
  },
  catSkeletonItem: {
    alignItems: 'center',
    width: 68,
  },
  bannerSkeletonWrap: {
    paddingHorizontal: 12,
    marginVertical: 10,
    alignItems: 'center',
  },
  subsSkeletonWrap: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  subsSkeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  subPillSkeleton: {
    alignItems: 'center',
    width: 76,
  },
  productGridSkeleton: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 12,
    paddingTop: 8,
  },
  productCardSkeleton: {
    backgroundColor: 'transparent',
    marginBottom: 12,
  },
  productFooterSkeleton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  storeListSkeleton: {
    paddingHorizontal: 12,
    gap: 16,
  },
  storeCardSkeleton: {
    marginBottom: 8,
  },
});

