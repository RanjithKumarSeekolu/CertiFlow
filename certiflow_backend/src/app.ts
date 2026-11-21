import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import authRouter from "./modules/auth/auth.router";
import batchRouter from "./modules/batches/batch.router";
import certificateRouter from "./modules/certificates/certificate.router";
import verificationRouter from "./modules/verification/verification.router";

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors());
app.use(express.json());

// Serve generated certificates
const certificatesPath = path.resolve(process.cwd(), "uploads/certificates");
app.use("/certificates", express.static(certificatesPath));

// Healthcheck
app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "CertiFlow Backend API",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Mount module routers
app.use("/api/auth", authRouter);
app.use("/api/batches", batchRouter);
app.use("/api/certificates", certificateRouter);
app.use("/api/verify", verificationRouter);

export default app;
