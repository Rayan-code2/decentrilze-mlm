export const getEndpoint = () => 'http://localhost:3000';
export const getProjectId = () => 'postgres_sql_mainnet';

export const client = {
    subscribe: (channel: string, callback: (payload: any) => void) => {
        console.log(`[Mock Realtime Subscribe] Subscribed to events on channel: ${channel}`);
        return () => {
            console.log(`[Mock Realtime Unsubscribe] Cleared subscription on channel: ${channel}`);
        };
    }
};

export const account = {};
export const databases = {};
export const storage = {};
export const functions = {};
export const APPWRITE_CONFIG = {
    databaseId: 'mlm_spiral',
    collections: {
        users: 'users',
        packages: 'packages',
        purchases: 'purchases',
        goldQueue: 'gold_queue',
        wallets: 'wallets',
        transactions: 'transactions',
        exchanger_requests: 'exchanger_requests',
        settings: 'settings',
    }
};

export const isAppwriteConfigured = () => {
    if (localStorage.getItem('spiral_use_mock_api') === 'true') {
        return false;
    }
    return true;
};

export const ID = {
    unique: () => Math.random().toString(36).substring(2, 12).toUpperCase()
};

export const Query = {
    equal: (key: string, val: any) => `${key}=${val}`,
    limit: (l: number) => `limit=${l}`,
    orderAsc: (key: string) => `orderAsc=${key}`,
    cursorAfter: (id: string) => `after=${id}`
};
export { Query as default };
