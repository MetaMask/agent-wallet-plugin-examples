import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CAPABILITIES_URL,
  DEFAULT_QUOTE_INTENT,
  QUOTE_URL,
  getCapabilities,
  getQuote,
  parseQuoteIntent,
} from "../dist/assetfare-client.js";

const endpoints = [
  ["solana", "SOL"],
  ["solana", "USDC"],
  ["solana", "USDG"],
  ["base", "ETH"],
  ["base", "USDC"],
  ["arbitrum", "ETH"],
  ["arbitrum", "USDC"],
  ["robinhood", "ETH"],
  ["robinhood", "USDG"],
  ["polygon", "USDC"],
  ["optimism", "USDC"],
  ["ethereum", "USDC"],
  ["hyperevm", "USDC"],
];
const economicGuidance = {
  version: "assetfare-route-economic-guidance-v1",
  as_of: "2026-09-27",
  route_count: 80,
  currency: "USD",
  technical_quote_minimum_usd: 1,
  economic_guidance_is_non_enforcing: true,
  amount_is_never_rejected_by_economic_guidance: true,
  values_change_with_market: true,
  fresh_quote_and_caller_decision_control: true,
  update_policy: "append_daily_observations_then_replace_values_without_schema_change",
  confidence_counts: { measured_two_day: 4, measured_route_specific: 11, structural_estimate: 37, reworked_route_remeasure: 14, coverage_only_retest: 14 },
  advisory_start_distribution: { "50": 1, "100": 6, "250": 13, "500": 12, "1000": 19, "2500": 4, "5000": 18, "10000": 7 },
};
const QUOTE_PAYLOAD_SHA256_SPEC = "sha256(AssetFare typed-canonical-v1 bytes of the quote without continuation_v3 after exact base-unit substitution: n=null; t/f=boolean; d=<IEEE-754 binary64 big-endian 16 lowercase hex> for each finite JSON number; s=<UTF-8 byte length>:<Unicode scalar text with lone surrogates forbidden>; a=<count>:[items]; o=<count>:{UTF-8-byte-sorted string-key/value pairs}; every non-substituted integral JSON number must be within +/-9007199254740991; substituted paths are intent.estimated_input_base, route.input_base, route.expected_output_base, route.minimum_output_base, and every route.steps[i].expected_input_base/floor_input_base/expected_output_base/minimum_output_base from direct_route_summary exact decimal strings)";

function capabilities(overrides = {}) {
  return {
    status: "capped_public_agent_release",
    public_api_enabled: true,
    asset_endpoints: endpoints.map(([chain, token]) => ({ chain, token })),
    directed_conversion_routes: 80,
    server_signing: false,
    server_submission: false,
    direct_route_summary: {
      version: "assetfare-direct-route-summary-v1",
      required_on_every_quote: true,
      route_count: 80,
      step_count: 188,
      ordered_provider_path: true,
      normalized_chain_asset_endpoints: true,
      assetfare_fee_step_bound: true,
      base_unit_amounts_are_decimal_strings: true,
      route_aggregator_used_scope: "assetfare_engine_only",
      classification_values: ["direct_protocol_only", "external_intent"],
      external_intent: "No public route uses an external intent protocol; provider-internal liquidity sourcing or aggregation remains possible",
      server_signing: false,
      server_submission: false,
    },
    evaluation_guidance: {
      schema_version: 2,
      route_minimum_usd: 1,
      reachability_smoke_usd: 1,
      reachability_smoke_scope: "connectivity_only_not_economic_evaluation",
      route_specific_guidance: {
        version: "assetfare-route-economic-guidance-v1",
        url: "https://assetfare.dev/route-economics.json",
        required_on_every_quote: true,
        controls_evaluation_start: true,
        values_change_with_market: true,
      },
      documentation_example_usd: 1000,
      documentation_example_scope: "example_only_not_route_guidance_or_minimum",
      sol_input_caveat: "SOL-input routes add a source swap, so compare their full fee-inclusive route economics separately.",
      historical_observation: { route: "solana:USDC->base:USDC", observed_competitive_bucket_usd: 50, evidence_as_of: "2026-09-23", not_generalizable: true },
      not_a_minimum: true,
      not_guaranteed_best: true,
      always_compare_fresh_at_intended_amount: true,
    },
    economic_guidance: economicGuidance,
    route_product_policy: {
      amount_conditioned_routes: {},
      economic_guidance: economicGuidance,
      economic_guidance_url: "https://assetfare.dev/route-economics.json",
    },
    ...overrides,
  };
}

