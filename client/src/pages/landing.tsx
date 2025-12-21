import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { 
  Upload, 
  Search, 
  FolderOpen, 
  Bell, 
  Shield,
  ArrowRight,
  ChevronRight,
  Coins,
  BookOpen,
  Eye
} from "lucide-react";

import { Link } from "wouter";

export default function LandingPage() {

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                <Coins className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-display text-xl font-semibold tracking-tight">NumisVault</span>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Link href="/login">
                <Button data-testid="button-login">
                  Sign In
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
        
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm text-primary">
                  <Shield className="h-3.5 w-3.5" />
                  <span>Privacy-First Research Platform</span>
                </div>
                <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                  Discover, Research,{" "}
                  <span className="text-primary">Preserve</span>{" "}
                  Ancient Coins
                </h1>
                <p className="text-lg text-muted-foreground max-w-xl">
                  Your collection deserves protection. Upload photos securely to find matches from museum collections worldwide. Build your portfolio with confidence knowing your data stays private.
                </p>
              </div>
              
              <div className="flex flex-wrap gap-4">
                <Link href="/register">
                  <Button size="lg" className="gap-2" data-testid="button-get-started">
                    Get Started Free
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Button size="lg" variant="outline" className="gap-2" data-testid="button-learn-more">
                  <BookOpen className="h-4 w-4" />
                  Learn More
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-4 border-t border-border">
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">AES-256</p>
                  <p className="text-sm text-muted-foreground">Encryption</p>
                </div>
                <div className="h-8 w-px bg-border" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">Zero</p>
                  <p className="text-sm text-muted-foreground">Third-Party Tracking</p>
                </div>
                <div className="h-8 w-px bg-border" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">50K+</p>
                  <p className="text-sm text-muted-foreground">Reference Images</p>
                </div>
              </div>
            </div>

            {/* Hero Visual */}
            <div className="relative">
              <div className="relative aspect-square max-w-lg mx-auto">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent" />
                <div className="absolute inset-4 rounded-2xl bg-card border border-card-border overflow-hidden">
                  <div className="h-full flex flex-col">
                    <div className="p-4 border-b border-border flex items-center gap-3">
                      <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-destructive/60" />
                        <div className="w-3 h-3 rounded-full bg-chart-4/60" />
                        <div className="w-3 h-3 rounded-full bg-chart-3/60" />
                      </div>
                      <div className="flex-1 h-6 rounded bg-muted" />
                    </div>
                    <div className="flex-1 p-4 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="aspect-square rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-chart-2/40 to-chart-2/20 border-4 border-chart-2/30" />
                        </div>
                        <div className="aspect-square rounded-xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
                          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-muted-foreground/20 to-muted-foreground/10 border-4 border-muted-foreground/10" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="h-4 bg-muted rounded w-3/4" />
                        <div className="h-3 bg-muted rounded w-1/2" />
                      </div>
                      <div className="flex gap-2">
                        <div className="px-3 py-1.5 bg-primary/10 rounded-full text-xs text-primary">98% match</div>
                        <div className="px-3 py-1.5 bg-muted rounded-full text-xs text-muted-foreground">Denarius</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">
              Everything You Need to Research Ancient Coins
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From photo upload to provenance tracking, we provide the tools serious collectors need.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={Upload}
              title="Photo Upload & Analysis"
              description="Upload obverse and reverse photos. Our AI analyzes your coin and finds similar specimens from museum collections."
            />
            <FeatureCard
              icon={Search}
              title="Visual Similarity Search"
              description="Search across 50,000+ reference images from world-class institutions like the Smithsonian and Berlin Münzkabinett."
            />
            <FeatureCard
              icon={FolderOpen}
              title="Portfolio Management"
              description="Organize your collection with detailed metadata, weights, dimensions, and provenance information."
            />
            <FeatureCard
              icon={Bell}
              title="Watchlists & Alerts"
              description="Set up alerts for specific rulers, mints, or denominations. Get notified when matching coins appear."
            />
            <FeatureCard
              icon={Eye}
              title="Research Citations"
              description="Every match includes proper attribution and links back to the original source. Academic-grade references."
            />
            <FeatureCard
              icon={Shield}
              title="Your Collection, Protected"
              description="AES-256 encryption, no third-party tracking, and full data ownership. Your coins and research stay private."
            />
          </div>
        </div>
      </section>

      {/* Sources Section */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-12">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">
              Trusted Museum Sources
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Our haystack draws from the world&apos;s leading numismatic collections with proper licensing.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
            {[
              "Münzkabinett Berlin",
              "Smithsonian",
              "The Met",
              "Art Institute Chicago",
              "National Gallery",
              "Walters Art Museum"
            ].map((source) => (
              <div 
                key={source} 
                className="flex items-center justify-center p-6 rounded-xl bg-card border border-card-border"
              >
                <span className="text-sm font-medium text-muted-foreground text-center">{source}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-primary/5">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <div className="space-y-6">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">
              Start Building Your Collection Today
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              Join collectors and researchers who trust NumisVault for their ancient coin research.
            </p>
            <Link href="/register">
              <Button size="lg" className="gap-2" data-testid="button-cta-signup">
                Create Free Account
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Coins className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-display text-lg font-semibold">NumisVault</span>
            </div>
            <nav className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
              <Link href="/about" className="hover:text-foreground transition-colors" data-testid="link-about">About</Link>
              <Link href="/faq" className="hover:text-foreground transition-colors" data-testid="link-faq">FAQ</Link>
              <Link href="/contact" className="hover:text-foreground transition-colors" data-testid="link-contact">Contact</Link>
              <Link href="/terms" className="hover:text-foreground transition-colors" data-testid="link-terms">Terms of Service</Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors" data-testid="link-privacy">Privacy Policy</Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ 
  icon: Icon, 
  title, 
  description 
}: { 
  icon: React.ElementType; 
  title: string; 
  description: string;
}) {
  return (
    <Card className="group hover-elevate transition-all duration-200">
      <CardContent className="p-6 space-y-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
          <Icon className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">{title}</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
