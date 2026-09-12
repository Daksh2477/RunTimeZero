// No toolbox: hardhat-toolbox v5 requires Hardhat 3. We pull in only the two
// plugins the tests actually need, which is fewer moving parts to keep in step.
require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-chai-matchers');

// .cjs, not .ts: the root package.json is ESM and Hardhat wants CommonJS, and
// a TS config would drag in a toolchain we do not otherwise need here.
/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: '0.8.28',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    // Polygon Amoy testnet. Free gas from faucet.polygon.technology.
    // ORACLE_PRIVATE_KEY must be a throwaway key — never one holding real funds.
    amoy: {
      url: process.env.AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology',
      accounts: process.env.ORACLE_PRIVATE_KEY ? [process.env.ORACLE_PRIVATE_KEY] : [],
      chainId: 80002,
    },
  },
  paths: { sources: './contracts', tests: './test', artifacts: './artifacts' },
};
