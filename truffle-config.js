const PrivateKeyProvider = require("truffle-hdwallet-provider");

// insert the private key of the account used in metamask eg: Account 12
// address 0xFE3B557E8Fb62b89F4916B721be55cEb828dBd73
const privateKey = process.env.PRIVATE_KEY || "0x8f2a55949038a9610f50fb23b5883af3b4ecb3c3bb792cbcefbd1542c692be63";

module.exports = {
  // See <http://truffleframework.com/docs/advanced/configuration>
  // for more about customizing your Truffle configuration!
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*", // Match any network id
      gasPrice: 0    
    },
    quickstartWallet: {
      provider: () => new PrivateKeyProvider(privateKey, "http://localhost:8545"),
      network_id: "*",
      gasPrice: 0
    }
  },
  compilers: {
    solc: {
      version: "^0.8.0",    // Fetch exact version from solc-bin (default: truffle's version)
      // docker: true,        // Use "0.5.1" you've installed locally with docker (default: false)
      // settings: {          // See the solidity docs for advice about optimization and evmVersion
      //  optimizer: {
      //    enabled: false,
      //    runs: 200
      //  },
      evmVersion: "byzantium"
      // }
    }
  }
};
