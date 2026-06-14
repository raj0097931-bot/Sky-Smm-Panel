import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Sparkles, MessageCircle, Send, Instagram, X, Headset, Bot, Loader2, Gift, Users, MessageSquare, Trophy, Medal, Locate, RefreshCcw, User, Disc, ShieldAlert, Paperclip, Image, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import GlobalChat from './GlobalChat';
import { collection, onSnapshot, query, orderBy, limit, doc, getDocs, getDoc, where, writeBatch, serverTimestamp, setDoc, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserData, Order } from '../types';
import { formatCurrency } from '../utils';
import { useAuth } from '../contexts/AuthContext';
import Swal from 'sweetalert2';

import { useTranslation } from '../contexts/LanguageContext';

const EliteHub = ({ onBack, onGiveawayAccess, appName = 'Elite Hub' }: { onBack: () => void, onGiveawayAccess: () => void, appName?: string }) => {
  const { user, userData } = useAuth();
  const { t } = useTranslation();
  const [showSupportOptions, setShowSupportOptions] = useState(false);
  const [showAIHelp, setShowAIHelp] = useState(false);
  const [showGlobalChat, setShowGlobalChat] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardUsers, setLeaderboardUsers] = useState<UserData[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model', text: string, attachments?: any[] }[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [showQuestionList, setShowQuestionList] = useState(true);
  const [uploadedFiles, setUploadedFiles] = useState<{ id: string, name: string, type: string, data: string, preview?: string }[]>([]);
  const [spinnerConfig, setSpinnerConfig] = useState<any>(null);
  const [isEligible, setIsEligible] = useState(false);
  const [daysRemaining, setDaysRemaining] = useState<number>(0);
  const [canSpinToday, setCanSpinToday] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState<any>(null);
  const [showSpinner, setShowSpinner] = useState(false);
  const [rotation, setRotation] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const leaderboardScrollRef = useRef<HTMLDivElement>(null);
  const userItemRef = useRef<HTMLDivElement>(null);

  const [appConfig, setAppConfig] = useState<any>(null);
  const [aiConfig, setAiConfig] = useState<any>(null);
  const [isAiWorking, setIsAiWorking] = useState(false);

  useEffect(() => {
    // If we have an API key or if the app config exists, we assume AI is potentially working (server-side fallback)
    if (appConfig) {
      setIsAiWorking(true);
    } else {
      setIsAiWorking(false);
    }
  }, [appConfig]);

  useEffect(() => {
    if (!user) return;

    const unsubscribeSpinner = onSnapshot(doc(db, 'settings', 'spinner_config'), (snapshot) => {
      if (snapshot.exists()) {
        const config = snapshot.data();
        setSpinnerConfig(config);
      }
    });

    const unsubscribeApp = onSnapshot(doc(db, 'settings', 'app_config'), (snapshot) => {
      if (snapshot.exists()) {
        setAppConfig(snapshot.data());
      }
    });

    const unsubscribeAi = onSnapshot(doc(db, 'settings', 'ai_config'), (snapshot) => {
      if (snapshot.exists()) {
        setAiConfig(snapshot.data());
      }
    });

    return () => {
      unsubscribeSpinner();
      unsubscribeApp();
      unsubscribeAi();
    };
  }, [user]);

  // Separate effect for eligibility and spin limits to ensure it reacts to userData changes
  useEffect(() => {
    if (user && spinnerConfig) {
      checkEligibility(spinnerConfig);
    }
  }, [user, userData, spinnerConfig]);

  const checkEligibility = async (config: any) => {
    if (!user || !config) return;

    try {
      // Fetch all fund requests for this user
      const q = query(
        collection(db, 'fundRequests'),
        where('userId', '==', user.uid)
      );
      
      const querySnapshot = await getDocs(q);
      
      const approvedRequests = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(req => req.status === 'Approved')
        .sort((a, b) => {
          const timeA = a.createdAt?.toDate?.()?.getTime() || (a.createdAt ? new Date(a.createdAt).getTime() : 0);
          const timeB = b.createdAt?.toDate?.()?.getTime() || (b.createdAt ? new Date(b.createdAt).getTime() : 0);
          return timeB - timeA;
        });

      if (approvedRequests.length > 0) {
        const lastRequest = approvedRequests[0];
        const createdAt = lastRequest.createdAt?.toDate?.() || (lastRequest.createdAt ? new Date(lastRequest.createdAt) : new Date(0));
        const diffMs = Date.now() - createdAt.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        
        const remaining = Math.max(0, Math.ceil(config.eligibilityDays - diffDays));
        setDaysRemaining(remaining);

        if (diffDays <= config.eligibilityDays) {
          setIsEligible(true);
          
          const maxSpins = Number(config.maxSpinsPerDay) || 1;
          const lastSpinAt = userData?.lastSpinAt;
          const lastSpinDateStr = userData?.lastSpinDateStr;
          
          // Robust date conversion
          let lastSpinDate: Date | null = null;
          if (lastSpinAt) {
            if (typeof lastSpinAt.toDate === 'function') {
              lastSpinDate = lastSpinAt.toDate();
            } else {
              lastSpinDate = new Date(lastSpinAt);
            }
          }
          
          const todayStr = new Date().toDateString();
          // Check both the timestamp and the date string for maximum reliability
          const isSameDay = lastSpinDateStr === todayStr || lastSpinDate?.toDateString() === todayStr;
          
          if (isSameDay) {
            const spinsToday = Number(userData?.spinsToday) || 0;
            setCanSpinToday(spinsToday < maxSpins);
          } else {
            // New day, reset limit locally
            setCanSpinToday(true);
          }
        } else {
          setIsEligible(false);
          setCanSpinToday(false);
        }
      } else {
        setIsEligible(false);
        setDaysRemaining(0);
        setCanSpinToday(false);
      }
    } catch (error) {
      console.error("Eligibility check error:", error);
    }
  };

  const handleSpin = async () => {
    if (isSpinning || !spinnerConfig || !spinnerConfig.options?.length) return;

    const maxSpins = Number(spinnerConfig.maxSpinsPerDay) || 1;
    const lastSpinAt = userData?.lastSpinAt;
    const lastSpinDateStr = userData?.lastSpinDateStr;
    
    // Robust date conversion for handleSpin
    let lastSpinDate: Date | null = null;
    if (lastSpinAt) {
      if (typeof lastSpinAt.toDate === 'function') {
        lastSpinDate = lastSpinAt.toDate();
      } else {
        lastSpinDate = new Date(lastSpinAt);
      }
    }
    
    const todayStr = new Date().toDateString();
    const isSameDay = lastSpinDateStr === todayStr || lastSpinDate?.toDateString() === todayStr;
    const spinsToday = isSameDay ? (Number(userData?.spinsToday) || 0) : 0;
    
    const isFreeSpin = isEligible && spinsToday < maxSpins;
    const paidSpinCost = Number(spinnerConfig.paidSpinCost) || 0;
    const currentBalance = userData?.walletBalance !== undefined ? userData?.walletBalance : (userData?.balance || 0);

    if (!isFreeSpin) {
      if (currentBalance < paidSpinCost) {
        Swal.fire({
          icon: 'error',
          title: t('insufficient_funds'),
          text: t('need_funds_to_spin').replace('{amount}', formatCurrency(paidSpinCost)),
          background: 'var(--card-bg)',
          color: 'var(--text-primary)'
        });
        return;
      }
      
      const confirm = await Swal.fire({
        title: t('paid_spin_title'),
        text: t('paid_spin_confirm').replace('{amount}', formatCurrency(paidSpinCost)),
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: t('yes_spin'),
        cancelButtonText: t('no_cancel'),
        background: 'var(--card-bg)',
        color: 'var(--text-primary)',
        confirmButtonColor: 'var(--accent-color)'
      });
      
      if (!confirm.isConfirmed) return;
    }

    setIsSpinning(true);
    
    try {
      // Fetch latest user data to prevent race conditions
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      const latestUserData = userSnap.exists() ? userSnap.data() : userData;
      
      const lastSpinAt = latestUserData?.lastSpinAt;
      const lastSpinDateStr = latestUserData?.lastSpinDateStr;
      
      let lastSpinDate: Date | null = null;
      if (lastSpinAt) {
        if (typeof lastSpinAt.toDate === 'function') {
          lastSpinDate = lastSpinAt.toDate();
        } else {
          lastSpinDate = new Date(lastSpinAt);
        }
      }
      
      const todayStr = new Date().toDateString();
      const isSameDay = lastSpinDateStr === todayStr || lastSpinDate?.toDateString() === todayStr;
      const spinsToday = isSameDay ? (Number(latestUserData?.spinsToday) || 0) : 0;
      
      const isFreeSpin = isEligible && spinsToday < maxSpins;

      if (isFreeSpin !== (isEligible && (isSameDay ? (Number(userData?.spinsToday) || 0) : 0) < maxSpins)) {
        // State changed between click and execution
        console.log("Spin state changed, re-evaluating...");
      }

      if (!isFreeSpin) {
        if (currentBalance < paidSpinCost) {
          Swal.fire({
            icon: 'error',
            title: t('insufficient_funds'),
            text: t('need_funds_to_spin').replace('{amount}', formatCurrency(paidSpinCost)),
            background: 'var(--card-bg)',
            color: 'var(--text-primary)'
          });
          setIsSpinning(false);
          return;
        }
        
        const confirm = await Swal.fire({
          title: t('paid_spin_title'),
          text: t('paid_spin_confirm').replace('{amount}', formatCurrency(paidSpinCost)),
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: t('yes_spin'),
          cancelButtonText: t('no_cancel'),
          background: 'var(--card-bg)',
          color: 'var(--text-primary)',
          confirmButtonColor: 'var(--accent-color)'
        });
        
        if (!confirm.isConfirmed) {
          setIsSpinning(false);
          return;
        }
      }

      // Calculate result based on probabilities
      const options = spinnerConfig.options;
      const totalProb = options.reduce((acc: number, opt: any) => acc + opt.probability, 0);
      let random = Math.random() * totalProb;
      let selectedIndex = 0;
      
      for (let i = 0; i < options.length; i++) {
        if (random < options[i].probability) {
          selectedIndex = i;
          break;
        }
        random -= options[i].probability;
      }
      
      const result = options[selectedIndex];
      
      // Animation
      const extraRotations = 10;
      const numSections = options.length;
      const sectionAngle = 360 / numSections;
      
      const targetRotation = rotation + (360 * extraRotations) - (selectedIndex * sectionAngle + sectionAngle / 2) - (rotation % 360);
      setRotation(targetRotation);
      
      setTimeout(async () => {
        setIsSpinning(false);
        setSpinResult(result);
        
        try {
          const balanceAfterCost = isFreeSpin ? currentBalance : currentBalance - paidSpinCost;
          const finalBalance = balanceAfterCost + result.amount;

          const newSpinsToday = spinsToday + 1;
          // Update local state immediately
          setCanSpinToday(newSpinsToday < maxSpins);

          await setDoc(userRef, {
            walletBalance: finalBalance,
            balance: finalBalance,
            lastSpinAt: serverTimestamp(),
            lastSpinDateStr: todayStr,
            spinsToday: newSpinsToday
          }, { merge: true });
          
          // Log the spin
          await addDoc(collection(db, 'spinner_logs'), {
            userId: user.uid,
            userName: userData?.name || 'User',
            amount: result.amount,
            type: isFreeSpin ? 'free' : 'paid',
            cost: isFreeSpin ? 0 : paidSpinCost,
            createdAt: serverTimestamp(),
            pinned: false
          });
          
          Swal.fire({
            icon: 'success',
            title: 'Congratulations!',
            text: `You won ${formatCurrency(result.amount)}!${!isFreeSpin ? ` (Cost: ${formatCurrency(paidSpinCost)})` : ''}`,
            background: 'var(--card-bg)',
            color: 'var(--text-primary)',
            confirmButtonColor: 'var(--accent-color)'
          });
        } catch (error) {
          console.error('Error processing spin:', error);
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Failed to process spin result.',
            background: 'var(--card-bg)',
            color: 'var(--text-primary)'
          });
        }
      }, 6000);
    } catch (error) {
      console.error("Spin error:", error);
      setIsSpinning(false);
    }
  };

  const [isSyncingAll, setIsSyncingAll] = useState(false);

  const isAdminUser = userData?.role === 'admin' || user?.email?.toLowerCase() === 'sukhchain93581@gmail.com';

  const syncAllUsersToLeaderboard = async () => {
    if (!user || !isAdminUser || isSyncingAll) return;
    setIsSyncingAll(true);
    
    try {
      // Show loading toast
      Swal.fire({
        title: 'Syncing All Users...',
        text: 'Please wait while we update the leaderboard.',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
        background: 'var(--card-bg)',
        color: 'var(--text-primary)'
      });

      const usersSnapshot = await getDocs(collection(db, 'users'));
      let count = 0;
      const batch = writeBatch(db);
      
      usersSnapshot.docs.forEach((userDoc) => {
        const uData = userDoc.data();
        const leaderboardRef = doc(db, 'leaderboard', userDoc.id);
        batch.set(leaderboardRef, {
          name: uData.name || 'User',
          photoURL: uData.photoURL || null,
          totalSpent: Number(uData.totalSpent || 0),
          updatedAt: serverTimestamp()
        }, { merge: true });
        count++;
      });

      await batch.commit();
      Swal.close();

      Swal.fire({
        icon: 'success',
        title: 'Sync Complete',
        text: `Successfully synced ${count} users to the leaderboard.`,
        background: 'var(--card-bg)',
        color: 'var(--text-primary)',
        timer: 3000,
        toast: true,
        position: 'top-end',
        showConfirmButton: false
      });
    } catch (error) {
      console.error("Sync All error:", error);
      Swal.close();
      Swal.fire({
        icon: 'error',
        title: 'Sync Failed',
        text: 'Could not sync all users. Please check permissions.',
        background: 'var(--card-bg)',
        color: 'var(--text-primary)'
      });
    } finally {
      setIsSyncingAll(false);
    }
  };

  const recalculateSpending = async () => {
    if (!user || isSyncing) return;
    setIsSyncing(true);
    
    try {
      // 1. Fetch all completed orders for this user
      const q = query(
        collection(db, 'orders'),
        where('userId', '==', user.uid)
      );
      const querySnapshot = await getDocs(q);
      
      let total = 0;
      querySnapshot.forEach((doc) => {
        const order = doc.data() as Order;
        // Count all orders that were paid for
        // In this app, orders are created after payment, so we count them all
        // unless they were explicitly cancelled/refunded
        if (order.status !== 'Cancelled' && order.status !== 'Rejected') {
          const cost = Number(order.totalCost || order.price || 0);
          if (!isNaN(cost)) {
            total += cost;
          }
        }
      });

      // 2. Update User Document
      await setDoc(doc(db, 'users', user.uid), {
        totalSpent: total
      }, { merge: true });

      // 3. Update Leaderboard Document (for redundancy/public access)
      await setDoc(doc(db, 'leaderboard', user.uid), {
        name: userData?.name || 'User',
        photoURL: userData?.photoURL || null,
        totalSpent: total,
        updatedAt: serverTimestamp()
      }, { merge: true });

      Swal.fire({
        icon: 'success',
        title: 'Rank Updated!',
        text: `Your total spending of ${formatCurrency(total)} has been synced with the leaderboard.`,
        background: 'var(--card-bg)',
        color: 'var(--text-primary)',
        timer: 2000,
        showConfirmButton: false
      });
    } catch (error) {
      console.error("Sync error:", error);
      Swal.fire({
        icon: 'error',
        title: 'Sync Failed',
        text: 'Could not update your rank. Please try again later.',
        background: 'var(--card-bg)',
        color: 'var(--text-primary)'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const scrollToUser = () => {
    if (userItemRef.current) {
      userItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const faqData = [
    { 
      id: 'q1', 
      question: t('faq_q1'), 
      answer: t('faq_a1') 
    },
    { 
      id: 'q2', 
      question: t('faq_q2'), 
      answer: t('faq_a2') 
    },
    { 
      id: 'q3', 
      question: t('faq_q3'), 
      answer: t('faq_a3') 
    },
    { 
      id: 'q4', 
      question: t('faq_q4'), 
      answer: t('faq_a4') 
    },
    { 
      id: 'q5', 
      question: t('faq_q5'), 
      answer: t('faq_a5') 
    },
    { 
      id: 'q6', 
      question: t('faq_q6'), 
      answer: t('faq_a6') 
    },
    { 
      id: 'q7', 
      question: t('faq_q7'), 
      answer: t('faq_a7') 
    },
    { 
      id: 'q8', 
      question: t('faq_q8'), 
      answer: t('faq_a8') 
    },
    { 
      id: 'q9', 
      question: t('faq_q9'), 
      answer: t('faq_a9') 
    },
    { 
      id: 'q10', 
      question: t('faq_q10'), 
      answer: t('faq_a10') 
    }
  ];

  useEffect(() => {
    if (showLeaderboard) {
      setLoadingLeaderboard(true);
      
      // Auto-sync logic
      const checkAndSync = async () => {
        if (!user) return;
        try {
          if (isAdminUser) {
            // Admin automatically syncs everyone to ensure leaderboard is full
            // We only do this if the leaderboard is small or empty to avoid over-syncing
            if (leaderboardUsers.length < 5) {
              await syncAllUsersToLeaderboard();
            }
          } else {
            // Regular user only syncs themselves if missing
            const leaderboardDocRef = doc(db, 'leaderboard', user.uid);
            const docSnap = await getDoc(leaderboardDocRef);
            if (!docSnap.exists()) {
              await recalculateSpending();
            }
          }
        } catch (e) {
          console.error("Auto-sync check failed", e);
        }
      };
      checkAndSync();

      // Query leaderboard collection (which has public read access)
      const q = query(
        collection(db, 'leaderboard'),
        limit(1000)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const users = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            uid: doc.id,
            name: data.name || 'User',
            photoURL: data.photoURL || null,
            totalSpent: Number(data.totalSpent || 0),
            ...data
          };
        }) as UserData[];
        
        // Sort in memory to ensure correct order regardless of server-side indexing
        users.sort((a, b) => {
          const spentDiff = (b.totalSpent || 0) - (a.totalSpent || 0);
          if (spentDiff !== 0) return spentDiff;
          return (a.name || '').localeCompare(b.name || '');
        });
        
        setLeaderboardUsers(users);
        setLoadingLeaderboard(false);
      }, (error) => {
        console.error("Leaderboard fetch error:", error);
        setLoadingLeaderboard(false);
      });

      return () => unsubscribe();
    }
  }, [showLeaderboard, user]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const [chatInput, setChatInput] = useState('');

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, isThinking, showQuestionList]);

  const sendMessageToGemini = async (text: string) => {
    if ((!text.trim() && uploadedFiles.length === 0) || isThinking || !isAiWorking) return;
    
    const userMessage: any = { 
      role: 'user' as const, 
      text: text,
      attachments: uploadedFiles.map(f => ({ data: f.data, type: f.type }))
    };
    
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setUploadedFiles([]);
    setIsThinking(true);
    setShowQuestionList(false);
    
    // Scroll to bottom
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    
    try {
      const msgs = chatMessages.map(m => ({ 
        role: m.role, 
        text: m.text,
        attachments: m.attachments 
      }));
      msgs.push({
        role: userMessage.role,
        text: userMessage.text,
        attachments: userMessage.attachments
      });

      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: appConfig?.geminiApiKey || '',
          config: { appName },
          aiConfig, // Pass AI Config
          messages: msgs
        })
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        let errMsg = errData.error || errData.details?.error?.message || 'API Error';
        if (errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('429')) {
          errMsg = "Sir, abhi AI limit par hai. Please thodi der baad try karein ya support se sampark karein.";
        }
        throw new Error(errMsg);
      }
      
      let data;
      try {
        data = await res.json();
      } catch (err) {
        throw new Error("Failed to parse AI response. Please try again.");
      }
      const cleanReply = data?.text?.replace(/\*\*/g, '').replace(/\*/g, '') || '';
      setChatMessages(prev => [...prev, { role: 'model', text: cleanReply }]);
    } catch (error: any) {
      console.error("Chat error:", error);
      setChatMessages(prev => [...prev, { role: 'model', text: "Error: " + error.message }]);
    } finally {
      setIsThinking(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const handleQuestionSelect = (q: { question: string, answer: string }) => {
    if (isThinking) return;
    
    if (isAiWorking) {
      sendMessageToGemini(q.question);
    } else {
      setShowQuestionList(false);
      setChatMessages(prev => [...prev, { role: 'user', text: q.question }]);
      setIsThinking(true);
      setTimeout(() => {
        setIsThinking(false);
        setChatMessages(prev => [...prev, { role: 'model', text: q.answer }]);
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }, 1500);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = (event.target?.result as string).split(',')[1];
        const preview = file.type.startsWith('image/') ? event.target?.result as string : undefined;
        
        setUploadedFiles(prev => [...prev, {
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          type: file.type,
          data: base64,
          preview
        }]);
      };
      reader.readAsDataURL(file);
    });
    // Clear the input
    e.target.value = '';
  };

  const removeFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  const closeAIHelp = () => {
    setShowAIHelp(false);
    setChatMessages([]);
    setIsThinking(false);
    setShowQuestionList(true);
    setUploadedFiles([]);
  };

  const supportLinks = [
    { 
      id: 'whatsapp', 
      name: 'WhatsApp Contact', 
      icon: <MessageCircle className="w-6 h-6 text-emerald-400" />, 
      url: 'https://wa.me/qr/QRMESJM2C2QTH1',
      color: 'bg-emerald-500/10 border-emerald-500/20'
    },
    { 
      id: 'telegram', 
      name: 'Telegram Contact', 
      icon: <Send className="w-6 h-6 text-sky-400" />, 
      url: 'https://t.me/Sukhchainsinghz',
      color: 'bg-sky-500/10 border-sky-500/20'
    },
    { 
      id: 'instagram', 
      name: 'Instagram Handle', 
      icon: <Instagram className="w-6 h-6 text-pink-400" />, 
      url: 'https://www.instagram.com/sukhchain_singh_93581?igsh=NW8ydmJrcmZqeXI3',
      color: 'bg-pink-500/10 border-pink-500/20'
    }
  ];

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden">
      {/* Split Background Panels */}
      <motion.div 
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 180 }}
        className="absolute inset-y-0 left-0 w-1/2 z-0"
        style={{ backgroundColor: 'var(--bg-color)' }}
      />
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 180 }}
        className="absolute inset-y-0 right-0 w-1/2 z-0"
        style={{ backgroundColor: 'var(--bg-color)' }}
      />

      {/* Content Container */}
      <div className="relative z-10 h-full overflow-y-auto pb-24 pt-20">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="px-6 flex items-center justify-between mb-4"
        >
          <button 
            onClick={onBack}
            className="p-3 bg-black/20 hover:bg-black/40 rounded-2xl transition-all border border-white/10 group backdrop-blur-md"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
          <div className="flex items-center gap-2 px-4 py-2 bg-black/20 rounded-full border border-white/10 backdrop-blur-md">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white">{appName}</span>
          </div>
        </motion.div>

        {/* Square Grid Content */}
        <div className="px-6 mt-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Customer Support Square - Slides from Left */}
            <motion.button
              initial={{ opacity: 0, x: -150 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 180, delay: 0.4 }}
              whileHover={{ scale: 1.02, y: -5 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowSupportOptions(true)}
              className="aspect-[1.4/1] rounded-[2.5rem] p-6 flex flex-col items-center justify-center gap-4 bg-black/30 border border-white/20 glass shadow-2xl relative overflow-hidden group backdrop-blur-xl"
            >
              <div className="relative z-10 transition-transform group-hover:scale-110 duration-300">
                <Headset className="w-12 h-12 text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
              </div>
              <span className="relative z-10 text-xs font-black uppercase tracking-widest text-white text-center drop-shadow-md">
                {t('customer_support')}
              </span>
              <div className="absolute -inset-1 bg-cyan-400/20 opacity-0 group-hover:opacity-100 blur-2xl transition-opacity" />
            </motion.button>

            {/* AI Help Square - Slides from Right */}
            <motion.button
              initial={{ opacity: 0, x: 150 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 180, delay: 0.5 }}
              whileHover={{ scale: 1.02, y: -5 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowAIHelp(true)}
              className="aspect-[1.4/1] rounded-[2.5rem] p-6 flex flex-col items-center justify-center gap-4 bg-black/30 border border-white/20 glass shadow-2xl relative overflow-hidden group backdrop-blur-xl"
            >
              <div className="relative z-10 transition-transform group-hover:scale-110 duration-300">
                <Bot className="w-12 h-12 text-purple-400 drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
              </div>
              <span className="relative z-10 text-xs font-black uppercase tracking-widest text-white text-center drop-shadow-md">
                {t('ai_help')}
              </span>
              <div className="absolute -inset-1 bg-purple-400/20 opacity-0 group-hover:opacity-100 blur-2xl transition-opacity" />
            </motion.button>

            {/* Daily Giveaway Square - Slides from Left */}
            <motion.button
              initial={{ opacity: 0, x: -150 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 180, delay: 0.6 }}
              whileHover={{ scale: 1.02, y: -5 }}
              whileTap={{ scale: 0.95 }}
              onClick={onGiveawayAccess}
              className="aspect-[1.4/1] rounded-[2.5rem] p-6 flex flex-col items-center justify-center gap-4 bg-black/30 border border-white/20 glass shadow-2xl relative overflow-hidden group backdrop-blur-xl"
            >
              <div className="relative z-10 transition-transform group-hover:scale-110 duration-300">
                <Gift className="w-12 h-12 text-rose-400 drop-shadow-[0_0_10px_rgba(251,113,133,0.5)]" />
              </div>
              <span className="relative z-10 text-xs font-black uppercase tracking-widest text-white text-center drop-shadow-md">
                {t('daily_giveaway')}
              </span>
              <div className="absolute -inset-1 bg-rose-400/20 opacity-0 group-hover:opacity-100 blur-2xl transition-opacity" />
            </motion.button>

            {/* Users Chat Square - Slides from Right */}
            <motion.button
              initial={{ opacity: 0, x: 150 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 180, delay: 0.7 }}
              whileHover={{ scale: 1.02, y: -5 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowGlobalChat(true)}
              className="aspect-[1.4/1] rounded-[2.5rem] p-6 flex flex-col items-center justify-center gap-4 bg-black/30 border border-white/20 glass shadow-2xl relative overflow-hidden group backdrop-blur-xl"
            >
              <div className="relative z-10 transition-transform group-hover:scale-110 duration-300">
                <Users className="w-12 h-12 text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
              </div>
              <span className="relative z-10 text-xs font-black uppercase tracking-widest text-white text-center drop-shadow-md">
                {t('users_chat')}
              </span>
              <div className="absolute -inset-1 bg-cyan-400/20 opacity-0 group-hover:opacity-100 blur-2xl transition-opacity" />
            </motion.button>

            {/* Leaderboard Square - Slides from Left */}
            <motion.button
              initial={{ opacity: 0, x: -150 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 180, delay: 0.8 }}
              whileHover={{ scale: 1.02, y: -5 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowLeaderboard(true)}
              className="aspect-[1.4/1] rounded-[2.5rem] p-6 flex flex-col items-center justify-center gap-4 bg-black/30 border border-white/20 glass shadow-2xl relative overflow-hidden group backdrop-blur-xl"
            >
              <div className="relative z-10 transition-transform group-hover:scale-110 duration-300">
                <Trophy className="w-12 h-12 text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]" />
              </div>
              <span className="relative z-10 text-xs font-black uppercase tracking-widest text-white text-center drop-shadow-md">
                {t('leaderboard')}
              </span>
              <div className="absolute -inset-1 bg-amber-400/20 opacity-0 group-hover:opacity-100 blur-2xl transition-opacity" />
            </motion.button>

            {/* Daily Spin Square */}
            <motion.button
              initial={{ opacity: 0, x: 150 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 180, delay: 0.9 }}
              whileHover={{ scale: 1.02, y: -5 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowSpinner(true)}
              className="aspect-[1.4/1] rounded-[2.5rem] p-6 flex flex-col items-center justify-center gap-4 bg-black/30 border border-white/20 glass shadow-2xl relative overflow-hidden group backdrop-blur-xl"
            >
              <div className="relative z-10">
                <Disc className={`w-12 h-12 text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)] ${isSpinning ? 'animate-spin' : ''}`} />
              </div>
              <span className="relative z-10 text-xs font-black uppercase tracking-widest text-white text-center drop-shadow-md">
                {t('daily_spin')}
              </span>
              {!canSpinToday && isEligible && (
                <div className="absolute top-3 right-3 bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full text-[8px] font-black uppercase border border-emerald-500/30">
                  {t('paid')}
                </div>
              )}
              {canSpinToday && isEligible && (
                <div className="absolute top-3 right-3 bg-amber-500/20 text-amber-400 px-2 py-1 rounded-full text-[8px] font-black uppercase border border-amber-500/30">
                  {t('free')}
                </div>
              )}
              {!isEligible && (
                <div className="absolute top-3 right-3 bg-red-500/20 text-red-400 px-2 py-1 rounded-full text-[8px] font-black uppercase border border-red-500/30">
                  {t('locked')}
                </div>
              )}
            </motion.button>
          </div>
        </div>

        {/* Support Options Modal */}
        <AnimatePresence>
          {showSupportOptions && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowSupportOptions(false)}
                className="absolute inset-0 bg-black/80 backdrop-blur-md"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-sm glass rounded-[2.5rem] p-8 border border-white/10 space-y-6"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-black tracking-tight text-white">{t('contact_support')}</h3>
                  <button 
                    onClick={() => setShowSupportOptions(false)}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-white/60" />
                  </button>
                </div>

                <div className="space-y-3">
                  {supportLinks.map((link) => (
                    <button
                      key={link.id}
                      onClick={() => window.open(link.url, '_blank')}
                      className={`w-full p-5 rounded-3xl border flex items-center gap-4 transition-all hover:scale-[1.02] active:scale-[0.98] ${link.color}`}
                    >
                      <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
                        {link.icon}
                      </div>
                      <span className="font-bold text-white/90">{link.name}</span>
                    </button>
                  ))}
                </div>

                <p className="text-[10px] text-white/30 text-center font-bold uppercase tracking-widest">
                  {t('available_24_7')}
                </p>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Global Chat Page */}
        <AnimatePresence>
          {showGlobalChat && (
            <GlobalChat onBack={() => setShowGlobalChat(false)} />
          )}
        </AnimatePresence>

        {/* Leaderboard Page */}
        <AnimatePresence>
          {showLeaderboard && (
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 120 }}
              className="fixed inset-0 z-[80] flex flex-col overflow-hidden"
              style={{ background: 'var(--bg-gradient)' }}
            >
              {/* Header */}
              <div className="relative z-10 px-6 pt-12 pb-4 flex items-center justify-between shrink-0">
                <button 
                  onClick={() => setShowLeaderboard(false)}
                  className="p-3 bg-black/20 hover:bg-black/40 rounded-2xl transition-all border border-white/10 group backdrop-blur-md"
                >
                  <ChevronLeft className="w-6 h-6 text-white" />
                </button>
                <div className="flex items-center gap-3 px-4 py-2 bg-black/20 rounded-full border border-white/10 backdrop-blur-md">
                  <Trophy className="w-5 h-5 text-amber-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-white">{t('leaderboard')}</span>
                </div>
                <div className="flex items-center gap-2">
                  {isAdminUser && (
                    <button 
                      onClick={syncAllUsersToLeaderboard}
                      disabled={isSyncingAll}
                      className={`p-3 bg-blue-500/20 hover:bg-blue-500/40 rounded-2xl transition-all border border-blue-500/20 group backdrop-blur-md ${isSyncingAll ? 'opacity-50' : ''}`}
                      title={t('admin_sync_all')}
                    >
                      <Users className={`w-5 h-5 text-blue-400 ${isSyncingAll ? 'animate-pulse' : ''}`} />
                    </button>
                  )}
                  {leaderboardUsers.some(u => u.uid === user?.uid) && (
                    <button 
                      onClick={scrollToUser}
                      className="p-3 bg-amber-500/20 hover:bg-amber-500/40 rounded-2xl transition-all border border-amber-500/20 group backdrop-blur-md"
                      title={t('find_my_location')}
                    >
                      <Locate className="w-5 h-5 text-amber-400" />
                    </button>
                  )}
                  <button 
                    onClick={recalculateSpending}
                    disabled={isSyncing}
                    className={`p-3 bg-white/10 hover:bg-white/20 rounded-2xl transition-all border border-white/10 group backdrop-blur-md ${isSyncing ? 'opacity-50' : ''}`}
                    title={t('sync_my_rank')}
                  >
                    <RefreshCcw className={`w-5 h-5 text-white ${isSyncing ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Content Area */}
              <div ref={leaderboardScrollRef} className="relative z-10 flex-1 overflow-y-auto px-6 pb-24 custom-scrollbar">
                <div className="max-w-md mx-auto space-y-8 py-4">
                  {/* Top 3 Podium */}
                  <div className="flex items-end justify-center gap-2 mb-12 pt-12 relative">
                    {/* Background Glow */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-amber-500/10 blur-[100px] rounded-full" />

                    {/* 2nd Place */}
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      ref={leaderboardUsers[1]?.uid === user?.uid ? userItemRef : null}
                      className={`relative flex flex-col items-center gap-2 p-3 rounded-3xl transition-all w-24 ${leaderboardUsers[1] ? (leaderboardUsers[1].uid === user?.uid ? 'bg-white/10 border border-white/20' : 'bg-black/20 border border-white/5') : 'opacity-30'}`}
                    >
                      <div className="relative">
                        <div className="w-16 h-16 rounded-full bg-slate-400/20 border-2 border-slate-400 flex items-center justify-center overflow-hidden backdrop-blur-sm">
                          {leaderboardUsers[1]?.photoURL ? (
                            <img src={leaderboardUsers[1].photoURL} alt={leaderboardUsers[1].name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : leaderboardUsers[1] ? (
                            <User className="w-8 h-8 text-slate-300" />
                          ) : (
                            <Trophy className="w-6 h-6 text-white/10" />
                          )}
                        </div>
                        <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-slate-400 flex items-center justify-center text-white font-black text-[10px] border-2 border-white shadow-lg">2</div>
                      </div>
                      <p className="text-[10px] font-black text-white/80 truncate w-full text-center">{leaderboardUsers[1]?.name || '???'}</p>
                      <p className="text-[9px] font-bold text-slate-400">{formatCurrency(leaderboardUsers[1]?.totalSpent || 0)}</p>
                    </motion.div>

                    {/* 1st Place */}
                    <motion.div 
                      initial={{ opacity: 0, y: 20, scale: 0.8 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: 'spring', delay: 0.3 }}
                      ref={leaderboardUsers[0]?.uid === user?.uid ? userItemRef : null}
                      className={`relative flex flex-col items-center gap-3 p-4 rounded-[2.5rem] transition-all w-32 -mt-8 z-10 ${leaderboardUsers[0] ? (leaderboardUsers[0].uid === user?.uid ? 'bg-amber-500/20 border-2 border-amber-500/50 shadow-[0_0_30px_rgba(251,191,36,0.2)]' : 'bg-black/40 border border-amber-500/20 shadow-2xl') : 'opacity-30'}`}
                    >
                      <div className="relative">
                        <div className="w-20 h-20 rounded-full bg-amber-400/20 border-4 border-amber-400 flex items-center justify-center overflow-hidden shadow-[0_0_30px_rgba(251,191,36,0.3)] backdrop-blur-md">
                          {leaderboardUsers[0]?.photoURL ? (
                            <img src={leaderboardUsers[0].photoURL} alt={leaderboardUsers[0].name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : leaderboardUsers[0] ? (
                            <User className="w-10 h-10 text-amber-400" />
                          ) : (
                            <Trophy className="w-8 h-8 text-white/10" />
                          )}
                        </div>
                        <div className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-amber-500 flex items-center justify-center text-white font-black text-xs border-4 border-white shadow-lg">1</div>
                        {leaderboardUsers[0] && <Medal className="absolute -top-10 left-1/2 -translate-x-1/2 w-10 h-10 text-amber-400 animate-bounce" />}
                      </div>
                      <p className="text-xs font-black text-white truncate w-full text-center">{leaderboardUsers[0]?.name || '???'}</p>
                      <p className="text-[10px] font-bold text-amber-400">{formatCurrency(leaderboardUsers[0]?.totalSpent || 0)}</p>
                    </motion.div>

                    {/* 3rd Place */}
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      ref={leaderboardUsers[2]?.uid === user?.uid ? userItemRef : null}
                      className={`relative flex flex-col items-center gap-2 p-3 rounded-3xl transition-all w-24 ${leaderboardUsers[2] ? (leaderboardUsers[2].uid === user?.uid ? 'bg-white/10 border border-white/20' : 'bg-black/20 border border-white/5') : 'opacity-30'}`}
                    >
                      <div className="relative">
                        <div className="w-16 h-16 rounded-full bg-orange-400/20 border-2 border-orange-400 flex items-center justify-center overflow-hidden backdrop-blur-sm">
                          {leaderboardUsers[2]?.photoURL ? (
                            <img src={leaderboardUsers[2].photoURL} alt={leaderboardUsers[2].name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : leaderboardUsers[2] ? (
                            <User className="w-8 h-8 text-orange-300" />
                          ) : (
                            <Trophy className="w-6 h-6 text-white/10" />
                          )}
                        </div>
                        <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center text-white font-black text-[10px] border-2 border-white shadow-lg">3</div>
                      </div>
                      <p className="text-[10px] font-black text-white/80 truncate w-full text-center">{leaderboardUsers[2]?.name || '???'}</p>
                      <p className="text-[9px] font-bold text-orange-400">{formatCurrency(leaderboardUsers[2]?.totalSpent || 0)}</p>
                    </motion.div>
                  </div>

                  {/* List View */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{t('top_contributors')}</h4>
                      <div className="h-px flex-1 mx-4 bg-white/5" />
                    </div>

                    {loadingLeaderboard ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-4">
                        <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">{t('loading_rankings')}</p>
                      </div>
                    ) : leaderboardUsers.length === 0 ? (
                      <div className="text-center py-12 glass rounded-3xl border border-white/5">
                        <Trophy className="w-12 h-12 text-white/5 mx-auto mb-4" />
                        <p className="text-white/20 font-bold text-xs">{t('no_rankings_available')}</p>
                        <div className="flex flex-col gap-2 mt-4">
                          <button onClick={recalculateSpending} className="text-[10px] font-black text-amber-400 uppercase tracking-widest hover:underline">{t('click_to_sync_rank')}</button>
                          {isAdminUser && (
                            <button onClick={syncAllUsersToLeaderboard} disabled={isSyncingAll} className="text-[10px] font-black text-blue-400 uppercase tracking-widest hover:underline disabled:opacity-50">
                              {isSyncingAll ? t('syncing_all') : t('admin_sync_all')}
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        {leaderboardUsers.length > 3 ? (
                          <div className="space-y-4">
                            {leaderboardUsers.slice(3).map((u, idx) => (
                              <motion.div
                                key={u.uid}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                ref={u.uid === user?.uid ? userItemRef : null}
                                className={`glass rounded-[2rem] p-5 flex items-center justify-between border transition-all relative overflow-hidden group ${u.uid === user?.uid ? 'border-amber-400/40 bg-amber-400/5 shadow-[0_0_40px_rgba(251,191,36,0.1)]' : 'border-white/5 hover:border-white/10 hover:bg-white/5'}`}
                              >
                                {u.uid === user?.uid && (
                                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400" />
                                )}
                                <div className="flex items-center gap-5">
                                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xs font-black border transition-all shrink-0 ${u.uid === user?.uid ? 'bg-amber-400 text-black border-amber-400' : 'bg-white/5 text-white/40 border-white/10'}`}>
                                    {idx + 4}
                                  </div>
                                  <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 overflow-hidden shrink-0">
                                    {u.photoURL ? (
                                      <img src={u.photoURL} alt={u.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <User className="w-5 h-5 text-white/20" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className={`font-black tracking-tight truncate ${u.uid === user?.uid ? 'text-amber-400' : 'text-white/90'}`}>{u.name}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{t('rank_label')} #{idx + 4}</span>
                                      <div className="w-1 h-1 rounded-full bg-white/10" />
                                      <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{t('verified_user')}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className={`font-black text-sm ${u.uid === user?.uid ? 'text-amber-400' : 'text-white'}`}>{formatCurrency(u.totalSpent || 0)}</p>
                                  <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest mt-1">{t('total_spent_label')}</p>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-12 glass rounded-3xl border border-white/5">
                            <Users className="w-12 h-12 text-white/5 mx-auto mb-4" />
                            <p className="text-white/20 font-bold text-[10px] uppercase tracking-widest">
                              {isAdminUser ? t('no_more_users') : t('no_more_contributors')}
                            </p>
                            {isAdminUser && (
                              <button 
                                onClick={syncAllUsersToLeaderboard} 
                                disabled={isSyncingAll}
                                className="mt-6 px-8 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-[10px] font-black text-amber-500 uppercase tracking-widest hover:bg-amber-500/20 transition-all disabled:opacity-50"
                              >
                                {isSyncingAll ? t('syncing_all_users') : t('sync_all_to_leaderboard')}
                              </button>
                            )}
                          </div>
                        )}
                        {isAdminUser && leaderboardUsers.length > 3 && (
                          <div className="pt-8 pb-4 text-center">
                            <button 
                              onClick={syncAllUsersToLeaderboard} 
                              disabled={isSyncingAll}
                              className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
                            >
                              {isSyncingAll ? t('syncing_all_users') : t('admin_refresh_rankings')}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer Info */}
              <div className="relative z-10 p-8 border-t border-white/5 shrink-0">
                <p className="text-[10px] text-white/20 text-center font-bold uppercase tracking-widest">
                  {t('live_rankings_desc')}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI Help Page */}
        <AnimatePresence>
          {showAIHelp && (
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 120 }}
              className="fixed inset-0 z-[80] flex flex-col overflow-hidden"
              style={{ background: 'var(--bg-gradient)' }}
            >
              {/* Header */}
              <div className="relative z-10 px-6 pt-12 pb-4 flex items-center justify-between shrink-0">
                <button 
                  onClick={closeAIHelp}
                  className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all border border-white/10 group backdrop-blur-md"
                >
                  <ChevronLeft className="w-6 h-6 text-white" />
                </button>
                <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-full border border-white/10 backdrop-blur-md">
                  <Bot className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-white">{t('ai_assistant')}</span>
                </div>
              </div>

              {/* Content Area */}
              <div className="relative z-10 flex-1 overflow-y-auto px-6 pt-4 pb-4 custom-scrollbar">
                <div className="max-w-md mx-auto space-y-8 pb-32">
                  {/* Title Section */}
                  {chatMessages.length === 0 && (
                    <div className="text-center space-y-2 mb-12">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', delay: 0.3 }}
                        className="w-20 h-20 rounded-[2rem] bg-white/5 flex items-center justify-center border border-white/10 mx-auto shadow-2xl"
                        style={{ boxShadow: '0 0 30px var(--accent-glow)' }}
                      >
                        <Bot className="w-10 h-10" style={{ color: 'var(--accent)' }} />
                      </motion.div>
                      <h2 className="text-3xl font-black tracking-tighter text-white pt-4">{t('how_can_i_help')}</h2>
                      <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--accent)' }}>
                        {isAiWorking ? t('ask_me_anything') || 'ASK ME ANYTHING' : t('select_question_below')}
                      </p>
                    </div>
                  )}

                  {/* Chat History */}
                  <div className="space-y-6">
                    {chatMessages.map((msg, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[85%] p-5 rounded-[2rem] shadow-xl ${
                          msg.role === 'user' 
                            ? 'rounded-tr-none text-white' 
                            : 'rounded-tl-none bg-white/5 border border-white/10 backdrop-blur-2xl text-white/90 font-medium italic'
                        }`}
                        style={{ 
                          backgroundColor: msg.role === 'user' ? 'var(--accent)' : undefined,
                          color: msg.role === 'user' ? 'var(--btn-text)' : undefined,
                          boxShadow: msg.role === 'user' ? '0 10px 20px -5px var(--accent-glow)' : undefined
                        }}>
                          {msg.role === 'model' && (
                            <div className="flex items-center gap-2 mb-2">
                              <Bot className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                              <span className="text-[10px] font-black uppercase tracking-widest opacity-70" style={{ color: 'var(--accent)' }}>{t('ai_response')}</span>
                            </div>
                          )}
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                              {msg.attachments.map((att, aidx) => (
                                <div key={aidx} className="w-12 h-12 rounded-lg bg-white/10 overflow-hidden border border-white/20">
                                  {att.type.startsWith('image/') ? (
                                    <img src={`data:${att.type};base64,${att.data}`} alt="att" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <FileText className="w-6 h-6 text-white/50" />
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))}

                    {/* Thinking State */}
                    {isThinking && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex justify-start"
                      >
                        <div className="p-6 rounded-[2.5rem] rounded-tl-none bg-white/5 border border-white/10 backdrop-blur-2xl shadow-2xl">
                          <div className="flex flex-col items-center gap-4">
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                            >
                              <Loader2 className="w-8 h-8" style={{ color: 'var(--accent)' }} />
                            </motion.div>
                            <p className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: 'var(--accent)' }}>{t('analyzing')}</p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                </div>
              </div>

              {/* Fixed Bottom UI Area */}
              <div className="relative z-20 px-6 pt-4 pb-12 bg-white/5 backdrop-blur-3xl border-t border-white/10 shrink-0">
                <div className="max-w-md mx-auto space-y-6">
                  {isAiWorking ? (
                    <div className="space-y-6">
                      {/* Uploads Preview */}
                      <AnimatePresence>
                        {uploadedFiles.length > 0 && (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="flex flex-wrap gap-2 pb-2"
                          >
                            {uploadedFiles.map(file => (
                              <div key={file.id} className="relative group">
                                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 overflow-hidden backdrop-blur-xl transition-all group-hover:border-purple-500/50">
                                  {file.preview ? (
                                    <img src={file.preview} alt="preview" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center p-2">
                                      <FileText className="w-6 h-6 text-white/40" />
                                      <span className="text-[8px] text-white/30 truncate w-full text-center mt-1">{file.name}</span>
                                    </div>
                                  )}
                                </div>
                                <button 
                                  onClick={() => removeFile(file.id)}
                                  className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg transform transition-all hover:bg-rose-600 z-10"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Question List showing ONLY if no messages yet */}
                      {chatMessages.length === 0 && showQuestionList && (
                        <div className="space-y-4">
                          <p className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em] px-2">
                            {t('popular_topics') || 'POPULAR TOPICS'}
                          </p>
                          <div className="flex gap-2 overflow-x-auto pb-4 custom-scrollbar no-scrollbar">
                            {faqData.slice(0, 4).map((item, index) => (
                              <button
                                key={item.id}
                                onClick={() => handleQuestionSelect(item)}
                                className="whitespace-nowrap px-4 py-2.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-white/60 hover:bg-white/10 hover:text-white transition-all backdrop-blur-xl"
                              >
                                {item.question}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <form 
                        onSubmit={(e) => {
                          e.preventDefault();
                          sendMessageToGemini(chatInput);
                        }}
                        className="flex items-center gap-2"
                      >
                        {/* Paperclip Button */}
                        <button
                          type="button"
                          onClick={() => document.getElementById('user-ai-file-upload')?.click()}
                          className="w-12 h-12 flex items-center justify-center bg-white/5 border border-white/10 rounded-2xl text-white/40 hover:bg-white/10 transition-all shrink-0"
                          style={{ borderColor: 'var(--card-border)' }}
                        >
                          <Paperclip className="w-5 h-5" />
                          <input 
                            id="user-ai-file-upload"
                            type="file"
                            multiple
                            className="hidden"
                            onChange={handleFileUpload}
                          />
                        </button>

                        {/* Pill Input */}
                        <div className="flex-1 relative group">
                          <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder={t('ask_me_anything_placeholder') || (appName === 'Elite Hub' ? "Message Boss AI Assistant..." : "Ask me anything...")}
                            className="w-full bg-white/5 border border-white/10 text-white placeholder-white/20 rounded-full px-6 py-4 text-xs font-semibold focus:outline-none focus:ring-2 backdrop-blur-2xl transition-all"
                            style={{ 
                              borderColor: 'var(--card-border)',
                              focusRingColor: 'var(--accent)'
                            }}
                          />
                        </div>

                        {/* Send Button */}
                        <button
                          type="submit"
                          disabled={isThinking || (!chatInput.trim() && uploadedFiles.length === 0)}
                          className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shrink-0 ${
                            !chatInput.trim() && uploadedFiles.length === 0 
                              ? 'bg-white/5 text-white/10' 
                              : 'text-white shadow-lg shadow-black/20'
                          }`}
                          style={{
                            backgroundColor: (!chatInput.trim() && uploadedFiles.length === 0) ? undefined : 'var(--accent)',
                            boxShadow: (!chatInput.trim() && uploadedFiles.length === 0) ? 'none' : '0 8px 20px -4px var(--accent-glow)'
                          }}
                        >
                          {isThinking ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <Send className="w-5 h-5" />
                          )}
                        </button>
                      </form>
                    </div>
                  ) : (
                    /* Fallback when AI is not configured - Original logic */
                    <div className="py-2">
                       <AnimatePresence mode="wait">
                        {showQuestionList ? (
                           <motion.div
                            key="question-list"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-4"
                          >
                             <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] px-4">
                              {chatMessages.length > 0 ? t('ask_another_question') : t('common_questions')}
                            </p>
                            <div className="max-h-64 overflow-y-auto px-1 custom-scrollbar space-y-2">
                               {faqData.map((item, index) => (
                                <button
                                  key={item.id}
                                  onClick={() => handleQuestionSelect(item)}
                                  className="w-full p-4 rounded-2xl bg-white/5 border border-white/5 text-left text-xs font-bold text-white/60 hover:bg-white/10 transition-all flex items-center justify-between"
                                >
                                  {item.question}
                                  <ChevronLeft className="w-4 h-4 rotate-180 opacity-20" />
                                </button>
                               ))}
                            </div>
                          </motion.div>
                        ) : (
                           <button
                            onClick={() => setShowQuestionList(true)}
                            className="w-full py-4 bg-purple-500 rounded-2xl font-black text-white uppercase tracking-widest text-[10px]"
                           >
                             {t('view_more_questions')}
                           </button>
                        )}
                       </AnimatePresence>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* Spinner Page */}
      <AnimatePresence>
        {showSpinner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-slate-950"
          >
            {/* Header - Safe position */}
            <div className="relative z-10 px-6 pt-12 pb-4 flex items-center justify-between shrink-0 bg-slate-950/80 backdrop-blur-md border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-500/20 rounded-2xl border border-amber-500/30">
                  <Disc className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white tracking-tight">{t('daily_spin')}</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{t('win_free_funds')}</p>
                </div>
              </div>
              <button 
                onClick={() => !isSpinning && setShowSpinner(false)}
                className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all border border-white/10 group backdrop-blur-md"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>

            {/* Content Area - Natural scrolling from top */}
            <div className="relative z-10 flex-1 overflow-y-auto px-6 custom-scrollbar">
              <div className="w-full max-w-sm mx-auto py-12 flex flex-col items-center">
                <div className="flex flex-col items-center gap-6 py-2">
                  {/* Eligibility Badge */}
                  <div className="flex flex-wrap justify-center gap-2">
                    <div className={`px-4 py-2 rounded-full flex items-center gap-2 ${isEligible ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                      <div className={`w-2 h-2 rounded-full ${isEligible ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                      <span className={`text-[10px] font-black uppercase tracking-widest ${isEligible ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isEligible ? t('days_eligibility_left').replace('{days}', String(daysRemaining)) : t('no_free_spins_add_funds')}
                      </span>
                    </div>
                    <div className={`px-4 py-2 rounded-full flex items-center gap-2 ${canSpinToday && isEligible ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-slate-500/10 border border-white/10'}`}>
                      <div className={`w-2 h-2 rounded-full ${canSpinToday && isEligible ? 'bg-amber-500' : 'bg-slate-500'}`} />
                      <span className={`text-[10px] font-black uppercase tracking-widest ${canSpinToday && isEligible ? 'text-amber-400' : 'text-slate-400'}`}>
                        {(() => {
                          const maxSpins = Number(spinnerConfig?.maxSpinsPerDay) || 1;
                          const lastSpinAt = userData?.lastSpinAt;
                          const lastSpinDateStr = userData?.lastSpinDateStr;
                          
                          let lastSpinDate: Date | null = null;
                          if (lastSpinAt) {
                            if (typeof lastSpinAt.toDate === 'function') {
                              lastSpinDate = lastSpinAt.toDate();
                            } else {
                              lastSpinDate = new Date(lastSpinAt);
                            }
                          }
                          
                          const todayStr = new Date().toDateString();
                          const isSameDay = lastSpinDateStr === todayStr || lastSpinDate?.toDateString() === todayStr;
                          
                          let spinsToday = 0;
                          if (lastSpinDate || lastSpinDateStr) {
                            spinsToday = isSameDay ? (Number(userData?.spinsToday) || 0) : 0;
                          } else {
                            spinsToday = Number(userData?.spinsToday) || 0;
                          }
                          
                          const left = Math.max(0, maxSpins - spinsToday);
                          return isEligible && left > 0 ? t('free_spins_left').replace('{count}', String(left)) : t('zero_free_spins_left');
                        })()}
                      </span>
                    </div>
                  </div>

                  {/* The Wheel */}
                    <div className="relative w-64 h-64">
                      {/* Pointer */}
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20">
                        <div className="w-8 h-8 bg-white rotate-45 rounded-sm shadow-xl flex items-center justify-center">
                          <div className="w-2 h-2 bg-slate-900 rounded-full" />
                        </div>
                      </div>

                      {/* Wheel Container */}
                      <motion.div
                        animate={{ rotate: rotation }}
                        transition={{ 
                          duration: 6, 
                          ease: [0.15, 0, 0.15, 1],
                          type: "tween"
                        }}
                        className="w-full h-full rounded-full border-8 border-white/10 relative shadow-[0_0_50px_rgba(251,191,36,0.2)] bg-slate-800 overflow-hidden"
                        style={{
                          background: spinnerConfig?.options ? `conic-gradient(from 0deg, ${
                            spinnerConfig.options.map((_: any, i: number) => {
                              const sectionAngle = 360 / spinnerConfig.options.length;
                              const start = i * sectionAngle;
                              const end = (i + 1) * sectionAngle;
                              const color = i % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'transparent';
                              return `${color} ${start}deg ${end}deg`;
                            }).join(', ')
                          })` : 'none'
                        }}
                      >
                        {/* Section Dividers */}
                        {spinnerConfig?.options?.map((_: any, i: number) => {
                          const sectionAngle = 360 / spinnerConfig.options.length;
                          return (
                            <div
                              key={`line-${i}`}
                              className="absolute top-0 left-1/2 w-px h-1/2 bg-white/10 origin-bottom -translate-x-1/2"
                              style={{ transform: `rotate(${i * sectionAngle}deg)` }}
                            />
                          );
                        })}

                        {/* Prize Labels */}
                        {spinnerConfig?.options?.map((option: any, i: number) => {
                          const numSections = spinnerConfig.options.length;
                          const sectionAngle = 360 / numSections;
                          // Center of the section
                          const angle = i * sectionAngle + sectionAngle / 2;
                          return (
                            <div
                              key={`label-${i}`}
                              className="absolute top-0 left-0 w-full h-full flex items-start justify-center pt-10"
                              style={{ transform: `rotate(${angle}deg)` }}
                            >
                              <span 
                                className="font-black text-white/60 text-[10px] whitespace-nowrap tracking-tighter"
                                style={{ transform: 'rotate(0deg)' }}
                              >
                                {formatCurrency(option.amount)}
                              </span>
                            </div>
                          );
                        })}
                        
                        {/* Center Hub */}
                        <div className="absolute inset-0 m-auto w-12 h-12 bg-slate-900 rounded-full border-4 border-white/10 z-10 flex items-center justify-center shadow-xl">
                          <div className="w-2 h-2 bg-amber-400 rounded-full" />
                        </div>
                      </motion.div>
                    </div>

                    <button
                      onClick={handleSpin}
                      disabled={isSpinning}
                      className={`w-full py-5 rounded-2xl font-black uppercase tracking-widest transition-all shadow-xl flex items-center justify-center gap-3 ${
                        isSpinning 
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                          : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:scale-[1.02] active:scale-95 shadow-amber-500/20'
                      }`}
                    >
                      {isSpinning ? (
                        <>
                          <Loader2 className="w-6 h-6 animate-spin" />
                          {t('spinning')}
                        </>
                      ) : (
                        <>
                          <Disc className="w-6 h-6" />
                          {isEligible && canSpinToday ? t('spin_now_free') : t('spin_for').replace('{amount}', formatCurrency(spinnerConfig?.paidSpinCost || 0))}
                        </>
                      )}
                    </button>

                    <p className="text-[10px] text-slate-400 text-center font-bold uppercase tracking-[0.2em] max-w-[200px] mt-6">
                      {t('good_luck_win_up_to').replace('{amount}', formatCurrency(Math.max(...(spinnerConfig?.options?.map((o: any) => o.amount) || [0]))))}
                    </p>
                  </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EliteHub;
