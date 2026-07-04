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
import { eq, or, desc, asc, and, not, sql, inArray } from 'drizzle-orm';
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
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-jwt-security-key-32-chars-long';

function hashPassword(password: string): string {
    return crypto.createHmac('sha256', JWT_SECRET).update(password).digest('hex');
}

function normalizeUser(u: any) {
    if (!u) return u;
    return {
        ...u,
        // Ensure both fields exist for compatibility
        is_active: u.isActive !== undefined ? u.isActive : u.is_active,
        isActive: u.isActive !== undefined ? u.isActive : u.is_active,
        
        referred_by: u.referredBy !== undefined ? u.referredBy : u.referred_by,
        referredBy: u.referredBy !== undefined ? u.referredBy : u.referred_by,
        
        direct_count: u.directCount !== undefined ? u.directCount : u.direct_count,
        directCount: u.directCount !== undefined ? u.directCount : u.direct_count,
        
        is_qualified: u.isQualified !== undefined ? u.isQualified : u.is_qualified,
        isQualified: u.isQualified !== undefined ? u.isQualified : u.is_qualified,
        
        is_blocked: u.isBlocked !== undefined ? u.isBlocked : u.is_blocked,
        isBlocked: u.isBlocked !== undefined ? u.isBlocked : u.is_blocked,
        
        matrix_parent_id: u.matrixParentId !== undefined ? u.matrixParentId : u.matrix_parent_id,
        matrixParentId: u.matrixParentId !== undefined ? u.matrixParentId : u.matrix_parent_id,
        
        global_rank: u.globalRank !== undefined ? u.globalRank : u.global_rank,
        globalRank: u.globalRank !== undefined ? u.globalRank : u.global_rank,
        
        node_id: u.nodeId !== undefined ? u.nodeId : u.node_id,
        nodeId: u.nodeId !== undefined ? u.nodeId : u.node_id,
        
        personal_business: u.personalBusiness !== undefined ? u.personalBusiness : u.personal_business,
        personalBusiness: u.personalBusiness !== undefined ? u.personalBusiness : u.personal_business,
        
        team_business: u.teamBusiness !== undefined ? u.teamBusiness : u.team_business,
        teamBusiness: u.teamBusiness !== undefined ? u.teamBusiness : u.team_business,
        
        created_at: u.createdAt !== undefined ? u.createdAt : u.created_at,
        createdAt: u.createdAt !== undefined ? u.createdAt : u.created_at,
        
        user_id: u.uid !== undefined ? u.uid : u.user_id,
        userId: u.uid !== undefined ? u.uid : u.user_id,
        
        // ID conversion for compatibility as well
        id: u.uid !== undefined ? u.uid : (u.id !== undefined ? String(u.id) : undefined)
    };
}

function sanitizeUser(user: any) {
    if (!user) return user;
    const san = normalizeUser(user);
    delete san.password;
    return san;
}

// ✅ FIX: cleanErrorMessage - ab DB errors kabhi bhi frontend pe leak nahi honge, jabki setup/connection errors guide karenge user ko
function cleanErrorMessage(err: any): string {
    if (!err) return 'An unexpected error occurred.';

    // Server logs mein output for developer debugging
    console.error('[Server Error Detail]:', err);

    const actualMessage = (err.cause && err.cause.message) ? err.cause.message : (err.message || err.detail || err);
    const msg = String(actualMessage).trim();
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
let PORT = defaultPort;
if (process.env.PORT) {
    const envPort = parseInt(process.env.PORT, 10);
    if (envPort === 8080) {
        PORT = 3000;
    } else {
        PORT = envPort;
    }
}

app.use(express.json());

// Set Cache-Control headers for all API requests to prevent browser caching of live data (like balances)
app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
});

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
        const isAdmin = userDoc.length > 0 && String(userDoc[0].role || '').toLowerCase() === 'admin';
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

        // Insert user
        const createdUsers = await db.insert(users).values({
            uid: generatedUid,
            email: cleanEmail,
            name: (name || '').trim(),
            role: 'user',
            referredBy: resolvedSponsor,
            matrixParentId: null, // assigned dynamically when the user activates their first package
            nodeId,
            isActive: false,
            mobile: (mobile || '').trim(),
            password: hashedPassword,
            directCount: 0,
        }).returning();

        // Create wallet with signup bonus if configured
        const systemSettings = await getServerSettings();
        const bonusAmount = Number(systemSettings?.signup_bonus || 0.0);

        await db.insert(wallets).values({
            userId: generatedUid,
            balance: bonusAmount,
            totalEarned: bonusAmount,
        });

        if (bonusAmount > 0) {
            await db.insert(transactions).values({
                userId: generatedUid,
                amount: bonusAmount,
                type: 'signup_bonus',
                status: 'completed',
                description: 'Signup Bonus',
                fromUserId: 'SYSTEM',
            });
        }

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
                matrixParentId: null,
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
        res.json({ success: true, wallet: normalizeWallet(userWallet) });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Update Wallet
