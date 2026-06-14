import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../firebase';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  serverTimestamp, 
  doc, 
  setDoc, 
  deleteDoc 
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { Send, ChevronLeft, Users, MessageSquare, Loader2, User } from 'lucide-react';

interface Message {
  id: string;
  text: string;
  uid: string;
  displayName: string;
  createdAt: any;
}

interface GlobalChatProps {
  onBack: () => void;
}

const GlobalChat: React.FC<GlobalChatProps> = ({ onBack }) => {
  const { user, userData } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [typingUsers, setTypingUsers] = useState<{ uid: string, name: string }[]>([]);
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'global_chat'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Message[];
      setMessages(msgs.reverse());
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'typing_status'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const typing = snapshot.docs
        .map(doc => ({ uid: doc.id, name: doc.data().name }))
        .filter(t => t.uid !== user?.uid);
      setTypingUsers(typing);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  const handleTyping = () => {
    if (!user || !userData) return;

    // Set typing status
    setDoc(doc(db, 'typing_status', user.uid), {
      name: userData.name || 'Anonymous',
      timestamp: serverTimestamp()
    });

    // Clear previous timeout
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    // Set timeout to remove typing status
    typingTimeoutRef.current = setTimeout(() => {
      deleteDoc(doc(db, 'typing_status', user.uid));
    }, 3000);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || isSending) return;

    setIsSending(true);
    try {
      await addDoc(collection(db, 'global_chat'), {
        text: newMessage,
        uid: user.uid,
        displayName: userData?.name || 'Anonymous',
        createdAt: serverTimestamp()
      });
      setNewMessage('');
      // Remove typing status immediately after sending
      deleteDoc(doc(db, 'typing_status', user.uid));
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 28, stiffness: 180 }}
      className="fixed inset-0 z-[80] flex flex-col overflow-hidden"
      style={{ background: 'var(--bg-gradient)' }}
    >
      {/* Header */}
      <div className="relative z-10 px-6 pt-12 pb-4 flex items-center justify-between shrink-0 bg-black/20 backdrop-blur-xl border-b border-white/5">
        <button 
          onClick={onBack}
          className="p-3 bg-black/20 hover:bg-black/40 rounded-2xl transition-all border border-white/10 group"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-3 px-4 py-2 bg-black/20 rounded-full border border-white/10">
            <Users className="w-5 h-5 text-cyan-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white">Users Chat</span>
          </div>
          <span className="text-[8px] font-bold text-white/30 uppercase tracking-widest mt-1 mr-2">7 Days History</span>
        </div>
      </div>

      {/* Chat Area */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 py-6 custom-scrollbar">
        <div className="space-y-4 max-w-md mx-auto">
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className={`flex flex-col ${msg.uid === user?.uid ? 'items-end' : 'items-start'}`}
            >
              <span className="text-[10px] font-bold text-white/40 mb-1 px-2 uppercase tracking-widest">
                {msg.uid === user?.uid ? 'You' : msg.displayName}
              </span>
              <div className={`max-w-[85%] p-4 rounded-3xl shadow-lg ${
                msg.uid === user?.uid 
                  ? 'bg-cyan-500 text-white rounded-tr-none shadow-cyan-500/20' 
                  : 'bg-white/10 border border-white/10 backdrop-blur-xl text-white rounded-tl-none'
              }`}>
                <p className="text-sm leading-relaxed">{msg.text}</p>
              </div>
            </motion.div>
          ))}
          
          {/* Typing Indicator */}
          <AnimatePresence>
            {typingUsers.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex flex-col items-start"
              >
                <span className="text-[10px] font-bold text-cyan-400 mb-1 px-2 uppercase tracking-widest">
                  {typingUsers.length === 1 
                    ? `${typingUsers[0].name} is typing...` 
                    : `${typingUsers.length} users are typing...`}
                </span>
                <div className="bg-white/5 border border-white/10 backdrop-blur-xl p-3 rounded-2xl rounded-tl-none flex gap-1">
                  <motion.div
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="w-1.5 h-1.5 rounded-full bg-cyan-400"
                  />
                  <motion.div
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                    className="w-1.5 h-1.5 rounded-full bg-cyan-400"
                  />
                  <motion.div
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                    className="w-1.5 h-1.5 rounded-full bg-cyan-400"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={scrollRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="relative z-10 p-4 bg-black/40 backdrop-blur-2xl border-t border-white/10 shrink-0">
        <form onSubmit={sendMessage} className="max-w-md mx-auto flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              handleTyping();
            }}
            placeholder="Type your message..."
            className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50 transition-colors"
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || isSending}
            className="w-12 h-12 rounded-2xl bg-cyan-500 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:grayscale transition-all hover:scale-105 active:scale-95"
          >
            {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>
      </div>
    </motion.div>
  );
};

export default GlobalChat;
