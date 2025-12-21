import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { 
  Upload, 
  FolderOpen, 
  Bell, 
  TrendingUp, 
  Plus,
  ArrowRight,
  Coins,
  Eye
} from "lucide-react";
import type { UserCoin, Notification, Watchlist } from "@shared/schema";

export default function DashboardPage() {
  const { data: coins, isLoading: coinsLoading } = useQuery<UserCoin[]>({
    queryKey: ["/api/coins"],
  });

  const { data: notifications, isLoading: notificationsLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
  });

  const { data: watchlists, isLoading: watchlistsLoading } = useQuery<Watchlist[]>({
    queryKey: ["/api/watchlists"],
  });

  const recentCoins = coins?.slice(0, 4) ?? [];
  const unreadNotifications = notifications?.filter(n => !n.isRead) ?? [];

  return (
    <Layout title="Dashboard">
      <div className="p-6 space-y-8">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Coins"
            value={coinsLoading ? null : (coins?.length ?? 0)}
            icon={Coins}
            description="In your portfolio"
          />
          <StatsCard
            title="Active Watchlists"
            value={watchlistsLoading ? null : (watchlists?.filter(w => w.isEnabled).length ?? 0)}
            icon={Eye}
            description="Monitoring for matches"
          />
          <StatsCard
            title="Unread Alerts"
            value={notificationsLoading ? null : unreadNotifications.length}
            icon={Bell}
            description="New notifications"
          />
          <StatsCard
            title="Match Rate"
            value="--"
            icon={TrendingUp}
            description="Average similarity"
          />
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="group hover-elevate" data-testid="card-action-upload">
            <CardContent className="p-6">
              <Link href="/upload" className="flex items-start gap-4" data-testid="link-upload-coin">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Upload className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold">Upload New Coin</h3>
                  <p className="text-sm text-muted-foreground">
                    Add photos of your coin to find matches and build your portfolio.
                  </p>
                </div>
              </Link>
            </CardContent>
          </Card>

          <Card className="group hover-elevate" data-testid="card-action-portfolio">
            <CardContent className="p-6">
              <Link href="/portfolio" className="flex items-start gap-4" data-testid="link-view-portfolio">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-chart-3/10 text-chart-3 group-hover:bg-chart-3 group-hover:text-white transition-colors">
                  <FolderOpen className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold">View Portfolio</h3>
                  <p className="text-sm text-muted-foreground">
                    Browse and manage your entire coin collection.
                  </p>
                </div>
              </Link>
            </CardContent>
          </Card>

          <Card className="group hover-elevate" data-testid="card-action-watchlist">
            <CardContent className="p-6">
              <Link href="/watchlists" className="flex items-start gap-4" data-testid="link-create-watchlist">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-chart-2/10 text-chart-2 group-hover:bg-chart-2 group-hover:text-white transition-colors">
                  <Eye className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold">Create Watchlist</h3>
                  <p className="text-sm text-muted-foreground">
                    Set up alerts for specific coin types or rulers.
                  </p>
                </div>
              </Link>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Recent Coins */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
                <div>
                  <CardTitle className="font-display">Recent Coins</CardTitle>
                  <CardDescription>Your latest additions</CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/portfolio" className="gap-1">
                    View All
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                {coinsLoading ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="flex gap-3 p-3 rounded-lg border border-border">
                        <Skeleton className="w-16 h-16 rounded-lg shrink-0" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : recentCoins.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {recentCoins.map((coin) => (
                      <CoinPreviewCard key={coin.id} coin={coin} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={Coins}
                    title="No coins yet"
                    description="Upload your first coin to get started with your collection."
                    action={
                      <Button asChild>
                        <Link href="/upload" className="gap-2">
                          <Plus className="h-4 w-4" />
                          Upload Coin
                        </Link>
                      </Button>
                    }
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Notifications */}
          <div>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
                <div>
                  <CardTitle className="font-display">Notifications</CardTitle>
                  <CardDescription>Recent alerts</CardDescription>
                </div>
                {unreadNotifications.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {unreadNotifications.length} new
                  </Badge>
                )}
              </CardHeader>
              <CardContent>
                {notificationsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-3 w-3/4" />
                      </div>
                    ))}
                  </div>
                ) : unreadNotifications.length > 0 ? (
                  <div className="space-y-3">
                    {unreadNotifications.slice(0, 5).map((notification) => (
                      <div 
                        key={notification.id} 
                        className="p-3 rounded-lg bg-muted/50 space-y-1"
                      >
                        <p className="text-sm font-medium">{notification.title}</p>
                        <p className="text-xs text-muted-foreground">{notification.message}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={Bell}
                    title="No notifications"
                    description="You're all caught up! Alerts will appear here."
                    compact
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function StatsCard({ 
  title, 
  value, 
  icon: Icon, 
  description 
}: { 
  title: string; 
  value: number | string | null; 
  icon: React.ElementType; 
  description: string;
}) {
  return (
    <Card data-testid={`card-stat-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            {value === null ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-bold">{value}</p>
            )}
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CoinPreviewCard({ coin }: { coin: UserCoin }) {
  return (
    <Link href={`/coin/${coin.id}`}>
      <div className="flex gap-3 p-3 rounded-lg border border-border hover-elevate cursor-pointer transition-all">
        <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
          <Coins className="h-6 w-6 text-primary/60" />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <h4 className="font-medium text-sm truncate">{coin.title}</h4>
          <div className="flex flex-wrap gap-1">
            {coin.ruler && (
              <Badge variant="secondary" className="text-xs">{coin.ruler}</Badge>
            )}
            {coin.denomination && (
              <Badge variant="outline" className="text-xs">{coin.denomination}</Badge>
            )}
          </div>
          {coin.mint && (
            <p className="text-xs text-muted-foreground truncate">{coin.mint}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  action,
  compact = false 
}: { 
  icon: React.ElementType; 
  title: string; 
  description: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-6' : 'py-12'}`}>
      <div className={`flex items-center justify-center rounded-full bg-muted ${compact ? 'h-10 w-10 mb-3' : 'h-14 w-14 mb-4'}`}>
        <Icon className={`text-muted-foreground ${compact ? 'h-5 w-5' : 'h-6 w-6'}`} />
      </div>
      <h3 className={`font-medium ${compact ? 'text-sm' : ''}`}>{title}</h3>
      <p className={`text-muted-foreground max-w-xs mt-1 ${compact ? 'text-xs' : 'text-sm'}`}>
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
