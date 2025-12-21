import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserCoinSchema, insertWatchlistSchema, insertSourceSchema } from "@shared/schema";
import { z, ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

// Middleware to check authentication
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// Validation helper
function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  return schema.parse(body);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
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

  return httpServer;
}
