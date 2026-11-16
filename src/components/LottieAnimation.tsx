import React, { useMemo, useState, useEffect, useRef, memo } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, DimensionValue } from 'react-native';
import { WebView } from 'react-native-webview';
import { resolveUploadUrl, LOCAL_URL } from '../config/apiConfig';
import { LOTTIE_WEB_PLAYER_JS } from '../assets/lottie_player';

interface LottieAnimationProps {
  source: any;
  width?: DimensionValue;
  height?: DimensionValue;
  style?: StyleProp<ViewStyle>;
  loop?: boolean;
  autoplay?: boolean;
  autoPlay?: boolean;
  speed?: number;
  preserveAspectRatio?: string;
  isPlaying?: boolean;
}

// Global in-memory cache for remote Lottie JSONs
const _lottieMemoryCache = new Map<string, any>();

const LottieAnimationComponent: React.FC<LottieAnimationProps> = ({
  source,
  width = '100%',
  height = 200,
  style,
  loop = true,
  autoplay = true,
  autoPlay,
  speed = 1.0,
  preserveAspectRatio = 'xMidYMid meet',
  isPlaying,
}) => {
  const effectiveAutoplay = autoPlay !== undefined ? autoPlay : autoplay;
  const webViewRef = useRef<WebView>(null);

  // Extract remote URL if source is string or { uri }
  const remoteUrl = useMemo(() => {
    if (!source) return null;
    let u: string | null = null;
    if (typeof source === 'string') {
      const isUrl = source.startsWith('http://') || source.startsWith('https://') || source.startsWith('/');
      if (isUrl) u = source;
    } else if (source?.uri && typeof source.uri === 'string') {
      u = source.uri;
    }
    if (!u) return null;
    return resolveUploadUrl(u) || u;
  }, [source]);

  // Handle dynamic play/pause commands to WebView
  useEffect(() => {
    if (isPlaying !== undefined && webViewRef.current) {
      if (isPlaying) {
        webViewRef.current.injectJavaScript('if (window.currentAnimInstance) { window.currentAnimInstance.play(); } true;');
      } else {
        webViewRef.current.injectJavaScript('if (window.currentAnimInstance) { window.currentAnimInstance.pause(); } true;');
      }
    }
  }, [isPlaying]);

  // Is source direct JSON?
  const directData = useMemo(() => {
    if (!source) return null;
    if (typeof source === 'object' && !source.uri && (source.v || source.layers || source.assets)) {
      return source;
    }
    return null;
  }, [source]);

  const [remoteJson, setRemoteJson] = useState<any>(() => {
    if (directData) return directData;
    if (remoteUrl && _lottieMemoryCache.has(remoteUrl)) {
      return _lottieMemoryCache.get(remoteUrl);
    }
    return null;
  });

  useEffect(() => {
    if (directData) {
      setRemoteJson(directData);
      return;
    }
    if (!remoteUrl) {
      setRemoteJson(null);
      return;
    }
    if (_lottieMemoryCache.has(remoteUrl)) {
      setRemoteJson(_lottieMemoryCache.get(remoteUrl));
      return;
    }

    let isMounted = true;
    fetch(remoteUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data && (data.v || data.layers || typeof data === 'object')) {
          _lottieMemoryCache.set(remoteUrl, data);
          if (isMounted) {
            setRemoteJson(data);
          }
        }
      })
      .catch((err) => {
        console.warn(`[LottieAnimation] Fallback fetch for ${remoteUrl}:`, err.message);
      });

    return () => {
      isMounted = false;
    };
  }, [remoteUrl, directData]);

  const activeAnimData = directData || remoteJson;

  const htmlContent = useMemo(() => {
    // If we have neither directData nor remoteUrl nor remoteJson, return empty
    if (!directData && !remoteUrl && !activeAnimData) return '';

    let animDataSnippet = '';
    if (activeAnimData) {
      try {
        const str = JSON.stringify(activeAnimData);
        if (str.length < 2000000) { // Under 2MB
          animDataSnippet = `animOptions.animationData = ${str};`;
        }
      } catch (_) {}
    }

    const pathSnippet = remoteUrl ? `animOptions.path = "${remoteUrl}";` : '';
    const initialPlay = isPlaying !== undefined ? isPlaying : effectiveAutoplay;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
              background-color: transparent !important;
            }
            html, body {
              width: 100%;
              height: 100%;
              background-color: transparent !important;
              background: transparent !important;
              overflow: hidden;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            #lottie-box {
              width: 100%;
              height: 100%;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            svg {
              width: 100% !important;
              height: 100% !important;
              position: absolute !important;
              top: 0 !important;
              left: 0 !important;
              transform-origin: center center;
            }
          </style>
          <script>${LOTTIE_WEB_PLAYER_JS}</script>
        </head>
        <body>
          <div id="lottie-box"></div>
          <script>
            (function() {
              var container = document.getElementById('lottie-box');
              if (!container) return;
              var player = window.lottie || window.bodymovin;
              if (!player) return;
              try {
                if (window.currentAnimInstance && window.currentAnimInstance.destroy) {
                  window.currentAnimInstance.destroy();
                }
                var animOptions = {
                  container: container,
                  renderer: 'svg',
                  loop: ${loop},
                  autoplay: ${initialPlay},
                  rendererSettings: {
                    preserveAspectRatio: '${preserveAspectRatio}',
                    progressiveLoad: true,
                    hideOnTransparent: true
                  }
                };
                ${animDataSnippet ? animDataSnippet : pathSnippet}
                if (!animOptions.animationData && !animOptions.path) {
                  ${pathSnippet}
                }
                var animInstance = player.loadAnimation(animOptions);
                window.currentAnimInstance = animInstance;
                if (animInstance && animInstance.setSpeed) {
                  animInstance.setSpeed(${speed});
                }
                ${initialPlay ? '' : 'if (animInstance) { animInstance.pause(); }'}
              } catch(e) {
                console.error('Lottie Render Error:', e);
              }
            })();
          </script>
        </body>
      </html>
    `;
  }, [activeAnimData, remoteUrl, directData, loop, effectiveAutoplay, speed, preserveAspectRatio, isPlaying]);

  // Handle dynamic speed changes via JS injection without recreating WebView
  useEffect(() => {
    if (speed !== undefined && webViewRef.current) {
      webViewRef.current.injectJavaScript(`if (window.currentAnimInstance && window.currentAnimInstance.setSpeed) { window.currentAnimInstance.setSpeed(${speed}); } true;`);
    }
  }, [speed]);

  // Stable memoized source object to prevent unnecessary reload of WebView
  const webViewSource = useMemo(() => {
    if (!htmlContent) return null;
    return { html: htmlContent, baseUrl: LOCAL_URL };
  }, [htmlContent]);

  if (!source) return null;

  return (
    <View style={[{ width, height, overflow: 'hidden', backgroundColor: 'transparent' }, style]}>
      {webViewSource ? (
        <WebView
          ref={webViewRef as any}
          originWhitelist={['*']}
          source={webViewSource}
          style={[styles.webView, { opacity: 0.99 }]}
          containerStyle={styles.webViewContainer}
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
          javaScriptEnabled={true}
          domStorageEnabled={true}
          scalesPageToFit={false}
          transparent={true}
          mixedContentMode="always"
          androidLayerType="hardware"
          allowFileAccess={true}
          allowUniversalAccessFromFileURLs={true}
        />
      ) : (
        <View style={{ flex: 1, backgroundColor: 'transparent' }} />
      )}
    </View>
  );
};

export const LottieAnimation = memo(LottieAnimationComponent, (prev, next) => {
  const prevSrc = typeof prev.source === 'string' ? prev.source : (prev.source?.uri || (prev.source ? 'obj' : ''));
  const nextSrc = typeof next.source === 'string' ? next.source : (next.source?.uri || (next.source ? 'obj' : ''));
  if (prevSrc !== nextSrc) return false;
  if (prev.width !== next.width || prev.height !== next.height) return false;
  if (prev.loop !== next.loop) return false;
  if (prev.isPlaying !== next.isPlaying) return false;
  if (prev.autoplay !== next.autoplay || prev.autoPlay !== next.autoPlay) return false;
  if (prev.preserveAspectRatio !== next.preserveAspectRatio) return false;
  return true;
});

const styles = StyleSheet.create({
  webView: {
    backgroundColor: 'transparent',
    flex: 1,
  },
  webViewContainer: {
    backgroundColor: 'transparent',
    flex: 1,
  },
});

export default LottieAnimation;
