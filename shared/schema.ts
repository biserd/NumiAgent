import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, numeric, integer, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export auth models
export * from "./models/auth";

// Re-export chat models
export * from "./models/chat";

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
  
  // Enhanced rights tracking
  usageExpiresAt: timestamp("usage_expires_at"),
  derivativeOk: boolean("derivative_ok").notNull().default(false),
  embargoUntil: timestamp("embargo_until"),
  attributionTemplate: text("attribution_template"),
  auditTrail: jsonb("audit_trail").default([]),
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

// Condition grades for numismatic classification
export const CONDITION_GRADES = ['POOR', 'FAIR', 'GOOD', 'VG', 'FINE', 'VF', 'EF', 'AU', 'UNC', 'FDC', 'UNKNOWN'] as const;
export type ConditionGrade = typeof CONDITION_GRADES[number];

// Coin types table
export const coinTypes = pgTable("coin_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceId: text("source_id").notNull().references(() => sources.id),
  sourceRecordId: text("source_record_id"),
  sourceUrl: text("source_url"),
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
  
  // Physical properties
  weightG: numeric("weight_g", { precision: 10, scale: 3 }),
  diameterMm: numeric("diameter_mm", { precision: 10, scale: 2 }),
  dieAxis: integer("die_axis"),
  condition: text("condition"),
  purity: text("purity"),
  
  // Type descriptors
  obvType: text("obv_type"),
  revType: text("rev_type"),
  controlMarks: text("control_marks"),
  
  // Authority/issuer (denormalized for quick access, canonical in entities)
  authority: text("authority"),
  issuer: text("issuer"),
  mint: text("mint"),
  denomination: text("denomination"),
  metal: text("metal"),
  region: text("region"),
});

export const insertCoinTypeSchema = createInsertSchema(coinTypes).omit({ id: true, createdAt: true });
export type InsertCoinType = z.infer<typeof insertCoinTypeSchema>;
export type CoinType = typeof coinTypes.$inferSelect;

// Reference catalog types (RIC, RPC, RRC, SNG, BMC, DOC, etc.)
export const CATALOG_TYPES = ['RIC', 'RPC', 'RRC', 'SNG', 'BMC', 'DOC', 'SEAR', 'HGC', 'MEC', 'CRAWFORD', 'OTHER'] as const;
export type CatalogType = typeof CATALOG_TYPES[number];

// Catalog references table - Standard numismatic references
export const catalogReferences = pgTable("catalog_references", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coinTypeId: varchar("coin_type_id").references(() => coinTypes.id, { onDelete: 'cascade' }),
  userCoinId: varchar("user_coin_id").references(() => userCoins.id, { onDelete: 'cascade' }),
  catalogType: text("catalog_type").notNull(),
  catalogNumber: text("catalog_number").notNull(),
  volume: text("volume"),
  page: text("page"),
  nomismaUri: text("nomisma_uri"),
  note: text("note"),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("catalog_ref_coin_type_idx").on(table.coinTypeId),
  index("catalog_ref_user_coin_idx").on(table.userCoinId),
  index("catalog_ref_number_idx").on(table.catalogType, table.catalogNumber),
]);

export const insertCatalogReferenceSchema = createInsertSchema(catalogReferences).omit({ id: true, createdAt: true });
export type InsertCatalogReference = z.infer<typeof insertCatalogReferenceSchema>;
export type CatalogReference = typeof catalogReferences.$inferSelect;

// Rulers table - Authority/issuer hierarchy
export const rulers = pgTable("rulers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  reignStart: integer("reign_start"),
  reignEnd: integer("reign_end"),
  dynastyId: varchar("dynasty_id"),
  title: text("title"),
  nomismaUri: text("nomisma_uri"),
  wikidataQid: text("wikidata_qid"),
  alternateNames: text("alternate_names").array(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("rulers_name_idx").on(table.name),
  index("rulers_dynasty_idx").on(table.dynastyId),
]);

export const insertRulerSchema = createInsertSchema(rulers).omit({ id: true, createdAt: true });
export type InsertRuler = z.infer<typeof insertRulerSchema>;
export type Ruler = typeof rulers.$inferSelect;

