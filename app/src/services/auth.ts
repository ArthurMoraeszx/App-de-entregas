import api from './network';
import { SafeStorage as storage } from '../utils/safeStorage';

interface LoginResponse {
    message: string;
    token: string;
    refreshToken: string;
    user: {
        id: number;
        username: string;
        nome: string;
        email: string;
        setor: string;
        nivel: string;
        id_motorista?: number | null;
    };
}

export const authService = {
    async login(username: string, senha: string): Promise<LoginResponse['user']> {
        // Validação básica
        if (!username || !senha) {
            throw new Error('Usuário e senha são obrigatórios');
        }

        // Normaliza — login é case-insensitive
        const usernameLower = username.trim().toLowerCase();

        let response: any;
        try {
            response = await api.post<{ data: LoginResponse }>('mobile/login', {
                username: usernameLower,
                senha,
            });
        } catch (error: any) {
            console.error('[AUTH] Erro no login:', error.message);
            // Repropaga o AxiosError original — classifyLoginError() precisa dele
            // intacto (status, code) para diferenciar rede/timeout/servidor/credenciais.
            throw error;
        }

        const data = response.data?.data || response.data; // Adaptação caso a API mude estrutura
        const { token, refreshToken, user } = data;

        if (!token || !user) {
            console.error('[AUTH] Resposta inválida:', data);
            throw new Error('Resposta do servidor incompleta (falta token ou user)');
        }

        // Salvar token e dados do usuário
        try {
            await Promise.all([
                storage.setItem('user_token', token),
                storage.setItem('refresh_token', refreshToken),
                storage.setItem('user_data', JSON.stringify(user)),
            ]);
        } catch (error) {
            console.error('[AUTH] Erro ao salvar dados:', error);
            throw new Error('Erro ao salvar dados de autenticação no dispositivo');
        }

        console.log('[AUTH] Login realizado com sucesso:', user.username);
        return user;
    },

    async updateProfile(data: { email: string; nomeCompleto: string; senhaAtual: string; novaSenha?: string }): Promise<LoginResponse['user']> {
        let response: any;
        try {
            response = await api.put<{ data: { user: LoginResponse['user'] } }>('auth/update-profile', data);
        } catch (error: any) {
            console.error('[AUTH] Erro ao atualizar perfil:', error.message);
            const serverMsg = error.response?.data?.message || error.response?.data?.error;
            const networkMsg = error.message;
            throw new Error(serverMsg || networkMsg || 'Falha ao atualizar perfil');
        }

        const updatedUser = response.data?.data?.user || response.data?.user;

        if (!updatedUser) {
            throw new Error('Resposta do servidor incompleta após atualização');
        }

        // Atualizar o storage local com os novos dados
        try {
            await storage.setItem('user_data', JSON.stringify(updatedUser));
        } catch (error) {
            console.error('[AUTH] Erro ao salvar dados atualizados:', error);
            throw new Error('Erro ao salvar dados de autenticação atualizados no dispositivo');
        }

        return updatedUser;
    },

    async logout(): Promise<void> {
        try {
            await storage.removeItem('user_token');
            await storage.removeItem('refresh_token');
            await storage.removeItem('user_data');
        } catch (error) {
            console.error('Erro no logout:', error);
        }
    },

    async getUser(): Promise<LoginResponse['user'] | null> {
        try {
            const userData = await storage.getItem('user_data');
            return userData ? JSON.parse(userData) : null;
        } catch (error) {
            return null;
        }
    },

    async isAuthenticated(): Promise<boolean> {
        const token = await storage.getItem('user_token');
        return !!token;
    },

    async fetchMotoristaId(): Promise<number | null> {
        try {
            const response: any = await api.get('mobile/me');
            const idMotorista = response.data?.data?.id_motorista ?? null;
            if (idMotorista != null) {
                const userData = await storage.getItem('user_data');
                if (userData) {
                    const user = JSON.parse(userData);
                    user.id_motorista = idMotorista;
                    await storage.setItem('user_data', JSON.stringify(user));
                }
            }
            return idMotorista != null ? Number(idMotorista) : null;
        } catch {
            return null;
        }
    },
};
