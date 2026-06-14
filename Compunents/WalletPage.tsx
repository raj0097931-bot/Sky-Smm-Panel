import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, formatDate } from '../utils';
import { motion, AnimatePresence } from 'motion/react';
import { Wallet, ArrowUpRight, CreditCard, History, X, QrCode, Send, Loader2, Info, Copy, Check, Smartphone, Zap } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, doc } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { useTranslation } from '../contexts/LanguageContext';

const WalletPage = () => {
  const { user, userData } = useAuth();
  const { t } = useTranslation();
  const [isAddingFunds, setIsAddingFunds] = useState(false);
  const [amount, setAmount] = useState<number | ''>('');
  const [transactionId, setTransactionId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [appConfig, setAppConfig] = useState({ qrUrl: '', upiId: '', minPayment: 10, maxPayment: 10000 });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsubConfig = onSnapshot(doc(db, 'settings', 'app_config'), (doc) => {
      if (doc.exists()) {
        setAppConfig(doc.data() as any);
      }
    });
    return () => unsubConfig();
  }, []);

  const handleUPIClick = () => {
    if (!appConfig.upiId) return;
    const upiUrl = `upi://pay?pa=${appConfig.upiId}&pn=Alpha Zone&cu=INR${amount ? `&am=${amount}` : ''}`;
    window.location.href = upiUrl;
  };

  const handleCopyUPI = () => {
    if (!appConfig.upiId) return;
    navigator.clipboard.writeText(appConfig.upiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'fundRequests'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const requestsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Sort client-side to avoid missing index errors
      requestsData.sort((a: any, b: any) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });

      setRequests(requestsData);
    }, (error) => {
      console.error("Fund requests fetch error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  const handleAddFunds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !amount || !transactionId.trim()) return;

    const qty = Number(amount);
    if (isNaN(qty) || qty < (appConfig.minPayment || 10) || qty > (appConfig.maxPayment || 10000)) {
      return Swal.fire({ 
        icon: 'error', 
        title: 'Invalid Amount', 
        text: `Payment must be between ₹${appConfig.minPayment || 10} and ₹${appConfig.maxPayment || 10000}.`,
        background: 'var(--card-bg)', 
        color: 'var(--text-primary)' 
      });
    }

    setSubmitting(true);
    try {
      // Check current verification method configured by Admin
      const verificationMethod = (appConfig as any).paymentVerificationMethod || 'manual';

      if (verificationMethod === 'manual') {
        await addDoc(collection(db, 'fundRequests'), {
          userId: user.uid,
          userName: userData?.name || 'User',
          userEmail: user.email || '',
          amount: Number(amount),
          transactionId: transactionId.trim(),
          status: 'Pending',
          createdAt: serverTimestamp(),
          verifiedAutomatically: false,
          verificationMethod: 'MANUAL_PENDING'
        });

        Swal.fire({
          icon: 'success',
          title: 'Request Submitted!',
          text: `Your payment verification request of ₹${amount} (Transaction ID: ${transactionId.trim()}) has been submitted. administrative staff will verify and approve your funds soon.`,
          background: 'var(--card-bg)',
          color: 'var(--text-primary)',
          confirmButtonColor: 'var(--btn-bg)'
        });

        setIsAddingFunds(false);
        setAmount('');
        setTransactionId('');
        return;
      }

      // 1. Add request to Firestore for tracking (automatic route)
      const docRef = await addDoc(collection(db, 'fundRequests'), {
        userId: user.uid,
        userName: userData?.name || 'User',
        userEmail: user.email || '',
        amount: Number(amount),
        transactionId: transactionId.trim(),
        status: 'Pending',
        createdAt: serverTimestamp()
      });

      // 2. Trigger automatic verification
      Swal.fire({
        title: 'Verifying Payment',
        text: 'Connecting to mail server to verify your transaction...',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
        background: 'var(--card-bg)',
        color: 'var(--text-primary)'
      });

      const response = await fetch('/api/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: docRef.id,
          transactionId: transactionId.trim()
        })
      });

      let result;
      try {
        result = await response.json();
      } catch (err) {
        if (!response.ok) {
          throw new Error(`Server error (${response.status}): Failed to verify payment. Please try again later.`);
        }
        throw new Error("Failed to parse verification response. Please try again.");
      }

      if (response.ok && result?.success) {
        Swal.fire({
          icon: 'success',
          title: 'Verified Successfully!',
          text: `Your payment of ₹${amount} has been verified and added to your wallet.`,
          background: 'var(--card-bg)',
          color: 'var(--text-primary)',
          confirmButtonColor: 'var(--btn-bg)'
        });
        setIsAddingFunds(false);
        setAmount('');
        setTransactionId('');
      } else {
        // Not verified, now marked as Rejected in DB
        Swal.fire({
          icon: 'error',
          title: 'Verification Failed',
          text: result.error || 'No matching payment email found. Re-check your Transaction ID and Amount, ensure you received the email, and try again.',
          background: 'var(--card-bg)',
          color: 'var(--text-primary)',
          confirmButtonColor: 'var(--btn-bg)'
        });
        setIsAddingFunds(false);
        setAmount('');
        setTransactionId('');
      }
    } catch (error: any) {
      Swal.fire({
        icon: 'error',
        title: 'Request Failed',
        text: error.message,
        background: 'var(--card-bg)',
        color: 'var(--text-primary)'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="mb-8">
        <h2 className="text-sm font-medium opacity-60 uppercase tracking-widest mb-1" style={{ color: 'var(--text-primary)' }}>{t('manage_your')}</h2>
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('digital_wallet')}</h1>
      </header>

      {/* Premium Wallet Card */}
      <motion.div
        whileHover={{ scale: 1.02 }}
        className="relative h-56 rounded-[2.5rem] p-8 overflow-hidden premium-shadow group"
        style={{ background: 'var(--bg-gradient)' }}
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-white/20 transition-all duration-700" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/20 rounded-full -ml-10 -mb-10 blur-2xl" />
        
        <div className="relative z-10 h-full flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <CreditCard className="w-10 h-10 text-white/80" />
            <div className="text-right">
              <p className="text-xs text-white/60 uppercase tracking-widest mb-1">{t('wallet_balance')}</p>
              <h2 className="text-4xl font-bold">{formatCurrency(userData?.walletBalance !== undefined ? userData?.walletBalance : (userData?.balance || 0))}</h2>
            </div>
          </div>
          
          <div className="flex gap-4">
            <button 
              onClick={() => setIsAddingFunds(true)}
              className="w-full bg-white/20 backdrop-blur-md py-4 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm hover:bg-white/30 transition-colors"
            >
              <ArrowUpRight className="w-5 h-5" />
              {t('add_funds')}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Fund Requests / History */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <History className="w-5 h-5 opacity-60" style={{ color: 'var(--text-primary)' }} />
          <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{t('payment_history')}</h3>
        </div>

        <div className="grid gap-3">
          {requests.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center">
              <p className="opacity-40 text-sm italic" style={{ color: 'var(--text-primary)' }}>{t('no_payment_requests')}</p>
            </div>
          ) : (
            requests.map((req) => (
              <div key={req.id} className="glass rounded-2xl p-4 flex items-center justify-between border border-white/5">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    req.status === 'Approved' ? 'bg-emerald-400/10 text-emerald-400' : 
                    req.status === 'Rejected' ? 'bg-rose-400/10 text-rose-400' : 'bg-yellow-400/10 text-yellow-400'
                  }`}>
                    {req.status === 'Approved' ? (
                      <ArrowUpRight className="w-5 h-5" />
                    ) : req.status === 'Pending' ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <X className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>₹{req.amount} - {req.status}</h4>
                    <p className="text-[10px] opacity-40 uppercase tracking-widest" style={{ color: 'var(--text-primary)' }}>ID: {req.transactionId}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] opacity-40 uppercase tracking-widest" style={{ color: 'var(--text-primary)' }}>{formatDate(req.createdAt)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Funds Modal */}
      <AnimatePresence>
        {isAddingFunds && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-md glass rounded-[2.5rem] p-8 relative overflow-y-auto max-h-[90vh]"
            >
              <button
                onClick={() => setIsAddingFunds(false)}
                className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{t('add_funds_modal_title')}</h2>
                <p className="opacity-50 text-sm" style={{ color: 'var(--text-primary)' }}>{t('add_funds_modal_desc')}</p>
              </div>

              {/* QR Code Section */}
              <div className="flex flex-col items-center mb-8">
                <div className="bg-white p-4 rounded-3xl mb-4 shadow-xl">
                  {appConfig.qrUrl ? (
                    <img 
                      src={appConfig.qrUrl} 
                      alt="Payment QR" 
                      className="w-48 h-48 object-contain"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-48 h-48 bg-slate-100 flex items-center justify-center rounded-2xl">
                      <QrCode className="w-12 h-12 text-slate-300" />
                    </div>
                  )}
                </div>
                
                {appConfig.upiId && (
                  <div className="w-full mb-6">
                    <p className="text-[10px] font-black opacity-40 uppercase tracking-widest mb-2 text-center" style={{ color: 'var(--text-primary)' }}>{t('or_pay_via_upi')}</p>
                    <div className="flex items-center gap-2 bg-white/5 border border-white/10 p-3 rounded-2xl">
                      <div className="flex-1 truncate font-mono text-sm opacity-80 px-2" style={{ color: 'var(--text-primary)' }}>
                        {appConfig.upiId}
                      </div>
                      <button
                        onClick={handleCopyUPI}
                        className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors flex items-center gap-2 text-xs font-bold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        {copied ? t('copied_text') : t('copy_text')}
                      </button>
                    </div>
                  </div>
                )}

                <button 
                  onClick={handleUPIClick}
                  className="flex items-center gap-3 bg-white/5 border border-white/10 px-6 py-3 rounded-2xl hover:bg-white/10 transition-all active:scale-95 group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-white/5 animate-pulse group-hover:hidden"></div>
                  <Smartphone className="w-5 h-5 opacity-80" style={{ color: 'var(--text-primary)' }} />
                  <div className="flex flex-col items-start leading-tight">
                    <span className="text-[10px] uppercase tracking-wider opacity-60 font-bold" style={{ color: 'var(--text-primary)' }}>FAST PAYMENT</span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('scan_to_pay')}</span>
                  </div>
                  <Zap className="w-4 h-4 text-amber-400 fill-amber-400 ml-1 animate-bounce" />
                </button>
              </div>

              {/* Verification Form */}
              <form onSubmit={handleAddFunds} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest opacity-40 ml-1" style={{ color: 'var(--text-primary)' }}>{t('amount_paid_label')}</label>
                  <input
                    type="number"
                    placeholder="Enter amount you paid"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 px-5 focus:outline-none focus:ring-2 ring-white/20 transition-all"
                    style={{ color: 'var(--text-primary)' }}
                  />
                  <p className="text-[10px] opacity-40 ml-1" style={{ color: 'var(--text-primary)' }}>Min: ₹{appConfig.minPayment || 10} - Max: ₹{(appConfig.maxPayment || 10000).toLocaleString()}</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest opacity-40 ml-1" style={{ color: 'var(--text-primary)' }}>{t('transaction_id_label')}</label>
                  <input
                    type="text"
                    placeholder="Enter payment reference ID"
                    required
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 px-5 focus:outline-none focus:ring-2 ring-white/20 transition-all"
                    style={{ color: 'var(--text-primary)' }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting || !amount || !transactionId}
                  className="w-full bg-white text-black font-black py-5 rounded-2xl flex items-center justify-center gap-3 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-30 premium-shadow"
                  style={{ backgroundColor: 'var(--btn-bg)', color: 'var(--btn-text)' }}
                >
                  {submitting ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      {t('submit_for_verification')}
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WalletPage;
