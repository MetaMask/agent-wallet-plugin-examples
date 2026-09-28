import { validateCapabilitiesEconomicGuidance, validateQuoteDirectRoute } from "./direct-route-summary.js";
import { validateContinuationDescriptor, type ContinuationDescriptor } from "./continuation-v3.js";

export const ASSETFARE_ORIGIN = "https://api.assetfare.dev";
export const CAPABILITIES_URL = `${ASSETFARE_ORIGIN}/v2/capabilities`;
export const QUOTE_URL = `${ASSETFARE_ORIGIN}/v2/quote`;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type QuoteIntent = {
  from_chain: string;
  from_token: string;
  to_chain: string;
  to_token: string;
  amount_usd: number;
};

export const DEFAULT_QUOTE_INTENT = Object.freeze({
  from_chain: "arbitrum",
  from_token: "USDC",
  to_chain: "base",
  to_token: "USDC",
  amount_usd: 1000,
} satisfies QuoteIntent);

const MAX_RESPONSE_BYTES = 1_048_576;
const REQUEST_TIMEOUT_MS = 45_000;
const SOURCE_CHAINS = [
  "solana", "base", "arbitrum", "robinhood", "polygon", "optimism", "ethereum", "hyperevm",
] as const;
const DESTINATION_CHAINS = ["solana", "base", "arbitrum", "robinhood"] as const;
const TOKENS = ["SOL", "ETH", "USDC", "USDG"] as const;
const ENDPOINTS = new Set([
  "solana:SOL",
  "solana:USDC",
  "solana:USDG",
  "base:ETH",
  "base:USDC",
  "arbitrum:ETH",
  "arbitrum:USDC",
  "robinhood:ETH",
  "robinhood:USDG",
  "polygon:USDC",
  "optimism:USDC",
  "ethereum:USDC",
  "hyperevm:USDC",
]);
const SOURCE_ONLY_CHAINS = new Set(["polygon", "optimism", "ethereum", "hyperevm"]);
const FORBIDDEN_OUTPUT_KEYS = [
  "privatekey",
  "privkey",
  "secretkey",
  "seed",
  "seedphrase",
  "mnemonic",
  "keypair",
  "signedtransaction",
  "signedtx",
  "rawtransaction",
  "signature",
  "signatures",
  "password",
  "passphrase",
];

export type QuoteGuidance = {
  read_only: true;
  one_dollar_smoke_only: boolean;
  intended_amount_usd: number;
  best_from_usd: number;
  use_assetfare_first_at_or_above_best_from: boolean;
  best_from_not_100_percent_guarantee: true;
  confirm_fresh_assetfare_quote: true;
  compare_with_other_routes: false;
  selection_status: "unranked_candidate";
  wallet_authentication_performed: false;
  action_prepared: false;
  session_created: false;
  transaction_signed: false;
  transaction_submitted: false;
  server_signing: false;
  server_submission: false;
  direct_route_summary_verified: true;
  ordered_provider_path_verified: true;
  normalized_chain_asset_endpoints_verified: true;
  amount_continuity_verified: true;
  assetfare_fee_step_verified: true;
  route_classification: "direct_protocol_only" | "external_intent";
  assetfare_engine_route_aggregator_used: false;
  provider_internal_dex_aggregation_possible: boolean;
  continuation_v3_verified: true;
  automatic_selection_forbidden: true;
  approval_v3_generated: false;
  wallet_collection_performed: false;
  prepare_calls: 0;
  session_calls: 0;
  caller_owned_continuation: {
    package_version: "1.13.2";
    requires_fresh_requote: true;
    requires_explicit_caller_approval_before_plan: true;
    plugin_returns_raw_quote: false;
    plugin_remains_read_only: true;
    quote_command: { executable: "npx"; args: string[] };
    unsigned_plan_command_template: { executable: "npx"; args: string[] };
    action_lifetime: {
      quote_ttl_seconds: 60;
      action_bundle_ttl_seconds: 180;
      evm_onchain_deadline_seconds: 240;
      wallet_ready_minimum_remaining_seconds: 120;
    };
    wallet_ready_command_template: { executable: "npx"; args: string[] };
    caller_owned_runner_command_template: { executable: "npx"; args: string[] };
    caller_owned_runner: {
      policy_schema: "https://assetfare.dev/schemas/caller-owned-execution-policy-v2.json";
      key_location: "caller_wallet_adapter_only";
      remote_mcp_execution_tool: false;
      assetfare_server_key_access: false;
      assetfare_server_signs_or_submits: false;
    };
    outcome: "verified_unsigned_plan_only";
    wallet_signs_and_submits: true;
    assetfare_server_signs_or_submits: false;
  };
};

