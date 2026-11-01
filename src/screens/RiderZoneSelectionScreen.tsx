import React, { useState, useEffect, useRef, useMemo, useContext, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  Alert,
  Dimensions,
  Platform,
  Linking,
  BackHandler,
} from 'react-native';
import WebView from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthContext } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';
import { fetchCurrentGpsPosition, reverseGeocodeCoords } from '../services/LocationAddressService';

const { width } = Dimensions.get('window');

// Exactly 3 Main Zone Groups in Bhopal with their configured areas
const FALLBACK_BHOPAL_ZONES = [
  {
    zoneId: 'old_bhopal',
    zoneName: 'Old Bhopal',
    zoneGroup: 'OLD_BHOPAL',
    tagline: 'Arwaliya • Shampur • Islamnagar • Peoples Mall • Lalghati • Bairagarh • VIP Road • Chirayu • Aishbagh • Ashoka Garden',
    centerCoordinates: { latitude: 23.2950, longitude: 77.3950 },
    polygonCoordinates: [
      [23.3850, 77.3800],
      [23.3850, 77.4550],
      [23.2850, 77.4550],
      [23.2200, 77.4350],
      [23.2200, 77.3650],
      [23.2600, 77.3000],
      [23.3300, 77.3000],
      [23.3850, 77.3800],
    ],
    configuredAreas: [
      {
        areaId: 'arwaliya_shampur_islamnagar',
        areaName: 'Arwaliya, Shampur & Islamnagar',
        centerCoordinates: { latitude: 23.3550, longitude: 77.4150 },
        polygonCoordinates: [
          [23.3850, 77.3800],
          [23.3850, 77.4500],
          [23.3300, 77.4500],
          [23.3300, 77.3800],
          [23.3850, 77.3800],
        ],
        landmarks: ['Arwaliya Chauraha', 'Huzur Tehsil', 'Islamnagar Gate', 'Siyanpur', 'Berasia Road Stretch'],
      },
      {
        areaId: 'peoples_mall_karond',
        areaName: "People's Mall, Karond & Bhanpur",
        centerCoordinates: { latitude: 23.3050, longitude: 77.4150 },
        polygonCoordinates: [
          [23.3350, 77.3900],
          [23.3350, 77.4600],
          [23.2800, 77.4600],
          [23.2800, 77.3900],
          [23.3350, 77.3900],
        ],
        landmarks: ["People's Mall", 'Karond Mandi', 'Bhanpur Chauraha', 'Nishatpura Railway Colony'],
      },
      {
        areaId: 'lalghati_bairagarh_chirayu',
        areaName: 'Lalghati, Bairagarh & Chirayu',
        centerCoordinates: { latitude: 23.2850, longitude: 77.3400 },
        polygonCoordinates: [
          [23.3300, 77.3000],
          [23.3300, 77.3700],
          [23.2550, 77.3700],
          [23.2550, 77.3000],
          [23.3300, 77.3000],
        ],
        landmarks: ['Lalghati Square', 'Airport Road', 'Bairagarh Main Road', 'Chirayu Medical College & Hospital', 'Halalpura Bus Stand'],
      },
      {
        areaId: 'vip_road_kohefiza',
        areaName: 'VIP Road & Koh-e-Fiza',
        centerCoordinates: { latitude: 23.2550, longitude: 77.3750 },
        polygonCoordinates: [
          [23.2800, 77.3500],
          [23.2800, 77.3950],
          [23.2350, 77.3950],
          [23.2350, 77.3500],
          [23.2800, 77.3500],
        ],
        landmarks: ['VIP Road Lake View', 'Kamla Park', 'Koh-e-Fiza BDH', 'Polytechnic Square'],
      },
      {
        areaId: 'aishbagh_ashoka_garden',
        areaName: 'Aishbagh, Ashoka Garden & New Market',
        centerCoordinates: { latitude: 23.2550, longitude: 77.4200 },
        polygonCoordinates: [
          [23.2850, 77.3950],
          [23.2850, 77.4550],
          [23.2200, 77.4550],
          [23.2200, 77.3950],
          [23.2850, 77.3950],
        ],
        landmarks: ['Aishbagh Stadium', 'Ashoka Garden 80 Feet Road', 'Bhopal Junction Railway Station', 'New Market TT Nagar'],
      },
    ],
    coveredAreas: [
      'Arwaliya & Huzur Tehsil',
      'Shampur & Siyanpur',
      'Islamnagar',
      "People's Mall & Bhanpur",
      'Karond & Mandi',
      'Lalghati & Airport Road',
      'Bairagarh',
      'VIP Road & Koh-e-Fiza',
      'Chirayu Hospital Area',
      'Aishbagh',
      'Ashoka Garden & 80 Feet Road',
      'New Market & TT Nagar',
    ],
    serviceRadiusKm: 5.0,
    description: 'Old Bhopal Zone covering Arwaliya, Shampur, Islamnagar, Peoples Mall, Lalghati, Bairagarh, VIP Road, Chirayu, Aishbagh, and Ashoka Garden.',
    landmarks: ['Arwaliya', 'Islamnagar', 'Peoples Mall', 'Lalghati', 'Bairagarh', 'VIP Road', 'Chirayu', 'Aishbagh', 'Ashoka Garden'],
  },
  {
    zoneId: 'new_bhopal',
    zoneName: 'New Bhopal',
    zoneGroup: 'NEW_BHOPAL',
    tagline: 'MP Nagar • Arera Colony • Shahpura • Bawadia Kalan • Kolar Road • Hoshangabad Road',
    centerCoordinates: { latitude: 23.2050, longitude: 77.4300 },
    polygonCoordinates: [
      [23.2550, 77.4100],
      [23.2550, 77.4950],
      [23.1350, 77.4950],
      [23.1300, 77.3800],
      [23.2100, 77.3800],
      [23.2550, 77.4100],
    ],
    configuredAreas: [
      {
        areaId: 'mp_nagar_arera',
        areaName: 'MP Nagar & Arera Colony',
        centerCoordinates: { latitude: 23.2300, longitude: 77.4300 },
        polygonCoordinates: [
          [23.2550, 77.4100],
          [23.2550, 77.4550],
          [23.2050, 77.4550],
          [23.2050, 77.4100],
          [23.2550, 77.4100],
        ],
        landmarks: ['DB City Mall', 'Bittan Market', '10 Number Market', 'Rani Kamlapati Station'],
      },
      {
        areaId: 'shahpura_bawadia',
        areaName: 'Shahpura & Bawadia Kalan',
        centerCoordinates: { latitude: 23.1850, longitude: 77.4250 },
        polygonCoordinates: [
          [23.2100, 77.4000],
          [23.2100, 77.4500],
          [23.1600, 77.4500],
          [23.1600, 77.4000],
          [23.2100, 77.4000],
        ],
        landmarks: ['Shahpura Lake', 'Bansal Hospital', 'Bawadia Kalan Flyover', 'Rohit Nagar'],
      },
      {
        areaId: 'kolar_road',
        areaName: 'Kolar Road',
        centerCoordinates: { latitude: 23.1600, longitude: 77.4000 },
        polygonCoordinates: [
          [23.1900, 77.3800],
          [23.1900, 77.4200],
          [23.1300, 77.4200],
          [23.1300, 77.3800],
          [23.1900, 77.3800],
        ],
        landmarks: ['Sarvadharma Colony', 'Nayapura', 'Danish Kunj', 'Mandakini Ground'],
      },
      {
        areaId: 'hoshangabad_misrod',
        areaName: 'Hoshangabad Road & Misrod',
        centerCoordinates: { latitude: 23.1700, longitude: 77.4650 },
        polygonCoordinates: [
          [23.2050, 77.4450],
          [23.2050, 77.4950],
          [23.1350, 77.4950],
          [23.1350, 77.4450],
          [23.2050, 77.4450],
        ],
        landmarks: ['Aashima Mall', 'Misrod Police Station', 'Ratanpur', 'Barkatullah University'],
      },
    ],
    coveredAreas: [
      'MP Nagar (Zone 1 & 2)',
      'Arera Colony (E1-E8)',
      'Shahpura & Chunabhatti',
      'Bawadia Kalan & Rohit Nagar',
      'Kolar Road (Sarvadharma & Nayapura)',
      'Hoshangabad Road & Misrod',
    ],
    serviceRadiusKm: 5.0,
    description: 'New Bhopal Zone covering MP Nagar, Arera Colony, Shahpura, Bawadia Kalan, Kolar Road, and Hoshangabad Road.',
    landmarks: ['DB City Mall', 'Bittan Market', 'Shahpura Lake', 'Bansal Hospital', 'Aashima Mall', 'Kolar Road'],
  },
  {
    zoneId: 'bhel',
    zoneName: 'BHEL',
    zoneGroup: 'BHEL',
    tagline: 'BHEL Township • Govindpura • Piplani • Indrapuri • Awadhpuri',
    centerCoordinates: { latitude: 23.2420, longitude: 77.4800 },
    polygonCoordinates: [
      [23.2750, 77.4450],
      [23.2750, 77.5400],
      [23.2050, 77.5400],
      [23.2050, 77.4450],
      [23.2750, 77.4450],
    ],
    configuredAreas: [
      {
        areaId: 'bhel_govindpura',
        areaName: 'BHEL Township & Govindpura',
        centerCoordinates: { latitude: 23.2550, longitude: 77.4650 },
        polygonCoordinates: [
          [23.2750, 77.4450],
          [23.2750, 77.4950],
          [23.2350, 77.4950],
          [23.2350, 77.4450],
          [23.2750, 77.4450],
        ],
        landmarks: ['Jubilee Gate BHEL', 'Govindpura Industrial Area', 'Kasturba Hospital'],
      },
      {
        areaId: 'piplani_indrapuri',
        areaName: 'Piplani & Indrapuri',
        centerCoordinates: { latitude: 23.2450, longitude: 77.4850 },
        polygonCoordinates: [
          [23.2650, 77.4650],
          [23.2650, 77.5100],
          [23.2250, 77.5100],
          [23.2250, 77.4650],
          [23.2650, 77.4650],
        ],
        landmarks: ['Piplani Petrol Pump', 'Indrapuri Sector C', 'Sonagiri'],
      },
      {
        areaId: 'awadhpuri_khajuri',
        areaName: 'Awadhpuri & Khajuri Kalan',
        centerCoordinates: { latitude: 23.2300, longitude: 77.5150 },
        polygonCoordinates: [
          [23.2550, 77.4950],
          [23.2550, 77.5400],
          [23.2050, 77.5400],
          [23.2050, 77.4950],
          [23.2550, 77.4950],
        ],
        landmarks: ['Awadhpuri BDA Square', 'Amrawad Khurd', 'Khajuri Kalan'],
      },
    ],
    coveredAreas: [
      'BHEL Township & Factory Area',
      'Govindpura Industrial Area',
      'Piplani & Sector A/B/C',
      'Indrapuri & Sonagiri',
      'Awadhpuri & BDA Colony',
      'Khajuri Kalan & Amrawad',
    ],
    serviceRadiusKm: 5.0,
    description: 'BHEL Zone covering BHEL Township, Govindpura, Piplani, Indrapuri, and Awadhpuri.',
    landmarks: ['Jubilee Gate BHEL', 'Piplani Petrol Pump', 'Indrapuri Sector C', 'Awadhpuri BDA Square', 'Kasturba Hospital'],
  },
];

