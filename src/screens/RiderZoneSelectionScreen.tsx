import React from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, StyleSheet } from 'react-native';

/**
 * Zone-Based Delivery Partner System has been discontinued.
 * Delivery Partners can go Online and receive orders from any geographical location.
 */
export default function RiderZoneSelectionScreen({ navigation }: any) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.emoji}>🌐</Text>
        <Text style={styles.title}>Open Location Delivery Active</Text>
        <Text style={styles.subtitle}>
          Zone restrictions have been permanently removed. You can go Online and accept nearby delivery orders from any location.
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation?.goBack && navigation.goBack()}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>Back to Rider Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  emoji: { fontSize: 40, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', color: '#F8FAFC', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 13.5, color: '#94A3B8', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  button: {
    backgroundColor: '#0066FF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
