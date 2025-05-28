# Nexus TypeScript Client Cookbook

This cookbook provides comprehensive examples and usage patterns for the Nexus TypeScript Client.

## Table of Contents

1. [Installation](#installation)
2. [Basic Usage](#basic-usage)
3. [Event Types and Structure](#event-types-and-structure)
4. [Batch Events](#batch-events)
5. [Error Handling](#error-handling)
6. [Custom Fetch Implementation](#custom-fetch-implementation)
7. [Analytics Tracking](#analytics-tracking)
8. [Edge Runtime Usage](#edge-runtime-usage)
9. [TypeScript Best Practices](#typescript-best-practices)
10. [Performance Considerations](#performance-considerations)

## Installation

```bash
npm install nexus-typescript-client
# or
yarn add nexus-typescript-client
# or
pnpm add nexus-typescript-client
```

## Basic Usage

### Simple Event Sending

```typescript
import { NexusClient } from 'nexus-typescript-client';

// Initialize the client
const client = new NexusClient({
  url: 'https://api.example.com/events',
  token: 'your-bearer-token'
});

// Send a single event
async function trackUserAction() {
  try {
    const response = await client.send({
      type: 'user.action',
      userId: 'user123',
      action: 'button_click',
      timestamp: new Date().toISOString()
    });
    
    console.log('Event sent successfully:', response.status);
  } catch (error) {
    console.error('Failed to send event:', error);
  }
}
```

### Environment Variables

```typescript
// Recommended: Use environment variables for configuration
const client = new NexusClient({
  url: process.env.NEXUS_ENDPOINT!,
  token: process.env.NEXUS_API_TOKEN!
});
```

## Event Types and Structure

### Basic Event Structure

```typescript
import { NexusEvent } from 'nexus-typescript-client';

// Minimum required structure
const minimalEvent: NexusEvent = {
  type: 'event.name'
};

// Common event patterns
const userEvent: NexusEvent = {
  type: 'user.signup',
  userId: 'user123',
  email: 'user@example.com',
  timestamp: Date.now(),
  metadata: {
    source: 'web',
    campaign: 'summer-2024'
  }
};

const systemEvent: NexusEvent = {
  type: 'system.health',
  service: 'api-gateway',
  status: 'healthy',
  metrics: {
    cpu: 45.2,
    memory: 78.1,
    requests_per_second: 1250
  }
};
```

### Custom Event Types

```typescript
// Define your own event types for better type safety
interface UserActionEvent extends NexusEvent {
  type: 'user.action';
  userId: string;
  action: string;
  metadata?: Record<string, any>;
}

interface OrderEvent extends NexusEvent {
  type: 'order.placed' | 'order.cancelled' | 'order.shipped';
  orderId: string;
  userId: string;
  amount: number;
  currency: string;
}

// Usage with custom types
const orderEvent: OrderEvent = {
  type: 'order.placed',
  orderId: 'order123',
  userId: 'user456',
  amount: 99.99,
  currency: 'USD'
};

await client.send(orderEvent);
```

## Batch Events

### Sending Multiple Events

```typescript
// Send multiple events in a single request
async function trackUserSession() {
  const sessionEvents: NexusEvent[] = [
    {
      type: 'session.start',
      sessionId: 'sess123',
      userId: 'user456',
      timestamp: new Date('2024-01-01T10:00:00Z').toISOString()
    },
    {
      type: 'page.view',
      sessionId: 'sess123',
      page: '/dashboard',
      timestamp: new Date('2024-01-01T10:00:05Z').toISOString()
    },
    {
      type: 'feature.used',
      sessionId: 'sess123',
      feature: 'export-data',
      timestamp: new Date('2024-01-01T10:02:00Z').toISOString()
    },
    {
      type: 'session.end',
      sessionId: 'sess123',
      duration: 180, // seconds
      timestamp: new Date('2024-01-01T10:03:00Z').toISOString()
    }
  ];

  try {
    const response = await client.send(sessionEvents);
    console.log(`Sent ${sessionEvents.length} events successfully`);
  } catch (error) {
    console.error('Failed to send session events:', error);
  }
}
```

### Batching Strategy

```typescript
class EventBatcher {
  private events: NexusEvent[] = [];
  private batchSize = 100;
  private flushInterval = 5000; // 5 seconds
  private timer: NodeJS.Timeout | null = null;

  constructor(private client: NexusClient) {
    this.startFlushTimer();
  }

  add(event: NexusEvent) {
    this.events.push(event);
    
    if (this.events.length >= this.batchSize) {
      this.flush();
    }
  }

  private startFlushTimer() {
    this.timer = setInterval(() => {
      if (this.events.length > 0) {
        this.flush();
      }
    }, this.flushInterval);
  }

  async flush() {
    if (this.events.length === 0) return;

    const eventsToSend = [...this.events];
    this.events = [];

    try {
      await this.client.send(eventsToSend);
      console.log(`Flushed ${eventsToSend.length} events`);
    } catch (error) {
      console.error('Failed to flush events:', error);
      // Optionally re-queue failed events
      this.events.unshift(...eventsToSend);
    }
  }

  destroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.flush();
  }
}

// Usage
const batcher = new EventBatcher(client);
batcher.add({ type: 'user.action', action: 'click' });
batcher.add({ type: 'page.view', page: '/home' });
// Events will be sent in batches
```

## Error Handling

### Comprehensive Error Handling

```typescript
import { NexusClient, NexusEvent } from 'nexus-typescript-client';

async function sendEventWithRetry(
  client: NexusClient,
  event: NexusEvent,
  maxRetries = 3
) {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.send(event);
      
      // Check response status
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      return response;
    } catch (error) {
      lastError = error as Error;
      console.error(`Attempt ${attempt} failed:`, error);
      
      // Don't retry on client errors (4xx)
      if (error instanceof Error && error.message.includes('HTTP 4')) {
        throw error;
      }
      
      // Exponential backoff
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

// Usage with error handling
async function trackEvent() {
  const client = new NexusClient({
    url: process.env.NEXUS_ENDPOINT!,
    token: process.env.NEXUS_API_TOKEN!
  });

  try {
    await sendEventWithRetry(client, {
      type: 'important.event',
      data: 'critical-data'
    });
  } catch (error) {
    // Log to fallback system
    console.error('Failed to send event after retries:', error);
    
    // Could write to local file or queue for later
    fs.appendFileSync('failed-events.log', JSON.stringify({
      timestamp: new Date().toISOString(),
      event: { type: 'important.event', data: 'critical-data' },
      error: error.message
    }) + '\n');
  }
}
```

### Validation Errors

```typescript
// The client validates required parameters
try {
  // This will throw an error - missing URL
  const client = new NexusClient({
    url: '',
    token: 'token123'
  });
} catch (error) {
  console.error('Invalid configuration:', error);
  // Error: Nexus client requires a valid URL
}

try {
  const client = new NexusClient({
    url: 'https://api.example.com',
    token: 'token123'
  });
  
  // This will throw an error - events must be an array or object
  await client.send(null as any);
} catch (error) {
  console.error('Invalid event:', error);
  // Error: Events must be an object or array of objects
}
```

## Custom Fetch Implementation

### Using with Node.js Fetch

```typescript
import { NexusClient } from 'nexus-typescript-client';
import fetch from 'node-fetch';

const client = new NexusClient({
  url: 'https://api.example.com/events',
  token: 'your-token',
  fetch: fetch as any // Type assertion needed for node-fetch
});
```

### Using with Axios

```typescript
import { NexusClient } from 'nexus-typescript-client';
import axios from 'axios';

// Create a fetch-compatible wrapper for axios
const axiosFetch: typeof fetch = async (url, options) => {
  try {
    const response = await axios({
      url: url as string,
      method: options?.method as any || 'GET',
      headers: options?.headers as any,
      data: options?.body
    });

    // Create a fetch-like response
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers as any),
      json: async () => response.data,
      text: async () => JSON.stringify(response.data),
      blob: async () => new Blob([JSON.stringify(response.data)]),
      arrayBuffer: async () => new ArrayBuffer(0),
      formData: async () => new FormData(),
      clone: () => ({ ...response } as any),
      body: null,
      bodyUsed: false,
      redirected: false,
      type: 'basic' as ResponseType,
      url: response.config.url!
    } as Response;
  } catch (error: any) {
    if (error.response) {
      // Return error response in fetch format
      return {
        ok: false,
        status: error.response.status,
        statusText: error.response.statusText,
        headers: new Headers(error.response.headers),
        json: async () => error.response.data,
        text: async () => JSON.stringify(error.response.data)
      } as Response;
    }
    throw error;
  }
};

const client = new NexusClient({
  url: 'https://api.example.com/events',
  token: 'your-token',
  fetch: axiosFetch
});
```

### Custom Headers and Timeout

```typescript
// Custom fetch with additional headers and timeout
const customFetch: typeof fetch = (url, options) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout

  return fetch(url, {
    ...options,
    signal: controller.signal,
    headers: {
      ...options?.headers,
      'X-Custom-Header': 'custom-value',
      'X-Request-ID': crypto.randomUUID()
    }
  }).finally(() => clearTimeout(timeout));
};

const client = new NexusClient({
  url: 'https://api.example.com/events',
  token: 'your-token',
  fetch: customFetch
});
```

## Analytics Tracking

### E-commerce Analytics

```typescript
class EcommerceTracker {
  constructor(private client: NexusClient) {}

  async trackProductView(productId: string, userId?: string) {
    return this.client.send({
      type: 'product.viewed',
      productId,
      userId,
      timestamp: new Date().toISOString(),
      context: {
        userAgent: navigator.userAgent,
        referrer: document.referrer,
        url: window.location.href
      }
    });
  }

  async trackAddToCart(productId: string, quantity: number, price: number, userId?: string) {
    return this.client.send({
      type: 'cart.item_added',
      productId,
      quantity,
      price,
      userId,
      timestamp: new Date().toISOString()
    });
  }

  async trackPurchase(order: {
    orderId: string;
    userId: string;
    items: Array<{ productId: string; quantity: number; price: number }>;
    total: number;
    tax: number;
    shipping: number;
  }) {
    const events: NexusEvent[] = [
      {
        type: 'order.completed',
        orderId: order.orderId,
        userId: order.userId,
        total: order.total,
        tax: order.tax,
        shipping: order.shipping,
        itemCount: order.items.length,
        timestamp: new Date().toISOString()
      },
      ...order.items.map(item => ({
        type: 'order.item' as const,
        orderId: order.orderId,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        timestamp: new Date().toISOString()
      }))
    ];

    return this.client.send(events);
  }
}

// Usage
const tracker = new EcommerceTracker(client);

// Track product view
await tracker.trackProductView('prod123', 'user456');

// Track add to cart
await tracker.trackAddToCart('prod123', 2, 29.99, 'user456');

// Track purchase
await tracker.trackPurchase({
  orderId: 'order789',
  userId: 'user456',
  items: [
    { productId: 'prod123', quantity: 2, price: 29.99 },
    { productId: 'prod456', quantity: 1, price: 49.99 }
  ],
  total: 109.97,
  tax: 10.00,
  shipping: 5.00
});
```

### User Behavior Analytics

```typescript
class UserAnalytics {
  private sessionId: string;
  private startTime: number;

  constructor(private client: NexusClient) {
    this.sessionId = this.generateSessionId();
    this.startTime = Date.now();
    this.trackSessionStart();
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async trackSessionStart() {
    await this.client.send({
      type: 'session.start',
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      context: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        viewport: `${window.innerWidth}x${window.innerHeight}`
      }
    });
  }

  async trackPageView(page: string, title?: string) {
    await this.client.send({
      type: 'page.view',
      sessionId: this.sessionId,
      page,
      title: title || document.title,
      timestamp: new Date().toISOString(),
      referrer: document.referrer
    });
  }

  async trackClick(element: string, value?: string) {
    await this.client.send({
      type: 'ui.click',
      sessionId: this.sessionId,
      element,
      value,
      timestamp: new Date().toISOString()
    });
  }

  async trackError(error: Error, context?: Record<string, any>) {
    await this.client.send({
      type: 'error.client',
      sessionId: this.sessionId,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      context,
      timestamp: new Date().toISOString()
    });
  }

  async endSession() {
    const duration = Date.now() - this.startTime;
    await this.client.send({
      type: 'session.end',
      sessionId: this.sessionId,
      duration: Math.floor(duration / 1000), // in seconds
      timestamp: new Date().toISOString()
    });
  }
}

// Usage
const analytics = new UserAnalytics(client);

// Track page views
analytics.trackPageView('/home');
analytics.trackPageView('/products', 'Our Products');

// Track interactions
document.getElementById('buy-button')?.addEventListener('click', () => {
  analytics.trackClick('buy-button', 'product-123');
});

// Track errors
window.addEventListener('error', (event) => {
  analytics.trackError(new Error(event.message), {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  });
});

// End session when user leaves
window.addEventListener('beforeunload', () => {
  analytics.endSession();
});
```

## Edge Runtime Usage

### Cloudflare Workers

```typescript
// worker.ts
import { NexusClient } from 'nexus-typescript-client';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const client = new NexusClient({
      url: env.NEXUS_ENDPOINT,
      token: env.NEXUS_TOKEN
    });

    try {
      // Track incoming request
      await client.send({
        type: 'edge.request',
        method: request.method,
        url: request.url,
        headers: Object.fromEntries(request.headers.entries()),
        timestamp: new Date().toISOString(),
        cf: request.cf // Cloudflare-specific data
      });

      // Your application logic here
      const response = new Response('Hello from Edge!');

      // Track response
      await client.send({
        type: 'edge.response',
        status: response.status,
        url: request.url,
        timestamp: new Date().toISOString()
      });

      return response;
    } catch (error) {
      console.error('Failed to track event:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
};

interface Env {
  NEXUS_ENDPOINT: string;
  NEXUS_TOKEN: string;
}
```

### Vercel Edge Functions

```typescript
// api/edge-function.ts
import { NexusClient } from 'nexus-typescript-client';

export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  const client = new NexusClient({
    url: process.env.NEXUS_ENDPOINT!,
    token: process.env.NEXUS_TOKEN!
  });

  const start = Date.now();

  try {
    // Track function invocation
    await client.send({
      type: 'function.invoked',
      function: 'edge-function',
      region: process.env.VERCEL_REGION,
      timestamp: new Date().toISOString()
    });

    // Your function logic
    const result = { message: 'Hello from Vercel Edge!' };

    // Track execution time
    await client.send({
      type: 'function.completed',
      function: 'edge-function',
      duration: Date.now() - start,
      timestamp: new Date().toISOString()
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    await client.send({
      type: 'function.error',
      function: 'edge-function',
      error: error.message,
      timestamp: new Date().toISOString()
    });

    return new Response('Function error', { status: 500 });
  }
}
```

## TypeScript Best Practices

### Type-Safe Event Factory

```typescript
// events.ts
type EventType = 
  | 'user.signup'
  | 'user.login'
  | 'user.logout'
  | 'order.placed'
  | 'order.shipped'
  | 'payment.processed';

interface BaseEvent<T extends EventType> extends NexusEvent {
  type: T;
  timestamp: string;
  version: '1.0';
}

interface UserEvent<T extends EventType> extends BaseEvent<T> {
  userId: string;
}

interface UserSignupEvent extends UserEvent<'user.signup'> {
  email: string;
  source: 'web' | 'mobile' | 'api';
}

interface OrderPlacedEvent extends UserEvent<'order.placed'> {
  orderId: string;
  amount: number;
  currency: string;
  items: Array<{
    productId: string;
    quantity: number;
    price: number;
  }>;
}

// Event factory with type safety
class EventFactory {
  private version = '1.0' as const;

  userSignup(data: Omit<UserSignupEvent, 'type' | 'timestamp' | 'version'>): UserSignupEvent {
    return {
      type: 'user.signup',
      timestamp: new Date().toISOString(),
      version: this.version,
      ...data
    };
  }

  orderPlaced(data: Omit<OrderPlacedEvent, 'type' | 'timestamp' | 'version'>): OrderPlacedEvent {
    return {
      type: 'order.placed',
      timestamp: new Date().toISOString(),
      version: this.version,
      ...data
    };
  }
}

// Usage with full type safety
const factory = new EventFactory();
const client = new NexusClient({ url: '...', token: '...' });

// TypeScript knows all required fields
const signupEvent = factory.userSignup({
  userId: 'user123',
  email: 'user@example.com',
  source: 'web'
});

await client.send(signupEvent);
```

### Generic Event Handler

```typescript
interface EventHandler<T extends NexusEvent> {
  canHandle(event: NexusEvent): event is T;
  handle(event: T): Promise<void>;
}

class UserSignupHandler implements EventHandler<UserSignupEvent> {
  canHandle(event: NexusEvent): event is UserSignupEvent {
    return event.type === 'user.signup';
  }

  async handle(event: UserSignupEvent): Promise<void> {
    console.log(`New user signup: ${event.email}`);
    // Send welcome email, create user record, etc.
  }
}

class EventProcessor {
  private handlers: EventHandler<any>[] = [];

  register(handler: EventHandler<any>) {
    this.handlers.push(handler);
  }

  async process(event: NexusEvent) {
    for (const handler of this.handlers) {
      if (handler.canHandle(event)) {
        await handler.handle(event);
      }
    }
  }
}

// Usage
const processor = new EventProcessor();
processor.register(new UserSignupHandler());
// processor.register(new OrderPlacedHandler());
// etc.
```

## Performance Considerations

### Connection Pooling

```typescript
// Singleton client for better connection reuse
class NexusClientManager {
  private static instance: NexusClient | null = null;

  static getInstance(): NexusClient {
    if (!this.instance) {
      this.instance = new NexusClient({
        url: process.env.NEXUS_ENDPOINT!,
        token: process.env.NEXUS_TOKEN!
      });
    }
    return this.instance;
  }
}

// Use throughout application
const client = NexusClientManager.getInstance();
```

### Event Queuing

```typescript
class EventQueue {
  private queue: NexusEvent[] = [];
  private processing = false;
  private maxBatchSize = 100;
  private flushInterval = 5000;

  constructor(private client: NexusClient) {
    // Auto-flush periodically
    setInterval(() => this.flush(), this.flushInterval);
  }

  async add(event: NexusEvent) {
    this.queue.push(event);
    
    // Process immediately if batch is full
    if (this.queue.length >= this.maxBatchSize) {
      await this.flush();
    }
  }

  async flush() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const batch = this.queue.splice(0, this.maxBatchSize);

    try {
      await this.client.send(batch);
      console.log(`Flushed ${batch.length} events`);
    } catch (error) {
      console.error('Failed to flush events:', error);
      // Re-queue failed events at the front
      this.queue.unshift(...batch);
    } finally {
      this.processing = false;
    }
  }
}
```

### Monitoring and Metrics

```typescript
class MonitoredNexusClient {
  private successCount = 0;
  private errorCount = 0;
  private totalDuration = 0;

  constructor(private client: NexusClient) {}

  async send(events: NexusEvent | NexusEvent[]): Promise<Response> {
    const start = Date.now();
    
    try {
      const response = await this.client.send(events);
      this.successCount++;
      this.totalDuration += Date.now() - start;
      return response;
    } catch (error) {
      this.errorCount++;
      this.totalDuration += Date.now() - start;
      throw error;
    }
  }

  getMetrics() {
    const total = this.successCount + this.errorCount;
    return {
      total,
      success: this.successCount,
      errors: this.errorCount,
      successRate: total > 0 ? this.successCount / total : 0,
      averageDuration: total > 0 ? this.totalDuration / total : 0
    };
  }
}
```

## Conclusion

The Nexus TypeScript Client provides a simple yet powerful way to send events to your analytics pipeline. By following the patterns in this cookbook, you can:

- Implement robust error handling and retries
- Create type-safe event definitions
- Optimize performance with batching and queuing
- Track complex user behaviors and business metrics
- Deploy to any JavaScript runtime environment

For more examples, check out the `demo/` directory in this repository.