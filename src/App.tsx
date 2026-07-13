import React, { useState, useEffect, useCallback } from 'react';
import { User, Wallet } from './types';
import { mockApi } from './lib/mockApi';
import { appwriteService } from './services/appwriteService';
import { BRAND_CONFIG } from './brandConfig';
import { MLM_CONFIG } from './constants';
import { isAppwriteConfigured, client, APPWRITE_CONFIG, getEndpoint, getProjectId } from './lib/appwrite';
import { AlertTriangle, LogOut, LayoutDashboard, Share2, Layers, Repeat, CheckSquare, History, Pickaxe, ShieldAlert, Send, Download, Smartphone, X } from 'lucide-react';

import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Sidebar from './components/Sidebar';
import MatrixTree from './pages/MatrixTree';
import Exchanger from './pages/Exchanger';
import IncomeDetails from './pages/IncomeDetails';
import Leaderboard from './pages/Leaderboard';
import RankRewards from './pages/RankRewards';
import AdminPanel from './pages/AdminPanel';
import SpinWheel from './pages/SpinWheel';
import ResetPassword from './pages/ResetPassword';

const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if app is already inside standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone 
      || document.referrer?.includes('android-app://');
    
    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // Capture standard install trigger
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Detect iOS to show helpful direct Share tips
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /ipad|iphone|ipod/.test(userAgent) && !(window as any).MSStream;
    setIsIos(isIosDevice);

    // If on iOS and not standalone, show the instruction prompt after a short delay
    if (isIosDevice && !isStandalone) {
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
      return () => clearTimeout(timer);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);
    
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  if (isInstalled) return null;
  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-[9999]">
      <div className="relative p-5 rounded-3xl bg-black/90 backdrop-blur-xl border border-cyan-500/30 shadow-[0_0_30px_rgba(0,240,255,0.2)] overflow-hidden">
        {/* Background ambient glow */}
        <div className="absolute -right-10 -top-10 w-32 h-32 bg-cyan-500/20 rounded-full blur-2xl pointer-events-none"></div>
        <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none"></div>

        <button 
          onClick={() => setShowPrompt(false)}
          className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-all"
        >
          <X size={16} />
        </button>

        <div className="flex gap-4 items-start">
          <div className="p-3 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl shadow-lg border border-cyan-400/30 flex-shrink-0 animate-pulse">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="w-8 h-8 text-white filter drop-shadow">
              <polygon points="256,48 436,152 436,360 256,464 76,360 76,152" fill="none" stroke="currentColor" strokeWidth="24" />
              <path d="M256,120 A136,136 0 1,1 120,256" fill="none" stroke="currentColor" strokeWidth="24" strokeLinecap="round" />
              <circle cx="256" cy="256" r="32" fill="currentColor" />
            </svg>
          </div>

          <div className="space-y-1">
            <h4 className="text-sm font-black text-white tracking-wide uppercase">
              Cryptospiral Web App
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed font-semibold">
              Apne smartphone par standard software ki trah install karke chalayein!
            </p>
            <p className="text-[10px] text-emerald-400 font-bold tracking-tight uppercase flex items-center gap-1 mt-1">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
              Fast Loading • Direct Access • Mobile Friendly
            </p>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-white/5 flex flex-col gap-2">
          {isIos ? (
            <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-xl p-2.5 text-[11px] text-cyan-300 space-y-1 font-semibold leading-relaxed">
              <p className="flex items-center gap-1 text-white font-bold mb-1">
                <span>🍎 iOS Users (Safari Browser):</span>
              </p>
              <p>
                1. Tap karein <span className="underline font-bold px-1 py-0.5 bg-white/10 rounded">Share 🗎</span> (bottom menu me).
              </p>
              <p>
                2. Phir select karein <span className="underline font-bold px-1 py-0.5 bg-white/10 rounded">Add to Home Screen ⊕</span> option.
              </p>
            </div>
          ) : (
            <button
              onClick={handleInstallClick}
              disabled={!deferredPrompt}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-500 to-amber-500 hover:from-cyan-400 hover:to-amber-400 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 active:scale-95 transition-all text-center flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download size={14} />
              Install Application (Click here)
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper to get a stable deterministic rank for any given user ID or email
const generateUserRank = (userId: string, email?: string): number => {
  const seed = userId || email || 'default_seed';
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Map nicely to a rank, e.g., between 48 and 385
  const minRank = 48;
  const maxRank = 385;
  const range = maxRank - minRank + 1;
  return minRank + (Math.abs(hash) % range);
};

const App: React.FC = () => {
  const [isLive] = useState(isAppwriteConfigured());
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const checkConnection = useCallback(async () => {
    if (isLive) {
      try {
        await mockApi.auth.getCurrentUser();
        setConnectionError(null);
      } catch (e: any) {
        if (e.message?.includes('Failed to fetch') || e.message?.includes('Network Error') || e.message?.includes('Could not connect')) {
          setConnectionError("Cannot reach backend server. Please check connection.");
        } else {
          setConnectionError(null);
        }
      }
    }
  }, [isLive]);

  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 120000);
    return () => clearInterval(interval);
  }, [checkConnection]);

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('spiral_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);
  const [initTimeoutReached, setInitTimeoutReached] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setInitTimeoutReached(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);
  const [activeTab, setActiveTab] = useState('wallet');
  const [exchangerSubTab, setExchangerSubTab] = useState<'topup' | 'withdraw'>('topup');
  const [wallet, setWallet] = useState<Wallet>({ id: '', user_id: '', balance: 0, total_earned: 0, total_withdrawn: 0 });
  const [liveBalance, setLiveBalance] = useState(0);
  const [liveWalletROI, setLiveWalletROI] = useState(0);
  const [walletRoi, setWalletRoi] = useState(0.002); // Default 0.2%
  const [telegramLink, setTelegramLink] = useState('https://t.me/protocol_official');
  const [pendingDeduction, setPendingDeduction] = useState(0);

  const handleOptimisticPurchase = useCallback((price: number) => {
    // Update local wallet balance immediately
    setPendingDeduction(prev => prev + price);
    setWallet(prev => {
      const upgradeBal = Number(prev.upgradeBalance !== undefined ? prev.upgradeBalance : (prev.upgrade_balance !== undefined ? prev.upgrade_balance : 0));
      const balance = Number(prev.balance || 0);
      const deductFromUpgrade = Math.min(price, upgradeBal);
      const deductFromNormal = price - deductFromUpgrade;
      return {
        ...prev,
        upgradeBalance: upgradeBal - deductFromUpgrade,
        upgrade_balance: upgradeBal - deductFromUpgrade,
        balance: balance - deductFromNormal
      };
    });
  }, []);

  const clearPendingDeduction = useCallback((price: number) => {
    setPendingDeduction(prev => Math.max(0, prev - price));
  }, []);

  const fetchUserData = useCallback(async (user: User, skipROI: boolean = true) => {
    try {
      const api = isLive ? appwriteService : mockApi.db;
      const authApi = isLive ? appwriteService : mockApi.auth;
      const lookupId = user.user_id || user.id;

      if (!skipROI) {
        if (isLive) {
          try {
            await appwriteService.distributeROI(lookupId);
          } catch (err) {
            console.error("ROI Distribution failed", err);
          }
        } else {
          try {
            await mockApi.db.distributeROI(user.id);
          } catch (err) {
            console.error("ROI Distribution failed", err);
          }
        }
      }

      const [walletData, freshUser, settings] = await Promise.all([
        api.getWallet(lookupId),
        authApi.getCurrentUser(),
        api.getSettings() as any
      ]);
      
      if (walletData) {
        setWallet(walletData);
      }
      if (settings?.telegram_link) setTelegramLink(settings.telegram_link);
      if (settings?.wallet_roi !== undefined) setWalletRoi(settings.wallet_roi / 100);
      if (freshUser) {
        if (freshUser.email === 'test@test.com') {
          freshUser.role = 'admin';
        }
        // In live mode, we use a deterministic stable rank based on user identity
        const rank = isLive ? (freshUser.global_rank || generateUserRank(freshUser.user_id || freshUser.id || freshUser.email || '')) : await mockApi.db.getGlobalRank(freshUser.id);
        const updatedUser = { ...freshUser, global_rank: rank };
        setCurrentUser(updatedUser);
        localStorage.setItem('spiral_user', JSON.stringify(updatedUser));
      } else if (isLive && currentUser) {
        // Active Appwrite session expired or was deleted under the hood. Force gentle session clear.
        console.warn("[App] Active Appwrite session is missing/expired. Clearing local session state.");
        setCurrentUser(null);
        localStorage.removeItem('spiral_user');
        setWallet({ id: '', user_id: '', balance: 0, total_earned: 0, total_withdrawn: 0 });
        setActiveTab('wallet');
      }
    } catch (e: any) {
      console.error("[fetchUserData error]:", e);
      // If we are in live mode and we failed due to Appwrite (e.g. unauthorized / database not found / security rules),
      // we should clear the local state so the user is forced to make a fresh registration/login.
      if (isLive && currentUser) {
        const errorMsg = String(e.message || e).toLowerCase();
        if (
          errorMsg.includes('unauthorized') || 
          errorMsg.includes('missing') || 
          errorMsg.includes('not found') || 
          errorMsg.includes('database with the requested id') || 
          errorMsg.includes('could not be found') ||
          errorMsg.includes('permission') ||
          errorMsg.includes('user_unauthorized')
        ) {
          console.warn("[App] Active Appwrite session is missing or invalid. Clearing stale local session.");
          setCurrentUser(null);
          localStorage.removeItem('spiral_user');
          setWallet({ id: '', user_id: '', balance: 0, total_earned: 0, total_withdrawn: 0 });
          setActiveTab('wallet');
        }
      }
    } finally {
      setLoading(false);
    }
  }, [isLive]);

  // Sync effective balance whenever wallet changes
  useEffect(() => {
    let ticker: any;
    
    // Initial sync
    setLiveBalance(wallet.balance || 0);
    setLiveWalletROI(wallet.wallet_roi_earned || 0);

    if (currentUser && wallet.daily_package_roi) {
      const dailyYield = Number(wallet.daily_package_roi || 0);
      const yieldPerSec = dailyYield / 86400;
      
      ticker = setInterval(() => {
        setLiveBalance(prev => prev + yieldPerSec);
        setLiveWalletROI(prev => prev + yieldPerSec);
      }, 1000);
    }

    return () => {
      if (ticker) clearInterval(ticker);
    };
  }, [wallet.balance, wallet.wallet_roi_earned, wallet.daily_package_roi, currentUser]);

  useEffect(() => {
    if (!currentUser?.$id && !currentUser?.user_id && !currentUser?.id) return;
    if (!isLive) return;

    const lookupId = currentUser.user_id || currentUser.id || currentUser.$id;
    
    try {
      // 1. Subscribe to wallet changes
      const walletChannel = `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.collections.wallets}.documents`;
      const unsubWallet = client.subscribe(walletChannel, (response) => {
        const payload = response.payload as any;
        if (payload.user_id === lookupId || payload.user_id === currentUser.$id || payload.user_id === currentUser.user_id) {
          const newBalance = Number(payload.balance);
          if (!isNaN(newBalance)) {
            setWallet(prev => ({
              ...prev,
              ...payload,
              balance: newBalance,
              id: payload.$id
            }));
          }
        }
      });

      // 2. Subscribe to purchase changes (activation)
      const purchaseChannel = `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.collections.purchases}.documents`;
      const unsubPurchase = client.subscribe(purchaseChannel, (response) => {
        const payload = response.payload as any;
        if (payload.user_id === lookupId) {
          fetchUserData(currentUser);
        }
      });

      return () => {
        unsubWallet();
        unsubPurchase();
      };
    } catch (e) {
      console.error("Realtime subscription failed:", e);
    }
  }, [wallet.balance, wallet.wallet_roi_earned, currentUser?.id, currentUser?.user_id, isLive, fetchUserData]);

  // Handle background ROI distribution
  useEffect(() => {
    if (!isLive || !currentUser) return;
    const lookupId = currentUser.user_id || currentUser.id;
    if (!lookupId) return;

    // Run once on mount/login
    appwriteService.distributeROI(lookupId).catch(() => {});

    // Polling is kept at 10 minutes to protect the server and database from excessive load, Since the global backend worker also automatically runs every 10 minutes.
    const roiTimer = setInterval(() => {
      appwriteService.distributeROI(lookupId).catch(() => {});
    }, 600000); 

    return () => clearInterval(roiTimer);
  }, [isLive, currentUser?.id, currentUser?.user_id]);

  useEffect(() => {
    const init = async () => {
      if (isLoggingOut) return;
      if (!currentUser) {
        try {
          const authApi = isLive ? appwriteService : mockApi.auth;
          const user = await authApi.getCurrentUser();
          if (user) {
            if (user.email === 'test@test.com') {
              user.role = 'admin';
            }
            setCurrentUser(user);
            localStorage.setItem('spiral_user', JSON.stringify(user));
            await fetchUserData(user);
            return;
          }
        } catch (e) {
          console.error("Session check failed", e);
        }
        setLoading(false);
        return;
      }
      fetchUserData(currentUser, true);
    };
    init();
    // Appwrite realtime WebSockets are active for wallet/purchase changes, so database changes are pushed instantly in real-time.
    // The background polling interval is set to 5 minutes (300,000 ms) instead of 30 seconds to massively decrease server load.
    const interval = setInterval(() => {
      if (currentUser && !isLoggingOut) fetchUserData(currentUser, true);
    }, 300000);
    return () => clearInterval(interval);
  }, [currentUser?.id, isLoggingOut, fetchUserData]);

  const handleLogin = (user: User) => {
    // Force admin for test user
    if (user.email === 'test@test.com') {
      user.role = 'admin';
    }
    setCurrentUser(user);
    localStorage.setItem('spiral_user', JSON.stringify(user));
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setLoading(true);
    try {
      if (isLive) {
        await appwriteService.logout();
      } else {
        await mockApi.auth.signOut();
      }
      setCurrentUser(null);
      setWallet({ id: '', user_id: '', balance: 0, total_earned: 0, total_withdrawn: 0 });
      setActiveTab('wallet');
      localStorage.removeItem('spiral_user');
      localStorage.removeItem('spiral_admin_user');
      localStorage.removeItem('spiral_admin_token');
    } catch (e) {
      setCurrentUser(null);
      localStorage.removeItem('spiral_user');
      localStorage.removeItem('spiral_admin_user');
      localStorage.removeItem('spiral_admin_token');
    } finally {
      setIsLoggingOut(false);
      setLoading(false);
    }
  };

  const handleReturnToAdmin = () => {
    const adminUser = localStorage.getItem('spiral_admin_user');
    const adminToken = localStorage.getItem('spiral_admin_token');
    
    if (adminUser) {
      localStorage.setItem('spiral_user', adminUser);
    }
    if (adminToken) {
      localStorage.setItem('spiral_auth_token', adminToken);
    } else {
      localStorage.removeItem('spiral_auth_token');
    }
    
    localStorage.removeItem('spiral_admin_user');
    localStorage.removeItem('spiral_admin_token');
    
    window.location.reload();
  };

  const isResetPage = window.location.pathname === '/reset-password';
  if (isResetPage) return <ResetPassword />;

  if (loading && !currentUser) {
    return (
      <div className="min-h-screen bg-obsidian flex flex-col items-center justify-center p-6 text-neon-cyan">
        <div className="relative mb-4">
          <div className="w-20 h-20 border-2 border-neon-cyan/20 rounded-full"></div>
          <div className="absolute inset-0 w-20 h-20 border-2 border-neon-cyan border-t-transparent rounded-full animate-spin"></div>
          <div className="absolute inset-4 bg-neon-cyan/10 rounded-full blur-xl animate-pulse"></div>
        </div>
        <span className="font-black uppercase tracking-[0.5em] text-[10px] animate-pulse mb-2">Syncing with Mainframe...</span>
        
        {initTimeoutReached && (
          <div className="max-w-md w-full bg-slate-900/90 border border-red-500/30 rounded-xl p-6 mt-4 shadow-2xl backdrop-blur-md text-slate-300">
            <h3 className="text-red-400 font-bold uppercase tracking-wider text-sm flex items-center gap-2 mb-3">
              <ShieldAlert className="w-5 h-5 text-red-500" />
              Connection Diagnostics
            </h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Establishing a secure connection with the Mainframe network is taking longer than expected. Please check your internet connection and try again.
            </p>
            
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  window.location.reload();
                }}
                className="w-full bg-neon-cyan/20 hover:bg-neon-cyan/30 text-neon-cyan border border-neon-cyan/50 py-2.5 px-4 rounded-lg font-mono font-bold text-xs transition-all tracking-wider text-center cursor-pointer"
              >
                [ RETRY CONNECTION ]
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem('spiral_user');
                  window.location.reload();
                }}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-2.5 px-4 rounded-lg font-mono font-bold text-xs transition-all tracking-wider text-center cursor-pointer"
              >
                [ RESET SESSION ]
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!currentUser) return <Login onLogin={handleLogin} />;

  const isUserAdmin = currentUser.role?.toLowerCase() === 'admin';

  const navigateToExchanger = (subTab: 'topup' | 'withdraw') => {
    setExchangerSubTab(subTab);
    setActiveTab('exchanger');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'mining':
      case 'wallet': return <Dashboard user={currentUser} wallet={wallet} onExchangerNav={navigateToExchanger} onNavigate={setActiveTab} isLive={isLive} liveBalance={liveBalance} liveWalletROI={liveWalletROI} onRefreshWallet={() => fetchUserData(currentUser)} onOptimisticPurchase={handleOptimisticPurchase} onClearOptimisticPurchase={clearPendingDeduction} />;
      case 'matrix': return <MatrixTree user={currentUser} />;
      case 'exchanger': return <Exchanger user={currentUser} wallet={wallet} initialSubTab={exchangerSubTab} onRefreshWallet={() => fetchUserData(currentUser)} />;
      case 'income': return <IncomeDetails user={currentUser} wallet={wallet} />;
      case 'leaderboard': return <Leaderboard user={currentUser} />;
      case 'rewards': return <RankRewards user={currentUser} />;
      case 'spin': return (
        <SpinWheel 
          user={currentUser} 
          wallet={wallet} 
          onRefreshWallet={(val) => {
            if (val) {
              setWallet(prev => ({
                ...prev,
                ...val,
                id: val.$id || val.id || prev.id
              }));
            } else {
              fetchUserData(currentUser, true);
            }
          }} 
          onOptimisticPurchase={handleOptimisticPurchase} 
        />
      );
      case 'admin': return isUserAdmin ? <AdminPanel user={currentUser} onLogout={handleLogout} /> : <Dashboard user={currentUser} wallet={wallet} onExchangerNav={navigateToExchanger} onNavigate={setActiveTab} isLive={isLive} liveBalance={liveBalance} liveWalletROI={liveWalletROI} onRefreshWallet={() => fetchUserData(currentUser)} onOptimisticPurchase={handleOptimisticPurchase} />;
      default: return <Dashboard user={currentUser} wallet={wallet} onExchangerNav={navigateToExchanger} onNavigate={setActiveTab} isLive={isLive} liveBalance={liveBalance} liveWalletROI={liveWalletROI} onRefreshWallet={() => fetchUserData(currentUser)} onOptimisticPurchase={handleOptimisticPurchase} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-obsidian text-white font-sans overflow-hidden selection:bg-neon-cyan selection:text-obsidian">
      {/* BACKGROUND GLOWS */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="bg-glow w-[500px] h-[500px] bg-neon-cyan/5 -top-48 -left-48"></div>
        <div className="bg-glow w-[400px] h-[400px] bg-white/5 bottom-0 right-0 delay-1000"></div>
      </div>

      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} userRole={currentUser.role as any} onLogout={handleLogout} />
      
      <main className="flex-1 flex flex-col relative overflow-y-auto z-10">
        {localStorage.getItem('spiral_admin_user') && (
          <div className="bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-black px-6 py-2.5 text-center text-[10px] font-black uppercase tracking-widest flex flex-wrap items-center justify-center gap-3 z-50 shadow-[0_4px_25px_rgba(245,158,11,0.25)] select-none border-b border-amber-600/20">
            <ShieldAlert size={14} className="animate-pulse text-black" />
            <span>ADMINISTRATOR MODE: Currently Impersonating <span className="underline font-mono text-xs">{currentUser.name || currentUser.email}</span></span>
            <button 
              onClick={handleReturnToAdmin}
              className="px-3 py-1.5 bg-black hover:bg-neutral-900 text-amber-400 hover:text-white font-mono text-[9px] font-black tracking-wider rounded-lg border border-amber-400 transition-all active:scale-95 cursor-pointer shadow-md"
            >
              [ RETURN TO ADMIN PANEL ]
            </button>
          </div>
        )}

        {connectionError && (
          <div className="bg-red-500/10 border-b border-red-500/20 p-2 text-center text-[10px] font-black uppercase tracking-widest text-red-400 flex items-center justify-center gap-2 z-50 backdrop-blur-md">
            <AlertTriangle size={12} />
            <span>{connectionError}</span>
          </div>
        )}
        
        <header className="sticky top-0 z-40 bg-obsidian/60 backdrop-blur-2xl border-b border-white/5 px-6 py-5 flex justify-between items-center">
          <h1 className="text-2xl font-black italic uppercase tracking-tighter flex items-center gap-2">
            <span className="bg-gradient-to-r from-cyan-400 via-white to-blue-500 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(34,211,238,0.3)]">
              Cryptospiral
            </span>
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]"></div>
          </h1>
          
          <div className="flex items-center gap-4">
            {/* UNIQUE TELEGRAM BUTTON */}
            <a 
              href={telegramLink} 
              target="_blank" 
              rel="noopener noreferrer"
              className="relative group"
            >
              <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-2xl blur opacity-20 group-hover:opacity-60 transition duration-500"></div>
              <div className="relative p-3 rounded-2xl bg-obsidian border border-white/10 text-cyan-400 group-hover:border-cyan-500/50 group-hover:text-white transition-all duration-500 flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <Send size={20} className="relative z-10 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform duration-500" />
              </div>
            </a>

            {/* UNIQUE LOGOUT BUTTON */}
            <button 
              onClick={handleLogout} 
              className="relative group"
            >
              <div className="absolute -inset-1 bg-gradient-to-r from-red-600 to-rose-700 rounded-2xl blur opacity-10 group-hover:opacity-40 transition duration-500"></div>
              <div className="relative p-3 rounded-2xl bg-obsidian border border-white/10 text-slate-500 group-hover:border-red-500/50 group-hover:text-red-500 transition-all duration-500 flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <LogOut size={20} className="relative z-10 group-hover:rotate-12 transition-transform duration-500" />
              </div>
            </button>
          </div>
        </header>

        <div className="p-4 sm:p-6 md:p-8 pb-12 max-w-7xl mx-auto w-full">
          {renderContent()}
        </div>
        
        <InstallPrompt />
      </main>
    </div>
  );
};

export default App;
