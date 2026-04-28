import path from "node:path";
import process from "node:process";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_PATH: z.string().default("./data/dmax.dev.sqlite"),
  TZ: z.string().default("Europe/Berlin")
});

const parsedEnv = envSchema.parse(process.env);

export const env = {
  nodeEnv: parsedEnv.NODE_ENV,
  databasePath: path.resolve(parsedEnv.DATABASE_PATH),
  timezone: parsedEnv.TZ
};
