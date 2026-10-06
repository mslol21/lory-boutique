import React, { useState, useEffect } from 'react';
import { CashRegister, CashMovement } from '../types';
import { apiRequest, formatBRL, formatDateBR } from '../services/api';
import {
  DollarSign,
  PlusCircle,
  MinusCircle,
  Lock,
  Unlock,
  History,
  CheckCircle2,
  AlertCircle,
  X,
  CreditCard,
  QrCode,
  Banknote
} from 'lucide-react';

interface CashManagerProps {
  onStatusChange?: () => void;
}

export const CashManager: React.FC<CashManagerProps> = ({ onStatusChange }) => {
  const [currentCashData, setCurrentCashData] = useState<{
    open: boolean;
    register: CashRegister | null;
    summary: any;
    movements: CashMovement[];
  } | null>(null);

  const [history, setHistory] = useState<CashRegister[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isOpenModalActive, setIsOpenModalActive] = useState(false);
  const [isCloseModalActive, setIsCloseModalActive] = useState(false);
  const [isMovementModalActive, setIsMovementModalActive] = useState(false);

  // Form states
  const [initialAmountStr, setInitialAmountStr] = useState('100.00');
  const [countedCashStr, setCountedCashStr] = useState('0.00');
  const [closeNotes, setCloseNotes] = useState('');
  const [movementType, setMovementType] = useState<'bleed' | 'supply'>('bleed');
  const [movementAmountStr, setMovementAmountStr] = useState('50.00');
  const [movementReason, setMovementReason] = useState('');

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchCashState = async () => {
    setLoading(true);
    try {
      const [currRes, histRes] = await Promise.all([
        apiRequest<any>('/cash/current'),
        apiRequest<CashRegister[]>('/cash/history')
      ]);
      setCurrentCashData(currRes);
      setHistory(histRes);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCashState();
  }, []);

  const showToast = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3500);
  };

  // Open Cash Register
  const handleOpenRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const amountCents = Math.round(parseFloat(initialAmountStr || '0') * 100);
      await apiRequest('/cash/open', {
        method: 'POST',
        body: JSON.stringify({ initial_amount_cents: amountCents })
      });
      showToast('success', 'Caixa aberto com sucesso!');
      setIsOpenModalActive(false);
      fetchCashState();
      onStatusChange?.();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // Add Cash Movement (Bleed / Supply)
  const handleAddMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCashData?.register) return;

    try {
      const amountCents = Math.round(parseFloat(movementAmountStr || '0') * 100);
      await apiRequest('/cash/movement', {
        method: 'POST',
        body: JSON.stringify({
          register_id: currentCashData.register.id,
          type: movementType,
          amount_cents: amountCents,
          reason: movementReason
        })
      });
      showToast('success', `${movementType === 'bleed' ? 'Sangria' : 'Suprimento'} registrado com sucesso!`);
      setIsMovementModalActive(false);
      setMovementReason('');
      fetchCashState();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // Close Cash Register
  const handleCloseRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCashData?.register) return;

    try {
      const countedCents = Math.round(parseFloat(countedCashStr || '0') * 100);
      const res = await apiRequest<{ message: string; summary: any }>('/cash/close', {
        method: 'POST',
        body: JSON.stringify({
          register_id: currentCashData.register.id,
          counted_cash_cents: countedCents,
          notes: closeNotes
        })
      });
      showToast('success', `Caixa fechado com sucesso! Diferença: ${formatBRL(res.summary.difference_cents)}`);
      setIsCloseModalActive(false);
      fetchCashState();
      onStatusChange?.();
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const summary = currentCashData?.summary;
  const isOpen = currentCashData?.open;

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

      {/* Header & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-serif font-bold text-gray-900">Controle de Caixa</h2>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                isOpen
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : 'bg-red-100 text-red-800 border border-red-200'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isOpen ? 'bg-emerald-600 animate-pulse' : 'bg-red-600'}`} />
              {isOpen ? 'Caixa Aberto' : 'Caixa Fechado'}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Gestão do saldo físico da gaveta, sangrias, suprimentos e conferência
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {!isOpen ? (
            <button
              onClick={() => {
                setInitialAmountStr('100.00');
                setIsOpenModalActive(true);
              }}
              className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-2xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Unlock className="w-4 h-4" />
              <span>Abrir Caixa Agora</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  setMovementType('supply');
                  setMovementAmountStr('50.00');
                  setMovementReason('');
                  setIsMovementModalActive(true);
                }}
                className="px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold rounded-2xl transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Suprimento (+)</span>
              </button>

              <button
                onClick={() => {
                  setMovementType('bleed');
                  setMovementAmountStr('50.00');
                  setMovementReason('');
                  setIsMovementModalActive(true);
                }}
                className="px-3.5 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold rounded-2xl transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <MinusCircle className="w-4 h-4" />
                <span>Sangria (-)</span>
              </button>

              <button
                onClick={() => {
                  setCountedCashStr((summary?.expected_physical_cash_cents / 100).toFixed(2));
                  setCloseNotes('');
                  setIsCloseModalActive(true);
                }}
                className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-2xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>Fechamento do Caixa</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Live Cash Overview (when open) */}
      {isOpen && summary ? (
        <div className="space-y-6">
          {/* Main Financial KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Expected Physical Cash Card */}
            <div className="p-5 bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-3xl border border-emerald-200 shadow-2xs">
              <div className="flex items-center justify-between text-emerald-800 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Saldo Físico da Gaveta</span>
                <Banknote className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-serif font-black text-emerald-950">
                {formatBRL(summary.expected_physical_cash_cents)}
              </h3>
              <p className="text-[11px] text-emerald-700 mt-1">
                Dinheiro em espécie presente na gaveta
              </p>
            </div>

            {/* Pix Sales Card */}
            <div className="p-5 bg-gradient-to-br from-teal-50 to-teal-100/50 rounded-3xl border border-teal-200 shadow-2xs">
              <div className="flex items-center justify-between text-teal-800 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Vendas no Pix</span>
                <QrCode className="w-5 h-5 text-teal-600" />
              </div>
              <h3 className="text-2xl font-serif font-black text-teal-950">
                {formatBRL(summary.pix_sales_cents)}
              </h3>
              <p className="text-[11px] text-teal-700 mt-1">
                Entradas em conta corrente
              </p>
            </div>

            {/* Cards Sales (Débito e Crédito) */}
            <div className="p-5 bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-3xl border border-purple-200 shadow-2xs">
              <div className="flex items-center justify-between text-purple-800 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Cartões (Déb./Créd.)</span>
                <CreditCard className="w-5 h-5 text-purple-600" />
              </div>
              <h3 className="text-2xl font-serif font-black text-purple-950">
                {formatBRL(summary.debit_sales_cents + summary.credit_sales_cents)}
              </h3>
              <p className="text-[11px] text-purple-700 mt-1">
                Débito: {formatBRL(summary.debit_sales_cents)} | Crédito: {formatBRL(summary.credit_sales_cents)}
              </p>
            </div>

            {/* Total Gross Revenue */}
            <div className="p-5 bg-gradient-to-br from-brand-50 to-amber-50 rounded-3xl border border-brand-200 shadow-2xs">
              <div className="flex items-center justify-between text-brand-800 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Faturamento da Sessão</span>
                <DollarSign className="w-5 h-5 text-brand-600" />
              </div>
              <h3 className="text-2xl font-serif font-black text-brand-950">
                {formatBRL(summary.gross_revenue_cents)}
              </h3>
              <p className="text-[11px] text-brand-700 mt-1">
                {summary.total_sales_count} venda(s) registrada(s)
              </p>
            </div>
          </div>

          {/* Drawer Physical Cash Breakdown Details */}
          <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-2xs">
            <h3 className="text-sm font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">
              Discriminação do Saldo Físico da Gaveta (Somente Dinheiro)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs">
              <div className="p-3 bg-gray-50 rounded-xl">
                <span className="text-gray-500 block">Fundo de Abertura:</span>
                <span className="font-bold text-gray-900 mt-1 block">
                  {formatBRL(summary.initial_amount_cents)}
                </span>
              </div>

              <div className="p-3 bg-gray-50 rounded-xl">
                <span className="text-gray-500 block">Entradas Dinheiro (Vendas):</span>
                <span className="font-bold text-gray-900 mt-1 block">
                  {formatBRL(summary.cash_sales_gross_cents)}
                </span>
              </div>

              <div className="p-3 bg-gray-50 rounded-xl">
                <span className="text-gray-500 block">Trocos Devolvidos:</span>
                <span className="font-bold text-red-600 mt-1 block">
                  - {formatBRL(summary.change_given_cents)}
                </span>
              </div>

              <div className="p-3 bg-gray-50 rounded-xl">
                <span className="text-gray-500 block">Suprimentos Adicionados:</span>
                <span className="font-bold text-emerald-600 mt-1 block">
                  + {formatBRL(summary.supplies_cents)}
                </span>
              </div>

              <div className="p-3 bg-gray-50 rounded-xl">
                <span className="text-gray-500 block">Sangrias Realizadas:</span>
                <span className="font-bold text-amber-600 mt-1 block">
                  - {formatBRL(summary.bleeds_cents)}
                </span>
              </div>
            </div>
          </div>

          {/* Movements List in this session */}
          <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-2xs">
            <h3 className="text-sm font-bold text-gray-900 mb-3 pb-2 border-b border-gray-100">
              Movimentações Avulsas de Caixa (Sangrias e Suprimentos)
            </h3>
            {currentCashData.movements.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">Nenhuma sangria ou suprimento na sessão atual.</p>
            ) : (
              <div className="divide-y divide-gray-100 text-xs">
                {currentCashData.movements.map((m) => (
                  <div key={m.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <span className={`font-bold mr-2 ${m.type === 'supply' ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {m.type === 'supply' ? '[Suprimento]' : '[Sangria]'}
                      </span>
                      <span className="text-gray-800">{m.reason}</span>
                      <span className="text-[10px] text-gray-400 block mt-0.5">
                        Por: {m.user_name} • {formatDateBR(m.created_at)}
                      </span>
                    </div>
                    <span className={`font-bold ${m.type === 'supply' ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {m.type === 'supply' ? '+' : '-'} {formatBRL(m.amount_cents)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Cash Sessions History */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-gray-500" />
            <h3 className="font-bold text-gray-900 text-sm">Histórico de Fechamentos de Caixa</h3>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-bold text-[10px]">
              <tr>
                <th className="py-3 px-4">Abertura</th>
                <th className="py-3 px-4">Fechamento</th>
                <th className="py-3 px-4 text-right">Fundo Inicial</th>
                <th className="py-3 px-4 text-right">Esperado</th>
                <th className="py-3 px-4 text-right">Contado</th>
                <th className="py-3 px-4 text-right">Diferença</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">
                    Nenhum histórico de caixa encontrado.
                  </td>
                </tr>
              ) : (
                history.map((reg) => (
                  <tr key={reg.id} className="hover:bg-gray-50/50">
                    <td className="py-3 px-4">
                      <span className="font-medium text-gray-900 block">{formatDateBR(reg.opened_at)}</span>
                      <span className="text-[10px] text-gray-500">{reg.opener_name}</span>
                    </td>
                    <td className="py-3 px-4">
                      {reg.closed_at ? (
                        <>
                          <span className="font-medium text-gray-900 block">{formatDateBR(reg.closed_at)}</span>
                          <span className="text-[10px] text-gray-500">{reg.closer_name}</span>
                        </>
                      ) : (
                        <span className="text-emerald-700 font-semibold">Em andamento</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-medium">
                      {formatBRL(reg.initial_amount_cents)}
                    </td>
                    <td className="py-3 px-4 text-right font-medium">
                      {reg.expected_cash_cents !== null ? formatBRL(reg.expected_cash_cents) : '-'}
                    </td>
                    <td className="py-3 px-4 text-right font-medium">
                      {reg.counted_cash_cents !== null ? formatBRL(reg.counted_cash_cents) : '-'}
                    </td>
                    <td className="py-3 px-4 text-right font-bold">
                      {reg.difference_cents !== null && reg.difference_cents !== undefined ? (
                        <span
                          className={
                            reg.difference_cents === 0
                              ? 'text-gray-900'
                              : reg.difference_cents > 0
                              ? 'text-emerald-600'
                              : 'text-red-600'
                          }
                        >
                          {reg.difference_cents > 0 ? '+' : ''}
                          {formatBRL(reg.difference_cents)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          reg.status === 'open'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {reg.status === 'open' ? 'Aberto' : 'Fechado'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Open Cash Modal */}
      {isOpenModalActive && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 border border-brand-100">
            <h3 className="font-bold text-gray-900 text-base mb-1">Abertura de Caixa</h3>
            <p className="text-xs text-gray-500 mb-4">
              Informe o valor em dinheiro do troco inicial na gaveta
            </p>

            <form onSubmit={handleOpenRegister} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Fundo de Troco (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={initialAmountStr}
                  onChange={(e) => setInitialAmountStr(e.target.value)}
                  className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 font-bold text-base text-gray-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpenModalActive(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold shadow-xs cursor-pointer"
                >
                  Abrir Caixa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bleed / Supply Modal */}
      {isMovementModalActive && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 border border-brand-100">
            <h3 className="font-bold text-gray-900 text-base mb-1">
              {movementType === 'bleed' ? 'Realizar Sangria' : 'Realizar Suprimento'}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              {movementType === 'bleed'
                ? 'Retirada de valor em dinheiro da gaveta'
                : 'Aporte de dinheiro na gaveta'}
            </p>

            <form onSubmit={handleAddMovement} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Valor (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={movementAmountStr}
                  onChange={(e) => setMovementAmountStr(e.target.value)}
                  className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 font-bold text-base text-gray-900"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Justificativa / Motivo *</label>
                <input
                  type="text"
                  required
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  placeholder="ex: Pagamento de água, troco bancário..."
                  className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsMovementModalActive(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold shadow-xs cursor-pointer"
                >
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Cash Modal */}
      {isCloseModalActive && summary && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-brand-100">
            <h3 className="font-bold text-gray-900 text-base mb-1">Fechamento e Conferência de Caixa</h3>
            <p className="text-xs text-gray-500 mb-4">
              Conte as cédulas e moedas físicas na gaveta e confirme o encerramento da sessão
            </p>

            <form onSubmit={handleCloseRegister} className="space-y-4 text-xs">
              <div className="p-3 bg-gray-50 rounded-xl flex justify-between">
                <span className="text-gray-500">Valor Esperado em Dinheiro:</span>
                <span className="font-black text-gray-950 text-sm">
                  {formatBRL(summary.expected_physical_cash_cents)}
                </span>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Valor Físico Contado na Gaveta (R$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={countedCashStr}
                  onChange={(e) => setCountedCashStr(e.target.value)}
                  className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 font-bold text-base text-gray-900"
                />
              </div>

              {/* Difference preview */}
              {(() => {
                const counted = Math.round(parseFloat(countedCashStr || '0') * 100);
                const diff = counted - summary.expected_physical_cash_cents;
                return (
                  <div
                    className={`p-3 rounded-xl flex justify-between font-bold ${
                      diff === 0
                        ? 'bg-emerald-50 text-emerald-800'
                        : diff > 0
                        ? 'bg-blue-50 text-blue-800'
                        : 'bg-red-50 text-red-800'
                    }`}
                  >
                    <span>Diferença:</span>
                    <span>
                      {diff === 0 ? 'Conferência Exata (R$ 0,00)' : diff > 0 ? `Sobra: +${formatBRL(diff)}` : `Falta: ${formatBRL(diff)}`}
                    </span>
                  </div>
                );
              })()}

              <div>
                <label className="block font-bold text-gray-700 mb-1">Observações do Fechamento</label>
                <textarea
                  rows={2}
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  placeholder="Anotações sobre a conferência..."
                  className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCloseModalActive(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl font-bold shadow-xs cursor-pointer"
                >
                  Confirmar Fechamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
