/**
 * Basic Usage Example for Nexus TypeScript Client
 * 
 * This example demonstrates the fundamental usage patterns for sending
 * events to a Nexus endpoint using the TypeScript client.
 */

import { NexusClient, NexusEvent } from '../index';

// Configuration - in production, use environment variables
const NEXUS_ENDPOINT = process.env.NEXUS_ENDPOINT || 'https://api.example.com/events';
const NEXUS_TOKEN = process.env.NEXUS_TOKEN || 'your-api-token-here';

// Initialize the client
const client = new NexusClient({
  url: NEXUS_ENDPOINT,
  token: NEXUS_TOKEN
});

// Example 1: Send a simple event
async function sendSimpleEvent() {
  console.log('Sending a simple event...');
  
  try {
    const response = await client.send({
      type: 'test.event',
      message: 'Hello from Nexus TypeScript Client!'
    });
    
    console.log('✅ Event sent successfully:', response.status);
  } catch (error) {
    console.error('❌ Failed to send event:', error);
  }
}

// Example 2: Send a user action event with metadata
async function trackUserAction(userId: string, action: string) {
  console.log(`\nTracking user action: ${action} for user ${userId}`);
  
  const event: NexusEvent = {
    type: 'user.action',
    userId,
    action,
    timestamp: new Date().toISOString(),
    metadata: {
      platform: 'web',
      version: '1.0.0',
      sessionId: 'sess_' + Math.random().toString(36).substr(2, 9)
    }
  };
  
  try {
    const response = await client.send(event);
    console.log('✅ User action tracked:', response.status);
  } catch (error) {
    console.error('❌ Failed to track user action:', error);
  }
}

// Example 3: Send system metrics
async function sendSystemMetrics() {
  console.log('\nSending system metrics...');
  
  const metrics: NexusEvent = {
    type: 'system.metrics',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    metrics: {
      cpu_usage: Math.random() * 100,
      memory_usage: Math.random() * 100,
      active_connections: Math.floor(Math.random() * 1000),
      requests_per_second: Math.floor(Math.random() * 5000)
    },
    host: {
      name: 'server-01',
      region: 'us-east-1',
      environment: 'production'
    }
  };
  
  try {
    const response = await client.send(metrics);
    console.log('✅ System metrics sent:', response.status);
  } catch (error) {
    console.error('❌ Failed to send metrics:', error);
  }
}

// Example 4: Send multiple events at once
async function sendBatchEvents() {
  console.log('\nSending batch of events...');
  
  const events: NexusEvent[] = [
    {
      type: 'page.view',
      page: '/home',
      timestamp: new Date().toISOString()
    },
    {
      type: 'page.view',
      page: '/products',
      timestamp: new Date(Date.now() + 1000).toISOString()
    },
    {
      type: 'button.click',
      button: 'add-to-cart',
      timestamp: new Date(Date.now() + 2000).toISOString()
    }
  ];
  
  try {
    const response = await client.send(events);
    console.log(`✅ Batch of ${events.length} events sent:`, response.status);
  } catch (error) {
    console.error('❌ Failed to send batch events:', error);
  }
}

// Main function to run all examples
async function main() {
  console.log('🚀 Nexus TypeScript Client - Basic Usage Examples\n');
  
  // Run all examples
  await sendSimpleEvent();
  await trackUserAction('user123', 'login');
  await sendSystemMetrics();
  await sendBatchEvents();
  
  console.log('\n✨ All examples completed!');
}

// Run the examples
if (require.main === module) {
  main().catch(console.error);
}

// Export functions for use in other modules
export {
  sendSimpleEvent,
  trackUserAction,
  sendSystemMetrics,
  sendBatchEvents
};