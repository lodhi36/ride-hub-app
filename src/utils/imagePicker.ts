import * as ImagePicker from 'react-native-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

/**
 * Launches camera or gallery, compresses image to target dimensions and quality.
 * Returns the local URI of the selected image or null if cancelled.
 */
export const pickImage = async (useCamera: boolean): Promise<string | null> => {
  return new Promise((resolve) => {
    const options: any = {
      mediaType: 'photo',
      quality: 0.5,
      maxWidth: 400,
      maxHeight: 400,
    };
    const callback = async (response: any) => {
      if (response.didCancel || !response.assets || response.assets.length === 0) {
        resolve(null);
        return;
      }
      const uri = response.assets[0].uri;
      resolve(uri || null);
    };
    if (useCamera) {
      ImagePicker.launchCamera(options, callback);
    } else {
      ImagePicker.launchImageLibrary(options, callback);
    }
  });
};

/**
 * Helper to persist and retrieve the selected profile picture URI.
 */
export const storeProfilePhoto = async (uri: string) => {
  await AsyncStorage.setItem('registeredSupplierPhoto', uri);
};

export const getStoredProfilePhoto = async (): Promise<string | null> => {
  return await AsyncStorage.getItem('registeredSupplierPhoto');
};
