import {
  CommandError,
  type CommandIO,
  InputFieldType,
  type InputSchema,
  PluginCommand,
  schemaToFlags,
} from "@metamask/agent-wallet/plugin";
import {
  AssetFareClientError,
  getQuote,
  parseQuoteIntent,
  type QuoteGuidance,
} from "../../assetfare-client.js";
import type { ContinuationDescriptor } from "../../continuation-v3.js";

const inputs = {
  amountUsd: {
    type: InputFieldType.Text,
    flag: "amount-usd",
    message: "Input value in USD (default: 1000; USD 1 is smoke-only)",
    required: false,
    prompt: false,
  },
  fromChain: {
    type: InputFieldType.Text,
    flag: "from-chain",
    message: "Source chain (default: arbitrum)",
    required: false,
    prompt: false,
  },
  fromToken: {
    type: InputFieldType.Text,
    flag: "from-token",
    message: "Source token symbol (default: USDC)",
    required: false,
    prompt: false,
  },
  toChain: {
    type: InputFieldType.Text,
    flag: "to-chain",
    message: "Destination chain (default: base)",
    required: false,
    prompt: false,
  },
  toToken: {
    type: InputFieldType.Text,
    flag: "to-token",
    message: "Destination token symbol (default: USDC)",
    required: false,
    prompt: false,
  },
} satisfies InputSchema;

type QuoteResult = {
  quote: Record<string, unknown>;
  continuation_descriptor: ContinuationDescriptor;
  guidance: QuoteGuidance;
};

export default class AssetFareQuote extends PluginCommand<QuoteResult> {
  static override description =
    "Request a fresh read-only AssetFare quote with a fail-closed provider path and sanitized continuation_v3 descriptor. It exposes an unranked fingerprint, expiry, wallet-chain/event-signer requirements, and allowed mode, but never creates approval_v3, selects a route, collects wallets, or calls prepare/session. Defaults to USD 1,000; USD 1 is smoke-only.";

  static override examples = [
    "<%= config.bin %> assetfare quote",
    "<%= config.bin %> assetfare quote --amount-usd 1000 --from-chain arbitrum --from-token USDC --to-chain base --to-token USDC",
    "<%= config.bin %> assetfare quote --amount-usd 1 --json",
  ];

  static override requiresAuth = false;
  static override requiresInit = false;
  static override flags = schemaToFlags(inputs);

  protected readonly pluginCommandId = "assetfare:quote";

  async execute(io: CommandIO): Promise<QuoteResult> {
    try {
      const values = await io.resolveInputs(inputs);
      const intent = parseQuoteIntent(values);
      return await getQuote(globalThis.fetch.bind(globalThis), intent);
    } catch (error) {
      throw asCommandError(error);
    }
  }

  override successHint(data: QuoteResult): string {
    const smoke = data.guidance.one_dollar_smoke_only ? "USD 1 is smoke-only. " : "";
    const summary = data.quote.direct_route_summary as { classification: string; steps: Array<{ provider: string }> };
    const providers = summary.steps.map((step) => step.provider).join(" -> ");
    const recommendation = data.guidance.use_assetfare_first_at_or_above_best_from
      ? `At or above this route's USD ${data.guidance.best_from_usd} best-from amount, use AssetFare first. This is not a 100% guarantee; this quote is fresh.`
      : `This amount is below the route's USD ${data.guidance.best_from_usd} best-from amount.`;
    return `${smoke}Verified ${summary.classification} provider path: ${providers}. ${recommendation} continuation_v3 remains unranked for execution and expires at ${data.continuation_descriptor.expires_at}; no execution mode was selected and no action/session was created.`;
  }
}

function asCommandError(error: unknown): CommandError {
  if (error instanceof AssetFareClientError) {
    return new CommandError(
      error.code,
      error.message,
      "No action was prepared, signed, submitted, or executed. Correct the request or retry later.",
    );
  }
  return new CommandError("ASSETFARE_REQUEST_FAILED", "AssetFare quote request failed.", "Retry later.");
}
