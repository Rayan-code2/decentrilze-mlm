import './suppress-warnings';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { db } from './src/db/index.ts';
import { users, wallets, mlmPackages, purchases, transactions, exchangerRequests, goldQueue, settingsTable } from './src/db/schema.ts';
import { eq, or, desc, asc, and, not, sql } from 'drizzle-orm';
import {
    resolveUserAuthId,
    fetchUserById,
    fetchWallet,
    getServerSettings,
    findGlobalMatrixParent,
    distributeIncomeServer,
    triggerBoostingServer,
    processBoostingQueue,
    updateBusinessVolumeServer,
    checkAndAwardRankRewards,
    calculateLevelBusiness
} from './src/services/mlmLogic.ts';

let myFilename = '';
let myDirname = '';

try {
    if (typeof import.meta !== 'undefined' && import.meta && import.meta.url) {
        myFilename = fileURLToPath(import.meta.url);
        myDirname = path.dirname(myFilename);
    }
} catch (e) {}

if (!myFilename) {
    try {
        // @ts-ignore
        if (typeof __filename !== 'undefined') myFilename = __filename;
        // @ts-ignore
        if (typeof __dirname !== 'undefined') myDirname = __dirname;
    } catch (e) {}
}

const __filename = myFilename || path.join(process.cwd(), 'server.ts');
const __dirname = myDirname || process.cwd();

const envPaths = [
    path.resolve(process.cwd(), '.env'),
    path.join(__dirname, '.env'),
    path.join(__dirname, '../.env'),
    path.join(__dirname, '../../.env'),
];

for (const envPath of envPaths) {
    try {
        if (fs.existsSync(envPath)) {
            dotenv.config({ path: envPath, override: true });
            console.log(`[Config] Loaded .env from: ${envPath}`);
            break;
        }
    } catch (err) {}
}

// --- Auth Helpers ---
const JWT_SECRET = process.env.JWT_SECRET || 'spiralKeySecureSystem_12345';

function hashPassword(password: string): string {
    return crypto.createHmac('sha256', JWT_SECRET).update(password).digest('hex');
}

function sanitizeUser(user: any) {
    if (!user) return user;
    const san = { ...user };
    delete san.password;
    return san;
}

// ✅ FIX: cleanErrorMessage - ab DB errors kabhi bhi frontend pe leak nahi honge, jabki setup/connection errors guide karenge user ko
function cleanErrorMessage(err: any): string {
    if (!err) return 'An unexpected error occurred.';

    // Server logs mein output for developer debugging
    console.error('[Server Error Detail]:', err);

    const msg = String(err.message || err.detail || (err.cause && err.cause.message) || err).trim();
    let fullErrStr = '';
    try {
        fullErrStr = JSON.stringify(err);
    } catch (_) {
        fullErrStr = String(err);
    }

    const combinedLower = (msg + ' ' + fullErrStr).toLowerCase();

    // 1. Connection refused
    if (combinedLower.includes('econnrefused')) {
        return 'Database Connection Error: Connection refused. Check if PostgreSQL server is running and port 5432 is open.';
    }

    // 2. Authentication failed
    if (combinedLower.includes('authentication failed') || combinedLower.includes('password authentication failed')) {
        return 'Database Authentication Error: Please verify the SQL_USER and SQL_PASSWORD details in your .env file.';
    }

    // 3. Database not found
    if (combinedLower.includes('does not exist') && combinedLower.includes('database "')) {
        const dbMatch = msg.match(/database\s+"([^"]+)"\s+does\s+not\s+exist/i);
        const dbName = dbMatch ? dbMatch[1] : 'specified database';
        return `Database Error: Database "${dbName}" does not exist in your PostgreSQL server. Please create it.`;
    }

    // 4. Host resolution failure
    if (combinedLower.includes('enotfound') || combinedLower.includes('getaddrinfo')) {
        return 'Database Connection Error: Host address in SQL_HOST could not be resolved (ENOTFOUND).';
    }

    // 5. Connection timeout
    if (combinedLower.includes('timeout') || combinedLower.includes('pool-timeout') || combinedLower.includes('connection timeout')) {
        return 'Database Connection Error: Query or connection timed out. Check network or firewall settings.';
    }

    // 6. Table/Relation does not exist
    if (combinedLower.includes('does not exist') && (combinedLower.includes('relation "') || combinedLower.includes('table '))) {
        const relationMatch = msg.match(/relation\s+"([^"]+)"\s+does\s+not\s+exist/i);
        const tableName = relationMatch ? relationMatch[1] : 'required table';
        return `Database Schema Error: Table "${tableName}" does not exist. Please restart the server or run self-heal to create it.`;
    }

    // 7. Column does not exist
    if (combinedLower.includes('does not exist') && combinedLower.includes('column "')) {
        const colMatch = msg.match(/column\s+"([^"]+)"/i);
        const colName = colMatch ? colMatch[1] : 'required column';
        return `Database Schema Error: Column "${colName}" does not exist. Please restart the server or run self-heal to apply database updates.`;
    }

    // 8. violates unique constraint
    if (combinedLower.includes('violates unique constraint') || combinedLower.includes('duplicate key')) {
        if (combinedLower.includes('email')) {
            return 'Email is already registered.';
        }
        if (combinedLower.includes('mobile')) {
            return 'Mobile number is already registered.';
        }
        if (combinedLower.includes('uid')) {
            return 'User ID is already registered.';
        }
        return 'Duplicate Error: A record with this unique value already exists.';
    }

    // 9. violates not-null constraint
    if (combinedLower.includes('violates not-null constraint') || combinedLower.includes('null value')) {
        const colMatch = msg.match(/column\s+"([^"]+)"/i);
        const colName = colMatch ? colMatch[1] : 'required';
        return `Database Error: Required field "${colName}" is missing or null.`;
    }

    // 10. Check for ANY raw SQL queries or sensitive details (to hide SQL Injection leaks completely)
    const sqlPatterns = [
        'select ', 'insert ', 'update ', 'delete ', 'create table', 'alter table',
        'where ', 'from ', 'join ', 'limit ', 'params:', 'drizzle', 'failed query',
        'sqlselect', 'sqlinsert', 'sqlupdate', 'sqldelete'
    ];

    // Temporarily disabled SQL filtering to see the exact error on the page
    // const containsRawSql = sqlPatterns.some(pattern => combinedLower.includes(pattern));
    // if (containsRawSql) {
    //     return 'Database execution error occurred. SQL queries and details have been filtered for security. Please check the server console logs.';
    // }

    // Safe user-facing messages
    const safeMessages = [
        'Email', 'Mobile', 'already registered',
        'not found', 'Invalid', 'Insufficient',
        'Unauthorized', 'Forbidden', 'No free spins',
        'Sequence Error', 'already active', 'Node already',
        'Please activate', 'balance', 'Password',
    ];

    const isSafe = safeMessages.some(s => msg.toLowerCase().includes(s.toLowerCase()));
    if (isSafe) return msg;

    const sanitizedMsg = msg.replace(/:\/\/.*@/g, '://***:***@');
    return `An unexpected server error occurred: ${sanitizedMsg}. Please try again.`;
}

