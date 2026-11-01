import React, { useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Dimensions, Animated, Easing } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const SPLASH_COUNT = 15;

interface DropConfig {
  startX: number;
  duration: number;
  length: number;
  width: number;
  opacity: number;
  initialProgress: number;
  windDrift: number;
}

interface SplashConfig {
  x: number;
  y: number;
  duration: number;
  scaleMax: number;
}

interface RainAnimationProps {
  active?: boolean;
  intensity?: 'light' | 'moderate' | 'heavy';
}

const RainAnimation: React.FC<RainAnimationProps> = ({ active = false, intensity = 'heavy' }) => {
  const count = intensity === 'light' ? 35 : intensity === 'moderate' ? 55 : 80;

  // Generate stable random drop configurations with randomized initial progress
  const dropConfigs = useMemo<DropConfig[]>(() => {
    const configs: DropConfig[] = [];
    for (let i = 0; i < count; i++) {
      configs.push({
        startX: Math.random() * (SCREEN_WIDTH + 100) - 40,
        duration: intensity === 'heavy' ? (380 + Math.random() * 280) : (550 + Math.random() * 320),
        length: intensity === 'heavy' ? (22 + Math.random() * 26) : (16 + Math.random() * 20),
        width: intensity === 'heavy' ? (1.5 + Math.random() * 1.2) : (1.2 + Math.random() * 0.8),
        opacity: intensity === 'heavy' ? (0.60 + Math.random() * 0.38) : (0.45 + Math.random() * 0.35),
        initialProgress: Math.random(), // Staggered start so rain is instantly everywhere
        windDrift: -(28 + Math.random() * 24), // Realistic slanted angle
      });
    }
    return configs;
  }, [count, intensity]);

  // Stable animated values
  const dropAnims = useRef<Animated.Value[]>([]);
  if (dropAnims.current.length !== count) {
    dropAnims.current = dropConfigs.map((c) => new Animated.Value(c.initialProgress));
  }

  // Splash configurations & anims
  const splashConfigs = useMemo<SplashConfig[]>(() => {
    return Array.from({ length: SPLASH_COUNT }).map(() => ({
      x: Math.random() * SCREEN_WIDTH,
      y: SCREEN_HEIGHT - 40 - Math.random() * 140,
      duration: 450 + Math.random() * 300,
      scaleMax: 1.5 + Math.random() * 1.0,
    }));
  }, []);

  const splashAnims = useRef<Animated.Value[]>([]);
  if (splashAnims.current.length !== SPLASH_COUNT) {
    splashAnims.current = Array.from({ length: SPLASH_COUNT }).map(() => new Animated.Value(Math.random()));
  }

  useEffect(() => {
    if (!active) return;

    // Start all drop loop animations - continuously cycles without any dead pause
    const dropLoops = dropAnims.current.map((anim, idx) => {
      const config = dropConfigs[idx] || dropConfigs[0];
      return Animated.loop(
        Animated.timing(anim, {
          toValue: 1,
          duration: config.duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        { resetBeforeIteration: true }
      );
    });

    // Start splash ripple loops
    const splashLoops = splashAnims.current.map((anim, idx) => {
      const config = splashConfigs[idx] || splashConfigs[0];
      return Animated.loop(
        Animated.timing(anim, {
          toValue: 1,
          duration: config.duration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        { resetBeforeIteration: true }
      );
    });

    dropLoops.forEach((loop) => loop.start());
    splashLoops.forEach((loop) => loop.start());

    return () => {
      dropLoops.forEach((loop) => loop.stop());
      splashLoops.forEach((loop) => loop.stop());
    };
  }, [active, dropConfigs, splashConfigs]);

  if (!active) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Subtle Rainy Atmosphere Ambient Tint */}
      <View style={styles.ambientTopTint} />

      {/* Falling Raindrops */}
      {dropConfigs.map((config, i) => {
        const anim = dropAnims.current[i];
        if (!anim) return null;

        const translateY = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [-config.length - 30, SCREEN_HEIGHT + 50],
        });

        const translateX = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, config.windDrift],
        });

        return (
          <Animated.View
            key={`drop_${i}`}
            style={[
              styles.rainDrop,
              {
                left: config.startX,
                height: config.length,
                width: config.width,
                opacity: config.opacity,
                transform: [
                  { translateY },
                  { translateX },
                  { rotate: '-12deg' },
                ],
              },
            ]}
          />
        );
      })}

      {/* Ground Water Splash Rings */}
      {splashConfigs.map((splash, i) => {
        const anim = splashAnims.current[i];
        if (!anim) return null;

        const scale = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.1, splash.scaleMax],
        });

        const opacity = anim.interpolate({
          inputRange: [0, 0.3, 1],
          outputRange: [0.85, 0.6, 0],
        });

        return (
          <Animated.View
            key={`splash_${i}`}
            style={[
              styles.splashRing,
              {
                left: splash.x,
                top: splash.y,
                opacity,
                transform: [
                  { scaleX: scale },
                  { scaleY: anim.interpolate({ inputRange: [0, 1], outputRange: [0.05, splash.scaleMax * 0.35] }) },
                ],
              },
            ]}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    overflow: 'hidden',
  },
  ambientTopTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 220,
    backgroundColor: 'rgba(30, 58, 138, 0.08)',
  },
  rainDrop: {
    position: 'absolute',
    top: 0,
    backgroundColor: 'rgba(186, 230, 253, 0.92)',
    borderRadius: 2,
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.45,
    shadowRadius: 2,
  },
  splashRing: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.2,
    borderColor: 'rgba(186, 230, 253, 0.85)',
    backgroundColor: 'transparent',
  },
});

export default RainAnimation;
