# Rota Escolar

Aplicativo Android para motoristas registrarem a entrega de gêneros alimentícios
em escolas, com API própria.

O motorista abre o app, vê as guias atribuídas a ele, registra a entrega (foto da
guia + GPS + quantidades) e o registro sobe para o servidor. Se estiver sem sinal,
tudo é gravado no celular e sincronizado sozinho quando a conexão volta.

```
prog app android/
├── app/       aplicativo React Native (Expo)
└── server/    API Node + Express + SQLite
```

---

## Pré-requisito: Node.js

```bash
node -v
```

Precisa aparecer **`v23.4` ou superior** — na dúvida, instale o Node 24 LTS. A API
usa o SQLite embutido no próprio Node (`node:sqlite`), então nenhuma dependência
precisa ser compilada e o `npm install` nunca vai pedir Visual Studio Build Tools.

Se o comando não for reconhecido logo depois de instalar, **feche e reabra o
terminal** — o PATH só atualiza em terminal novo.

> **Está no Node 22.x?** O `npm run dev` vai quebrar: nessa versão o `node:sqlite`
> ainda exige a flag `--experimental-sqlite`. Ou atualize para o Node 24 (mais
> simples), ou rode os dois separados, cada um numa janela:
> `npm run api:node22` e `npm run app`.

---

## Instalar (uma vez só)

Na pasta **`prog app android`** — a pasta-mãe, não dentro de `app` ou `server`:

```bash
npm install && npm run setup
```

Isso instala a API, o aplicativo e popula o banco com dados fictícios: 8 escolas,
5 gêneros, 3 motoristas e 26 guias.

## Rodar (um comando só)

```bash
npm run dev
```

Sobe a API e o aplicativo juntos, na mesma janela, com os logs marcados por
`[API]` e `[APP]`. Ctrl+C derruba os dois.

Quem preferir clicar: **`iniciar.bat`** na pasta-mãe faz o mesmo.

| Endereço | O que é |
|----------|---------|
| <http://localhost:8081> | o aplicativo |
| <http://localhost:3001/api/> | a API |
| <http://localhost:3001/guias-modelo> | as guias de entrega em papel |

Ao subir, a API também imprime o endereço dela na rede Wi-Fi
(`http://192.168.x.x:3001/api/`) — é esse que o celular precisa.

Se preferir rodar separado, cada um numa janela: `npm run api` e `npm run app`.

### Logins criados pelo seed

| Usuário  | Senha  | Perfil  | O que enxerga                       |
|----------|--------|---------|-------------------------------------|
| `carlos` | 123456 | driver  | 10 guias pendentes + histórico      |
| `rita`   | 123456 | driver  | 5 guias pendentes                   |
| `joel`   | 123456 | driver  | 5 guias pendentes                   |
| `admin`  | 123456 | admin   | todas as guias                      |

Entre com **carlos** — é o único com histórico, entrega parcial e devolução, então
é o login que mostra o app inteiro funcionando.

Para recomeçar do zero: `npm run seed:reset`.

---

## As guias em papel

<http://localhost:3001/guias-modelo>

Na vida real o motorista recebe a guia impressa e a fotografa no aplicativo como
comprovante. Essa página monta esse documento para cada guia pendente, com os
mesmos dados que estão no banco — o número no papel é o mesmo da lista no app.

Para demonstrar: abra uma guia, deixe na tela (ou imprima com Ctrl+P), e
fotografe pelo aplicativo na etapa de registro da entrega. A foto sobe para a
API, é gravada em `server/uploads/guias/ANO/MÊS/` e passa a aparecer na entrega.

No navegador a foto é tirada pela webcam. Sem webcam, use o celular.

## Rodar no Android

O app é React Native com Expo, então o mesmo código vira um APK Android de
verdade. Há dois caminhos, e eles não competem — o primeiro é para desenvolver,
o segundo para entregar.

### Emulador no PC

