import React from 'react';
import { BrandLogo } from './BrandLogo';
import { User, StoreSettings, InterestItem } from '../types';
import {
  ShoppingBag,
  Sparkles,
  LayoutDashboard,
  ShoppingCart,
  Shirt,
  DollarSign,
  ClipboardList,
  Settings,
  LogOut,
  ExternalLink,
  Store,
  Heart
} from 'lucide-react';

interface NavbarProps {
  currentView: 'showcase' | 'pos' | 'products' | 'cash' | 'sales' | 'dashboard' | 'settings';
  onNavigate: (view: any) => void;
  currentUser: User | null;
  onOpenLogin: () => void;
  onLogout: () => void;
  settings: StoreSettings | null;
  interestList: InterestItem[];
  onOpenInterest: () => void;
  isCashOpen: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigate,
  currentUser,
  onOpenLogin,
  onLogout,
  settings,
  interestList,
  onOpenInterest,
  isCashOpen
}) => {
  const isInternal = currentView !== 'showcase';
  const interestCount = interestList.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-brand-100 shadow-xs">
      {/* Top Boutique Announcement Bar */}
      <div className="bg-gradient-to-r from-brand-50 via-amber-50 to-brand-50 py-1.5 px-4 text-center border-b border-brand-100/60 text-xs text-brand-900 font-medium flex items-center justify-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
        <span>
          Retirada imediata na loja física: <strong>{settings?.address || 'Rua Hipólito de Camargo, 45 — Guaianases, São Paulo/SP'}</strong>
        </span>
        <span className="hidden md:inline text-brand-300">•</span>
        <span className="hidden md:inline text-brand-700">WhatsApp: {settings?.whatsapp || '(11) 94961-1902'}</span>
      </div>

      {/* Main Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <button type="button" aria-label="Lory Boutique — abrir vitrine" className="flex items-center gap-2.5 cursor-pointer text-left rounded-xl" onClick={() => onNavigate('showcase')}>
            <BrandLogo decorative priority className="w-12 h-12 sm:w-14 sm:h-14 ring-1 ring-brand-200" />
            <div className="hidden min-[360px]:block">
              <div className="flex items-center gap-1.5">
                <span className="font-serif text-base sm:text-xl font-bold tracking-tight text-gray-900">
                  {settings?.store_name || 'Lory Boutique'}
                </span>
              </div>
              <p className="text-[10px] text-gray-400 font-medium tracking-wide uppercase">
                {settings?.segment || 'Roupas Femininas'}
              </p>
            </div>
          </button>

          {/* Center Navigation depending on View */}
          {!isInternal ? (
            /* Vitrine Nav */
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
              <button
                onClick={() => onNavigate('showcase')}
                className="text-brand-600 hover:text-brand-700 transition-colors"
              >
                Vitrine & Coleção
              </button>
              <a
                href={settings?.instagram || 'https://www.instagram.com/loryboutiquel/'}
                target="_blank"
                rel="noreferrer"
                className="hover:text-brand-600 flex items-center gap-1 text-gray-600 transition-colors"
              >
                <span>Instagram</span>
                <ExternalLink className="w-3 h-3 text-gray-400" />
              </a>
              <a
                href={settings?.whatsapp ? `https://wa.me/${settings.whatsapp_raw}` : 'https://wa.me/5511949611902'}
                target="_blank"
                rel="noreferrer"
                className="hover:text-brand-600 flex items-center gap-1 text-gray-600 transition-colors"
              >
                <span>Fale Conosco</span>
                <ExternalLink className="w-3 h-3 text-gray-400" />
              </a>
            </nav>
          ) : (
            /* Internal System Nav */
            <nav className="hidden lg:flex items-center gap-1 bg-gray-50 p-1 rounded-2xl border border-gray-200 text-xs font-medium">
              <button
                onClick={() => onNavigate('pos')}
                className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                  currentView === 'pos'
                    ? 'bg-brand-600 text-white shadow-xs font-semibold'
                    : 'text-gray-700 hover:bg-white hover:text-gray-900'
                }`}
              >
                <ShoppingCart className="w-4 h-4" />
                PDV Balcão
              </button>

              <button
                onClick={() => onNavigate('products')}
                className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                  currentView === 'products'
                    ? 'bg-brand-600 text-white shadow-xs font-semibold'
                    : 'text-gray-700 hover:bg-white hover:text-gray-900'
                }`}
              >
                <Shirt className="w-4 h-4" />
                Produtos & Estoque
              </button>

              <button
                onClick={() => onNavigate('cash')}
                className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                  currentView === 'cash'
                    ? 'bg-brand-600 text-white shadow-xs font-semibold'
                    : 'text-gray-700 hover:bg-white hover:text-gray-900'
                }`}
              >
                <DollarSign className="w-4 h-4" />
                Caixa
                <span
                  className={`w-2 h-2 rounded-full ${
                    isCashOpen ? 'bg-emerald-500 animate-pulse' : 'bg-brand-400'
                  }`}
                />
              </button>

              <button
                onClick={() => onNavigate('sales')}
                className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                  currentView === 'sales'
                    ? 'bg-brand-600 text-white shadow-xs font-semibold'
                    : 'text-gray-700 hover:bg-white hover:text-gray-900'
                }`}
              >
                <ClipboardList className="w-4 h-4" />
                Vendas & Trocas
              </button>

              <button
                onClick={() => onNavigate('dashboard')}
                className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                  currentView === 'dashboard'
                    ? 'bg-brand-600 text-white shadow-xs font-semibold'
                    : 'text-gray-700 hover:bg-white hover:text-gray-900'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                Painel
              </button>

              {currentUser?.role === 'admin' && (
                <button
                  onClick={() => onNavigate('settings')}
                  className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                    currentView === 'settings'
                      ? 'bg-brand-600 text-white shadow-xs font-semibold'
                      : 'text-gray-700 hover:bg-white hover:text-gray-900'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  Ajustes
                </button>
              )}
            </nav>
          )}

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2.5">
            {!isInternal ? (
              <>
                {/* Interest Wishlist button */}
                <button
                  onClick={onOpenInterest}
                  className="relative p-2 text-gray-700 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                  title="Peças de Interesse para WhatsApp"
                >
                  <Heart className="w-5 h-5 text-brand-500" />
                  <span className="hidden sm:inline text-xs font-semibold">Interesse</span>
                  {interestCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-brand-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-xs">
                      {interestCount}
                    </span>
                  )}
                </button>

                {/* Team Login or Switch to PDV */}
                {currentUser ? (
                  <button
                    onClick={() => onNavigate('pos')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    <Store className="w-4 h-4" />
                    <span>Acessar PDV</span>
                  </button>
                ) : (
                  <button
                    onClick={onOpenLogin}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-brand-300 text-brand-700 hover:bg-brand-50 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Store className="w-4 h-4" />
                    <span>Área da Equipe</span>
                  </button>
                )}
              </>
            ) : (
              <>
                {/* Switch back to Vitrine */}
                <button
                  onClick={() => onNavigate('showcase')}
                  className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-brand-700 hover:bg-brand-50 rounded-xl border border-gray-200 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Store className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Ver Vitrine</span>
                </button>

                {/* Logged in User Badge */}
                <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 bg-gray-100 rounded-xl">
                  <div className="w-6 h-6 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center uppercase">
                    {currentUser?.name.charAt(0)}
                  </div>
                  <div className="text-left text-[11px] leading-tight">
                    <p className="font-semibold text-gray-900">{currentUser?.name}</p>
                    <p className="text-gray-500 capitalize">{currentUser?.role === 'admin' ? 'Administrador' : 'Atendente'}</p>
                  </div>
                </div>

                {/* Logout */}
                <button
                  onClick={onLogout}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                  title="Sair do sistema"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Mobile Navigation Bar for Internal mode */}
        {isInternal && (
          <div className="lg:hidden py-2 border-t border-gray-100 flex items-center justify-around gap-1 overflow-x-auto text-[11px] font-medium">
            <button
              onClick={() => onNavigate('pos')}
              className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1 shrink-0 ${
                currentView === 'pos' ? 'bg-brand-600 text-white' : 'text-gray-700'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              PDV
            </button>
            <button
              onClick={() => onNavigate('products')}
              className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1 shrink-0 ${
                currentView === 'products' ? 'bg-brand-600 text-white' : 'text-gray-700'
              }`}
            >
              <Shirt className="w-3.5 h-3.5" />
              Produtos
            </button>
            <button
              onClick={() => onNavigate('cash')}
              className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1 shrink-0 ${
                currentView === 'cash' ? 'bg-brand-600 text-white' : 'text-gray-700'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              Caixa
            </button>
            <button
              onClick={() => onNavigate('sales')}
              className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1 shrink-0 ${
                currentView === 'sales' ? 'bg-brand-600 text-white' : 'text-gray-700'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              Vendas
            </button>
            <button
              onClick={() => onNavigate('dashboard')}
              className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1 shrink-0 ${
                currentView === 'dashboard' ? 'bg-brand-600 text-white' : 'text-gray-700'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Painel
            </button>
            {currentUser?.role === 'admin' && (
              <button
                onClick={() => onNavigate('settings')}
                className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1 shrink-0 ${
                  currentView === 'settings' ? 'bg-brand-600 text-white' : 'text-gray-700'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                Ajustes
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
