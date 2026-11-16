import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  io,
  Socket,
} from 'socket.io-client';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Image,
  Vibration,
  AppState,
} from 'react-native';
let Sound: any = null;
try {
  Sound = require('react-native-sound');
} catch (e) {
  console.log('[SocketContext] react-native-sound disabled/removed');
}
import { useAuth } from './AuthContext';
import api, { SOCKET_URL, UPLOADS_URL } from '../services/api';
import { CENTRAL_IP, CLOUD_URL, USE_CLOUD } from '../config/apiConfig';
import WebRTCCallModal from '../components/WebRTCCallModal';
import { navigationRef } from '../services/NavigationService';

// ============================================================
// SOCKET CONTEXT
// Connects to backend server via Socket.IO
// Handles: connection, online users, reconnection,
//          real-time notifications with in-app toast banner
// ============================================================

interface NotificationData {
  _id: string;
  sender: {
    _id: string;
    name: string;
    username?: string;
    profilePicture?: string;
  } | null;
  text: string;
  title?: string;
  type: string;
  chatId?: string;
  createdAt?: string;
  isAdminNotification?: boolean;
  image?: string;
}

interface SocketContextType {
  socket: Socket | null;
  onlineUsers: string[];
  isConnected: boolean;
  unreadNotifCount: number;
  unreadMsgCount: number;
  clearNotifCount: () => void;
  clearMsgCount: () => void;
  refreshNotifCount: () => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  onlineUsers: [],
  isConnected: false,
  unreadNotifCount: 0,
  unreadMsgCount: 0,
  clearNotifCount: () => {},
  clearMsgCount: () => {},
  refreshNotifCount: () => {},
});

// ─── In-App Toast Banner ──────────────────────────────────────────────────────
interface ToastBannerProps {
  notification: NotificationData | null;
  onHide: () => void;
  onPress?: (notif: NotificationData) => void;
}

const ToastBanner: React.FC<ToastBannerProps> = ({ notification, onHide, onPress }) => {
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!notification) return;

    // Slide in
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 180,
        friction: 10,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto hide after 5 seconds
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -120,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => onHide());
    }, 5000);

    return () => clearTimeout(timer);
  }, [notification]);

  if (!notification) return null;

  const avatarUri = notification.sender?.profilePicture
    ? `${UPLOADS_URL}${notification.sender.profilePicture.replace('/uploads', '')}`
    : 'https://via.placeholder.com/100';

  const senderName = notification.title || notification.sender?.name || notification.sender?.username || 'Ride Hub';

  return (
    <Animated.View
      style={[
        toastStyles.container,
        { transform: [{ translateY: slideAnim }], opacity: opacityAnim },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.92}
        style={toastStyles.inner}
        onPress={() => {
          onPress?.(notification);
          onHide();
        }}
      >
        <Image source={{ uri: avatarUri }} style={toastStyles.avatar} />
        <View style={toastStyles.textWrap}>
          <Text style={toastStyles.name} numberOfLines={1}>{senderName}</Text>
          <Text style={toastStyles.message} numberOfLines={2}>
            {notification.text}
          </Text>
        </View>
        {/* Close button */}
        <TouchableOpacity onPress={onHide} style={toastStyles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={toastStyles.closeX}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

const toastStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 20,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C2E',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#0066FF',
  },
  textWrap: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  message: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    lineHeight: 18,
  },
  closeBtn: {
    padding: 4,
  },
  closeX: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontWeight: '600',
  },
});

// ─── Admin Toast Banner ───────────────────────────────────────────────────────
interface AdminToastProps {
  notification: NotificationData | null;
  onHide: () => void;
}

