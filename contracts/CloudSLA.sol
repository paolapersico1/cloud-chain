// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

contract Factory{
    mapping ( address => address ) private children; //from user to contract
    address private cloud;

    modifier OnlyCloud {require (msg.sender == cloud, "OnlyCloud"); _;}
    modifier Exists (address user) { require (children[user] != address(0), "Exists"); _;}

    event ChildCreated(address childAddress, address _user);

    constructor(){
        cloud = msg.sender;
    }

    function createChild(address _user, uint _price, uint _validityDuration, uint lostFileCredits, uint undeletedFileCredits) external OnlyCloud{
       CloudSLA child = new CloudSLA(msg.sender, _user, _price,  _validityDuration, lostFileCredits, undeletedFileCredits);
       children[_user] = address(child);
       emit ChildCreated(address(child), _user);
    }

    function getSmartContractAddress(address user) external view Exists(user) returns(address){
        return children[user];
    }
}

contract CloudSLA {
    address private oracle = 0x9e699d6c7ccf183F0B09675A9E867d1486EEF85b;
    address private user;
    address private cloud;
    
    struct Period{
        uint startTime;
        uint endTime;
    }
    
    enum Violation {lostFile, undeletedFile}
    
    struct Sla{
        bool paid;
        Period validityPeriod;
        uint credits;
    }
    
    enum State {defaultValue, uploadRequested, uploadRequestAck, uploadTransferAck, uploaded, 
                deleteRequested, deleted, readRequested, readRequestAck, readDeny, checkRequested}
                
    struct File {
        bytes32 ID;         //hash of filepath
        bool onCloud;
        State[] states;   
        bytes32[] digests;  //hashes of content
        string url;         //last url
    }
    
    mapping ( bytes32 => File ) private files;  
    uint price;
    mapping (Violation => uint) violationCredits;
    uint validityDuration;
    Sla private currentSLA;
   
    
    function Hash(string memory str) private pure returns(bytes32){
        return (sha256(abi.encodePacked(str)));
    }
    
    modifier OnlyUser {require (msg.sender == user, "OnlyUser"); _;}
    modifier OnlyCloud {require (msg.sender == cloud, "OnlyCloud"); _;}
    modifier OnlyUserOrCloud{ require ((msg.sender == user || msg.sender == cloud), "OnlyUserOrCloud");  _;}
    
    modifier FileInBC (string memory filepath) {
        bytes32 i = Hash(filepath);
        require (i != 0x0 && files[i].ID != 0x0, "FileInBC");
        _;
    }
    modifier FileOnCloud (string memory filepath, bool onCloud) {
        bytes32 i = Hash(filepath);
        bool inBC = files[i].ID != 0x0;
        if (onCloud){
            require (i != 0x0 && inBC && files[i].onCloud, "FileOnCloud");
        }
        else
            require (! inBC ||  ! files[i].onCloud, "FileNotOnCloud");
        _;
    }

    modifier NotBeingChecked(string memory filepath) {
        bytes32 i = Hash(filepath);
        bool inBC = files[i].ID != 0x0;
        require (!inBC || (files[i].states[files[i].states.length - 1] != State.checkRequested));
        _;
    }

    modifier FileState (string memory filepath, State prevState) {
        bytes32 i = Hash(filepath);
        bool inBC = files[i].ID != 0x0;
        State lastState = files[i].states[files[i].states.length - 1];
        require (i != 0x0 && inBC && lastState == prevState, "FileState");
        _;
    }
    
    modifier IsSLAValid(){
        require(block.timestamp >= currentSLA.validityPeriod.startTime && block.timestamp <= currentSLA.validityPeriod.endTime, 
                "SLAValidity");
        _;
    }
    
    modifier Activatable(uint sentValue){
        require(!currentSLA.paid && sentValue == price, "Activatable");
        _;
    }
    
    modifier ValidityPeriodEnded(){
        require(block.timestamp >= currentSLA.validityPeriod.endTime, 
                "ValidityPeriodEnded");
        _;
    }
    
    event Paid(address indexed _from, uint endTime, uint depositedValue);
    event CompensatedUser(address indexed _user, uint value);
    event PaidCloudProvider(address indexed _cloud, uint value);
    event UploadRequested(address indexed _from, string filepath);
    event UploadRequestAcked(address indexed _from, string filepath);
    event UploadTransferAcked(address indexed _from, string filepath, bytes32 digest);
    event DeleteRequested(address indexed _from, string filepath);
    event Deleted(address indexed _from, string filepath);
    event ReadRequested(address indexed _from, string filepath);
    event ReadRequestAcked(address indexed _from, string filepath, string url);
    event ReadRequestDenied(address indexed _from, string filepath, bool lostFile);
    event FileChecked(address indexed _from, string filepath, string msg);

    constructor (address _cloud, address _user, uint _price, uint _validityDuration, uint lostFileCredits, uint undeletedFileCredits) {
        cloud = _cloud;
        user = _user;
        price = _price;
        validityDuration = _validityDuration;
        violationCredits[Violation.lostFile] = lostFileCredits;
        violationCredits[Violation.undeletedFile] = undeletedFileCredits;
    }
    
    function Deposit() external payable OnlyUser Activatable(msg.value){
        currentSLA.paid = true;
        currentSLA.validityPeriod.startTime = block.timestamp;
        currentSLA.validityPeriod.endTime =  block.timestamp + validityDuration;
        emit Paid(msg.sender, currentSLA.validityPeriod.endTime, msg.value);
    }
    
    function EndSla() external OnlyUserOrCloud ValidityPeriodEnded {
        CompensateUser();
        PayCloudProvider();
        delete currentSLA;
    }
    
    function CompensateUser() internal {
        uint value = currentSLA.credits < price ? currentSLA.credits : price;
        payable(user).transfer(value);
        emit CompensatedUser(user, value);
    }
    
    function PayCloudProvider() internal{
        uint value = address(this).balance;
        payable(cloud).transfer(value);
        emit PaidCloudProvider(cloud, value);
    }
    
    function UploadRequest(string calldata filepath) external OnlyUser IsSLAValid FileOnCloud(filepath, false) NotBeingChecked(filepath){
        bytes32 i = Hash(filepath);
        files[i].ID = i;
        files[i].states.push(State.uploadRequested);
        emit UploadRequested(msg.sender, filepath);
    }
    
    function UploadRequestAck(string calldata filepath) external OnlyCloud IsSLAValid FileState(filepath, State.uploadRequested){
        bytes32 i = Hash(filepath);
        files[i].states.push(State.uploadRequestAck);
        emit UploadRequestAcked(msg.sender, filepath);
    }
    
    function UploadTransferAck(string calldata filepath, bytes32 digest) external OnlyCloud IsSLAValid FileState(filepath, State.uploadRequestAck){
        bytes32 i = Hash(filepath);
        files[i].states.push(State.uploadTransferAck);
        files[i].digests.push(digest);
        emit UploadTransferAcked(msg.sender, filepath, digest);
    }
    
    function UploadConfirm(string calldata filepath, bool ack) external OnlyUser IsSLAValid FileState(filepath, State.uploadTransferAck){
        bytes32 i = Hash(filepath);
        if(ack){
            files[i].states.push(State.uploaded); 
            files[i].onCloud = true;
        }
        else{
            files[i].states.push(State.deleteRequested);
            emit DeleteRequested(msg.sender, filepath);
        }
    }
    
    function DeleteRequest(string calldata filepath) external OnlyUser IsSLAValid FileOnCloud(filepath, true) NotBeingChecked(filepath){
        bytes32 i = Hash(filepath);
        files[i].states.push(State.deleteRequested);
        emit DeleteRequested(msg.sender, filepath);
    }
    
    function Delete(string calldata filepath) external OnlyCloud IsSLAValid FileState(filepath, State.deleteRequested){
        bytes32 i = Hash(filepath);
        files[i].states.push(State.deleted);
        files[i].onCloud = false;
        emit Deleted(msg.sender, filepath);
    }
    
    function ReadRequest(string calldata filepath) external OnlyUser IsSLAValid FileOnCloud(filepath, true) NotBeingChecked(filepath){
        bytes32 i = Hash(filepath);
        files[i].states.push(State.readRequested);
        emit ReadRequested(msg.sender, filepath);
    }
    
    function ReadRequestAck(string calldata filepath, string calldata url) external OnlyCloud IsSLAValid FileState(filepath, State.readRequested){
        bytes32 i = Hash(filepath);
        files[i].states.push(State.readRequestAck);
        files[i].url = url;
        emit ReadRequestAcked(msg.sender, filepath, url);
    }
    
    function ReadRequestDeny(string calldata filepath) external OnlyCloud IsSLAValid FileState(filepath, State.readRequested){
        bytes32 i = Hash(filepath);
        files[i].states.push(State.readDeny);
        emit ReadRequestDenied(msg.sender, filepath, LostFileCheck(i));
    }
    
    function LostFileCheck(bytes32 ID) internal returns(bool){
        bool lostFile = !OperationAfterUpload(ID, State.deleteRequested);
        if(lostFile){
            currentSLA.credits = currentSLA.credits + violationCredits[Violation.lostFile];
        }
        return(lostFile);    
    }
    
    function FileHashRequest(string calldata filepath) external OnlyUser IsSLAValid FileInBC(filepath){
        bytes32 i = Hash(filepath);
        FileDigestOracle(oracle).DigestRequest(files[i].url);
        if(files[i].states[files[i].states.length - 1] != State.checkRequested)  
            files[i].states.push(State.checkRequested);
    }

    function FileCheck(string calldata filepath) external OnlyUser IsSLAValid FileInBC(filepath) FileState(filepath, State.checkRequested){
        bytes32 i = Hash(filepath);
        bool intactOnCloud = (files[i].digests[files[i].digests.length - 1] == FileDigestOracle(oracle).DigestRetrieve(files[i].url)); 
        string memory res = "No SLA violations.";
        
        if(!files[i].onCloud && intactOnCloud) {
            res = "Cloud should have deleted the file but it did not.";
            currentSLA.credits = currentSLA.credits + violationCredits[Violation.undeletedFile];
        }else if (files[i].onCloud && !intactOnCloud){
            res = "File has been corrupted.";
           currentSLA.credits = currentSLA.credits + violationCredits[Violation.lostFile];
        }
        //restore previous state
        files[i].states.push(files[i].states[files[i].states.length - 2]);
        emit FileChecked(msg.sender, filepath, res);
    }
    
    //check if there is an operation after last upload
    function OperationAfterUpload(bytes32 ID, State operation) internal view returns(bool){
        //get index of last uploaded state and last deleted state if present
        uint uploadedTime;
        uint operationTime;
        bool uploadedFound = false;
        bool operationFound = false;
        for (uint j = files[ID].states.length; j > 0; j--) {
            if(!operationFound && files[ID].states[j-1] == operation){
                operationTime = j-1;   
                operationFound = true;
            }
            else if(!uploadedFound && files[ID].states[j-1] == State.uploaded){
                uploadedTime= j-1;
                uploadedFound = true;
            }
            //early exit
            if(operationFound && uploadedFound)
                break;
        }
        return(operationFound && operationTime > uploadedTime);
    }
    
    function GetFile(string memory filepath) public view FileInBC(filepath) returns(bytes32, State [] memory, bool, bytes32 [] memory, string memory){
        bytes32 i = Hash(filepath);
        return (files[i].ID, files[i].states, files[i].onCloud, files[i].digests, files[i].url);
    }
    
    function GetSLAInfo() public view returns(bool, uint, uint, uint){
        return (currentSLA.paid, currentSLA.validityPeriod.startTime, currentSLA.validityPeriod.endTime, currentSLA.credits);
    }
}

interface FileDigestOracle {
    function DigestRequest(string calldata url) external;
    function DigestRetrieve(string calldata url) external view returns(bytes32);
}