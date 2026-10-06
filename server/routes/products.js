const express = require("express");
const router = express.Router();
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { get, query, run, transaction, getDbPath } = require("../db");
const { authenticate, requireRole, logAudit } = require("../middleware/auth");
const { integer, text } = require("../validation");
const { stock } = require("../commerce");
async function view(p, role) {
  const result = {
    ...p,
    images: JSON.parse(p.images || "[]"),
    variations: await query(
      "SELECT * FROM product_variations WHERE product_id=? ORDER BY size,color",
      [p.id],
    ),
  };
  result.total_stock = result.variations.reduce((s, v) => s + v.stock, 0);
  result.has_low_stock = result.variations.some((v) => v.stock <= v.min_stock);
  if (role !== "admin") delete result.cost_price_cents;
  return result;
}
function imageURLs(values) {
  if (!Array.isArray(values) || values.length > 10)
    throw new Error("Informe até 10 fotos.");
  return values.map((value) => {
    if (
      typeof value !== "string" ||
      value.length > 2000 ||
      (!value.startsWith("/uploads/") && !/^https:\/\//.test(value))
    )
      throw new Error("Use fotos enviadas ou URLs HTTPS válidas.");
    return value;
  });
}
async function validateProduct(body, existing) {
  const name = text(body.name, "Nome", 200),
    description = text(body.description ?? "", "Descrição", 4000, false);
  const sale = integer(body.sale_price_cents, "Preço de venda", 1),
    cost = integer(body.cost_price_cents ?? 0, "Preço de custo");
  const promo =
    body.promo_price_cents == null
      ? null
      : integer(body.promo_price_cents, "Preço promocional", 1);
  if (promo !== null && promo > sale)
    throw new Error("Promoção não pode ser superior ao preço normal.");
  const category = body.category_id || null;
  if (
    category &&
    !(await get("SELECT id FROM categories WHERE id=?", [category]))
  )
    throw new Error("Categoria inválida.");
  if (
    !Array.isArray(body.variations) ||
    !body.variations.length ||
    body.variations.length > 200
  )
    throw new Error("Cadastre ao menos um tamanho e cor.");
  const combinations = new Set();
  const variations = await Promise.all(
    body.variations.map(async (v) => {
      const size = text(v.size, "Tamanho", 30),
        color = text(v.color, "Cor", 80),
        combo = size.toLowerCase() + "|" + color.toLowerCase();
      if (combinations.has(combo)) throw new Error("Tamanho e cor repetidos.");
      combinations.add(combo);
      const old =
        v.id && existing
          ? await get(
              "SELECT * FROM product_variations WHERE id=? AND product_id=?",
              [v.id, existing.id],
            )
          : null;
      if (v.id && !old) throw new Error("Variação inválida.");
      return {
        id: old?.id ?? randomUUID(),
        size,
        color,
        sku: v.sku ? text(v.sku, "SKU", 100) : null,
        barcode: v.barcode ? text(v.barcode, "Código de barras", 100) : null,
        stock: old?.stock ?? integer(v.stock ?? 0, "Estoque"),
        min_stock: integer(v.min_stock ?? 1, "Estoque mínimo"),
        old,
      };
    }),
  );
  if (
    existing &&
    (
      await query("SELECT id FROM product_variations WHERE product_id=?", [
        existing.id,
      ])
    ).some((v) => !variations.some((n) => n.id === v.id))
  )
    throw new Error(
      "Mantenha as variações existentes para preservar o histórico.",
    );
  for (const v of variations)
    for (const field of ["sku", "barcode"])
      if (
        v[field] &&
        (await get(
          `SELECT id FROM product_variations WHERE ${field}=? AND id!=?`,
          [v[field], v.id],
        ))
      )
        throw new Error(
          `${field === "sku" ? "SKU" : "Código de barras"} já utilizado.`,
        );
  const codes = new Set();
  for (const v of variations)
    for (const field of ["sku", "barcode"])
      if (v[field]) {
        const code = field + "|" + v[field];
        if (codes.has(code)) throw new Error("Códigos repetidos na grade.");
        codes.add(code);
      }
  return {
    name,
    description,
    sale,
    cost,
    promo,
    category,
    reference: body.reference ? text(body.reference, "Referência", 100) : null,
    images: JSON.stringify(imageURLs(body.images ?? [])),
    showcase: body.is_showcase ? 1 : 0,
    variations,
  };
}
router.get("/categories", authenticate, async (req, res) =>
  res.json(await query("SELECT * FROM categories ORDER BY name")),
);
router.post(
  "/categories",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    try {
      const name = text(req.body.name, "Categoria", 100),
        id = randomUUID();
      await run(
        "INSERT INTO categories(id,name,description,created_at) VALUES (?,?,?,?)",
        [id, name, "", new Date().toISOString()],
      );
      res.status(201).json({
        id,
        name,
      });
    } catch (error) {
      res.status(error.databaseFailure ? 503 : 400).json({
        error: error.databaseFailure
          ? "Conexão interrompida. Tente novamente com a mesma operação."
          : error.message,
      });
    }
  },
);
router.put("/categories/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const category = await transaction(async () => {
      if (!(await get("SELECT id FROM categories WHERE id=?", [req.params.id])))
        throw Object.assign(new Error("Categoria não encontrada."), { status: 404 });
      const name = text(req.body.name, "Categoria", 100);
      if (await get("SELECT id FROM categories WHERE name=? AND id!=?", [name, req.params.id]))
        throw Object.assign(new Error("Categoria já existe."), { status: 409 });
      await run("UPDATE categories SET name=? WHERE id=?", [name, req.params.id]);
      await logAudit(req.user.id, "UPDATE_CATEGORY", "category", req.params.id, { name });
      return await get("SELECT * FROM categories WHERE id=?", [req.params.id]);
    });
    res.json(category);
  } catch (error) {
    res.status(error.status || (error.databaseFailure ? 503 : 400)).json({ error: error.databaseFailure ? "Conexão interrompida. Tente novamente." : error.message });
  }
});
router.post(
  "/images/upload",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    try {
      const raw = req.body.data;
      if (typeof raw !== "string") throw new Error("Foto inválida.");
      const match = raw.match(
        /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/,
      );
      if (!match) throw new Error("Use JPEG, PNG ou WebP.");
      const buffer = Buffer.from(match[2], "base64");
      if (!buffer.length || buffer.length > 2.5 * 1024 * 1024)
        throw new Error("A foto deve ter até 2,5 MB.");
      const valid =
        match[1] === "jpeg"
          ? buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
          : match[1] === "png"
            ? buffer
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : buffer.toString("ascii", 0, 4) === "RIFF" &&
              buffer.toString("ascii", 8, 12) === "WEBP";
      if (!valid) throw new Error("Conteúdo da foto inválido.");
      const name =
        randomUUID() + "." + (match[1] === "jpeg" ? "jpg" : match[1]);
      await run(
        "INSERT INTO uploaded_images(id,mime_type,content_base64,created_by,created_at) VALUES (?,?,?,?,?)",
        [
          name,
          "image/" + match[1],
          buffer.toString("base64"),
          req.user.id,
          new Date().toISOString(),
        ],
      );
      res.status(201).json({
        url: "/uploads/" + name,
      });
    } catch (error) {
      res.status(error.databaseFailure ? 503 : 400).json({
        error: error.databaseFailure
          ? "Conexão interrompida. Tente novamente com a mesma operação."
          : error.message,
      });
    }
  },
);
router.get("/stock/history", authenticate, async (req, res) => {
  let sql =
    "SELECT sm.*,p.name AS product_name,pv.size,pv.color,u.name AS user_name FROM stock_movements sm JOIN product_variations pv ON pv.id=sm.variation_id JOIN products p ON p.id=pv.product_id JOIN users u ON u.id=sm.user_id";
  const params = [];
  if (req.query.variation_id) {
    sql += " WHERE sm.variation_id=?";
    params.push(req.query.variation_id);
  }
  res.json(await query(sql + " ORDER BY sm.created_at DESC LIMIT 200", params));
});
router.post(
  "/stock/movement",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    try {
      const { variation_id, type } = req.body,
        reason = text(req.body.reason, "Motivo", 500),
        qty = integer(
          req.body.quantity,
          "Quantidade",
          type === "adjust" ? 0 : 1,
        );
      if (!["in", "out", "adjust"].includes(type))
        throw new Error("Movimento inválido.");
      const result = await transaction(async () => {
        const v = await get("SELECT stock FROM product_variations WHERE id=?", [
          variation_id,
        ]);
        if (!v) throw new Error("Peça inexistente.");
        const delta =
          type === "adjust" ? qty - v.stock : type === "out" ? -qty : qty;
        await stock(variation_id, delta, type, reason, null, req.user.id);
        await logAudit(
          req.user.id,
          "STOCK_MOVEMENT",
          "variation",
          variation_id,
          {
            delta,
            reason,
          },
        );
        return {
          previous_stock: v.stock,
          new_stock: v.stock + delta,
        };
      });
      res.status(201).json(result);
    } catch (error) {
      res.status(error.databaseFailure ? 503 : 400).json({
        error: error.databaseFailure
          ? "Conexão interrompida. Tente novamente com a mesma operação."
          : error.message,
      });
    }
  },
);
router.get("/", authenticate, async (req, res) => {
  let sql =
    "SELECT p.*,c.name AS category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE 1=1";
  const params = [];
  if (req.query.status && req.query.status !== "all") {
    sql += " AND p.status=?";
    params.push(req.query.status);
  }
  if (req.query.search) {
    sql += " AND (p.name LIKE ? OR p.reference LIKE ?)";
    params.push("%" + req.query.search + "%", "%" + req.query.search + "%");
  }
  res.json(
    await Promise.all(
      (await query(sql + " ORDER BY p.name", params)).map(
        async (p) => await view(p, req.user.role),
      ),
    ),
  );
});
router.get("/:id", authenticate, async (req, res) => {
  const p = await get("SELECT * FROM products WHERE id=?", [req.params.id]);
  return p
    ? res.json(await view(p, req.user.role))
    : res.status(404).json({
        error: "Produto não encontrado.",
      });
});
async function save(req, res, update) {
  try {
    const result = await transaction(async () => {
      const existing = update
        ? await get("SELECT * FROM products WHERE id=?", [req.params.id])
        : null;
      if (update && !existing) throw new Error("Produto não encontrado.");
      const p = await validateProduct(req.body, existing),
        id = existing?.id ?? randomUUID(),
        now = new Date().toISOString();
      if (existing)
        await run(
          "UPDATE products SET name=?,description=?,category_id=?,reference=?,cost_price_cents=?,sale_price_cents=?,promo_price_cents=?,images=?,is_showcase=?,updated_at=? WHERE id=?",
          [
            p.name,
            p.description,
            p.category,
            p.reference,
            p.cost,
            p.sale,
            p.promo,
            p.images,
            p.showcase,
            now,
            id,
          ],
        );
      else
        await run(
          "INSERT INTO products(id,name,description,category_id,reference,cost_price_cents,sale_price_cents,promo_price_cents,images,is_showcase,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'active',?,?)",
          [
            id,
            p.name,
            p.description,
            p.category,
            p.reference,
            p.cost,
            p.sale,
            p.promo,
            p.images,
            p.showcase,
            now,
            now,
          ],
        );
      for (const v of p.variations) {
        if (v.old)
          await run(
            "UPDATE product_variations SET size=?,color=?,sku=?,barcode=?,min_stock=?,updated_at=? WHERE id=?",
            [v.size, v.color, v.sku, v.barcode, v.min_stock, now, v.id],
          );
        else {
          await run(
            "INSERT INTO product_variations(id,product_id,size,color,sku,barcode,stock,min_stock,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?,?)",
            [
              v.id,
              id,
              v.size,
              v.color,
              v.sku,
              v.barcode,
              v.min_stock,
              now,
              now,
            ],
          );
          if (v.stock)
            await stock(
              v.id,
              v.stock,
              "in",
              "Estoque inicial informado",
              id,
              req.user.id,
            );
        }
      }
      await logAudit(
        req.user.id,
        update ? "UPDATE_PRODUCT" : "CREATE_PRODUCT",
        "product",
        id,
        {
          name: p.name,
        },
      );
      return {
        id,
      };
    });
    res.status(update ? 200 : 201).json({
      ...result,
      message: "Produto salvo.",
    });
  } catch (error) {
    res.status(error.databaseFailure ? 503 : 400).json({
      error: error.databaseFailure
        ? "Conexão interrompida. Tente novamente com a mesma operação."
        : error.message,
    });
  }
}
router.post(
  "/",
  authenticate,
  requireRole("admin"),
  async (req, res) => await save(req, res, false),
);
router.put(
  "/:id",
  authenticate,
  requireRole("admin"),
  async (req, res) => await save(req, res, true),
);
router.delete("/:id", authenticate, requireRole("admin"), async (req, res) => {
  const p = await get("SELECT id FROM products WHERE id=?", [req.params.id]);
  if (!p)
    return res.status(404).json({
      error: "Produto não encontrado.",
    });
  await transaction(async () => {
    await run(
      "UPDATE products SET status='archived',is_showcase=0,updated_at=? WHERE id=?",
      [new Date().toISOString(), p.id],
    );
    await logAudit(req.user.id, "ARCHIVE_PRODUCT", "product", p.id, {});
  });
  res.json({
    archived: true,
    message: "Produto arquivado; histórico preservado.",
  });
});
module.exports = router;
