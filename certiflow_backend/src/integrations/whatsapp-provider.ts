/**
 * Stand-in WhatsApp Provider simulating real-world WhatsApp Business API.
 * Simulates network latency, occasional dropouts, timeouts, and delivery receipts.
 */
export interface WhatsAppSendMessagePayload {
  to: string;
  templateName: string;
  parameters: {
    candidateName: string;
    courseName: string;
    certificateNumber: string;
    downloadUrl: string;
  };
  idempotencyKey: string;
}

export interface WhatsAppDeliveryResult {
  success: boolean;
  messageId: string;
  recipient: string;
  timestamp: string;
  attemptsRequired: number;
}

export class StandinWhatsAppProvider {
  // Store delivered messages by idempotencyKey to strictly guarantee single-delivery
  private static deliveredKeys = new Map<string, WhatsAppDeliveryResult>();
  
  // Failure rate (e.g. 0.35 = 35% chance of network error/timeout per attempt)
  public static failureRate = 0.35;

  /**
   * Resets internal tracking (used in automated test suites)
   */
  public static reset(): void {
    this.deliveredKeys.clear();
  }

  public static getDeliveredKeys(): Map<string, WhatsAppDeliveryResult> {
    return this.deliveredKeys;
  }

  /**
   * Send WhatsApp message with simulated flakiness and automatic retry handling.
   */
  public static async sendMessage(
    payload: WhatsAppSendMessagePayload,
    maxRetries = 5
  ): Promise<WhatsAppDeliveryResult> {
    // IDEMPOTENCY CHECK: If already delivered under this key, return immediately
    if (this.deliveredKeys.has(payload.idempotencyKey)) {
      return this.deliveredKeys.get(payload.idempotencyKey)!;
    }

    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < maxRetries) {
      attempts++;
      try {
        const result = await this.executeSendAttempt(payload, attempts);
        this.deliveredKeys.set(payload.idempotencyKey, result);
        return result;
      } catch (err: any) {
        lastError = err;
        // Exponential backoff with small jitter for tests
        const backoffMs = Math.min(50 * Math.pow(2, attempts), 500);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw new Error(
      `WhatsApp delivery failed after ${maxRetries} attempts for recipient ${payload.to}. Last error: ${lastError?.message}`
    );
  }

  private static async executeSendAttempt(
    payload: WhatsAppSendMessagePayload,
    attemptNumber: number
  ): Promise<WhatsAppDeliveryResult> {
    // Simulate slight network latency (10-30ms)
    await new Promise((r) => setTimeout(r, 10 + Math.random() * 20));

    // Simulate flaky connection based on failureRate
    if (Math.random() < this.failureRate) {
      const errorTypes = [
        "GATEWAY_TIMEOUT: WhatsApp server did not respond in 5000ms",
        "CONNECTION_RESET_BY_PEER: Socket closed unexpectedly",
        "RATE_LIMIT_EXCEEDED: Upstream provider throttled request",
        "TEMPORARY_NETWORK_FAILURE: DNS resolution timeout",
      ];
      const randomError = errorTypes[Math.floor(Math.random() * errorTypes.length)];
      throw new Error(randomError);
    }

    // Success!
    const messageId = `wa_msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    return {
      success: true,
      messageId,
      recipient: payload.to,
      timestamp: new Date().toISOString(),
      attemptsRequired: attemptNumber,
    };
  }
}

