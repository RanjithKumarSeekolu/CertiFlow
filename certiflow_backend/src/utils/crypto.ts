import crypto from "crypto";

export function generateCertificateNumber(): string {
  const year = new Date().getFullYear();
  const randomHex = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `CERT-${year}-${randomHex}`;
}

export function generateVerificationHash(data: {
  candidateId: string;
  candidateName: string;
  nationalId: string;
  courseName: string;
  score: number;
  grade: string;
  batchId: string;
  issuedAt: Date;
}): string {
  const payload = [
    data.candidateId,
    data.candidateName,
    data.nationalId,
    data.courseName,
    data.score.toFixed(2),
    data.grade,
    data.batchId,
    data.issuedAt.toISOString(),
  ].join("|");

  return crypto.createHash("sha256").update(payload).digest("hex");
}

