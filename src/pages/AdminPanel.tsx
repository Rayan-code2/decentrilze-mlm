import React, { useState, useEffect } from 'react';
import { User, Wallet, Settings, ExchangerRequest, Transaction, MLMPackage, Purchase } from '../types';
import { mockApi } from '../lib/mockApi';
import { appwriteService } from '../services/appwriteService';
import { isAppwriteConfigured } from '../lib/appwrite';
import { 
  Users, Settings as SettingsIcon, CreditCard, 
  CheckCircle2, XCircle, Search, Filter, 
  ChevronRight, ArrowRight, Shield, 
  AlertCircle, Save, RefreshCcw, Package, Plus, Trash2, Edit2, Trophy, Database, AlertTriangle, Info, Zap, Clock, User as UserIcon, Copy
} from 'lucide-react';

interface AdminPanelProps {
  user: User;
  onLogout: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'requests' | 'settings' | 'packages' | 'rewards' | 'spin' | 'inventory' | 'boosting'>('users');
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  const [users, setUsers] = useState<User[]>([]);
  const [requests, setRequests] = useState<ExchangerRequest[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [packages, setPackages] = useState<MLMPackage[]>([]);
  const [boostingQueue, setBoostingQueue] = useState<any[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [selectedPackageIds, setSelectedPackageIds] = useState<string[]>([]);
  const [editingPackage, setEditingPackage] = useState<MLMPackage | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingUserWallet, setEditingUserWallet] = useState<any>(null);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [viewingUser, setViewingUser] = useState<User | null>(null);
  const [viewingUserWallet, setViewingUserWallet] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    setStatusMsg({ type: 'success', text: 'Copied to clipboard!' });
    setTimeout(() => setStatusMsg(null), 2000);
  };

  const [isLiveMode, setIsLiveMode] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const isLive = isAppwriteConfigured();
      const api = isLive ? appwriteService : mockApi.db;
      
      const [usersData, settingsData, packagesData, requestsData, purchasesData, boostingData] = await Promise.all([
        api.getAllUsers(),
        api.getSettings(),
        api.getAllPackages ? api.getAllPackages() : api.getPackages(),
        api.getExchangerRequests(),
        (api as any).getAllPurchases(),
        api.getBoostingQueue ? api.getBoostingQueue() : Promise.resolve([])
      ]);
      setUsers(usersData || []);
      
      // Fallback for settings if null
      if (!settingsData) {
        const fallback = await mockApi.db.getSettings();
        setSettings(fallback as any);
      } else {
        setSettings(settingsData);
      }

      const sortedPackages = (packagesData || []).sort((a: any, b: any) => a.price - b.price);
      setPackages(sortedPackages);
      
      const mappedRequests = (requestsData || []).map((r: any) => ({
        ...r,
        user_id: r.user_id || r.userId,
        utr_number: r.utr_number || r.utrNumber,
        inr_amount: r.inr_amount || r.inrAmount,
        created_at: r.created_at || r.createdAt,
        user_name: r.user_name || r.userName,
        user_email: r.user_email || r.userEmail,
        userName: r.userName || r.user_name,
        userEmail: r.userEmail || r.user_email,
      }));
      setRequests(mappedRequests);
      setPurchases(purchasesData || []);
      setLastUpdated(Date.now());
      
