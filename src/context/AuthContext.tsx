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
        const token = (await AsyncStorage.getItem('userToken')) || (await AsyncStorage.getItem('customerToken')) || (await AsyncStorage.getItem('supplierToken')) || (await AsyncStorage.getItem('deliveryToken'));
        if (token) {
          // Instantly restore cached session so user is never logged out on restart/reload
          const activeRole = await AsyncStorage.getItem('activeRole');
          const cachedDeliv = await AsyncStorage.getItem('deliveryUser');
          const cachedCust = await AsyncStorage.getItem('customerUser');
          const cachedSupp = await AsyncStorage.getItem('supplierUser');

          if (activeRole === 'DELIVERY' && cachedDeliv) {
            try { setUser(JSON.parse(cachedDeliv)); } catch (e) {}
          } else if (activeRole === 'SUPPLIER' && cachedSupp) {
            try { setUser(JSON.parse(cachedSupp)); } catch (e) {}
          } else if (activeRole === 'CUSTOMER' && cachedCust) {
            try {
              const u = JSON.parse(cachedCust);
              setUser(u);
              CartService.setUserId(u._id || u.id);
            } catch (e) {}
          }

          // Background revalidation with /auth/me
          try {
            const res = await api.get('/auth/me');
            if (res.data.success && res.data.user) {
              const uRole = (res.data.user.role || '').toLowerCase();
              const currentActive = await AsyncStorage.getItem('activeRole');
              const roleMatches = (currentActive === 'SUPPLIER' && ['supplier', 'seller_partner'].includes(uRole)) ||
                                  (currentActive === 'DELIVERY' && ['rider', 'delivery_partner', 'provider'].includes(uRole)) ||
                                  (currentActive === 'CUSTOMER' && uRole === 'customer');
              if (roleMatches) {
                setUser(res.data.user);
              }
              if (uRole === 'supplier' || uRole === 'seller_partner') {
                await AsyncStorage.setItem('supplierUser', JSON.stringify(res.data.user));
              } else if (uRole === 'rider' || uRole === 'delivery_partner') {
                await AsyncStorage.setItem('deliveryUser', JSON.stringify(res.data.user));
              } else {
                await AsyncStorage.setItem('customerUser', JSON.stringify(res.data.user));
                CartService.setUserId(res.data.user._id || res.data.user.id);
              }
              if (res.data.user.theme) {
                setTheme(res.data.user.theme);
                await AsyncStorage.setItem('appTheme', res.data.user.theme);
              }
            }
          } catch (apiErr: any) {
            // NEVER logout on network errors, timeouts, or temporary offline state!
            console.log('[AuthContext] Background token revalidation note:', apiErr.message || 'Offline/Cached');
          }
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
    const role = (userData.role || '').toLowerCase();
    if (role === 'supplier' || role === 'seller_partner') {
      await AsyncStorage.setItem('supplierToken', token);
      await AsyncStorage.setItem('supplierUser', JSON.stringify(userData));
      await AsyncStorage.setItem('activeRole', 'SUPPLIER');
    } else if (role === 'rider' || role === 'delivery_partner' || role === 'provider') {
      await AsyncStorage.setItem('deliveryToken', token);
      await AsyncStorage.setItem('deliveryUser', JSON.stringify(userData));
      await AsyncStorage.setItem('activeRole', 'DELIVERY');
    } else {
      await AsyncStorage.setItem('customerToken', token);
      await AsyncStorage.setItem('customerUser', JSON.stringify(userData));
      await AsyncStorage.setItem('activeRole', 'CUSTOMER');
      CartService.setUserId(userData._id || (userData as any).id);
    }

    await AsyncStorage.setItem('userToken', token);
    await AsyncStorage.setItem('refreshToken', refreshToken);
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
        await AsyncStorage.multiRemove([
          'deliveryToken',
          'deliveryUser',
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
      const updated = prev ? { ...prev, ...userData } : null;
      if (updated) {
        AsyncStorage.setItem('userData', JSON.stringify(updated)).catch(() => {});
        const role = ((updated as any).role || '').toLowerCase();
        if (role === 'supplier' || role === 'seller_partner') {
          AsyncStorage.setItem('supplierUser', JSON.stringify(updated)).catch(() => {});
        } else if (role === 'rider' || role === 'delivery_partner' || role === 'provider') {
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
      await AsyncStorage.setItem('activeRole', role);
      await AsyncStorage.setItem('userToken', token);
      await AsyncStorage.setItem('userData', JSON.stringify(targetUser));

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
