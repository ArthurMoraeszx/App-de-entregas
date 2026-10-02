# Rota Escolar — aplicativo

App do motorista: mostra as guias atribuídas a ele, registra a entrega com foto e
GPS, e sincroniza com o servidor quando há conexão.

A API fica em `../server`. Suba ela antes — sem servidor no ar, o login falha.
As instruções completas de instalação estão no [README da raiz](../README.md).

## Rodar

```bash
npm install && npm run web
```

| Comando | O que faz |
|---------|-----------|
| `npm run web` | abre no navegador — funciona por completo, inclusive offline |
| `npm start` | abre o Expo com QR Code para o celular |
| `npm test` | roda os testes unitários |

Antes de usar no celular, aponte `.env` para o IP da máquina na rede Wi-Fi:

```
EXPO_PUBLIC_API_URL=http://192.168.0.100:3001/api/
```

## Como está montado

**Offline-first.** Nenhuma tela lê da rede: todas leem do WatermelonDB, o banco
SQLite local. A rede aparece só no ciclo de sincronização, que roda sozinho
quando a conexão volta (`hooks/useAutoSync.ts`). É por isso que o app continua
funcionando dentro de uma escola sem sinal.

```
src/
├── screens/     Login, Home, Detalhes, Registro de Entrega, Questionário,
│                Notificações, Perfil, Status de Sincronização, Sobre
├── components/  Button, Card, Badge, MapaEntregaMobile, SyncStatusBar, ...
├── contexts/    AuthContext (sessão), ThemeContext (claro/escuro)
├── database/
│   ├── schema.ts       tabelas locais: entregas, escolas, generos
│   ├── models/         Entrega, Escola, Genero
│   └── sync/           o ciclo de pull e push
├── services/    network (axios + renovação de token), auth, location,
│                notifications
└── utils/       validação da entrega, tratamento de foto, cálculo de atraso,
                 fila de diagnósticos
```

**Renovação de token.** O access token dura 1 hora. Quando uma requisição volta
401, o interceptor em `services/network.ts` renova o token e repete a chamada
sozinho — as chamadas simultâneas ficam numa fila e são liberadas com o token
novo. O motorista só vê a tela de login de novo se o refresh token (15 dias)
também tiver vencido.

**Fotos.** Sobem separadas do resto, uma a uma, em multipart. Só depois que o
servidor confirma o caminho é que a guia é dada como enviada. Se o upload falha,
a foto fica na fila e é retentada no próximo ciclo.

## Trocar a identidade visual

| O quê | Onde |
|-------|------|
| Nome | `app.json` → `expo.name` |
| Cores | `src/constants/theme.ts` → `primary`, `primaryDark`, `primaryLight` |
| Ícone e splash | `assets/icon.png`, `adaptive-icon.png`, `splash-icon.png` |
| Package Android | `app.json` → `expo.android.package` |

Os ícones atuais são um marcador de posição — troque pelos definitivos mantendo
os mesmos nomes de arquivo.

## Limitação no Expo Go

O WatermelonDB depende de código nativo que o Expo Go não carrega. No Expo Go o
app abre, mas o banco local não inicializa e o modo offline fica indisponível.

Para o app completo no celular é preciso um *development build* (`eas build
--profile development --platform android`). Para desenvolver e apresentar sem
isso, use `npm run web`: o adaptador LokiJS cobre todas as funcionalidades.
