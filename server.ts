import express from "express";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import fetch from "node-fetch";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp, getApp, getApps } from "firebase/app";
import { 
  initializeFirestore,
  memoryLocalCache,
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  limit, 
  writeBatch, 
  updateDoc, 
  deleteDoc, 
  addDoc,
  Timestamp, 
  serverTimestamp 
} from "firebase/firestore";
import admin from "firebase-admin";
import cron from "node-cron";
import fs from "fs";
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase Config from provisioned file
const configPath = path.join(__dirname, "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

const firebaseApp = (getApps().length > 0) ? getApp() : initializeApp(firebaseConfig);
const db = initializeFirestore(firebaseApp, {
  localCache: memoryLocalCache()
}, firebaseConfig.firestoreDatabaseId || "(default)");

// Initialize Firebase Admin (Optional fallback for other admin tasks, but we'll use client SDK for DB)
if (!admin.apps.length) {
  try {
    const projectId = firebaseConfig.projectId;
    if (projectId && (projectId.includes("gen-lang-client") || !projectId.includes("followers"))) {
       // Only try default init if it looks like a provisioned project
       admin.initializeApp();
       console.log("[Firebase Admin] Initialized with default credentials");
    } else {
       console.log("[Firebase Admin] Skipping auto-init for external project (needs Service Account)");
    }
  } catch (error) {
    console.warn("[Firebase Admin] Could not initialize Admin SDK (expected for external projects without service account)");
  }
}

export let useAdminDb = false;

const probeAdminFirebase = async () => {
  if (admin.apps.length > 0) {
    try {
      await admin.firestore().collection("settings").doc("app_config").get();
      useAdminDb = true;
      console.log("[Firebase Admin] Probe successful. SMM Panel is operational with Admin SDK.");
    } catch (err: any) {
      console.warn("[Firebase Admin] Probe failed. Default Admin credentials have no permissions for this Database. Falling back to Client SDK. Error:", err.message || err);
      useAdminDb = false;
    }
  } else {
    console.log("[Firebase Admin] No Apps initialized. Falling back to Client SDK.");
    useAdminDb = false;
  }
};

probeAdminFirebase();

// Chat Cleanup Task: Deletes messages older than 7 days
const cleanupChat = async () => {
  console.log("[Cron] Starting chat cleanup...");
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  try {
    let messageDocs = [];
    if (useAdminDb) {
      const snap = await admin.firestore().collection("global_chat")
        .where("createdAt", "<", admin.firestore.Timestamp.fromDate(sevenDaysAgo))
        .get();
      messageDocs = snap.docs;
    } else {
      const chatRef = collection(db, "global_chat");
      const q = query(chatRef, where("createdAt", "<", Timestamp.fromDate(sevenDaysAgo)));
      const snap = await getDocs(q);
      messageDocs = snap.docs as any[];
    }
    
    if (messageDocs.length === 0) {
      console.log("[Cron] No old messages to delete.");
      return;
    }

    if (useAdminDb) {
      const batch = admin.firestore().batch();
      messageDocs.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();
    } else {
      const batch = writeBatch(db);
      messageDocs.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();
    }
    console.log(`[Cron] Deleted ${messageDocs.length} old messages.`);
  } catch (error) {
    console.error("[Cron] Error cleaning up chat:", error);
  }
};

// Schedule cleanup to run every day at midnight (00:00)
// This ensures a rolling 7-day history as requested
cron.schedule("0 0 * * *", cleanupChat);

// Order Status Sync Task: Syncs Pending/Processing orders with SMM API
const syncOrderStatuses = async () => {
  console.log(`[Cron] Starting order status sync (Project: ${firebaseConfig.projectId}, DB: ${firebaseConfig.firestoreDatabaseId || '(default)'})...`);
  try {
    let orderDocs = [];
    if (useAdminDb) {
      const snapshot = await admin.firestore()
        .collection("orders")
        .where("status", "in", ["Pending", "Processing"])
        .limit(50)
        .get();
      orderDocs = snapshot.docs;
    } else {
      const ordersRef = collection(db, "orders");
      const q = query(ordersRef, where("status", "in", ["Pending", "Processing"]), limit(50));
      const snapshot = await getDocs(q);
      orderDocs = snapshot.docs as any[];
    }
    
    if (orderDocs.length === 0) {
      console.log("[Cron] No active orders to sync.");
      return;
    }

    console.log(`[Cron] Syncing ${orderDocs.length} orders...`);
    
    // Get SMM Config
    let configData: any = {};
    if (useAdminDb) {
      const snap = await admin.firestore().doc("settings/app_config").get();
      configData = snap.exists ? snap.data() : {};
    } else {
      const configDocSnap = await getDoc(doc(db, "settings", "app_config"));
      configData = configDocSnap.exists() ? configDocSnap.data() : {};
    }
    
    const DEFAULT_API_URL = "https://app.smmowl.com/api/v2";
    const DEFAULT_API_KEY = "36006c74798b368739665893098737e6"; 
    
    const apiKey = (configData?.smmApiKey || process.env.SMM_API_KEY || DEFAULT_API_KEY).trim();
    const apiUrl = (configData?.smmApiUrl || process.env.SMM_API_URL || DEFAULT_API_URL).trim();

    const getSmmHeaders = (url: string) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
      };
      
      try {
        const origin = new URL(url).origin;
        headers["Origin"] = origin;
        headers["Referer"] = origin + "/";
      } catch (e) {
        // Fallback if URL is invalid
      }
      return headers;
    };

    for (const orderDoc of orderDocs) {
      const order = orderDoc.data();
      const apiOrderId = order.api_order_id;
      
      if (!apiOrderId) continue;

      try {
        const params = new URLSearchParams();
        params.append('key', apiKey);
        params.append('action', 'status');
        params.append('order', String(apiOrderId));

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: getSmmHeaders(apiUrl),
          body: params.toString(),
        });

        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          console.error(`[Cron] Non-JSON API Response for Order ${apiOrderId}:`, text.substring(0, 100));
          continue;
        }

        console.log(`[Cron] API Response for Order ${apiOrderId}:`, JSON.stringify(data));
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
              if (useAdminDb) {
                await orderDoc.ref.update({
                  status: newStatus,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
              } else {
                await updateDoc(orderDoc.ref, {
                  status: newStatus,
                  updatedAt: serverTimestamp()
                });
              }
              console.log(`[Cron] Updated Order ${orderDoc.id} status from ${order.status} to ${newStatus} (API: ${data.status})`);
            }
          }
        // Add a small delay (200ms) between orders to avoid hitting write rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err) {
        console.error(`[Cron] Error syncing order ${orderDoc.id}:`, err);
      }
    }
  } catch (error: any) {
    if (error.message?.includes('RESOURCE_EXHAUSTED') || error.message?.includes('Quota exceeded')) {
      console.warn("[Cron] Firestore daily quota reached. Skipping sync until tomorrow.");
    } else if (error.message?.includes('PERMISSION_DENIED')) {
      console.error("[Cron] Permission Denied. This usually means the Firebase Admin SDK is not authorized to access this project or database. Please ensure your Firebase project is correctly set up and the database ID is correct.", error);
    } else {
      console.error("[Cron] Error in order status sync:", error);
    }
  }
};

