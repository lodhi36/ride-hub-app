// import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

class PushNotificationService {
  async requestUserPermission() {
    if (Platform.OS === 'android') {
      const settings = await notifee.requestPermission();
      return settings.authorizationStatus >= 1;
    }
    return false;
  }

  async getFCMToken() {
    console.log('Firebase removed - no FCM token generated');
  }

  async syncTokenWithBackend(token: string) {
    try {
      const res = await api.post('/auth/update-fcm-token', { pushToken: token });
      console.log('FCM Token synced:', res.data);
    } catch (error) {
      console.log('Failed to sync FCM Token with backend', error);
    }
  }

  setupListeners(navigation: any) {
    // Check Notifee cold boot notification tap
    notifee.getInitialNotification().then(initialNotification => {
      if (initialNotification) {
        console.log('Notifee initial notification opened app:', initialNotification);
        this.handleNotificationInteraction(initialNotification.notification, navigation);
      }
    });

    const unsubscribeNotifee = notifee.onForegroundEvent(({ type, detail }) => {
      switch (type) {
        case EventType.DISMISSED:
          console.log('User dismissed notification', detail.notification);
          break;
        case EventType.PRESS:
          console.log('User pressed notification', detail.notification);
          this.handleNotificationInteraction(detail.notification, navigation);
          break;
      }
    });

    return () => {
      unsubscribeNotifee();
    };
  }

  handleNotificationInteraction(remoteMessage: any, navigation: any) {
    if (!navigation) return;
    const data = remoteMessage?.data || remoteMessage || {};

    if (data.type === 'INCOMING_CALL' || data.type === 'CALL' || data.callerId || data.callType) {
      const callerId = data.callerId || data.senderId || data.userId;
      const callType = data.callType || (data.type === 'VOICE_CALL' ? 'voice' : 'video');
      navigation.navigate('ChatRoom', {
        chatId: data.chatId,
        receiverId: callerId,
        userId: callerId,
        autoStartCall: true,
        callType: callType,
        isIncomingCall: true,
      });
    } else if (data.type === 'CHAT' && (data.senderId || data.chatId)) {
      navigation.navigate('ChatRoom', {
        chatId: data.chatId,
        receiverId: data.senderId,
        userId: data.senderId
      });
    } else {
      navigation.navigate('Notifications');
    }
  }

  async displayLocalNotification(remoteMessage: any) {
    try {
      if (!remoteMessage) return;
      const { notification, data } = remoteMessage;

      if (data?.type === 'INCOMING_CALL' || data?.callType || data?.callerId) {
        return;
      }

      const channelId = await notifee.createChannel({
        id: 'whats_ringtone_channel_v1',
        name: 'Notifications with Sound',
        importance: AndroidImportance.HIGH,
        vibration: true,
        vibrationPattern: [300, 500],
        sound: 'whats_ringtone',
      });

      await notifee.displayNotification({
        title: notification?.title || 'New Notification',
        body: notification?.body || '',
        data: data,
        android: {
          channelId,
          importance: AndroidImportance.HIGH,
          sound: 'whats_ringtone',
          pressAction: {
            id: 'default',
          },
        },
      });
    } catch (err) {
      console.log('Error displaying local notification:', err);
    }
  }
}

export default new PushNotificationService();

