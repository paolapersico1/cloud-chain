let filepath = window.location.href;
let filename = filepath.substring(
    filepath.lastIndexOf("/") + 1, 
    filepath.lastIndexOf("@")
);

let myRequest = new Request(filepath.replace("@read", ""));

fetch(myRequest)
.then(function(response) {
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.blob();
})
.then(function(response) {
  decryptfile(response, "esmeralda")
  .then(res => {
    let objectURL = URL.createObjectURL(res);
    $('#downloadLink').attr("href", objectURL);
    $('#downloadLink').attr("download", filename);
  })
  .catch(err => {console.log(err);})
});