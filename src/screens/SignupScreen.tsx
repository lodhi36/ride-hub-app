import React, { useState, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { Dimensions, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Line, Rect } from 'react-native-svg';
import Icon from '../components/PngIcon';
import { ThemeContext } from '../context/ThemeContext';
import { AuthContext } from '../context/AuthContext';
import { colors, shadows } from '../theme/colors';
import api from '../services/api';

const { width, height } = Dimensions.get('window');

export default function SignupScreen({ navigation }: any) {
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
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Focus states
  const [activeField, setActiveField] = useState<string | null>(null);

  // Password visibility states
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState('');

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage('');
    }, 3000);
  };

  const handleSignup = async () => {
    const finalUsername = (username || `user_${Date.now().toString().slice(-4)}`).trim().toLowerCase();
    const finalEmail = (email || `${finalUsername}@gmail.com`).trim();
    const finalPassword = (password || '1234').trim();

    try {
      setLoading(true);
      const res = await api.post('/auth/register', { username: finalUsername, email: finalEmail, password: finalPassword });
      if (res.data.success) {
        triggerToast('Account created successfully!');
        setTimeout(async () => {
          await login(res.data.token, res.data.refreshToken || '', res.data.user);
        }, 1000);
      }
    } catch (error: any) {
      const errMsg = error.response?.data?.message ||
                     error.response?.data?.errors?.[0]?.msg ||
                     error.message ||
                     'Signup Failed';
      triggerToast(errMsg);
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
              <Text style={{ fontSize: 54 }}>🔥</Text>
            </View>
            <Text style={[styles.title, { color: currentColors.text }]}>Create Account</Text>
            <Text style={[styles.subtitle, { color: currentColors.textMuted }]}>
              Join us and find your perfect match
            </Text>
          </View>

          {/* Form Fields Card Container */}
          <View style={[
            styles.card, 
            { 
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.45)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 51, 102, 0.06)'
            }
          ]}>
            {/* Field 1: Username */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: currentColors.text }]}>Username</Text>
              <View style={styles.inputWrapper}>
                <View style={styles.inputLeftIcon}>
                  <Svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke={activeField === 'username' ? colors.primary : currentColors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <Circle cx="12" cy="7" r="4" />
                  </Svg>
                </View>
                <TextInput
                  style={[
                    styles.input,
                    { 
                      color: currentColors.text,
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.85)',
                      borderColor: activeField === 'username' ? colors.primary : (isDark ? '#3D373B' : '#DBEAFE'),
                      shadowColor: activeField === 'username' ? colors.primary : '#000',
                    }
                  ]}
                  placeholder="your_username"
                  placeholderTextColor={currentColors.placeholder}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  onFocus={() => setActiveField('username')}
                  onBlur={() => setActiveField(null)}
                />
              </View>
            </View>

            {/* Field 2: Email */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: currentColors.text }]}>Email (Gmail)</Text>
              <View style={styles.inputWrapper}>
                <View style={styles.inputLeftIcon}>
                  <Svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke={activeField === 'email' ? colors.primary : currentColors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <Path d="M22 6l-10 7L2 6" />
                  </Svg>
                </View>
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
            </View>

            {/* Field 3: Password */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: currentColors.text }]}>Password</Text>
              <View style={styles.passwordWrapper}>
                <View style={styles.inputLeftIcon}>
                  <Svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke={activeField === 'password' ? colors.primary : currentColors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <Rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </Svg>
                </View>
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

            {/* Field 4: Confirm Password */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: currentColors.text }]}>Confirm Password</Text>
              <View style={styles.passwordWrapper}>
                <View style={styles.inputLeftIcon}>
                  <Svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke={activeField === 'confirm' ? colors.primary : currentColors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <Rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </Svg>
                </View>
                <TextInput
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
                  placeholder="••••••••"
                  placeholderTextColor={currentColors.placeholder}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  onFocus={() => setActiveField('confirm')}
                  onBlur={() => setActiveField(null)}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
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

            {/* Premium Glowing Sign Up Button */}
            <TouchableOpacity
              style={styles.signupBtn}
              onPress={handleSignup}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.signupBtnText}>
                {loading ? 'Creating Account...' : 'Sign Up'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Footer Navigation Link */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: currentColors.textMuted }]}>
              Already have an account?
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>{t('signup.login')}</Text>
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
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  header: {
    alignItems: 'center',
    marginBottom: 12,
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
  card: {
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 16,
    gap: 12,
    ...shadows.md,
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
  inputWrapper: {
    position: 'relative',
    width: '100%',
    justifyContent: 'center',
  },
  inputLeftIcon: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    width: '100%',
    height: 50,
    borderRadius: 14,
    borderWidth: 2,
    paddingLeft: 44,
    paddingRight: 16,
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
    marginTop: 20,
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
  toastIcon: {
    width: 18,
    height: 18,
    marginRight: 8,
    resizeMode: 'contain',
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