export class AssetFareClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AssetFareClientError";
    this.code = code;
  }
}

export function parseQuoteIntent(input: {
  fromChain?: string;
  fromToken?: string;
  toChain?: string;
  toToken?: string;
  amountUsd?: string;
}): QuoteIntent {
  const from_chain = (input.fromChain || DEFAULT_QUOTE_INTENT.from_chain).trim().toLowerCase();
  const from_token = (input.fromToken || DEFAULT_QUOTE_INTENT.from_token).trim().toUpperCase();
  const to_chain = (input.toChain || DEFAULT_QUOTE_INTENT.to_chain).trim().toLowerCase();
  const to_token = (input.toToken || DEFAULT_QUOTE_INTENT.to_token).trim().toUpperCase();
  const amountText = (input.amountUsd || String(DEFAULT_QUOTE_INTENT.amount_usd)).trim();

  if (!(SOURCE_CHAINS as readonly string[]).includes(from_chain)) {
    throw new AssetFareClientError("ASSETFARE_INVALID_SOURCE_CHAIN", "Unsupported AssetFare source chain.");
  }
  if (!(DESTINATION_CHAINS as readonly string[]).includes(to_chain)) {
    throw new AssetFareClientError("ASSETFARE_INVALID_DESTINATION_CHAIN", "Unsupported AssetFare destination chain.");
  }
  if (!(TOKENS as readonly string[]).includes(from_token) || !(TOKENS as readonly string[]).includes(to_token)) {
    throw new AssetFareClientError("ASSETFARE_INVALID_TOKEN", "Unsupported AssetFare token symbol.");
  }
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amountText)) {
    throw new AssetFareClientError("ASSETFARE_INVALID_AMOUNT", "Amount must be a plain positive USD decimal.");
  }
  const amount_usd = Number(amountText);
  if (!Number.isFinite(amount_usd) || amount_usd < 1) {
    throw new AssetFareClientError("ASSETFARE_INVALID_AMOUNT", "AssetFare quote amount must be at least USD 1.");
  }

  const source = `${from_chain}:${from_token}`;
  const destination = `${to_chain}:${to_token}`;
  if (!ENDPOINTS.has(source)) {
    throw new AssetFareClientError("ASSETFARE_UNSUPPORTED_SOURCE", "Unsupported AssetFare source chain and token pair.");
  }
  if (!ENDPOINTS.has(destination)) {
    throw new AssetFareClientError("ASSETFARE_UNSUPPORTED_DESTINATION", "Unsupported AssetFare destination chain and token pair.");
  }
  if (source === destination) {
    throw new AssetFareClientError("ASSETFARE_IDENTITY_ROUTE", "Source and destination must be different.");
  }
  const validSourceOnly =
    from_token === "USDC" &&
    to_token === "USDC" &&
    (["polygon", "optimism"].includes(from_chain)
      ? ["base", "arbitrum"].includes(to_chain)
      : ["ethereum", "hyperevm"].includes(from_chain)
        ? ["base", "solana"].includes(to_chain)
        : false);
  if (SOURCE_ONLY_CHAINS.has(from_chain) && !validSourceOnly) {
    throw new AssetFareClientError("ASSETFARE_UNSUPPORTED_ROUTE", "That source-only route is not supported.");
  }

  return { from_chain, from_token, to_chain, to_token, amount_usd };
}

