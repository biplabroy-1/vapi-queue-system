import express, { Express } from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { env } from "./config";
import routes from "./routes";

export const createApp = (): Express => {
  const app = express();
  app.use(bodyParser.json());
  app.use(cors());

  app.use("/api", routes);

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("❌ Unhandled error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  });

  return app;
};


export const startServer = (app: Express): void => {
  const PORT = parseInt(env.PORT, 10);
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📡 API available at http://localhost:${PORT}/api`);
  });
};