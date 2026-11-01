import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Dimensions,
  SafeAreaView,
  Image,
  ImageBackground,
  Animated,
  Easing,
  StatusBar,
} from 'react-native';
import Icon from './PngIcon';
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  RTCView,
  mediaDevices,
  MediaStream,
} from 'react-native-webrtc';
import { colors } from '../theme/colors';
let Sound: any = null;
try {
  Sound = require('react-native-sound');
} catch (e) {
  console.log('[WebRTCCallModal] react-native-sound disabled/removed');
}
import api, { UPLOADS_URL } from '../services/api';

const { width: windowWidth, height: windowHeight } = Dimensions.get('window');

const getAvatarUrl = (userObj: any) => {
  if (!userObj) return 'https://via.placeholder.com/150';
  const pic = userObj.profilePicture || userObj.avatar;
  if (!pic) return 'https://via.placeholder.com/150';
  if (pic.startsWith('http://') || pic.startsWith('https://')) {
    return pic;
  }
  const cleanPath = pic.startsWith('/') ? pic : `/${pic}`;
  return `${UPLOADS_URL}${cleanPath.replace('/uploads', '')}`;
};

const peerConstraints = {
  iceServers: [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.twilio.com:3478' },
    { urls: 'stun:stun.mozilla.org:3478' },
  ],
};

interface WebRTCCallModalProps {
  visible: boolean;
  onClose: () => void;
  socket: any;
  user: any;
  otherUser: any;
  isIncomingCall?: boolean;
  incomingOffer?: any;
  callType?: 'voice' | 'video';
}

