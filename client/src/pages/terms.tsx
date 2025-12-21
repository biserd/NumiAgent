import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent } from "@/components/ui/card";
import { Coins, FileText, User, Scale, Copyright, AlertTriangle, Landmark } from "lucide-react";
import { Link } from "wouter";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <head>
        <title>Terms of Service - NumisVault | Usage Guidelines</title>
        <meta name="description" content="Read NumisVault's terms of service covering user accounts, acceptable use, intellectual property rights, and museum data attribution requirements." />
        <meta property="og:title" content="Terms of Service - NumisVault" />
        <meta property="og:description" content="Usage guidelines and terms for the NumisVault coin research platform." />
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
              <FileText className="h-8 w-8 text-primary" />
            </div>
            <h1 className="font-display text-4xl font-bold" data-testid="text-page-title">Terms of Service</h1>
            <p className="text-muted-foreground">Last updated: December 21, 2025</p>
          </div>

          <div className="space-y-8">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-xl font-semibold">User Accounts</h2>
                </div>
                <div className="space-y-3 text-muted-foreground">
                  <p>By creating an account on NumisVault, you agree to:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Provide accurate and complete registration information</li>
                    <li>Maintain the security of your account credentials</li>
                    <li>Notify us immediately of any unauthorized account access</li>
                    <li>Be at least 18 years of age or have parental consent</li>
                    <li>Use only one account per person</li>
                  </ul>
                  <p>You are responsible for all activities that occur under your account.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <Scale className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-xl font-semibold">Acceptable Use</h2>
                </div>
                <div className="space-y-3 text-muted-foreground">
                  <p>You agree to use NumisVault only for lawful purposes. You may not:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Upload content that infringes on intellectual property rights</li>
                    <li>Use the service to facilitate illegal transactions or trade in stolen artifacts</li>
                    <li>Attempt to reverse engineer our visual matching algorithms</li>
                    <li>Scrape or bulk download museum reference images</li>
                    <li>Share your account credentials with others</li>
                    <li>Upload malicious content or attempt to compromise system security</li>
                    <li>Use automated systems to access the service without permission</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <Copyright className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-xl font-semibold">Intellectual Property</h2>
                </div>
                <div className="space-y-3 text-muted-foreground">
                  <p><strong>Your Content:</strong> You retain all rights to the coin photos and data you upload. By uploading content, you grant NumisVault a non-exclusive license to process and display your content as part of the service.</p>
                  <p><strong>Our Platform:</strong> The NumisVault platform, including our matching algorithms, user interface, and documentation, is protected by copyright and other intellectual property laws.</p>
                  <p><strong>Trademarks:</strong> NumisVault and associated logos are trademarks. You may not use them without written permission.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <Landmark className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-xl font-semibold">Museum Data & Attribution</h2>
                </div>
                <div className="space-y-3 text-muted-foreground">
                  <p>NumisVault provides access to reference images from museum collections. When using this data:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Attribution Required:</strong> All museum reference images must be attributed to their source institution when shared or published</li>
                    <li><strong>License Compliance:</strong> Each source has specific license terms (CC0, CC-BY, CC-BY-NC, etc.) that must be respected</li>
                    <li><strong>Non-Commercial Use:</strong> Some sources restrict commercial use - check individual license terms</li>
                    <li><strong>No Misrepresentation:</strong> You may not claim museum coins as your own or misrepresent provenance</li>
                  </ul>
                  <p>Our partner institutions include: Münzkabinett Berlin, Smithsonian Institution, The Metropolitan Museum of Art, Art Institute of Chicago, National Gallery of Art, and Walters Art Museum.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-xl font-semibold">Limitation of Liability</h2>
                </div>
                <div className="space-y-3 text-muted-foreground">
                  <p>NumisVault is provided "as is" without warranties of any kind. We do not guarantee:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>The accuracy of visual matching results or coin identifications</li>
                    <li>The completeness or accuracy of museum reference data</li>
                    <li>Uninterrupted or error-free service availability</li>
                    <li>That the service will meet your specific requirements</li>
                  </ul>
                  <p>To the maximum extent permitted by law, NumisVault shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or goodwill.</p>
                  <p><strong>Professional Advice:</strong> NumisVault is a research tool. For authentication, valuation, or provenance verification, consult qualified numismatic professionals.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="font-display text-xl font-semibold">Changes to Terms</h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>We may update these terms from time to time. Significant changes will be communicated via email or in-app notification at least 30 days before taking effect.</p>
                  <p>Continued use of NumisVault after changes take effect constitutes acceptance of the new terms.</p>
                </div>
              </CardContent>
            </Card>

            <div className="text-center text-sm text-muted-foreground pt-8">
              <p>Questions about our terms? Contact us at legal@numisvault.com</p>
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
              <Link href="/terms" className="text-foreground font-medium" data-testid="link-terms">Terms of Service</Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors" data-testid="link-privacy">Privacy Policy</Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
