# Operação offline — Lory Boutique

## Funcionalidades implantadas
- PWA: arquivos do aplicativo e imagens ilustrativas guardados para acesso offline.
- PDV: catálogo e categorias guardados no IndexedDB após acesso autenticado com internet.
- Sessão de usuário previamente validada pode ser retomada enquanto o JWT de 12 horas não tiver expirado.
- Estado do caixa anteriormente aberto pode ser reaproveitado provisoriamente por até 12 horas.
- Vendas sem conexão entram na fila local e mantêm seu identificador idempotente para sincronização.
- Estoque exibido no aparelho desconta reservas locais das vendas não sincronizadas.
- Ao voltar a conexão, o sistema tenta reenviar vendas pendentes e sinaliza conflitos sem apagar os registros.
- Cupom de 58 mm gerado offline é sinalizado como PENDENTE DE SINCRONIZAÇÃO e NÃO CONFIRMADO NO SERVIDOR.

## Restrições operacionais
1. Vendas offline não são vendas confirmadas. Receita, caixa e estoque definitivo só são atualizados após confirmação no Neon.
2. Usar preferencialmente um único aparelho durante a queda de internet. Reservas offline de outros dispositivos não são compartilhadas.
3. Se a sincronização falhar por caixa fechado, sessão vencida ou falta de estoque, o registro fica preservado para conferência.
4. É necessário abrir o caixa, entrar e carregar o PDV online antes de operar sem internet.
5. Login novo, cadastro administrativo, movimentações de estoque, relatórios e fechamento de caixa continuam online.
6. O aplicativo precisa estar instalado e seus recursos carregados no dispositivo antes de perder a conexão.
7. Impressora Bluetooth: exige impressão via serviço compatível do Android. O botão Imprimir não faz pareamento Bluetooth direto.
8. Proteja o celular com bloqueio de tela e não limpe os dados do app antes de sincronizar.
9. A sessão expira em 12 horas. Se necessário, autentique-se novamente quando voltar a internet.

## Teste controlado antes do uso comercial
1. Conectar à internet, entrar no sistema, abrir caixa e carregar catálogo.
2. Desligar dados e Wi-Fi. Fechar e reabrir o PWA.
3. Adicionar um produto, finalizar uma venda e imprimir o comprovante provisório.
4. Confirmar que a venda ainda aparece na fila após reiniciar o aplicativo.
5. Restaurar internet e sincronizar. Verificar comprovante oficial, histórico, caixa e baixa no estoque.
6. Repetir desligando a rede no instante de confirmar para avaliar a idempotência.
7. Simular conflito de estoque e conferir o aviso, sem perda de dados.
8. Emparelhar a impressora térmica 58 mm e testar largura, fonte e margens.

## Arquivos relevantes
- client/src/services/offline.ts: IndexedDB, catálogo, fila e sincronização.
- client/src/components/POS.tsx: interface de vendas offline.
- client/src/App.tsx: sessão local e caixa provisório.
- client/src/components/Receipt.tsx: comprovante com identificação de pendência.
- client/public/sw.js: cache da interface PWA.