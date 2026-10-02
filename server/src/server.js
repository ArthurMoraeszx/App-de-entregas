// ---------------------------------------------------------------------------
// Ponto de entrada da API.
//
// Sobe o Express, aplica as migracoes do SQLite e monta as rotas que o
// aplicativo consome. Rode com: npm run dev
// ---------------------------------------------------------------------------

// Precisa ser o primeiro import: db.js e routes/ leem process.env no topo do
// modulo, e em ESM os imports sao avaliados na ordem em que aparecem. Colocar
// o dotenv depois faria essas leituras acontecerem antes do .env ser lido.
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from './db.js';
import mobileRoutes from './routes/mobile.js';
import authRoutes from './routes/auth.js';
import documentosRoutes from './routes/documentos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PORT = Number(process.env.PORT) || 3001;
const UPLOADS_DIR = path.resolve(ROOT, process.env.UPLOADS_DIR || './uploads');
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

migrate();

const app = express();

app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',') }));

// 10mb porque o push de sincronizacao pode carregar dezenas de guias de uma vez.
// As fotos NAO passam por aqui — vao em multipart por /mobile/fotos/upload.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Log de uma linha por request. Sem isso, depurar o app no celular vira
// adivinhacao: nao da para ver o console do aparelho e o do servidor juntos.
app.use((req, res, next) => {
    const inicio = Date.now();
    res.on('finish', () => {
        console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - inicio}ms)`);
    });
    next();
});

// Fotos gravadas pelo upload ficam acessiveis em /uploads/guias/2026/09/123.jpg
app.use('/uploads', express.static(UPLOADS_DIR));

app.get('/api/health', (req, res) => {
    res.json({ success: true, data: { status: 'ok', horario: new Date().toISOString() } });
});

app.use('/api/mobile', mobileRoutes);
app.use('/api/auth', authRoutes);

// Guias de entrega em papel, para imprimir ou exibir na tela e fotografar
// pelo aplicativo durante a demonstração.
app.use('/guias-modelo', documentosRoutes);

app.get('/', (req, res) => {
    res.json({
        nome: 'API Rota Escolar',
        rotas: [
            'POST /api/mobile/login',
            'POST /api/mobile/refresh',
            'GET  /api/mobile/me',
            'GET  /api/mobile/guias/:num_guia',
            'GET  /api/mobile/sync/pull',
            'POST /api/mobile/sync/push',
            'POST /api/mobile/fotos/upload',
            'POST /api/mobile/token',
            'POST /api/mobile/diagnostics',
            'PUT  /api/auth/update-profile',
            'GET  /api/health',
        ],
    });
});

app.use((req, res) => {
    res.status(404).json({ success: false, message: `Rota nao encontrada: ${req.method} ${req.originalUrl}` });
});

// eslint-disable-next-line no-unused-vars -- o Express so reconhece o handler de
// erro se ele declarar os quatro parametros.
app.use((erro, req, res, next) => {
    console.error('[erro]', erro);

    // Erros do multer chegam aqui com code proprio; o mais comum e o arquivo
    // passar do limite, e 500 faria o app tentar de novo eternamente.
    if (erro.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ success: false, message: 'Imagem maior que o limite de 15MB' });
    }

    res.status(500).json({ success: false, message: erro.message || 'Erro interno do servidor' });
});

/** Descobre o IP da maquina na rede local, para configurar o app no celular. */
function ipLocal() {
    for (const interfaces of Object.values(os.networkInterfaces())) {
        for (const iface of interfaces ?? []) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}

// 0.0.0.0 e nao localhost: sem isso o servidor so aceita conexao da propria
// maquina e o celular na mesma rede Wi-Fi nao consegue alcancar a API.
app.listen(PORT, '0.0.0.0', () => {
    const ip = ipLocal();
    console.log('');
    console.log('  API Rota Escolar no ar');
    console.log(`  Local .......... http://localhost:${PORT}/api/`);
    console.log(`  Rede Wi-Fi ..... http://${ip}:${PORT}/api/`);
    console.log('');
    console.log('  No app, aponte EXPO_PUBLIC_API_URL para o endereco de rede acima.');
    console.log('');
});
