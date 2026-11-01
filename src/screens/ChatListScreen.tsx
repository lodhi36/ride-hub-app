import React, { useState, useEffect, useCallback } from 'react';
import { Dimensions, View, Text, FlatList, TouchableOpacity, Image, TextInput, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/PngIcon';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { colors, typography, spacing, radius } from '../theme/colors';
import api, { UPLOADS_URL } from '../services/api';
import SkeletonLoader from '../components/SkeletonLoader';
import EmptyState from '../components/EmptyState';

const windowWidth = Dimensions.get('window').width;

const ChatListScreen = ({ navigation }: any) => {
  const { currentColors } = useTheme();
  const { user } = useAuth();
  const { socket, clearMsgCount } = useSocket();

  const [chats, setChats] = useState<any[]>([]);
  const [filteredChats, setFilteredChats] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchChats = useCallback(async () => {
    try {
      if (chats.length === 0) {
        setLoading(true);
      }
      const res = await api.get('/chats');
      if (res.data.success) {
        // Defensively exclude chats that have admin participants
        const filtered = res.data.chats.filter((c: any) => {
          return !c.participants.some((p: any) => p && (p.isAdmin || p.role === 'admin'));
        });
        setChats(filtered);
        setFilteredChats(filtered);
      }
    } catch (error) {
      console.log('Error fetching chats', error);
    } finally {
      setLoading(false);
    }
  }, [chats.length]);

  // Refresh on screen focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchChats();
      clearMsgCount(); // clear badge when user opens chat list
    });
    return unsubscribe;
  }, [navigation, fetchChats]);

  // Real-time: refresh chat list when a new message arrives via socket
  useEffect(() => {
    if (!socket) return;
    const handleChatListUpdate = () => {
      fetchChats();
    };
    socket.on('chat_list_update', handleChatListUpdate);
    return () => {
      socket.off('chat_list_update', handleChatListUpdate);
    };
  }, [socket, fetchChats]);



  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (!text.trim()) {
      setFilteredChats(chats);
      return;
    }
    const lower = text.toLowerCase();
    setFilteredChats(
      chats.filter(chat => {
        const otherUser = chat.participants.find((p: any) => {
          if (!p) return false;
          const pId = typeof p === 'object' ? p._id : p;
          return pId?.toString() !== user?._id?.toString();
        });
        const name = otherUser?.name || otherUser?.username || '';
        return name.toLowerCase().includes(lower);
      })
    );
  };

  const handleDeleteChat = (chatId: string, otherUserName: string) => {
    Alert.alert(
      "Delete Chat",
      `Are you sure you want to delete your chat with ${otherUserName}?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: async () => {
            try {
              const res = await api.delete(`/chats/${chatId}`);
              if (res.data.success) {
                setChats(prev => prev.filter(c => c._id !== chatId));
                setFilteredChats(prev => prev.filter(c => c._id !== chatId));
              }
            } catch (error: any) {
              console.log('Error deleting chat:', error.response?.data || error.message);
              Alert.alert("Error", `Could not delete the chat: ${error.response?.data?.message || error.message}`);
            }
        }}
      ]
    );
  };

  const formatTime = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const renderSkeletons = () => (
    <View style={styles.listContainer}>
      {[1, 2, 3, 4, 5].map((key) => (
        <View key={key} style={[styles.chatRow, { borderBottomColor: currentColors.border }]}>
          <SkeletonLoader width={60} height={60} borderRadius={30} style={{ marginRight: spacing.md }} />
          <View style={styles.chatInfo}>
            <SkeletonLoader width={120} height={20} style={{ marginBottom: spacing.sm }} />
            <SkeletonLoader width={200} height={16} />
          </View>
        </View>
      ))}
    </View>
  );

  const renderItem = ({ item }: { item: any }) => {
    const otherUser = item.participants.find((p: any) => {
      if (!p) return false;
      const pId = typeof p === 'object' ? p._id : p;
      return pId?.toString() !== user?._id?.toString();
    });
    if (!otherUser) return null;

    const imageUrl = otherUser.profilePicture
      ? `${UPLOADS_URL}${otherUser.profilePicture.replace('/uploads', '')}`
      : 'https://via.placeholder.com/100';
    const unreadCount = item.unreadCounts?.[user?._id || ''] || 0;
    const isUnread = unreadCount > 0;

    return (
      <View style={[styles.chatRow, { borderBottomColor: currentColors.border }]}>
        <TouchableOpacity 
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
          onPress={() => {
            console.log('[ChatListScreen] Chat item clicked. Navigating to ChatRoom. chatId:', item._id);
            navigation.navigate('ChatRoom', { 
              chat: item, 
              chatId: item._id, 
              receiverId: otherUser?._id, 
              otherUser 
            });
          }}
        >
          <View style={styles.avatarWrapper}>
            <Image source={{ uri: imageUrl }} style={styles.avatar} />
            {otherUser.isOnline && <View style={styles.onlineDot} />}
          </View>
          
          <View style={styles.chatInfo}>
            <View style={styles.chatHeader}>
              <Text style={[styles.nameText, { color: currentColors.text }]} numberOfLines={1}>
                {otherUser.name || otherUser.username}
              </Text>
              {item.lastMessage && (
                <Text style={[styles.timeText, { color: isUnread ? colors.primary : currentColors.placeholder }]}>
                  {formatTime(item.lastMessage.createdAt)}
                </Text>
              )}
            </View>
            
            <View style={styles.messageRow}>
              <Text 
                style={[
                  styles.lastMessageText, 
                  { color: isUnread ? currentColors.text : currentColors.textMuted },
                  isUnread && styles.unreadTextBold
                ]} 
                numberOfLines={1}
              >
                {item.lastMessage ? item.lastMessage.text : 'Say hi!'}
              </Text>
              
              {isUnread && (
                <View style={[styles.unreadBadge, { backgroundColor: colors.primary, marginRight: spacing.sm }]}>
                  <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={{ padding: spacing.sm, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,0,0,0.1)', borderRadius: 8 }} 
          onPress={() => handleDeleteChat(item._id, otherUser.name || otherUser.username)}
        >
          <Icon name="close" size={20} color={colors.error} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: currentColors.text }]}>Messages</Text>
        
        <View style={[styles.searchContainer, { backgroundColor: currentColors.grayBg }]}>
          <Icon name="search" size={20} color={currentColors.textMuted} style={{ marginRight: 6 }} />
          <TextInput
            style={[styles.searchInput, { color: currentColors.text }]}
            placeholder="Search Chat"
            placeholderTextColor={currentColors.placeholder}
            value={searchQuery}
            onChangeText={handleSearch}
          />
        </View>
      </View>
      
      {loading ? (
        renderSkeletons()
      ) : chats.length === 0 ? (
        <EmptyState
          lottieSource={require('../assets/234f4236-3bb0-11f0-bf32-9fe81713b4d7.json')}
          lottieSize={220}
          title="No Messages Yet"
          description="Like someone to start a match and get the conversation going!"
        />
      ) : filteredChats.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: currentColors.textMuted }]}>No matches found for "{searchQuery}"</Text>
        </View>
      ) : (
        <FlatList
          data={filteredChats}
          keyExtractor={item => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: typography.sizes.xxxl,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.md,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.sizes.md,
    height: '100%',
  },
  listContainer: {
    paddingBottom: spacing.xl,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: spacing.md,
  },
  avatar: {
    width: windowWidth * 0.16, height: windowWidth * 0.16,
    borderRadius: 30,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: windowWidth * 0.04, height: windowWidth * 0.04,
    borderRadius: 7,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  chatInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  nameText: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    flex: 1,
    marginRight: spacing.sm,
  },
  timeText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
  },
  messageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessageText: {
    fontSize: typography.sizes.md,
    flex: 1,
    marginRight: spacing.sm,
  },
  unreadTextBold: {
    fontWeight: typography.weights.bold,
  },
  unreadBadge: {
    width: windowWidth * 0.05, height: windowWidth * 0.05,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: typography.weights.bold,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    fontSize: typography.sizes.md,
    textAlign: 'center',
  },
});

export default ChatListScreen;
