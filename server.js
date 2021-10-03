#!/usr/bin/env node

/* jshint esversion: 6 */
/* jshint node: true */
"use strict";
const express = require("express");
const hbs = require("express-handlebars");
const bodyparser = require("body-parser");
const session = require("express-session");
const busboy = require("connect-busboy");
const flash = require("connect-flash");
const querystring = require("querystring");

const archiver = require("archiver");

const notp = require("notp");
const base32 = require("thirty-two");

const fs = require("fs");
const rimraf = require("rimraf");
const path = require("path");

const filesize = require("filesize");
const octicons = require("octicons");
const handlebars = require("handlebars");
var dateFormat = require('dateformat');

const Web3 = require('Web3');
const crypto = require('crypto');
const PrivateKeyProvider = require("truffle-hdwallet-provider");
const TruffleContract = require('@truffle/contract');
const truffleConfig = require(path.join(__dirname, "truffle-config.js"));
const CloudSLAArtifact = require(path.join(__dirname, "build", "contracts", "CloudSLA.json"));
const utils = require(path.join(__dirname, "public", "assets", "utils"));

const srcdir =  path.join(__dirname, "public");

let app = express();
let http = app.listen(process.env.PORT || 3001);

app.set("views", path.join(srcdir, "views"));
app.engine("handlebars", hbs({
	partialsDir: path.join(srcdir, "views", "partials"),
	layoutsDir: path.join(srcdir, "views", "layouts"),
	defaultLayout: "main",
	helpers: {
		either: function(a, b, options) {
			if (a || b) {
				return options.fn(this);
			}
		},
		filesize: filesize,
		octicon: function(i, options) {
			if (!octicons[i]) {
				return new handlebars.SafeString(octicons.question.toSVG());
			}
			return new handlebars.SafeString(octicons[i].toSVG());
		},
		eachpath: function (path, options) {
			if (typeof path != "string") {
				return "";
			}
			let out = "";

			path = fixUrl(path, true);
			path = path.split("/");
			path.splice(path.length - 1, 1);
			path.unshift("");
			path.forEach((folder, index) => {
					out += options.fn({
					name: folder + "/",
					path: "/" + path.slice(1, index + 1).join("/"),
					current: index === path.length - 1
				});
			});
			return out;
		},
	}
}));
app.set("view engine", "handlebars");

app.use("/@assets", express.static(path.join(srcdir, "assets")));
app.use("/@assets/bootstrap", express.static(path.join(__dirname, "node_modules/bootstrap/dist")));
app.use("/@assets/octicons", express.static(path.join(__dirname, "node_modules/octicons/build")));
app.use("/@assets/filesize", express.static(path.join(__dirname, "node_modules/filesize/lib")));
app.use("/@assets/xterm", express.static(path.join(__dirname, "node_modules/xterm")));
app.use("/@assets/xterm-addon-attach", express.static(path.join(__dirname, "node_modules/xterm-addon-attach")));
app.use("/@assets/xterm-addon-fit", express.static(path.join(__dirname, "node_modules/xterm-addon-fit")));

app.use(session({
	secret: process.env.SESSION_KEY || "meowmeow",
	resave: false,
	saveUninitialized: false
}));
app.use(flash());
app.use(busboy());
app.use(express.urlencoded({ extended: true }))

//Initialize CloudSLA interaction 
const provider = truffleConfig.networks.quickstartWallet.provider();
const account = provider.getAddress(); // 0xFE3B557E8Fb62b89F4916B721be55cEb828dBd73
console.log("Cloud address: " + account);

