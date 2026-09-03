import {
  CommandError,
  type CommandIO,
  InputFieldType,
  type InputSchema,
  PluginCommand,
  schemaToArgs,
  schemaToFlags,
} from "@metamask/agent-wallet/plugin";
import { type Address, createPublicClient, custom, isAddress } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

const MAINNET_CHAIN_ID = mainnet.id;

const inputs = {
  query: {
    type: InputFieldType.Text,
    flag: "query",
    message: "ENS name (e.g. vitalik.eth) or 0x address to reverse-resolve",
    required: true,
    index: 0,
  },
} satisfies InputSchema;

type EnsResolution = {
  input: string;
  kind: "name" | "address";
  name: string | null;
  address: string | null;
};

export default class EnsResolve extends PluginCommand<EnsResolution> {
  static override description =
    "Resolve an ENS name to its address, or reverse-resolve an address to its primary ENS name (Ethereum mainnet).";

  static override examples = [
    "<%= config.bin %> ens resolve vitalik.eth",
    "<%= config.bin %> ens resolve 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "<%= config.bin %> ens resolve vitalik.eth --json",
  ];

  static override requiresAuth = true;
  static override requiresInit = false;
  static override flags = schemaToFlags(inputs);
  static override args = schemaToArgs(inputs);

  protected readonly pluginCommandId = "ens:resolve";

  async execute(io: CommandIO): Promise<EnsResolution> {
    const { query } = await io.resolveInputs(inputs);
    // The host-provided client carries no chain definition, so viem's ENS
    // actions cannot look up the Universal Resolver themselves. Reuse the
    // host's transport (and therefore its authenticated RPC) under a
    // chain-aware client so the resolver address comes from viem's chain
    // registry rather than being pinned here.
    const client = createPublicClient({
      chain: mainnet,
      transport: custom(this.ctx.publicClient(MAINNET_CHAIN_ID).transport),
    });

    if (isAddress(query)) {
      const name = await client
        .getEnsName({ address: query as Address })
        .catch(rethrowAsRpcError);
      if (!name) {
        throw new CommandError(
          "ENS_NO_PRIMARY_NAME",
          `No primary ENS name is set for ${query}.`,
          "Reverse resolution only works when the address owner has set a primary name."
        );
      }
      return { input: query, kind: "address", name, address: query };
    }

    let name: string;
    try {
      name = normalize(query);
    } catch {
      throw new CommandError(
        "ENS_INVALID_NAME",
        `'${query}' is not a valid ENS name or 0x address.`,
        "Pass a name like vitalik.eth or a 40-hex-character 0x address."
      );
    }

    const address = await client
      .getEnsAddress({ name })
      .catch(rethrowAsRpcError);
    if (!address) {
      throw new CommandError("ENS_NAME_NOT_FOUND", `'${name}' does not resolve to an address.`, "Check the spelling of the name.");
    }
    return { input: query, kind: "name", name, address };
  }

  override successHint(data: EnsResolution): string {
    return data.kind === "name" ? `${data.name} → ${data.address}` : `${data.address} → ${data.name}`;
  }
}

function rethrowAsRpcError(error: unknown): never {
  throw new CommandError(
    "ENS_RPC_ERROR",
    `ENS lookup failed: ${error instanceof Error ? error.message : String(error)}`,
    "Check your connection and try again."
  );
}
