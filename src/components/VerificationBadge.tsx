import React from 'react';
import { View, StyleSheet } from 'react-native';
import Icon from './PngIcon';

// ─── Props ────────────────────────────────────────────────────────────────────
interface VerificationBadgeProps {
  isVerified: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  style?: any;
}

// ─── Size map ─────────────────────────────────────────────────────────────────
const SIZE_MAP = {
  xs: { icon: 12, container: 14 },
  sm: { icon: 16, container: 18 },
  md: { icon: 20, container: 22 },
  lg: { icon: 26, container: 28 },
};

// ─── Component ────────────────────────────────────────────────────────────────
const VerificationBadge: React.FC<VerificationBadgeProps> = ({
  isVerified,
  size = 'md',
  style,
}) => {
  if (!isVerified) return null;

  const { icon: iconSize } = SIZE_MAP[size];

  return (
    <View style={[styles.badge, style]}>
      <Icon name="checkmark-circle" size={iconSize} color="#1D9BF0" />
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    marginLeft: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default VerificationBadge;
