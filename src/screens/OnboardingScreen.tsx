import React, { useState, useEffect, useRef, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { Dimensions, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { ThemeContext } from '../context/ThemeContext';
import { AuthContext } from '../context/AuthContext';
import { colors, spacing, shadows } from '../theme/colors';
import api from '../services/api';

const { width, height } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1',
    icon: '💖',
    titleEn: 'Premium Connections',
    titleHi: 'प्रीमियम कनेक्शन',
    descEn: 'Enjoy a safe and secure dating experience built with privacy first.',
    descHi: 'गोपनीयता को प्राथमिकता देते हुए सुरक्षित और संरक्षित डेटिंग का आनंद लें।',
  },
  {
    id: '2',
    icon: '✨',
    titleEn: 'Find Your Match',
    titleHi: 'अपना परफेक्ट मैच ढूंढें',
    descEn: 'Connect with genuine people near you based on shared passions.',
    descHi: 'अपनी पसंद के आधार पर अपने आस-पास के वास्तविक लोगों से जुड़ें।',
  },
  {
    id: '3',
    icon: '🔥',
    titleEn: 'Start Dating Today',
    titleHi: 'आज ही डेटिंग शुरू करें',
    descEn: 'Build meaningful relationships easily with instant verification.',
    descHi: 'त्वरित सत्यापन के साथ आसानी से अर्थपूर्ण संबंध बनाएं।',
  }
];

