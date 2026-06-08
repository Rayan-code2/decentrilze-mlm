import { databases, APPWRITE_CONFIG, ID, Query, account, isAppwriteConfigured } from '../lib/appwrite';
import { User, Wallet, MLMPackage, Transaction, Settings, ExchangerRequest, Purchase } from '../types';

export const appwriteService = {
  // Auth
  getCurrentUser: async () => {
    try {
      const user = await account.get();
      // Fetch additional user data from databases
      const response = await databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.users,
        [Query.equal('email', [user.email])]
      );
      if (response.documents.length === 0) return null;
      const doc = response.documents[0];
      return { 
        name: user.name || doc.name || user.email.split('@')[0], 
        ...doc, 
        id: doc.$id 
      } as unknown as User;
    } catch (error) {
      return null;
    }
  },
  login: async (email: string, pass: string) => {
    try {
      // Step 1: Try deleting current session to prevent "Creation of a session is prohibited..."
      await account.deleteSession('current');
      // Briefly wait to let cookie propagation settle
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (e) {
      // Ignore if no active session
    }

    try {
      return await account.createEmailPasswordSession(email, pass);
    } catch (error: any) {
      // If still throwing because of active session, attempt a deep clear of all sessions
      if (error.message?.includes('prohibited') || error.message?.includes('session is active') || error.code === 401) {
        try {
          await account.deleteSessions(); // clears ALL active sessions
          await new Promise(resolve => setTimeout(resolve, 500));
          return await account.createEmailPasswordSession(email, pass);
        } catch (retryErr) {
          throw error; // throw original error if retry fails
        }
      }
      throw error;
    }
  },
  register: async (email: string, pass: string, name: string, referredBy?: string, mobile?: string) => {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, pass, name, referredBy, mobile })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Registration failed');
      return data;
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },
  logout: async () => {
    try {
      await account.deleteSession('current');
      return true;
    } catch (error) {
      return false;
    }
  },
  requestPasswordReset: async (email: string) => {
    try {
      const url = `${window.location.origin}/reset-password`;
      await account.createRecovery(email, url);
      return { success: true, message: 'Password reset link sent to your email.' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },
  resetPassword: async (userId: string, secret: string, pass: string, passAgain: string) => {
    try {
      await account.updateRecovery(userId, secret, pass);
      return { success: true, message: 'Password has been reset successfully.' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },

  // DB Methods
  getAuthHeaders: async () => {
    try {
      const jwt = await account.createJWT();
      return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt.jwt}`
      };
    } catch (e) {
      return { 'Content-Type': 'application/json' };
    }
  },

  getWallet: async (userId: string): Promise<Wallet | null> => {
    try {
      const response = await databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.wallets,
        [Query.equal('user_id', [userId])]
      );
      if (response.documents.length === 0) return null;
      const doc = response.documents[0];
      
      const lastRoiAt = (doc as any).last_roi_at;
      let spins = 0;
      if (lastRoiAt) {
        try {
          const date = new Date(lastRoiAt);
          const ms = date.getUTCMilliseconds();
          if (!isNaN(ms)) {
            spins = ms;
          }
        } catch (e) {}
      }

      return { 
        ...doc, 
        id: doc.$id,
        available_spins: spins
      } as unknown as Wallet;
    } catch (error) {
      return null;
    }
  },
  updateWallet: async (userId: string, data: Partial<Wallet>): Promise<{ success: boolean; message: string }> => {
    try {
      const wallet = await appwriteService.getWallet(userId);
      if (!wallet) return { success: false, message: 'Wallet not found' };
      
      const { id, available_spins, ...cleanData } = data as any;
      
      await databases.updateDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.wallets,
        wallet.id,
        cleanData
      );
      return { success: true, message: 'Wallet updated successfully' };
    } catch (error: any) {
      console.error("Appwrite updateWallet failed:", error);
      return { success: false, message: error.message };
    }
  },

  getPackages: async (): Promise<MLMPackage[]> => {
    try {
      const response = await databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.packages
      );
      return response.documents.map((doc: any) => {
        let levelIncome = doc.level_income_percents;
        if (typeof levelIncome === 'string') {
          try {
            levelIncome = JSON.parse(levelIncome);
          } catch (e) {
            levelIncome = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
          }
        }
        return { 
          ...doc, 
          id: doc.$id,
          level_income_percents: Array.isArray(levelIncome) ? levelIncome.map(Number) : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          is_active: doc.is_active !== undefined ? doc.is_active : true 
        };
      }) as unknown as MLMPackage[];
    } catch (error: any) {
      console.error("Appwrite getPackages failed:", error);
      throw error;
    }
  },

  getAllPackages: async (): Promise<MLMPackage[]> => {
    try {
      const response = await databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.packages
      );
      return response.documents.map((doc: any) => {
        let levelIncome = doc.level_income_percents;
        if (typeof levelIncome === 'string') {
          try {
            levelIncome = JSON.parse(levelIncome);
          } catch (e) {
            levelIncome = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
          }
        }
        return { 
          ...doc,
          id: doc.$id,
          name: doc.name || 'Unnamed Package',
          price: doc.price || 0,
          daily_roi: doc.daily_roi || 0,
          roi_interval_minutes: doc.roi_interval_minutes,
          duration_days: doc.duration_days ?? 365,
          is_active: doc.is_active ?? true,
          direct_income_percent: doc.direct_income_percent ?? 0,
          matrix_income_percent: doc.matrix_income_percent ?? 0,
          level_income_percents: Array.isArray(levelIncome) ? levelIncome.map(Number) : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        };
      }) as unknown as MLMPackage[];
    } catch (error: any) {
      console.error("Appwrite getAllPackages failed:", error);
      throw error;
    }
  },

  savePackage: async (pkg: MLMPackage) => {
    try {
      const response = await fetch('/api/admin/save-package', {
        method: 'POST',
        headers: await appwriteService.getAuthHeaders(),
        body: JSON.stringify({ pkg })
      });
      return await response.json();
    } catch (error) {
      console.error("Critical: Package save failed:", error);
      return { success: false, message: 'Failed to save package' };
    }
  },

  deletePackage: async (id: string) => {
    try {
      const response = await fetch('/api/admin/delete-package', {
        method: 'POST',
        headers: await appwriteService.getAuthHeaders(),
        body: JSON.stringify({ packageId: id })
      });
      return await response.json();
    } catch (error) {
      return { success: false, message: 'Failed to delete package' };
    }
  },

  syncBoosting: async (userId: string) => {
    try {
      const response = await fetch('/api/user/sync-boosting', {
        method: 'POST',
        headers: await appwriteService.getAuthHeaders(),
        body: JSON.stringify({ userId })
      });
      return await response.json();
    } catch (e) {
      return { success: false };
    }
  },

  getBoostingGoldProgress: async (userId: string) => {
    try {
      const isLive = isAppwriteConfigured();
      if (!isLive) {
        return { progress: 0, total: 12, position: 0 };
      }

      const response = await databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.goldQueue,
        [Query.orderAsc('created_at'), Query.limit(5000)]
      );

      const queue = response.documents;
      // Use user_id and completed (consistent with server)
      const myEntry = queue.find((e: any) => e.user_id === userId && !e.completed);
      
      if (!myEntry) return { progress: 0, total: 12, position: 0 };

      const activeEntries = queue.filter((e: any) => !e.completed);
      const myPosition = activeEntries.findIndex((e: any) => e.user_id === userId) + 1;

      // Correct calculation for progress in a 1:12 global pool system
      // If we are the current active winner, our progress is the number of entries joined since the last completion
      // For anyone else, progress is 0 until they become the active winner? 
      // Actually, users prefer to see how many people joined since THEY joined, 
      // BUT the system payouts every 12 global entries.
      
      const completedCount = queue.filter((e: any) => e.completed).length;
      const uncompletedBeforeMe = activeEntries.findIndex((e: any) => e.user_id === userId);
      
      // If I am at the front of the uncompleted queue:
      let progress = 0;
      if (uncompletedBeforeMe === 0) {
        progress = queue.length - (completedCount * 12);
      } else {
        // If I am behind someone, my progress is technically 0 towards completion
        // But we can show how many people joined after ME specifically if that's what the user expects
        const myIndex = queue.findIndex((e: any) => e.$id === myEntry.$id);
        progress = Math.max(0, queue.length - 1 - myIndex);
      }

      return { 
        progress: Math.min(12, progress), 
        total: 12, 
        position: myPosition
      };
    } catch (error) {
      return { progress: 0, total: 12, position: 0 };
    }
  },

  forceBoostingWinner: async (userId: string) => {
    try {
      const isLive = isAppwriteConfigured();
      if (!isLive) {
        const { mockApi } = await import('../lib/mockApi');
        return await mockApi.db.forceBoostingWinner(userId);
      }
      
      // For live, we can simulate a winner by rewarding them directly
      const settingsRes = await databases.listDocuments(APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.collections.settings);
      const reward = settingsRes.total > 0 ? Number((settingsRes.documents[0] as any).boosting_reward || 20) : 20;

      const response = await fetch('/api/distribute-income', {
        method: 'POST',
        headers: await appwriteService.getAuthHeaders(),
        body: JSON.stringify({
          userId,
          amount: reward,
          type: 'pool_payout',
          description: 'Admin Forced Boosting Gold Payout',
          fromUserId: 'SYSTEM'
        })
      });
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message || 'Failed to force winner' };
    }
  },

  getBoostingQueue: async (): Promise<any[]> => {
    try {
      const isLive = isAppwriteConfigured();
      if (!isLive) {
        const { mockApi } = await import('../lib/mockApi');
        return await mockApi.db.getBoostingQueue();
      }

      const response = await fetch('/api/admin/boosting-queue', {
        headers: await appwriteService.getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch boosting queue');
      const docs = await response.json();
      
      return docs.map((doc: any) => ({
        id: doc.$id,
        user_id: doc.user_id,
        created_at: doc.created_at,
        completed: doc.completed || false,
        is_rebirth: doc.is_rebirth || false,
        payout_at: doc.payout_at || null
      }));
    } catch (error) {
      console.error("Fetch Boosting Queue error:", error);
      return [];
    }
  },

  deleteBoostingEntry: async (id: string) => {
    try {
      await databases.deleteDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.goldQueue,
        id
      );
      return { success: true };
    } catch (error: any) {
      console.error("Delete Boosting Entry error:", error);
      throw error;
    }
  },

  getCappingLimit: (totalInvestment: number, maxRoiPercent: number = 200): number => {
    if (totalInvestment <= 0) return 0;
    if (maxRoiPercent === 0) return Infinity;
    
    // Default system fallback for common packages if maxRoiPercent is default
    if (maxRoiPercent === 200) {
      if (totalInvestment === 10) return 25; // 2.5x per new rules
      if (totalInvestment === 30) return 120; // 4x
      if (totalInvestment === 60) return 600; // 10x
      if (totalInvestment >= 100) return Infinity;
    }
    
    return (totalInvestment * maxRoiPercent) / 100;
  },

  purchasePackage: async (userId: string, packageId: string) => {
    try {
      const response = await fetch('/api/purchase-package', {
        method: 'POST',
        headers: await appwriteService.getAuthHeaders(),
        body: JSON.stringify({ userId, packageId })
      });
      return await response.json();
    } catch (error) {
      return { success: false, message: 'Server connection failed' };
    }
  },

  getTransactions: async (userId: string): Promise<Transaction[]> => {
    try {
      const response = await databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.transactions,
        [
          Query.equal('user_id', [userId]), 
          Query.orderDesc('created_at'),
          Query.limit(5000)
        ]
      );
      return response.documents.map((doc: any) => ({ ...doc, id: doc.$id })) as unknown as Transaction[];
    } catch (error) {
      return [];
    }
  },
  getDirectReferrals: async (userId: string): Promise<User[]> => {
    try {
      const response = await databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.users,
        [Query.equal('referred_by', [userId])]
      );
      return response.documents.map((doc: any) => ({ ...doc, id: doc.$id })) as unknown as User[];
    } catch (error) {
      return [];
    }
  },
  getAllUsers: async (): Promise<User[]> => {
    try {
      const response = await fetch('/api/admin/users', {
        headers: await appwriteService.getAuthHeaders()
      });
      if (!response.ok) {
        let errMsg = 'Failed to fetch users';
        try {
          const errData = await response.json();
          errMsg = errData.message || errData.error || errMsg;
        } catch (e) {
          errMsg = `${errMsg} (Status: ${response.status})`;
        }
        throw new Error(errMsg);
      }
      const docs = await response.json();
      return docs.map((doc: any) => ({ ...doc, id: doc.$id })) as unknown as User[];
    } catch (error: any) {
      console.error("Appwrite getAllUsers via API failed:", error);
      throw error;
    }
  },
  getAllPurchases: async (): Promise<Purchase[]> => {
    try {
      const response = await fetch('/api/admin/purchases', {
        headers: await appwriteService.getAuthHeaders()
      });
      if (!response.ok) {
        let errMsg = 'Failed to fetch purchases';
        try {
          const errData = await response.json();
          errMsg = errData.message || errData.error || errMsg;
        } catch (e) {
          errMsg = `${errMsg} (Status: ${response.status})`;
        }
        throw new Error(errMsg);
      }
      const docs = await response.json();
      return docs.map((doc: any) => ({ ...doc, id: doc.$id })) as unknown as Purchase[];
    } catch (error: any) {
      console.error("Appwrite getAllPurchases via API failed:", error);
      throw error;
    }
  },
  getTeamData: async (userId: string): Promise<{ users: User[], purchases: Purchase[] }> => {
    try {
      const response = await fetch(`/api/user/team-data/${userId}`, {
        headers: await appwriteService.getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch team data');
      const data = await response.json();
      return {
        users: data.users.map((u: any) => ({ ...u, id: u.$id })),
        purchases: data.purchases.map((p: any) => ({ ...p, id: p.$id }))
      };
    } catch (error: any) {
      console.error("Appwrite getTeamData failed:", error);
      return { users: [], purchases: [] };
    }
  },
  getUserPurchases: async (userId: string): Promise<Purchase[]> => {
    try {
      const response = await fetch('/api/user/purchases', {
        method: 'POST',
        headers: await appwriteService.getAuthHeaders(),
        body: JSON.stringify({ userId })
      });
      const data = await response.json();
      if (!data.success) return [];
      return data.documents.map((doc: any) => ({ ...doc, id: doc.$id })) as unknown as Purchase[];
    } catch (error: any) {
      console.error("Fetch Purchases error:", error);
      return [];
    }
  },
  getLevelBusiness: async (userId: string, depth: number): Promise<number> => {
    try {
      const response = await fetch(`/api/user/level-business/${userId}/${depth}`, {
        headers: await appwriteService.getAuthHeaders()
      });
      const data = await response.json();
      return data.success ? Number(data.business) : 0;
    } catch (error) {
      console.error("Fetch Level Business error:", error);
      return 0;
    }
  },
  getDirects: async (userId: string) => {
    try {
      if (!isAppwriteConfigured()) return [];
      const response = await databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.users,
        [Query.equal('referred_by', [userId])]
      );
      return response.documents;
    } catch (error) {
      return [];
    }
  },
  distributeROI: async (userId: string) => {
    try {
      const response = await fetch('/api/distribute-roi', {
        method: 'POST',
        headers: await appwriteService.getAuthHeaders(),
        body: JSON.stringify({ userId })
      });
      return await response.json();
    } catch (error) {
      return { success: false };
    }
  },
  getSettings: async (): Promise<Settings | null> => {
    try {
      // Try 'settings' first (user convention), then 'current_settings'
      let settingsDoc;
      try {
        settingsDoc = await databases.getDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.settings,
          'settings'
        );
        console.log("Appwrite: Document 'settings' found.");
      } catch (e1) {
        try {
          settingsDoc = await databases.getDocument(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.settings,
            'current_settings'
          );
          console.log("Appwrite: Fallback 'current_settings' found.");
        } catch (e2) {
          // Fallback: list and take the first one
          const response = await databases.listDocuments(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.settings,
            [Query.limit(1)]
          );
          if (response.documents.length === 0) return null;
          settingsDoc = response.documents[0];
        }
      }
      
      const settings = settingsDoc as any;
      // Clean Appwrite metadata but keep $id
      const { $collectionId, $databaseId, $createdAt, $updatedAt, $permissions, ...cleanSettings } = settings;

      // Handle JSON parsing for complex fields if they come as strings from server-side updates
      if (typeof cleanSettings.rank_rewards === 'string') {
        try { cleanSettings.rank_rewards = JSON.parse(cleanSettings.rank_rewards); } catch (e) { cleanSettings.rank_rewards = []; }
      }
      if (typeof cleanSettings.withdrawal_tiers === 'string') {
        try { cleanSettings.withdrawal_tiers = JSON.parse(cleanSettings.withdrawal_tiers); } catch (e) { cleanSettings.withdrawal_tiers = []; }
      }
      if (typeof cleanSettings.spin_rewards === 'string') {
        try { cleanSettings.spin_rewards = JSON.parse(cleanSettings.spin_rewards); } catch (e) { cleanSettings.spin_rewards = []; }
      }

      if (!cleanSettings.spin_rewards || !Array.isArray(cleanSettings.spin_rewards) || cleanSettings.spin_rewards.length === 0) {
        cleanSettings.spin_rewards = [
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

      if (!cleanSettings.rank_rewards || !Array.isArray(cleanSettings.rank_rewards) || cleanSettings.rank_rewards.length === 0) {
        cleanSettings.rank_rewards = [
          { id: '1', rank_name: 'Explorer', personal_business: 100, team_business: 500, reward_amount: 50, icon_type: 'star' },
          { id: '2', rank_name: 'Commander', personal_business: 500, team_business: 2500, reward_amount: 200, icon_type: 'award' },
          { id: '3', rank_name: 'Captain', personal_business: 1000, team_business: 10000, reward_amount: 1000, icon_type: 'shield' }
        ];
      }

      return {
        ...cleanSettings,
        enable_deposit: cleanSettings.enable_deposit !== false,
        enable_withdrawal: cleanSettings.enable_withdrawal !== false,
        enable_swap: cleanSettings.enable_swap !== false
      } as Settings;
    } catch (error) {
      console.error("Appwrite getSettings failed:", error);
      return null;
    }
  },
  updateUser: async (userId: string, data: { name?: string, password?: string, personal_business?: number, team_business?: number, mobile?: string }) => {
    try {
      const response = await fetch('/api/admin/update-user', {
        method: 'POST',
        headers: await appwriteService.getAuthHeaders(),
        body: JSON.stringify({ userId, ...data })
      });
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },
  deleteUser: async (userId: string) => {
    try {
      const response = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: await appwriteService.getAuthHeaders(),
        body: JSON.stringify({ userId })
      });
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },
  updateSettings: async (settings: Settings) => {
    try {
      const response = await fetch('/api/update-settings', {
        method: 'POST',
        headers: await appwriteService.getAuthHeaders(),
        body: JSON.stringify(settings)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update settings');
      return { success: true, ...data };
    } catch (error: any) {
      console.error("Appwrite settings update via API failed:", error);
      return { success: false, message: error.message };
    }
  },
  getExchangerRequests: async (userId?: string): Promise<ExchangerRequest[]> => {
    try {
      if (!userId) {
        // Admin mode: Fetch all via API
        const response = await fetch('/api/admin/requests', {
          headers: await appwriteService.getAuthHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch requests');
        const docs = await response.json();
        return docs.map((doc: any) => ({ ...doc, id: doc.$id })) as unknown as ExchangerRequest[];
      }

      const response = await databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.exchanger_requests,
        [Query.equal('user_id', [userId]), Query.orderDesc('created_at')]
      );
      return response.documents.map((doc: any) => ({ ...doc, id: doc.$id })) as unknown as ExchangerRequest[];
    } catch (error) {
      return [];
    }
  },
  createExchangerRequest: async (data: any): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch('/api/exchanger/request', {
        method: 'POST',
        headers: await appwriteService.getAuthHeaders(),
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Failed to create request');
      return { success: true, message: result.message || "Request created successfully" };
    } catch (error: any) {
      console.error("Exchanger request failed:", error);
      return { success: false, message: error.message };
    }
  },
  updateExchangerRequest: async (requestId: string, status: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch('/api/admin/handle-request', {
        method: 'POST',
        headers: await appwriteService.getAuthHeaders(),
        body: JSON.stringify({ requestId, status })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to process request');
      return { success: true, message: data.message };
    } catch (error: any) {
      console.error("Appwrite updateExchangerRequest failed:", error);
      return { success: false, message: error.message };
    }
  },
  createSwapRequest: async (userId: string, amount: number): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch('/api/swap', {
        method: 'POST',
        headers: await appwriteService.getAuthHeaders(),
        body: JSON.stringify({ userId, amount })
      });
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },
  performSpin: async (userId: string, spinType?: 'free' | 'paid') => {
    try {
      const response = await fetch('/api/perform-spin', {
        method: 'POST',
        headers: await appwriteService.getAuthHeaders(),
        body: JSON.stringify({ userId, spinType })
      });
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },
  getSpinHistory: async (userId: string) => {
    try {
      const response = await databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.transactions,
        [Query.equal('user_id', [userId]), Query.equal('type', ['spin']), Query.orderDesc('created_at'), Query.limit(10)]
      );
      // Map transaction objects to SpinHistory format
      return response.documents.map((doc: any) => ({
        id: doc.$id,
        user_id: doc.user_id,
        reward_label: doc.description.replace('Spin Wheel Reward: ', ''),
        amount: doc.amount,
        created_at: doc.created_at
      }));
    } catch (error) {
      return [];
    }
  },
  claimRankReward: async (userId: string, rewardId: string) => {
    try {
      const response = await fetch('/api/rewards/claim', {
        method: 'POST',
        headers: await appwriteService.getAuthHeaders(),
        body: JSON.stringify({ userId, rewardId })
      });
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },
  selfHealSchema: async () => {
    try {
      const response = await fetch('/api/admin/self-heal-schema', {
        method: 'POST',
        headers: await appwriteService.getAuthHeaders()
      });
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
};
