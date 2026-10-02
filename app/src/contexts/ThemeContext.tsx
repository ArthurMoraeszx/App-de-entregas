import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { SafeStorage } from '../utils/safeStorage';
import { LightColors, DarkColors, ThemeColors } from '../constants/theme';
import { StatusBar } from 'expo-status-bar';

type ThemeType = 'light' | 'dark';

interface ThemeContextData {
    theme: ThemeType;
    colors: ThemeColors;
    toggleTheme: () => void;
    setTheme: (theme: ThemeType) => void;
}

const ThemeContext = createContext<ThemeContextData>({} as ThemeContextData);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const systemColorScheme = useColorScheme();
    const [theme, setThemeState] = useState<ThemeType>('light');
    // null = segue o sistema; 'light'|'dark' = preferência manual salva pelo usuário
    const [userPreference, setUserPreference] = useState<ThemeType | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Carrega preferência salva uma única vez na montagem
    useEffect(() => {
        async function loadTheme() {
            try {
                const savedTheme = await SafeStorage.getItem('@Merenda:theme');
                if (savedTheme === 'light' || savedTheme === 'dark') {
                    setUserPreference(savedTheme);
                    setThemeState(savedTheme);
                } else {
                    // Sem preferência salva — usa o sistema
                    setThemeState((systemColorScheme as ThemeType) ?? 'light');
                }
            } catch (error) {
                console.log('Erro ao carregar tema:', error);
            } finally {
                setIsLoading(false);
            }
        }
        loadTheme();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Quando o sistema muda E o usuário não tem preferência manual, acompanha automaticamente
    useEffect(() => {
        if (!isLoading && userPreference === null && systemColorScheme) {
            setThemeState(systemColorScheme as ThemeType);
        }
    }, [systemColorScheme, userPreference, isLoading]);

    const toggleTheme = async () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setThemeState(newTheme);
        setUserPreference(newTheme);
        try {
            await SafeStorage.setItem('@Merenda:theme', newTheme);
        } catch (error) {
            console.log('Erro ao salvar tema:', error);
        }
    };

    const setTheme = async (newTheme: ThemeType) => {
        setThemeState(newTheme);
        setUserPreference(newTheme);
        try {
            await SafeStorage.setItem('@Merenda:theme', newTheme);
        } catch (error) {
            console.log('Erro ao salvar tema:', error);
        }
    };

    const colors = theme === 'light' ? LightColors : DarkColors;

    if (isLoading) {
        return null; // Ou um splash/loading
    }

    return (
        <ThemeContext.Provider value={{ theme, colors, toggleTheme, setTheme }}>
            <StatusBar style={theme === 'dark' ? 'light' : 'dark'} backgroundColor={colors.background} />
            {children}
        </ThemeContext.Provider>
    );
};

export function useTheme(): ThemeContextData {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
