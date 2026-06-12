/// <reference types="vite/client" />
import { Client, Account, Databases, Storage, Functions } from 'appwrite';

// Silence annoying Appwrite SDK version mismatch warnings in the browser console
if (typeof window !== 'undefined') {
    const originalWarn = console.warn;
    const originalLog = console.log;
    const shouldSuppress = (msg: any) => {
        if (typeof msg === 'string') {
            return msg.includes('The current SDK is built for Appwrite') || 
                   msg.includes('current Appwrite server version') || 
                   msg.includes('Please downgrade your SDK') ||
                   msg.includes('Appwrite version: https://appwrite.io');
        }
        return false;
    };
    console.warn = function (...args: any[]) {
        if (args.length > 0 && shouldSuppress(args[0])) return;
        originalWarn.apply(console, args);
    };
    console.log = function (...args: any[]) {
        if (args.length > 0 && shouldSuppress(args[0])) return;
        originalLog.apply(console, args);
    };
}

const getEndpoint = () => {
    const envEndpoint = import.meta.env.VITE_APPWRITE_ENDPOINT || import.meta.env.VITE_APPWRITE_EN || 'https://sgp.cloud.appwrite.io/v1';
    // Self-healing proxy: if browser is running over HTTPS but Appwrite endpoint is cleartext HTTP,
    // route requests via our Express proxy `/appwrite-api` to bypass browser mixed-content blocks.
    if (typeof window !== 'undefined') {
        if (window.location.protocol === 'https:' && envEndpoint.startsWith('http://')) {
            console.log("[Appwrite Connection] TLS mismatch resolved: Routing through browser HTTPS proxy.");
            return `${window.location.origin}/appwrite-api`;
        }
    }
    return envEndpoint;
};

const getProjectId = () => {
    let projectId = (import.meta.env.VITE_APPWRITE_PROJECT_ID || import.meta.env.VITE_APPWRITE_PR || '69d5b8c6001a776e6ebe').trim();
    if (projectId.includes('6a215a4b')) {
        console.log('[Self-Heal Client] Detected custom project ID reference. Mapping to working ID: 6a215a4b0014ba00db87');
        projectId = '6a215a4b0014ba00db87';
    }
    return projectId;
};

export const client = new Client()
    .setEndpoint(getEndpoint())
    .setProject(getProjectId());

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);
export const functions = new Functions(client);

export const APPWRITE_CONFIG = {
    databaseId: import.meta.env.VITE_APPWRITE_DATABASE_ID || import.meta.env.VITE_APPWRITE_DA || 'mlm_spiral',
    collections: {
        users: import.meta.env.VITE_APPWRITE_USERS_COLLECTION_ID || 'users',
        packages: import.meta.env.VITE_APPWRITE_PACKAGES_COLLECTION_ID || 'packages',
        purchases: import.meta.env.VITE_APPWRITE_PURCHASES_COLLECTION_ID || 'user_packages',
        goldQueue: import.meta.env.VITE_APPWRITE_GOLD_QUEUE_COLLECTION_ID || 'gold_queue',
        wallets: import.meta.env.VITE_APPWRITE_WALLETS_COLLECTION_ID || 'wallets',
        transactions: import.meta.env.VITE_APPWRITE_TRANSACTIONS_COLLECTION_ID || 'transactions',
        exchanger_requests: import.meta.env.VITE_APPWRITE_EXCHANGER_REQUESTS_COLLECTION_ID || 'exchanger_requests',
        settings: import.meta.env.VITE_APPWRITE_SETTINGS_COLLECTION_ID || 'settings',
    }
};

export const isAppwriteConfigured = () => {
    if (localStorage.getItem('spiral_use_mock_api') === 'true') {
        return false;
    }
    // Only return true if an actual project ID is supplied explicitly via environment variables
    const rawProjectId = import.meta.env.VITE_APPWRITE_PROJECT_ID || import.meta.env.VITE_APPWRITE_PR;
    if (!rawProjectId || rawProjectId.trim() === '' || rawProjectId === 'YOUR_PROJECT_ID') {
        return false;
    }
    return true;
};

export { ID, Query } from 'appwrite';
