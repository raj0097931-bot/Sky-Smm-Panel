import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { ThemeType } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { User, Mail, Phone, LogOut, Palette, Check, Save, X, ChevronRight, ShieldCheck, Gift, Crown, Sparkles, Image as ImageIcon, Type, Settings, Globe, Headset, MessageCircle, Send, Instagram } from 'lucide-react';
import { FONTS } from '../constants';
import { languages } from '../translations';
import { useTranslation } from '../contexts/LanguageContext';
import { onSnapshot } from 'firebase/firestore';
import Swal from 'sweetalert2';

interface ProfilePageProps {
  onAdminAccess?: () => void;
  onReferAccess?: () => void;
  onEliteAccess?: () => void;
  appName?: string;
  eliteHubEnabled?: boolean;
}

const ProfilePage: React.FC<ProfilePageProps> = ({ onAdminAccess, onReferAccess, onEliteAccess, appName = 'Elite Hub', eliteHubEnabled = true }) => {
  const { userData, user } = useAuth();
  const { theme, setTheme } = useTheme();
  const { t, language, setLanguage } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showFontSelector, setShowFontSelector] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showSupportOptions, setShowSupportOptions] = useState(false);
  const [appConfig, setAppConfig] = useState<any>(null);
  const [adminPassword, setAdminPassword] = useState('admin12345');
  const [formData, setFormData] = useState({
    name: '',
    photoURL: '',
    customFont: '',
    language: 'en'
  });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'app_config'), (doc) => {
      if (doc.exists()) {
        setAppConfig(doc.data());
      }
    });

    const unsubAdmin = onSnapshot(doc(db, 'settings', 'admin_config'), (doc) => {
      if (doc.exists()) {
        setAdminPassword(doc.data().adminPassword || 'admin12345');
      }
    });

    return () => {
      unsub();
      unsubAdmin();
    };
  }, []);

  // Sync with userData when it changes
  useEffect(() => {
    if (userData) {
      setFormData({ 
        name: userData.name || '',
        photoURL: userData.photoURL || '',
        customFont: userData.customFont || '',
        language: userData.language || 'en'
      });
    }
  }, [userData]);

  const handleAdminAccess = () => {
    onAdminAccess?.();
  };

  const handleLanguageChange = async (langCode: string) => {
    try {
      if (user) {
        await updateDoc(doc(db, 'users', user.uid), {
          language: langCode
        });
      }
      setLanguage(langCode);
      setShowLanguageModal(false);
      Swal.fire({
        title: t('language_changed_success'),
        icon: 'success',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        background: 'var(--card-bg)',
        color: 'var(--text-primary)'
      });
    } catch (error) {
      console.error('Error changing language:', error);
    }
  };

  const handleLogout = async () => {
    const result = await Swal.fire({
      title: t('logout'),
      text: t('logout_confirm_text'),
      icon: 'warning',
      showCancelButton: true,
      background: 'var(--card-bg)',
      color: 'var(--text-primary)',
      confirmButtonColor: 'var(--btn-bg)',
      cancelButtonColor: 'rgba(255,255,255,0.1)'
    });

    if (result.isConfirmed) {
      await signOut(auth);
    }
  };

  const handleUpdateProfile = async () => {
    if (!user) return;
    
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        name: formData.name,
        photoURL: formData.photoURL,
        customFont: formData.customFont,
        language: formData.language
      });
      setLanguage(formData.language);
      setShowEditModal(false);
      Swal.fire({
        icon: 'success',
        title: t('profile_updated'),
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        background: 'var(--card-bg)',
        color: 'var(--text-primary)'
      });
    } catch (error: any) {
      Swal.fire({
        icon: 'error',
        title: t('update_failed'),
        text: error.message,
        background: 'var(--card-bg)',
        color: 'var(--text-primary)'
      });
    }
  };

  const handleFontSelect = async (font: string) => {
    setFormData({ ...formData, customFont: font });
    if (!user) return;
    
    // Live update in Firestore for real-time preview
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        customFont: font
      });
    } catch (error) {
      console.error("Failed to update font in real-time:", error);
    }
  };

  const handleResetFont = async () => {
    setFormData({ ...formData, customFont: '' });
    if (!user) return;
    
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        customFont: ''
      });
    } catch (error) {
      console.error("Failed to reset font in real-time:", error);
    }
  };

  const themes: { id: ThemeType; label: string; colors: string[] }[] = [
    { id: 'premium', label: t('theme_premium'), colors: ['#667eea', '#764ba2'] },
    { id: 'dark-pro', label: t('theme_dark_pro'), colors: ['#000000', '#00d2ff'] },
    { id: 'royal-gold', label: t('theme_royal_gold'), colors: ['#0f0c29', '#ffd700'] },
    { id: 'light-minimal', label: t('theme_light_minimal'), colors: ['#f0f9ff', '#06b6d4'] },
    { id: 'cyber-neon', label: t('theme_cyber_neon'), colors: ['#0d0221', '#ff00ff'] },
    { id: 'modern-gaming', label: t('theme_modern_gaming'), colors: ['#0a192f', '#4169E1'] },
    { id: 'black-gold', label: t('theme_black_gold'), colors: ['#121212', '#d4af37'] },
    { id: 'clean-ui', label: t('theme_clean_ui'), colors: ['#f8f9fa', '#6610f2'] },
    { id: 'neon-cyber', label: t('theme_neon_cyber'), colors: ['#020c1b', '#00f3ff'] },
    { id: 'neon-blue', label: t('theme_neon_blue'), colors: ['#1e3a8a', '#38bdf8'] },
  ];

  const currentThemeData = themes.find(t => t.id === theme) || themes[0];

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
    <div className="space-y-8">
      <header className="mb-8">
        <h2 className="text-sm font-medium opacity-60 uppercase tracking-widest mb-1" style={{ color: 'var(--text-primary)' }}>{t('manage_profile')}</h2>
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('profile')}</h1>
      </header>

      {/* Profile Card */}
      <div className="glass rounded-[2.5rem] p-8 premium-shadow relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl" />
        
        <div className="flex justify-between items-start mb-8">
          <div className="w-20 h-20 rounded-3xl bg-white/10 flex items-center justify-center border border-white/20 overflow-hidden">
            {userData?.photoURL ? (
              <img src={userData.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <User className="w-10 h-10 text-white/80" />
            )}
          </div>
          <div className="flex flex-col gap-2 items-stretch min-w-[140px]">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowEditModal(true)}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 transition-all border border-white/10 group cursor-pointer"
            >
              <Settings className="w-4 h-4 opacity-60 group-hover:rotate-90 transition-transform" />
              <span className="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{t('edit_profile')}</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowSupportOptions(true)}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 transition-all border border-white/10 group cursor-pointer"
            >
              <Headset className="w-4 h-4 opacity-60 group-hover:animate-pulse transition-transform" />
              <span className="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{t('customer_support')}</span>
            </motion.button>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-[10px] opacity-40 uppercase tracking-widest mb-1" style={{ color: 'var(--text-primary)' }}>{t('full_name')}</p>
            <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{userData?.name}</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] opacity-40 uppercase tracking-widest mb-1" style={{ color: 'var(--text-primary)' }}>{t('email')}</p>
              <div className="flex items-center gap-2 opacity-80" style={{ color: 'var(--text-primary)' }}>
                <Mail className="w-4 h-4" />
                <p className="text-sm font-medium truncate">{userData?.email}</p>
              </div>
            </div>
            <div>
              <p className="text-[10px] opacity-40 uppercase tracking-widest mb-1" style={{ color: 'var(--text-primary)' }}>{t('phone')}</p>
              <div className="flex items-center gap-2 opacity-80" style={{ color: 'var(--text-primary)' }}>
                <Phone className="w-4 h-4" />
                <p className="text-sm font-medium">{userData?.phone}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Elite Hub Button - Unique Style */}
      {eliteHubEnabled && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Crown className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{t('exclusive_access')}</h3>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onEliteAccess}
            className="w-full relative group overflow-hidden rounded-[2rem] p-[2px] bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 shadow-xl shadow-purple-500/20"
          >
            <div className="glass rounded-[1.9rem] p-6 flex items-center justify-between transition-colors group-hover:bg-white/5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center border border-white/10">
                  <Sparkles className="w-6 h-6 text-cyan-400 group-hover:animate-pulse" />
                </div>
                <div className="text-left">
                  <span className="font-black text-xl" style={{ color: 'var(--text-primary)' }}>{appName}</span>
                </div>
              </div>
              <ChevronRight className="w-6 h-6 opacity-20 group-hover:opacity-60 transition-colors" style={{ color: 'var(--text-primary)' }} />
            </div>
            
            {/* Animated background glow */}
            <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 opacity-20 group-hover:opacity-40 blur-xl transition-opacity" />
          </motion.button>
        </div>
      )}

      {/* Refer & Earn Box */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Gift className="w-5 h-5 opacity-60" style={{ color: 'var(--text-primary)' }} />
          <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{t('refer_earn')}</h3>
        </div>

        <button
          onClick={onReferAccess}
          className="w-full glass rounded-3xl p-6 flex items-center justify-between premium-shadow hover:bg-white/5 transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center border border-white/10">
              <Gift className="w-6 h-6 opacity-80" style={{ color: 'var(--text-primary)' }} />
            </div>
            <div className="text-left">
              <p className="text-[10px] opacity-40 uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-primary)' }}>{t('invite_friends')}</p>
              <span className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{t('refer_earn_coins')}</span>
            </div>
          </div>
          <ChevronRight className="w-6 h-6 opacity-20 group-hover:opacity-60 transition-colors" style={{ color: 'var(--text-primary)' }} />
        </button>
      </div>

      {/* Theme Selector Box */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Palette className="w-5 h-5 opacity-60" style={{ color: 'var(--text-primary)' }} />
          <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{t('app_customization')}</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => setShowThemeModal(true)}
            className="w-full glass rounded-3xl p-6 flex items-center justify-between premium-shadow hover:bg-white/5 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center border border-white/10">
                <Palette className="w-6 h-6 opacity-80" style={{ color: 'var(--text-primary)' }} />
              </div>
              <div className="text-left">
                <p className="text-[10px] opacity-40 uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-primary)' }}>{t('current_theme')}</p>
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-1.5">
                    <div className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: currentThemeData.colors[0] }} />
                    <div className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: currentThemeData.colors[1] }} />
                  </div>
                  <span className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{currentThemeData.label}</span>
                </div>
              </div>
            </div>
            <ChevronRight className="w-6 h-6 opacity-20 group-hover:opacity-60 transition-colors" style={{ color: 'var(--text-primary)' }} />
          </button>

          {appConfig?.showLanguageSettings !== false && (
            <button
              onClick={() => setShowLanguageModal(true)}
              className="w-full glass rounded-3xl p-6 flex items-center justify-between premium-shadow hover:bg-white/5 transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center border border-white/10">
                  <Globe className="w-6 h-6 opacity-80" style={{ color: 'var(--text-primary)' }} />
                </div>
                <div className="text-left">
                  <p className="text-[10px] opacity-40 uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-primary)' }}>{t('language')}</p>
                  <span className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                    {languages.find(l => l.code === language)?.name || 'English'}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-6 h-6 opacity-20 group-hover:opacity-60 transition-colors" style={{ color: 'var(--text-primary)' }} />
            </button>
          )}
        </div>
      </div>

      {/* Language Selection Modal */}
      <AnimatePresence>
        {showLanguageModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLanguageModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm glass rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-white tracking-tight">{t('select_your_language')}</h3>
                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">{t('language')}</p>
                </div>
                <button 
                  onClick={() => setShowLanguageModal(false)}
                  className="p-2 hover:bg-white/5 rounded-xl transition-colors"
                >
                  <X className="w-6 h-6 text-white/40" />
                </button>
              </div>
              <div className="p-4 space-y-2">
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => handleLanguageChange(lang.code)}
                    className={`w-full p-4 rounded-2xl flex items-center justify-between transition-all border ${
                      language === lang.code 
                        ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' 
                        : 'bg-white/5 border-white/5 text-white/60 hover:bg-white/10 hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                        language === lang.code ? 'bg-amber-500/20' : 'bg-white/5'
                      }`}>
                        {lang.flag}
                      </div>
                      <div className="text-left">
                        <p className="font-bold tracking-tight">{lang.name}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">{lang.nativeName}</p>
                      </div>
                    </div>
                    {language === lang.code && (
                      <div className="w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center">
                        <Check className="w-4 h-4 text-black" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {showEditModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEditModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md glass rounded-[2.5rem] p-8 premium-shadow space-y-6 max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-black tracking-tight">{t('edit_profile')}</h3>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black opacity-40 uppercase tracking-widest ml-1">{t('full_name')}</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 opacity-40" />
                    <input
                      type="text"
                      placeholder="Enter your name"
                      className="w-full bg-white/10 border border-white/10 rounded-2xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black opacity-40 uppercase tracking-widest ml-1">{t('photo_url')}</label>
                  <div className="relative">
                    <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 opacity-40" />
                    <input
                      type="text"
                      placeholder="https://example.com/photo.jpg"
                      className="w-full bg-white/10 border border-white/10 rounded-2xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold"
                      value={formData.photoURL}
                      onChange={(e) => setFormData({ ...formData, photoURL: e.target.value })}
                    />
                  </div>
                </div>

                {/* Language Selection */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black opacity-40 uppercase tracking-widest ml-1">{t('language')}</label>
                  <div className="relative">
                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 opacity-40" />
                    <select
                      className="w-full bg-white/10 border border-white/10 rounded-2xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 font-bold appearance-none"
                      value={formData.language}
                      onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                    >
                      {languages.map(lang => (
                        <option key={lang.code} value={lang.code} className="bg-slate-900 text-white">
                          {lang.name} ({lang.nativeName})
                        </option>
                      ))}
                    </select>
                    <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40 rotate-90 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black opacity-40 uppercase tracking-widest ml-1">{t('custom_app_font')}</label>
                    {formData.customFont && (
                      <button 
                        onClick={handleResetFont}
                        className="text-[10px] font-black text-rose-400 uppercase tracking-widest"
                      >
                        {t('reset_default')}
                      </button>
                    )}
                  </div>
                  
                  <button
                    onClick={() => setShowFontSelector(true)}
                    className="w-full glass rounded-2xl p-4 flex items-center justify-between border border-white/10 hover:bg-white/10 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                        <Type className="w-5 h-5 opacity-60" />
                      </div>
                      <div className="text-left">
                        <p className="text-[10px] opacity-40 uppercase tracking-widest leading-none mb-1">{t('selected_style')}</p>
                        <p className="font-bold text-lg leading-none" style={{ fontFamily: formData.customFont || 'inherit' }}>
                          {formData.customFont || t('default_font')}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 opacity-20 group-hover:opacity-60 transition-all" />
                  </button>
                </div>

                <button
                  onClick={handleUpdateProfile}
                  className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-purple-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  {t('save_changes')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Font Selector Modal */}
      <AnimatePresence>
        {showFontSelector && (
          <div className="fixed inset-0 z-[110] flex items-center sm:items-end justify-center px-4 py-6 sm:pb-10">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowFontSelector(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, y: 100, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              className="relative w-full max-w-md glass rounded-[2.5rem] p-6 sm:p-8 premium-shadow space-y-6 max-h-[90vh] flex flex-col"
            >
              <div className="flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-2xl font-black tracking-tight">{t('choose_style')}</h3>
                  <p className="text-xs opacity-40 font-bold uppercase tracking-widest">{t('live_preview_enabled')}</p>
                </div>
                <button
                  onClick={() => setShowFontSelector(false)}
                  className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid gap-3 overflow-y-auto pr-2 custom-scrollbar flex-1 min-h-0">
                {FONTS.map((font) => (
                  <button
                    key={font}
                    onClick={() => handleFontSelect(font)}
                    className={`glass rounded-2xl p-4 flex items-center justify-between border transition-all shrink-0 ${
                      formData.customFont === font ? 'border-white/40 bg-white/20' : 'border-white/5 hover:border-white/20'
                    }`}
                  >
                    <span className="text-lg font-bold" style={{ fontFamily: font }}>
                      {font}
                    </span>
                    {formData.customFont === font && (
                      <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center">
                        <Check className="w-4 h-4 text-emerald-500" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
              
              <button
                onClick={() => setShowFontSelector(false)}
                className="w-full bg-white text-black py-4 rounded-2xl font-black text-lg shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all shrink-0"
              >
                {t('done')}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Theme Modal */}
      <AnimatePresence>
        {showThemeModal && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center px-4 pb-10">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowThemeModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="relative w-full max-w-md glass rounded-[2.5rem] p-8 premium-shadow space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-black tracking-tight">{t('select_theme')}</h3>
                <button
                  onClick={() => setShowThemeModal(false)}
                  className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid gap-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                {themes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTheme(t.id);
                      setShowThemeModal(false);
                    }}
                    className={`glass rounded-2xl p-4 flex items-center justify-between border transition-all ${
                      theme === t.id ? 'border-white/40 bg-white/20' : 'border-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex -space-x-2">
                        <div className="w-6 h-6 rounded-full border border-white/20" style={{ backgroundColor: t.colors[0] }} />
                        <div className="w-6 h-6 rounded-full border border-white/20" style={{ backgroundColor: t.colors[1] }} />
                      </div>
                      <span className={`text-sm font-bold ${theme === t.id ? 'text-white' : 'opacity-60'}`} style={theme === t.id ? {} : { color: 'var(--text-primary)' }}>
                        {t.label}
                      </span>
                    </div>
                    {theme === t.id && (
                      <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center">
                        <Check className="w-4 h-4 text-emerald-500" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Support Options Modal */}
      <AnimatePresence>
        {showSupportOptions && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center px-6">
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

      {/* Admin Access Button */}
      <button
        onClick={handleAdminAccess}
        className="w-full glass rounded-2xl p-5 flex items-center justify-center gap-3 text-cyan-500 font-bold hover:bg-cyan-500/10 transition-colors border border-cyan-500/20"
      >
        <ShieldCheck className="w-5 h-5" />
        {t('admin_access')}
      </button>

      {/* Logout Button */}
      <button
        onClick={handleLogout}
        className="w-full glass rounded-2xl p-5 flex items-center justify-center gap-3 text-rose-400 font-bold hover:bg-rose-400/10 transition-colors border border-rose-400/20"
      >
        <LogOut className="w-5 h-5" />
        {t('logout')}
      </button>
    </div>
  );
};

export default ProfilePage;
