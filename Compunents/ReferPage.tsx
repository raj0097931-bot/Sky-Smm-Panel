import React, { useState, useEffect } from 'react';
import { rtdb } from '../firebase';
import { ref, onValue, get, query, orderByChild, equalTo } from 'firebase/database';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'motion/react';
import { Gift, Copy, Share2, Users, ChevronLeft, Check } from 'lucide-react';
import Swal from 'sweetalert2';

interface ReferPageProps {
  onBack: () => void;
}

const ReferPage: React.FC<ReferPageProps> = ({ onBack }) => {
  const { user, rtdbData } = useAuth();
  const [totalInvites, setTotalInvites] = useState(0);
  const [copied, setCopied] = useState(false);
  const [rewardAmount, setRewardAmount] = useState(6);

  useEffect(() => {
    if (!user) return;

    // Fetch dynamic reward in real-time
    const rewardRef = ref(rtdb, 'settings/referralReward');
    const unsubReward = onValue(rewardRef, (snapshot) => {
      if (snapshot.exists()) {
        setRewardAmount(snapshot.val());
      } else {
        setRewardAmount(6); // Default fallback
      }
    });

    const referralsRef = ref(rtdb, 'referrals');
    const q = query(referralsRef, orderByChild('referrerId'), equalTo(user.uid));
    const unsubInvites = onValue(q, (snapshot) => {
      if (snapshot.exists()) {
        setTotalInvites(Object.keys(snapshot.val()).length);
      } else {
        setTotalInvites(0);
      }
    });

    return () => {
      unsubReward();
      unsubInvites();
    };
  }, [user]);

  const referralLink = `https://www.appcreator24.com/app3949606-owhxz0?ref=${rtdbData?.referralCode || ''}`;

  const handleCopy = () => {
    const code = rtdbData?.referralCode || '';
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    Swal.fire({
      icon: 'success',
      title: 'Code Copied!',
      text: `Referral code ${code} copied to clipboard`,
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 2000,
      background: 'var(--card-bg)',
      color: 'var(--text-primary)'
    });
  };

  const handleShare = async () => {
    const shareText = `🚀 Welcome to LuxeServices - Your Premium Social Media Partner!
✨ Boost your Instagram, Facebook, and YouTube presence instantly.
💰 Get high-quality followers, likes, and views at the best prices.
🔒 100% Secure, Fast Delivery, and 24/7 Premium Support.
🎁 Join now using my link and get ${rewardAmount / 2} coins as a welcome bonus!
🔥 Don't wait, start your growth journey today!

Use my referral code: ${rtdbData?.referralCode}
Join here: ${referralLink}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join LuxeServices',
          text: shareText,
          url: referralLink,
        });
      } catch (err) {
        // If user cancels or it fails, we don't necessarily want to force a copy
        console.log('Share cancelled or failed:', err);
      }
    } else {
      // Fallback for browsers that don't support navigator.share (like desktop)
      navigator.clipboard.writeText(shareText);
      Swal.fire({
        icon: 'success',
        title: 'Invitation Copied!',
        text: 'The full invitation message has been copied to your clipboard. You can now paste it in any app like WhatsApp or Telegram.',
        background: 'var(--card-bg)',
        color: 'var(--text-primary)'
      });
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex items-center gap-4 mb-8">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div>
          <h2 className="text-sm font-medium opacity-60 uppercase tracking-widest mb-1" style={{ color: 'var(--text-primary)' }}>Earn Rewards</h2>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Refer & Earn</h1>
        </div>
      </header>

      {/* Hero Card */}
      <div className="glass rounded-[2.5rem] p-8 premium-shadow relative overflow-hidden text-center">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl" />
        <div className="w-20 h-20 rounded-3xl bg-white/10 flex items-center justify-center border border-white/20 mx-auto mb-6">
          <Gift className="w-10 h-10 text-white/80" />
        </div>
        <h3 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Invite Friends & Earn Coins</h3>
        <p className="opacity-60 text-sm mb-8" style={{ color: 'var(--text-primary)' }}>
          Share your referral code with friends. When they sign up, both of you get {rewardAmount / 2} coins!
        </p>

        <div className="space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <p className="text-[10px] opacity-40 uppercase tracking-widest mb-2" style={{ color: 'var(--text-primary)' }}>Your Referral Code</p>
            <p className="text-3xl font-black tracking-widest text-white">{rtdbData?.referralCode || '...'}</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleCopy}
              className="flex-1 glass rounded-2xl p-4 flex items-center justify-center gap-2 hover:bg-white/10 transition-all active:scale-95"
            >
              {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
              <span className="font-bold">Copy Code</span>
            </button>
            <button
              onClick={handleShare}
              className="w-14 h-14 glass rounded-2xl flex items-center justify-center hover:bg-white/10 transition-all active:scale-95"
            >
              <Share2 className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Card */}
      <div className="glass rounded-[2.5rem] p-8 premium-shadow">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center border border-white/10">
            <Users className="w-6 h-6 opacity-80" style={{ color: 'var(--text-primary)' }} />
          </div>
          <div>
            <p className="text-[10px] opacity-40 uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-primary)' }}>Total Invites</p>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{totalInvites} Successful</p>
          </div>
        </div>
      </div>

      {/* Invite Button */}
      <button
        onClick={handleShare}
        className="w-full bg-white text-[#764ba2] font-bold py-5 rounded-[2rem] flex items-center justify-center gap-3 hover:bg-white/90 transition-all active:scale-95 shadow-xl"
        style={{ backgroundColor: 'var(--btn-bg)', color: 'var(--btn-text)' }}
      >
        <Users className="w-6 h-6" />
        Invite Friends Now
      </button>
    </div>
  );
};

export default ReferPage;