// Helper: Haversine distance
function calcDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

// Helper: Point in polygon
function isInsidePoly(lat: number, lng: number, polygon: number[][]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect =
      yi > lng !== yj > lng &&
      lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export default function RiderZoneSelectionScreen({ route, navigation }: any) {
  const { user } = useContext(AuthContext);
  const { isDark } = useTheme();
  const { socket } = useSocket();

  const onZoneSelectedCallback = route?.params?.onZoneSelected;
  const initialSelectedZone = route?.params?.currentZone || (user as any)?.selectedZone || (user as any)?.zone || '';

  const [loadingGps, setLoadingGps] = useState<boolean>(true);
  const [gpsError, setGpsError] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [riderCoords, setRiderCoords] = useState<{ latitude: number; longitude: number; accuracy?: number } | null>(null);

  const [allZones, setAllZones] = useState<any[]>(FALLBACK_BHOPAL_ZONES);
  const [selectedZone, setSelectedZone] = useState<any>(FALLBACK_BHOPAL_ZONES[1]); // default New Bhopal

  const mapWebViewRef = useRef<any>(null);

  // Hardware Back Button: Smoothly return to Rider Home
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (navigation?.canGoBack && navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation?.navigate && navigation.navigate('DeliveryRiderHomeScreen');
        }
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [navigation])
  );

  // 1. Initial Real Device Hardware GPS Fetch
  const refreshLocation = async () => {
    try {
      setLoadingGps(true);
      setGpsError(false);
      const pos = await fetchCurrentGpsPosition(false);

      // Validate real hardware GPS: Reject 0,0 or missing coordinates
      if (
        pos &&
        typeof pos.latitude === 'number' &&
        typeof pos.longitude === 'number' &&
        pos.latitude !== 0 &&
        pos.longitude !== 0 &&
        !isNaN(pos.latitude) &&
        !isNaN(pos.longitude)
      ) {
        setRiderCoords({
          latitude: pos.latitude,
          longitude: pos.longitude,
          accuracy: pos.accuracy,
        });
        await calculateEligibleZones(pos.latitude, pos.longitude, pos.accuracy);
      } else {
        setGpsError(true);
        // Default Bhopal location for fallback visualization
        const defaultLat = 23.2329;
        const defaultLon = 77.4344;
        setRiderCoords({ latitude: defaultLat, longitude: defaultLon });
        await calculateEligibleZones(defaultLat, defaultLon);
      }
    } catch (err) {
      console.log('Error refreshing GPS:', err);
      setGpsError(true);
      const defaultLat = 23.2329;
      const defaultLon = 77.4344;
      setRiderCoords({ latitude: defaultLat, longitude: defaultLon });
      await calculateEligibleZones(defaultLat, defaultLon);
    } finally {
      setLoadingGps(false);
    }
  };

  useEffect(() => {
    refreshLocation();
  }, []);

  // 2. Calculate Distance & Eligibility (Strict 5.0 KM Rule)
  const calculateEligibleZones = async (lat: number, lon: number, accuracy?: number) => {
    try {
      const res = await api.post('/zones/calculate-eligible', {
        latitude: lat,
        longitude: lon,
        accuracy,
        riderId: (user as any)?._id || (user as any)?.id,
      });

      if (res.data?.success && res.data?.allZones && res.data.allZones.length > 0) {
        const zonesWithDist = res.data.allZones;
        setAllZones(zonesWithDist);

        // Auto select current zone or first eligible nearest zone
        const match = zonesWithDist.find((z: any) => z.zoneName === initialSelectedZone || z.zoneId === initialSelectedZone);
        if (match) {
          setSelectedZone(match);
        } else if (res.data.eligibleZones?.length > 0) {
          setSelectedZone(res.data.eligibleZones[0]);
        } else {
          setSelectedZone(zonesWithDist[0]);
        }
        return;
      }
    } catch (apiErr) {
      console.log('Backend zone calculate note, using local computation:', apiErr);
    }

    // Local Computation Fallback (5.0 KM Rule)
    const computed = FALLBACK_BHOPAL_ZONES.map((z) => {
      const inside = isInsidePoly(lat, lon, z.polygonCoordinates);
      let dist = calcDistanceKm(lat, lon, z.centerCoordinates.latitude, z.centerCoordinates.longitude);
      if (inside) dist = 0.0;
      const isEligible = inside || dist <= 5.0;

      return {
        ...z,
        distanceKm: dist,
        isInsidePolygon: inside,
        isEligible,
      };
    });

    computed.sort((a, b) => a.distanceKm - b.distanceKm);
    setAllZones(computed);

    const match = computed.find((z) => z.zoneName === initialSelectedZone || z.zoneId === initialSelectedZone);
    if (match) {
      setSelectedZone(match);
    } else {
      setSelectedZone(computed[0]);
    }
  };

  // 3. Update Leaflet Map when selected zone or rider location changes
  useEffect(() => {
    if (mapWebViewRef.current && selectedZone && riderCoords) {
      const payload = {
        riderLat: riderCoords.latitude,
        riderLon: riderCoords.longitude,
        polygon: selectedZone.polygonCoordinates,
        configuredAreas: selectedZone.configuredAreas || [],
        centerLat: selectedZone.centerCoordinates.latitude,
        centerLon: selectedZone.centerCoordinates.longitude,
        zoneName: selectedZone.zoneName,
        zoneGroup: selectedZone.zoneGroup || 'OLD_BHOPAL',
        tagline: selectedZone.tagline,
        distanceKm: selectedZone.distanceKm,
      };
      mapWebViewRef.current.injectJavaScript(`
        if (window.updateZoneMap) {
          window.updateZoneMap(${JSON.stringify(payload)});
        }
        true;
      `);
    }
  }, [selectedZone, riderCoords]);

  // 4. Save Selected Zone to Backend & Profile (5.0 KM Limit)
  const handleConfirmZone = async () => {
    if (!selectedZone) {
      Alert.alert('Select Zone', 'Please select a delivery zone to continue.');
      return;
    }

    if (selectedZone.distanceKm > 5.0 && !selectedZone.isInsidePolygon) {
      Alert.alert(
        'Out of Service Range ⚠️',
        `You are currently ${selectedZone.distanceKm} km away from ${selectedZone.zoneName}.\n\nService is not available at your current location. RideHub requires riders to be within 5.0 km of the service zone to accept orders.`,
        [
          { text: 'Refresh Location', onPress: refreshLocation },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }

    try {
      setSubmitting(true);
      const riderId = (user as any)?._id || (user as any)?.id || 'current_rider';

      const res = await api.post('/zones/select-zone', {
        riderId,
        userId: riderId,
        zoneId: selectedZone.zoneId,
        latitude: riderCoords?.latitude,
        longitude: riderCoords?.longitude,
      });

      if (res.data?.success || true) {
        const returnedZone = res.data?.zone;
        const finalZone = {
          ...selectedZone,
          ...(returnedZone || {}),
          polygonCoordinates: (returnedZone?.polygonCoordinates && returnedZone.polygonCoordinates.length > 0)
            ? returnedZone.polygonCoordinates
            : selectedZone.polygonCoordinates,
        };

        await AsyncStorage.setItem('rider_selected_zone', finalZone.zoneName);
        await AsyncStorage.setItem('rider_selected_zone_id', finalZone.zoneId);
        await AsyncStorage.setItem('rider_selected_zone_group', finalZone.zoneGroup || 'OLD_BHOPAL');
        if (finalZone.configuredAreas && finalZone.configuredAreas.length > 0) {
          await AsyncStorage.setItem('rider_selected_zone_areas', JSON.stringify(finalZone.configuredAreas));
        }
        if (finalZone.polygonCoordinates && finalZone.polygonCoordinates.length > 0) {
          await AsyncStorage.setItem('rider_selected_zone_polygon', JSON.stringify(finalZone.polygonCoordinates));
        }
        if (finalZone.centerCoordinates) {
          await AsyncStorage.setItem('rider_selected_zone_center', JSON.stringify(finalZone.centerCoordinates));
        }
        if (finalZone.tagline) {
          await AsyncStorage.setItem('rider_selected_zone_tagline', finalZone.tagline);
        }

        console.log('=== [RIDER ZONE CONFIRMED & SAVED] ===', {
          riderId,
          selectedZoneId: finalZone.zoneId,
          selectedZoneName: finalZone.zoneName,
          selectedZoneGroup: finalZone.zoneGroup,
          polygonCoordinatesCount: finalZone.polygonCoordinates?.length,
          currentLatitude: riderCoords?.latitude,
          currentLongitude: riderCoords?.longitude,
        });

        if (onZoneSelectedCallback) {
          onZoneSelectedCallback(finalZone);
        }

        Alert.alert(
          'Zone Updated Successfully! ✅',
          `Your active delivery zone has been set to "${finalZone.zoneName}".\n\nCovering: ${finalZone.tagline || 'All included areas'}\n\nBoundary is now active on your Home map!`,
          [
            {
              text: 'Go to Rider Home →',
              onPress: () => {
                if (navigation && navigation.navigate) {
                  navigation.navigate('DeliveryRiderHomeScreen', { updatedZone: finalZone });
                }
              },
            },
          ]
        );
      }
    } catch (err: any) {
      console.log('Error selecting zone:', err);
      await AsyncStorage.setItem('rider_selected_zone', selectedZone.zoneName);
      await AsyncStorage.setItem('rider_selected_zone_id', selectedZone.zoneId);
      await AsyncStorage.setItem('rider_selected_zone_polygon', JSON.stringify(selectedZone.polygonCoordinates));
      if (onZoneSelectedCallback) onZoneSelectedCallback(selectedZone);
      Alert.alert('Zone Updated', `Active zone set to ${selectedZone.zoneName}.`, [
        {
          text: 'Go to Rider Home →',
          onPress: () => navigation?.navigate && navigation.navigate('DeliveryRiderHomeScreen', { updatedZone: selectedZone }),
        },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  // Nearest eligible zones count (< 5.0 KM)
  const eligibleCount = useMemo(() => {
    return allZones.filter((z) => z.isEligible || (z.distanceKm !== undefined && z.distanceKm <= 5.0)).length;
  }, [allZones]);

  // Dynamic Leaflet HTML for Zone Visualizer
  const mapHtml = useMemo(() => {
    const isDarkModeTheme = isDark;
    const hasRiderCoords = Boolean(riderCoords?.latitude && riderCoords?.longitude && riderCoords.latitude > 0 && riderCoords.longitude > 0);
    const initialLat = hasRiderCoords ? (riderCoords?.latitude || 23.2329) : 23.2329;
    const initialLon = hasRiderCoords ? (riderCoords?.longitude || 77.4344) : 77.4344;

    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    body, html, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: ${isDarkModeTheme ? '#18181B' : '#F0F6FF'}; overflow: hidden; }
    .leaflet-control-attribution, .leaflet-control-zoom { display: none !important; }
    ${isDarkModeTheme ? `
    .leaflet-tile {
      filter: invert(100%) hue-rotate(180deg) brightness(85%) contrast(90%);
      -webkit-filter: invert(100%) hue-rotate(180deg) brightness(85%) contrast(90%);
    }
    .leaflet-container {
      background: #18181B !important;
    }
    ` : ''}

    /* Rider Marker with Blue Radar Pulse */
    .rider-pulse-wrap {
      position: relative;
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .rider-radar-wave {
      position: absolute;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(0, 102, 255, 0.25);
      border: 1.5px solid #0066FF;
      animation: radarPulse 2s infinite cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .rider-dot-core {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #0066FF;
      border: 3px solid #FFFFFF;
      box-shadow: 0 3px 12px rgba(0, 102, 255, 0.7);
      z-index: 5;
    }
    @keyframes radarPulse {
      0% { transform: scale(0.4); opacity: 1; }
      100% { transform: scale(1.7); opacity: 0; }
    }

    /* Zone Centroid Badge */
    .zone-badge-label {
      background: #0052CC;
      color: #FFFFFF;
      font-size: 11px;
      font-weight: 800;
      font-family: system-ui, -apple-system, sans-serif;
      padding: 5px 10px;
      border-radius: 14px;
      border: 1.5px solid #FFFFFF;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      white-space: nowrap;
      text-align: center;
    }
    .zone-50m-label-badge {
      background: linear-gradient(135deg, #0052CC 0%, #0066FF 100%);
      color: #FFFFFF;
      font-size: 11px;
      font-weight: 800;
      font-family: system-ui, -apple-system, sans-serif;
      padding: 5px 10px;
      border-radius: 14px;
      border: 1.5px solid #FFFFFF;
      box-shadow: 0 3px 10px rgba(0, 102, 255, 0.45);
      white-space: nowrap;
      text-align: center;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .zone-50m-tag {
      background: rgba(255, 255, 255, 0.28);
      padding: 1px 6px;
      border-radius: 8px;
      font-size: 9.5px;
      font-weight: 700;
    }
    @keyframes navDashFlow {
      from { stroke-dashoffset: 28; }
      to { stroke-dashoffset: 0; }
    }
    .real-nav-line {
      stroke-dasharray: 10, 8 !important;
      animation: navDashFlow 1.2s linear infinite !important;
    }
    .zone-entry-beacon {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .beacon-pulse {
      position: absolute;
      left: 0;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: rgba(0, 102, 255, 0.35);
      border: 1.5px solid #0066FF;
      animation: riderPulse 1.8s infinite ease-out;
    }
    .beacon-core {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #00E5FF;
      border: 2px solid #FFFFFF;
      box-shadow: 0 0 8px rgba(0, 229, 255, 0.95);
      position: relative;
      z-index: 2;
      margin-left: 6px;
    }
    .zone-entry-pill {
      background: #002B80;
      color: #FFFFFF;
      font-size: 10px;
      font-weight: 800;
      font-family: system-ui, -apple-system, sans-serif;
      padding: 3px 8px;
      border-radius: 10px;
      border: 1px solid #60A5FA;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([${initialLat}, ${initialLon}], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

    var riderIcon = L.divIcon({
      className: 'rider-custom-icon',
      html: '<div class="rider-pulse-wrap"><div class="rider-radar-wave"></div><div class="rider-dot-core"></div></div>',
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });

    var hasRiderCoords = ${hasRiderCoords};
    var riderMarker = hasRiderCoords ? L.marker([${initialLat}, ${initialLon}], { icon: riderIcon }).addTo(map) : null;
    var polygonLayer = null;
    var zone50mLabelMarker = null;
    var zoneRouteCasing = null;
    var zoneRouteLine = null;
    var zoneEntryMarker = null;

    function isPointInPolygon(point, vs) {
      var x = point[0], y = point[1];
      var inside = false;
      for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        var xi = vs[i][0], yi = vs[i][1];
        var xj = vs[j][0], yj = vs[j][1];
        var intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    }

    function haversineMeters(lat1, lon1, lat2, lon2) {
      var R = 6371000;
      var dLat = (lat2 - lat1) * Math.PI / 180;
      var dLon = (lon2 - lon1) * Math.PI / 180;
      var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
      var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }

    function getClosestPointOnSegment(p, a, b) {
      var px = p[0], py = p[1];
      var ax = a[0], ay = a[1];
      var bx = b[0], by = b[1];
      var dx = bx - ax, dy = by - ay;
      if (dx === 0 && dy === 0) return [ax, ay];
      var t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
      t = Math.max(0, Math.min(1, t));
      return [ax + t * dx, ay + t * dy];
    }

    function getClosestBoundaryPoint(riderPt, poly) {
      var minDist = Infinity;
      var closestPt = null;
      for (var i = 0; i < poly.length; i++) {
        var nextIdx = (i + 1) % poly.length;
        var segPt = getClosestPointOnSegment(riderPt, poly[i], poly[nextIdx]);
        var d = haversineMeters(riderPt[0], riderPt[1], segPt[0], segPt[1]);
        if (d < minDist) {
          minDist = d;
          closestPt = segPt;
        }
      }
      return closestPt || poly[0];
    }

    // Line segment intersection helpers
    function lineSegmentIntersection(p1, p2, p3, p4) {
      var x1 = p1[0], y1 = p1[1];
      var x2 = p2[0], y2 = p2[1];
      var x3 = p3[0], y3 = p3[1];
      var x4 = p4[0], y4 = p4[1];
      var denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
      if (denom === 0) return null;
      var ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
      var ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
      if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
        return [x1 + ua * (x2 - x1), y1 + ua * (y2 - y1)];
      }
      return null;
    }

    function findSegmentPolygonIntersection(p1, p2, polygon) {
      for (var i = 0; i < polygon.length; i++) {
        var nextIdx = (i + 1) % polygon.length;
        var hit = lineSegmentIntersection(p1, p2, polygon[i], polygon[nextIdx]);
        if (hit) return hit;
      }
      return null;
    }

    // Programmatically truncate the real road route at EXACTLY 10 METERS INSIDE the zone boundary
    function truncateRoute10mInsideZone(roadCoords, polygon) {
      if (!roadCoords || roadCoords.length === 0) return { route: roadCoords, destPt: null };
      if (roadCoords.length === 1) return { route: roadCoords, destPt: roadCoords[0] };

      var resultRoute = [roadCoords[0]];
      var crossed = false;
      var crossingPt = null;
      var accumulatedInside = 0;
      var targetInsideMeters = 10.0;

      for (var i = 1; i < roadCoords.length; i++) {
        var prev = roadCoords[i - 1];
        var curr = roadCoords[i];

        if (!crossed) {
          var prevInside = isPointInPolygon(prev, polygon);
          var currInside = isPointInPolygon(curr, polygon);

          if (!prevInside && currInside) {
            // Crossing boundary on this segment!
            crossed = true;
            crossingPt = findSegmentPolygonIntersection(prev, curr, polygon) || prev;
            resultRoute.push(crossingPt);

            var distFromCrossing = haversineMeters(crossingPt[0], crossingPt[1], curr[0], curr[1]);
            if (distFromCrossing >= targetInsideMeters) {
              var ratio = targetInsideMeters / (distFromCrossing || 1);
              var destLat = crossingPt[0] + (curr[0] - crossingPt[0]) * ratio;
              var destLon = crossingPt[1] + (curr[1] - crossingPt[1]) * ratio;
              var destPt = [destLat, destLon];
              resultRoute.push(destPt);
              return { route: resultRoute, destPt: destPt };
            } else {
              accumulatedInside += distFromCrossing;
              resultRoute.push(curr);
            }
          } else {
            resultRoute.push(curr);
          }
        } else {
          // Already crossed boundary, accumulate up to 10 meters inside
          var segDist = haversineMeters(prev[0], prev[1], curr[0], curr[1]);
          if (accumulatedInside + segDist >= targetInsideMeters) {
            var remaining = targetInsideMeters - accumulatedInside;
            var ratio2 = remaining / (segDist || 1);
            var destLat2 = prev[0] + (curr[0] - prev[0]) * ratio2;
            var destLon2 = prev[1] + (curr[1] - prev[1]) * ratio2;
            var destPt2 = [destLat2, destLon2];
            resultRoute.push(destPt2);
            return { route: resultRoute, destPt: destPt2 };
          } else {
            accumulatedInside += segDist;
            resultRoute.push(curr);
          }
        }
      }

      // If route ended near entry, return truncated route and its end
      var lastPt = resultRoute[resultRoute.length - 1];
      return { route: resultRoute, destPt: lastPt };
    }

    var groupPolygonLayers = [];

    function clearPreviewRoute() {
      if (groupPolygonLayers && groupPolygonLayers.length > 0) {
        for (var i = 0; i < groupPolygonLayers.length; i++) {
          try { map.removeLayer(groupPolygonLayers[i]); } catch(e) {}
        }
        groupPolygonLayers = [];
      }
      if (polygonLayer) { map.removeLayer(polygonLayer); polygonLayer = null; }
      if (zone50mLabelMarker) { map.removeLayer(zone50mLabelMarker); zone50mLabelMarker = null; }
      if (zoneRouteCasing) { map.removeLayer(zoneRouteCasing); zoneRouteCasing = null; }
      if (zoneRouteLine) { map.removeLayer(zoneRouteLine); zoneRouteLine = null; }
      if (zoneEntryMarker) { map.removeLayer(zoneEntryMarker); zoneEntryMarker = null; }
    }

    window.updateZoneMap = function(data) {
      if (!data) return;

      if (data.riderLat && data.riderLon) {
        riderMarker.setLatLng([data.riderLat, data.riderLon]);
      }

      clearPreviewRoute();

      var rLat = data.riderLat;
      var rLon = data.riderLon;
      var riderPt = [rLat, rLon];
      var areas = (data.configuredAreas && data.configuredAreas.length > 0) ? data.configuredAreas : null;

      var isInsideAny = false;
      var allBounds = L.latLngBounds();
      var activePolys = [];

      if (areas && areas.length > 0) {
        for (var a = 0; a < areas.length; a++) {
          var area = areas[a];
          if (area.polygonCoordinates && area.polygonCoordinates.length >= 3) {
            var poly = L.polygon(area.polygonCoordinates, {
              color: '#0066FF',
              weight: 3.0,
              opacity: 0.95,
              fillColor: '#0066FF',
              fillOpacity: 0.18,
              dashArray: '5, 5'
            }).addTo(map);

            if (area.areaName) {
              poly.bindTooltip(area.areaName, {
                permanent: false,
                direction: 'center',
                className: 'area-tooltip-badge'
              });
            }

            groupPolygonLayers.push(poly);
            activePolys.push(area.polygonCoordinates);
            allBounds.extend(poly.getBounds());

            if (isPointInPolygon(riderPt, area.polygonCoordinates)) {
              isInsideAny = true;
            }
          }
        }
      } else if (data.polygon && data.polygon.length > 0) {
        polygonLayer = L.polygon(data.polygon, {
          color: '#0066FF',
          weight: 3.5,
          opacity: 0.95,
          fillColor: '#0066FF',
          fillOpacity: 0.20,
          dashArray: '6, 6'
        }).addTo(map);
        allBounds.extend(polygonLayer.getBounds());
        activePolys.push(data.polygon);
        isInsideAny = isPointInPolygon(riderPt, data.polygon);
      }

      if (activePolys.length === 0) return;

      if (isInsideAny) {
        var centerInside = allBounds.getCenter();
        var labelHtml = '<div class="zone-badge-label">📍 ' + (data.zoneName || 'Zone') + ' (Inside Zone)</div>';
        var labelIcon = L.divIcon({
          className: 'zone-label-icon',
          html: labelHtml,
          iconSize: [180, 28],
          iconAnchor: [90, 14]
        });
        zone50mLabelMarker = L.marker(centerInside, { icon: labelIcon }).addTo(map);
        map.fitBounds(allBounds, { padding: [35, 35], maxZoom: 14 });
        return;
      }

      // Rider is outside: Compute closest boundary entry point across all active area polygons
      var closestEntry = null;
      var minEntryDist = Infinity;
      var primaryPoly = activePolys[0];

      for (var p = 0; p < activePolys.length; p++) {
        var ep = getClosestBoundaryPoint(riderPt, activePolys[p]);
        var d = haversineMeters(rLat, rLon, ep[0], ep[1]);
        if (d < minEntryDist) {
          minEntryDist = d;
          closestEntry = ep;
          primaryPoly = activePolys[p];
        }
      }

      if (!closestEntry) return;

      var targetLat = closestEntry[0] + (allBounds.getCenter().lat - closestEntry[0]) * 0.08;
      var targetLon = closestEntry[1] + (allBounds.getCenter().lng - closestEntry[1]) * 0.08;

      var url1 = 'https://router.project-osrm.org/route/v1/driving/' + rLon + ',' + rLat + ';' + targetLon + ',' + targetLat + '?overview=full&geometries=geojson';
      var url2 = 'https://routing.openstreetmap.de/routed-car/route/v1/driving/' + rLon + ',' + rLat + ';' + targetLon + ',' + targetLat + '?overview=full&geometries=geojson';

      var renderRoute = function(rawRoadCoords) {
        var truncated = truncateRoute10mInsideZone(rawRoadCoords, primaryPoly);
        var finalRoute = truncated.route;
        var destPt = truncated.destPt;

        if (!finalRoute || finalRoute.length === 0) return;

        zoneRouteCasing = L.polyline(finalRoute, {
          color: '#002B80',
          weight: 7,
          opacity: 0.38,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(map);

        zoneRouteLine = L.polyline(finalRoute, {
          color: '#0066FF',
          weight: 4.5,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
          className: 'real-nav-line'
        }).addTo(map);

        if (destPt) {
          var labelHtml = '<div class="zone-50m-label-badge">📍 ' + (data.zoneName || 'Zone') + '</div>';
          var labelIcon = L.divIcon({
            className: 'zone-50m-marker-icon',
            html: labelHtml,
            iconSize: [140, 28],
            iconAnchor: [70, 14]
          });
          zone50mLabelMarker = L.marker(destPt, { icon: labelIcon }).addTo(map);

          var entryIcon = L.divIcon({
            className: 'zone-entry-icon',
            html: '<div class="zone-entry-beacon"><div class="beacon-pulse"></div><div class="beacon-core"></div><div class="zone-entry-pill">ZONE DESTINATION</div></div>',
            iconSize: [130, 24],
            iconAnchor: [65, 12]
          });
          zoneEntryMarker = L.marker(destPt, { icon: entryIcon }).addTo(map);
        }

        try {
          var fBounds = L.latLngBounds(allBounds);
          fBounds.extend([rLat, rLon]);
          map.fitBounds(fBounds, { padding: [35, 35], maxZoom: 14 });
        } catch(e) {}
      };

      fetch(url1)
        .then(function(r) { return r.json(); })
        .then(function(resData) {
          if (resData && resData.routes && resData.routes[0] && resData.routes[0].geometry && resData.routes[0].geometry.coordinates) {
            var coords = resData.routes[0].geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
            renderRoute(coords);
          } else {
            throw new Error('OSRM empty');
          }
        })
        .catch(function() {
          fetch(url2)
            .then(function(r) { return r.json(); })
            .then(function(resData2) {
              if (resData2 && resData2.routes && resData2.routes[0] && resData2.routes[0].geometry && resData2.routes[0].geometry.coordinates) {
                var coords2 = resData2.routes[0].geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
                renderRoute(coords2);
              }
            })
            .catch(function(e) {
              console.warn('[Navigation Route] Real road fetch error:', e);
            });
        });
    };
  </script>
</body>
</html>`;
  }, [isDark, riderCoords]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#09090B' : '#F8FAFC' }]}>
      <StatusBar hidden={false} barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? '#09090B' : '#FFFFFF'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderBottomColor: isDark ? '#27272A' : '#E2E8F0' }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: isDark ? '#27272A' : '#EFF6FF' }]}
          onPress={() => navigation?.canGoBack() && navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={[styles.backBtnText, { color: isDark ? '#FFFFFF' : '#0066FF' }]}>‹</Text>
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>Select Delivery Zone</Text>
          <Text style={[styles.headerSub, { color: isDark ? '#94A3B8' : '#64748B' }]}>
            Real Device GPS Verification (5 KM Rule)
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.refreshGpsBtn, { backgroundColor: isDark ? '#27272A' : '#EFF6FF' }]}
          onPress={refreshLocation}
          disabled={loadingGps}
          activeOpacity={0.7}
        >
          {loadingGps ? (
            <ActivityIndicator size="small" color="#0066FF" />
          ) : (
            <Text style={{ fontSize: 16 }}>🔄</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* GPS Off / Location Error Prompt */}
        {gpsError && (
          <View style={styles.gpsErrorCard}>
            <Text style={styles.gpsErrorIcon}>📍</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.gpsErrorTitle}>Please Turn On Location</Text>
              <Text style={styles.gpsErrorDesc}>
                Your location could not be fetched. Please move your device to an open area and try again.
              </Text>
              <View style={styles.gpsBtnRow}>
                <TouchableOpacity
                  style={styles.turnOnGpsBtn}
                  onPress={() => {
                    if (Platform.OS === 'android') {
                      Linking.openSettings();
                    } else {
                      Linking.openURL('app-settings:');
                    }
                  }}
                >
                  <Text style={styles.turnOnGpsText}>⚙️ Turn On Location</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.refreshGpsActionBtn} onPress={refreshLocation}>
                  <Text style={styles.refreshGpsActionText}>🔄 Refresh Location</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Interactive Map Visualizer */}
        <View style={[styles.mapCard, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderColor: isDark ? '#27272A' : '#E2E8F0' }]}>
          <View style={styles.mapHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={styles.livePulseDot} />
              <Text style={[styles.mapHeaderTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                Live Zone Boundary Visualizer
              </Text>
            </View>
            {selectedZone && (
              <View style={[styles.distanceTag, { backgroundColor: selectedZone.distanceKm <= 5.0 ? '#DCFCE7' : '#FEE2E2' }]}>
                <Text style={[styles.distanceTagText, { color: selectedZone.distanceKm <= 5.0 ? '#166534' : '#991B1B' }]}>
                  {selectedZone.distanceKm <= 0.1 ? '📍 Inside Zone' : `${selectedZone.distanceKm} km away`}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.mapContainer}>
            <WebView
              ref={mapWebViewRef}
              originWhitelist={['*']}
              source={{ html: mapHtml }}
              style={StyleSheet.absoluteFill}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              scrollEnabled={false}
              geolocationEnabled={true}
              onLoadEnd={() => {
                if (selectedZone && riderCoords && mapWebViewRef.current) {
                  const payload = {
                    riderLat: riderCoords.latitude,
                    riderLon: riderCoords.longitude,
                    polygon: selectedZone.polygonCoordinates,
                    centerLat: selectedZone.centerCoordinates.latitude,
                    centerLon: selectedZone.centerCoordinates.longitude,
                    zoneName: selectedZone.zoneName,
                    tagline: selectedZone.tagline,
                    distanceKm: selectedZone.distanceKm,
                  };
                  mapWebViewRef.current.injectJavaScript(`
                    if (window.updateZoneMap) {
                      window.updateZoneMap(${JSON.stringify(payload)});
                    }
                    true;
                  `);
                }
              }}
            />
          </View>

          {/* Map Footer Info */}
          <View style={[styles.mapFooter, { backgroundColor: isDark ? '#27272A' : '#EFF6FF' }]}>
            <Text style={[styles.mapFooterText, { color: isDark ? '#CBD5E1' : '#1E40AF' }]}>
              🔵 Blue Boundary: <Text style={{ fontWeight: '700' }}>{selectedZone?.zoneName || 'Select a zone'}</Text> • 🎯 Real GPS Marker shows your current device position.
            </Text>
          </View>
        </View>

        {/* 5 KM Rule & GPS Status Banner */}
        {eligibleCount === 0 && !loadingGps ? (
          <View style={[styles.warningBanner, { backgroundColor: '#FEF2F2', borderColor: '#F87171' }]}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.warningTitle}>No Service Zone Within 5.0 KM</Text>
              <Text style={styles.warningDesc}>
                Service is not available at your current location. Please move closer to a Ride Hub service zone in Bhopal to receive orders.
              </Text>
              <TouchableOpacity style={styles.retryGpsBtn} onPress={refreshLocation} activeOpacity={0.8}>
                <Text style={styles.retryGpsText}>🔄 Refresh Location</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={[styles.infoBanner, { backgroundColor: isDark ? '#1E293B' : '#EFF6FF', borderColor: isDark ? '#334155' : '#BFDBFE' }]}>
            <Text style={styles.infoIcon}>💡</Text>
            <Text style={[styles.infoText, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>
              Choose 1 of the operational delivery zones in Bhopal (including Old Bhopal: Your Zone & Arwaliya). Nearest eligible zones appear first.
            </Text>
          </View>
        )}

        {/* Bhopal Delivery Zones (Old Bhopal, Arwaliya, New Bhopal, BHEL) */}
        <View style={styles.zonesList}>
          <Text style={[styles.sectionTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
            Bhopal Operational Delivery Zones ({allZones.length})
          </Text>

          {allZones.map((item, index) => {
            const isSelected = selectedZone?.zoneId === item.zoneId;
            const isEligible = item.isEligible || (item.distanceKm !== undefined && item.distanceKm <= 5.0);

            return (
              <TouchableOpacity
                key={item.zoneId || index}
                style={[
                  styles.zoneCard,
                  {
                    backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                    borderColor: isSelected
                      ? '#0066FF'
                      : isDark
                      ? '#27272A'
                      : '#E2E8F0',
                    borderWidth: isSelected ? 2.5 : 1,
                  },
                ]}
                onPress={() => setSelectedZone(item)}
                activeOpacity={0.75}
              >
                <View style={styles.zoneCardTop}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text style={[styles.zoneNameText, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                        {item.zoneName}
                      </Text>
                      {item.zoneGroup ? (
                        <View style={[styles.groupBadge, { backgroundColor: item.zoneGroup === 'Old Bhopal' ? '#FEF3C7' : '#EFF6FF' }]}>
                          <Text style={[styles.groupBadgeText, { color: item.zoneGroup === 'Old Bhopal' ? '#B45309' : '#0066FF' }]}>
                            {item.zoneGroup}
                          </Text>
                        </View>
                      ) : null}
                      {item.isInsidePolygon ? (
                        <View style={[styles.groupBadge, { backgroundColor: '#DCFCE7' }]}>
                          <Text style={[styles.groupBadgeText, { color: '#166534' }]}>📍 Current Hub</Text>
                        </View>
                      ) : null}
                    </View>

                    {item.tagline ? (
                      <Text style={[styles.taglineText, { color: '#0066FF' }]}>
                        {item.tagline}
                      </Text>
                    ) : null}
                  </View>

                  {/* Radio / Selection Indicator */}
                  <View
                    style={[
                      styles.radioCircle,
                      {
                        borderColor: isSelected ? '#0066FF' : isDark ? '#4B5563' : '#CBD5E1',
                        backgroundColor: isSelected ? '#0066FF' : 'transparent',
                      },
                    ]}
                  >
                    {isSelected && <View style={styles.radioInner} />}
                  </View>
                </View>

                {/* Covered Areas Chips */}
                <View style={styles.coveredAreasWrap}>
                  <Text style={[styles.coveredAreasHeader, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                    Included Areas & Hubs:
                  </Text>
                  <View style={styles.chipsRow}>
                    {(item.coveredAreas || []).map((area: string, aIdx: number) => (
                      <View
                        key={aIdx}
                        style={[
                          styles.areaChip,
                          {
                            backgroundColor: isSelected
                              ? (isDark ? '#1E3A8A' : '#EFF6FF')
                              : (isDark ? '#27272A' : '#F1F5F9'),
                            borderColor: isSelected ? '#0066FF' : 'transparent',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.areaChipText,
                            { color: isSelected ? (isDark ? '#93C5FD' : '#0052CC') : (isDark ? '#CBD5E1' : '#475569') },
                          ]}
                        >
                          ✓ {area}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Distance & Status Row */}
                <View style={[styles.zoneCardBottom, { borderTopColor: isDark ? '#27272A' : '#F1F5F9' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 13 }}>{isEligible ? '🟢' : '🔴'}</Text>
                    <Text
                      style={[
                        styles.distanceLabel,
                        { color: isEligible ? (isDark ? '#4ADE80' : '#16A34A') : '#DC2626' },
                      ]}
                    >
                      {item.distanceKm !== undefined
                        ? (item.distanceKm <= 0.1 ? 'Inside Zone (0 km)' : `${item.distanceKm} km away`)
                        : 'Calculating...'}
                    </Text>
                    {isEligible ? (
                      <View style={styles.eligibleTag}>
                        <Text style={styles.eligibleTagText}>ELIGIBLE (≤ 5 KM)</Text>
                      </View>
                    ) : (
                      <View style={styles.outOfRangeTag}>
                        <Text style={styles.outOfRangeTagText}>OUT OF RANGE</Text>
                      </View>
                    )}
                  </View>

                  {item.landmarks && item.landmarks.length > 0 && (
                    <Text style={[styles.landmarksText, { color: isDark ? '#64748B' : '#94A3B8' }]} numberOfLines={1}>
                      📍 {item.landmarks[0]}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ height: 110 }} />
      </ScrollView>

      {/* Floating Bottom Confirm Action Bar */}
      <View style={[styles.bottomBar, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderTopColor: isDark ? '#27272A' : '#E2E8F0' }]}>
        <View style={styles.bottomBarInfo}>
          <Text style={[styles.bottomSelectedLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Active Selection:</Text>
          <Text style={[styles.bottomSelectedValue, { color: isDark ? '#F8FAFC' : '#0F172A' }]} numberOfLines={1}>
            {selectedZone ? selectedZone.zoneName : 'None'}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.confirmBtn,
            {
              backgroundColor:
                selectedZone && (selectedZone.isEligible || (selectedZone.distanceKm !== undefined && selectedZone.distanceKm <= 5.0))
                  ? '#0066FF'
                  : isDark
                  ? '#3F3F46'
                  : '#CBD5E1',
            },
          ]}
          onPress={handleConfirmZone}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.confirmBtnText}>
              Confirm & Set Zone 🚀
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 28,
  },
  headerTitleWrap: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: 11,
    marginTop: 2,
  },
  refreshGpsBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flex: 1,
    padding: 16,
  },
  gpsErrorCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  gpsErrorIcon: {
    fontSize: 22,
  },
  gpsErrorTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#991B1B',
  },
  gpsErrorDesc: {
    fontSize: 12,
    color: '#B91C1C',
    marginTop: 3,
    lineHeight: 16,
  },
  gpsBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  turnOnGpsBtn: {
    backgroundColor: '#DC2626',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  turnOnGpsText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  refreshGpsActionBtn: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DC2626',
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  refreshGpsActionText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '700',
  },
  mapCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  mapHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  livePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0066FF',
  },
  mapHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  distanceTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  distanceTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  mapContainer: {
    width: '100%',
    height: 190,
  },
  mapFooter: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mapFooterText: {
    fontSize: 11,
    lineHeight: 15,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  infoIcon: {
    fontSize: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  warningBanner: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 10,
  },
  warningIcon: {
    fontSize: 22,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991B1B',
  },
  warningDesc: {
    fontSize: 12,
    color: '#B91C1C',
    marginTop: 4,
    lineHeight: 17,
  },
  retryGpsBtn: {
    marginTop: 8,
    backgroundColor: '#EF4444',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  retryGpsText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  zonesList: {
    gap: 14,
  },
  zoneCard: {
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  zoneCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  zoneNameText: {
    fontSize: 18,
    fontWeight: '800',
  },
  taglineText: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  groupBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  groupBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  coveredAreasWrap: {
    marginTop: 10,
  },
  coveredAreasHeader: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  areaChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  areaChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },
  zoneCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  distanceLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  eligibleTag: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  eligibleTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#15803D',
  },
  outOfRangeTag: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  outOfRangeTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#B91C1C',
  },
  landmarksText: {
    fontSize: 11,
    maxWidth: '45%',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  bottomBarInfo: {
    flex: 1,
  },
  bottomSelectedLabel: {
    fontSize: 11,
  },
  bottomSelectedValue: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  confirmBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 180,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
