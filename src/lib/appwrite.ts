/// <reference types="vite/client" />
import { Client, Account, Databases, Storage, Functions } from 'appwrite';

const getEndpoint = () => {
    const envEndpoint = import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1';
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

export const client = new Client()
    .setEndpoint(getEndpoint())
    .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID || '69d5b8c6001a776e6ebe');

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);
export const functions = new Functions(client);

export const APPWRITE_CONFIG = {
    databaseId: import.meta.env.VITE_APPWRITE_DATABASE_ID || 'mlm_spiral',
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
    // If the project ID is not the placeholder, it's considered configured
    const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID || '69d5b8c6001a776e6ebe';
    return projectId !== 'YOUR_PROJECT_ID' && projectId !== '';
};

export { ID, Query } from 'appwrite';
