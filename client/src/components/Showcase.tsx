import React, { useState, useEffect } from 'react';
import { PublicProduct, Category, StoreSettings, InterestItem } from '../types';
import { apiRequest, formatBRL } from '../services/api';
import {
  Search,
  Filter,
  Heart,
  MessageCircle,
  MapPin,
  ShoppingBag,
  Sparkles,
  ChevronRight,
  Check,
  X,
  Plus,
  Minus,
  Trash2,
  AlertCircle,
  Store
} from 'lucide-react';

const InstagramIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
  </svg>
);

interface ShowcaseProps {
  settings: StoreSettings | null;
  interestList: InterestItem[];
  setInterestList: React.Dispatch<React.SetStateAction<InterestItem[]>>;
  isInterestDrawerOpen: boolean;
  setIsInterestDrawerOpen: (open: boolean) => void;
}

export const Showcase: React.FC<ShowcaseProps> = ({
  settings,
  interestList,
  setInterestList,
  isInterestDrawerOpen,
  setIsInterestDrawerOpen,
}) => {
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [priceRange, setPriceRange] = useState<string>('');

  // Selected product modal
  const [activeProduct, setActiveProduct] = useState<PublicProduct | null>(null);
  const [modalSize, setModalSize] = useState<string>('');
  const [modalColor, setModalColor] = useState<string>('');
  const [modalActiveImageIdx, setModalActiveImageIdx] = useState(0);

  // Success toast when adding to interest list
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchShowcaseData = async () => {
    setLoading(true);
    try {
      const [catsRes, prodsRes] = await Promise.all([
        apiRequest<Category[]>('/public/categories'),
        apiRequest<PublicProduct[]>('/public/products')
      ]);
      setCategories(catsRes);
      setProducts(prodsRes);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar catálogo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShowcaseData();
  }, []);

  // Filter products locally for instantaneous UI response
  const filteredProducts = products.filter((prod) => {
    if (selectedCategory && prod.category_id !== selectedCategory) {
      return false;
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchName = prod.name.toLowerCase().includes(term);
      const matchRef = prod.reference?.toLowerCase().includes(term);
      const matchDesc = prod.description.toLowerCase().includes(term);
      if (!matchName && !matchRef && !matchDesc) return false;
    }

    if (selectedSize) {
      const hasSize = prod.variations.some((v) => v.size === selectedSize && v.available);
      if (!hasSize) return false;
    }

    if (selectedColor) {
      const hasColor = prod.variations.some((v) => v.color.toLowerCase() === selectedColor.toLowerCase() && v.available);
      if (!hasColor) return false;
    }

    if (priceRange) {
      const effectivePrice = prod.promo_price_cents || prod.sale_price_cents;
      if (priceRange === 'under100' && effectivePrice >= 10000) return false;
      if (priceRange === '100to150' && (effectivePrice < 10000 || effectivePrice > 15000)) return false;
      if (priceRange === 'above150' && effectivePrice <= 15000) return false;
    }

    return true;
  });

  // Extract unique available sizes and colors for filter badges
  const availableSizes = Array.from(
    new Set(products.flatMap((p) => p.variations.filter(v => v.available).map((v) => v.size)))
  ).sort();

  const availableColors = Array.from(
    new Set(products.flatMap((p) => p.variations.filter(v => v.available).map((v) => v.color)))
  ).sort();

  const openProductDetail = (p: PublicProduct) => {
    setActiveProduct(p);
    setModalActiveImageIdx(0);
    // Auto-select first available variation
    const firstAvailable = p.variations.find((v) => v.available);
    if (firstAvailable) {
      setModalSize(firstAvailable.size);
      setModalColor(firstAvailable.color);
    } else if (p.variations.length > 0) {
      setModalSize(p.variations[0].size);
      setModalColor(p.variations[0].color);
    }
  };

  const addToInterest = (product: PublicProduct, size: string, color: string) => {
    if (!size || !color) return;

    setInterestList((prev) => {
      const existingIdx = prev.findIndex(
        (it) => it.product_id === product.id && it.size === size && it.color === color
      );

      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx].quantity += 1;
        return updated;
      }

      const effectivePrice = product.promo_price_cents || product.sale_price_cents;
      const newItem: InterestItem = {
        product_id: product.id,
        product_name: product.name,
        reference: product.reference,
        size,
        color,
        unit_price_cents: effectivePrice,
        quantity: 1,
        image: product.images[0] || '',
      };
      return [...prev, newItem];
    });

    setToastMessage(`"${product.name}" adicionado à sua lista de interesse!`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const updateInterestQty = (index: number, delta: number) => {
    setInterestList((prev) => {
      const updated = [...prev];
      const newQty = updated[index].quantity + delta;
      if (newQty <= 0) {
        return updated.filter((_, i) => i !== index);
      }
      updated[index].quantity = newQty;
      return updated;
    });
  };

  const removeInterestItem = (index: number) => {
    setInterestList((prev) => prev.filter((_, i) => i !== index));
  };

  // Build formatted WhatsApp message as required
  const generateWhatsAppMessage = () => {
    if (interestList.length === 0) return '';

    const lines: string[] = [
      'Olá, Lory Boutique! 💕',
      'Gostaria de consultar a disponibilidade das seguintes peças para retirada na loja física:',
      ''
    ];

    let totalEstimated = 0;

    interestList.forEach((it, idx) => {
      const lineTotal = it.unit_price_cents * it.quantity;
      totalEstimated += lineTotal;
      const refText = it.reference ? ` (Ref: ${it.reference})` : '';
      lines.push(
        `${idx + 1}. *${it.product_name}*${refText}`
      );
      lines.push(`   - Tamanho: ${it.size} | Cor: ${it.color}`);
      lines.push(`   - Quantidade: ${it.quantity} un.`);
      lines.push(`   - Valor: ${formatBRL(lineTotal)}`);
      lines.push('');
    });

    lines.push(`*Total estimado:* ${formatBRL(totalEstimated)}`);
    lines.push('');
    lines.push('Vi as peças na vitrine online e gostaria de confirmar para retirada no endereço:');
    lines.push(`📍 ${settings?.address || 'Rua Hipólito de Camargo, 45 — Guaianases, São Paulo/SP'}`);
    lines.push('');
    lines.push('_Compreendo que este contato é para consulta de disponibilidade na loja física._');

    return encodeURIComponent(lines.join('\n'));
  };

  const sendWhatsAppConsultation = () => {
    const rawNumber = settings?.whatsapp_raw || '5511949611902';
    const msg = generateWhatsAppMessage();
    const url = `https://wa.me/${rawNumber}?text=${msg}`;
    window.open(url, '_blank');
  };

  const totalInterestCents = interestList.reduce(
    (sum, it) => sum + it.unit_price_cents * it.quantity,
    0
  );

  return (
    <div className="min-h-screen bg-[#faf7f8] text-gray-800">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-medium animate-in fade-in slide-in-from-bottom-5">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-rose-100/70 via-rose-50/40 to-[#faf7f8] pt-12 pb-16 px-4 sm:px-6 lg:px-8 border-b border-rose-100/50">
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/80 backdrop-blur-xs border border-rose-200 text-rose-800 text-xs font-medium mb-6 shadow-2xs">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>Coleção Feminina com Detalhes Exclusivos</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-bold text-gray-950 tracking-tight leading-tight">
            Elegância, leveza & estilo contemporâneo.
          </h1>

          <p className="mt-4 text-base sm:text-lg text-gray-600 max-w-2xl mx-auto font-light leading-relaxed">
            Peças selecionadas para valorizar sua beleza no dia a dia e em momentos especiais.
            Consulte disponibilidade online e retire com conforto em nossa loja física em Guaianases.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => {
                const el = document.getElementById('catalogo-vitrine');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white font-medium text-sm rounded-2xl shadow-sm transition-all transform hover:-translate-y-0.5 cursor-pointer flex items-center gap-2"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Explorar Vitrine</span>
            </button>

            <a
              href={settings?.whatsapp ? `https://wa.me/${settings.whatsapp_raw}` : 'https://wa.me/5511949611902'}
              target="_blank"
              rel="noreferrer"
              className="px-6 py-3 bg-white hover:bg-rose-50 border border-rose-200 text-rose-800 font-medium text-sm rounded-2xl shadow-2xs transition-all cursor-pointer flex items-center gap-2"
            >
              <MessageCircle className="w-4 h-4 text-emerald-600" />
              <span>Chamar no WhatsApp</span>
            </a>
          </div>

          {/* Boutique operational badges */}
          <div className="mt-10 pt-8 border-t border-rose-200/60 max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
            <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/70 border border-rose-100">
              <div className="p-2 rounded-xl bg-rose-100/80 text-rose-700 shrink-0">
                <Store className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-gray-900">Retirada na Loja</h4>
                <p className="text-[11px] text-gray-500 leading-snug">Rua Hipólito de Camargo, 45 — Guaianases</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/70 border border-rose-100">
              <div className="p-2 rounded-xl bg-amber-100/80 text-amber-800 shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-gray-900">Venda no Balcão</h4>
                <p className="text-[11px] text-gray-500 leading-snug">Atendimento humanizado e peças pronta entrega</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/70 border border-rose-100">
              <div className="p-2 rounded-xl bg-emerald-100/80 text-emerald-800 shrink-0">
                <MessageCircle className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-gray-900">Consulta Rápida</h4>
                <p className="text-[11px] text-gray-500 leading-snug">Separe seu interesse e consulte no WhatsApp</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Showcase Catalog Section */}
      <section id="catalogo-vitrine" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Search & Categories Bar */}
        <div className="space-y-4 mb-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por blusa, vestido, referência..."
                className="w-full pl-10 pr-4 py-2.5 bg-white text-sm rounded-2xl border border-rose-200 focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 shadow-2xs transition-colors"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Quick Filters */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {/* Size Select */}
              <select
                value={selectedSize}
                onChange={(e) => setSelectedSize(e.target.value)}
                className="px-3 py-2 bg-white text-xs font-medium rounded-xl border border-rose-200 focus:outline-hidden focus:border-rose-500 text-gray-700 shadow-2xs"
              >
                <option value="">Todos os Tamanhos</option>
                {availableSizes.map((s) => (
                  <option key={s} value={s}>
                    Tamanho {s}
                  </option>
                ))}
              </select>

              {/* Color Select */}
              <select
                value={selectedColor}
                onChange={(e) => setSelectedColor(e.target.value)}
                className="px-3 py-2 bg-white text-xs font-medium rounded-xl border border-rose-200 focus:outline-hidden focus:border-rose-500 text-gray-700 shadow-2xs"
              >
                <option value="">Todas as Cores</option>
                {availableColors.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              {/* Price Select */}
              <select
                value={priceRange}
                onChange={(e) => setPriceRange(e.target.value)}
                className="px-3 py-2 bg-white text-xs font-medium rounded-xl border border-rose-200 focus:outline-hidden focus:border-rose-500 text-gray-700 shadow-2xs"
              >
                <option value="">Qualquer Preço</option>
                <option value="under100">Até R$ 99,99</option>
                <option value="100to150">R$ 100,00 a R$ 150,00</option>
                <option value="above150">Acima de R$ 150,00</option>
              </select>

              {(selectedCategory || selectedSize || selectedColor || priceRange || searchTerm) && (
                <button
                  onClick={() => {
                    setSelectedCategory('');
                    setSelectedSize('');
                    setSelectedColor('');
                    setPriceRange('');
                    setSearchTerm('');
                  }}
                  className="px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                >
                  Limpar Filtros
                </button>
              )}
            </div>
          </div>

          {/* Categories Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            <button
              onClick={() => setSelectedCategory('')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === ''
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-white text-gray-700 border border-rose-100 hover:border-rose-300'
              }`}
            >
              Todas as Peças ({products.length})
            </button>
            {categories.map((cat) => {
              const count = products.filter((p) => p.category_id === cat.id).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-white text-gray-700 border border-rose-100 hover:border-rose-300'
                  }`}
                >
                  {cat.name} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Product Grid */}
        {loading ? (
          <div className="py-24 text-center">
            <div className="w-10 h-10 border-3 border-rose-200 border-t-rose-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-gray-500 font-medium">Carregando coleção da boutique...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-3xl border border-rose-100 p-8 max-w-md mx-auto">
            <AlertCircle className="w-10 h-10 text-rose-300 mx-auto mb-3" />
            <h3 className="text-base font-serif font-bold text-gray-800">Nenhuma peça encontrada</h3>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              Tente ajustar os filtros ou os termos pesquisados.
            </p>
            <button
              onClick={() => {
                setSelectedCategory('');
                setSelectedSize('');
                setSelectedColor('');
                setPriceRange('');
                setSearchTerm('');
              }}
              className="px-4 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Ver Todas as Peças
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProducts.map((prod) => {
              const primaryImage =
                prod.images[0] ||
                'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&auto=format&fit=crop&q=80';
              const isPromo = prod.promo_price_cents && prod.promo_price_cents < prod.sale_price_cents;
              const effectivePrice = isPromo ? prod.promo_price_cents! : prod.sale_price_cents;

              const availableVariations = prod.variations.filter((v) => v.available);
              const uniqueSizes = Array.from(new Set(availableVariations.map((v) => v.size)));

              return (
                <div
                  key={prod.id}
                  className="group bg-white rounded-3xl border border-rose-100 overflow-hidden shadow-2xs hover:shadow-lg transition-all duration-300 flex flex-col"
                >
                  {/* Image container */}
                  <div
                    onClick={() => openProductDetail(prod)}
                    className="relative aspect-4/5 overflow-hidden bg-rose-50/50 cursor-pointer"
                  >
                    <img
                      src={primaryImage}
                      alt={prod.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />

                    {/* Badges */}
                    <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                      {isPromo && (
                        <span className="px-2.5 py-1 bg-amber-500 text-white text-[10px] font-bold rounded-lg uppercase tracking-wider shadow-xs">
                          Promoção
                        </span>
                      )}
                      {!prod.is_available && (
                        <span className="px-2.5 py-1 bg-gray-900/80 text-white text-[10px] font-semibold rounded-lg uppercase tracking-wider">
                          Esgotado
                        </span>
                      )}
                    </div>

                    {prod.reference && (
                      <span className="absolute bottom-3 left-3 px-2 py-0.5 bg-black/50 text-white text-[9px] font-mono rounded backdrop-blur-xs">
                        Ref: {prod.reference}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      {prod.category_name && (
                        <p className="text-[10px] font-bold uppercase tracking-wider text-rose-500 mb-1">
                          {prod.category_name}
                        </p>
                      )}
                      <h3
                        onClick={() => openProductDetail(prod)}
                        className="font-serif font-bold text-gray-900 text-base group-hover:text-rose-700 transition-colors cursor-pointer line-clamp-1"
                      >
                        {prod.name}
                      </h3>
                      <p className="text-xs text-gray-500 line-clamp-2 mt-1 font-light leading-relaxed">
                        {prod.description}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-rose-100/60">
                      {/* Price & Sizes */}
                      <div className="flex items-baseline justify-between mb-3">
                        <div>
                          {isPromo ? (
                            <div className="flex items-center gap-2">
                              <span className="text-base font-bold text-gray-950 font-serif">
                                {formatBRL(effectivePrice)}
                              </span>
                              <span className="text-xs text-gray-400 line-through">
                                {formatBRL(prod.sale_price_cents)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-base font-bold text-gray-950 font-serif">
                              {formatBRL(effectivePrice)}
                            </span>
                          )}
                        </div>

                        {uniqueSizes.length > 0 && (
                          <div className="flex items-center gap-1">
                            {uniqueSizes.slice(0, 3).map((s) => (
                              <span
                                key={s}
                                className="px-1.5 py-0.5 bg-rose-50 text-rose-800 text-[10px] font-semibold rounded"
                              >
                                {s}
                              </span>
                            ))}
                            {uniqueSizes.length > 3 && (
                              <span className="text-[9px] text-gray-400">+{uniqueSizes.length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => openProductDetail(prod)}
                          className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                        >
                          Ver Detalhes
                        </button>
                        <button
                          onClick={() => {
                            const firstAvailable = prod.variations.find((v) => v.available);
                            if (firstAvailable) {
                              addToInterest(prod, firstAvailable.size, firstAvailable.color);
                            } else {
                              openProductDetail(prod);
                            }
                          }}
                          className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Heart className="w-3.5 h-3.5" />
                          <span>Tenho Interesse</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Product Detail Modal */}
      {activeProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full overflow-hidden border border-rose-100 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
              <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">
                {activeProduct.category_name || 'Peça da Boutique'}
              </span>
              <button
                onClick={() => setActiveProduct(null)}
                className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-rose-100 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Gallery */}
              <div>
                <div className="aspect-4/5 rounded-2xl overflow-hidden bg-rose-50 border border-rose-100 shadow-2xs">
                  <img
                    src={activeProduct.images[modalActiveImageIdx] || activeProduct.images[0] || 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600'}
                    alt={activeProduct.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                {activeProduct.images.length > 1 && (
                  <div className="flex gap-2 mt-3 overflow-x-auto">
                    {activeProduct.images.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => setModalActiveImageIdx(idx)}
                        className={`w-14 h-16 rounded-xl overflow-hidden border-2 shrink-0 cursor-pointer ${
                          modalActiveImageIdx === idx ? 'border-rose-600 shadow-xs' : 'border-transparent opacity-70'
                        }`}
                      >
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Product Info & Variation Picker */}
              <div className="flex flex-col justify-between">
                <div className="space-y-4">
                  <div>
                    {activeProduct.reference && (
                      <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
                        Referência: {activeProduct.reference}
                      </span>
                    )}
                    <h2 className="text-2xl font-serif font-bold text-gray-950 mt-1">
                      {activeProduct.name}
                    </h2>
                    <div className="mt-2 flex items-baseline gap-3">
                      {activeProduct.promo_price_cents ? (
                        <>
                          <span className="text-2xl font-bold font-serif text-gray-950">
                            {formatBRL(activeProduct.promo_price_cents)}
                          </span>
                          <span className="text-sm text-gray-400 line-through">
                            {formatBRL(activeProduct.sale_price_cents)}
                          </span>
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded uppercase">
                            Preço Especial
                          </span>
                        </>
                      ) : (
                        <span className="text-2xl font-bold font-serif text-gray-950">
                          {formatBRL(activeProduct.sale_price_cents)}
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-gray-600 leading-relaxed font-light">
                    {activeProduct.description}
                  </p>

                  {/* Size selection */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">
                      Escolha o Tamanho:
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(new Set(activeProduct.variations.map((v) => v.size))).map((size) => {
                        const isAvailable = activeProduct.variations.some(
                          (v) => v.size === size && v.available
                        );
                        return (
                          <button
                            key={size}
                            onClick={() => setModalSize(size)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                              modalSize === size
                                ? 'bg-rose-600 border-rose-600 text-white shadow-xs'
                                : isAvailable
                                ? 'bg-white border-gray-300 text-gray-800 hover:border-rose-400'
                                : 'bg-gray-100 border-gray-200 text-gray-400 line-through'
                            }`}
                          >
                            {size} {!isAvailable && '(Esgotado)'}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Color selection */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">
                      Escolha a Cor:
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(new Set(activeProduct.variations.map((v) => v.color))).map((color) => {
                        const matching = activeProduct.variations.find(
                          (v) => v.size === modalSize && v.color === color
                        );
                        const isAvailable = matching ? matching.available : false;

                        return (
                          <button
                            key={color}
                            onClick={() => setModalColor(color)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                              modalColor === color
                                ? 'bg-rose-600 border-rose-600 text-white shadow-xs'
                                : isAvailable
                                ? 'bg-white border-gray-300 text-gray-800 hover:border-rose-400'
                                : 'bg-gray-100 border-gray-200 text-gray-400 opacity-60'
                            }`}
                          >
                            {color} {matching && `(${matching.stock_units} em estoque)`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Modal footer actions */}
                <div className="mt-8 pt-4 border-t border-rose-100 space-y-3">
                  <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-[11px] text-amber-900 leading-snug">
                    <p className="font-semibold">⚠️ Informação Importante:</p>
                    <p>
                      A inclusão na lista de interesse não reserva o produto nem realiza cobrança.
                      A peça será confirmada e retirada na loja física: <strong>{settings?.address || 'Rua Hipólito de Camargo, 45 — Guaianases'}</strong>.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => {
                        addToInterest(activeProduct, modalSize, modalColor);
                        setActiveProduct(null);
                      }}
                      disabled={!modalSize || !modalColor}
                      className="w-full py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold rounded-2xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Heart className="w-4 h-4" />
                      <span>Adicionar à Lista</span>
                    </button>

                    <button
                      onClick={() => {
                        addToInterest(activeProduct, modalSize, modalColor);
                        setActiveProduct(null);
                        setIsInterestDrawerOpen(true);
                      }}
                      disabled={!modalSize || !modalColor}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-2xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Consultar no Zap</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Interest Drawer for WhatsApp Consultation */}
      {isInterestDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end">
          <div className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-5 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-rose-600" />
                <h3 className="font-serif font-bold text-gray-900 text-lg">
                  Peças de Interesse
                </h3>
              </div>
              <button
                onClick={() => setIsInterestDrawerOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-full hover:bg-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Items List */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {interestList.length === 0 ? (
                <div className="py-16 text-center text-gray-400">
                  <ShoppingBag className="w-12 h-12 mx-auto mb-2 text-rose-200" />
                  <p className="text-sm font-medium text-gray-600">Sua lista está vazia</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Navegue pela vitrine e clique em "Tenho Interesse" para consultar peças pelo WhatsApp.
                  </p>
                </div>
              ) : (
                interestList.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 flex gap-3 items-center"
                  >
                    {item.image && (
                      <img
                        src={item.image}
                        alt=""
                        className="w-14 h-18 object-cover rounded-xl shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-gray-900 truncate">
                        {item.product_name}
                      </h4>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Tamanho: <span className="font-semibold text-gray-800">{item.size}</span> | Cor: <span className="font-semibold text-gray-800">{item.color}</span>
                      </p>
                      <p className="text-xs font-bold text-gray-950 font-serif mt-1">
                        {formatBRL(item.unit_price_cents * item.quantity)}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <button
                        onClick={() => removeInterestItem(idx)}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                        title="Remover"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <div className="flex items-center gap-1.5 bg-white px-2 py-0.5 rounded-lg border border-gray-300">
                        <button
                          onClick={() => updateInterestQty(idx, -1)}
                          className="text-gray-500 hover:text-gray-900 cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-bold w-4 text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateInterestQty(idx, 1)}
                          className="text-gray-500 hover:text-gray-900 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Drawer Footer */}
            {interestList.length > 0 && (
              <div className="p-5 bg-gray-50 border-t border-gray-200 space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 font-medium">Total Estimado:</span>
                  <span className="text-lg font-serif font-bold text-gray-950">
                    {formatBRL(totalInterestCents)}
                  </span>
                </div>

                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900 leading-snug">
                  <p className="font-semibold">Aviso de Atendimento:</p>
                  <p>
                    O envio no WhatsApp iniciará uma conversa com a loja física. Não processamos pagamento online e não reservamos estoque automaticamente nesta etapa.
                  </p>
                </div>

                <button
                  onClick={sendWhatsAppConsultation}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Consultar Disponibilidade no WhatsApp</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Boutique Footer */}
      <footer className="bg-white border-t border-rose-100 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-rose-400 to-rose-600 flex items-center justify-center text-white font-serif font-bold">
                L
              </div>
              <span className="font-serif font-bold text-lg text-gray-900">
                {settings?.store_name || 'Lory Boutique'}
              </span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed max-w-sm">
              Moda feminina com sofisticação e caimento perfeito. Atendimento presencial no balcão e consulta online.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-3">
              Localização & Retirada
            </h4>
            <div className="space-y-2 text-xs text-gray-600">
              <p className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{settings?.address || 'Rua Hipólito de Camargo, 45 — Guaianases, São Paulo/SP'}</span>
              </p>
              <p className="text-[11px] text-gray-400 pl-6">
                Retirada exclusiva na loja física.
              </p>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-3">
              Canais Oficiais
            </h4>
            <div className="space-y-2 text-xs text-gray-600">
              <a
                href={settings?.whatsapp ? `https://wa.me/${settings.whatsapp_raw}` : 'https://wa.me/5511949611902'}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-emerald-700 hover:underline"
              >
                <MessageCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>WhatsApp: {settings?.whatsapp || '(11) 94961-1902'}</span>
              </a>
              <a
                href={settings?.instagram || 'https://www.instagram.com/loryboutiquel/'}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-rose-700 hover:underline"
              >
                <InstagramIcon className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Instagram: {settings?.instagram_handle || '@loryboutiquel'}</span>
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-rose-100 text-center text-xs text-gray-400">
          <p>© {new Date().getFullYear()} {settings?.store_name || 'Lory Boutique'}. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
};
