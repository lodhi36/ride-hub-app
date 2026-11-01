import React, { useState, useEffect, useRef, useMemo } from 'react';
iimport {
  View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    Alert,
    Dimensions,
    Platform,
    SafeAreaView,
    StatusBar,
    ScrollView,
    Image,
} from 'react-native';
import WebView from 'react-native-webview';
const WebViewComponent = WebView as any;
import Icon from './PngIcon';
import api from '../services/api';
import {
  fetchCurrentGpsPositionDetailed,
  reverseGeocodeCoords,
  isValidCoordinates,
} from '../services/LocationAddressService';
import { useTheme } from '../context/ThemeContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface StoreMapLocationModalProps {
  visible: boolean;
  onClose: () => void;
  initialCoords?: { latitude: number; longitude: number } | null;
  onLocationSaved: (coords: { latitude: number; longitude: number }, fullAddress: string) => void;
}

export const StoreMapLocationModal: React.FC<StoreMapLocationModalProps> = ({
  visible,
  onClose,
  initialCoords,
  onLocationSaved,
}) => {
  const [selectedLat, setSelectedLat] = useState<number>(
    initialCoords && isValidCoordinates(initialCoords.latitude, initialCoords.longitude)
      ? initialCoords.latitude
      : 23.2599
  );
  const [selectedLon, setSelectedLon] = useState<number>(
    initialCoords && isValidCoordinates(initialCoords.latitude, initialCoords.longitude)
      ? initialCoords.longitude
      : 77.4126
  );
  const [addressTitle, setAddressTitle] = useState<string>('Selected Store Location');
  const [fullAddressText, setFullAddressText] = useState<string>(
    'Arera Colony, Bhopal, Madhya Pradesh 462016, India'
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [detectingGps, setDetectingGps] = useState<boolean>(false);
  const [gpsLocked, setGpsLocked] = useState<boolean>(true);
  const [savingLocation, setSavingLocation] = useState<boolean>(false);
  const [mapLayerType, setMapLayerType] = useState<'standard' | 'satellite'>('standard');

  const webViewRef = useRef<any>(null);

  useEffect(() => {
    if (visible) {
      if (initialCoords && isValidCoordinates(initialCoords.latitude, initialCoords.longitude)) {
        setSelectedLat(initialCoords.latitude);
        setSelectedLon(initialCoords.longitude);
        resolveAddress(initialCoords.latitude, initialCoords.longitude);
      } else {
        handleDetectCurrentGps();
      }
    }
  }, [visible]);

  const resolveAddress = async (lat: number, lon: number) => {
    try {
      const geo = await reverseGeocodeCoords(lat, lon);
      if (geo && geo.fullAddress) {
        setFullAddressText(geo.fullAddress);
        setAddressTitle(geo.locality || geo.city || 'Selected Store Location');
      } else {
        setFullAddressText(`Arera Colony, Bhopal, Madhya Pradesh 462016, India`);
      }
    } catch (_) {
      setFullAddressText(`Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`);
    }
  };

  const handleDetectCurrentGps = async () => {
    try {
      setDetectingGps(true);
      const res = await fetchCurrentGpsPositionDetailed(true);
      const fix = res.fix || (isValidCoordinates((res as any)?.latitude, (res as any)?.longitude) ? (res as any) : null);
      if (fix && isValidCoordinates(fix.latitude, fix.longitude)) {
        setSelectedLat(fix.latitude);
        setSelectedLon(fix.longitude);
        setGpsLocked(true);
        updateMapPin(fix.latitude, fix.longitude);
        await resolveAddress(fix.latitude, fix.longitude);
      } else {
        Alert.alert('GPS Notice', res.message || 'Could not detect store GPS. Please verify device permissions.');
      }
    } catch (err) {
      console.warn('Store GPS detect notice:', err);
    } finally {
      setDetectingGps(false);
    }
  };

  const updateMapPin = (lat: number, lon: number) => {
    setSelectedLat(lat);
    setSelectedLon(lon);
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        if (typeof window.setPinLocation === 'function') {
          window.setPinLocation(${lat}, ${lon});
        }
        true;
      `);
    }
  };

  // Map Controls
  const handleZoomIn = () => {
    webViewRef.current?.injectJavaScript(`if (window.map) { window.map.zoomIn(); } true;`);
  };

  const handleZoomOut = () => {
    webViewRef.current?.injectJavaScript(`if (window.map) { window.map.zoomOut(); } true;`);
  };

  const handleRecenter = () => {
    updateMapPin(selectedLat, selectedLon);
  };

  const handleResetCompass = () => {
    webViewRef.current?.injectJavaScript(`if (window.map) { window.map.setView([${selectedLat}, ${selectedLon}], window.map.getZoom()); } true;`);
  };

  const handleToggleMapLayer = () => {
    const nextLayer = mapLayerType === 'standard' ? 'satellite' : 'standard';
    setMapLayerType(nextLayer);
    webViewRef.current?.injectJavaScript(`if (typeof window.switchLayer === 'function') { window.switchLayer('${nextLayer}'); } true;`);
  };

  const handleQuickChipPress = (chip: string) => {
    if (chip === 'current' || chip === 'near') {
      handleDetectCurrentGps();
    } else if (chip === 'manual') {
      Alert.prompt
        ? Alert.prompt('Enter Location', 'Type address, road, or area name', (text) => {
          if (text) handleSearchLocation(text);
        })
        : null;
    }
  };

  const handleSearchLocation = async (query?: string) => {
    const q = query || searchQuery;
    if (!q || q.trim().length < 2) return;
    try {
      setIsSearching(true);
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        q.trim() + ' Bhopal'
      )}&format=json&limit=5`;
      const res = await fetch(url, { headers: { 'User-Agent': 'RideHub-StoreMap/2.0' } });
      const data = await res.json();
      if (Array.isArray(data)) setSearchResults(data);
    } catch (_) {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSaveStoreLocation = async () => {
    try {
      setSavingLocation(true);
      try {
        await api.post('/users/update-store-location', {
          latitude: selectedLat,
          longitude: selectedLon,
          address: fullAddressText,
        });
      } catch (_) { }

      onLocationSaved({ latitude: selectedLat, longitude: selectedLon }, fullAddressText);
      onClose();
    } catch (err: any) {
      console.error('Save store location error:', err);
      onLocationSaved({ latitude: selectedLat, longitude: selectedLon }, fullAddressText);
      onClose();
    } finally {
      setSavingLocation(false);
    }
  };

  const mapHtml = useMemo(() => {
    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    body, html, #map { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #E2E8F0; }
    .leaflet-control-attribution, .leaflet-control-zoom { display: none !important; }

    .store-pin-container {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    /* Floating Tooltip Bubble Above Pin */
    .pin-tooltip {
      background: #FFFFFF;
      color: #0F172A;
      font-size: 11px;
      font-weight: 700;
      padding: 5px 12px;
      border-radius: 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
      white-space: nowrap;
      position: absolute;
      top: -38px;
      left: 50%;
      transform: translateX(-50%);
      pointer-events: none;
      border: 1px solid #E2E8F0;
    }

    .pin-tooltip::after {
      content: '';
      position: absolute;
      bottom: -6px;
      left: 50%;
      transform: translateX(-50%);
      border-width: 6px 6px 0;
      border-style: solid;
      border-color: #FFFFFF transparent;
      display: block;
      width: 0;
    }

    /* Radiating Pulse Ring Beneath Pin */
    .store-pulse-ring {
      position: absolute;
      width: 68px;
      height: 68px;
      border-radius: 50%;
      background: rgba(239, 68, 68, 0.2);
      border: 1.5px solid rgba(239, 68, 68, 0.5);
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      animation: pulseAnim 2.2s ease-out infinite;
      pointer-events: none;
    }

    @keyframes pulseAnim {
      0% { transform: translate(-50%, -50%) scale(0.4); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(1.6); opacity: 0; }
    }

    /* Red Teardrop Pin with Store Icon */
    .red-store-pin {
      width: 42px;
      height: 42px;
      background: #EF4444;
      border: 3.5px solid #FFFFFF;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 6px 18px rgba(239, 68, 68, 0.5);
      position: relative;
      cursor: grab;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
    }

    .store-icon-inner {
      transform: rotate(45deg);
      font-size: 18px;
      line-height: 18px;
      user-select: none;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var centerLat = ${selectedLat};
    var centerLon = ${selectedLon};

    var map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([centerLat, centerLon], 15);
    window.map = map;

    var standardTile = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    var satTile = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19
    });

    window.switchLayer = function(type) {
      if (type === 'satellite') {
        map.removeLayer(standardTile);
        satTile.addTo(map);
      } else {
        map.removeLayer(satTile);
        standardTile.addTo(map);
      }
    };

    var pinIcon = L.divIcon({
      className: 'store-pin-container',
      html: '<div class="pin-tooltip">Drag pin to set store location</div><div class="store-pulse-ring"></div><div class="red-store-pin"><span class="store-icon-inner">🏪</span></div>',
      iconSize: [42, 42],
      iconAnchor: [21, 42]
    });

    var marker = L.marker([centerLat, centerLon], {
      icon: pinIcon,
      draggable: true
    }).addTo(map);

    marker.on('dragend', function(e) {
      var pos = marker.getLatLng();
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'PIN_MOVED',
          lat: pos.lat,
          lon: pos.lng
        }));
      }
    });

    map.on('click', function(e) {
      marker.setLatLng(e.latlng);
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'PIN_MOVED',
          lat: e.latlng.lat,
          lon: e.latlng.lng
        }));
      }
    });

    window.setPinLocation = function(lat, lon) {
      marker.setLatLng([lat, lon]);
      map.setView([lat, lon], 15, { animate: true });
    };
  </script>
