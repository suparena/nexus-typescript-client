/**
 * Error Handling Example for Nexus TypeScript Client
 * 
 * This example demonstrates comprehensive error handling patterns including
 * retry logic, fallback mechanisms, validation, and error recovery.
 */

import { NexusClient, NexusEvent } from '../index';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const client = new NexusClient({
  url: process.env.NEXUS_ENDPOINT || 'https://api.example.com/events',
  token: process.env.NEXUS_TOKEN || 'your-api-token-here'
});

/**
 * Custom error types for better error handling
 */
class NexusError extends Error {
  constructor(message: string, public code: string, public details?: any) {
    super(message);
    this.name = 'NexusError';
  }
}

class ValidationError extends NexusError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

class NetworkError extends NexusError {
  constructor(message: string, details?: any) {
    super(message, 'NETWORK_ERROR', details);
    this.name = 'NetworkError';
  }
}

/**
 * Event validator to catch errors before sending
 */
class EventValidator {
  static validate(event: NexusEvent): void {
    // Check required fields
    if (!event.type) {
      throw new ValidationError('Event type is required');
    }

    // Check type format
    if (typeof event.type !== 'string' || event.type.length === 0) {
      throw new ValidationError('Event type must be a non-empty string');
    }

    // Check for common mistakes
    if (event.type.includes(' ')) {
      throw new ValidationError('Event type should not contain spaces', {
        type: event.type,
        suggestion: event.type.replace(/\s+/g, '.')
      });
    }

    // Check timestamp format if provided
    if ('timestamp' in event && event.timestamp) {
      const date = new Date(event.timestamp as string);
      if (isNaN(date.getTime())) {
        throw new ValidationError('Invalid timestamp format', {
          timestamp: event.timestamp,
          suggestion: new Date().toISOString()
        });
      }
    }

    // Warn about large payloads
    const eventSize = JSON.stringify(event).length;
    if (eventSize > 10000) {
      console.warn(`⚠️  Large event detected (${eventSize} bytes): ${event.type}`);
    }
  }

  static validateBatch(events: NexusEvent[]): void {
    if (!Array.isArray(events)) {
      throw new ValidationError('Events must be an array');
    }

    if (events.length === 0) {
      throw new ValidationError('Events array cannot be empty');
    }

    if (events.length > 1000) {
      throw new ValidationError(`Batch too large: ${events.length} events (max 1000)`);
    }

    // Validate each event
    events.forEach((event, index) => {
      try {
        EventValidator.validate(event);
      } catch (error) {
        throw new ValidationError(`Invalid event at index ${index}: ${error.message}`, {
          index,
          event
        });
      }
    });
  }
}

/**
 * Retry handler with exponential backoff
 */
