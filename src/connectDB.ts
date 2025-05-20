import mongoose from "mongoose";

// DB Connection
let dbConnecting = false;
export const connectDB = async () => {
    if (mongoose.connection.readyState !== 1 && !dbConnecting) {
        dbConnecting = true;
        try {
            const DB_URL = process.env.MONGODB_URI || "";
            await mongoose.connect(DB_URL);
            console.log("✅ MongoDB connected");
        } catch (err) {
            console.error(err);
            process.exit(1);
        } finally {
            dbConnecting = false;
        }
    }
};