import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import FastStorage from '../services/FastStorage';
import { queryKeys } from '../services/queryClient';
import { UPLOADS_URL } from '../config/apiConfig';

const resolveFullUrl = (u?: string) => {
  if (!u || !u.trim()) return '';
  if (u.startsWith('http') || u.startsWith('data:')) return u;
  const clean = u.replace(/^\/?(api\/)?(uploads\/)?/, '');
  return `${UPLOADS_URL}/${clean}`;
};

/**
 * Hook for Instant Categories Loading with Stale-While-Revalidate
 */
export function useCategoriesData() {
  const cacheKey = '@cached_customer_categories';
  const initial = FastStorage.getItemSync<any[]>(cacheKey) || [];

  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: async () => {
      return FastStorage.deduplicate('fetch_categories', async () => {
        const res = await api.get('/categories');
        if (res?.data?.success && Array.isArray(res.data.categories)) {
          const active = res.data.categories.filter((c: any) => c.isActive !== false);
          const list = [
            { id: 'all', _id: 'all', name: 'All Services', icon: '⚡', isAll: true, isActive: true },
            ...active.map((c: any) => ({
              id: c._id || c.id,
              _id: c._id || c.id,
              name: c.name,
              icon: c.icon || 'store',
              image: c.image || '',
              description: c.description || '',
              isActive: c.isActive !== false,
              subcategories: c.subcategories || [],
            })),
          ];
          FastStorage.setItemSync(cacheKey, list, 24 * 60 * 60 * 1000);
          return list;
        }
        return [];
      });
    },
    initialData: initial.length > 0 ? initial : undefined,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook for Category Subcategories with Instant 0ms Cache
 */
export function useCategoryDetailsData(categoryIdentifier: string, fallbackSubs: any[] = []) {
  const cacheKey = `@cached_subcats_${categoryIdentifier}`;
  const initial = FastStorage.getItemSync<any[]>(cacheKey) || (fallbackSubs.length > 0 ? fallbackSubs : null);

  return useQuery({
    queryKey: queryKeys.categoryDetails(categoryIdentifier),
    queryFn: async () => {
      return FastStorage.deduplicate(`fetch_subcats_${categoryIdentifier}`, async () => {
        const res = await api.get(`/categories/${categoryIdentifier}`).catch(() => null);
        let subs: any[] = [];
        if (res?.data?.success && res.data.category) {
          subs = (res.data.subcategories || res.data.category?.subcategories || []).filter(
            (s: any) => s.isActive !== false
          );
        } else if (fallbackSubs && fallbackSubs.length > 0) {
          subs = fallbackSubs.filter((s: any) => s.isActive !== false);
        }
        if (subs.length > 0) {
          FastStorage.setItemSync(cacheKey, subs, 12 * 60 * 60 * 1000);
        }
        return subs;
      });
    },
    initialData: initial && initial.length > 0 ? initial : undefined,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook for Category Banners with 0ms Cache
 */
export function useCategoryBannersData(categoryTitle: string, cleanCategoryKey: string) {
  const bannerTarget = categoryTitle.toUpperCase().replace(/\s+/g, '_');
  const cacheKey = `@cached_banners_${cleanCategoryKey}`;
  const initial = FastStorage.getItemSync<any>(cacheKey);

  return useQuery({
    queryKey: queryKeys.banners(bannerTarget),
    queryFn: async () => {
      return FastStorage.deduplicate(`fetch_banners_${cleanCategoryKey}`, async () => {
        const allBanners: any[] = [];
        let lottieCfg: any = null;
        let dMode: 'IMAGE' | 'LOTTIE' | 'BOTH' = 'IMAGE';

        // 1. Fetch /banner
        const res = await api.get(`/banner?target=${bannerTarget}&status=Active`).catch(() => null);
        if (res?.data?.success && Array.isArray(res.data.data) && res.data.data.length > 0) {
          const activeBanners = res.data.data.filter((b: any) => b.status === 'Active');
          activeBanners.forEach((b: any) => {
            const cleanUrl = resolveFullUrl(b.imageUrl);
            if (cleanUrl) {
              const rawBase = cleanUrl.split('?')[0].trim().toLowerCase();
              if (!allBanners.some(existing => existing.rawBase === rawBase)) {
                const versioned = cleanUrl.includes('?')
                  ? cleanUrl
                  : `${cleanUrl}?v=${b.updatedAt ? new Date(b.updatedAt).getTime() : 1}`;
                allBanners.push({ id: b._id, rawBase, imageUrl: versioned, title: b.title });
              }
            }
          });
        }

        // 2. Fetch ScreenMedia
        const screenRes = await api.get(`/screen-media/target/${cleanCategoryKey}`).catch(() => null);
        if (screenRes?.data?.success && screenRes.data.screen) {
          const sc = screenRes.data.screen;
          if (sc.isActive !== false) {
            const rawImg = sc.imageUrl || (sc.currentMediaType === 'IMAGE' || sc.currentMediaType === 'BOTH' ? sc.mediaUrl : '');
            const rawLottie = sc.lottieUrl || (sc.currentMediaType === 'LOTTIE' ? sc.mediaUrl : '');
            const img = resolveFullUrl(rawImg);
            const lottie = resolveFullUrl(rawLottie);

            if (img && allBanners.length === 0) {
              const rawBase = img.split('?')[0].trim().toLowerCase();
              allBanners.push({ id: sc._id || 'screen_media', rawBase, imageUrl: img, title: sc.title });
            }

            if (lottie || sc.lottieConfig?.rawJson) {
              let directJson = sc.lottieConfig?.rawJson || null;
              if (!directJson && lottie) {
                try {
                  const lRes = await fetch(lottie);
                  if (lRes.ok) {
                    const parsed = await lRes.json();
                    if (parsed && (parsed.v || parsed.layers)) {
                      directJson = parsed;
                    }
                  }
                } catch (_) {}
              }

              lottieCfg = {
                source: directJson || (lottie ? { uri: lottie } : null),
                speed: sc.lottieConfig?.speed || 1.0,
                loop: sc.lottieConfig?.loop !== false,
                autoplay: sc.lottieConfig?.autoplay !== false,
              };
            }

            if (sc.displayMode) {
              dMode = sc.displayMode;
            } else if (allBanners.length > 0 && lottie) {
              dMode = 'BOTH';
            } else if (lottie) {
              dMode = 'LOTTIE';
            } else {
              dMode = 'IMAGE';
            }
          }
        }

        const primaryUrl = allBanners.length > 0 ? allBanners[0].imageUrl : null;
        const result = {
          banners: allBanners,
          primaryUrl,
          adminLottieConfig: lottieCfg,
          displayMode: dMode,
        };

        FastStorage.setItemSync(cacheKey, result, 6 * 60 * 60 * 1000);
        return result;
      });
    },
    initialData: initial || undefined,
    staleTime: 5 * 60 * 1000,
  });
}

