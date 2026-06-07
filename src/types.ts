export type UserRole = 'user' | 'admin';

export interface MLMPackage {
  id: string;
  name: string;
  price: number;
  daily_roi: number;
  roi_interval_minutes?: number;
  duration_days: number;
  max_roi_percent?: number;
  direct_income_percent: number;
  matrix_income_percent: number;
  level_income_percents: number[];
  is_active: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  referred_by?: string;
  created_at: string;
  direct_count: number;
  is_qualified: boolean;
  is_blocked?: boolean;
  matrix_parent_id?: string | null;
  global_rank?: number;
  node_id?: string;
  user_id?: string;
  personal_business?: number;
  team_business?: number;
  mobile?: string;
}

export interface Wallet {
  id: string;
  user_id: string;
  balance: number;
  total_earned: number;
  total_withdrawn: number;
  last_roi_at?: string;
  wallet_roi_earned?: number;
  roi_income?: number;
  direct_income?: number;
  level_income?: number;
  matrix_income?: number;
  hold_balance: number;
  total_roi_rate?: number;
  package_roi_rate?: number;
  base_roi_rate?: number;
  daily_package_roi?: number;
  available_spins?: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  reward: number;
  link: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  type: 'roi' | 'level' | 'direct' | 'exchange' | 'task' | 'topup' | 'withdraw' | 'transfer' | 'level_income' | 'direct_income' | 'spin';
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
  description?: string;
  from_user_id?: string;
  income_level?: number;
}

export interface ExchangerRequest {
  id: string;
  user_id: string;
  amount: number;
  type: 'deposit' | 'withdraw';
  status: 'approved' | 'rejected' | 'pending';
  created_at: string;
  inr_amount?: number;
  rate?: number;
  utr_number?: string;
  address?: string;
  network?: string;
  fee?: number;
}

export interface Purchase {
  id: string;
  user_id: string;
  package_id: string;
  price: number;
  daily_roi?: number;
  roi_interval_minutes?: number;
  max_roi_percent?: number;
  roi_earned?: number;
  is_active: boolean;
  activated_at: string;
}

export interface RankReward {
  id: string;
  rank_name: string;
  personal_business: number;
  team_business: number;
  target_depth?: number; // 0 = Total Team, 1-10 = Specific Level
  reward_amount: number;
  icon_type: 'zap' | 'star' | 'award' | 'shield' | 'gift';
}

export interface SpinReward {
  id: string;
  label: string;
  amount: number;
  probability: number; // 0 to 100
  color: string;
}

export interface SpinHistory {
  id: string;
  user_id: string;
  reward_label: string;
  amount: number;
  created_at: string;
}

export interface Settings {
  telegram_link: string;
  marquee_text: string;
  hall_of_fame_marquee: string;
  admin_address_trc20: string;
  admin_address_bep20: string;
  admin_address_erc20: string;
  min_deposit: number;
  min_withdrawal: number;
  max_withdrawal: number;
  boosting_min_directs: number;
  boosting_min_pkg_price: number;
  spin_min_pkg_price: number;
  spin_min_directs: number;
  spin_cooldown_hours: number;
  boosting_reward: number;
  deposit_fee: number;
  withdrawal_fee: number;
  rank_rewards?: RankReward[];
  spin_cost: number;
  spin_rewards: SpinReward[];
  referrals_for_free_spins: number;
  spins_per_milestone: number;
  enable_deposit: boolean;
  enable_withdrawal: boolean;
  roi_interval_minutes?: number;
}