// Schedule order sync to run every 5 minutes
cron.schedule("*/5 * * * *", syncOrderStatuses);

// Automatic Payment Verification Task
const autoVerifyPayments = async () => {
  console.log("[Cron] Starting automatic payment verification...");
  
  const email = process.env.VERIFICATION_EMAIL || "sukhchainsingh93581@gmail.com";
  const password = process.env.EMAIL_APP_PASSWORD || "lktb gwlg setm kdxm";

  try {
    // 1. Get all pending fund requests
    let pendingDocs: any[] = [];
    if (useAdminDb) {
      const snap = await admin.firestore().collection("fundRequests").where("status", "==", "Pending").get();
      pendingDocs = snap.docs;
    } else {
      const requestsRef = collection(db, "fundRequests");
      const q = query(requestsRef, where("status", "==", "Pending"));
      const snap = await getDocs(q);
      pendingDocs = snap.docs as any[];
    }

    if (pendingDocs.length === 0) {
      console.log("[Cron] No pending payment requests to verify.");
      return;
    }

    console.log(`[Cron] Found ${pendingDocs.length} pending requests to check.`);

    // 2. Connect to IMAP
    const config = {
      imap: {
        user: email,
        password: password,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 5000
      }
    };

    const connection = await imaps.connect(config);
    await connection.openBox('INBOX');

    // 3. For each pending request, look for a matching email
    for (const requestDoc of pendingDocs) {
      const requestData = requestDoc.data();
      const transactionId = requestData.transactionId;
      const amount = Number(requestData.amount);

      if (!transactionId) continue;

      // CRITICAL: Check if this Transaction ID has ALREADY been used and approved for ANY user
      let isAlreadyUsed = false;
      if (useAdminDb) {
        const dupSnap = await admin.firestore().collection("fundRequests")
          .where("transactionId", "==", transactionId)
          .where("status", "==", "Approved")
          .get();
        isAlreadyUsed = dupSnap.docs.some(doc => doc.id !== requestDoc.id);
      } else {
        const duplicateQuery = query(
          collection(db, "fundRequests"), 
          where("transactionId", "==", transactionId), 
          where("status", "==", "Approved")
        );
        const duplicateSnapshot = await getDocs(duplicateQuery);
        isAlreadyUsed = duplicateSnapshot.docs.some(doc => doc.id !== requestDoc.id);
      }
      
      if (isAlreadyUsed) {
        console.warn(`[Cron] Transaction ID ${transactionId} has already been approved for another request. Flagging as duplicate.`);
        if (useAdminDb) {
          await requestDoc.ref.update({
            status: 'Failed',
            failureReason: 'Duplicate Transaction ID: This payment has already been claimed and approved.',
            processedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } else {
          await updateDoc(requestDoc.ref, {
            status: 'Failed',
            failureReason: 'Duplicate Transaction ID: This payment has already been claimed and approved.',
            processedAt: serverTimestamp()
          });
        }
        continue;
      }

      console.log(`[Cron] Verifying Request ${requestDoc.id} (TX: ${transactionId}, Amount: ${amount})`);

      // Search last 3 days for the specific transaction ID
      const searchCriteria = [
        ['TEXT', transactionId],
        ['SINCE', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)]
      ];
      const fetchOptions = {
        bodies: ['HEADER.FIELDS (SUBJECT)', 'TEXT'],
        markSeen: false
      };

      const messages = await connection.search(searchCriteria, fetchOptions);
      let foundMatch = false;

      const normalizeId = (id: string) => id.toLowerCase().replace(/[^a-z0-9]/g, '');
      const searchIdNormalized = normalizeId(transactionId);
      const targetAmount = parseFloat(amount.toString());

      for (const message of messages) {
        const headerInfo = message.parts.find((p: any) => p.which === 'HEADER.FIELDS (SUBJECT)');
        const textPart = message.parts.find((p: any) => p.which === 'TEXT');
        
        if (!textPart) continue;

        const subject = (headerInfo?.body?.subject || '').toString();
        const bodyContent = textPart.body.toString();
        // Join subject and body, and normalize to lowercase
        const fullContent = (subject + " " + bodyContent).toLowerCase();
        
        // Exact ID check (Normalized)
        if (!normalizeId(fullContent).includes(searchIdNormalized)) continue;

        console.log(`[Cron] Found potential match for ID ${transactionId}. Checking amount ${targetAmount}...`);

        // Escaped transaction ID for safe regex replacement
        const escapedId = transactionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Remove the transaction ID from the content to ensure we don't accidentally match part of the ID as the amount
        const contentWithoutId = fullContent.replace(new RegExp(escapedId.toLowerCase(), 'g'), ' [TX_ID] ');
        
        // Robust amount extraction: focused on currency patterns and explicit "amount" labels
        // Patterns: Rs 100, 100.00 INR, Amount: 100, ₹ 1,000.50, etc.
        const amountRegex = /(?:rs\.?|inr|₹|amount|paid|sent|total|value|sum)\s*[:=]?\s*([\d,]+(?:\.\d{1,2})?)\b/gi;
        const matches = contentWithoutId.matchAll(amountRegex);
        
        // Also look for standalone numbers that look like currency (at least one decimal place)
        const standaloneRegex = /\b([\d,]+\.\d{2})\b/g; 
        const secondMatches = contentWithoutId.matchAll(standaloneRegex);

        let amountVerified = false;
        const foundNumbers: number[] = [];

        const checkMatch = (numText: string) => {
          const matchedNumText = numText.replace(/,/g, '');
          const parsedN = parseFloat(matchedNumText);
          if (!isNaN(parsedN)) {
            foundNumbers.push(parsedN);
            if (Math.abs(parsedN - targetAmount) < 0.01) {
              return true;
            }
          }
          return false;
        };

        // Check primary currency matches
        for (const match of matches) {
          if (checkMatch(match[1])) {
            amountVerified = true;
            break;
          }
        }
        
        // Check secondary decimal matches if still not verified
        if (!amountVerified) {
          for (const match of secondMatches) {
            if (checkMatch(match[1])) {
              amountVerified = true;
              break;
            }
          }
        }
        
        if (amountVerified) {
          foundMatch = true;
          console.log(`[Cron] SUCCESS: Found matching email for TX ${transactionId} with correct amount ${targetAmount}`);
          break;
        } else {
          console.log(`[Cron] ID found but Amount ${targetAmount} NOT found. Relevant numbers in email: ${foundNumbers.join(', ')}`);
        }
      }

      if (foundMatch) {
        console.log(`[Cron] MATCH FOUND for ${transactionId}. Approving automatically...`);
        
        let userExists = false;
        let userData: any = null;
        if (useAdminDb) {
          const uSnap = await admin.firestore().doc(`users/${requestData.userId}`).get();
          userExists = uSnap.exists;
          userData = uSnap.data();
        } else {
          const userSnap = await getDoc(doc(db, "users", requestData.userId));
          userExists = userSnap.exists();
          userData = userSnap.data();
        }

        if (userExists && userData) {
          const currentBalance = userData.walletBalance !== undefined ? userData.walletBalance : (userData.balance || 0);
          
          if (useAdminDb) {
            const batch = admin.firestore().batch();
            const uRef = admin.firestore().doc(`users/${requestData.userId}`);
            const nRef = admin.firestore().collection('notifications').doc();
            
            batch.update(uRef, {
              walletBalance: currentBalance + amount,
              balance: currentBalance + amount,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            batch.set(nRef, {
              userId: requestData.userId,
              title: 'Payment Verified Automatically!',
              message: `Your payment of ${amount} has been verified and added to your wallet.`,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            batch.update(requestDoc.ref, {
              status: 'Approved',
              processedAt: admin.firestore.FieldValue.serverTimestamp(),
              verifiedAutomatically: true,
              verificationMethod: 'IMAP_CRON'
            });

            await batch.commit();
          } else {
            const batch = writeBatch(db);
            const userRef = doc(db, "users", requestData.userId);
            const notifRef = doc(collection(db, 'notifications'));
            
            batch.update(userRef, {
              walletBalance: currentBalance + amount,
              balance: currentBalance + amount,
              updatedAt: serverTimestamp()
            });

            batch.set(notifRef, {
              userId: requestData.userId,
              title: 'Payment Verified Automatically!',
              message: `Your payment of ${amount} has been verified and added to your wallet.`,
              createdAt: serverTimestamp()
            });

            batch.update(requestDoc.ref, {
              status: 'Approved',
              processedAt: serverTimestamp(),
              verifiedAutomatically: true,
              verificationMethod: 'IMAP_CRON'
            });

            await batch.commit();
          }
          console.log(`[Cron] Successfully processed Request ${requestDoc.id}`);
        }
      } else {
        // If not matched AND older than 20 minutes, mark as Rejected
        const createdAt = requestData.createdAt?.toDate?.() || new Date();
        const ageInMinutes = (Date.now() - createdAt.getTime()) / (1000 * 60);
        
        if (ageInMinutes > 20) {
          console.log(`[Cron] Request ${requestDoc.id} (TX: ${transactionId}) expired (Age: ${Math.round(ageInMinutes)}m). Marking as Rejected.`);
          if (useAdminDb) {
            await requestDoc.ref.update({
              status: 'Rejected',
              failureReason: 'Verification timeout: No matching payment found after 20 minutes.',
              processedAt: admin.firestore.FieldValue.serverTimestamp()
            });
          } else {
            await updateDoc(requestDoc.ref, {
              status: 'Rejected',
              failureReason: 'Verification timeout: No matching payment found after 20 minutes.',
              processedAt: serverTimestamp()
            });
          }
        }
      }
    }

    connection.end();
    console.log("[Cron] Payment verification task completed.");

  } catch (error) {
    console.error("[Cron] Error in automatic payment verification:", error);
  }
};

// Schedule auto-verification to run every 10 minutes
const interval = process.env.VERIFICATION_CHECK_INTERVAL_MINUTES || "10";
cron.schedule(`*/${interval} * * * *`, autoVerifyPayments);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(cors({ origin: "*" }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Helper to get SMM Config from Firestore
  const getSmmConfig = async () => {
    // HARDCODED FALLBACKS - Update these if needed
    const DEFAULT_API_URL = "https://app.smmowl.com/api/v2";
    const DEFAULT_API_KEY = "36006c74798b368739665893098737e6"; 

    try {
      let configData: any = null;
      if (useAdminDb) {
        const snap = await admin.firestore().doc('settings/app_config').get();
        configData = snap.exists ? snap.data() : null;
      } else {
        const configDoc = await getDoc(doc(db, 'settings', 'app_config'));
        configData = configDoc.exists() ? configDoc.data() : null;
      }

      if (configData) {
        const config = {
          apiKey: (configData.smmApiKey || process.env.SMM_API_KEY || DEFAULT_API_KEY).trim(),
          apiUrl: (configData.smmApiUrl || process.env.SMM_API_URL || DEFAULT_API_URL).trim()
        };
        console.log(`[SMM Config] Using URL: ${config.apiUrl} (Key: ${config.apiKey.substring(0, 4)}***)`);
        return config;
      }
    } catch (error) {
      console.error("Error fetching SMM config from Firestore:", error);
    }
    
    const fallbackConfig = {
      apiKey: (process.env.SMM_API_KEY || DEFAULT_API_KEY).trim(),
      apiUrl: (process.env.SMM_API_URL || DEFAULT_API_URL).trim()
    };
    console.log(`[SMM Config] Using Fallback URL: ${fallbackConfig.apiUrl} (Key: ${fallbackConfig.apiKey.substring(0, 4)}***)`);
    return fallbackConfig;
  };

  const getSmmHeaders = (url: string) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache"
    };
    
    try {
      const urlObj = new URL(url);
      headers["Host"] = urlObj.host;
      headers["Origin"] = urlObj.origin;
      headers["Referer"] = urlObj.origin + "/";
    } catch (e) {
      // Fallback if URL is invalid
    }
    return headers;
  };

  // API Routes
  app.get("/api/server-ip", async (req, res) => {
    try {
      const response = await fetch("https://api.ipify.org?format=json");
      const data = await response.json() as any;
      res.json({ ip: data.ip });
    } catch (error) {
      res.status(500).json({ error: "Could not fetch server IP" });
    }
  });

  app.get("/api/services", async (req, res) => {
    let { key, url } = req.query;
    let apiKey = typeof key === 'string' ? key.trim() : '';
    let apiUrl = typeof url === 'string' ? url.trim() : '';

    if (!apiKey || !apiUrl) {
      const dbConfig = await getSmmConfig();
      if (!apiKey) apiKey = dbConfig.apiKey;
      if (!apiUrl) apiUrl = dbConfig.apiUrl;
    }

    if (!apiKey) {
      return res.status(400).json({ error: "SMM API Key is missing. Please set it in Admin Panel > App Management." });
    }
    try {
      const params = new URLSearchParams();
      params.append('key', apiKey);
      params.append('action', 'services');

      console.log(`[API] Fetching services from: ${apiUrl}`);
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: getSmmHeaders(apiUrl),
        body: params.toString(),
      });
      
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error(`Non-JSON response from SMM API (${response.status}) at ${apiUrl}:`, text.substring(0, 500));
        
        let errorMessage = `SMM API returned an invalid response (Status: ${response.status}). Response: ${text.substring(0, 50)}`;
        if (response.status === 403) {
          errorMessage = "403 Forbidden: Your SMM Panel (mansmm.com or similar) has blocked the request from Railway. Please Login to your SMM Panel and DISABLE 'IP Restriction' in your API settings. If you already disabled it, check if your API Key is correct.";
        } else if (response.status === 523 || response.status === 521) {
          errorMessage = `${response.status} Origin Unreachable: The SMM Panel server is down or unreachable by Cloudflare. Check if the panel website is working at all, or try again later.`;
        } else if (response.status === 404) {
          errorMessage = "404 Not Found: The API URL is incorrect. Please check your API URL in the Admin Panel.";
        } else {
          errorMessage += " Check your API URL and Key in Admin Panel.";
        }

        return res.status(500).json({ 
          error: errorMessage,
          details: text.substring(0, 100)
        });
      }

      if (!response.ok) {
        let errMessage = data?.error || `SMM API Error: ${response.status}`;
        if (response.status === 523 || response.status === 521) errMessage = `${response.status} Origin Unreachable: The SMM Panel server is down or unreachable.`;
        
        return res.status(response.status).json({ 
          error: errMessage,
          details: data
        });
      }
      res.json(data);
    } catch (error: any) {
      console.error("Error fetching services:", error);
      res.status(500).json({ error: `Connection Error: ${error.message}. Please check your API URL.` });
    }
  });

  // Test Gemini API endpoint
  app.post("/api/test-gemini", async (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey) {
      return res.status(400).json({ error: "API Key is required" });
    }
    
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      
      if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        return res.status(response.status).json({ 
          error: errorData.error?.message || "Invalid API Key or API error",
          details: errorData 
        });
      }
      
      const data: any = await response.json();
      if (data.models && data.models.length > 0) {
        res.json({ success: true, message: "API key valid. Models found: " + data.models.length });
      } else {
        res.status(500).json({ error: "Valid key, but no models available." });
      }
    } catch (error: any) {
      console.error("Gemini API Test Error:", error);
      res.status(500).json({ error: error.message || "Failed to connect to Gemini API" });
    }
  });

  // Chat with Gemini
  app.post("/api/gemini/chat", async (req, res) => {
    const { apiKey: bodyApiKey, config, messages, isAdmin, adminStats, aiConfig } = req.body;
    const apiKey = bodyApiKey || process.env.GEMINI_API_KEY;
    const appName = config?.appName || 'InstaBoost';
    const authorityLevel = aiConfig?.authorityLevel || 3;
    const customInst = isAdmin ? (aiConfig?.adminCustomInstructions || '') : (aiConfig?.userCustomInstructions || '');
    
    if (!apiKey) return res.status(400).json({ error: "Gemini API Key is missing. Please set it in the environment variables or App Settings." });
    
    try {
      const { appName = 'Our App' } = config || {};
      
      // Step 1: dynamically find all available models, but prioritize stable modern models
      let availableModels: string[] = ["models/gemini-2.5-flash", "models/gemini-2.0-flash", "models/gemini-1.5-flash", "models/gemini-1.5-flash-8b", "models/gemini-1.5-pro"];
      try {
        const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (modelsRes.ok) {
           const modelsData: any = await modelsRes.json();
           if (modelsData?.models?.length > 0) {
             const geminiModels = modelsData.models.filter((m: any) => 
                m.supportedGenerationMethods?.includes("generateContent") && 
                m.name.includes("gemini") &&
                !m.name.toLowerCase().includes("-tts") && 
                !m.name.toLowerCase().includes("experimental") &&
                !m.name.toLowerCase().includes("-vision") &&
                !m.name.toLowerCase().includes("test")
             );
             
             if (geminiModels.length > 0) {
               // Priority: 1.5-flash (fast/cheap), 1.5-pro (smart), then stable models
               const v15flash = geminiModels.filter((m: any) => m.name.includes("1.5-flash") && !m.name.includes("8b")).map(m => m.name);
               const v15flash8b = geminiModels.filter((m: any) => m.name.includes("1.5-flash-8b")).map(m => m.name);
               const v15pro = geminiModels.filter((m: any) => m.name.includes("1.5-pro")).map(m => m.name);
               const v10pro = geminiModels.filter((m: any) => m.name.includes("gemini-pro") || m.name.includes("1.0-pro")).map(m => m.name);
               
               const remaining = geminiModels.filter((m: any) => 
                 ![...v15flash, ...v15flash8b, ...v15pro, ...v10pro].includes(m.name)
               ).map(m => m.name);

               availableModels = [...v15flash, ...v15flash8b, ...v15pro, ...v10pro, ...remaining];
             }
           }
        }
      } catch(e) {
        console.log("Could not fetch models dynamically, using defaults:", e);
      }

      // De-duplicate model list
      availableModels = [...new Set(availableModels)];

      let instructionText = '';
      if (isAdmin) {
          const userSummary = adminStats?.userList?.map((u: any) => `${u.email} (₹${u.balance}, ${u.status}, UID: ${u.uid}, Ph: ${u.phone || 'N/A'}, Name: ${u.name || 'N/A'}, Joined: ${u.createdAt})`).join(' | ') || 'None';
          const paymentSummary = adminStats?.pendingPayments?.map((p: any) => `ID: ${p.id} | Email: ${p.email} | Amt: ₹${p.amount} | Method: ${p.method} | UTR: ${p.utr} | Date: ${p.date}`).join(' | ') || 'None';
          const securitySummary = adminStats?.securityLogs?.map((s: any) => `Dev: ${s.deviceId}, IP: ${s.ip}, Accs: ${s.associatedAccounts?.join('/')}, Last: ${s.lastLoginEmail}, ${s.date}`).join(' | ') || 'None';
          const servicesSummary = adminStats?.servicesSample?.map((s: any) => `ID: ${s.id} | Name: ${s.name} | Cat: ${s.category} | Price: ₹${s.price} | API_ID: ${s.api_service_id || 'N/A'} | Qty: ${s.min || 1}-${s.max || 10000} | ${s.enabled ? 'Active' : 'Disabled'}`).join('\n') || 'None';
          const categoriesSummary = adminStats?.categoriesList?.map((c: any) => `${c.name} (ID: ${c.id})`).join(', ') || 'None';
          const giveawaysSummary = adminStats?.activeGiveaways?.map((g: any) => `ID: ${g.id} | Title: ${g.title} | Service: ${g.serviceName} | Qty: ${g.quantity} | WinnersCount: ${g.winners} | ${g.enabled ? 'Enabled' : 'Disabled'}`).join('\n') || 'None';
          const ordersSummary = adminStats?.recentOrders?.map((o: any) => `ID: ${o.id} | Email: ${o.email} | Service: ${o.service} | Status: ${o.status} | Cost: ₹${o.charge} | Link: ${o.link} | Qty: ${o.qty} | Date: ${o.date} | API_ID: ${o.api_id || 'N/A'}`).join('\n') || 'None';
          const referralSummary = adminStats?.referralStats?.recentReferrals?.map((r: any) => `Referrer: ${r.referrer} joined with ${r.joined} (Reward: ${r.reward})`).join(' | ') || 'None';

          instructionText = `You are the Supreme AI Assistant for this Admin Panel.
You have FULL, UNRESTRICTED ACCESS to the real-time databases and logs provided below. All previous "Blind Spots" have been removed. You can now see every detail including the SMM services list, categories, live giveaways, current order logs, pending/all payment requests, and security device logs.

📊 REAL-TIME SUPREME DATA (LIVE):
- Registered Users Count: ${adminStats?.totalUsers || 0}
- Currently Connected Users: ${adminStats?.connectedUsers || 0}
- Total Revenue (Gross): ₹${adminStats?.totalRevenue || 0}
- Active/Processing Orders: ${adminStats?.activeOrdersCount || 0}
- Completed Orders: ${adminStats?.completedOrdersCount || 0}
- SMM Panel Balance: ${adminStats?.smmPanelBalance || '0'}

🛠️ SMM SERVICES & CATEGORIES MASTER LIST (LIVE):
Categories available: ${categoriesSummary}
Services (Use Service Name or ID correctly to create giveaways):
${servicesSummary}

🎁 LIVE GIVEAWAYS:
${giveawaysSummary}

📦 SMM RECENT ORDERS (Last 50):
${ordersSummary}

💳 PENDING PAYMENT FUND REQUESTS:
${paymentSummary}

🛡️ SECURITY & FRAUD PROTECTION:
- Detailed Security Logs (IP & Device IDs): ${securitySummary}
- Associated Accounts Tracking: Use DeviceID and IP matches to find fraud.

👥 USER MASTER LIST:
- User Master List (Full Data): ${userSummary}

🔗 REFERRAL STATS:
- Total Referral Records: ${adminStats?.referralStats?.totalReferrals || 0}
- Total Referral Rewards Distributed: ${adminStats?.referralStats?.totalRewardsDistributed || 0}
- Recent Referrals: ${referralSummary}

⚙️ SYSTEM CONFIG & HEALTH:
- App Name: ${appName}
- Maintenance: ${adminStats?.appHealth?.maintenanceMode ? 'ON' : 'OFF'}
- UPI ID: ${adminStats?.appHealth?.upiId || 'N/A'}
- Payment Limits: Min ₹${adminStats?.appHealth?.minPayment || 0}, Max ₹${adminStats?.appHealth?.maxPayment || 0}
- UI Style: ${adminStats?.appHealth?.fontStyle || 'Classic'}`;

          let commandSection = `\n\n🤖 YOUR SUPREME CAPABILITIES:\nYou can manage the entire app using the commands below. You MUST include the exactly formatted command at the end of your response for any action requested by the Admin.\n\n`;
          
          const highCommands = `[ADMIN_ACTION:APP_NAME:New_Name] - Change app name
[ADMIN_ACTION:MARKUP:percent] - Change service markup (e.g. 10 for 10%)
[ADMIN_ACTION:MAINTENANCE:ON/OFF] - Toggle maintenance mode
[ADMIN_ACTION:UPDATE_UPI:upi_id] - Update UPI ID
[ADMIN_ACTION:UPDATE_QR:url] - Update Payment QR URL
[ADMIN_ACTION:UPDATE_LIMITS:min:max] - Update payment limits
[ADMIN_ACTION:UPDATE_API_CONFIG:url:key] - Update SMM API URL and Key
[ADMIN_ACTION:CHECK_API_BALANCE] - Refresh SMM Panel balance
[ADMIN_ACTION:SYNC_SERVICES] - Sync services from SMM API
[ADMIN_ACTION:DELETE_ALL_SERVICES] - Clear all services & categories
[ADMIN_ACTION:TOGGLE_SERVICE:id_or_name] - Enable/Disable a service
[ADMIN_ACTION:SYNC_ORDERS] - Sync status of all orders
[ADMIN_ACTION:SYNC_PAYMENTS] - Refresh payment status list

[ADMIN_ACTION:BLOCK:email] - Block a user
[ADMIN_ACTION:UNBLOCK:email] - Unblock a user
[ADMIN_ACTION:DELETE_USER:email] - Delete a user
[ADMIN_ACTION:UPDATE_BALANCE:email:new_balance] - Set fixed balance
[ADMIN_ACTION:ADD_BALANCE:email:amount] - Add funds
[ADMIN_ACTION:SUB_BALANCE:email:amount] - Subtract funds

[ADMIN_ACTION:GLOBAL_NOTIF:title:message] - Notification to ALL users
[ADMIN_ACTION:SEND_NOTIF:email:message] - Private notification
[ADMIN_ACTION:CREATE_ADVANCED_NOTIF:target:title:message:image:link] - Detailed Notif (target='all' or 'email')

[ADMIN_ACTION:APPROVE_PAYMENT:id] - Approve fund request
[ADMIN_ACTION:REJECT_PAYMENT:id] - Reject fund request

[ADMIN_ACTION:SET_REF_REWARD:amount] - Set referral reward coins
[ADMIN_ACTION:CREATE_GIVEAWAY:category:serviceId:qty:maxUsers] - Create giveaway
[ADMIN_ACTION:EDIT_GIVEAWAY:id_or_title:qty:maxUsers] - Edit giveaway
[ADMIN_ACTION:DELETE_GIVEAWAY:id_or_title] - Delete giveaway
[ADMIN_ACTION:TOGGLE_GIVEAWAY:id_or_title] - Enable/Disable giveaway

[ADMIN_ACTION:UPDATE_SPINNER:days:maxSpins:cost] - Update spinner settings
[ADMIN_ACTION:UPDATE_PRIZE:index:text:value:type] - Update spinner prize (0-9)
[ADMIN_ACTION:UPDATE_RGB:ON/OFF] - Toggle RGB Animation
[ADMIN_ACTION:UPDATE_STYLE:fontStyle:applyGlobal] - Update text style
[ADMIN_ACTION:UPDATE_ANIM:animation] - Update text animation
[ADMIN_ACTION:TOGGLE_LANG:ON/OFF] - Toggle language visibility in profile

[ADMIN_ACTION:CHANGE_ADMIN_PWD:old:new] - Change admin login password`;

          const mediumCommands = `[ADMIN_ACTION:MAINTENANCE:ON/OFF] - Toggle maintenance mode
[ADMIN_ACTION:UPDATE_RGB:ON/OFF] - Toggle RGB Animation
[ADMIN_ACTION:UPDATE_STYLE:fontStyle:applyGlobal] - Update text style
[ADMIN_ACTION:UPDATE_ANIM:animation] - Update text animation
[ADMIN_ACTION:TOGGLE_LANG:ON/OFF] - Toggle language visibility in profile
[ADMIN_ACTION:GLOBAL_NOTIF:title:message] - Notification to ALL users
[ADMIN_ACTION:CHECK_API_BALANCE] - Refresh SMM Panel balance
[ADMIN_ACTION:SYNC_SERVICES] - Sync services
[ADMIN_ACTION:SYNC_ORDERS] - Refresh order statuses
[ADMIN_ACTION:SYNC_PAYMENTS] - Refresh payment list`;

          if (authorityLevel === 3) {
            commandSection += `BOSS, YOU HAVE SUPREME AUTHORITY (HIGH LEVEL). You can use ALL of these commands:\n\n${highCommands}`;
          } else if (authorityLevel === 2) {
            commandSection += mediumCommands;
            commandSection += `\n\n(Note: Aapka authority level Medium hai. Sirf upar wali actions allow hain.)`;
          } else {
            commandSection = `\n\n(Note: Aap ka authority level Low hai. Aap sirf database analyze kar sakte hain (View actions), koi action execute nahi kar sakte.)`;
          }

          instructionText += commandSection;
          
          if (customInst) {
            instructionText += `\n\nBOSS CUSTOM INSTRUCTIONS (Follow strictly):\n${customInst}`;
          }

          instructionText += `\n\nRULES:
1. Speak in Hinglish (Hindi text in English chars).
2. Address user as "Boss", "Sir", or "Admin Sahab".
3. NO Markdown formatting (no stars, no headers). Be clean.
4. If the user asks to "View" something, LOOK at the provided JSON data and answer accurately. 
5. If the user asks to change something, ALWAY use one of the exactly formatted [ADMIN_ACTION:...] commands at the end of your response.
6. FOR GIVEAWAYS: Use [ADMIN_ACTION:CREATE_GIVEAWAY:CategoryName:ServiceNameOrID:Quantity:MaxUsers].
7. FOR PASSWORD: Use [ADMIN_ACTION:CHANGE_ADMIN_PWD:OldPass:NewPass:ConfirmPass].
8. YOU HAVE SUPREME AUTHORITY IN HIGH LEVEL. Never apologize for not being able to do something—just find the command and EXECUTE it.`;
      } else {
        instructionText = `You are the friendly and helpful AI Assistant for an app named '${appName}'.
This app is a Social Media Marketing (SMM) Panel where users can buy services to boost their social media presence (likes, followers, views, etc.).

${customInst ? `BOSS CUSTOM INSTRUCTIONS:\n${customInst}` : ''}

Rules:
1. PRIVACY FIRST: Do NOT share any user's personal, confidential, or private details (emails, passwords, balances, IDs) with anyone. If asked for someone's data, politely refuse.
2. Only talk about '${appName}', its features, and services. The app features include: Ordering SMM Services, Wallet integration, Daily Giveaways, Referrals, Global Chat, and a Leaderboard.
3. Be fully positive and enthusiastic about the app and its features. Speak highly of it! Tell the user how great the app is for boosting their online presence.
4. If the user speaks in Hindi, answer in Hindi using friendly language.
5. Do NOT mention fitness, workouts, or completely unrelated topics.
6. If the user asks how to use something in the app, guide them clearly and simply.
7. Keep answers relatively short and conversational.`;
      }

      const systemInstruction = {
        parts: [{ 
          text: instructionText
        }]
      };

      // Ensure roles alternate correctly and LIMIT HISTORY to save tokens
      const formattedContents = [];
      let lastRole = null;
      // Truncate history to last 10 messages to avoid large prompts
      const recentMessages = messages.slice(-10);
      
      for (const m of recentMessages) {
        const role = m.role === 'user' ? 'user' : 'model';
        const parts = [];
        
        if (m.text) parts.push({ text: m.text });
        if (m.attachments && Array.isArray(m.attachments)) {
          m.attachments.forEach((att: any) => {
            parts.push({
              inlineData: {
                data: att.data,
                mimeType: att.type
              }
            });
          });
        }

        if (role === lastRole) {
          if (formattedContents.length > 0) {
            formattedContents[formattedContents.length - 1].parts.push(...parts);
          }
        } else {
          formattedContents.push({ role, parts });
          lastRole = role;
        }
      }

      // Step 2: Try models in sequence until one works
      let reply = "I'm sorry, I couldn't understand that.";
      let success = false;
      let lastErrorStatus = 500;
      let lastErrorMessage = "All models failed";

      for (const modelPath of availableModels) {
        const modelUrl = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${apiKey}`;
        
        try {
          const response = await fetch(modelUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction,
              contents: formattedContents,
              generationConfig: {
                temperature: 0.3,
                topP: 0.8,
                topK: 40
              }
            })
          });

          if (response.ok) {
            const data: any = await response.json();
            reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't understand that.";
            success = true;
            break; // Stop loop on success
          }

          const errData: any = await response.json().catch(() => ({}));
          lastErrorStatus = response.status;
          lastErrorMessage = errData.error?.message || "Gemini API error";

          console.log(`Model ${modelPath} failed with status ${response.status}: ${lastErrorMessage}`);

          // If the API key itself is expired or invalid, fail fast and don't loop
          if (lastErrorMessage.toLowerCase().includes("api key") || lastErrorMessage.toLowerCase().includes("api_key") || lastErrorMessage.toLowerCase().includes("invalid key")) {
             break;
          }

          // If it's a 400 or 404, it might not support systemInstruction or model not found. Try fallback logic inside.
          if (response.status === 400 || response.status === 404) {
               const fallbackHistory = [...formattedContents];
               if (fallbackHistory.length > 0 && fallbackHistory[0].role === 'user') {
                   fallbackHistory[0].parts[0].text = systemInstruction.parts[0].text + "\n\n" + fallbackHistory[0].parts[0].text;
               } else {
                   fallbackHistory.unshift({ role: 'user', parts: [{ text: systemInstruction.parts[0].text }] });
               }

               const fallbackResponse = await fetch(modelUrl, {
                   method: "POST",
                   headers: { "Content-Type": "application/json" },
                   body: JSON.stringify({ contents: fallbackHistory })
               });
               
               if (fallbackResponse.ok) {
                   const fallbackData: any = await fallbackResponse.json();
                   reply = fallbackData.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't provide an answer.";
                   success = true;
                   break;
               }
          }

          // If we hit 429, we skip to the next model in the list
          if (response.status === 429) {
            continue;
          }

        } catch (err: any) {
          console.error(`Error with model ${modelPath}:`, err.message);
          lastErrorMessage = err.message;
        }
      }

      if (success) {
        res.json({ text: reply });
      } else {
        const errorMsg = lastErrorMessage.toLowerCase().includes('quota') || lastErrorStatus === 429 
          ? "Sir, saare available models ka quota khatam ho gaya hai. Google Free AI ki limit hoti hai. Please thodi der baad try karein ya apni Gemini API Key badlein."
          : `AI Model Error: ${lastErrorMessage}`;
          
        res.status(lastErrorStatus).json({ 
          error: errorMsg,
          details: lastErrorMessage
        });
      }

    } catch (error: any) {
      console.error("Gemini Chat Error:", error);
      res.status(500).json({ error: error.message || "Error processing chat" });
    }
  });

  app.post("/api/order", async (req, res) => {
    const { apiKey, apiUrl } = await getSmmConfig();
    if (!apiKey) {
      return res.status(400).json({ error: "SMM API Key is missing. Please set it in Admin Panel." });
    }
    const { service, link, quantity } = req.body;
    try {
      const params = new URLSearchParams();
      params.append('key', apiKey);
      params.append('action', 'add');
      params.append('service', String(service));
      params.append('link', String(link));
      params.append('quantity', String(quantity));

      console.log(`[API] Placing order to: ${apiUrl}`);
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: getSmmHeaders(apiUrl),
        body: params.toString(),
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error(`Non-JSON response from SMM API (${apiUrl}):`, text.substring(0, 500));
        
        let errorMessage = `SMM API Error (Status: ${response.status}) from ${apiUrl}. The API did not return JSON.`;
        if (response.status === 403) {
          errorMessage = "403 Forbidden: Your SMM Panel (mansmm.com or similar) blocked the Railway request. You MUST disable 'IP Restriction' in your SMM Panel API settings to fix this.";
        }

        return res.status(500).json({ 
          error: errorMessage,
          details: text.substring(0, 100)
        });
      }

      if (!response.ok) {
        let errMessage = data?.error || `SMM API Error: ${response.status} from ${apiUrl}`;
        if (response.status === 523 || response.status === 521) errMessage = `${response.status} Origin Unreachable: The SMM Panel server is down or unreachable.`;
        
        return res.status(response.status).json({ 
          error: errMessage,
          details: data
        });
      }
      res.json(data);
    } catch (error: any) {
      console.error("Error placing order:", error);
      res.status(500).json({ error: `Connection Error: ${error.message}` });
    }
  });

  app.get("/api/order-status/:id", async (req, res) => {
    const { apiKey, apiUrl } = await getSmmConfig();
    if (!apiKey) {
      return res.status(400).json({ error: "SMM API Key is missing." });
    }
    const { id } = req.params;
    try {
      const params = new URLSearchParams();
      params.append('key', apiKey);
      params.append('action', 'status');
      params.append('order', String(id));

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: getSmmHeaders(apiUrl),
        body: params.toString(),
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("Non-JSON response from SMM API (status):", text.substring(0, 200));
        return res.status(500).json({ error: `SMM API returned an invalid response (Status: ${response.status}). Response: ${text.substring(0, 100)}` });
      }

      if (!response.ok) {
        let errMessage = data?.error || `SMM API Error: ${response.status}`;
        if (response.status === 523 || response.status === 521) errMessage = `${response.status} Origin Unreachable: The SMM Panel server is down or unreachable.`;
        
        return res.status(response.status).json({ 
          error: errMessage,
          details: data
        });
      }
      res.json(data);
    } catch (error: any) {
      console.error("Error fetching order status:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/refill", async (req, res) => {
    const { apiKey, apiUrl } = await getSmmConfig();
    if (!apiKey) {
      return res.status(400).json({ error: "SMM API Key is missing." });
    }
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required." });
    }

    try {
      const params = new URLSearchParams();
      params.append('key', apiKey);
      params.append('action', 'refill');
      params.append('order', String(orderId));

      console.log(`[API] Sending refill request for order: ${orderId} to: ${apiUrl}`);
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: getSmmHeaders(apiUrl),
        body: params.toString(),
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error(`Non-JSON response from SMM API (${response.status}):`, text.substring(0, 200));
        return res.status(500).json({ error: `SMM API returned an invalid response. Response: ${text.substring(0, 100)}` });
      }

      if (!response.ok) {
        let errMessage = data?.error || `SMM API Error: ${response.status}`;
        if (response.status === 523 || response.status === 521) errMessage = `${response.status} Origin Unreachable: The SMM Panel server is down or unreachable.`;
        
        return res.status(response.status).json({ 
          error: errMessage,
          details: data
        });
      }
      res.json(data);
    } catch (error: any) {
      console.error("Error sending refill request:", error);
      res.status(500).json({ error: `Connection Error: ${error.message}` });
    }
  });

  app.get("/api/balance", async (req, res) => {
    let { key, url } = req.query;
    let apiKey = typeof key === 'string' ? key.trim() : '';
    let apiUrl = typeof url === 'string' ? url.trim() : '';

    if (!apiKey || !apiUrl) {
      const dbConfig = await getSmmConfig();
      if (!apiKey) apiKey = dbConfig.apiKey;
      if (!apiUrl) apiUrl = dbConfig.apiUrl;
    }

    if (!apiKey) {
      return res.status(400).json({ error: "SMM API Key is missing." });
    }
    try {
      const params = new URLSearchParams();
      params.append('key', apiKey);
      params.append('action', 'balance');

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: getSmmHeaders(apiUrl),
        body: params.toString(),
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("Non-JSON response from SMM API (balance):", text.substring(0, 200));
        
        let errorMessage = `SMM API returned an invalid response (Status: ${response.status}). Response: ${text.substring(0, 100)}`;
        if (response.status === 403) {
          errorMessage = "403 Forbidden: Please check your API Key and disable 'IP Restriction' in your SMM Panel settings.";
        }

        return res.status(500).json({ error: errorMessage });
      }

      if (!response.ok) {
        return res.status(response.status).json(data);
      }
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: `Connection Error: ${error.message}` });
    }
  });

  // Health check and 404 handler for API
  app.get("/api/health", (req, res) => res.json({ status: "ok", message: "Backend is running" }));
  
  app.post("/api/verify-payment", async (req, res) => {
    const { requestId, transactionId } = req.body;
    
    if (!requestId || !transactionId) {
      return res.status(400).json({ error: "Missing required fields: requestId, transactionId" });
    }

    // 0. Fetch the record from database FIRST to verify the amount WE should be checking
    let requestExists = false;
    let requestData: any = null;
    let requestDocRef: any = null;

    if (useAdminDb) {
      requestDocRef = admin.firestore().doc(`fundRequests/${requestId}`);
      const snap = await requestDocRef.get();
      requestExists = snap.exists;
      requestData = snap.data();
    } else {
      requestDocRef = doc(db, "fundRequests", requestId);
      const snap = await getDoc(requestDocRef);
      requestExists = snap.exists();
      requestData = snap.data();
    }

    if (!requestExists) {
      return res.status(404).json({ error: "Fund request not found." });
    }

    if (requestData.status !== 'Pending') {
      return res.status(400).json({ error: "This request has already been processed." });
    }

    const targetAmount = parseFloat(String(requestData.amount));

    // 1. CHECK FOR DUPLICATES
    try {
      let isApprovedDup = false;
      if (useAdminDb) {
        const dupSnap = await admin.firestore().collection("fundRequests")
          .where("transactionId", "==", transactionId)
          .where("status", "==", "Approved")
          .get();
        isApprovedDup = !dupSnap.empty;
      } else {
        const duplicateQuery = query(
          collection(db, "fundRequests"), 
          where("transactionId", "==", transactionId), 
          where("status", "==", "Approved")
        );
        const duplicateSnapshot = await getDocs(duplicateQuery);
        isApprovedDup = !duplicateSnapshot.empty;
      }
      
      if (isApprovedDup) {
        console.warn(`[Verification] Transaction ID ${transactionId} already Approved.`);
        
        // Update the current request to status: 'Rejected' as well to prevent it from showing as Pending in history
        if (useAdminDb) {
          await requestDocRef.update({
            status: 'Rejected',
            failureReason: 'Duplicate Transaction ID: This transaction ID has already been verified and approved.',
            processedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } else {
          await updateDoc(requestDocRef, {
            status: 'Rejected',
            failureReason: 'Duplicate Transaction ID: This transaction ID has already been verified and approved.',
            processedAt: serverTimestamp()
          });
        }

        return res.status(400).json({ error: "Duplicate Transaction: This transaction ID has already been verified and approved." });
      }
    } catch (e: any) {
      console.error("Duplicate check error:", e);
    }

    let verificationMethod = 'manual';
    let email = process.env.VERIFICATION_EMAIL || "sukhchainsingh93581@gmail.com";
    let password = process.env.EMAIL_APP_PASSWORD || "lktb gwlg setm kdxm";

    try {
      let configData: any = null;
      if (useAdminDb) {
        const snap = await admin.firestore().doc("settings/app_config").get();
        configData = snap.exists ? snap.data() : null;
      } else {
        const configRef = doc(db, "settings", "app_config");
        const configSnap = await getDoc(configRef);
        configData = configSnap.exists() ? configSnap.data() : null;
      }

      if (configData) {
        verificationMethod = configData.paymentVerificationMethod || 'manual';
        if (configData.verificationEmail && configData.verificationEmail.trim()) {
          email = configData.verificationEmail.trim();
        }
        if (configData.emailAppPassword && configData.emailAppPassword.trim()) {
          password = configData.emailAppPassword.trim();
        }
      }
    } catch (dbErr) {
      console.error("[Verification] Error reading app_config from DB", dbErr);
    }

    if (verificationMethod === 'manual') {
      console.log(`[Verification] Manual verification is active, ignoring IMAP check for TX: ${transactionId}`);
      return res.json({ success: true, isManual: true, message: "Manual verification is active. Request is registered." });
    }

    const config = {
      imap: {
        user: email,
        password: password,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 5000
      }
    };

    try {
      console.log(`[Verification] Checking email for TX: ${transactionId}, Target Amount: ${targetAmount}`);
      const connection = await imaps.connect(config);
      await connection.openBox('INBOX');

      // Targeted search: Check last 2 days
      const searchCriteria = [
        ['TEXT', transactionId],
        ['SINCE', new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)]
      ]; 
      const fetchOptions = {
        bodies: ['HEADER.FIELDS (SUBJECT)', 'TEXT'],
        markSeen: false
      };
      
      const searchPromise = connection.search(searchCriteria, fetchOptions);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("IMAP Timeout")), 20000));
      
      const messages = await Promise.race([searchPromise, timeoutPromise]) as any[];
      let foundMatch = false;

      const normalizeId = (id: string) => id.toLowerCase().replace(/[^a-z0-9]/g, '');
      const searchIdNormalized = normalizeId(transactionId);

      for (const message of messages) {
        const headerInfo = message.parts.find((p: any) => p.which === 'HEADER.FIELDS (SUBJECT)');
        const textPart = message.parts.find((p: any) => p.which === 'TEXT');
        
        if (!textPart) continue;

        const subject = (headerInfo?.body?.subject || '').toString();
        const bodyContent = textPart.body.toString();
        const fullContent = (subject + " " + bodyContent).toLowerCase();
        
        if (!normalizeId(fullContent).includes(searchIdNormalized)) {
           continue;
        }

        console.log(`[Verification] ID match found. Checking amount ${targetAmount}...`);

        // Escaped transaction ID for safe regex replacement
        const escapedId = transactionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Remove the transaction ID from the content to ensure we don't accidentally match part of the ID as the amount
        const contentWithoutId = fullContent.replace(new RegExp(escapedId.toLowerCase(), 'g'), ' [TX_ID] ');
        
        // Robust amount extraction: focused on currency patterns and explicit "amount" labels
        const amountRegex = /(?:rs\.?|inr|₹|amount|paid|sent|total|value|sum)\s*[:=]?\s*([\d,]+(?:\.\d{1,2})?)\b/gi;
        const matches = contentWithoutId.matchAll(amountRegex);
        
        const standaloneRegex = /\b([\d,]+\.\d{2})\b/g; 
        const secondMatches = contentWithoutId.matchAll(standaloneRegex);

        let amountVerified = false;
        const foundNumbers: number[] = [];

        const checkMatch = (numText: string) => {
          const matchedNumText = numText.replace(/,/g, '');
          const parsedN = parseFloat(matchedNumText);
          if (!isNaN(parsedN)) {
            foundNumbers.push(parsedN);
            if (Math.abs(parsedN - targetAmount) < 0.01) {
              return true;
            }
          }
          return false;
        };

        for (const match of matches) {
          if (checkMatch(match[1])) {
            amountVerified = true;
            break;
          }
        }
        
        if (!amountVerified) {
          for (const match of secondMatches) {
            if (checkMatch(match[1])) {
              amountVerified = true;
              break;
            }
          }
        }
        
        if (amountVerified) {
          foundMatch = true;
          console.log(`[Verification] SUCCESS: Found matching email for TX ${transactionId} with correct amount ${targetAmount}`);
          break;
        } else {
          console.log(`[Verification] ID match found but Amount ${targetAmount} NOT found in email. Relevant numbers found: ${foundNumbers.join(', ')}`);
        }
      }

      connection.end();      
      if (foundMatch) {
         let userExists = false;
         let userData: any = null;
         if (admin.apps.length > 0) {
           const uSnap = await admin.firestore().doc(`users/${requestData.userId}`).get();
           userExists = uSnap.exists;
           userData = uSnap.data();
         } else {
           const userSnap = await getDoc(doc(db, "users", requestData.userId));
           userExists = userSnap.exists();
           userData = userSnap.data();
         }

         if (userExists && userData) {
           const currentBalance = userData.walletBalance !== undefined ? userData.walletBalance : (userData.balance || 0);
           const amountToAdd = targetAmount;

           if (admin.apps.length > 0) {
             const batch = admin.firestore().batch();
             const uRef = admin.firestore().doc(`users/${requestData.userId}`);
             const nRef = admin.firestore().collection('notifications').doc();
             
             batch.update(uRef, {
               walletBalance: currentBalance + amountToAdd,
               balance: currentBalance + amountToAdd,
               updatedAt: admin.firestore.FieldValue.serverTimestamp()
             });

             batch.set(nRef, {
               userId: requestData.userId,
               title: 'Payment Verified!',
               message: `Your payment of ${amountToAdd} has been verified and added to your wallet.`,
               createdAt: admin.firestore.FieldValue.serverTimestamp()
             });

             batch.update(requestDocRef, {
               status: 'Approved',
               transactionId: transactionId,
               processedAt: admin.firestore.FieldValue.serverTimestamp(),
               verifiedAutomatically: true,
               verificationMethod: 'IMAP_MANUAL'
             });

             await batch.commit();
           } else {
             await updateDoc(doc(db, "users", requestData.userId), {
               walletBalance: currentBalance + amountToAdd,
               balance: currentBalance + amountToAdd,
               updatedAt: serverTimestamp()
             });

             await addDoc(collection(db, 'notifications'), {
               userId: requestData.userId,
               title: 'Payment Verified!',
               message: `Your payment of ${amountToAdd} has been verified and added to your wallet.`,
               createdAt: serverTimestamp()
             });

             await updateDoc(requestDocRef, {
               status: 'Approved',
               transactionId: transactionId,
               processedAt: serverTimestamp(),
               verifiedAutomatically: true,
               verificationMethod: 'IMAP_MANUAL'
             });
           }

           return res.json({ success: true, message: "Payment verified successfully!" });
         } else {
           return res.status(404).json({ error: "User not found." });
         }
      } else {
        // Mark as Rejected if not found
        if (admin.apps.length > 0) {
          await requestDocRef.update({
            status: 'Rejected',
            failureReason: 'Verification failed: Amount mismatch or Transaction ID not found in confirmation email.',
            processedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } else {
          await updateDoc(requestDocRef, {
            status: 'Rejected',
            failureReason: 'Verification failed: Amount mismatch or Transaction ID not found in confirmation email.',
            processedAt: serverTimestamp()
          });
        }

        return res.status(404).json({ 
          error: `Verification Failed: We could not find a confirmed payment of ${targetAmount} for ID ${transactionId}. Please wait for your bank confirmation email or ensure the amount is correct. This request has been rejected.`
        });
      }

    } catch (error: any) {
      console.error("[Verification] Error:", error);
      return res.status(500).json({ error: "Internal server error during verification: " + error.message });
    }
  });

  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `API Route not found: ${req.method} ${req.url}` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(Number(PORT), "0.0.0.0", async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Test Firebase connection
    try {
      const testSnap = await getDoc(doc(db, "settings", "app_config"));
      console.log("[Firebase] Connection test successful. Config exists:", testSnap.exists());
    } catch (error) {
      console.error("[Firebase] Connection test failed (Check rules):", error);
    }
  });
}

startServer();
