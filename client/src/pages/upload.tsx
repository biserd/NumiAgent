import { useState, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useUpload } from "@/hooks/use-upload";
import { 
  Upload, 
  X, 
  ImagePlus,
  Loader2,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Search
} from "lucide-react";

export default function UploadPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { uploadFile, isUploading: isUploadingImage } = useUpload();
  
  const [obvImage, setObvImage] = useState<{ file: File; preview: string; objectPath?: string } | null>(null);
  const [revImage, setRevImage] = useState<{ file: File; preview: string; objectPath?: string } | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ruler, setRuler] = useState("");
  const [denomination, setDenomination] = useState("");
  const [mint, setMint] = useState("");
  const [metal, setMetal] = useState("");
  const [weight, setWeight] = useState("");
  const [diameter, setDiameter] = useState("");
  const [reference, setReference] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Upload image to object storage and save metadata
  const uploadImageToStorage = async (file: File, kind: string): Promise<string | null> => {
    try {
      const uploadResult = await uploadFile(file);
      if (!uploadResult) return null;

      // Save image metadata to database
      const res = await apiRequest("POST", "/api/images", {
        kind,
        storageUrl: uploadResult.uploadURL,
        mimeType: file.type,
      });
      const imageAsset = await res.json();
      return imageAsset.id;
    } catch (error) {
      console.error("Failed to upload image:", error);
      return null;
    }
  };

  const createCoinMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      ruler?: string;
      denomination?: string;
      mint?: string;
      metal?: string;
      weightG?: string;
      diameterMm?: string;
      reference?: string;
      obvImageId?: string;
      revImageId?: string;
    }) => {
      const res = await apiRequest("POST", "/api/coins", data);
      return res.json();
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/coins"] });
      
      // Trigger analysis to find matches
      setIsAnalyzing(true);
      try {
        await apiRequest("POST", `/api/coins/${data.id}/analyze`);
        toast({
          title: "Coin added and analyzed!",
          description: "Your coin has been added and matched against museum collections.",
        });
      } catch {
        toast({
          title: "Coin added!",
          description: "Your coin has been added to your portfolio.",
        });
      } finally {
        setIsAnalyzing(false);
      }
      
      navigate(`/coin/${data.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add coin",
        variant: "destructive",
      });
    },
  });

  const handleImageSelect = useCallback((
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (img: { file: File; preview: string } | null) => void
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setter({ file, preview: event.target?.result as string });
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleDrop = useCallback((
    e: React.DragEvent,
    setter: (img: { file: File; preview: string } | null) => void
  ) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setter({ file, preview: event.target?.result as string });
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      toast({
        title: "Title required",
        description: "Please enter a title for your coin.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Upload images if present
      let obvImageId: string | undefined;
      let revImageId: string | undefined;

      if (obvImage?.file) {
        obvImageId = (await uploadImageToStorage(obvImage.file, "obverse")) || undefined;
      }
      if (revImage?.file) {
        revImageId = (await uploadImageToStorage(revImage.file, "reverse")) || undefined;
      }

      createCoinMutation.mutate({
        title: title.trim(),
        description: description.trim() || undefined,
        ruler: ruler.trim() || undefined,
        denomination: denomination.trim() || undefined,
        mint: mint.trim() || undefined,
        metal: metal.trim() || undefined,
        weightG: weight.trim() || undefined,
        diameterMm: diameter.trim() || undefined,
        reference: reference.trim() || undefined,
        obvImageId,
        revImageId,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to upload images",
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setObvImage(null);
    setRevImage(null);
    setTitle("");
    setDescription("");
    setRuler("");
    setDenomination("");
    setMint("");
    setMetal("");
    setWeight("");
    setDiameter("");
    setReference("");
  };

  return (
    <Layout title="Upload Coin">
      <div className="p-6 max-w-5xl mx-auto">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Image Upload Section */}
          <Card>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <ImagePlus className="h-5 w-5" />
                Coin Photos
              </CardTitle>
              <CardDescription>
                Upload clear photos of both sides of your coin. High-quality images help with matching.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <ImageDropzone
                  label="Obverse (Front)"
                  image={obvImage}
                  onImageSelect={(e) => handleImageSelect(e, setObvImage)}
                  onDrop={(e) => handleDrop(e, setObvImage)}
                  onClear={() => setObvImage(null)}
                  testId="dropzone-obverse"
                />
                <ImageDropzone
                  label="Reverse (Back)"
                  image={revImage}
                  onImageSelect={(e) => handleImageSelect(e, setRevImage)}
                  onDrop={(e) => handleDrop(e, setRevImage)}
                  onClear={() => setRevImage(null)}
                  testId="dropzone-reverse"
                />
              </div>
            </CardContent>
          </Card>

          {/* Basic Info Section */}
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Coin Details</CardTitle>
              <CardDescription>
                Add information about your coin. More details help with research.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Roman Denarius of Augustus"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  data-testid="input-title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Additional notes about this coin..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  data-testid="input-description"
                />
              </div>

              <Separator />

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ruler">Ruler / Authority</Label>
                  <Input
                    id="ruler"
                    placeholder="e.g., Augustus"
                    value={ruler}
                    onChange={(e) => setRuler(e.target.value)}
                    data-testid="input-ruler"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="denomination">Denomination</Label>
                  <Input
                    id="denomination"
                    placeholder="e.g., Denarius"
                    value={denomination}
                    onChange={(e) => setDenomination(e.target.value)}
                    data-testid="input-denomination"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mint">Mint</Label>
                  <Input
                    id="mint"
                    placeholder="e.g., Rome"
                    value={mint}
                    onChange={(e) => setMint(e.target.value)}
                    data-testid="input-mint"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="metal">Metal</Label>
                  <Input
                    id="metal"
                    placeholder="e.g., Silver"
                    value={metal}
                    onChange={(e) => setMetal(e.target.value)}
                    data-testid="input-metal"
                  />
                </div>
              </div>

              <Separator />

              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="weight">Weight (g)</Label>
                  <Input
                    id="weight"
                    type="number"
                    step="0.001"
                    placeholder="e.g., 3.85"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    data-testid="input-weight"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="diameter">Diameter (mm)</Label>
                  <Input
                    id="diameter"
                    type="number"
                    step="0.1"
                    placeholder="e.g., 18.5"
                    value={diameter}
                    onChange={(e) => setDiameter(e.target.value)}
                    data-testid="input-diameter"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reference">Reference</Label>
                  <Input
                    id="reference"
                    placeholder="e.g., RIC I 1a"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    data-testid="input-reference"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-between gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              className="gap-2"
              data-testid="button-reset"
            >
              <RotateCcw className="h-4 w-4" />
              Reset Form
            </Button>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="gap-1.5">
                <Sparkles className="h-3 w-3" />
                Auto-matching enabled
              </Badge>
              <Button 
                type="submit" 
                className="gap-2"
                disabled={isSubmitting || createCoinMutation.isPending || isAnalyzing}
                data-testid="button-submit"
              >
                {isSubmitting || isUploadingImage ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : createCoinMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : isAnalyzing ? (
                  <>
                    <Search className="h-4 w-4 animate-pulse" />
                    Finding matches...
                  </>
                ) : (
                  <>
                    Save & Analyze
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </Layout>
  );
}

function ImageDropzone({
  label,
  image,
  onImageSelect,
  onDrop,
  onClear,
  testId,
}: {
  label: string;
  image: { file: File; preview: string } | null;
  onImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent) => void;
  onClear: () => void;
  testId: string;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div
        className={`
          relative aspect-square rounded-xl border-2 border-dashed transition-all
          ${isDragOver ? "border-primary bg-primary/5" : "border-border"}
          ${image ? "border-solid bg-muted/30" : ""}
        `}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => { setIsDragOver(false); onDrop(e); }}
        data-testid={testId}
      >
        {image ? (
          <div className="relative h-full w-full">
            <img
              src={image.preview}
              alt={label}
              className="h-full w-full object-contain rounded-lg p-2"
            />
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute top-2 right-2"
              onClick={onClear}
              data-testid={`${testId}-clear`}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Upload className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-sm">Drop image here</p>
              <p className="text-xs text-muted-foreground mt-1">
                or click to browse
              </p>
            </div>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={onImageSelect}
              data-testid={`${testId}-input`}
            />
          </label>
        )}
      </div>
    </div>
  );
}
