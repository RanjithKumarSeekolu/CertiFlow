import { Response } from "express";
import { BatchService } from "./batch.service";
import { CreateBatchSchema, OfficerReviewSchema } from "./batch.schema";
import { AuthRequest } from "../../middlewares/auth.middleware";
import { SlaMonitorWorker } from "../../workers/sla.worker";

export class BatchController {
  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const parsed = CreateBatchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
        return;
      }
      const batch = await BatchService.createBatch(req.user!.id, parsed.data.courseName);
      res.status(201).json(batch);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  static async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const batches = await BatchService.getBatches(req.user!);
      res.json(batches);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  static async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const batch = await BatchService.getBatchById(id, req.user!);
      res.json(batch);
    } catch (err: any) {
      const status = err.message.includes("Forbidden") ? 403 : err.message.includes("not found") ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
  }

  static async uploadCandidates(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      if (!req.file || !req.file.buffer) {
        res.status(400).json({ error: "No file uploaded. Please upload a .xlsx, .xls, or .csv file." });
        return;
      }

      const result = await BatchService.uploadCandidates(id, req.user!.id, req.file.buffer);

      if (!result.success) {
        res.status(422).json(result);
        return;
      }

      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  static async submit(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const batch = await BatchService.submitBatch(id, req.user!.id);
      res.json(batch);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  static async districtReview(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const parsed = OfficerReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
        return;
      }
      const updated = await BatchService.reviewDistrictBatch(id, req.user!, parsed.data);
      res.json(updated);
    } catch (err: any) {
      const status = err.message.includes("Forbidden") ? 403 : 400;
      res.status(status).json({ error: err.message });
    }
  }

  static async qualityReview(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const parsed = OfficerReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
        return;
      }
      const updated = await BatchService.reviewQualityBatch(id, req.user!, parsed.data);
      res.json(updated);
    } catch (err: any) {
      const status = err.message.includes("Forbidden") ? 403 : 400;
      res.status(status).json({ error: err.message });
    }
  }

  static async stateReview(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const parsed = OfficerReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
        return;
      }
      const updated = await BatchService.reviewStateBatch(id, req.user!, parsed.data);
      res.json(updated);
    } catch (err: any) {
      const status = err.message.includes("Forbidden") ? 403 : 400;
      res.status(status).json({ error: err.message });
    }
  }

  static async resubmit(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const batch = await BatchService.resubmitBatch(id, req.user!.id);
      res.json(batch);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  static async getStuckBatches(_req: AuthRequest, res: Response): Promise<void> {
    try {
      const breaches = await SlaMonitorWorker.scanAndEscalateBreaches();
      res.json(breaches);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
