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
Nexus client in typescript

## Installation

```bash
npm install nexus-typescript-client
```

## Usage

```ts
import { NexusClient } from 'nexus-typescript-client';

const client = new NexusClient({
  url: 'https://example.endpoint.dev/api',
  token: 'your-token'
});

await client.send({ type: 'event.name', data: 'example' });
```
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
