import React, { useState, useContext, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Dimensions, View, Text, TouchableOpacity, ScrollView, Alert, Image, StyleSheet, BackHandler, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'react-native-image-picker';
import Icon from '../components/PngIcon';
import { ThemeContext } from '../context/ThemeContext';
import { AuthContext } from '../context/AuthContext';
import { colors } from '../theme/colors';
import Input from '../components/Input';
import Button from '../components/Button';
import api from '../services/api';

const windowWidth = Dimensions.get('window').width;

const ProfileSetupScreen = () => {
  const { theme } = useContext(ThemeContext);
  const { updateUser, logout } = useContext(AuthContext);
  
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | ''>('');
  const [lookingFor, setLookingFor] = useState<'Male' | 'Female' | ''>('');
  const [bio, setBio] = useState('');
  const [hobbies, setHobbies] = useState('');
  const [location, setLocation] = useState('');
  const [fetchingLocation, setFetchingLocation] = useState(false);
  
  const [profilePicture, setProfilePicture] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Suggested Hobbies List
  const SUGGESTED_HOBBIES = [
    'Traveling', 'Reading', 'Music', 'Fitness', 
    'Gaming', 'Photography', 'Cooking', 'Dancing', 
    'Movies', 'Sports', 'Art', 'Writing', 'Gardening'
  ];

  // Geolocation auto-fetch logic
  const fetchLocation = async () => {
    try {
      setFetchingLocation(true);
      // Fetch from public IP geolocation API
      const response = await fetch('https://ipapi.co/json/');
      const data = await response.json();
      if (data && data.city && data.region && data.country_name) {
        setLocation(`${data.city}, ${data.region}, ${data.country_name}`);
      } else {
        const fallbackRes = await fetch('http://ip-api.com/json/');
        const fallbackData = await fallbackRes.json();
        if (fallbackData && fallbackData.city && fallbackData.regionName && fallbackData.country) {
          setLocation(`${fallbackData.city}, ${fallbackData.regionName}, ${fallbackData.country}`);
        }
      }
    } catch (error) {
      console.log('Auto-fetch location error:', error);
      // Fallback default
      setLocation('Bhopal, Madhya Pradesh, India');
    } finally {
      setFetchingLocation(false);
    }
  };

  useEffect(() => {
    fetchLocation();
  }, []);

  // Back Navigation Action
  const handleBack = () => {
    Alert.alert(
      'Exit Setup',
      'Are you sure you want to go back? This will cancel your profile setup and log you out.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, Exit', style: 'destructive', onPress: () => logout() }
      ]
    );
  };

  useEffect(() => {
    const backAction = () => {
      handleBack();
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, []);

  const toggleHobby = (hobby: string) => {
    const trimmedHobby = hobby.trim();
    let currentHobbies = hobbies.split(',')
      .map(h => h.trim())
      .filter(h => h.length > 0);

    if (currentHobbies.includes(trimmedHobby)) {
      currentHobbies = currentHobbies.filter(h => h !== trimmedHobby);
    } else {
      currentHobbies.push(trimmedHobby);
    }
    setHobbies(currentHobbies.join(', '));
  };

  const isDark = theme === 'dark';
  const currentColors = isDark ? colors.dark : colors.light;

  // Pick image — Camera or Gallery options
  const pickImage = async () => {
    Alert.alert(
      'Profile Photo',
      'Choose an option to upload your photo:',
      [
        {
          text: '📷 Take Photo (Camera)',
          onPress: () => {
            ImagePicker.launchCamera({
              mediaType: 'photo',
              quality: 0.8,
              maxWidth: 1200,
              maxHeight: 1200,
            }, (result) => {
              if (result.didCancel || !result.assets) return;
              if (result.assets.length > 0) {
                setProfilePicture(result.assets[0]);
              }
            });
          }
        },
        {
          text: '🖼️ Choose from Gallery',
          onPress: () => {
            ImagePicker.launchImageLibrary({
              mediaType: 'photo',
              quality: 0.8,
              selectionLimit: 1,
              maxWidth: 1200,
              maxHeight: 1200,
            }, (result) => {
              if (result.didCancel || !result.assets) return;
              if (result.assets.length > 0) {
                setProfilePicture(result.assets[0]);
              }
            });
          }
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const handleSetup = async () => {
    if (!name || !age || !gender || !lookingFor || !profilePicture) {
      Alert.alert('Incomplete', 'Please fill all required fields and add a profile picture.');
      return;
    }

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('name', name);
      formData.append('age', age);
      formData.append('gender', gender);
      formData.append('lookingFor', lookingFor);
      formData.append('bio', bio);
      formData.append('location', location);
      formData.append('hobbies', hobbies);

      // Upload full-size image — backend auto-compresses to 50KB
      formData.append('profilePicture', {
        uri: profilePicture.uri,
        type: profilePicture.type || 'image/jpeg',
        name: profilePicture.fileName || 'profile.jpg',
      } as any);

      const token = await AsyncStorage.getItem('userToken');
      const res = await api.post('/profile/setup', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (res.data.success) {
        updateUser({ isProfileComplete: true, name });
      }
    } catch (error: any) {
      Alert.alert('Setup Failed', error.response?.data?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleBioChange = (text: string) => {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length > 10) {
      setBio(words.slice(0, 10).join(' '));
    } else {
      setBio(text);
    }
  };

  const labelColor = isDark ? colors.dark.textMuted : colors.light.textMuted;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]}>
      {/* Top Header Bar */}
      <View style={[styles.headerBar, { borderBottomColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton} activeOpacity={0.7}>
          <Text style={{ fontSize: 22, color: currentColors.text, fontWeight: 'bold' }}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: currentColors.text, marginBottom: 0 }]}>
          Complete Profile
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Profile Picture */}
        <View style={styles.imagePickerContainer}>
          <TouchableOpacity 
            onPress={pickImage}
            style={[
              styles.avatarContainer, 
              { 
                borderColor: currentColors.border, 
                backgroundColor: currentColors.grayBg 
              }
            ]}
          >
            {profilePicture ? (
              <Image source={{ uri: profilePicture.uri }} style={styles.avatarImage} />
            ) : (
              <Icon name="camera" size={48} color={currentColors.textMuted} />
            )}
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={pickImage} 
            style={{ 
              marginTop: 16, 
              backgroundColor: colors.primary, 
              paddingVertical: 8, 
              paddingHorizontal: 20, 
              borderRadius: 20 
            }}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>
              {profilePicture ? 'Change Photo' : 'Upload Photo'}
            </Text>
          </TouchableOpacity>

        </View>

        <Input label="Name" value={name} onChangeText={setName} placeholder="Your name" />
        <Input label="Age" value={age} onChangeText={(text) => setAge(text.substring(0, 2).replace(/[^0-9]/g, ''))} keyboardType="numeric" placeholder="e.g. 21" />
        
        {/* Gender Selection */}
        <Text style={[styles.label, { color: labelColor }]}>I am a</Text>
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            onPress={() => setGender('Male')}
            style={[
              styles.tabLeft,
              {
                borderColor: currentColors.border,
                backgroundColor: currentColors.grayBg
              },
              gender === 'Male' && styles.tabActive
            ]}
          >
            <Text style={[styles.tabText, gender === 'Male' ? styles.tabTextActive : { color: currentColors.text }]}>Male</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setGender('Female')}
            style={[
              styles.tabRight,
              {
                borderColor: currentColors.border,
                backgroundColor: currentColors.grayBg
              },
              gender === 'Female' && styles.tabActive
            ]}
          >
            <Text style={[styles.tabText, gender === 'Female' ? styles.tabTextActive : { color: currentColors.text }]}>Female</Text>
          </TouchableOpacity>
        </View>

        {/* Looking For Selection */}
        <Text style={[styles.label, { color: labelColor }]}>Looking for a</Text>
        <View style={styles.lottieSelectContainer}>
          <TouchableOpacity 
            onPress={() => setLookingFor('Male')}
            activeOpacity={0.8}
            style={[
              styles.lottieSelectCard,
              {
                borderColor: lookingFor === 'Male' ? colors.primary : currentColors.border,
                backgroundColor: lookingFor === 'Male' ? (isDark ? '#31102F' : '#FFF0F5') : currentColors.surface,
              }
            ]}
          >
            <Text style={{ fontSize: 32, marginBottom: 4 }}>👨</Text>
            <Text style={[
              styles.lottieSelectText, 
              { color: lookingFor === 'Male' ? colors.primary : currentColors.text }
            ]}>
              Male
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            onPress={() => setLookingFor('Female')}
            activeOpacity={0.8}
            style={[
              styles.lottieSelectCard,
              {
                borderColor: lookingFor === 'Female' ? colors.primary : currentColors.border,
                backgroundColor: lookingFor === 'Female' ? (isDark ? '#31102F' : '#FFF0F5') : currentColors.surface,
              }
            ]}
          >
            <Text style={{ fontSize: 32, marginBottom: 4 }}>👩</Text>
            <Text style={[
              styles.lottieSelectText, 
              { color: lookingFor === 'Female' ? colors.primary : currentColors.text }
            ]}>
              Female
            </Text>
          </TouchableOpacity>
        </View>

        <Input label="Bio" value={bio} onChangeText={handleBioChange} multiline numberOfLines={3} style={styles.bioInput} placeholder="Write a short bio (max 10 words)..." />
        
        {/* Geolocation Input Container */}
        <Text style={[styles.label, { color: labelColor, marginBottom: 4 }]}>Location</Text>
        <View style={styles.locationContainer}>
          <View style={{ flex: 1 }}>
            <Input 
              value={location} 
              onChangeText={setLocation} 
              placeholder="Detecting location..." 
              style={{ marginBottom: 0 }} 
            />
          </View>
          <TouchableOpacity 
            style={[styles.locationRefreshButton, { backgroundColor: 'transparent' }]}
            onPress={fetchLocation}
            disabled={fetchingLocation}
            activeOpacity={0.7}
          >
            {fetchingLocation ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Icon name="location" size={24} color={colors.primary} />
            )}
          </TouchableOpacity>
        </View>

        <Input 
          label="Hobbies (Comma separated)" 
          value={hobbies} 
          onChangeText={setHobbies} 
          placeholder="e.g. Traveling, Reading, Music" 
        />
        
        {/* Suggested Hobbies Chips */}
        <Text style={[styles.suggestionLabel, { color: labelColor }]}>Suggested Hobbies</Text>
        <View style={styles.suggestionChipsContainer}>
          {SUGGESTED_HOBBIES.map((hobby, idx) => {
            const isSelected = hobbies.split(',').map(h => h.trim().toLowerCase()).includes(hobby.toLowerCase());
            return (
              <TouchableOpacity
                key={idx}
                onPress={() => toggleHobby(hobby)}
                style={[
                  styles.hobbyChip,
                  {
                    borderColor: isSelected ? colors.primary : currentColors.border,
                    backgroundColor: isSelected ? colors.primary : (isDark ? '#1E293B' : '#F1F5F9')
                  }
                ]}
              >
                <Text style={[
                  styles.hobbyChipText,
                  { color: isSelected ? '#FFF' : currentColors.text }
                ]}>
                  {hobby}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Button title="Save Profile" onPress={handleSetup} loading={loading} style={{ marginTop: 24 }} />
        <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
    borderBottomWidth: 1,
  },
  backButton: {
    width: windowWidth * 0.10, height: windowWidth * 0.10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  imagePickerContainer: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 10,
  },
  avatarContainer: {
    width: windowWidth * 0.33, height: windowWidth * 0.33,
    borderRadius: 64,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 2,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  imagePickerSubtext: {
    marginTop: 8,
    fontSize: 14,
  },
  label: {
    marginBottom: 8,
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  tabLeft: {
    flex: 1,
    padding: 12,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  tabRight: {
    flex: 1,
    padding: 12,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: {
    fontWeight: 'bold',
  },
  tabTextActive: {
    color: colors.white,
  },
  lottieSelectContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  lottieSelectCard: {
    flex: 1,
    height: 120,
    borderWidth: 2,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 6,
  },
  lottieGenderIcon: {
    width: windowWidth * 0.18, height: windowWidth * 0.18,
    marginBottom: 2,
  },
  lottieSelectText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  locationRefreshButton: {
    width: windowWidth * 0.12, height: windowWidth * 0.12,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  suggestionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8,
  },
  suggestionChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  hobbyChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
  hobbyChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  bioInput: {
    height: 80,
    textAlignVertical: 'top',
  },
});

export default ProfileSetupScreen;
