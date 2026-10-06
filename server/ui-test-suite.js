const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { JSDOM } = require("jsdom");
const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"></div></body></html>',
  { url: "http://localhost/" },
);
for (const key of [
  "window",
  "document",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLSelectElement",
  "HTMLButtonElement",
  "Event",
  "KeyboardEvent",
  "MouseEvent",
  "MutationObserver",
  "localStorage",
])
  global[key] = dom.window[key];
Object.defineProperty(global, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
global.IS_REACT_ACT_ENVIRONMENT = true;
const client = path.join(__dirname, "../client");
const ts = require(client + "/node_modules/typescript");
for (const ext of [".ts", ".tsx"])
  require.extensions[ext] = (module, file) => {
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    module._compile(code, file);
  };
const React = require(client + "/node_modules/react");
const { act } = React;
const { createRoot } = require(client + "/node_modules/react-dom/client");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lory-ui-"));
process.env.DATABASE_URL = "";
process.env.DB_PATH = path.join(dir, "test.db");
process.env.JWT_SECRET = crypto.randomBytes(48).toString("hex");
process.env.ADMIN_PASSWORD = crypto.randomBytes(24).toString("hex");
process.env.ADMIN_USERNAME = "ui-admin";
process.env.PORT = "0";
const { startServer } = require("./index");
const { closeDB, get } = require("./db");
const nativeFetch = global.fetch;
(async () => {
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  global.fetch = (url, options) => nativeFetch(new URL(url, base), options);
  const root = createRoot(document.getElementById("root"));
  let checks = 0;
  const render = async (component) => {
    await act(async () => {
      root.render(component);
      await new Promise((r) => setTimeout(r, 100));
    });
  };
  const wait = async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
  };
  const check = async (name, fn) => {
    await fn();
    checks++;
    console.log("✓", name);
  };
  try {
    const { Showcase } = require(client + "/src/components/Showcase.tsx");
    await render(
      React.createElement(Showcase, {
        settings: null,
        interestList: [],
        setInterestList: () => {},
        isInterestDrawerOpen: false,
        setIsInterestDrawerOpen: () => {},
      }),
    );
    await wait();
    await check("Vitrine vazia sem mercadoria demonstrativa", () => {
      assert.match(document.body.textContent, /Ainda não há peças/);
      assert.doesNotMatch(document.body.textContent, /Vestido Midi Canelado/);
    });
    const { LoginModal } = require(client + "/src/components/LoginModal.tsx");
    await render(
      React.createElement(LoginModal, {
        isOpen: true,
        onClose: () => {},
        onLoginSuccess: () => {},
      }),
    );
    await check("Login não expõe acesso rápido", () => {
      assert.doesNotMatch(
        document.body.textContent,
        /Acesso Rápido|admin123|atendente123/,
      );
      assert.ok(document.querySelector('label[for="login-username"]'));
      assert.ok(document.querySelector('[role="dialog"]'));
    });
    const login = await nativeFetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "ui-admin",
        password: process.env.ADMIN_PASSWORD,
      }),
    }).then((r) => r.json());
    localStorage.setItem("lory_auth_token", login.token);
    const { ProductsManager } = require(
      client + "/src/components/ProductsManager.tsx",
    );
    await render(
      React.createElement(ProductsManager, { currentUser: login.user }),
    );
    await wait();
    const button = [...document.querySelectorAll("button")].find(
      (b) =>
        b.textContent.includes("Nova Peça") ||
        b.textContent.includes("Novo Produto"),
    );
    assert.ok(button, "Botão para cadastrar produto");
    await act(async () => button.click());
    await check("Cadastro novo inicia sem foto e sem estoque fictício", () => {
      assert.equal(document.querySelectorAll("img").length, 0);
      const nums = [
        ...document.querySelectorAll('[role="dialog"] input[type="number"]'),
      ];
      assert.ok(nums.some((n) => n.value === "0"));
      assert.ok(document.querySelector('input[type="file"]'));
    });
    const create = await nativeFetch(base + "/api/products", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + login.token,
      },
      body: JSON.stringify({
        name: "Peça criada apenas no teste",
        description: "",
        cost_price_cents: 100,
        sale_price_cents: 1000,
        images: [],
        is_showcase: 1,
        variations: [{ size: "M", color: "Preto", stock: 2, min_stock: 0 }],
      }),
    }).then((r) => r.json());
    await render(
      React.createElement(ProductsManager, {
        key: "reload",
        currentUser: login.user,
      }),
    );
    await wait();
    const edit = [...document.querySelectorAll("button")].find((b) =>
      b.getAttribute("aria-label")?.includes("Editar Peça"),
    );
    assert.ok(edit);
    await act(async () => edit.click());
    await check(
      "Edição abre a peça cadastrada e protege estoque direto",
      () => {
        assert.ok(
          [...document.querySelectorAll("input")].some(
            (i) => i.value === "Peça criada apenas no teste",
          ),
        );
        const stock = [
          ...document.querySelectorAll('input[type="number"]'),
        ].find((i) => i.value === "2");
        assert.ok(stock?.disabled);
      },
    );
    const cash = await nativeFetch(base + "/api/cash/open", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + login.token,
      },
      body: JSON.stringify({ initial_amount_cents: 0 }),
    });
    assert.equal(cash.status, 201);
    const { POS } = require(client + "/src/components/POS.tsx");
    const variation = await get(
      "SELECT * FROM product_variations WHERE product_id=?",
      [create.id],
    );
    const key = crypto.randomUUID();
    const cart = [
      {
        variation_id: variation.id,
        product_id: create.id,
        product_name: "Peça criada apenas no teste",
        size: "M",
        color: "Preto",
        unit_price_cents: 1000,
        quantity: 1,
        available_stock: 2,
      },
    ];
    const pending = {
      items: [{ variation_id: variation.id, quantity: 1 }],
      payments: [{ method: "pix", amount_cents: 1000 }],
      discount_cents: 0,
      customer_name: null,
      customer_phone: null,
      idempotency_key: key,
    };
    // Simulate a committed checkout whose response was lost; recover it from persisted draft.
    await nativeFetch(base + "/api/sales/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + login.token,
      },
      body: JSON.stringify(pending),
    });
    localStorage.setItem(
      "lory_pos_v1_" + login.user.id,
      JSON.stringify({ cart, pending }),
    );
    await render(
      React.createElement(POS, {
        currentUser: login.user,
        isCashOpen: true,
        settings: null,
        onOpenCash: () => {},
      }),
    );
    await wait();
    await check("PDV restaura operação pendente após recarregar", () =>
      assert.match(document.body.textContent, /venda aguardando confirmação/),
    );
    const collect = [...document.querySelectorAll("button")].find((b) =>
      b.textContent.includes("Cobrar /"),
    );
    assert.ok(collect);
    await act(async () => collect.click());
    const finalize = [...document.querySelectorAll("button")].find(
      (b) =>
        b.textContent.includes("Concluir Venda") &&
        b.textContent.includes("Comprovante"),
    );
    assert.ok(finalize);
    await act(async () => {
      finalize.click();
      await new Promise((r) => setTimeout(r, 100));
    });
    await wait();
    await check(
      "Retentativa no PDV não duplica venda e carrega comprovante",
      async () => {
        assert.equal((await get("SELECT COUNT(*) AS n FROM sales")).n, 1);
        assert.match(document.body.textContent, /DOCUMENTO NÃO FISCAL/);
      },
    );
    const { SettingsManager } = require(client + "/src/components/SettingsManager.tsx");
    await render(React.createElement(SettingsManager, { settings: null, currentUser: login.user, onSettingsUpdated: () => {} }));
    const teamTab = [...document.querySelectorAll("button")].find(b => b.textContent.includes("Equipe"));
    assert.ok(teamTab);
    await act(async () => teamTab.click()); await wait();
    const editUser = document.querySelector('button[aria-label="Editar usuário Administrador"]') || [...document.querySelectorAll('button[aria-label]')].find(b => b.getAttribute('aria-label').startsWith('Editar usuário'));
    assert.ok(editUser); await act(async () => editUser.click());
    await check("Equipe abre edição com login preenchido e senha opcional vazia", () => {
      assert.equal(document.getElementById("team-newUsername").value, "ui-admin");
      assert.equal(document.getElementById("team-password").value, "");
      assert.equal(document.getElementById("team-password").required, false);
      assert.equal(document.getElementById("team-password").minLength, 12);
    });
    await act(async () => [...document.querySelectorAll("button")].find(b => b.textContent === "Cancelar").click());
    await nativeFetch(base + "/api/products/categories", { method: "POST", headers: {"Content-Type":"application/json",Authorization:"Bearer " + login.token}, body: JSON.stringify({name:"Categoria UI"}) });
    await act(async () => [...document.querySelectorAll("button")].find(b => b.textContent === "Categorias").click()); await wait();
    await act(async () => [...document.querySelectorAll("button")].find(b => b.textContent === "Editar categoria Categoria UI").click());
    await check("Categoria abre edição pelo identificador original", () => assert.equal(document.getElementById("category-name").value, "Categoria UI"));
    const { Dashboard } = require(client + "/src/components/Dashboard.tsx");
    global.fetch = (url, options) => String(url).includes("/reports/dashboard") ? Promise.reject(new Error("Falha de teste")) : nativeFetch(new URL(url, base), options);
    await render(React.createElement(Dashboard, {currentUser:login.user, onNavigateToProducts:()=>{}})); await wait();
    await check("Painel com falha oferece retentativa sem carregamento infinito", () => {
      assert.match(document.body.textContent, /Falha de teste/);
      assert.doesNotMatch(document.body.textContent, /Carregando métricas/);
    });
    global.fetch = (url, options) => nativeFetch(new URL(url, base), options);
    await act(async () => [...document.querySelectorAll("button")].find(b => b.textContent === "Atualizar painel").click()); await wait();
    await check("Painel recupera indicadores e oferece filtro de datas", () => {
      assert.match(document.body.textContent, /Receita Líquida/);
      assert.ok(document.getElementById("report-start"));
      assert.ok(document.getElementById("report-end"));
    });
    const { App } = require(client + "/src/App.tsx");
    let reloadNumber = 0;
    const reloadApp = async () => {
      await render(React.createElement(App, { key: ++reloadNumber }));
      for (let attempt = 0; attempt < 20; attempt++) {
        await wait();
        if (!/Restaurando seu acesso|Carregando métricas/.test(document.body.textContent)) break;
      }
    };
    const clickText = async (text) => {
      const button = [...document.querySelectorAll("button")].find(b => b.textContent === text);
      assert.ok(button, text);
      await act(async () => button.click());
      await wait();
    };
    await reloadApp();
    await check("Sessão existente abre o PDV e permanece após recarregar", async () => {
      assert.match(document.body.textContent, /Cobrar \/|Carrinho/);
      await reloadApp();
      assert.match(document.body.textContent, /Cobrar \/|Carrinho/);
      assert.doesNotMatch(document.body.textContent, /Vitrine & Coleção/);
    });
    await clickText("Painel");
    await reloadApp();
    await check("Recarregar mantém o painel de gestão selecionado", () => {
      assert.match(document.body.textContent, /Receita Líquida/);
      assert.ok(document.getElementById("report-start"));
    });
    const viewStorageKey = "lory_view_v1_" + login.user.id;
    localStorage.setItem(viewStorageKey, "tela-inexistente");
    await reloadApp();
    await check("Tela salva inválida retorna ao PDV", () => assert.match(document.body.textContent, /Cobrar \/|Carrinho/));
    global.fetch = (url, options) => String(url) === "/api/auth/me" ? Promise.reject(new Error("offline")) : nativeFetch(new URL(url, base), options);
    await reloadApp();
    await check("Falha temporária preserva sessão e permite restaurar o PDV", async () => {
      assert.match(document.body.textContent, /Não foi possível verificar seu acesso/);
      assert.equal(localStorage.getItem("lory_auth_token"), login.token);
      assert.doesNotMatch(document.body.textContent, /Cobrar \/|Vitrine & Coleção/);
      global.fetch = (url, options) => nativeFetch(new URL(url, base), options);
      await clickText("Tentar novamente");
      assert.match(document.body.textContent, /Cobrar \/|Carrinho/);
    });
    await act(async () => document.querySelector('button[title="Sair do sistema"]').click());
    await reloadApp();
    await check("Sair encerra o acesso e recarregar mantém a vitrine", () => {
      assert.equal(localStorage.getItem("lory_auth_token"), null);
      assert.equal(localStorage.getItem(viewStorageKey), null);
      assert.match(document.body.textContent, /Vitrine & Coleção/);
    });
    localStorage.setItem("lory_auth_token", "token-invalido");
    localStorage.setItem(viewStorageKey, "settings");
    await reloadApp();
    await check("Sessão inválida não restaura telas internas", () => {
      assert.equal(localStorage.getItem("lory_auth_token"), null);
      assert.match(document.body.textContent, /Vitrine & Coleção/);
      assert.doesNotMatch(document.body.textContent, /Painel Gerencial|Cobrar \/|Carrinho/);
    });
    console.log(
      `\n${checks} testes de componentes aprovados em DOM simulado (sem validação visual).`,
    );
  } finally {
    await act(async () => root.unmount());
    await new Promise((r) => server.close(r));
    await closeDB();
    fs.rmSync(dir, { recursive: true, force: true });
    dom.window.close();
    global.fetch = nativeFetch;
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
