import React, { useMemo } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, DimensionValue } from 'react-native';
import { WebView } from 'react-native-webview';

const cookingJsonData = require('../banner/cooking.json');

interface CookingAnimationProps {
  width?: DimensionValue;
  height?: DimensionValue;
  style?: StyleProp<ViewStyle>;
  loop?: boolean;
  autoplay?: boolean;
}

export const CookingAnimation: React.FC<CookingAnimationProps> = ({
  width = '100%',
  height = 200,
  style,
  loop = true,
  autoplay = true,
}) => {
  const htmlContent = useMemo(() => {
    const jsonStr = JSON.stringify(cookingJsonData);
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
            function initLottie() {
              if (window.lottie || window.bodymovin) {
                var player = window.lottie || window.bodymovin;
                try {
                  var animData = ${jsonStr};
                  player.loadAnimation({
                    container: document.getElementById('lottie-box'),
                    renderer: 'svg',
                    loop: ${loop},
                    autoplay: ${autoplay},
                    animationData: animData
                  });
                } catch(e) {
                  console.error('Lottie Error:', e);
                }
              } else if (retryCount < 50) {
                retryCount++;
                setTimeout(initLottie, 60);
              }
            }

            if (document.readyState === 'complete' || document.readyState === 'interactive') {
              initLottie();
            } else {
              window.addEventListener('DOMContentLoaded', initLottie);
              window.addEventListener('load', initLottie);
            }
          </script>
        </body>
      </html>
    `;
  }, [loop, autoplay]);

  return (
    <View style={[{ width, height, overflow: 'hidden', backgroundColor: 'transparent' }, style]}>
      <WebView
        originWhitelist={['*']}
        source={{ html: htmlContent }}
        style={styles.webView}
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
      />
    </View>
  );
};

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

export default CookingAnimation;
