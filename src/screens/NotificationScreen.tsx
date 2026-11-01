import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  RefreshControl,
  Alert,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useSocket } from '../context/SocketContext';
import { typography, spacing } from '../theme/colors';
import api, { UPLOADS_URL } from '../services/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface AdminNotification {
  _id: string;
  title?: string;
  text: string;
  image?: string | null;
  isRead: boolean;
  createdAt: string;
  isAdminNotification: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const formatTime = (dateStr: string): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton Loader Row
// ─────────────────────────────────────────────────────────────────────────────
const SkeletonRow = ({ isDark }: { isDark: boolean }) => {
  const bg = isDark ? '#261C14' : '#DBEAFE';
  return (
    <View style={[skeletonStyles.row, { borderBottomColor: isDark ? '#3D2A1C' : '#BFDBFE' }]}>
      <View style={[skeletonStyles.icon, { backgroundColor: bg }]} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={[skeletonStyles.line, { width: '50%', backgroundColor: bg }]} />
        <View style={[skeletonStyles.line, { width: '85%', backgroundColor: bg }]} />
        <View style={[skeletonStyles.line, { width: '30%', backgroundColor: bg }]} />
      </View>
    </View>
  );
};

const skeletonStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  icon: { width: 48, height: 48, borderRadius: 14 },
  line: { height: 12, borderRadius: 6 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Notification Card
// ─────────────────────────────────────────────────────────────────────────────
interface CardProps {
  item: AdminNotification;
  isDark: boolean;
  onRead: (item: any) => void;
  onDelete: (id: string) => void;
}

const NotificationCard = ({ item: rawItem, isDark, onRead, onDelete }: CardProps) => {
  const item = rawItem as any;
  const senderPicUri = item.sender?.profilePicture
    ? `${UPLOADS_URL}${item.sender.profilePicture.replace('/uploads', '')}`
    : null;

  const imageUri = item.image
    ? `${UPLOADS_URL}${item.image.replace('/uploads', '')}`
    : null;

  const bg = item.isRead
    ? (isDark ? '#140E0A' : '#FFFFFF')
    : (isDark ? '#26160B' : '#EFF6FF');

  const borderColor = isDark ? '#3A2010' : '#BFDBFE';

  const getBadgeText = () => {
    switch (item.type) {
      case 'order':
      case 'ORDER':
      case 'FOOD_ORDER':
      case 'food_order': return '🍔 Food Order';
      case 'delivery':
      case 'DELIVERY': return '🛵 Delivery Update';
      case 'booking':
      case 'BOOKING': return '📋 Order Booking';
      case 'like': return '❤️ Like';
      case 'match': return '🔥 Match';
      case 'message': return '💬 Message';
      case 'admin': default: return '📢 Notification';
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => onRead(item)}
      style={[styles.card, { backgroundColor: bg, borderColor }]}
    >
      {/* Left: icon box or sender profile pic */}
      {senderPicUri ? (
        <Image source={{ uri: senderPicUri }} style={styles.senderAvatar} />
      ) : (
        <View style={[styles.iconBox, { backgroundColor: isDark ? '#3A2010' : '#DBEAFE' }]}>
          <Text style={{ fontSize: 20 }}>
            {item.type?.toLowerCase().includes('order') ? '🍔' : item.type?.toLowerCase().includes('delivery') ? '🛵' : '🔔'}
          </Text>
        </View>
      )}

      {/* Center: content */}
      <View style={styles.content}>
        {/* Title row */}
        <View style={styles.titleRow}>
          <Text style={[styles.badge, { color: '#0066FF' }]}>{getBadgeText()}</Text>
          {!item.isRead && <View style={styles.unreadDot} />}
        </View>

        {item.title ? (
          <Text style={[styles.title, { color: isDark ? '#DBEAFE' : '#0F172A' }]} numberOfLines={1}>
            {item.title}
          </Text>
        ) : null}

        <Text style={[styles.message, { color: isDark ? '#BFDBFE' : '#334155' }]} numberOfLines={3}>
          {item.text}
        </Text>

        <Text style={[styles.time, { color: isDark ? '#0066FF' : '#94A3B8' }]}>
          ⏱️ {formatTime(item.createdAt)}
        </Text>
      </View>

      {/* Right: notification image (if present) + Delete Button */}
      <View style={{ alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <TouchableOpacity
          onPress={() => onDelete(item._id)}
          style={{ padding: 6, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', borderRadius: 10 }}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 14 }}>🗑️</Text>
        </TouchableOpacity>

        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.notifImage} />
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Empty State
// ─────────────────────────────────────────────────────────────────────────────
const EmptyNotifications = ({ isDark }: { isDark: boolean }) => (
  <View style={emptyStyles.container}>
    <View style={[emptyStyles.iconWrap, { backgroundColor: isDark ? '#26160B' : '#EFF6FF' }]}>
      <Text style={{ fontSize: 40 }}>🔔</Text>
    </View>
    <Text style={[emptyStyles.title, { color: isDark ? '#DBEAFE' : '#0F172A' }]}>
      No Notifications Yet
    </Text>
    <Text style={[emptyStyles.subtitle, { color: isDark ? '#60A5FA' : '#64748B' }]}>
      Updates on your food orders, delivery alerts, and offers will appear here.
    </Text>
  </View>
);

const emptyStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 16 },
  iconWrap: { width: 90, height: 90, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20, opacity: 0.8 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
const NotificationScreen = () => {
  const { isDark, currentColors } = useTheme();
  const { socket, refreshNotifCount } = useSocket();

  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await api.get('/notifications');
      if (res.data.success) {
        setNotifications(res.data.notifications);
      }
    } catch (err) {
      console.log('[NotificationScreen] fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      refreshNotifCount();
    } catch (err) {
      console.log('Failed to mark all as read', err);
    }
  };

  const handleDeleteNotification = async (id: string) => {
    try {
      setNotifications(prev => prev.filter(n => n._id !== id));
      await api.delete(`/notifications/${id}`);
      refreshNotifCount();
    } catch (err) {
      console.log('Failed to delete notification', err);
    }
  };

  const handleClearAllNotifications = () => {
    if (notifications.length === 0) return;
    Alert.alert(
      'Clear All Notifications',
      'Are you sure you want to delete all notifications?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              setNotifications([]);
              await api.delete('/notifications/clear-all');
              refreshNotifCount();
            } catch (err) {
              console.log('Failed to clear notifications', err);
            }
          },
        },
      ]
    );
  };

  useFocusEffect(
    useCallback(() => {
      fetchNotifications(true);
    }, [fetchNotifications])
  );

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Real-time: listen for notifications
  useEffect(() => {
    if (!socket) return undefined;

    const handleAdminBroadcast = (data: any) => {
      setNotifications(prev => {
        if (prev.some(n => n._id === data._id)) return prev;
        return [data as AdminNotification, ...prev];
      });
    };

    const handleReceiveNotification = (data: any) => {
      setNotifications(prev => {
        if (prev.some(n => n._id === data._id)) return prev;
        return [data, ...prev];
      });
    };

    const handleAdminNotificationDeleted = (data: { title: string; text: string; createdAt: string }) => {
      setNotifications(prev => prev.filter(n => {
        const isTextMatch = n.text === data.text;
        const isTitleMatch = (n.title || 'Admin Notification') === data.title;
        const isTimeMatch = n.createdAt && n.createdAt.startsWith(data.createdAt);
        return !(isTextMatch && isTitleMatch && isTimeMatch);
      }));
    };

    socket.on('admin_broadcast', handleAdminBroadcast);
    socket.on('receive_notification', handleReceiveNotification);
    socket.on('admin_notification_deleted', handleAdminNotificationDeleted);
    return () => {
      socket.off('admin_broadcast', handleAdminBroadcast);
      socket.off('receive_notification', handleReceiveNotification);
      socket.off('admin_notification_deleted', handleAdminNotificationDeleted);
    };
  }, [socket]);

  const navigation = useNavigation<any>();

  // Hardware Back Button: Smoothly return to previous / Rider Home screen
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (navigation?.canGoBack && navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation?.navigate && navigation.navigate('DeliveryRiderHomeScreen');
        }
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [navigation])
  );

  const handleRead = async (item: any) => {
    const id = item?._id;
    if (id && !id.startsWith('admin_')) {
      try {
        await api.put(`/notifications/${id}/read`);
        refreshNotifCount();
      } catch (_) {}
    }
    if (id) {
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
    }

    // Navigate based on notification content/sender
    const senderId = item?.sender?._id || item?.senderId;
    if (item?.type === 'INCOMING_CALL' || item?.type === 'call' || item?.type === 'voice' || item?.type === 'video' || item?.callType) {
      if (senderId) {
        navigation.navigate('ChatRoom', {
          chatId: item.chatId,
          receiverId: senderId,
          userId: senderId,
          autoStartCall: true,
          callType: item.callType || (item.type === 'voice' ? 'voice' : 'video'),
          isIncomingCall: true,
        });
      }
    } else if (item?.type === 'message' || item?.type === 'CHAT') {
      if (senderId) {
        navigation.navigate('ChatRoom', { chatId: item.chatId, receiverId: senderId, userId: senderId });
      }
    } else if (senderId) {
      navigation.navigate('ProfileDetails', { userId: senderId });
    }
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? '#0F0E0E' : '#F8FAFC' }]}
      edges={['top']}
    >
      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: isDark ? '#26160B' : '#BFDBFE' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, marginRight: 8 }}>
          <TouchableOpacity
            onPress={() => {
              if (navigation?.canGoBack && navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation?.navigate && navigation.navigate('DeliveryRiderHomeScreen');
              }
            }}
            style={{ padding: 4, marginRight: 2 }}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 22, fontWeight: '700', color: isDark ? '#DBEAFE' : '#0F172A' }}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.headerTitle, { color: isDark ? '#DBEAFE' : '#0F172A' }]} numberOfLines={1}>
              Notifications
            </Text>
            {unreadCount > 0 && (
              <Text style={[styles.headerSub, { color: '#0066FF' }]} numberOfLines={1}>
                {unreadCount} unread
              </Text>
            )}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <TouchableOpacity
            style={[styles.headerActionBtn, { backgroundColor: isDark ? '#26160B' : '#EFF6FF', borderColor: '#BFDBFE' }]}
            onPress={markAllAsRead}
            activeOpacity={0.8}
          >
            <Text style={{ color: '#0066FF', fontWeight: '700', fontSize: 11 }}>Mark Read</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerActionBtn, { backgroundColor: isDark ? '#2D1414' : '#FEE2E2', borderColor: '#FECACA' }]}
            onPress={handleClearAllNotifications}
            activeOpacity={0.8}
          >
            <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 11 }}>🗑️ Clear All</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── List ── */}
      {loading ? (
        <View>
          {[1, 2, 3, 4].map(k => <SkeletonRow key={k} isDark={isDark} />)}
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item._id}
          renderItem={({ item }) => (
            <NotificationCard
              item={item}
              isDark={isDark}
              onRead={handleRead}
              onDelete={handleDeleteNotification}
            />
          )}
          contentContainerStyle={notifications.length === 0 ? { flex: 1 } : styles.listPad}
          ListEmptyComponent={<EmptyNotifications isDark={isDark} />}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchNotifications(true)}
              tintColor="#0066FF"
              colors={['#0066FF']}
            />
          }
        />
      )}
    </SafeAreaView>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
    opacity: 0.9,
  },
  headerActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Card
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  senderAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#0066FF33',
  },
  content: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0066FF',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.9,
  },
  time: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
    opacity: 0.8,
  },
  notifImage: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0066FF33',
  },

  listPad: { paddingTop: 8, paddingBottom: 40 },
});

export default NotificationScreen;
