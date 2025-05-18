
import { createApp, startServer } from "./src/app";
import { processNextCall } from "./src/services/call.service";

const app = createApp();
startServer(app);

console.log("📞 Starting call queue processor...");
processNextCall()
  .catch((err) => {
    console.error("❌ Error in call queue processor:", err);
    process.exit(1);
  });