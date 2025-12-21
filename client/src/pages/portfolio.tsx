import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { 
  Search, 
  Plus, 
  Grid3X3, 
  List,
  Coins,
  ArrowUpDown,
  Calendar,
  Scale,
  Ruler
} from "lucide-react";
import type { UserCoin } from "@shared/schema";

type ViewMode = "grid" | "table";
type SortField = "title" | "createdAt" | "ruler" | "denomination";

export default function PortfolioPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("createdAt");

  const { data: coins, isLoading } = useQuery<UserCoin[]>({
    queryKey: ["/api/coins"],
  });

  const filteredCoins = coins?.filter((coin) => {
    const query = searchQuery.toLowerCase();
    return (
      coin.title.toLowerCase().includes(query) ||
      coin.ruler?.toLowerCase().includes(query) ||
      coin.denomination?.toLowerCase().includes(query) ||
      coin.mint?.toLowerCase().includes(query)
    );
  }) ?? [];

  const sortedCoins = [...filteredCoins].sort((a, b) => {
    switch (sortField) {
      case "title":
        return a.title.localeCompare(b.title);
      case "ruler":
        return (a.ruler ?? "").localeCompare(b.ruler ?? "");
      case "denomination":
        return (a.denomination ?? "").localeCompare(b.denomination ?? "");
      case "createdAt":
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });

  return (
    <Layout title="My Portfolio">
      <div className="p-6 space-y-6">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search coins..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search"
            />
          </div>
          <div className="flex items-center gap-3">
            <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
              <SelectTrigger className="w-40" data-testid="select-sort">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt">Date Added</SelectItem>
                <SelectItem value="title">Title</SelectItem>
                <SelectItem value="ruler">Ruler</SelectItem>
                <SelectItem value="denomination">Denomination</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex rounded-lg border border-border overflow-hidden">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setViewMode("grid")}
                className="rounded-none"
                data-testid="button-view-grid"
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setViewMode("table")}
                className="rounded-none"
                data-testid="button-view-table"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
            <Button asChild data-testid="button-add-coin">
              <Link href="/upload" className="gap-2">
                <Plus className="h-4 w-4" />
                Add Coin
              </Link>
            </Button>
          </div>
        </div>

        {/* Results Count */}
        <p className="text-sm text-muted-foreground">
          {isLoading ? (
            <Skeleton className="h-4 w-32 inline-block" />
          ) : (
            <>
              Showing {sortedCoins.length} {sortedCoins.length === 1 ? "coin" : "coins"}
              {searchQuery && ` for "${searchQuery}"`}
            </>
          )}
        </p>

        {/* Content */}
        {isLoading ? (
          viewMode === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <Card key={i}>
                  <CardContent className="p-0">
                    <Skeleton className="aspect-square rounded-t-lg" />
                    <div className="p-4 space-y-2">
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Ruler</TableHead>
                    <TableHead>Denomination</TableHead>
                    <TableHead>Mint</TableHead>
                    <TableHead>Weight</TableHead>
                    <TableHead>Added</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )
        ) : sortedCoins.length > 0 ? (
          viewMode === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sortedCoins.map((coin) => (
                <CoinCard key={coin.id} coin={coin} />
              ))}
            </div>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Ruler</TableHead>
                    <TableHead>Denomination</TableHead>
                    <TableHead>Mint</TableHead>
                    <TableHead>Weight</TableHead>
                    <TableHead>Added</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCoins.map((coin) => (
                    <TableRow key={coin.id} className="hover-elevate cursor-pointer" data-testid={`row-coin-${coin.id}`}>
                      <TableCell>
                        <Link href={`/coin/${coin.id}`} className="font-medium hover:underline">
                          {coin.title}
                        </Link>
                      </TableCell>
                      <TableCell>{coin.ruler ?? "-"}</TableCell>
                      <TableCell>
                        {coin.denomination && (
                          <Badge variant="secondary">{coin.denomination}</Badge>
                        )}
                      </TableCell>
                      <TableCell>{coin.mint ?? "-"}</TableCell>
                      <TableCell>
                        {coin.weightG ? `${coin.weightG}g` : "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(coin.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )
        ) : (
          <EmptyPortfolio hasSearch={!!searchQuery} />
        )}
      </div>
    </Layout>
  );
}

function CoinCard({ coin }: { coin: UserCoin }) {
  return (
    <Link href={`/coin/${coin.id}`}>
      <Card className="group overflow-hidden hover-elevate cursor-pointer" data-testid={`card-coin-${coin.id}`}>
        <CardContent className="p-0">
          <div className="aspect-square bg-gradient-to-br from-primary/10 via-primary/5 to-transparent flex items-center justify-center relative overflow-hidden">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-chart-2/30 to-chart-2/10 border-4 border-chart-2/20 flex items-center justify-center">
              <Coins className="h-12 w-12 text-chart-2/50" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="p-4 space-y-2">
            <h3 className="font-medium truncate group-hover:text-primary transition-colors">
              {coin.title}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {coin.ruler && (
                <Badge variant="secondary" className="text-xs">{coin.ruler}</Badge>
              )}
              {coin.denomination && (
                <Badge variant="outline" className="text-xs">{coin.denomination}</Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
              {coin.mint && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {coin.mint}
                </span>
              )}
              {coin.weightG && (
                <span className="flex items-center gap-1">
                  <Scale className="h-3 w-3" />
                  {coin.weightG}g
                </span>
              )}
              {coin.diameterMm && (
                <span className="flex items-center gap-1">
                  <Ruler className="h-3 w-3" />
                  {coin.diameterMm}mm
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyPortfolio({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted mb-6">
        <Coins className="h-10 w-10 text-muted-foreground" />
      </div>
      {hasSearch ? (
        <>
          <h3 className="text-lg font-medium">No coins found</h3>
          <p className="text-muted-foreground max-w-sm mt-2">
            Try adjusting your search query or filters.
          </p>
        </>
      ) : (
        <>
          <h3 className="text-lg font-medium">Your portfolio is empty</h3>
          <p className="text-muted-foreground max-w-sm mt-2">
            Start building your collection by uploading your first coin.
          </p>
          <Button asChild className="mt-6 gap-2">
            <Link href="/upload">
              <Plus className="h-4 w-4" />
              Upload Your First Coin
            </Link>
          </Button>
        </>
      )}
    </div>
  );
}
