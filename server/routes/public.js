const express = require("express");
const router = express.Router();
const { query, get, run, transaction } = require("../db");
const { authenticate, requireRole, logAudit } = require("../middleware/auth");

// Public Store Settings
router.get("/settings", async (req, res) => {
  const settingsRows = await query("SELECT key, value FROM store_settings");
  const settings = {};
  settingsRows.forEach((r) => {
    // Only return non-sensitive public settings
    settings[r.key] = r.value;
  });
  return res.json({
    store_name: settings.store_name || "Lory Boutique",
    segment: settings.segment || "Roupas Femininas",
    address: settings.address || "",
    whatsapp: settings.whatsapp || "",
    whatsapp_raw: settings.whatsapp_raw || "",
    instagram: settings.instagram || "",
    instagram_handle: settings.instagram_handle || "",
    operation_model: settings.operation_model || "Retirada na loja física",
    cnpj: settings.cnpj || "",
    cep: settings.cep || "",
    business_hours: settings.business_hours || "",
    demo_mode: settings.demo_mode === "1",
  });
});

// Update Store Settings (admin only)
router.put(
  "/settings",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const allowedKeys = [
      "store_name",
      "segment",
      "address",
      "whatsapp",
      "whatsapp_raw",
      "instagram",
      "instagram_handle",
      "operation_model",
      "cnpj",
      "cep",
      "business_hours",
    ];
    try {
      const updates = Object.entries(req.body)
        .filter(([key]) => allowedKeys.includes(key))
        .map(([key, val]) => {
          const value = val == null ? "" : String(val);
          if (value.length > 2000) throw new Error("Configuração muito longa.");
          if (
            key === "instagram" &&
            value &&
            !/^https:\/\/(www\.)?instagram\.com\//.test(value)
          )
            throw new Error("Use um endereço HTTPS do Instagram.");
          if (key === "whatsapp_raw" && !/^\d{10,15}$/.test(value))
            throw new Error("WhatsApp inválido.");
          return [key, value];
        });
      await transaction(async () => {
        for (const [key, value] of updates)
          await run(
            "INSERT INTO store_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            [key, value],
          );
        await logAudit(
          req.user.id,
          "UPDATE_SETTINGS",
          "store_settings",
          null,
          Object.fromEntries(updates),
        );
      });
      return res.json({
        message: "Configurações atualizadas.",
      });
    } catch (error) {
      return res.status(error.databaseFailure ? 503 : 400).json({
        error: error.databaseFailure
          ? "Conexão interrompida. Tente novamente com a mesma operação."
          : error.message,
      });
    }
  },
);

// Public Showcase Categories
router.get("/categories", async (req, res) => {
  const cats = await query(
    "SELECT id, name, description FROM categories ORDER BY name ASC",
  );
  return res.json(cats);
});

// Public Showcase Products (Only active & is_showcase=1)
router.get("/products", async (req, res) => {
  const { category_id, search, min_price, max_price, size, color } = req.query;
  let sql = `
    SELECT
      p.id, p.name, p.description, p.category_id, p.reference,
      p.sale_price_cents, p.promo_price_cents, p.images, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.status = 'active' AND p.is_showcase = 1
  `;
  const params = [];
  if (category_id) {
    sql += " AND p.category_id = ?";
    params.push(category_id);
  }
  if (search) {
    sql += " AND (p.name LIKE ? OR p.description LIKE ? OR p.reference LIKE ?)";
    const wildcard = `%${search.trim()}%`;
    params.push(wildcard, wildcard, wildcard);
  }
  if (min_price) {
    sql += " AND COALESCE(p.promo_price_cents, p.sale_price_cents) >= ?";
    params.push(parseInt(min_price, 10));
  }
  if (max_price) {
    sql += " AND COALESCE(p.promo_price_cents, p.sale_price_cents) <= ?";
    params.push(parseInt(max_price, 10));
  }
  sql += " ORDER BY p.created_at DESC";
  const products = await query(sql, params);

  // Fetch variations with availability (NOT leaking cost prices)
  const results = await Promise.all(
    products.map(async (p) => {
      let variationsSql =
        "SELECT id, size, color, stock FROM product_variations WHERE product_id = ?";
      const varParams = [p.id];
      if (size) {
        variationsSql += " AND size = ?";
        varParams.push(size);
      }
      if (color) {
        variationsSql += " AND color = ?";
        varParams.push(color);
      }
      variationsSql += " ORDER BY size ASC, color ASC";
      const variations = await query(variationsSql, varParams);
      const images = p.images ? JSON.parse(p.images) : [];
      const totalAvailable = variations.reduce(
        (sum, v) => sum + Math.max(0, v.stock),
        0,
      );
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        category_id: p.category_id,
        category_name: p.category_name,
        reference: p.reference,
        sale_price_cents: p.sale_price_cents,
        promo_price_cents: p.promo_price_cents,
        images,
        variations: variations.map((v) => ({
          id: v.id,
          size: v.size,
          color: v.color,
          available: v.stock > 0,
          stock_units: v.stock, // For informational badge
        })),
        is_available: totalAvailable > 0,
      };
    }),
  );

  // If size or color filter applied, only keep products that have matching variations
  const filtered =
    size || color ? results.filter((p) => p.variations.length > 0) : results;
  return res.json(filtered);
});

// Public Product Detail
router.get("/products/:id", async (req, res) => {
  const { id } = req.params;
  const p = await get(
    `SELECT
       p.id, p.name, p.description, p.category_id, p.reference,
       p.sale_price_cents, p.promo_price_cents, p.images, c.name as category_name
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id
     WHERE p.id = ? AND p.status = 'active' AND p.is_showcase = 1`,
    [id],
  );
  if (!p) {
    return res.status(404).json({
      error: "Produto não encontrado na vitrine.",
    });
  }
  const variations = await query(
    "SELECT id, size, color, stock FROM product_variations WHERE product_id = ? ORDER BY size ASC, color ASC",
    [p.id],
  );
  const images = p.images ? JSON.parse(p.images) : [];
  const totalAvailable = variations.reduce(
    (sum, v) => sum + Math.max(0, v.stock),
    0,
  );
  return res.json({
    id: p.id,
    name: p.name,
    description: p.description,
    category_id: p.category_id,
    category_name: p.category_name,
    reference: p.reference,
    sale_price_cents: p.sale_price_cents,
    promo_price_cents: p.promo_price_cents,
    images,
    variations: variations.map((v) => ({
      id: v.id,
      size: v.size,
      color: v.color,
      available: v.stock > 0,
      stock_units: v.stock,
    })),
    is_available: totalAvailable > 0,
  });
});
module.exports = router;