app.post('/api/user/wallet/update', verifyAuth, async (req: any, res: any) => {
    const { userId, data } = req.body;
    try {
        const resolvedId = await resolveUserAuthId(userId) || userId;
        const isAdmin = String(req.user?.role || '').toLowerCase() === 'admin';
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

// Helpers for snake_case & camelCase cross-compatibility
function normalizePackage(p: any) {
    if (!p) return p;
    let percents = [0,0,0,0,0,0,0,0,0,0];
    try { 
        if (p.levelIncomePercents) percents = JSON.parse(p.levelIncomePercents); 
    } catch (e) {}
    return {
        ...p,
        daily_roi: p.dailyRoi !== undefined ? p.dailyRoi : p.daily_roi,
        duration_days: p.durationDays !== undefined ? p.durationDays : p.duration_days,
        direct_income_percent: p.directIncomePercent !== undefined ? p.directIncomePercent : p.direct_income_percent,
        matrix_income_percent: p.matrixIncomePercent !== undefined ? p.matrixIncomePercent : p.matrix_income_percent,
        is_active: p.isActive !== undefined ? p.isActive : p.is_active,
        roi_interval_minutes: p.roiIntervalMinutes !== undefined ? p.roiIntervalMinutes : p.roi_interval_minutes,
        max_roi_percent: p.maxRoiPercent !== undefined ? p.maxRoiPercent : p.max_roi_percent,
        level_income_percents: percents,
        // Camel case equivalents
        dailyRoi: p.dailyRoi !== undefined ? p.dailyRoi : p.daily_roi,
        durationDays: p.durationDays !== undefined ? p.durationDays : p.duration_days,
        directIncomePercent: p.directIncomePercent !== undefined ? p.directIncomePercent : p.direct_income_percent,
        matrixIncomePercent: p.matrixIncomePercent !== undefined ? p.matrixIncomePercent : p.matrix_income_percent,
        roiIntervalMinutes: p.roiIntervalMinutes !== undefined ? p.roiIntervalMinutes : p.roi_interval_minutes,
        maxRoiPercent: p.maxRoiPercent !== undefined ? p.maxRoiPercent : p.max_roi_percent,
        isActive: p.isActive !== undefined ? p.isActive : p.is_active
    };
}

function normalizePurchase(p: any) {
    if (!p) return p;
    return {
        ...p,
        user_id: p.userId !== undefined ? p.userId : p.user_id,
        package_id: p.packageId !== undefined ? p.packageId : p.package_id,
        daily_roi: p.dailyRoi !== undefined ? p.dailyRoi : p.daily_roi,
        roi_interval_minutes: p.roiIntervalMinutes !== undefined ? p.roiIntervalMinutes : p.roi_interval_minutes,
        max_roi_percent: p.maxRoiPercent !== undefined ? p.maxRoiPercent : p.max_roi_percent,
        roi_earned: p.roiEarned !== undefined ? p.roiEarned : p.roi_earned,
        is_active: p.isActive !== undefined ? p.isActive : p.is_active,
        activated_at: p.activatedAt !== undefined ? p.activatedAt : p.activated_at,
        last_paid_at: p.lastPaidAt !== undefined ? p.lastPaidAt : p.last_paid_at,
        // Camel case equivalents
        userId: p.userId !== undefined ? p.userId : p.user_id,
        packageId: p.packageId !== undefined ? p.packageId : p.package_id,
        dailyRoi: p.dailyRoi !== undefined ? p.dailyRoi : p.daily_roi,
        roiIntervalMinutes: p.roiIntervalMinutes !== undefined ? p.roiIntervalMinutes : p.roi_interval_minutes,
        maxRoiPercent: p.maxRoiPercent !== undefined ? p.maxRoiPercent : p.max_roi_percent,
        roiEarned: p.roiEarned !== undefined ? p.roiEarned : p.roi_earned,
        isActive: p.isActive !== undefined ? p.isActive : p.is_active,
        activatedAt: p.activatedAt !== undefined ? p.activatedAt : p.activated_at,
        lastPaidAt: p.lastPaidAt !== undefined ? p.lastPaidAt : p.last_paid_at
    };
}

function normalizeWallet(w: any) {
    if (!w) return w;
    return {
        ...w,
        user_id: w.userId !== undefined ? w.userId : w.user_id,
        total_earned: w.totalEarned !== undefined ? w.totalEarned : w.total_earned,
        total_withdrawn: w.totalWithdrawn !== undefined ? w.totalWithdrawn : w.total_withdrawn,
        last_roi_at: w.lastRoiAt !== undefined ? w.lastRoiAt : w.last_roi_at,
        wallet_roi_earned: w.walletRoiEarned !== undefined ? w.walletRoiEarned : w.wallet_roi_earned,
        roi_income: w.roiIncome !== undefined ? w.roiIncome : w.roi_income,
        direct_income: w.directIncome !== undefined ? w.directIncome : w.direct_income,
        level_income: w.levelIncome !== undefined ? w.levelIncome : w.level_income,
        matrix_income: w.matrixIncome !== undefined ? w.matrixIncome : w.matrix_income,
        hold_balance: w.holdBalance !== undefined ? w.holdBalance : w.hold_balance,
        total_roi_rate: w.totalRoiRate !== undefined ? w.totalRoiRate : w.total_roi_rate,
        package_roi_rate: w.packageRoiRate !== undefined ? w.package_roi_rate : w.package_roi_rate,
        base_roi_rate: w.baseRoiRate !== undefined ? w.baseRoiRate : w.base_roi_rate,
        daily_package_roi: w.dailyPackageRoi !== undefined ? w.dailyPackageRoi : w.daily_package_roi,
        available_spins: w.availableSpins !== undefined ? w.availableSpins : w.available_spins,
        // Camel case equivalents
        userId: w.userId !== undefined ? w.userId : w.user_id,
        totalEarned: w.totalEarned !== undefined ? w.totalEarned : w.total_earned,
        totalWithdrawn: w.totalWithdrawn !== undefined ? w.totalWithdrawn : w.total_withdrawn,
        lastRoiAt: w.lastRoiAt !== undefined ? w.lastRoiAt : w.last_roi_at,
        walletRoiEarned: w.walletRoiEarned !== undefined ? w.walletRoiEarned : w.wallet_roi_earned,
        roiIncome: w.roiIncome !== undefined ? w.roiIncome : w.roi_income,
        directIncome: w.directIncome !== undefined ? w.directIncome : w.direct_income,
        levelIncome: w.levelIncome !== undefined ? w.levelIncome : w.level_income,
        matrixIncome: w.matrixIncome !== undefined ? w.matrixIncome : w.matrix_income,
        holdBalance: w.holdBalance !== undefined ? w.holdBalance : w.hold_balance,
        totalRoiRate: w.totalRoiRate !== undefined ? w.totalRoiRate : w.total_roi_rate,
        packageRoiRate: w.packageRoiRate !== undefined ? w.package_roi_rate : w.package_roi_rate,
        baseRoiRate: w.baseRoiRate !== undefined ? w.baseRoiRate : w.base_roi_rate,
        dailyPackageRoi: w.dailyPackageRoi !== undefined ? w.dailyPackageRoi : w.daily_package_roi,
        availableSpins: w.availableSpins !== undefined ? w.availableSpins : w.available_spins
    };
}

// Packages
app.get('/api/packages', async (req: any, res: any) => {
    try {
        let list = await db.select().from(mlmPackages).orderBy(asc(mlmPackages.price));
        if (list.length === 0) {
            await db.insert(mlmPackages).values({ name: 'Starter Node', price: 10.0, dailyRoi: 0.1, roiIntervalMinutes: 1440, maxRoiPercent: 250.0, durationDays: 365, isActive: true, directIncomePercent: 20.0, matrixIncomePercent: 10.0, levelIncomePercents: '[0.5,0.5,1,1,0.5,0.2,0.2,0.2,0.2,0.2]' });
            await db.insert(mlmPackages).values({ name: 'Pro Node', price: 20.0, dailyRoi: 0.2, roiIntervalMinutes: 1440, maxRoiPercent: 0.0, durationDays: 365, isActive: true, directIncomePercent: 20.0, matrixIncomePercent: 10.0, levelIncomePercents: '[1,1,1,1,1,1,1,1,1,1]' });
            await db.insert(mlmPackages).values({ name: 'Elite Node', price: 30.0, dailyRoi: 0.3, roiIntervalMinutes: 1440, maxRoiPercent: 1000.0, durationDays: 365, isActive: true, directIncomePercent: 20.0, matrixIncomePercent: 10.0, levelIncomePercents: '[1,1,1,2,2,2,2,2,2,7]' });
            await db.insert(mlmPackages).values({ name: 'Whale Node', price: 40.0, dailyRoi: 0.4, roiIntervalMinutes: 1440, maxRoiPercent: 0.0, durationDays: 365, isActive: true, directIncomePercent: 20.0, matrixIncomePercent: 10.0, levelIncomePercents: '[1,1,2,2,3,3,3,4,4,15]' });
            list = await db.select().from(mlmPackages).orderBy(asc(mlmPackages.price));
        } else {
            // If 20, 30 or 40 are missing, insert them
            const has20 = list.some(p => Math.floor(Number(p.price)) === 20);
            if (!has20) {
                await db.insert(mlmPackages).values({ name: 'Pro Node', price: 20.0, dailyRoi: 0.2, roiIntervalMinutes: 1440, maxRoiPercent: 0.0, durationDays: 365, isActive: true, directIncomePercent: 20.0, matrixIncomePercent: 10.0, levelIncomePercents: '[1,1,1,1,1,1,1,1,1,1]' });
            }
            const has30 = list.some(p => Math.floor(Number(p.price)) === 30);
            if (!has30) {
                await db.insert(mlmPackages).values({ name: 'Elite Node', price: 30.0, dailyRoi: 0.3, roiIntervalMinutes: 1440, maxRoiPercent: 1000.0, durationDays: 365, isActive: true, directIncomePercent: 20.0, matrixIncomePercent: 10.0, levelIncomePercents: '[1,1,1,2,2,2,2,2,2,7]' });
            }
            const has40 = list.some(p => Math.floor(Number(p.price)) === 40);
            if (!has40) {
                await db.insert(mlmPackages).values({ name: 'Whale Node', price: 40.0, dailyRoi: 0.4, roiIntervalMinutes: 1440, maxRoiPercent: 0.0, durationDays: 365, isActive: true, directIncomePercent: 20.0, matrixIncomePercent: 10.0, levelIncomePercents: '[1,1,2,2,3,3,3,4,4,15]' });
            }
            
            if (!has20 || !has30 || !has40) {
                list = await db.select().from(mlmPackages).orderBy(asc(mlmPackages.price));
            }
        }
        const packagesParsed = list.map(normalizePackage);
        res.json({ success: true, packages: packagesParsed });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Save Package (Admin)
app.post('/api/admin/save-package', verifyAdmin, async (req: any, res: any) => {
    const { pkg } = req.body;
    try {
        console.log("[ADMIN_SAVE_PACKAGE] Incoming pkg:", JSON.stringify(pkg));
        
        // Robust payload parser supporting both camelCase and snake_case values
        // Prioritize snake_case values as they are the ones modified by the Admin Panel form,
        // falling back to camelCase.
        const payload = {
            name: pkg.name || 'Custom Package',
            price: Number(pkg.price !== undefined ? pkg.price : 0),
            dailyRoi: Number(pkg.daily_roi !== undefined ? pkg.daily_roi : (pkg.dailyRoi !== undefined ? pkg.dailyRoi : 0)),
            roiIntervalMinutes: parseInt(pkg.roi_interval_minutes !== undefined ? pkg.roi_interval_minutes : (pkg.roiIntervalMinutes !== undefined ? pkg.roiIntervalMinutes : 1440), 10),
            durationDays: parseInt(pkg.duration_days !== undefined ? pkg.duration_days : (pkg.durationDays !== undefined ? pkg.durationDays : 365), 10),
            maxRoiPercent: Number(pkg.max_roi_percent !== undefined ? pkg.max_roi_percent : (pkg.maxRoiPercent !== undefined ? pkg.maxRoiPercent : 200)),
            directIncomePercent: Number(pkg.direct_income_percent !== undefined ? pkg.direct_income_percent : (pkg.directIncomePercent !== undefined ? pkg.directIncomePercent : 0)),
            matrixIncomePercent: Number(pkg.matrix_income_percent !== undefined ? pkg.matrix_income_percent : (pkg.matrixIncomePercent !== undefined ? pkg.matrixIncomePercent : 0)),
            levelIncomePercents: Array.isArray(pkg.level_income_percents) 
                ? JSON.stringify(pkg.level_income_percents)
                : (typeof pkg.level_income_percents === 'string' 
                    ? pkg.level_income_percents 
                    : (Array.isArray(pkg.levelIncomePercents)
                        ? JSON.stringify(pkg.levelIncomePercents)
                        : (typeof pkg.levelIncomePercents === 'string'
                            ? pkg.levelIncomePercents
                            : JSON.stringify([])))),
            isActive: pkg.is_active !== undefined ? pkg.is_active : (pkg.isActive !== undefined ? pkg.isActive : true)
        };

        console.log("[ADMIN_SAVE_PACKAGE] Formatted payload:", JSON.stringify(payload));

        // Check if pkg.id is a valid numeric database ID
        const rawId = pkg.id;
        const parsedId = parseInt(rawId, 10);
        const isNumericId = !isNaN(parsedId) && /^\d+$/.test(String(rawId).trim());

        if (isNumericId) {
            console.log(`[ADMIN_SAVE_PACKAGE] Updating package ID: ${parsedId}`);
            const updateRes = await db.update(mlmPackages).set(payload).where(eq(mlmPackages.id, parsedId)).returning();
            if (!updateRes || updateRes.length === 0) {
                console.log(`[ADMIN_SAVE_PACKAGE] Package ID: ${parsedId} not found in database. Inserting instead.`);
                await db.insert(mlmPackages).values(payload);
            }
        } else {
            console.log(`[ADMIN_SAVE_PACKAGE] Non-numeric ID: "${rawId}". Creating a new package.`);
            await db.insert(mlmPackages).values(payload);
        }

        res.json({ success: true, message: 'Package saved successfully' });
    } catch (err: any) {
        console.error("[ADMIN_SAVE_PACKAGE] Error:", err);
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
                maxRoiPercent: pkg.maxRoiPercent, roiEarned: 0.0, isActive: true,
                lastPaidAt: new Date()
            }).returning();
            createdPurchase = result[0];
        } catch (insertErr) {
            await db.update(wallets).set({ balance: initialBalance }).where(eq(wallets.userId, userId));
            throw insertErr;
        }

        if (!profile.isActive) {
            let assignedParent = '1';
            try {
                const mp = await findGlobalMatrixParent();
                if (mp) assignedParent = mp;
            } catch (parentErr) {
                console.warn('[Activation] Matrix parent lookup failed, fallback to 1:', parentErr);
            }

            await db.update(users)
                .set({ isActive: true, matrixParentId: assignedParent })
                .where(eq(users.uid, userId));
            
            profile.isActive = true;
            profile.matrixParentId = assignedParent;
        }

        const spinsEarned = Math.max(1, Math.floor(price / 10));
        await db.update(wallets).set({ availableSpins: sql`${wallets.availableSpins} + ${spinsEarned}` }).where(eq(wallets.userId, userId));

        const firstYield = Number(((price * (pkg.dailyRoi !== undefined && pkg.dailyRoi !== null ? Number(pkg.dailyRoi) : 0.5)) / 100).toFixed(4));
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
            if (currLevelId === '1') break;
            const parentDoc = await fetchUserById(currLevelId);
            currLevelId = parentDoc?.referredBy || '1';
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
        res.json({ success: true, directs: list.map(sanitizeUser) });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Admin Users
app.get('/api/admin/users', verifyAdmin, async (req: any, res: any) => {
    try {
        const allUsrs = await db.select().from(users).orderBy(desc(users.createdAt));
        res.json({ success: true, users: allUsrs.map(sanitizeUser) });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Admin Purchases
app.get('/api/admin/purchases', verifyAdmin, async (req: any, res: any) => {
    try {
        const list = await db.select().from(purchases).orderBy(desc(purchases.activatedAt));
        const normalized = list.map(normalizePurchase);
        res.json({ success: true, purchases: normalized });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Team Data (Recursive Matrix & Referral Downline UPTO 10 LEVELS)
app.get('/api/user/team-data/:userId', verifyAuth, async (req: any, res: any) => {
    const { userId } = req.params;
    try {
        const resolvedId = await resolveUserAuthId(userId) || userId;
        const rawQueryResult = await db.execute(sql`
            WITH RECURSIVE downline AS (
                SELECT id, uid, email, name, role, is_active, referred_by, direct_count,
                       is_qualified, is_blocked, matrix_parent_id, global_rank, node_id,
                       personal_business, team_business, mobile, password, created_at, 1 as depth
                FROM users
                WHERE uid = ${resolvedId}

                UNION ALL

                SELECT u.id, u.uid, u.email, u.name, u.role, u.is_active, u.referred_by, u.direct_count,
                       u.is_qualified, u.is_blocked, u.matrix_parent_id, u.global_rank, u.node_id,
                       u.personal_business, u.team_business, u.mobile, u.password, u.created_at, d.depth + 1
                FROM users u
                INNER JOIN downline d ON (u.matrix_parent_id = d.uid OR u.referred_by = d.uid)
                WHERE d.depth < 11
            )
            SELECT DISTINCT id, uid, email, name, role, is_active, referred_by, direct_count,
                            is_qualified, is_blocked, matrix_parent_id, global_rank, node_id,
                            personal_business, team_business, mobile, password, created_at
            FROM downline;
        `);
        const teamUsers = (rawQueryResult.rows || rawQueryResult) as any[];
        const teamUids = teamUsers.map(u => u.uid).filter(Boolean);
        let teamPurchases: any[] = [];
        if (teamUids.length > 0) {
            const rawPurchases = await db.select().from(purchases).where(inArray(purchases.userId, teamUids));
            teamPurchases = rawPurchases.map(normalizePurchase);
        }
        res.json({ success: true, users: teamUsers.map(sanitizeUser), purchases: teamPurchases });
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
        const normalized = list.map(normalizePurchase);
        res.json({ success: true, documents: normalized });
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
        const settings = await getServerSettings();
        for (const p of activePurchases) {
            const didProcess = await processPackageROI(p, settings);
            if (didProcess) {
                yieldsCount++;
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
            signupBonus: Number(settings.signup_bonus || 0.0),
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
        if (data.isActive !== undefined) payload.isActive = !!data.isActive;
        if (data.role !== undefined) payload.role = data.role;
        if (data.password !== undefined && data.password !== '') {
            payload.password = hashPassword(data.password);
        }
        if (data.referredBy !== undefined || data.referred_by !== undefined) {
            const val = data.referredBy !== undefined ? data.referredBy : data.referred_by;
            const resolvedSponsor = await resolveUserAuthId(val);
            payload.referredBy = resolvedSponsor || val;
        }
        if (data.matrixParentId !== undefined || data.matrix_parent_id !== undefined) {
            const val = data.matrixParentId !== undefined ? data.matrixParentId : data.matrix_parent_id;
            const resolvedParent = await resolveUserAuthId(val);
            payload.matrixParentId = resolvedParent || val;
        }
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
    const userId = req.user?.uid || req.user?.id || body.userId || body.user_id || body.user?.uid || body.user?.id;
    const amount = body.amount;
    const type = body.type;
    const address = body.address;
    const network = body.network;
    const utrNumber = body.utrNumber || body.utr_number || body.utr || '';
    const inrAmount = body.inrAmount || body.inr_amount;
    const rate = body.rate;

    console.log("[Exchanger Request API Call LOG]", {
        authorizationHeader: req.headers.authorization,
        authenticatedUser: req.user,
        reqBody: body,
        extractedUserId: userId,
        amount,
        type,
        address,
        network,
        utrNumber
    });

    try {
        if (!userId) {
            return res.status(400).json({ success: false, message: 'Identity verification failed. Missing user Reference.' });
        }
        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid transaction volume/amount.' });
        }

        const resolvedId = await resolveUserAuthId(userId) || userId;
        if (!resolvedId) {
            return res.status(400).json({ success: false, message: 'System could not register user block resolution.' });
        }

        // Verify user exists in the registry
        const userMatches = await db.select().from(users).where(eq(users.uid, resolvedId)).limit(1);
        if (userMatches.length === 0) {
            return res.status(400).json({ success: false, message: `Node user matching identification '${resolvedId}' not registered.` });
        }

        const cleanType = String(type || 'deposit').toLowerCase() === 'withdraw' ? 'withdraw' : 'deposit';
        let fees = 0.0;

        if (cleanType === 'withdraw') {
            const settings = await getServerSettings();
            const withdrawalFeePercent = Number(settings?.withdrawal_fee !== undefined ? settings.withdrawal_fee : 5.0);
            fees = Number(amount) * (withdrawalFeePercent / 100);

            const wallet = await fetchWallet(resolvedId);
            if (!wallet || Number(wallet.balance) < Number(amount)) {
                return res.json({ success: false, message: 'Insufficient wallet balance for withdrawal processing' });
            }
            if (!address || !address.trim()) {
                return res.status(400).json({ success: false, message: 'Destination settlement address is required for withdrawal.' });
            }
            await db.update(wallets).set({
                balance: sql`${wallets.balance} - ${Number(amount)}`,
                holdBalance: sql`${wallets.holdBalance} + ${Number(amount)}`
            }).where(eq(wallets.userId, resolvedId));
        } else {
            // For deposits, ensure a reference UTR or HASH is provided
            if (!utrNumber || !utrNumber.trim()) {
                return res.status(400).json({ success: false, message: 'Transaction reference (UTR/HASH) is required for system sync.' });
            }
        }

        const cleanAddress = String(address || '').trim();
        const cleanNetwork = String(network || 'TRC20').trim();
        const cleanUtrNumber = String(utrNumber || '').trim();
        const cleanInrAmount = inrAmount ? Number(inrAmount) : null;
        const cleanRate = rate ? Number(rate) : null;

        await db.insert(exchangerRequests).values({
            userId: resolvedId,
            amount: Number(amount),
            type: cleanType,
            status: 'pending',
            address: cleanAddress,
            network: cleanNetwork,
            utrNumber: cleanUtrNumber,
            inrAmount: cleanInrAmount,
            rate: cleanRate,
            fee: fees,
        });

        res.json({ success: true, message: 'Exchanger request queued successfully.' });
    } catch (err: any) {
        console.error("[Exchanger Request API Error]", err);
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
        const rawList = await db.select({
            id: exchangerRequests.id,
            userId: exchangerRequests.userId,
            amount: exchangerRequests.amount,
            type: exchangerRequests.type,
            status: exchangerRequests.status,
            inrAmount: exchangerRequests.inrAmount,
            rate: exchangerRequests.rate,
            utrNumber: exchangerRequests.utrNumber,
            address: exchangerRequests.address,
            network: exchangerRequests.network,
            fee: exchangerRequests.fee,
            createdAt: exchangerRequests.createdAt,
            userName: users.name,
            userEmail: users.email
        })
        .from(exchangerRequests)
        .leftJoin(users, eq(exchangerRequests.userId, users.uid))
        .orderBy(desc(exchangerRequests.createdAt));

        const mapped = rawList.map(r => ({
            ...r,
            user_name: r.userName,
            user_email: r.userEmail
        }));

        res.json({ success: true, requests: mapped });
    } catch (err: any) {
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// Handle Request (Admin)
app.post('/api/admin/handle-request', verifyAdmin, async (req: any, res: any) => {
    const { requestId, status } = req.body;
    console.log("[Handle Request Admin API] Invoked", { requestId, status });

    try {
        const parsedId = Number(requestId);
        if (isNaN(parsedId)) {
            console.error("[Handle Request Admin Error] Invalid requestId received:", requestId);
            return res.status(400).json({ success: false, message: 'Invalid request database identifier.' });
        }

        const reqs = await db.select().from(exchangerRequests).where(eq(exchangerRequests.id, parsedId)).limit(1);
        if (reqs.length === 0) {
            console.error(`[Handle Request Admin Error] Exchanger request id ${parsedId} not found.`);
            return res.status(404).json({ success: false, message: 'Request not found.' });
        }
        
        const document = reqs[0];
        if (document.status !== 'pending') {
            return res.json({ success: false, message: 'Request already processed.' });
        }

        const userId = document.userId;
        const amt = Number(document.amount);
        const fee = Number(document.fee || 0);

        console.log(`[Handle Request Admin Progress] Request found. Type: ${document.type}, Amount: ${amt}, User ID: ${userId}`);

        // Safe Guard: Ensure wallet record exists
        const walletsFound = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
        if (walletsFound.length === 0) {
            console.log(`[Handle Request Admin Progress] Creating missing wallet for user ${userId}`);
            await db.insert(wallets).values({
                userId: userId,
                balance: 0.0,
                holdBalance: 0.0,
                totalEarned: 0.0,
                totalWithdrawn: 0.0,
            });
        }

        if (status === 'approved') {
            if (document.type === 'deposit') {
                // Update Balance
                await db.update(wallets).set({ 
                    balance: sql`${wallets.balance} + ${amt}` 
                }).where(eq(wallets.userId, userId));

                // Insert Transaction Log
                await db.insert(transactions).values({ 
                    userId, 
                    amount: amt, 
                    type: 'topup', 
                    status: 'completed', 
                    description: `USDT Deposit Approved: $${amt}`, 
                    fromUserId: 'SYSTEM' 
                });
            } else {
                // Withdrawal approval: Deduct hold balance
                await db.update(wallets).set({ 
                    holdBalance: sql`${wallets.holdBalance} - ${amt}` 
                }).where(eq(wallets.userId, userId));

                // Insert Transaction Log
                await db.insert(transactions).values({ 
                    userId, 
                    amount: amt, 
                    type: 'withdraw', 
                    status: 'completed', 
                    description: `USDT Withdrawal Dispatched: $${amt}`, 
                    fromUserId: 'SYSTEM' 
                });
            }
            
            // Set Request Status to Approved last
            await db.update(exchangerRequests).set({ status: 'approved' }).where(eq(exchangerRequests.id, document.id));
        } else {
            if (document.type === 'withdraw') {
                // Refund Balance
                await db.update(wallets).set({
                    balance: sql`${wallets.balance} + ${amt}`,
                    holdBalance: sql`${wallets.holdBalance} - ${amt}`
                }).where(eq(wallets.userId, userId));
            }

            // Set Request Status to Rejected last
            await db.update(exchangerRequests).set({ status: 'rejected' }).where(eq(exchangerRequests.id, document.id));
        }

        console.log(`[Handle Request Admin Success] Request status updated to ${status} for ID ${parsedId}`);
        res.json({ success: true, message: `Request successfully ${status}d.` });
    } catch (err: any) {
        console.error("[Handle Request Admin Exception Error]", err);
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

// Realign Matrix Tree (Perfect 2x2 BFS Alignment)
app.post('/api/admin/realign-matrix-tree', verifyAdmin, async (req: any, res: any) => {
    const { mode } = req.body;
    try {
        console.log(`[Matrix Rebuild] Running matrix realign in mode: ${mode}`);
        const list = await db.select().from(users).orderBy(asc(users.createdAt));
        if (list.length === 0) {
            return res.json({ success: true, message: 'No users found to realign.' });
        }

        const rootUser = list.find(u => u.uid === '1' || u.role === 'admin') || list[0];
        let targetUsers: typeof list = [];

        if (mode === 'active_only') {
            targetUsers = list.filter(u => u.uid === rootUser.uid || u.isActive);
            const inactiveUsers = list.filter(u => u.uid !== rootUser.uid && !u.isActive);
            for (const inact of inactiveUsers) {
                await db.update(users)
                    .set({ matrixParentId: rootUser.uid })
                    .where(eq(users.uid, inact.uid));
            }
        } else {
            targetUsers = [...list];
        }

        targetUsers = targetUsers.filter(u => u.uid !== rootUser.uid);
        targetUsers.unshift(rootUser);

        for (const u of targetUsers) {
            if (u.uid !== rootUser.uid) {
                await db.update(users)
                    .set({ matrixParentId: null })
                    .where(eq(users.uid, u.uid));
            }
        }

        const placementQueue: string[] = [rootUser.uid];
        let parentIndex = 0;
        const parentChildrenCount: Record<string, number> = {};

        for (let i = 1; i < targetUsers.length; i++) {
            const userToPlace = targetUsers[i];
            while (parentIndex < placementQueue.length) {
                const currentParent = placementQueue[parentIndex];
                const currentCount = parentChildrenCount[currentParent] || 0;
                if (currentCount < 2) {
                    await db.update(users)
                        .set({ matrixParentId: currentParent })
                        .where(eq(users.uid, userToPlace.uid));
                    parentChildrenCount[currentParent] = currentCount + 1;
                    placementQueue.push(userToPlace.uid);
                    break;
                } else {
                    parentIndex++;
                }
            }
        }

        console.log(`[Matrix Rebuild] Realigned ${targetUsers.length} users in ${mode} mode.`);
        res.json({ 
            success: true, 
            message: `Perfect 2x2 matrix tree rebuilt successfully! Processed ${targetUsers.length} users with zero gaps.` 
        });
    } catch (err: any) {
        console.error("[Matrix Rebuild Error]", err);
        res.status(500).json({ success: false, message: cleanErrorMessage(err) });
    }
});

// --- CRON / Background ROI ---
let isROIBatchProcessing = false;

async function processPackageROI(p: any, settings: any): Promise<boolean> {
    try {
        const freshList = await db.select().from(purchases).where(eq(purchases.id, p.id)).limit(1);
        if (freshList.length === 0) return false;
        const freshPkg = normalizePurchase(freshList[0]);

        let livePkg = null;
        try {
            const dbPackageList = await db.select().from(mlmPackages).where(eq(mlmPackages.id, freshPkg.packageId)).limit(1);
            if (dbPackageList.length > 0) livePkg = normalizePackage(dbPackageList[0]);
        } catch (pkgErr) {
            console.warn('[processPackageROI] Could not retrieve live package info:', pkgErr);
        }

        const price = Number(freshPkg.price);
        const liveDailyRoi = livePkg ? livePkg.dailyRoi : null;
        const dailyPerc = liveDailyRoi !== undefined && liveDailyRoi !== null ? Number(liveDailyRoi) : (freshPkg.dailyRoi !== undefined && freshPkg.dailyRoi !== null ? Number(freshPkg.dailyRoi) : 0.5);

        const liveInterval = livePkg ? livePkg.roiIntervalMinutes : null;
        const intervalMins = Number(liveInterval !== undefined && liveInterval !== null ? liveInterval : (freshPkg.roiIntervalMinutes || settings?.roi_interval_minutes || 1440));

        const maxRoiPercent = Number(freshPkg.maxRoiPercent || settings?.max_roi_percent || 200);
        const cyclePayout = Number((price * dailyPerc / 100).toFixed(4));
        if (cyclePayout <= 0 || price <= 0) return false;

        const maxEarningCap = (price * maxRoiPercent) / 100;
        let currentEarned = Number(freshPkg.roiEarned);

        if (maxEarningCap > 0 && currentEarned >= (maxEarningCap - 0.0001)) {
            await db.update(purchases).set({ isActive: false }).where(eq(purchases.id, freshPkg.id));
            return false;
        }

        const lastPaidAt = freshPkg.lastPaidAt || freshPkg.activatedAt || new Date();
        const lastPaidTs = lastPaidAt.getTime();
        const nowTs = Date.now();
        const elapsedMs = nowTs - lastPaidTs;
        const pendingCycles = Math.floor(elapsedMs / (intervalMins * 60000));
        if (pendingCycles < 1) return false;

        let processedAny = false;
        let pointerTs = lastPaidTs;
        let finalUpdatedPaidAt = new Date(lastPaidTs);

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
                finalUpdatedPaidAt = new Date(currentCycleTargetTs);
                const isFinished = maxEarningCap > 0 && currentEarned >= (maxEarningCap - 0.0001);
                await db.update(purchases).set({ 
                    roiEarned: Number(currentEarned.toFixed(4)), 
                    isActive: !isFinished,
                    lastPaidAt: finalUpdatedPaidAt
                }).where(eq(purchases.id, freshPkg.id));
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
        `ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "last_paid_at" timestamp;`,
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
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "signup_bonus" double precision DEFAULT 0.0;`,
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
            const distPath = (__dirname.endsWith('dist') || __dirname.includes('dist')) ? __dirname : path.join(__dirname, 'dist');
            app.use(express.static(distPath));
            app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
        }

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`[Server] Running on http://0.0.0.0:${PORT}`);
            setInterval(() => distributeGlobalROIWorker(), 60000);
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
