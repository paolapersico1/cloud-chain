function fromEnumArrayToStringArray(array){
  let states = ["defaultValue", "uploadRequested", "uploadRequestAck", "uploadTransferAck", "uploaded", 
                "deleteRequested", "deleted", "readRequested", "readRequestAck", "readDeny"];
  return array.map(function (el){return states[el.words[0]];});
}

(function(exports){

  exports.describeFileTx = function(uploadedFile){
   let description = "Hash of filepath: "  + uploadedFile[0] + 
                "\nStates: "   + fromEnumArrayToStringArray(uploadedFile[1]) + 
                //"\nState: "   + uploadedFile[1] + 
                "\nOnCloud: " + uploadedFile[2] + 
                "\nDigests: " + uploadedFile[3] + 
                "\nUrl: "     + uploadedFile[4];

    return description;
  };

}(typeof exports === 'undefined' ? this.utils = {} : exports));