import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { mockApi } from '../lib/mockApi';
import { appwriteService } from '../services/appwriteService';
import { isAppwriteConfigured } from '../lib/appwrite';
import { Trophy, Medal, Crown, TrendingUp, Globe, Zap, ShieldCheck, User as UserIcon } from 'lucide-react';

interface LeaderboardProps {
  user: User;
}

const Leaderboard: React.FC<LeaderboardProps> = ({ user }) => {
  const [topUsers, setTopUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true);
      try {
        const isLive = isAppwriteConfigured();
        const api = isLive ? appwriteService : mockApi.db;
        const users = await api.getAllUsers();
        // Sort by direct count and then by creation date as a proxy for performance
        const sorted = [...users].sort((a, b) => {
          if (b.direct_count !== a.direct_count) {
            return b.direct_count - a.direct_count;
          }
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });
        
        // Add mock earnings for display
        const withEarnings = sorted.slice(0, 10).map((u, index) => ({
          ...u,
          rank: index + 1,
          earnings: 1500 - (index * 120) + Math.floor(Math.random() * 50)
        }));
        
        setTopUsers(withEarnings);
      } catch (e) {
        console.error("Failed to fetch leaderboard", e);
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return <Crown className="text-yellow-400" size={24} />;
      case 2: return <Medal className="text-slate-300" size={24} />;
      case 3: return <Medal className="text-amber-600" size={24} />;
      default: return <span className="text-slate-500 font-black italic">#{rank}</span>;
    }
  };

  return (
    <div className="space-y-8 pb-20">
      {/* HEADER SECTION */}
      <section className="relative overflow-hidden rounded-[3rem] p-10 bg-black/40 border-2 border-white/5 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 blur-[120px] rounded-full -mr-48 -mt-48"></div>
        <div className="flex flex-col md:flex-row justify-between items-center gap-8 relative z-10">
          <div className="flex items-center gap-6">
            <div className="p-6 rounded-3xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_30px_rgba(0,229,255,0.2)]">
              <Trophy size={40} className="animate-bounce" />
            </div>
            <div>
              <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">Elite Leaderboard</h2>
              <p className="text-slate-400 text-xs mt-1">Top 10 Nodes dominating the Decentralized Protocol.</p>
            </div>
          </div>
          <div className="flex items-center gap-4 bg-white/5 px-6 py-4 rounded-3xl border border-white/10 backdrop-blur-md">
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Your Rank</p>
              <p className="text-xl font-black text-cyan-400 italic tracking-tighter">#{user.global_rank || '---'}</p>
            </div>
            <div className="w-[1px] h-8 bg-white/10"></div>
            <Globe size={24} className="text-cyan-400 animate-spin-slow" />
          </div>
        </div>
      </section>

      {/* TOP 3 PODIUM (Visual representation for desktop) */}
      <div className="hidden md:grid grid-cols-3 gap-8 items-end px-4">
        {/* RANK 2 */}
        {topUsers[1] && (
          <div className="glass-card p-8 border-white/5 bg-white/[0.02] flex flex-col items-center gap-4 animate-in slide-in-from-bottom-8 duration-700 delay-100">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-slate-300/30 flex items-center justify-center text-2xl font-black text-white">
                {topUsers[1].name[0]}
              </div>
              <div className="absolute -bottom-2 -right-2 p-2 rounded-full bg-slate-700 border border-slate-300 shadow-lg">
                <Medal size={16} className="text-slate-300" />
              </div>
            </div>
            <div className="text-center">
              <h4 className="text-lg font-black text-white italic tracking-tighter">{topUsers[1].name}</h4>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Rank #2</p>
            </div>
            <div className="w-full pt-4 border-t border-white/5 flex justify-between items-center">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Earnings</span>
              <span className="text-sm font-black text-white italic">${topUsers[1].earnings.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* RANK 1 */}
        {topUsers[0] && (
          <div className="glass-card p-10 border-cyan-500/30 bg-cyan-500/5 flex flex-col items-center gap-6 relative -top-4 shadow-[0_20px_50px_rgba(0,229,255,0.15)] animate-in slide-in-from-bottom-12 duration-1000">
            <div className="absolute -top-6 left-1/2 -translate-x-1/2">
              <Crown size={48} className="text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]" />
            </div>
            <div className="relative">
              <div className="w-28 h-28 rounded-full bg-cyan-900/30 border-4 border-cyan-400 flex items-center justify-center text-4xl font-black text-white shadow-[0_0_30px_rgba(0,229,255,0.3)]">
                {topUsers[0].name[0]}
              </div>
              <div className="absolute -bottom-2 -right-2 p-3 rounded-full bg-cyan-500 shadow-lg">
                <Zap size={20} className="text-white" />
              </div>
            </div>
            <div className="text-center">
              <h4 className="text-2xl font-black text-white italic tracking-tighter">{topUsers[0].name}</h4>
              <p className="text-[12px] font-black text-cyan-400 uppercase tracking-[0.3em] mt-1">Global Champion</p>
            </div>
            <div className="w-full pt-6 border-t border-white/10 flex justify-between items-center">
              <span className="text-[12px] font-black text-slate-400 uppercase tracking-widest">Total Yield</span>
              <span className="text-xl font-black text-cyan-400 italic">${topUsers[0].earnings.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* RANK 3 */}
        {topUsers[2] && (
          <div className="glass-card p-8 border-white/5 bg-white/[0.02] flex flex-col items-center gap-4 animate-in slide-in-from-bottom-8 duration-700 delay-200">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-amber-600/30 flex items-center justify-center text-2xl font-black text-white">
                {topUsers[2].name[0]}
              </div>
              <div className="absolute -bottom-2 -right-2 p-2 rounded-full bg-amber-900/50 border border-amber-600 shadow-lg">
                <Medal size={16} className="text-amber-600" />
              </div>
            </div>
            <div className="text-center">
              <h4 className="text-lg font-black text-white italic tracking-tighter">{topUsers[2].name}</h4>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Rank #3</p>
            </div>
            <div className="w-full pt-4 border-t border-white/5 flex justify-between items-center">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Earnings</span>
              <span className="text-sm font-black text-white italic">${topUsers[2].earnings.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>

      {/* FULL LIST TABLE */}
      <div className="glass-card overflow-hidden border-white/5">
        <div className="p-6 border-b border-white/5 bg-white/[0.02] flex justify-between items-center">
          <div className="flex items-center gap-3">
            <TrendingUp size={18} className="text-cyan-400" />
            <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Global Performance Index</span>
          </div>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Updated Real-Time</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-black/20">
                <th className="p-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Rank</th>
                <th className="p-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Node Protocol</th>
                <th className="p-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-center">Directs</th>
                <th className="p-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">Total Yield</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {topUsers.map((u) => (
                <tr key={u.id} className={`group transition-colors ${u.id === user.id ? 'bg-cyan-500/5' : 'hover:bg-white/[0.02]'}`}>
                  <td className="p-6">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 border border-white/10 group-hover:border-cyan-500/30 transition-all">
                      {getRankIcon(u.rank)}
                    </div>
                  </td>
                  <td className="p-6">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-black text-white shadow-inner ${u.rank === 1 ? 'bg-cyan-500' : 'bg-slate-800'}`}>
                        {u.name[0]}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-white italic tracking-tighter leading-none">{u.name}</p>
                          {u.id === user.id && (
                            <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 text-[8px] font-black uppercase tracking-widest border border-cyan-500/20">You</span>
                          )}
                        </div>
                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">NODE_ID: #{u.node_id || 'NX-8291A4'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-6 text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-white/5 border border-white/10">
                      <UserIcon size={12} className="text-slate-500" />
                      <span className="text-xs font-black text-white italic">{u.direct_count}</span>
                    </div>
                  </td>
                  <td className="p-6 text-right">
                    <div className="flex flex-col items-end">
                      <span className="text-sm font-black text-cyan-400 italic tracking-tighter">${u.earnings.toFixed(2)}</span>
                      <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mt-0.5">Active</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FOOTER CTA */}
      <div className="p-8 rounded-[2.5rem] bg-gradient-to-r from-cyan-500/10 to-blue-600/10 border border-cyan-500/20 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-cyan-500/20 text-cyan-400">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h4 className="text-white font-black text-sm italic uppercase tracking-tighter">Climb the Ranks</h4>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Refer more nodes to increase your Global Rank.</p>
          </div>
        </div>
        <button className="px-8 py-4 rounded-2xl bg-cyan-500 text-obsidian text-[10px] font-black uppercase tracking-[0.3em] hover:shadow-[0_0_30px_rgba(0,229,255,0.3)] transition-all active:scale-95">
          Share Referral Link
        </button>
      </div>
    </div>
  );
};

export default Leaderboard;
