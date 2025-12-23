import { 
  users, userCoins, watchlists, notifications, sources, imageAssets, similarMatches,
  coinTypes, entities, entityEdges, ingestionRuns, rightsRecords, ingestionLogs, embeddingJobs,
  type User, type UpsertUser, type UserCoin, type InsertUserCoin,
  type Watchlist, type InsertWatchlist, type Notification, type InsertNotification,
  type Source, type InsertSource, type ImageAsset, type InsertImageAsset,
  type SimilarMatch, type InsertSimilarMatch, type CoinType, type InsertCoinType,
  type Entity, type InsertEntity, type EntityEdge, type InsertEntityEdge,
  type IngestionRun, type InsertIngestionRun,
  type RightsRecord, type InsertRightsRecord,
  type IngestionLog, type InsertIngestionLog,
  type EmbeddingJob, EDGE_TYPES
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, ilike, between, sql } from "drizzle-orm";

export interface CoinTypeMatch {
  coinType: CoinType;
  confidence: number;
  reasons: string[];
}

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
  
  // Image Assets
  createImageAsset(image: InsertImageAsset): Promise<ImageAsset>;
  getImageAssetById(id: string): Promise<ImageAsset | undefined>;
  
  // Coin Types
  searchCoinTypes(filters: { ruler?: string; denomination?: string; dateFrom?: number; dateTo?: number; limit?: number }): Promise<CoinType[]>;
  getCoinTypeById(id: string): Promise<CoinType | undefined>;
  getCoinTypeBySourceRecord(sourceId: string, sourceRecordId: string): Promise<CoinType | undefined>;
  createCoinType(coinType: InsertCoinType): Promise<CoinType>;
  
  // Rights Records
  createRightsRecord(rights: InsertRightsRecord): Promise<RightsRecord>;
  getRightsRecordById(id: string): Promise<RightsRecord | undefined>;
  
  // Entities
  searchEntities(filters: { type?: string; search?: string }): Promise<Entity[]>;
  createEntity(entity: InsertEntity): Promise<Entity>;
  getEntityById(id: string): Promise<Entity | undefined>;
  
  // Entity Edges (Graph)
  createEntityEdge(edge: InsertEntityEdge): Promise<EntityEdge>;
  getEntityEdgeById(id: string): Promise<EntityEdge | undefined>;
  getOutgoingEdges(entityId: string, edgeType?: string): Promise<Array<EntityEdge & { target: Entity }>>;
  getIncomingEdges(entityId: string, edgeType?: string): Promise<Array<EntityEdge & { source: Entity }>>;
  getRelatedEntities(entityId: string, options?: { edgeTypes?: string[]; maxDepth?: number }): Promise<Array<{ entity: Entity; path: string[]; depth: number }>>;
  
  // Similar Matches
  getMatchesByCoin(coinId: string): Promise<SimilarMatch[]>;
  createSimilarMatch(match: InsertSimilarMatch): Promise<SimilarMatch>;
  findMatchingCoinTypes(coin: UserCoin): Promise<CoinTypeMatch[]>;
  
  // Ingestion Runs
  getIngestionRuns(filters?: { sourceId?: string; status?: string }): Promise<IngestionRun[]>;
  getIngestionRunById(id: string): Promise<IngestionRun | undefined>;
  createIngestionRun(run: InsertIngestionRun): Promise<IngestionRun>;
  updateIngestionRun(id: string, run: Partial<InsertIngestionRun>): Promise<IngestionRun | undefined>;
  getIngestionStats(): Promise<{ totalRuns: number; completedRuns: number; failedRuns: number; totalIngested: number }>;
  
  // Ingestion Logs
  getIngestionLogsByRun(runId: string, filters?: { level?: string; limit?: number }): Promise<IngestionLog[]>;
  createIngestionLog(log: InsertIngestionLog): Promise<IngestionLog>;
  getLatestCursor(runId: string): Promise<string | null>;
  
  // Watchlist Alerts
  getAllEnabledWatchlists(): Promise<Watchlist[]>;
  
  // Rights Compliance
  getRightsIssues(filters?: { sourceId?: string; licenseType?: string }): Promise<{
    issues: Array<RightsRecord & { source?: Source; issueType: string }>;
    summary: { total: number; unknownLicense: number; missingAttribution: number };
  }>;
  
  // Seeding
  seedMuseumData(): Promise<void>;
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

  // Image Assets
  async createImageAsset(image: InsertImageAsset): Promise<ImageAsset> {
    const [created] = await db.insert(imageAssets).values(image).returning();
    return created;
  }

  async getImageAssetById(id: string): Promise<ImageAsset | undefined> {
    const [image] = await db.select().from(imageAssets).where(eq(imageAssets.id, id));
    return image || undefined;
  }

  // Coin Types
  async searchCoinTypes(filters: { ruler?: string; denomination?: string; dateFrom?: number; dateTo?: number; limit?: number }): Promise<CoinType[]> {
    const conditions = [];
    
    if (filters.ruler) {
      conditions.push(ilike(coinTypes.label, `%${filters.ruler}%`));
    }
    if (filters.denomination) {
      conditions.push(ilike(coinTypes.label, `%${filters.denomination}%`));
    }
    if (filters.dateFrom !== undefined) {
      conditions.push(sql`${coinTypes.dateFrom} >= ${filters.dateFrom} OR ${coinTypes.dateTo} >= ${filters.dateFrom}`);
    }
    if (filters.dateTo !== undefined) {
      conditions.push(sql`${coinTypes.dateTo} <= ${filters.dateTo} OR ${coinTypes.dateFrom} <= ${filters.dateTo}`);
    }
    
    const query = conditions.length > 0
      ? db.select().from(coinTypes).where(and(...conditions)).limit(filters.limit || 50)
      : db.select().from(coinTypes).limit(filters.limit || 50);
    
    return query;
  }

  async getCoinTypeById(id: string): Promise<CoinType | undefined> {
    const [coinType] = await db.select().from(coinTypes).where(eq(coinTypes.id, id));
    return coinType || undefined;
  }

  async getCoinTypeBySourceRecord(sourceId: string, sourceRecordId: string): Promise<CoinType | undefined> {
    const [coinType] = await db
      .select()
      .from(coinTypes)
      .where(and(eq(coinTypes.sourceId, sourceId), eq(coinTypes.sourceRecordId, sourceRecordId)));
    return coinType || undefined;
  }

  async createCoinType(coinType: InsertCoinType): Promise<CoinType> {
    const [created] = await db.insert(coinTypes).values(coinType).returning();
    return created;
  }

  // Rights Records
  async createRightsRecord(rights: InsertRightsRecord): Promise<RightsRecord> {
    const [created] = await db.insert(rightsRecords).values(rights).returning();
    return created;
  }

  async getRightsRecordById(id: string): Promise<RightsRecord | undefined> {
    const [record] = await db.select().from(rightsRecords).where(eq(rightsRecords.id, id));
    return record || undefined;
  }

  // Entities
  async searchEntities(filters: { type?: string; search?: string }): Promise<Entity[]> {
    const conditions = [];
    
    if (filters.type) {
      conditions.push(eq(entities.type, filters.type));
    }
    if (filters.search) {
      conditions.push(ilike(entities.label, `%${filters.search}%`));
    }
    
    const query = conditions.length > 0
      ? db.select().from(entities).where(and(...conditions)).limit(100)
      : db.select().from(entities).limit(100);
    
    return query;
  }

  async createEntity(entity: InsertEntity): Promise<Entity> {
    const [created] = await db.insert(entities).values(entity).returning();
    return created;
  }

  // Similar Matches
  async getMatchesByCoin(coinId: string): Promise<SimilarMatch[]> {
    return db.select().from(similarMatches).where(eq(similarMatches.userCoinId, coinId)).orderBy(desc(similarMatches.confidence));
  }

  async createSimilarMatch(match: InsertSimilarMatch): Promise<SimilarMatch> {
    const [created] = await db.insert(similarMatches).values(match).returning();
    return created;
  }

  // Matching service - find similar coin types based on metadata
  async findMatchingCoinTypes(coin: UserCoin): Promise<CoinTypeMatch[]> {
    // Get all coin types for matching
    const allCoinTypes = await db.select().from(coinTypes).limit(100);
    
    const matches: CoinTypeMatch[] = [];
    
    for (const ct of allCoinTypes) {
      let confidence = 0;
      const reasons: string[] = [];
      
      // Match by ruler (in label)
      if (coin.ruler && ct.label.toLowerCase().includes(coin.ruler.toLowerCase())) {
        confidence += 0.3;
        reasons.push(`Ruler match: ${coin.ruler}`);
      }
      
      // Match by denomination
      if (coin.denomination && ct.label.toLowerCase().includes(coin.denomination.toLowerCase())) {
        confidence += 0.2;
        reasons.push(`Denomination match: ${coin.denomination}`);
      }
      
      // Match by date range overlap
      if (coin.dateFrom && coin.dateTo && ct.dateFrom && ct.dateTo) {
        const coinStart = coin.dateFrom;
        const coinEnd = coin.dateTo;
        const typeStart = ct.dateFrom;
        const typeEnd = ct.dateTo;
        
        // Check for overlap
        if (coinStart <= typeEnd && coinEnd >= typeStart) {
          confidence += 0.25;
          reasons.push(`Date range overlap: ${typeStart} - ${typeEnd} CE`);
        }
      } else if (coin.dateFrom && ct.dateFrom && ct.dateTo) {
        if (coin.dateFrom >= ct.dateFrom && coin.dateFrom <= ct.dateTo) {
          confidence += 0.2;
          reasons.push(`Date within range: ${ct.dateFrom} - ${ct.dateTo} CE`);
        }
      }
      
      // Match by mint
      if (coin.mint && ct.label.toLowerCase().includes(coin.mint.toLowerCase())) {
        confidence += 0.15;
        reasons.push(`Mint match: ${coin.mint}`);
      }
      
      // Match by metal
      if (coin.metal && ct.label.toLowerCase().includes(coin.metal.toLowerCase())) {
        confidence += 0.1;
        reasons.push(`Metal match: ${coin.metal}`);
      }
      
      // Only include matches with some confidence
      if (confidence > 0) {
        matches.push({
          coinType: ct,
          confidence: Math.min(confidence, 0.99), // Cap at 99%
          reasons,
        });
      }
    }
    
    // Sort by confidence descending and return top 10
    return matches
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);
  }

  // Seed museum data
  async seedMuseumData(): Promise<void> {
    // Check if data already exists
    const existingSources = await db.select().from(sources).limit(1);
    if (existingSources.length > 0) {
      console.log("Museum data already seeded");
      return;
    }

    // Seed sources (museum collections)
    const museumSources = [
      {
        id: "british-museum",
        name: "British Museum",
        homepageUrl: "https://www.britishmuseum.org",
        accessMethod: "API",
        defaultLicenseMetadata: "CC_BY_NC_SA",
        defaultLicenseImages: "CC_BY_NC_SA",
        defaultActions: { embed: true, cache: true },
        attributionTemplate: "Image courtesy of the British Museum, under CC BY-NC-SA 4.0",
      },
      {
        id: "ans",
        name: "American Numismatic Society",
        homepageUrl: "https://numismatics.org",
        accessMethod: "IIIF",
        defaultLicenseMetadata: "CC_BY",
        defaultLicenseImages: "CC_BY",
        defaultActions: { embed: true, cache: true, compute: true },
        attributionTemplate: "Courtesy of the American Numismatic Society",
      },
      {
        id: "wildwinds",
        name: "Wildwinds",
        homepageUrl: "https://www.wildwinds.com",
        accessMethod: "SCRAPE",
        defaultLicenseMetadata: "UNKNOWN",
        defaultLicenseImages: "ALL_RIGHTS_RESERVED",
        defaultActions: { embed: false, cache: false },
        attributionTemplate: "Reference from Wildwinds.com",
      },
      {
        id: "coinarchives",
        name: "CoinArchives",
        homepageUrl: "https://www.coinarchives.com",
        accessMethod: "MANUAL",
        defaultLicenseMetadata: "ALL_RIGHTS_RESERVED",
        defaultLicenseImages: "ALL_RIGHTS_RESERVED",
        defaultActions: {},
        attributionTemplate: "From CoinArchives auction records",
      },
    ];

    for (const source of museumSources) {
      await db.insert(sources).values(source).onConflictDoNothing();
    }

    // Seed entities (rulers, mints, denominations)
    const seedEntities = [
      // Roman Emperors
      { type: "PERSON", label: "Augustus", wikidataQid: "Q1405" },
      { type: "PERSON", label: "Nero", wikidataQid: "Q1413" },
      { type: "PERSON", label: "Trajan", wikidataQid: "Q1425" },
      { type: "PERSON", label: "Hadrian", wikidataQid: "Q1427" },
      { type: "PERSON", label: "Marcus Aurelius", wikidataQid: "Q1430" },
      { type: "PERSON", label: "Constantine I", wikidataQid: "Q8413" },
      // Greek rulers
      { type: "PERSON", label: "Alexander the Great", wikidataQid: "Q8409" },
      { type: "PERSON", label: "Philip II of Macedon", wikidataQid: "Q41076" },
      // Mints
      { type: "MINT", label: "Rome" },
      { type: "MINT", label: "Alexandria" },
      { type: "MINT", label: "Antioch" },
      { type: "MINT", label: "Constantinople" },
      { type: "MINT", label: "Lugdunum" },
      { type: "MINT", label: "Athens" },
      { type: "MINT", label: "Corinth" },
      // Denominations
      { type: "DENOMINATION", label: "Denarius" },
      { type: "DENOMINATION", label: "Aureus" },
      { type: "DENOMINATION", label: "Sestertius" },
      { type: "DENOMINATION", label: "As" },
      { type: "DENOMINATION", label: "Follis" },
      { type: "DENOMINATION", label: "Solidus" },
      { type: "DENOMINATION", label: "Tetradrachm" },
      { type: "DENOMINATION", label: "Drachm" },
      { type: "DENOMINATION", label: "Stater" },
      // Metals
      { type: "METAL", label: "Gold" },
      { type: "METAL", label: "Silver" },
      { type: "METAL", label: "Bronze" },
      { type: "METAL", label: "Copper" },
      { type: "METAL", label: "Electrum" },
    ];

    for (const entity of seedEntities) {
      await db.insert(entities).values(entity).onConflictDoNothing();
    }

    // Seed coin types (reference coins from museums)
    const seedCoinTypes = [
      {
        sourceId: "british-museum",
        label: "Augustus Denarius - Capricorn reverse",
        dateFrom: -27,
        dateTo: 14,
        obvLegend: "CAESAR AVGVSTVS",
        revLegend: "CAPRICORN",
        referenceText: "RIC I 126",
      },
      {
        sourceId: "british-museum",
        label: "Nero Sestertius - Roma seated",
        dateFrom: 54,
        dateTo: 68,
        obvLegend: "NERO CLAVD CAESAR AVG GER",
        revLegend: "ROMA S C",
        referenceText: "RIC I 273",
      },
      {
        sourceId: "ans",
        label: "Trajan Denarius - Optimus Princeps",
        dateFrom: 98,
        dateTo: 117,
        obvLegend: "IMP TRAIANO AVG GER DAC P M TR P",
        revLegend: "COS V P P S P Q R OPTIMO PRINC",
        referenceText: "RIC II 147",
      },
      {
        sourceId: "ans",
        label: "Hadrian Denarius - Travel series",
        dateFrom: 117,
        dateTo: 138,
        obvLegend: "HADRIANVS AVG COS III P P",
        revLegend: "AEGYPTOS",
        referenceText: "RIC II 297",
      },
      {
        sourceId: "british-museum",
        label: "Marcus Aurelius Aureus",
        dateFrom: 161,
        dateTo: 180,
        obvLegend: "M AVREL ANTONINVS AVG",
        revLegend: "PROVIDENTIA DEORVM",
        referenceText: "RIC III 456",
      },
      {
        sourceId: "ans",
        label: "Constantine I Follis - Sol Invictus",
        dateFrom: 306,
        dateTo: 337,
        obvLegend: "CONSTANTINVS P F AVG",
        revLegend: "SOLI INVICTO COMITI",
        referenceText: "RIC VII 51",
      },
      {
        sourceId: "british-museum",
        label: "Alexander III Tetradrachm - Zeus seated",
        dateFrom: -336,
        dateTo: -323,
        obvLegend: "Head of Herakles",
        revLegend: "ALEXANDROY Zeus seated",
        referenceText: "Price 3998",
      },
      {
        sourceId: "ans",
        label: "Philip II Gold Stater - Apollo",
        dateFrom: -359,
        dateTo: -336,
        obvLegend: "Head of Apollo",
        revLegend: "FILIPPOY Charioteer",
        referenceText: "Le Rider 145",
      },
      {
        sourceId: "wildwinds",
        label: "Athens Silver Tetradrachm - Owl",
        dateFrom: -454,
        dateTo: -404,
        obvLegend: "Head of Athena",
        revLegend: "AOE Owl",
        referenceText: "Svoronos 23.1",
      },
      {
        sourceId: "coinarchives",
        label: "Byzantine Solidus - Justinian I",
        dateFrom: 527,
        dateTo: 565,
        obvLegend: "DN IVSTINIANVS PP AVG",
        revLegend: "VICTORIA AVGGG",
        referenceText: "Sear 140",
      },
    ];

    for (const coinType of seedCoinTypes) {
      await db.insert(coinTypes).values(coinType).onConflictDoNothing();
    }

    console.log("Museum data seeded successfully");
  }

  // Ingestion Runs
  async getIngestionRuns(filters?: { sourceId?: string; status?: string }): Promise<IngestionRun[]> {
    const conditions = [];
    if (filters?.sourceId) conditions.push(eq(ingestionRuns.sourceId, filters.sourceId));
    if (filters?.status) conditions.push(eq(ingestionRuns.status, filters.status));
    
    if (conditions.length > 0) {
      return db.select().from(ingestionRuns).where(and(...conditions)).orderBy(desc(ingestionRuns.createdAt));
    }
    return db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.createdAt));
  }

  async getIngestionRunById(id: string): Promise<IngestionRun | undefined> {
    const [run] = await db.select().from(ingestionRuns).where(eq(ingestionRuns.id, id));
    return run || undefined;
  }

  async createIngestionRun(run: InsertIngestionRun): Promise<IngestionRun> {
    const [created] = await db.insert(ingestionRuns).values(run).returning();
    return created;
  }

  async updateIngestionRun(id: string, run: Partial<InsertIngestionRun>): Promise<IngestionRun | undefined> {
    const [updated] = await db
      .update(ingestionRuns)
      .set(run)
      .where(eq(ingestionRuns.id, id))
      .returning();
    return updated || undefined;
  }

  async getIngestionStats(): Promise<{ totalRuns: number; completedRuns: number; failedRuns: number; totalIngested: number }> {
    const allRuns = await db.select().from(ingestionRuns);
    return {
      totalRuns: allRuns.length,
      completedRuns: allRuns.filter(r => r.status === 'COMPLETED').length,
      failedRuns: allRuns.filter(r => r.status === 'FAILED').length,
      totalIngested: allRuns.reduce((sum, r) => sum + (r.recordsIngested || 0), 0),
    };
  }
  
  // Ingestion Logs
  async getIngestionLogsByRun(runId: string, filters?: { level?: string; limit?: number }): Promise<IngestionLog[]> {
    const conditions = [eq(ingestionLogs.runId, runId)];
    if (filters?.level) conditions.push(eq(ingestionLogs.level, filters.level));
    
    let query = db.select().from(ingestionLogs).where(and(...conditions)).orderBy(desc(ingestionLogs.createdAt));
    
    if (filters?.limit) {
      return query.limit(filters.limit);
    }
    return query;
  }
  
  async createIngestionLog(log: InsertIngestionLog): Promise<IngestionLog> {
    const [created] = await db.insert(ingestionLogs).values(log).returning();
    return created;
  }
  
  async getLatestCursor(runId: string): Promise<string | null> {
    const [log] = await db.select({ cursor: ingestionLogs.cursor })
      .from(ingestionLogs)
      .where(and(eq(ingestionLogs.runId, runId), sql`${ingestionLogs.cursor} IS NOT NULL`))
      .orderBy(desc(ingestionLogs.createdAt))
      .limit(1);
    return log?.cursor || null;
  }

  // Watchlist Alerts
  async getAllEnabledWatchlists(): Promise<Watchlist[]> {
    return db.select().from(watchlists).where(eq(watchlists.isEnabled, true));
  }

  // Rights Compliance
  async getRightsIssues(filters?: { sourceId?: string; licenseType?: string }): Promise<{
    issues: Array<RightsRecord & { source?: Source; issueType: string }>;
    summary: { total: number; unknownLicense: number; missingAttribution: number };
  }> {
    // Build conditions for rights records with issues
    const conditions = [];
    
    if (filters?.sourceId) {
      conditions.push(eq(rightsRecords.sourceId, filters.sourceId));
    }
    if (filters?.licenseType) {
      conditions.push(eq(rightsRecords.licenseImages, filters.licenseType));
    }
    
    // Get all rights records
    let query = db.select().from(rightsRecords);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }
    const allRecords = await query.orderBy(desc(rightsRecords.resolvedAt));
    
    // Get all sources for enrichment
    const allSources = await db.select().from(sources);
    const sourceMap = new Map(allSources.map(s => [s.id, s]));
    
    // Filter for issues: unknown license or missing attribution
    const issues: Array<RightsRecord & { source?: Source; issueType: string }> = [];
    let unknownLicense = 0;
    let missingAttribution = 0;
    
    for (const record of allRecords) {
      const hasUnknownLicense = record.licenseImages === 'UNKNOWN' || record.licenseMetadata === 'UNKNOWN';
      const hasMissingAttribution = !record.attributionText && !record.attributionTemplate;
      
      if (hasUnknownLicense) {
        unknownLicense++;
      }
      if (hasMissingAttribution) {
        missingAttribution++;
      }
      
      if (hasUnknownLicense || hasMissingAttribution) {
        let issueType = '';
        if (hasUnknownLicense && hasMissingAttribution) {
          issueType = 'UNKNOWN_LICENSE_AND_MISSING_ATTRIBUTION';
        } else if (hasUnknownLicense) {
          issueType = 'UNKNOWN_LICENSE';
        } else {
          issueType = 'MISSING_ATTRIBUTION';
        }
        
        issues.push({
          ...record,
          source: sourceMap.get(record.sourceId),
          issueType,
        });
      }
    }
    
    return {
      issues,
      summary: {
        total: allRecords.length,
        unknownLicense,
        missingAttribution,
      },
    };
  }

  // Embedding Jobs
  async getEmbeddingJobs(filters: { status?: string; limit?: number; offset?: number }): Promise<EmbeddingJob[]> {
    const conditions = [];
    if (filters.status) conditions.push(eq(embeddingJobs.status, filters.status));
    
    let query = db.select().from(embeddingJobs);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }
    
    return query
      .orderBy(desc(embeddingJobs.createdAt))
      .limit(filters.limit || 50)
      .offset(filters.offset || 0);
  }

  async retryEmbeddingJob(id: string): Promise<EmbeddingJob | undefined> {
    const [job] = await db.select().from(embeddingJobs).where(eq(embeddingJobs.id, id));
    if (!job) return undefined;
    
    // Only allow retrying failed or skipped jobs
    if (job.status !== 'FAILED' && job.status !== 'SKIPPED') {
      return undefined;
    }
    
    const [updated] = await db
      .update(embeddingJobs)
      .set({
        status: 'PENDING',
        attempts: 0,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
      })
      .where(eq(embeddingJobs.id, id))
      .returning();
    return updated;
  }

  async cancelEmbeddingJob(id: string): Promise<EmbeddingJob | undefined> {
    const [job] = await db.select().from(embeddingJobs).where(eq(embeddingJobs.id, id));
    if (!job || job.status !== 'PENDING') return undefined;
    
    const [updated] = await db
      .update(embeddingJobs)
      .set({
        status: 'SKIPPED',
        errorMessage: 'Cancelled by admin',
        completedAt: new Date(),
      })
      .where(eq(embeddingJobs.id, id))
      .returning();
    return updated;
  }

  // Entity Edges (Graph)
  async createEntityEdge(edge: InsertEntityEdge): Promise<EntityEdge> {
    const [created] = await db.insert(entityEdges).values(edge).returning();
    return created;
  }

  async getEntityEdgeById(id: string): Promise<EntityEdge | undefined> {
    const [edge] = await db.select().from(entityEdges).where(eq(entityEdges.id, id));
    return edge || undefined;
  }

  async getEntityById(id: string): Promise<Entity | undefined> {
    const [entity] = await db.select().from(entities).where(eq(entities.id, id));
    return entity || undefined;
  }

  async getOutgoingEdges(entityId: string, edgeType?: string): Promise<Array<EntityEdge & { target: Entity }>> {
    const conditions = [eq(entityEdges.srcId, entityId)];
    if (edgeType) {
      conditions.push(eq(entityEdges.edgeType, edgeType));
    }
    
    const edges = await db.select({
      id: entityEdges.id,
      srcId: entityEdges.srcId,
      dstId: entityEdges.dstId,
      edgeType: entityEdges.edgeType,
      confidence: entityEdges.confidence,
      provenance: entityEdges.provenance,
      sourceId: entityEdges.sourceId,
      metadata: entityEdges.metadata,
      createdAt: entityEdges.createdAt,
      target: entities,
    })
      .from(entityEdges)
      .innerJoin(entities, eq(entityEdges.dstId, entities.id))
      .where(and(...conditions));
    
    return edges;
  }

  async getIncomingEdges(entityId: string, edgeType?: string): Promise<Array<EntityEdge & { source: Entity }>> {
    const conditions = [eq(entityEdges.dstId, entityId)];
    if (edgeType) {
      conditions.push(eq(entityEdges.edgeType, edgeType));
    }
    
    const edges = await db.select({
      id: entityEdges.id,
      srcId: entityEdges.srcId,
      dstId: entityEdges.dstId,
      edgeType: entityEdges.edgeType,
      confidence: entityEdges.confidence,
      provenance: entityEdges.provenance,
      sourceId: entityEdges.sourceId,
      metadata: entityEdges.metadata,
      createdAt: entityEdges.createdAt,
      source: entities,
    })
      .from(entityEdges)
      .innerJoin(entities, eq(entityEdges.srcId, entities.id))
      .where(and(...conditions));
    
    return edges;
  }

  async getRelatedEntities(
    entityId: string, 
    options?: { edgeTypes?: string[]; maxDepth?: number }
  ): Promise<Array<{ entity: Entity; path: string[]; depth: number }>> {
    const maxDepth = options?.maxDepth || 2;
    const edgeTypes = options?.edgeTypes || EDGE_TYPES;
    
    // Use recursive CTE for graph traversal
    const result = await db.execute(sql`
      WITH RECURSIVE graph_traversal AS (
        -- Base case: start from the source entity
        SELECT 
          e.id, e.type, e.label, e.wikidata_qid, e.nomisma_uri, 
          e.pleiades_uri, e.geonames_id, e.is_sample, e.created_at,
          ARRAY[${entityId}]::varchar[] as path,
          1 as depth
        FROM entities e
        INNER JOIN entity_edges edge ON edge.dst_id = e.id
        WHERE edge.src_id = ${entityId}
          AND edge.edge_type = ANY(${edgeTypes})
        
        UNION
        
        -- Recursive case: follow edges
        SELECT 
          e.id, e.type, e.label, e.wikidata_qid, e.nomisma_uri,
          e.pleiades_uri, e.geonames_id, e.is_sample, e.created_at,
          gt.path || e.id as path,
          gt.depth + 1 as depth
        FROM entities e
        INNER JOIN entity_edges edge ON edge.dst_id = e.id
        INNER JOIN graph_traversal gt ON edge.src_id = gt.id
        WHERE gt.depth < ${maxDepth}
          AND edge.edge_type = ANY(${edgeTypes})
          AND NOT (e.id = ANY(gt.path))  -- Prevent cycles
      )
      SELECT DISTINCT ON (id) * FROM graph_traversal
      ORDER BY id, depth
      LIMIT 100
    `);
    
    return (result.rows as any[]).map(row => ({
      entity: {
        id: row.id,
        type: row.type,
        label: row.label,
        wikidataQid: row.wikidata_qid,
        nomismaUri: row.nomisma_uri,
        pleiadesUri: row.pleiades_uri,
        geonamesId: row.geonames_id,
        isSample: row.is_sample,
        createdAt: row.created_at,
      } as Entity,
      path: row.path as string[],
      depth: row.depth as number,
    }));
  }
}

export const storage = new DatabaseStorage();
