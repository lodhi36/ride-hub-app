import { QueryClient } from '@tanstack/react-query';
import FastStorage from './FastStorage';

/**
 * Production-Optimized TanStack Query Client
 * Implements Stale-While-Revalidate with zero UI flicker.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data remains fresh for 5 minutes (no redundant network calls on rapid navigation)
      staleTime: 5 * 60 * 1000,
      // Retain unused query data in memory for 24 hours
      gcTime: 24 * 60 * 60 * 1000,
      // Prevent disruptive refetches on app focus / background switch
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: false, // Use cached data if not stale
      retry: 1,
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 10000),
    },
  },
});

/**
 * Standardized Query Key Factory
 */
export const queryKeys = {
  categories: ['categories'] as const,
  categoryDetails: (id: string) => ['category', id] as const,
  banners: (target: string) => ['banners', target] as const,
  screenMedia: (key: string) => ['screen-media', key] as const,
  onlineStores: (coords?: { lat?: number; lng?: number }) =>
    ['stores', coords?.lat ?? 'all', coords?.lng ?? 'all'] as const,
  storeMenu: (storeId: string) => ['menu', storeId] as const,
  fashionDemographics: ['fashion-demographics'] as const,
  fashionProducts: ['fashion-products'] as const,
};

/**
 * Invalidate queries on Admin updates via Socket.IO
 */
export const invalidateCategoryQueries = () => {
  FastStorage.invalidatePrefix('category');
  queryClient.invalidateQueries({ queryKey: queryKeys.categories });
};

export const invalidateBannerQueries = (target?: string) => {
  FastStorage.invalidatePrefix('banner');
  if (target) {
    queryClient.invalidateQueries({ queryKey: queryKeys.banners(target) });
  } else {
    queryClient.invalidateQueries({ queryKey: ['banners'] });
  }
};

export const invalidateStoreMenuQueries = (storeId?: string) => {
  FastStorage.invalidatePrefix('menu');
  if (storeId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.storeMenu(storeId) });
  } else {
    queryClient.invalidateQueries({ queryKey: ['menu'] });
  }
};

