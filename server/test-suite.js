const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
// Only explicitly supplied local PostgreSQL URLs are accepted in tests.
const testURL = process.env.LORY_TEST_DATABASE_URL;
process.env.DATABASE_URL = "";
if (testURL) {
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(testURL).hostname))
    throw new Error("Banco de teste deve ser local.");
  process.env.DATABASE_URL = testURL;
}
// Always isolate test data, including administrator credentials, from store records.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lory-tests-"));
process.env.DB_PATH = path.join(dir, "test.db");
process.env.JWT_SECRET = crypto.randomBytes(48).toString("hex");
process.env.ADMIN_PASSWORD = crypto.randomBytes(24).toString("hex");
process.env.ADMIN_USERNAME = "test-admin";
process.env.PORT = "0";
const { startServer } = require("./index");
const {
  get,
  query,
  run,
  closeDB,
  initDB,
  transaction,
  postgresSQL,
} = require("./db");
const { seedDatabase } = require("./seed");
(async () => {
  if (testURL) {
    await initDB();
    for (const role of ["anon", "authenticated", "service_role"]) {
      await run(
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role}; END IF; END $$`,
      );
    }
    await run(
      fs.readFileSync(
        path.join(__dirname, "../supabase/sql/01_initial.sql"),
        "utf8",
      ),
    );
    await run(
      fs.readFileSync(
        path.join(__dirname, "../supabase/sql/02_online.sql"),
        "utf8",
      ),
    );
  }
  const server = testURL
    ? await new Promise((resolve) => {
        const listener = require("node:http")
          .createServer(require("../api/index"))
          .listen(0, "127.0.0.1", () => resolve(listener));
      })
    : await startServer();
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let token;
  let passed = 0;
  async function req(
    route,
    body,
    auth = token,
    method = body ? "POST" : "GET",
  ) {
    const r = await fetch(base + route, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(auth
          ? {
              Authorization: "Bearer " + auth,
            }
          : {}),
      },
      ...(body
        ? {
            body: JSON.stringify(body),
          }
        : {}),
    });
    const type = r.headers.get("content-type");
    return {
      status: r.status,
      data: type?.includes("json") ? await r.json() : await r.text(),
    };
  }
  const test = async (name, fn) => {
    await fn();
    passed++;
    console.log("✓", name);
  };
  try {
    await test("Instalação sem produtos, vendas ou caixa", async () => {
      for (const table of [
        "products",
        "product_variations",
        "sales",
        "cash_registers",
      ])
        assert.equal((await get(`SELECT COUNT(*) AS n FROM ${table}`)).n, 0);
    });
    if (!testURL)
      await test("Chaves estrangeiras ativas", async () =>
        assert.equal((await get("PRAGMA foreign_keys")).foreign_keys, 1));
    const login = await req(
      "/auth/login",
      {
        username: "test-admin",
        password: process.env.ADMIN_PASSWORD,
      },
      null,
    );
    assert.equal(login.status, 200);
    token = login.data.token;
    await test("Acesso padrão removido", async () =>
      assert.equal(
        (
          await get(
            "SELECT COUNT(*) AS n FROM users WHERE username IN ('admin','atendente')",
          )
        ).n,
        0,
      ));
    const pub = await req("/public/products");
    await test("Vitrine começa vazia", () => assert.deepEqual(pub.data, []));
    await req("/cash/open", {
      initial_amount_cents: 0,
    });
    const newProduct = async (stock = 10, price = 10000) => {
      const r = await req("/products", {
        name: "Peça de teste",
        description: "",
        sale_price_cents: price,
        cost_price_cents: 5000,
        images: [],
        is_showcase: 1,
        variations: [
          {
            size: "M",
            color: "Preto",
            stock,
            min_stock: 0,
          },
        ],
      });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      return (await req("/products/" + r.data.id)).data;
    };
    const p = await newProduct();
    const id = p.variations[0].id;
    await test("Estoque mínimo zero preservado", () =>
      assert.equal(p.variations[0].min_stock, 0));
    const checkout = (variation, qty = 1, extra = {}) => ({
      items: [
        {
          variation_id: variation,
          quantity: qty,
        },
      ],
      payments: [
        {
          method: "money",
          amount_cents: 10000 * qty,
        },
      ],
      idempotency_key: crypto.randomUUID(),
      ...extra,
    });
    const payload = checkout(id, 1, {
      discount_cents: 2000,
      payments: [
        {
          method: "money",
          amount_cents: 8000,
        },
      ],
    });
    const sale = await req("/sales/checkout", payload);
    assert.equal(sale.status, 201, JSON.stringify(sale.data));
    const sold = (await req("/sales/" + sale.data.sale.saleId)).data;
    const dup = await req("/sales/checkout", payload);
    await test("Retentativa usa a mesma venda", () => {
      assert.equal(dup.status, 200);
      assert.equal(dup.data.sale.saleId, sold.id);
    });
    await test("Recuperação por chave", async () =>
      assert.equal(
        (
          await get("SELECT id FROM sales WHERE idempotency_key=?", [
            payload.idempotency_key,
          ])
        ).id,
        sold.id,
      ));
    const altered = await req("/sales/checkout", {
      ...payload,
      discount_cents: 0,
    });
    await test("Reuso de chave com payload diferente rejeitado", () =>
      assert.equal(altered.status, 400));
    const rPayload = {
      sale_id: sold.id,
      items: [
        {
          sale_item_id: sold.items[0].id,
          quantity: 1,
          restock: true,
        },
      ],
      refund_method: "money",
      reason: "Devolução de teste",
      idempotency_key: crypto.randomUUID(),
    };
    const returned = await req("/returns/process", rPayload);
    const cash = (await req("/cash/current")).data;
    await test("Devolução respeita desconto e caixa", () => {
      assert.equal(returned.status, 201, JSON.stringify(returned.data));
      assert.equal(returned.data.refund_amount_cents, 8000);
      assert.equal(cash.summary.expected_physical_cash_cents, 0);
    });
    const retDup = await req("/returns/process", rPayload);
    await test("Retentativa de devolução não duplica restituição", async () => {
      assert.equal(retDup.status, 200);
      assert.equal(
        (
          await get(
            "SELECT COUNT(*) AS n FROM financial_entries WHERE kind='refund'",
          )
        ).n,
        1,
      );
    });
    const dash = await req("/reports/dashboard");
    await test("Devolução integral zera receita e margem", () => {
      assert.equal(dash.data.gross_revenue_cents, 0);
      assert.equal(dash.data.margin_estimated_cents, 0);
    });
    const over = await req(
      "/sales/checkout",
      checkout(id, 1, {
        payments: [
          {
            method: "pix",
            amount_cents: 20000,
          },
          {
            method: "money",
            amount_cents: 100,
          },
        ],
      }),
    );
    await test("Troco não excede dinheiro recebido", () =>
      assert.equal(over.status, 400));
    const discount = await req(
      "/sales/checkout",
      checkout(id, 1, {
        discount_cents: 100000,
      }),
    );
    await test("Desconto excessivo rejeitado", () =>
      assert.equal(discount.status, 400));
    const stringPay = await req(
      "/sales/checkout",
      checkout(id, 1, {
        payments: [
          {
            method: "pix",
            amount_cents: "10000",
          },
        ],
      }),
    );
    await test("Valor de pagamento em texto rejeitado", () =>
      assert.equal(stringPay.status, 400));
    const neg = await req("/products", {
      name: "Inválido",
      sale_price_cents: 10000,
      variations: [
        {
          size: "P",
          color: "Rosa",
          stock: -5,
        },
      ],
    });
    await test("Estoque inicial negativo rejeitado", () =>
      assert.equal(neg.status, 400));
    const fractional = await req("/sales/checkout", checkout(id, 1.5));
    await test("Quantidade fracionária rejeitada", () =>
      assert.equal(fractional.status, 400));
    const raceProduct = await newProduct(1);
    const raceId = raceProduct.variations[0].id;
    const race = await Promise.all([
      await req("/sales/checkout", checkout(raceId)),
      await req("/sales/checkout", checkout(raceId)),
    ]);
    await test("Requisições simultâneas pela última unidade", async () => {
      assert.deepEqual(race.map((r) => r.status).sort(), [201, 400]);
      assert.equal(
        (await get("SELECT stock FROM product_variations WHERE id=?", [raceId]))
          .stock,
        0,
      );
    });
    const exchangeSale = (await req("/sales/checkout", checkout(id))).data.sale;
    const original = (await req("/sales/" + exchangeSale.saleId)).data;
    const newP = await newProduct(5, 12000);
    const exBody = {
      sale_id: original.id,
      returned_items: [
        {
          sale_item_id: original.items[0].id,
          quantity: 1,
          restock: true,
        },
      ],
      new_items: [
        {
          variation_id: newP.variations[0].id,
          quantity: 1,
        },
      ],
      payments: [
        {
          method: "pix",
          amount_cents: 2000,
        },
      ],
      reason: "Troca de teste",
      idempotency_key: crypto.randomUUID(),
    };
    const ex = await req("/returns/exchange", exBody);
    await test("Troca registra diferença, nova venda e histórico", async () => {
      assert.equal(ex.status, 201, JSON.stringify(ex.data));
      assert.equal(ex.data.difference_cents, 2000);
      assert.equal(
        (
          await get("SELECT exchange_credit_cents FROM sales WHERE id=?", [
            ex.data.exchange_sale_id,
          ])
        ).exchange_credit_cents,
        10000,
      );
      assert.equal(
        (
          await get(
            "SELECT amount_cents FROM financial_entries WHERE sale_id=? AND payment_method='pix'",
            [ex.data.exchange_sale_id],
          )
        ).amount_cents,
        2000,
      );
    });
    const cancellation = await req("/sales/checkout", checkout(id));
    const cancelId = cancellation.data.sale.saleId;
    const cancelDetail = (await req("/sales/" + cancelId)).data;
    assert.equal(
      (
        await req("/sales/" + cancelId + "/cancel", {
          reason: "Cancelamento de teste",
        })
      ).status,
      200,
    );
    const invalidEx = await req("/returns/exchange", {
      ...exBody,
      sale_id: cancelId,
      returned_items: [
        {
          sale_item_id: cancelDetail.items[0].id,
          quantity: 1,
          restock: true,
        },
      ],
      idempotency_key: crypto.randomUUID(),
    });
    await test("Troca de venda cancelada bloqueada", () =>
      assert.equal(invalidEx.status, 400));
    const qSale = (await req("/sales/checkout", checkout(id))).data.sale;
    const qDetail = (await req("/sales/" + qSale.id)).data;
    const negativeEx = await req("/returns/exchange", {
      ...exBody,
      sale_id: qSale.id,
      returned_items: [
        {
          sale_item_id: qDetail.items[0].id,
          quantity: -1,
          restock: true,
        },
      ],
      idempotency_key: crypto.randomUUID(),
    });
    await test("Quantidade negativa na troca bloqueada", () =>
      assert.equal(negativeEx.status, 400));
    const userPassword = crypto.randomBytes(16).toString("hex");
    await req("/auth/users", {
      name: "Atendente teste",
      username: "test-attendant",
      password: userPassword,
      role: "attendant",
    });
    const att = (
      await req(
        "/auth/login",
        {
          username: "test-attendant",
          password: userPassword,
        },
        null,
      )
    ).data.token;
    const forbidden = await req("/returns/process", rPayload, att);
    await test("Atendente não autoriza restituições", () =>
      assert.equal(forbidden.status, 403));
    const attProds = await req("/products", null, att);
    await test("Custo oculto para atendente", () =>
      assert.equal(
        attProds.data.some((p) => p.cost_price_cents !== undefined),
        false,
      ));
    const attDisc = await req(
      "/sales/checkout",
      checkout(id, 1, {
        discount_cents: 1,
      }),
      att,
    );
    await test("Desconto exige administrador", () =>
      assert.equal(attDisc.status, 400));
    const changeProd = await newProduct();
    const edited = await req(
      "/products/" + changeProd.id,
      {
        ...changeProd,
        name: "Peça editada",
      },
      token,
      "PUT",
    );
    await test("Edição mantém estoque e identificadores", async () => {
      assert.equal(edited.status, 200, JSON.stringify(edited.data));
      assert.equal(
        (
          await get("SELECT stock FROM product_variations WHERE id=?", [
            changeProd.variations[0].id,
          ])
        ).stock,
        10,
      );
    });
    const listing = await req("/sales?limit=2&page=1");
    await test("Histórico paginado", () => {
      assert.equal(listing.data.sales.length, 2);
      assert.ok(listing.data.total > 2);
    });
    const csv = await req("/reports/export/sales");
    await test("CSV disponível", () => assert.equal(csv.status, 200));
    const recovered = await req(
      "/sales/checkout/key/" + payload.idempotency_key,
    );
    await test("API recupera venda confirmada", () =>
      assert.equal(recovered.data.id, sold.id));
    const child = spawnSync(
      process.execPath,
      [
        "-e",
        testURL
          ? "const {Client}=require('pg');const c=new Client({connectionString:process.env.DATABASE_URL});(async()=>{await c.connect();console.log((await c.query('select count(*) as n from sales')).rows[0].n);await c.end()})().catch(e=>{console.error(e.message);process.exit(1)})"
          : "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.env.DB_PATH);console.log(d.prepare('select count(*) as n from sales').get().n);d.close()",
      ],
      {
        env: process.env,
        encoding: "utf8",
      },
    );
    await test("Outro processo lê vendas já confirmadas em disco", async () => {
      assert.equal(child.status, 0, child.stderr);
      assert.equal(
        Number(child.stdout.trim()),
        (await get("SELECT COUNT(*) AS n FROM sales")).n,
      );
    });
    const { dateBounds } = require("./validation");
    await test("Dia de São Paulo usa limite local", () =>
      assert.equal(
        dateBounds("2026-10-05", null).start,
        "2026-10-05T03:00:00.000Z",
      ));
    const lowPrice = await newProduct(10, 1);
    const tinyPayload = checkout(lowPrice.variations[0].id, 3, {
      payments: [
        {
          method: "money",
          amount_cents: 1,
        },
      ],
      discount_cents: 2,
    });
    const tiny = await req("/sales/checkout", tinyPayload);
    const td = (await req("/sales/" + tiny.data.sale.id)).data;
    let refunds = 0;
    for (let j = 0; j < 3; j++) {
      const rr = await req("/returns/process", {
        sale_id: td.id,
        items: [
          {
            sale_item_id: td.items[0].id,
            quantity: 1,
            restock: true,
          },
        ],
        reason: "Arredondamento",
        refund_method: "money",
        idempotency_key: crypto.randomUUID(),
      });
      assert.equal(rr.status, 201, JSON.stringify(rr.data));
      refunds += rr.data.refund_amount_cents;
    }
    await test("Devoluções fracionadas preservam centavos", () =>
      assert.equal(refunds, 1));
    const auth = require("../node_modules/jsonwebtoken");
    const forged = auth.sign(
      {
        id: login.data.user.id,
        version: 0,
      },
      "lory-boutique-secret-key-2026-secure",
    );
    const forgedRes = await req("/auth/users", null, forged);
    await test("Antigo segredo público não autentica", () =>
      assert.equal(forgedRes.status, 401));
    // Convert a marked legacy demo; repeated startup must not erase subsequently registered products.
    if (!testURL) {
      await run("UPDATE store_settings SET value='1' WHERE key='demo_mode'");
      await seedDatabase();
      await test("Conversão da demonstração remove todos os produtos e vendas", async () => {
        for (const t of [
          "products",
          "product_variations",
          "sales",
          "returns",
          "cash_registers",
        ])
          assert.equal((await get(`SELECT COUNT(*) AS n FROM ${t}`)).n, 0);
      });
    }
    const after = await newProduct();
    await seedDatabase();
    await test("Reinicialização preserva cadastro real posterior", async () =>
      assert.ok(await get("SELECT id FROM products WHERE id=?", [after.id])));
    await test("Conversão PostgreSQL preserva literais e parametriza valores", () => {
      assert.equal(
        postgresSQL("SELECT '?' AS label FROM products WHERE name LIKE ?"),
        "SELECT '?' AS label FROM products WHERE name ILIKE $1",
      );
    });
    await test("Erro em transação desfaz alteração", async () => {
      await assert.rejects(
        transaction(async () => {
          await run("INSERT INTO store_settings(key,value) VALUES (?,?)", [
            "rollback-test",
            "x",
          ]);
          throw new Error("falha simulada");
        }),
      );
      assert.equal(
        await get("SELECT value FROM store_settings WHERE key=?", [
          "rollback-test",
        ]),
        null,
      );
    });
    const photo =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";
    const uploaded = await req("/products/images/upload", {
      data: "data:image/png;base64," + photo,
    });
    await test("Foto enviada fica no banco e sobrevive à reabertura", async () => {
      assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
      await closeDB();
      await initDB();
      const response = await fetch(
        base.replace("/api", "") + uploaded.data.url,
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "image/png");
      assert.deepEqual(
        Buffer.from(await response.arrayBuffer()),
        Buffer.from(photo, "base64"),
      );
    });
    await test("Login limita tentativas usando registros persistentes", async () => {
      for (let n = 0; n < 10; n++)
        assert.equal(
          (
            await req(
              "/auth/login",
              { username: "inexistente", password: "senha-errada" },
              null,
            )
          ).status,
          401,
        );
      await closeDB();
      await initDB();
      assert.equal(
        (
          await req(
            "/auth/login",
            { username: "test-admin", password: process.env.ADMIN_PASSWORD },
            null,
          )
        ).status,
        429,
      );
    });
    console.log(
      `\n${passed} verificações aprovadas. Banco temporário removido.`,
    );
  } finally {
    await new Promise((r) => server.close(r));
    await closeDB();
    fs.rmSync(dir, {
      recursive: true,
      force: true,
    });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
