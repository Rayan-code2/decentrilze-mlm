import { LayoutDashboard, Pickaxe, Share2, Layers, Repeat, CheckSquare, History, LogOut, Shield, Menu, Trophy, Gift, Wallet } from 'lucide-react';

export const Icons = {
  Dashboard: Wallet,
  Pools: Layers,
  Network: Share2,
  Exchanger: Repeat,
  Tasks: CheckSquare,
  Income: History,
  Logout: LogOut,
  Shield: Shield,
  Menu: Menu,
  Trophy: Trophy,
  Rewards: Gift,
  Spin: Repeat,
};

export const MLM_CONFIG = {
  JOINING_FEE: 10,
  SPONSOR_INCOME_PERCENT: 20,   // 20% of package price to direct sponsor
  PLACEMENT_INCOME_PERCENT: 10, // 10% of package price to matrix parent
  LEVEL_INCOME_1_TO_8: 0.5,     // $0.50 for levels 1 to 8
  LEVEL_INCOME_9_TO_10: 1.0,    // $1.00 for levels 9 to 10
  MAX_LEVELS: 10,
  MATRIX_WIDTH: 2,              // 2x2 Forced Matrix for Spillover
  MIN_WITHDRAWAL: 10,
  MIN_TOPUP: 10,
  WALLET_DAILY_ROI: 0.002,      // 0.20% daily
  USDT_BUY_RATE: 92.50,         // INR per USDT
  USDT_SELL_RATE: 91.00,        // INR per USDT
  CAPPING_LIMITS: {
    10: 20,
    30: 120,
    60: 600,
    100: Infinity
  },
  LEVEL_UNLOCK_REQS: {
    3: 10,  // Levels 1-3: $10 total investment
    7: 30,  // Levels 1-7: $30 total investment
    10: 60  // Levels 1-10: $60 total investment
  }
};

export const POOL_NAMES = [
  "Voyager", "Explorer", "Commander", "Captain", "Admiral", "Legend", "Titan", "Overlord", "Grandmaster", "Eternal"
];
