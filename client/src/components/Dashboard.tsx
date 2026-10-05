import React, { useState, useEffect } from "react";
import { User } from "../types";
import { apiRequest, formatBRL } from "../services/api";
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Percent,
  Download,
  AlertTriangle,
  Award,
  Layers,
  Calendar,
  Sparkles,
  BarChart3,
  CreditCard,
  QrCode,
  Banknote,
} from "lucide-react";

interface DashboardProps {
  currentUser: User | null;
  onNavigateToProducts: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  currentUser,
  onNavigateToProducts,
}) => {
  const isAdmin = currentUser?.role === "admin";
  const [period, setPeriod] = useState<"today" | "7days" | "30days">("today");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest(`/reports/dashboard?period=${period}`);
      setData(res);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [period]);

  const downloadCSV = async (endpoint: string, filename: string) => {
    try {
      const content = await apiRequest<string>(endpoint);
      const url = URL.createObjectURL(
        new Blob([content], { type: "text/csv;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      setError(err.message);
    }
  };
  const handleExportSales = () =>
    downloadCSV("/reports/export/sales", "vendas_lory_boutique.csv");
  const handleExportInventory = () =>
    downloadCSV("/reports/export/inventory", "estoque_lory_boutique.csv");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {error && (
        <p role="alert" className="p-4 bg-red-50 text-red-800">
          {error}
        </p>
      )}
      {/* Top Header & Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-gray-900">
            Painel Gerencial
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Acompanhamento de vendas, ticket médio, margem bruta estimada e
            alertas de estoque
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period selector */}
          <div className="flex bg-white p-1 rounded-2xl border border-gray-200 shadow-2xs text-xs font-semibold">
            <button
              onClick={() => setPeriod("today")}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                period === "today"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Hoje
            </button>
            <button
              onClick={() => setPeriod("7days")}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                period === "7days"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Últimos 7 dias
            </button>
            <button
              onClick={() => setPeriod("30days")}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                period === "30days"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Últimos 30 dias
            </button>
          </div>

          {/* Export CSV (Admin only) */}
          {isAdmin && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleExportSales}
                className="px-3 py-2 bg-white hover:bg-gray-50 border border-gray-200 rounded-2xl text-xs font-semibold text-gray-700 shadow-2xs flex items-center gap-1.5 cursor-pointer"
                title="Exportar Vendas para Excel / CSV"
              >
                <Download className="w-3.5 h-3.5 text-gray-500" />
                <span>Exportar Vendas</span>
              </button>
              <button
                onClick={handleExportInventory}
                className="px-3 py-2 bg-white hover:bg-gray-50 border border-gray-200 rounded-2xl text-xs font-semibold text-gray-700 shadow-2xs flex items-center gap-1.5 cursor-pointer"
                title="Exportar Inventário de Estoque para Excel / CSV"
              >
                <Download className="w-3.5 h-3.5 text-gray-500" />
                <span>Exportar Estoque</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {loading || !data ? (
        <div className="py-24 text-center">
          <div className="w-8 h-8 border-3 border-rose-200 border-t-rose-600 rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-gray-400">
            Carregando métricas da boutique...
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Main Financial KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Receita Líquida */}
            <div className="p-5 bg-white rounded-3xl border border-gray-200 shadow-2xs">
              <div className="flex items-center justify-between text-gray-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Receita Líquida
                </span>
                <DollarSign className="w-5 h-5 text-rose-600" />
              </div>
              <h3 className="text-2xl font-serif font-black text-gray-950">
                {formatBRL(data.gross_revenue_cents)}
              </h3>
              <p className="text-[11px] text-gray-500 mt-1">
                Total bruto vendido no período
              </p>
            </div>

            {/* Vendas Concluídas */}
            <div className="p-5 bg-white rounded-3xl border border-gray-200 shadow-2xs">
              <div className="flex items-center justify-between text-gray-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Vendas Realizadas
                </span>
                <ShoppingCart className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="text-2xl font-serif font-black text-gray-950">
                {data.sales_count} atendimentos
              </h3>
              <p className="text-[11px] text-gray-500 mt-1">
                Descontos concedidos: {formatBRL(data.total_discount_cents)}
              </p>
            </div>

            {/* Ticket Médio */}
            <div className="p-5 bg-white rounded-3xl border border-gray-200 shadow-2xs">
              <div className="flex items-center justify-between text-gray-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Ticket Médio
                </span>
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="text-2xl font-serif font-black text-gray-950">
                {formatBRL(data.average_ticket_cents)}
              </h3>
              <p className="text-[11px] text-gray-500 mt-1">
                Média por compra concluída
              </p>
            </div>

            {/* Margem Bruta Estimada (Admin Only, clearly distinct from revenue) */}
            {isAdmin ? (
              <div className="p-5 bg-gradient-to-br from-emerald-50 to-emerald-100/40 rounded-3xl border border-emerald-200 shadow-2xs">
                <div className="flex items-center justify-between text-emerald-800 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Margem Bruta Estimada
                  </span>
                  <Percent className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="text-2xl font-serif font-black text-emerald-950">
                  {data.margin_estimated_cents !== null
                    ? formatBRL(data.margin_estimated_cents)
                    : "Cadastre custos"}
                </h3>
                <p className="text-[11px] text-emerald-700 mt-1">
                  {data.total_cost_cents !== null
                    ? `Custo de mercadorias: ${formatBRL(data.total_cost_cents)}`
                    : "Calculado sobre itens com custo preenchido"}
                </p>
              </div>
            ) : (
              <div className="p-5 bg-gray-50 rounded-3xl border border-gray-200 shadow-2xs flex items-center justify-center text-center">
                <p className="text-xs text-gray-400">
                  Dados de margem e custo restritos à gerência
                </p>
              </div>
            )}
          </div>

          {/* Middle Row: Payments Distribution & Top 5 Best Sellers */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Payments breakdown */}
            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-2xs">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
                <BarChart3 className="w-4 h-4 text-rose-600" />
                <h3 className="text-sm font-bold text-gray-900">
                  Recebimentos líquidos por meio de pagamento
                </h3>
              </div>

              {data.payments_breakdown?.length === 0 ? (
                <p className="text-xs text-gray-400 py-6 text-center">
                  Nenhum pagamento registrado no período.
                </p>
              ) : (
                <div className="space-y-3">
                  {data.payments_breakdown?.map((p: any) => {
                    const paymentBase = data.payments_breakdown.reduce(
                      (sum: number, item: any) =>
                        sum + Math.abs(item.total_cents),
                      0,
                    );
                    const pct = paymentBase
                      ? Math.round(
                          (Math.abs(p.total_cents) / paymentBase) * 100,
                        )
                      : 0;

                    const getIcon = () => {
                      if (p.payment_method === "pix")
                        return <QrCode className="w-4 h-4 text-teal-600" />;
                      if (p.payment_method === "money")
                        return (
                          <Banknote className="w-4 h-4 text-emerald-600" />
                        );
                      return <CreditCard className="w-4 h-4 text-purple-600" />;
                    };

                    const getLabel = () => {
                      if (p.payment_method === "pix") return "Pix";
                      if (p.payment_method === "money") return "Dinheiro";
                      if (p.payment_method === "debit")
                        return "Cartão de Débito";
                      return "Cartão de Crédito";
                    };

                    return (
                      <div key={p.payment_method} className="space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {getIcon()}
                            <span className="font-semibold text-gray-800">
                              {getLabel()}
                            </span>
                          </div>
                          <span className="font-bold text-gray-900">
                            {formatBRL(p.total_cents)} ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-rose-500 rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(100, Math.max(0, pct))}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Best Sellers */}
            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-2xs">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
                <Award className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-gray-900">
                  Peças Mais Vendidas
                </h3>
              </div>

              {data.best_sellers?.length === 0 ? (
                <p className="text-xs text-gray-400 py-6 text-center">
                  Sem vendas no período.
                </p>
              ) : (
                <div className="divide-y divide-gray-100 text-xs">
                  {data.best_sellers?.map((prod: any, idx: number) => (
                    <div
                      key={idx}
                      className="py-2.5 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px] flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-gray-900">
                          {prod.product_name}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-gray-900 block">
                          {prod.total_quantity_sold} unidade(s)
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {formatBRL(prod.total_cents)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bottom Row: Low Stock Alerts */}
          <div className="bg-white p-6 rounded-3xl border border-amber-200 shadow-2xs">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-gray-900">
                  Alertas de Estoque Baixo ou Crítico
                </h3>
              </div>
              <button
                onClick={onNavigateToProducts}
                className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
              >
                Gerenciar no Estoque →
              </button>
            </div>

            {data.low_stock_items?.length === 0 ? (
              <div className="py-6 text-center text-xs text-emerald-700 bg-emerald-50 rounded-2xl">
                ✓ Todos os produtos estão com níveis de estoque acima do mínimo
                configurado!
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                {data.low_stock_items?.map((item: any) => (
                  <div
                    key={item.id}
                    className="p-3 bg-amber-50/50 rounded-2xl border border-amber-200 flex items-center justify-between"
                  >
                    <div>
                      <h4 className="font-bold text-gray-900">
                        {item.product_name}
                      </h4>
                      <p className="text-[11px] text-gray-500">
                        Tam: <strong>{item.size}</strong> | Cor:{" "}
                        <strong>{item.color}</strong>
                      </p>
                      {item.reference && (
                        <p className="text-[10px] text-gray-400 font-mono">
                          Ref: {item.reference}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <span
                        className={`font-black text-sm block ${
                          item.stock <= 0 ? "text-red-700" : "text-amber-800"
                        }`}
                      >
                        {item.stock} un.
                      </span>
                      <span className="text-[9px] text-gray-400">
                        Mín: {item.min_stock}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
