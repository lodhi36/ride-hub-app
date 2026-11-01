import { Linking, Alert } from 'react-native';

export interface ReceiptItem {
  id?: string;
  name: string;
  quantity: number;
  price: number;
  isVeg?: boolean;
}

export interface StoreInfo {
  name?: string;
  address?: string;
  phone?: string;
  gstin?: string;
  category?: string;
}

export const parseBillOrderItems = (cartItems: any, fallbackTotal?: number): ReceiptItem[] => {
  if (!cartItems) return [];
  let itemsList: ReceiptItem[] = [];

  if (Array.isArray(cartItems)) {
    itemsList = cartItems.map((it: any, index: number) => ({
      id: it.id || it.itemId || `item_${index}`,
      name: it.name || it.dishName || it.title || it.productName || 'Order Item',
      quantity: Number(it.quantity) || 1,
      price: Number(it.price) || 0,
      isVeg: it.isVeg !== false,
    }));
  } else if (typeof cartItems === 'object') {
    itemsList = Object.entries(cartItems).map(([key, val]: [string, any]) => {
      if (typeof val === 'number') {
        return {
          id: key,
          name: 'Order Item',
          quantity: val,
          price: 0,
        };
      }
      return {
        id: key,
        name: val?.name || val?.dishName || val?.title || val?.productName || 'Order Item',
        quantity: Number(val?.quantity) || 1,
        price: Number(val?.price) || 0,
        isVeg: val?.isVeg !== false,
      };
    });
  }

  const totalItemsSum = itemsList.reduce(
    (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1),
    0
  );

  if (totalItemsSum === 0 && fallbackTotal && fallbackTotal > 0 && itemsList.length > 0) {
    const totalQty = itemsList.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0) || 1;
    const perItemPrice = Math.round(fallbackTotal / totalQty);
    itemsList = itemsList.map((it) => ({
      ...it,
      price: it.price > 0 ? it.price : perItemPrice,
    }));
  }

  return itemsList;
};

export const getBillOrderTotal = (order: any): number => {
  if (!order) return 0;
  const sub = Number(order.subtotal);
  if (!isNaN(sub) && sub > 0) return sub;

  const items = parseBillOrderItems(order.cartItems || order.items);
  const itemsTotal = items.reduce(
    (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1),
    0
  );
  if (itemsTotal > 0) return itemsTotal;

  const deliveryFee = Number(order.deliveryFee) || 0;
  const price = Number(order.price) || Number(order.totalAmount) || 0;
  return Math.max(0, price - deliveryFee);
};

