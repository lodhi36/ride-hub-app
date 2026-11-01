import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../locales/i18n';
import en from '../locales/en.json';
import hi from '../locales/hi.json';
import api from '../services/api';

export type AppLanguage = 'en' | 'hi';

interface LanguageContextType {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => Promise<void>;
  t: (key: string, defaultValue?: string) => string;
  isHindi: boolean;
}

const STORE_LANGUAGE_KEY = 'settings.lang';
const RIDER_LANGUAGE_KEY = 'rider_app_language';

const translations: Record<AppLanguage, any> = {
  en,
  hi,
};

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: async () => {},
  t: (key: string, defaultValue?: string) => defaultValue || key,
  isHindi: false,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<AppLanguage>('en');

  useEffect(() => {
    const loadSavedLanguage = async () => {
      try {
        const uStr = await AsyncStorage.getItem('user');
        let userLang: string | null = null;
        if (uStr) {
          try {
            const uObj = JSON.parse(uStr);
            userLang = uObj?.language || uObj?.preferredLanguage || null;
          } catch (_) {}
        }
        const saved = await AsyncStorage.getItem(STORE_LANGUAGE_KEY);
        const riderSaved = await AsyncStorage.getItem(RIDER_LANGUAGE_KEY);
        const active = (saved || riderSaved || userLang || 'en') as AppLanguage;
        const normalized = active === 'hi' ? 'hi' : 'en';
        setLanguageState(normalized);
        if (i18n.isInitialized && i18n.language !== normalized) {
          await i18n.changeLanguage(normalized);
        }
      } catch (err) {
        console.log('[LanguageContext] Error loading language:', err);
      }
    };
    loadSavedLanguage();
  }, []);

  const setLanguage = useCallback(async (lang: AppLanguage) => {
    const target = lang === 'hi' ? 'hi' : 'en';
    setLanguageState(target);
    try {
      await AsyncStorage.setItem(STORE_LANGUAGE_KEY, target);
      await AsyncStorage.setItem(RIDER_LANGUAGE_KEY, target);
      if (i18n.isInitialized) {
        await i18n.changeLanguage(target);
      }

      // Persist to user profile in storage and database
      const uStr = await AsyncStorage.getItem('user');
      if (uStr) {
        try {
          const uObj = JSON.parse(uStr);
          uObj.language = target;
          uObj.preferredLanguage = target;
          await AsyncStorage.setItem('user', JSON.stringify(uObj));
          api.post('/users/update-profile', { language: target, preferredLanguage: target }).catch(() => {});
        } catch (_) {}
      }
    } catch (err) {
      console.log('[LanguageContext] Error saving language:', err);
    }
  }, []);

  const t = useCallback(
    (key: string, defaultValue?: string): string => {
      try {
        const parts = key.split('.');
        let current: any = translations[language];
        for (const p of parts) {
          if (current && typeof current === 'object' && p in current) {
            current = current[p];
          } else {
            current = undefined;
            break;
          }
        }
        if (typeof current === 'string') {
          return current;
        }

        // Fallback to English if not found in Hindi
        if (language !== 'en') {
          let enCurrent: any = translations.en;
          for (const p of parts) {
            if (enCurrent && typeof enCurrent === 'object' && p in enCurrent) {
              enCurrent = enCurrent[p];
            } else {
              enCurrent = undefined;
              break;
            }
          }
          if (typeof enCurrent === 'string') {
            return enCurrent;
          }
        }

        return defaultValue || key;
      } catch (_) {
        return defaultValue || key;
      }
    },
    [language]
  );

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t,
        isHindi: language === 'hi',
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useAppLanguage = () => useContext(LanguageContext);
