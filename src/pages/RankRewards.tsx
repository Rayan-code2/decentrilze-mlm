import React, { useState, useEffect } from 'react';
import { User, RankReward } from '../types';
import { mockApi } from '../lib/mockApi';
import { appwriteService } from '../services/appwriteService';
import { isAppwriteConfigured } from '../lib/appwrite';
import { Gift, Award, Star, Zap, ShieldCheck, CheckCircle2, Lock, Briefcase, Users } from 'lucide-react';

interface RankRewardsProps {
  user: User;
}

const RankRewards: React.FC<RankRewardsProps> = ({ user }) => {
  const [rewards, setRewards] = useState<RankReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [personalBusiness, setPersonalBusiness] = useState(0);
  const [teamBusiness, setTeamBusiness] = useState(0);
  const [levelBusinesses, setLevelBusinesses] = useState<Record<number, number>>({});
  
  useEffect(() => {
    const fetchRewardsAndBusiness = async () => {
      try {
        const isLive = isAppwriteConfigured();
        const api = isLive ? appwriteService : (mockApi.db as any);
        
        // 1. Fetch Rank Reward Milestones from Settings
        const settings = await api.getSettings();
        const rankRewards: RankReward[] = settings?.rank_rewards || [];
        setRewards(rankRewards);

        // 2. Fetch Personal Business (ONLY $20 PACKAGES COUNT)
        const purchases = await api.getUserPurchases(user.id);
        const totalPersonal = purchases.reduce((acc: number, p: any) => {
          // Only count if price is 20
          return acc + (Number(p.price) === 20 ? Number(p.price) : 0);
        }, 0);
        setPersonalBusiness(totalPersonal);

        // 3. Fetch Team & Level Businesses (Filtering for $20 nodes)
        if (isLive) {
          // For live, we assume the backend handles this or we filter current user data
          // But based on user request, let's try to get a filtered version if possible
          // or at least communicate it's for 20 package.
          const userData = await api.getCurrentUser ? await api.getCurrentUser() : user;
          if (userData && (userData as any).team_business_20 !== undefined) {
             setTeamBusiness(Number((userData as any).team_business_20));
          } else {
             // Fallback to team_business but explain it should be 20 in docs
             setTeamBusiness(Number((userData as any).team_business || 0));
          }
        } else {
          // Mock logic: calculate team business from $20 packages only
          // In mock mode, we can fetch all users and filter
          const allUsers = await api.getAllUsers();
          const allPurchases = await api.getAllPurchases?.() || [];
          
          // Recursive function to find downline business for $20 nodes
          const getDownline20Business = (uId: string): number => {
            let total = 0;
            const directs = allUsers.filter((u: any) => u.referred_by === uId);
            directs.forEach((d: any) => {
              const dId = d.id;
              // Check if this direct has $20 package
              const has20 = allPurchases.some((p: any) => p.user_id === dId && Number(p.price) === 20);
              if (has20) total += 20;
              
              total += getDownline20Business(dId);
            });
            return total;
          };
          
          const biz20 = getDownline20Business(user.id);
          setTeamBusiness(biz20);
        }

      } catch (e) {
        console.error("Failed to fetch rank rewards or business data", e);
      } finally {
        setLoading(false);
      }
    };
    fetchRewardsAndBusiness();
  }, [user]);

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
    const targetDepth = Number(reward.target_depth || 0);
    const businessToCompare = targetDepth === 0 ? teamBusiness : (levelBusinesses[targetDepth] || 0);

    if (personalBusiness >= reward.personal_business && businessToCompare >= reward.team_business) {
      return 'unlocked';
    }
    return 'locked';
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
              <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">Rank Rewards</h2>
              <p className="text-slate-400 text-xs mt-1">Achieve business milestones and unlock USDT rewards.</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/5 px-6 py-4 rounded-3xl border border-white/10 backdrop-blur-md">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-2">Scaling Node Business ($20)</p>
              <p className="text-xl font-black text-white italic tracking-tighter">${personalBusiness}</p>
            </div>
            <div className="bg-white/5 px-6 py-4 rounded-3xl border border-white/10 backdrop-blur-md">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-2">Team Scaling nodes ($20)</p>
              <p className="text-xl font-black text-cyan-400 italic tracking-tighter">${teamBusiness}</p>
            </div>
          </div>
        </div>
      </section>

      {/* REWARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {rewards.map((item, index) => {
          const status = getStatus(item);
          const Icon = getIcon(item.icon_type);
          const targetDepth = Number(item.target_depth || 0);
          const relevantTeamBusiness = targetDepth === 0 ? teamBusiness : (levelBusinesses[targetDepth] || 0);
          
          const personalProgress = Math.min(100, (personalBusiness / item.personal_business) * 100);
          const teamProgress = Math.min(100, (relevantTeamBusiness / item.team_business) * 100);

          return (
            <div 
              key={item.id} 
              className={`glass-card p-8 group relative overflow-hidden transition-all duration-500 ${
                status === 'unlocked' ? 'border-emerald-500/30 bg-emerald-500/5' : 'opacity-80'
              }`}
            >
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex justify-between items-start mb-6">
                  <div className={`p-4 rounded-2xl bg-white/5 border border-white/10 group-hover:scale-110 transition-transform duration-500 ${
                    status === 'unlocked' ? 'text-emerald-400' : 'text-slate-500'
                  }`}>
                    <Icon size={28} />
                  </div>
                  {status === 'unlocked' ? (
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[8px] font-black uppercase tracking-widest">
                      <CheckCircle2 size={10} />
                      Achieved
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
                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Reward: ${item.reward_amount} USDT</p>
                    {targetDepth > 0 && (
                       <p className="text-[7px] font-black text-cyan-400 uppercase tracking-widest">Target: Level {targetDepth} Business</p>
                    )}
                  </div>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Personal Business</span>
                      <span className="text-[8px] font-black text-white">${personalBusiness} / ${item.personal_business}</span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-slate-400" style={{ width: `${personalProgress}%` }}></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                        {targetDepth === 0 ? 'Total Team Business' : `Level ${targetDepth} Business`}
                      </span>
                      <span className="text-[8px] font-black text-white">
                        ${relevantTeamBusiness} / ${item.team_business}
                      </span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-400" style={{ width: `${teamProgress}%` }}></div>
                    </div>
                  </div>
                </div>

                <button 
                  disabled={status === 'locked'}
                  className={`w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    status === 'unlocked' 
                      ? 'bg-emerald-500 text-white hover:shadow-[0_0_20px_rgba(16,185,129,0.4)]' 
                      : 'bg-white/5 text-slate-600 cursor-not-allowed'
                  }`}
                >
                  {status === 'unlocked' ? 'Claim Reward' : 'Requirements Not Met'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* INFO BOX */}
      <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10 flex flex-col md:flex-row items-center gap-8">
        <div className="p-4 rounded-2xl bg-amber-500/10 text-amber-500">
          <Award size={32} />
        </div>
        <div className="flex-1">
          <h4 className="text-white font-black text-sm italic uppercase tracking-tighter mb-1">Scaling Reward Policy ($20 Nodes Only)</h4>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest leading-relaxed">
            Rewards are calculated EXCLUSIVELY based on Scaling Node ($20) activations. Your personal account must have a $20 Scaling Node active, and only $20 nodes in your downline contribute to your Team Business milestones. Starter ($10) nodes do not count towards rank advancement.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RankRewards;