// Dynasties table - Grouping of rulers by dynasty/period
export const dynasties = pgTable("dynasties", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  periodStart: integer("period_start"),
  periodEnd: integer("period_end"),
  parentDynastyId: varchar("parent_dynasty_id"),
  region: text("region"),
  nomismaUri: text("nomisma_uri"),
  wikidataQid: text("wikidata_qid"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("dynasties_name_idx").on(table.name),
]);

export const insertDynastySchema = createInsertSchema(dynasties).omit({ id: true, createdAt: true });
export type InsertDynasty = z.infer<typeof insertDynastySchema>;
export type Dynasty = typeof dynasties.$inferSelect;

// Mints table - Standardized mint locations
export const mints = pgTable("mints", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  modernName: text("modern_name"),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  region: text("region"),
  country: text("country"),
  nomismaUri: text("nomisma_uri"),
  pleiadesUri: text("pleiades_uri"),
  geonamesId: text("geonames_id"),
  alternateNames: text("alternate_names").array(),
  activeFrom: integer("active_from"),
  activeTo: integer("active_to"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("mints_name_idx").on(table.name),
  index("mints_region_idx").on(table.region),
]);

export const insertMintSchema = createInsertSchema(mints).omit({ id: true, createdAt: true });
export type InsertMint = z.infer<typeof insertMintSchema>;
export type Mint = typeof mints.$inferSelect;

// Denominations table - Standardized denominations
export const denominations = pgTable("denominations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  period: text("period"),
  metal: text("metal"),
  typicalWeightG: numeric("typical_weight_g", { precision: 10, scale: 3 }),
  typicalDiameterMm: numeric("typical_diameter_mm", { precision: 10, scale: 2 }),
  nomismaUri: text("nomisma_uri"),
  alternateNames: text("alternate_names").array(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("denominations_name_idx").on(table.name),
]);

export const insertDenominationSchema = createInsertSchema(denominations).omit({ id: true, createdAt: true });
export type InsertDenomination = z.infer<typeof insertDenominationSchema>;
export type Denomination = typeof denominations.$inferSelect;

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

// Ingestion logs table - Detailed logging for each run
export const LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const;
export type LogLevel = typeof LOG_LEVELS[number];

export const ingestionLogs = pgTable("ingestion_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").notNull().references(() => ingestionRuns.id, { onDelete: 'cascade' }),
  level: text("level").notNull().default('INFO'),
  message: text("message").notNull(),
  recordId: text("record_id"),
  cursor: text("cursor"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("ingestion_logs_run_idx").on(table.runId),
  index("ingestion_logs_level_idx").on(table.level),
  index("ingestion_logs_created_idx").on(table.createdAt),
]);

export const insertIngestionLogSchema = createInsertSchema(ingestionLogs).omit({ id: true, createdAt: true });
export type InsertIngestionLog = z.infer<typeof insertIngestionLogSchema>;
export type IngestionLog = typeof ingestionLogs.$inferSelect;

// ==================== PROVENANCE TRACKING ====================

// Provenance event types
export const PROVENANCE_EVENT_TYPES = ['DISCOVERY', 'AUCTION', 'PRIVATE_SALE', 'DONATION', 'INHERITANCE', 'HOARD_FIND', 'EXCAVATION', 'MUSEUM_ACQUISITION', 'DEACCESSION', 'OTHER'] as const;
export type ProvenanceEventType = typeof PROVENANCE_EVENT_TYPES[number];

// Hoards table - Archaeological finds/treasure troves
export const hoards = pgTable("hoards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  discoveryDate: text("discovery_date"),
  discoveryYear: integer("discovery_year"),
  location: text("location"),
  modernLocation: text("modern_location"),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  coinCount: integer("coin_count"),
  terminusPostQuem: integer("terminus_post_quem"),
  terminusAnteQuem: integer("terminus_ante_quem"),
  description: text("description"),
  bibliography: text("bibliography").array(),
  nomismaUri: text("nomisma_uri"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("hoards_name_idx").on(table.name),
  index("hoards_year_idx").on(table.discoveryYear),
]);

export const insertHoardSchema = createInsertSchema(hoards).omit({ id: true, createdAt: true });
export type InsertHoard = z.infer<typeof insertHoardSchema>;
export type Hoard = typeof hoards.$inferSelect;

