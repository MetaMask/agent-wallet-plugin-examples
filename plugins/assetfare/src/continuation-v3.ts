import { createHash } from "node:crypto";

const VERSION = "assetfare-quote-bound-continuation-v3";
const OPENAPI_URL = "https://api.assetfare.dev/v2/openapi";
const QUOTE_PAYLOAD_SHA256_SPEC = "sha256(AssetFare typed-canonical-v1 bytes of the quote without continuation_v3 after exact base-unit substitution: n=null; t/f=boolean; d=<IEEE-754 binary64 big-endian 16 lowercase hex> for each finite JSON number; s=<UTF-8 byte length>:<Unicode scalar text with lone surrogates forbidden>; a=<count>:[items]; o=<count>:{UTF-8-byte-sorted string-key/value pairs}; every non-substituted integral JSON number must be within +/-9007199254740991; substituted paths are intent.estimated_input_base, route.input_base, route.expected_output_base, route.minimum_output_base, and every route.steps[i].expected_input_base/floor_input_base/expected_output_base/minimum_output_base from direct_route_summary exact decimal strings)";
const HASH = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHAINS = new Set(["arbitrum", "base", "optimism", "polygon", "robinhood", "solana"]);
const KEYS = [
  "version", "enforcement", "selection_status", "automatic_selection_forbidden",
  "caller_approved_boolean_is_not_human_proof", "quote_id", "quote_fingerprint",
  "quote_fingerprint_spec", "quote_fingerprint_claim", "issued_at", "expires_at",
  "ttl_seconds", "intent", "direct_route_summary_sha256", "quote_payload_sha256", "quote_payload_sha256_spec",
  "input_base_bounds", "minimum_output_base", "required_wallet_chains",
  "event_signer_public_required", "step_count", "recommended_mode", "allowed_modes",
  "session_header", "idempotency", "approval_v3_required_fields",
  "legacy_handoff_enforcement", "server_signing", "server_submission",
] as const;
const CLAIM_KEYS = [
  "version", "quote_id", "issued_at", "expires_at", "ttl_seconds", "intent",
  "direct_route_summary_sha256", "quote_payload_sha256", "quote_payload_sha256_spec", "input_base_bounds",
  "minimum_output_base", "required_wallet_chains", "event_signer_public_required",
  "step_count", "allowed_modes", "server_signing", "server_submission",
] as const;
const BOUNDS_KEYS = ["minimum", "maximum"] as const;
const CLAIM_INTENT_KEYS = ["from", "to", "amount_usd_decimal", "estimated_input_base"] as const;
const SESSION_HEADER_KEYS = [
  "name", "required_for", "caller_generated", "minimum_entropy_bits", "server_returns_raw_value",
] as const;
const IDEMPOTENCY_KEYS = ["required", "field", "pattern", "scope"] as const;
const APPROVAL_FIELDS = [
  "direct_route_summary_sha256", "idempotency_key", "maximum_input_base",
  "minimum_output_base", "quote_fingerprint", "quote_id", "selected_mode",
  "selection_status", "version",
];

type JsonRecord = Record<string, unknown>;