</body>
</html>`;
  }, [selectedLat, selectedLon]);

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data && data.type === 'PIN_MOVED') {
        setSelectedLat(data.lat);
        setSelectedLon(data.lon);
        resolveAddress(data.lat, data.lon);
      }
    } catch (_) { }
  };

  const { isDark, currentColors } = useTheme('supplier');

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={[styles.safeArea, isDark && { backgroundColor: currentColors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? currentColors.surface : '#0066FF'} />

        {/* 1. HEADER BAR */}
        <View style={[styles.header, isDark && { backgroundColor: currentColors.surface, borderBottomColor: currentColors.border }]}>
          <View style={styles.headerLeftRow}>
            <View style={[styles.storeBadgeSquare, isDark && { backgroundColor: currentColors.elevatedSurface }]}>
              <Icon name="business" size={24} color="#0066FF" />
            </View>
            <View style={{ marginLeft: 10 }}>
              <Text style={[styles.headerTitle, isDark && { color: currentColors.primaryText }]}>Update Store Location</Text>
              <Text style={[styles.headerSubtitle, isDark && { color: currentColors.secondaryText }]}>Pick location on map or use Geolocation</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={[styles.closeBtnCircle, isDark && { backgroundColor: currentColors.elevatedSurface }]} activeOpacity={0.8}>
            <Icon name="close" size={20} color="#0066FF" />
          </TouchableOpacity>
        </View>

        {/* 2. SEARCH & QUICK CHIPS SECTION */}
        <View style={[styles.searchSection, isDark && { backgroundColor: currentColors.surface, borderBottomColor: currentColors.border }]}>
          {/* Capsule Search Input */}
          <View style={[styles.searchInputCapsule, isDark && { backgroundColor: currentColors.inputBackground, borderColor: currentColors.border }]}>
            <Icon name="search" size={20} color={isDark ? currentColors.disabled : '#64748B'} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.searchInput, isDark && { color: currentColors.primaryText }]}
              placeholder="Search area, road or market in Bhopal..."
              placeholderTextColor={isDark ? currentColors.disabled : '#94A3B8'}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={() => handleSearchLocation()}
              returnKeyType="search"
            />
            {isSearching ? (
              <ActivityIndicator size="small" color="#0066FF" style={{ marginRight: 6 }} />
            ) : searchQuery.length > 0 ? (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="close-circle" size={18} color="#94A3B8" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity activeOpacity={0.7}>
                <Icon name="mic" size={20} color={isDark ? currentColors.disabled : '#64748B'} />
              </TouchableOpacity>
            )}
          </View>

          {/* 4 Quick Action Chips */}
          <View style={styles.quickChipsRow}>
            <TouchableOpacity style={[styles.chipPill, isDark && { backgroundColor: currentColors.elevatedSurface, borderColor: currentColors.border }]} onPress={() => handleQuickChipPress('current')} activeOpacity={0.8}>
              <Icon name="home" size={15} color="#0066FF" style={{ marginRight: 5 }} />
              <Text style={[styles.chipPillText, isDark && { color: currentColors.secondaryText }]}>Current Location</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.chipPill, isDark && { backgroundColor: currentColors.elevatedSurface, borderColor: currentColors.border }]} onPress={() => handleQuickChipPress('near')} activeOpacity={0.8}>
              <Icon name="locate" size={15} color="#0066FF" style={{ marginRight: 5 }} />
              <Text style={[styles.chipPillText, isDark && { color: currentColors.secondaryText }]}>Near Me</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.chipPill, isDark && { backgroundColor: currentColors.elevatedSurface, borderColor: currentColors.border }]} onPress={() => handleQuickChipPress('map')} activeOpacity={0.8}>
              <Icon name="bookmark" size={15} color="#0066FF" style={{ marginRight: 5 }} />
              <Text style={[styles.chipPillText, isDark && { color: currentColors.secondaryText }]}>Select on Map</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.chipPill, isDark && { backgroundColor: currentColors.elevatedSurface, borderColor: currentColors.border }]} onPress={() => handleQuickChipPress('manual')} activeOpacity={0.8}>
              <Icon name="location-sharp" size={15} color="#0066FF" style={{ marginRight: 5 }} />
              <Text style={[styles.chipPillText, isDark && { color: currentColors.secondaryText }]}>Enter Manually</Text>
            </TouchableOpacity>
          </View>

          {/* Autocomplete Search Dropdown */}
          {searchResults.length > 0 && (
            <View style={styles.searchResultsContainer}>
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 180 }}>
                {searchResults.map((item, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.searchResultItem}
                    onPress={() => {
                      const lat = parseFloat(item.lat);
                      const lon = parseFloat(item.lon);
                      updateMapPin(lat, lon);
                      setSearchResults([]);
                      setSearchQuery(item.display_name.split(',')[0]);
                      resolveAddress(lat, lon);
                    }}
                  >
                    <Icon name="location-sharp" size={16} color="#0066FF" style={{ marginRight: 8 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.searchResultTitle} numberOfLines={1}>
                        {item.display_name.split(',')[0]}
                      </Text>
                      <Text style={styles.searchResultSub} numberOfLines={1}>
                        {item.display_name}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* 3. INTERACTIVE MAP VIEW */}
        <View style={styles.mapContainer}>
          <WebViewComponent
            ref={webViewRef}
            source={{ html: mapHtml }}
            style={{ flex: 1 }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            onMessage={handleWebViewMessage}
          />

          {/* Floating Right Map Controls Stack */}
          <View style={styles.floatingControlsStack}>
            {/* Map Layers */}
            <TouchableOpacity style={styles.floatingSquareBtn} onPress={handleToggleMapLayer} activeOpacity={0.85}>
              <Icon name="layers" size={20} color="#0F172A" />
              <Text style={styles.floatingBtnLabel}>Map</Text>
            </TouchableOpacity>

            {/* Compass */}
            <TouchableOpacity style={styles.floatingCircleBtn} onPress={handleResetCompass} activeOpacity={0.85}>
              <Icon name="compass" size={22} color="#DC2626" />
            </TouchableOpacity>

            {/* Re-center GPS */}
            <TouchableOpacity style={styles.floatingCircleBtn} onPress={handleRecenter} activeOpacity={0.85}>
              <Icon name="locate" size={22} color="#0F172A" />
            </TouchableOpacity>

            {/* Zoom In & Out Combined Pill */}
            <View style={styles.zoomPillWrap}>
              <TouchableOpacity style={styles.zoomInnerBtn} onPress={handleZoomIn} activeOpacity={0.85}>
                <Icon name="add" size={22} color="#0F172A" />
              </TouchableOpacity>
              <View style={styles.zoomDivider} />
              <TouchableOpacity style={styles.zoomInnerBtn} onPress={handleZoomOut} activeOpacity={0.85}>
                <Icon name="remove" size={22} color="#0F172A" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 4. BOTTOM SHEET STORE LOCATION DETAILS */}
        <View style={[styles.bottomCard, isDark && { backgroundColor: currentColors.surface, borderTopColor: currentColors.border }]}>
          {/* Drag Handle Bar */}
          <View style={[styles.dragHandleBar, isDark && { backgroundColor: currentColors.border }]} />

          <View style={styles.storeDetailsRow}>
            {/* Storefront Thumbnail with Pencil Edit Badge */}
            <View style={styles.storeThumbnailWrap}>
              <Image
                source={require('../banner/restaurant_online.jpg')}
                style={styles.storeThumbnailImg}
                resizeMode="cover"
              />
              <View style={styles.editPencilBadge}>
                <Icon name="pencil" size={11} color="#FFFFFF" />
              </View>
            </View>

            {/* Title, Live GPS Pill, Address & Lat/Lon */}
            <View style={styles.storeInfoWrap}>
              <View style={styles.titleGpsRow}>
                <Text style={[styles.storeHeading, isDark && { color: currentColors.primaryText }]}>Selected Store Location</Text>
                <View style={styles.liveGpsBadge}>
                  <Icon name="checkmark" size={12} color="#16A34A" style={{ marginRight: 2 }} />
                  <Text style={styles.liveGpsText}>Live GPS</Text>
                </View>
              </View>

              <Text style={[styles.addressText, isDark && { color: currentColors.secondaryText }]} numberOfLines={2}>
                {fullAddressText}
              </Text>

              <Text style={styles.coordsText}>
                Lat: {selectedLat.toFixed(4)} • Lon: {selectedLon.toFixed(4)}
              </Text>
            </View>
          </View>

          {/* Blue Info Notice Box */}
          <View style={styles.infoNoticeBox}>
            <Icon name="information-circle" size={18} color="#0066FF" style={{ marginRight: 8, marginTop: 1 }} />
            <Text style={styles.infoNoticeText}>
              This location will be used as your store address for order delivery and customer visibility.
            </Text>
          </View>

          {/* Primary Set Location Button */}
          <TouchableOpacity
            style={styles.setStoreButton}
            onPress={handleSaveStoreLocation}
            activeOpacity={0.88}
            disabled={savingLocation}
          >
            {savingLocation ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <View style={styles.setStoreBtnContent}>
                <Icon name="checkmark" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.setStoreButtonText}>Set Store Location</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

export default StoreMapLocationModal;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0066FF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 8 : 4,
    paddingBottom: 14,
    backgroundColor: '#0066FF',
  },
  headerLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  storeBadgeSquare: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 11.5,
    color: 'rgba(255, 255, 255, 0.92)',
    marginTop: 2,
  },
  closeBtnCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  searchSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  searchInputCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 24,
    paddingHorizontal: 14,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
  },
  quickChipsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 6,
  },
  chipPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 4,
  },
  chipPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  searchResultsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 8,
    elevation: 6,
    overflow: 'hidden',
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  searchResultTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  searchResultSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#E2E8F0',
  },
  floatingControlsStack: {
    position: 'absolute',
    right: 14,
    top: 14,
    alignItems: 'center',
    gap: 10,
  },
  floatingSquareBtn: {
    width: 46,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  floatingBtnLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#475569',
    marginTop: 1,
  },
  floatingCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  zoomPillWrap: {
    width: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  zoomInnerBtn: {
    width: 44,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomDivider: {
    width: 32,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  bottomCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 10,
  },
  dragHandleBar: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 10,
  },
  storeDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  storeThumbnailWrap: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    position: 'relative',
    marginRight: 12,
  },
  storeThumbnailImg: {
    width: 54,
    height: 54,
    borderRadius: 14,
  },
  editPencilBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#0066FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  storeInfoWrap: {
    flex: 1,
  },
  titleGpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  storeHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  liveGpsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  liveGpsText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
  },
  addressText: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  coordsText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0066FF',
    marginTop: 2,
  },
  infoNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  infoNoticeText: {
    fontSize: 11.5,
    color: '#1E40AF',
    flex: 1,
    lineHeight: 16,
  },
  setStoreButton: {
    backgroundColor: '#0066FF',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  setStoreBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setStoreButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
