import { migrate } from "../src/db/migrate.js";
import { env } from "../src/config/env.js";

migrate();
console.log(`SQLite database is ready at ${env.databasePath}`);
