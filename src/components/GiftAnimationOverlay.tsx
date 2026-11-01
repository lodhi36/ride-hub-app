import React, { forwardRef, useImperativeHandle, useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Image, Animated } from 'react-native';

const { width, height } = Dimensions.get('window');

let Sound: any = null;
try {
  Sound = require('react-native-sound');
  if (Sound && Sound.setCategory) {
    Sound.setCategory('Playback');
  }
} catch (e) {
  console.log('[GiftAnimationOverlay] react-native-sound disabled/removed');
}

export const GIFT_ASSETS: Record<string, { image: any; sound?: any }> = {
  '🌹': {
    image: require('../assets/gifts/rose.png'),
    sound: require('../banner/dragon-studio-wow-423653.mp3'),
  },
  '🚗': {
    image: require('../assets/gifts/car.png'),
    sound: require('../banner/car_sound.mp3'),
  },
  '🏍️': {
    image: require('../assets/gifts/bike.png'),
  },
  '🛥️': {
    image: require('../assets/gifts/yacht.png'),
  },
  '✈️': {
    image: require('../assets/gifts/jet.png'),
  },
  '💎': {
    image: require('../assets/gifts/diamond.png'),
    sound: require('../banner/dragon-studio-wow-423653.mp3'),
  },
};

export interface GiftAnimationOverlayRef {
  addGiftToQueue: (giftEmoji: string) => void;
}

// Global cache for pre-loaded sounds
const PRELOADED_SOUNDS: Record<string, any> = {};
let PRELOADED_SEND_SOUND: any = null;

const GiftAnimationOverlay = forwardRef<GiftAnimationOverlayRef>((props, ref) => {
  const [currentGift, setCurrentGift] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const currentSound = useRef<any>(null);
  const timeoutRef = useRef<any>(null);
  const finishTimeoutRef = useRef<any>(null);
  const scaleAnim = useRef(new Animated.Value(0)).current;

  // Expose method to strictly interrupt and play new gift
  useImperativeHandle(ref, () => ({
    addGiftToQueue: (giftEmoji: string) => {
      if (GIFT_ASSETS[giftEmoji]) {
        playGiftStrict(giftEmoji);
      }
    }
  }));

  // Preload sounds on mount and clean up on unmount
  useEffect(() => {
    // Pre-load the generic gift send sound
    if (!PRELOADED_SEND_SOUND) {
      const sendSoundUri = Image.resolveAssetSource(require('../banner/gift send.mpeg')).uri;
      PRELOADED_SEND_SOUND = new Sound(sendSoundUri, '', (error: any) => {
        if (error) console.log('Failed to pre-load send sound', error);
      });
    }

    // Pre-load all configured sounds immediately so there is zero delay on click
    Object.keys(GIFT_ASSETS).forEach(emoji => {
      const assets = GIFT_ASSETS[emoji];
      if (assets.sound && !PRELOADED_SOUNDS[emoji]) {
        const soundUri = Image.resolveAssetSource(assets.sound).uri;
        PRELOADED_SOUNDS[emoji] = new Sound(soundUri, '', (error: any) => {
          if (error) console.log('Failed to pre-load sound for', emoji, error);
        });
      }
    });

    return () => {
      stopAll();
    };
  }, []);

  const stopAll = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (finishTimeoutRef.current) {
      clearTimeout(finishTimeoutRef.current);
      finishTimeoutRef.current = null;
    }
    if (PRELOADED_SEND_SOUND) {
      PRELOADED_SEND_SOUND.stop();
    }
    if (currentSound.current) {
      currentSound.current.stop();
      currentSound.current = null;
    }
    setShowConfetti(false);
  };

  const playGiftStrict = (giftEmoji: string) => {
    // 1. Immediately stop any currently playing animation and sound
    stopAll();
    
    // Stage 1: Play Send Sound instantly
    setShowConfetti(true); // Keeping state true just as a generic active flag
    setCurrentGift(null); // Hide specific gift temporarily
    
    if (PRELOADED_SEND_SOUND) {
      PRELOADED_SEND_SOUND.setCurrentTime(0);
      PRELOADED_SEND_SOUND.play();
    }

    // Stage 2: Play the specific Gift & Sound after a 300ms delay for premium sequence effect
    timeoutRef.current = setTimeout(() => {
      setCurrentGift(giftEmoji);
      
      // Trigger bounce entrance animation for the Image
      scaleAnim.setValue(0.1);
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 80,
        useNativeDriver: true,
      }).start();

      // Automatically hide image and stop sound after 3000ms
      finishTimeoutRef.current = setTimeout(() => {
        finishCurrentGift();
      }, 3000);

      const assets = GIFT_ASSETS[giftEmoji];
      if (assets && assets.sound) {
        const cachedSound = PRELOADED_SOUNDS[giftEmoji];
        if (cachedSound) {
          cachedSound.setCurrentTime(0);
          cachedSound.play();
          currentSound.current = cachedSound;
        }
      }
    }, 300);
  };

  const finishCurrentGift = () => {
    stopAll();
    setCurrentGift(null);
  };

  if (!currentGift && !showConfetti) return null;

  return (
    <View style={styles.overlay} pointerEvents="none" collapsable={false}>
      {currentGift && GIFT_ASSETS[currentGift] && (
        <View style={styles.giftContainer}>
          <Animated.Image
            source={GIFT_ASSETS[currentGift].image}
            style={[
              styles.specificGiftImage,
              { transform: [{ scale: scaleAnim }] }
            ]}
            resizeMode="contain"
          />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 999999,
    elevation: 100, // A reasonable elevation to force Android to draw on top
    justifyContent: 'center',
    alignItems: 'center',
  },
  giftContainer: {
    width: width * 0.8,
    height: width * 0.8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  specificGiftImage: {
    width: '100%',
    height: '100%',
  },
});

export default GiftAnimationOverlay;