const AdminToastBanner: React.FC<AdminToastProps> = ({ notification, onHide }) => {
  const slideAnim = useRef(new Animated.Value(-130)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!notification) return;
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 180, friction: 10 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -130, duration: 300, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => onHide());
    }, 6000);
    return () => clearTimeout(timer);
  }, [notification]);

  if (!notification) return null;

  return (
    <Animated.View style={[adminToastStyles.container, { transform: [{ translateY: slideAnim }], opacity: opacityAnim }]}>
      <View style={adminToastStyles.inner}>
        <View style={adminToastStyles.iconBox}>
          <Text style={adminToastStyles.iconText}>📢</Text>
        </View>
        <View style={adminToastStyles.textWrap}>
          <Text style={adminToastStyles.title} numberOfLines={1}>
            {notification.title || 'Admin'}
          </Text>
          <Text style={adminToastStyles.message} numberOfLines={2}>
            {notification.text}
          </Text>
        </View>
        {notification.image ? (
          <Image
            source={{ uri: `${UPLOADS_URL}${notification.image.replace('/uploads', '')}` }}
            style={adminToastStyles.toastImage}
          />
        ) : null}
        <TouchableOpacity onPress={onHide} style={adminToastStyles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={adminToastStyles.closeX}>✕</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const adminToastStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    zIndex: 10000,
    elevation: 21,
    borderRadius: 18,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1040',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: '#0066FF',
  },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#0066FF22',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1.5,
    borderColor: '#0066FF',
  },
  iconText: { fontSize: 22 },
  textWrap: { flex: 1, marginRight: 8 },
  title: { color: '#C4B5FD', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  message: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 18 },
  toastImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#0066FF88',
  },
  closeBtn: { padding: 4 },
  closeX: { color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: '600' },
});



// Enable playback in silent mode (iOS)
if (Sound && Sound.setCategory) {
  Sound.setCategory('Playback');
}

let notificationTone: any = null;

const createAndPlaySound = (source: string, isRaw: boolean = true) => {
  try {
    if (!Sound) return;
    const soundInstance = isRaw
      ? new Sound(source, Sound.MAIN_BUNDLE, (err: any) => {
          if (!err && soundInstance) {
            soundInstance.setVolume(1.0);
            soundInstance.setNumberOfLoops(0);
            soundInstance.play((success: boolean) => {
              try { soundInstance.release(); } catch (_) {}
            });
          } else {
            console.log('[SocketContext] Raw sound playback failed, trying tone fallback:', err);
            const fb = new Sound('tone', Sound.MAIN_BUNDLE, (fbErr: any) => {
              if (!fbErr && fb) {
                fb.setVolume(1.0);
                fb.play(() => fb.release());
              }
            });
          }
        })
      : new Sound(source, (err: any) => {
          if (!err && soundInstance) {
            soundInstance.setVolume(1.0);
            soundInstance.play(() => soundInstance.release());
          } else {
            createAndPlaySound('whats_ringtone', true);
          }
        });
  } catch (e) {
    console.log('[SocketContext] createAndPlaySound error:', e);
  }
};

const playNotificationSoundAndVibrate = () => {
  // 1. Vibrate immediately
  try {
    Vibration.vibrate(500);
  } catch (_) {}

  // 2. Play sound via raw Android resource or asset
  try {
    createAndPlaySound('whats_ringtone', true);
  } catch (e) {
    console.log('[SocketContext] playNotificationSoundAndVibrate exception:', e);
  }
};

