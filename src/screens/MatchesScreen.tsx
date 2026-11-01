import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import EmptyState from '../components/EmptyState';

const MatchesScreen = () => {
  const { currentColors } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]} edges={['top']}>
      <EmptyState
        iconName="people"
        title="No Matches Yet"
        description="Keep liking profiles in Discover to find your perfect match!"
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default MatchesScreen;