function quote(intent = DEFAULT_QUOTE_INTENT, overrides = {}) {
  const inputBase = Math.round(intent.amount_usd * 1_000_000);
  const expectedOutput = inputBase - 1000;
  const minimumOutput = inputBase - 2000;
  const value = {
    quote_id: "00000000-0000-4000-8000-000000000001",
    status: "capped_public_agent_release",
    as_of: "2026-09-24T00:00:00Z",
    ttl_seconds: 60,
    intent: {
      from: `${intent.from_chain}:${intent.from_token}`,
      to: `${intent.to_chain}:${intent.to_token}`,
      amount_usd: intent.amount_usd,
      estimated_input_base: inputBase,
    },
    offer: {
      expected_receive_amount: intent.amount_usd - 0.1,
      estimated_min_receive_amount: intent.amount_usd - 0.2,
      output_symbol: intent.to_token,
      assetfare_fee_bps: 1,
      fee_modeled_bps: 1,
      fee_collectible_now: true,
      fee_collection_steps: [0],
    },
    route: {
      status: "pass",
      version: "assetfare-direct-multichain-quote-v2",
      route: "arbitrum:USDC->base:USDC",
      mode: "cctp_direct_composition",
      input_base: inputBase,
      expected_output_base: expectedOutput,
      minimum_output_base: minimumOutput,
      steps: [{
        kind: "direct_bridge",
        provider: "circle_cctp",
        from: "arbitrum",
        to: "base",
        asset: "USDC",
        route_fee_bps: 1,
        index: 0,
        expected_input_base: inputBase,
        floor_input_base: inputBase,
        expected_output_base: expectedOutput,
        minimum_output_base: minimumOutput,
        expected_evidence: { status: "pass", inputAmount: String(inputBase), aggregatorApiUsed: false, signed: false, submitted: false },
        floor_evidence: null,
      }],
      quote_latency_ms: 1,
      aggregator_api_used: false,
      external_intent_protocol_used: false,
      server_signing: false,
      server_submission: false,
    },
    direct_route_summary: {
      version: "assetfare-direct-route-summary-v1",
      route: "arbitrum:USDC->base:USDC",
      from: "arbitrum:USDC",
      to: "base:USDC",
      classification: "direct_protocol_only",
      mode: "cctp_direct_composition",
      route_aggregator_used: false,
      external_intent_protocol_used: false,
      provider_internal_dex_aggregation_possible: false,
      assetfare_fee_bps: 1,
      fee_collection_step_index: 0,
      server_signing: false,
      server_submission: false,
      step_count: 1,
      steps: [{
        index: 0,
        action: "bridge",
        provider: "circle_cctp",
        from: "arbitrum:USDC",
        to: "base:USDC",
        expected_input_base: String(inputBase),
        minimum_input_base: String(inputBase),
        expected_output_base: String(expectedOutput),
        minimum_output_base: String(minimumOutput),
        assetfare_fee_bps: 1,
        direct_protocol: true,
        external_intent_protocol: false,
        aggregator_api_used: false,
      }],
    },
    risk: { external_intent_protocol_used: false, provider_internal_dex_aggregation_possible: false, server_signing: false, server_submission: false },
    execution: { supported: true, first_unsigned_action_supported: true },
    economic_guidance: {
      advisory_start_usd: 1000,
      advisory_role: "structural_evaluation_start_not_observed_eligibility",
      status: "provisional_evaluation_start",
      confidence: "structural_estimate",
      basis: "offline fixture",
      tested_amounts_usd: [],
      not_an_execution_minimum: true,
      not_a_best_price_guarantee: true,
      fresh_quote_required: true,
    },
    caller_action_plan_handoff: { url: "https://api.assetfare.dev/v2/prepare" },
    caller_action_plan_handoff_v2: { url: "https://api.assetfare.dev/v2/session" },
    handoff_schema_version: 2,
    ...overrides,
  };
  return addContinuation(value);
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}

function decimalString(value) {
  const source = String(value);
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(source);
  assert.ok(match);
  const negative = match[1] === "-";
  const whole = match[2];
  const fraction = match[3] || "";
  const exponent = Number(match[4] || 0);
  let digits = whole + fraction;
  let point = whole.length + exponent;
  if (point <= 0) { digits = "0".repeat(-point) + digits; point = 0; }
  if (point >= digits.length) digits += "0".repeat(point - digits.length);
  let rendered = point === 0 ? `0.${digits}` : point === digits.length ? digits : `${digits.slice(0, point)}.${digits.slice(point)}`;
  if (rendered.includes(".")) rendered = rendered.replace(/0+$/, "").replace(/\.$/, "");
  rendered = rendered.replace(/^0+(?=\d)/, "") || "0";
  if (rendered.startsWith(".")) rendered = `0${rendered}`;
  if (/^0(?:\.0*)?$/.test(rendered)) return "0";
  return negative ? `-${rendered}` : rendered;
}

