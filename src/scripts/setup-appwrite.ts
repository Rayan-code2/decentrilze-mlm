import { Client, Databases, ID, Permission, Role } from 'node-appwrite';
import * as dotenv from 'dotenv';

dotenv.config({ override: true });

const EP = process.env.VITE_APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1';
const PRJ = process.env.VITE_APPWRITE_PROJECT_ID || 'YOUR_PROJECT_ID';
const KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || 'mlm_spiral';

console.log('===================================================');
console.log('         MLM APPWRITE AUTO-SETUP UTILITY           ');
console.log('===================================================');
console.log(`[Config] Endpoint: ${EP}`);
console.log(`[Config] Project:  ${PRJ}`);
console.log(`[Config] Database: ${DB_ID}`);
console.log('===================================================');

if (PRJ === 'YOUR_PROJECT_ID' || !PRJ) {
    console.error('❌ ERROR: Appwrite Project ID (VITE_APPWRITE_PROJECT_ID) not specified in environment!');
    process.exit(1);
}

if (!KEY) {
    console.error('❌ ERROR: Appwrite Secret API Key (APPWRITE_API_KEY) not specified in environment!');
    console.error('Please generate an API Key in Appwrite Console > Project > Settings > API Keys');
    console.error('Make sure to assign Database, Collection, Attribute, Index, and User permissions.');
    process.exit(1);
}

const client = new Client()
    .setEndpoint(EP)
    .setProject(PRJ)
    .setKey(KEY);

const db = new Databases(client);

interface AttrDef {
    key: string;
    type: 'string' | 'integer' | 'float' | 'boolean';
    required: boolean;
    size?: number;
    defaultValue?: any;
}

interface IndexDef {
    key: string;
    type: 'key' | 'fulltext' | 'unique';
    attributes: string[];
}

interface CollectionDef {
    id: string;
    name: string;
    attributes: AttrDef[];
    indexes: IndexDef[];
}

