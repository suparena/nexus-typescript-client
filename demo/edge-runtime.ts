/**
 * Edge Runtime Example for Nexus TypeScript Client
 * 
 * This example demonstrates how to use the Nexus client in edge runtime
 * environments like Cloudflare Workers, Vercel Edge Functions, and Deno Deploy.
 */

import { NexusClient, NexusEvent } from '../index';

/**
 * Cloudflare Workers Example
 * 
 * Deploy this as a Cloudflare Worker to track edge requests and responses
 */
export const cloudflareWorker = {
  async fetch(
    request: Request,
    env: { NEXUS_ENDPOINT: string; NEXUS_TOKEN: string },
    ctx: { waitUntil: (promise: Promise<any>) => void }
  ): Promise<Response> {
    const client = new NexusClient({
      url: env.NEXUS_ENDPOINT,
      token: env.NEXUS_TOKEN
    });

    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    // Track incoming request
    const requestEvent: NexusEvent = {
      type: 'edge.request',
      requestId,
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers.entries()),
      cf: request.cf, // Cloudflare-specific data
      timestamp: new Date().toISOString()
    };

    // Use waitUntil to ensure events are sent even after response
    ctx.waitUntil(client.send(requestEvent));

    try {
      // Your application logic here
      const response = await handleRequest(request);
      
      // Track response
      const responseEvent: NexusEvent = {
        type: 'edge.response',
        requestId,
        status: response.status,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
      
      ctx.waitUntil(client.send(responseEvent));
      
      return response;
    } catch (error: any) {
      // Track errors
      const errorEvent: NexusEvent = {
        type: 'edge.error',
        requestId,
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        },
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
      
      ctx.waitUntil(client.send(errorEvent));
      
      return new Response('Internal Server Error', { status: 500 });
    }
  }
};

// Helper function for Cloudflare Workers
async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  
  switch (url.pathname) {
    case '/':
      return new Response('Hello from Cloudflare Workers!', {
        headers: { 'content-type': 'text/plain' }
      });
    case '/api/data':
      return new Response(JSON.stringify({ data: 'example' }), {
        headers: { 'content-type': 'application/json' }
      });
    default:
      return new Response('Not Found', { status: 404 });
  }
}

/**
 * Vercel Edge Function Example
 * 
 * Deploy this as a Vercel Edge Function
 */
