<file name=LICENSE>
MIT License

Copyright (c) 2024 Jon Zhu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
</file>

<file name=index.ts>export class NexusClient {
  url: string;
  token: string;

  constructor(config: { url: string; token: string }) {
    this.url = config.url;
    this.token = config.token;
  }

  async send(event: { type: string; data: any }): Promise<void> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      throw new Error(`Failed to send event: ${response.statusText}`);
    }
  }
}
</file>

<file name=package.json>{
  "name": "nexus-typescript-client",
  "version": "0.1.0",
  "description": "A lightweight TypeScript client for sending events to a Nexus pipeline endpoint.",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/nexus-typescript-client"
  },
  "author": "Jon Zhu",
  "license": "MIT",
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
</file>

<file name=README.md># nexus-typescript-client

A lightweight and secure TypeScript client for sending events to a Nexus event pipeline endpoint.

## Features

- 🚀 Lightweight with zero dependencies
- 📦 Full TypeScript support with type definitions
- 🔄 Support for single and batch event sending
- 🔌 Custom fetch implementation support
- 🛡️ Built-in error handling and validation
- 🌐 Compatible with Node.js, browsers, and edge runtimes (Cloudflare Workers)

## Installation

```bash
npm install nexus-typescript-client
```

## Usage

### Basic Usage

```typescript
import { NexusClient } from 'nexus-typescript-client';

// Initialize the client
const client = new NexusClient({
  url: 'https://your-nexus-endpoint.com/api',
  token: 'your-api-token'
});

// Send a single event
await client.send({
  type: 'user.signup',
  userId: '12345',
  email: 'user@example.com',
  timestamp: new Date().toISOString()
});
```

### Batch Events

```typescript
// Send multiple events at once
await client.send([
  { type: 'page.view', path: '/home', sessionId: 'abc123' },
  { type: 'button.click', element: 'cta-signup', sessionId: 'abc123' },
  { type: 'form.submit', formId: 'newsletter', sessionId: 'abc123' }
]);
```

### Custom Fetch Implementation

```typescript
// Use a custom fetch implementation (e.g., for Node.js < 18)
import fetch from 'node-fetch';

const client = new NexusClient({
  url: 'https://your-nexus-endpoint.com/api',
  token: 'your-api-token',
  fetch: fetch as any
});
```

### Error Handling

```typescript
try {
  await client.send({ type: 'event.type', data: 'value' });
} catch (error) {
  console.error('Failed to send event:', error.message);
  // Error includes status code and response body for debugging
}
```

## API Reference

### `NexusClient`

#### Constructor Options

```typescript
interface NexusClientOptions {
  url: string;      // The Nexus endpoint URL
  token: string;    // Bearer token for authentication
  fetch?: typeof fetch; // Optional custom fetch implementation
}
```

#### Methods

##### `send(events: NexusEvent | NexusEvent[]): Promise<Response>`

Sends one or more events to the Nexus endpoint.

- **Parameters:**
  - `events`: A single event object or an array of events
- **Returns:** Promise resolving to the fetch Response object
- **Throws:** Error if the request fails or returns non-2xx status

### `NexusEvent`

```typescript
interface NexusEvent {
  type: string;     // Required event type identifier
  [key: string]: any; // Additional event properties
}
```

## Requirements

- Node.js >= 14 (or any environment with fetch API support)
- TypeScript >= 5.0 (for development)

## License

MIT License - see [LICENSE](./LICENSE) file for details

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and feature requests, please visit the [GitHub repository](https://github.com/suparena/nexus-typescript-client).
</file>

<file name=tsconfig.json>{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["index.ts"]
}
</file>

<file name=.npmignore>src/
*.ts
tsconfig.json
</file>
