import React, { createContext, useState, useEffect, ReactNode, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigationRef } from '../services/NavigationService';
import api, { clearApiCachedAuth } from '../services/api';
import { ThemeContext } from './ThemeContext';
import { rideStore } from '../services/rideStore';
import { CartService } from '../services/CartService';

export interface User {
  _id?: string;
  id?: string;
  email?: string;
  username?: string;
  name?: string;
  fullName?: string;
  role?: string;
  phone?: string;
  phoneNumber?: string;
  photos?: any[];
  location?: any;
  fullAddress?: string;
  address?: string;
  categoryName?: string;
  businessCategoryName?: string;
  isOnline?: boolean;
  restaurant_status?: string;
  partnerId?: string;
  partnerType?: 'RESTAURANT' | 'BEAUTY' | 'FASHION' | 'GROCERY' | 'VEGETABLES' | 'TOYS' | 'SERVICES' | 'OTHER' | string;
  businessType?: string;
  businessId?: string;
  restaurantId?: string;
  profilePicture?: string;
  isProfileComplete?: boolean;
  theme?: 'light' | 'dark';
  verificationStatus?: 'pending' | 'verified' | 'rejected';
  approvalStatus?: string;
  [key: string]: any;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (token: string, refreshToken: string, userData: User) => Promise<void>;
  logout: (targetRole?: 'CUSTOMER' | 'SUPPLIER' | 'DELIVERY' | 'ALL') => Promise<void>;
  updateUser: (userData: Partial<User>) => void;
  switchTestRole?: (role: 'CUSTOMER' | 'RESTAURANT' | 'DELIVERY', targetUser: User, token: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
  updateUser: () => {},
  switchTestRole: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { setTheme } = useContext(ThemeContext);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const activeRoleRaw = await AsyncStorage.getItem('activeRole');
        const activeRole = (activeRoleRaw || '').toUpperCase();
        const delivTok = await AsyncStorage.getItem('deliveryToken');
        const suppTok = await AsyncStorage.getItem('supplierToken');
        const custTok = await AsyncStorage.getItem('customerToken');
        const globalTok = await AsyncStorage.getItem('userToken');

        const cachedDeliv = await AsyncStorage.getItem('deliveryUser');
        const cachedSupp = await AsyncStorage.getItem('supplierUser');
        const cachedCust = await AsyncStorage.getItem('customerUser');

        let resolvedToken: string | null = null;

        if ((activeRole === 'DELIVERY' || activeRole === 'RIDER') && (delivTok || cachedDeliv)) {
          resolvedToken = delivTok || globalTok;
          if (resolvedToken) {
            await AsyncStorage.setItem('userToken', resolvedToken);
            if (!delivTok) await AsyncStorage.setItem('deliveryToken', resolvedToken);
          }
          await AsyncStorage.setItem('activeRole', 'DELIVERY');
          if (cachedDeliv) {
            try { setUser(JSON.parse(cachedDeliv)); } catch (e) {}
          }
        } else if (activeRole === 'SUPPLIER' && (suppTok || cachedSupp)) {
          resolvedToken = suppTok || globalTok;
          if (resolvedToken) {
            await AsyncStorage.setItem('userToken', resolvedToken);
            if (!suppTok) await AsyncStorage.setItem('supplierToken', resolvedToken);
          }
          if (cachedSupp) {
            try { setUser(JSON.parse(cachedSupp)); } catch (e) {}
          }
        } else if (activeRole === 'CUSTOMER' && (custTok || cachedCust)) {
          resolvedToken = custTok || globalTok;
          if (resolvedToken) {
            await AsyncStorage.setItem('userToken', resolvedToken);
            if (!custTok) await AsyncStorage.setItem('customerToken', resolvedToken);
          }
          if (cachedCust) {
            try {
              const u = JSON.parse(cachedCust);
              setUser(u);
              CartService.setUserId(u._id || u.id);
            } catch (e) {}
          }
        } else {
          // Fallback priority when activeRole wasn't set
          if (delivTok && cachedDeliv) {
            resolvedToken = delivTok;
            await AsyncStorage.setItem('activeRole', 'DELIVERY');
            await AsyncStorage.setItem('userToken', delivTok);
            try { setUser(JSON.parse(cachedDeliv)); } catch (e) {}
          } else if (custTok && cachedCust) {
            resolvedToken = custTok;
            await AsyncStorage.setItem('activeRole', 'CUSTOMER');
            await AsyncStorage.setItem('userToken', custTok);
            try {
              const u = JSON.parse(cachedCust);
              setUser(u);
              CartService.setUserId(u._id || u.id);
            } catch (e) {}
          } else if (suppTok && cachedSupp) {
            resolvedToken = suppTok;
            await AsyncStorage.setItem('activeRole', 'SUPPLIER');
            await AsyncStorage.setItem('userToken', suppTok);
            try { setUser(JSON.parse(cachedSupp)); } catch (e) {}
          } else {
            resolvedToken = globalTok;
          }
        }

        clearApiCachedAuth();

        if (resolvedToken) {
          // Non-blocking background revalidation with /auth/me (preserving cached offline/lifetime session)
          api.get('/auth/me').then(async (res) => {
            if (res.data?.success && res.data?.user) {
              const uRole = (res.data.user.role || '').toLowerCase();
              const currentActive = ((await AsyncStorage.getItem('activeRole')) || '').toUpperCase();
              const roleMatches =
                (currentActive === 'SUPPLIER' && ['supplier', 'seller_partner'].includes(uRole)) ||
                (currentActive === 'DELIVERY' && ['rider', 'delivery', 'delivery_partner', 'provider'].includes(uRole)) ||
                (currentActive === 'CUSTOMER' && uRole === 'customer');
              if (roleMatches) {
                setUser(res.data.user);
              }
              if (uRole === 'supplier' || uRole === 'seller_partner') {
                await AsyncStorage.setItem('supplierUser', JSON.stringify(res.data.user));
              } else if (['rider', 'delivery', 'delivery_partner', 'provider'].includes(uRole)) {
                await AsyncStorage.setItem('deliveryUser', JSON.stringify(res.data.user));
              } else if (uRole === 'customer') {
                await AsyncStorage.setItem('customerUser', JSON.stringify(res.data.user));
                CartService.setUserId(res.data.user._id || res.data.user.id);
              }
              if (res.data.user.theme) {
                setTheme(res.data.user.theme);
                await AsyncStorage.setItem('appTheme', res.data.user.theme);
              }
            }
          }).catch((apiErr: any) => {
            // NEVER logout on network errors, timeouts, or 401/offline states
            console.log('[AuthContext] Background token revalidation preserved:', apiErr?.message || 'Cached');
          });
        }
      } catch (error) {
        console.log('Failed to load user session', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadUser();
  }, []);

