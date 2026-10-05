import React, { useState, useEffect, useRef } from 'react';
import { Product, Variation, CartItem, PaymentItem, Sale, StoreSettings } from '../types';
import { apiRequest, formatBRL } from '../services/api';
import { Receipt } from './Receipt';
import {
  Search,
  Barcode,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  DollarSign,
  QrCode,
  CreditCard,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Printer,
  X,
  Sparkles,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';

interface POSProps {
  settings: StoreSettings | null;
  onOpenCash: () => void;
  isCashOpen: boolean;
}

export const POS: React.FC<POSProps> = ({ settings, onOpenCash, isCashOpen }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountType, setDiscountType] = useState<'reais' | 'percent'>('reais');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // Selected item variation picker modal
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('');

  // Checkout modal
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [payments, setPayments] = useState<PaymentItem[]>([
    { method: 'pix', amount_cents: 0 }
  ]);
  const [cashTenderedCents, setCashTenderedCents] = useState<number>(0);

  // Submission & Error handling
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Completed sale for receipt view
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);

  // Search input ref for quick keyboard focusing
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto focus search input on POS view load
  useEffect(() => {
    searchInputRef.current?.focus();
    fetchCatalog();
  }, []);

  const fetchCatalog = async (query = '') => {
    setIsSearching(true);
    try {
      const res = await apiRequest<Product[]>(`/sales/pos/search?q=${encodeURIComponent(query)}`);
      setSearchResults(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    fetchCatalog(val);
  };

  // Keyboard barcode scanner handler: if enter is pressed and exact barcode match found
  const handleKeyDownSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchResults.length > 0) {
      // Check if single product or exact match
      const p = searchResults[0];
      handleProductSelect(p);
    }
  };

  const handleProductSelect = (product: Product) => {
    setSelectedProduct(product);
    // Find first available variation
    const firstAvailable = product.variations.find((v) => v.stock > 0);
    if (firstAvailable) {
      setSelectedSize(firstAvailable.size);
      setSelectedColor(firstAvailable.color);
    } else if (product.variations.length > 0) {
      setSelectedSize(product.variations[0].size);
      setSelectedColor(product.variations[0].color);
    }
  };

  const addVariationToCart = () => {
    if (!selectedProduct || !selectedSize || !selectedColor) return;

    const variation = selectedProduct.variations.find(
      (v) => v.size === selectedSize && v.color === selectedColor
    );

    if (!variation) {
      setErrorMessage('Variação não encontrada.');
      return;
    }

    if (variation.stock <= 0) {
      setErrorMessage(`A peça "${selectedProduct.name} (${selectedSize} / ${selectedColor})" está com estoque esgotado.`);
      return;
    }

    // Check existing in cart
    const existingIndex = cart.findIndex((i) => i.variation_id === variation.id);
    const effectivePrice = selectedProduct.promo_price_cents || selectedProduct.sale_price_cents;

    if (existingIndex >= 0) {
      const existing = cart[existingIndex];
      if (existing.quantity + 1 > variation.stock) {
        setErrorMessage(
          `Limite de estoque atingido! Há apenas ${variation.stock} unidade(s) disponível(is).`
        );
        return;
      }
      const updated = [...cart];
      updated[existingIndex].quantity += 1;
      setCart(updated);
    } else {
      const newItem: CartItem = {
        variation_id: variation.id,
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        reference: selectedProduct.reference,
        size: variation.size,
        color: variation.color,
        unit_price_cents: effectivePrice,
        quantity: 1,
        available_stock: variation.stock,
      };
      setCart([...cart, newItem]);
    }

    // Close variation picker
    setSelectedProduct(null);
    setErrorMessage(null);
    searchInputRef.current?.focus();
  };

  const updateCartQty = (idx: number, delta: number) => {
    const item = cart[idx];
    const newQty = item.quantity + delta;

    if (newQty <= 0) {
      setCart(cart.filter((_, i) => i !== idx));
      return;
    }

    if (newQty > item.available_stock) {
      setErrorMessage(
        `Estoque máximo para "${item.product_name} (${item.size}/${item.color})": ${item.available_stock} un.`
      );
      return;
    }

    setErrorMessage(null);
    const updated = [...cart];
    updated[idx].quantity = newQty;
    setCart(updated);
  };

  const removeCartItem = (idx: number) => {
    setCart(cart.filter((_, i) => i !== idx));
  };

  // Calculations
  const subtotalCents = cart.reduce((sum, item) => sum + item.unit_price_cents * item.quantity, 0);

  let calculatedDiscountCents = 0;
  if (discountType === 'reais') {
    calculatedDiscountCents = Math.min(subtotalCents, Math.round(discountValue * 100));
  } else {
    calculatedDiscountCents = Math.min(subtotalCents, Math.round(subtotalCents * (discountValue / 100)));
  }

  const totalCents = Math.max(0, subtotalCents - calculatedDiscountCents);

  // Open Checkout
  const handleStartCheckout = () => {
    if (!isCashOpen) {
      setErrorMessage('É necessário abrir o caixa antes de realizar vendas!');
      return;
    }
    if (cart.length === 0) {
      setErrorMessage('Adicione pelo menos um item ao carrinho.');
      return;
    }

    // Default payment method: Full amount on Pix
    setPayments([{ method: 'pix', amount_cents: totalCents }]);
    setCashTenderedCents(0);
    setErrorMessage(null);
    setIsCheckoutOpen(true);
  };

  // Add split payment line
  const addSplitPaymentMethod = () => {
    const sumPaid = payments.reduce((s, p) => s + p.amount_cents, 0);
    const remaining = Math.max(0, totalCents - sumPaid);
    setPayments([...payments, { method: 'money', amount_cents: remaining }]);
  };

  const updatePaymentLine = (idx: number, field: 'method' | 'amount_cents', val: any) => {
    const updated = [...payments];
    updated[idx] = { ...updated[idx], [field]: val };
    setPayments(updated);
  };

  const removePaymentLine = (idx: number) => {
    if (payments.length <= 1) return;
    setPayments(payments.filter((_, i) => i !== idx));
  };

  // Payment sum and change calculation
  const totalPaidCents = payments.reduce((sum, p) => sum + p.amount_cents, 0);
  const moneyPaymentLine = payments.find((p) => p.method === 'money');

  // Change is only calculated if money was used and paid amount exceeds total
  const changeCents = moneyPaymentLine && totalPaidCents > totalCents
    ? totalPaidCents - totalCents
    : 0;

  // Finalize Sale
  const handleFinalizeSale = async () => {
    if (isSubmitting) return; // Prevent double click
    setErrorMessage(null);

    // Validation
    if (totalPaidCents < totalCents) {
      setErrorMessage(`O valor pago (${formatBRL(totalPaidCents)}) é menor que o total (${formatBRL(totalCents)}).`);
      return;
    }

    if (totalPaidCents > totalCents && !moneyPaymentLine) {
      setErrorMessage('Pagamentos sem dinheiro em espécie não aceitam valor excedente ou troco.');
      return;
    }

    setIsSubmitting(true);

    // Generate unique idempotency key for this checkout attempt
    const idempotencyKey = `sale-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const payload = {
        items: cart.map((i) => ({
          variation_id: i.variation_id,
          quantity: i.quantity,
        })),
        payments: payments.map((p) => ({
          method: p.method,
          amount_cents: p.amount_cents,
        })),
        discount_cents: calculatedDiscountCents,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        idempotency_key: idempotencyKey,
      };

      const res = await apiRequest<{ message: string; sale: Sale; duplicate?: boolean }>(
        '/sales/checkout',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      // Sale succeeded! Fetch full sale details for non-fiscal receipt
      const targetSaleId = (res.sale as any).saleId || res.sale.id;
      const saleDetails = await apiRequest<Sale>(`/sales/${targetSaleId}`);
      setCompletedSale(saleDetails);

      // Clear cart
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setDiscountValue(0);
      setIsCheckoutOpen(false);

      // Refresh product list to reflect decremented stock
      fetchCatalog(searchTerm);
    } catch (err: any) {
      // PRESERVE CART ON FAILURE AS REQUIRED!
      setErrorMessage(err.message || 'Erro ao finalizar a venda. O carrinho foi preservado.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Cash Register Closed Warning Banner */}
      {!isCashOpen && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-amber-900">Caixa Fechado no Momento</h4>
              <p className="text-xs text-amber-700">
                Para registrar vendas no balcão, é necessário realizar a abertura do caixa com o fundo inicial.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenCash}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer shrink-0"
          >
            Abrir Caixa Agora
          </button>
        </div>
      )}

      {/* Main PDV Layout: Left Side Search & Catalog Grid | Right Side Cart & Checkout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Fast Product Search & Grid (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Barcode & Search Input */}
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center gap-2 text-gray-400">
              <Search className="w-4 h-4" />
              <Barcode className="w-4 h-4 text-rose-500" />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleKeyDownSearch}
              placeholder="Escanear leitor de código de barras ou buscar por nome, SKU, referência..."
              className="w-full pl-16 pr-4 py-3 bg-white text-sm rounded-2xl border border-gray-200 focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 shadow-2xs font-medium transition-all"
            />
            {isSearching && (
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-rose-600 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Catalog Quick Grid */}
          <div className="bg-white rounded-3xl border border-gray-200 p-4 shadow-2xs flex-1 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3 text-xs text-gray-500">
              <span className="font-semibold uppercase tracking-wider text-gray-700">
                Peças da Loja ({searchResults.length})
              </span>
              <span>Clique para selecionar tamanho/cor</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto max-h-[620px] p-1">
              {searchResults.map((prod) => {
                const totalStock = prod.variations.reduce((sum, v) => sum + v.stock, 0);
                const hasStock = totalStock > 0;
                const effectivePrice = prod.promo_price_cents || prod.sale_price_cents;

                return (
                  <div
                    key={prod.id}
                    onClick={() => handleProductSelect(prod)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      hasStock
                        ? 'border-gray-200 hover:border-rose-400 hover:shadow-xs bg-white'
                        : 'border-gray-200 bg-gray-50/70 opacity-60'
                    }`}
                  >
                    <div>
                      <div className="aspect-square rounded-xl overflow-hidden bg-rose-50/50 mb-2 relative">
                        {prod.images && prod.images[0] ? (
                          <img
                            src={prod.images[0]}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-rose-300 font-serif text-lg font-bold">
                            LORY
                          </div>
                        )}
                        <span
                          className={`absolute top-1.5 right-1.5 px-1.5 py-0.5 text-[9px] font-bold rounded-md ${
                            hasStock
                              ? totalStock <= 3
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-emerald-100 text-emerald-900'
                              : 'bg-red-100 text-red-900'
                          }`}
                        >
                          {hasStock ? `${totalStock} un.` : 'Esgotado'}
                        </span>
                      </div>

                      <h4 className="text-xs font-bold text-gray-900 line-clamp-1">
                        {prod.name}
                      </h4>
                      {prod.reference && (
                        <p className="text-[10px] text-gray-400 font-mono">Ref: {prod.reference}</p>
                      )}
                    </div>

                    <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-950 font-serif">
                        {formatBRL(effectivePrice)}
                      </span>
                      <span className="text-[10px] text-rose-600 font-semibold bg-rose-50 px-1.5 py-0.5 rounded">
                        +{prod.variations.length} var.
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: POS Cart & Checkout Panel (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-2xs flex-1 flex flex-col justify-between">
            <div>
              {/* Cart Header */}
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-rose-600" />
                  <h3 className="font-bold text-gray-900 text-sm">Venda Balcão Atual</h3>
                </div>
                {cart.length > 0 && (
                  <button
                    onClick={() => setCart([])}
                    className="text-xs text-red-600 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Limpar
                  </button>
                )}
              </div>

              {/* Optional Customer */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Cliente (opcional)"
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-gray-200 focus:outline-hidden focus:border-rose-400"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Telefone/WhatsApp"
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-gray-200 focus:outline-hidden focus:border-rose-400"
                  />
                </div>
              </div>

              {/* Error Notification */}
              {errorMessage && (
                <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <span className="flex-1 leading-snug">{errorMessage}</span>
                  <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-red-700">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Cart Items List */}
              <div className="space-y-2.5 overflow-y-auto max-h-[300px] pr-1">
                {cart.length === 0 ? (
                  <div className="py-12 text-center text-gray-400">
                    <ShoppingCart className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    <p className="text-xs font-medium text-gray-500">Carrinho vazio</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Selecione produtos ao lado ou escaneie o código de barras
                    </p>
                  </div>
                ) : (
                  cart.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-gray-900 truncate">{item.product_name}</h4>
                        <div className="flex items-center gap-2 text-gray-500 text-[11px] mt-0.5">
                          <span className="bg-white px-1.5 py-0.5 rounded border border-gray-200 font-semibold text-gray-700">
                            {item.size}
                          </span>
                          <span>{item.color}</span>
                          <span className="text-gray-400">• Disp: {item.available_stock}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Stepper */}
                        <div className="flex items-center bg-white rounded-lg border border-gray-200">
                          <button
                            onClick={() => updateCartQty(idx, -1)}
                            className="p-1 text-gray-600 hover:text-rose-600 cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-2 font-bold text-xs">{item.quantity}</span>
                          <button
                            onClick={() => updateCartQty(idx, 1)}
                            className="p-1 text-gray-600 hover:text-rose-600 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Price */}
                        <span className="font-bold text-gray-900 w-16 text-right font-serif">
                          {formatBRL(item.unit_price_cents * item.quantity)}
                        </span>

                        {/* Remove */}
                        <button
                          onClick={() => removeCartItem(idx)}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Cart Footer: Subtotal, Discount & Final Total */}
            <div className="pt-4 border-t border-gray-100 space-y-3">
              {/* Discount Selector */}
              <div className="flex items-center justify-between text-xs text-gray-600">
                <span>Subtotal:</span>
                <span className="font-semibold text-gray-900">{formatBRL(subtotalCents)}</span>
              </div>

              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-gray-600">Desconto:</span>
                <div className="flex items-center gap-1">
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as any)}
                    className="px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                  >
                    <option value="reais">R$</option>
                    <option value="percent">%</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountValue || ''}
                    onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                    placeholder="0,00"
                    className="w-20 px-2 py-1 text-right text-xs rounded-lg border border-gray-200"
                  />
                  {calculatedDiscountCents > 0 && (
                    <span className="text-emerald-700 font-semibold text-xs">
                      (-{formatBRL(calculatedDiscountCents)})
                    </span>
                  )}
                </div>
              </div>

              {/* Total Display */}
              <div className="p-3 bg-gradient-to-r from-rose-50 to-amber-50 rounded-2xl border border-rose-200/60 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider block">
                    Total a Cobrar
                  </span>
                  <span className="text-xs text-gray-500">{cart.length} item(ns)</span>
                </div>
                <span className="text-2xl font-serif font-black text-gray-950">
                  {formatBRL(totalCents)}
                </span>
              </div>

              {/* Primary Action Button */}
              <button
                onClick={handleStartCheckout}
                disabled={cart.length === 0 || !isCashOpen}
                className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-bold rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Cobrar / Forma de Pagamento</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Variation Picker Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-rose-100 animate-in fade-in zoom-in-95 duration-200 p-6">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
              <div>
                <h3 className="font-bold text-gray-900 text-base">{selectedProduct.name}</h3>
                {selectedProduct.reference && (
                  <p className="text-xs text-gray-400 font-mono">Ref: {selectedProduct.reference}</p>
                )}
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Select Size */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-700 mb-2">Selecione o Tamanho:</label>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set(selectedProduct.variations.map((v) => v.size))).map((size) => (
                  <button
                    key={size}
                    onClick={() => setSelectedSize(size)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      selectedSize === size
                        ? 'bg-rose-600 border-rose-600 text-white shadow-xs'
                        : 'bg-white border-gray-300 text-gray-800 hover:border-rose-400'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Select Color */}
            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-700 mb-2">Selecione a Cor:</label>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set(selectedProduct.variations.map((v) => v.color))).map((color) => {
                  const matching = selectedProduct.variations.find(
                    (v) => v.size === selectedSize && v.color === color
                  );
                  const stock = matching ? matching.stock : 0;

                  return (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        selectedColor === color
                          ? 'bg-rose-600 border-rose-600 text-white shadow-xs'
                          : stock > 0
                          ? 'bg-white border-gray-300 text-gray-800 hover:border-rose-400'
                          : 'bg-gray-100 border-gray-200 text-gray-400 line-through'
                      }`}
                    >
                      {color} ({stock} em estoque)
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setSelectedProduct(null)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={addVariationToCart}
                disabled={!selectedSize || !selectedColor}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Adicionar ao Carrinho
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checkout & Split Payment Modal */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-rose-100 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-rose-50 via-amber-50 to-rose-50 border-b border-rose-100 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider block">
                  Finalização de Venda PDV
                </span>
                <h3 className="text-xl font-serif font-black text-gray-900">
                  {formatBRL(totalCents)}
                </h3>
              </div>
              <button
                onClick={() => setIsCheckoutOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Notice that payment registration is manual */}
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900 leading-snug">
                ℹ️ <strong>Registro manual:</strong> Selecionar Pix ou cartão registra a forma acordada com o cliente no balcão e não aciona transação de maquininha integrada.
              </div>

              {/* Payment Methods Breakdown */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-700">Formas de Pagamento:</label>
                  <button
                    onClick={addSplitPaymentMethod}
                    className="text-xs font-semibold text-rose-600 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Dividir Pagamento
                  </button>
                </div>

                {payments.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-gray-50 p-2.5 rounded-2xl border border-gray-200">
                    <select
                      value={p.method}
                      onChange={(e) => updatePaymentLine(idx, 'method', e.target.value)}
                      className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-800"
                    >
                      <option value="pix">Pix</option>
                      <option value="money">Dinheiro</option>
                      <option value="debit">Débito</option>
                      <option value="credit">Crédito</option>
                    </select>

                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">R$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={(p.amount_cents / 100).toFixed(2)}
                        onChange={(e) => {
                          const val = Math.round(parseFloat(e.target.value || '0') * 100);
                          updatePaymentLine(idx, 'amount_cents', val);
                        }}
                        className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 text-right"
                      />
                    </div>

                    {payments.length > 1 && (
                      <button
                        onClick={() => removePaymentLine(idx)}
                        className="p-1 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Change calculation (only for money) */}
              {changeCents > 0 && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-emerald-900">
                  <span className="text-xs font-bold">Troco a Devolver (Dinheiro):</span>
                  <span className="text-base font-serif font-black">{formatBRL(changeCents)}</span>
                </div>
              )}

              {/* Totals Summary */}
              <div className="p-3 bg-gray-50 rounded-2xl text-xs space-y-1">
                <div className="flex justify-between text-gray-500">
                  <span>Total da Venda:</span>
                  <span className="font-semibold text-gray-900">{formatBRL(totalCents)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Total Informado:</span>
                  <span className="font-semibold text-gray-900">{formatBRL(totalPaidCents)}</span>
                </div>
                {totalPaidCents < totalCents && (
                  <div className="flex justify-between text-red-600 font-bold pt-1 border-t border-gray-200">
                    <span>Falta Pagar:</span>
                    <span>{formatBRL(totalCents - totalPaidCents)}</span>
                  </div>
                )}
              </div>

              {/* Action */}
              <button
                onClick={handleFinalizeSale}
                disabled={isSubmitting || totalPaidCents < totalCents}
                className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-bold rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Processando e Baixando Estoque...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Concluir Venda e Emitir Comprovante</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Non-Fiscal Receipt Modal upon sale completion */}
      {completedSale && (
        <Receipt
          sale={completedSale}
          settings={settings}
          onClose={() => setCompletedSale(null)}
        />
      )}
    </div>
  );
};