function hasLoneSurrogate(value) {
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

function typedCanonical(value) {
  if (value === null) return Buffer.from("n", "ascii");
  if (value === true) return Buffer.from("t", "ascii");
  if (value === false) return Buffer.from("f", "ascii");
  if (typeof value === "number") {
    if (!Number.isFinite(value) || (Number.isInteger(value) && Math.abs(value) > Number.MAX_SAFE_INTEGER)) throw new Error("unsafe number");
    const bytes = Buffer.allocUnsafe(8);
    bytes.writeDoubleBE(value);
    return Buffer.from(`d${bytes.toString("hex")}`, "ascii");
  }
  if (typeof value === "string") {
    if (hasLoneSurrogate(value)) throw new Error("invalid unicode");
    const bytes = Buffer.from(value, "utf8");
    return Buffer.concat([Buffer.from(`s${bytes.length}:`, "ascii"), bytes]);
  }
  if (Array.isArray(value)) return Buffer.concat([Buffer.from(`a${value.length}:[`, "ascii"), ...value.map(typedCanonical), Buffer.from("]", "ascii")]);
  const entries = Object.entries(value).sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  return Buffer.concat([Buffer.from(`o${entries.length}:{`, "ascii"), ...entries.flatMap(([key, item]) => [typedCanonical(key), typedCanonical(item)]), Buffer.from("}", "ascii")]);
}

function quotePayloadProjection(value) {
  const payload = structuredClone(value);
  delete payload.continuation_v3;
  const summarySteps = payload.direct_route_summary.steps;
  const rawSteps = payload.route.steps;
  payload.intent.estimated_input_base = summarySteps[0].expected_input_base;
  payload.route.input_base = summarySteps[0].expected_input_base;
  payload.route.expected_output_base = summarySteps.at(-1).expected_output_base;
  payload.route.minimum_output_base = summarySteps.at(-1).minimum_output_base;
  rawSteps.forEach((raw, index) => {
    const exact = summarySteps[index];
    raw.expected_input_base = exact.expected_input_base;
    raw.floor_input_base = exact.minimum_input_base;
    raw.expected_output_base = exact.expected_output_base;
    raw.minimum_output_base = exact.minimum_output_base;
  });
  return payload;
}

function quotePayloadSha256(value) {
  return createHash("sha256").update(typedCanonical(quotePayloadProjection(value))).digest("hex");
}

function addContinuation(value) {
  delete value.continuation_v3;
  const summary = value.direct_route_summary;
  const steps = summary.steps;
  const wallets = [...new Set(steps.flatMap((step) => [step.from.split(":", 1)[0], step.to.split(":", 1)[0]]))].sort();
  const signer = steps.some((step) => step.provider === "circle_cctp" && step.from.startsWith("solana:"));
  const modes = summary.step_count > 1 ? ["session"] : ["one_shot", "session"];
  const bounds = { minimum: String(summary.steps[0].expected_input_base), maximum: String(summary.steps[0].expected_input_base) };
  const summaryHash = sha256(summary);
  const payloadHash = quotePayloadSha256(value);
  const issued = new Date();
  const expires = new Date(issued.getTime() + 60_000);
  const claim = {
    version: "assetfare-quote-bound-continuation-v3", quote_id: value.quote_id,
    issued_at: issued.toISOString(), expires_at: expires.toISOString(), ttl_seconds: "60",
    intent: { from: value.intent.from, to: value.intent.to, amount_usd_decimal: String(value.intent.amount_usd), estimated_input_base: bounds.minimum },
    direct_route_summary_sha256: summaryHash, quote_payload_sha256: payloadHash,
    quote_payload_sha256_spec: QUOTE_PAYLOAD_SHA256_SPEC, input_base_bounds: bounds,
    minimum_output_base: String(summary.steps.at(-1).minimum_output_base), required_wallet_chains: wallets,
    event_signer_public_required: signer, step_count: String(summary.step_count), allowed_modes: modes,
    server_signing: false, server_submission: false,
  };
  value.continuation_v3 = {
    version: "assetfare-quote-bound-continuation-v3", enforcement: "server_enforced_quote_binding",
    selection_status: "unranked_candidate", automatic_selection_forbidden: true,
    caller_approved_boolean_is_not_human_proof: true, quote_id: value.quote_id, quote_fingerprint: sha256(claim),
    quote_fingerprint_spec: "sha256(UTF-8 sorted-key compact JSON of quote_fingerprint_claim; every numeric claim is a non-exponent decimal string)",
    quote_fingerprint_claim: claim, issued_at: claim.issued_at, expires_at: claim.expires_at, ttl_seconds: 60,
    intent: structuredClone(value.intent), direct_route_summary_sha256: summaryHash, quote_payload_sha256: payloadHash,
    quote_payload_sha256_spec: QUOTE_PAYLOAD_SHA256_SPEC,
    input_base_bounds: bounds, minimum_output_base: claim.minimum_output_base, required_wallet_chains: wallets,
    event_signer_public_required: signer, step_count: summary.step_count,
    recommended_mode: summary.step_count > 1 ? "session" : "one_shot_or_session", allowed_modes: modes,
    session_header: { name: "X-AssetFare-Session-Token", required_for: "session", caller_generated: true, minimum_entropy_bits: 256, server_returns_raw_value: false },
    idempotency: { required: true, field: "idempotency_key", pattern: "^[A-Za-z0-9._:-]{8,128}$", scope: "quote_and_selected_mode" },
    approval_v3_required_fields: ["direct_route_summary_sha256", "idempotency_key", "maximum_input_base", "minimum_output_base", "quote_fingerprint", "quote_id", "selected_mode", "selection_status", "version"],
    legacy_handoff_enforcement: "legacy_advisory", server_signing: false, server_submission: false,
  };
  return value;
}

function acrossQuote() {
  const intent = { from_chain: "base", from_token: "USDC", to_chain: "robinhood", to_token: "USDG", amount_usd: 1000 };
  const value = quote(intent);
  value.offer.output_symbol = "USDG";
  value.route = {
    status: "pass", version: "assetfare-direct-multichain-quote-v2", route: "base:USDC->robinhood:USDG",
    mode: "robinhood_across_ingress_composition", input_base: 1_000_000_000, expected_output_base: 999_999_000,
    minimum_output_base: 999_998_000,
    steps: [{ kind: "direct_bridge", provider: "across_intent_bridge", from: "base", to: "robinhood", from_asset: "USDC", to_asset: "USDG", external_intent_protocol: true, route_fee_bps: 1, index: 0, expected_input_base: 1_000_000_000, floor_input_base: 1_000_000_000, expected_output_base: 999_999_000, minimum_output_base: 999_998_000, expected_evidence: { status: "pass", aggregatorApiUsed: false, signed: false, submitted: false }, floor_evidence: null }],
    quote_latency_ms: 1, aggregator_api_used: false, external_intent_protocol_used: true, server_signing: false, server_submission: false,
  };
  value.risk.external_intent_protocol_used = true;
  value.risk.provider_internal_dex_aggregation_possible = true;
  value.direct_route_summary = {
    version: "assetfare-direct-route-summary-v1", route: "base:USDC->robinhood:USDG", from: "base:USDC", to: "robinhood:USDG",
    classification: "external_intent", mode: "robinhood_across_ingress_composition", route_aggregator_used: false,
    external_intent_protocol_used: true, provider_internal_dex_aggregation_possible: true, assetfare_fee_bps: 1,
    fee_collection_step_index: 0, server_signing: false, server_submission: false, step_count: 1,
    steps: [{ index: 0, action: "bridge", provider: "across_intent_bridge", from: "base:USDC", to: "robinhood:USDG", expected_input_base: "1000000000", minimum_input_base: "1000000000", expected_output_base: "999999000", minimum_output_base: "999998000", assetfare_fee_bps: 1, direct_protocol: false, external_intent_protocol: true, aggregator_api_used: false }],
  };
  return { intent, value: addContinuation(value) };
}

function solanaSolQuote() {
  const intent = { from_chain: "solana", from_token: "SOL", to_chain: "base", to_token: "USDC", amount_usd: 1000 };
  const value = quote(intent);
  value.intent.estimated_input_base = 1_000_000;
  value.route = {
    status: "pass", version: "assetfare-direct-multichain-quote-v2", route: "solana:SOL->base:USDC", mode: "cctp_direct_composition",
    input_base: 1_000_000, expected_output_base: 899_000, minimum_output_base: 898_000,
    steps: [
      { kind: "direct_swap", chain: "solana", provider: "raydium_clmm", from: "SOL", to: "USDC", route_fee_bps: 0, index: 0, expected_input_base: 1_000_000, floor_input_base: 1_000_000, expected_output_base: 900_000, minimum_output_base: 899_000, expected_evidence: { status: "pass", aggregatorApiUsed: false, signed: false, submitted: false }, floor_evidence: null },
      { kind: "direct_bridge", provider: "circle_cctp", from: "solana", to: "base", asset: "USDC", route_fee_bps: 1, index: 1, expected_input_base: 900_000, floor_input_base: 899_000, expected_output_base: 899_000, minimum_output_base: 898_000, expected_evidence: { status: "pass", aggregatorApiUsed: false, signed: false, submitted: false }, floor_evidence: null },
    ],
    quote_latency_ms: 1, aggregator_api_used: false, external_intent_protocol_used: false, server_signing: false, server_submission: false,
  };
  value.offer.fee_collection_steps = [1];
  value.direct_route_summary = {
    version: "assetfare-direct-route-summary-v1", route: "solana:SOL->base:USDC", from: "solana:SOL", to: "base:USDC",
    classification: "direct_protocol_only", mode: "cctp_direct_composition", route_aggregator_used: false,
    external_intent_protocol_used: false, provider_internal_dex_aggregation_possible: false, assetfare_fee_bps: 1,
    fee_collection_step_index: 1, server_signing: false, server_submission: false, step_count: 2,
    steps: [
      { index: 0, action: "swap", provider: "raydium_clmm", from: "solana:SOL", to: "solana:USDC", expected_input_base: "1000000", minimum_input_base: "1000000", expected_output_base: "900000", minimum_output_base: "899000", assetfare_fee_bps: 0, direct_protocol: true, external_intent_protocol: false, aggregator_api_used: false },
      { index: 1, action: "bridge", provider: "circle_cctp", from: "solana:USDC", to: "base:USDC", expected_input_base: "900000", minimum_input_base: "899000", expected_output_base: "899000", minimum_output_base: "898000", assetfare_fee_bps: 1, direct_protocol: true, external_intent_protocol: false, aggregator_api_used: false },
    ],
  };
  return { intent, value: addContinuation(value) };
}

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
    ...init,
  });
}

