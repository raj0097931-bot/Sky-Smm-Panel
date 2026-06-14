
import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { translations } from '../translations';

interface LanguageContextType {
  language: string;
  setLanguage: (lang: string) => void;
  t: (key: string) => string;
  isReady: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState('en');
  const [defaultLanguage, setDefaultLanguage] = useState('en');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Listen for global app config for default language
    const unsubscribeConfig = onSnapshot(
      doc(db, 'settings', 'app_config'), 
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data.defaultLanguage) {
            setDefaultLanguage(data.defaultLanguage);
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'settings/app_config');
      }
    );

    return () => unsubscribeConfig();
  }, []);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        const unsubscribeUser = onSnapshot(
          doc(db, 'users', user.uid), 
          (snapshot) => {
            if (snapshot.exists()) {
              const userData = snapshot.data();
              
              // Check user language preference
              const checkLanguage = async () => {
                // If user is admin, force English
                if (userData.role === 'admin') {
                  setLanguageState('en');
                } else if (userData.language) {
                  setLanguageState(userData.language);
                } else {
                  setLanguageState(defaultLanguage);
                }
                setIsReady(true);
              };
              
              checkLanguage();
            } else {
              setLanguageState(defaultLanguage);
              setIsReady(true);
            }
          },
          (error) => {
            handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
          }
        );
        return () => unsubscribeUser();
      } else {
        setLanguageState(defaultLanguage);
        setIsReady(true);
      }
    });

    return () => unsubscribeAuth();
  }, [defaultLanguage]);

  const setLanguage = (lang: string) => {
    setLanguageState(lang);
  };

  const t = (key: string) => {
    const langTranslations = translations[language] || translations[defaultLanguage] || translations['en'];
    return langTranslations[key] || translations['en'][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isReady }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
};