export default function OnboardingScreen({ navigation }: any) {
  const { theme } = useContext(ThemeContext);
  const { login } = useContext(AuthContext);
  const { i18n } = useTranslation();

  const isDark = theme === 'dark';
  const currentColors = isDark ? colors.dark : colors.light;

  // Screen State
  const [currentScreen, setCurrentScreen] = useState<'onboarding' | 'signup' | 'signin'>('onboarding');
  const [lang, setLang] = useState<'en' | 'hi'>(
    (i18n.language || 'en').startsWith('hi') ? 'hi' : 'en'
  );
  const [activeSlide, setActiveSlide] = useState(0);

  // Form State
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeField, setActiveField] = useState<string | null>(null);

  // Auto-scroll Carousel for Onboarding
  useEffect(() => {
    if (currentScreen !== 'onboarding') return;
    const timer = setInterval(() => {
      setActiveSlide(prev => (prev + 1) % SLIDES.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [currentScreen]);

  const toggleLanguage = () => {
    const nextLang = lang === 'en' ? 'hi' : 'en';
    setLang(nextLang);
    try {
      if (i18n && typeof i18n.changeLanguage === 'function') {
        i18n.changeLanguage(nextLang);
      }
    } catch (e) {
      console.log('Error changing language:', e);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleFormSubmit = async () => {
    if (currentScreen === 'signup') {
      if (!formData.username || !formData.email || !formData.password || !formData.confirmPassword) {
        showToast(lang === 'en' ? 'Please fill in all fields' : 'कृपया सभी फ़ील्ड भरें');
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        showToast(lang === 'en' ? 'Passwords do not match' : 'पासवर्ड मेल नहीं खाते');
        return;
      }
      if (!formData.email.endsWith('@gmail.com')) {
        showToast(lang === 'en' ? 'Only Gmail addresses are allowed' : 'केवल Gmail पते स्वीकार्य हैं');
        return;
      }

      try {
        setLoading(true);
        const res = await api.post('/auth/register', { 
          username: formData.username, 
          email: formData.email, 
          password: formData.password, 
          confirmPassword: formData.confirmPassword 
        });
        if (res.data.success) {
          showToast(lang === 'en' ? 'Account created successfully!' : 'खाता सफलतापूर्वक बनाया गया!');
          setTimeout(async () => {
            await login(res.data.token, res.data.refreshToken || res.data.token, res.data.user);
          }, 1000);
        }
      } catch (error: any) {
        const errMsg = error.response?.data?.message ||
                       error.response?.data?.errors?.[0]?.msg ||
                       error.message ||
                       'Signup Failed';
        showToast(errMsg);
      } finally {
        setLoading(false);
      }
    } else if (currentScreen === 'signin') {
      if (!formData.email || !formData.password) {
        showToast(lang === 'en' ? 'Please enter email and password' : 'कृपया ईमेल और पासवर्ड दर्ज करें');
        return;
      }

      try {
        setLoading(true);
        const res = await api.post('/auth/login', { 
          email: formData.email.trim().toLowerCase(), 
          password: formData.password 
        });
        if (res.data.success) {
          showToast(lang === 'en' ? 'Signed in successfully!' : 'सफलतापूर्वक साइन इन किया गया!');
          setTimeout(async () => {
            await login(res.data.token, res.data.refreshToken || res.data.token, res.data.user);
          }, 1000);
        } else {
          showToast(res.data.message || 'Login Failed');
        }
      } catch (error: any) {
        const errMsg = error.response?.data?.message || 'Cannot connect to server.';
        showToast(errMsg);
      } finally {
        setLoading(false);
      }
    }
  };

  const currentSlide = SLIDES[activeSlide];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]}>

      {/* Decorative Background Lighting Effects */}
      <View style={[styles.blob1, { backgroundColor: colors.primary, opacity: isDark ? 0.08 : 0.05 }]} />
      <View style={[styles.blob2, { backgroundColor: colors.secondary, opacity: isDark ? 0.06 : 0.04 }]} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* SCREEN 1: ONBOARDING CAROUSEL */}
        {currentScreen === 'onboarding' && (
          <View style={styles.screenWrapper}>
            {/* Top Bar with Language Toggle */}
            <View style={styles.header}>
              <TouchableOpacity
                onPress={toggleLanguage}
                activeOpacity={0.7}
                style={[
                  styles.langButton,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.75)',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)',
                  }
                ]}
              >
                <Text style={[styles.langText, { color: currentColors.text }]}>
                  {lang === 'en' ? 'HI' : 'EN'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Slide Graphic */}
            <View style={styles.illustrationContainer}>
              <View style={[styles.lottie, { justifyContent: 'center', alignItems: 'center', backgroundColor: isDark ? 'rgba(0, 102, 255, 0.12)' : '#EFF6FF', borderRadius: width * 0.3 }]}>
                <Text style={{ fontSize: 72 }}>{currentSlide.icon}</Text>
              </View>
            </View>

            {/* Slide Text & Slider Pagination */}
            <View style={styles.textContainer}>
              <Text style={[styles.title, { color: currentColors.text }]}>
                {lang === 'en' ? currentSlide.titleEn : currentSlide.titleHi}
              </Text>
              <Text style={[styles.description, { color: currentColors.textMuted }]}>
                {lang === 'en' ? currentSlide.descEn : currentSlide.descHi}
              </Text>

              {/* Slider Pagination Dots */}
              <View style={styles.paginationContainer}>
                {SLIDES.map((slide, idx) => (
                  <TouchableOpacity
                    key={slide.id}
                    onPress={() => setActiveSlide(idx)}
                    style={[
                      styles.dot,
                      {
                        width: activeSlide === idx ? 24 : 6,
                        backgroundColor: activeSlide === idx ? colors.primary : (isDark ? colors.dark.border : colors.light.border),
                      }
                    ]}
                  />
                ))}
              </View>
            </View>

            {/* Bottom Actions Section */}
            <View style={styles.bottomSection}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.primaryBtn]}
                onPress={() => setCurrentScreen('signup')}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryBtnText}>
                  {lang === 'en' ? 'Create Account' : 'खाता बनाएं'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  styles.secondaryBtn,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.6)',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)',
                  }
                ]}
                onPress={() => setCurrentScreen('signin')}
                activeOpacity={0.8}
              >
                <Text style={[styles.secondaryBtnText, { color: currentColors.text }]}>
                  {lang === 'en' ? 'Sign In' : 'साइन इन करें'}
                </Text>
              </TouchableOpacity>

              {/* Made in India Badge */}
              <View style={styles.madeInIndiaContainer}>
                <Text style={[styles.madeInIndiaText, { color: currentColors.textMuted }]}>
                  {lang === 'en' ? 'Made in' : 'निर्मित'}
                </Text>
                <View style={styles.flagWrapper}>
                  <Svg viewBox="0 0 640 480" style={styles.flagSvg}>
                    <Path fill="#f93" d="M0 0h640v160H0z" />
                    <Path fill="#fff" d="M0 160h640v160H0z" />
                    <Path fill="#128807" d="M0 320h640v160H0z" />
                    <Circle cx="320" cy="240" r="60" fill="none" stroke="#008" strokeWidth={8} />
                    <Path fill="#008" d="M320 180l8 52 52-8-36 40 40 36-52-8 8 52-40-36-36 40-8-52-52 8 36-40-40-36 52 8-8-52 40 36z" />
                  </Svg>
                </View>
                <Text style={[styles.madeInIndiaText, { color: currentColors.text, fontWeight: 'bold' }]}>
                  {lang === 'en' ? 'India' : 'भारत'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* SCREEN 2 & 3: CREATE ACCOUNT / SIGN IN */}
        {(currentScreen === 'signup' || currentScreen === 'signin') && (
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header with Back & Language Buttons */}
            <View style={styles.navHeader}>
              <TouchableOpacity
                onPress={() => setCurrentScreen('onboarding')}
                style={[styles.backBtn, { borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)' }]}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 20, color: currentColors.text, fontWeight: 'bold' }}>←</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={toggleLanguage}
                activeOpacity={0.7}
                style={[
                  styles.langButton,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.75)',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)',
                  }
                ]}
              >
                <Text style={[styles.langText, { color: currentColors.text }]}>
                  {lang === 'en' ? 'HI' : 'EN'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Top Title & Header */}
            <View style={styles.formHeader}>
              <View style={[styles.formLottieWrapper, { backgroundColor: isDark ? 'rgba(0, 102, 255, 0.15)' : '#EFF6FF', borderRadius: width * 0.22, justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ fontSize: 54 }}>{currentScreen === 'signup' ? '🔥' : '💖'}</Text>
              </View>
              <Text style={[styles.formTitle, { color: currentColors.text }]}>
                {currentScreen === 'signup' 
                  ? (lang === 'en' ? 'Create Account' : 'खाता बनाएं')
                  : (lang === 'en' ? 'Welcome Back' : 'वापसी पर स्वागत है')
                }
              </Text>
              <Text style={[styles.formSubtitle, { color: currentColors.textMuted }]}>
                {currentScreen === 'signup'
                  ? (lang === 'en' ? 'Join us and find your perfect match' : 'हमसे जुड़ें और अपना साथी खोजें')
                  : (lang === 'en' ? 'Sign in to continue your journey' : 'आगे बढ़ने के लिए साइन इन करें')
                }
              </Text>
            </View>

            {/* Dynamic Form */}
            <View style={styles.formContainer}>
              
              {/* Username Field (Sign up only) */}
              {currentScreen === 'signup' && (
                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: currentColors.text }]}>
                    {lang === 'en' ? 'Username' : 'उपयोगकर्ता नाम'}
                  </Text>
                  <TextInput
                    placeholder="your_username"
                    placeholderTextColor={currentColors.placeholder}
                    value={formData.username}
                    onChangeText={(val) => setFormData({ ...formData, username: val })}
                    onFocus={() => setActiveField('username')}
                    onBlur={() => setActiveField(null)}
                    style={[
                      styles.input,
                      { 
                        color: currentColors.text,
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.85)',
                        borderColor: activeField === 'username' ? colors.primary : (isDark ? '#3D373B' : '#DBEAFE'),
                        shadowColor: activeField === 'username' ? colors.primary : '#000',
                      }
                    ]}
                  />
                </View>
              )}

              {/* Email Field */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: currentColors.text }]}>
                  {lang === 'en' ? 'Email (Gmail)' : 'ईमेल'}
                </Text>
                <TextInput
                  placeholder="yourname@gmail.com"
                  placeholderTextColor={currentColors.placeholder}
                  value={formData.email}
                  onChangeText={(val) => setFormData({ ...formData, email: val })}
                  keyboardType="email-address"
                  onFocus={() => setActiveField('email')}
                  onBlur={() => setActiveField(null)}
                  style={[
                    styles.input,
                    { 
                      color: currentColors.text,
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.85)',
                      borderColor: activeField === 'email' ? colors.primary : (isDark ? '#3D373B' : '#DBEAFE'),
                      shadowColor: activeField === 'email' ? colors.primary : '#000',
                    }
                  ]}
                />
              </View>

              {/* Password Field */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: currentColors.text }]}>
                  {lang === 'en' ? 'Password' : 'पासवर्ड'}
                </Text>
                <View style={styles.passwordWrapper}>
                  <TextInput
                    secureTextEntry={!showPassword}
                    placeholder="••••••••"
                    placeholderTextColor={currentColors.placeholder}
                    value={formData.password}
                    onChangeText={(val) => setFormData({ ...formData, password: val })}
                    onFocus={() => setActiveField('password')}
                    onBlur={() => setActiveField(null)}
                    style={[
                      styles.input,
                      styles.passwordInput,
                      { 
                        color: currentColors.text,
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.85)',
                        borderColor: activeField === 'password' ? colors.primary : (isDark ? '#3D373B' : '#DBEAFE'),
                        shadowColor: activeField === 'password' ? colors.primary : '#000',
                      }
                    ]}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeBtn}
                    activeOpacity={0.7}
                  >
                    {showPassword ? (
                      <Svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke={activeField === 'password' ? colors.primary : currentColors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <Line x1="1" y1="1" x2="23" y2="23" />
                      </Svg>
                    ) : (
                      <Svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke={activeField === 'password' ? colors.primary : currentColors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <Circle cx="12" cy="12" r={3} />
                      </Svg>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm Password Field (Sign up only) */}
              {currentScreen === 'signup' && (
                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: currentColors.text }]}>
                    {lang === 'en' ? 'Confirm Password' : 'पासवर्ड की पुष्टि करें'}
                  </Text>
                  <View style={styles.passwordWrapper}>
                    <TextInput
                      secureTextEntry={!showConfirmPassword}
                      placeholder="••••••••"
                      placeholderTextColor={currentColors.placeholder}
                      value={formData.confirmPassword}
                      onChangeText={(val) => setFormData({ ...formData, confirmPassword: val })}
                      onFocus={() => setActiveField('confirm')}
                      onBlur={() => setActiveField(null)}
                      style={[
                        styles.input,
                        styles.passwordInput,
                        { 
                          color: currentColors.text,
                          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.85)',
                          borderColor: activeField === 'confirm' ? colors.primary : (isDark ? '#3D373B' : '#DBEAFE'),
                          shadowColor: activeField === 'confirm' ? colors.primary : '#000',
                        }
                      ]}
                    />
                    <TouchableOpacity
                      onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                      style={styles.eyeBtn}
                      activeOpacity={0.7}
                    >
                      {showConfirmPassword ? (
                        <Svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke={activeField === 'confirm' ? colors.primary : currentColors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                          <Line x1="1" y1="1" x2="23" y2="23" />
                        </Svg>
                      ) : (
                        <Svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke={activeField === 'confirm' ? colors.primary : currentColors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <Circle cx="12" cy="12" r={3} />
                        </Svg>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Submit Button */}
              <TouchableOpacity
                onPress={handleFormSubmit}
                style={[styles.signupBtn, { backgroundColor: colors.primary }]}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Text style={styles.signupBtnText}>
                  {loading ? (lang === 'en' ? 'Processing...' : 'प्रक्रिया जारी है...') : 
                    currentScreen === 'signup' 
                      ? (lang === 'en' ? 'Sign Up' : 'साइन अप करें')
                      : (lang === 'en' ? 'Sign In' : 'साइन इन करें')
                  }
                </Text>
              </TouchableOpacity>
            </View>

            {/* Footer Navigation Link */}
            <View style={styles.footer}>
              <Text style={[styles.footerText, { color: currentColors.textMuted }]}>
                {currentScreen === 'signup'
                  ? (lang === 'en' ? 'Already have an account?' : 'क्या आपके पास पहले से एक खाता है?')
                  : (lang === 'en' ? "Don't have an account?" : 'खाता नहीं है?')
                }
              </Text>
              <TouchableOpacity
                onPress={() => setCurrentScreen(currentScreen === 'signup' ? 'signin' : 'signup')}
              >
                <Text style={styles.loginLink}>
                  {currentScreen === 'signup'
                    ? (lang === 'en' ? 'Login' : 'लॉगिन करें')
                    : (lang === 'en' ? 'Sign Up' : 'साइन अप करें')
                  }
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      {/* Floating Toast Notification */}
      {toastMessage ? (
        <View style={[styles.toast, { backgroundColor: isDark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.98)' }]}>
          <Text style={[styles.toastText, { color: currentColors.text }]}>{toastMessage}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  blob1: {
    position: 'absolute',
    top: -100,
    left: -100,
    width: 250,
    height: 250,
    borderRadius: 125,
  },
  blob2: {
    position: 'absolute',
    bottom: -80,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
  },
  screenWrapper: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    zIndex: 10,
  },
  langButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    ...shadows.sm,
  },
  langText: {
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  langIcon: {
    width: 20,
    height: 20,
    marginRight: 6,
    resizeMode: 'contain',
  },
  illustrationContainer: {
    width: width * 0.9,
    height: height * 0.42,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lottie: {
    width: '100%',
    height: '100%',
  },
  textContainer: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginVertical: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: spacing.xs,
  },
  description: {
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 290,
    marginBottom: 16,
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 20,
  },
  dot: {
    height: 6,
    borderRadius: 3,
    marginHorizontal: 4,
  },
  bottomSection: {
    paddingHorizontal: 24,
    paddingBottom: spacing.lg,
  },
  actionBtn: {
    width: '100%',
    height: 52,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    ...shadows.md,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  secondaryBtn: {
    borderWidth: 1,
    ...shadows.sm,
  },
  secondaryBtnText: {
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  btnIcon: {
    width: 20,
    height: 20,
    marginRight: 8,
    resizeMode: 'contain',
  },
  madeInIndiaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  madeInIndiaText: {
    fontSize: 13,
    letterSpacing: 0.5,
  },
  flagWrapper: {
    width: 20,
    height: 14,
    marginHorizontal: 6,
    borderRadius: 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  flagSvg: {
    width: '100%',
    height: '100%',
  },
  navHeader: {
    paddingHorizontal: 24,
    paddingTop: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  backIcon: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  formHeader: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  formTitle: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  formSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 20,
  },
  formContainer: {
    marginVertical: 14,
    gap: 12,
  },
  inputGroup: {
    width: '100%',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    paddingLeft: 4,
    letterSpacing: 0.3,
  },
  input: {
    width: '100%',
    height: 50,
    borderRadius: 14,
    borderWidth: 2,
    paddingHorizontal: 16,
    fontSize: 14,
    fontWeight: '500',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  passwordWrapper: {
    position: 'relative',
    width: '100%',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  signupBtn: {
    width: '100%',
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 5,
  },
  signupBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  footerText: {
    fontSize: 13,
    fontWeight: '600',
  },
  loginLink: {
    color: colors.primary,
    fontWeight: '800',
    marginLeft: 6,
    fontSize: 13,
  },
  formLottieWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  toast: {
    position: 'absolute',
    top: 50,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  toastText: {
    fontSize: 13,
    fontWeight: '600',
  },
  toastIcon: {
    width: 18,
    height: 18,
    marginRight: 8,
    resizeMode: 'contain',
  },
});
