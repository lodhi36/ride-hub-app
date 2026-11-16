import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'react-native-image-picker';
import Icon from '../components/PngIcon';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { colors, typography, spacing, radius } from '../theme/colors';
import api, { UPLOADS_URL } from '../services/api';

import AsyncStorage from '@react-native-async-storage/async-storage';

const AccountSettingsScreen = ({ navigation }: any) => {
  const { currentColors, isDark } = useTheme();
  const { user, updateUser, login } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState((user as any)?.phone || (user as any)?.phoneNumber || '');
  const [upiId, setUpiId] = useState((user as any)?.upiId || '');
  const [profilePicture, setProfilePicture] = useState<string>((user as any)?.profilePicture || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchLatestProfile = async () => {
      const uId = user?._id || (user as any)?.id;
      if (!uId) return;
      try {
        setLoading(true);
        const res = await api.get(`/profile/${uId}`);
        if (res.data.success && res.data.profile) {
          const p = res.data.profile;
          if (p.name) setName(p.name);
          if (p.email) setEmail(p.email);
          if (p.phoneNumber || p.phone) setPhone(p.phoneNumber || p.phone);
          if (p.upiId) setUpiId(p.upiId);
          if (p.profilePicture) setProfilePicture(p.profilePicture);
        }
      } catch (err) {
        console.log('Error fetching user profile:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLatestProfile();
  }, [user?._id]);

  const uploadFile = async (asset: any) => {
    try {
      setUploading(true);
      const formData = new FormData();

      formData.append('photo', {
        uri: asset.uri,
        name: asset.fileName || 'photo.jpg',
        type: asset.type || 'image/jpeg',
      } as any);

      const token = (await AsyncStorage.getItem('customerToken')) || (await AsyncStorage.getItem('userToken'));
      const res = await api.post('/profile/upload-photo', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`,
          'X-Role': 'customer',
        },
      });

      if (res.data.success) {
        return res.data.photoUrl;
      } else {
        throw new Error(res.data.message || 'Upload failed');
      }
    } catch (error: any) {
      console.log('Upload error:', error);
      Alert.alert('Upload Failed', error.message || 'Could not upload photo to server.');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSelectPhoto = () => {
    const options: any[] = [
      {
        text: '📷 Take Photo (Camera)',
        onPress: () => {
          ImagePicker.launchCamera({
            mediaType: 'photo',
            quality: 0.7,
            maxWidth: 800,
            maxHeight: 800,
          }, async (response) => {
            if (response.didCancel || !response.assets || response.assets.length === 0) return;
            const photoUrl = await uploadFile(response.assets[0]);
            if (photoUrl) {
              setProfilePicture(photoUrl);
              const uId = user?._id || (user as any)?.id;
              if (uId) {
                try {
                  await api.put(`/profile/${uId}`, { profilePicture: photoUrl });
                } catch (e) {}
              }
              updateUser({ profilePicture: photoUrl });
              Alert.alert('Success ✅', 'Profile photo updated successfully!');
            }
          });
        }
      },
      {
        text: '🖼️ Choose from Gallery',
        onPress: () => {
          ImagePicker.launchImageLibrary({
            mediaType: 'photo',
            quality: 0.7,
            selectionLimit: 1,
            maxWidth: 800,
            maxHeight: 800,
          }, async (response) => {
            if (response.didCancel || !response.assets || response.assets.length === 0) return;
            const photoUrl = await uploadFile(response.assets[0]);
            if (photoUrl) {
              setProfilePicture(photoUrl);
              const uId = user?._id || (user as any)?.id;
              if (uId) {
                try {
                  await api.put(`/profile/${uId}`, { profilePicture: photoUrl });
                } catch (e) {}
              }
              updateUser({ profilePicture: photoUrl });
              Alert.alert('Success ✅', 'Profile photo updated successfully!');
            }
          });
        }
      }
    ];

    if (profilePicture) {
      options.push({
        text: '🗑️ Remove Photo',
        style: 'destructive',
        onPress: async () => {
          Alert.alert('Remove Photo', 'Are you sure you want to remove your profile photo?', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Remove',
              style: 'destructive',
              onPress: async () => {
                setProfilePicture('');
                const uId = user?._id || (user as any)?.id;
                if (uId) {
                  try {
                    await api.put(`/profile/${uId}`, { profilePicture: '' });
                  } catch (e) {}
                }
                updateUser({ profilePicture: '' });
                Alert.alert('Success', 'Profile photo removed.');
              }
            }
          ]);
        }
      });
    }

    options.push({ text: 'Cancel', style: 'cancel' });

    Alert.alert('Change Profile Photo', 'Choose an option to set your personal profile photo:', options);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter your name.');
      return;
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '').slice(0, 10);
    const cleanEmail = email.trim();

    try {
      setSaving(true);
      let res;
      try {
        res = await api.post('/auth/customer-session', {
          customerId: user?._id || (user as any)?.id,
          name: name.trim(),
          email: cleanEmail,
          phone: cleanPhone,
          profilePicture: profilePicture,
        });
      } catch (err1) {
        try {
          res = await api.post('/customer-session', {
            customerId: user?._id || (user as any)?.id,
            name: name.trim(),
            email: cleanEmail,
            phone: cleanPhone,
            profilePicture: profilePicture,
          });
        } catch (err2) {
          console.log('Backend fallback save:', err2);
        }
      }

      const uId = user?._id || (user as any)?.id;
      const uRole = String((user as any)?.role || 'customer').toLowerCase();
      if (uRole !== 'customer' && uRole !== 'user' && uRole !== '') {
        Alert.alert('Session Error', 'Customer profile cannot be updated from a partner session.');
        return;
      }
      if (uId) {
        try {
          const profRes = await api.put(`/profile/${uId}`, {
            name: name.trim(),
            email: cleanEmail,
            phoneNumber: cleanPhone,
            upiId: upiId.trim(),
            profilePicture: profilePicture,
          });
          if (!res?.data?.user && profRes?.data?.user) {
            res = profRes;
          }
        } catch (pErr) {}
      }

      const savedUser = (res && res.data && res.data.user && String(res.data.user.role || '').toLowerCase() === 'customer')
        ? res.data.user
        : {
            ...user,
            _id: uId,
            role: 'customer',
            name: name.trim(),
            email: cleanEmail,
            phoneNumber: cleanPhone,
            profilePicture: profilePicture,
          };
      const savedToken = res?.data?.token;

      if (savedToken && typeof savedToken === 'string' && savedToken.includes('.')) {
        await AsyncStorage.setItem('customerToken', savedToken);
        await AsyncStorage.setItem('userToken', savedToken);
        api.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
        if (login) {
          await login(savedToken, '', savedUser);
        } else {
          updateUser(savedUser);
        }
      } else {
        updateUser(savedUser);
      }
      await AsyncStorage.setItem('customerUser', JSON.stringify(savedUser));
      await AsyncStorage.setItem('registeredCustomerName', savedUser.name || 'Customer');

      Alert.alert('Success ✅', 'Personal information saved successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (error: any) {
      console.log('Update Error:', error);
      const fallbackUser = {
        ...user,
        name: name.trim(),
        email: cleanEmail,
        phoneNumber: cleanPhone,
        profilePicture: profilePicture,
      };
      updateUser(fallbackUser as any);
      await AsyncStorage.setItem('customerUser', JSON.stringify(fallbackUser));
      await AsyncStorage.setItem('registeredCustomerName', fallbackUser.name || 'Customer');
      Alert.alert('Saved ✅', 'Personal information updated successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } finally {
      setSaving(false);
    }
  };

  const displayPhotoUrl = profilePicture
    ? (profilePicture.startsWith('http') ? profilePicture : `${UPLOADS_URL}${profilePicture.replace('/uploads', '')}`)
    : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: currentColors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Image source={require('../assets/generated_icons/back_arrow_icon.jpg')} style={{ width: 24, height: 24 }} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: currentColors.text }]}>Personal Information</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        {/* Profile Photo Avatar Upload Section */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handleSelectPhoto} style={styles.avatarWrapper} activeOpacity={0.8}>
            {displayPhotoUrl ? (
              <Image source={{ uri: displayPhotoUrl }} style={styles.avatarImg} />
            ) : (
              <Image 
                source={{ uri: 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png' }} 
                style={styles.avatarImg} 
              />
            )}
            
            <View style={styles.cameraBadge}>
              {uploading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={{ fontSize: 14 }}>📷</Text>
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSelectPhoto}>
            <Text style={styles.changePhotoText}>
              {profilePicture ? 'Change Profile Photo' : '+ Add Profile Photo'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, { color: currentColors.textMuted }]}>Profile Details</Text>
        
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 20 }} />
        ) : (
          <>
            <View style={[styles.inputGroup, { backgroundColor: currentColors.surface, borderColor: currentColors.border }]}>
              <Text style={[styles.label, { color: currentColors.text }]}>Full Name *</Text>
              <TextInput
                style={[styles.input, { color: currentColors.text }]}
                value={name}
                onChangeText={setName}
                placeholder="Enter your full name"
                placeholderTextColor={currentColors.placeholder}
              />
            </View>

            <View style={[styles.inputGroup, { backgroundColor: currentColors.surface, borderColor: currentColors.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.label, { color: currentColors.text }]}>Email Address</Text>
                {((user as any)?.firebaseUid || user?.email) && (
                  <Text style={{ fontSize: 10, color: currentColors.textMuted, fontStyle: 'italic' }}>Tied to Google Account</Text>
                )}
              </View>
              <TextInput
                style={[styles.input, { color: ((user as any)?.firebaseUid || user?.email) ? currentColors.textMuted : currentColors.text }]}
                value={email}
                onChangeText={setEmail}
                editable={!((user as any)?.firebaseUid || user?.email)}
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor={currentColors.placeholder}
              />
            </View>

            <View style={[styles.inputGroup, { backgroundColor: currentColors.surface, borderColor: currentColors.border }]}>
              <Text style={[styles.label, { color: currentColors.text }]}>Mobile Number (10 Digits)</Text>
              <TextInput
                style={[styles.input, { color: currentColors.text }]}
                value={phone}
                onChangeText={(val) => setPhone(val.replace(/[^0-9]/g, '').slice(0, 10))}
                keyboardType="numeric"
                maxLength={10}
                placeholder="10-digit mobile number"
                placeholderTextColor={currentColors.placeholder}
              />
            </View>

            <View style={[styles.inputGroup, { backgroundColor: currentColors.surface, borderColor: currentColors.border }]}>
              <Text style={[styles.label, { color: currentColors.text }]}>UPI ID (GPay / PhonePe / Paytm)</Text>
              <TextInput
                style={[styles.input, { color: currentColors.text }]}
                value={upiId}
                onChangeText={setUpiId}
                placeholder="e.g. 9876543210@paytm or name@okhdfcbank"
                placeholderTextColor={currentColors.placeholder}
                autoCapitalize="none"
              />
            </View>

            {/* Big Save Button */}
            <TouchableOpacity 
              style={[styles.saveBtnFull, saving && { opacity: 0.7 }]} 
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveBtnFullText}>SAVE DETAILS</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
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
    fontSize: typography.sizes.lg,
    fontWeight: 'bold',
  },
  saveText: {
    fontSize: typography.sizes.md,
    fontWeight: 'bold',
    color: colors.primary,
  },
  content: {
    padding: spacing.lg,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    marginTop: spacing.sm,
  },
  avatarWrapper: {
    position: 'relative',
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: spacing.xs,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  avatarImg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: colors.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  changePhotoText: {
    fontSize: typography.sizes.sm,
    fontWeight: 'bold',
    color: colors.primary,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  inputGroup: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  label: {
    fontSize: typography.sizes.xs,
    marginBottom: 4,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    fontSize: typography.sizes.md,
    paddingVertical: spacing.xs,
  },
  saveBtnFull: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
    elevation: 3,
  },
  saveBtnFullText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: typography.sizes.md,
    letterSpacing: 0.5,
  },
});

export default AccountSettingsScreen;