export async function getCapabilities(fetchImpl: FetchLike): Promise<Record<string, unknown>> {
  const payload = await requestJson(fetchImpl, CAPABILITIES_URL, { method: "GET" });
  const capabilities = requireRecord(payload, "ASSETFARE_UNSAFE_CAPABILITIES");
  rejectUnsafeOutput(capabilities);

  if (
    capabilities.status !== "capped_public_agent_release" ||
    capabilities.public_api_enabled !== true ||
    capabilities.directed_conversion_routes !== 80 ||
    capabilities.server_signing !== false ||
    capabilities.server_submission !== false
  ) {
    throw new AssetFareClientError(
      "ASSETFARE_UNSAFE_CAPABILITIES",
      "AssetFare capabilities failed the read-only safety boundary.",
    );
  }
  const directRouteContract = requireRecord(capabilities.direct_route_summary, "ASSETFARE_UNSAFE_CAPABILITIES");
  if (
    directRouteContract.version !== "assetfare-direct-route-summary-v1" ||
    directRouteContract.required_on_every_quote !== true ||
    directRouteContract.route_count !== 80 ||
    directRouteContract.step_count !== 188 ||
    directRouteContract.ordered_provider_path !== true ||
    directRouteContract.normalized_chain_asset_endpoints !== true ||
    directRouteContract.assetfare_fee_step_bound !== true ||
    directRouteContract.base_unit_amounts_are_decimal_strings !== true ||
    directRouteContract.route_aggregator_used_scope !== "assetfare_engine_only" ||
    directRouteContract.server_signing !== false ||
    directRouteContract.server_submission !== false ||
    !Array.isArray(directRouteContract.classification_values) ||
    directRouteContract.classification_values.length !== 2 ||
    !directRouteContract.classification_values.includes("direct_protocol_only") ||
    !directRouteContract.classification_values.includes("external_intent")
  ) {
    throw new AssetFareClientError(
      "ASSETFARE_UNSAFE_CAPABILITIES",
      "AssetFare direct-route capabilities did not match the required contract.",
    );
  }
  try {
    validateCapabilitiesEconomicGuidance(capabilities);
  } catch {
    throw new AssetFareClientError(
      "ASSETFARE_UNSAFE_CAPABILITIES",
      "AssetFare capabilities did not publish the current route-specific best-from contract.",
    );
  }
  const assetEndpoints = capabilities.asset_endpoints;
  if (!Array.isArray(assetEndpoints) || assetEndpoints.length !== ENDPOINTS.size) {
    throw new AssetFareClientError("ASSETFARE_UNSAFE_CAPABILITIES", "AssetFare endpoint capabilities are incomplete.");
  }
  const receivedEndpoints = new Set(
    assetEndpoints.map((entry) => {
      const value = requireRecord(entry, "ASSETFARE_UNSAFE_CAPABILITIES");
      return `${String(value.chain)}:${String(value.token)}`;
    }),
  );
  if (receivedEndpoints.size !== ENDPOINTS.size || [...ENDPOINTS].some((endpoint) => !receivedEndpoints.has(endpoint))) {
    throw new AssetFareClientError(
      "ASSETFARE_UNSAFE_CAPABILITIES",
      "AssetFare endpoint capabilities did not match the expected set.",
    );
  }

  return structuredClone(capabilities);
}

