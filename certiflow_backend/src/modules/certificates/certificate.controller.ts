import { Request, Response } from "express";
import { CertificateService } from "./certificate.service";
import { AuthRequest } from "../../middlewares/auth.middleware";

export class CertificateController {
  static async issueForBatch(req: AuthRequest, res: Response): Promise<void> {
    try {
      const batchId = String(req.params.batchId);
      const result = await CertificateService.issueBatchCertificates(batchId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  static async revoke(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const { reason } = req.body;
      if (!reason) {
        res.status(400).json({ error: "Revocation reason is required" });
        return;
      }
      const revoked = await CertificateService.revokeCertificate(id, reason, req.user!.id);
      res.json(revoked);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  static async verify(req: Request, res: Response): Promise<void> {
    try {
      const identifier = String(req.params.identifier);
      const result = await CertificateService.verifyCertificate(identifier);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
