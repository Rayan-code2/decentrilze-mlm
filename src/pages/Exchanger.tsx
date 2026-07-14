import React, { useState, useEffect } from 'react';
import { User, Wallet, Settings, ExchangerRequest } from '../types';
import { mockApi } from '../lib/mockApi';
import { appwriteService } from '../services/appwriteService';
import { isAppwriteConfigured } from '../lib/appwrite';
import { 
  ArrowDownCircle, ArrowUpCircle, 
  Wallet as WalletIcon, Info, AlertCircle, 
  CheckCircle2, Copy, RefreshCcw,
  ChevronRight
} from 'lucide-react';
import { motion } from 'motion/react';

interface ExchangerProps {
  user: User;
  wallet: Wallet;
  initialSubTab?: 'topup' | 'withdraw';
  onRefreshWallet?: () => void;
}

const Exchanger: React.FC<ExchangerProps> = ({ user, wallet, initialSubTab = 'topup', onRefreshWallet }) => {
  const [activeTab, setActiveTab] = useState<'topup' | 'withdraw'>(initialSubTab);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [amount, setAmount] = useState('');
  const [utr, setUtr] = useState('');
  const [address, setAddress] = useState('');
  const [network, setNetwork] = useState('TRC20');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [history, setHistory] = useState<ExchangerRequest[]>([]);
  const [hasUnlockedAll, setHasUnlockedAll] = useState(false);

  const safeFormatDate = (rawDate: any): string => {
    try {
      if (!rawDate) return 'Pending Sync';
      const d = new Date(rawDate);
      if (isNaN(d.getTime())) return 'Pending Sync';
      return d.toLocaleDateString();
    } catch {
      return 'Pending Sync';
    }
  };

  const safeFormatTime = (rawDate: any): string => {
    try {
      if (!rawDate) return '';
      const d = new Date(rawDate);
      if (isNaN(d.getTime())) return '';
      return ' at ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const fetchData = async () => {
    try {
      const isLive = isAppwriteConfigured();
      const api = isLive ? appwriteService : mockApi.db;
      
      const uId = user.user_id || user.id || (user as any).$id;
      const [settingsData, historyData, packagesList, userPurchases] = await Promise.all([
        api.getSettings(),
        api.getExchangerRequests(uId),
        api.getPackages(),
        api.getUserPurchases(uId)
      ]);
      
      if (!settingsData) {
        console.warn("Using fallback settings for Exchanger");
        const fallback = await mockApi.db.getSettings();
        setSettings(fallback as any);
      } else {
        setSettings(settingsData as any);
      }
      
      const mappedHistory = (historyData || []).map((r: any) => ({
        ...r,
        user_id: r.user_id || r.userId,
        utr_number: r.utr_number || r.utrNumber,
        inr_amount: r.inr_amount || r.inrAmount,
        created_at: r.created_at || r.createdAt,
      }));
      setHistory(mappedHistory);

      // Determine if user has the active 40$ package (the final package)
      const unlockedAll = (userPurchases || []).some((p: any) => {
        const isActive = p.is_active !== undefined ? p.is_active : p.isActive;
        const matchingPkg = (packagesList || []).find((pkg: any) => String(pkg.id) === String(p.package_id || p.packageId));
        const price = matchingPkg ? matchingPkg.price : (p.price !== undefined ? p.price : (p.amount !== undefined ? p.amount : 0));
        return (isActive === true || isActive === 1) && Math.round(Number(price)) === 40;
      });
      setHasUnlockedAll(unlockedAll);

      // Auto-redirect if current tab is disabled, only switch if the alternate is actually active to prevent ping-pong loop!
      const finalSettings = settingsData || await mockApi.db.getSettings();
      if (finalSettings) {
        const s = finalSettings as any;
        if (activeTab === 'topup' && s.enable_deposit === false && s.enable_withdrawal !== false) {
          setActiveTab('withdraw');
        } else if (activeTab === 'withdraw' && s.enable_withdrawal === false && s.enable_deposit !== false) {
          setActiveTab('topup');
        }
      }
    } catch (e) {
      console.error("Error fetching data:", e);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab, user.id]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setStatusMsg({ type: 'error', message: 'Please enter a valid amount' });
      return;
    }

    if (activeTab === 'topup' && (!utr || !utr.trim())) {
      setStatusMsg({ type: 'error', message: 'Please enter the transaction reference (UTR/HASH)' });
      return;
    }

    if (activeTab === 'withdraw' && (!address || !address.trim())) {
      setStatusMsg({ type: 'error', message: 'Please enter your wallet address' });
      return;
    }

    setLoading(true);
    try {
      const isLive = isAppwriteConfigured();
      const api = isLive ? appwriteService : mockApi.db;

      const typeMap: Record<string, 'deposit' | 'withdraw'> = {
        topup: 'deposit',
        withdraw: 'withdraw',
      };

      const requestType = typeMap[activeTab] || 'deposit';

      if (requestType === 'withdraw') {
        const minWithdrawal = Number(settings?.min_withdrawal || 0);
        if (Number(amount) < minWithdrawal) {
          setStatusMsg({ type: 'error', message: `Minimum withdrawal is $${minWithdrawal}` });
          setLoading(false);
          return;
        }
        if (Number(amount) > wallet.balance) {
          setStatusMsg({ type: 'error', message: 'Insufficient balance' });
          setLoading(false);
          return;
        }
      }

      const currentAddress = requestType === 'deposit' 
        ? (network === 'TRC20' 
            ? settings?.admin_address_trc20 
            : network === 'BEP20' 
              ? settings?.admin_address_bep20 
              : settings?.admin_address_erc20)
        : address;

      const res = await api.createExchangerRequest({
        user_id: user.id || user.user_id || (user as any).uid || (user as any).$id || '',
        amount: Number(amount),
        type: requestType,
        utr_number: utr || '',
        address: currentAddress || '',
        network: requestType === 'withdraw' ? 'BEP20' : network,
      });

      if (res.success) {
        let successMessage = res.message || 'Protocol Synchronized! Our validators are verifying the block.';
        if (requestType === 'deposit') {
          successMessage = 'Deposit request submitted successfully! Your balance will be updated within 1 hour.';
        } else if (requestType === 'withdraw') {
          successMessage = 'Withdrawal request submitted successfully! Your funds will be credited to your wallet within 6 hours.';
        }
          
        setStatusMsg({ type: 'success', message: successMessage });
        setAmount('');
        setUtr('');
        setAddress('');
        if (onRefreshWallet) onRefreshWallet();
        setTimeout(() => fetchData(), 1000); 
      } else {
        console.error("Exchanger Server Error:", res);
        setStatusMsg({ type: 'error', message: res.message || 'Execution Error. Please verify your reference (UTR/HASH) and retry.' });
      }
    } catch (e: any) {
      console.error("Exchanger Network Fault:", e);
      setStatusMsg({ type: 'error', message: 'CONNECTION_FAULT: ' + (e.message || 'Unknown network error') });
    } finally {
      setLoading(false);
      const delay = (activeTab === 'topup' || activeTab === 'withdraw') ? 18000 : 8000;
      setTimeout(() => setStatusMsg(null), delay);
    }
  };

  const renderTopup = () => (
    <div className="space-y-6">
      {/* DEPOSIT COMMAND CENTER */}
      <div className="relative group overflow-hidden rounded-[2rem] p-[1px] bg-gradient-to-br from-electric/40 via-white/5 to-transparent shadow-2xl">
        <div className="relative bg-obsidian/95 backdrop-blur-3xl p-5 sm:p-8 rounded-[2rem] space-y-6 cyber-grid">
          <div className="absolute top-0 right-0 w-48 h-48 bg-electric/10 blur-[100px] rounded-full -mr-24 -mt-24 pointer-events-none"></div>
          
          <div className="flex items-center gap-4 sm:gap-5 relative z-10">
            <div className={`w-12 sm:w-14 h-12 sm:h-14 rounded-2xl bg-electric/10 border border-electric/20 flex items-center justify-center text-electric shadow-[0_0_30px_rgba(204,255,0,0.15)]`}>
              <ArrowDownCircle size={24} className="animate-bounce" />
            </div>
            <div>
              <p className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-0.5 sm:mb-1">Inbound Protocol</p>
              <h4 className="text-xl sm:text-2xl font-black text-white italic uppercase tracking-tighter">USDT <span className="text-electric">Forge</span></h4>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">
            <div className="space-y-4">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] ml-2">Channel Selection</label>
              <div className="flex gap-2">
                {['TRC20', 'BEP20', 'ERC20'].map((net) => (
                  <button
                    key={net}
                    onClick={() => setNetwork(net)}
                    className={`flex-1 py-2.5 sm:py-3 rounded-xl border text-[9px] sm:text-[10px] font-black transition-all duration-500 ${
                      network === net 
                        ? 'bg-electric border-electric text-black shadow-[0_0_20px_rgba(204,255,0,0.3)]' 
                        : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                    }`}
                  >
                    {net}
                  </button>
                ))}
              </div>

              {(() => {
                const currentAddress = network === 'TRC20'
                  ? settings?.admin_address_trc20
                  : network === 'BEP20' 
                    ? settings?.admin_address_bep20 
                    : settings?.admin_address_erc20;
                
                return (
                  <div className="bg-black/40 p-4 sm:p-5 rounded-2xl border border-white/10 flex items-center justify-between group/addr hover:border-electric/40 transition-all cursor-pointer" onClick={() => handleCopy(currentAddress || '', network)}>
                    <div className="space-y-0.5 sm:space-y-1 overflow-hidden">
                      <span className="text-[7px] sm:text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none block mb-1">{network} NODE ADDRESS</span>
                      <p className="font-mono text-[9px] sm:text-[10px] text-electric truncate pr-4 uppercase tracking-tighter">{currentAddress || 'NOT CONFIGURED'}</p>
                    </div>
                    <button className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/5 text-slate-400 flex items-center justify-center group-hover/addr:bg-electric group-hover/addr:text-black transition-all active:scale-90 flex-shrink-0">
                      {copied === network ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                );
              })()}
            </div>

            <div className="bg-white/5 border border-white/5 p-5 sm:p-6 rounded-3xl space-y-4">
              <div className="flex items-center gap-2">
                <Info size={14} className="text-slate-500" />
                <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Protocol Rules</span>
              </div>
              <div className="space-y-2.5 sm:space-y-3">
                {[
                  "Initialize transfer from your wallet",
                  "Sync via HASH or UTR number",
                  "Wait for node confirmation"
                ].map((step, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="text-[10px] font-black text-electric/40">0{i+1}</span>
                    <span className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase leading-relaxed">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-6 relative z-10">
        <div className="space-y-3">
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] ml-4" htmlFor="amount-input">Volume Intent</label>
          <div className="relative group/input">
            <div className="absolute inset-x-4 inset-y-1 bg-electric/20 blur opacity-0 group-focus-within/input:opacity-100 transition duration-500"></div>
            <input 
              id="amount-input"
              type="number" 
              placeholder="0.00 USDT"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="relative w-full bg-black/60 border border-white/10 rounded-full px-6 sm:px-8 py-5 sm:py-6 text-lg sm:text-xl font-black text-white italic placeholder:text-slate-800 outline-none focus:border-electric/50 transition-all shadow-inner"
            />
            {amount && (
              <div className="absolute -bottom-9 sm:-bottom-10 left-4 sm:left-6 right-4 sm:right-6 flex justify-between items-center bg-electric/5 border border-electric/10 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl animate-in fade-in slide-in-from-top-2">
                <span className="text-[7px] sm:text-[8px] font-black text-slate-500 uppercase">After Protocol Fee</span>
                <span className="text-[10px] sm:text-xs font-black text-electric">${(Number(amount) * (1 - (settings?.deposit_fee || 0) / 100)).toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] ml-4" htmlFor="utr-input">Sync Reference (HASH)</label>
          <input 
            id="utr-input"
            type="text" 
            placeholder="PASTE PROTOCOL PROOF"
            value={utr}
            onChange={(e) => setUtr(e.target.value)}
            className="w-full bg-black/60 border border-white/10 rounded-full px-6 sm:px-8 py-5 sm:py-6 text-[9px] sm:text-[10px] font-mono font-bold text-white uppercase tracking-[0.2em] placeholder:text-slate-800 outline-none focus:border-electric/50 transition-all shadow-inner"
          />
        </div>

        <button 
          type="submit" 
          disabled={loading || !amount || Number(amount) <= 0 || !utr || !utr.trim()}
          className="sm:col-span-2 py-5 sm:py-6 rounded-full bg-white/5 border border-white/10 text-white font-black uppercase tracking-[0.4em] text-[10px] sm:text-xs hover:bg-electric hover:text-black hover:shadow-[0_0_40px_rgba(204,255,0,0.3)] transition-all duration-500 active:scale-95 mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Initializing Inbound Link...' : 'Confirm System Sync'}
        </button>
      </form>
    </div>
  );

  const withdrawalFee = settings?.withdrawal_fee ?? 5;

  const renderWithdraw = () => (
    <div className="space-y-6">
      {/* WITHDRAW COMMAND CENTER */}
      <div className="relative group overflow-hidden rounded-[2rem] p-[1px] bg-gradient-to-br from-red-500/40 via-white/5 to-transparent shadow-2xl">
        <div className="relative bg-obsidian/95 backdrop-blur-3xl p-5 sm:p-8 rounded-[2rem] space-y-6 cyber-grid">
          <div className="absolute top-0 right-0 w-48 h-48 bg-red-500/10 blur-[100px] rounded-full -mr-24 -mt-24 pointer-events-none"></div>
          
          <div className="flex items-center gap-4 sm:gap-5 relative z-10">
            <div className="w-12 sm:w-14 h-12 sm:h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.15)]">
              <ArrowUpCircle size={24} className="animate-pulse" />
            </div>
            <div>
              <p className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-0.5 sm:mb-1">Outbound Protocol</p>
              <h4 className="text-xl sm:text-2xl font-black text-white italic uppercase tracking-tighter">Settlement <span className="text-red-500">Exit</span></h4>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">
            <div className="bg-black/40 border border-white/5 p-4 sm:p-5 rounded-[1.5rem] sm:rounded-3xl group/tier overflow-hidden relative">
              <div className="absolute inset-0 bg-red-500/5 translate-y-full group-hover:translate-y-0 transition-transform duration-700"></div>
              <p className="text-[7px] sm:text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1 relative z-10">Global Protocol Fee</p>
              <div className="flex items-baseline gap-1.5 sm:gap-2 relative z-10">
                <span className="text-2xl sm:text-4xl font-black text-red-500 italic leading-none">{withdrawalFee}%</span>
                <span className="text-[7px] sm:text-[8px] font-black text-slate-600 uppercase tracking-widest italic">Standard Commission</span>
              </div>
            </div>
            <div className="bg-black/40 border border-white/5 p-4 sm:p-5 rounded-[1.5rem] sm:rounded-3xl group/tier overflow-hidden relative">
              <div className="absolute inset-0 bg-red-500/5 translate-y-full group-hover:translate-y-0 transition-transform duration-700"></div>
              <p className="text-[7px] sm:text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1 relative z-10">Target Network</p>
              <div className="flex items-baseline gap-1.5 sm:gap-2 relative z-10">
                <span className="text-2xl sm:text-4xl font-black text-red-500 italic leading-none">BEP20</span>
                <span className="text-[7px] sm:text-[8px] font-black text-slate-600 uppercase tracking-widest italic">Binance Smart Chain</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="flex justify-between items-center ml-2 sm:ml-4 mr-2 sm:mr-4">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em]" htmlFor="withdraw-amount">Off-load Vol</label>
              <span className="text-[7px] sm:text-[8px] font-black text-slate-600 uppercase tracking-widest">Cap: ${Number(wallet?.balance || 0).toFixed(2)}</span>
            </div>
            <div className="relative group/input">
              <div className="absolute inset-x-4 inset-y-1 bg-red-500/10 blur opacity-0 group-focus-within/input:opacity-100 transition duration-500"></div>
              <input 
                id="withdraw-amount"
                type="number" 
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="relative w-full bg-black/60 border border-white/10 rounded-full px-6 sm:px-8 py-5 sm:py-6 text-lg sm:text-xl font-black text-white italic outline-none focus:border-red-500/50 transition-all shadow-inner"
              />
              <button 
                type="button"
                onClick={() => setAmount(wallet.balance.toString())}
                className="absolute right-6 sm:right-8 top-1/2 -translate-y-1/2 text-[9px] sm:text-[10px] font-black text-red-500 uppercase hover:text-white transition-colors"
                id="max-intent-btn"
              >
                MAX_INTENT
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] ml-4" htmlFor="address-input">Node Endpoint (ADDRESS)</label>
            <input 
              id="address-input"
              type="text" 
              placeholder="USDT TARGET ADDRESS"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-black/60 border border-white/10 rounded-full px-6 sm:px-8 py-5 sm:py-6 text-[9px] sm:text-[10px] font-mono font-bold text-white uppercase tracking-[0.2em] outline-none focus:border-red-500/50 transition-all shadow-inner"
            />
          </div>
        </div>

        <div className="relative p-6 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border border-dashed border-red-500/20 bg-red-500/[0.03] cyber-grid space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center sm:text-left border-b border-red-500/10 pb-4">
            <div>
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">Requested</span>
              <p className="text-lg font-black text-white italic">${Number(amount || 0).toFixed(2)}</p>
            </div>
            <div>
              <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest block mb-1">
                {hasUnlockedAll ? '0% Upgrade Fund' : '20% Upgrade Fund'}
              </span>
              <p className="text-lg font-black text-amber-500 italic">
                +${(Number(amount || 0) * (hasUnlockedAll ? 0.0 : 0.2)).toFixed(2)}
              </p>
            </div>
            <div>
              <span className="text-[8px] font-black text-red-500/60 uppercase tracking-widest block mb-1">Fee ({withdrawalFee}%)</span>
              <p className="text-lg font-black text-red-500/60 italic">-${(Number(amount || 0) * (withdrawalFee / 100)).toFixed(2)}</p>
            </div>
            <div>
              <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest block mb-1">
                {hasUnlockedAll ? 'Net Dispatched (100%)' : 'Net Dispatched (80%)'}
              </span>
              <p className="text-lg font-black text-emerald-400 italic">
                ${(Number(amount || 0) * (hasUnlockedAll ? 1.0 : 0.8)).toFixed(2)}
              </p>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row justify-between items-center gap-6">
            <div className="space-y-2 text-center sm:text-left">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">Estimated Net Received (Minus Fee)</span>
              <div className="flex items-baseline justify-center sm:justify-start gap-2 sm:gap-3">
                <span className="text-3xl sm:text-5xl font-black text-emerald-400 italic tracking-tighter leading-none">
                  ${Math.max(0, (Number(amount || 0) * ((hasUnlockedAll ? 1.0 : 0.8) - withdrawalFee / 100))).toFixed(2)}
                </span>
                <span className="text-xs sm:text-sm font-black text-emerald-500/60 uppercase">Net</span>
              </div>
            </div>
            <div className="text-center sm:text-right bg-black/40 px-4 sm:px-6 py-3 sm:py-4 rounded-xl sm:rounded-2xl border border-white/5 w-full sm:w-auto">
              <span className="text-[7px] sm:text-[8px] font-black text-amber-500 uppercase tracking-widest block mb-0.5 sm:mb-1">
                {hasUnlockedAll ? 'Reinvestment Exempt' : 'Credited to Upgrade Wallet'}
              </span>
              <p className="text-lg sm:text-xl font-black text-amber-500 italic leading-none text-amber-500">
                {hasUnlockedAll ? 'All Nodes Active' : `+$${(Number(amount || 0) * 0.2).toFixed(2)}`}
              </p>
            </div>
          </div>
        </div>

        <button 
          type="submit" 
          disabled={loading || Number(amount) > wallet.balance || !amount || Number(amount) < Number(settings?.min_withdrawal || 0) || !address || !address.trim()}
          className="w-full py-5 sm:py-6 rounded-full bg-red-600 text-white font-black uppercase tracking-[0.4em] text-[10px] sm:text-xs hover:bg-red-500 hover:shadow-[0_0_50px_rgba(239,68,68,0.4)] transition-all duration-500 active:scale-95 shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Executing Settlement...' : 'Authorize Exit Protocol'}
        </button>
      </form>
    </div>
  );



  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-32 pt-6 px-4">
      {/* PROFESSIONAL HEADER WITH BALANCE CONTEXT */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-4">
        <header>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-6 w-1 bg-electric rounded-full shadow-[0_0_15px_rgba(204,255,0,0.5)]"></div>
            <h1 className="text-3xl sm:text-4xl font-black text-white italic tracking-tighter uppercase leading-none">
              Liquid <span className="text-electric">Forge</span>
            </h1>
          </div>
          <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-[0.4em] ml-4">Advanced Asset Exchange & Settlement</p>
        </header>

        {/* VAULT STATUS CARD */}
        <div className="relative group w-full lg:w-auto">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-electric/20 to-cyan-500/20 blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
          <div className="relative glass-card px-4 sm:px-6 py-3 sm:py-4 rounded-2xl bg-black/40 border border-white/5 flex items-center justify-between sm:justify-start gap-4 sm:gap-6 min-w-full sm:min-w-[340px]">
            <div className="space-y-0.5 sm:space-y-1">
              <p className="text-[7px] sm:text-[8px] font-black text-slate-500 uppercase tracking-widest">Vault Available</p>
              <div className="flex items-baseline gap-2">
                <span className="text-xl sm:text-2xl font-black text-white italic tracking-tighter">${Number(wallet?.balance || 0).toFixed(2)}</span>
                <span className="text-[9px] font-black text-electric/60 uppercase">USDT</span>
              </div>
            </div>
            <div className="h-8 sm:h-10 w-[1px] bg-white/10"></div>
            <div className="space-y-0.5 sm:space-y-1">
              <p className="text-[7px] sm:text-[8px] font-black text-amber-500 uppercase tracking-widest">Upgrade Wallet</p>
              <div className="flex items-baseline gap-2">
                <span className="text-xl sm:text-2xl font-black text-amber-400 italic tracking-tighter">
                  ${wallet.upgradeBalance !== undefined ? parseFloat(Number(wallet.upgradeBalance).toFixed(4)) : (wallet.upgrade_balance !== undefined ? parseFloat(Number(wallet.upgrade_balance).toFixed(4)) : '0.00')}
                </span>
                <span className="text-[9px] font-black text-amber-500/60 uppercase">USDT</span>
              </div>
            </div>
            <div className="h-8 sm:h-10 w-[1px] bg-white/10 hidden xs:block"></div>
            <div className="space-y-0.5 sm:space-y-1 hidden xs:block">
              <p className="text-[7px] sm:text-[8px] font-black text-slate-500 uppercase tracking-widest">Network Status</p>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10B981]"></div>
                <span className="text-[8px] sm:text-[10px] font-black text-emerald-400 uppercase tracking-widest leading-none">Optimized</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SYSTEM STATUS TICKER */}
      <div className="bg-black/60 border border-white/5 p-3 rounded-2xl overflow-hidden relative">
        <div className="absolute left-0 top-0 h-full w-12 bg-gradient-to-r from-black to-transparent z-10"></div>
        <div className="flex items-center gap-6 animate-marquee whitespace-nowrap">
          {[
            "⚡ BEP20_PROTOCOL_LOAD: 0.11ms",
            "🛡️ SECURE_ENCRYPTION_ACTIVE",
            "💎 BLOCK_INDEX: 582,102",
            "🚀 WITHDRAWAL_SETTLEMENT: INSTANT",
            "🔗 BEP20_BRIDGE_OPTIMIZED"
          ].map((status, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-electric"></div>
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* COMMAND TABS */}
      <div className="sticky top-4 z-50 overflow-x-auto no-scrollbar">
        <div className="bg-obsidian/90 backdrop-blur-3xl border border-white/10 rounded-full p-1.5 sm:p-2 shadow-2xl flex gap-1.5 sm:gap-2 ring-1 ring-white/5 w-full sm:max-w-fit mx-auto sm:mx-0 min-w-max">
          {[
            { id: 'topup', label: 'Inbound Forge', icon: <ArrowDownCircle size={18} />, color: 'electric', visible: settings?.enable_deposit !== false },
            { id: 'withdraw', label: 'Outbound Exit', icon: <ArrowUpCircle size={18} />, color: 'red-500', visible: settings?.enable_withdrawal !== false },
          ].filter(tab => tab.visible).map((tab) => (
            <button 
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                setAmount('');
                setUtr('');
                setAddress('');
                setStatusMsg(null);
              }}
              className={`flex items-center gap-2 sm:gap-3 px-6 sm:px-8 py-3 sm:py-4 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all duration-500 whitespace-nowrap relative group flex-1 sm:flex-initial ${
                activeTab === tab.id 
                  ? `bg-white/5 text-white shadow-inner border border-white/10` 
                  : 'text-slate-500 hover:text-white'
              }`}
            >
              {activeTab === tab.id && (
                <div className={`absolute inset-0 rounded-full border-t border-b border-${tab.color}/20 animate-pulse`}></div>
              )}
              <span className={activeTab === tab.id ? `text-${tab.color}` : ''}>{tab.icon}</span>
              {tab.label}
              {activeTab === tab.id && (
                <div className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-1 bg-${tab.color} rounded-full blur-sm`}></div>
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="relative z-10 min-h-[500px]">
        {statusMsg && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-5 rounded-3xl border mb-8 flex items-center gap-4 ${statusMsg.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}
          >
            <div className={`p-2 rounded-xl flex-shrink-0 ${statusMsg.type === 'success' ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
              {statusMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            </div>
            <div className="flex-1 flex flex-col gap-2">
              <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">
                {statusMsg.message}
              </p>
              {(statusMsg.message.toLowerCase().includes('authentication') ||
                statusMsg.message.toLowerCase().includes('session') ||
                statusMsg.message.toLowerCase().includes('unauthorized') ||
                statusMsg.message.toLowerCase().includes('expired')) && (
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('spiral_user');
                    window.location.reload();
                  }}
                  className="mt-2 text-[10px] uppercase font-black tracking-widest px-4 py-2 bg-red-400/20 hover:bg-red-400/40 text-rose-300 rounded-xl transition duration-300 w-fit cursor-pointer border border-red-400/30"
                >
                  Clear Session & Re-Login
                </button>
              )}
            </div>
          </motion.div>
        )}

        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 120 }}
        >
          {activeTab === 'topup' && renderTopup()}
          {activeTab === 'withdraw' && renderWithdraw()}
        </motion.div>
      </main>

      {/* REQUEST HISTORY - UNIQUE PROTOCOL LOG */}
      <section className="space-y-6 pb-20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
          <div className="flex items-center gap-4">
            <div className="w-1.5 h-8 bg-electric rounded-full shadow-[0_0_15px_rgba(204,255,0,0.6)]"></div>
            <div>
              <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">Settlement Ledger</h3>
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em]">Immutable Protocol Sync History</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full backdrop-blur-md">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Global Sync: Online</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {history.length === 0 ? (
            <div className="glass-card p-16 flex flex-col items-center justify-center border-dashed border-white/10 bg-white/[0.01] rounded-[3rem]">
              <div className="w-20 h-20 rounded-[2rem] bg-white/5 flex items-center justify-center text-slate-800 mb-6 border border-white/5 shadow-inner">
                <RefreshCcw size={40} strokeWidth={1} className="animate-spin-slow" />
              </div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] italic text-center">Protocol cycle clean.<br/>no activity detected.</p>
            </div>
          ) : (
            history.map((req, index) => (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                key={req.id} 
                className="relative group overflow-hidden"
              >
                <div className={`absolute -left-1 top-0 bottom-0 w-1 transition-all duration-500 rounded-full ${
                  req.type === 'deposit' ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]'
                }`}></div>
                
                <div className="glass-card p-6 rounded-[2rem] border-white/5 bg-white/[0.02] flex flex-col sm:flex-row items-center justify-between gap-6 group-hover:border-white/20 transition-all cyber-grid">
                  <div className="flex items-center gap-6 w-full sm:w-auto">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all duration-500 group-hover:scale-110 ${
                      req.type === 'deposit' 
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.1)]' 
                        : 'bg-red-500/10 border-red-500/20 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.1)]'
                    }`}>
                      {req.type === 'deposit' ? <ArrowDownCircle size={24} /> : <ArrowUpCircle size={24} />}
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl font-black text-white italic tracking-tighter leading-none">${Number(req.amount || 0).toFixed(2)}</span>
                        <span className={`text-[7px] font-black uppercase px-3 py-1 rounded-full border tracking-widest ${
                          req.status === 'approved' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 
                          req.status === 'rejected' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 
                          'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        }`}>
                          {req.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">
                          {safeFormatDate((req as any).createdAt || req.created_at || Date.now())}{safeFormatTime((req as any).createdAt || req.created_at || Date.now())}
                        </p>
                        {req.network && (
                          <>
                            <div className="w-1.5 h-1.5 rounded-full bg-white/5"></div>
                            <span className="text-[8px] font-black text-electric/70 uppercase tracking-widest font-mono">{req.network}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-12 border-t sm:border-t-0 border-white/5 pt-4 sm:pt-0">
                    <div className="text-center sm:text-right">
                      <p className="text-[7px] font-black text-slate-700 uppercase tracking-widest mb-1">Source Protocol</p>
                      <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-tighter italic">Liquid_V2_{req.type === 'deposit' ? 'IN' : 'OUT'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[7px] font-black text-slate-700 uppercase tracking-widest mb-1">Reference ID</p>
                      <p className="text-[10px] font-mono font-bold text-white select-all tracking-widest uppercase transition-colors group-hover:text-electric">{String(req.id).slice(-8)}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </section>

      {/* FOOTER DECO */}
      <div className="fixed bottom-0 left-0 w-full h-24 bg-gradient-to-t from-black to-transparent pointer-events-none z-0"></div>
    </div>
  );
};

export default Exchanger;
