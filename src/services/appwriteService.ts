import { User, Wallet, MLMPackage, Transaction, Settings, ExchangerRequest, Purchase } from '../types';

export const appwriteService = {
  // Auth
  getCurrentUser: async (): Promise<User | null> => {
    try {
      const token = localStorage.getItem('spiral_auth_token');
      const savedUser = localStorage.getItem('spiral_user');
      if (!token || !savedUser) {
        localStorage.removeItem('spiral_user');
        localStorage.removeItem('spiral_auth_token');
        return null;
      }

      const userObj = JSON.parse(savedUser);
      const userId = userObj.id || userObj.uid;

      const response = await fetch(`/api/user/profile/${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        cache: 'no-store'
      });
      if (!response.ok) {
        localStorage.removeItem('spiral_user');
        localStorage.removeItem('spiral_auth_token');
        return null;
      }

      const data = await response.json();
      if (data.success && data.user) {
        const userProfile = {
          ...data.user,
          id: data.user.uid, // mapped compatibility
        };
        localStorage.setItem('spiral_user', JSON.stringify(userProfile));
        return userProfile;
      }
    } catch (error) {
      console.error("fetch profile failed:", error);
    }
    return null;
  },

  login: async (email: string, pass: string) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, pass })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Login failed. Check your email or password.');
      }

      localStorage.setItem('spiral_auth_token', data.token);
      const userProfile = {
        ...data.user,
        id: data.user.uid
      };
      localStorage.setItem('spiral_user', JSON.stringify(userProfile));
      return userProfile;
    } catch (error: any) {
      console.error("Custom auth login failed:", error);
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
      localStorage.removeItem('spiral_auth_token');
      localStorage.removeItem('spiral_user');
      return true;
    } catch (error) {
      return false;
    }
  },

  requestPasswordReset: async (email: string) => {
    return { success: true, message: 'Please contact administration to request a password reset, or use default password: password123.' };
  },

  resetPassword: async (userId: string, secret: string, pass: string, passAgain: string) => {
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, newPassword: pass })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Reset password failed');
      return { success: true, message: 'Password reset successful' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },

  // DB Methods
  getAuthHeaders: async () => {
    const token = localStorage.getItem('spiral_auth_token');
    if (token) {
      return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };
    }
    
    // Fallback ID header check
    try {
      const savedUser = localStorage.getItem('spiral_user');
      if (savedUser) {
        const userObj = JSON.parse(savedUser);
        const userId = userObj.id || userObj.uid;
        if (userId) {
          return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer fallback_${userId}`
          };
        }
      }
    } catch (innerErr) {
      console.error("Local session parsing failed:", innerErr);
    }
    return { 'Content-Type': 'application/json' };
  },

  getWallet: async (userId: string): Promise<Wallet | null> => {
    try {
      const headers = await appwriteService.getAuthHeaders();
      const response = await fetch(`/api/user/wallet/${userId}`, { 
        headers,
        cache: 'no-store'
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data.wallet;
    } catch (error) {
      return null;
    }
  },

  updateWallet: async (userId: string, data: Partial<Wallet>): Promise<{ success: boolean; message: string }> => {
    try {
      const headers = await appwriteService.getAuthHeaders();
      const response = await fetch(`/api/user/wallet/update`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId, data })
      });
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },

  getPackages: async (): Promise<MLMPackage[]> => {
    try {
      const response = await fetch('/api/packages');
      if (!response.ok) return [];
      const data = await response.json();
      return data.packages || [];
    } catch (error: any) {
      console.error("Fetch packages failed:", error);
      throw error;
    }
  },

  getAllPackages: async (): Promise<MLMPackage[]> => {
    try {
      const response = await fetch('/api/packages');
      if (!response.ok) return [];
      const data = await response.json();
      return data.packages || [];
    } catch (error: any) {
      console.error("Fetch all packages failed:", error);
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
      console.error("Package save failed:", error);
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
      const headers = await appwriteService.getAuthHeaders();
      const response = await fetch(`/api/user/boosting-progress/${userId}`, { headers });
      if (!response.ok) return { progress: 0, total: 12, position: 0 };
      return await response.json();
    } catch (error) {
      return { progress: 0, total: 12, position: 0 };
    }
  },

  forceBoostingWinner: async (userId: string) => {
    try {
      const response = await fetch('/api/admin/force-boosting-winner', {
        method: 'POST',
        headers: await appwriteService.getAuthHeaders(),
        body: JSON.stringify({ userId })
      });
      return await response.json();
    } catch (error) {
      return { success: false, message: 'Failed' };
    }
  },

  getBoostingQueue: async (): Promise<any[]> => {
    try {
      const headers = await appwriteService.getAuthHeaders();
      const response = await fetch('/api/admin/boosting-queue', { headers });
      if (!response.ok) return [];
      const data = await response.json();
      return data.queue || [];
    } catch (error) {
      return [];
    }
  },

  deleteBoostingEntry: async (id: string) => {
    try {
      const response = await fetch('/api/admin/delete-boosting-entry', {
        method: 'POST',
        headers: await appwriteService.getAuthHeaders(),
        body: JSON.stringify({ id })
      });
      return await response.json();
    } catch (error) {
      return { success: false, message: 'Failed' };
    }
  },

  purchasePackage: async (userId: string, packageId: string) => {
    try {
      const response = await fetch('/api/purchase-package', {
        method: 'POST',
        headers: await appwriteService.getAuthHeaders(),
        body: JSON.stringify({ userId, packageId: parseInt(packageId, 10) })
      });
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },

  getTransactions: async (userId: string): Promise<Transaction[]> => {
    try {
      const headers = await appwriteService.getAuthHeaders();
      const response = await fetch(`/api/user/transactions/${userId}`, { headers });
      if (!response.ok) return [];
      const data = await response.json();
      return data.transactions || [];
    } catch (error) {
      return [];
    }
  },

  getDirectReferrals: async (userId: string): Promise<User[]> => {
    try {
      const headers = await appwriteService.getAuthHeaders();
      const response = await fetch(`/api/user/directs/${userId}`, { headers });
      if (!response.ok) return [];
      const data = await response.json();
      return data.directs || [];
    } catch (error) {
      return [];
    }
  },

  getAllUsers: async (): Promise<User[]> => {
    try {
      const headers = await appwriteService.getAuthHeaders();
      const response = await fetch('/api/admin/users', { headers });
      if (!response.ok) return [];
      const data = await response.json();
      return data.users || [];
    } catch (error) {
      return [];
    }
  },

  getLeaderboard: async (): Promise<any[]> => {
    try {
      const headers = await appwriteService.getAuthHeaders();
      const response = await fetch('/api/user/leaderboard', { headers });
      if (!response.ok) return [];
      const data = await response.json();
      return data.leaderboard || [];
    } catch (error) {
      return [];
    }
  },

  getAllPurchases: async (): Promise<Purchase[]> => {
    try {
      const headers = await appwriteService.getAuthHeaders();
      const response = await fetch('/api/admin/purchases', { headers });
      if (!response.ok) return [];
      const data = await response.json();
      return data.purchases || [];
    } catch (error) {
      return [];
    }
  },

  getTeamData: async (userId: string): Promise<{ users: User[], purchases: Purchase[] }> => {
    try {
      const headers = await appwriteService.getAuthHeaders();
      const response = await fetch(`/api/user/team-data/${userId}`, { headers });
      if (!response.ok) return { users: [], purchases: [] };
      return await response.json();
    } catch (error) {
      return { users: [], purchases: [] };
    }
  },

  getUserPurchases: async (userId: string): Promise<Purchase[]> => {
    try {
      const headers = await appwriteService.getAuthHeaders();
      const response = await fetch('/api/user/purchases', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId })
      });
      if (!response.ok) return [];
      const data = await response.json();
      return data.documents || [];
    } catch (error) {
      return [];
    }
  },

  getLevelBusiness: async (userId: string, depth: number): Promise<number> => {
    try {
      const response = await fetch(`/api/user/level-business/${userId}/${depth}`);
      if (!response.ok) return 0;
      const data = await response.json();
      return data.business || 0;
    } catch (error) {
      return 0;
    }
  },

  getDirects: async (userId: string) => {
    try {
      const headers = await appwriteService.getAuthHeaders();
      const response = await fetch(`/api/user/directs/${userId}`, { headers });
      if (!response.ok) return [];
      const data = await response.json();
      return data.directs || [];
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
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  },

  getSettings: async (): Promise<Settings | null> => {
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) return null;
      const data = await response.json();
      return data.settings || null;
    } catch (error) {
      return null;
    }
  },

  updateUser: async (userId: string, data: { name?: string, password?: string, personal_business?: number, team_business?: number, mobile?: string, role?: string, isActive?: boolean }) => {
    try {
      const response = await fetch('/api/admin/update-user', {
        method: 'POST',
        headers: await appwriteService.getAuthHeaders(),
        body: JSON.stringify({ userId, data })
      });
      return await response.json();
    } catch (error) {
      return { success: false, message: 'Failed' };
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
    } catch (error) {
      return { success: false, message: 'Failed' };
    }
  },

  updateSettings: async (settings: Settings) => {
    try {
      const response = await fetch('/api/update-settings', {
        method: 'POST',
        headers: await appwriteService.getAuthHeaders(),
        body: JSON.stringify({ settings })
      });
      return await response.json();
    } catch (error) {
      return { success: false, message: 'Failed' };
    }
  },

  getExchangerRequests: async (userId?: string): Promise<ExchangerRequest[]> => {
    try {
      const headers = await appwriteService.getAuthHeaders();
      const url = userId ? `/api/user/exchanger-requests/${userId}` : '/api/admin/requests';
      const response = await fetch(url, { headers });
      if (!response.ok) return [];
      const data = await response.json();
      return data.requests || [];
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
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },

  updateExchangerRequest: async (requestId: string, status: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch('/api/admin/handle-request', {
        method: 'POST',
        headers: await appwriteService.getAuthHeaders(),
        body: JSON.stringify({ requestId: parseInt(requestId, 10), status })
      });
      return await response.json();
    } catch (error: any) {
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
      const headers = await appwriteService.getAuthHeaders();
      const response = await fetch(`/api/user/spin-history/${userId}`, { headers });
      if (!response.ok) return [];
      const data = await response.json();
      return data.history || [];
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
  },

  realignMatrixTree: async (mode: 'active_only' | 'all') => {
    try {
      const response = await fetch('/api/admin/realign-matrix-tree', {
        method: 'POST',
        headers: await appwriteService.getAuthHeaders(),
        body: JSON.stringify({ mode })
      });
      return await response.json();
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
};
