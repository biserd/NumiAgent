import { 
  users, userCoins, watchlists, notifications, sources, imageAssets, similarMatches,
  type User, type UpsertUser, type UserCoin, type InsertUserCoin,
  type Watchlist, type InsertWatchlist, type Notification, type InsertNotification,
  type Source, type InsertSource, type ImageAsset, type InsertImageAsset,
  type SimilarMatch, type InsertSimilarMatch
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // User Coins
  getCoinsByUser(userId: string): Promise<UserCoin[]>;
  getCoinById(id: string): Promise<UserCoin | undefined>;
  createCoin(coin: InsertUserCoin): Promise<UserCoin>;
  updateCoin(id: string, coin: Partial<InsertUserCoin>): Promise<UserCoin | undefined>;
  deleteCoin(id: string): Promise<boolean>;
  
  // Watchlists
  getWatchlistsByUser(userId: string): Promise<Watchlist[]>;
  getWatchlistById(id: string): Promise<Watchlist | undefined>;
  createWatchlist(watchlist: InsertWatchlist): Promise<Watchlist>;
  updateWatchlist(id: string, watchlist: Partial<InsertWatchlist>): Promise<Watchlist | undefined>;
  deleteWatchlist(id: string): Promise<boolean>;
  
  // Notifications
  getNotificationsByUser(userId: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: string): Promise<boolean>;
  markAllNotificationsRead(userId: string): Promise<boolean>;
  
  // Sources (Admin)
  getSources(): Promise<Source[]>;
  getSourceById(id: string): Promise<Source | undefined>;
  createSource(source: InsertSource): Promise<Source>;
  updateSource(id: string, source: Partial<InsertSource>): Promise<Source | undefined>;
  
  // Similar Matches
  getMatchesByCoin(coinId: string): Promise<SimilarMatch[]>;
  createMatch(match: InsertSimilarMatch): Promise<SimilarMatch>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // User Coins
  async getCoinsByUser(userId: string): Promise<UserCoin[]> {
    return db.select().from(userCoins).where(eq(userCoins.userId, userId)).orderBy(desc(userCoins.createdAt));
  }

  async getCoinById(id: string): Promise<UserCoin | undefined> {
    const [coin] = await db.select().from(userCoins).where(eq(userCoins.id, id));
    return coin || undefined;
  }

  async createCoin(coin: InsertUserCoin): Promise<UserCoin> {
    const [created] = await db.insert(userCoins).values(coin).returning();
    return created;
  }

  async updateCoin(id: string, coin: Partial<InsertUserCoin>): Promise<UserCoin | undefined> {
    const [updated] = await db
      .update(userCoins)
      .set({ ...coin, updatedAt: new Date() })
      .where(eq(userCoins.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteCoin(id: string): Promise<boolean> {
    const result = await db.delete(userCoins).where(eq(userCoins.id, id));
    return true;
  }

  // Watchlists
  async getWatchlistsByUser(userId: string): Promise<Watchlist[]> {
    return db.select().from(watchlists).where(eq(watchlists.userId, userId)).orderBy(desc(watchlists.createdAt));
  }

  async getWatchlistById(id: string): Promise<Watchlist | undefined> {
    const [watchlist] = await db.select().from(watchlists).where(eq(watchlists.id, id));
    return watchlist || undefined;
  }

  async createWatchlist(watchlist: InsertWatchlist): Promise<Watchlist> {
    const [created] = await db.insert(watchlists).values(watchlist).returning();
    return created;
  }

  async updateWatchlist(id: string, watchlist: Partial<InsertWatchlist>): Promise<Watchlist | undefined> {
    const [updated] = await db.update(watchlists).set(watchlist).where(eq(watchlists.id, id)).returning();
    return updated || undefined;
  }

  async deleteWatchlist(id: string): Promise<boolean> {
    await db.delete(watchlists).where(eq(watchlists.id, id));
    return true;
  }

  // Notifications
  async getNotificationsByUser(userId: string): Promise<Notification[]> {
    return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [created] = await db.insert(notifications).values(notification).returning();
    return created;
  }

  async markNotificationRead(id: string): Promise<boolean> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
    return true;
  }

  async markAllNotificationsRead(userId: string): Promise<boolean> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
    return true;
  }

  // Sources
  async getSources(): Promise<Source[]> {
    return db.select().from(sources).orderBy(sources.name);
  }

  async getSourceById(id: string): Promise<Source | undefined> {
    const [source] = await db.select().from(sources).where(eq(sources.id, id));
    return source || undefined;
  }

  async createSource(source: InsertSource): Promise<Source> {
    const [created] = await db.insert(sources).values(source).returning();
    return created;
  }

  async updateSource(id: string, source: Partial<InsertSource>): Promise<Source | undefined> {
    const [updated] = await db.update(sources).set(source).where(eq(sources.id, id)).returning();
    return updated || undefined;
  }

  // Similar Matches
  async getMatchesByCoin(coinId: string): Promise<SimilarMatch[]> {
    return db.select().from(similarMatches).where(eq(similarMatches.userCoinId, coinId)).orderBy(desc(similarMatches.confidence));
  }

  async createMatch(match: InsertSimilarMatch): Promise<SimilarMatch> {
    const [created] = await db.insert(similarMatches).values(match).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
