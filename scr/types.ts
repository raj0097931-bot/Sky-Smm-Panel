export interface UserData {
  uid: string;
  name: string;
  email: string;
  phone: string;
  walletBalance: number;
  totalSpent?: number;
  selectedTheme: string;
  photoURL?: string;
  lastSpinAt?: any;
  spinsToday?: number;
  createdAt: any;
}

export interface SpinnerOption {
  amount: number;
  probability: number;
}

export interface SpinnerConfig {
  options: SpinnerOption[];
  eligibilityDays: number;
  maxSpinsPerDay?: number;
  updatedAt: any;
}

export interface SpinnerLog {
  id: string;
  userId: string;
  userName: string;
  amount: number;
  createdAt: any;
  pinned: boolean;
}

export interface Service {
  id: string;
  api_service_id?: string; // ID from SMM API
  name: string;
  category: string;
  category_icon?: string; // Optional icon for the category
  emoji: string;
  description: string;
  pricePerUnit: number;
  minQty: number;
  maxQty: number;
  enabled: boolean;
  average_time?: string;
}

export interface Order {
  id: string;
  userId: string;
  serviceId: string;
  api_service_id?: string;
  api_order_id?: string;
  serviceName: string;
  category: string;
  link: string;
  quantity: number;
  pricePerUnit: number;
  totalCost: number;
  price?: number; // For backward compatibility
  status: 'Pending' | 'Processing' | 'Completed' | 'Cancelled' | 'Approved' | 'Rejected';
  isGiveaway?: boolean;
  lastRefillAt?: any;
  refillCount?: number;
  createdAt: any;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  bannerUrl?: string;
  actionUrl?: string;
  isGlobal?: boolean;
  createdAt: any;
  userId?: string; // Optional for global notifications
}

export type ThemeType = 'premium' | 'dark-pro' | 'royal-gold' | 'light-minimal' | 'cyber-neon' | 'modern-gaming' | 'black-gold' | 'clean-ui' | 'neon-cyber' | 'neon-blue';
