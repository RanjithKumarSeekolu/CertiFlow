import { Router } from "express";
import { CertificateController } from "./certificate.controller";
import { authenticate, requireRole } from "../../middlewares/auth.middleware";

const router = Router();

// Protected endpoints
router.post("/batch/:batchId/issue", authenticate, requireRole("STATE_OFFICE"), CertificateController.issueForBatch);
router.post("/:id/revoke", authenticate, requireRole("STATE_OFFICE"), CertificateController.revoke);

export default router;

