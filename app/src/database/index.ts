import { Platform } from 'react-native';
import type { Database } from '@nozbe/watermelondb';

let database: Database | null = null;

try {
    if (Platform.OS === 'web') {
        database = require('./index.web').database;
    } else {
        database = require('./index.native').database;
    }
} catch (error) {
    console.error('[DB] Falha ao carregar módulo do banco:', error);
    database = null;
}

export { database };
