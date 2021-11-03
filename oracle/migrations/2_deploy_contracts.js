var FileDigestOracle = artifacts.require("FileDigestOracle");

module.exports = function(deployer) {
  deployer.deploy(FileDigestOracle);
};