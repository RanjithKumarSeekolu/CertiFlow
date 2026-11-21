import { Router } from "express";
import { CertificateController } from "../certificates/certificate.controller";

const router = Router();

// Public Verification Endpoint (No authentication required)
router.get("/:identifier", CertificateController.verify);

export default router;

