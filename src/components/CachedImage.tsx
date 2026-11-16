import React, { useState, useEffect, memo } from 'react';
import {
  Image,
  ImageProps,
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
} from 'react-native';
import { resolveUploadUrl } from '../config/apiConfig';
import { ShimmerBox } from './ShimmerSkeleton';

interface CachedImageProps extends Omit<ImageProps, 'source'> {
  source: { uri?: string } | number;
  fallbackIcon?: string;
  isDark?: boolean;
  priority?: 'low' | 'normal' | 'high';
}

// Global Memory Cache for verified image loads
const loadedImageUrls = new Set<string>();

/**
 * CachedImage: High-Performance Image Component with Shimmer, CDN routing, and error resilience
 */
export const CachedImage: React.FC<CachedImageProps> = memo(({
  source,
  style,
  fallbackIcon = '🖼️',
  isDark = false,
  resizeMode = 'cover',
  ...rest
}) => {
  const rawUri = typeof source === 'object' && source?.uri ? source.uri : '';
  const resolvedUri = rawUri ? resolveUploadUrl(rawUri) : '';
  const isPreloaded = Boolean(resolvedUri && loadedImageUrls.has(resolvedUri));

  const [isLoading, setIsLoading] = useState<boolean>(Boolean(resolvedUri && !isPreloaded));
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    if (resolvedUri) {
      if (loadedImageUrls.has(resolvedUri)) {
        setIsLoading(false);
      } else {
        setIsLoading(true);
        setHasError(false);
      }
    }
  }, [resolvedUri]);

  // If local asset required (e.g., require('./icon.png'))
  if (typeof source === 'number') {
    return <Image source={source} style={style} resizeMode={resizeMode} {...rest} />;
  }

  // Error Fallback Container
  if (!resolvedUri || hasError) {
    const flatStyle = StyleSheet.flatten(style) || {};
    return (
      <View
        style={[
          styles.placeholderContainer,
          flatStyle,
          { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' },
        ]}
      >
        <Text style={{ fontSize: (Number(flatStyle.height) || 40) * 0.35 }}>
          {fallbackIcon}
        </Text>
      </View>
    );
  }

  const flatStyle = StyleSheet.flatten(style) || {};
  const width = flatStyle.width ?? '100%';
  const height = flatStyle.height ?? 100;
  const borderRadius = flatStyle.borderRadius ?? 0;

  return (
    <View style={[{ position: 'relative', overflow: 'hidden' }, flatStyle]}>
      {isLoading && (
        <View style={StyleSheet.absoluteFill}>
          <ShimmerBox
            width={width}
            height={Number(height) || 100}
            borderRadius={Number(borderRadius) || 0}
            isDark={isDark}
          />
        </View>
      )}

      <Image
        {...rest}
        source={{ uri: resolvedUri }}
        style={[style, isLoading && { opacity: 0 }]}
        resizeMode={resizeMode}
        onLoad={() => {
          if (resolvedUri) loadedImageUrls.add(resolvedUri);
          setIsLoading(false);
        }}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
      />
    </View>
  );
});

/**
 * Static Image Prefetcher for Instant 0ms Visual Rendering
 */
export const prefetchImages = (urls: (string | undefined)[]) => {
  urls.forEach(u => {
    if (u && typeof u === 'string') {
      const resolved = resolveUploadUrl(u);
      if (resolved && !loadedImageUrls.has(resolved)) {
        Image.prefetch(resolved)
          .then(() => loadedImageUrls.add(resolved))
          .catch(() => {});
      }
    }
  });
};

const styles = StyleSheet.create({
  placeholderContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default CachedImage;

