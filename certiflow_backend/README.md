# CertiFlow: Skilling Certificate Issuance Platform

> **Build the system that decides who gets certified, issues the certificate, and lets anyone check that a certificate is genuine.**

---

## 1. Requirements Note & Problem Understanding

The Pragati Skills Mission certifies ~8,000 vocational students monthly across 300+ private training centres. Previously, batches were submitted via spreadsheets, approved informally over messaging, and certificates typed manually into Word documents. This resulted in multi-week delays, untraceable approvals, and circulating fraudulent certificates.

### Core System Requirements
1. **Multi-Role Governance**:
   * **Training Centres (Anika)**: Create batches, bulk-ingest candidate spreadsheets, submit for multi-stage approval, and handle revisions if sent back.
   * **District Officers (Dev, Meera, Kabir)**: Review batches for centres within their assigned district. **Requires $\ge 2$ distinct officer approvals to advance**.
   * **Quality Team (Neha)**: Extra scrutiny on large batches ($> 50$ candidates) prior to state review.
   * **State Office (Farah)**: Final authority, oversees stalled batches via automated SLA monitoring, and holds immediate revocation power for fraudulent certificates.
   * **Candidates**: Receive verified certificates on WhatsApp with secure download links.
   * **Employers & Public**: Instant verification without login, protected by candidate identity privacy masking.

---

## 2. Key Technical Decisions & Architectural Rationale

### A. Atomic Spreadsheet Ingestion (Moment 1)
* **Decision**: All-or-nothing transactional validation using `xlsx` and `zod`.
* **Rationale**: If row 59 out of 60 contains an invalid phone number or duplicate national ID, the entire batch upload is rejected with exact row/field error reports. No partial or corrupt candidate data ever enters the database.

### B. Concurrency-Safe District Consensus (Moment 2)
* **Decision**: Database-level optimistic locking with row versioning and composite unique constraints (`[batchId, officerId, reviewCycle]`).
* **Rationale**: Prevents race conditions when two district officers click "Approve" at the same instant. The batch transitions to the next stage (`QUALITY_PENDING` or `STATE_PENDING`) exactly once, never twice.

### C. Idempotent WhatsApp & Certificate Generation Pipeline (Moment 3)
* **Decision**: Background job processing with deterministic idempotency keys (`wa_delivery_${candidateId}_${certificateId}`) and exponential backoff retry.
* **Rationale**: External messaging providers (simulated with 35% failure/timeout rate) are inherently flaky. Deduplication keys guarantee that each candidate receives **exactly one certificate on their phone**, even under high network turbulence.

### D. Sub-Millisecond Public Verification & Instant Revocation (Moment 4)
* **Decision**: Redis in-memory cache layer (`cert:verify:${certificateNumber}`) with cache-eviction upon revocation.
* **Rationale**: Public verification experiences traffic spikes (thousands of lookups in bursts). Caching protects the database. When the State Office cancels a fake certificate, the cache key is purged instantly—ensuring employers are informed immediately that the certificate is revoked. Candidate privacy is preserved by masking full names (e.g. `R***l K***r`).

### E. Proactive SLA Breach Detection (Moment 5)
* **Decision**: Automated background worker (`SlaMonitorWorker`) auditing batch deadlines.
* **Rationale**: Eliminates the "files sitting untouched with an officer for days" complaint by automatically escalating overdue batches to Farah (State Office) and recording immutable audit entries.

### F. Deliberate Send-Back & Resubmission Lifecycle (Moment 6)
* **Decision**: Documented cycle increments (`reviewCycle = reviewCycle + 1`) that reset active approvals while retaining historical audit records.
* **Rationale**: If an officer sends a batch back with revision feedback, fixing candidate data fundamentally alters the batch. Prior district approvals are archived under cycle 1, and the batch requires fresh multi-officer consensus under cycle 2.

---

## 3. Tech Stack

* **Runtime**: Node.js (v20+), Express, TypeScript
* **Database & ORM**: PostgreSQL (Supabase), Prisma ORM v6
* **Cache & Realtime**: Redis (`ioredis`), Socket.io
* **Certificate Engine**: `pdfkit` (tamper-evident SHA-256 fingerprinting)
* **Messaging**: Stand-in flaky WhatsApp provider with simulated failure, timeout, and retry logic
* **Testing**: Vitest, Supertest

---

## 4. Verification: The 6 Mandatory Moments

All 6 critical moments are proven via automated integration tests:

```bash
npm test
```

```
✓ tests/moments.test.ts (8 tests)
  ✓ Moment 1: Atomic Spreadsheet Validation (all-or-nothing atomicity)
  ✓ Moment 2: Concurrent Multi-Officer Approvals (consensus threshold)
  ✓ Moment 3: Resilient 60-Candidate WhatsApp Issuance (35% simulated failure rate)
  ✓ Moment 4: State Office Revocation & Privacy Masking
  ✓ Moment 5: Automated SLA Breach Detection
  ✓ Moment 6: Send-back and Resubmission Behavior
  ✓ Security: SHA-256 Tamper Evident Hash
```

---

## 5. Quick Links

* [SETUP.md](file:///Users/ranjiths_500376/Documents/CertiFlow/certiflow_backend/SETUP.md): Fresh clone setup guide
* [DEPLOYMENT.md](file:///Users/ranjiths_500376/Documents/CertiFlow/certiflow_backend/DEPLOYMENT.md): Production scaling plan for 100k users & 30k peak PDFs
