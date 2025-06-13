
# PizzaFlow - SaaS para Pizzaria Planeta

PizzaFlow é uma aplicação web moderna e completa para gerenciamento de pizzarias, construída com Next.js e um stack de tecnologias robustas. Ele oferece um painel de controle intuitivo para gerenciar pedidos, cardápio, cupons, entregadores e visualizar análises de vendas.

## Principais Funcionalidades

*   **Gerenciamento de Pedidos:** Acompanhe os pedidos em tempo real através de colunas de status (Pendente, Em Preparo, Aguardando Retirada, Saiu para Entrega, Entregue).
*   **Novo Pedido:** Interface amigável para clientes ou atendentes registrarem novos pedidos, com busca de CEP e aplicação de cupons.
*   **Status do Pedido:** Página para clientes acompanharem o progresso de seus pedidos.
*   **Gerenciamento de Cardápio:** Adicione, edite e remova itens do cardápio, incluindo imagens, preços e categorias.
*   **Gerenciamento de Cupons:** Crie e gerencie cupons de desconto (porcentagem ou valor fixo), com data de validade e limite de uso.
*   **Gerenciamento de Entregadores:** Cadastre e gerencie os entregadores da sua pizzaria.
*   **Dashboard de Análises:** Visualize métricas importantes como receita total, total de pedidos, ticket médio, receita diária e distribuição de status dos pedidos.
*   **Otimização de Rotas (IA com Genkit):**
    *   Otimização de rota para entrega única.
    *   Otimização de múltiplas rotas de entrega para vários pedidos.
*   **Tema Claro/Escuro:** Suporte para alternância de tema.

## Tech Stack

*   **Framework:** Next.js 14 (App Router)
*   **Linguagem:** TypeScript
*   **UI:** React, ShadCN UI Components
*   **Banco de Dados:** Neon (PostgreSQL Serverless)
*   **ORM:** Drizzle ORM
*   **Inteligência Artificial:** Google Genkit (para otimização de rotas)
*   **Estilização:** Tailwind CSS, CSS Variables
*   **Formulários:** React Hook Form (implícito via ShadCN e manipulação de estado)
*   **Notificações:** ShadCN Toasts
*   **Gráficos:** Recharts

## Configuração e Instalação

### Pré-requisitos

