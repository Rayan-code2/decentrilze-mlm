import { db } from '../db/index.ts';
import { users, wallets, mlmPackages, purchases, transactions, exchangerRequests, goldQueue, settingsTable } from '../db/schema.ts';
import { eq, or, desc, asc, and, sql } from 'drizzle-orm';

// Helper: Resolve User Auth ID from either Auth ID, serial ID or Node ID
export async function resolveUserAuthId(identifier: any): Promise<string | null> {
  if (identifier === undefined || identifier === null) return null;
  const strId = String(identifier).trim();
  if (!strId) return null;
  if (strId === '1' || strId.toLowerCase() === 'system') return '1';
  
  try {
    // 1. Check by Firebase Auth UID (uid field)
    const userByUid = await db.select().from(users).where(eq(users.uid, strId)).limit(1);
    if (userByUid.length > 0) return userByUid[0].uid;

    // 2. Check by Node ID (node_id field)
    const userByNode = await db.select().from(users).where(eq(users.nodeId, strId)).limit(1);
    if (userByNode.length > 0) return userByNode[0].uid;

    // 3. Check by Drizzle numeric primary id
    if (/^\d+$/.test(strId)) {
      const userById = await db.select().from(users).where(eq(users.id, parseInt(strId, 10))).limit(1);
      if (userById.length > 0) return userById[0].uid;
    }
  } catch (err) {
    console.error("[resolveUserAuthId Error]", err);
  }

  return strId;
}

// Fetch user profile from Postgres
export async function fetchUserById(userId: string) {
  try {
    const list = await db.select().from(users).where(eq(users.uid, userId)).limit(1);
    return list[0] || null;
  } catch (err) {
    console.error(`[fetchUserById Error] userId: ${userId}`, err);
    return null;
  }
}

// Fetch user wallet from Postgres
export async function fetchWallet(userId: string) {
  try {
    const list = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
    return list[0] || null;
  } catch (err) {
    console.error(`[fetchWallet Error] userId: ${userId}`, err);
    return null;
  }
}

