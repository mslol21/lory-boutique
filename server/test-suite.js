const http = require('http');
const { startServer } = require('./index');

async function runTestSuite() {
  console.log('--- INICIANDO TESTES AUTOMATIZADOS DO BACKEND ---');

  const server = await startServer();
  const baseUrl = 'http://localhost:3001';

  function request(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const options = {
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: {
          'Content-Type': 'application/json'
        }
      };
      if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
      }

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            parsed = data;
          }
          resolve({ status: res.statusCode, data: parsed });
        });
      });

      req.on('error', reject);
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  let adminToken = '';
  let attendantToken = '';

  try {
    // TEST 1: Login Admin
    console.log('\n[Teste 1] Login Admin');
    const loginAdmin = await request('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
    if (loginAdmin.status !== 200 || !loginAdmin.data.token) throw new Error('Falha no login do admin');
    adminToken = loginAdmin.data.token;
    console.log('✓ Admin autenticado com sucesso');

    // TEST 2: Login Atendente
    console.log('\n[Teste 2] Login Atendente & Restrições de Perfil');
    const loginAttendant = await request('POST', '/api/auth/login', { username: 'atendente', password: 'atendente123' });
    if (loginAttendant.status !== 200 || !loginAttendant.data.token) throw new Error('Falha no login do atendente');
    attendantToken = loginAttendant.data.token;
    console.log('✓ Atendente autenticado com sucesso');

    // Verify Attendant CANNOT see cost prices
    const attendantProducts = await request('GET', '/api/products', null, attendantToken);
    const hasCostPrice = attendantProducts.data.some(p => p.cost_price_cents !== undefined);
    if (hasCostPrice) throw new Error('VIOLAÇÃO DE SEGURANÇA: Atendente conseguiu visualizar custo de produto!');
    console.log('✓ Segurança: Preços de custo devidamente ocultados para atendente');

    // Verify Attendant CANNOT create user
    const attendantCreateUser = await request('POST', '/api/auth/users', { name: 'X', username: 'x', password: '123', role: 'attendant' }, attendantToken);
    if (attendantCreateUser.status !== 403) throw new Error('VIOLAÇÃO: Atendente conseguiu criar usuário!');
    console.log('✓ Segurança: Atendente bloqueado de funções administrativas (403)');

    // TEST 3: Vitrine Pública sem dados sensíveis e com campos em branco ocultos
    console.log('\n[Teste 3] Vitrine Pública');
    const publicSettings = await request('GET', '/api/public/settings');
    if (publicSettings.data.store_name !== 'Lory Boutique') throw new Error('Configurações públicas incorretas');
    if (publicSettings.data.cnpj !== '') throw new Error('CNPJ fictício detectado!');
    const publicProducts = await request('GET', '/api/public/products');
    if (!Array.isArray(publicProducts.data) || publicProducts.data.length === 0) throw new Error('Vitrine vazia');
    const publicHasCost = publicProducts.data.some(p => p.cost_price_cents !== undefined);
    if (publicHasCost) throw new Error('VIOLAÇÃO: Vitrine pública expôs preço de custo!');
    console.log(`✓ Vitrine pública retornou ${publicProducts.data.length} peças ativas sem dados confidenciais`);

    // TEST 4: Abertura de Caixa
    console.log('\n[Teste 4] Abertura de Caixa');
    const existingCash = await request('GET', '/api/cash/current', null, attendantToken);
    if (existingCash.data.open && existingCash.data.register) {
      await request('POST', '/api/cash/close', {
        register_id: existingCash.data.register.id,
        counted_cash_cents: existingCash.data.summary.expected_physical_cash_cents,
        notes: 'Fechamento pré-teste'
      }, attendantToken);
    }

    const openRes = await request('POST', '/api/cash/open', { initial_amount_cents: 10000 }, attendantToken); // R$ 100,00
    if (openRes.status !== 201) throw new Error('Falha ao abrir caixa: ' + JSON.stringify(openRes.data));
    console.log('✓ Caixa aberto com R$ 100,00 em dinheiro');

    // TEST 5: Cadastro de Novo Produto com Variações
    console.log('\n[Teste 5] Cadastro de Produto com Tamanhos e Cores');
    const runId = Date.now();
    const testRef = `CHM-${runId.toString().slice(-4)}`;
    const catsRes = await request('GET', '/api/products/categories', null, adminToken);
    const catId = catsRes.data[0].id;

    const newProdRes = await request('POST', '/api/products', {
      name: `Vestido Chemise Floral Botões ${runId.toString().slice(-4)}`,
      description: 'Chemise feminina com estampa floral suave e faixa para amarração na cintura.',
      category_id: catId,
      reference: testRef,
      cost_price_cents: 5000,
      sale_price_cents: 12000,
      promo_price_cents: 11000,
      images: ['https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800'],
      is_showcase: 1,
      variations: [
        { size: 'P', color: 'Rosa Bebê', sku: `CHM-P-${runId}`, stock: 5, min_stock: 1 },
        { size: 'M', color: 'Rosa Bebê', sku: `CHM-M-${runId}`, stock: 2, min_stock: 1 },
        { size: 'G', color: 'Verde Oliva', sku: `CHM-G-${runId}`, stock: 1, min_stock: 1 }
      ]
    }, adminToken);

    if (newProdRes.status !== 201) throw new Error('Falha ao cadastrar produto: ' + JSON.stringify(newProdRes.data));
    console.log('✓ Produto com 3 variações cadastrado com sucesso');

    // TEST 6: Venda com Pagamento Dividido e Troco
    console.log('\n[Teste 6] PDV: Venda com Pagamento Dividido e Troco');
    // Search product to get variation IDs
    const searchRes = await request('GET', `/api/sales/pos/search?q=${testRef}`, null, attendantToken);
    const prod = searchRes.data[0];
    const varP = prod.variations.find(v => v.size === 'P'); // 5 units, price 110.00
    const varM = prod.variations.find(v => v.size === 'M'); // 2 units, price 110.00

    // Item 1: 1 unit of P (110.00). Total = 110.00. Paid: 50.00 Pix + 100.00 Money. Total Paid = 150.00. Change = 40.00 Money.
    const saleRes = await request('POST', '/api/sales/checkout', {
      items: [
        { variation_id: varP.id, quantity: 1 }
      ],
      payments: [
        { method: 'pix', amount_cents: 5000 },
        { method: 'money', amount_cents: 10000 }
      ],
      discount_cents: 0,
      customer_name: 'Maria Silva',
      customer_phone: '11999998888',
      idempotency_key: `test-key-sale-${runId}`
    }, attendantToken);

    if (saleRes.status !== 201) throw new Error('Falha no checkout: ' + JSON.stringify(saleRes.data));
    if (saleRes.data.sale.change_cents !== 4000) throw new Error('Cálculo de troco incorreto! Esperado 4000, recebido: ' + saleRes.data.sale.change_cents);
    console.log(`✓ Venda concluída (${saleRes.data.sale.saleCode}): R$ 110,00 total, pago Pix R$ 50 + Dinheiro R$ 100, troco R$ 40,00`);

    // TEST 7: Idempotência / Prevenção de Clique Duplo
    console.log('\n[Teste 7] Idempotência / Prevenção de Clique Duplo');
    const duplicateSale = await request('POST', '/api/sales/checkout', {
      items: [
        { variation_id: varP.id, quantity: 1 }
      ],
      payments: [
        { method: 'pix', amount_cents: 11000 }
      ],
      idempotency_key: `test-key-sale-${runId}`
    }, attendantToken);

    if (!duplicateSale.data.duplicate) throw new Error('Falha: Idempotência permitiu duplicar venda!');
    console.log('✓ Idempotência validada: Requisição duplicada ignorada com sucesso');

    // TEST 8: Bloqueio de Estoque Insuficiente
    console.log('\n[Teste 8] Bloqueio de Estoque Insuficiente');
    const varG = prod.variations.find(v => v.size === 'G'); // only 1 unit!
    const overbuyRes = await request('POST', '/api/sales/checkout', {
      items: [
        { variation_id: varG.id, quantity: 5 } // Try to buy 5
      ],
      payments: [
        { method: 'money', amount_cents: 55000 }
      ]
    }, attendantToken);

    if (overbuyRes.status !== 400 || !overbuyRes.data.error.includes('Estoque insuficiente')) {
      throw new Error('Falha: Sistema permitiu compra acima do estoque!');
    }
    console.log('✓ Bloqueio de estoque verificado: Tentativa de venda indisponível rejeitada');

    // TEST 9: Disputa pela Última Unidade
    console.log('\n[Teste 9] Disputa pela Última Unidade');
    // Sell the 1 unit of G
    const buyLastUnit = await request('POST', '/api/sales/checkout', {
      items: [{ variation_id: varG.id, quantity: 1 }],
      payments: [{ method: 'money', amount_cents: 11000 }]
    }, attendantToken);
    if (buyLastUnit.status !== 201) throw new Error('Falha ao comprar última unidade');

    // Now attempt to buy G again immediately
    const buyAfterDepleted = await request('POST', '/api/sales/checkout', {
      items: [{ variation_id: varG.id, quantity: 1 }],
      payments: [{ method: 'money', amount_cents: 11000 }]
    }, attendantToken);

    if (buyAfterDepleted.status !== 400) throw new Error('Falha: Permitiu vender peça esgotada!');
    console.log('✓ Disputa resolvida: Segunda requisição rejeitada após última unidade vendida');

    // TEST 10: Devolução e Troca sem Estorno Duplicado
    console.log('\n[Teste 10] Devolução e Proteção contra Estorno Duplicado');
    const firstSaleId = saleRes.data.sale.saleId;
    const saleDetails = await request('GET', `/api/sales/${firstSaleId}`, null, attendantToken);
    const soldItem = saleDetails.data.items[0];

    // Return the item with restock = true
    const returnRes = await request('POST', '/api/returns/process', {
      sale_id: firstSaleId,
      items: [
        { sale_item_id: soldItem.id, quantity: 1, restock: true }
      ],
      reason: 'Cliente precisou trocar o tamanho'
    }, attendantToken);

    if (returnRes.status !== 201) throw new Error('Falha na devolução: ' + JSON.stringify(returnRes.data));
    console.log('✓ Devolução processada e peça retornada ao estoque disponível');

    // Attempt duplicate return on same item
    const duplicateReturn = await request('POST', '/api/returns/process', {
      sale_id: firstSaleId,
      items: [
        { sale_item_id: soldItem.id, quantity: 1, restock: true }
      ],
      reason: 'Tentativa duplicada'
    }, attendantToken);

    if (duplicateReturn.status !== 400) throw new Error('Falha: Permitido estorno duplicado!');
    console.log('✓ Bloqueio de estorno duplicado validado com sucesso');

    // TEST 11: Fechamento de Caixa e Apuração de Saldos
    console.log('\n[Teste 11] Fechamento e Conferência de Caixa');
    const currentCash = await request('GET', '/api/cash/current', null, attendantToken);
    const expectedCash = currentCash.data.summary.expected_physical_cash_cents;

    const closeRes = await request('POST', '/api/cash/close', {
      register_id: currentCash.data.register.id,
      counted_cash_cents: expectedCash,
      notes: 'Conferência de teste OK'
    }, attendantToken);

    if (closeRes.status !== 200 || closeRes.data.summary.difference_cents !== 0) {
      throw new Error('Falha no fechamento de caixa');
    }
    console.log(`✓ Caixa fechado: Saldo físico em dinheiro conferido com exatidão (R$ ${(expectedCash / 100).toFixed(2)})`);

    // TEST 12: Métricas do Painel e Exportação CSV
    console.log('\n[Teste 12] Painel Gerencial & CSV');
    const dashRes = await request('GET', '/api/reports/dashboard?period=today', null, adminToken);
    if (dashRes.status !== 200) throw new Error('Falha ao obter dashboard');
    console.log(`✓ Dashboard: ${dashRes.data.sales_count} vendas, R$ ${(dashRes.data.gross_revenue_cents / 100).toFixed(2)} faturados`);

    const csvSales = await request('GET', '/api/reports/export/sales', null, adminToken);
    if (csvSales.status !== 200 || typeof csvSales.data !== 'string') throw new Error('Falha ao exportar CSV');
    console.log('✓ Exportação CSV de vendas gerada com sucesso');

    console.log('\n======================================================');
    console.log('🎉 TODOS OS 12 TESTES DO BACKEND PASSARAM COM SUCESSO! 🎉');
    console.log('======================================================\n');
  } catch (err) {
    console.error('\n❌ ERRO NO TESTE:', err);
    process.exit(1);
  } finally {
    server.close();
  }
}

runTestSuite().then(() => process.exit(0));