test("default intent is USD 1,000 Arbitrum USDC to Base USDC", () => {
  assert.deepEqual(parseQuoteIntent({}), DEFAULT_QUOTE_INTENT);
});

test("USD 1 is accepted only as an explicitly labelled smoke amount", async () => {
  const intent = parseQuoteIntent({ amountUsd: "1" });
  const result = await getQuote(async () => jsonResponse(quote(intent)), intent);
  assert.equal(result.guidance.one_dollar_smoke_only, true);
  assert.equal(result.guidance.use_assetfare_first_at_or_above_best_from, false);
  assert.equal(result.guidance.confirm_fresh_assetfare_quote, true);
});

test("capabilities uses one fixed GET with no wallet authorization", async () => {
  const calls = [];
  const result = await getCapabilities(async (url, init) => {
    calls.push({ url, init });
    return jsonResponse(capabilities());
  });
  assert.equal(result.server_signing, false);
  assert.equal(result.server_submission, false);
  assert.equal(result.direct_route_summary.required_on_every_quote, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, CAPABILITIES_URL);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.body, undefined);
  assert.equal(new Headers(calls[0].init.headers).has("authorization"), false);
});

test("quote uses one exact POST body, strips workflow handoffs, and gives best-from guidance", async () => {
  const calls = [];
  const result = await getQuote(async (url, init) => {
    calls.push({ url, init });
    return jsonResponse(quote());
  }, DEFAULT_QUOTE_INTENT);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, QUOTE_URL);
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), DEFAULT_QUOTE_INTENT);
  assert.equal(new Headers(calls[0].init.headers).has("authorization"), false);
  assert.equal("execution" in result.quote, false);
  assert.equal("caller_action_plan_handoff" in result.quote, false);
  assert.equal("caller_action_plan_handoff_v2" in result.quote, false);
  assert.equal("handoff_schema_version" in result.quote, false);
  assert.equal("continuation_v3" in result.quote, false);
  assert.equal(result.quote.direct_route_summary.steps[0].provider, "circle_cctp");
  assert.equal(result.quote.direct_route_summary.steps[0].from, "arbitrum:USDC");
  assert.equal(result.quote.direct_route_summary.steps[0].to, "base:USDC");
  assert.equal(result.guidance.direct_route_summary_verified, true);
  assert.equal(result.guidance.assetfare_fee_step_verified, true);
  assert.equal(result.guidance.route_classification, "direct_protocol_only");
  assert.equal(result.guidance.assetfare_engine_route_aggregator_used, false);
  assert.equal(result.guidance.best_from_usd, 1000);
  assert.equal(result.guidance.use_assetfare_first_at_or_above_best_from, true);
  assert.equal(result.guidance.best_from_not_100_percent_guarantee, true);
  assert.equal(result.guidance.confirm_fresh_assetfare_quote, true);
  assert.equal(result.guidance.compare_with_other_routes, false);
  assert.equal(result.guidance.selection_status, "unranked_candidate");
  assert.equal(result.guidance.action_prepared, false);
  assert.equal(result.guidance.session_created, false);
  assert.equal(result.guidance.transaction_signed, false);
  assert.equal(result.guidance.transaction_submitted, false);
  assert.equal(result.guidance.continuation_v3_verified, true);
  assert.equal(result.guidance.automatic_selection_forbidden, true);
  assert.equal(result.guidance.approval_v3_generated, false);
  assert.equal(result.guidance.wallet_collection_performed, false);
  assert.equal(result.guidance.prepare_calls, 0);
  assert.equal(result.guidance.session_calls, 0);
  assert.equal(result.guidance.caller_owned_continuation.package_version, "1.13.2");
  assert.equal(result.guidance.caller_owned_continuation.requires_fresh_requote, true);
  assert.equal(result.guidance.caller_owned_continuation.requires_explicit_caller_approval_before_plan, true);
  assert.equal(result.guidance.caller_owned_continuation.plugin_returns_raw_quote, false);
  assert.equal(result.guidance.caller_owned_continuation.plugin_remains_read_only, true);
  assert.deepEqual(result.guidance.caller_owned_continuation.quote_command.args, [
    "--yes", "--package=assetfare-mcp@1.13.2", "assetfare-route-eval", "--amount", "1000",
    "--from-chain", "arbitrum", "--from-token", "USDC", "--to-chain", "base", "--to-token", "USDC",
    "--quote-output", "quote.json",
  ]);
  assert.ok(result.guidance.caller_owned_continuation.unsigned_plan_command_template.args.includes("--select-exact-quote-bounds"));
  assert.ok(result.guidance.caller_owned_continuation.unsigned_plan_command_template.args.includes("arbitrum=<CALLER_ARBITRUM_PUBLIC_ADDRESS>"));
  assert.ok(result.guidance.caller_owned_continuation.unsigned_plan_command_template.args.includes("base=<CALLER_BASE_PUBLIC_ADDRESS>"));
  assert.ok(result.guidance.caller_owned_continuation.unsigned_plan_command_template.args.includes("--wallet-handoff-output"));
  assert.ok(result.guidance.caller_owned_continuation.unsigned_plan_command_template.args.includes("./caller-wallet-handoff.json"));
  assert.deepEqual(result.guidance.caller_owned_continuation.action_lifetime, {
    quote_ttl_seconds: 60,
    action_bundle_ttl_seconds: 180,
    evm_onchain_deadline_seconds: 240,
    wallet_ready_minimum_remaining_seconds: 120,
  });
  assert.ok(result.guidance.caller_owned_continuation.wallet_ready_command_template.args.includes("wallet-ready"));
  assert.ok(result.guidance.caller_owned_continuation.caller_owned_runner_command_template.args.includes("assetfare-agent-runner"));
  assert.deepEqual(result.guidance.caller_owned_continuation.caller_owned_runner, {
    policy_schema: "https://assetfare.dev/schemas/caller-owned-execution-policy-v2.json",
    key_location: "caller_wallet_adapter_only",
    remote_mcp_execution_tool: false,
    assetfare_server_key_access: false,
    assetfare_server_signs_or_submits: false,
  });
  assert.equal(result.guidance.caller_owned_continuation.outcome, "verified_unsigned_plan_only");
  assert.equal(result.guidance.caller_owned_continuation.wallet_signs_and_submits, true);
  assert.equal(result.guidance.caller_owned_continuation.assetfare_server_signs_or_submits, false);
  assert.deepEqual(result.continuation_descriptor.required_wallet_chains, ["arbitrum", "base"]);
  assert.deepEqual(result.continuation_descriptor.allowed_modes, ["one_shot", "session"]);
  assert.equal(result.continuation_descriptor.recommended_mode, "one_shot_or_session");
  assert.equal(result.continuation_descriptor.selection_status, "unranked_candidate");
  assert.equal(result.continuation_descriptor.openapi_url, "https://api.assetfare.dev/v2/openapi");
  assert.equal(result.continuation_descriptor.legacy_handoff_enforcement, "legacy_advisory");
  assert.equal("quote_fingerprint_claim" in result.continuation_descriptor, false);
  assert.equal("input_base_bounds" in result.continuation_descriptor, false);
});

