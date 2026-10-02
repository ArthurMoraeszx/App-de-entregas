import { createContext, useContext } from 'react';

export type AuthUser = {
    id: number;
    username: string;
    nome: string;
    email: string;
    setor: string;
    nivel: string;
    id_motorista?: number | null;
} | null;

export type AuthContextValue = {
    logout: () => void;
    user: AuthUser;
    updateUser: (patch: Partial<NonNullable<AuthUser>>) => void;
};

export const AuthContext = createContext<AuthContextValue>({
    logout: () => {},
    user: null,
    updateUser: () => {},
});

export function useAuth() {
    return useContext(AuthContext);
}
