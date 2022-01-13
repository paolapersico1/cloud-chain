const Factory = artifacts.require("Factory");
const CloudSLA = artifacts.require("CloudSLA");
const FileDigestOracle = artifacts.require("FileDigestOracle");
var myInstance;
var oracleInstance;

contract("Factory", accounts => {
  it("CloudSLA creation and activation", async () => {
    const instance = await Factory.deployed();
    const price = 5 * (10**18); //5 ether in wei
    const monthlyValidityDuration = 30 * 24 * 60 * 60; //1 month in seconds
    const testValidityDuration = 60 * 60; //1 hour in seconds
    await instance.createChild(accounts[1], String(price), String(testValidityDuration), 1, 1, {from: accounts[0]})   
    const scAddress = await instance.getSmartContractAddress(accounts[1], {from: accounts[1]})
    myInstance = await CloudSLA.at(scAddress);
    oracleInstance = await FileDigestOracle.at("0xFa5B6432308d45B54A1CE1373513Fab77166436f");
    await myInstance.Deposit({from: accounts[1], value: price});
    assert.equal(1, 1);
  });

  it("Upload", async () => {
    //SLA Violation: undeleted file
    await myInstance.UploadRequest("test.pdf", {from: accounts[1]});
    await myInstance.UploadRequestAck("test.pdf", {from: accounts[0]});
    await myInstance.UploadTransferAck("test.pdf", "0x9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", {from: accounts[0]});
    await myInstance.UploadConfirm("test.pdf", true, {from: accounts[1]});
    assert.equal(1, 1);
  });

  it("Read", async () => {
    await myInstance.ReadRequest("test.pdf", {from: accounts[1]});
    await myInstance.ReadRequestAck("test.pdf", "www.test.com", {from: accounts[0]});
    assert.equal(1, 1);
  });

  it("Delete", async () => {
    await myInstance.DeleteRequest("test.pdf", {from: accounts[1]});
    await myInstance.Delete("test.pdf", {from: accounts[0]});
    assert.equal(1, 1);
  });

  it("File check for undeleted file", async () => {
    await myInstance.FileHashRequest("test.pdf", {from: accounts[1]});
    await oracleInstance.DigestStore("www.test.com", "0x9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", {from: accounts[2]});
    await myInstance.FileCheck("test.pdf", {from: accounts[1]});
    assert.equal(1, 1);
  });

  it("Another file upload", async () => {
    await myInstance.UploadRequest("test2.pdf", {from: accounts[1]});
    await myInstance.UploadRequestAck("test2.pdf", {from: accounts[0]});
    await myInstance.UploadTransferAck("test2.pdf", "0x1f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", {from: accounts[0]});
    await myInstance.UploadConfirm("test2.pdf", true, {from: accounts[1]});
    assert.equal(1, 1);
  });

  it("Read Deny with lost file check", async () => {
    await myInstance.ReadRequest("test2.pdf", {from: accounts[1]});
    await myInstance.ReadRequestDeny("test2.pdf", {from: accounts[0]});
    assert.equal(1, 1);
  });

  it("Another file upload + read", async () => {
    await myInstance.UploadRequest("test3.pdf", {from: accounts[1]});
    await myInstance.UploadRequestAck("test3.pdf", {from: accounts[0]});
    await myInstance.UploadTransferAck("test3.pdf", "0x2f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", {from: accounts[0]});
    await myInstance.UploadConfirm("test3.pdf", true, {from: accounts[1]});
    await myInstance.ReadRequest("test3.pdf", {from: accounts[1]});
    await myInstance.ReadRequestAck("test3.pdf", "www.test3.com", {from: accounts[0]});
    assert.equal(1, 1);
  });

  it("File Check for corrupted file", async () => {
    await myInstance.FileHashRequest("test3.pdf", {from: accounts[1]});
    await oracleInstance.DigestStore("www.test3.com", "0x4f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", {from: accounts[2]});
    await myInstance.FileCheck("test3.pdf", {from: accounts[1]});
    assert.equal(1, 1);
  });
});