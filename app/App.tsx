import React, { useState } from 'react';
import * as Sentry from "@sentry/react-native";
import Constants from 'expo-constants';
import { View, Text, TouchableOpacity, StyleSheet, BackHandler } from 'react-native';

// Suprime console.log e console.warn em builds de produção
if (!__DEV__) {
    console.log = () => {};
    console.warn = () => {};
}

Sentry.init({
  dsn: Constants.expoConfig?.extra?.sentryDsn ?? '',
  debug: false,
  tracesSampleRate: __DEV__ ? 1.0 : 0.1,
  enableNativeNagger: false,
});

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAutoSync } from './src/hooks/useAutoSync';
import { syncData } from './src/database/sync/syncService';
import LocationPermissionGate from './src/components/LocationPermissionGate';

// MerendaLoginScreen fica no App (fora do navigator)
import { ThemeProvider } from './src/contexts/ThemeContext';
import MerendaLoginScreen from './src/screens/MerendaLoginScreen';
// DORMANT: push notifications disabled — restore these imports to re-enable
// import * as Notifications from 'expo-notifications';
// import { registerForPushNotificationsAsync, syncPushTokenWithBackend } from './src/services/notifications';
// import { resetNotificationThrottle } from './src/services/notificationScheduler';
import { authService } from './src/services/auth';
import { setSessionExpiredHandler } from './src/utils/authEvents';

import { AuthContext, useAuth, type AuthUser } from './src/contexts/AuthContext';
import type { EntregaStatusValue } from './src/utils/entregaAtraso';
export { useAuth };

// Types
export type Entrega = {
  id: string;
  numGuia: string;
  escola: string;       // cod_escola (código numérico) — mantido para compatibilidade
  nomeEscola: string;   // nome real da escola (ex: "ESCOLA ESTADUAL DOM PEDRO II")
  municipio: string;    // município da escola
  gre: string;          // Gerência Regional de Educação
  genero: string;
  qtdEnviada: number;
  // Valores reais da coluna `status` — tipo único, ver mobile/src/utils/entregaAtraso.ts.
  // ('sincronizado'/'sincronizando'/'erro' nunca foram gravados aqui: são estados
  // do BadgeStatus de sincronização, um conceito diferente — ver Badge.tsx.)
  status: EntregaStatusValue;
  dtPrevisao: string;
  distance?: number;
  endereco?: string;          // Endereço real da escola
  data_hora_entrega?: string; // Data real de entrega (se concluído)
  dt_entregue?: string;       // Data real de entrega, campo prioritário  — mais confiável que data_hora_entrega
  latitude?: number | null;   // Coordenada GPS capturada no momento da entrega
  longitude?: number | null;  // Coordenada GPS capturada no momento da entrega
  prioridade?: boolean;
  emergencial?: boolean;
  data_prevista_fornecedor?: string;
  data_antecipacao?: string;
  data_prorrogacao?: string;
  dt_inicio_cronograma?: string; // Prazo base do cronograma (SecEdu)
  tipo_entrega?: 'Total' | 'Parcial';
  id_motorista?: number | null;
};