export const vercelEdgeFunction = async (request: Request): Promise<Response> => {
  const client = new NexusClient({
    url: process.env.NEXUS_ENDPOINT!,
    token: process.env.NEXUS_TOKEN!
  });

  const functionStart = Date.now();
  const region = process.env.VERCEL_REGION || 'unknown';
  
  try {
    // Track function invocation
    await client.send({
      type: 'function.invoked',
      function: 'api-edge',
      region,
      url: request.url,
      method: request.method,
      timestamp: new Date().toISOString()
    });

    // Parse request body if present
    let body = null;
    if (request.method === 'POST' && request.body) {
      body = await request.json();
    }

    // Your function logic
    const result = await processRequest(body);

    // Track successful execution
    await client.send({
      type: 'function.success',
      function: 'api-edge',
      region,
      duration: Date.now() - functionStart,
      timestamp: new Date().toISOString()
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-region': region,
        'x-duration': String(Date.now() - functionStart)
      }
    });
  } catch (error: any) {
    // Track function errors
    await client.send({
      type: 'function.error',
      function: 'api-edge',
      region,
      error: {
        message: error.message,
        type: error.constructor.name
      },
      duration: Date.now() - functionStart,
      timestamp: new Date().toISOString()
    });

    return new Response(
      JSON.stringify({ error: 'Internal Server Error' }),
      { 
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
};

// Helper for Vercel Edge Function
async function processRequest(body: any): Promise<any> {
  // Simulate some processing
  await new Promise(resolve => setTimeout(resolve, 100));
  
  return {
    message: 'Processed successfully',
    timestamp: new Date().toISOString(),
    input: body
  };
}

/**
 * Deno Deploy Example
 * 
 * Deploy this to Deno Deploy for edge computing with Deno
 */
export function createDenoHandler() {
  const client = new NexusClient({
    url: Deno.env.get('NEXUS_ENDPOINT')!,
    token: Deno.env.get('NEXUS_TOKEN')!
  });

  return async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    
    // Track request geolocation (Deno Deploy provides this)
    await client.send({
      type: 'deno.request',
      requestId,
      path: url.pathname,
      method: request.method,
      country: request.headers.get('cf-ipcountry') || 'unknown',
      timestamp: new Date().toISOString()
    });

    // Route handling
    if (url.pathname === '/metrics') {
      const metrics = await getSystemMetrics();
      
      await client.send({
        type: 'deno.metrics',
        metrics,
        timestamp: new Date().toISOString()
      });

      return new Response(JSON.stringify(metrics), {
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response('Hello from Deno Deploy!', {
      headers: { 'content-type': 'text/plain' }
    });
  };
}

// Helper for Deno Deploy
async function getSystemMetrics() {
  return {
    memory: Deno.memoryUsage(),
    runtime: {
      version: Deno.version.deno,
      v8: Deno.version.v8,
      typescript: Deno.version.typescript
    }
  };
}

/**
 * Generic Edge Runtime Tracker
 * 
 * Works across different edge runtime environments
 */
export class EdgeRuntimeTracker {
  private client: NexusClient;
  private runtime: string;

  constructor(config: { url: string; token: string }) {
    this.client = new NexusClient(config);
    this.runtime = this.detectRuntime();
  }

  private detectRuntime(): string {
    // @ts-ignore - Check for Cloudflare Workers
    if (typeof caches !== 'undefined' && typeof caches.default !== 'undefined') {
      return 'cloudflare-workers';
    }
    
    // Check for Deno
    if (typeof Deno !== 'undefined') {
      return 'deno';
    }
    
    // Check for Vercel Edge
    if (process.env.VERCEL_REGION) {
      return 'vercel-edge';
    }
    
    // Check for other environments
    if (typeof EdgeRuntime !== 'undefined') {
      return 'edge-runtime';
    }
    
    return 'unknown';
  }

  async trackRequest(request: Request): Promise<string> {
    const requestId = crypto.randomUUID();
    
    await this.client.send({
      type: 'edge.request.received',
      requestId,
      runtime: this.runtime,
      method: request.method,
      url: request.url,
      headers: this.sanitizeHeaders(request.headers),
      timestamp: new Date().toISOString()
    });
    
    return requestId;
  }

  async trackResponse(requestId: string, response: Response, duration: number): Promise<void> {
    await this.client.send({
      type: 'edge.response.sent',
      requestId,
      runtime: this.runtime,
      status: response.status,
      duration,
      headers: this.sanitizeHeaders(response.headers),
      timestamp: new Date().toISOString()
    });
  }

  async trackCacheHit(key: string, hit: boolean): Promise<void> {
    await this.client.send({
      type: 'edge.cache',
      runtime: this.runtime,
      key,
      hit,
      timestamp: new Date().toISOString()
    });
  }

  async trackKVOperation(operation: 'get' | 'put' | 'delete', key: string, duration: number): Promise<void> {
    await this.client.send({
      type: 'edge.kv',
      runtime: this.runtime,
      operation,
      key,
      duration,
      timestamp: new Date().toISOString()
    });
  }

  private sanitizeHeaders(headers: Headers): Record<string, string> {
    const sanitized: Record<string, string> = {};
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
    
    headers.forEach((value, key) => {
      if (sensitiveHeaders.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    });
    
    return sanitized;
  }
}

/**
 * Edge Caching Strategy Example
 */
export class EdgeCacheTracker {
  constructor(
    private client: NexusClient,
    private cache: Cache
  ) {}

  async get(request: Request): Promise<Response | undefined> {
    const start = Date.now();
    const response = await this.cache.match(request);
    const hit = !!response;
    
    await this.client.send({
      type: 'cache.access',
      url: request.url,
      hit,
      duration: Date.now() - start,
      timestamp: new Date().toISOString()
    });
    
    if (hit) {
      console.log(`✅ Cache hit: ${request.url}`);
    } else {
      console.log(`❌ Cache miss: ${request.url}`);
    }
    
    return response;
  }

  async put(request: Request, response: Response): Promise<void> {
    const start = Date.now();
    await this.cache.put(request, response.clone());
    
    await this.client.send({
      type: 'cache.write',
      url: request.url,
      duration: Date.now() - start,
      size: response.headers.get('content-length') || 'unknown',
      timestamp: new Date().toISOString()
    });
    
    console.log(`💾 Cached: ${request.url}`);
  }
}

/**
 * Example: Complete Edge Application with Analytics
 */
export async function edgeApplicationExample(request: Request): Promise<Response> {
  // Initialize services
  const tracker = new EdgeRuntimeTracker({
    url: process.env.NEXUS_ENDPOINT!,
    token: process.env.NEXUS_TOKEN!
  });
  
  const cache = caches.default;
  const cacheTracker = new EdgeCacheTracker(
    new NexusClient({
      url: process.env.NEXUS_ENDPOINT!,
      token: process.env.NEXUS_TOKEN!
    }),
    cache
  );

  const startTime = Date.now();
  const requestId = await tracker.trackRequest(request);

  try {
    // Check cache first
    const cachedResponse = await cacheTracker.get(request);
    if (cachedResponse) {
      await tracker.trackResponse(requestId, cachedResponse, Date.now() - startTime);
      return cachedResponse;
    }

    // Process request
    const response = await handleEdgeRequest(request);

    // Cache successful responses
    if (response.status === 200) {
      await cacheTracker.put(request, response);
    }

    // Track response
    await tracker.trackResponse(requestId, response, Date.now() - startTime);

    return response;
  } catch (error: any) {
    // Create error response
    const errorResponse = new Response(
      JSON.stringify({ error: 'Internal Server Error' }),
      { 
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );

    await tracker.trackResponse(requestId, errorResponse, Date.now() - startTime);
    
    return errorResponse;
  }
}

// Helper for edge application
async function handleEdgeRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  
  // Simulate API endpoints
  if (url.pathname.startsWith('/api/')) {
    const data = {
      endpoint: url.pathname,
      timestamp: new Date().toISOString(),
      region: process.env.VERCEL_REGION || 'edge'
    };
    
    return new Response(JSON.stringify(data), {
      headers: { 
        'content-type': 'application/json',
        'cache-control': 'public, max-age=60'
      }
    });
  }
  
  return new Response('Edge Runtime Example', {
    headers: { 'content-type': 'text/plain' }
  });
}

/**
 * Example: Monitoring Edge Function Performance
 */
export function createPerformanceMonitor(client: NexusClient) {
  return async function monitor<T>(
    name: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = Date.now();
    const memoryBefore = performance.memory?.usedJSHeapSize;
    
    try {
      const result = await fn();
      const duration = Date.now() - start;
      const memoryAfter = performance.memory?.usedJSHeapSize;
      
      await client.send({
        type: 'edge.performance',
        function: name,
        duration,
        memory: memoryAfter && memoryBefore ? {
          before: memoryBefore,
          after: memoryAfter,
          delta: memoryAfter - memoryBefore
        } : null,
        success: true,
        timestamp: new Date().toISOString()
      });
      
      return result;
    } catch (error: any) {
      const duration = Date.now() - start;
      
      await client.send({
        type: 'edge.performance',
        function: name,
        duration,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      throw error;
    }
  };
}

// Usage example for performance monitoring
export async function monitoredEdgeFunction(request: Request): Promise<Response> {
  const client = new NexusClient({
    url: process.env.NEXUS_ENDPOINT!,
    token: process.env.NEXUS_TOKEN!
  });
  
  const monitor = createPerformanceMonitor(client);
  
  // Monitor different operations
  const data = await monitor('fetchData', async () => {
    // Simulate data fetching
    await new Promise(r => setTimeout(r, 100));
    return { users: 100, orders: 250 };
  });
  
  const processed = await monitor('processData', async () => {
    // Simulate data processing
    return {
      ...data,
      calculated: data.users * data.orders
    };
  });
  
  const response = await monitor('createResponse', async () => {
    return new Response(JSON.stringify(processed), {
      headers: { 'content-type': 'application/json' }
    });
  });
  
  return response;
}

/**
 * Configuration for different edge platforms
 */
export const edgeConfigs = {
  cloudflare: {
    // wrangler.toml configuration
    example: `
[vars]
NEXUS_ENDPOINT = "https://api.nexus.com/events"

[secrets]
NEXUS_TOKEN
    `
  },
  vercel: {
    // vercel.json configuration
    example: {
      "functions": {
        "api/edge/*.ts": {
          "runtime": "edge"
        }
      },
      "env": {
        "NEXUS_ENDPOINT": "https://api.nexus.com/events"
      }
    }
  },
  deno: {
    // Deno Deploy configuration
    example: `
// Set environment variables in Deno Deploy dashboard
// or use .env file locally with --allow-env flag
    `
  }
};

console.log('🌐 Nexus TypeScript Client - Edge Runtime Examples');
console.log('Deploy these examples to your preferred edge platform!');