import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Dimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
const WebViewComponent = WebView as any;
import { BASE_URL } from '../config/apiConfig';
import { bikeBase64 } from '../banner/base64_images';
import { useTheme } from '../context/ThemeContext';

const { width, height } = Dimensions.get('window');

export interface AssignedRider {
  riderId: string;
  bookingId: string;
  orderId: string;
  riderName: string;
  riderPhone: string;
  riderPhoto: string | null;
  riderStatus: string;
  deliveryStatus: string;
  orderStatus: string;
  isArrived: boolean;
  statusText: string;
  arrivedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  storeLatitude: number | null;
  storeLongitude: number | null;
  storeName: string;
  customerName: string;
  totalAmount: number;
}

interface RidersTrackingModalProps {
  visible: boolean;
  onClose: () => void;
  restaurantId?: string;
  socket?: any;
}

export const RidersTrackingModal: React.FC<RidersTrackingModalProps> = ({
  visible,
  onClose,
  restaurantId,
  socket,
}) => {
  const { isDark, currentColors } = useTheme('supplier');
  const [riders, setRiders] = useState<AssignedRider[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedRiderForMap, setSelectedRiderForMap] = useState<AssignedRider | null>(null);
  const webViewRef = useRef<WebView | null>(null);

  const fetchRiders = async () => {
    try {
      setLoading(true);
      const cleanBase = BASE_URL.replace(/\/+$/, '');
      const url = `${cleanBase}/bookings/restaurant/riders?restaurantId=${restaurantId || ''}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data && data.success && Array.isArray(data.riders)) {
        setRiders(data.riders);
      }
    } catch (e) {
      console.log('Error fetching restaurant riders:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      fetchRiders();
    }
  }, [visible, restaurantId]);

  // Real-time GPS location & arrival updates via Socket
  useEffect(() => {
    if (!socket || !visible) return;

    const onLocationUpdate = (locData: any) => {
      const rId = String(locData.riderId || locData.providerId || '');
      const lat = Number(locData.latitude || locData.location?.latitude);
      const lon = Number(locData.longitude || locData.location?.longitude);
      if (!rId || !lat || !lon) return;

      setRiders((prev) =>
        prev.map((r) => {
          if (r.riderId === rId) {
            return { ...r, latitude: lat, longitude: lon };
          }
          return r;
        })
      );

      // If active map is viewing this rider, inject JS to smoothly move the marker
      if (selectedRiderForMap && selectedRiderForMap.riderId === rId) {
        setSelectedRiderForMap((curr) => (curr ? { ...curr, latitude: lat, longitude: lon } : curr));
        const jsCode = `if (typeof window.updateRiderMarker === 'function') { window.updateRiderMarker(${lat}, ${lon}); }`;
        webViewRef.current?.injectJavaScript(jsCode);
      }
    };

    const onRiderReached = (data: any) => {
      const bId = data.bookingId || data.rideId;
      const rId = String(data.riderId || '');
      setRiders((prev) =>
        prev.map((r) => {
          if (r.bookingId === bId || (rId && r.riderId === rId)) {
            return {
              ...r,
              isArrived: true,
              riderStatus: 'REACHED_RESTAURANT',
              statusText: 'Rider Arrived',
              arrivedAt: new Date().toISOString(),
            };
          }
          return r;
        })
      );
    };

    socket.on('rider_location_updated', onLocationUpdate);
    socket.on('rider_location_update', onLocationUpdate);
    socket.on('rider_reached_restaurant', onRiderReached);

    return () => {
      socket.off('rider_location_updated', onLocationUpdate);
      socket.off('rider_location_update', onLocationUpdate);
      socket.off('rider_reached_restaurant', onRiderReached);
    };
  }, [socket, visible, selectedRiderForMap]);

  // Leaflet HTML generation for Rider tracking map
  const getMapHtml = (rider: AssignedRider) => {
    const rLat = rider.latitude || 23.2599;
    const rLon = rider.longitude || 77.4126;
    const sLat = rider.storeLatitude || 23.2599;
    const sLon = rider.storeLongitude || 77.4126;
    const rName = (rider.riderName || 'Rider').replace(/'/g, '');
    const sName = (rider.storeName || 'Store').replace(/'/g, '');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #F1F5F9; font-family: sans-serif; }
          .pulsing-rider {
            background-color: #2563EB;
            width: 22px;
            height: 22px;
            border-radius: 50%;
            border: 3px solid #FFFFFF;
            box-shadow: 0 0 10px rgba(37,99,235,0.8);
            animation: pulseRing 1.5s infinite;
          }
          @keyframes pulseRing {
            0% { box-shadow: 0 0 0 0 rgba(37,99,235,0.7); }
            70% { box-shadow: 0 0 0 14px rgba(37,99,235,0); }
            100% { box-shadow: 0 0 0 0 rgba(37,99,235,0); }
          }
          .marker-wrapper {
            position: relative;
            width: 70px;
            height: 70px;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .bike-signal-ring {
            position: absolute;
            width: 28px;
            height: 28px;
            background: rgba(0, 102, 255, 0.35);
            border: 1.5px solid rgba(0, 102, 255, 0.5);
            border-radius: 50%;
            animation: signalPulse50 2.4s infinite ease-out;
          }
          .bike-shadow-pulse {
            position: absolute;
            bottom: 8px;
            width: 32px;
            height: 8px;
            background: rgba(0, 0, 0, 0.35);
            border-radius: 50%;
            filter: blur(2px);
            animation: shadowBreathing50 2.4s infinite ease-in-out;
          }
          .bike-rotator {
            position: relative;
            width: 48px;
            height: 48px;
            display: flex;
            justify-content: center;
            align-items: center;
            transition: transform 0.35s ease-out;
          }
          .bike-idler-container {
            width: 100%;
            height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            animation: bikeFloating50 2.4s infinite ease-in-out;
          }
          .bike-engine-vibe {
            width: 100%;
            height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            animation: engineVibe50 0.25s infinite linear;
          }
          .bike-img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            filter: drop-shadow(0px 4px 6px rgba(0,0,0,0.45));
          }
          @keyframes signalPulse50 {
            0% { transform: scale(0.8); opacity: 0.5; }
            50% { opacity: 0.25; }
            100% { transform: scale(2.6); opacity: 0; }
          }
          @keyframes shadowBreathing50 {
            0%, 100% { transform: scale(1); opacity: 0.5; }
            50% { transform: scale(0.82); opacity: 0.25; }
          }
          @keyframes bikeFloating50 {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-3px); }
          }
          @keyframes engineVibe50 {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            25% { transform: translateY(-0.6px) rotate(-0.5deg); }
            50% { transform: translateY(0.5px) rotate(0.5deg); }
            75% { transform: translateY(-0.3px) rotate(-0.3deg); }
          }
          .custom-popup {
            font-size: 13px;
            font-weight: bold;
            color: #1E293B;
          }
          .custom-resto-pin-wrapper {
            position: relative;
            width: 36px;
            height: 46px;
            display: flex;
            flex-direction: column;
            align-items: center;
            cursor: pointer;
            transform: translate(-50%, -100%);
          }
          .resto-pin-shadow {
            position: absolute;
            bottom: -2px;
            width: 16px;
            height: 5px;
            background: rgba(0, 0, 0, 0.35);
            border-radius: 50%;
            filter: blur(1.5px);
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          const riderLat = ${rLat};
          const riderLon = ${rLon};
          const storeLat = ${sLat};
          const storeLon = ${sLon};

          const map = L.map('map', { zoomControl: false }).setView([riderLat, riderLon], 15);

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
          }).addTo(map);

          // Store Marker (Exact Same Pink Teardrop Cutlery Icon as Rider Home Screen)
          const storeHtml = '<div class="custom-resto-pin-wrapper">' +
            '<div class="resto-pin-shadow"></div>' +
            '<svg width="36" height="46" viewBox="0 0 38 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 3px 6px rgba(225, 29, 72, 0.45));">' +
            '  <path d="M19 1C9.05888 1 1 9.05888 1 19C1 31.8 19 47 19 47C19 47 37 31.8 37 19C37 9.05888 28.9411 1 19 1Z" fill="#E11D48" stroke="#FFFFFF" stroke-width="2.5"/>' +
            '  <path d="M14 11V15C14 16.1 14.9 17 16 17V25H17V17C18.1 17 19 16.1 19 15V11H18V14H17V11H16V14H15V11H14Z" fill="#FFFFFF"/>' +
            '  <path d="M21 11V25H22.5V17H24C24 13.5 22.5 11 21 11Z" fill="#FFFFFF"/>' +
            '</svg>' +
            '</div>';
          const storeIcon = L.divIcon({
            className: 'custom-pin store-pin',
            html: storeHtml,
            iconSize: [0, 0],
            iconAnchor: [0, 0]
          });
          const storeMarker = L.marker([storeLat, storeLon], { icon: storeIcon }).addTo(map);
          storeMarker.bindPopup('<div class="custom-popup">🏪 ${sName}</div>');

          // Rider Marker (Animated Bike PNG from First Screen)
          const riderIcon = L.divIcon({
            className: 'driver-marker-icon',
            html: '<div class="marker-wrapper" id="driver-wrapper"><div class="bike-signal-ring"></div><div class="bike-shadow-pulse" id="bike-shadow"></div><div class="bike-rotator" id="bike-rotator"><div class="bike-idler-container" id="bike-idler"><div class="bike-engine-vibe"><img src="${bikeBase64}" class="bike-img" alt="Driver"/></div></div></div></div>',
            iconSize: [70, 70],
            iconAnchor: [35, 35]
          });
          let riderMarker = L.marker([riderLat, riderLon], { icon: riderIcon }).addTo(map);
          riderMarker.bindPopup('<div class="custom-popup">🛵 ${rName}</div>').openPopup();

          // Connect store and rider with dashed blue line
          const line = L.polyline([[storeLat, storeLon], [riderLat, riderLon]], {
            color: '#2563EB',
            weight: 4,
            dashArray: '8, 8',
            opacity: 0.85
          }).addTo(map);

          // Fit bounds to show both store and rider
          const group = new L.featureGroup([storeMarker, riderMarker]);
          map.fitBounds(group.getBounds().pad(0.35));

          // Smooth marker movement function
          window.updateRiderMarker = function(newLat, newLon) {
            if (riderMarker) {
              riderMarker.setLatLng([newLat, newLon]);
              line.setLatLngs([[storeLat, storeLon], [newLat, newLon]]);
            }
          };
        </script>
      </body>
      </html>
    `;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.container, isDark && { backgroundColor: currentColors.background }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Text style={styles.backButtonText}>✕</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Delivery Partners</Text>
            <Text style={styles.headerSubtitle}>
              {riders.length} {riders.length === 1 ? 'Rider' : 'Riders'} assigned to your orders
            </Text>
          </View>
          <TouchableOpacity onPress={fetchRiders} style={styles.refreshBtn}>
            <Text style={{ fontSize: 16 }}>🔄</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#0066FF" />
            <Text style={[styles.loadingText, isDark && { color: currentColors.mutedText }]}>Fetching delivery partner locations...</Text>
          </View>
        ) : riders.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={{ fontSize: 52 }}>🛵</Text>
            <Text style={[styles.emptyTitle, isDark && { color: currentColors.primaryText }]}>No Riders Assigned Yet</Text>
            <Text style={[styles.emptySubtitle, isDark && { color: currentColors.secondaryText }]}>
              Once a rider accepts or is assigned to your orders, they will appear here with live tracking.
            </Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchRiders}>
              <Text style={styles.retryBtnText}>Refresh List</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={riders}
            keyExtractor={(item) => `${item.riderId}_${item.bookingId}`}
            contentContainerStyle={styles.listContainer}
            renderItem={({ item }) => {
              const isArrived = item.isArrived || item.riderStatus === 'REACHED_RESTAURANT';
              return (
                <View style={[
                  styles.riderCard,
                  isDark && { backgroundColor: currentColors.card, borderColor: currentColors.border },
                  isArrived && (isDark ? { borderColor: '#10B981', backgroundColor: '#132B20' } : styles.arrivedCardBorder)
                ]}>
                  {/* Top Row: Info & Status */}
                  <View style={styles.cardTopRow}>
                    <View style={styles.avatarWrap}>
                      {item.riderPhoto ? (
                        <Image source={{ uri: item.riderPhoto }} style={styles.avatarImg} />
                      ) : (
                        <View style={[styles.avatarFallback, isDark && { backgroundColor: currentColors.elevatedSurface, borderColor: currentColors.border }]}>
                          <Text style={{ fontSize: 22 }}>🛵</Text>
                        </View>
                      )}
                    </View>

                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={[styles.riderName, isDark && { color: currentColors.primaryText }]} numberOfLines={1}>
                          {item.riderName}
                        </Text>
                        <View
                          style={[
                            styles.statusBadge,
                            isArrived ? styles.arrivedBadge : styles.onTheWayBadge,
                            isDark && (isArrived ? { backgroundColor: '#14532D', borderColor: '#16A34A' } : { backgroundColor: '#1E293B', borderColor: currentColors.border }),
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              isArrived ? styles.arrivedBadgeText : styles.onTheWayBadgeText,
                              isDark && (isArrived ? { color: '#4ADE80' } : { color: '#60A5FA' }),
                            ]}
                          >
                            {isArrived ? '✓ Rider Arrived' : '🛵 On the way'}
                          </Text>
                        </View>
                      </View>

                      <Text style={[styles.orderNumberText, isDark && { color: '#60A5FA' }]}>Order #{item.bookingId?.slice(-6)}</Text>
                      <Text style={[styles.customerText, isDark && { color: currentColors.secondaryText }]}>Customer: {item.customerName || 'Customer'}</Text>
                    </View>
                  </View>

                  {/* Arrival Banner if Arrived */}
                  {isArrived && (
                    <View style={[styles.arrivedBanner, isDark && { backgroundColor: '#132B20', borderColor: '#166534' }]}>
                      <Text style={[styles.arrivedBannerText, isDark && { color: '#4ADE80' }]}>
                        🔔 Rider has arrived at your store! Hand over the food package.
                      </Text>
                    </View>
                  )}

                  {/* Action Buttons Row */}
                  <View style={[styles.actionRow, isDark && { borderTopColor: currentColors.border }]}>
                    {Boolean(item.riderPhone) && (
                      <TouchableOpacity
                        style={[styles.callButton, isDark && { backgroundColor: currentColors.elevatedSurface, borderColor: currentColors.border }]}
                        onPress={() => Linking.openURL(`tel:${item.riderPhone}`).catch(() => {})}
                        activeOpacity={0.8}
                      >
                        <Text style={{ fontSize: 15, marginRight: 6 }}>📞</Text>
                        <Text style={[styles.callButtonText, isDark && { color: currentColors.primaryText }]}>Call Rider</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={styles.trackButton}
                      onPress={() => setSelectedRiderForMap(item)}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 15, marginRight: 6 }}>📍</Text>
                      <Text style={styles.trackButtonText}>Track Rider</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />
        )}

        {/* Live Rider Tracking Map Modal */}
        {selectedRiderForMap && (
          <Modal
            visible={Boolean(selectedRiderForMap)}
            animationType="slide"
            transparent={false}
            onRequestClose={() => setSelectedRiderForMap(null)}
          >
            <View style={styles.mapContainer}>
              {/* Map Header */}
              <View style={styles.mapHeader}>
                <TouchableOpacity
                  onPress={() => setSelectedRiderForMap(null)}
                  style={styles.backButton}
                >
                  <Text style={styles.backButtonText}>✕</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={styles.headerTitle}>Live Rider Tracking</Text>
                  <Text style={styles.headerSubtitle} numberOfLines={1}>
                    {selectedRiderForMap.riderName} • Order #{selectedRiderForMap.bookingId?.slice(-6)}
                  </Text>
                </View>
                {selectedRiderForMap.riderPhone ? (
                  <TouchableOpacity
                    style={styles.mapCallBtn}
                    onPress={() => Linking.openURL(`tel:${selectedRiderForMap.riderPhone}`).catch(() => {})}
                  >
                    <Text style={{ fontSize: 16 }}>📞</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Status bar */}
              <View
                style={[
                  styles.mapStatusBanner,
                  (selectedRiderForMap.isArrived || selectedRiderForMap.riderStatus === 'REACHED_RESTAURANT')
                    ? styles.arrivedBanner
                    : styles.onTheWayBanner,
                ]}
              >
                <Text
                  style={[
                    styles.mapStatusBannerText,
                    (selectedRiderForMap.isArrived || selectedRiderForMap.riderStatus === 'REACHED_RESTAURANT')
                      ? styles.arrivedBannerText
                      : styles.onTheWayBannerText,
                  ]}
                >
                  {(selectedRiderForMap.isArrived || selectedRiderForMap.riderStatus === 'REACHED_RESTAURANT')
                    ? '📍 Rider Arrived at your Store'
                    : '🛵 Rider is navigating to your Store'}
                </Text>
              </View>

              {/* Interactive OpenStreetMap WebView */}
              <View style={styles.webViewWrap}>
                <WebViewComponent
                  ref={webViewRef}
                  originWhitelist={['*']}
                  source={{ html: getMapHtml(selectedRiderForMap) }}
                  style={{ flex: 1 }}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  startInLoadingState={true}
                  renderLoading={() => (
                    <View style={styles.mapLoading}>
                      <ActivityIndicator size="large" color="#0066FF" />
                      <Text style={styles.loadingText}>Loading live GPS map...</Text>
                    </View>
                  )}
                />
              </View>

              {/* Bottom Card */}
              <View style={[styles.mapBottomCard, isDark && { backgroundColor: currentColors.card, borderTopColor: currentColors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={[styles.avatarWrapSmall, isDark && { backgroundColor: currentColors.elevatedSurface }]}>
                    {selectedRiderForMap.riderPhoto ? (
                      <Image source={{ uri: selectedRiderForMap.riderPhoto }} style={styles.avatarImgSmall} />
                    ) : (
                      <Text style={{ fontSize: 18 }}>🛵</Text>
                    )}
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.bottomCardRiderName, isDark && { color: currentColors.primaryText }]}>{selectedRiderForMap.riderName}</Text>
                    <Text style={[styles.bottomCardSub, isDark && { color: currentColors.secondaryText }]}>
                      {selectedRiderForMap.isArrived ? 'Arrived at Store' : 'Real-time GPS Active'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.closeMapBtn, isDark && { backgroundColor: currentColors.elevatedSurface }]}
                    onPress={() => setSelectedRiderForMap(null)}
                  >
                    <Text style={[styles.closeMapBtnText, isDark && { color: currentColors.primaryText }]}>Close Map</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#0066FF',
    elevation: 4,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#E0E7FF',
    fontSize: 12,
    marginTop: 2,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F172A',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 20,
    backgroundColor: '#0066FF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  listContainer: {
    padding: 16,
  },
  riderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    elevation: 2,
  },
  arrivedCardBorder: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
  },
  avatarImg: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarFallback: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  riderName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
    flex: 1,
  },
  orderNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0066FF',
    marginTop: 2,
  },
  customerText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  arrivedBadge: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  onTheWayBadge: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  arrivedBadgeText: {
    color: '#15803D',
  },
  onTheWayBadgeText: {
    color: '#1D4ED8',
  },
  arrivedBanner: {
    backgroundColor: '#DCFCE7',
    borderRadius: 8,
    padding: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  arrivedBannerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  callButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 9,
    borderRadius: 8,
  },
  callButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  trackButton: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0066FF',
    paddingVertical: 9,
    borderRadius: 8,
  },
  trackButtonText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  mapContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#0066FF',
    elevation: 4,
  },
  mapCallBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapStatusBanner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  onTheWayBanner: {
    backgroundColor: '#EFF6FF',
    borderBottomWidth: 1,
    borderBottomColor: '#BFDBFE',
  },
  onTheWayBannerText: {
    color: '#1D4ED8',
  },
  mapStatusBannerText: {
    fontSize: 13,
    fontWeight: '800',
  },
  webViewWrap: {
    flex: 1,
  },
  mapLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(248, 250, 252, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapBottomCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    elevation: 6,
  },
  avatarWrapSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImgSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  bottomCardRiderName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  bottomCardSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeMapBtn: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  closeMapBtnText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 13,
  },
});

export default RidersTrackingModal;
