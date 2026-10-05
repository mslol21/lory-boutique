const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { get, run, transaction } = require('./db');

function seedDatabase(isDemo = true) {
  const existingUser = get('SELECT id FROM users LIMIT 1');
  if (existingUser) {
    return; // Already initialized
  }

  console.log('Populando dados iniciais no banco de dados...');

  transaction(() => {
    // 1. Initial Store Settings
    const initialSettings = [
      ['store_name', 'Lory Boutique'],
      ['segment', 'Roupas Femininas'],
      ['address', 'Rua Hipólito de Camargo, 45 — Guaianases, São Paulo/SP'],
      ['whatsapp', '(11) 94961-1902'],
      ['whatsapp_raw', '5511949611902'],
      ['instagram', 'https://www.instagram.com/loryboutiquel/'],
      ['instagram_handle', '@loryboutiquel'],
      ['operation_model', 'Retirada na loja física (sem entregas no momento)'],
      ['cnpj', ''],
      ['cep', ''],
      ['business_hours', ''],
      ['demo_mode', isDemo ? '1' : '0']
    ];

    for (const [key, val] of initialSettings) {
      run('INSERT INTO store_settings (key, value) VALUES (?, ?)', [key, val]);
    }

    // 2. Default Users
    const now = new Date().toISOString();
    const adminPasswordHash = bcrypt.hashSync('admin123', 10);
    const attendantPasswordHash = bcrypt.hashSync('atendente123', 10);

    const adminId = uuidv4();
    const attendantId = uuidv4();

    run(
      'INSERT INTO users (id, name, username, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [adminId, 'Administrador Lory', 'admin', adminPasswordHash, 'admin', 1, now]
    );

    run(
      'INSERT INTO users (id, name, username, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [attendantId, 'Atendente Loja', 'atendente', attendantPasswordHash, 'attendant', 1, now]
    );

    // 3. Categories
    const categories = [
      { id: uuidv4(), name: 'Vestidos', description: 'Vestidos casuais, midis e de festa' },
      { id: uuidv4(), name: 'Blusas & Tops', description: 'Blusas, croppeds e camisas femininas' },
      { id: uuidv4(), name: 'Calças & Alfaiataria', description: 'Calças jeans, pantalonas e alfaiataria' },
      { id: uuidv4(), name: 'Conjuntos', description: 'Conjuntos práticos e elegantes' },
      { id: uuidv4(), name: 'Blazers & Casacos', description: 'Peças de sobreposição e alfaiataria' }
    ];

    for (const cat of categories) {
      run('INSERT INTO categories (id, name, description, created_at) VALUES (?, ?, ?, ?)', [
        cat.id, cat.name, cat.description, now
      ]);
    }

    if (!isDemo) return;

    // 4. Sample Boutique Products (Women's Fashion)
    const demoProducts = [
      {
        name: 'Vestido Midi Canelado Manga Curta',
        description: 'Vestido midi confeccionado em malha canelada premium de toque suave. Caimento ajustado e elegante com fenda lateral sutil.',
        category_id: categories[0].id,
        reference: 'VMD-001',
        cost_price_cents: 4500, // R$ 45,00
        sale_price_cents: 9990, // R$ 99,90
        promo_price_cents: 8990, // R$ 89,90
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=800&auto=format&fit=crop&q=80'
        ]),
        is_showcase: 1,
        variations: [
          { size: 'P', color: 'Rosa Suave', sku: 'VMD001-P-ROS', barcode: '7891001001', stock: 4, min_stock: 1 },
          { size: 'M', color: 'Rosa Suave', sku: 'VMD001-M-ROS', barcode: '7891001002', stock: 5, min_stock: 2 },
          { size: 'G', color: 'Rosa Suave', sku: 'VMD001-G-ROS', barcode: '7891001003', stock: 3, min_stock: 1 },
          { size: 'M', color: 'Preto Clássico', sku: 'VMD001-M-PRT', barcode: '7891001004', stock: 4, min_stock: 1 }
        ]
      },
      {
        name: 'Blusa Crepe Decote V com Detalhe Dourado',
        description: 'Blusa feminina em crepe acetinado leve. Decote em V com delicado pingente dourado na gola. Perfeita para trabalho ou ocasiões especiais.',
        category_id: categories[1].id,
        reference: 'BLS-102',
        cost_price_cents: 3200, // R$ 32,00
        sale_price_cents: 7490, // R$ 74,90
        promo_price_cents: null,
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1608234808654-2a8875fa74f2?w=800&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1564257631407-4deb1f99d992?w=800&auto=format&fit=crop&q=80'
        ]),
        is_showcase: 1,
        variations: [
          { size: 'P', color: 'Terracota', sku: 'BLS102-P-TER', barcode: '7891002001', stock: 3, min_stock: 1 },
          { size: 'M', color: 'Terracota', sku: 'BLS102-M-TER', barcode: '7891002002', stock: 6, min_stock: 2 },
          { size: 'G', color: 'Terracota', sku: 'BLS102-G-TER', barcode: '7891002003', stock: 2, min_stock: 1 },
          { size: 'M', color: 'Off White', sku: 'BLS102-M-OFF', barcode: '7891002004', stock: 4, min_stock: 1 }
        ]
      },
      {
        name: 'Calça Alfaiataria Cintura Alta com Cinto',
        description: 'Calça feminina em alfaiataria refinada com corte reto alongador e bolso faca lateral. Acompanha cinto encapado no mesmo tom com fivela dourada.',
        category_id: categories[2].id,
        reference: 'CLC-203',
        cost_price_cents: 5500, // R$ 55,00
        sale_price_cents: 12990, // R$ 129,90
        promo_price_cents: null,
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=800&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&auto=format&fit=crop&q=80'
        ]),
        is_showcase: 1,
        variations: [
          { size: '36', color: 'Nude Areia', sku: 'CLC203-36-NUD', barcode: '7891003001', stock: 2, min_stock: 1 },
          { size: '38', color: 'Nude Areia', sku: 'CLC203-38-NUD', barcode: '7891003002', stock: 5, min_stock: 2 },
          { size: '40', color: 'Nude Areia', sku: 'CLC203-40-NUD', barcode: '7891003003', stock: 4, min_stock: 2 },
          { size: '42', color: 'Nude Areia', sku: 'CLC203-42-NUD', barcode: '7891003004', stock: 2, min_stock: 1 },
          { size: '38', color: 'Preto', sku: 'CLC203-38-PRT', barcode: '7891003005', stock: 3, min_stock: 1 }
        ]
      },
      {
        name: 'Conjunto Cropped Alfaiataria & Saia Midi',
        description: 'Conjunto moderno composto por cropped estruturado com alças largas e saia midi fluida com botões decorativos dourados.',
        category_id: categories[3].id,
        reference: 'CNJ-304',
        cost_price_cents: 6800, // R$ 68,00
        sale_price_cents: 15990, // R$ 159,90
        promo_price_cents: 13990, // R$ 139,90
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&auto=format&fit=crop&q=80'
        ]),
        is_showcase: 1,
        variations: [
          { size: 'P', color: 'Verde Oliva', sku: 'CNJ304-P-VRD', barcode: '7891004001', stock: 2, min_stock: 1 },
          { size: 'M', color: 'Verde Oliva', sku: 'CNJ304-M-VRD', barcode: '7891004002', stock: 3, min_stock: 1 },
          { size: 'M', color: 'Rosa Bebê', sku: 'CNJ304-M-ROS', barcode: '7891004003', stock: 4, min_stock: 1 }
        ]
      },
      {
        name: 'Blazer Alongado Alfaiataria Chic',
        description: 'Blazer forrado com corte alongado contemporâneo, bolsos embutidos e botões forrados. Estrutura impecável que transforma qualquer produção.',
        category_id: categories[4].id,
        reference: 'BLZ-405',
        cost_price_cents: 8000, // R$ 80,00
        sale_price_cents: 18990, // R$ 189,90
        promo_price_cents: null,
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1548624149-f9b2d86f9b88?w=800&auto=format&fit=crop&q=80'
        ]),
        is_showcase: 1,
        variations: [
          { size: 'P', color: 'Off White', sku: 'BLZ405-P-OFF', barcode: '7891005001', stock: 3, min_stock: 1 },
          { size: 'M', color: 'Off White', sku: 'BLZ405-M-OFF', barcode: '7891005002', stock: 4, min_stock: 1 },
          { size: 'G', color: 'Off White', sku: 'BLZ405-G-OFF', barcode: '7891005003', stock: 2, min_stock: 1 }
        ]
      }
    ];

    for (const prod of demoProducts) {
      const prodId = uuidv4();
      run(
        `INSERT INTO products (
          id, name, description, category_id, reference, cost_price_cents,
          sale_price_cents, promo_price_cents, images, is_showcase, status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        [
          prodId, prod.name, prod.description, prod.category_id, prod.reference,
          prod.cost_price_cents, prod.sale_price_cents, prod.promo_price_cents,
          prod.images, prod.is_showcase, now, now
        ]
      );

      for (const v of prod.variations) {
        const varId = uuidv4();
        run(
          `INSERT INTO product_variations (
            id, product_id, size, color, sku, barcode, stock, min_stock, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [varId, prodId, v.size, v.color, v.sku, v.barcode, v.stock, v.min_stock, now, now]
        );

        // Register initial inventory movement
        run(
          `INSERT INTO stock_movements (
            id, variation_id, type, quantity, previous_stock, new_stock, reason, reference_id, user_id, created_at
          ) VALUES (?, ?, 'in', ?, 0, ?, 'Inventário Inicial de Demonstração', NULL, ?, ?)`,
          [uuidv4(), varId, v.stock, v.stock, adminId, now]
        );
      }
    }

    console.log('Dados iniciais inseridos com sucesso!');
  });
}

module.exports = { seedDatabase };
