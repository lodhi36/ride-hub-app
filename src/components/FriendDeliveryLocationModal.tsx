import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  KeyboardAvoidingView,
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
import { OSRM_ROUTING_URL } from '../config/apiConfig';
import { useTheme } from '../context/ThemeContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Operational Delivery Zones of Bhopal (for Leaflet polygon overlay)
const BHOPAL_MAP_ZONES = [
  {
    name: 'North Bhopal & Karond Zone',
    color: '#0066FF',
    coords: [
      [23.3280, 77.4050],
      [23.3200, 77.4250],
      [23.2800, 77.4450],
      [23.2500, 77.4400],
      [23.2200, 77.3950],
      [23.2450, 77.3650],
      [23.2950, 77.3500],
      [23.3280, 77.4050],
    ],
  },
  {
    name: 'Arwaliya & Huzur Tahsil Zone',
    color: '#F59E0B',
    coords: [
      [23.3400, 77.3900],
      [23.3400, 77.4550],
      [23.3100, 77.4750],
      [23.2850, 77.4500],
      [23.2650, 77.4200],
      [23.2700, 77.3850],
      [23.2950, 77.3700],
      [23.3200, 77.3800],
      [23.3400, 77.3900],
    ],
  },
  {
    name: 'New Bhopal (MP Nagar • Arera • Kolar)',
    color: '#10B981',
    coords: [
      [23.2450, 77.4100],
      [23.2400, 77.4500],
      [23.2100, 77.4600],
      [23.1700, 77.4400],
      [23.1600, 77.4000],
      [23.1800, 77.3800],
      [23.2200, 77.3950],
      [23.2450, 77.4100],
    ],
  },
  {
    name: 'BHEL & East Bhopal (Indrapuri • Piplani)',
    color: '#8B5CF6',
    coords: [
      [23.2900, 77.4450],
      [23.2800, 77.4950],
      [23.2350, 77.5000],
      [23.2150, 77.4600],
      [23.2450, 77.4400],
      [23.2900, 77.4450],
    ],
  },
];

export interface FriendLocationData {
  latitude: number;
  longitude: number;
  fullAddress: string;
  locality?: string;
  landmark?: string;
  recipientName: string;
  recipientPhone: string;
  zoneId?: string;
  roadDistanceKm?: number;
}

interface FriendDeliveryLocationModalProps {
  visible: boolean;
  onClose: () => void;
  initialCoords?: { latitude: number; longitude: number } | null;
  initialName?: string;
  initialPhone?: string;
  restaurantCoords?: { latitude: number; longitude: number } | null;
  restaurantName?: string;
  restaurantId?: string;
  onConfirm: (data: FriendLocationData) => void;
}

