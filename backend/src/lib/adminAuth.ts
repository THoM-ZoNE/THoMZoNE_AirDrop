import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.header("x-api-key");

  if (apiKey !== config.adminApiKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}