export async function getQuote(
  fetchImpl: FetchLike,
  intent: QuoteIntent,
): Promise<{ quote: Record<string, unknown>; continuation_descriptor: ContinuationDescriptor; guidance: QuoteGuidance }> {
  const payload = await requestJson(fetchImpl, QUOTE_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(intent),
  });
  const quote = requireRecord(payload, "ASSETFARE_UNSAFE_QUOTE");
  rejectUnsafeOutput(quote);
  validateQuote(quote, intent);
  let validatedQuote: Record<string, unknown>;
  try {
    validatedQuote = validateQuoteDirectRoute(quote, {
      fromChain: intent.from_chain,
      fromToken: intent.from_token,
      toChain: intent.to_chain,
      toToken: intent.to_token,
      amountUsd: intent.amount_usd,
    });
  } catch {
    throw new AssetFareClientError(
      "ASSETFARE_UNSAFE_QUOTE",
      "AssetFare quote failed the current direct-route and best-from contract.",
    );
  }
  const directRouteSummary = requireRecord(
    validatedQuote.direct_route_summary,
    "ASSETFARE_UNSAFE_QUOTE",
  );
  let continuationDescriptor: ContinuationDescriptor;
  try {
    continuationDescriptor = validateContinuationDescriptor(quote, directRouteSummary);
  } catch {
    throw new AssetFareClientError(
      "ASSETFARE_UNSAFE_QUOTE",
      "AssetFare quote failed the exact continuation_v3 contract.",
    );
  }

  const safeQuote = structuredClone(validatedQuote);
  delete safeQuote.execution;
  delete safeQuote.caller_action_plan_handoff;
  delete safeQuote.caller_action_plan_handoff_v2;
  delete safeQuote.handoff_schema_version;
  delete safeQuote.continuation_v3;
  safeQuote.direct_route_summary = directRouteSummary;

  return {
    quote: safeQuote,
    continuation_descriptor: continuationDescriptor,
    guidance: createGuidance(
      intent,
      directRouteSummary,
      requireRecord(validatedQuote.economic_guidance, "ASSETFARE_UNSAFE_QUOTE"),
      continuationDescriptor,
    ),
  };
}

