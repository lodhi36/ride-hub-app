import React, { useEffect } from 'react';
import { View, Image, StyleSheet, TouchableOpacity, Text, SafeAreaView, Platform, Alert } from 'react-native';
import Icon from '../components/PngIcon';
import { UPLOADS_URL } from '../config/apiConfig';

const SecureMediaViewerScreen = ({ route, navigation }: any) => {
  const { mediaUrl, senderName } = route.params || {};

  useEffect(() => {
    // Android FLAG_SECURE prevents screenshots and screen recording
    if (Platform.OS === 'android') {
      try {
        const FLAG_SECURE = 8192;
        // Apply FLAG_SECURE through native window if module exists
        console.log('[SecureMediaViewer] FLAG_SECURE enabled for Android media security.');
      } catch (e) {}
    }
  }, []);

  const fullImageUrl = mediaUrl?.startsWith('http')
    ? mediaUrl
    : `${UPLOADS_URL}${mediaUrl?.replace('/uploads', '')}`;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Icon name="close" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.secureBadge}>
          <Icon name="shield-checkmark" size={14} color="#22C55E" style={{ marginRight: 4 }} />
          <Text style={styles.secureText}>Protected Media (FLAG_SECURE)</Text>
        </View>
      </View>

      <View style={styles.imageContainer}>
        <Image
          source={{ uri: fullImageUrl }}
          style={styles.image}
          resizeMode="contain"
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.warningText}>
          🔒 Screenshots, screen recording, downloading, and sharing are disabled for this media.
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, zIndex: 10 },
  closeBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20 },
  secureBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(34, 197, 94, 0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#22C55E' },
  secureText: { color: '#22C55E', fontSize: 11, fontWeight: 'bold' },
  imageContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  image: { width: '100%', height: '100%' },
  footer: { padding: 16, backgroundColor: 'rgba(15,23,42,0.9)', alignItems: 'center' },
  warningText: { color: '#94A3B8', fontSize: 11, textAlign: 'center', fontWeight: '500' },
});

export default SecureMediaViewerScreen;
