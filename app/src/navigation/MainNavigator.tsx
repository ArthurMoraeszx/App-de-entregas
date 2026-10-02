import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import MerendaHomeScreen from '../screens/MerendaHomeScreen';
import MerendaEntregaDetalhesScreen from '../screens/MerendaEntregaDetalhesScreen';
import MerendaRegistroEntregaScreen from '../screens/MerendaRegistroEntregaScreen';
import MerendaRegistroQuestionarioScreen from '../screens/MerendaRegistroQuestionarioScreen';
import MerendaPerfilScreen from '../screens/MerendaPerfilScreen';
// DORMANT: import MerendaSyncStatusScreen from '../screens/MerendaSyncStatusScreen';
import ProfileEditScreen from '../screens/ProfileEditScreen';
import { Colors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import type { RootStackParamList } from '../../App';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function MainNavigator() {
    const { colors } = useTheme();

    return (
        <NavigationContainer
            // Este app não usa deep linking: as telas recebem o objeto da entrega
            // em memória, não pela URL. Sem desligar isso explicitamente, o React
            // Navigation monta um href para o botão voltar serializando os
            // parâmetros na query string — e um objeto vira o literal
            // "?entrega=[object Object]", que aparece na barra de status do
            // navegador e não restauraria a tela de qualquer maneira.
            linking={{ enabled: false, prefixes: [] }}
        >
            <Stack.Navigator
                initialRouteName="Home"
                screenOptions={{
                    headerStyle: {
                        backgroundColor: colors.primary,
                    },
                    headerTintColor: colors.white,
                    headerTitleStyle: {
                        fontWeight: '600',
                    },
                    headerShadowVisible: false,
                    animation: 'slide_from_right',
                    contentStyle: {
                        backgroundColor: colors.background,
                    }
                }}
            >
                <Stack.Screen
                    name="Home"
                    component={MerendaHomeScreen}
                    options={{
                        title: 'Minhas Entregas',
                        headerLeft: () => null,
                    }}
                />
                <Stack.Screen
                    name="EntregaDetalhes"
                    component={MerendaEntregaDetalhesScreen}
                    options={{ title: 'Detalhes da Entrega' }}
                />
                <Stack.Screen
                    name="RegistroEntrega"
                    component={MerendaRegistroEntregaScreen}
                    options={{ title: 'Registrar Entrega' }}
                />
                <Stack.Screen
                    name="RegistroQuestionario"
                    component={MerendaRegistroQuestionarioScreen}
                    options={{ title: 'Questionário de Feedback' }}
                />
                <Stack.Screen
                    name="Perfil"
                    component={MerendaPerfilScreen}
                    options={{ title: 'Meu Perfil' }}
                />
                {/* DORMANT: SyncStatus + Notifications screens
                <Stack.Screen
                    name="SyncStatus"
                    component={MerendaSyncStatusScreen}
                    options={{ title: 'Sincronização' }}
                />
                <Stack.Screen
                    name="Notifications"
                    component={require('../screens/MerendaNotificationsScreen').default}
                    options={{ title: 'Notificações' }}
                />
                */}
                <Stack.Screen
                    name="About"
                    component={require('../screens/MerendaAboutScreen').default}
                    options={{ title: 'Sobre o App' }}
                />
                <Stack.Screen
                    name="ProfileEdit"
                    component={ProfileEditScreen}
                    options={{ title: 'Editar Perfil' }}
                />
            </Stack.Navigator>
        </NavigationContainer>
    );
}