function createGuidance(
  intent: QuoteIntent,
  directRouteSummary: Record<string, unknown>,
  economicGuidance: Record<string, unknown>,
  descriptor: ContinuationDescriptor,
): QuoteGuidance {
  const bestFromUsd = Number(economicGuidance.advisory_start_usd);
  return {
    read_only: true,
    one_dollar_smoke_only: intent.amount_usd === 1,
    intended_amount_usd: intent.amount_usd,
    best_from_usd: bestFromUsd,
    use_assetfare_first_at_or_above_best_from: intent.amount_usd >= bestFromUsd,
    best_from_not_100_percent_guarantee: true,
    confirm_fresh_assetfare_quote: true,
    compare_with_other_routes: false,
    selection_status: "unranked_candidate",
    wallet_authentication_performed: false,
    action_prepared: false,
    session_created: false,
    transaction_signed: false,
    transaction_submitted: false,
    server_signing: false,
    server_submission: false,
    direct_route_summary_verified: true,
    ordered_provider_path_verified: true,
    normalized_chain_asset_endpoints_verified: true,
    amount_continuity_verified: true,
    assetfare_fee_step_verified: true,
    route_classification: directRouteSummary.classification as "direct_protocol_only" | "external_intent",
    assetfare_engine_route_aggregator_used: false,
    provider_internal_dex_aggregation_possible:
      directRouteSummary.provider_internal_dex_aggregation_possible as boolean,
    continuation_v3_verified: true,
    automatic_selection_forbidden: true,
    approval_v3_generated: false,
    wallet_collection_performed: false,
    prepare_calls: 0,
    session_calls: 0,
    caller_owned_continuation: {
      package_version: "1.13.2",
      requires_fresh_requote: true,
      requires_explicit_caller_approval_before_plan: true,
      plugin_returns_raw_quote: false,
      plugin_remains_read_only: true,
      quote_command: {
        executable: "npx",
        args: [
          "--yes",
          "--package=assetfare-mcp@1.13.2",
          "assetfare-route-eval",
          "--amount",
          String(intent.amount_usd),
          "--from-chain",
          intent.from_chain,
          "--from-token",
          intent.from_token,
          "--to-chain",
          intent.to_chain,
          "--to-token",
          intent.to_token,
          "--quote-output",
          "quote.json",
        ],
      },
      unsigned_plan_command_template: {
        executable: "npx",
        args: [
          "--yes",
          "--package=assetfare-mcp@1.13.2",
          "assetfare-plan",
          "--caller-approved",
          "--mode",
          "session",
          "--quote",
          "quote.json",
          "--select-exact-quote-bounds",
          ...descriptor.required_wallet_chains.flatMap((chain) => [
            "--wallet",
            `${chain}=<CALLER_${chain.toUpperCase()}_PUBLIC_ADDRESS>`,
          ]),
          ...(descriptor.event_signer_public_required
            ? ["--event-signer-public", "<CALLER_EPHEMERAL_SOLANA_PUBLIC_KEY>"]
            : []),
          "--session-token-output",
          "./session-capability.json",
          "--wallet-handoff-output",
          "./caller-wallet-handoff.json",
        ],
      },
      action_lifetime: {
        quote_ttl_seconds: 60,
        action_bundle_ttl_seconds: 180,
        evm_onchain_deadline_seconds: 240,
        wallet_ready_minimum_remaining_seconds: 120,
      },
      wallet_ready_command_template: {
        executable: "npx",
        args: [
          "--yes",
          "--package=assetfare-mcp@1.13.2",
          "assetfare-session",
          "--operation",
          "wallet-ready",
          "--capability-file",
          "./session-capability.json",
          "--idempotency-key",
          "<NEW_WALLET_READY_IDEMPOTENCY_KEY>",
          "--wallet-handoff-output",
          "./wallet-ready-handoff.json",
        ],
      },
      caller_owned_runner_command_template: {
        executable: "npx",
        args: [
          "--yes",
          "--package=assetfare-mcp@1.13.2",
          "assetfare-agent-runner",
          "--preflight",
          "--capability-file",
          "./session-capability.json",
          "--policy-file",
          "./caller-execution-policy.json",
          "--wallet-adapter",
          "./my-local-wallet-adapter.mjs",
        ],
      },
      caller_owned_runner: {
        policy_schema: "https://assetfare.dev/schemas/caller-owned-execution-policy-v2.json",
        key_location: "caller_wallet_adapter_only",
        remote_mcp_execution_tool: false,
        assetfare_server_key_access: false,
        assetfare_server_signs_or_submits: false,
      },
      outcome: "verified_unsigned_plan_only",
      wallet_signs_and_submits: true,
      assetfare_server_signs_or_submits: false,
    },
  };
}

async function requestJson(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...init,
      headers: { accept: "application/json", ...(init.headers || {}) },
      redirect: "manual",
      credentials: "omit",
      signal: controller.signal,
    });
  } catch {
    throw new AssetFareClientError("ASSETFARE_NETWORK_ERROR", "AssetFare request failed.");
  } finally {
    clearTimeout(timeout);
  }

  if (response.status >= 300 && response.status < 400) {
    throw new AssetFareClientError("ASSETFARE_REDIRECT_REJECTED", "AssetFare redirected a fixed API request.");
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.includes("application/json")) {
    throw new AssetFareClientError("ASSETFARE_INVALID_RESPONSE", "AssetFare returned a non-JSON response.");
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new AssetFareClientError("ASSETFARE_RESPONSE_TOO_LARGE", "AssetFare response exceeded the size limit.");
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    throw new AssetFareClientError("ASSETFARE_RESPONSE_TOO_LARGE", "AssetFare response exceeded the size limit.");
  }
  if (!response.ok) {
    throw new AssetFareClientError("ASSETFARE_UPSTREAM_ERROR", `AssetFare request failed with HTTP ${response.status}.`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AssetFareClientError("ASSETFARE_INVALID_RESPONSE", "AssetFare returned invalid JSON.");
  }
}

