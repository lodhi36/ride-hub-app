import React, { createContext, useState, useEffect, ReactNode, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme/colors';

export type Theme = 'light' | 'dark';
export type RoleThemeKey = 'customer' | 'supplier' | 'delivery';

export const normalizeRoleKey = (r?: string | null): RoleThemeKey => {
  const str = String(r || '').toLowerCase().trim();
  if (str.includes('supp') || str.includes('resto') || str.includes('store') || str.includes('partner')) {
    return 'supplier';
  }
  if (str.includes('deliv') || str.includes('rider') || str.includes('driver')) {
    return 'delivery';
  }
  return 'customer';
};

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  currentColors: typeof colors.light;
  activeRole: RoleThemeKey;
  setActiveRole: (role: RoleThemeKey) => void;
  rolesTheme: Record<RoleThemeKey, Theme>;
  toggleTheme: (role?: string) => Promise<void>;
  setIsDark: (val: boolean, role?: string) => Promise<void>;
  setTheme: (theme: Theme, role?: string) => Promise<void>;
  getThemeForRole: (role?: string) => Theme;
  isDarkForRole: (role?: string) => boolean;
}

export const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  isDark: false,
  currentColors: colors.light,
  activeRole: 'customer',
  setActiveRole: () => {},
  rolesTheme: { customer: 'light', supplier: 'light', delivery: 'light' },
  toggleTheme: async () => {},
  setIsDark: async () => {},
  setTheme: async () => {},
  getThemeForRole: () => 'light',
  isDarkForRole: () => false,
});

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [rolesTheme, setRolesTheme] = useState<Record<RoleThemeKey, Theme>>({
    customer: 'light',
    supplier: 'light',
    delivery: 'light',
  });
  const [activeRole, setActiveRoleState] = useState<RoleThemeKey>('customer');

  useEffect(() => {
    const loadThemes = async () => {
      try {
        const [gTheme, cTheme, sTheme, dTheme, storedActiveRole] = await Promise.all([
          AsyncStorage.getItem('appTheme_global'),
          AsyncStorage.getItem('appTheme_customer'),
          AsyncStorage.getItem('appTheme_supplier'),
          AsyncStorage.getItem('appTheme_delivery'),
          AsyncStorage.getItem('activeRole'),
        ]);

        const normRole = normalizeRoleKey(storedActiveRole);
        setActiveRoleState(normRole);

        const defaultOrGlobal = (gTheme as Theme) || 'light';

        setRolesTheme({
          customer: (cTheme as Theme) || defaultOrGlobal,
          supplier: (sTheme as Theme) || defaultOrGlobal,
          delivery: (dTheme as Theme) || defaultOrGlobal,
        });
      } catch (e) {}
    };
    loadThemes();
  }, []);

  const setActiveRole = (role: RoleThemeKey) => {
    setActiveRoleState(role);
    AsyncStorage.setItem('activeRole', role).catch(() => {});
  };

  const getThemeForRole = (role?: string): Theme => {
    const key = normalizeRoleKey(role || activeRole);
    return rolesTheme[key] || 'light';
  };

  const isDarkForRole = (role?: string): boolean => {
    return getThemeForRole(role) === 'dark';
  };

  const toggleTheme = async (role?: string) => {
    const key = normalizeRoleKey(role || activeRole);
    const current = rolesTheme[key] || 'light';
    const next: Theme = current === 'light' ? 'dark' : 'light';

    setRolesTheme((prev) => ({
      ...prev,
      [key]: next,
      // If toggled without specific role or to dark, sync globally
      ...(!role ? { customer: next, supplier: next, delivery: next } : {}),
    }));

    await AsyncStorage.setItem(`appTheme_${key}`, next);
    if (!role || next === 'dark') {
      await AsyncStorage.setItem('appTheme_global', next);
    }
  };

  const setIsDark = async (val: boolean, role?: string) => {
    const key = normalizeRoleKey(role || activeRole);
    const next: Theme = val ? 'dark' : 'light';

    setRolesTheme((prev) => ({
      ...prev,
      [key]: next,
      ...(!role ? { customer: next, supplier: next, delivery: next } : {}),
    }));

    await AsyncStorage.setItem(`appTheme_${key}`, next);
    if (!role || next === 'dark') {
      await AsyncStorage.setItem('appTheme_global', next);
    }
  };

  const setTheme = async (newTheme: Theme, role?: string) => {
    const key = normalizeRoleKey(role || activeRole);
    setRolesTheme((prev) => ({
      ...prev,
      [key]: newTheme,
      ...(!role ? { customer: newTheme, supplier: newTheme, delivery: newTheme } : {}),
    }));
    await AsyncStorage.setItem(`appTheme_${key}`, newTheme);
    if (!role || newTheme === 'dark') {
      await AsyncStorage.setItem('appTheme_global', newTheme);
    }
  };

  // Default theme based on current active role
  const defaultTheme = rolesTheme[activeRole] || 'light';
  const isDark = defaultTheme === 'dark';
  const currentColors = isDark ? colors.dark : colors.light;

  return (
    <ThemeContext.Provider
      value={{
        theme: defaultTheme,
        isDark,
        currentColors,
        activeRole,
        setActiveRole,
        rolesTheme,
        toggleTheme,
        setIsDark,
        setTheme,
        getThemeForRole,
        isDarkForRole,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (specificRole?: string) => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  const targetRole = specificRole ? normalizeRoleKey(specificRole) : context.activeRole;
  const currentTheme = context.rolesTheme[targetRole] || 'light';
  const isDark = currentTheme === 'dark';
  const currentColors = isDark ? colors.dark : colors.light;

  const toggleTheme = async () => {
    await context.toggleTheme(targetRole);
  };

  const setIsDark = async (val: boolean) => {
    await context.setIsDark(val, targetRole);
  };

  const setTheme = async (val: Theme) => {
    await context.setTheme(val, targetRole);
  };

  return {
    ...context,
    theme: currentTheme,
    isDark,
    currentColors,
    role: targetRole,
    toggleTheme,
    setIsDark,
    setTheme,
  };
};
