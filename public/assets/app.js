App = {
  web3Provider: null,
  contracts: {},
  account: null,

  init: async function() {
    return await App.initWeb3();
  },

  initWeb3: async function() {
    // Modern dapp browsers...
    if (window.ethereum) {
      App.web3Provider = window.ethereum;
      ethereum
        .request({ method: 'eth_requestAccounts' })
        .then((accounts) => {
          console.log("Connected to MetaMask.");
        })
        .catch((error) => {
          if (error.code === 4001) {
            // EIP-1193 userRejectedRequest error
            console.log('Please connect to MetaMask.');
          } else {
            console.error(error);
          }
        });
    }
    // Legacy dapp browsers...
    else if (window.web3) {
      App.web3Provider = window.web3.currentProvider;
    }
    // If no injected web3 instance is detected, fall back to http provider (like Ganache)
    else {
      App.web3Provider = new Web3.providers.HttpProvider('http://localhost:8545');
    }
    web3 = new Web3(App.web3Provider);

    web3.eth.getAccounts(function(error, accounts) {
      if (error) {
        console.log(error);
      }
      App.account = accounts[0];
      $('#account').empty();
      $('#account').append(App.account);
    });

    return App.initContract();
  },

  initContract: function() {
    $.getJSON('/build/contracts/CloudSLA.json', function(data) {
      // Get the necessary contract artifact file and instantiate it with @truffle/contract
      var CloudSLAArtifact = data;
      App.contracts.CloudSLA = TruffleContract(CloudSLAArtifact);
      // Set the provider for our contract
      App.contracts.CloudSLA.setProvider(App.web3Provider);
    });

    return App.bindEvents();
  },

  bindEvents: function() {
    $(document).on('click', '#connect', App.initWeb3);
    $(document).on('submit', "form[action='@upload']", App.sendUploadRequest);
  },

  sendUploadRequest: function(event) {
    event.preventDefault();

    const file = $("#upload-file")[0].files[0];
    var filepath = window.location.pathname + file.name;

    var cloudslaInstance;

    App.contracts.CloudSLA.deployed().then(function(instance) {
      cloudslaInstance = instance;
      return cloudslaInstance.UploadRequest(filepath, {from: App.account});
    }).then(function(result) {
      console.log(result);
      cloudslaInstance.GetFile.call(filepath).
      then(function (uploadedFile) { 
      console.log(describeFile(uploadedFile))});
    }).catch(function(err) {
      console.log(err.message);
    });
  }

};

function describeFile(uploadedFile){
  let description = "Filename: "  + uploadedFile[0] + 
                    "\nState: "   + fromEnumArrayToStringArray(uploadedFile[1][0]['c']) + 
                    "\nOnCloud: " + uploadedFile[2] + 
                    "\nDigests: " + uploadedFile[3] + 
                    "\nUrl: "     + uploadedFile[4];

  return description;
}

function fromEnumArrayToStringArray(array){
  let states = ["defaultValue", "uploadRequested", "uploadRequestAck", "uploadTransferAck", "uploaded", 
                "deleteRequested", "deleted", "readRequested", "readRequestAck", "readDeny"]
  return array.map(function (el){return states[el];});
}

ethereum.on('accountsChanged', (accounts) => {
  // Handle the new accounts, or lack thereof.
  // "accounts" will always be an array, but it can be empty.
  window.location.reload();
});

ethereum.on('chainChanged', (chainId) => {
  // Handle the new chain.
  // Correctly handling chain changes can be complicated.
  // We recommend reloading the page unless you have good reason not to.
  window.location.reload();
});

$(function() {
  $(window).load(function() {
    App.init();
  });
});