const COLLECTIONS: CollectionDef[] = [
    {
        id: process.env.VITE_APPWRITE_USERS_COLLECTION_ID || 'users',
        name: 'Users',
        attributes: [
            { key: 'user_id', type: 'string', required: true, size: 255 },
            { key: 'email', type: 'string', required: true, size: 255 },
            { key: 'name', type: 'string', required: true, size: 255 },
            { key: 'node_id', type: 'string', required: false, size: 255 },
            { key: 'referred_by', type: 'string', required: false, size: 255 },
            { key: 'matrix_parent_id', type: 'string', required: false, size: 255 },
            { key: 'role', type: 'string', required: false, size: 50, defaultValue: 'user' },
            { key: 'is_active', type: 'boolean', required: false, defaultValue: false },
            { key: 'direct_count', type: 'integer', required: false, defaultValue: 0 },
            { key: 'created_at', type: 'string', required: false, size: 100 },
            { key: 'mobile', type: 'string', required: false, size: 50 },
            { key: 'is_qualified', type: 'boolean', required: false, defaultValue: false }
        ],
        indexes: [
            { key: 'idx_user_id', type: 'key', attributes: ['user_id'] },
            { key: 'idx_node_id', type: 'key', attributes: ['node_id'] },
            { key: 'idx_referred_by', type: 'key', attributes: ['referred_by'] },
            { key: 'idx_matrix_parent_id', type: 'key', attributes: ['matrix_parent_id'] },
            { key: 'idx_email', type: 'key', attributes: ['email'] },
            { key: 'idx_role', type: 'key', attributes: ['role'] }
        ]
    },
    {
        id: process.env.VITE_APPWRITE_WALLETS_COLLECTION_ID || 'wallets',
        name: 'Wallets',
        attributes: [
            { key: 'user_id', type: 'string', required: true, size: 255 },
            { key: 'balance', type: 'float', required: false, defaultValue: 0.0 },
            { key: 'total_earned', type: 'float', required: false, defaultValue: 0.0 },
            { key: 'total_withdrawn', type: 'float', required: false, defaultValue: 0.0 },
            { key: 'direct_income', type: 'float', required: false, defaultValue: 0.0 },
            { key: 'level_income', type: 'float', required: false, defaultValue: 0.0 },
            { key: 'pool_income', type: 'float', required: false, defaultValue: 0.0 },
            { key: 'roi_income', type: 'float', required: false, defaultValue: 0.0 },
            { key: 'wallet_roi_earned', type: 'float', required: false, defaultValue: 0.0 },
            { key: 'daily_package_roi', type: 'float', required: false, defaultValue: 0.0 },
            { key: 'last_roi_at', type: 'string', required: false, size: 100 }
        ],
        indexes: [
            { key: 'idx_user_id', type: 'key', attributes: ['user_id'] }
        ]
    },
    {
        id: process.env.VITE_APPWRITE_PACKAGES_COLLECTION_ID || 'packages',
        name: 'Packages Catalogue',
        attributes: [
            { key: 'name', type: 'string', required: true, size: 255 },
            { key: 'price', type: 'float', required: true },
            { key: 'daily_roi', type: 'float', required: false, defaultValue: 0.5 },
            { key: 'max_roi_percent', type: 'float', required: false, defaultValue: 200.0 },
            { key: 'direct_income_percent', type: 'float', required: false, defaultValue: 5.0 },
            { key: 'matrix_income_percent', type: 'float', required: false, defaultValue: 0.0 },
            { key: 'level_income_percents', type: 'string', required: false, size: 1000, defaultValue: '[]' },
            { key: 'duration_days', type: 'integer', required: false, defaultValue: 365 },
            { key: 'roi_interval_minutes', type: 'integer', required: false, defaultValue: 1440 },
            { key: 'is_active', type: 'boolean', required: false, defaultValue: true },
            { key: 'id', type: 'string', required: false, size: 255 }
        ],
        indexes: [
            { key: 'idx_pkg_id', type: 'key', attributes: ['id'] }
        ]
    },
    {
        id: process.env.VITE_APPWRITE_PURCHASES_COLLECTION_ID || 'user_packages',
        name: 'User Purchases (Licenses)',
        attributes: [
            { key: 'user_id', type: 'string', required: true, size: 255 },
            { key: 'package_id', type: 'string', required: true, size: 255 },
            { key: 'price', type: 'float', required: false, defaultValue: 0.0 },
            { key: 'daily_roi', type: 'float', required: false, defaultValue: 0.5 },
            { key: 'roi_earned', type: 'float', required: false, defaultValue: 0.0 },
            { key: 'max_roi_percent', type: 'float', required: false, defaultValue: 200.0 },
            { key: 'is_active', type: 'boolean', required: false, defaultValue: true },
            { key: 'duration_days', type: 'integer', required: false, defaultValue: 365 },
            { key: 'roi_interval_minutes', type: 'integer', required: false, defaultValue: 1440 },
            { key: 'activated_at', type: 'string', required: false, size: 100 },
            { key: 'last_roi_at', type: 'string', required: false, size: 100 }
        ],
        indexes: [
            { key: 'idx_user_id', type: 'key', attributes: ['user_id'] },
            { key: 'idx_is_active', type: 'key', attributes: ['is_active'] },
            { key: 'idx_package_id', type: 'key', attributes: ['package_id'] }
        ]
    },
    {
        id: process.env.VITE_APPWRITE_TRANSACTIONS_COLLECTION_ID || 'transactions',
        name: 'Transactions History',
        attributes: [
            { key: 'user_id', type: 'string', required: true, size: 255 },
            { key: 'amount', type: 'float', required: true },
            { key: 'type', type: 'string', required: false, size: 100, defaultValue: 'credit' },
            { key: 'description', type: 'string', required: false, size: 1000, defaultValue: '' },
            { key: 'from_user_id', type: 'string', required: false, size: 255, defaultValue: 'SYSTEM' },
            { key: 'income_level', type: 'integer', required: false, defaultValue: 0 },
            { key: 'created_at', type: 'string', required: false, size: 100 }
        ],
        indexes: [
            { key: 'idx_user_id', type: 'key', attributes: ['user_id'] }
        ]
    },
    {
        id: process.env.VITE_APPWRITE_EXCHANGER_REQUESTS_COLLECTION_ID || 'exchanger_requests',
        name: 'Deposit & Withdrawal Requests',
        attributes: [
            { key: 'user_id', type: 'string', required: false, size: 255, defaultValue: '' },
            { key: 'type', type: 'string', required: false, size: 50, defaultValue: 'deposit' },
            { key: 'amount', type: 'float', required: false, defaultValue: 0.0 },
            { key: 'status', type: 'string', required: false, size: 50, defaultValue: 'pending' },
            { key: 'address', type: 'string', required: false, size: 500, defaultValue: '' },
            { key: 'txid', type: 'string', required: false, size: 500, defaultValue: '' },
            { key: 'created_at', type: 'string', required: false, size: 100 }
        ],
        indexes: [
            { key: 'idx_user_id', type: 'key', attributes: ['user_id'] }
        ]
    },
    {
        id: process.env.VITE_APPWRITE_SETTINGS_COLLECTION_ID || 'settings',
        name: 'System Settings',
        attributes: [
            { key: 'min_deposit', type: 'float', required: false, defaultValue: 1.0 },
            { key: 'min_withdrawal', type: 'float', required: false, defaultValue: 1.0 },
            { key: 'deposit_fee', type: 'float', required: false, defaultValue: 0.0 },
            { key: 'withdrawal_fee', type: 'float', required: false, defaultValue: 5.0 },
            { key: 'roi_interval_minutes', type: 'integer', required: false, defaultValue: 1440 },
            { key: 'rank_rewards', type: 'string', required: false, size: 5000, defaultValue: '[]' },
            { key: 'withdrawal_tiers', type: 'string', required: false, size: 5000, defaultValue: '[]' },
            { key: 'spin_rewards', type: 'string', required: false, size: 5000, defaultValue: '[]' },
            { key: 'admin_address_trc20', type: 'string', required: false, size: 255, defaultValue: '' },
            { key: 'admin_address_bep20', type: 'string', required: false, size: 255, defaultValue: '' },
            { key: 'admin_address_erc20', type: 'string', required: false, size: 255, defaultValue: '' }
        ],
        indexes: []
    },
    {
        id: process.env.VITE_APPWRITE_GOLD_QUEUE_COLLECTION_ID || 'gold_queue',
        name: 'Boosting Gold Queue',
        attributes: [
            { key: 'user_id', type: 'string', required: true, size: 255 },
            { key: 'created_at', type: 'string', required: false, size: 100 },
            { key: 'completed', type: 'boolean', required: false, defaultValue: false },
            { key: 'amount', type: 'float', required: false, defaultValue: 20.0 },
            { key: 'status', type: 'string', required: false, size: 50, defaultValue: 'active' },
            { key: 'is_rebirth', type: 'boolean', required: false, defaultValue: false },
            { key: 'payout_at', type: 'string', required: false, size: 100, defaultValue: '' }
        ],
        indexes: [
            { key: 'idx_user_id', type: 'key', attributes: ['user_id'] }
        ]
    }
];

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForAttributeBuilds(collectionId: string) {
    console.log(`[Status] Waiting for attributes in ${collectionId} to settle...`);
    let retries = 30;
    while (retries > 0) {
        const progress = await db.listAttributes(DB_ID, collectionId);
        const processing = progress.attributes.filter(attr => attr.status !== 'available' && attr.status !== 'failed');
        if (processing.length === 0) {
            console.log(`[Status] All attributes in ${collectionId} are available!`);
            return;
        }
        console.log(`[Polling] ${processing.length} attributes still building... waiting 2s`);
        await sleep(2000);
        retries--;
    }
    console.warn(`[Warning] Attribs in ${collectionId} did not finalize in 60s, continuing anyway.`);
}

