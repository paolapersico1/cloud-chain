// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

/**
 * @title CloudSLA
 * @dev 
 */
contract CloudSLA {
    address private user = 0x627306090abaB3A6e1400e9345bC60c78a8BEf57;
    address private cloud;
    
    /*struct Sla{
        uint price;
        bool paid;
        uint violationCount;
        uint monitoringPeriod;
    }*/
    
    enum State {defaultValue, uploadRequested, uploadRequestAck, uploadTransferAck, uploaded, 
                deleteRequested, deleted, readRequested, readRequestAck, readDeny }

    struct File {
        bytes32 ID;         //hash of filepath
        bool onCloud;
        State[] states;   
        bytes32[] digests;     //hash of last content
        string url;         //hash of last url
    }
    
    //Sla private sla;
    mapping ( bytes32 => File ) private files;
    
    
    function Hash(string memory str) private pure returns(bytes32){
        return (sha256(abi.encodePacked(str)));
    }
    
    modifier OnlyUser {require (msg.sender == user, "OnlyUser"); _;}
    modifier OnlyCloud {require (msg.sender == cloud, "OnlyCloud"); _;}
    modifier FileInBC (string memory filepath) {
        bytes32 i = Hash(filepath);
        require (i != 0x0 && files[i].ID != 0x0, "FileInBC");
        _;
    }
    modifier FileOnCloud (string memory filepath, bool onCloud) {
        bytes32 i = Hash(filepath);
        bool inBC = files[i].ID != 0x0;
        if (onCloud)
            require (i != 0x0 && inBC && files[i].onCloud, "FileOnCloud");
        else
            require (! inBC ||  ! files[i].onCloud, "FileNotOnCloud");
        _;
    }
    modifier FileState (string memory filepath, State prevState) {
        bytes32 i = Hash(filepath);
        bool inBC = files[i].ID != 0x0;
        State lastState = files[i].states[files[i].states.length - 1];
        require (i != 0x0 && inBC && lastState == prevState, "FileState");
        _;
    }
    
    event UploadRequested(address indexed _from, string filepath);
    event UploadRequestAcked(address indexed _from, string filepath);
    event UploadTransferAcked(address indexed _from, string filepath, bytes32 digest);
    event DeleteRequested(address indexed _from, string filepath);
    event Deleted(address indexed _from, string filepath);

    constructor() {
        cloud = msg.sender;
    }
    
    function SetUser(address _user) external OnlyCloud{
        user = _user;
    }
    
    function UploadRequest(string calldata filepath) external OnlyUser FileOnCloud(filepath, false){
        bytes32 i = Hash(filepath);
        files[i].ID = i;
        files[i].states.push(State.uploadRequested);
        emit UploadRequested(msg.sender, filepath);
    }
    
    function UploadRequestAck(string calldata filepath) external OnlyCloud FileState(filepath, State.uploadRequested){
        bytes32 i = Hash(filepath);
        files[i].states.push(State.uploadRequestAck);
        emit UploadRequestAcked(msg.sender, filepath);
    }
    
    function UploadTransferAck(string calldata filepath, bytes32 digest) external OnlyCloud FileState(filepath, State.uploadRequestAck){
        bytes32 i = Hash(filepath);
        files[i].states.push(State.uploadTransferAck);
        files[i].digests.push(digest);
        files[i].onCloud = true;
        emit UploadTransferAcked(msg.sender, filepath, digest);
    }
    
    function UploadConfirm(string calldata filepath, bool ack) external OnlyUser FileState(filepath, State.uploadTransferAck){
        bytes32 i = Hash(filepath);
        if(ack){
            files[i].states.push(State.uploaded); 
        }
        else{
            files[i].states.push(State.deleteRequested);
            emit DeleteRequested(msg.sender, filepath);
        }
    }
    
    function DeleteRequest(string calldata filepath) external OnlyUser FileOnCloud(filepath, true){
        bytes32 i = Hash(filepath);
        files[i].states.push(State.deleteRequested);
        emit DeleteRequested(msg.sender, filepath);
    }
    
    function Delete(string calldata filepath) external OnlyCloud FileState(filepath, State.deleteRequested){
        bytes32 i = Hash(filepath);
        files[i].states.push(State.deleted);
        files[i].onCloud = false;
        emit Deleted(msg.sender, filepath);
    }
    
    function ReadRequest(string calldata filepath) external OnlyUser FileOnCloud(filepath, true){
        bytes32 i = Hash(filepath);
        files[i].states.push(State.readRequested);
    }
    
    function ReadRequestAck(string calldata filepath, string calldata url) external OnlyCloud FileState(filepath, State.readRequested){
        bytes32 i = Hash(filepath);
        files[i].states.push(State.readRequestAck);
        files[i].url = url;
    }
    
    function ReadRequestDeny(string calldata filepath) external OnlyCloud FileState(filepath, State.readRequested){
        bytes32 i = Hash(filepath);
        files[i].states.push(State.readDeny);
        LostFileCheck(i);
    }
    
    //TODO ARBITRATOR
    function GetFile(string memory filepath) public view FileInBC(filepath) returns(bytes32, State [] memory, bool, bytes32 [] memory, string memory){
        bytes32 i = Hash(filepath);
        return (files[i].ID, files[i].states, files[i].onCloud, files[i].digests, files[i].url);
    }
    
    function LostFileCheck(bytes32 ID) internal view returns(bool){
        bool res = false;
        if(!OperationAfterUpload(ID, State.deleteRequested)){
            //TODO Compensate();
            res = true;
        }
        return(res);    
    }
    
    function CorruptedFileCheck(string calldata filepath) external view returns(bool){
        bytes32 i = Hash(filepath);
        bool res = false;
        if(!OperationAfterUpload(i, State.deleteRequested)){
            //TODO Compensate();
            res = true;
        }
        return(res);    
    }
    
    /*
    function UndeletedFileCheck(string calldata filepath) external returns(bool){
        bytes32 i = Hash(filepath);
        bool res = false;
        if(OperationAfterUpload(i, "deleted")){
            //TODO Compensate();
            res = true;
        }
        return(res);   
    }*/
    
    //check if there is an operation after last upload
    function OperationAfterUpload(bytes32 ID, State operation) internal view returns(bool){
        //get index of last uploaded state and last deleted state if present
        uint uploadedTime;
        uint operationTime;
        bool uploadedFound = false;
        bool operationFound = false;
        for (uint j = files[ID].states.length - 1; j >= 0; j--) {
            if(!operationFound && files[ID].states[j] == operation){
                operationTime = j;   
                operationFound = true;
            }
            else if(!uploadedFound && files[ID].states[j] == State.uploaded){
                uploadedTime= j;
                uploadedFound = true;
            }
            //early exit
            if(operationFound && uploadedFound)
                break;
        }
        return(operationFound && operationTime > uploadedTime);
    }
    
}