      const resolvedQueue = (boostingData || []).map((entry: any) => {
        const userIdRaw = String(entry.user_id || '').toLowerCase();
        const user = (usersData || []).find((u: any) => {
          const uId = String(u.id || u.$id || '').toLowerCase();
          const uUserId = String(u.user_id || '').toLowerCase();
          const uNodeId = String(u.node_id || '').toLowerCase();
          const uEmail = String(u.email || '').toLowerCase();
          
          return (userIdRaw && (uId === userIdRaw || uUserId === userIdRaw || uNodeId === userIdRaw || uEmail === userIdRaw));
        });
        
        // Use status from entry if available, fallback to rebirth check
        const isRebirth = entry.is_rebirth || entry.status === 'rebirth';
        
        return { 
          ...entry, 
          is_rebirth: isRebirth,
          userName: user?.name || user?.email || `User (${entry.user_id?.substring(0, 8)})` 
        };
      });
      setBoostingQueue(resolvedQueue);
    } catch (e: any) {
      console.error("Admin data fetch failed:", e);
      setStatusMsg({ type: 'error', text: 'Data fetch failed: ' + (e.message || 'Unknown error') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const live = isAppwriteConfigured();
    setIsLiveMode(live);
    if (live) {
      console.log("[AdminPanel] Auto-triggering schema self-heal on load...");
      appwriteService.selfHealSchema().catch(err => {
        console.error("Auto schema healing failed:", err);
      });
    }
    fetchData();
  }, [user.id, user.user_id, user.role]);

  useEffect(() => {
    const fetchUserWallet = async () => {
      if (!editingUser) {
        setEditingUserWallet(null);
        return;
      }
      try {
        const isLive = isAppwriteConfigured();
        const api = isLive ? appwriteService : mockApi.db;
        const lookupId = editingUser.user_id || editingUser.id;
        const wallet = await api.getWallet(lookupId);
        setEditingUserWallet(wallet);
      } catch (e) {
        console.error("Failed to fetch user wallet for editing:", e);
      }
    };
    fetchUserWallet();
  }, [editingUser]);

  useEffect(() => {
    const fetchViewingUserWallet = async () => {
      if (!viewingUser) {
        setViewingUserWallet(null);
        return;
      }
      try {
        const isLive = isAppwriteConfigured();
        const api = isLive ? appwriteService : mockApi.db;
        const lookupId = viewingUser.user_id || viewingUser.id;
        const wallet = await api.getWallet(lookupId);
        setViewingUserWallet(wallet);
      } catch (e) {
        console.error("Failed to fetch user wallet for viewing:", e);
      }
    };
    fetchViewingUserWallet();
  }, [viewingUser]);

  const handleSyncAllBoosting = async () => {
    if (!window.confirm("This will re-verify boosting qualification for ALL users. Continue?")) return;
    try {
      setStatusMsg({ type: 'success', text: 'Initiating global sync...' });
      for (const u of users) {
        await appwriteService.syncBoosting(u.user_id || u.$id);
      }
      setStatusMsg({ type: 'success', text: 'Global sync completed' });
      fetchData();
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: 'Sync failed: ' + e.message });
    }
  };

  const handleDeleteBoostingEntry = async (id: string) => {
    try {
      setStatusMsg({ type: 'success', text: 'Removing entry from queue...' });
      const isLive = isAppwriteConfigured();
      if (isLive) {
        await appwriteService.deleteBoostingEntry(id);
      } else {
        // Mock delete
        const queue = JSON.parse(localStorage.getItem('boosting_gold_queue') || '[]');
        const filtered = queue.filter((e: any) => e.id !== id);
        localStorage.setItem('boosting_gold_queue', JSON.stringify(filtered));
      }
      setStatusMsg({ type: 'success', text: 'Entry removed successfully' });
      fetchData();
      setDeleteConfirm(null);
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: 'Failed to remove entry: ' + e.message });
    }
  };

  const [matrixAlignMode, setMatrixAlignMode] = useState<'active_only' | 'all'>('active_only');
  const [isAligningMatrix, setIsAligningMatrix] = useState(false);
  const [matrixAlignStatus, setMatrixAlignStatus] = useState<string | null>(null);

  const handleRealignMatrix = async () => {
    if (!window.confirm(`Are you sure you want to realign the entire 2x2 matrix using ${matrixAlignMode === 'active_only' ? 'Active Members only' : 'All Registered Accounts'}? This will rebuild parent IDs to ensure a perfect binary sequence with zero empty spaces.`)) {
      return;
    }
    setIsAligningMatrix(true);
    setMatrixAlignStatus(null);
    try {
      const isLive = isAppwriteConfigured();
      const res = isLive 
        ? await appwriteService.realignMatrixTree(matrixAlignMode)
        : { success: true, message: "Simulation Mode: Rebuilt perfect 2x2 matrix." };

      if (res.success) {
        setIsAligningMatrix(false);
        setMatrixAlignStatus("Tree realigned successfully!");
        setStatusMsg({ type: 'success', text: res.message || 'Matrix structure realigned successfully!' });
        fetchData();
      } else {
        throw new Error(res.message || "Failed to realign tree.");
      }
    } catch (err: any) {
      setIsAligningMatrix(false);
      setMatrixAlignStatus(`Error: ${err.message}`);
      setStatusMsg({ type: 'error', text: err.message || 'Realignment failed.' });
    }
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const formElement = e.currentTarget as HTMLFormElement;
    const formData = new FormData(formElement);
    
    // Build new settings object dynamically to ensure we don't miss fields
    const newSettings: any = { ...settings };
    
    // Process all inputs/textareas/selects in the form
    const elements = formElement.querySelectorAll('input, textarea, select');
    elements.forEach((el: any) => {
      const name = el.name;
      if (!name) return;

      if (el.type === 'checkbox') {
        newSettings[name] = el.checked;
      } else if (el.type === 'number') {
        const val = formData.get(name);
        newSettings[name] = val !== '' ? Number(val) : 0;
      } else {
        newSettings[name] = formData.get(name);
      }
    });

    // Special cases or nested fields that might not be in the flat form structure
    // We already have these in the state, and we initialized newSettings with { ...settings }
    // but just to be 100% sure we have the latest from state:
    newSettings.rank_rewards = settings?.rank_rewards || [];
    newSettings.spin_rewards = settings?.spin_rewards || [];

    console.log("[Settings] Final Dynamic Payload:", newSettings);
    
    try {
      setStatusMsg({ type: 'success', text: 'Initiating server-side protocol update...' });
      const isLive = isAppwriteConfigured();
      const api = isLive ? appwriteService : mockApi.db;

      const res = await (api as any).updateSettings(newSettings as Settings);
      
      console.log("[Settings] Server Response:", res);

      if (res && res.success) {
        if (res.droppedFields && res.droppedFields.length > 0) {
          setStatusMsg({ 
            type: 'warning', 
            text: `Updated, but Appwrite REJECTED: ${res.droppedFields.join(', ')}. Check if these match your Appwrite column keys exactly.` 
          });
        } else {
          setStatusMsg({ type: 'success', text: res.message || 'Protocol settings synchronized successfully!' });
        }
        // Force immediate refresh
        await fetchData();
        setLastUpdated(Date.now());
      } else {
        setStatusMsg({ type: 'error', text: res?.message || 'Update rejected by server. Check console.' });
      }
    } catch (e: any) {
      console.error("Settings Update Failed:", e);
      setStatusMsg({ type: 'error', text: 'Network Error: ' + (e.message || 'Unknown error') });
    }
    setTimeout(() => setStatusMsg(null), 8000);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const newName = formData.get('userName') as string;
    const newPassword = formData.get('userPassword') as string;
    const mobile = formData.get('userMobile') as string;
    const newRole = formData.get('userRole') as string;
    const personalBusiness = formData.get('personalBusiness') ? Number(formData.get('personalBusiness')) : undefined;
    const teamBusiness = formData.get('teamBusiness') ? Number(formData.get('teamBusiness')) : undefined;
    const userIsActive = formData.get('userIsActive') !== null;
    const userReferredBy = formData.get('userReferredBy') as string;
    const userMatrixParentId = formData.get('userMatrixParentId') as string;
    const walletBalanceRaw = formData.get('userWalletBalance');
    const walletBalance = (walletBalanceRaw !== null && walletBalanceRaw !== '') ? Number(walletBalanceRaw) : undefined;

    setIsSavingUser(true);
    setModalError(null);

    try {
      const isLive = isAppwriteConfigured();
      const api = isLive ? appwriteService : mockApi.db;
      
      const res = await (api as any).updateUser(editingUser.id, { 
        name: newName, 
        password: newPassword || undefined,
        personal_business: personalBusiness,
        team_business: teamBusiness,
        mobile: mobile,
        role: newRole,
        isActive: userIsActive,
        referredBy: userReferredBy,
        matrixParentId: userMatrixParentId,
      });

      if (res.success && walletBalance !== undefined && !isNaN(walletBalance)) {
        const lookupId = editingUser.user_id || editingUser.id;
        await (api as any).updateWallet(lookupId, { balance: walletBalance });
      }

      if (res.success) {
        setStatusMsg({ type: 'success', text: 'User updated successfully!' });
        setEditingUser(null);
        fetchData();
      } else {
        setModalError(res.message || 'Update failed');
        setStatusMsg({ type: 'error', text: res.message || 'Update failed' });
      }
    } catch (e: any) {
      setModalError(e.message || 'An error occurred');
      setStatusMsg({ type: 'error', text: e.message || 'An error occurred' });
    } finally {
      setIsSavingUser(false);
    }
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleForceBoosting = async (userId: string, userName: string) => {
    if (!window.confirm(`Are you sure you want to make ${userName} a Global Boosting Winner?`)) return;
    
    try {
      const res = await appwriteService.forceBoostingWinner(userId);
      if (res.success) {
        setStatusMsg({ type: 'success', text: `${userName} has been rewarded with Boosting Gold payout!` });
        fetchData();
      } else {
        setStatusMsg({ type: 'error', text: res.message || 'Action failed' });
      }
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: e.message || 'Operation failed' });
    }
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!window.confirm(`⚠️ WARNING ⚠️\n\nAre you sure you want to permanently delete user "${userName}"?\n\nThis will delete:\n1. Mainframe Auth credentials\n2. User SQL Profile record\n3. User Wallet record\n4. Active packages and transaction histories\n\nThis action cannot be undone! Proceed?`)) return;

    try {
      const isLive = isAppwriteConfigured();
      if (!isLive) {
        // Mock deletion
        const prevUsers = JSON.parse(localStorage.getItem('spiral_all_users') || '[]');
        const updated = prevUsers.filter((u: any) => u.id !== userId);
        localStorage.setItem('spiral_all_users', JSON.stringify(updated));
        setStatusMsg({ type: 'success', text: `[Mock] User "${userName}" deleted successfully!` });
        fetchData();
        return;
      }

      setStatusMsg({ type: 'info', text: `Deleting user "${userName}" and cleaning up assets...` });
      
      const res = await appwriteService.deleteUser(userId);
      if (res.success) {
        setStatusMsg({ type: 'success', text: `User "${userName}" and all associated data deleted successfully!` });
        fetchData();
      } else {
        setStatusMsg({ type: 'error', text: res.message || 'Failed to delete user' });
      }
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: e.message || 'An error occurred during deletion' });
    }
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handleResetSystem = () => {
    if (window.confirm("Are you sure you want to RESET ALL SYSTEM DATA? This will clear all users, wallets, and settings. This action is irreversible.")) {
      const keysToClear = [
        'spiral_user', 'spiral_all_users', 'spiral_settings', 'usdt_rates', 
        'boosting_gold_queue', 'spiral_packages'
      ];
      
      // Clear specific keys
      keysToClear.forEach(key => localStorage.removeItem(key));
      
      // Clear dynamic keys (wallets, transactions, etc)
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('spiral_wallet_') || 
            key.startsWith('purchased_packages_') || 
            key.startsWith('spiral_transactions_') || 
            key.startsWith('spiral_task_submissions_')) {
          localStorage.removeItem(key);
        }
      });
      
      window.location.reload();
    }
  };

  const handleAddReward = async () => {
    if (!settings) return;
    setStatusMsg({ type: 'success', text: 'Adding reward...' });
    const newReward = {
      id: Math.random().toString(36).substring(2, 9),
      rank_name: 'New Rank',
      personal_business: 0,
      team_business: 0,
      reward_amount: 0,
      icon_type: 'star' as const
    };
    const updatedSettings = {
      ...settings,
      rank_rewards: [...(settings.rank_rewards || []), newReward]
    };
    
    try {
      const isLive = isAppwriteConfigured();
      const api = isLive ? appwriteService : mockApi.db;
      const res = await api.updateSettings(updatedSettings as any);
      if (res.success) {
        setSettings(updatedSettings);
        setStatusMsg({ type: 'success', text: 'Reward added!' });
      } else {
        setStatusMsg({ type: 'error', text: res.message || 'Failed to add reward' });
      }
    } catch (e) {
      console.error(e);
      setStatusMsg({ type: 'error', text: 'System error' });
    }
    setTimeout(() => setStatusMsg(null), 2000);
  };

  const handleUpdateReward = async (id: string, field: string, value: any) => {
    if (!settings) return;
    
    // Use functional update to ensure we have current state
    setSettings(prev => {
      if (!prev) return prev;
      const updatedRewards = (prev.rank_rewards || []).map(r => 
        r.id === id ? { ...r, [field]: value } : r
      );
      const updatedSettings = { ...prev, rank_rewards: updatedRewards };
      
      // Fire the save in background
      const isLive = isAppwriteConfigured();
      const api = isLive ? appwriteService : mockApi.db;
      api.updateSettings(updatedSettings as any).catch(err => {
        console.error("Auto-save failed for reward", err);
      });
      
      return updatedSettings;
    });
  };

  const handleDeleteReward = async (id: string) => {
    if (!settings) return;
    if (!window.confirm('Delete this reward?')) return;
    
    setStatusMsg({ type: 'success', text: 'Deleting reward...' });
    const updatedRewards = (settings.rank_rewards || []).filter(r => r.id !== id);
    const updatedSettings = { ...settings, rank_rewards: updatedRewards };
    
    try {
      const isLive = isAppwriteConfigured();
      const api = isLive ? appwriteService : mockApi.db;
      const res = await api.updateSettings(updatedSettings as any);
      if (res.success) {
        setSettings(updatedSettings);
        setStatusMsg({ type: 'success', text: 'Reward deleted!' });
      } else {
        setStatusMsg({ type: 'error', text: res.message || 'Failed to delete' });
      }
    } catch (e) {
      setStatusMsg({ type: 'error', text: 'System error' });
    }
    setTimeout(() => setStatusMsg(null), 2000);
  };

  const handleRequestAction = async (id: string, action: 'approve' | 'reject') => {
    try {
      const isLive = isAppwriteConfigured();
      const api = isLive ? appwriteService : mockApi.db;
      const status = action === 'approve' ? 'approved' : 'rejected';
      const result = await api.updateExchangerRequest(id, status) as any;
      
      if (result.success) {
        if (result.log) {
          console.log("[ADMIN_LOGS]", result.log);
        }
        setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
        setStatusMsg({ type: 'success', text: result.message || `Request ${action}d successfully!` });
        // Slight delay to allow for background wallet/transaction updates to propagate
        setTimeout(() => fetchData(), 1000);
      } else {
        setStatusMsg({ type: 'error', text: result.message || `Failed to ${action} request.` });
      }
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: e.message || `Failed to ${action} request.` });
    }
    setTimeout(() => setStatusMsg(null), 5000);
  };

  const handleSavePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPackage) return;
    
    try {
      setStatusMsg({ type: 'success', text: 'Saving package...' });
      let res;
      if (isAppwriteConfigured()) {
        res = await appwriteService.savePackage(editingPackage);
      } else {
        res = await mockApi.db.savePackage(editingPackage);
      }

      if (res && res.success) {
        setStatusMsg({ type: 'success', text: 'Package saved successfully!' });
        setEditingPackage(null);
        fetchData();
      } else {
        setStatusMsg({ type: 'error', text: res?.message || 'Failed to save package.' });
      }
    } catch (e: any) {
      console.error("Package Save Exception:", e);
      setStatusMsg({ type: 'error', text: 'Critical Error: ' + (e.message || 'Unknown server error') });
    }
    setTimeout(() => setStatusMsg(null), 5000);
  };

  const handleDeletePackage = async (rawId: string) => {
    const id = String(rawId);
    if (!id) {
      setStatusMsg({ type: 'error', text: 'Invalid Package ID' });
      return;
    }
    
    const pkg = packages.find(p => String(p.id) === id);
    if (!window.confirm(`Are you sure you want to delete "${pkg?.name || 'this package'}"? (Internal ID: ${id})\n\nThis will permanently remove it from the system.`)) return;
    
    try {
      setStatusMsg({ type: 'success', text: 'Executing deletion protocol...' });
      const isLive = isAppwriteConfigured();
      const api = isLive ? appwriteService : mockApi.db;
      
      console.log(`[Admin] Initiating Delete. Target: ${id}, Live Mode: ${isLive}`);
      const res = await api.deletePackage(id);
      
      console.log(`[Admin] API Response:`, res);
      
      if (res && res.success) {
        setStatusMsg({ type: 'success', text: 'Package purged successfully!' });
        setPackages(prev => prev.filter(p => String(p.id) !== id));
        // Force refresh to ensure data integrity
        setTimeout(() => fetchData(), 800);
      } else {
        const errorMsg = res?.message || 'Deletion rejected by server';
        setStatusMsg({ type: 'error', text: `Failed: ${errorMsg}` });
        alert(`Deletion Failed\n\nID: ${id}\nReason: ${errorMsg}`);
      }
    } catch (e: any) {
      console.error("Critical Deletion Failure:", e);
      setStatusMsg({ type: 'error', text: 'Critical Error: ' + e.message });
      alert(`Critical System Error\n\n${e.message}`);
    }
    setTimeout(() => setStatusMsg(null), 3000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      
      {/* ADMIN HEADER */}
      <section className="relative overflow-hidden rounded-[3rem] p-10 bg-black/40 border-2 border-red-500/20 shadow-2xl">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8 relative z-10">
          <div className="flex items-center gap-6">
            <div className="p-6 rounded-3xl bg-red-500/10 text-red-500 border border-red-500/20">
              <Shield size={40} />
            </div>
            <div>
              <div className="flex flex-col">
                <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter text-red-500">Admin Command Center</h2>
                <div className="flex items-center gap-2 mt-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${isLiveMode ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-amber-500 animate-pulse'}`} />
                  <span className={`text-[10px] font-black uppercase tracking-widest ${isLiveMode ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {isLiveMode ? 'Live Protocol Mode' : 'Mock Development Mode'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2">
                {isAppwriteConfigured() ? (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse"></div>
                    <span className="text-[7px] font-black uppercase tracking-widest">Live Mode</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    <span className="text-[7px] font-black uppercase tracking-widest text-[#FFB000]">Sandbox</span>
                  </div>
                )}
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest opacity-60 italic">Authorized Control Protocol</p>
              </div>
            </div>
          </div>
          <div className="flex bg-black/40 p-1.5 rounded-2xl border border-white/5 overflow-x-auto custom-scrollbar max-w-full">
            {[
              { id: 'users', label: 'Users', icon: <Users size={14} /> },
              { id: 'requests', label: 'Requests', icon: <CreditCard size={14} /> },
              { id: 'inventory', label: 'Inventory', icon: <Package size={14} /> },
              { id: 'packages', label: 'Packages', icon: <Package size={14} /> },
              { id: 'rewards', label: 'Rewards', icon: <Trophy size={14} /> },
              { id: 'boosting', label: 'Boosting', icon: <Zap size={14} /> },
              { id: 'spin', label: 'Spin', icon: <RefreshCcw size={14} /> },
              { id: 'settings', label: 'Settings', icon: <SettingsIcon size={14} /> },
            ].map((tab) => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex-shrink-0 ${activeTab === tab.id ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'text-slate-500 hover:text-white'}`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {statusMsg && (
        <div className={`p-4 rounded-2xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${statusMsg.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {statusMsg.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-[10px] font-black uppercase tracking-widest">{statusMsg.text}</span>
        </div>
      )}

      {/* CONTENT */}
      <div className="bg-slate-950/40 rounded-[3rem] border border-white/5 overflow-y-auto max-h-[800px] min-h-[500px] custom-scrollbar">
        
        {activeTab === 'users' && (
          <div className="p-8 space-y-6">
            <div className="flex items-center gap-4 bg-black/40 px-6 py-3 rounded-2xl border border-white/5">
              <Search size={18} className="text-slate-500" />
              <input 
                type="text" 
                placeholder="Search users by name, email, or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent border-none outline-none text-xs text-white placeholder:text-slate-700 w-full"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">User</th>
                    <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                    <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Directs</th>
                    <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Joined</th>
                    <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {users.filter(u => (u.email?.toLowerCase() || '').includes(search.toLowerCase()) || (u.name?.toLowerCase() || '').includes(search.toLowerCase())).map((u) => (
                    <tr key={u.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-black text-white">
                            {u.name?.charAt(0) || '?'}
                          </div>
                          <div>
                            <p className="text-sm font-black text-white italic tracking-tighter leading-none">{u.name || 'Unknown User'}</p>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mt-1">
                              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{u.email}</p>
                              {u.mobile && (
                                <p className="text-[8px] font-black text-neon-cyan uppercase tracking-widest flex items-center gap-1">
                                  <span>|</span> 📱 {u.mobile}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                          (u.is_active || (u as any).isActive) 
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                            : 'bg-red-500/10 border-red-500/20 text-red-400'
                        }`}>
                          {(u.is_active || (u as any).isActive) ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="text-xs font-black text-white italic">{u.direct_count ?? (u as any).directCount ?? 0}</span>
                      </td>
                      <td className="p-4">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          {(() => {
                            const dateVal = u.created_at || (u as any).createdAt;
                            if (!dateVal) return 'N/A';
                            const parsed = new Date(dateVal);
                            return isNaN(parsed.getTime()) ? 'N/A' : parsed.toLocaleDateString();
                          })()}
                        </span>
                      </td>
                      <td className="p-4 text-right flex justify-end gap-2">
                        <button 
                          onClick={() => handleForceBoosting(u.id, u.name)}
                          title="Make Boosting Winner"
                          className="p-2 text-slate-500 hover:text-amber-400 transition-colors"
                        >
                          <Trophy size={16} />
                        </button>
                        <button 
                          onClick={() => setEditingUser(u)}
                          title="Edit User Info"
                          className="p-2 text-slate-500 hover:text-emerald-400 transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDeleteUser(u.id, u.name || 'User')}
                          title="Delete User Completely"
                          className="p-2 text-slate-500 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                        <button 
                          onClick={() => setViewingUser(u)}
                          title="View User Details & Incomes" 
                          className="p-2 text-slate-500 hover:text-cyan-400 transition-colors"
                        >
                          <Info size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'requests' && (
          <div className="p-8 space-y-6">
            <div className="grid grid-cols-1 gap-4">
              {requests.map((req) => (
                <div key={req.id} className="flex items-center justify-between p-6 rounded-[2rem] bg-slate-900/40 border border-white/5">
                  <div className="flex items-center gap-6">
                    <div className={`p-3 rounded-2xl ${req.type === 'deposit' || req.type === 'buy' ? 'bg-cyan-400/10 text-cyan-400' : 'bg-purple-500/10 text-purple-500'}`}>
                      {req.type === 'deposit' || req.type === 'buy' ? <ArrowRight size={20} /> : <ArrowRight size={20} className="rotate-180" />}
                    </div>
                    <div>
                      <h4 className="text-white font-black text-sm italic uppercase tracking-tighter">{req.type.toUpperCase()} - ${req.amount}</h4>
                      {req.inr_amount && <p className="text-emerald-400 text-[10px] font-black uppercase tracking-widest">INR: ₹{req.inr_amount}</p>}
                      <div className="flex gap-4 mt-1">
                        <p className="text-slate-500 text-[8px] font-black uppercase tracking-widest">
                          User: <span className="text-cyan-400 font-bold text-[9px]">{req.userName || req.user_name || 'N/A'}</span> ({req.user_id}) | {req.userEmail || req.user_email ? `${req.userEmail || req.user_email} | ` : ''}{new Date(req.created_at).toLocaleString()}
                        </p>
                        {req.fee !== undefined && (req.type === 'withdraw' || req.type === 'sell') && (
                          <p className="text-rose-400 text-[8px] font-black uppercase tracking-widest">
                            Fee: ${Number(req.fee).toFixed(2)} ({((Number(req.fee) / (Number(req.amount) || 1)) * 100).toFixed(0)}%) | Net: ${(Number(req.amount) - Number(req.fee)).toFixed(2)}
                          </p>
                        )}
                      </div>
                      {req.utr_number && (
                        <div className="flex items-center gap-2 mt-2 group/copy">
                          <p className="text-cyan-400 text-[8px] font-black uppercase tracking-widest">UTR: {req.utr_number}</p>
                          <button 
                            onClick={() => handleCopy(req.utr_number!, `utr-${req.id}`)}
                            className="p-1 rounded bg-white/5 text-slate-500 hover:text-cyan-400 transition-colors"
                            title="Copy UTR"
                          >
                            {copiedId === `utr-${req.id}` ? <CheckCircle2 size={10} /> : <Copy size={10} />}
                          </button>
                        </div>
                      )}
                      {req.address && (
                        <div className="flex items-center gap-2 mt-2 group/copy">
                          <p className="text-cyan-400 text-[8px] font-black uppercase tracking-widest">ADDR: {req.address}</p>
                          <button 
                            onClick={() => handleCopy(req.address!, `addr-${req.id}`)}
                            className="p-1 rounded bg-white/5 text-slate-500 hover:text-cyan-400 transition-colors"
                            title="Copy Address"
                          >
                            {copiedId === `addr-${req.id}` ? <CheckCircle2 size={10} /> : <Copy size={10} />}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {req.status === 'pending' ? (
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => handleRequestAction(req.id, 'reject')}
                        className="p-3 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all"
                      >
                        <XCircle size={18} />
                      </button>
                      <button 
                        onClick={() => handleRequestAction(req.id, 'approve')}
                        className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white transition-all"
                      >
                        <CheckCircle2 size={18} />
                      </button>
                    </div>
                  ) : (
                    <span className={`text-[10px] font-black uppercase tracking-widest ${req.status === 'approved' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {req.status}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="p-8 space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="space-y-1">
                <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">Inventory Analysis</h3>
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Filter by package price and monitor total business value.</p>
              </div>
              <div className="flex flex-wrap gap-2 max-w-xl justify-end">
                {packages.map(pkg => (
                  <button
                    key={pkg.id}
                    onClick={() => {
                      setSelectedPackageIds(prev => 
                        prev.includes(pkg.id) ? prev.filter(id => id !== pkg.id) : [...prev, pkg.id]
                      )
                    }}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                      selectedPackageIds.includes(pkg.id) 
                        ? 'bg-red-500 border-red-400 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]' 
                        : 'bg-white/5 border-white/10 text-slate-500 hover:text-white'
                    }`}
                  >
                    ${pkg.price}
                  </button>
                ))}
                {selectedPackageIds.length > 0 && (
                  <button 
                    onClick={() => setSelectedPackageIds([])}
                    className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white/10 text-white border border-white/10"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-900/40 border border-white/5 p-6 rounded-3xl">
                <p className="text-slate-500 text-[8px] font-black uppercase tracking-widest mb-1">Total Selected Nodes</p>
                <h4 className="text-2xl font-black text-white italic tracking-tighter">
                  {purchases.filter(p => selectedPackageIds.length === 0 || selectedPackageIds.includes(p.package_id)).length}
                </h4>
              </div>
              <div className="bg-slate-900/40 border border-white/5 p-6 rounded-3xl">
                <p className="text-slate-500 text-[8px] font-black uppercase tracking-widest mb-1">Total Business Value</p>
                <h4 className="text-2xl font-black text-emerald-400 italic tracking-tighter">
                  ${purchases.filter(p => {
                    const price = packages.find(pkg => pkg.id === p.package_id)?.price || 0;
                    return (selectedPackageIds.length === 0 || selectedPackageIds.includes(p.package_id));
                  }).reduce((acc, p) => {
                    const price = packages.find(pkg => pkg.id === p.package_id)?.price || 0;
                    return acc + price;
                  }, 0).toLocaleString()}
                </h4>
              </div>
              <div className="bg-slate-900/40 border border-white/5 p-6 rounded-3xl">
                <p className="text-slate-500 text-[8px] font-black uppercase tracking-widest mb-1">Avg. Node Price</p>
                <h4 className="text-2xl font-black text-red-500 italic tracking-tighter">
                  ${(purchases.length > 0 ? (purchases.reduce((acc, p) => acc + (packages.find(pkg => pkg.id === p.package_id)?.price || 0), 0) / purchases.length) : 0).toFixed(0)}
                </h4>
              </div>
            </div>

            <div className="bg-slate-950/40 border border-white/5 rounded-3xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b border-white/5 italic">
                    <th className="p-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">User Details</th>
                    <th className="p-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Node Name</th>
                    <th className="p-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Price</th>
                    <th className="p-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                    <th className="p-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Purchase Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {purchases
                    .filter(p => selectedPackageIds.length === 0 || selectedPackageIds.includes(p.package_id))
                    .sort((a,b) => new Date(b.activated_at).getTime() - new Date(a.activated_at).getTime())
                    .map((p) => {
                      const userObj = users.find(u => u.id === p.user_id || u.user_id === p.user_id);
                      const pkgObj = packages.find(pkg => pkg.id === p.package_id);
                      return (
                        <tr key={p.id} className="hover:bg-white/5 transition-colors group">
                          <td className="p-5">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-xs font-black text-white border border-white/5">
                                {userObj?.name?.charAt(0) || '?'}
                              </div>
                              <div>
                                <p className="text-xs font-black text-white italic tracking-tighter">{userObj?.name || 'Unknown'}</p>
                                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{userObj?.email || p.user_id}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-5">
                            <span className="text-xs font-black text-emerald-400 italic tracking-tighter uppercase">{pkgObj?.name || 'Standard Node'}</span>
                          </td>
                          <td className="p-5 font-mono text-xs text-white font-black italic">
                            ${pkgObj?.price || p.price}
                          </td>
                          <td className="p-5">
                            <span className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                              ACTIVE
                            </span>
                          </td>
                          <td className="p-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            {new Date(p.activated_at).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              {purchases.filter(p => selectedPackageIds.length === 0 || selectedPackageIds.includes(p.package_id)).length === 0 && (
                <div className="p-20 text-center">
                  <div className="inline-flex p-6 rounded-3xl bg-white/5 text-slate-700 mb-4">
                    <Package size={40} />
                  </div>
                  <p className="text-slate-500 text-xs font-black uppercase tracking-widest italic">No data found for the selected selection.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'packages' && (
          <div className="p-8 space-y-8">
            <div className="flex justify-between items-center">
              <h3 className="text-white font-black text-sm italic uppercase tracking-tighter">Package Management</h3>
              <div className="flex gap-4">
                {isLiveMode && (
                  <button 
                    onClick={async () => {
                      setLoading(true);
                      try {
                        setStatusMsg({ type: 'success', text: 'Initiating SQL Database Schema Healing...' });
                        const res = await appwriteService.selfHealSchema();
                        if (res && res.success) {
                          const fieldsCreated = res.created_fields || [];
                          if (fieldsCreated.length > 0) {
                            setStatusMsg({ 
                              type: 'success', 
                              text: `Auto-Fix Triggered! Creating attributes: ${fieldsCreated.join(', ')}. NOTE: Appwrite finishes creating and indexing newly added attributes in 10-15 seconds. Please wait briefly before updating settings.` 
                            });
                          } else {
                            setStatusMsg({ 
                              type: 'success', 
                              text: 'Schema is already healthy! No missing columns in settings table.' 
                            });
                          }
                          fetchData();
                        } else {
                          setStatusMsg({ type: 'error', text: res?.message || 'Auto-Fix failed' });
                        }
                      } catch (err: any) {
                        setStatusMsg({ type: 'error', text: 'Auto-Fix Error: ' + err.message });
                      } finally {
                        setLoading(false);
                      }
                      setTimeout(() => setStatusMsg(null), 12000);
                    }}
                    className="px-6 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all flex items-center gap-1.5"
                  >
                    <Shield size={12} /> Auto-Heal SQL Columns
                  </button>
                )}
                <button 
                  onClick={async () => {
                    if (confirm('Bootstrap will create default nodes ($10, $20, $30, $40). Proceed?')) {
                      setLoading(true);
                      try {
                        const isLive = isAppwriteConfigured();
                        const api = isLive ? appwriteService : mockApi.db;
                        
                        // Bootstrap Settings first if live
                        if (isLive) {
                          const current = await appwriteService.getSettings();
                          if (!current) {
                            const defaultSettings = await mockApi.db.getSettings();
                            await appwriteService.updateSettings(defaultSettings as Settings);
                          }
                        }

                        const defaultPkgs = [
                          { id: 'pkg1', name: 'Starter Node', price: 10, daily_roi: 0.10, roi_interval_minutes: 1440, duration_days: 365, max_roi_percent: 250, direct_income_percent: 20, matrix_income_percent: 10, level_income_percents: [0.5, 0.5, 1, 1, 0.5, 0.2, 0.2, 0.2, 0.2, 0.2], is_active: true },
                          { id: 'pkg2', name: 'Pro Node', price: 20, daily_roi: 0.20, roi_interval_minutes: 1440, duration_days: 365, max_roi_percent: 0, direct_income_percent: 20, matrix_income_percent: 10, level_income_percents: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], is_active: true },
                          { id: 'pkg3', name: 'Elite Node', price: 30, daily_roi: 0.30, roi_interval_minutes: 1440, duration_days: 365, max_roi_percent: 1000, direct_income_percent: 20, matrix_income_percent: 10, level_income_percents: [1, 1, 1, 2, 2, 2, 2, 2, 2, 7], is_active: true },
                          { id: 'pkg4', name: 'Whale Node', price: 40, daily_roi: 0.40, roi_interval_minutes: 1440, duration_days: 365, max_roi_percent: 0, direct_income_percent: 20, matrix_income_percent: 10, level_income_percents: [1, 1, 2, 2, 3, 3, 3, 4, 4, 15], is_active: true }
                        ];
                        
                        let successCount = 0;
                        for (const p of defaultPkgs) {
                          const res = await api.savePackage(p as any);
                          if (res.success) successCount++;
                        }
                        
                        setStatusMsg({ 
                          type: successCount === defaultPkgs.length ? 'success' : 'error', 
                          text: `Bootstrap complete! ${successCount}/${defaultPkgs.length} packages initialized.` 
                        });
                        fetchData();
                      } catch (err: any) {
                        setStatusMsg({ type: 'error', text: 'Bootstrap failed: ' + err.message });
                        setLoading(false);
                      }
                      setTimeout(() => setStatusMsg(null), 5000);
                    }
                  }}
                  className="px-6 py-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[10px] font-black uppercase tracking-widest hover:bg-cyan-500 hover:text-white transition-all"
                >
                  Bootstrap Protocols
                </button>
                <button 
                  onClick={() => setEditingPackage({
                    id: `pkg_${Date.now()}`,
                    name: '',
                    price: 0,
                    daily_roi: 0,
                    roi_interval_minutes: 1440,
                    duration_days: 365,
                    direct_income_percent: 0,
                    matrix_income_percent: 0,
                    level_income_percents: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                    is_active: true
                  })}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-red-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-400 transition-all"
              >
                <Plus size={14} />
                Add New Package
              </button>
            </div>
          </div>

            {editingPackage && (
              <div className="glass-card p-8 border-red-500/20 bg-red-500/5 animate-in zoom-in-95 duration-300">
                <form onSubmit={handleSavePackage} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Package Name</label>
                      <input 
                        type="text" 
                        value={editingPackage.name}
                        onChange={e => setEditingPackage({...editingPackage, name: e.target.value})}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" 
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Price (USDT)</label>
                      <input 
                        type="number" 
                        value={editingPackage.price}
                        onChange={e => setEditingPackage({...editingPackage, price: Number(e.target.value)})}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" 
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Daily ROI (%)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={editingPackage.daily_roi}
                        onChange={e => setEditingPackage({...editingPackage, daily_roi: Number(e.target.value)})}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" 
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">ROI Interval (Min)</label>
                      <input 
                        type="number" 
                        value={editingPackage.roi_interval_minutes ?? 1440}
                        onChange={e => setEditingPackage({...editingPackage, roi_interval_minutes: Number(e.target.value)})}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" 
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Duration (Days)</label>
                      <input 
                        type="number" 
                        value={editingPackage.duration_days ?? 365}
                        onChange={e => setEditingPackage({...editingPackage, duration_days: Number(e.target.value)})}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" 
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Direct Income (%)</label>
                      <input 
                        type="number" 
                        value={editingPackage.direct_income_percent ?? 0}
                        onChange={e => setEditingPackage({...editingPackage, direct_income_percent: Number(e.target.value)})}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" 
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Matrix Parent Income (%)</label>
                      <input 
                        type="number" 
                        value={editingPackage.matrix_income_percent ?? 0}
                        onChange={e => setEditingPackage({...editingPackage, matrix_income_percent: Number(e.target.value)})}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" 
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Global Earning Cap (%)</label>
                      <p className="text-[8px] text-slate-600 px-2 leading-tight">Income stops once this % of price is reached. Set to <b>0</b> for unlimited. (e.g. 250% for $10 = $25 Cap)</p>
                      <input 
                        type="number" 
                        value={editingPackage.max_roi_percent ?? 200}
                        onChange={e => setEditingPackage({...editingPackage, max_roi_percent: Number(e.target.value)})}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" 
                        required
                      />
                    </div>
                    <div className="flex items-center gap-3 pt-8">
                      <input 
                        type="checkbox" 
                        checked={editingPackage.is_active}
                        onChange={e => setEditingPackage({...editingPackage, is_active: e.target.checked})}
                        className="w-4 h-4 rounded border-white/10 bg-black/40 text-red-500"
                      />
                      <label className="text-[10px] font-black text-white uppercase tracking-widest">Active</label>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Level Income ($) - Level 1 to 10</label>
                    <div className="grid grid-cols-5 gap-4">
                      {(() => {
                        let percents = editingPackage.level_income_percents;
                        if (!Array.isArray(percents)) {
                          if (typeof percents === 'string') {
                            try { percents = JSON.parse(percents); } catch (e) { percents = []; }
                          } else {
                            percents = [];
                          }
                        }
                        if (!Array.isArray(percents)) percents = [];
                        const finalPercents = percents.map(Number);
                        while (finalPercents.length < 10) finalPercents.push(0);
                        return finalPercents.slice(0, 10);
                      })().map((val, idx) => (
                        <div key={idx} className="space-y-1">
                          <span className="text-[8px] font-bold text-slate-600 block text-center">L{idx+1}</span>
                          <input 
                            type="number" 
                            step="0.01"
                            value={val || 0}
                            onChange={e => {
                              let percents = editingPackage.level_income_percents;
                              if (!Array.isArray(percents)) {
                                if (typeof percents === 'string') {
                                  try { percents = JSON.parse(percents); } catch (e) { percents = []; }
                                } else {
                                  percents = [];
                                }
                              }
                              if (!Array.isArray(percents)) percents = [];
                              const finalPercents = [...percents].map(Number);
                              while (finalPercents.length < 10) finalPercents.push(0);
                              finalPercents[idx] = Number(e.target.value);
                              setEditingPackage({...editingPackage, level_income_percents: finalPercents.slice(0, 10)});
                            }}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-[10px] text-white text-center" 
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-4">
                    <button 
                      type="button"
                      onClick={() => setEditingPackage(null)}
                      className="px-6 py-2.5 rounded-xl bg-white/5 text-slate-400 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="px-6 py-2.5 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-400 transition-all"
                    >
                      Save Package
                    </button>
                  </div>
                </form>
              </div>
            )}

            {packages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-black/20 rounded-[2rem] border-2 border-dashed border-white/5">
                {statusMsg?.type === 'error' ? (
                  <AlertTriangle size={48} className="text-red-500 mb-4" />
                ) : (
                  <Database size={48} className="text-slate-700 mb-4" />
                )}
                <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">
                  {statusMsg?.type === 'error' ? 'Connection Error' : 'No Packages Initialized'}
                </h3>
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-2 max-w-xs text-center">
                  {statusMsg?.type === 'error' ? statusMsg.text : 'The protocol database is currently empty. Use the Bootstrap button above to load defaults.'}
                </p>
                <div className="flex gap-4 mt-6">
                  <button 
                    onClick={fetchData}
                    className="flex items-center gap-2 text-cyan-400 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors"
                  >
                    <RefreshCcw size={14} />
                    Try Re-Sync
                  </button>
                  <button 
                    onClick={() => setStatusMsg({ type: 'success', text: 'Diagnostic re-run: Check Appwrite Permissions' })}
                    className="flex items-center gap-2 text-slate-500 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors"
                  >
                    <Info size={14} />
                    Status Check
                  </button>
                </div>

                {/* PERMISSION REQUIRED ALERT */}
                <div className="mt-8 p-6 rounded-2xl bg-amber-500/10 border border-amber-500/20 w-full max-w-md">
                   <div className="flex items-center gap-3 mb-3">
                     <AlertTriangle size={20} className="text-amber-500" />
                     <h4 className="text-xs font-black text-amber-500 uppercase tracking-widest">Important: PostgreSQL Setup</h4>
                   </div>
                   <p className="text-[9px] text-slate-400 font-medium leading-relaxed mb-4">
                     If your application is running, packages will sync automatically from the database. If they are empty:
                   </p>
                   <div className="space-y-3">
                     <div className="flex gap-3 items-start">
                       <div className="mt-1 w-4 h-4 shrink-0 rounded-full bg-amber-500/20 flex items-center justify-center text-[7px] font-black text-amber-500 border border-amber-500/20">1</div>
                       <p className="text-[8px] text-slate-300">Run migrations or the <b>npm run db:push</b> script on your VPS.</p>
                     </div>
                     <div className="flex gap-3 items-start">
                       <div className="mt-1 w-4 h-4 shrink-0 rounded-full bg-amber-500/20 flex items-center justify-center text-[7px] font-black text-amber-500 border border-amber-500/20">2</div>
                       <p className="text-[8px] text-slate-300">Verify your <b>DATABASE_URL</b> env variable in Node backend environment settings.</p>
                     </div>
                     <div className="flex gap-3 items-start">
                       <div className="mt-1 w-4 h-4 shrink-0 rounded-full bg-amber-500/20 flex items-center justify-center text-[7px] font-black text-amber-500 border border-amber-500/20">3</div>
                       <p className="text-[8px] text-slate-300">Start the backend process using <b>pm2 restart cryptospiral</b> on VPS.</p>
                     </div>
                   </div>
                </div>

                {/* DEBUG DIAGNOSTICS */}
                <div className="mt-12 p-6 rounded-2xl bg-black/40 border border-white/5 w-full max-w-md">
                   <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-2">
                     <Shield size={12} className="text-slate-500" />
                     <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">PostgreSQL Diagnostics</h4>
                   </div>
                   <div className="space-y-3">
                     <div className="flex justify-between items-center group">
                       <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Database Engine</span>
                       <span className="text-[9px] font-mono text-emerald-400/70 select-all tracking-tighter">PostgreSQL v16+</span>
                     </div>
                     <div className="flex justify-between items-center">
                       <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">ORM & Mapping</span>
                       <span className="text-[9px] font-mono text-emerald-400/70 select-all tracking-tighter">Drizzle ORM</span>
                     </div>
                     <div className="flex justify-between items-center">
                       <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Mainframe Link</span>
                       <span className="text-[9px] font-mono text-cyan-400 select-all tracking-tighter">Active SQL Connection</span>
                     </div>
                     <p className="text-[7px] text-slate-700 mt-4 leading-relaxed font-black uppercase tracking-widest">
                       All tables are fully structured in PostgreSQL via schema.ts.
                     </p>
                   </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {packages.map((pkg) => (
                  <div key={pkg.id} className="glass-card p-6 border-white/5 bg-white/5 relative group">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="text-white font-black text-lg italic uppercase tracking-tighter">{pkg.name}</h4>
                        <p className="text-emerald-400 text-2xl font-black italic tracking-tighter">${pkg.price} <span className="text-[10px] not-italic text-slate-500">USDT</span></p>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            let percents: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
                            const rawPercents = pkg.level_income_percents;
                            if (rawPercents) {
                              if (Array.isArray(rawPercents)) {
                                percents = rawPercents.map(Number);
                              } else if (typeof rawPercents === 'string') {
                                try {
                                  const parsed = JSON.parse(rawPercents);
                                  if (Array.isArray(parsed)) {
                                    percents = parsed.map(Number);
                                  }
                                } catch (e) {}
                              }
                            }
                            while (percents.length < 10) percents.push(0);
                            percents = percents.slice(0, 10);
                            setEditingPackage({
                              ...pkg,
                              level_income_percents: percents
                            });
                          }}
                          className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-white transition-all"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={() => handleDeletePackage(pkg.id)}
                          className="p-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="space-y-2 border-t border-white/5 pt-4">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500 font-bold uppercase tracking-widest">Daily ROI</span>
                        <span className="text-emerald-400 font-black">{pkg.daily_roi}%</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500 font-bold uppercase tracking-widest">ROI Interval</span>
                        <span className="text-purple-400 font-black">{pkg.roi_interval_minutes || 1440} Min</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500 font-bold uppercase tracking-widest">Duration</span>
                        <span className="text-white font-black">{pkg.duration_days} Days</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500 font-bold uppercase tracking-widest">Direct Income</span>
                        <span className="text-cyan-400 font-black">{pkg.direct_income_percent}%</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500 font-bold uppercase tracking-widest">Levels 1-10</span>
                        <div className="flex gap-0.5">
                          {(Array.isArray(pkg.level_income_percents) 
                            ? pkg.level_income_percents 
                            : (typeof pkg.level_income_percents === 'string' 
                               ? (() => { try { return JSON.parse(pkg.level_income_percents); } catch (e) { return []; } })() 
                               : [])
                           ).slice(0, 5).map((p, i) => (
                             <span key={i} className="text-[7px] bg-white/5 px-1 rounded text-slate-300">${p}</span>
                           ))}
                          <span className="text-[7px] text-slate-500">...</span>
                        </div>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500 font-bold uppercase tracking-widest">Placement</span>
                        <span className="text-orange-400 font-black">{pkg.matrix_income_percent}%</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500 font-bold uppercase tracking-widest">Status</span>
                        <span className={`font-black uppercase ${pkg.is_active ? 'text-emerald-400' : 'text-red-400'}`}>{pkg.is_active ? 'Active' : 'Inactive'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {activeTab === 'rewards' && (
          <div className="p-8 space-y-8">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">Rank Rewards Protocol</h3>
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">Configure business-based rewards for users.</p>
              </div>
              <button 
                onClick={handleAddReward}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(239,68,68,0.2)]"
              >
                <Plus size={16} />
                Add New Reward
              </button>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {(settings?.rank_rewards || []).map((reward) => (
                <div key={reward.id} className="bg-black/40 border border-white/5 rounded-[2rem] p-8 space-y-6 group hover:border-red-500/30 transition-all">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-4">
                      <div className="p-4 rounded-2xl bg-white/5 text-red-500">
                        <Trophy size={24} />
                      </div>
                      <div className="flex-1 min-w-[200px]">
                        <input 
                          type="text" 
                          value={reward.rank_name}
                          onChange={(e) => handleUpdateReward(reward.id, 'rank_name', e.target.value)}
                          className="bg-transparent border-none outline-none text-xl font-black text-white italic uppercase tracking-tighter w-full"
                          placeholder="Rank Name"
                        />
                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">Unique Rank Identifier</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDeleteReward(reward.id)}
                      className="p-3 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-6">
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Personal Business ($)</label>
                      <input 
                        type="number" 
                        value={reward.personal_business}
                        onChange={(e) => handleUpdateReward(reward.id, 'personal_business', Number(e.target.value))}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Team Business ($)</label>
                      <input 
                        type="number" 
                        value={reward.team_business}
                        onChange={(e) => handleUpdateReward(reward.id, 'team_business', Number(e.target.value))}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Target Level (1-10, 0=All)</label>
                      <input 
                        type="number" 
                        min="0"
                        max="10"
                        value={reward.target_depth || 0}
                        onChange={(e) => handleUpdateReward(reward.id, 'target_depth', Number(e.target.value))}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Reward Amount (USDT)</label>
                      <input 
                        type="number" 
                        value={reward.reward_amount}
                        onChange={(e) => handleUpdateReward(reward.id, 'reward_amount', Number(e.target.value))}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white font-black text-emerald-400"
                      />
                    </div>
                    
                    {/* NEW FIELDS requested by user for fully dynamic qualification */}
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-red-400 uppercase tracking-widest ml-2">Min Self Package ($)</label>
                      <input 
                        type="number" 
                        value={reward.min_self_package || 0}
                        onChange={(e) => handleUpdateReward(reward.id, 'min_self_package', Number(e.target.value))}
                        className="w-full bg-black/40 border border-red-500/20 rounded-xl px-4 py-3 text-xs text-white"
                        placeholder="e.g. 20"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-red-400 uppercase tracking-widest ml-2">Min Same Pkg Downline</label>
                      <input 
                        type="number" 
                        value={reward.min_downline_same_package || 0}
                        onChange={(e) => handleUpdateReward(reward.id, 'min_downline_same_package', Number(e.target.value))}
                        className="w-full bg-black/40 border border-red-500/20 rounded-xl px-4 py-3 text-xs text-white"
                        placeholder="e.g. 3"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-red-400 uppercase tracking-widest ml-2">Min Direct Referrals</label>
                      <input 
                        type="number" 
                        value={reward.min_directs || 0}
                        onChange={(e) => handleUpdateReward(reward.id, 'min_directs', Number(e.target.value))}
                        className="w-full bg-black/40 border border-red-500/20 rounded-xl px-4 py-3 text-xs text-white"
                        placeholder="e.g. 2"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Icon Type</label>
                      <select 
                        value={reward.icon_type}
                        onChange={(e) => handleUpdateReward(reward.id, 'icon_type', e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white"
                      >
                        <option value="star">Star</option>
                        <option value="award">Trophy/Award</option>
                        <option value="zap">Zap/Speed</option>
                        <option value="shield">Shield/Master</option>
                        <option value="gift">Gift/Bonus</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              {(settings?.rank_rewards || []).length === 0 && (
                <div className="p-20 text-center border-2 border-dashed border-white/5 rounded-[3rem]">
                  <Trophy size={48} className="text-slate-800 mx-auto mb-4" />
                  <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">No rewards configured yet.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'spin' && settings && (
          <div className="glass-card p-8 space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black italic uppercase tracking-tighter">Fortune Spin Settings</h3>
                <p className="text-slate-muted text-[10px] font-black uppercase tracking-widest">Configure rewards and probabilities (Fixed 8 Segments)</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-muted ml-1">Paid Spin Cost ($)</label>
                <input 
                  type="number"
                  value={settings.spin_cost}
                  onChange={(e) => setSettings({ ...settings, spin_cost: Number(e.target.value) })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 outline-none focus:ring-2 focus:ring-red-500/40 transition-all text-white font-medium"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-muted ml-1">Directs for Free Spins</label>
                <input 
                  type="number"
                  value={settings.referrals_for_free_spins}
                  onChange={(e) => setSettings({ ...settings, referrals_for_free_spins: Number(e.target.value) })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 outline-none focus:ring-2 focus:ring-red-500/40 transition-all text-white font-medium"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-muted ml-1">Spins per Milestone</label>
                <input 
                  type="number"
                  step="any"
                  value={settings.spins_per_milestone}
                  onChange={(e) => setSettings({ ...settings, spins_per_milestone: Number(e.target.value) })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 outline-none focus:ring-2 focus:ring-red-500/40 transition-all text-white font-medium"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-red-500">Reward Configuration (12 Segments)</h4>
                {(() => {
                  const sumProb = (settings.spin_rewards || []).reduce((acc: number, r: any) => acc + (Number(r.probability) || 0), 0);
                  return (
                    <div className="text-[10px] font-black uppercase tracking-widest">
                      Total Probability Sum: <span className={sumProb === 100 ? "text-emerald-400" : "text-amber-400 animate-pulse"}>{sumProb.toFixed(2)}%</span> (Needs to be 100%)
                    </div>
                  );
                })()}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Ensure we always show 12 rows */}
                {[...Array(12)].map((_, index) => {
                  const reward = (settings.spin_rewards || [])[index] || { id: `fixed_${index}`, label: `${index + 1}`, amount: 0, probability: 0 };

                  return (
                    <div key={reward.id || index} className="p-4 bg-white/5 rounded-2xl border border-white/10 flex flex-col gap-3">
                      <div className="flex justify-between items-center border-b border-white/5 pb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400">Segment {index + 1}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 ml-1">Label (Text)</label>
                          <input 
                            type="text"
                            value={reward.label}
                            onChange={(e) => {
                              const newRewards = [...(settings.spin_rewards || [])];
                              while (newRewards.length <= index) {
                                newRewards.push({ id: `fixed_${newRewards.length}`, label: '0', amount: 0, probability: 0 });
                              }
                              newRewards[index].label = e.target.value;
                              setSettings({ ...settings, spin_rewards: newRewards });
                            }}
                            className="w-full bg-black border border-white/10 rounded-lg py-1.5 px-2 text-xs text-white"
                            placeholder="e.g. 10$, JACKPOT"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 ml-1">USDT Payout</label>
                          <input 
                            type="number"
                            step="any"
                            value={reward.amount}
                            onChange={(e) => {
                              const newRewards = [...(settings.spin_rewards || [])];
                              while (newRewards.length <= index) {
                                newRewards.push({ id: `fixed_${newRewards.length}`, label: '0', amount: 0, probability: 0 });
                              }
                              newRewards[index].amount = Number(e.target.value);
                              setSettings({ ...settings, spin_rewards: newRewards });
                            }}
                            className="w-full bg-black border border-white/10 rounded-lg py-1.5 px-2 text-xs text-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 ml-1">Chance (%)</label>
                          <input 
                            type="number"
                            step="any"
                            value={reward.probability}
                            onChange={(e) => {
                              const newRewards = [...(settings.spin_rewards || [])];
                              while (newRewards.length <= index) {
                                newRewards.push({ id: `fixed_${newRewards.length}`, label: '0', amount: 0, probability: 0 });
                              }
                              newRewards[index].probability = Number(e.target.value);
                              setSettings({ ...settings, spin_rewards: newRewards });
                            }}
                            className="w-full bg-black border border-white/10 rounded-lg py-1.5 px-2 text-xs text-white"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest text-center mt-2">Note: Total probability of all segments MUST equal 100% for proper distributions.</p>
            </div>

            <div className="flex justify-end">
              <button 
                onClick={async () => {
                  try {
                    // Ensure exactly 12 rewards are saved
                    const finalRewards = (settings.spin_rewards || []).slice(0, 12);
                    while (finalRewards.length < 12) {
                      finalRewards.push({ id: `fixed_${finalRewards.length}`, label: `${finalRewards.length + 1}`, amount: 0, probability: 0 });
                    }
                    const updatedSettings = { ...settings, spin_rewards: finalRewards };
                    const isLive = isAppwriteConfigured();
                    const api = isLive ? appwriteService : mockApi.db;
                    await api.updateSettings(updatedSettings as any);
                    setStatusMsg({ type: 'success', text: 'Spin settings updated!' });
                  } catch (e) {
                    setStatusMsg({ type: 'error', text: 'Failed to update spin settings.' });
                  }
                  setTimeout(() => setStatusMsg(null), 3000);
                }}
                className="flex items-center gap-2 px-8 py-4 bg-red-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-[0_0_20px_rgba(239,68,68,0.2)] hover:scale-105 transition-all"
              >
                <Save size={18} />
                <span>Save Spin Protocol</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'settings' && !settings && (
          <div className="p-20 text-center">
            <RefreshCcw className="animate-spin mx-auto text-slate-800 mb-4" size={48} />
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Initializing Control Protocol...</p>
          </div>
        )}

        {activeTab === 'settings' && settings && (
          <>
            <form key={`settings-${lastUpdated}`} onSubmit={handleUpdateSettings} className="p-8 space-y-8">
            {/* FEATURE TOGGLES */}
            <div className="bg-black/40 p-6 rounded-3xl border border-white/5 space-y-6">
              <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                <Shield size={20} className="text-red-500" />
                <h3 className="text-white font-black text-sm italic uppercase tracking-tighter">Feature Access Controls</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5">
                  <div className="space-y-1">
                    <p className="text-xs font-black text-white italic uppercase tracking-tighter">Direct Deposits</p>
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Toggle user deposit ability</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input name="enable_deposit" type="checkbox" defaultChecked={settings.enable_deposit} className="sr-only peer" />
                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5">
                  <div className="space-y-1">
                    <p className="text-xs font-black text-white italic uppercase tracking-tighter">Global Withdrawals</p>
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Manage withdrawal window</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input name="enable_withdrawal" type="checkbox" defaultChecked={settings.enable_withdrawal} className="sr-only peer" />
                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5">
                  <div className="space-y-1">
                    <p className="text-xs font-black text-white italic uppercase tracking-tighter">Enable Exchanger (Swap)</p>
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Toggle Currency Exchange feature</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input name="enable_swap" type="checkbox" defaultChecked={settings.enable_swap !== false} className="sr-only peer" />
                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                  </label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="text-white font-black text-sm italic uppercase tracking-tighter border-b border-white/5 pb-2">Financial Protocol</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Min Deposit</label>
                    <input 
                      name="min_deposit" 
                      type="number" 
                      step="any"
                      value={settings.min_deposit ?? 0} 
                      onChange={e => setSettings({...settings, min_deposit: Number(e.target.value)})}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Min Withdrawal</label>
                    <input 
                      name="min_withdrawal" 
                      type="number" 
                      step="any"
                      value={settings.min_withdrawal ?? 0} 
                      onChange={e => setSettings({...settings, min_withdrawal: Number(e.target.value)})}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" 
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Deposit Fee ($)</label>
                    <input 
                      name="deposit_fee" 
                      type="number" 
                      step="any" 
                      value={settings.deposit_fee ?? 0} 
                      onChange={e => setSettings({...settings, deposit_fee: Number(e.target.value)})}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Withdrawal Fee (%)</label>
                    <input 
                      name="withdrawal_fee" 
                      type="number" 
                      step="any" 
                      value={settings.withdrawal_fee ?? 0} 
                      onChange={e => setSettings({...settings, withdrawal_fee: Number(e.target.value)})}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Boosting Gold Reward ($)</label>
                    <input 
                      name="boosting_reward" 
                      type="number" 
                      step="any"
                      value={settings.boosting_reward ?? 0} 
                      onChange={e => setSettings({...settings, boosting_reward: Number(e.target.value)})}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" 
                    />
                  </div>
                </div>

                <div className="pt-4 space-y-4">
                  <h3 className="text-white font-black text-[10px] italic uppercase tracking-tighter border-b border-white/5 pb-2">Game & Qualification</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Boosting Min Pkg ($)</label>
                      <input 
                        name="boosting_min_pkg_price" 
                        type="number" 
                        step="any"
                        value={settings.boosting_min_pkg_price ?? 0} 
                        onChange={e => setSettings({...settings, boosting_min_pkg_price: Number(e.target.value)})}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Boosting Min Directs</label>
                      <input 
                        name="boosting_min_directs" 
                        type="number" 
                        step="any"
                        value={settings.boosting_min_directs ?? 0} 
                        onChange={e => setSettings({...settings, boosting_min_directs: Number(e.target.value)})}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" 
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Spin Wheel Cost ($)</label>
                      <input 
                        name="spin_cost" 
                        type="number" 
                        step="any"
                        value={settings.spin_cost ?? 0} 
                        onChange={e => setSettings({...settings, spin_cost: Number(e.target.value)})}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" 
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Spin Min Pkg ($)</label>
                      <input 
                        name="spin_min_pkg_price" 
                        type="number" 
                        step="any"
                        value={settings.spin_min_pkg_price ?? 0} 
                        onChange={e => setSettings({...settings, spin_min_pkg_price: Number(e.target.value)})}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Spin Min Directs</label>
                      <input 
                        name="spin_min_directs" 
                        type="number" 
                        step="any"
                        value={settings.spin_min_directs ?? 0} 
                        onChange={e => setSettings({...settings, spin_min_directs: Number(e.target.value)})}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" 
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Spin Cooldown (Hours)</label>
                      <input 
                        name="spin_cooldown_hours" 
                        type="number" 
                        step="any"
                        value={settings.spin_cooldown_hours ?? 0} 
                        onChange={e => setSettings({...settings, spin_cooldown_hours: Number(e.target.value)})}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Referrals for Free Spins</label>
                      <input 
                        name="referrals_for_free_spins" 
                        type="number" 
                        step="any"
                        value={settings.referrals_for_free_spins ?? 0} 
                        onChange={e => setSettings({...settings, referrals_for_free_spins: Number(e.target.value)})}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" 
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Award Spins per Milestone</label>
                      <input 
                        name="spins_per_milestone" 
                        type="number" 
                        step="any"
                        value={settings.spins_per_milestone ?? 0} 
                        onChange={e => setSettings({...settings, spins_per_milestone: Number(e.target.value)})}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" 
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 space-y-4">
                  <h3 className="text-white font-black text-[10px] italic uppercase tracking-tighter border-b border-white/5 pb-2">Gateway Configuration</h3>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">USDT TRC20 Address</label>
                      <input 
                        name="admin_address_trc20" 
                        type="text" 
                        value={settings.admin_address_trc20 || ''} 
                        onChange={e => setSettings({...settings, admin_address_trc20: e.target.value})}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">USDT BEP20 Address</label>
                      <input 
                        name="admin_address_bep20" 
                        type="text" 
                        value={settings.admin_address_bep20 || ''} 
                        onChange={e => setSettings({...settings, admin_address_bep20: e.target.value})}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">USDT ERC20 Address</label>
                      <input 
                        name="admin_address_erc20" 
                        type="text" 
                        value={settings.admin_address_erc20 || ''} 
                        onChange={e => setSettings({...settings, admin_address_erc20: e.target.value})}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" 
                      />
                    </div>
                  </div>
                </div>

              </div>

              <div className="space-y-4">
                <h3 className="text-white font-black text-sm italic uppercase tracking-tighter border-b border-white/5 pb-2">Communication</h3>
                <div className="space-y-2">
                  <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Marquee Text</label>
                  <textarea 
                    name="marquee_text" 
                    value={settings.marquee_text || ''} 
                    onChange={e => setSettings({...settings, marquee_text: e.target.value})}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white h-24" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Telegram Link</label>
                  <input 
                    name="telegram_link" 
                    type="text" 
                    value={settings.telegram_link || ''} 
                    onChange={e => setSettings({...settings, telegram_link: e.target.value})}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white" 
                  />
                </div>

                {settings.$id && (
                  <div className="px-4 py-2 bg-white/5 rounded-lg border border-white/5">
                    <p className="text-[8px] font-black text-slate-500 uppercase">Document ID: <span className="text-white italic">{settings.$id}</span></p>
                  </div>
                )}

              </div>
            </div>

            <div className="flex justify-between items-center bg-black/60 p-6 rounded-3xl border border-white/5 backdrop-blur-xl sticky bottom-0 z-20">
              <button 
                type="button"
                onClick={handleResetSystem}
                className="flex items-center gap-3 px-6 py-4 rounded-xl bg-white/5 border border-white/10 text-slate-500 font-bold uppercase tracking-widest hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 transition-all text-[10px]"
              >
                <Trash2 size={16} />
                Reset Data
              </button>
              
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => fetchData()}
                  disabled={loading}
                  className="flex items-center gap-3 px-6 py-4 rounded-xl bg-white/5 border border-white/10 text-white font-bold uppercase tracking-widest hover:bg-white/10 transition-all text-[10px] disabled:opacity-50"
                  title="Force Reload Data"
                >
                  <RefreshCcw size={16} className={loading ? "animate-spin" : ""} />
                  Reload
                </button>

                <button 
                  type="submit" 
                  disabled={loading}
                  className="flex items-center gap-3 px-10 py-4 rounded-xl bg-red-600 text-white font-bold uppercase tracking-widest hover:bg-red-500 transition-all shadow-lg shadow-red-900/20 active:scale-95 disabled:opacity-50 text-[10px]"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      <span>Update Protocol</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>

          {/* 2X2 MATRIX HEALING & REALIGNMENT TOOL */}
          <div className="mt-8 bg-black/40 p-8 rounded-3xl border border-white/5 space-y-6">
            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
              <Database size={20} className="text-red-500" />
              <h3 className="text-white font-black text-sm italic uppercase tracking-tighter">2x2 Matrix Optimization & Sequential Rebuilding</h3>
            </div>

            <div className="space-y-4">
              <div className="flex gap-4 p-4 bg-red-950/20 border border-red-500/10 rounded-2xl">
                <AlertTriangle className="text-red-500 shrink-0" size={24} />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-red-400 uppercase tracking-wider">CRITICAL HEALING PROTOCOL (HINDI / ENGLISH)</p>
                  <p className="text-[10px] text-slate-300">
                    अगर आपके लाइव सिस्टम में यूज़र्स का सीक्वेंस (Level or Matrix parent) गलत हो गया है, तो इस टूल की मदद से आप पूरे पेड़ (Tree) को फिर से री-अलाइन करके एक सटीक 2x2 Binary Tree बना सकते हैं। 
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    If your live members got misaligned, this tool rebuilds and heals the database parent linkages (`matrixParentId`) chronologically upwards to ensure a perfect 2x2 binary structure with zero inactive gaps.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                <div className="space-y-3">
                  <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">SELECT REALIGNMENT MODE</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setMatrixAlignMode('active_only')}
                      className={`p-4 rounded-2xl border text-left transition-all ${
                        matrixAlignMode === 'active_only'
                          ? 'bg-red-500/10 border-red-500 text-white shadow-lg shadow-red-500/5'
                          : 'bg-black/20 border-white/5 text-slate-400 hover:border-white/10 hover:text-white'
                      }`}
                    >
                      <p className="text-xs font-black uppercase italic tracking-tight">Active Members Only</p>
                      <p className="text-[8px] font-medium tracking-wide leading-relaxed mt-1 text-slate-500">
                        (RECOMMENDED) Only fits active accounts in 2x2 levels. Eliminates inactive "gaps" so level commissions go upwards perfectly.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setMatrixAlignMode('all')}
                      className={`p-4 rounded-2xl border text-left transition-all ${
                        matrixAlignMode === 'all'
                          ? 'bg-red-500/10 border-red-500 text-white shadow-lg shadow-red-500/5'
                          : 'bg-black/20 border-white/5 text-slate-400 hover:border-white/10 hover:text-white'
                      }`}
                    >
                      <p className="text-xs font-black uppercase italic tracking-tight">All Signups (With Inactives)</p>
                      <p className="text-[8px] font-medium tracking-wide leading-relaxed mt-1 text-slate-500">
                        Fits all registered accounts strictly in chronological sign-up order, regardless of package activation status.
                      </p>
                    </button>
                  </div>
                </div>

                <div className="flex flex-col justify-end p-6 bg-black/20 rounded-2xl border border-white/5 space-y-4">
                  <div className="space-y-1">
                    <p className="text-xs font-black text-white uppercase italic tracking-tight">Execute Re-Alignment</p>
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-relaxed">
                      This processes active IDs (e.g. 38 active IDs) and aligns their parentage globally in the database perfectly. This cannot be undone.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleRealignMatrix}
                    disabled={isAligningMatrix}
                    className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-xl bg-red-600 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-red-500 transition-all disabled:opacity-50 shadow-md active:scale-95"
                  >
                    {isAligningMatrix ? (
                      <>
                        <RefreshCcw size={14} className="animate-spin" />
                        <span>Processing Realign...</span>
                      </>
                    ) : (
                      <>
                        <Database size={14} />
                        <span>⚡ Rebuild & Align Matrix Tree</span>
                      </>
                    )}
                  </button>

                  {matrixAlignStatus && (
                    <p className={`text-[9px] font-bold uppercase tracking-wider text-center ${
                      matrixAlignStatus.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'
                    }`}>
                      {matrixAlignStatus}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
          </>
        )}

        {activeTab === 'boosting' && (
          <div className="p-8 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="text-xl font-black text-white italic uppercase tracking-tighter flex items-center gap-3">
                  <Zap size={24} className="text-amber-400" />
                  Global Boosting Node Queue
                </h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Real-time distribution sequence monitor</p>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleSyncAllBoosting}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:bg-neon-cyan/10 hover:text-neon-cyan hover:border-neon-cyan/20 transition-all active:scale-95"
                  title="Re-calculate qualifications for everyone"
                >
                  <RefreshCcw size={14} />
                  Global Sync
                </button>
                <div className="px-6 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
                  <span className="text-[10px] font-black uppercase tracking-widest">Total Entries: {boostingQueue.length}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-12">Pos</th>
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">User Details</th>
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Type</th>
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Joined At</th>
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Payout Info</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {boostingQueue.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-12 text-center text-slate-500 text-xs font-black uppercase tracking-widest">No entries in boosting queue yet</td>
                      </tr>
                    ) : (
                      boostingQueue.map((entry, idx) => (
                        <tr key={entry.id} className={`hover:bg-white/5 transition-colors group ${entry.completed ? 'opacity-60' : 'bg-amber-500/5'}`}>
                          <td className="p-4">
                            <span className="text-xs font-black text-slate-400">#{idx + 1}</span>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black text-white ${entry.completed ? 'bg-slate-800' : 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]'}`}>
                                <UserIcon size={14} />
                              </div>
                              <div>
                                <p className="text-sm font-black text-white italic tracking-tighter leading-none">{entry.userName}</p>
                                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">{entry.user_id}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${entry.is_rebirth ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' : entry.is_force ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'}`}>
                              {entry.is_rebirth ? 'Rebirth' : entry.is_force ? 'Admin Force' : 'Initial'}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              {entry.completed ? (
                                <>
                                  <CheckCircle2 size={14} className="text-emerald-400" />
                                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Paid</span>
                                </>
                              ) : (
                                <>
                                  <Clock size={14} className="text-amber-400 animate-pulse" />
                                  <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Pending</span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            {entry.created_at ? new Date(entry.created_at).toLocaleString() : 'N/A'}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-3">
                              {entry.completed ? (
                                <div>
                                  <p className="text-sm font-black text-emerald-400 italic tracking-tighter">+${settings?.boosting_reward || 25}</p>
                                  <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mt-1">
                                    {entry.payout_at ? `at ${new Date(entry.payout_at).toLocaleTimeString()}` : 'Completed'}
                                  </p>
                                </div>
                              ) : (
                                <p className="text-[9px] font-black text-slate-700 uppercase tracking-widest italic">Awaiting Cycle</p>
                              )}
                              
                              {deleteConfirm === entry.id ? (
                                <div className="flex items-center gap-2">
                                  <button 
                                    onClick={() => handleDeleteBoostingEntry(entry.id)}
                                    className="p-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-all shadow-[0_0_10px_rgba(239,68,68,0.3)] animate-pulse"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                  <button 
                                    onClick={() => setDeleteConfirm(null)}
                                    className="p-1.5 rounded-lg bg-white/10 text-slate-400 hover:text-white transition-all"
                                  >
                                    <XCircle size={12} />
                                  </button>
                                </div>
                              ) : (
                                <button 
                                  onClick={() => setDeleteConfirm(entry.id)}
                                  className="p-1.5 rounded-lg bg-white/5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-all opacity-0 group-hover:opacity-100"
                                  title="Remove entry"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* USER EDIT MODAL */}
      {editingUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setEditingUser(null)}></div>
          <div className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-[2.5rem] p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="absolute top-0 right-0 p-6">
              <button 
                onClick={() => setEditingUser(null)}
                className="p-2 rounded-xl bg-white/5 text-slate-500 hover:text-white transition-colors"
              >
                <XCircle size={20} />
              </button>
            </div>

            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <Edit2 size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">Edit User</h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{editingUser.email}</p>
              </div>
            </div>

            <form onSubmit={handleUpdateUser} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Full Name</label>
                <input 
                  name="userName"
                  type="text" 
                  defaultValue={editingUser.name}
                  required
                  className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:border-emerald-500/50 outline-none transition-colors"
                  placeholder="Enter new name"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Mobile Number</label>
                <input 
                  name="userMobile"
                  type="tel" 
                  defaultValue={editingUser.mobile || ''}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:border-emerald-500/50 outline-none transition-colors"
                  placeholder="Enter mobile number"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">User Role (Admin status)</label>
                <select 
                  name="userRole"
                  defaultValue={editingUser.role || 'user'}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:border-emerald-500/50 outline-none transition-colors"
                >
                  <option value="user" className="bg-slate-900 text-white">User (Standard)</option>
                  <option value="admin" className="bg-slate-900 text-white">Admin (Full Control)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Sponsor/Referrer (UID, email or ID)</label>
                  <input 
                    name="userReferredBy"
                    type="text" 
                    defaultValue={editingUser.referredBy || editingUser.referred_by || ''}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:border-emerald-500/50 outline-none transition-colors"
                    placeholder="e.g. sita@gmail.com, 1"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Matrix Parent (UID, email or ID)</label>
                  <input 
                    name="userMatrixParentId"
                    type="text" 
                    defaultValue={editingUser.matrixParentId || editingUser.matrix_parent_id || ''}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:border-emerald-500/50 outline-none transition-colors"
                    placeholder="e.g. sita@gmail.com, 1"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 bg-black/20 p-4 rounded-2xl border border-white/5">
                <input 
                  type="checkbox" 
                  name="userIsActive"
                  id="userIsActive"
                  defaultChecked={editingUser.is_active || (editingUser as any).isActive}
                  className="w-4 h-4 rounded border-white/10 bg-black/40 text-red-500 cursor-pointer"
                />
                <label htmlFor="userIsActive" className="text-[10px] font-black text-white uppercase tracking-widest cursor-pointer select-none">
                  Active Member Status
                </label>
              </div>

              <div className="space-y-2">
                <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Reset Password (Optional)</label>
                <input 
                  name="userPassword"
                  type="password" 
                  className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:border-emerald-500/50 outline-none transition-colors"
                  placeholder="Leave blank to keep current"
                />
                <p className="text-[8px] font-medium text-slate-600 ml-2">Password must be at least 8 characters.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Personal Business ($)</label>
                  <input 
                    name="personalBusiness"
                    type="number" 
                    defaultValue={editingUser.personal_business || 0}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:border-emerald-500/50 outline-none transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Team Business ($)</label>
                  <input 
                    name="teamBusiness"
                    type="number" 
                    defaultValue={editingUser.team_business || 0}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:border-emerald-500/50 outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Wallet Balance / Gift Deposit ($)</label>
                <input 
                  name="userWalletBalance"
                  type="number" 
                  step="any"
                  value={editingUserWallet !== null ? (editingUserWallet.balance !== undefined ? editingUserWallet.balance : '') : ''}
                  onChange={(e) => setEditingUserWallet(prev => prev ? { ...prev, balance: e.target.value } : { balance: e.target.value })}
                  className="w-full bg-black/40 border border-emerald-500/30 rounded-2xl px-5 py-4 text-lg font-black text-emerald-400 focus:border-emerald-500 outline-none transition-colors"
                  placeholder="Loading wallet balance..."
                />
                <p className="text-[8px] font-medium text-slate-600 ml-2">Modifying this value directly changes or grants the user's available balance.</p>
              </div>

              {modalError && (
                <div id="modal-error-notice" className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-center text-[10px] font-black uppercase tracking-widest leading-relaxed">
                  ⚠️ {modalError}
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button 
                  id="btn-edit-user-cancel"
                  type="button" 
                  disabled={isSavingUser}
                  onClick={() => setEditingUser(null)}
                  className="flex-1 py-4 rounded-2xl bg-white/5 text-slate-500 font-black uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button 
                  id="btn-edit-user-submit"
                  type="submit"
                  disabled={isSavingUser}
                  className="flex-3 py-4 rounded-2xl bg-emerald-500 text-black font-black uppercase tracking-widest hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all active:scale-95 disabled:bg-emerald-500/50 disabled:cursor-not-allowed"
                >
                  {isSavingUser ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* USER VIEW DETAILS MODAL */}
      {viewingUser && (
        <div id="view-user-details-modal" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={() => setViewingUser(null)}></div>
          <div className="relative w-full max-w-xl bg-slate-900 border border-white/10 rounded-[2.5rem] p-8 shadow-2xl max-h-[92vh] overflow-y-auto custom-scrollbar">
            <div className="absolute top-0 right-0 p-6">
              <button 
                onClick={() => setViewingUser(null)}
                className="p-2 rounded-xl bg-white/5 text-slate-500 hover:text-white transition-colors"
              >
                <XCircle size={20} />
              </button>
            </div>

            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 font-bold text-lg">
                {viewingUser.name?.charAt(0).toUpperCase() || '?'}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">{viewingUser.name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                    (viewingUser.is_active || (viewingUser as any).isActive) 
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                      : 'bg-red-500/10 border-red-500/20 text-red-400'
                  }`}>
                    {(viewingUser.is_active || (viewingUser as any).isActive) ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{viewingUser.email}</p>
              </div>
            </div>

            {/* Personal Details */}
            <div className="grid grid-cols-2 gap-4 mb-6 bg-black/30 p-5 rounded-2xl border border-white/5">
              <div>
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Mobile Number</p>
                <p className="text-white text-xs font-bold font-mono mt-1">{viewingUser.mobile || 'N/A'}</p>
              </div>
              <div>
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Joined Date</p>
                <p className="text-white text-xs font-bold mt-1">
                  {new Date(viewingUser.created_at).toLocaleString()}
                </p>
              </div>
              <div className="col-span-2 border-t border-white/5 pt-3 mt-1 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">User ID</p>
                  <p className="text-cyan-400 text-[10px] font-bold font-mono mt-1 flex items-center gap-1.5 break-all">
                    {viewingUser.id}
                    <button onClick={() => handleCopy(viewingUser.id, 'view-uid')} className="p-1 hover:text-white transition-all">
                      <Copy size={11} />
                    </button>
                  </p>
                </div>
                <div>
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Sponsor ID</p>
                  <p className="text-amber-400 text-[10px] font-bold font-mono mt-1 flex items-center gap-1.5 break-all">
                    {viewingUser.sponsor_id || 'Global Parent / Admin'}
                    {viewingUser.sponsor_id && (
                      <button onClick={() => handleCopy(viewingUser.sponsor_id || '', 'view-sid')} className="p-1 hover:text-white transition-all">
                        <Copy size={11} />
                      </button>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Incomes & Wallet Metrics */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Wallet & Income Details</h4>
              
              {/* Main balances */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-5 rounded-3xl">
                  <span className="text-[8px] text-emerald-400 font-black uppercase tracking-widest">Available Balance</span>
                  <p className="text-3xl font-black text-emerald-400 italic tracking-tighter mt-1">
                    ${viewingUserWallet ? (Number(viewingUserWallet.balance) || 0).toFixed(2) : '0.00'}
                  </p>
                </div>
                <div className="bg-cyan-500/10 border border-cyan-500/20 p-5 rounded-3xl">
                  <span className="text-[8px] text-cyan-400 font-black uppercase tracking-widest">Total Income Earned</span>
                  <p className="text-3xl font-black text-cyan-400 italic tracking-tighter mt-1">
                    ${viewingUserWallet ? (Number(viewingUserWallet.total_earned) || 0).toFixed(2) : '0.00'}
                  </p>
                </div>
              </div>

              {/* Income Types breakdown */}
              <div className="bg-black/30 p-6 rounded-3xl border border-white/5 space-y-4">
                <div className="grid grid-cols-2 gap-5 text-sm">
                  
                  <div className="flex justify-between items-center pb-2 border-b border-white/5">
                    <div>
                      <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest block">Direct Income</span>
                      <span className="text-white font-black italic tracking-tight">${viewingUserWallet ? (Number(viewingUserWallet.direct_income) || 0).toFixed(2) : '0.00'}</span>
                    </div>
                    <span className="text-slate-600 font-serif text-sm">🤝</span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b border-white/5">
                    <div>
                      <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest block">Level Income</span>
                      <span className="text-white font-black italic tracking-tight">${viewingUserWallet ? (Number(viewingUserWallet.level_income) || 0).toFixed(2) : '0.00'}</span>
                    </div>
                    <span className="text-slate-600 font-serif text-sm">📈</span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b border-white/5">
                    <div>
                      <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest block">ROI / Daily Revenue</span>
                      <span className="text-white font-black italic tracking-tight">${viewingUserWallet ? (Number(viewingUserWallet.roi_income) || 0).toFixed(2) : '0.00'}</span>
                    </div>
                    <span className="text-slate-600 font-serif text-sm">⚡</span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b border-white/5">
                    <div>
                      <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest block">Global Matrix Income</span>
                      <span className="text-white font-black italic tracking-tight">${viewingUserWallet ? (Number(viewingUserWallet.matrix_income) || 0).toFixed(2) : '0.00'}</span>
                    </div>
                    <span className="text-slate-600 font-serif text-sm">🕸️</span>
                  </div>

                  <div className="flex justify-between items-center pt-1 cols-span-2">
                    <div>
                      <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest block">Total Withdrawn</span>
                      <span className="text-rose-400 font-black italic tracking-tight">${viewingUserWallet ? (Number(viewingUserWallet.total_withdrawn) || 0).toFixed(2) : '0.00'}</span>
                    </div>
                    <span className="text-slate-600 font-serif text-sm">📤</span>
                  </div>

                  <div className="flex justify-between items-center pt-1">
                    <div>
                      <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest block">Direct Members</span>
                      <span className="text-amber-400 font-black italic tracking-tight">{viewingUser.direct_count || 0} Members</span>
                    </div>
                    <span className="text-slate-600 font-serif text-sm">👥</span>
                  </div>

                </div>
              </div>

              {/* Business Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-900/60 border border-white/5 p-4 rounded-2xl">
                  <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest block">Personal Business</span>
                  <span className="text-white font-black italic text-lg tracking-tight">${viewingUser.personal_business || 0}</span>
                </div>
                <div className="bg-slate-900/60 border border-white/5 p-4 rounded-2xl">
                  <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest block">Team Business</span>
                  <span className="text-white font-black italic text-lg tracking-tight">${viewingUser.team_business || 0}</span>
                </div>
              </div>
            </div>

            {/* Footer Control Buttons */}
            <div className="pt-8 flex gap-3 border-t border-white/5 mt-6">
              <button 
                type="button" 
                onClick={() => setViewingUser(null)}
                className="flex-1 py-4 rounded-2xl bg-white/5 text-slate-400 font-black uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all text-xs"
              >
                Close View
              </button>
              <button 
                type="button" 
                onClick={() => {
                  const targetUser = viewingUser;
                  setViewingUser(null);
                  setTimeout(() => setEditingUser(targetUser), 100);
                }}
                className="flex-1 py-4 rounded-2xl bg-emerald-500 text-black font-black uppercase tracking-widest hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all text-xs"
              >
                Edit & Grant Balance
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
