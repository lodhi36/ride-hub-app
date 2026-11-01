import React, { useEffect, useState, useRef } from 'react';
import { Dimensions, View, Text, TouchableOpacity, StyleSheet, TextInput, FlatList, Animated, Easing, Keyboard, Platform, Alert, Image, Modal, ScrollView, StatusBar } from 'react-native';
import { mediaDevices, RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } from 'react-native-webrtc';
import Icon from '../components/PngIcon';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import api, { UPLOADS_URL } from '../services/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  earnings: require('../assets/icons/earnings.png'),
  people: require('../assets/icons/personal.png'),
  send: require('../assets/send_17972127.png'),
  back: require('../assets/icons/back_arrow.png'),
  crown: require('../assets/icons/crown.png'),
};

const LiveBroadcastScreen = ({ navigation }: any) => {
  const { socket } = useSocket();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  
  const [localStream, setLocalStream] = useState<any>(null);
  const [viewers, setViewers] = useState(0);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const peerConnections = useRef(new Map<string, any>());
  const pendingIceCandidatesMap = useRef(new Map<string, any[]>());
  const localStreamRef = useRef<any>(null);

  // Voice Queues State
  const [priorityQueue, setPriorityQueue] = useState<any[]>([]);
  const [normalQueue, setNormalQueue] = useState<any[]>([]);
  const [activeSpeaker, setActiveSpeaker] = useState<any>(null);
  const [sessionTimeLeft, setSessionTimeLeft] = useState<number>(0);
  const [todayEarnings, setTodayEarnings] = useState<number>(0);
  const [showQueueModal, setShowQueueModal] = useState<boolean>(false);

  // Gift & Animation states
  const [activeGiftBanner, setActiveGiftBanner] = useState<any>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [isHostMicMuted, setIsHostMicMuted] = useState(false);
  const allowExit = useRef(false);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (allowExit.current) return;
      e.preventDefault();
      Alert.alert(
        'End Voice Live',
        'Are you sure you want to end this Voice Live broadcast?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'End Session', 
            style: 'destructive', 
            onPress: () => {
              allowExit.current = true;
              handleEndLive();
              navigation.navigate('CustomerHomeScreen');
            } 
          }
        ]
      );
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    startVoiceMic();

    if (socket && user?._id) {
      const uIdStr = user._id.toString();
      socket.emit('start_live', { userId: uIdStr, userDetails: { name: user.name } });

      api.post('/live/start', { title: `${user.name}'s Voice Live Studio` }).then((res) => {
        console.log('[LiveBroadcast] Studio Voice Live created');
      }).catch((e) => console.log('Error creating live record', e));

      socket.on('viewer_joined', ({ viewersCount }: any) => setViewers(viewersCount));
      socket.on('viewer_left', ({ viewersCount }: any) => setViewers(viewersCount));

      socket.on('queue_updated', ({ priorityQueue: pQ, normalQueue: nQ }: any) => {
        setPriorityQueue(pQ || []);
        setNormalQueue(nQ || []);
      });

      socket.on('speaker_session_started', ({ speakerId, durationSeconds }: any) => {
        setSessionTimeLeft(durationSeconds || 60);
      });

      socket.on('live_chat_message', (msg: any) => {
        setMessages(prev => [...prev.slice(-40), msg]);
      });

      socket.on('live_token_received', (data: any) => {
        setActiveGiftBanner(data);
        setTodayEarnings(prev => prev + (data.amount || 10));
        setTimeout(() => setActiveGiftBanner(null), 4000);
      });

      // Real-time earnings updates from accepted priority requests
      socket.on('earnings_updated', ({ addedEarnings }: any) => {
        setTodayEarnings(prev => prev + addedEarnings);
      });

      socket.on('speaker_removed', ({ speakerId }: any) => {
        setActiveSpeaker(null);
        setSessionTimeLeft(0);
        Alert.alert('Speaker Session Ended', 'Speak session has ended.');
      });

      socket.on('active_speaker_status', ({ speakerId, speakerName, durationSeconds }: any) => {
        setActiveSpeaker({
          speakerId,
          speakerName,
          durationSeconds,
          isMuted: false
        });
        setSessionTimeLeft(durationSeconds);
      });

      socket.on('live_heart', () => {
        setLikeCount(prev => prev + 1);
      });

      // Pure Audio WebRTC Signaling
      socket.on('viewer_joined_webrtc', async ({ viewerId }: any) => {
        const vIdStr = typeof viewerId === 'object' ? (viewerId._id || viewerId.id || viewerId)?.toString() : viewerId?.toString();
        let currentStream = localStreamRef.current;
        if (!currentStream) {
          await new Promise<void>(r => setTimeout(() => r(), 800));
          currentStream = localStreamRef.current;
        }
        if (!currentStream) return;

        let existingPc = peerConnections.current.get(vIdStr);
        if (existingPc) {
          try { existingPc.close(); } catch (e) {}
        }
        const pc: any = new RTCPeerConnection(peerConstraints);
        peerConnections.current.set(vIdStr, pc);

        currentStream.getAudioTracks().forEach((track: any) => {
          pc.addTrack(track, currentStream);
        });

        pc.onicecandidate = (event: any) => {
          if (event.candidate) {
            socket.emit('webrtc_ice_candidate', { targetUserId: vIdStr, candidate: event.candidate, senderId: uIdStr });
          }
        };

        pc.ontrack = (event: any) => {
          console.log('[Host] Received remote audio track from viewer:', vIdStr);
        };

        try {
          const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
          await pc.setLocalDescription(offer);
          socket.emit('webrtc_offer', { targetUserId: vIdStr, offer, senderId: uIdStr });
        } catch (err) {
          console.warn('[Voice Broadcast] Error creating audio offer:', err);
        }
      });

      socket.on('webrtc_answer', async ({ answer, senderId }: any) => {
        const sIdStr = typeof senderId === 'object' ? (senderId._id || senderId.id || senderId)?.toString() : senderId?.toString();
        const pc = peerConnections.current.get(sIdStr);
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            const pending = pendingIceCandidatesMap.current.get(sIdStr) || [];
            while (pending.length > 0) {
              const cand = pending.shift();
              try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
            }
          } catch (e) {}
        }
      });

      socket.on('webrtc_ice_candidate', async ({ candidate, senderId }: any) => {
        const sIdStr = typeof senderId === 'object' ? (senderId._id || senderId.id || senderId)?.toString() : senderId?.toString();
        const pc = peerConnections.current.get(sIdStr);
        if (pc && pc.remoteDescription) {
          try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {}
        } else if (sIdStr) {
          if (!pendingIceCandidatesMap.current.has(sIdStr)) {
            pendingIceCandidatesMap.current.set(sIdStr, []);
          }
          pendingIceCandidatesMap.current.get(sIdStr)?.push(candidate);
        }
      });
    }

    return () => {
      handleEndLive();
      if (socket) {
        socket.off('viewer_joined');
        socket.off('viewer_left');
        socket.off('queue_updated');
        socket.off('speaker_session_started');
        socket.off('live_chat_message');
        socket.off('live_token_received');
        socket.off('earnings_updated');
        socket.off('speaker_removed');
        socket.off('active_speaker_status');
        socket.off('live_heart');
        socket.off('viewer_joined_webrtc');
        socket.off('webrtc_answer');
        socket.off('webrtc_ice_candidate');
      }
    };
  }, []);

  // Countdown timer for active speaker
  useEffect(() => {
    let timer: any;
    if (activeSpeaker && sessionTimeLeft > 0) {
      timer = setInterval(() => {
        setSessionTimeLeft(prev => {
          if (prev <= 1) {
            handleRemoveSpeaker();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [activeSpeaker, sessionTimeLeft]);

  const startVoiceMic = async () => {
    try {
      const stream: any = await mediaDevices.getUserMedia({ audio: true, video: false });
      if (stream) {
        stream.getAudioTracks().forEach((t: any) => { t.enabled = true; });
        setLocalStream(stream);
        localStreamRef.current = stream;
        console.log('[VoiceBroadcast] Studio Audio Microphone active');
      }
    } catch (err) {
      console.error('Error starting audio microphone:', err);
    }
  };

  const handleAcceptRequest = (reqItem: any) => {
    setActiveSpeaker({
      speakerId: reqItem.viewerId,
      speakerName: reqItem.viewerName,
      durationSeconds: (reqItem.plan?.durationMinutes || 1) * 60,
      isMuted: false,
    });
    setSessionTimeLeft((reqItem.plan?.durationMinutes || 1) * 60);

    socket?.emit('accept_speak_request', {
      broadcasterId: user?._id,
      viewerId: reqItem.viewerId,
      plan: reqItem.plan,
      liveRequestId: reqItem.liveRequestId, // Pass the database liveRequestId
    });
    setShowQueueModal(false);
  };

  const handleRejectRequest = (reqItem: any) => {
    socket?.emit('reject_speak_request', {
      broadcasterId: user?._id,
      viewerId: reqItem.viewerId,
      liveRequestId: reqItem.liveRequestId, // Pass the database liveRequestId
    });
  };

  const handleToggleMuteSpeaker = () => {
    if (!activeSpeaker) return;
    const newMuteState = !activeSpeaker.isMuted;
    setActiveSpeaker((prev: any) => ({ ...prev, isMuted: newMuteState }));
    socket?.emit('mute_speaker', { broadcasterId: user?._id, speakerId: activeSpeaker.speakerId, isMuted: newMuteState });
  };

  const handleRemoveSpeaker = () => {
    if (!activeSpeaker) return;
    socket?.emit('remove_speaker', { broadcasterId: user?._id, speakerId: activeSpeaker.speakerId });
    setActiveSpeaker(null);
    setSessionTimeLeft(0);
  };

  const handleEndLive = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t: any) => {
        t.enabled = false;
        t.stop();
      });
      localStreamRef.current = null;
    }
    peerConnections.current.forEach(pc => { try { pc.close(); } catch (e) {} });
    peerConnections.current.clear();

    if (user?._id) {
      socket?.emit('end_live', { userId: user._id });
      api.post('/live/end').catch(() => {});
    }
  };

  const handleSendMessage = () => {
    if (!input.trim()) return;
    const msg = { senderName: user?.name || 'Host', text: input.trim(), isHost: true };
    setMessages(prev => [...prev, msg]);
    socket?.emit('live_chat_message', { broadcasterId: user?._id, message: msg });
    setInput('');
  };

  // Concatenate Priority requests at the top, and Normal requests below them.
  // Both sub-queues are already sorted on the server correctly.
  const unifiedQueue = [...priorityQueue, ...normalQueue];
  const totalPendingQueueCount = unifiedQueue.length;

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
          <TouchableOpacity
            style={[styles.queueBadge, totalPendingQueueCount > 0 && styles.queueActiveBadge]}
            onPress={() => setShowQueueModal(true)}
            activeOpacity={0.8}
          >
            <ImageIcon source={IMG_ICONS.people} size={15} style={{ marginRight: 4 }} tintColor="#FFF" />
            <Text style={styles.queueText}>Queue ({totalPendingQueueCount})</Text>
          </TouchableOpacity>

          <View style={styles.earningsPill}>
            <ImageIcon source={IMG_ICONS.earnings} size={14} style={{ marginRight: 4 }} />
            <Text style={styles.earningsPillText}>₹{todayEarnings}</Text>
          </View>

          <View style={styles.statBadge}>
            <Text style={{ fontSize: 14, marginRight: 2 }}>👁️</Text>
            <Text style={styles.statText}>{viewers}</Text>
          </View>

          <TouchableOpacity onPress={() => navigation.navigate('CustomerHomeScreen')} style={styles.closeBtn}>
            <ImageIcon source={IMG_ICONS.close} size={28} circular />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Studio Stage */}
      <View style={styles.centerStage}>
        <View style={styles.avatarRingOuter}>

          <Image
            source={{ uri: user?.profilePicture ? `${UPLOADS_URL}${user.profilePicture.replace('/uploads', '')}` : 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png' }}
            style={styles.hostAvatar}
          />

          <TouchableOpacity
            style={[styles.micBadgeHost, isHostMicMuted && styles.micBadgeHostMuted]}
            onPress={() => {
              const nextState = !isHostMicMuted;
              setIsHostMicMuted(nextState);
              if (localStreamRef.current) {
                localStreamRef.current.getAudioTracks().forEach((t: any) => { t.enabled = !nextState; });
              }
            }}
            activeOpacity={0.8}
          >
            <ImageIcon source={IMG_ICONS.mic} size={20} circular style={isHostMicMuted ? { opacity: 0.5 } : null} />
          </TouchableOpacity>
        </View>

        <Text style={styles.hostName}>{user?.name}</Text>
        <Text style={styles.hostStatus}>
          {isHostMicMuted ? '🔴 Microphone Muted' : '🎙️ Live Voice Host • Mic Active'}
        </Text>

        {/* Active Speaker Card */}
        {activeSpeaker ? (
          <View style={styles.activeSpeakerCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={styles.speakerAvatarCircle}>
                <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 16 }}>{activeSpeaker.speakerName.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ marginLeft: 12 }}>
                <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 15 }}>{activeSpeaker.speakerName}</Text>
                <View style={styles.timerPill}>
                  <ImageIcon source={IMG_ICONS.crown} size={12} style={{ marginRight: 4 }} />
                  <Text style={{ color: '#BFDBFE', fontSize: 12, fontWeight: 'bold' }}>
                    {Math.floor(sessionTimeLeft / 60)}:{(sessionTimeLeft % 60).toString().padStart(2, '0')} Left
                  </Text>
                </View>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <TouchableOpacity onPress={handleToggleMuteSpeaker} style={[styles.speakerActionBtn, activeSpeaker.isMuted && styles.speakerMutedBtn]}>
                <ImageIcon source={IMG_ICONS.mic} size={18} circular style={activeSpeaker.isMuted ? { opacity: 0.5 } : null} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleRemoveSpeaker} style={[styles.speakerActionBtn, { backgroundColor: '#EF4444' }]}>
                <ImageIcon source={IMG_ICONS.close} size={18} circular />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.noSpeakerCard} onPress={() => setShowQueueModal(true)} activeOpacity={0.8}>
            <ImageIcon source={IMG_ICONS.people} size={22} style={{ marginRight: 8 }} tintColor="#0066FF" />
            <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '600' }}>
              No Speaker Active. Tap to Accept Listener Requests
            </Text>
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

      {/* Studio Chat Overlay */}
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
            placeholder="Send announcement to room..."
            placeholderTextColor="#64748B"
            value={input}
            onChangeText={setInput}
          />
          <TouchableOpacity onPress={handleSendMessage} style={styles.sendBtn} activeOpacity={0.8}>
            <ImageIcon source={IMG_ICONS.send} size={18} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Queue Drawer Sheet Modal */}
      <Modal visible={showQueueModal} transparent animationType="slide" onRequestClose={() => setShowQueueModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ImageIcon source={IMG_ICONS.people} size={20} style={{ marginRight: 8 }} tintColor="#0066FF" />
                <Text style={styles.modalTitle}>Request to Speak Queue</Text>
              </View>
              <TouchableOpacity onPress={() => setShowQueueModal(false)} style={styles.modalCloseBtn}>
                <ImageIcon source={IMG_ICONS.close} size={16} circular />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingVertical: 10 }}>
              {unifiedQueue.length === 0 ? (
                <View style={{ padding: 30, alignItems: 'center' }}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>⏳</Text>
                  <Text style={{ color: '#94A3B8', marginTop: 10, fontSize: 13 }}>No pending speak requests in the queue.</Text>
                </View>
              ) : (
                unifiedQueue.map(item => {
                  const avatarUri = item.viewerAvatar
                    ? `${UPLOADS_URL}${item.viewerAvatar.replace('/uploads', '')}`
                    : null;
                  
                  return (
                    <View
                      key={item.viewerId}
                      style={[
                        styles.queueCardItem,
                        item.isPriority && styles.queueCardItemPriority
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        <View style={[styles.queueAvatarWrapper, item.isPriority && styles.queueAvatarWrapperPriority]}>
                          {avatarUri ? (
                            <Image source={{ uri: avatarUri }} style={styles.queueAvatarImage} />
                          ) : (
                            <View style={styles.queueAvatarFallback}>
                              <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 15 }}>
                                {item.viewerName.charAt(0).toUpperCase()}
                              </Text>
                            </View>
                          )}
                        </View>
                        
                        <View style={{ marginLeft: 12, flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                            <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 14, marginRight: 6 }}>
                              {item.viewerName}
                            </Text>
                            {item.isPriority && (
                              <View style={styles.priorityBadge}>
                                <Text style={styles.priorityBadgeText}>👑 Priority Paid Request</Text>
                              </View>
                            )}
                          </View>
                          
                          <Text style={{ color: item.isPriority ? '#F59E0B' : '#94A3B8', fontSize: 12, marginTop: 2, fontWeight: '700' }}>
                            {item.isPriority ? `Paid Amount: ₹${item.plan?.price} (${item.plan?.durationMinutes} min)` : 'Normal Request (Free, 1 min)'}
                          </Text>
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', gap: 8, marginLeft: 8 }}>
                        <TouchableOpacity onPress={() => handleAcceptRequest(item)} style={styles.acceptBtn} activeOpacity={0.8}>
                          <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 12 }}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleRejectRequest(item)} style={styles.rejectBtn} activeOpacity={0.8}>
                          <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 12 }}>Reject</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
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
  queueBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.08)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.12)' },
  queueActiveBadge: { backgroundColor: '#0066FF', borderColor: '#BFDBFE' },
  queueText: { color: '#FFF', fontSize: 11, fontWeight: '700', marginLeft: 2 },
  earningsPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(245, 158, 11, 0.12)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: '#F59E0B' },
  earningsPillText: { color: '#F59E0B', fontSize: 11, fontWeight: '700', marginLeft: 2 },
  statBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.08)', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.06)' },
  statText: { color: '#FFF', fontSize: 11, marginLeft: 2, fontWeight: '700' },
  closeBtn: { padding: 2 },
  centerStage: { alignItems: 'center', marginTop: 24 },
  avatarRingOuter: { position: 'relative', width: 140, height: 140, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  lottieVisualizerRing: { position: 'absolute', width: 200, height: 200 },
  hostAvatar: { width: 110, height: 110, borderRadius: 55, borderWidth: 3.5, borderColor: '#0066FF', shadowColor: '#0066FF', shadowRadius: 10, shadowOpacity: 0.5 },
  micBadgeHost: { position: 'absolute', bottom: 4, right: 6, backgroundColor: '#22C55E', width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', borderWidth: 2.5, borderColor: '#070A13', elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 },
  micBadgeHostMuted: { backgroundColor: '#EF4444' },
  hostName: { color: '#FFF', fontSize: 22, fontWeight: '900', letterSpacing: 0.5 },
  hostStatus: { color: '#94A3B8', fontSize: 13, marginTop: 6, fontWeight: '600' },
  activeSpeakerCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(30, 41, 59, 0.65)', width: '92%', padding: 14, borderRadius: 20, marginTop: 24, borderWidth: 1.5, borderColor: '#0066FF', shadowColor: '#0066FF', shadowRadius: 12, shadowOpacity: 0.25 },
  speakerAvatarCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#0066FF', justifyContent: 'center', alignItems: 'center' },
  timerPill: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  speakerActionBtn: { backgroundColor: '#6366F1', width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  speakerMutedBtn: { backgroundColor: '#EF4444' },
  noSpeakerCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(22, 31, 50, 0.45)', width: '92%', padding: 18, borderRadius: 20, marginTop: 24, borderStyle: 'dashed', borderWidth: 1.5, borderColor: '#334155' },
  giftBanner: { position: 'absolute', top: 85, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(15, 23, 42, 0.95)', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 22, borderWidth: 1.5, borderColor: '#F59E0B', zIndex: 20, shadowColor: '#F59E0B', shadowRadius: 15, shadowOpacity: 0.3, elevation: 8 },
  chatContainer: { flex: 1, justifyContent: 'flex-end', padding: 16 },
  chatBubble: { flexDirection: 'row', backgroundColor: 'rgba(30, 41, 59, 0.55)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, marginBottom: 8, alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.04)' },
  chatSender: { color: '#C084FC', fontWeight: '800', fontSize: 13 },
  chatText: { color: '#F1F5F9', fontSize: 13, fontWeight: '500' },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(30, 41, 59, 0.65)', borderRadius: 28, paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1.5, borderColor: '#334155' },
  input: { flex: 1, color: '#FFF', fontSize: 14, paddingVertical: 8 },
  sendBtn: { backgroundColor: '#0066FF', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.82)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#0B0F19', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 20, maxHeight: '75%', borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.06)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: '900' },
  modalCloseBtn: { padding: 4 },
  queueCardItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(30, 41, 59, 0.55)', padding: 14, borderRadius: 18, marginBottom: 12, borderWidth: 1.5, borderColor: '#1E293B' },
  queueCardItemPriority: { borderColor: '#F59E0B', backgroundColor: 'rgba(245, 158, 11, 0.08)' },
  queueAvatarWrapper: { width: 42, height: 42, borderRadius: 21, overflow: 'hidden', borderWidth: 1.5, borderColor: '#6366F1' },
  queueAvatarWrapperPriority: { borderColor: '#F59E0B' },
  queueAvatarImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  queueAvatarFallback: { width: '100%', height: '100%', backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center' },
  priorityBadge: { backgroundColor: 'rgba(245, 158, 11, 0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start' },
  priorityBadgeText: { color: '#F59E0B', fontSize: 9, fontWeight: 'bold' },
  acceptBtn: { backgroundColor: '#22C55E', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, shadowColor: '#22C55E', shadowRadius: 6, shadowOpacity: 0.3 },
  rejectBtn: { backgroundColor: '#EF4444', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, shadowColor: '#EF4444', shadowRadius: 6, shadowOpacity: 0.3 },
});

export default LiveBroadcastScreen;
