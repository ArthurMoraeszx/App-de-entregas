import axios from 'axios';
import { Platform } from 'react-native';
import { SafeStorage as storage } from '../utils/safeStorage';
import { triggerSessionExpired } from '../utils/authEvents';

// ============================================================
// CONFIGURAÇÃO DE AMBIENTE
//
// A URL da API vem de EXPO_PUBLIC_API_URL, definida no arquivo
// .env da raiz do app (e, nos builds do EAS, em eas.json).
//
// Para mudar de servidor, edite o .env — não esta constante.
//
// No navegador o endereço é fixo em localhost porque a página e
// a API rodam na mesma máquina; no celular físico, precisa ser o
// IP da máquina na rede Wi-Fi, que o servidor imprime ao subir.
// ============================================================

/**
 * Dentro do emulador do Android, `localhost` é o próprio emulador — não a
 * máquina que o hospeda. Uma API rodando no PC fica inalcançável por esse nome,
 * e o sintoma é só "Network Error" no login, sem nada no log do servidor,
 * porque a requisição nunca sai do aparelho virtual.
 *
 * O emulador expõe o host num endereço reservado, 10.0.2.2. Traduzir aqui evita
 * ter que manter dois .env diferentes ou lembrar disso a cada `run:android`.
 *
 * Celular físico não passa por aqui: lá o .env aponta para o IP da máquina na
 * rede Wi-Fi, que não é localhost e segue intacto.
 */
function ajustarParaEmulador(url: string): string {
    if (Platform.OS !== 'android') return url;
    return url.replace(/\/\/(localhost|127\.0\.0\.1)(?=[:/]|$)/, '//10.0.2.2');
}

const API_BASE_URL = Platform.OS === 'web'
    ? 'http://localhost:3001/api/'
    : ajustarParaEmulador(
        (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/\/?$/, '/'),
    );

// Sem isto, descobrir por que o app não fala com a API no emulador vira
// tentativa e erro: o endereço efetivo não aparece em lugar nenhum.
console.log(`[API] endereço em uso: ${API_BASE_URL}`);

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 15000, // Aumentado para 15s para redes móveis instáveis
});

api.interceptors.request.use(
    async (config) => {
        const token = await storage.getItem('user_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// ============================================================
// RESPONSE INTERCEPTOR — Auto-renovação de token
// Se receber 401, tenta refresh automático e retenta a request
// ============================================================
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (error: any) => void }> = [];

const processQueue = (error: any, token: string | null) => {
    failedQueue.forEach(({ resolve, reject }) => {
        if (token) resolve(token);
        else reject(error);
    });
    failedQueue = [];
};

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Só tenta refresh em 401 e se não for a própria rota de refresh/login
        const isAuthRoute = originalRequest?.url?.includes('mobile/refresh') || originalRequest?.url?.includes('mobile/login');
        if (error.response?.status !== 401 || isAuthRoute || originalRequest._retry) {
            return Promise.reject(error);
        }

        // Se já está renovando, enfileira a request para quando o novo token chegar
        if (isRefreshing) {
            return new Promise((resolve, reject) => {
                failedQueue.push({
                    resolve: (token: string) => {
                        originalRequest.headers.Authorization = `Bearer ${token}`;
                        resolve(api(originalRequest));
                    },
                    reject,
                });
            });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
            const refreshToken = await storage.getItem('refresh_token');
            if (!refreshToken) {
                throw new Error('Sem refresh token');
            }

            const { data } = await axios.post(`${API_BASE_URL}mobile/refresh`, { refreshToken });
            const newToken = data?.data?.token || data?.token;

            if (!newToken) {
                throw new Error('Resposta de refresh sem token');
            }

            await storage.setItem('user_token', newToken);
            console.log('[AUTH] Token renovado automaticamente');

            processQueue(null, newToken);

            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
        } catch (refreshError) {
            console.error('[AUTH] Falha ao renovar token:', refreshError);
            processQueue(refreshError, null);

            // Limpar dados e redirecionar para login — sessão expirou de vez
            await storage.removeItem('user_token');
            await storage.removeItem('refresh_token');
            await storage.removeItem('user_data');
            triggerSessionExpired();

            return Promise.reject(refreshError);
        } finally {
            isRefreshing = false;
        }
    }
);

export default api;
