export const categoryIconMap: Record<string, string> = {
  'youtube': '🎬',
  'instagram': '📸',
  'facebook': '👥',
  'telegram': '✈️',
  'twitter': '🐦',
  'tiktok': '🎵',
  'spotify': '🎧',
  'discord': '💬',
  'twitch': '🎮',
  'website': '🌐',
  'traffic': '🚦',
  'google': '🔍',
  'linkedin': '💼',
  'pinterest': '📌',
  'snapchat': '👻',
  'threads': '🧵',
  'likes': '❤️',
  'followers': '👤',
  'views': '👁️',
  'comments': '💬',
  'shares': '🔄',
  'subscribers': '🔔',
  'members': '👥',
  'watch time': '⏱️',
  'retweets': '🔄',
  'reactions': '🎭',
  'votes': '🗳️',
  'reviews': '⭐',
  'premium': '💎',
  'cheap': '💸',
  'fast': '⚡',
  'real': '✅',
  'active': '🔥',
  'non drop': '🛡️',
  'guaranteed': '🔐',
  'ramadan': '🌙',
  'offer': '🎁',
  'bonus': '🎊',
  'fb': '👥',
  'ig': '📸',
  'yt': '🎬',
  'tg': '✈️',
  'ind': '🇮🇳',
  'indian': '🇮🇳',
  'usa': '🇺🇸',
  'global': '🌍',
  'world': '🌍',
  'cheapest': '💸',
  'best': '⭐',
  'high': '📈',
  'low': '📉',
  'drop': '🛡️',
  'no drop': '🛡️',
  'refill': '♻️',
  'instant': '⚡',
  'super': '🔥',
  'ultra': '🔥',
};

export const getCategoryIcon = (categoryName: string): string => {
  const lowerName = (categoryName || '').toLowerCase();
  
  // Check for direct matches or keywords
  // Sort keys by length descending to match more specific keywords first
  const sortedKeywords = Object.keys(categoryIconMap).sort((a, b) => b.length - a.length);
  
  for (const keyword of sortedKeywords) {
    if (lowerName.includes(keyword)) {
      return categoryIconMap[keyword];
    }
  }
  
  // Default icon if no match found - using a star instead of a folder
  return '✨';
};