Precisa do **Android Studio** (<https://developer.android.com/studio>), que traz
junto o SDK, o emulador e o JDK — não instale Java separado.

Depois de instalado, crie um dispositivo virtual: **More Actions → Virtual Device
Manager → Create Device**. Escolha um Pixel e uma imagem de sistema recente.

Com o emulador aberto e a API rodando:

```bash
npm run android
```

Na primeira vez ele gera a pasta `android/` — um projeto Gradle de verdade, que
pode ser aberto no Android Studio — e compila. Leva de 10 a 20 minutos. Depois
disso, alterações no código entram na hora, sem recompilar.

> **Endereço da API no emulador:** dentro dele, `localhost` é o próprio
> emulador, não o seu PC. O app já traduz isso sozinho para `10.0.2.2`, que é
> como o emulador enxerga a máquina hospedeira. Ao subir, o app registra no
> console qual endereço está usando.

### APK para instalar num celular

Não precisa de Android Studio: a compilação acontece na nuvem da Expo.

```bash
npm install -g eas-cli && eas login
```

```bash
cd app && eas build --profile preview --platform android
```

Sai um link para baixar o APK. Cada build leva 15-20 minutos.

Antes de gerar, ajuste `EXPO_PUBLIC_API_URL` em `app/eas.json` para o endereço
onde a API vai estar rodando. Se for o seu PC, use o IP de Rede Wi-Fi que o
servidor imprime — e o celular precisa estar na mesma rede.

## No celular pelo Expo Go

O `app/.env` guarda configuração da sua máquina, então não vem no repositório.
Crie o seu a partir do modelo:

```bash
cd app
copy .env.example .env     # Windows
cp .env.example .env       # Linux/macOS
```

Agora edite esse `.env` e troque o endereço pelo IP de Rede Wi-Fi que o servidor
imprimiu ao subir:

```
EXPO_PUBLIC_API_URL=http://192.168.0.100:3001/api/
```

Depois `npm start` e leia o QR Code com o Expo Go. O celular e o PC precisam estar
na mesma rede Wi-Fi.

> **Limitação conhecida do Expo Go:** o banco local (WatermelonDB) usa código
> nativo e não existe dentro do Expo Go. O app abre e a tela de login funciona,
> mas o modo offline não. Para ter o app completo no celular é preciso gerar um
> *development build* pelo EAS. Enquanto isso, o navegador (`npm run web`) roda
> todas as funcionalidades.

---

## O que a API expõe

Exatamente as rotas que o app chama — nada além disso.

| Método | Rota | Para quê |
|--------|------|----------|
| POST | `/api/mobile/login` | autentica e devolve JWT + refresh token |
| POST | `/api/mobile/refresh` | renova o token expirado |
| GET  | `/api/mobile/me` | dados do usuário logado |
| GET  | `/api/mobile/guias/:num_guia` | busca uma guia pelo número |
| GET  | `/api/mobile/sync/pull` | baixa entregas, escolas e gêneros |
| POST | `/api/mobile/sync/push` | recebe as entregas registradas no celular |
| POST | `/api/mobile/fotos/upload` | recebe a foto da guia (multipart) |
| POST | `/api/mobile/token` | registra o token de push do aparelho |
| POST | `/api/mobile/diagnostics` | recebe eventos de erro do app |
| PUT  | `/api/auth/update-profile` | altera nome, e-mail e senha |
| GET  | `/api/health` | verificação de que o servidor está no ar |

Teste rápido sem o app:

```bash
curl -X POST http://localhost:3001/api/mobile/login -H "Content-Type: application/json" -d "{\"username\":\"carlos\",\"senha\":\"123456\"}"
```

### Teste automatizado

Com o servidor no ar, em outro terminal:

```bash
cd server && npm run smoke
```

Percorre o fluxo inteiro na mesma ordem que o app faz — login, renovação de token,
sincronização completa e incremental, upload de foto, push de entrega — e verifica
também o que **não** pode acontecer: motorista enxergar guia de outro, URI local do
celular sobrescrever a foto já gravada no servidor, senha errada passar.

Ele grava no banco, então rode `npm run seed:reset` depois para voltar os dados de
demonstração ao estado inicial.

> **Rode o `seed:reset` antes também, se faz tempo que você não semeia.** Dois dos
> testes conferem se uma correção de cadastro chega no pull incremental, e para
> isso pedem ao servidor o que mudou nas últimas 24 horas. Como o seed carimba
> `atualizado_em` na hora em que roda, um banco semeado há mais de um dia devolve
> zero e esses dois acusam falha — sem haver nada de errado no código.

---

## Como a sincronização funciona

O app é *offline-first*: a tela nunca lê da rede, sempre do banco local. A rede
entra só no ciclo de sincronização, que roda em duas fases.

**Fase 1 — fotos.** Cada foto sobe sozinha, em multipart, por
`/mobile/fotos/upload`. O servidor grava em `server/uploads/guias/ANO/MES/` e
devolve o caminho, que o app guarda como prova de que aquela foto já chegou.
Fotos não entram no payload de sincronização: em rede fraca, um lote com
imagens em base64 estourava o tempo limite e nada era gravado.

**Fase 2 — dados.** O WatermelonDB faz *pull* e *push* numa transação só:

- **pull** (`GET /sync/pull?last_pulled_at=...`) traz o que mudou desde a última
  vez. Na primeira sincronização — ou quando o app avisa que o banco local está
  vazio, que é o caso de quem reinstalou — vêm as guias dos últimos 90 dias mais
  a lista completa de escolas e gêneros.
- **push** (`POST /sync/push`) manda as guias alteradas. O servidor responde com
  `failed_guias`: as que ele não conseguiu gravar. O app volta a marcá-las como
  pendentes e tenta de novo no ciclo seguinte, em vez de dá-las como enviadas.

O `UPDATE` do push usa `COALESCE` em todo campo: quando o app manda `null`, o
valor que já estava no servidor é mantido. É isso que impede um push atrasado de
apagar uma foto que outro caminho já havia registrado.

---

## Estrutura

```
server/
├── src/
│   ├── server.js              Express, CORS, arquivos estáticos, tratamento de erro
│   ├── db.js                  conexão SQLite e esquema das tabelas
│   ├── seed.js                dados fictícios
│   ├── middleware/
│   │   └── authenticate.js    validação do JWT e checagem de perfil
│   ├── routes/
│   │   ├── mobile.js          as 9 rotas do app
│   │   └── auth.js            edição de perfil
│   └── utils/respond.js       formato padrão das respostas
├── data/                      banco SQLite (criado no primeiro start)
└── uploads/                   fotos das guias

app/
├── App.tsx                    navegação e contexto de autenticação
└── src/
    ├── screens/               login, home, detalhes, registro, perfil, sobre
    ├── components/            botão, card, badge, mapa, barra de sincronização
    ├── database/
    │   ├── schema.ts          tabelas do banco local
    │   ├── models/            Entrega, Escola, Genero
    │   └── sync/syncService.ts  o ciclo de sincronização
    ├── services/              rede (axios), autenticação, GPS, notificações
    └── utils/                 validações, tratamento de foto, diagnósticos
```

---

## Personalização

| O quê | Onde |
|-------|------|
| Nome do app | `app/app.json` → `expo.name` |
| Cores | `app/src/constants/theme.ts` → `primary`, `primaryDark`, `primaryLight` |
| Ícone e splash | `app/assets/` (`icon.png`, `adaptive-icon.png`, `splash-icon.png`) |
| Package Android | `app/app.json` → `expo.android.package` |
| Endereço da API | `app/.env` → `EXPO_PUBLIC_API_URL` |
| Dados de exemplo | `server/src/seed.js` |

Os ícones atuais são um marcador de posição gerado por script. Troque pelos
definitivos mantendo os mesmos nomes de arquivo.
