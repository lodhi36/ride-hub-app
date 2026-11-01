import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from './PngIcon';
import { useAppLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';

interface Props {
  currentTab: 'home' | 'bookings' | 'wallet' | 'offers' | 'profile';
  navigation: any;
}

const CustomerBottomNav: React.FC<Props> = ({ currentTab, navigation }) => {
  const { t } = useAppLanguage();
  const { isDark, currentColors } = useTheme('customer');

  const inactiveColor = isDark ? currentColors.disabled : '#64748B';

  return (
    <View style={[
      styles.bottomNav,
      isDark && {
        backgroundColor: currentColors.card,
        borderTopColor: currentColors.border,
      }
    ]}>
      <TouchableOpacity style={styles.navItem} onPress={() => {
        if (currentTab !== 'home') navigation.navigate('CustomerHomeScreen');
      }}>
        <Icon
          name={currentTab === 'home' ? 'home' : 'home-outline'}
          size={22}
          color={currentTab === 'home' ? '#0066FF' : inactiveColor}
        />
        <Text style={[styles.navText, { color: inactiveColor }, currentTab === 'home' && styles.navTextActive]}>
          {t('nav.home', 'Home')}
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.navItem} onPress={() => {
        if (currentTab !== 'bookings') navigation.navigate('MyBookingsScreen', { role: 'customer', title: t('nav.bookings', 'My Bookings') });
      }}>
        <Icon
          name={currentTab === 'bookings' ? 'receipt' : 'receipt-outline'}
          size={22}
          color={currentTab === 'bookings' ? '#0066FF' : inactiveColor}
        />
        <Text style={[styles.navText, { color: inactiveColor }, currentTab === 'bookings' && styles.navTextActive]}>
          {t('nav.bookings', 'My Bookings')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.navItem} onPress={() => {
        if (currentTab !== 'wallet') navigation.navigate('WalletScreen');
      }}>
        <Icon
          name={currentTab === 'wallet' ? 'wallet' : 'wallet-outline'}
          size={22}
          color={currentTab === 'wallet' ? '#0066FF' : inactiveColor}
        />
        <Text style={[styles.navText, { color: inactiveColor }, currentTab === 'wallet' && styles.navTextActive]}>
          {t('nav.wallet', 'Wallet')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.navItem} onPress={() => {
        if (currentTab !== 'offers') navigation.navigate('OffersScreen');
      }}>
        <Icon
          name={currentTab === 'offers' ? 'pricetag' : 'pricetag-outline'}
          size={22}
          color={currentTab === 'offers' ? '#0066FF' : inactiveColor}
        />
        <Text style={[styles.navText, { color: inactiveColor }, currentTab === 'offers' && styles.navTextActive]}>
          {t('nav.offers', 'Offers')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.navItem} onPress={() => {
        if (currentTab !== 'profile') navigation.navigate('CustomerProfileScreen');
      }}>
        <Icon
          name={currentTab === 'profile' ? 'person' : 'person-outline'}
          size={22}
          color={currentTab === 'profile' ? '#0066FF' : inactiveColor}
        />
        <Text style={[styles.navText, { color: inactiveColor }, currentTab === 'profile' && styles.navTextActive]}>
          {t('nav.profile', 'Profile')}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navText: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '600',
  },
  navTextActive: {
    color: '#0066FF',
    fontWeight: '800',
  },
});

export default CustomerBottomNav;
