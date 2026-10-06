import { Dialog } from "./Dialog";
import React, { useState, useEffect, useRef } from "react";
import { Sale, SaleItem, StoreSettings, User, Product } from "../types";
import { apiRequest, formatBRL, formatDateBR } from "../services/api";
import { Receipt } from "./Receipt";
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
  UserCheck,
} from "lucide-react";

interface SalesManagerProps {
  currentUser: User | null;
  settings: StoreSettings | null;
}

export const SalesManager: React.FC<SalesManagerProps> = ({
  currentUser,
  settings,
}) => {
  const isAdmin = currentUser?.role === "admin";
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [operationKey, setOperationKey] = useState("");
  const adjustmentDraftKey = `lory_adjustment_v1_${currentUser?.id}`;
  const operationRef = useRef<{
    key: string;
    payload: any;
    endpoint: string;
  } | null>(
    (() => {
      try {
        return JSON.parse(localStorage.getItem(adjustmentDraftKey) || "null");
      } catch {
        return null;
      }
    })(),
  );
  const [hasAdjustmentPending, setHasAdjustmentPending] = useState(
    Boolean(operationRef.current),
  );
  const [settlementMethod, setSettlementMethod] = useState<
    "money" | "pix" | "debit" | "credit"
  >("money");
  const [settlementConfirmed, setSettlementConfirmed] = useState(false);
  const [exchangeSearch, setExchangeSearch] = useState("");
  // Filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modals
  const [selectedSaleForReceipt, setSelectedSaleForReceipt] =
    useState<Sale | null>(null);
  const [selectedSaleForCancel, setSelectedSaleForCancel] =
    useState<Sale | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // Return / Exchange Modal
  const [selectedSaleForExchange, setSelectedSaleForExchange] =
    useState<Sale | null>(null);
  const [exchangeMode, setExchangeMode] = useState<"return" | "exchange">(
    "return",
  );
  const [returnItemsState, setReturnItemsState] = useState<
    {
      sale_item_id: string;
      quantity: number;
      maxQty: number;
      restock: boolean;
      name: string;
    }[]
  >([]);
  const [exchangeReason, setExchangeReason] = useState(
    "Cliente solicitou troca de peça",
  );

  // New items for exchange
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [newExchangeItems, setNewExchangeItems] = useState<
    {
      variation_id: string;
      quantity: number;
      name: string;
      price_cents: number;
    }[]
  >([]);

  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const fetchSales = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      if (paymentFilter) params.append("payment_method", paymentFilter);
      if (statusFilter) params.append("status", statusFilter);

      const res = await apiRequest<{ sales: Sale[]; total: number }>(
        `/sales?${params.toString()}`,
      );
      setSales(res.sales);
      setTotal(res.total);
    } catch (err: any) {
      showToast("error", err.message || "Não foi possível carregar as vendas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, [startDate, endDate, paymentFilter, statusFilter, page]);
  useEffect(() => {
    setPage(1);
  }, [startDate, endDate, paymentFilter, statusFilter]);

  const showToast = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3500);
  };

  // Open Cancel Modal
  const handleStartCancel = (sale: Sale) => {
    if (!isAdmin) {
      showToast("error", "Apenas administradores podem cancelar vendas.");
      return;
    }
    setSelectedSaleForCancel(sale);
    setCancelReason("");
  };

  // Submit Cancel
  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSaleForCancel) return;

    try {
      await apiRequest(`/sales/${selectedSaleForCancel.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: cancelReason }),
      });
      showToast(
        "success",
        "Venda cancelada e peças retornadas ao estoque com sucesso!",
      );
      setSelectedSaleForCancel(null);
      fetchSales();
    } catch (err: any) {
      showToast("error", err.message);
    }
  };

  // Open Return / Exchange Modal
  const handleStartReturnExchange = async (sale: Sale) => {
    if (!isAdmin) return;
    if (operationRef.current) {
      showToast(
        "error",
        "Recupere a operação pendente antes de iniciar outra.",
      );
      return;
    }
    setOperationKey(crypto.randomUUID());
    setSettlementConfirmed(false);
    setExchangeSearch("");
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
          name: `${it.product_name} (${it.size}/${it.color})`,
        }));

      setReturnItemsState(returnables);
      setExchangeMode("return");
      setNewExchangeItems([]);
      setExchangeReason("Devolução solicitada no balcão");

      // Fetch active catalog for exchange pieces
      const prods = await apiRequest<Product[]>("/products?status=active");
      setCatalogProducts(prods);
    } catch (err: any) {
      showToast("error", err.message);
    }
  };

  const recoverAdjustment = async () => {
    const op = operationRef.current;
    if (!op || processing) return;
    setProcessing(true);
    try {
      await apiRequest(op.endpoint, {
        method: "POST",
        body: JSON.stringify(op.payload),
      });
      operationRef.current = null;
      localStorage.removeItem(adjustmentDraftKey);
      setHasAdjustmentPending(false);
      setSelectedSaleForExchange(null);
      showToast("success", "Operação recuperada sem duplicação.");
      fetchSales();
    } catch (err: any) {
      if (err.status === 400) {
        operationRef.current = null;
        localStorage.removeItem(adjustmentDraftKey);
        setHasAdjustmentPending(false);
      }
      showToast("error", err.message);
    } finally {
      setProcessing(false);
    }
  };
  const returnedValue = returnItemsState.reduce((sum, row) => {
    const item = selectedSaleForExchange?.items?.find(
      (i) => i.id === row.sale_item_id,
    );
    if (!item) return sum;
    return (
      sum +
      Math.floor(
        ((item.net_total_cents ?? item.total_cents) *
          (item.returned_quantity + row.quantity)) /
          item.quantity,
      ) -
      Math.floor(
        ((item.net_total_cents ?? item.total_cents) * item.returned_quantity) /
          item.quantity,
      )
    );
  }, 0);
  const newValue = newExchangeItems.reduce(
    (sum, item) => sum + item.price_cents * item.quantity,
    0,
  );
  const settlementDifference =
    exchangeMode === "return" ? -returnedValue : newValue - returnedValue;
  const handleProcessReturnOrExchange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSaleForExchange || processing) return;
    if (!settlementConfirmed) {
      showToast(
        "error",
        "Confirme o registro manual da diferença ou restituição.",
      );
      return;
    }
    const items = returnItemsState
      .filter((i) => i.quantity > 0)
      .map((i) => ({
        sale_item_id: i.sale_item_id,
        quantity: i.quantity,
        restock: i.restock,
      }));
    if (!items.length) {
      showToast("error", "Selecione as peças devolvidas.");
      return;
    }
    if (exchangeMode === "exchange" && !newExchangeItems.length) {
      showToast("error", "Selecione as novas peças.");
      return;
    }
    setProcessing(true);
    try {
      if (!operationRef.current) {
        const payload: any = {
          sale_id: selectedSaleForExchange.id,
          reason: exchangeReason,
          idempotency_key: operationKey,
          refund_method: settlementMethod,
        };
        if (exchangeMode === "return") payload.items = items;
        else {
          payload.returned_items = items;
          payload.new_items = newExchangeItems.map((n) => ({
            variation_id: n.variation_id,
            quantity: n.quantity,
          }));
          payload.payments =
            settlementDifference > 0
              ? [
                  {
                    method: settlementMethod,
                    amount_cents: settlementDifference,
                  },
                ]
              : [];
        }
        operationRef.current = {
          key: operationKey,
          payload,
          endpoint:
            exchangeMode === "return"
              ? "/returns/process"
              : "/returns/exchange",
        };
        localStorage.setItem(
          adjustmentDraftKey,
          JSON.stringify(operationRef.current),
        );
        setHasAdjustmentPending(true);
      }
      const op = operationRef.current;
      await apiRequest(op.endpoint, {
        method: "POST",
        body: JSON.stringify(op.payload),
      });
      operationRef.current = null;
      localStorage.removeItem(adjustmentDraftKey);
      setHasAdjustmentPending(false);
      setSelectedSaleForExchange(null);
      showToast("success", "Operação registrada no estoque e no caixa.");
      fetchSales();
    } catch (err: any) {
      if (err.status === 400) {
        operationRef.current = null;
        localStorage.removeItem(adjustmentDraftKey);
        setHasAdjustmentPending(false);
      }
      showToast("error", err.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Toast */}
      {notification && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in ${
            notification.type === "success"
              ? "bg-emerald-900 text-white"
              : "bg-red-900 text-white"
          }`}
        >
          <span>{notification.message}</span>
        </div>
      )}

      {hasAdjustmentPending && (
        <div
          role="status"
          className="p-4 border border-amber-200 bg-amber-50 rounded-xl"
        >
          Há uma troca/devolução aguardando confirmação.{" "}
          <button
            disabled={processing}
            onClick={recoverAdjustment}
            className="underline"
          >
            Recuperar operação pendente
          </button>
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-gray-900">
            Histórico de Vendas & Trocas
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Consulta de vendas, reimpressão de comprovante, cancelamentos e
            fluxo de trocas/devoluções
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
              setStartDate("");
              setEndDate("");
              setPaymentFilter("");
              setStatusFilter("");
            }}
            className="text-brand-600 hover:underline font-semibold cursor-pointer"
          >
            Limpar Filtros
          </button>
        )}
      </div>

      <div className="flex gap-4 items-center">
        <span>
          {total} vendas · Página {page} de {Math.max(1, Math.ceil(total / 50))}
        </span>
        <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
          Anterior
        </button>
        <button
          disabled={page * 50 >= total}
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima
        </button>
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
                <th className="py-3 px-4 text-right">Valor da Venda</th>
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
                  <tr
                    key={sale.id}
                    className="hover:bg-brand-50/20 transition-colors"
                  >
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-gray-900 block font-mono">
                        {sale.code}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {formatDateBR(sale.created_at)}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-medium text-gray-900 block">
                        {sale.seller_name}
                      </span>
                      <span className="text-[11px] text-gray-500">
                        {sale.customer_name
                          ? `Cliente: ${sale.customer_name}`
                          : "Venda Balcão"}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1">
                        {sale.payments?.map((p, idx) => (
                          <span
                            key={idx}
                            className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-semibold text-gray-700 capitalize"
                          >
                            {p.payment_method === "money"
                              ? "Dinheiro"
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
                      {sale.discount_cents > 0
                        ? `-${formatBRL(sale.discount_cents)}`
                        : "-"}
                    </td>

                    <td className="py-3.5 px-4 text-right font-black text-gray-950 font-serif">
                      {formatBRL(sale.total_cents)}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          sale.status === "completed"
                            ? "bg-emerald-100 text-emerald-800"
                            : sale.status === "cancelled"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {sale.status === "completed"
                          ? "Concluída"
                          : sale.status === "cancelled"
                            ? "Cancelada"
                            : "Devolução/Troca"}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right space-x-1.5">
                      {/* Print Receipt */}
                      <button
                        onClick={() => setSelectedSaleForReceipt(sale)}
                        className="p-1.5 text-gray-500 hover:text-brand-700 hover:bg-brand-50 rounded-lg transition-colors cursor-pointer"
                        title="Reimprimir Comprovante Não Fiscal"
                      >
                        <Printer className="w-4 h-4" />
                      </button>

                      {/* Exchange / Return */}
                      {isAdmin &&
                        sale.status !== "cancelled" &&
                        sale.status !== "returned_full" && (
                          <button
                            onClick={() => handleStartReturnExchange(sale)}
                            className="p-1.5 text-gray-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                            title="Troca ou Devolução"
                          >
                            <ArrowRightLeft className="w-4 h-4" />
                          </button>
                        )}

                      {/* Cancel Sale (Admin only) */}
                      {isAdmin &&
                        sale.status === "completed" &&
                        !sale.exchange_credit_cents && (
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
        <Dialog className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-brand-100">
            <h3 className="font-bold text-gray-900 text-base mb-1">
              Cancelar Venda
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Venda: <strong>{selectedSaleForCancel.code}</strong> (Total:{" "}
              {formatBRL(selectedSaleForCancel.total_cents)})
            </p>

            <form onSubmit={handleConfirmCancel} className="space-y-4 text-xs">
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 leading-snug">
                ⚠️ O cancelamento estornará todas as peças ao estoque da loja de
                forma automática.
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
                  disabled={processing}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-xs cursor-pointer"
                >
                  Confirmar Cancelamento
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* Return & Exchange Modal */}
      {selectedSaleForExchange && (
        <Dialog className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-6 border border-brand-100 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
              <div>
                <h3 className="font-bold text-gray-900 text-base">
                  Troca ou Devolução
                </h3>
                <p className="text-xs text-gray-500">
                  Venda original: {selectedSaleForExchange.code}
                </p>
              </div>
              <button
                data-dialog-close
                aria-label="Fechar janela"
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
                onClick={() => setExchangeMode("return")}
                className={`py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                  exchangeMode === "return"
                    ? "bg-brand-600 text-white border-brand-600 shadow-xs"
                    : "bg-gray-50 border-gray-200 text-gray-700"
                }`}
              >
                Devolução Simples (Restituição)
              </button>
              <button
                type="button"
                onClick={() => setExchangeMode("exchange")}
                className={`py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                  exchangeMode === "exchange"
                    ? "bg-brand-600 text-white border-brand-600 shadow-xs"
                    : "bg-gray-50 border-gray-200 text-gray-700"
                }`}
              >
                Troca de Peça (Novas Peças)
              </button>
            </div>

            <form
              onSubmit={handleProcessReturnOrExchange}
              className="space-y-4 text-xs"
            >
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
                        <span className="font-bold text-gray-900 block truncate">
                          {it.name}
                        </span>
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
                            className="rounded text-brand-600"
                          />
                          <span>Retornar ao estoque</span>
                        </label>

                        {/* Qty to return */}
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500 text-[11px]">
                            Qtd:
                          </span>
                          <input
                            type="number"
                            min="0"
                            max={it.maxQty}
                            value={it.quantity}
                            onChange={(e) => {
                              const val = Math.min(
                                it.maxQty,
                                Math.max(0, parseInt(e.target.value) || 0),
                              );
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
              {exchangeMode === "exchange" && (
                <div className="pt-3 border-t border-gray-200 space-y-3">
                  <label className="block font-bold text-gray-700">
                    Selecione as Novas Peças que o Cliente está Levando:
                  </label>

                  <input
                    aria-label="Buscar peças para troca"
                    placeholder="Buscar peça, referência ou SKU"
                    value={exchangeSearch}
                    onChange={(e) => setExchangeSearch(e.target.value)}
                    className="w-full border rounded-lg p-2"
                  />
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1">
                    {catalogProducts
                      .filter(
                        (p) =>
                          !exchangeSearch ||
                          [
                            p.name,
                            p.reference,
                            ...p.variations.map((v) => v.sku),
                          ].some((v) =>
                            v
                              ?.toLowerCase()
                              .includes(exchangeSearch.toLowerCase()),
                          ),
                      )
                      .map((p) => (
                        <div
                          key={p.id}
                          className="p-2 bg-gray-50 rounded-xl border border-gray-200"
                        >
                          <span className="font-bold text-gray-900 block truncate">
                            {p.name}
                          </span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {p.variations
                              .filter((v) => v.stock > 0)
                              .map((v) => (
                                <button
                                  key={v.id}
                                  type="button"
                                  onClick={() => {
                                    const effectivePrice =
                                      p.promo_price_cents || p.sale_price_cents;
                                    setNewExchangeItems([
                                      ...newExchangeItems,
                                      {
                                        variation_id: v.id,
                                        quantity: 1,
                                        name: `${p.name} (${v.size}/${v.color})`,
                                        price_cents: effectivePrice,
                                      },
                                    ]);
                                  }}
                                  className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-[10px] hover:bg-brand-50"
                                >
                                  +{v.size}/{v.color} (
                                  {formatBRL(
                                    p.promo_price_cents || p.sale_price_cents,
                                  )}
                                  )
                                </button>
                              ))}
                          </div>
                        </div>
                      ))}
                  </div>

                  {newExchangeItems.length > 0 && (
                    <div className="p-2 bg-brand-50/50 rounded-xl space-y-1">
                      <span className="font-bold text-brand-900 block">
                        Novas peças selecionadas:
                      </span>
                      {newExchangeItems.map((n, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between items-center text-[11px]"
                        >
                          <span>{n.name}</span>
                          <div className="flex items-center gap-2">
                            <span>{formatBRL(n.price_cents)}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setNewExchangeItems(
                                  newExchangeItems.filter((_, i) => i !== idx),
                                )
                              }
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

              <div className="p-4 bg-amber-50 rounded-xl space-y-3">
                <p className="font-bold">
                  {settlementDifference > 0
                    ? "Receber diferença"
                    : settlementDifference < 0
                      ? "Restituir ao cliente"
                      : "Troca sem diferença"}
                  : {formatBRL(Math.abs(settlementDifference))}
                </p>
                <label className="block">
                  Forma de recebimento ou restituição
                  <select
                    value={settlementMethod}
                    onChange={(e) => setSettlementMethod(e.target.value as any)}
                    className="block border rounded-lg p-2"
                  >
                    <option value="money">Dinheiro</option>
                    <option value="pix">Pix</option>
                    <option value="debit">Débito</option>
                    <option value="credit">Crédito</option>
                  </select>
                </label>
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={settlementConfirmed}
                    onChange={(e) => setSettlementConfirmed(e.target.checked)}
                    required
                  />
                  Confirmo que conferi o valor e registrei manualmente o
                  recebimento ou a restituição. Não há pagamento automático.
                </label>
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Motivo / Justificativa *
                </label>
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
                  disabled={processing}
                  className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold shadow-xs cursor-pointer"
                >
                  Concluir Operação
                </button>
              </div>
            </form>
          </div>
        </Dialog>
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
