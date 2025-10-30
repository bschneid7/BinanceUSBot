import logger from "../utils/logger";
import { alertService } from "./alertService";

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: Date | null;
  lastStateChange: Date;
  totalRequests: number;
  totalFailures: number;
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: Date | null = null;
  private lastStateChange = new Date();
  private totalRequests = 0;
  private totalFailures = 0;
  
  // Configuration
  private failureThreshold = 5; // Open after 5 consecutive failures
  private successThreshold = 2; // Close after 2 consecutive successes in HALF_OPEN
  private timeout = 60000; // 1 minute before trying HALF_OPEN
  private name: string;

  constructor(name: string, config?: {
    failureThreshold?: number;
    successThreshold?: number;
    timeout?: number;
  }) {
    this.name = name;
    if (config) {
      if (config.failureThreshold) this.failureThreshold = config.failureThreshold;
      if (config.successThreshold) this.successThreshold = config.successThreshold;
      if (config.timeout) this.timeout = config.timeout;
    }
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if circuit is open
    if (this.state === "OPEN") {
      const timeSinceFailure = this.lastFailureTime 
        ? Date.now() - this.lastFailureTime.getTime()
        : Infinity;

      if (timeSinceFailure > this.timeout) {
        // Try half-open state
        this.setState("HALF_OPEN");
        logger.info(`Circuit breaker [${this.name}] entering HALF_OPEN state`);
      } else {
        const error = new Error(`Circuit breaker [${this.name}] is OPEN - blocking request`);
        logger.warn(`Circuit breaker [${this.name}] blocked request`, {
          timeSinceFailure,
          timeout: this.timeout
        });
        throw error;
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.failureCount = 0;
    
    if (this.state === "HALF_OPEN") {
      this.successCount++;
      
      if (this.successCount >= this.successThreshold) {
        this.setState("CLOSED");
        logger.info(`Circuit breaker [${this.name}] closed after ${this.successCount} successes`);
        this.successCount = 0;
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: any): void {
    this.failureCount++;
    this.totalFailures++;
    this.lastFailureTime = new Date();
    this.successCount = 0;

    logger.error(`Circuit breaker [${this.name}] recorded failure ${this.failureCount}/${this.failureThreshold}`, {
      error: error.message,
      stack: error.stack
    });

    if (this.failureCount >= this.failureThreshold) {
      this.setState("OPEN");
      
      const message = `Circuit breaker [${this.name}] OPENED after ${this.failureCount} failures`;
      logger.error(message);
      
      // Send alert
      alertService.sendAlert({
        type: "CIRCUIT_BREAKER",
        severity: "high",
        message,
        data: {
          circuitBreaker: this.name,
          failureCount: this.failureCount,
          lastError: error.message
        }
      }).catch(err => {
        logger.error("Failed to send circuit breaker alert:", err);
      });
    }
  }

  /**
   * Change circuit state
   */
  private setState(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = new Date();
    
    if (oldState !== newState) {
      logger.info(`Circuit breaker [${this.name}] state changed: ${oldState} -> ${newState}`);
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.lastStateChange = new Date();
    
    logger.info(`Circuit breaker [${this.name}] manually reset`);
  }

  /**
   * Check if circuit is allowing requests
   */
  isAllowingRequests(): boolean {
    return this.state !== "OPEN";
  }
}

// Create circuit breakers for different services
export const binanceApiCircuitBreaker = new CircuitBreaker("BinanceAPI", {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000 // 1 minute
});

export const mlModelCircuitBreaker = new CircuitBreaker("MLModel", {
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 30000 // 30 seconds
});

export const databaseCircuitBreaker = new CircuitBreaker("Database", {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000 // 30 seconds
});
