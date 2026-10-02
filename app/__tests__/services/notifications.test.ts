import { registerForPushNotificationsAsync, syncPushTokenWithBackend } from '../../src/services/notifications';

const Notifications = jest.requireMock('expo-notifications');
const Device = jest.requireMock('expo-device');
const Constants = jest.requireMock('expo-constants');
const api = jest.requireMock('../../src/services/network').default;

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[abc]' }),
  scheduleNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  AndroidImportance: { HIGH: 'HIGH' },
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'time_interval' },
}));

jest.mock('expo-device', () => ({
  isDevice: true,
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        firebase: {
          messagingEnabled: false,
          projectId: 'mock-project-id',
        },
        eas: {
          projectId: 'mock-project-id',
        },
      },
    },
    manifest2: {
      extra: {
        firebase: {
          messagingEnabled: false,
        },
      },
    },
    easConfig: {
      projectId: 'mock-project-id',
    },
  },
}));

jest.mock('../../src/services/network', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  Device.isDevice = true;
  Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
  Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted' });
  notificationsExtra().firebase.messagingEnabled = false;
});

function notificationsExtra() {
  return Constants.default.expoConfig.extra;
}

describe('registerForPushNotificationsAsync', () => {
  it('retorna undefined em emulador ou quando não é dispositivo físico', async () => {
    Device.isDevice = false;
    const token = await registerForPushNotificationsAsync();
    expect(token).toBeUndefined();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('não chama getExpoPushTokenAsync quando o flag firebase.messagingEnabled é falso', async () => {
    Device.isDevice = true;
    notificationsExtra().firebase.messagingEnabled = false;
    const token = await registerForPushNotificationsAsync();
    expect(token).toBeUndefined();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('gera token quando o flag está habilitado', async () => {
    Device.isDevice = true;
    notificationsExtra().firebase.messagingEnabled = true;
    const token = await registerForPushNotificationsAsync();
    expect(token).toBe('ExponentPushToken[abc]');
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'mock-project-id' });
  });
});

describe('syncPushTokenWithBackend', () => {
  it('envia o payload esperado para o backend', async () => {
    await syncPushTokenWithBackend(42, 'ExponentPushToken[abc]');
    expect(api.post).toHaveBeenCalledWith('/mobile/token', { usuario_id: 42, pushToken: 'ExponentPushToken[abc]' });
  });
});
