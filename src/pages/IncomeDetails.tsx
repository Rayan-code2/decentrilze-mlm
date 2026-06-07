import React, { useState, useEffect, useMemo } from 'react';
import { User, Transaction, Wallet } from '../types';
import { mockApi } from '../lib/mockApi';
import { appwriteService } from '../services/appwriteService';
import { isAppwriteConfigured, client, APPWRITE_CONFIG } from '../lib/appwrite';
import { 
  TrendingUp, ArrowDownCircle, ArrowUpCircle, 
  RefreshCcw, Zap, Target, Award, 
  Search, Filter, Copy, Check, 
  ChevronDown, Calendar, DollarSign
} from 'lucide-react';

interface IncomeDetailsProps {
  user: User;
  wallet: Wallet;
}

const IncomeDetails: React.FC<IncomeDetailsProps> = ({ user, wallet }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchTransactions = async () => {
    try {
      const isLive = isAppwriteConfigured();
      const api = isLive ? appwriteService : mockApi.db;
      const lookupId = user.user_id || user.id;
      console.log(`[IncomeDetails] Fetching transactions for: ${lookupId}`);
      const data = await api.getTransactions(lookupId);
      console.log(`[IncomeDetails] Found ${data.length} transactions`);
      setTransactions(data || []);
    } catch (e) {
      console.error("Error fetching transactions:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();

    // Real-time updates for transactions
    const isLive = isAppwriteConfigured();
    if (isLive) {
      try {
        const channel = `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.collections.transactions}.documents`;
        const unsubscribe = client.subscribe(channel, (response: any) => {
          const payload = response.payload as any;
          const lookupId = user.user_id || user.id;
          if (payload.user_id === lookupId) {
            console.log("Real-time transaction detected!");
            fetchTransactions();
          }
        });
        return () => unsubscribe();
      } catch (e) {
        console.error("Transaction realtime failed", e);
      }
    }
  }, [user.id, user.user_id]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const type = tx.type.toLowerCase();
      const matchesFilter = filter === 'all' || 
                           (filter === 'roi' && (type.includes('roi'))) ||
                           (filter === 'level' && (type.includes('level'))) ||
                           (filter === 'matrix' && (type.includes('matrix') || type.includes('placement'))) ||
                           (filter === 'direct' && (type.includes('direct'))) ||
                           (filter === 'spin' && type.includes('spin'));
      
      const matchesSearch = tx.id.toLowerCase().includes(search.toLowerCase()) || 
                           tx.type.toLowerCase().includes(search.toLowerCase()) ||
                           tx.description?.toLowerCase().includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [transactions, filter, search]);

  const stats = useMemo(() => {
    // Prefer direct values from wallet for the 4 main boxes as it's the official source
    // But calculate them from transactions too as fallback/cross-check
    const computed = {
      roi: 0,
      level: 0,
      matrix: 0,
      direct: 0,
      total: 0
    };

    transactions.forEach(tx => {
      // Treat as completed if status is missing or explicitly completed
      if (!tx.status || tx.status === 'completed') {
        const amt = Number(tx.amount || 0);
        const type = tx.type.toLowerCase();
        if (type.includes('roi')) computed.roi += amt;
        else if (type.includes('level')) computed.level += amt;
        else if (type.includes('matrix') || type.includes('placement')) computed.matrix += amt;
        else if (type.includes('direct')) computed.direct += amt;
        
        if (['roi', 'roi_earned', 'level', 'level_income', 'matrix', 'matrix_income', 'placement', 'placement_income', 'direct', 'direct_income', 'spin'].includes(type) || type.includes('income')) {
          computed.total += amt;
        }
      }
    });

    return {
      roi: wallet.roi_income || wallet.wallet_roi_earned || computed.roi,
      level: wallet.level_income || computed.level,
      matrix: wallet.matrix_income || computed.matrix,
      direct: wallet.direct_income || computed.direct,
      total: wallet.total_earned || computed.total
    };
  }, [transactions, wallet]);

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-electric border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20 relative">
      {/* ATMOSPHERIC BACKGROUND */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-electric/10 blur-[120px] rounded-full animate-pulse-glow"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-electric/5 blur-[120px] rounded-full animate-pulse-glow" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 relative z-10">
        {[
          { id: 'all', label: 'Total Earnings', value: stats.total, color: 'text-white', bg: 'glass-card' },
          { id: 'roi', label: 'ROI Income', value: stats.roi, color: 'text-cyan-400', bg: 'glass-card' },
          { id: 'level', label: 'Level Income', value: stats.level, color: 'text-purple-400', bg: 'glass-card' },
          { id: 'matrix', label: 'Matrix Income', value: stats.matrix, color: 'text-pink-400', bg: 'glass-card' },
          { id: 'direct', label: 'Direct Income', value: stats.direct, color: 'text-amber-400', bg: 'glass-card' },
        ].map((stat, i) => (
          <div 
            key={i} 
            onClick={() => setFilter(stat.id)}
            className={`${stat.bg} p-6 text-center space-y-2 group hover:border-electric/30 transition-all cursor-pointer ${filter === stat.id ? 'border-electric/40 bg-electric/5' : ''}`}
          >
            <span className="data-label">{stat.label}</span>
            <p className={`text-xl font-black italic tracking-tighter ${stat.color}`}>${stat.value.toFixed(stat.value < 0.01 && stat.value > 0 ? 4 : 2)}</p>
          </div>
        ))}
      </div>

      {/* FILTER BAR */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 glass-card p-6 relative z-10">
        <div className="flex flex-1 items-center gap-4 bg-black/40 px-6 py-3 rounded-2xl border border-white/5 w-full md:w-auto focus-within:border-electric/50 transition-all">
          <Search size={18} className="text-slate-muted" />
          <input 
            type="text" 
            placeholder="Search ID, type, or source..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent border-none outline-none text-xs text-white placeholder:text-slate-700 w-full font-medium"
          />
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 no-scrollbar">
          {[
            { id: 'all', label: 'All' },
            { id: 'roi', label: 'ROI' },
            { id: 'level', label: 'Level' },
            { id: 'matrix', label: 'Matrix' },
            { id: 'direct', label: 'Direct' },
            { id: 'spin', label: 'Spin' },
          ].map((f) => (
            <button 
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filter === f.id ? 'bg-electric text-obsidian shadow-[0_0_20px_rgba(204,255,0,0.3)]' : 'bg-black/40 text-slate-muted hover:text-white border border-white/5'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* DATA GRID */}
      <div className="glass-card overflow-hidden relative z-10">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5">
                <th className="p-6 text-[10px] font-black text-slate-muted uppercase tracking-[0.2em]">Tx Hash</th>
                <th className="p-6 text-[10px] font-black text-slate-muted uppercase tracking-[0.2em]">Method</th>
                <th className="p-6 text-[10px] font-black text-slate-muted uppercase tracking-[0.2em]">Details</th>
                <th className="p-6 text-[10px] font-black text-slate-muted uppercase tracking-[0.2em]">Amount</th>
                <th className="p-6 text-[10px] font-black text-slate-muted uppercase tracking-[0.2em]">Age</th>
                <th className="p-6 text-[10px] font-black text-slate-muted uppercase tracking-[0.2em] text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredTransactions.length > 0 ? (
                filteredTransactions.map((tx, idx) => (
                  <tr key={tx.id} className="hover:bg-white/5 transition-colors group">
                    <td className="p-6">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[10px] text-electric uppercase tracking-tighter">0x{tx.id.toUpperCase().slice(0, 14)}...</span>
                        <button 
                          onClick={() => handleCopy(tx.id)}
                          className="opacity-0 group-hover:opacity-100 text-slate-muted hover:text-electric transition-all"
                        >
                          {copiedId === tx.id ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                    </td>
                    <td className="p-6">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest ${
                          tx.type.includes('direct') ? 'text-amber-400 border-amber-400/20' :
                          tx.type.includes('level') ? 'text-purple-400 border-purple-400/20' :
                          tx.type.includes('matrix') || tx.type.includes('placement') ? 'text-pink-400 border-pink-400/20' :
                          tx.type.includes('roi') ? 'text-cyan-400 border-cyan-400/20' :
                          'text-white'
                        }`}>
                          {tx.type.replace('_', ' ')}
                        </span>
                      </div>
                    </td>
                    <td className="p-6">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-slate-100">
                          {tx.description || 'Income Distribution'}
                        </span>
                        <div className="flex items-center gap-3">
                          {tx.from_user_id && tx.from_user_id !== 'SYSTEM' && (
                            <span className="text-[9px] text-slate-500 font-mono flex items-center gap-1">
                              <Target size={10} className="text-slate-600" />
                              Sender: <span className="text-white/60">{tx.from_user_id}</span>
                            </span>
                          )}
                          {tx.income_level && (
                            <span className="px-1.5 py-0.5 rounded-full bg-white/5 border border-white/5 text-[8px] font-black text-slate-400 uppercase tracking-widest">
                              Lv {tx.income_level}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-6">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-electric/40"></div>
                        <span className={`text-sm font-black italic tracking-tighter ${tx.amount > 0 ? 'text-crypto-up' : 'text-crypto-down'}`}>
                          {tx.amount > 0 ? '+' : ''}{Math.abs(tx.amount).toFixed(Math.abs(tx.amount) < 0.01 && Math.abs(tx.amount) > 0 ? 4 : 2)} <span className="text-[10px] not-italic text-slate-muted">USDT</span>
                        </span>
                      </div>
                    </td>
                    <td className="p-6">
                      <span className="text-[10px] font-black text-slate-muted uppercase tracking-widest">{new Date(tx.created_at).toLocaleDateString()}</span>
                    </td>
                    <td className="p-6 text-right">
                      <div className="flex justify-end">
                        <span className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[8px] font-black uppercase tracking-widest border ${
                          (!tx.status || tx.status === 'completed') ? 'bg-crypto-up/10 border-crypto-up/20 text-crypto-up' :
                          tx.status === 'pending' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                          'bg-crypto-down/10 border-crypto-down/20 text-crypto-down'
                        }`}>
                          {(!tx.status || tx.status === 'completed') && <div className="w-1 h-1 rounded-full bg-crypto-up animate-pulse"></div>}
                          {tx.status || 'completed'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-20 text-center">
                    <div className="flex flex-col items-center gap-4 text-slate-muted/20">
                      <Search size={48} />
                      <p className="data-label italic">No transactions found</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default IncomeDetails;
