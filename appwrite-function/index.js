import { Client, Databases, ID, Query } from 'node-appwrite';

/**
 * Appwrite Function: Daily ROI Distribution
 * This function handles simple daily yield distribution.
 * 
 * IMPORTANT: Ensure the 'user_packages' collection has these attributes:
 * - last_roi_at (String, optional)
 * - roi_earned (Double/Number, optional, default 0)
 * - is_active (Boolean, default true)
 */
export default async ({ req, res, log, error }) => {
    const client = new Client();
    
    // Config
    const endpoint = 'https://sgp.cloud.appwrite.io/v1';
    const projectId = process.env.APPWRITE_PROJECT_ID;
    const apiKey = process.env.APPWRITE_API_KEY;
    const databaseId = process.env.APPWRITE_DATABASE_ID;

    if (!projectId || !apiKey || !databaseId) {
        return res.json({ success: false, message: 'Missing environment variables.' });
    }

    client.setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
    const db = new Databases(client);
    
    const col = {
        pkg: process.env.USER_PACKAGES_COLLECTION_ID || 'user_packages',
        wall: process.env.WALLETS_COLLECTION_ID || 'wallets',
        tx: process.env.TRANSACTIONS_COLLECTION_ID || 'transactions'
    };

    try {
        log('Starting Daily ROI...');
        const today = new Date().toISOString().split('T')[0];

        // 1. Fetch active packages
        let allPkgs = [];
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
            const list = await db.listDocuments(databaseId, col.pkg, [
                Query.equal('is_active', true),
                Query.limit(100),
                Query.offset(offset)
            ]);
            allPkgs = allPkgs.concat(list.documents);
            if (list.documents.length < 100) hasMore = false;
            offset += 100;
        }

        log(`Active packages: ${allPkgs.length}`);

        let count = 0;
        for (const pkg of allPkgs) {
            try {
                // STRICT LOCK: Skip if already done today
                if (pkg.last_roi_at === today) continue;

                const price = Number(pkg.price || 0);
                const dailyRate = Number(pkg.daily_roi || 0); // e.g. 0.2
                const maxPerc = Number(pkg.max_roi_percent || 200);
                const earned = Number(pkg.roi_earned || 0);

                let amt = Number(((price * dailyRate) / 100).toFixed(4));
                let isStillActive = true;

                if (maxPerc !== 0) {
                    const capLimit = (price * maxPerc) / 100;
                    if (earned >= capLimit) {
                        await db.updateDocument(databaseId, col.pkg, pkg.$id, { is_active: false });
                        continue;
                    }
                    if (earned + amt > capLimit) {
                        amt = Number((capLimit - earned).toFixed(4));
                    }
                    isStillActive = (earned + amt) < capLimit;
                }
                
                if (amt <= 0.0001) continue;

                // UPDATE PROGRESS (Lock it first)
                const newTotalEarned = Number((earned + amt).toFixed(4));
                await db.updateDocument(databaseId, col.pkg, pkg.$id, {
                    roi_earned: newTotalEarned,
                    last_roi_at: today,
                    is_active: isStillActive
                });

                // UPDATE WALLET
                const wRes = await db.listDocuments(databaseId, col.wall, [Query.equal('user_id', pkg.user_id)]);
                if (wRes.total > 0) {
                    const wallet = wRes.documents[0];
                    await db.updateDocument(databaseId, col.wall, wallet.$id, {
                        balance: Number((Number(wallet.balance) + amt).toFixed(4)),
                        total_earned: Number((Number(wallet.total_earned) + amt).toFixed(4))
                    });

                    // CREATE TRANSACTION
                    await db.createDocument(databaseId, col.tx, ID.unique(), {
                        user_id: pkg.user_id,
                        amount: Number(amt.toFixed(4)),
                        type: 'roi',
                        description: `Daily Node Yield (${price} USDT)`,
                        created_at: new Date().toISOString()
                    });
                }
                count++;
            } catch (err) {
                error(`Pkg ${pkg.$id} error: ${err.message}`);
            }
        }

        log(`Finished. Processed: ${count}`);
        return res.json({ success: true, processed: count });

    } catch (err) {
        error(`Fatal Error: ${err.message}`);
        return res.json({ success: false, message: err.message });
    }
};
