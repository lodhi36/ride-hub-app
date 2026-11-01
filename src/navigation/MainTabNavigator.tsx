import React, { useRef, useEffect } from 'react';
import { Dimensions, Image, View, StyleSheet, Animated, Text, Platform, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from '../components/PngIcon';

const windowWidth = Dimensions.get('window').width;

import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { colors, shadows } from '../theme/colors';
import { UPLOADS_URL } from '../services/api';

// Screens
import HomeScreen from '../screens/HomeScreen';
import NotificationScreen from '../screens/NotificationScreen';
import ChatListScreen from '../screens/ChatListScreen';
import LiveBroadcastScreen from '../screens/LiveBroadcastScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();

interface StandardTabIconProps {
  name: string;
  focused: boolean;
  activeColor?: string;
}

const StandardTabIcon: React.FC<StandardTabIconProps> = ({
  name,
  focused,
  activeColor = colors.primary,
}) => {
  const scaleAnim  = useRef(new Animated.Value(focused ? 1 : 0.85)).current;
  const opacityAnim = useRef(new Animated.Value(focused ? 1 : 0.5)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: focused ? 1 : 0.85,
        useNativeDriver: true,
        tension: 220,
        friction: 9,
      }),
      Animated.timing(opacityAnim, {
        toValue: focused ? 1 : 0.5,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [focused]);

  return (
    <Animated.View
      style={[
        styles.iconWrapper,
        { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
      ]}
    >
      <Icon name={name} size={24} color={focused ? activeColor : '#8E8E93'} />
      {focused && (
        <View style={[styles.activeDot, { backgroundColor: activeColor }]} />
      )}
    </Animated.View>
  );
};

// ─── Profile Tab Icon — shows real avatar OR Icon ─────────────────────────
interface ProfileTabIconProps {
  profilePicUri: string | null;
  focused: boolean;
}

const ProfileTabIcon: React.FC<ProfileTabIconProps> = ({
  profilePicUri,
  focused,
}) => {
  const scaleAnim   = useRef(new Animated.Value(focused ? 1 : 0.85)).current;
  const opacityAnim = useRef(new Animated.Value(focused ? 1 : 0.5)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: focused ? 1 : 0.85,
        useNativeDriver: true,
        tension: 220,
        friction: 9,
      }),
      Animated.timing(opacityAnim, {
        toValue: focused ? 1 : 0.5,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [focused]);

  if (profilePicUri) {
    return (
      <Animated.View
        style={[
          styles.iconWrapper,
          { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
        ]}
      >
        <View
          style={[
            styles.avatarWrapper,
            focused && styles.avatarFocused,
          ]}
        >
          <Image source={{ uri: profilePicUri }} style={styles.avatarImage} />
        </View>
        {focused && (
          <View style={[styles.activeDot, { backgroundColor: colors.primary }]} />
        )}
      </Animated.View>
    );
  }

  // No photo → show standard Icon
  return (
    <StandardTabIcon
      name="person"
      focused={focused}
      activeColor={colors.primary}
    />
  );
};

// ─── Main Tab Navigator ───────────────────────────────────────────────────────
const MainTabNavigator = () => {
  const { isDark, currentColors } = useTheme();
  const { user } = useAuth();
  const { unreadNotifCount, unreadMsgCount } = useSocket();
  const insets = useSafeAreaInsets();

  const profilePicUri = user?.profilePicture
    ? `${UPLOADS_URL}${user.profilePicture.replace('/uploads', '')}`
    : null;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => {
          switch (route.name) {
            case 'Discover':
              return (
                <StandardTabIcon
                  name="home"
                  focused={focused}
                  activeColor={colors.primary}
                />
              );
            case 'Notifications':
              return (
                <StandardTabIcon
                  name="notifications"
                  focused={focused}
                  activeColor={colors.primary}
                />
              );
            case 'Chat':
              return (
                <StandardTabIcon
                  name="chatbubble"
                  focused={focused}
                  activeColor={colors.primary}
                />
              );
            case 'Live':
              return (
                <StandardTabIcon
                  name="videocam"
                  focused={focused}
                  activeColor={colors.primary}
                />
              );
            case 'Profile':
              return (
                <ProfileTabIcon
                  profilePicUri={profilePicUri}
                  focused={focused}
                />
              );
            default:
              return (
                <Icon
                  name="home"
                  size={24}
                  color={
                    focused ? colors.primary : currentColors.placeholder
                  }
                />
              );
          }
        },

        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: currentColors.placeholder,

        tabBarStyle: {
          backgroundColor: currentColors.surface,
          borderTopColor: isDark ? 'transparent' : currentColors.border,
          borderTopWidth: isDark ? 0 : 1,
          height: Platform.OS === 'ios' ? (60 + insets.bottom) : (65 + Math.max(insets.bottom, 12)),
          paddingTop: 6,
          paddingBottom: Platform.OS === 'ios' ? insets.bottom : Math.max(insets.bottom, 12),
          elevation: isDark ? 0 : 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: isDark ? 0 : 0.08,
          shadowRadius: 12,
          ...(isDark ? {} : shadows.lg),
        },

        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          marginTop: -2,
          letterSpacing: 0.3,
        },

        headerShown: false,
      })}
    >
      <Tab.Screen name="Discover" component={HomeScreen} />
      <Tab.Screen 
        name="Notifications"  
        component={NotificationScreen} 
        options={{
          tabBarBadge: unreadNotifCount > 0 ? unreadNotifCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.primary,
            color: '#FFF',
            fontSize: 10,
            fontWeight: '700',
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            lineHeight: 16,
          },
        }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatListScreen}
        options={{
          tabBarBadge: unreadMsgCount > 0 ? unreadMsgCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.primary,
            color: '#FFF',
            fontSize: 10,
            fontWeight: '700',
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            lineHeight: 16,
          },
        }}
      />
      <Tab.Screen 
        name="Live" 
        component={LiveBroadcastScreen} 
        listeners={({ navigation }) => ({
          tabPress: e => {
            e.preventDefault();
            Alert.alert(
              'Go Live?',
              'Do you want to start a live broadcast?',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Yes', onPress: () => navigation.navigate('LiveBroadcast') }
              ]
            );
          },
        })}
      />
      <Tab.Screen name="Profile"  component={ProfileScreen} />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48, height: 48,
  },
  lottieIcon: {
    width: 40, height: 40,
  },
  activeDot: {
    width: 4, height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
  avatarWrapper: {
    width: 34, height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarFocused: {
    borderColor: colors.primary,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
});

export default MainTabNavigator;