export const WebRTCCallModal: React.FC<WebRTCCallModalProps> = ({
  visible,
  onClose,
  socket,
  user,
  otherUser,
  isIncomingCall = false,
  incomingOffer = null,
  callType = 'video',
}) => {
  const [callStatus, setCallStatus] = useState<'calling' | 'incoming' | 'connected' | 'ended'>('calling');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callSeconds, setCallSeconds] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<any>(null);

  // Pulse animation for avatar ring
  const pulseAnim1 = useRef(new Animated.Value(1)).current;
  const pulseAnim2 = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (callStatus === 'calling' || callStatus === 'incoming') {
      const createPulse = (anim: Animated.Value, delay: number) => {
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(anim, {
              toValue: 1.5,
              duration: 1800,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            }),
          ])
        ).start();
      };
      createPulse(pulseAnim1, 0);
      createPulse(pulseAnim2, 900);
    }
  }, [callStatus]);

  // Ringtone playback for outgoing calling / incoming call
  const ringtoneRef = useRef<any>(null);

  useEffect(() => {
    // Ringtone ONLY plays for the recipient of an INCOMING call during 'incoming' status.
    // It stops immediately when call is accepted ('connected'), declined/ended ('ended'), or modal closes.
    if (visible && isIncomingCall && callStatus === 'incoming') {
      console.log('[WebRTC Sound] Playing incoming WhatsApp ringtone for receiver...');
      try {
        Sound.setCategory('Playback', true);
        let soundUri = '';
        try {
          const resolved = Image.resolveAssetSource(require('../tone/whats_ringtone.mp3'));
          if (resolved && resolved.uri) soundUri = resolved.uri;
        } catch (_) {}

        const playInstance = (s: any) => {
          s.setNumberOfLoops(-1);
          s.setVolume(1.0);
          s.play((success: any) => {
            if (!success) console.warn('[WebRTC Sound] Ringtone playback failed');
          });
          ringtoneRef.current = s;
        };

        if (soundUri) {
          const sound = new Sound(soundUri, '', (error: any) => {
            if (error) {
              const fallback = new Sound(require('../tone/whats_ringtone.mp3'), (fbErr: any) => {
                if (!fbErr && fallback) playInstance(fallback);
              });
            } else {
              playInstance(sound);
            }
          });
        } else {
          const sound = new Sound(require('../tone/whats_ringtone.mp3'), (error: any) => {
            if (error) {
              const rawFallback = new Sound('whats_ringtone', Sound.MAIN_BUNDLE, (rawErr: any) => {
                if (!rawErr && rawFallback) playInstance(rawFallback);
              });
            } else {
              playInstance(sound);
            }
          });
        }
      } catch (e) {
        console.error('[WebRTC Sound] Exception playing ringtone:', e);
      }
    } else {
      if (ringtoneRef.current) {
        console.log('[WebRTC Sound] Stopping ringtone...');
        try {
          ringtoneRef.current.stop(() => {
            ringtoneRef.current?.release();
            ringtoneRef.current = null;
          });
        } catch (e) {
          ringtoneRef.current = null;
        }
      }
    }

    return () => {
      if (ringtoneRef.current) {
        try {
          ringtoneRef.current.stop(() => {
            ringtoneRef.current?.release();
            ringtoneRef.current = null;
          });
        } catch (e) {
          ringtoneRef.current = null;
        }
      }
    };
  }, [visible, callStatus]);

  // Call duration timer
  useEffect(() => {
    let interval: any = null;
    if (callStatus === 'connected') {
      interval = setInterval(() => {
        setCallSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setCallSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callStatus]);

  // 15-second strict auto-timeout for unanswered calls (auto-cut on both sides)
  useEffect(() => {
    let callTimer: any = null;
    if (visible && (callStatus === 'calling' || callStatus === 'incoming')) {
      callTimer = setTimeout(() => {
        console.log('[WebRTC] 15s Ringing timeout reached. Auto-cutting call on both sides...');
        logCallRecord('missed');
        if (socket && otherUser?._id) {
          socket.emit('end_call', {
            to: otherUser._id,
            from: user?._id,
          });
        }
        cleanupCall();
      }, 15000);
    }
    return () => {
      if (callTimer) clearTimeout(callTimer);
    };
  }, [visible, callStatus, otherUser?._id, user?._id, socket]);

  const formatDuration = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const callLoggedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      callLoggedRef.current = false;
    }
  }, [visible]);

  const logCallRecord = useCallback((status: 'missed' | 'rejected' | 'completed') => {
    if (callLoggedRef.current) return;
    callLoggedRef.current = true;

    if (user?._id && otherUser?._id) {
      const senderId = isIncomingCall ? otherUser._id : user._id;
      const receiverId = isIncomingCall ? user._id : otherUser._id;
      const payload = {
        senderId,
        receiverId,
        callType,
        callStatus: status,
        callDuration: callSeconds,
      };

      console.log('[WebRTC] Logging call record via REST API:', payload);

      api.post('/messages/call-log', payload)
        .then((res) => {
          console.log('[WebRTC] Call log saved successfully via API:', res.data);
        })
        .catch((err) => {
          console.error('[WebRTC] API Call log error:', err?.response?.data || err.message);
        });
    }
  }, [user?._id, otherUser?._id, isIncomingCall, callType, callSeconds]);

  // Clean up WebRTC peer connection and tracks
  const cleanupCall = useCallback(() => {
    console.log('[WebRTC] Cleaning up call resources...');
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    remoteStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    setCallStatus('ended');
    setTimeout(() => {
      onClose();
    }, 500);
  }, [onClose]);

  // Handle End Call initiated by user
  const handleEndCall = () => {
    console.log('[WebRTC] Ending call in status:', callStatus);
    if (callStatus === 'calling') {
      logCallRecord('missed');
    } else if (callStatus === 'incoming') {
      logCallRecord('rejected');
    } else if (callStatus === 'connected') {
      logCallRecord('completed');
    } else {
      logCallRecord('missed');
    }

    if (socket && otherUser?._id) {
      socket.emit('end_call', {
        to: otherUser._id,
        from: user?._id,
      });
    }
    cleanupCall();
  };

  // Initialize WebRTC PeerConnection & Media Streams
  const startLocalStream = async (isVideo: boolean) => {
    try {
      console.log('[WebRTC] Getting user media streams...');
      let stream: MediaStream | null = null;

      try {
        stream = (await mediaDevices.getUserMedia({
          audio: true,
          video: isVideo
            ? {
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { max: 30 },
                facingMode: 'user',
              }
            : false,
        })) as MediaStream;
      } catch (vidErr) {
        console.warn('[WebRTC] Video getUserMedia failed with constraints, trying video: true fallback:', vidErr);
        try {
          stream = (await mediaDevices.getUserMedia({
            audio: true,
            video: isVideo ? true : false,
          })) as MediaStream;
        } catch (fbErr) {
          console.warn('[WebRTC] video: true fallback failed, attempting audio fallback:', fbErr);
          stream = (await mediaDevices.getUserMedia({
            audio: true,
            video: false,
          })) as MediaStream;
        }
      }

      if (stream) {
        stream.getTracks().forEach((t: any) => { t.enabled = true; });
        setLocalStream(stream);
        localStreamRef.current = stream;
      }
      return stream;
    } catch (error) {
      console.error('[WebRTC] Error getting user media:', error);
      return null;
    }
  };

  // Create RTCPeerConnection and bind listeners
  const createPeerConnection = (stream: MediaStream) => {
    console.log('[WebRTC] Creating RTCPeerConnection...');
    const pc = new RTCPeerConnection(peerConstraints);

    // Add local tracks to Peer Connection
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    // On ICE candidate generated locally -> send to remote peer
    (pc as any).onicecandidate = (event: any) => {
      if (event.candidate && socket && otherUser?._id) {
        console.log('[WebRTC] Sending ICE candidate to peer...');
        socket.emit('ice_candidate', {
          to: otherUser._id,
          candidate: event.candidate,
        });
      }
    };

    // On Remote stream track received
    (pc as any).ontrack = (event: any) => {
      console.log('[WebRTC] Remote track received:', event.track?.kind, event.streams);
      const incomingStream = (event.streams && event.streams[0]) ? event.streams[0] : null;

      if (incomingStream) {
        incomingStream.getTracks().forEach((t: any) => { t.enabled = true; });
        if (remoteStreamRef.current !== incomingStream) {
          remoteStreamRef.current = incomingStream;
          setRemoteStream(incomingStream);
        }
      } else if (event.track) {
        if (!remoteStreamRef.current) {
          const newStream = new MediaStream([event.track]);
          newStream.getTracks().forEach((t: any) => { t.enabled = true; });
          remoteStreamRef.current = newStream;
          setRemoteStream(newStream);
        } else {
          if (!remoteStreamRef.current.getTracks().some((t: any) => t.id === event.track.id)) {
            remoteStreamRef.current.addTrack(event.track);
          }
        }
      }
      setCallStatus('connected');
    };

    pcRef.current = pc;
    return pc;
  };

  // Outgoing Call flow (Caller)
  const makeCall = async () => {
    setCallStatus('calling');
    const isVideo = callType === 'video';
    const stream = await startLocalStream(isVideo);
    if (!stream) {
      cleanupCall();
      return;
    }

    const pc = createPeerConnection(stream);
    try {
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);

      console.log('[WebRTC] Sending call offer to:', otherUser?._id);
      socket.emit('call_user', {
        userToCall: otherUser._id,
        signalData: offer,
        from: user?._id,
        callerName: user?.name || user?.username || 'User',
        callerPicture: user?.profilePicture,
        callerInfo: {
          _id: user?._id,
          name: user?.name || user?.username || 'User',
          username: user?.username,
          profilePicture: user?.profilePicture,
        },
        callType: callType,
      });
    } catch (err) {
      console.error('[WebRTC] Error creating call offer:', err);
      cleanupCall();
    }
  };

  // Incoming Call Answer flow (Callee accepts call)
  const acceptCall = async () => {
    if (!incomingOffer) return;
    setCallStatus('connected');
    const isVideo = callType === 'video';
    const stream = await startLocalStream(isVideo);
    if (!stream) {
      cleanupCall();
      return;
    }

    const pc = createPeerConnection(stream);
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      console.log('[WebRTC] Answering call from:', otherUser?._id);
      socket.emit('answer_call', {
        to: otherUser._id,
        signal: answer,
      });
    } catch (err) {
      console.error('[WebRTC] Error answering call:', err);
      cleanupCall();
    }
  };

  // Socket signaling listeners for call events
  useEffect(() => {
    if (!socket || !visible) return;

    if (isIncomingCall) {
      setCallStatus('incoming');
    } else {
      makeCall();
    }

    const handleCallAccepted = async (data: any) => {
      console.log('[WebRTC] Call accepted by remote user:', data);
      if (pcRef.current && data.signal) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.signal));
        setCallStatus('connected');
      }
    };

    const handleIceCandidate = async (data: any) => {
      console.log('[WebRTC] Received remote ICE candidate');
      if (pcRef.current && data.candidate) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error('[WebRTC] Error adding ICE candidate:', e);
        }
      }
    };

    const handleCallEnded = () => {
      console.log('[WebRTC] Call ended by peer');
      logCallRecord(callStatus === 'connected' ? 'completed' : 'missed');
      cleanupCall();
    };

    const handleCallRejected = () => {
      console.log('[WebRTC] Call rejected by peer');
      logCallRecord('rejected');
      cleanupCall();
    };

    socket.on('call_accepted', handleCallAccepted);
    socket.on('ice_candidate', handleIceCandidate);
    socket.on('call_ended', handleCallEnded);
    socket.on('call_rejected', handleCallRejected);

    return () => {
      socket.off('call_accepted', handleCallAccepted);
      socket.off('ice_candidate', handleIceCandidate);
      socket.off('call_ended', handleCallEnded);
      socket.off('call_rejected', handleCallRejected);
    };
  }, [socket, visible]);

  // Toggle Mute Audio
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted;
        setIsMuted(!isMuted);
      }
    }
  };

  // Toggle Video Camera
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = isVideoOff;
        setIsVideoOff(!isVideoOff);
      }
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleEndCall}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0D1B" />
      <ImageBackground
        source={require('../assets/call_bg_romantic.jpg')}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <SafeAreaView style={styles.container}>
          {/* Video Stream Rendering */}
          {callType === 'video' ? (
            remoteStream ? (
              <RTCView
                streamURL={remoteStream.toURL()}
                style={styles.remoteVideo}
                objectFit="cover"
                zOrder={0}
              />
            ) : localStream && !isVideoOff ? (
              <RTCView
                streamURL={localStream.toURL()}
                style={styles.remoteVideo}
                objectFit="cover"
                mirror={true}
                zOrder={0}
              />
            ) : (
              <View style={styles.voiceCallContainer}>
                <View style={styles.avatarWrapper}>
                  <Image
                    source={{ uri: getAvatarUrl(otherUser) }}
                    style={styles.avatarLarge}
                  />
                </View>
                <Text style={styles.userNameText}>{otherUser?.name || otherUser?.username || 'User'}</Text>
                <Text style={styles.statusText}>Connecting Video...</Text>
              </View>
            )
          ) : (
            /* Voice Call / Calling Background UI */
            <View style={styles.voiceCallContainer}>
              {/* Top Badge */}
              <View style={styles.topCallBadge}>
                <Image
                  source={require('../assets/generated_icons/voice_call_icon.jpg')}
                  style={{ width: 22, height: 22, borderRadius: 6 }}
                />
                <Text style={styles.topCallBadgeText}>ENCRYPTED VOICE CALL</Text>
              </View>

              {/* Avatar Pulse Animation Rings */}
              <View style={styles.avatarWrapper}>
                {(callStatus === 'calling' || callStatus === 'incoming') && (
                  <>
                    <Animated.View
                      style={[
                        styles.pulseRing,
                        {
                          transform: [{ scale: pulseAnim1 }],
                          opacity: pulseAnim1.interpolate({
                            inputRange: [1, 1.5],
                            outputRange: [0.6, 0],
                          }),
                        },
                      ]}
                    />
                    <Animated.View
                      style={[
                        styles.pulseRing,
                        {
                          transform: [{ scale: pulseAnim2 }],
                          opacity: pulseAnim2.interpolate({
                            inputRange: [1, 1.5],
                            outputRange: [0.6, 0],
                          }),
                        },
                      ]}
                    />
                  </>
                )}
                <Image
                  source={{
                    uri: getAvatarUrl(otherUser),
                  }}
                  style={styles.avatarLarge}
                />
              </View>

              <Text style={styles.userNameText}>{otherUser?.name || otherUser?.username || 'User'}</Text>
              <Text style={styles.statusText}>
                {callStatus === 'calling' && 'Calling...'}
                {callStatus === 'incoming' && 'Incoming Call...'}
                {callStatus === 'connected' && formatDuration(callSeconds)}
                {callStatus === 'ended' && 'Call Ended'}
              </Text>
            </View>
          )}

          {/* Local Floating Video View for Video Call (PIP) */}
          {callType === 'video' && localStream && !isVideoOff && (
            <View style={styles.localVideoContainer}>
              <RTCView
                streamURL={localStream.toURL()}
                style={styles.localVideo}
                objectFit="cover"
                mirror={true}
                zOrder={1}
              />
            </View>
          )}

          {/* Video Overlay Header Info */}
          {callType === 'video' && (
            <View style={styles.headerOverlay}>
              <Image
                source={{ uri: getAvatarUrl(otherUser) }}
                style={styles.headerAvatarSmall}
              />
              <View style={{ marginLeft: 10 }}>
                <Text style={styles.userNameOverlay}>{otherUser?.name || otherUser?.username || 'User'}</Text>
                <Text style={styles.statusOverlay}>
                  {callStatus === 'calling' ? 'Calling...' : callStatus === 'incoming' ? 'Incoming Call...' : callStatus === 'connected' ? formatDuration(callSeconds) : 'Connecting...'}
                </Text>
              </View>
            </View>
          )}

          {/* Controls Container */}
          <View style={styles.bottomControlsCard}>
            {callStatus === 'incoming' ? (
              /* Incoming Call Accept / Decline Buttons */
              <View style={styles.incomingControls}>
                <View style={{ alignItems: 'center' }}>
                  <TouchableOpacity style={[styles.controlBtn, styles.declineBtn]} onPress={handleEndCall}>
                    <Image
                      source={require('../assets/call_end.jpg')}
                      style={{ width: 44, height: 44, borderRadius: 22 }}
                    />
                  </TouchableOpacity>
                  <Text style={styles.btnLabel}>Decline</Text>
                </View>

                <View style={{ alignItems: 'center' }}>
                  <TouchableOpacity style={[styles.controlBtn, styles.acceptBtn]} onPress={acceptCall}>
                    <Image
                      source={require('../assets/call_mic.jpg')}
                      style={{ width: 44, height: 44, borderRadius: 22 }}
                    />
                  </TouchableOpacity>
                  <Text style={styles.btnLabel}>Accept</Text>
                </View>
              </View>
            ) : (
              /* Active / Calling Controls */
              <View style={styles.controlsRow}>
                <View style={{ alignItems: 'center' }}>
                  <TouchableOpacity
                    style={[styles.actionIconBtn, isMuted && styles.activeIconBtn]}
                    onPress={toggleMute}
                  >
                    <Image
                      source={require('../assets/call_mic.jpg')}
                      style={{ width: 34, height: 34, borderRadius: 17, opacity: isMuted ? 0.35 : 1 }}
                    />
                  </TouchableOpacity>
                  <Text style={styles.actionLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
                </View>

                {callType === 'video' && (
                  <View style={{ alignItems: 'center' }}>
                    <TouchableOpacity
                      style={[styles.actionIconBtn, isVideoOff && styles.activeIconBtn]}
                      onPress={toggleVideo}
                    >
                      <Image
                        source={require('../assets/call_camera.jpg')}
                        style={{ width: 34, height: 34, borderRadius: 17, opacity: isVideoOff ? 0.35 : 1 }}
                      />
                    </TouchableOpacity>
                    <Text style={styles.actionLabel}>{isVideoOff ? 'Camera On' : 'Camera Off'}</Text>
                  </View>
                )}

                <View style={{ alignItems: 'center' }}>
                  <TouchableOpacity
                    style={[styles.actionIconBtn, isSpeakerOn ? styles.speakerActiveBtn : {}]}
                    onPress={() => setIsSpeakerOn(!isSpeakerOn)}
                  >
                    <Image
                      source={require('../assets/call_speaker.jpg')}
                      style={{ width: 34, height: 34, borderRadius: 17, opacity: isSpeakerOn ? 1 : 0.4 }}
                    />
                  </TouchableOpacity>
                  <Text style={styles.actionLabel}>Speaker</Text>
                </View>

                <View style={{ alignItems: 'center' }}>
                  <TouchableOpacity style={[styles.actionIconBtn, styles.endCallBtn]} onPress={handleEndCall}>
                    <Image
                      source={require('../assets/call_end.jpg')}
                      style={{ width: 34, height: 34, borderRadius: 17 }}
                    />
                  </TouchableOpacity>
                  <Text style={styles.actionLabel}>End</Text>
                </View>
              </View>
            )}
          </View>
        </SafeAreaView>
      </ImageBackground>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#0B0D1B',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'space-between',
  },
  remoteVideo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: windowWidth,
    height: windowHeight,
  },
  localVideoContainer: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 110,
    height: 160,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#0066FF',
    elevation: 10,
    zIndex: 10,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  localVideo: {
    width: '100%',
    height: '100%',
  },
  voiceCallContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 60,
  },
  topCallBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.4)',
    marginBottom: 40,
  },
  topCallBadgeText: {
    color: '#C084FC',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  avatarWrapper: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  pulseRing: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#0066FF',
  },
  avatarLarge: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 4,
    borderColor: '#A855F7',
  },
  userNameText: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  statusText: {
    color: '#A7F3D0',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  headerOverlay: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatarSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#A855F7',
  },
  userNameOverlay: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 6,
  },
  statusOverlay: {
    color: '#A7F3D0',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  bottomControlsCard: {
    position: 'absolute',
    bottom: 28,
    left: 20,
    right: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderRadius: 36,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 20,
    zIndex: 30,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  incomingControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  actionIconBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  activeIconBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.35)',
    borderColor: '#EF4444',
  },
  speakerActiveBtn: {
    backgroundColor: 'rgba(168, 85, 247, 0.45)',
    borderColor: '#A855F7',
  },
  endCallBtn: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#EF4444',
    borderColor: '#F87171',
    borderWidth: 1.5,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 8,
  },
  actionLabel: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  controlBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 66,
    height: 66,
    borderRadius: 33,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  acceptBtn: {
    backgroundColor: '#22C55E',
    shadowColor: '#22C55E',
  },
  declineBtn: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
  },
  btnLabel: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
});

export default WebRTCCallModal;
