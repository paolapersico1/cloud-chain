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
      $('#account').append("<b>Account:</b> " + App.account);
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

        truffleContractInstance.GetSLAInfo.call()
        .then(function (res) { 
          //if it was not paid
          if(!res[0]){
            localStorage.setItem('warning_msg_local', "Please activate your smart contract.");
            updateAlerts();
          //if it is paid and the validity period has ended
          }else if(Date.now() > new Date(res[2]*1000)){
            localStorage.setItem('warning_msg_local', "Please request smart contract termination.");
            updateAlerts();
            //end sla in place of cloud
            truffleContractInstance.EndSla({from: App.account})
              .then(function(txReceipt) {
                console.log("--SLA ended--");
                //console.log(txReceipt);
              }).catch(function(err) {
                console.log(err.message);
              });
          }else{
            $('#credits').empty();
            $('#credits').append("Credits: " + res[3]); 
            $('#endDate').empty();
            $('#endDate').append("Valid until: " + new Date(res[2]*1000).toLocaleString('en-GB')); 
          }
        }).catch(function(err) {
          console.log(err.message);
        });

        $.getJSON('http://localhost:3001/build/contracts/FileDigestOracle.json', function(data) {
          var FileDigestOracleArtifact = data;
          web3OracleContractInstance = new web3WebSocket.eth.Contract(
            FileDigestOracleArtifact.abi,
            "0x9e699d6c7ccf183F0B09675A9E867d1486EEF85b",
          );
          return App.listenEvents();
        });
      }).catch(function(err) {
        console.log(err.message);
      });
    });
  },

  listenEvents: function() {
    web3ContractInstance.events.Paid({})
      .on('data', async function(evt){
        localStorage.removeItem('warning_msg_local');
        updateAlerts();
        $('#credits').empty();
        $('#credits').append("<b>Credits:</b> 0 wei"); 
        $('#endDate').empty();
        $('#endDate').append("<b>Valid until:</b> " + new Date(evt.returnValues.endTime*1000).toLocaleString('en-GB'));
      })
      .on('error', console.error);

    web3ContractInstance.events.CompensatedUser({})
      .on('data', async function(evt){
        let value = evt.returnValues.value;

        localStorage.setItem('warning_msg_local', "Your account was compensated " + value + " wei for SLA violations.");
        updateAlerts();

        App.updateCredits();
      })
      .on('error', console.error);

    web3ContractInstance.events.UploadRequestAcked({})
      .on('data', async function(evt){
          console.log("--Upload Request Ack Received--");
          $("form[action='@upload']").submit();
      })
      .on('error', console.error);

    web3ContractInstance.events.UploadTransferAcked({})
      .on('data', async function(evt){
          console.log("--Upload Transfer Ack Received--");
          let cloudDigest = evt.returnValues.digest;
          let file = evt.returnValues.filepath;

          let confirmUploadMsg = "Uploaded file: '<span id='uploaded-filepath'>" + file.replace("mycloud/", "") + 
                                                          "</span>', digest: " + cloudDigest;
          confirmUploadMsg = confirmUploadMsg + "<br>Accept upload? ";
          confirmUploadMsg = confirmUploadMsg + "<button class='upload-confirm' id='yes'>Yes</button>" +
                                     "<button class='upload-confirm' id='no'>No</button>";

          localStorage.setItem('success_msg_local', confirmUploadMsg);
          updateAlerts();
      })
      .on('error', console.error);

      web3ContractInstance.events.Deleted({})
      .on('data', async function(evt){
          console.log("--Deleted--");
          window.location.reload();
      })
      .on('error', console.error);

      web3ContractInstance.events.ReadRequestAcked({})
      .on('data', async function(evt){
          console.log("--Read Request Ack Received--");
          let url = evt.returnValues.url;
          //go to decryption page instead of reading the file directly
          window.location.href = url + "@read";
      })
      .on('error', console.error);

      web3ContractInstance.events.ReadRequestDenied({})
      .on('data', async function(evt){
          console.log("--Read Request Denial Received--");
          let file = evt.returnValues.filepath;
          let lostFile = evt.returnValues.lostFile;
          if(lostFile){
            localStorage.setItem('warning_msg_local', "'" + file.replace("mycloud/", "") + "' has been lost.");
            updateAlerts();
            App.updateCredits();
          }else{
            localStorage.setItem('warning_msg_local', "Client previously requested '" + file.replace("mycloud/", "") + "' deletion");
            updateAlerts();
          }
      })
      .on('error', console.error);

      web3ContractInstance.events.FileChecked({})
      .on('data', async function(evt){
          console.log("--File Check Result Received--");
          let msg = evt.returnValues.msg;
          let filepath = evt.returnValues.filepath;
          localStorage.setItem('warning_msg_local', msg);
          updateAlerts();
          App.updateCredits();
          $("#filecheck").attr('disabled', false);
      })
      .on('error', console.error);

      web3OracleContractInstance.events.DigestComputed({})
      .on('data', async function(evt){
          console.log("--Digest Computed Received--");
          let filepath = getPath(evt.returnValues.url);

          truffleContractInstance.FileCheck(filepath, {from: App.account})
          .then(function(txReceipt) {
            console.log("--CorruptedFileCheck--");
            console.log(txReceipt);
          }).catch(function(err) {
            console.log(err.message);
            localStorage.setItem('warning_msg_local', "Transaction failed.");
            updateAlerts();
          });
      })
      .on('error', console.error);

    return App.bindEvents();
  },

  bindEvents: function() {
    $(document).on('click', '#connect', App.initWeb3);
    $(document).on('click', '#activate', App.activate);
    $(document).on('submit', "form[action='@search']", App.search);
    $(document).on('click', '.filename', App.sendReadRequest);
    $(document).on('click', '.upload-confirm', App.sendUploadConfirm);
    $(document).on('click', "#encrypt-btn", App.encryptFile);
    $(document).on('click', "#filecheck", App.fileCheck);
    $(document).one('submit', "form[action='@upload']", App.sendUploadRequest);
    $(document).one('submit', "form[action='@delete']", App.sendDeleteRequest);
    $(document).one('submit', "form[action='@check']", App.sendReadRequest);
  },

  updateCredits: function(){
    truffleContractInstance.GetSLAInfo.call()
      .then(function (res) { 
        $('#credits').empty();
        $('#credits').append("<b>Credits:</b> " + res[3] + " wei"); 
      }).catch(function(err) {
        console.log(err.message);
      });
  },

  search: function(e){
    e.preventDefault();
    var searchKey = $("#searchKey").val();
    $(".listitem").each(function() {
      if (!$(this).text().includes(searchKey))
        $(this).parent().parent().parent().parent().remove();
    })
    if($('.listitem').length == 0){
      $(".list-group-item").replaceWith("<li class='list-group-item'>No matching files</li>");
    }
  },

  activate: function(e) {
    e.preventDefault();

    truffleContractInstance.Deposit({from: App.account, value: web3.utils.toWei("5", "ether")})
    .then(function(txReceipt) {
      console.log("--SC Activated--");
      //console.log(txReceipt);
    }).catch(function(err) {
      console.log(err.message);
      localStorage.setItem('warning_msg_local', "Transaction failed.");
      updateAlerts();
    });
  },

  fileCheck: function(e) {
    e.preventDefault();
    $("#filecheck").attr('disabled', true);

    let filepath = getPath(readUrl=decodeURI(window.location.href));

    //console.log(filepath);
    truffleContractInstance.FileHashRequest(filepath, {from: App.account})
    .then(function(txReceipt) {
      console.log("--File Hash Request--");
      console.log(txReceipt);
    }).catch(function(err) {
      $(document).on('click', "#filecheck", App.fileCheck);
      console.log(err.message);
      localStorage.setItem('warning_msg_local', "Transaction failed.");
      updateAlerts();
    });
  },

  sendReadRequest: function(e) {
    e.preventDefault();

    if(e.type == "submit"){
      $("#check-btn").attr('disabled', true);
      var filename = $("#check-filename").val();
    }else{
      var filename = e.target.text;
    }

    let filepath = getPath() + filename;

    truffleContractInstance.ReadRequest(filepath, {from: App.account})
    .then(function(txReceipt) {
      console.log("--ReadRequest--");
      console.log(txReceipt);
    }).catch(function(err) {
      $(document).one('submit', "form[action='@check']", App.sendReadRequest);
      $("#check-btn").attr('disabled', false);
      console.log(err.message);
      localStorage.setItem('warning_msg_local', "Transaction failed.");
      updateAlerts();
    });
  },

  encryptFile: function(e){
    e.preventDefault();

    const enckey = $("#upload-file-key").val();
    if(enckey.length >= 8){
      const file =  $("#upload-file")[0].files[0];
      encryptfile(file, enckey)
      .then(res => {
        console.log(res);
        let file = res[0];
        let hash = res[1];

        // Create a DataTransfer instance and add a newly created file
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);

        // Assign the DataTransfer files list to the file input
        $("#upload-file")[0].files = dataTransfer.files;
        $("#upload-file-hash").val();
        $form.find("#encrypt-msg").text("File encrypted. Hash: 0x" + hash);
        $form.find("#encrypt-msg").css( "color", "green" );

        $("#upload-btn").attr('disabled', false);
      })
      .catch(err => {
          console.log(err);
          $form.find("#encrypt-msg").text("Encryption failed.");
          $form.find("#encrypt-msg").css( "color", "red" );
        });
      }
    else{
      $form.find("#encrypt-msg").text("Key must be at least 8 characters long.");
      $form.find("#encrypt-msg").css( "color", "red" );
    }
  },

  sendUploadRequest: function(e) {
    e.preventDefault();

    $("#upload-btn").attr('disabled', true);

    const saveas = $("#upload-file-saveas").val();
    var filepath = getPath() + saveas;

    truffleContractInstance.UploadRequest(filepath, {from: App.account})
    .then(function(txReceipt) {
      console.log("--UploadRequest--");
      console.log(txReceipt);
    }).catch(function(err) {
      $(document).one('submit', "form[action='@upload']", App.sendUploadRequest);
      $("#upload-btn").attr('disabled', false);
      console.log(err.message);
      localStorage.setItem('warning_msg_local', "Transaction failed.");
      updateAlerts();
    });
  },

  sendDeleteRequest: function(e) {
    e.preventDefault();

    $("#delete-btn").attr('disabled', true);

    var filesToDelete = $(".multi-files-value").val();
    filesToDelete = filesToDelete.replace(/'/g, '"');
    filesToDelete = JSON.parse(filesToDelete);

    filesToDelete.forEach(function deleteRequest(filename){
      var filepath = getPath() + filename;

      truffleContractInstance.DeleteRequest(filepath, {from: App.account})
      .then(function(txReceipt) {
        console.log("--DeleteRequest--");
        console.log(txReceipt);
      }).catch(function(err) {
        $(document).one('submit', "form[action='@delete']", App.sendDeleteRequest);
        $("#delete-btn").attr('disabled', false);
        console.log(err.message);
        localStorage.setItem('warning_msg_local', "Transaction failed.");
        updateAlerts();
      });
    });
  },

  sendUploadConfirm: function(e){
    let file = "mycloud/" + $("#uploaded-filepath").text();

    var idClicked = e.target.id;
    let ack = null;
    if(idClicked === "yes"){
      ack = true;
    }else if (idClicked === "no"){
      ack = false;
    }
    
    truffleContractInstance.UploadConfirm(file, ack, {from: App.account})
      .then(function(txReceipt) {
        console.log("--UploadConfirm--");
        console.log(txReceipt);

        window.localStorage.clear();
        updateAlerts();

        /*truffleContractInstance.GetFile.call(file)
        .then(function (uploadedFile) { 
          console.log(utils.describeFileTx(uploadedFile));
        }).catch(function(err) {
          console.log(err.message);
        });*/

      }).catch(function(err) {
        console.log(err.message);
        localStorage.setItem('warning_msg_local', "Transaction failed.");
        updateAlerts();
      })
  }
};

