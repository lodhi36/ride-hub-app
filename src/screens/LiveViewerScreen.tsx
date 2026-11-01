import React, { useEffect, useState, useRef } from 'react';
import { Dimensions, View, Text, TouchableOpacity, StyleSheet, TextInput, FlatList, Animated, Easing, Keyboard, Platform, Alert, Image, Modal, ScrollView, StatusBar } from 'react-native';
import { mediaDevices, RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, MediaStream } from 'react-native-webrtc';
import Icon from '../components/PngIcon';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import api, { UPLOADS_URL } from '../services/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RazorpayCheckout from 'react-native-razorpay';

const windowWidth = Dimensions.get('window').width;

const peerConstraints = {
  iceServers: [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.twilio.com:3478' },
  ],
};

const ImageIcon = ({ source, size = 20, style, tintColor, circular }: any) => (
  <Image 
    source={source} 
    style={[
      { width: size, height: size, resizeMode: 'cover' }, 
      circular ? { borderRadius: size / 2 } : null,
      tintColor ? { tintColor } : null, 
      style
    ]} 
  />
);

const IMG_ICONS = {
  close: require('../assets/generated_icons/end_call_icon.jpg'),
  mic: require('../assets/generated_icons/mic_icon.jpg'),
  call: require('../assets/generated_icons/voice_call_icon.jpg'),
  send: require('../assets/send_17972127.png'),
  back: require('../assets/icons/back_arrow.png'),
  crown: require('../assets/icons/crown.png'),
};

