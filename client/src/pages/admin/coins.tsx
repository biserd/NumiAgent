import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { 
  Search, 
  Coins, 
  ExternalLink, 
  ChevronLeft, 
  ChevronRight,
  Image as ImageIcon,
  Calendar,
  MapPin
} from "lucide-react";
import type { CoinType, Source } from "@shared/schema";

interface CoinTypesResponse {
  items: CoinType[];
  total: number;
  page: number;
  totalPages: number;
}

interface CoinTypesStats {
  total: number;
  bySource: Record<string, number>;
}

function formatDate(dateFrom: number | null, dateTo: number | null): string {
  if (!dateFrom && !dateTo) return "-";
  if (dateFrom && dateTo && dateFrom === dateTo) {
    return `${dateFrom < 0 ? `${Math.abs(dateFrom)} BCE` : `${dateFrom} CE`}`;
  }
  const from = dateFrom ? (dateFrom < 0 ? `${Math.abs(dateFrom)} BCE` : `${dateFrom} CE`) : "?";
  const to = dateTo ? (dateTo < 0 ? `${Math.abs(dateTo)} BCE` : `${dateTo} CE`) : "?";
  return `${from} - ${to}`;
}

function CoinTypeDetail({ coinType }: { coinType: CoinType }) {
  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid={`dialog-coin-detail-${coinType.id}`}>
      <DialogHeader>
        <DialogTitle className="pr-8" data-testid="text-coin-title">{coinType.label || "Untitled Coin"}</DialogTitle>
      </DialogHeader>
      
      <div className="space-y-4">
        {coinType.imageUrl && (
          <div className="flex justify-center">
            <img 
              src={coinType.imageUrl} 
              alt={coinType.label || "Coin"} 
              className="max-h-64 rounded-md object-contain"
            />
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Source:</span>
            <p className="font-medium">{coinType.sourceId}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Record ID:</span>
            <p className="font-medium">{coinType.sourceRecordId}</p>
          </div>
          {coinType.authority && (
            <div>
              <span className="text-muted-foreground">Authority/Ruler:</span>
              <p className="font-medium">{coinType.authority}</p>
            </div>
          )}
          {coinType.issuer && (
            <div>
              <span className="text-muted-foreground">Issuer:</span>
              <p className="font-medium">{coinType.issuer}</p>
            </div>
          )}
          {coinType.mint && (
            <div>
              <span className="text-muted-foreground">Mint:</span>
              <p className="font-medium">{coinType.mint}</p>
            </div>
          )}
          {coinType.denomination && (
            <div>
              <span className="text-muted-foreground">Denomination:</span>
              <p className="font-medium">{coinType.denomination}</p>
            </div>
          )}
          {coinType.metal && (
            <div>
              <span className="text-muted-foreground">Metal:</span>
              <p className="font-medium">{coinType.metal}</p>
            </div>
          )}
          {coinType.region && (
            <div>
              <span className="text-muted-foreground">Region:</span>
              <p className="font-medium">{coinType.region}</p>
            </div>
          )}
          {(coinType.dateFrom || coinType.dateTo) && (
            <div>
              <span className="text-muted-foreground">Date:</span>
              <p className="font-medium">{formatDate(coinType.dateFrom, coinType.dateTo)}</p>
            </div>
          )}
        </div>
        
        {coinType.referenceText && (
          <div>
            <span className="text-muted-foreground text-sm">Description:</span>
            <p className="mt-1 text-sm">{coinType.referenceText}</p>
          </div>
        )}
        
        {coinType.sourceUrl && (
          <div className="pt-2">
            <Button variant="outline" asChild data-testid="button-view-source">
              <a href={coinType.sourceUrl} target="_blank" rel="noopener noreferrer" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                View Original Source
              </a>
            </Button>
          </div>
        )}
      </div>
    </DialogContent>
  );
}

export default function AdminCoinsPage() {
  const [page, setPage] = useState(1);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCoin, setSelectedCoin] = useState<CoinType | null>(null);

  const { data: sources } = useQuery<Source[]>({
    queryKey: ["/api/admin/sources"],
  });

  const { data: stats } = useQuery<CoinTypesStats>({
    queryKey: ["/api/admin/coin-types/stats"],
  });

  const { data: coinsData, isLoading } = useQuery<CoinTypesResponse>({
    queryKey: ["/api/admin/coin-types", sourceFilter, searchQuery, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (sourceFilter !== "all") params.set("sourceId", sourceFilter);
      if (searchQuery) params.set("search", searchQuery);
      params.set("page", String(page));
      params.set("limit", "20");
      const url = `/api/admin/coin-types?${params.toString()}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch coins");
      return res.json();
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Coins Database</h1>
            <p className="text-muted-foreground">
              Browse all ingested coin types from museum sources
            </p>
          </div>
          {stats && (
            <Badge variant="secondary" className="text-lg px-3 py-1">
              <Coins className="w-4 h-4 mr-2" />
              {stats.total.toLocaleString()} coins
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {stats && sources?.map((source) => (
            <Card key={source.id} className="cursor-pointer hover-elevate" onClick={() => {
              setSourceFilter(source.id);
              setPage(1);
            }}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{source.name}</span>
                  <Badge variant="outline">{stats.bySource[source.id] || 0}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Coins</CardTitle>
            <CardDescription>
              View and search through ingested coin types
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    data-testid="input-search-coins"
                    placeholder="Search by ruler, mint, denomination..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </form>
              
              <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[200px]" data-testid="select-source-filter">
                  <SelectValue placeholder="All sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  {sources?.map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : coinsData?.items?.length === 0 ? (
              <div className="text-center py-12">
                <Coins className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium">No coins found</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {searchQuery ? "Try adjusting your search terms" : "Start an ingestion run to import coins"}
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">Image</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Authority</TableHead>
                        <TableHead>Mint</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead className="w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {coinsData?.items.map((coin) => (
                        <TableRow 
                          key={coin.id} 
                          className="cursor-pointer hover-elevate"
                          onClick={() => setSelectedCoin(coin)}
                          data-testid={`row-coin-${coin.id}`}
                        >
                          <TableCell>
                            {coin.imageUrl ? (
                              <img 
                                src={coin.imageUrl} 
                                alt="" 
                                className="w-12 h-12 object-cover rounded"
                              />
                            ) : (
                              <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                                <ImageIcon className="w-5 h-5 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-medium max-w-[200px] truncate">
                            {coin.label || "Untitled"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {coin.authority || "-"}
                          </TableCell>
                          <TableCell>
                            {coin.mint ? (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {coin.mint}
                              </span>
                            ) : "-"}
                          </TableCell>
                          <TableCell>
                            {(coin.dateFrom || coin.dateTo) ? (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {formatDate(coin.dateFrom, coin.dateTo)}
                              </span>
                            ) : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {coin.sourceId}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {coin.sourceUrl && (
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                asChild
                                onClick={(e) => e.stopPropagation()}
                              >
                                <a href={coin.sourceUrl} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {coinsData && coinsData.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      Showing {((coinsData.page - 1) * 20) + 1} - {Math.min(coinsData.page * 20, coinsData.total)} of {coinsData.total}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={page === 1}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm">
                        Page {coinsData.page} of {coinsData.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={page >= coinsData.totalPages}
                        onClick={() => setPage(p => p + 1)}
                        data-testid="button-next-page"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedCoin} onOpenChange={() => setSelectedCoin(null)}>
        {selectedCoin && <CoinTypeDetail coinType={selectedCoin} />}
      </Dialog>
    </Layout>
  );
}
