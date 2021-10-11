let filepath = window.location.href;
let filename = filepath.substring(
    filepath.lastIndexOf("/") + 1, 
    filepath.lastIndexOf("@")
);
$('#downloadLink').attr("download", filename);
let cipherbyes = null;

let myRequest = new Request(filepath.replace("@read", ""));

fetch(myRequest)
.then(function(response) {
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.blob();
})
.then(function(blob) {
  let objectURL = URL.createObjectURL(blob);
  $('#downloadLink').attr("href", objectURL); 
  new Response(blob).arrayBuffer()
    .then(bytes => {
      cipherbytes = bytes;
      $(document).on('click', "#decrypt-btn", decryptFile);
      hash(cipherbytes)
        .then(hash => {$("#hash").append(hash);})
        .catch(err => {console.log(err);})
    })
  .catch(err => {console.log(err);})
})
.catch(err => {console.log(err);})

function decryptFile (e){
    e.preventDefault();
    let key = $('#decrypt-file-key').val();
    decryptfile(cipherbytes, key)
    .then(res => {
      $("#decrypt-msg").text("Decryption succeded.");
      $("#decrypt-msg").css( "color", "green" );
      let objectURL = URL.createObjectURL(res);
      $('#downloadLink').attr("href", objectURL);      
    })
    .catch(err => {
      $("#decrypt-msg").text("Decryption failed. Check your key.");
      $("#decrypt-msg").css( "color", "red" );
      console.log(err);
    })
}