function validateQuote(quote: Record<string, unknown>, intent: QuoteIntent): void {
  const quotedIntent = requireRecord(quote.intent, "ASSETFARE_UNSAFE_QUOTE");
  const offer = requireRecord(quote.offer, "ASSETFARE_UNSAFE_QUOTE");
  const route = requireRecord(quote.route, "ASSETFARE_UNSAFE_QUOTE");
  const risk = requireRecord(quote.risk, "ASSETFARE_UNSAFE_QUOTE");
  if (
    quote.status !== "capped_public_agent_release" ||
    typeof quote.quote_id !== "string" ||
    typeof quote.as_of !== "string" ||
    !Number.isInteger(quote.ttl_seconds) ||
    (quote.ttl_seconds as number) <= 0 ||
    (quote.ttl_seconds as number) > 60 ||
    quotedIntent.from !== `${intent.from_chain}:${intent.from_token}` ||
    quotedIntent.to !== `${intent.to_chain}:${intent.to_token}` ||
    quotedIntent.amount_usd !== intent.amount_usd ||
    offer.output_symbol !== intent.to_token ||
    offer.assetfare_fee_bps !== 1 ||
    offer.fee_modeled_bps !== 1 ||
    offer.fee_collectible_now !== true ||
    route.server_signing !== false ||
    route.server_submission !== false ||
    risk.server_signing !== false ||
    risk.server_submission !== false
  ) {
    throw new AssetFareClientError("ASSETFARE_UNSAFE_QUOTE", "AssetFare quote failed the read-only safety boundary.");
  }
  if (
    typeof offer.expected_receive_amount !== "number" ||
    !Number.isFinite(offer.expected_receive_amount) ||
    (offer.expected_receive_amount as number) <= 0 ||
    typeof offer.estimated_min_receive_amount !== "number" ||
    !Number.isFinite(offer.estimated_min_receive_amount) ||
    (offer.estimated_min_receive_amount as number) <= 0 ||
    (offer.estimated_min_receive_amount as number) > (offer.expected_receive_amount as number) ||
    !Array.isArray(route.steps) ||
    route.steps.length < 1 ||
    route.steps.length > 8
  ) {
    throw new AssetFareClientError("ASSETFARE_UNSAFE_QUOTE", "AssetFare quote contained invalid route economics.");
  }
}

function rejectUnsafeOutput(value: unknown): void {
  const stack: Array<[unknown, number]> = [[value, 0]];
  let visited = 0;
  while (stack.length > 0) {
    const [node, depth] = stack.pop() as [unknown, number];
    visited += 1;
    if (visited > 1024 || depth > 16) {
      throw new AssetFareClientError("ASSETFARE_UNSAFE_RESPONSE", "AssetFare response exceeded safety inspection limits.");
    }
    if (Array.isArray(node)) {
      for (const child of node) stack.push([child, depth + 1]);
      continue;
    }
    if (!node || typeof node !== "object") continue;
    for (const [key, child] of Object.entries(node)) {
      const normalized = key.toLowerCase().replaceAll("_", "").replaceAll("-", "");
      if ((normalized.endsWith("serversigning") || normalized.endsWith("serversubmission")) && child !== false) {
        throw new AssetFareClientError(
          "ASSETFARE_UNSAFE_RESPONSE",
          "AssetFare response did not preserve the non-custodial boundary.",
        );
      }
      if ((normalized === "signed" || normalized === "submitted") && child !== false) {
        throw new AssetFareClientError(
          "ASSETFARE_UNSAFE_RESPONSE",
          "AssetFare response claimed signed or submitted material.",
        );
      }
      if (FORBIDDEN_OUTPUT_KEYS.some((term) => normalized.includes(term))) {
        throw new AssetFareClientError(
          "ASSETFARE_UNSAFE_RESPONSE",
          "AssetFare response contained forbidden secret or signed material.",
        );
      }
      stack.push([child, depth + 1]);
    }
  }
}

function requireRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AssetFareClientError(code, "AssetFare response did not match the expected schema.");
  }
  return value as Record<string, unknown>;
}
