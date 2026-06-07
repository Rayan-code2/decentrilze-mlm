# Appwrite Setup Guide

To connect your MLM application to Appwrite, follow these steps to configure your database and collections.

## 1. Create a Database
Create a new database in your Appwrite project and name it (e.g., `mlm_spiral`). Copy the **Database ID** to your `.env` file.

## 2. Create Collections
You need to create the following collections. For each collection, add the specified attributes.

### **users**
- `user_id` (String, Required) - Auth UID
- `email` (String, Required)
- `name` (String, Required)
- `node_id` (String) - Unique system ID (e.g., NX-12345)
- `referred_by` (String) - Sponsor's user_id
- `matrix_parent_id` (String) - Placement parent user_id
- `role` (String) - 'user' or 'admin'
- `is_active` (Boolean) - Default: false
- `direct_count` (Integer) - Total direct referrals
- `created_at` (String/Datetime)
- `mobile` (String, Optional) - User's mobile/phone number

### **wallets**
- `user_id` (String, Required)
- `balance` (Float) - Main spendable balance
- `total_earned` (Float) 
- `total_withdrawn` (Float)
- `direct_income` (Float)
- `level_income` (Float)
- `pool_income` (Float)
- `roi_income` (Float)
- `wallet_roi_earned` (Float) - Progress towards ROI goal
- `daily_package_roi` (Float) - Ticker speed
- `last_roi_at` (String/Datetime)

### **packages** (The Nodes)
- `name` (String, Required)
- `price` (Float, Required)
- `daily_roi` (Float) - Percentage (e.g., 0.5)
- `max_roi_percent` (Float) - Capping (e.g., 200)
- `direct_income_percent` (Float)
- `matrix_income_percent` (Float)
- `level_income_percents` (String) - Serialized Array of amounts (e.g., [2,1,0.5...])
- `id` (String) - Manual ID (e.g., pkg1, pkg2)

### **user_packages** (Active Purchases)
- `user_id` (String, Required)
- `package_id` (String, Required)
- `price` (Float)
- `daily_roi` (Float)
- `roi_earned` (Float) - Current progress towards cap
- `max_roi_percent` (Float)
- `is_active` (Boolean)
- `activated_at` (String/Datetime)

### **transactions**
- `user_id` (String, Required)
- `amount` (Float, Required)
- `type` (String) - 'credit', 'debit', 'roi', 'level_income', etc.
- `description` (String)
- `from_user_id` (String)
- `income_level` (Integer)
- `created_at` (String/Datetime)

### **exchanger_requests**
- `user_id` (String)
- `type` (String) - 'deposit' or 'withdrawal'
- `amount` (Float)
- `status` (String) - 'pending', 'approved', 'rejected'
- `address` (String)
- `txid` (String)
- `created_at` (String/Datetime)

### **settings**
- `min_deposit` (Float)
- `min_withdrawal` (Float)
- `deposit_fee` (Float)
- `withdrawal_fee` (Float)
- `roi_interval_minutes` (Integer)
- `rank_rewards` (String) - JSON Serialized
- `withdrawal_tiers` (String) - JSON Serialized
- `spin_rewards` (String) - JSON Serialized
