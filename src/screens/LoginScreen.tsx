import React, { useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { Dimensions, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import Icon from '../components/PngIcon';
import { ThemeContext } from '../context/ThemeContext';
import { AuthContext } from '../context/AuthContext';
import { colors, typography, spacing, radius, shadows } from '../theme/colors';
import api from '../services/api';

const { width, height } = Dimensions.get('window');

export default function LoginScreen({ navigation }: any) {
  const { theme } = useContext(ThemeContext);
  const { login } = useContext(AuthContext);
  const { t, i18n } = useTranslation();
  const [lang, setLang] = useState(i18n.language);

  const toggleLanguage = () => {
    const nextLang = lang === 'en' ? 'hi' : 'en';
    setLang(nextLang);
    i18n.changeLanguage(nextLang);
  };

  const isDark = theme === 'dark';
  const currentColors = isDark ? colors.dark : colors.light;

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Focus states
  const [activeField, setActiveField] = useState<string | null>(null);

  // Password visibility state
  const [showPassword, setShowPassword] = useState(false);

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState('');

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage('');
    }, 3000);
  };

  useEffect(() => {
    const checkAlreadyLoggedIn = async () => {
      try {
        const activeRole = await AsyncStorage.getItem('activeRole');
        const custToken = await AsyncStorage.getItem('customerToken');
        if (activeRole === 'CUSTOMER' && custToken) {
          navigation.replace('CustomerHomeScreen');
        }
      } catch (e) {}
    };
    checkAlreadyLoggedIn();
  }, []);

  const handleEmailLogin = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();
    if (!cleanEmail || !cleanPassword) {
      triggerToast('Please enter email/phone and password');
      return;
    }

    try {
      setLoading(true);
      const res = await api.post('/auth/login', { 
        email: cleanEmail, 
        password: cleanPassword 
      });
      if (res.data.success) {
        triggerToast('Signed in successfully!');
        const { token, user } = res.data;
        if (user.role === 'supplier') {
          await AsyncStorage.setItem('supplierToken', token);
          await AsyncStorage.setItem('registeredSupplierId', user._id || user.id);
          await AsyncStorage.setItem('supplierUser', JSON.stringify(user));
          await AsyncStorage.setItem('activeRole', 'SUPPLIER');
          await AsyncStorage.setItem('userToken', token);
          setTimeout(async () => {
            await login(token, res.data.refreshToken || '', user);
            navigation.replace('RiderHomeScreen', {
              riderName: user.name || 'Restaurant',
              riderId: user._id || user.id
            });
          }, 300);
          return;
        }

        await AsyncStorage.setItem('customerToken', token);
        await AsyncStorage.setItem('registeredCustomerId', user._id || user.id);
        await AsyncStorage.setItem('registeredCustomerName', user.name || user.username || 'Customer');
        await AsyncStorage.setItem('customerUser', JSON.stringify(user));
        await AsyncStorage.setItem('activeRole', 'CUSTOMER');
        await AsyncStorage.setItem('userToken', token);
        setTimeout(async () => {
          await login(token, res.data.refreshToken || '', user);
          navigation.replace('CustomerHomeScreen');
        }, 300);
      } else {
        triggerToast(res.data.message || 'Login Failed');
      }
    } catch (error: any) {
      const errMsg = error.response?.data?.message || 'Cannot connect to server.';
      if (error.response?.data?.errorType === 'ROLE_CONFLICT') {
        Alert.alert('रोल प्रतिबंध (Role Restriction)', errMsg, [
          { text: 'रोल बदलें (Change Role)', onPress: () => navigation.navigate('RoleSelection') },
          { text: 'ठीक है (OK)', style: 'cancel' },
        ]);
      } else {
        triggerToast(errMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]}>
      {/* Dynamic Ambient Background Blobs */}
      <View style={[styles.blob1, { backgroundColor: colors.primary, opacity: isDark ? 0.08 : 0.05 }]} />
      <View style={[styles.blob2, { backgroundColor: colors.secondary, opacity: isDark ? 0.06 : 0.04 }]} />

      {/* Sleek Navigation Header */}
      <View style={styles.navHeader}>
        <TouchableOpacity 
          style={[styles.backBtn, { borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)' }]} 
          onPress={() => navigation.goBack()}
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

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent} 
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header Section */}
          <View style={styles.header}>
            <View style={[styles.lottieWrapper, { backgroundColor: isDark ? 'rgba(0, 102, 255, 0.15)' : '#EFF6FF', borderRadius: width * 0.22 }]}>
              <Text style={{ fontSize: 54 }}>💖</Text>
            </View>
            <Text style={[styles.title, { color: currentColors.text }]}>Welcome Back</Text>
            <Text style={[styles.subtitle, { color: currentColors.textMuted }]}>
              Sign in to continue your journey
            </Text>
          </View>

          {/* Form Fields Section */}
          <View style={styles.formContainer}>
            {/* Field 1: Email */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: currentColors.text }]}>Email (Gmail)</Text>
              <TextInput
                style={[
                  styles.input,
                  { 
                    color: currentColors.text,
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.85)',
                    borderColor: activeField === 'email' ? colors.primary : (isDark ? '#3D373B' : '#DBEAFE'),
                    shadowColor: activeField === 'email' ? colors.primary : '#000',
                  }
                ]}
                placeholder="yourname@gmail.com"
                placeholderTextColor={currentColors.placeholder}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                onFocus={() => setActiveField('email')}
                onBlur={() => setActiveField(null)}
              />
            </View>

            {/* Field 2: Password */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: currentColors.text }]}>Password</Text>
              <View style={styles.passwordWrapper}>
                <TextInput
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
                  placeholder="••••••••"
                  placeholderTextColor={currentColors.placeholder}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  onFocus={() => setActiveField('password')}
                  onBlur={() => setActiveField(null)}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword(!showPassword)}
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

            {/* Premium Glowing Sign In Button */}
            <TouchableOpacity
              style={styles.signupBtn}
              onPress={handleEmailLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.signupBtnText}>
                {loading ? 'Signing In...' : 'Sign In'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Footer Navigation Link */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: currentColors.textMuted }]}>
              Don't have an account?
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
              <Text style={styles.loginLink}>{t('login.sign_up')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
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
  header: {
    alignItems: 'center',
    marginBottom: 8,
  },
  lottieWrapper: {
    width: width * 0.44,
    height: width * 0.44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lottie: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginTop: 6,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  formContainer: {
    marginVertical: 16,
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
    backgroundColor: colors.primary,
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
});
