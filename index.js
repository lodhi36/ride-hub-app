/**
 * @format
 */
import 'react-native-gesture-handler';
import { AppRegistry, LogBox } from 'react-native';
import App from './App';

import { name as appName } from './app.json';

// Ignore promise rejection yellow/red boxes in developer mode
LogBox.ignoreLogs([
  'Possible Unhandled Promise Rejection',
  'Unhandled promise rejection',
]);

// Intercept and handle all promise rejections globally
try {
  const tracking = require('promise/setimmediate/rejection-tracking');
  tracking.enable({
    allRejections: true,
    onUnhandled: (id, error) => {
      console.warn('[Global Unhandled Promise Rejection Caught]:', error);
    },
    onHandled: () => {},
  });
} catch (e) {
  console.log('Global promise rejection tracking registration failed:', e.message);
}

AppRegistry.registerComponent(appName, () => App);
