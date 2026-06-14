import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Notification } from '../types';
import { formatDate } from '../utils';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Info, AlertCircle, CheckCircle, Loader2, ExternalLink } from 'lucide-react';

const NotificationsPage = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const handleAction = (url?: string) => {
    if (url) {
      window.open(url, '_blank');
    }
  };

  useEffect(() => {
    if (!user) return;

    // Fetch all notifications (we'll filter client-side for global or user-specific)
    const q = query(collection(db, 'notifications'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifsData = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Notification[];
      
      // Filter: Global notifications OR notifications for this specific user
      const filtered = notifsData.filter(n => n.isGlobal || n.userId === user.uid);

      // Sort client-side
      filtered.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });

      setNotifications(filtered);
      setLoading(false);
    }, (error) => {
      console.error("Notifications fetch error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin text-white/50" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="mb-8">
        <h2 className="text-sm font-medium opacity-60 uppercase tracking-widest mb-1" style={{ color: 'var(--text-primary)' }}>Stay Updated</h2>
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Notifications</h1>
      </header>

      {notifications.length === 0 ? (
        <div className="glass rounded-3xl p-12 text-center">
          <Bell className="w-12 h-12 mx-auto mb-4 opacity-20" style={{ color: 'var(--text-primary)' }} />
          <p className="opacity-60" style={{ color: 'var(--text-primary)' }}>No new notifications.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          <AnimatePresence>
            {notifications.map((notif) => (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="glass rounded-2xl overflow-hidden premium-shadow border border-white/5 flex flex-col"
              >
                {notif.bannerUrl && (
                  <div 
                    className={`w-full overflow-hidden border-b border-white/5 ${notif.actionUrl ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}`}
                    onClick={() => notif.actionUrl && handleAction(notif.actionUrl)}
                  >
                    <img 
                      src={notif.bannerUrl} 
                      alt="Banner" 
                      className="w-full h-auto block" 
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
                <div className="p-5 flex gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                    <Info className="w-6 h-6 opacity-80" style={{ color: 'var(--text-primary)' }} />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{notif.title}</h3>
                      <span className="text-[10px] opacity-40 uppercase tracking-widest" style={{ color: 'var(--text-primary)' }}>{formatDate(notif.createdAt)}</span>
                    </div>
                    <p className="text-xs opacity-60 leading-relaxed mb-4" style={{ color: 'var(--text-primary)' }}>{notif.message}</p>
                    
                    {notif.actionUrl && (
                      <button
                        onClick={() => handleAction(notif.actionUrl)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition-all text-[10px] font-black uppercase tracking-widest"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open Link
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
