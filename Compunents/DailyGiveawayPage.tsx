import React, { useState, useEffect } from 'react';
import { ChevronLeft, Gift, User, Link as LinkIcon, Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, query, where, addDoc, serverTimestamp, getDocs, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import Swal from 'sweetalert2';

interface Giveaway {
  id: string;
  category: string;
  serviceId: string;
  serviceName: string;
  categoryIcon: string;
  quantity: number;
  maxUsers: number;
  refresh24h: boolean;
  enabled: boolean;
}

interface Participant {
  id: string;
  giveawayId: string;
  userId: string;
  timestamp: any;
}

const DailyGiveawayPage = ({ onBack }: { onBack: () => void }) => {
  const { user, userData } = useAuth();
  const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
  const [participants, setParticipants] = useState<Record<string, number>>({});
  const [userParticipations, setUserParticipations] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [selectedGiveaway, setSelectedGiveaway] = useState<Giveaway | null>(null);
  const [link, setLink] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'giveaways'), where('enabled', '==', true));
    const unsubGiveaways = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Giveaway));
      setGiveaways(list);
      setLoading(false);
    });

    const unsubParticipants = onSnapshot(collection(db, 'giveaway_participants'), (snapshot) => {
      const counts: Record<string, number> = {};
      const userHistory: Record<string, any> = {};
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        counts[data.giveawayId] = (counts[data.giveawayId] || 0) + 1;
        if (data.userId === user?.uid) {
          if (!userHistory[data.giveawayId] || data.timestamp?.toMillis() > userHistory[data.giveawayId].timestamp?.toMillis()) {
            userHistory[data.giveawayId] = data;
          }
        }
      });
      
      setParticipants(counts);
      setUserParticipations(userHistory);
    });

    return () => {
      unsubGiveaways();
      unsubParticipants();
    };
  }, [user]);

  const handlePlaceOrder = async () => {
    if (!selectedGiveaway || !user) return;
    if (!link.trim()) {
      Swal.fire({
        icon: 'error',
        title: 'Missing Link',
        text: 'Please provide a Profile or Video/Post link.',
        confirmButtonColor: '#06b6d4',
      });
      return;
    }

    const currentParticipants = participants[selectedGiveaway.id] || 0;
    if (currentParticipants >= selectedGiveaway.maxUsers) {
      Swal.fire({
        icon: 'error',
        title: 'Giveaway Full',
        text: 'This giveaway has reached its maximum limit.',
        confirmButtonColor: '#06b6d4',
      });
      return;
    }

    // Check if user already participated
    const lastParticipation = userParticipations[selectedGiveaway.id];
    if (lastParticipation) {
      if (selectedGiveaway.refresh24h) {
        const lastTime = lastParticipation.timestamp?.toMillis() || 0;
        const now = Date.now();
        if (now - lastTime < 24 * 60 * 60 * 1000) {
          const hoursLeft = Math.ceil((24 * 60 * 60 * 1000 - (now - lastTime)) / (60 * 60 * 1000));
          Swal.fire({
            icon: 'warning',
            title: 'Wait!',
            text: `You can participate again in ${hoursLeft} hours.`,
            confirmButtonColor: '#06b6d4',
          });
          return;
        }
      } else {
        Swal.fire({
          icon: 'warning',
          title: 'Already Participated',
          text: 'You have already claimed this giveaway.',
          confirmButtonColor: '#06b6d4',
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // 1. Place order via SMM API
      const apiResponse = await fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: (selectedGiveaway as any).api_service_id || selectedGiveaway.serviceId,
          link: link,
          quantity: selectedGiveaway.quantity
        })
      });

      let apiData;
      try {
        apiData = await apiResponse.json();
      } catch (err) {
        if (!apiResponse.ok) {
          throw new Error(`Server error (${apiResponse.status}): Failed to place order. Please try again.`);
        }
        throw new Error("Failed to parse SMM response as JSON. Please try again.");
      }
      
      if (!apiResponse.ok || apiData?.error) {
        throw new Error(apiData?.error || 'Failed to place order on SMM panel');
      }

      const smmOrderId = apiData?.order;
      if (!smmOrderId) {
        throw new Error('SMM Panel did not return an order ID. Please contact support.');
      }

      // 2. Add to participants
      await addDoc(collection(db, 'giveaway_participants'), {
        giveawayId: selectedGiveaway.id,
        userId: user.uid,
        userName: userData?.name || 'User',
        userEmail: user.email,
        timestamp: serverTimestamp()
      });

      // 3. Create actual order in Firestore for user history
      await addDoc(collection(db, 'orders'), {
        userId: user.uid,
        userName: userData?.name || 'User',
        serviceId: selectedGiveaway.serviceId,
        api_service_id: (selectedGiveaway as any).api_service_id || selectedGiveaway.serviceId || null,
        api_order_id: String(smmOrderId),
        serviceName: selectedGiveaway.serviceName,
        category: selectedGiveaway.category,
        quantity: selectedGiveaway.quantity,
        link: link,
        price: 0,
        status: 'Pending',
        isGiveaway: true,
        createdAt: serverTimestamp()
      });

      Swal.fire({
        icon: 'success',
        title: 'Order Placed!',
        text: 'Your giveaway order has been submitted successfully.',
        confirmButtonColor: '#06b6d4',
      });
      
      setLink('');
      setSelectedGiveaway(null);
    } catch (error: any) {
      console.error('Error placing giveaway order:', error);
      let errorMessage = error.message || 'Failed to place order. Please try again.';
      
      if (errorMessage.toLowerCase().includes('out of balance')) {
        errorMessage = 'This giveaway is currently unavailable (Admin balance low). Please try again later.';
      }

      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: errorMessage,
        confirmButtonColor: '#06b6d4',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex flex-col overflow-hidden" style={{ background: 'var(--bg-gradient)' }}>
      {/* Header */}
      <div className="relative z-10 px-6 pt-20 pb-6 flex items-center justify-between shrink-0">
        <button 
          onClick={onBack}
          className="p-3 bg-black/20 hover:bg-black/40 rounded-2xl transition-all border border-white/10 group backdrop-blur-md"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        <div className="flex items-center gap-3 px-4 py-2 bg-black/20 rounded-full border border-white/10 backdrop-blur-md">
          <Gift className="w-5 h-5 text-cyan-400" />
          <span className="text-[10px] font-black uppercase tracking-widest text-white">Daily Giveaway</span>
        </div>
      </div>

      {/* Content Area */}
      <div className="relative z-10 flex-1 overflow-y-auto px-6 pb-24 custom-scrollbar">
        <div className="max-w-md mx-auto space-y-6 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
              <p className="text-xs font-black text-white/40 uppercase tracking-widest">Loading Giveaways...</p>
            </div>
          ) : giveaways.length === 0 ? (
            <div className="text-center py-20 space-y-4">
              <div className="w-20 h-20 bg-white/5 rounded-[2rem] flex items-center justify-center mx-auto border border-white/10">
                <Gift className="w-10 h-10 text-white/20" />
              </div>
              <p className="text-white/40 font-bold">No active giveaways at the moment.</p>
            </div>
          ) : (
            <>
              {/* Active Giveaways List */}
              <div className="space-y-4">
                <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-2">Active Giveaways</p>
                <div className="grid grid-cols-1 gap-3">
                  {giveaways.map((giveaway) => {
                    const count = participants[giveaway.id] || 0;
                    const isFull = count >= giveaway.maxUsers;
                    const isSelected = selectedGiveaway?.id === giveaway.id;
                    const hasParticipated = !!userParticipations[giveaway.id];
                    
                    // Check if 24h refresh is active and if user can participate again
                    let canParticipateAgain = true;
                    if (hasParticipated && giveaway.refresh24h) {
                      const lastTime = userParticipations[giveaway.id].timestamp?.toMillis() || 0;
                      const now = Date.now();
                      if (now - lastTime < 24 * 60 * 60 * 1000) {
                        canParticipateAgain = false;
                      }
                    } else if (hasParticipated && !giveaway.refresh24h) {
                      canParticipateAgain = false;
                    }

                    return (
                      <motion.button
                        key={giveaway.id}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setSelectedGiveaway(giveaway)}
                        disabled={isFull && !isSelected}
                        className={`w-full p-4 rounded-2xl border transition-all text-left relative overflow-hidden flex items-center justify-between ${
                          isSelected 
                            ? 'bg-cyan-500/20 border-cyan-500/50 shadow-lg shadow-cyan-500/10' 
                            : isFull 
                              ? 'bg-white/5 border-white/5 opacity-50 cursor-not-allowed'
                              : 'bg-black/20 border-white/5 hover:bg-black/30'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <span className="text-xl">{giveaway.categoryIcon}</span>
                            {!canParticipateAgain && (
                              <div className="absolute -top-1 -right-1 bg-green-500 rounded-full p-0.5 border border-black">
                                <CheckCircle2 className="w-2 h-2 text-white" />
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-black text-white leading-tight">{giveaway.serviceName}</p>
                              {!canParticipateAgain && (
                                <span className="text-[7px] font-black bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full uppercase tracking-tighter">Claimed</span>
                              )}
                            </div>
                            <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mt-0.5">{giveaway.category}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-[10px] font-black ${isFull ? 'text-red-400' : 'text-cyan-400'}`}>{count}/{giveaway.maxUsers}</p>
                          <p className="text-[8px] font-bold text-white/20 uppercase">Slots</p>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Order Form Style UI */}
              <AnimatePresence mode="wait">
                {selectedGiveaway && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="space-y-5 pt-2"
                  >
                    <div className="h-px bg-white/5" />
                    
                    {/* Progress Bar (Slots Availability) */}
                    <div className="space-y-2 px-2">
                      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                        <span className="text-white/30">Slots Availability</span>
                        <span className="text-cyan-400">
                          {participants[selectedGiveaway.id] || 0} / {selectedGiveaway.maxUsers}
                        </span>
                      </div>
                      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, ((participants[selectedGiveaway.id] || 0) / selectedGiveaway.maxUsers) * 100)}%` }}
                          className={`h-full rounded-full shadow-[0_0_10px_rgba(6,182,212,0.3)] ${
                            ((participants[selectedGiveaway.id] || 0) / selectedGiveaway.maxUsers) >= 1 
                              ? 'bg-red-500 shadow-red-500/20' 
                              : 'bg-cyan-500'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Category (Disabled) */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-2">Category</label>
                      <div className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-5 text-white/40 font-bold cursor-not-allowed">
                        {selectedGiveaway.categoryIcon} {selectedGiveaway.category}
                      </div>
                    </div>

                    {/* Service (Disabled) */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-2">Service</label>
                      <div className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-5 text-white/40 font-bold cursor-not-allowed truncate">
                        {selectedGiveaway.serviceName}
                      </div>
                    </div>

                    {/* Link (Editable) */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-2 flex items-center gap-2">
                        Link
                      </label>
                      <input
                        type="text"
                        placeholder="Enter Instagram Link"
                        className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-5 text-white font-bold focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition-all placeholder:text-white/10 shadow-inner"
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                      />
                    </div>

                    {/* Quantity (Disabled) */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-2">Quantity</label>
                      <div className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-5 text-white/40 font-bold cursor-not-allowed">
                        {selectedGiveaway.quantity}
                      </div>
                      <p className="text-[9px] font-black text-cyan-400/60 uppercase tracking-widest ml-2">
                        Minimum Order Limit: {selectedGiveaway.quantity}
                      </p>
                    </div>

                    {/* Charge (Fixed) */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-2">Charge</label>
                      <div className="w-full bg-cyan-500/10 border border-cyan-500/20 rounded-2xl py-4 px-5 text-cyan-400 font-black text-xl">
                        ₹0.00
                      </div>
                    </div>

                    <button
                      onClick={handlePlaceOrder}
                      disabled={isSubmitting}
                      className="w-full bg-cyan-500 text-white py-5 rounded-2xl font-black text-lg shadow-2xl shadow-cyan-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:scale-100 mt-4"
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : (
                        <>
                          <Send className="w-6 h-6" />
                          Submit
                        </>
                      )}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="relative z-10 p-8 border-t border-white/5 shrink-0">
        <p className="text-[10px] text-white/20 text-center font-bold uppercase tracking-widest">
          Daily Giveaway System • Free Rewards
        </p>
      </div>
    </div>
  );
};

export default DailyGiveawayPage;
