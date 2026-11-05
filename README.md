# TechVendas

CRM interno para leads exportados da Maria. Next.js, TypeScript, Tailwind CSS e Supabase; pronto para configurar como projeto Next.js na Vercel.

## Funcionalidades

- Login por usuário/senha e perfis de administrador/atendente. Sem cadastro público no aplicativo.
- CSV com mapeamento de colunas, prévia, validação de datas/telefones, detecção de duplicados e preservação de colunas extras. Nenhuma reimportação sobrescreve contatos existentes.
- Estoque exclusivo do administrador, liberação automática de até 50 contatos e seleção manual. Leads devolvidos exigem seleção e autorização explícita para nova liberação.
- Fila da atendente, cópia de telefone, observações, sete status e agendamento no horário de Brasília.
- Devolução automática ao administrador quando marcado sem resposta. Interessados e retornos permanecem com a atendente; vendas e perdidos são finalizados.
- Histórico com autor e horário, reatribuição administrativa, indicadores de contatos únicos por período e taxa de conversão.
- Na Fila de atendimento, painel administrativo para selecionar vendedor, consultar lotes/status e retirar um lote da fila sem apagar leads ou histórico.
- Busca, filtros por status/lote/período, paginação e exportação CSV administrativa. Interface confortável em computador, tablet e celular.
- RLS em todas as tabelas. Escritas de leads passam por funções transacionais com verificação de perfil, atribuição e versão do registro.

## Executar

Use Node.js 24 LTS (versão validada neste ambiente).

```sh
npm ci
# Apenas se .env.local ainda não existir:
cp -n .env.example .env.local
npm run dev
```

Configure `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` nas variáveis do ambiente ou em `.env.local` (ignorado pelo Git). Use somente a chave publicável do Supabase no frontend; nunca `service_role` ou `sb_secret_…`. Reinicie o servidor após configurar as variáveis. Em produção, refaça o build.

Neste ambiente, a URL e a chave pública já foram fornecidas pelas configurações da plataforma. A API de autenticação respondeu HTTP 200 com essa chave. Isso confirma a conexão, mas não cria as tabelas ou os usuários.

## Ativar o banco no Supabase — necessário uma única vez

1. No projeto `yhqhweqqowjfbryiwsnc`, abra **SQL Editor → New query**.
2. Execute todo o conteúdo de **[supabase/setup.sql](supabase/setup.sql)** no projeto vazio. O instalador é uma única transação, não apaga dados e não inclui usuários ou leads fictícios. Não o execute novamente se a instalação já estiver aplicada.
3. Em **Authentication → Users → Add user → Create new user**, crie o administrador e a atendente, com os usuários e senhas que você definir. O Supabase exige um identificador técnico no campo Email: use `USUARIO@techvendas.invalid` (exemplo: `admin@techvendas.invalid`), sem precisar de um e-mail real. Ative **Auto Confirm User**. No aplicativo, digite somente `USUARIO` e a senha. Não insira usuários diretamente em `auth.users`.
4. Execute **[supabase/provision_profiles.sql](supabase/provision_profiles.sql)** no SQL Editor após substituir os dois nomes de usuário indicados no início. O script verifica se os usuários já existem e grava os papéis correspondentes. Não contém senhas.
5. Desative cadastros públicos nas configurações de autenticação. Configure **Site URL** e **Redirect URLs** com o domínio da aplicação.
6. Entre no aplicativo com cada usuário e faça o roteiro abaixo.

Para uma instalação que já tem as cinco funções principais e os perfis, aplique somente **`supabase/003_seller_batches.sql`** no SQL Editor para ativar o painel de vendedores. Essa migração pode ser executada novamente sem recriar tabelas ou apagar dados. Se apenas `001_initial.sql` estiver aplicada, execute `002_workflows.sql` e depois `003_seller_batches.sql`, sem executar novamente o instalador completo. Os arquivos numerados são as migrações; `setup.sql` é a consolidação para projetos vazios. Alterações futuras devem ser novas migrações.

O usuário confirmou a criação das tabelas e das cinco funções pelo SQL Editor. A chave pública permite usar o aplicativo, mas não executar DDL ou criar usuários. Por isso a instalação exige o SQL Editor ou acesso administrativo seguro; não pode ser feita com a chave publicável.

### Diagnóstico se a API ainda não encontrar as tabelas

Execute `supabase/check_install.sql` no SQL Editor. A primeira consulta deve mostrar `profiles`, `leads` e `lead_history`; a segunda deve listar as cinco funções de fluxo. Valores `NULL` significam que as tabelas não foram criadas. Nesse caso, copie todo o conteúdo de `supabase/setup.sql`, substitua todo o texto da consulta no editor e execute sem selecionar apenas um trecho. Executar somente a migração de fluxos não cria as tabelas iniciais. Se as tabelas existem, a instrução `NOTIFY` solicita a atualização do cache da API sem alterar dados.

## Verificação automatizada

```sh
npm run typecheck
npm test
npm run build
npm start
```

`npm test` executa 7 testes de CSV, 11 verificações iniciais de RLS e 15 testes integrados de banco em PostgreSQL embarcado (PGlite). As migrações completas são executadas de verdade nesse banco em memória, com usuários/papéis de autenticação de teste. A suíte verifica duplicados, lotes, isolamento, acesso anônimo, conflitos de edição, agendamento, devolução, nova liberação, reatribuição e finalização.

Com um servidor iniciado em outro terminal:

```sh
# Chromium já está disponível neste ambiente.
# Em uma máquina nova, instale o navegador conforme a documentação do Playwright.
npm run test:ui
```

