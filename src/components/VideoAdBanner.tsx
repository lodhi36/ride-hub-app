import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

interface VideoAdBannerProps {
  videoUri?: string | null;
  posterUri?: string;
  brandSub?: string;
  brandTitle?: string;
  brandTag?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
  onPressChevron?: () => void;
  showChevron?: boolean;
}

export const VideoAdBanner: React.FC<VideoAdBannerProps> = ({
  videoUri,
  posterUri = 'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=800&q=80',
  brandSub = 'AZUREA',
  brandTitle = 'FRESH',
  brandTag = 'UNISEX',
  height = 240,
  style,
  onPressChevron,
  showChevron = true,
}) => {
  const videoHtml = useMemo(() => {
    if (!videoUri) return '';
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body {
              width: 100%; height: 100%;
              background: #000000;
              overflow: hidden;
              display: flex; align-items: center; justify-content: center;
            }
            video {
              width: 100%; height: 100%;
              object-fit: cover;
            }
          </style>
        </head>
        <body>
          <video id="adv" src="${videoUri}" autoplay loop muted playsinline webkit-playsinline preload="auto" poster="${posterUri}"></video>
          <script>
            var v = document.getElementById('adv');
            if (v) {
              v.play().catch(function(){});
              v.addEventListener('loadeddata', function() { v.play().catch(function(){}); });
              v.addEventListener('canplay', function() { v.play().catch(function(){}); });
            }
          </script>
        </body>
      </html>
    `;
  }, [videoUri, posterUri]);

  return (
    <View style={[styles.container, { height }, style]}>
      {videoUri ? (
        <WebView
          originWhitelist={['*']}
          source={{ html: videoHtml }}
          style={styles.webView}
          containerStyle={styles.webView}
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          cacheEnabled={true}
          androidHardwareAccelerationDisabled={false}
          androidLayerType="hardware"
          renderToHardwareTextureAndroid={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
        />
      ) : (
        <Image
          source={{ uri: posterUri }}
          style={styles.posterImage}
          resizeMode="cover"
        />
      )}

      {/* Dark Gradient Overlay for Readability */}
      <View style={styles.darkOverlay} />

      {/* Top Minimize / Down Chevron Button */}
      {showChevron && onPressChevron && (
        <TouchableOpacity
          style={styles.chevronBtn}
          onPress={onPressChevron}
          activeOpacity={0.8}
        >
          <Text style={styles.chevronText}>⌄</Text>
        </TouchableOpacity>
      )}

      {/* Brand / Ad Overlay Content */}
      <View style={styles.brandBox} pointerEvents="none">
        {Boolean(brandSub) && <Text style={styles.brandSub}>{brandSub}</Text>}
        {Boolean(brandTitle) && <Text style={styles.brandTitle}>{brandTitle}</Text>}
        {Boolean(brandTag) && <Text style={styles.brandTag}>{brandTag}</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    backgroundColor: '#0B132B',
    overflow: 'hidden',
  },
  webView: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  darkOverlay: {
    ...(StyleSheet.absoluteFill as any),
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  chevronBtn: {
    position: 'absolute',
    top: 24,
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  chevronText: {
    fontSize: 22,
    color: '#FFFFFF',
    fontWeight: 'bold',
    marginTop: -4,
  },
  brandBox: {
    position: 'absolute',
    bottom: 28,
    width: '100%',
    alignItems: 'center',
  },
  brandSub: {
    fontSize: 12,
    color: '#FCD34D',
    letterSpacing: 4,
    fontWeight: '700',
  },
  brandTitle: {
    fontSize: 24,
    color: '#38BDF8',
    letterSpacing: 3,
    fontWeight: '900',
    marginTop: 2,
  },
  brandTag: {
    fontSize: 10,
    color: '#94A3B8',
    letterSpacing: 2,
    marginTop: 2,
  },
});

export default VideoAdBanner;
