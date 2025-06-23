import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import cors from "cors";
import { connectDB, getMongoServerTime } from "./src/connectDB";
import apiRoutes from "./src/routes";
import webhookRoutes from "./src/webhooks";
import { config, validateEnv } from "./src/config";
import toHumanReadableDate from "./src/utils";
// Configure environment variables
dotenv.config();


// Initialize express
const app = express();
app.use(bodyParser.json());
app.use(cors());
const PORT = config.server.port;

// Validate required environment variables
const missingEnvVars = validateEnv();
if (missingEnvVars.length > 0) {
  for (const key of missingEnvVars) {
    console.error(`❌ Missing environment variable: ${key}`);
  }
  process.exit(1);
}

// Routes
app.use("/api", apiRoutes);

// Webhook routes - using the modular webhook controller
app.use("/webhook", webhookRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Start server
const startServer = async () => {
  try {
    // Connect to database
    await connectDB();
    // Using IIFE to handle async code
    (async () => {
      console.log("DB Time", toHumanReadableDate(await getMongoServerTime())) // IST
    })();

    // Start the server
    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
