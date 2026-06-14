import React, { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query, where, addDoc, serverTimestamp, doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Service } from '../types';
import { formatCurrency } from '../utils';
import { getCategoryIcon } from '../utils/categoryIcons';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Send, Info, Link as LinkIcon, Hash, Search, ChevronDown, User, Clock, X, ExternalLink } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import Swal from 'sweetalert2';

const HomePage = ({ onOrderSuccess }: { onOrderSuccess?: () => void }) => {
  const { user, userData } = useAuth();
  const { t } = useTranslation();
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  
  // Form State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [link, setLink] = useState<string>('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const serviceSelectRef = React.useRef<HTMLDivElement>(null);
  const serviceDetailsRef = React.useRef<HTMLDivElement>(null);
  const linkInputRef = React.useRef<HTMLDivElement>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const categoryScrollRef = React.useRef<HTMLDivElement>(null);
  const serviceScrollRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to selected category when modal opens
  useEffect(() => {
    if (isCategoryModalOpen && selectedCategory) {
      setTimeout(() => {
        const selectedElement = categoryScrollRef.current?.querySelector('[data-selected="true"]');
        selectedElement?.scrollIntoView({ behavior: 'auto', block: 'center' });
      }, 100);
    }
  }, [isCategoryModalOpen, selectedCategory]);

  // Auto-scroll to selected service when modal opens
  useEffect(() => {
    if (isServiceModalOpen && selectedServiceId) {
      setTimeout(() => {
        const selectedElement = serviceScrollRef.current?.querySelector('[data-selected="true"]');
        selectedElement?.scrollIntoView({ behavior: 'auto', block: 'center' });
      }, 100);
    }
  }, [isServiceModalOpen, selectedServiceId]);

  useEffect(() => {
    if (selectedCategory && serviceSelectRef.current) {
      serviceSelectRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedCategory]);

  useEffect(() => {
    if (selectedServiceId && serviceDetailsRef.current) {
      serviceDetailsRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Also scroll to link after a short delay to let details animate
      setTimeout(() => {
        linkInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 500);
    }
  }, [selectedServiceId]);

  useEffect(() => {
    const qServices = query(collection(db, 'services'), where('enabled', '==', true));
    const unsubscribeServices = onSnapshot(qServices, (snapshot) => {
      const servicesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Service[];
      setServices(servicesData);
      setLoading(false);
    });

    const qCategories = collection(db, 'categories');
    const unsubscribeCategories = onSnapshot(qCategories, (snapshot) => {
      const categoriesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCategories(categoriesData);
    });

    return () => {
      unsubscribeServices();
      unsubscribeCategories();
    };
  }, []);

  const categoryList = useMemo(() => {
    const serviceCatsMap = new Map<string, {name: string, icon: string}>();
    services.forEach(s => {
      if (s.category && !serviceCatsMap.has(s.category)) {
        serviceCatsMap.set(s.category, { name: s.category, icon: s.category_icon || getCategoryIcon(s.category) });
      }
    });

    const finalCats = Array.from(serviceCatsMap.values()).map(cat => {
      const dbCat = categories.find(c => c.name === cat.name);
      return { ...cat, pinned: dbCat?.pinned || false };
    });

    return finalCats.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [services, categories]);

  const filteredServices = useMemo(() => {
    if (!selectedCategory) return [];
    return services
      .filter(s => {
        const matchesCategory = s.category === selectedCategory;
        const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return a.pricePerUnit - b.pricePerUnit;
      });
  }, [services, selectedCategory, searchQuery]);

  const selectedService = useMemo(() => 
    services.find(s => s.id === selectedServiceId), 
    [services, selectedServiceId]
  );

  const totalCost = useMemo(() => {
    if (!selectedService || !quantity || typeof quantity !== 'number') return 0;
    return quantity * selectedService.pricePerUnit;
  }, [selectedService, quantity]);

  const handleOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userData || !selectedService) return;

    if (!link.trim()) {
      return Swal.fire({ icon: 'error', title: 'Missing Link', text: 'Please enter a valid link.', background: 'var(--card-bg)', color: 'var(--text-primary)' });
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty < selectedService.minQty || qty > selectedService.maxQty) {
      return Swal.fire({ 
        icon: 'error', 
        title: 'Invalid Quantity', 
        text: `Quantity must be between ${selectedService.minQty} and ${selectedService.maxQty}.`,
        background: 'var(--card-bg)', 
        color: 'var(--text-primary)' 
      });
    }

    if (isNaN(totalCost) || totalCost <= 0) {
      return Swal.fire({ 
        icon: 'error', 
        title: 'Invalid Order', 
        text: 'The total cost of this order is invalid.',
        background: 'var(--card-bg)', 
        color: 'var(--text-primary)' 
      });
    }

    const currentBalance = Number(userData.walletBalance !== undefined ? userData.walletBalance : (userData.balance || 0));
    if (currentBalance < totalCost) {
      return Swal.fire({ 
        icon: 'error', 
        title: 'Insufficient Balance', 
        text: `You need ${formatCurrency(totalCost)} but your balance is ${formatCurrency(currentBalance)}.`,
        background: 'var(--card-bg)', 
        color: 'var(--text-primary)' 
      });
    }

    setOrdering(true);

    try {
      // 1. Deduct balance first via transaction
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await transaction.get(userRef);
        
        if (!userSnap.exists()) throw new Error("User document not found!");
        
        const data = userSnap.data();
        const currentBalance = Number(data.walletBalance !== undefined ? data.walletBalance : (data.balance || 0));
        
        if (currentBalance < totalCost) {
          throw new Error(`Insufficient balance! You need ${formatCurrency(totalCost)} but have ${formatCurrency(currentBalance)}.`);
        }

        transaction.update(userRef, {
          walletBalance: currentBalance - totalCost,
          totalSpent: (data.totalSpent || 0) + totalCost,
          // Keep balance field in sync if used elsewhere
          balance: currentBalance - totalCost
        });

        // Update leaderboard
        const leaderboardRef = doc(db, 'leaderboard', user.uid);
        transaction.set(leaderboardRef, {
          name: data.name || 'User',
          totalSpent: (data.totalSpent || 0) + totalCost,
          updatedAt: serverTimestamp()
        }, { merge: true });
      });

      // 2. Call SMM API via backend
      let apiData;
      try {
        const apiResponse = await fetch('/api/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service: selectedService.api_service_id || selectedService.id,
            link: link,
            quantity: qty
          })
        });

        if (!apiResponse.ok) {
          const errorData = await apiResponse.json().catch(() => ({ error: `Server error: ${apiResponse.status}` }));
          throw new Error(errorData.error || `SMM API error: ${apiResponse.status}`);
        }

        apiData = await apiResponse.json().catch(() => ({ error: 'Invalid response from server' }));

        if (apiData.error || !apiData.order) {
          throw new Error(apiData.error || 'Failed to place order on SMM API');
        }
      } catch (apiError: any) {
        // 3. Refund balance if API fails
        console.error("API failed, refunding balance:", apiError);
        await runTransaction(db, async (transaction) => {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await transaction.get(userRef);
          if (userSnap.exists()) {
            const data = userSnap.data();
            const currentBalance = Number(data.walletBalance !== undefined ? data.walletBalance : (data.balance || 0));
            transaction.update(userRef, {
              walletBalance: currentBalance + totalCost,
              balance: currentBalance + totalCost
            });
          }
        });
        throw apiError;
      }

      // 4. Create Order record in Firestore
      await addDoc(collection(db, 'orders'), {
        userId: user.uid,
        userName: userData.name || 'Anonymous',
        userEmail: user.email || '',
        serviceId: selectedService.id,
        api_service_id: selectedService.api_service_id || '',
        api_order_id: apiData.order.toString(),
        serviceName: selectedService.name,
        category: selectedCategory,
        link: link,
        quantity: qty,
        pricePerUnit: selectedService.pricePerUnit,
        totalCost: totalCost,
        status: 'Pending',
        createdAt: serverTimestamp()
      });

      Swal.fire({
        icon: 'success',
        title: 'Order Placed!',
        text: `Successfully ordered ${qty} ${selectedService.name}. Your order is now Pending.`,
        background: 'var(--card-bg)',
        color: 'var(--text-primary)',
        confirmButtonColor: 'var(--btn-bg)',
        showCancelButton: true,
        confirmButtonText: 'View Orders',
        cancelButtonText: 'Close'
      }).then((result) => {
        if (result.isConfirmed && onOrderSuccess) {
          onOrderSuccess();
        }
      });

      setLink('');
      setQuantity('');
      setSelectedServiceId('');

    } catch (error: any) {
      Swal.fire({
        icon: 'error',
        title: 'Order Failed',
        text: error.message,
        background: 'var(--card-bg)',
        color: 'var(--text-primary)'
      });
    } finally {
      setOrdering(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin text-white/50" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
        <input
          type="text"
          placeholder={t('search_placeholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full glass rounded-2xl py-4 pl-14 pr-5 focus:outline-none focus:ring-2 ring-cyan-100 transition-all shadow-sm"
          style={{ color: 'var(--text-primary)' }}
        />
      </div>

      {/* Category Selection */}
      <div className="space-y-2">
        <label className="text-sm font-bold opacity-80 ml-1" style={{ color: 'var(--text-primary)' }}>{t('category')}</label>
        <button
          onClick={() => setIsCategoryModalOpen(true)}
          className="w-full glass rounded-2xl py-4 px-5 flex items-center justify-between focus:outline-none focus:ring-2 ring-cyan-100 transition-all cursor-pointer font-medium shadow-sm text-left"
          style={{ color: 'var(--text-primary)' }}
        >
          <span className="truncate">
            {selectedCategory ? (
              <>
                {categoryList.find(c => c.name === selectedCategory)?.icon} {selectedCategory}
              </>
            ) : t('select_category')}
          </span>
          <ChevronDown className="text-slate-400 w-5 h-5 shrink-0" />
        </button>
      </div>

      {/* Service Selection */}
      <motion.div 
        ref={serviceSelectRef}
        animate={selectedCategory ? { scale: [1, 1.01, 1] } : {}}
        className="space-y-2"
      >
        <div className="flex items-center justify-between ml-1">
          <label className="text-sm font-bold opacity-80" style={{ color: 'var(--text-primary)' }}>{t('service')}</label>
          {selectedCategory && !selectedServiceId && (
            <motion.span 
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ 
                duration: 0.4,
                ease: [0.23, 1, 0.32, 1] 
              }}
              className="text-[10px] font-black text-cyan-400 uppercase tracking-widest"
            >
              Select Now
            </motion.span>
          )}
        </div>
        <button
          disabled={!selectedCategory}
          onClick={() => setIsServiceModalOpen(true)}
          className={`w-full glass rounded-2xl py-4 px-5 flex items-center justify-between focus:outline-none focus:ring-2 ring-cyan-100 transition-all font-medium shadow-sm text-left ${!selectedCategory ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          style={{ color: 'var(--text-primary)' }}
        >
          <span className="truncate">
            {selectedServiceId ? (
              <>
                {selectedService?.emoji} {selectedService?.name} — ₹{selectedService?.pricePerUnit}
              </>
            ) : (selectedCategory ? t('select_service') : t('select_category'))}
          </span>
          <ChevronDown className="text-slate-400 w-5 h-5 shrink-0" />
        </button>
      </motion.div>

      {/* Custom Selection Modals */}
      <AnimatePresence>
        {isCategoryModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCategoryModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 180 }}
              className="relative w-[calc(100%-2rem)] max-w-lg glass rounded-[2.5rem] overflow-hidden flex flex-col max-h-[80vh] mb-8 sm:mb-0 backdrop-blur-2xl"
              style={{ border: '1px solid var(--card-border)' }}
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>{t('select_category')}</h3>
                <button onClick={() => setIsCategoryModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X className="w-6 h-6" style={{ color: 'var(--text-primary)' }} />
                </button>
              </div>
              <div ref={categoryScrollRef} className="overflow-y-auto p-4 pb-10 space-y-1">
                {categoryList.map((cat, index) => (
                  <React.Fragment key={cat.name}>
                    <button
                      data-selected={selectedCategory === cat.name}
                      onClick={() => {
                        setSelectedCategory(cat.name);
                        setSelectedServiceId('');
                        setIsCategoryModalOpen(false);
                      }}
                      className={`w-full py-3 px-5 rounded-2xl flex items-center justify-between transition-all ${selectedCategory === cat.name ? 'bg-cyan-500/20 border-cyan-500/50' : 'hover:bg-white/5 border-transparent'} border`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-xl">{cat.icon}</span>
                        <div className="flex flex-col items-start">
                          <span className="font-bold text-base flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                            {cat.name}
                            {cat.pinned && <span className="bg-amber-400 text-black px-1.5 py-0.5 rounded text-[8px] uppercase tracking-widest font-black leading-none">Suggested</span>}
                          </span>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedCategory === cat.name ? 'border-cyan-500 bg-cyan-500' : 'border-white/20'}`}>
                        {selectedCategory === cat.name && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </button>
                    {index < categoryList.length - 1 && (
                      <div className="h-px bg-white/5 mx-4 my-1" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </motion.div>
          </div>
        )}

        {isServiceModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsServiceModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 180 }}
              className="relative w-[calc(100%-2rem)] max-w-lg glass rounded-[2.5rem] overflow-hidden flex flex-col max-h-[80vh] mb-8 sm:mb-0 backdrop-blur-2xl"
              style={{ border: '1px solid var(--card-border)' }}
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>{t('select_service')}</h3>
                <button onClick={() => setIsServiceModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X className="w-6 h-6" style={{ color: 'var(--text-primary)' }} />
                </button>
              </div>
              <div ref={serviceScrollRef} className="overflow-y-auto p-4 pb-10 space-y-1">
                {filteredServices.map((service, index) => (
                  <React.Fragment key={service.id}>
                    <button
                      data-selected={selectedServiceId === service.id}
                      onClick={() => {
                        setSelectedServiceId(service.id);
                        setIsServiceModalOpen(false);
                      }}
                      className={`w-full py-3 px-5 rounded-2xl flex items-center justify-between transition-all ${selectedServiceId === service.id ? 'bg-cyan-500/20 border-cyan-500/50' : 'hover:bg-white/5 border-transparent'} border`}
                    >
                      <div className="flex items-center gap-4 flex-1 text-left">
                        <span className="text-xl shrink-0">{service.emoji}</span>
                        <div className="flex flex-col">
                          <span className="font-bold leading-tight text-sm flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                            {service.name}
                            {service.pinned && <span className="bg-amber-400 text-black px-1.5 py-0.5 rounded text-[8px] uppercase tracking-widest font-black leading-none">Pinned</span>}
                          </span>
                          <span className="text-cyan-400 font-black text-[11px] mt-0.5">₹{service.pricePerUnit}</span>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ml-4 ${selectedServiceId === service.id ? 'border-cyan-500 bg-cyan-500' : 'border-white/20'}`}>
                        {selectedServiceId === service.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </button>
                    {index < filteredServices.length - 1 && (
                      <div className="h-px bg-white/5 mx-4 my-1" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Service Details Card */}
      <AnimatePresence mode="wait">
        {selectedService && (
          <motion.div
            ref={serviceDetailsRef}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="glass rounded-3xl p-6 space-y-4 shadow-sm border border-cyan-500/20"
          >
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-cyan-50 flex items-center justify-center shrink-0">
                <User className="w-8 h-8 text-cyan-500" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-lg leading-tight" style={{ color: 'var(--text-primary)' }}>{selectedService.emoji} {selectedService.name}</h3>
                <p className="text-cyan-600 font-black text-lg mt-1">₹{selectedService.pricePerUnit} per unit</p>
                <p className="text-xs opacity-40 mt-1" style={{ color: 'var(--text-primary)' }}>Min: {selectedService.minQty} - Max: {selectedService.maxQty.toLocaleString()}</p>
              </div>
            </div>
            
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <Info className="w-4 h-4 opacity-40" style={{ color: 'var(--text-primary)' }} />
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-40" style={{ color: 'var(--text-primary)' }}>Service Description</span>
              </div>
              <p className="text-sm opacity-80 leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-primary)' }}>{selectedService.description}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Link Input */}
      <div ref={linkInputRef} className="space-y-2">
        <label className="text-sm font-bold opacity-80 ml-1" style={{ color: 'var(--text-primary)' }}>{t('link')}</label>
        <input
          type="url"
          placeholder="Enter Instagram Link"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          className="w-full glass rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 ring-cyan-200 transition-all"
          style={{ color: 'var(--text-primary)' }}
        />
      </div>

      {/* Quantity Input */}
      <div className="space-y-2">
        <label className="text-sm font-bold opacity-80 ml-1" style={{ color: 'var(--text-primary)' }}>{t('quantity')}</label>
        <input
          type="number"
          placeholder="Enter Quantity"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
          className="w-full glass rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 ring-cyan-200 transition-all"
          style={{ color: 'var(--text-primary)' }}
        />
        {selectedService && (
          <p className="text-[10px] opacity-40 ml-1" style={{ color: 'var(--text-primary)' }}>Min: {selectedService.minQty} - Max: {selectedService.maxQty.toLocaleString()}</p>
        )}
      </div>

      {/* Average Time Display */}
      <AnimatePresence>
        {selectedService && selectedService.average_time && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            <label className="text-sm font-bold opacity-80 ml-1" style={{ color: 'var(--text-primary)' }}>{t('average_time')}</label>
            <div className="w-full glass rounded-2xl py-4 px-6 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                <Clock className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  {selectedService.average_time === "0" || selectedService.average_time === "" 
                    ? t('instant_fast') 
                    : selectedService.average_time}
                </p>
                <p className="text-[10px] opacity-40" style={{ color: 'var(--text-primary)' }}>{t('estimated_completion')}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Charge Display */}
      <div className="space-y-2">
        <label className="text-sm font-bold opacity-80 ml-1" style={{ color: 'var(--text-primary)' }}>{t('charge')}</label>
        <div className="w-full glass rounded-2xl py-4 px-6 font-bold text-xl" style={{ color: 'var(--accent)' }}>
          ₹{totalCost.toFixed(2)}
        </div>
      </div>

      {/* Submit Button */}
      <button
        onClick={handleOrder}
        disabled={ordering || !selectedService || !link || !quantity}
        className="w-full text-white font-black py-5 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-30 shadow-lg"
        style={{ 
          backgroundColor: 'var(--btn-bg)', 
          color: 'var(--btn-text)',
          boxShadow: '0 10px 15px -3px var(--accent-glow)' 
        }}
      >
        {ordering ? (
          <Loader2 className="w-6 h-6 animate-spin" />
        ) : (
          <>
            <Send className="w-5 h-5" />
            {t('submit')}
          </>
        )}
      </button>
    </div>
  );
};

export default HomePage;
