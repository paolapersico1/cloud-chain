// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

/**
 * @title FileDigestOracle
 * @dev 
 */
contract FileDigestOracle {

    address private oracle;
    
    struct Request {
        bytes32 ID;
        bytes32 digest;
    }
    
    mapping ( bytes32 => Request ) private requests;
    
    modifier OnlyOracle {require (msg.sender == oracle, "OnlyOracle"); _;}
    
    modifier RequestExists(string memory url) { 
        bytes32 i = Hash(url);
        require(i != 0x0 && requests[i].ID != 0x0, "RequestExists");
        _;
    }

    constructor() {
        oracle = msg.sender;
    }
 
    function Hash(string memory str) private pure returns(bytes32){
        return (sha256(abi.encodePacked(str)));
    }
    
    event DigestRequested(address indexed _from, bytes32 requestID, string url);
    event DigestComputed(address indexed _from,  bytes32 requestID, string url, bytes32 digest);
    
    function DigestRequest(string calldata url) external{
        bytes32 i = Hash(url);
        requests[i].ID = i;
        emit DigestRequested(msg.sender, i, url);
    }
    
    function DigestStore(string calldata url, bytes32 digest) external OnlyOracle RequestExists(url){
        bytes32 i = Hash(url);
        requests[i].digest = digest;
        emit DigestComputed(msg.sender, i, url, digest);
    }

    function DigestRetrieve(string calldata url) external view RequestExists(url) returns(bytes32){
        bytes32 i = Hash(url);
        return requests[i].digest;
    }  
}