import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserCoinSchema, insertWatchlistSchema, insertSourceSchema, insertImageAssetSchema, insertSimilarMatchSchema } from "@shared/schema";
import { z, ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { registerObjectStorageRoutes, ObjectStorageService } from "./replit_integrations/object_storage";
import { setupAuth, registerAuthRoutes, requireAuth } from "./auth";

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

  // Get similar matches for a coin
  app.get("/api/coins/:id/matches", requireAuth, async (req, res) => {
    try {
      const coin = await storage.getCoinById(req.params.id);
      if (!coin) {
        return res.status(404).json({ error: "Coin not found" });
      }
      if (coin.userId !== (req.user as any).id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const matches = await storage.getMatchesByCoin(req.params.id);
      res.json(matches);
    } catch (error) {
      console.error("Error fetching matches:", error);
      res.status(500).json({ error: "Failed to fetch matches" });
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
  app.get("/api/admin/sources", requireAuth, async (req, res) => {
    try {
      const sources = await storage.getSources();
      res.json(sources);
    } catch (error) {
      console.error("Error fetching sources:", error);
      res.status(500).json({ error: "Failed to fetch sources" });
    }
  });

  // Create a new source
  app.post("/api/admin/sources", requireAuth, async (req, res) => {
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
  app.patch("/api/admin/sources/:id", requireAuth, async (req, res) => {
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
  app.get("/api/admin/ingestion-runs", requireAuth, async (req, res) => {
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
  app.get("/api/admin/ingestion-stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getIngestionStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching ingestion stats:", error);
      res.status(500).json({ error: "Failed to fetch ingestion stats" });
    }
  });

  // Create and run an ingestion job
  app.post("/api/admin/ingestion-runs", requireAuth, async (req, res) => {
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
  app.patch("/api/admin/ingestion-runs/:id", requireAuth, async (req, res) => {
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

      // Find matching coin types based on metadata
      const matches = await storage.findMatchingCoinTypes(coin);
      
      // Create similar match entries
      const similarMatches = [];
      for (const match of matches) {
        const similarMatch = await storage.createSimilarMatch({
          userCoinId: coin.id,
          coinTypeId: match.coinType.id,
          confidence: match.confidence.toString(),
          reasons: match.reasons,
        });
        similarMatches.push({
          ...similarMatch,
          coinType: match.coinType,
        });
      }

      res.json(similarMatches);
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
      
      // Enrich matches with coin type data and source info
      const enrichedMatches = await Promise.all(
        matches.map(async (match) => {
          if (match.coinTypeId) {
            const coinType = await storage.getCoinTypeById(match.coinTypeId);
            let source = undefined;
            if (coinType?.sourceId) {
              source = await storage.getSourceById(coinType.sourceId);
            }
            return { ...match, coinType, source };
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

  // ============ SEED DATA ============

  // Seed museum data (admin only, for development)
  app.post("/api/admin/seed", requireAuth, async (req, res) => {
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
