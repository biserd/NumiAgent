// Watchlist alert service for NumisVault
// Checks watchlist criteria against new coin types and sends email notifications

import { storage } from "./storage";
import { sendWatchlistAlert, type WatchlistAlertData } from "./email";
import type { Watchlist, CoinType, User } from "@shared/schema";

interface WatchlistRules {
  ruler?: string;
  denomination?: string;
  mint?: string;
  dateFrom?: number;
  dateTo?: number;
}

function matchesCriteria(coinType: CoinType, rules: WatchlistRules): boolean {
  if (rules.ruler && !coinType.label.toLowerCase().includes(rules.ruler.toLowerCase())) {
    return false;
  }
  if (rules.dateFrom && coinType.dateTo && coinType.dateTo < rules.dateFrom) {
    return false;
  }
  if (rules.dateTo && coinType.dateFrom && coinType.dateFrom > rules.dateTo) {
    return false;
  }
  return true;
}

export async function checkWatchlistAlerts(): Promise<void> {
  console.log("Checking watchlist alerts...");
  
  try {
    const watchlists = await storage.getAllEnabledWatchlists();
    if (watchlists.length === 0) {
      console.log("No enabled watchlists to check");
      return;
    }

    const recentCoinTypes = await storage.searchCoinTypes({ limit: 100 });
    
    for (const watchlist of watchlists) {
      const rules = watchlist.rules as WatchlistRules;
      const matchingCoins = recentCoinTypes.filter(ct => matchesCriteria(ct, rules));
      
      if (matchingCoins.length > 0) {
        const user = await storage.getUser(watchlist.userId);
        if (user?.email) {
          const alertData: WatchlistAlertData = {
            userName: user.firstName || user.username || "Collector",
            userEmail: user.email,
            watchlistName: watchlist.name,
            matchCount: matchingCoins.length,
            matches: matchingCoins.slice(0, 5).map(ct => ({
              title: ct.label,
              ruler: ct.obvLegend || undefined,
              denomination: ct.referenceText || undefined,
            })),
          };

          const sent = await sendWatchlistAlert(alertData);
          if (sent) {
            await storage.createNotification({
              userId: watchlist.userId,
              kind: "WATCHLIST_MATCH",
              title: `${matchingCoins.length} new match${matchingCoins.length > 1 ? 'es' : ''} for "${watchlist.name}"`,
              message: `Found coins matching your watchlist criteria.`,
              payload: { watchlistId: watchlist.id, matchCount: matchingCoins.length },
              sentVia: "email",
              isRead: false,
            });
            console.log(`Alert sent for watchlist ${watchlist.name} to ${user.email}`);
          }
        }
      }
    }
    
    console.log("Watchlist alert check completed");
  } catch (error) {
    console.error("Error checking watchlist alerts:", error);
  }
}

let alertInterval: NodeJS.Timeout | null = null;

export function startAlertScheduler(intervalMinutes: number = 60): void {
  if (alertInterval) {
    clearInterval(alertInterval);
  }
  
  console.log(`Starting watchlist alert scheduler (every ${intervalMinutes} minutes)`);
  alertInterval = setInterval(checkWatchlistAlerts, intervalMinutes * 60 * 1000);
  
  setTimeout(checkWatchlistAlerts, 5000);
}

export function stopAlertScheduler(): void {
  if (alertInterval) {
    clearInterval(alertInterval);
    alertInterval = null;
    console.log("Watchlist alert scheduler stopped");
  }
}
