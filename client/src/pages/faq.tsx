import { ThemeToggle } from "@/components/theme-toggle";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import { Coins, HelpCircle } from "lucide-react";
import { Link } from "wouter";

export default function FAQPage() {
  const faqs = [
    {
      category: "Photo Upload & Matching",
      questions: [
        {
          id: "upload-format",
          question: "What photo formats and quality are recommended?",
          answer: "We accept JPEG, PNG, and WebP formats. For best results, use photos with at least 1000x1000 pixels, taken in good lighting with minimal shadows. Photograph both obverse (front) and reverse (back) of the coin against a neutral background."
        },
        {
          id: "matching-accuracy",
          question: "How accurate is the visual matching?",
          answer: "Our AI-powered matching system achieves high accuracy for well-photographed coins. Match confidence scores above 85% typically indicate strong matches. However, matching is a research aid - always verify identifications through additional sources and expert consultation for valuable coins."
        },
        {
          id: "processing-time",
          question: "How long does image processing take?",
          answer: "Most uploads are processed within 30 seconds to 2 minutes, depending on image size and server load. Complex matches against our full database of 50,000+ reference images may take slightly longer."
        },
        {
          id: "photo-storage",
          question: "Where are my photos stored?",
          answer: "Your photos are stored securely in our encrypted cloud storage. Only you can access your uploaded images unless you explicitly choose to share them. You can delete your photos at any time from your portfolio settings."
        }
      ]
    },
    {
      category: "Privacy & Security",
      questions: [
        {
          id: "data-privacy",
          question: "Who can see my coin collection?",
          answer: "Your collection is completely private by default. No one - not other users, not museums, not our team - can see your collection unless you explicitly share it. We designed NumisVault with privacy as the foundation."
        },
        {
          id: "data-encryption",
          question: "How is my data protected?",
          answer: "All data is encrypted using AES-256 encryption at rest and TLS 1.3 in transit. Passwords are hashed with bcrypt. We implement strict access controls and regular security audits to ensure your collection remains secure."
        },
        {
          id: "data-selling",
          question: "Do you sell my data to third parties?",
          answer: "Absolutely not. We never sell, rent, or share your personal data or collection information with third parties. Our business model is based on providing excellent service, not monetizing your data."
        },
        {
          id: "account-deletion",
          question: "Can I delete my account and all data?",
          answer: "Yes. You can request complete deletion of your account and all associated data at any time through Settings or by contacting support. We process deletion requests within 30 days and provide confirmation once complete."
        }
      ]
    },
    {
      category: "Data Ownership & Rights",
      questions: [
        {
          id: "photo-ownership",
          question: "Who owns the photos I upload?",
          answer: "You retain full ownership and copyright of all photos you upload. By using NumisVault, you grant us a limited license to process and display your images solely for providing our service to you. This license terminates when you delete your content or account."
        },
        {
          id: "museum-images",
          question: "Can I use the museum reference images?",
          answer: "Museum reference images are provided under various open-access licenses (CC0, CC-BY, etc.). You can use them according to their specific license terms, which are displayed with each image. Proper attribution is required for most sources."
        },
        {
          id: "data-export",
          question: "Can I export my collection data?",
          answer: "Yes. You can export your complete collection data in standard formats (JSON, CSV) at any time. This includes all metadata, notes, and image references. Your data is yours, and you should always have access to it."
        }
      ]
    },
    {
      category: "Platform & Features",
      questions: [
        {
          id: "sources",
          question: "What museum sources do you include?",
          answer: "We partner with world-leading institutions including Münzkabinett Berlin, Smithsonian Institution, The Metropolitan Museum of Art, Art Institute of Chicago, National Gallery of Art, and Walters Art Museum. Our database includes over 50,000 reference images."
        },
        {
          id: "watchlist",
          question: "How do watchlist alerts work?",
          answer: "You can create watchlists based on specific criteria (ruler, mint, denomination, date range). When we add new reference images or when other users share public matches that fit your criteria, you'll receive notifications via email and/or in-app alerts."
        },
        {
          id: "mobile",
          question: "Is there a mobile app?",
          answer: "NumisVault is designed as a responsive web application that works great on mobile devices. You can add it to your home screen for app-like access. A dedicated mobile app is on our roadmap for future development."
        },
        {
          id: "pricing",
          question: "Is NumisVault free to use?",
          answer: "We offer a free tier with essential features including photo uploads, visual matching, and basic portfolio management. Premium features like advanced analytics, unlimited storage, and priority support are available through paid plans."
        }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <head>
        <title>FAQ - NumisVault | Frequently Asked Questions</title>
        <meta name="description" content="Find answers to common questions about NumisVault's photo upload, visual matching, privacy, security, and data ownership policies." />
        <meta property="og:title" content="FAQ - NumisVault" />
        <meta property="og:description" content="Frequently asked questions about the NumisVault coin research platform." />
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
              <HelpCircle className="h-8 w-8 text-primary" />
            </div>
            <h1 className="font-display text-4xl font-bold" data-testid="text-page-title">Frequently Asked Questions</h1>
            <p className="text-muted-foreground">
              Find answers to common questions about NumisVault
            </p>
          </div>

          <div className="space-y-8">
            {faqs.map((section) => (
              <Card key={section.category}>
                <CardContent className="p-6">
                  <h2 className="font-display text-xl font-semibold mb-4" data-testid={`text-category-${section.category.toLowerCase().replace(/\s+/g, '-')}`}>
                    {section.category}
                  </h2>
                  <Accordion type="single" collapsible className="w-full">
                    {section.questions.map((faq) => (
                      <AccordionItem key={faq.id} value={faq.id} data-testid={`accordion-item-${faq.id}`}>
                        <AccordionTrigger className="text-left" data-testid={`accordion-trigger-${faq.id}`}>
                          {faq.question}
                        </AccordionTrigger>
                        <AccordionContent data-testid={`accordion-content-${faq.id}`}>
                          <p className="text-muted-foreground">{faq.answer}</p>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center text-sm text-muted-foreground pt-12">
            <p>Still have questions? <Link href="/contact" className="text-primary hover:underline" data-testid="link-contact-inline">Contact our support team</Link></p>
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
              <Link href="/faq" className="text-foreground font-medium" data-testid="link-faq">FAQ</Link>
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
