import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
  PermissionsAndroid,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import WebView from 'react-native-webview';
const WebViewComponent = WebView as any;
import Icon from './PngIcon';
import { useTheme } from '../context/ThemeContext';

const { width, height } = Dimensions.get('window');

interface VoiceSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onResult: (spokenText: string) => void;
}

const QUICK_VOICE_TAGS = [
  '🍕 Pizza',
  '🍲 Biryani',
  '🍔 Burger',
  '🥛 Fresh Milk',
  '🍰 Cake',
  '☕ Coffee',
  '🥗 Paneer Tikka',
  '🥦 Vegetables',
  '🥪 Sandwich',
  '🍦 Ice Cream',
];

export const VoiceSearchModal: React.FC<VoiceSearchModalProps> = ({
  visible,
  onClose,
  onResult,
}) => {
  const { isDark, currentColors } = useTheme('customer');
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pulseAnim1 = useRef(new Animated.Value(1)).current;
  const pulseAnim2 = useRef(new Animated.Value(1)).current;
  const pulseAnim3 = useRef(new Animated.Value(1)).current;
  const webViewRef = useRef<any>(null);

  // Pulse animation for listening indicator
  useEffect(() => {
    let anim1: Animated.CompositeAnimation;
    let anim2: Animated.CompositeAnimation;
    let anim3: Animated.CompositeAnimation;

    if (visible && isListening) {
      anim1 = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim1, {
            toValue: 1.4,
            duration: 900,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim1, {
            toValue: 1,
            duration: 900,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      anim2 = Animated.loop(
        Animated.sequence([
          Animated.delay(300),
          Animated.timing(pulseAnim2, {
            toValue: 1.7,
            duration: 900,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim2, {
            toValue: 1,
            duration: 900,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      anim3 = Animated.loop(
        Animated.sequence([
          Animated.delay(600),
          Animated.timing(pulseAnim3, {
            toValue: 2.0,
            duration: 900,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim3, {
            toValue: 1,
            duration: 900,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );

      anim1.start();
      anim2.start();
      anim3.start();
    } else {
      pulseAnim1.setValue(1);
      pulseAnim2.setValue(1);
      pulseAnim3.setValue(1);
    }

    return () => {
      anim1?.stop();
      anim2?.stop();
      anim3?.stop();
    };
  }, [visible, isListening]);

  // Request audio recording permission on open
  useEffect(() => {
    if (visible) {
      setInterimText('');
      setErrorMessage(null);
      setIsListening(true);
      requestMicPermission();
    } else {
      setIsListening(false);
      setInterimText('');
    }
  }, [visible]);

  const requestMicPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message: 'Ride Hub needs microphone access for fast voice search of food, groceries, and stores.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'Grant Permission',
          }
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          setHasPermission(true);
          startListening();
        } else {
          setHasPermission(false);
          setIsListening(false);
          setErrorMessage('Microphone permission denied. You can tap any popular search item below.');
        }
      } catch (err) {
        console.warn('Microphone permission request error:', err);
        setHasPermission(false);
        setIsListening(false);
      }
    } else {
      setHasPermission(true);
      startListening();
    }
  };

  const startListening = () => {
    setIsListening(true);
    setErrorMessage(null);
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        if (typeof window.startSpeechRec === 'function') {
          window.startSpeechRec();
        }
        true;
      `);
    }
  };

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'START') {
        setIsListening(true);
      } else if (data.type === 'RESULT') {
        const text = data.text || '';
        setInterimText(text);
        if (data.isFinal && text.trim().length > 0) {
          setTimeout(() => {
            onResult(text.trim());
            onClose();
          }, 350);
        }
      } else if (data.type === 'ERROR') {
        console.log('Speech recognition event error:', data.error);
        if (data.error === 'not-allowed') {
          setErrorMessage('Microphone access blocked. Please enable permissions.');
        }
      } else if (data.type === 'END') {
        if (interimText.trim().length > 0) {
          onResult(interimText.trim());
          onClose();
        }
      }
    } catch (e) {
      console.warn('VoiceSearchModal parse error:', e);
    }
  };

  const handleSelectQuickTag = (tag: string) => {
    const cleanText = tag.replace(/^[^\w\s]+/, '').trim();
    onResult(cleanText || tag);
    onClose();
  };

  const speechHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="background:transparent; margin:0; padding:0;">
      <script>
        var recognition;
        window.startSpeechRec = function() {
          try {
            var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRec) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'UNSUPPORTED' }));
              return;
            }
            if (recognition) {
              try { recognition.abort(); } catch(e){}
            }
            recognition = new SpeechRec();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-IN';

            recognition.onstart = function() {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'START' }));
            };

            recognition.onresult = function(event) {
              var fullTranscript = '';
              var isFinal = false;
              for (var i = 0; i < event.results.length; ++i) {
                fullTranscript += event.results[i][0].transcript + ' ';
                if (event.results[i].isFinal) {
                  isFinal = true;
                }
              }
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'RESULT',
                text: fullTranscript.trim(),
                isFinal: isFinal
              }));
            };

            recognition.onerror = function(err) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'ERROR',
                error: (err && err.error) || 'unknown'
              }));
            };

            recognition.onend = function() {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'END' }));
            };

            recognition.start();
          } catch(err) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'ERROR',
              error: err.message
            }));
          }
        };
        // Trigger right away
        window.startSpeechRec();
      </script>
    </body>
    </html>
  `;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Hidden WebView for Web Speech Recognition Engine */}
        <View style={{ height: 0, width: 0, opacity: 0, overflow: 'hidden' }}>
          <WebViewComponent
            ref={webViewRef}
            source={{ html: speechHtml }}
            onMessage={handleWebViewMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback={true}
            originWhitelist={['*']}
          />
        </View>

        <View style={[styles.sheetContainer, isDark && { backgroundColor: currentColors.card, borderColor: currentColors.border, borderWidth: 1 }]}>
          {/* Top Close Button */}
          <View style={styles.sheetHeader}>
            <View style={[styles.voiceHeaderBadge, isDark && { backgroundColor: currentColors.elevatedSurface }]}>
              <Icon name="mic" size={16} color="#0066FF" />
              <Text style={[styles.voiceHeaderBadgeText, isDark && { color: '#60A5FA' }]}>Voice Assistant</Text>
            </View>
            <TouchableOpacity
              style={[styles.closeBtn, isDark && { backgroundColor: currentColors.elevatedSurface }]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Icon name="close" size={18} color={currentColors.primaryText} />
            </TouchableOpacity>
          </View>

          {/* Spoken Text / Listening Indicator */}
          <View style={styles.centerListeningWrap}>
            <Text style={[styles.listeningTitle, isDark && { color: currentColors.primaryText }]}>
              {interimText
                ? `"${interimText}"`
                : isListening
                ? 'Listening... Speak now'
                : 'Tap microphone to speak'}
            </Text>
            <Text style={[styles.listeningSub, isDark && { color: currentColors.secondaryText }]}>
              {interimText
                ? 'Searching stores, dishes & items...'
                : 'Say "Pizza", "Biryani", "Supermarket", or "Fresh Milk"'}
            </Text>

            {/* Ripple Pulse Visualizer */}
            <View style={styles.micCircleContainer}>
              {isListening && (
                <>
                  <Animated.View
                    style={[
                      styles.pulseRing,
                      {
                        transform: [{ scale: pulseAnim3 }],
                        opacity: 0.15,
                        backgroundColor: '#0066FF',
                      },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.pulseRing,
                      {
                        transform: [{ scale: pulseAnim2 }],
                        opacity: 0.25,
                        backgroundColor: '#0066FF',
                      },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.pulseRing,
                      {
                        transform: [{ scale: pulseAnim1 }],
                        opacity: 0.4,
                        backgroundColor: '#0066FF',
                      },
                    ]}
                  />
                </>
              )}

              <TouchableOpacity
                style={[
                  styles.mainMicBtn,
                  isDark && { backgroundColor: currentColors.elevatedSurface, borderColor: currentColors.border },
                  isListening && styles.mainMicBtnActive,
                ]}
                activeOpacity={0.85}
                onPress={() => {
                  if (isListening) {
                    setIsListening(false);
                    if (interimText.trim()) {
                      onResult(interimText.trim());
                      onClose();
                    }
                  } else {
                    requestMicPermission();
                  }
                }}
              >
                <Icon
                  name="mic"
                  size={36}
                  color={isListening ? '#FFFFFF' : '#0066FF'}
                />
              </TouchableOpacity>
            </View>

            {errorMessage && (
              <View style={[styles.errorBanner, isDark && { backgroundColor: '#2E1515', borderColor: '#7F1D1D' }]}>
                <Text style={[styles.errorBannerText, isDark && { color: '#F87171' }]}>{errorMessage}</Text>
              </View>
            )}
          </View>

          {/* Quick Voice Tag Chips */}
          <View style={styles.quickTagsSection}>
            <Text style={[styles.quickTagsTitle, isDark && { color: currentColors.secondaryText }]}>Or tap a trending item:</Text>
            <View style={styles.quickTagsWrap}>
              {QUICK_VOICE_TAGS.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  style={[styles.quickTagChip, isDark && { backgroundColor: currentColors.elevatedSurface, borderColor: currentColors.border }]}
                  onPress={() => handleSelectQuickTag(tag)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.quickTagText, isDark && { color: currentColors.primaryText }]}>{tag}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Bottom Confirmation if text spoken */}
          {interimText.trim().length > 0 && (
            <TouchableOpacity
              style={styles.searchNowBtn}
              activeOpacity={0.85}
              onPress={() => {
                onResult(interimText.trim());
                onClose();
              }}
            >
              <Text style={styles.searchNowBtnText}>Search "{interimText}" ›</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  voiceHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  voiceHeaderBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0066FF',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerListeningWrap: {
    alignItems: 'center',
    marginVertical: 12,
  },
  listeningTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
  },
  listeningSub: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  micCircleContainer: {
    width: 130,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginVertical: 10,
  },
  pulseRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  mainMicBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#EFF6FF',
    borderWidth: 2,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  mainMicBtnActive: {
    backgroundColor: '#0066FF',
    borderColor: '#2563EB',
  },
  errorBanner: {
    marginTop: 12,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
    textAlign: 'center',
  },
  quickTagsSection: {
    marginTop: 16,
  },
  quickTagsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 10,
  },
  quickTagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickTagChip: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
  },
  quickTagText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  searchNowBtn: {
    backgroundColor: '#0066FF',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    elevation: 4,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  searchNowBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

export default VoiceSearchModal;
