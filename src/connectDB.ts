import mongoose from "mongoose";

// DB Connection
let dbConnecting = false;
export const connectDB = async () => {
    if (mongoose.connection.readyState !== 1 && !dbConnecting) {
        dbConnecting = true;
        try {
            const DB_URL = process.env.MONGODB_URI || "";
            await mongoose.connect(DB_URL);
            console.log("✅ MongoDB connected", mongoose.connection.host);
        } catch (err) {
            console.error(err);
            process.exit(1);
        } finally {
            dbConnecting = false;
        }
    }
};

export const getMongoServerTime = async () => {
    const adminDb = mongoose.connection.db?.admin();
    const result = await adminDb?.command({ isMaster: 1 }); // or { hello: 1 }
    const serverTime = result?.localTime;
    return serverTime ? serverTime.toISOString() : null;
};