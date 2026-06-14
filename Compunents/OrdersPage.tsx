import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Order } from '../types';
import { formatCurrency, formatDate } from '../utils';
import { motion, AnimatePresence } from 'motion/react';
import { ClipboardList, Clock, CheckCircle2, XCircle, Loader2, RefreshCcw, RotateCcw, Copy } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import Swal from 'sweetalert2';

const OrdersPage = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refillingId, setRefillingId] = useState<string | null>(null);

  const checkStatus = async (order: Order) => {
    if (!order.api_order_id) return;
    try {
      const response = await fetch(`/api/order-status/${order.api_order_id}`);
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      
      let data;
      try {
        data = await response.json();
      } catch (err) {
        throw new Error(`Failed to parse response for order status. (Status: ${response.status})`);
      }
      console.log(`Manual check for order ${order.api_order_id}:`, data);
      
      if (data?.status) {
        let apiStatus = String(data.status).toLowerCase();
        let newStatus = order.status;

        if (apiStatus.includes('pending')) {
          newStatus = 'Pending';
        } else if (apiStatus.includes('processing') || apiStatus.includes('progress') || apiStatus.includes('active')) {
          newStatus = 'Processing';
        } else if (apiStatus.includes('completed') || apiStatus.includes('success') || apiStatus.includes('done') || apiStatus.includes('finish')) {
          newStatus = 'Completed';
        } else if (apiStatus.includes('cancel') || apiStatus.includes('partial') || apiStatus.includes('refund') || apiStatus.includes('fail')) {
          newStatus = 'Cancelled';
        }
        
        if (newStatus !== order.status) {
          await updateDoc(doc(db, 'orders', order.id), {
            status: newStatus,
            updatedAt: serverTimestamp()
          });
          return true; // Status was updated
        }
      }
      return false;
    } catch (error) {
      console.error('Error checking status:', error);
      return false;
    }
  };

  const handleRefill = async (order: Order) => {
    if (!order.api_order_id) return;

    // Check 24h cooldown
    if (order.lastRefillAt) {
      const lastRefill = order.lastRefillAt.toDate();
      const now = new Date();
      const diffHours = (now.getTime() - lastRefill.getTime()) / (1000 * 60 * 60);
      if (diffHours < 24) {
        const remainingHours = Math.ceil(24 - diffHours);
        Swal.fire({
          icon: 'info',
          title: 'Refill Cooldown',
          text: `You can request another refill after ${remainingHours} hours.`,
          background: 'var(--card-bg)',
          color: 'var(--text-primary)'
        });
        return;
      }
    }

    const result = await Swal.fire({
      title: 'Request Refill?',
      html: `
        <div class="text-left space-y-4 text-sm opacity-80">
          <p class="font-bold text-rose-500 uppercase tracking-widest text-[10px]">Important Notice</p>
          <p>Ex:- Agar aapne 1k Instagram followers badhaye hain, aur aapke 0 follower the, ab 1.3k ho gaye hain (300 extra), toh agar yeh 300 drop hote hain toh refill nahi hoga.</p>
          <p>Refill tabhi hoga jab followers aapke ordered quantity (1k) se kam honge. Agar 1k se kam hote hain toh followers refill ho jayenge.</p>
          <p class="text-[10px] italic">Note: Refill request will be sent to the SMM panel for this specific order ID.</p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Refill',
      cancelButtonText: 'Cancel',
      confirmButtonColor: 'var(--accent-color)',
      background: 'var(--card-bg)',
      color: 'var(--text-primary)'
    });

    if (result.isConfirmed) {
      setRefillingId(order.id);
      try {
        const response = await fetch('/api/refill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: order.api_order_id })
        });

        let data;
        try {
          data = await response.json();
        } catch (err) {
          if (!response.ok) {
            throw new Error(`Server error (${response.status}): Failed to send refill request.`);
          }
          throw new Error("Failed to parse refill response. Please try again.");
        }

        if (response.ok && !data?.error) {
          await updateDoc(doc(db, 'orders', order.id), {
            lastRefillAt: serverTimestamp(),
            refillCount: (order.refillCount || 0) + 1
          });

          Swal.fire({
            icon: 'success',
            title: 'Refill Requested',
            text: 'Your refill request has been sent successfully.',
            background: 'var(--card-bg)',
            color: 'var(--text-primary)'
          });
        } else {
          throw new Error(data.error || 'Failed to send refill request');
        }
      } catch (error: any) {
        Swal.fire({
          icon: 'error',
          title: 'Refill Failed',
          text: error.message,
          background: 'var(--card-bg)',
          color: 'var(--text-primary)'
        });
      } finally {
        setRefillingId(null);
      }
    }
  };

  const isRefillable = (order: Order) => {
    // Check if service name or category contains "Refill" or "rifile"
    const name = (order.serviceName || '').toLowerCase();
    const category = (order.category || '').toLowerCase();
    
    // Broad keyword matching for refill
    const refillKeywords = ['refill', 'rifile', 'refil', 'rifil', '♻️', 'rfl'];
    const hasRefillKeyword = refillKeywords.some(kw => name.includes(kw) || category.includes(kw));
    
    // Hide if cancelled or failed
    const s = order.status.toLowerCase();
    if (s.includes('cancel') || s.includes('fail') || s.includes('refund')) return false;

    // Show for others if keyword matches
    return hasRefillKeyword;
  };

  const getCooldownStatus = (order: Order) => {
    if (!order.lastRefillAt) return { active: false };
    const lastRefill = order.lastRefillAt.toDate();
    const now = new Date();
    const diffHours = (now.getTime() - lastRefill.getTime()) / (1000 * 60 * 60);
    return {
      active: diffHours < 24,
      remaining: Math.ceil(24 - diffHours)
    };
  };

  const refreshStatuses = async () => {
    setRefreshing(true);
    const pendingOrders = orders.filter(o => o.status === 'Pending' || o.status === 'Processing');
    let updatedCount = 0;
    for (const order of pendingOrders) {
      const updated = await checkStatus(order);
      if (updated) updatedCount++;
    }
    setRefreshing(false);
    
    if (updatedCount > 0) {
      Swal.fire({
        icon: 'success',
        title: 'Statuses Updated',
        text: `${updatedCount} order(s) have been updated to their latest status.`,
        timer: 2000,
        showConfirmButton: false,
        background: 'var(--card-bg)',
        color: 'var(--text-primary)'
      });
    } else if (pendingOrders.length > 0) {
      Swal.fire({
        icon: 'info',
        title: 'No Changes',
        text: 'All orders are already up to date with the SMM panel.',
        timer: 1500,
        showConfirmButton: false,
        background: 'var(--card-bg)',
        color: 'var(--text-primary)'
      });
    }
  };

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'orders'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      
      // Sort client-side to avoid missing index errors
      ordersData.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });

      setOrders(ordersData);
      setLoading(false);
    }, (error) => {
      console.error("Orders fetch error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const getStatusIcon = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('pending')) return <Clock className="w-4 h-4 text-yellow-400" />;
    if (s.includes('processing') || s.includes('progress')) return <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />;
    if (s.includes('completed') || s.includes('success')) return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    if (s.includes('cancel') || s.includes('partial')) return <XCircle className="w-4 h-4 text-rose-400" />;
    return <Clock className="w-4 h-4 text-slate-400" />;
  };

  const getStatusClass = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('pending')) return 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20';
    if (s.includes('processing') || s.includes('progress')) return 'bg-cyan-400/10 text-cyan-400 border-cyan-400/20';
    if (s.includes('completed') || s.includes('success')) return 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20';
    if (s.includes('cancel') || s.includes('partial')) return 'bg-rose-400/10 text-rose-400 border-rose-400/20';
    return 'bg-slate-400/10 text-slate-400 border-slate-400/20';
  };

  const getStatusText = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('pending')) return t('pending');
    if (s.includes('processing') || s.includes('progress')) return t('processing');
    if (s.includes('completed') || s.includes('success')) return t('completed');
    if (s.includes('cancel') || s.includes('partial')) return t('cancelled');
    return status;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin text-white/50" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium opacity-60 uppercase tracking-widest mb-1" style={{ color: 'var(--text-primary)' }}>{t('track_your')}</h2>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('premium_orders')}</h1>
        </div>
        <button 
          onClick={refreshStatuses}
          disabled={refreshing}
          className="p-3 glass rounded-2xl hover:bg-white/10 transition-all active:scale-95 disabled:opacity-50"
        >
          <RefreshCcw className={`w-5 h-5 text-cyan-400 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {orders.length === 0 ? (
        <div className="glass rounded-3xl p-12 text-center">
          <ClipboardList className="w-12 h-12 mx-auto mb-4 opacity-20" style={{ color: 'var(--text-primary)' }} />
          <p className="opacity-60" style={{ color: 'var(--text-primary)' }}>{t('no_orders_placed')}</p>
        </div>
      ) : (
        <div className="grid gap-4">
          <AnimatePresence>
            {orders.map((order) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="glass rounded-2xl p-5 premium-shadow border border-white/5"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-white/10 opacity-60 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest" style={{ color: 'var(--text-primary)' }}>
                        {order.category || t('service')}
                      </span>
                      {order.isGiveaway && (
                        <span className="bg-cyan-500/20 text-cyan-400 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest border border-cyan-500/30">
                          {t('giveaway')}
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-lg mb-1" style={{ color: 'var(--text-primary)' }}>{order.serviceName}</h3>
                    <p className="text-xs opacity-40" style={{ color: 'var(--text-primary)' }}>{formatDate(order.createdAt)}</p>
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold ${getStatusClass(order.status)}`}>
                    {getStatusIcon(order.status)}
                    {getStatusText(order.status)}
                  </div>
                </div>

                <div className="space-y-3 py-4 border-y border-white/5">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] opacity-40 uppercase tracking-widest font-bold" style={{ color: 'var(--text-primary)' }}>Order ID</span>
                    <div className="flex items-center gap-2">
                       <span className="text-xs opacity-80 font-medium truncate max-w-[200px]" style={{ color: 'var(--text-primary)' }}>
                        #{order.id.slice(-6).toUpperCase()}
                      </span>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(`#${order.id.slice(-6).toUpperCase()}`);
                          Swal.fire({ icon: 'success', title: 'Order ID Copied', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
                        }}
                        className="p-1 rounded-md bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        <Copy className="w-3 h-3 opacity-60" style={{ color: 'var(--text-primary)' }} />
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] opacity-40 uppercase tracking-widest font-bold" style={{ color: 'var(--text-primary)' }}>{t('target_link')}</span>
                    <span className="text-xs opacity-80 font-medium truncate max-w-[200px]" style={{ color: 'var(--text-primary)' }}>
                      {order.link || order.profileLink || order.videoLink || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] opacity-40 uppercase tracking-widest font-bold" style={{ color: 'var(--text-primary)' }}>{t('quantity')}</span>
                    <span className="text-sm opacity-90 font-black" style={{ color: 'var(--text-primary)' }}>{order.quantity}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4">
                  <span className="text-xs opacity-40 uppercase tracking-widest font-bold" style={{ color: 'var(--text-primary)' }}>{t('total_cost')}</span>
                  <span className="font-black text-xl text-cyan-400">{formatCurrency(order.totalCost || order.price || 0)}</span>
                </div>

                {isRefillable(order) && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <button
                      onClick={() => handleRefill(order)}
                      disabled={refillingId === order.id || getCooldownStatus(order).active || !order.status.toLowerCase().includes('completed')}
                      className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.98] ${
                        order.status.toLowerCase().includes('completed') && !getCooldownStatus(order).active
                          ? 'bg-emerald-500/20 text-emerald-400 opacity-100' 
                          : `bg-cyan-500/10 text-cyan-400 ${!order.status.toLowerCase().includes('completed') ? 'opacity-30' : 'opacity-100'}`
                      } disabled:cursor-not-allowed`}
                    >
                      {refillingId === order.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RotateCcw className="w-4 h-4" />
                      )}
                      {!order.status.toLowerCase().includes('completed') 
                        ? 'Refill (Wait for Completion)' 
                        : getCooldownStatus(order).active 
                          ? `Refill available in ${getCooldownStatus(order).remaining}h` 
                          : 'Request Refill'}
                    </button>
                    {order.lastRefillAt && (
                      <p className="text-[10px] text-center mt-2 opacity-40 font-medium" style={{ color: 'var(--text-primary)' }}>
                        Last refill: {formatDate(order.lastRefillAt)}
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default OrdersPage;
