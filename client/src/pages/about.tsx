import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent } from "@/components/ui/card";
import { Coins, Target, Shield, Heart, Users, Lock, Eye } from "lucide-react";
import { Link } from "wouter";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <head>
        <title>About NumisVault - Privacy-First Coin Research Platform</title>
        <meta name="description" content="NumisVault is dedicated to preserving numismatic history through secure, privacy-first coin research and collection management. Learn about our mission and values." />
        <meta property="og:title" content="About NumisVault" />
        <meta property="og:description" content="Preserving numismatic history with privacy-first technology and collector trust." />
      </head>

      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3" data-testid="link-home">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                <Coins className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-display text-xl font-semibold tracking-tight">NumisVault</span>
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="pt-24 pb-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <h1 className="font-display text-4xl font-bold" data-testid="text-page-title">About NumisVault</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Preserving numismatic history through technology, security, and trust.
            </p>
          </div>

          <div className="space-y-12">
            <section className="space-y-6">
              <div className="flex items-center gap-3">
                <Target className="h-6 w-6 text-primary" />
                <h2 className="font-display text-2xl font-semibold">Our Mission</h2>
              </div>
              <Card>
                <CardContent className="p-6 space-y-4">
                  <p className="text-lg leading-relaxed">
                    NumisVault was founded with a singular purpose: to democratize access to numismatic research while fiercely protecting collector privacy.
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    Ancient coins are windows into history - each one tells stories of empires, rulers, and civilizations long past. We believe every collector, researcher, and enthusiast should have access to world-class research tools to understand and preserve these remarkable artifacts.
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    By partnering with leading museums and cultural institutions, we've built the world's most comprehensive visual matching system for ancient coins - connecting your collection to over 50,000 documented specimens from institutions like the Smithsonian, Münzkabinett Berlin, and The Metropolitan Museum of Art.
                  </p>
                </CardContent>
              </Card>
            </section>

            <section className="space-y-6">
              <div className="flex items-center gap-3">
                <Shield className="h-6 w-6 text-primary" />
                <h2 className="font-display text-2xl font-semibold">Privacy-First Approach</h2>
              </div>
              <Card>
                <CardContent className="p-6 space-y-4">
                  <p className="text-muted-foreground leading-relaxed">
                    We understand that your coin collection is both valuable and deeply personal. That's why privacy isn't just a feature at NumisVault - it's our foundation.
                  </p>
                  <div className="grid gap-6 md:grid-cols-2 pt-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-primary" />
                        <h3 className="font-semibold">Your Data, Your Control</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Your collection data is encrypted and completely private. You decide what to share, if anything.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Eye className="h-4 w-4 text-primary" />
                        <h3 className="font-semibold">No Third-Party Tracking</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        We don't sell your data or use third-party trackers. Your research is nobody's business but yours.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            <section className="space-y-6">
              <div className="flex items-center gap-3">
                <Heart className="h-6 w-6 text-primary" />
                <h2 className="font-display text-2xl font-semibold">Our Values</h2>
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                <Card>
                  <CardContent className="p-6 text-center space-y-3">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 mx-auto">
                      <Shield className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold">Security First</h3>
                    <p className="text-sm text-muted-foreground">
                      Enterprise-grade encryption protects your collection data at rest and in transit.
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 text-center space-y-3">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 mx-auto">
                      <Users className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold">Collector Trust</h3>
                    <p className="text-sm text-muted-foreground">
                      We earn your trust through transparency, reliability, and unwavering respect for your privacy.
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 text-center space-y-3">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 mx-auto">
                      <Coins className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold">Heritage Preservation</h3>
                    <p className="text-sm text-muted-foreground">
                      Every documented coin helps preserve numismatic history for future generations.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </section>

            <section className="space-y-6">
              <h2 className="font-display text-2xl font-semibold text-center">Museum Partners</h2>
              <Card>
                <CardContent className="p-6">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
                    {[
                      "Münzkabinett Berlin",
                      "Smithsonian Institution",
                      "The Metropolitan Museum of Art",
                      "Art Institute of Chicago",
                      "National Gallery of Art",
                      "Walters Art Museum"
                    ].map((museum) => (
                      <div key={museum} className="text-center">
                        <p className="text-sm font-medium text-muted-foreground">{museum}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <p className="text-center text-sm text-muted-foreground">
                All partner institutions provide open-access data under appropriate licensing. We respect and attribute all sources.
              </p>
            </section>
          </div>
        </div>
      </main>

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
              <Link href="/about" className="text-foreground font-medium" data-testid="link-about">About</Link>
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
