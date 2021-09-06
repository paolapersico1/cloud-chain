pragma solidity 0.5.16;
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

    struct File {
        bytes32 ID;         //hash of filepath
        bool onCloud;
        string[] states;   
        bytes32[] digests;     //hash of last content
        string url;         //hash of last url
    }
    
    //Sla private sla;
    mapping ( bytes32 => File ) private files;
    
    function EqualStrings(string memory a, string memory b) private pure returns (bool) {
        return (Hash(a) == Hash(b));
    }
    
    function Hash(string memory str) private pure returns(bytes32){
        return (sha256(abi.encodePacked(str)));
    }
    
    modifier OnlyUser {require (msg.sender == user); _;}
    modifier OnlyCloud {require (msg.sender == cloud); _;}
    modifier FileInBC (string memory filepath) {
        bytes32 i = Hash(filepath);
        require (i != 0x0 && files[i].ID != 0x0);
        _;
    }
    modifier FileOnCloud (string memory filepath, bool onCloud) {
        bytes32 i = Hash(filepath);
        bool inBC = files[i].ID != 0x0;
        if (onCloud)
            require (i != 0x0 && inBC && files[i].onCloud);
        else
            require (! inBC ||  ! files[i].onCloud);
        _;
    }
    modifier FileState (string memory filepath, string memory prevState) {
        bytes32 i = Hash(filepath);
        bool inBC = files[i].ID != 0x0;
        string memory lastState = files[i].states[files[i].states.length - 1];
        require (i != 0x0 && inBC && EqualStrings(lastState, prevState));
        _;
    }

    constructor() public {
        cloud = msg.sender;
    }
    
    function SetUser(address _user) external OnlyCloud{
        user = _user;
    }
    
    function UploadRequest(string calldata filepath) external OnlyUser FileOnCloud(filepath, false){
        bytes32 i = Hash(filepath);
        files[i].ID = i;
        files[i].states.push("uploadRequested");
    }
    
    function UploadRequestAck(string calldata filepath) external OnlyCloud FileState(filepath, "uploadRequested"){
        bytes32 i = Hash(filepath);
        files[i].states.push("uploadRequestAck");
    }
    
    function UploadTransferAck(string calldata filepath, bytes32 digest) external OnlyCloud FileState(filepath, "uploadRequestAck"){
        bytes32 i = Hash(filepath);
        files[i].states.push("uploadTransferAck");
        files[i].digests.push(digest);
    }
    
    function UploadConfirm(string calldata filepath, bool ack) external OnlyUser FileState(filepath, "uploadTransferAck"){
        bytes32 i = Hash(filepath);
        bytes32 lastDigest = files[i].digests[files[i].digests.length - 1];
        if(ack){
            files[i].states.push("uploaded"); 
            files[i].onCloud = true;
        }
        else
            files[i].states.push("deleteRequested");
    }
    
    function DeleteRequest(string calldata filepath) external OnlyUser FileOnCloud(filepath, true){
        bytes32 i = Hash(filepath);
        files[i].states.push("deleteRequested");
    }
    
    function Delete(string calldata filepath) external OnlyCloud FileState(filepath, "deleteRequested"){
        bytes32 i = Hash(filepath);
        files[i].states.push("deleted");
        files[i].onCloud = false;
    }
    
    function ReadRequest(string calldata filepath) external OnlyUser FileOnCloud(filepath, true){
        bytes32 i = Hash(filepath);
        files[i].states.push("readRequested");
    }
    
    function ReadRequestAck(string calldata filepath, string calldata url) external OnlyCloud FileState(filepath, "readRequested"){
        bytes32 i = Hash(filepath);
        files[i].states.push("readRequestAck");
        files[i].url = url;
    }
    
    function ReadRequestDeny(string calldata filepath) external OnlyCloud FileState(filepath, "readRequested"){
        bytes32 i = Hash(filepath);
        files[i].states.push("readDeny");
        LostFileCheck(i);
    }
    
    //TODO ARBITRATOR
    function GetFile(string memory filepath) public view FileInBC(filepath) returns(bytes32, string [] memory, bool, bytes32 [] memory, string memory){
        bytes32 i = Hash(filepath);
        return (files[i].ID, files[i].states, files[i].onCloud, files[i].digests, files[i].url);
    }
    
    function LostFileCheck(bytes32 ID) internal returns(bool){
        bool res = false;
        if(!OperationAfterUpload(ID, "deleteRequested")){
            //TODO Compensate();
            res = true;
        }
        return(res);    
    }
    
    function CorruptedFileCheck(string calldata filepath) external returns(bool){
        bytes32 i = Hash(filepath);
        bool res = false;
        if(!OperationAfterUpload(i, "deleteRequested")){
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
    function OperationAfterUpload(bytes32 ID, string memory operation) internal view returns(bool){
        //get index of last uploaded state and last deleted state if present
        uint uploadedTime;
        uint operationTime;
        bool uploadedFound = false;
        bool operationFound = false;
        for (uint j = files[ID].states.length - 1; j >= 0; j--) {
            if(!operationFound && EqualStrings(files[ID].states[j], operation)){
                operationTime = j;   
                operationFound = true;
            }
            else if(!uploadedFound && EqualStrings(files[ID].states[j], "uploaded")){
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