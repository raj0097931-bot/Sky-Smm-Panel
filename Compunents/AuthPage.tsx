import React, { useState, useEffect } from 'react';
import { auth, db, rtdb } from '../firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc, updateDoc } from 'firebase/firestore';
import { ref, get, set, push, update, query, orderByChild, equalTo, runTransaction } from 'firebase/database';
import Swal from 'sweetalert2';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, User, Phone, ArrowRight, Loader2, Gift } from 'lucide-react';

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showReferralInput, setShowReferralInput] = useState(false);
  const [manualReferralCode, setManualReferralCode] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: ''
  });

  const getDeviceId = () => {
    let deviceId = localStorage.getItem('luxe_device_id');
    if (!deviceId) {
      deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('luxe_device_id', deviceId);
    }
    return deviceId;
  };

  const getUserIp = async () => {
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      return data.ip;
    } catch (e) {
      return 'unknown';
    }
  };

  const checkSignupLimit = async (deviceId: string, ip: string) => {
    // 1. Check if Device is Pinned (Admin Bypass)
    const pinnedSnap = await get(ref(rtdb, `pinned_devices/${deviceId}`));
    if (pinnedSnap.exists() && pinnedSnap.val() === true) {
      return true; // Pinned device allowed to create multiple accounts
    }

    // Fetch configurable limit (default 24h)
    const limitSnap = await get(ref(rtdb, 'settings/signup_limit_hours'));
    const limitHours = limitSnap.exists() ? limitSnap.val() : 24;
    const limitMs = limitHours * 60 * 60 * 1000;
    const limitStartTime = Date.now() - limitMs;

    const ipKey = ip.replace(/\./g, '_');
    
    // 2. Check by Device ID
    const deviceSnap = await get(ref(rtdb, `security_tracking/last_device/${deviceId}`));
    if (deviceSnap.exists()) {
      const data = deviceSnap.val();
      if (data.createdAt > limitStartTime) {
        // Check if this specific user has bypass permission
        const bypassSnap = await get(ref(rtdb, `bypass_users/${data.userId}`));
        if (!(bypassSnap.exists() && bypassSnap.val() === true)) {
          return false; // Limit reached
        }
      }
    }

    // 3. Check by IP
    if (ip !== 'unknown') {
      const ipSnap = await get(ref(rtdb, `security_tracking/last_ip/${ipKey}`));
      if (ipSnap.exists()) {
        const data = ipSnap.val();
        if (data.createdAt > limitStartTime) {
          // Check if this specific user has bypass permission
          const bypassSnap = await get(ref(rtdb, `bypass_users/${data.userId}`));
          if (!(bypassSnap.exists() && bypassSnap.val() === true)) {
            return false; // Limit reached
          }
        }
      }
    }

    return true; // No recent account found or bypass allowed
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, formData.email, formData.password);
        Swal.fire({
          icon: 'success',
          title: 'Welcome Back!',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          background: 'var(--card-bg)',
          color: 'var(--text-primary)'
        });
      } else {
        // Anti-fraud check
        const deviceId = getDeviceId();
        const ip = await getUserIp();
        const timestamp = Date.now();
        
        const isAllowed = await checkSignupLimit(deviceId, ip);
        if (!isAllowed) {
          throw new Error("Multiple accounts are not allowed. Warning: If you try again, all your old accounts will be deleted.");
        }

        const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
        const user = userCredential.user;

        // Referral Logic
        const pendingRefCode = manualReferralCode || localStorage.getItem('pending_referral_code');
        let referredBy = null;
        const myReferralCode = 'REF' + Math.random().toString(36).substring(2, 7).toUpperCase();

        if (pendingRefCode) {
          const usersRef = ref(rtdb, 'users');
          const q = query(usersRef, orderByChild('referralCode'), equalTo(pendingRefCode));
          const snapshot = await get(q);
          
          if (snapshot.exists()) {
            const referrerData = snapshot.val();
            const referrerId = Object.keys(referrerData)[0];
            referredBy = referrerId;

            // Fetch dynamic reward from settings
            const rewardSnap = await get(ref(rtdb, 'settings/referralReward'));
            const totalReward = rewardSnap.exists() ? rewardSnap.val() : 6;
            const rewardPerUser = totalReward / 2;

            // Reward Referrer (RTDB)
            const referrerCoinsRef = ref(rtdb, `users/${referrerId}/coins`);
            await runTransaction(referrerCoinsRef, (current) => (current || 0) + rewardPerUser);

            // Reward Referrer (Firestore)
            const referrerDocRef = doc(db, 'users', referrerId);
            const referrerSnap = await getDoc(referrerDocRef);
            if (referrerSnap.exists()) {
              const currentBalance = referrerSnap.data().walletBalance || 0;
              await updateDoc(referrerDocRef, {
                walletBalance: currentBalance + rewardPerUser,
                updatedAt: serverTimestamp()
              });
            }

            // Create tracking record
            const referralTrackRef = push(ref(rtdb, 'referrals'));
            await set(referralTrackRef, {
              referrerId,
              newUserId: user.uid,
              reward: rewardPerUser,
              time: timestamp
            });

            // Update user record in RTDB
            await set(ref(rtdb, `users/${user.uid}`), {
              name: formData.name,
              email: formData.email,
              coins: rewardPerUser,
              referralCode: myReferralCode,
              referredBy: referredBy,
              createdAt: timestamp
            });

            // Update user document in Firestore
            await setDoc(doc(db, 'users', user.uid), {
              name: formData.name,
              email: formData.email,
              phone: formData.phone,
              walletBalance: rewardPerUser,
              selectedTheme: 'premium',
              createdAt: serverTimestamp()
            });
          } else {
            // No valid referral found, create normal record
            await set(ref(rtdb, `users/${user.uid}`), {
              name: formData.name,
              email: formData.email,
              coins: 0,
              referralCode: myReferralCode,
              referredBy: null,
              createdAt: timestamp
            });

            await setDoc(doc(db, 'users', user.uid), {
              name: formData.name,
              email: formData.email,
              phone: formData.phone,
              walletBalance: 0,
              selectedTheme: 'premium',
              createdAt: serverTimestamp()
            });
          }
        } else {
          // No referral code at all
          await set(ref(rtdb, `users/${user.uid}`), {
            name: formData.name,
            email: formData.email,
            coins: 0,
            referralCode: myReferralCode,
            referredBy: null,
            createdAt: timestamp
          });

          await setDoc(doc(db, 'users', user.uid), {
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            walletBalance: 0,
            selectedTheme: 'premium',
            createdAt: serverTimestamp()
          });
        }

        localStorage.removeItem('pending_referral_code');

        // Store tracking data in RTDB
        const ipKey = ip.replace(/\./g, '_');
        
        // 1. Store consolidated log for Admin
        const logRef = ref(rtdb, `security_tracking/logs/${deviceId}`);
        const logSnap = await get(logRef);
        const newUserInfo = {
          uid: user.uid,
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          timestamp
        };

        if (logSnap.exists()) {
          const existing = logSnap.val();
          const accounts = existing.accounts || [];
          // If accounts was just strings before, we handle it
          const updatedAccounts = Array.isArray(accounts) 
            ? [...accounts, newUserInfo]
            : [newUserInfo];

          await update(logRef, {
            ip,
            accounts: updatedAccounts,
            count: (existing.count || 1) + 1,
            createdAt: timestamp // Update last signup time
          });
        } else {
          await set(logRef, {
            deviceId,
            ip,
            accounts: [newUserInfo],
            count: 1,
            createdAt: timestamp
          });
        }

        // 2. Store pointers for fast lookup (Index-free)
        await set(ref(rtdb, `security_tracking/last_device/${deviceId}`), { userId: user.uid, createdAt: timestamp });
        if (ip !== 'unknown') {
          await set(ref(rtdb, `security_tracking/last_ip/${ipKey}`), { userId: user.uid, createdAt: timestamp });
        }

        Swal.fire({
          icon: 'success',
          title: 'Account Created!',
          text: 'Welcome to LuxeServices Premium',
          background: 'var(--card-bg)',
          color: 'var(--text-primary)'
        });
      }
    } catch (error: any) {
      Swal.fire({
        icon: 'error',
        title: isLogin ? 'Authentication Failed' : 'Registration Failed',
        text: error.message,
        background: 'var(--card-bg)',
        color: 'var(--text-primary)'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm glass rounded-3xl p-8 premium-shadow"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>LuxeServices</h1>
          <p className="opacity-60" style={{ color: 'var(--text-primary)' }}>{isLogin ? 'Sign in to your account' : 'Create your premium account'}</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <AnimatePresence mode="wait">
            {!isLogin && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4"
              >
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 opacity-40" style={{ color: 'var(--text-primary)' }} />
                  <input
                    type="text"
                    placeholder="Full Name"
                    required
                    className="w-full bg-white/10 border border-white/20 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-white/50 transition-colors"
                    style={{ color: 'var(--text-primary)' }}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 opacity-40" style={{ color: 'var(--text-primary)' }} />
                  <input
                    type="tel"
                    placeholder="Phone Number"
                    required
                    className="w-full bg-white/10 border border-white/20 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-white/50 transition-colors"
                    style={{ color: 'var(--text-primary)' }}
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 opacity-40" style={{ color: 'var(--text-primary)' }} />
            <input
              type="email"
              placeholder="Email Address"
              required
              className="w-full bg-white/10 border border-white/20 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-white/50 transition-colors"
              style={{ color: 'var(--text-primary)' }}
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 opacity-40" style={{ color: 'var(--text-primary)' }} />
            <input
              type="password"
              placeholder="Password"
              required
              className="w-full bg-white/10 border border-white/20 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-white/50 transition-colors"
              style={{ color: 'var(--text-primary)' }}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>

          {!isLogin && (
            <div className="space-y-3">
              {!showReferralInput ? (
                <button
                  type="button"
                  onClick={() => setShowReferralInput(true)}
                  className="text-xs font-medium opacity-60 hover:opacity-100 transition-opacity flex items-center gap-1 mx-auto"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Gift className="w-3 h-3" />
                  Have a referral code?
                </button>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="relative"
                >
                  <Gift className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 opacity-40" style={{ color: 'var(--text-primary)' }} />
                  <input
                    type="text"
                    placeholder="Referral Code (Optional)"
                    className="w-full bg-white/10 border border-white/20 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-white/50 transition-colors uppercase"
                    style={{ color: 'var(--text-primary)' }}
                    value={manualReferralCode}
                    onChange={(e) => setManualReferralCode(e.target.value.toUpperCase())}
                  />
                </motion.div>
              )}
            </div>
          )}

          <button
            disabled={loading}
            className="w-full bg-white text-[#764ba2] font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-white/90 transition-all active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: 'var(--btn-bg)', color: 'var(--btn-text)' }}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                {isLogin ? 'Sign In' : 'Create Account'}
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="opacity-60 hover:opacity-100 transition-colors"
            style={{ color: 'var(--text-primary)' }}
          >
            {isLogin ? "Don't have an account? Register" : 'Already have an account? Login'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default AuthPage;
