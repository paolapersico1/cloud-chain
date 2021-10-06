/* jshint esversion: 6 */

const $form = $("form[action='@upload']");
const $file = $("#upload-file");

$(".upload-unhide").fadeOut();

$file.on("change", () => {
	$form.find("#encrypt-msg").empty();
	const file = $file[0].files[0];
	const fnElement = $file.parent().find(".custom-file-label");
	fnElement.addClass("file-selected");
	fnElement.text(file.name);

	$form.find("#upload-file-size").val(filesize(file.size));
	$(".upload-unhide").fadeIn();
    $form.find("#upload-file-saveas").val(file.name);
});