// ============================================================
// DESIGN SYSTEM - COLORS, TYPOGRAPHY, & SPACING
// ============================================================

export const darkTheme = {
  background: '#121212',
  secondaryBackground: '#181818',
  surface: '#1E1E1E',
  card: '#1E1E1E',
  elevatedSurface: '#242424',
  border: '#2E2E2E',
  text: '#FFFFFF',
  primaryText: '#FFFFFF',
  secondaryText: '#B0B0B0',
  mutedText: '#A0A0A0',
  textMuted: '#A0A0A0',
  disabled: '#8E8E93',
  inputBackground: '#1E1E1E',
  divider: '#2E2E2E',
  placeholder: '#8E8E93',
  grayBg: '#181818',
  grayText: '#B0B0B0',
  icon: '#B0B0B0',
};

export const lightTheme = {
  background: '#FAFAFA',
  secondaryBackground: '#F3F4F6',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  elevatedSurface: '#FFFFFF',
  border: '#E5E7EB',
  text: '#111827',
  primaryText: '#111827',
  secondaryText: '#4B5563',
  mutedText: '#6B7280',
  textMuted: '#6B7280',
  disabled: '#9CA3AF',
  inputBackground: '#F9FAFB',
  divider: '#E5E7EB',
  placeholder: '#9CA3AF',
  grayBg: '#F3F4F6',
  grayText: '#374151',
  icon: '#4B5563',
};

export const colors = {
  primary: '#0066FF', // Brand Clean Vibrant Blue
  primaryDark: '#1D4ED8', // Deep Blue
  primaryLight: '#3B82F6', // Vivid Blue Accent
  secondary: '#2563EB', // Medium Bright Blue
  blueBg: '#EFF6FF', // Light Blue Background
  blueBorder: '#BFDBFE', // Soft Blue Border
  blueBadge: '#DBEAFE', // Soft Blue Badge Tint
  orangeBg: '#EFF6FF', // Legacy alias mapped to Blue
  orangeBorder: '#BFDBFE', // Legacy alias mapped to Blue
  orangeBadge: '#DBEAFE', // Legacy alias mapped to Blue
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#0066FF',

  light: lightTheme,
  dark: darkTheme,
};

export const typography = {
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  }
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const shadows = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  }
};

export type ThemeColors = typeof colors.light;