// Clear or auto-seed system settings
export async function getServerSettings(): Promise<any> {
  try {
    const list = await db.select().from(settingsTable).limit(1);
    if (list.length > 0) {
      const s = list[0];
      return {
        id: s.id,
        telegram_link: s.telegramLink || 'https://t.me/protocol_official',
        marquee_text: s.marqueeText || '',
        hall_of_fame_marquee: s.hallOfFameMarquee || '',
        admin_address_trc20: s.adminAddressTrc20 || 'SYSTEM_PENDING',
        admin_address_bep20: s.adminAddressBep20 || 'SYSTEM_PENDING',
        admin_address_erc20: s.adminAddressErc20 || 'SYSTEM_PENDING',
        min_deposit: s.minDeposit ?? 1.0,
        min_withdrawal: s.minWithdrawal ?? 1.0,
        max_withdrawal: s.maxWithdrawal ?? 10000.0,
        boosting_min_directs: s.boostingMinDirects ?? 2,
        boosting_min_pkg_price: s.boostingMinPkgPrice ?? 10.0,
        spin_min_pkg_price: s.spinMinPkgPrice ?? 10.0,
        spin_min_directs: s.spinMinDirects ?? 0,
        spin_cooldown_hours: s.spinCooldownHours ?? 24,
        boosting_reward: s.boostingReward ?? 20.0,
        deposit_fee: s.depositFee ?? 0.0,
        withdrawal_fee: s.withdrawalFee ?? 5.0,
        spin_cost: s.spinCost ?? 1.0,
        referrals_for_free_spins: s.referralsForFreeSpins ?? 5,
        spins_per_milestone: s.spinsPerMilestone ?? 1,
        enable_deposit: s.enableDeposit !== null ? s.enableDeposit : true,
        enable_withdrawal: s.enableWithdrawal !== null ? s.enableWithdrawal : true,
        enable_swap: s.enableSwap !== null ? s.enableSwap : true,
        roi_interval_minutes: s.roiIntervalMinutes ?? 1440,
        rank_rewards: s.rankRewards ? JSON.parse(s.rankRewards) : [],
        spin_rewards: s.spinRewards ? JSON.parse(s.spinRewards) : [],
      };
    }

    const defaultSpinRewards = [
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
    const defaultRankRewards = [
      { id: '1', rank_name: 'Explorer', personal_business: 100, team_business: 500, reward_amount: 50, icon_type: 'star' },
      { id: '2', rank_name: 'Commander', personal_business: 500, team_business: 2500, reward_amount: 200, icon_type: 'award' },
      { id: '3', rank_name: 'Captain', personal_business: 1000, team_business: 10000, reward_amount: 1000, icon_type: 'shield' }
    ];

    const insertedList = await db.insert(settingsTable).values({
      telegramLink: 'https://t.me/protocol_official',
      marqueeText: 'Welcome to Cryptospiral Matrix Network!',
      hallOfFameMarquee: '',
      adminAddressTrc20: 'SYSTEM_PENDING',
      adminAddressBep20: 'SYSTEM_PENDING',
      adminAddressErc20: 'SYSTEM_PENDING',
      minDeposit: 1.0,
      minWithdrawal: 1.0,
      maxWithdrawal: 10000.0,
      boostingMinDirects: 2,
      boostingMinPkgPrice: 10.0,
      spinMinPkgPrice: 10.0,
      spinMinDirects: 0,
      spinCooldownHours: 24,
      boostingReward: 20.0,
      depositFee: 0.0,
      withdrawalFee: 5.0,
      spinCost: 1.0,
      referralsForFreeSpins: 5,
      spinsPerMilestone: 1,
      enableDeposit: true,
      enableWithdrawal: true,
      enableSwap: true,
      roiIntervalMinutes: 1440,
      rankRewards: JSON.stringify(defaultRankRewards),
      spinRewards: JSON.stringify(defaultSpinRewards),
    }).returning();

    return {
      id: insertedList[0].id,
      telegram_link: 'https://t.me/protocol_official',
      marquee_text: 'Welcome to Cryptospiral Matrix Network!',
      hall_of_fame_marquee: '',
      admin_address_trc20: 'SYSTEM_PENDING',
      admin_address_bep20: 'SYSTEM_PENDING',
      admin_address_erc20: 'SYSTEM_PENDING',
      min_deposit: 1.0,
      min_withdrawal: 1.0,
      max_withdrawal: 10000.0,
      boosting_min_directs: 2,
      boosting_min_pkg_price: 10.0,
      spin_min_pkg_price: 10.0,
      spin_min_directs: 0,
      spin_cooldown_hours: 24,
      boosting_reward: 20.0,
      deposit_fee: 0.0,
      withdrawal_fee: 5.0,
      spin_cost: 1.0,
      referrals_for_free_spins: 5,
      spins_per_milestone: 1,
      enable_deposit: true,
      enable_withdrawal: true,
      enable_swap: true,
      roi_interval_minutes: 1440,
      rank_rewards: defaultRankRewards,
      spin_rewards: defaultSpinRewards,
    };
  } catch (error) {
    console.error('[getServerSettings Fail-safe Device]', error);
    return {};
  }
}

// Find next available slot inside the matrix tree
export async function findGlobalMatrixParent(): Promise<string> {
  try {
    const list = await db.select().from(users).orderBy(asc(users.createdAt));
    for (const u of list) {
      if (!u.isActive && u.uid !== '1') continue; // Only place under active accounts or root admin
      const children = await db.select()
        .from(users)
        .where(eq(users.matrixParentId, u.uid));
      
      if (children.length < 2) {
        return u.uid;
      }
    }
    return '1';
  } catch (error) {
    console.error("Critical Matrix Search Error:", error);
    return '1';
  }
}

// Core business logic: distributes any MLM system payouts and coordinates capping limits
export async function distributeIncomeServer(
  rawUserId: string,
  amount: number,
  type: string,
  description: string,
  fromUserId?: string,
  incomeLevel?: number,
  skipCappingOverride: boolean = false
): Promise<boolean> {
  try {
    const userId = await resolveUserAuthId(rawUserId) || rawUserId;
    const isAdmin = userId === '1';

    // Get current/destination wallet
    let wallet = await fetchWallet(userId);
    if (!wallet) {
      const newWallets = await db.insert(wallets).values({
        userId: userId,
        balance: 0.0,
        totalEarned: 0.0,
        totalWithdrawn: 0.0,
        walletRoiEarned: 0.0,
        roiIncome: 0.0,
        directIncome: 0.0,
        levelIncome: 0.0,
        matrixIncome: 0.0,
        holdBalance: 0.0,
        totalRoiRate: 0.0,
        packageRoiRate: 0.0,
        baseRoiRate: 0.0,
        dailyPackageRoi: 0.0,
        availableSpins: 0,
      }).returning();
      wallet = newWallets[0];
    }

    const cappingTypes = ['roi', 'matrix_income', 'level_income', 'pool_payout'];
    const isSubjectToCapping = cappingTypes.includes(type.toLowerCase());
    const skipCapping = skipCappingOverride || !isSubjectToCapping || isAdmin;

    let finalAmountForUser = 0;
    const amountToCredit = Number(amount);

    if (skipCapping) {
      finalAmountForUser = amountToCredit;
    } else {
      // Load user package activations
      const activePurchases = await db.select()
        .from(purchases)
        .where(and(eq(purchases.userId, userId), eq(purchases.isActive, true)));
      
      activePurchases.sort((a, b) => a.activatedAt!.getTime() - b.activatedAt!.getTime());

      let remainingIncomeForCapping = amountToCredit;

      if (activePurchases.length === 0) {
        console.log(`[Capping] Surplus $${amountToCredit.toFixed(4)} from ${userId} sent to Admin (No active packages)`);
        await distributeIncomeServer('1', amountToCredit, type, `${description} (Surplus from ${userId} - No active packages)`, fromUserId, incomeLevel, true);
      } else {
        for (const pkg of activePurchases) {
          if (remainingIncomeForCapping <= 0) break;

          const pkgPrice = Number(pkg.price);
          const maxPerc = Number(pkg.maxRoiPercent || 260);

          // Skip capping for packages purchased within last 60 seconds (grace period)
          const age = (Date.now() - pkg.activatedAt!.getTime()) / 1000;
          if (age < 60) {
            finalAmountForUser += remainingIncomeForCapping;
            remainingIncomeForCapping = 0;
            break;
          }

          if (pkgPrice <= 0) continue;

          const currentEarned = Number(pkg.roiEarned);

          if (maxPerc <= 0) {
            finalAmountForUser += remainingIncomeForCapping;
            await db.update(purchases)
              .set({ roiEarned: sql`${purchases.roiEarned} + ${remainingIncomeForCapping}` })
              .where(eq(purchases.id, pkg.id));
            remainingIncomeForCapping = 0;
            break;
          }

          let maxEarning = (pkgPrice * maxPerc) / 100;
          // $20 package special $4000 cap rule
          if (pkgPrice === 20 && (maxPerc === 0 || maxPerc === 200)) maxEarning = 4000;

          const spaceAvailableForIncome = maxEarning - currentEarned;
          if (spaceAvailableForIncome > 0) {
            const toAdd = Math.min(remainingIncomeForCapping, spaceAvailableForIncome);
            const newEarned = Number((currentEarned + toAdd).toFixed(4));
            const stillActive = newEarned < maxEarning;

            await db.update(purchases)
              .set({ 
                roiEarned: sql`${purchases.roiEarned} + ${toAdd}`, 
                isActive: stillActive 
              })
              .where(eq(purchases.id, pkg.id));

            finalAmountForUser += toAdd;
            remainingIncomeForCapping -= toAdd;
          }
        }

        if (remainingIncomeForCapping > 0.0001) {
          console.log(`[Capping] Surplus $${remainingIncomeForCapping.toFixed(4)} from ${userId} routed upstream.`);
          await distributeIncomeServer('1', remainingIncomeForCapping, type, `${description} (Surplus capping from ${userId})`, fromUserId, incomeLevel, true);
        }
      }
    }

    // Ledger entry for transparency
    await db.insert(transactions).values({
      userId: userId,
      amount: Number(finalAmountForUser.toFixed(4)),
      type: type,
      status: 'completed',
      description: finalAmountForUser < amountToCredit && !skipCapping ? `${description} (Capped)` : description,
      fromUserId: fromUserId || 'SYSTEM',
      incomeLevel: incomeLevel || null,
    });

    if (finalAmountForUser > 0) {
      const updatePayload: any = {
        balance: sql`${wallets.balance} + ${finalAmountForUser}`,
        totalEarned: sql`${wallets.totalEarned} + ${finalAmountForUser}`,
      };

      const typeLower = type.toLowerCase();
      if (typeLower === 'roi' || typeLower.includes('yield')) {
        updatePayload.roiIncome = sql`${wallets.roiIncome} + ${finalAmountForUser}`;
        updatePayload.walletRoiEarned = sql`${wallets.walletRoiEarned} + ${finalAmountForUser}`;
      } else if (typeLower.includes('direct')) {
        updatePayload.directIncome = sql`${wallets.directIncome} + ${finalAmountForUser}`;
      } else if (typeLower.includes('level')) {
        updatePayload.levelIncome = sql`${wallets.levelIncome} + ${finalAmountForUser}`;
      } else if (typeLower.includes('pool') || typeLower.includes('matrix')) {
        updatePayload.matrixIncome = sql`${wallets.matrixIncome} + ${finalAmountForUser}`;
      }

      await db.update(wallets)
        .set(updatePayload)
        .where(eq(wallets.userId, userId));
    }

    return true;
  } catch (error) {
    console.error('Core Income Distribution Failed:', error);
    return false;
  }
}

// Scans and handles qualifications for the golden queue pool
export async function triggerBoostingServer(rawId: string) {
  const diagnostic: any = {
    rawId,
    resolvedAuthId: null,
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

    const settings = await getServerSettings();
    const minPkgPrice = Number(settings?.boosting_min_pkg_price ?? 10);
    const minDirects = Number(settings?.boosting_min_directs ?? 2);
    const reward = Number(settings?.boosting_reward ?? 20);

    const userDoc = await fetchUserById(userId);
    if (!userDoc) {
      diagnostic.error = "User profile not found";
      return diagnostic;
    }
    diagnostic.foundDoc = true;

    // Direct counts verification
    const directReferrals = await db.select()
      .from(users)
      .where(eq(users.referredBy, userId));
    
    const currentDirects = directReferrals.length;
    diagnostic.actualDirects = currentDirects;

    if (currentDirects !== userDoc.directCount) {
      await db.update(users)
        .set({ directCount: currentDirects })
        .where(eq(users.uid, userId));
    }

    // Active package checks
    const userPurchases = await db.select()
      .from(purchases)
      .where(eq(purchases.userId, userId));
    
    const hasQualifiedPkg = userPurchases.some(p => Number(p.price) >= minPkgPrice);
    const hasMinDirects = currentDirects >= minDirects;

    diagnostic.qualifiedPkg = hasQualifiedPkg;
    diagnostic.qualifiedDirects = hasMinDirects;

    if (hasQualifiedPkg && hasMinDirects) {
      const queueEntries = await db.select()
        .from(goldQueue)
        .where(eq(goldQueue.userId, userId));
      
      const activeInQueue = queueEntries.some(e => !e.completed);
      if (activeInQueue) {
        diagnostic.alreadyInQueue = true;
        return diagnostic;
      }

      console.log(`[Boosting] Qualifying User ${userId} for Global Gold Pool`);
      await db.insert(goldQueue).values({
        userId: userId,
        completed: false,
        isRebirth: false,
      });

      diagnostic.addedToQueue = true;
      await processBoostingQueue(reward);
    }
    return diagnostic;
  } catch (error: any) {
    console.error("[Boosting Server Error]", error);
    diagnostic.error = error.message;
    return diagnostic;
  }
}

// Distributes team volume reward payouts whenever a 12-user cycle completes
export async function processBoostingQueue(reward: number) {
  try {
    const queue = await db.select().from(goldQueue).orderBy(asc(goldQueue.createdAt));
    const completedEntries = queue.filter(e => e.completed);
    let completedCount = completedEntries.length;

    while (queue.length >= (completedCount + 1) * 12) {
      const winnerEntry = queue.find(e => !e.completed);
      if (!winnerEntry) break;

      console.log(`[Boosting System] Winner found for cycle payout: ${winnerEntry.userId}`);
      await db.update(goldQueue)
        .set({ completed: true, payoutAt: new Date() })
        .where(eq(goldQueue.id, winnerEntry.id));

      await distributeIncomeServer(winnerEntry.userId, reward, 'pool_payout', 'Boosting Gold Global Pool Payout', 'SYSTEM');

      // Infinite Rebirth entry
      await db.insert(goldQueue).values({
        userId: winnerEntry.userId,
        completed: false,
        isRebirth: true,
      });

      completedCount++;
    }
  } catch (error) {
    console.error("[processBoostingQueue Error]", error);
  }
}

// Increments parent and team business aggregates upon purchase
export async function updateBusinessVolumeServer(buyerId: string, amount: number) {
  try {
    await db.update(users)
      .set({ personalBusiness: sql`${users.personalBusiness} + ${amount}` })
      .where(eq(users.uid, buyerId));

    let currentUserId = buyerId;
    for (let depth = 1; depth <= 15; depth++) {
      const userList = await db.select().from(users).where(eq(users.uid, currentUserId)).limit(1);
      if (userList.length === 0) break;
      const userDoc = userList[0];

      const sponsorId = userDoc.referredBy;
      if (!sponsorId || sponsorId === '0' || sponsorId === currentUserId) break;

      await db.update(users)
        .set({ teamBusiness: sql`${users.teamBusiness} + ${amount}` })
        .where(eq(users.uid, sponsorId));

      await checkAndAwardRankRewards(sponsorId);

      currentUserId = sponsorId;
    }
  } catch (e) {
    console.error("[updateBusinessVolumeServer] Error:", e);
  }
}

// Checks and awards dynamic rank rewards based on sponsor team business metrics
export async function checkAndAwardRankRewards(userId: string) {
  try {
    const settings = await getServerSettings();
    const rewards = settings?.rank_rewards || [];
    if (rewards.length === 0) return;

    const userDoc = await fetchUserById(userId);
    if (!userDoc) return;

    const userPurchases = await db.select()
      .from(purchases)
      .where(and(eq(purchases.userId, userId), eq(purchases.isActive, true)));

    if (userPurchases.length === 0 && userId !== '1') {
      return;
    }

    const maxActivePackagePrice = userPurchases.reduce((max, p) => Math.max(max, Number(p.price)), 0);

    const claimedTx = await db.select()
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.type, 'rank_reward')));
    const claimedRewardNames = claimedTx.map(tx => tx.description ? tx.description.split(':')[0].trim() : '');

    for (const reward of rewards) {
      if (claimedRewardNames.includes(reward.rank_name)) continue;

      const targetSelfPkg = Number(reward.min_self_package || 0);
      if (maxActivePackagePrice < targetSelfPkg) continue;

      let qualified = false;
      const targetDepth = Number(reward.target_depth || 0);

      if (targetDepth === 0) {
        if (Number(userDoc.personalBusiness) >= Number(reward.personal_business || 0) &&
            Number(userDoc.teamBusiness) >= Number(reward.team_business || 0)) {
          qualified = true;
        }
      } else {
        const levelBiz = await calculateLevelBusiness(userId, targetDepth);
        if (Number(userDoc.personalBusiness) >= Number(reward.personal_business || 0) &&
            levelBiz >= Number(reward.team_business || 0)) {
          qualified = true;
        }
      }

      if (qualified) {
        console.log(`[RankReward Match] User ${userId} claims: ${reward.rank_name}`);
        await distributeIncomeServer(userId, Number(reward.reward_amount), 'rank_reward', `${reward.rank_name}: Business Milestone Reward`, 'SYSTEM');
      }
    }
  } catch (e) {
    console.error("[checkAndAwardRankRewards] Error:", e);
  }
}

// Calculates business totals for downlines at exactly depth X
export async function calculateLevelBusiness(userId: string, depth: number): Promise<number> {
  try {
    let currentLevelUsers = [userId];
    let allTargetRefUsers: string[] = [];

    for (let d = 1; d <= depth; d++) {
      if (currentLevelUsers.length === 0) break;
      
      const nextLevel = await db.select({ uid: users.uid })
        .from(users)
        .where(sql`${users.referredBy} IN (${currentLevelUsers.map(u => `'${u}'`).join(',')})`);
      
      const uids = nextLevel.map(u => u.uid);
      allTargetRefUsers = allTargetRefUsers.concat(uids);
      currentLevelUsers = uids;
    }

    let sponsorBiz = 0;
    if (allTargetRefUsers.length > 0) {
      const userPurchases = await db.select({ price: purchases.price })
        .from(purchases)
        .where(sql`${purchases.userId} IN (${allTargetRefUsers.map(u => `'${u}'`).join(',')})`);
      sponsorBiz = userPurchases.reduce((acc, p) => acc + Number(p.price), 0);
    }
    return sponsorBiz;
  } catch (e) {
    console.error("[calculateLevelBusiness] Error:", e);
    return 0;
  }
}
