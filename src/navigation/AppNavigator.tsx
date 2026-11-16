import React, { useContext, useEffect } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme as NavigationDarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AuthContext, useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { navigationRef } from '../services/NavigationService';
import PushNotificationService from '../services/PushNotificationService';


// Auth Screens
import SplashScreen from '../screens/SplashScreen';
import AppIntroScreen from '../screens/AppIntroScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import ProfileSetupScreen from '../screens/ProfileSetupScreen';

// Nested Screens
import ProfileDetailsScreen from '../screens/ProfileDetailsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import CustomerProfileScreen from '../screens/CustomerProfileScreen';
import ChatScreen from '../screens/ChatScreen';
import TermsScreen from '../screens/TermsScreen';
import PrivacyScreen from '../screens/PrivacyScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AccountSettingsScreen from '../screens/AccountSettingsScreen';
import PrivacySettingsScreen from '../screens/PrivacySettingsScreen';
import NotificationSettingsScreen from '../screens/NotificationSettingsScreen';
import SecuritySettingsScreen from '../screens/SecuritySettingsScreen';
import PremiumUpgradeScreen from '../screens/PremiumUpgradeScreen';
import LegalSupportScreen from '../screens/LegalSupportScreen';
import HelpCenterScreen from '../screens/HelpCenterScreen';
import AIAgentChatScreen from '../screens/AIAgentChatScreen';
import ContactSupportScreen from '../screens/ContactSupportScreen';
import ReportProblemScreen from '../screens/ReportProblemScreen';
import CommunityGuidelinesScreen from '../screens/CommunityGuidelinesScreen';
import RefundPolicyScreen from '../screens/RefundPolicyScreen';
import LiveBroadcastScreen from '../screens/LiveBroadcastScreen';
import LiveViewerScreen from '../screens/LiveViewerScreen';
import EarningsScreen from '../screens/EarningsScreen';

// Ride Test Flow Screens
import RoleSelectionScreen from '../screens/RoleSelectionScreen';
import RiderRegistrationScreen from '../screens/RiderRegistrationScreen';
import DeliveryRegistrationScreen from '../screens/DeliveryRegistrationScreen';
import CustomerRegistrationScreen from '../screens/CustomerRegistrationScreen';
import CustomerHomeScreen from '../screens/CustomerHomeScreen';
import MyBookingsScreen from '../screens/MyBookingsScreen';
import WalletScreen from '../screens/WalletScreen';
import OffersScreen from '../screens/OffersScreen';
import RiderHomeScreen from '../screens/RiderHomeScreen';
import DeliveryRiderHomeScreen from '../screens/DeliveryRiderHomeScreen';
import ServiceBookingScreen from '../screens/ServiceBookingScreen';
import SingleOrderStatusScreen from '../screens/SingleOrderStatusScreen';
import PaymentConfirmScreen from '../screens/PaymentConfirmScreen';
import OrderSuccessScreen from '../screens/OrderSuccessScreen';
import LiveTrackingScreen from '../screens/LiveTrackingScreen';
import SellerPendingApprovalScreen from '../screens/SellerPendingApprovalScreen';

