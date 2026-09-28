import { CommandError, type CommandIO, PluginCommand } from "@metamask/agent-wallet/plugin";
import { AssetFareClientError, getCapabilities } from "../../assetfare-client.js";

export default class AssetFareCapabilities extends PluginCommand<Record<string, unknown>> {
  static override description =
    "Read AssetFare's public route capabilities and verify the REST 2.3.0 direct-route/no-sign contract without wallet permissions, authentication, or initialization.";

  static override examples = ["<%= config.bin %> assetfare capabilities", "<%= config.bin %> assetfare capabilities --json"];

  static override requiresAuth = false;
  static override requiresInit = false;

  protected readonly pluginCommandId = "assetfare:capabilities";

  async execute(_io: CommandIO): Promise<Record<string, unknown>> {
    try {
      return await getCapabilities(globalThis.fetch.bind(globalThis));
    } catch (error) {
      throw asCommandError(error);
    }
  }
}

function asCommandError(error: unknown): CommandError {
  if (error instanceof AssetFareClientError) {
    return new CommandError(error.code, error.message, "Retry later and do not proceed unless the read-only safety checks pass.");
  }
  return new CommandError("ASSETFARE_REQUEST_FAILED", "AssetFare request failed.", "Retry later.");
}
