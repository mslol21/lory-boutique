import { Dialog } from "./Dialog";
import React, { useState, useEffect } from "react";
import { StoreSettings, User } from "../types";
import { apiRequest } from "../services/api";
import {
  Settings,
  Users,
  Store,
  Plus,
  ShieldCheck,
  UserX,
  UserCheck,
  Check,
  AlertCircle,
  Sparkles,
  Info,
} from "lucide-react";

interface SettingsManagerProps {
  settings: StoreSettings | null;
  onSettingsUpdated: () => void;
}

export const SettingsManager: React.FC<SettingsManagerProps> = ({
  settings,
  onSettingsUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<"store" | "users">("store");
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Store Settings Form
  const [storeName, setStoreName] = useState(
    settings?.store_name || "Lory Boutique",
  );
  const [segment, setSegment] = useState(
    settings?.segment || "Roupas Femininas",
  );
  const [address, setAddress] = useState(
    settings?.address ||
      "Rua Hipólito de Camargo, 45 — Guaianases, São Paulo/SP",
  );
  const [whatsapp, setWhatsapp] = useState(
    settings?.whatsapp || "(11) 94961-1902",
  );
  const [whatsappRaw, setWhatsappRaw] = useState(
    settings?.whatsapp_raw || "5511949611902",
  );
  const [instagram, setInstagram] = useState(
    settings?.instagram || "https://www.instagram.com/loryboutiquel/",
  );
  const [instagramHandle, setInstagramHandle] = useState(
    settings?.instagram_handle || "@loryboutiquel",
  );
  const [operationModel, setOperationModel] = useState(
    settings?.operation_model ||
      "Retirada na loja física (sem entregas no momento)",
  );
  const [cnpj, setCnpj] = useState(settings?.cnpj || "");
  const [cep, setCep] = useState(settings?.cep || "");
  const [businessHours, setBusinessHours] = useState(
    settings?.business_hours || "",
  );

  // New User Form Modal
  const [isNewUserModalOpen, setIsNewUserModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "attendant">("attendant");

  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await apiRequest<User[]>("/auth/users");
      setUsers(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (activeTab === "users") {
      fetchUsers();
    }
  }, [activeTab]);

  const showToast = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3500);
  };

  const handleSaveStoreSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest("/settings", {
        method: "PUT",
        body: JSON.stringify({
          store_name: storeName,
          segment,
          address,
          whatsapp,
          whatsapp_raw: whatsappRaw,
          instagram,
          instagram_handle: instagramHandle,
          operation_model: operationModel,
          cnpj,
          cep,
          business_hours: businessHours,
        }),
      });
      showToast("success", "Configurações da loja atualizadas com sucesso!");
      onSettingsUpdated();
    } catch (err: any) {
      showToast("error", err.message);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest("/auth/users", {
        method: "POST",
        body: JSON.stringify({
          name: newName,
          username: newUsername,
          password: newPassword,
          role: newRole,
        }),
      });
      showToast("success", "Novo usuário criado com sucesso!");
      setIsNewUserModalOpen(false);
      setNewName("");
      setNewUsername("");
      setNewPassword("");
      fetchUsers();
    } catch (err: any) {
      showToast("error", err.message);
    }
  };

  const handleToggleUserActive = async (user: User) => {
    const newActiveState = user.active === 1 ? 0 : 1;
    try {
      await apiRequest(`/auth/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ active: newActiveState }),
      });
      showToast(
        "success",
        `Usuário ${newActiveState === 1 ? "ativado" : "desativado"} com sucesso!`,
      );
      fetchUsers();
    } catch (err: any) {
      showToast("error", err.message);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 text-xs">
      {/* Toast */}
      {notification && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in ${
            notification.type === "success"
              ? "bg-emerald-900 text-white"
              : "bg-red-900 text-white"
          }`}
        >
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <div>
        <h2 className="text-2xl font-serif font-bold text-gray-900">
          Ajustes & Configurações
        </h2>
        <p className="text-gray-500 mt-0.5">
          Gerenciamento das informações da loja, equipe de atendentes e
          segurança
        </p>
      </div>

      {/* Demo Mode Banner */}
      <div className="p-4 bg-rose-50/70 border border-rose-200 rounded-3xl flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold text-rose-950 text-sm">
            Identidade Visual & Dados Confirmados
          </h4>
          <p className="text-gray-600 mt-0.5 leading-relaxed">
            As informações da Lory Boutique (endereço em Guaianases, WhatsApp e
            Instagram) estão ativas no sistema. Campos não fornecidos (como
            CNPJ, CEP e horário de funcionamento) permanecem ocultos na vitrine
            online até que você decida preenchê-los abaixo.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        <button
          onClick={() => setActiveTab("store")}
          className={`px-4 py-2 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "store"
              ? "bg-rose-600 text-white shadow-xs"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <Store className="w-4 h-4" />
          <span>Dados da Loja & Vitrine</span>
        </button>

        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "users"
              ? "bg-rose-600 text-white shadow-xs"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Equipe & Usuários</span>
        </button>
      </div>

      {/* Store Tab Form */}
      {activeTab === "store" && (
        <form
          onSubmit={handleSaveStoreSettings}
          className="bg-white p-6 rounded-3xl border border-gray-200 shadow-2xs space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-gray-700 mb-1">
                Nome da Loja *
              </label>
              <input
                type="text"
                required
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">
                Segmento
              </label>
              <input
                type="text"
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-bold text-gray-700 mb-1">
                Endereço da Loja Física *
              </label>
              <input
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">
                WhatsApp de Contato *
              </label>
              <input
                type="text"
                required
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">
                Link WhatsApp (número sem símbolos) *
              </label>
              <input
                type="text"
                required
                value={whatsappRaw}
                onChange={(e) => setWhatsappRaw(e.target.value)}
                placeholder="ex: 5511949611902"
                className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">
                URL do Instagram
              </label>
              <input
                type="url"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">
                Handle do Instagram
              </label>
              <input
                type="text"
                value={instagramHandle}
                onChange={(e) => setInstagramHandle(e.target.value)}
                placeholder="ex: @loryboutiquel"
                className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-bold text-gray-700 mb-1">
                Modelo Operacional
              </label>
              <input
                type="text"
                value={operationModel}
                onChange={(e) => setOperationModel(e.target.value)}
                className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300"
              />
            </div>

            {/* Optional Fields that remain hidden if empty */}
            <div>
              <label className="block font-bold text-gray-700 mb-1">
                CNPJ (Opcional - oculto na vitrine se vazio)
              </label>
              <input
                type="text"
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                placeholder="Deixe em branco se ainda não desejar exibir"
                className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">
                CEP (Opcional - oculto se vazio)
              </label>
              <input
                type="text"
                value={cep}
                onChange={(e) => setCep(e.target.value)}
                placeholder="Deixe em branco se não desejar exibir"
                className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-bold text-gray-700 mb-1">
                Horário de Atendimento (Opcional - oculto se vazio)
              </label>
              <input
                type="text"
                value={businessHours}
                onChange={(e) => setBusinessHours(e.target.value)}
                placeholder="ex: Segunda a Sábado das 09h às 18h"
                className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 flex justify-end">
            <button
              type="submit"
              className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Salvar Configurações
            </button>
          </div>
        </form>
      )}

      {/* Users Tab */}
      {activeTab === "users" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800 text-sm">
              Usuários Cadastrados
            </h3>
            <button
              onClick={() => setIsNewUserModalOpen(true)}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Usuário</span>
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-gray-200 shadow-2xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-bold text-[10px]">
                <tr>
                  <th className="py-3 px-4">Nome</th>
                  <th className="py-3 px-4">Usuário</th>
                  <th className="py-3 px-4">Perfil</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 font-bold text-gray-900">
                      {u.name}
                    </td>
                    <td className="py-3 px-4 font-mono text-gray-600">
                      {u.username}
                    </td>
                    <td className="py-3 px-4 capitalize">
                      {u.role === "admin" ? (
                        <span className="inline-flex items-center gap-1 text-rose-800 font-bold bg-rose-50 px-2 py-0.5 rounded-md">
                          <ShieldCheck className="w-3.5 h-3.5 text-rose-600" />
                          Administrador
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-gray-700 font-medium bg-gray-100 px-2 py-0.5 rounded-md">
                          Atendente
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          u.active === 1
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {u.active === 1 ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleToggleUserActive(u)}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          u.active === 1
                            ? "text-gray-400 hover:text-red-600 hover:bg-red-50"
                            : "text-emerald-600 hover:bg-emerald-50"
                        }`}
                        title={
                          u.active === 1
                            ? "Desativar usuário"
                            : "Ativar usuário"
                        }
                      >
                        {u.active === 1 ? (
                          <UserX className="w-4 h-4" />
                        ) : (
                          <UserCheck className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New User Modal */}
      {isNewUserModalOpen && (
        <Dialog className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 border border-rose-100">
            <h3 className="font-bold text-gray-900 text-base mb-1">
              Cadastrar Usuário da Equipe
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Crie acesso para atendentes da loja ou novo administrador
            </p>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nome do colaborador"
                  className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Login de Usuário *
                </label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="Usuário do colaborador"
                  className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Senha de Acesso *
                </label>
                <input
                  type="password"
                  required
                  minLength={12}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Perfil de Acesso *
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 font-semibold"
                >
                  <option value="attendant">
                    Atendente (Vendas, Caixa e PDV)
                  </option>
                  <option value="admin">Administrador (Acesso total)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewUserModalOpen(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-xs cursor-pointer"
                >
                  Criar Usuário
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}
    </div>
  );
};
