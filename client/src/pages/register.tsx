import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/use-auth";
import { Coins, Eye, EyeOff, Shield, UserPlus, Check } from "lucide-react";
import { Link } from "wouter";

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const { register, isRegistering, registerError } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    firstName: "",
    lastName: "",
  });
  const [error, setError] = useState<string | null>(null);

  const passwordRequirements = [
    { met: formData.password.length >= 8, text: "At least 8 characters" },
    { met: /[A-Z]/.test(formData.password), text: "One uppercase letter" },
    { met: /[a-z]/.test(formData.password), text: "One lowercase letter" },
    { met: /\d/.test(formData.password), text: "One number" },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    try {
      await register(formData);
      setLocation("/dashboard");
    } catch (err: any) {
      setError(err.message || "Registration failed");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                <Coins className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-display text-xl font-semibold tracking-tight">NumisVault</span>
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center pt-16 px-4 py-12">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
              <UserPlus className="h-8 w-8 text-primary" />
            </div>
            <h1 className="font-display text-3xl font-bold">Create Account</h1>
            <p className="text-muted-foreground">
              Join thousands of collectors researching ancient coins
            </p>
          </div>

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl">Sign Up</CardTitle>
              <CardDescription>
                Create your secure NumisVault account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      type="text"
                      placeholder="John"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      data-testid="input-firstname"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      type="text"
                      placeholder="Doe"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      data-testid="input-lastname"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="numiscollector"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required
                    data-testid="input-username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Create a strong password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                      data-testid="input-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {passwordRequirements.map((req, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs">
                        <Check className={`h-3 w-3 ${req.met ? "text-chart-3" : "text-muted-foreground"}`} />
                        <span className={req.met ? "text-chart-3" : "text-muted-foreground"}>{req.text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {(error || registerError) && (
                  <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                    {error || registerError}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isRegistering}
                  data-testid="button-submit"
                >
                  {isRegistering ? "Creating account..." : "Create Account"}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  By creating an account, you agree to our{" "}
                  <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link>
                  {" "}and{" "}
                  <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
                </p>
              </form>

              <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <Link href="/login" className="text-primary hover:underline" data-testid="link-login">
                    Sign in
                  </Link>
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>Your data is encrypted and secure</span>
          </div>
        </div>
      </main>
    </div>
  );
}
