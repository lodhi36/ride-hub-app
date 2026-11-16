import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Dimensions, View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Image, ActivityIndicator, Keyboard, Modal, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/PngIcon';
import RazorpayCheckout from 'react-native-razorpay';
import ImagePicker from 'react-native-image-crop-picker';

const windowWidth = Dimensions.get('window').width;

import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { colors, typography, spacing, radius } from '../theme/colors';
let Sound: any = null;
try {
  Sound = require('react-native-sound');
} catch (e) {
  console.log('[ChatScreen] react-native-sound disabled/removed');
}
import api, { UPLOADS_URL } from '../services/api';
import WebRTCCallModal from '../components/WebRTCCallModal';

// Initialize sound (Android raw resource, iOS bundle)
let giftTone: any = null;
const loadGiftTone = () => {
  if (giftTone) return;
  // For Android, place file in android/app/src/main/res/raw/notification_o14eglp.mp3
  // For iOS, keep in project bundle (not handled here)
  giftTone = new Sound('notification_o14eglp.mp3', Sound.MAIN_BUNDLE, (error: any) => {
    if (error) {
      console.log('[ChatScreen] Failed to load gift tone', error);
      giftTone = null;
    }
  });
};
const playGiftTone = () => {
  loadGiftTone();
  if (giftTone) {
    giftTone.play((success: any) => {
      if (!success) console.log('[ChatScreen] Gift tone playback failed');
    });
  }
};

let messageTone: any = null;
const loadMessageTone = () => {
  if (messageTone) return;
  messageTone = new Sound(require('../tone/short_sms.mp3'), (error: any) => {
    if (error) {
      console.log('[ChatScreen] Failed to load message tone', error);
      messageTone = null;
    }
  });
};
const playMessageTone = () => {
  loadMessageTone();
  if (messageTone) {
    messageTone.play((success: any) => {
      if (!success) console.log('[ChatScreen] Message tone playback failed');
    });
  }
};