var truffleContract = TruffleContract(CloudSLAArtifact);
truffleContract.setProvider(provider);
var truffleContractInstance;
truffleContract.deployed().then(function(instance) {
  truffleContractInstance = instance;

  //event listening in truffle only works with events fired by own account
	//so we have to use web3
	var web3 = new Web3(provider);
	const web3ContractInstance = new web3.eth.Contract(
	    CloudSLAArtifact.abi,
	    truffleContractInstance.address,
	);
	web3ContractInstance.events.UploadRequested({})
    .on('data', async function(event){
        console.log(event.returnValues);
        let file = event.returnValues.filepath;
        
        truffleContractInstance.UploadRequestAck(file, {from: account})
        .then(function(txReceipt) {
        	console.log("--UploadRequestAck--");
		      console.log(txReceipt);

		      /*truffleContractInstance.GetFile.call(file)
		      	.then(function (uploadedFile) { 
			      	console.log(utils.describeFileTx(uploadedFile));
			      }).catch(function(err) {
						  console.log(err.message);
						});*/

		    }).catch(function(err) {
				  console.log(err.message);
				});
    })
	  .on('error', console.error);

	 web3ContractInstance.events.DeleteRequested({})
    .on('data', async function(event){
        console.log(event.returnValues);
        let file = event.returnValues.filepath;
        deleteFile(file);
        
        truffleContractInstance.Delete(file, {from: account})
        .then(function(txReceipt) {
        	console.log("--Delete--");
		      console.log(txReceipt);

		    }).catch(function(err) {
				  console.log(err.message);
				});
    })
	  .on('error', console.error);

	  web3ContractInstance.events.ReadRequested({})
    .on('data', async function(event){
        console.log(event.returnValues);
        let file = event.returnValues.filepath;

        let fileExists = new Promise((resolve, reject) => {
					// check if file exists
					fs.stat(relative(file), (err, stats) => {
						if (err) {
							return reject(err);
						}
						return resolve(stats);
					});
				});

				fileExists.then((stats) => {
					truffleContractInstance.ReadRequestAck(file, file, {from: account})
		        .then(function(txReceipt) {
		        	console.log("--ReadRequestAck--");
				      console.log(txReceipt);
				    }).catch(function(err) {
						  console.log(err.message);
						});
				}).catch((err) => {
					truffleContractInstance.ReadRequestDeny(file, {from: account})
		        .then(function(txReceipt) {
		        	console.log("--ReadRequestDeny--");
				      console.log(txReceipt);
				    }).catch(function(err) {
						  console.log(err.message);
						});
				});
    })
	  .on('error', console.error);

}).catch(function(err) {
  console.log(err.message);
});

// AUTH

const KEY = process.env.KEY ? base32.decode(process.env.KEY.replace(/ /g, "")) : null;

app.get("/@logout", (req, res) => {
	if (KEY) {
		req.session.login = false;
		req.flash("success", "Signed out.");
		res.redirect("/@login");
		return
	}
	req.flash("error", "You were never logged in...");
	res.redirect("back");
});

app.get("/@login", (req, res) => {
	res.render("login", flashify(req, {}));
});
app.post("/@login", (req, res) => {
	let pass = notp.totp.verify(req.body.token.replace(" ", ""), KEY);
	if (pass) {
		req.session.login = true;
		res.redirect("/");
		return;
	}
	req.flash("error", "Bad token.");
	res.redirect("/@login");
});

app.use((req, res, next) => {
	if (!KEY) {
		return next();
	}
	if (req.session.login === true) {
		return next();
	}
	req.flash("error", "Please sign in.");
	res.redirect("/@login");
});

function relative(...paths) {
	return paths.reduce((a, b) => path.join(a, b), process.cwd());
}
function flashify(req, obj) {
	let error = req.flash("error");
	if (error && error.length > 0) {
		if (!obj.errors) {
			obj.errors = [];
		}
		obj.errors.push(error);
	}
	let success = req.flash("success");
	if (success && success.length > 0) {
		if (!obj.successes) {
			obj.successes = [];
		}
		obj.successes.push(success);
	}
	obj.isloginenabled = !!KEY;
	return obj;
}

app.all("/*", (req, res, next) => {
	res.filename = req.params[0];
	//TODO USER
	res.filename = fixUrl(res.filename);

	let fileExists = new Promise((resolve, reject) => {
		// check if file exists
		fs.stat(relative(res.filename), (err, stats) => {
			if (err) {
				return reject(err);
			}
			return resolve(stats);
		});
	});

	fileExists.then((stats) => {
		res.stats = stats;
		next();
	}).catch((err) => {
		res.stats = { error: err };
		next();
	});
});


