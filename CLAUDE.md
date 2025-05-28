# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Build and Development
```bash
npm run build      # Compile TypeScript to JavaScript (dist/)
npm run prepare    # Auto-runs build (triggered by npm install)
```

### Testing
```bash
npm test              # Run all tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

### Publishing
```bash
npm run prepublishOnly  # Runs build before publishing to npm
npm publish            # Publish to npm registry
```

### Current Limitations
- No linting or formatting tools configured
- No development server or watch mode

## Architecture

### Core Implementation
The entire client is implemented in a single file (`index.ts`) containing:
- `NexusClient` class: Main client for sending events to a Nexus endpoint
- `NexusEvent` interface: Base event structure with required `type` field and flexible properties
- `NexusClientOptions` interface: Configuration for URL, bearer token, and optional custom fetch

### Key Design Decisions
1. **Zero runtime dependencies**: The client has no production dependencies, making it lightweight and compatible with any JavaScript environment
2. **Fetch flexibility**: Accepts custom fetch implementation, enabling use in Node.js, browsers, and edge runtimes
3. **Simple API**: Single `send()` method handles both individual events and batches
4. **TypeScript-first**: Full type definitions with strict mode enabled

### Build Output
- TypeScript compiles to CommonJS modules in `dist/`
- Generates type declaration files (`.d.ts`) for TypeScript consumers
- Targets ES2020 for modern JavaScript features

## Development Patterns

### Event Structure
Events must have a `type` field (string) and can include any additional properties:
```typescript
interface NexusEvent {
  type: string;
  [key: string]: any;
}
```

### Error Handling
The client validates inputs and provides detailed error messages for:
- Missing or invalid URL/token
- Invalid event structure
- Network failures

### Demo Organization
The `demo/` directory contains standalone examples demonstrating:
- `basic-usage.ts`: Simple event sending
- `batch-events.ts`: Batch sending and queuing strategies
- `error-handling.ts`: Retry logic, circuit breakers, fallback storage
- `custom-fetch.ts`: Custom fetch implementations
- `analytics-tracking.ts`: Real-world analytics patterns
- `edge-runtime.ts`: Edge computing platform examples