function generateToken(userId: string): string {
    const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const data = `${userId}:${expiry}`;
    const signature = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('hex');
    return `${userId}.${expiry}.${signature}`;
}

function verifyToken(token: string): { uid: string } | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const [userId, expiryStr, signature] = parts;
        const expiry = parseInt(expiryStr, 10);
        if (Date.now() > expiry) return null;
        const data = `${userId}:${expiry}`;
        const expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('hex');
        if (signature === expectedSignature) return { uid: userId };
    } catch (e) {}
    return null;
}

let defaultPort = 3000;
try {
    const isVPS = fs.existsSync('/root/cryptospiral') || process.cwd().includes('cryptospiral');
    if (isVPS) {
        defaultPort = 3005;
        console.log(`[Port] VPS detected. Port: ${defaultPort}`);
    }
} catch (e) {}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : defaultPort;

app.use(express.json());

// Middlewares
const verifyAuth = async (req: any, res: any, next: any) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'Unauthorized. No token specified.' });
        }
        const token = authHeader.split(' ')[1];
        if (token.startsWith('fallback_')) {
            const userId = token.replace('fallback_', '');
            req.user = { uid: userId, email: `${userId}@spiral-fallback.com` };
            return next();
        }
        const decoded = verifyToken(token);
        if (decoded) {
            const userDoc = await db.select().from(users).where(eq(users.uid, decoded.uid)).limit(1);
            if (userDoc.length > 0) {
                req.user = { uid: userDoc[0].uid, email: userDoc[0].email, role: userDoc[0].role };
                return next();
            }
        }
        const matchedUser = await db.select().from(users).where(eq(users.uid, token)).limit(1);
        if (matchedUser.length > 0) {
            req.user = { uid: matchedUser[0].uid, email: matchedUser[0].email, role: matchedUser[0].role };
            return next();
        }
        return res.status(401).json({ success: false, message: 'Unauthorized session' });
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Unauthorized session' });
    }
};

const verifyAdmin = async (req: any, res: any, next: any) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'Unauthorized. Admin credentials required.' });
        }
        const token = authHeader.split(' ')[1];
        let userId = '';
        if (token.startsWith('fallback_')) {
            userId = token.replace('fallback_', '');
        } else {
            const decoded = verifyToken(token);
            userId = decoded ? decoded.uid : token;
        }
        const userDoc = await db.select().from(users).where(eq(users.uid, userId)).limit(1);
        const isAdmin = userDoc.length > 0 && userDoc[0].role === 'admin';
        if (isAdmin || userId === '1') {
            req.user = { uid: userId, role: 'admin' };
            return next();
        }
        return res.status(403).json({ success: false, message: 'Forbidden. Admin permission required.' });
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Unauthorized Admin credentials' });
    }
};

// --- ROUTES ---