export const formatBillDateTime = (dateVal?: any): string => {
  const d = dateVal ? new Date(dateVal) : new Date();
  if (isNaN(d.getTime())) return new Date().toLocaleString('en-IN');
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

/**
 * Generate standard HTML suitable for 58mm / 80mm POS Thermal Receipt Printing & WebView
 */
export const generateReceiptHtml = (order: any, store?: StoreInfo): string => {
  const storeName = store?.name || order?.restaurantName || 'RIDEHUB STORE PARTNER';
  const storeAddr = store?.address || order?.restaurantAddress || 'Authorized Partner Outlet';
  const storePhone = store?.phone || order?.restaurantPhone || '';

  const orderId = String(order?.bookingId || order?.rideId || order?._id || order?.id || '').slice(-6).toUpperCase() || 'ORDER';
  const fullOrderId = String(order?.bookingId || order?.rideId || order?._id || order?.id || 'ORDER');
  const dateTime = formatBillDateTime(order?.createdAt || order?.orderDate);
  const customerName = order?.customerName || order?.userName || 'Customer';
  const customerPhone = order?.customerPhone || order?.userPhone || '';
  const customerAddress = order?.destinationAddress || order?.serviceAddress || order?.deliveryAddress || 'Standard Delivery';
  const paymentMethod = (order?.paymentMethod || 'cash').toUpperCase() === 'CASH' ? 'CASH ON DELIVERY (COD)' : 'PAID ONLINE (PREPAID)';
  const orderStatus = (order?.status || 'NEW ORDER').toUpperCase().replace(/_/g, ' ');

  const totalFood = getBillOrderTotal(order);
  const items = parseBillOrderItems(order?.cartItems || order?.items, totalFood);
  const deliveryFee = Number(order?.deliveryFee) || 0;
  const grandTotal = totalFood + (order?.includeDeliveryFeeInBill ? deliveryFee : 0);

  const itemsRowsHtml = items.map((it, idx) => {
    const itemTotal = (Number(it.price) || 0) * (Number(it.quantity) || 1);
    return `
      <tr>
        <td style="padding: 4px 0; font-weight: 600; font-size: 13px;">${idx + 1}. ${it.name}</td>
        <td style="padding: 4px 0; text-align: center; font-size: 13px;">x${it.quantity}</td>
        <td style="padding: 4px 0; text-align: right; font-size: 13px;">₹${it.price}</td>
        <td style="padding: 4px 0; text-align: right; font-weight: 700; font-size: 13px;">₹${itemTotal}</td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Receipt #${orderId}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }
    body {
      font-family: 'Courier New', Courier, monospace, -apple-system, BlinkMacSystemFont, sans-serif;
      background: #FFFFFF;
      color: #000000;
      margin: 0;
      padding: 14px;
      width: 100%;
      max-width: 380px;
      box-sizing: border-box;
      font-size: 12px;
      line-height: 1.35;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: bold; }
    .store-title { font-size: 17px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; }
    .divider-dash { border-top: 1px dashed #000000; margin: 8px 0; }
    .divider-double { border-top: 2px solid #000000; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; }
    th { border-bottom: 1px dashed #000000; padding: 4px 0; font-size: 12px; text-transform: uppercase; }
    .total-box { font-size: 16px; font-weight: 900; }
    .badge {
      display: inline-block;
      border: 1.5px solid #000000;
      padding: 3px 8px;
      border-radius: 4px;
      font-weight: 800;
      font-size: 12px;
      margin: 4px 0;
    }
    @media print {
      body { width: 100% !important; padding: 4px !important; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="text-center">
    <div class="store-title">${storeName}</div>
    <div style="font-size: 11px; margin-top: 2px;">${storeAddr}</div>
    ${storePhone ? `<div style="font-size: 11px;">Tel: ${storePhone}</div>` : ''}
    <div class="badge">KITCHEN / TAX INVOICE</div>
  </div>

  <div class="divider-dash"></div>

  <table style="font-size: 12px;">
    <tr>
      <td class="bold">ORDER ID:</td>
      <td class="text-right bold">#${orderId}</td>
    </tr>
    <tr>
      <td>Ref:</td>
      <td class="text-right" style="font-size: 10px;">${fullOrderId.slice(-12)}</td>
    </tr>
    <tr>
      <td>Date & Time:</td>
      <td class="text-right">${dateTime}</td>
    </tr>
    <tr>
      <td>Status:</td>
      <td class="text-right bold">${orderStatus}</td>
    </tr>
    <tr>
      <td>Payment:</td>
      <td class="text-right bold">${paymentMethod}</td>
    </tr>
  </table>

  <div class="divider-dash"></div>

  <div>
    <div class="bold" style="font-size: 12px; text-transform: uppercase;">Customer Details:</div>
    <div style="font-weight: 700; font-size: 13px;">${customerName}</div>
    ${customerPhone ? `<div style="font-size: 12px;">📞 ${customerPhone}</div>` : ''}
    <div style="font-size: 11px; margin-top: 2px;">📍 ${customerAddress}</div>
  </div>

  <div class="divider-dash"></div>

  <table>
    <thead>
      <tr>
        <th style="text-align: left;">Item</th>
        <th style="text-align: center;">Qty</th>
        <th style="text-align: right;">Rate</th>
        <th style="text-align: right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRowsHtml || '<tr><td colspan="4" class="text-center">1x Food Order Package</td></tr>'}
    </tbody>
  </table>

  <div class="divider-dash"></div>

  <table>
    <tr>
      <td class="bold">Items Subtotal:</td>
      <td class="text-right bold">₹${totalFood}</td>
    </tr>
    ${deliveryFee > 0 ? `
    <tr>
      <td>Delivery / Packing:</td>
      <td class="text-right">₹${deliveryFee}</td>
    </tr>` : ''}
    <tr>
      <td class="total-box">NET GRAND TOTAL:</td>
      <td class="text-right total-box">₹${grandTotal}</td>
    </tr>
  </table>

  <div class="divider-double"></div>

  <div class="text-center" style="font-size: 11px; margin-top: 8px;">
    <div>*** THANK YOU FOR ORDERING ***</div>
    <div style="margin-top: 2px; font-size: 10px;">Printed via RideHub Partner POS System</div>
  </div>
</body>
</html>`;
};

/**
 * Generate ESC/POS Formatted Plaintext Receipt
 */
export const generateEscPosText = (order: any, store?: StoreInfo): string => {
  const storeName = store?.name || order?.restaurantName || 'RIDEHUB STORE PARTNER';
  const orderId = String(order?.bookingId || order?.rideId || order?._id || order?.id || '000000').slice(-6).toUpperCase();
  const dateTime = formatBillDateTime(order?.createdAt || order?.orderDate);
  const customerName = order?.customerName || order?.userName || 'Customer';
  const customerPhone = order?.customerPhone || order?.userPhone || '';
  const customerAddress = order?.destinationAddress || order?.serviceAddress || 'Customer Address';
  const paymentMethod = (order?.paymentMethod || 'cash').toUpperCase() === 'CASH' ? 'CASH ON DELIVERY (COD)' : 'PAID ONLINE';

  const totalFood = getBillOrderTotal(order);
  const items = parseBillOrderItems(order?.cartItems || order?.items, totalFood);

  let text = `================================\n`;
  text += `      ${storeName.toUpperCase()}\n`;
  text += `   * KITCHEN / BILL RECEIPT *\n`;
  text += `================================\n`;
  text += `Order ID : #${orderId}\n`;
  text += `Date/Time: ${dateTime}\n`;
  text += `Payment  : ${paymentMethod}\n`;
  text += `Customer : ${customerName} ${customerPhone ? `(${customerPhone})` : ''}\n`;
  text += `Address  : ${customerAddress}\n`;
  text += `--------------------------------\n`;
  text += `ITEM                QTY    PRICE\n`;
  text += `--------------------------------\n`;

  items.forEach((it) => {
    const itemTotal = (Number(it.price) || 0) * (Number(it.quantity) || 1);
    const itemName = it.name.length > 18 ? it.name.substring(0, 16) + '..' : it.name.padEnd(18, ' ');
    const qtyStr = `x${it.quantity}`.padEnd(5, ' ');
    const priceStr = `₹${itemTotal}`.padStart(7, ' ');
    text += `${itemName} ${qtyStr} ${priceStr}\n`;
  });

  text += `--------------------------------\n`;
  text += `SUBTOTAL        : ₹${totalFood}\n`;
  text += `GRAND TOTAL     : ₹${totalFood}\n`;
  text += `================================\n`;
  text += `    THANK YOU FOR YOUR ORDER    \n`;
  text += `    RideHub POS Live Receipt    \n\n\n`;

  return text;
};

/**
 * Share receipt directly via WhatsApp
 */
export const shareReceiptViaWhatsApp = (order: any, store?: StoreInfo) => {
  try {
    const rawText = generateEscPosText(order, store);
    const encoded = encodeURIComponent(rawText);
    const phone = (order?.customerPhone || '').replace(/[^0-9]/g, '');
    const url = phone ? `whatsapp://send?phone=${phone}&text=${encoded}` : `whatsapp://send?text=${encoded}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://wa.me/?text=${encoded}`).catch(() => {
        Alert.alert('Notice', 'Could not open WhatsApp. Bill text copied to clipboard instead.');
      });
    });
  } catch (e) {
    console.warn('[BillPrintService] WhatsApp share error:', e);
  }
};
