App = {
  web3Provider: null,
  contracts: {},

  init: async function() {
    if (window.ethereum) {
       ethereum
        .request({ method: 'eth_requestAccounts' })
        .then((msg) => {
          console.log("Connected to MetaMask")
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
      console.log('No ethereum wallet');
    }
  },
}
  

$(function() {
  $(window).load(function() {
    App.init();
  });
});
