import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  TextInput,
  StatusBar,
  ActivityIndicator,
  FlatList,
  PermissionsAndroid,
  Platform,
  Alert,
  Dimensions,
  Image,
} from 'react-native';
import Icon from '../components/PngIcon';
import { useSocket } from '../context/SocketContext';
import { rideStore, RideRequestData } from '../services/rideStore';
import { BASE_URL, DEFAULT_INDIA_LAT, DEFAULT_INDIA_LON, LOCATIONIQ_KEY } from '../config/apiConfig';
import Geolocation from 'react-native-geolocation-service';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

let RNWebView: any = null;
try {
  RNWebView = require('react-native-webview').WebView;
} catch (e) {
  RNWebView = null;
}

interface ServiceBookingScreenProps {
  route: any;
  navigation: any;
}

const ServiceBookingScreen: React.FC<ServiceBookingScreenProps> = ({ route, navigation }) => {
  const { isDark, currentColors } = useTheme();
  const selectedCategory = route.params?.selectedCategory || route.params?.category || {};
  const { user } = useAuth();
  const { socket } = useSocket();

  const [locationTitle, setLocationTitle] = useState('Fetching Location...');
  const [locationSubtitle, setLocationSubtitle] = useState('Please wait...');
  const [coords, setCoords] = useState({ latitude: 0, longitude: 0 });
  const [mapCenter, setMapCenter] = useState({ latitude: DEFAULT_INDIA_LAT, longitude: DEFAULT_INDIA_LON });
  const [mapZoom, setMapZoom] = useState(5);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [loadingLocation, setLoadingLocation] = useState(true);
  const webViewRef = useRef<any>(null);

  const goToCurrentLocation = (lat: number, lon: number, zoom: number) => {
    if (webViewRef.current) {
      const script = `
        if (typeof map !== 'undefined' && typeof marker !== 'undefined') {
          map.flyTo([${lat}, ${lon}], ${zoom});
          marker.setLatLng([${lat}, ${lon}]);
        }
        true;
      `;
      webViewRef.current.injectJavaScript(script);
    }
  };

  // Custom Address Search State (OpenStreetMap Nominatim Engine - 0% Google)
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const searchTimeoutRef = useRef<any>(null);

  const fallbackIpLocation = async () => {
    try {
      // Provider 1: ip-api.com
      try {
        const res = await fetch('http://ip-api.com/json/');
        const data = await res.json();
        if (data && data.status === 'success' && data.city) {
          setLocationTitle(`${data.city}, ${data.regionName || data.region || ''}`);
          setLocationSubtitle(`${data.zip || ''} ${data.city}, ${data.regionName || ''}, ${data.country || ''}`.trim());
          if (data.lat && data.lon) {
            setCoords({ latitude: Number(data.lat), longitude: Number(data.lon) });
            setMapCenter({ latitude: Number(data.lat), longitude: Number(data.lon) });
            setMapZoom(15);
          }
          setLoadingLocation(false);
          return;
        }
      } catch (e) {}

      // Provider 2: ipwho.is
      try {
        const res = await fetch('https://ipwho.is/');
        const data = await res.json();
        if (data && data.success && data.city) {
          setLocationTitle(`${data.city}, ${data.region || ''}`);
          setLocationSubtitle(`${data.postal || ''} ${data.city}, ${data.region || ''}, ${data.country || ''}`.trim());
          if (data.latitude && data.longitude) {
            setCoords({ latitude: Number(data.latitude), longitude: Number(data.longitude) });
            setMapCenter({ latitude: Number(data.latitude), longitude: Number(data.longitude) });
            setMapZoom(15);
          }
          setLoadingLocation(false);
          return;
        }
      } catch (e) {}

      setLocationTitle('Location Unavailable');
      setLocationSubtitle('Please enable GPS or search manually');
    } catch (e) {
      setLocationTitle('Location Unavailable');
      setLocationSubtitle('Please enable GPS or search manually');
    } finally {
      setLoadingLocation(false);
    }
  };

  const fetchCurrentLocation = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Access Required',
            message: 'App needs access to your device location to accurately show services near you.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Permission Denied', 'Cannot access real GPS. Falling back to approximate network location.');
          fallbackIpLocation();
          return;
        }
      } catch (err) {
        console.warn(err);
        fallbackIpLocation();
        return;
      }
    }

    setLoadingLocation(true);
    Geolocation.getCurrentPosition(
      async (position) => {
        const lat = Number(position.coords.latitude);
        const lon = Number(position.coords.longitude);

        if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) {
          Alert.alert("Invalid Location", "Could not fetch valid GPS coordinates.");
          fallbackIpLocation();
          return;
        }

        setCoords({ latitude: lat, longitude: lon });
        setMapCenter({ latitude: lat, longitude: lon });
        setMapZoom(16); // closer zoom for exact GPS
        goToCurrentLocation(lat, lon, 16);

        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
          const data = await res.json();
          if (data && data.display_name) {
            const parts = data.display_name.split(',');
            setLocationTitle(parts[0] || 'Current Location');
            setLocationSubtitle(parts.slice(1, 4).join(',').trim() || '');
          } else {
            setLocationTitle('Current Location');
            setLocationSubtitle(`${lat.toFixed(4)}, ${lon.toFixed(4)}`);
          }
        } catch (e) {
          setLocationTitle('Current Location');
          setLocationSubtitle(`${lat.toFixed(4)}, ${lon.toFixed(4)}`);
        }
        setLoadingLocation(false);
      },
      (error) => {
        console.warn('Geolocation Error: ', error);
        Alert.alert('Location Error', 'Unable to fetch precise GPS location. Ensure your GPS/Location is turned on.');
        fallbackIpLocation();
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };

  useEffect(() => {
    fetchCurrentLocation();
  }, []);

  // OpenStreetMap Nominatim Live Address Search (0% Google)
  const handleAddressSearch = (text: string) => {
    setSearchQuery(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (!text.trim() || text.length < 3) {
      setSearchResults([]);
      setSearchingAddress(false);
      return;
    }

    setSearchingAddress(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&limit=5&q=${encodeURIComponent(text)}`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'CleaningApp/1.0' },
        });
        const data = await res.json();
        if (Array.isArray(data)) {
          setSearchResults(data);
        } else {
          setSearchResults([]);
        }
      } catch (e) {
        setSearchResults([]);
      } finally {
        setSearchingAddress(false);
      }
    }, 400);
  };

  const handleSelectSearchResult = (item: any) => {
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    const parts = (item.display_name || '').split(',');
    const title = parts[0] || 'Selected Location';
    const sub = parts.slice(1, 4).join(',').trim() || 'India';

    setCoords({ latitude: lat, longitude: lon });
    goToCurrentLocation(lat, lon, 15);
    setLocationTitle(title);
    setLocationSubtitle(sub);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleBookNow = () => {
    if (locationTitle === 'Location Unavailable' || !coords || coords.latitude === 0 || coords.longitude === 0) {
      Alert.alert('Location Required', 'Please enable GPS or search for a location manually before booking.');
      return;
    }

    const categoryName = selectedCategory.name || selectedCategory.categoryName || selectedCategory.title || 'Service';
    const rawPrice = selectedCategory.price || selectedCategory.startingPrice || 199;
    const price = Number(rawPrice);

    const newRideId = `book_${Date.now()}`;
    const rideData: any = {
      rideId: newRideId,
      customerId: user?._id || 'customer_device_1',
      customerName: user?.name || user?.username || 'Customer',
      pickupLatitude: coords.latitude,
      pickupLongitude: coords.longitude,
      destinationLatitude: coords.latitude,
      destinationLongitude: coords.longitude,
      pickupAddress: `${locationTitle} - ${locationSubtitle}`,
      destinationAddress: `${locationTitle} - ${locationSubtitle}`,
      categoryName: categoryName,
      price: price,
      status: 'PENDING',
    };

    navigation.navigate('PaymentConfirmScreen', {
      rideData,
      coords,
      categoryName,
      price
    });
  };

  const categoryName = selectedCategory?.name || selectedCategory?.categoryName || selectedCategory?.title || 'Selected Service';
  const categoryDesc = selectedCategory?.description || selectedCategory?.shortDescription || 'Verified Service Provider';
  const priceText = selectedCategory?.price ? selectedCategory.price : `Starts ₹${selectedCategory?.startingPrice || 199}`;

  // Interactive OpenStreetMap HTML Template (Light White Theme)
  const mapPickerHtml = React.useMemo(() => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body, html, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #ffffff; }
        
        .transparent-marker {
          background: transparent !important;
          border: none !important;
        }
        .custom-tooltip {
          background-color: #0066FF !important;
          color: #ffffff !important;
          border: none !important;
          border-radius: 8px !important;
          padding: 6px 12px !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
          font-size: 12px !important;
          font-weight: bold !important;
          box-shadow: 0 4px 12px rgba(0, 102, 255, 0.3) !important;
          text-align: center !important;
        }
        .custom-tooltip::before {
          border-top-color: #0066FF !important;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var hasValidCoords = Boolean(${Boolean(coords.latitude && coords.longitude && coords.latitude > 0 && coords.longitude > 0)});
        var lat = ${coords.latitude || DEFAULT_INDIA_LAT};
        var lon = ${coords.longitude || DEFAULT_INDIA_LON};
        var zoom = 15;
        var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([lat, lon], zoom);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
        }).addTo(map);

        var customHtml = \`
          <svg width="40" height="50" viewBox="0 0 40 50" style="display: block;">
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="4" stdDeviation="3" flood-opacity="0.25"/>
            </filter>
            <!-- Shadow Circle -->
            <ellipse cx="20" cy="46" rx="10" ry="3" fill="#0066FF" opacity="0.4"/>
            <!-- Pin Path -->
            <path d="M20 2C10.0589 2 2 10.0589 2 20C2 31.854 18.0645 46.5413 19.3496 47.6972C19.7214 48.0317 20.2786 48.0317 20.6504 47.6972C21.9355 46.5413 38 31.854 38 20C38 10.0589 29.9411 2 20 2Z" fill="url(#blueGrad)" filter="url(#shadow)"/>
            <!-- Inner Dot -->
            <circle cx="20" cy="20" r="7" fill="#FFFFFF"/>
            <circle cx="20" cy="20" r="4" fill="#0066FF"/>
            
            <defs>
              <linearGradient id="blueGrad" x1="20" y1="2" x2="20" y2="48" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#0066FF"/>
                <stop offset="100%" stop-color="#1D4ED8"/>
              </linearGradient>
            </defs>
          </svg>
        \`;

        var pinIcon = L.divIcon({
          className: 'transparent-marker',
          html: customHtml,
          iconSize: [40, 50],
          iconAnchor: [20, 48]
        });

        var marker = hasValidCoords ? L.marker([lat, lon], { icon: pinIcon, draggable: true }).addTo(map) : null;
        
        // Permanent styled tooltip
        if (marker) {
          marker.bindTooltip("<b>Your Location</b>", {
            permanent: true,
            direction: 'top',
            className: 'custom-tooltip',
            offset: L.point({ x: 0, y: -45 })
          }).openTooltip();
        }

        function sendLocation(latlng) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            latitude: latlng.lat,
            longitude: latlng.lng
          }));
        }

        map.on('click', function(e) {
          marker.setLatLng(e.latlng);
          sendLocation(e.latlng);
        });

        marker.on('dragend', function(e) {
          var position = marker.getLatLng();
          sendLocation(position);
        });
      </script>
    </body>
    </html>
  `, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentColors.background }]}>
      <StatusBar hidden={false} barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={currentColors.background} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: currentColors.surface, borderBottomColor: currentColors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={22} color={currentColors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: currentColors.text }]}>Choose Custom Location</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Selected Service Card */}
        <View style={[styles.card, { backgroundColor: currentColors.surface, borderColor: currentColors.border }]}>
          <Text style={[styles.cardLabel, { color: currentColors.textMuted }]}>Selected Service</Text>
          <Text style={[styles.categoryTitle, { color: currentColors.text }]}>{categoryName}</Text>
          <Text style={[styles.categoryDesc, { color: currentColors.grayText }]}>{categoryDesc}</Text>
          <Text style={[styles.priceText, { color: currentColors.text }]}>{priceText}</Text>
        </View>

        {/* Custom Location Search Input Box (OpenStreetMap Nominatim - 0% Google) */}
        <View style={[styles.card, { backgroundColor: currentColors.surface, borderColor: currentColors.border }]}>
          <Text style={[styles.cardLabel, { color: currentColors.textMuted }]}>Search Custom Location in India</Text>
          <View style={[styles.searchInputRow, { backgroundColor: isDark ? '#2D3748' : '#F8FAFC', borderColor: currentColors.border }]}>
            <Icon name="search-outline" size={18} color="#0066FF" style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.searchTextInput, { color: currentColors.text }]}
              placeholder="Search area, landmark or street in India..."
              placeholderTextColor={currentColors.placeholder}
              value={searchQuery}
              onChangeText={handleAddressSearch}
            />
            {searchingAddress && <ActivityIndicator size="small" color="#0066FF" />}
          </View>

          {/* Search Results Dropdown List */}
          {searchResults.length > 0 && (
            <View style={[styles.resultsContainer, { backgroundColor: currentColors.surface, borderColor: currentColors.border }]}>
              {searchResults.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.resultItem, { borderBottomColor: currentColors.border }]}
                  onPress={() => handleSelectSearchResult(item)}
                >
                  <Icon name="location-outline" size={16} color="#0066FF" style={{ marginRight: 8 }} />
                  <Text style={[styles.resultText, { color: currentColors.text }]} numberOfLines={2}>{item.display_name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 8 }}>
            <Text style={[styles.cardLabel, { color: currentColors.textMuted }]}>Map Location Preview</Text>
            <TouchableOpacity onPress={fetchCurrentLocation} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Icon name="refresh" size={14} color="#0066FF" style={{ marginRight: 4 }} />
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#0066FF' }}>Detect Current GPS</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.mapBoxContainer}>
            {RNWebView ? (
              <RNWebView
                ref={webViewRef}
                originWhitelist={['*']}
                source={{ html: mapPickerHtml, baseUrl: 'https://localhost' }}
                style={{ flex: 1, borderRadius: 12, backgroundColor: '#ffffff' }}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                allowFileAccess={true}
                allowUniversalAccessFromFileURLs={true}
                onMessage={async (event: any) => {
                  try {
                    const data = JSON.parse(event.nativeEvent.data);
                    if (data.latitude && data.longitude) {
                      setCoords({ latitude: data.latitude, longitude: data.longitude });
                      // Reverse geocode the dragged location
                      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${data.latitude}&lon=${data.longitude}`);
                      const revData = await res.json();
                      if (revData && revData.display_name) {
                        const parts = revData.display_name.split(',');
                        setLocationTitle(parts[0] || 'Selected Location');
                        setLocationSubtitle(parts.slice(1, 4).join(',').trim() || '');
                      }
                    }
                  } catch(e) {}
                }}
              />
            ) : (
              <View style={styles.mapFallbackBox}>
                <Icon name="map-marker-radius" size={32} color="#0066FF" />
                <Text style={styles.fallbackText}>India OpenStreetMap ({coords.latitude.toFixed(4)}, {coords.longitude.toFixed(4)})</Text>
              </View>
            )}
          </View>

          <View style={styles.locationRow}>
            <Icon name="location-sharp" size={22} color="#0066FF" style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <TextInput
                style={[styles.locTitleInput, { color: currentColors.text }]}
                value={locationTitle}
                onChangeText={setLocationTitle}
                placeholder="Area / Landmark Name"
                placeholderTextColor={currentColors.placeholder}
              />
              <TextInput
                style={[styles.locSubInput, { color: currentColors.textMuted }]}
                value={locationSubtitle}
                onChangeText={setLocationSubtitle}
                placeholder="Full Street Address, City"
                placeholderTextColor={currentColors.placeholder}
              />
            </View>
          </View>
        </View>

        {/* Instructions Card */}
        <View style={[styles.card, { backgroundColor: currentColors.surface, borderColor: currentColors.border }]}>
          <Text style={[styles.cardLabel, { color: currentColors.textMuted }]}>Notes / Instructions (Optional)</Text>
          <TextInput
            style={[styles.textInput, { color: currentColors.text, backgroundColor: isDark ? '#2D3748' : '#F8FAFC', borderColor: currentColors.border }]}
            placeholder="Add any specific instructions for the provider..."
            placeholderTextColor={currentColors.placeholder}
            value={specialInstructions}
            onChangeText={setSpecialInstructions}
            multiline
          />
        </View>
      </ScrollView>

      {/* Footer Booking Button */}
      <View style={[styles.footer, { backgroundColor: currentColors.surface, borderTopColor: currentColors.border }]}>
        <TouchableOpacity style={styles.bookBtn} onPress={handleBookNow}>
          <Text style={styles.bookBtnText}>CONFIRM LOCATION & BOOK NOW</Text>
          <Icon name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFBFD',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  categoryDesc: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 12,
  },
  priceText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0066FF',
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchTextInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
  },
  resultsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 6,
    elevation: 4,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  resultText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
    flex: 1,
  },
  mapBoxContainer: {
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: '#F1F5F9',
  },
  mapFallbackBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  fallbackText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginTop: 6,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locTitleInput: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    paddingVertical: 2,
  },
  locSubInput: {
    fontSize: 12,
    color: '#64748B',
    paddingVertical: 2,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 80,
  },
  footer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  bookBtn: {
    flexDirection: 'row',
    backgroundColor: '#0066FF',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
});

export default ServiceBookingScreen;
