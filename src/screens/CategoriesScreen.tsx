import FastStorage from '../services/FastStorage';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  TextInput,
  StatusBar,
  Image,
  Dimensions,
  ActivityIndicator,
  FlatList,
  Platform,
} from 'react-native';
import Icon from '../components/PngIcon';
import { CATEGORIES_API_URL, LOCAL_URL, resolveUploadUrl } from '../config/apiConfig';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';

const { width } = Dimensions.get('window');

export default function CategoriesScreen({ navigation }: any) {
  const { isDark } = useTheme('customer');
  const [categories, setCategories] = useState<any[]>(() => {
    const cached = FastStorage.getItemSync<any[]>('@cached_customer_categories');
    return Array.isArray(cached) && cached.length > 0 ? cached.filter((c: any) => !c.isAll) : [];
  });
  const [loading, setLoading] = useState(() => categories.length === 0);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchCategories = async () => {
    try {
      console.log('[CATEGORIES_FETCH_STARTED]');
      setLoading(true);
      let data: any = null;
      try {
        const res = await api.get('/categories');
        data = res.data;
        console.log('[CATEGORIES_API_STATUS] 200 via axios');
        console.log('[CATEGORIES_API_RESPONSE]', JSON.stringify(data));
      } catch (e) {
        console.log('[CategoriesScreen Axios Failed, trying direct fetch]:', e);
        const res = await fetch(CATEGORIES_API_URL);
        if (res.ok) {
          data = await res.json();
          console.log('[CATEGORIES_API_STATUS] 200 via fetch');
          console.log('[CATEGORIES_API_RESPONSE]', JSON.stringify(data));
        } else {
          console.log('[CATEGORIES_API_STATUS] Error via fetch:', res.status);
        }
      }
      
      let loadedCategories: any[] = [];
      if (Array.isArray(data)) loadedCategories = data;
      else if (data && Array.isArray(data.categories)) loadedCategories = data.categories;
      else if (data && Array.isArray(data.data)) loadedCategories = data.data;

      // Strict: ONLY show categories that have a valid uploaded image (no dummy categories without images)
      const activeList = loadedCategories.filter((c: any) => 
        c.isActive !== false && 
        c.image && 
        typeof c.image === 'string' && 
        c.image.trim() !== ''
      );
      setCategories(activeList);
      FastStorage.setItem('@cached_customer_categories', activeList, 60 * 60 * 1000);
    } catch (e) {
      console.log('[CATEGORIES_ERROR]', e);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleCategoryPress = (cat: any) => {
    const nameLower = (cat.name || cat.title || '').toLowerCase();
    if (
      nameLower.includes('fashion') ||
      nameLower.includes('फैशन') ||
      nameLower.includes('फ़ैशन') ||
      nameLower.includes('cloth') ||
      nameLower.includes('कपड़े') ||
      nameLower.includes('wear')
    ) {
      navigation.navigate('FashionScreen', {
        selectedCategory: cat,
        categoryId: cat._id || cat.id,
        categoryName: cat.name || 'Fashion',
      });
      return;
    }
    navigation.navigate('Subcategories', {
      selectedCategory: cat,
      categoryId: cat._id || cat.id,
      categoryName: cat.name,
    });
  };

  const filteredCategories = categories.filter((cat) =>
    (cat.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (cat.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderSkeleton = () => (
    <View style={styles.grid}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={styles.cardSkel}>
          <View style={styles.imgSkel} />
          <View style={styles.titleSkel} />
          <View style={styles.subSkel} />
        </View>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, isDark && { backgroundColor: '#0B0F19' }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? '#0B0F19' : '#FFFFFF'} />
      <StatusBar hidden={false} barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Header */}
      <View style={[styles.header, isDark && { backgroundColor: '#0B0F19', borderBottomColor: '#334155' }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isDark && { color: '#F8FAFC' }]}>All Categories</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search Section */}
      <View style={styles.searchSection}>
        <View style={[styles.searchContainer, isDark && { backgroundColor: '#0B0F19' }]}>
          <Icon name="search" size={20} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search category, e.g. Cleaning..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Icon name="close" size={18} color="#64748B" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {loading ? (
        renderSkeleton()
      ) : filteredCategories.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Image
            source={{ uri: 'https://img.icons8.com/fluency/96/search.png' }}
            style={{ width: 85, height: 85, marginBottom: 16 }}
          />
          <Text style={styles.emptyTitle}>No Categories Found</Text>
          <Text style={styles.emptyText}>We couldn't find any category matching your search query. Try another keyword!</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.grid}>
            {(() => {
              console.log('[CATEGORIES_RENDER]', JSON.stringify(filteredCategories));
              return null;
            })()}
            {filteredCategories.map((cat, idx) => {
              const imagePath = cat.image ? resolveUploadUrl(cat.image) : '';
              const imageUrl = imagePath || 'https://img.icons8.com/fluency/96/tools.png';
              
              return (
                <TouchableOpacity
                  key={cat._id || idx}
                  style={[styles.card, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}
                  onPress={() => handleCategoryPress(cat)}
                  activeOpacity={0.9}
                >
                  <View style={styles.imageContainer}>
                    <Image source={{ uri: imageUrl }} style={styles.cardImage} />
                    <View style={styles.priceBadge}>
                      <Text style={styles.priceText}>₹{cat.startingPrice || 199} up</Text>
                    </View>
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={[styles.cardTitle, isDark && { color: '#F8FAFC' }]} numberOfLines={1}>{cat.name}</Text>
                    <Text style={styles.cardDesc} numberOfLines={2}>
                      {cat.description || 'Professional home service delivered by verified experts.'}
                    </Text>
                    <View style={styles.metaRow}>
                      <Icon name="scan-outline" size={12} color="#64748B" />
                      <Text style={styles.metaText}>{cat.estimatedTime || '30-45m'}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#F8FAFC',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    borderRadius: 12,
    height: 48,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
    padding: 0,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  card: {
    width: (width - 44) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  imageContainer: {
    height: 110,
    width: '100%',
    position: 'relative',
    backgroundColor: '#F8FAFC',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  priceBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priceText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  cardInfo: {
    padding: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
    marginBottom: 8,
    height: 30,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    marginLeft: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  cardSkel: {
    width: (width - 44) / 2,
    height: 200,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    marginBottom: 16,
    padding: 8,
    gap: 8,
  },
  imgSkel: {
    height: 100,
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
  },
  titleSkel: {
    width: '60%',
    height: 12,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
  },
  subSkel: {
    width: '90%',
    height: 10,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
  },
});
