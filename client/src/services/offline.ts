/**
 * Lory Boutique offline PDV storage. Only authenticated device data.
 * Offline sales are provisional until the server accepts the exact same
 * idempotency key. Never store passwords or payment credentials here.
 */
import type { Product, Category, CartItem, PaymentItem } from "../types";
import { apiRequest } from "./api";

const DB_NAME = "lory-pdv-offline-v1";
const STORE = "records";
const VERSION = 1;
const catalogKey = (userId: string) => `catalog:${userId}`;
const categoriesKey = (userId: string) => `categories:${userId}`;
const queueKey = (userId: string) => `pending:${userId}`;

export type CheckoutPayload = {
  items: { variation_id: string; quantity: number }[];
  payments: PaymentItem[];
  discount_cents: number;
  customer_name: string | null;
  customer_phone: string | null;
  idempotency_key: string;
};
export type QueuedSale = {
  id: string;
  userId: string;
  createdAt: string;
  payload: CheckoutPayload;
  items: CartItem[];
  totalCents: number;
  status: "pending" | "conflict";
  error?: string;
};

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("Armazenamento offline não disponível neste aparelho."));
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function read<T>(key: string): Promise<T | undefined> {
  const connection = await db();
  return new Promise((resolve, reject) => {
    const transaction = connection.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => connection.close();
  });
}
async function write<T>(key: string, value: T): Promise<void> {
  const connection = await db();
  return new Promise((resolve, reject) => {
    const transaction = connection.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(value, key);
    transaction.oncomplete = () => { connection.close(); resolve(); };
    transaction.onerror = () => { connection.close(); reject(transaction.error); };
  });
}
export async function saveOfflineCatalog(userId: string, products: Product[], categories: Category[]) {
  await write(catalogKey(userId), products);
  await write(categoriesKey(userId), categories);
}
export async function readOfflineCatalog(userId: string) {
  const [products, categories] = await Promise.all([
    read<Product[]>(catalogKey(userId)),
    read<Category[]>(categoriesKey(userId)),
  ]);
  return { products: products || [], categories: categories || [] };
}
export async function readQueuedSales(userId: string): Promise<QueuedSale[]> {
  return (await read<QueuedSale[]>(queueKey(userId))) || [];
}
export async function queueOfflineSale(sale: QueuedSale): Promise<void> {
  const queued = await readQueuedSales(sale.userId);
  if (queued.some(x => x.id === sale.id)) return;
  await write(queueKey(sale.userId), [...queued, sale]);
}
export function applyReservations(products: Product[], queue: QueuedSale[]): Product[] {
  const reserved = new Map<string, number>();
  for (const sale of queue) for (const item of sale.payload.items) {
    reserved.set(item.variation_id, (reserved.get(item.variation_id) || 0) + item.quantity);
  }
  return products.map(product => ({
    ...product,
    variations: product.variations.map(variation => ({
      ...variation,
      stock: Math.max(0, variation.stock - (reserved.get(variation.id) || 0)),
    })),
  }));
}
export async function syncOfflineSales(userId: string): Promise<{ synced: number; remaining: number; conflict?: string }> {
  const sales = await readQueuedSales(userId);
  let synced = 0;
  for (const sale of sales) {
    if (sale.status === "conflict") continue;
    try {
      await apiRequest("/sales/checkout", { method: "POST", body: JSON.stringify(sale.payload) });
      const remaining = (await readQueuedSales(userId)).filter(x => x.id !== sale.id);
      await write(queueKey(userId), remaining);
      synced += 1;
    } catch (error) {
      const failure = error as Error & { status?: number };
      // 4xx: operation rejected (e.g. changed stock/closed register);
      // do not silently discard paid orders or retry an invalid request.
      if (failure.status && failure.status >= 400 && failure.status < 500) {
        const current = await readQueuedSales(userId);
        const conflict = current.map(x => x.id === sale.id ? {
          ...x, status: "conflict" as const, error: failure.message,
        } : x);
        await write(queueKey(userId), conflict);
        return { synced, remaining: conflict.length, conflict: failure.message };
      }
      break; // offline or transient server error; retain identical request.
    }
  }
  return { synced, remaining: (await readQueuedSales(userId)).length };
}
