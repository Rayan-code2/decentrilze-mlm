import React, { useState, useEffect } from 'react';
import { User, RankReward } from '../types';
import { mockApi } from '../lib/mockApi';
import { appwriteService } from '../services/appwriteService';
import { isAppwriteConfigured } from '../lib/appwrite';
import { Gift, Award, Star, Zap, ShieldCheck, CheckCircle2, Lock, Briefcase, Users, Check, AlertCircle } from 'lucide-react';

interface RankRewardsProps {
  user: User;
}

const RankRewards: React.FC<RankRewardsProps> = ({ user }) => {
  const [rewards, setRewards] = useState<RankReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [personalBusiness, setPersonalBusiness] = useState(0);
  const [teamBusiness, setTeamBusiness] = useState(0);
  const [levelBusinesses, setLevelBusinesses] = useState<Record<number, number>>({});
  
  // Real-time tracking of newly introduced qualification rules
  const [maxSelfPkg, setMaxSelfPkg] = useState(0);
  const [directCount, setDirectCount] = useState(0);
  const [downlinePkgCounts, setDownlinePkgCounts] = useState<Record<number, number>>({});
  const [claimedRewards, setClaimedRewards] = useState<string[]>([]);
  const [claimStatus, setClaimStatus] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // States to keep raw downline structures for dynamic evaluation
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allPurchases, setAllPurchases] = useState<any[]>([]);
  const [downlineIds, setDownlineIds] = useState<string[]>([]);

  // Helpers to calculate level/depth business dynamically
  const getDownlineIdsAtDepth = (uIds: string[], currentDepth: number, targetDepth: number, rawUsersList?: any[]): string[] => {
    const listToUse = rawUsersList || allUsers;
    if (currentDepth === targetDepth) {
      return uIds;
    }
    const nextLevelUIds: string[] = [];
    listToUse.forEach((u: any) => {
      const referee = String(u.referred_by || '').toLowerCase();
      if (uIds.some(id => String(id).toLowerCase() === referee)) {
        const dId = u.user_id || u.id || u.$id;
        if (dId) {
          nextLevelUIds.push(dId);
        }
      }
    });
    if (nextLevelUIds.length === 0) return [];
    return getDownlineIdsAtDepth(nextLevelUIds, currentDepth + 1, targetDepth, listToUse);
  };

  const getTeamBusinessAtDepth = (targetDepth: number, rawUsers?: any[], rawPurchases?: any[], rawDownlines?: any[]): number => {
    const usersListToUse = rawUsers || allUsers;
    const purchasesListToUse = rawPurchases || allPurchases;
    const downlinesToUse = rawDownlines || downlineIds;

    if (targetDepth === 0) {
      return purchasesListToUse.filter((p: any) => 
        p.is_active !== false && downlinesToUse.includes(p.user_id)
      ).reduce((acc: number, p: any) => acc + (Number(p.price) || 0), 0);
    } else {
      const targetIds: string[] = [];
      for (let d = 1; d <= targetDepth; d++) {
        const levelIds = getDownlineIdsAtDepth([user.user_id || user.id], 0, d, usersListToUse);
        levelIds.forEach(id => {
          if (!targetIds.includes(id)) {
            targetIds.push(id);
          }
        });
      }
      return purchasesListToUse.filter((p: any) => 
        p.is_active !== false && targetIds.includes(p.user_id)
      ).reduce((acc: number, p: any) => acc + (Number(p.price) || 0), 0);
    }
  };

  const fetchRewardsAndBusiness = async () => {
    try {
      const isLive = isAppwriteConfigured();
      const api = isLive ? appwriteService : (mockApi.db as any);
      
      // 1. Fetch Rank Reward Milestones from Settings
      const settings = await api.getSettings();
      const rankRewards: RankReward[] = settings?.rank_rewards || [];
      setRewards(rankRewards);

      // 2. Fetch User Purchases to evaluate self package size and total personal business
      const purchases = await api.getUserPurchases?.(user.id) || [];
      const totalPersonalBusiness = purchases.reduce((acc: number, p: any) => {
        return acc + (p.is_active !== false ? Number(p.price) : 0);
      }, 0);
      setPersonalBusiness(totalPersonalBusiness);

      // Active packages max price
      const activePurchases = purchases.filter((p: any) => p.is_active !== false);
      const maxVal = activePurchases.reduce((max: number, p: any) => Math.max(max, Number(p.price) || 0), 0);
      setMaxSelfPkg(maxVal);

      // 3. Fetch Claims History from Transactions
      const transactions = await api.getTransactions?.(user.id) || [];
      const claimedNames = transactions
        .filter((tx: any) => tx.description?.startsWith('Rank Reward Claim: ') || tx.description?.startsWith('Rank Reward: '))
        .map((tx: any) => tx.description.replace('Rank Reward Claim: ', '').replace('Rank Reward: ', '').trim());
      setClaimedRewards(claimedNames);

      // 4. Fetch Downline details (works for both live/mock modes)
      const allUsersList = await api.getAllUsers() || [];
      const allPurchasesList = await api.getAllPurchases?.() || [];
      setAllUsers(allUsersList);
      setAllPurchases(allPurchasesList);

      // Construct Complete Downline List recursively
      const getDownlineIds = (uId: string): string[] => {
          const list: string[] = [];
          const directs = allUsersList.filter((u: any) => {
              const referee = String(u.referred_by || '').toLowerCase();
              const lookup = String(uId).toLowerCase();
              return referee === lookup;
          });
          directs.forEach((d: any) => {
              const dId = d.user_id || d.id || d.$id;
              list.push(dId);
              list.push(...getDownlineIds(dId));
          });
          return list;
      };

      const dlIds = getDownlineIds(user.user_id || user.id);
      setDownlineIds(dlIds);
      
      // Count direct referrals
      const directsList = allUsersList.filter((u: any) => {
          const referee = String(u.referred_by || '').toLowerCase();
          const lookup = String(user.user_id || user.id).toLowerCase();
          return referee === lookup;
      });
      setDirectCount(directsList.length);

      // Calculate Total/Cumulative Team Business (depth = 0)
      const cumulativeTeamBusiness = allPurchasesList.filter((p: any) => 
          p.is_active !== false && dlIds.includes(p.user_id)
      ).reduce((acc: number, p: any) => acc + (Number(p.price) || 0), 0);
      setTeamBusiness(cumulativeTeamBusiness);

      // Count of downlines having active package of a given price
      const pkgMap: Record<number, number> = {};
      dlIds.forEach((dId) => {
          const userPurchases = allPurchasesList.filter((p: any) => p.user_id === dId && p.is_active !== false);
          userPurchases.forEach((p: any) => {
              const price = Number(p.price) || 0;
              if (price > 0) {
                  pkgMap[price] = (pkgMap[price] || 0) + 1;
              }
          });
      });
      setDownlinePkgCounts(pkgMap);

    } catch (e) {
      console.error("Failed to fetch rank rewards or business data", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRewardsAndBusiness();
  }, [user.id, user.user_id, user.role]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'zap': return Zap;
      case 'star': return Star;
      case 'award': return Award;
      case 'shield': return ShieldCheck;
      case 'gift': return Gift;
      default: return Star;
    }
  };

  const getStatus = (reward: RankReward) => {
    const isClaimed = claimedRewards.includes(reward.rank_name.trim());
    if (isClaimed) return 'claimed';

    const minSelfPkgRequired = Number(reward.min_self_package || 0);
    const minDownlineCountRequired = Number(reward.min_downline_same_package || 0);
    const minDirectsRequired = Number(reward.min_directs || 0);

    const downlineCountForThisPkg = downlinePkgCounts[minSelfPkgRequired] || 0;

    const hasSelfPkg = maxSelfPkg >= minSelfPkgRequired;
    const hasDownlineCount = downlineCountForThisPkg >= minDownlineCountRequired;
    const hasDirectCount = directCount >= minDirectsRequired;
    const hasPersonalBusiness = personalBusiness >= reward.personal_business;
    
    // Dynamic Level Team Business check
    const targetDepth = Number(reward.target_depth || 0);
    const calculatedTeamBiz = getTeamBusinessAtDepth(targetDepth);
    const hasTeamBusiness = calculatedTeamBiz >= reward.team_business;

    if (hasSelfPkg && hasDownlineCount && hasDirectCount && hasPersonalBusiness && hasTeamBusiness) {
      return 'unlocked';
    }
    return 'locked';
  };

  const handleClaim = async (reward: RankReward) => {
    try {
      setLoading(true);
      setClaimStatus(null);
      const isLive = isAppwriteConfigured();
      const api = isLive ? appwriteService : (mockApi as any);

      const res = await api.claimRankReward(user.user_id || user.id, reward.id);
      if (res.success) {
        setClaimStatus({ type: 'success', text: res.message });
        setClaimedRewards(prev => [...prev, reward.rank_name.trim()]);
        await fetchRewardsAndBusiness();
      } else {
        setClaimStatus({ type: 'error', text: res.message || 'Verification rejected claim.' });
      }
    } catch (e: any) {
      setClaimStatus({ type: 'error', text: e.message || 'Claim submission failed.' });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-electric border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* HEADER */}
      <section className="relative overflow-hidden rounded-[3rem] p-10 bg-black/40 border-2 border-white/5 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-electric/10 blur-[120px] rounded-full -mr-48 -mt-48"></div>
        <div className="flex flex-col md:flex-row justify-between items-center gap-8 relative z-10">
          <div className="flex items-center gap-6">
            <div className="p-6 rounded-3xl bg-electric/10 text-electric border border-electric/20 shadow-[0_0_30px_rgba(204,255,0,0.2)]">
              <Gift size={40} className="animate-pulse" />
            </div>
            <div>
              <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">Rank Rewards Area</h2>
              <p className="text-slate-400 text-xs mt-1">Check requirements and trigger instant USDT rank bonuses.</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/5 px-4 py-3 rounded-2xl border border-white/10 backdrop-blur-md">
              <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Your Active Pkg</p>
              <p className="text-base font-black text-[#ccff00] italic tracking-tighter">${maxSelfPkg}</p>
            </div>
            <div className="bg-white/5 px-4 py-3 rounded-2xl border border-white/10 backdrop-blur-md">
              <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Your Directs</p>
              <p className="text-base font-black text-[#ccff00] italic tracking-tighter">{directCount} Directs</p>
            </div>
            <div className="bg-white/5 px-4 py-3 rounded-2xl border border-white/10 backdrop-blur-md">
              <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Personal Business</p>
              <p className="text-base font-black text-white italic tracking-tighter">${personalBusiness}</p>
            </div>
            <div className="bg-white/5 px-4 py-3 rounded-2xl border border-white/10 backdrop-blur-md">
              <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Total Team Business</p>
              <p className="text-base font-black text-cyan-400 italic tracking-tighter">${teamBusiness}</p>
            </div>
          </div>
        </div>
      </section>

      {/* CLAM STATUS NOTIFICATION */}
      {claimStatus && (
        <div className={`p-4 rounded-2xl flex items-center gap-3 border text-xs font-black uppercase text-center tracking-widest ${
          claimStatus.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          <AlertCircle size={16} />
          <span>{claimStatus.text}</span>
        </div>
      )}

      {/* REWARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {rewards.map((item) => {
          const status = getStatus(item);
          const Icon = getIcon(item.icon_type);
          const requiredSelfPkg = Number(item.min_self_package || 0);
          const requiredDownlineSamePkg = Number(item.min_downline_same_package || 0);
          const requiredDirects = Number(item.min_directs || 0);

          const currentDownlinesSamePkg = downlinePkgCounts[requiredSelfPkg] || 0;

          // Check individual met criteria
          const metSelfPkg = maxSelfPkg >= requiredSelfPkg;
          const metDownlines = currentDownlinesSamePkg >= requiredDownlineSamePkg;
          const metDirects = directCount >= requiredDirects;
          const metPersonalBusiness = personalBusiness >= item.personal_business;
          
          // Count team business dynamically based on admin target depth
          const targetDepth = Number(item.target_depth || 0);
          const currentTeamBusiness = getTeamBusinessAtDepth(targetDepth);
          const metTeamBusiness = currentTeamBusiness >= item.team_business;
          
          const personalProgress = Math.min(100, (personalBusiness / (item.personal_business || 1)) * 100);
          const teamProgress = Math.min(100, (currentTeamBusiness / (item.team_business || 1)) * 100);

          return (
            <div 
              key={item.id} 
              className={`glass-card p-8 group relative overflow-hidden transition-all duration-500 border ${
                status === 'claimed' 
                  ? 'border-blue-500/20 bg-blue-500/5 opacity-70' 
                  : status === 'unlocked' 
                    ? 'border-emerald-500/40 bg-emerald-500/5 shadow-[0_0_30px_rgba(16,185,129,0.1)] hover:border-emerald-500/60' 
                    : 'border-white/5 opacity-80'
              }`}
            >
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex justify-between items-start mb-6">
                  <div className={`p-4 rounded-2xl bg-white/5 border border-white/10 group-hover:scale-110 transition-transform duration-500 ${
                    status === 'claimed' ? 'text-blue-400' : status === 'unlocked' ? 'text-emerald-400' : 'text-slate-500'
                  }`}>
                    <Icon size={28} />
                  </div>
                  {status === 'claimed' ? (
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[8px] font-black uppercase tracking-widest">
                      <CheckCircle2 size={10} />
                      Claimed
                    </div>
                  ) : status === 'unlocked' ? (
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[8px] font-black uppercase tracking-widest">
                      <CheckCircle2 size={10} />
                      Unlocked
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-slate-500 text-[8px] font-black uppercase tracking-widest">
                      <Lock size={10} />
                      Locked
                    </div>
                  )}
                </div>

                <div className="space-y-1 mb-6">
                  <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">{item.rank_name}</h3>
                  <div className="flex flex-col gap-1">
                    <p className="text-[11px] font-black text-[#ccff00] uppercase tracking-widest">Reward: ${item.reward_amount} USDT</p>
                    {/* Level counting info badges */}
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                      Count depth: <span className="text-cyan-400">{targetDepth === 0 ? "All Levels" : `Levels 1 to ${targetDepth}`}</span>
                    </p>
                  </div>
                </div>

                {/* 5-CRITERIA METRICS PANEL (ADMIN CONTROLLED) */}
                <div className="space-y-2 border-t border-b border-white/5 py-4 mb-6">
                  <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">Eligibility Protocol:</span>
                  
                  {/* Criterion 1: Self Package Price */}
                  {requiredSelfPkg > 0 && (
                    <div className="flex justify-between items-center text-[10px] font-mono">
                      <span className="text-slate-400">Personal Package (${requiredSelfPkg}+)</span>
                      <span className={`font-black flex items-center gap-1 ${metSelfPkg ? 'text-emerald-400' : 'text-red-400'}`}>
                        {metSelfPkg ? <Check size={12} /> : <Lock size={10} />}
                        ${maxSelfPkg} / ${requiredSelfPkg}
                      </span>
                    </div>
                  )}

                  {/* Criterion 2: Same Package Downline Ref */}
                  {requiredDownlineSamePkg > 0 && (
                    <div className="flex justify-between items-center text-[10px] font-mono">
                      <span className="text-slate-400">Downline upgrades (${requiredSelfPkg}+)</span>
                      <span className={`font-black flex items-center gap-1 ${metDownlines ? 'text-emerald-400' : 'text-red-400'}`}>
                        {metDownlines ? <Check size={12} /> : <Lock size={10} />}
                        {currentDownlinesSamePkg} / {requiredDownlineSamePkg}
                      </span>
                    </div>
                  )}

                  {/* Criterion 3: Direct Referrals Count */}
                  {requiredDirects > 0 && (
                    <div className="flex justify-between items-center text-[10px] font-mono">
                      <span className="text-slate-400">Required Directs</span>
                      <span className={`font-black flex items-center gap-1 ${metDirects ? 'text-emerald-400' : 'text-red-400'}`}>
                        {metDirects ? <Check size={12} /> : <Lock size={10} />}
                        {directCount} / {requiredDirects}
                      </span>
                    </div>
                  )}

                  {/* Criterion 4: Personal Business */}
                  {item.personal_business > 0 && (
                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-slate-400">Personal Business</span>
                        <span className={`font-black flex items-center gap-1 ${metPersonalBusiness ? 'text-emerald-400' : 'text-red-400'}`}>
                          ${personalBusiness} / ${item.personal_business}
                        </span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className={`h-full ${metPersonalBusiness ? 'bg-emerald-400' : 'bg-red-400'}`} style={{ width: `${personalProgress}%` }}></div>
                      </div>
                    </div>
                  )}

                  {/* Criterion 5: Team Business */}
                  {item.team_business > 0 && (
                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-slate-400 font-mono">
                          Team Biz ({targetDepth === 0 ? "All Levels" : `Levels 1-${targetDepth}`})
                        </span>
                        <span className={`font-black flex items-center gap-1 ${metTeamBusiness ? 'text-[#ccff00]' : 'text-red-400'}`}>
                          ${currentTeamBusiness} / ${item.team_business}
                        </span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className={`h-full ${metTeamBusiness ? 'bg-[#ccff00]' : 'bg-red-400'}`} style={{ width: `${teamProgress}%` }}></div>
                      </div>
                    </div>
                  )}
                </div>

                <button 
                  onClick={() => handleClaim(item)}
                  disabled={status !== 'unlocked'}
                  className={`w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    status === 'claimed'
                      ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 cursor-not-allowed'
                      : status === 'unlocked' 
                        ? 'bg-emerald-500 text-white hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:scale-[1.02]' 
                        : 'bg-white/5 text-slate-600 cursor-not-allowed border border-white/5'
                  }`}
                >
                  {status === 'claimed' ? 'Reward Claimed' : status === 'unlocked' ? 'Claim Bonus USDT' : 'Locked'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* INFO BOX */}
      <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10 flex flex-col md:flex-row items-center gap-8">
        <div className="p-4 rounded-2xl bg-[#ccff00]/10 text-[#ccff00]">
          <Award size={32} />
        </div>
        <div className="flex-1">
          <h4 className="text-white font-black text-sm italic uppercase tracking-tighter mb-1">Rank Advancement eligibility guide</h4>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest leading-relaxed">
            Eligible users can claim instant bonuses. Administrators configure minimum active packages to prevent low-value entry spoofing while evaluating the team business volume counted up to the specified level depth level.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RankRewards;
