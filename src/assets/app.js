function connect() {
  if (window.ethereum) {
     ethereum
      .request({ method: 'eth_requestAccounts' })
      .then((account) => {
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
  else{
    console.log('Please install MetaMask.');
  }
}

ethereum.on('accountsChanged', (accounts) => {
  // Handle the new accounts, or lack thereof.
  // "accounts" will always be an array, but it can be empty.
  sessionStorage.setItem("accounts", accounts);
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
    if(sessionStorage.getItem("accounts")){
      $('#account').append(sessionStorage.getItem("accounts"));
    }
  });

  $( "#connect" ).on( "click", function() {
    connect();
  });
});
