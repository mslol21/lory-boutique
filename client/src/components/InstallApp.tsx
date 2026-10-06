import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Dialog } from "./Dialog";
import { BrandLogo } from "./BrandLogo";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const onInstall = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); setHelp(false); };
    const onDisplay = () => setInstalled(standalone.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const onConnection = () => setOffline(!navigator.onLine);
    onDisplay();
    window.addEventListener("beforeinstallprompt", onInstall);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", onConnection);
    window.addEventListener("offline", onConnection);
    standalone.addEventListener("change", onDisplay);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstall);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", onConnection);
      window.removeEventListener("offline", onConnection);
      standalone.removeEventListener("change", onDisplay);
    };
  }, []);
  const install = async () => {
    if (!prompt) { setHelp(true); return; }
    try { await prompt.prompt(); await prompt.userChoice; setPrompt(null); }
    catch { setHelp(true); setPrompt(null); }
  };
  return <>
    {offline && <p role="alert" className="fixed bottom-0 left-0 right-0 z-50 bg-amber-100 text-amber-950 px-4 py-3 text-sm text-center">Sem conexão. Vendas, estoque e caixa precisam de internet. Reconecte antes de confirmar operações.</p>}
    {!installed && <div className="px-4 py-5 flex justify-center border-t border-brand-100"><button onClick={install} className="bg-brand-800 text-white border border-brand-300 rounded-2xl px-4 py-3 shadow-sm flex items-center gap-2 text-xs font-semibold"><Download className="w-4 h-4" />Instalar app</button></div>}
    {help && <Dialog className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full relative border border-brand-200">
        <button data-dialog-close aria-label="Fechar instruções de instalação" onClick={() => setHelp(false)} className="absolute right-3 top-3 p-2 text-gray-600"><X className="w-5 h-5" /></button>
        <BrandLogo className="w-20 h-20 mx-auto mb-4" />
        <h2 className="font-serif font-bold text-xl text-gray-900 mb-3">Instalar Lory Boutique</h2>
        <div className="text-sm text-gray-700 space-y-3">
          <p><strong>Computador:</strong> abra no Chrome ou Edge e escolha “Instalar aplicativo” no menu do navegador ou no ícone ao lado do endereço.</p>
          <p><strong>Android:</strong> no Chrome, abra o menu ⋮ e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.</p>
          <p><strong>iPhone/iPad:</strong> no Safari, toque em Compartilhar e em “Adicionar à Tela de Início”.</p>
          <p className="bg-brand-50 rounded-xl p-3 text-xs">O app usa o mesmo login e os mesmos dados do site. A gestão e as vendas exigem internet.</p>
        </div>
      </div>
    </Dialog>}
  </>;
}
