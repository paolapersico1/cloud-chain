STEPS TO REPRODUCE THE RESULTS

Hyperledger Besu/GoQuorum:
1. follow the tutorial at https://consensys.net/quorum/products/guides/getting-started-with-consensys-quorum/ to setup and run the network on Docker
2. in the terminal, go to the /oracle folder and execute "npm restart"
3. take note of the FileDigestOracle contract address
4. go to the /cloud-chain/contracts folder, open the CloudSLA.sol file and replace the oracle address
5. (to run the project) 
	a. go to the /cloud-chain/public/assets folder, open the app.js file and replace the oracle address (web3OracleContractInstance)
	b. edit the "hosts" file of the o.s. by adding the line "127.0.0.1 cloudchain.com"
	c. in the terminal, go to the /cloud-chain folder and execute "npm restart" 
6. (to test the performance) 
	a. go to the /cloud-chain/test folder, open the cloudsla.js file and replace the oracle address
	b. in the terminal, go to the /cloud-chain folder and execute "truffle test --network quickstartWallet"

Note: to switch between the blockchains:
	1. remove the container
	2. execute "./run.sh" in the directory of the new blockchain
	3. repeat steps 4-8

Polygon:
1. follow the tutorial at https://sdk-docs.polygon.technology/docs/get-started/set-up-ibft-locally to setup and run the network
	a. initialize the 4 nodes' folders
	b. generate the genesis file premining the nodes and increasing the block gas limit (e.g. to 10000000000000000000)
	c. run the nodes
	d. execute "polygon-sdk server --chain genesis.json --dev --log-level debug" to run the rpc node
2. take note of the private keys of the nodes (which can be found in the validator.key files in the /test-chain-NUMBER/consensus folders)
3. in the truffle-config.js file in /cloud-chain folder, replace the private keys (polygonPrivateKeys)
4. do the same in the truffle-config.js file in /oracle folder
5. in the terminal, go to the /oracle folder and execute "truffle migrate --reset --network polygon";
6. take note of the FileDigestOracle contract address
7. go to the /cloud-chain/contracts folder, open the CloudSLA.sol file and replace the oracle address
8. (to test the performance) 
	a. go to the /cloud-chain/test folder, open the cloudsla.js file and replace the oracle address
	b. in the terminal, go to the /cloud-chain folder and execute "truffle test --network polygon"