function getPath(readUrl=null){
  let pattern = "mycloud/";
  let path = null;

  if(readUrl){
    readUrl = readUrl.replace("@read", "");
    let regex = /user[\w]*\/(.*)/g;
    path = regex.exec(readUrl)[1];
  }else{
    let decodedUrl = decodeURI(window.location.href);
    path = decodedUrl.slice(decodedUrl.indexOf(pattern) + pattern.length);
  }

  return pattern + path;
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

function updateAlerts(){
  if (localStorage.getItem("success_msg_local") != null) {
      $("#successDiv").empty().append(localStorage.getItem("success_msg_local"));
      $("#successDiv").css('display', 'inline-block');
  }
  else{
      $("#successDiv").css('display', 'none');
  }

  if (localStorage.getItem("error_msg_local") != null) {
      $("#errorDiv").empty().append(localStorage.getItem("error_msg_local"));
      $("#errorDiv").css('display', 'inline-block');
  }else{
      $("#errorDiv").css('display', 'none');
  }

  if (localStorage.getItem("warning_msg_local") != null) {
      $("#warnDiv").empty().append(localStorage.getItem("warning_msg_local"));
      $("#warnDiv").css('display', 'inline-block');
      localStorage.removeItem("warning_msg_local");
  }else{
      $("#warnDiv").css('display', 'none');
  }
}

$(function() {
  $(window).load(function() {
    updateAlerts();
    App.init();
  });
});