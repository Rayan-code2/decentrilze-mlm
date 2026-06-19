import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { mockApi } from '../lib/mockApi';
import { appwriteService } from '../services/appwriteService';
import { isAppwriteConfigured } from '../lib/appwrite';
import { BRAND_CONFIG } from '../brandConfig';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [sponsorId, setSponsorId] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      setSponsorId(ref);
      setIsSignUp(true);
    }
  }, []);

  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const digitsOnly = val.replace(/\D/g, '');
    setMobile(digitsOnly.slice(0, 10));
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!isAppwriteConfigured()) throw new Error("Simulation mode: Cannot send emails.");
      const res = await appwriteService.requestPasswordReset(email);
      if (res.success) {
        setError("Success: Reset link sent! Check your inbox.");
        setIsForgotPassword(false);
      } else {
        throw new Error(res.message);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const isLive = isAppwriteConfigured();
      if (isSignUp) {
        const digitCount = mobile.replace(/\D/g, '').length;
        if (digitCount !== 10) {
          throw new Error("Mobile number must be exactly 10 digits.");
        }
        if (isLive) {
          const res = await appwriteService.register(email, password, name || "User", sponsorId, mobile);
          if (!res.success) throw new Error(res.message);
        } else {
          await mockApi.auth.signUp(email, password, sponsorId, mobile);
        }
        setError("Node Registered! Please Login.");
        setIsSignUp(false);
      } else {
        if (isLive) {
          await appwriteService.login(email, password);
          const user = await appwriteService.getCurrentUser();
          if (!user) throw new Error("Connection failed. Link not established.");
          onLogin(user);
        } else {
          const { user } = await mockApi.auth.signIn(email, password);
          onLogin(user as any);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-obsidian px-4 py-12 relative overflow-hidden font-sans">
      {/* CYBERNETIC BACKGROUND EFFECTS */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-neon-cyan/10 blur-[120px] rounded-full animate-pulse opacity-60"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-neon-cyan/5 blur-[120px] rounded-full animate-pulse opacity-50" style={{ animationDelay: '3s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,rgba(0,242,255,0.03)_0%,transparent_70%)]"></div>
        {/* Scanline effect */}
        <div className="scanline"></div>
      </div>

      <div className="w-full max-w-[440px] relative z-10 transition-all duration-500">
        <div className="relative">
          {/* Animated Card Border Glow */}
          <div className="absolute -inset-[1px] bg-gradient-to-r from-neon-cyan/20 via-white/5 to-neon-cyan/20 rounded-[2.5rem] blur-[2px] opacity-50"></div>
          
          <div className="relative glass-card p-8 sm:p-12 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-black text-white tracking-tighter mb-2 italic text-center uppercase">
                {isForgotPassword ? 'Reset Access' : (isSignUp ? 'Initiate Node' : 'Establish Link')}
              </h2>
              <div className="flex items-center justify-center gap-2">
                <div className="h-px w-8 bg-neon-cyan/30"></div>
                <p className="data-label text-neon-cyan/60 uppercase">
                  {isForgotPassword ? 'Recovery Protocol' : (isSignUp ? 'System Registration' : 'Credentials Required')}
                </p>
                <div className="h-px w-8 bg-neon-cyan/30"></div>
              </div>
            </div>

            {!isAppwriteConfigured() && (
              <div className="mb-6 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-amber-500 text-[10px] font-black uppercase tracking-widest text-center">
                ⚠️ Simulation Mode Active<br/>
                <span className="text-[8px] opacity-60 italic">Local testing environment</span>
              </div>
            )}

            {error && (
              <div className="space-y-3 mb-6">
                <div className={`p-4 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all text-center ${
                  error.toLowerCase().includes("success") || error.toLowerCase().includes("registered") 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
                    : 'bg-neon-orange/10 text-neon-orange border-neon-orange/20 shadow-[0_0_15px_rgba(255,107,0,0.1)]'
                }`}>
                  {error}
                </div>
              </div>
            )}

            {isForgotPassword ? (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="data-label ml-2">Email</label>
                  <input 
                    type="email" 
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter email address"
                    className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-6 outline-none focus:ring-1 focus:ring-neon-cyan/50 focus:bg-white/[0.05] focus:border-neon-cyan/30 transition-all text-white placeholder:text-white/10 font-medium"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full py-5 rounded-2xl mt-6 disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-obsidian border-t-white/30 rounded-full animate-spin mx-auto"></div>
                  ) : (
                    <span>Send Recovery Link</span>
                  )}
                </button>
                <button 
                  type="button"
                  onClick={() => setIsForgotPassword(false)}
                  className="w-full text-[10px] font-black uppercase tracking-[0.2em] text-white/40 hover:text-neon-cyan transition-colors"
                >
                  Back to Login
                </button>
              </form>
            ) : (
              <>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {isSignUp && (
                    <>
                      <div className="space-y-1.5">
                        <label className="data-label ml-2">Name</label>
                        <input 
                          type="text" 
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Enter full name"
                          className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-6 outline-none focus:ring-1 focus:ring-neon-cyan/50 focus:bg-white/[0.05] focus:border-neon-cyan/30 transition-all text-white placeholder:text-white/10 font-medium"
                        />
                      </div>
                      <div className="space-y-1.5 mt-4 animate-fadeIn">
                        <label className="data-label ml-2">Mobile Number</label>
                        <input 
                          type="tel" 
                          required
                          value={mobile}
                          onChange={handleMobileChange}
                          placeholder="Enter 10-digit mobile number"
                          maxLength={10}
                          className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-6 outline-none focus:ring-1 focus:ring-neon-cyan/50 focus:bg-white/[0.05] focus:border-neon-cyan/30 transition-all text-white placeholder:text-white/10 font-medium"
                        />
                      </div>
                    </>
                  )}

                  <div className="space-y-1.5">
                    <label className="data-label ml-2">Email</label>
                    <input 
                      type="email" 
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter email address"
                      className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-6 outline-none focus:ring-1 focus:ring-neon-cyan/50 focus:bg-white/[0.05] focus:border-neon-cyan/30 transition-all text-white placeholder:text-white/10 font-medium"
                    />
                  </div>

                  {isSignUp && (
                    <div className="space-y-1.5">
                      <label className="data-label ml-2">Sponsor ID</label>
                      <input 
                        type="text" 
                        required
                        value={sponsorId}
                        onChange={(e) => setSponsorId(e.target.value)}
                        placeholder="Enter Sponsor ID"
                        className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-6 outline-none focus:ring-1 focus:ring-neon-cyan/50 focus:bg-white/[0.05] focus:border-neon-cyan/30 transition-all text-white placeholder:text-white/10 font-medium"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between px-2">
                       <label className="data-label">Password</label>
                       {!isSignUp && (
                         <button 
                           type="button"
                           onClick={() => setIsForgotPassword(true)}
                           className="text-[8px] font-black uppercase tracking-widest text-neon-cyan/60 hover:text-neon-cyan transition-colors"
                         >
                           Forgot?
                         </button>
                       )}
                    </div>
                    <input 
                      type="password" 
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-6 outline-none focus:ring-1 focus:ring-neon-cyan/50 focus:bg-white/[0.05] focus:border-neon-cyan/30 transition-all text-white placeholder:text-white/10 tracking-[0.3em]"
                    />
                  </div>

                  <button 
                    type="submit"
                    disabled={loading}
                    className="btn-primary w-full py-5 rounded-2xl mt-6 disabled:opacity-50"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-obsidian border-t-white/30 rounded-full animate-spin mx-auto"></div>
                    ) : (
                      <span>{isSignUp ? 'Initialize Node' : 'Establish Link'}</span>
                    )}
                  </button>
                </form>

                <div className="mt-8 flex flex-col items-center gap-4">
                  <button 
                    onClick={() => {
                      setIsSignUp(!isSignUp);
                      setError(null);
                    }}
                    className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 hover:text-neon-cyan transition-colors"
                  >
                    {isSignUp ? 'ID Exists? Access Terminal' : 'No ID Found? Register Node'}
                  </button>
                  
                  <div className="flex items-center gap-2 py-1.5 px-4 bg-emerald-500/[0.03] border border-emerald-500/10 rounded-full select-none">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981] animate-pulse"></div>
                    <span className="text-[9px] font-black text-emerald-400/60 uppercase tracking-widest">
                      Protocol: Secure Mainnet
                    </span>
                  </div>
                </div>
              </>
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

export default Login;
