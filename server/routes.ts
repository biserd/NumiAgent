import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { insertUserCoinSchema, insertWatchlistSchema, insertSourceSchema, insertImageAssetSchema, insertSimilarMatchSchema } from "@shared/schema";
import { z, ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { registerObjectStorageRoutes, ObjectStorageService } from "./replit_integrations/object_storage";
import { setupAuth, registerAuthRoutes, requireAuth, requireAdmin } from "./auth";

// Validation helper
function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  return schema.parse(body);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Setup custom authentication
  setupAuth(app);
  registerAuthRoutes(app);
  
  // ============ USER COINS ============
  
  // Get all coins for the current user
  app.get("/api/coins", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const coins = await storage.getCoinsByUser(userId);
      res.json(coins);
    } catch (error) {
      console.error("Error fetching coins:", error);
      res.status(500).json({ error: "Failed to fetch coins" });
    }
  });

  // Get a specific coin by ID
  app.get("/api/coins/:id", requireAuth, async (req, res) => {
    try {
      const coin = await storage.getCoinById(req.params.id);
      if (!coin) {
        return res.status(404).json({ error: "Coin not found" });
      }
      // Check ownership
      if (coin.userId !== (req.user as any).id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      res.json(coin);
    } catch (error) {
      console.error("Error fetching coin:", error);
      res.status(500).json({ error: "Failed to fetch coin" });
    }
  });

  // Create a new coin
  app.post("/api/coins", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const createCoinSchema = insertUserCoinSchema.extend({
        userId: z.string(),
      });
      const validated = validateBody(createCoinSchema, { ...req.body, userId });
      const coin = await storage.createCoin(validated);
      res.status(201).json(coin);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: fromZodError(error).message });
      }
      console.error("Error creating coin:", error);
      res.status(500).json({ error: "Failed to create coin" });
    }
  });

  // Update a coin
  app.patch("/api/coins/:id", requireAuth, async (req, res) => {
    try {
      const coin = await storage.getCoinById(req.params.id);
      if (!coin) {
        return res.status(404).json({ error: "Coin not found" });
      }
      if (coin.userId !== (req.user as any).id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const updated = await storage.updateCoin(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating coin:", error);
      res.status(500).json({ error: "Failed to update coin" });
    }
  });

  // Delete a coin
  app.delete("/api/coins/:id", requireAuth, async (req, res) => {
    try {
      const coin = await storage.getCoinById(req.params.id);
      if (!coin) {
        return res.status(404).json({ error: "Coin not found" });
      }
      if (coin.userId !== (req.user as any).id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      await storage.deleteCoin(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting coin:", error);
      res.status(500).json({ error: "Failed to delete coin" });
    }
  });

  // ============ WATCHLISTS ============

  // Get all watchlists for the current user
  app.get("/api/watchlists", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const watchlists = await storage.getWatchlistsByUser(userId);
      res.json(watchlists);
    } catch (error) {
      console.error("Error fetching watchlists:", error);
      res.status(500).json({ error: "Failed to fetch watchlists" });
    }
  });

  // Create a new watchlist
  app.post("/api/watchlists", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const createWatchlistSchema = insertWatchlistSchema.extend({
        userId: z.string(),
      });
      const validated = validateBody(createWatchlistSchema, {
        userId,
        name: req.body.name,
        rules: req.body.rules || {},
        isEnabled: true,
      });
      const watchlist = await storage.createWatchlist(validated);
      res.status(201).json(watchlist);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: fromZodError(error).message });
      }
      console.error("Error creating watchlist:", error);
      res.status(500).json({ error: "Failed to create watchlist" });
    }
  });

  // Update a watchlist
  app.patch("/api/watchlists/:id", requireAuth, async (req, res) => {
    try {
      const watchlist = await storage.getWatchlistById(req.params.id);
      if (!watchlist) {
        return res.status(404).json({ error: "Watchlist not found" });
      }
      if (watchlist.userId !== (req.user as any).id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const updated = await storage.updateWatchlist(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating watchlist:", error);
      res.status(500).json({ error: "Failed to update watchlist" });
    }
  });

  // Delete a watchlist
  app.delete("/api/watchlists/:id", requireAuth, async (req, res) => {
    try {
      const watchlist = await storage.getWatchlistById(req.params.id);
      if (!watchlist) {
        return res.status(404).json({ error: "Watchlist not found" });
      }
      if (watchlist.userId !== (req.user as any).id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      await storage.deleteWatchlist(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting watchlist:", error);
      res.status(500).json({ error: "Failed to delete watchlist" });
    }
  });

  // ============ NOTIFICATIONS ============

  // Get all notifications for the current user
  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const notifications = await storage.getNotificationsByUser(userId);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // Mark a notification as read
  app.post("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      await storage.markNotificationRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification read:", error);
      res.status(500).json({ error: "Failed to mark notification read" });
    }
  });

  // Mark all notifications as read
  app.post("/api/notifications/read-all", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      await storage.markAllNotificationsRead(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all notifications read:", error);
      res.status(500).json({ error: "Failed to mark all notifications read" });
    }
  });

  // ============ ADMIN: SOURCES ============

  // Get all sources
  app.get("/api/admin/sources", requireAdmin, async (req, res) => {
    try {
      const sources = await storage.getSources();
      res.json(sources);
    } catch (error) {
      console.error("Error fetching sources:", error);
      res.status(500).json({ error: "Failed to fetch sources" });
    }
  });

  // Create a new source
  app.post("/api/admin/sources", requireAdmin, async (req, res) => {
    try {
      const validated = validateBody(insertSourceSchema, {
        id: req.body.id,
        name: req.body.name,
        homepageUrl: req.body.homepageUrl || null,
        accessMethod: req.body.accessMethod || "MANUAL",
        defaultLicenseMetadata: req.body.defaultLicenseMetadata || "UNKNOWN",
        defaultLicenseImages: req.body.defaultLicenseImages || "UNKNOWN",
        defaultActions: req.body.defaultActions || {},
      });
      const source = await storage.createSource(validated);
      res.status(201).json(source);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: fromZodError(error).message });
      }
      console.error("Error creating source:", error);
      res.status(500).json({ error: "Failed to create source" });
    }
  });

  // Update a source
  app.patch("/api/admin/sources/:id", requireAdmin, async (req, res) => {
    try {
      const updated = await storage.updateSource(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Source not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating source:", error);
      res.status(500).json({ error: "Failed to update source" });
    }
  });

  // ============ INGESTION RUNS ============

  // Get all ingestion runs
  app.get("/api/admin/ingestion-runs", requireAdmin, async (req, res) => {
    try {
      const { sourceId, status } = req.query;
      const runs = await storage.getIngestionRuns({
        sourceId: sourceId as string,
        status: status as string,
      });
      res.json(runs);
    } catch (error) {
      console.error("Error fetching ingestion runs:", error);
      res.status(500).json({ error: "Failed to fetch ingestion runs" });
    }
  });

  // Get ingestion stats
  app.get("/api/admin/ingestion-stats", requireAdmin, async (req, res) => {
    try {
      const stats = await storage.getIngestionStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching ingestion stats:", error);
      res.status(500).json({ error: "Failed to fetch ingestion stats" });
    }
  });

  // Create and run an ingestion job
  app.post("/api/admin/ingestion-runs", requireAdmin, async (req, res) => {
    try {
      const { sourceId, limit = 50 } = req.body;
      
      if (!sourceId) {
        return res.status(400).json({ error: "sourceId is required" });
      }
      
      const run = await storage.createIngestionRun({
        sourceId,
        status: 'PENDING',
      });
      
      // Run ingestion asynchronously
      (async () => {
        try {
          const { runIngestion } = await import("./ingestion");
          await runIngestion(run.id, sourceId, limit);
        } catch (error) {
          console.error("Ingestion error:", error);
          await storage.updateIngestionRun(run.id, {
            status: 'FAILED',
            errorMessage: error instanceof Error ? error.message : String(error),
            completedAt: new Date(),
          });
        }
      })();
      
      res.status(201).json(run);
    } catch (error) {
      console.error("Error creating ingestion run:", error);
      res.status(500).json({ error: "Failed to create ingestion run" });
    }
  });

  // Update an ingestion run
  app.patch("/api/admin/ingestion-runs/:id", requireAdmin, async (req, res) => {
    try {
      const updated = await storage.updateIngestionRun(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Ingestion run not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating ingestion run:", error);
      res.status(500).json({ error: "Failed to update ingestion run" });
    }
  });
  
  // Get ingestion logs for a run
  app.get("/api/admin/ingestion-runs/:id/logs", requireAdmin, async (req, res) => {
    try {
      const { level, limit } = req.query;
      const logs = await storage.getIngestionLogsByRun(req.params.id, {
        level: level as string,
        limit: limit ? parseInt(limit as string, 10) : 200,
      });
      res.json(logs);
    } catch (error) {
      console.error("Error fetching ingestion logs:", error);
      res.status(500).json({ error: "Failed to fetch ingestion logs" });
    }
  });
  
  // Get latest cursor for resuming a run
  app.get("/api/admin/ingestion-runs/:id/cursor", requireAdmin, async (req, res) => {
    try {
      const cursor = await storage.getLatestCursor(req.params.id);
      res.json({ cursor });
    } catch (error) {
      console.error("Error fetching cursor:", error);
      res.status(500).json({ error: "Failed to fetch cursor" });
    }
  });
  
  // ============ NOMISMA ENTITY INGESTION ============
  
  // Get Nomisma stats
  app.get("/api/admin/nomisma/stats", requireAdmin, async (req, res) => {
    try {
      const { NomismaAdapter } = await import("./ingestion/nomisma-adapter");
      const stats = await NomismaAdapter.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching Nomisma stats:", error);
      res.status(500).json({ error: "Failed to fetch Nomisma stats" });
    }
  });
  
  // Ingest entities from Nomisma
  app.post("/api/admin/nomisma/entities", requireAdmin, async (req, res) => {
    try {
      const { entityType, limit = 100 } = req.body;
      
      if (!entityType || !['rulers', 'mints', 'denominations', 'materials'].includes(entityType)) {
        return res.status(400).json({ 
          error: "entityType is required and must be one of: rulers, mints, denominations, materials" 
        });
      }
      
      const { NomismaAdapter } = await import("./ingestion/nomisma-adapter");
      
      let ingested = 0;
      let skipped = 0;
      
      for await (const entity of NomismaAdapter.ingestEntities(entityType, limit)) {
        try {
          // Check if entity with this nomisma URI already exists
          const existing = await storage.getEntityByNomismaUri(entity.nomismaUri!);
          if (existing) {
            skipped++;
            continue;
          }
          
          await storage.createEntity(entity);
          ingested++;
        } catch (err) {
          console.error(`Error ingesting entity ${entity.label}:`, err);
        }
      }
      
      res.json({ entityType, ingested, skipped });
    } catch (error) {
      console.error("Error ingesting Nomisma entities:", error);
      res.status(500).json({ error: "Failed to ingest Nomisma entities" });
    }
  });
  
  // Ingest edges from Nomisma
  app.post("/api/admin/nomisma/edges", requireAdmin, async (req, res) => {
    try {
      const { limit = 500 } = req.body;
      
      const { NomismaAdapter } = await import("./ingestion/nomisma-adapter");
      
      let created = 0;
      let skipped = 0;
      let errors = 0;
      
      for await (const edge of NomismaAdapter.ingestEdges(limit)) {
        try {
          // Edges reference entities by nomisma ID - need to look up actual entity IDs
          const srcEntity = await storage.getEntityByNomismaUri(`http://nomisma.org/id/${edge.srcId}`);
          const dstEntity = await storage.getEntityByNomismaUri(`http://nomisma.org/id/${edge.dstId}`);
          
          if (!srcEntity || !dstEntity) {
            skipped++;
            continue;
          }
          
          await storage.createEntityEdge({
            ...edge,
            srcId: srcEntity.id,
            dstId: dstEntity.id,
          });
          created++;
        } catch (err) {
          errors++;
        }
      }
      
      res.json({ created, skipped, errors });
    } catch (error) {
      console.error("Error ingesting Nomisma edges:", error);
      res.status(500).json({ error: "Failed to ingest Nomisma edges" });
    }
  });

  // ============ RIGHTS COMPLIANCE ============

  // Get rights compliance issues
  app.get("/api/admin/rights/issues", requireAdmin, async (req, res) => {
    try {
      const { sourceId, licenseType } = req.query;
      const result = await storage.getRightsIssues({
        sourceId: sourceId as string,
        licenseType: licenseType as string,
      });
      res.json(result);
    } catch (error) {
      console.error("Error fetching rights issues:", error);
      res.status(500).json({ error: "Failed to fetch rights issues" });
    }
  });

  // ============ ADMIN: COIN TYPES BROWSER ============

  // Get paginated coin types
  app.get("/api/admin/coin-types", requireAdmin, async (req, res) => {
    try {
      const { sourceId, search, page, limit } = req.query;
      const result = await storage.getCoinTypesPaginated({
        sourceId: sourceId as string,
        search: search as string,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 20,
      });
      res.json(result);
    } catch (error) {
      console.error("Error fetching coin types:", error);
      res.status(500).json({ error: "Failed to fetch coin types" });
    }
  });

  // Get coin types stats
  app.get("/api/admin/coin-types/stats", requireAdmin, async (req, res) => {
    try {
      const stats = await storage.getCoinTypesStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching coin types stats:", error);
      res.status(500).json({ error: "Failed to fetch coin types stats" });
    }
  });

  // Get single coin type by ID
  app.get("/api/admin/coin-types/:id", requireAdmin, async (req, res) => {
    try {
      const coinType = await storage.getCoinTypeById(req.params.id);
      if (!coinType) {
        return res.status(404).json({ error: "Coin type not found" });
      }
      res.json(coinType);
    } catch (error) {
      console.error("Error fetching coin type:", error);
      res.status(500).json({ error: "Failed to fetch coin type" });
    }
  });

  // ============ NORMALIZATION PIPELINE ============

  // Run normalization on coin types
  app.post("/api/admin/normalize", requireAdmin, async (req, res) => {
    try {
      const { limit = 1000 } = req.body;
      
      const { runNormalizationPipeline } = await import("./services/normalization");
      
      // Run normalization asynchronously
      runNormalizationPipeline(limit)
        .then((result) => {
          console.log("Normalization completed:", result);
        })
        .catch((error) => {
          console.error("Normalization error:", error);
        });
      
      res.status(202).json({ 
        message: "Normalization pipeline started",
        limit,
      });
    } catch (error) {
      console.error("Error starting normalization:", error);
      res.status(500).json({ error: "Failed to start normalization" });
    }
  });

  // ============ IMAGE ASSETS ============

  const objectStorageService = new ObjectStorageService();

  // Register base object storage routes (request-url, serve objects)
  registerObjectStorageRoutes(app);

  // Save image metadata after upload completes
  app.post("/api/images", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const createImageSchema = insertImageAssetSchema.extend({
        ownerUserId: z.string(),
      });
      const validated = validateBody(createImageSchema, {
        ...req.body,
        ownerUserId: userId,
      });
      
      // Normalize the storage URL to object path
      if (validated.storageUrl) {
        validated.storageUrl = objectStorageService.normalizeObjectEntityPath(validated.storageUrl);
      }
      
      const image = await storage.createImageAsset(validated);
      res.status(201).json(image);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: fromZodError(error).message });
      }
      console.error("Error creating image asset:", error);
      res.status(500).json({ error: "Failed to create image asset" });
    }
  });

  // Get image by ID
  app.get("/api/images/:id", async (req, res) => {
    try {
      const image = await storage.getImageAssetById(req.params.id);
      if (!image) {
        return res.status(404).json({ error: "Image not found" });
      }
      res.json(image);
    } catch (error) {
      console.error("Error fetching image:", error);
      res.status(500).json({ error: "Failed to fetch image" });
    }
  });

  // ============ COIN TYPES (Museum Data) ============

  // Get all coin types with optional filtering
  app.get("/api/coin-types", async (req, res) => {
    try {
      const { ruler, denomination, dateFrom, dateTo, limit } = req.query;
      const coinTypes = await storage.searchCoinTypes({
        ruler: ruler as string,
        denomination: denomination as string,
        dateFrom: dateFrom ? parseInt(dateFrom as string) : undefined,
        dateTo: dateTo ? parseInt(dateTo as string) : undefined,
        limit: limit ? parseInt(limit as string) : 50,
      });
      res.json(coinTypes);
    } catch (error) {
      console.error("Error fetching coin types:", error);
      res.status(500).json({ error: "Failed to fetch coin types" });
    }
  });

  // Get coin type by ID
  app.get("/api/coin-types/:id", async (req, res) => {
    try {
      const coinType = await storage.getCoinTypeById(req.params.id);
      if (!coinType) {
        return res.status(404).json({ error: "Coin type not found" });
      }
      res.json(coinType);
    } catch (error) {
      console.error("Error fetching coin type:", error);
      res.status(500).json({ error: "Failed to fetch coin type" });
    }
  });

  // ============ ENTITIES ============

  // Get entities with optional filtering by type
  app.get("/api/entities", async (req, res) => {
    try {
      const { type, search } = req.query;
      const entities = await storage.searchEntities({
        type: type as string,
        search: search as string,
      });
      res.json(entities);
    } catch (error) {
      console.error("Error fetching entities:", error);
      res.status(500).json({ error: "Failed to fetch entities" });
    }
  });

  // ============ MATCHING SERVICE ============

  // Analyze a coin and find similar matches
  app.post("/api/coins/:id/analyze", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const coin = await storage.getCoinById(req.params.id);
      
      if (!coin) {
        return res.status(404).json({ error: "Coin not found" });
      }
      if (coin.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Queue embedding jobs for user-uploaded images (async, non-blocking)
      const { createEmbeddingJob } = await import("./services/embedding-worker");
      const embeddingJobs: string[] = [];
      
      if (coin.obvImageId) {
        const obvImage = await storage.getImageAssetById(coin.obvImageId);
        if (obvImage?.storageUrl) {
          try {
            const jobId = await createEmbeddingJob({
              userCoinId: coin.id,
              imageUrl: obvImage.storageUrl,
              imageType: 'obverse',
              priority: 10, // Higher priority for user uploads
            });
            embeddingJobs.push(jobId);
          } catch (e) {
            console.warn("Failed to queue obverse embedding:", e);
          }
        }
      }
      
      if (coin.revImageId) {
        const revImage = await storage.getImageAssetById(coin.revImageId);
        if (revImage?.storageUrl) {
          try {
            const jobId = await createEmbeddingJob({
              userCoinId: coin.id,
              imageUrl: revImage.storageUrl,
              imageType: 'reverse',
              priority: 10,
            });
            embeddingJobs.push(jobId);
          } catch (e) {
            console.warn("Failed to queue reverse embedding:", e);
          }
        }
      }

      // Find matching coin types using hybrid search when possible
      const { findSimilarCoinsHybrid, findSimilarCoins } = await import("./services/similarity");
      
      let matches;
      const obvImage = coin.obvImageId ? await storage.getImageAssetById(coin.obvImageId) : null;
      
      if (obvImage?.storageUrl) {
        // Use hybrid search with image
        const hybridResults = await findSimilarCoinsHybrid({
          imageUrl: obvImage.storageUrl,
          ruler: coin.ruler || undefined,
          denomination: coin.denomination || undefined,
          mint: coin.mint || undefined,
          metal: coin.metal || undefined,
          obvLegend: coin.obvLegend || undefined,
          revLegend: coin.revLegend || undefined,
          dateFrom: coin.dateFrom || undefined,
          dateTo: coin.dateTo || undefined,
          limit: 20,
        });
        
        matches = hybridResults.map(r => ({
          coinType: {
            id: r.id,
            label: r.label,
            sourceId: r.sourceId,
            sourceRecordId: r.sourceRecordId,
            sourceUrl: r.sourceUrl,
            imageUrl: r.imageUrl,
            dateFrom: r.dateFrom,
            dateTo: r.dateTo,
            obvLegend: r.obvLegend,
            revLegend: r.revLegend,
            mint: r.mint,
            denomination: r.denomination,
            metal: r.metal,
          },
          confidence: r.matchScore,
          reasons: r.matchReasons,
        }));
      } else {
        // Fall back to metadata-only search
        matches = await storage.findMatchingCoinTypes(coin);
      }
      
      // Create similar match entries
      const similarMatches = [];
      for (const match of matches) {
        const similarMatch = await storage.createSimilarMatch({
          userCoinId: coin.id,
          coinTypeId: match.coinType.id,
          confidence: match.confidence.toString(),
          reasons: match.reasons,
        });
        
        // Get source info for attribution
        const source = await storage.getSourceById(match.coinType.sourceId);
        
        similarMatches.push({
          ...similarMatch,
          coinType: match.coinType,
          source,
        });
      }

      res.json({
        matches: similarMatches,
        embeddingJobsQueued: embeddingJobs.length,
      });
    } catch (error) {
      console.error("Error analyzing coin:", error);
      res.status(500).json({ error: "Failed to analyze coin" });
    }
  });

  // Get matches for a coin
  app.get("/api/coins/:id/matches", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const coin = await storage.getCoinById(req.params.id);
      
      if (!coin) {
        return res.status(404).json({ error: "Coin not found" });
      }
      if (coin.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const matches = await storage.getMatchesByCoin(coin.id);
      
      // Enrich matches with coin type data, source info, and rights
      const enrichedMatches = await Promise.all(
        matches.map(async (match) => {
          if (match.coinTypeId) {
            const coinType = await storage.getCoinTypeById(match.coinTypeId);
            let source = undefined;
            let rights = undefined;
            
            if (coinType?.sourceId) {
              source = await storage.getSourceById(coinType.sourceId);
            }
            if (coinType?.rightsId) {
              rights = await storage.getRightsRecordById(coinType.rightsId);
            }
            
            return { 
              ...match, 
              coinType, 
              source,
              rights: rights ? {
                licenseImages: rights.licenseImages,
                attributionText: rights.attributionText,
                sourceUrl: rights.sourceUrl,
                rightsStatementUrl: rights.rightsStatementUrl,
              } : undefined,
            };
          }
          return match;
        })
      );
      
      res.json(enrichedMatches);
    } catch (error) {
      console.error("Error fetching matches:", error);
      res.status(500).json({ error: "Failed to fetch matches" });
    }
  });

  // ============ OCR & SIMILARITY SEARCH ============

  // Analyze a coin image with OCR
  app.post("/api/ocr/analyze", requireAuth, async (req, res) => {
    try {
      const { analyzeCoinImage, analyzeCoinPair } = await import("./services/ocr");
      
      const { obverseImage, reverseImage, singleImage, mimeType } = req.body;
      
      if (!obverseImage && !reverseImage && !singleImage) {
        return res.status(400).json({ error: "At least one image is required" });
      }

      let result;
      if (obverseImage && reverseImage) {
        result = await analyzeCoinPair(obverseImage, reverseImage, mimeType || 'image/jpeg');
      } else if (singleImage) {
        result = await analyzeCoinImage(singleImage, mimeType || 'image/jpeg', 'both');
      } else if (obverseImage) {
        result = await analyzeCoinImage(obverseImage, mimeType || 'image/jpeg', 'obverse');
      } else {
        result = await analyzeCoinImage(reverseImage, mimeType || 'image/jpeg', 'reverse');
      }

      res.json(result);
    } catch (error) {
      console.error("Error analyzing coin image:", error);
      res.status(500).json({ error: "Failed to analyze coin image" });
    }
  });

  // Search for similar coins
  app.post("/api/search/similar", requireAuth, async (req, res) => {
    try {
      const { findSimilarCoins } = await import("./services/similarity");
      
      const { ruler, denomination, mint, metal, obvLegend, revLegend, dateFrom, dateTo, referenceText, limit } = req.body;
      
      const results = await findSimilarCoins({
        ruler,
        denomination,
        mint,
        metal,
        obvLegend,
        revLegend,
        dateFrom: dateFrom !== undefined ? parseInt(dateFrom) : undefined,
        dateTo: dateTo !== undefined ? parseInt(dateTo) : undefined,
        referenceText,
        limit: limit || 20,
      });

      res.json(results);
    } catch (error) {
      console.error("Error searching similar coins:", error);
      res.status(500).json({ error: "Failed to search similar coins" });
    }
  });

  // Text search for coins
  app.get("/api/search/coins", requireAuth, async (req, res) => {
    try {
      const { searchCoinsByText } = await import("./services/similarity");
      
      const query = req.query.q as string;
      const limit = parseInt(req.query.limit as string) || 20;
      
      if (!query) {
        return res.status(400).json({ error: "Query parameter 'q' is required" });
      }

      const results = await searchCoinsByText(query, limit);
      res.json(results);
    } catch (error) {
      console.error("Error searching coins:", error);
      res.status(500).json({ error: "Failed to search coins" });
    }
  });

  // Hybrid search (metadata + vector)
  app.post("/api/search/hybrid", requireAuth, async (req, res) => {
    try {
      const { findSimilarCoinsHybrid } = await import("./services/similarity");
      
      const { 
        ruler, denomination, mint, metal, obvLegend, revLegend, 
        dateFrom, dateTo, referenceText, imageUrl, vectorWeight, limit 
      } = req.body;
      
      const results = await findSimilarCoinsHybrid({
        ruler,
        denomination,
        mint,
        metal,
        obvLegend,
        revLegend,
        dateFrom: dateFrom !== undefined ? parseInt(dateFrom) : undefined,
        dateTo: dateTo !== undefined ? parseInt(dateTo) : undefined,
        referenceText,
        imageUrl,
        vectorWeight: vectorWeight || 0.4,
        limit: limit || 20,
      });

      res.json(results);
    } catch (error) {
      console.error("Error in hybrid search:", error);
      res.status(500).json({ error: "Failed to search coins" });
    }
  });

  // Visual similarity search (image only)
  app.post("/api/search/visual", requireAuth, async (req, res) => {
    try {
      const { findSimilarCoinsByImage } = await import("./services/similarity");
      
      const { imageUrl, limit } = req.body;
      
      if (!imageUrl) {
        return res.status(400).json({ error: "imageUrl is required" });
      }

      const results = await findSimilarCoinsByImage(imageUrl, limit || 20);
      res.json(results);
    } catch (error) {
      console.error("Error in visual search:", error);
      res.status(500).json({ error: "Failed to search similar coins by image" });
    }
  });

  // ============ EMBEDDINGS MANAGEMENT ============

  // Get embedding job stats
  app.get("/api/admin/embeddings/stats", requireAdmin, async (req, res) => {
    try {
      const { EmbeddingWorker } = await import("./services/embedding-worker");
      const stats = await EmbeddingWorker.getJobStats();
      res.json({
        ...stats,
        workerRunning: EmbeddingWorker.isRunning(),
      });
    } catch (error) {
      console.error("Error getting embedding stats:", error);
      res.status(500).json({ error: "Failed to get embedding stats" });
    }
  });

  // Start embedding worker
  app.post("/api/admin/embeddings/worker/start", requireAdmin, async (req, res) => {
    try {
      const { EmbeddingWorker } = await import("./services/embedding-worker");
      EmbeddingWorker.startWorker();
      res.json({ message: "Embedding worker started" });
    } catch (error) {
      console.error("Error starting embedding worker:", error);
      res.status(500).json({ error: "Failed to start embedding worker" });
    }
  });

  // Stop embedding worker
  app.post("/api/admin/embeddings/worker/stop", requireAdmin, async (req, res) => {
    try {
      const { EmbeddingWorker } = await import("./services/embedding-worker");
      EmbeddingWorker.stopWorker();
      res.json({ message: "Embedding worker stopped" });
    } catch (error) {
      console.error("Error stopping embedding worker:", error);
      res.status(500).json({ error: "Failed to stop embedding worker" });
    }
  });

  // Create embedding jobs for coin types
  app.post("/api/admin/embeddings/queue", requireAdmin, async (req, res) => {
    try {
      const { EmbeddingWorker } = await import("./services/embedding-worker");
      const { coinTypeIds } = req.body;
      
      if (!coinTypeIds || !Array.isArray(coinTypeIds)) {
        return res.status(400).json({ error: "coinTypeIds array required" });
      }

      const jobIds: string[] = [];
      for (const coinTypeId of coinTypeIds) {
        const ids = await EmbeddingWorker.createEmbeddingJobsForCoinType(coinTypeId);
        jobIds.push(...ids);
      }

      res.json({ 
        message: `Created ${jobIds.length} embedding jobs`,
        jobIds,
      });
    } catch (error) {
      console.error("Error creating embedding jobs:", error);
      res.status(500).json({ error: "Failed to create embedding jobs" });
    }
  });

  // Process embedding batch manually
  app.post("/api/admin/embeddings/process", requireAdmin, async (req, res) => {
    try {
      const { EmbeddingWorker } = await import("./services/embedding-worker");
      const processed = await EmbeddingWorker.processNextBatch();
      res.json({ 
        message: `Processed ${processed} embedding jobs`,
        processed,
      });
    } catch (error) {
      console.error("Error processing embeddings:", error);
      res.status(500).json({ error: "Failed to process embeddings" });
    }
  });

  // List embedding jobs with filters
  app.get("/api/admin/embeddings/jobs", requireAdmin, async (req, res) => {
    try {
      const { status, limit = "50", offset = "0" } = req.query;
      const jobs = await storage.getEmbeddingJobs({
        status: status as string | undefined,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching embedding jobs:", error);
      res.status(500).json({ error: "Failed to fetch embedding jobs" });
    }
  });

  // Retry a specific embedding job (only failed or skipped jobs)
  app.post("/api/admin/embeddings/jobs/:id/retry", requireAdmin, async (req, res) => {
    try {
      const jobId = req.params.id;
      if (!jobId || typeof jobId !== 'string') {
        return res.status(400).json({ error: "Invalid job ID" });
      }
      
      const job = await storage.retryEmbeddingJob(jobId);
      if (!job) {
        return res.status(400).json({ error: "Job not found or not in a retryable state (must be FAILED or SKIPPED)" });
      }
      res.json({ message: "Job queued for retry", job });
    } catch (error) {
      console.error("Error retrying embedding job:", error);
      res.status(500).json({ error: "Failed to retry job" });
    }
  });

  // Cancel a pending embedding job
  app.post("/api/admin/embeddings/jobs/:id/cancel", requireAdmin, async (req, res) => {
    try {
      const jobId = req.params.id;
      if (!jobId || typeof jobId !== 'string') {
        return res.status(400).json({ error: "Invalid job ID" });
      }
      
      const job = await storage.cancelEmbeddingJob(jobId);
      if (!job) {
        return res.status(400).json({ error: "Job not found or not in a cancelable state (must be PENDING)" });
      }
      res.json({ message: "Job cancelled", job });
    } catch (error) {
      console.error("Error cancelling embedding job:", error);
      res.status(500).json({ error: "Failed to cancel job" });
    }
  });

  // ============ GRAPH API ============
  // Note: Graph endpoints require authentication to prevent enumeration attacks
  // Entity data itself is public numismatic reference data

  // Get entity by ID
  app.get("/api/entities/:id", requireAuth, async (req, res) => {
    try {
      const entity = await storage.getEntityById(req.params.id);
      if (!entity) {
        return res.status(404).json({ error: "Entity not found" });
      }
      res.json(entity);
    } catch (error) {
      console.error("Error fetching entity:", error);
      res.status(500).json({ error: "Failed to fetch entity" });
    }
  });

  // Get outgoing edges from an entity
  app.get("/api/entities/:id/edges/outgoing", requireAuth, async (req, res) => {
    try {
      const { edgeType } = req.query;
      const edges = await storage.getOutgoingEdges(
        req.params.id, 
        edgeType as string | undefined
      );
      res.json(edges);
    } catch (error) {
      console.error("Error fetching outgoing edges:", error);
      res.status(500).json({ error: "Failed to fetch edges" });
    }
  });

  // Get incoming edges to an entity
  app.get("/api/entities/:id/edges/incoming", requireAuth, async (req, res) => {
    try {
      const { edgeType } = req.query;
      const edges = await storage.getIncomingEdges(
        req.params.id, 
        edgeType as string | undefined
      );
      res.json(edges);
    } catch (error) {
      console.error("Error fetching incoming edges:", error);
      res.status(500).json({ error: "Failed to fetch edges" });
    }
  });

  // Get related entities (graph traversal)
  app.get("/api/entities/:id/related", requireAuth, async (req, res) => {
    try {
      const { edgeTypes, maxDepth } = req.query;
      const options: { edgeTypes?: string[]; maxDepth?: number } = {};
      
      if (edgeTypes) {
        options.edgeTypes = (edgeTypes as string).split(',');
      }
      if (maxDepth) {
        options.maxDepth = parseInt(maxDepth as string);
      }
      
      const related = await storage.getRelatedEntities(req.params.id, options);
      res.json(related);
    } catch (error) {
      console.error("Error fetching related entities:", error);
      res.status(500).json({ error: "Failed to fetch related entities" });
    }
  });

  // Create entity edge (admin only)
  app.post("/api/admin/entities/edges", requireAdmin, async (req, res) => {
    try {
      const { srcId, dstId, edgeType, confidence, provenance, sourceId, metadata } = req.body;
      
      // Validate required fields
      if (!srcId || !dstId || !edgeType) {
        return res.status(400).json({ error: "srcId, dstId, and edgeType are required" });
      }
      
      // Validate edge type
      const validEdgeTypes = ['ISSUED_BY', 'MINTED_AT', 'HAS_DENOMINATION', 'HAS_METAL', 'CITES_REFERENCE', 'CANDIDATE_TYPE', 'PRIMARY_TYPE', 'APPEARED_IN', 'MATCHES_LOT', 'DIE_OBV', 'DIE_REV', 'DIE_LINK'];
      if (!validEdgeTypes.includes(edgeType)) {
        return res.status(400).json({ error: `Invalid edgeType. Must be one of: ${validEdgeTypes.join(', ')}` });
      }
      
      // Validate entities exist
      const srcEntity = await storage.getEntityById(srcId);
      const dstEntity = await storage.getEntityById(dstId);
      if (!srcEntity) {
        return res.status(400).json({ error: "Source entity not found" });
      }
      if (!dstEntity) {
        return res.status(400).json({ error: "Destination entity not found" });
      }
      
      const edge = await storage.createEntityEdge({
        srcId,
        dstId,
        edgeType,
        confidence: confidence || '1.0',
        provenance,
        sourceId,
        metadata: metadata || {},
      });
      res.status(201).json(edge);
    } catch (error) {
      console.error("Error creating entity edge:", error);
      res.status(500).json({ error: "Failed to create edge" });
    }
  });

  // ============ VECTOR INDEX HEALTH (ADMIN) ============

  // Get vector index statistics
  app.get("/api/admin/vector/stats", requireAdmin, async (req, res) => {
    try {
      const stats = await db.execute(sql`
        SELECT 
          (SELECT count(*) FROM image_embeddings) as total_embeddings,
          (SELECT count(*) FROM image_embeddings WHERE embedding_vector IS NOT NULL) as indexed_embeddings,
          (SELECT count(*) FROM image_embeddings WHERE embedding_vector IS NULL) as pending_index,
          (SELECT pg_size_pretty(pg_relation_size('image_embeddings'))) as table_size,
          (SELECT pg_size_pretty(pg_relation_size('image_embeddings_vector_idx'))) as index_size
      `);
      
      const row = stats.rows[0] as any;
      res.json({
        totalEmbeddings: parseInt(row.total_embeddings || '0'),
        indexedEmbeddings: parseInt(row.indexed_embeddings || '0'),
        pendingIndex: parseInt(row.pending_index || '0'),
        tableSize: row.table_size,
        indexSize: row.index_size,
      });
    } catch (error) {
      console.error("Error fetching vector stats:", error);
      res.status(500).json({ error: "Failed to fetch vector stats" });
    }
  });

  // Sync embeddings to vector column (populate embedding_vector from embedding JSON)
  app.post("/api/admin/vector/sync", requireAdmin, async (req, res) => {
    try {
      // Parse JSON array string to proper vector format using array_to_string
      // The embedding column stores JSON like '[0.1, 0.2, ...]' which needs conversion
      const result = await db.execute(sql`
        UPDATE image_embeddings 
        SET embedding_vector = (
          SELECT array_agg(elem::float)::vector(512)
          FROM jsonb_array_elements_text(embedding::jsonb) AS elem
        )
        WHERE embedding_vector IS NULL 
          AND embedding IS NOT NULL
          AND embedding != ''
          AND embedding != '[]'
          AND jsonb_array_length(embedding::jsonb) = 512
        RETURNING id
      `);
      
      res.json({ 
        message: "Vector sync complete",
        synced: result.rowCount || 0,
      });
    } catch (error) {
      console.error("Error syncing vectors:", error);
      res.status(500).json({ error: "Failed to sync vectors" });
    }
  });

  // Reindex vector column (rebuild ivfflat index)
  app.post("/api/admin/vector/reindex", requireAdmin, async (req, res) => {
    try {
      await db.execute(sql`REINDEX INDEX CONCURRENTLY image_embeddings_vector_idx`);
      res.json({ message: "Vector index rebuild initiated" });
    } catch (error) {
      console.error("Error reindexing vectors:", error);
      res.status(500).json({ error: "Failed to reindex vectors" });
    }
  });

  // ============ SEED DATA ============

  // Seed museum data (admin only, for development)
  app.post("/api/admin/seed", requireAdmin, async (req, res) => {
    try {
      await storage.seedMuseumData();
      res.json({ message: "Museum data seeded successfully" });
    } catch (error) {
      console.error("Error seeding museum data:", error);
      res.status(500).json({ error: "Failed to seed museum data" });
    }
  });

  return httpServer;
}
