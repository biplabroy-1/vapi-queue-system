import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const requiredEnvVars = ["MONGODB_URI", "VAPI_API_KEY"] as const;

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    console.error(`❌ Missing environment variable: ${key}`);
    process.exit(1);
  }
}

export const env = {
  PORT: process.env.PORT || "3000",
  MONGODB_URI: process.env.MONGODB_URI as string,
  VAPI_API_KEY: process.env.VAPI_API_KEY as string,
  NODE_ENV: process.env.NODE_ENV || "development"
} as const;

let dbConnecting = false;

export const connectDB = async (): Promise<void> => {
  
  if (mongoose.connection.readyState !== 1 && !dbConnecting) {
    dbConnecting = true;
    try {
      await mongoose.connect(env.MONGODB_URI);
      console.log("✅ MongoDB connected");
    } catch (err) {
      console.error("❌ MongoDB connection error:", err);
      process.exit(1);
    } finally {
      dbConnecting = false;
    }
  }
};

mongoose.connection.on("disconnected", () => {
  console.log("⚠️ MongoDB disconnected");
});

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB connection error:", err);
});

process.on("SIGINT", async () => {
  try {
    await mongoose.connection.close();
    console.log("🔄 MongoDB connection closed through app termination");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error during MongoDB disconnect:", err);
    process.exit(1);
  }
});

export const delay = (seconds: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, seconds * 1000));

export const isWithinTimeRange = (startTime: string, endTime: string): boolean => {
  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  
  console.log("Current time:", currentTime);
  console.log("Start time:", startTime);
  console.log("End time:", endTime);
  
  return currentTime >= startTime && currentTime <= endTime;
};

export const isValidTimeFormat = (time: string): boolean => {
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
};