import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { User, Wallet, MLMPackage } from '../types';
import { mockApi } from '../lib/mockApi';
import { appwriteService } from '../services/appwriteService';
import { isAppwriteConfigured, client, APPWRITE_CONFIG } from '../lib/appwrite';
import { MLM_CONFIG, POOL_NAMES } from '../constants';
import { 
  TrendingUp, ArrowDownCircle, ArrowUpCircle, RefreshCcw, UserPlus, 
  Zap, Shield, Cpu, Trophy, ShieldCheck, Clock, Check, BarChart3,
  Database, Layers, Share2, Copy, User as UserIcon, Plus, ChevronRight, Globe,
  AlertCircle, Lock, Activity
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// Helper to get a stable deterministic rank for any given user ID or email
const generateRank = (userId: string, email?: string): number => {
  const seed = userId || email || 'default_seed';
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const minRank = 48;
  const maxRank = 385;
  const range = maxRank - minRank + 1;
  return minRank + (Math.abs(hash) % range);
};

const chartData = [
  { name: 'Mon', income: 45 },
  { name: 'Tue', income: 52 },
  { name: 'Wed', income: 48 },
  { name: 'Thu', income: 61 },
  { name: 'Fri', income: 55 },
  { name: 'Sat', income: 67 },
  { name: 'Sun', income: 72 },
];

interface DashboardProps {
  user: User;
  wallet: Wallet;
  onNavigate?: (tab: string) => void;
  onExchangerNav?: (subTab: 'topup' | 'withdraw') => void;
  isLive?: boolean;
  liveBalance?: number;
  liveWalletROI?: number;
  onRefreshWallet?: () => void;
  onOptimisticPurchase?: (price: number) => void;
  onClearOptimisticPurchase?: (price: number) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  user, 
  wallet, 
  onNavigate, 
  onExchangerNav, 
  isLive, 
  liveBalance: propLiveBalance, 
  liveWalletROI: propLiveWalletROI, 
  onRefreshWallet,
  onOptimisticPurchase,
  onClearOptimisticPurchase
}) => {
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const [marqueeText, setMarqueeText] = useState('⚡ NODE ACTIVE: SYSTEM ACTIVE | 💎 USDT/INR: ₹92.45 (+0.4%) | 🔥 NETWORK VOLUME: $4.2M');
  const [weeklyOffer, setWeeklyOffer] = useState<any>(null);
  const [weeklyAchievers, setWeeklyAchievers] = useState<any[]>([]);
  const [packages, setPackages] = useState<MLMPackage[]>(() => {
    const saved = localStorage.getItem('cached_packages');
    return saved ? JSON.parse(saved) : [];
  });
  const [activePackages, setActivePackages] = useState<any[]>(() => {
    const saved = localStorage.getItem('cached_active_packages');
    return saved ? JSON.parse(saved) : [];
  });
  const [boostingGold, setBoostingGold] = useState<{ progress: number, total: number, position: number }>({ progress: 0, total: 12, position: 0 });
  const [settings, setSettings] = useState<any>(null);
  const [boostingReward, setBoostingReward] = useState(25);
  const [gasPrice, setGasPrice] = useState(12);
  const [blockNumber, setBlockNumber] = useState(18421092);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const isAdmin = user.role?.toLowerCase() === 'admin';
  const [syncingBoosting, setSyncingBoosting] = useState(false);
  const [boostingDiagnostics, setBoostingDiagnostics] = useState<any>(null);

  const handleSyncBoosting = async () => {
    setSyncingBoosting(true);
    try {
      const lookupId = user.user_id || user.id;
      const res = await appwriteService.syncBoosting(lookupId);
      setBoostingDiagnostics(res);
      // Refresh data to show new status
      await fetchDashboardData();
      if (onRefreshWallet) onRefreshWallet();
    } catch (e) {
      console.error(e);
    } finally {
      setSyncingBoosting(false);
    }
  };

  const [syncingROI, setSyncingROI] = useState(false);

  const handleSyncROI = async () => {
    setSyncingROI(true);
    try {
      const lookupId = user.user_id || user.id;
      const res = await appwriteService.distributeROI(lookupId);
      if (res.success) {
        // Refresh data to show new totals
        await fetchDashboardData();
        if (onRefreshWallet) onRefreshWallet();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSyncingROI(false);
    }
  };

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [purchaseSuccessSpins, setPurchaseSuccessSpins] = useState<{ count: number; pkgName: string } | null>(null);

  // We should NOT have a local 'wallet' state that shadows the prop.
  // Instead, use the prop directly to ensure we stay in sync with App.tsx
  
  // Sync optimistic states with storage/props
  useEffect(() => {
    // 1. Real-time for purchases
    if (!isLive) return;
    try {
      const purchaseChannel = `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.collections.purchases}.documents`;
      const unsubscribe = client.subscribe(purchaseChannel, (response) => {
        const payload = response.payload as any;
        const lookupId = user.user_id || user.id;
        if (payload.user_id === lookupId) {
          console.log("Real-time purchase detected!");
          fetchDashboardData();
        }
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Purchase realtime failed", e);
    }
  }, [user.id, isLive]);

  useEffect(() => {
    // 1. Initial load of any persistent optimistic packages
    const saved = localStorage.getItem(`optimistic_pkgs_${user.id}`);
    if (saved) {
      try {
        const pkgs = JSON.parse(saved);
        // Only keep those purchased in the last 1 minute to avoid stale issues
        const fresh = pkgs.filter((p: any) => Date.now() - p.timestamp < 60000);
        if (fresh.length > 0) {
          setActivePackages(prev => {
            const newOnes = fresh.filter((f: any) => !prev.some(p => String(p.id) === String(f.id)));
            return [...prev, ...newOnes];
          });
        }
      } catch (e) {
        console.error("Failed to parse optimistic packages", e);
      }
    }
  }, [user.id]);

  const fetchDashboardData = async () => {
    try {
      setErrorMsg(null);
      const isLiveAPI = isLive ?? isAppwriteConfigured();
      const lookupId = user.user_id || user.id;
      const api = isLiveAPI ? appwriteService : mockApi.db;
      const settingsData = await api.getSettings();
      setSettings(settingsData);
      setBoostingReward(settingsData?.boosting_reward || 25);
      setMarqueeText(settingsData?.marquee_text || '');

      if (isLiveAPI) {
        // Sync boosting qualification silently
        appwriteService.syncBoosting(lookupId);
        
        const pkgs = await appwriteService.getPackages();
        const [gold, transactions, userPurchases] = await Promise.all([
          appwriteService.getBoostingGoldProgress(lookupId),
          appwriteService.getTransactions(lookupId),
          appwriteService.getUserPurchases(lookupId)
        ]);
        
        const sortedPkgs = pkgs.sort((a, b) => a.price - b.price);
        setPackages(sortedPkgs);
        localStorage.setItem('cached_packages', JSON.stringify(sortedPkgs));

        setBoostingGold(gold);
        setTransactions(transactions);
        
        // Map active packages from real purchases
        const purchasedIds = userPurchases.map(p => p.package_id || (p as any).packageId || (p as any).packageid).filter(Boolean);
        const active = sortedPkgs.filter(p => purchasedIds.includes(p.id)).map(p => {
          const matchedPurchase = userPurchases.find(up => (up.package_id === p.id || (up as any).$id === p.id || up.id === p.id));
          return {
            ...p,
            earned: matchedPurchase?.roi_earned || 0,
            activeSince: matchedPurchase?.activated_at
          };
        });
        
        localStorage.setItem('cached_active_packages', JSON.stringify(active));
        
        setActivePackages(current => {
          const optimisticOnes = current.filter(p => (p as any).optimistic && !active.some(a => String(a.id) === String(p.id)));
          const combined = [...active, ...optimisticOnes];
          
          // Update persistent cache
          const optOnly = combined.filter(p => (p as any).optimistic);
          if (optOnly.length > 0) {
            localStorage.setItem(`optimistic_pkgs_${user.id}`, JSON.stringify(optOnly));
          } else {
            localStorage.removeItem(`optimistic_pkgs_${user.id}`);
          }
          
          return combined;
        });
        
      } else {
        const [offer, achievers, packagesData] = await Promise.all([
          mockApi.db.getWeeklyOffer(),
          mockApi.db.getWeeklyAchievers(),
          mockApi.db.getPackages()
        ]);
        
        const sortedPkgs = packagesData.sort((a, b) => a.price - b.price);
        setWeeklyOffer(offer);
        setWeeklyAchievers(achievers);
        setPackages(sortedPkgs.filter(p => p.is_active));
        
        const localTxs = JSON.parse(localStorage.getItem(`transactions_${user.id}`) || '[]');
        setTransactions(localTxs);
        
        const rawPurchases: any[] = JSON.parse(localStorage.getItem(`purchased_packages_${user.id}`) || '[]');
        const pIds = rawPurchases.map(p => typeof p === 'string' ? p : p.id);
        const active = sortedPkgs.filter(p => pIds.includes(p.id)).map(p => ({
          ...p,
          earned: 3.00
        }));
        
        setActivePackages(current => {
          // Preserve optimistic packages if they are not yet in the official list
          const optimisticOnes = current.filter(p => (p as any).optimistic && !active.some(a => String(a.id) === String(p.id)));
          const combined = [...active, ...optimisticOnes];

          // Update persistent cache
          const optOnly = combined.filter(p => (p as any).optimistic);
          if (optOnly.length > 0) {
            localStorage.setItem(`optimistic_pkgs_${user.id}`, JSON.stringify(optOnly));
          } else {
            localStorage.removeItem(`optimistic_pkgs_${user.id}`);
          }

          return combined;
        });

        if (isLive) {
          const boostingData = await appwriteService.getBoostingGoldProgress(lookupId);
          setBoostingGold(boostingData);
        } else {
          const queue = JSON.parse(localStorage.getItem('boosting_gold_queue') || '[]');
          const userEntries = queue.filter((e: any) => (e.user_id === user.id || e.user_id === lookupId) && !e.completed);
          
          if (userEntries.length > 0) {
            const firstEntry = userEntries[0];
            const entryIndex = queue.findIndex((e: any) => e.id === firstEntry.id);
            const totalAfter = queue.length - 1 - entryIndex;
            setBoostingGold({
              progress: Math.min(totalAfter, 12),
              total: 12,
              position: entryIndex + 1
            });
          }
        }
      }
    } catch (e: any) {
      console.error("Failed to fetch dashboard data", e);
      setErrorMsg("Connection Error: " + (e.message || "Failed to load data from live backend"));
    }
  };
  
  useEffect(() => {
    const interval = setInterval(() => {
      setGasPrice(prev => {
        const change = (Math.random() - 0.5) * 2;
        return Math.max(8, Math.min(45, prev + change));
      });
      setBlockNumber(prev => prev + 1);
    }, 12000); // New block roughly every 12 seconds
    return () => clearInterval(interval);
  }, []);

  const displayName = useMemo(() => {
    if (!user.name || user.name === 'User') {
      return user.email?.split('@')[0] || 'USER NODE';
    }
    return user.name;
  }, [user.name, user.email]);

  const referralLink = useMemo(() => {
    const baseUrl = (import.meta as any).env.VITE_SITE_URL || window.location.origin;
    return `${baseUrl}/?ref=${user.id}`;
  }, [user.id]);

  const sortedPackages = useMemo(() => {
    return [...packages].sort((a, b) => a.price - b.price);
  }, [packages]);

  const dailyPackageYield = useMemo(() => {
    return activePackages.reduce((acc, p) => acc + (p.price * ((Number(p.daily_roi) || 0) / 100)), 0);
  }, [activePackages]);

  const maxROI = useMemo(() => {
    return activePackages.length > 0 ? Math.max(...activePackages.map(p => p.daily_roi)) : 0;
  }, [activePackages]);

  const totalActiveValue = useMemo(() => {
    return activePackages.reduce((acc, p) => acc + p.price, 0);
  }, [activePackages]);

  const cappingLimit = useMemo(() => {
    if (activePackages.length === 0) return 0;
    
    let totalLimit = 0;
    for (const pkg of activePackages) {
      const maxPerc = Number(pkg.max_roi_percent);
      // If any package has 0 or explicitly set as unlimited, return Infinity
      if (maxPerc <= 0) return Infinity;
      
      const pkgPrice = Number(pkg.price || 0);
      
      // Special case consistent with server for $20 Scaling Node
      if (pkgPrice === 20 && (maxPerc === 200)) {
        totalLimit += 4000;
        continue;
      }
      
      totalLimit += (pkgPrice * maxPerc) / 100;
    }
    return totalLimit;
  }, [activePackages]);
  const cappingBreakdown = useMemo(() => {
    let roi = 0;
    let level = 0;
    let matrix = 0;
    let pool = 0;

    transactions.forEach(tx => {
      if (!tx.status || tx.status === 'completed') {
        const amt = Number(tx.amount || 0);
        const type = tx.type?.toLowerCase() || '';
        if (type.includes('roi')) {
          roi += amt;
        } else if (type.includes('level')) {
          level += amt;
        } else if (type.includes('matrix') || type.includes('placement')) {
          matrix += amt;
        } else if (type.includes('pool')) {
          pool += amt;
        }
      }
    });

    const finalROI = (Number(wallet.roi_income) || Number(wallet.wallet_roi_earned) || 0) > 0 
      ? (Number(wallet.roi_income) || Number(wallet.wallet_roi_earned) || 0) 
      : roi;
      
    const finalLevel = (Number(wallet.level_income) || 0) > 0 
      ? Number(wallet.level_income) 
      : level;
      
    const finalMatrix = (Number(wallet.matrix_income) || 0) > 0 
      ? Number(wallet.matrix_income) 
      : matrix;
      
    // Since the server stores matrix_income inside pool_income in the Appwrite database,
    // wallet.pool_income contains the combined total of both matrix income and pool payouts.
    // To resolve the dynamic balance, we subtract finalMatrix from the total pool_income field.
    const rawPoolIncome = Number(wallet.pool_income) || 0;
    const finalPool = rawPoolIncome > 0 
      ? Math.max(0, rawPoolIncome - finalMatrix) 
      : pool;

    return {
      roi: finalROI,
      level: finalLevel,
      matrix: finalMatrix,
      pool: finalPool
    };
  }, [transactions, wallet]);

  const cappingEarned = useMemo(() => {
    return cappingBreakdown.roi + cappingBreakdown.matrix + cappingBreakdown.level + cappingBreakdown.pool;
  }, [cappingBreakdown]);

  const cappingProgress = useMemo(() => {
    if (cappingLimit === 0 || cappingLimit === Infinity) return 0;
    return Math.max(0, Math.min(100, (cappingEarned / cappingLimit) * 100));
  }, [cappingEarned, cappingLimit]);

  const nextROIIn = useMemo(() => {
    if (activePackages.length === 0) return "NO ACTIVE NODES";
    
    // Sort active packages by their next expected ROI time
    const sortedActive = [...activePackages].sort((a, b) => {
        const lastA = new Date(a.last_roi_at || a.activated_at || a.$createdAt).getTime();
        const lastB = new Date(b.last_roi_at || b.activated_at || b.$createdAt).getTime();
        const intA = Number(a.roi_interval_minutes || 1440);
        const intB = Number(b.roi_interval_minutes || 1440);
        return (lastA + intA * 60000) - (lastB + intB * 60000);
    });

    const pkg = sortedActive[0];
    const interval = Number(pkg.roi_interval_minutes || 1440);
    const last = new Date(pkg.last_roi_at || pkg.activated_at || pkg.$createdAt).getTime();
    const next = last + (interval * 60000);
    const diff = next - Date.now();
    
    if (diff <= 5000) return "SYNCING..."; // Show SYNCING slightly before the minute ends
    
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${mins}m ${secs}s`;
  }, [activePackages, tick]);

  // Use prop values if available, otherwise fallback to wallet data
  const liveBalance = propLiveBalance ?? wallet.balance;
  const liveWalletROI = propLiveWalletROI ?? (wallet.wallet_roi_earned || 0);

  // Fetch settings for marquee
  React.useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settings = await mockApi.db.getSettings() as any;
        if (settings) {
          if (settings.marquee_text) setMarqueeText(settings.marquee_text);
          if (settings.boosting_reward) setBoostingReward(settings.boosting_reward);
        }
      } catch (e) {
        console.error("Failed to fetch marquee settings", e);
      }
    };
    fetchSettings();
  }, []);

  // Fetch Weekly Offer & Achievers
  React.useEffect(() => {
    fetchDashboardData();
  }, [user.id, user.user_id]);

  const handlePurchase = async (pkgId: string) => {
    if (purchasing) return;
    const lookupId = user.user_id || user.id;
    
    const pkgToActivate = packages.find(p => p.id === pkgId);
    if (!pkgToActivate) return;
    
    // Check balance locally first
    if (wallet.balance < pkgToActivate.price) {
      alert("Insufficient balance for this node.");
      return;
    }

    setPurchasing(pkgId);
    try {
      // 1. Optimistic Updates (IMMEDIATE)
      if (onOptimisticPurchase) onOptimisticPurchase(pkgToActivate.price);
      
      const newActivePkg = { ...pkgToActivate, active: true, optimistic: true, timestamp: Date.now() } as any;
      
      setActivePackages(prev => {
        const exists = prev.some(ap => String(ap.id) === String(pkgToActivate.id));
        if (exists) return prev;
        const updated = [...prev, newActivePkg];
        localStorage.setItem(`optimistic_pkgs_${user.id}`, JSON.stringify(updated.filter(u => u.optimistic)));
        return updated;
      });

      setPurchasing(null);

      // 3. Trigger API
      const resPromise = isLive 
        ? appwriteService.purchasePackage(lookupId, pkgId)
        : (mockApi.db as any).purchasePackage(lookupId, pkgId);
      
      resPromise.then((res: any) => {
        if (res.success) {
          console.log("Purchase confirmed by server");
          if (onClearOptimisticPurchase) onClearOptimisticPurchase(pkgToActivate.price);
          
          // Refresh wallet immediately so the user's free spins state is instantly synchronized!
          if (onRefreshWallet) onRefreshWallet();
          
          // Show the congratulations modal with details
          const spinsCount = res.bonusSpins || (pkgToActivate.price === 20 ? 2 : 1);
          setPurchaseSuccessSpins({
            count: spinsCount,
            pkgName: pkgToActivate.name || `$${pkgToActivate.price} Package`
          });

          // Fetch other dashboard data with standard delay
          setTimeout(() => {
            fetchDashboardData();
          }, 3000);
        } else {
          // Revert on failure
          setActivePackages(prev => {
            const filtered = prev.filter(p => String(p.id) !== String(pkgId) || !(p as any).optimistic);
            localStorage.setItem(`optimistic_pkgs_${user.id}`, JSON.stringify(filtered.filter(u => u.optimistic)));
            return filtered;
          });
          alert("Activation Failed: " + (res.message || "Balance error."));
          if (res.trace) {
            console.group('Purchase Error Trace');
            console.table(res.trace);
            console.groupEnd();
          }
        }
      }).catch((err: any) => {
        console.error("Purchase error:", err);
        setActivePackages(prev => {
          const filtered = prev.filter(p => String(p.id) !== String(pkgId) || !(p as any).optimistic);
          localStorage.setItem(`optimistic_pkgs_${user.id}`, JSON.stringify(filtered.filter(u => u.optimistic)));
          return filtered;
        });
        alert("System Error: Connection unstable.");
      });

    } catch (e: any) {
      console.error(e);
      setActivePackages(prev => prev.filter(p => p.id !== pkgId || !(p as any).optimistic));
      alert("System Error: " + (e.message || "An unexpected error occurred"));
      setPurchasing(null);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    // You could add a specific state for this if needed, but for now we'll just use the same logic
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const quickActions = [
    { icon: <ArrowDownCircle size={20} />, label: 'Topup', color: 'text-cyan-400', action: () => onExchangerNav?.('topup'), visible: settings?.enable_deposit !== false },
    { icon: <ArrowUpCircle size={20} />, label: 'Withdraw', color: 'text-purple-500', action: () => onExchangerNav?.('withdraw'), visible: settings?.enable_withdrawal !== false },
    { icon: <RefreshCcw size={20} />, label: 'Swap', color: 'text-amber-500', action: () => onExchangerNav?.('swap'), visible: settings?.enable_swap !== false },
    { icon: <UserPlus size={20} />, label: 'Invite', color: 'text-green-500', action: handleCopy, visible: true },
  ];

  const marketData = [
    { symbol: 'BTC/USDT', price: '68,421.50', change: '+2.45%', up: true },
    { symbol: 'ETH/USDT', price: '3,842.12', change: '-1.12%', up: false },
    { symbol: 'SOL/USDT', price: '142.85', change: '+5.67%', up: true },
    { symbol: 'BNB/USDT', price: '584.20', change: '+0.32%', up: true },
  ];

  return (
    <div className="space-y-6 pb-4 relative">
      {/* ATMOSPHERIC BACKGROUND */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-electric/10 blur-[120px] rounded-full animate-pulse-glow"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-electric/5 blur-[120px] rounded-full animate-pulse-glow" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,rgba(204,255,0,0.03)_0%,transparent_70%)]"></div>
      </div>
      
      {/* TICKER - MOVED TO TOP AND STUCK TO HEADER */}
      <div className="bg-black/40 border-b border-white/5 py-3 mb-4 -mx-8 -mt-8 overflow-hidden relative z-10 backdrop-blur-md">
        <div className="flex whitespace-nowrap animate-marquee">
          <span className="text-[10px] font-black text-slate-muted uppercase tracking-[0.2em] px-4">
            {marqueeText}
          </span>
          <span className="text-[10px] font-black text-slate-muted uppercase tracking-[0.2em] px-4">
            {marqueeText}
          </span>
        </div>
      </div>

      {/* NETWORK STATUS BAR */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-cyan-500/10 via-obsidian/40 to-transparent border border-cyan-500/20 rounded-2xl -mt-4 relative z-10 backdrop-blur-md shadow-lg">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_10px_#10B981]"></span>
            </div>
            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Mainnet Live</span>
          </div>
          <div className="h-4 w-[1px] bg-white/10"></div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Gas:</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">{gasPrice.toFixed(0)} Gwei</span>
              <TrendingUp size={10} className={`transition-transform duration-500 ${gasPrice > 15 ? 'text-red-400 rotate-0' : 'text-emerald-400 rotate-180'}`} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/5 border border-white/10">
            <Database size={12} className="text-cyan-400 animate-pulse" />
            <span className="text-[9px] font-black text-white tabular-nums">{blockNumber.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="space-y-6 relative z-10">
        {errorMsg && (
          <div className="mx-4 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
            <AlertCircle size={18} />
            <span className="text-[10px] font-black uppercase tracking-widest">{errorMsg}</span>
          </div>
        )}
        
        {/* ELITE CRYPTO VOYAGER CARD (TRUE LANDSCAPE) */}
        <div className="relative group sm:px-0">
          {/* DYNAMIC GLOW AURA */}
          <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/30 via-purple-500/30 to-cyan-500/30 rounded-[2.5rem] blur-2xl opacity-40 group-hover:opacity-100 transition-all duration-1000 animate-pulse"></div>
          
          <div className="relative glass-card p-5 sm:p-8 lg:p-10 rounded-[2.5rem] overflow-hidden bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-black border-white/20 min-h-[280px] md:min-h-[350px] lg:min-h-[400px] flex flex-col justify-between shadow-[0_20px_50px_rgba(0,0,0,0.8)] transition-all duration-700 group-hover:scale-[1.01] group-hover:border-white/40">
            
            {/* HOLOGRAPHIC OVERLAY */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,rgba(0,229,255,0.15),transparent_70%)] pointer-events-none"></div>
            <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent_20%,rgba(255,255,255,0.05)_40%,transparent_60%)] -translate-x-full group-hover:translate-x-full transition-transform duration-1500 ease-in-out pointer-events-none"></div>

            {/* BRANDING WATERMARK */}
            <div className="absolute bottom-4 right-8 opacity-[0.03] select-none pointer-events-none hidden sm:block">
              <h3 className="text-8xl font-black italic uppercase tracking-tighter">Cryptospiral</h3>
            </div>

            {/* CIRCUIT PATTERN BACKGROUND */}
            <div className="absolute inset-0 opacity-[0.05] pointer-events-none">
              <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="circuit" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
                    <path d="M0 50 H100 M50 0 V100 M25 25 L75 75 M75 25 L25 75" stroke="white" strokeWidth="0.5" fill="none" />
                    <circle cx="50" cy="50" r="2" fill="white" />
                    <circle cx="25" cy="25" r="1.5" fill="white" />
                    <circle cx="75" cy="75" r="1.5" fill="white" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#circuit)" />
              </svg>
            </div>

            {/* UNIQUE CYBER SECURITY CHIP (ULTRA DETAILED) */}
            <div className="absolute top-5 right-5 sm:top-8 sm:right-8 w-12 h-10 sm:w-24 sm:h-20 rounded-lg sm:rounded-2xl overflow-hidden border border-amber-500/40 shadow-[0_0_30px_rgba(251,191,36,0.3)] group/chip z-20 cursor-help">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-200 via-amber-500 to-amber-800"></div>
              <div className="absolute inset-0 opacity-60">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1px] sm:w-[2px] h-full bg-black/50"></div>
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-[1px] sm:h-[2px] bg-black/50"></div>
                <div className="absolute inset-1 sm:inset-2 border sm:border-2 border-black/30 rounded-sm sm:rounded-md"></div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-3 h-3 sm:w-8 sm:h-8 bg-black/90 rounded-sm sm:rounded-md flex items-center justify-center relative border border-amber-400/30">
                  <div className="absolute inset-0 bg-amber-400/30 blur-sm sm:blur-md animate-pulse"></div>
                  <div className="w-0.5 h-0.5 sm:w-1.5 sm:h-1.5 bg-amber-400 rounded-full shadow-[0_0_8px_#FBBF24] relative z-10"></div>
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/10 to-transparent h-1/2 w-full animate-scan pointer-events-none"></div>
            </div>

            <div className="relative z-10 space-y-4 sm:space-y-8">
              <div className="flex justify-between items-start">
                <div className="space-y-2 sm:space-y-3">
                  <div className="flex items-center gap-2 sm:gap-4">
                    <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 backdrop-blur-md">
                      <Cpu size={12} className="text-cyan-400 animate-spin-slow sm:size-4" />
                      <p className="text-[8px] sm:text-[14px] font-black text-cyan-400 uppercase tracking-[0.3em] sm:tracking-[0.5em]">Secure Vault</p>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 sm:px-4 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[7px] sm:text-[12px] font-black text-emerald-400 uppercase tracking-widest">
                      <ShieldCheck size={10} className="sm:size-4" />
                      TRC-20 Network
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <span className="text-[10px] sm:text-[14px] font-black text-cyan-400 uppercase tracking-[0.4em] mb-[-4px] sm:mb-[-8px] opacity-70 truncate max-w-[200px]">
                        Wallet
                      </span>
                      <h2 className="text-3xl sm:text-4xl md:text-3xl lg:text-5xl xl:text-7xl font-black text-white uppercase tracking-tighter italic drop-shadow-[0_10px_20px_rgba(0,0,0,1)] bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-slate-500 flex items-center gap-4">
                        {displayName}
                        {isAppwriteConfigured() ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[8px] font-black tracking-widest">LIVE</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[8px] font-black tracking-widest text-amber-500">SANDBOX</span>
                        )}
                      </h2>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2 sm:space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-5 sm:h-8 bg-gradient-to-b from-cyan-400 to-blue-600 rounded-full shadow-[0_0_15px_rgba(0,229,255,0.5)]"></div>
                  <p className="text-[10px] sm:text-[18px] font-black text-slate-400 uppercase tracking-[0.2em] sm:tracking-[0.4em]">Total Available Assets</p>
                </div>
                <div className="flex items-center justify-center sm:justify-start gap-3 sm:gap-8 flex-wrap">
                  <div className="relative group/balance">
                    <div className="absolute -inset-8 bg-cyan-500/20 blur-[40px] rounded-full opacity-0 group-hover/balance:opacity-100 transition-opacity duration-1000"></div>
                    <div className="flex items-baseline gap-2 sm:gap-4 relative">
                      <span className="text-4xl sm:text-6xl md:text-5xl lg:text-8xl xl:text-9xl font-black tracking-tighter text-white drop-shadow-[0_20px_40px_rgba(0,229,255,0.5)] bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-cyan-200/80 tabular-nums">
                        ${liveBalance?.toFixed(4) || '0.0000'}
                      </span>
                      <span className="text-lg sm:text-2xl md:text-xl lg:text-4xl font-black text-cyan-400 italic tracking-tighter opacity-80">USDT</span>
                    </div>
                  </div>

                  {/* BALANCE MINI CARDS (Optional, currently just showing main balance largely) */}
                  
                  <div className="flex items-center justify-center gap-3 sm:gap-4 self-center flex-wrap">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-md">
                      <div className="flex h-2 w-2 sm:h-3 sm:w-3 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 sm:h-3 sm:w-3 bg-emerald-500 shadow-[0_0_12px_#10B981]"></span>
                      </div>
                      <span className="text-[8px] sm:text-[12px] font-black text-emerald-400 uppercase tracking-widest">Mining Active</span>
                    </div>
                    {dailyPackageYield > 0 && (
                      <div className="px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 backdrop-blur-md">
                        <span className="text-[7px] sm:text-[11px] font-black text-cyan-400 uppercase tracking-widest whitespace-nowrap">+${dailyPackageYield.toFixed(2)} Daily Node Yield</span>
                      </div>
                    )}

                  </div>
                </div>
              </div>
            </div>

            <div className="relative z-10 flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 sm:pt-8 border-t border-white/10">
              <div className="flex items-center gap-2 sm:gap-4">
                <div className="px-2 sm:px-4 py-1 sm:py-2 rounded-lg sm:rounded-xl bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/10 transition-all cursor-default">
                  <span className="text-[8px] sm:text-[12px] font-mono font-black text-slate-300 uppercase tracking-widest">NODE_ID: #{user.node_id || 'NX-8291A4'}</span>
                </div>
                <div className="px-2 sm:px-4 py-1 sm:py-2 rounded-lg sm:rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center gap-1.5 sm:gap-3 backdrop-blur-md">
                  <Globe size={10} className="text-cyan-400 sm:size-4" />
                  <span className="text-[8px] sm:text-[12px] font-black text-cyan-400 uppercase tracking-widest">Global Rank: #{user.global_rank || generateRank(user.user_id || user.id || user.email || '')}</span>
                </div>
              </div>
              
              <div className="flex flex-col items-center sm:items-end gap-1">
                <div className="flex items-center gap-1 sm:gap-2 bg-black/40 px-2 sm:px-4 py-1 sm:py-2 rounded-lg sm:rounded-2xl border border-white/10 shadow-inner">
                  <div className="relative flex h-1 sm:h-2.5 w-1 sm:w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1 sm:h-2.5 w-1 sm:w-2.5 bg-cyan-500 shadow-[0_0_12px_#00E5FF]"></span>
                  </div>
                  <span className="text-[6px] sm:text-[12px] font-black text-cyan-400 uppercase tracking-[0.1em] sm:tracking-[0.3em]">Protocol Live</span>
                </div>
                <p className="text-[4px] sm:text-[7px] font-black text-slate-600 uppercase tracking-[0.2em] sm:tracking-[0.5em]">Decentralized Network</p>
              </div>
            </div>
          </div>
        </div>

        {/* GLOBAL MATRIX SPILLOVER INFO */}
        <div className="relative group !mt-4">
          <div className="relative glass-card p-4 rounded-2xl border-emerald-500/30 bg-gradient-to-r from-emerald-500/20 via-obsidian to-black overflow-hidden shadow-xl">
            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                  <Globe size={18} className="animate-spin-slow" />
                </div>
                <div>
                  <p className="text-[8px] font-black text-emerald-500/60 uppercase tracking-widest leading-none mb-1">Global Auto-Fill</p>
                  <h4 className="text-sm font-black text-white italic uppercase tracking-tighter">2x2 Global Matrix Active</h4>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest leading-none mb-1">Non-Working Profit</p>
                <div className="flex items-center gap-1.5 justify-end">
                  <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse"></div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Spillover Enabled</p>
                </div>
              </div>
            </div>
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 blur-2xl rounded-full -mr-12 -mt-12"></div>
          </div>
        </div>

        {/* MY ACTIVE PLAN SUMMARY (MERA PLAN) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 !mt-4">
          <div className="space-y-3">
            {activePackages.filter(pkg => Number(pkg.price) !== 20).map((pkg) => (
              <div key={pkg.id} className="relative group">
                <div 
                  onClick={() => onNavigate?.('mining')}
                  className="relative glass-card p-4 rounded-2xl border-cyan-500/30 bg-gradient-to-r from-cyan-500/10 to-transparent overflow-hidden cursor-pointer hover:border-cyan-500/50 transition-all"
                >
                  <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400">
                        <ShieldCheck size={18} className="animate-pulse" />
                      </div>
                      <div>
                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Active Plan</p>
                        <h4 className="text-sm font-black text-white italic uppercase tracking-tighter">{pkg.name}</h4>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Daily Yield</p>
                        <p className="text-sm font-black text-emerald-400 italic tracking-tighter">+{pkg.daily_roi}%</p>
                      </div>
                      <ChevronRight size={16} className="text-slate-600" />
                    </div>
                  </div>
                  <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 blur-2xl rounded-full -mr-12 -mt-12"></div>
                </div>
              </div>
            ))}
            {activePackages.length === 0 && (
              <div className="relative glass-card p-6 rounded-2xl border-dashed border-white/10 flex flex-col items-center justify-center text-center">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">No Active Nodes</p>
                <button 
                  onClick={() => onNavigate?.('mining')}
                  className="mt-2 text-[10px] font-black text-electric uppercase tracking-widest hover:underline"
                >
                  Buy Starter Package
                </button>
              </div>
            )}
          </div>

          {/* PROFIT CAPPING ROCKET */}
          <div className="relative group">
            <div className="relative glass-card p-5 rounded-2xl border-purple-500/20 bg-gradient-to-br from-purple-500/10 via-obsidian to-black overflow-hidden h-full flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                    <TrendingUp size={18} />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-black text-white uppercase italic tracking-tighter">Rocket Capacity</h4>
                    <p className="text-[8px] font-black text-purple-400/60 uppercase tracking-widest">
                      {cappingLimit === Infinity ? 'Unlimited' : `${(cappingLimit / (totalActiveValue || 1)).toFixed(1)}x`} Profit Capping
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-white italic tracking-tighter">{cappingProgress.toFixed(1)}%</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between text-[8px] font-black uppercase tracking-widest">
                  <span className="text-slate-500">Earned: ${cappingEarned.toFixed(2)}</span>
                  <span className="text-purple-400">Limit: {cappingLimit === Infinity ? 'NO LIMIT' : `$${cappingLimit.toFixed(2)}`}</span>
                </div>
                <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden p-[1px] border border-white/5 shadow-inner">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(168,85,247,0.4)] ${cappingLimit === Infinity ? 'bg-gradient-to-r from-emerald-500 to-cyan-400' : cappingProgress > 90 ? 'bg-red-500' : 'bg-gradient-to-r from-purple-600 to-cyan-400'}`} 
                    style={{ width: `${cappingLimit === Infinity ? 100 : cappingProgress}%` }}
                  ></div>
                </div>
                
                {/* 4 CAPPED INCOMES BREAKDOWN */}
                <div className="pt-2 border-t border-white/5 grid grid-cols-2 gap-1.5 text-left">
                  <div className="bg-black/35 rounded-lg p-2 border border-white/5 flex flex-col justify-between">
                    <span className="text-[7.5px] text-slate-500 font-bold uppercase tracking-widest leading-none mb-1">ROI Yield</span>
                    <span className="text-xs font-black text-cyan-400 font-mono">${cappingBreakdown.roi.toFixed(2)}</span>
                  </div>
                  <div className="bg-black/35 rounded-lg p-2 border border-white/5 flex flex-col justify-between">
                    <span className="text-[7.5px] text-slate-500 font-bold uppercase tracking-widest leading-none mb-1">Matrix Income</span>
                    <span className="text-xs font-black text-emerald-400 font-mono">${cappingBreakdown.matrix.toFixed(2)}</span>
                  </div>
                  <div className="bg-black/35 rounded-lg p-2 border border-white/5 flex flex-col justify-between">
                    <span className="text-[7.5px] text-slate-500 font-bold uppercase tracking-widest leading-none mb-1">Level Income</span>
                    <span className="text-xs font-black text-purple-400 font-mono">${cappingBreakdown.level.toFixed(2)}</span>
                  </div>
                  <div className="bg-black/35 rounded-lg p-2 border border-white/5 flex flex-col justify-between">
                    <span className="text-[7.5px] text-slate-500 font-bold uppercase tracking-widest leading-none mb-1">Pool Payout</span>
                    <span className="text-xs font-black text-amber-400 font-mono">${cappingBreakdown.pool.toFixed(2)}</span>
                  </div>
                </div>

                <p className="text-[7px] font-bold text-slate-600 uppercase tracking-widest text-center !mt-1.5">
                  {cappingLimit === Infinity ? 'Full Node Activation Unlocked Unlimited Scaling' : 'Once reached capacity, income will stop until renewal'}
                </p>
              </div>
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none"></div>
            </div>
          </div>
        </div>

        {/* QUICK ACTIONS - UNIFIED 3-COLUMN CYBER GRID */}
        <div className="grid grid-cols-3 gap-2 sm:gap-6 !mt-6">
          {[
            { 
              icon: <ArrowDownCircle className="size-5 sm:size-7" />, 
              label: 'Deposit', 
              sub: 'Top-up',
              colorClass: 'text-cyan-400',
              bgClass: 'bg-cyan-500/10',
              hoverBorder: 'hover:border-cyan-500/50',
              accent: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
              glow: 'shadow-[0_0_15px_rgba(0,229,255,0.1)]',
              action: () => onExchangerNav?.('topup'), 
              visible: settings?.enable_deposit !== false 
            },
            { 
              icon: <ArrowUpCircle className="size-5 sm:size-7" />, 
              label: 'Withdraw', 
              sub: 'Payout',
              colorClass: 'text-purple-400',
              bgClass: 'bg-purple-500/10',
              hoverBorder: 'hover:border-purple-500/50',
              accent: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
              glow: 'shadow-[0_0_15px_rgba(168,85,247,0.1)]',
              action: () => onExchangerNav?.('withdraw'), 
              visible: settings?.enable_withdrawal !== false 
            },
            { 
              icon: <UserPlus className="size-5 sm:size-7" />, 
              label: 'Invite', 
              sub: 'Share',
              colorClass: 'text-emerald-400',
              bgClass: 'bg-emerald-500/10',
              hoverBorder: 'hover:border-emerald-500/50',
              accent: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
              glow: 'shadow-[0_0_15px_rgba(16,185,129,0.1)]',
              action: handleCopy, 
              visible: true 
            },
          ].filter(a => a.visible).map((action, i) => (
            <div 
              key={i}
              onClick={action.action}
              className={`relative overflow-hidden group cursor-pointer h-24 sm:h-36 glass-card border border-white/10 rounded-xl sm:rounded-3xl ${action.hoverBorder} transition-all duration-500 flex flex-col items-center justify-center p-2 sm:p-6 bg-gradient-to-br from-white/5 via-obsidian to-black hover:scale-[1.02] active:scale-95 ${action.glow}`}
            >
              {/* BACKDROP GLOW */}
              <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 sm:w-24 h-16 sm:h-24 ${action.bgClass} blur-xl sm:blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-all duration-700`}></div>
              
              <div className="relative z-10 mb-2 sm:mb-3">
                <div className={`p-2 sm:p-4 rounded-xl sm:rounded-2xl ${action.accent} transition-all group-hover:scale-110 group-hover:rotate-[360deg] duration-700 shadow-inner flex items-center justify-center`}>
                  {action.icon}
                </div>
              </div>
              
              <div className="relative z-10 text-center">
                <h4 className="text-[10px] sm:text-[18px] font-black text-white uppercase italic tracking-tighter leading-none mb-1">{action.label}</h4>
                <p className={`text-[6px] sm:text-[10px] font-black ${action.colorClass}/60 uppercase tracking-widest hidden sm:block`}>{action.sub}</p>
              </div>

              {/* INTERACTIVE SCAN LINE */}
              <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-white/50 to-transparent scale-x-0 group-hover:scale-x-100 transition-transform duration-700 opacity-0 group-hover:opacity-100"></div>
            </div>
          ))}
        </div>

        {/* MINING PROTOCOLS (PACKAGES) */}
        <section className="space-y-4">
          <div className="flex justify-between items-center px-2">
            <div className="flex items-center gap-2">
              <Cpu size={18} className="text-electric" />
              <h3 className="text-sm font-black text-white uppercase tracking-widest italic">Mining Protocols</h3>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={handleSyncROI}
                disabled={syncingROI}
                className="text-[10px] font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1 hover:text-white transition-all disabled:opacity-50"
              >
                <RefreshCcw size={12} className={syncingROI ? 'animate-spin' : ''} />
                {syncingROI ? 'Syncing...' : 'Sync Yield'}
              </button>
              <button 
                onClick={() => onNavigate?.('mining')}
                className="text-[10px] font-black text-electric uppercase tracking-widest flex items-center gap-1 hover:gap-2 transition-all"
              >
                View All <ChevronRight size={12} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {sortedPackages.map((pkg, idx) => {
              const isActive = activePackages.some(ap => String(ap.id) === String(pkg.id));
              
              // Correct Sequential Locking logic
              let isLocked = false;
              let entryRequirement = "";
              
              if (idx > 0) {
                const prevPkg = sortedPackages[idx - 1]; 
                const hasPrevPkg = activePackages.some(ap => String(ap.id) === String(prevPkg.id));
                if (!hasPrevPkg) {
                  isLocked = true;
                  entryRequirement = `$${prevPkg.price} Node`;
                }
              }

              const isSpecial = [20, 30, 40].includes(Number(pkg.price));
              let nodeStyle = {
                cardBg: "bg-gradient-to-br from-white/10 via-obsidian to-black",
                borderHover: "hover:border-electric/40",
                glowBg: "bg-electric/5 group-hover:bg-electric/10",
                scanColor: "bg-electric/30 shadow-[0_0_10px_#00E5FF]",
                cpuIconBg: "bg-electric/10 border-electric/20 text-electric group-hover:shadow-[0_0_15px_rgba(0,229,255,0.3)]",
                priceText: "text-white group-hover:text-electric",
                yieldLabel: (
                  <span className="text-[7px] sm:text-[9px] font-black text-emerald-400 uppercase tracking-widest">{pkg.daily_roi}% Yield</span>
                ),
                shieldText: "",
                shieldBg: "",
                shieldIconColor: "",
                buttonStyle: "bg-electric/10 border border-electric/10 group-hover:bg-electric group-hover:text-obsidian"
              };

              if (Number(pkg.price) === 20) {
                const limitValue = Number(pkg.max_roi_percent) > 0 ? (Number(pkg.price) * Number(pkg.max_roi_percent)) / 100 : Infinity;
                const limitStr = limitValue === Infinity ? "Unlimited Scaling Capital" : `Unlock upto $${limitValue.toLocaleString()}`;
                nodeStyle = {
                  cardBg: "bg-gradient-to-br from-purple-900/20 via-obsidian to-black border-purple-500/20",
                  borderHover: "hover:border-purple-400/40",
                  glowBg: "bg-purple-500/5 group-hover:bg-purple-500/10",
                  scanColor: "bg-purple-400/30 shadow-[0_0_10px_#A855F7]",
                  cpuIconBg: "bg-purple-500/10 border-purple-500/20 text-purple-400 group-hover:shadow-[0_0_15px_rgba(168,85,247,0.3)]",
                  priceText: "text-white group-hover:text-purple-400",
                  yieldLabel: (
                    <span className="text-[7px] sm:text-[9px] font-black text-purple-400 uppercase tracking-widest">Exclusive Scalable Node</span>
                  ),
                  shieldText: limitStr,
                  shieldBg: "bg-purple-500/10 border-purple-500/20",
                  shieldIconColor: "text-purple-400",
                  buttonStyle: "bg-purple-600/20 border border-purple-500/30 text-purple-400 group-hover:bg-purple-600 group-hover:text-white"
                };
              } else if (Number(pkg.price) === 30) {
                const limitValue = Number(pkg.max_roi_percent) > 0 ? (Number(pkg.price) * Number(pkg.max_roi_percent)) / 100 : Infinity;
                const limitStr = limitValue === Infinity ? "Unlimited Scaling Capital" : `Unlock upto $${limitValue.toLocaleString()}`;
                nodeStyle = {
                  cardBg: "bg-gradient-to-br from-amber-900/20 via-obsidian to-black border-amber-500/20",
                  borderHover: "hover:border-amber-400/40",
                  glowBg: "bg-amber-500/5 group-hover:bg-amber-500/10",
                  scanColor: "bg-amber-400/30 shadow-[0_0_10px_#F59E0B]",
                  cpuIconBg: "bg-amber-500/10 border-amber-500/20 text-amber-400 group-hover:shadow-[0_0_15px_rgba(245,158,11,0.3)]",
                  priceText: "text-white group-hover:text-amber-400",
                  yieldLabel: (
                    <span className="text-[7px] sm:text-[9px] font-black text-amber-400 uppercase tracking-widest">Premium Scalable Node</span>
                  ),
                  shieldText: limitStr,
                  shieldBg: "bg-amber-500/10 border-amber-500/20",
                  shieldIconColor: "text-amber-400",
                  buttonStyle: "bg-amber-600/20 border border-amber-500/30 text-amber-400 group-hover:bg-amber-600 group-hover:text-white"
                };
              } else if (Number(pkg.price) === 40) {
                const limitValue = Number(pkg.max_roi_percent) > 0 ? (Number(pkg.price) * Number(pkg.max_roi_percent)) / 100 : Infinity;
                const limitStr = limitValue === Infinity ? "Unlimited Scaling Capital" : `Unlock upto $${limitValue.toLocaleString()}`;
                nodeStyle = {
                  cardBg: "bg-gradient-to-br from-rose-900/20 via-obsidian to-black border-rose-500/20",
                  borderHover: "hover:border-rose-400/40",
                  glowBg: "bg-rose-500/5 group-hover:bg-rose-500/10",
                  scanColor: "bg-rose-400/30 shadow-[0_0_10px_#F43F5E]",
                  cpuIconBg: "bg-rose-500/10 border-rose-500/20 text-rose-400 group-hover:shadow-[0_0_15px_rgba(244,63,94,0.3)]",
                  priceText: "text-white group-hover:text-rose-400",
                  yieldLabel: (
                    <span className="text-[7px] sm:text-[9px] font-black text-rose-400 uppercase tracking-widest font-bold">Infinity Ultimate Node</span>
                  ),
                  shieldText: limitStr,
                  shieldBg: "bg-rose-500/10 border-rose-500/20",
                  shieldIconColor: "text-rose-400",
                  buttonStyle: "bg-rose-600/20 border border-rose-500/30 text-rose-400 group-hover:bg-rose-600 group-hover:text-white"
                };
              }
              
              return (
                <div 
                  key={pkg.id} 
                  className={`glass-card p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2.5rem] border-white/5 ${nodeStyle.cardBg} relative overflow-hidden group transition-all duration-500 cursor-pointer shadow-2xl ${isLocked ? 'opacity-60 grayscale-[0.5] cursor-not-allowed' : isActive ? 'border-emerald-500/30' : nodeStyle.borderHover}`}
                  onClick={() => !isLocked && !isActive && handlePurchase(pkg.id)}
                >
                  {/* ACTIVE BADGE */}
                  {isActive && (
                    <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-md">
                      <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse"></div>
                      <span className="text-[7px] font-black text-emerald-400 uppercase tracking-widest">Active</span>
                    </div>
                  )}

                  {/* LOCK OVERLAY */}
                  {isLocked && (
                    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[2px]">
                      <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-slate-400 mb-2">
                        <Lock size={20} className="animate-pulse" />
                      </div>
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Locked</span>
                      <span className="text-[6px] font-bold text-slate-500 uppercase tracking-tighter mt-1">Activate {entryRequirement} First</span>
                    </div>
                  )}

                  {/* PURCHASING OVERLAY */}
                  {purchasing === pkg.id && (
                    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[2px]">
                      <RefreshCcw size={24} className="text-electric animate-spin mb-2" />
                      <span className="text-[8px] font-black text-electric uppercase tracking-widest">Initializing...</span>
                    </div>
                  )}

                  {/* CYBER CHIP DECORATION */}
                  <div className={`absolute top-0 right-0 w-24 h-24 sm:w-32 sm:h-32 blur-2xl sm:blur-3xl rounded-full -mr-12 -mt-12 sm:-mr-16 sm:-mt-16 transition-colors ${isActive ? 'bg-emerald-500/10' : nodeStyle.glowBg}`}></div>
                  
                  {/* SCANNING LINE */}
                  {!isLocked && !isActive && (
                    <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-electric/5 to-transparent z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className={`w-full h-[1px] ${nodeStyle.scanColor} animate-scan`}></div>
                    </div>
                  )}
                  
                  <div className="flex justify-between items-start mb-4 sm:mb-6 relative z-10">
                    <div className="relative">
                      <div className={`p-2 sm:p-3 rounded-xl sm:rounded-2xl border transition-all ${isActive ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : nodeStyle.cpuIconBg}`}>
                        <Cpu size={14} className={`sm:size-[18px] ${!isLocked && 'animate-pulse'}`} />
                      </div>
                      {!isLocked && <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 sm:w-3 sm:h-3 rounded-full border border-obsidian ${isActive ? 'bg-emerald-400 shadow-[0_0_8px_#10B981]' : 'bg-emerald-500'}`}></div>}
                    </div>
                    <div className="text-right">
                      <span className="text-[6px] sm:text-[7px] font-black text-slate-500 uppercase tracking-[0.2em] sm:tracking-[0.3em] block mb-0.5 sm:mb-1">Node</span>
                      <p className={`text-base sm:text-2xl font-black italic tracking-tighter leading-none transition-colors ${isActive ? 'text-emerald-400' : nodeStyle.priceText}`}>${pkg.price}</p>
                    </div>
                  </div>

                  <div className="space-y-3 sm:space-y-4 relative z-10">
                    <div>
                      <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1">
                        <h4 className="text-[10px] sm:text-sm font-black text-white italic uppercase tracking-tighter truncate max-w-[80px] sm:max-w-none">{pkg.name}</h4>
                        <div className="px-1 py-0.5 rounded bg-white/5 border border-white/10 hidden sm:block">
                          <span className="text-[6px] font-black text-slate-400 uppercase tracking-widest">v2.0</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 sm:gap-2">
                        <div className={`w-1 h-1 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-400'}`}></div>
                        {nodeStyle.yieldLabel}
                      </div>
                    </div>

                    {!isSpecial ? (
                      <div className="grid grid-cols-3 gap-1.5 sm:gap-2 pt-3 sm:pt-4 border-t border-white/5">
                        <div className="bg-white/5 p-1.5 sm:p-2 rounded-lg sm:rounded-xl border border-white/5">
                          <span className="text-[4px] sm:text-[5px] font-black text-slate-500 uppercase tracking-widest block mb-0.5">Days</span>
                          <span className="text-[7px] sm:text-[9px] font-black text-white italic">{pkg.duration_days}</span>
                        </div>
                        <div className="bg-white/5 p-1.5 sm:p-2 rounded-lg sm:rounded-xl border border-white/5">
                          <span className="text-[4px] sm:text-[5px] font-black text-slate-500 uppercase tracking-widest block mb-0.5">Direct</span>
                          <span className="text-[7px] sm:text-[9px] font-black text-cyan-400 italic">{pkg.direct_income_percent}%</span>
                        </div>
                        <div className="bg-white/5 p-1.5 sm:p-2 rounded-lg sm:rounded-xl border border-white/5">
                          <span className="text-[4px] sm:text-[5px] font-black text-slate-500 uppercase tracking-widest block mb-0.5">G1-10</span>
                          <span className="text-[7px] sm:text-[9px] font-black text-amber-400 italic">YES</span>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-3 sm:pt-4 border-t border-white/5">
                        <div className={`${nodeStyle.shieldBg} p-2.5 rounded-xl border text-center flex items-center justify-center gap-2 shadow-inner`}>
                           <Shield size={12} className={nodeStyle.shieldIconColor} />
                           <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${nodeStyle.shieldIconColor}`}>{nodeStyle.shieldText}</span>
                        </div>
                      </div>
                    )}

                    <div className={`flex items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-3 rounded-xl sm:rounded-2xl transition-all shadow-inner ${isLocked ? 'bg-white/5 text-slate-600 border border-white/5' : isActive ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : nodeStyle.buttonStyle}`}>
                      <span className="text-[7px] sm:text-[9px] font-black uppercase tracking-[0.1em] sm:tracking-[0.2em]">{isLocked ? 'Locked' : isActive ? 'Running' : 'Initialize'}</span>
                      {!isLocked && !isActive && <Zap size={10} className="sm:size-3" />}
                      {isActive && <Activity size={10} className="sm:size-3 animate-pulse" />}
                    </div>

                    {isActive && (
                      <div className="space-y-1.5 px-1">
                        <div className="flex justify-between items-center">
                          <span className="text-[6px] font-black text-slate-500 uppercase tracking-widest">Yield Earned:</span>
                          <span className="text-[8px] font-black text-emerald-400 italic">${(activePackages.find(ap => String(ap.id) === String(pkg.id))?.earned || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[6px] font-black text-slate-500 uppercase tracking-widest">Next Payout:</span>
                          <span className="text-[8px] font-black text-electric uppercase tracking-widest">{nextROIIn}</span>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex justify-center sm:block hidden">
                      <span className="text-[6px] font-mono text-slate-600 uppercase tracking-[0.4em]">SN: OBS-NODE-{idx + 1}00{pkg.price}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* INCOME STATS (CRYPTO ASSET STYLE) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card p-6 rounded-3xl space-y-4 border-white/5 bg-gradient-to-br from-white/5 to-transparent relative overflow-hidden group hover:border-cyan-500/30 transition-all">
            <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 blur-2xl rounded-full -mr-12 -mt-12 group-hover:bg-cyan-500/10 transition-colors"></div>
            <div className="flex justify-between items-start">
              <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shadow-[0_0_15px_rgba(0,229,255,0.2)]">
                <Zap size={16} />
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[8px] font-black text-cyan-400/50 uppercase tracking-widest">ROI-NODE</span>
                <span className="text-[6px] font-bold text-emerald-400 uppercase tracking-widest">Syncing...</span>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Wallet ROI</span>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-mono font-black text-white tracking-tighter">${liveWalletROI.toFixed(liveWalletROI < 0.01 && liveWalletROI > 0 ? 4 : 2)}</p>
                <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-tighter italic">USDT</span>
              </div>
              
              <div className="mt-2 pt-2 border-t border-white/5 space-y-1">
                 <div className="flex justify-between items-center text-[7px] font-black text-slate-600 uppercase tracking-widest">
                   <span>Daily Yield</span>
                   <span className="text-emerald-400">+${dailyPackageYield.toFixed(dailyPackageYield < 0.01 && dailyPackageYield > 0 ? 4 : 2)}</span>
                 </div>
              </div>
            </div>
            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-500/40 w-2/3 animate-pulse shadow-[0_0_10px_rgba(0,229,255,0.5)]"></div>
            </div>
          </div>

          <div className="glass-card p-6 rounded-3xl space-y-4 border-white/5 bg-gradient-to-br from-white/5 to-transparent relative overflow-hidden group hover:border-purple-500/30 transition-all">
            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 blur-2xl rounded-full -mr-12 -mt-12 group-hover:bg-purple-500/10 transition-colors"></div>
            <div className="flex justify-between items-start">
              <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                <Layers size={16} />
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[8px] font-black text-purple-400/50 uppercase tracking-widest">NET-NODE</span>
                <span className="text-[6px] font-bold text-emerald-400 uppercase tracking-widest">Active</span>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Level Income</span>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-mono font-black text-white tracking-tighter">${(wallet.level_income || 0).toFixed((wallet.level_income || 0) < 0.01 && (wallet.level_income || 0) > 0 ? 4 : 2)}</p>
                <span className="text-[10px] font-bold text-purple-400 uppercase tracking-tighter italic">USDT</span>
              </div>
            </div>
            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500/40 w-1/2 animate-pulse shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div>
            </div>
          </div>

          <div className="glass-card p-6 rounded-3xl space-y-4 border-white/5 bg-gradient-to-br from-white/5 to-transparent relative overflow-hidden group hover:border-amber-500/30 transition-all">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 blur-2xl rounded-full -mr-12 -mt-12 group-hover:bg-amber-500/10 transition-colors"></div>
            <div className="flex justify-between items-start">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                <TrendingUp size={16} />
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[8px] font-black text-amber-400/50 uppercase tracking-widest">DIR-NODE</span>
                <span className="text-[6px] font-bold text-emerald-400 uppercase tracking-widest">Active</span>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sponsor Income</span>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-mono font-black text-white tracking-tighter">${(wallet.direct_income || 0).toFixed((wallet.direct_income || 0) < 0.01 && (wallet.direct_income || 0) > 0 ? 4 : 2)}</p>
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking_tighter italic">USDT</span>
              </div>
            </div>
            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500/40 w-1/3 animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.5)]"></div>
            </div>
          </div>

          <div 
            onClick={() => onNavigate?.('spin')}
            className="glass-card p-6 rounded-3xl space-y-4 border-white/10 bg-gradient-to-br from-purple-900/10 via-obsidian to-black relative overflow-hidden group hover:border-purple-500/40 hover:shadow-[0_0_25px_rgba(168,85,247,0.25)] transition-all cursor-pointer"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 blur-2xl rounded-full -mr-12 -mt-12 group-hover:bg-purple-500/10 transition-colors"></div>
            <div className="flex justify-between items-start">
              <div className="p-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                <RefreshCcw size={16} className="animate-spin-slow text-purple-400" />
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[8px] font-black text-purple-400/70 uppercase tracking-widest font-mono">SPIN-ENERGY</span>
                {Number(wallet.available_spins || 0) > 0 ? (
                  <span className="text-[6px] font-bold text-emerald-400 uppercase tracking-widest animate-pulse">Ready ⚡</span>
                ) : (
                  <span className="text-[6px] font-bold text-slate-500 uppercase tracking-widest">Empty</span>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Available Energy</span>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-mono font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-400 to-yellow-300 tracking-tighter">
                  {wallet.available_spins || 0}
                </p>
                <span className="text-[10px] font-bold text-purple-400 uppercase tracking-tighter italic">SPINS</span>
              </div>
              
              <div className="mt-2 pt-2 border-t border-white/5 space-y-1">
                <div className="flex justify-between items-center text-[7.5px] font-black text-slate-400 uppercase tracking-widest group-hover:text-white transition-colors">
                  <span>TAP TO SPIN WHEEL</span>
                  <ChevronRight size={10} className="text-purple-400 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500" 
                style={{ width: `${Math.min(100, ((wallet.available_spins || 0) / 10) * 100)}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* BOOSTING BOX - GOLDEN GLOSSY DESIGN */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500/20 to-yellow-500/20 rounded-[2.5rem] blur-xl opacity-50 group-hover:opacity-100 transition-opacity"></div>
          <div className="relative glass-card p-8 sm:p-10 rounded-[2.5rem] border-amber-500/30 bg-gradient-to-br from-amber-500/20 via-obsidian to-black overflow-hidden shadow-[0_20px_50px_rgba(245,158,11,0.15)]">
            {/* Qualification Overlay */}
            {boostingGold.position === 0 && (
              <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md text-center p-6">
                <div className="p-4 rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-500 mb-4 shadow-[0_0_30px_rgba(245,158,11,0.2)]">
                  <Lock size={40} className="animate-pulse" />
                </div>
                <h4 className="text-2xl font-black text-white uppercase italic tracking-tighter mb-2">Qualification Required</h4>
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] max-w-[280px] leading-relaxed">
                  {activePackages.some(p => p.price >= (settings?.boosting_min_pkg_price || 10)) 
                    ? `Refer at least ${settings?.boosting_min_directs || 1} direct partner to activate your Global Boosting Node` 
                    : `Purchase a $${settings?.boosting_min_pkg_price || 10}+ Node and refer ${settings?.boosting_min_directs || 1} direct to enter the Global Pool`}
                </p>
                
                <div className="mt-8 flex flex-wrap justify-center gap-2">
                  <div className={`px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest ${activePackages.some(p => p.price >= (settings?.boosting_min_pkg_price || 10)) ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-white/5 border-white/10 text-slate-500'}`}>
                    Node Active
                  </div>
                  <div className={`px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest ${user.direct_count >= (settings?.boosting_min_directs || 1) ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-white/5 border-white/10 text-slate-500'}`}>
                    {user.direct_count || 0}/{settings?.boosting_min_directs || 1} Partner
                  </div>
                </div>

                <button 
                  onClick={handleSyncBoosting}
                  disabled={syncingBoosting}
                  className="mt-6 flex items-center gap-2 px-6 py-3 rounded-2xl bg-amber-500 text-black font-black uppercase tracking-widest text-[10px] hover:bg-white transition-all active:scale-95 disabled:opacity-50"
                >
                  <RefreshCcw size={14} className={syncingBoosting ? 'animate-spin' : ''} />
                  {syncingBoosting ? 'Synchronizing...' : 'Refresh Status'}
                </button>

                {boostingDiagnostics && boostingDiagnostics.success && (
                  <div className="mt-4 p-4 rounded-2xl bg-black/40 border border-white/10 text-left w-full max-w-sm space-y-2">
                    <div className="flex justify-between items-center border-b border-white/5 pb-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Protocol Metrics</span>
                      <span className="text-[10px] font-mono text-emerald-400">STATUS: ACTIVE</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-1">
                      <div>
                        <p className="text-[8px] font-black text-slate-600 uppercase">Qualifying Pkg</p>
                        <p className={`text-xs font-black ${boostingDiagnostics.qualifiedPkg ? 'text-emerald-400' : 'text-red-400'}`}>{boostingDiagnostics.qualifiedPkg ? 'PASSED' : 'REQUIRED'}</p>
                      </div>
                      <div>
                        <p className="text-[8px] font-black text-slate-600 uppercase">Direct Partners</p>
                        <p className={`text-xs font-black ${boostingDiagnostics.qualifiedDirects ? 'text-emerald-400' : 'text-amber-400'}`}>{boostingDiagnostics.actualDirects} / {settings?.boosting_min_directs || 2}</p>
                      </div>
                    </div>
                    {boostingDiagnostics.addedToQueue && (
                      <div className="pt-2 flex items-center gap-2 text-[10px] font-black text-emerald-400 animate-pulse">
                        <ShieldCheck size={12} />
                        <span>SUCCESSFULLY ENTERED GLOBAL POOL</span>
                      </div>
                    )}
                    {boostingDiagnostics.alreadyInQueue && (
                      <div className="pt-2 flex items-center gap-2 text-[10px] font-black text-cyan-400">
                        <Check size={12} />
                        <span>SYNCHRONIZING IN GLOBAL POOL</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Glossy Reflection Overlay */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent pointer-events-none translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-[1500ms] ease-in-out"></div>
            
            {/* Animated Golden Glows */}
            <div className="absolute -top-24 -right-24 w-72 h-72 bg-amber-500/20 blur-[100px] rounded-full group-hover:bg-amber-500/40 transition-all duration-1000"></div>
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-yellow-500/10 blur-[120px] rounded-full group-hover:bg-yellow-500/30 transition-all duration-1000"></div>
            
            <div className="flex flex-col items-center justify-center gap-6 mb-12 relative z-10">
              <div className="space-y-3 flex flex-col items-center text-center">
                <div className="flex items-center gap-3">
                  <Zap size={22} className="text-amber-400 animate-bounce" />
                  <h3 className="text-3xl font-black italic uppercase tracking-tighter text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">Boosting <span className="text-amber-400">Gold</span></h3>
                </div>
                <p className="text-[12px] font-black text-slate-400 uppercase tracking-[0.3em] leading-none">Synchronize 12 nodes to claim the Treasury</p>
              </div>
              <div className="px-8 py-4 rounded-[2rem] bg-gradient-to-r from-amber-500/30 to-yellow-600/10 border border-amber-500/40 flex flex-col items-center shadow-[inset_0_0_20px_rgba(245,158,11,0.2)] backdrop-blur-xl">
                <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-1">Treasury Reward</span>
                <span className="text-3xl font-black text-white italic tracking-tighter drop-shadow-[0_0_10px_rgba(245,158,11,0.4)]">${boostingReward.toFixed(2)} <span className="text-[14px] not-italic text-amber-400/70">USDT</span></span>
              </div>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-6 gap-6 relative z-10">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((slot) => {
                const isFilled = slot <= boostingGold.progress;
                return (
                  <div key={slot} className="flex flex-col items-center gap-4">
                    <div className={`w-full aspect-square rounded-[1.75rem] border-2 flex items-center justify-center transition-all duration-700 relative overflow-hidden group/slot ${
                      isFilled 
                        ? 'bg-gradient-to-br from-amber-400/40 to-yellow-700/30 border-amber-400 shadow-[0_0_35px_rgba(245,158,11,0.4)]' 
                        : 'bg-white/5 border-white/10 border-dashed hover:border-amber-500/50 hover:bg-white/10'
                    }`}>
                      {isFilled ? (
                        <>
                          {/* Glossy shine on filled slots */}
                          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/30 to-transparent -translate-x-full group-hover/slot:translate-x-full transition-transform duration-1000"></div>
                          <div className="absolute inset-0 bg-amber-400/10 animate-pulse"></div>
                          <UserIcon size={32} className="text-amber-400 relative z-10 drop-shadow-[0_0_15px_rgba(245,158,11,0.6)]" />
                        </>
                      ) : (
                        <div className="w-3 h-3 rounded-full bg-white/10 group-hover/slot:bg-amber-500/30 transition-colors"></div>
                      )}
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${isFilled ? 'text-amber-400' : 'text-slate-600'}`}>
                      Node {slot}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-12 pt-10 border-t border-white/10 flex flex-col md:flex-row justify-between items-start gap-8 relative z-10">
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="relative flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500 shadow-[0_0_10px_#F59E0B]"></span>
                  </div>
                  <span className="text-[11px] font-black text-slate-200 uppercase tracking-[0.2em]">{boostingGold.progress} of 12 Nodes Synchronized</span>
                </div>
                <div className="h-3 w-full bg-black/60 rounded-full overflow-hidden p-[2px] border border-white/10 shadow-inner">
                  <div className="h-full bg-gradient-to-r from-amber-700 via-amber-500 to-yellow-400 rounded-full shadow-[0_0_20px_rgba(245,158,11,0.6)] transition-all duration-1000" style={{ width: `${(boostingGold.progress / 12) * 100}%` }}></div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Queue Position</span>
                    <span className="text-sm font-black text-white italic">#{boostingGold.position || 0}</span>
                  </div>
                  <div className="flex flex-col border-l border-white/10 pl-6">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Next Payout</span>
                    <span className="text-sm font-black text-amber-400 italic">{12 - boostingGold.progress} Nodes Left</span>
                  </div>
                </div>
              </div>

              <div className="w-full md:w-64 p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
                <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Activity size={10} className="text-emerald-400" />
                  Live Network Activity
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center bg-white/5 p-2 rounded-lg">
                    <span className="text-[8px] font-black text-slate-500 uppercase italic">ID #6281 Joined</span>
                    <span className="text-[8px] font-mono text-emerald-400">+1 NODE</span>
                  </div>
                  <div className="flex justify-between items-center bg-white/5 p-2 rounded-lg">
                    <span className="text-[8px] font-black text-slate-500 uppercase italic">ID #9902 Joined</span>
                    <span className="text-[8px] font-mono text-emerald-400">+1 NODE</span>
                  </div>
                  <div className="flex-1 pt-2">
                    <p className="text-[8px] leading-relaxed text-slate-600 font-medium">
                      * Global Boosting follows a 1:12 synchronization protocol. Every 12 new network entries globally advance the progress of the current pending node holders.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* PERSONAL TRANSACTION LEDGER */}
        <div className="relative group !mt-4">
          <div className="relative glass-card p-6 rounded-3xl border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 via-obsidian to-black overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_10px_#22d3ee]"></div>
                <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">Transaction Ledger</span>
              </div>
              <div className="px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20">
                <span className="text-[8px] font-black text-cyan-400 uppercase tracking-widest">Personal History</span>
              </div>
            </div>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {transactions.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">No protocol activity detected</p>
                </div>
              ) : (
                [...transactions].sort((a,b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 group/activity hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all duration-300">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center group-hover/activity:scale-110 transition-transform ${
                        tx.amount >= 0
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {tx.type === 'deposit' && <ArrowDownCircle size={16} />}
                        {tx.type === 'withdraw' && <ArrowUpCircle size={16} />}
                        {(tx.type.includes('income') || tx.type === 'roi') && <Zap size={16} />}
                        {tx.type === 'spin' && <Zap size={16} />}
                      </div>
                      <div>
                        <p className="text-[11px] font-black text-white italic tracking-tighter">{tx.description || tx.type.toUpperCase()}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                          {tx.amount >= 0 ? 'SYST_CREDIT' : 'SYST_DEBIT'} 
                          <span className={tx.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                            {tx.amount >= 0 ? ' + ' : ' - '}
                            ${Math.abs(Number(tx.amount)).toFixed(2)}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block">
                        {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : 'N/A'}
                      </span>
                      <span className="text-[7px] font-bold text-slate-700 uppercase block tracking-tighter">
                        {tx.created_at ? new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            {/* DECORATIVE ELEMENTS */}
            <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-cyan-500/5 blur-3xl rounded-full"></div>
          </div>
        </div>

        {/* INVITE LINK BOX - SLEEK & ACCESSIBLE */}
        <div className="relative group !mt-4">
          <div className="relative glass-card p-6 rounded-3xl border-electric/20 bg-gradient-to-br from-electric/10 via-obsidian to-black overflow-hidden shadow-2xl">
            <div className="flex flex-col gap-4 relative z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Share2 size={16} className="text-electric" />
                  <span className="text-[10px] font-black text-electric uppercase tracking-widest">Your Referral Link</span>
                </div>
                {copied && (
                  <div className="flex items-center gap-1 text-electric animate-bounce">
                    <Check size={12} />
                    <span className="text-[8px] font-bold uppercase">Copied!</span>
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded-2xl border border-white/5 group-hover:border-electric/30 transition-colors">
                <div className="flex-1 px-3 overflow-hidden">
                  <p className="text-[11px] font-mono text-slate-300 truncate tracking-tight">
                    {referralLink}
                  </p>
                </div>
                <button 
                  onClick={handleCopy}
                  className="bg-electric hover:bg-white text-obsidian p-3 rounded-xl transition-all active:scale-90 shadow-[0_0_15px_rgba(204,255,0,0.3)]"
                >
                  <Copy size={18} />
                </button>
              </div>
              
              <p className="text-[9px] font-medium text-slate-500 italic text-center">
                Share this link to earn direct sponsor rewards and level income!
              </p>
            </div>
            {/* DECORATIVE ELEMENTS */}
            <div className="absolute -top-10 -left-10 w-32 h-32 bg-electric/5 blur-3xl rounded-full"></div>
          </div>
        </div>
      </div>

      {/* SUCCESS MODAL FOR BONUS SPINS */}
      {purchaseSuccessSpins && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-md bg-gradient-to-b from-purple-900/40 via-obsidian to-black border-2 border-electric/40 rounded-[2.5rem] p-8 text-center relative overflow-hidden shadow-[0_0_50px_rgba(0,229,255,0.2)]"
          >
            {/* GLOW DECORATIONS */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-electric/10 blur-3xl rounded-full pointer-events-none"></div>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-purple-500/10 blur-3xl rounded-full pointer-events-none"></div>

            <div className="relative z-10 flex flex-col items-center">
              {/* Spinner Wheel animation graphic */}
              <div className="relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center mb-6">
                <div className="absolute inset-0 rounded-full border-4 border-dashed border-electric/40 animate-spin-slow"></div>
                <div className="absolute inset-2 rounded-full border-2 border-purple-500/20 animate-spin-slow" style={{ animationDirection: 'reverse' }}></div>
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-purple-600 to-electric flex items-center justify-center shadow-[0_0_20px_rgba(0,229,255,0.5)]">
                  <RefreshCcw size={32} className="text-white animate-spin-slow" />
                </div>
                <div className="absolute -top-1 -right-1 bg-yellow-400 text-obsidian px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow">
                  BONUS!
                </div>
              </div>

              <span className="text-xs font-black text-electric uppercase tracking-[0.3em] mb-2 font-mono">Activation Success</span>
              <h3 className="text-2xl sm:text-3xl font-black text-white uppercase italic tracking-tighter leading-none mb-3">
                {purchaseSuccessSpins.pkgName}
              </h3>
              
              <div className="w-full py-4 px-6 my-4 bg-white/5 border border-white/10 rounded-2xl relative">
                <p className="text-gray-400 text-xs sm:text-sm font-semibold mb-1">Aapko mila hai:</p>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-500 to-yellow-300 italic tracking-tighter animate-pulse">
                    {purchaseSuccessSpins.count}
                  </span>
                  <div className="text-left">
                    <p className="text-sm font-black text-white uppercase italic tracking-tight leading-none">FREE SPINS</p>
                    <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest mt-0.5">Ready to Spin</p>
                  </div>
                </div>
              </div>

              <p className="text-[11px] sm:text-xs text-slate-400 leading-relaxed mb-6 font-medium">
                Safar shubhkamnaon se bhara ho! Abhi Spin Wheel par jao aur cash rewards and prizes jeeto!
              </p>

              <div className="flex flex-col sm:flex-row gap-3 w-full">
                <button
                  onClick={() => {
                    if (onRefreshWallet) onRefreshWallet();
                    setPurchaseSuccessSpins(null);
                    onNavigate?.('spin');
                  }}
                  className="flex-1 bg-electric hover:bg-white text-obsidian font-black uppercase tracking-widest text-xs py-3.5 rounded-2xl transition-all shadow-[0_0_20px_rgba(0,229,255,0.4)] hover:shadow-[0_0_30px_rgba(255,255,255,0.5)] active:scale-95"
                >
                  Go to Spin Wheel ⚡
                </button>
                <button
                  onClick={() => {
                    if (onRefreshWallet) onRefreshWallet();
                    setPurchaseSuccessSpins(null);
                  }}
                  className="px-6 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-black uppercase tracking-widest text-xs py-3.5 rounded-2xl transition-all border border-white/5"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      <style>{`
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .animate-marquee { display: inline-flex; animation: marquee 30s linear infinite; }
      `}</style>
    </div>
  );
};

export default Dashboard;
