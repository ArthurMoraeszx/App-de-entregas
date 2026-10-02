// Design System — cores e estilos do aplicativo.
// Trocar a paleta aqui reflete em todas as telas.

// Cores Base (Compartilhadas)
const BaseColors = {
    // Cor primaria do aplicativo
    primary: '#0F766E',
    primaryDark: '#115E59',
    primaryLight: '#5EEAD4',

    // Status Colors
    success: '#10B981',
    successLight: '#D1FAE5', // Light only usually
    warning: '#F59E0B',
    warningLight: '#FEF3C7', // Light only usually
    error: '#EF4444',
    errorLight: '#FEE2E2', // Light only usually
    info: '#3B82F6',
    infoLight: '#DBEAFE', // Light only usually

    // Gêneros Alimentícios (Fixos por enquanto)
    generoOvo: '#FFD54F',
    generoCarne: '#E57373',
    generoFrango: '#FFB74D',
    generoLombo: '#F06292',

    // Sync Status
    sincronizado: '#10B981',
    pendente: '#F59E0B',
    sincronizando: '#3B82F6',
    erro: '#EF4444',

    white: '#FFFFFF',
    black: '#000000',
    transparent: 'transparent',
};

export const LightColors = {
    ...BaseColors,
    // Backgrounds
    background: '#F8FAFC',
    backgroundDark: '#F1F5F9',
    cardBackground: '#FFFFFF',

    // Text
    textPrimary: '#1F2937',
    textSecondary: '#6B7280',
    textLight: '#9CA3AF',

    // Borders & Shadows
    border: '#E5E7EB',
    borderLight: '#F3F4F6',
    shadow: 'rgba(0, 0, 0, 0.08)',
};

export const DarkColors = {
    ...BaseColors,
    // Backgrounds (Slate Palette from Web)
    background: '#0F172A', // Slate 900
    backgroundDark: '#020617', // Slate 950
    cardBackground: '#1E293B', // Slate 800

    // Text
    textPrimary: '#E2E8F0', // Slate 200
    textSecondary: '#CBD5E1', // Slate 300
    textLight: '#94A3B8', // Slate 400

    // Status Backgrounds (Darkened/Transparent for Dark Mode)
    successLight: 'rgba(16, 185, 129, 0.15)',
    warningLight: 'rgba(245, 158, 11, 0.15)',
    errorLight: 'rgba(239, 68, 68, 0.15)',
    infoLight: 'rgba(59, 130, 246, 0.15)',

    // Borders & Shadows
    border: '#334155', // Slate 700
    borderLight: '#1E293B', // Slate 800
    shadow: 'rgba(0, 0, 0, 0.3)', // Shadows mais fortes no dark
};

// Default export for backward compatibility (will be replaced by context)
export const Colors = LightColors;

export type ThemeColors = typeof LightColors;

export const Typography = {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',

    // Sizes (otimizado para mobile)
    xs: 11,
    sm: 12,
    base: 13,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 24,
    xxxl: 32,

    // Weights
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
};

export const Spacing = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
};

export const BorderRadius = {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    full: 9999,
};

export const Shadows = {
    sm: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
    },
    md: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 4,
    },
    lg: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 16,
        elevation: 8,
    },
};
