# MetaMask Agent Wallet Plugin Examples

Example plugins for the [MetaMask Agent Wallet](https://docs.metamask.io/agent-wallet/),
managed as a monorepo.

## Plugins

| Plugin | Capabilities | What it does |
| --- | --- | --- |
| [sample](plugins/sample) | varies | Reference sample demonstrating the plugin API (ping, wallet-read, wallet-submit, reserved capabilities). |
| [ens](plugins/ens) | `wallet-read` | Resolve ENS names via the Agent Wallet. |
| [assetfare](plugins/assetfare) | none | Read AssetFare capabilities and request a fail-closed quote with a verified ordered provider path, normalized endpoints, amount continuity, and exact 1bp fee step. |

## Setup

Plugins are a beta feature of the CLI. One-time configuration:

```bash
mm config set experimentalPlugins true
mm config set experimentalAllowUnverifiedInstalls true   # allows local (file:) installs
```

Then build every plugin and link them all into your `mm` install:

```bash
yarn install
yarn setup           # = yarn build + yarn plugins:link
```

Individual steps:

```bash
yarn build           # tsc + oclif manifest in every workspace
yarn plugins:link    # mm plugins install file:<dir> --accept-permissions for each plugin
yarn plugins:unlink  # mm plugins uninstall for each plugin
```

Install plugins from their directory (as `yarn plugins:link` does), not from a packed tarball — the CLI
reads `package.json#mm` from the directory to persist capability approvals for local installs.
