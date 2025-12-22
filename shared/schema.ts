import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, numeric, integer, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export auth models
export * from "./models/auth";

// License codes enum values
export const LICENSE_CODES = ['CC0', 'PDM', 'CC_BY', 'CC_BY_SA', 'CC_BY_NC', 'CC_BY_NC_SA', 'ODBL', 'ALL_RIGHTS_RESERVED', 'UNKNOWN'] as const;
export type LicenseCode = typeof LICENSE_CODES[number];

// Entity types enum values
export const ENTITY_TYPES = ['PERSON', 'MINT', 'DENOMINATION', 'METAL', 'PLACE', 'REFERENCE_WORK', 'KEYWORD'] as const;
export type EntityType = typeof ENTITY_TYPES[number];

// Edge types enum values
export const EDGE_TYPES = ['ISSUED_BY', 'MINTED_AT', 'HAS_DENOMINATION', 'HAS_METAL', 'CITES_REFERENCE', 'CANDIDATE_TYPE', 'PRIMARY_TYPE', 'APPEARED_IN', 'MATCHES_LOT', 'DIE_OBV', 'DIE_REV', 'DIE_LINK'] as const;
export type EdgeType = typeof EDGE_TYPES[number];

// Sources table - Rights registry
export const sources = pgTable("sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  homepageUrl: text("homepage_url"),
  accessMethod: text("access_method").notNull(),
  baseUrl: text("base_url"),
  defaultLicenseMetadata: text("default_license_metadata").notNull().default('UNKNOWN'),
  defaultLicenseImages: text("default_license_images").notNull().default('UNKNOWN'),
  defaultActions: jsonb("default_actions").notNull().default({}),
  attributionTemplate: text("attribution_template"),
  rightsStatementUrl: text("rights_statement_url"),
  rateLimitPerMin: integer("rate_limit_per_min"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  isSample: boolean("is_sample").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSourceSchema = createInsertSchema(sources).omit({ createdAt: true });
export type InsertSource = z.infer<typeof insertSourceSchema>;
export type Source = typeof sources.$inferSelect;

// Rights records table
export const rightsRecords = pgTable("rights_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceId: text("source_id").notNull().references(() => sources.id),
  sourceRecordId: text("source_record_id"),
  sourceUrl: text("source_url").notNull(),
  licenseMetadata: text("license_metadata").notNull().default('UNKNOWN'),
  licenseImages: text("license_images").notNull().default('UNKNOWN'),
  commercialOk: boolean("commercial_ok").notNull().default(false),
  rehostOk: boolean("rehost_ok").notNull().default(false),
  cacheOk: boolean("cache_ok").notNull().default(false),
  embedOk: boolean("embed_ok").notNull().default(false),
  computeEmbeddingsOk: boolean("compute_embeddings_ok").notNull().default(false),
  attributionText: text("attribution_text"),
  attributionUrl: text("attribution_url"),
  rightsStatementUrl: text("rights_statement_url"),
  rightsRaw: jsonb("rights_raw"),
  resolvedAt: timestamp("resolved_at").notNull().defaultNow(),
}, (table) => [
  index("rights_records_source_idx").on(table.sourceId),
  index("rights_records_url_idx").on(table.sourceUrl),
]);

export const insertRightsRecordSchema = createInsertSchema(rightsRecords).omit({ id: true, resolvedAt: true });
export type InsertRightsRecord = z.infer<typeof insertRightsRecordSchema>;
export type RightsRecord = typeof rightsRecords.$inferSelect;

// Image assets table
export const imageAssets = pgTable("image_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerUserId: varchar("owner_user_id"),
  rightsId: varchar("rights_id").references(() => rightsRecords.id),
  kind: text("kind").notNull(),
  originalUrl: text("original_url"),
  storageUrl: text("storage_url"),
  width: integer("width"),
  height: integer("height"),
  mimeType: text("mime_type"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertImageAssetSchema = createInsertSchema(imageAssets).omit({ id: true, createdAt: true });
export type InsertImageAsset = z.infer<typeof insertImageAssetSchema>;
export type ImageAsset = typeof imageAssets.$inferSelect;

// User coins table - Portfolio
export const userCoins = pgTable("user_coins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  obvImageId: varchar("obv_image_id").references(() => imageAssets.id),
  revImageId: varchar("rev_image_id").references(() => imageAssets.id),
  weightG: numeric("weight_g", { precision: 10, scale: 3 }),
  diameterMm: numeric("diameter_mm", { precision: 10, scale: 2 }),
  axis: integer("axis"),
  metal: text("metal"),
  denomination: text("denomination"),
  mint: text("mint"),
  ruler: text("ruler"),
  dateFrom: integer("date_from"),
  dateTo: integer("date_to"),
  obvLegend: text("obv_legend"),
  revLegend: text("rev_legend"),
  reference: text("reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("user_coins_user_idx").on(table.userId),
]);

export const insertUserCoinSchema = createInsertSchema(userCoins).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserCoin = z.infer<typeof insertUserCoinSchema>;
export type UserCoin = typeof userCoins.$inferSelect;

// User coin relations
export const userCoinsRelations = relations(userCoins, ({ one }) => ({
  obvImage: one(imageAssets, {
    fields: [userCoins.obvImageId],
    references: [imageAssets.id],
  }),
  revImage: one(imageAssets, {
    fields: [userCoins.revImageId],
    references: [imageAssets.id],
  }),
}));

// Entities table - Canonical entities
export const entities = pgTable("entities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  label: text("label").notNull(),
  wikidataQid: text("wikidata_qid"),
  nomismaUri: text("nomisma_uri"),
  pleiadesUri: text("pleiades_uri"),
  geonamesId: text("geonames_id"),
  isSample: boolean("is_sample").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertEntitySchema = createInsertSchema(entities).omit({ id: true, createdAt: true });
export type InsertEntity = z.infer<typeof insertEntitySchema>;
export type Entity = typeof entities.$inferSelect;

// Coin types table
export const coinTypes = pgTable("coin_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceId: text("source_id").notNull().references(() => sources.id),
  sourceRecordId: text("source_record_id"),
  label: text("label").notNull(),
  dateFrom: integer("date_from"),
  dateTo: integer("date_to"),
  obvLegend: text("obv_legend"),
  revLegend: text("rev_legend"),
  referenceText: text("reference_text"),
  rightsId: varchar("rights_id").references(() => rightsRecords.id),
  imageUrl: text("image_url"),
  isSample: boolean("is_sample").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCoinTypeSchema = createInsertSchema(coinTypes).omit({ id: true, createdAt: true });
export type InsertCoinType = z.infer<typeof insertCoinTypeSchema>;
export type CoinType = typeof coinTypes.$inferSelect;

// Watchlists table
export const watchlists = pgTable("watchlists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  rules: jsonb("rules").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWatchlistSchema = createInsertSchema(watchlists).omit({ id: true, createdAt: true });
export type InsertWatchlist = z.infer<typeof insertWatchlistSchema>;
export type Watchlist = typeof watchlists.$inferSelect;

// Notifications table
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  payload: jsonb("payload").notNull().default({}),
  sentVia: text("sent_via"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("notifications_user_idx").on(table.userId, table.createdAt),
]);

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// Similar matches table (for coin analysis results)
export const similarMatches = pgTable("similar_matches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userCoinId: varchar("user_coin_id").notNull().references(() => userCoins.id, { onDelete: 'cascade' }),
  coinTypeId: varchar("coin_type_id").references(() => coinTypes.id),
  confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
  reasons: jsonb("reasons").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSimilarMatchSchema = createInsertSchema(similarMatches).omit({ id: true, createdAt: true });
export type InsertSimilarMatch = z.infer<typeof insertSimilarMatchSchema>;
export type SimilarMatch = typeof similarMatches.$inferSelect;

// Ingestion runs table - Track ingestion jobs
export const INGESTION_STATUS = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const;
export type IngestionStatus = typeof INGESTION_STATUS[number];

export const ingestionRuns = pgTable("ingestion_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceId: text("source_id").notNull().references(() => sources.id),
  status: text("status").notNull().default('PENDING'),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  recordsProcessed: integer("records_processed").notNull().default(0),
  recordsIngested: integer("records_ingested").notNull().default(0),
  recordsFailed: integer("records_failed").notNull().default(0),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("ingestion_runs_source_idx").on(table.sourceId),
  index("ingestion_runs_status_idx").on(table.status),
]);

export const insertIngestionRunSchema = createInsertSchema(ingestionRuns).omit({ id: true, createdAt: true });
export type InsertIngestionRun = z.infer<typeof insertIngestionRunSchema>;
export type IngestionRun = typeof ingestionRuns.$inferSelect;