// Auction houses table
export const auctionHouses = pgTable("auction_houses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  abbreviation: text("abbreviation"),
  city: text("city"),
  country: text("country"),
  website: text("website"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("auction_houses_name_idx").on(table.name),
]);

export const insertAuctionHouseSchema = createInsertSchema(auctionHouses).omit({ id: true, createdAt: true });
export type InsertAuctionHouse = z.infer<typeof insertAuctionHouseSchema>;
export type AuctionHouse = typeof auctionHouses.$inferSelect;

// Auction lots table - Individual auction records
export const auctionLots = pgTable("auction_lots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  auctionHouseId: varchar("auction_house_id").references(() => auctionHouses.id),
  saleTitle: text("sale_title"),
  saleDate: text("sale_date"),
  lotNumber: text("lot_number"),
  estimateLow: numeric("estimate_low", { precision: 15, scale: 2 }),
  estimateHigh: numeric("estimate_high", { precision: 15, scale: 2 }),
  hammerPrice: numeric("hammer_price", { precision: 15, scale: 2 }),
  currency: text("currency"),
  catalogDescription: text("catalog_description"),
  catalogImageUrl: text("catalog_image_url"),
  sourceUrl: text("source_url"),
  coinTypeId: varchar("coin_type_id").references(() => coinTypes.id),
  userCoinId: varchar("user_coin_id").references(() => userCoins.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("auction_lots_house_idx").on(table.auctionHouseId),
  index("auction_lots_date_idx").on(table.saleDate),
  index("auction_lots_coin_type_idx").on(table.coinTypeId),
]);

export const insertAuctionLotSchema = createInsertSchema(auctionLots).omit({ id: true, createdAt: true });
export type InsertAuctionLot = z.infer<typeof insertAuctionLotSchema>;
export type AuctionLot = typeof auctionLots.$inferSelect;

// Provenance events table - Chain of ownership/custody
export const provenanceEvents = pgTable("provenance_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coinTypeId: varchar("coin_type_id").references(() => coinTypes.id, { onDelete: 'cascade' }),
  userCoinId: varchar("user_coin_id").references(() => userCoins.id, { onDelete: 'cascade' }),
  eventType: text("event_type").notNull(),
  eventDate: text("event_date"),
  eventYear: integer("event_year"),
  ownerName: text("owner_name"),
  ownerType: text("owner_type"),
  location: text("location"),
  hoardId: varchar("hoard_id").references(() => hoards.id),
  auctionLotId: varchar("auction_lot_id").references(() => auctionLots.id),
  description: text("description"),
  evidenceLevel: text("evidence_level"),
  sourceUrl: text("source_url"),
  notes: text("notes"),
  sequenceOrder: integer("sequence_order"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("provenance_events_coin_type_idx").on(table.coinTypeId),
  index("provenance_events_user_coin_idx").on(table.userCoinId),
  index("provenance_events_type_idx").on(table.eventType),
]);

export const insertProvenanceEventSchema = createInsertSchema(provenanceEvents).omit({ id: true, createdAt: true });
export type InsertProvenanceEvent = z.infer<typeof insertProvenanceEventSchema>;
export type ProvenanceEvent = typeof provenanceEvents.$inferSelect;

// Conservation records table - Restoration/cleaning history
export const conservationRecords = pgTable("conservation_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coinTypeId: varchar("coin_type_id").references(() => coinTypes.id, { onDelete: 'cascade' }),
  userCoinId: varchar("user_coin_id").references(() => userCoins.id, { onDelete: 'cascade' }),
  recordDate: text("record_date"),
  conservator: text("conservator"),
  institution: text("institution"),
  treatmentType: text("treatment_type"),
  description: text("description"),
  conditionBefore: text("condition_before"),
  conditionAfter: text("condition_after"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("conservation_records_coin_type_idx").on(table.coinTypeId),
  index("conservation_records_user_coin_idx").on(table.userCoinId),
]);

export const insertConservationRecordSchema = createInsertSchema(conservationRecords).omit({ id: true, createdAt: true });
export type InsertConservationRecord = z.infer<typeof insertConservationRecordSchema>;
export type ConservationRecord = typeof conservationRecords.$inferSelect;

