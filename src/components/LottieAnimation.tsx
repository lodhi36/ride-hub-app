import React, { useMemo, memo } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, DimensionValue } from 'react-native';
import { WebView } from 'react-native-webview';

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
}

export const LottieAnimation: React.FC<LottieAnimationProps> = memo(({
  source,
  width = '100%',
  height = 200,
  style,
  loop = true,
  autoplay = true,
  autoPlay,
  speed = 1.0,
  preserveAspectRatio = 'xMidYMid meet',
}) => {
  const effectiveAutoplay = autoPlay !== undefined ? autoPlay : autoplay;

  // Extract a stable clean URL without volatile timestamp queries to prevent infinite WebView reloads
  const cleanUrl = useMemo(() => {
    if (!source) return null;
    if (typeof source === 'string') {
      const isHttp = source.startsWith('http://') || source.startsWith('https://') || source.startsWith('/');
      return isHttp ? source.split('?')[0] : null;
    }
    if (source?.uri && typeof source.uri === 'string') {
      return source.uri.split('?')[0];
    }
    return null;
  }, [source]);

  const htmlContent = useMemo(() => {
    if (!source) return '';

    let animDataStr = 'null';
    if (!cleanUrl) {
      if (typeof source === 'object') {
        animDataStr = JSON.stringify(source);
      } else if (typeof source === 'string') {
        animDataStr = source.trim();
      }
    }

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
              max-width: 100%;
              max-height: 100%;
            }
          </style>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js"></script>
        </head>
        <body>
          <div id="lottie-box"></div>
          <script>
            var retryCount = 0;
            var animInstance = null;
            var animLoaded = false;

            function loadFallback() {
              if (animLoaded) return;
              var s = document.createElement('script');
              s.src = 'https://unpkg.com/lottie-web@5.12.2/build/player/lottie.min.js';
              s.onload = initLottie;
              document.head.appendChild(s);
            }

            function initLottie() {
              if (animLoaded) return;
              var container = document.getElementById('lottie-box');
              if (!container) return;

              if (window.lottie || window.bodymovin) {
                var player = window.lottie || window.bodymovin;
                try {
                  animLoaded = true;
                  container.innerHTML = '';
                  var animConfig = {
                    container: container,
                    renderer: 'svg',
                    loop: ${loop},
                    autoplay: ${effectiveAutoplay},
                    rendererSettings: {
                      preserveAspectRatio: '${preserveAspectRatio}'
                    }
                  };
                  ${cleanUrl ? `animConfig.path = ${JSON.stringify(cleanUrl)};` : `animConfig.animationData = ${animDataStr};`}
                  animInstance = player.loadAnimation(animConfig);
                  if (animInstance && animInstance.setSpeed) {
                    animInstance.setSpeed(${speed});
                  }
                  // Native lottie-web handles loop seamlessly without redundant event listeners
                } catch(e) {
                  animLoaded = false;
                  console.error('Lottie Error:', e);
                }
              } else if (retryCount < 40) {
                retryCount++;
                setTimeout(initLottie, 50);
              } else if (retryCount === 40) {
                retryCount++;
                loadFallback();
              }
            }

            if (document.readyState === 'complete' || document.readyState === 'interactive') {
              initLottie();
            } else {
              document.addEventListener('DOMContentLoaded', initLottie, { once: true });
            }
          </script>
        </body>
      </html>
    `;
  }, [cleanUrl, loop, effectiveAutoplay, speed, preserveAspectRatio]);

  if (!source) return null;

  return (
    <View style={[{ width, height, overflow: 'hidden', backgroundColor: 'transparent' }, style]}>
      <WebView
        originWhitelist={['*']}
        source={{ html: htmlContent }}
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
        cacheEnabled={true}
        cacheMode="LOAD_DEFAULT"
      />
    </View>
  );
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