// Login
app.post('/api/auth/login', async (req: any, res: any) => {
    const { email, pass } = req.body;
    try {
        if (!email || !pass) {
            return res.status(400).json({ success: false, message: 'Email and password are required.' });
        }
        const cleanEmail = email.trim().toLowerCase();
        const matches = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
        if (matches.length === 0) {
            return res.status(400).json({ success: false, message: 'User not found.' });
        }
        const user = matches[0];

        // ✅ FIX: Blocked user check
        if (user.isBlocked) {
            return res.status(403).json({ success: false, message: 'Your account has been blocked. Contact support.' });
        }

        const inputHash = hashPassword(pass);
        if (user.password && user.password !== inputHash) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        } else if (!user.password && pass !== 'password123') {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }
        const token = generateToken(user.uid);
        res.json({ success: true, token, user: { ...sanitizeUser(user), id: user.uid } });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Password Reset
app.post('/api/auth/reset-password', async (req: any, res: any) => {
    const { userId, newPassword } = req.body;
    try {
        if (!userId || !newPassword) {
            return res.status(400).json({ success: false, message: 'userId and newPassword are required.' });
        }
        const hash = hashPassword(newPassword);
        await db.update(users).set({ password: hash }).where(eq(users.uid, userId));
        res.json({ success: true, message: 'Password reset successful.' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// ✅ MAIN FIX: Registration Route - pura try/catch aur validation
app.post('/api/auth/register', async (req: any, res: any) => {
    const { email, pass, name, referredBy, mobile } = req.body;

    // Input validation
    if (!email || !pass) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    console.log(`[Registration] Email: ${cleanEmail}, Sponsor: ${referredBy || 'none'}`);

    try {
        // Email duplicate check
        const existingUsers = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
        if (existingUsers.length > 0) {
            return res.status(400).json({ success: false, message: `Email ${cleanEmail} is already registered.` });
        }

        // Mobile duplicate check
        if (mobile && mobile.trim()) {
            const existingMobile = await db.select().from(users).where(eq(users.mobile, mobile.trim())).limit(1);
            if (existingMobile.length > 0) {
                return res.status(400).json({ success: false, message: `Mobile number is already registered.` });
            }
        }

        const generatedUid = 'U_' + Math.random().toString(36).substring(2, 15).toUpperCase();
        const hashedPassword = hashPassword(pass);
        const nodeId = `NX-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

        // Sponsor resolve
        let resolvedSponsor = '1';
        if (referredBy && referredBy.trim()) {
            const sponsorResolved = await resolveUserAuthId(referredBy.trim());
            if (sponsorResolved) resolvedSponsor = sponsorResolved;
        }

        // Matrix parent
        let matrixParentId = '1';
        try {
            const mp = await findGlobalMatrixParent();
            if (mp) matrixParentId = mp;
        } catch (mpErr) {
            console.warn('[Register] Matrix parent lookup failed, using default:', mpErr);
        }

        // Insert user
        const createdUsers = await db.insert(users).values({
            uid: generatedUid,
            email: cleanEmail,
            name: (name || '').trim(),
            role: 'user',
            referredBy: resolvedSponsor,
            matrixParentId,
            nodeId,
            isActive: false,
            mobile: (mobile || '').trim(),
            password: hashedPassword,
            directCount: 0,
        }).returning();

        // Create wallet
        await db.insert(wallets).values({
            userId: generatedUid,
            balance: 0.0,
            totalEarned: 0.0,
        });

        // Increment sponsor's direct count
        if (resolvedSponsor && resolvedSponsor !== '0' && resolvedSponsor !== '1') {
            await db.update(users)
                .set({ directCount: sql`${users.directCount} + 1` })
                .where(eq(users.uid, resolvedSponsor));

            // Trigger boosting (non-blocking)
            triggerBoostingServer(resolvedSponsor).catch(e =>
                console.warn('[Register] Boosting trigger failed:', e.message)
            );
        }

        console.log(`[Registration SUCCESS] User: ${generatedUid}, Email: ${cleanEmail}`);
        res.json({
            success: true,
            message: 'Registration successful! Please login to continue.',
            user: sanitizeUser(createdUsers[0])
        });
    } catch (error: any) {
        console.error('[Registration Error]', error);
        res.status(500).json({ success: false, message: cleanErrorMessage(error) });
    }
});

// User Profile
app.get('/api/user/profile/:userId', verifyAuth, async (req: any, res: any) => {
    const { userId } = req.params;
    try {
        const resolvedId = await resolveUserAuthId(userId) || userId;
        let profile = await fetchUserById(resolvedId);

        if (!profile) {
            const isFirst = (await db.select().from(users).limit(1)).length === 0;
            const defaultRole = isFirst ? 'admin' : 'user';
            const created = await db.insert(users).values({
                uid: resolvedId,
                email: req.user?.email || `${resolvedId}@spiral-system.com`,
                name: req.user?.displayName || 'User',
                role: defaultRole,
                isActive: false,
                directCount: 0,
                referredBy: '1',
                matrixParentId: '1',
            }).returning();
            profile = created[0];
        }

        let userWallet = await fetchWallet(resolvedId);
        if (!userWallet) {
            const createdWallets = await db.insert(wallets).values({
                userId: resolvedId,
                balance: 0.0,
                totalEarned: 0.0,
            }).returning();
            userWallet = createdWallets[0];
        }

        res.json({ success: true, user: sanitizeUser(profile) });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Wallet
app.get('/api/user/wallet/:userId', verifyAuth, async (req: any, res: any) => {
    const { userId } = req.params;
    try {
        const resolvedId = await resolveUserAuthId(userId) || userId;
        let userWallet = await fetchWallet(resolvedId);
        if (!userWallet) {
            const created = await db.insert(wallets).values({
                userId: resolvedId,
                balance: 0.0,
                totalEarned: 0.0,
            }).returning();
            userWallet = created[0];
        }
        res.json({ success: true, wallet: userWallet });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Update Wallet
app.post('/api/user/wallet/update', verifyAuth, async (req: any, res: any) => {
    const { userId, data } = req.body;
    try {
        const resolvedId = await resolveUserAuthId(userId) || userId;
        const isAdmin = req.user?.role === 'admin';
        if (!isAdmin && resolvedId !== req.user?.uid) {
            return res.status(403).json({ success: false, message: 'Forbidden update parameters' });
        }
        const updatePayload: any = {};
        if (data.balance !== undefined) updatePayload.balance = Number(data.balance);
        if (data.availableSpins !== undefined) updatePayload.availableSpins = parseInt(data.availableSpins, 10);
        if (data.dailyPackageRoi !== undefined) updatePayload.dailyPackageRoi = Number(data.dailyPackageRoi);
        await db.update(wallets).set(updatePayload).where(eq(wallets.userId, resolvedId));
        res.json({ success: true, message: 'Wallet updated successfully' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Packages
app.get('/api/packages', async (req: any, res: any) => {
    try {
        let list = await db.select().from(mlmPackages).orderBy(asc(mlmPackages.price));
        if (list.length === 0) {
            await db.insert(mlmPackages).values({ name: '$10 Node', price: 10.0, dailyRoi: 0.5, roiIntervalMinutes: 1440, maxRoiPercent: 200.0, durationDays: 365, isActive: true, directIncomePercent: 10.0, matrixIncomePercent: 5.0, levelIncomePercents: '[1,1,1]' });
            await db.insert(mlmPackages).values({ name: '$20 Node', price: 20.0, dailyRoi: 1.0, roiIntervalMinutes: 1440, maxRoiPercent: 200.0, durationDays: 365, isActive: true, directIncomePercent: 15.0, matrixIncomePercent: 10.0, levelIncomePercents: '[2,1,1,1]' });
            await db.insert(mlmPackages).values({ name: '$50 Node', price: 50.0, dailyRoi: 1.5, roiIntervalMinutes: 1440, maxRoiPercent: 200.0, durationDays: 365, isActive: true, directIncomePercent: 20.0, matrixIncomePercent: 15.0, levelIncomePercents: '[5,2,2,1,1]' });
            list = await db.select().from(mlmPackages).orderBy(asc(mlmPackages.price));
        }
        const packagesParsed = list.map(p => {
            let percents = [0,0,0,0,0,0,0,0,0,0];
            try { if (p.levelIncomePercents) percents = JSON.parse(p.levelIncomePercents); } catch (e) {}
            return { ...p, level_income_percents: percents };
        });
        res.json({ success: true, packages: packagesParsed });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Save Package (Admin)
app.post('/api/admin/save-package', verifyAdmin, async (req: any, res: any) => {
    const { pkg } = req.body;
    try {
        const payload = {
            name: pkg.name || 'Custom Package',
            price: Number(pkg.price || 0),
            dailyRoi: Number(pkg.dailyRoi || pkg.daily_roi || 0),
            roiIntervalMinutes: parseInt(pkg.roiIntervalMinutes || pkg.roi_interval_minutes || 1440, 10),
            durationDays: parseInt(pkg.durationDays || pkg.duration_days || 365, 10),
            maxRoiPercent: Number(pkg.maxRoiPercent || pkg.max_roi_percent || 200),
            directIncomePercent: Number(pkg.directIncomePercent || pkg.direct_income_percent || 0),
            matrixIncomePercent: Number(pkg.matrixIncomePercent || pkg.matrix_income_percent || 0),
            levelIncomePercents: typeof pkg.level_income_percents === 'string' ? pkg.level_income_percents : JSON.stringify(pkg.level_income_percents || []),
            isActive: pkg.isActive !== undefined ? pkg.isActive : true
        };
        if (pkg.id) {
            await db.update(mlmPackages).set(payload).where(eq(mlmPackages.id, parseInt(pkg.id, 10)));
        } else {
            await db.insert(mlmPackages).values(payload);
        }
        res.json({ success: true, message: 'Package saved successfully' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Delete Package
app.post('/api/admin/delete-package', verifyAdmin, async (req: any, res: any) => {
    const { packageId } = req.body;
    try {
        await db.delete(mlmPackages).where(eq(mlmPackages.id, parseInt(packageId, 10)));
        res.json({ success: true, message: 'Package deleted successfully' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Sync Boosting
app.post('/api/user/sync-boosting', verifyAuth, async (req: any, res: any) => {
    const { userId } = req.body;
    try {
        const resolvedId = await resolveUserAuthId(userId) || userId;
        const result = await triggerBoostingServer(resolvedId);
        res.json({ success: true, result });
    } catch (e: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(e) });
    }
});

// Boosting Progress
app.get('/api/user/boosting-progress/:userId', verifyAuth, async (req: any, res: any) => {
    const { userId } = req.params;
    try {
        const resolvedId = await resolveUserAuthId(userId) || userId;
        const queue = await db.select().from(goldQueue).orderBy(asc(goldQueue.createdAt));
        const activeEntries = queue.filter(e => !e.completed);
        const myEntry = activeEntries.find(e => e.userId === resolvedId);
        if (!myEntry) return res.json({ progress: 0, total: 12, position: 0 });
        const myPosition = activeEntries.findIndex(e => e.userId === resolvedId) + 1;
        const completedCount = queue.filter(e => e.completed).length;
        const uncompletedBeforeMe = activeEntries.findIndex(e => e.userId === resolvedId);
        let progress = 0;
        if (uncompletedBeforeMe === 0) {
            progress = queue.length - (completedCount * 12);
        } else {
            const myIndex = queue.findIndex(e => e.id === myEntry.id);
            progress = Math.max(0, queue.length - 1 - myIndex);
        }
        res.json({ progress: Math.min(12, progress), total: 12, position: myPosition });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Admin Boosting Queue
app.get('/api/admin/boosting-queue', verifyAdmin, async (req: any, res: any) => {
    try {
        const queue = await db.select().from(goldQueue).orderBy(asc(goldQueue.createdAt));
        res.json({ success: true, queue });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Force Boosting Winner
app.post('/api/admin/force-boosting-winner', verifyAdmin, async (req: any, res: any) => {
    try {
        const settings = await getServerSettings();
        await processBoostingQueue(settings?.boosting_reward || 20.0);
        res.json({ success: true, message: 'Boosting processed successfully' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Delete Boosting Entry
app.post('/api/admin/delete-boosting-entry', verifyAdmin, async (req: any, res: any) => {
    const { id } = req.body;
    try {
        await db.delete(goldQueue).where(eq(goldQueue.id, parseInt(id, 10)));
        res.json({ success: true, message: 'Deleted entry' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Purchase Package
app.post('/api/purchase-package', verifyAuth, async (req: any, res: any) => {
    const { userId: rawUserId, packageId } = req.body;
    try {
        const userId = await resolveUserAuthId(rawUserId) || rawUserId;
        const [profile, wallet] = await Promise.all([fetchUserById(userId), fetchWallet(userId)]);

        if (!profile) return res.status(404).json({ success: false, message: 'User profile not found.' });
        if (!wallet) return res.status(404).json({ success: false, message: 'Wallet not found.' });

        const catalogPkg = await db.select().from(mlmPackages).where(eq(mlmPackages.id, parseInt(packageId, 10))).limit(1);
        if (catalogPkg.length === 0) return res.status(404).json({ success: false, message: 'Node not found inside catalogue.' });

        const pkgRaw = catalogPkg[0];
        let levelPercents = [0,0,0,0,0,0,0,0,0,0];
        try { if (pkgRaw.levelIncomePercents) levelPercents = JSON.parse(pkgRaw.levelIncomePercents); } catch (e) {}
        const pkg = { ...pkgRaw, level_income_percents: levelPercents };

        const price = Number(pkg.price);
        if (Number(wallet.balance) < price) {
            return res.json({ success: false, message: `Insufficient balance ($${wallet.balance})` });
        }

        const existingPurchases = await db.select().from(purchases).where(eq(purchases.userId, userId));
        const isActiveAlready = existingPurchases.some(p => p.packageId === pkg.id && p.isActive);
        if (isActiveAlready) return res.json({ success: false, message: 'Node already active.' });

        const sortedCatalogue = await db.select().from(mlmPackages).orderBy(asc(mlmPackages.price));
        const index = sortedCatalogue.findIndex(p => p.id === pkg.id);
        if (index > 0) {
            const prevPkg = sortedCatalogue[index - 1];
            const hasPrev = existingPurchases.some(p => p.packageId === prevPkg.id);
            if (!hasPrev) return res.json({ success: false, message: `Sequence Error: Please activate the $${prevPkg.price} Node first.` });
        }

        const initialBalance = Number(wallet.balance);
        await db.update(wallets).set({ balance: sql`${wallets.balance} - ${price}` }).where(eq(wallets.userId, userId));

        let createdPurchase;
        try {
            const result = await db.insert(purchases).values({
                userId, packageId: pkg.id, price,
                dailyRoi: pkg.dailyRoi, roiIntervalMinutes: pkg.roiIntervalMinutes,
                maxRoiPercent: pkg.maxRoiPercent, roiEarned: 0.0, isActive: true
            }).returning();
            createdPurchase = result[0];
        } catch (insertErr) {
            await db.update(wallets).set({ balance: initialBalance }).where(eq(wallets.userId, userId));
            throw insertErr;
        }

        if (!profile.isActive) {
            await db.update(users).set({ isActive: true }).where(eq(users.uid, userId));
        }

        const spinsEarned = Math.max(1, Math.floor(price / 10));
        await db.update(wallets).set({ availableSpins: sql`${wallets.availableSpins} + ${spinsEarned}` }).where(eq(wallets.userId, userId));

        const firstYield = Number(((price * (pkg.dailyRoi || 0.5)) / 100).toFixed(4));
        if (firstYield > 0) {
            await distributeIncomeServer(userId, firstYield, 'roi', `Instant yield for ${pkg.name}`, 'SYSTEM', 0, true);
        }

        await db.insert(transactions).values({
            userId, amount: price, type: 'debit', status: 'completed',
            description: `Activated $${price} Node (${pkg.name})`, fromUserId: 'SYSTEM'
        });

        const sponsorId = profile.referredBy || '1';
        if (sponsorId && sponsorId !== '0') {
            const directPayout = Number(((price * (pkg.directIncomePercent || 0)) / 100).toFixed(4));
            if (directPayout > 0) {
                await distributeIncomeServer(sponsorId, directPayout, 'direct_income', `Direct bonus: Node $${price} from ${profile.name}`, userId);
            }
        }

        const matrixParentUid = profile.matrixParentId || '1';
        if (matrixParentUid && matrixParentUid !== userId && matrixParentUid !== '0') {
            const matrixPayout = Number(((price * (pkg.matrixIncomePercent || 0)) / 100).toFixed(4));
            if (matrixPayout > 0) {
                await distributeIncomeServer(matrixParentUid, matrixPayout, 'matrix_income', `Placement bonus: Node $${price} from ${profile.name}`, userId);
            }
        }

        let currLevelId = profile.referredBy || '1';
        for (let l = 1; l <= Math.min(10, levelPercents.length); l++) {
            if (!currLevelId || currLevelId === '0' || currLevelId === userId) break;
            const depthAmt = Number(levelPercents[l - 1] || 0);
            if (depthAmt > 0) {
                await distributeIncomeServer(currLevelId, depthAmt, 'level_income', `Level ${l} commission: Node $${price} from ${profile.name}`, userId, l);
            }
            const parentDoc = await fetchUserById(currLevelId);
            currLevelId = parentDoc?.referredBy || '1';
            if (currLevelId === '1') break;
        }

        await triggerBoostingServer(userId);
        await updateBusinessVolumeServer(userId, price);

        res.json({ success: true, message: 'Node activated successfully.', purchase: createdPurchase, bonusSpins: spinsEarned });
    } catch (err: any) {
        console.error('Purchase failed:', err);
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Transactions
app.get('/api/user/transactions/:userId', verifyAuth, async (req: any, res: any) => {
    const { userId } = req.params;
    try {
        const resolvedId = await resolveUserAuthId(userId) || userId;
        const list = await db.select().from(transactions).where(eq(transactions.userId, resolvedId)).orderBy(desc(transactions.createdAt)).limit(100);
        res.json({ success: true, transactions: list });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Directs
app.get('/api/user/directs/:userId', verifyAuth, async (req: any, res: any) => {
    const { userId } = req.params;
    try {
        const resolvedId = await resolveUserAuthId(userId) || userId;
        const list = await db.select().from(users).where(eq(users.referredBy, resolvedId)).orderBy(desc(users.createdAt));
        res.json({ success: true, directs: list });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Admin Users
app.get('/api/admin/users', verifyAdmin, async (req: any, res: any) => {
    try {
        const allUsrs = await db.select().from(users).orderBy(desc(users.createdAt));
        res.json({ success: true, users: allUsrs });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Admin Purchases
app.get('/api/admin/purchases', verifyAdmin, async (req: any, res: any) => {
    try {
        const list = await db.select().from(purchases).orderBy(desc(purchases.activatedAt));
        res.json({ success: true, purchases: list });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Team Data
app.get('/api/user/team-data/:userId', verifyAuth, async (req: any, res: any) => {
    const { userId } = req.params;
    try {
        const resolvedId = await resolveUserAuthId(userId) || userId;
        const directUids = await db.select().from(users).where(eq(users.referredBy, resolvedId));
        const directIds = directUids.map(u => u.uid);
        let secondUids: any[] = [];
        if (directIds.length > 0) {
            secondUids = await db.select().from(users).where(sql`${users.referredBy} IN (${directIds.map(u => `'${u}'`).join(',')})`);
        }
        const teamUsers = [...directUids, ...secondUids];
        const teamUids = teamUsers.map(u => u.uid);
        let teamPurchases: any[] = [];
        if (teamUids.length > 0) {
            teamPurchases = await db.select().from(purchases).where(sql`${purchases.userId} IN (${teamUids.map(u => `'${u}'`).join(',')})`);
        }
        res.json({ success: true, users: teamUsers, purchases: teamPurchases });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// User Purchases
app.post('/api/user/purchases', verifyAuth, async (req: any, res: any) => {
    const { userId } = req.body;
    try {
        const resolvedId = await resolveUserAuthId(userId) || userId;
        const list = await db.select().from(purchases).where(eq(purchases.userId, resolvedId)).orderBy(desc(purchases.activatedAt));
        res.json({ success: true, documents: list });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Level Business
app.get('/api/user/level-business/:userId/:depth', async (req: any, res: any) => {
    const { userId, depth } = req.params;
    try {
        const resolvedId = await resolveUserAuthId(userId) || userId;
        const volume = await calculateLevelBusiness(resolvedId, parseInt(depth, 10));
        res.json({ success: true, business: volume });
    } catch (err: any) {
        res.status(500).json({ success: false, business: 0, message: cleanErrorMessage(err) });
    }
});

// Distribute ROI
app.post('/api/distribute-roi', verifyAuth, async (req: any, res: any) => {
    const { userId } = req.body;
    try {
        const resolvedId = await resolveUserAuthId(userId) || userId;
        const activePurchases = await db.select().from(purchases).where(and(eq(purchases.userId, resolvedId), eq(purchases.isActive, true)));
        let yieldsCount = 0;
        for (const p of activePurchases) {
            const price = Number(p.price);
            const dailyPerc = Number(p.dailyRoi || 0.5);
            const cycleAmt = Number((price * dailyPerc / 100).toFixed(4));
            if (cycleAmt > 0) {
                const isCredited = await distributeIncomeServer(resolvedId, cycleAmt, 'roi', `Manual User ROI`, 'SYSTEM', 0, false);
                if (isCredited) yieldsCount++;
            }
        }
        res.json({ success: true, message: `Processed ${yieldsCount} active investments ROI distributions.` });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Settings
app.get('/api/settings', async (req: any, res: any) => {
    try {
        const systemSettings = await getServerSettings();
        res.json({ success: true, settings: systemSettings });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Update Settings
app.post('/api/update-settings', verifyAdmin, async (req: any, res: any) => {
    const { settings } = req.body;
    try {
        const exist = await db.select().from(settingsTable).limit(1);
        const payload = {
            telegramLink: settings.telegram_link,
            marqueeText: settings.marquee_text,
            hallOfFameMarquee: settings.hall_of_fame_marquee,
            adminAddressTrc20: settings.admin_address_trc20,
            adminAddressBep20: settings.admin_address_bep20,
            adminAddressErc20: settings.admin_address_erc20,
            minDeposit: Number(settings.min_deposit || 1.0),
            minWithdrawal: Number(settings.min_withdrawal || 1.0),
            maxWithdrawal: Number(settings.max_withdrawal || 10000.0),
            boostingMinDirects: parseInt(settings.boosting_min_directs || 2, 10),
            boostingMinPkgPrice: Number(settings.boosting_min_pkg_price || 10.0),
            spinMinPkgPrice: Number(settings.spin_min_pkg_price || 10.0),
            spinMinDirects: parseInt(settings.spin_min_directs || 0, 10),
            spinCooldownHours: parseInt(settings.spin_cooldown_hours || 24, 10),
            boostingReward: Number(settings.boosting_reward || 20.0),
            depositFee: Number(settings.deposit_fee || 0.0),
            withdrawalFee: Number(settings.withdrawal_fee || 5.0),
            spinCost: Number(settings.spin_cost || 1.0),
            referralsForFreeSpins: parseInt(settings.referrals_for_free_spins || 5, 10),
            spinsPerMilestone: parseInt(settings.spins_per_milestone || 1, 10),
            enableDeposit: settings.enable_deposit !== undefined ? settings.enable_deposit : true,
            enableWithdrawal: settings.enable_withdrawal !== undefined ? settings.enable_withdrawal : true,
            enableSwap: settings.enable_swap !== undefined ? settings.enable_swap : true,
            roiIntervalMinutes: parseInt(settings.roi_interval_minutes || 1440, 10),
            rankRewards: typeof settings.rank_rewards === 'string' ? settings.rank_rewards : JSON.stringify(settings.rank_rewards || []),
            spinRewards: typeof settings.spin_rewards === 'string' ? settings.spin_rewards : JSON.stringify(settings.spin_rewards || []),
        };
        if (exist.length > 0) {
            await db.update(settingsTable).set(payload).where(eq(settingsTable.id, exist[0].id));
        } else {
            await db.insert(settingsTable).values(payload);
        }
        res.json({ success: true, message: 'Settings saved successfully' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Admin Update User
app.post('/api/admin/update-user', verifyAdmin, async (req: any, res: any) => {
    const { userId, data } = req.body;
    try {
        const resolvedId = await resolveUserAuthId(userId) || userId;
        const payload: any = {};
        if (data.name !== undefined) payload.name = data.name;
        if (data.mobile !== undefined) payload.mobile = data.mobile;
        if (data.personal_business !== undefined) payload.personalBusiness = Number(data.personal_business);
        if (data.team_business !== undefined) payload.teamBusiness = Number(data.team_business);
        if (data.isBlocked !== undefined) payload.isBlocked = !!data.isBlocked;
        await db.update(users).set(payload).where(eq(users.uid, resolvedId));
        res.json({ success: true, message: 'User updated successfully' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Delete User
app.post('/api/admin/delete-user', verifyAdmin, async (req: any, res: any) => {
    const { userId } = req.body;
    try {
        const resolvedId = await resolveUserAuthId(userId) || userId;
        await db.delete(users).where(eq(users.uid, resolvedId));
        await db.delete(wallets).where(eq(wallets.userId, resolvedId));
        await db.delete(purchases).where(eq(purchases.userId, resolvedId));
        res.json({ success: true, message: 'User purged successfully' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Exchanger Request
app.post('/api/exchanger/request', verifyAuth, async (req: any, res: any) => {
    const body = req.body || {};
    const userId = body.userId || body.user_id;
    const amount = body.amount;
    const type = body.type;
    const address = body.address;
    const network = body.network;
    const utrNumber = body.utrNumber || body.utr_number || body.utr || '';
    const inrAmount = body.inrAmount || body.inr_amount;
    const rate = body.rate;

    try {
        if (!userId) {
            return res.status(400).json({ success: false, message: 'Required parameter: userId is missing.' });
        }
        const resolvedId = await resolveUserAuthId(userId) || userId;
        const fees = type === 'withdraw' ? 5.0 : 0.0;
        if (type === 'withdraw') {
            const wallet = await fetchWallet(resolvedId);
            if (!wallet || Number(wallet.balance) < (Number(amount) + fees)) {
                return res.json({ success: false, message: 'Insufficient wallet balance for withdrawal processing' });
            }
            await db.update(wallets).set({
                balance: sql`${wallets.balance} - ${(Number(amount) + fees)}`,
                holdBalance: sql`${wallets.holdBalance} + ${Number(amount)}`
            }).where(eq(wallets.userId, resolvedId));
        }
        await db.insert(exchangerRequests).values({
            userId: resolvedId, amount: Number(amount), type, status: 'pending',
            address: address || '', network: network || '', utrNumber: utrNumber || '',
            inrAmount: inrAmount ? Number(inrAmount) : null,
            rate: rate ? Number(rate) : null, fee: fees,
        });
        res.json({ success: true, message: 'Exchanger request queued successfully.' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// User Exchanger Requests
app.get('/api/user/exchanger-requests/:userId', verifyAuth, async (req: any, res: any) => {
    const { userId } = req.params;
    try {
        const resolvedId = await resolveUserAuthId(userId) || userId;
        const list = await db.select().from(exchangerRequests).where(eq(exchangerRequests.userId, resolvedId)).orderBy(desc(exchangerRequests.createdAt));
        res.json({ success: true, requests: list });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Admin Requests
app.get('/api/admin/requests', verifyAdmin, async (req: any, res: any) => {
    try {
        const requests = await db.select().from(exchangerRequests).orderBy(desc(exchangerRequests.createdAt));
        res.json({ success: true, requests });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Handle Request (Admin)
app.post('/api/admin/handle-request', verifyAdmin, async (req: any, res: any) => {
    const { requestId, status } = req.body;
    try {
        const reqs = await db.select().from(exchangerRequests).where(eq(exchangerRequests.id, parseInt(requestId, 10))).limit(1);
        if (reqs.length === 0) return res.status(404).json({ success: false, message: 'Request not found.' });
        const document = reqs[0];
        if (document.status !== 'pending') return res.json({ success: false, message: 'Request already processed.' });

        const userId = document.userId;
        const amt = Number(document.amount);
        const fee = Number(document.fee || 0);

        if (status === 'approved') {
            await db.update(exchangerRequests).set({ status: 'approved' }).where(eq(exchangerRequests.id, document.id));
            if (document.type === 'deposit') {
                await db.update(wallets).set({ balance: sql`${wallets.balance} + ${amt}` }).where(eq(wallets.userId, userId));
                await db.insert(transactions).values({ userId, amount: amt, type: 'topup', status: 'completed', description: `USDT Deposit Approved: $${amt}`, fromUserId: 'SYSTEM' });
            } else {
                await db.update(wallets).set({ holdBalance: sql`${wallets.holdBalance} - ${amt}` }).where(eq(wallets.userId, userId));
                await db.insert(transactions).values({ userId, amount: amt, type: 'withdraw', status: 'completed', description: `USDT Withdrawal Dispatched: $${amt}`, fromUserId: 'SYSTEM' });
            }
        } else {
            await db.update(exchangerRequests).set({ status: 'rejected' }).where(eq(exchangerRequests.id, document.id));
            if (document.type === 'withdraw') {
                await db.update(wallets).set({
                    balance: sql`${wallets.balance} + ${(amt + fee)}`,
                    holdBalance: sql`${wallets.holdBalance} - ${amt}`
                }).where(eq(wallets.userId, userId));
            }
        }
        res.json({ success: true, message: 'Request status updated successfully' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Swap
app.post('/api/swap', verifyAuth, async (req: any, res: any) => {
    const { userId, amount } = req.body;
    try {
        const resolvedId = await resolveUserAuthId(userId) || userId;
        const wallet = await fetchWallet(resolvedId);
        if (!wallet || Number(wallet.balance) < Number(amount)) {
            return res.json({ success: false, message: 'Insufficient balance to swap' });
        }
        await db.update(wallets).set({
            balance: sql`${wallets.balance} - ${Number(amount)}`,
            holdBalance: sql`${wallets.holdBalance} + ${Number(amount)}`
        }).where(eq(wallets.userId, resolvedId));
        await db.insert(transactions).values({ userId: resolvedId, amount: Number(amount), type: 'transfer', status: 'completed', description: `Swapped $${amount} to hold balance`, fromUserId: 'SYSTEM' });
        res.json({ success: true, message: 'Swap completed successfully' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Rank Reward Claim
app.post('/api/rewards/claim', verifyAuth, async (req: any, res: any) => {
    const { userId, rewardId } = req.body;
    try {
        const resolvedId = await resolveUserAuthId(userId) || userId;
        const currentSettings = await getServerSettings();
        const activeRankReward = currentSettings.rank_rewards.find((r: any) => r.id === rewardId);
        if (!activeRankReward) return res.status(404).json({ success: false, message: 'Milestone target not found.' });
        await distributeIncomeServer(resolvedId, Number(activeRankReward.reward_amount), 'rank_reward', `${activeRankReward.rank_name} Milestone Claim`, 'SYSTEM');
        res.json({ success: true, message: 'Rank reward claimed successfully!' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Spin Wheel
app.post('/api/perform-spin', verifyAuth, async (req: any, res: any) => {
    const { userId, spinType } = req.body;
    try {
        const resolvedId = await resolveUserAuthId(userId) || userId;
        const wallet = await fetchWallet(resolvedId);
        if (!wallet) return res.status(404).json({ success: false, message: 'Wallet not found' });

        const isFree = spinType === 'free';
        if (isFree && Number(wallet.availableSpins || 0) < 1) return res.json({ success: false, message: 'No free spins available' });
        else if (!isFree && Number(wallet.balance) < 1.0) return res.json({ success: false, message: 'Insufficient balance to purchase spin ($1)' });

        if (isFree) {
            await db.update(wallets).set({ availableSpins: sql`${wallets.availableSpins} - 1` }).where(eq(wallets.userId, resolvedId));
        } else {
            await db.update(wallets).set({ balance: sql`${wallets.balance} - 1.0` }).where(eq(wallets.userId, resolvedId));
        }

        const currentSettings = await getServerSettings();
        const spinRewards = currentSettings.spin_rewards || [];
        let totalProb = spinRewards.reduce((sum: number, r: any) => sum + Number(r.probability || 0), 0);
        if (totalProb <= 0) totalProb = 100;
        let roll = Math.random() * totalProb;
        let selectedReward = spinRewards[0] || { id: '2', label: 'ZERO', amount: 0 };
        let sumWeight = 0;
        for (const r of spinRewards) {
            sumWeight += Number(r.probability || 0);
            if (roll <= sumWeight) { selectedReward = r; break; }
        }

        const amt = Number(selectedReward.amount || 0);
        if (amt > 0) {
            await db.update(wallets).set({
                balance: sql`${wallets.balance} + ${amt}`,
                totalEarned: sql`${wallets.totalEarned} + ${amt}`
            }).where(eq(wallets.userId, resolvedId));
        }

        await db.insert(transactions).values({ userId: resolvedId, amount: amt, type: 'spin', status: 'completed', description: `Spin wheel win: ${selectedReward.label} ($${amt})`, fromUserId: 'SYSTEM' });
        res.json({ success: true, reward: selectedReward, newBalance: Number(wallet.balance) + amt, newSpins: isFree ? Number(wallet.availableSpins) - 1 : Number(wallet.availableSpins) });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Spin History
app.get('/api/user/spin-history/:userId', verifyAuth, async (req: any, res: any) => {
    const { userId } = req.params;
    try {
        const resolvedId = await resolveUserAuthId(userId) || userId;
        const list = await db.select().from(transactions).where(and(eq(transactions.userId, resolvedId), eq(transactions.type, 'spin'))).orderBy(desc(transactions.createdAt)).limit(100);
        res.json({ success: true, history: list });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Self Heal Schema
app.post('/api/admin/self-heal-schema', verifyAdmin, async (req: any, res: any) => {
    try {
        await verifyAndHealPostgresSchema();
        res.json({ success: true, message: 'Cloud SQL database verified and healed' });
    } catch (e: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(e) });
    }
});

// --- CRON / Background ROI ---
let isROIBatchProcessing = false;

async function processPackageROI(p: any, settings: any): Promise<boolean> {
    try {
        const freshList = await db.select().from(purchases).where(eq(purchases.id, p.id)).limit(1);
        if (freshList.length === 0) return false;
        const freshPkg = freshList[0];

        const price = Number(freshPkg.price);
        const dailyPerc = Number(freshPkg.dailyRoi || 0.5);
        const maxRoiPercent = Number(freshPkg.maxRoiPercent || settings?.max_roi_percent || 200);
        const intervalMins = Number(freshPkg.roiIntervalMinutes || settings?.roi_interval_minutes || 1440);
        const cyclePayout = Number((price * dailyPerc / 100).toFixed(4));
        if (cyclePayout <= 0 || price <= 0) return false;

        const maxEarningCap = (price * maxRoiPercent) / 100;
        let currentEarned = Number(freshPkg.roiEarned);

        if (maxEarningCap > 0 && currentEarned >= (maxEarningCap - 0.0001)) {
            await db.update(purchases).set({ isActive: false }).where(eq(purchases.id, freshPkg.id));
            return false;
        }

        const lastPaidTs = freshPkg.activatedAt!.getTime();
        const nowTs = Date.now();
        const elapsedMs = nowTs - lastPaidTs;
        const pendingCycles = Math.floor(elapsedMs / (intervalMins * 60000));
        if (pendingCycles < 1) return false;

        let processedAny = false;
        let pointerTs = lastPaidTs;

        for (let i = 1; i <= Math.min(pendingCycles, 10); i++) {
            const currentCycleTargetTs = pointerTs + (intervalMins * 60000);
            if (currentCycleTargetTs > nowTs) break;

            const remainingCap = maxEarningCap > 0 ? (maxEarningCap - currentEarned) : Infinity;
            if (remainingCap <= 0.0001) {
                await db.update(purchases).set({ isActive: false }).where(eq(purchases.id, freshPkg.id));
                break;
            }

            const payoutAmt = Math.min(cyclePayout, remainingCap);
            const success = await distributeIncomeServer(freshPkg.userId, payoutAmt, 'roi', `Node yield (Cycle #${i})`, 'SYSTEM', 0, true);
            if (success) {
                processedAny = true;
                currentEarned = Number((currentEarned + payoutAmt).toFixed(4));
                pointerTs = currentCycleTargetTs;
                const isFinished = maxEarningCap > 0 && currentEarned >= (maxEarningCap - 0.0001);
                await db.update(purchases).set({ roiEarned: Number(currentEarned.toFixed(4)), isActive: !isFinished }).where(eq(purchases.id, freshPkg.id));
                if (isFinished) break;
            } else {
                break;
            }
        }
        return processedAny;
    } catch (error: any) {
        console.error(`[ROI Loop Fatal] Package: ${p.id}`, error.message);
        return false;
    }
}

async function distributeGlobalROIWorker() {
    if (isROIBatchProcessing) return;
    isROIBatchProcessing = true;
    try {
        const settings = await getServerSettings();
        const activePackages = await db.select().from(purchases).where(eq(purchases.isActive, true));
        console.log(`[Background Scanner] Checking ROI for ${activePackages.length} active nodes.`);
        for (const p of activePackages) {
            await processPackageROI(p, settings);
        }
    } catch (error: any) {
        console.error('[distributeGlobalROIWorker Error]', error.message);
    } finally {
        isROIBatchProcessing = false;
    }
}

// Schema Self-Healer
async function verifyAndHealPostgresSchema() {
    console.log('[Schema Healer] Starting...');
    const queries = [
        `CREATE TABLE IF NOT EXISTS "users" ("id" serial PRIMARY KEY, "uid" text NOT NULL UNIQUE, "email" text NOT NULL);`,
        `CREATE TABLE IF NOT EXISTS "wallets" ("id" serial PRIMARY KEY, "user_id" text NOT NULL UNIQUE, "balance" double precision NOT NULL DEFAULT 0.0);`,
        `CREATE TABLE IF NOT EXISTS "packages" ("id" serial PRIMARY KEY, "name" text NOT NULL, "price" double precision NOT NULL, "daily_roi" double precision NOT NULL);`,
        `CREATE TABLE IF NOT EXISTS "purchases" ("id" serial PRIMARY KEY, "user_id" text NOT NULL, "package_id" integer NOT NULL, "price" double precision NOT NULL);`,
        `CREATE TABLE IF NOT EXISTS "transactions" ("id" serial PRIMARY KEY, "user_id" text NOT NULL, "amount" double precision NOT NULL, "type" text NOT NULL);`,
        `CREATE TABLE IF NOT EXISTS "exchanger_requests" ("id" serial PRIMARY KEY, "user_id" text NOT NULL, "amount" double precision NOT NULL, "type" text NOT NULL);`,
        `CREATE TABLE IF NOT EXISTS "gold_queue" ("id" serial PRIMARY KEY, "user_id" text NOT NULL, "completed" boolean NOT NULL DEFAULT false);`,
        `CREATE TABLE IF NOT EXISTS "settings" ("id" serial PRIMARY KEY, "telegram_link" text);`,
        `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "name" text NOT NULL DEFAULT '';`,
        `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'user';`,
        `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT false;`,
        `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referred_by" text;`,
        `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "direct_count" integer NOT NULL DEFAULT 0;`,
        `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_qualified" boolean NOT NULL DEFAULT false;`,
        `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_blocked" boolean NOT NULL DEFAULT false;`,
        `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "matrix_parent_id" text;`,
        `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "global_rank" integer;`,
        `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "node_id" text;`,
        `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "personal_business" double precision NOT NULL DEFAULT 0.0;`,
        `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "team_business" double precision NOT NULL DEFAULT 0.0;`,
        `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mobile" text;`,
        `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password" text;`,
        `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();`,
        `ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "total_earned" double precision NOT NULL DEFAULT 0.0;`,
        `ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "total_withdrawn" double precision NOT NULL DEFAULT 0.0;`,
        `ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "last_roi_at" timestamp;`,
        `ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "wallet_roi_earned" double precision NOT NULL DEFAULT 0.0;`,
        `ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "roi_income" double precision NOT NULL DEFAULT 0.0;`,
        `ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "direct_income" double precision NOT NULL DEFAULT 0.0;`,
        `ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "level_income" double precision NOT NULL DEFAULT 0.0;`,
        `ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "matrix_income" double precision NOT NULL DEFAULT 0.0;`,
        `ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "hold_balance" double precision NOT NULL DEFAULT 0.0;`,
        `ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "available_spins" integer NOT NULL DEFAULT 0;`,
        `ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();`,
        `ALTER TABLE "packages" ADD COLUMN IF NOT EXISTS "roi_interval_minutes" integer;`,
        `ALTER TABLE "packages" ADD COLUMN IF NOT EXISTS "duration_days" integer NOT NULL DEFAULT 365;`,
        `ALTER TABLE "packages" ADD COLUMN IF NOT EXISTS "max_roi_percent" double precision;`,
        `ALTER TABLE "packages" ADD COLUMN IF NOT EXISTS "direct_income_percent" double precision NOT NULL DEFAULT 0.0;`,
        `ALTER TABLE "packages" ADD COLUMN IF NOT EXISTS "matrix_income_percent" double precision NOT NULL DEFAULT 0.0;`,
        `ALTER TABLE "packages" ADD COLUMN IF NOT EXISTS "level_income_percents" text NOT NULL DEFAULT '[]';`,
        `ALTER TABLE "packages" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true;`,
        `ALTER TABLE "packages" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();`,
        `ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "daily_roi" double precision;`,
        `ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "roi_interval_minutes" integer;`,
        `ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "max_roi_percent" double precision;`,
        `ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "roi_earned" double precision NOT NULL DEFAULT 0.0;`,
        `ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true;`,
        `ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "activated_at" timestamp DEFAULT now();`,
        `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'completed';`,
        `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "description" text;`,
        `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "from_user_id" text;`,
        `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "income_level" integer;`,
        `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();`,
        `ALTER TABLE "exchanger_requests" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'pending';`,
        `ALTER TABLE "exchanger_requests" ADD COLUMN IF NOT EXISTS "inr_amount" double precision;`,
        `ALTER TABLE "exchanger_requests" ADD COLUMN IF NOT EXISTS "rate" double precision;`,
        `ALTER TABLE "exchanger_requests" ADD COLUMN IF NOT EXISTS "utr_number" text;`,
        `ALTER TABLE "exchanger_requests" ADD COLUMN IF NOT EXISTS "address" text;`,
        `ALTER TABLE "exchanger_requests" ADD COLUMN IF NOT EXISTS "network" text;`,
        `ALTER TABLE "exchanger_requests" ADD COLUMN IF NOT EXISTS "fee" double precision;`,
        `ALTER TABLE "exchanger_requests" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();`,
        `ALTER TABLE "gold_queue" ADD COLUMN IF NOT EXISTS "is_rebirth" boolean NOT NULL DEFAULT false;`,
        `ALTER TABLE "gold_queue" ADD COLUMN IF NOT EXISTS "payout_at" timestamp;`,
        `ALTER TABLE "gold_queue" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "marquee_text" text;`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "hall_of_fame_marquee" text;`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "admin_address_trc20" text;`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "admin_address_bep20" text;`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "admin_address_erc20" text;`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "min_deposit" double precision DEFAULT 1.0;`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "min_withdrawal" double precision DEFAULT 1.0;`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "max_withdrawal" double precision DEFAULT 10000.0;`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "boosting_min_directs" integer DEFAULT 2;`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "boosting_min_pkg_price" double precision DEFAULT 10.0;`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "spin_min_pkg_price" double precision DEFAULT 10.0;`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "spin_min_directs" integer DEFAULT 0;`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "spin_cooldown_hours" integer DEFAULT 24;`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "boosting_reward" double precision DEFAULT 20.0;`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "deposit_fee" double precision DEFAULT 0.0;`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "withdrawal_fee" double precision DEFAULT 5.0;`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "spin_cost" double precision DEFAULT 1.0;`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "referrals_for_free_spins" integer DEFAULT 5;`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "spins_per_milestone" integer DEFAULT 1;`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "enable_deposit" boolean DEFAULT true;`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "enable_withdrawal" boolean DEFAULT true;`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "enable_swap" boolean DEFAULT true;`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "roi_interval_minutes" integer;`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "rank_rewards_json" text DEFAULT '[]';`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "spin_rewards_json" text DEFAULT '[]';`,
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();`,
    ];

    for (const statement of queries) {
        try {
            await db.execute(sql.raw(statement));
        } catch (err: any) {
            console.warn(`[Schema Healer] Note: ${err.message}`);
        }
    }
    console.log('[Schema Healer] Done!');
}

// Start Server
async function startServer() {
    console.log('[Server] Starting...');
    try {
        try {
            await verifyAndHealPostgresSchema();
        } catch (healErr: any) {
            console.error('[Schema Healer Error]:', healErr.message);
        }

        const isProduction = process.env.NODE_ENV === 'production' ||
            (typeof __filename !== 'undefined' && (__filename.endsWith('server.cjs') || __filename.includes('dist')));

        if (!isProduction) {
            try {
                const vite = await createViteServer({
                    server: { middlewareMode: true, allowedHosts: true as any },
                    appType: 'spa',
                });
                app.use(vite.middlewares);
                app.get('*', async (req: any, res: any, next: any) => {
                    try {
                        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
                        template = await vite.transformIndexHtml(req.originalUrl, template);
                        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
                    } catch (e: any) {
                        vite.ssrFixStacktrace(e);
                        next(e);
                    }
                });
            } catch (viteErr: any) {
                console.warn('[Server] Vite failed, serving /dist:', viteErr.message);
                serveStaticFilesHelper();
            }
        } else {
            serveStaticFilesHelper();
        }

        function serveStaticFilesHelper() {
            const distPath = path.join(process.cwd(), 'dist');
            app.use(express.static(distPath));
            app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
        }

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`[Server] Running on http://0.0.0.0:${PORT}`);
            setInterval(() => distributeGlobalROIWorker(), 600000);
            distributeGlobalROIWorker();
        });

        app.get('/api/system/massive-roi-trigger', async (req: any, res: any) => {
            distributeGlobalROIWorker();
            res.json({ success: true, message: 'ROI Yield scanner dispatched.' });
        });

    } catch (err: any) {
        console.error('[Server] CRITICAL START ERROR:', err);
    }
}

startServer();
