/* jshint esversion: 6 */

const $form = $("form[action='@upload']");
const  $file = $("#upload-file");

$(".upload-unhide").fadeOut();

$file.on("change", () => {
	const file = $file[0].files[0];
	const fnElement = $file.parent().find(".custom-file-label");
	fnElement.addClass("file-selected");
	fnElement.text(file.name);

	$form.find("#upload-file-size").val(filesize(file.size));
	$(".upload-unhide").fadeIn();

    //hash computation
	var SHA256 = CryptoJS.algo.SHA256.create();
    var counter = 0;
    loading(file,
        function (data) {
            var wordBuffer = CryptoJS.lib.WordArray.create(data);
            SHA256.update(wordBuffer);
            counter += data.byteLength;
            //console.log((( counter / file.size)*100).toFixed(0) + '%');
        }, function (data) {
            //console.log('100%');
            var encrypted = SHA256.finalize().toString();
           $form.find("#upload-file-hash").val(encrypted);
        });
});

$form.on("submit", () => {
    //send upload request transaction
});