  const login = async (token: string, refreshToken: string, userData: User) => {
    clearApiCachedAuth();
    // Clear global & stale caches so Customer/Supplier/Rider state never leaks across sessions
    try {
      const FastStorage = require('../services/FastStorage').default;
      if (FastStorage?.clearUserSession) FastStorage.clearUserSession().catch(() => {});
    } catch (_) {}
    try {
      const { clearAllLocationMemoryCaches } = require('../services/LocationAddressService');
      if (clearAllLocationMemoryCaches) clearAllLocationMemoryCaches();
    } catch (_) {}
    await AsyncStorage.removeItem('userData').catch(() => {});

    const role = (userData.role || '').toLowerCase();
    const newId = String((userData as any)?._id || (userData as any)?.id || '');
    if (role === 'supplier' || role === 'seller_partner') {
      try {
        const oldSuppRaw = await AsyncStorage.getItem('supplierUser');
        const oldSuppId = oldSuppRaw ? String(JSON.parse(oldSuppRaw)?._id || JSON.parse(oldSuppRaw)?.id || '') : '';
        if (oldSuppId && newId && oldSuppId !== newId) {
          const { clearSupplierLocationCache } = require('../services/LocationAddressService');
          await clearSupplierLocationCache();
        }
      } catch (_) {}
      await AsyncStorage.setItem('supplierToken', token);
      if (refreshToken) await AsyncStorage.setItem('supplierRefreshToken', refreshToken);
      await AsyncStorage.setItem('supplierUser', JSON.stringify(userData));
      await AsyncStorage.setItem('registeredSupplierId', newId);
      await AsyncStorage.setItem('activeRole', 'SUPPLIER');
      CartService.setUserId(null);
    } else if (['rider', 'delivery', 'delivery_partner', 'provider'].includes(role)) {
      try {
        const oldDelivRaw = await AsyncStorage.getItem('deliveryUser');
        const oldDelivId = oldDelivRaw ? String(JSON.parse(oldDelivRaw)?._id || JSON.parse(oldDelivRaw)?.id || '') : '';
        if (oldDelivId && newId && oldDelivId !== newId) {
          const { clearRiderLocationCache } = require('../services/LocationAddressService');
          await clearRiderLocationCache();
        }
      } catch (_) {}
      await AsyncStorage.setItem('deliveryToken', token);
      if (refreshToken) await AsyncStorage.setItem('deliveryRefreshToken', refreshToken);
      await AsyncStorage.setItem('deliveryUser', JSON.stringify(userData));
      await AsyncStorage.setItem('activeRole', 'DELIVERY');
      CartService.setUserId(null);
    } else {
      try {
        const oldCustRaw = await AsyncStorage.getItem('customerUser');
        const oldCustId = oldCustRaw ? String(JSON.parse(oldCustRaw)?._id || JSON.parse(oldCustRaw)?.id || '') : '';
        if (oldCustId && newId && oldCustId !== newId) {
          const { clearCustomerAddressCache } = require('../services/LocationAddressService');
          await clearCustomerAddressCache();
        }
      } catch (_) {}
      await AsyncStorage.setItem('customerToken', token);
      if (refreshToken) await AsyncStorage.setItem('customerRefreshToken', refreshToken);
      await AsyncStorage.setItem('customerUser', JSON.stringify(userData));
      await AsyncStorage.setItem('registeredCustomerId', newId);
      await AsyncStorage.setItem('registeredCustomerName', String((userData as any)?.name || 'Customer'));
      await AsyncStorage.setItem('activeRole', 'CUSTOMER');
      CartService.setUserId(userData._id || (userData as any).id);
    }

    await AsyncStorage.setItem('userToken', token);
    if (refreshToken) {
      await AsyncStorage.setItem('refreshToken', refreshToken);
    }
    clearApiCachedAuth();
    setUser(userData);
    try {
      rideStore.clearRide();
    } catch (e) {}
    if (userData.theme) {
      setTheme(userData.theme);
      await AsyncStorage.setItem('appTheme', userData.theme);
    }
  };

