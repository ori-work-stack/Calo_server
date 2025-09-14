// Achievement system types
export interface Achievement {
  id: string;
  key: string;
  title: string;
  description: string;
  category: AchievementCategory;
  xpReward: number;
  icon: string;
  rarity: AchievementRarity;
  progress: number;
  maxProgress: number;
  unlocked: boolean;
  unlockedDate?: Date;
}

export type AchievementCategory = 
  | 'MILESTONE' 
  | 'GOAL' 
  | 'STREAK' 
  | 'LEVEL' 
  | 'SPECIAL'
  | 'CONSISTENCY'
  | 'IMPROVEMENT';

export type AchievementRarity = 
  | 'COMMON' 
  | 'UNCOMMON' 
  | 'RARE' 
  | 'EPIC' 
  | 'LEGENDARY';

export interface UserStats {
  currentStreak: number;
  bestStreak: number;
  totalCompleteDays: number;
  level: number;
  totalWaterGoals: number;
  totalCalorieGoals: number;
  totalXP: number;
  aiRequestsCount: number;
}

export interface AchievementProgress {
  newAchievements: Achievement[];
  xpGained: number;
  leveledUp: boolean;
  newLevel?: number;
}

export interface UserAchievementData {
  unlockedAchievements: Achievement[];
  lockedAchievements: Achievement[];
  userStats: {
    level: number;
    currentXP: number;
    totalPoints: number;
    currentStreak: number;
    bestStreak: number;
    totalCompleteDays: number;
    xpToNextLevel: number;
    xpProgress: number;
  };
}