async function run() {
    try {
        // 1. Database level
        let dbExists = false;
        try {
            await db.get(DB_ID);
            console.log(`✅ [Database] Database '${DB_ID}' already exists.`);
            dbExists = true;
        } catch (err: any) {
            if (err.code === 404 || err.message?.includes('not found')) {
                console.log(`⏳ [Database] Database '${DB_ID}' not found. Creating database...`);
            } else {
                throw err;
            }
        }

        if (!dbExists) {
            try {
                await db.create(DB_ID, 'MLM Spiral Database');
                console.log(`✅ [Database] Database '${DB_ID}' created successfully!`);
            } catch (err: any) {
                console.error(`❌ [Database] Failed to create database '${DB_ID}':`, err.message);
                throw err;
            }
        }

        // 2. Loop collections
        for (const col of COLLECTIONS) {
            console.log('---------------------------------------------------');
            console.log(`⚙️ [Collection] Creating/Updating: ${col.id} (${col.name})`);
            
            let colExists = false;
            try {
                await db.getCollection(DB_ID, col.id);
                console.log(`  -> Collection '${col.id}' already exists.`);
                colExists = true;
            } catch (err: any) {
                if (err.code === 404 || err.message?.includes('not found')) {
                    // Create it
                } else {
                    console.error(`  -> Check failed for ${col.id}:`, err.message);
                    continue;
                }
            }

            if (!colExists) {
                try {
                    // Create collection with proper read/write/create/delete permissions for everyone
                    const collectionPermissions = [
                        Permission.read(Role.any()),
                        Permission.create(Role.any()),
                        Permission.update(Role.any()),
                        Permission.delete(Role.any())
                    ];
                    await db.createCollection(DB_ID, col.id, col.name, collectionPermissions);
                    console.log(`  -> Collection '${col.id}' created successfully!`);
                    // Delay to avoid Appwrite schema race
                    await sleep(1000);
                } catch (err: any) {
                    console.error(`  -> Failed to create Collection '${col.id}':`, err.message);
                    continue;
                }
            }

            // 3. Setup Attributes
            const attrResult = await db.listAttributes(DB_ID, col.id);
            const existingKeys = attrResult.attributes.map(a => a.key);

            for (const attr of col.attributes) {
                if (existingKeys.includes(attr.key)) {
                    console.log(`    -> Attribute '${attr.key}' already exists. Skipping.`);
                    continue;
                }

                try {
                    console.log(`    -> Creating attribute '${attr.key}' [${attr.type}] (Required: ${attr.required})`);
                    if (attr.type === 'string') {
                        await db.createStringAttribute(DB_ID, col.id, attr.key, attr.size || 255, attr.required, attr.defaultValue);
                    } else if (attr.type === 'integer') {
                        await db.createIntegerAttribute(DB_ID, col.id, attr.key, attr.required, undefined, undefined, attr.defaultValue);
                    } else if (attr.type === 'float') {
                        await db.createFloatAttribute(DB_ID, col.id, attr.key, attr.required, undefined, undefined, attr.defaultValue);
                    } else if (attr.type === 'boolean') {
                        await db.createBooleanAttribute(DB_ID, col.id, attr.key, attr.required, attr.defaultValue);
                    }
                    await sleep(300); // Small cooldown
                } catch (err: any) {
                    console.error(`    -> Attribute creation failed for '${attr.key}':`, err.message);
                }
            }

            // Waiting for attributes before creating indexes (Appwrite requires indexes to be built on existing available attributes)
            const createdAny = col.attributes.some(attr => !existingKeys.includes(attr.key));
            if (createdAny) {
                await waitForAttributeBuilds(col.id);
            }

            // 4. Setup Indexes
            if (col.indexes && col.indexes.length > 0) {
                const idxResult = await db.listIndexes(DB_ID, col.id);
                const existingIdxKeys = idxResult.indexes.map(i => i.key);

                for (const idx of col.indexes) {
                    if (existingIdxKeys.includes(idx.key)) {
                        console.log(`    -> Index '${idx.key}' already exists. Skipping.`);
                        continue;
                    }

                    try {
                        console.log(`    -> Creating index '${idx.key}' of type [${idx.type}] on ${JSON.stringify(idx.attributes)}`);
                        await db.createIndex(DB_ID, col.id, idx.key, idx.type as any, idx.attributes);
                        await sleep(300); // Small cooldown
                    } catch (err: any) {
                        console.error(`    -> Index creation failed for '${idx.key}':`, err.message);
                    }
                }
            }
        }

        console.log('===================================================');
        console.log('🎉 SUCCESS: All Collections, Attributes & Indexes Set Up!');
        console.log('Let\'s add initial catalogue settings...');
        console.log('===================================================');
        
        // 5. Seed initial packages & settings if missing
        try {
            const pkgColId = process.env.VITE_APPWRITE_PACKAGES_COLLECTION_ID || 'packages';
            const settingsColId = process.env.VITE_APPWRITE_SETTINGS_COLLECTION_ID || 'settings';
            
            // Check packages
            const existingPkgs = await db.listDocuments(DB_ID, pkgColId, []);
            if (existingPkgs.total === 0) {
                console.log('📦 Seeding default packages catalog...');
                const defaultPkgs = [
                    { id: 'node_20', name: '$20 Scaling Node', price: 20, daily_roi: 1.0, max_roi_percent: 200, direct_income_percent: 10, matrix_income_percent: 0, level_income_percents: JSON.stringify([5, 3, 2, 1, 1, 0.5, 0.5, 0.5, 0.5, 0.5]) },
                    { id: 'node_50', name: '$50 Active Node', price: 50, daily_roi: 1.2, max_roi_percent: 210, direct_income_percent: 10, matrix_income_percent: 0, level_income_percents: JSON.stringify([5, 3, 2, 1, 1, 0.5, 0.5, 0.5, 0.5, 0.5]) },
                    { id: 'node_100', name: '$100 Premium Node', price: 100, daily_roi: 1.5, max_roi_percent: 220, direct_income_percent: 12, matrix_income_percent: 0, level_income_percents: JSON.stringify([6, 4, 2, 1, 1, 0.5, 0.5, 0.5, 0.5, 0.5]) },
                ];

                for (const pkg of defaultPkgs) {
                    try {
                        await db.createDocument(DB_ID, pkgColId, pkg.id, pkg);
                        console.log(`  -> Seeded Package: ${pkg.name}`);
                    } catch (e: any) {
                        console.error(`  -> Failed seeding ${pkg.name}:`, e.message);
                    }
                }
            }

            // Check Settings
            const existingSettings = await db.listDocuments(DB_ID, settingsColId, []);
            if (existingSettings.total === 0) {
                console.log('⚙️ Seeding default settings...');
                const defaultSettings = {
                    min_deposit: 10.0,
                    min_withdrawal: 10.0,
                    deposit_fee: 0.0,
                    withdrawal_fee: 5.0,
                    roi_interval_minutes: 1440,
                    rank_rewards: '[]',
                    withdrawal_tiers: '[]',
                    spin_rewards: '[]',
                    admin_address_trc20: 'TLAdminTRC20AddressPlaceholder',
                    admin_address_bep20: '0xAdminBEP20AddressPlaceholder',
                    admin_address_erc20: '0xAdminERC20AddressPlaceholder'
                };

                try {
                    await db.createDocument(DB_ID, settingsColId, 'current_settings', defaultSettings);
                    console.log(`  -> Seeded system settings 'current_settings'`);
                } catch (e: any) {
                    console.error(`  -> Failed seeding settings:`, e.message);
                }
            }

        } catch (seedErr: any) {
            console.warn(`[Seed Warning] Non-blocking seeding error: ${seedErr.message}`);
        }

        console.log('===================================================');
        console.log('🚀 YOUR HOSTINGER INSTANCE IS READY!                ');
        console.log('===================================================');

    } catch (err: any) {
        console.error('❌ FATAL PROGRAM SETUP ERROR:', err.message || err);
        process.exit(1);
    }
}

run();
