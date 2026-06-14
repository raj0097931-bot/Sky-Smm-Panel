import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, onValue, set } from 'firebase/database';
import { auth, db, rtdb, handleFirestoreError, OperationType } from '../firebase';
import { UserData } from '../types';

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  rtdbData: any | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, userData: null, rtdbData: null, loading: true });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [rtdbData, setRtdbData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        // Real-time listener for user data (wallet, theme, etc.)
        const userDocRef = doc(db, 'users', currentUser.uid);
        const unsubUserData = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            // Initialize totalSpent if missing
            if (data.totalSpent === undefined) {
              updateDoc(userDocRef, { totalSpent: 0 }).catch(err => console.error("Error initializing totalSpent:", err));
            }
            // Sync to leaderboard for public access
            const leaderboardRef = doc(db, 'leaderboard', currentUser.uid);
            setDoc(leaderboardRef, {
              name: data.name || 'User',
              photoURL: data.photoURL || null,
              totalSpent: Number(data.totalSpent || 0),
              updatedAt: serverTimestamp()
            }, { merge: true }).catch(err => console.error("Error syncing to leaderboard:", err));

            setUserData({ uid: docSnap.id, ...data } as UserData);
          } else {
             // User document does not exist
             setUserData({ uid: currentUser.uid, role: 'user', walletBalance: 0, selectedTheme: 'dark', language: 'en', totalSpent: 0 } as unknown as UserData);
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
          setLoading(false);
        });

        // Real-time listener for RTDB user data (coins, referralCode, etc.)
        const userRef = ref(rtdb, `users/${currentUser.uid}`);
        const unsubRtdbData = onValue(userRef, (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.val();
            setRtdbData(data);
            
            // Generate referral code if missing (for existing users)
            if (!data.referralCode) {
              const newCode = 'REF' + Math.random().toString(36).substring(2, 7).toUpperCase();
              set(ref(rtdb, `users/${currentUser.uid}/referralCode`), newCode);
            }
          } else {
            // If user exists in Auth but not in RTDB (old users), create record
            const newCode = 'REF' + Math.random().toString(36).substring(2, 7).toUpperCase();
            set(ref(rtdb, `users/${currentUser.uid}`), {
              name: currentUser.displayName || 'User',
              email: currentUser.email,
              coins: 0,
              referralCode: newCode,
              referredBy: null,
              createdAt: Date.now()
            }).catch(err => console.error("Error creating RTDB user:", err));
          }
          setLoading(false);
        }, (error) => {
          console.error("RTDB Auth error:", error);
          setLoading(false);
        });

        return () => {
          unsubUserData();
          unsubRtdbData();
        };
      } else {
        setUserData(null);
        setRtdbData(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, userData, rtdbData, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
