import React, { useState, useEffect } from 'react';
import { appwriteService } from '../services/appwriteService';
import { BRAND_CONFIG } from '../brandConfig';

const ResetPassword: React.FC = () => {
  const [password, setPassword] = useState('');
  const [passwordAgain, setPasswordAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [userId, setUserId] = useState('');
  const [secret, setSecret] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const userIdParam = params.get('userId');
    const secretParam = params.get('secret');

    if (userIdParam && secretParam) {
      setUserId(userIdParam);
      setSecret(secretParam);
    } else {
      setError("Invalid or expired reset link.");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== passwordAgain) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await appwriteService.resetPassword(userId, secret, password, passwordAgain);
      if (res.success) {
        setSuccess(true);
      } else {
        throw new Error(res.message);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-obsidian px-4 py-12 relative overflow-hidden font-sans">
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-neon-cyan/10 blur-[120px] rounded-full animate-pulse opacity-60"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-neon-cyan/5 blur-[120px] rounded-full animate-pulse opacity-50"></div>
      </div>

      <div className="w-full max-w-[440px] relative z-10">
        <div className="relative">
          <div className="absolute -inset-[1px] bg-gradient-to-r from-neon-cyan/20 via-white/5 to-neon-cyan/20 rounded-[2.5rem] blur-[2px] opacity-50"></div>
          
          <div className="relative glass-card p-8 sm:p-12 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-black text-white tracking-tighter mb-2 italic uppercase">
                New Credentials
              </h2>
              <div className="flex items-center justify-center gap-2">
                <div className="h-px w-8 bg-neon-cyan/30"></div>
                <p className="data-label text-neon-cyan/60 uppercase">Reset Protocol</p>
                <div className="h-px w-8 bg-neon-cyan/30"></div>
              </div>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-xl bg-neon-orange/10 text-neon-orange border border-neon-orange/20 text-[10px] font-black uppercase tracking-widest text-center shadow-[0_0_15px_rgba(255,107,0,0.1)]">
                {error}
              </div>
            )}

            {success ? (
              <div className="text-center space-y-6">
                <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <p className="text-xs font-black uppercase tracking-[0.2em] mb-2">Password Reset Successful</p>
                  <p className="text-[10px] opacity-60">Your access has been restored. System link verified.</p>
                </div>
                <button 
                  onClick={() => window.location.href = '/'}
                  className="btn-primary w-full py-5 rounded-2xl"
                >
                  Return to Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="data-label ml-2">New Password</label>
                  <input 
                    type="password" 
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-6 outline-none focus:ring-1 focus:ring-neon-cyan/50 focus:bg-white/[0.05] focus:border-neon-cyan/30 transition-all text-white placeholder:text-white/10 tracking-[0.3em]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="data-label ml-2">Confirm Password</label>
                  <input 
                    type="password" 
                    required
                    value={passwordAgain}
                    onChange={(e) => setPasswordAgain(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-6 outline-none focus:ring-1 focus:ring-neon-cyan/50 focus:bg-white/[0.05] focus:border-neon-cyan/30 transition-all text-white placeholder:text-white/10 tracking-[0.3em]"
                  />
                </div>

                <button 
                  type="submit"
                  disabled={loading || !!error}
                  className="btn-primary w-full py-5 rounded-2xl mt-6 disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-obsidian border-t-white/30 rounded-full animate-spin mx-auto"></div>
                  ) : (
                    <span>Update Password</span>
                  )}
                </button>
                <button 
                  type="button"
                  onClick={() => window.location.href = '/'}
                  className="w-full text-[10px] font-black uppercase tracking-[0.2em] text-white/40 hover:text-neon-cyan transition-colors"
                >
                  Cancel
                </button>
              </form>
            )}
          </div>
        </div>
        
        <p className="mt-8 text-center text-[8px] font-black text-white/10 uppercase tracking-[0.5em] animate-pulse">
          CORE V4.2.0 • {BRAND_CONFIG.name} NETWORK
        </p>
      </div>
    </div>
  );
};

export default ResetPassword;
