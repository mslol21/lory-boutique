import React, { useState, useEffect } from "react";
import { User, StoreSettings, InterestItem } from "./types";
import { apiRequest, setAuthToken } from "./services/api";
import { Navbar } from "./components/Navbar";
import { Showcase } from "./components/Showcase";
import { POS } from "./components/POS";
import { ProductsManager } from "./components/ProductsManager";
import { CashManager } from "./components/CashManager";
import { SalesManager } from "./components/SalesManager";
import { Dashboard } from "./components/Dashboard";
import { SettingsManager } from "./components/SettingsManager";
import { LoginModal } from "./components/LoginModal";
import { InstallApp } from "./components/InstallApp";

const views = ["showcase", "pos", "products", "cash", "sales", "dashboard", "settings"] as const;
type View = (typeof views)[number];
const viewKey = (user: User) => `lory_view_v1_${user.id}`;

// Persist a validated online session for brief offline interruptions.
// Never cache passwords. Existing JWT expiration is enforced locally.
const cachedUserKey = "lory_offline_session_v1";
const cachedCashKey = "lory_offline_cash_v1";
const cachedSettingsKey = "lory_offline_settings_v1";
function offlineIdentity(): User | null {
  try {
    const token = localStorage.getItem("lory_auth_token");
    const cache = JSON.parse(localStorage.getItem(cachedUserKey) || "null");
    if (!token || !cache?.user || cache.token !== token) return null;
    const claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (!claims.exp || Date.now() >= claims.exp * 1000) return null;
    if (claims.id !== cache.user.id) return null;
    return cache.user as User;
  } catch { return null; }
}


function restoreView(user: User): View {
  try {
    const saved = localStorage.getItem(viewKey(user));
    if (views.includes(saved as View)) {
      return saved === "settings" && user.role !== "admin" ? "pos" : saved as View;
    }
  } catch {
    // Remembering navigation is optional when browser storage is unavailable.
  }
  return "pos";
}

