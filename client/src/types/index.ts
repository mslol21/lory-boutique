export interface User {
  id: string;
  name: string;
  username: string;
  role: 'admin' | 'attendant';
  active?: number;
  created_at?: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
}

export interface Variation {
  id: string;
  product_id?: string;
  size: string;
  color: string;
  sku?: string;
  barcode?: string;
  stock: number;
  min_stock: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  category_id?: string;
  category_name?: string;
  reference?: string;
  cost_price_cents?: number; // only admin
  sale_price_cents: number;
  promo_price_cents?: number | null;
  images: string[];
  is_showcase: number;
  status: 'active' | 'archived';
  variations: Variation[];
  total_stock?: number;
  has_low_stock?: boolean;
}

export interface PublicProduct {
  id: string;
  name: string;
  description: string;
  category_id?: string;
  category_name?: string;
  reference?: string;
  sale_price_cents: number;
  promo_price_cents?: number | null;
  images: string[];
  variations: {
    id: string;
    size: string;
    color: string;
    available: boolean;
    stock_units: number;
  }[];
  is_available: boolean;
}

export interface CartItem {
  variation_id: string;
  product_id: string;
  product_name: string;
  reference?: string;
  size: string;
  color: string;
  unit_price_cents: number;
  quantity: number;
  available_stock: number;
}

export interface PaymentItem {
  method: 'money' | 'pix' | 'debit' | 'credit';
  amount_cents: number;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  variation_id: string;
  product_name: string;
  product_reference?: string;
  size: string;
  color: string;
  cost_price_cents?: number;
  unit_price_cents: number;
  quantity: number;
  total_cents: number;
  returned_quantity: number;
}

export interface SalePayment {
  id: string;
  sale_id: string;
  payment_method: 'money' | 'pix' | 'debit' | 'credit';
  amount_cents: number;
}

export interface Sale {
  id: string;
  code: string;
  register_id: string;
  user_id: string;
  seller_name?: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  change_cents: number;
  status: 'completed' | 'cancelled' | 'returned_partial' | 'returned_full';
  cancellation_reason?: string | null;
  cancelled_by?: string | null;
  cancelled_at?: string | null;
  idempotency_key?: string | null;
  created_at: string;
  items?: SaleItem[];
  payments?: SalePayment[];
}

export interface CashRegister {
  id: string;
  opened_by: string;
  opener_name?: string;
  opened_at: string;
  initial_amount_cents: number;
  closed_by?: string | null;
  closer_name?: string | null;
  closed_at?: string | null;
  counted_cash_cents?: number | null;
  expected_cash_cents?: number | null;
  difference_cents?: number | null;
  notes?: string | null;
  status: 'open' | 'closed';
}

export interface CashMovement {
  id: string;
  register_id: string;
  type: 'bleed' | 'supply';
  amount_cents: number;
  reason: string;
  user_id: string;
  user_name?: string;
  created_at: string;
}

export interface StoreSettings {
  store_name: string;
  segment: string;
  address: string;
  whatsapp: string;
  whatsapp_raw: string;
  instagram: string;
  instagram_handle: string;
  operation_model: string;
  cnpj: string;
  cep: string;
  business_hours: string;
  demo_mode: boolean;
}

export interface InterestItem {
  product_id: string;
  product_name: string;
  reference?: string;
  size: string;
  color: string;
  unit_price_cents: number;
  quantity: number;
  image?: string;
}
