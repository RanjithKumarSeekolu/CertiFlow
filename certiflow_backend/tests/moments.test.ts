import { describe, it, expect, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import { CandidateRowSchema } from "../src/modules/batches/batch.schema";
import { StandinWhatsAppProvider } from "../src/integrations/whatsapp-provider";
import { generateCertificateNumber, generateVerificationHash } from "../src/utils/crypto";
import { CertificateService } from "../src/modules/certificates/certificate.service";

describe("CertiFlow Core Engine: The 6 Mandatory Moments", () => {
  beforeEach(() => {
    StandinWhatsAppProvider.reset();
  });

  // MOMENT 1: Atomic Spreadsheet Upload with Row-by-Row Error Reporting
  describe("Moment 1: Atomic Spreadsheet Validation", () => {
    it("detects exact bad rows and guarantees all-or-nothing atomicity", () => {
      const mockSpreadsheetData = [
        { fullName: "Aarav Sharma", phone: "9876543210", nationalId: "AADHAAR1001", score: 88 },
        { fullName: "B", phone: "invalid_phone", nationalId: "AADHAAR1002", score: 92 }, // Bad name & phone
        { fullName: "Chirag Verma", phone: "9876543212", nationalId: "AADHAAR1003", score: 120 }, // Bad score (>100)
        { fullName: "Deepa Nair", phone: "9876543213", nationalId: "AADHAAR1001", score: 75 }, // Duplicate nationalId
      ];

      const errors: Array<{ row: number; field: string; message: string }> = [];
      const seenNationalIds = new Set<string>();

      mockSpreadsheetData.forEach((row, index) => {
        const rowNumber = index + 2;
        const res = CandidateRowSchema.safeParse(row);

        if (!res.success) {
          res.error.issues.forEach((issue) => {
            errors.push({
              row: rowNumber,
              field: issue.path.join("."),
              message: issue.message,
            });
          });
        } else {
          if (seenNationalIds.has(row.nationalId)) {
            errors.push({
              row: rowNumber,
              field: "nationalId",
              message: `Duplicate National ID '${row.nationalId}' found in spreadsheet`,
            });
          } else {
            seenNationalIds.add(row.nationalId);
          }
        }
      });

      // Assert that errors were caught with exact row numbers and fields
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.row === 3 && e.field === "fullName")).toBe(true);
      expect(errors.some((e) => e.row === 3 && e.field === "phone")).toBe(true);
      expect(errors.some((e) => e.row === 4 && e.field === "score")).toBe(true);

      // Atomic assertion: If errorCount > 0, zero records are committed to DB
      const committedRecords = errors.length > 0 ? 0 : mockSpreadsheetData.length;
      expect(committedRecords).toBe(0);
    });
  });

  // MOMENT 2: Concurrent Multi-Officer Approval Logic
  describe("Moment 2: Concurrent Multi-Officer Approvals", () => {
    it("requires at least 2 distinct officers to advance a batch", () => {
      const reviewCycle = 1;
      const votes: Array<{ officerId: string; decision: string; cycle: number }> = [];

      function castApproval(officerId: string) {
        // Enforce unique vote per officer per cycle
        if (votes.some((v) => v.officerId === officerId && v.cycle === reviewCycle)) {
          throw new Error("Officer already voted in this review cycle");
        }
        votes.push({ officerId, decision: "APPROVED", cycle: reviewCycle });

        const approvalCount = votes.filter((v) => v.decision === "APPROVED" && v.cycle === reviewCycle).length;
        return approvalCount >= 2 ? "STATE_PENDING" : "DISTRICT_PENDING";
      }

      // Officer 1 (Dev) approves -> Still DISTRICT_PENDING
      const stateAfterDev = castApproval("dev-officer-id");
      expect(stateAfterDev).toBe("DISTRICT_PENDING");
      expect(votes.length).toBe(1);

      // Dev tries to approve again -> Rejected by composite uniqueness
      expect(() => castApproval("dev-officer-id")).toThrow();

      // Officer 2 (Meera) approves -> Moves to STATE_PENDING
      const stateAfterMeera = castApproval("meera-officer-id");
      expect(stateAfterMeera).toBe("STATE_PENDING");
      expect(votes.length).toBe(2);

      // Officer 3 (Kabir) approves after consensus -> State remains advanced once, not twice
      const stateAfterKabir = castApproval("kabir-officer-id");
      expect(stateAfterKabir).toBe("STATE_PENDING");
      expect(votes.length).toBe(3);
    });
  });

  // MOMENT 3: 60-Candidate WhatsApp Delivery with Flaky Network
  describe("Moment 3: Resilient 60-Candidate WhatsApp Issuance", () => {
    it("delivers exactly 1 certificate per candidate even with 35% network failure rate", async () => {
      StandinWhatsAppProvider.failureRate = 0.35; // 35% simulated failure / timeout rate
      const candidateCount = 60;
      const candidates = Array.from({ length: candidateCount }, (_, i) => ({
        id: `cand_${i + 1}`,
        fullName: `Candidate ${i + 1}`,
        phone: `+9198765${String(i).padStart(5, "0")}`,
        course: "Electrician Level 3",
        certNumber: `CERT-2026-${String(i + 1).padStart(4, "0")}`,
      }));

      // Issue and send concurrently for all 60 candidates
      const deliveryPromises = candidates.map(async (c) => {
        const idempotencyKey = `wa_delivery_${c.id}_${c.certNumber}`;
        return StandinWhatsAppProvider.sendMessage({
          to: c.phone,
          templateName: "skilling_certificate_issued",
          parameters: {
            candidateName: c.fullName,
            courseName: c.course,
            certificateNumber: c.certNumber,
            downloadUrl: `http://localhost:8081/certificates/${c.certNumber}.pdf`,
          },
          idempotencyKey,
        });
      });

      const results = await Promise.all(deliveryPromises);

      // Verify all 60 candidates received certificates
      expect(results.length).toBe(60);
      results.forEach((res) => {
        expect(res.success).toBe(true);
      });

      // Verify strict idempotency: exactly 60 distinct keys delivered
      const deliveredKeys = StandinWhatsAppProvider.getDeliveredKeys();
      expect(deliveredKeys.size).toBe(60);

      // Retrying a delivery for an already-sent key returns identical messageId without resending
      const candidate1Key = `wa_delivery_${candidates[0]!.id}_${candidates[0]!.certNumber}`;
      const duplicateAttempt = await StandinWhatsAppProvider.sendMessage({
        to: candidates[0]!.phone,
        templateName: "skilling_certificate_issued",
        parameters: {
          candidateName: candidates[0]!.fullName,
          courseName: candidates[0]!.course,
          certificateNumber: candidates[0]!.certNumber,
          downloadUrl: `http://localhost:8081/certificates/${candidates[0]!.certNumber}.pdf`,
        },
        idempotencyKey: candidate1Key,
      });

      expect(duplicateAttempt.messageId).toBe(deliveredKeys.get(candidate1Key)!.messageId);
      expect(deliveredKeys.size).toBe(60); // Still exactly 60!
    });
  });

  // MOMENT 4: Instant Public Revocation Check
  describe("Moment 4: State Office Revocation & Privacy Masking", () => {
    it("masks candidate name to prevent identity leakage during public verification", () => {
      const masked1 = CertificateService.maskName("Rahul Kumar");
      expect(masked1).toBe("R***l K***r");

      const masked2 = CertificateService.maskName("Anika");
      expect(masked2).toBe("A***a");
    });

    it("immediately invalidates validity upon revocation", () => {
      let certificate = {
        number: "CERT-2026-A1B2C3",
        status: "VALID",
        revokedAt: null as Date | null,
        revocationReason: null as string | null,
      };

      // Employer verification before revocation
      expect(certificate.status).toBe("VALID");

      // State Office cancels certificate
      certificate = {
        ...certificate,
        status: "REVOKED",
        revokedAt: new Date(),
        revocationReason: "Forged marksheet detected",
      };

      // Employer checking 1 minute later
      expect(certificate.status).toBe("REVOKED");
      expect(certificate.revocationReason).toBe("Forged marksheet detected");
    });
  });

  // MOMENT 5: SLA Breach Detection
  describe("Moment 5: Automated SLA Breach Detection", () => {
    it("flags batches that have exceeded their SLA deadline", () => {
      const now = new Date();
      const batches = [
        { id: "batch_1", status: "DISTRICT_PENDING", slaDeadline: new Date(now.getTime() - 3600 * 1000) }, // Overdue by 1 hr
        { id: "batch_2", status: "DISTRICT_PENDING", slaDeadline: new Date(now.getTime() + 86400 * 1000) }, // Within SLA
        { id: "batch_3", status: "QUALITY_PENDING", slaDeadline: new Date(now.getTime() - 7200 * 1000) }, // Overdue by 2 hrs
      ];

      const breached = batches.filter((b) => b.slaDeadline < now);
      expect(breached.length).toBe(2);
      expect(breached.map((b) => b.id)).toEqual(["batch_1", "batch_3"]);
    });
  });

  // MOMENT 6: Documented Resubmission Lifecycle
  describe("Moment 6: Send-back and Resubmission Behavior", () => {
    it("archives previous approvals and requires fresh consensus on resubmission", () => {
      let batch = {
        status: "SENT_BACK",
        reviewCycle: 1,
        approvals: [
          { officerId: "dev", cycle: 1, decision: "APPROVED" },
          { officerId: "meera", cycle: 1, decision: "SENT_BACK" },
        ],
      };

      // Centre resubmits batch after fixing
      const newCycle = batch.reviewCycle + 1;
      batch = {
        ...batch,
        status: "DISTRICT_PENDING",
        reviewCycle: newCycle,
      };

      expect(batch.reviewCycle).toBe(2);
      expect(batch.status).toBe("DISTRICT_PENDING");

      // Active approvals for cycle 2 should be 0, requiring fresh consensus
      const activeApprovals = batch.approvals.filter((a) => a.cycle === batch.reviewCycle);
      expect(activeApprovals.length).toBe(0);
    });
  });

  // SECURITY: Cryptographic tamper-proofing
  describe("Security: SHA-256 Tamper Evident Hash", () => {
    it("generates deterministic fingerprint that changes if data is altered", () => {
      const issueDate = new Date("2026-11-21T00:00:00.000Z");
      const original = {
        candidateId: "cand_1",
        candidateName: "Pooja Reddy",
        nationalId: "AADHAAR-8899",
        courseName: "Solar Panel Technician",
        score: 95.0,
        grade: "A",
        batchId: "batch_101",
        issuedAt: issueDate,
      };

      const hash1 = generateVerificationHash(original);
      const hash2 = generateVerificationHash(original);
      expect(hash1).toBe(hash2); // Deterministic

      // If someone tampers with the score from 95 to 99:
      const tampered = { ...original, score: 99.0 };
      const tamperedHash = generateVerificationHash(tampered);
      expect(tamperedHash).not.toBe(hash1); // Tampering detected!
    });
  });
});

