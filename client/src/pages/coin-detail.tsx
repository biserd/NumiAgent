import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { 
  ArrowLeft, 
  Pencil, 
  Trash2, 
  Search,
  Coins,
  Scale,
  Ruler,
  CircleDot,
  MapPin,
  Crown,
  ExternalLink,
  Sparkles,
  Loader2
} from "lucide-react";
import type { UserCoin, SimilarMatch } from "@shared/schema";
import { LicenseBadge } from "@/components/Attribution";

export default function CoinDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    ruler: "",
    denomination: "",
    mint: "",
    metal: "",
    weightG: "",
    diameterMm: "",
    reference: "",
  });

  const { data: coin, isLoading } = useQuery<UserCoin>({
    queryKey: ["/api/coins", params.id],
  });

  useEffect(() => {
    if (coin && isEditOpen) {
      setEditForm({
        title: coin.title || "",
        description: coin.description || "",
        ruler: coin.ruler || "",
        denomination: coin.denomination || "",
        mint: coin.mint || "",
        metal: coin.metal || "",
        weightG: coin.weightG || "",
        diameterMm: coin.diameterMm || "",
        reference: coin.reference || "",
      });
    }
  }, [coin, isEditOpen]);

  const { data: matches, isLoading: matchesLoading } = useQuery<SimilarMatch[]>({
    queryKey: ["/api/coins", params.id, "matches"],
    queryFn: async () => {
      const res = await fetch(`/api/coins/${params.id}/matches`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch matches");
      return res.json();
    },
    enabled: !!params.id,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/coins/${params.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coins"] });
      toast({
        title: "Coin deleted",
        description: "The coin has been removed from your portfolio.",
      });
      navigate("/portfolio");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete coin",
        variant: "destructive",
      });
    },
  });

  const editMutation = useMutation({
    mutationFn: async (data: typeof editForm) => {
      const parseNumeric = (val: string): string | null => {
        const trimmed = val.trim();
        if (!trimmed) return null;
        const num = parseFloat(trimmed);
        return isNaN(num) ? null : trimmed;
      };

      const res = await apiRequest("PATCH", `/api/coins/${params.id}`, {
        title: data.title.trim(),
        description: data.description.trim() || null,
        ruler: data.ruler.trim() || null,
        denomination: data.denomination.trim() || null,
        mint: data.mint.trim() || null,
        metal: data.metal.trim() || null,
        weightG: parseNumeric(data.weightG),
        diameterMm: parseNumeric(data.diameterMm),
        reference: data.reference.trim() || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coins", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/coins"] });
      toast({
        title: "Coin updated",
        description: "Your changes have been saved.",
      });
      setIsEditOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update coin",
        variant: "destructive",
      });
    },
  });

  const openEditDialog = () => {
    setIsEditOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm.title.trim()) {
      toast({
        title: "Title required",
        description: "Please enter a title for your coin.",
        variant: "destructive",
      });
      return;
    }
    editMutation.mutate(editForm);
  };

  if (isLoading) {
    return (
      <Layout title="Loading...">
        <div className="p-6 max-w-5xl mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <div className="grid lg:grid-cols-2 gap-6">
            <Skeleton className="aspect-square rounded-xl" />
            <div className="space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-32 w-full" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!coin) {
    return (
      <Layout title="Not Found">
        <div className="p-6 flex flex-col items-center justify-center min-h-[50vh]">
          <Coins className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">Coin not found</h2>
          <p className="text-muted-foreground mt-2">This coin may have been deleted.</p>
          <Button asChild className="mt-6">
            <Link href="/portfolio">Back to Portfolio</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/portfolio">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="font-display text-2xl font-bold">{coin.title}</h1>
              <div className="flex items-center gap-2 mt-1">
                {coin.ruler && (
                  <Badge variant="secondary">{coin.ruler}</Badge>
                )}
                {coin.denomination && (
                  <Badge variant="outline">{coin.denomination}</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={openEditDialog} data-testid="button-edit">
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 text-destructive" data-testid="button-delete">
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this coin?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete this coin from your portfolio.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <Tabs defaultValue="details" className="space-y-6">
          <TabsList>
            <TabsTrigger value="details" data-testid="tab-details">Details</TabsTrigger>
            <TabsTrigger value="research" data-testid="tab-research">
              Research
              {matches && matches.length > 0 && (
                <Badge variant="secondary" className="ml-2">{matches.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-6">
            <div className="grid lg:grid-cols-5 gap-6">
              {/* Images */}
              <div className="lg:col-span-3 space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Obverse</p>
                    <div className="aspect-square rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent flex items-center justify-center border border-border">
                      <div className="w-40 h-40 rounded-full bg-gradient-to-br from-chart-2/30 to-chart-2/10 border-4 border-chart-2/20 flex items-center justify-center">
                        <Coins className="h-16 w-16 text-chart-2/50" />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Reverse</p>
                    <div className="aspect-square rounded-xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center border border-border">
                      <div className="w-40 h-40 rounded-full bg-gradient-to-br from-muted-foreground/20 to-muted-foreground/10 border-4 border-muted-foreground/10 flex items-center justify-center">
                        <Coins className="h-16 w-16 text-muted-foreground/30" />
                      </div>
                    </div>
                  </div>
                </div>
                
                {coin.description && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Description</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">{coin.description}</p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Metadata */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="font-display">Specifications</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <MetadataRow icon={Crown} label="Ruler" value={coin.ruler} />
                    <MetadataRow icon={CircleDot} label="Denomination" value={coin.denomination} />
                    <MetadataRow icon={MapPin} label="Mint" value={coin.mint} />
                    <Separator />
                    <MetadataRow icon={Coins} label="Metal" value={coin.metal} />
                    <MetadataRow icon={Scale} label="Weight" value={coin.weightG ? `${coin.weightG}g` : undefined} />
                    <MetadataRow icon={Ruler} label="Diameter" value={coin.diameterMm ? `${coin.diameterMm}mm` : undefined} />
                    {coin.axis && (
                      <MetadataRow icon={CircleDot} label="Die Axis" value={`${coin.axis}°`} />
                    )}
                    {coin.reference && (
                      <>
                        <Separator />
                        <MetadataRow icon={ExternalLink} label="Reference" value={coin.reference} />
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="research" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Similar Matches
                </CardTitle>
                <CardDescription>
                  Coins from museum collections that may be related to yours
                </CardDescription>
              </CardHeader>
              <CardContent>
                {matchesLoading ? (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="space-y-3">
                        <Skeleton className="aspect-square rounded-lg" />
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : matches && matches.length > 0 ? (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {matches.map((match) => (
                      <MatchCard key={match.id} match={match} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mx-auto mb-4">
                      <Sparkles className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h3 className="font-medium">No matches yet</h3>
                    <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                      AI-powered similarity matching is coming soon. Upload high-quality photos to improve match accuracy.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Coin</DialogTitle>
            <DialogDescription>
              Update the details of your coin.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-title">Title *</Label>
                <Input
                  id="edit-title"
                  value={editForm.title}
                  onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., Roman Denarius of Augustus"
                  data-testid="input-edit-title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={editForm.description}
                  onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Additional notes..."
                  rows={2}
                  data-testid="input-edit-description"
                />
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-ruler">Ruler</Label>
                  <Input
                    id="edit-ruler"
                    value={editForm.ruler}
                    onChange={(e) => setEditForm(prev => ({ ...prev, ruler: e.target.value }))}
                    placeholder="e.g., Augustus"
                    data-testid="input-edit-ruler"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-denomination">Denomination</Label>
                  <Input
                    id="edit-denomination"
                    value={editForm.denomination}
                    onChange={(e) => setEditForm(prev => ({ ...prev, denomination: e.target.value }))}
                    placeholder="e.g., Denarius"
                    data-testid="input-edit-denomination"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-mint">Mint</Label>
                  <Input
                    id="edit-mint"
                    value={editForm.mint}
                    onChange={(e) => setEditForm(prev => ({ ...prev, mint: e.target.value }))}
                    placeholder="e.g., Rome"
                    data-testid="input-edit-mint"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-metal">Metal</Label>
                  <Input
                    id="edit-metal"
                    value={editForm.metal}
                    onChange={(e) => setEditForm(prev => ({ ...prev, metal: e.target.value }))}
                    placeholder="e.g., Silver"
                    data-testid="input-edit-metal"
                  />
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-weight">Weight (g)</Label>
                  <Input
                    id="edit-weight"
                    value={editForm.weightG}
                    onChange={(e) => setEditForm(prev => ({ ...prev, weightG: e.target.value }))}
                    placeholder="e.g., 3.85"
                    data-testid="input-edit-weight"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-diameter">Diameter (mm)</Label>
                  <Input
                    id="edit-diameter"
                    value={editForm.diameterMm}
                    onChange={(e) => setEditForm(prev => ({ ...prev, diameterMm: e.target.value }))}
                    placeholder="e.g., 18.5"
                    data-testid="input-edit-diameter"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-reference">Reference</Label>
                  <Input
                    id="edit-reference"
                    value={editForm.reference}
                    onChange={(e) => setEditForm(prev => ({ ...prev, reference: e.target.value }))}
                    placeholder="e.g., RIC I 1a"
                    data-testid="input-edit-reference"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editMutation.isPending} data-testid="button-save-edit">
                {editMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function MetadataRow({ 
  icon: Icon, 
  label, 
  value 
}: { 
  icon: React.ElementType; 
  label: string; 
  value?: string | null;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-sm text-muted-foreground w-24 shrink-0">{label}</span>
      <span className="text-sm font-medium truncate">
        {value || <span className="text-muted-foreground">-</span>}
      </span>
    </div>
  );
}

interface MatchWithCoinType extends SimilarMatch {
  coinType?: {
    id: string;
    label: string;
    sourceId: string;
    sourceUrl?: string | null;
    imageUrl?: string | null;
    dateFrom?: number | null;
    dateTo?: number | null;
    obvLegend?: string | null;
    revLegend?: string | null;
    referenceText?: string | null;
  };
  source?: {
    id: string;
    name: string;
    homepageUrl?: string | null;
    attributionTemplate?: string | null;
  };
  rights?: {
    licenseImages?: string | null;
    attributionText?: string | null;
    sourceUrl?: string | null;
    rightsStatementUrl?: string | null;
  };
}

function MatchCard({ match }: { match: MatchWithCoinType }) {
  const confidence = Number(match.confidence) * 100;
  const reasons = (match.reasons as string[]) || [];
  const sourceUrl = match.coinType?.sourceUrl || match.rights?.sourceUrl || match.source?.homepageUrl;
  const sourceName = match.source?.name || match.coinType?.sourceId || "Museum Collection";
  const hasImage = match.coinType?.imageUrl;
  
  return (
    <Card className="overflow-hidden hover-elevate">
      <div className="aspect-video bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center relative overflow-hidden">
        {hasImage ? (
          <img 
            src={match.coinType?.imageUrl!} 
            alt={match.coinType?.label || "Coin image"}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-chart-2/30 to-chart-2/10 border-4 border-chart-2/20" />
        )}
        <div className="absolute top-2 right-2 flex gap-1">
          <Badge variant="secondary">
            {confidence.toFixed(0)}% match
          </Badge>
        </div>
        <div className="absolute bottom-2 left-2">
          <LicenseBadge license={match.rights?.licenseImages} />
        </div>
      </div>
      <CardContent className="p-4 space-y-2">
        <h4 className="font-medium text-sm line-clamp-2">
          {match.coinType?.label || "Reference Match"}
        </h4>
        {match.coinType?.referenceText && (
          <Badge variant="outline" className="text-xs">
            {match.coinType.referenceText}
          </Badge>
        )}
        {match.coinType?.dateFrom && match.coinType?.dateTo && (
          <p className="text-xs text-muted-foreground">
            {match.coinType.dateFrom < 0 ? `${Math.abs(match.coinType.dateFrom)} BCE` : `${match.coinType.dateFrom} CE`} 
            {" - "} 
            {match.coinType.dateTo < 0 ? `${Math.abs(match.coinType.dateTo)} BCE` : `${match.coinType.dateTo} CE`}
          </p>
        )}
        {reasons.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">Match reasons:</p>
            <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
              {reasons.slice(0, 3).map((reason, i) => (
                <li key={i} className="flex items-center gap-1">
                  <span className="text-primary">•</span> {reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="pt-2 border-t space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground truncate">{sourceName}</span>
            {sourceUrl && (
              <a 
                href={sourceUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-primary flex items-center gap-1 shrink-0"
                data-testid={`link-source-${match.id}`}
              >
                View Source <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          {match.rights?.attributionText && (
            <p className="text-xs text-muted-foreground italic">
              {match.rights.attributionText}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
