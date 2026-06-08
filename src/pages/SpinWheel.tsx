import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Ghost, Skull, Zap, Frown, Bomb, Ban, Sparkles, Gift, Rocket, Trophy, Coins, Flame, Heart, Star, Crown, TrendingDown, RotateCcw } from 'lucide-react';
import { User, Wallet, SpinReward, SpinHistory } from '../types';
import { mockApi } from '../lib/mockApi';
import { appwriteService } from '../services/appwriteService';
import { isAppwriteConfigured } from '../lib/appwrite';
import { Icons } from '../constants';

interface SpinWheelProps {
  user: User;
  wallet: Wallet;
  onRefreshWallet?: (updatedWalletData?: any) => void;
  onOptimisticPurchase?: (price: number) => void;
}

const SpinWheel: React.FC<SpinWheelProps> = ({ user, wallet, onRefreshWallet, onOptimisticPurchase }) => {
  const [rewards, setRewards] = useState<SpinReward[]>([]);
  const [cost, setCost] = useState(1);
  const [settings, setSettings] = useState<any>(null);
  const [userPurchases, setUserPurchases] = useState<any[]>([]);
  const [history, setHistory] = useState<SpinHistory[]>([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [result, setResult] = useState<SpinReward | null>(null);
  const [rotation, setRotation] = useState(0);
  const [spinTransition, setSpinTransition] = useState('transform 1000ms ease-out');
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [walletResult, setWalletResult] = useState<any>(null);

  // Buffer and protect visible wallet balance and free spin energy so updates don't jump ahead of the spinning animation.
  const [displayBalance, setDisplayBalance] = useState<number>(wallet.balance || 0);
  const [displaySpins, setDisplaySpins] = useState<number>(wallet.available_spins || 0);

  useEffect(() => {
    if (!isSpinning) {
      setDisplayBalance(wallet.balance || 0);
      setDisplaySpins(wallet.available_spins || 0);
    }
  }, [wallet.balance, wallet.available_spins, isSpinning]);

  // Helper to resolve a stylish emoji for each reward type
  const getRewardEmoji = (amount: number, label: string): string => {
    const cleanLabel = (label || '').trim().toUpperCase();
    const amt = Number(amount);

    // 1. If the label already has an emoji, extract and return it
    const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;
    const match = cleanLabel.match(emojiRegex);
    if (match && match.length > 0) {
      return match[0];
    }

    // 2. Custom Match rules
    if (cleanLabel.includes('JACKPOT')) return '🏆';
    if (cleanLabel.includes('ZERO') || cleanLabel.includes('TRY AGAIN') || cleanLabel.includes('NULL') || cleanLabel.includes('VOID') || cleanLabel.includes('EMPTY') || amt === 0) {
      if (cleanLabel.includes('ZERO')) return '😢';
      if (cleanLabel.includes('BOOM') || cleanLabel.includes('BOMB') || cleanLabel.includes('EXPLODE')) return '💥';
      return '💀';
    }

    if (amt === 100) return '👑';
    if (amt === 50) return '💎';
    if (amt === 20) return '🔥';
    if (amt === 15) return '⭐';
    if (amt === 10) return '🎁';
    if (amt === 5) return '💵';
    if (amt === 2) return '🪙';
    if (amt === 1) return '⚡';

    if (amt > 50) return '👑';
    if (amt > 20) return '💎';
    if (amt > 10) return '🔥';
    if (amt > 0) return '🪙';

    return '⚡';
  };

  // Helper to detect if a string is an emoji or a special keyword for icons
  const getSegmentContent = (reward: SpinReward, isBlue: boolean) => {
    const label = reward.amount > 0 ? `${reward.amount}$` : (reward.label || 'NULL');
    const emoji = getRewardEmoji(reward.amount, reward.label || label);

    return (
      <div 
        className="flex flex-col items-center justify-center gap-1.5"
        style={{ transform: 'rotate(90deg)' }}
      >
        {/* Emoji standing beautifully above/below */}
        <span className="text-4xl filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] select-none">
          {emoji}
        </span>
        {/* Value tag */}
        <span 
          className="font-display font-black tracking-tighter text-red-500 text-lg uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
          style={{ 
            whiteSpace: 'nowrap',
            textShadow: '0 0 10px rgba(239, 68, 68, 0.4), 0 0 2px black'
          }}
        >
          {label}
        </span>
      </div>
    );
  };

  const FIXED_COLORS = [
    'linear-gradient(180deg, #0047FF 0%, #001A80 100%)', // Deep Blue
    'linear-gradient(180deg, #F0F7FF 0%, #BBD6FF 100%)', // Soft White/Blue
    'linear-gradient(180deg, #0047FF 0%, #001A80 100%)', 
    'linear-gradient(180deg, #F0F7FF 0%, #BBD6FF 100%)', 
    'linear-gradient(180deg, #0047FF 0%, #001A80 100%)', 
    'linear-gradient(180deg, #F0F7FF 0%, #BBD6FF 100%)', 
    'linear-gradient(180deg, #0047FF 0%, #001A80 100%)', 
    'linear-gradient(180deg, #F0F7FF 0%, #BBD6FF 100%)', 
    'linear-gradient(180deg, #0047FF 0%, #001A80 100%)', 
    'linear-gradient(180deg, #F0F7FF 0%, #BBD6FF 100%)', 
    'linear-gradient(180deg, #0047FF 0%, #001A80 100%)', 
    'linear-gradient(180deg, #F0F7FF 0%, #BBD6FF 100%)', 
  ];

  const isQualified = useMemo(() => {
    if (!settings) return false;
    const minPkg = settings.spin_min_pkg_price !== undefined && settings.spin_min_pkg_price !== null ? settings.spin_min_pkg_price : 100;
    const minDirects = settings.spin_min_directs !== undefined && settings.spin_min_directs !== null ? settings.spin_min_directs : 6;
    
    const maxPkgPrice = userPurchases.reduce((max, p: any) => {
      const priceVal = p.price || (p.package_id === 'pkg4' ? 40 : p.package_id === 'pkg3' ? 30 : p.package_id === 'pkg2' ? 20 : p.package_id === 'pkg1' ? 10 : 0);
      return Math.max(max, priceVal);
    }, 0);
    
    const hasPkg = maxPkgPrice >= minPkg;
    const hasDirects = (user.direct_count || 0) >= minDirects;
    return hasPkg || hasDirects;
  }, [settings, userPurchases, user.direct_count]);

  useEffect(() => {
    const fetchData = async () => {
      const isLive = isAppwriteConfigured();
      const api = isLive ? appwriteService : mockApi.db;
      
      const settingsData = await api.getSettings() as any;
      setSettings(settingsData);
      setRewards(settingsData?.spin_rewards || []);
      const rawCost = settingsData?.spin_cost;
      const parsedCost = (rawCost !== undefined && rawCost !== null && rawCost !== '' && !isNaN(Number(rawCost))) ? Number(rawCost) : 1;
      setCost(parsedCost);
      
      const lookupId = user.user_id || user.id;
      const [historyData, purchasesData] = await Promise.all([
        api.getSpinHistory(user.id),
        api.getUserPurchases(lookupId)
      ]);
      setHistory(historyData);
      setUserPurchases(purchasesData || []);
    };
    fetchData();
    if (onRefreshWallet) {
      onRefreshWallet();
    }
  }, [user.id, user.user_id, onRefreshWallet]);

  useEffect(() => {
    setTimeLeft(null);
  }, [settings, history]);

  const handleSpin = async () => {
    if (isSpinning) return;

    // 1. Interactive Qualification Error Check
    if (!isQualified) {
      setError(`Qualification required! Own a $${settings?.spin_min_pkg_price || 100}+ node OR refer ${settings?.spin_min_directs || 6} direct partners.`);
      return;
    }

    // 2. Interactive Cooldown Error Check bypassed

    // 3. Interactive Balance Error Check
    const hasFreeSpins = (wallet.available_spins || 0) > 0 || (displaySpins || 0) > 0;
    const spinCost = hasFreeSpins ? 0 : cost;

    console.log('[SpinWheel DEBUG] starting handleSpin:', {
      hasFreeSpins,
      spinCost,
      cost,
      walletBalance: wallet.balance,
      walletSpins: wallet.available_spins
    });

    if (!hasFreeSpins && wallet.balance < cost) {
      setError(`Insufficient balance! Spin costs $${cost} or requires free spins.`);
      return;
    }

    setError(null);
    setResult(null);
    setIsSpinning(true);

    // Deduct cost and energy/spin immediately in local display states for instant visual feedback on page
    if (spinCost > 0) {
      setDisplayBalance(prev => Number(Math.max(0, prev - spinCost).toFixed(4)));
    }
    if (hasFreeSpins) {
      setDisplaySpins(prev => Math.max(0, prev - 1));
    }

    // Optimistically deduct the spin cost in frontend immediately for fluid user UX
    if (spinCost > 0 && onOptimisticPurchase) {
      onOptimisticPurchase(spinCost);
    }

    // INSTANT FEEDBACK SPINNING ACCELERATION (Phase 1):
    // Start continuous fast spin immediately so user gets real-time response.
    // We target 12 full turns (4320deg) over 10 seconds.
    setSpinTransition('transform 10000ms cubic-bezier(0.4, 0, 0.2, 1)');
    const baseOffset = Math.ceil(rotation / 360) * 360;
    setRotation(baseOffset + 4320);

    const startTime = Date.now();

    try {
      const isLive = isAppwriteConfigured();
      const api = isLive ? appwriteService : mockApi.db;
      
      // We wait for BOTH the API response and a guaranteed 4.0 seconds of high-speed spin
      console.log('[SpinWheel DEBUG] Calling API performSpin for user:', user.id, 'with spinType:', hasFreeSpins ? 'free' : 'paid');
      const apiPromise = api.performSpin(user.id, hasFreeSpins ? 'free' : 'paid');
      const delayPromise = new Promise(resolve => setTimeout(resolve, 4000));
      
      const [response] = await Promise.all([apiPromise, delayPromise]);
      console.log('[SpinWheel DEBUG] API performSpin raw response:', response);
      
      if (response.success && response.reward) {
        // We always show 12 segments visually
        const displayRewards = rewards.length === 12 ? rewards : [...rewards, ...Array(12 - rewards.length).fill({ id: 'dummy', label: '0', amount: 0, probability: 0 })].slice(0, 12);
        
        let rewardIndex = displayRewards.findIndex(r => {
          if (r.id && response.reward?.id && String(r.id) === String(response.reward.id)) return true;
          const rAmount = Number(r.amount);
          const respAmount = Number(response.reward?.amount);
          const rLabel = String(r.label || '').trim().toLowerCase();
          const respLabel = String(response.reward?.label || '').trim().toLowerCase();
          return rLabel === respLabel && rAmount === respAmount;
        });

        // Fallback 1: Match by exact reward amount
        if (rewardIndex === -1) {
          rewardIndex = displayRewards.findIndex(r => Number(r.amount) === Number(response.reward?.amount));
        }

        // Fallback 2: Match by exact reward label
        if (rewardIndex === -1) {
          const respLabel = String(response.reward?.label || '').trim().toLowerCase();
          rewardIndex = displayRewards.findIndex(r => String(r.label || '').trim().toLowerCase() === respLabel);
        }
        
        const visualIndex = rewardIndex >= 0 ? rewardIndex : 0;
        const segmentAngle = 360 / 12;
        
        // Exact angle to align segment center with pointing direction (top center pointer)
        const targetAngle = 360 - (visualIndex * segmentAngle);
        
        // Since we are currently animating towards baseOffset + 4320 (12 full turns),
        // we set the final landing angle further ahead (another 4 full turns of smooth cinematic deceleration).
        // This guarantees a glorious fast spin of 4 seconds, followed by 4.5 seconds of decelerating spin.
        const finalRotation = baseOffset + (16 * 360) + targetAngle;

        // Apply smooth deceleration transition curve (starts fast, winds down beautifully over 4.5 seconds)
        setSpinTransition('transform 4500ms cubic-bezier(0.15, 0.85, 0.35, 1)');
        setRotation(finalRotation);

        // Wait precisely 4.5 seconds for the transition deceleration to finish
        await new Promise((resolve) => setTimeout(resolve, 4500));

        setResult(response.reward);
        if (response.wallet) {
          setWalletResult(response.wallet);
          setDisplayBalance(response.wallet.balance);
          setDisplaySpins(response.wallet.available_spins);
        }
        // We do not refresh the wallet immediately here (to avoid pre-emptive balance jumps while the overlay is shown)
        
        const historyData = await api.getSpinHistory(user.id);
        setHistory(historyData);
      } else {
        // Rollback optimistic purchase for spin wheel fee on failure
        if (spinCost > 0 && onOptimisticPurchase) {
          onOptimisticPurchase(-spinCost);
        }
        // Rollback local display states on failure
        if (spinCost > 0) {
          setDisplayBalance(prev => Number((prev + spinCost).toFixed(4)));
        }
        if (hasFreeSpins) {
          setDisplaySpins(prev => prev + 1);
        }
        // Slow down gracefully to a stop instead of jumping back
        setSpinTransition('transform 2500ms cubic-bezier(0.25, 1, 0.5, 1)');
        setRotation(baseOffset + 4320);
        setError(response.message || 'Spin failed');
      }
    } catch (error: any) {
      console.error('Spin error:', error);
      // Rollback optimistic purchase for spin wheel fee on exception
      if (spinCost > 0 && onOptimisticPurchase) {
        onOptimisticPurchase(-spinCost);
      }
      // Rollback local display states on exception
      if (spinCost > 0) {
        setDisplayBalance(prev => Number((prev + spinCost).toFixed(4)));
      }
      if (hasFreeSpins) {
        setDisplaySpins(prev => prev + 1);
      }
      // Slow down gracefully to a stop instead of jumping back
      setSpinTransition('transform 2500ms cubic-bezier(0.25, 1, 0.5, 1)');
      setRotation(baseOffset + 4320);
      setError(error.message || 'An unexpected error occurred during the spin');
    } finally {
      setIsSpinning(false);
    }
  };

  const displayRewards = rewards.length === 12 ? rewards : [...rewards, ...Array(12 - rewards.length).fill({ id: 'dummy', label: '0', amount: 0, probability: 0 })].slice(0, 12);

  return (
    <div className="min-h-screen flex flex-col items-center justify-start pt-4 pb-20 px-4 relative overflow-x-hidden bg-[#001242]">
      {/* VIBRANT BLUE BACKGROUND EFFECTS */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#00f2ff 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
        <div className="absolute inset-0 bg-gradient-to-b from-[#000814] via-[#001242] to-[#000814]"></div>
        
        {/* Glowing Orbs for Depth */}
        <div className="absolute top-[20%] -left-[10%] w-[50%] h-[50%] bg-blue-600/20 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[20%] -right-[10%] w-[50%] h-[50%] bg-cyan-600/20 blur-[120px] rounded-full"></div>
      </div>

      <div className="flex flex-col items-center relative z-10 w-full max-w-4xl mt-10">
        {/* SPIN WHEEL ASSEMBLY */}
        <div className="relative flex flex-col items-center scale-[0.55] sm:scale-90 md:scale-100 origin-top transition-all duration-700">
          
          {/* OUTER GLOW RING (Image Style) */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border-[12px] border-blue-900/50 shadow-[0_0_100px_rgba(0,71,255,0.3)] flex items-center justify-center">
            
            {/* BULB RING (Casino Lights) */}
            <div className="absolute inset-0 rounded-full">
              {[...Array(24)].map((_, i) => (
                <div 
                  key={`bulb-${i}`}
                  className="absolute w-4 h-4 bg-white rounded-full shadow-[0_0_15px_#fff,0_0_30px_#fff]"
                  style={{
                    top: '50%',
                    left: '50%',
                    transform: `rotate(${i * (360 / 24)}deg) translateY(-288px) translateX(-50%)`,
                    animation: `pulse 2s infinite ${i * 0.1}s`,
                    opacity: i % 2 === 0 ? 1 : 0.7
                  }}
                />
              ))}
            </div>
          </div>

          {/* MAIN CONTAINER */}
          <div className="relative w-[540px] h-[540px] rounded-full p-[15px] bg-[#000814] border-4 border-blue-600 shadow-[0_0_50px_rgba(0,71,255,0.4)] flex items-center justify-center">
            
            {/* POINTER (Styled as image) */}
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center">
              <div className="w-1.5 h-16 bg-white shadow-[0_0_20px_#fff]"></div>
              <div className="w-6 h-6 bg-white rounded-full shadow-[0_0_25px_#fff] -mt-2 border-2 border-blue-600"></div>
            </div>

            {/* THE ROTATING CORE */}
            <div 
              className="w-full h-full rounded-full relative overflow-hidden border-4 border-blue-950 shadow-[inset_0_0_100px_rgba(0,0,0,0.8)]"
              style={{ 
                transform: `rotate(${rotation}deg)`,
                transition: spinTransition
              }}
            >
              {displayRewards.map((reward, index) => {
                const angle = 360 / 12;
                const segmentRotation = index * angle;
                const bgColor = FIXED_COLORS[index % FIXED_COLORS.length];
                const isBlueSegment = bgColor.includes('#0047FF');
                
                return (
                  <div 
                    key={`${reward.id}-${index}`}
                    className="absolute top-0 left-0 w-full h-1/2 origin-bottom flex flex-col items-center"
                    style={{ 
                      transform: `rotate(${segmentRotation}deg)`,
                      clipPath: `polygon(50% 100%, 36.4% 0%, 63.6% 0%)`,
                      background: bgColor,
                    }}
                  >
                    {/* Prize Label Container */}
                    <div className="mt-12 flex flex-col items-center relative z-10">
                      {getSegmentContent(reward, isBlueSegment)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* BLUE CENTER HUB (Image Style) */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
              <div className="w-24 h-24 rounded-full bg-blue-700 border-4 border-white shadow-[0_0_40px_rgba(255,255,255,0.3)] flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent"></div>
                <div className="w-10 h-10 rounded-lg bg-blue-900 border border-white/50 rotate-45 flex items-center justify-center shadow-lg">
                  <div className="w-4 h-4 rounded-full bg-white animate-pulse shadow-[0_0_10px_#fff]"></div>
                </div>
                {/* Rotating decorative ring */}
                <div className="absolute inset-1 border-2 border-dashed border-white/20 rounded-full animate-spin-slow"></div>
              </div>
            </div>
          </div>
        </div>

        {/* INTERFACE CONTROLS */}
        <div className="-mt-52 sm:-mt-20 md:-mt-4 w-full max-w-md space-y-6 relative z-20">
          
          {/* ERROR TOAST AREA */}
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-red-950/80 border-2 border-red-500/50 rounded-2xl backdrop-blur-xl flex items-center justify-between text-left shadow-[0_5px_25px_rgba(239,68,68,0.3)]"
            >
              <div className="flex-1 pr-2">
                <p className="text-xs text-red-200 font-mono">
                  {error}
                </p>
              </div>
              <button 
                onClick={() => setError(null)}
                className="text-red-400 hover:text-white p-2 text-xs font-bold font-mono cursor-pointer"
              >
                ✕
              </button>
            </motion.div>
          )}

          {/* STATUS LABEL */}
          {!isQualified ? (
            <div className="p-4 bg-red-600/20 border border-red-500/30 rounded-2xl backdrop-blur-xl text-center">
              <p className="text-[10px] font-mono font-black text-red-500 uppercase tracking-widest">
                QUALIFICATION REQUIRED<br/>
                <span className="text-white/60">Requires scaling node or directs</span>
              </p>
            </div>
          ) : (
            <div className="p-3 bg-blue-900/40 border border-blue-400/20 rounded-2xl backdrop-blur-xl text-center">
              <p className="text-[10px] font-mono font-black text-cyan-400 uppercase tracking-[0.2em]">
                SYNC SYSTEM ACTIVE
              </p>
            </div>
          )}

          {/* ACTION BUTTON */}
          <button
            onClick={handleSpin}
            disabled={isSpinning}
            className={`group relative w-full py-6 rounded-2xl font-mono font-black uppercase tracking-[0.4em] text-sm transition-all overflow-hidden border-2 cursor-pointer ${
              isSpinning
                ? 'bg-blue-900/20 text-white/20 border-white/10'
                : 'bg-white text-blue-900 border-blue-400 shadow-[0_10px_40px_rgba(0,71,255,0.4)] hover:scale-[1.02] active:scale-95'
            }`}
          >
            <span className="relative z-10">
              {isSpinning ? 'RESONATING...' : 
               !isQualified ? 'LOCKED' :
               timeLeft ? `WAIT ${timeLeft}` : 'SPIN NOW'}
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/10 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite]"></div>
          </button>

          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <div className="p-4 sm:p-5 bg-blue-900/30 border border-blue-400/10 rounded-2xl backdrop-blur-xl">
              <p className="text-[8px] sm:text-[9px] font-mono uppercase text-cyan-400/60 tracking-[0.2em] mb-2">Wallet</p>
              <div className="flex items-baseline gap-1 sm:gap-2">
                <p className="text-lg sm:text-2xl font-mono font-bold text-white pr-1 sm:pr-2 border-r border-[#ffffff1a]">${displayBalance?.toFixed(2) || '0.00'}</p>
                <span className="text-[8px] sm:text-[10px] font-mono text-cyan-400 uppercase">USDT</span>
              </div>
            </div>
            <div className="p-4 sm:p-5 bg-blue-900/30 border border-blue-400/10 rounded-2xl backdrop-blur-xl">
              <p className="text-[8px] sm:text-[9px] font-mono uppercase text-cyan-400/60 tracking-[0.2em] mb-2">Energy</p>
              <div className="flex items-baseline gap-1 sm:gap-2">
                <p className="text-lg sm:text-2xl font-mono font-bold text-white pr-1 sm:pr-2 border-r border-[#ffffff1a]">{displaySpins || 0}</p>
                <span className="text-[8px] sm:text-[10px] font-mono text-cyan-400 uppercase">SPINS</span>
              </div>
            </div>
            <div className="p-4 sm:p-5 bg-blue-900/30 border border-blue-400/10 rounded-2xl backdrop-blur-xl">
              <p className="text-[8px] sm:text-[9px] font-mono uppercase text-cyan-400/60 tracking-[0.2em] mb-2">Cost</p>
              <div className="flex items-baseline gap-1 sm:gap-2">
                {displaySpins > 0 ? (
                  <>
                    <p className="text-sm sm:text-lg font-mono font-bold text-emerald-400 pr-1 sm:pr-2 border-r border-[#ffffff1a] uppercase">FREE</p>
                    <span className="text-[8px] sm:text-[10px] font-mono text-emerald-400 uppercase">1 ENERGY</span>
                  </>
                ) : (
                  <>
                    <p className="text-lg sm:text-2xl font-mono font-bold text-white pr-1 sm:pr-2 border-r border-[#ffffff1a]">${cost}</p>
                    <span className="text-[8px] sm:text-[10px] font-mono text-cyan-400 uppercase">USDT</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* LOGS */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-[1px] flex-1 bg-white/5"></div>
              <h3 className="text-[9px] font-mono uppercase tracking-[0.5em] text-cyan-400/50">Activity Logs</h3>
              <div className="h-[1px] flex-1 bg-white/5"></div>
            </div>
            <div className="space-y-2">
              {history.slice(0, 3).map((item) => (
                <div key={item.id} className="flex justify-between items-center p-4 bg-blue-900/20 border border-white/5 rounded-xl font-mono text-[10px]">
                  <span className="text-white/10">[{new Date(item.created_at).toLocaleTimeString([], { hour12: false })}]</span>
                  <span className="text-white/40 uppercase tracking-wider flex items-center gap-1.5">
                    Sync: <span className="text-red-500 font-bold flex items-center gap-1">{getRewardEmoji(item.amount, item.reward_label)} {item.reward_label}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
 
      {/* RESULT OVERLAY - TECH STYLE */}
      {result && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 flex items-center justify-center z-[100] bg-black/90 backdrop-blur-2xl p-4 sm:p-6"
        >
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="border border-white/10 p-8 sm:p-12 rounded-3xl flex flex-col items-center space-y-6 sm:space-y-8 max-w-md sm:max-w-xl w-full relative bg-gray-950 shadow-[0_0_100px_rgba(204,255,0,0.15)] overflow-hidden text-center"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#ccff00] to-transparent shadow-[0_0_15px_#ccff00]"></div>
            
            <div className="text-center space-y-3 sm:space-y-4 flex flex-col items-center">
              <span className="text-[8px] sm:text-[10px] font-mono font-black uppercase tracking-[0.6em] sm:tracking-[1em] text-[#ccff00] animate-pulse">Sync Successful</span>
              
              {/* Giant animated matching emoji */}
              <motion.div 
                animate={{ 
                  scale: [1, 1.15, 1],
                  rotate: [0, 8, -8, 0]
                }}
                transition={{ 
                  duration: 2.5, 
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="text-8xl sm:text-9xl my-4 select-none filter drop-shadow-[0_10px_20px_rgba(255,255,255,0.2)]"
              >
                {getRewardEmoji(result.amount, result.label)}
              </motion.div>

              <h4 className="text-5xl sm:text-7xl font-display font-black tracking-tighter text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                {result.label}
              </h4>
              <p className="text-[8px] sm:text-[9px] font-mono text-slate-500 uppercase tracking-[0.3em] sm:tracking-[0.4em]">Resource allocated to main wallet</p>
            </div>

            <button 
              onClick={() => {
                setResult(null);
                if (onRefreshWallet) onRefreshWallet(walletResult);
                setWalletResult(null);
              }}
              className="w-full py-4 sm:py-6 border border-white/10 text-white font-mono font-black uppercase tracking-[0.6em] sm:tracking-[0.8em] text-[10px] sm:text-[12px] hover:bg-[#ccff00] hover:text-black transition-all"
            >
              Confirm Packet
            </button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
};

export default SpinWheel;
