/**
 * Batch Events Example for Nexus TypeScript Client
 * 
 * This example demonstrates efficient patterns for sending multiple events
 * in batches, including automatic batching, queuing, and optimized sending.
 */

import { NexusClient, NexusEvent } from '../index';

// Configuration
const client = new NexusClient({
  url: process.env.NEXUS_ENDPOINT || 'https://api.example.com/events',
  token: process.env.NEXUS_TOKEN || 'your-api-token-here'
});

/**
 * Simple batch sending - send multiple events at once
 */
async function simpleBatchSend() {
  console.log('📦 Sending a simple batch of events...\n');
  
  const events: NexusEvent[] = [
    {
      type: 'session.start',
      sessionId: 'sess_001',
      userId: 'user_123',
      timestamp: new Date('2024-01-01T10:00:00Z').toISOString()
    },
    {
      type: 'page.view',
      sessionId: 'sess_001',
      page: '/dashboard',
      title: 'User Dashboard',
      timestamp: new Date('2024-01-01T10:00:05Z').toISOString()
    },
    {
      type: 'feature.used',
      sessionId: 'sess_001',
      feature: 'data-export',
      timestamp: new Date('2024-01-01T10:01:00Z').toISOString()
    },
    {
      type: 'api.call',
      sessionId: 'sess_001',
      endpoint: '/api/export',
      method: 'POST',
      timestamp: new Date('2024-01-01T10:01:01Z').toISOString()
    },
    {
      type: 'session.end',
      sessionId: 'sess_001',
      duration: 120, // seconds
      timestamp: new Date('2024-01-01T10:02:00Z').toISOString()
    }
  ];
  
  try {
    const response = await client.send(events);
    console.log(`✅ Sent ${events.length} events successfully`);
    console.log(`   Response status: ${response.status}\n`);
  } catch (error) {
    console.error('❌ Failed to send batch:', error);
  }
}

/**
 * Event Batcher - Automatically batch events based on size or time
 */
class EventBatcher {
  private events: NexusEvent[] = [];
  private batchSize: number;
  private flushInterval: number;
  private timer: NodeJS.Timeout | null = null;
  private stats = {
    batches: 0,
    totalEvents: 0,
    errors: 0
  };

  constructor(
    private client: NexusClient,
    options: { batchSize?: number; flushInterval?: number } = {}
  ) {
    this.batchSize = options.batchSize || 50;
    this.flushInterval = options.flushInterval || 5000; // 5 seconds
    this.startTimer();
  }

  add(event: NexusEvent): void {
    this.events.push(event);
    console.log(`📥 Added event (${this.events.length}/${this.batchSize}): ${event.type}`);
    
    if (this.events.length >= this.batchSize) {
      console.log('🔄 Batch size reached, flushing...');
      this.flush();
    }
  }

  private startTimer(): void {
    this.timer = setInterval(() => {
      if (this.events.length > 0) {
        console.log('⏰ Timer triggered, flushing events...');
        this.flush();
      }
    }, this.flushInterval);
  }

  async flush(): Promise<void> {
    if (this.events.length === 0) return;

    const eventsToSend = [...this.events];
    this.events = [];

    try {
      await this.client.send(eventsToSend);
      this.stats.batches++;
      this.stats.totalEvents += eventsToSend.length;
      console.log(`✅ Flushed batch #${this.stats.batches}: ${eventsToSend.length} events`);
    } catch (error) {
      this.stats.errors++;
      console.error(`❌ Failed to flush batch: ${error}`);
      // In production, you might want to retry or save to disk
      this.events.unshift(...eventsToSend); // Re-queue failed events
    }
  }

  getStats() {
    return {
      ...this.stats,
      pending: this.events.length,
      averageBatchSize: this.stats.batches > 0 
        ? Math.round(this.stats.totalEvents / this.stats.batches) 
        : 0
    };
  }

  async destroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
    }
    await this.flush();
    console.log('\n📊 Batcher Stats:', this.getStats());
  }
}

/**
 * Demonstrate the EventBatcher with simulated events
 */
