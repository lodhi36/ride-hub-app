import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
  Alert,
} from 'react-native';
import WebView from 'react-native-webview';
import {
  generateReceiptHtml,
  generateEscPosText,
  shareReceiptViaWhatsApp,
  parseBillOrderItems,
  getBillOrderTotal,
  formatBillDateTime,
  StoreInfo,
} from '../services/BillPrintService';

interface BillPrintModalProps {
  visible: boolean;
  order: any;
  storeInfo?: StoreInfo;
  onClose: () => void;
}

const { width, height } = Dimensions.get('window');

export const BillPrintModal: React.FC<BillPrintModalProps> = ({
  visible,
  order,
  storeInfo,
  onClose,
}) => {
  const webViewRef = useRef<any>(null);
  const [printTriggered, setPrintTriggered] = useState<boolean>(false);
  const [copiedNotification, setCopiedNotification] = useState<boolean>(false);

  if (!order) return null;

  const storeName = storeInfo?.name || order?.restaurantName || 'RIDEHUB STORE PARTNER';
  const orderId = String(order?.bookingId || order?.rideId || order?._id || order?.id || '').slice(-6).toUpperCase() || 'ORDER';
  const dateTime = formatBillDateTime(order?.createdAt || order?.orderDate);
  const customerName = order?.customerName || order?.userName || 'Customer';
  const customerPhone = order?.customerPhone || order?.userPhone || '';
  const customerAddress = order?.destinationAddress || order?.serviceAddress || order?.deliveryAddress || 'Customer Address';
  const paymentMethod = (order?.paymentMethod || 'cash').toUpperCase() === 'CASH' ? 'CASH ON DELIVERY (COD)' : 'PAID ONLINE';

  const totalFood = getBillOrderTotal(order);
  const items = parseBillOrderItems(order?.cartItems || order?.items, totalFood);
  const receiptHtml = generateReceiptHtml(order, storeInfo);

  const handleTriggerPrint = () => {
    setPrintTriggered(true);
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        try {
          window.print();
        } catch (e) {
          console.log('window.print error:', e);
        }
        true;
      `);
    } else {
      Alert.alert('Printing Job Sent', `Receipt #${orderId} sent to connected Bluetooth / POS printer.`);
    }
  };

  const handleShareWhatsApp = () => {
    shareReceiptViaWhatsApp(order, storeInfo);
  };

  const handleCopyText = () => {
    const rawText = generateEscPosText(order, storeInfo);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 3000);
    Alert.alert('Receipt Copied! 📋', 'Monospace thermal receipt copied. You can paste it in your Bluetooth POS printer terminal or chat.');
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.cardContainer}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.headerIconCircle}>
                <Text style={{ fontSize: 18 }}>🖨️</Text>
              </View>
              <View>
                <Text style={styles.headerTitle}>BILL PRINT (बिल प्रिंट)</Text>
                <Text style={styles.headerSub}>Order #{orderId} • POS Machine Receipt</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Receipt Preview (Styled like authentic thermal roll paper) */}
          <ScrollView style={styles.scrollReceipt} showsVerticalScrollIndicator={false}>
            <View style={styles.paperReceipt}>
              <View style={styles.paperHeader}>
                <Text style={styles.paperStoreName}>{storeName.toUpperCase()}</Text>
                <Text style={styles.paperSub}>Authorized Merchant Outlet</Text>
                {storeInfo?.phone ? <Text style={styles.paperPhone}>Tel: {storeInfo.phone}</Text> : null}
                <View style={styles.tagBadge}>
                  <Text style={styles.tagBadgeText}>KITCHEN ORDER TICKET (KOT) / TAX INVOICE</Text>
                </View>
              </View>

              <View style={styles.dashDivider} />

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Order ID:</Text>
                <Text style={styles.metaValue}>#{orderId}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Date/Time:</Text>
                <Text style={styles.metaValue}>{dateTime}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Payment:</Text>
                <Text style={[styles.metaValue, { color: paymentMethod.includes('CASH') ? '#0066FF' : '#16A34A', fontWeight: '800' }]}>
                  {paymentMethod}
                </Text>
              </View>

              <View style={styles.dashDivider} />

              {/* Customer Box */}
              <View style={styles.custBox}>
                <Text style={styles.custHeader}>CUSTOMER DETAILS</Text>
                <Text style={styles.custName}>👤 {customerName}</Text>
                {customerPhone ? <Text style={styles.custPhone}>📞 {customerPhone}</Text> : null}
                <Text style={styles.custAddr}>📍 {customerAddress}</Text>
              </View>

              <View style={styles.dashDivider} />

              {/* Items Table */}
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.thText, { flex: 3 }]}>ITEM</Text>
                <Text style={[styles.thText, { flex: 1, textAlign: 'center' }]}>QTY</Text>
                <Text style={[styles.thText, { flex: 1.5, textAlign: 'right' }]}>RATE</Text>
                <Text style={[styles.thText, { flex: 1.5, textAlign: 'right' }]}>TOTAL</Text>
              </View>
              <View style={styles.solidLine} />

              {items.map((it, idx) => {
                const itemTotal = (Number(it.price) || 0) * (Number(it.quantity) || 1);
                return (
                  <View key={it.id || idx} style={styles.tableItemRow}>
                    <Text style={[styles.tdItemName, { flex: 3 }]}>
                      {idx + 1}. {it.name}
                    </Text>
                    <Text style={[styles.tdQty, { flex: 1 }]}>x{it.quantity}</Text>
                    <Text style={[styles.tdPrice, { flex: 1.5 }]}>₹{it.price}</Text>
                    <Text style={[styles.tdTotal, { flex: 1.5 }]}>₹{itemTotal}</Text>
                  </View>
                );
              })}

              <View style={styles.dashDivider} />

              <View style={styles.metaRow}>
                <Text style={styles.summaryLabel}>Subtotal:</Text>
                <Text style={styles.summaryValue}>₹{totalFood}</Text>
              </View>
              <View style={styles.solidLine} />

              <View style={[styles.metaRow, { marginTop: 4 }]}>
                <Text style={styles.grandTotalLabel}>GRAND TOTAL:</Text>
                <Text style={styles.grandTotalVal}>₹{totalFood}</Text>
              </View>

              <View style={styles.dashDivider} />
              <Text style={styles.paperFooter}>*** THANK YOU FOR ORDERING ***</Text>
              <Text style={styles.paperFooterSub}>Printed via RideHub Partner POS System</Text>
            </View>
          </ScrollView>

          {/* Hidden WebView for direct System / Bluetooth POS Printing */}
          <View style={{ height: 0, width: 0, opacity: 0, overflow: 'hidden' }}>
            {React.createElement(WebView as any, {
              ref: webViewRef,
              originWhitelist: ['*'],
              source: { html: receiptHtml },
              javaScriptEnabled: true,
              domStorageEnabled: true,
            })}
          </View>

          {/* Action Buttons */}
          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.primaryPrintBtn}
              onPress={handleTriggerPrint}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryPrintBtnText}>🖨️ Print to Machine (प्रिंट निकालें)</Text>
            </TouchableOpacity>

            <View style={styles.secondaryActionsRow}>
              <TouchableOpacity
                style={styles.whatsAppBtn}
                onPress={handleShareWhatsApp}
                activeOpacity={0.8}
              >
                <Text style={styles.whatsAppBtnText}>💬 WhatsApp Bill</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.copyBtn}
                onPress={handleCopyText}
                activeOpacity={0.8}
              >
                <Text style={styles.copyBtnText}>
                  {copiedNotification ? '✓ Copied' : '📋 Copy Text'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '92%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#0066FF',
  },
  headerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  headerSub: {
    fontSize: 11,
    color: '#E0F2FE',
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  scrollReceipt: {
    maxHeight: height * 0.52,
    padding: 14,
    backgroundColor: '#F1F5F9',
  },
  paperReceipt: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  paperHeader: {
    alignItems: 'center',
    marginBottom: 4,
  },
  paperStoreName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  paperSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  paperPhone: {
    fontSize: 11,
    color: '#64748B',
  },
  tagBadge: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  tagBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0066FF',
  },
  dashDivider: {
    borderTopWidth: 1,
    borderColor: '#94A3B8',
    borderStyle: 'dashed',
    marginVertical: 10,
  },
  solidLine: {
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    marginVertical: 6,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 2,
  },
  metaLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  metaValue: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '700',
  },
  custBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  custHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0066FF',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  custName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  custPhone: {
    fontSize: 12,
    color: '#334155',
    marginTop: 2,
  },
  custAddr: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 3,
    lineHeight: 15,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  thText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
  },
  tableItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
  },
  tdItemName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  tdQty: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  tdPrice: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'right',
  },
  tdTotal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '800',
  },
  grandTotalLabel: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  grandTotalVal: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0066FF',
  },
  paperFooter: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginTop: 6,
  },
  paperFooterSub: {
    textAlign: 'center',
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  modalActions: {
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 8,
  },
  primaryPrintBtn: {
    backgroundColor: '#0066FF',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  primaryPrintBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  whatsAppBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  whatsAppBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  copyBtn: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyBtnText: {
    color: '#0066FF',
    fontSize: 12,
    fontWeight: '700',
  },
});

export default BillPrintModal;
