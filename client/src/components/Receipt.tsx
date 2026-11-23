import { Dialog } from "./Dialog";
import React from "react";
import { Sale, StoreSettings } from "../types";
import { formatBRL, formatDateBR } from "../services/api";
import { Printer, X, Share2 } from "lucide-react";

interface ReceiptProps {
  sale: Sale;
  settings?: StoreSettings | null;
  onClose: () => void;
  provisional?: boolean;
}

export const Receipt: React.FC<ReceiptProps> = ({
  sale,
  settings,
  onClose,
  provisional = false,
}) => {
  const handlePrint = () => {
    // Print in an isolated document. Printing the entire SPA used to leave
    // hidden page regions in the printable flow (blank paper on POS58).
    const sanitize = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char
    ));
    const money = (value: number) => sanitize(formatBRL(value));
    const row = (label: string, value: string, prominent = false) =>
      `<div class="row${prominent ? " prominent" : ""}"><span>${sanitize(label)}</span><span>${value}</span></div>`;
    const itemsHtml = (sale.items || []).map((item) =>
      `<div class="item"><div class="item-name">${sanitize(item.product_name)}</div>${row(
        `${item.quantity} x ${formatBRL(item.unit_price_cents)}`,
        money(item.total_cents)
      )}</div>`
    ).join("");
    const paymentsHtml = (sale.payments || []).map((payment) =>
      row(getPaymentName(payment.payment_method), money(payment.amount_cents))
    ).join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8">
      <style>
        /* Physical paper: 58 mm; 40 mm print-safe column for the KP-IM607 driver.
           POS58 heads cannot necessarily print to the paper's right edge. */
        @page { size: 58mm 120mm; margin: 0; }
        html, body { margin: 0; padding: 0; width: 58mm; background: white; }
        body { color: #000; font: 9px/1.25 Arial, Helvetica, sans-serif; }
        #ticket { width: 40mm; max-width: 40mm; margin-left: 2mm; padding: 2mm 0 3mm; overflow: visible; }
        * { box-sizing: border-box; color: #000 !important; }
        h1 { margin: 0 0 2px; font-size: 12px; line-height: 1.1; text-align: center; font-weight: 800; }
        .center { text-align: center; overflow-wrap: anywhere; }
        .small { font-size: 8px; }
        .separator { margin: 4px 0; border-top: 1px dashed #222; }
        .row { display: grid; grid-template-columns: minmax(0, 1fr) auto; width: 100%; align-items: baseline; column-gap: 2mm; margin: 2px 0; }
        .row span { min-width: 0; overflow-wrap: anywhere; }
        .row span:first-child { min-width: 0; overflow-wrap: anywhere; }
        .row span:last-child { max-width: 26mm; text-align: right; overflow-wrap: anywhere; }
        .item .row span:last-child, .prominent span:last-child { white-space: nowrap; }
        .prominent { font-size: 11px; font-weight: 800; margin: 5px 0; }
        .item { margin: 4px 0; break-inside: avoid; }
        .item-name { font-weight: 700; overflow-wrap: anywhere; }
        .footer { margin-top: 6px; text-align: center; overflow-wrap: anywhere; }
        @media print {
          html, body { width: 58mm !important; margin: 0 !important; padding: 0 !important; }
          #ticket { width: 40mm !important; max-width: 40mm !important; margin-left: 2mm !important; }
        }
      </style></head><body><main id="ticket">
        <h1>${sanitize(settings?.store_name || "LORY BOUTIQUE")}</h1>
        <div class="center small">Moda e Acessórios</div>
        <div class="center small">${sanitize(settings?.address || "Rua Hipólito de Camargo, 45 — Guaianases, São Paulo/SP")}</div>
        <div class="center small">WhatsApp: ${sanitize(settings?.whatsapp || "(11) 94961-1902")}</div>
        ${settings?.cnpj ? `<div class="center small">CNPJ: ${sanitize(settings.cnpj)}</div>` : ""}
        <div class="separator"></div>
        <div class="center"><strong>${provisional ? "VENDA LOCAL PENDENTE — NÃO CONFIRMADA" : "COMPROVANTE NÃO FISCAL"}</strong></div>
        <div class="separator"></div>
        ${row("Venda", sanitize(sale.code))}
        ${row("Data", sanitize(formatDateBR(sale.created_at)))}
        ${row("Atendente", sanitize(sale.seller_name || "Equipe Lory"))}
        ${sale.customer_name ? row("Cliente", sanitize(sale.customer_name)) : ""}
        ${sale.customer_phone ? row("Contato", sanitize(sale.customer_phone)) : ""}
        <div class="separator"></div>
        ${itemsHtml}
        <div class="separator"></div>
        ${row("Subtotal", money(sale.subtotal_cents))}
        ${sale.discount_cents > 0 ? row("Desconto", "- " + money(sale.discount_cents)) : ""}
        ${sale.exchange_credit_cents ? row("Crédito da troca", money(sale.exchange_credit_cents)) : ""}
        ${row("TOTAL", money(sale.total_cents), true)}
        <div class="separator"></div>
        ${paymentsHtml}
        ${sale.change_cents > 0 ? row("Troco", money(sale.change_cents)) : ""}
        <div class="footer">Obrigada por escolher a Lory Boutique!<div class="small">Guarde este comprovante para eventuais trocas.</div><div class="small">@loryboutiquel</div></div>
      </main></body></html>`;

    const frame = document.createElement("iframe");
    frame.title = "Impressão de cupom Lory Boutique";
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;left:-10000px;top:0;width:58mm;height:200mm;border:0;opacity:0;pointer-events:none;";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc || !frame.contentWindow) {
      frame.remove();
      window.alert("Não foi possível abrir a impressão do cupom.");
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    const win = frame.contentWindow;
    const ticket = doc.getElementById("ticket");
    if (!ticket) { frame.remove(); return; }
    // Estimate paper length from the isolated content. Driver paper settings
    // must still be set to continuous 58 mm; browser CSS cannot override all drivers.
    const height = Math.max(50, Math.min(550, Math.ceil(ticket.getBoundingClientRect().height * 25.4 / 96 + 5)));
    const dynamicPage = doc.createElement("style");
    dynamicPage.textContent = `@page { size: 58mm ${height}mm; margin: 0; }`;
    doc.head.appendChild(dynamicPage);
    const cleanup = () => {
      win.removeEventListener("afterprint", cleanup);
      frame.remove();
    };
    win.addEventListener("afterprint", cleanup, { once: true });
    try {
      win.focus();
      win.print();
    } catch {
      cleanup();
      window.alert("Não foi possível imprimir. Verifique a POS58 Printer no Windows.");
    }
  };

  // Mobile Bluetooth thermal printers usually need an Android print service or
  // compatible app. Share a plain-text version when the printer is not exposed
  // through the system print dialog. No unverified direct Bluetooth connection.
  const handleShare = async () => {
    const lines = [
      settings?.store_name || "Lory Boutique",
      provisional ? "PENDENTE DE SINCRONIZACAO" : "COMPROVANTE NAO FISCAL",
      `Venda: ${sale.code}`,
      formatDateBR(sale.created_at),
      "----------------------------",
      ...(sale.items || []).flatMap((item) => [
        item.product_name,
        `${item.quantity} x ${formatBRL(item.unit_price_cents)} = ${formatBRL(item.total_cents)}`,
      ]),
      "----------------------------",
      `TOTAL: ${formatBRL(sale.total_cents)}`,
      ...(sale.payments || []).map((p) => `${getPaymentName(p.payment_method)}: ${formatBRL(p.amount_cents)}`),
      ...(sale.change_cents ? [`Troco: ${formatBRL(sale.change_cents)}`] : []),
      "Obrigado pela preferencia!",
    ];
    const content = lines.join("\n");
    try {
      if (navigator.share) {
        await navigator.share({ title: "Cupom Lory Boutique", text: content });
      } else {
        await navigator.clipboard.writeText(content);
        window.alert("Cupom copiado. Cole no aplicativo da impressora Bluetooth.");
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        window.alert("Nao foi possivel compartilhar o cupom. Use a opcao Imprimir.");
      }
    }
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
            {provisional ? "Venda local — pendente" : "Comprovante Não Fiscal"}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir 58mm
            </button>
            <button onClick={handleShare} type="button" title="Enviar texto ao aplicativo da impressora" className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-brand-300 text-brand-900 text-xs font-semibold rounded-lg">
              <Share2 className="w-3.5 h-3.5" /> Compartilhar
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
        {provisional && (
          <p className="px-4 py-3 text-xs font-bold text-amber-950 bg-amber-100 border-y border-amber-300 print:hidden">
            Esta venda foi salva somente neste aparelho e ainda não consta no banco Neon. Não é um comprovante de venda confirmada.
          </p>
        )}
        {/* Printable Area */}
        <div
          id="printable-receipt"
          className="p-6 font-mono text-xs text-gray-800 bg-white"
        >
          {provisional && <div className="mb-3 text-center font-bold text-sm border-2 border-black p-2">PENDENTE DE SINCRONIZAÇÃO<br />NÃO CONFIRMADO NO SERVIDOR</div>}
          {/* Header */}
          <div className="text-center pb-3 border-b border-dashed border-gray-300">
            <h1 className="text-base font-bold text-gray-900 tracking-wider">
              {settings?.store_name || "LORY BOUTIQUE"}
            </h1>
            <p className="text-[10px] text-gray-500 uppercase">
              Moda e Acessórios
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
              {provisional ? "*** VENDA LOCAL PENDENTE ***" : "*** DOCUMENTO NÃO FISCAL ***"}
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
              <span>Produto</span>
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
                      {it.product_reference ? `Ref: ${it.product_reference}` : ""}
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
            <p>Guarde este comprovante para eventuais trocas.</p>
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
