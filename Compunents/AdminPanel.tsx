import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, limit, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDoc, writeBatch, getDocs, where, setDoc } from 'firebase/firestore';
import { db, rtdb } from '../firebase';
import { ref, onValue, remove, set } from 'firebase/database';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  ClipboardList, 
  Layers, 
  IndianRupee, 
  ArrowLeft, 
  TrendingUp,
  Clock,
  Menu,
  Volume2,
  VolumeX,
  Play,
  RotateCcw,
  Copy,
  LayoutDashboard,
  Settings,
  Plus,
  Trash2,
  Edit,
  Save,
  Search,
  Loader2,
  RefreshCcw,
  ShoppingCart,
  Eye,
  EyeOff,
  CreditCard,
  Bell,
  Check,
  Zap,
  Info,
  ChevronDown,
  Pin,
  PinOff,
  ShieldAlert,
  ShieldCheck,
  UserMinus,
  ExternalLink,
  Phone,
  Mail,
  User,
  Gift,
  Disc,
  Lock,
  Bot,
  Send,
  Square,
  Mic,
  MicOff,
  Paperclip,
  X,
  FileText,
  ChevronLeft,
  Image as ImageIcon,
  Video as VideoIcon
} from 'lucide-react';
import { formatCurrency } from '../utils';
import { getCategoryIcon } from '../utils/categoryIcons';
import { FONTS } from '../constants';
import { languages, translations } from '../translations';
import { useTranslation } from '../contexts/LanguageContext';
import Swal from 'sweetalert2';

const normalizeText = (str: string): string => {
  if (!str) return '';
  return str.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
};

interface AdminPanelProps {
  onBack: () => void;
}

type AdminView = 'dashboard' | 'services' | 'app_management' | 'orders' | 'payments' | 'notifications' | 'user_management' | 'security_monitor' | 'referral_management' | 'daily_giveaway' | 'spinner_management' | 'password_management' | 'ai_assistant';

