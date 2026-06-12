import './suppress-warnings';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { Client, Databases, ID, Query, Users, Account } from 'node-appwrite';
import dotenv from 'dotenv';
import fs from 'fs';

// Robust self-healing dotenv resolution for Linux VPS (to prevent PM2 working directory mismatch)
const envPaths = [
    path.resolve(process.cwd(), '.env'),
    path.join(__dirname, '.env'),
    path.join(__dirname, '../.env'),
    path.join(__dirname, '../../.env'),
    '/root/mlm/.env',
    '/root/mlm-server/.env'
];

let loadedPath = '';
for (const envPath of envPaths) {
    try {
        if (fs.existsSync(envPath)) {
            dotenv.config({ path: envPath, override: true });
            loadedPath = envPath;
            break;
        }
    } catch (err) {
        // Safe skip on permission issues
    }
}

if (loadedPath) {
    console.log(`[Self-Heal] Wow! Dotenv successfully loaded settings from: "${loadedPath}"`);
} else {
    dotenv.config({ override: true });
    console.warn(`[Self-Heal] Warning: No explicit .env file found in candidates: ${JSON.stringify(envPaths)}. Defaulting to standard process.env.`);
}

// Self-healing environment mapping of visually truncated variables from Google AI Studio Secrets UI
if (!process.env.VITE_APPWRITE_ENDPOINT && process.env.VITE_APPWRITE_EN) {
    console.log(`[Self-Heal] Mapping VITE_APPWRITE_EN to VITE_APPWRITE_ENDPOINT: ${process.env.VITE_APPWRITE_EN}`);
    process.env.VITE_APPWRITE_ENDPOINT = process.env.VITE_APPWRITE_EN.trim();
}

// Auto-heal IP-based Appwrite Endpoints missing the mandatory 8080 port used in your Docker container configuration
if (process.env.VITE_APPWRITE_ENDPOINT) {
    const rawEndpoint = process.env.VITE_APPWRITE_ENDPOINT.trim();
    const ipPortRegex = /^https?:\/\/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?(\/.*)?$/;
    const ipMatch = rawEndpoint.match(ipPortRegex);
    if (ipMatch) {
        const host = ipMatch[1];
        const port = ipMatch[2];
        const pathSuffix = ipMatch[3] || '/v1';
        if (!port || port === ':80') {
            const corrected = `http://${host}:8080${pathSuffix}`;
            console.log(`[Self-Heal] Wow! Detected IP-based endpoint ${rawEndpoint} on port 80 (Nginx). Automatically routing to Appwrite on port 8080: ${corrected}`);
            process.env.VITE_APPWRITE_ENDPOINT = corrected;
        }
    }
}
if (!process.env.VITE_APPWRITE_PROJECT_ID && process.env.VITE_APPWRITE_PR) {
    console.log(`[Self-Heal] Mapping VITE_APPWRITE_PR to VITE_APPWRITE_PROJECT_ID: ${process.env.VITE_APPWRITE_PR}`);
    process.env.VITE_APPWRITE_PROJECT_ID = process.env.VITE_APPWRITE_PR.trim();
}
if (!process.env.VITE_APPWRITE_DATABASE_ID && process.env.VITE_APPWRITE_DA) {
    console.log(`[Self-Heal] Mapping VITE_APPWRITE_DA to VITE_APPWRITE_DATABASE_ID: ${process.env.VITE_APPWRITE_DA}`);
    process.env.VITE_APPWRITE_DATABASE_ID = process.env.VITE_APPWRITE_DA.trim();
}

// Auto-heal any variation of project default or custom ids containing '6a215a4b' to the actual validated working Project ID:
if (process.env.VITE_APPWRITE_PROJECT_ID && process.env.VITE_APPWRITE_PROJECT_ID.includes('6a215a4b')) {
    console.log(`[Self-Heal] Wow! Detected project ID variation "${process.env.VITE_APPWRITE_PROJECT_ID}". Automatically routing to working key: "6a215a4b0014ba00db87"`);
    process.env.VITE_APPWRITE_PROJECT_ID = '6a215a4b0014ba00db87';
}


const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(express.json());

// Proxy client-side Appwrite calls to bypass HTTPS mixed content (HTTP IP blocking)
app.all('/appwrite-api/*', async (req: any, res: any) => {
    const targetEndpoint = (process.env.VITE_APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1').replace(/\/$/, '');
    const pathSuffix = req.path.replace(/^\/appwrite-api/, '');
    const queryStr = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    const targetUrl = `${targetEndpoint}${pathSuffix}${queryStr}`;

    const projectHeader = req.headers['x-appwrite-project'];
    console.log(`[Proxy Request] Path: ${req.path} -> Target: ${targetUrl}`);
    console.log(`[Proxy Headers] x-appwrite-project: "${projectHeader}" | env VITE_APPWRITE_PROJECT_ID: "${process.env.VITE_APPWRITE_PROJECT_ID}"`);

    try {
        const headers: any = {};
        for (const [key, value] of Object.entries(req.headers)) {
            if (!['host', 'origin', 'referer', 'content-length', 'connection'].includes(key.toLowerCase())) {
                headers[key] = value;
            }
        }

        const options: any = {
            method: req.method,
            headers,
        };

        const isJson = (req.headers['content-type'] || '').toLowerCase().includes('application/json');

        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            if (isJson && req.body) {
                options.body = JSON.stringify(req.body);
            } else {
                // For non-JSON (like multipart form uploads), pass the request stream to fetch
                options.body = req;
                options.duplex = 'half';
            }
        }

        const fetchResponse = await fetch(targetUrl, options);
        console.log(`[Proxy Response] Status from Appwrite: ${fetchResponse.status}`);
        
        res.status(fetchResponse.status);

        fetchResponse.headers.forEach((value, name) => {
            if (!['content-encoding', 'transfer-encoding', 'connection'].includes(name.toLowerCase())) {
                res.setHeader(name, value);
            }
        });

        const arrayBuffer = await fetchResponse.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));
    } catch (err: any) {
        console.error(`[Proxy Error] ${req.method} ${req.url} failed:`, err.message);
        res.status(500).json({ error: 'Proxy failed', message: err.message });
    }
});

// Appwrite Server Client Initialization
const client = new Client()
    .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1')
    .setProject(process.env.VITE_APPWRITE_PROJECT_ID || '69d5b8c6001a776e6ebe')
    .setKey(process.env.APPWRITE_API_KEY || '');

const databases = new Databases(client);
const users = new Users(client);

const databaseId = process.env.VITE_APPWRITE_DATABASE_ID || 'mlm_spiral';
const collections = {
    users: process.env.VITE_APPWRITE_USERS_COLLECTION_ID || 'users',
    wallets: process.env.VITE_APPWRITE_WALLETS_COLLECTION_ID || 'wallets',
    transactions: process.env.VITE_APPWRITE_TRANSACTIONS_COLLECTION_ID || 'transactions',
    purchases: process.env.VITE_APPWRITE_PURCHASES_COLLECTION_ID || 'purchases',
    user_packages: process.env.VITE_APPWRITE_USER_PACKAGES_COLLECTION_ID || process.env.VITE_APPWRITE_PURCHASES_COLLECTION_ID || 'user_packages',
    packages: process.env.VITE_APPWRITE_PACKAGES_COLLECTION_ID || 'packages',
    settings: process.env.VITE_APPWRITE_SETTINGS_COLLECTION_ID || 'settings',
    exchanger_requests: process.env.VITE_APPWRITE_EXCHANGER_REQUESTS_COLLECTION_ID || 'exchanger_requests',
    gold_queue: process.env.VITE_APPWRITE_GOLD_QUEUE_COLLECTION_ID || 'gold_queue',
};

// --- APPWRITE FUNCTIONS: ROI & OTHER CRONS ---
// These are managed via Appwrite Console for better reliability and avoiding timeouts.