export function App() {
  const [currentView, setCurrentView] = useState<View>("showcase");
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState(false);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [isCashOpen, setIsCashOpen] = useState(false);

  // Interest List for Public Showcase
  const [interestList, setInterestList] = useState<InterestItem[]>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("lory_interest_v1") || "[]",
      );
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("lory_interest_v1", JSON.stringify(interestList));
    } catch {
      /* optional interest draft */
    }
  }, [interestList]);
  const [isInterestDrawerOpen, setIsInterestDrawerOpen] = useState(false);

  // Login Modal
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // Check user session
  const checkSession = async () => {
    const token = localStorage.getItem("lory_auth_token");
    setIsCheckingSession(true);
    setSessionError(false);
    if (!token) {
      setIsCheckingSession(false);
      return;
    }
    try {
      const res = await apiRequest<{ user: User }>("/auth/me");
      localStorage.setItem(cachedUserKey, JSON.stringify({token, user: res.user}));
      setCurrentUser(res.user);
      setCurrentView(restoreView(res.user));
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 401 || status === 403) {
        setAuthToken(null);
        localStorage.removeItem(cachedUserKey);
        setCurrentUser(null);
        setCurrentView("showcase");
      } else {
        const cached = offlineIdentity();
        if (cached) {
          setCurrentUser(cached);
          setCurrentView(restoreView(cached));
        } else {
          setSessionError(true);
        }
      }
    } finally {
      setIsCheckingSession(false);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    try {
      localStorage.setItem(viewKey(currentUser), currentView);
    } catch {
      // The system remains usable when navigation cannot be saved.
    }
  }, [currentView, currentUser]);

  // Fetch Public Settings
  const fetchSettings = async () => {
    try {
      const res = await apiRequest<StoreSettings>("/public/settings");
      setSettings(res);
      localStorage.setItem(cachedSettingsKey, JSON.stringify(res));
    } catch (err) {
      try {
        const cached = localStorage.getItem(cachedSettingsKey);
        if (cached) setSettings(JSON.parse(cached));
      } catch { /* Offline settings not available */ }
    }
  };

  // Check cash status
  const checkCashStatus = async () => {
    try {
      const res = await apiRequest<any>("/cash/current");
      setIsCashOpen(res.open);
      localStorage.setItem(cachedCashKey, JSON.stringify({open: res.open, at: Date.now()}));
    } catch (err) {
      try {
        const cached = JSON.parse(localStorage.getItem(cachedCashKey) || "null");
        // Previously opened register valid provisionally for up to 12h;
        // server validates again on reconciliation.
        setIsCashOpen(Boolean(offlineIdentity() && cached?.open && Date.now() - cached.at < 12 * 60 * 60 * 1000));
      } catch { setIsCashOpen(false); }
    }
  };

  useEffect(() => {
    fetchSettings();
    checkSession();
    checkCashStatus();
  }, []);

  const handleLoginSuccess = (user: User) => {
    const token = localStorage.getItem("lory_auth_token");
    if (token) localStorage.setItem(cachedUserKey, JSON.stringify({token, user}));
    setCurrentUser(user);
    checkCashStatus();
    setCurrentView("pos"); // Automatically navigate to POS on login
  };

  const handleLogout = () => {
    if (currentUser) {
      try { localStorage.removeItem(viewKey(currentUser)); } catch { /* optional navigation */ }
    }
    setAuthToken(null);
    localStorage.removeItem(cachedUserKey);
    setCurrentUser(null);
    setCurrentView("showcase");
  };

  const handleNavigate = (view: View) => {
    if (view !== "showcase" && !currentUser) {
      setIsLoginModalOpen(true);
      return;
    }
    if (view === "settings" && currentUser?.role !== "admin") return;
    setCurrentView(view);
    checkCashStatus();
  };

  if (isCheckingSession || sessionError) {
    return (
      <main className="min-h-screen bg-[#fcf8f5] flex flex-col items-center justify-center gap-4 p-6 text-brand-900">
        {sessionError ? (
          <>
            <p role="alert">Não foi possível verificar seu acesso. Confira a conexão e tente novamente.</p>
            <button type="button" className="rounded-xl bg-brand-600 px-4 py-2 text-white" onClick={checkSession}>
              Tentar novamente
            </button>
          </>
        ) : <p role="status">Restaurando seu acesso…</p>}
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#fcf8f5] flex flex-col font-sans selection:bg-brand-200 selection:text-brand-900">
      {/* Top Navbar */}
      <Navbar
        currentView={currentView}
        onNavigate={handleNavigate}
        currentUser={currentUser}
        onOpenLogin={() => setIsLoginModalOpen(true)}
        onLogout={handleLogout}
        settings={settings}
        interestList={interestList}
        onOpenInterest={() => setIsInterestDrawerOpen(true)}
        isCashOpen={isCashOpen}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {currentView === "showcase" && (
          <Showcase
            settings={settings}
            interestList={interestList}
            setInterestList={setInterestList}
            isInterestDrawerOpen={isInterestDrawerOpen}
            setIsInterestDrawerOpen={setIsInterestDrawerOpen}
          />
        )}

        {currentView === "pos" && (
          <POS
            key={currentUser?.id}
            currentUser={currentUser}
            settings={settings}
            isCashOpen={isCashOpen}
            onOpenCash={() => setCurrentView("cash")}
          />
        )}

        {currentView === "products" && (
          <ProductsManager currentUser={currentUser} />
        )}

        {currentView === "cash" && (
          <CashManager onStatusChange={checkCashStatus} />
        )}

        {currentView === "sales" && (
          <SalesManager currentUser={currentUser} settings={settings} />
        )}

        {currentView === "dashboard" && (
          <Dashboard
            currentUser={currentUser}
            onNavigateToProducts={() => setCurrentView("products")}
          />
        )}

        {currentView === "settings" && (
          <SettingsManager
            currentUser={currentUser}
            onOwnAccessUpdated={handleLogout}
            settings={settings}
            onSettingsUpdated={fetchSettings}
          />
        )}
      </main>

      <InstallApp />
      {/* Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />
    </div>
  );
}

export default App;
