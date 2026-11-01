module.exports = {
  dependencies: {
    'react-native-sound': {
      platforms: {
        android: null, // disable Android autolinking for legacy sound library JNI
      },
    },
    'react-native-worklets-core': {
      platforms: {
        android: null,
      },
    },
    '@react-native-community/geolocation': {
      platforms: {
        android: null,
      },
    },
  },
};

