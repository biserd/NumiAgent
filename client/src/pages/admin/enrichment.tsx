import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Database, 
  Play, 
  RefreshCw, 
  CheckCircle2,
  AlertCircle,
  Loader2 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface EnrichmentStats {
  entitiesWithNomisma: number;
  enrichedCoinTypes: number;
  nomismaCoinTypes: number;
}

interface EnrichmentProgress {
  running: boolean;
  processed: number;
  total: number;
  coinTypes: number;
  errors: number;
}

export default function EnrichmentPage() {
  const { toast } = useToast();
  const [limit, setLimit] = useState("50");
  const [pollingEnabled, setPollingEnabled] = useState(false);

  const { data: stats, refetch: refetchStats } = useQuery<EnrichmentStats>({
    queryKey: ["/api/admin/enrichment/stats"],
  });

  const { data: progress, refetch: refetchProgress } = useQuery<EnrichmentProgress>({
    queryKey: ["/api/admin/enrichment/progress"],
    refetchInterval: pollingEnabled ? 2000 : false,
  });

  useEffect(() => {
    if (progress?.running) {
      setPollingEnabled(true);
    } else if (pollingEnabled && progress && !progress.running) {
      setPollingEnabled(false);
      refetchStats();
      if (progress.processed > 0) {
        toast({
          title: "Enrichment Complete",
          description: `Processed ${progress.processed} entities, created ${progress.coinTypes} edges`,
        });
      }
    }
  }, [progress?.running]);

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrichment/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ limit: parseInt(limit) }),
      });
      if (!res.ok) throw new Error("Failed to start enrichment");
      return res.json();
    },
    onSuccess: () => {
      setPollingEnabled(true);
      refetchProgress();
      toast({
        title: "Enrichment Started",
        description: `Processing up to ${limit} entities from local Nomisma RDF`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start enrichment",
        variant: "destructive",
      });
    },
  });

  const progressPercent = progress?.total 
    ? Math.round((progress.processed / progress.total) * 100) 
    : 0;

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Nomisma Enrichment</h1>
          <p className="text-muted-foreground">
            Extract entity relationships (HAS_METAL, BROADER_THAN) from local Nomisma RDF data
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Entities with Nomisma URI
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {stats?.entitiesWithNomisma?.toLocaleString() || 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Mints and rulers with Nomisma links
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Edges from RDF
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {stats?.enrichedCoinTypes?.toLocaleString() || 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Entity relationships from local data
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Entity Edges
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {stats?.nomismaCoinTypes?.toLocaleString() || 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                All edges in the graph
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Batch Enrichment
            </CardTitle>
            <CardDescription>
              Parse local Nomisma RDF files to extract entity relationships and create graph edges.
              This process runs in the background with rate limiting.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-4">
              <div className="space-y-2">
                <Label htmlFor="limit">Entities to process</Label>
                <Input
                  id="limit"
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  className="w-32"
                  min="1"
                  max="500"
                  disabled={progress?.running}
                  data-testid="input-enrichment-limit"
                />
              </div>
              <Button
                onClick={() => startMutation.mutate()}
                disabled={progress?.running || startMutation.isPending}
                data-testid="button-start-enrichment"
              >
                {progress?.running ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Start Enrichment
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  refetchStats();
                  refetchProgress();
                }}
                data-testid="button-refresh-stats"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>

            {progress?.running && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Processing entities...</span>
                  <span>{progress.processed} / {progress.total}</span>
                </div>
                <Progress value={progressPercent} />
                <div className="flex flex-wrap gap-4 text-sm">
                  <Badge variant="secondary">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    {progress.coinTypes} edges created
                  </Badge>
                  {progress.errors > 0 && (
                    <Badge variant="destructive">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {progress.errors} errors
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {!progress?.running && progress && progress.processed > 0 && (
              <div className="p-4 bg-muted rounded-md">
                <p className="font-medium">Last run complete</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Processed {progress.processed} entities, created {progress.coinTypes} edges
                  {progress.errors > 0 && `, ${progress.errors} errors`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
