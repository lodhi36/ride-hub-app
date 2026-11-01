import React, { useState, useEffect } from 'react';
import { Dimensions, View, Text, Image, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { colors, typography, spacing, radius, shadows } from '../theme/colors';
import api, { UPLOADS_URL } from '../services/api';
import SkeletonLoader from '../components/SkeletonLoader';

const windowWidth = Dimensions.get('window').width;

const { width } = Dimensions.get('window');

const ProfileDetailsScreen = ({ route, navigation }: any) => {
  const { profileId } = route.params;
  const { isDark, currentColors } = useTheme();

  const [profile, setProfile] = useState<any>(null);
  const [likesCount, setLikesCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfileData();
  }, []);

  const fetchProfileData = async () => {
    try {
      setLoading(true);
      const [profileRes, likesRes] = await Promise.all([
        api.get(`/profile/${profileId}`),
        api.get(`/likes/${profileId}`)
      ]);
      if (profileRes.data.success) setProfile(profileRes.data.profile);
      if (likesRes.data.success) setLikesCount(likesRes.data.count);
    } catch (error) {
      console.log('Error fetching profile details', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMessage = async () => {
    try {
      console.log('[ProfileDetailsScreen] handleMessage clicked. receiverId:', profileId);
      const res = await api.post('/chats', { userId: profileId });
      console.log('[ProfileDetailsScreen] /chats response success:', res.data.success);
      if (res.data.success) {
        console.log('[ProfileDetailsScreen] Navigating to ChatRoom with chatId:', res.data.chat?._id);
        navigation.navigate('ChatRoom', { 
          chat: res.data.chat,
          chatId: res.data.chat._id,
          receiverId: profileId 
        });
      }
    } catch (error) {
      console.log('Error accessing chat', error);
    }
  };

  const handleLike = async () => {
    try {
      await api.post('/likes', { likeeId: profileId, status: 'like' });
      setLikesCount(prev => prev + 1);
    } catch (error) {
      console.log('Error liking profile', error);
    }
  };

  const renderSkeletons = () => (
    <View style={styles.container}>
      <SkeletonLoader width={width} height={width * 1.2} borderRadius={0} />
      <View style={[styles.detailsCard, { backgroundColor: currentColors.surface }]}>
        <SkeletonLoader width={200} height={32} style={{ marginBottom: spacing.md }} />
        <SkeletonLoader width={150} height={20} style={{ marginBottom: spacing.xl }} />
        <SkeletonLoader width={100} height={24} style={{ marginBottom: spacing.sm }} />
        <SkeletonLoader width="100%" height={16} style={{ marginBottom: spacing.xs }} />
        <SkeletonLoader width="80%" height={16} style={{ marginBottom: spacing.xl }} />
      </View>
    </View>
  );

  if (loading || !profile) {
    return <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]} edges={['top']}>{renderSkeletons()}</SafeAreaView>;
  }

  const profileImageUrl = (profile.profilePicture && typeof profile.profilePicture === 'string' && profile.profilePicture.trim() && !profile.profilePicture.startsWith('data:image'))
    ? (profile.profilePicture.startsWith('http')
        ? profile.profilePicture
        : `${UPLOADS_URL}${profile.profilePicture.replace('/uploads', '')}`)
    : (profile.photos && Array.isArray(profile.photos) && profile.photos.length > 0 && typeof profile.photos[0] === 'string' && !profile.photos[0].startsWith('data:image')
        ? (profile.photos[0].startsWith('http') ? profile.photos[0] : `${UPLOADS_URL}${profile.photos[0].replace('/uploads', '')}`)
        : null);

  return (
    <View style={[styles.container, { backgroundColor: currentColors.background }]}>
      <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
        
        {/* Profile Hero Image View */}
        <View style={styles.carouselContainer}>
          <View style={styles.carouselImageWrapper}>
            {profileImageUrl ? (
              <Image 
                source={{ uri: profileImageUrl }} 
                style={styles.carouselImage}
                resizeMode="cover" 
              />
            ) : (
              <View style={[styles.carouselImage, { backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ fontSize: 50 }}>👤</Text>
              </View>
            )}
          </View>
          
          {/* Back Pill Button */}
          <TouchableOpacity 
            style={styles.backButtonPill}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
        </View>

        {/* Details Card */}
        <View style={[styles.detailsCard, { backgroundColor: currentColors.surface }]}>
          
          <View style={styles.headerRow}>
            <View style={styles.nameContainer}>
              <Text style={[styles.title, { color: currentColors.text }]}>
                {profile.name}{profile.age ? `, ${profile.age}` : ''}
              </Text>
              {profile.verificationStatus === 'verified' && (
                <Text style={{ marginLeft: 4, fontSize: 16 }}>☑️</Text>
              )}
            </View>
            <View style={styles.likesBadge}>
              <Text style={{ marginRight: 4, fontSize: 14 }}>❤️</Text>
              <Text style={styles.likesText}>{likesCount} Likes</Text>
            </View>
          </View>

          {/* Online Status Pill */}
          {profile.isOnline && (
            <View style={styles.onlineStatusRow}>
              <View style={styles.onlineDotIndicator} />
              <Text style={styles.onlineStatusText}>Online Now</Text>
            </View>
          )}

          {/* Quick Info Chips */}
          <View style={styles.metaChipsRow}>
            <View style={[styles.metaChipPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}>
              <Text style={[styles.metaChipText, { color: currentColors.text }]}>📍 {profile.location || 'Location Not Specified'}</Text>
            </View>
            <View style={[styles.metaChipPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}>
              <Text style={[styles.metaChipText, { color: currentColors.text }]}>👤 {profile.gender || 'Not Specified'}</Text>
            </View>
            {profile.profession && (
              <View style={[styles.metaChipPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}>
                <Text style={[styles.metaChipText, { color: currentColors.text }]}>💼 {profile.profession}</Text>
              </View>
            )}
          </View>

          <View style={styles.divider} />

          {/* About Me Section */}
          <Text style={[styles.sectionTitle, { color: currentColors.text }]}>✨ About Me</Text>
          <View style={[styles.bioCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC', borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0' }]}>
            <Text style={[styles.bodyText, { color: currentColors.text }]}>
              {profile.bio || "This user hasn't written a bio yet."}
            </Text>
          </View>

          {/* Interests & Hobbies Section */}
          {profile.hobbies && profile.hobbies.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: currentColors.text, marginTop: spacing.md }]}>🎯 Interests & Hobbies</Text>
              <View style={styles.hobbiesContainer}>
                {profile.hobbies.map((hobby: string, index: number) => (
                  <View key={index} style={[styles.hobbyBadgePill, { backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF', borderColor: colors.primary }]}>
                    <Text style={[styles.hobbyText, { color: colors.primary }]}>✨ {hobby}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <View style={{ height: 120 }} />
        </View>
      </ScrollView>

      {/* Floating Action Bar */}
      <View style={[styles.floatingActionContainer, { backgroundColor: currentColors.background }]}>
        <TouchableOpacity 
          onPress={handleLike}
          style={[styles.actionButtonOutline, { borderColor: colors.primary, backgroundColor: isDark ? currentColors.surface : '#FFF0F2' }]}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonTextOutline}>💖 Like Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={handleMessage}
          style={[styles.actionButton, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>💬 Send Message</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  carouselContainer: {
    position: 'relative',
    height: width * 1.25,
  },
  carouselImageWrapper: {
    width,
    height: width * 1.25,
  },
  carouselImage: {
    width: '100%',
    height: '100%',
  },
  imageIndicator: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  imageIndicatorText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  backButtonPill: {
    position: 'absolute',
    top: 50,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  backButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  detailsCard: {
    padding: spacing.xl,
    marginTop: -30,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    minHeight: 500,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
    paddingRight: spacing.sm,
  },
  title: {
    fontSize: typography.sizes.xxxl,
    fontWeight: typography.weights.bold,
  },
  ageText: {
    fontWeight: typography.weights.regular,
  },
  onlineStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    backgroundColor: 'rgba(34,197,94,0.1)',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
  },
  onlineDotIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginRight: 6,
  },
  onlineStatusText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: 'bold',
  },
  likesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF0F2',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: '#FCE7F3',
  },
  likesText: {
    color: colors.primary,
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.sm,
  },
  metaChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.lg,
  },
  metaChipPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(150,150,150,0.15)',
  },
  metaChipText: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(150,150,150,0.2)',
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.sm,
  },
  bioCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  bodyText: {
    fontSize: typography.sizes.md,
    lineHeight: 24,
  },
  hobbiesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.xl,
    gap: 8,
  },
  hobbyBadgePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  hobbyText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
  },
  floatingActionContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: 34, // Safe area bottom
    borderTopWidth: 1,
    borderTopColor: 'rgba(150,150,150,0.1)',
    ...shadows.lg,
  },
  actionButtonOutline: {
    flex: 1,
    flexDirection: 'row',
    marginRight: spacing.sm,
    paddingVertical: 16,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    marginLeft: spacing.sm,
    paddingVertical: 16,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnIcon: {
    marginRight: 8,
  },
  buttonTextOutline: {
    color: colors.primary,
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.md,
  },
  buttonText: {
    color: '#FFF',
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.md,
  },
});

export default ProfileDetailsScreen;
