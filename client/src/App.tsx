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

export function App() {
  const [currentView, setCurrentView] = useState<
    | "showcase"
    | "pos"
    | "products"
    | "cash"
    | "sales"
    | "dashboard"
    | "settings"
  >("showcase");

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
    if (!token) return;
    try {
      const res = await apiRequest<{ user: User }>("/auth/me");
      setCurrentUser(res.user);
    } catch (err) {
      setAuthToken(null);
      setCurrentUser(null);
    }
  };

  // Fetch Public Settings
  const fetchSettings = async () => {
    try {
      const res = await apiRequest<StoreSettings>("/public/settings");
      setSettings(res);
    } catch (err) {
      console.error(err);
    }
  };

  // Check cash status
  const checkCashStatus = async () => {
    try {
      const res = await apiRequest<any>("/cash/current");
      setIsCashOpen(res.open);
    } catch (err) {
      setIsCashOpen(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    checkSession();
    checkCashStatus();
  }, []);

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    checkCashStatus();
    setCurrentView("pos"); // Automatically navigate to POS on login
  };

  const handleLogout = () => {
    setAuthToken(null);
    setCurrentUser(null);
    setCurrentView("showcase");
  };

  const handleNavigate = (view: any) => {
    if (view !== "showcase" && !currentUser) {
      setIsLoginModalOpen(true);
      return;
    }
    setCurrentView(view);
    checkCashStatus();
  };

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
            settings={settings}
            onSettingsUpdated={fetchSettings}
          />
        )}
      </main>

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
