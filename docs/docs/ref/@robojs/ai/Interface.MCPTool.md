# Interface: MCPTool

Configuration for an MCP (Model Context Protocol) server tool.
MCP tools are server-side proxied by OpenAI, requiring no local execution logic.

## Extends

- `Record`\<`string`, `unknown`\>

## Properties

### allowed\_tools?

```ts
optional allowed_tools: string[];
```

Optional whitelist of tool names allowed from this server.

***

### headers?

```ts
optional headers: Record<string, string>;
```

Optional HTTP headers to include in MCP requests (e.g., API keys).

***

### require\_approval?

```ts
optional require_approval: "never" | "always";
```

Approval requirement for tool calls: 'never' (auto-approve) or 'always' (require approval).

***

### server\_label

```ts
server_label: string;
```

Human-readable label identifying the MCP server.

***

### server\_url

```ts
server_url: string;
```

Base URL of the MCP server endpoint.

***

### type

```ts
type: "mcp";
```

Tool type discriminator, must be 'mcp'.
