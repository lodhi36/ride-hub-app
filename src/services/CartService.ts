import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect } from 'react';

export interface CartItemEntry {
  item: any;
  quantity: number;
}

export interface CartState {
  restaurantId: string | null;
  restaurant: any | null;
  items: { [itemId: string]: CartItemEntry };
  subtotal: number;
  count: number;
}

type CartListener = (state: CartState) => void;

class PersistentCartService {
  private currentUserId: string = 'guest';
  private state: CartState = {
    restaurantId: null,
    restaurant: null,
    items: {},
    subtotal: 0,
    count: 0,
  };
  private listeners: Set<CartListener> = new Set();
  private isInitialized: boolean = false;

  private getStorageKey(userId?: string): string {
    const uid = userId || this.currentUserId || 'guest';
    return `@customer_cart_${uid}`;
  }

  public async init(userId?: string): Promise<CartState> {
    if (userId) {
      this.currentUserId = String(userId);
    }
    const key = this.getStorageKey();
    try {
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.state = this.recalculateTotals({
          restaurantId: parsed.restaurantId || null,
          restaurant: parsed.restaurant || null,
          items: parsed.items || {},
          subtotal: 0,
          count: 0,
        });
      } else {
        this.state = {
          restaurantId: null,
          restaurant: null,
          items: {},
          subtotal: 0,
          count: 0,
        };
      }
    } catch (e) {
      console.warn('[CartService] Failed to load cart from AsyncStorage:', e);
    }
    this.isInitialized = true;
    this.notify();
    return this.state;
  }

  public async setUserId(userId: string): Promise<void> {
    const cleanId = String(userId || 'guest');
    if (this.currentUserId !== cleanId) {
      this.currentUserId = cleanId;
      await this.init(cleanId);
    }
  }

  public getCart(): CartState {
    return { ...this.state, items: { ...this.state.items } };
  }

  public getCartCount(): number {
    return this.state.count;
  }

  public getSubtotal(): number {
    return this.state.subtotal;
  }

  public getRestaurantId(): string | null {
    return this.state.restaurantId;
  }

  public getRestaurant(): any | null {
    return this.state.restaurant;
  }

  private recalculateTotals(rawState: CartState): CartState {
    let subtotal = 0;
    let count = 0;

    const cleanItems: { [itemId: string]: CartItemEntry } = {};
    for (const [id, entry] of Object.entries(rawState.items || {})) {
      if (entry && entry.quantity > 0) {
        const qty = entry.quantity;
        const price = Number(entry.item?.price || entry.item?.cost || 0);
        subtotal += price * qty;
        count += qty;
        cleanItems[id] = {
          item: entry.item,
          quantity: qty,
        };
      }
    }

    const hasItems = Object.keys(cleanItems).length > 0;
    return {
      restaurantId: hasItems ? rawState.restaurantId : null,
      restaurant: hasItems ? rawState.restaurant : null,
      items: cleanItems,
      subtotal: Math.max(0, subtotal),
      count: Math.max(0, count),
    };
  }

  private persistTimer: any = null;

  private schedulePersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(() => {
      this.persistDirect();
    }, 100);
  }

  private async persistDirect(): Promise<void> {
    const key = this.getStorageKey();
    try {
      if (this.state.count === 0) {
        await AsyncStorage.removeItem(key);
      } else {
        await AsyncStorage.setItem(key, JSON.stringify(this.state));
      }
    } catch (e) {
      console.warn('[CartService] Failed to persist cart:', e);
    }
  }

  private notify(): void {
    const snapshot = this.getCart();
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (err) {
        console.warn('[CartService] Listener notification error:', err);
      }
    });
  }

  public subscribe(listener: CartListener): () => void {
    this.listeners.add(listener);
    // Immediately call listener with current state
    listener(this.getCart());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Adds an item to the persistent cart (0ms instant in-memory update).
   * If an item from a different restaurant is added and forceReplace is true, the cart will reset.
   * If forceReplace is false and a different restaurant is detected, returns { conflict: true }.
   */
  public addItem(
    restaurantId: string | any,
    restaurant?: any,
    item?: any,
    quantity: number = 1,
    forceReplace: boolean = false
  ): { success: boolean; conflict?: boolean; existingRestoName?: string } {
    let actualRestaurantId: string;
    let actualRestaurant: any;
    let actualItem: any;
    let actualQty = quantity;
    let actualForce = forceReplace;

    if (
      restaurantId &&
      typeof restaurantId === 'object' &&
      !restaurant &&
      !item
    ) {
      // Overloaded signature: addItem(itemObject)
      actualItem = restaurantId;
      actualRestaurantId = String(
        actualItem.restaurantId ||
        actualItem.restaurant?._id ||
        actualItem.restaurant?.id ||
        this.state.restaurantId ||
        '6ac8693de868a5421c3d7f7d'
      );
      actualRestaurant = actualItem.restaurant || this.state.restaurant || {
        _id: actualRestaurantId,
        name: actualItem.restaurantName || actualItem.brand || 'Poonam fashion',
        restaurantName: actualItem.restaurantName || actualItem.brand || 'Poonam fashion',
        categoryName: actualItem.category || 'Fashion',
        restaurant_status: 'online',
        isOnline: true,
      };
      actualQty = Number(actualItem.quantity || 1);
      actualForce = true;
    } else {
      actualRestaurantId = String(
        restaurantId ||
        this.state.restaurantId ||
        item?.restaurantId ||
        '6ac8693de868a5421c3d7f7d'
      );
      actualRestaurant = restaurant || this.state.restaurant || {
        _id: actualRestaurantId,
        name: item?.restaurantName || item?.brand || 'Poonam fashion',
        restaurantName: item?.restaurantName || item?.brand || 'Poonam fashion',
        restaurant_status: 'online',
        isOnline: true,
      };
      actualItem = item;
    }

    const rId = String(actualRestaurantId || '');
    const itemId = String(actualItem?._id || actualItem?.id || '');

    // A store is ONLY considered offline if explicitly flagged as offline/closed
    const isExplicitlyOffline = Boolean(
      actualRestaurant && (
        actualRestaurant.restaurant_status === 'offline' ||
        actualRestaurant.isOnline === false ||
        actualRestaurant.status === 'offline' ||
        actualRestaurant.is_closed === true
      )
    );

    if (!rId || !itemId || actualQty <= 0 || isExplicitlyOffline) {
      return { success: false };
    }

    // Check restaurant conflict
    if (this.state.restaurantId && this.state.restaurantId !== rId && this.state.count > 0) {
      if (!actualForce) {
        return {
          success: false,
          conflict: true,
          existingRestoName: this.state.restaurant?.name || 'another restaurant',
        };
      }
      // Force replace
      this.state = {
        restaurantId: rId,
        restaurant: actualRestaurant || null,
        items: {},
        subtotal: 0,
        count: 0,
      };
    }

    const currentEntry = this.state.items[itemId];
    const newQuantity = (currentEntry?.quantity || 0) + actualQty;

    const newItems = {
      ...this.state.items,
      [itemId]: {
        item: actualItem || currentEntry?.item,
        quantity: newQuantity,
      },
    };

    this.state = this.recalculateTotals({
      restaurantId: rId,
      restaurant: actualRestaurant || this.state.restaurant,
      items: newItems,
      subtotal: 0,
      count: 0,
    });

    this.notify();
    this.schedulePersist();
    return { success: true };
  }

  /**
   * Updates item quantity by delta (+1 or -1) instantly in memory.
   */
  public updateQuantity(itemId: string, delta: number): void {
    const sId = String(itemId);
    const entry = this.state.items[sId];
    if (!entry) return;

    const newQty = entry.quantity + delta;
    const newItems = { ...this.state.items };

    if (newQty <= 0) {
      delete newItems[sId];
    } else {
      newItems[sId] = {
        ...entry,
        quantity: newQty,
      };
    }

    this.state = this.recalculateTotals({
      restaurantId: this.state.restaurantId,
      restaurant: this.state.restaurant,
      items: newItems,
      subtotal: 0,
      count: 0,
    });

    this.notify();
    this.schedulePersist();
  }

  /**
   * Alias for updateQuantity so callers invoking updateItemQuantity never throw.
   */
  public updateItemQuantity(itemId: string, delta: number): void {
    this.updateQuantity(itemId, delta);
  }

  /**
   * Immediately removes an item from the cart.
   */
  public removeItem(itemId: string): void {
    const sId = String(itemId);
    if (!this.state.items[sId]) return;

    const newItems = { ...this.state.items };
    delete newItems[sId];

    this.state = this.recalculateTotals({
      restaurantId: this.state.restaurantId,
      restaurant: this.state.restaurant,
      items: newItems,
      subtotal: 0,
      count: 0,
    });

    this.notify();
    this.schedulePersist();
  }

  /**
   * Clears the cart completely (e.g. after order placement or order cancellation).
   */
  public async clearCart(): Promise<void> {
    this.state = {
      restaurantId: null,
      restaurant: null,
      items: {},
      subtotal: 0,
      count: 0,
    };
    this.notify();
    try {
      const key = this.getStorageKey();
      await AsyncStorage.removeItem(key);
      await AsyncStorage.removeItem('@customer_cart_guest');
      await AsyncStorage.removeItem('@customer_cart_undefined');
      if (this.currentUserId) {
        await AsyncStorage.removeItem(`@customer_cart_${this.currentUserId}`);
      }
    } catch (e) {}
  }
}

export const CartService = new PersistentCartService();

// Initialize immediately in background
CartService.init().catch(() => {});

/**
 * Custom React Hook to subscribe to persistent cart updates.
 */
export const useCart = () => {
  const [cartState, setCartState] = useState<CartState>(CartService.getCart());

  useEffect(() => {
    const unsubscribe = CartService.subscribe((state) => {
      setCartState(state);
    });
    return unsubscribe;
  }, []);

  return {
    cartState,
    cartItems: cartState.items,
    cartItemCount: cartState.count,
    cartSubtotal: cartState.subtotal,
    restaurantId: cartState.restaurantId,
    restaurant: cartState.restaurant,
    addItem: (rId: string, resto: any, item: any, qty?: number, force?: boolean) =>
      CartService.addItem(rId, resto, item, qty, force),
    updateQuantity: (itemId: string, delta: number) => CartService.updateQuantity(itemId, delta),
    updateItemQuantity: (itemId: string, delta: number) => CartService.updateQuantity(itemId, delta),
    removeItem: (itemId: string) => CartService.removeItem(itemId),
    clearCart: () => CartService.clearCart(),
  };
};

export default CartService;
