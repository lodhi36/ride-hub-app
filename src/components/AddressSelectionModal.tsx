import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import {
  DeliveryAddress,
  getSavedAddresses,
  saveAddressToStorage,
  setActiveDeliveryAddress,
  fetchCurrentGpsPositionDetailed,
  fetchCurrentGpsPosition,
  reverseGeocodeCoords,
  deleteAddressFromStorage,
} from '../services/LocationAddressService';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';

interface AddressSelectionModalProps {
  visible: boolean;
  onClose: () => void;
  activeAddressId?: string;
  onSelectAddress: (address: DeliveryAddress) => void;
}

const AddressSelectionModal: React.FC<AddressSelectionModalProps> = ({
  visible,
  onClose,
  activeAddressId,
  onSelectAddress,
}) => {
  const [savedAddresses, setSavedAddresses] = useState<DeliveryAddress[]>([]);
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [loadingGps, setLoadingGps] = useState<boolean>(false);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);

  // Mode Selection: Option A ("Order for Myself") vs Option B ("Order for Someone Else") (Part F Requirement 13)
  const [orderTargetMode, setOrderTargetMode] = useState<'MYSELF' | 'SOMEONE_ELSE'>('MYSELF');

  // Option B ("Order for Someone Else") state
  const [recipientRelationship, setRecipientRelationship] = useState<'Friend' | 'Wife/Family' | 'Other'>('Friend');
  const [recipientName, setRecipientName] = useState<string>('');
  const [recipientPhone, setRecipientPhone] = useState<string>('');
  const [whatsappLocationLink, setWhatsappLocationLink] = useState<string>('');
  const [resolvingLocation, setResolvingLocation] = useState<boolean>(false);
  const [resolvedRecipientLocation, setResolvedRecipientLocation] = useState<{
    latitude: number;
    longitude: number;
    formattedAddress: string;
  } | null>(null);

  // Form fields
  const [tag, setTag] = useState<'Home' | 'Work' | 'Other'>('Home');
  const [houseNo, setHouseNo] = useState<string>('');
  const [floor, setFloor] = useState<string>('');
  const [landmark, setLandmark] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [pincode, setPincode] = useState<string>('');
  const [formCoords, setFormCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  // Helper: Parse Coordinates from WhatsApp / Google Maps Links
  const extractCoordinatesFromLinkOrText = (input: string): { latitude: number; longitude: number } | null => {
    if (!input) return null;
    const text = input.trim();

    // 1. Raw Coordinates: "23.2599, 77.4126" or "23.259932,77.412615"
    const rawMatch = text.match(/^(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)$/);
    if (rawMatch) {
      const lat = parseFloat(rawMatch[1]);
      const lon = parseFloat(rawMatch[2]);
      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        return { latitude: lat, longitude: lon };
      }
    }

    // 2. Google Maps URL with q=lat,lon or loc:lat,lon or daddr=lat,lon
    const qMatch = text.match(/(?:q=|loc:|daddr=)(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (qMatch) {
      const lat = parseFloat(qMatch[1]);
      const lon = parseFloat(qMatch[2]);
      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        return { latitude: lat, longitude: lon };
      }
    }

    // 3. Google Maps URL with @lat,lon,zoom
    const atMatch = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      const lat = parseFloat(atMatch[1]);
      const lon = parseFloat(atMatch[2]);
      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        return { latitude: lat, longitude: lon };
      }
    }

    // 4. geo:lat,lon
    const geoMatch = text.match(/geo:(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (geoMatch) {
      const lat = parseFloat(geoMatch[1]);
      const lon = parseFloat(geoMatch[2]);
      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        return { latitude: lat, longitude: lon };
      }
    }

    return null;
  };

  // Option B: Verify WhatsApp Location Action
  const handleVerifyRecipientLocation = async () => {
    if (!recipientName.trim()) {
      Alert.alert('Recipient Name Required', 'Please enter the name of the person you are ordering for.');
      return;
    }
    const cleanPhone = recipientPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      Alert.alert('Valid Phone Required', 'Please enter a valid 10-digit mobile number for the recipient.');
      return;
    }
    if (!whatsappLocationLink.trim()) {
      Alert.alert(
        'WhatsApp Location Needed',
        'Please ask the recipient to share their current WhatsApp location, copy the link or address, and paste it here.'
      );
      return;
    }

    try {
      setResolvingLocation(true);
      let parsed = extractCoordinatesFromLinkOrText(whatsappLocationLink);

      // If short link e.g. maps.app.goo.gl, attempt to expand by fetching headers
      if (!parsed && whatsappLocationLink.includes('http')) {
        try {
          const resp = await fetch(whatsappLocationLink.trim(), { method: 'GET', redirect: 'follow' });
          if (resp.url) {
            parsed = extractCoordinatesFromLinkOrText(resp.url);
          }
        } catch (_) {}
      }

      // If still not coordinates, attempt address search via Nominatim
      let resolvedLat = parsed?.latitude || 0;
      let resolvedLon = parsed?.longitude || 0;
      let displayAddress = '';

      if (parsed) {
        const geo = await reverseGeocodeCoords(parsed.latitude, parsed.longitude);
        displayAddress = geo.fullAddress || `Lat: ${parsed.latitude.toFixed(4)}, Lon: ${parsed.longitude.toFixed(4)}`;
      } else {
        // Geocode plain text address string
        try {
          const searchUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            whatsappLocationLink.trim() + ' Bhopal'
          )}&format=json&limit=1`;
          const sRes = await fetch(searchUrl, {
            headers: { 'User-Agent': 'RideHub-CustomerApp/2.0' },
          });
          const sData = await sRes.json();
          if (Array.isArray(sData) && sData.length > 0) {
            resolvedLat = parseFloat(sData[0].lat);
            resolvedLon = parseFloat(sData[0].lon);
            displayAddress = sData[0].display_name || whatsappLocationLink.trim();
          }
        } catch (_) {}
      }

      if ((!resolvedLat && !resolvedLon) || resolvedLat === 0) {
        Alert.alert(
          'Location Verification Failed',
          'Could not extract valid GPS coordinates from the provided link or text. Please ensure the link is a valid Google Maps / WhatsApp location pin, or enter Bhopal area details.'
        );
        return;
      }

      setResolvedRecipientLocation({
        latitude: resolvedLat,
        longitude: resolvedLon,
        formattedAddress: displayAddress || whatsappLocationLink.trim(),
      });
    } catch (e: any) {
      Alert.alert('Verification Error', e.message || 'Unable to verify recipient location at this time.');
    } finally {
      setResolvingLocation(false);
    }
  };

  // Option B: Confirm & Apply Recipient Address
  const handleConfirmRecipientOrder = async () => {
    if (!resolvedRecipientLocation) return;

    const recipientAddr: DeliveryAddress = {
      id: `addr_recipient_${Date.now()}`,
      tag: 'Someone Else',
      houseNo: `${recipientName.trim()} (${recipientRelationship})`,
      landmark: resolvedRecipientLocation.formattedAddress,
      city: 'Bhopal',
      pincode: '',
      fullAddress: resolvedRecipientLocation.formattedAddress,
      latitude: resolvedRecipientLocation.latitude,
      longitude: resolvedRecipientLocation.longitude,
      isCurrentLocation: false,
      isOrderingForSomeoneElse: true,
      recipientRelationship,
      recipientName: recipientName.trim(),
      recipientPhone: recipientPhone.trim(),
      originalLocationUrl: whatsappLocationLink.trim(),
    };

    await saveAddressToStorage(recipientAddr);
    await setActiveDeliveryAddress(recipientAddr);
    onSelectAddress(recipientAddr);
    onClose();
  };

  useEffect(() => {
    if (visible) {
      loadAddresses();
    }
  }, [visible]);

  const loadAddresses = async () => {
    try {
      setLoadingList(true);
      const localList = await getSavedAddresses();
      if (localList && localList.length > 0) {
        setSavedAddresses(localList);
      }

      // Sync with MongoDB backend
      try {
        const resp = await api.get('/customer/addresses');
        if (resp.data?.success && Array.isArray(resp.data?.addresses) && resp.data.addresses.length > 0) {
          const remoteList: DeliveryAddress[] = resp.data.addresses.map((a: any) => ({
            id: a._id?.toString() || a.id || `addr_${Date.now()}`,
            tag: a.tag || 'Home',
            houseNo: a.houseNumber || a.houseNo || '',
            landmark: a.landmark || a.formattedAddress || a.address || '',
            city: a.city || 'Bhopal',
            pincode: a.pincode || '',
            fullAddress: a.formattedAddress || a.address || '',
            latitude: a.latitude || (a.location?.coordinates && a.location.coordinates[1]) || 0,
            longitude: a.longitude || (a.location?.coordinates && a.location.coordinates[0]) || 0,
            isCurrentLocation: false,
          }));
          setSavedAddresses(remoteList);
          for (const item of remoteList) {
            await saveAddressToStorage(item);
          }
        } else if ((!localList || localList.length === 0) && (!resp.data?.addresses || resp.data.addresses.length === 0)) {
          setShowAddForm(true);
        }
      } catch (_) {
        if (!localList || localList.length === 0) {
          setShowAddForm(true);
        }
      }
    } catch (e) {
      console.log('[LOAD ADDRESSES ERROR]', e);
    } finally {
      setLoadingList(false);
    }
  };

  // 1. Fetch Current GPS Location & Auto Reverse-Geocode
  const handleFetchGpsLocation = async () => {
    try {
      setLoadingGps(true);
      const res = await fetchCurrentGpsPositionDetailed(false);
      if (!res.success || !res.fix) {
        if (res.errorType === 'PERMISSION_DENIED') {
          Alert.alert(
            'Location Required',
            'Please Turn On Location - Location is required to use Ride Hub.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Turn On Location', onPress: () => Linking.openSettings() },
            ]
          );
        } else {
          Alert.alert(
            'Location Unavailable',
            'Your location could not be fetched. Please move your device to an open area and try again.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Try Again', onPress: () => handleFetchGpsLocation() },
            ]
          );
        }
        return;
      }

      const pos = res.fix;
      setFormCoords(pos);
      // REQUIREMENT 2: Accuracy check > 50 meters
      if (pos.accuracy && pos.accuracy > 50) {
        Alert.alert(
          'GPS शुद्धता चेतावनी',
          'लोकेशन ठीक नहीं मिल रही, कृपया पिन खुद ठीक करें।\n(GPS शुद्धता: ' + Math.round(pos.accuracy) + 'm)'
        );
      }
      const geo = await reverseGeocodeCoords(pos.latitude, pos.longitude);

      const gpsAddr: DeliveryAddress = {
        id: `addr_gps_${Date.now()}`,
        tag: 'Home',
        houseNo: geo.area || 'Current Location',
        landmark: geo.fullAddress || '',
        city: geo.city || 'Bhopal',
        pincode: geo.pincode || '',
        fullAddress: geo.fullAddress || 'Current Location',
        latitude: pos.latitude,
        longitude: pos.longitude,
        isCurrentLocation: true,
      };

      await saveAddressToStorage(gpsAddr);
      await setActiveDeliveryAddress(gpsAddr);
      onSelectAddress(gpsAddr);
      onClose();
    } catch (e) {
      Alert.alert('Location Error', 'Your location could not be fetched. Please move your device to an open area and try again.');
    } finally {
      setLoadingGps(false);
    }
  };

  // 2. Save Address (from GPS or Manual Entry)
  const handleSaveAddress = async () => {
    if (!houseNo.trim() && !landmark.trim()) {
      Alert.alert('Missing Details', 'Please enter your Flat / House number or Area details.');
      return;
    }

    let defaultLat = formCoords?.latitude || 0;
    let defaultLon = formCoords?.longitude || 0;
    if (defaultLat === 0 || defaultLon === 0) {
      try {
        const liveGps = await fetchCurrentGpsPosition(false);
        if (liveGps?.latitude && liveGps?.longitude) {
          defaultLat = liveGps.latitude;
          defaultLon = liveGps.longitude;
        }
      } catch (_) {}
    }
    const full = [houseNo.trim(), landmark.trim(), city.trim(), pincode.trim()]
      .filter(Boolean)
      .join(', ');

    const newAddr: DeliveryAddress = {
      id: `addr_${Date.now()}`,
      tag,
      houseNo: [houseNo.trim(), floor.trim()].filter(Boolean).join(', '),
      landmark: landmark.trim(),
      city: city.trim() || 'Bhopal',
      pincode: pincode.trim(),
      fullAddress: full,
      latitude: defaultLat,
      longitude: defaultLon,
      isCurrentLocation: Boolean(formCoords),
    };

    // Save to backend database
    try {
      await api.post('/customer/addresses', {
        tag,
        label: tag,
        houseNumber: houseNo.trim(),
        floor: floor.trim(),
        landmark: landmark.trim(),
        address: full,
        formattedAddress: full,
        latitude: defaultLat,
        longitude: defaultLon,
        locationAccuracy: formCoords?.accuracy || 15,
        isDefault: true,
      });
    } catch (e: any) {
      console.log('[CUSTOMER ADDR BACKEND SYNC NOTE]:', e.message);
    }

    const updated = await saveAddressToStorage(newAddr);
    setSavedAddresses(updated);
    onSelectAddress(newAddr);
    resetForm();
    onClose();
  };

  const handleSelectExisting = async (addr: DeliveryAddress) => {
    await setActiveDeliveryAddress(addr);
    onSelectAddress(addr);
    onClose();
  };

  const handleDelete = async (id: string) => {
    Alert.alert('Delete Address', 'Are you sure you want to remove this saved address?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const updated = await deleteAddressFromStorage(id);
          setSavedAddresses(updated);
        },
      },
    ]);
  };

  const resetForm = () => {
    setTag('Home');
    setHouseNo('');
    setLandmark('');
    setCity('');
    setPincode('');
    setFormCoords(null);
    setShowAddForm(false);
  };


  const { isDark, currentColors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalBackdrop}
      >
        <View style={[styles.sheetContainer, isDark && { backgroundColor: currentColors.surface, borderColor: currentColors.border, borderWidth: 1 }]}>
          {/* Header */}
          <View style={[styles.sheetHeader, isDark && { borderBottomColor: currentColors.border }]}>
            <View>
              <Text style={[styles.sheetTitle, isDark && { color: currentColors.primaryText }]}>Delivery Address</Text>
              <Text style={[styles.sheetSubtitle, isDark && { color: currentColors.secondaryText }]}>Choose or add a delivery location</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, isDark && { backgroundColor: currentColors.elevatedSurface }]} activeOpacity={0.7}>
              <Text style={[styles.closeBtnText, isDark && { color: currentColors.primaryText }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* OPTION A vs OPTION B SEGMENTED SELECTOR (Part F Requirement 13) */}
          <View style={[styles.segmentContainer, isDark && { backgroundColor: currentColors.secondaryBackground }]}>
            <TouchableOpacity
              style={[
                styles.segmentTab,
                orderTargetMode === 'MYSELF' && styles.segmentTabActive,
              ]}
              onPress={() => setOrderTargetMode('MYSELF')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.segmentTabText,
                  orderTargetMode === 'MYSELF' && styles.segmentTabTextActive,
                ]}
              >
                👤 Order for Myself
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.segmentTab,
                orderTargetMode === 'SOMEONE_ELSE' && styles.segmentTabActive,
              ]}
              onPress={() => setOrderTargetMode('SOMEONE_ELSE')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.segmentTabText,
                  orderTargetMode === 'SOMEONE_ELSE' && styles.segmentTabTextActive,
                ]}
              >
                🎁 Order for Someone Else
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {orderTargetMode === 'MYSELF' ? (
              <>
            {/* Quick Action: Fetch GPS Location */}
            <TouchableOpacity
              style={styles.gpsActionBtn}
              onPress={handleFetchGpsLocation}
              disabled={loadingGps}
              activeOpacity={0.8}
            >
              <View style={styles.gpsIconCircle}>
                <Text style={{ fontSize: 18 }}>📍</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.gpsActionTitle}>Use Current GPS Location</Text>
                <Text style={styles.gpsActionSub}>
                  {loadingGps ? 'Fetching GPS coordinates...' : 'Auto-detect via device GPS and maps'}
                </Text>
              </View>
              {loadingGps ? (
                <ActivityIndicator size="small" color="#0066FF" />
              ) : (
                <Text style={styles.chevronActionText}>➔</Text>
              )}
            </TouchableOpacity>

            {/* TOGGLE FORM BUTTON */}
            {!showAddForm ? (
              <TouchableOpacity
                style={styles.addNewAddressToggleBtn}
                onPress={() => setShowAddForm(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.addNewAddressToggleText}>+ Enter Address Manually</Text>
              </TouchableOpacity>
            ) : (
              /* ADD NEW ADDRESS FORM */
              <View style={styles.formCard}>
                <View style={styles.formHeaderRow}>
                  <Text style={styles.formCardTitle}>Add New Address</Text>
                  <TouchableOpacity onPress={() => setShowAddForm(false)}>
                    <Text style={styles.cancelFormText}>Cancel</Text>
                  </TouchableOpacity>
                </View>

                {/* Tag Selection */}
                <Text style={styles.fieldLabel}>Save As</Text>
                <View style={styles.tagRow}>
                  {(['Home', 'Work', 'Other'] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.tagPill, tag === t && styles.tagPillActive]}
                      onPress={() => setTag(t)}
                    >
                      <Text style={[styles.tagPillText, tag === t && styles.tagPillTextActive]}>
                        {t === 'Home' ? '🏠 Home' : t === 'Work' ? '🏢 Work' : '📍 Other'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* House / Flat No */}
                <Text style={styles.fieldLabel}>Flat / House / Building No. *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Flat 302, Royal Enclave"
                  placeholderTextColor="#94A3B8"
                  value={houseNo}
                  onChangeText={setHouseNo}
                />

                {/* Street / Landmark */}
                <Text style={styles.fieldLabel}>Area / Street / Landmark *</Text>
                <TextInput
                  style={[styles.input, { minHeight: 60 }]}
                  placeholder="e.g. Near Karond Square, Mandir Road"
                  placeholderTextColor="#94A3B8"
                  multiline
                  value={landmark}
                  onChangeText={setLandmark}
                />

                {/* City & Pincode Row */}
                <View style={styles.rowTwoCols}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>City</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Bhopal"
                      placeholderTextColor="#94A3B8"
                      value={city}
                      onChangeText={setCity}
                    />
                  </View>
                  <View style={{ width: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Pincode</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. 462038"
                      placeholderTextColor="#94A3B8"
                      keyboardType="numeric"
                      value={pincode}
                      onChangeText={setPincode}
                    />
                  </View>
                </View>

                {/* Save Address Button */}
                <TouchableOpacity
                  style={styles.saveAddressBtn}
                  onPress={handleSaveAddress}
                  activeOpacity={0.85}
                >
                  <Text style={styles.saveAddressBtnText}>Save & Deliver Here</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* SAVED ADDRESSES LIST */}
            <View style={styles.savedSection}>
              <Text style={styles.sectionHeaderTitle}>Saved Addresses</Text>

              {loadingList ? (
                <ActivityIndicator size="small" color="#0066FF" style={{ marginVertical: 16 }} />
              ) : savedAddresses.length === 0 ? (
                <View style={styles.noSavedBox}>
                  <Text style={styles.noSavedEmoji}>📍</Text>
                  <Text style={styles.noSavedTitle}>No saved addresses yet</Text>
                  <Text style={styles.noSavedSub}>
                    Use the live GPS button above or type your delivery address.
                  </Text>
                </View>
              ) : (
                savedAddresses.map((addr) => {
                  const isSelected = addr.id === activeAddressId;
                  const tagEmoji = addr.tag === 'Home' ? '🏠' : addr.tag === 'Work' ? '🏢' : '📍';

                  return (
                    <TouchableOpacity
                      key={addr.id}
                      style={[styles.savedAddressCard, isSelected && styles.savedCardSelected]}
                      onPress={() => handleSelectExisting(addr)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.savedCardLeft}>
                        <View style={styles.savedTagBadge}>
                          <Text style={styles.savedTagText}>
                            {tagEmoji} {addr.tag}
                          </Text>
                        </View>
                        <Text style={styles.savedHouseText} numberOfLines={1}>
                          {addr.houseNo}
                        </Text>
                        <Text style={styles.savedFullAddressText} numberOfLines={2}>
                          {addr.landmark || addr.fullAddress}
                        </Text>
                        {Boolean(addr.city) && (
                          <Text style={styles.savedCityPincode}>
                            {addr.city} {addr.pincode ? `- ${addr.pincode}` : ''}
                          </Text>
                        )}
                      </View>

                      <View style={styles.savedCardRight}>
                        <View style={[styles.radioCircle, isSelected && styles.radioActive]}>
                          {isSelected && <View style={styles.radioInnerDot} />}
                        </View>
                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={() => handleDelete(addr.id)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.deleteBtnText}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
              </>
            ) : (
              /* OPTION B: ORDER FOR SOMEONE ELSE (WHATSAPP LOCATION RESOLVER) (Part F Requirement 13) */
              <View style={styles.recipientFormCard}>
                {/* WhatsApp Instruction Notice Box */}
                <View style={styles.whatsappNoticeBox}>
                  <Text style={{ fontSize: 22, marginRight: 8 }}>💬</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.whatsappNoticeTitle}>Order for Friend, Family, or Wife</Text>
                    <Text style={styles.whatsappNoticeText}>
                      Please ask the recipient to share their current WhatsApp location. Open the shared location, copy the address or location link, paste it below, and submit for verification.
                    </Text>
                  </View>
                </View>

                {/* Relationship Selector */}
                <Text style={styles.fieldLabel}>Recipient Relationship</Text>
                <View style={styles.tagRow}>
                  {(['Friend', 'Wife/Family', 'Other'] as const).map((rel) => (
                    <TouchableOpacity
                      key={rel}
                      style={[
                        styles.tagPill,
                        recipientRelationship === rel && styles.tagPillActive,
                      ]}
                      onPress={() => setRecipientRelationship(rel)}
                    >
                      <Text
                        style={[
                          styles.tagPillText,
                          recipientRelationship === rel && styles.tagPillTextActive,
                        ]}
                      >
                        {rel === 'Friend' ? '🤝 Friend' : rel === 'Wife/Family' ? '❤️ Wife / Family' : '📦 Other'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Recipient Name */}
                <Text style={styles.fieldLabel}>Recipient Full Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Priya Verma / Rohit Sharma"
                  placeholderTextColor="#94A3B8"
                  value={recipientName}
                  onChangeText={setRecipientName}
                />

                {/* Recipient Phone Number */}
                <Text style={styles.fieldLabel}>Recipient Mobile Number (For Delivery Partner Calls) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 9876543210 (10 digits)"
                  placeholderTextColor="#94A3B8"
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={recipientPhone}
                  onChangeText={setRecipientPhone}
                />

                {/* WhatsApp / Google Maps Location Link or Address */}
                <Text style={styles.fieldLabel}>WhatsApp Shared Location Link or Address *</Text>
                <TextInput
                  style={[styles.input, { height: 75, textAlignVertical: 'top' }]}
                  placeholder="Paste WhatsApp location link (e.g. https://maps.google.com/?q=...) or type address"
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={3}
                  value={whatsappLocationLink}
                  onChangeText={(txt) => {
                    setWhatsappLocationLink(txt);
                    setResolvedRecipientLocation(null);
                  }}
                />

                {/* Verify Location Button */}
                <TouchableOpacity
                  style={[
                    styles.verifyLocationBtn,
                    resolvingLocation && { opacity: 0.7 },
                  ]}
                  onPress={handleVerifyRecipientLocation}
                  disabled={resolvingLocation}
                  activeOpacity={0.8}
                >
                  {resolvingLocation ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.verifyLocationBtnText}>🔍 Verify Location & Resolve Coordinates</Text>
                  )}
                </TouchableOpacity>

                {/* Confirmed Location Preview Card */}
                {resolvedRecipientLocation && (
                  <View style={styles.confirmedLocationCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Text style={{ fontSize: 16 }}>✅</Text>
                      <Text style={styles.confirmedLocationTitle}>Verified Delivery Destination</Text>
                    </View>
                    <Text style={styles.confirmedLocationAddress}>
                      {resolvedRecipientLocation.formattedAddress}
                    </Text>
                    <Text style={styles.confirmedLocationCoords}>
                      GPS Coordinates: {resolvedRecipientLocation.latitude.toFixed(5)}, {resolvedRecipientLocation.longitude.toFixed(5)}
                    </Text>

                    <TouchableOpacity
                      style={styles.confirmRecipientBtn}
                      onPress={handleConfirmRecipientOrder}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.confirmRecipientBtnText}>
                        Deliver Order to {recipientName || 'Recipient'} ➔
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  sheetSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },

  /* GPS Action Button */
  gpsActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  gpsIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  gpsActionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#166534',
  },
  gpsActionSub: {
    fontSize: 11,
    color: '#15803D',
    marginTop: 2,
  },
  chevronActionText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#166534',
    marginLeft: 8,
  },

  /* Toggle manual form */
  addNewAddressToggleBtn: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    backgroundColor: '#F8FAFC',
  },
  addNewAddressToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },

  /* Form Card */
  formCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 18,
  },
  formHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  formCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  cancelFormText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EF4444',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    marginTop: 8,
  },
  tagRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  tagPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  tagPillActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  tagPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  tagPillTextActive: {
    color: '#FFFFFF',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0F172A',
  },
  rowTwoCols: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveAddressBtn: {
    backgroundColor: '#0066FF',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  saveAddressBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  /* Saved Addresses Section */
  savedSection: {
    marginTop: 4,
  },
  sectionHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },
  noSavedBox: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
  },
  noSavedEmoji: {
    fontSize: 28,
  },
  noSavedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    marginTop: 6,
  },
  noSavedSub: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    paddingHorizontal: 20,
    marginTop: 2,
  },

  savedAddressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  savedCardSelected: {
    borderColor: '#0066FF',
    backgroundColor: '#FFF5F5',
  },
  savedCardLeft: {
    flex: 1,
    marginRight: 10,
  },
  savedTagBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4,
  },
  savedTagText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  savedHouseText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  savedFullAddressText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  savedCityPincode: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  savedCardRight: {
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: '#0066FF',
  },
  radioInnerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0066FF',
  },
  deleteBtn: {
    padding: 4,
  },
  deleteBtnText: {
    fontSize: 14,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    padding: 4,
    borderRadius: 12,
  },
  segmentTab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 9,
  },
  segmentTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  segmentTabTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  recipientFormCard: {
    marginTop: 6,
    paddingHorizontal: 2,
  },
  whatsappNoticeBox: {
    flexDirection: 'row',
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    padding: 12,
    borderRadius: 14,
    marginBottom: 14,
  },
  whatsappNoticeTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#065F46',
    marginBottom: 2,
  },
  whatsappNoticeText: {
    fontSize: 11,
    color: '#047857',
    lineHeight: 16,
  },
  verifyLocationBtn: {
    backgroundColor: '#0F172A',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  verifyLocationBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  confirmedLocationCard: {
    marginTop: 14,
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
    borderWidth: 1,
    padding: 14,
    borderRadius: 14,
  },
  confirmedLocationTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#166534',
  },
  confirmedLocationAddress: {
    fontSize: 12,
    color: '#15803D',
    marginTop: 2,
    fontWeight: '600',
    lineHeight: 16,
  },
  confirmedLocationCoords: {
    fontSize: 10,
    fontStyle: 'italic',
    color: '#16A34A',
    marginTop: 4,
  },
  confirmRecipientBtn: {
    marginTop: 12,
    backgroundColor: '#16A34A',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmRecipientBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
});

export default AddressSelectionModal;