export type ContinuationDescriptor = {
  version: "assetfare-quote-bound-continuation-v3";
  quote_id: string;
  quote_fingerprint: string;
  expires_at: string;
  ttl_seconds: number;
  selection_status: "unranked_candidate";
  required_wallet_chains: string[];
  event_signer_public_required: boolean;
  allowed_modes: Array<"one_shot" | "session">;
  recommended_mode: "session" | "one_shot_or_session";
  openapi_url: "https://api.assetfare.dev/v2/openapi";
  legacy_handoff_enforcement: "legacy_advisory";
  automatic_selection_forbidden: true;
  caller_approved_boolean_is_not_human_proof: true;
  wallet_collection_performed: false;
  approval_v3_generated: false;
  prepare_calls: 0;
  session_calls: 0;
  server_signing: false;
  server_submission: false;
};

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function exactKeys(value: JsonRecord | undefined, expected: readonly string[]): value is JsonRecord {
  if (!value) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function exactArray(value: unknown, expected: readonly unknown[]): boolean {
  return Array.isArray(value) && value.length === expected.length && value.every((item, index) => item === expected[index]);
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as JsonRecord;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}

function decimalString(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const source = String(value);
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(source);
  if (!match) return undefined;
  const negative = match[1] === "-";
  const whole = match[2];
  const fraction = match[3] || "";
  const exponent = Number(match[4] || 0);
  let digits = whole + fraction;
  let point = whole.length + exponent;
  if (point <= 0) {
    digits = "0".repeat(-point) + digits;
    point = 0;
  }
  if (point >= digits.length) digits += "0".repeat(point - digits.length);
  let rendered = point === 0 ? `0.${digits}` : point === digits.length ? digits : `${digits.slice(0, point)}.${digits.slice(point)}`;
  if (rendered.includes(".")) rendered = rendered.replace(/0+$/, "").replace(/\.$/, "");
  rendered = rendered.replace(/^0+(?=\d)/, "") || "0";
  if (rendered.startsWith(".")) rendered = `0${rendered}`;
  if (/^0(?:\.0*)?$/.test(rendered)) return "0";
  return negative ? `-${rendered}` : rendered;
}

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
}

function typedCanonical(value: unknown): Buffer {
  if (value === null) return Buffer.from("n", "ascii");
  if (value === true) return Buffer.from("t", "ascii");
  if (value === false) return Buffer.from("f", "ascii");
  if (typeof value === "number") {
    if (!Number.isFinite(value) || (Number.isInteger(value) && Math.abs(value) > Number.MAX_SAFE_INTEGER)) fail();
    const bytes = Buffer.allocUnsafe(8);
    bytes.writeDoubleBE(value);
    return Buffer.from(`d${bytes.toString("hex")}`, "ascii");
  }
  if (typeof value === "string") {
    if (hasLoneSurrogate(value)) fail();
    const bytes = Buffer.from(value, "utf8");
    return Buffer.concat([Buffer.from(`s${bytes.length}:`, "ascii"), bytes]);
  }
  if (Array.isArray(value)) {
    return Buffer.concat([
      Buffer.from(`a${value.length}:[`, "ascii"),
      ...value.map(typedCanonical),
      Buffer.from("]", "ascii"),
    ]);
  }
  const object = record(value);
  if (!object) fail();
  const entries = Object.entries(object).sort(([left], [right]) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));
  return Buffer.concat([
    Buffer.from(`o${entries.length}:{`, "ascii"),
    ...entries.flatMap(([key, item]) => [typedCanonical(key), typedCanonical(item)]),
    Buffer.from("}", "ascii"),
  ]);
}

function quotePayloadProjection(quote: JsonRecord, summary: JsonRecord): JsonRecord {
  const payload = structuredClone(quote);
  delete payload.continuation_v3;
  const intent = record(payload.intent);
  const route = record(payload.route);
  const summarySteps = summary.steps;
  const rawSteps = route?.steps;
  if (!intent || !route || !Array.isArray(summarySteps) || summarySteps.length < 1 || !Array.isArray(rawSteps) || rawSteps.length !== summarySteps.length) fail();
  const exactSteps = summarySteps.map((item) => record(item));
  const rawRecords = rawSteps.map((item) => record(item));
  if (exactSteps.some((item) => !item) || rawRecords.some((item) => !item)) fail();
  const first = exactSteps[0] as JsonRecord;
  const last = exactSteps[exactSteps.length - 1] as JsonRecord;
  intent.estimated_input_base = first.expected_input_base;
  route.input_base = first.expected_input_base;
  route.expected_output_base = last.expected_output_base;
  route.minimum_output_base = last.minimum_output_base;
  rawRecords.forEach((raw, index) => {
    const exact = exactSteps[index] as JsonRecord;
    (raw as JsonRecord).expected_input_base = exact.expected_input_base;
    (raw as JsonRecord).floor_input_base = exact.minimum_input_base;
    (raw as JsonRecord).expected_output_base = exact.expected_output_base;
    (raw as JsonRecord).minimum_output_base = exact.minimum_output_base;
  });
  return payload;
}