async function demonstrateBatcher() {
  console.log('\n🚀 Demonstrating Event Batcher...\n');
  
  const batcher = new EventBatcher(client, {
    batchSize: 10,
    flushInterval: 3000 // 3 seconds
  });

  // Simulate events coming in at different rates
  const eventTypes = [
    'user.click', 'page.view', 'api.call', 'error.client', 
    'feature.used', 'form.submit', 'file.upload'
  ];

  // Add events rapidly (will trigger batch size flush)
  console.log('⚡ Rapid event generation...');
  for (let i = 0; i < 25; i++) {
    batcher.add({
      type: eventTypes[i % eventTypes.length],
      eventId: `evt_${i}`,
      timestamp: new Date().toISOString()
    });
    await new Promise(resolve => setTimeout(resolve, 100)); // 100ms between events
  }

  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Add events slowly (will trigger timer flush)
  console.log('\n🐌 Slow event generation...');
  for (let i = 25; i < 30; i++) {
    batcher.add({
      type: eventTypes[i % eventTypes.length],
      eventId: `evt_${i}`,
      timestamp: new Date().toISOString()
    });
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1s between events
  }

  // Cleanup
  await batcher.destroy();
}

/**
 * Priority Queue Batcher - Send high priority events immediately
 */
class PriorityEventBatcher {
  private normalQueue: NexusEvent[] = [];
  private highPriorityQueue: NexusEvent[] = [];
  private processing = false;

  constructor(
    private client: NexusClient,
    private options = {
      normalBatchSize: 50,
      highPriorityBatchSize: 10,
      flushInterval: 5000
    }
  ) {
    setInterval(() => this.processQueues(), options.flushInterval);
  }

  add(event: NexusEvent & { priority?: 'high' | 'normal' }): void {
    const priority = event.priority || 'normal';
    
    if (priority === 'high') {
      this.highPriorityQueue.push(event);
      console.log(`🔴 High priority event queued: ${event.type}`);
      
      if (this.highPriorityQueue.length >= this.options.highPriorityBatchSize) {
        this.processQueues();
      }
    } else {
      this.normalQueue.push(event);
      console.log(`🔵 Normal priority event queued: ${event.type}`);
      
      if (this.normalQueue.length >= this.options.normalBatchSize) {
        this.processQueues();
      }
    }
  }

  private async processQueues(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      // Process high priority events first
      if (this.highPriorityQueue.length > 0) {
        const events = this.highPriorityQueue.splice(0, this.options.highPriorityBatchSize);
        await this.client.send(events);
        console.log(`✅ Sent ${events.length} high priority events`);
      }

      // Then process normal priority events
      if (this.normalQueue.length > 0) {
        const events = this.normalQueue.splice(0, this.options.normalBatchSize);
        await this.client.send(events);
        console.log(`✅ Sent ${events.length} normal priority events`);
      }
    } catch (error) {
      console.error('❌ Failed to process queues:', error);
    } finally {
      this.processing = false;
    }
  }
}

/**
 * Demonstrate priority queue batching
 */
async function demonstratePriorityBatcher() {
  console.log('\n🎯 Demonstrating Priority Event Batcher...\n');
  
  const batcher = new PriorityEventBatcher(client, {
    normalBatchSize: 5,
    highPriorityBatchSize: 2,
    flushInterval: 3000
  });

  // Mix of normal and high priority events
  const events = [
    { type: 'user.login', userId: 'user1', priority: 'high' as const },
    { type: 'page.view', page: '/home' },
    { type: 'error.critical', message: 'Database connection lost', priority: 'high' as const },
    { type: 'button.click', button: 'submit' },
    { type: 'api.response', status: 200 },
    { type: 'payment.failed', amount: 99.99, priority: 'high' as const },
    { type: 'form.submit', form: 'contact' },
    { type: 'file.upload', size: 1024 }
  ];

  // Add events with random delays
  for (const event of events) {
    batcher.add({
      ...event,
      timestamp: new Date().toISOString()
    } as any);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Wait for final flush
  await new Promise(resolve => setTimeout(resolve, 4000));
}

/**
 * Main function to run all examples
 */
async function main() {
  console.log('🎪 Nexus TypeScript Client - Batch Events Examples\n');
  
  // Run examples
  await simpleBatchSend();
  await demonstrateBatcher();
  await demonstratePriorityBatcher();
  
  console.log('\n✨ All batch examples completed!');
}

// Run the examples
if (require.main === module) {
  main().catch(console.error);
}

// Export classes and functions for use in other modules
export {
  EventBatcher,
  PriorityEventBatcher,
  simpleBatchSend,
  demonstrateBatcher,
  demonstratePriorityBatcher
};