*   Node.js (versão 18.x ou superior recomendada)
*   npm (ou yarn/pnpm)
*   Uma conta no [Neon](https://neon.tech/) para o banco de dados PostgreSQL.

### Passos

1.  **Clone o repositório:**
    ```bash
    git clone https://github.com/Aziel-Zhero/pizzaflow.git
    cd pizzaflow
    ```

2.  **Configure as Variáveis de Ambiente:**
    *   Crie um arquivo `.env` na raiz do projeto.
    *   Adicione sua URL de conexão do banco de Dados Neon:
        ```env
        NEON_DATABASE_URL="postgres://user:password@host:port/database?sslmode=require"
        ```
    *   (Opcional) Se for usar Genkit com Google AI, configure as credenciais necessárias (ex: `GOOGLE_API_KEY`) conforme a documentação do Genkit e do Google AI Studio.

3.  **Instale as Dependências:**
    ```bash
    npm install
    ```

4.  **Execute as Migrações do Banco de Dados:**
    *   Primeiro, limpe quaisquer migrações antigas (se estiver reconfigurando):
        ```bash
        # Opcional: rm -rf drizzle/migrations 
        ```
    *   Gere os arquivos de migração com base no schema atual:
        ```bash
        npx drizzle-kit generate
        ```
    *   Depois, aplique as migrações ao seu banco de dados Neon:
        ```bash
        npx drizzle-kit migrate
        ```
    *   *Nota: Se você encontrar problemas, pode ser necessário limpar a pasta `drizzle/migrations` e tentar os comandos `generate` e `migrate` novamente.*

5.  **Inicie o Servidor de Desenvolvimento:**
    ```bash
    npm run dev
    ```
    A aplicação estará disponível em `http://localhost:9004` (ou a porta configurada no `package.json`).

### (Opcional) Seed do Banco de Dados

Atualmente, não há um script de seed formal. Para popular com dados:
*   Use a página de "Simular Pedido" no painel principal.
*   Adicione itens de cardápio, cupons e entregadores através das respectivas páginas de administração.

## Scripts Disponíveis

*   `npm run dev`: Inicia o servidor de desenvolvimento (usando Webpack por padrão após o downgrade do Next.js).
*   `npm run build`: Compila a aplicação para produção.
*   `npm run start`: Inicia o servidor de produção (após o build).
*   `npm run lint`: Executa o linter (ESLint).
*   `npm run typecheck`: Verifica os tipos TypeScript.
*   `npm run db:generate`: Gera arquivos de migração Drizzle com base no schema em `src/lib/schema.ts`.
*   `npm run db:migrate`: Aplica as migrações pendentes da pasta `drizzle/migrations` ao banco de dados.
*   `npm run db:push`: (Use com cautela) Envia o schema definido em `src/lib/schema.ts` diretamente para o banco sem criar arquivos de migração formais. Útil para prototipagem rápida.
*   `npm run db:studio`: Abre o Drizzle Studio, uma interface gráfica para visualizar e interagir com seu banco de dados.
*   `npm run genkit:dev`: Inicia o servidor de desenvolvimento Genkit (se configurado para flows locais).
*   `npm run genkit:watch`: Inicia o servidor de desenvolvimento Genkit com watch mode.

## Estrutura de Pastas (Visão Geral)

```
/
├── drizzle/                # Configurações e migrações do Drizzle ORM
├── public/                 # Arquivos estáticos (imagens, fontes locais, etc.)
├── src/
│   ├── ai/                 # Lógica de Inteligência Artificial com Genkit
│   │   ├── flows/          # Definições dos fluxos Genkit (ex: otimização de rota)
│   │   ├── dev.ts          # Arquivo para desenvolvimento/teste de flows Genkit
│   │   └── genkit.ts       # Configuração principal do Genkit
│   ├── app/                # Rotas do Next.js App Router, actions e layout principal
│   │   ├── admin/          # Páginas de administração (cardápio, cupons, entregadores)
│   │   ├── pedido/[id]/status/ # Página de status do pedido para o cliente
│   │   ├── actions.ts      # Server Actions para interagir com o backend/DB
│   │   ├── globals.css     # Estilos globais e variáveis de tema Tailwind/ShadCN
│   │   ├── layout.tsx      # Layout raiz da aplicação
│   │   ├── novo-pedido/page.tsx # Página para criar um novo pedido
│   │   ├── page.tsx        # Página principal (Dashboard de Pedidos)
│   │   └── dashboard/page.tsx # Página do Dashboard de Análises
│   ├── components/
│   │   ├── common/         # Componentes reutilizáveis genéricos (ex: SplitText)
│   │   ├── pizzaflow/      # Componentes específicos da aplicação PizzaFlow (ex: AppHeader, OrderCard)
│   │   └── ui/             # Componentes ShadCN UI (Button, Card, Dialog, etc.)
│   ├── hooks/              # Hooks React customizados (ex: useToast, useMobile)
│   ├── lib/                # Utilitários, schema do banco, tipos, configuração do DB
│   │   ├── db.ts           # Configuração da instância do Drizzle ORM e conexão com o banco
│   │   ├── schema.ts       # Definição das tabelas do banco de dados com Drizzle
│   │   ├── types.ts        # Definições de tipos TypeScript para a aplicação
│   │   └── utils.ts        # Funções utilitárias (ex: cn para classnames)
├── .env                    # Variáveis de ambiente (NÃO FAÇA COMMIT DESTE ARQUIVO COM SEGREDOS)
├── .vscode/                # Configurações específicas do VSCode
├── components.json         # Configuração do ShadCN UI
├── drizzle.config.ts       # Configuração do Drizzle Kit para migrações
├── next.config.ts          # Configuração do Next.js
├── package.json            # Dependências e scripts do projeto
├── tailwind.config.ts      # Configuração do Tailwind CSS
└── tsconfig.json           # Configuração do TypeScript
```

## Contribuições

Contribuições são bem-vindas! Por favor, abra uma issue para discutir grandes mudanças ou envie um Pull Request. Siga as convenções de código existentes.

## Licença

Este projeto é licenciado sob a Licença MIT.
(Você pode alterar para a licença que preferir)