console.log('[Config] Appwrite Server Init Config:');
console.log('  -> Endpoint:', process.env.VITE_APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1');
console.log('  -> Project ID:', process.env.VITE_APPWRITE_PROJECT_ID || '69d5b8c6001a776e6ebe');
console.log('  -> Database ID:', databaseId);
console.log('  -> API Key Length:', (process.env.APPWRITE_API_KEY || '').length);
console.log('[Config] Using Collections:', JSON.stringify(collections, null, 2));

// Helper: Resolve User Auth ID from either Auth ID or Document ID
async function resolveUserAuthId(identifier: string): Promise<string | null> {
    if (!identifier) return null;
    if (identifier === '1') {
        try {
            const adminRes = await databases.listDocuments(databaseId, collections.users, [
                Query.equal('role', ['admin', 'ADMIN']),
                Query.limit(1)
            ]);
            if (adminRes.total > 0) return (adminRes.documents[0] as any).user_id;
        } catch (e) {
            console.warn("Error resolving admin auth ID:", e);
        }
        return '1';
    }

    try {
        console.log(`[ID_RESOLVER] Attempting to resolve: ${identifier}`);
        
        // 1. Try assuming it's an Auth ID (search by user_id field)
        const byAuthId = await databases.listDocuments(databaseId, collections.users, [
            Query.equal('user_id', [identifier])
        ]);
        if (byAuthId.total > 0) {
            const foundId = (byAuthId.documents[0] as any).user_id;
            console.log(`[ID_RESOLVER] Identity confirmed by Auth ID: ${foundId}`);
            return foundId;
        }

        // 2. Try assuming it's a Node ID (search by node_id field)
        const byNodeId = await databases.listDocuments(databaseId, collections.users, [
            Query.equal('node_id', [identifier])
        ]);
        if (byNodeId.total > 0) {
            const foundId = (byNodeId.documents[0] as any).user_id;
            console.log(`[ID_RESOLVER] Identity found via Node ID: ${foundId}`);
            return foundId;
        }

        // 3. Try assuming it's a Document ID (get document directly)
        try {
            const byDocId = await databases.getDocument(databaseId, collections.users, identifier);
            const foundId = (byDocId as any).user_id;
            if (foundId) {
                console.log(`[ID_RESOLVER] Identity resolved from Doc ID ${identifier} to Auth ID: ${foundId}`);
                return foundId;
            }
        } catch (docErr: any) {
            // Not a document ID or not found
        }
        
        console.log(`[ID_RESOLVER] Could not resolve identity, returning raw: ${identifier}`);
        return identifier;
    } catch (e) {
        console.error(`[ID_RESOLVER] Error resolving ${identifier}:`, e);
        return identifier;
    }
}

// Helper: Safe and Self-Healing Create Document
async function safeCreateDocument(collId: string, docId: string, payload: any, maxRetries = 10): Promise<any> {
    let retryCount = 0;
    const runCreate = async (currentPayload: any): Promise<any> => {
        try {
            return await databases.createDocument(databaseId, collId, docId, currentPayload);
        } catch (error: any) {
            const errMsg = error.message || "";
            const match = errMsg.match(/attribute[:\s]+(["'])?([^"'\s]+)\1?/i);
            const unknownField = match ? match[2] : null;

            if (unknownField && retryCount < maxRetries) {
                console.warn(`[Self-Healing] Removing unknown field '${unknownField}' from CREATE payload in collection ${collId}`);
                delete currentPayload[unknownField];
                retryCount++;
                return runCreate(currentPayload);
            }
            throw error;
        }
    };
    return runCreate({ ...payload });
}

function unpackSpinsFromLastRoiAt(lastRoiAt: string | undefined): number {
    if (!lastRoiAt) return 0;
    try {
        const date = new Date(lastRoiAt);
        const ms = date.getUTCMilliseconds();
        if (!isNaN(ms)) {
            return ms;
        }
    } catch (e) {
        // Fallback
    }
    return 0;
}

function packSpinsIntoLastRoiAt(lastRoiAt: string | undefined, spins: number): string {
    const baseDate = lastRoiAt ? new Date(lastRoiAt) : new Date();
    const safeSpins = Math.min(Math.max(0, spins), 999);
    baseDate.setUTCMilliseconds(safeSpins);
    return baseDate.toISOString().substring(0, 23) + 'Z';
}

function enrichWalletWithSpins(wallet: any): any {
    if (!wallet) return wallet;
    if (wallet.available_spins !== undefined && wallet.available_spins !== null && typeof wallet.available_spins === 'number') {
        return wallet;
    }
    wallet.available_spins = unpackSpinsFromLastRoiAt(wallet.last_roi_at);
    return wallet;
}

// Helper: Safe and Self-Healing Update Document
async function safeUpdateDocument(collId: string, docId: string, payload: any, maxRetries = 10): Promise<any> {
    let retryCount = 0;
    const runUpdate = async (currentPayload: any): Promise<any> => {
        try {
            return await databases.updateDocument(databaseId, collId, docId, currentPayload);
        } catch (error: any) {
            const errMsg = error.message || "";
            const match = errMsg.match(/attribute[:\s]+(["'])?([^"'\s]+)\1?/i);
            const unknownField = match ? match[2] : null;

            if (unknownField && retryCount < maxRetries) {
                console.warn(`[Self-Healing] Removing unknown field '${unknownField}' from UPDATE payload in collection ${collId}`);
                delete currentPayload[unknownField];
                retryCount++;
                return runUpdate(currentPayload);
            }
            throw error;
        }
    };
    return runUpdate({ ...payload });
}

// Helper: Find next available slot in Global Matrix (Scalable Cursor Search)
async function findGlobalMatrixParent(): Promise<string> {
    try {
        console.log("[Matrix] Scanning for available slot (100k scale mode)...");
        
        let cursor = undefined;
        let hasMore = true;
        const matrixWidth = 2; // binary tree width

        while (hasMore) {
            const queries: string[] = [
                Query.limit(50),
                Query.orderAsc('$createdAt')
            ];
            if (cursor) queries.push(Query.cursorAfter(cursor));

            const response = await databases.listDocuments(databaseId, collections.users, queries);
            
            if (response.documents.length === 0) break;

            for (const u of response.documents as any[]) {
                const userId = u.user_id || u.$id;
                
                // Count direct matrix children
                const childrenRes = await databases.listDocuments(databaseId, collections.users, [
                    Query.equal('matrix_parent_id', [userId]),
                    Query.limit(5)
                ]);

                if (childrenRes.total < matrixWidth) {
                    console.log(`[Matrix] Found slot at Parent: ${userId} (${childrenRes.total} current children)`);
                    return userId;
                }
            }

            cursor = response.documents[response.documents.length - 1].$id;
            if (response.documents.length < 50) hasMore = false;
        }

        // Ultimate fallback
        return '1';
    } catch (error) {
        console.error("Critical Matrix Search Error:", error);
        return '1';
    }
}

// Helper: Fetch Full User Document by Auth ID
async function fetchUserById(userId: string) {
    try {
        const res = await databases.listDocuments(databaseId, collections.users, [
            Query.equal('user_id', [userId])
        ]);
        return res.total > 0 ? (res.documents[0] as any) : null;
    } catch (e) {
        return null;
    }
}

// --- AUTH MIDDLEWARE ---
async function verifyAuth(req: any, res: any, next: any) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const jwt = authHeader.split(' ')[1];
    
    try {
        const authClient = new Client()
            .setEndpoint(process.env.VITE_APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1')
            .setProject(process.env.VITE_APPWRITE_PROJECT_ID || '69d5b8c6001a776e6ebe')
            .setJWT(jwt);
        
        const account = new Account(authClient);
        const user = await account.get();
        req.user = user;
        next();
    } catch (e: any) {
        console.error('[Auth] JWT Verification failed:', e.message);
        res.status(401).json({ success: false, message: 'Invalid or expired session' });
    }
}

async function verifyAdmin(req: any, res: any, next: any) {
    await verifyAuth(req, res, async () => {
        try {
            const userId = req.user.$id;
            const email = req.user.email;
            
            // 1. Try to find by user_id
            let userDocRes = await databases.listDocuments(databaseId, collections.users, [
                Query.equal('user_id', [userId])
            ]);

            let userDoc: any = null;
            if (userDocRes.total > 0) {
                userDoc = userDocRes.documents[0];
            } else if (email) {
                // 2. Fallback: Find by email
                const emailRes = await databases.listDocuments(databaseId, collections.users, [
                    Query.equal('email', [email])
                ]);
                if (emailRes.total > 0) {
                    userDoc = emailRes.documents[0];
                    // Self-healing: update user_id in the database document to match the actual Appwrite Auth ID
                    try {
                        await databases.updateDocument(databaseId, collections.users, userDoc.$id, {
                            user_id: userId
                        });
                        console.log(`[Self-Healing] Aligned user_id for ${email} with Auth ID ${userId}`);
                    } catch (alignErr: any) {
                        console.error(`[Self-Healing] Failed to align user_id for ${email}:`, alignErr.message);
                    }
                }
            }

            if (userDoc) {
                const role = userDoc.role?.toLowerCase();
                if (role === 'admin') {
                    return next();
                }
            }
            
            res.status(403).json({ success: false, message: 'Admin access required' });
        } catch (e: any) {
            console.error('[VerifyAdmin Error]', e);
            res.status(500).json({ success: false, message: 'Authorization check failed' });
        }
    });
}

// API Route: Securely distribute income (Capped logic)
app.post('/api/distribute-income', verifyAdmin, async (req, res) => {
    const { userId: rawUserId, amount, type, description, fromUserId } = req.body;
    try {
        const success = await distributeIncomeServer(rawUserId, Number(amount), type, description, fromUserId);
        if (success) {
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: 'Wallet not found or capping limit hit' });
        }
    } catch (error: any) {
        console.error('Income Route Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

function parseSettingsFields(settings: any) {
    if (!settings) return settings;
    const fieldsToParse = ['spin_rewards', 'rank_rewards', 'withdrawal_tiers', 'withdrawal_fees'];
    for (const field of fieldsToParse) {
        if (typeof settings[field] === 'string') {
            try {
                settings[field] = JSON.parse(settings[field]);
            } catch (err) {
                settings[field] = [];
            }
        }
    }

    // Add robust defaults if fields are empty
    if (!settings.spin_rewards || !Array.isArray(settings.spin_rewards) || settings.spin_rewards.length === 0) {
        settings.spin_rewards = [
            { id: '1', label: '10$', amount: 10, probability: 5 },
            { id: '2', label: 'ZERO', amount: 0, probability: 20 },
            { id: '3', label: '2$', amount: 2, probability: 10 },
            { id: '4', label: '50$', amount: 50, probability: 1 },
            { id: '5', label: '1$', amount: 1, probability: 15 },
            { id: '6', label: '5$', amount: 5, probability: 8 },
            { id: '7', label: '20$', amount: 20, probability: 3 },
            { id: '8', label: 'JACKPOT', amount: 0, probability: 0.5 },
            { id: '9', label: '15$', amount: 15, probability: 4 },
            { id: '10', label: '100$', amount: 100, probability: 0.5 },
            { id: '11', label: '1$', amount: 1, probability: 18 },
            { id: '12', label: '5$', amount: 5, probability: 15 }
        ];
    }

    if (!settings.rank_rewards || !Array.isArray(settings.rank_rewards) || settings.rank_rewards.length === 0) {
        settings.rank_rewards = [
            { id: '1', rank_name: 'Explorer', personal_business: 100, team_business: 500, reward_amount: 50, icon_type: 'star' },
            { id: '2', rank_name: 'Commander', personal_business: 500, team_business: 2500, reward_amount: 200, icon_type: 'award' },
            { id: '3', rank_name: 'Captain', personal_business: 1000, team_business: 10000, reward_amount: 1000, icon_type: 'shield' }
        ];
    }

    return settings;
}

async function getServerSettings() {
    const defaults = {
        min_withdrawal: 1,
        withdrawal_fee: 5,
        deposit_fee: 0,
        enable_deposit: true,
        enable_withdrawal: true,
        admin_address_trc20: 'SYSTEM_PENDING',
        admin_address_bep20: 'SYSTEM_PENDING',
        admin_address_erc20: 'SYSTEM_PENDING'
    };
    try {
        let settingsDoc;
        // Try 'settings' first
        try {
            settingsDoc = await databases.getDocument(databaseId, collections.settings, 'settings');
        } catch (e1) {
            // Fallback to 'current_settings'
            try {
                settingsDoc = await databases.getDocument(databaseId, collections.settings, 'current_settings');
            } catch (e2) {
                // Fallback to first available document
                const list = await databases.listDocuments(databaseId, collections.settings, [Query.limit(1)]);
                if (list.total > 0) {
                    settingsDoc = list.documents[0];
                }
            }
        }

        const merged = settingsDoc ? { ...defaults, ...settingsDoc } : defaults;
        return parseSettingsFields(merged);
    } catch (e) {
        console.error("[Settings] Critical failure in getServerSettings:", e);
        return defaults;
    }
}

// Helper for distribution within the server
async function distributeIncomeServer(rawUserId: string, amount: number, type: string, description: string, fromUserId?: string, incomeLevel?: number, skipCappingOverride: boolean = false, payoutId?: string): Promise<boolean> {
    try {
        const userId = await resolveUserAuthId(rawUserId) || rawUserId;
        
        // Add a tiny delay to ensure any preceding wallet/user writes (like balance deduction) 
        // have a chance to hit the Appwrite index before we fetch the wallet here.
        // SKIP this if called from server cron to speed up batch processing for 100k users.
        if (fromUserId !== 'SYSTEM') {
            await new Promise(r => setTimeout(r, 800));
        }

        // Only these 4 income types are subject to the capping limit (consume package space)
        const cappingIncomes = [
            'roi',
            'matrix_income',
            'level_income',
            'pool_payout'
        ];
        const isSubjectToCapping = cappingIncomes.includes(type);
        const skipCapping = skipCappingOverride || !isSubjectToCapping;

        // Define if this is the admin reliably
        const isAdmin = userId === '1' || rawUserId === '1';

        console.log(`[Income] Processing ${type} for ${userId}. Amount: ${amount}. SkipCapping: ${skipCapping}`);

        // 1. Get Wallet - Robust Resolution
        let wallet: any = null;
        
        // Define candidate IDs to search for
        const searchIds = [userId];
        if (rawUserId && rawUserId !== userId) searchIds.push(rawUserId);

        // Try #1: Direct ID for Admin (often has a specific document ID)
        if (isAdmin) {
            try {
                wallet = await databases.getDocument(databaseId, collections.wallets, 'admin_wallet');
            } catch (e) {}
        }

        // Try #2: List by user_id field for any of our candidate IDs
        if (!wallet) {
            const walletResponse = await databases.listDocuments(databaseId, collections.wallets, [
                Query.equal('user_id', searchIds)
            ]);
            if (walletResponse.total > 0) {
                wallet = walletResponse.documents[0];
            }
        }

        // Try #3: List by rawUserId explicitly if still not found
        if (!wallet && rawUserId) {
            const walletResponse = await databases.listDocuments(databaseId, collections.wallets, [
                Query.equal('user_id', [rawUserId])
            ]);
            if (walletResponse.total > 0) {
                wallet = walletResponse.documents[0];
            }
        }

        if (!wallet) {
            console.log(`[Income] Wallet not found for ${userId}, attempting auto-create...`);
            try {
                // Determine the correct user_id field value
                const walletUserId = isAdmin ? '1' : (userId || rawUserId || '1');
                wallet = await databases.createDocument(databaseId, collections.wallets, ID.unique(), {
                    user_id: walletUserId,
                    balance: 0,
                    total_earned: 0,
                    total_withdrawn: 0,
                    direct_income: 0,
                    level_income: 0,
                    pool_income: 0,
                    roi_income: 0,
                    wallet_roi_earned: 0,
                    created_at: new Date().toISOString().substring(0, 19) + 'Z'
                });
            } catch (err: any) {
                console.error(`[Income] Wallet fallback creation failed:`, err);
                return false;
            }
        }

        if (wallet) {
            enrichWalletWithSpins(wallet);
        }
        
        // 2. Resolve Active Packages for Capping (if not skipped)
        let amountToCredit = Number(amount);
        let finalAmountForUser = 0;

        // CRITICAL FIX: If skipCapping is true or User is Admin, we skip the package search logic entirely
        if (isAdmin || skipCapping) {
            finalAmountForUser = amountToCredit;
        } else {
            // Fetch ALL active packages for this user
            let pkgResponse = await databases.listDocuments(databaseId, collections.user_packages, [
                Query.equal('user_id', [userId]), // Always use Auth ID here
                Query.equal('is_active', true)
            ]);

            // If no packages found and it's a non-skipped income, try a longer delay and retry
            // This helps with race conditions where a package was JUST created (e.g. Instant ROI)
            if (pkgResponse.total === 0) {
                console.log(`[Income] No active packages for ${userId}. Retrying in 2.5s for indexing lag...`);
                await new Promise(r => setTimeout(r, 2500));
                pkgResponse = await databases.listDocuments(databaseId, collections.user_packages, [
                    Query.equal('user_id', [userId]),
                    Query.equal('is_active', true)
                ]);
            }

            const packages = pkgResponse.documents as any[];
            // Sort by activated_at manually to be safe
            packages.sort((a, b) => new Date(a.activated_at || a.$createdAt).getTime() - new Date(b.activated_at || b.$createdAt).getTime());

            let remainingIncomeForCapping = amountToCredit;

            if (packages.length === 0) {
                // If no active packages, all income types go to Admin surplus
                console.log(`[Capping] Income $${amountToCredit.toFixed(4)} from ${userId} sent to Admin (No Active Pkg)`);
                await distributeIncomeServer('1', amountToCredit, type, `${description} (Surplus from ${userId} - No Active Pkg)`, fromUserId, incomeLevel);
            } else {
                for (const pkg of packages) {
                    if (remainingIncomeForCapping <= 0) break;

                    const pkgPrice = Number(pkg.price || 0);
                    let maxPerc = Number(pkg.max_roi_percent || 260);

                    // --- INDEXING LAG PROTECTION & GRACE PERIOD ---
                    const createdAt = new Date(pkg.$createdAt || pkg.activated_at).getTime();
                    const age = (Date.now() - createdAt) / 1000;
                    
                    if (age < 60) {
                        console.log(`[Capping] Pkg ${pkg.$id} in grace period (~${age.toFixed(0)}s). Crediting to user.`);
                        finalAmountForUser += remainingIncomeForCapping;
                        remainingIncomeForCapping = 0;
                        break; 
                    }

                    if (pkgPrice <= 0) {
                        console.warn(`[Capping] Warning: Old Package ${pkg.$id} has 0 price. Skipping it.`);
                        continue;
                    }
                    
                    const currentEarned = Number((pkg.roi_earned || 0).toFixed(4));
                    
                    // If maxPerc is 0, it means unlimited
                    if (maxPerc <= 0) {
                        const toAdd = remainingIncomeForCapping;
                        if (!skipCapping) finalAmountForUser += toAdd;
                        
                        // ONLY update package if NOT skipping capping
                        if (!skipCapping) {
                            const newEarned = Number((currentEarned + toAdd).toFixed(4));
                            await safeUpdateDocument(collections.user_packages, pkg.$id, {
                                roi_earned: newEarned
                            });
                        }
                        remainingIncomeForCapping = 0;
                        break;
                    }

                    let maxEarning = Number(((pkgPrice * maxPerc) / 100).toFixed(4));
                    
                    // Special case for $20 Scaling Node: Default to $4000 cap
                    if (pkgPrice === 20 && (maxPerc === 0 || maxPerc === 200)) maxEarning = 4000;
                    
                    const space = Number((maxEarning - currentEarned).toFixed(4));

                    if (space > 0) {
                        const toAdd = Math.min(remainingIncomeForCapping, space);
                        const newEarned = Number((currentEarned + toAdd).toFixed(4));
                        const stillActive = newEarned < maxEarning;

                        // ONLY update package status and consume space if skipCapping is FALSE
                        if (!skipCapping) {
                            await safeUpdateDocument(collections.user_packages, pkg.$id, {
                                roi_earned: newEarned,
                                is_active: stillActive
                            });
                            finalAmountForUser += toAdd;
                            remainingIncomeForCapping -= toAdd;
                            if (toAdd > 0.000001) {
                                console.log(`[Capping] Space consumed: $${toAdd.toFixed(4)} in pkg ${pkg.$id} for user ${userId}. Total: ${newEarned}/${maxEarning}. StillActive: ${stillActive}`);
                            }
                        } else {
                            // If skipping capping, we just count this package as "having space" 
                            // and let the money flow through without updating the package.
                            finalAmountForUser += remainingIncomeForCapping;
                            remainingIncomeForCapping = 0;
                            break; 
                        }
                    }
                }

                // Surplus check AFTER the loop
                if (remainingIncomeForCapping > 0.0001) {
                    console.log(`[Capping] Surplus $${remainingIncomeForCapping.toFixed(4)} from ${userId} sent to Admin`);
                    await distributeIncomeServer('1', remainingIncomeForCapping, type, `${description} (Surplus from ${userId})`, fromUserId, incomeLevel);
                }
            }
        }

        // 3. Create Transaction First (Idempotency Key)
        const payoutIdToUse = payoutId || ID.unique();
        const transactionPayload: any = {
            user_id: userId,
            amount: Number(finalAmountForUser.toFixed(4)),
            type: type,
            description: finalAmountForUser < amountToCredit && !skipCapping ? `${description} (Capped)` : description,
            from_user_id: fromUserId || 'SYSTEM',
            created_at: new Date().toISOString().substring(0, 19) + 'Z'
        };

        const createTxWithRetry = async (payload: any, retries = 2): Promise<boolean> => {
            try {
                await safeCreateDocument(collections.transactions, payoutIdToUse, payload);
                return true;
            } catch (e: any) {
                // 409 means this exact income (ROI cycle) was already processed
                if (e.code === 409 || e.message?.includes('already exists') || e.message?.includes('DUPLICATE')) {
                    console.log(`[Income_Idempotent] Transaction ${payoutIdToUse} already exists. Skipping.`);
                    return true;
                }
                if (e.message?.includes('attribute not found') && retries > 0) {
                    return createTxWithRetry(payload, retries - 1);
                }
                throw e;
            }
        };

        try {
            await createTxWithRetry(transactionPayload);
        } catch (txErr: any) {
            console.error(`[Income_TX_FAIL] Fatal transaction error:`, txErr.message);
            return false;
        }

        // 4. Update Wallet Balance SECOND
        if (finalAmountForUser > 0) {
            const updateData: any = {
                balance: Number((Number(wallet.balance || 0) + finalAmountForUser).toFixed(4)),
                total_earned: Number((Number(wallet.total_earned || 0) + finalAmountForUser).toFixed(4)),
            };
            
            if (type.toLowerCase() === 'roi' || type.toLowerCase().includes('yield')) {
                updateData.roi_income = Number((Number(wallet.roi_income || 0) + finalAmountForUser).toFixed(4));
                updateData.wallet_roi_earned = Number((Number(wallet.wallet_roi_earned || 0) + finalAmountForUser).toFixed(4));
            } else if (type.toLowerCase().includes('direct')) {
                updateData.direct_income = Number((Number(wallet.direct_income || 0) + finalAmountForUser).toFixed(4));
            } else if (type.toLowerCase().includes('level')) {
                updateData.level_income = Number((Number(wallet.level_income || 0) + finalAmountForUser).toFixed(4));
            } else if (type.toLowerCase().includes('pool') || type.toLowerCase().includes('matrix')) {
                updateData.pool_income = Number((Number(wallet.pool_income || 0) + finalAmountForUser).toFixed(4));
            }

            const performWalletUpdate = async (data: any, retryCount = 0): Promise<boolean> => {
                try {
                    await safeUpdateDocument(collections.wallets, wallet.$id, data);
                    return true;
                } catch (err: any) {
                    console.error(`[IncomeWalletErr] User ${userId}:`, err.message);
                    return false;
                }
            };

            await performWalletUpdate(updateData);
        }
        
        return true;
    } catch (error: any) {
        console.error('Income Distribution Error:', error);
        return false;
    }
}

// Helper: Global Boosting Logic
async function triggerBoostingServer(rawId: string) {
    const diagnostic: any = {
        rawId,
        resolvedAuthId: null,
        idsChecked: [],
        foundDoc: false,
        qualifiedPkg: false,
        qualifiedDirects: false,
        addedToQueue: false,
        alreadyInQueue: false,
        actualDirects: 0
    };

    try {
        const userId = await resolveUserAuthId(rawId);
        diagnostic.resolvedAuthId = userId;
        if (!userId) {
            diagnostic.error = "Could not resolve user ID";
            return diagnostic;
        }

        const settings = await getServerSettings() as any;
        const minPkgPrice = Number(settings?.boosting_min_pkg_price || 10);
        const minDirects = Number(settings?.boosting_min_directs || 2); // Default to 2 directs
        const reward = Number(settings?.boosting_reward || 20);

        const userRes = await databases.listDocuments(databaseId, collections.users, [
            Query.equal('user_id', [userId])
        ]);
        if (userRes.total === 0) {
            diagnostic.error = "User document not found";
            return diagnostic;
        }
        const userDoc = userRes.documents[0] as any;
        diagnostic.foundDoc = true;

        // --- ID Collection for Referral Check ---
        const idsToCheck = new Set<string>();
        idsToCheck.add(userId); // Auth ID
        idsToCheck.add(userDoc.$id); // Document ID
        if (userDoc.node_id) idsToCheck.add(userDoc.node_id);

        const idToCheckList = Array.from(idsToCheck);
        diagnostic.idsChecked = idToCheckList;

        const actualDirectsRes = await databases.listDocuments(databaseId, collections.users, [
            Query.equal('referred_by', idToCheckList),
            Query.limit(5000)
        ]);
        
        const currentDirects = actualDirectsRes.total;
        diagnostic.actualDirects = currentDirects;

        if (currentDirects !== Number(userDoc.direct_count || 0)) {
            console.log(`[Boosting] Healing directs for ${userId}: ${userDoc.direct_count} -> ${currentDirects}`);
            await databases.updateDocument(databaseId, collections.users, userDoc.$id, {
                direct_count: currentDirects
            });
        }

        const purchasesRes = await databases.listDocuments(databaseId, collections.user_packages, [
            Query.equal('user_id', [userId])
        ]);
        const activePkgs = purchasesRes.documents as any[];
        
        const hasQualifiedPkg = activePkgs.some(p => Number(p.price || 0) >= minPkgPrice);
        const hasMinDirects = currentDirects >= minDirects;

        diagnostic.qualifiedPkg = hasQualifiedPkg;
        diagnostic.qualifiedDirects = hasMinDirects;

        if (hasQualifiedPkg && hasMinDirects) {
            let existingEntryRes;
            try {
                existingEntryRes = await databases.listDocuments(databaseId, collections.gold_queue, [
                    Query.equal('user_id', [userId])
                ]);
            } catch (e: any) {
                console.error("[Boosting] List gold_queue error:", e);
                diagnostic.error = `gold_queue error: ${e.message || "Unknown error"}`;
                if (e.message?.toLowerCase().includes('not found')) {
                    diagnostic.error = `Collection 'gold_queue' (ID: ${collections.gold_queue}) not found.`;
                }
                return diagnostic;
            }
            
            const activeInQueue = existingEntryRes.documents.some((e: any) => !e.completed);
            
            if (activeInQueue) {
                diagnostic.alreadyInQueue = true;
                return diagnostic;
            }

            console.log(`[Boosting] SUCCESS! Adding User ${userId} to Global Queue`);
            await databases.createDocument(databaseId, collections.gold_queue, ID.unique(), {
                user_id: userId,
                created_at: new Date().toISOString().substring(0, 19) + 'Z',
                completed: false,
                amount: reward,
                status: 'active',
                is_rebirth: false,
                payout_at: ""
            });
            
            diagnostic.addedToQueue = true;
            await processBoostingQueue(reward);
        }
        return diagnostic;
    } catch (error: any) {
        console.error("[Boosting Error]", error);
        diagnostic.error = error.message;
        return diagnostic;
    }
}

async function processBoostingQueue(reward: number) {
    try {
        const allEntries = await databases.listDocuments(databaseId, collections.gold_queue, [
            Query.orderAsc('created_at'),
            Query.limit(5000)
        ]);
        
        const queue = allEntries.documents as any[];
        const completedEntries = queue.filter(e => e.completed === true);
        let completedCount = completedEntries.length;

        // Condition: 12 entries completes 1 position
        while (queue.length >= (completedCount + 1) * 12) {
            const winnerEntry = queue.find(e => e.completed === false);
            if (!winnerEntry) break;

            console.log(`[Boosting] Processing Payout for Winner: ${winnerEntry.user_id}`);
            
            await databases.updateDocument(databaseId, collections.gold_queue, winnerEntry.$id, {
                completed: true,
                status: 'completed',
                payout_at: new Date().toISOString().substring(0, 19) + 'Z'
            });

            await distributeIncomeServer(winnerEntry.user_id, reward, 'pool_payout', 'Boosting Gold Global Pool Payout', 'SYSTEM');

            const rebirthData = {
                user_id: winnerEntry.user_id,
                created_at: new Date().toISOString().substring(0, 19) + 'Z',
                completed: false,
                amount: reward,
                status: 'rebirth',
                is_rebirth: true,
                payout_at: ""
            };
            console.log("[Boosting] Creating Rebirth Entry:", rebirthData);
            await databases.createDocument(databaseId, collections.gold_queue, ID.unique(), rebirthData);
            
            completedCount++;
            break; 
        }
    } catch (error) {
        console.error("[Boosting Queue Process Error]", error);
    }
}

// Get User Purchases (Server-side to bypass client permissions)
app.post('/api/user/purchases', verifyAuth, async (req, res) => {
    const { userId: rawUserId } = req.body;
    try {
        const userId = await resolveUserAuthId(rawUserId) || rawUserId;
        const response = await databases.listDocuments(databaseId, collections.user_packages, [
            Query.equal('user_id', [userId])
        ]);
        res.json({ success: true, documents: response.documents });
    } catch (error: any) {
        console.error("Fetch Purchases error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Node Purchase API
app.post('/api/purchase-package', verifyAuth, async (req, res) => {
    const { userId: rawUserId, packageId } = req.body;
    let trace = [];
    try {
        const userId = await resolveUserAuthId(rawUserId) || rawUserId;
        trace.push(`[Purchase] Step 1: Resolved User: ${userId} (from ${rawUserId})`);
        console.log(`[Purchase] User: ${userId} buying Pkg: ${packageId}`);
        
        // 1. Get Data (Parallelized for speed)
        const [userResponse, walletResponse, packagesRes, purchasesResponse] = await Promise.all([
            databases.listDocuments(databaseId, collections.users, [Query.equal('user_id', [userId])]),
            databases.listDocuments(databaseId, collections.wallets, [Query.equal('user_id', [userId])]),
            databases.listDocuments(databaseId, collections.packages, [Query.limit(100)]),
            databases.listDocuments(databaseId, collections.user_packages, [Query.equal('user_id', [userId]), Query.limit(100)])
        ]);
        
        trace.push(`[Purchase] Step 2: Data Fetched. UserFound: ${userResponse.total}, WalletFound: ${walletResponse.total}, Pkgs: ${packagesRes.total}, UserPkgs: ${purchasesResponse.total}`);

        const allPackagesUnsorted = packagesRes.documents as any;
        const allPackages = [...allPackagesUnsorted].sort((a, b) => (a.price || 0) - (b.price || 0));
        
        // Defensive parsing for package data
        const pkgRaw = allPackages.find((p: any) => (p.id || p.$id) === packageId);
        if (!pkgRaw) {
            trace.push(`[Purchase] Error: Pkg ${packageId} not found in packages collection`);
            return res.status(404).json({ success: false, message: `Node not found in catalogue (ID: ${packageId})`, trace });
        }
        
        const pkg = {
            ...pkgRaw,
            daily_roi: Number(pkgRaw.daily_roi ?? 0.5),
            roi_interval_minutes: Number(pkgRaw.roi_interval_minutes || 1440),
            direct_income_percent: Number(pkgRaw.direct_income_percent || 0),
            matrix_income_percent: Number(pkgRaw.matrix_income_percent || 0),
            level_income_percents: typeof pkgRaw.level_income_percents === 'string' 
                ? JSON.parse(pkgRaw.level_income_percents) 
                : (Array.isArray(pkgRaw.level_income_percents) ? pkgRaw.level_income_percents : [0,0,0,0,0,0,0,0,0,0])
        };
        
        if (userResponse.total === 0) return res.status(404).json({ success: false, message: 'User profile not found. Please logout and login again.', trace });
        if (walletResponse.total === 0) return res.status(404).json({ success: false, message: 'Wallet not found', trace });

        const user = userResponse.documents[0] as any;
        const wallet = walletResponse.documents[0] as any;
        enrichWalletWithSpins(wallet);

        // 2. Check Balance
        const pkgPrice = Number(pkg.price || 0);
        trace.push(`[Purchase] Step 3: PkgPrice: ${pkgPrice}, UserBalance: ${wallet.balance}`);
        
        if (Number(wallet.balance) < pkgPrice) {
            return res.json({ success: false, message: `Insufficient balance ($${wallet.balance})`, trace });
        }

        // 3. Sequential Activation Check
        const allUserPurchases = (purchasesResponse.documents as any[]) || [];
        const activePackages = allUserPurchases.filter(p => p.is_active === true);
        const currentlyActiveIds = activePackages.map(p => p.package_id);
        const currentPkgId = pkg.$id || pkg.id;
        const currentPkgPrice = Number(pkg.price || 0);
        
        trace.push(`[Purchase] Step 4: Sequence check. Target Node: ${currentPkgId} ($${currentPkgPrice})`);
        console.log(`[Purchase] Checking ${currentPkgId} for user ${userId}. Active Nodes Count: ${activePackages.length}`);

        // Check by ID OR Price (Handles deleted/recreated packages)
        const alreadyActive = activePackages.some(p => p.package_id === currentPkgId || Number(p.price) === currentPkgPrice);
        if (alreadyActive) {
            trace.push(`[Purchase] Error: Node is already active (found via ID or Price match)`);
            return res.json({ success: false, message: 'Node already active.', trace });
        }
        
        const pkgIndex = allPackages.findIndex(p => (p.id || p.$id) === currentPkgId);
        trace.push(`[Purchase] Step 4.1: Node Index in catalog: ${pkgIndex}`);
        
        if (pkgIndex > 0) {
            const prevPkg = allPackages[pkgIndex - 1];
            const prevPkgId = prevPkg.$id || prevPkg.id;
            const prevPkgPrice = Number(prevPkg.price || 0);
            
            // For sequence, we check if they EVER owned the previous node (even if it's inactive now)
            // OR if they own a node with that price.
            const prevIsActiveOrWasOwned = allUserPurchases.some((p: any) => 
                p.package_id === prevPkgId || p.$id === prevPkgId || Number(p.price) === prevPkgPrice
            );

            trace.push(`[Purchase] Step 4.2: Previous Node ($${prevPkgPrice}) found in history: ${prevIsActiveOrWasOwned}`);

            if (!prevIsActiveOrWasOwned) {
                trace.push(`[Purchase] Sequence Error: User lacks $${prevPkgPrice} Node in their history.`);
                return res.json({ 
                    success: false, 
                    message: `Sequence Error: Please activate the $${prevPkgPrice} Node first.`,
                    trace
                });
            }
        }
        trace.push(`[Purchase] Step 5: Sequence OK. Proceeding to Transaction.`);

        // 4. TRANSACTION START (Manual Revert logic)
        // 4.1 Deduct Balance
        const oldBalance = Number(wallet.balance || 0);
        trace.push(`[Purchase] Step 6: Deducting Node Price $${pkgPrice} from Balance $${oldBalance}`);
        await safeUpdateDocument(collections.wallets, wallet.$id, { 
            balance: oldBalance - pkgPrice 
        });
        
        let createdPurchase: any = null;

        // 4.2 Create Purchase Record (The "Activation")
        try {
            console.log(`[Purchase] Creating record for ${userId}, Pkg ${currentPkgId}`);
            trace.push(`[Purchase] Step 7: Creating User-Package document...`);
            
            let purchasePayload: any = {
                user_id: userId,
                package_id: currentPkgId,
                price: pkgPrice,
                daily_roi: Number(pkg.daily_roi ?? 0.5),
                roi_interval_minutes: Number(pkg.roi_interval_minutes || 1440),
                max_roi_percent: Number(pkg.max_roi_percent || 200),
                roi_earned: 0,
                is_active: true,
                activated_at: new Date().toISOString().substring(0, 19) + 'Z',
                last_roi_at: new Date().toISOString().substring(0, 19) + 'Z'
            };

            createdPurchase = await safeCreateDocument(collections.user_packages, ID.unique(), purchasePayload);
            trace.push(`[Purchase] Step 8: Document created successfully with ID: ${createdPurchase.$id}`);
        } catch (perr: any) {
            console.error("[Purchase Error] Activation failed, reverting balance:", perr);
            trace.push(`[Purchase] FATAL ERROR: Record creation failed. Reverting balance...`);
            // Revert balance
            const wCurrentRes = await databases.listDocuments(databaseId, collections.wallets, [Query.equal('user_id', [userId])]);
            if (wCurrentRes.total > 0) {
                const wCurrent = wCurrentRes.documents[0] as any;
                await safeUpdateDocument(collections.wallets, wCurrent.$id, { 
                    balance: oldBalance
                });
                trace.push(`[Purchase] Balance reverted successfully.`);
            }
            throw perr;
        }

        // 4.3 Update user activation status and wallet ticker info
        trace.push(`[Purchase] Step 9: Finalizing profile and incomes.`);
        if (!user.is_active) {
            await safeUpdateDocument(collections.users, user.$id, { is_active: true });
        }

        // Calculate new daily package ROI for real-time ticker
        const allPurchases = await databases.listDocuments(databaseId, collections.user_packages, [Query.equal('user_id', [userId])]);
        const currentPurchases = allPurchases.documents;
        
        let totalDailyROI = 0;
        for (const p of currentPurchases as any[]) {
            const perc = Number(p.daily_roi ?? 0.5);
            const interval = Number(p.roi_interval_minutes || 1440);
            const amtPerCycle = (Number(p.price || 0) * perc) / 100;
            const cyclesPerDay = 1440 / (interval > 0 ? interval : 1440);
            totalDailyROI += amtPerCycle * cyclesPerDay;
        }

        const pkgPriceVal = Number(pkgPrice || pkg.price || 0);
        const is20pkg = Math.abs(pkgPriceVal - 20) < 0.1 || 
                         String(pkg.price || '').includes('20') || 
                         String(pkg.name || '').toLowerCase().includes('20') || 
                         String(pkg.$id || '').toLowerCase().includes('20') || 
                         packageId === 'pkg2' || 
                         String(packageId).toLowerCase().includes('20');

        let bonusSpins = 0;
        if (Math.abs(pkgPriceVal - 10) < 0.1) {
            bonusSpins = 1;
        } else if (Math.abs(pkgPriceVal - 20) < 0.1) {
            bonusSpins = 2;
        } else {
            bonusSpins = Math.max(1, Math.floor(pkgPriceVal / 10));
        }
        const currentSpins = Number(wallet.available_spins || 0);
        const finalSpins = currentSpins + bonusSpins;
        const packedLastRoiAt = packSpinsIntoLastRoiAt(wallet.last_roi_at, finalSpins);

        await safeUpdateDocument(collections.wallets, wallet.$id, {
            daily_package_roi: totalDailyROI,
            last_roi_at: packedLastRoiAt,
            available_spins: finalSpins
        });

        // Award 1 free spin to sponsor when a user purchases the $20 package
        if (is20pkg) {
            const rawSponsorId = user.referred_by;
            if (rawSponsorId && rawSponsorId !== '0' && rawSponsorId !== '1') {
                try {
                    const resolvedSponsorId = await resolveUserAuthId(rawSponsorId) || rawSponsorId;
                    const sponsorWalletRes = await databases.listDocuments(databaseId, collections.wallets, [
                        Query.equal('user_id', [resolvedSponsorId])
                    ]);
                    if (sponsorWalletRes.total > 0) {
                        const sponsorWallet = sponsorWalletRes.documents[0] as any;
                        const currentSponsorSpins = unpackSpinsFromLastRoiAt(sponsorWallet.last_roi_at);
                        const packedSponsorLastRoiAt = packSpinsIntoLastRoiAt(sponsorWallet.last_roi_at, currentSponsorSpins + 1);
                        await safeUpdateDocument(collections.wallets, sponsorWallet.$id, {
                            last_roi_at: packedSponsorLastRoiAt,
                            available_spins: currentSponsorSpins + 1
                        });
                        console.log(`[Referral Bonus] Awarded 1 free spin to sponsor ${resolvedSponsorId} because direct referral ${userId} purchased $20 package.`);
                    }
                } catch (spErr: any) {
                    console.error(`[Referral Bonus] Error giving referral spin to sponsor ${rawSponsorId}:`, spErr.message);
                }
            }
        }

        // --- INSTANT DAY-1 ROI CREDIT ---
        // Give the first daily yield immediately upon purchase so the user sees the balance increase
        const instantYieldPercent = Number(pkg.daily_roi ?? 0.5);
        const instantYieldAmt = Number(((pkgPrice * instantYieldPercent) / 100).toFixed(4));
        
        console.log(`[Purchase] Instant ROI Calculation: Price=$${pkgPrice}, ROI=${instantYieldPercent}%, Amount=$${instantYieldAmt}`);
        
        if (instantYieldAmt > 0) {
            console.log(`[Income] Crediting Instant Day-1 ROI: $${instantYieldAmt} to ${userId}. SkipCapping: TRUE for instant credit.`);
            // Wait slightly for package to be indexable in Appwrite
            await new Promise(r => setTimeout(r, 1500));
            
            try {
                // IMPORTANT: We pass TRUE for skipCappingOverride because the initial ROI should NOT consume space in the capping logic.
                // We manually update the package roi_earned below to ensure it's tracked correctly once.
                const roiSuccess = await distributeIncomeServer(userId, instantYieldAmt, 'roi', `Instant Node yield for ${pkg.name || pkg.$id}`, 'SYSTEM', 0, true);
                
                if (roiSuccess) {
                    console.log(`[Income] Instant ROI wallet credit successful for user ${userId}`);
                    
                    // Manually update the specific package's roi_earned for the first credit
                    if (createdPurchase && createdPurchase.$id) {
                        try {
                            const pDoc = await databases.getDocument(databaseId, collections.user_packages, createdPurchase.$id);
                            const currentEarnedOnPkg = Number(pDoc.roi_earned || 0);
                            await safeUpdateDocument(collections.user_packages, createdPurchase.$id, {
                                roi_earned: Number((currentEarnedOnPkg + instantYieldAmt).toFixed(4)),
                                // last_roi_at intentionally left as the purchase timestamp
                                is_active: true 
                            });
                            console.log(`[Income] Updated Package ${createdPurchase.$id} with initial ROI. Status confirmed Active.`);
                        } catch (e: any) {
                            console.warn(`[Income] Failed to update specific package after instant ROI: ${e.message}`);
                        }
                    }
                } else {
                    console.error(`[Income] distributeIncomeServer returned false for instant ROI to ${userId}`);
                }
            } catch (roiErr: any) {
                console.error(`[Income] Critical Error in Instant ROI distribution:`, roiErr);
            }
        }

        // 4.4 Create Transaction Record (Debit)
        await databases.createDocument(databaseId, collections.transactions, ID.unique(), {
            user_id: userId,
            amount: pkgPrice,
            type: 'debit',
            description: `Node $${pkgPrice} (${pkg.name})`,
            from_user_id: 'SYSTEM',
            created_at: new Date().toISOString().substring(0, 19) + 'Z'
        });

        // 6. Incomes (FULLY DYNAMIC FROM PACKAGE SETTINGS)
        // 6.1 Sponsor Income (Direct % set in package)
        const sponsorId = user.referred_by || '1';
        const directPercent = Number(pkg.direct_income_percent || 0); 
        const matrixParentId = user.matrix_parent_id || '1';
        const matrixPercent = Number(pkg.matrix_income_percent || 0);
        const sponsorIncome = Number(((pkgPrice * directPercent) / 100).toFixed(4));
        
        console.log(`[Income] Debug:`, {
            userId,
            sponsorId,
            matrixParentId,
            pkgPrice,
            directPercent,
            matrixPercent
        });
        
        if (sponsorIncome > 0) {
            console.log(`[Income] Sending Direct Income $${sponsorIncome} to ${sponsorId}`);
            await distributeIncomeServer(sponsorId, sponsorIncome, 'direct_income', `Direct (${directPercent}%): Node $${pkgPrice} from ${user.name}`, userId);
        }

        // 6.2 Matrix / Placement Income (Immediate Parent Only)
        if (matrixPercent > 0 && matrixParentId && matrixParentId !== '0' && matrixParentId !== userId) {
            const placementIncome = Number(((pkgPrice * matrixPercent) / 100).toFixed(4));
            console.log(`[Income] Sending Matrix Income $${placementIncome} to ${matrixParentId}`);
            await distributeIncomeServer(matrixParentId, placementIncome, 'matrix_income', `Matrix Income (${matrixPercent}%): Node $${pkgPrice} from ${user.name}`, userId, 1);
        }

        // 6.3 Level Income (1-10) (Fixed DOLLAR AMOUNTS as requested)
        let currLevelId = user.referred_by; 
        
        // If no sponsor or user is admin, don't start the chain at self
        if (!currLevelId || currLevelId === userId || currLevelId === '0') {
            currLevelId = (userId === '1') ? null : '1';
        }
        
        let levelAmounts: number[] = [];
        try {
            const raw = pkg.level_income_percents; // Using existing field name for backward compatibility
            if (Array.isArray(raw)) {
                levelAmounts = raw.map(v => Number(v || 0));
            } else if (typeof raw === 'string') {
                if (raw.startsWith('[')) {
                    levelAmounts = JSON.parse(raw).map((v: any) => Number(v || 0));
                } else {
                    levelAmounts = raw.split(',').map(v => Number(v.trim() || 0));
                }
            }
            while (levelAmounts.length < 10) levelAmounts.push(0);
        } catch (e) {
            console.error("[Income] Level Parse Error:", e);
            levelAmounts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        }

        console.log(`[Income] Level Income distribution starting from ${currLevelId}. Amounts:`, levelAmounts);

        for (let l = 1; l <= 10; l++) {
            if (!currLevelId || currLevelId === '0') break; // Stop if no more upline

            const lvlIdx = l - 1;
            const amt = Number(levelAmounts[lvlIdx] || 0);
            if (amt <= 0) {
                // Still need to move up even if amount is 0, to find next level
                const nextUser = await fetchUserById(currLevelId);
                currLevelId = nextUser?.referred_by || null;
                continue; 
            }

            let targetUserId = currLevelId;
            let currentInChain: any = null;

            try {
                currentInChain = await fetchUserById(targetUserId);
                if (!currentInChain) {
                    // Fallback to Admin if user not found, but only if we haven't reached Admin yet
                    if (targetUserId !== '1') {
                        targetUserId = '1';
                        currentInChain = await fetchUserById('1');
                    } else {
                        break; // Already at Admin and couldn't find doc, stop
                    }
                }
            } catch (e) {
                console.error(`[Income] Error fetching user ${targetUserId} in level chain:`, e);
                break;
            }

            // CRITICAL: A user NEVER receives level income from their own purchase
            if (targetUserId === userId) {
                console.log(`[Income] Level ${l}: Skipping self-payment for ${userId}`);
            } else {
                console.log(`[Income] Level ${l} Amount: Sending $${amt} to ${targetUserId}`);
                await distributeIncomeServer(targetUserId, amt, 'level_income', `Level ${l} ($${amt}): Node $${pkgPrice} from ${user.name}`, userId, l);
            }
            
            // Move up REFERRAL Tree for next level
            if (currentInChain) {
                const nextId = currentInChain.referred_by;
                // If next is same as current or invalid, stop or hit admin
                if (!nextId || nextId === targetUserId || nextId === '0') {
                    if (targetUserId === '1') break; // Already at top
                    currLevelId = '1'; 
                } else {
                    currLevelId = nextId;
                }
            } else {
                break;
            }
        }
        
        // --- BOOSTING TRIGGER ---
        // Check if the buyer qualifies for boosting now
        await triggerBoostingServer(userId);

        // --- BUSINESS TRACKING & RANK REWARDS ---
        try {
            await updateBusinessVolumeServer(userId, pkgPrice);
        } catch (bizErr) {
            console.error("[BusinessUpdate] Failed:", bizErr);
        }

        res.json({ 
            success: true, 
            message: 'Node activated successfully.',
            purchase: createdPurchase ? { ...createdPurchase, id: createdPurchase.$id } : null,
            bonusSpins: bonusSpins
        });
    } catch (error: any) {
        console.error("[Purchase Critical Error]", error);
        const createFailItem = [...trace].reverse().find(t => t.includes('Create Fail') || t.includes('Error'));
        const lastTraceItem = trace[trace.length - 1];
        
        res.status(500).json({ 
            success: false, 
            message: `Purchase Failed: ${error.message}${createFailItem ? ` | Cause: ${createFailItem}` : ''} | Status: ${lastTraceItem}`,
            trace 
        });
    }
});

// Helper: Update Business Volume and Check Rewards
async function updateBusinessVolumeServer(buyerId: string, amount: number) {
    try {
        // 1. Update Personal Business for the buyer
        const buyerRes = await databases.listDocuments(databaseId, collections.users, [
            Query.equal('user_id', [buyerId])
        ]);
        if (buyerRes.total > 0) {
            const buyer = buyerRes.documents[0] as any;
            await databases.updateDocument(databaseId, collections.users, buyer.$id, {
                personal_business: (Number(buyer.personal_business) || 0) + amount
            });
        }

        // 2. Update Team Business and Level Business for Ancestors
        let currentUserId = buyerId;
        // Business volume usually follows Sponsor Tree (referred_by)
        // But some systems use Matrix Tree. Let's use Sponsor Tree for business as it's standard.
        
        for (let depth = 1; depth <= 15; depth++) {
            const userRes = await databases.listDocuments(databaseId, collections.users, [
                Query.equal('user_id', [currentUserId])
            ]);
            if (userRes.total === 0) break;
            const user = userRes.documents[0] as any;
            
            const sponsorId = user.referred_by;
            if (!sponsorId || sponsorId === '0' || sponsorId === currentUserId) break;

            // Get Sponsor
            const sponsorRes = await databases.listDocuments(databaseId, collections.users, [
                Query.equal('user_id', [sponsorId])
            ]);
            if (sponsorRes.total === 0) break;
            const sponsor = sponsorRes.documents[0] as any;

            // Update Sponsor's Team Business
            await databases.updateDocument(databaseId, collections.users, sponsor.$id, {
                team_business: (Number(sponsor.team_business) || 0) + amount
            });

            // Check and Award Rank Rewards for this sponsor
            await checkAndAwardRankRewards(sponsor.user_id);

            currentUserId = sponsorId;
        }
    } catch (e) {
        console.error("[updateBusinessVolumeServer] Error:", e);
    }
}

async function checkAndAwardRankRewards(userId: string) {
    try {
        const settings = await getServerSettings() as any;
        const rewards = settings?.rank_rewards || [];
        if (rewards.length === 0) return;

        const userRes = await databases.listDocuments(databaseId, collections.users, [
            Query.equal('user_id', [userId])
        ]);
        if (userRes.total === 0) return;
        const user = userRes.documents[0] as any;

        // Check if user has any active packages
        const purchasesRes = await databases.listDocuments(databaseId, collections.user_packages, [
            Query.equal('user_id', [userId]),
            Query.equal('is_active', true)
        ]);

        if (purchasesRes.total === 0 && userId !== '1') {
            console.log(`[RankReward] User ${userId} has no active packages.`);
            return;
        }

        const activePurchases = purchasesRes.documents;
        const maxActivePackagePrice = activePurchases.reduce((max: number, p: any) => Math.max(max, Number(p.price) || 0), 0);

        // Fetch User's Reward Stats or check already claimed rewards
        // We can store claimed rewards in a string/array or check transactions
        const txRes = await databases.listDocuments(databaseId, collections.transactions, [
            Query.equal('user_id', [userId]),
            Query.equal('type', ['rank_reward'])
        ]);
        const claimedRewardNames = txRes.documents.map((tx: any) => tx.description.split(':')[0].trim());

        for (const reward of rewards) {
            // Skip if already claimed
            if (claimedRewardNames.includes(reward.rank_name)) continue;

            // Check dynamic self package requirement
            const targetSelfPkg = Number(reward.min_self_package || 0);
            if (maxActivePackagePrice < targetSelfPkg) {
                console.log(`[RankReward] User ${userId} active package $${maxActivePackagePrice} < required $${targetSelfPkg} for ${reward.rank_name}`);
                continue;
            }

            let qualified = false;
            
            // Check based on target_depth
            // 0 = Total Team Business
            // 1 = Level 1 Business (Direct Referrals business)
            // ...
            const targetDepth = Number(reward.target_depth || 0);
            
            if (targetDepth === 0) {
                // Total Team Business requirement
                if ((Number(user.personal_business) || 0) >= Number(reward.personal_business || 0) &&
                    (Number(user.team_business) || 0) >= Number(reward.team_business || 0)) {
                    qualified = true;
                }
            } else {
                // Level Specific Business - We need to sum up business of users at exactly depth X
                // For performance, we'll fetch level X business
                const levelBiz = await calculateLevelBusiness(userId, targetDepth);
                if ((Number(user.personal_business) || 0) >= Number(reward.personal_business || 0) &&
                    levelBiz >= Number(reward.team_business || 0)) {
                    qualified = true;
                }
            }

            if (qualified) {
                console.log(`[RankReward] User ${userId} achieved rank: ${reward.rank_name}`);
                await distributeIncomeServer(userId, Number(reward.reward_amount), 'rank_reward', `${reward.rank_name}: Business Milestone Reward`, 'SYSTEM');
            }
        }
    } catch (e) {
        console.error("[checkAndAwardRankRewards] Error:", e);
    }
}

async function calculateLevelBusiness(userId: string, depth: number): Promise<number> {
    try {
        // 1. Calculate using Sponsor Tree (referred_by)
        let sponsorBiz = 0;
        try {
            let currentLevelUsers = [userId];
            let allTargetRefUsers: string[] = [];
            for (let d = 1; d <= depth; d++) {
                const nextLevelRes = await databases.listDocuments(databaseId, collections.users, [
                    Query.equal('referred_by', currentLevelUsers),
                    Query.limit(5000)
                ]);
                if (nextLevelRes.total === 0) break;
                const nextLevelUserIds = nextLevelRes.documents.map((u: any) => u.user_id);
                allTargetRefUsers = allTargetRefUsers.concat(nextLevelUserIds);
                currentLevelUsers = nextLevelUserIds;
            }
            if (allTargetRefUsers.length > 0) {
                for (let i = 0; i < allTargetRefUsers.length; i += 100) {
                    const chunk = allTargetRefUsers.slice(i, i + 100);
                    const pkgsRes = await databases.listDocuments(databaseId, collections.user_packages, [
                        Query.equal('user_id', chunk),
                        Query.limit(5000)
                    ]);
                    sponsorBiz += pkgsRes.documents.reduce((acc, p: any) => acc + (Number(p.price) || 0), 0);
                }
            }
        } catch (err) {
            console.error("[calculateLevelBusiness - Sponsor] Error:", err);
        }

        // 2. Calculate using Global 2x2 Matrix Tree (matrix_parent_id)
        let matrixBiz = 0;
        try {
            let currentLevelUsers = [userId];
            let allTargetMatrixUsers: string[] = [];
            for (let d = 1; d <= depth; d++) {
                const nextLevelRes = await databases.listDocuments(databaseId, collections.users, [
                    Query.equal('matrix_parent_id', currentLevelUsers),
                    Query.limit(5000)
                ]);
                if (nextLevelRes.total === 0) break;
                const nextLevelUserIds = nextLevelRes.documents.map((u: any) => u.user_id);
                allTargetMatrixUsers = allTargetMatrixUsers.concat(nextLevelUserIds);
                currentLevelUsers = nextLevelUserIds;
            }
            if (allTargetMatrixUsers.length > 0) {
                for (let i = 0; i < allTargetMatrixUsers.length; i += 100) {
                    const chunk = allTargetMatrixUsers.slice(i, i + 100);
                    const pkgsRes = await databases.listDocuments(databaseId, collections.user_packages, [
                        Query.equal('user_id', chunk),
                        Query.limit(5000)
                    ]);
                    matrixBiz += pkgsRes.documents.reduce((acc, p: any) => acc + (Number(p.price) || 0), 0);
                }
            }
        } catch (err) {
            console.error("[calculateLevelBusiness - Matrix] Error:", err);
        }

        console.log(`[LevelBusiness] User ${userId} Depth ${depth}: Sponsor Tree Business = $${sponsorBiz}, Matrix Tree Business = $${matrixBiz}`);
        return Math.max(sponsorBiz, matrixBiz);
    } catch (e) {
        console.error("[calculateLevelBusiness - Main] Error:", e);
        return 0;
    }
}

// API to fetch level-specific business
// Debug Environment Variables
app.get('/api/debug-env', (req, res) => {
    res.json({
        endpoint: process.env.VITE_APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1',
        project_id: process.env.VITE_APPWRITE_PROJECT_ID || '69d5b8c6001a776e6ebe',
        database_id: process.env.VITE_APPWRITE_DATABASE_ID || 'mlm_spiral',
        api_key_length: (process.env.APPWRITE_API_KEY || '').length,
        env_keys: Object.keys(process.env).filter(k => k.includes('APPWRITE'))
    });
});

app.get('/api/user/level-business/:userId/:depth', async (req, res) => {
    try {
        const { userId, depth } = req.params;
        const resolvedId = await resolveUserAuthId(userId) || userId;
        const biz = await calculateLevelBusiness(resolvedId, Number(depth));
        res.json({ success: true, business: biz });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// Registration API
app.post('/api/auth/register', async (req, res) => {
    const { email, pass, name, referredBy, mobile } = req.body;
    console.log('[Registration Request Received]');
    console.log(`  -> Email: ${email}`);
    console.log(`  -> Endpoint: ${process.env.VITE_APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1'}`);
    console.log(`  -> Project ID: ${process.env.VITE_APPWRITE_PROJECT_ID || '69d5b8c6001a776e6ebe'}`);
    console.log(`  -> Database ID: ${databaseId}`);
    try {
        // Pre-registration Check: Resolve mismatches/orphans between Appwrite Auth and Database collections
        try {
            console.log(`[Validation Check] Checking for existing user records with Email: ${email} or Mobile: ${mobile}`);
            const dbUsersByEmail = await databases.listDocuments(databaseId, collections.users, [
                Query.equal('email', [email])
            ]);
            let dbUsersByMobile = { total: 0, documents: [] as any[] };
            if (mobile) {
                dbUsersByMobile = await databases.listDocuments(databaseId, collections.users, [
                    Query.equal('mobile', [mobile])
                ]);
            }

            const allExistingDbUserDocs = [...dbUsersByEmail.documents, ...dbUsersByMobile.documents];
            const checkedAuthUserIds = new Set<string>();
            const activeAuthUsers = new Set<string>();
            const orphanDbDocs = [];

            for (const doc of allExistingDbUserDocs) {
                const docUserId = doc.user_id;
                if (!docUserId) {
                    orphanDbDocs.push(doc);
                    continue;
                }
                
                if (checkedAuthUserIds.has(docUserId)) {
                    if (!activeAuthUsers.has(docUserId)) {
                        orphanDbDocs.push(doc);
                    }
                    continue;
                }

                checkedAuthUserIds.add(docUserId);
                try {
                    const authUser = await users.get(docUserId);
                    if (authUser && authUser.email === doc.email) {
                        activeAuthUsers.add(docUserId);
                    } else {
                        orphanDbDocs.push(doc);
                    }
                } catch (authUserErr: any) {
                    // Auth user does not exist inside Appwrite Auth (e.g. deleted from console manually)
                    console.log(`  -> Auth user ID ${docUserId} for document ${doc.$id} could not be retrieved from Auth: ${authUserErr.message}. Marking database doc as orphan for deletion.`);
                    orphanDbDocs.push(doc);
                }
            }

            // Cleanup orphan database records so they don't block new registrations
            if (orphanDbDocs.length > 0) {
                console.log(`  -> Found ${orphanDbDocs.length} orphan database user documents. Commencing automated cleanup.`);
                for (const doc of orphanDbDocs) {
                    const docUserId = doc.user_id;
                    
                    try {
                        await databases.deleteDocument(databaseId, collections.users, doc.$id);
                        console.log(`     -> Deleted orphan database user document: ${doc.$id}`);
                    } catch (e: any) {
                        console.warn(`     -> Failed to delete orphan database user document ${doc.$id}:`, e.message);
                    }

                    if (docUserId) {
                        // Clean up corresponding wallet
                        try {
                            const wallets = await databases.listDocuments(databaseId, collections.wallets, [Query.equal('user_id', [docUserId])]);
                            for (const w of wallets.documents) {
                                await databases.deleteDocument(databaseId, collections.wallets, w.$id);
                                console.log(`     -> Cleaned up orphan wallet: ${w.$id}`);
                            }
                        } catch (e: any) {
                            console.warn(`     -> Failed to clean up wallet for ${docUserId}:`, e.message);
                        }

                        // Clean up other child data tables
                        const collectionsToPurge = [
                            { id: collections.user_packages, name: 'user_packages' },
                            { id: collections.transactions, name: 'transactions' },
                            { id: collections.exchanger_requests, name: 'exchanger_requests' },
                            { id: collections.gold_queue, name: 'gold_queue' }
                        ];

                        for (const col of collectionsToPurge) {
                            try {
                                const docs = await databases.listDocuments(databaseId, col.id, [Query.equal('user_id', [docUserId])]);
                                for (const d of docs.documents) {
                                    await databases.deleteDocument(databaseId, col.id, d.$id);
                                    console.log(`     -> Cleaned up ${col.name} document: ${d.$id}`);
                                }
                            } catch (e: any) {
                                console.warn(`     -> Failed to clean up ${col.name} for ${docUserId}:`, e.message);
                            }
                        }
                    }
                }
            }

            // check standard incomplete registrations (Auth exists, but database is missing)
            const existingAuthUsers = await users.list([Query.equal('email', [email])]);
            if (existingAuthUsers.total > 0) {
                const existingAuthUser = existingAuthUsers.users[0];
                console.log(`  -> Found existing Auth user with email ${email}: ${existingAuthUser.$id}`);
                
                const existingDoc = await databases.listDocuments(databaseId, collections.users, [
                    Query.equal('user_id', [existingAuthUser.$id])
                ]);
                
                if (existingDoc.total === 0) {
                    console.log(`  -> Auth user exists but profile document in 'users' collection is missing. Re-deleting Auth record to sign up fresh.`);
                    await users.delete(existingAuthUser.$id);
                    console.log(`  -> Orphan Auth record deleted successfully.`);
                } else {
                    return res.status(400).json({ 
                        success: false, 
                        message: `ERROR: Email '${email}' is already registered in your Appwrite Auth (User ID: ${existingAuthUser.$id}) and in the Users Database (Doc ID: ${existingDoc.documents[0].$id}). Please delete both before trying again.` 
                    });
                }
            }

            // If we have any remaining active auth users utilizing the requested mobile number, prevent duplicate mobile register
            if (activeAuthUsers.size > 0) {
                let conflictInfo = '';
                if (dbUsersByEmail.total > 0) {
                    conflictInfo += ` Email '${email}' exists in database (Doc ID: ${dbUsersByEmail.documents[0].$id}).`;
                }
                if (dbUsersByMobile.total > 0) {
                    conflictInfo += ` Mobile number '${mobile}' exists in database (Doc ID: ${dbUsersByMobile.documents[0].$id}, Registered Email: ${dbUsersByMobile.documents[0].email}).`;
                }
                return res.status(400).json({ 
                    success: false, 
                    message: `ERROR: Active record conflict! ${conflictInfo.trim()} Please clean up this data from your Appwrite database users collection, or use a new email/mobile number.` 
                });
            }
        } catch (checkErr: any) {
            console.warn('  -> Pre-registration validation bypassed/unhandled:', checkErr.message);
        }

        // 1. Create Auth User
        let user;
        try {
            user = await users.create(ID.unique(), email, undefined, pass, name);
            console.log(`  -> Successfully created auth user in Appwrite! ID: ${user.$id}`);
        } catch (createAuthErr: any) {
            console.error('[Registration] users.create failed:', createAuthErr);
            let explanation = `Appwrite Auth registration failed: ${createAuthErr.message}`;
            
            try {
                const searchEmailList = await users.list([Query.equal('email', [email])]);
                if (searchEmailList.total > 0) {
                    explanation = `ERROR: Email '${email}' already has an active AUTH record in Appwrite (User ID: ${searchEmailList.users[0].$id}). Please go to Auth > Users tab in your Appwrite Console and delete '${email}', or use another email.`;
                }
            } catch (innerDiagErr: any) {
                console.warn('[Registration diagnosis failed]', innerDiagErr.message);
            }
            
            return res.status(400).json({
                success: false,
                message: explanation
            });
        }
        
        let createdDocId: string | null = null;
        let createdWalletId: string | null = null;

        try {
            // 2. Find Global Matrix Parent
            const matrixParentIdRaw = await findGlobalMatrixParent();
            const matrixParentId = await resolveUserAuthId(matrixParentIdRaw) || '1';
            
            let sponsorIdToStore = '1';
            if (referredBy) {
               sponsorIdToStore = await resolveUserAuthId(referredBy) || '1';
            }
            
            // 3. User Document
            const nodeId = `NX-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
            const userDoc = await databases.createDocument(databaseId, collections.users, ID.unique(), {
                user_id: user.$id,
                email,
                name,
                node_id: nodeId,
                referred_by: sponsorIdToStore,
                matrix_parent_id: matrixParentId,
                role: 'user',
                is_active: false,
                created_at: new Date().toISOString().substring(0, 19) + 'Z',
                direct_count: 0,
                is_qualified: false,
                mobile: mobile || ''
            });
            createdDocId = userDoc.$id;

            // 4. Wallet
            const walletDoc = await databases.createDocument(databaseId, collections.wallets, ID.unique(), {
                user_id: user.$id, // Standard Auth ID
                balance: 0,
                total_earned: 0,
                total_withdrawn: 0,
                direct_income: 0,
                level_income: 0,
                pool_income: 0
            });
            createdWalletId = walletDoc.$id;

            // 5. Update direct count of sponsor
            if (sponsorIdToStore) {
                try {
                    let sponsorDoc: any = null;
                    
                    if (sponsorIdToStore === '1') {
                        // Find actual admin document
                        const adminRes = await databases.listDocuments(databaseId, collections.users, [
                            Query.equal('role', ['admin', 'ADMIN']),
                            Query.limit(1)
                        ]);
                        if (adminRes.total > 0) sponsorDoc = adminRes.documents[0];
                    } else {
                        const sponsorAuthId = await resolveUserAuthId(sponsorIdToStore);
                        if (sponsorAuthId) {
                            const sponsorRes = await databases.listDocuments(databaseId, collections.users, [
                                Query.equal('user_id', [sponsorAuthId])
                            ]);
                            if (sponsorRes.total > 0) sponsorDoc = sponsorRes.documents[0];
                        }
                    }

                    if (sponsorDoc) {
                        console.log(`[Referral] Updating count for sponsor ${sponsorDoc.user_id}`);
                        await databases.updateDocument(databaseId, collections.users, sponsorDoc.$id, {
                            direct_count: (sponsorDoc.direct_count || 0) + 1
                        });
                        
                        // --- BOOSTING TRIGGER ---
                        await triggerBoostingServer(sponsorDoc.user_id);
                    } else {
                        console.warn(`[Referral] Sponsor not found for ID: ${sponsorIdToStore}`);
                    }
                } catch (e) {
                    console.error("Failed to update sponsor direct count:", e);
                }
            }

            res.json({ success: true, userId: user.$id });
        } catch (innerError: any) {
            console.error('Registration steps failed! Initiating rollback of Auth user & created db documents...');
            
            // Rollback User Doc
            if (createdDocId) {
                try {
                    await databases.deleteDocument(databaseId, collections.users, createdDocId);
                    console.log('  -> Rollback: Deleted users database document.');
                } catch (dbDelErr: any) {
                    console.error('  -> Rollback: Failed to delete users database document:', dbDelErr.message);
                }
            }

            // Rollback Wallet Doc
            if (createdWalletId) {
                try {
                    await databases.deleteDocument(databaseId, collections.wallets, createdWalletId);
                    console.log('  -> Rollback: Deleted wallets database document.');
                } catch (dbDelErr: any) {
                    console.error('  -> Rollback: Failed to delete wallets database document:', dbDelErr.message);
                }
            }

            // Rollback Auth User
            try {
                await users.delete(user.$id);
                console.log('  -> Rollback: Deleted Auth user successfully.');
            } catch (authDelErr: any) {
                console.error('  -> Rollback: Failed to delete Auth user:', authDelErr.message);
            }

            throw innerError;
        }
    } catch (error: any) {
        console.error('Registration Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update Settings (Server-side to bypass client permissions)
// Update Settings (Server-side to bypass client permissions)
app.post('/api/update-settings', verifyAdmin, async (req: any, res: any) => {
    console.log("🔥 Incoming Settings Update Request:", JSON.stringify(req.body, null, 2));
    
    let currentPayload = { ...req.body };
    const MAX_RETRIES = 30;
    let retryCount = 0;

    const performSave = async (data: any): Promise<any> => {
        try {
            if (!data) throw new Error('Settings data required');

            // Strip metadata
            const { 
                $id, $collectionId, $databaseId, $createdAt, $updatedAt, $permissions,
                id, ...cleanData 
            } = data;

            const finalData = { ...cleanData };
            
            // Convert numbers
            const numericFields = [
                'min_deposit', 'min_withdrawal', 'deposit_fee', 'withdrawal_fee', 
                'autopool_min_directs', 'boosting_min_directs', 'boosting_min_pkg_price',
                'boosting_reward', 'spin_cost', 'spin_min_pkg_price', 'spin_min_directs', 
                'spin_cooldown_hours', 'referrals_for_free_spins', 'spins_per_milestone',
                'referral_percent', 'roi_percent', 'roi_interval_minutes'
            ];
            
            // Appwrite Integer fields (cannot have decimals)
            const integerFields = [
                'autopool_min_directs', 'boosting_min_directs', 'boosting_min_pkg_price',
                'spin_min_directs', 'spin_cooldown_hours', 
                'referrals_for_free_spins', 'spins_per_milestone', 'roi_interval_minutes'
            ];
            
            numericFields.forEach(field => {
                if (finalData[field] !== undefined && finalData[field] !== null) {
                    const val = finalData[field];
                    if (val === '') {
                        delete finalData[field]; 
                        return;
                    }
                    let numVal = Number(val);
                    if (!isNaN(numVal)) {
                        // Apply rounding for integer-only fields in Appwrite
                        if (integerFields.includes(field)) {
                            numVal = Math.round(numVal);
                        }
                        finalData[field] = numVal;
                    } else {
                        console.warn(`[Settings] Field '${field}' is not a valid number, skipping:`, val);
                        delete finalData[field];
                    }
                }
            });

            // Serialization for complex types
            const serializeIfObject = (field: string) => {
                if (finalData[field] && typeof finalData[field] === 'object') {
                    finalData[field] = JSON.stringify(finalData[field]);
                }
            };
            serializeIfObject('rank_rewards');
            serializeIfObject('withdrawal_tiers');
            serializeIfObject('spin_rewards');

            try {
                // Determine which fields were actually dropped (excluding legacy/optional ones)
                const ignoredWarnings = ['wallet_roi', 'id', '$id'];
                
                // Priority 1: Check if 'settings' exists
                // Priority 2: Check if 'current_settings' exists
                // Priority 3: Use the first document found in collection
                let targetDocId = 'settings'; 
                try {
                    // Try to get 'settings' to see if it exists
                    await databases.getDocument(databaseId, collections.settings, 'settings');
                    targetDocId = 'settings';
                } catch (e1) {
                    try {
                        // Fallback to 'current_settings'
                        await databases.getDocument(databaseId, collections.settings, 'current_settings');
                        targetDocId = 'current_settings';
                    } catch (e2) {
                        // Fallback to listing
                        const existingList = await databases.listDocuments(databaseId, collections.settings, [Query.limit(1)]);
                        if (existingList.total > 0) {
                            targetDocId = existingList.documents[0].$id;
                        }
                    }
                }

                console.log(`[Settings] Final resolved target document ID: ${targetDocId}`);
                
                try {
                    const result = await databases.updateDocument(databaseId, collections.settings, targetDocId, finalData);
                    console.log("[Settings] Success! Appwrite updated document:", result.$id);
                } catch (updateError: any) {
                    if (updateError.code === 404) {
                        console.log(`[Settings] ID '${targetDocId}' not found. Creating it...`);
                        await databases.createDocument(databaseId, collections.settings, targetDocId, finalData);
                    } else {
                        console.error("[Settings] Appwrite Error:", updateError.message);
                        // Log full error to see if it's a type mismatch (e.g. string vs int)
                        if (updateError.response) console.error("[Settings] Remote Response:", updateError.response);
                        throw updateError;
                    }
                }
                
                const dropped = Object.keys(req.body || {}).filter(k => {
                    const existsInFinal = finalData[k] !== undefined;
                    const isMetadata = k.startsWith('$') || k === 'id';
                    return !existsInFinal && !isMetadata && !ignoredWarnings.includes(k);
                });

                if (dropped.length > 0) {
                    console.warn("[Settings] The following fields were NOT saved (missing from Appwrite 'settings' collection):", dropped);
                }

                return { 
                    success: true, 
                    message: dropped.length > 0 
                        ? `Settings updated partially. MISSING COLUMNS in Appwrite: ${dropped.join(', ')}` 
                        : 'Protocol settings updated successfully!',
                    droppedFields: dropped
                };
            } catch (error: any) {
                const errMsg = error.message || "";
                // Handle both "unknown attribute" and "attribute not found" patterns
                if ((errMsg.toLowerCase().includes("unknown attribute") || errMsg.toLowerCase().includes("attribute not found")) && retryCount < MAX_RETRIES) {
                    const match = errMsg.match(/attribute:? "([^"]+)"/i);
                    const unknownField = match ? match[1] : null;
                    
                    if (unknownField) {
                        console.warn(`Server Self-Healing: Removing unknown field '${unknownField}' and retrying...`);
                        
                        // Delete the exact match
                        delete currentPayload[unknownField];
                        
                        // Also try to find and delete by matching case-insensitively
                        const actualKey = Object.keys(currentPayload).find(k => k.toLowerCase() === unknownField.toLowerCase());
                        if (actualKey) {
                            delete currentPayload[actualKey];
                        }
                        
                        retryCount++;
                        return performSave(currentPayload);
                    }
                }
                throw error;
            }
        } catch (e: any) {
            console.error("[Settings] performSave failed:", e);
            throw e;
        }
    };

    try {
        const result = await performSave(currentPayload);
        res.json(result);
    } catch (error: any) {
        console.error("Settings Update Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

interface ExpectedAttribute {
    key: string;
    type: 'boolean' | 'integer' | 'float' | 'string';
    size?: number;
    min?: number;
    max?: number;
    defaultValue: any;
}

const SCHEMA_ATTRIBUTES: ExpectedAttribute[] = [
    { key: 'telegram_link', type: 'string', size: 1000, defaultValue: 'https://t.me/cryptospiral' },
    { key: 'marquee_text', type: 'string', size: 5000, defaultValue: 'Welcome to CryptoSpiral! Build your Decentralized Node Network with us.' },
    { key: 'hall_of_fame_marquee', type: 'string', size: 5000, defaultValue: '' },
    { key: 'admin_address_trc20', type: 'string', size: 1000, defaultValue: '' },
    { key: 'admin_address_bep20', type: 'string', size: 1000, defaultValue: '' },
    { key: 'admin_address_erc20', type: 'string', size: 1000, defaultValue: '' },
    { key: 'min_deposit', type: 'float', defaultValue: 10 },
    { key: 'min_withdrawal', type: 'float', defaultValue: 10 },
    { key: 'max_withdrawal', type: 'float', defaultValue: 100000 },
    { key: 'boosting_min_directs', type: 'integer', min: 0, max: 10000, defaultValue: 0 },
    { key: 'boosting_min_pkg_price', type: 'integer', min: 0, max: 1000000, defaultValue: 0 },
    { key: 'spin_min_pkg_price', type: 'integer', min: 0, max: 1000000, defaultValue: 0 },
    { key: 'spin_min_directs', type: 'integer', min: 0, max: 10000, defaultValue: 0 },
    { key: 'spin_cooldown_hours', type: 'integer', min: 0, max: 10000, defaultValue: 24 },
    { key: 'boosting_reward', type: 'float', defaultValue: 0 },
    { key: 'deposit_fee', type: 'float', defaultValue: 0 },
    { key: 'withdrawal_fee', type: 'float', defaultValue: 0 },
    { key: 'rank_rewards', type: 'string', size: 10000, defaultValue: '[]' },
    { key: 'spin_cost', type: 'float', defaultValue: 0 },
    { key: 'spin_rewards', type: 'string', size: 10000, defaultValue: '[]' },
    { key: 'referrals_for_free_spins', type: 'integer', min: 0, max: 10000, defaultValue: 0 },
    { key: 'spins_per_milestone', type: 'integer', min: 0, max: 10000, defaultValue: 0 },
    { key: 'enable_deposit', type: 'boolean', defaultValue: true },
    { key: 'enable_withdrawal', type: 'boolean', defaultValue: true },
    { key: 'enable_swap', type: 'boolean', defaultValue: true },
    { key: 'roi_interval_minutes', type: 'integer', min: 1, max: 1000000, defaultValue: 1440 }
];

app.post('/api/admin/self-heal-schema', verifyAdmin, async (req: any, res: any) => {
    console.log("[Self-Healing] Starting Appwrite Schema health check and attribute creation...");
    try {
        const existingAttributesResponse = await databases.listAttributes(databaseId, collections.settings);
        const existingKeys = new Set(existingAttributesResponse.attributes.map((attr: any) => attr.key));
        
        console.log("[Self-Healing] Existing attributes in settings collection:", Array.from(existingKeys));
        
        const created: string[] = [];
        const errors: string[] = [];
        
        for (const attr of SCHEMA_ATTRIBUTES) {
            if (!existingKeys.has(attr.key)) {
                console.log(`[Self-Healing] Creating missing attribute '${attr.key}' of type '${attr.type}'...`);
                try {
                    if (attr.type === 'boolean') {
                        await databases.createBooleanAttribute(
                            databaseId, 
                            collections.settings, 
                            attr.key, 
                            false, 
                            attr.defaultValue
                        );
                    } else if (attr.type === 'integer') {
                        await databases.createIntegerAttribute(
                            databaseId, 
                            collections.settings, 
                            attr.key, 
                            false, 
                            attr.min, 
                            attr.max, 
                            attr.defaultValue
                        );
                    } else if (attr.type === 'float') {
                        await databases.createFloatAttribute(
                            databaseId, 
                            collections.settings, 
                            attr.key, 
                            false, 
                            undefined, 
                            undefined, 
                            attr.defaultValue
                        );
                    } else if (attr.type === 'string') {
                        await databases.createStringAttribute(
                            databaseId, 
                            collections.settings, 
                            attr.key, 
                            attr.size || 255, 
                            false, 
                            attr.defaultValue
                        );
                    }
                    created.push(attr.key);
                } catch (attrErr: any) {
                    console.error(`[Self-Healing] Error creating attribute '${attr.key}':`, attrErr.message);
                    errors.push(`${attr.key}: ${attrErr.message}`);
                }
            }
        }
        
        console.log("[Self-Healing] Completed. Created fields:", created);
        
        return res.json({
            success: true,
            message: `Schema self-healing process triggered!`,
            checked_fields_count: SCHEMA_ATTRIBUTES.length,
            created_fields: created,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (err: any) {
        console.error("[Self-Healing] Fatal Error:", err);
        return res.status(500).json({
            success: false,
            message: `Schema self-healing failed: ${err.message}`
        });
    }
});

// Handle Exchanger Requests (Admin)
// Admin Route: Get All Requests
app.get('/api/admin/requests', verifyAdmin, async (req, res) => {
    try {
        const response = await databases.listDocuments(databaseId, collections.exchanger_requests, [
            Query.orderDesc('created_at'),
            Query.limit(5000)
        ]);
        res.json(response.documents);
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Admin Route: Get Boosting Queue
app.get('/api/admin/boosting-queue', verifyAdmin, async (req, res) => {
    try {
        const response = await databases.listDocuments(databaseId, collections.gold_queue, [
            Query.orderAsc('created_at'),
            Query.limit(5000)
        ]);
        res.json(response.documents);
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/exchanger/request', verifyAuth, async (req, res) => {
    try {
        console.log("[Exchanger_API] Incoming Request:", JSON.stringify(req.body));
        const { user_id: rawUserId, amount, type, address, network, utr_number } = req.body;
        
        if (!rawUserId) {
            return res.status(400).json({ success: false, message: "User ID is required" });
        }

        const userId = await resolveUserAuthId(rawUserId) || rawUserId;
        console.log(`[Exchanger_API] Processing ${type} for Raw ID: ${rawUserId} -> Resolved ID: ${userId}`);

        const numAmount = Number(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({ success: false, message: "Invalid amount. Please specify a value greater than 0." });
        }

        const settings = await getServerSettings() as any;

        // CRITICAL: Handle Withdrawals and Sells (Deduction Required)
        if (type === 'withdraw' || type === 'sell') {
            const minWithdrawal = Number(settings.min_withdrawal ?? 1);
            console.log(`[Exchanger_API] Type: ${type}, Amount: ${numAmount}, MinRequired: ${minWithdrawal}`);

            if (numAmount < minWithdrawal) {
                return res.status(400).json({ success: false, message: `Minimum withdrawal is $${minWithdrawal}` });
            }

            // 1. Fetch wallet with improved fallback
            const searchIds = [userId];
            if (rawUserId && rawUserId !== userId) searchIds.push(rawUserId);

            console.log(`[Exchanger_API] Looking for wallet using IDs: ${JSON.stringify(searchIds)}`);
            let walletRes = await databases.listDocuments(databaseId, collections.wallets, [
                Query.equal('user_id', searchIds)
            ]);

            let wallet: any = null;
            if (walletRes.total > 0) {
                wallet = walletRes.documents[0];
            } else {
                // Secondary fallback search by node_id if possible via users collection
                const userDocRes = await databases.listDocuments(databaseId, collections.users, [
                    Query.equal('user_id', [userId])
                ]);
                
                if (userDocRes.total > 0) {
                    const userData = userDocRes.documents[0] as any;
                    const lookupId = userData.node_id || userData.user_id;
                    const retryWalletRes = await databases.listDocuments(databaseId, collections.wallets, [
                        Query.equal('user_id', [lookupId])
                    ]);
                    if (retryWalletRes.total > 0) wallet = retryWalletRes.documents[0];
                }
            }

            if (!wallet) {
                console.error(`[Exchanger_API] FATAL: Wallet not found for ID: ${userId}`);
                return res.status(404).json({ success: false, message: "WALLET_NOT_FOUND: No wallet linked to this account. Support se sampark karein." });
            }

            console.log(`[Exchanger_API] Found Wallet ${wallet.$id} - Current Balance: ${wallet.balance}`);

            if (wallet.balance < numAmount) {
                console.warn(`[Exchanger_API] BLOCK: Insufficient balance for ${userId}. Has ${wallet.balance}, needs ${numAmount}`);
                return res.status(400).json({ success: false, message: `INSUFFICIENT_BALANCE: Available: $${wallet.balance}` });
            }

            // 2. Deduct balance
            const newBalance = Number((wallet.balance - numAmount).toFixed(8));
            console.log(`[Exchanger_API] DEDUCTING: $${numAmount} from ${wallet.$id}. Transition: ${wallet.balance} -> ${newBalance}`);
            
            try {
                await databases.updateDocument(databaseId, collections.wallets, wallet.$id, {
                    balance: newBalance
                });
            } catch (err: any) {
                console.error("[Exchanger_API] Wallet Update Failed:", err);
                return res.status(500).json({ success: false, message: "WALLET_UPDATE_FAILED: System could not synchronize balance. Try again." });
            }

            // 3. Create Transaction RECORD
            console.log(`[Exchanger_API] Creating transaction record for ${type}...`);
            try {
                await databases.createDocument(databaseId, collections.transactions, ID.unique(), {
                    user_id: wallet.user_id || userId,
                    amount: numAmount,
                    type: type, // Correct type: 'sell' or 'withdraw'
                    description: `${type === 'sell' ? 'Asset Liquidation' : 'Protocol Extraction'}: $${numAmount}`,
                    from_user_id: 'SYSTEM',
                    created_at: new Date().toISOString().substring(0, 19) + 'Z'
                });
            } catch (transErr: any) {
                console.warn("[Exchanger_API] Non-fatal: Transaction record failed to generate:", transErr.message);
                // We continue because wallet was already updated
            }
        }

        // 4. Create the Exchanger Request Document
        const requestData: any = {
            user_id: userId,
            amount: numAmount,
            type: type,
            status: 'pending',
            address: address || 'N/A',
            user_upi: (type === 'withdraw' || type === 'sell') ? (address || 'N/A') : 'N/A',
            network: network || 'N/A',
            utr_number: utr_number || 'N/A',
            created_at: new Date().toISOString().substring(0, 19) + 'Z'
        };

        console.log(`[Exchanger_API] Persisting request record:`, JSON.stringify(requestData));

        let requestDoc;
        let payloadToTry = { ...requestData };
        let retries = 6;
        let lastError = null;

        while (retries > 0) {
            try {
                requestDoc = await databases.createDocument(
                    databaseId,
                    collections.exchanger_requests,
                    ID.unique(),
                    payloadToTry
                );
                lastError = null;
                break; // document created successfully!
            } catch (docErr: any) {
                lastError = docErr;
                const errorMsg = docErr.message || '';
                console.warn(`[Exchanger_API] Document Creation Attempt failed: ${errorMsg}`);

                // Check if it is a missing attribute error
                if (errorMsg.includes('Unknown attribute') || errorMsg.includes('UNKNOWN ATTRIBUTE') || errorMsg.includes('invalid_structure') || errorMsg.includes('structure')) {
                    // Try to match the attribute name from the error message.
                    const match = errorMsg.match(/Unknown attribute:\s*([a-zA-Z0-9_\-]+)/i) || 
                                  errorMsg.match(/UNKNOWN ATTRIBUTE:\s*"([a-zA-Z0-9_\-]+)"/i) ||
                                  errorMsg.match(/attribute:\s*"([^"]+)"/i) ||
                                  errorMsg.match(/attribute:\s*'([^']+)'/i);
                    
                    if (match && match[1]) {
                        const attributeKey = match[1];
                        console.warn(`[Self-Healing] Omitting missing attribute "${attributeKey}" from payload and retrying...`);
                        
                        // Delete key case-insensitively
                        const keyToDelete = Object.keys(payloadToTry).find(k => k.toLowerCase() === attributeKey.toLowerCase());
                        if (keyToDelete) {
                            delete payloadToTry[keyToDelete];
                            retries--;
                            continue;
                        }
                    }

                    // If we could not extract a specific key, we can progressively strip non-standard fields
                    // Standard fields according to setup-appwrite are user_id, type, amount, status, address, txid, created_at.
                    // Let's check which fields in our payload might be non-standard and delete them one by one.
                    const nonStandardKeys = ['user_upi', 'utr_number', 'network', 'txid'];
                    let removedAny = false;
                    for (const key of nonStandardKeys) {
                        if (payloadToTry[key] !== undefined) {
                            console.warn(`[Self-Healing-Fallback] Removing potential non-standard attribute "${key}" and retrying...`);
                            delete payloadToTry[key];
                            removedAny = true;
                            break; // remove one and retry
                        }
                    }
                    if (removedAny) {
                        retries--;
                        continue;
                    }
                }
                
                // If we get here and couldn't resolve the issue, break and throw
                break;
            }
        }

        if (lastError) {
            console.error("[Exchanger_API] Document Creation Failed after retries.", lastError);
            throw new Error(`Collection error: Please ensure all attributes (user_id, amount, type, address, network, utr_number, user_upi, status, created_at) exist in Appwrite. Error: ${lastError.message}`);
        }

        console.log(`[Exchanger_API] SUCCESS: Request ${requestDoc.$id} synchronized.`);
        res.json({ success: true, message: "Request initiated successfully.", id: requestDoc.$id });
    } catch (error: any) {
        console.error("[Exchanger_API] FATAL ERROR:", error);
        res.status(500).json({ success: false, message: "SYSTEM_ERROR: " + (error.message || "Unknown error") });
    }
});

app.post('/api/admin/handle-request', verifyAdmin, async (req, res) => {
    const { requestId, status } = req.body;
    let log = [];
    try {
        log.push(`Processing request ${requestId} with status ${status}`);
        // 1. Get request details
        const request = await databases.getDocument(databaseId, collections.exchanger_requests, requestId);
        log.push(`Fetched request: type=${request.type}, amount=${request.amount}, userId=${request.user_id}`);
        
        if (request.status !== 'pending') {
            return res.status(400).json({ success: false, message: `Request already processed (Status: ${request.status})`, log });
        }

        // 2. Process based on status and type
        if (status === 'approved') {
            log.push('Starting identity resolution...');
            const originalId = request.user_id;
            let authId = await resolveUserAuthId(originalId) || originalId;
            log.push(`Identity: Resolved=${authId}, Original=${originalId}`);

            // Find wallet - Improved robustness
            let wallet: any = null;
            let walletRes = await databases.listDocuments(databaseId, collections.wallets, [
                Query.equal('user_id', [authId])
            ]);
            
            if (walletRes.total === 0 && authId !== originalId) {
                log.push(`Wallet not found by Auth ID, trying Original ID: ${originalId}`);
                walletRes = await databases.listDocuments(databaseId, collections.wallets, [
                    Query.equal('user_id', [originalId])
                ]);
            }

            if (walletRes.total > 0) {
                wallet = walletRes.documents[0];
                log.push(`Wallet located: ${wallet.$id} (User: ${wallet.user_id}, Bal: ${wallet.balance})`);
            } else {
                log.push(`Wallet not found. Attempting to auto-create wallet for user ${authId}`);
                try {
                    wallet = await databases.createDocument(databaseId, collections.wallets, ID.unique(), {
                        user_id: authId,
                        balance: 0,
                        total_earned: 0,
                        total_withdrawn: 0,
                        direct_income: 0,
                        level_income: 0,
                        pool_income: 0,
                        created_at: new Date().toISOString().substring(0, 19) + 'Z'
                    });
                    log.push(`Wallet successfully auto-created: ${wallet.$id}`);
                } catch (createErr: any) {
                    log.push(`Wallet auto-creation failed: ${createErr.message}`);
                    // If creation fails, we might already have it or permission issue
                    return res.status(500).json({ success: false, message: `Wallet missing and auto-creation failed for ${authId}`, log });
                }
            }

            if (wallet) {
                const settings = await getServerSettings() as any;
                const oldBalance = Number(wallet.balance || 0);
                
                if (request.type === 'deposit') {
                    const depositFeePerc = Number(settings.deposit_fee || 0);
                    const amount = Number(request.amount || 0);
                    const feeAmt = (amount * depositFeePerc) / 100;
                    const finalAmountCapped = Math.max(0, Number((amount - feeAmt).toFixed(2)));
                    
                    const newBalance = Number((oldBalance + finalAmountCapped).toFixed(2));
                    log.push(`Action: DEPOSIT | Base=${amount} | Fee=${feeAmt.toFixed(2)} | Net=${finalAmountCapped} | NewBal=${newBalance}`);

                    try {
                        const updatedWallet = await databases.updateDocument(databaseId, collections.wallets, wallet.$id, {
                            balance: newBalance
                        });
                        log.push(`DB_WALLET_UPDATE_SUCCESS (Current DB Balance: ${updatedWallet.balance})`);
                    } catch (updateErr: any) {
                        log.push(`DB_WALLET_UPDATE_FAILED: ${updateErr.message}`);
                        console.error("Wallet update failed:", updateErr);
                        return res.status(500).json({ success: false, message: `Wallet update failed: ${updateErr.message}`, log });
                    }

                    await databases.createDocument(databaseId, collections.transactions, ID.unique(), {
                        user_id: wallet.user_id || authId,
                        amount: finalAmountCapped,
                        type: 'deposit',
                        description: `Deposit Approved: $${amount} (Fee: ${depositFeePerc}%)`,
                        from_user_id: 'SYSTEM',
                        created_at: new Date().toISOString().substring(0, 19) + 'Z'
                    });
                    log.push(`TX_RECORD_CREATED`);
                } else if (request.type === 'withdraw' || request.type === 'sell') {
                    // Balance was ALREADY deducted on request creation (locked)
                    // We just need to update total_withdrawn stats now that it is officially approved
                    const withdrawAmount = Number(request.amount || 0);
                    
                    log.push(`Action: WITHDRAW_APPROVE | Amount=${withdrawAmount}`);

                    try {
                        const updatedWallet = await databases.updateDocument(databaseId, collections.wallets, wallet.$id, {
                            total_withdrawn: Number((Number(wallet.total_withdrawn || 0) + withdrawAmount).toFixed(2))
                        });
                        log.push(`DB_WALLET_STATS_UPDATE_SUCCESS (Total Withdrawn: ${updatedWallet.total_withdrawn})`);
                    } catch (updateErr: any) {
                        log.push(`DB_WALLET_STATS_UPDATE_FAILED: ${updateErr.message}`);
                        return res.status(500).json({ success: false, message: `Withdrawal stats update failed: ${updateErr.message}`, log });
                    }

                    await databases.createDocument(databaseId, collections.transactions, ID.unique(), {
                        user_id: wallet.user_id || authId,
                        amount: withdrawAmount,
                        type: 'withdraw',
                        description: `Withdrawal Finalized: $${withdrawAmount}`,
                        from_user_id: 'SYSTEM',
                        created_at: new Date().toISOString().substring(0, 19) + 'Z'
                    });
                    log.push(`TX_RECORD_CREATED`);
                }
            }
        } else if (status === 'rejected') {
            log.push(`Request ${requestId} REJECTED.`);
            
            // For withdrawals, we need to refund the locked balance
            if (request.type === 'withdraw' || request.type === 'sell') {
                const amount = Number(request.amount || 0);
                const originalId = request.user_id;
                let authId = await resolveUserAuthId(originalId) || originalId;
                
                log.push(`Attempting refund of $${amount} to user ${authId}`);
                
                let walletRes = await databases.listDocuments(databaseId, collections.wallets, [
                    Query.equal('user_id', [authId])
                ]);

                if (walletRes.total === 0 && authId !== originalId) {
                    walletRes = await databases.listDocuments(databaseId, collections.wallets, [
                        Query.equal('user_id', [originalId])
                    ]);
                }

                if (walletRes.total > 0) {
                    const wallet = walletRes.documents[0];
                    const newBalance = Number((Number(wallet.balance || 0) + amount).toFixed(2));
                    
                    await databases.updateDocument(databaseId, collections.wallets, wallet.$id, {
                        balance: newBalance
                    });
                    log.push(`REFUND_SUCCESS: New balance $${newBalance}`);
                    
                    await databases.createDocument(databaseId, collections.transactions, ID.unique(), {
                        user_id: wallet.user_id,
                        amount: amount,
                        type: 'deposit',
                        description: `Withdrawal Rejected - Refund: $${amount}`,
                        from_user_id: 'SYSTEM',
                        created_at: new Date().toISOString().substring(0, 19) + 'Z'
                    });
                } else {
                    log.push(`REFUND_FAILED: Wallet not found for user ${authId}`);
                }
            }
        }

        // 3. Mark request as processed
        try {
            await databases.updateDocument(databaseId, collections.exchanger_requests, requestId, {
                status: status
            });
            log.push(`Request ${requestId} status set to ${status}`);
        } catch (updateErr: any) {
            console.error("[HandleRequest] Failed to update request status:", updateErr);
            // If it's the specific "STATUS" attribute issue, try uppercase just in case
            if (updateErr.message?.includes('UNKNOWN ATTRIBUTE: "STATUS"') || updateErr.message?.includes('status')) {
                 try {
                     await databases.updateDocument(databaseId, collections.exchanger_requests, requestId, {
                         STATUS: status
                     } as any);
                     log.push(`Request ${requestId} status updated using uppercase 'STATUS' fallback`);
                 } catch (retryErr) {
                     log.push(`Update failed even with fallback: ${updateErr.message}`);
                     throw updateErr;
                 }
            } else {
                throw updateErr;
            }
        }

        res.json({ success: true, message: `Request ${status} successfully. Trace: ${log.join(' | ')}`, log });
    } catch (error: any) {
        console.error("Handle Request Error:", error);
        res.status(500).json({ success: false, message: `Server error: ${error.message}`, log });
    }
});

// Swap earned balance to usable balance
app.post('/api/swap', verifyAuth, async (req, res) => {
    const { userId: rawUserId, amount } = req.body;
    try {
        const userId = await resolveUserAuthId(rawUserId) || rawUserId;
        const walletResponse = await databases.listDocuments(databaseId, collections.wallets, [
            Query.equal('user_id', [userId])
        ]);
        if (walletResponse.total === 0) throw new Error('Wallet not found');
        const wallet = walletResponse.documents[0];

        if (wallet.total_earned < amount) throw new Error('Insufficient earned balance');

        const newUsable = Number((wallet.balance + amount).toFixed(8));
        const newEarned = Number((wallet.total_earned - amount).toFixed(8));

        await databases.updateDocument(databaseId, collections.wallets, wallet.$id, {
            balance: newUsable,
            total_earned: newEarned
        });

        await databases.createDocument(databaseId, collections.transactions, ID.unique(), {
            user_id: userId,
            amount: amount,
            type: 'swap',
            description: 'Balance swap',
            created_at: new Date().toISOString().substring(0, 19) + 'Z'
        });

        res.json({ success: true, message: 'Swap successful' });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/rewards/claim', verifyAuth, async (req, res) => {
    const { rewardId, userId: rawUserId } = req.body;
    try {
        const userId = await resolveUserAuthId(rawUserId) || rawUserId;
        const [userRes, walletRes, settingsRes] = await Promise.all([
            databases.listDocuments(databaseId, collections.users, [Query.equal('user_id', [userId])]),
            databases.listDocuments(databaseId, collections.wallets, [Query.equal('user_id', [userId])]),
            getServerSettings()
        ]);

        if (userRes.total === 0 || walletRes.total === 0 || !settingsRes) {
            return res.status(404).json({ success: false, message: 'User or Wallet resources not found' });
        }

        const user = userRes.documents[0] as any;
        const wallet = walletRes.documents[0] as any;
        const settings = settingsRes as any;

        // Find matching Rank Reward
        const rewardsList = settings.rank_rewards || [];
        const reward = rewardsList.find((r: any) => r.id === rewardId);
        if (!reward) {
            return res.status(404).json({ success: false, message: 'Reward milestone not found in settings' });
        }

        // Verify if reward is already claimed
        const existingTxRes = await databases.listDocuments(databaseId, collections.transactions, [
            Query.equal('user_id', [userId]),
            Query.equal('description', [`Rank Reward Claim: ${reward.rank_name}`])
        ]);

        if (existingTxRes.total > 0) {
            return res.json({ success: false, message: 'This rank reward has already been claimed.' });
        }

        // Fetch User Active Purchases
        const purchasesRes = await databases.listDocuments(databaseId, collections.user_packages, [Query.equal('user_id', [userId])]);
        const activePurchases = purchasesRes.documents.filter((p: any) => p.is_active !== false);

        // Calculate Personal active packages max price
        const maxActivePackagePrice = activePurchases.reduce((max: number, p: any) => Math.max(max, Number(p.price) || 0), 0);

        // Fetch user's direct downline & complete downline to check same package upgrade size
        const allUsersResponse = await databases.listDocuments(databaseId, collections.users, [Query.limit(5000)]);
        const allUsers = allUsersResponse.documents;

        const getDownlineIds = (uId: string): string[] => {
            const list: string[] = [];
            const directs = allUsers.filter((u: any) => {
                const referee = String(u.referred_by || '').toLowerCase();
                const actualUserId = String(userId).toLowerCase();
                const actualUserFieldId = String(user.user_id || '').toLowerCase();
                const dId = String(uId).toLowerCase();
                return referee === dId;
            });
            directs.forEach((d: any) => {
                const dId = d.user_id || d.$id;
                list.push(dId);
                list.push(...getDownlineIds(dId));
            });
            return list;
        };

        const downlineIds = getDownlineIds(userId);
        
        // Count direct referrals
        const directReferrals = allUsers.filter((u: any) => {
            const referee = String(u.referred_by || '').toLowerCase();
            return referee === String(userId).toLowerCase() || referee === String(user.user_id || '').toLowerCase();
        });
        const directCount = directReferrals.length;

        // Count how many downline members upgraded to package >= min_self_package
        const requiredSelfPkg = Number(reward.min_self_package || 0);
        let downlineSamePkgCount = 0;

        if (requiredSelfPkg > 0 && downlineIds.length > 0) {
            const allPkgResponse = await databases.listDocuments(databaseId, collections.user_packages, [Query.limit(5000)]);
            const allPurchases = allPkgResponse.documents;
            
            const uniqueDownlinesWithPkg = new Set<string>();
            allPurchases.forEach((p: any) => {
                if (p.is_active !== false && Number(p.price || 0) >= requiredSelfPkg && downlineIds.includes(p.user_id)) {
                    uniqueDownlinesWithPkg.add(p.user_id);
                }
            });
            downlineSamePkgCount = uniqueDownlinesWithPkg.size;
        }

        // Standard Business Calculations (Personal & Team business)
        const personalBusinessValue = Number(user.personal_business || 0);

        // Fetch team business dynamically:
        // If target_depth > 0, calculate level-specific business (e.g. Levels 1 to 3).
        // Otherwise, use user's accumulated total team business.
        const targetDepth = Number(reward.target_depth || 0);
        let teamBusinessValue = 0;
        if (targetDepth > 0) {
            console.log(`[ClaimRank] Calculating level business up to depth: ${targetDepth}`);
            teamBusinessValue = await calculateLevelBusiness(userId, targetDepth);
        } else {
            teamBusinessValue = Number(user.team_business || 0);
        }

        // VERIFICATION CHECKS
        const targetSelfPkg = Number(reward.min_self_package || 0);
        const targetSamePkgDownlines = Number(reward.min_downline_same_package || 0);
        const targetDirectsRequired = Number(reward.min_directs || 0);
        const targetPersonalBusiness = Number(reward.personal_business || 0);
        const targetTeamBusiness = Number(reward.team_business || 0);

        // Verify Self package
        if (maxActivePackagePrice < targetSelfPkg) {
            return res.json({ success: false, message: `Your Active personal package ($${maxActivePackagePrice}) is less than the required self package ($${targetSelfPkg}).` });
        }

        // Verify Directs Count
        if (directCount < targetDirectsRequired) {
            return res.json({ success: false, message: `You have ${directCount} direct referrals, but this rank requires ${targetDirectsRequired} direct referrals.` });
        }

        // Verify Downline count with same package
        if (downlineSamePkgCount < targetSamePkgDownlines) {
            return res.json({ success: false, message: `Only ${downlineSamePkgCount} of your downline members upgraded to a $${targetSelfPkg}+ package. You need ${targetSamePkgDownlines} downline upgrades.` });
        }

        // Verify Personal Business
        if (personalBusinessValue < targetPersonalBusiness) {
            return res.json({ success: false, message: `Your Personal Business is $${personalBusinessValue}, but this rank requires $${targetPersonalBusiness}.` });
        }

        // Verify Team Business
        if (teamBusinessValue < targetTeamBusiness) {
            const depthMsg = targetDepth > 0 ? `up to Level ${targetDepth}` : 'total';
            return res.json({ success: false, message: `Your Team Business ${depthMsg} is $${teamBusinessValue}, but this rank requires $${targetTeamBusiness}.` });
        }

        // IF ALL ELIGIBILITY CHECKS PASS, AWARD THE BONUS
        const currentBalance = Number(wallet.balance || 0);
        const currentTotalEarned = Number(wallet.total_earned || 0);
        const rewardAmount = Number(reward.reward_amount || 0);

        const newBalance = Number((currentBalance + rewardAmount).toFixed(4));
        const newTotalEarned = Number((currentTotalEarned + rewardAmount).toFixed(4));

        await safeUpdateDocument(collections.wallets, wallet.$id, {
            balance: newBalance,
            total_earned: newTotalEarned
        });

        // Add Transaction record
        await databases.createDocument(databaseId, collections.transactions, ID.unique(), {
            user_id: userId,
            amount: rewardAmount,
            type: 'task',
            description: `Rank Reward Claim: ${reward.rank_name}`,
            from_user_id: 'SYSTEM',
            created_at: new Date().toISOString().substring(0, 19) + 'Z'
        });

        return res.json({ 
            success: true, 
            message: `Congratulations! ${reward.rank_name} claimed successfully! $${rewardAmount} USDT credited to your wallet.`,
            wallet: {
                balance: newBalance,
                total_earned: newTotalEarned
            }
        });

    } catch (error: any) {
        console.error('[Rank Claim Error]', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/perform-spin', verifyAuth, async (req, res) => {
    const { userId: rawUserId, spinType } = req.body;
    try {
        const userId = await resolveUserAuthId(rawUserId) || rawUserId;
        const [userRes, walletRes, settingsRes] = await Promise.all([
            databases.listDocuments(databaseId, collections.users, [Query.equal('user_id', [userId])]),
            databases.listDocuments(databaseId, collections.wallets, [Query.equal('user_id', [userId])]),
            getServerSettings()
        ]);

        if (userRes.total === 0 || walletRes.total === 0 || !settingsRes) {
            throw new Error('Resources not found');
        }

        const user = userRes.documents[0] as any;
        const wallet = walletRes.documents[0] as any;
        enrichWalletWithSpins(wallet);
        const settings = settingsRes as any;

        // 1. Dual Qualification (OR Logic)
        const purchasesRes = await databases.listDocuments(databaseId, collections.user_packages, [Query.equal('user_id', [userId])]);
        const maxPkgPrice = purchasesRes.documents.reduce((max, p: any) => Math.max(max, p.price || 0), 0);
        
        const minPkgPrice = settings.spin_min_pkg_price !== undefined && settings.spin_min_pkg_price !== null ? settings.spin_min_pkg_price : 100;
        const minDirects = settings.spin_min_directs !== undefined && settings.spin_min_directs !== null ? settings.spin_min_directs : 6;

        if (maxPkgPrice < minPkgPrice && (user.direct_count || 0) < minDirects) {
            return res.json({ success: false, message: `Qualification required: Own $${minPkgPrice}+ node OR refer ${minDirects} directs.` });
        }

        // 2. Cooldown bypassed


        // 3. Pre-calculate/validate reward (Critical order for integrity: No balance loss on calc failure!)
        const rewards = settings.spin_rewards || [];
        if (!Array.isArray(rewards) || rewards.length === 0) {
            throw new Error('No rewards configured for the Spin Wheel. Please check settings.');
        }

        const totalProb = rewards.reduce((sum: number, r: any) => sum + (Number(r.probability) || 0), 0);
        if (totalProb <= 0) {
            throw new Error('Invalid spin configuration: Total probability is 0.');
        }

        let random = Math.random() * totalProb;
        let selected = rewards[0];
        for (const r of rewards) {
            if (random < r.probability) {
                selected = r;
                break;
            }
            random -= r.probability;
        }

        if (!selected) {
            throw new Error('Reward selection algorithm failure.');
        }

        // 4. Cost / available spins and Reward calculation (Unified atomic update to prevent race conditions!)
        const currentSpins = Number(wallet.available_spins || 0);
        
        // Force treat as free spin if user has available spins OR explicitly requests free spin
        let hasFreeSpins = (!isNaN(currentSpins) && currentSpins > 0) || spinType === 'free';
        
        let spinCost = 1; // Robust fallback value
        if (hasFreeSpins) {
            spinCost = 0;
        } else {
            const rawSpinCost = settings.spin_cost;
            if (rawSpinCost !== undefined && rawSpinCost !== null && rawSpinCost !== '') {
                const parsedCost = Number(rawSpinCost);
                if (!isNaN(parsedCost)) {
                    spinCost = parsedCost;
                }
            }
        }
        
        const currentBalance = Number(wallet.balance || 0);
        if (currentBalance < spinCost) {
            throw new Error(`Insufficient balance to spin. Cost is $${spinCost}.`);
        }

        const rewardAmount = Number(selected.amount || 0);

        // Calculate final wallet values
        const newBalance = Number((currentBalance - spinCost + rewardAmount).toFixed(4));
        const newTotalEarned = Number((Number(wallet.total_earned || 0) + rewardAmount).toFixed(4));

        // Detect if user won additional free spins as a reward segment (e.g. "+1 Spin" or "Free Spin")
        const cleanRewardLabel = String(selected.label || '').trim().toLowerCase();
        let spinsToGrant = 0;
        if (cleanRewardLabel.includes('spin')) {
            const match = cleanRewardLabel.match(/(\+?\d+)/);
            if (match) {
                const parsedNum = parseInt(match[1]);
                if (!isNaN(parsedNum) && parsedNum > 0) {
                    spinsToGrant = parsedNum;
                }
            } else {
                spinsToGrant = 1; // Default to 1 spin for simple labels like "Free Spin" or "Spin Wheel Bonus"
            }
        }

        // Compute updated free spins count
        let finalSpins = currentSpins;
        if (hasFreeSpins && currentSpins > 0) {
            finalSpins = Math.max(0, currentSpins - 1);
        }
        finalSpins += spinsToGrant;

        console.log(`[Spin API Core] User: ${userId}, Wallet: ${wallet.$id}`);
        console.log(`[Spin API Core] Initial balance: ${currentBalance}, spins remaining: ${currentSpins}`);
        console.log(`[Spin API Core] hasFreeSpins: ${hasFreeSpins}, spinCost: ${spinCost}, rewardAmount: ${rewardAmount}`);
        console.log(`[Spin API Core] Won Spins Grant: ${spinsToGrant}, Final spins computed: ${finalSpins}`);
        console.log(`[Spin API Core] final newBalance calculated: ${newBalance}`);

        const packedLastRoiAt = packSpinsIntoLastRoiAt(wallet.last_roi_at, finalSpins);
        const walletUpdatePayload: any = {
            balance: newBalance,
            total_earned: newTotalEarned,
            last_roi_at: packedLastRoiAt,
            available_spins: finalSpins
        };

        // Update wallet atomic-like (one direct write with safe helper)
        await safeUpdateDocument(collections.wallets, wallet.$id, walletUpdatePayload);

        // 5. Create Spin Reward Transaction Record
        await databases.createDocument(databaseId, collections.transactions, ID.unique(), {
            user_id: userId,
            amount: rewardAmount,
            type: 'spin',
            description: `Spin Wheel Reward: ${selected.label}`,
            from_user_id: 'SYSTEM',
            created_at: new Date().toISOString().substring(0, 19) + 'Z'
        });

        // Create negative spin fee transaction if cost was paid
        if (spinCost > 0) {
            await databases.createDocument(databaseId, collections.transactions, ID.unique(), {
                user_id: userId,
                amount: -spinCost,
                type: 'spin',
                description: `Spin Wheel Cost`,
                from_user_id: 'SYSTEM',
                created_at: new Date().toISOString().substring(0, 19) + 'Z'
            });
        }
        
        const updatedWallet = {
            ...wallet,
            balance: newBalance,
            total_earned: newTotalEarned,
            available_spins: finalSpins
        };
        
        res.json({ success: true, reward: selected, wallet: updatedWallet });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
});

// Admin Route: Update User Name/Password/Business
app.post('/api/admin/update-user', verifyAdmin, async (req, res) => {
    const { userId, name, password, personal_business, team_business, mobile } = req.body;
    try {
        // Update in Appwrite Auth
        if (name) {
            await users.updateName(userId, name);
        }
        if (password) {
            await users.updatePassword(userId, password);
        }

        // Update in Users Collection (Database)
        const userDocRes = await databases.listDocuments(databaseId, collections.users, [
            Query.equal('user_id', [userId])
        ]);
        
        if (userDocRes.total > 0) {
            const updatePayload: any = {};
            if (name) updatePayload.name = name;
            if (personal_business !== undefined) updatePayload.personal_business = Number(personal_business);
            if (team_business !== undefined) updatePayload.team_business = Number(team_business);
            if (mobile !== undefined) updatePayload.mobile = mobile;
            
            await databases.updateDocument(
                databaseId, 
                collections.users, 
                userDocRes.documents[0].$id, 
                updatePayload
            );
        }

        res.json({ success: true, message: 'User updated successfully' });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Admin Route: Delete User and all associated assets
app.post('/api/admin/delete-user', verifyAdmin, async (req: any, res: any) => {
    const { userId } = req.body;
    if (!userId) {
        return res.status(400).json({ success: false, message: 'User ID is required' });
    }
    
    // Prevent self-deletion of currently logged-in admin
    if (userId === req.user.$id) {
        return res.status(400).json({ success: false, message: 'You cannot delete yourself' });
    }

    try {
        console.log(`[Admin Delete Request] Initializing deletion for User ID: ${userId}`);

        // 1. Delete matching user database document(s)
        try {
            const userDocRes = await databases.listDocuments(databaseId, collections.users, [
                Query.equal('user_id', [userId])
            ]);
            for (const doc of userDocRes.documents) {
                await databases.deleteDocument(databaseId, collections.users, doc.$id);
                console.log(`  -> Deleted users collection document: ${doc.$id}`);
            }
        } catch (e: any) {
            console.error(`  -> Failed to delete user document(s):`, e.message);
        }

        // 2. Delete matching wallet database document(s)
        try {
            const walletDocRes = await databases.listDocuments(databaseId, collections.wallets, [
                Query.equal('user_id', [userId])
            ]);
            for (const doc of walletDocRes.documents) {
                await databases.deleteDocument(databaseId, collections.wallets, doc.$id);
                console.log(`  -> Deleted wallets collection document: ${doc.$id}`);
            }
        } catch (e: any) {
            console.error(`  -> Failed to delete wallet document(s):`, e.message);
        }

        // 3. Delete matching package purchases document(s)
        try {
            const packageDocRes = await databases.listDocuments(databaseId, collections.user_packages, [
                Query.equal('user_id', [userId])
            ]);
            for (const doc of packageDocRes.documents) {
                await databases.deleteDocument(databaseId, collections.user_packages, doc.$id);
                console.log(`  -> Deleted user_packages document: ${doc.$id}`);
            }
        } catch (e: any) {
            console.error(`  -> Failed to delete user_packages document(s):`, e.message);
        }

        // 4. Delete matching transactions document(s)
        try {
            const txDocRes = await databases.listDocuments(databaseId, collections.transactions, [
                Query.equal('user_id', [userId])
            ]);
            for (const doc of txDocRes.documents) {
                await databases.deleteDocument(databaseId, collections.transactions, doc.$id);
                console.log(`  -> Deleted transactions document: ${doc.$id}`);
            }
        } catch (e: any) {
            console.error(`  -> Failed to delete transactions:`, e.message);
        }

        // 5. Delete matching exchanger requests document(s)
        try {
            const reqDocRes = await databases.listDocuments(databaseId, collections.exchanger_requests, [
                Query.equal('user_id', [userId])
            ]);
            for (const doc of reqDocRes.documents) {
                await databases.deleteDocument(databaseId, collections.exchanger_requests, doc.$id);
                console.log(`  -> Deleted exchanger_requests document: ${doc.$id}`);
            }
        } catch (e: any) {
            console.error(`  -> Failed to delete exchanger requests:`, e.message);
        }

        // 6. Delete matching gold queue entries
        try {
            const goldDocRes = await databases.listDocuments(databaseId, collections.gold_queue, [
                Query.equal('user_id', [userId])
            ]);
            for (const doc of goldDocRes.documents) {
                await databases.deleteDocument(databaseId, collections.gold_queue, doc.$id);
                console.log(`  -> Deleted gold_queue document: ${doc.$id}`);
            }
        } catch (e: any) {
            console.error(`  -> Failed to delete gold queue entries:`, e.message);
        }

        // 7. Finally, delete the Auth User in Appwrite
        try {
            await users.delete(userId);
            console.log(`  -> Deleted Appwrite Auth user successfully.`);
        } catch (e: any) {
            console.error(`  -> Failed to delete Auth user inside Appwrite Auth:`, e.message);
        }

        console.log(`[Admin Delete Request] Successfully completed deletion for User ID: ${userId}`);
        res.json({ success: true, message: 'User and all associated data deleted successfully!' });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/user/sync-boosting', verifyAuth, async (req, res) => {
    const { userId } = req.body;
    try {
        const result = await triggerBoostingServer(userId);
        res.json({ success: true, ...result });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// Admin Route: Get All Users
app.get('/api/admin/users', verifyAdmin, async (req, res) => {
    try {
        const response = await databases.listDocuments(databaseId, collections.users, [
            Query.limit(5000)
        ]);
        res.json(response.documents);
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Admin Route: Get All Purchases
app.get('/api/admin/purchases', verifyAdmin, async (req, res) => {
    try {
        const response = await databases.listDocuments(databaseId, collections.user_packages, [
            Query.limit(5000) // Support large datasets for admin analysis
        ]);
        res.json(response.documents);
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// User Route: Get Downline Data (Team members and their active packages)
app.get('/api/user/team-data/:userId', verifyAuth, async (req: any, res: any) => {
    try {
        const { userId } = req.params;
        const resolvedId = await resolveUserAuthId(userId) || userId;
        
        // Fetch user's downline (up to 10 levels)
        const fetchDownlineRecursive = async (parentIds: string[], currentDepth: number): Promise<any[]> => {
            if (currentDepth > 10 || parentIds.length === 0) return [];
            
            const childrenRes = await databases.listDocuments(databaseId, collections.users, [
                Query.equal('referred_by', parentIds),
                Query.limit(5000)
            ]);
            
            if (childrenRes.total === 0) return [];
            
            const children = childrenRes.documents;
            const nextParentIds = children.map((c: any) => c.user_id);
            const deeperChildren = await fetchDownlineRecursive(nextParentIds, currentDepth + 1);
            
            return [...children, ...deeperChildren];
        };

        const downline = await fetchDownlineRecursive([resolvedId], 1);
        const downlineUserIds = downline.map((u: any) => u.user_id);

        // Fetch all purchases for these downline users
        let purchases: any[] = [];
        if (downlineUserIds.length > 0) {
            for (let i = 0; i < downlineUserIds.length; i += 100) {
                const chunk = downlineUserIds.slice(i, i + 100);
                const pRes = await databases.listDocuments(databaseId, collections.user_packages, [
                    Query.equal('user_id', chunk),
                    Query.limit(5000)
                ]);
                purchases = purchases.concat(pRes.documents);
            }
        }

        res.json({ success: true, users: downline, purchases });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Helper: Process ROI for a single package with strict idempotency and catch-up
async function processPackageROI(p: any, settings: any): Promise<boolean> {
    try {
        // 1. Refetch fresh package document to avoid race conditions with referral income capping
        const freshPkg = await databases.getDocument(databaseId, collections.user_packages, p.$id);
        const price = Number(freshPkg.price || 0);
        const dailyPerc = Number(freshPkg.daily_roi || 0);
        const maxRoiPercent = Number(freshPkg.max_roi_percent || settings?.max_roi_percent || 200);
        
        // Dynamic fallback: since user_packages collection on Appwrite doesn't have the roi_interval_minutes column,
        // we retrieve it from the catalog packages collection using freshPkg.package_id if missing.
        let intervalMins = Number(freshPkg.roi_interval_minutes || settings?.roi_interval_minutes || 1440);
        if (!freshPkg.roi_interval_minutes && freshPkg.package_id) {
            try {
                const catPkg = await databases.getDocument(databaseId, collections.packages, freshPkg.package_id);
                if (catPkg && catPkg.roi_interval_minutes) {
                    intervalMins = Number(catPkg.roi_interval_minutes);
                }
            } catch (err: any) {
                console.warn(`[ROI_INTERVAL_FALLBACK] Failed to fetch catalog package ${freshPkg.package_id}:`, err.message);
            }
        }

        const cyclePayout = Number((price * dailyPerc / 100).toFixed(4));
        if (cyclePayout <= 0 || price <= 0) return false;

        const maxEarningCap = (price * maxRoiPercent) / 100;
        let currentEarned = Number((freshPkg.roi_earned || 0).toFixed(4));

        // Check if package is already finished
        if (maxEarningCap > 0 && currentEarned >= (maxEarningCap - 0.0001)) {
            await databases.updateDocument(databaseId, collections.user_packages, p.$id, { is_active: false });
            return false;
        }

        const activationTs = new Date(freshPkg.activated_at || freshPkg.$createdAt).getTime();
        const lastPaidTs = freshPkg.last_roi_at ? new Date(freshPkg.last_roi_at).getTime() : activationTs;
        const nowTs = Date.now();
        
        // Calculate pending cycles
        const elapsedMs = nowTs - lastPaidTs;
        const pendingCycles = Math.floor(elapsedMs / (intervalMins * 60000));
        
        if (pendingCycles < 1) return false;

        console.log(`[ROI_B] Pkg ${p.$id.substring(0,8)} | Int: ${intervalMins}m | Pending: ${pendingCycles} | LastTs: ${new Date(lastPaidTs).toISOString()}`);

        let processedAny = false;
        let pointerTs = lastPaidTs;
        const maxCyclesToRun = Math.min(pendingCycles, 50); // Safety cap for burst catch-up

        for (let i = 1; i <= maxCyclesToRun; i++) {
            // Re-fetch halfway or every cycle if we want to be super safe against race conditions
            // but for now, let's at least check the incremented locally currentEarned
            const currentCycleTargetTs = pointerTs + (intervalMins * 60000);
            if (currentCycleTargetTs > nowTs) break;

            // Fetch FRESH document inside the loop to prevent race conditions with Referral/Direct income updates
            const loopPkg = await databases.getDocument(databaseId, collections.user_packages, p.$id);
            currentEarned = Number((loopPkg.roi_earned || 0).toFixed(4));
            
            const remainingCap = maxEarningCap > 0 ? (maxEarningCap - currentEarned) : Infinity;
            if (remainingCap <= 0.0001) {
                await databases.updateDocument(databaseId, collections.user_packages, p.$id, { is_active: false });
                break;
            }

            const payoutAmt = Math.min(cyclePayout, remainingCap);
            const cycleNum = Math.round((currentCycleTargetTs - activationTs) / (intervalMins * 60000));
            
            // Unique ID per cycle using timestamp (Idempotency Key)
            const tsKey = Math.floor(currentCycleTargetTs / 1000).toString(36);
            const dedupeId = `ROI_${p.$id.substring(0, 15)}_${tsKey}`;

            const timeStr = new Intl.DateTimeFormat('en-IN', {
                timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true
            }).format(new Date(currentCycleTargetTs));

            console.log(`[ROI_L] Cycle #${cycleNum} | Amt: $${payoutAmt} | Time: ${timeStr} | ID: ${dedupeId}`);

            try {
                // LOWERCASE 'roi' is critical. 8 arguments signature used.
                const success = await distributeIncomeServer(p.user_id, payoutAmt, 'roi', `Node yield (Cycle #${cycleNum}) at ${timeStr}`, 'SYSTEM', 0, true, dedupeId);
                
                if (success) {
                    processedAny = true;
                    currentEarned = Number((currentEarned + payoutAmt).toFixed(4));
                    pointerTs = currentCycleTargetTs;

                    const isFinished = maxEarningCap > 0 && currentEarned >= (maxEarningCap - 0.0001);
                    await databases.updateDocument(databaseId, collections.user_packages, p.$id, {
                        last_roi_at: new Date(currentCycleTargetTs).toISOString().substring(0, 19) + 'Z',
                        roi_earned: Number(currentEarned.toFixed(4)),
                        ...(isFinished && { is_active: false })
                    });

                    if (isFinished) {
                        console.log(`[ROI_F] Pkg ${p.$id} finished cap.`);
                        break;
                    }
                } else {
                    console.warn(`[ROI_SKIP] Payment failed for ${p.$id}. Breaking loop for next scan.`);
                    break;
                }
            } catch (err: any) {
                // If it's a duplicate error that distributeIncomeServer didn't catch (unlikely but possible)
                if (err.message?.includes('409') || err.message?.includes('already exists') || err.message?.includes('DUPLICATE')) {
                    console.warn(`[ROI_DUP] Duplicate detected at Loop for ${dedupeId}. Syncing pointer.`);
                    pointerTs = currentCycleTargetTs;
                    // We don't increment currentEarned here because the money wasn't sent in THIS call 
                    // (prev call must have updated currentEarned if it succeeded)
                    // But we MUST update last_roi_at to not get stuck
                    await databases.updateDocument(databaseId, collections.user_packages, p.$id, {
                        last_roi_at: new Date(currentCycleTargetTs).toISOString().substring(0, 19) + 'Z'
                    });
                    continue; 
                }
                console.error(`[ROI_FATAL_LOOP] Cycle #${cycleNum}:`, err.message);
                break;
            }
        }

        return processedAny;
    } catch (error: any) {
        console.error(`[ROI_PROC_FATAL] Package ${p?.$id}:`, error.message);
        return false;
    }
}


app.post('/api/distribute-roi', verifyAuth, async (req, res) => {
    const { userId: rawUserId } = req.body;
    try {
        const userId = await resolveUserAuthId(rawUserId) || rawUserId;
        const settings = await getServerSettings() as any;
        
        const purchasesResponse = await databases.listDocuments(databaseId, collections.user_packages, [
            Query.equal('user_id', [userId]),
            Query.equal('is_active', true)
        ]);
        
        if (!purchasesResponse || !purchasesResponse.documents || purchasesResponse.documents.length === 0) {
            return res.json({ success: true, message: 'No active nodes' });
        }
        
        let processedCount = 0;
        for (const p of purchasesResponse.documents as any[]) {
            // Pre-flight check locally on the retrieved document to prevent unnecessary database reads
            const pActivationTs = new Date(p.activated_at || p.$createdAt).getTime();
            const pLastPaidTs = p.last_roi_at ? new Date(p.last_roi_at).getTime() : pActivationTs;
            const pIntervalMins = Number(p.roi_interval_minutes || settings?.roi_interval_minutes || 1440);
            const pElapsedMs = Date.now() - pLastPaidTs;
            const pPendingCycles = Math.floor(pElapsedMs / (pIntervalMins * 60000));

            if (pPendingCycles < 1) {
                // Skip package - No ROI is pending yet, zero database load!
                continue;
            }

            const success = await processPackageROI(p, settings);
            if (success) {
                processedCount++;
                console.log(`[ROI_API] Processed User: ${rawUserId} (Package: ${p.$id})`);
            }
        }

        res.json({ 
            success: true, 
            message: processedCount > 0 ? `ROI Distributed for ${processedCount} nodes` : 'Check again in 1 minute. ROI will credit automatically.'
        });
    } catch (error: any) {
        console.error("[ROI_API_ERR]", error);
        res.status(500).json({ success: false, message: error.message });
    }
});


// Save/Update Package (Admin)
app.post('/api/admin/save-package', verifyAdmin, async (req, res) => {
    const { pkg } = req.body;
    try {
        const id = pkg.id || pkg.$id;
        const payload: any = {
            name: String(pkg.name || ""),
            price: Number(pkg.price || 0),
            daily_roi: Number(pkg.daily_roi || 0),
            duration_days: Number(pkg.duration_days ?? 365),
            is_active: pkg.is_active ?? true,
            roi_interval_minutes: Number(pkg.roi_interval_minutes ?? 1440),
            max_roi_percent: Number(pkg.max_roi_percent ?? 200),
            direct_income_percent: Number(pkg.direct_income_percent ?? 0),
            matrix_income_percent: Number(pkg.matrix_income_percent ?? 0),
            level_income_percents: JSON.stringify(Array.isArray(pkg.level_income_percents) 
                ? pkg.level_income_percents.map(num => Number(num ?? 0)) 
                : [0,0,0,0,0,0,0,0,0,0])
        };

        console.log(`[Admin] Saving package: ${id}`, payload);

        // Standardize: If ID exists and doesn't look like an auto-generated local temp ID
        // Note: New packages in UI use pkg_${Date.now()}
        const isNew = !id || id.startsWith('pkg_');

        if (!isNew) {
            try {
                // Try Update First
                await databases.updateDocument(databaseId, collections.packages, id, payload);
                console.log(`[Admin] Package ${id} updated.`);

                // NEW: Retroactive update for active user_packages
                (async () => {
                    try {
                        console.log(`[Admin] Initiating retroactive limit update for pkg type ${id}...`);
                        const activePurchased = await databases.listDocuments(databaseId, collections.user_packages, [
                            Query.equal('package_id', [id]),
                            Query.equal('is_active', [true]),
                            Query.limit(5000)
                        ]);

                        for (const up of activePurchased.documents) {
                            if (Number(up.max_roi_percent) !== payload.max_roi_percent) {
                                await databases.updateDocument(databaseId, collections.user_packages, up.$id, {
                                    max_roi_percent: payload.max_roi_percent
                                });
                            }
                        }
                        console.log(`[Admin] Retroactive update finished for ${activePurchased.documents.length} packages.`);
                    } catch (retroErr: any) {
                        console.error("[Admin] Retroactive update failed:", retroErr.message);
                    }
                })();

                res.json({ success: true, message: 'Package updated successfully', id });
            } catch (e: any) {
                const errMsg = e.message || "";
                console.error(`[Admin] Update package error for ${id}:`, errMsg);

                if (errMsg.toUpperCase().includes('UNKNOWN_ATTRIBUTE') || errMsg.toUpperCase().includes('ROI_INTERVAL_MINUTES')) {
                    console.warn(`[Admin] Critical: Appwrite does not fully recognize 'roi_interval_minutes'. Sync error.`);
                    const fallback = { ...payload }; delete fallback.roi_interval_minutes;
                    await databases.updateDocument(databaseId, collections.packages, id, fallback);
                    return res.json({ success: true, message: 'Updated with warnings. Check column name in Appwrite console.' });
                }
                // If document does not exist, Create it with that ID
                if (e.code === 404) {
                    console.log(`[Admin] Package ${id} not found for update, creating...`);
                    try {
                        await databases.createDocument(databaseId, collections.packages, id, payload);
                        res.json({ success: true, message: 'Package created (with custom ID)', id });
                    } catch (cE: any) {
                        if (cE.message?.includes('UNKNOWN_ATTRIBUTE')) {
                            const fallback = { ...payload }; delete fallback.roi_interval_minutes;
                            await databases.createDocument(databaseId, collections.packages, id, fallback);
                            return res.json({ success: true, message: 'Created with warnings. Add attribute.' });
                        }
                        throw cE;
                    }
                } else {
                    console.error(`[Admin] Update package ${id} failed:`, e);
                    throw e;
                }
            }
        } else {
            // Create New
            console.log(`[Admin] Creating brand new package...`);
            try {
                const newDoc = await databases.createDocument(databaseId, collections.packages, ID.unique(), payload);
                console.log(`[Admin] New package created: ${newDoc.$id}`);
                res.json({ success: true, message: 'Package created successfully', id: newDoc.$id });
            } catch (cE: any) {
                if (cE.message?.includes('UNKNOWN_ATTRIBUTE')) {
                    const fallback = { ...payload }; delete fallback.roi_interval_minutes;
                    const newDoc = await databases.createDocument(databaseId, collections.packages, ID.unique(), fallback);
                    return res.json({ success: true, message: 'Created with warnings. Add attribute.', id: newDoc.$id });
                }
                throw cE;
            }
        }
    } catch (error: any) {
        console.error("Package Save Error:", error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Server error saving package',
            error: error.response || error
        });
    }
});

// Delete Package (Admin)
app.post('/api/admin/delete-package', verifyAdmin, async (req, res) => {
    const { packageId } = req.body;
    console.log(`[Admin API] Attempting to delete package document. ID: ${packageId}`);
    try {
        if (!packageId) {
            console.error("[Admin API] Delete aborted: No packageId provided in body.");
            return res.status(400).json({ success: false, message: "Package ID is required" });
        }
        
        console.log(`[Admin API] Database: ${databaseId}, Collection: ${collections.packages}, Doc: ${packageId}`);
        await databases.deleteDocument(databaseId, collections.packages, packageId);
        
        console.log(`[Admin API] Deletion successful: ${packageId}`);
        res.json({ success: true, message: 'Package deleted successfully' });
    } catch (error: any) {
        console.error(`[Admin API] Deletion failed for ${packageId}:`, error);
        res.status(500).json({ success: false, message: `Database Error: ${error.message}` });
    }
});

// --- GLOBAL ROI CRON WORKER ---
// Optimized for 100k+ users with Parallel Batch Processing
let isROIBatchProcessing = false;

async function distributeGlobalROIWorker() {
    if (isROIBatchProcessing) {
        console.log(`[BG_CRON] Previous execution still active. Skipping...`);
        return;
    }

    isROIBatchProcessing = true;
    const startTime = Date.now();
    
    try {
        console.log(`[BG_CRON] Starting High-Scale ROI SCAN...`);
        const settings = await getServerSettings() as any;
        const now = new Date();
        
        let totalCount = 0;
        let totalDistributed = 0;
        let lastId = undefined;
        let hasMore = true;

        while (hasMore) {
            const queries = [
                Query.equal('is_active', true),
                Query.limit(100), // Process 100 at a time
                Query.orderAsc('$id')
            ];
            if (lastId) queries.push(Query.cursorAfter(lastId));

            const res = await databases.listDocuments(databaseId, collections.user_packages, queries);
            console.log(`[BG_CRON] Scanning page. Found ${res.documents.length} active nodes. Cursor: ${lastId || 'Start'}`);
            
            if (res.documents.length === 0) break;

            lastId = res.documents[res.documents.length - 1].$id;

            // CHUNKED PROCESSING: Avoid rate limits by processing small groups sequentially
            for (let i = 0; i < res.documents.length; i += 5) {
                const chunk = res.documents.slice(i, i + 5);
                await Promise.all(chunk.map(async (p: any) => {
                    try {
                        // Pre-flight check locally on the retrieved document to prevent unnecessary database reads
                        const pActivationTs = new Date(p.activated_at || p.$createdAt).getTime();
                        const pLastPaidTs = p.last_roi_at ? new Date(p.last_roi_at).getTime() : pActivationTs;
                        const pIntervalMins = Number(p.roi_interval_minutes || settings?.roi_interval_minutes || 1440);
                        const pElapsedMs = Date.now() - pLastPaidTs;
                        const pPendingCycles = Math.floor(pElapsedMs / (pIntervalMins * 60000));

                        if (pPendingCycles < 1) {
                            // Skip package - No ROI is pending yet, zero database load!
                            return;
                        }

                        const price = Number(p.price || 0);
                        const dailyPerc = Number(p.daily_roi || 0);
                        const cycleAmt = (price * dailyPerc / 100);
                        
                        const success = await processPackageROI(p, settings);
                        if (success) {
                            totalCount++;
                            totalDistributed += cycleAmt; 
                        }
                    } catch (pkgErr: any) {
                        console.error(`[BG_CRON_PKG_ERR] Node ${p?.$id}:`, pkgErr.message);
                    }
                }));
                // Small sleep between chunks to keep DB stable
                await new Promise(r => setTimeout(r, 100));
            }
            
            // Artificial delay to prevent DB pressure
            await new Promise(r => setTimeout(r, 500));
            
            if (res.documents.length < 100) hasMore = false;
        }

        console.log(`[BG_CRON] Scalable Done: ${totalCount} nodes | $${totalDistributed.toFixed(2)} | Time: ${((Date.now()-startTime)/1000).toFixed(1)}s`);
    } catch (error: any) {
        console.error("[BG_CRON_FATAL]", error.message);
    } finally {
        isROIBatchProcessing = false;
    }
}

async function startServer() {
    console.log('[Server] Starting server initialization...');
    try {
        // Vite middleware for development
        if (process.env.NODE_ENV !== 'production') {
            console.log('[Server] Initializing Vite middleware...');
            const vite = await createViteServer({
                server: { 
                    middlewareMode: true,
                    allowedHosts: [
                        'cryptospiral.online',
                        'www.cryptospiral.online',
                        '.cryptospiral.online',
                        'localhost',
                        '127.0.0.1',
                        '72.61.244.96'
                    ]
                },
                appType: 'spa',
            });
            app.use(vite.middlewares);
            console.log('[Server] Vite middleware initialized.');
        } else {
            console.log('[Server] Production mode: Serving static files.');
            const distPath = path.join(process.cwd(), 'dist');
            app.use(express.static(distPath));
            app.get('*', (req, res) => {
                res.sendFile(path.join(distPath, 'index.html'));
            });
        }

        // Listen on BOTH port 3000 and port 3005 for ultimate VPS compatibility (prevents Nginx 502/Bad Gateway)
        // If one port is already in use by another app, we gracefully ignore and bind to the available one.
        const portsToTry = [3000, 3005];
        if (process.env.PORT) {
            const envPort = parseInt(process.env.PORT);
            if (!portsToTry.includes(envPort)) {
                portsToTry.unshift(envPort);
            }
        }

        let atLeastOneBound = false;
        for (const portToTry of portsToTry) {
            const success = await new Promise((resolve) => {
                const s = app.listen(portToTry, '0.0.0.0', () => {
                    console.log(`[Server] Success! Running on http://0.0.0.0:${portToTry}`);
                    resolve(true);
                });
                s.on('error', (err: any) => {
                    console.warn(`[Server] Warning: Could not bind to port ${portToTry}: ${err.message}`);
                    resolve(false);
                });
            });
            if (success) {
                atLeastOneBound = true;
            }
        }

        if (atLeastOneBound) {
            // Start the Global ROI background worker (Optimized: runs every 10 minutes to significantly reduce server load)
            setInterval(() => {
                distributeGlobalROIWorker();
            }, 600000);
            
            // Initial run
            distributeGlobalROIWorker();
        } else {
            console.error(`[Server] CRITICAL: Could not bind to any of the ports: ${JSON.stringify(portsToTry)}`);
        }

        // Dedicated trigger route for Vercel Cron or Appwrite Cron (Secured)
        app.get('/api/system/massive-roi-trigger', async (req, res) => {
            const secret = req.headers['x-cron-secret'];
            const expectedSecret = process.env.CRON_SECRET || 'my_super_secret_123';

            if (secret !== expectedSecret) {
                return res.status(401).json({ success: false, message: "Unauthorized trigger" });
            }

            // Trigger as background task
            distributeGlobalROIWorker();
            res.json({ 
                success: true, 
                message: "ROI Distribution engine started.",
                note: "Parallel batching active."
            });
        });
    } catch (err: any) {
        console.error('[Server] CRITICAL: Failed to start server:', err);
    }
}

startServer();