app.post("/*@upload", (req, res) => {
	res.filename = req.params[0];
	res.filename = fixUrl(res.filename);

	let buff = null;
	let saveas = null;
	req.busboy.on("file", (key, stream, filename) => {
		if (key == "file") {
			let buffs = [];
			stream.on("data", (d) => {
				buffs.push(d);
			});
			stream.on("end", () => {
				buff = Buffer.concat(buffs);
				buffs = null;
			});
		}
	});
	req.busboy.on("field", (key, value) => {
		if (key == "saveas") {
			saveas = value;
		}
	});
	req.busboy.on("finish", () => {
		if (!buff || !saveas) {
			req.flash("error", "File is not valid");
			res.redirect("back");
		}
		else{
			let fileExists = new Promise((resolve, reject) => {
				// check if file exists
				fs.stat(relative(res.filename, saveas), (err, stats) => {
					if (err) {
						return reject(err);
					}
					return resolve(stats);
				});
			});

			fileExists.then((stats) => {
				console.warn("file exists, cannot overwrite");
				req.flash("error", "File exists, cannot overwrite. ");
				res.redirect("back");
			}).catch((err) => {
				const saveName = relative(res.filename, saveas);
				console.log("saving file to " + saveName);
				let save = fs.createWriteStream(saveName);
				save.on("close", () => {
					fileHash(saveName)
						.then(function(hash){
							let url = req.path.slice(1, req.path.indexOf("@upload"));
							let filepath = url + saveas;

							truffleContractInstance.UploadTransferAck(filepath, hash, {from: account})
				        .then(function(txReceipt) {
				        	console.log("--UploadTransferAck--");
						      console.log(txReceipt);
						    }).catch(function(err) {
								  console.log(err.message);
								});
						})
						.catch(function(error){console.log(error);});
					if (res.headersSent) {
						return;
					}
					if (buff.length === 0) {
						req.flash("success", "Upload successful. Warning: empty file.");
						
					}
					else {
						buff = null;
						req.flash("success", "Upload successful.");
					}
					res.redirect("back");
				});
				save.on("error", (err) => {
					console.warn(err);
					req.flash("error", err.toString());
					res.redirect("back");
				});
				save.write(buff);
				save.end();
			});
		}
		
	});
	req.pipe(req.busboy);
});

app.post("/*@mkdir", (req, res) => {
	res.filename = req.params[0];
	res.filename = fixUrl(res.filename);;

	let folder = req.body.folder;
	if (!folder || folder.length < 1) {
		return res.status(400).end();
	}

	let fileExists = new Promise((resolve, reject) => {
		// Check if file exists
		fs.stat(relative(res.filename, folder), (err, stats) => {
			if (err) {
				return reject(err);
			}
			return resolve(stats);
		});
	});

	fileExists.then((stats) => {
		req.flash("error", "Folder exists, cannot overwrite. ");
		res.redirect("back");
	}).catch((err) => {
		fs.mkdir(relative(res.filename, folder), (err) => {
			if (err) {
				console.warn(err);
				req.flash("error", err.toString());
				res.redirect("back");
				return;
			}
			req.flash("success", "Folder created. ");
			res.redirect("back");
		});
	});
});

/*app.post("/*@delete", (req, res) => {
	res.path = req.params[0];

	let files = JSON.parse(req.body.files);
	if (!files || !files.map) {
		req.flash("error", "No files selected.");
		res.redirect("back");
		return; // res.status(400).end();
	}

	let promises = files.map(f => {
		return new Promise((resolve, reject) => {
			fs.stat(relative(res.path, f), (err, stats) => {
				if (err) {
					return reject(err);
				}
				resolve({
					name: f,
					isdirectory: stats.isDirectory(),
					isfile: stats.isFile()
				});
			});
		});
	});
	Promise.all(promises).then((files) => {
		let promises = files.map(f => {
			return new Promise((resolve, reject) => {
				let op = null;
				if (f.isdirectory) {
					op = (dir, cb) => rimraf(dir, {
						glob: false
					}, cb);
				}
				else if (f.isfile) {
					op = fs.unlink;
				}
				if (op) {
					op(relative(res.path, f.name), (err) => {
						if (err) {
							return reject(err);
						}
						resolve();
					});
				}
			});
		});
		Promise.all(promises).then(() => {
			req.flash("success", "Files deleted. ");
			res.redirect("back");
		}).catch((err) => {
			console.warn(err);
			req.flash("error", "Unable to delete some files: " + err);
			res.redirect("back");
		});
	}).catch((err) => {
		console.warn(err);
		req.flash("error", err.toString());
		res.redirect("back");
	});
});*/

