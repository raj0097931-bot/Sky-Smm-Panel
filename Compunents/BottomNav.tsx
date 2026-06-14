import React from 'react';
import { Home, ClipboardList, Wallet, Bell, User } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const tabs = [
    { id: 'home', icon: Home, label: t('home') },
    { id: 'orders', icon: ClipboardList, label: t('orders') },
    { id: 'wallet', icon: Wallet, label: t('wallet_balance') },
    { id: 'notifications', icon: Bell, label: t('notifications') },
    { id: 'profile', icon: User, label: t('profile') },
  ];

  return (
    <nav className={`fixed bottom-6 left-4 right-4 h-16 border rounded-2xl flex items-center justify-around px-2 z-50 premium-shadow transition-all duration-500 ${
      theme === 'neon-blue' 
        ? 'bg-white/5 backdrop-blur-[24px] border-white/20 shadow-[0_8px_32px_0_rgba(255,255,255,0.1)]' 
        : 'nav-blur border-white/10'
    }`}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="relative flex flex-col items-center justify-center w-12 h-12 transition-colors"
          >
            {isActive && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 bg-white/10 rounded-xl"
                transition={{ type: 'spring', damping: 25, stiffness: 200, mass: 0.8 }}
              />
            )}
            <Icon
              className={`w-6 h-6 z-10 transition-all duration-300 ${
                isActive ? 'scale-110' : 'opacity-40'
              }`}
              style={{ color: isActive ? 'var(--accent)' : 'var(--text-primary)' }}
            />
            {isActive && (
              <motion.span
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[10px] font-bold mt-1 z-10"
                style={{ color: 'var(--accent)' }}
              >
                {tab.label}
              </motion.span>
            )}
          </button>
        );
      })}
    </nav>
  );
};

export default BottomNav;
