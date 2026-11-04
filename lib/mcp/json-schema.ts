import { z } from 'zod';

/**
 * Zod → JSON Schema for MCP tool `inputSchema`s.
 *
 * Small on purpose: it covers exactly the zod types the tool definitions use,
 * and THROWS on anything else, so a tool written with an unsupported type fails
 * the unit test (tests/unit/mcp-server.test.ts renders every tool's schema)
 * instead of advertising a schema that silently says nothing. One zod schema is
 * both the validator and the advertised contract — they cannot drift.
 *
 * (zod-to-json-schema would do this, but the MCP SDK and it both require zod
 * ^3.25 and this app is on 3.24; a dependency bump across every form in the app
 * is not a fair price for ~80 lines.)
 */
type JsonSchema = Record<string, unknown>;

export function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  const out = convert(schema);
  return out;
}

function withDescription(schema: z.ZodTypeAny, out: JsonSchema): JsonSchema {
  const description = schema._def.description as string | undefined;
  return description ? { ...out, description } : out;
}

function convert(schema: z.ZodTypeAny): JsonSchema {
  const def = schema._def as { typeName: z.ZodFirstPartyTypeKind } & Record<string, any>;
  switch (def.typeName) {
    case z.ZodFirstPartyTypeKind.ZodObject: {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = convert(value as z.ZodTypeAny);
        if (!(value as z.ZodTypeAny).isOptional()) required.push(key);
      }
      return withDescription(schema, {
        type: 'object',
        properties,
        ...(required.length ? { required } : {}),
        additionalProperties: false,
      });
    }
    case z.ZodFirstPartyTypeKind.ZodString: {
      const out: JsonSchema = { type: 'string' };
      for (const check of def.checks as { kind: string; value?: number }[]) {
        if (check.kind === 'min') out.minLength = check.value;
        if (check.kind === 'max') out.maxLength = check.value;
        if (check.kind === 'url') out.format = 'uri';
        if (check.kind === 'email') out.format = 'email';
      }
      return withDescription(schema, out);
    }
    case z.ZodFirstPartyTypeKind.ZodNumber: {
      const out: JsonSchema = { type: 'number' };
      for (const check of def.checks as { kind: string; value?: number; inclusive?: boolean }[]) {
        if (check.kind === 'int') out.type = 'integer';
        if (check.kind === 'min') out[check.inclusive ? 'minimum' : 'exclusiveMinimum'] = check.value;
        if (check.kind === 'max') out[check.inclusive ? 'maximum' : 'exclusiveMaximum'] = check.value;
      }
      return withDescription(schema, out);
    }
    case z.ZodFirstPartyTypeKind.ZodBoolean:
      return withDescription(schema, { type: 'boolean' });
    case z.ZodFirstPartyTypeKind.ZodEnum:
      return withDescription(schema, { type: 'string', enum: [...def.values] });
    case z.ZodFirstPartyTypeKind.ZodLiteral:
      return withDescription(schema, { const: def.value });
    case z.ZodFirstPartyTypeKind.ZodArray: {
      const out: JsonSchema = { type: 'array', items: convert(def.type) };
      if (def.minLength) out.minItems = def.minLength.value;
      if (def.maxLength) out.maxItems = def.maxLength.value;
      return withDescription(schema, out);
    }
    case z.ZodFirstPartyTypeKind.ZodOptional:
    case z.ZodFirstPartyTypeKind.ZodNullable: {
      const inner = convert(def.innerType);
      return withDescription(schema, inner);
    }
    case z.ZodFirstPartyTypeKind.ZodDefault: {
      const inner = convert(def.innerType);
      return withDescription(schema, { ...inner, default: def.defaultValue() });
    }
    case z.ZodFirstPartyTypeKind.ZodEffects:
      return withDescription(schema, convert(def.schema));
    default:
      throw new Error(`zodToJsonSchema: unsupported zod type ${def.typeName}`);
  }
}
