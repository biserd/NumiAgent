import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { 
  Plus, 
  Eye, 
  Trash2,
  Bell,
  Search,
  Loader2
} from "lucide-react";
import type { Watchlist } from "@shared/schema";

export default function WatchlistsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKeywords, setNewKeywords] = useState("");

  const { data: watchlists, isLoading } = useQuery<Watchlist[]>({
    queryKey: ["/api/watchlists"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; rules: object }) => {
      const res = await apiRequest("POST", "/api/watchlists", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlists"] });
      toast({ title: "Watchlist created", description: "Your new watchlist is now active." });
      setIsCreateOpen(false);
      setNewName("");
      setNewKeywords("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/watchlists/${id}`, { isEnabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlists"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/watchlists/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlists"] });
      toast({ title: "Watchlist deleted" });
    },
  });

  const handleCreate = () => {
    if (!newName.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    const keywords = newKeywords.split(",").map(k => k.trim()).filter(Boolean);
    createMutation.mutate({ name: newName.trim(), rules: { keywords } });
  };

  return (
    <Layout title="Watchlists">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-muted-foreground">
              Get notified when new coins matching your criteria appear.
            </p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" data-testid="button-create-watchlist">
                <Plus className="h-4 w-4" />
                New Watchlist
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Watchlist</DialogTitle>
                <DialogDescription>
                  Set up alerts for coins you&apos;re looking for.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Roman Denarii"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    data-testid="input-watchlist-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="keywords">Keywords (comma-separated)</Label>
                  <Input
                    id="keywords"
                    placeholder="e.g., Augustus, denarius, Rome"
                    value={newKeywords}
                    onChange={(e) => setNewKeywords(e.target.value)}
                    data-testid="input-watchlist-keywords"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreate} 
                  disabled={createMutation.isPending}
                  data-testid="button-save-watchlist"
                >
                  {createMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Create"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-6 space-y-4">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-8 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : watchlists && watchlists.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {watchlists.map((watchlist) => (
              <WatchlistCard 
                key={watchlist.id} 
                watchlist={watchlist}
                onToggle={(enabled) => toggleMutation.mutate({ id: watchlist.id, isEnabled: enabled })}
                onDelete={() => deleteMutation.mutate(watchlist.id)}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                <Eye className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium">No watchlists yet</h3>
              <p className="text-muted-foreground mt-2 max-w-sm">
                Create a watchlist to get notified when coins matching your criteria are added.
              </p>
              <Button className="mt-6 gap-2" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Create Your First Watchlist
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}

function WatchlistCard({ 
  watchlist, 
  onToggle, 
  onDelete 
}: { 
  watchlist: Watchlist;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const rules = watchlist.rules as { keywords?: string[] };
  const keywords = rules?.keywords ?? [];

  return (
    <Card className={watchlist.isEnabled ? "" : "opacity-60"} data-testid={`card-watchlist-${watchlist.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{watchlist.name}</CardTitle>
          </div>
          <Switch 
            checked={watchlist.isEnabled} 
            onCheckedChange={onToggle}
            data-testid={`switch-watchlist-${watchlist.id}`}
          />
        </div>
        <CardDescription className="flex items-center gap-1">
          <Bell className="h-3 w-3" />
          {watchlist.isEnabled ? "Active" : "Paused"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {keywords.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Search className="h-3 w-3" />
              Keywords
            </p>
            <div className="flex flex-wrap gap-1">
              {keywords.map((kw, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive gap-1">
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete watchlist?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete &quot;{watchlist.name}&quot;.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
