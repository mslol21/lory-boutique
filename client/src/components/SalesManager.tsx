import React, { useState, useEffect } from 'react';
import { Sale, SaleItem, StoreSettings, User, Product } from '../types';
import { apiRequest, formatBRL, formatDateBR } from '../services/api';
import { Receipt } from './Receipt';
import {
  Search,
  Filter,
  Printer,
  RotateCcw,
  Ban,
  Eye,
  CheckCircle2,
  X,
  AlertCircle,
  ArrowRightLeft,
  Calendar,
  CreditCard,
  UserCheck
} from 'lucide-react';

interface SalesManagerProps {
  currentUser: User | null;
  settings: StoreSettings | null;
}

export const SalesManager: React.FC<SalesManagerProps> = ({ currentUser, settings }) => {
  const isAdmin = currentUser?.role === 'admin';
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [selectedSaleForReceipt, setSelectedSaleForReceipt] = useState<Sale | null>(null);
  const [selectedSaleForCancel, setSelectedSaleForCancel] = useState<Sale | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Return / Exchange Modal
  const [selectedSaleForExchange, setSelectedSaleForExchange] = useState<Sale | null>(null);
  const [exchangeMode, setExchangeMode] = useState<'return' | 'exchange'>('return');
  const [returnItemsState, setReturnItemsState] = useState<
    { sale_item_id: string; quantity: number; maxQty: number; restock: boolean; name: string }[]
  >([]);
  const [exchangeReason, setExchangeReason] = useState('Cliente solicitou troca de peça');

  // New items for exchange
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [newExchangeItems, setNewExchangeItems] = useState<
    { variation_id: string; quantity: number; name: string; price_cents: number }[]
  >([]);

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchSales = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (paymentFilter) params.append('payment_method', paymentFilter);
      if (statusFilter) params.append('status', statusFilter);

      const res = await apiRequest<Sale[]>(`/sales?${params.toString()}`);
      setSales(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, [startDate, endDate, paymentFilter, statusFilter]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3500);
  };

  // Open Cancel Modal
  const handleStartCancel = (sale: Sale) => {
    if (!isAdmin) {
      showToast('error', 'Apenas administradores podem cancelar vendas.');
      return;
    }
    setSelectedSaleForCancel(sale);
    setCancelReason('');
  };

  // Submit Cancel
  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSaleForCancel) return;

    try {
      await apiRequest(`/sales/${selectedSaleForCancel.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason })
      });
      showToast('success', 'Venda cancelada e peças retornadas ao estoque com sucesso!');
      setSelectedSaleForCancel(null);
      fetchSales();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // Open Return / Exchange Modal
  const handleStartReturnExchange = async (sale: Sale) => {
    // Fetch full sale
    try {
      const fullSale = await apiRequest<Sale>(`/sales/${sale.id}`);
      setSelectedSaleForExchange(fullSale);

      // Pre-populate returnable items
      const returnables = (fullSale.items || [])
        .filter((it) => it.quantity > it.returned_quantity)
        .map((it) => ({
          sale_item_id: it.id,
          quantity: 0,
          maxQty: it.quantity - it.returned_quantity,
          restock: true, // Ask if item should return to stock
          name: `${it.product_name} (${it.size}/${it.color})`
        }));

      setReturnItemsState(returnables);
      setExchangeMode('return');
      setNewExchangeItems([]);
      setExchangeReason('Devolução solicitada no balcão');

      // Fetch active catalog for exchange pieces
      const prods = await apiRequest<Product[]>('/sales/pos/search');
      setCatalogProducts(prods);
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // Submit Return or Exchange
  const handleProcessReturnOrExchange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSaleForExchange) return;

    const itemsToReturn = returnItemsState
      .filter((i) => i.quantity > 0)
      .map((i) => ({
        sale_item_id: i.sale_item_id,
        quantity: i.quantity,
        restock: i.restock
      }));

    if (itemsToReturn.length === 0) {
      showToast('error', 'Selecione pelo menos uma peça com quantidade maior que zero para devolução.');
      return;
    }

    try {
      if (exchangeMode === 'return') {
        await apiRequest('/returns/process', {
          method: 'POST',
          body: JSON.stringify({
            sale_id: selectedSaleForExchange.id,
            items: itemsToReturn,
            reason: exchangeReason
          })
        });
        showToast('success', 'Devolução processada com sucesso!');
      } else {
        // Exchange
        if (newExchangeItems.length === 0) {
          showToast('error', 'Selecione as novas peças da troca.');
          return;
        }

        const res = await apiRequest<any>('/returns/exchange', {
          method: 'POST',
          body: JSON.stringify({
            sale_id: selectedSaleForExchange.id,
            returned_items: itemsToReturn,
            new_items: newExchangeItems.map((n) => ({
              variation_id: n.variation_id,
              quantity: n.quantity
            })),
            reason: exchangeReason
          })
        });

        const diff = res.difference_cents;
        showToast(
          'success',
          `Troca realizada com sucesso! ${
            diff > 0
              ? `Cliente pagou diferença de ${formatBRL(diff)}`
              : diff < 0
              ? `Loja restituiu diferença de ${formatBRL(Math.abs(diff))}`
              : 'Troca de mesmo valor (R$ 0,00)'
          }`
        );
      }

      setSelectedSaleForExchange(null);
      fetchSales();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Toast */}
      {notification && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in ${
            notification.type === 'success' ? 'bg-emerald-900 text-white' : 'bg-red-900 text-white'
          }`}
        >
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-gray-900">Histórico de Vendas & Trocas</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Consulta de vendas, reimpressão de comprovante, cancelamentos e fluxo de trocas/devoluções
          </p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-3xl border border-gray-200 shadow-2xs flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-gray-400" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs"
          />
          <span className="text-gray-400">até</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs"
          />
        </div>

        <div>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl font-medium text-gray-700"
          >
            <option value="">Todos os Pagamentos</option>
            <option value="pix">Pix</option>
            <option value="money">Dinheiro</option>
            <option value="debit">Débito</option>
            <option value="credit">Crédito</option>
          </select>
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl font-medium text-gray-700"
          >
            <option value="">Todos os Status</option>
            <option value="completed">Concluídas</option>
            <option value="returned_partial">Devolvidas Parcial</option>
            <option value="returned_full">Devolvidas Total</option>
            <option value="cancelled">Canceladas</option>
          </select>
        </div>

        {(startDate || endDate || paymentFilter || statusFilter) && (
          <button
            onClick={() => {
              setStartDate('');
              setEndDate('');
              setPaymentFilter('');
              setStatusFilter('');
            }}
            className="text-rose-600 hover:underline font-semibold cursor-pointer"
          >
            Limpar Filtros
          </button>
        )}
      </div>

      {/* Sales Table */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-bold text-[10px]">
              <tr>
                <th className="py-3 px-4">Código / Data</th>
                <th className="py-3 px-4">Atendente / Cliente</th>
                <th className="py-3 px-4">Formas de Pagamento</th>
                <th className="py-3 px-4 text-right">Subtotal</th>
                <th className="py-3 px-4 text-right">Desconto</th>
                <th className="py-3 px-4 text-right">Total Líquido</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400">
                    Carregando vendas...
                  </td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400">
                    Nenhuma venda encontrada com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                sales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-rose-50/20 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-gray-900 block font-mono">{sale.code}</span>
                      <span className="text-[10px] text-gray-400">{formatDateBR(sale.created_at)}</span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-medium text-gray-900 block">{sale.seller_name}</span>
                      <span className="text-[11px] text-gray-500">
                        {sale.customer_name ? `Cliente: ${sale.customer_name}` : 'Venda Balcão'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1">
                        {sale.payments?.map((p, idx) => (
                          <span
                            key={idx}
                            className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-semibold text-gray-700 capitalize"
                          >
                            {p.payment_method === 'money'
                              ? 'Dinheiro'
                              : p.payment_method}
                            : {formatBRL(p.amount_cents)}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right text-gray-600">
                      {formatBRL(sale.subtotal_cents)}
                    </td>

                    <td className="py-3.5 px-4 text-right text-emerald-700 font-medium">
                      {sale.discount_cents > 0 ? `-${formatBRL(sale.discount_cents)}` : '-'}
                    </td>

                    <td className="py-3.5 px-4 text-right font-black text-gray-950 font-serif">
                      {formatBRL(sale.total_cents)}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          sale.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : sale.status === 'cancelled'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {sale.status === 'completed'
                          ? 'Concluída'
                          : sale.status === 'cancelled'
                          ? 'Cancelada'
                          : 'Devolução/Troca'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right space-x-1.5">
                      {/* Print Receipt */}
                      <button
                        onClick={() => setSelectedSaleForReceipt(sale)}
                        className="p-1.5 text-gray-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Reimprimir Comprovante Não Fiscal"
                      >
                        <Printer className="w-4 h-4" />
                      </button>

                      {/* Exchange / Return */}
                      {sale.status !== 'cancelled' && sale.status !== 'returned_full' && (
                        <button
                          onClick={() => handleStartReturnExchange(sale)}
                          className="p-1.5 text-gray-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                          title="Troca ou Devolução"
                        >
                          <ArrowRightLeft className="w-4 h-4" />
                        </button>
                      )}

                      {/* Cancel Sale (Admin only) */}
                      {isAdmin && sale.status !== 'cancelled' && (
                        <button
                          onClick={() => handleStartCancel(sale)}
                          className="p-1.5 text-gray-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Cancelar Venda e Estornar Estoque"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cancel Sale Modal */}
      {selectedSaleForCancel && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-rose-100">
            <h3 className="font-bold text-gray-900 text-base mb-1">Cancelar Venda</h3>
            <p className="text-xs text-gray-500 mb-4">
              Venda: <strong>{selectedSaleForCancel.code}</strong> (Total: {formatBRL(selectedSaleForCancel.total_cents)})
            </p>

            <form onSubmit={handleConfirmCancel} className="space-y-4 text-xs">
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 leading-snug">
                ⚠️ O cancelamento estornará todas as peças ao estoque da loja de forma automática.
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Justificativa Obrigatória do Cancelamento *
                </label>
                <textarea
                  required
                  rows={2}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Informe o motivo do cancelamento..."
                  className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedSaleForCancel(null)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl font-bold cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-xs cursor-pointer"
                >
                  Confirmar Cancelamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Return & Exchange Modal */}
      {selectedSaleForExchange && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-6 border border-rose-100 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
              <div>
                <h3 className="font-bold text-gray-900 text-base">Troca ou Devolução</h3>
                <p className="text-xs text-gray-500">Venda original: {selectedSaleForExchange.code}</p>
              </div>
              <button
                onClick={() => setSelectedSaleForExchange(null)}
                className="text-gray-400 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Selector */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                type="button"
                onClick={() => setExchangeMode('return')}
                className={`py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                  exchangeMode === 'return'
                    ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                    : 'bg-gray-50 border-gray-200 text-gray-700'
                }`}
              >
                Devolução Simples (Restituição)
              </button>
              <button
                type="button"
                onClick={() => setExchangeMode('exchange')}
                className={`py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                  exchangeMode === 'exchange'
                    ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                    : 'bg-gray-50 border-gray-200 text-gray-700'
                }`}
              >
                Troca de Peça (Novas Peças)
              </button>
            </div>

            <form onSubmit={handleProcessReturnOrExchange} className="space-y-4 text-xs">
              {/* Items to Return */}
              <div>
                <label className="block font-bold text-gray-700 mb-2">
                  Selecione as Peças que o Cliente está Devolvendo:
                </label>
                <div className="space-y-2">
                  {returnItemsState.map((it, idx) => (
                    <div
                      key={it.sale_item_id}
                      className="p-3 bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-gray-900 block truncate">{it.name}</span>
                        <span className="text-[10px] text-gray-400">
                          Disponível para devolver: {it.maxQty} un.
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Restock Question Checkbox */}
                        <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-gray-600">
                          <input
                            type="checkbox"
                            checked={it.restock}
                            onChange={(e) => {
                              const updated = [...returnItemsState];
                              updated[idx].restock = e.target.checked;
                              setReturnItemsState(updated);
                            }}
                            className="rounded text-rose-600"
                          />
                          <span>Retornar ao estoque</span>
                        </label>

                        {/* Qty to return */}
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500 text-[11px]">Qtd:</span>
                          <input
                            type="number"
                            min="0"
                            max={it.maxQty}
                            value={it.quantity}
                            onChange={(e) => {
                              const val = Math.min(it.maxQty, Math.max(0, parseInt(e.target.value) || 0));
                              const updated = [...returnItemsState];
                              updated[idx].quantity = val;
                              setReturnItemsState(updated);
                            }}
                            className="w-14 px-2 py-1 bg-white border border-gray-300 rounded-lg text-center font-bold"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* If Exchange: Select New Pieces */}
              {exchangeMode === 'exchange' && (
                <div className="pt-3 border-t border-gray-200 space-y-3">
                  <label className="block font-bold text-gray-700">
                    Selecione as Novas Peças que o Cliente está Levando:
                  </label>

                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1">
                    {catalogProducts.map((p) => (
                      <div key={p.id} className="p-2 bg-gray-50 rounded-xl border border-gray-200">
                        <span className="font-bold text-gray-900 block truncate">{p.name}</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {p.variations.filter((v) => v.stock > 0).map((v) => (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => {
                                const effectivePrice = p.promo_price_cents || p.sale_price_cents;
                                setNewExchangeItems([
                                  ...newExchangeItems,
                                  {
                                    variation_id: v.id,
                                    quantity: 1,
                                    name: `${p.name} (${v.size}/${v.color})`,
                                    price_cents: effectivePrice
                                  }
                                ]);
                              }}
                              className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-[10px] hover:bg-rose-50"
                            >
                              +{v.size}/{v.color} ({formatBRL(p.promo_price_cents || p.sale_price_cents)})
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {newExchangeItems.length > 0 && (
                    <div className="p-2 bg-rose-50/50 rounded-xl space-y-1">
                      <span className="font-bold text-rose-900 block">Novas peças selecionadas:</span>
                      {newExchangeItems.map((n, idx) => (
                        <div key={idx} className="flex justify-between items-center text-[11px]">
                          <span>{n.name}</span>
                          <div className="flex items-center gap-2">
                            <span>{formatBRL(n.price_cents)}</span>
                            <button
                              type="button"
                              onClick={() => setNewExchangeItems(newExchangeItems.filter((_, i) => i !== idx))}
                              className="text-red-500 hover:text-red-700"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block font-bold text-gray-700 mb-1">Motivo / Justificativa *</label>
                <input
                  type="text"
                  required
                  value={exchangeReason}
                  onChange={(e) => setExchangeReason(e.target.value)}
                  className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setSelectedSaleForExchange(null)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-xs cursor-pointer"
                >
                  Concluir Operação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Non-Fiscal Receipt Modal */}
      {selectedSaleForReceipt && (
        <Receipt
          sale={selectedSaleForReceipt}
          settings={settings}
          onClose={() => setSelectedSaleForReceipt(null)}
        />
      )}
    </div>
  );
};
