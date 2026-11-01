import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { useAppLanguage, AppLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface LanguageSelectModalProps {
  visible: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
}

export const LanguageSelectModal: React.FC<LanguageSelectModalProps> = ({
  visible,
  onClose,
  isDarkMode: propsIsDarkMode,
}) => {
  const { language, setLanguage, t } = useAppLanguage();
  const themeContext = useTheme();
  const isDarkMode = propsIsDarkMode !== undefined ? propsIsDarkMode : themeContext.isDark;

  const handleSelect = async (lang: AppLanguage) => {
    await setLanguage(lang);
    onClose();
  };

  const colors = isDarkMode
    ? {
        overlay: 'rgba(0, 0, 0, 0.75)',
        cardBg: '#1E1E1E',
        text: '#FFFFFF',
        subText: '#B0B0B0',
        border: '#2E2E2E',
        selectedBorder: '#0066FF',
        selectedBg: '#242424',
      }
    : {
        overlay: 'rgba(15, 23, 42, 0.55)',
        cardBg: '#FFFFFF',
        text: '#0F172A',
        subText: '#64748B',
        border: '#E2E8F0',
        selectedBorder: '#0066FF',
        selectedBg: '#EFF6FF',
      };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={[styles.overlay, { backgroundColor: colors.overlay }]}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.modalCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.title, { color: colors.text }]}>
                🌐 {t('common.select_language', 'Select Language')}
              </Text>
              <Text style={[styles.subtitle, { color: colors.subText }]}>
                {language === 'hi' ? 'अपनी पसंदीदा भाषा चुनें' : 'Choose your preferred language'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: 18, color: colors.subText }}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Options */}
          <View style={styles.optionsList}>
            {/* English */}
            <TouchableOpacity
              style={[
                styles.langOption,
                { backgroundColor: language === 'en' ? colors.selectedBg : colors.cardBg, borderColor: language === 'en' ? colors.selectedBorder : colors.border },
              ]}
              activeOpacity={0.8}
              onPress={() => handleSelect('en')}
            >
              <View style={styles.langLeft}>
                <Text style={{ fontSize: 26, marginRight: 12 }}>🇬🇧</Text>
                <View>
                  <Text style={[styles.langName, { color: colors.text }]}>English</Text>
                  <Text style={[styles.langSub, { color: colors.subText }]}>Default App Language</Text>
                </View>
              </View>
              {language === 'en' && (
                <View style={styles.checkCircle}>
                  <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900' }}>✓</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Hindi */}
            <TouchableOpacity
              style={[
                styles.langOption,
                { backgroundColor: language === 'hi' ? colors.selectedBg : colors.cardBg, borderColor: language === 'hi' ? colors.selectedBorder : colors.border },
              ]}
              activeOpacity={0.8}
              onPress={() => handleSelect('hi')}
            >
              <View style={styles.langLeft}>
                <Text style={{ fontSize: 26, marginRight: 12 }}>🇮🇳</Text>
                <View>
                  <Text style={[styles.langName, { color: colors.text }]}>हिन्दी (Hindi)</Text>
                  <Text style={[styles.langSub, { color: colors.subText }]}>भारतीय भाषा में उपयोग करें</Text>
                </View>
              </View>
              {language === 'hi' && (
                <View style={styles.checkCircle}>
                  <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900' }}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer Close */}
          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: '#0066FF' }]}
            activeOpacity={0.85}
            onPress={onClose}
          >
            <Text style={styles.doneBtnText}>{t('common.close', 'Done')}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: SCREEN_WIDTH - 40,
    maxWidth: 400,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 3,
  },
  closeBtn: {
    padding: 4,
  },
  optionsList: {
    gap: 12,
    marginBottom: 20,
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  langLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  langName: {
    fontSize: 16,
    fontWeight: '700',
  },
  langSub: {
    fontSize: 12,
    marginTop: 2,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0066FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneBtn: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default LanguageSelectModal;