O teste de navegador intercepta todas as chamadas Supabase, sem criar ou alterar dados remotos. Valida login/erro/logout, CSV, liberação, agendamento, exportação, permissões visuais, devolução e layout em 1440, 820 e 390 pixels. `CHROMIUM_PATH` permite selecionar o executável e `TEST_BASE_URL` permite selecionar o endereço do servidor. As massas de teste ficam apenas nos testes; não há modo demo nem dados fictícios no aplicativo final.

Essas validações não substituem o login real e o RLS no projeto Supabase após aplicar o banco. A proteção contra dupla liberação usa bloqueio de linhas `FOR UPDATE SKIP LOCKED`, transação e índice único para atribuição ativa. O teste local verifica solicitações repetidas e ausência de duplicados; PGlite não substitui um teste de concorrência com múltiplas conexões em PostgreSQL remoto.

## Roteiro funcional no projeto real

1. Administrador: importar um CSV pequeno, conferir a prévia e os totais. Reimportar e confirmar que conta duplicados sem alterar os leads.
2. Verificar que a atendente ainda não tem acesso ao estoque.
3. Liberar um lote de 1 a 50 contatos. Conferir que duas solicitações não atribuem o mesmo contato duas vezes.
4. Atendente: copiar o número, salvar observações e testar interessado/retorno agendado. Conferir o histórico.
5. Marcar um lead sem resposta. Ele deve desaparecer da fila da atendente e aparecer na seção do administrador.
6. Liberar um novo lote automático: o devolvido deve permanecer fora. Selecioná-lo manualmente em **Sem resposta** e liberar novamente; o histórico deve continuar disponível.
7. Registrar venda/perdido e verificar finalizados e indicadores. Uma atendente não pode editar um finalizado nem um lead de outra pessoa.
8. Exportar resultados com filtros e testar busca/paginação. Sair de ambas as contas.

As datas são armazenadas em `timestamptz`, exibidas em `America/Sao_Paulo`. No dashboard, o período filtra as atividades; totais e funil mostram a situação atual dentro do lote/status escolhido. No estoque e em Sem resposta, os calendários foram substituídos por um seletor: **Mais novos para mais antigos** ou **Mais antigos para mais novos**, usando a data original do lead (`source_date`, mapeada no CSV). Leads sem data ficam no fim. A liberação automática busca até 50 IDs respeitando os mesmos filtros e a ordem da lista; a função transacional continua verificando disponibilidade e bloqueando dupla atribuição. Nas demais listas, o período filtra a última atualização.

## Vercel

Importe este repositório com preset **Next.js**, raiz padrão, instalação `npm ci` e build `npm run build`. Configure as duas variáveis de `.env.example` antes do deploy e ajuste o domínio no Supabase. O build/dev usam Webpack por compatibilidade com o ambiente na nuvem. Não é necessário serviço próprio de backend nem chave privada no frontend.

A publicação do ambiente na nuvem e o deploy na Vercel são ações diferentes. O rascunho de instalação/inicialização do ambiente está salvo; nenhum deploy na Vercel é presumido por isso.

## Usuários e senhas

Você define e distribui as credenciais. Os nomes de usuário têm de 3 a 32 caracteres, começam com uma letra e aceitam letras sem acentos, números, ponto, hífen e sublinhado. Não diferenciam maiúsculas de minúsculas. O login converte o usuário para o identificador interno `usuario@techvendas.invalid`, mantendo sessões e RLS do Supabase. Esse endereço é técnico, não recebe mensagens e não precisa existir como caixa de e-mail. Não há recuperação de senha por e-mail: o administrador define ou redefine a senha no painel Authentication do Supabase. Nunca coloque senhas em SQL, Git ou nesta conversa.

## Gerenciar lotes dos vendedores

Entre como administrador e abra **Fila de atendimento**. No painel **Vendedores e lotes**, escolha um vendedor: a lista de contatos passa a mostrar somente sua fila. Cada lote mostra a data de liberação, quantidade originalmente recebida, contatos ativos, os sete status e contagens separadas de contatos retirados/transferidos. **Ver fila deste lote** aplica o filtro do lote na lista abaixo. Há paginação dos lotes para consultar os mais antigos.

**Retirar lote da fila** exige confirmação. A função transacional `recall_batch` retira somente os contatos ainda atribuídos ao vendedor naquele lote e não finalizados. Esses contatos voltam ao estoque como Pendentes, aptos a uma nova liberação. Observações, data de retorno e histórico são preservados; a atribuição anterior é encerrada com motivo de retirada. Vendas, perdidos, devolvidos sem resposta e contatos já transferidos não são alterados. A operação registra o administrador e o lote no histórico, sem contar como atendimento no dashboard. Repetir a retirada de um lote vazio não duplica eventos. Somente administradores podem consultar esse painel ou executar a retirada; o banco verifica isso mesmo fora da interface.

A migração necessária é `003_seller_batches.sql`; a interface mostra um erro de configuração se ela ainda não tiver sido aplicada no projeto real. Os testes locais verificam permissões, integridade e retirada, mas não substituem a aplicação e validação no Supabase remoto.

O filtro **Lote** da atendente lista somente lotes com atribuições ativas para ela. Lotes retirados ou sem atribuições ativas não aparecem nessa lista; o administrador mantém acesso ao histórico. Se o lote filtrado for retirado, a próxima atualização limpa esse filtro automaticamente.

## Painéis digitais

Os quatro indicadores principais usam velocímetros com escala de 0 a 100%, ponteiro e contador digital animados. O número central é a quantidade real de leads; a escala mostra a participação na base retornada pelo dashboard (não é uma meta de vendas). Sem leads, o marcador fica em zero. Os dados e as permissões seguem o mesmo fluxo do CRM. As animações são desativadas quando o dispositivo solicita movimento reduzido. Não exige migração SQL nem dependências adicionais.
