import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, 
  Upload,
  Database,
  ExternalLink,
  BookOpen,
  Sparkles,
  Crown,
  CircleDot,
  MapPin,
  Coins,
  Calendar
} from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { CoinType, Entity } from "@shared/schema";

export default function ResearchPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("types");

  const { data: coinTypes, isLoading: typesLoading } = useQuery<CoinType[]>({
    queryKey: ["/api/coin-types", searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set("ruler", searchQuery);
      params.set("limit", "20");
      const res = await fetch(`/api/coin-types?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: activeTab === "types",
  });

  const { data: rulers, isLoading: rulersLoading } = useQuery<Entity[]>({
    queryKey: ["/api/entities", "ruler"],
    queryFn: async () => {
      const res = await fetch("/api/entities?type=ruler", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: activeTab === "rulers",
  });

  const { data: mints, isLoading: mintsLoading } = useQuery<Entity[]>({
    queryKey: ["/api/entities", "mint"],
    queryFn: async () => {
      const res = await fetch("/api/entities?type=mint", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: activeTab === "mints",
  });

  const { data: denominations, isLoading: denominationsLoading } = useQuery<Entity[]>({
    queryKey: ["/api/entities", "denomination"],
    queryFn: async () => {
      const res = await fetch("/api/entities?type=denomination", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: activeTab === "denominations",
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
  };

  return (
    <Layout title="Research">
      <div className="p-6 space-y-8">
        <div className="max-w-2xl mx-auto text-center space-y-4">
          <h2 className="font-display text-2xl font-bold">
            Explore Museum Collections
          </h2>
          <p className="text-muted-foreground">
            Search across reference collections from world-class institutions.
          </p>
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search by ruler, denomination, mint..."
              className="pl-12 h-12 text-base"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-research"
            />
          </form>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto">
          <Card className="hover-elevate">
            <CardContent className="p-6">
              <Link href="/upload" className="flex flex-col items-center text-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Upload className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="font-semibold">Upload & Match</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Find similar coins by uploading photos
                  </p>
                </div>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover-elevate" onClick={() => setActiveTab("types")}>
            <CardContent className="p-6 cursor-pointer">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-chart-3/10 text-chart-3">
                  <Database className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="font-semibold">Browse Types</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Explore catalogued coin types
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate">
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-chart-2/10 text-chart-2">
                  <BookOpen className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="font-semibold">References</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Standard reference catalogs
                  </p>
                  <Badge variant="secondary" className="mt-2">Coming Soon</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="max-w-5xl mx-auto">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Database className="h-5 w-5" />
              Browse Database
            </CardTitle>
            <CardDescription>
              Explore coin types, rulers, mints, and denominations in our reference database.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-6">
                <TabsTrigger value="types" data-testid="tab-types" className="gap-2">
                  <Coins className="h-4 w-4" />
                  Coin Types
                </TabsTrigger>
                <TabsTrigger value="rulers" data-testid="tab-rulers" className="gap-2">
                  <Crown className="h-4 w-4" />
                  Rulers
                </TabsTrigger>
                <TabsTrigger value="mints" data-testid="tab-mints" className="gap-2">
                  <MapPin className="h-4 w-4" />
                  Mints
                </TabsTrigger>
                <TabsTrigger value="denominations" data-testid="tab-denominations" className="gap-2">
                  <CircleDot className="h-4 w-4" />
                  Denominations
                </TabsTrigger>
              </TabsList>

              <TabsContent value="types">
                {typesLoading ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="p-4 rounded-lg border border-border space-y-2">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                    ))}
                  </div>
                ) : coinTypes && coinTypes.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {coinTypes.map((ct) => (
                      <CoinTypeCard key={ct.id} coinType={ct} />
                    ))}
                  </div>
                ) : (
                  <EmptyState 
                    icon={Coins} 
                    title="No coin types found" 
                    description={searchQuery ? `No results for "${searchQuery}"` : "No coin types in the database yet."} 
                  />
                )}
              </TabsContent>

              <TabsContent value="rulers">
                {rulersLoading ? (
                  <EntityGridSkeleton />
                ) : rulers && rulers.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {rulers.map((entity) => (
                      <EntityCard key={entity.id} entity={entity} icon={Crown} />
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={Crown} title="No rulers found" description="No rulers in the database yet." />
                )}
              </TabsContent>

              <TabsContent value="mints">
                {mintsLoading ? (
                  <EntityGridSkeleton />
                ) : mints && mints.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {mints.map((entity) => (
                      <EntityCard key={entity.id} entity={entity} icon={MapPin} />
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={MapPin} title="No mints found" description="No mints in the database yet." />
                )}
              </TabsContent>

              <TabsContent value="denominations">
                {denominationsLoading ? (
                  <EntityGridSkeleton />
                ) : denominations && denominations.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {denominations.map((entity) => (
                      <EntityCard key={entity.id} entity={entity} icon={CircleDot} />
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={CircleDot} title="No denominations found" description="No denominations in the database yet." />
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card className="max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Database className="h-5 w-5" />
              Available Sources
            </CardTitle>
            <CardDescription>
              Our research database draws from these open-access museum collections.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {sources.map((source) => (
                <a
                  key={source.name}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg border border-border hover-elevate"
                  data-testid={`link-source-${source.id}`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{source.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{source.description}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0">{source.license}</Badge>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="max-w-4xl mx-auto bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
          <CardContent className="p-8 flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-display text-xl font-semibold">AI-Powered Similarity Search</h3>
              <p className="text-muted-foreground mt-2">
                Coming soon: Upload a photo and instantly find visually similar coins using deep learning embeddings. 
                Our AI will identify potential matches, suggest attributions, and connect you with reference materials.
              </p>
            </div>
            <Button variant="outline" className="shrink-0" disabled>
              Notify Me
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function CoinTypeCard({ coinType }: { coinType: CoinType }) {
  const formatDate = (date: number | null | undefined) => {
    if (!date) return null;
    return date < 0 ? `${Math.abs(date)} BCE` : `${date} CE`;
  };

  const dateRange = coinType.dateFrom || coinType.dateTo
    ? `${formatDate(coinType.dateFrom) || "?"} - ${formatDate(coinType.dateTo) || "?"}`
    : null;

  return (
    <div className="p-4 rounded-lg border border-border hover-elevate cursor-pointer" data-testid={`card-cointype-${coinType.id}`}>
      <h4 className="font-medium text-sm line-clamp-2">{coinType.label}</h4>
      {dateRange && (
        <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          {dateRange}
        </div>
      )}
      {coinType.referenceText && (
        <Badge variant="outline" className="mt-2 text-xs">{coinType.referenceText}</Badge>
      )}
    </div>
  );
}

function EntityCard({ entity, icon: Icon }: { entity: Entity; icon: React.ElementType }) {
  return (
    <div className="p-4 rounded-lg border border-border hover-elevate cursor-pointer" data-testid={`card-entity-${entity.id}`}>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{entity.label}</p>
          <p className="text-xs text-muted-foreground capitalize">{entity.type}</p>
        </div>
      </div>
    </div>
  );
}

function EntityGridSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div key={i} className="p-4 rounded-lg border border-border">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="text-center py-12">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mx-auto mb-4">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
    </div>
  );
}

const sources = [
  {
    id: "ikmk",
    name: "Münzkabinett Berlin",
    description: "Digital collection of ancient coins",
    url: "https://ikmk.smb.museum/",
    license: "CC0/PD",
  },
  {
    id: "smithsonian",
    name: "Smithsonian Open Access",
    description: "National Numismatic Collection",
    url: "https://www.si.edu/openaccess",
    license: "CC0",
  },
  {
    id: "met",
    name: "The Met Collection",
    description: "Metropolitan Museum of Art",
    url: "https://www.metmuseum.org/art/collection",
    license: "CC0",
  },
  {
    id: "artic",
    name: "Art Institute of Chicago",
    description: "Ancient coins collection",
    url: "https://www.artic.edu/collection",
    license: "CC0",
  },
  {
    id: "nga",
    name: "National Gallery of Art",
    description: "Open access images",
    url: "https://www.nga.gov/open-access-images.html",
    license: "CC0",
  },
  {
    id: "walters",
    name: "Walters Art Museum",
    description: "Ancient art collection",
    url: "https://thewalters.org/",
    license: "CC0",
  },
];
