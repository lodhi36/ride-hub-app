import React from 'react';
import { Dimensions, View, Text, StyleSheet } from 'react-native';
import Icon from './PngIcon';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing } from '../theme/colors';

const windowWidth = Dimensions.get('window').width;

interface EmptyStateProps {
  iconName?: string;
  lottieSource?: any;
  lottieSize?: number;
  title: string;
  description: string;
  children?: React.ReactNode;
}

const EmptyState = ({
  iconName,
  title,
  description,
  children,
}: EmptyStateProps) => {
  const { currentColors } = useTheme();

  const renderAnimation = () => {
    return (
      <View style={[styles.iconContainer, { backgroundColor: currentColors.grayBg }]}>
        <Icon name={iconName || 'alert-circle-outline'} size={48} color={currentColors.textMuted} />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {renderAnimation()}
      <Text style={[styles.title, { color: currentColors.text }]}>{title}</Text>
      <Text style={[styles.description, { color: currentColors.textMuted }]}>{description}</Text>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  iconContainer: {
    width: windowWidth * 0.25, height: windowWidth * 0.25,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  description: {
    fontSize: typography.sizes.md,
    textAlign: 'center',
    lineHeight: 24,
  },
});

export default EmptyState;
