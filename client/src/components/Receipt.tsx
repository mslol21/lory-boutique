import { Dialog } from "./Dialog";
import React from "react";
import { Sale, StoreSettings } from "../types";
import { formatBRL, formatDateBR } from "../services/api";
import { Printer, X, Download } from "lucide-react";

interface ReceiptProps {
  sale: Sale;
  settings?: StoreSettings | null;
  onClose: () => void;
}

export const Receipt: React.FC<ReceiptProps> = ({
  sale,
  settings,
  onClose,
}) => {
  const handlePrint = () => {
    window.print();
  };

  const getPaymentName = (method: string) => {
    switch (method) {
      case "money":
        return "Dinheiro";
      case "pix":
        return "Pix";
      case "debit":
        return "Cartão de Débito";
      case "credit":
        return "Cartão de Crédito";
      default:
        return method;
    }
  };

  return (
    <Dialog className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-brand-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Toolbar (hidden when printing) */}
        <div className="bg-brand-50 px-5 py-3 border-b border-brand-100 flex items-center justify-between print:hidden">
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-800">
            Comprovante Não Fiscal
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir
            </button>
            <button
              data-dialog-close
              aria-label="Fechar janela"
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-brand-100 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {sale.status !== "completed" && (
          <p className="p-3 text-red-800">
            Situação da venda:{" "}
            {sale.status === "cancelled"
              ? "Cancelada"
              : sale.status === "returned_full"
                ? "Devolvida integralmente"
                : "Devolvida parcialmente"}
          </p>
        )}
        {/* Printable Area */}
        <div
          id="printable-receipt"
          className="p-6 font-mono text-xs text-gray-800 bg-white"
        >
          {/* Header */}
          <div className="text-center pb-3 border-b border-dashed border-gray-300">
            <h1 className="text-base font-bold text-gray-900 tracking-wider">
              {settings?.store_name || "LORY BOUTIQUE"}
            </h1>
            <p className="text-[10px] text-gray-500 uppercase">
              Moda Feminina Elegante
            </p>
            <p className="text-[11px] text-gray-600 mt-1">
              {settings?.address ||
                "Rua Hipólito de Camargo, 45 — Guaianases, São Paulo/SP"}
            </p>
            <p className="text-[11px] text-gray-600">
              WhatsApp: {settings?.whatsapp || "(11) 94961-1902"}
            </p>
            {settings?.cnpj ? (
              <p className="text-[10px] text-gray-500">CNPJ: {settings.cnpj}</p>
            ) : null}
            <div className="mt-2 py-1 bg-amber-50 border border-amber-200 rounded text-[10px] font-semibold text-amber-800 uppercase">
              *** DOCUMENTO NÃO FISCAL ***
            </div>
          </div>

          {sale.exchange_credit_cents ? (
            <p className="py-2">
              Crédito da troca: {formatBRL(sale.exchange_credit_cents)} ·
              Diferença a pagar:{" "}
              {formatBRL(sale.total_cents - sale.exchange_credit_cents)}
            </p>
          ) : null}
          {/* Sale Metadata */}
          <div className="py-2.5 border-b border-dashed border-gray-300 space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-gray-500">Venda:</span>
              <span className="font-bold text-gray-900">{sale.code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Data/Hora:</span>
              <span>{formatDateBR(sale.created_at)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Atendente:</span>
              <span>{sale.seller_name || "Equipe Lory"}</span>
            </div>
            {sale.customer_name ? (
              <div className="flex justify-between">
                <span className="text-gray-500">Cliente:</span>
                <span className="font-medium">{sale.customer_name}</span>
              </div>
            ) : (
              <div className="flex justify-between text-gray-400 text-[10px]">
                <span>Cliente:</span>
                <span>Venda Balcão (Não identificado)</span>
              </div>
            )}
            {sale.customer_phone ? (
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-500">Contato:</span>
                <span>{sale.customer_phone}</span>
              </div>
            ) : null}
          </div>

          {/* Items Table */}
          <div className="py-2.5 border-b border-dashed border-gray-300">
            <div className="flex justify-between text-[10px] font-bold text-gray-600 uppercase mb-1">
              <span>Item / Variação</span>
              <span>Total</span>
            </div>
            <div className="space-y-2">
              {sale.items?.map((it, idx) => (
                <div key={idx} className="text-[11px]">
                  <div className="font-semibold text-gray-900 flex justify-between">
                    <span className="line-clamp-1">{it.product_name}</span>
                    <span>{formatBRL(it.total_cents)}</span>
                  </div>
                  <div className="text-[10px] text-gray-500 flex justify-between">
                    <span>
                      Tam: {it.size} | Cor: {it.color}
                      {it.product_reference
                        ? ` | Ref: ${it.product_reference}`
                        : ""}
                    </span>
                    <span>
                      {it.quantity}x {formatBRL(it.unit_price_cents)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals & Payments */}
          <div className="py-2.5 border-b border-dashed border-gray-300 space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal:</span>
              <span>{formatBRL(sale.subtotal_cents)}</span>
            </div>
            {sale.discount_cents > 0 ? (
              <div className="flex justify-between text-emerald-700">
                <span>Desconto Aplicado:</span>
                <span>- {formatBRL(sale.discount_cents)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-sm font-bold text-gray-900 pt-1 border-t border-gray-200">
              <span>TOTAL LÍQUIDO:</span>
              <span>{formatBRL(sale.total_cents)}</span>
            </div>

            {/* Payments breakdown */}
            <div className="pt-2 text-[10px] space-y-0.5">
              <span className="font-semibold text-gray-600 block">
                FORMA(S) DE PAGAMENTO:
              </span>
              {sale.payments?.map((p, idx) => (
                <div key={idx} className="flex justify-between text-gray-700">
                  <span>{getPaymentName(p.payment_method)}:</span>
                  <span>{formatBRL(p.amount_cents)}</span>
                </div>
              ))}
              {sale.change_cents > 0 ? (
                <div className="flex justify-between text-emerald-800 font-semibold pt-1 border-t border-dashed border-gray-200">
                  <span>Troco (Dinheiro):</span>
                  <span>{formatBRL(sale.change_cents)}</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Footer note */}
          <div className="pt-3 text-center text-[10px] text-gray-500 space-y-1">
            <p className="font-serif italic text-brand-900 font-semibold">
              Obrigada por escolher a Lory Boutique!
            </p>
            <p>Trocas com este comprovante em até 7 dias corridos.</p>
            <p className="text-[9px] text-gray-400">
              Instagram: @loryboutiquel
            </p>
          </div>
        </div>

        {/* Modal Bottom Footer (hidden on print) */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end print:hidden">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
          >
            Fechar Janela
          </button>
        </div>
      </div>
    </Dialog>
  );
};