function deleteFile(file){
	let promise = new Promise((resolve, reject) => {
			fs.stat(file, (err, stats) => {
				if (err) {
					return reject(err);
				}
				resolve({
					filepath: file,
					isdirectory: stats.isDirectory(),
					isfile: stats.isFile()
				});
			});
		});

	promise.then((f) => {
		let promise = new Promise((resolve, reject) => {
				let op = null;
				if (f.isdirectory) {
					op = (dir, cb) => rimraf(dir, {
						glob: false
					}, cb);
				}
				else if (f.isfile) {
					op = fs.unlink;
				}
				if (op) {
					op(f.filepath, (err) => {
						if (err) {
							return reject(err);
						}
						resolve();
					});
				}
			});

		promise.then(() => {
			//req.flash("success", "Files deleted. ");
		}).catch((err) => {
			console.warn(err);
			//req.flash("error", "Unable to delete some files: " + err);
		});
	}).catch((err) => {
		console.warn(err);
		//req.flash("error", err.toString());
	});
}

/*app.get("/*@download", (req, res) => {
	res.filename = req.params[0];
	res.filename = fixUrl(res.filename);;

	let files = null;
	try {
		files = JSON.parse(req.query.files);
	} catch (e) {}
	if (!files || !files.map) {
		req.flash("error", "No files selected.");
		res.redirect("back");
		return; // res.status(400).end();
	}

	let promises = files.map(f => {
		return new Promise((resolve, reject) => {
			fs.stat(relative(res.filename, f), (err, stats) => {
				if (err) {
					return reject(err);
				}
				resolve({
					name: f,
					isdirectory: stats.isDirectory(),
					isfile: stats.isFile()
				});
			});
		});
	});
	Promise.all(promises).then((files) => {
		let zip = archiver("zip", {});
		zip.on("error", function(err) {
			console.warn(err);
			res.status(500).send({
				error: err.message
			});
		});

		files.filter(f => f.isfile).forEach((f) => {
			zip.file(relative(res.filename, f.name), { name: f.name });
		});
		files.filter(f => f.isdirectory).forEach((f) => {
			zip.directory(relative(res.filename, f.name), f.name);
		});

		res.attachment("Archive.zip");
		zip.pipe(res);

		zip.finalize();
	}).catch((err) => {
		console.warn(err);
		req.flash("error", err.toString());
		res.redirect("back");
	});
});*/

const shellable = process.env.SHELL != "false" && process.env.SHELL;
const cmdable = process.env.CMD != "false" && process.env.CMD;
if (shellable || cmdable) {
	const shellArgs = process.env.SHELL.split(" ");
	const exec = process.env.SHELL == "login" ? "/usr/bin/env" : shellArgs[0];
	const args = process.env.SHELL == "login" ? ["login"] : shellArgs.slice(1);

	const child_process = require("child_process");

	app.post("/*@cmd", (req, res) => {
		res.filename = req.params[0];

		let cmd = req.body.cmd;
		if (!cmd || cmd.length < 1) {
			return res.status(400).end();
		}
		console.log("running command " + cmd);

		child_process.exec(cmd, {
			cwd: relative(res.filename),
			timeout: 60 * 1000,
		}, (err, stdout, stderr) => {
			if (err) {
				console.log("command run failed: " + JSON.stringify(err));
				req.flash("error", "Command failed due to non-zero exit code");
			}
			res.render("cmd", flashify(req, {
				path: res.filename,
				cmd: cmd,
				stdout: stdout,
				stderr: stderr,
			}));
		});
	});

	const pty = require("node-pty");
	const WebSocket = require("ws");

	app.get("/*@shell", (req, res) => {
		res.filename = req.params[0];

		res.render("shell", flashify(req, {
			path: res.filename,
		}));
	});

	const ws = new WebSocket.Server({ server: http });
	ws.on("connection", (socket, request) => {
		const { path } = querystring.parse(request.url.split("?")[1]);
		let cwd = relative(path);
		let term = pty.spawn(exec, args, {
			name: "xterm-256color",
			cols: 80,
			rows: 30,
			cwd: cwd,
		});
		console.log("pid " + term.pid + " shell " + process.env.SHELL + " started in " + cwd);

		term.on("data", (data) => {
			socket.send(data, { binary: true });
		});
		term.on("exit", (code) => {
			console.log("pid " + term.pid + " ended")
			socket.close();
		});
		socket.on("message", (data) => {
			// special messages should decode to Buffers
			if (Buffer.isBuffer(data)) {
				switch (data.readUInt16BE(0)) {
				case 0:
					term.resize(data.readUInt16BE(1), data.readUInt16BE(2));
					return;
				}
			}
			term.write(data);
		});
		socket.on("close", () => {
			term.end();
		});
	});
}

