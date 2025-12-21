import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  Upload,
  Database,
  ExternalLink,
  BookOpen,
  Sparkles
} from "lucide-react";
import { Link } from "wouter";

export default function ResearchPage() {
  return (
    <Layout title="Research">
      <div className="p-6 space-y-8">
        {/* Search Header */}
        <div className="max-w-2xl mx-auto text-center space-y-4">
          <h2 className="font-display text-2xl font-bold">
            Explore Museum Collections
          </h2>
          <p className="text-muted-foreground">
            Search across 50,000+ reference images from world-class institutions.
          </p>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search by ruler, denomination, mint..."
              className="pl-12 h-12 text-base"
              data-testid="input-search-research"
            />
          </div>
        </div>

        {/* Quick Actions */}
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

          <Card className="hover-elevate">
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-chart-3/10 text-chart-3">
                  <Database className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="font-semibold">Browse Types</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Explore catalogued coin types
                  </p>
                  <Badge variant="secondary" className="mt-2">Coming Soon</Badge>
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

        {/* Sources */}
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

        {/* AI Feature Teaser */}
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