test("quote rejects malformed, tampered, auto-selected, or weakened continuation_v3", async () => {
  const cases = [
    (value) => { delete value.continuation_v3; },
    (value) => { value.continuation_v3.extra = true; },
    (value) => { value.continuation_v3.selection_status = "selected"; },
    (value) => { value.continuation_v3.automatic_selection_forbidden = false; },
    (value) => { value.continuation_v3.caller_approved_boolean_is_not_human_proof = false; },
    (value) => { value.continuation_v3.quote_fingerprint = "0".repeat(64); },
    (value) => { value.continuation_v3.quote_payload_sha256_spec = "forbidden"; },
    (value) => { value.continuation_v3.required_wallet_chains = ["base"]; },
    (value) => { value.continuation_v3.event_signer_public_required = true; },
    (value) => { value.continuation_v3.allowed_modes = ["session"]; },
    (value) => { value.continuation_v3.input_base_bounds.maximum = "1000000001"; },
    (value) => { value.continuation_v3.input_base_bounds.extra = "forbidden"; },
    (value) => { value.continuation_v3.session_header.server_returns_raw_value = true; },
    (value) => { value.continuation_v3.session_header.extra = "forbidden"; },
    (value) => { value.continuation_v3.idempotency.extra = "forbidden"; },
    (value) => { value.continuation_v3.quote_fingerprint_claim.step_count = "2"; },
    (value) => { value.continuation_v3.quote_fingerprint_claim.quote_payload_sha256_spec = "forbidden"; },
    (value) => { value.continuation_v3.quote_fingerprint_claim.intent.extra = "forbidden"; },
    (value) => { value.continuation_v3.quote_fingerprint_claim.input_base_bounds.extra = "forbidden"; },
    (value) => { value.continuation_v3.private_key = "forbidden"; },
  ];
  for (const mutate of cases) {
    const hostile = structuredClone(quote());
    mutate(hostile);
    await assert.rejects(getQuote(async () => jsonResponse(hostile), DEFAULT_QUOTE_INTENT));
  }
});

