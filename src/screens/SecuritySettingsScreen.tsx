import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Image, Modal, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/PngIcon';
import { useTheme } from '../context/ThemeContext';
import { colors, typography, spacing, radius } from '../theme/colors';

const SecuritySettingsScreen = ({ navigation }: any) => {
  const { currentColors } = useTheme();
  
  const [modalVisible, setModalVisible] = React.useState(false);
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    try {
      setLoading(true);
      // Simulate API call
      setTimeout(() => {
        setLoading(false);
        Alert.alert('Success', 'Password changed successfully!');
        setModalVisible(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }, 1000);
    } catch (error: any) {
      setLoading(false);
      Alert.alert('Error', error.response?.data?.message || 'Failed to change password');
    }
  };

  const handleLogoutAll = () => {
    Alert.alert('Logout All Devices', 'Are you sure you want to log out of all other devices?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => console.log('Logged out of all') }
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: currentColors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Image source={require('../assets/generated_icons/back_arrow_icon.jpg')} style={{ width: 24, height: 24 }} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: currentColors.text }]}>Security</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        <Text style={[styles.sectionTitle, { color: currentColors.textMuted }]}>Account Access</Text>
        <View style={[styles.card, { backgroundColor: currentColors.surface }]}>
          <TouchableOpacity 
            style={[styles.row, { borderBottomColor: currentColors.border }]}
            onPress={() => setModalVisible(true)}
          >
            <View style={styles.deviceIcon}>
              <Image source={require('../assets/generated_icons/password_icon.jpg')} style={{ width: 24, height: 24 }} />
            </View>
            <View style={styles.rowLeft}>
              <Text style={[styles.rowTitle, { color: currentColors.text }]}>Change Password</Text>
              <Text style={[styles.rowDesc, { color: currentColors.textMuted }]}>Update your account password</Text>
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.row, { borderBottomWidth: 0 }]}>
            <View style={styles.deviceIcon}>
              <Image source={require('../assets/generated_icons/shield_icon.jpg')} style={{ width: 24, height: 24 }} />
            </View>
            <View style={styles.rowLeft}>
              <Text style={[styles.rowTitle, { color: currentColors.text }]}>Two-Factor Authentication</Text>
              <Text style={[styles.rowDesc, { color: currentColors.textMuted }]}>Add an extra layer of security</Text>
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogoutAll}>
          <Text style={styles.logoutButtonText}>Log Out From All Devices</Text>
        </TouchableOpacity>

      </ScrollView>

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: currentColors.surface }]}>
            <Text style={[styles.modalTitle, { color: currentColors.text }]}>Change Password</Text>
            
            <TextInput
              style={[styles.input, { color: currentColors.text, borderColor: currentColors.border }]}
              placeholder="Current Password"
              placeholderTextColor={currentColors.textMuted}
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
            />
            
            <TextInput
              style={[styles.input, { color: currentColors.text, borderColor: currentColors.border }]}
              placeholder="New Password"
              placeholderTextColor={currentColors.textMuted}
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />
            
            <TextInput
              style={[styles.input, { color: currentColors.text, borderColor: currentColors.border }]}
              placeholder="Confirm New Password"
              placeholderTextColor={currentColors.textMuted}
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalBtn, { backgroundColor: currentColors.border }]} 
                onPress={() => setModalVisible(false)}
              >
                <Text style={{ color: currentColors.text, fontWeight: 'bold' }}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalBtn, { backgroundColor: colors.primary }]} 
                onPress={handleChangePassword}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    padding: spacing.xs,
    marginLeft: -spacing.xs,
  },
  headerTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: 'bold',
  },
  content: {
    padding: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft: {
    flex: 1,
    paddingRight: spacing.md,
  },
  rowTitle: {
    fontSize: typography.sizes.md,
    fontWeight: '600',
    marginBottom: 4,
  },
  rowDesc: {
    fontSize: typography.sizes.sm,
    lineHeight: 18,
  },
  deviceIcon: {
    marginRight: spacing.md,
    width: 30,
    alignItems: 'center',
  },
  logoutButton: {
    marginTop: spacing.xxl,
    padding: spacing.lg,
    backgroundColor: '#FEE2E2',
    borderRadius: radius.md,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: colors.error,
    fontSize: typography.sizes.md,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    padding: spacing.xl,
    borderRadius: radius.lg,
  },
  modalTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: 'bold',
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    fontSize: typography.sizes.md,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  modalBtn: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    marginHorizontal: spacing.xs,
  },
});

export default SecuritySettingsScreen;
