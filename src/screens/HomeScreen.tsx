import React, { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import { Dimensions, View, Text, Image, TouchableOpacity, FlatList, StyleSheet, RefreshControl, Modal, TextInput, ScrollView, PermissionsAndroid, Platform, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/PngIcon';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { colors, typography, spacing, shadows, radius } from '../theme/colors';
import api, { UPLOADS_URL } from '../services/api';
import SkeletonLoader from '../components/SkeletonLoader';
import EmptyState from '../components/EmptyState';
import Swiper from 'react-native-swiper';
import { useFocusEffect } from '@react-navigation/native';
import RoleBannerCarousel from '../components/RoleBannerCarousel';

const windowWidth = Dimensions.get('window').width;

const { width } = Dimensions.get('window');

const HomeScreen = ({ navigation }: any) => {
  const { isDark, currentColors } = useTheme();
  const { user } = useAuth();
  const { socket, unreadNotifCount } = useSocket();

  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [banners, setBanners] = useState<any[]>([]);
  const [headerImageError, setHeaderImageError] = useState(false);


  // Filter State
  const [isFilterModalVisible, setFilterModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterGender, setFilterGender] = useState<string | null>(null);
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(['All']));
  
  // Location Filter State
  const [selectedLocationTab, setSelectedLocationTab] = useState('All');
  const locationTabs = ['All', 'Live', 'India', 'Pakistan', 'Bangladesh', 'Nepal', 'Other Countries'];
  const [userLocationStr, setUserLocationStr] = useState((user as any)?.location || 'New York, USA');

  const requestLocationPermission = async () => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "Location Permission",
            message: "DatingApp needs access to your location to find profiles near you.",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK"
          }
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          setUserLocationStr('Current Location');
          setSelectedLocationTab('India');
        }
      } else {
        setUserLocationStr('Current Location');
        setSelectedLocationTab('India');
      }
    } catch (err) {
      console.warn(err);
    }
  };

  useEffect(() => {
    requestLocationPermission();
  }, []);

  // We'll use mock distances for demo purposes
  const getMockDistance = (_id: string) => {
    return null;
  };

  const fetchProfiles = async (isRefresh = false) => {
    try {
      if (isRefresh || profiles.length === 0) {
        setLoading(true);
      }
      if (isRefresh) {
        setSearchQuery('');
        setFilterGender(null);
        setSelectedLocationTab('All');
        setVisitedTabs(new Set(['All']));
      }
      
      console.log('[HomeScreen] Fetching feed profiles and live streams...');
      
      const feedPromise = api.get('/users/feed').catch((err) => ({ data: { success: false, users: [], message: err?.message } }));
      const livePromise = api.get('/live/active').catch(() => ({ data: { success: false, streams: [] } }));
      const bannersPromise = api.get('/banner').catch(() => ({ data: { success: false, data: [] } }));
      
      const [feedRes, liveRes, bannersRes] = await Promise.all([feedPromise, livePromise, bannersPromise]);
      
      let allProfiles = [];
      if (feedRes.data.success) {
        allProfiles = (feedRes.data.profiles || []).filter((p: any) => p && !p.isAdmin && p.role !== 'admin');
      }

      if (bannersRes.data && bannersRes.data.success) {
        const activeBanners = (bannersRes.data.data || []).filter((b: any) => b.status === 'Active');
        setBanners(activeBanners);
      }
      
      if (liveRes.data && liveRes.data.success) {
        const liveProfiles = liveRes.data.streams
          .filter((s: any) => s.hostId && !s.hostId.isAdmin && s.hostId.role !== 'admin')
          .map((s: any) => ({
            ...s.hostId,
            _id: s.hostId._id,
            isLiveStream: true,
            streamTitle: s.title
          }));
        // Remove any duplicates from feed
        allProfiles = allProfiles.filter((p: any) => !liveProfiles.find((lp: any) => lp._id === p._id));
        allProfiles = [...liveProfiles, ...allProfiles];
      }
      
      setProfiles(allProfiles);
    } catch (error: any) {
      console.log('[HomeScreen] fetchProfiles ERROR:', error.message);
      console.log('[HomeScreen] Error details:', error.response?.data || 'No response data');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setIsSearching(false);
    }
  };

  // Refetch profiles EVERY TIME the screen gains focus (tab switch, back navigation)
  useFocusEffect(
    useCallback(() => {
      console.log('[HomeScreen] Screen focused - fetching latest profiles');
      fetchProfiles();
    }, [])
  );

  // Listen for real-time new user profiles
  useEffect(() => {
    if (socket) {
      socket.on('new_profile_active', (newProfile: any) => {
        if (newProfile._id === user?._id) return;
        if (newProfile.isAdmin || newProfile.role === 'admin') return;
        
        setProfiles(prevProfiles => {
          const exists = prevProfiles.find(p => p._id === newProfile._id);
          if (exists) return prevProfiles;
          return [newProfile, ...prevProfiles];
        });
      });

      return () => {
        socket.off('new_profile_active');
      };
    }
  }, [socket, user?._id]);

  // Filter Logic
  const filteredProfiles = useMemo(() => {
    return profiles.filter(profile => {
      if (profile.isAdmin || profile.role === 'admin') {
        return false;
      }
      // Search
      if (searchQuery && !profile.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      // Gender Filter
      if (filterGender && profile.gender?.toLowerCase() !== filterGender.toLowerCase()) {
        return false;
      }
      // Location Tab Filter
      if (selectedLocationTab === 'Live') {
        if (!profile.isLiveStream) return false;
      } else if (selectedLocationTab !== 'All') {
        if (profile.isLiveStream) return false; // Optionally hide live streams from other tabs
        const pCountry = profile.country?.toLowerCase() || '';
        const pLoc = profile.location?.toLowerCase() || '';
        
        if (selectedLocationTab === 'Other Countries') {
          if (pCountry === 'india' || pCountry === 'pakistan' || pCountry === 'bangladesh' || pCountry === 'nepal') {
            return false;
          }
        } else {
          const tabLower = selectedLocationTab.toLowerCase();
          if (pCountry !== tabLower && !pLoc.includes(tabLower)) {
            return false;
          }
        }
      }
      return true;
    });
  }, [profiles, searchQuery, filterGender, selectedLocationTab]);

  const handleLike = async (profileId: string) => {
    try {
      await api.post('/likes', { likeeId: profileId, status: 'like' });
    } catch (error) {
      console.log('Error liking', error);
    }
  };

  const handleSuperLike = async (profileId: string) => {
    try {
      await api.post('/likes', { likeeId: profileId, status: 'superlike' });
    } catch (error) {
      console.log('Error super liking', error);
    }
  };

  const handleSaveProfile = (profileId: string) => {
    // Optimistic UI update or API call for saving
    console.log('Profile saved:', profileId);
  };

  const handleMessage = async (profileId: string) => {
    try {
      console.log('[HomeScreen] handleMessage clicked. receiverId:', profileId);
      const res = await api.post('/chats', { userId: profileId });
      console.log('[HomeScreen] /chats response success:', res.data.success);
      if (res.data.success) {
        console.log('[HomeScreen] Navigating to ChatRoom with chatId:', res.data.chat?._id);
        navigation.navigate('ChatRoom', { 
          chat: res.data.chat,
          chatId: res.data.chat._id,
          receiverId: profileId 
        });
      }
    } catch (error) {
      console.log('Error starting chat', error);
    }
  };

  const renderHeader = () => (
    <View style={[styles.header, { backgroundColor: currentColors.background }]}>
      <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={styles.headerIconCol}>
        {user?.profilePicture && !headerImageError ? (
          <Image 
            source={{ uri: `${UPLOADS_URL}${user.profilePicture.replace('/uploads', '')}` }} 
            style={styles.headerAvatar}
            onError={() => setHeaderImageError(true)}
          />
        ) : (
          <Image 
            source={{ uri: 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png' }} 
            style={styles.headerAvatar} 
          />
        )}
        <Text style={[styles.headerIconLabel, { color: currentColors.textMuted }]}>Profile</Text>
      </TouchableOpacity>
      
      <View style={styles.headerTitleContainer}>
        <Text style={[styles.headerTitle, { color: currentColors.text }]}>Hello, {user?.name || 'User'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
          <Icon name="location" size={16} color={colors.primary} style={{ marginRight: 4 }} />
          <Text style={[styles.headerSubtitle, { color: currentColors.textMuted, marginVertical: 0 }]}>
            {userLocationStr}
          </Text>
        </View>
      </View>
      
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {/* Notifications Icon with Name */}
        <TouchableOpacity style={styles.headerIconCol} onPress={() => navigation.navigate('Notifications')}>
          <View style={{ position: 'relative' }}>
            <Icon name="notifications" size={24} color={currentColors.text} />
            {unreadNotifCount > 0 && (
              <View style={styles.headerBadgeContainer}>
                <Text style={styles.headerBadgeText}>{unreadNotifCount > 99 ? '99+' : unreadNotifCount}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.headerIconLabel, { color: currentColors.textMuted }]}>Alerts</Text>
        </TouchableOpacity>

        {/* Location Icon with Name */}
        <TouchableOpacity style={styles.headerIconCol} onPress={requestLocationPermission}>
          <Icon name="location" size={24} color={currentColors.text} />
          <Text style={[styles.headerIconLabel, { color: currentColors.textMuted }]}>Location</Text>
        </TouchableOpacity>

        {/* Filter Icon with Name */}
        <TouchableOpacity style={styles.headerIconCol} onPress={() => setFilterModalVisible(true)}>
          <Icon name="filter-variant" size={24} color={colors.primary} />
          <Text style={[styles.headerIconLabel, { color: colors.primary, fontWeight: 'bold' }]}>Filter</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const searchTimeoutRef = React.useRef<any>(null);

  const handleLocationTabPress = (tab: string) => {
    if (selectedLocationTab === tab) return;
    setSelectedLocationTab(tab);
    
    if (!visitedTabs.has(tab)) {
      setIsSearching(true);
      setVisitedTabs(prev => new Set(prev).add(tab));
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = setTimeout(() => {
        setIsSearching(false);
      }, 1500);
    } else {
      setIsSearching(false);
    }
  };

  const getTabIcon = (tabName: string) => {
    switch (tabName) {
      case 'All': return '🌐';
      case 'Live': return '🔴';
      case 'India': return '🇮🇳';
      case 'Pakistan': return '🇵🇰';
      case 'Bangladesh': return '🇧🇩';
      case 'Nepal': return '🇳🇵';
      default: return '🌍';
    }
  };

  const renderLocationTabs = () => (
    <View style={[styles.locationTabsContainer, { backgroundColor: currentColors.background }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.locationTabsScroll}>
        {locationTabs.map((tab) => {
          const isActive = selectedLocationTab === tab;
          return (
            <TouchableOpacity 
              key={tab} 
              onPress={() => handleLocationTabPress(tab)}
              style={[
                styles.locationTab, 
                { 
                  backgroundColor: isActive ? colors.primary : currentColors.surface,
                  borderColor: isActive ? colors.primary : currentColors.border
                }
              ]}
            >
              <Text style={[styles.locationTabText, { color: isActive ? '#FFF' : currentColors.text }]}>
                {getTabIcon(tab)} {tab}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );





  const renderFilterModal = () => (
    <Modal
      visible={isFilterModalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setFilterModalVisible(false)}
    >
      <SafeAreaView style={[styles.modalContainer, { backgroundColor: currentColors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: currentColors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Icon name="filter-variant" size={24} color={colors.primary} style={{ marginRight: 8 }} />
            <Text style={[styles.modalTitle, { color: currentColors.text }]}>Filter Preferences</Text>
          </View>
          <TouchableOpacity onPress={() => setFilterModalVisible(false)} style={styles.modalClosePill}>
            <Text style={[styles.modalCloseText, { color: currentColors.text }]}>✕ Close</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          <Text style={[styles.filterLabel, { color: currentColors.text }]}>🔍 Search Profile by Name</Text>
          <View style={[styles.filterInputWrapper, { backgroundColor: currentColors.surface, borderColor: currentColors.border }]}>
            <Icon name="search" size={20} color={currentColors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.filterInputInner, { color: currentColors.text }]}
              placeholder="Type name to search..."
              placeholderTextColor={currentColors.placeholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          <Text style={[styles.filterLabel, { color: currentColors.text, marginTop: 20 }]}>👥 Show Me Gender</Text>
          <View style={styles.genderRow}>
            {[
              { label: 'All', icon: '👥' },
              { label: 'Male', icon: '👨' },
              { label: 'Female', icon: '👩' },
              { label: 'Other', icon: '✨' }
            ].map(g => {
              const isSelected = (g.label === 'All' && !filterGender) || (filterGender?.toLowerCase() === g.label.toLowerCase());
              return (
                <TouchableOpacity 
                  key={g.label} 
                  onPress={() => setFilterGender(g.label === 'All' ? null : g.label)}
                  style={[
                    styles.genderBadge, 
                    { backgroundColor: isSelected ? colors.primary : currentColors.surface, borderColor: isSelected ? colors.primary : currentColors.border }
                  ]}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: isSelected ? '#FFF' : currentColors.text, fontWeight: '700', fontSize: 13 }}>
                    {g.icon} {g.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
          
          <TouchableOpacity 
            style={[styles.applyBtn, { backgroundColor: colors.primary, marginTop: 30 }]}
            onPress={() => setFilterModalVisible(false)}
            activeOpacity={0.85}
          >
            <Text style={styles.applyBtnText}>✨ Apply Filters & Explore</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  const renderSkeletons = () => (
    <View style={styles.feedScroll}>
      {[1, 2].map((key) => (
        <View key={key} style={[styles.profileCard, { backgroundColor: currentColors.surface }]}>
          <SkeletonLoader height={400} borderRadius={radius.lg} />
          <View style={styles.profileInfo}>
            <SkeletonLoader width={150} height={28} style={{ marginBottom: spacing.sm }} />
            <SkeletonLoader width={200} height={16} style={{ marginBottom: spacing.md }} />
            <SkeletonLoader width="100%" height={16} style={{ marginBottom: spacing.xs }} />
            <SkeletonLoader width="80%" height={16} />
          </View>
        </View>
      ))}
    </View>
  );

  const MemoizedProfileCard = memo(({ profile, onLike, onMessage, navigation }: any) => {
    const [isLiked, setIsLiked] = useState(false);
    const [isMessaged, setIsMessaged] = useState(false);
    const [imageError, setImageError] = useState(false);

    const handleLikeClick = () => {
      if (isLiked) return;
      setIsLiked(true);
      onLike(profile._id);
    };

    const handleMessageClick = () => {
      if (isMessaged) return;
      setIsMessaged(true);
      onMessage(profile._id);
    };

    const imageUrl = profile.profilePicture && !imageError
      ? `${UPLOADS_URL}${profile.profilePicture.replace('/uploads', '')}`
      : 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png';
      
    // Handle undefined/null cleanly
    const name = profile.name || 'Unknown';
    const age = profile.age ? `, ${profile.age}` : '';
    const locationStr = profile.city || profile.location || profile.country || '';
    
    return (
      <View style={[styles.profileCard, { backgroundColor: currentColors.surface, ...(isDark ? {} : shadows.md) }]}>
        <TouchableOpacity activeOpacity={0.9} onPress={() => {
          if (profile.isLiveStream) {
            navigation.navigate('LiveViewer', { broadcasterId: profile._id, broadcasterName: name });
          } else {
            navigation.navigate('ProfileDetails', { profileId: profile._id });
          }
        }}>
          <View style={styles.imageContainer}>
            <Image 
              source={{ uri: imageUrl }} 
              style={styles.profileImage} 
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
            
            {/* Distance Badge top-left overlay */}
            <View style={styles.distanceBadge}>
              <Icon name="location" size={10} color="#FFF" />
              <Text style={styles.distanceText}>{getMockDistance(profile._id)}m</Text>
            </View>
            
            {/* Online Badge top-right overlay */}
            {profile.isOnline && !profile.isLiveStream && (
              <View style={styles.onlineDot} />
            )}
            
            {/* Live Badge */}
            {profile.isLiveStream && (
              <View style={[styles.distanceBadge, { top: 8, right: 8, left: undefined, backgroundColor: '#0066FF' }]}>
                <Text style={[styles.distanceText, { fontSize: 11 }]}>ACTIVE</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        
        <View style={styles.profileInfo}>
          {/* Name & Verification */}
          <View style={styles.nameRow}>
            <Text style={[styles.nameText, { color: currentColors.text }]} numberOfLines={1}>
              {name}<Text style={styles.ageText}>{age}</Text>
            </Text>
            {profile.verificationStatus === 'verified' && (
              <Icon name="checkmark-circle" size={16} color={colors.info} style={styles.verifiedIcon} />
            )}
          </View>

          {/* Location & Gender */}
          <View style={styles.metaRow}>
            <Text style={[styles.metaText, { color: currentColors.textMuted }]} numberOfLines={1}>
              {profile.gender ? `${profile.gender} • ` : ''}{locationStr}
            </Text>
          </View>

          {/* Action Buttons with Text Names */}
          <View style={styles.actionButtonsRow}>
            {/* Like Button */}
            <TouchableOpacity 
              onPress={handleLikeClick} 
              style={styles.actionBtnCompact}
              disabled={isLiked}
              activeOpacity={0.7}
            >
              <View style={[
                styles.iconWrapperCompact, 
                { backgroundColor: isLiked ? '#FEE2E2' : (isDark ? '#331B26' : '#FFE4E6') }
              ]}>
                <Image
                  source={require('../assets/icons/heart_filled.png')}
                  style={{ width: windowWidth * 0.05, height: windowWidth * 0.05, tintColor: isLiked ? '#EF4444' : '#0066FF' }}
                  resizeMode="contain"
                />
              </View>
              <Text style={[styles.cardActionLabelText, { color: isLiked ? '#EF4444' : currentColors.textMuted }]}>
                {isLiked ? 'Liked' : 'Like'}
              </Text>
            </TouchableOpacity>

            {/* Chat Button */}
            <TouchableOpacity 
              onPress={handleMessageClick} 
              style={styles.actionBtnCompact}
              disabled={isMessaged}
              activeOpacity={0.7}
            >
              <View style={[
                styles.iconWrapperCompact, 
                { backgroundColor: isMessaged ? (isDark ? '#334155' : '#E2E8F0') : (isDark ? '#331B26' : '#FCE7F3') }
              ]}>
                <Image
                  source={require('../assets/send_17972127.png')}
                  style={{ width: windowWidth * 0.05, height: windowWidth * 0.05, tintColor: isMessaged ? currentColors.textMuted : colors.primary }}
                  resizeMode="contain"
                />
              </View>
              <Text style={[styles.cardActionLabelText, { color: isMessaged ? currentColors.textMuted : colors.primary }]}>
                Chat
              </Text>
            </TouchableOpacity>

            {/* Verify Button */}
            <TouchableOpacity 
              onPress={() => {
                Alert.alert('Profile Verified ✅', `${name}'s identity is 100% verified!`);
              }} 
              style={styles.actionBtnCompact}
              activeOpacity={0.7}
            >
              <View style={[
                styles.iconWrapperCompact, 
                { backgroundColor: isDark ? '#1E293B' : '#E0F2FE' }
              ]}>
                <Image
                  source={require('../assets/icons/privacy_shield.png')}
                  style={{ width: windowWidth * 0.05, height: windowWidth * 0.05, tintColor: '#0EA5E9' }}
                  resizeMode="contain"
                />
              </View>
              <Text style={[styles.cardActionLabelText, { color: '#0EA5E9' }]}>
                Verify
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  });

  const renderProfile = ({ item }: { item: any }) => (
    <MemoizedProfileCard 
      profile={item} 
      onLike={handleLike} 
      onMessage={handleMessage} 
      navigation={navigation}
    />
  );

  const renderBanners = () => {
    return (
      <View style={{ marginBottom: 12 }}>
        <RoleBannerCarousel
          target="SUPPLIER"
          containerMarginHorizontal={14}
          borderRadius={16}
          aspectRatio={2.5}
          autoSlideInterval={6000}
        />
      </View>
    );
  };


  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]} edges={['top']}>
      {renderHeader()}
      {renderLocationTabs()}
      {renderFilterModal()}
      
      {isSearching ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} style={{ transform: [{ scale: 1.5 }] }} />
          <Text style={{ marginTop: 20, color: currentColors.text, fontSize: 16, fontWeight: '600' }}>
            Finding people near you...
          </Text>
        </View>
      ) : loading ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          {renderBanners()}
          {renderSkeletons()}
        </ScrollView>
      ) : filteredProfiles.length === 0 ? (
        <ScrollView 
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchProfiles(true)} tintColor={colors.primary} />}
        >
          {renderBanners()}
          <EmptyState
            lottieSource={require('../assets/b763b20c-116b-11ee-a0e6-e3c84e085833.json')}
            lottieSize={240}
            title="No Profiles Found Nearby"
            description="Try expanding your search radius or adjusting your filters."
          />
        </ScrollView>
      ) : (
        <FlatList
          data={filteredProfiles}
          keyExtractor={(item) => item._id}
          ListHeaderComponent={renderBanners}
          renderItem={renderProfile}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapperStyle}
          contentContainerStyle={styles.feedScroll}
          showsVerticalScrollIndicator={false}
          initialNumToRender={6}
          maxToRenderPerBatch={4}
          windowSize={5}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchProfiles(true)} tintColor={colors.primary} />
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150,150,150,0.2)',
    zIndex: 10,
  },
  headerProfile: {
    width: 40, height: 40,
  },
  headerIconCol: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
    minWidth: 42,
  },
  headerIconLabel: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
  },
  headerAvatar: {
    width: 40, height: 40,
    borderRadius: 20,
  },
  headerAvatarPlaceholder: {
    width: 40, height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: typography.sizes.xs,
    marginTop: 2,
    fontWeight: typography.weights.medium,
  },

  iconButton: {
    width: 40, height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.xs,
    position: 'relative',
  },
  headerBadgeContainer: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#0066FF',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  headerBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '700',
  },
  locationTabsContainer: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150,150,150,0.2)',
    zIndex: 9,
  },
  locationTabsScroll: {
    paddingHorizontal: spacing.md,
  },
  locationTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    marginRight: spacing.sm,
  },
  locationTabText: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
  },
  columnWrapperStyle: {
    justifyContent: 'space-between',
  },
  feedScroll: {
    padding: spacing.md,
    paddingBottom: spacing.xxl * 3,
  },
  profileCard: {
    width: (width - spacing.md * 3) / 2, // 2 columns with spacing
    borderRadius: radius.xl, // More rounded corners
    marginBottom: spacing.lg,
    backgroundColor: '#FFF',
    overflow: 'hidden',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  imageContainer: {
    position: 'relative',
    backgroundColor: '#E5E7EB', // fallback background color
  },
  profileImage: {
    width: '100%',
    aspectRatio: 0.8, // Slightly taller
  },
  distanceBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  distanceText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 2,
  },
  onlineDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 12, height: 12,
    borderRadius: 6,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  profileInfo: {
    padding: spacing.sm,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  nameText: {
    flex: 1,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  ageText: {
    fontWeight: typography.weights.regular,
  },
  verifiedIcon: {
    marginLeft: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  metaText: {
    fontSize: 11,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 2,
    gap: spacing.sm,
  },
  actionBtnCompact: {
    alignItems: 'center',
  },
  iconWrapperCompact: {
    width: windowWidth * 0.08, height: windowWidth * 0.08,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardActionLabelText: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
  },
  
  // Modal Styles
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: 'bold',
  },
  modalClosePill: {
    backgroundColor: 'rgba(150,150,150,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  modalCloseText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalContent: {
    padding: spacing.lg,
  },
  filterLabel: {
    fontSize: typography.sizes.md,
    fontWeight: '600',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  filterInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  filterInputInner: {
    flex: 1,
    fontSize: typography.sizes.md,
    paddingVertical: 8,
  },
  filterInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: typography.sizes.md,
  },
  genderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  genderBadge: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  applyBtn: {
    marginTop: spacing.xxl,
    padding: spacing.lg,
    borderRadius: radius.full,
    alignItems: 'center',
  },
  applyBtnText: {
    color: '#FFF',
    fontSize: typography.sizes.lg,
    fontWeight: 'bold',
  },
  posterContainer: {
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  posterCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: windowWidth * 0.00, height: windowWidth * 0.01 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  posterContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  posterTextContainer: {
    flex: 1,
    paddingRight: spacing.md,
  },
  posterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    marginBottom: 6,
  },
  posterBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  posterTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  posterSubtitle: {
    fontSize: 11,
    lineHeight: 15,
  },
  posterActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    justifyContent: 'center',
    height: 36,
  },
  posterActionText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
    marginRight: 4,
  },
  sliderContainer: {
    height: 155,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
    width: width - spacing.md * 2,
    alignSelf: 'center',
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  paginationDot: {
    height: 6,
    borderRadius: 3,
  },
});

export default HomeScreen;
