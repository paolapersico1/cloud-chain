const dotenv = require('dotenv');
const HDWalletProvider = require("truffle-hdwallet-provider");
const Web3 = require('Web3');
const wsProvider = new Web3.providers.WebsocketProvider("ws://localhost:8546");
HDWalletProvider.prototype.on = wsProvider.on.bind(wsProvider);

// insert the private key of the account used in metamask eg: Account 14
// address 0xf17f52151EbEF6C7334FAD080c5704D77216b732
dotenv.config();
const privateKey = process.env.PRIVATE_KEY || "0xae6ae8e5ccbfb04590405997ee2d52d2b330726137b875053c36d94e974d162f";

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
      provider: () => new HDWalletProvider(privateKey, wsProvider),
      network_id: "*",
      gasPrice: 0,
      websockets: true
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