// Authenticity notes table - Authentication records
export const authenticityNotes = pgTable("authenticity_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coinTypeId: varchar("coin_type_id").references(() => coinTypes.id, { onDelete: 'cascade' }),
  userCoinId: varchar("user_coin_id").references(() => userCoins.id, { onDelete: 'cascade' }),
  assessmentDate: text("assessment_date"),
  assessor: text("assessor"),
  institution: text("institution"),
  verdict: text("verdict"),
  confidence: text("confidence"),
  methodology: text("methodology"),
  findings: text("findings"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("authenticity_notes_coin_type_idx").on(table.coinTypeId),
  index("authenticity_notes_user_coin_idx").on(table.userCoinId),
]);

export const insertAuthenticityNoteSchema = createInsertSchema(authenticityNotes).omit({ id: true, createdAt: true });
export type InsertAuthenticityNote = z.infer<typeof insertAuthenticityNoteSchema>;
export type AuthenticityNote = typeof authenticityNotes.$inferSelect;

// ==================== IMAGE EMBEDDINGS ====================

// Model version tracking for embeddings
export const EMBEDDING_MODELS = ['clip-vit-base-patch32', 'clip-vit-large-patch14'] as const;
export type EmbeddingModel = typeof EMBEDDING_MODELS[number];

// Image embeddings table - Vector storage for visual similarity
export const imageEmbeddings = pgTable("image_embeddings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coinTypeId: varchar("coin_type_id").references(() => coinTypes.id, { onDelete: 'cascade' }),
  userCoinId: varchar("user_coin_id").references(() => userCoins.id, { onDelete: 'cascade' }),
  imageAssetId: varchar("image_asset_id").references(() => imageAssets.id, { onDelete: 'cascade' }),
  imageType: text("image_type").notNull(), // 'obverse', 'reverse', 'combined'
  modelVersion: text("model_version").notNull().default('clip-vit-base-patch32'),
  embeddingDim: integer("embedding_dim").notNull().default(512),
  // Store embedding as float array - will be cast to vector in queries
  embedding: text("embedding").notNull(), // JSON stringified float array
  sourceImageUrl: text("source_image_url"),
  computedAt: timestamp("computed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("embeddings_coin_type_idx").on(table.coinTypeId),
  index("embeddings_user_coin_idx").on(table.userCoinId),
  index("embeddings_image_asset_idx").on(table.imageAssetId),
  index("embeddings_model_idx").on(table.modelVersion),
]);

export const insertImageEmbeddingSchema = createInsertSchema(imageEmbeddings).omit({ id: true, computedAt: true, createdAt: true });
export type InsertImageEmbedding = z.infer<typeof insertImageEmbeddingSchema>;
export type ImageEmbedding = typeof imageEmbeddings.$inferSelect;

// Embedding jobs queue table - Track async embedding computation
export const EMBEDDING_JOB_STATUS = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED'] as const;
export type EmbeddingJobStatus = typeof EMBEDDING_JOB_STATUS[number];

export const embeddingJobs = pgTable("embedding_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coinTypeId: varchar("coin_type_id").references(() => coinTypes.id, { onDelete: 'cascade' }),
  userCoinId: varchar("user_coin_id").references(() => userCoins.id, { onDelete: 'cascade' }),
  imageUrl: text("image_url").notNull(),
  imageType: text("image_type").notNull(),
  status: text("status").notNull().default('PENDING'),
  priority: integer("priority").notNull().default(0),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  errorMessage: text("error_message"),
  resultEmbeddingId: varchar("result_embedding_id").references(() => imageEmbeddings.id),
  scheduledAt: timestamp("scheduled_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("embedding_jobs_status_idx").on(table.status),
  index("embedding_jobs_priority_idx").on(table.priority),
  index("embedding_jobs_coin_type_idx").on(table.coinTypeId),
]);

export const insertEmbeddingJobSchema = createInsertSchema(embeddingJobs).omit({ id: true, createdAt: true });
export type InsertEmbeddingJob = z.infer<typeof insertEmbeddingJobSchema>;
export type EmbeddingJob = typeof embeddingJobs.$inferSelect;