async function sendWithRetry(
  event: NexusEvent | NexusEvent[],
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    shouldRetry?: (error: any) => boolean;
  } = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    shouldRetry = (error) => {
      // Retry on network errors and 5xx status codes
      if (error.message?.includes('fetch failed')) return true;
      if (error.message?.includes('HTTP 5')) return true;
      if (error.message?.includes('ETIMEDOUT')) return true;
      if (error.message?.includes('ECONNREFUSED')) return true;
      return false;
    }
  } = options;

  let lastError: Error | null = null;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Attempt ${attempt}/${maxRetries}...`);
      
      // Validate before sending
      if (Array.isArray(event)) {
        EventValidator.validateBatch(event);
      } else {
        EventValidator.validate(event);
      }

      const response = await client.send(event);
      
      // Check response status
      if (!response.ok) {
        const errorText = await response.text();
        throw new NetworkError(`HTTP ${response.status}: ${errorText}`, {
          status: response.status,
          response: errorText
        });
      }
      
      console.log(`✅ Success on attempt ${attempt}`);
      return response;
    } catch (error: any) {
      lastError = error;
      console.error(`❌ Attempt ${attempt} failed:`, error.message);
      
      // Don't retry validation errors
      if (error instanceof ValidationError) {
        throw error;
      }
      
      // Don't retry 4xx errors (client errors)
      if (error.message?.includes('HTTP 4')) {
        throw error;
      }
      
      // Check if we should retry this error
      if (!shouldRetry(error)) {
        throw error;
      }
      
      // Don't delay after the last attempt
      if (attempt < maxRetries) {
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Exponential backoff with jitter
        delay = Math.min(delay * 2 + Math.random() * 1000, maxDelay);
      }
    }
  }
  
  throw new NexusError(
    `Failed after ${maxRetries} attempts: ${lastError?.message}`,
    'MAX_RETRIES_EXCEEDED',
    { originalError: lastError }
  );
}

/**
 * Fallback storage for failed events
 */
class FailedEventStorage {
  private storageDir: string;
  private maxFileSize = 10 * 1024 * 1024; // 10MB

  constructor(storageDir = './failed-events') {
    this.storageDir = storageDir;
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
      console.log(`📁 Created failed events directory: ${this.storageDir}`);
    }
  }

  async save(event: NexusEvent | NexusEvent[], error: Error): Promise<void> {
    const filename = `failed-events-${new Date().toISOString().split('T')[0]}.jsonl`;
    const filepath = path.join(this.storageDir, filename);
    
    const entry = {
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        code: (error as NexusError).code,
        stack: error.stack
      },
      event: Array.isArray(event) ? event : [event]
    };
    
    try {
      // Check file size before appending
      if (fs.existsSync(filepath)) {
        const stats = fs.statSync(filepath);
        if (stats.size > this.maxFileSize) {
          // Rotate file
          const rotatedPath = filepath.replace('.jsonl', `-${Date.now()}.jsonl`);
          fs.renameSync(filepath, rotatedPath);
          console.log(`📄 Rotated large file to: ${rotatedPath}`);
        }
      }
      
      fs.appendFileSync(filepath, JSON.stringify(entry) + '\n');
      console.log(`💾 Saved failed event to: ${filepath}`);
    } catch (saveError) {
      console.error('❌ Failed to save event to disk:', saveError);
    }
  }

  async retry(): Promise<{ succeeded: number; failed: number }> {
    const files = fs.readdirSync(this.storageDir)
      .filter(f => f.startsWith('failed-events-') && f.endsWith('.jsonl'));
    
    let succeeded = 0;
    let failed = 0;
    
    for (const file of files) {
      const filepath = path.join(this.storageDir, file);
      const tempPath = filepath + '.processing';
      
      // Rename file to prevent concurrent processing
      try {
        fs.renameSync(filepath, tempPath);
      } catch (error) {
        console.log(`⏭️  Skipping ${file} (already being processed)`);
        continue;
      }
      
      console.log(`\n📂 Processing ${file}...`);
      const lines = fs.readFileSync(tempPath, 'utf-8').split('\n').filter(Boolean);
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          await sendWithRetry(entry.event, { maxRetries: 1 });
          succeeded++;
        } catch (error) {
          failed++;
        }
      }
      
      // Delete file if all events succeeded, otherwise restore
      if (failed === 0) {
        fs.unlinkSync(tempPath);
        console.log(`✅ Successfully processed and removed ${file}`);
      } else {
        fs.renameSync(tempPath, filepath);
        console.log(`⚠️  Partially processed ${file} (${failed} failures)`);
      }
    }
    
    return { succeeded, failed };
  }
}

/**
 * Circuit breaker pattern for handling repeated failures
 */
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private options = {
      failureThreshold: 5,
      recoveryTimeout: 60000, // 1 minute
      halfOpenRequests: 3
    }
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit should be reset
    if (this.state === 'open') {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure > this.options.recoveryTimeout) {
        console.log('🔌 Circuit breaker: Attempting recovery (half-open)');
        this.state = 'half-open';
        this.failures = 0;
      } else {
        throw new NexusError(
          'Circuit breaker is open - service unavailable',
          'CIRCUIT_OPEN',
          { 
            failureCount: this.failures,
            nextRetryIn: this.options.recoveryTimeout - timeSinceFailure 
          }
        );
      }
    }

    try {
      const result = await operation();
      
      if (this.state === 'half-open') {
        console.log('✅ Circuit breaker: Recovery successful (closed)');
        this.state = 'closed';
        this.failures = 0;
      }
      
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();
      
      if (this.failures >= this.options.failureThreshold) {
        console.error(`⚡ Circuit breaker opened after ${this.failures} failures`);
        this.state = 'open';
      }
      
      throw error;
    }
  }
  
  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    };
  }
}

/**
 * Demonstration functions
 */
async function demonstrateValidation() {
  console.log('🔍 Demonstrating Event Validation...\n');
  
  const invalidEvents = [
    { type: '' }, // Empty type
    { type: 'event with spaces' }, // Spaces in type
    { type: 'valid.event', timestamp: 'invalid-date' }, // Invalid timestamp
    { notType: 'missing-type' } // Missing type field
  ];
  
  for (const event of invalidEvents) {
    try {
      EventValidator.validate(event as NexusEvent);
      console.log(`✅ Valid: ${JSON.stringify(event)}`);
    } catch (error: any) {
      console.log(`❌ Invalid: ${error.message}`);
      if (error.details) {
        console.log(`   Details: ${JSON.stringify(error.details)}`);
      }
    }
  }
}

async function demonstrateRetryLogic() {
  console.log('\n⚡ Demonstrating Retry Logic...\n');
  
  // Simulate a flaky endpoint
  let attemptCount = 0;
  const flakyClient = new NexusClient({
    url: 'https://api.example.com/events',
    token: 'test-token',
    fetch: async (url, options) => {
      attemptCount++;
      if (attemptCount < 3) {
        throw new Error('fetch failed: Network error');
      }
      return new Response('OK', { status: 200 });
    }
  });
  
  // Override global client temporarily
  const originalSend = client.send.bind(client);
  client.send = flakyClient.send.bind(flakyClient);
  
  try {
    await sendWithRetry({
      type: 'test.event',
      message: 'This should succeed on the 3rd attempt'
    });
  } catch (error) {
    console.error('Failed even with retries:', error);
  } finally {
    client.send = originalSend;
  }
}

async function demonstrateCircuitBreaker() {
  console.log('\n🔌 Demonstrating Circuit Breaker...\n');
  
  const breaker = new CircuitBreaker({
    failureThreshold: 3,
    recoveryTimeout: 5000 // 5 seconds for demo
  });
  
  // Simulate failures
  for (let i = 0; i < 5; i++) {
    try {
      await breaker.execute(async () => {
        throw new Error('Service unavailable');
      });
    } catch (error: any) {
      console.log(`Attempt ${i + 1}: ${error.message}`);
      console.log(`Circuit state: ${JSON.stringify(breaker.getState())}`);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function demonstrateFailedEventStorage() {
  console.log('\n💾 Demonstrating Failed Event Storage...\n');
  
  const storage = new FailedEventStorage('./demo-failed-events');
  
  // Save some failed events
  const failedEvent = {
    type: 'important.metric',
    value: 42,
    timestamp: new Date().toISOString()
  };
  
  await storage.save(
    failedEvent,
    new NetworkError('Connection refused', { code: 'ECONNREFUSED' })
  );
  
  console.log('💾 Saved failed event to disk');
  
  // Try to retry failed events
  console.log('\n📤 Retrying failed events...');
  const results = await storage.retry();
  console.log(`Retry results: ${results.succeeded} succeeded, ${results.failed} failed`);
  
  // Cleanup
  try {
    fs.rmSync('./demo-failed-events', { recursive: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

/**
 * Main function combining all error handling patterns
 */
async function robustEventSending(event: NexusEvent): Promise<void> {
  const storage = new FailedEventStorage();
  const breaker = new CircuitBreaker();
  
  try {
    // Use circuit breaker to prevent overwhelming a failing service
    await breaker.execute(async () => {
      // Send with retry logic
      await sendWithRetry(event, {
        maxRetries: 3,
        shouldRetry: (error) => {
          // Custom retry logic
          if (error.code === 'VALIDATION_ERROR') return false;
          if (error.message?.includes('HTTP 401')) return false; // Don't retry auth errors
          return true;
        }
      });
    });
    
    console.log('✅ Event sent successfully');
  } catch (error: any) {
    console.error('❌ Failed to send event:', error.message);
    
    // Save to disk for later retry
    if (error.code !== 'VALIDATION_ERROR') {
      await storage.save(event, error);
      console.log('💾 Event saved for later retry');
    }
    
    // Re-throw for caller to handle
    throw error;
  }
}

/**
 * Main function to run all examples
 */
async function main() {
  console.log('🛡️  Nexus TypeScript Client - Error Handling Examples\n');
  
  await demonstrateValidation();
  await demonstrateRetryLogic();
  await demonstrateCircuitBreaker();
  await demonstrateFailedEventStorage();
  
  console.log('\n✨ All error handling examples completed!');
}

// Run the examples
if (require.main === module) {
  main().catch(console.error);
}

// Export utilities for use in other modules
export {
  EventValidator,
  sendWithRetry,
  FailedEventStorage,
  CircuitBreaker,
  robustEventSending,
  NexusError,
  ValidationError,
  NetworkError
};