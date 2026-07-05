import { User, Wallet, MLMPackage, ExchangerRequest, Transaction, Purchase } from '../types';
import { MLM_CONFIG } from '../constants';

export const mockApi = {
  auth: {
    getCurrentUser: async (): Promise<User | null> => {
      const saved = localStorage.getItem('spiral_user');
      if (saved) {
        const user = JSON.parse(saved);
        const rank = await mockApi.db.getGlobalRank(user.id);
        const nodeId = user.node_id || `NX-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        return { ...user, global_rank: rank, node_id: nodeId };
      }
      return null;
    },
    signOut: async () => {
      localStorage.removeItem('spiral_user');
    },
    signUp: async (email: string, pass: string, sponsorId: string, mobile?: string) => {
      const users = await mockApi.db.getAllUsers();
      if (users.find(u => u.email === email)) {
        throw new Error('User already exists with this email');
      }

      // Find Team Matrix Parent (Individual Team Spillover)
      const matrixParentId = await mockApi.db.findTeamMatrixParent(sponsorId);

      const newUser: User = {
        id: (users.length + 1).toString(),
        name: email.split('@')[0].toUpperCase(),
        email: email,
        mobile: mobile || '',
        role: 'user',
        is_active: false,
        created_at: new Date().toISOString(),
        referred_by: sponsorId,
        matrix_parent_id: matrixParentId,
        direct_count: 0,
        is_qualified: false,
        global_rank: users.length + 1,
        node_id: `NX-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
      };

      users.push(newUser);
      localStorage.setItem('spiral_all_users', JSON.stringify(users));
      return { success: true };
    },
    signIn: async (email: string, pass: string) => {
      const users = await mockApi.db.getAllUsers();
      const user = users.find(u => u.email === email);
      
      if (!user) {
        throw new Error('User not found. Please register.');
      }

      // Hardcode admin for test@test.com
      if (email === 'test@test.com') {
        user.role = 'admin';
      }

      // In mock, we accept any password
      return { user };
    }
  },
  db: {
    getPackages: async (): Promise<MLMPackage[]> => {
      const defaultPackages: MLMPackage[] = [
        { id: 'pkg1', name: 'Starter Node', price: 10, daily_roi: 0.10, duration_days: 365, direct_income_percent: 20, matrix_income_percent: 10, level_income_percents: [0.5, 0.5, 1, 1, 0.5, 0.2, 0.2, 0.2, 0.2, 0.2], is_active: true },
        { id: 'pkg2', name: 'Pro Node', price: 20, daily_roi: 0.20, duration_days: 365, direct_income_percent: 20, matrix_income_percent: 10, level_income_percents: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], is_active: true },
        { id: 'pkg3', name: 'Elite Node', price: 30, daily_roi: 0.30, duration_days: 365, direct_income_percent: 20, matrix_income_percent: 10, level_income_percents: [1, 1, 1, 2, 2, 2, 2, 2, 2, 7], is_active: true },
        { id: 'pkg4', name: 'Whale Node', price: 40, daily_roi: 0.40, duration_days: 365, direct_income_percent: 20, matrix_income_percent: 10, level_income_percents: [1, 1, 2, 2, 3, 3, 3, 4, 4, 15], is_active: true },
      ];
      
      const saved = localStorage.getItem('spiral_packages');
      const initialized = localStorage.getItem('spiral_packages_initialized');
      
      if (!saved && !initialized) {
        localStorage.setItem('spiral_packages', JSON.stringify(defaultPackages));
        localStorage.setItem('spiral_packages_initialized', 'true');
        return defaultPackages;
      }
      
      return saved ? JSON.parse(saved) : [];
    },
    getAllPackages: async (): Promise<MLMPackage[]> => {
      return await mockApi.db.getPackages();
    },
    savePackage: async (pkg: MLMPackage) => {
      const packages = await mockApi.db.getPackages();
      
      // Ensure it has an ID if it's new
      if (!pkg.id) {
        pkg.id = `pkg_${Date.now()}`;
      }
      
      const index = packages.findIndex(p => p.id === pkg.id);
      if (index > -1) {
        packages[index] = pkg;
      } else {
        packages.push(pkg);
      }
      localStorage.setItem('spiral_packages', JSON.stringify(packages));
      localStorage.setItem('spiral_packages_initialized', 'true');
      return { success: true };
    },
    deletePackage: async (id: string) => {
      const packages = await mockApi.db.getPackages();
      const filtered = packages.filter(p => p.id !== id);
      localStorage.setItem('spiral_packages', JSON.stringify(filtered));
      return { success: true };
    },
    getCappingLimit: (totalInvestment: number): number => {
      if (totalInvestment <= 0) return 0;
      
      const limits = MLM_CONFIG.CAPPING_LIMITS as {[key: number]: number};
      
      // Match exactly or use fallback
      if (limits[totalInvestment] !== undefined) return limits[totalInvestment];
      
      // If not exact match, find the highest applicable tier
      const tierKeys = Object.keys(limits).map(Number).sort((a,b) => b - a);
      for (const tier of tierKeys) {
        if (totalInvestment >= tier) return limits[tier];
      }
      
      return totalInvestment * 4; // Default fallback: 4x
    },
    distributeIncome: async (userId: string, amount: number, type: string, description: string, fromUserId?: string) => {
      if (amount <= 0) return { success: true };
      
      const walletKey = `spiral_wallet_${userId}`;
      const savedWallet = localStorage.getItem(walletKey);
      if (!savedWallet) return { success: false };
      const wallet = JSON.parse(savedWallet);

      const purchasedKey = `purchased_packages_${userId}`;
      const purchasedIds: string[] = JSON.parse(localStorage.getItem(purchasedKey) || '[]');
      const packages = [
        { id: 'pkg1', price: 10 }, { id: 'pkg2', price: 20 }, { id: 'pkg3', price: 30 }, { id: 'pkg4', price: 40 }
      ];
      const activePkgs = packages.filter(p => purchasedIds.includes(p.id));
      const totalInvestment = activePkgs.reduce((acc, p) => acc + p.price, 0);

      const cap = mockApi.db.getCappingLimit(totalInvestment);
      
      if (totalInvestment > 0 && cap !== Infinity && wallet.total_earned >= cap) {
        if (userId !== '1') {
          await mockApi.db.distributeIncome('1', amount, type, `${description} (Capped from ${userId})`, fromUserId);
        }
        return { success: true };
      }

      let finalAmount = amount;
      if (totalInvestment > 0 && cap !== Infinity && (wallet.total_earned + amount) > cap) {
        finalAmount = Math.max(0, cap - wallet.total_earned);
        const surplus = amount - finalAmount;
        if (surplus > 0 && userId !== '1') {
          await mockApi.db.distributeIncome('1', surplus, type, `${description} (Surplus from ${userId})`, fromUserId);
        }
      }

      if (finalAmount > 0) {
        wallet.balance += finalAmount;
        wallet.total_earned += finalAmount;
        if (type === 'direct_income') wallet.direct_income = (wallet.direct_income || 0) + finalAmount;
        if (type === 'level_income') wallet.level_income = (wallet.level_income || 0) + finalAmount;
        if (type === 'matrix_income' || type === 'pool_payout') wallet.matrix_income = (wallet.matrix_income || 0) + finalAmount;
        localStorage.setItem(walletKey, JSON.stringify(wallet));
        
        await mockApi.db.addTransaction(userId, {
          amount: finalAmount,
          type: type as any,
          description,
          from_user_id: fromUserId
        });
      }
      return { success: true };
    },
    getWallet: async (userId: string): Promise<Wallet | null> => {
      const walletKey = `spiral_wallet_${userId}`;
      const savedWallet = localStorage.getItem(walletKey);
      
      // Calculate current ROI rate from packages with duration check
      const purchasedKey = `purchased_packages_${userId}`;
      const rawPurchases: any[] = JSON.parse(localStorage.getItem(purchasedKey) || '[]');
      const packages = await mockApi.db.getPackages();
      
      const activePkgs = packages.filter(p => {
        const purchase = rawPurchases.find(rp => (typeof rp === 'string' ? rp === p.id : rp.id === p.id));
        if (!purchase) return false;
        
        // If it's the new object format, check expiry
        if (typeof purchase === 'object' && purchase.activated_at) {
          const activatedAt = purchase.activated_at;
          const durationMs = (p.duration_days || 365) * 86400000;
          if (Date.now() - activatedAt > durationMs) return false;
        }
        return true;
      });
      
      // Calculate Highest ROI on Total Active Package Value
      const totalPackageValue = activePkgs.reduce((acc, p) => acc + p.price, 0);
      const maxROI = activePkgs.length > 0 ? Math.max(...activePkgs.map(p => p.daily_roi)) : 0;
      const dailyPackageROI = totalPackageValue * (maxROI / 100);
      
      const settings = await mockApi.db.getSettings() as any;

      if (savedWallet) {
        const wallet = JSON.parse(savedWallet);
        return { 
          ...wallet, 
          daily_package_roi: dailyPackageROI 
        };
      }

      // Default initial wallet
      const signupBonus = Number(settings?.signup_bonus || 0);

      const initialWallet: Wallet = {
        id: `w_${userId}`,
        user_id: userId,
        balance: signupBonus,
        total_earned: signupBonus,
        total_withdrawn: 0,
        last_roi_at: new Date().toISOString(),
        wallet_roi_earned: 0,
        direct_income: 0,
        level_income: 0,
        hold_balance: 0,
        daily_package_roi: dailyPackageROI
      };
      localStorage.setItem(walletKey, JSON.stringify(initialWallet));

      if (signupBonus > 0) {
        const txKey = `spiral_transactions_${userId}`;
        const transactions = JSON.parse(localStorage.getItem(txKey) || '[]');
        const newTx = {
          id: `tx_signup_${Date.now()}`,
          user_id: userId,
          amount: signupBonus,
          type: 'signup_bonus' as any,
          status: 'completed',
          created_at: new Date().toISOString(),
          description: 'Signup Bonus',
          from_user_id: 'SYSTEM'
        };
        transactions.unshift(newTx);
        localStorage.setItem(txKey, JSON.stringify(transactions.slice(0, 100)));
      }

      return initialWallet;
    },
    updateWallet: async (userId: string, data: Partial<Wallet>): Promise<{ success: boolean; message: string }> => {
      const walletKey = `spiral_wallet_${userId}`;
      const savedWallet = localStorage.getItem(walletKey);
      if (savedWallet) {
        const wallet = JSON.parse(savedWallet);
        const { id, ...cleanData } = data;
        const updated = { ...wallet, ...cleanData };
        localStorage.setItem(walletKey, JSON.stringify(updated));
        return { success: true, message: 'Wallet updated successfully' };
      }
      return { success: false, message: 'Wallet not found' };
    },
    getTasks: async () => {
      return [
        { id: 't1', title: 'Join Telegram Channel', description: 'Join our official Telegram channel for updates.', reward: 1, link: 'https://t.me/cryptospiral' },
        { id: 't2', title: 'Follow on Twitter', description: 'Follow our official Twitter account.', reward: 1, link: 'https://twitter.com/cryptospiral' },
      ];
    },
    getTaskSubmissions: async (userId: string) => {
      return [];
    },
    submitTask: async (userId: string, taskId: string, proof: string) => {
      console.log("Submitting task", taskId, "for user", userId, "with proof", proof);
      return { success: true };
    },
    getGlobalRank: async (userId: string): Promise<number> => {
      const users = await mockApi.db.getAllUsers();
      // In a real app, we'd sort by total earnings. 
      // For mock, we'll use a stable rank based on ID and some random factor
      const userIndex = users.findIndex(u => u.id === userId);
      if (userIndex === -1) return 999;
      
      // Simulate a rank that improves slightly over time or based on ID
      // Rank 1 is best. Admin (ID 1) is usually top.
      return userIndex + 1; 
    },
    getExchangerRequests: async (userId?: string): Promise<ExchangerRequest[]> => {
      const requests: ExchangerRequest[] = JSON.parse(localStorage.getItem('spiral_exchanger_requests') || '[]');
      const users = await mockApi.db.getAllUsers();
      const list = requests.map(r => {
        const user = users.find(u => u.id === r.user_id || u.user_id === r.user_id || (u as any).uid === r.user_id);
        return {
          ...r,
          userName: user?.name,
          userEmail: user?.email,
          user_name: user?.name,
          user_email: user?.email,
        };
      });
      if (userId) return list.filter(r => r.user_id === userId);
      return list;
    },
    createExchangerRequest: async (request: Partial<ExchangerRequest>) => {
      const requests: ExchangerRequest[] = JSON.parse(localStorage.getItem('spiral_exchanger_requests') || '[]');
      
      // If withdrawal, deduct balance immediately
      let fee = 0;
      if (request.type === 'withdraw') {
        const walletKey = `spiral_wallet_${request.user_id}`;
        const savedWallet = localStorage.getItem(walletKey);
        if (savedWallet) {
          const wallet = JSON.parse(savedWallet);
          if (wallet.balance < (request.amount || 0)) {
            return { success: false, message: 'Insufficient balance' };
          }
          wallet.balance -= (request.amount || 0);
          localStorage.setItem(walletKey, JSON.stringify(wallet));
          
          // Calculate global fee
          const settings = await mockApi.db.getSettings() as any;
          fee = settings.withdrawal_fee || 5;
        }
      }

      const newRequest: ExchangerRequest = {
        id: `req_${Date.now()}`,
        user_id: request.user_id!,
        amount: request.amount!,
        type: request.type!,
        status: 'pending',
        created_at: new Date().toISOString(),
        fee: fee,
        ...request
      };
      requests.push(newRequest);
      localStorage.setItem('spiral_exchanger_requests', JSON.stringify(requests));
      return { success: true, request: newRequest };
    },
    updateExchangerRequest: async (requestId: string, status: 'approved' | 'rejected') => {
      const requests: ExchangerRequest[] = JSON.parse(localStorage.getItem('spiral_exchanger_requests') || '[]');
      const reqIdx = requests.findIndex(r => r.id === requestId);
      if (reqIdx === -1) return { success: false, message: 'Request not found' };
      
      const request = requests[reqIdx];
      if (request.status !== 'pending') return { success: false, message: 'Request already processed' };
      
      request.status = status;
      
      if (status === 'approved') {
        const wallet = await mockApi.db.getWallet(request.user_id);
        const settings = await mockApi.db.getSettings() as any;
        const depositFeePercent = settings.deposit_fee || 0;

        if (request.type === 'deposit') {
          const fee = (request.amount * depositFeePercent) / 100;
          const finalAmount = request.amount - fee;
          wallet.balance = (wallet.balance || 0) + finalAmount;
          request.fee = fee; // Store for history
        } else if (request.type === 'withdraw') {
          // Withdrawal logic - balance already deducted on request creation
          // Update total withdrawn tracking
          wallet.total_withdrawn = (wallet.total_withdrawn || 0) + request.amount;
        }
        localStorage.setItem(`spiral_wallet_${request.user_id}`, JSON.stringify(wallet));
      } else if (status === 'rejected') {
        if (request.type === 'withdraw') {
          // Refund balance
          const wallet = await mockApi.db.getWallet(request.user_id);
          wallet.balance += request.amount;
          localStorage.setItem(`spiral_wallet_${request.user_id}`, JSON.stringify(wallet));
        }
      }
      
      localStorage.setItem('spiral_exchanger_requests', JSON.stringify(requests));
      return { success: true };
    },
    getTransactions: async (userId: string) => {
      const txKey = `spiral_transactions_${userId}`;
      return JSON.parse(localStorage.getItem(txKey) || '[]');
    },
    addTransaction: async (userId: string, tx: Partial<Transaction>) => {
      const txKey = `spiral_transactions_${userId}`;
      const transactions = JSON.parse(localStorage.getItem(txKey) || '[]');
      const newTx: Transaction = {
        id: `tx_${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        user_id: userId,
        amount: tx.amount || 0,
        type: tx.type || 'roi',
        status: tx.status || 'completed',
        created_at: new Date().toISOString(),
        description: tx.description || '',
        ...tx
      };
      transactions.unshift(newTx);
      localStorage.setItem(txKey, JSON.stringify(transactions.slice(0, 100)));
      return newTx;
    },
    getSettings: async () => {
      const savedSettings = localStorage.getItem('spiral_settings');
      
      const defaultSettings = { 
        telegram_link: 'https://t.me/cryptospiral',
        marquee_text: `⚡ NODE ACTIVE: SYSTEM ACTIVE | 🔥 NETWORK VOLUME: $4.2M`,
        hall_of_fame_marquee: '🏆 CONGRATULATIONS TO OUR ELITE ACHIEVERS! KEEP PUSHING FOR THE TOP! 🚀',
        admin_address_trc20: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
        admin_address_bep20: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
        admin_address_erc20: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
        min_withdrawal: 1,
        withdrawal_fee: 5,
        boosting_reward: 25,
        boosting_min_directs: 1,
        boosting_min_pkg_price: 10,
        spin_min_pkg_price: 100,
        spin_min_directs: 6,
        spin_cooldown_hours: 24,
        rank_rewards: [
          { id: '1', rank_name: 'Explorer', personal_business: 100, team_business: 500, reward_amount: 50, icon_type: 'star' },
          { id: '2', rank_name: 'Commander', personal_business: 500, team_business: 2500, reward_amount: 200, icon_type: 'award' },
          { id: '3', rank_name: 'Captain', personal_business: 1000, team_business: 10000, reward_amount: 1000, icon_type: 'shield' },
        ],
        spin_cost: 1,
        spin_rewards: [
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
          { id: '12', label: '5$', amount: 5, probability: 15 },
        ],
        referrals_for_free_spins: 5,
        spins_per_milestone: 5,
        enable_deposit: true,
        enable_withdrawal: true,
      };

      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        // Ensure spin_rewards exists even if settings were saved before this feature
        if (!parsed.spin_rewards || parsed.spin_rewards.length === 0) {
          parsed.spin_rewards = defaultSettings.spin_rewards;
        }
        return { ...defaultSettings, ...parsed };
      }

      return defaultSettings;
    },
    updateSettings: async (settings: any) => {
      localStorage.setItem('spiral_settings', JSON.stringify(settings));
      return { success: true, message: 'Settings saved to local storage' };
    },
    updateUser: async (userId: string, data: { name?: string, password?: string, personal_business?: number, team_business?: number, mobile?: string, role?: string }) => {
      const users = await mockApi.db.getAllUsers();
      const index = users.findIndex(u => u.id === userId);
      if (index === -1) return { success: false, message: 'User not found' };

      if (data.name) users[index].name = data.name;
      if (data.mobile !== undefined) users[index].mobile = data.mobile;
      if (data.personal_business !== undefined) users[index].personal_business = data.personal_business;
      if (data.team_business !== undefined) users[index].team_business = data.team_business;
      if (data.role !== undefined) users[index].role = data.role as any;
      // In mock, resetting password just means updating the user object if we were tracking it
      // Since we don't track passwords in localStorage mock, we just say success.

      localStorage.setItem('spiral_all_users', JSON.stringify(users));
      
      // Also update currently logged in user if it's them
      const currentUserStr = localStorage.getItem('spiral_user');
      if (currentUserStr) {
        const currentUser = JSON.parse(currentUserStr);
        if (currentUser.id === userId) {
          localStorage.setItem('spiral_user', JSON.stringify({ ...currentUser, ...data }));
        }
      }

      return { success: true };
    },
    getUserPurchases: async (userId: string): Promise<Purchase[]> => {
      const allPurchases = await mockApi.db.getAllPurchases();
      // getAllPurchases doesn't fill price correctly, let's fix that too
      const pkgs = await mockApi.db.getPackages();
      return allPurchases
        .filter(p => p.user_id === userId)
        .map(p => ({
          ...p,
          price: pkgs.find(pkg => pkg.id === p.package_id)?.price || 0
        }));
    },
    forceBoostingWinner: async (userId: string) => {
      const settings = await mockApi.db.getSettings() as any;
      const reward = settings.boosting_reward || 25;
      
      // Pay the user
      await mockApi.db.distributeIncome(userId, reward, 'pool_payout', 'Admin Forced Boosting Gold Payout');
      
      // Also add to queue if not there, or mark a rebirth entry
      const queueKey = 'boosting_gold_queue';
      const queue = JSON.parse(localStorage.getItem(queueKey) || '[]');
      
      const rebirthEntry = {
        id: `bg_force_${Date.now()}_${userId}`,
        user_id: userId,
        created_at: new Date().toISOString(),
        completed: true, // Marked as completed immediately
        payout_at: new Date().toISOString(),
        is_force: true
      };
      
      queue.push(rebirthEntry);
      localStorage.setItem(queueKey, JSON.stringify(queue));
      
      return { success: true, message: 'Winner forced successfully' };
    },
    getBoostingQueue: async () => {
      const queueKey = 'boosting_gold_queue';
      const queue = JSON.parse(localStorage.getItem(queueKey) || '[]');
      const users = await mockApi.db.getAllUsers();
      
      return queue.map((entry: any) => {
        const user = users.find(u => u.id === entry.user_id || u.user_id === entry.user_id);
        return {
          ...entry,
          user_id: entry.user_id,
          userName: user?.name || 'Unknown',
          userEmail: user?.email || 'Unknown',
          // Ensure compatibility for UI fields
          created_at: entry.created_at || new Date(entry.timestamp || Date.now()).toISOString(),
          id: entry.id || entry.$id
        };
      });
    },
    getSpinHistory: async (userId: string) => {
      const historyKey = `spin_history_${userId}`;
      return JSON.parse(localStorage.getItem(historyKey) || '[]');
    },
    performSpin: async (userId: string, spinType?: 'free' | 'paid') => {
      const settings = await mockApi.db.getSettings() as any;
      const wallet = await mockApi.db.getWallet(userId);
      if (!wallet) return { success: false, message: 'Wallet not found' };

      const users = await mockApi.db.getAllUsers();
      const user = users.find(u => u.id === userId);
      if (!user) return { success: false, message: 'User not found' };

      // 1. DUAL QUALIFICATION CHECK (OR Logic)
      const rawPurchases: any[] = JSON.parse(localStorage.getItem(`purchased_packages_${userId}`) || '[]');
      const packages = await mockApi.db.getPackages();
      const userActivePkgs = packages.filter(p => rawPurchases.some(rp => (typeof rp === 'string' ? rp === p.id : rp.id === p.id)));
      
      const minPkgPrice = settings.spin_min_pkg_price !== undefined && settings.spin_min_pkg_price !== null ? settings.spin_min_pkg_price : 100;
      const minDirects = settings.spin_min_directs !== undefined && settings.spin_min_directs !== null ? settings.spin_min_directs : 6;
      
      const hasPkg = userActivePkgs.some(p => p.price >= minPkgPrice);
      const hasDirects = (user.direct_count || 0) >= minDirects;

      if (!hasPkg && !hasDirects) {
        return { 
          success: false, 
          message: `Qualification Required: Purchase $${minPkgPrice}+ node OR refer ${minDirects} direct partners.` 
        };
      }

      // 2. COOLDOWN CHECK bypassed


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
        return { success: false, message: `Insufficient balance! Spin costs $${spinCost} or requires free spins.` };
      }

      // Calculate result
      const rewards = settings.spin_rewards || [];
      if (rewards.length === 0) return { success: false, message: 'No rewards configured' };

      const totalProb = rewards.reduce((acc: number, r: any) => acc + r.probability, 0);
      let random = Math.random() * totalProb;
      let selectedReward = rewards[0];

      for (const r of rewards) {
        if (random < r.probability) {
          selectedReward = r;
          break;
        }
        random -= r.probability;
      }

      const rewardAmount = selectedReward.amount || 0;

      // Update wallet values atomic-style
      const parsedSpinCost = Number(spinCost || 0);
      const parsedRewardAmount = Number(rewardAmount || 0);

      // Detect if user won additional free spins as a reward segment (e.g. "+1 Spin" or "Free Spin")
      const cleanRewardLabel = String(selectedReward.label || '').trim().toLowerCase();
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

      wallet.balance = Number((Number(wallet.balance || 0) - parsedSpinCost + parsedRewardAmount).toFixed(4));
      wallet.total_earned = Number((Number(wallet.total_earned || 0) + parsedRewardAmount).toFixed(4));
      wallet.available_spins = finalSpins;

      // Save updated wallet directly to simulated storage so there's no race/overwrite
      const walletKey = `spiral_wallet_${userId}`;
      localStorage.setItem(walletKey, JSON.stringify(wallet));

      // Append transaction reward
      await mockApi.db.addTransaction(userId, {
        amount: rewardAmount,
        type: 'spin',
        description: `Spin Wheel Reward: ${selectedReward.label}`
      });

      // Append transaction fee if any
      if (spinCost > 0) {
        await mockApi.db.addTransaction(userId, {
          amount: -spinCost,
          type: 'spin',
          description: `Spin Wheel Cost`
        });
      }

      // Save spin history
      const historyKey = `spin_history_${userId}`;
      const history_parsed = JSON.parse(localStorage.getItem(historyKey) || '[]');
      const newEntry = {
        id: `spin_${Date.now()}`,
        user_id: userId,
        reward_label: selectedReward.label,
        amount: selectedReward.amount,
        created_at: new Date().toISOString()
      };
      history_parsed.unshift(newEntry);
      localStorage.setItem(historyKey, JSON.stringify(history_parsed.slice(0, 10)));

      return { success: true, reward: selectedReward, wallet };
    },
    claimRankReward: async (userId: string, rewardId: string) => {
      if (localStorage.getItem('vite_appwrite_configured') === 'true') {
        const response = await fetch('/api/rewards/claim', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
          },
          body: JSON.stringify({ userId, rewardId })
        });
        return await response.json();
      }

      // Fallback: Pure mock simulation using localStorage
      try {
        const settings = await mockApi.db.getSettings() as any;
        const wallet = await mockApi.db.getWallet(userId);
        if (!wallet) return { success: false, message: 'Wallet not found' };

        const rewardsList = settings.rank_rewards || [];
        const reward = rewardsList.find((r: any) => r.id === rewardId);
        if (!reward) return { success: false, message: 'Rank reward not found' };

        // Check if already claimed
        const txHistory = JSON.parse(localStorage.getItem(`spiral_transactions_${userId}`) || '[]');
        const alreadyClaimed = txHistory.some((tx: any) => tx.description === `Rank Reward Claim: ${reward.rank_name}`);
        if (alreadyClaimed) {
          return { success: false, message: 'This rank reward has already been claimed.' };
        }

        // Get user purchases
        const purchasesKey = `purchased_packages_${userId}`;
        const activePurchases: any[] = JSON.parse(localStorage.getItem(purchasesKey) || '[]').filter((p: any) => p.is_active !== false);
        const maxActivePackagePrice = activePurchases.reduce((max: number, p: any) => Math.max(max, Number(p.price) || 0), 0);

        // Fetch downline
        const allUsers = await mockApi.db.getAllUsers();
        
        const getDownlineIds = (uId: string): string[] => {
            const list: string[] = [];
            const directs = allUsers.filter((u: any) => String(u.referred_by || '').toLowerCase() === String(uId).toLowerCase());
            directs.forEach((d: any) => {
                const dId = d.id;
                list.push(dId);
                list.push(...getDownlineIds(dId));
            });
            return list;
        };
        const downlineIds = getDownlineIds(userId);
        
        // Count direct referrals
        const directCount = allUsers.filter((u: any) => String(u.referred_by || '').toLowerCase() === String(userId).toLowerCase()).length;

        // Downline count of same package
        const requiredSelfPkg = Number(reward.min_self_package || 0);
        let downlineSamePkgCount = 0;

        if (requiredSelfPkg > 0 && downlineIds.length > 0) {
            let count = 0;
            downlineIds.forEach((dId: string) => {
               const pList = JSON.parse(localStorage.getItem(`purchased_packages_${dId}`) || '[]');
               const hasSameOrBetter = pList.some((p: any) => p.is_active !== false && Number(p.price) >= requiredSelfPkg);
               if (hasSameOrBetter) count++;
            });
            downlineSamePkgCount = count;
        }

        // Calculations for Personal Business (sum of all active personal packages of ANY price)
        const realPersonalBusiness = activePurchases.reduce((acc: number, p: any) => {
            return acc + (Number(p.price) || 0);
        }, 0);

        // Calculations for Team Business (sum of all active packages in target levels)
        const targetDepth = Number(reward.target_depth || 0);
        let realTeamBusiness = 0;
        
        const getDownlineIdsAtDepth = (uIds: string[], currentDepth: number, targetDepth: number): string[] => {
            if (currentDepth === targetDepth) {
                return uIds;
            }
            const nextLevelUIds: string[] = [];
            allUsers.forEach((u: any) => {
                const referee = String(u.referred_by || '').toLowerCase();
                if (uIds.some(id => String(id).toLowerCase() === referee)) {
                    const dId = u.user_id || u.id || u.$id;
                    if (dId) {
                        nextLevelUIds.push(dId);
                    }
                }
            });
            if (nextLevelUIds.length === 0) return [];
            return getDownlineIdsAtDepth(nextLevelUIds, currentDepth + 1, targetDepth);
        };

        let targetDownlineIds: string[] = [];
        if (targetDepth === 0) {
            targetDownlineIds = downlineIds;
        } else {
            // Collect all downlines from level 1 up to level targetDepth
            for (let d = 1; d <= targetDepth; d++) {
                const levelIds = getDownlineIdsAtDepth([userId], 0, d);
                levelIds.forEach(id => {
                    if (!targetDownlineIds.includes(id)) {
                        targetDownlineIds.push(id);
                    }
                });
            }
        }

        if (targetDownlineIds.length > 0) {
            targetDownlineIds.forEach((dId: string) => {
               const pList = JSON.parse(localStorage.getItem(`purchased_packages_${dId}`) || '[]');
               pList.forEach((p: any) => {
                  if (p.is_active !== false) {
                      realTeamBusiness += Number(p.price) || 0;
                  }
               });
            });
        }

        // Apply matching checks
        const targetSelfPkg = Number(reward.min_self_package || 0);
        const targetSamePkgDownlines = Number(reward.min_downline_same_package || 0);
        const targetDirectsRequired = Number(reward.min_directs || 0);
        const targetPersonalBusiness = Number(reward.personal_business || 0);
        const targetTeamBusiness = Number(reward.team_business || 0);

        if (maxActivePackagePrice < targetSelfPkg) {
            return { success: false, message: `Your Active personal package ($${maxActivePackagePrice}) is less than required self package ($${targetSelfPkg}).` };
        }
        if (directCount < targetDirectsRequired) {
            return { success: false, message: `You have ${directCount} direct referrals. Required: ${targetDirectsRequired}.` };
        }
        if (downlineSamePkgCount < targetSamePkgDownlines) {
            return { success: false, message: `Only ${downlineSamePkgCount} of your downline upgraded to $${targetSelfPkg}+ package. Need ${targetSamePkgDownlines}.` };
        }
        if (realPersonalBusiness < targetPersonalBusiness) {
            return { success: false, message: `Your personal business is $${realPersonalBusiness}. Required: $${targetPersonalBusiness}.` };
        }
        if (realTeamBusiness < targetTeamBusiness) {
            const depthLabel = targetDepth === 0 ? "across all levels" : `up to level ${targetDepth}`;
            return { success: false, message: `Your team business (${depthLabel}) is $${realTeamBusiness}. Required: $${targetTeamBusiness}.` };
        }

        // Award
        wallet.balance = Number((Number(wallet.balance || 0) + Number(reward.reward_amount)).toFixed(4));
        wallet.total_earned = Number((Number(wallet.total_earned || 0) + Number(reward.reward_amount)).toFixed(4));

        localStorage.setItem(`spiral_wallet_${userId}`, JSON.stringify(wallet));

        // Add Transaction
        await mockApi.db.addTransaction(userId, {
          amount: Number(reward.reward_amount),
          type: 'task',
          description: `Rank Reward Claim: ${reward.rank_name}`
        });

        return { 
          success: true, 
          message: `Congratulations! ${reward.rank_name} claimed successfully! $${reward.reward_amount} USDT credited.`,
          wallet
        };
      } catch (err: any) {
        return { success: false, message: err.message };
      }
    },
    getWeeklyOffer: async () => {
      return {
        reward_amount: 500,
        end_date: new Date(Date.now() + 86400000 * 7).toISOString()
      };
    },
    getWeeklyAchievers: async () => {
      return [];
    },
    getMatrixDownline: async (userId: string) => {
      return [];
    },
    getDirectReferrals: async (userId: string) => {
      return [];
    },
    getAllUsers: async () => {
      const saved = localStorage.getItem('spiral_all_users');
      let users = saved ? JSON.parse(saved) : [];

      const initialUsers = [
        { id: '1', name: 'Admin User', email: 'test@test.com', role: 'admin', is_active: true, created_at: new Date().toISOString(), direct_count: 3, is_qualified: true, matrix_parent_id: null, node_id: 'NX-8291A4', personal_business: 100, team_business: 250 },
        { id: 'u2', name: 'Rahul (G1)', email: 'rahul@demo.com', referred_by: '1', is_active: true, node_id: 'NX-U2-G1', created_at: new Date().toISOString(), personal_business: 20, team_business: 100 },
        { id: 'u3', name: 'Sana (G1)', email: 'sana@demo.com', referred_by: '1', is_active: true, node_id: 'NX-U3-G1', created_at: new Date().toISOString(), personal_business: 10, team_business: 0 },
        { id: 'u4', name: 'Vikram (G2)', email: 'vikram@demo.com', referred_by: 'u2', is_active: true, node_id: 'NX-U4-G2', created_at: new Date().toISOString(), personal_business: 50, team_business: 50 },
        { id: 'u5', name: 'Amit (G2)', email: 'amit@demo.com', referred_by: 'u2', is_active: true, node_id: 'NX-U5-G2', created_at: new Date().toISOString(), personal_business: 10, team_business: 0 },
        { id: 'u6', name: 'Riya (G3)', email: 'riya@demo.com', referred_by: 'u4', is_active: true, node_id: 'NX-U6-G3', created_at: new Date().toISOString(), personal_business: 10, team_business: 0 },
        { id: 'u7', name: 'Inactive User (G1)', email: 'inactive@demo.com', referred_by: '1', is_active: false, node_id: 'NX-U7-INACTIVE', created_at: new Date().toISOString(), personal_business: 0, team_business: 0 },
      ];

      // If we have no users, or just 1 user, inject demo data
      if (users.length <= 1) {
        users = initialUsers;
        localStorage.setItem('spiral_all_users', JSON.stringify(users));

        // Mock purchases for these users to show packages (skip u7)
        localStorage.setItem('purchased_packages_1', JSON.stringify(['pkg3']));
        localStorage.setItem('purchased_packages_u2', JSON.stringify(['pkg1']));
        localStorage.setItem('purchased_packages_u3', JSON.stringify(['pkg2']));
        localStorage.setItem('purchased_packages_u4', JSON.stringify(['pkg1']));
        localStorage.setItem('purchased_packages_u5', JSON.stringify(['pkg1']));
        localStorage.setItem('purchased_packages_u6', JSON.stringify(['pkg1']));
        // No purchase for u7
      }

      return users;
    },
    getLeaderboard: async (): Promise<any[]> => {
      try {
        const users = await mockApi.db.getAllUsers();
        const leaderboardData: any[] = [];
        for (const u of users) {
          const walletKey = `spiral_wallet_${u.id}`;
          const savedWallet = localStorage.getItem(walletKey);
          const wallet = savedWallet ? JSON.parse(savedWallet) : { total_earned: 0 };
          leaderboardData.push({
            ...u,
            total_earned: Number(wallet.total_earned || 0),
            earnings: Number(wallet.total_earned || 0),
          });
        }
        return leaderboardData;
      } catch (error) {
        return [];
      }
    },
    getAllPurchases: async (): Promise<Purchase[]> => {
      const users = await mockApi.db.getAllUsers();
      let allPurchases: Purchase[] = [];
      
      for (const user of users) {
        const purchasedKey = `purchased_packages_${user.id}`;
        const rawPurchases: any[] = JSON.parse(localStorage.getItem(purchasedKey) || '[]');
        
        rawPurchases.forEach((rp, idx) => {
          const isObj = typeof rp === 'object';
          allPurchases.push({
            id: `p_${user.id}_${idx}`,
            user_id: user.id,
            package_id: isObj ? rp.id : rp,
            price: 0, // Will be filled by caller using package metadata
            is_active: true,
            activated_at: isObj ? (rp.activated_at ? new Date(rp.activated_at).toISOString() : new Date().toISOString()) : new Date().toISOString()
          });
        });
      }
      return allPurchases;
    },
    getTeamData: async (userId: string): Promise<{ users: User[], purchases: Purchase[] }> => {
      // For mock, just return everything but filter by relationship if possible
      // Or just return everything to keep it simple for mock tree
      const users = await mockApi.db.getAllUsers();
      const purchases = await mockApi.db.getAllPurchases();
      return { users, purchases };
    },
    findGlobalMatrixParent: async (): Promise<string | null> => {
      const users = await mockApi.db.getAllUsers();
      // Sort by creation date to fill top-to-bottom, left-to-right
      const sortedUsers = [...users].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      
      for (const parent of sortedUsers) {
        const childrenCount = users.filter(u => (u as any).matrix_parent_id === parent.id).length;
        if (childrenCount < 2) {
          return parent.id;
        }
      }
      return null;
    },
    findTeamMatrixParent: async (sponsorId: string | null): Promise<string | null> => {
      const users = await mockApi.db.getAllUsers();
      const startId = sponsorId || '1';
      
      const queue: string[] = [startId];
      const visited = new Set<string>([startId]);
      
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        
        // Find children whose matrix parent is currentId
        const children = users
          .filter(u => u.matrix_parent_id === currentId && u.is_active !== false)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        
        if (children.length < 2) {
          return currentId;
        }
        
        for (const child of children) {
          if (!visited.has(child.id)) {
            visited.add(child.id);
            queue.push(child.id);
          }
        }
      }
      return '1';
    },
    distributeROI: async (userId: string) => {
      const walletKey = `spiral_wallet_${userId}`;
      const savedWallet = localStorage.getItem(walletKey);
      if (!savedWallet) return { success: false };

      const wallet: Wallet = JSON.parse(savedWallet);
      const now = new Date();
      const lastROI = wallet.last_roi_at ? new Date(wallet.last_roi_at) : new Date(Date.now() - 24 * 60 * 60 * 1000);
      const diffMs = now.getTime() - lastROI.getTime();
      const days = diffMs / (1000 * 60 * 60 * 24);

      if (days < 0.0001) return { success: true }; 

      const purchasedKey = `purchased_packages_${userId}`;
      const purchasedIds: string[] = JSON.parse(localStorage.getItem(purchasedKey) || '[]');
      const packages = await mockApi.db.getPackages();
      const activePkgs = packages.filter(p => purchasedIds.includes(p.id));
      const totalPackageValue = activePkgs.reduce((acc, p) => acc + p.price, 0);

      // NO ROI if all packages (total $100) are active
      if (totalPackageValue >= 100) {
        return { success: true, message: 'ROI not applicable for full activation' };
      }

      // Determine Profit Capping Limit
      const cappingLimit = mockApi.db.getCappingLimit(totalPackageValue);

      if (totalPackageValue > 0 && cappingLimit !== Infinity && wallet.total_earned >= cappingLimit) {
        return { success: true, message: 'Capping limit reached. Please upgrade to continue earning.' };
      }

      const maxROI = activePkgs.length > 0 ? Math.max(...activePkgs.map(p => p.daily_roi)) : 0;
      const dailyYield = totalPackageValue * (maxROI / 100);
      let totalAccrued = dailyYield * days;

      if (totalPackageValue > 0 && cappingLimit !== Infinity && (wallet.total_earned + totalAccrued) > cappingLimit) {
        totalAccrued = Math.max(0, cappingLimit - wallet.total_earned);
      }

      if (totalAccrued > 0) {
        wallet.balance += totalAccrued;
        wallet.total_earned += totalAccrued;
        wallet.wallet_roi_earned = (wallet.wallet_roi_earned || 0) + totalAccrued;
        wallet.last_roi_at = now.toISOString();
        localStorage.setItem(walletKey, JSON.stringify(wallet));
        
        await mockApi.db.addTransaction(userId, {
          amount: totalAccrued,
          type: 'roi',
          description: `Daily Node Yield Distribution ($${totalAccrued.toFixed(4)})`,
          status: 'completed'
        });
      }

      return { success: true };
    },
    purchasePackage: async (userId: string, packageId: string) => {
      const users = await mockApi.db.getAllUsers();
      const user = users.find(u => u.id === userId);
      const packages = await mockApi.db.getPackages();
      const pkg = packages.find(p => p.id === packageId);
      const wallet = await mockApi.db.getWallet(userId);

      if (!user || !pkg || !wallet) return { success: false, message: 'User, Package or Wallet not found' };

      // 1. Check Balance
      if ((wallet.balance || 0) < pkg.price) {
        return { success: false, message: `Insufficient balance! You need $${pkg.price} in your main wallet to purchase this package.` };
      }

      const purchasedKey = `purchased_packages_${userId}`;
      const rawPurchases: any[] = JSON.parse(localStorage.getItem(purchasedKey) || '[]');
      const purchasedIds = rawPurchases.map(p => typeof p === 'string' ? p : p.id);
      
      // Condition: Sequential purchase (10 -> 20 -> 50 -> 100)
      const sortedPkgs = [...packages].sort((a, b) => a.price - b.price);
      const pkgIndex = sortedPkgs.findIndex(p => p.id === pkg.id);
      
      if (pkgIndex > 0) {
        const prevPkg = sortedPkgs[pkgIndex - 1];
        if (!purchasedIds.includes(prevPkg.id)) {
          return { success: false, message: `Please purchase the $${prevPkg.price} ${prevPkg.name} first!` };
        }
      }

      if (purchasedIds.includes(pkg.id)) {
        return { success: false, message: 'You already have this active protocol.' };
      }

      // 2. Deduct Balance & Add Proportional Bonus Spins
      wallet.balance -= pkg.price;
      const pkgPriceVal = Number(pkg.price || 0);
      let bonusSpins = 0;
      if (Math.abs(pkgPriceVal - 10) < 0.1) {
        bonusSpins = 1;
      } else if (Math.abs(pkgPriceVal - 20) < 0.1) {
        bonusSpins = 2;
      } else {
        bonusSpins = Math.max(1, Math.floor(pkgPriceVal / 10));
      }
      wallet.available_spins = (wallet.available_spins || 0) + bonusSpins;
      localStorage.setItem(`spiral_wallet_${userId}`, JSON.stringify(wallet));

      // 3. Find Direct Sponsor
      const sponsorCode = user.referred_by;
      const sponsorIncome = (pkg.price * (pkg.direct_income_percent || 0)) / 100; 
      
      let finalSponsorId = '1'; // Default to Admin if no sponsor
      if (sponsorCode) {
        const foundSponsor = users.find(u => u.id === sponsorCode || u.user_id === sponsorCode || u.node_id === sponsorCode);
        if (foundSponsor) {
          finalSponsorId = foundSponsor.id;
        }
      }

      // Step 1: Pay Sponsor
      await mockApi.db.distributeIncome(finalSponsorId, sponsorIncome, 'direct_income', `Sponsor Income from ${user.name} (${pkg.name})`, userId);

      // 2. Find Matrix Parent (Placement)
      const matrixParentCode = user.matrix_parent_id;
      // Using dynamic Matrix Parent percent
      const placementIncome = (pkg.price * (pkg.matrix_income_percent || 10)) / 100; 
      
      let finalPlacementId = '1';
      if (matrixParentCode) {
        const foundPlacement = users.find(u => u.id === matrixParentCode || u.user_id === matrixParentCode || u.node_id === matrixParentCode);
        if (foundPlacement) {
          finalPlacementId = foundPlacement.id;
        }
      }

      // Step 2: Pay Placement Parent
      await mockApi.db.distributeIncome(finalPlacementId, placementIncome, 'matrix_income', `Placement bonus: Node $${pkg.price} from ${user.name}`, userId);

      // Distribute 10% of placementIncome to finalPlacementId's sponsor uplines up to 10 levels
      if (placementIncome > 0 && finalPlacementId && finalPlacementId !== '1') {
        const parentUser = users.find(u => u.id === finalPlacementId);
        let matrixUplineId = parentUser?.referred_by || '1';
        const uplinePayout = placementIncome * 0.10;
        if (uplinePayout > 0) {
          for (let l = 1; l <= 10; l++) {
            if (!matrixUplineId || matrixUplineId === '0' || matrixUplineId === finalPlacementId) break;
            await mockApi.db.distributeIncome(
              matrixUplineId,
              uplinePayout,
              'matrix_income',
              `Matrix Level ${l} commission (10% of $${placementIncome.toFixed(2)} from ${parentUser?.name || 'User'})`,
              finalPlacementId
            );
            if (matrixUplineId === '1') break;
            const nextUpline = users.find(u => u.id === matrixUplineId);
            matrixUplineId = nextUpline?.referred_by || '1';
          }
        }
      }

      console.log(`Distributing Income for ${pkg.name} ($${pkg.price}):`);
      console.log(`- Sponsor (${finalSponsorId}): $${sponsorIncome}`);
      console.log(`- Placement Parent (${finalPlacementId}): $${placementIncome}`);

      // 3. Level Income Distribution (Up to 10 Levels)
      let currentParentId = finalPlacementId;

      for (let level = 1; level <= 10; level++) {
        if (!currentParentId || currentParentId === '0') break;
        
        // Use Dynamic Level Income Flat Dollar Value from Package
        const levelAmount = pkg.level_income_percents?.[level - 1] !== undefined ? Number(pkg.level_income_percents[level - 1]) : 0;

        const parent = users.find(u => u.id === currentParentId);
        if (parent) {
          if (levelAmount > 0) {
            const parentPurchasedKey = `purchased_packages_${parent.id}`;
            const parentRawPurchases: any[] = JSON.parse(localStorage.getItem(parentPurchasedKey) || '[]');
            
            // Basic Qualification: Must have an active package to receive level income
            const parentHasActivePkg = parentRawPurchases.length > 0;
            const recipientId = parentHasActivePkg ? parent.id : '1'; 
            
            await mockApi.db.distributeIncome(recipientId, levelAmount, 'level_income', `Level ${level} Income from ${user.name}`, userId);
          }
          
          // Move up to the next parent
          currentParentId = parent.matrix_parent_id || parent.referred_by || null;
          // Resolve next parent ID just like before
          if (currentParentId) {
            const nextParent = users.find(u => u.id === currentParentId || u.user_id === currentParentId || u.node_id === currentParentId);
            currentParentId = nextParent ? nextParent.id : null;
          }
        } else {
          break;
        }
      }

      // Save to purchased list with timestamp for duration check
      rawPurchases.push({ id: pkg.id, activated_at: Date.now() });
      localStorage.setItem(purchasedKey, JSON.stringify(rawPurchases));

      // Update Sponsor's Direct Count and Award Spins
      if (finalSponsorId && finalSponsorId !== '1') {
        const sponsor = users.find(u => u.id === finalSponsorId);
        if (sponsor) {
          sponsor.direct_count = (sponsor.direct_count || 0) + 1;
          
          // Award Spins if threshold reached
          const settings = await mockApi.db.getSettings() as any;
          
          // Custom rule: 6 free spins at exactly 6 directs
          if (sponsor.direct_count === 6) {
            const sponsorWallet = await mockApi.db.getWallet(finalSponsorId);
            if (sponsorWallet) {
              sponsorWallet.available_spins = (sponsorWallet.available_spins || 0) + 6;
              localStorage.setItem(`spiral_wallet_${finalSponsorId}`, JSON.stringify(sponsorWallet));
              console.log(`Awarded 6 spins to sponsor ${finalSponsorId} for reaching 6 directs.`);
            }
          } else {
            // Default milestone logic
            const threshold = settings.referrals_for_free_spins || 5;
            const spinsToAward = settings.spins_per_milestone || 5;
            
            if (sponsor.direct_count % threshold === 0) {
              const sponsorWallet = await mockApi.db.getWallet(finalSponsorId);
              if (sponsorWallet) {
                sponsorWallet.available_spins = (sponsorWallet.available_spins || 0) + spinsToAward;
                localStorage.setItem(`spiral_wallet_${finalSponsorId}`, JSON.stringify(sponsorWallet));
                console.log(`Awarded ${spinsToAward} spins to sponsor ${finalSponsorId} for reaching ${sponsor.direct_count} directs.`);
              }
            }
          }
          localStorage.setItem('spiral_all_users', JSON.stringify(users));
        }
      }

      // --- BOOSTING GOLD GLOBAL LOGIC ---
      const triggerBoosting = async (targetId: string) => {
        const targetUser = users.find(u => u.id === targetId);
        if (!targetUser) return;

        const targetRawPurchases: any[] = JSON.parse(localStorage.getItem(`purchased_packages_${targetId}`) || '[]');
        const targetActivePkgs = packages.filter(p => targetRawPurchases.some(rp => (typeof rp === 'string' ? rp === p.id : rp.id === p.id)));
        
        const settings = await mockApi.db.getSettings() as any;
        const minPkgPrice = settings?.boosting_min_pkg_price || 10;
        const minDirects = settings?.boosting_min_directs || 1;

        // Qualification: Must own pkg1+ AND have at least X directs
        if (targetActivePkgs.some(p => p.price >= minPkgPrice) && (targetUser.direct_count || 0) >= minDirects) {
          const queueKey = 'boosting_gold_queue';
          const queue = JSON.parse(localStorage.getItem(queueKey) || '[]');
          
          // Check if already in queue (initial entry only)
          const alreadyIn = queue.some((e: any) => (e.user_id === targetId || e.userId === targetId) && !e.completed);
          if (alreadyIn) return;

          // Add user to global queue
          const newEntry = {
            id: `bg_${Date.now()}_${targetId}`,
            user_id: targetId,
            timestamp: Date.now(),
            completed: false,
            is_rebirth: false
          };
          queue.push(newEntry);

          // Logic: Sustainable Global Pool
          // For every 12 new entries in the system, the NEXT person in the queue gets paid.
          const completedCountKey = 'boosting_gold_completed_count';
          let completedCount = parseInt(localStorage.getItem(completedCountKey) || '0');

          while (queue.length >= (completedCount + 1) * 12) {
            const winnerEntry = queue[completedCount];
            if (winnerEntry && !winnerEntry.completed) {
              winnerEntry.completed = true;
              winnerEntry.payout_at = Date.now();
              
              const settings = await mockApi.db.getSettings() as any;
              const reward = settings.boosting_reward || 25;
              
              // Pay the winner using distributeIncome for capping
              await mockApi.db.distributeIncome(winnerEntry.userId, reward, 'pool_payout', 'Boosting Gold Global Pool Payout');

              // Rebirth: Add them back to the end of the queue
              const rebirthEntry = {
                id: `bg_rebirth_${Date.now()}_${winnerEntry.userId}`,
                userId: winnerEntry.userId,
                timestamp: Date.now(),
                completed: false,
                is_rebirth: true
              };
              queue.push(rebirthEntry);
              completedCount++;
            } else {
              break;
            }
          }
          
          localStorage.setItem(queueKey, JSON.stringify(queue));
          localStorage.setItem(completedCountKey, completedCount.toString());
        }
      };

      // 1. Check if the buyer qualifies now
      await triggerBoosting(userId);

      // 2. Check if the sponsor qualifies now (due to the new direct)
      if (finalSponsorId && finalSponsorId !== '1') {
        await triggerBoosting(finalSponsorId);
      }

      // 3. Award 1 free spin if purchasing the $20 package
      const is20pkg = Math.abs(Number(pkg.price) - 20) < 0.1 || 
                       String(pkg.price || '').includes('20') || 
                       String(pkg.name || '').toLowerCase().includes('20') || 
                       String(pkg.id || '').toLowerCase().includes('20') || 
                       packageId === 'pkg2' || 
                       String(packageId).toLowerCase().includes('20');

      if (is20pkg) {
        // Also award 1 free spin to the sponsor!
        if (finalSponsorId && finalSponsorId !== '1' && finalSponsorId !== '0') {
          try {
            const sponsorWallet = await mockApi.db.getWallet(finalSponsorId);
            if (sponsorWallet) {
              sponsorWallet.available_spins = (sponsorWallet.available_spins || 0) + 1;
              localStorage.setItem(`spiral_wallet_${finalSponsorId}`, JSON.stringify(sponsorWallet));
              console.log(`Awarded 1 referral free spin to sponsor ${finalSponsorId} because direct referral ${userId} purchased the $20 package.`);
            }
          } catch (spErr: any) {
            console.error(`Error awarding free spin to sponsor ${finalSponsorId}:`, spErr);
          }
        }
      }

      return { success: true, bonusSpins };
    }
  }
};
