var CloudSLA = artifacts.require("CloudSLA");

module.exports = function(deployer) {
  //constructor (address _user, uint _price, uint _validityDuration, uint lostFileCredits, uint undeletedFileCredits)
  let user = '0x627306090abaB3A6e1400e9345bC60c78a8BEf57';
  let price = 5 * (10**18); //5 ether in wei
  let monthlyValidityDuration = 30 * 24 * 60 * 60; //1 month in seconds
  let testValidityDuration = 5 * 60; //5 minutes in seconds

  deployer.deploy(CloudSLA, user, String(price), String(testValidityDuration), 1, 1);
};