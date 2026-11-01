import React, { useContext } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, TouchableOpacityProps, StyleSheet } from 'react-native';
import { ThemeContext } from '../context/ThemeContext';
import { colors, shadows } from '../theme/colors';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'outline';
}

const Button = ({ title, loading = false, variant = 'primary', style, ...props }: ButtonProps) => {
  const { theme } = useContext(ThemeContext);
  const isDark = theme === 'dark';

  const buttonStyles: any[] = [styles.button];
  const textStyles: any[] = [styles.text];

  if (variant === 'primary') {
    buttonStyles.push({ backgroundColor: colors.primary, ...shadows.md });
    textStyles.push({ color: colors.white });
  } else if (variant === 'secondary') {
    buttonStyles.push({ backgroundColor: isDark ? colors.dark.grayBg : colors.light.grayBg });
    textStyles.push({ color: isDark ? colors.white : colors.black });
  } else if (variant === 'outline') {
    buttonStyles.push({ backgroundColor: colors.transparent, borderWidth: 2, borderColor: colors.primary });
    textStyles.push({ color: colors.primary });
  }

  return (
    <TouchableOpacity
      style={[buttonStyles, style]}
      disabled={loading || props.disabled}
      activeOpacity={0.8}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'outline' ? colors.primary : colors.white} />
      ) : (
        <Text style={textStyles}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  text: {
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.5,
  },
});

export default Button;
