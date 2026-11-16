import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
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
  savePermanentCustomerAddress,
  setActiveDeliveryAddress,
  isValidCoordinates,
  isDummyCoordinates,
  DeliveryAddress,
} from '../services/LocationAddressService';
import { useTheme } from '../context/ThemeContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface CustomerMapLocationModalProps {
  visible: boolean;
  onClose: () => void;
  initialCoords?: { latitude: number; longitude: number } | null;
  onLocationUpdated: (coords: { latitude: number; longitude: number }, fullAddress: string) => void;
}

export const CustomerMapLocationModal: React.FC<CustomerMapLocationModalProps> = ({
  visible,
  onClose,
  initialCoords,
  onLocationUpdated,
}) => {
  const hasValidInit = Boolean(
    initialCoords &&
    isValidCoordinates(initialCoords.latitude, initialCoords.longitude) &&
    !isDummyCoordinates(initialCoords.latitude, initialCoords.longitude)
  );
  const [selectedLat, setSelectedLat] = useState<number>(
    hasValidInit && initialCoords ? initialCoords.latitude : 0
  );
  const [selectedLon, setSelectedLon] = useState<number>(
    hasValidInit && initialCoords ? initialCoords.longitude : 0
  );
  const [addressTitle, setAddressTitle] = useState<string>('Current Location');
  const [fullAddressText, setFullAddressText] = useState<string>('Locating your position...');
  const [gpsStatusMsg, setGpsStatusMsg] = useState<string>(hasValidInit ? '' : 'Locating your position...');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [detectingGps, setDetectingGps] = useState<boolean>(false);
  const [updatingLocation, setUpdatingLocation] = useState<boolean>(false);
  const [mapLayerType, setMapLayerType] = useState<'standard' | 'satellite'>('standard');

  const webViewRef = useRef<any>(null);

  // Sync initial coords when modal opens
  useEffect(() => {
    if (visible) {
      if (
        initialCoords &&
        isValidCoordinates(initialCoords.latitude, initialCoords.longitude) &&
        !isDummyCoordinates(initialCoords.latitude, initialCoords.longitude)
      ) {
        setSelectedLat(initialCoords.latitude);
        setSelectedLon(initialCoords.longitude);
        setGpsStatusMsg('');
        resolveAddress(initialCoords.latitude, initialCoords.longitude);
      } else {
        handleDetectCurrentGps();
      }
    }
  }, [visible]);

  // Reverse geocode to get locality title and full address
  const resolveAddress = async (lat: number, lon: number) => {
    try {
      const geo = await reverseGeocodeCoords(lat, lon);
      if (geo && geo.fullAddress) {
        setFullAddressText(geo.fullAddress);
        setAddressTitle(geo.locality || geo.city || 'Selected Location');
      } else {
        setAddressTitle('Selected Location');
        setFullAddressText(`Coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
      }
    } catch (_) {
      setAddressTitle('Selected Location');
      setFullAddressText(`Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`);
    }
  };

  // Detect Current GPS
  const handleDetectCurrentGps = async () => {
    try {
      setDetectingGps(true);
      setGpsStatusMsg('Locating your position...');
      const res = await fetchCurrentGpsPositionDetailed(false);
      const fix = res.fix && !isDummyCoordinates(res.fix.latitude, res.fix.longitude) ? res.fix : null;
      if (fix && isValidCoordinates(fix.latitude, fix.longitude)) {
        setSelectedLat(fix.latitude);
        setSelectedLon(fix.longitude);
        if (fix.accuracy && fix.accuracy > 50) {
          const warnMsg = 'लोकेशन ठीक नहीं मिल रही, कृपया पिन खुद ठीक करें।';
          setGpsStatusMsg(warnMsg);
          Alert.alert('GPS शुद्धता चेतावनी', warnMsg + `\n(शुद्धता: ${Math.round(fix.accuracy)}m)`);
        } else {
          setGpsStatusMsg('');
        }
        updateMapPin(fix.latitude, fix.longitude);
        await resolveAddress(fix.latitude, fix.longitude);
      } else {
        const msg =
          res.errorType === 'PERMISSION_DENIED'
            ? 'Location permission required.'
            : res.errorType === 'LOCATION_OFF'
            ? 'GPS unavailable.'
            : 'Unable to fetch current location. Retry.';
        setGpsStatusMsg(msg);
        if (!isValidCoordinates(selectedLat, selectedLon)) {
          setAddressTitle('GPS Status');
          setFullAddressText(msg);
        }
        Alert.alert('GPS Status', msg);
      }
    } catch (err) {
      console.warn('GPS detection notice:', err);
      setGpsStatusMsg('Unable to fetch current location. Retry.');
    } finally {
      setDetectingGps(false);
    }
  };

  // Update Map Pin in WebView
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

  // Quick Chips Selection
  const handleSelectChip = (type: 'home' | 'work' | 'saved' | 'recent') => {
    if (type === 'home' || type === 'work') {
      Alert.alert(
        `${type === 'home' ? 'Home' : 'Work'} Location`,
        `Selected location will be tagged as your ${type === 'home' ? 'Home' : 'Work'} delivery address.`
      );
    } else {
      handleDetectCurrentGps();
    }
  };

  // Search autocomplete
  const handleSearchLocation = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      setIsSearching(true);
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        query.trim()
      )}&format=json&limit=5`;
      const res = await fetch(url, { headers: { 'User-Agent': 'RideHub-CustomerMap/2.0' } });
      const data = await res.json();
      if (Array.isArray(data)) setSearchResults(data);
    } catch (_) {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Confirm Location (Open Location Model — valid real GPS coordinates required)
  const handleConfirmLocation = async () => {
    if (!isValidCoordinates(selectedLat, selectedLon) || isDummyCoordinates(selectedLat, selectedLon)) {
      Alert.alert(
        'Location Required',
        gpsStatusMsg || 'Unable to fetch current location. Retry.'
      );
      return;
    }

    try {
      setUpdatingLocation(true);
      const newAddr: DeliveryAddress = {
        id: `addr_${Date.now()}`,
        tag: 'Other',
        houseNo: addressTitle || 'Delivery Address',
        landmark: addressTitle || '',
        city: '',
        pincode: '',
        fullAddress: fullAddressText,
        latitude: selectedLat,
        longitude: selectedLon,
        isCurrentLocation: true,
      };

      await savePermanentCustomerAddress(newAddr);
      await setActiveDeliveryAddress(newAddr);
      try {
        await api.post('/customer/addresses', {
          tag: 'Other',
          label: addressTitle || 'Pin Location',
          address: fullAddressText,
          formattedAddress: fullAddressText,
          latitude: selectedLat,
          longitude: selectedLon,
          locationAccuracy: 15,
          isDefault: true,
        });
      } catch (e: any) {
        console.log('[CUSTOMER PIN ADDR SYNC NOTE]:', e.message);
      }
      onLocationUpdated({ latitude: selectedLat, longitude: selectedLon }, fullAddressText);
      onClose();
    } catch (err) {
      console.error('Error confirming location:', err);
      Alert.alert('Notice', 'Location saved locally.');
      onLocationUpdated({ latitude: selectedLat, longitude: selectedLon }, fullAddressText);
      onClose();
    } finally {
      setUpdatingLocation(false);
    }
  };

  // Leaflet Map HTML (Clean OpenStreetMap without zone polygon overlays or hardcoded fallbacks)
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
    
    .pin-wrapper {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Radiating Pulse Rings */
    .pulse-ring-1 {
      position: absolute;
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: rgba(0, 102, 255, 0.18);
      border: 1.5px solid rgba(0, 102, 255, 0.4);
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      animation: pulseAnim 2.2s ease-out infinite;
      pointer-events: none;
    }

    .pulse-ring-2 {
      position: absolute;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: rgba(0, 102, 255, 0.28);
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      animation: pulseAnim 2.2s 0.6s ease-out infinite;
      pointer-events: none;
    }

    @keyframes pulseAnim {
      0% { transform: translate(-50%, -50%) scale(0.4); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(1.6); opacity: 0; }
    }

    /* Blue Delivery Teardrop Pin */
    .blue-delivery-pin {
      width: 38px;
      height: 38px;
      background: #0066FF;
      border: 3.5px solid #FFFFFF;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 6px 16px rgba(0, 102, 255, 0.45);
      position: relative;
      cursor: grab;
      z-index: 10;
    }

    .blue-delivery-pin::after {
      content: '';
      width: 14px;
      height: 14px;
      background: #FFFFFF;
      position: absolute;
      border-radius: 50%;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var hasPin = ${isValidCoordinates(selectedLat, selectedLon) && !isDummyCoordinates(selectedLat, selectedLon)};
    var centerLat = ${selectedLat};
    var centerLon = ${selectedLon};

    var mapEl = document.getElementById('map');
    if (mapEl && !hasPin) {
      mapEl.style.visibility = 'hidden';
    }
    var map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    });
    if (hasPin) {
      map.setView([centerLat, centerLon], 15);
    }
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
      className: 'pin-wrapper',
      html: '<div class="pulse-ring-1"></div><div class="pulse-ring-2"></div><div class="blue-delivery-pin"></div>',
      iconSize: [38, 38],
      iconAnchor: [19, 38]
    });

    var marker = hasPin ? L.marker([${selectedLat}, ${selectedLon}], {
      icon: pinIcon,
      draggable: true
    }).addTo(map) : null;

    function attachMarkerEvents(m) {
      m.on('dragend', function(e) {
        var pos = m.getLatLng();
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'PIN_MOVED',
            lat: pos.lat,
            lon: pos.lng
          }));
        }
      });
    }

    if (marker) {
      attachMarkerEvents(marker);
    }

    map.on('click', function(e) {
      if (!marker) {
        marker = L.marker(e.latlng, {
          icon: pinIcon,
          draggable: true
        }).addTo(map);
        attachMarkerEvents(marker);
      } else {
        marker.setLatLng(e.latlng);
      }
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'PIN_MOVED',
          lat: e.latlng.lat,
          lon: e.latlng.lng
        }));
      }
    });

    window.setPinLocation = function(lat, lon) {
      if (!lat || !lon || isNaN(lat) || isNaN(lon)) return;
      var el = document.getElementById('map');
      if (el && el.style.visibility === 'hidden') {
        el.style.visibility = 'visible';
      }
      if (!marker) {
        marker = L.marker([lat, lon], {
          icon: pinIcon,
          draggable: true
        }).addTo(map);
        attachMarkerEvents(marker);
      } else {
        marker.setLatLng([lat, lon]);
      }
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
        setGpsStatusMsg('');
        resolveAddress(data.lat, data.lon);
      }
    } catch (e) {}
  };

  const { isDark, currentColors } = useTheme('customer');

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, isDark && { backgroundColor: currentColors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? currentColors.surface : '#0066FF'} />

        {/* 1. HEADER BAR */}
        <View style={[styles.headerBar, isDark && { backgroundColor: currentColors.surface, borderBottomColor: currentColors.border }]}>
          <TouchableOpacity style={[styles.headerCircleBtn, isDark && { backgroundColor: currentColors.elevatedSurface }]} onPress={onClose} activeOpacity={0.8}>
            <Icon name="arrow-back" size={22} color={isDark ? currentColors.primaryText : '#0F172A'} />
          </TouchableOpacity>

          <View style={styles.headerTextWrap}>
            <Text style={[styles.headerTitle, isDark && { color: currentColors.primaryText }]}>Select Delivery Location</Text>
            <Text style={[styles.headerSubtitle, isDark && { color: currentColors.secondaryText }]}>Drag pin or search to set your delivery address</Text>
          </View>

          <TouchableOpacity
            style={[styles.headerCircleBtn, isDark && { backgroundColor: currentColors.elevatedSurface }, detectingGps && { opacity: 0.7 }]}
            onPress={handleDetectCurrentGps}
            activeOpacity={0.8}
            disabled={detectingGps}
          >
            {detectingGps ? (
              <ActivityIndicator size="small" color="#0066FF" />
            ) : (
              <Icon name="locate" size={22} color="#0066FF" />
            )}
          </TouchableOpacity>
        </View>

        {/* 2. TOP SEARCH & CHIPS BAR */}
        <View style={[styles.searchSection, isDark && { backgroundColor: currentColors.surface, borderBottomColor: currentColors.border }]}>
          {/* Capsule Search Input */}
          <View style={[styles.searchInputCapsule, isDark && { backgroundColor: currentColors.inputBackground, borderColor: currentColors.border }]}>
            <Icon name="search" size={20} color={isDark ? currentColors.disabled : '#64748B'} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.searchInput, isDark && { color: currentColors.primaryText }]}
              placeholder="Search area (e.g. MP Nagar, Arera Colony, BHEL)..."
              placeholderTextColor={isDark ? currentColors.disabled : '#94A3B8'}
              value={searchQuery}
              onChangeText={handleSearchLocation}
              returnKeyType="search"
            />
            {isSearching && <ActivityIndicator size="small" color="#0066FF" style={{ marginRight: 6 }} />}
            {searchQuery.length > 0 ? (
              <TouchableOpacity onPress={() => handleSearchLocation('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="close-circle" size={18} color="#94A3B8" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity activeOpacity={0.7}>
                <Icon name="mic" size={20} color={isDark ? currentColors.disabled : '#64748B'} />
              </TouchableOpacity>
            )}
          </View>

          {/* Quick Filter Chips Row (Home, Work, Saved, Recent) */}
          <View style={styles.quickChipsRow}>
            <TouchableOpacity style={styles.chipCard} onPress={() => handleSelectChip('home')} activeOpacity={0.8}>
              <View style={styles.chipIconWrap}>
                <Icon name="home" size={16} color="#0066FF" />
              </View>
              <View style={styles.chipTextWrap}>
                <Text style={styles.chipTitle}>Home</Text>
                <Text style={styles.chipSub}>Add</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.chipCard} onPress={() => handleSelectChip('work')} activeOpacity={0.8}>
              <View style={styles.chipIconWrap}>
                <Icon name="briefcase" size={16} color="#0066FF" />
              </View>
              <View style={styles.chipTextWrap}>
                <Text style={styles.chipTitle}>Work</Text>
                <Text style={styles.chipSub}>Add</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.chipCard} onPress={() => handleSelectChip('saved')} activeOpacity={0.8}>
              <View style={styles.chipIconWrap}>
                <Icon name="star" size={16} color="#0066FF" />
              </View>
              <View style={styles.chipTextWrap}>
                <Text style={styles.chipTitle}>Saved</Text>
                <Text style={styles.chipSub}>Places</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.chipCard} onPress={() => handleSelectChip('recent')} activeOpacity={0.8}>
              <View style={styles.chipIconWrap}>
                <Icon name="time" size={16} color="#0066FF" />
              </View>
              <View style={styles.chipTextWrap}>
                <Text style={styles.chipTitle}>Recent</Text>
                <Text style={styles.chipSub}>Locations</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Blue GPS Pill Action Button */}
          <TouchableOpacity
            style={styles.gpsActionPill}
            onPress={handleDetectCurrentGps}
            activeOpacity={0.85}
            disabled={detectingGps}
          >
            <View style={styles.gpsPillLeft}>
              <Icon name="locate" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.gpsActionPillText}>
                {detectingGps ? 'Locating device GPS...' : 'Use my current GPS location'}
              </Text>
            </View>
            <Icon name="chevron-forward" size={18} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Search Autocomplete Results Dropdown */}
          {searchResults.length > 0 && (
            <View style={styles.searchResultsDropdown}>
              {searchResults.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.searchResultItem}
                  onPress={() => {
                    const lat = parseFloat(item.lat);
                    const lon = parseFloat(item.lon);
                    updateMapPin(lat, lon);
                    setSearchResults([]);
                    setSearchQuery(item.display_name.split(',')[0]);
                    resolveAddress(lat, lon);
                    checkZoneServiceability(lat, lon);
                  }}
                >
                  <Icon name="location-sharp" size={18} color="#0066FF" style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.searchResultName} numberOfLines={1}>
                      {item.display_name.split(',')[0]}
                    </Text>
                    <Text style={styles.searchResultAddress} numberOfLines={1}>
                      {item.display_name}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
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

          {(!isValidCoordinates(selectedLat, selectedLon) || isDummyCoordinates(selectedLat, selectedLon)) && (
            <View style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.72)',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            }}>
              <ActivityIndicator size="large" color="#38BDF8" style={{ marginBottom: 12 }} />
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800', textAlign: 'center', marginBottom: 10 }}>
                {gpsStatusMsg || 'Locating your position...'}
              </Text>
              <TouchableOpacity
                style={{ backgroundColor: '#0066FF', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 }}
                onPress={handleDetectCurrentGps}
                activeOpacity={0.85}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

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

        {/* 4. BOTTOM SHEET LOCATION DETAILS */}
        <View style={[styles.bottomSheetCard, isDark && { backgroundColor: currentColors.surface, borderTopColor: currentColors.border }]}>
          {/* Drag Handle Bar */}
          <View style={[styles.dragHandleBar, isDark && { backgroundColor: currentColors.border }]} />

          <View style={styles.bottomLocationRow}>
            {/* Rounded Locality Thumbnail */}
            <View style={styles.thumbnailContainer}>
              <Image
                source={require('../banner/customer.png')}
                style={styles.thumbnailImg}
                resizeMode="cover"
              />
              <View style={styles.pinBadgeMini}>
                <Icon name="location-sharp" size={13} color="#FFFFFF" />
              </View>
            </View>

            {/* Title & Live GPS Status */}
            <View style={styles.locationInfoWrap}>
              <View style={styles.titleBadgeRow}>
                <Text style={[styles.localityTitle, isDark && { color: currentColors.primaryText }]} numberOfLines={1}>
                  {addressTitle}
                </Text>

                {detectingGps ? (
                  <ActivityIndicator size="small" color="#0066FF" />
                ) : isValidCoordinates(selectedLat, selectedLon) ? (
                  <View style={styles.zonePillIn}>
                    <Icon name="checkmark" size={13} color="#16A34A" style={{ marginRight: 3 }} />
                    <Text style={styles.zonePillInText}>GPS Pin Ready</Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.fullAddressText} numberOfLines={2}>
                {fullAddressText}
              </Text>
            </View>
          </View>

          {/* Primary Action Button */}
          <TouchableOpacity
            style={styles.primaryActionButton}
            onPress={handleConfirmLocation}
            activeOpacity={0.88}
            disabled={updatingLocation}
          >
            {updatingLocation ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <View style={styles.actionBtnContent}>
                <Text style={styles.primaryActionButtonText}>
                  Update Location & View Stores
                </Text>
                <Icon name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 8 }} />
              </View>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

export default CustomerMapLocationModal;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0066FF',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 8 : 4,
    paddingBottom: 14,
    backgroundColor: '#0066FF',
  },
  headerCircleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  headerTextWrap: {
    flex: 1,
    paddingHorizontal: 12,
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
  searchSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
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
  chipCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  chipIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  chipTextWrap: {
    flex: 1,
  },
  chipTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  chipSub: {
    fontSize: 10,
    color: '#64748B',
  },
  gpsActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0066FF',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 11,
    marginTop: 10,
    elevation: 2,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  gpsPillLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gpsActionPillText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  searchResultsDropdown: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 8,
    maxHeight: 180,
    overflow: 'hidden',
    elevation: 6,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  searchResultName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  searchResultAddress: {
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
  bottomSheetCard: {
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
  bottomLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  thumbnailContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    position: 'relative',
    marginRight: 12,
    overflow: 'visible',
  },
  thumbnailImg: {
    width: 52,
    height: 52,
    borderRadius: 14,
  },
  pinBadgeMini: {
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
  locationInfoWrap: {
    flex: 1,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  localityTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    marginRight: 6,
  },
  zonePillIn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  zonePillInText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
  },
  zonePillOut: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  zonePillOutText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DC2626',
  },
  fullAddressText: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  primaryActionButton: {
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
  primaryActionButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  actionBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