function quotePayloadSha256(quote: JsonRecord, summary: JsonRecord): string {
  return createHash("sha256").update(typedCanonical(quotePayloadProjection(quote, summary))).digest("hex");
}

function fail(): never {
  throw new Error("ASSETFARE_INVALID_CONTINUATION_V3");
}

export function validateContinuationDescriptor(
  quote: JsonRecord,
  summary: JsonRecord,
): ContinuationDescriptor {
  const continuation = record(quote.continuation_v3);
  const claim = record(continuation?.quote_fingerprint_claim);
  const claimIntent = record(claim?.intent);
  const claimBounds = record(claim?.input_base_bounds);
  const intent = record(quote.intent);
  const route = record(quote.route);
  const bounds = record(continuation?.input_base_bounds);
  const sessionHeader = record(continuation?.session_header);
  const idempotency = record(continuation?.idempotency);
  if (
    !exactKeys(continuation, KEYS) || !exactKeys(claim, CLAIM_KEYS) ||
    !exactKeys(bounds, BOUNDS_KEYS) || !exactKeys(claimIntent, CLAIM_INTENT_KEYS) ||
    !exactKeys(claimBounds, BOUNDS_KEYS) || !exactKeys(sessionHeader, SESSION_HEADER_KEYS) ||
    !exactKeys(idempotency, IDEMPOTENCY_KEYS) || !intent || !route
  ) fail();
  const steps = summary.steps;
  if (!Array.isArray(steps) || !Number.isInteger(summary.step_count) || steps.length !== summary.step_count) fail();
  const requiredChains = [...new Set(steps.flatMap((item) => {
    const step = record(item);
    if (!step || typeof step.from !== "string" || typeof step.to !== "string") fail();
    return [step.from.split(":", 1)[0], step.to.split(":", 1)[0]];
  }))].sort();
  if (requiredChains.length < 1 || requiredChains.some((chain) => !CHAINS.has(chain))) fail();
  const signerRequired = steps.some((item) => {
    const step = record(item) as JsonRecord;
    return step.provider === "circle_cctp" && typeof step.from === "string" && step.from.startsWith("solana:");
  });
  const stepCount = summary.step_count as number;
  const allowedModes: Array<"one_shot" | "session"> = stepCount > 1 ? ["session"] : ["one_shot", "session"];
  const recommendedMode = stepCount > 1 ? "session" : "one_shot_or_session";
  const firstStep = record(steps[0]);
  const lastStep = record(steps[steps.length - 1]);
  if (!firstStep || !lastStep || typeof firstStep.expected_input_base !== "string" || typeof lastStep.minimum_output_base !== "string") fail();
  const inputBase = firstStep.expected_input_base;
  const minimumOutput = lastStep.minimum_output_base;
  const summaryHash = sha256(summary);
  const payloadHash = quotePayloadSha256(quote, summary);
  const ttl = continuation.ttl_seconds;
  const issuedMs = Date.parse(String(continuation.issued_at));
  const expiresMs = Date.parse(String(continuation.expires_at));
  const nowMs = Date.now();
  if (
    continuation.version !== VERSION || continuation.enforcement !== "server_enforced_quote_binding" ||
    continuation.selection_status !== "unranked_candidate" || continuation.automatic_selection_forbidden !== true ||
    continuation.caller_approved_boolean_is_not_human_proof !== true || continuation.quote_id !== quote.quote_id ||
    typeof continuation.quote_id !== "string" || !UUID.test(continuation.quote_id) ||
    typeof continuation.quote_fingerprint !== "string" || !HASH.test(continuation.quote_fingerprint) ||
    continuation.quote_fingerprint_spec !== "sha256(UTF-8 sorted-key compact JSON of quote_fingerprint_claim; every numeric claim is a non-exponent decimal string)" ||
    !Number.isInteger(ttl) || (ttl as number) < 1 || (ttl as number) > 60 || ttl !== quote.ttl_seconds ||
    canonical(continuation.intent) !== canonical(intent) || continuation.direct_route_summary_sha256 !== summaryHash ||
    continuation.quote_payload_sha256 !== payloadHash || claim.direct_route_summary_sha256 !== summaryHash ||
    claim.quote_payload_sha256 !== payloadHash || continuation.quote_payload_sha256_spec !== QUOTE_PAYLOAD_SHA256_SPEC ||
    claim.quote_payload_sha256_spec !== QUOTE_PAYLOAD_SHA256_SPEC || sha256(claim) !== continuation.quote_fingerprint ||
    bounds.minimum !== inputBase || bounds.maximum !== inputBase || continuation.minimum_output_base !== minimumOutput ||
    continuation.step_count !== stepCount || !exactArray(continuation.required_wallet_chains, requiredChains) ||
    continuation.event_signer_public_required !== signerRequired || !exactArray(continuation.allowed_modes, allowedModes) ||
    continuation.recommended_mode !== recommendedMode || continuation.legacy_handoff_enforcement !== "legacy_advisory" ||
    continuation.server_signing !== false || continuation.server_submission !== false ||
    !exactArray(continuation.approval_v3_required_fields, APPROVAL_FIELDS) ||
    !Number.isFinite(issuedMs) || !Number.isFinite(expiresMs) || expiresMs - issuedMs !== (ttl as number) * 1000 ||
    expiresMs <= nowMs || issuedMs > nowMs + 300_000
  ) fail();
  if (canonical(sessionHeader) !== canonical({ name: "X-AssetFare-Session-Token", required_for: "session", caller_generated: true, minimum_entropy_bits: 256, server_returns_raw_value: false })) fail();
  if (canonical(idempotency) !== canonical({ required: true, field: "idempotency_key", pattern: "^[A-Za-z0-9._:-]{8,128}$", scope: "quote_and_selected_mode" })) fail();
  const expectedClaim = {
    version: VERSION, quote_id: quote.quote_id, issued_at: continuation.issued_at,
    expires_at: continuation.expires_at, ttl_seconds: String(ttl),
    intent: { from: intent.from, to: intent.to, amount_usd_decimal: decimalString(intent.amount_usd), estimated_input_base: inputBase },
    direct_route_summary_sha256: summaryHash, quote_payload_sha256: payloadHash,
    quote_payload_sha256_spec: QUOTE_PAYLOAD_SHA256_SPEC,
    input_base_bounds: { minimum: inputBase, maximum: inputBase }, minimum_output_base: minimumOutput,
    required_wallet_chains: requiredChains, event_signer_public_required: signerRequired,
    step_count: String(stepCount), allowed_modes: allowedModes, server_signing: false, server_submission: false,
  };
  if (canonical(claim) !== canonical(expectedClaim)) fail();
  return {
    version: VERSION, quote_id: continuation.quote_id, quote_fingerprint: continuation.quote_fingerprint,
    expires_at: String(continuation.expires_at), ttl_seconds: ttl as number,
    selection_status: "unranked_candidate", required_wallet_chains: requiredChains,
    event_signer_public_required: signerRequired, allowed_modes: allowedModes, recommended_mode: recommendedMode,
    openapi_url: OPENAPI_URL, legacy_handoff_enforcement: "legacy_advisory",
    automatic_selection_forbidden: true, caller_approved_boolean_is_not_human_proof: true,
    wallet_collection_performed: false, approval_v3_generated: false, prepare_calls: 0, session_calls: 0,
    server_signing: false, server_submission: false,
  };
}
