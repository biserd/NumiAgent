import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent } from "@/components/ui/card";
import { Coins, Shield, Lock, Eye, Database, Cookie, UserCheck } from "lucide-react";
import { Link } from "wouter";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <head>
        <title>Privacy Policy - NumisVault | Your Collection Data Protected</title>
        <meta name="description" content="Learn how NumisVault protects your coin collection data with enterprise-grade security. Your privacy and collection security are our top priorities." />
        <meta property="og:title" content="Privacy Policy - NumisVault" />
        <meta property="og:description" content="Your coin collection data is protected with enterprise-grade security measures." />
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
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h1 className="font-display text-4xl font-bold" data-testid="text-page-title">Privacy Policy</h1>
            <p className="text-muted-foreground">Last updated: December 21, 2025</p>
          </div>

          <div className="space-y-8">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <Database className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-xl font-semibold">Data Collection</h2>
                </div>
                <div className="space-y-3 text-muted-foreground">
                  <p>NumisVault collects only the information necessary to provide our coin research and portfolio management services:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Account Information:</strong> Email address, username, and encrypted password for authentication</li>
                    <li><strong>Collection Data:</strong> Photos, metadata, and notes you add about your coins</li>
                    <li><strong>Research History:</strong> Your search queries and similarity matches to improve recommendations</li>
                    <li><strong>Usage Analytics:</strong> Anonymous usage patterns to improve our platform</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <Eye className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-xl font-semibold">How We Use Your Data</h2>
                </div>
                <div className="space-y-3 text-muted-foreground">
                  <p>Your data is used exclusively to provide and improve NumisVault services:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Visual Matching:</strong> Your coin photos are processed to find similar specimens in museum collections</li>
                    <li><strong>Portfolio Management:</strong> Storing and organizing your collection data securely</li>
                    <li><strong>Personalized Alerts:</strong> Notifying you when coins matching your watchlist criteria are found</li>
                    <li><strong>Service Improvement:</strong> Analyzing usage patterns to enhance features</li>
                  </ul>
                  <p className="font-medium text-foreground">We never sell your personal data or collection information to third parties.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <Lock className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-xl font-semibold">Security Measures</h2>
                </div>
                <div className="space-y-3 text-muted-foreground">
                  <p>Protecting your coin collection data is paramount. We implement enterprise-grade security:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Encryption at Rest:</strong> All collection data is encrypted using AES-256 encryption</li>
                    <li><strong>Encryption in Transit:</strong> All communications use TLS 1.3</li>
                    <li><strong>Secure Authentication:</strong> Passwords are hashed using bcrypt with secure salt</li>
                    <li><strong>Access Controls:</strong> Strict role-based access controls for our team</li>
                    <li><strong>Regular Audits:</strong> Security practices reviewed and updated regularly</li>
                    <li><strong>Data Isolation:</strong> Your collection is isolated from other users</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <UserCheck className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-xl font-semibold">Your Rights</h2>
                </div>
                <div className="space-y-3 text-muted-foreground">
                  <p>You have full control over your data:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Access:</strong> Request a complete export of your collection data at any time</li>
                    <li><strong>Correction:</strong> Update or correct any information in your account</li>
                    <li><strong>Deletion:</strong> Request complete deletion of your account and all associated data</li>
                    <li><strong>Portability:</strong> Export your collection in standard formats (JSON, CSV)</li>
                    <li><strong>Restriction:</strong> Limit how we process your data</li>
                  </ul>
                  <p>To exercise any of these rights, contact us at privacy@numisvault.com</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <Cookie className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-xl font-semibold">Cookies</h2>
                </div>
                <div className="space-y-3 text-muted-foreground">
                  <p>We use minimal, essential cookies:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Authentication:</strong> Session cookies to keep you logged in securely</li>
                    <li><strong>Preferences:</strong> Storing your theme and display preferences</li>
                    <li><strong>Security:</strong> CSRF tokens to protect against attacks</li>
                  </ul>
                  <p>We do not use third-party tracking cookies or advertising cookies.</p>
                </div>
              </CardContent>
            </Card>

            <div className="text-center text-sm text-muted-foreground pt-8">
              <p>Questions about our privacy practices? Contact us at privacy@numisvault.com</p>
            </div>
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
              <Link href="/about" className="hover:text-foreground transition-colors" data-testid="link-about">About</Link>
              <Link href="/faq" className="hover:text-foreground transition-colors" data-testid="link-faq">FAQ</Link>
              <Link href="/contact" className="hover:text-foreground transition-colors" data-testid="link-contact">Contact</Link>
              <Link href="/terms" className="hover:text-foreground transition-colors" data-testid="link-terms">Terms of Service</Link>
              <Link href="/privacy" className="text-foreground font-medium" data-testid="link-privacy">Privacy Policy</Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