export const FriendDeliveryLocationModal: React.FC<FriendDeliveryLocationModalProps> = ({
  visible,
  onClose,
  initialCoords,
  initialName = '',
  initialPhone = '',
  restaurantCoords,
  restaurantName = 'Selected Restaurant',
  restaurantId,
  onConfirm,
}) => {
  const [selectedLat, setSelectedLat] = useState<number>(
    initialCoords && isValidCoordinates(initialCoords.latitude, initialCoords.longitude)
      ? initialCoords.latitude
      : 23.2330 // Default: Bhopal MP Nagar
  );
  const [selectedLon, setSelectedLon] = useState<number>(
    initialCoords && isValidCoordinates(initialCoords.latitude, initialCoords.longitude)
      ? initialCoords.longitude
      : 77.4350
  );
  const [friendName, setFriendName] = useState<string>(initialName);
  const [friendPhone, setFriendPhone] = useState<string>(initialPhone);
  const [addressTitle, setAddressTitle] = useState<string>('Selected Location');
  const [fullAddressText, setFullAddressText] = useState<string>('Detecting location...');
  const [localityText, setLocalityText] = useState<string>('');
  const [landmarkText, setLandmarkText] = useState<string>('');

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Validation 1: Zone Check State
  const [isCheckingZone, setIsCheckingZone] = useState<boolean>(false);
  const [isInsideZone, setIsInsideZone] = useState<boolean | null>(null);
  const [zoneId, setZoneId] = useState<string>('');
  const [zoneErrorMessage, setZoneErrorMessage] = useState<string>('');

  // Validation 2: 5 KM Road Distance State
  const [isCalculatingDistance, setIsCalculatingDistance] = useState<boolean>(false);
  const [roadDistanceKm, setRoadDistanceKm] = useState<number | null>(null);
  const [isWithin5Km, setIsWithin5Km] = useState<boolean | null>(null);
  const [distanceErrorMessage, setDistanceErrorMessage] = useState<string>('');

  const [detectingGps, setDetectingGps] = useState<boolean>(false);
  const [confirming, setConfirming] = useState<boolean>(false);

  const webViewRef = useRef<any>(null);

  // Sync initial props
  useEffect(() => {
    if (visible) {
      if (initialName) setFriendName(initialName);
      if (initialPhone) setFriendPhone(initialPhone);
      if (initialCoords && isValidCoordinates(initialCoords.latitude, initialCoords.longitude)) {
        updatePin(initialCoords.latitude, initialCoords.longitude);
      } else {
        updatePin(23.2330, 77.4350);
      }
    }
  }, [visible]);

  // Extract coords from WhatsApp link or raw text
  const extractCoordsFromLink = (text: string): { latitude: number; longitude: number } | null => {
    if (!text) return null;
    const t = text.trim();
    const raw = t.match(/^(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)$/);
    if (raw) return { latitude: parseFloat(raw[1]), longitude: parseFloat(raw[2]) };
    const qMatch = t.match(/(?:q=|loc:|daddr=)(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (qMatch) return { latitude: parseFloat(qMatch[1]), longitude: parseFloat(qMatch[2]) };
    const atMatch = t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) return { latitude: parseFloat(atMatch[1]), longitude: parseFloat(atMatch[2]) };
    return null;
  };

  // Reverse Geocode
  const resolveAddress = async (lat: number, lon: number) => {
    try {
      const geo = await reverseGeocodeCoords(lat, lon);
      if (geo) {
        const area = geo.area || geo.city || 'Bhopal';
        setAddressTitle(area);
        setLocalityText(area);
        setLandmarkText(geo.landmark || area);
        setFullAddressText(geo.fullAddress || `${area}, Bhopal, Madhya Pradesh`);
      } else {
        setAddressTitle('Pin Location');
        setFullAddressText(`Coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
      }
    } catch (_) {
      setAddressTitle('Pin Location');
      setFullAddressText(`Coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
    }
  };

  // 1. DELIVERY ZONE VALIDATION
  const checkDeliveryZone = async (lat: number, lon: number) => {
    setIsCheckingZone(true);
    setZoneErrorMessage('');
    try {
      const res = await api.post('/zones/check-customer-serviceable', {
        latitude: lat,
        longitude: lon,
      });
      if (res.data && res.data.serviceable === true) {
        setIsInsideZone(true);
        setZoneId(res.data.zone?.zoneId || 'bhopal_zone');
        setZoneErrorMessage('');
      } else {
        setIsInsideZone(false);
        setZoneErrorMessage('Sorry! This location is out of our delivery zone.');
      }
    } catch (err) {
      // Backend check error fallback
      console.warn('[Zone Check Error]', err);
      // Assume outside if failed to verify safely
      setIsInsideZone(false);
      setZoneErrorMessage('Sorry! This location is out of our delivery zone.');
    } finally {
      setIsCheckingZone(false);
    }
  };

  // 2. 5 KM ROAD DISTANCE VALIDATION (OSRM / OpenStreetMap)
  const checkRestaurant5KmRadius = async (friendLat: number, friendLon: number) => {
    if (!restaurantCoords || !isValidCoordinates(restaurantCoords.latitude, restaurantCoords.longitude)) {
      // No restaurant coords provided, distance check not applicable yet
      setRoadDistanceKm(null);
      setIsWithin5Km(true);
      return;
    }

    const rLat = restaurantCoords.latitude;
    const rLon = restaurantCoords.longitude;

    setIsCalculatingDistance(true);
    setDistanceErrorMessage('');

    try {
      // First try backend validation endpoint if available
      try {
        const backendVal = await api.post('/bookings/validate-friend-delivery', {
          friendLatitude: friendLat,
          friendLongitude: friendLon,
          restaurantId,
          restaurantLatitude: rLat,
          restaurantLongitude: rLon,
        });

        if (backendVal.data && typeof backendVal.data.roadDistanceKm === 'number') {
          const dist = backendVal.data.roadDistanceKm;
          setRoadDistanceKm(dist);
          if (dist <= 5.0) {
            setIsWithin5Km(true);
            setDistanceErrorMessage('');
          } else {
            setIsWithin5Km(false);
            setDistanceErrorMessage(
              "Sorry! This restaurant cannot deliver to your friend's selected address because it is outside the 5 KM delivery range. Please select another restaurant or change the delivery address."
            );
          }
          setIsCalculatingDistance(false);
          return;
        }
      } catch (_) {}

      // Fallback: Direct OSRM driving calculation
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${rLon},${rLat};${friendLon},${friendLat}?overview=false`;
      const res = await fetch(osrmUrl, {
        headers: { 'User-Agent': 'RideHub-MobileApp/2.0' },
      });
      const data = await res.json();

      if (data && data.code === 'Ok' && Array.isArray(data.routes) && data.routes[0]) {
        const distKm = Number((data.routes[0].distance / 1000).toFixed(2));
        setRoadDistanceKm(distKm);
        if (distKm <= 5.0) {
          setIsWithin5Km(true);
          setDistanceErrorMessage('');
        } else {
          setIsWithin5Km(false);
          setDistanceErrorMessage(
            "Sorry! This restaurant cannot deliver to your friend's selected address because it is outside the 5 KM delivery range. Please select another restaurant or change the delivery address."
          );
        }
      } else {
        // Fallback to OSM routed-car
        const osmUrl = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${rLon},${rLat};${friendLon},${friendLat}?overview=false`;
        const res2 = await fetch(osmUrl, {
          headers: { 'User-Agent': 'RideHub-MobileApp/2.0' },
        });
        const data2 = await res2.json();
        if (data2 && data2.code === 'Ok' && Array.isArray(data2.routes) && data2.routes[0]) {
          const distKm = Number((data2.routes[0].distance / 1000).toFixed(2));
          setRoadDistanceKm(distKm);
          if (distKm <= 5.0) {
            setIsWithin5Km(true);
            setDistanceErrorMessage('');
          } else {
            setIsWithin5Km(false);
            setDistanceErrorMessage(
              "Sorry! This restaurant cannot deliver to your friend's selected address because it is outside the 5 KM delivery range. Please select another restaurant or change the delivery address."
            );
          }
        } else {
          // Haversine fallback with safety factor
          const R = 6371;
          const dLat = ((friendLat - rLat) * Math.PI) / 180;
          const dLon = ((friendLon - rLon) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((rLat * Math.PI) / 180) *
              Math.cos((friendLat * Math.PI) / 180) *
              Math.sin(dLon / 2) *
              Math.sin(dLon / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const havDist = R * c;
          const estRoadDist = Number((havDist * 1.35).toFixed(2));
          setRoadDistanceKm(estRoadDist);
          if (estRoadDist <= 5.0) {
            setIsWithin5Km(true);
            setDistanceErrorMessage('');
          } else {
            setIsWithin5Km(false);
            setDistanceErrorMessage(
              "Sorry! This restaurant cannot deliver to your friend's selected address because it is outside the 5 KM delivery range. Please select another restaurant or change the delivery address."
            );
          }
        }
      }
    } catch (e) {
      console.warn('[Distance Calc Error]', e);
      // Safe error handling: Do NOT assume within 5 km on complete failure
      setIsWithin5Km(false);
      setDistanceErrorMessage('Unable to verify 5 KM delivery range from restaurant. Please check your connection.');
    } finally {
      setIsCalculatingDistance(false);
    }
  };

  // Master Pin Update Trigger
  const updatePin = (lat: number, lon: number) => {
    setSelectedLat(lat);
    setSelectedLon(lon);
    resolveAddress(lat, lon);
    checkDeliveryZone(lat, lon);
    checkRestaurant5KmRadius(lat, lon);

    // Inject into Leaflet WebView
    if (webViewRef.current) {
      const js = `if (window.setPinLocation) { window.setPinLocation(${lat}, ${lon}); } true;`;
      webViewRef.current.injectJavaScript(js);
    }
  };

  // Address Search via Nominatim
  const handleSearch = async (text: string) => {
    setSearchQuery(text);
    if (!text.trim() || text.length < 3) {
      setSearchResults([]);
      return;
    }

    // Check if pasted link
    const parsed = extractCoordsFromLink(text);
    if (parsed) {
      setSearchResults([]);
      updatePin(parsed.latitude, parsed.longitude);
      return;
    }

    try {
      setIsSearching(true);
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        text + ', Bhopal, Madhya Pradesh, India'
      )}&limit=5&countrycodes=in`;
      const res = await fetch(url, { headers: { 'User-Agent': 'RideHubApp/2.0' } });
      const data = await res.json();
      if (Array.isArray(data)) {
        setSearchResults(data);
      }
    } catch (_) {
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (item: any) => {
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);
    if (isValidCoordinates(lat, lon)) {
      setSearchQuery('');
      setSearchResults([]);
      updatePin(lat, lon);
    }
  };

  // GPS centering
  const handleDetectCurrentGps = async () => {
    try {
      setDetectingGps(true);
      const detailed = await fetchCurrentGpsPositionDetailed();
      if (detailed && detailed.fix && isValidCoordinates(detailed.fix.latitude, detailed.fix.longitude)) {
        updatePin(detailed.fix.latitude, detailed.fix.longitude);
      } else {
        Alert.alert('GPS Notice', detailed?.message || 'Unable to fetch GPS. You can drag the pin on the map.');
      }
    } catch (_) {
      Alert.alert('GPS Notice', 'Unable to fetch current GPS. Please drag the pin to your friend\'s location.');
    } finally {
      setDetectingGps(false);
    }
  };

  // Confirm friend delivery location
  const handleConfirm = () => {
    if (!friendName.trim()) {
      Alert.alert("Friend's Name Required", 'Please enter your friend’s name.');
      return;
    }
    const cleanPhone = friendPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      Alert.alert('Valid Mobile Number Required', 'Please enter your friend’s valid 10-digit mobile number.');
      return;
    }
    if (!isValidCoordinates(selectedLat, selectedLon)) {
      Alert.alert('Location Required', 'Please choose your friend’s delivery location on the map.');
      return;
    }

    // Enforcement of Zone check
    if (isInsideZone === false) {
      Alert.alert(
        'Out of Delivery Zone',
        'Sorry! This location is out of our delivery zone.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Enforcement of 5 KM road distance check
    if (isWithin5Km === false) {
      Alert.alert(
        'Outside 5 KM Range',
        "Sorry! This restaurant cannot deliver to your friend's selected address because it is outside the 5 KM delivery range. Please select another restaurant or change the delivery address.",
        [{ text: 'OK' }]
      );
      return;
    }

    setConfirming(true);
    onConfirm({
      latitude: selectedLat,
      longitude: selectedLon,
      fullAddress: fullAddressText,
      locality: localityText,
      landmark: landmarkText,
      recipientName: friendName.trim(),
      recipientPhone: cleanPhone,
      zoneId,
      roadDistanceKm: roadDistanceKm || undefined,
    });
    setConfirming(false);
    onClose();
  };

  // Leaflet HTML
  const mapHtml = useMemo(() => {
    const zonesJson = JSON.stringify(BHOPAL_MAP_ZONES);
    const hasResto = Boolean(restaurantCoords && isValidCoordinates(restaurantCoords.latitude, restaurantCoords.longitude));
    const restoLat = hasResto ? restaurantCoords!.latitude : 0;
    const restoLon = hasResto ? restaurantCoords!.longitude : 0;

    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    body, html, #map { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #F8FAFC; }
    .leaflet-control-attribution, .leaflet-control-zoom { display: none !important; }
    .custom-pin {
      width: 38px;
      height: 38px;
      background: #EF4444;
      border: 3px solid #FFFFFF;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 4px 14px rgba(239, 68, 68, 0.6);
      position: relative;
    }
    .custom-pin::after {
      content: '👤';
      position: absolute;
      font-size: 14px;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(45deg);
    }
    .resto-pin {
      width: 34px;
      height: 34px;
      background: #10B981;
      border: 2px solid #FFFFFF;
      border-radius: 50%;
      box-shadow: 0 4px 10px rgba(16, 185, 129, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
    }
    .pulse-ring {
      position: absolute;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: rgba(239, 68, 68, 0.2);
      border: 2px solid #EF4444;
      top: -11px;
      left: -11px;
      animation: pulse 2s infinite;
      pointer-events: none;
    }
    @keyframes pulse {
      0% { transform: scale(0.6); opacity: 1; }
      100% { transform: scale(1.6); opacity: 0; }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([${selectedLat}, ${selectedLon}], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

    var zones = ${zonesJson};
    zones.forEach(function(z) {
      L.polygon(z.coords, {
        color: z.color,
        fillColor: z.color,
        fillOpacity: 0.12,
        weight: 2,
        dashArray: '4, 4'
      }).addTo(map);
    });

    var pinIcon = L.divIcon({
      className: 'pin-container',
      html: '<div class="pulse-ring"></div><div class="custom-pin"></div>',
      iconSize: [38, 38],
      iconAnchor: [19, 38]
    });

    var marker = L.marker([${selectedLat}, ${selectedLon}], {
      icon: pinIcon,
      draggable: true
    }).addTo(map);

    var hasResto = ${hasResto};
    var restoLat = ${restoLat};
    var restoLon = ${restoLon};
    var restoMarker = null;

    if (hasResto && restoLat > 0) {
      var restoIcon = L.divIcon({
        className: 'resto-pin-container',
        html: '<div class="resto-pin">🍽️</div>',
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });
      restoMarker = L.marker([restoLat, restoLon], { icon: restoIcon }).addTo(map);
      restoMarker.bindTooltip('${restaurantName}', { permanent: false });
    }

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
      if (marker) {
        marker.setLatLng([lat, lon]);
        map.panTo([lat, lon], { animate: true });
      }
    };
  </script>
</body>
</html>`;
  }, [restaurantCoords, restaurantName]);

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'PIN_MOVED') {
        const lat = Number(data.lat);
        const lon = Number(data.lon);
        setSelectedLat(lat);
        setSelectedLon(lon);
        resolveAddress(lat, lon);
        checkDeliveryZone(lat, lon);
        checkRestaurant5KmRadius(lat, lon);
      }
    } catch (_) {}
  };

  const { isDark, currentColors } = useTheme();

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={[styles.safeArea, isDark && { backgroundColor: currentColors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? currentColors.surface : '#FFFFFF'} />
        <KeyboardAvoidingView
          style={[styles.container, isDark && { backgroundColor: currentColors.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Top Header */}
          <View style={[styles.header, isDark && { backgroundColor: currentColors.surface, borderBottomColor: currentColors.border }]}>
            <View>
              <Text style={[styles.headerTitle, isDark && { color: currentColors.primaryText }]}>Friend Delivery Location</Text>
              <Text style={[styles.headerSubtitle, isDark && { color: currentColors.secondaryText }]}>Order for Someone Else</Text>
            </View>
            <TouchableOpacity style={[styles.closeBtn, isDark && { backgroundColor: currentColors.elevatedSurface }]} onPress={onClose}>
              <Icon name="close" size={20} color={isDark ? currentColors.primaryText : '#0F172A'} />
            </TouchableOpacity>
          </View>

          {/* Friend Contact Row */}
          <View style={[styles.contactRow, isDark && { backgroundColor: currentColors.surface, borderBottomColor: currentColors.border }]}>
            <View style={[styles.contactField, { marginRight: 8 }]}>
              <Text style={[styles.fieldLabel, isDark && { color: currentColors.secondaryText }]}>Friend's Name *</Text>
              <TextInput
                style={[styles.textInput, isDark && { backgroundColor: currentColors.inputBackground, borderColor: currentColors.border, color: currentColors.primaryText }]}
                placeholder="e.g. Sachin Lodhi"
                placeholderTextColor={isDark ? currentColors.disabled : '#94A3B8'}
                value={friendName}
                onChangeText={setFriendName}
              />
            </View>
            <View style={styles.contactField}>
              <Text style={[styles.fieldLabel, isDark && { color: currentColors.secondaryText }]}>Friend's Mobile *</Text>
              <TextInput
                style={[styles.textInput, isDark && { backgroundColor: currentColors.inputBackground, borderColor: currentColors.border, color: currentColors.primaryText }]}
                placeholder="10-digit number"
                placeholderTextColor={isDark ? currentColors.disabled : '#94A3B8'}
                keyboardType="phone-pad"
                maxLength={10}
                value={friendPhone}
                onChangeText={setFriendPhone}
              />
            </View>
          </View>

          {/* Search Box / WhatsApp link paste */}
          <View style={[styles.searchContainer, isDark && { backgroundColor: currentColors.surface, borderBottomColor: currentColors.border }]}>
            <View style={[styles.searchBar, isDark && { backgroundColor: currentColors.inputBackground, borderColor: currentColors.border }]}>
              <Icon name="search" size={18} color={isDark ? currentColors.disabled : '#64748B'} style={{ marginRight: 6 }} />
              <TextInput
                style={[styles.searchInput, isDark && { color: currentColors.primaryText }]}
                placeholder="Search area, colony or paste WhatsApp link..."
                placeholderTextColor={isDark ? currentColors.disabled : '#94A3B8'}
                value={searchQuery}
                onChangeText={handleSearch}
                autoCorrect={false}
              />
              {isSearching && <ActivityIndicator size="small" color="#0066FF" />}
            </View>

            {/* Nominatim Search Results Dropdown */}
            {searchResults.length > 0 && (
              <View style={[styles.searchResultsBox, isDark && { backgroundColor: currentColors.surface, borderColor: currentColors.border }]}>
                <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 160 }}>
                  {searchResults.map((item, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.searchResultItem, isDark && { borderBottomColor: currentColors.border }]}
                      onPress={() => handleSelectSearchResult(item)}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Icon name="location-sharp" size={16} color="#0066FF" style={{ marginRight: 6 }} />
                        <Text style={[styles.searchResultTitle, isDark && { color: currentColors.primaryText }]} numberOfLines={1}>
                          {item.display_name.split(',')[0]}
                        </Text>
                      </View>
                      <Text style={[styles.searchResultDesc, isDark && { color: currentColors.secondaryText }]} numberOfLines={1}>
                        {item.display_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Map Section */}
          <View style={styles.mapWrapper}>
            <WebViewComponent
              ref={webViewRef}
              source={{ html: mapHtml }}
              style={styles.mapWebView}
              onMessage={handleWebViewMessage}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              scrollEnabled={false}
            />

            {/* Floating GPS Button */}
            <TouchableOpacity
              style={styles.gpsFloatingBtn}
              onPress={handleDetectCurrentGps}
              disabled={detectingGps}
            >
              {detectingGps ? (
                <ActivityIndicator size="small" color="#0066FF" />
              ) : (
                <Icon name="locate" size={20} color="#0066FF" />
              )}
            </TouchableOpacity>

            <View style={styles.mapHintBadge}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="navigate-sharp" size={14} color="#0066FF" style={{ marginRight: 4 }} />
                <Text style={styles.mapHintText}>Drag the pin to your friend's exact location</Text>
              </View>
            </View>
          </View>

          {/* Validation Status Cards & Confirmation */}
          <View style={[styles.bottomSheet, isDark && { backgroundColor: currentColors.surface, borderTopColor: currentColors.border }]}>
            {/* Address Details */}
            <View style={styles.addressSummaryRow}>
              <Text style={[styles.locationTitle, isDark && { color: currentColors.primaryText }]} numberOfLines={1}>
                {addressTitle}
              </Text>
              <Text style={[styles.fullAddressText, isDark && { color: currentColors.secondaryText }]} numberOfLines={2}>
                {fullAddressText}
              </Text>
            </View>

            {/* VALIDATION 1: ZONE CHECK STATUS */}
            {isCheckingZone ? (
              <View style={styles.statusCheckingRow}>
                <ActivityIndicator size="small" color="#0066FF" />
                <Text style={styles.statusCheckingText}>Checking delivery service zone...</Text>
              </View>
            ) : isInsideZone === true ? (
              <View style={styles.statusSuccessRow}>
                <Icon name="checkmark-circle" size={18} color="#16A34A" style={{ marginRight: 6 }} />
                <Text style={styles.statusSuccessText}>Delivery address is within our service zone.</Text>
              </View>
            ) : isInsideZone === false ? (
              <View style={styles.statusErrorRow}>
                <Icon name="close-circle" size={18} color="#DC2626" style={{ marginRight: 6 }} />
                <Text style={styles.statusErrorText}>Sorry! This location is out of our delivery zone.</Text>
              </View>
            ) : null}

            {/* VALIDATION 2: 5 KM RESTAURANT RADIUS CHECK STATUS */}
            {restaurantCoords && (
              isCalculatingDistance ? (
                <View style={styles.statusCheckingRow}>
                  <ActivityIndicator size="small" color="#F59E0B" />
                  <Text style={styles.statusCheckingText}>Calculating road distance to {restaurantName}...</Text>
                </View>
              ) : isWithin5Km === true ? (
                <View style={styles.statusSuccessRow}>
                  <Icon name="bicycle" size={18} color="#16A34A" style={{ marginRight: 6 }} />
                  <Text style={styles.statusSuccessText}>
                    Road distance: {roadDistanceKm !== null ? `${roadDistanceKm} km` : 'Calculated'} (Within 5 KM delivery range)
                  </Text>
                </View>
              ) : isWithin5Km === false ? (
                <View style={styles.statusErrorRow}>
                  <Icon name="alert-circle" size={18} color="#DC2626" style={{ marginRight: 6 }} />
                  <Text style={styles.statusErrorText}>
                    Sorry! This restaurant cannot deliver to your friend's selected address because it is outside the 5 KM delivery range. Please select another restaurant or change the delivery address.
                  </Text>
                </View>
              ) : null
            )}

            {/* Confirm Location Button */}
            <TouchableOpacity
              style={[
                styles.confirmBtn,
                (isInsideZone === false || isWithin5Km === false) && styles.confirmBtnDisabled,
              ]}
              onPress={handleConfirm}
              disabled={confirming}
            >
              {confirming ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.confirmBtnText}>
                  {isInsideZone === false
                    ? 'Cannot Deliver (Outside Zone)'
                    : isWithin5Km === false
                    ? 'Cannot Deliver (Outside 5 KM)'
                    : 'Confirm Friend Delivery Location'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
  },
  contactRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  contactField: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  textInput: {
    height: 38,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  searchContainer: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
    position: 'relative',
    zIndex: 99,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
    backgroundColor: '#FFFFFF',
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
  },
  searchResultsBox: {
    position: 'absolute',
    top: 50,
    left: 14,
    right: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    zIndex: 999,
  },
  searchResultItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  searchResultTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  searchResultDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  mapWrapper: {
    flex: 1,
    position: 'relative',
  },
  mapWebView: {
    flex: 1,
  },
  gpsFloatingBtn: {
    position: 'absolute',
    right: 16,
    bottom: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  mapHintBadge: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  mapHintText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  bottomSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  addressSummaryRow: {
    marginBottom: 10,
  },
  locationTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  fullAddressText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  statusCheckingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  statusCheckingText: {
    fontSize: 12,
    color: '#475569',
    marginLeft: 8,
    fontWeight: '600',
  },
  statusSuccessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  statusSuccessIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  statusSuccessText: {
    fontSize: 12,
    color: '#065F46',
    fontWeight: '700',
    flex: 1,
  },
  statusErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  statusErrorIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  statusErrorText: {
    fontSize: 12,
    color: '#991B1B',
    fontWeight: '700',
    flex: 1,
  },
  confirmBtn: {
    backgroundColor: '#EC4899',
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  confirmBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

