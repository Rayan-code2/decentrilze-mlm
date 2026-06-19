import React from 'react';
import { Icons } from '../constants';
import { UserRole } from '../types';
import { BRAND_CONFIG } from '../brandConfig';
import { isAppwriteConfigured, getEndpoint, getProjectId } from '../lib/appwrite';
import { Cpu } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  userRole: UserRole;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, userRole, onLogout }) => {
  const isAdmin = String(userRole || '').toLowerCase() === 'admin';
  const isCurrentlyLive = isAppwriteConfigured();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const menuItems = [
    { id: 'wallet', label: 'Wallet', icon: Icons.Dashboard },
    { id: 'leaderboard', label: 'Leaderboard', icon: Icons.Trophy },
    { id: 'rewards', label: 'Rank Rewards', icon: Icons.Rewards },
    { id: 'spin', label: 'Spin Wheel', icon: Icons.Spin },
    { id: 'matrix', label: 'Matrix Tree', icon: Icons.Network },
    { id: 'exchanger', label: 'Exchanger', icon: Icons.Exchanger },
    { id: 'income', label: 'Income Details', icon: Icons.Income },
  ];

  if (isAdmin) {
    menuItems.unshift({ id: 'admin', label: 'Admin Panel', icon: Icons.Shield });
  }

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-72 bg-obsidian/80 backdrop-blur-3xl border-r border-white/5 h-screen sticky top-0 z-50">
        <div className="p-8">
          <div className="mb-12">
            {/* Brand elements removed as per user request */}
          </div>
          
          <nav className="space-y-3">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-500 group relative overflow-hidden ${
                  activeTab === item.id 
                    ? 'bg-neon-cyan text-obsidian font-black shadow-[0_0_30px_rgba(0,242,255,0.15)]' 
                    : 'text-white/40 hover:text-white hover:bg-white/5'
                }`}
              >
                {activeTab === item.id && (
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-50"></div>
                )}
                <item.icon size={20} className={`${activeTab === item.id ? 'scale-110' : 'group-hover:scale-110 transition-transform'}`} />
                <span className="text-xs uppercase font-black tracking-widest relative z-10">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-auto flex flex-col">
          <div className="p-8 pt-2">
            <button 
              onClick={onLogout}
              className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-red-400/60 hover:text-red-400 hover:bg-red-400/10 transition-all duration-300 group"
            >
              <Icons.Logout size={20} className="group-hover:-translate-x-1 transition-transform" />
              <span className="text-xs uppercase font-black tracking-widest">Terminate Session</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Tab Bar - Full Screen Width */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-20 bg-obsidian/90 backdrop-blur-3xl border-t border-white/10 z-50 flex items-center justify-around px-1 shadow-[0_-10px_30px_rgba(0,0,0,0.5)] pb-safe">
        {[
          { id: 'wallet', label: 'Wallet', icon: Icons.Dashboard },
          { id: 'rewards', label: 'Rank', icon: Icons.Rewards },
          { id: 'spin', label: 'Spin', icon: Icons.Spin },
          { id: 'income', label: 'Income', icon: Icons.Income },
          { id: 'exchanger', label: 'Exchange', icon: Icons.Exchanger },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setActiveTab(item.id);
              setIsMobileMenuOpen(false);
            }}
            className={`flex flex-col items-center justify-center transition-all duration-500 relative flex-1 h-full ${
              activeTab === item.id && !isMobileMenuOpen ? 'text-neon-cyan' : 'text-white/40 hover:text-white'
            }`}
          >
            <div className={`flex flex-col items-center gap-1 transition-all duration-500 ${activeTab === item.id && !isMobileMenuOpen ? 'scale-110' : ''}`}>
              <item.icon size={18} className={activeTab === item.id && !isMobileMenuOpen ? 'text-neon-cyan' : ''} />
              <span className={`text-[7px] font-black uppercase tracking-tighter transition-all ${activeTab === item.id && !isMobileMenuOpen ? 'text-neon-cyan opacity-100' : 'opacity-40'}`}>
                {item.label}
              </span>
            </div>
            {activeTab === item.id && !isMobileMenuOpen && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-1 bg-neon-cyan rounded-b-full shadow-[0_0_15px_rgba(0,242,255,0.5)]"></div>
            )}
          </button>
        ))}

        {/* MORE BUTTON (For Admin or other items) */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className={`flex flex-col items-center justify-center transition-all duration-500 relative flex-1 h-full ${
            isMobileMenuOpen ? 'text-neon-cyan' : 'text-white/40 hover:text-white'
          }`}
        >
          <div className={`flex flex-col items-center gap-1 transition-all duration-500 ${isMobileMenuOpen ? 'scale-110' : ''}`}>
            <Icons.Menu size={18} className={isMobileMenuOpen ? 'text-neon-cyan' : ''} />
            <span className={`text-[7px] font-black uppercase tracking-tighter transition-all ${isMobileMenuOpen ? 'text-neon-cyan opacity-100' : 'opacity-40'}`}>
              More
            </span>
          </div>
          {isMobileMenuOpen && (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-1 bg-neon-cyan rounded-b-full shadow-[0_0_15px_rgba(0,242,255,0.5)]"></div>
          )}
        </button>

        {/* MOBILE OVERLAY MENU */}
        {isMobileMenuOpen && (
          <div className="absolute bottom-24 right-4 w-64 bg-obsidian/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl p-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="space-y-2">
              {menuItems.filter(item => !['wallet', 'rewards', 'spin', 'income', 'exchanger'].includes(item.id)).map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${
                    activeTab === item.id ? 'bg-neon-cyan text-obsidian font-black' : 'text-white/40 hover:bg-white/5'
                  }`}
                >
                  <item.icon size={18} />
                  <span className="text-[10px] uppercase font-black tracking-widest">{item.label}</span>
                </button>
              ))}
              <div className="h-[1px] bg-white/5 my-2"></div>
              
              <button
                onClick={onLogout}
                className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-red-400/60 hover:bg-red-400/10 transition-all"
              >
                <Icons.Logout size={18} />
                <span className="text-[10px] uppercase font-black tracking-widest">Logout</span>
              </button>
            </div>
          </div>
        )}
      </nav>
    </>
  );
};

export default Sidebar;