const SMALL_IMAGE_MAX_SIZE = 750 * 1024;  // 750 KB
const EXT_IMAGES = [".jpg", ".jpeg", ".png", ".webp", ".svg", ".gif", ".tiff"];
function isimage(f) {
	for (const ext of EXT_IMAGES) {
		if (f.endsWith(ext)) {
			return true;
		}
	}
	return false;
}

function fileHash(filepath, algorithm = 'sha256') {
  return new Promise((resolve, reject) => {
    // Algorithm depends on availability of OpenSSL on platform
    // Another algorithms: 'sha1', 'md5', 'sha256', 'sha512' ...
    if(fs.lstatSync(filepath).isDirectory()){
    	return resolve('-');
    }else{
    	let shasum = crypto.createHash(algorithm);
	    try {
	      let s = fs.ReadStream(filepath)
	      s.on('data', function (data) {
	        shasum.update(data)
	      })
	      // making digest
	      s.on('end', function () {
	        const hash = shasum.digest('hex')
	        return resolve("0x" + hash);
	      })
	    } catch (error) {
	      return reject('calc fail');
	    }
    }
  });
}

function fixUrl(url, inverseOrder = false){
	let userId = 1;
	if(inverseOrder)
		return url.replace("storage/user" + userId, "mycloud");
	else
		return  url.replace("mycloud", "storage/user" + userId);
}

app.get("/", (req, res) => {
	res.redirect("/mycloud");
})

app.get("/*", (req, res) => { 
	if (res.stats.error) {
		res.render("list", flashify(req, {
			shellable: shellable,
			cmdable: cmdable,
			path: res.filename,
			errors: [
				res.stats.error
			]
		}));
	}
	else if (res.stats.isDirectory()) {
		if (!req.url.endsWith("/")) {
			return res.redirect(req.url + "/");
		}

		let readDir = new Promise((resolve, reject) => {
			fs.readdir(relative(res.filename), (err, filenames) => {
				if (err) {
					return reject(err);
				}
				return resolve(filenames);
			});
		});

		readDir.then((filenames) => {
			const promises = filenames.map(f => fileHash(relative(res.filename, f)).then((hash) => { 
				return new Promise((resolve, reject) => {
					fs.stat(relative(res.filename, f), (err, stats) => {
						if (err) {
							console.warn(err);
							return resolve({
								name: f,
								error: err
							});
						}
						resolve({
							name: f,
							isdirectory: stats.isDirectory(),
							size: stats.size,
							dateadded: dateFormat(stats.birthtime, "yyyy-mm-dd h:MM:ss"),
							digest : hash
						});
					});
				});
			}));

			Promise.all(promises).then((files) => {
				res.render("list", flashify(req, {
					shellable: shellable,
					cmdable: cmdable,
					path: res.filename,
					files: files,
				}));
			}).catch((err) => {
				console.error(err);
				res.render("list", flashify(req, {
					shellable: shellable,
					cmdable: cmdable,
					path: res.filename,
					errors: [
						err
					]
				}));
			});
		}).catch((err) => {
			console.warn(err);
			res.render("list", flashify(req, {
				shellable: shellable,
				cmdable: cmdable,
				path: res.filename,
				errors: [
					err
				]
			}));
		});
	}
	else if (res.stats.isFile()) {
		res.sendFile(relative(res.filename), {
			headers: {
				"Content-Security-Policy": "default-src 'self'; script-src 'none'; sandbox"
			},
			dotfiles: "allow"
		});
	}
});