  const logout = async (targetRoleParam?: 'CUSTOMER' | 'SUPPLIER' | 'DELIVERY' | 'ALL') => {
    try {
      // 1. Identify which role is logging out
      const activeRole = await AsyncStorage.getItem('activeRole');
      let targetRole = targetRoleParam;

      if (!targetRole) {
        if (activeRole === 'SUPPLIER' || user?.role === 'supplier' || user?.role === 'seller_partner') {
          targetRole = 'SUPPLIER';
        } else if (activeRole === 'DELIVERY' || user?.role === 'rider' || user?.role === 'delivery_partner' || user?.role === 'provider') {
          targetRole = 'DELIVERY';
        } else {
          targetRole = 'CUSTOMER';
        }
      }

      console.log(`[AuthContext] Logging out targetRole: ${targetRole} (current activeRole: ${activeRole})`);

      // 2. Safely notify backend without invalidating other devices
      try {
        await api.post('/auth/logout');
      } catch (err) {
        console.log('[Logout] Backend notification ignored/offline:', err);
      }

      // 3. Clear in-memory API token cache
      clearApiCachedAuth();

      // 4. Clear role-specific local cache
      if (targetRole === 'ALL') {
        await AsyncStorage.multiRemove([
          'userToken',
          'refreshToken',
          'customerToken',
          'supplierToken',
          'deliveryToken',
          'activeRole',
          'userData',
          'customerUser',
          'supplierUser',
          'deliveryUser',
          'registeredCustomerId',
          'registeredCustomerName',
          'registeredSupplierId',
          'registeredSupplierName',
          'active_food_booking_id',
          '@cached_role_banners_USER',
          '@cached_role_banners_SUPPLIER',
          '@cached_role_banners_RIDER',
          '@prod_cache_restaurants_v4',
          '@prod_cache_dishes_v4',
        ]);
      } else if (targetRole === 'SUPPLIER') {
        await AsyncStorage.multiRemove([
          'supplierToken',
          'supplierUser',
          'registeredSupplierId',
          'registeredSupplierName',
          'registeredSupplierCategory',
          'registeredSupplierPhoto',
          'registeredSupplierUpiId',
          'registeredSupplierBankName',
          'registeredSupplierAccountNumber',
          'registeredSupplierIfsc',
          'registeredSupplierPhone',
          'restaurant_menu',
          'restaurant_categories',
          'partnerType',
          'partnerId',
          'businessType',
          'businessId',
          '@cached_role_banners_SUPPLIER',
          '@prod_cache_restaurants_v4',
          '@prod_cache_dishes_v4',
          'userData',
        ]);
        if (activeRole === 'SUPPLIER') {
          await AsyncStorage.removeItem('activeRole');
          await AsyncStorage.removeItem('userToken');
        }
      } else if (targetRole === 'DELIVERY') {
        try {
          const { clearRiderLocationCache } = require('../services/LocationAddressService');
          await clearRiderLocationCache();
        } catch (_) {}
        await AsyncStorage.multiRemove([
          'deliveryToken',
          'deliveryRefreshToken',
          'deliveryUser',
          'delivery_is_online',
        ]);
        if (activeRole === 'DELIVERY') {
          await AsyncStorage.removeItem('activeRole');
          await AsyncStorage.removeItem('userToken');
        }
      } else {
        // Customer Logout
        try {
          await CartService.clearCart();
        } catch (cErr) {}
        CartService.setUserId('guest');

        await AsyncStorage.multiRemove([
          'customerToken',
          'customerUser',
          'registeredCustomerId',
          'registeredCustomerName',
          'active_food_booking_id',
          'last_known_customer_address',
          'saved_delivery_addresses',
        ]);

        try {
          const allKeys = await AsyncStorage.getAllKeys();
          const cartKeys = allKeys.filter(k => k.startsWith('@customer_cart_'));
          if (cartKeys.length > 0) {
            await AsyncStorage.multiRemove(cartKeys);
          }
        } catch (kErr) {}

        if (activeRole === 'CUSTOMER') {
          await AsyncStorage.removeItem('activeRole');
          await AsyncStorage.removeItem('userToken');
        }
      }
    } catch (e) {
      console.log('[AuthContext] Error during targeted logout:', e);
    }

    setUser(null);
    try {
      rideStore.clear();
    } catch (e) {}

    if (navigationRef.isReady()) {
      navigationRef.reset({
        index: 0,
        routes: [{ name: 'RoleSelection' }],
      });
    }
  };