test("portable continuation payload hash accepts integral USD and raw base units above 2^53", async () => {
  const value = quote();
  const exactInput = "9007199254740993";
  const exactOutput = "9007199254740893";
  const exactMinimum = "9007199254740793";
  value.intent.amount_usd = 1000;
  value.intent.estimated_input_base = Number(exactInput);
  value.route.input_base = Number(exactInput);
  value.route.expected_output_base = Number(exactOutput);
  value.route.minimum_output_base = Number(exactMinimum);
  value.route.steps[0].expected_input_base = Number(exactInput);
  value.route.steps[0].floor_input_base = Number(exactInput);
  value.route.steps[0].expected_output_base = Number(exactOutput);
  value.route.steps[0].minimum_output_base = Number(exactMinimum);
  Object.assign(value.direct_route_summary.steps[0], {
    expected_input_base: exactInput,
    minimum_input_base: exactInput,
    expected_output_base: exactOutput,
    minimum_output_base: exactMinimum,
  });
  addContinuation(value);
  const result = await getQuote(async () => jsonResponse(value), DEFAULT_QUOTE_INTENT);
  assert.equal(result.continuation_descriptor.quote_fingerprint, value.continuation_v3.quote_fingerprint);
});

test("typed payload hash preserves number/string and negative zero and rejects unsafe evidence integers", () => {
  const numeric = quote();
  const string = quote();
  const negativeZero = quote();
  const positiveZero = quote();
  numeric.route.steps[0].expected_evidence.semantic = 1;
  string.route.steps[0].expected_evidence.semantic = "1";
  negativeZero.route.steps[0].expected_evidence.semantic = -0;
  positiveZero.route.steps[0].expected_evidence.semantic = 0;
  assert.notEqual(quotePayloadSha256(numeric), quotePayloadSha256(string));
  assert.notEqual(quotePayloadSha256(negativeZero), quotePayloadSha256(positiveZero));
  const unsafe = quote();
  unsafe.route.steps[0].expected_evidence.semantic = 500000000000000000;
  assert.throws(() => quotePayloadSha256(unsafe), /unsafe number/);
  const invalidUnicode = quote();
  invalidUnicode.route.steps[0].expected_evidence.semantic = "\ud800";
  assert.throws(() => quotePayloadSha256(invalidUnicode), /invalid unicode/);
});

