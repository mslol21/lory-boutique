import { Dialog } from "./Dialog";
import React, { useState, useEffect } from "react";
import { Product, Variation, Category, User } from "../types";
import { apiRequest, formatBRL } from "../services/api";
import {
  Plus,
  Search,
  Shirt,
  Edit2,
  Trash2,
  Archive,
  Layers,
  ArrowUpDown,
  History,
  AlertTriangle,
  Check,
  X,
  Sparkles,
  Lock,
  Eye,
  EyeOff,
} from "lucide-react";

interface ProductsManagerProps {
  currentUser: User | null;
}

export const ProductsManager: React.FC<ProductsManagerProps> = ({
  currentUser,
}) => {
  const isAdmin = currentUser?.role === "admin";
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "active" | "archived" | "all"
  >("active");

  // Modals
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  // Stock Movement State
  const [stockTargetVariation, setStockTargetVariation] = useState<{
    variation: Variation;
    productName: string;
  } | null>(null);
  const [movementType, setMovementType] = useState<"in" | "out" | "adjust">(
    "in",
  );
  const [movementQty, setMovementQty] = useState<number>(1);
  const [movementReason, setMovementReason] = useState("");
  const [movementHistory, setMovementHistory] = useState<any[]>([]);

  // Product Form State
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formReference, setFormReference] = useState("");
  const [formCostPrice, setFormCostPrice] = useState<string>("0.00");
  const [formSalePrice, setFormSalePrice] = useState<string>("0.00");
  const [formPromoPrice, setFormPromoPrice] = useState<string>("");
  const [formImages, setFormImages] = useState<string[]>([]);
  const [formNewImageUrl, setFormNewImageUrl] = useState("");
  const [formIsShowcase, setFormIsShowcase] = useState(true);

  // Form Variations
  const [formVariations, setFormVariations] = useState<
    {
      id?: string;
      size: string;
      color: string;
      sku: string;
      barcode: string;
      stock: number;
      min_stock: number;
    }[]
  >([{ size: "", color: "", sku: "", barcode: "", stock: 0, min_stock: 1 }]);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const [prodsRes, catsRes] = await Promise.all([
        apiRequest<Product[]>(
          `/products${statusFilter === "all" ? "" : `?status=${statusFilter}`}`,
        ),
        apiRequest<Category[]>("/products/categories"),
      ]);
      setProducts(prodsRes);
      setCategories(catsRes);
    } catch (err: any) {
      showToast("error", err.message || "Falha ao carregar produtos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [statusFilter]);

  const showToast = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3500);
  };

  // Open New Product Modal
  const openNewProductModal = () => {
    setEditingProductId(null);
    setFormName("");
    setFormDesc("");
    setFormCategory(categories[0]?.id || "");
    setFormReference("");
    setFormCostPrice("0.00");
    setFormSalePrice("0.00");
    setFormPromoPrice("");
    setFormImages([]);
    setFormIsShowcase(true);
    setFormVariations([
      { size: "", color: "", sku: "", barcode: "", stock: 0, min_stock: 1 },
    ]);
    setIsProductModalOpen(true);
  };

  const editProduct = (p: Product) => {
    setEditingProductId(p.id);
    setFormName(p.name);
    setFormDesc(p.description);
    setFormCategory(p.category_id || "");
    setFormReference(p.reference || "");
    setFormCostPrice(((p.cost_price_cents || 0) / 100).toFixed(2));
    setFormSalePrice((p.sale_price_cents / 100).toFixed(2));
    setFormPromoPrice(
      p.promo_price_cents == null ? "" : (p.promo_price_cents / 100).toFixed(2),
    );
    setFormImages(p.images);
    setFormIsShowcase(Boolean(p.is_showcase));
    setFormVariations(
      p.variations.map((v) => ({
        ...v,
        sku: v.sku || "",
        barcode: v.barcode || "",
      })),
    );
    setIsProductModalOpen(true);
  };
  const createCategory = async () => {
    try {
      const category = await apiRequest<Category>("/products/categories", {
        method: "POST",
        body: JSON.stringify({ name: newCategory }),
      });
      setCategories((prev) => [...prev, category]);
      setFormCategory(category.id);
      setNewCategory("");
    } catch (err: any) {
      showToast("error", err.message);
    }
  };
  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
          throw new Error("Use JPEG, PNG ou WebP.");
        const bitmap = await createImageBitmap(file);
        const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * ratio);
        canvas.height = Math.round(bitmap.height * ratio);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Não foi possível preparar a foto.");
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const res = await apiRequest<{ url: string }>(
          "/products/images/upload",
          {
            method: "POST",
            body: JSON.stringify({
              data: canvas.toDataURL("image/jpeg", 0.85),
            }),
          },
        );
        urls.push(res.url);
      }
      setFormImages((prev) => [...prev, ...urls]);
    } catch (err: any) {
      showToast("error", err.message);
    } finally {
      setUploading(false);
    }
  };
  // Add variation row in form
  const addVariationRow = () => {
    setFormVariations([
      ...formVariations,
      { size: "", color: "", sku: "", barcode: "", stock: 0, min_stock: 1 },
    ]);
  };

  const updateVariationRow = (idx: number, field: string, val: any) => {
    const updated = [...formVariations];
    updated[idx] = { ...updated[idx], [field]: val };
    setFormVariations(updated);
  };

  const removeVariationRow = (idx: number) => {
    if (formVariations.length <= 1 || formVariations[idx].id) return;
    setFormVariations(formVariations.filter((_, i) => i !== idx));
  };

  const addImageUrl = () => {
    if (formNewImageUrl && formNewImageUrl.trim()) {
      setFormImages([...formImages, formNewImageUrl.trim()]);
      setFormNewImageUrl("");
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || uploading) return;
    setSaving(true);
    try {
      const payload = {
        name: formName,
        description: formDesc,
        category_id: formCategory || null,
        reference: formReference || null,
        cost_price_cents: Math.round(parseFloat(formCostPrice || "0") * 100),
        sale_price_cents: Math.round(parseFloat(formSalePrice || "0") * 100),
        promo_price_cents: formPromoPrice
          ? Math.round(parseFloat(formPromoPrice) * 100)
          : null,
        images: formImages,
        is_showcase: formIsShowcase ? 1 : 0,
        variations: formVariations,
      };

      if (editingProductId) {
        await apiRequest(`/products/${editingProductId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        showToast("success", "Produto atualizado com sucesso!");
      } else {
        await apiRequest("/products", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showToast("success", "Produto e variações cadastrados com sucesso!");
      }

      setIsProductModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      showToast("error", err.message || "Erro ao salvar produto.");
    } finally {
      setSaving(false);
    }
  };

  // Archive / Delete product
  const handleDeleteProduct = async (id: string, name: string) => {
    if (
      !window.confirm(
        `Tem certeza que deseja arquivar ou remover o produto "${name}"?`,
      )
    ) {
      return;
    }

    try {
      const res = await apiRequest<{ message: string; archived: boolean }>(
        `/products/${id}`,
        {
          method: "DELETE",
        },
      );
      showToast("success", res.message);
      fetchProducts();
    } catch (err: any) {
      showToast("error", err.message);
    }
  };

  // Stock Movement handling
  const openStockMovementModal = (
    variation: Variation,
    productName: string,
  ) => {
    setStockTargetVariation({ variation, productName });
    setMovementType("in");
    setMovementQty(1);
    setMovementReason("Entrada de nova grade");
    setIsStockModalOpen(true);
  };

  const handleSaveStockMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockTargetVariation) return;

    try {
      await apiRequest("/products/stock/movement", {
        method: "POST",
        body: JSON.stringify({
          variation_id: stockTargetVariation.variation.id,
          type: movementType,
          quantity: movementQty,
          reason: movementReason,
        }),
      });

      showToast("success", "Movimentação de estoque registrada com sucesso!");
      setIsStockModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      showToast("error", err.message || "Erro ao movimentar estoque.");
    }
  };

  // View Stock History
  const openHistoryModal = async (variationId?: string) => {
    try {
      const res = await apiRequest<any[]>(
        `/products/stock/history${variationId ? `?variation_id=${variationId}` : ""}`,
      );
      setMovementHistory(res);
      setIsHistoryModalOpen(true);
    } catch (err: any) {
      showToast("error", err.message);
    }
  };

  const filteredProducts = products.filter((p) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      p.name.toLowerCase().includes(term) ||
      p.reference?.toLowerCase().includes(term) ||
      p.variations.some(
        (v) =>
          v.sku?.toLowerCase().includes(term) ||
          v.barcode?.toLowerCase().includes(term) ||
          v.color.toLowerCase().includes(term),
      )
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in ${
            notification.type === "success"
              ? "bg-emerald-900 text-white"
              : "bg-red-900 text-white"
          }`}
        >
          {notification.type === "success" ? (
            <Check className="w-4 h-4" />
          ) : (
            <X className="w-4 h-4" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-gray-900">
            Produtos & Estoque
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Gerenciamento de peças, grade de tamanhos, cores e movimentações
            rastreadas
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => openHistoryModal()}
            className="px-3.5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-2xl shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <History className="w-4 h-4 text-gray-500" />
            <span>Histórico de Movimentações</span>
          </button>

          {isAdmin && (
            <button
              onClick={openNewProductModal}
              className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-2xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Cadastrar Nova Peça</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-3xl border border-gray-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, referência, SKU ou cor..."
            className="w-full pl-10 pr-4 py-2 bg-gray-50 text-xs rounded-xl border border-gray-200 focus:outline-hidden focus:border-brand-400"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700"
          >
            <option value="active">Ativos</option>
            <option value="archived">Arquivados</option>
            <option value="all">Todos</option>
          </select>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Peça</th>
                <th className="py-3 px-4">Referência / Categoria</th>
                {isAdmin && <th className="py-3 px-4 text-right">Custo</th>}
                <th className="py-3 px-4 text-right">Preço Venda</th>
                <th className="py-3 px-4">Grade & Estoque</th>
                <th className="py-3 px-4 text-center">Vitrine</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    Carregando estoque da loja...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    Nenhum produto cadastrado com os filtros atuais.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((prod) => {
                  const totalStock = prod.variations.reduce(
                    (sum, v) => sum + v.stock,
                    0,
                  );

                  return (
                    <tr
                      key={prod.id}
                      className="hover:bg-brand-50/30 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-12 rounded-lg overflow-hidden bg-brand-50 shrink-0 border border-gray-200">
                            {prod.images && prod.images[0] ? (
                              <img
                                src={prod.images[0]}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">
                                Sem foto
                              </div>
                            )}
                          </div>
                          <div>
                            <span className="font-bold text-gray-900 block">
                              {prod.name}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {prod.status === "archived"
                                ? "Arquivado"
                                : "Ativo"}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-mono text-gray-700 block">
                          {prod.reference || "-"}
                        </span>
                        <span className="text-[11px] text-gray-500">
                          {prod.category_name || "-"}
                        </span>
                      </td>

                      {isAdmin && (
                        <td className="py-3.5 px-4 text-right font-medium text-gray-600">
                          {formatBRL(prod.cost_price_cents)}
                        </td>
                      )}

                      <td className="py-3.5 px-4 text-right">
                        {prod.promo_price_cents ? (
                          <div>
                            <span className="font-bold text-gray-900 block">
                              {formatBRL(prod.promo_price_cents)}
                            </span>
                            <span className="text-[10px] text-gray-400 line-through">
                              {formatBRL(prod.sale_price_cents)}
                            </span>
                          </div>
                        ) : (
                          <span className="font-bold text-gray-900">
                            {formatBRL(prod.sale_price_cents)}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1.5 max-w-xs">
                          {prod.variations.map((v) => (
                            <button
                              key={v.id}
                              disabled={!isAdmin}
                              onClick={() =>
                                openStockMovementModal(v, prod.name)
                              }
                              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border cursor-pointer hover:scale-105 transition-transform ${
                                v.stock <= 0
                                  ? "bg-red-50 border-red-200 text-red-700"
                                  : v.stock <= v.min_stock
                                    ? "bg-amber-50 border-amber-200 text-amber-800"
                                    : "bg-emerald-50 border-emerald-200 text-emerald-800"
                              }`}
                              title={`Clique para movimentar estoque (${v.sku || "Sem SKU"})`}
                            >
                              {v.size}/{v.color}: <strong>{v.stock}</strong>
                            </button>
                          ))}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {prod.is_showcase ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-100 text-brand-800">
                            Visível
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600">
                            Oculto
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right space-x-2">
                        {isAdmin && (
                          <button
                            onClick={() => editProduct(prod)}
                            aria-label={`Editar ${prod.name}`}
                            className="p-2 text-brand-700"
                          >
                            <Edit2 className="w-4 h-4" /> Editar
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() =>
                              handleDeleteProduct(prod.id, prod.name)
                            }
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Arquivar / Remover"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New/Edit Product Modal */}
      {isProductModalOpen && (
        <Dialog className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full overflow-hidden border border-brand-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 bg-brand-50 border-b border-brand-100 flex items-center justify-between">
              <h3 className="font-serif font-bold text-gray-900 text-lg">
                {editingProductId
                  ? "Editar Peça e Grade"
                  : "Cadastrar Nova Peça no Estoque"}
              </h3>
              <button
                data-dialog-close
                aria-label="Fechar janela"
                onClick={() => setIsProductModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSaveProduct}
              className="p-6 space-y-5 max-h-[80vh] overflow-y-auto text-xs"
            >
              {/* Product Basic Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-gray-700 mb-1">
                    Nome da Peça *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="ex: Vestido Midi Canelado Manga Curta"
                    className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 focus:outline-hidden focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Categoria *
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 focus:outline-hidden focus:border-brand-500"
                  >
                    <option value="">Sem categoria</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2 flex gap-2">
                  <input
                    aria-label="Nova categoria"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="Nome de nova categoria"
                    className="border rounded-lg px-3 py-2"
                  />
                  <button
                    type="button"
                    onClick={createCategory}
                    disabled={!newCategory.trim()}
                  >
                    Criar categoria
                  </button>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Referência / Código Interno
                  </label>
                  <input
                    type="text"
                    value={formReference}
                    onChange={(e) => setFormReference(e.target.value)}
                    placeholder="ex: VMD-001"
                    className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 focus:outline-hidden focus:border-brand-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold text-gray-700 mb-1">
                    Descrição Detalhada
                  </label>
                  <textarea
                    rows={2}
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    placeholder="Detalhes sobre o tecido, caimento, acabamento..."
                    className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 focus:outline-hidden focus:border-brand-500"
                  />
                </div>
              </div>

              {/* Pricing Grid */}
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 grid grid-cols-1 sm:grid-cols-3 gap-4">
                {isAdmin ? (
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">
                      Preço de Custo (R$) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={formCostPrice}
                      onChange={(e) => setFormCostPrice(e.target.value)}
                      className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 font-bold"
                    />
                    <span className="text-[10px] text-gray-400">
                      Visível apenas para Administradores
                    </span>
                  </div>
                ) : null}

                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Preço de Venda (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formSalePrice}
                    onChange={(e) => setFormSalePrice(e.target.value)}
                    className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 font-bold text-gray-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Preço Promocional (R$) (Opcional)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formPromoPrice}
                    onChange={(e) => setFormPromoPrice(e.target.value)}
                    placeholder="Deixe em branco se não houver"
                    className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300"
                  />
                </div>
              </div>

              {/* Images List */}
              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Fotos do Produto
                </label>
                <label className="block mb-3">
                  Enviar fotos do celular ou computador
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    disabled={uploading}
                    onChange={(e) => {
                      uploadPhotos(e.target.files);
                      e.target.value = "";
                    }}
                    className="block mt-2"
                  />
                </label>
                {uploading && (
                  <p role="status">Preparando e enviando fotos...</p>
                )}
                <div className="flex gap-2 mb-2">
                  <input
                    type="url"
                    value={formNewImageUrl}
                    onChange={(e) => setFormNewImageUrl(e.target.value)}
                    placeholder="https://exemplo.com/imagem.jpg"
                    className="flex-1 px-3 py-1.5 bg-white rounded-xl border border-gray-300 text-xs"
                  />
                  <button
                    type="button"
                    onClick={addImageUrl}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold"
                  >
                    Adicionar Foto
                  </button>
                </div>
                <div className="flex gap-2 overflow-x-auto">
                  {formImages.map((img, idx) => (
                    <div
                      key={idx}
                      className="relative w-16 h-20 rounded-lg overflow-hidden border"
                    >
                      <img
                        src={img}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setFormImages(formImages.filter((_, i) => i !== idx))
                        }
                        className="absolute top-0 right-0 bg-red-600 text-white p-0.5 rounded-bl"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Variations Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-gray-700">
                    Grade de Tamanhos & Cores (Estoque Independente)
                  </label>
                  <button
                    type="button"
                    onClick={addVariationRow}
                    className="text-xs font-bold text-brand-600 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar Variação
                  </button>
                </div>

                <div className="space-y-2">
                  {formVariations.map((v, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-gray-50 rounded-2xl border border-gray-200 grid grid-cols-2 sm:grid-cols-6 gap-2 items-center"
                    >
                      <div>
                        <label className="text-[10px] text-gray-500 block">
                          Tamanho *
                        </label>
                        <input
                          type="text"
                          required
                          value={v.size}
                          onChange={(e) =>
                            updateVariationRow(idx, "size", e.target.value)
                          }
                          placeholder="P, M, G, 38..."
                          className="w-full px-2 py-1 bg-white border border-gray-300 rounded-lg text-xs"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-gray-500 block">
                          Cor *
                        </label>
                        <input
                          type="text"
                          required
                          value={v.color}
                          onChange={(e) =>
                            updateVariationRow(idx, "color", e.target.value)
                          }
                          placeholder="Rosa, Preto..."
                          className="w-full px-2 py-1 bg-white border border-gray-300 rounded-lg text-xs"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-gray-500 block">
                          SKU
                        </label>
                        <input
                          type="text"
                          value={v.sku}
                          onChange={(e) =>
                            updateVariationRow(idx, "sku", e.target.value)
                          }
                          placeholder="SKU-001"
                          className="w-full px-2 py-1 bg-white border border-gray-300 rounded-lg text-xs"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-gray-500 block">
                          Estoque Inicial
                        </label>
                        <input
                          type="number"
                          min="0"
                          disabled={Boolean(v.id)}
                          value={v.stock}
                          onChange={(e) =>
                            updateVariationRow(
                              idx,
                              "stock",
                              parseInt(e.target.value) || 0,
                            )
                          }
                          className="w-full px-2 py-1 bg-white border border-gray-300 rounded-lg text-xs font-bold"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-gray-500 block">
                          Estoque Mín.
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={v.min_stock}
                          onChange={(e) =>
                            updateVariationRow(
                              idx,
                              "min_stock",
                              parseInt(e.target.value) || 0,
                            )
                          }
                          className="w-full px-2 py-1 bg-white border border-gray-300 rounded-lg text-xs"
                        />
                      </div>

                      <div className="flex justify-end pt-3">
                        <button
                          type="button"
                          disabled={Boolean(v.id)}
                          aria-label="Remover variação"
                          onClick={() => removeVariationRow(idx)}
                          className="p-1.5 text-gray-400 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Showcase visibility checkbox */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="showcase_check"
                  checked={formIsShowcase}
                  onChange={(e) => setFormIsShowcase(e.target.checked)}
                  className="rounded text-brand-600 focus:ring-brand-500"
                />
                <label
                  htmlFor="showcase_check"
                  className="font-semibold text-gray-700 cursor-pointer"
                >
                  Exibir esta peça na vitrine pública online para consulta no
                  WhatsApp
                </label>
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || uploading}
                  className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold shadow-xs cursor-pointer"
                >
                  Salvar Peça no Estoque
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* Stock Movement Modal (Entrada, Saída, Ajuste de Inventário) */}
      {isStockModalOpen && stockTargetVariation && (
        <Dialog className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-brand-100 p-6">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
              <div>
                <h3 className="font-bold text-gray-900 text-base">
                  Movimentar Estoque
                </h3>
                <p className="text-xs text-gray-500">
                  {stockTargetVariation.productName} (
                  {stockTargetVariation.variation.size} /{" "}
                  {stockTargetVariation.variation.color})
                </p>
              </div>
              <button
                data-dialog-close
                aria-label="Fechar janela"
                onClick={() => setIsStockModalOpen(false)}
                className="text-gray-400 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSaveStockMovement}
              className="space-y-4 text-xs"
            >
              <div className="p-3 bg-gray-50 rounded-xl flex justify-between">
                <span className="text-gray-600">Estoque Atual em Sistema:</span>
                <span className="font-bold text-gray-900 text-sm">
                  {stockTargetVariation.variation.stock} unidades
                </span>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Tipo de Movimentação *
                </label>
                <select
                  value={movementType}
                  onChange={(e) => setMovementType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 font-semibold"
                >
                  <option value="in">Entrada de Mercadoria (+)</option>
                  <option value="out">Saída / Perda / Baixa (-)</option>
                  <option value="adjust">
                    Ajuste de Inventário (Definir novo saldo)
                  </option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  {movementType === "adjust"
                    ? "Novo Saldo Contado em Loja *"
                    : "Quantidade *"}
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={movementQty}
                  onChange={(e) =>
                    setMovementQty(parseInt(e.target.value) || 0)
                  }
                  className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 font-bold text-sm"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Justificativa / Motivo *
                </label>
                <input
                  type="text"
                  required
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  placeholder="ex: Chegada de novas peças da confecção"
                  className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300"
                />
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsStockModalOpen(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || uploading}
                  className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold shadow-xs cursor-pointer"
                >
                  Confirmar Movimentação
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* Movement History Log Modal */}
      {isHistoryModalOpen && (
        <Dialog className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-brand-100 p-6 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
              <h3 className="font-bold text-gray-900 text-base">
                Histórico de Movimentações de Estoque
              </h3>
              <button
                data-dialog-close
                aria-label="Fechar janela"
                onClick={() => setIsHistoryModalOpen(false)}
                className="text-gray-400 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-2 text-xs">
              {movementHistory.length === 0 ? (
                <p className="text-center py-8 text-gray-400">
                  Nenhuma movimentação registrada.
                </p>
              ) : (
                movementHistory.map((h) => (
                  <div
                    key={h.id}
                    className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex justify-between items-center"
                  >
                    <div>
                      <span className="font-bold text-gray-900 block">
                        {h.product_name} ({h.size}/{h.color})
                      </span>
                      <span className="text-[11px] text-gray-500">
                        Motivo: {h.reason} • Por: {h.user_name}
                      </span>
                    </div>
                    <div className="text-right">
                      <span
                        className={`font-bold block ${h.quantity >= 0 ? "text-emerald-700" : "text-red-700"}`}
                      >
                        {h.quantity > 0 ? `+${h.quantity}` : h.quantity} un.
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {h.previous_stock} → {h.new_stock}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};
