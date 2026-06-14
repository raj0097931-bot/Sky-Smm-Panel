import React, { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider, useTranslation } from './contexts/LanguageContext';
import AuthPage from './components/AuthPage';
import HomePage from './components/HomePage';
import OrdersPage from './components/OrdersPage';
import WalletPage from './components/WalletPage';
import NotificationsPage from './components/NotificationsPage';
import ProfilePage from './components/ProfilePage';
import ReferPage from './components/ReferPage';
import EliteHub from './components/EliteHub';
import DailyGiveawayPage from './components/DailyGiveawayPage';
import BottomNav from './components/BottomNav';
import AdminPanel from './components/AdminPanel';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Coins, ShieldAlert, Settings } from 'lucide-react';
import Swal from 'sweetalert2';
import { formatCurrency } from './utils';
import { getCategoryIcon } from './utils/categoryIcons';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { doc, onSnapshot, collection, getDocs, writeBatch, query, limit, addDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { useEffect } from 'react';

const AppContent = () => {
  const { user, userData, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('home');
  const [isAdminView, setIsAdminView] = useState(false);
  const [showReferPage, setShowReferPage] = useState(false);
  const [showEliteHub, setShowEliteHub] = useState(false);
  const [showDailyGiveaway, setShowDailyGiveaway] = useState(false);
  const [appName, setAppName] = useState('InstaBoost');
  const [appNameStyling, setAppNameStyling] = useState<any>(null);
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [eliteHubEnabled, setEliteHubEnabled] = useState(true);
  const [adminPassword, setAdminPassword] = useState('admin12345');

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    if (refCode) {
      localStorage.setItem('pending_referral_code', refCode);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setAdminPassword('admin12345');
      return;
    }
    // Fetch admin password from Firestore if authenticated
    const unsubAdminConfig = onSnapshot(
      doc(db, 'settings', 'admin_config'), 
      (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          setAdminPassword(data.adminPassword || 'admin12345');
        } else {
          setAdminPassword('admin12345');
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'settings/admin_config');
      }
    );
    return () => unsubAdminConfig();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const syncServices = async () => {
      try {
        let configSnap;
        try {
          configSnap = await getDoc(doc(db, 'settings', 'app_config'));
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, 'settings/app_config');
          return;
        }
        const markup = configSnap.exists() ? (configSnap.data().serviceMarkup || 0) : 0;

        const response = await fetch('/api/services');
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("API Route not found. If you are on Netlify, please note that Netlify does not support the backend server. Use Render or Railway instead.");
          }
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Server error: ${response.status}`);
        }
        const apiServices = await response.json();
        
        if (Array.isArray(apiServices)) {
          // Sync Categories
          const apiCategories = [...new Set(apiServices.map((s: any) => s.category))];
          const categoriesRef = collection(db, 'categories');
          let categoriesSnap;
          try {
            categoriesSnap = await getDocs(categoriesRef);
          } catch (error) {
            handleFirestoreError(error, OperationType.GET, 'categories');
            return;
          }
          const existingCategories = new Set(categoriesSnap.docs.map(doc => doc.data().name));

          for (const catName of apiCategories) {
            if (!existingCategories.has(catName)) {
              try {
                await addDoc(categoriesRef, {
                  name: catName,
                  icon: getCategoryIcon(catName),
                  createdAt: serverTimestamp()
                });
              } catch (error) {
                handleFirestoreError(error, OperationType.CREATE, 'categories');
                return;
              }
            }
          }

          const servicesRef = collection(db, 'services');
          let existingServicesSnap;
          try {
            existingServicesSnap = await getDocs(query(servicesRef, limit(1)));
          } catch (error) {
            handleFirestoreError(error, OperationType.GET, 'services');
            return;
          }
          
          if (existingServicesSnap.empty) {
            const batch = writeBatch(db);
            apiServices.forEach((s: any) => {
              const newDocRef = doc(servicesRef);
              const basePrice = parseFloat(s.rate) / 1000;
              const finalPrice = basePrice * (1 + markup / 100);
              
              batch.set(newDocRef, {
                api_service_id: s.service.toString(),
                name: s.name,
                category: s.category,
                category_icon: getCategoryIcon(s.category),
                emoji: getCategoryIcon(s.category),
                description: s.name,
                basePrice: basePrice,
                pricePerUnit: Number(finalPrice.toFixed(4)),
                minQty: parseInt(s.min),
                maxQty: parseInt(s.max),
                enabled: true,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              });
            });
            try {
              await batch.commit();
              console.log('Services synced from API');
            } catch (error) {
              handleFirestoreError(error, OperationType.WRITE, 'services');
              return;
            }
          }
        }
      } catch (error) {
        console.error('Error syncing services:', error);
      }
    };

    syncServices();
  }, [user]);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'settings', 'app_config'), 
      (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          setAppName(data.appName || 'InstaBoost');
          setAppNameStyling(data.appNameStyling || null);
          setIsMaintenanceMode(data.isMaintenanceMode || false);
          setEliteHubEnabled(data.eliteHubEnabled !== false);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'settings/app_config');
      }
    );
    return () => unsub();
  }, []);

  const handleAdminAccess = () => {
    setIsAdminView(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-12 h-12 animate-spin" style={{ color: 'var(--text-primary)' }} />
      </div>
    );
  }

  if (isMaintenanceMode && !isAdminView) {
    return (
      <div 
        className="flex flex-col items-center justify-center min-h-screen p-8 text-center space-y-8 bg-slate-900"
        style={{ 
          fontFamily: userData?.customFont || (appNameStyling?.enabled && appNameStyling?.applyGlobalFont ? appNameStyling.fontStyle : 'inherit')
        }}
      >
        <div className="w-24 h-24 bg-cyan-500/10 rounded-full flex items-center justify-center">
          <Settings className="w-12 h-12 text-cyan-500 animate-spin" />
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl font-black text-white tracking-tight">App Management</h1>
          <p className="text-slate-400 font-medium max-w-xs mx-auto">
            The application is currently undergoing maintenance. Please check back later.
          </p>
        </div>
        <div className="flex flex-col w-full max-w-xs gap-4">
          <button 
            onClick={() => window.history.back()}
            className="w-full bg-slate-800 text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-700 transition-all"
          >
            Back
          </button>
          <button 
            onClick={handleAdminAccess}
            className="w-full bg-cyan-500 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-cyan-500/20 hover:scale-105 transition-all"
          >
            Admin Access
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={appNameStyling?.enabled && appNameStyling?.applyGlobalFont ? { fontFamily: appNameStyling.fontStyle } : {}}>
        <AuthPage />
      </div>
    );
  }

  if (userData?.isBlocked) {
    return (
      <div 
        className="flex flex-col items-center justify-center min-h-screen p-8 text-center space-y-6"
        style={{ 
          fontFamily: userData?.customFont || (appNameStyling?.enabled && appNameStyling?.applyGlobalFont ? appNameStyling.fontStyle : 'inherit')
        }}
      >
        <div className="w-24 h-24 bg-rose-500/10 rounded-full flex items-center justify-center">
          <ShieldAlert className="w-12 h-12 text-rose-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-black text-white">Account Blocked</h1>
          <p className="text-white/60 font-medium">Your account has been suspended by the administrator. You cannot access the app services at this time.</p>
        </div>
        <button 
          onClick={() => auth.signOut()}
          className="bg-white text-rose-500 px-8 py-3 rounded-2xl font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-transform"
        >
          Sign Out
        </button>
      </div>
    );
  }

  if (isAdminView) {
    return <AdminPanel onBack={() => setIsAdminView(false)} />;
  }

  const renderPage = () => {
    if (showReferPage) {
      return <ReferPage onBack={() => setShowReferPage(false)} />;
    }

    if (showEliteHub) {
      return <EliteHub 
        onBack={() => setShowEliteHub(false)} 
        onGiveawayAccess={() => {
          setShowEliteHub(false);
          setShowDailyGiveaway(true);
        }}
        appName={appName} 
      />;
    }

    if (showDailyGiveaway) {
      return <DailyGiveawayPage onBack={() => setShowDailyGiveaway(false)} />;
    }

    switch (activeTab) {
      case 'home': return <HomePage onOrderSuccess={() => setActiveTab('orders')} />;
      case 'orders': return <OrdersPage />;
      case 'wallet': return <WalletPage />;
      case 'notifications': return <NotificationsPage />;
      case 'profile': return <ProfilePage 
        onAdminAccess={() => setIsAdminView(true)} 
        onReferAccess={() => setShowReferPage(true)}
        onEliteAccess={() => setShowEliteHub(true)}
        appName={appName}
        eliteHubEnabled={eliteHubEnabled}
      />;
      default: return <HomePage />;
    }
  };

  return (
    <div 
      className="pb-24 pt-20 px-4 max-w-md mx-auto min-h-screen relative overflow-x-hidden"
      style={{ 
        fontFamily: userData?.customFont || (appNameStyling?.enabled && appNameStyling?.applyGlobalFont ? appNameStyling.fontStyle : 'inherit')
      }}
    >
      {/* Top Header */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-[#eef2ff]/95 backdrop-blur-md border-b border-indigo-100/50 z-50 px-6 flex items-center justify-between">
        <h1 
          className={`text-2xl font-black tracking-tighter transition-all duration-500`}
          style={appNameStyling?.enabled ? { 
            color: appNameStyling.rgbEnabled ? undefined : (appNameStyling.animation === 'shimmer' ? 'transparent' : appNameStyling.color),
            fontFamily: appNameStyling.fontStyle,
            animation: `${appNameStyling.animation} ${appNameStyling.animation === 'typing' ? '3s steps(40, end)' : '2s'} infinite, ${appNameStyling.rgbEnabled ? `rgb-cycle ${appNameStyling.rgbSpeed}s linear infinite` : 'none'}`,
            textShadow: appNameStyling.effect === 'barkst' ? `0 0 10px ${appNameStyling.color}, 0 0 20px ${appNameStyling.color}` : 
                       appNameStyling.effect === 'shadow' ? `4px 4px 0px rgba(0,0,0,0.2)` : 'none',
            WebkitTextStroke: appNameStyling.effect === 'outline' ? `1px ${appNameStyling.color}` : 'none',
            backgroundImage: appNameStyling.animation === 'shimmer' ? `linear-gradient(to right, ${appNameStyling.color} 0, #ffffff 50%, ${appNameStyling.color} 100%)` : 
                       appNameStyling.effect === 'gradient' ? `linear-gradient(to right, ${appNameStyling.color}, #ffffff)` : 'none',
            backgroundSize: appNameStyling.animation === 'shimmer' ? '200% auto' : 'auto',
            WebkitBackgroundClip: (appNameStyling.effect === 'gradient' || appNameStyling.animation === 'shimmer') ? 'text' : 'none',
            WebkitTextFillColor: (appNameStyling.effect === 'gradient' || appNameStyling.animation === 'shimmer') ? 'transparent' : 'inherit',
            overflow: appNameStyling.animation === 'typing' ? 'hidden' : 'visible',
            whiteSpace: appNameStyling.animation === 'typing' ? 'nowrap' : 'normal',
            borderRight: appNameStyling.animation === 'typing' ? `2px solid ${appNameStyling.color}` : 'none'
          } : { color: '#00bcd4' }}
        >
          {appName}
        </h1>
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white shadow-sm border border-indigo-50">
          <Coins className="w-4 h-4 text-cyan-500" />
          <span className="text-sm font-bold text-cyan-600">{formatCurrency(userData?.walletBalance !== undefined ? userData?.walletBalance : (userData?.balance || 0))}</span>
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ 
            duration: 0.4,
            ease: [0.23, 1, 0.32, 1] 
          }}
        >
          {renderPage()}
        </motion.div>
      </AnimatePresence>
      
      <BottomNav activeTab={activeTab} setActiveTab={(tab) => {
        setActiveTab(tab);
        setShowReferPage(false);
        setShowEliteHub(false);
        setShowDailyGiveaway(false);
      }} />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </LanguageProvider>
    </AuthProvider>
  );
}