test("exact Core 2.4.1 typed-canonical fixture survives parsing but is rejected as pre-guidance", async () => {
  const fixtureText = readFileSync(
    new URL("./fixtures/core-241-unsafe-integer-quote.json", import.meta.url),
    "utf8",
  );
  assert.match(fixtureText, /"amount_usd":1000\.0/);
  assert.match(fixtureText, /"estimated_input_base":9007199254740993/);
  const fixture = JSON.parse(fixtureText);
  assert.equal(fixture.intent.estimated_input_base, 9007199254740992);
  assert.equal(fixture.direct_route_summary.steps[0].expected_input_base, "9007199254740993");
  assert.equal(
    quotePayloadSha256(fixture),
    "f071dead7a91a993e72ec086ac7948e801880bf24cda916ad0761e962249f17c",
  );
  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-09-24T14:08:00Z");
  try {
    await assert.rejects(
      getQuote(
        async () => jsonResponse(fixture),
        { from_chain: "base", from_token: "USDC", to_chain: "arbitrum", to_token: "USDC", amount_usd: 1000 },
      ),
      /best-from contract/,
    );
  } finally {
    Date.now = originalNow;
  }
});

test("capabilities fail closed without the REST 2.5 direct-route contract", async () => {
  const missing = capabilities();
  delete missing.direct_route_summary;
  await assert.rejects(getCapabilities(async () => jsonResponse(missing)), /expected schema/);

  const wrongScope = capabilities();
  wrongScope.direct_route_summary.route_aggregator_used_scope = "all_providers";
  await assert.rejects(getCapabilities(async () => jsonResponse(wrongScope)), /required contract/);
});

test("quote rejects exact-contract provider, amount, fee, aggregator, and private-field hostiles", async () => {
  const cases = [
    (value) => { delete value.direct_route_summary; },
    (value) => { value.direct_route_summary.steps[0].provider = "unknown_provider"; value.route.steps[0].provider = "unknown_provider"; },
    (value) => { value.direct_route_summary.steps[0].provider = "paxos_usdg_layerzero_oft"; value.route.steps[0].provider = "paxos_usdg_layerzero_oft"; },
    (value) => { value.direct_route_summary.fee_collection_step_index = 7; },
    (value) => { value.direct_route_summary.route_aggregator_used = true; },
    (value) => { value.direct_route_summary.steps[0].aggregator_api_used = true; },
    (value) => { value.direct_route_summary.private_key = "forbidden"; },
  ];
  for (const mutate of cases) {
    const hostile = structuredClone(quote());
    mutate(hostile);
    await assert.rejects(getQuote(async () => jsonResponse(hostile), DEFAULT_QUOTE_INTENT));
  }

  const { intent, value } = solanaSolQuote();
  value.direct_route_summary.steps[1].expected_input_base = "900001";
  value.route.steps[1].expected_input_base = 900001;
  await assert.rejects(getQuote(async () => jsonResponse(value), intent), /direct-route and best-from contract/);
});