const LiveViewerScreen = ({ route, navigation }: any) => {
  const { broadcasterId, broadcasterName } = route.params || {};
  const { socket } = useSocket();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const [viewers, setViewers] = useState(0);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const pc = useRef<any>(null);
  const pendingIceCandidates = useRef<any[]>([]);
  const remoteStreamRef = useRef<any>(null);

  // Request to Speak & Speaker Session State
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestType, setRequestType] = useState<'normal' | 'priority'>('normal');
  const [priorityAmount, setPriorityAmount] = useState('10');
  const [paymentLoading, setPaymentLoading] = useState(false);

  const [inQueueStatus, setInQueueStatus] = useState<string | null>(null);
  const [isSpeakerActive, setIsSpeakerActive] = useState(false);
  const [sessionTimeLeft, setSessionTimeLeft] = useState<number>(0);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const localMicStreamRef = useRef<any>(null);

  // Token Gifting State
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [activeGiftBanner, setActiveGiftBanner] = useState<any>(null);
  const [selectedGiftKey, setSelectedGiftKey] = useState<string | null>(null);
  const [customGiftAmount, setCustomGiftAmount] = useState('');

  const broadcasterIdStr = typeof broadcasterId === 'object' ? (broadcasterId._id || broadcasterId.id || broadcasterId)?.toString() : broadcasterId?.toString();
  const currentUserIdStr = user?._id?.toString();
  const hasNavigatedBack = useRef(false);

  const navigateBackOnce = () => {
    if (hasNavigatedBack.current) return;
    hasNavigatedBack.current = true;
    try {
      navigation.navigate('CustomerHomeScreen');
    } catch (e) {
      console.warn('[Viewer] navigation to Home failed:', e);
      try {
        navigation.goBack();
      } catch (err) {}
    }
  };

  // Call duration rule: ₹1–₹10 -> 1 min, ₹11–₹99 -> 2 min, ₹100+ -> 5 min
  const getCallDuration = (amountStr: string) => {
    const amount = Number(amountStr);
    if (!amount || amount <= 0) return 0;
    if (amount <= 10) return 1;
    if (amount <= 99) return 2;
    return 5;
  };

  useEffect(() => {
    // Acquire the microphone stream early so it's ready when WebRTC offer arrives
    const initializeMicStream = async () => {
      try {
        const micStream: any = await mediaDevices.getUserMedia({ audio: true, video: false });
        micStream.getAudioTracks().forEach((t: any) => { t.enabled = false; }); // Start muted
        localMicStreamRef.current = micStream;
        console.log('[Viewer] Microphone stream initialized (muted)');
      } catch (err) {
        console.warn('[Viewer] Failed to acquire microphone stream early:', err);
      }
    };
    initializeMicStream();

    if (socket && broadcasterIdStr) {
      socket.emit('join_live', { broadcasterId: broadcasterIdStr, viewerDetails: { id: currentUserIdStr, name: user?.name } });
      socket.emit('request_webrtc_stream', { broadcasterId: broadcasterIdStr, viewerId: currentUserIdStr });

      socket.on('viewer_joined', ({ viewersCount }: any) => setViewers(viewersCount));
      socket.on('viewer_left', ({ viewersCount }: any) => setViewers(viewersCount));

      socket.on('stream_ended', () => {
        handleStopSpeakerMic();
        Alert.alert('Live Stream Ended', 'The Host has ended this live session.', [
          { text: 'OK', onPress: () => navigateBackOnce() }
        ]);
        setTimeout(() => {
          navigateBackOnce();
        }, 1200);
      });

      socket.on('live_chat_message', (msg: any) => {
        setMessages(prev => [...prev.slice(-30), msg]); // Keep last 30 messages for performance
      });

      socket.on('live_token_received', (data: any) => {
        setActiveGiftBanner(data);
        setTimeout(() => setActiveGiftBanner(null), 4000);
      });

      socket.on('user_queue_status', ({ status, isPriority, plan }: any) => {
        setInQueueStatus(isPriority ? '⚡ Priority Queue Active' : 'Normal Queue Active');
        setRequestType(isPriority ? 'priority' : 'normal');
        if (plan && plan.price) {
          setPriorityAmount(plan.price.toString());
        }
      });

      socket.on('speak_request_accepted', ({ durationSeconds }: any) => {
        setInQueueStatus(null);
        setIsSpeakerActive(true);
        setSessionTimeLeft(durationSeconds || 60);

        // Turn ON Viewer Microphone
        if (localMicStreamRef.current) {
          localMicStreamRef.current.getAudioTracks().forEach((t: any) => { t.enabled = true; });
          console.log('[Viewer] Speak request accepted: unmuted mic track');
        }
      });

      socket.on('speak_request_rejected', () => {
        setInQueueStatus(null);
        Alert.alert('Request Status', 'Host declined your speak request.');
      });

      socket.on('speaker_removed', ({ speakerId }: any) => {
        if (speakerId === currentUserIdStr) {
          if (localMicStreamRef.current) {
            localMicStreamRef.current.getAudioTracks().forEach((t: any) => { t.enabled = false; });
          }
          setIsSpeakerActive(false);
          setSessionTimeLeft(0);
          Alert.alert('Speaker Session Ended', 'Your speak session has ended.');
        }
      });

      socket.on('speaker_muted_status', ({ speakerId, isMuted }: any) => {
        if (speakerId === currentUserIdStr) {
          setIsMicMuted(isMuted);
          if (localMicStreamRef.current) {
            localMicStreamRef.current.getAudioTracks().forEach((t: any) => { t.enabled = !isMuted; });
          }
        }
      });

      // Pure Audio WebRTC Listener
      socket.on('webrtc_offer', async ({ offer, senderId }: any) => {
        if (pc.current) { try { pc.current.close(); } catch (e) {} }

        // Make sure mic stream is initialized
        if (!localMicStreamRef.current) {
          try {
            const micStream: any = await mediaDevices.getUserMedia({ audio: true, video: false });
            micStream.getAudioTracks().forEach((t: any) => { t.enabled = false; }); // Start muted
            localMicStreamRef.current = micStream;
          } catch (err) {
            console.warn('[Viewer] Could not acquire microphone stream in offer:', err);
          }
        }

        const peerConnection: any = new RTCPeerConnection(peerConstraints);
        pc.current = peerConnection;

        // Add local mic stream to peer connection (so bidirectional audio works)
        if (localMicStreamRef.current) {
          localMicStreamRef.current.getAudioTracks().forEach((track: any) => {
            peerConnection.addTrack(track, localMicStreamRef.current);
          });
        } else {
          try {
            peerConnection.addTransceiver('audio', { direction: 'sendrecv' });
          } catch (e) {}
        }

        peerConnection.onicecandidate = (event: any) => {
          if (event.candidate) {
            socket.emit('webrtc_ice_candidate', { targetUserId: broadcasterIdStr, candidate: event.candidate, senderId: currentUserIdStr });
          }
        };

        peerConnection.ontrack = (event: any) => {
          let streamToUse = (event.streams && event.streams[0]) ? event.streams[0] : null;
          if (!streamToUse && event.track) {
            streamToUse = new MediaStream([event.track]);
          }
          if (streamToUse) {
            streamToUse.getTracks().forEach((t: any) => { t.enabled = true; });
            remoteStreamRef.current = streamToUse;
            setRemoteStream(streamToUse);
          }
        };

        try {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
          while (pendingIceCandidates.current.length > 0) {
            const cand = pendingIceCandidates.current.shift();
            try { await peerConnection.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
          }
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          socket.emit('webrtc_answer', { targetUserId: broadcasterIdStr, answer, senderId: currentUserIdStr });
        } catch (err) { console.warn('Error handling offer:', err); }
      });

      socket.on('webrtc_ice_candidate', async ({ candidate, senderId }: any) => {
        if (pc.current && pc.current.remoteDescription) {
          try { await pc.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {}
        } else {
          pendingIceCandidates.current.push(candidate);
        }
      });
    }

    return () => {
      handleStopSpeakerMic();
      
      if (remoteStreamRef.current) {
        try {
          remoteStreamRef.current.getTracks().forEach((t: any) => {
            t.enabled = false;
            t.stop();
          });
        } catch (e) {
          console.warn('[Viewer] Error stopping remote stream tracks:', e);
        }
        remoteStreamRef.current = null;
      }
      setRemoteStream(null);

      if (pc.current) {
        try {
          pc.current.getSenders().forEach((sender: any) => {
            if (sender.track) {
              sender.track.stop();
            }
          });
          pc.current.getReceivers().forEach((receiver: any) => {
            if (receiver.track) {
              receiver.track.stop();
            }
          });
          pc.current.close();
        } catch (e) {
          console.warn('[Viewer] Error closing peer connection:', e);
        }
        pc.current = null;
      }

      if (socket) {
        socket.off('viewer_joined');
        socket.off('viewer_left');
        socket.off('stream_ended');
        socket.off('live_chat_message');
        socket.off('live_token_received');
        socket.off('user_queue_status');
        socket.off('speak_request_accepted');
        socket.off('speak_request_rejected');
        socket.off('speaker_removed');
        socket.off('speaker_muted_status');
        socket.off('webrtc_offer');
        socket.off('webrtc_ice_candidate');
      }

      if (broadcasterIdStr && socket) {
        socket.emit('leave_live', { broadcasterId: broadcasterIdStr });
      }
    };
  }, [broadcasterIdStr]);

  // Session timer countdown
  useEffect(() => {
    let timer: any;
    if (isSpeakerActive && sessionTimeLeft > 0) {
      timer = setInterval(() => {
        setSessionTimeLeft(prev => {
          if (prev <= 1) {
            handleStopSpeakerMic();
            setIsSpeakerActive(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isSpeakerActive, sessionTimeLeft]);

  const handleStopSpeakerMic = () => {
    if (localMicStreamRef.current) {
      localMicStreamRef.current.getTracks().forEach((t: any) => { t.enabled = false; t.stop(); });
      localMicStreamRef.current = null;
    }
  };

  const handleSendSpeakRequest = async () => {
    if (requestType === 'normal') {
      // Normal Request - Free, placed in normal queue
      socket?.emit('voice_speak_request', {
        broadcasterId: broadcasterIdStr,
        viewerId: currentUserIdStr,
        viewerName: user?.name,
        viewerAvatar: user?.profilePicture,
        isPriority: false,
      });
      setInQueueStatus('Normal Queue Active');
      setShowRequestModal(false);
      Alert.alert('Request Sent', 'Your speak request was sent to the Host. Waiting in the standard queue...');
    } else {
      // Priority Request - Razorpay payment then server verification
      const amt = Number(priorityAmount);
      if (isNaN(amt) || amt <= 0) {
        Alert.alert('Invalid Amount', 'Please enter a valid amount.');
        return;
      }

      try {
        setPaymentLoading(true);

        // Step 1: Create Razorpay order on backend
        let initRes: any;
        try {
          initRes = await api.post('/live/priority-request/initiate', {
            broadcasterId: broadcasterIdStr,
            amount: amt,
          });
        } catch (apiErr: any) {
          setPaymentLoading(false);
          console.error('[Priority] initiate API error:', apiErr?.response?.data || apiErr?.message);
          Alert.alert(
            'Server Error',
            apiErr?.response?.data?.message || `Cannot reach server. Check connection.\nURL: ${apiErr?.config?.baseURL}${apiErr?.config?.url}`
          );
          return;
        }

        if (!initRes.data.success) {
          setPaymentLoading(false);
          Alert.alert('Payment Error', initRes.data.message || 'Failed to initialize payment.');
          return;
        }

        const { liveRequestId, order, keyId } = initRes.data;
        console.log('[Priority] Order created:', order.id, '| keyId:', keyId);

        // Step 2: Open Razorpay — close modal just before
        setPaymentLoading(false);
        setShowRequestModal(false);

        const options = {
          description: 'Voice Studio Priority Speak Pass',
          image: 'https://cdn.razorpay.com/logos/HhKz37WpYqB2N8_medium.png',
          currency: order.currency || 'INR',
          key: keyId,
          amount: order.amount,       // already in paise from server
          name: 'Priority Speak',
          order_id: order.id,
          prefill: {
            email: user?.email || 'user@example.com',
            contact: (user as any)?.phoneNumber || '9999999999',
            name: user?.name || 'User',
          },
          theme: { color: '#0066FF' },
        };

        RazorpayCheckout.open(options)
          .then(async (paymentData: any) => {
            try {
              console.log('[Priority] Payment success, verifying...');
              // Step 3: Server-side signature verification
              const verifyRes = await api.post('/live/priority-request/verify', {
                liveRequestId,
                razorpay_order_id: paymentData.razorpay_order_id,
                razorpay_payment_id: paymentData.razorpay_payment_id,
                razorpay_signature: paymentData.razorpay_signature,
              });

              if (verifyRes.data.success) {
                setInQueueStatus('⚡ Priority Queue Active');
                Alert.alert('⚡ Priority Activated!', 'Payment verified! You have been moved to the top of the queue.');
              } else {
                Alert.alert('Verification Error', verifyRes.data.message || 'Verification failed on server.');
              }
            } catch (verifyErr: any) {
              console.error('[Priority] verify error:', verifyErr?.response?.data || verifyErr?.message);
              Alert.alert('Verification Error', verifyErr?.response?.data?.message || 'Payment verification failed.');
            }
          })
          .catch((rzpErr: any) => {
            console.log('[Priority] Razorpay cancelled/error:', rzpErr);
            // code 0 = user manually cancelled — not an error
            if (rzpErr?.code !== 0) {
              Alert.alert('Payment Failed', rzpErr?.description || 'Something went wrong with the payment.');
            }
          });
      } catch (err: any) {
        setPaymentLoading(false);
        console.error('[Priority] Unexpected error:', err);
        Alert.alert('Error', err?.response?.data?.message || 'Failed to create payment order.');
      }
    }
  };

  // Gift tap → directly open Razorpay (no extra confirm button)
  const handleSendToken = async (amount: number, giftName: string, giftEmoji: string) => {
    const giftKey = `${giftName}-${amount}`;
    setSelectedGiftKey(giftKey);
    try {
      // Step 1: Initiate gift purchase on backend
      const initRes = await api.post('/live/gift/initiate', {
        broadcasterId: broadcasterIdStr,
        amount,
        giftName,
        giftEmoji,
      });

      setSelectedGiftKey(null);

      if (!initRes.data.success) {
        Alert.alert('Payment Error', initRes.data.message || 'Failed to initialize payment.');
        return;
      }

      const { order, keyId } = initRes.data;

      // Step 2: Close modal & open Razorpay immediately
      setShowTokenModal(false);

      const options = {
        description: `Send ${giftEmoji} ${giftName} to broadcaster`,
        image: 'https://cdn.razorpay.com/logos/HhKz37WpYqB2N8_medium.png',
        currency: order.currency,
        key: keyId,
        amount: order.amount,
        name: 'Dating App Gifting',
        order_id: order.id,
        prefill: {
          email: user?.email || 'user@example.com',
          contact: (user as any)?.phoneNumber || '9999999999',
          name: user?.name || 'User',
        },
        theme: { color: '#F59E0B' },
      };

      RazorpayCheckout.open(options)
        .then(async (paymentData: any) => {
          try {
            // Step 3: Verify payment on backend
            const verifyRes = await api.post('/live/gift/verify', {
              broadcasterId: broadcasterIdStr,
              amount,
              giftName,
              giftEmoji,
              razorpay_order_id: paymentData.razorpay_order_id,
              razorpay_payment_id: paymentData.razorpay_payment_id,
              razorpay_signature: paymentData.razorpay_signature,
            });
            if (verifyRes.data.success) {
              Alert.alert('🎁 Gift Sent!', `${giftEmoji} ${giftName} sent to Host successfully!`);
            } else {
              Alert.alert('Verification Error', 'Server verification failed.');
            }
          } catch (err: any) {
            Alert.alert('Verification Error', err.response?.data?.message || 'Payment verification failed.');
          }
        })
        .catch((rzpErr: any) => {
          console.log('[Gift] Razorpay cancelled/error:', JSON.stringify(rzpErr));
          // code 0 = user manually cancelled — not an error
          if (rzpErr?.code !== 0) {
            Alert.alert(
              'Payment Failed',
              rzpErr?.description || rzpErr?.error?.description || 'Something went wrong with the payment. Please try again.'
            );
          }
        });
    } catch (err: any) {
      setSelectedGiftKey(null);
      Alert.alert('Error', err.response?.data?.message || 'Failed to create payment order.');
    }
  };

  // Custom amount gift via Razorpay
  const handleCustomGiftPayment = () => {
    const amt = Number(customGiftAmount);
    if (!amt || amt <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }
    handleSendToken(amt, 'Custom Gift', '💝');
    setCustomGiftAmount('');
  };

  const handleSendMessage = () => {
    if (!input.trim()) return;
    const msg = { senderName: user?.name || 'User', text: input.trim() };
    setMessages(prev => [...prev, msg]);
    socket?.emit('live_chat_message', { broadcasterId: broadcasterIdStr, message: msg });
    setInput('');
  };

  const calculatedDuration = getCallDuration(priorityAmount);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar hidden={false} barStyle="light-content" backgroundColor="transparent" translucent={false} />
      {/* Dynamic Ambient Glow Blob */}
      <View style={styles.glowBlob} />

      {/* Studio Header */}
      <View style={styles.header}>
        <View style={styles.liveBadge}>
          <View style={styles.pulseDot} />
          <Text style={styles.liveText}>VOICE STUDIO LIVE</Text>
        </View>

        <View style={styles.headerRight}>
          <View style={styles.statBadge}>
            <Text style={{ fontSize: 14, marginRight: 2 }}>👁️</Text>
            <Text style={styles.statText}>{viewers}</Text>
          </View>
          <TouchableOpacity onPress={() => navigateBackOnce()} style={styles.closeBtn}>
            <ImageIcon source={IMG_ICONS.close} size={28} circular />
          </TouchableOpacity>
        </View>
      </View>

      {/* Center Voice Stage */}
      <View style={styles.centerStage}>
        <View style={styles.avatarRingOuter}>
          <Image
            source={{ uri: 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png' }}
            style={styles.hostAvatar}
          />
          <View style={styles.micBadgeHost}>
            <ImageIcon source={IMG_ICONS.mic} size={18} circular />
          </View>
        </View>

        <Text style={styles.hostName}>{broadcasterName || 'Host'}'s Voice Studio</Text>
        <Text style={styles.hostStatus}>🎙️ Live Voice Room Active</Text>

        {/* Active Speaker Mode for Viewer */}
        {isSpeakerActive ? (
          <View style={styles.speakerActiveBox}>
            <Text style={{ color: '#22C55E', fontWeight: 'bold', fontSize: 14 }}>
              🎙️ YOU ARE LIVE SPEAKER ({Math.floor(sessionTimeLeft / 60)}:{(sessionTimeLeft % 60).toString().padStart(2, '0')} Left)
            </Text>
            <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 4 }}>
              {isMicMuted ? 'Muted by Host' : 'Microphone Active • Speak clearly'}
            </Text>
          </View>
        ) : inQueueStatus ? (
          <View style={styles.queueStatusBox}>
            <Text style={{ fontSize: 14, marginRight: 6 }}>⏳</Text>
            <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{inQueueStatus}</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.requestSpeakBtn} onPress={() => setShowRequestModal(true)} activeOpacity={0.8}>
            <ImageIcon source={IMG_ICONS.call} size={22} style={{ marginRight: 6 }} circular />
            <Text style={styles.requestSpeakText}>Request to Speak</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Gift Token Banner */}
      {activeGiftBanner && (
        <View style={styles.giftBanner}>
          <Text style={{ fontSize: 26 }}>{activeGiftBanner.giftEmoji}</Text>
          <View style={{ marginLeft: 12 }}>
            <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 14 }}>{activeGiftBanner.senderName} sent {activeGiftBanner.giftName}!</Text>
            <Text style={{ color: '#F59E0B', fontSize: 12, fontWeight: 'bold' }}>+₹{activeGiftBanner.amount} Credit</Text>
          </View>
        </View>
      )}

      {/* Live Chat */}
      <View style={styles.chatContainer}>
        <FlatList
          data={messages}
          keyExtractor={(_, i) => i.toString()}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={true}
          renderItem={({ item }) => (
            <View style={styles.chatBubble}>
              <Text style={styles.chatSender}>{item.senderName}: </Text>
              <Text style={styles.chatText}>{item.text}</Text>
            </View>
          )}
        />
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor="#64748B"
            value={input}
            onChangeText={setInput}
          />
          <TouchableOpacity onPress={() => setShowTokenModal(true)} style={styles.giftBtn}>
            <Text style={{ fontSize: 20 }}>🎁</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSendMessage} style={styles.sendBtn} activeOpacity={0.8}>
            <ImageIcon source={IMG_ICONS.send} size={18} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Request to Speak Modal */}
      <Modal visible={showRequestModal} transparent animationType="slide" onRequestClose={() => setShowRequestModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ImageIcon source={IMG_ICONS.mic} size={20} style={{ marginRight: 8 }} tintColor="#0066FF" />
                <Text style={styles.modalTitle}>Request to Speak</Text>
              </View>
              <TouchableOpacity onPress={() => setShowRequestModal(false)} style={styles.modalCloseBtn}>
                <ImageIcon source={IMG_ICONS.close} size={16} circular />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {/* Request Type Tabs */}
              <View style={styles.tabRow}>
                <TouchableOpacity
                  style={[styles.tabItem, requestType === 'normal' && styles.activeTabItem]}
                  onPress={() => setRequestType('normal')}
                >
                  <Text style={[styles.tabText, requestType === 'normal' && styles.activeTabText]}>
                    Normal Queue (Free)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tabItem, requestType === 'priority' && styles.activeTabItemPriority]}
                  onPress={() => setRequestType('priority')}
                >
                  <Text style={[styles.tabText, requestType === 'priority' && styles.activeTabText]}>
                    👑 Skip Waitlist (Paid)
                  </Text>
                </TouchableOpacity>
              </View>

              {requestType === 'normal' ? (
                <View style={styles.tabContentBlock}>
                  <Icon name="time-outline" size={48} color="#94A3B8" style={{ alignSelf: 'center', marginBottom: 12 }} />
                  <Text style={styles.tabInfoTitle}>Normal Waiting Queue</Text>
                  <Text style={styles.tabInfoDesc}>
                    Your request is completely free. You will be placed at the bottom of the standard waiting list. The host will accept requests in their own time.
                  </Text>
                </View>
              ) : (
                <View style={styles.tabContentBlock}>
                  <Text style={styles.modalSubtitle}>ENTER SKIP WAITLIST AMOUNT (₹)</Text>
                  
                  {/* Predefined amounts selector */}
                  <View style={styles.amountQuickRow}>
                    {['10', '50', '100'].map(val => (
                      <TouchableOpacity
                        key={val}
                        style={[styles.amountQuickCard, priorityAmount === val && styles.amountQuickCardSelected]}
                        onPress={() => setPriorityAmount(val)}
                      >
                        <Text style={[styles.amountQuickText, priorityAmount === val && styles.amountQuickTextSelected]}>₹{val}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Custom Input */}
                  <View style={styles.customAmountInputWrap}>
                    <Text style={styles.rupeePrefix}>₹</Text>
                    <TextInput
                      style={styles.customAmountInput}
                      keyboardType="numeric"
                      value={priorityAmount}
                      onChangeText={setPriorityAmount}
                      placeholder="Enter Custom Amount"
                      placeholderTextColor="#64748B"
                    />
                  </View>

                  {/* Call duration feedback display */}
                  {calculatedDuration > 0 && (
                    <View style={styles.durationCard}>
                      <Text style={styles.durationLabel}>PURCHASED DURATION</Text>
                      <Text style={styles.durationValue}>⏱️ {calculatedDuration} {calculatedDuration === 1 ? 'Minute' : 'Minutes'}</Text>
                      <Text style={styles.durationSubtext}>
                        Call ends automatically after this duration. Host is only credited if they accept. Only the requester pays.
                      </Text>
                    </View>
                  )}
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.confirmRequestBtn,
                  requestType === 'priority' && { backgroundColor: '#F59E0B' }
                ]}
                onPress={handleSendSpeakRequest}
                activeOpacity={0.8}
                disabled={paymentLoading}
              >
                <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 15 }}>
                  {paymentLoading ? 'Initializing Payment...' : requestType === 'normal' ? 'Send Speak Request' : `Pay ₹${priorityAmount} & Skip Waitlist`}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Token Gifting Modal — tap gift = instant Razorpay */}
      <Modal visible={showTokenModal} transparent animationType="slide" onRequestClose={() => setShowTokenModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.giftModalContent, { paddingBottom: Math.max(insets.bottom, 20) }]}>

            {/* Header */}
            <View style={styles.giftModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="gift" size={28} color="#F59E0B" style={{ marginRight: 10 }} />
                <View>
                  <Text style={styles.giftModalTitle}>Send a Gift 🎁</Text>
                  <Text style={styles.giftModalSubtitle}>Tap any gift to pay instantly</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowTokenModal(false)} style={styles.modalCloseBtn}>
                <ImageIcon source={IMG_ICONS.close} size={18} circular />
              </TouchableOpacity>
            </View>

            {/* Razorpay badge */}
            <View style={styles.razorpayBadge}>
              <Text style={styles.razorpayBadgeText}>🔒 Secured by Razorpay</Text>
            </View>

            {/* Gift Cards Grid — tap = instant Razorpay */}
            <View style={styles.giftGrid}>
              {[
                { emoji: '🌹', name: 'Rose',      amount: 10,  color: '#EF4444' },
                { emoji: '💖', name: 'Heart',     amount: 50,  color: '#EC4899' },
                { emoji: '👑', name: 'Crown',     amount: 100, color: '#F59E0B' },
                { emoji: '💎', name: 'Diamond',   amount: 200, color: '#6366F1' },
                { emoji: '🏎️', name: 'Super Car', amount: 500, color: '#10B981' },
                { emoji: '🚀', name: 'Rocket',    amount: 1000, color: '#0066FF' },
              ].map((gift) => {
                const key = `${gift.name}-${gift.amount}`;
                const isLoading = selectedGiftKey === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.giftCard,
                      { borderColor: gift.color },
                      isLoading && { opacity: 0.6, backgroundColor: `${gift.color}22` },
                    ]}
                    onPress={() => handleSendToken(gift.amount, gift.name, gift.emoji)}
                    activeOpacity={0.75}
                    disabled={!!selectedGiftKey}
                  >
                    <Text style={{ fontSize: 34 }}>{gift.emoji}</Text>
                    <Text style={[styles.giftCardName, { color: gift.color }]}>{gift.name}</Text>
                    <View style={[styles.giftCardPriceBadge, { backgroundColor: `${gift.color}22`, borderColor: gift.color }]}>
                      <Text style={[styles.giftCardPrice, { color: gift.color }]}>₹{gift.amount}</Text>
                    </View>
                    {isLoading && (
                      <View style={styles.giftCardLoadingOverlay}>
                        <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold' }}>Opening...</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom Amount → Razorpay */}
            <View style={styles.customGiftRow}>
              <View style={styles.customGiftInputWrap}>
                <Text style={styles.rupeePrefix}>₹</Text>
                <TextInput
                  style={styles.customGiftInput}
                  placeholder="Custom amount"
                  placeholderTextColor="#475569"
                  keyboardType="numeric"
                  value={customGiftAmount}
                  onChangeText={setCustomGiftAmount}
                />
              </View>
              <TouchableOpacity
                style={[
                  styles.customGiftPayBtn,
                  (!customGiftAmount || !!selectedGiftKey) && { opacity: 0.5 },
                ]}
                onPress={handleCustomGiftPayment}
                disabled={!customGiftAmount || !!selectedGiftKey}
                activeOpacity={0.8}
              >
                <Text style={styles.customGiftPayText}>Pay via{`\n`}Razorpay</Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070A13' },
  glowBlob: {
    position: 'absolute',
    width: windowWidth * 0.7,
    height: windowWidth * 0.7,
    borderRadius: (windowWidth * 0.7) / 2,
    backgroundColor: 'rgba(0, 102, 255, 0.08)',
    top: '20%',
    alignSelf: 'center',
    zIndex: -1,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EF4444', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  pulseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFF', marginRight: 6 },
  liveText: { color: '#FFF', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.08)', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.06)' },
  statText: { color: '#FFF', fontSize: 11, marginLeft: 2, fontWeight: '700' },
  closeBtn: { padding: 2 },
  centerStage: { alignItems: 'center', marginTop: 24 },
  avatarRingOuter: { position: 'relative', width: 140, height: 140, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  lottieVisualizerRing: { position: 'absolute', width: 200, height: 200 },
  hostAvatar: { width: 110, height: 110, borderRadius: 55, borderWidth: 3.5, borderColor: '#0066FF', shadowColor: '#0066FF', shadowRadius: 10, shadowOpacity: 0.5 },
  micBadgeHost: { position: 'absolute', bottom: 4, right: 6, backgroundColor: '#22C55E', width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', borderWidth: 2.5, borderColor: '#070A13', elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 },
  hostName: { color: '#FFF', fontSize: 22, fontWeight: '900', letterSpacing: 0.5 },
  hostStatus: { color: '#94A3B8', fontSize: 13, marginTop: 6, fontWeight: '600' },
  requestSpeakBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0066FF', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 28, marginTop: 24, elevation: 6, shadowColor: '#0066FF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6 },
  requestSpeakText: { color: '#FFF', fontWeight: '900', marginLeft: 4, fontSize: 15 },
  speakerActiveBox: { backgroundColor: 'rgba(34, 197, 94, 0.12)', padding: 16, borderRadius: 20, marginTop: 24, borderWidth: 1.5, borderColor: '#22C55E', alignItems: 'center', shadowColor: '#22C55E', shadowRadius: 10, shadowOpacity: 0.2 },
  queueStatusBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(30, 41, 59, 0.65)', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 20, marginTop: 24, borderWidth: 1.5, borderColor: '#0066FF' },
  chatContainer: { flex: 1, justifyContent: 'flex-end', padding: 16 },
  chatBubble: { flexDirection: 'row', backgroundColor: 'rgba(30, 41, 59, 0.55)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, marginBottom: 8, alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.04)' },
  chatSender: { color: '#C084FC', fontWeight: '800', fontSize: 13 },
  chatText: { color: '#F1F5F9', fontSize: 13, fontWeight: '500' },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(30, 41, 59, 0.65)', borderRadius: 28, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1.5, borderColor: '#334155' },
  input: { flex: 1, color: '#FFF', fontSize: 14, paddingVertical: 8, paddingLeft: 8 },
  giftBtn: { padding: 4, marginRight: 8 },
  sendBtn: { backgroundColor: '#0066FF', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.82)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#0B0F19', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 20, borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.06)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: '900' },
  modalCloseBtn: { padding: 4 },
  modalSubtitle: { color: '#94A3B8', fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginBottom: 12, marginTop: 12 },
  tabRow: { flexDirection: 'row', backgroundColor: 'rgba(255, 255, 255, 0.06)', borderRadius: 16, padding: 4, marginBottom: 16 },
  tabItem: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 12 },
  activeTabItem: { backgroundColor: '#0066FF' },
  activeTabItemPriority: { backgroundColor: '#F59E0B' },
  tabText: { color: '#94A3B8', fontSize: 13, fontWeight: '800' },
  activeTabText: { color: '#FFF' },
  tabContentBlock: { minHeight: 180, justifyContent: 'center', paddingHorizontal: 8 },
  tabInfoTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  tabInfoDesc: { color: '#94A3B8', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  amountQuickRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 14 },
  amountQuickCard: { flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.04)', paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1.5, borderColor: '#1E293B' },
  amountQuickCardSelected: { borderColor: '#F59E0B', backgroundColor: 'rgba(245, 158, 11, 0.12)' },
  amountQuickText: { color: '#94A3B8', fontSize: 15, fontWeight: 'bold' },
  amountQuickTextSelected: { color: '#F59E0B' },
  customAmountInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.04)', borderRadius: 14, paddingHorizontal: 16, borderWidth: 1.5, borderColor: '#1E293B', marginBottom: 16 },
  rupeePrefix: { color: '#64748B', fontSize: 18, fontWeight: 'bold', marginRight: 8 },
  customAmountInput: { flex: 1, color: '#FFF', fontSize: 15, fontWeight: 'bold', paddingVertical: 12 },
  durationCard: { backgroundColor: 'rgba(245, 158, 11, 0.08)', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.2)', marginBottom: 8 },
  durationLabel: { color: '#F59E0B', fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginBottom: 4 },
  durationValue: { color: '#FFF', fontSize: 18, fontWeight: '900' },
  durationSubtext: { color: '#94A3B8', fontSize: 11, marginTop: 6, lineHeight: 16 },
  confirmRequestBtn: { backgroundColor: '#0066FF', paddingVertical: 16, borderRadius: 18, alignItems: 'center', marginTop: 16, shadowColor: '#0066FF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6 },
  tokenGiftCard: { width: '48%', backgroundColor: 'rgba(255, 255, 255, 0.04)', padding: 16, borderRadius: 20, alignItems: 'center', borderWidth: 1.5, borderColor: '#1E293B' },
  giftBanner: { position: 'absolute', top: 85, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(15, 23, 42, 0.95)', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 22, borderWidth: 1.5, borderColor: '#F59E0B', zIndex: 20, shadowColor: '#F59E0B', shadowRadius: 15, shadowOpacity: 0.3, elevation: 8 },
  // Premium Gift Modal
  giftModalContent: { backgroundColor: '#0B0F1C', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 20, borderWidth: 1.5, borderColor: 'rgba(245, 158, 11, 0.15)' },
  giftModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  giftModalTitle: { color: '#FFF', fontSize: 18, fontWeight: '900' },
  giftModalSubtitle: { color: '#64748B', fontSize: 12, marginTop: 2 },
  razorpayBadge: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 14, alignSelf: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  razorpayBadgeText: { color: '#64748B', fontSize: 11, fontWeight: '700' },
  giftGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, marginBottom: 16 },
  giftCard: { width: '30%', backgroundColor: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 18, alignItems: 'center', borderWidth: 1.5, borderColor: '#1E293B', position: 'relative', overflow: 'hidden' },
  giftCardName: { fontSize: 11, fontWeight: '800', marginTop: 6, marginBottom: 4 },
  giftCardPriceBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  giftCardPrice: { fontSize: 12, fontWeight: '900' },
  giftCardLoadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  customGiftRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  customGiftInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, paddingHorizontal: 14, borderWidth: 1.5, borderColor: '#1E293B' },
  customGiftInput: { flex: 1, color: '#FFF', fontSize: 15, fontWeight: 'bold', paddingVertical: 12 },
  customGiftPayBtn: { backgroundColor: '#F59E0B', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  customGiftPayText: { color: '#000', fontSize: 11, fontWeight: '900', textAlign: 'center', lineHeight: 15 },
});

export default LiveViewerScreen;
