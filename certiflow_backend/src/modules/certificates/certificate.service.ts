import prisma from "../../config/db";
import { cache } from "../../config/redis";
import { generateCertificateNumber, generateVerificationHash } from "../../utils/crypto";
import { PdfCertificateGenerator } from "../../workers/pdf.worker";
import { StandinWhatsAppProvider } from "../../integrations/whatsapp-provider";
import { CertificateStatus, JobStatus, Role } from "@prisma/client";

export class CertificateService {
  /**
   * Masks candidate name to protect candidate privacy during public lookups.
   * "Rahul Kumar" -> "R***l K***r"
   */
  public static maskName(fullName: string): string {
    return fullName
      .split(" ")
      .map((part) => {
        if (part.length <= 2) return part[0] + "*";
        return part[0] + "*".repeat(part.length - 2) + part[part.length - 1];
      })
      .join(" ");
  }

  /**
   * MOMENT 3: Idempotent Batch Certificate Issuance and WhatsApp Delivery
   * Exactly 1 certificate per candidate, exactly 1 WhatsApp delivery, even with flaky network.
   */
  public static async issueBatchCertificates(batchId: string) {
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: {
        candidates: {
          include: { certificate: true },
        },
      },
    });

    if (!batch) throw new Error("Batch not found");

    const baseUrl = process.env.PUBLIC_APP_URL || "http://localhost:8081";
    const issuedCertificates: any[] = [];

    for (const candidate of batch.candidates) {
      // 1. Idempotency Check: Candidate already has a certificate?
      let certificate = candidate.certificate;

      if (!certificate) {
        const certNumber = generateCertificateNumber();
        const issuedAt = new Date();
        const verificationUrl = `${baseUrl}/api/verify/${certNumber}`;

        const hash = generateVerificationHash({
          candidateId: candidate.id,
          candidateName: candidate.fullName,
          nationalId: candidate.nationalId,
          courseName: batch.courseName,
          score: candidate.score,
          grade: candidate.grade,
          batchId: batch.id,
          issuedAt,
        });

        // Generate PDF
        const pdfUrl = await PdfCertificateGenerator.generateCertificatePdf({
          certificateNumber: certNumber,
          candidateName: candidate.fullName,
          courseName: batch.courseName,
          grade: candidate.grade,
          score: candidate.score,
          issueDate: issuedAt.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
          verificationHash: hash,
          verificationUrl,
        });

        // Save Certificate to DB
        certificate = await prisma.certificate.create({
          data: {
            certificateNumber: certNumber,
            candidateId: candidate.id,
            batchId: batch.id,
            verificationHash: hash,
            qrCodeData: verificationUrl,
            pdfUrl,
            status: CertificateStatus.VALID,
            issuedAt,
          },
        });
      }

      // 2. Deliver via Stand-in WhatsApp with Idempotency Key
      const idempotencyKey = `wa_delivery_${candidate.id}_${certificate.id}`;

      // Check or create delivery job
      let deliveryJob = await prisma.deliveryJob.findUnique({
        where: { idempotencyKey },
      });

      if (!deliveryJob || deliveryJob.status !== JobStatus.COMPLETED) {
        if (!deliveryJob) {
          deliveryJob = await prisma.deliveryJob.create({
            data: {
              certificateId: certificate.id,
              idempotencyKey,
              recipientPhone: candidate.phone,
              status: JobStatus.PROCESSING,
            },
          });
        }

        try {
          const waResult = await StandinWhatsAppProvider.sendMessage({
            to: candidate.phone,
            templateName: "skilling_certificate_issued",
            parameters: {
              candidateName: candidate.fullName,
              courseName: batch.courseName,
              certificateNumber: certificate.certificateNumber,
              downloadUrl: `${baseUrl}${certificate.pdfUrl}`,
            },
            idempotencyKey,
          });

          await prisma.deliveryJob.update({
            where: { id: deliveryJob.id },
            data: {
              status: JobStatus.COMPLETED,
              attempts: waResult.attemptsRequired,
              deliveredAt: new Date(),
            },
          });
        } catch (deliveryErr: any) {
          await prisma.deliveryJob.update({
            where: { id: deliveryJob.id },
            data: {
              status: JobStatus.FAILED,
              lastError: deliveryErr.message,
            },
          });
        }
      }

      // 3. Cache verification in Redis
      const cacheKey = `cert:verify:${certificate.certificateNumber}`;
      await cache.set(
        cacheKey,
        JSON.stringify({
          valid: true,
          status: CertificateStatus.VALID,
          certificateNumber: certificate.certificateNumber,
          candidateName: this.maskName(candidate.fullName),
          courseName: batch.courseName,
          grade: candidate.grade,
          score: candidate.score,
          issuedAt: certificate.issuedAt,
          verificationHash: certificate.verificationHash,
          pdfUrl: certificate.pdfUrl,
        }),
        "EX",
        3600
      );

      issuedCertificates.push(certificate);
    }

    return {
      batchId,
      issuedCount: issuedCertificates.length,
      certificates: issuedCertificates,
    };
  }

  /**
   * Public Verification (No login required)
   * High performance backed by Redis cache.
   */
  public static async verifyCertificate(identifier: string) {
    const cacheKey = `cert:verify:${identifier}`;
    const cached = await cache.get(cacheKey);

    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        // Fall back to database query if cache parse fails
      }
    }

    // Query database by certificateNumber or verificationHash
    const certificate = await prisma.certificate.findFirst({
      where: {
        OR: [{ certificateNumber: identifier }, { verificationHash: identifier }],
      },
      include: {
        candidate: true,
        batch: true,
      },
    });

    if (!certificate) {
      return {
        valid: false,
        status: "NOT_FOUND",
        message: "No certificate found matching the provided code or hash",
      };
    }

    const verificationResult = {
      valid: certificate.status === CertificateStatus.VALID,
      status: certificate.status,
      certificateNumber: certificate.certificateNumber,
      candidateName: this.maskName(certificate.candidate.fullName),
      courseName: certificate.batch.courseName,
      grade: certificate.candidate.grade,
      score: certificate.candidate.score,
      issuedAt: certificate.issuedAt,
      verificationHash: certificate.verificationHash,
      pdfUrl: certificate.pdfUrl,
      revokedAt: certificate.revokedAt,
      revocationReason: certificate.revocationReason,
    };

    // Cache verification response in Redis
    await cache.set(cacheKey, JSON.stringify(verificationResult), "EX", 3600);

    return verificationResult;
  }

  /**
   * MOMENT 4: State Office Certificate Cancellation & Instant Redis Invalidation
   */
  public static async revokeCertificate(certificateId: string, reason: string, officerId: string) {
    const certificate = await prisma.certificate.findUnique({
      where: { id: certificateId },
      include: { candidate: true, batch: true },
    });

    if (!certificate) throw new Error("Certificate not found");
    if (certificate.status === CertificateStatus.REVOKED) {
      throw new Error("Certificate is already revoked");
    }

    const revoked = await prisma.certificate.update({
      where: { id: certificateId },
      data: {
        status: CertificateStatus.REVOKED,
        revokedAt: new Date(),
        revokedBy: officerId,
        revocationReason: reason,
      },
    });

    // INSTANT REDIS CACHE INVALIDATION
    await cache.del(`cert:verify:${certificate.certificateNumber}`);
    await cache.del(`cert:verify:${certificate.verificationHash}`);

    // Update cache with revoked status immediately so next lookup reflects REVOKED instantly
    const revokedPayload = {
      valid: false,
      status: CertificateStatus.REVOKED,
      certificateNumber: certificate.certificateNumber,
      candidateName: this.maskName(certificate.candidate.fullName),
      courseName: certificate.batch.courseName,
      issuedAt: certificate.issuedAt,
      revokedAt: revoked.revokedAt,
      revocationReason: reason,
    };
    await cache.set(`cert:verify:${certificate.certificateNumber}`, JSON.stringify(revokedPayload), "EX", 3600);

    // Write immutable audit log
    await prisma.auditLog.create({
      data: {
        entityType: "CERTIFICATE",
        entityId: certificate.id,
        action: "CERTIFICATE_REVOKED",
        actorId: officerId,
        actorRole: Role.STATE_OFFICE,
        batchId: certificate.batchId,
        details: { reason, certificateNumber: certificate.certificateNumber },
      },
    });

    return revoked;
  }
}

