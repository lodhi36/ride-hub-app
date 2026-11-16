import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

interface OrderHistorySkeletonLoaderProps {
  isDark?: boolean;
  message?: string;
}

export const OrderHistorySkeletonLoader: React.FC<OrderHistorySkeletonLoaderProps> = ({
  isDark = false,
  message = 'Loading live orders...',
}) => {
  const shimmerAnim = useRef(new Animated.Value(0.35)).current;
  const pulseAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    const shimmer = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 0.85,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0.35,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    );

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.95,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );

    shimmer.start();
    pulse.start();

    return () => {
      shimmer.stop();
      pulse.stop();
    };
  }, [shimmerAnim, pulseAnim]);

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const borderCol = isDark ? '#334155' : '#E2E8F0';
  const skeletonBase = isDark ? '#334155' : '#E2E8F0';

  return (
    <View style={styles.container}>
      {/* Top Animated Pulse Indicator */}
      <View style={styles.headerIndicatorWrap}>
        <Animated.View
          style={[
            styles.pulseDot,
            {
              transform: [{ scale: pulseAnim }],
              opacity: shimmerAnim,
            },
          ]}
        />
        <Text style={[styles.loadingMessage, { color: isDark ? '#94A3B8' : '#64748B' }]}>
          ⚡ {message}
        </Text>
      </View>

      {/* 3 Animated Order Card Skeletons */}
      {[1, 2, 3].map((key) => (
        <Animated.View
          key={key}
          style={[
            styles.card,
            {
              backgroundColor: cardBg,
              borderColor: borderCol,
              opacity: shimmerAnim,
            },
          ]}
        >
          {/* Card Top Row: Order ID & Status Badge */}
          <View style={styles.topRow}>
            <View style={{ flex: 1 }}>
              <View style={[styles.skeletonLine, { width: 110, height: 16, backgroundColor: skeletonBase, borderRadius: 6 }]} />
              <View style={[styles.skeletonLine, { width: 85, height: 12, backgroundColor: skeletonBase, borderRadius: 4, marginTop: 6 }]} />
            </View>
            <View style={[styles.skeletonLine, { width: 90, height: 26, backgroundColor: skeletonBase, borderRadius: 13 }]} />
          </View>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: isDark ? '#273549' : '#F1F5F9' }]} />

          {/* Store & Customer Info */}
          <View style={styles.infoRow}>
            <View style={[styles.skeletonLine, { width: '65%', height: 15, backgroundColor: skeletonBase, borderRadius: 4 }]} />
            <View style={[styles.skeletonLine, { width: '45%', height: 13, backgroundColor: skeletonBase, borderRadius: 4, marginTop: 6 }]} />
          </View>

          {/* Pickup & Delivery Location Row */}
          <View style={[styles.locationBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: borderCol }]}>
            <View style={styles.locRow}>
              <View style={[styles.dot, { backgroundColor: '#16A34A' }]} />
              <View style={[styles.skeletonLine, { width: '75%', height: 12, backgroundColor: skeletonBase, borderRadius: 4 }]} />
            </View>
            <View style={[styles.locRow, { marginTop: 6 }]}>
              <View style={[styles.dot, { backgroundColor: '#DC2626' }]} />
              <View style={[styles.skeletonLine, { width: '60%', height: 12, backgroundColor: skeletonBase, borderRadius: 4 }]} />
            </View>
          </View>

          {/* Bottom Total & Actions */}
          <View style={styles.bottomRow}>
            <View style={[styles.skeletonLine, { width: 80, height: 18, backgroundColor: skeletonBase, borderRadius: 6 }]} />
            <View style={[styles.skeletonLine, { width: 100, height: 28, backgroundColor: skeletonBase, borderRadius: 8 }]} />
          </View>
        </Animated.View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 20,
  },
  headerIndicatorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginBottom: 8,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0066FF',
    marginRight: 8,
  },
  loadingMessage: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  divider: {
    height: 1,
    marginVertical: 8,
  },
  infoRow: {
    marginBottom: 10,
  },
  locationBox: {
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  locRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  skeletonLine: {},
});

export default OrderHistorySkeletonLoader;
