App = {
  web3Provider: null,
  contracts: {},
  account: null,
  web3ContractInstance: null,
  truffleContractInstance : null,

  init: async function() {
    return await App.initWeb3();
  },

  initWeb3: async function() {
    // Modern dapp browsers...
    if (window.ethereum) {
      App.web3Provider = window.ethereum;
      ethereum
        .request({ method: 'eth_requestAccounts' })
        .then((res) => {
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
    web3WebSocket = new Web3(new Web3.providers.WebsocketProvider("ws://localhost:8546"));

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
      App.contracts.CloudSLA.deployed().then(function(instance) {
        truffleContractInstance = instance;
        web3ContractInstance = new web3WebSocket.eth.Contract(
            CloudSLAArtifact.abi,
            truffleContractInstance.address,
        );
        return App.bindEvents();
      }).catch(function(err) {
        console.log(err.message);
      });
    });
  },

  bindEvents: function() {
    $(document).on('click', '#connect', App.initWeb3);
    $(document).one('submit', "form[action='@upload']", App.sendUploadRequest);
  },

  sendUploadRequest: function(e) {
    e.preventDefault();

    const saveas = $("#upload-file-saveas").val();
    var filepath = window.location.pathname + saveas;

    truffleContractInstance.UploadRequest(filepath, {from: App.account})
    .then(function(txReceipt) {
      console.log(txReceipt);

      /*truffleContractInstance.GetFile.call(filepath)
        .then(function (uploadedFile) { 
          console.log(describeFileTx(uploadedFile));
        }).catch(function(err) {
          console.log(err.message);
        });*/
    }).catch(function(err) {
      console.log(err.message);
    });

    /*var event = web3ContractInstance.UploadRequestAcked({},{fromBlock:0},function(error, result){
        // Expect to log when click 'Run accept' button
        console.log("UploadRequestAcked", error, result);
    });*/

    web3ContractInstance.events.UploadRequestAcked({})
      .on('data', async function(evt){
          console.log(evt.returnValues);
          console.log("HERE");
          //$("form[action='@upload']").unbind(); 
          $("form[action='@upload']").submit();
      })
      .on('error', console.error);
  }
};



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