const AdminPanel: React.FC<AdminPanelProps> = ({ onBack }) => {
  const { t: contextT } = useTranslation();
  const t = (key: string) => translations.en[key] || key;
  const [view, setView] = useState<AdminView>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalOrders: 0,
    totalServices: 0,
    totalRevenue: 0
  });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [orderFilter, setOrderFilter] = useState<'active' | 'history'>('active');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [fundRequests, setFundRequests] = useState<any[]>([]);
  const [paymentFilter, setPaymentFilter] = useState<'active' | 'history'>('active');
  const [services, setServices] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [adminNotifications, setAdminNotifications] = useState<any[]>([]);
  const [notificationForm, setNotificationForm] = useState({
    title: '',
    message: '',
    bannerUrl: '',
    actionUrl: '',
    targetType: 'all' as 'all' | 'specific',
    selectedUsers: [] as string[]
  });
  const [loading, setLoading] = useState(true);
  const [securityTracking, setSecurityTracking] = useState<any[]>([]);
  const [securitySearchQuery, setSecuritySearchQuery] = useState('');
  const [pinnedDevices, setPinnedDevices] = useState<Record<string, boolean>>({});
  const [signupLimitHours, setSignupLimitHours] = useState(24);
  const [referralReward, setReferralReward] = useState(6);
  const [referralLogs, setReferralLogs] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Giveaway State
  const [giveaways, setGiveaways] = useState<any[]>([]);
  const [showGiveawayModal, setShowGiveawayModal] = useState(false);
  const [editingGiveaway, setEditingGiveaway] = useState<any>(null);
  const [giveawayForm, setGiveawayForm] = useState({
    category: '',
    serviceId: '',
    quantity: '',
    maxUsers: '',
    refresh24h: true,
    enabled: true
  });

  // Spinner State
  const [spinnerConfig, setSpinnerConfig] = useState<any>({
    options: Array(10).fill(null).map(() => ({ amount: 0, probability: 10 })),
    eligibilityDays: 5,
    maxSpinsPerDay: 1,
    paidSpinCost: 10
  });
  const [spinnerLogs, setSpinnerLogs] = useState<any[]>([]);
  const [giveawayParticipants, setGiveawayParticipants] = useState<Record<string, any[]>>({});
  const [categories, setCategories] = useState<any[]>([]);
  const [smmBalance, setSmmBalance] = useState<string | null>(null);
  const [checkingBalance, setCheckingBalance] = useState(false);
  const [catSearch, setCatSearch] = useState('');
  const [svcSearch, setSvcSearch] = useState('');

  // AI Assistant State
  const [adminAiChat, setAdminAiChat] = useState<{ role: 'user' | 'model', text: string, attachments?: any[] }[]>(() => {
    const saved = localStorage.getItem('adminAiChat');
    return saved ? JSON.parse(saved) : [];
  });
  const [aiInput, setAiInput] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(() => {
    const saved = localStorage.getItem('adminVoiceEnabled');
    return saved === 'true';
  });
  const [aiConfig, setAiConfig] = useState<any>({
    authorityLevel: 3, // 1: Low, 2: Medium, 3: High
    voiceLang: 'hi-IN',
    voiceRate: 1.0,
    voicePitch: 1.0,
    voiceGender: 'male',
    adminCustomInstructions: '',
    userCustomInstructions: ''
  });
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [savingAiConfig, setSavingAiConfig] = useState(false);
  const [instructionTarget, setInstructionTarget] = useState<'admin' | 'user' | null>(null);
  const [customInstructionText, setCustomInstructionText] = useState('');
  const [playingMessageIndex, setPlayingMessageIndex] = useState<number | null>(null);
  const [activeWordIndex, setActiveWordIndex] = useState<number | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<{ id: string, name: string, type: string, data: string, preview?: string }[]>([]);
  const aiChatEndRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Sync AI Chat to LocalStorage
  useEffect(() => {
    localStorage.setItem('adminAiChat', JSON.stringify(adminAiChat));
    if (adminAiChat.length > 0) {
      setTimeout(() => aiChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [adminAiChat]);

  const toggleVoice = () => {
    const newValue = !isVoiceEnabled;
    setIsVoiceEnabled(newValue);
    localStorage.setItem('adminVoiceEnabled', newValue.toString());
    if (!newValue && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setPlayingMessageIndex(null);
      setActiveWordIndex(null);
    }
    Swal.fire({
      icon: 'info',
      title: newValue ? 'Voice Enabled' : 'Voice Disabled',
      text: newValue ? 'AI ab bol kar bhi answer dega.' : 'AI ab sirf likh kar answer dega.',
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 2000
    });
  };

  const speak = (text: string, msgIndex?: number) => {
    if (!('speechSynthesis' in window)) return;
    
    // Stop any existing speech
    window.speechSynthesis.cancel();
    
    // Remove markdown stars from text before speaking
    const cleanText = text.replace(/\*\*/g, '').replace(/\*/g, '');
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Voice selection based on gender preference
    const voices = window.speechSynthesis.getVoices();
    const gender = aiConfig.voiceGender || 'male';
    const isMale = gender === 'male';
    
    let preferredVoice;
    // Enhanced gender search
    preferredVoice = voices.find(v => 
      (v.lang.startsWith('hi') || v.lang.startsWith('en')) && 
      (isMale 
        ? /male|david|mark|ravi|guy|google hindi$/i.test(v.name) 
        : /female|zira|samantha|heera|girl|google hindi female/i.test(v.name)
      )
    );
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    
    // Auto-adjust pitch based on gender for better "vibe"
    const basePitch = aiConfig.voicePitch || 1.0;
    utterance.pitch = isMale ? basePitch * 0.85 : basePitch * 1.15;
    utterance.rate = aiConfig.voiceRate || 1.0;
    utterance.lang = aiConfig.voiceLang || 'hi-IN';
    
    const words = cleanText.split(/\s+/);
    
    utterance.onstart = () => {
      setIsSpeaking(true);
      if (msgIndex !== undefined) setPlayingMessageIndex(msgIndex);
    };
    
    utterance.onboundary = (event) => {
      if (event.name === 'word' && msgIndex !== undefined) {
        const charIndex = event.charIndex;
        let currentPos = 0;
        for (let i = 0; i < words.length; i++) {
          if (currentPos >= charIndex) {
            setActiveWordIndex(i);
            break;
          }
          currentPos += words[i].length + 1;
        }
      }
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      setPlayingMessageIndex(null);
      setActiveWordIndex(null);
    };
    
    utterance.onerror = () => {
      setIsSpeaking(false);
      setPlayingMessageIndex(null);
      setActiveWordIndex(null);
    };
    
    window.speechSynthesis.speak(utterance);
  };

  const stopAiGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsAiThinking(false);
      Swal.fire({
        icon: 'info',
        title: 'Stooped',
        text: 'AI generation rok di gayi hai.',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    Swal.fire({
      icon: 'success',
      title: 'Copied!',
      text: 'Answer copy kar liya gaya hai.',
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 2000
    });
  };

  const regenerateLastMessage = async () => {
    if (adminAiChat.length < 2) return;
    
    const lastMsg = adminAiChat[adminAiChat.length - 1];
    if (lastMsg.role !== 'model') return;

    // Find the last user message
    let lastUserMsgIndex = -1;
    for (let i = adminAiChat.length - 2; i >= 0; i--) {
      if (adminAiChat[i].role === 'user') {
        lastUserMsgIndex = i;
        break;
      }
    }

    if (lastUserMsgIndex === -1) return;

    const userText = adminAiChat[lastUserMsgIndex].text;
    
    // Remove the last AI response
    const newChat = adminAiChat.slice(0, adminAiChat.length - 1);
    setAdminAiChat(newChat);

    // Resubmit without adding user message again to chat list
    submitAdminAi(userText, true); 
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const rawData = event.target?.result as string;
        const base64Data = rawData.split(',')[1];
        
        setUploadedFiles(prev => [...prev, {
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          type: file.type,
          data: base64Data,
          preview: file.type.startsWith('image/') ? rawData : undefined
        }]);
      };
      reader.readAsDataURL(file);
    });
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  // Update current time every second for the countdown timers
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-cleanup history after 12 hours (Soft delete from Admin view)
  useEffect(() => {
    const cleanupHistory = async () => {
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

      // Soft Cleanup Orders for Admin
      const expiredOrders = allOrders.filter(o => {
        if (o.pinned || o.hiddenFromAdmin) return false;
        if (o.status !== 'Completed' && o.status !== 'Cancelled') return false;
        const processedAt = o.processedAt?.toDate?.() || o.updatedAt?.toDate?.();
        return processedAt && processedAt < twelveHoursAgo;
      });

      for (const order of expiredOrders) {
        await updateDoc(doc(db, 'orders', order.id), { hiddenFromAdmin: true });
      }

      // Soft Cleanup Payments for Admin
      const expiredPayments = fundRequests.filter(r => {
        if (r.pinned || r.hiddenFromAdmin) return false;
        if (r.status === 'Pending') return false;
        const processedAt = r.processedAt?.toDate?.() || r.updatedAt?.toDate?.();
        return processedAt && processedAt < twelveHoursAgo;
      });

      for (const request of expiredPayments) {
        await updateDoc(doc(db, 'fundRequests', request.id), { hiddenFromAdmin: true });
      }

      // Soft Cleanup Referrals for Admin
      const expiredReferrals = referralLogs.filter(log => {
        if (log.pinned || log.hiddenFromAdmin) return false;
        const logTime = log.time;
        return logTime < twelveHoursAgo.getTime();
      });

      for (const log of expiredReferrals) {
        await set(ref(rtdb, `referrals/${log.id}/hiddenFromAdmin`), true);
      }

      // Soft Cleanup Spinner Logs for Admin
      const expiredSpinnerLogs = spinnerLogs.filter(log => {
        if (log.pinned || log.hiddenFromAdmin) return false;
        const logTime = log.createdAt?.toDate ? log.createdAt.toDate().getTime() : new Date(log.createdAt).getTime();
        return logTime < twelveHoursAgo.getTime();
      });

      for (const log of expiredSpinnerLogs) {
        await updateDoc(doc(db, 'spinner_logs', log.id), { hiddenFromAdmin: true });
      }
    };

    const interval = setInterval(cleanupHistory, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [allOrders, fundRequests, referralLogs, spinnerLogs]);
  
  // App Management State
  const [appConfig, setAppConfig] = useState<any>({
    appName: 'InstaBoost',
    qrUrl: '',
    upiId: '',
    minPayment: 10,
    maxPayment: 10000,
    isMaintenanceMode: false,
    eliteHubEnabled: true,
    serviceMarkup: 0,
    defaultLanguage: 'en',
    showLanguageSettings: true,
    geminiApiKey: '',
    forceGlobalLanguage: false,
    appNameStyling: {
      enabled: false,
      color: '#06b6d4',
      effect: 'classic',
      rgbEnabled: false,
      rgbSpeed: 5,
      fontStyle: 'Inter',
      animation: 'none',
      applyGlobalFont: false
    },
    smmServers: [] as any[]
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingGemini, setTestingGemini] = useState(false);
  const [showStylingOptions, setShowStylingOptions] = useState(() => {
    const saved = localStorage.getItem('adminShowStyling');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [verificationEmail, setVerificationEmail] = useState('');
  const [emailAppPassword, setEmailAppPassword] = useState('');
  const [savingVerificationCreds, setSavingVerificationCreds] = useState(false);
  const [showPaymentSettings, setShowPaymentSettings] = useState(false);
  const [tempSelectedMethod, setTempSelectedMethod] = useState<'manual' | 'automatic'>('manual');
  const [showAppPassword, setShowAppPassword] = useState(false);

  useEffect(() => {
    if (showPaymentSettings && appConfig?.paymentVerificationMethod) {
      setTempSelectedMethod(appConfig.paymentVerificationMethod);
    }
  }, [showPaymentSettings, appConfig?.paymentVerificationMethod]);

  useEffect(() => {
    if (appConfig?.verificationEmail !== undefined) {
      setVerificationEmail(appConfig.verificationEmail);
    }
    if (appConfig?.emailAppPassword !== undefined) {
      setEmailAppPassword(appConfig.emailAppPassword);
    }
  }, [appConfig?.verificationEmail, appConfig?.emailAppPassword]);

  const toggleStylingOptions = () => {
    const newValue = !showStylingOptions;
    setShowStylingOptions(newValue);
    localStorage.setItem('adminShowStyling', JSON.stringify(newValue));
  };

  // Admin Config (Password & Firebase)
  const [adminConfig, setAdminConfig] = useState({
    adminPassword: 'admin12345'
  });
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [savingAdminConfig, setSavingAdminConfig] = useState(false);

  // Service Form State
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [editingService, setEditingService] = useState<any>(null);
  const [serviceForm, setServiceForm] = useState({
    category: '',
    items: [{
      name: '',
      emoji: '',
      description: '',
      pricePerUnit: '',
      minQty: '',
      maxQty: '',
      api_service_id: ''
    }]
  });


  const addServiceItem = () => {
    setServiceForm(prev => ({
      ...prev,
      items: [...prev.items, { name: '', emoji: '', description: '', pricePerUnit: '', minQty: '', maxQty: '', api_service_id: '' }]
    }));
  };

  const removeServiceItem = (index: number) => {
    if (serviceForm.items.length <= 1) return;
    setServiceForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const updateServiceItem = (index: number, field: string, value: string) => {
    setServiceForm(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === index ? { ...item, [field]: value } : item)
    }));
  };

  useEffect(() => {
    // Real-time Users List
    const unsubscribeUsersList = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(usersData);
      setStats(prev => ({ ...prev, totalUsers: snapshot.size }));
    });

    // Real-time Notifications
    const unsubscribeNotifications = onSnapshot(query(collection(db, 'notifications'), orderBy('createdAt', 'desc')), (snapshot) => {
      const notificationsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAdminNotifications(notificationsData);
    });

    // Consolidated Orders Listener (Stats, All Orders, Recent Orders)
    const qAllOrders = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribeAllOrders = onSnapshot(qAllOrders, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      
      setAllOrders(orders);
      setRecentOrders(orders.filter(o => !o.hiddenFromAdmin).slice(0, 5));
      
      const revenue = orders.reduce((acc, order: any) => acc + (order.totalCost || 0), 0);
      setStats(prev => ({ 
        ...prev, 
        totalOrders: snapshot.size, 
        totalRevenue: revenue 
      }));
      
      setLoading(false);
    }, (error: any) => {
      console.error("Error listening to all orders:", error);
      if (error.message?.includes('quota')) {
        console.warn("Firestore Quota Exceeded");
      }
    });

    // Real-time Services
    const unsubscribeServices = onSnapshot(collection(db, 'services'), (snapshot) => {
      const servicesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setServices(servicesData);
      setStats(prev => ({ ...prev, totalServices: snapshot.size }));
    });

    // App Config
    const unsubscribeConfig = onSnapshot(doc(db, 'settings', 'app_config'), (snapshot) => {
      if (snapshot.exists()) {
        setAppConfig(prev => ({ ...prev, ...snapshot.data() }));
      }
    });

    // AI Config
    const unsubscribeAiConfig = onSnapshot(doc(db, 'settings', 'ai_config'), (snapshot) => {
      if (snapshot.exists()) {
        setAiConfig(prev => ({ ...prev, ...snapshot.data() }));
      }
    });

    // Real-time Fund Requests
    const unsubscribeFunds = onSnapshot(query(collection(db, 'fundRequests'), orderBy('createdAt', 'desc')), (snapshot) => {
      const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFundRequests(requests);
    });

    // Real-time Security Tracking
    const securityRef = ref(rtdb, 'security_tracking/logs');
    const unsubscribeSecurity = onValue(securityRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const trackingList = Object.entries(data).map(([id, value]: [string, any]) => ({
          id,
          ...value
        })).sort((a, b) => {
          const timeA = a.createdAt || a.timestamp || 0;
          const timeB = b.createdAt || b.timestamp || 0;
          return Number(timeB) - Number(timeA);
        });
        setSecurityTracking(trackingList);
      } else {
        setSecurityTracking([]);
      }
    });

    // Real-time Pinned Devices
    const pinnedRef = ref(rtdb, 'pinned_devices');
    const unsubscribePinned = onValue(pinnedRef, (snapshot) => {
      if (snapshot.exists()) {
        setPinnedDevices(snapshot.val());
      } else {
        setPinnedDevices({});
      }
    });

    // Real-time Signup Limit Config
    const limitRef = ref(rtdb, 'settings/signup_limit_hours');
    const unsubscribeLimit = onValue(limitRef, (snapshot) => {
      if (snapshot.exists()) {
        setSignupLimitHours(snapshot.val());
      }
    });

    // Real-time Referral Reward Config
    const rewardRef = ref(rtdb, 'settings/referralReward');
    const unsubscribeReward = onValue(rewardRef, (snapshot) => {
      if (snapshot.exists()) {
        setReferralReward(snapshot.val());
      }
    });

    // Real-time Referral Logs
    const referralsRef = ref(rtdb, 'referrals');
    const unsubscribeReferrals = onValue(referralsRef, async (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const logs = await Promise.all(Object.entries(data).map(async ([id, value]: [string, any]) => {
          // Fetch user details for referrer and new user
          const referrerSnap = await getDoc(doc(db, 'users', value.referrerId));
          const newUserSnap = await getDoc(doc(db, 'users', value.newUserId));
          
          return {
            id,
            ...value,
            referrer: referrerSnap.exists() ? referrerSnap.data() : { name: 'Unknown', email: 'N/A', phone: 'N/A' },
            newUser: newUserSnap.exists() ? newUserSnap.data() : { name: 'Unknown', email: 'N/A', phone: 'N/A' }
          };
        }));
        setReferralLogs(logs.sort((a, b) => b.time - a.time));
      } else {
        setReferralLogs([]);
      }
    });

    // Real-time Giveaways
    const unsubscribeGiveaways = onSnapshot(collection(db, 'giveaways'), (snapshot) => {
      const giveawaysData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setGiveaways(giveawaysData);
    });

    // Real-time Categories for Giveaway Form
    const unsubscribeCategories = onSnapshot(collection(db, 'categories'), (snapshot) => {
      const categoriesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCategories(categoriesData);
    });

    // Real-time Giveaway Participants
    const unsubscribeParticipants = onSnapshot(collection(db, 'giveaway_participants'), (snapshot) => {
      const participantsData: Record<string, any[]> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const giveawayId = data.giveawayId;
        if (!participantsData[giveawayId]) {
          participantsData[giveawayId] = [];
        }
        participantsData[giveawayId].push({ id: doc.id, ...data });
      });
      setGiveawayParticipants(participantsData);
    });

    // Real-time Spinner Config
    const unsubscribeSpinnerConfig = onSnapshot(doc(db, 'settings', 'spinner_config'), (snapshot) => {
      if (snapshot.exists()) {
        setSpinnerConfig(snapshot.data());
      }
    });

    // Real-time Spinner Logs
    const unsubscribeSpinnerLogs = onSnapshot(query(collection(db, 'spinner_logs'), orderBy('createdAt', 'desc')), (snapshot) => {
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSpinnerLogs(logs);
    });

    // Admin Config
    const unsubscribeAdminConfig = onSnapshot(doc(db, 'settings', 'admin_config'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setAdminConfig({
          adminPassword: data.adminPassword || 'admin12345',
          ...data
        });
      } else {
        setAdminConfig({ adminPassword: 'admin12345' });
      }
    });

      return () => {
        unsubscribeUsersList();
        unsubscribeNotifications();
        unsubscribeAllOrders();
        unsubscribeServices();
        unsubscribeConfig();
        unsubscribeFunds();
        unsubscribeSecurity();
        unsubscribePinned();
        unsubscribeLimit();
        unsubscribeReward();
        unsubscribeReferrals();
        unsubscribeGiveaways();
        unsubscribeCategories();
        unsubscribeParticipants();
        unsubscribeSpinnerConfig();
        unsubscribeSpinnerLogs();
        unsubscribeAdminConfig();
      };
  }, []);

  const handleUpdatePaymentStatus = async (requestId: string, newStatus: 'Approved' | 'Rejected') => {
    try {
      const requestRef = doc(db, 'fundRequests', requestId);
      const requestSnap = await getDoc(requestRef);
      
      if (!requestSnap.exists()) throw new Error('Request not found');
      const requestData = requestSnap.data();

      if (requestData.status !== 'Pending') {
        throw new Error('This request has already been processed.');
      }

      if (newStatus === 'Approved') {
        const userRef = doc(db, 'users', requestData.userId);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const userData = userSnap.data();
          const currentBalance = userData.walletBalance !== undefined ? userData.walletBalance : (userData.balance || 0);
          const amountToAdd = Number(requestData.amount);

          await updateDoc(userRef, {
            walletBalance: currentBalance + amountToAdd,
            balance: currentBalance + amountToAdd,
            updatedAt: serverTimestamp()
          });

          // Add a notification for the user
          await addDoc(collection(db, 'notifications'), {
            userId: requestData.userId,
            title: 'Funds Added!',
            message: `Your payment of ${formatCurrency(amountToAdd)} has been verified and added to your wallet.`,
            createdAt: serverTimestamp()
          });

          Swal.fire({ icon: 'success', title: 'Payment Approved', text: `${formatCurrency(amountToAdd)} added to user balance.`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
        }
      } else {
        // Add a notification for rejection
        await addDoc(collection(db, 'notifications'), {
          userId: requestData.userId,
          title: 'Payment Rejected',
          message: `Your payment request (ID: ${requestData.transactionId}) was rejected. Please ensure you have made the payment before submitting a request.`,
          createdAt: serverTimestamp()
        });
        Swal.fire({ icon: 'error', title: 'Payment Rejected', text: 'Request marked as rejected.', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
      }

      await updateDoc(requestRef, {
        status: newStatus,
        processedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: error.message });
    }
  };

  const handleUpdatePaymentMethod = async (method: 'manual' | 'automatic') => {
    if (method === 'automatic') {
      // Just set UI state! Do NOT save to DB to satisfy "Automatic button click ho, par bina input details ke DB me save na ho"
      setTempSelectedMethod('automatic');
      
      const email = (verificationEmail || '').trim();
      const pass = (emailAppPassword || '').trim().replace(/\s/g, '');
      if (!email || pass.length !== 16) {
        Swal.fire({
          icon: 'info',
          title: 'Fill & Save Credentials',
          text: 'Gmail IMAP credentials must be filled and saved below to fully activate the Automatic route.',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 4000
        });
      }
      return;
    }

    // For manual mode, configure DB instantly!
    try {
      const configRef = doc(db, 'settings', 'app_config');
      await updateDoc(configRef, {
        paymentVerificationMethod: 'manual',
        updatedAt: serverTimestamp()
      });
      setTempSelectedMethod('manual');
      Swal.fire({
        icon: 'success',
        title: 'Status: Manual Verification',
        text: 'Payment verification method set to Manual. All requests will require administrative approval.',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } catch (err: any) {
      try {
        const { setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, 'settings', 'app_config'), {
          ...appConfig,
          paymentVerificationMethod: 'manual',
          updatedAt: serverTimestamp()
        });
        setTempSelectedMethod('manual');
        Swal.fire({
          icon: 'success',
          title: 'Status: Manual Verification',
          text: 'Payment verification method set to Manual. All requests will require administrative approval.',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
      } catch (innerErr: any) {
        Swal.fire({ icon: 'error', title: 'Error', text: innerErr.message });
      }
    }
  };

  const handleSaveVerificationCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingVerificationCreds(true);
    try {
      if (!verificationEmail.trim() || !emailAppPassword.trim()) {
        throw new Error('Both Verification Email and 16-Digit App Password are required for Automatic Verification.');
      }
      
      const cleanPassword = emailAppPassword.replace(/\s/g, '');
      if (cleanPassword.length !== 16) {
        throw new Error('Please enter a valid 16-digit Google App Password.');
      }

      const configRef = doc(db, 'settings', 'app_config');
      await updateDoc(configRef, {
        verificationEmail: verificationEmail.trim(),
        emailAppPassword: emailAppPassword.trim(),
        paymentVerificationMethod: 'automatic', // Switch to automatic on successful save!
        updatedAt: serverTimestamp()
      });

      Swal.fire({
        icon: 'success',
        title: 'Automatic Mode Active!',
        text: 'Credentials saved & Automatic Payment Verification is now fully active.',
        confirmButtonColor: '#06b6d4'
      });
    } catch (err: any) {
      try {
        const { setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, 'settings', 'app_config'), {
          ...appConfig,
          verificationEmail: verificationEmail.trim(),
          emailAppPassword: emailAppPassword.trim(),
          paymentVerificationMethod: 'automatic', // Switch to automatic on successful save!
          updatedAt: serverTimestamp()
        });
        Swal.fire({
          icon: 'success',
          title: 'Automatic Mode Active!',
          text: 'Credentials saved & Automatic Payment Verification is now fully active.',
          confirmButtonColor: '#06b6d4'
        });
      } catch (innerErr: any) {
        Swal.fire({ icon: 'error', title: 'Error', text: innerErr.message });
      }
    } finally {
      setSavingVerificationCreds(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);
      
      if (!orderSnap.exists()) throw new Error('Order not found');
      const orderData = orderSnap.data();

      // If status is being changed to Cancelled, refund the user
      if (newStatus === 'Cancelled' && orderData.status !== 'Cancelled') {
        const userRef = doc(db, 'users', orderData.userId);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const userData = userSnap.data();
          const currentBalance = userData.walletBalance !== undefined ? userData.walletBalance : (userData.balance || 0);
          await updateDoc(userRef, {
            walletBalance: currentBalance + (orderData.totalCost || 0),
            balance: currentBalance + (orderData.totalCost || 0),
            updatedAt: serverTimestamp()
          });
          Swal.fire({ icon: 'info', title: 'Order Cancelled', text: `Refunded ${formatCurrency(orderData.totalCost)} to user.`, toast: true, position: 'top-end', showConfirmButton: false, timer: 4000 });
        }
      }

      await updateDoc(orderRef, {
        status: newStatus,
        processedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      if (newStatus !== 'Cancelled') {
        Swal.fire({ icon: 'success', title: `Order marked as ${newStatus}`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
      }
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: error.message });
    }
  };

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    Swal.fire({ icon: 'success', title: 'Link Copied', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
  };

  const togglePin = async (type: 'orders' | 'fundRequests', id: string, currentPinned: boolean) => {
    try {
      await updateDoc(doc(db, type, id), {
        pinned: !currentPinned,
        updatedAt: serverTimestamp()
      });
      Swal.fire({ 
        icon: 'success', 
        title: !currentPinned ? 'Pinned' : 'Unpinned', 
        toast: true, 
        position: 'top-end', 
        showConfirmButton: false, 
        timer: 2000 
      });
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: error.message });
    }
  };

  const handleSaveSpinnerConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setDoc(doc(db, 'settings', 'spinner_config'), {
        ...spinnerConfig,
        updatedAt: serverTimestamp()
      });
      Swal.fire({ icon: 'success', title: 'Config Saved', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: error.message });
    }
  };

  const handlePinSpinnerLog = async (logId: string, currentPinned: boolean) => {
    try {
      await updateDoc(doc(db, 'spinner_logs', logId), {
        pinned: !currentPinned
      });
    } catch (error: any) {
      console.error('Error pinning log:', error);
    }
  };

  const handleDeleteSpinnerLog = async (logId: string) => {
    try {
      await deleteDoc(doc(db, 'spinner_logs', logId));
    } catch (error: any) {
      console.error('Error deleting log:', error);
    }
  };

  const getCountdown = (processedAt: any) => {
    if (!processedAt) return null;
    const date = processedAt.toDate?.() || new Date(processedAt);
    const expiryDate = new Date(date.getTime() + 12 * 60 * 60 * 1000);
    const diff = expiryDate.getTime() - currentTime.getTime();

    if (diff <= 0) return "Expiring...";

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return `${hours}h ${minutes}m ${seconds}s`;
  };

  const handleSendNotification = async (data: { title: string, message: string, bannerUrl?: string, actionUrl?: string, targetType: 'all' | 'specific', selectedUsers: string[] }) => {
    try {
      if (data.targetType === 'all') {
        await addDoc(collection(db, 'notifications'), {
          title: data.title,
          message: data.message,
          bannerUrl: data.bannerUrl || '',
          actionUrl: data.actionUrl || '',
          isGlobal: true,
          createdAt: serverTimestamp()
        });
      } else {
        for (const userId of data.selectedUsers) {
          await addDoc(collection(db, 'notifications'), {
            userId,
            title: data.title,
            message: data.message,
            bannerUrl: data.bannerUrl || '',
            actionUrl: data.actionUrl || '',
            isGlobal: false,
            createdAt: serverTimestamp()
          });
        }
      }
      Swal.fire({ icon: 'success', title: 'Notification Sent', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: error.message });
    }
  };

  const handleDeleteNotification = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
      Swal.fire({ icon: 'success', title: 'Notification Deleted', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: error.message });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'New passwords do not match!' });
      return;
    }

    setSavingAdminConfig(true);
    try {
      await setDoc(doc(db, 'settings', 'admin_config'), {
        adminPassword: passwordForm.newPassword,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      Swal.fire({ icon: 'success', title: 'Password Changed Successfully', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: error.message });
    } finally {
      setSavingAdminConfig(false);
    }
  };

  const handleUpdateUserBalance = async (userId: string, currentBalance: number) => {
    const { value: newBalance } = await Swal.fire({
      title: 'Update Balance',
      input: 'number',
      inputLabel: 'Enter new wallet balance',
      inputValue: currentBalance,
      showCancelButton: true,
      background: 'var(--card-bg)',
      color: 'var(--text-primary)',
      confirmButtonColor: 'var(--btn-bg)',
      inputValidator: (value) => {
        if (!value) return 'You need to enter a value!';
        return null;
      }
    });

    if (newBalance !== undefined) {
      try {
        await updateDoc(doc(db, 'users', userId), {
          walletBalance: Number(newBalance),
          balance: Number(newBalance),
          updatedAt: serverTimestamp()
        });
        Swal.fire({ icon: 'success', title: 'Updated!', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
      } catch (error: any) {
        Swal.fire({ icon: 'error', title: 'Failed', text: error.message });
      }
    }
  };

  const handleToggleUserBlock = async (userId: string, isBlocked: boolean) => {
    const action = isBlocked ? 'Unblock' : 'Block';
    const result = await Swal.fire({
      title: `${action} User?`,
      text: `Are you sure you want to ${action.toLowerCase()} this user?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: isBlocked ? '#10b981' : '#f43f5e',
      confirmButtonText: `Yes, ${action}!`
    });

    if (result.isConfirmed) {
      try {
        await updateDoc(doc(db, 'users', userId), {
          isBlocked: !isBlocked
        });
        Swal.fire({ icon: 'success', title: `${action}ed!`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
      } catch (error: any) {
        Swal.fire({ icon: 'error', title: 'Failed', text: error.message });
      }
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const result = await Swal.fire({
      title: 'Delete User?',
      text: 'This action is permanent and cannot be undone!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#f43f5e',
      confirmButtonText: 'Yes, Delete!'
    });

    if (result.isConfirmed) {
      try {
        await deleteDoc(doc(db, 'users', userId));
        // Also remove from bypass if exists
        await remove(ref(rtdb, `bypass_users/${userId}`));
        Swal.fire({ icon: 'success', title: 'Deleted!', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
      } catch (error: any) {
        Swal.fire({ icon: 'error', title: 'Failed', text: error.message });
      }
    }
  };

  const handleTogglePinDevice = async (deviceId: string, currentStatus: boolean) => {
    try {
      await set(ref(rtdb, `pinned_devices/${deviceId}`), !currentStatus);
      Swal.fire({
        icon: 'success',
        title: `Device ${!currentStatus ? 'Pinned' : 'Unpinned'}`,
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000,
        background: 'var(--card-bg)',
        color: 'var(--text-primary)'
      });
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: error.message });
    }
  };

  const handleDeleteTrackingRecord = async (recordId: string, deviceId?: string, ip?: string) => {
    const result = await Swal.fire({
      title: 'Delete Record?',
      text: "This will also reset the limit for this device/IP.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#f43f5e',
      confirmButtonText: 'Yes, Delete!'
    });

    if (result.isConfirmed) {
      try {
        await remove(ref(rtdb, `security_tracking/logs/${recordId}`));
        if (deviceId) await remove(ref(rtdb, `security_tracking/last_device/${deviceId}`));
        if (ip) await remove(ref(rtdb, `security_tracking/last_ip/${ip.replace(/\./g, '_')}`));
        Swal.fire({ icon: 'success', title: 'Record Deleted', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
      } catch (error: any) {
        Swal.fire({ icon: 'error', title: 'Error', text: error.message });
      }
    }
  };

  const handleRefreshSecurity = () => {
    Swal.fire({
      icon: 'success',
      title: 'Security Data Refreshed',
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 2000,
      background: 'var(--card-bg)',
      color: 'var(--text-primary)'
    });
  };

  const handleUpdateLimitHours = async () => {
    const { value: hours } = await Swal.fire({
      title: 'Signup Limit (Hours)',
      input: 'number',
      inputLabel: 'Enter hours (e.g. 24, 48, 72)',
      inputValue: signupLimitHours,
      showCancelButton: true,
      background: 'var(--card-bg)',
      color: 'var(--text-primary)',
      confirmButtonColor: 'var(--btn-bg)',
      inputValidator: (value) => {
        if (!value || parseInt(value) < 1) return 'Please enter a valid number of hours!';
        return null;
      }
    });

    if (hours) {
      try {
        await set(ref(rtdb, 'settings/signup_limit_hours'), parseInt(hours));
        Swal.fire({ icon: 'success', title: 'Limit Updated', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
      } catch (error: any) {
        Swal.fire({ icon: 'error', title: 'Error', text: error.message });
      }
    }
  };

  const handleUpdateReferralReward = async () => {
    const { value: reward } = await Swal.fire({
      title: 'Referral Reward (Coins)',
      input: 'number',
      inputLabel: 'Enter total coins (will be split 50/50 between referrer and new user)',
      inputValue: referralReward,
      showCancelButton: true,
      background: 'var(--card-bg)',
      color: 'var(--text-primary)',
      confirmButtonColor: 'var(--btn-bg)',
      inputValidator: (value) => {
        if (!value || parseInt(value) < 0) return 'Please enter a valid number of coins!';
        return null;
      }
    });

    if (reward !== undefined) {
      try {
        await set(ref(rtdb, 'settings/referralReward'), parseInt(reward));
        Swal.fire({ icon: 'success', title: 'Reward Updated', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
      } catch (error: any) {
        Swal.fire({ icon: 'error', title: 'Error', text: error.message });
      }
    }
  };

  const handleTogglePinReferral = async (id: string, currentPinned: boolean) => {
    try {
      await set(ref(rtdb, `referrals/${id}/pinned`), !currentPinned);
      Swal.fire({ icon: 'success', title: currentPinned ? 'Unpinned' : 'Pinned', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: error.message });
    }
  };

  const handleDeleteReferral = async (id: string) => {
    const result = await Swal.fire({
      title: 'Delete Record?',
      text: 'This referral record will be permanently removed.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444'
    });

    if (result.isConfirmed) {
      try {
        await remove(ref(rtdb, `referrals/${id}`));
        Swal.fire({ icon: 'success', title: 'Deleted', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
      } catch (error: any) {
        Swal.fire({ icon: 'error', title: 'Error', text: error.message });
      }
    }
  };

  const getReferralTimeLeft = (time: number) => {
    const expiry = time + 12 * 60 * 60 * 1000;
    const diff = expiry - currentTime.getTime();
    if (diff <= 0) return 'Expired';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  const testGeminiApiKey = async () => {
    if (!appConfig.geminiApiKey) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'Please enter a Gemini API Key first.' });
      return;
    }
    
    setTestingGemini(true);
    try {
      const response = await fetch('/api/test-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: appConfig.geminiApiKey })
      });
      
      let data;
      try {
        data = await response.json();
      } catch (err) {
        if (!response.ok) {
          throw new Error(`Server error (${response.status}): Failed to test Gemini API.`);
        }
        throw new Error("Failed to parse server response as JSON.");
      }
      
      if (!response.ok) {
        throw new Error(data?.error || 'Invalid API Key or API error');
      }
      
      if (data?.success) {
        Swal.fire({ icon: 'success', title: 'Success', text: 'Gemini API Key is valid and working!', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
      } else {
        throw new Error('Unexpected response format');
      }
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'API Test Failed', text: error.message });
    } finally {
      setTestingGemini(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const configRef = doc(db, 'settings', 'app_config');
      const configSnap = await getDoc(configRef);
      const oldConfig = configSnap.exists() ? configSnap.data() : null;
      
      await updateDoc(configRef, {
        ...appConfig,
        forceGlobalLanguage: true,
        showLanguageSettings: true,
        updatedAt: serverTimestamp()
      });

      // If markup changed, update all service prices
      if (!oldConfig || oldConfig.serviceMarkup !== appConfig.serviceMarkup) {
        // Fetch fresh API prices to ensure we have the real base prices
        let apiPricesMap: Record<string, number> = {};
        try {
          const queryParams = new URLSearchParams();
          if (appConfig.smmApiKey) queryParams.append('key', appConfig.smmApiKey);
          if (appConfig.smmApiUrl) queryParams.append('url', appConfig.smmApiUrl);
          const apiRes = await fetch(`/api/services?${queryParams.toString()}`);
          if (apiRes.ok) {
            const apiServices = await apiRes.json();
            if (Array.isArray(apiServices)) {
              apiServices.forEach((s: any) => {
                apiPricesMap[s.service.toString()] = parseFloat(s.rate) / 1000;
              });
            }
          }
        } catch (apiErr) {
          console.error("Failed to fetch fresh API prices for markup update:", apiErr);
        }

        const servicesSnap = await getDocs(collection(db, 'services'));
        const serviceDocs = servicesSnap.docs;
        const markup = Number(appConfig.serviceMarkup) || 0;
        
        // Update in chunks of 400
        for (let i = 0; i < serviceDocs.length; i += 400) {
          const batch = writeBatch(db);
          const chunk = serviceDocs.slice(i, i + 400);
          
          chunk.forEach((doc) => {
            const data = doc.data();
            const apiId = data.api_service_id;
            let basePrice = (apiId && apiPricesMap[apiId]) || data.basePrice || data.pricePerUnit || 0;
            const newPrice = basePrice * (1 + markup / 100);
            
            batch.update(doc.ref, { 
              basePrice: basePrice, 
              pricePerUnit: Number(newPrice.toFixed(4)),
              updatedAt: serverTimestamp() 
            });
          });
          
          await batch.commit();
        }
        
        Swal.fire({ icon: 'success', title: 'Config & Prices Updated', text: `All services updated with ${appConfig.serviceMarkup}% markup. Old markup has been removed.`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
      } else {
        Swal.fire({ icon: 'success', title: 'Config Saved', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
      }
    } catch (error: any) {
      // If document doesn't exist, create it
      try {
        const { setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, 'settings', 'app_config'), {
          ...appConfig,
          updatedAt: serverTimestamp()
        });
        Swal.fire({ icon: 'success', title: 'Config Saved', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
      } catch (err: any) {
        Swal.fire({ icon: 'error', title: 'Error', text: err.message });
      }
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { category, items } = serviceForm;
      
      if (editingService) {
        const item = items[0];
        const data = {
          category,
          category_icon: getCategoryIcon(category),
          name: item.name,
          emoji: (!item.emoji || item.emoji === '✨') ? getCategoryIcon(category) : item.emoji,
          description: item.description || '',
          pricePerUnit: parseFloat(item.pricePerUnit),
          minQty: parseInt(item.minQty),
          maxQty: parseInt(item.maxQty),
          api_service_id: item.api_service_id || '',
          enabled: true,
          updatedAt: serverTimestamp()
        };
        await updateDoc(doc(db, 'services', editingService.id), data);
        Swal.fire({ icon: 'success', title: 'Service Updated', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
      } else {
        // Create multiple services
        const batch = items.map(item => ({
          category,
          category_icon: getCategoryIcon(category),
          name: item.name,
          emoji: (!item.emoji || item.emoji === '✨') ? getCategoryIcon(category) : item.emoji,
          description: item.description || '',
          pricePerUnit: parseFloat(item.pricePerUnit),
          minQty: parseInt(item.minQty),
          maxQty: parseInt(item.maxQty),
          api_service_id: item.api_service_id || '',
          enabled: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }));

        for (const data of batch) {
          await addDoc(collection(db, 'services'), data);
        }
        Swal.fire({ icon: 'success', title: `${batch.length} Services Created`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
      }
      
      setShowServiceModal(false);
      setEditingService(null);
      setServiceForm({ 
        category: '', 
        items: [{ name: '', emoji: '', description: '', pricePerUnit: '', minQty: '', maxQty: '', api_service_id: '' }] 
      });
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: error.message });
    }
  };


  const handleSyncStatuses = async () => {
    const activeOrders = allOrders.filter(o => o.status === 'Pending' || o.status === 'Processing');
    if (activeOrders.length === 0) {
      Swal.fire({ icon: 'info', title: 'No active orders to sync.' });
      return;
    }

    Swal.fire({
      title: 'Syncing Statuses...',
      text: `Syncing ${activeOrders.length} orders with SMM API.`,
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    let updatedCount = 0;
    try {
      for (const order of activeOrders) {
        if (!order.api_order_id) continue;
        const response = await fetch(`/api/order-status/${order.api_order_id}`);
        if (response.ok) {
          const data = await response.json();
          if (data.status) {
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
              updatedCount++;
            }
          }
        }
      }
      Swal.fire({ icon: 'success', title: 'Sync Complete', text: `${updatedCount} orders updated.` });
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'Sync Failed', text: error.message });
    }
  };

  const handleSyncServices = async () => {
    const result = await Swal.fire({
      title: 'Sync Services?',
      text: 'This will fetch all services from SMM API and add missing ones to Firebase.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Sync',
      showLoaderOnConfirm: true,
      preConfirm: async () => {
        try {
          const queryParams = new URLSearchParams();
          if (appConfig.smmApiKey) queryParams.append('key', appConfig.smmApiKey);
          if (appConfig.smmApiUrl) queryParams.append('url', appConfig.smmApiUrl);
          const response = await fetch(`/api/services?${queryParams.toString()}`);
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `Server error: ${response.status}` }));
            throw new Error(errorData.error || `Server error: ${response.status}`);
          }
          const apiServices = await response.json().catch(() => ({ error: 'Invalid JSON response from server' }));
          
          if (Array.isArray(apiServices)) {
            // Sync Categories
            const apiCategories = [...new Set(apiServices.map((s: any) => s.category))];
            const categoriesRef = collection(db, 'categories');
            const categoriesSnap = await getDocs(categoriesRef);
            const existingCategories = new Set(categoriesSnap.docs.map(doc => doc.data().name));

            for (const catName of apiCategories) {
              if (!existingCategories.has(catName)) {
                await addDoc(categoriesRef, {
                  name: catName,
                  icon: getCategoryIcon(catName),
                  createdAt: serverTimestamp()
                });
              }
            }

            const existingApiIds = new Set(services.map(s => s.api_service_id));
            const newServices = apiServices.filter(s => !existingApiIds.has(s.service.toString()));
            
            if (newServices.length === 0) return 0;

            // Use batches for better performance (limit 500 per batch)
            const batchSize = 400;
            let addedCount = 0;

            for (let i = 0; i < newServices.length; i += batchSize) {
              const batch = writeBatch(db);
              const chunk = newServices.slice(i, i + batchSize);
              
              chunk.forEach(s => {
                const newDocRef = doc(collection(db, 'services'));
                const basePrice = parseFloat(s.rate) / 1000;
                const markup = Number(appConfig.serviceMarkup) || 0;
                const finalPrice = basePrice * (1 + markup / 100);
                
                batch.set(newDocRef, {
                  api_service_id: s.service.toString(),
                  name: s.name,
                  category: s.category,
                  category_icon: s.category_icon || getCategoryIcon(s.category),
                  emoji: getCategoryIcon(s.category),
                  description: s.name,
                  basePrice: basePrice,
                  pricePerUnit: Number(finalPrice.toFixed(4)),
                  minQty: parseInt(s.min),
                  maxQty: parseInt(s.max),
                  average_time: s.average_time || '',
                  enabled: true,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp()
                });
                addedCount++;
              });
              
              await batch.commit();
            }
            
            return addedCount;
          }
          throw new Error('Invalid API response: ' + JSON.stringify(apiServices));
        } catch (error: any) {
          Swal.showValidationMessage(`Sync failed: ${error.message}`);
        }
      },
      allowOutsideClick: () => !Swal.isLoading()
    });

    if (result.isConfirmed) {
      Swal.fire({ icon: 'success', title: 'Sync Complete', text: `${result.value} new services added.` });
    }
  };

  const handleDeleteService = async (id: string) => {
    const result = await Swal.fire({
      title: 'Delete Service?',
      text: 'This action cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#94a3b8'
    });

    if (result.isConfirmed) {
      await deleteDoc(doc(db, 'services', id));
      Swal.fire({ icon: 'success', title: 'Deleted!', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
    }
  };

  const [savingsSmmConfig, setSavingSmmConfig] = useState(false);
  const [serverIp, setServerIp] = useState<string | null>(null);
  const [hasSmmError, setHasSmmError] = useState(false);

  useEffect(() => {
    if (view === 'app_management') {
      fetch('/api/server-ip')
        .then(res => {
          if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
          return res.json();
        })
        .then(data => setServerIp(data.ip))
        .catch(err => console.error("Error fetching server IP:", err));
    }
  }, [view]);

  const handleCheckBalance = async () => {
    setCheckingBalance(true);
    setHasSmmError(false);
    try {
      const queryParams = new URLSearchParams();
      if (appConfig.smmApiKey) queryParams.append('key', appConfig.smmApiKey);
      if (appConfig.smmApiUrl) queryParams.append('url', appConfig.smmApiUrl);
      
      const response = await fetch(`/api/balance?${queryParams.toString()}`);
      const data = await response.json().catch(() => ({ error: 'Invalid response from server' }));
      
      if (data.balance) {
        setSmmBalance(data.balance + ' ' + (data.currency || 'USD'));
      } else if (data.error) {
        if (data.error.includes('403')) {
          setHasSmmError(true);
        }
        Swal.fire({ 
          icon: 'error', 
          title: 'API Error', 
          text: data.error,
          footer: 'Check your API Key and disable IP Restriction in SMM Panel settings.'
        });
      } else {
        Swal.fire({ icon: 'error', title: 'Error', text: 'Could not fetch balance. Check your API settings.' });
      }
    } catch (error: any) {
      setHasSmmError(true);
      Swal.fire({ icon: 'error', title: 'Error', text: error.message });
    } finally {
      setCheckingBalance(false);
    }
  };

  const handleSaveGiveaway = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const selectedService = services.find(s => s.id === giveawayForm.serviceId);
      if (!selectedService) throw new Error('Selected service not found');

      const data = {
        ...giveawayForm,
        api_service_id: selectedService.api_service_id,
        categoryIcon: selectedService.category_icon || getCategoryIcon(giveawayForm.category),
        serviceName: selectedService.name,
        quantity: parseInt(giveawayForm.quantity),
        maxUsers: parseInt(giveawayForm.maxUsers),
        updatedAt: serverTimestamp()
      };

      if (editingGiveaway) {
        await updateDoc(doc(db, 'giveaways', editingGiveaway.id), data);
        Swal.fire({ icon: 'success', title: 'Giveaway Updated', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
      } else {
        await addDoc(collection(db, 'giveaways'), {
          ...data,
          createdAt: serverTimestamp()
        });
        Swal.fire({ icon: 'success', title: 'Giveaway Created', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
      }

      setShowGiveawayModal(false);
      setEditingGiveaway(null);
      setGiveawayForm({
        category: '',
        serviceId: '',
        quantity: '',
        maxUsers: '',
        refresh24h: true,
        enabled: true
      });
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: error.message });
    }
  };

  const handleDeleteGiveaway = async (id: string) => {
    const result = await Swal.fire({
      title: 'Delete Giveaway?',
      text: 'This will also remove all participants for this giveaway.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#94a3b8'
    });

    if (result.isConfirmed) {
      try {
        await deleteDoc(doc(db, 'giveaways', id));
        
        // Delete participants
        const participantsSnap = await getDocs(query(collection(db, 'giveaway_participants'), where('giveawayId', '==', id)));
        const batch = writeBatch(db);
        participantsSnap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        Swal.fire({ icon: 'success', title: 'Deleted!', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
      } catch (error: any) {
        Swal.fire({ icon: 'error', title: 'Error', text: error.message });
      }
    }
  };

  const handleToggleGiveawayStatus = async (id: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'giveaways', id), { enabled: !currentStatus });
      Swal.fire({ icon: 'success', title: `Giveaway ${!currentStatus ? 'Enabled' : 'Disabled'}`, toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: error.message });
    }
  };

  const handleDeleteAllServices = async () => {
    const result = await Swal.fire({
      title: 'Delete All Services & Categories?',
      text: 'This action is permanent and will remove everything from Service Management!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'Yes, Delete All'
    });

    if (result.isConfirmed) {
      try {
        Swal.fire({
          title: 'Deleting...',
          text: 'Please wait while we clear all services.',
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          }
        });

        // Delete all services in chunks of 400
        const servicesSnap = await getDocs(collection(db, 'services'));
        const serviceDocs = servicesSnap.docs;
        for (let i = 0; i < serviceDocs.length; i += 400) {
          const batch = writeBatch(db);
          const chunk = serviceDocs.slice(i, i + 400);
          chunk.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
        }

        // Delete all categories in chunks of 400
        const categoriesSnap = await getDocs(collection(db, 'categories'));
        const categoryDocs = categoriesSnap.docs;
        for (let i = 0; i < categoryDocs.length; i += 400) {
          const batch = writeBatch(db);
          const chunk = categoryDocs.slice(i, i + 400);
          chunk.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
        }

        Swal.fire({ icon: 'success', title: 'All Services & Categories Deleted', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
      } catch (error: any) {
        Swal.fire({ icon: 'error', title: 'Error', text: error.message });
      }
    }
  };

  const handleIncreaseCharges = async () => {
    // Redundant - functionality moved to App Management markup
  };

  const openEditModal = (service: any) => {
    setEditingService(service);
    setServiceForm({
      category: service.category,
      items: [{
        name: service.name,
        emoji: service.emoji || '',
        description: service.description || '',
        pricePerUnit: service.pricePerUnit.toString(),
        minQty: service.minQty.toString(),
        maxQty: service.maxQty.toString()
      }]
    });
    setShowServiceModal(true);
  };

  const handleToggleServicePin = async (service: any) => {
    try {
      await updateDoc(doc(db, 'services', service.id), { pinned: !service.pinned });
      Swal.fire({ icon: 'success', title: service.pinned ? 'Service Unpinned' : 'Service Pinned', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: error.message });
    }
  };

  const handleToggleCategoryPin = async (categoryName: string) => {
    try {
      const cat = categories.find(c => c.name === categoryName);
      if (cat) {
        await updateDoc(doc(db, 'categories', cat.id), { pinned: !cat.pinned });
        Swal.fire({ icon: 'success', title: cat.pinned ? 'Category Unpinned' : 'Category Pinned', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
      }
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: error.message });
    }
  };

  const submitAdminAi = async (text: string, isRegenerate: boolean = false) => {
    if ((!text.trim() && uploadedFiles.length === 0) || isAiThinking) return;
    
    const userMessage = { 
      role: 'user' as const, 
      text, 
      attachments: uploadedFiles.map(f => ({ name: f.name, type: f.type, data: f.data }))
    };
    
    if (!isRegenerate) {
      setAdminAiChat(prev => [...prev, userMessage]);
    }
    
    setAiInput('');
    setUploadedFiles([]);
    setIsAiThinking(true);
    
    // Setup abort controller
    abortControllerRef.current = new AbortController();
    
    setTimeout(() => {
      aiChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    
    try {
      const apiKey = appConfig?.geminiApiKey || '';
      const msgs = isRegenerate ? adminAiChat : [...adminAiChat, userMessage];

      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          apiKey,
          config: { appName: appConfig?.appName || 'InstaBoost' },
          aiConfig, // Pass AI Config
          messages: msgs.map((m) => ({ 
            role: m.role, 
            text: m.text,
            attachments: m.attachments 
          })),
          systemInstruction: "You are the Supreme AI Assistant for InstaBoost with Full Admin Access. You are responsible for automating management, detecting fraud, and optimizing the business. You now have access to ALL data: 1. Order Links & API IDs. 2. Payment Transaction Logs (UTR/Trans IDs). 3. User IP & Device Fingerprinting. 4. Detailed Security/Audit Logs. 5. Service Markup & Health. RULES: Answer in Hinglish. Be proactive. If you see multiple accounts on one device/IP, flag it as FRAUD. Calculate profit margins using markup. Do NOT use markdown stars. Be direct, authoritative, yet helpful.",
          isAdmin: true,
          adminStats: {
            totalUsers: stats.totalUsers,
            activeOrdersCount: allOrders.filter(o => o.status === 'Processing' || o.status === 'Pending').length,
            completedOrdersCount: allOrders.filter(o => o.status === 'Completed').length,
            totalRevenue: stats.totalRevenue,
            connectedUsers: users.length,
            smmPanelBalance: smmBalance,
            totalServices: services.length,
            totalCategories: categories.length,
            categoriesList: categories.map(c => ({ id: c.id, name: c.name })),
            activeGiveaways: giveaways.map(g => ({ 
              id: g.id, 
              title: g.title || g.serviceName, 
              serviceName: g.serviceName,
              category: g.category,
              quantity: g.quantity,
              enabled: g.enabled, 
              winners: g.winners?.length || 0 
            })),
            servicesSample: (() => {
              const grouped: { [key: string]: any[] } = {};
              services.forEach(s => {
                const cat = s.category || 'Other';
                if (!grouped[cat]) grouped[cat] = [];
                grouped[cat].push(s);
              });
              
              const sampled: any[] = [];
              Object.keys(grouped).forEach(cat => {
                const catSvcs = grouped[cat];
                catSvcs.sort((a, b) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0));
                sampled.push(...catSvcs.slice(0, 3));
              });
              
              return sampled.slice(0, 120).map(s => ({ 
                id: s.id, 
                name: s.name, 
                category: s.category,
                price: s.pricePerUnit || s.price || 0, 
                api_service_id: s.api_service_id,
                enabled: s.enabled,
                min: s.minQty || 1,
                max: s.maxQty || 10000
              }));
            })(),
            bannedUsersCount: users.filter((u: any) => u.isBlocked).length,
            spinnerRewards: spinnerConfig?.prizes?.map((p: any) => p.text) || [],
            userList: users.slice(0, 50).map(u => ({ 
              email: u.email, 
              balance: u.balance, 
              status: u.isBlocked ? 'Blocked' : 'Active',
              uid: u.id,
              phone: u.phone,
              name: u.name,
              createdAt: u.createdAt?.toDate?.()?.toLocaleString() || u.createdAt
            })), 
            topBalanceUsers: users.sort((a, b) => (b.balance || 0) - (a.balance || 0)).slice(0, 10).map(u => ({ email: u.email, balance: u.balance })),
            pendingPayments: fundRequests.filter(f => f.status === 'Pending').map(f => ({ 
              id: f.id,
              email: f.userEmail, 
              amount: f.amount,
              method: f.method,
              utr: f.utr || f.transactionId,
              date: f.createdAt?.toDate?.()?.toLocaleString() || f.createdAt
            })),
            transactionHistory: fundRequests.slice(0, 50).map(f => ({
              id: f.id,
              email: f.userEmail,
              amount: f.amount,
              status: f.status,
              method: f.method,
              utr: f.utr || f.transactionId || 'N/A',
              date: f.createdAt?.toDate?.()?.toLocaleString() || f.createdAt
            })),
            totalPendingAmount: fundRequests.filter(f => f.status === 'Pending').reduce((acc, f) => acc + Number(f.amount), 0),
            recentOrders: allOrders.slice(0, 50).map(o => ({ 
              id: o.id,
              email: o.userEmail, 
              service: o.serviceName, 
              status: o.status, 
              charge: o.totalCost || o.charge || 0,
              link: o.link || 'N/A',
              qty: o.quantity,
              date: o.createdAt?.toDate?.()?.toLocaleString() || o.createdAt,
              api_id: o.api_order_id,
              userId: o.userId
            })),
            securityLogs: securityTracking.slice(0, 50).map(s => ({ 
              id: s.id,
              deviceId: s.deviceId || 'N/A',
              ip: s.ip || 'N/A',
              accountsCount: s.count || 1,
              associatedAccounts: (s.accounts || []).map((acc: any) => typeof acc === 'object' ? acc.email : acc),
              date: s.createdAt ? new Date(s.createdAt).toLocaleString() : (s.timestamp ? new Date(s.timestamp).toLocaleString() : 'N/A'),
              lastLoginEmail: s.createdAccount?.email || s.accounts?.[s.accounts?.length - 1]?.email || 'N/A'
            })),
            referralStats: {
              totalReferrals: referralLogs.length,
              totalRewardsDistributed: referralLogs.reduce((acc, log) => acc + (log.reward || 0), 0),
              recentReferrals: referralLogs.slice(0, 10).map(l => ({ referrer: l.referrer?.email, joined: l.newUser?.email, reward: l.reward }))
            },
            appHealth: {
              appName: appConfig.appName,
              maintenanceMode: appConfig.isMaintenanceMode,
              isGatewayActive: !!appConfig.upiId,
              upiId: appConfig.upiId,
              qrUrl: appConfig.qrUrl,
              minPayment: appConfig.minPayment,
              maxPayment: appConfig.maxPayment,
              markup: appConfig.serviceMarkup,
              rgbEnabled: appConfig.appNameStyling?.rgbEnabled,
              fontStyle: appConfig.appNameStyling?.fontStyle,
              animation: appConfig.appNameStyling?.animation,
              showLanguageSettings: appConfig.showLanguageSettings,
              smmApiUrl: adminConfig.smmApiUrl,
              smmApiKey: adminConfig.smmApiKey
            }
          }
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        let errMsg = errData.error || errData.message || 'API Error';
        
        if (errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('429')) {
          errMsg = "Sir, Gemini AI ki limit khatam ho gayi hai (Quota Exceeded). Google Free API par limit hoti hai. Please 1-2 minute wait karein ya koi aur API Key use karein.";
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

      setAdminAiChat(prev => {
        const next = [...prev, { role: 'model', text: cleanReply }];
        const modelIdx = next.length - 1;
        if (isVoiceEnabled) {
           speak(cleanReply, modelIdx);
        }
        return next;
      });

      // Check for actions in the AI response
      const actionMatches = data.text.match(/\[ADMIN_ACTION:[^\]]+\]/g);
      if (actionMatches) {
        for (const actionStr of actionMatches) {
          const parts = actionStr.replace('[ADMIN_ACTION:', '').replace(']', '').split(':').map(p => p.trim());
          const [action, arg1, arg2, arg3, arg4, arg5] = parts;

          try {
            const level = Number(aiConfig.authorityLevel || 3);
            // Define command permissions
            const mediumCommands = ['MAINTENANCE', 'UPDATE_RGB', 'UPDATE_STYLE', 'UPDATE_ANIM', 'TOGGLE_LANG', 'GLOBAL_NOTIF', 'CHECK_API_BALANCE', 'SYNC_SERVICES', 'SYNC_ORDERS', 'SYNC_PAYMENTS'];
            const highOnlyCommands = ['APP_NAME', 'MARKUP', 'UPDATE_UPI', 'UPDATE_QR', 'UPDATE_LIMITS', 'UPDATE_API_CONFIG', 'BLOCK', 'UNBLOCK', 'SEND_NOTIF', 'ADD_BALANCE', 'SUB_BALANCE', 'UPDATE_BALANCE', 'APPROVE_PAYMENT', 'REJECT_PAYMENT', 'DELETE_ALL_SERVICES', 'TOGGLE_SERVICE', 'SET_REF_REWARD', 'CREATE_GIVEAWAY', 'EDIT_GIVEAWAY', 'DELETE_GIVEAWAY', 'TOGGLE_GIVEAWAY', 'UPDATE_SPINNER', 'UPDATE_PRIZE', 'CHANGE_ADMIN_PWD', 'CREATE_ADVANCED_NOTIF'];

            if (level === 1) {
              Swal.fire({
                icon: 'warning',
                title: 'Permission Denied',
                text: 'Boss, AI Level "Low" par rakha hai. Mai sirf dekh sakta hoon, action nahi le sakta. Level change karein high access ke liye.',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 4000
              });
              continue;
            }

            if (level === 2 && highOnlyCommands.includes(action)) {
              Swal.fire({
                icon: 'warning',
                title: 'Restricted Action',
                text: `Boss, "${action}" command Medium level par allowed nahi hai. Full control ke liye High level set karein.`,
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 4000
              });
              continue;
            }

            switch (action) {
              case 'MAINTENANCE':
                const mode = arg1 === 'ON';
                await updateDoc(doc(db, 'settings', 'app_config'), { isMaintenanceMode: mode, updatedAt: serverTimestamp() });
                setAppConfig((prev: any) => ({ ...prev, isMaintenanceMode: mode }));
                break;
              case 'APP_NAME':
                await updateDoc(doc(db, 'settings', 'app_config'), { appName: arg1, updatedAt: serverTimestamp() });
                setAppConfig((prev: any) => ({ ...prev, appName: arg1 }));
                Swal.fire({ icon: 'success', title: 'App Name Updated', text: `New name: ${arg1}`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                break;
              case 'MARKUP':
                const mVal = Number(arg1.replace(/[^\d.]/g, ''));
                await updateDoc(doc(db, 'settings', 'app_config'), { serviceMarkup: mVal, updatedAt: serverTimestamp() });
                setAppConfig((prev: any) => ({ ...prev, serviceMarkup: mVal }));
                Swal.fire({ icon: 'success', title: 'Markup Updated', text: `Prices will sync automatically.`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                break;
              case 'UPDATE_QR':
                await updateDoc(doc(db, 'settings', 'app_config'), { qrUrl: arg1, updatedAt: serverTimestamp() });
                setAppConfig((prev: any) => ({ ...prev, qrUrl: arg1 }));
                Swal.fire({ icon: 'success', title: 'QR Updated', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                break;
              case 'UPDATE_LIMITS':
                const minP = Number(arg1.replace(/[^\d.]/g, ''));
                const maxP = Number(arg2.replace(/[^\d.]/g, ''));
                await updateDoc(doc(db, 'settings', 'app_config'), { minPayment: minP, maxPayment: maxP, updatedAt: serverTimestamp() });
                setAppConfig((prev: any) => ({ ...prev, minPayment: minP, maxPayment: maxP }));
                Swal.fire({ icon: 'success', title: 'Limits Updated', text: `Min: ${minP}, Max: ${maxP}`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                break;
              case 'UPDATE_RGB':
                const rgbMode = arg1 === 'ON';
                await updateDoc(doc(db, 'settings', 'app_config'), { "appNameStyling.rgbEnabled": rgbMode, updatedAt: serverTimestamp() });
                setAppConfig((prev: any) => ({ ...prev, appNameStyling: { ...prev.appNameStyling, rgbEnabled: rgbMode } }));
                break;
              case 'UPDATE_STYLE':
                const globalStyle = arg2 === 'ON';
                await updateDoc(doc(db, 'settings', 'app_config'), { 
                  "appNameStyling.fontStyle": arg1,
                  "appNameStyling.applyGlobalFont": globalStyle,
                  updatedAt: serverTimestamp() 
                });
                setAppConfig((prev: any) => ({ ...prev, appNameStyling: { ...prev.appNameStyling, fontStyle: arg1, applyGlobalFont: globalStyle } }));
                break;
              case 'UPDATE_ANIM':
                await updateDoc(doc(db, 'settings', 'app_config'), { "appNameStyling.animation": arg1, updatedAt: serverTimestamp() });
                setAppConfig((prev: any) => ({ ...prev, appNameStyling: { ...prev.appNameStyling, animation: arg1 } }));
                break;
              case 'TOGGLE_LANG':
                const langMode = arg1 === 'ON';
                await updateDoc(doc(db, 'settings', 'app_config'), { showLanguageSettings: langMode, updatedAt: serverTimestamp() });
                setAppConfig((prev: any) => ({ ...prev, showLanguageSettings: langMode }));
                break;
              case 'BLOCK':
              case 'UNBLOCK':
                const targetUser: any = users.find((u: any) => u.email === arg1 || u.id === arg1);
                if (targetUser) {
                  await updateDoc(doc(db, 'users', targetUser.id), { isBlocked: action === 'BLOCK' });
                  Swal.fire({ icon: 'success', title: 'User Updated', text: `${arg1} has been ${action === 'BLOCK' ? 'blocked' : 'unblocked'}.`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                }
                break;
              case 'UPDATE_BALANCE':
                const uToSet: any = users.find((u: any) => u.email === arg1 || u.id === arg1);
                if (uToSet) {
                  const nB = Number(arg2.replace(/[^\d.]/g, ''));
                  await updateDoc(doc(db, 'users', uToSet.id), { walletBalance: nB, balance: nB, updatedAt: serverTimestamp() });
                  Swal.fire({ icon: 'success', title: 'Balance Set', text: `Balance for ${arg1} is now ₹${nB}.`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                }
                break;
              case 'ADD_BALANCE':
              case 'SUB_BALANCE':
                const userToUpdate: any = users.find((u: any) => u.email === arg1 || u.id === arg1);
                if (userToUpdate) {
                  const currentBal = Number(userToUpdate.walletBalance || userToUpdate.balance || 0);
                  const change = Number(arg2.replace(/[^\d.]/g, ''));
                  const newBal = action === 'ADD_BALANCE' ? currentBal + change : currentBal - change;
                  await updateDoc(doc(db, 'users', userToUpdate.id), { 
                    walletBalance: newBal, 
                    balance: newBal, 
                    updatedAt: serverTimestamp() 
                  });
                  Swal.fire({ icon: 'success', title: 'Balance Updated', text: `New balance for ${arg1} is ₹${newBal}.`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                }
                break;
              case 'APPROVE_PAYMENT':
                await handleUpdatePaymentStatus(arg1, 'Approved');
                break;
              case 'REJECT_PAYMENT':
                await handleUpdatePaymentStatus(arg1, 'Rejected');
                break;
              case 'SYNC_SERVICES':
                await handleSyncServices();
                break;
              case 'DELETE_ALL_SERVICES':
                await handleDeleteAllServices();
                break;
              case 'CHECK_API_BALANCE':
                await handleCheckBalance();
                break;
              case 'SET_REF_REWARD':
                const refAmount = parseInt(arg1);
                await set(ref(rtdb, 'settings/referralReward'), refAmount);
                setReferralReward(refAmount);
                Swal.fire({ icon: 'success', title: 'Referral Reward Updated', text: `Reward set to ${refAmount} coins.`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                break;
              case 'UPDATE_SPINNER':
                // days:maxSpins:cost
                const sDays = parseInt(arg1);
                const sMax = parseInt(arg2);
                const sCost = parseInt(arg3);
                await updateDoc(doc(db, 'settings', 'spinner_config'), {
                  eligibilityDays: sDays,
                  maxSpinsPerDay: sMax,
                  paidSpinCost: sCost,
                  updatedAt: serverTimestamp()
                });
                setSpinnerConfig((prev: any) => ({ ...prev, eligibilityDays: sDays, maxSpinsPerDay: sMax, paidSpinCost: sCost }));
                Swal.fire({ icon: 'success', title: 'Spinner Updated', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                break;
              case 'UPDATE_PRIZE':
                // index:amt:prob
                const pIdx = parseInt(arg1);
                if (pIdx >= 0 && pIdx < 10) {
                  const newOps = [...spinnerConfig.options];
                  newOps[pIdx] = {
                    amount: parseInt(arg2) || 0,
                    probability: parseInt(arg3) || 10
                  };
                  await updateDoc(doc(db, 'settings', 'spinner_config'), {
                    options: newOps,
                    updatedAt: serverTimestamp()
                  });
                  setSpinnerConfig((prev: any) => ({ ...prev, options: newOps }));
                  Swal.fire({ icon: 'success', title: 'Prize Updated', text: `Prize ${pIdx} set to ₹${arg2}.`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                }
                break;
              case 'SYNC_PAYMENTS':
                Swal.fire({ icon: 'info', title: 'Payments Synced', text: 'Real-time payment list is up to date.', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
                break;
              case 'CHANGE_ADMIN_PWD':
                const oldPwd = arg1;
                const newPwd = arg2;
                const confirmPwd = arg3;

                if (newPwd !== confirmPwd) {
                  Swal.fire({ icon: 'error', title: 'Mismatch', text: 'New and Confirm passwords match nahi kar rahe.', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                  break;
                }

                if (oldPwd === adminConfig.adminPassword) {
                  await setDoc(doc(db, 'settings', 'admin_config'), {
                    adminPassword: newPwd,
                    updatedAt: serverTimestamp()
                  }, { merge: true });
                  setAdminConfig((prev: any) => ({ ...prev, adminPassword: newPwd }));
                  Swal.fire({ icon: 'success', title: 'Password Changed', text: 'Boss, password badal diya gaya hai. Purana: '+oldPwd+', Naya: '+newPwd, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                } else {
                  Swal.fire({ icon: 'error', title: 'Wrong Old Password', text: 'Old password galat hai Boss.', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                }
                break;
              case 'SEND_NOTIF':
                const uNotif: any = users.find((u: any) => u.email === arg1);
                if (uNotif) {
                  await addDoc(collection(db, 'notifications'), {
                    userId: uNotif.id,
                    title: 'Message from Admin AI',
                    message: arg2,
                    type: 'admin',
                    createdAt: serverTimestamp(),
                    read: false
                  });
                  Swal.fire({ icon: 'success', title: 'Notification Sent', text: `Sent to ${arg1}`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                }
                break;
              case 'GLOBAL_NOTIF':
                await addDoc(collection(db, 'notifications'), {
                  userId: 'all',
                  title: arg1,
                  message: arg2,
                  type: 'announcement',
                  createdAt: serverTimestamp(),
                  read: false
                });
                Swal.fire({ icon: 'success', title: 'Global Notif Sent', text: arg1, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                break;
              case 'DELETE_USER':
                const userToDel: any = users.find((u: any) => u.email === arg1);
                if (userToDel) {
                  await deleteDoc(doc(db, 'users', userToDel.id));
                  Swal.fire({ icon: 'success', title: 'User Deleted', text: `${arg1} removed permanently.`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                }
                break;
              case 'UPDATE_UPI':
                await updateDoc(doc(db, 'settings', 'app_config'), { upiId: arg1, updatedAt: serverTimestamp() });
                setAppConfig((prev: any) => ({ ...prev, upiId: arg1 }));
                Swal.fire({ icon: 'success', title: 'UPI Updated', text: `New UPI: ${arg1}`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                break;
              case 'UPDATE_MIN_PAYMENT':
                const minVal = Number(arg1);
                await updateDoc(doc(db, 'settings', 'app_config'), { minPayment: minVal, updatedAt: serverTimestamp() });
                setAppConfig((prev: any) => ({ ...prev, minPayment: minVal }));
                break;
              case 'UPDATE_MAX_PAYMENT':
                const maxVal = Number(arg1);
                await updateDoc(doc(db, 'settings', 'app_config'), { maxPayment: maxVal, updatedAt: serverTimestamp() });
                setAppConfig((prev: any) => ({ ...prev, maxPayment: maxVal }));
                break;
              case 'CLEAR_LOGS':
                const batch = writeBatch(db);
                securityTracking.slice(0, 50).forEach(log => {
                  batch.delete(doc(db, 'security_logs', log.id));
                });
                await batch.commit();
                Swal.fire({ icon: 'success', title: 'Logs Cleared', text: 'Recent security logs removed.', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                break;
              case 'TOGGLE_SERVICE':
                const serv = services.find((s: any) => s.id === arg1 || s.name.includes(arg1));
                if (serv) {
                  await updateDoc(doc(db, 'services', serv.id), { enabled: !serv.enabled });
                  Swal.fire({ icon: 'success', title: 'Service Updated', text: `${serv.name} is now ${!serv.enabled ? 'Enabled' : 'Disabled'}`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                }
                break;
              case 'TOGGLE_GIVEAWAY':
                const give = giveaways.find((g: any) => g.id === arg1 || g.title?.includes(arg1) || g.serviceName?.includes(arg1));
                if (give) {
                  await updateDoc(doc(db, 'giveaways', give.id), { enabled: !give.enabled });
                  Swal.fire({ icon: 'success', title: 'Giveaway Updated', text: `${give.title || give.serviceName} is now ${!give.enabled ? 'Enabled' : 'Disabled'}`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                }
                break;
              case 'CREATE_GIVEAWAY': {
                // arg1: category, arg2: serviceId/Name, arg3: quantity, arg4: maxUsers
                const cleanArg1 = arg1?.trim().replace(/['"]+/g, '');
                const cleanArg2 = arg2?.trim().replace(/['"]+/g, '');
                const normArg1 = normalizeText(cleanArg1);
                const normArg2 = normalizeText(cleanArg2);
                
                // If services list is completely empty
                if (services.length === 0) {
                  Swal.fire({
                    icon: 'warning',
                    title: 'Services List Empty',
                    text: 'Wait boss, database me abhi koi services loaded nahi hain jiske chalte giveaway banaya ja sake.',
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 5000
                  });
                  break;
                }

                // 1. Direct search in services list (using unicode-safe normalizeText)
                let sForGive = services.find(s => {
                  const sIdNorm = normalizeText(s.id);
                  const sApiIdNorm = normalizeText(s.api_service_id);
                  const sNameNorm = normalizeText(s.name);
                  
                  return (
                    sIdNorm === normArg2 || 
                    sApiIdNorm === normArg2 || 
                    sNameNorm.includes(normArg2) ||
                    normArg2.includes(sNameNorm)
                  );
                });

                // 2. Fallback: Check if cleanArg2 is an Order ID in allOrders, then find matching service
                if (!sForGive && normArg2) {
                  const matchingOrder = allOrders.find(o => normalizeText(o.id) === normArg2);
                  if (matchingOrder) {
                    const orderSvcNameNorm = normalizeText(matchingOrder.serviceName);
                    sForGive = services.find(s => {
                      const sNameNorm = normalizeText(s.name);
                      const sIdNorm = normalizeText(s.id);
                      return (
                        sNameNorm.includes(orderSvcNameNorm) || 
                        orderSvcNameNorm.includes(sNameNorm) ||
                        sIdNorm === normalizeText(matchingOrder.serviceId)
                      );
                    });
                  }
                }

                // 3. Fallback: If still not found, search by Category name
                if (!sForGive && normArg1) {
                  sForGive = services.find(s => {
                    const sCatNorm = normalizeText(s.category);
                    return sCatNorm === normArg1 || sCatNorm.includes(normArg1) || normArg1.includes(sCatNorm);
                  });
                }

                // 4. Fallback: If still not found, find by matching Name
                if (!sForGive && normArg2) {
                  sForGive = services.find(s => {
                    const sNameNorm = normalizeText(s.name);
                    return sNameNorm.includes(normArg2) || normArg2.includes(sNameNorm);
                  });
                }

                if (sForGive) {
                  const gData = {
                    category: cleanArg1 || sForGive.category,
                    serviceId: sForGive.id,
                    api_service_id: sForGive.api_service_id || '',
                    categoryIcon: sForGive.category_icon || getCategoryIcon(cleanArg1 || sForGive.category),
                    serviceName: sForGive.name,
                    quantity: parseInt(arg3) || 100,
                    maxUsers: parseInt(arg4) || 50,
                    refresh24h: true,
                    enabled: true,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                  };
                  await addDoc(collection(db, 'giveaways'), gData);
                  Swal.fire({ 
                    icon: 'success', 
                    title: 'Giveaway Created', 
                    text: `Boss, ${sForGive.name} ka giveaway bana diya gaya hai.`, 
                    toast: true, 
                    position: 'top-end', 
                    showConfirmButton: false, 
                    timer: 3000 
                  });
                } else {
                  // If services list is completely empty
                  if (services.length === 0) {
                    Swal.fire({ 
                      icon: 'warning', 
                      title: 'Services List Empty', 
                      text: `Boss, active services list empty hai. Pehle SMM API se services ko Sync karne ko kahein ya AI se 'Sync Services' command se sync karayein.`, 
                      toast: false,
                      showConfirmButton: true
                    });
                  } else {
                    Swal.fire({ 
                      icon: 'error', 
                      title: 'Service Not Found', 
                      text: `Boss, "${cleanArg2 || 'N/A'}" ya "${cleanArg1 || 'N/A'}" category ke liye koi matching active SMM service nahi mili.`, 
                      toast: false,
                      showConfirmButton: true
                    });
                  }
                }
                break;
              }
              case 'EDIT_GIVEAWAY':
                // arg1: id_or_title, arg2: quantity, arg3: maxUsers
                const gToEdit = giveaways.find((g: any) => g.id === arg1 || g.title?.includes(arg1) || g.serviceName?.includes(arg1));
                if (gToEdit) {
                  await updateDoc(doc(db, 'giveaways', gToEdit.id), {
                    quantity: parseInt(arg2) || gToEdit.quantity,
                    maxUsers: parseInt(arg3) || gToEdit.maxUsers,
                    updatedAt: serverTimestamp()
                  });
                  Swal.fire({ icon: 'success', title: 'Giveaway Updated', text: `${gToEdit.title || gToEdit.serviceName} settings updated.`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                }
                break;
              case 'DELETE_GIVEAWAY':
                const gToDel = giveaways.find((g: any) => g.id === arg1 || g.title?.includes(arg1) || g.serviceName?.includes(arg1));
                if (gToDel) {
                  await deleteDoc(doc(db, 'giveaways', gToDel.id));
                  const pSnap = await getDocs(query(collection(db, 'giveaway_participants'), where('giveawayId', '==', gToDel.id)));
                  const b = writeBatch(db);
                  pSnap.docs.forEach(d => b.delete(d.ref));
                  await b.commit();
                  Swal.fire({ icon: 'success', title: 'Giveaway Deleted', text: `${gToDel.title || gToDel.serviceName} removed.`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                }
                break;
              case 'UPDATE_API_CONFIG':
                // arg1: url, arg2: key
                await setDoc(doc(db, 'settings', 'admin_config'), {
                  smmApiUrl: arg1,
                  smmApiKey: arg2,
                  updatedAt: serverTimestamp()
                }, { merge: true });
                setAdminConfig((prev: any) => ({ ...prev, smmApiUrl: arg1, smmApiKey: arg2 }));
                Swal.fire({ icon: 'success', title: 'SMM API Config Updated', text: 'API URL and Key have been updated.', toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                break;
              case 'SYNC_ORDERS':
                await handleSyncStatuses();
                break;
              case 'CREATE_ADVANCED_NOTIF':
                // arg1: email/target, arg2: title, arg3: message, arg4: image, arg5: link
                const isGlobal = arg1.toLowerCase() === 'all' || arg1.toLowerCase() === 'global';
                const targetU = !isGlobal ? users.find((u: any) => u.email === arg1 || u.id === arg1) : null;
                
                if (isGlobal || targetU) {
                  await addDoc(collection(db, 'notifications'), {
                    userId: isGlobal ? 'all' : targetU?.id,
                    title: arg2,
                    message: arg3,
                    bannerImage: arg4 || '',
                    actionLink: arg5 || '',
                    type: isGlobal ? 'announcement' : 'admin',
                    createdAt: serverTimestamp(),
                    read: false
                  });
                  Swal.fire({ icon: 'success', title: 'Advanced Notification Sent', text: isGlobal ? 'Sent to all users' : `Sent to ${arg1}`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                }
                break;
            }
          } catch (err) {
            console.error("AI Action Error:", err);
          }
        }
      }

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('AI Request Aborted');
        return;
      }
      console.error(error);
      setAdminAiChat(prev => [...prev, { role: 'model', text: "Error connecting to AI: " + error.message }]);
    } finally {
      setIsAiThinking(false);
      abortControllerRef.current = null;
      setTimeout(() => aiChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const startAdminAi = () => {
    submitAdminAi("Hello AI! Boss is here. Analyze the entire app right now. Report on: 1. Total & Connected Users. 2. Any suspicious user activity in security logs. 3. Financial health (Total Revenue & Pending Payments). 4. Active Orders & their status. 5. Are there any errors or issues I should fix? Speak in Hinglish.");
  };

  const clearAdminAiChat = () => {
    Swal.fire({
      title: 'Clear Chat?',
      text: "Sari AI chat history dilit ho jayegi. Kya aap sure hain?",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, Delete!',
      cancelButtonText: 'Keep it'
    }).then((result) => {
      if (result.isConfirmed) {
        setAdminAiChat([]);
        localStorage.removeItem('adminAiChat');
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        setIsSpeaking(false);
        setPlayingMessageIndex(null);
        setActiveWordIndex(null);
        Swal.fire({
          title: 'Deleted!',
          text: 'AI chat history clear kar di gayi hai.',
          icon: 'success',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
      }
    });
  };

  const handleSaveAiConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingAiConfig(true);
    try {
      await setDoc(doc(db, 'settings', 'ai_config'), {
        ...aiConfig,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setShowAiSettings(false);
      Swal.fire({
        icon: 'success',
        title: 'AI Settings Updated',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } catch (err) {
      console.error(err);
      Swal.fire({ icon: 'error', title: 'Error Saving AI Config' });
    } finally {
      setSavingAiConfig(false);
    }
  };

  const handleSaveCustomInstructions = async () => {
    if (!instructionTarget) return;
    setSavingAiConfig(true);
    try {
      const field = instructionTarget === 'admin' ? 'adminCustomInstructions' : 'userCustomInstructions';
      await setDoc(doc(db, 'settings', 'ai_config'), {
        [field]: customInstructionText,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setAiConfig(prev => ({ ...prev, [field]: customInstructionText }));
      setInstructionTarget(null);
      Swal.fire({
        icon: 'success',
        title: 'Instructions Updated',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } catch (err) {
      console.error(err);
      Swal.fire({ icon: 'error', title: 'Error Saving Instructions' });
    } finally {
      setSavingAiConfig(false);
    }
  };

  const renderAiAssistant = () => {
    return (
      <div className="fixed inset-0 top-[73px] z-50 bg-slate-50 flex flex-col overflow-hidden">
        <div className="absolute top-4 left-4 z-40 flex items-center gap-2">
          <button
            onClick={() => setShowAiSettings(true)}
            className="p-2.5 bg-white hover:bg-slate-50 text-slate-500 rounded-xl transition-all shadow-md active:scale-95 border border-slate-100"
            title="AI Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {adminAiChat.length > 0 && !isAiThinking && (
          <button
            onClick={clearAdminAiChat}
            className="absolute top-4 right-4 z-40 p-2 bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded-lg transition-colors shadow-sm active:scale-95"
            title="Clear Chat History"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
        {adminAiChat.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white border-t border-slate-200 mb-20">
            <Bot className="w-20 h-20 text-purple-600 mb-6 drop-shadow-xl" />
            <h2 className="text-3xl font-black text-slate-800 mb-4">Welcome to Boss AI Assistant</h2>
            <p className="text-slate-500 mb-8 max-w-md text-sm leading-relaxed font-medium">
              I have full real-time access to your admin panel. I can monitor users, manage funds, track orders, and help you scale your business. Ask me anything or tell me to perform an action.
            </p>
            <button
              onClick={startAdminAi}
              className="px-8 py-4 bg-purple-600 text-white font-black uppercase tracking-widest text-sm rounded-full hover:bg-purple-700 hover:scale-105 active:scale-95 transition-all shadow-lg hover:shadow-purple-500/50 flex items-center justify-center gap-2"
            >
              Start Analysis & Monitor App
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 bg-white border-t border-slate-200 overflow-hidden relative">
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-slate-50 relative custom-scrollbar pb-32">
              {adminAiChat.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className="flex flex-col gap-2 max-w-[85%] md:max-w-[70%]">
                    <div className={`rounded-2xl p-4 shadow-sm ${msg.role === 'user' ? 'bg-purple-600 text-white rounded-tr-sm' : 'bg-white text-slate-800 border border-slate-200 rounded-tl-sm'}`}>
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {msg.attachments.map((att: any, aIdx: number) => (
                            <div key={aIdx} className="overflow-hidden border border-white/20 rounded-xl bg-black/10">
                              {att.type.startsWith('image/') ? (
                                <img src={`data:${att.type};base64,${att.data}`} className="w-40 h-40 object-cover" alt={att.name} />
                              ) : att.type.startsWith('video/') ? (
                                <div className="w-40 h-40 flex flex-col items-center justify-center p-3 text-center">
                                  <VideoIcon className="w-10 h-10 mb-2 opacity-50" />
                                  <span className="text-[10px] break-all line-clamp-2">{att.name}</span>
                                </div>
                              ) : (
                                <div className="w-40 h-40 flex flex-col items-center justify-center p-3 text-center">
                                  <FileText className="w-10 h-10 mb-2 opacity-50" />
                                  <span className="text-[10px] break-all line-clamp-2">{att.name}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {msg.role === 'model' ? (
                        <div className="whitespace-pre-wrap text-[15px] leading-relaxed font-medium">
                          {playingMessageIndex === idx ? (
                             msg.text.split(/\s+/).map((word, wIdx) => (
                               <span 
                                key={wIdx} 
                                className={`transition-colors duration-200 ${activeWordIndex === wIdx ? 'text-sky-400 font-black' : ''}`}
                               >
                                 {word}{' '}
                               </span>
                             ))
                          ) : (
                            msg.text
                          )}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-[15px] leading-relaxed font-medium">{msg.text}</p>
                      )}
                    </div>
                    
                    {msg.role === 'model' && (
                      <div className="flex items-center gap-1 mt-1 ml-1 opacity-60 hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => speak(msg.text, idx)}
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-all active:scale-90"
                          title="Play Answer"
                        >
                          <Play className={`w-3.5 h-3.5 ${playingMessageIndex === idx ? 'text-purple-600 fill-purple-600' : ''}`} />
                        </button>
                        <button 
                          onClick={regenerateLastMessage}
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-all active:scale-90"
                          title="Regenerate"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => copyToClipboard(msg.text)}
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-all active:scale-90"
                          title="Copy text"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isAiThinking && (
                <div className="flex justify-start">
                  <div className="bg-white text-slate-800 border border-slate-200 rounded-2xl rounded-tl-sm p-4 flex gap-2 w-16 shadow-sm items-center h-[52px]">
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" />
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0.2s' }} />
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0.4s' }} />
                  </div>
                </div>
              )}
              <div ref={aiChatEndRef} className="h-4" />
            </div>
            
            <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md p-3 md:p-5 border-t border-slate-200 z-30 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
              {uploadedFiles.length > 0 && (
                <div className="flex flex-wrap gap-3 mb-4 max-w-5xl mx-auto">
                  {uploadedFiles.map(file => (
                    <div key={file.id} className="relative group animate-in fade-in zoom-in duration-200">
                      {file.preview ? (
                        <img src={file.preview} className="w-16 h-16 object-cover rounded-xl border-2 border-slate-200 shadow-sm" alt="preview" />
                      ) : (
                        <div className="w-16 h-16 flex items-center justify-center bg-slate-100 rounded-xl border-2 border-slate-200 text-slate-400">
                          {file.type.startsWith('video/') ? <VideoIcon className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
                        </div>
                      )}
                      <button
                        onClick={() => removeFile(file.id)}
                        className="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full p-1 shadow-md hover:bg-rose-700 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  submitAdminAi(aiInput);
                }}
                className="flex items-center gap-2 md:gap-4 relative max-w-5xl mx-auto"
              >
                <input
                  type="file"
                  multiple
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 w-12 h-12 md:w-14 md:h-14 flex items-center justify-center bg-slate-100 text-slate-500 rounded-2xl hover:bg-slate-200 hover:text-purple-600 transition-all active:scale-95"
                  title="Upload Files"
                >
                  <Paperclip className="w-6 h-6" />
                </button>

                <div className="flex-1 relative">
                  <input
                    type="text"
                    className="w-full px-5 py-4 md:px-6 md:py-5 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-500/10 transition-all text-[15px] font-semibold bg-slate-100 border-slate-200 text-slate-800 focus:border-purple-500 focus:bg-white placeholder-slate-400"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    placeholder="Message Boss AI Assistant..."
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleVoice}
                    className={`shrink-0 w-12 h-12 md:w-14 md:h-14 flex items-center justify-center rounded-2xl transition-all active:scale-95 shadow-sm border ${
                      isVoiceEnabled 
                        ? 'bg-purple-100 border-purple-200 text-purple-600' 
                        : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200'
                    }`}
                    title={isVoiceEnabled ? "Voice Enabled" : "Voice Disabled"}
                  >
                    {isVoiceEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
                  </button>

                  <button
                    type={isAiThinking ? "button" : "submit"}
                    onClick={isAiThinking ? stopAiGeneration : undefined}
                    disabled={!isAiThinking && (!aiInput.trim() && uploadedFiles.length === 0)}
                    className={`shrink-0 w-14 h-14 md:w-auto md:px-8 md:h-[60px] rounded-2xl active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all flex items-center justify-center font-black uppercase tracking-widest text-xs shadow-xl gap-2 overflow-hidden ${
                      isAiThinking 
                        ? 'bg-rose-600 text-white shadow-rose-500/20' 
                        : 'bg-purple-600 text-white shadow-purple-500/20 hover:bg-purple-700'
                    }`}
                  >
                    {isAiThinking ? (
                      <>
                        <span className="hidden md:inline">Stop AI</span>
                        <Square className="w-5 h-5 flex-shrink-0 fill-current" />
                      </>
                    ) : (
                      <>
                        <span className="hidden md:inline">Ask AI</span>
                        <Send className="w-5 h-5 flex-shrink-0" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <AnimatePresence>
          {showAiSettings && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-50 md:p-6"
            >
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="bg-white w-full h-full md:rounded-3xl overflow-hidden shadow-2xl flex flex-col max-w-4xl"
              >
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                  <div className="flex items-center gap-4">
                     <button onClick={() => setShowAiSettings(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <ChevronLeft className="w-6 h-6 text-slate-600" />
                     </button>
                    <div>
                      <h3 className="font-black text-xl text-slate-800 uppercase tracking-tight">AI Assistant Settings</h3>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Configure your supreme AI intelligence</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      disabled={savingAiConfig}
                      onClick={() => handleSaveAiConfig()}
                      className="px-6 py-2.5 bg-purple-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-purple-700 active:scale-[0.98] transition-all shadow-lg shadow-purple-100 disabled:opacity-50 flex items-center gap-2"
                    >
                      {savingAiConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save Changes
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-12 custom-scrollbar">
                  {/* Authority Level Slider */}
                  <section className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <label className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                          <Lock className="w-4 h-4 text-purple-600" />
                          AI Authority Level
                        </label>
                        <p className="text-xs text-slate-400 font-medium">Controls what actions AI can perform</p>
                      </div>
                      <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        aiConfig.authorityLevel === 1 ? 'bg-amber-100 text-amber-600' : 
                        aiConfig.authorityLevel === 2 ? 'bg-sky-100 text-sky-600' : 
                        'bg-emerald-100 text-emerald-600 shadow-md shadow-emerald-100'
                      }`}>
                        {aiConfig.authorityLevel === 1 ? 'Low (View Only)' : 
                         aiConfig.authorityLevel === 2 ? 'Medium (Limited)' : 
                         'High (Full Control)'}
                      </span>
                    </div>
                    <div className="px-2">
                      <input 
                        type="range" 
                        min="1" 
                        max="3" 
                        step="1"
                        value={aiConfig.authorityLevel}
                        onChange={(e) => setAiConfig({...aiConfig, authorityLevel: parseInt(e.target.value)})}
                        className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-purple-600 transition-all mb-4"
                      />
                      <div className="grid grid-cols-3 text-center gap-2">
                         <div className={`p-4 rounded-2xl border transition-all ${aiConfig.authorityLevel === 1 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100 opacity-40'}`}>
                            <div className="text-[10px] font-black text-amber-600 uppercase mb-1">Low</div>
                            <div className="text-[8px] font-bold text-slate-600 uppercase">Jankari only</div>
                         </div>
                         <div className={`p-4 rounded-2xl border transition-all ${aiConfig.authorityLevel === 2 ? 'bg-sky-50 border-sky-200' : 'bg-slate-50 border-slate-100 opacity-40'}`}>
                            <div className="text-[10px] font-black text-sky-600 uppercase mb-1">Medium</div>
                            <div className="text-[8px] font-bold text-slate-600 uppercase">Limited Action</div>
                         </div>
                         <div className={`p-4 rounded-2xl border transition-all ${aiConfig.authorityLevel === 3 ? 'bg-emerald-50 border-emerald-200 shadow-lg shadow-emerald-100' : 'bg-slate-50 border-slate-100 opacity-40'}`}>
                            <div className="text-[10px] font-black text-emerald-600 uppercase mb-1">High</div>
                            <div className="text-[8px] font-bold text-slate-600 uppercase">Full Control</div>
                         </div>
                      </div>
                    </div>
                  </section>

                  <div className="h-px bg-slate-100" />

                  {/* Voice Settings */}
                  <section className="space-y-8">
                    <div className="space-y-1">
                      <label className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <Volume2 className="w-4 h-4 text-purple-600" />
                        Voice Assistant Settings
                      </label>
                      <p className="text-xs text-slate-400 font-medium">Customize how Boss AI communicates</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Language</label>
                          <select 
                            value={aiConfig.voiceLang}
                            onChange={(e) => setAiConfig({...aiConfig, voiceLang: e.target.value})}
                            className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-purple-600/10 transition-all appearance-none"
                          >
                            <option value="hi-IN">Hindi (India)</option>
                            <option value="en-US">English (US)</option>
                            <option value="en-GB">English (UK)</option>
                          </select>
                        </div>

                        <div className="space-y-4">
                          <div className="flex justify-between items-center text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                            <span>Voice Gender</span>
                            <span className="text-purple-600 uppercase font-black tracking-widest">{aiConfig.voiceGender === 'female' ? 'Female (Fimale)' : 'Male'}</span>
                          </div>
                          <div className="px-2">
                             <input 
                               type="range" min="0" max="1" step="1"
                               value={aiConfig.voiceGender === 'female' ? 1 : 0}
                               onChange={(e) => setAiConfig({...aiConfig, voiceGender: e.target.value === '1' ? 'female' : 'male'})}
                               className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-purple-600"
                             />
                             <div className="flex justify-between mt-2 text-[8px] font-black text-slate-400 uppercase tracking-widest">
                               <span>Male</span>
                               <span>Female (Fimale)</span>
                             </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-6">
                        <div className="space-y-4">
                          <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                            <span>Speech Rate (Speed)</span>
                            <span className="text-purple-600 font-black">{aiConfig.voiceRate.toFixed(1)}x</span>
                          </div>
                          <input 
                            type="range" min="0.5" max="2.0" step="0.1"
                            value={aiConfig.voiceRate}
                            onChange={(e) => setAiConfig({...aiConfig, voiceRate: parseFloat(e.target.value)})}
                            className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-purple-600"
                          />
                        </div>
                        <div className="space-y-4">
                          <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                            <span>Pitch Rate (Tone)</span>
                            <span className="text-purple-600 font-black">{aiConfig.voicePitch.toFixed(1)}</span>
                          </div>
                          <input 
                            type="range" min="0.5" max="2.0" step="0.1"
                            value={aiConfig.voicePitch}
                            onChange={(e) => setAiConfig({...aiConfig, voicePitch: parseFloat(e.target.value)})}
                            className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-purple-600"
                          />
                        </div>
                      </div>
                    </div>
                  </section>

                  <div className="h-px bg-slate-100" />

                  {/* Custom Instructions */}
                  <section className="space-y-6">
                    <div className="space-y-1">
                      <label className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <Bot className="w-4 h-4 text-purple-600" />
                        Custom AI Instructions
                      </label>
                      <p className="text-xs text-slate-400 font-medium">Give specific commands to your AI agents</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <button 
                         onClick={() => {
                           setInstructionTarget('admin');
                           setCustomInstructionText(aiConfig.adminCustomInstructions || '');
                         }}
                         className="flex items-center gap-4 p-6 bg-slate-50 border border-slate-100 rounded-3xl hover:bg-purple-50 hover:border-purple-200 transition-all group text-left"
                      >
                         <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-purple-600 group-hover:shadow-md transition-all">
                            <ShieldCheck className="w-6 h-6" />
                         </div>
                         <div>
                            <span className="block text-xs font-black uppercase tracking-tight text-slate-800">Admin AI Assistant</span>
                            <span className="text-[10px] text-slate-500 font-medium italic">Custom brain for Admin Panel AI</span>
                         </div>
                      </button>
                      <button 
                         onClick={() => {
                           setInstructionTarget('user');
                           setCustomInstructionText(aiConfig.userCustomInstructions || '');
                         }}
                         className="flex items-center gap-4 p-6 bg-slate-50 border border-slate-100 rounded-3xl hover:bg-blue-50 hover:border-blue-200 transition-all group text-left"
                      >
                         <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-blue-600 group-hover:shadow-md transition-all">
                            <User className="w-6 h-6" />
                         </div>
                         <div>
                            <span className="block text-xs font-black uppercase tracking-tight text-slate-800">User App AI Helper</span>
                            <span className="text-[10px] text-slate-500 font-medium italic">Custom brain for User Dashboard AI</span>
                         </div>
                      </button>
                    </div>
                  </section>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Custom Instructions Editor Modal */}
        <AnimatePresence>
          {instructionTarget && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col"
              >
                <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white ${instructionTarget === 'admin' ? 'bg-purple-600' : 'bg-blue-600'}`}>
                        {instructionTarget === 'admin' ? <ShieldCheck className="w-5 h-5" /> : <User className="w-5 h-5" />}
                      </div>
                      <h4 className="font-black text-slate-800 uppercase tracking-tight">
                        {instructionTarget === 'admin' ? 'Admin Panel AI Instructions' : 'User App AI Helper Instructions'}
                      </h4>
                   </div>
                   <button onClick={() => setInstructionTarget(null)} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
                      <X className="w-5 h-5 text-slate-400" />
                   </button>
                </div>
                <div className="p-6 space-y-4">
                   <p className="text-xs font-medium text-slate-500 leading-relaxed">
                     Aap AI ko yahan custom instructions de sakte hain. AI hamesha in rules ko follow karega answer dete waqt.
                   </p>
                   <textarea
                     className="w-full h-64 p-5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-600/10 focus:border-purple-600 text-[14px] font-medium leading-relaxed custom-scrollbar placeholder-slate-300 transition-all"
                     placeholder="Type instructions here... (e.g. Always be polite, Never give discounts more than 10%, etc.)"
                     value={customInstructionText}
                     onChange={(e) => setCustomInstructionText(e.target.value)}
                   />
                </div>
                <div className="p-6 bg-slate-50 flex gap-3">
                  <button 
                    onClick={() => setInstructionTarget(null)}
                    className="flex-1 py-4 bg-white border border-slate-200 text-slate-500 text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-slate-100 transition-all font-inter"
                  >
                    Cancel
                  </button>
                  <button 
                    disabled={savingAiConfig}
                    onClick={handleSaveCustomInstructions}
                    className={`flex-1 py-4 text-white text-xs font-black uppercase tracking-widest rounded-2xl active:scale-[0.98] transition-all shadow-xl disabled:opacity-50 flex items-center justify-center gap-2 ${instructionTarget === 'admin' ? 'bg-purple-600 shadow-purple-100 hover:bg-purple-700' : 'bg-blue-600 shadow-blue-100 hover:bg-blue-700'}`}
                  >
                    {savingAiConfig ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                    Save Instructions
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const renderSpinnerManagement = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">Spinner Management</h2>
        <Disc className="w-8 h-8 text-cyan-500 animate-spin-slow" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Config Form */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
          <h3 className="font-black text-slate-800 flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-400" />
            Configuration
          </h3>
          
          <form onSubmit={handleSaveSpinnerConfig} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Eligibility Period (Days)</label>
                  <span className="bg-cyan-50 text-cyan-600 px-3 py-1 rounded-full text-[10px] font-black uppercase">
                    {spinnerConfig.eligibilityDays} Days
                  </span>
                </div>
                <input
                  type="number"
                  min="1"
                  max="30"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700"
                  value={isNaN(spinnerConfig.eligibilityDays) ? '' : spinnerConfig.eligibilityDays}
                  onChange={(e) => {
                    const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                    setSpinnerConfig({ ...spinnerConfig, eligibilityDays: isNaN(val) ? 0 : val });
                  }}
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Max Spins Per Day</label>
                  <span className="bg-amber-50 text-amber-600 px-3 py-1 rounded-full text-[10px] font-black uppercase">
                    {spinnerConfig.maxSpinsPerDay || 1} Spins
                  </span>
                </div>
                <input
                  type="number"
                  min="1"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-bold text-slate-700"
                  placeholder="Enter max spins per day"
                  value={isNaN(spinnerConfig.maxSpinsPerDay) ? '' : spinnerConfig.maxSpinsPerDay}
                  onChange={(e) => {
                    const val = e.target.value === '' ? 1 : parseInt(e.target.value);
                    setSpinnerConfig({ ...spinnerConfig, maxSpinsPerDay: isNaN(val) ? 1 : val });
                  }}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Paid Spin Cost (Funds)</label>
                <span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-[10px] font-black uppercase">
                  {formatCurrency(spinnerConfig.paidSpinCost || 0)} Per Spin
                </span>
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold text-slate-700"
                placeholder="Enter cost for paid spins"
                value={isNaN(spinnerConfig.paidSpinCost) ? '' : spinnerConfig.paidSpinCost}
                onChange={(e) => {
                  const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                  setSpinnerConfig({ ...spinnerConfig, paidSpinCost: isNaN(val) ? 0 : val });
                }}
              />
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Spinner Options (10 Total)</label>
              <div className="grid grid-cols-1 gap-3">
                {spinnerConfig.options.map((option: any, index: number) => (
                  <div key={index} className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center font-black text-slate-400 text-xs shadow-sm">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <input
                        type="number"
                        placeholder="Amount"
                        className="w-full bg-transparent border-none focus:outline-none font-bold text-slate-700 text-sm"
                        value={isNaN(option.amount) ? '' : option.amount}
                        onChange={(e) => {
                          const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                          const newOptions = [...spinnerConfig.options];
                          newOptions[index] = { ...option, amount: isNaN(val) ? 0 : val };
                          setSpinnerConfig({ ...spinnerConfig, options: newOptions });
                        }}
                      />
                    </div>
                    
                    {/* Vertical Separator */}
                    <div className="w-px h-8 bg-slate-200" />

                    <div className="w-24">
                      <input
                        type="number"
                        placeholder="Chance %"
                        className="w-full bg-transparent border-none focus:outline-none font-bold text-cyan-600 text-sm text-right"
                        value={isNaN(option.probability) ? '' : option.probability}
                        onChange={(e) => {
                          const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                          const newOptions = [...spinnerConfig.options];
                          newOptions[index] = { ...option, probability: isNaN(val) ? 0 : val };
                          setSpinnerConfig({ ...spinnerConfig, options: newOptions });
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 flex items-center justify-center gap-2"
            >
              <Save className="w-5 h-5" />
              Save Configuration
            </button>
          </form>
        </div>

        {/* Recent Logs */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
          <h3 className="font-black text-slate-800 flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-400" />
            Recent Spins
          </h3>

          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
            {spinnerLogs.filter(l => !l.hiddenFromAdmin).length === 0 ? (
              <div className="p-12 text-center border-2 border-dashed border-slate-100 rounded-3xl">
                <p className="text-slate-400 font-bold">No spin history yet</p>
              </div>
            ) : (
              spinnerLogs.filter(l => !l.hiddenFromAdmin).map((log) => (
                <div key={log.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                      <Disc className="w-5 h-5 text-cyan-500" />
                    </div>
                    <div>
                      <p className="font-black text-slate-800 text-sm">{log.userName}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">
                        Won {formatCurrency(log.amount)} • {log.createdAt?.toDate ? log.createdAt.toDate().toLocaleTimeString() : new Date(log.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handlePinSpinnerLog(log.id, log.pinned)}
                      className={`p-2 rounded-xl transition-colors ${log.pinned ? 'bg-amber-100 text-amber-600' : 'bg-white text-slate-400 hover:bg-slate-100'}`}
                    >
                      {log.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleDeleteSpinnerLog(log.id)}
                      className="p-2 bg-white text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-xl transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const statCards = [
    { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'text-blue-500', bg: 'bg-blue-50' },
    { label: 'Total Orders', value: stats.totalOrders, icon: ClipboardList, color: 'text-purple-500', bg: 'bg-purple-50' },
    { label: 'Total Services', value: stats.totalServices, icon: Layers, color: 'text-orange-500', bg: 'bg-orange-50' },
    { label: 'Total Revenue', value: formatCurrency(stats.totalRevenue), icon: IndianRupee, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  ];

  return (
    <div 
      className="min-h-screen bg-slate-50 pb-10 relative overflow-x-hidden"
      style={appConfig.appNameStyling.enabled && appConfig.appNameStyling.applyGlobalFont ? { fontFamily: appConfig.appNameStyling.fontStyle } : {}}
    >
      {/* Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 180 }}
            className="fixed top-0 left-0 bottom-0 w-72 bg-white z-[70] shadow-2xl p-6 flex flex-col overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-10">
              <h2 className="text-2xl font-black text-cyan-500 tracking-tighter">Admin Menu</h2>
              <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-slate-100 rounded-full">
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>

            <nav className="space-y-2 flex-1">
              <button
                onClick={() => { setView('dashboard'); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl font-bold transition-all ${
                  view === 'dashboard' ? 'bg-cyan-50 text-cyan-600' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <LayoutDashboard className="w-5 h-5" />
                Dashboard
              </button>
              <button
                onClick={() => { setView('services'); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl font-bold transition-all ${
                  view === 'services' ? 'bg-cyan-50 text-cyan-600' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Layers className="w-5 h-5" />
                Service Management
              </button>
              <button
                onClick={() => { setView('app_management'); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl font-bold transition-all ${
                  view === 'app_management' ? 'bg-cyan-50 text-cyan-600' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Settings className="w-5 h-5" />
                App Management
              </button>
              <button
                onClick={() => { setView('orders'); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl font-bold transition-all ${
                  view === 'orders' ? 'bg-cyan-50 text-cyan-600' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <ShoppingCart className="w-5 h-5" />
                Orders
              </button>
              <button
                onClick={() => { setView('payments'); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl font-bold transition-all ${
                  view === 'payments' ? 'bg-cyan-50 text-cyan-600' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <CreditCard className="w-5 h-5" />
                Payments
              </button>
              <button
                onClick={() => { setView('notifications'); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl font-bold transition-all ${
                  view === 'notifications' ? 'bg-cyan-50 text-cyan-600' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Bell className="w-5 h-5" />
                Notifications
              </button>
              <button
                onClick={() => { setView('user_management'); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl font-bold transition-all ${
                  view === 'user_management' ? 'bg-cyan-50 text-cyan-600' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Users className="w-5 h-5" />
                User Management
              </button>

              <button
                onClick={() => { setView('security_monitor'); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl font-bold transition-all ${
                  view === 'security_monitor' ? 'bg-cyan-50 text-cyan-600' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <ShieldAlert className="w-5 h-5" />
                Security Monitor
              </button>

              <button
                onClick={() => { setView('password_management'); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl font-bold transition-all ${
                  view === 'password_management' ? 'bg-cyan-50 text-cyan-600' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Lock className="w-5 h-5" />
                Admin Pass
              </button>

              <button
                onClick={() => { setView('referral_management'); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl font-bold transition-all ${
                  view === 'referral_management' ? 'bg-cyan-50 text-cyan-600' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Gift className="w-5 h-5" />
                Referral Management
              </button>

              <button
                onClick={() => { setView('daily_giveaway'); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl font-bold transition-all ${
                  view === 'daily_giveaway' ? 'bg-cyan-50 text-cyan-600' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Gift className="w-5 h-5" />
                Daily Giveaway
              </button>

              <button
                onClick={() => { setView('spinner_management'); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl font-bold transition-all ${
                  view === 'spinner_management' ? 'bg-cyan-50 text-cyan-600' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Disc className="w-5 h-5" />
                Spinner Management
              </button>

              <button
                onClick={() => { setView('ai_assistant'); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl font-bold transition-all ${
                  view === 'ai_assistant' ? 'bg-cyan-50 text-cyan-600' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Bot className="w-5 h-5" />
                AI Assistant
              </button>
            </nav>

            <div className="pt-6 border-t border-slate-100">
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest text-center">Version 1.0.0</p>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Admin Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-slate-600" />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-800">
              {view === 'dashboard' ? 'Dashboard' : 
               view === 'services' ? 'Services' : 
               view === 'app_management' ? 'App Management' : 
               view === 'password_management' ? 'Admin Pass' :
               view === 'orders' ? 'Order Management' :
               view === 'payments' ? 'Payment Management' :
               view === 'notifications' ? 'Notifications' :
               view === 'referral_management' ? 'Referral Management' :
               view === 'daily_giveaway' ? 'Daily Giveaway' :
               view === 'spinner_management' ? 'Spinner Management' :
               view === 'ai_assistant' ? 'AI Assistant' :
               'User Management'}
            </h1>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Admin Panel</p>
          </div>
        </div>
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors"
        >
          <Menu className="w-6 h-6 text-slate-600" />
        </button>
      </header>

      <div className="p-6">
        {view === 'dashboard' && (
          <div className="space-y-8">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              {statCards.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ 
                    type: 'spring', 
                    damping: 28, 
                    stiffness: 180, 
                    delay: index * 0.05 
                  }}
                  className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm"
                >
                  <div className={`${stat.bg} w-10 h-10 rounded-xl flex items-center justify-center mb-3`}>
                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">{stat.label}</p>
                  <h3 className="text-xl font-black text-slate-800 mt-1">{stat.value}</h3>
                </motion.div>
              ))}
            </div>

            {/* Recent Orders Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-slate-400" />
                  <h2 className="font-black text-slate-800">Recent Orders</h2>
                </div>
                <TrendingUp className="w-5 h-5 text-cyan-500" />
              </div>

              <div className="space-y-3">
                {recentOrders.length === 0 ? (
                  <div className="bg-white p-10 rounded-3xl border border-dashed border-slate-200 text-center">
                    <p className="text-slate-400 font-medium">No orders found yet.</p>
                  </div>
                ) : (
                  recentOrders.map((order) => (
                    <div 
                      key={order.id}
                      className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between"
                    >
                      <div className="space-y-1">
                        <p className="font-bold text-slate-800 text-sm truncate max-w-[180px]">
                          {order.serviceName}
                        </p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">
                          Qty: {order.quantity} • {formatCurrency(order.totalCost)}
                        </p>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                        order.status === 'Completed' ? 'bg-emerald-50 text-emerald-500' :
                        order.status === 'Pending' ? 'bg-amber-50 text-amber-500' :
                        'bg-slate-50 text-slate-500'
                      }`}>
                        {order.status}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {view === 'services' && (
          <div className="space-y-6">
            {/* Category Management View */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Manage Services</h2>
                <div className="flex gap-2">
                  <button 
                    onClick={handleSyncServices}
                    className="bg-slate-100 text-slate-600 p-3 rounded-2xl flex items-center gap-2 font-bold hover:bg-slate-200 transition-colors"
                  >
                    <RefreshCcw className="w-5 h-5" />
                    Sync
                  </button>
                  <button 
                    onClick={() => { 
                      setEditingService(null); 
                      setServiceForm({ 
                        category: '', 
                        items: [{ name: '', emoji: '', description: '', pricePerUnit: '', minQty: '', maxQty: '', api_service_id: '' }] 
                      }); 
                      setShowServiceModal(true); 
                    }}
                    className="bg-cyan-500 text-white p-3 rounded-2xl flex items-center gap-2 font-bold shadow-lg shadow-cyan-200 hover:scale-105 transition-transform"
                  >
                    <Plus className="w-5 h-5" />
                    New Service
                  </button>
                </div>
              </div>

              {/* Bulk Actions Bar */}
              <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-hide">
                <button 
                  onClick={handleDeleteAllServices}
                  className="whitespace-nowrap bg-rose-50 text-rose-600 px-4 py-2.5 rounded-xl flex items-center gap-2 font-black text-[10px] uppercase tracking-widest border border-rose-100 hover:bg-rose-100 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete All Services
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {services.length === 0 ? (
                <div className="bg-white p-12 rounded-[2.5rem] border border-dashed border-slate-200 text-center">
                  <Layers className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-400 font-bold">No services created yet.</p>
                </div>
              ) : (
                Object.entries(
                  services.reduce((acc, service) => {
                    if (!acc[service.category]) acc[service.category] = [];
                    acc[service.category].push(service);
                    return acc;
                  }, {} as Record<string, any[]>)
                ).map(([category, categoryServices]) => (
                  <div key={category} className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
                    <div className="bg-slate-50/50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-cyan-500 flex items-center justify-center">
                          <Layers className="w-4 h-4 text-white" />
                        </div>
                        <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm flex items-center gap-2">
                          {getCategoryIcon(category)} {category}
                          {categories.find(c => c.name === category)?.pinned && (
                            <span className="bg-amber-100 text-amber-600 px-2 py-0.5 rounded text-[10px]">Pinned</span>
                          )}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleToggleCategoryPin(category)}
                          className={`p-1.5 rounded-lg transition-colors border shadow-sm ${categories.find(c => c.name === category)?.pinned ? 'bg-amber-50 text-amber-500 border-amber-200' : 'bg-white text-slate-400 border-slate-200 hover:text-amber-500'}`}
                          title={categories.find(c => c.name === category)?.pinned ? 'Unpin Category' : 'Pin Category'}
                        >
                          {categories.find(c => c.name === category)?.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                        </button>
                        <span className="text-[10px] font-black text-slate-400 bg-white px-2 py-1 rounded-full border border-slate-100">
                          {(categoryServices as any[]).length} Services
                        </span>
                      </div>
                    </div>
                    <div className="p-4 space-y-4">
                      {(categoryServices as any[])
                        .sort((a, b) => {
                           if (a.pinned && !b.pinned) return -1;
                           if (!a.pinned && b.pinned) return 1;
                           return 0;
                        })
                        .map((service) => (
                        <div key={service.id} className="bg-slate-50/30 p-4 rounded-3xl border border-slate-100/50 space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="space-y-0.5 flex-1">
                              <h4 className="font-black text-slate-800 flex items-center gap-2">
                                {service.name}
                                {service.pinned && <span className="bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-widest">Pinned</span>}
                              </h4>
                              <p className="text-[10px] text-slate-400 font-medium line-clamp-1">{service.description}</p>
                            </div>
                            <div className="flex gap-1.5">
                              <button onClick={() => handleToggleServicePin(service)} className={`p-2 rounded-xl transition-colors border shadow-sm ${service.pinned ? 'bg-amber-50 text-amber-500 border-amber-200 hover:bg-amber-100' : 'bg-white text-slate-400 hover:text-amber-500 border-slate-100'}`}>
                                {service.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                              </button>
                              <button onClick={() => openEditModal(service)} className="p-2 bg-white text-slate-400 hover:text-cyan-500 rounded-xl transition-colors border border-slate-100 shadow-sm">
                                <Edit className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDeleteService(service.id)} className="p-2 bg-white text-slate-400 hover:text-rose-500 rounded-xl transition-colors border border-slate-100 shadow-sm">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="bg-white p-2 rounded-xl text-center border border-slate-100">
                              <p className="text-[8px] text-slate-400 font-bold uppercase">Price</p>
                              <p className="text-[10px] font-black text-slate-700">{formatCurrency(service.pricePerUnit)}</p>
                            </div>
                            <div className="bg-white p-2 rounded-xl text-center border border-slate-100">
                              <p className="text-[8px] text-slate-400 font-bold uppercase">Min</p>
                              <p className="text-[10px] font-black text-slate-700">{service.minQty}</p>
                            </div>
                            <div className="bg-white p-2 rounded-xl text-center border border-slate-100">
                              <p className="text-[8px] text-slate-400 font-bold uppercase">Max</p>
                              <p className="text-[10px] font-black text-slate-700">{service.maxQty}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {view === 'app_management' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">{t('app_management')}</h2>
            
            <form onSubmit={handleSaveConfig} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('app_name')}</label>
                    {appConfig.appNameStyling?.enabled && (
                      <button
                        type="button"
                        onClick={toggleStylingOptions}
                        className="text-[10px] font-black text-cyan-500 uppercase tracking-widest hover:text-cyan-600 transition-colors flex items-center gap-1"
                      >
                        {showStylingOptions ? 'Hide Styling' : 'Show Styling'}
                        <ChevronDown className={`w-3 h-3 transition-transform ${showStylingOptions ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                  </div>
                  <input
                    required
                    placeholder="e.g. InstaBoost"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700"
                    value={appConfig.appName}
                    onChange={(e) => setAppConfig({ ...appConfig, appName: e.target.value })}
                  />
                </div>
                <div className="pt-6">
                  <button
                    type="button"
                    onClick={() => setAppConfig({ 
                      ...appConfig, 
                      appNameStyling: { 
                        ...(appConfig.appNameStyling || {
                          enabled: false,
                          color: '#06b6d4',
                          effect: 'classic',
                          rgbEnabled: false,
                          rgbSpeed: 5,
                          fontStyle: 'Inter',
                          animation: 'none'
                        }), 
                        enabled: !appConfig.appNameStyling?.enabled 
                      } 
                    })}
                    className={`w-14 h-8 rounded-full relative transition-colors ${appConfig.appNameStyling?.enabled ? 'bg-cyan-500' : 'bg-slate-200'}`}
                  >
                    <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${appConfig.appNameStyling?.enabled ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
              </div>

              {appConfig.appNameStyling?.enabled && showStylingOptions && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-6 overflow-hidden"
                >
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Color & Effects */}
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Text Color & Effects</label>
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                          {['#06b6d4', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#000000', '#ffffff'].map(c => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setAppConfig({ 
                                ...appConfig, 
                                appNameStyling: { ...appConfig.appNameStyling, color: c, rgbEnabled: false } 
                              })}
                              className={`w-8 h-8 rounded-full border-2 transition-all ${appConfig.appNameStyling.color === c && !appConfig.appNameStyling.rgbEnabled ? 'border-cyan-500 scale-110' : 'border-transparent'}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                        
                        <div className="flex items-center justify-between p-3 bg-white rounded-2xl border border-slate-100">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">RGB Animation</span>
                          <button
                            type="button"
                            onClick={() => setAppConfig({ 
                              ...appConfig, 
                              appNameStyling: { ...appConfig.appNameStyling, rgbEnabled: !appConfig.appNameStyling.rgbEnabled } 
                            })}
                            className={`w-10 h-6 rounded-full relative transition-colors ${appConfig.appNameStyling.rgbEnabled ? 'bg-cyan-500' : 'bg-slate-200'}`}
                          >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${appConfig.appNameStyling.rgbEnabled ? 'left-5' : 'left-1'}`} />
                          </button>
                        </div>

                        {appConfig.appNameStyling.rgbEnabled && (
                          <div className="space-y-1.5">
                            <div className="flex justify-between">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">RGB Speed</label>
                              <span className="text-[10px] font-black text-cyan-500">{appConfig.appNameStyling.rgbSpeed}s</span>
                            </div>
                            <input
                              type="range"
                              min="1"
                              max="20"
                              step="1"
                              className="w-full accent-cyan-500"
                              value={appConfig.appNameStyling.rgbSpeed}
                              onChange={(e) => setAppConfig({ 
                                ...appConfig, 
                                appNameStyling: { ...appConfig.appNameStyling, rgbSpeed: parseInt(e.target.value) } 
                              })}
                            />
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Effects</label>
                          <select
                            className="w-full bg-white border border-slate-100 rounded-xl py-2 px-3 text-xs font-bold text-slate-600 focus:outline-none"
                            value={appConfig.appNameStyling.effect}
                            onChange={(e) => setAppConfig({ 
                              ...appConfig, 
                              appNameStyling: { ...appConfig.appNameStyling, effect: e.target.value } 
                            })}
                          >
                            <option value="classic">Classic</option>
                            <option value="barkst">Barkst (Neon)</option>
                            <option value="gradient">Gradient</option>
                            <option value="outline">Outline</option>
                            <option value="shadow">Glow Shadow</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Text Styles (Fonts) */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-cyan-500">{t('language')}</label>
                      </div>
                      
                      <div className="space-y-4 bg-slate-50 p-8 rounded-3xl border border-slate-100 min-h-[150px]">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('default_language')}</label>
                          <select
                            className="w-full bg-white border border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold text-slate-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                            value={appConfig.defaultLanguage || 'en'}
                            onChange={(e) => setAppConfig({ ...appConfig, defaultLanguage: e.target.value })}
                          >
                            {languages.map(lang => (
                              <option key={lang.code} value={lang.code}>{lang.name} ({lang.nativeName})</option>
                            ))}
                          </select>
                          <p className="text-[9px] text-slate-400 font-medium ml-1 italic">This will be the default language for all users.</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Text Styles (100+)</label>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Global</span>
                          <button
                            type="button"
                            onClick={() => setAppConfig({ 
                              ...appConfig, 
                              appNameStyling: { ...appConfig.appNameStyling, applyGlobalFont: !appConfig.appNameStyling.applyGlobalFont } 
                            })}
                            className={`w-8 h-4 rounded-full relative transition-colors ${appConfig.appNameStyling.applyGlobalFont ? 'bg-cyan-500' : 'bg-slate-200'}`}
                          >
                            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${appConfig.appNameStyling.applyGlobalFont ? 'left-4.5' : 'left-0.5'}`} />
                          </button>
                        </div>
                      </div>
                      <div className="h-[200px] overflow-y-auto pr-2 custom-scrollbar space-y-2">
                        {FONTS.map(font => (
                          <button
                            key={font}
                            type="button"
                            onClick={() => setAppConfig({ 
                              ...appConfig, 
                              appNameStyling: { ...appConfig.appNameStyling, fontStyle: font } 
                            })}
                            className={`w-full p-3 rounded-xl border text-left transition-all ${appConfig.appNameStyling.fontStyle === font ? 'bg-cyan-50 border-cyan-200 text-cyan-600' : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50'}`}
                            style={{ fontFamily: font }}
                          >
                            <span className="text-sm font-bold">{font}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Animations */}
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Text Animations (50+)</label>
                      <div className="h-[200px] overflow-y-auto pr-2 custom-scrollbar space-y-2">
                        {[
                          'none', 'bounce', 'pulse', 'shake', 'swing', 'tada', 'wobble', 'jello', 'heartBeat', 'flash',
                          'rubberBand', 'headShake', 'flip', 'flipInX', 'flipInY', 'fadeIn', 'fadeInDown', 'fadeInLeft', 'fadeInRight',
                          'fadeInUp', 'bounceIn', 'bounceInDown', 'bounceInLeft', 'bounceInRight', 'bounceInUp', 'rotateIn', 'rotateInDownLeft', 'rotateInDownRight', 'rotateInUpLeft',
                          'rotateInUpRight', 'slideInDown', 'slideInLeft', 'slideInRight', 'slideInUp', 'zoomIn', 'zoomInDown', 'zoomInLeft', 'zoomInRight', 'zoomInUp',
                          'jackInTheBox', 'rollIn', 'float', 'glitch', 'wave', 'typing', 'sparkle', 'shimmer', 'rainbow', 'neonPulse'
                        ].map(anim => (
                          <button
                            key={anim}
                            type="button"
                            onClick={() => setAppConfig({ 
                              ...appConfig, 
                              appNameStyling: { ...appConfig.appNameStyling, animation: anim } 
                            })}
                            className={`w-full p-3 rounded-xl border text-left transition-all ${appConfig.appNameStyling.animation === anim ? 'bg-cyan-50 border-cyan-200 text-cyan-600' : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50'}`}
                          >
                            <span className="text-xs font-black uppercase tracking-widest">{anim}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  {/* Preview */}
                  <div className="pt-4 border-t border-slate-100">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-3">Live Preview</label>
                    <div className="bg-slate-900 p-8 rounded-3xl flex items-center justify-center overflow-hidden">
                      <h1 
                        className={`text-4xl font-black tracking-tighter transition-all duration-500`}
                        style={{ 
                          color: appConfig.appNameStyling.rgbEnabled ? undefined : (appConfig.appNameStyling.animation === 'shimmer' ? 'transparent' : appConfig.appNameStyling.color),
                          fontFamily: appConfig.appNameStyling.fontStyle,
                          animation: `${appConfig.appNameStyling.animation} ${appConfig.appNameStyling.animation === 'typing' ? '3s steps(40, end)' : '2s'} infinite, ${appConfig.appNameStyling.rgbEnabled ? `rgb-cycle ${appConfig.appNameStyling.rgbSpeed}s linear infinite` : 'none'}`,
                          textShadow: appConfig.appNameStyling.effect === 'barkst' ? `0 0 10px ${appConfig.appNameStyling.color}, 0 0 20px ${appConfig.appNameStyling.color}` : 
                                     appConfig.appNameStyling.effect === 'shadow' ? `4px 4px 0px rgba(0,0,0,0.2)` : 'none',
                          WebkitTextStroke: appConfig.appNameStyling.effect === 'outline' ? `1px ${appConfig.appNameStyling.color}` : 'none',
                          backgroundImage: appConfig.appNameStyling.animation === 'shimmer' ? `linear-gradient(to right, ${appConfig.appNameStyling.color} 0, #ffffff 50%, ${appConfig.appNameStyling.color} 100%)` : 
                                     appConfig.appNameStyling.effect === 'gradient' ? `linear-gradient(to right, ${appConfig.appNameStyling.color}, #ffffff)` : 'none',
                          backgroundSize: appConfig.appNameStyling.animation === 'shimmer' ? '200% auto' : 'auto',
                          WebkitBackgroundClip: (appConfig.appNameStyling.effect === 'gradient' || appConfig.appNameStyling.animation === 'shimmer') ? 'text' : 'none',
                          WebkitTextFillColor: (appConfig.appNameStyling.effect === 'gradient' || appConfig.appNameStyling.animation === 'shimmer') ? 'transparent' : 'inherit',
                          overflow: appConfig.appNameStyling.animation === 'typing' ? 'hidden' : 'visible',
                          whiteSpace: appConfig.appNameStyling.animation === 'typing' ? 'nowrap' : 'normal',
                          borderRight: appConfig.appNameStyling.animation === 'typing' ? `2px solid ${appConfig.appNameStyling.color}` : 'none'
                        }}
                      >
                        {appConfig.appName}
                      </h1>
                    </div>
                  </div>
                </motion.div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Service Markup (%)</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 20"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700"
                  value={isNaN(appConfig.serviceMarkup) ? '' : appConfig.serviceMarkup}
                  onChange={(e) => {
                    const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                    setAppConfig({ ...appConfig, serviceMarkup: isNaN(val) ? 0 : val });
                  }}
                />
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest ml-1">This percentage will be added to the base SMM API price.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-100">
                  <div className="space-y-1">
                    <h3 className="font-black text-slate-800">Show Language</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                      {appConfig.showLanguageSettings ? 'Visible in Profile' : 'Hidden in Profile'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAppConfig({ ...appConfig, showLanguageSettings: !appConfig.showLanguageSettings })}
                    className={`w-14 h-8 rounded-full relative transition-colors ${appConfig.showLanguageSettings ? 'bg-cyan-500' : 'bg-slate-200'}`}
                  >
                    <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${appConfig.showLanguageSettings ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-100">
                  <div className="space-y-1">
                    <h3 className="font-black text-slate-800">Maintenance Mode</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                      {appConfig.isMaintenanceMode ? 'App locked' : 'App active'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAppConfig({ ...appConfig, isMaintenanceMode: !appConfig.isMaintenanceMode })}
                    className={`w-14 h-8 rounded-full relative transition-colors ${appConfig.isMaintenanceMode ? 'bg-rose-500' : 'bg-slate-200'}`}
                  >
                    <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${appConfig.isMaintenanceMode ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Google Gemini API Key</label>
                  <button 
                    type="button"
                    onClick={testGeminiApiKey}
                    disabled={testingGemini || !appConfig.geminiApiKey}
                    className="text-[10px] font-black text-white bg-cyan-500 hover:bg-cyan-600 px-3 py-1 rounded-full text-xs transition-colors disabled:opacity-50"
                  >
                    {testingGemini ? 'Testing...' : 'Test API'}
                  </button>
                </div>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700"
                  value={appConfig.geminiApiKey || ''}
                  onChange={(e) => setAppConfig({ ...appConfig, geminiApiKey: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Payment QR URL</label>
                <input
                  required
                  placeholder="https://example.com/qr.png"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700"
                  value={appConfig.qrUrl}
                  onChange={(e) => setAppConfig({ ...appConfig, qrUrl: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">UPI ID (PhonePe/GPay)</label>
                <input
                  required
                  placeholder="e.g. yourname@upi"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700"
                  value={appConfig.upiId}
                  onChange={(e) => setAppConfig({ ...appConfig, upiId: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Min Payment (₹)</label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 10"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700"
                  value={isNaN(appConfig.minPayment) ? '' : appConfig.minPayment}
                  onChange={(e) => {
                    const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                    setAppConfig({ ...appConfig, minPayment: isNaN(val) ? 0 : val });
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Max Payment (₹)</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 10000"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700"
                  value={isNaN(appConfig.maxPayment) ? '' : appConfig.maxPayment}
                  onChange={(e) => {
                    const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                    setAppConfig({ ...appConfig, maxPayment: isNaN(val) ? 0 : val });
                  }}
                />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">SMM API Settings</h3>
                  {smmBalance && (
                    <div className="bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                      <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Balance: {smmBalance}</p>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">SMM API URL</label>
                  <input
                    placeholder="https://app.smmowl.com/api/v2"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700"
                    value={appConfig.smmApiUrl || ''}
                    onChange={(e) => setAppConfig({ ...appConfig, smmApiUrl: e.target.value })}
                  />
                  {hasSmmError && (
                    <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 mt-2">
                      <p className="text-[10px] text-rose-600 font-bold uppercase tracking-widest leading-relaxed">
                        ⚠️ Railway/Server IP: <span className="bg-rose-200 px-1 rounded">{serverIp || 'Loading...'}</span>
                      </p>
                      <p className="text-[9px] text-rose-500 font-medium mt-1">
                        If you see 403 Forbidden: You MUST disable "IP Restriction" in your SMM Panel (mansmm.com) settings because Railway's IP changes.
                      </p>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">SMM API Key</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="password"
                      placeholder="Enter your SMM API Key"
                      className="flex-1 bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700 min-w-0"
                      value={appConfig.smmApiKey || ''}
                      onChange={(e) => setAppConfig({ ...appConfig, smmApiKey: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={handleCheckBalance}
                      disabled={checkingBalance || !appConfig.smmApiKey}
                      className="px-6 py-4 sm:py-0 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold text-xs transition-all disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      {checkingBalance ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                      Check Balance
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={savingConfig}
                className="w-full bg-cyan-500 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-cyan-200 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {savingConfig ? <Loader2 className="w-6 h-6 animate-spin" /> : <Save className="w-6 h-6" />}
                Save Configuration
              </button>
            </form>
          </div>
        )}

        {view === 'password_management' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Admin Pass</h2>
            
            <div className="max-w-2xl">
              {/* Change Admin Password */}
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-cyan-50 rounded-xl flex items-center justify-center">
                    <Lock className="w-5 h-5 text-cyan-500" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800">Change Admin Password</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Update access password</p>
                  </div>
                </div>

                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">New Password</label>
                    <input
                      type="password"
                      required
                      placeholder="Enter new password"
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Confirm New Password</label>
                    <input
                      type="password"
                      required
                      placeholder="Confirm new password"
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingAdminConfig}
                    className="w-full bg-cyan-500 text-white py-4 rounded-2xl font-black text-sm shadow-lg shadow-cyan-200 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {savingAdminConfig ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    Change Password
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {view === 'orders' && (
          <div className="space-y-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Order Management</h2>
                <div className="flex bg-slate-100 p-1 rounded-2xl self-start sm:self-auto">
                  <button 
                    onClick={() => { setOrderFilter('active'); setOrderSearchQuery(''); }}
                    className={`px-4 sm:px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${orderFilter === 'active' ? 'bg-white text-cyan-500 shadow-sm' : 'text-slate-400'}`}
                  >
                    Active
                  </button>
                  <button 
                    onClick={() => { setOrderFilter('history'); setOrderSearchQuery(''); }}
                    className={`px-4 sm:px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${orderFilter === 'history' ? 'bg-white text-cyan-500 shadow-sm' : 'text-slate-400'}`}
                  >
                    History
                  </button>
                </div>
                <button
                  onClick={handleSyncStatuses}
                  className="flex items-center gap-2 px-6 py-2 bg-cyan-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-cyan-100 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  <RefreshCcw className="w-4 h-4" />
                  Sync Statuses
                </button>
              </div>

              {/* Order Search Bar */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by status (Pending, Completed, etc.) or Order ID..."
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                  className="w-full bg-white border border-slate-100 rounded-2xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700 text-sm shadow-sm"
                />
              </div>
            </div>

            <div className="space-y-4">
              {allOrders
                .filter(o => !o.hiddenFromAdmin)
                .filter(o => {
                  const search = orderSearchQuery.toLowerCase();
                  if (search) {
                    return (
                      o.status.toLowerCase().includes(search) || 
                      o.id.toLowerCase().includes(search) ||
                      (o.userName && o.userName.toLowerCase().includes(search)) ||
                      (o.userEmail && o.userEmail.toLowerCase().includes(search))
                    );
                  }
                  // Default behavior: if no search, show Pending and Processing for active, and others for history
                  if (orderFilter === 'active') {
                    return o.status === 'Pending' || o.status === 'Processing';
                  }
                  return o.status === 'Completed' || o.status === 'Cancelled';
                })
                .length === 0 ? (
                <div className="bg-white p-12 rounded-[2.5rem] border border-dashed border-slate-200 text-center">
                  <ShoppingCart className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-400 font-bold">No orders found.</p>
                </div>
              ) : (
                allOrders
                  .filter(o => !o.hiddenFromAdmin)
                  .filter(o => {
                    const search = orderSearchQuery.toLowerCase();
                    if (search) {
                      return (
                        o.status.toLowerCase().includes(search) || 
                        o.id.toLowerCase().includes(search) ||
                        (o.userName && o.userName.toLowerCase().includes(search)) ||
                        (o.userEmail && o.userEmail.toLowerCase().includes(search))
                      );
                    }
                    if (orderFilter === 'active') {
                      return o.status === 'Pending' || o.status === 'Processing';
                    }
                    return o.status === 'Completed' || o.status === 'Cancelled';
                  })
                  .map((order) => (
                    <div key={order.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="bg-cyan-50 text-cyan-600 text-[10px] font-black px-2 py-0.5 rounded-full uppercase shrink-0">
                              {order.category}
                            </span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase shrink-0 ${
                              order.status === 'Completed' ? 'bg-emerald-50 text-emerald-500' :
                              order.status === 'Cancelled' ? 'bg-rose-50 text-rose-500' :
                              order.status === 'Processing' ? 'bg-amber-50 text-amber-500' :
                              'bg-slate-50 text-slate-500'
                            }`}>
                              {order.status}
                            </span>
                            {orderFilter === 'history' && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                                  <Clock className="w-3 h-3" />
                                  {order.pinned ? 'Pinned' : getCountdown(order.processedAt)}
                                </span>
                                <button 
                                  onClick={() => togglePin('orders', order.id, !!order.pinned)}
                                  className={`p-1 rounded-lg transition-all shrink-0 ${order.pinned ? 'bg-cyan-500 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                >
                                  {order.pinned ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
                                </button>
                              </div>
                            )}
                          </div>
                          <h3 className="font-black text-slate-800 text-lg truncate">{order.serviceName}</h3>
                          <div className="flex flex-col gap-0.5">
                            <p className="text-xs text-slate-400 font-bold truncate">
                              Order ID: #{order.id.slice(-6).toUpperCase()} {order.api_order_id && `(API: ${order.api_order_id})`}
                            </p>
                            {order.userName && (
                              <p className="text-xs text-cyan-600 font-black truncate">User: {order.userName} ({order.userEmail})</p>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <p className="text-xl font-black text-slate-800">{formatCurrency(order.totalCost)}</p>
                          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Total Cost</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50 p-4 rounded-2xl">
                          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Quantity</p>
                          <p className="font-black text-slate-800">{order.quantity}</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-2xl relative group">
                          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Target Link</p>
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-bold text-slate-800 text-sm truncate">{order.link}</p>
                            <button 
                              onClick={() => handleCopyLink(order.link)}
                              className="p-2 bg-white rounded-lg shadow-sm hover:text-cyan-500 transition-colors"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mark Order Status</label>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { label: 'Pending', color: 'bg-slate-100 text-slate-600' },
                            { label: 'Processing', color: 'bg-amber-100 text-amber-600' },
                            { label: 'Completed', color: 'bg-emerald-100 text-emerald-600' },
                            { label: 'Cancelled', color: 'bg-rose-100 text-rose-600' }
                          ].map((s) => (
                            <button
                              key={s.label}
                              onClick={() => handleUpdateOrderStatus(order.id, s.label)}
                              className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all ${
                                order.status === s.label ? s.color + ' ring-2 ring-offset-1 ring-slate-200' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                              }`}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}

        {view === 'payments' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Payment Management</h2>
                <button
                  onClick={() => setShowPaymentSettings(true)}
                  className="p-2.5 bg-white border border-slate-100 text-slate-600 rounded-xl hover:text-cyan-500 hover:bg-slate-50 active:scale-95 transition-all shadow-sm flex items-center gap-1.5"
                  title="Payment Verification Settings"
                >
                  <Settings className="w-4 h-4 text-slate-500" />
                  <span className="text-[10px] font-black uppercase tracking-wider">Verification Settings</span>
                </button>
              </div>
              <div className="flex bg-slate-100 p-1 rounded-2xl self-start sm:self-auto">
                <button 
                  onClick={() => setPaymentFilter('active')}
                  className={`px-4 sm:px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${paymentFilter === 'active' ? 'bg-white text-cyan-500 shadow-sm' : 'text-slate-400'}`}
                >
                  Active
                </button>
                <button 
                  onClick={() => setPaymentFilter('history')}
                  className={`px-4 sm:px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${paymentFilter === 'history' ? 'bg-white text-cyan-500 shadow-sm' : 'text-slate-400'}`}
                >
                  History
                </button>
              </div>
            </div>

            {/* Payment Verification Settings Modal */}
            <AnimatePresence>
              {showPaymentSettings && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  {/* Backdrop */}
                  <motion.div
                    className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowPaymentSettings(false)}
                  />

                  {/* Modal Content */}
                  <motion.div
                    className="relative bg-white w-full max-w-2xl rounded-[2.5rem] p-6 sm:p-8 border border-slate-100 shadow-2xl space-y-6 overflow-y-auto max-h-[90vh] custom-scrollbar z-10"
                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 15 }}
                    transition={{ type: "spring", duration: 0.4 }}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <span className="p-2.5 bg-cyan-50 text-cyan-500 rounded-2xl border border-cyan-100 flex items-center justify-center">
                          <Settings className="w-5 h-5 shrink-0" />
                        </span>
                        <div>
                          <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider">Payment Verification Settings</h3>
                          <p className="text-xs text-slate-400 font-bold leading-relaxed">Configure how transaction IDs are verified when users request to add funds</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowPaymentSettings(false)}
                        className="p-1 px-3 bg-slate-50 border border-slate-100 rounded-xl font-black text-slate-400 text-xs uppercase hover:bg-slate-100 hover:text-slate-600 transition-all font-mono"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Sys Deployment Status Indicator Banner */}
                    <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </span>
                        <div>
                          <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Active Mode Status</span>
                          <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest mt-0.5">
                            Active route: <span className="text-cyan-500 font-extrabold">{(appConfig.paymentVerificationMethod || 'manual') === 'automatic' ? 'Automatic (GMAIL IMAP)' : 'Manual (Admin Review)'}</span>
                          </h4>
                        </div>
                      </div>
                      <div className="px-3 py-1 bg-emerald-50 text-emerald-600 font-black text-[9px] uppercase tracking-wider rounded-lg border border-emerald-100 font-mono">
                        Active & Safe
                      </div>
                    </div>

                    {/* Verification Method Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Manual Card */}
                      <button
                        type="button"
                        onClick={() => handleUpdatePaymentMethod('manual')}
                        className={`relative p-6 rounded-2xl border text-left transition-all duration-300 flex flex-col justify-between overflow-hidden group ${
                          tempSelectedMethod === 'manual'
                            ? 'border-indigo-500 bg-indigo-50/10 shadow-lg shadow-indigo-100/10 ring-2 ring-indigo-500/10'
                            : 'border-slate-100 hover:border-slate-200 bg-slate-50/30'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-4">
                          <span className={`p-3 bg-white shadow-sm border rounded-xl transition-all ${tempSelectedMethod === 'manual' ? 'border-indigo-100 text-indigo-500' : 'border-slate-100 text-slate-400'}`}>
                            <CreditCard className="w-5 h-5" />
                          </span>
                          {tempSelectedMethod === 'manual' ? (
                            <span className="bg-indigo-500 text-white p-1 rounded-full text-xs shadow-sm shadow-indigo-200">
                              <Check className="w-3.5 h-3.5" />
                            </span>
                          ) : (
                            <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider bg-slate-100 px-2 py-0.5 rounded-md">
                              Inactive
                            </span>
                          )}
                        </div>
                        <div>
                          <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">1. Manual Verification</h4>
                          <p className="text-[10px] text-slate-400 font-bold mt-1.5 leading-relaxed">
                            Users submit Transaction IDs. Panel holds requests as pending for manual review. Admin verifies and updates user balance manually inside panel.
                          </p>
                        </div>
                      </button>

                      {/* Automatic Card */}
                      <button
                        type="button"
                        onClick={() => handleUpdatePaymentMethod('automatic')}
                        className={`relative p-6 rounded-2xl border text-left transition-all duration-300 flex flex-col justify-between overflow-hidden group ${
                          tempSelectedMethod === 'automatic'
                            ? 'border-cyan-500 bg-cyan-50/10 shadow-lg shadow-cyan-100/10 ring-2 ring-cyan-500/10'
                            : 'border-slate-100 hover:border-slate-200 bg-slate-50/30'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-4">
                          <span className={`p-3 bg-white shadow-sm border rounded-xl transition-all ${tempSelectedMethod === 'automatic' ? 'border-cyan-100 text-cyan-500' : 'border-slate-100 text-slate-400'}`}>
                            <Zap className={`w-5 h-5 ${tempSelectedMethod === 'automatic' ? 'animate-pulse text-cyan-500' : ''}`} />
                          </span>
                          {tempSelectedMethod === 'automatic' ? (
                            <span className="bg-cyan-500 text-white p-1 rounded-full text-xs shadow-sm shadow-cyan-200">
                              <Check className="w-3.5 h-3.5" />
                            </span>
                          ) : (
                            <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider bg-slate-100 px-2 py-0.5 rounded-md">
                              Inactive
                            </span>
                          )}
                        </div>
                        <div>
                          <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">2. Automatic Verification</h4>
                          <p className="text-[10px] text-slate-400 font-bold mt-1.5 leading-relaxed">
                            Instant verification via Gmail. Server logs into specified Gmail address via secure IMAP client to double check transaction logs instantly.
                          </p>
                        </div>
                      </button>
                    </div>

                    {/* Automatic configuration inputs, visible when tempSelectedMethod is automatic */}
                    {tempSelectedMethod === 'automatic' && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4 pt-5 border-t border-slate-100"
                      >
                        {/* Interactive App Password Instruction Manual */}
                        <div className="bg-cyan-50/50 border border-cyan-100/50 rounded-2xl p-4 sm:p-5 space-y-3">
                          <div className="flex items-center gap-1.5 text-cyan-600 font-extrabold text-[11px] uppercase tracking-wider">
                            <Info className="w-4 h-4 shrink-0 text-cyan-500" />
                            <span>Quick Google App Password Setup Guide</span>
                          </div>
                          <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-500 font-bold pl-0.5">
                            <li>Open Google Account Settings and head over to the <span className="text-slate-700">"Security"</span> tab.</li>
                            <li>Ensure that <span className="text-slate-700">"2-Step Verification"</span> is switched on.</li>
                            <li>Search for <span className="font-mono text-cyan-600 bg-cyan-100/40 px-1 rounded">"App Passwords"</span> in the search bar.</li>
                            <li>Select <span className="text-slate-700">"Other (Custom Name)"</span>, name it <span className="font-mono text-slate-705">"SMM Verification"</span>, and copy the generated 16-digit code.</li>
                            <li>Paste the code inside the password slot below!</li>
                          </ol>
                        </div>

                        <form onSubmit={handleSaveVerificationCreds} className="space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Verification Gmail Address</label>
                              <input
                                type="email"
                                required
                                placeholder="example@gmail.com"
                                className="w-full bg-slate-50 focus:bg-white border border-slate-100 hover:border-slate-200 rounded-2xl py-3.5 px-5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700 transition-all"
                                value={verificationEmail}
                                onChange={(e) => setVerificationEmail(e.target.value)}
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">16-Digit App Password</label>
                              <div className="relative">
                                <input
                                  type={showAppPassword ? "text" : "password"}
                                  required
                                  placeholder="16-digit Google App Password"
                                  className="w-full bg-slate-50 focus:bg-white border border-slate-100 hover:border-slate-200 rounded-2xl py-3.5 pl-5 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700 tracking-widest font-mono transition-all"
                                  value={emailAppPassword}
                                  onChange={(e) => setEmailAppPassword(e.target.value)}
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowAppPassword(!showAppPassword)}
                                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
                                  title={showAppPassword ? "Hide App Password" : "Show App Password"}
                                >
                                  {showAppPassword ? (
                                    <EyeOff className="w-5 h-5" />
                                  ) : (
                                    <Eye className="w-5 h-5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>

                          <button
                            type="submit"
                            disabled={savingVerificationCreds}
                            className="w-full bg-cyan-500 hover:bg-cyan-600 active:scale-[0.99] hover:shadow-cyan-100/60 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-cyan-100 flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                          >
                            {savingVerificationCreds ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save & Activate Automatic Mode
                          </button>
                        </form>
                      </motion.div>
                    )}
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            <div className="space-y-4">
              {fundRequests
                .filter(r => !r.hiddenFromAdmin)
                .filter(r => paymentFilter === 'active' ? r.status === 'Pending' : (r.status === 'Approved' || r.status === 'Rejected'))
                .length === 0 ? (
                <div className="bg-white p-12 rounded-[2.5rem] border border-dashed border-slate-200 text-center">
                  <CreditCard className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-400 font-bold">No payment requests found.</p>
                </div>
              ) : (
                fundRequests
                  .filter(r => !r.hiddenFromAdmin)
                  .filter(r => paymentFilter === 'active' ? r.status === 'Pending' : (r.status === 'Approved' || r.status === 'Rejected'))
                  .map((request) => (
                    <div key={request.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase shrink-0 ${
                              request.status === 'Approved' ? 'bg-emerald-50 text-emerald-500' :
                              request.status === 'Rejected' ? 'bg-rose-50 text-rose-500' :
                              'bg-amber-50 text-amber-500'
                            }`}>
                              {request.status}
                            </span>
                            {request.verifiedAutomatically && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase bg-cyan-50 text-cyan-500 flex items-center gap-1">
                                <Check className="w-2 h-2" />
                                Auto-Verified
                              </span>
                            )}
                            {paymentFilter === 'history' && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                                  <Clock className="w-3 h-3" />
                                  {request.pinned ? 'Pinned' : getCountdown(request.processedAt)}
                                </span>
                                <button 
                                  onClick={() => togglePin('fundRequests', request.id, !!request.pinned)}
                                  className={`p-1 rounded-lg transition-all shrink-0 ${request.pinned ? 'bg-cyan-500 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                >
                                  {request.pinned ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
                                </button>
                              </div>
                            )}
                          </div>
                          <h3 className="font-black text-slate-800 text-lg truncate">{request.userName || 'Unknown User'}</h3>
                          <p className="text-xs text-slate-500 font-bold truncate">{request.userEmail || 'No Email'}</p>
                          <p className="text-xs text-slate-400 font-bold truncate">Request ID: {request.id}</p>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <p className="text-xl font-black text-slate-800">{formatCurrency(request.amount)}</p>
                          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Requested Amount</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50 p-4 rounded-2xl">
                          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Transaction ID</p>
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-mono font-bold text-slate-800 text-sm truncate">{request.transactionId}</p>
                            <button 
                              onClick={() => handleCopyLink(request.transactionId)}
                              className="p-1.5 bg-white rounded-lg shadow-sm hover:text-cyan-500 transition-colors"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-2xl">
                          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Date</p>
                          <p className="font-bold text-slate-800 text-sm">
                            {request.createdAt?.toDate ? request.createdAt.toDate().toLocaleString() : 'Just now'}
                          </p>
                        </div>
                      </div>

                      {request.status === 'Pending' && (
                        <div className="grid grid-cols-2 gap-3 pt-2">
                          <button
                            onClick={() => handleUpdatePaymentStatus(request.id, 'Rejected')}
                            className="bg-rose-50 text-rose-600 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-100 transition-all"
                          >
                            Reject / Cancel
                          </button>
                          <button
                            onClick={() => handleUpdatePaymentStatus(request.id, 'Approved')}
                            className="bg-emerald-500 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-100 hover:scale-[1.02] active:scale-[0.98] transition-all"
                          >
                            Complete / Approve
                          </button>
                        </div>
                      )}
                    </div>
                  ))
              )}
            </div>
          </div>
        )}

        {view === 'notifications' && (
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">Send Notification</h2>
              
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Banner Image URL (Optional)</label>
                  <input
                    type="text"
                    placeholder="https://example.com/image.jpg"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700"
                    value={notificationForm.bannerUrl}
                    onChange={(e) => setNotificationForm({ ...notificationForm, bannerUrl: e.target.value })}
                  />
                </div>

                {notificationForm.bannerUrl && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Action Link (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. https://youtube.com/video or app link"
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700"
                      value={notificationForm.actionUrl}
                      onChange={(e) => setNotificationForm({ ...notificationForm, actionUrl: e.target.value })}
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Title</label>
                  <input
                    type="text"
                    placeholder="Notification Title"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700"
                    value={notificationForm.title}
                    onChange={(e) => setNotificationForm({ ...notificationForm, title: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Message</label>
                  <textarea
                    rows={3}
                    placeholder="Type your message here..."
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700 resize-none"
                    value={notificationForm.message}
                    onChange={(e) => setNotificationForm({ ...notificationForm, message: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Target Audience</label>
                  <div className="flex bg-slate-100 p-1 rounded-2xl">
                    <button 
                      onClick={() => setNotificationForm({ ...notificationForm, targetType: 'all' })}
                      className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${notificationForm.targetType === 'all' ? 'bg-white text-cyan-500 shadow-sm' : 'text-slate-400'}`}
                    >
                      All Users
                    </button>
                    <button 
                      onClick={() => setNotificationForm({ ...notificationForm, targetType: 'specific' })}
                      className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${notificationForm.targetType === 'specific' ? 'bg-white text-cyan-500 shadow-sm' : 'text-slate-400'}`}
                    >
                      Specific Users
                    </button>
                  </div>
                </div>

                {notificationForm.targetType === 'specific' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Select Users ({notificationForm.selectedUsers.length} selected)</label>
                    <div className="max-h-40 overflow-y-auto bg-slate-50 rounded-2xl p-2 space-y-1 border border-slate-100">
                      {users.map(u => (
                        <label key={u.id} className="flex items-center gap-3 p-2 hover:bg-white rounded-xl cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded text-cyan-500 focus:ring-cyan-500/20"
                            checked={notificationForm.selectedUsers.includes(u.id)}
                            onChange={(e) => {
                              const selected = e.target.checked 
                                ? [...notificationForm.selectedUsers, u.id]
                                : notificationForm.selectedUsers.filter(id => id !== u.id);
                              setNotificationForm({ ...notificationForm, selectedUsers: selected });
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-700 truncate">{u.name || 'User'}</p>
                            <p className="text-[10px] text-slate-400 font-bold truncate">{u.email}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => {
                    if (!notificationForm.title || !notificationForm.message) {
                      return Swal.fire({ icon: 'error', title: 'Missing Info', text: 'Title and Message are required.' });
                    }
                    if (notificationForm.targetType === 'specific' && notificationForm.selectedUsers.length === 0) {
                      return Swal.fire({ icon: 'error', title: 'No Users Selected', text: 'Please select at least one user.' });
                    }
                    handleSendNotification(notificationForm);
                    setNotificationForm({ title: '', message: '', bannerUrl: '', actionUrl: '', targetType: 'all', selectedUsers: [] });
                  }}
                  className="w-full bg-cyan-500 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-cyan-100 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  Send Notification
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-black text-slate-800 ml-1">Recent Notifications</h3>
              {adminNotifications.length === 0 ? (
                <div className="bg-white p-12 rounded-[2.5rem] border border-dashed border-slate-200 text-center">
                  <Bell className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-400 font-bold">No notifications sent yet.</p>
                </div>
              ) : (
                adminNotifications.map(n => (
                  <div key={n.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${n.isGlobal ? 'bg-cyan-50 text-cyan-500' : 'bg-slate-50 text-slate-500'}`}>
                            {n.isGlobal ? 'Global' : 'Specific'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold">
                            {n.createdAt?.toDate ? n.createdAt.toDate().toLocaleString() : 'Just now'}
                          </span>
                        </div>
                        <h4 className="font-black text-slate-800">{n.title}</h4>
                        <p className="text-sm text-slate-500 font-medium line-clamp-2">{n.message}</p>
                        {n.actionUrl && (
                          <p className="text-[10px] text-cyan-600 font-bold truncate mt-1">Link: {n.actionUrl}</p>
                        )}
                      </div>
                      <button 
                        onClick={() => handleDeleteNotification(n.id)}
                        className="p-2 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-100 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {n.bannerUrl && (
                      <div className="rounded-xl overflow-hidden border border-slate-100">
                        <img src={n.bannerUrl} alt="Banner" className="w-full h-auto block" referrerPolicy="no-referrer" />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {view === 'user_management' && (
          <div className="space-y-6">
            <div className="flex flex-col gap-4">
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">User Management</h2>
              
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="w-full bg-white border border-slate-100 rounded-2xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700 text-sm shadow-sm"
                />
              </div>
            </div>

            <div className="space-y-4">
              {users
                .filter(u => {
                  const search = userSearchQuery.toLowerCase();
                  return (u.name || '').toLowerCase().includes(search) || (u.email || '').toLowerCase().includes(search);
                })
                .length === 0 ? (
                <div className="bg-white p-12 rounded-[2.5rem] border border-dashed border-slate-200 text-center">
                  <Users className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-400 font-bold">No users found.</p>
                </div>
              ) : (
                users
                  .filter(u => {
                    const search = userSearchQuery.toLowerCase();
                    return (u.name || '').toLowerCase().includes(search) || (u.email || '').toLowerCase().includes(search);
                  })
                  .map((u) => (
                    <div key={u.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                          <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100 overflow-hidden">
                            {u.photoURL ? (
                              <img src={u.photoURL} alt={u.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <Users className="w-6 h-6 text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-black text-slate-800 text-lg truncate">{u.name || 'User'}</h3>
                            <div className="space-y-0.5">
                              <p className="text-xs text-slate-500 font-bold flex items-center gap-1.5">
                                <Mail className="w-3 h-3 opacity-40 shrink-0" />
                                <span className="truncate">{u.email}</span>
                              </p>
                              {u.phone && (
                                <p className="text-xs text-slate-500 font-bold flex items-center gap-1.5">
                                  <Phone className="w-3 h-3 opacity-40 shrink-0" />
                                  <span className="truncate">{u.phone}</span>
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${u.isBlocked ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-500'}`}>
                                {u.isBlocked ? 'Blocked' : 'Active'}
                              </span>
                              <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">
                                ID: {u.id.slice(0, 8)}...
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <p className="text-xl font-black text-slate-800">{formatCurrency(u.walletBalance || 0)}</p>
                          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Wallet Balance</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 pt-2">
                        <button
                          onClick={() => handleUpdateUserBalance(u.id, u.walletBalance || 0)}
                          className="flex flex-col items-center justify-center gap-1 p-3 bg-slate-50 text-slate-600 rounded-2xl hover:bg-slate-100 transition-all group"
                        >
                          <Edit className="w-4 h-4 group-hover:text-cyan-500" />
                          <span className="text-[10px] font-black uppercase">Edit</span>
                        </button>
                        <button
                          onClick={() => handleToggleUserBlock(u.id, !!u.isBlocked)}
                          className={`flex flex-col items-center justify-center gap-1 p-3 rounded-2xl transition-all group ${u.isBlocked ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-rose-50 text-rose-600 hover:bg-rose-100'}`}
                        >
                          {u.isBlocked ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
                          <span className="text-[10px] font-black uppercase">{u.isBlocked ? 'Unblock' : 'Block'}</span>
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          className="flex flex-col items-center justify-center gap-1 p-3 bg-slate-50 text-slate-600 rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition-all group"
                        >
                          <UserMinus className="w-4 h-4" />
                          <span className="text-[10px] font-black uppercase">Delete</span>
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}

        {view === 'security_monitor' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">Security Monitor</h2>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <button
                  onClick={handleUpdateLimitHours}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-cyan-50 text-cyan-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-cyan-100 transition-all"
                >
                  <Clock className="w-4 h-4" />
                  Limit: {signupLimitHours}h
                </button>
                <button
                  onClick={handleRefreshSecurity}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-100 transition-all"
                >
                  <RefreshCcw className="w-4 h-4" />
                  Refresh
                </button>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="w-5 h-5 text-slate-400 group-focus-within:text-cyan-500 transition-colors" />
              </div>
              <input
                type="text"
                placeholder="Search by Name, Email, or Min Accounts (e.g. '2' for 3+ accounts)..."
                value={securitySearchQuery}
                onChange={(e) => setSecuritySearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-white border border-slate-100 rounded-[1.5rem] focus:outline-none focus:ring-4 focus:ring-cyan-500/10 focus:border-cyan-500 transition-all font-bold text-slate-600 placeholder:text-slate-300 shadow-sm"
              />
            </div>

            <div className="space-y-4">
              {(() => {
                const filtered = securityTracking.filter(record => {
                  if (!securitySearchQuery) return true;
                  const query = securitySearchQuery.toLowerCase().trim();
                  
                  // Check if query is a number
                  const queryNum = parseInt(query);
                  if (!isNaN(queryNum) && query.match(/^\d+$/)) {
                    return (record.count || 0) > queryNum;
                  }
                  
                  // Search in accounts
                  const hasMatchingAccount = record.accounts?.some((acc: any) => {
                    if (typeof acc === 'object') {
                      return (
                        acc.name?.toLowerCase().includes(query) ||
                        acc.email?.toLowerCase().includes(query) ||
                        acc.uid?.toLowerCase().includes(query)
                      );
                    }
                    return acc.toString().toLowerCase().includes(query);
                  });
                  
                  return (
                    hasMatchingAccount ||
                    record.deviceId?.toLowerCase().includes(query) ||
                    record.ip?.toLowerCase().includes(query)
                  );
                });

                if (filtered.length === 0) {
                  return (
                    <div className="bg-white p-12 rounded-[2.5rem] border border-dashed border-slate-200 text-center">
                      <ShieldCheck className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                      <p className="text-slate-400 font-bold">No matching records found.</p>
                    </div>
                  );
                }

                return filtered.map((record) => (
                  <div key={record.id} className="bg-white p-5 sm:p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="space-y-2 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[9px] font-black text-cyan-500 bg-cyan-50 px-2 py-0.5 rounded-full uppercase tracking-widest shrink-0">
                            Device ID
                          </span>
                          <p className="font-mono text-[10px] sm:text-xs text-slate-600 truncate bg-slate-50 px-2 py-1 rounded-lg flex-1">{record.deviceId}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[9px] font-black text-purple-500 bg-purple-50 px-2 py-0.5 rounded-full uppercase tracking-widest shrink-0">
                            IP Address
                          </span>
                          <p className="font-mono text-[10px] sm:text-xs text-slate-600 truncate bg-slate-50 px-2 py-1 rounded-lg flex-1">{record.ip}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-end sm:self-start bg-slate-50 p-1 rounded-2xl shrink-0">
                        <button
                          onClick={() => handleTogglePinDevice(record.deviceId, !!pinnedDevices[record.deviceId])}
                          className={`p-2.5 rounded-xl transition-all ${pinnedDevices[record.deviceId] ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-200' : 'text-slate-400 hover:bg-white hover:text-cyan-500'}`}
                          title={pinnedDevices[record.deviceId] ? 'Unpin Device' : 'Pin Device'}
                        >
                          <Pin className={`w-4 h-4 sm:w-5 sm:h-5 ${pinnedDevices[record.deviceId] ? 'fill-current' : ''}`} />
                        </button>
                        <button
                          onClick={() => handleDeleteTrackingRecord(record.id, record.deviceId, record.ip)}
                          className="p-2.5 rounded-xl text-slate-400 hover:bg-white hover:text-rose-500 transition-all"
                          title="Delete Record"
                        >
                          <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-slate-50 p-4 rounded-2xl">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Accounts ({record.count || 1})</p>
                          {record.count > 1 && <span className="text-[10px] font-black text-emerald-500 bg-emerald-50 px-1.5 rounded">Multiple</span>}
                        </div>
                        <p className="font-bold text-slate-800 text-xs truncate">
                          {(() => {
                            const lastAcc = record.accounts && record.accounts.length > 0 
                              ? record.accounts[record.accounts.length - 1] 
                              : record.createdAccount;
                            
                            if (!lastAcc) return 'N/A';
                            if (typeof lastAcc === 'object') return lastAcc.name || lastAcc.uid;
                            return lastAcc;
                          })()}
                        </p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-2xl">
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Last Signup</p>
                        <p className="font-bold text-slate-800 text-xs">
                          {new Date(record.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    
                    {record.accounts && record.accounts.length > 0 && (
                      <div className="pt-2 border-t border-slate-100">
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2">All Accounts on this Device</p>
                        <div className="space-y-2">
                          {record.accounts.map((acc: any, idx: number) => {
                            const isObject = typeof acc === 'object';
                            const uid = isObject ? acc.uid : acc;
                            return (
                              <div key={idx} className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[9px] font-mono text-slate-400">UID: {uid.slice(0, 10)}...</span>
                                  {isObject && acc.timestamp && (
                                    <span className="text-[9px] text-slate-400">{new Date(acc.timestamp).toLocaleDateString()}</span>
                                  )}
                                </div>
                                {isObject ? (
                                  <div className="grid grid-cols-1 gap-1">
                                    <div className="flex items-center gap-2">
                                      <User className="w-3 h-3 text-cyan-500" />
                                      <p className="text-xs font-bold text-slate-700">{acc.name}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Mail className="w-3 h-3 text-purple-500" />
                                      <p className="text-xs text-slate-600">{acc.email}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Phone className="w-3 h-3 text-emerald-500" />
                                      <p className="text-xs text-slate-600">{acc.phone}</p>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-xs text-slate-600 italic">Old record - no details available</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              })()}
            </div>
          </div>
        )}

        {view === 'referral_management' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">Referral Management</h2>
              <button
                onClick={handleUpdateReferralReward}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-cyan-200"
              >
                <Gift className="w-4 h-4" />
                Set Reward: {referralReward} Coins
              </button>
            </div>

            <div className="space-y-4">
              {referralLogs.filter(l => !l.hiddenFromAdmin).length === 0 ? (
                <div className="bg-white p-12 rounded-[2.5rem] border border-dashed border-slate-200 text-center">
                  <Gift className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-400 font-bold">No referral records found.</p>
                </div>
              ) : (
                referralLogs.filter(l => !l.hiddenFromAdmin).map((log) => (
                  <div key={log.id} className={`bg-white p-6 rounded-[2rem] border shadow-sm space-y-6 transition-all ${log.pinned ? 'border-amber-200 ring-2 ring-amber-100' : 'border-slate-100'}`}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full animate-pulse ${log.pinned ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            {new Date(log.time).toLocaleString()}
                          </p>
                        </div>
                        {!log.pinned && (
                          <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full">
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                              {getReferralTimeLeft(log.time)}
                            </span>
                          </div>
                        )}
                        {log.pinned && (
                          <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 rounded-full">
                            <Pin className="w-3 h-3 text-amber-500 fill-amber-500" />
                            <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">
                              Pinned
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleTogglePinReferral(log.id, !!log.pinned)}
                            className={`p-2 rounded-xl transition-all ${log.pinned ? 'bg-amber-100 text-amber-600' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                          >
                            <Pin className={`w-4 h-4 ${log.pinned ? 'fill-amber-600' : ''}`} />
                          </button>
                          <button
                            onClick={() => handleDeleteReferral(log.id)}
                            className="p-2 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-100 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                          Reward: {log.reward} Coins
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Referrer Info */}
                      <div className="space-y-3">
                        <p className="text-[10px] font-black text-cyan-500 uppercase tracking-widest flex items-center gap-2">
                          <User className="w-3 h-3" />
                          Referrer (Old User)
                        </p>
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-600 font-bold text-xs uppercase">
                              {log.referrer.name?.[0] || 'U'}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800">{log.referrer.name}</p>
                              <p className="text-[10px] text-slate-500">{log.referrer.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-2 border-t border-slate-200/50">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <p className="text-xs font-medium text-slate-600">{log.referrer.phone || 'No Phone'}</p>
                          </div>
                        </div>
                      </div>

                      {/* New User Info */}
                      <div className="space-y-3">
                        <p className="text-[10px] font-black text-purple-500 uppercase tracking-widest flex items-center gap-2">
                          <Plus className="w-3 h-3" />
                          Referred (New User)
                        </p>
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-xs uppercase">
                              {log.newUser.name?.[0] || 'U'}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800">{log.newUser.name}</p>
                              <p className="text-[10px] text-slate-500">{log.newUser.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-2 border-t border-slate-200/50">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <p className="text-xs font-medium text-slate-600">{log.newUser.phone || 'No Phone'}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {view === 'daily_giveaway' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">Daily Giveaway</h2>
              <button
                onClick={() => {
                  setEditingGiveaway(null);
                  setGiveawayForm({
                    category: '',
                    serviceId: '',
                    quantity: '',
                    maxUsers: '',
                    refresh24h: true,
                    enabled: true
                  });
                  setShowGiveawayModal(true);
                }}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-cyan-200"
              >
                <Plus className="w-4 h-4" />
                Create Giveaway
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {giveaways.length === 0 ? (
                <div className="bg-white p-12 rounded-[2.5rem] border border-dashed border-slate-200 text-center">
                  <Gift className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-400 font-bold">No giveaways created yet.</p>
                </div>
              ) : (
                giveaways.map((giveaway) => (
                  <div key={giveaway.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-2xl">
                          {giveaway.categoryIcon}
                        </div>
                        <div>
                          <h3 className="font-black text-slate-800">{giveaway.serviceName}</h3>
                          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{giveaway.category}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingGiveaway(giveaway);
                            setGiveawayForm({
                              category: giveaway.category,
                              serviceId: giveaway.serviceId,
                              quantity: giveaway.quantity.toString(),
                              maxUsers: giveaway.maxUsers.toString(),
                              refresh24h: giveaway.refresh24h,
                              enabled: giveaway.enabled
                            });
                            setShowGiveawayModal(true);
                          }}
                          className="p-2 bg-slate-50 text-slate-400 hover:text-cyan-500 rounded-xl transition-all"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleGiveawayStatus(giveaway.id, giveaway.enabled)}
                          className={`p-2 rounded-xl transition-all ${giveaway.enabled ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'}`}
                        >
                          {giveaway.enabled ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleDeleteGiveaway(giveaway.id)}
                          className="p-2 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-100 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-slate-50 p-3 rounded-xl">
                        <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Quantity</p>
                        <p className="font-bold text-slate-700">{giveaway.quantity}</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl">
                        <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Max Users</p>
                        <p className="font-bold text-slate-700">{giveaway.maxUsers}</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl">
                        <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Participants</p>
                        <p className="font-bold text-slate-700">{(giveawayParticipants[giveaway.id] || []).length}</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl">
                        <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">24h Refresh</p>
                        <p className={`font-bold ${giveaway.refresh24h ? 'text-emerald-500' : 'text-slate-400'}`}>
                          {giveaway.refresh24h ? 'Enabled' : 'Disabled'}
                        </p>
                      </div>
                    </div>

                    {(giveawayParticipants[giveaway.id] || []).length > 0 && (
                      <div className="pt-4 border-t border-slate-50">
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-3">Recent Participants</p>
                        <div className="flex flex-wrap gap-2">
                          {(giveawayParticipants[giveaway.id] || []).slice(0, 10).map((p, idx) => (
                            <div key={idx} className="bg-slate-50 px-3 py-1 rounded-full flex items-center gap-2 border border-slate-100">
                              <User className="w-3 h-3 text-cyan-500" />
                              <span className="text-xs font-bold text-slate-600">{p.userName}</span>
                            </div>
                          ))}
                          {(giveawayParticipants[giveaway.id] || []).length > 10 && (
                            <div className="bg-slate-50 px-3 py-1 rounded-full text-xs font-bold text-slate-400 border border-slate-100">
                              +{(giveawayParticipants[giveaway.id] || []).length - 10} more
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {view === 'spinner_management' && renderSpinnerManagement()}
      </div>
      {view === 'ai_assistant' && renderAiAssistant()}

      {/* Category Modal */}
      <AnimatePresence>
        {showServiceModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowServiceModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] p-8 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">
                  {editingService ? 'Edit Service' : 'New Service'}
                </h3>
                <button onClick={() => setShowServiceModal(false)} className="p-2 hover:bg-slate-100 rounded-full">
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <form onSubmit={handleSaveService} className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Category</label>
                  <input
                    required
                    placeholder="e.g. Instagram"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700"
                    value={serviceForm.category}
                    onChange={(e) => setServiceForm({ ...serviceForm, category: e.target.value })}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Services</label>
                    {!editingService && (
                      <button 
                        type="button"
                        onClick={addServiceItem}
                        className="text-xs font-black text-cyan-500 hover:text-cyan-600 flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add More
                      </button>
                    )}
                  </div>

                  {serviceForm.items.map((item, index) => (
                    <div key={index} className="p-4 bg-slate-50 rounded-3xl border border-slate-100 space-y-4 relative">
                      {serviceForm.items.length > 1 && !editingService && (
                        <button 
                          type="button"
                          onClick={removeServiceItem(index)}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                      
                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2 space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Service Name</label>
                          <input
                            required
                            placeholder="e.g. Real Followers"
                            className="w-full bg-white border border-slate-100 rounded-xl py-2 px-3 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700 text-sm"
                            value={item.name}
                            onChange={(e) => updateServiceItem(index, 'name', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Emoji</label>
                          <input
                            placeholder="👥"
                            className="w-full bg-white border border-slate-100 rounded-xl py-2 px-3 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700 text-sm text-center"
                            value={item.emoji}
                            onChange={(e) => updateServiceItem(index, 'emoji', e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Description</label>
                        <textarea
                          placeholder="Describe the service..."
                          rows={2}
                          className="w-full bg-white border border-slate-100 rounded-xl py-2 px-3 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700 text-sm resize-none"
                          value={item.description}
                          onChange={(e) => updateServiceItem(index, 'description', e.target.value)}
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Price</label>
                          <input
                            required
                            type="number"
                            step="0.01"
                            placeholder="0.50"
                            className="w-full bg-white border border-slate-100 rounded-xl py-2 px-3 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700 text-sm"
                            value={item.pricePerUnit}
                            onChange={(e) => updateServiceItem(index, 'pricePerUnit', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Min</label>
                          <input
                            required
                            type="number"
                            placeholder="10"
                            className="w-full bg-white border border-slate-100 rounded-xl py-2 px-3 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700 text-sm"
                            value={item.minQty}
                            onChange={(e) => updateServiceItem(index, 'minQty', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Max</label>
                          <input
                            required
                            type="number"
                            placeholder="1000"
                            className="w-full bg-white border border-slate-100 rounded-xl py-2 px-3 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700 text-sm"
                            value={item.maxQty}
                            onChange={(e) => updateServiceItem(index, 'maxQty', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">API ID</label>
                          <input
                            placeholder="e.g. 123"
                            className="w-full bg-white border border-slate-100 rounded-xl py-2 px-3 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700 text-sm"
                            value={item.api_service_id}
                            onChange={(e) => updateServiceItem(index, 'api_service_id', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="submit"
                  className="w-full bg-cyan-500 text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-cyan-200 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  {editingService ? 'Update Service' : `Create ${serviceForm.items.length} Service${serviceForm.items.length > 1 ? 's' : ''}`}
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {showGiveawayModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowGiveawayModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] p-8 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">
                  {editingGiveaway ? 'Edit Giveaway' : 'New Giveaway'}
                </h3>
                <button onClick={() => setShowGiveawayModal(false)} className="p-2 hover:bg-slate-100 rounded-full">
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <form onSubmit={handleSaveGiveaway} className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Select Category</label>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search category..."
                      className="w-full bg-slate-50 border border-slate-100 rounded-t-2xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700 text-sm"
                      value={catSearch}
                      onChange={(e) => setCatSearch(e.target.value)}
                    />
                  </div>
                  <select
                    required
                    className="w-full bg-slate-50 border border-slate-100 rounded-b-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700"
                    value={giveawayForm.category}
                    onChange={(e) => {
                      setGiveawayForm({ ...giveawayForm, category: e.target.value, serviceId: '' });
                      setSvcSearch('');
                    }}
                  >
                    <option value="">Choose a category...</option>
                    {(categories.length > 0 ? categories : [...new Set(services.map(s => s.category))].map(name => ({ id: name, name })))
                      .filter(cat => cat.name.toLowerCase().includes(catSearch.toLowerCase()))
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map(cat => (
                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                      ))
                    }
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Select Service</label>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      disabled={!giveawayForm.category}
                      placeholder="Search service..."
                      className="w-full bg-slate-50 border border-slate-100 rounded-t-2xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700 text-sm disabled:opacity-50"
                      value={svcSearch}
                      onChange={(e) => setSvcSearch(e.target.value)}
                    />
                  </div>
                  <select
                    required
                    disabled={!giveawayForm.category}
                    className="w-full bg-slate-50 border border-slate-100 rounded-b-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700 disabled:opacity-50"
                    value={giveawayForm.serviceId}
                    onChange={(e) => setGiveawayForm({ ...giveawayForm, serviceId: e.target.value })}
                  >
                    <option value="">Choose a service...</option>
                    {services
                      .filter(s => s.category === giveawayForm.category && s.name.toLowerCase().includes(svcSearch.toLowerCase()))
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map(service => (
                        <option key={service.id} value={service.id}>{service.name}</option>
                      ))
                    }
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Quantity</label>
                    <input
                      required
                      type="number"
                      placeholder="e.g. 100"
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700"
                      value={giveawayForm.quantity}
                      onChange={(e) => setGiveawayForm({ ...giveawayForm, quantity: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Max Users</label>
                    <input
                      required
                      type="number"
                      placeholder="e.g. 50"
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold text-slate-700"
                      value={giveawayForm.maxUsers}
                      onChange={(e) => setGiveawayForm({ ...giveawayForm, maxUsers: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div>
                    <p className="text-sm font-bold text-slate-700">24h Refresh</p>
                    <p className="text-[10px] text-slate-400 font-medium">Reset participants every 24 hours</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGiveawayForm({ ...giveawayForm, refresh24h: !giveawayForm.refresh24h })}
                    className={`w-12 h-6 rounded-full transition-all relative ${giveawayForm.refresh24h ? 'bg-cyan-500' : 'bg-slate-300'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${giveawayForm.refresh24h ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>

                <button
                  type="submit"
                  className="w-full bg-cyan-500 text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-cyan-200 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  {editingGiveaway ? 'Update Giveaway' : 'Create Giveaway'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminPanel;