// ─── Socket Provider ─────────────────────────────────────────────────────────
export const SocketProvider = ({ children }: { children: ReactNode }) => {
  const { user, isLoading: authLoading } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;

  const [socket, setSocket] = useState<Socket | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  // Notification state
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [activeToast, setActiveToast] = useState<NotificationData | null>(null);
  const [activeAdminToast, setActiveAdminToast] = useState<NotificationData | null>(null);

  const clearNotifCount = () => setUnreadNotifCount(0);
  const clearMsgCount = () => setUnreadMsgCount(0);

  // Global Incoming Call State
  const [globalCallModalVisible, setGlobalCallModalVisible] = useState(false);
  const [globalCallType, setGlobalCallType] = useState<'voice' | 'video'>('video');
  const [globalIncomingOffer, setGlobalIncomingOffer] = useState<any>(null);
  const [globalCallerUser, setGlobalCallerUser] = useState<any>(null);

  useEffect(() => {
    if (authLoading) return;

    const candidateUrls = Array.from(new Set(
      USE_CLOUD
        ? [CLOUD_URL, SOCKET_URL]
        : [SOCKET_URL, `http://${CENTRAL_IP}:5000`, 'http://127.0.0.1:5000', 'http://10.0.2.2:5000', CLOUD_URL]
    )).filter(Boolean);

    let urlIdx = 0;
    let currentTargetUrl = candidateUrls[urlIdx];
    console.log('[Socket] Connecting to:', currentTargetUrl);

    let newSocket = io(currentTargetUrl, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 10000,
      auth: async (cb) => {
        try {
          const activeRole = ((await AsyncStorage.getItem('activeRole')) || '').toUpperCase();
          let tok = await AsyncStorage.getItem('userToken');
          if (activeRole === 'DELIVERY' || activeRole === 'RIDER') {
            tok = (await AsyncStorage.getItem('deliveryToken')) || tok;
          } else if (activeRole === 'SUPPLIER') {
            tok = (await AsyncStorage.getItem('supplierToken')) || tok;
          } else if (activeRole === 'CUSTOMER') {
            tok = (await AsyncStorage.getItem('customerToken')) || tok;
          }
          const curUser = userRef.current;
          cb({
            token: tok || '',
            userId: (curUser?._id || curUser?.id)?.toString() || '',
            role: (curUser?.role || activeRole || '').toLowerCase(),
          });
        } catch (_) {
          cb({});
        }
      },
    });

    newSocket.on('connect', async () => {
      console.log('[Socket] Connected successfully to:', currentTargetUrl, 'Socket ID:', newSocket.id);
      setIsConnected(true);
      const curUser = userRef.current;
      const uIdStr = (curUser?._id || curUser?.id)?.toString() || '';
      if (uIdStr) {
        newSocket.emit('register_user', uIdStr);
        const role = (curUser?.role || '').toLowerCase();
        if (['rider', 'delivery', 'delivery_partner', 'provider'].includes(role)) {
          // Restore rider's actual persisted Online/Offline state rather than forcing one
          try {
            const savedSpecific = await AsyncStorage.getItem(`rider_status_${uIdStr}`);
            const savedGlobal = await AsyncStorage.getItem('delivery_is_online');
            const wasOnline = savedSpecific !== null
              ? JSON.parse(savedSpecific) === true
              : (savedGlobal !== null ? JSON.parse(savedGlobal) === true : Boolean(curUser?.isOnline));
            if (wasOnline) {
              newSocket.emit('rider_online', { riderId: uIdStr, name: curUser?.name || 'Rider', isOnline: true, isAvailable: true });
            }
          } catch (_) {}
        }
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      setIsConnected(false);
    });

    newSocket.on('connect_error', (err) => {
      console.log('[Socket] Connection error to:', currentTargetUrl, err.message);
      setIsConnected(false);
      // Auto-fallback to next candidate URL (e.g. 127.0.0.1 for USB or 10.0.2.2 for emulator)
      if (urlIdx < candidateUrls.length - 1) {
        urlIdx++;
        currentTargetUrl = candidateUrls[urlIdx];
        console.log('[Socket Auto-Failover] Trying next candidate URL:', currentTargetUrl);
        try {
          (newSocket.io as any).uri = currentTargetUrl;
          newSocket.connect();
        } catch (e) {}
      }
    });

    newSocket.on('user_status_change', (data: { userId: string; isOnline: boolean }) => {
      if (data.isOnline) {
        setOnlineUsers((prev) => Array.from(new Set([...prev, data.userId])));
      } else {
        setOnlineUsers((prev) => prev.filter((id) => id !== data.userId));
      }
    });

    const refreshNotifCountFn = () => {
      if (!userRef.current?._id && !(userRef.current as any)?.id) return;
      api.get('/notifications/unread-count')
        .then(res => {
          if (res.data.success) {
            setUnreadNotifCount(res.data.unreadCount || 0);
          }
        })
        .catch(() => {});
    };

    // ── Fetch Initial Counts ONLY when authenticated ──
    if (userRef.current?._id || (userRef.current as any)?.id) {
      api.get('/chats/unread-count')
        .then(res => {
          if (res.data.success) {
            setUnreadMsgCount(res.data.unreadCount || 0);
          }
        })
        .catch(() => {});
      refreshNotifCountFn();
    }

    newSocket.on('messages_marked_seen', () => {
      // Refresh the unread count from the server to be accurate
      api.get('/chats/unread-count')
        .then(res => {
          if (res.data.success) {
            setUnreadMsgCount(res.data.unreadCount || 0);
          }
        })
        .catch(err => console.log('Error fetching unread count:', err));
    });

    // ── Real-time notification from backend ──
    newSocket.on('receive_notification', (data: NotificationData) => {
      console.log('[Socket] Notification Received:', data);
      // Don't show notification if it's from the logged-in user themselves
      if (user && data.sender?._id === user._id) return;

      setUnreadNotifCount((prev) => prev + 1);

      if (data.isAdminNotification || data.type === 'admin') {
        setActiveAdminToast(data);
      } else {
        setActiveToast(data);
      }

      // Play custom notification sound and vibrate
      playNotificationSoundAndVibrate();

      // Also bump the message unread count if it's a message notification
      if (data.type === 'message') {
        setUnreadMsgCount((prev) => prev + 1);
      }
    });

    // ── Admin Broadcast / Targeted Notification ──
    const handleAdminBroadcast = (data: NotificationData) => {
      console.log('[Socket] Admin Broadcast Received:', data);
      if (!data) return;

      const userRole = (user?.role || 'customer').toLowerCase();
      const isRider = userRole === 'rider' || userRole === 'delivery_partner' || userRole === 'provider';
      const isSupplier = userRole === 'supplier' || userRole === 'store' || userRole === 'restaurant' || userRole === 'seller_partner';
      const isCustomer = !isRider && !isSupplier && userRole !== 'admin';

      const targetRole = ((data as any).target || 'all_users').toLowerCase();
      
      // Filter targeted notifications
      if (targetRole === 'customer' || targetRole === 'customers' || targetRole === 'user' || targetRole === 'users') {
        if (!isCustomer) return;
      } else if (targetRole === 'rider' || targetRole === 'riders') {
        if (!isRider) return;
      } else if (targetRole === 'supplier' || targetRole === 'store' || targetRole === 'restaurant') {
        if (!isSupplier) return;
      } else if (targetRole === 'specific' && (data as any).targetUserId) {
        const myId = (user?._id || user?.id)?.toString();
        if (myId !== (data as any).targetUserId?.toString()) return;
      }

      setUnreadNotifCount((prev) => prev + 1);
      
      // Show admin broadcast banner popup
      setActiveAdminToast(data);

      // Play custom notification sound and vibrate
      playNotificationSoundAndVibrate();
    };

    newSocket.on('admin_broadcast', handleAdminBroadcast);
    newSocket.on('new_notification', (data) => {
      if (data && (data.isAdminNotification || data.type === 'admin')) {
        handleAdminBroadcast(data);
      }
    });

    newSocket.on('admin_notification_deleted', () => {
      refreshNotifCountFn();
    });

    // ── Chat list refresh trigger ──
    newSocket.on('chat_list_update', () => {
      // Components listening to this via socket can refresh
    });

    newSocket.on('new_profile_active', (data) => {
      console.log('[Socket] New Profile Active:', data);
    });

    // Listen to AppState to maintain active status when screen locks with app open
    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      console.log('[Socket] AppState changed to:', nextAppState);
      if (user?._id) {
        if (nextAppState === 'active' || nextAppState === 'background') {
          // Keep registered as online/active
          const uIdStr = user?._id?.toString() || '';
          if (newSocket.connected) {
            newSocket.emit('register_user', uIdStr);
          } else {
            newSocket.connect();
          }
        }
      }
    });

    // ── Global WebRTC Incoming Call ──
    const handleGlobalIncomingCall = (data: any) => {
      console.log('[SocketContext] Global incoming call received:', data);
      if (!data) return;

      // If user is ALREADY in an active call / ringing, reject busy call automatically!
      if (globalCallModalVisible) {
        console.log('[SocketContext] User is currently busy in a call. Auto-rejecting new call.');
        if (newSocket && data.from) {
          newSocket.emit('reject_call', { to: data.from, reason: 'busy' });
        }
        return;
      }

      setGlobalIncomingOffer(data.signalData || data.offer);
      setGlobalCallType(data.callType || 'video');
      const callerObj = data.callerInfo || {
        _id: data.from,
        name: data.callerName || 'User',
        profilePicture: data.callerPicture,
      };
      setGlobalCallerUser(callerObj);
      setGlobalCallModalVisible(true);
      playNotificationSoundAndVibrate();
    };

    newSocket.on('incoming_call', handleGlobalIncomingCall);
    newSocket.on('call_incoming', handleGlobalIncomingCall);

    setSocket(newSocket);

    return () => {
      appStateSubscription.remove();
      newSocket.off('connect');
      newSocket.off('disconnect');
      newSocket.off('connect_error');
      newSocket.off('user_status_change');
      newSocket.off('messages_marked_seen');
      newSocket.off('receive_notification');
      newSocket.off('admin_broadcast');
      newSocket.off('chat_list_update');
      newSocket.off('new_profile_active');
      newSocket.off('incoming_call', handleGlobalIncomingCall);
      newSocket.off('call_incoming', handleGlobalIncomingCall);
      newSocket.disconnect();
    };
  }, [authLoading]);

  const handleToastPress = async (notif: NotificationData) => {
    if (!navigationRef.isReady()) return;
    
    const isCallNotif = notif.type === 'INCOMING_CALL' || notif.type === 'call' || (notif as any).callType;
    if (isCallNotif && notif.sender?._id) {
      navigationRef.navigate('ChatRoom', {
        receiverId: notif.sender._id,
        userId: notif.sender._id,
        autoStartCall: true,
        callType: (notif as any).callType || 'video',
        isIncomingCall: true,
      });
    } else if (notif.chatId && notif.sender && notif.sender._id) {
      try {
        // Fetch chat data or access chat to navigate to screen
        const res = await api.post('/chats', { userId: notif.sender._id });
        if (res.data.success) {
          navigationRef.navigate('ChatRoom', { chat: res.data.chat });
        }
      } catch (err) {
        console.log('Failed to open chat from toast notification', err);
      }
    } else {
      // Fallback to CustomerHomeScreen
      navigationRef.navigate('CustomerHomeScreen');
    }
  };

  // Re-authenticate & switch socket rooms cleanly whenever active user identity/role changes (never leak old rooms!)
  const prevSocketIdentityRef = useRef<string>('');
  useEffect(() => {
    const uIdStr = (user?._id || (user as any)?.id)?.toString() || '';
    const userRole = (user?.role || '').toLowerCase();
    const nextIdentity = uIdStr ? `${uIdStr}:${userRole}` : '';
    const prevIdentity = prevSocketIdentityRef.current;

    if (!socket) return;

    const handleIdentitySync = async () => {
      try {
        if (prevIdentity && prevIdentity !== nextIdentity) {
          const prevUserId = prevIdentity.split(':')[0];
          if (prevUserId) {
            socket.emit('unregister_user', prevUserId);
          }
          prevSocketIdentityRef.current = nextIdentity;

          // Update handshake token to match newly active account & reconnect clean so io.use re-verifies identity
          const activeRoleRaw = await AsyncStorage.getItem('activeRole');
          let tok = '';
          if (activeRoleRaw === 'SUPPLIER') tok = (await AsyncStorage.getItem('supplierToken')) || '';
          else if (activeRoleRaw === 'DELIVERY') tok = (await AsyncStorage.getItem('deliveryToken')) || '';
          else if (activeRoleRaw === 'CUSTOMER') tok = (await AsyncStorage.getItem('customerToken')) || '';
          if (!tok) tok = (await AsyncStorage.getItem('userToken')) || '';

          (socket as any).auth = {
            token: tok || undefined,
            userId: uIdStr || undefined,
            role: userRole || undefined,
          };
          if (socket.connected) {
            socket.disconnect();
            socket.connect();
          }
          return;
        }

        if (nextIdentity) {
          prevSocketIdentityRef.current = nextIdentity;
        }

        if (!isConnected || !uIdStr) return;

        socket.emit('register_user', uIdStr);
        if (userRole === 'supplier' || userRole === 'seller_partner') {
          socket.emit('join_restaurant_room', { supplierId: uIdStr, restaurantId: uIdStr, partnerId: user?.partnerId });
          socket.emit('join_supplier_room', { supplierId: uIdStr });
          socket.emit('join_room', `supplier:${uIdStr}`);
          socket.emit('join_room', `supplier_${uIdStr}`);
          socket.emit('join_room', `restaurant_${uIdStr}`);
        } else if (['rider', 'delivery', 'delivery_partner', 'provider'].includes(userRole)) {
          Promise.all([
            AsyncStorage.getItem(`rider_status_${uIdStr}`),
            AsyncStorage.getItem('delivery_is_online'),
          ]).then(([spec, glob]) => {
            const isOnlineSaved = spec !== null
              ? JSON.parse(spec) === true
              : (glob !== null ? JSON.parse(glob) === true : Boolean(user?.isOnline));
              if (isOnlineSaved) {
                socket.emit('rider_online', { riderId: uIdStr, name: user?.name || 'Rider', isOnline: true, isAvailable: true });
              }
            }).catch(() => {});
        }
        console.log(`📡 [SocketContext] Synced active user on socket: ${uIdStr} (${userRole || 'customer'})`);
      } catch (_) {}
    };

    handleIdentitySync();
  }, [user?._id, (user as any)?.id, user?.role, socket, isConnected]);

  return (
    <SocketContext.Provider value={{
      socket,
      onlineUsers,
      isConnected,
      unreadNotifCount,
      unreadMsgCount,
      clearNotifCount,
      clearMsgCount,
      refreshNotifCount: () => {
        api.get('/notifications/unread-count')
          .then(res => {
            if (res.data.success) setUnreadNotifCount(res.data.unreadCount || 0);
          })
          .catch(() => {});
      },
    }}>
      {children}
      {/* Regular notification toast */}
      <ToastBanner
        notification={activeToast}
        onHide={() => setActiveToast(null)}
        onPress={handleToastPress}
      />
      {/* Admin broadcast toast — shown above regular toast */}
      <AdminToastBanner
        notification={activeAdminToast}
        onHide={() => setActiveAdminToast(null)}
      />
      {/* Global WebRTC Incoming Call Modal */}
      {globalCallModalVisible && globalCallerUser && (
        <WebRTCCallModal
          visible={globalCallModalVisible}
          onClose={() => {
            setGlobalCallModalVisible(false);
            setGlobalCallerUser(null);
            setGlobalIncomingOffer(null);
          }}
          socket={socket}
          user={user}
          otherUser={globalCallerUser}
          isIncomingCall={true}
          incomingOffer={globalIncomingOffer}
          callType={globalCallType}
        />
      )}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
