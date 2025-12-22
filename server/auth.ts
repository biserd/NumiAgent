import bcrypt from "bcrypt";
import session from "express-session";
import connectPg from "connect-pg-simple";
import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { db } from "./db";
import { users, type User, type RegisterUser, type LoginUser, registerUserSchema, loginUserSchema } from "@shared/models/auth";
import { eq, or } from "drizzle-orm";
import { z, ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

const BCRYPT_ROUNDS = 12;

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      profileImageUrl: string | null;
      isVerified: boolean | null;
      isAdmin: boolean | null;
      lastLoginAt: Date | null;
      createdAt: Date | null;
      updatedAt: Date | null;
    }
    interface Request {
      user?: User;
    }
  }
}

export type SanitizedUser = Omit<User, "passwordHash">;

function sanitizeUser(user: User): SanitizedUser {
  const { passwordHash, ...sanitized } = user;
  return sanitized;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

async function getUserByUsernameOrEmail(usernameOrEmail: string): Promise<User | undefined> {
  const [user] = await db
    .select()
    .from(users)
    .where(or(eq(users.username, usernameOrEmail), eq(users.email, usernameOrEmail)));
  return user || undefined;
}

async function getUserById(id: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user || undefined;
}

async function checkUsernameExists(username: string): Promise<boolean> {
  const [user] = await db.select().from(users).where(eq(users.username, username));
  return !!user;
}

async function checkEmailExists(email: string): Promise<boolean> {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return !!user;
}

export async function registerUser(data: RegisterUser): Promise<SanitizedUser> {
  const validated = registerUserSchema.parse(data);
  
  if (await checkUsernameExists(validated.username)) {
    throw new Error("Username already exists");
  }
  
  if (await checkEmailExists(validated.email)) {
    throw new Error("Email already exists");
  }
  
  const passwordHash = await hashPassword(validated.password);
  
  const [user] = await db
    .insert(users)
    .values({
      username: validated.username,
      email: validated.email,
      passwordHash,
      firstName: validated.firstName || null,
      lastName: validated.lastName || null,
    })
    .returning();
  
  return sanitizeUser(user);
}

export async function loginUser(data: LoginUser): Promise<SanitizedUser> {
  const validated = loginUserSchema.parse(data);
  
  const user = await getUserByUsernameOrEmail(validated.usernameOrEmail);
  
  if (!user) {
    throw new Error("Invalid credentials");
  }
  
  const isValid = await verifyPassword(validated.password, user.passwordHash);
  
  if (!isValid) {
    throw new Error("Invalid credentials");
  }
  
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));
  
  return sanitizeUser(user);
}

export function getSessionMiddleware() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  
  return session({
    secret: process.env.SESSION_SECRET || "numis-vault-secret-key-change-in-production",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
      sameSite: "lax",
    },
  });
}

export const attachUser: RequestHandler = async (req, res, next) => {
  if (req.session.userId) {
    try {
      const user = await getUserById(req.session.userId);
      if (user) {
        req.user = sanitizeUser(user) as Express.User;
      }
    } catch (error) {
      console.error("Error attaching user:", error);
    }
  }
  next();
};

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.session.userId || !req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.session.userId || !req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

export function setupAuth(app: Express): void {
  app.set("trust proxy", 1);
  app.use(getSessionMiddleware());
  app.use(attachUser);
}

export function registerAuthRoutes(app: Express): void {
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const user = await registerUser(req.body);
      req.session.userId = user.id;
      res.status(201).json(user);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: fromZodError(error).message });
      }
      if (error instanceof Error) {
        if (error.message.includes("already exists")) {
          return res.status(409).json({ error: error.message });
        }
      }
      console.error("Registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const user = await loginUser(req.body);
      req.session.userId = user.id;
      res.json(user);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: fromZodError(error).message });
      }
      if (error instanceof Error && error.message === "Invalid credentials") {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ error: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", (req: Request, res: Response) => {
    if (!req.session.userId || !req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    res.json(req.user);
  });
}