// Custom Flow Screens
import CategoriesScreen from '../screens/CategoriesScreen';
import SubcategoriesScreen from '../screens/SubcategoriesScreen';
import NotificationScreen from '../screens/NotificationScreen';

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
  const { user, isLoading } = useAuth();
  const { isDark, currentColors } = useTheme();

  useEffect(() => {
    if (user) {
      PushNotificationService.requestUserPermission().then(granted => {
        if (granted) {
          PushNotificationService.getFCMToken();
        }
      });
    }
  }, [user]);

  useEffect(() => {
    const navigationProxy = {
      navigate: (name: string, params?: any) => {
        if (navigationRef.isReady()) {
          navigationRef.navigate(name, params);
        }
      }
    };
    const unsubscribe = PushNotificationService.setupListeners(navigationProxy);
    return unsubscribe;
  }, []);

  const customTheme = isDark ? {
    ...NavigationDarkTheme,
    colors: { ...NavigationDarkTheme.colors, background: currentColors.background, card: currentColors.surface, text: currentColors.text }
  } : {
    ...DefaultTheme,
    colors: { ...DefaultTheme.colors, background: currentColors.background, card: currentColors.surface, text: currentColors.text }
  };

  if (isLoading) {
    return null;
  }

  return (
    <NavigationContainer theme={customTheme} ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="SplashScreen">
        <Stack.Screen name="SplashScreen" component={SplashScreen} />
        <Stack.Screen name="AppIntro" component={AppIntroScreen} />
        <Stack.Screen name="RoleSelection" component={RoleSelectionScreen} />
        <Stack.Screen name="CustomerRegistration" component={CustomerRegistrationScreen} initialParams={{ initialMode: 'signup' }} />
        <Stack.Screen name="CustomerLogin" component={CustomerRegistrationScreen} initialParams={{ initialMode: 'login' }} />
        <Stack.Screen name="RiderRegistration" component={RiderRegistrationScreen} />
        <Stack.Screen name="SupplierRegistration" component={RiderRegistrationScreen} initialParams={{ initialMode: 'signup' }} />
        <Stack.Screen name="SupplierLogin" component={RiderRegistrationScreen} initialParams={{ initialMode: 'login' }} />
        <Stack.Screen name="DeliveryRegistration" component={DeliveryRegistrationScreen} initialParams={{ initialMode: 'signup' }} />
        <Stack.Screen name="DeliveryLogin" component={DeliveryRegistrationScreen} initialParams={{ initialMode: 'login' }} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />

        <Stack.Screen name="CustomerHomeScreen" component={CustomerHomeScreen} />
        <Stack.Screen name="CategoriesScreen" component={CategoriesScreen} />
        <Stack.Screen name="Subcategories" component={SubcategoriesScreen} />
        <Stack.Screen name="Notifications" component={NotificationScreen} />
        <Stack.Screen name="MyBookingsScreen" component={MyBookingsScreen} />
        <Stack.Screen name="WalletScreen" component={WalletScreen} />
        <Stack.Screen name="OffersScreen" component={OffersScreen} />
        <Stack.Screen name="RiderHomeScreen" component={RiderHomeScreen} />
        <Stack.Screen name="DeliveryRiderHomeScreen" component={DeliveryRiderHomeScreen} />
        <Stack.Screen name="SellerPendingApprovalScreen" component={SellerPendingApprovalScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ServiceBooking" component={ServiceBookingScreen} />
        <Stack.Screen name="SingleOrderStatus" component={SingleOrderStatusScreen} />
        <Stack.Screen name="SingleOrderStatusScreen" component={SingleOrderStatusScreen} />
        <Stack.Screen name="PaymentConfirmScreen" component={PaymentConfirmScreen} />
        <Stack.Screen name="PaymentConfirm" component={PaymentConfirmScreen} />
        <Stack.Screen name="OrderSuccessScreen" component={OrderSuccessScreen} />
        <Stack.Screen name="OrderSuccess" component={OrderSuccessScreen} />
        <Stack.Screen name="LiveTracking" component={LiveTrackingScreen} />
        <Stack.Screen name="CustomerProfile" component={CustomerProfileScreen} />
        <Stack.Screen name="CustomerProfileScreen" component={CustomerProfileScreen} />
        <Stack.Screen name="ProfileScreen" component={ProfileScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="ProfileDetails" component={ProfileDetailsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ChatRoom" component={ChatScreen} options={{ headerShown: true, title: 'Chat' }} />
        <Stack.Screen name="ChatScreen" component={ChatScreen} options={{ headerShown: true, title: 'Chat' }} />
        <Stack.Screen name="Terms" component={TermsScreen} options={{ headerShown: true, title: 'Terms & Conditions' }} />
        <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ headerShown: true, title: 'Privacy Policy' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ presentation: 'card' }} />
        <Stack.Screen name="AccountSettings" component={AccountSettingsScreen} />
        <Stack.Screen name="PrivacySettings" component={PrivacySettingsScreen} />
        <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
        <Stack.Screen name="SecuritySettings" component={SecuritySettingsScreen} />
        <Stack.Screen name="Earnings" component={EarningsScreen} />
        <Stack.Screen name="EarningsScreen" component={EarningsScreen} />
        <Stack.Screen name="LiveTrackingScreen" component={LiveTrackingScreen} />
        <Stack.Screen name="ChatList" component={require('../screens/ChatListScreen').default} />
        <Stack.Screen name="RestaurantMenu" component={require('../screens/RestaurantMenuScreen').default} />
        <Stack.Screen name="Menu" component={require('../screens/RestaurantMenuScreen').default} />
        <Stack.Screen name="RestaurantProfileScreen" component={require('../screens/RestaurantProfileScreen').default} />
        <Stack.Screen name="RestaurantProfile" component={require('../screens/RestaurantProfileScreen').default} />
        <Stack.Screen name="RestaurantDetails" component={require('../screens/RestaurantDetailsScreen').default} />
        <Stack.Screen name="RestaurantDetailsScreen" component={require('../screens/RestaurantDetailsScreen').default} />
        <Stack.Screen name="ItemDetailsScreen" component={require('../screens/ItemDetailsScreen').default} />
        <Stack.Screen name="ItemDetails" component={require('../screens/ItemDetailsScreen').default} />
        <Stack.Screen name="FashionScreen" component={require('../screens/FashionScreen').default} />
        <Stack.Screen name="Fashion" component={require('../screens/FashionScreen').default} />
        <Stack.Screen name="FashionSubcategoriesScreen" component={require('../screens/FashionSubcategoriesScreen').default} />
        <Stack.Screen name="FashionSubcategories" component={require('../screens/FashionSubcategoriesScreen').default} />
        <Stack.Screen name="ProductListingScreen" component={require('../screens/ProductListingScreen').default} />
        <Stack.Screen name="ProductListing" component={require('../screens/ProductListingScreen').default} />
        <Stack.Screen name="CartScreen" component={require('../screens/CartScreen').default} />
        <Stack.Screen name="Cart" component={require('../screens/CartScreen').default} />
        <Stack.Screen name="CheckoutScreen" component={require('../screens/CartScreen').default} />
        <Stack.Screen name="PremiumUpgrade" component={PremiumUpgradeScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="LegalSupport" component={LegalSupportScreen} />
        <Stack.Screen name="HelpCenter" component={HelpCenterScreen} />
        <Stack.Screen name="AIAgentChat" component={AIAgentChatScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ContactSupport" component={ContactSupportScreen} />
        <Stack.Screen name="ReportProblem" component={ReportProblemScreen} />
        <Stack.Screen name="CommunityGuidelines" component={CommunityGuidelinesScreen} />
        <Stack.Screen name="RefundPolicy" component={RefundPolicyScreen} />
        <Stack.Screen name="LiveBroadcast" component={LiveBroadcastScreen} options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="LiveViewer" component={LiveViewerScreen} options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="MyEarnings" component={require('../screens/MyEarningsScreen').default} options={{ headerShown: false }} />
        <Stack.Screen name="OutOfStockScreen" component={require('../screens/OutOfStockScreen').default} options={{ headerShown: false }} />
        <Stack.Screen name="RestaurantClosedScreen" component={require('../screens/RestaurantClosedScreen').default} options={{ headerShown: false }} />
        <Stack.Screen name="SecureMediaViewer" component={require('../screens/SecureMediaViewerScreen').default} options={{ presentation: 'fullScreenModal', headerShown: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};


export default AppNavigator;
