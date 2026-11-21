import prisma from "../config/db";
import { BatchStatus, Role } from "@prisma/client";

export interface SlaBreachReport {
  batchId: string;
  batchNumber: string;
  centreName: string;
  status: BatchStatus;
  submittedAt: Date | null;
  slaDeadline: Date | null;
  overdueMinutes: number;
}

export class SlaMonitorWorker {
  /**
   * MOMENT 5: Automated SLA Breach Detection & Escalation
   * Runs periodically to flag batches untouched past their SLA deadline.
   */
  public static async scanAndEscalateBreaches(): Promise<SlaBreachReport[]> {
    const now = new Date();

    const pendingStatuses: BatchStatus[] = [
      BatchStatus.DISTRICT_PENDING,
      BatchStatus.QUALITY_PENDING,
      BatchStatus.STATE_PENDING,
    ];

    // Find all active batches that breached their SLA deadline
    const breachedBatches = await prisma.batch.findMany({
      where: {
        status: { in: pendingStatuses },
        slaDeadline: { lt: now },
      },
      include: {
        centre: true,
      },
    });

    const reports: SlaBreachReport[] = [];

    for (const batch of breachedBatches) {
      const overdueMinutes = batch.slaDeadline
        ? Math.round((now.getTime() - batch.slaDeadline.getTime()) / (1000 * 60))
        : 0;

      // Check if an escalation has already been logged in the last 6 hours to avoid spamming
      const recentEscalation = await prisma.auditLog.findFirst({
        where: {
          batchId: batch.id,
          action: "SLA_BREACH_ESCALATED",
          timestamp: { gt: new Date(now.getTime() - 6 * 60 * 60 * 1000) },
        },
      });

      if (!recentEscalation) {
        await prisma.auditLog.create({
          data: {
            entityType: "BATCH",
            entityId: batch.id,
            action: "SLA_BREACH_ESCALATED",
            actorRole: Role.STATE_OFFICE,
            batchId: batch.id,
            details: {
              batchNumber: batch.batchNumber,
              status: batch.status,
              overdueMinutes,
              slaDeadline: batch.slaDeadline,
              escalatedTo: "State Office & Senior Leadership",
            },
          },
        });
      }

      reports.push({
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        centreName: batch.centre.name,
        status: batch.status,
        submittedAt: batch.submittedAt,
        slaDeadline: batch.slaDeadline,
        overdueMinutes,
      });
    }

    return reports;
  }
}