const ChatScreen = ({ route, navigation }: any) => {
  console.log('[ChatScreen] Render start. Route params:', route?.params);

  // Safe destructuring of route params
  const { 
    chat: initialChat, 
    chatId: paramChatId, 
    receiverId: paramReceiverId, 
    userId: paramUserId,
    otherUser: paramOtherUser,
    user: paramUser,
    orderId,
    restaurantName,
    riderName,
    customerName,
    orderStatus,
    chatContext,
  } = route?.params || {};
  const targetReceiverId = paramReceiverId || paramUserId || paramOtherUser?._id || paramUser?._id;

  const { isDark, currentColors } = useTheme();
  const { user } = useAuth();
  const { socket, onlineUsers } = useSocket();
  const insets = useSafeAreaInsets();

  const [chat, setChat] = useState<any>(initialChat);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGiftModalVisible, setGiftModalVisible] = useState(false);
  const [isMenuVisible, setMenuVisible] = useState(false);
  const [currentWalletBalance, setCurrentWalletBalance] = useState((user as any)?.walletBalance || 0);
  const [selectedGift, setSelectedGift] = useState<any>(null);
  const [isPaymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  
  // Fullscreen Image Viewer modal state
  const [viewingImageModal, setViewingImageModal] = useState<boolean>(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

  // WebRTC Calling state
  const [isCallModalVisible, setCallModalVisible] = useState(false);
  const [callType, setCallType] = useState<'voice' | 'video'>('video');
  const [isIncomingCall, setIsIncomingCall] = useState(false);
  const [incomingOffer, setIncomingOffer] = useState<any>(null);
  const [incomingCallerUser, setIncomingCallerUser] = useState<any>(null);

  // ── Structured Gift Catalog ──────────────────────────────
  // All gifts cost ₹ — sender's walletBalance is deducted, receiver earns the same amount
  const GIFT_CATALOG = [
    { id: 'rose',      emoji: '🌹', name: 'Rose',      price: 5   },
    { id: 'gift',      emoji: '🎁', name: 'Gift Box',  price: 10  },
    { id: 'heart',     emoji: '💖', name: 'Heart',     price: 20  },
    { id: 'champagne', emoji: '🥂', name: 'Champagne', price: 25  },
    { id: 'teddy',     emoji: '🧸', name: 'Teddy',     price: 30  },
    { id: 'diamond',   emoji: '💎', name: 'Diamond',   price: 50  },
    { id: 'crown',     emoji: '👑', name: 'Crown',     price: 100 },
  ];
  
  const flatListRef = useRef<FlatList>(null);

  // Extract other user profile info safely
  const getOtherUser = (currentChat: any) => {
    if (!currentChat || !currentChat.participants) return paramOtherUser || null;
    return currentChat.participants.find((p: any) => {
      if (!p) return false;
      const pId = typeof p === 'object' ? p._id : p;
      return pId?.toString() !== user?._id?.toString();
    }) || paramOtherUser || null;
  };

  const otherUser = getOtherUser(chat);
  const otherUserId = otherUser?._id || targetReceiverId || paramOtherUser?._id;
  const isOnline = otherUserId ? (onlineUsers.includes(otherUserId) || otherUser?.isOnline) : false;

  const otherUserAvatar = otherUser?.profilePicture
    ? `${UPLOADS_URL}${otherUser.profilePicture.replace('/uploads', '')}`
    : 'https://via.placeholder.com/100';

  // Format Last Seen helper safely
  const formatLastSeen = (dateStr: string) => {
    if (!dateStr) return 'Offline';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.round(diffMs / 60000);
      const diffHrs = Math.round(diffMins / 60);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHrs < 24) return `${diffHrs}h ago`;
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      console.log('[ChatScreen] formatLastSeen error:', e);
      return 'Offline';
    }
  };

  // Helper to fetch or create Chat Room
  const initializeChat = useCallback(async () => {
    console.log('[ChatScreen] initializeChat starting...');
    try {
      setLoading(true);
      setError(null);

      let activeChat = chat;

      // If chat object was not passed directly, fetch or create it
      if (!activeChat) {
        const targetId = otherUserId || targetReceiverId;
        if (targetId) {
          console.log('[ChatScreen] No initial chat object, calling POST /chats for targetId:', targetId);
          const res = await api.post('/chats', { userId: targetId });
          if (res.data.success) {
            activeChat = res.data.chat;
            setChat(activeChat);
          }
        } else if (paramChatId) {
          console.log('[ChatScreen] Fetching chat room by paramChatId:', paramChatId);
          const res = await api.get(`/chats/${paramChatId}`);
          if (res.data.success) {
            activeChat = res.data.chat;
            setChat(activeChat);
          }
        }
      }

      if (!activeChat) {
        console.log('[ChatScreen] Active chat missing after checking params');
        throw new Error('Unable to start chat. User info is missing.');
      }

      // Fetch message history
      console.log('[ChatScreen] Fetching messages for chatId:', activeChat._id);
      const msgRes = await api.get(`/messages/${activeChat._id}`);
      if (msgRes.data.success) {
        console.log('[ChatScreen] Messages fetched count:', msgRes.data.messages?.length);
        setMessages(msgRes.data.messages || []);
      }

      // Join socket chat room and mark seen
      if (socket) {
        console.log('[ChatScreen] Emitting join_chat and message_seen for chatId:', activeChat._id);
        socket.emit('join_chat', activeChat._id);
        socket.emit('message_seen', { chatId: activeChat._id, userId: user?._id });
      }

      setLoading(false);
    } catch (err: any) {
      console.error('[ChatScreen] initializeChat Error:', err);
      const errMsg = err?.response?.data?.message || err?.message || 'Something went wrong while loading the chat.';
      setError(errMsg);
      setLoading(false);
    }
  }, [chat, paramChatId, otherUserId, targetReceiverId, user?._id, socket]);

  const fetchOlderMessages = async () => {
    if (!chat?._id || loadingOlder || !hasMoreOlder || messages.length === 0) return;
    try {
      setLoadingOlder(true);
      const oldestMsg = messages[0];
      const beforeTime = oldestMsg?.createdAt;
      const res = await api.get(`/messages/${chat._id}?limit=30${beforeTime ? `&before=${encodeURIComponent(beforeTime)}` : ''}`);
      if (res.data?.success && Array.isArray(res.data.messages)) {
        if (res.data.messages.length === 0) {
          setHasMoreOlder(false);
        } else {
          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m._id));
            const newOlder = res.data.messages.filter((m: any) => !existingIds.has(m._id));
            if (newOlder.length === 0) setHasMoreOlder(false);
            return [...newOlder, ...prev];
          });
        }
      }
    } catch (e: any) {
      console.log('Error fetching older messages:', e?.message);
    } finally {
      setLoadingOlder(false);
    }
  };

  // Load chat on mount
  useEffect(() => {
    initializeChat();
  }, [initializeChat]);

  // Auto-trigger call modal if navigated from call notification
  useEffect(() => {
    if (route?.params?.autoStartCall) {
      const type = route.params.callType || 'video';
      const isIncoming = route.params.isIncomingCall ?? false;
      console.log('[ChatScreen] Auto-starting call modal from notification tap! Type:', type, 'Incoming:', isIncoming);
      setCallType(type);
      setIsIncomingCall(isIncoming);
      setCallModalVisible(true);
      // Reset param to prevent loop
      navigation.setParams({ autoStartCall: undefined });
    }
  }, [route?.params?.autoStartCall, route?.params?.callType, route?.params?.isIncomingCall]);

  // Set navigation options based on loaded otherUser info
  useEffect(() => {
    if (!otherUser || !navigation) return;
    
    console.log('[ChatScreen] Setting custom header title for otherUser:', otherUser.name || otherUser.username);
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity 
          style={{ padding: 8, marginLeft: -8, marginRight: 8 }} 
          onPress={() => navigation.goBack()}
        >
          <Text style={{ fontSize: 20, color: currentColors.text, fontWeight: 'bold' }}>←</Text>
        </TouchableOpacity>
      ),
      headerTitle: () => (
        <View style={styles.customHeaderTitle}>
          <Image source={{ uri: otherUserAvatar }} style={styles.headerAvatar} />
          <View>
            <Text style={[styles.headerName, { color: currentColors.text }]} numberOfLines={1}>
              {otherUser.name || otherUser.username}
            </Text>
            <Text style={[styles.onlineText, { color: isOnline ? colors.success : currentColors.textMuted }]}>
              {isOnline ? 'Online' : formatLastSeen(otherUser.lastSeen)}
            </Text>
          </View>
        </View>
      ),
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            style={{ alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, marginRight: 6 }}
            activeOpacity={0.7}
            onPress={() => {
              setCallType('voice');
              setIsIncomingCall(false);
              setCallModalVisible(true);
            }}
          >
            <Image
              source={require('../assets/generated_icons/voice_call_icon.jpg')}
              style={{ width: windowWidth * 0.065, height: windowWidth * 0.065, borderRadius: 8 }}
            />
            <Text style={{ fontSize: 9, fontWeight: '700', color: currentColors.text, marginTop: 2 }}>Voice Call</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, marginRight: 6 }}
            activeOpacity={0.7}
            onPress={() => {
              setCallType('video');
              setIsIncomingCall(false);
              setCallModalVisible(true);
            }}
          >
            <Image
              source={require('../assets/generated_icons/video_call_icon.jpg')}
              style={{ width: windowWidth * 0.065, height: windowWidth * 0.065, borderRadius: 8 }}
            />
            <Text style={{ fontSize: 9, fontWeight: '700', color: currentColors.text, marginTop: 2 }}>Video Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerRightBtn} activeOpacity={0.7} onPress={() => setMenuVisible(true)}>
            <Icon name="settings" size={24} color={currentColors.text} />
          </TouchableOpacity>
        </View>
      )
    });
  }, [otherUser, isOnline, currentColors, otherUserAvatar, navigation]);

  // Socket action listeners
  useEffect(() => {
    if (!socket || !chat?._id) return;

    const handleReceiveMessage = (newMsg: any) => {
      console.log('[ChatScreen] Socket receive_message event:', newMsg?._id, newMsg?.clientMsgId);
      const targetChatId = newMsg.chatId?._id || newMsg.chatId;
      if (targetChatId === chat._id) {
        setMessages(prev => {
          // Deduplication via clientMsgId: replace optimistic placeholder
          if (newMsg.clientMsgId) {
            const hasOptimistic = prev.some(m => m.clientMsgId === newMsg.clientMsgId || m._id === newMsg.clientMsgId);
            if (hasOptimistic) {
              return prev.map(m => (m.clientMsgId === newMsg.clientMsgId || m._id === newMsg.clientMsgId) ? { ...newMsg, text: newMsg.text || newMsg.content, status: 'sent' } : m);
            }
          }
          if (prev.some(m => m._id === newMsg._id)) return prev;
          return [...prev, newMsg];
        });
        
        // Mark as seen immediately if we are in this chat screen
        const senderId = newMsg.sender?._id || newMsg.sender;
        if (senderId !== user?._id) {
          playMessageTone();
          socket.emit('message_seen', { chatId: chat._id, userId: user?._id });
        }
      }
    };

    const handleMessageStatus = (data: any) => {
      console.log('[ChatScreen] Socket message_status_update event:', data);
      if (data.chatId === chat._id) {
        setMessages(prev => prev.map(msg => msg._id === data.messageId ? { ...msg, status: data.status } : msg));
      }
    };

    const handleMarkedSeen = (data: any) => {
      console.log('[ChatScreen] Socket messages_marked_seen event:', data);
      const viewerId = data?.viewerId;
      if (viewerId && viewerId !== user?._id) {
        setMessages(prev => prev.map(msg => {
          const senderId = msg.sender?._id || msg.sender;
          return senderId === user?._id ? { ...msg, status: 'seen' } : msg;
        }));
      }
    };

    const handleTyping = (data: any) => {
      if (data.chatId === chat._id && data.username !== user?.name) {
        setIsTyping(true);
      }
    };

    const handleStopTyping = (data: any) => {
      if (data.chatId === chat._id) {
        setIsTyping(false);
      }
    };

    const handleWalletUpdated = (data: any) => {
      if (data.walletBalance !== undefined) {
        setCurrentWalletBalance(data.walletBalance);
      }
    };

    const handleEarningsUpdated = (data: any) => {
      console.log('[ChatScreen] Socket earnings_updated event:', data);
      if (data?.walletBalance !== undefined) {
        setCurrentWalletBalance(data.walletBalance);
      }
    };

    socket.on('receive_message', handleReceiveMessage);
    socket.on('message_status_update', handleMessageStatus);
    socket.on('messages_marked_seen', handleMarkedSeen);
    socket.on('typing', handleTyping);
    socket.on('stop_typing', handleStopTyping);
    socket.on('wallet_updated', handleWalletUpdated);
    socket.on('earnings_updated', handleEarningsUpdated);

    return () => {
      socket.off('receive_message', handleReceiveMessage);
      socket.off('message_status_update', handleMessageStatus);
      socket.off('messages_marked_seen', handleMarkedSeen);
      socket.off('typing', handleTyping);
      socket.off('stop_typing', handleStopTyping);
      socket.off('wallet_updated', handleWalletUpdated);
      socket.off('earnings_updated', handleEarningsUpdated);
    };
  }, [socket, chat?._id, user?._id, user?.name, otherUserId]);

  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Keyboard open/hide listeners to auto-scroll list and log debugging info
  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', 
      (e) => {
        console.log('[DEBUG] Keyboard Opened, Height:', e.endCoordinates?.height);
        if (Platform.OS === 'android') {
          setKeyboardHeight(e.endCoordinates?.height || 0);
        }
        scrollToBottom();
      }
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', 
      () => {
        console.log('[DEBUG] Keyboard Closed');
        if (Platform.OS === 'android') {
          setKeyboardHeight(0);
        }
      }
    );
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const scrollToBottom = () => {
    console.log('[DEBUG] Scroll To Bottom');
    // For an inverted FlatList, offset 0 is the bottom.
    if (messages.length > 0) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  };

  const handleSend = async (retryItem?: any) => {
    const content = retryItem ? (retryItem.text || retryItem.content) : inputText.trim();
    if (!content || !chat?._id) return;
    if (!retryItem) setInputText('');
    socket?.emit('stop_typing', { chatId: chat._id });

    const clientMsgId = retryItem?.clientMsgId || retryItem?._id || `cmsg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const myId = user?._id || user?.id;

    if (!retryItem) {
      // ⚡ 0ms INSTANT OPTIMISTIC UI MESSAGE (<10ms UI update)
      const optimisticMsg = {
        _id: clientMsgId,
        clientMsgId,
        text: content,
        content,
        chatId: chat._id,
        sender: { _id: myId, name: user?.name || 'Me' },
        createdAt: new Date().toISOString(),
        status: 'sending',
      };
      setMessages(prev => [...prev, optimisticMsg]);
      playMessageTone();
    } else {
      // Retry in progress
      setMessages(prev => prev.map(m => (m.clientMsgId === clientMsgId || m._id === clientMsgId) ? { ...m, status: 'sending' } : m));
    }

    try {
      const res = await api.post('/messages', {
        content,
        chatId: chat._id,
        receiverId: otherUserId,
        clientMsgId,
      });
      const savedMsg = res.data?.message || res.data;
      if (savedMsg && (savedMsg._id || savedMsg.content)) {
        setMessages(prev => prev.map(m => 
          (m.clientMsgId === clientMsgId || m._id === clientMsgId)
            ? { ...m, ...savedMsg, text: savedMsg.text || savedMsg.content || content, status: 'sent', clientMsgId }
            : m
        ));
      } else {
        setMessages(prev => prev.map(m => 
          (m.clientMsgId === clientMsgId || m._id === clientMsgId)
            ? { ...m, status: 'sent' }
            : m
        ));
      }
    } catch (error) {
      console.log('[ChatScreen] api.post(/messages) failed:', error);
      // Mark as failed to allow tap-to-retry
      setMessages(prev => prev.map(m => 
        (m.clientMsgId === clientMsgId || m._id === clientMsgId)
          ? { ...m, status: 'failed' }
          : m
      ));
    }
  };

  const handleDirectPayment = async () => {
    const amount = Number(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }

    setPaymentModalVisible(false);
    setPaymentAmount('');

    try {
      const orderRes = await api.post('/payments/create-order', {
        amount: amount,
        currency: 'INR',
      });

      if (!orderRes.data.success || !orderRes.data.order) {
        throw new Error('Failed to create payment order');
      }

      const options = {
        description: `Direct payment to ${otherUser?.name || 'User'}`,
        image: 'https://cdn-icons-png.flaticon.com/512/5721/5721113.png',
        key: 'rzp_live_TmSPcojj3JfRzH',
        amount: orderRes.data.order.amount,
        currency: 'INR',
        order_id: orderRes.data.order.id,
        name: 'UPI PhonePe Payment',
        prefill: {
          email: user?.email || 'user@example.com',
          contact: '',
          name: user?.name || 'User',
          method: 'upi'
        },
        theme: { color: colors.primary }
      };

      RazorpayCheckout.open(options).then(async (data: any) => {
        const verifyRes = await api.post('/payments/verify-payment', {
          razorpay_order_id: data.razorpay_order_id,
          razorpay_payment_id: data.razorpay_payment_id,
          razorpay_signature: data.razorpay_signature,
          amount: amount,
        });

        if (verifyRes.data.success) {
          // Send chat message representing the payment
          await api.post('/messages', {
            content: `GIFT_MESSAGE:₹${amount} Sent via UPI`,
            chatId: chat._id,
            receiverId: otherUserId,
            messageType: 'gift',
            giftName: 'Direct Payment',
            giftPrice: amount,
            giftEmoji: '💸'
          });
          Alert.alert('Success', `₹${amount} sent successfully!`);
        } else {
          Alert.alert('Payment Failed', 'Verification failed.');
        }
      }).catch((err: any) => {
        console.log('[Razorpay Error]', err);
        Alert.alert('Payment Cancelled', 'Payment process was interrupted.');
      });
    } catch (err) {
      Alert.alert('Error', 'Failed to initialize payment gateway.');
    }
  };


  const handleTakePhoto = async () => {
    try {
      const image = await ImagePicker.openCamera({
        mediaType: 'photo',
        compressImageQuality: 0.8,
      });
      if (image) {
        uploadMediaFile(image.path, image.mime || 'image/jpeg', 'image');
      }
    } catch (err: any) {
      if (err?.message !== 'User cancelled image selection') {
        console.log('Camera Error:', err);
      }
    }
  };

  const handlePickImage = async () => {
    try {
      const image = await ImagePicker.openPicker({
        mediaType: 'photo',
        compressImageQuality: 0.8,
      });
      if (image) {
        uploadMediaFile(image.path, image.mime || 'image/jpeg', 'image');
      }
    } catch (err: any) {
      if (err?.message !== 'User cancelled image selection') {
        console.log('ImagePicker Error:', err);
      }
    }
  };

  const quickSuggestions = useMemo(() => {
    const role = (user as any)?.role || 'customer';
    if (role === 'supplier' || chatContext === 'RESTAURANT') {
      return [
        '🍳 Your food is being prepared',
        '📦 Order packed & ready for pickup',
        '📸 Sending prep/packed photo',
        '✅ Added extra cutlery/tissues',
        '⏱️ Ready in 5 minutes',
      ];
    }
    if (role === 'provider' || role === 'rider') {
      return [
        '📍 Reached restaurant',
        '🛵 Picked up order & on the way',
        '📍 Arrived at your location',
        '🚪 Please come to gate / share landmark',
        '📞 Calling you in 1 min',
      ];
    }
    return [
      '🔔 Please don’t ring doorbell',
      '🚪 Leave order at door',
      '🥫 Please add extra ketchup/tissues',
      '📍 Please call when you reach',
      '🛵 Where are you now?',
    ];
  }, [user, chatContext]);

  const handleQuickSend = async (text: string) => {
    if (!text.trim() || !chat?._id) return;
    try {
      const res = await api.post('/messages', {
        content: text.trim(),
        chatId: chat._id,
        receiverId: otherUserId,
        messageType: 'text',
      });
      if (res.data.success && res.data.message) {
        setMessages((prev) => [res.data.message, ...prev]);
        scrollToBottom();
      }
    } catch (e) {
      console.log('[Quick Send Error]', e);
    }
  };

  const uploadMediaFile = async (filePath: string, mimeType: string, type: 'image') => {
    if (!chat?._id) return;
    try {
      const formData = new FormData();
      formData.append('media', {
        uri: Platform.OS === 'android' ? filePath : filePath.replace('file://', ''),
        name: `upload_${Date.now()}.jpg`,
        type: mimeType,
      } as any);

      const res = await api.post('/messages/upload-media', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data.success && res.data.mediaUrl) {
        await api.post('/messages', {
          content: '',
          chatId: chat._id,
          receiverId: otherUserId,
          messageType: type,
          mediaUrl: res.data.mediaUrl
        });
      }
    } catch (err) {
      console.error('Upload error:', err);
      Alert.alert('Upload Failed', 'Failed to upload media.');
    }
  };

  const sendGift = async (giftItem: typeof GIFT_CATALOG[0]) => {
    setGiftModalVisible(false);
    setSelectedGift(null);
    if (!chat?._id) return;

    const amountToPay = giftItem.price;

    Alert.alert(
      'Send Gift',
      `You are about to pay ₹${amountToPay} to send the ${giftItem.name} gift.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay & Send',
          onPress: async () => {
            try {
              // 1. Create Razorpay order on backend
              const orderRes = await api.post('/payments/create-order', {
                amount: amountToPay,
                currency: 'INR',
              });

              if (!orderRes.data.success || !orderRes.data.order) {
                throw new Error('Failed to create payment order');
              }

              const options = {
                description: `Payment for ${giftItem.name}`,
                image: 'https://cdn-icons-png.flaticon.com/512/5721/5721113.png',
                key: 'rzp_live_TmSPcojj3JfRzH', // Live Razorpay Key ID from backend configuration
                amount: orderRes.data.order.amount,
                currency: 'INR',
                order_id: orderRes.data.order.id,
                name: 'Gift Payment',
                prefill: {
                  email: user?.email || 'user@example.com',
                  contact: '',
                  name: user?.name || 'User',
                  method: 'upi'
                },
                theme: { color: colors.primary }
              };

              // 2. Open Razorpay checkout
              RazorpayCheckout.open(options)
                .then(async (data: any) => {
                  // 3. Verify payment on backend
                  const verifyRes = await api.post('/payments/verify-payment', {
                    razorpay_order_id: data.razorpay_order_id,
                    razorpay_payment_id: data.razorpay_payment_id,
                    razorpay_signature: data.razorpay_signature,
                    amount: amountToPay,
                  });

                  if (verifyRes.data.success) {
                    // Update local wallet balance state with the added amount
                    const newBalance = currentWalletBalance + amountToPay;
                    setCurrentWalletBalance(newBalance);
                    
                    // 4. Send the gift now that payment is successful
                    proceedToSendGift(giftItem, newBalance);
                  } else {
                    Alert.alert('Payment Failed', 'Verification failed.');
                  }
                })
                .catch((err: any) => {
                  console.log('[Razorpay Error]', err);
                  Alert.alert('Payment Cancelled', 'Payment process was interrupted. Gift not sent.');
                });

            } catch (err: any) {
              console.log('[Payment Initialization Error]', err);
              Alert.alert('Error', 'Failed to initialize payment gateway.');
            }
          }
        }
      ]
    );
  };

  const proceedToSendGift = async (giftItem: typeof GIFT_CATALOG[0], walletBeforeDeduction: number) => {
    // Optimistic wallet deduction for immediate UI feedback
    setCurrentWalletBalance((prev: number) => Math.max(0, prev - giftItem.price));

    try {
      const res = await api.post('/messages/send-gift', {
        chatId: chat._id,
        receiverId: otherUserId,
        giftId:    giftItem.id,
        giftName:  giftItem.name,   // Human-readable name
        giftEmoji: giftItem.emoji,  // Emoji for display
        giftPrice: giftItem.price,
        giftImage: '',
      });

      if (res.data.success) {
        playGiftTone();
        // Sync wallet from server (prevents drift from optimistic update)
        if (res.data.walletBalance !== undefined) {
          setCurrentWalletBalance(res.data.walletBalance);
        }
      }
    } catch (error: any) {
      console.log('[ChatScreen] sendGift error:', error);
      // Revert optimistic update on failure
      setCurrentWalletBalance(walletBeforeDeduction);
      Alert.alert(
        'Gift Failed',
        error?.response?.data?.message || 'Could not send gift. Please try again.',
      );
    }
  };

  const handleTypingInput = (text: string) => {
    setInputText(text);
    if (!chat?._id) return;
    if (text.length > 0) {
      socket?.emit('typing', { chatId: chat._id, username: user?.name });
    } else {
      socket?.emit('stop_typing', { chatId: chat._id });
    }
  };

  const formatMessageTime = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  const handleDeleteMessage = (messageId: string, isCallLog = false) => {
    Alert.alert(
      isCallLog ? "Delete Call History" : "Delete Message",
      isCallLog ? "Are you sure you want to delete this call record?" : "Are you sure you want to delete this message?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            // Optimistic UI deletion for instant feedback
            setMessages((prev) => prev.filter((m) => m._id !== messageId));
            try {
              const res = await api.delete(`/messages/${messageId}`);
              if (!res.data.success) {
                console.warn('[ChatScreen] Message delete backend response:', res.data);
              }
            } catch (err: any) {
              console.log('[ChatScreen] Delete message error:', err?.response?.data || err?.message);
            }
          },
        },
      ]
    );
  };

  const renderMessage = ({ item, index }: { item: any, index: number }) => {
    if (!item) return null;
    const senderId = item.sender?._id || item.sender;
    const isMe = senderId === user?._id;
    // With inverted list, the PREVIOUS chronological message is at index + 1
    const showAvatar = !isMe && (index === 0 || (messagesReversed[index - 1] && (messagesReversed[index - 1]?.sender?._id || messagesReversed[index - 1]?.sender) !== senderId));

    return (
      <View style={[styles.messageRow, isMe ? styles.justifyEnd : styles.justifyStart]}>
        {!isMe && (
          <View style={styles.messageAvatarContainer}>
            {showAvatar ? (
              <Image source={{ uri: otherUserAvatar }} style={styles.messageAvatar} />
            ) : (
              <View style={{ width: 28 }} />
            )}
          </View>
        )}
        
        <View style={[styles.messageContent, { marginLeft: isMe ? 0 : 4 }]}>
            <TouchableOpacity 
              activeOpacity={0.9}
              onLongPress={() => handleDeleteMessage(item._id, item.messageType === 'call')}
              style={[
                styles.messageBubble, 
                isMe 
                  ? [styles.myBubble, (item.messageType === 'gift' || item.text.startsWith('GIFT_MESSAGE:')) ? { backgroundColor: 'transparent' } : { backgroundColor: '#1D9BF0' }]
                  : [styles.theirBubble, (item.messageType === 'gift' || item.text.startsWith('GIFT_MESSAGE:')) ? { backgroundColor: 'transparent' } : { backgroundColor: isDark ? '#2D3748' : '#F1F5F9' }]
              ]}
            >
              {item.isLockedMedia ? (
                <View style={{ padding: 10, width: 220, alignItems: 'center' }}>
                  {isMe ? (
                    <View style={{ alignItems: 'center' }}>
                      <Icon name="lock-closed" size={32} color="#F59E0B" />
                      <Text style={{ color: '#FFF', fontWeight: 'bold', marginTop: 4 }}>Locked Photo (₹{item.unlockPrice || 50})</Text>
                      <Text style={{ color: '#94A3B8', fontSize: 11, marginTop: 2 }}>Receiver must unlock to view</Text>
                    </View>
                  ) : item.unlockedBy && item.unlockedBy.includes(user?._id) ? (
                    <TouchableOpacity onPress={() => navigation.navigate('SecureMediaViewer', { mediaUrl: item.mediaUrl, senderName: otherUser?.name })}>
                      <Image source={{ uri: item.mediaUrl?.startsWith('http') ? item.mediaUrl : `${UPLOADS_URL}${item.mediaUrl?.replace('/uploads', '')}` }} style={{ width: 200, height: 200, borderRadius: 12 }} />
                      <Text style={{ color: '#22C55E', fontWeight: 'bold', fontSize: 11, textAlign: 'center', marginTop: 4 }}>Tap to view in Secure Viewer 🔒</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ alignItems: 'center', backgroundColor: '#1E293B', padding: 14, borderRadius: 16, width: '100%' }}>
                      <Icon name="lock-closed" size={36} color="#0066FF" />
                      <Text style={{ color: '#FFF', fontWeight: 'bold', marginTop: 6 }}>Premium Locked Photo</Text>
                      <TouchableOpacity
                        style={{ backgroundColor: '#0066FF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14, marginTop: 10 }}
                        onPress={() => {
                          api.post('/media/unlock', { messageId: item._id }).then(res => {
                            if (res.data.success) {
                              Alert.alert('Unlocked!', 'Photo unlocked successfully. Opening in secure viewer.');
                              navigation.navigate('SecureMediaViewer', { mediaUrl: res.data.mediaUrl, senderName: otherUser?.name });
                            }
                          }).catch(err => {
                            Alert.alert('Unlock Error', err?.response?.data?.message || 'Failed to unlock photo');
                          });
                        }}
                      >
                        <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 13 }}>Unlock for ₹{item.unlockPrice || 50}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ) : item.messageType === 'image' && item.mediaUrl ? (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => {
                    const fullUrl = item.mediaUrl.startsWith('http') ? item.mediaUrl : `${UPLOADS_URL}${item.mediaUrl.replace('/uploads', '')}`;
                    setSelectedImageUri(fullUrl);
                    setViewingImageModal(true);
                  }}
                >
                  <Image 
                    source={{ uri: item.mediaUrl.startsWith('http') ? item.mediaUrl : `${UPLOADS_URL}${item.mediaUrl.replace('/uploads', '')}` }} 
                    style={{ width: windowWidth * 0.60, height: windowWidth * 0.60, borderRadius: 10, marginBottom: 6, backgroundColor: isDark ? '#2D3748' : '#F1F5F9' }} 
                    resizeMode="cover" 
                  />
                  <View style={{ position: 'absolute', right: 8, bottom: 12, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 }}>
                    <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>🔍 Tap to zoom</Text>
                  </View>
                </TouchableOpacity>

              ) : item.messageType === 'gift' || item.text?.startsWith('GIFT_MESSAGE:') ? (
                // ── Premium Gift Bubble ───────────────────────────────
                <View style={[
                  styles.giftBubble,
                  isMe ? styles.giftBubbleMine : styles.giftBubbleTheirs,
                ]}>
                  {/* Sparkle header */}
                  <View style={styles.giftBubbleHeader}>
                    <Text style={styles.giftBubbleLabel}>
                      {isMe ? '🎁 Gift Sent' : '🎉 Gift Received!'}
                    </Text>
                  </View>
                  {/* Big emoji */}
                  <Text style={styles.giftBubbleEmoji}>
                    {item.giftImage || item.giftName || item.text?.replace('GIFT_MESSAGE:', '')}
                  </Text>
                  {/* Gift name */}
                  {item.giftName && (
                    <Text style={styles.giftBubbleName}>{item.giftName}</Text>
                  )}
                  {/* Price badge */}
                  {item.giftPrice > 0 && (
                    <View style={styles.giftPriceBadge}>
                      <Text style={styles.giftPriceText}>₹{item.giftPrice}</Text>
                    </View>
                  )}
                  {/* Sender label */}
                  <Text style={styles.giftSenderLabel}>
                    {isMe
                      ? `To: ${otherUser?.name || 'them'}`
                      : `From: ${item.sender?.name || 'them'}`}
                  </Text>
                </View>
              ) : item.messageType === 'call' ? (
                // ── Call History Bubble ──────────────────────────────
                <View style={[
                  styles.callBubble,
                  isMe ? styles.callBubbleMine : styles.callBubbleTheirs,
                ]}>
                  <View style={styles.callBubbleRow}>
                    <Image
                      source={
                        (item.callStatus === 'missed' || item.callStatus === 'rejected')
                          ? require('../assets/call_end.jpg')
                          : item.callType === 'video'
                          ? require('../assets/call_camera.jpg')
                          : require('../assets/call_mic.jpg')
                      }
                      style={{ width: 28, height: 28, borderRadius: 14 }}
                    />
                    <View style={{ marginLeft: 10, flex: 1 }}>
                      <Text style={[styles.callBubbleTitle, { color: item.callStatus === 'missed' ? '#EF4444' : 'white' }]}>
                        {item.text}
                      </Text>
                      <Text style={styles.callBubbleSub}>
                        {isMe ? 'Outgoing Call' : 'Incoming Call'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={{ padding: 6, marginLeft: 4 }}
                      onPress={() => handleDeleteMessage(item._id, true)}
                    >
                      <Text style={{ fontSize: 16 }}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                  {!isMe && item.callStatus === 'missed' && (
                    <TouchableOpacity
                      style={styles.callBackBtn}
                      onPress={() => {
                        setCallType(item.callType || 'voice');
                        setIsIncomingCall(false);
                        setCallModalVisible(true);
                      }}
                    >
                      <Text style={styles.callBackBtnText}>Call Back</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
              <Text style={[styles.messageText, isMe ? styles.myText : { color: currentColors.text }]}>
                {item.text}
              </Text>
            )}
            
            {/* Embedded timestamp for modern WhatsApp style */}
            <View style={[styles.embeddedMeta, isMe ? styles.metaEnd : styles.metaStart]}>
              <Text style={[styles.timeText, { color: isMe ? 'rgba(255,255,255,0.7)' : currentColors.textMuted }]}>
                {formatMessageTime(item.createdAt || new Date().toISOString())}
              </Text>
              {isMe && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 4 }}>
                  {item.status === 'sending' ? (
                    <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" style={{ transform: [{ scale: 0.6 }] }} />
                  ) : item.status === 'failed' ? (
                    <TouchableOpacity onPress={() => handleSend(item)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.2)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, color: '#EF4444', fontWeight: '800' }}>⚠️ Failed (Tap to retry)</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={{ fontSize: 11, color: item.status === 'seen' ? '#0066FF' : 'rgba(255,255,255,0.7)' }}>
                      {item.status === 'seen' ? '✓✓' : '✓'}
                    </Text>
                  )}
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const messagesReversed = [...messages].reverse();

  if (loading) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: currentColors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: currentColors.textMuted }]}>Loading messages...</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: currentColors.background }]}>
        <Icon name="alert-circle-outline" size={60} color={colors.error} />
        <Text style={[styles.errorText, { color: currentColors.text }]}>{error}</Text>
        <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={initializeChat}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: currentColors.background }]}>
      {/* ── Order Context Header Banner (Zomato style) ── */}
      {Boolean(orderId || restaurantName || riderName) && (
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: isDark ? '#1E293B' : '#EFF6FF',
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderBottomWidth: 1,
          borderBottomColor: '#DBEAFE',
        }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#0066FF', justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
            <Text style={{ fontSize: 16 }}>📦</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? '#FFFFFF' : '#1E293B' }}>
              Order {orderId ? `#${orderId}` : 'Details'}
            </Text>
            <Text style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B' }} numberOfLines={1}>
              {restaurantName ? `Store: ${restaurantName}` : ''} {riderName ? `• Rider: ${riderName}` : ''} {customerName ? `• Customer: ${customerName}` : ''}
            </Text>
          </View>
          {Boolean(orderStatus) && (
            <View style={{ backgroundColor: '#DBEAFE', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: '#0066FF' }}>
                {String(orderStatus).replace(/_/g, ' ')}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ── Fullscreen Interactive Photo Viewer Modal ── */}
      <Modal
        visible={viewingImageModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setViewingImageModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' }}>
          <SafeAreaView style={{ position: 'absolute', top: 10, right: 16, zIndex: 10 }}>
            <TouchableOpacity
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center' }}
              onPress={() => setViewingImageModal(false)}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: 'bold' }}>✕</Text>
            </TouchableOpacity>
          </SafeAreaView>

          {selectedImageUri && (
            <Image
              source={{ uri: selectedImageUri }}
              style={{ width: windowWidth, height: '80%' }}
              resizeMode="contain"
            />
          )}

          <View style={{ position: 'absolute', bottom: 30, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>
              📷 Photo Viewer • {otherUser?.name || 'Partner'}
            </Text>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isMenuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity 
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-start', alignItems: 'flex-end' }} 
          activeOpacity={1} 
          onPress={() => setMenuVisible(false)}
        >
          <View style={{ backgroundColor: currentColors.surface, marginTop: 50, marginRight: 16, borderRadius: 8, padding: 8, minWidth: 160, elevation: 5, shadowColor: '#000', shadowOffset: { width: windowWidth * 0.00, height: windowWidth * 0.01 }, shadowOpacity: 0.25, shadowRadius: 3.84 }}>
            <TouchableOpacity style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: currentColors.border }} onPress={() => { 
              setMenuVisible(false); 
              navigation.navigate('ProfileDetails', { profileId: otherUserId }); 
            }}>
              <Text style={{ color: currentColors.text, fontSize: 16 }}>View Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: currentColors.border }} onPress={() => { 
              setMenuVisible(false); 
              Alert.alert(
                "Clear Chat",
                "Are you sure you want to clear this chat history for yourself?",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Clear", style: "destructive", onPress: async () => {
                      try {
                        console.log(`[Clear Chat] Attempting to clear chat: ${chat?._id}`);
                        await api.post(`/chats/${chat._id}/clear`);
                        setMessages([]);
                        Alert.alert("Success", "Chat cleared.");
                      } catch (err: any) {
                        console.error('[Clear Chat Error]', err.response?.data || err.message);
                        Alert.alert("Error", `Could not clear chat: ${err.response?.data?.message || err.message}`);
                      }
                  }}
                ]
              );
            }}>
              <Text style={{ color: currentColors.text, fontSize: 16 }}>Clear Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: currentColors.border }} onPress={() => { 
              setMenuVisible(false); 
              Alert.alert(
                "Block User",
                "Are you sure you want to block this user? You will not be able to send or receive messages.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Block", style: "destructive", onPress: async () => {
                      try {
                        await api.post(`/users/block/${otherUserId}`);
                        Alert.alert("Success", "User has been blocked.");
                        navigation.goBack();
                      } catch (err) {
                        Alert.alert("Error", "Could not block user.");
                      }
                  }}
                ]
              );
            }}>
              <Text style={{ color: colors.error, fontSize: 16, fontWeight: 'bold' }}>Block User</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ padding: 12 }} onPress={() => { 
              setMenuVisible(false); 
              Alert.alert(
                "Unblock User",
                "Are you sure you want to unblock this user?",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Unblock", style: "default", onPress: async () => {
                      try {
                        await api.post(`/users/unblock/${otherUserId}`);
                        Alert.alert("Success", "User has been unblocked.");
                      } catch (err) {
                        Alert.alert("Error", "Could not unblock user.");
                      }
                  }}
                ]
              );
            }}>
              <Text style={{ color: colors.success, fontSize: 16, fontWeight: 'bold' }}>Unblock User</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={isGiftModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => { setGiftModalVisible(false); setSelectedGift(null); }}
      >
        <View style={styles.giftModalOverlay}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => { setGiftModalVisible(false); setSelectedGift(null); }}
          />
          <View style={[styles.giftModalContent, { backgroundColor: currentColors.surface }]}>
            <View style={[styles.giftDragHandle, { backgroundColor: currentColors.border }]} />
            <View style={styles.giftModalHeader}>
              <View>
                <Text style={[styles.giftModalTitle, { color: currentColors.text }]}>🎁 Send a Gift</Text>
                <Text style={{ color: currentColors.textMuted, fontSize: 12, marginTop: 2 }}>
                  Wallet Balance: ₹{currentWalletBalance}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => { setGiftModalVisible(false); setSelectedGift(null); }}
                style={styles.giftCloseBtn}
              >
                <Icon name="close" size={20} color={currentColors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.giftGrid}>
              {GIFT_CATALOG.map((gift) => {
                const isSelected = selectedGift?.id === gift.id;
                const canAfford = currentWalletBalance >= gift.price;
                return (
                  <TouchableOpacity
                    key={gift.id}
                    style={[
                      styles.giftItem,
                      {
                        borderColor: isSelected ? '#A855F7' : currentColors.border,
                        backgroundColor: isSelected
                          ? (isDark ? '#2D1B4E' : '#F5F0FF')
                          : currentColors.surface,
                        opacity: canAfford ? 1 : 0.45,
                        borderWidth: isSelected ? 2 : 1,
                      },
                    ]}
                    onPress={() => {
                      if (canAfford) setSelectedGift(gift);
                      else {
                        setSelectedGift(gift);
                        sendGift(gift);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.giftEmoji}>{gift.emoji}</Text>
                    <Text style={[styles.giftItemName, { color: currentColors.text }]}>{gift.name}</Text>
                    <View style={[styles.giftPriceTag, { backgroundColor: canAfford ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)' }]}>
                      <Text style={[styles.giftPriceTagText, { color: canAfford ? '#16A34A' : '#EF4444' }]}>
                        ₹{gift.price}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[
                styles.giftSendBtn,
                {
                  backgroundColor: selectedGift ? '#0066FF' : currentColors.border,
                  opacity: selectedGift ? 1 : 0.6,
                },
              ]}
              onPress={() => selectedGift && sendGift(selectedGift)}
              disabled={!selectedGift}
              activeOpacity={0.85}
            >
              <Text style={styles.giftSendBtnText}>
                {selectedGift
                  ? `Send ${selectedGift.emoji} ${selectedGift.name} — ₹${selectedGift.price}`
                  : 'Select a Gift to Send'}
              </Text>
            </TouchableOpacity>

            <Text style={[styles.giftDisclaimer, { color: currentColors.textMuted }]}>
              ₹ is deducted from your wallet. Receiver earns the full amount.
            </Text>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isPaymentModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setPaymentModalVisible(false)}
      >
        <View style={styles.giftModalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setPaymentModalVisible(false)} />
          <View style={[styles.giftModalContent, { backgroundColor: currentColors.surface }]}>
            <View style={[styles.giftDragHandle, { backgroundColor: currentColors.border }]} />
            <View style={styles.giftModalHeader}>
              <Text style={[styles.giftModalTitle, { color: currentColors.text }]}>Send Payment (UPI / PhonePe)</Text>
              <TouchableOpacity onPress={() => setPaymentModalVisible(false)} style={[styles.giftCloseBtn, { backgroundColor: currentColors.grayBg }]}>
                <Icon name="close" size={20} color={currentColors.text} />
              </TouchableOpacity>
            </View>
            <View style={{ marginBottom: 20 }}>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: currentColors.border,
                  borderRadius: 12,
                  padding: 16,
                  fontSize: 24,
                  fontWeight: 'bold',
                  color: currentColors.text,
                  textAlign: 'center'
                }}
                placeholder="₹ Amount"
                placeholderTextColor={currentColors.placeholder}
                keyboardType="numeric"
                value={paymentAmount}
                onChangeText={setPaymentAmount}
              />
            </View>
            <TouchableOpacity 
              style={[styles.giftSendBtn, { backgroundColor: paymentAmount.trim() ? colors.primary : currentColors.border }]}
              disabled={!paymentAmount.trim()}
              onPress={handleDirectPayment}
            >
              <Text style={styles.giftSendBtnText}>Pay & Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 80}
        style={[styles.keyboardAvoid, { paddingBottom: Platform.OS === 'android' && keyboardHeight === 0 ? insets.bottom : 0 }]}
      >
        <FlatList
          ref={flatListRef}
          data={messagesReversed}
          inverted={true}
          keyExtractor={item => item._id || Math.random().toString()}
          renderItem={renderMessage}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
        
        {isTyping && (
          <View style={styles.typingContainer}>
            <View style={[styles.typingBubble, { backgroundColor: isDark ? '#2D3748' : '#F1F5F9' }]}>
              <Text style={{ color: currentColors.textMuted }}>typing...</Text>
            </View>
          </View>
        )}
        
        {/* ── Quick Response Chips Bar (Zomato-Style) ── */}
        <View style={{ backgroundColor: currentColors.surface, borderTopWidth: 1, borderTopColor: currentColors.border, paddingVertical: 6 }}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={quickSuggestions}
            keyExtractor={(item, index) => `${index}_${item}`}
            contentContainerStyle={{ paddingHorizontal: 10, gap: 8 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={{
                  backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: isDark ? '#334155' : '#E2E8F0',
                }}
                onPress={() => handleQuickSend(item)}
                activeOpacity={0.75}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: currentColors.text }}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        </View>

        {/* Labeled Quick Actions Bar */}
        <View style={[
          { 
            flexDirection: 'row', 
            justifyContent: 'space-around', 
            alignItems: 'center', 
            paddingVertical: 6, 
            paddingHorizontal: 8, 
            borderTopWidth: StyleSheet.hairlineWidth, 
            borderTopColor: currentColors.border,
            backgroundColor: currentColors.surface 
          }
        ]}>
          <TouchableOpacity
            style={{ alignItems: 'center', flex: 1 }}
            activeOpacity={0.7}
            onPress={() => {
              setCallType('voice');
              setIsIncomingCall(false);
              setCallModalVisible(true);
            }}
          >
            <Image
              source={require('../assets/generated_icons/voice_call_icon.jpg')}
              style={{ width: windowWidth * 0.065, height: windowWidth * 0.065, borderRadius: 8 }}
            />
            <Text style={{ fontSize: 9, fontWeight: '700', color: currentColors.text, marginTop: 2 }}>Voice Call</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ alignItems: 'center', flex: 1 }}
            activeOpacity={0.7}
            onPress={() => {
              setCallType('video');
              setIsIncomingCall(false);
              setCallModalVisible(true);
            }}
          >
            <Image
              source={require('../assets/generated_icons/video_call_icon.jpg')}
              style={{ width: windowWidth * 0.065, height: windowWidth * 0.065, borderRadius: 8 }}
            />
            <Text style={{ fontSize: 9, fontWeight: '700', color: currentColors.text, marginTop: 2 }}>Video Call</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={{ alignItems: 'center', flex: 1 }} 
            activeOpacity={0.7} 
            onPress={handleTakePhoto}
          >
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: 16 }}>📷</Text>
            </View>
            <Text style={{ fontSize: 9, fontWeight: '700', color: '#0066FF', marginTop: 2 }}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={{ alignItems: 'center', flex: 1 }} 
            activeOpacity={0.7} 
            onPress={handlePickImage}
          >
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#F0FDF4', justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: 16 }}>🖼️</Text>
            </View>
            <Text style={{ fontSize: 9, fontWeight: '700', color: '#16A34A', marginTop: 2 }}>Gallery</Text>
          </TouchableOpacity>
        </View>

        <View style={[
            styles.inputContainer, 
            { 
              backgroundColor: currentColors.surface,
              paddingBottom: Platform.OS === 'ios' && keyboardHeight === 0 ? insets.bottom : spacing.sm 
            }
          ]}>
          
          <TouchableOpacity
            style={{ padding: 6, marginRight: 4 }}
            onPress={handleTakePhoto}
            activeOpacity={0.75}
          >
            <Text style={{ fontSize: 20 }}>📷</Text>
          </TouchableOpacity>

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? currentColors.border : currentColors.grayBg,
                color: currentColors.text
              }
            ]}
            placeholder="Type a message or attach photo..."
            placeholderTextColor={currentColors.placeholder}
            value={inputText}
            onChangeText={handleTypingInput}
            onFocus={() => {
              scrollToBottom();
            }}
            multiline
          />
          
          <TouchableOpacity 
            style={[
              styles.sendButton, 
              { backgroundColor: inputText.trim() ? '#0066FF' : 'transparent', justifyContent: 'center', alignItems: 'center', borderRadius: 20, width: 38, height: 38, opacity: inputText.trim() ? 1 : 0.5 }
            ]}
            onPress={handleSend}
            disabled={!inputText.trim()}
            activeOpacity={0.8}
          >
            <Icon name="send" size={20} color={inputText.trim() ? '#FFFFFF' : colors.primary} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <WebRTCCallModal
        visible={isCallModalVisible}
        onClose={() => setCallModalVisible(false)}
        socket={socket}
        user={user}
        otherUser={isIncomingCall && incomingCallerUser ? incomingCallerUser : otherUser}
        isIncomingCall={isIncomingCall}
        incomingOffer={incomingOffer}
        callType={callType}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: typography.sizes.md,
  },
  errorText: {
    marginTop: spacing.md,
    fontSize: typography.sizes.md,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retryBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  retryText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: typography.sizes.md,
  },
  customHeaderTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '80%',
  },
  headerAvatar: {
    width: windowWidth * 0.10, height: windowWidth * 0.10,
    borderRadius: 19,
    marginRight: spacing.sm,
  },
  headerName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  onlineText: {
    fontSize: 11,
    fontWeight: typography.weights.medium,
    marginTop: 1,
  },
  headerRightBtn: {
    padding: spacing.sm,
  },
  keyboardAvoid: {
    flex: 1,
  },
  listContent: {
    padding: spacing.md,
    paddingTop: spacing.lg,
  },
  messageRow: {
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  justifyEnd: {
    justifyContent: 'flex-end',
  },
  justifyStart: {
    justifyContent: 'flex-start',
  },
  messageAvatarContainer: {
    width: 28,
    marginRight: spacing.xs,
  },
  messageAvatar: {
    width: windowWidth * 0.07, height: windowWidth * 0.07,
    borderRadius: 14,
  },
  messageContent: {
    maxWidth: '80%',
  },
  messageBubble: {
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    paddingBottom: 8,
    borderRadius: radius.lg,
    minWidth: 80,
  },
  myBubble: {
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: typography.sizes.md,
    lineHeight: 22,
    marginBottom: 4,
  },
  myText: {
    color: 'white',
  },
  embeddedMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    marginTop: -2,
  },
  metaEnd: {
    justifyContent: 'flex-end',
  },
  metaStart: {
    justifyContent: 'flex-start',
  },
  timeText: {
    fontSize: 10,
    fontWeight: '500',
  },
  statusIcon: {
    marginLeft: 4,
  },
  typingContainer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    flexDirection: 'row',
  },
  typingBubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.xl,
  },
  typingText: {
    fontSize: typography.sizes.sm,
    fontStyle: 'italic',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  attachButton: {
    padding: spacing.sm,
    marginBottom: 4,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 20,
    fontSize: typography.sizes.md,
    marginHorizontal: spacing.xs,
    marginBottom: 6,
  },
  sendButton: {
    width: windowWidth * 0.09, height: windowWidth * 0.09,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    marginLeft: spacing.xs,
  },
  giftModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  giftModalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    minHeight: 300,
  },
  giftDragHandle: {
    width: windowWidth * 0.10, height: windowWidth * 0.01,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  giftModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  giftModalTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: '700',
  },
  giftCloseBtn: {
    padding: 6,
    borderRadius: 16,
  },
  giftGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  giftItem: {
    width: '13%',
    aspectRatio: 0.85,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  giftEmoji: {
    fontSize: 30,
  },
  giftItemName: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 3,
    textAlign: 'center',
  },
  giftPriceTag: {
    marginTop: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  giftPriceTagText: {
    fontSize: 9,
    fontWeight: '700',
  },
  giftSendBtn: {
    marginTop: spacing.xs,
    paddingVertical: 14,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  giftSendBtnText: {
    color: 'white',
    fontWeight: '700',
    fontSize: typography.sizes.md,
  },
  giftDisclaimer: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  // ── Gift Chat Bubble ─────────────────────────────────
  giftBubble: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.xl,
    minWidth: 140,
    overflow: 'hidden',
  },
  giftBubbleMine: {
    backgroundColor: '#4C1D95', // Deep purple for sender
  },
  giftBubbleTheirs: {
    backgroundColor: '#1E1B4B', // Indigo for receiver
  },
  giftBubbleHeader: {
    marginBottom: 4,
  },
  giftBubbleLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DDD6FE', // Light lavender
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  giftBubbleEmoji: {
    fontSize: 56,
    marginVertical: 4,
  },
  giftBubbleName: {
    fontSize: typography.sizes.md,
    fontWeight: '700',
    color: 'white',
    marginBottom: 4,
  },
  giftPriceBadge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.full,
    marginVertical: 4,
  },
  giftPriceText: {
    color: 'white',
    fontWeight: '800',
    fontSize: typography.sizes.sm,
  },
  giftSenderLabel: {
    fontSize: 11,
    color: '#C4B5FD', // Light purple
    marginTop: 4,
    fontStyle: 'italic',
  },
  // ── Call Message Bubble Styles ─────────────
  callBubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    minWidth: 190,
  },
  callBubbleMine: {
    backgroundColor: '#1E293B',
  },
  callBubbleTheirs: {
    backgroundColor: '#0F172A',
  },
  callBubbleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  callBubbleTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
  },
  callBubbleSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  callBackBtn: {
    marginTop: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: radius.md,
    paddingVertical: 6,
    alignItems: 'center',
  },
  callBackBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
  },
});

export default ChatScreen;
