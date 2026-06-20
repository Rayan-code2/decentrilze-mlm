import React, { useState, useEffect, useMemo } from 'react';
import { User, MLMPackage, Purchase } from '../types';
import { mockApi } from '../lib/mockApi';
import { appwriteService } from '../services/appwriteService';
import { isAppwriteConfigured } from '../lib/appwrite';
import { Zap, Target, Users, Share2, ChevronRight, AlertCircle } from 'lucide-react';

const MatrixTree: React.FC<{ user: User }> = ({ user }) => {
  const [matrixLevelStats, setMatrixLevelStats] = useState<{ [key: number]: { pkg10: number, pkg20: number, pkg30: number, pkg40: number, total: number } }>({});
  const [generationLevelStats, setGenerationLevelStats] = useState<{ [key: number]: { pkg10: number, pkg20: number, pkg30: number, pkg40: number, total: number } }>({});
  const [matrixDownlineUsers, setMatrixDownlineUsers] = useState<{ [key: number]: User[] }>({});
  const [generationDownlineUsers, setGenerationDownlineUsers] = useState<{ [key: number]: User[] }>({});
  const [downline, setDownline] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'matrix' | 'directs' | 'generations'>('matrix');
  const [statusTab, setStatusTab] = useState<'all' | 'active' | 'inactive'>('all');
  const [currentUser, setCurrentUser] = useState<User>(user);
  const [starterNodesCount, setStarterNodesCount] = useState(0);
  const [scalingNodesCount, setScalingNodesCount] = useState(0);
  const [eliteNodesCount, setEliteNodesCount] = useState(0);
  const [whaleNodesCount, setWhaleNodesCount] = useState(0);
  const [packages, setPackages] = useState<MLMPackage[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const isLive = isAppwriteConfigured();
        const api = isLive ? appwriteService : mockApi.db;

        const myId = user.id;
        const myAuthId = (user as any).user_id;

        // Fetch latest user data for business stats
        const isAdmin = currentUser.role?.toLowerCase() === 'admin';
        const allPkgs = await api.getAllPackages();
        setPackages(allPkgs);

        let teamUsers: User[] = [];
        let teamPurchases: Purchase[] = [];

        if (isAdmin) {
          // Admins can see everyone
          teamUsers = await api.getAllUsers();
          teamPurchases = await api.getAllPurchases();
        } else {
          // Regular users only see their downline
          const teamData = await api.getTeamData(myId || myAuthId);
          teamUsers = teamData.users;
          teamPurchases = teamData.purchases;
          
          // Add self to the team users list so calculations include direct count correctly if needed
          // but usually team business doesn't include self.
        }

        // Updated user state from list if found
        const updatedSelf = teamUsers.find(u => (u.user_id === user.user_id || u.id === user.id));
        if (updatedSelf) setCurrentUser(updatedSelf);

        // Map users to their active packages
        const usersWithPkgs = teamUsers.map(u => {
          const uId = String((u as any).uid || u.user_id || u.id || '').trim();
          const userPurchases = teamPurchases.filter(p => {
            const pUid = String(p.user_id || (p as any).userId || '').trim();
            return pUid && pUid === uId;
          });
          // Find the most expensive or latest active package
          const activePurchase = userPurchases.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0))[0];
          const pkg = activePurchase ? allPkgs.find(p => String(p.id) === String(activePurchase.package_id || (activePurchase as any).packageId)) : null;
          return {
            ...u,
            is_active: !!pkg, // User is active if they have a package
            active_package: pkg ? pkg.name : 'NO PACKAGE',
            active_package_price: pkg ? pkg.price : 0
          };
        });

        // Build Downline Tree (Referral based for Generations)
        const genLevels: { [key: number]: User[] } = {};
        const matLevels: { [key: number]: User[] } = {};
        for(let i=1; i<=10; i++) {
          genLevels[i] = [];
          matLevels[i] = [];
        }

        const visitedGenerations = new Set<string>();
        const findGenerationalDownline = (parentId: string, currentLevel: number) => {
          if (currentLevel > 10 || !parentId || visitedGenerations.has(parentId)) return;
          visitedGenerations.add(parentId);
          const children = usersWithPkgs.filter(u => {
            const rid = u.referred_by || (u as any).referrer_id || (u as any).sponsor_id;
            return rid === parentId || (u as any).referred_by === parentId;
          });
          if (children.length > 0) {
            const uniqueChildren = children.filter(c => !genLevels[currentLevel].some(existing => (existing.id === c.id || (existing.user_id && existing.user_id === c.user_id))));
            genLevels[currentLevel].push(...uniqueChildren);
            uniqueChildren.forEach(child => {
              const cid = child.user_id || child.id; 
              if (cid) findGenerationalDownline(cid, currentLevel + 1);
            });
          }
        };

        const visitedMatrix = new Set<string>();
        const findMatrixDownline = (parentId: string, currentLevel: number) => {
          if (currentLevel > 10 || !parentId || visitedMatrix.has(parentId)) return;
          visitedMatrix.add(parentId);
          const children = usersWithPkgs.filter(u => (u as any).matrix_parent_id === parentId);
          if (children.length > 0) {
            matLevels[currentLevel].push(...children);
            children.forEach(child => {
              const cid = child.id || (child as any).user_id;
              if (cid) findMatrixDownline(cid, currentLevel + 1);
            });
          }
        };

        if (myId) {
          findGenerationalDownline(myId, 1);
          findMatrixDownline(myId, 1);
        }
        if (myAuthId && myAuthId !== myId) {
          findGenerationalDownline(myAuthId, 1);
          findMatrixDownline(myAuthId, 1);
        }
        
        setGenerationDownlineUsers(genLevels);
        setMatrixDownlineUsers(matLevels);
        
        const genStats: { [key: number]: { pkg10: number, pkg20: number, pkg30: number, pkg40: number, total: number } } = {};
        const matStats: { [key: number]: { pkg10: number, pkg20: number, pkg30: number, pkg40: number, total: number } } = {};
        for(let l=1; l<=10; l++) {
          genStats[l] = { pkg10: 0, pkg20: 0, pkg30: 0, pkg40: 0, total: 0 };
          matStats[l] = { pkg10: 0, pkg20: 0, pkg30: 0, pkg40: 0, total: 0 };
        }
        
        let starters = 0;
        let scalings = 0;
        let elites = 0;
        let whales = 0;
        let directBusinessTotal = 0;
        let teamBusinessTotal = 0;

        // Calculate Gen Stats
        for (let l = 1; l <= 10; l++) {
          genStats[l].total = genLevels[l].length;
          genLevels[l].forEach(u => {
            const price = Number((u as any).active_package_price || 0);
            teamBusinessTotal += price;
            if (l === 1) directBusinessTotal += price;
            if (price === 10) genStats[l].pkg10++;
            else if (price === 20) genStats[l].pkg20++;
            else if (price === 30) genStats[l].pkg30++;
            else if (price === 40) genStats[l].pkg40++;
          });
        }

        // Calculate Matrix Stats
        for (let l = 1; l <= 10; l++) {
          matStats[l].total = matLevels[l].length;
          matLevels[l].forEach(u => {
            const price = Number((u as any).active_package_price || 0);
            if (price === 10) matStats[l].pkg10++;
            else if (price === 20) matStats[l].pkg20++;
            else if (price === 30) matStats[l].pkg30++;
            else if (price === 40) matStats[l].pkg40++;
          });
        }

        // Global stats for dashboard
        usersWithPkgs.forEach(u => {
          const price = Number((u as any).active_package_price || 0);
          if (price === 10) starters++;
          else if (price === 20) scalings++;
          else if (price === 30) elites++;
          else if (price === 40) whales++;
        });

        setGenerationLevelStats(genStats);
        setMatrixLevelStats(matStats);
        setStarterNodesCount(starters);
        setScalingNodesCount(scalings);
        setEliteNodesCount(elites);
        setWhaleNodesCount(whales);

        // Update current user business stats locally for immediate display
        setCurrentUser(prev => ({
          ...prev,
          personal_business: directBusinessTotal,
          team_business: teamBusinessTotal
        }));

        if (activeTab === 'matrix') {
          const allMatrixNodes = Object.values(matLevels).flat();
          setDownline(allMatrixNodes);
        } else if (activeTab === 'directs') {
          const directMembers = usersWithPkgs.filter(u => u.referred_by === myId || u.referred_by === myAuthId || (u as any).referrer_id === myId || (u as any).referrer_id === myAuthId);
          setDownline(directMembers);
        } else {
          const allGenNodes = Object.values(genLevels).flat();
          setDownline(allGenNodes);
        }

      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user.id, user.user_id, activeTab]);

  const filteredDownline = useMemo(() => {
    if (statusTab === 'all') return downline;
    if (statusTab === 'active') return downline.filter(u => u.is_active === true);
    if (statusTab === 'inactive') return downline.filter(u => u.is_active === false);
    return downline;
  }, [downline, statusTab]);

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <div className="w-10 h-10 border-4 border-electric border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  return (
    <div className="space-y-12 animate-in fade-in zoom-in duration-1000 relative pb-20">
      {/* ATMOSPHERIC BACKGROUND */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-electric/10 blur-[120px] rounded-full animate-pulse-glow"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-electric/5 blur-[120px] rounded-full animate-pulse-glow" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Header Section */}
      <div className="relative p-6 sm:p-10 rounded-[2.5rem] bg-slate-900/40 backdrop-blur-xl border border-white/5 overflow-hidden group shadow-[0_0_50px_rgba(204,255,0,0.05)]">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="space-y-2 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-3">
              <div className="p-2 rounded-xl bg-electric/10 text-electric shadow-[0_0_15px_rgba(204,255,0,0.2)]">
                <Share2 size={20} className="animate-pulse" />
              </div>
              <span className="data-label text-electric">Network Explorer v6.0</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-black text-white italic uppercase tracking-tighter leading-none">Global <span className="text-electric">Matrix 2x2</span></h2>
            <p className="text-slate-muted text-[10px] font-black uppercase tracking-[0.3em] max-w-xl leading-relaxed">Auto-Spillover System. Even if you don't refer, the system fills your tree globally from top-to-bottom, left-to-right.</p>
          </div>
          <div className="flex bg-black/40 p-1.5 rounded-2xl border border-white/5 backdrop-blur-2xl">
            <button 
              onClick={() => setActiveTab('matrix')}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'matrix' ? 'bg-electric text-obsidian shadow-[0_0_20px_rgba(204,255,0,0.3)]' : 'text-slate-muted hover:text-white'}`}
              title="Matrix Level (Placement view: L1 has max 2 members)"
            >
              Matrix Line
            </button>
            <button 
              onClick={() => setActiveTab('directs')}
              className={`px-4 sm:px-6 py-2.5 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'directs' ? 'bg-electric text-obsidian shadow-[0_0_20px_rgba(204,255,0,0.3)]' : 'text-slate-muted hover:text-white'}`}
            >
              Directs
            </button>
            <button 
              onClick={() => setActiveTab('generations')}
              className={`px-4 sm:px-6 py-2.5 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'generations' ? 'bg-electric text-obsidian shadow-[0_0_20px_rgba(204,255,0,0.3)]' : 'text-slate-muted hover:text-white'}`}
              title="Referral Generation (G1 shows all your direct referrals)"
            >
              Network (Gen)
            </button>
          </div>
        </div>
      </div>

      {/* Network Health & Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            {[
              { label: 'Total Nodes', value: downline.length, icon: Users, trend: 'Net' },
              { label: '$10 Starter', value: starterNodesCount, icon: Zap, trend: 'Plan A' },
              { label: '$20 Pro', value: scalingNodesCount, icon: Target, trend: 'Plan B' },
              { label: '$30 Elite', value: eliteNodesCount, icon: Target, trend: 'Plan C' },
              { label: '$40 Whale', value: whaleNodesCount, icon: Target, trend: 'Plan D' },
            ].map((stat, i) => (
              <div key={i} className="glass-card p-4 sm:p-6 relative overflow-hidden group hover:border-electric/30 transition-all flex flex-col justify-between min-h-[140px] sm:min-h-[160px]">
                <div className="flex justify-between items-start">
                  <div className="p-2 sm:p-3 rounded-xl bg-white/5 text-electric group-hover:bg-electric group-hover:text-obsidian transition-all duration-500">
                    <stat.icon size={16} className="sm:size-5" />
                  </div>
                  <span className="text-[10px] sm:text-[10px] font-black text-crypto-up italic">{stat.trend}</span>
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] sm:text-[10px] font-black text-slate-muted uppercase tracking-widest">{stat.label}</p>
                  <p className="text-xl sm:text-3xl font-black text-white italic tracking-tighter group-hover:text-electric transition-colors">{stat.value}</p>
                </div>
              </div>
            ))}
        </div>

        <div className="lg:col-span-4 glass-card p-8 flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-electric/5 blur-[60px] rounded-full -mr-16 -mt-16 group-hover:bg-electric/10 transition-colors"></div>
          <div className="space-y-4 relative z-10">
            <h3 className="data-label">Network Health</h3>
            <div className="flex items-center gap-4">
              <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5">
                <div className="h-full bg-electric rounded-full shadow-[0_0_15px_#CCFF00]" style={{ width: '85%' }}></div>
              </div>
              <span className="text-[10px] font-black text-electric italic">85%</span>
            </div>
            <p className="text-[9px] font-bold text-slate-muted uppercase tracking-widest leading-relaxed">System is operating at optimal capacity. All nodes are synchronized with the main protocol.</p>
          </div>
          <div className="flex items-center gap-4 pt-6 border-t border-white/5 mt-6">
            <div className="flex -space-x-3">
              {[1,2,3,4].map(i => (
                <div key={i} className="w-8 h-8 rounded-full bg-white/10 border-2 border-obsidian flex items-center justify-center text-[10px] font-black text-white">
                  {i}
                </div>
              ))}
            </div>
            <span className="text-[9px] font-black text-slate-muted uppercase tracking-widest">+128 Online</span>
          </div>
        </div>
      </div>

      {/* Node Explorer List */}
      <div className="w-full space-y-6">
        <div className="flex items-center justify-between px-4">
          <h3 className="data-label">
            {activeTab === 'matrix' ? 'Protocol Node Explorer' : activeTab === 'directs' ? 'Direct Node Explorer' : 'Full Team Explorer'}
          </h3>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setStatusTab('active')}
              className={`flex items-center gap-2 transition-all hover:opacity-80 px-2 py-1.5 rounded-lg ${statusTab === 'active' ? 'bg-crypto-up/10 ring-1 ring-crypto-up/50' : ''}`}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-crypto-up"></div>
              <span className={`text-[8px] font-black uppercase tracking-widest ${statusTab === 'active' ? 'text-crypto-up' : 'text-slate-muted'}`}>Active</span>
              <span className="text-[10px] font-black text-slate-500 opacity-60">({downline.filter(u => u.is_active === true).length})</span>
            </button>
            <button 
              onClick={() => setStatusTab('inactive')}
              className={`flex items-center gap-2 transition-all hover:opacity-80 px-2 py-1.5 rounded-lg ${statusTab === 'inactive' ? 'bg-crypto-down/10 ring-1 ring-crypto-down/50' : ''}`}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-crypto-down"></div>
              <span className={`text-[8px] font-black uppercase tracking-widest ${statusTab === 'inactive' ? 'text-crypto-down' : 'text-slate-muted'}`}>Inactive</span>
              <span className="text-[10px] font-black text-slate-500 opacity-60">({downline.filter(u => u.is_active === false).length})</span>
            </button>
            {statusTab !== 'all' && (
              <button 
                onClick={() => setStatusTab('all')}
                className="text-[8px] font-black text-electric uppercase tracking-widest hover:underline px-2"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredDownline.map((node, i) => (
            <div key={node.id} className="glass-card p-6 flex items-center justify-between group hover:border-electric/30 transition-all relative overflow-hidden">
              <div className="flex items-center gap-4 relative z-10">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl transition-all duration-500 border border-white/5 ${
                  node.is_active 
                    ? 'bg-electric/10 text-electric border-electric/20 shadow-[0_0_20px_rgba(204,255,0,0.1)]' 
                    : 'bg-white/5 text-slate-muted'
                }`}>
                  {activeTab === 'matrix' ? `N${i+1}` : (node.name?.[0] || node.email[0]).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-black text-white italic tracking-tight uppercase group-hover:text-electric transition-colors">{node.name || node.email.split('@')[0]}</p>
                  <div className="flex flex-col">
                    <p className="font-mono text-[9px] font-bold text-slate-muted uppercase tracking-widest">NODE_ID: #{node.node_id || 'PENDING'}</p>
                    <p className="text-[8px] font-bold text-slate-500 uppercase tracking-[0.1em]">
                      {activeTab === 'generations' 
                        ? `Generation ${Object.keys(generationDownlineUsers).find(lvl => generationDownlineUsers[Number(lvl)].some(u => u.id === node.id || (u.user_id && u.user_id === node.user_id))) || '?'}` 
                        : activeTab === 'matrix'
                        ? `Matrix Level ${Object.keys(matrixDownlineUsers).find(lvl => matrixDownlineUsers[Number(lvl)].some(u => u.id === node.id || (u.user_id && u.user_id === node.user_id))) || '?'}`
                        : node.active_package}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end relative z-10">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest ${
                  node.is_active 
                    ? 'bg-crypto-up/10 text-crypto-up border border-crypto-up/20' 
                    : 'bg-crypto-down/10 text-crypto-down border border-crypto-down/20'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${node.is_active ? 'bg-crypto-up animate-pulse shadow-[0_0_10px_#00FF94]' : 'bg-crypto-down'}`}></div>
                  {node.is_active ? 'Synced' : 'Offline'}
                </div>
              </div>
            </div>
          ))}
          {filteredDownline.length === 0 && (
            <div className="col-span-full glass-card p-12 border-dashed flex flex-col items-center justify-center text-center">
              <Users size={48} className="text-slate-muted/10 mb-4" />
              <p className="data-label">No {statusTab !== 'all' ? statusTab : ''} protocol nodes detected in this sector</p>
            </div>
          )}
        </div>
      </div>

      {/* Level Distribution Grid */}
      <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-4">
        <AlertCircle className="text-amber-400 shrink-0 mt-0.5" size={18} />
        <div>
          <p className="text-xs font-black text-amber-400 uppercase tracking-widest mb-1">Income Protocol Rule</p>
          <p className="text-[10px] font-medium text-slate-300 leading-relaxed">
            Yield distribution is dynamically calculated based on your active mining protocols. 
            Check your <span className="text-white font-bold">Active Nodes</span> to see your current generation unlocking status.
          </p>
        </div>
      </div>

      {/* Business Stats at Top */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="glass-card p-6 border-l-4 border-l-emerald-500 overflow-hidden group">
          <div className="relative z-10 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Personal Business</span>
              <h4 className="text-4xl font-black text-white italic tracking-tighter">${currentUser.personal_business || 0}</h4>
              <p className="text-[8px] font-black text-emerald-500/70 uppercase tracking-widest">Your direct mining protocol volume</p>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/5 flex items-center justify-center text-emerald-500 border border-emerald-500/10 group-hover:scale-110 transition-transform duration-500">
              <Zap size={32} />
            </div>
          </div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-[60px] -mr-16 -mt-16 rounded-full pointer-events-none"></div>
        </div>

        <div className="glass-card p-6 border-l-4 border-l-electric overflow-hidden group">
          <div className="relative z-10 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Team Business</span>
              <h4 className="text-4xl font-black text-white italic tracking-tighter">${currentUser.team_business || 0}</h4>
              <p className="text-[8px] font-black text-electric/70 uppercase tracking-widest">Network wide aggregate volume</p>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-electric/5 flex items-center justify-center text-electric border border-electric/10 group-hover:scale-110 transition-transform duration-500">
              <Users size={32} />
            </div>
          </div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-electric/5 blur-[60px] -mr-16 -mt-16 rounded-full pointer-events-none"></div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-white italic tracking-tight uppercase flex items-center gap-2">
            {activeTab === 'matrix' ? 'Matrix Levels' : 'Network Generations'}
          </h3>
          <div className="hidden sm:block px-4 py-2 rounded-xl bg-white/5 border border-white/10">
            <p className="text-[10px] font-black text-slate-muted uppercase tracking-widest">
              {activeTab === 'matrix' 
                ? 'Showing placement in 2x2 structure' 
                : 'Showing your direct referral generations'}
            </p>
          </div>
        </div>
        <div className="p-3 rounded-xl bg-electric/5 border border-electric/10">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
            {activeTab === 'matrix' 
              ? 'Matrix Level 1 can only have 2 people. Extra people spill over to Level 2, 3, etc.' 
              : 'Generation 1 shows ALL your direct referrals. If you refer 4 people, all 4 will appear in G1.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((lvl) => {
          const stats = activeTab === 'matrix' ? matrixLevelStats[lvl] : generationLevelStats[lvl];
          const label = activeTab === 'matrix' ? 'Matrix Level' : 'Generation';
          const prefix = activeTab === 'matrix' ? 'L' : 'G';
          const packageIncomes: { [key: number]: number[] } = {
            10: [0.5, 0.5, 1, 1, 0.5, 0.2, 0.2, 0.2, 0.2, 0.2],
            20: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            30: [1, 1, 1, 2, 2, 2, 2, 2, 2, 7],
            40: [1, 1, 2, 2, 3, 3, 3, 4, 4, 15]
          };
          
          return (
            <button 
              key={lvl} 
              onClick={() => setSelectedLevel(selectedLevel === lvl ? null : lvl)}
              className={`glass-card p-5 flex flex-col gap-4 hover:border-electric/40 transition-all group relative overflow-hidden text-left ${selectedLevel === lvl ? 'border-electric ring-1 ring-electric/20' : ''}`}
            >
              {selectedLevel === lvl && (
                <div className="absolute inset-0 bg-electric/5 animate-pulse"></div>
              )}
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center text-[10px] font-black transition-all duration-500 ${selectedLevel === lvl ? 'bg-electric text-obsidian border-electric' : 'bg-white/5 border-white/10 text-slate-muted group-hover:bg-electric group-hover:text-obsidian group-hover:border-electric'}`}>
                    {prefix}{lvl}
                  </div>
                  <div className="space-y-1">
                    <p className="text-[7px] font-black text-slate-muted uppercase tracking-widest leading-none">{label} {lvl}</p>
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 max-w-[130px] pt-1">
                      <span className="text-[9px] font-black text-emerald-400 font-mono">$10:{stats?.pkg10 || 0}</span>
                      <span className="text-[9px] font-black text-cyan-400 font-mono">$20:{stats?.pkg20 || 0}</span>
                      <span className="text-[9px] font-black text-amber-400 font-mono">$30:{stats?.pkg30 || 0}</span>
                      <span className="text-[9px] font-black text-rose-400 font-mono">$40:{stats?.pkg40 || 0}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-electric italic tracking-tighter">{stats?.total || 0}</p>
                  <p className="text-[7px] font-black text-slate-muted uppercase tracking-widest">Total</p>
                </div>
              </div>
              
              <div className="pt-2 border-t border-white/5 grid grid-cols-2 gap-x-2 gap-y-1 relative z-10 text-[8px] leading-tight">
                <div className="flex justify-between items-center bg-emerald-500/5 px-1.5 py-0.5 rounded">
                  <span className="text-slate-400 font-bold block">In ($10)</span>
                  <span className="font-mono font-black text-emerald-400">${packageIncomes[10][lvl - 1].toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center bg-cyan-500/5 px-1.5 py-0.5 rounded">
                  <span className="text-slate-400 font-bold block">In ($20)</span>
                  <span className="font-mono font-black text-cyan-400">${packageIncomes[20][lvl - 1].toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center bg-amber-500/5 px-1.5 py-0.5 rounded">
                  <span className="text-slate-400 font-bold block">In ($30)</span>
                  <span className="font-mono font-black text-amber-400">${packageIncomes[30][lvl - 1].toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center bg-rose-500/5 px-1.5 py-0.5 rounded">
                  <span className="text-slate-400 font-bold block">In ($40)</span>
                  <span className="font-mono font-black text-rose-400">${packageIncomes[40][lvl - 1].toFixed(2)}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Level Users List */}
      {selectedLevel && (
        <div className="glass-card p-6 sm:p-10 space-y-8 animate-in slide-in-from-bottom duration-500">
          <div className="flex items-center justify-between border-b border-white/5 pb-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl bg-electric/10 text-electric border border-electric/20">
                <Users size={24} />
              </div>
              <div>
              <h3 className="text-xl font-black text-white italic uppercase tracking-tight">
                {activeTab === 'matrix' ? `Matrix Level ${selectedLevel}` : `Generation ${selectedLevel}`} Nodes
              </h3>
              <p className="text-[10px] font-black text-slate-muted uppercase tracking-widest">
                Total Active Nodes: {(activeTab === 'matrix' ? matrixDownlineUsers[selectedLevel] : generationDownlineUsers[selectedLevel])?.length || 0}
              </p>
            </div>
          </div>
          <button 
            onClick={() => setSelectedLevel(null)}
            className="px-4 py-2 rounded-xl bg-white/5 text-slate-muted text-[10px] font-black uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all"
          >
            Close Explorer
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-separate border-spacing-y-3">
            <thead>
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Node User</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Node ID</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Protocol</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Join Date</th>
              </tr>
            </thead>
            <tbody>
              {(activeTab === 'matrix' ? matrixDownlineUsers[selectedLevel] : generationDownlineUsers[selectedLevel])?.map((node: any) => (
                <tr key={node.id} className="group transition-all">
                  <td className="px-6 py-4 bg-white/2 rounded-l-2xl border-y border-l border-white/5 group-hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-electric/10 flex items-center justify-center text-electric font-black text-xs uppercase">
                        {node.name?.[0] || node.email[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-black text-white italic tracking-tight uppercase">{node.name || node.email.split('@')[0]}</p>
                        <p className="text-[9px] font-medium text-slate-500 lowercase">{node.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 bg-white/2 border-y border-white/5 group-hover:bg-white/5 transition-colors">
                    <span className="font-mono text-[10px] font-black text-slate-400 uppercase tracking-widest">{node.node_id || 'NX-UNKNOWN'}</span>
                  </td>
                  <td className="px-6 py-4 bg-white/2 border-y border-white/5 group-hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-2">
                      <Zap size={12} className={node.active_package_price > 0 ? 'text-amber-400' : 'text-slate-600'} />
                      <span className={`text-[10px] font-black uppercase tracking-widest italic ${node.active_package_price > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                        {node.active_package}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 bg-white/2 border-y border-white/5 group-hover:bg-white/5 transition-colors">
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${node.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                      <div className={`w-1 h-1 rounded-full ${node.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></div>
                      {node.is_active ? 'Synced' : 'Offline'}
                    </div>
                  </td>
                  <td className="px-6 py-4 bg-white/2 rounded-r-2xl border-y border-r border-white/5 group-hover:bg-white/5 transition-colors text-right">
                    <span className="text-[10px] font-black text-slate-500 italic uppercase">
                      {new Date(node.created_at || Date.now()).toLocaleDateString()}
                    </span>
                  </td>
                </tr>
              ))}
              {(!(activeTab === 'matrix' ? matrixDownlineUsers[selectedLevel] : generationDownlineUsers[selectedLevel]) || (activeTab === 'matrix' ? matrixDownlineUsers[selectedLevel] : generationDownlineUsers[selectedLevel]).length === 0) && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center bg-white/2 rounded-2xl border border-white/5">
                    <Users size={32} className="mx-auto text-slate-700 mb-3" />
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">No nodes detected in {activeTab === 'matrix' ? `Matrix Level` : `Generation`} {selectedLevel}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </div>
      )}

    </div>
  );
};

export default MatrixTree;