test("Across ingress remains external_intent and cannot be relabeled false-direct", async () => {
  const valid = acrossQuote();
  const result = await getQuote(async () => jsonResponse(valid.value), valid.intent);
  assert.equal(result.quote.direct_route_summary.classification, "external_intent");
  assert.equal(result.guidance.provider_internal_dex_aggregation_possible, true);

  const hostile = acrossQuote();
  hostile.value.direct_route_summary.classification = "direct_protocol_only";
  hostile.value.direct_route_summary.external_intent_protocol_used = false;
  hostile.value.direct_route_summary.provider_internal_dex_aggregation_possible = false;
  hostile.value.route.external_intent_protocol_used = false;
  hostile.value.risk.external_intent_protocol_used = false;
  hostile.value.risk.provider_internal_dex_aggregation_possible = false;
  await assert.rejects(getQuote(async () => jsonResponse(hostile.value), hostile.intent), /direct-route and best-from contract/);
});

test("quote fails closed on server signing or submission claims at any depth", async () => {
  const unsafeTop = quote();
  unsafeTop.risk.server_signing = true;
  await assert.rejects(
    getQuote(async () => jsonResponse(unsafeTop), DEFAULT_QUOTE_INTENT),
    /non-custodial boundary|safety boundary/,
  );

  const unsafeNested = quote();
  unsafeNested.route.steps[0].server_submission = true;
  await assert.rejects(getQuote(async () => jsonResponse(unsafeNested), DEFAULT_QUOTE_INTENT), /non-custodial boundary/);

  const unsafeHandoff = quote();
  unsafeHandoff.caller_action_plan_handoff.assetfare_server_signing = true;
  await assert.rejects(getQuote(async () => jsonResponse(unsafeHandoff), DEFAULT_QUOTE_INTENT), /non-custodial boundary/);

  const missingClaim = quote();
  delete missingClaim.risk.server_submission;
  await assert.rejects(getQuote(async () => jsonResponse(missingClaim), DEFAULT_QUOTE_INTENT), /safety boundary/);
});

test("quote rejects private or signed response material", async () => {
  for (const field of ["private_key", "seedPhrase", "signed_transaction", "signature"]) {
    const unsafe = quote();
    unsafe.route.steps[0][field] = "forbidden";
    await assert.rejects(
      getQuote(async () => jsonResponse(unsafe), DEFAULT_QUOTE_INTENT),
      /forbidden secret or signed material/,
    );
  }
});

test("quote fails closed when the response is not bound to the requested intent", async () => {
  const mismatched = quote();
  mismatched.intent.amount_usd = 999;
  await assert.rejects(getQuote(async () => jsonResponse(mismatched), DEFAULT_QUOTE_INTENT), /safety boundary/);
});

test("invalid routes and sub-USD amounts fail before fetch", () => {
  assert.throws(() => parseQuoteIntent({ amountUsd: "0.99" }), /at least USD 1/);
  assert.throws(
    () => parseQuoteIntent({ fromChain: "polygon", fromToken: "USDC", toChain: "solana", toToken: "USDC" }),
    /source-only route/,
  );
  assert.throws(() => parseQuoteIntent({ fromChain: "base", fromToken: "USDG" }), /source chain and token pair/);
});

test("network, redirect, content-type, and response-size failures are sanitized", async () => {
  await assert.rejects(
    getCapabilities(async () => {
      throw new Error("secret network detail");
    }),
    /^AssetFareClientError: AssetFare request failed\.$/,
  );
  await assert.rejects(
    getCapabilities(async () => new Response("", { status: 302, headers: { location: "https://evil.example" } })),
    /redirected a fixed API request/,
  );
  await assert.rejects(
    getCapabilities(async () => new Response("secret", { status: 200, headers: { "content-type": "text/plain" } })),
    /non-JSON response/,
  );
  await assert.rejects(
    getCapabilities(
      async () =>
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json", "content-length": "1048577" },
        }),
    ),
    /exceeded the size limit/,
  );
});

test("tests never fall back to global live fetch", async () => {
  const originalFetch = globalThis.fetch;
  let liveFetchCalls = 0;
  globalThis.fetch = async () => {
    liveFetchCalls += 1;
    throw new Error("live fetch forbidden in tests");
  };
  try {
    await getCapabilities(async () => jsonResponse(capabilities()));
    await getQuote(async () => jsonResponse(quote()), DEFAULT_QUOTE_INTENT);
    assert.equal(liveFetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
