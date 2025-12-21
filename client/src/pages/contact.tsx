import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Coins, Mail, Shield, Send, CheckCircle } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function ContactPage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    await new Promise(resolve => setTimeout(resolve, 1000));

    setIsSubmitting(false);
    setIsSubmitted(true);
    toast({
      title: "Message sent",
      description: "We'll get back to you as soon as possible.",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <head>
        <title>Contact Us - NumisVault | Get in Touch</title>
        <meta name="description" content="Contact the NumisVault team for support, feedback, or inquiries. We're here to help with your coin research and collection management needs." />
        <meta property="og:title" content="Contact Us - NumisVault" />
        <meta property="og:description" content="Get in touch with the NumisVault team for support and inquiries." />
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
        <div className="mx-auto max-w-xl px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
              <Mail className="h-8 w-8 text-primary" />
            </div>
            <h1 className="font-display text-4xl font-bold" data-testid="text-page-title">Contact Us</h1>
            <p className="text-muted-foreground">
              Have a question or feedback? We'd love to hear from you.
            </p>
          </div>

          {isSubmitted ? (
            <Card>
              <CardContent className="p-8 text-center space-y-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-chart-3/10 mx-auto">
                  <CheckCircle className="h-8 w-8 text-chart-3" />
                </div>
                <h2 className="font-display text-xl font-semibold">Message Sent</h2>
                <p className="text-muted-foreground">
                  Thank you for reaching out. We typically respond within 1-2 business days.
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsSubmitted(false);
                    setFormData({ name: "", email: "", subject: "", message: "" });
                  }}
                  data-testid="button-send-another"
                >
                  Send Another Message
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Send us a message</CardTitle>
                <CardDescription>
                  Fill out the form below and we'll get back to you as soon as possible.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      placeholder="Your name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      data-testid="input-name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      data-testid="input-email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject</Label>
                    <Select
                      value={formData.subject}
                      onValueChange={(value) => setFormData({ ...formData, subject: value })}
                      required
                    >
                      <SelectTrigger id="subject" data-testid="select-subject">
                        <SelectValue placeholder="Select a topic" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general" data-testid="select-item-general">General Inquiry</SelectItem>
                        <SelectItem value="support" data-testid="select-item-support">Technical Support</SelectItem>
                        <SelectItem value="privacy" data-testid="select-item-privacy">Privacy Concerns</SelectItem>
                        <SelectItem value="feedback" data-testid="select-item-feedback">Feedback & Suggestions</SelectItem>
                        <SelectItem value="partnership" data-testid="select-item-partnership">Partnership Inquiry</SelectItem>
                        <SelectItem value="other" data-testid="select-item-other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">Message</Label>
                    <Textarea
                      id="message"
                      placeholder="How can we help you?"
                      rows={5}
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      required
                      data-testid="textarea-message"
                    />
                  </div>

                  <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 border border-border">
                    <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Secure Communication</p>
                      <p className="text-xs text-muted-foreground">
                        Your message is transmitted securely. We never share your contact information with third parties. For privacy-related inquiries, you can also email us directly at privacy@numisvault.com.
                      </p>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full gap-2"
                    disabled={isSubmitting}
                    data-testid="button-submit"
                  >
                    {isSubmitting ? (
                      "Sending..."
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Send Message
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          <div className="mt-8 text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              For urgent security concerns, please email security@numisvault.com
            </p>
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
              <Link href="/contact" className="text-foreground font-medium" data-testid="link-contact">Contact</Link>
              <Link href="/terms" className="hover:text-foreground transition-colors" data-testid="link-terms">Terms of Service</Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors" data-testid="link-privacy">Privacy Policy</Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