export type RootStackParamList = {
  Home: undefined;
  EntregaDetalhes: { entrega: Entrega };
  RegistroEntrega: { entrega: Entrega };
  RegistroQuestionario: { entrega: Entrega; fotoGuia?: string; tipoEntrega?: 'Total' | 'Parcial' };
  Perfil: undefined;
  SyncStatus: undefined;
  Notifications: undefined;
  About: undefined;
  ProfileEdit: { user: any };
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

// Navigator carregado sob demanda (evita inicializar react-native-screens no startup)
let MainNavigator: React.ComponentType | null = null;

function ErrorFallback({ error, resetError }: { error: Error; resetError: () => void }) {
  return (
    <View style={eb.container}>
      <View style={eb.card}>
        <Text style={eb.icon}>⚠️</Text>
        <Text style={eb.title}>Algo deu errado</Text>
        <Text style={eb.body}>
          O aplicativo encontrou um problema inesperado. Seus dados estão salvos — feche e abra o app para continuar.
        </Text>
        <TouchableOpacity style={eb.btn} onPress={() => BackHandler.exitApp()}>
          <Text style={eb.btnText}>Fechar o app</Text>
        </TouchableOpacity>
        <TouchableOpacity style={eb.btnSecondary} onPress={resetError}>
          <Text style={eb.btnSecondaryText}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const eb = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1117', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { backgroundColor: '#161B22', borderRadius: 12, padding: 28, width: '100%', maxWidth: 360, alignItems: 'center' },
  icon: { fontSize: 40, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#E6EDF3', marginBottom: 10, textAlign: 'center' },
  body: { fontSize: 14, color: '#8B949E', lineHeight: 20, textAlign: 'center', marginBottom: 24 },
  btn: { backgroundColor: '#1B5E8F', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 24, width: '100%', alignItems: 'center', marginBottom: 10 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  btnSecondary: { paddingVertical: 8, paddingHorizontal: 24 },
  btnSecondaryText: { color: '#4FA3E0', fontSize: 14 },
});

/**
 * Componente interno que ativa a sincronização automática.
 * Só é montado quando o usuário já está autenticado, portanto
 * syncData() não será chamado em estado de logout/login.
 */
function AuthenticatedApp() {
  // Hook que escuta mudanças de rede e sincroniza automaticamente
  useAutoSync();

  return (
    <LocationPermissionGate>
      {MainNavigator ? <MainNavigator /> : null}
    </LocationPermissionGate>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser>(null);

  const triggerInitialSync = React.useCallback(async () => {
    try {
      await syncData();
    } catch (error) {
      console.warn('[App] Falha ao sincronizar na entrada:', error);
    }
  }, []);

  // Carregar navigator sob demanda (só quando autenticado)
  if (isAuthenticated && !MainNavigator) {
    MainNavigator = require('./src/navigation/MainNavigator').default;
  }

  const authContext = React.useMemo(
    () => ({
      logout: () => {
        setIsAuthenticated(false);
        setCurrentUser(null);
        Sentry.setUser(null);
      },
      user: currentUser,
      updateUser: (patch: Partial<NonNullable<AuthUser>>) => {
        setCurrentUser(prev => prev ? { ...prev, ...patch } : prev);
      },
    }),
    [currentUser],
  );

  React.useEffect(() => {
    // Redireciona para login quando o refresh token expira durante sessão ativa
    setSessionExpiredHandler(() => {
      setIsAuthenticated(false);
      setCurrentUser(null);
    });

    // Tenta autologin
    authService.getUser().then(async user => {
      if (user) {
        setCurrentUser(user);
        setIsAuthenticated(true);
        Sentry.setUser({ username: (user as any).username ?? null });
        triggerInitialSync();
        // Busca id_motorista se a sessão salva não o tem (login anterior às mudanças)
        if (user.id_motorista == null && user.nivel === 'driver') {
          const idMotorista = await authService.fetchMotoristaId();
          if (idMotorista != null) {
            setCurrentUser(prev => prev ? { ...prev, id_motorista: idMotorista } : prev);
          }
        }
      }
    });
  }, []);

  return (
    <SafeAreaProvider>
      <Sentry.ErrorBoundary fallback={({ error, resetError }) => <ErrorFallback error={error instanceof Error ? error : new Error(String(error))} resetError={resetError} />}>
      <ThemeProvider>
        <AuthContext.Provider value={authContext}>
          {isAuthenticated ? (
            <AuthenticatedApp />
          ) : (
            <MerendaLoginScreen onLoginSuccess={async () => {
              const user = await authService.getUser();
              setCurrentUser(user);
              setIsAuthenticated(true);
              if (user) Sentry.setUser({ username: (user as any).username ?? null });
              triggerInitialSync();
            }} />
          )}
        </AuthContext.Provider>
      </ThemeProvider>
      </Sentry.ErrorBoundary>
    </SafeAreaProvider>
  );
}

// Envolver o App com o Sentry para captura automática de erros de renderização
export default Sentry.wrap(App);