  const updateUser = (userData: Partial<User>) => {
    setUser(prev => {
      const incomingId = String((userData as any)?._id || (userData as any)?.id || '');
      const prevId = String((prev as any)?._id || (prev as any)?.id || '');
      const incomingRole = String((userData as any)?.role || '').toLowerCase();
      const prevRole = String((prev as any)?.role || '').toLowerCase();
      // NEVER merge fields from a different user ID or a different role!
      const isDifferentUser = Boolean(prev && incomingId && prevId && incomingId !== prevId);
      const isDifferentRole = Boolean(prev && incomingRole && prevRole && incomingRole !== prevRole);
      const updated = (prev && !isDifferentUser && !isDifferentRole)
        ? { ...prev, ...userData }
        : (userData && (userData._id || userData.id) ? (userData as User) : null);
      if (updated) {
        const role = ((updated as any).role || '').toLowerCase();
        if (role === 'supplier' || role === 'seller_partner') {
          AsyncStorage.setItem('supplierUser', JSON.stringify(updated)).catch(() => {});
        } else if (['rider', 'delivery', 'delivery_partner', 'provider'].includes(role)) {
          AsyncStorage.setItem('deliveryUser', JSON.stringify(updated)).catch(() => {});
        } else {
          AsyncStorage.setItem('customerUser', JSON.stringify(updated)).catch(() => {});
        }
      }
      return updated;
    });
  };

  const switchTestRole = async (role: 'CUSTOMER' | 'RESTAURANT' | 'DELIVERY', targetUser: User, token: string) => {
    try {
      clearApiCachedAuth();
      await AsyncStorage.removeItem('userData').catch(() => {});
      await AsyncStorage.setItem('activeRole', role);
      await AsyncStorage.setItem('userToken', token);

      if (role === 'CUSTOMER') {
        await AsyncStorage.setItem('customerToken', token);
        await AsyncStorage.setItem('customerUser', JSON.stringify(targetUser));
        CartService.setUserId(targetUser._id || (targetUser as any).id);
      } else if (role === 'RESTAURANT') {
        await AsyncStorage.setItem('supplierToken', token);
        await AsyncStorage.setItem('supplierUser', JSON.stringify(targetUser));
      } else if (role === 'DELIVERY') {
        await AsyncStorage.setItem('deliveryToken', token);
        await AsyncStorage.setItem('deliveryUser', JSON.stringify(targetUser));
      }

      clearApiCachedAuth();
      setUser(targetUser);
      console.log(`✅ [AuthContext] Switched test role to: ${role} (${targetUser.name || targetUser.phoneNumber})`);
    } catch (e: any) {
      console.error('[AuthContext] switchTestRole error:', e.message);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, updateUser, switchTestRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
